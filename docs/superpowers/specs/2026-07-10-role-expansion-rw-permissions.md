# 사용자 역할 확장 + 읽기/쓰기 권한 분리

- **작성일**: 2026-07-10
- **상태**: **✅ prod 배포완료 (2026-07-10, main `5e4a048d`)** — Phase 0~2 + Option A enforcement(4역할 핵심). 0453 remote 적용·apex 검증. 잔여 tail(paymentRequests·tax·vat·AP·cashFlow)만 후속.
- **⚠️ prod 마이그 교훈**: 0453 seed `/production-board`가 prod permission_pages 미존재 → INSERT OR IGNORE가 FK위반 미무시 → 전체 롤백(prod 무변). 수정=seed를 CTE+`WHERE page_key IN (permission_pages)` 필터. 신규 seed는 FK 참조 존재필터 필수.
- **Phase 2 인프라**: `rpp.can_edit` + 미들웨어 `requirePageEdit`/`requireEditOrRole`/`getEditablePages`(캐시 access|edit) + `/matrix`·PATCH·`/me` can_edit + permissions.js [열람][편집] 2체크박스·역할탭 7개 동적화.
- **Enforcement 배선 원칙(A) — 실측 반영**: 매트릭스 seed 가 과거 requireRole 권한보다 **좁음**(MANAGER 매트릭스에 /orders·/clients 없음, 로컬 실증). 순수 requirePageEdit 치환 시 MANAGER 회귀 → **가산형 `requireEditOrRole(pageKey, ...legacyRoles)`** 채택: ADMIN·legacyRoles 는 종전 그대로, 신규역할은 매트릭스 can_edit 로 통과(회귀 0). 삭제·토글·포털·크레딧·청구 등 민감/재무는 `requireRole` 유지.
- **요청**: "사용자 역할이 조금 더 분리되었으면 좋겠어"
- **채택안**: 옵션 B (역할 8개 + 읽기/쓰기 구분 + 사이드바 매트릭스 일원화), MANAGER 유지

---

## 배경 / 현재 구조

권한이 3계층으로 결정되며, 런타임 사이드바 필터는 **이미 DB 매트릭스 기반**이다.

| 계층 | 위치 | 편집 방법 | 상태 |
|------|------|----------|------|
| ① DB 매트릭스 | `role_page_permissions` + `/permissions` UI | 관리자 화면에서 on/off | 유연 (유지) |
| ② 메뉴 하드코딩 | `src/layout/menu.ts` `roles:[...]` | 코드+배포 | **죽은 코드** — `sidebar.ts`는 전 항목 렌더, `roles` 미참조. `shell.js` `applyPagePermissions()`가 `/api/permissions/me`로 100% 필터 |
| ③ 역할 정의 | `src/types/roles.ts` `ROLES`(4) + CHECK(0001 users, 0136 rpp) | 코드+마이그 | 확장 대상 |

**결론**: 사이드바 이중 SSOT는 사실상 없음(②는 vestigial). 실제 작업은 ③ 역할 확장 + 매트릭스 seed + 읽기/쓰기(can_edit) 추가.

### 사용자 요구 (확정)
1. 디자인·매니저 외에 **경리·영업** 등 직무별 역할이 필요
2. 목표 역할: 경리·영업·오퍼레이터·후가공·디자인·배송·관리자
3. **법인/부서 데이터 격리(서로 주문 못 봄)는 불필요** — 역할=메뉴 노출 범위 용도
4. 읽기/쓰기 구분 필요 (earlier multiSelect에서 선택; "보기만 vs 수정")

---

## 역할 정의 (8개, MANAGER 유지)

| 한글 | 코드 | 성격 |
|------|------|------|
| 관리자 | `ADMIN` | 전체 (기존, 매트릭스 우회) |
| 중간관리자 | `MANAGER` | 기존 유지 (기존 사용자·데이터 보존, 위험0) |
| 디자인 | `DESIGNER` | 기존 |
| 오퍼레이터 | `OPERATOR` | 기존 |
| 경리 | `ACCOUNTANT` | **신규** |
| 영업 | `SALES` | **신규** |
| 후가공 | `FINISHING` | **신규** |
| 배송 | `SHIPPING` | **신규** |

### 신규 4역할 기본 매트릭스 seed (관리자가 화면에서 미세조정 가능)

| 역할 | 기본 열람 페이지 (page_key는 구현 시 permission_pages 실제 키로 확정) |
|------|------|
| `ACCOUNTANT` | 회계·미수금·세금계산서·현금영수증·카드·매입·자금예측 (+거래처 열람) |
| `SALES` | 주문·견적·거래처·단가·품질/클레임·출고조회 |
| `FINISHING` | 현장카드·후가공/마감·생산현황 |
| `SHIPPING` | 출고/배송·출고대시보드·출고검수·합포장(/pack) |

> 급여/인사·권한관리(/permissions, HARD_ADMIN_ONLY)는 신규 역할에 미부여.

---

## Phase 계획

### Phase 0 — 역할 정의 확장 (foundation)
- `src/types/roles.ts`: `ROLES`에 4개 추가(총 8) + `ROLE_LABELS: Record<string,string>` 신설(한글). 주석의 "4곳 동시 갱신" 규칙 갱신.
- 마이그레이션 1개 (신규 번호):
  - `role_page_permissions` CHECK → 8역할 재빌드 (리프 테이블, FK child 없음 → 안전). `0136`/`0138` 참조.
  - **`can_edit INTEGER NOT NULL DEFAULT 0`** 컬럼 추가. 기존 행 백필: `UPDATE role_page_permissions SET can_edit = can_access` (열람 가능하던 역할은 편집도 유지 → 현행 무변).
  - `users.role` CHECK 완화 (0001 정의). ⚠️ **유일 위험지점** — 아래 참조.
  - 신규 4역할 기본 매트릭스 `INSERT OR IGNORE` seed.

### Phase 1 — 배선 정리
- `src/scripts/layout/shell.js` L508 `__roleMap`에 신규 라벨 4개 추가.
- `src/scripts/users.js`: 역할 드롭다운을 `ROLES`/`ROLE_LABELS` 파생으로. (현재 하드코딩 확인 필요)
- `src/routes/approvals.ts` L208: 하드코딩 `['ADMIN','MANAGER','DESIGNER','OPERATOR']` → `ROLES`/`ROLE_SET` 참조.
- (선택) `src/layout/menu.ts` 죽은 `roles` 배열 정리 — 동작 무변, 후순위.
- `permission_pages`에 각 신규 역할이 접근할 페이지 키가 모두 등록돼 있는지 확인.

### Phase 2 — 읽기/쓰기 구분
- `src/routes/permissions.ts`:
  - `/matrix` GET: `can_edit` 포함 반환.
  - `PATCH /`: body에 `can_edit` 수용·저장 (ON CONFLICT UPDATE).
- `src/pages/permissions.ts` + `src/scripts/permissions.js`: 페이지×역할 셀을 **[열람][편집]** 2체크박스로. (편집=열람 종속: 편집 체크 시 열람 자동 on)
- `src/middleware/permissions.ts`: `requirePageEdit(pageKey)` 신설 — `role_page_permissions.can_edit=1` 확인. ADMIN 우회. 캐시(`_cache`)를 `Set<pageKey>` → `Map<pageKey,{access,edit}>` 구조로 확장 or 별도 edit 캐시.
- **우선 배선(점진)**: 민감 쓰기 엔드포인트부터 — 단가(priceList) · 거래처(clients) · 급여(hr/payroll). 전체 라우트 일괄 아님. 나머지는 후속.

### Phase 3 — 검증
- `npm run build && npm run smoke`.
- 각 역할 테스트 계정 로그인 → 메뉴 노출/차단·편집 차단 스모크 (Playwright).
- `.claude/design-decisions.md` + auto-memory 기록, PROJECT_STATUS 갱신.

---

## ⚠️ 위험/주의

1. **users.role CHECK 재빌드** — `users`는 다수 테이블이 FK로 참조(`users(id)`). SQLite/D1은 CHECK 변경에 테이블 재빌드(12-step) 필요. 메모리 `feedback-d1-fk-column-removal`상 D1 users 재빌드는 위험. 
   - 착수 시 **먼저 `PRAGMA table_info(users)` + 현재 CHECK 확인**, 로컬 D1에 dummy id로 선검증(`feedback-sibling-incomplete-sweep`).
   - 대안 검토: (a) 8역할 CHECK로 재빌드 vs (b) CHECK 제거 후 app-level `ROLE_SET` 검증에만 의존(0136 PATCH가 이미 검증). FK child 때문에 `PRAGMA foreign_keys=OFF` 필요 여부 확인.
2. **마이그 멱등성** — `feedback-migration-idempotency`: ALTER 중복 주의. prod는 `execute --file` 직접 적용 가능성.
3. **can_edit 백필 시점** — 컬럼 추가와 동일 마이그에서 `UPDATE ... SET can_edit=can_access` 순서 보장.
4. **캐시 무효화** — 매트릭스/역할 변경 후 `invalidatePermissionCache()` 호출 유지.

## Touchpoint 체크리스트 (roles.ts 주석 규칙 확장판)
신규 역할 추가 시 동시 갱신: `types/roles.ts` · migration CHECK 2곳(users 0001계열, rpp 0136계열) · `permissions.ts` API 검증 · `permissions.js`/`permissions.ts`(페이지) UI · `shell.js __roleMap` · `users.js` 드롭다운 · `approvals.ts` 역할배열.

## 🔬 구현 노트 (2026-07-10 실측 — 설계 변경)

**users 테이블 재빌드 불가 확정 (로컬 D1 2회 실증).**
- `wrangler d1 execute --file` 은 FK 를 강제한다. RESTRICT 자식(orders/quotations/order·card_status_history 의 created_by/updated_by/confirmed_by/changed_by)이 있는 상태에서 `DROP TABLE users` → `FOREIGN KEY constraint failed (SQLITE_CONSTRAINT_TRIGGER)` 로 실패.
- `PRAGMA foreign_keys=OFF` 를 파일 첫 줄에 넣어도 무력(wrangler 가 파일을 트랜잭션으로 래핑 → pragma no-op). → 0448 경고가 정확. prod 도 execute --file 경로라 동일.
- ∴ users.role CHECK 완화(재빌드)는 이 환경에서 불가.

**채택한 우회 = `users.job_role` 신규 컬럼 (0453).**
- `ALTER TABLE users ADD COLUMN job_role TEXT` (무 CHECK, FK 무관 → 완전 안전). backfill `job_role=role`.
- 로그인/`/me` SELECT 를 `COALESCE(job_role, role) AS role` 로 aliasing → JWT.role = 확장역할. **하위 권한/메뉴 코드 전부 무수정**(payload.role 그대로 사용).
- users CRUD: 확장역할은 `job_role` 에 저장, `role` 컬럼엔 `toLegacyRole()`(레거시면 그대로, 아니면 'OPERATOR') 로 CHECK-안전값. 조회는 COALESCE. 마지막-ADMIN 가드도 COALESCE.
- `role_page_permissions` 는 리프 테이블 → 재빌드 안전(로컬 실증 통과). CHECK 제거 + can_edit 추가 + 기존행 can_edit=can_access 백필.

**로컬 검증 통과**: typecheck+build, job_role 5/5 백필, 신규4역할 seed(경리13/9·영업8/5·후가공7/3·배송7/4), 기존역할 무변, E2E(SALES 사용자→effective_role=SALES→매트릭스 정확).

**구현 파일**: `types/roles.ts`(8역할+ROLE_LABELS+toLegacyRole) · `migrations/0453_role_expansion_rw.sql` · `routes/auth.ts` · `routes/users.ts` · `pages/users.ts` · `scripts/users.js` · `scripts/layout/shell.js` · `routes/approvals.ts`.

## Option A enforcement 롤아웃 트래커

`requireRole` = 40+ 라우터·200+ 엔드포인트. `requireEditOrRole` 로 점진 전환.

- ✅ **clients.ts** (SALES) — create/update/notes POST·DELETE → `requireEditOrRole('/clients','MANAGER'[,'DESIGNER'])`. credit·toggle·delete·portal·billing-groups·import = `requireRole` 유지.
- ✅ **orders/update.ts** PUT /:id, **orders/operations.ts** POST /:id/copy → `requireEditOrRole('/orders','MANAGER'[,'DESIGNER'])`. (orders create·조회는 이미 `requireAnyPagePermission('/orders','/cards')` 매트릭스라 SALES 통과.)
- ✅ **quotations.ts** (SALES) — delete·convert-to-order → `requireEditOrRole('/quotations','MANAGER')`. (create/update는 라우터레벨 매트릭스.)
- ✅ **claims.ts** (SALES) /quality — resolve → `requireEditOrRole('/quality','MANAGER')`. defect-codes(config)=requireRole 유지.
- ✅ **FINISHING**: cards/lifecycle.ts `bulk/status`→`requireEditOrRole('/cards','MANAGER','OPERATOR')`, cards/scheduling.ts `bulk/priority`→`requireEditOrRole('/cards','MANAGER')`. ship/unship·finishing_methods(config)=requireRole 유지.
- ✅ **SHIPPING**: shipments.ts create/merge/unmerge/by-order/:id/status/ship→`requireEditOrRole('/shipments',...)`, consolidation-candidates(GET)→`requireAccessOrRole('/shipments','MANAGER')`.
- ✅ **ACCOUNTANT accounting.ts** 허브(조회) — 라우터레벨 → `requireAccessOrRole('/accounting','MANAGER')`. (정정은 /ledger 경유.)
- ⏳ **orders lifecycle** (status/cancel/restore) — 운영 write. bill/billing-status/bulk-bill·delete = 재무/삭제, `requireRole` 유지.
- ✅ **ACCOUNTANT AR ledger** — ledger/ar-ledger·ar-payments·ar-receivables·ar-dunning `requireRole('ADMIN','MANAGER')`(라우터+엔드포인트) → `requireEditOrRole('/ledger','MANAGER')`. 삭제(`requireRole('ADMIN')`)는 유지. (회계 허브 정정=/ledger/payment 경유라 필수.)
- ✅ **ACCOUNTANT cashSchedule.ts**(/cash-schedule)·**cardExpenses.ts**(/card-expenses) — `requireRole('ADMIN','MANAGER')` 일괄 → `requireEditOrRole`. sync/import/삭제 등 `requireRole('ADMIN')` 유지.
- ⏳ **ACCOUNTANT 잔여** — paymentRequests(approve/reject/pay=승인권한 뉘앙스, 정책 확인 후)·tax-invoices(hometaxInvoices?)·vat-reports·ledger/accounts-payable(AP, 페이지=/purchase-invoices? 매핑 확인 필요)·cashFlow. ⚠️ bank.ts=전 엔드포인트 `requireRole('ADMIN')`(민감) 유지 → ACCOUNTANT /bank는 허브 경유 조회만. barobill/bom/costs/cashReceipts=신규역할 무관 유지.
- ⏳ **미전환 정리**: orders lifecycle 등 잔여 `requireRole` unused import 정리(선택).

> 원칙: 다중 `requireRole('ADMIN','MANAGER',...)` write → `requireEditOrRole(pageKey, ...나머지역할)`. 단일 `requireRole('ADMIN')` 및 재무/삭제/토글 = 유지. 라우터 레벨 read 게이트는 access 가드로 별도 전환.

## 미해결/후속
- 읽기/쓰기 가드 전면 배선(Phase 2는 민감 페이지만) — 잔여 라우트는 별도 스윕.
- 개인별 예외(user-level override)는 이번 범위 제외 (요구 시 별도).
