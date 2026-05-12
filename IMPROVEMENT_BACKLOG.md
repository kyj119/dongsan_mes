# Improvement Backlog
<!-- last_run_area: 2 -->
<!-- last_run_at: 2026-05-12T13:00:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | 4 |
| ✔️ done | 15 |
| ❌ rejected | 1 |

> **Area 1 프로덕션 헬스** (2026-05-12T10:00):
> - 전체 77개 ?raw JS 파일 syntax check 통과
> - 최근 커밋 `cd04d93`: orders.js `\'` 이스케이프 버그(전체 주문페이지 함수 실패) 수정 확인
> - 자동 수정: smoke.cjs에 quotations/hometax-invoices/search 3개 엔드포인트 추가
> - 이슈 생성: #15 스모크 커버리지 확대 (34개 미등록 라우트)
> - Playwright 미설치/외부 HTTP 차단으로 실시간 API 응답 직접 확인 불가

> **Area 2 코드 품질** (2026-05-12T13:00):
> - entity_id INSERT 누락 스캔: 15건 오탐 (order_items/quotation_items/clients/hometax_invoices 테이블에 entity_id 컬럼 없음 — 스키마 확인 필수 원칙 추가 필요)
> - authMiddleware 누락: 없음 (webhooks.ts는 외부 Webhook 의도적, printEvents는 agentKeyMiddleware)
> - N+1 쿼리: taxInvoices.ts 중첩 3중 루프 (Issue #21), inventoryCount.ts (Issue #22)
> - Dead code: models.ts 미사용 타입 14개 (Issue 등록 예정, 런타임 영향 없음)
> - SELECT *: 157개 사용처 (단순 조회 대부분, 비즈니스 영향 미미)

---

## 🆕 New

### [I-007] 스모크 테스트 커버리지 확대 — 미등록 라우트 34개 (Area 1, 2026-05-12)
- **현재**: `/api/quotations`, `/api/hometax-invoices` 등 34개 라우트 스모크 미등록
- **자동 수정**: quotations/hometax-invoices/search 3개 추가 완료
- **잔여**: bom/prices/facility/costs/tasks 등 8개 추가 필요
- **영향**: 핵심 기능 회귀를 스모크로 탐지 못함
- **공수**: 1시간
- **상태**: 🆕 (GitHub #15)

### [N-001] taxInvoices.ts 세금계산서 일괄 생성 O(N×M×K) 중첩 N+1 쿼리 (Area 2, 2026-05-12)
- **위치**: `src/routes/taxInvoices.ts:732-761`
- **증상**: `for (const order of orders)` 루프 안에 `SELECT order_items` + `for (oi)` 안에 `INSERT tax_invoice_items` 3중 중첩
- **영향**: 거래처 20개×주문 10건×품목 8개 = 1,620 D1 쿼리 (월말 일괄 발행 시 체감 지연)
- **수정**: `WHERE order_id IN (?)` 배치 SELECT + D1 batch API INSERT
- **공수**: 3시간
- **상태**: 🆕 (GitHub #21)

### [N-002] inventoryCount.ts 재고 실사 승인 for 루프 N+1 쿼리 (Area 2, 2026-05-12)
- **위치**: `src/routes/inventoryCount.ts:221-243` (승인), `88-93`, `156-168` (저장)
- **증상**: 각 재고 항목마다 UPDATE + INSERT 개별 호출 (항목 수 × 2 쿼리)
- **영향**: 실사 100품목 → 승인 시 200 쿼리
- **수정**: D1 batch API 일괄 처리
- **공수**: 2시간
- **상태**: 🆕 (GitHub #22)

### [D-001] models.ts 미사용 타입/enum 14개 dead code (Area 2, 2026-05-12)
- **위치**: `src/types/models.ts`
- **항목**: PricePolicyRule, ItemSubcategory, PostProcessingOption, BillingStatus, OrderType, QuotationStatus, OrderStatusHistory, CardStatusHistory, PurchaseOrderStatus, PurchaseRequestStatus, PurchaseRequestUrgency, InspectionWorkflowStatus, InspectionOverallResult, InspectionCheckResult
- **영향**: 런타임 0, TypeScript 타입 파일 복잡도 증가
- **수정**: 해당 타입 제거 (grep으로 미참조 확인됨)
- **공수**: 30분
- **상태**: 🆕 (Issue 미등록 — 낮은 우선순위)

---

## 🔴 Bugs / Issues

(모두 처리 완료 — Done 섹션 참조)

---

## ✔️ Done (처리 완료)

| ID | 제목 | 커밋 | Issue |
|----|------|------|-------|
| A-002 | smoke.cjs 3개 엔드포인트 추가 (quotations/hometax/search) | 256e37c | #15 |
| A-001 | entity_id INSERT 14건 누락 | c7c20d3 | - |
| B-001 | cards entity_id 격리 | 0960a5a | #1 |
| B-002 | LogWatcher URL + 서비스 실행 | (설정 수정) | #2 |
| B-003 | SHIPPED 카드 확인 모달 | 3dd4274 | #11 |
| B-004 | cards entity_id NULL 32건 보정 | (prod SQL) | #12 |
| I-001 | bank.ts N+1 제거 | 0960a5a | #3 |
| I-002 | autoProcess.ts N+1 제거 | 0960a5a | #4 |
| I-003 | approvals.ts N+1 제거 | 0960a5a | #5 |
| I-004 | clients API 응답 통일 | 0960a5a | #6 |
| I-005 | 로그인 rate limit 적용 | 44c1f04 | #13 |
| I-006 | hr.ts 에러 메시지 제네릭화 | 44c1f04 | #14 |
| F-001 | 거래처 필터 5개 | 575312d | #7 |
| F-002 | 주문 필터 CANCELLED 해소 | 575312d | #8 |
| F-003 | 대시보드 KPI 5개 | 575312d | #9 |

## ❌ Rejected

| ID | 제목 | 사유 |
|----|------|------|
| F-004 | 납품시간 disabled 이유 표시 | 용준님: "필요 없음" | #10 |

---

## 상태 변경 가이드

| 상태 | 의미 | 누가 변경 |
|------|------|----------|
| 🆕 new | 에이전트가 발견, 미검토 | auto-improve |
| 👀 reviewed | 용준님이 봄, 판단 보류 | 용준님 |
| ✅ approved | 진행 허가 | 용준님 |
| 🔨 in-progress | 구현 중 | Claude |
| ✔️ done | 완료, 배포됨 | Claude |
| ❌ rejected | 불필요 / 부적절 | 용준님 |
