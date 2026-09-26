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

# --- dev server pre-termination guard (THIS worktree's server only) ---
# A live dev server (`wrangler pages dev` -> spawns workerd) holds a lock on the worktree's
# .wrangler. Stopping workerd alone is futile: the wrangler PARENT instantly respawns it.
# So kill the wrangler parent FIRST, then its workerd children.
#
# OWNERSHIP (2026-09-26 incident): this guard used to kill EVERY `wrangler pages dev` +
# EVERY workerd on the machine. Ending one session killed another live session's server
# (plate-workorder). Now we only stop processes whose command line contains THIS worktree's
# path, plus their descendants. A server we cannot attribute is left running - if it really
# was ours and still holds the junction, the unlink below fails loudly and the SAFETY check
# refuses `worktree remove` (no data loss); close it manually and retry.
$all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
$wtNorm = $wtPath.ToLower().Replace('/', '\')
$roots = @($all | Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Replace('/', '\').Contains($wtNorm) -and $_.CommandLine -match 'wrangler' })
# Descendants by ParentProcessId — but Windows REUSES PIDs: a process whose real parent died long ago
# can point at a PID that now belongs to one of OUR processes, and would be swept up as our "child"
# (2026-09-26: suspected cause of another session's :3000 server disappearing). A real child is
# always created AFTER its parent, so require child.CreationDate >= parent.CreationDate.
$owned = New-Object System.Collections.Generic.HashSet[int]
$born = @{}
foreach ($p in $all) { $born[[int]$p.ProcessId] = $p.CreationDate }
foreach ($r in $roots) { [void]$owned.Add([int]$r.ProcessId) }
do {
  $grew = $false
  foreach ($p in $all) {
    $pp = [int]$p.ParentProcessId
    if (-not $owned.Contains([int]$p.ProcessId) -and $owned.Contains($pp) -and $p.CreationDate -ge $born[$pp]) { [void]$owned.Add([int]$p.ProcessId); $grew = $true }
  }
} while ($grew)
$others = @($all | Where-Object { -not $owned.Contains([int]$_.ProcessId) -and (($_.Name -eq 'workerd.exe') -or ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'wrangler' -and $_.CommandLine -match 'pages\s+dev')) })
if ($others.Count -gt 0) {
  Write-Host "  other dev server(s) left running (not this worktree's): pid $(($others | ForEach-Object { $_.ProcessId }) -join ', ')" -ForegroundColor DarkGray
}
if ($owned.Count -gt 0) {
  Write-Warning "this worktree's dev server is running - stopping it first (wrangler parent BEFORE workerd, else it respawns)"
  # parents first (roots), then everything else we own
  foreach ($id in @($roots | ForEach-Object { [int]$_.ProcessId }) + @($owned)) {
    try { Stop-Process -Id $id -Force -ErrorAction Stop; Write-Host "  stopped pid $id" -ForegroundColor DarkGray } catch {}
  }
  Start-Sleep -Milliseconds 500
  $left = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $owned.Contains([int]$_.ProcessId) })
  if ($left.Count -gt 0) { throw "could not stop this worktree's dev server (pid $(($left | ForEach-Object { $_.ProcessId }) -join ', ')) - close it manually and retry" }
  Write-Host "  this worktree's dev server stopped" -ForegroundColor DarkGray
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
