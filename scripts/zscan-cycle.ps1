# zscan-cycle.ps1 — Z: 파일 축 1주기(10분 간격 자동 실행용)
#
# 무엇을 하나: 썸네일 추출 → 대기함 적재. **파일 축만** 돈다.
#   주문 생성(`ecount-order-import.py`)은 이카운트 엑셀이 사람 손을 타므로 여기 넣지 않는다.
#   → 파일이 올라오면 몇 분 안에 대기함에 썸네일까지 뜬다(이카운트 없이 성립).
#
# 왜 이게 성립하나: 두 스크립트가 **같은 로컬 원장**(.zscan-ledger.json)을 본다.
#   이미 올렸고 안 바뀐 파일은 추출도 전송도 건너뛴다 → 새 파일이 없으면 몇 초로 끝난다.
#   (원장 없이 돌리면 그날 전량을 매번 재처리해 7분 넘게 걸렸다 = 10분 주기 불가)
#
# 겹침 방지: 락 파일. 앞 주기가 아직 돌고 있으면 그냥 빠진다(중복 실행이 대기함을 어지럽힌다).
#
# 사용법(수동):  .\scripts\zscan-cycle.ps1
#   특정 날짜:   .\scripts\zscan-cycle.ps1 -Date 2026-08-12
#   전량 재처리: .\scripts\zscan-cycle.ps1 -Force
#
# 작업 스케줄러 등록(10분 간격):
#   schtasks /Create /TN "MES-zscan" /SC MINUTE /MO 10 /RU "%USERNAME%" ^
#     /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\user\dongsan_mes\scripts\zscan-cycle.ps1"
#   ⚠️ Z: 는 **로그인 세션의 네트워크 드라이브**다 → 「사용자가 로그온할 때만 실행」으로 둬야 한다.
#      서비스 계정으로 돌리면 Z: 가 안 보여 축 전체가 조용히 0건이 된다.

param(
  [string]$Date = (Get-Date -Format 'yyyy-MM-dd'),
  [string]$Url  = 'https://webapp-9i0.pages.dev',
  [switch]$Force
)

# ⚠️ 'Stop' 로 두면 안 된다 — native exe 의 stderr 한 줄이 NativeCommandError 로 승격돼
#    정상 진행 로그(`200/252 …`)에서 스크립트가 죽는다. 종료코드로만 판단한다.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$lock = Join-Path $repo '.zscan-cycle.lock'
$log  = Join-Path $repo 'zscan-cycle.log'

if (Test-Path $lock) {
  $age = (Get-Date) - (Get-Item $lock).LastWriteTime
  if ($age.TotalMinutes -lt 30) { "[$(Get-Date -Format o)] SKIP 앞 주기 진행 중" | Add-Content $log; exit 0 }
  Remove-Item $lock -Force            # 30분 넘은 락은 죽은 프로세스의 잔재로 본다
}
New-Item -ItemType File $lock | Out-Null

try {
  $thumbs = Join-Path $env:TEMP "zscan-thumbs-$Date.jsonl"
  $fl = if ($Force) { '--force' } else { '' }

  Push-Location $repo
  $t0 = Get-Date
  # stderr 를 파이프로 섞지 않는다(위 주의) — 진행 로그가 오류로 승격된다.
  (& python scripts/zscan-thumb.py --from $Date --to $Date --out $thumbs $fl) | Out-String | Add-Content $log
  if ($LASTEXITCODE -ne 0) { "[$(Get-Date -Format o)] 썸네일 추출 exit=$LASTEXITCODE" | Add-Content $log }
  $env:ZSCAN_URL = $Url
  (& node scripts/zscan-intake.cjs --from $Date --to $Date --thumbs $thumbs --commit $fl) | Out-String | Add-Content $log
  $code = $LASTEXITCODE
  "[$(Get-Date -Format o)] DONE $Date · $([int]((Get-Date)-$t0).TotalSeconds)s · exit=$code" | Add-Content $log
  exit $code
} finally {
  Pop-Location
  Remove-Item $lock -Force -ErrorAction SilentlyContinue
}
