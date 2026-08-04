#requires -Version 5.1
<#
.SYNOPSIS
  CAPS 근태 워커(caps-worker)를 이 PC에 갱신한다 (관리자 권한 불요).
.DESCRIPTION
  경리 PC 보급용. Z: 공유에서 실행하면 별도 준비 없이 갱신된다.

    Z:\...\caps-worker-deploy\install-caps-worker.ps1

  하는 일:
    1) 실행 중인 워커 정지 (예약작업 CapsWorker + 남은 node 프로세스)
    2) 기존 src 를 src.bak-<날짜시각> 으로 백업
    3) 새 src 복사   ← .env 는 건드리지 않는다 (SITE_ID·API키·LOOKBACK_DAYS 유지)
    4) 자체검사(test-range) 실행 → 실패하면 백업으로 자동 롤백하고 중단
    5) 워커 재시작 + 기동 로그 확인

  ★ 새 의존성이 없으므로 npm install 은 필요 없다.
  ★ .env 를 덮지 않으므로 사이트별 설정은 그대로 유지된다.
.PARAMETER Source
  새 src 폴더의 부모 경로. 생략 시 스크립트 위치 기준으로 탐색.
.PARAMETER WorkerDir
  이 PC의 caps-worker 폴더. 생략 시 C:\caps-worker 등에서 자동 탐색.
.PARAMETER NoRestart
  복사·검사까지만 하고 재시작하지 않는다.
.EXAMPLE
  .\install-caps-worker.ps1
  .\install-caps-worker.ps1 -WorkerDir D:\caps-worker
#>
param(
  [string]$Source,
  [string]$WorkerDir,
  [switch]$NoRestart
)
$ErrorActionPreference = 'Stop'

$TASK_NAME = 'CapsWorker'

function Write-Step($m) { Write-Host "  $m" -ForegroundColor DarkGray }
function Write-Ok($m)   { Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Warn2($m){ Write-Host "[!] $m" -ForegroundColor Yellow }

Write-Host ''
Write-Host '=== CAPS 워커 갱신 ===' -ForegroundColor Cyan

# ── 1) 새 src 탐색 ──
$candidates = @()
if ($Source) { $candidates += $Source }
$candidates += $PSScriptRoot
$candidates += (Join-Path $PSScriptRoot 'caps-worker')
# 리포에서 직접 실행하는 경우
$candidates += (Join-Path (Split-Path -Parent $PSScriptRoot) 'caps-worker')

$srcDir = $null
foreach ($c in $candidates) {
  if (-not $c) { continue }
  $probe = Join-Path $c 'src\index.js'
  if (Test-Path $probe) { $srcDir = (Join-Path $c 'src'); break }
}
if (-not $srcDir) {
  throw "새 src 폴더를 찾지 못했습니다. -Source 로 지정하세요. (탐색: $($candidates -join ' | '))"
}
Write-Step "새 소스: $srcDir"

# ── 2) 이 PC의 caps-worker 탐색 ──
$destCandidates = @()
if ($WorkerDir) { $destCandidates += $WorkerDir }
$destCandidates += 'C:\caps-worker'
$destCandidates += 'D:\caps-worker'
$destCandidates += (Join-Path $env:USERPROFILE 'caps-worker')

$workerRoot = $null
foreach ($c in $destCandidates) {
  if ($c -and (Test-Path (Join-Path $c 'src'))) { $workerRoot = $c; break }
}
if (-not $workerRoot) {
  throw "이 PC의 caps-worker 폴더를 찾지 못했습니다. -WorkerDir 로 지정하세요. (탐색: $($destCandidates -join ' | '))"
}
Write-Step "설치 대상: $workerRoot"

# 같은 폴더를 가리키면 사고 — 중단
if ((Resolve-Path $srcDir).Path -eq (Resolve-Path (Join-Path $workerRoot 'src')).Path) {
  throw "소스와 대상이 같은 폴더입니다: $srcDir"
}

# ── 3) 어느 사이트인지 확인 (.env) ──
$envPath = Join-Path $workerRoot '.env'
if (Test-Path $envPath) {
  $envText = Get-Content $envPath -Raw
  $siteId = ''
  $lookback = ''
  if ($envText -match '(?m)^\s*SITE_ID\s*=\s*(.+?)\s*$')       { $siteId = $Matches[1] }
  if ($envText -match '(?m)^\s*LOOKBACK_DAYS\s*=\s*(.+?)\s*$')  { $lookback = $Matches[1] }
  Write-Step "사이트: $siteId   (LOOKBACK_DAYS=$lookback)  ← .env 는 그대로 둡니다"
} else {
  Write-Warn2 ".env 가 없습니다: $envPath — 워커가 기본값으로 동작할 수 있습니다."
}

# ── 4) node 확인 ──
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { throw 'node 를 찾을 수 없습니다. Node.js 설치 여부를 확인하세요.' }
Write-Step "node: $($node.Source)"

# ── 5) 워커 정지 ──
Write-Host ''
Write-Host '[1/5] 워커 정지' -ForegroundColor White
try { schtasks /End /TN $TASK_NAME 2>$null | Out-Null } catch { }
$procs = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
           Where-Object { $_.CommandLine -and $_.CommandLine -like '*caps-worker*' })
foreach ($p in $procs) {
  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Step "node PID $($p.ProcessId) 종료" } catch { }
}
if ($procs.Count -eq 0) { Write-Step '실행 중인 워커 없음' }
Start-Sleep -Milliseconds 800

# ── 6) 백업 ──
Write-Host '[2/5] 기존 src 백업' -ForegroundColor White
$stamp   = Get-Date -Format 'yyyyMMdd-HHmmss'
$destSrc = Join-Path $workerRoot 'src'
$backup  = Join-Path $workerRoot "src.bak-$stamp"
Copy-Item $destSrc $backup -Recurse -Force
Write-Step "백업: $backup"

# ── 7) 복사 ──
# 병합(*)이 아니라 통째 교체 — 병합하면 구버전에서 삭제된 파일이 남아 계속 로드된다.
# 바로 위에서 백업을 떴으므로 안전하다.
Write-Host '[3/5] 새 src 복사' -ForegroundColor White
Remove-Item $destSrc -Recurse -Force
Copy-Item $srcDir $destSrc -Recurse -Force
Write-Step '복사 완료 (.env·logs·node_modules 미변경)'

# ── 8) 자체검사 → 실패 시 자동 롤백 ──
Write-Host '[4/5] 자체검사 (test-range)' -ForegroundColor White
$testPath = Join-Path $destSrc 'test-range.js'
if (-not (Test-Path $testPath)) {
  Write-Warn2 'test-range.js 가 없습니다 — 검사 건너뜀 (구버전 소스일 수 있음)'
} else {
  # ⚠️ PS 5.1 함정: $ErrorActionPreference='Stop' 상태에서 네이티브 exe 의 stderr 를 2>&1 로 받으면
  #    각 줄이 ErrorRecord 로 변환되면서 그 자리에서 예외가 터진다 → 아래 롤백 코드가 통째로 건너뛰어진다.
  #    (실제로 이 스크립트 테스트 중 재현됨) 검사 구간에서만 Continue 로 낮춘다.
  Push-Location $workerRoot
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & node 'src\test-range.js' 2>&1
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prevEap
    Pop-Location
  }

  if ($code -ne 0) {
    Write-Host ($out | Out-String) -ForegroundColor Red
    Write-Warn2 '자체검사 실패 → 백업으로 롤백합니다.'
    Remove-Item $destSrc -Recurse -Force
    Copy-Item $backup $destSrc -Recurse -Force
    if (-not $NoRestart) { schtasks /Run /TN $TASK_NAME 2>$null | Out-Null }
    throw "자체검사 실패로 롤백했습니다. 워커는 이전 버전으로 복구됐습니다. (백업: $backup)"
  }
  $summary = ($out | Select-String -Pattern '전체 통과|실패' | Select-Object -Last 1)
  Write-Step "$summary"
}

# ── 9) 재시작 ──
if ($NoRestart) {
  Write-Host '[5/5] 재시작 생략 (-NoRestart)' -ForegroundColor White
  Write-Ok "복사 완료. 수동 재시작: schtasks /Run /TN `"$TASK_NAME`""
  exit 0
}

Write-Host '[5/5] 워커 재시작' -ForegroundColor White
$taskOk = $true
try { schtasks /Run /TN $TASK_NAME | Out-Null } catch { $taskOk = $false }
if (-not $taskOk) {
  Write-Warn2 "예약작업 '$TASK_NAME' 실행 실패 — 등록돼 있지 않을 수 있습니다."
  Write-Warn2 "  등록: cd `"$workerRoot`" ; npm run install-service"
} else {
  Start-Sleep -Seconds 5
  $logFile = Join-Path $workerRoot ("logs\caps-worker-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))
  if (Test-Path $logFile) {
    Write-Host ''
    Write-Host '  --- 기동 로그 (마지막 15줄) ---' -ForegroundColor DarkGray
    Get-Content $logFile -Tail 15 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    $verLine = (Get-Content $logFile -Tail 60 | Select-String -Pattern 'CAPS Worker 시작' | Select-Object -Last 1)
    if ($verLine) { Write-Host '' ; Write-Ok "$verLine" }
  } else {
    Write-Warn2 "로그 파일이 아직 없습니다: $logFile (몇 초 후 다시 확인하세요)"
  }
}

Write-Host ''
Write-Ok '갱신 완료.'
Write-Host '  다음: MES → 설정 → CAPS 근태 연동 → 동기화 이력에서 "워커 버전"이 1.1.0 인지 확인' -ForegroundColor DarkGray
Write-Host "  문제 시 롤백: Remove-Item `"$destSrc`" -Recurse -Force ; Copy-Item `"$backup`" `"$destSrc`" -Recurse" -ForegroundColor DarkGray
Write-Host ''
