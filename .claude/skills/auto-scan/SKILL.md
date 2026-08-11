---
name: auto-scan
description: 프로덕션 MES 자동 스캔으로 비작동/오류 기능을 탐지해 GitHub Issue로 등록. 트리거: 자동 스캔, auto-scan, 스캔, 문제 찾아줘. 탐지·등록만 하고 코드는 고치지 않는다 — 수정까지 가려면 auto-improve.
context: fork
agent: general-purpose
background: false
---

# MES 자동 스캔 — 비작동 기능 탐지 + GitHub Issues 등록

프로덕션 MES를 체계적으로 스캔하여 비작동/오류 기능을 찾고 GitHub Issue로 등록한다.
"자동 스캔", "auto-scan", "스캔", "문제 찾아줘" 요청 시 사용.
코드 수정은 절대 하지 않음. Issue 등록만.

> **이 스킬은 격리 컨텍스트에서 돈다**(`context: fork`, 2026-08-11). 산출물이 **prod 런타임 사실**(HTTP 상태·콘솔
> 에러·쿼리 결과)이고 최종 형태가 **GitHub Issue**라 메인 대화가 중간 과정을 볼 이유가 없다. 따라서:
> - **대화 이력이 없다.** 이 문서에 적힌 것 + CLAUDE.md 만 보고 판단한다. 필요한 사실은 직접 조회할 것.
> - prod 로그인은 `admin` 계정(비번은 `C:\Users\user\.claude\projects\C--Users-user-dongsan-mes\memory\reference-test-login.md` 참조 — 이슈 #336 owner 위험수용, **비번 변경·재시드 금지**).
> - `background: false` = 이 턴 안에서 끝낸다. **Playwright MCP 는 용준님 실제 Chrome 세션에 붙을 수 있어** 백그라운드 동시 구동 금지(세션 파괴 동작도 금지).

## ⚡ 병렬 실행 규칙 (필수)

- **Phase 1 (API 검증)**: 엔드포인트를 도메인별 3묶음으로 나눠 `Agent(subagent_type:"Explore")` **병렬** dispatch (curl 기반, 브라우저 불필요) — 보고는 `경로 — 상태코드 — 오류 1줄`만 회수
- **Playwright 페이지 순회 Phase**: 브라우저 단일 인스턴스라 **순차 유지**, 단 API 병렬 검증과 동시 진행 가능
- 발견은 메인 루프가 전수 재현 확인 후 Issue 등록 (오탐 차단). 코드 수정 없음 원칙 유지

## 실행 순서

### Phase 1: API 엔드포인트 검증
아래 **검증 완료된 정확한 경로**로 프로덕션 API를 호출한다. Playwright가 아닌 `curl` 또는 `fetch`를 사용한다.

```
# 인증 토큰 취득 (테스트 계정)
POST /api/auth/login { username: "admin", password: "..." }

# 대시보드 (6개)
GET /api/dashboard/stats
GET /api/dashboard/stats/daily
GET /api/dashboard/stats/clients
GET /api/dashboard/stats/receivables
GET /api/dashboard/stats/today-due
GET /api/dashboard/stats/weekly-trend

# 주문 (3개)
GET /api/orders?page=1&limit=5
GET /api/orders/stats
GET /api/orders/{id}/invoice  (id=가장 최근 주문)

# 카드 (7개)
GET /api/cards?page=1&limit=5
GET /api/cards/kanban-summary
GET /api/cards/categories
GET /api/cards/board?limit=5
GET /api/cards/stats/daily
GET /api/cards/defects/list
GET /api/cards/schedule/queues

# 견적 (1개)
GET /api/quotations?page=1&limit=5

# 재고 (3개)
GET /api/inventory?page=1&limit=5
GET /api/inventory/stats/summary
GET /api/inventory/dashboard/zones

# 품목 (2개)
GET /api/items?page=1&limit=5
GET /api/items/categories

# 거래처 (1개)
GET /api/clients?page=1&limit=5

# 은행 (4개)
GET /api/bank/stats
GET /api/bank/transactions?page=1&limit=5
GET /api/bank/receivables
GET /api/bank/match-rules

# 법인카드 (6개)
GET /api/card-expenses/cards
GET /api/card-expenses/categories
GET /api/card-expenses/transactions?page=1&limit=5
GET /api/card-expenses/stats
GET /api/card-expenses/payment-schedule
GET /api/card-expenses/auto-rules

# 구매 (3개)
GET /api/purchase-orders?page=1&limit=5
GET /api/purchase-requests?page=1&limit=5
GET /api/purchase-requests/stats

# 출고 (2개)
GET /api/shipments?page=1&limit=5
GET /api/shipments/stats

# 세금 (1개)
GET /api/tax-invoices?page=1&limit=5

# 인사/급여 (5개)
GET /api/hr/employees?page=1&limit=5
GET /api/attendance/month?year={year}&month={month}
GET /api/payroll?page=1&limit=5
GET /api/leaves/balances
GET /api/insurance-reports?year={year}

# 자금 (3개)
GET /api/cash-flow/loans
GET /api/cash-flow/fixed-expenses
GET /api/vat/reports?year={year}

# 생산 (3개)
GET /api/production/stats
GET /api/print-events/stats?days=7
GET /api/print-events/agents

# 기타 (5개)
GET /api/settings
GET /api/settings/entity
GET /api/notifications/unread-count
GET /api/bom?page=1&limit=5
GET /api/activity-logs?page=1&limit=5
```

판정 기준:
- 200~399: 정상
- 400: 파라미터 누락일 수 있음 (정상 동작)
- 401/403: 인증/권한 문제 → Issue
- 500: 서버 에러 → Issue (CRITICAL)
- response.success === false + 500: 확실한 버그

### Phase 2: 코드 정적 분석 (subagent 1개)

subagent(Explore)에게 위임:

1. **entityFilter 누락**: `grep -rL "entityFilter\|getEntityId" src/routes/*.ts` → 법인 데이터 접근하면서 필터 없는 파일 탐지
2. **getElementById 불일치**: 최근 수정된 scripts/*.js의 getElementById 대상이 pages/*.ts에 있는지
3. **authMiddleware 누락**: `grep -rL "authMiddleware" src/routes/*.ts` → aggregator/webhook 제외하고 누락 탐지

### Phase 3: 데이터 정합성 (subagent 1개)

subagent에게 위임 (`npx wrangler d1 execute webapp-production --remote`):

```sql
-- 고아 레코드
SELECT COUNT(*) FROM order_items WHERE order_id NOT IN (SELECT id FROM orders);
SELECT COUNT(*) FROM cards WHERE order_id NOT IN (SELECT id FROM orders);
SELECT COUNT(*) FROM card_items WHERE card_id NOT IN (SELECT id FROM cards);

-- NULL entity_id
SELECT 'orders' as t, COUNT(*) FROM orders WHERE entity_id IS NULL
UNION ALL SELECT 'payments', COUNT(*) FROM payments WHERE entity_id IS NULL
UNION ALL SELECT 'shipments', COUNT(*) FROM shipments WHERE entity_id IS NULL;

-- 중복 번호
SELECT entity_id, order_number, COUNT(*) FROM orders GROUP BY entity_id, order_number HAVING COUNT(*) > 1;

-- E2E 잔류
SELECT COUNT(*) FROM cards WHERE item_name LIKE 'E2E%';
SELECT COUNT(*) FROM orders WHERE notes LIKE 'E2E%';
```

### Phase 4: 기존 이슈 중복 확인 + Issue 등록

```bash
gh issue list --state open --limit 50 --json number,title
```

발견 건마다:
1. 기존 이슈 제목과 비교 → 중복이면 스킵
2. 신규면 `gh issue create` 등록:
   - 라벨: `bug` 또는 `improvement` + `auto-scan` + `small`/`medium`/`large`
   - 제목: `[CRITICAL/HIGH/MEDIUM/LOW] 요약`
   - 본문: 증상, 영향, 수정 방향, 공수

### Phase 5: 결과 보고

```
MES 자동 스캔 결과 (YYYY-MM-DD)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
API 검증:    N/M 통과 (N 실패)
정적 분석:   N건 발견
데이터 정합: N건 이상
신규 Issues: N건 등록 (#xxx~#xxx)
중복 스킵:   N건
━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
