# 설계 결정: 코드·도메인 (J~T)

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

- `/deploy` 스킬 Step 4 직전에 `.claude/scripts/deploy-snapshot.sh` 실행
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
