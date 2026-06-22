# check-queue-ready.ps1 — 큐 러너 사전 점검 (구독 인증·모델·환경)
# 실행: .\scripts\check-queue-ready.ps1   (관리자 모드 불필요)

$OutputEncoding = [System.Text.Encoding]::UTF8            # PS5.1 파이프 한글 깨짐 방지
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "════════ 큐 러너 사전 점검 ════════" -ForegroundColor Cyan

# 0) 실행 환경
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host ("0) 관리자 모드: {0}  (큐 실행에 관리자 권한 불필요 — 일반 모드로 충분)" -f $(if($isAdmin){"예"}else{"아니요"}))
Write-Host ("   PowerShell: {0}" -f $PSVersionTable.PSVersion)

# 1) claude CLI
$claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claudeCmd) { Write-Host "1) claude CLI: ❌ 없음 — PATH 확인 필요" -ForegroundColor Red; exit 1 }
$ver = (claude --version) 2>&1 | Select-Object -First 1
Write-Host ("1) claude CLI: ✅ {0}" -f $ver)

# 2) API 키 환경변수
if ($env:ANTHROPIC_API_KEY) {
  Write-Host "2) ANTHROPIC_API_KEY: ⚠️ 설정됨 — 이 점검과 큐 러너는 무시하고 구독 인증 사용" -ForegroundColor Yellow
  Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
} else {
  Write-Host "2) ANTHROPIC_API_KEY: ✅ 없음 (구독 인증 경로)"
}

# 3) 구독 인증 + sonnet 실호출 (30초 내)
Write-Host "3) sonnet 호출 테스트 중..." -NoNewline
$out = ("어떤 도구도 사용하지 말고, 파일도 읽지 말고, 오직 ok 한 단어만 출력해" | claude -p --model sonnet) 2>&1 | Out-String
if ($LASTEXITCODE -eq 0 -and $out -match "ok") {
  Write-Host " ✅ 성공 (구독 인증으로 모델 호출 정상)" -ForegroundColor Green
} else {
  Write-Host " ❌ 실패" -ForegroundColor Red
  Write-Host ("   응답: {0}" -f $out.Trim().Substring(0, [Math]::Min(200, $out.Trim().Length)))
  if ($out -match "Credit balance") { Write-Host "   → API 크레딧 경로로 나감: claude 실행 후 /login으로 구독 계정 로그인 필요" -ForegroundColor Yellow }
  if ($out -match "login|auth")     { Write-Host "   → 로그인 필요: claude 실행 후 /login" -ForegroundColor Yellow }
  exit 1
}

# 4) opus 호출 테스트 (큐 기본 모델)
Write-Host "4) opus 호출 테스트 중..." -NoNewline
$out2 = ("어떤 도구도 사용하지 말고, 파일도 읽지 말고, 오직 ok 한 단어만 출력해" | claude -p --model opus) 2>&1 | Out-String
if ($LASTEXITCODE -eq 0 -and $out2 -match "ok") {
  Write-Host " ✅ 성공 (큐 기본 모델 사용 가능)" -ForegroundColor Green
} else {
  Write-Host " ❌ 실패" -ForegroundColor Red
  Write-Host ("   응답: {0}" -f $out2.Trim().Substring(0, [Math]::Min(200, $out2.Trim().Length)))
  Write-Host "   → sonnet은 되고 opus만 실패면: 요금제 한도/모델 접근 문제. 큐 작업 파일의 model을 sonnet으로 바꾸면 우회 가능" -ForegroundColor Yellow
}

# 5) 큐 상태
$pend = Get-ChildItem "$PSScriptRoot\..\queue\pending" -Filter *.md -ErrorAction SilentlyContinue
$lockF = "$PSScriptRoot\..\.claude\.queue-runner.lock"
Write-Host ("5) 큐: pending {0}건{1}" -f ($pend | Measure-Object).Count, $(if(Test-Path $lockF){" / ⚠️ 락 존재(러너가 자가 정리함)"}else{""}))
$pend | ForEach-Object { Write-Host ("   - {0}" -f $_.Name) }

Write-Host ""
Write-Host "3)·4) 모두 ✅면 바로 실행 가능:  .\run-queue.ps1" -ForegroundColor Cyan
