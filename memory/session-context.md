# 세션 컨텍스트 — 2026-09-08 Cloudflare 과금: 실측 도구 + 비용 차단기

> 이 세션은 **원격(claude.ai/code) 세션**이라 prod 접속·wrangler·실측을 못 했다.
> 브랜치 `claude/cloudflare-billing-limit-3t5up3` (미배포). 로컬에서 배포하려면 아래 「남은 일」 순서대로.

## 이 세션이 한 일 (코드·게이트 완료 · **미배포**)
- `scripts/cf-usage-report.cjs` (**`npm run audit:cf-usage`**) — CF GraphQL 30일 실측: 일자별 D1 읽기/쓰기 ·
  요청(Pages Functions + Workers **양쪽 합산**) · R2 ops/저장 → **축별 달러 환산 + 월말 추정 + 지배 축 1줄**.
- `src/services/costGuard.ts` + `src/middleware/costGuard.ts` — **비용 차단기**(Cloudflare 에 지출 상한이 없어서).
- `src/services/budgetAlert.ts` — **월 누적 축** 추가 + 하드 상한 초과 시 차단기 발동.
- `workers/barobill-cron` — 예산 점검 **하루 1회 → 매시**.
- `src/scripts/layout/shell.js` — 폴링 정본 **`MES_POLL`**(숨은 탭 스킵 + 유휴 백오프 + 차단 시 전역 정지·배너).
  칸반(`cards/misc.js`)·스케줄(`schedule.js`)도 여기에 붙였다.
- 설정 화면 **비용 보호 카드**(작동 중·꺼짐일 때만 노출 + 「지금 해제」).
- 게이트 `npm run test:cost-guard` **33항목** → `test:calc` 체인(CI 가 배포 전 실행).

## 판단 근거 (다시 묻지 말 것)
- **$50 은 「또 샜다」가 아닐 가능성이 크다** — 9월 청구 = **8월 사용분**인데, nav-badge 는 08-10,
  D1 실행계획(ANALYZE)은 **08-25** 에 고쳐졌다. 8월에는 수리 이전 구간이 그대로 들어 있다.
  ★단 이건 **추론이지 측정이 아니다**. 확정은 `audit:cf-usage` 의 일자별 곡선에 **08-10·08-25 계단**이 보이는지.
- **일 사용량으로는 달러가 안 나온다** — 무료 포함량이 전부 **월** 단위(요청 10M·D1 읽기 25B·쓰기 50M·CPU 30M ms).
- **Cloudflare 에 계정 지출 하드 상한은 없다**(AI Gateway 만 예외). 대시보드 알림은 「알림」이지 상한이 아니다.

## owner 결정 (2026-09-08)
- 차단기 = **자동 차단 + 기본 ON**. 끊는 것 = 자동 폴링(`X-Poll`)·무거운 리포트. 남기는 것 = **쓰기·로그인·
  화면 진입·에이전트**. 「비용 사고를 업무 사고로 바꾸지 않는다」가 이 설계의 전부다.
- 폴링 = **유휴 백오프만**. 기본 주기(칸반 30초·배지 60초)는 **건드리지 않는다**(현장 반응성 유지).

## 남은 일 (다음 세션 · 순서 중요)
1. **실측 1회** — `$env:CF_ANALYTICS_TOKEN='...'; $env:CF_ACCOUNT_ID='...'; npm run audit:cf-usage`
   → 지배 축 확정. 계단이 안 보이면 **남은 누수가 따로 있다**(그때 지배 축이 화면에 뜬다).
2. **배포** — `npm run build && npm run smoke` → `/deploy-verify`.
   ⚠️ **`barobill-cron` 워커는 따로 배포**해야 매시 예산 점검이 켜진다(Pages 배포로는 안 따라온다):
   `cd workers/barobill-cron; npx wrangler deploy`
3. 배포 후 확인 — `POST /api/cron/budget-check`(X-Agent-Key) 응답의 `cfRowsReadMonth`·`guard` 실측,
   `GET /api/settings/cost-guard` 가 `active:false`인지.
4. 대시보드 **Billing usage alert** 설정(앱 차단기와 이중화).
5. (선택) 실측 결과에 따라 임계 조정 — settings `budget_cf_rows_read_monthly` 등.

## 주의
- 차단기 상태는 **만료 시각**(`cost_guard_until`)이다. 「오늘 차단됨」 플래그로 바꾸지 말 것 — 푸는 사람이 없으면 영구히 남는다.
- 차단 판정은 **`X-Poll` 헤더**로 사람/자동을 가른다. 경로로만 막으면 화면 진입까지 죽는다.
- 새 화면에서 `setInterval` 로 직접 폴링 금지 → `window.MES_POLL.every(fn, baseMs)`.
