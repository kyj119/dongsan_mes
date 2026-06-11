# Phase 3.1 리팩토링 — 커밋 + 배포 자동 스크립트
# PowerShell에서 실행: cd C:\Users\user\dongsan_mes; .\PHASE_3_1_COMMIT.ps1

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\user\dongsan_mes"

Write-Host "`n[1/6] Phase 3.1 baseline 태그 생성..." -ForegroundColor Cyan
git tag -f refactor/phase-3-1-baseline-pre HEAD 2>&1 | Out-Null
Write-Host "  ✓ tag refactor/phase-3-1-baseline-pre"

Write-Host "`n[2/6] 백업 파일 삭제..." -ForegroundColor Cyan
Remove-Item -Force src/scripts/items.js.refactor-baseline -ErrorAction SilentlyContinue
Remove-Item -Force src/scripts/orderForm.js.refactor-baseline -ErrorAction SilentlyContinue
Write-Host "  ✓ 백업 정리 완료"

Write-Host "`n[3/6] 빌드 (typecheck + vite)..." -ForegroundColor Cyan
npm run verify
if ($LASTEXITCODE -ne 0) { Write-Host "  ✗ verify 실패. 중단." -ForegroundColor Red; exit 1 }
Write-Host "  ✓ verify 통과"

Write-Host "`n[4/6] smoke 단계 생략" -ForegroundColor DarkGray
Write-Host "  (이유: 로컬 D1 환경 차이로 의미 없음. CI가 push 후 production smoke 자동 실행)"

Write-Host "`n[5/6] git staging — Phase 3.1 파일만..." -ForegroundColor Cyan
# 신규 파일
git add src/routes/cards.ts src/routes/cards/
git add src/scripts/items/ src/pages/items.ts
git add src/scripts/orderForm/ src/pages/orderForm.ts
git add memory/session-context.md
git add PHASE_3_1_REFACTORING_PLAN.md PHASE_3_1_VERIFICATION.md PHASE_3_1_COMMIT.ps1
# 삭제된 원본 마킹
git add -u src/scripts/items.js src/scripts/orderForm.js

Write-Host "  staged 파일 목록:" -ForegroundColor Yellow
git diff --cached --name-status

Write-Host "`n[6/6] 커밋 + 푸시?" -ForegroundColor Cyan
$confirm = Read-Host "  진행하려면 'yes' 입력"
if ($confirm -ne "yes") {
    Write-Host "  중단. (staging은 유지됨, git reset HEAD로 풀 수 있음)" -ForegroundColor Yellow
    exit 0
}

git commit -m "Phase 3.1: 대형 파일 3개 리팩토링 (cards.ts/items.js/orderForm.js)

- cards.ts (2121줄) -> aggregator + queries/scheduling/lifecycle (4 파일)
- items.js (3235줄) -> core/modals/tabs/media/bulk (5 파일, ?raw concat)
- orderForm.js (3966줄) -> client/itemRow/finishing/calc/sheet/parent (6 파일)
- orderFormDist.js는 그대로 (351줄)

검증: typecheck + build (306 modules) + dist 함수 검증 통과
- 27 items onclick + 12 orderForm onclick 모두 dist에 존재
- 14 items + 26 orderForm + 7 inline 핵심 함수 모두 검증
- 변수명 충돌 없음 (top-level var 모두 unique)
- 31 cards 라우트 (queries 13 + scheduling 4 + lifecycle 14) 분할

백업 태그: refactor/phase-3-1-baseline-pre"

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ commit 실패." -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ commit 완료" -ForegroundColor Green

git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ push 실패. 'git push -f origin main'으로 재시도 또는 git pull --rebase 후 재시도." -ForegroundColor Red
    exit 1
}

Write-Host "`n=== 완료 ===" -ForegroundColor Green
Write-Host "GitHub Actions가 자동 배포 트리거. 5분 내 production 반영."
Write-Host "롤백 필요 시: git reset --hard refactor/phase-3-1-baseline-pre; git push -f origin main"
