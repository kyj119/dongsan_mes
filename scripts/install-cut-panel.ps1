#requires -Version 5.1
<#
.SYNOPSIS
  MES 재단 CEP 패널을 이 PC에 설치/갱신한다 (관리자 권한 불요).
.DESCRIPTION
  A0 패널(com.mes.a0.panel)과 **번들 ID가 다르므로 나란히 설치된다** — A0를 지우지 않는다.

    \\NAS\DESIGNS\IA-등록\_scripts\install-cut-panel.ps1

  하는 일:
    1) 패널 껍데기를 %APPDATA%\Adobe\CEP\extensions\com.mes.cut.panel 로 복사 (기존은 백업)
    2) 미서명 확장 허용 레지스트리 PlayerDebugMode=1 (HKCU, CSXS 10/11/12)
    3) 로직 정본(Z:\...\_scripts\mes-cut-host.jsx) 존재 확인

  ★ 로직은 패널 안에 없다. 패널의 host.jsx는 Z: 정본을 $.evalFile 하는 스텁이라
    로직 수정은 Z: 정본 1개만 교체하면 되고 이 스크립트를 다시 돌릴 필요가 없다.
    (패널 폼/화면 자체가 바뀐 경우에만 재실행 — 그때는 껍데기 SHELL_VERSION 도 올라가 있다)
.PARAMETER Source
  패널 폴더(com.mes.cut.panel)의 부모 경로. 생략 시 스크립트 위치 → 리포 경로 순으로 탐색.
.PARAMETER Uninstall
  설치 제거(확장 폴더 삭제). 레지스트리는 타 확장 공용이라 보존.
.EXAMPLE
  .\install-cut-panel.ps1
  .\install-cut-panel.ps1 -Uninstall
#>
param(
  [string]$Source,
  [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'

$EXT_ID   = 'com.mes.cut.panel'
$destRoot = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$dest     = Join-Path $destRoot $EXT_ID
$corePath = 'Z:\DESIGNS\IA-등록\_scripts\mes-cut-host.jsx'

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
$candidates += (Join-Path $PSScriptRoot 'cut-panel')
$candidates += 'Z:\DESIGNS\IA-등록\_scripts\cut-panel'
# 리포에서 직접 실행하는 경우
$repoGuess = Join-Path (Split-Path -Parent $PSScriptRoot) 'IllustratorAutomat\designer\cut-panel'
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
# ★ 백업은 Copy 다 (Move 아님). 2026-07-31 실측: Move-Item 으로 폴더를 옮기면 **이미 열려 있던 패널이
#   이동된 백업 폴더를 계속 읽는다**. "설치 완료" 가 뜨고 드리프트 감사까지 통과하는데 화면은 구버전이 된다.
#   폴더 경로를 유지하면 패널 리로드(또는 닫았다 열기)만으로 새 파일이 붙는다.
#
# ★★ 백업은 **extensions 폴더 밖**에 둔다 (2026-07-31 실측으로 드러난 더 큰 함정).
#    CEP 는 extensions 아래를 훑어 `CSXS/manifest.xml` 이 있는 폴더를 전부 확장으로 등록하는데,
#    `.bak-*` 백업도 **manifest 와 ExtensionBundleId 가 원본과 똑같다**. 같은 ID 가 여러 개면
#    CEP 가 그중 하나를 고르고, 실제로 **백업(구버전)을 골랐다** —
#    증상 = 호스트만 새 버전이고(Z: 에서 evalFile 하므로) **shell 만 옛 버전**으로 뜬다.
#    (실측: host CUT-CEP-0.5.0 인데 shell 0.7.2 = `.bak-20260731-165851` 폴더의 값)
if (-not (Test-Path $destRoot)) { New-Item -ItemType Directory -Path $destRoot -Force | Out-Null }
$bakRoot = Join-Path (Split-Path -Parent $destRoot) '_panel_backups'
if (Test-Path $dest) {
  if (-not (Test-Path $bakRoot)) { New-Item -ItemType Directory -Path $bakRoot -Force | Out-Null }
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $bak = Join-Path $bakRoot "$EXT_ID.bak-$stamp"
  Copy-Item $dest $bak -Recurse -Force
  Write-Step "기존 설치 백업 → $bak"
  Copy-Item (Join-Path $srcDir '*') $dest -Recurse -Force   # 제자리 덮어쓰기(경로 유지)
} else {
  Copy-Item $srcDir $dest -Recurse -Force
}
Write-Step "복사 완료 → $dest"

# ★기존 설치본이 남긴 extensions 안의 백업을 걷어낸다 — 하나라도 남으면 CEP 가 그걸 고를 수 있다.
$stray = @(Get-ChildItem $destRoot -Directory -Filter "$EXT_ID.bak-*" -EA SilentlyContinue)
if ($stray.Count -gt 0) {
  if (-not (Test-Path $bakRoot)) { New-Item -ItemType Directory -Path $bakRoot -Force | Out-Null }
  foreach ($s in $stray) {
    try { Move-Item $s.FullName (Join-Path $bakRoot $s.Name) -Force -EA Stop }
    catch { Remove-Item $s.FullName -Recurse -Force -EA SilentlyContinue }
  }
  Write-Step "extensions 안의 옛 백업 $($stray.Count)개를 밖으로 이동 (CEP 오등록 방지)"
}

# 백업 누적 정리 — 최근 3개만 남긴다
$olds = @(Get-ChildItem $bakRoot -Directory -Filter "$EXT_ID.bak-*" -EA SilentlyContinue | Sort-Object Name -Descending | Select-Object -Skip 3)
if ($olds.Count -gt 0) {
  foreach ($o in $olds) { Remove-Item $o.FullName -Recurse -Force -EA SilentlyContinue }
  Write-Step "오래된 백업 $($olds.Count)개 정리"
}

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
  $problems += 'host.jsx가 스텁이 아닙니다(전체 로직본) — 리포 최신을 복사하세요'
}
if (-not (Test-Path $corePath)) {
  $problems += "로직 정본 없음: $corePath (Z: 연결/배포 확인 — 없으면 패널이 'ERROR 정본 없음' 표시)"
}
# CDP 포트 충돌 확인: A0 가 8888 이므로 재단은 8889 여야 한다(겹치면 한쪽이 디버깅 불가).
$dbg = Get-Content (Join-Path $dest '.debug') -Raw -EA SilentlyContinue
if ($dbg -and $dbg -notmatch 'Port="8889"') { $problems += '.debug 포트가 8889가 아닙니다 — A0(8888)와 충돌 확인' }

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
Write-Host '  2. 창(Window) > 확장(Extensions) > MES Cut Panel'
Write-Host '  3. 패널 우상단 버전 표시가 "ERROR ..."면 Z: 연결을 확인하세요'
Write-Host '  ※ A0 패널은 그대로 남아 있습니다 (별도 확장)'
