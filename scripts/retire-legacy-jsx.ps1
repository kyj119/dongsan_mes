#requires -Version 5.1
<#
.SYNOPSIS
  레거시 Illustrator Scripts 스텁(MES가공 / MES판짜기)을 내린다. 되돌릴 수 있다.
.DESCRIPTION
  IA 진입점 통합(패널 + ia-editor 2개)의 마지막 단계. 대체재는 이미 있다:

    MES가공.jsx   -> 일러 MES A0 패널          (같은 산출물·같은 manifest 스키마)
    MES판짜기.jsx -> ia-editor 네스팅/모아찍기  (판 확정 시 대기물 자동 소비 = Phase 3)

  ★ 삭제가 아니라 '내리기'다. 스텁 원본을 Z: 공용 보관함으로 옮기고, 로직 정본
    (Z:\...\_scripts\mes-core.jsx / mes-sheet.jsx)은 손대지 않는다.
    -Restore 로 언제든 원위치. Scripts 폴더가 Program Files라 관리자 권한 필요.

  ⚠️ 판짜기를 내리면 판 출력 경로가 ia-editor 하나만 남는다. 그 경로의 EPS 생성
    실패 이력이 있으므로(sheet #19, 2026-07-28) 판짜기부터 내릴 때는 -Sheet 로
    단계 분리해 실사용 1건을 먼저 확인할 것.
.PARAMETER Core
  MES가공.jsx 만 내린다.
.PARAMETER Sheet
  MES판짜기.jsx 만 내린다.
.PARAMETER Restore
  보관함(가장 최근 백업)에서 되돌린다.
.PARAMETER WhatIfOnly
  실제 이동 없이 대상만 출력.
.EXAMPLE
  # 관리자 PowerShell 에서
  .\retire-legacy-jsx.ps1 -WhatIfOnly     # 대상 확인만
  .\retire-legacy-jsx.ps1 -Sheet          # 판짜기만 먼저
  .\retire-legacy-jsx.ps1                 # 둘 다
  .\retire-legacy-jsx.ps1 -Restore        # 되돌리기
#>
param(
  [switch]$Core,
  [switch]$Sheet,
  [switch]$Restore,
  [switch]$WhatIfOnly
)
$ErrorActionPreference = 'Stop'

$VAULT = 'Z:\DESIGNS\IA-등록\_scripts\_retired'
$TARGETS = @('MES가공.jsx', 'MES판짜기.jsx')
if ($Core -and -not $Sheet) { $TARGETS = @('MES가공.jsx') }
if ($Sheet -and -not $Core) { $TARGETS = @('MES판짜기.jsx') }

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 일러스트레이터 스크립트 폴더 전수 탐색(버전·로케일 무관)
function Get-ScriptDirs {
  $dirs = @()
  foreach ($root in @("$env:ProgramFiles\Adobe", "${env:ProgramFiles(x86)}\Adobe")) {
    if (-not (Test-Path $root)) { continue }
    Get-ChildItem $root -Directory -EA SilentlyContinue | Where-Object { $_.Name -like '*Illustrator*' } | ForEach-Object {
      $presets = Join-Path $_.FullName 'Presets'
      if (Test-Path $presets) {
        Get-ChildItem $presets -Directory -Recurse -Depth 1 -EA SilentlyContinue |
          Where-Object { $_.Name -in @('스크립트', 'Scripts') } | ForEach-Object { $dirs += $_.FullName }
      }
    }
  }
  return $dirs
}

$scriptDirs = Get-ScriptDirs
if (-not $scriptDirs) { Write-Error '일러스트레이터 Scripts 폴더를 찾지 못했습니다.'; exit 1 }
Write-Host "Scripts 폴더 $($scriptDirs.Count)개 발견" -ForegroundColor DarkGray
foreach ($d in $scriptDirs) { Write-Host "  $d" -ForegroundColor DarkGray }

# ── 되돌리기 ──
if ($Restore) {
  if (-not (Test-Path $VAULT)) { Write-Error "보관함 없음: $VAULT"; exit 1 }
  $latest = Get-ChildItem $VAULT -Directory | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $latest) { Write-Error "보관함이 비어 있습니다: $VAULT"; exit 1 }
  if (-not (Test-Admin)) { Write-Error '관리자 권한 PowerShell 에서 실행하세요.'; exit 1 }
  $n = 0
  foreach ($f in Get-ChildItem $latest.FullName -Filter *.jsx) {
    $dst = Join-Path $scriptDirs[0] $f.Name
    Copy-Item $f.FullName $dst -Force
    Write-Host "  복구 $($f.Name) -> $dst" -ForegroundColor Green
    $n++
  }
  Write-Host "[복구] $n 개. 일러스트레이터를 재시작하세요." -ForegroundColor Green
  exit 0
}

# ── 내리기 ──
$found = @()
foreach ($d in $scriptDirs) {
  foreach ($t in $TARGETS) {
    $p = Join-Path $d $t
    if (Test-Path $p) { $found += $p }
  }
}
if (-not $found) { Write-Host '내릴 대상이 없습니다(이미 정리됨).' -ForegroundColor Yellow; exit 0 }

Write-Host "`n내릴 대상 $($found.Count)개:" -ForegroundColor Cyan
foreach ($p in $found) { Write-Host "  $p" }
if ($WhatIfOnly) { Write-Host "`n(-WhatIfOnly — 실제 이동 없음)" -ForegroundColor Yellow; exit 0 }
if (-not (Test-Admin)) {
  Write-Error "`nScripts 폴더가 Program Files 아래라 관리자 권한이 필요합니다. 관리자 PowerShell 에서 다시 실행하세요."
  exit 1
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bak = Join-Path $VAULT $stamp
New-Item -ItemType Directory -Path $bak -Force | Out-Null
$moved = 0
foreach ($p in $found) {
  Copy-Item $p (Join-Path $bak (Split-Path $p -Leaf)) -Force
  Remove-Item $p -Force
  Write-Host "  내림 $(Split-Path $p -Leaf)" -ForegroundColor Green
  $moved++
}
Write-Host "`n[완료] $moved 개를 내렸습니다. 보관함: $bak" -ForegroundColor Green
Write-Host '되돌리려면: .\retire-legacy-jsx.ps1 -Restore (관리자)' -ForegroundColor Cyan
Write-Host '일러스트레이터를 재시작하면 파일 > 스크립트 목록에서 사라집니다.' -ForegroundColor Cyan
Write-Host "`n대체재: 가공 = MES A0 패널 · 판짜기 = ia-editor 네스팅/모아찍기" -ForegroundColor Cyan
