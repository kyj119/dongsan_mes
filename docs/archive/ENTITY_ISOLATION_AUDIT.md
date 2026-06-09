# 법인(Entity)별 분리 점검 리포트 — 2026-05-11

> 목적: 멀티 entity (다중 사업자) 환경에서 데이터가 entity별로 격리되어 작동/표기되는지 점검.
> 범위: 전체 라우터 (백엔드) + 핵심 페이지 (UI).

## 요약

| 영역 | 상태 |
| --- | --- |
| 백엔드 SELECT (entityFilter) | ✅ 24개 라우터 적용 |
| 백엔드 INSERT (entity_id 명시) | ⚠️ 일부 라우터 누락 — DEFAULT 1로 흘러감 |
| UI entity 라벨/전환 | 🔍 추가 점검 필요 (별도 항목) |
| 공통 마스터 (clients/items) | ℹ️ entity_id 없음 — 공통 마스터로 운영 (디자인 결정 확인 필요) |

---

## 1. SELECT 측 — entityFilter 적용 라우터 (24개) ✅

orders, cards, quotations, tax_invoices, bank, cashFlow, cashReceipts, cashSchedule, dashboard, fax, financialReports, hometaxInvoices, ledger (AR/AP), paymentRequests, payroll, purchaseOrders, reports, settings, shipments, vatReports 등 — 모두 정상.

## 2. INSERT 측 — entity_id 명시 누락 ⚠️

`schema에 entity_id INTEGER DEFAULT 1`이므로 누락 시 자동 1번 entity로 들어감. 이는 다음과 같은 문제 발생:

- 1번 entity 외에서 활동하는 사용자가 새로 만든 발주/입출고가 자기 entity가 아닌 1번에 기록
- SELECT 시 entityFilter로 필터링되면 본인은 못 봄

### 누락된 INSERT 위치

| 파일 | 라인 | 테이블 | 영향 |
| --- | --- | --- | --- |
| `src/routes/inventory.ts` | 334, 445, 575, 654 | inventory_transactions | 입출고/조정 |
| `src/routes/inventoryCount.ts` | 231 | inventory_transactions | 재고 조정 |
| `src/routes/orders/queries.ts` | 241 | inventory_transactions | 출고 시 재고 차감 |
| `src/routes/purchaseOrders/core.ts` | 1458 | inventory_transactions | 입고 처리 |
| `src/routes/purchaseOrders/core.ts` | 1568, 1737, 1860 | purchase_orders | 발주 신규 (1건만 entity_id 명시) |
| `src/routes/purchaseOrders/templates.ts` | 216 | purchase_orders | 템플릿 발주 |
| `src/routes/purchaseRequests.ts` | 565, 716 | purchase_orders | 발주요청→발주 변환 |
| `src/routes/taxInvoices.ts` | (1건) | tax_invoices | 일부 INSERT 1건 누락 |

### INSERT 측 OK ✓

orders/core.ts, bank_accounts, payment_requests, payments, adjustments, purchase_payments, payroll/core.ts, cash_receipts, quotations (방금 추가) 모두 entity_id 명시.

---

## 3. 공통 마스터 (entity_id 없는 테이블) ℹ️

다음 테이블은 entity_id 컬럼이 없음 — **모든 entity가 공유**:

- `clients` (거래처) — 모든 사업자가 같은 거래처 풀을 공유
- `items` (품목) — 같은 품목 마스터
- `print_methods`, `print_media`, `finishing_methods` — 인쇄 설정
- `users`, `roles`, `permissions` — 사용자/권한

이게 의도된 디자인인지 사용자 결정 필요. **일반적으로는 공통 마스터가 자연스러움** (한 회사의 거래처/품목은 모든 법인이 공유).

만약 **법인별 거래처 분리**가 필요하면 별도 마이그레이션 + UI 변경 큰 작업.

---

## 4. UI 측 점검 (Claude in Chrome 권장)

### 점검할 항목
- [ ] 헤더/사이드바에 **현재 entity 라벨** 표시
- [ ] entity 전환 드롭다운/메뉴 (관리자가 여러 법인 관리 시)
- [ ] 거래명세서/세금계산서/견적서 인쇄 시 **해당 entity 정보**로 출력
- [ ] 인쇄 시 entity별 **로고 / 인감 / 사업자번호** 정확히 매핑
- [ ] 거래처 원장에서 entity별 잔액 분리
- [ ] 자금 관리 (bank.ts) 페이지 entity별 계좌 표시

### 핵심 점검 페이지
- `/settings` — 현재 entity 정보 편집 + 로고 (오늘 옮긴 곳)
- `/ledger` — 거래처 원장 (entityFilter 적용됨)
- `/tax-invoices` — 세금계산서 발행 (entity별 발신자 정보)
- `/orders/:id/invoice` — 거래명세서 (entity 로고/인감/주소)
- `/quotation/:id` — 견적서 (entity 정보)
- `/purchase-invoice/:poId` — 발주 인보이스

---

## 5. 권장 조치 (우선순위 순)

### 우선순위 1 (즉시) — 데이터 정합성

**inventory_transactions 5건 + purchase_orders 5건 INSERT에 entity_id 추가**

- 영향: 입출고/발주 데이터가 잘못된 entity로 기록되는 문제
- 작업량: 라인별 INSERT 컬럼 추가 + bind 값 추가 (각 30분)
- 위험: 낮음 (단순 추가, 기존 동작 호환)

### 우선순위 2 (다음 세션) — UI 검증

**현재 entity 전환 / 라벨 표시 UI 점검**

- Claude in Chrome으로 헤더, 인쇄 페이지, 원장 페이지 클릭하면서 entity 표시 확인
- 누락된 곳 있으면 추가

### 우선순위 3 (검토 후) — 공통 마스터 정책 확정

- clients/items가 공통 vs 분리 — 사용자 결정
- 분리 필요 시 별도 마이그레이션 (대형 작업)

---

## 다음 액션

**(가)** 우선순위 1 (INSERT 수정) 지금 진행 — 30분~1시간
**(나)** 일단 리포트로 두고 다음 세션에서 진행
**(다)** 우선순위 1 + UI 점검까지 한 세션에 — 시간 부담 큼

추천: **(가)** — 데이터 정합성 즉시 회복. UI 점검은 다음 세션 또는 ④ 한진택배 로드맵 다음에.
