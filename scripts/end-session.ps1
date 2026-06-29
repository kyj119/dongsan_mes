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

# unlink junctions safely (removes the link only, keeps the target)
foreach ($l in @("node_modules", ".wrangler")) {
  $dst = Join-Path $wtPath $l
  if (Test-Path $dst) { cmd /c rmdir "$dst" 2>$null; Write-Host "  unlinked $l" -ForegroundColor DarkGray }
}
foreach ($l in @(".dev.vars")) {
  $dst = Join-Path $wtPath $l
  if (Test-Path $dst) { Remove-Item "$dst" -Force }   # hard link removal (keeps original)
}

git -C $root worktree remove --force "$wtPath"   # only leftover untracked (dist etc.); tracked changes already blocked
git -C $root worktree prune
if ($DeleteBranch) { git -C $root branch -D $branch }
Write-Host "[end-session] removed $wtPath" -ForegroundColor Green
