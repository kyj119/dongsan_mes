# 설계 결정: 코드·도메인 (J~BD)

> 최종 갱신: 2026-06-19 (6월 결정 AX~BD 추가)

## J. ledger.ts 도메인 분리 AR/AP (2026-04-15)

aggregator 패턴으로 2파일 분할:
```
src/routes/ledger.ts              # 20줄 thin aggregator
src/routes/ledger/
  accounts-receivable.ts          # 매출/입금/수금/감액/미수금 (25 routes)
  accounts-payable.ts             # 매입/지급/감액/정합성 (13 routes)
```
URL 호환: `ledgerRouter.route('/', arRouter)` + `ledgerRouter.route('/', apRouter)` → `/api/ledger/*` 불변.

---

## K. orders.ts 관심사 분리 (2026-04-15)

```
src/routes/orders.ts              # 24줄 aggregator
src/routes/orders/
  core.ts                         # CRUD + 상태/청구/타임라인/세금계산서 (~1750줄)
  queries.ts                      # stats/견적만료/출고대기/옵션/일괄/CSV (~300줄)
  operations.ts                   # copy/convert-to-order/send-email (~400줄)
```

**마운트 순서 주의**: Hono는 먼저 등록된 라우트 우선. `/:id`가 `/stats`를 섀도잉하므로 **구체 경로 먼저**.
```ts
ordersRouter.route('/', ordersQueriesRouter)    // /stats 등 먼저
ordersRouter.route('/', ordersOpsRouter)        // /:id/copy 등
ordersRouter.route('/', ordersCoreRouter)       // /:id 가장 마지막
```

---

## L. Claude hooks 설정 (2026-04-15)

1. **Stop hook**: 미커밋 감지→`/sync-docs` 안내 + `.edit_counter` 정리
2. **PostToolUse counter**: 같은 파일 3회 수정→PROJECT_STATUS 체크포인트 유도
카운터: `.claude/.edit_counter`에 append → `grep -Fxc`로 카운트

---

## M. 배포 스냅샷 및 롤백 (2026-04-15)

- `/deploy-verify` 스킬 배포 직전에 `.claude/scripts/deploy-snapshot.sh` 실행
- 저장: `.claude/deployments/deploy_YYYY-MM-DD_HHmmss.json` (commit, migration, changed_files)
- 롤백: Cloudflare Pages 대시보드→이전 배포 | 역방향 마이그레이션 SQL | D1 Time Travel (30일)

---

## N. 서브 라우터 자급자족 원칙 (2026-04-15)

**각 서브 라우터가 본인의 authMiddleware를 적용**. Aggregator는 얇은 연결자.

```ts
// ✅ 서브 라우터 자급자족
const arRouter = new Hono()
arRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// aggregator (auth 없음)
ledgerRouter.route('/', arRouter)
```

예외: `payroll/shared.ts` 같은 순수 헬퍼 모듈은 라우터 없으므로 auth 없음.

---

## O. 검수 워크플로우 상태 정의 (2026-04-15)

**inspection_status** 5값:

| 값 | 의미 | 다음 |
|---|-----|------|
| NULL | 미검수 | → NORMAL/PENDING_REVIEW |
| NORMAL | 정상 완료 | (종결) |
| PENDING_REVIEW | 수량 부족→관리자 결정 대기 | → NORMAL/WAITING_RESHIP/CANCELLED |
| WAITING_RESHIP | 재입고 대기 | (종결) |
| CANCELLED | 전량 취소 | (종결) |

상태 전이 보호: `WHERE inspection_status IS NULL OR = 'PENDING_REVIEW'`

---

## P. 수량 중심 검수 전환 (2026-04-15)

- 기본 검수 = **수량만 확인**. 품질 템플릿은 ADMIN 선택 기능.
- POST /api/inspections/results에 `mode: 'quantity_only'` 추가.
- 사이드바 `/inspections`: ADMIN 전용, label "검수 템플릿 (고급)".

**PO → 검수 → 입고 흐름**:
```
발주 CONFIRMED → 입고 처리 (received/rejected qty)
  → 수량 확인 모달 (1초 딜레이)
    → [확정] rejected>0 → PENDING_REVIEW, 0 → NORMAL
    → [나중에] → NULL, 24h 후 배지
  → PENDING_REVIEW 시 관리자: 부분수령/재입고/전량취소
```

DB 스키마 미변경 (기존 inspection 테이블 유지, 향후 품질 검수 복귀 가능).

---

## Q. 권한 모델 (2026-04-16)

### 두 층 가드
1. **인증** (`authMiddleware`): JWT 검증
2. **페이지 접근** (`requirePagePermission(pageKey)`): 역할×페이지 매트릭스 (DB 관리, ADMIN UI)
3. **쓰기 권한** (`requireRole(...)`): POST/PUT/DELETE에 하드코딩

### DB
- `permission_pages`: (page_key, page_label, page_section, sort_order)
- `role_page_permissions`: (role, page_key, can_access) — PK (role, page_key)
- ADMIN은 항상 통과 (매트릭스 무시)

### 캐시
- 메모리 Map<role, Set<page_key>>. `PATCH /api/permissions`시 invalidate.
- ADMIN은 캐시 미사용 (페이지 추가 즉시 반영).

### 신규 페이지 절차
1. 마이그레이션에 `permission_pages` INSERT
2. 라우트에 `requirePagePermission('/path')` 추가
3. ADMIN은 자동 허용, 나머지는 `/permissions` UI에서 부여

---

## R. 재고차감 ROLL/SHEET 이원 구조 (2026-04-25)

- **ROLL**: yd 단위. `Math.ceil(yd * 10) / 10` (0.1yd 올림). 폭 매칭 자동 (width_mm).
- **SHEET**: ㎡ 단위. 10cm올림→면적→`Math.ceil(sqm * 100) / 100` (0.01㎡ 올림).
- **판별**: `selected_material_id` 존재→SHEET, 없으면→ROLL.
- **합배치**: 같은 주문+같은 원자재 → 면적 합산 후 1회 차감.
- **표시**: ROLL 고정길이="X롤+Yyd", 가변="Xyd" | SHEET="X장 (Y㎡)"

---

## S. category_id TEXT 통일 (2026-04-25)

- `category_id`(FK) 의존 제거, `i.category` TEXT 직접 사용.
- `item_categories`/`item_subcategories` 삭제 안 함 (레거시 호환).
- GOODS 타입: `is_sales_item=1, is_purchase_item=1` 자동 설정.

---

## T. DOM 참조 가드 패턴 (2026-04-28)

```js
// ✅ 권장 (console.warn 탐지 가능)
var el = document.getElementById('someId');
if (!el) { console.warn('[pageName] #someId not found'); return; }

// ❌ 기존 silent fail
if (el) el.textContent = value;
```

기존 코드 소급 적용 안 함. 파일 수정 시 점진 적용.

## Y. entity_id INSERT 의무화 (2026-05-09, 보완 2026-05-19)

모든 트랜잭션 테이블에 entity_id 컬럼 + entityFilter SELECT + getEntityId INSERT.

- 2026-05-09: 14건 누락 수정 (orders, cards, payments 등)
- 2026-05-19: fixed_expenses, loans 추가 (마이그레이션 0230), cashFlow.ts 전 CRUD 적용

UNIQUE 제약도 entity_id 포함 필요 (예: vat_reports → 마이그레이션 0229).

## AA. vat_reports UNIQUE 재생성 (2026-05-19)

`UNIQUE(report_year, report_quarter)` → `UNIQUE(report_year, report_quarter, entity_id)`.
SQLite ALTER TABLE 불가 → 테이블 재생성 패턴 사용 (CREATE new → INSERT SELECT → DROP old → RENAME).

## AB. db.batch() 원자성 강화 (2026-05-19)

D1은 완전한 트랜잭션 미지원. 다중 테이블 UPDATE 시 `db.batch()`로 단일 네트워크 왕복 처리하여 부분 실패 확률 최소화.

적용: paymentRequests (approve, pay), approvals (approve, reject).

## AC. 백업 토큰 분리 (2026-05-19)

GitHub Actions 시크릿을 용도별 분리:
- `CLOUDFLARE_API_TOKEN` — 배포용 (Workers 권한)
- `CLOUDFLARE_BACKUP_TOKEN` — 백업용 (D1 Edit + R2 Edit 권한)

## AG. QR 스캔 코드 체계 (2026-05-21)

- 라이브러리: `html5-qrcode` CDN 동적 로드 (번들 미포함)
- 코드 접두사 규칙:
  - `CARD:{card_id}` — 생산 카드
  - `ITEM:{item_code}` — 자재/상품
  - `EQ:{equipment_id}` — 설비
  - `ORDER:{order_number}` — 주문

## AH. 견적 추천 단가 (2026-05-21)

- 기준: 최근 3개월, 전체 거래처 평균 판매가
- 원가(cost) 필드 프론트엔드 노출 금지
- 이유: 거래처별 단가 차등이 없는 경우가 많고, 원가 노출은 보안 위험

## AS. orders/cards UNIQUE entity 분리 (2026-05-26)

SQLite `ALTER TABLE`로 UNIQUE 제약 변경 불가 → 테이블 재생성 패턴 (마이그레이션 0262).

- **변경**: `UNIQUE(order_number)` → `UNIQUE(entity_id, order_number)`
- **적용 대상**: orders, cards 테이블
- **목적**: 법인별 주문/카드 번호 중복 허용 (entity 필터링 기반)
- **마이그레이션 패턴**: CREATE TABLE new_orders AS SELECT * FROM orders; DROP TABLE orders; ALTER TABLE new_orders RENAME TO orders;

## AT. 직원 소프트 삭제 (2026-05-26)

직원 정보 완전 삭제 대신 소프트 삭제로 감사 추적 보존.

- **스키마**: `is_deleted` (0/1), `deleted_at` (TIMESTAMP), `deleted_by` (user_id FK)
- **자식 테이블**: 변경 없음 (payment_requests, work_records 등에서 참조 유지)
- **조회**: 모든 SELECT에 `WHERE is_deleted=0` 추가 (공통 유틸 함수)
- **이유**: 결재 이력, 작업기록 등 연관 데이터 보존 필요

## AU. createPayment 읽기/쓰기 분리 (2026-05-26)

결제 전표 생성 로직을 검증(읽기 전용)과 실행(쓰기)으로 명확히 분리.

```ts
// 읽기: 상태 검증, 조건 확인
validatePayment(paymentRequest): ValidationError | null

// 쓰기: 전표 생성, 잔액 업데이트
preparePaymentStatements(paymentRequest): { creditJournal, debitJournal }

// 호출부: 외부 batch() 포함 가능
const statements = preparePaymentStatements(...);
db.batch([...otherUpdates, ...statements])
```

- **이점**: 배치 트랜잭션 유연성 증대, 테스트 용이
- **적용**: approval.ts, paymentRequests.ts 전 payment 관련 로직

## AV. 견적→수주 낙관적 잠금 (2026-05-26)

견적서 변환 중 동시 수정으로 인한 데이터 불일치 방지.

- **스냅샷**: 변환 시작 시 `quotations.updated_at` 기록
- **검증**: 변환 전 SELECT하여 `updated_at` 일치 확인
- **충돌**: 불일치 시 409 Conflict 반환 (사용자가 새로고침 후 재시도)
- **구현**: UPDATE WHERE updated_at = ? (Atomic UPDATE WHERE 패턴)
- **이유**: 견적→수주 변환 후 주문 수정 불가 (immutable snapshot)

## AW. cash_receipt 취소 시 역산 불필요 (2026-05-26)

현재 시스템에서 영수증 발행 시 balance/journal을 사용하지 않으므로, 취소 시 역산 로직 불필요.

- **현황**: `createCashReceipt` 시 db.updateAt(...)로 balance 변경 없음
- **영수증 취소**: UPDATE는_deleted=1 처리만 수행
- **향후**: 회계 연동 시 journal 역산 로직 재검토 필요
- **근거**: 영수증은 현금 흐름 기록이며, A/R settlement와 독립적

## AX. 청구 법인 분할 = 담당 생산법인 기준 (2026-06-11, split-billing)

- 청구법인 = `orders.entity_id`(접수 법인) 단일 → **품목 `assigned_entity_id`별 생산법인 분할 청구**. 한 주문이 동산·선명 섞이면 각 법인이 자기 몫 직접 청구.
- 물리 모델: `order_billing_groups`(주문×법인, `UNIQUE(order_id,entity_id)`, 마이그 0305). 청구·매출·미수금 집계의 entity 기준이 `orders.entity_id` → `order_billing_groups.entity_id`로 이동.
- 정본: `docs/superpowers/specs/2026-06-10-split-billing-by-entity.md`.

## AY. clients.balance 캐시 폐기 → 파생 (2026-06-11)

- `clients.balance` 단일 캐시는 **법인 무구분** 버그(split-billing 무력화) → 폐기.
- 미수금 = **(거래처×법인)별 파생** = `Σ billing_groups[BILLED] − payments − adjustments` group by (client_id, entity_id). `clients.balance` 컬럼은 전환기 레거시 잔존(P5 검증 후 제거 예정).

## AZ. billing_status 비교는 IS NOT 사용 (NULL 함정) (2026-06-11)

- `billing_status`는 NULL(미청구)을 가지므로 `!= 'BILLED'`는 NULL 행을 누락(SQLite 3치 논리). **`IS NOT 'BILLED'` / `IS NOT 'PAID'`** 사용해야 NULL도 매칭.
- 적용: `orders/queries.ts:165,175` (그룹 일괄 청구확정 UPDATE 가드).

## BA. 출고일 권위 소스 = COALESCE(shipments→cards→폴백) (#380)

- 주문 출고일은 단일 컬럼이 아니라 **`COALESCE(MAX(shipments.shipped_at), MAX(cards.shipped_at), 폴백)`** 우선순위로 도출.
- 적용: `dashboard.ts:57-58`. 카드 출고(card 경유)·주문단위 출고(shipment 직접) 두 경로를 모두 포괄.

## BB. IA 자동가공 게이트 `ia_auto_enabled` (#377)

- `settings.ia_auto_enabled` 플래그(기본 `0`=OFF, 마이그 0308). OFF면 `/api/auto-process/pending`이 폴링 에이전트(IllustratorAutomat)에 **빈 목록** 반환 → 자동가공 정지.
- 운영 절차: OFF(기본) → stale pending 정리 → 수동 테스트 1건 → `PATCH /api/settings`로 ON(1).

## BC. bleed = 디자인 미세확대 (createEdgeStrip 폐기) (2026-06)

- IA 편집기/네스팅(N-series) 경로의 도련은 **Design 클립 마스크를 중심에서 미세 확대**(`SheetLayout.jsx expandClipInGroup`, 실패 시 스케일 확대 폴백)로 통일.
- 레거시 `ProcessOrderItem.jsx createEdgeStrip`(가장자리 1mm 스트립 복제·스트레칭) 방식은 편집기 경로에서 폐기. spec `2026-06-16-ia-editor-nesting-intake.md:157` "bleed=중심 미세확대".
- finishing(마감 여백)은 bleed와 별개 — 빈 공간 확장 + 경계선(M100 0.6pt), 디자인 확대 아님.

## BD. 정적 에셋 외부화 재시도 금지 (2026-06-11)

- `/static/shell.js` 등 정적 에셋 외부화는 CF Pages **git push 자동빌드**에서 `_routes.json` 제외가 미적용 → 워커가 Content-Type 없이 서빙 → MIME 실행 거부 → 전 페이지 401·무한로딩. prod 2회 다운.
- **현행 = `?raw` 워커 인라인 복귀**(24bb493c). 재외부화 금지. 해제 조건 = `docs/superpowers/specs/2026-06-11-static-assets-rootcause-redesign.md`의 근본 재설계 선행.

## BE. DB 마스터 존재 선택지는 UI 하드코딩 금지 — API 로드 (2026-06-12)

- 법인(`entities`)·CAPS 사이트(`caps_sites`) 등 **DB 마스터가 있는 선택지는 프론트에 하드코딩하지 말고 API에서 로드**.
- 구현: 법인 select = `loadEntities()` 공용 캐시(`scripts/layout/shell.js:520~598`, `/api/entities`). CAPS 사이트 = `axios.get('/api/caps/sites')`(`capsSettings.js`). 하드코딩 시 마스터 변경(오다플래그 entity 4 추가 등) 미반영.
