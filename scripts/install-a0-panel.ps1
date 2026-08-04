#requires -Version 5.1
<#
.SYNOPSIS
  MES 가공·재단 CEP 패널을 이 PC에 설치/갱신한다 (관리자 권한 불요).
.DESCRIPTION
  디자이너 PC 보급용. Z: 공유에서 실행하면 별도 준비 없이 설치된다.

    \\NAS\DESIGNS\IA-등록\_scripts\install-a0-panel.ps1

  하는 일:
    1) 패널 껍데기를 %APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel 로 복사 (기존은 백업)
    2) 미서명 확장 허용 레지스트리 PlayerDebugMode=1 (HKCU, CSXS 10/11/12)
    3) 로직 정본 2개(Z:\...\_scripts\mes-a0-host.jsx · mes-cut-host.jsx) 존재 확인
    4) ★구 재단 패널(com.mes.cut.panel)이 남아 있으면 백업 후 제거

  ★2026-08-04 병합 — 재단 패널은 이 패널의 '재단' 탭으로 흡수됐다. 구 확장을 지우는 이유:
    같은 기능이 두 개 뜨면 어느 쪽이 최신인지 알 수 없고, 구 패널은 갱신되지 않아
    조용히 옛 동작을 한다. 지우기 전에 _panel_backups 로 통째로 백업하므로 되돌릴 수 있다.

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
$corePaths = @(
  'Z:\DESIGNS\IA-등록\_scripts\mes-a0-host.jsx',
  'Z:\DESIGNS\IA-등록\_scripts\mes-cut-host.jsx'
)
$OLD_CUT_EXT = 'com.mes.cut.panel'   # 병합으로 은퇴한 확장

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
# ★ 백업은 Copy 다 (Move 아님). 2026-07-31 실측: Move-Item 으로 폴더를 옮기면 **이미 열려 있던 패널이
#   이동된 백업 폴더를 계속 읽는다**(location.href 가 ...bak-20260730-205701/index.html 이었다).
#   "설치 완료" 가 뜨고 드리프트 감사까지 통과하는데 화면은 구버전인 상태가 되어 원인을 찾기 어렵다.
#   폴더 경로를 유지하면 패널 리로드(또는 닫았다 열기)만으로 새 파일이 붙는다.
#
# ★★ 백업은 **extensions 폴더 밖**에 둔다 (2026-07-31 실측으로 드러난 더 큰 함정).
#    CEP 는 extensions 아래를 훑어 `CSXS/manifest.xml` 이 있는 폴더를 전부 확장으로 등록하는데,
#    `.bak-*` 백업도 **manifest 와 ExtensionBundleId 가 원본과 똑같다**. 같은 ID 가 여러 개면
#    CEP 가 그중 하나를 고르고, 실제로 **백업(구버전)을 골랐다** —
#    증상 = 호스트만 새 버전이고(Z: 에서 evalFile 하므로) **shell 만 옛 버전**으로 뜬다.
#    (실측: 재단 패널이 host CUT-CEP-0.5.0 / shell 0.7.2 = `.bak-20260731-165851` 폴더의 값)
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

# 백업 누적 정리 — 최근 3개만 남긴다(2026-07-29~31 사이에만 10개 넘게 쌓였다)
$olds = @(Get-ChildItem $bakRoot -Directory -Filter "$EXT_ID.bak-*" -EA SilentlyContinue | Sort-Object Name -Descending | Select-Object -Skip 3)
if ($olds.Count -gt 0) {
  foreach ($o in $olds) { Remove-Item $o.FullName -Recurse -Force -EA SilentlyContinue }
  Write-Step "오래된 백업 $($olds.Count)개 정리"
}

# ── 2-b) 구 재단 패널 제거 (병합, 2026-08-04) ──
# 백업은 extensions **밖**으로 — 안에 두면 CEP 가 그 폴더를 확장으로 다시 등록한다(위 주석 참조).
$oldCut = Join-Path $destRoot $OLD_CUT_EXT
if (Test-Path $oldCut) {
  if (-not (Test-Path $bakRoot)) { New-Item -ItemType Directory -Path $bakRoot -Force | Out-Null }
  $cutBak = Join-Path $bakRoot ("$OLD_CUT_EXT.retired-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  try {
    Move-Item $oldCut $cutBak -Force -ErrorAction Stop
    Write-Step "구 재단 패널 제거 → $cutBak (재단 탭으로 흡수됨)"
  } catch {
    Write-Warning "  구 재단 패널을 옮기지 못했습니다: $($_.Exception.Message)"
    Write-Warning "  일러스트레이터를 완전히 종료한 뒤 다시 실행하세요."
  }
}
# 구 재단 패널의 백업 잔여물도 extensions 밖으로
$strayCut = @(Get-ChildItem $destRoot -Directory -Filter "$OLD_CUT_EXT*" -EA SilentlyContinue)
foreach ($s2 in $strayCut) {
  try { Move-Item $s2.FullName (Join-Path $bakRoot ($s2.Name + '.retired')) -Force -EA Stop } catch {}
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
foreach ($f in @('CSXS\manifest.xml', 'index.html', 'js\main.js', 'js\cut-main.js', 'js\tabs.js', 'js\geometry.js', 'js\nesting.js', 'jsx\host.jsx')) {
  if (-not (Test-Path (Join-Path $dest $f))) { $problems += "누락: $f" }
}
$stub = Get-Content (Join-Path $dest 'jsx\host.jsx') -Raw -EA SilentlyContinue
if ($stub -and $stub -notmatch 'evalFile') {
  $problems += 'host.jsx가 스텁이 아닙니다(구버전 전체 로직본) — 리포 최신을 복사하세요'
}
foreach ($cp in $corePaths) {
  if (-not (Test-Path $cp)) {
    $problems += "로직 정본 없음: $cp (Z: 연결/배포 확인 — 없으면 해당 탭이 'ERROR 정본 없음' 표시)"
  }
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
Write-Host '  2. 창(Window) > 확장(Extensions) > MES 가공·재단'
Write-Host '     (구 "MES 재단" 항목은 사라집니다 — 재단 탭으로 들어갔습니다)'
Write-Host '  3. 패널 우상단 버전 표시가 "ERROR ..."면 Z: 연결을 확인하세요'
