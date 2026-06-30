#requires -Version 5.1
<#
.SYNOPSIS
  Remove a session worktree created by new-session.ps1 (junction-safe).
.DESCRIPTION
  WARNING: unlink junctions (node_modules/.wrangler) with rmdir FIRST, then remove the worktree.
           Deleting the worktree folder directly can follow a junction and wipe the main
           node_modules - never do that.
  Aborts if tracked files have uncommitted changes (prevents work loss).
.EXAMPLE
  .\scripts\end-session.ps1 cashflow
  .\scripts\end-session.ps1 cashflow -DeleteBranch
#>
param(
  [Parameter(Mandatory = $true, Position = 0)][string]$Name,
  [switch]$DeleteBranch
)
$ErrorActionPreference = "Stop"

$root   = Split-Path -Parent $PSScriptRoot
$parent = Split-Path -Parent $root
$wtPath = Join-Path (Join-Path $parent "dongsan_mes-worktrees") $Name
$branch = "session/$Name"

if (-not (Test-Path $wtPath)) { throw "no such worktree: $wtPath" }

# abort if tracked files have uncommitted changes
$dirty = git -C "$wtPath" status --porcelain --untracked-files=no
if ($dirty) { Write-Error "uncommitted changes present - commit/discard first:`n$dirty"; exit 1 }

# --- dev server pre-termination guard ---
# A live dev server (npm run dev:d1 = `wrangler pages dev` -> spawns workerd) holds a
# lock on the worktree's .wrangler. Stopping workerd alone is futile: the wrangler
# PARENT instantly respawns it and recreates a REAL .wrangler dir (not a junction),
# so the rmdir below silently fails (yet would print "unlinked") and `git worktree
# remove` aborts with "Directory not empty". So kill the wrangler parent FIRST, then
# workerd, then wait for the port to free. (Single dev port 3000 invariant -> only one
# dev server runs at a time, so this targets the right one.)
$devNode = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -match 'wrangler' -and $_.CommandLine -match 'pages\s+dev' })
if ($devNode -or (Get-Process workerd -ErrorAction SilentlyContinue)) {
  Write-Warning "dev server is running - stopping it first (wrangler parent BEFORE workerd, else it respawns)"
  foreach ($p in $devNode) {
    try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Host "  stopped wrangler (pid $($p.ProcessId))" -ForegroundColor DarkGray } catch {}
  }
  $busy = $true
  for ($i = 0; $i -lt 12; $i++) {
    Get-Process workerd -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    $sock = New-Object System.Net.Sockets.TcpClient
    try { $sock.Connect('127.0.0.1', 3000); $busy = $sock.Connected } catch { $busy = $false } finally { $sock.Dispose() }
    if (-not $busy) { break }
    Start-Sleep -Milliseconds 250
  }
  if ($busy) { throw "port 3000 still busy after stopping dev server - aborting (a real .wrangler may have been recreated; close the dev server manually and retry)" }
  Write-Host "  dev server stopped (port 3000 free)" -ForegroundColor DarkGray
}

# unlink junctions safely (removes the LINK only, keeps the target). Report success
# only if the link is actually gone - a silent rmdir failure (lock) must NOT print
# "unlinked" (that misreport is exactly what masked the dev-respawn bug).
foreach ($l in @("node_modules", ".wrangler")) {
  $dst = Join-Path $wtPath $l
  if (Test-Path $dst) {
    cmd /c rmdir "$dst" 2>$null
    if (Test-Path $dst) { Write-Warning "  FAILED to unlink $l (locked?) -> $dst" }
    else { Write-Host "  unlinked $l" -ForegroundColor DarkGray }
  }
}
foreach ($l in @(".dev.vars")) {
  $dst = Join-Path $wtPath $l
  if (Test-Path $dst) { Remove-Item "$dst" -Force }   # hard link removal (keeps original)
}

# SAFETY: never let `git worktree remove --force` run while a junction (reparse point)
# still lives at the worktree root - --force can FOLLOW the junction and wipe the MAIN
# node_modules / local D1 (.wrangler). Top-level check only (our junctions are all at
# the root; -Recurse would itself follow a surviving junction into the main tree).
$reparse = @(Get-ChildItem -Path $wtPath -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Attributes -match 'ReparsePoint' })
if ($reparse) {
  Write-Error ("ABORT: reparse point(s) still present - removing now could wipe the MAIN checkout. Unlink manually, then retry:`n  " + ($reparse.FullName -join "`n  "))
  exit 1
}

# native git: drop to Continue so progress-on-stderr is not promoted to a terminating
# error in PS 5.1; gate on $LASTEXITCODE for the real outcome.
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
git -C $root worktree remove --force "$wtPath"   # only leftover untracked (dist etc.); tracked changes already blocked
$rmExit = $LASTEXITCODE
git -C $root worktree prune
$ErrorActionPreference = $prevEAP
if ($rmExit -ne 0) { throw "worktree remove failed (exit $rmExit) - $wtPath still present (dev lock? real .wrangler recreated?)" }
if ($DeleteBranch) { git -C $root branch -D $branch }
Write-Host "[end-session] removed $wtPath" -ForegroundColor Green
