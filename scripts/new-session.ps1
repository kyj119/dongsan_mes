#requires -Version 5.1
<#
.SYNOPSIS
  Create an isolated git worktree + branch for a concurrent work session.
.DESCRIPTION
  1-machine implementation of the real-team model "own clone + feature branch":
    - separate folder + separate branch  -> working tree isolation
      (another session's uncommitted WIP can't leak into my build/deploy)
    - node_modules / .dev.vars / .wrangler are junctioned from the main checkout
      (no reinstall / no copy)
    - dist is NOT linked -> each worktree builds its own dist (isolated deploy)
  Base defaults to origin/main (the integration point), like branching from latest main.
.EXAMPLE
  .\scripts\new-session.ps1 cashflow
  .\scripts\new-session.ps1 ink-ui main
.NOTES
  Always remove with end-session.ps1 (junction-safe). Never rm -rf the folder directly.
#>
param(
  [Parameter(Mandatory = $true, Position = 0)][string]$Name,
  [Parameter(Position = 1)][string]$Base = "origin/main"
)
$ErrorActionPreference = "Stop"

$root   = Split-Path -Parent $PSScriptRoot           # repo root (this script = root\scripts)
$parent = Split-Path -Parent $root
$wtRoot = Join-Path $parent "dongsan_mes-worktrees"
$wtPath = Join-Path $wtRoot $Name
$branch = "session/$Name"

if (Test-Path $wtPath) { throw "worktree already exists: $wtPath" }

Write-Host "[new-session] git fetch origin ..." -ForegroundColor Cyan
try { git -C $root fetch origin --quiet } catch { Write-Warning "fetch failed (offline?) - using local refs" }

# validate base; fall back to main
git -C $root rev-parse --verify --quiet "$Base" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning "base '$Base' not found -> using 'main'"; $Base = "main" }

New-Item -ItemType Directory -Force -Path $wtRoot | Out-Null
Write-Host "[new-session] worktree add  $wtPath  (branch $branch  base $Base)" -ForegroundColor Cyan
git -C $root worktree add -b $branch "$wtPath" "$Base"
if ($LASTEXITCODE -ne 0) { throw "worktree add failed" }

# junction shared state (all gitignored: build / runtime / secrets)
foreach ($l in @("node_modules", ".wrangler")) {
  $src = Join-Path $root $l; $dst = Join-Path $wtPath $l
  if (Test-Path $src) {
    if (Test-Path $dst) { cmd /c rmdir "$dst" 2>$null }
    cmd /c mklink /J "$dst" "$src" | Out-Null
    Write-Host "  /J  $l" -ForegroundColor DarkGray
  }
}
foreach ($l in @(".dev.vars")) {
  $src = Join-Path $root $l; $dst = Join-Path $wtPath $l
  if (Test-Path $src) {
    if (Test-Path $dst) { Remove-Item "$dst" -Force }
    cmd /c mklink /H "$dst" "$src" | Out-Null   # file = hard link (stays in sync)
    Write-Host "  /H  $l" -ForegroundColor DarkGray
  }
}

Write-Host ""
Write-Host "[new-session] ready" -ForegroundColor Green
Write-Host "  open:    code `"$wtPath`"      # open a new VS Code / Claude session here"
Write-Host "  merge:   git push origin ${branch}:main   # if rejected: git pull --rebase origin main, retry"
Write-Host "  remove:  .\scripts\end-session.ps1 $Name"
Write-Host ""
Write-Host "  NOTE: local dev:d1 binds a single port (192.168.0.94:3000) - run only one session's dev server at a time" -ForegroundColor DarkYellow
