#requires -Version 5.1
<#
.SYNOPSIS
  MES A0 CEP 패널을 이 PC에 설치/갱신한다 (관리자 권한 불요).
.DESCRIPTION
  디자이너 PC 보급용. Z: 공유에서 실행하면 별도 준비 없이 설치된다.

    \\NAS\DESIGNS\IA-등록\_scripts\install-a0-panel.ps1

  하는 일:
    1) 패널 껍데기를 %APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel 로 복사 (기존은 백업)
    2) 미서명 확장 허용 레지스트리 PlayerDebugMode=1 (HKCU, CSXS 10/11/12)
    3) 로직 정본(Z:\...\_scripts\mes-a0-host.jsx) 존재 확인

  ★ 로직은 패널 안에 없다. 패널의 host.jsx는 Z: 정본을 $.evalFile 하는 스텁이라
    로직 수정은 Z: 정본 1개만 교체하면 되고 이 스크립트를 다시 돌릴 필요가 없다.
    (패널 폼/화면 자체가 바뀐 경우에만 재실행)
.PARAMETER Source
  패널 폴더(com.mes.a0.panel)의 부모 경로. 생략 시 스크립트 위치 → 리포 경로 순으로 탐색.
.PARAMETER Uninstall
  설치 제거(확장 폴더 삭제). 레지스트리는 타 확장 공용이라 보존.
.EXAMPLE
  .\install-a0-panel.ps1
  .\install-a0-panel.ps1 -Uninstall
#>
param(
  [string]$Source,
  [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'

$EXT_ID   = 'com.mes.a0.panel'
$destRoot = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$dest     = Join-Path $destRoot $EXT_ID
$corePath = 'Z:\DESIGNS\IA-등록\_scripts\mes-a0-host.jsx'

function Write-Step($m) { Write-Host "  $m" -ForegroundColor DarkGray }

if ($Uninstall) {
  if (Test-Path $dest) {
    Remove-Item $dest -Recurse -Force
    Write-Host "[제거] $dest 삭제 완료. 일러스트레이터를 재시작하세요." -ForegroundColor Green
  } else {
    Write-Host "[제거] 설치돼 있지 않습니다: $dest" -ForegroundColor Yellow
  }
  exit 0
}

# ── 1) 소스 탐색 ──
$candidates = @()
if ($Source) { $candidates += $Source }
$candidates += $PSScriptRoot
$candidates += (Join-Path $PSScriptRoot 'a0-panel')
$candidates += 'Z:\DESIGNS\IA-등록\_scripts\a0-panel'
# 리포에서 직접 실행하는 경우
$repoGuess = Join-Path (Split-Path -Parent $PSScriptRoot) 'IllustratorAutomat\designer\poc-a0-cep'
$candidates += $repoGuess

$srcDir = $null
foreach ($c in $candidates) {
  if (-not $c) { continue }
  $p = Join-Path $c $EXT_ID
  if (Test-Path (Join-Path $p 'CSXS\manifest.xml')) { $srcDir = $p; break }
}
if (-not $srcDir) {
  Write-Error ("패널 소스를 찾지 못했습니다. -Source 로 " + $EXT_ID + " 의 부모 폴더를 지정하세요.`n탐색한 경로:`n  " + ($candidates -join "`n  "))
  exit 1
}
Write-Step "소스: $srcDir"

# ── 2) 기존 설치 백업 후 복사 ──
if (-not (Test-Path $destRoot)) { New-Item -ItemType Directory -Path $destRoot -Force | Out-Null }
if (Test-Path $dest) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $bak = "$dest.bak-$stamp"
  Move-Item $dest $bak
  Write-Step "기존 설치 백업 → $bak"
}
Copy-Item $srcDir $dest -Recurse -Force
Write-Step "복사 완료 → $dest"

# ── 3) 미서명 확장 허용 (HKCU — 관리자 불요) ──
$applied = @()
foreach ($v in @('10', '11', '12')) {
  $key = "HKCU:\Software\Adobe\CSXS.$v"
  try {
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    New-ItemProperty -Path $key -Name 'PlayerDebugMode' -Value '1' -PropertyType String -Force | Out-Null
    $applied += "CSXS.$v"
  } catch {
    Write-Warning "  레지스트리 실패 CSXS.$v : $($_.Exception.Message)"
  }
}
Write-Step "PlayerDebugMode=1 적용: $($applied -join ', ')"

# ── 4) 검증 ──
$problems = @()
foreach ($f in @('CSXS\manifest.xml', 'index.html', 'js\main.js', 'jsx\host.jsx')) {
  if (-not (Test-Path (Join-Path $dest $f))) { $problems += "누락: $f" }
}
$stub = Get-Content (Join-Path $dest 'jsx\host.jsx') -Raw -EA SilentlyContinue
if ($stub -and $stub -notmatch 'evalFile') {
  $problems += 'host.jsx가 스텁이 아닙니다(구버전 전체 로직본) — 리포 최신을 복사하세요'
}
if (-not (Test-Path $corePath)) {
  $problems += "로직 정본 없음: $corePath (Z: 연결/배포 확인 — 없으면 패널이 'ERROR 정본 없음' 표시)"
}

Write-Host ''
if ($problems.Count -gt 0) {
  Write-Host '[설치] 완료했으나 확인 필요:' -ForegroundColor Yellow
  foreach ($p in $problems) { Write-Host "  - $p" -ForegroundColor Yellow }
} else {
  Write-Host '[설치] 완료 — 이상 없음' -ForegroundColor Green
}
Write-Host ''
Write-Host '다음 단계:' -ForegroundColor Cyan
Write-Host '  1. 일러스트레이터를 완전히 종료했다가 다시 시작'
Write-Host '  2. 창(Window) > 확장(Extensions) > MES A0 Panel'
Write-Host '  3. 패널 우상단 버전 표시가 "ERROR ..."면 Z: 연결을 확인하세요'
