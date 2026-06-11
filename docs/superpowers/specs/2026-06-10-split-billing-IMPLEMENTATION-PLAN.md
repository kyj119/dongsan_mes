# 주문 청구 법인 분할 — 구현 핸드오프 (다음 세션용)

> **이 문서를 읽었다면**: 이번 세션은 split billing 구현이다. 아래 로드맵대로 **P1부터** 착수한다.
> **설계 정본(단일 소스)**: `docs/superpowers/specs/2026-06-10-split-billing-by-entity.md`
> **관련 메모리**: `design-split-billing`, `design-order-intake-split`(뒤집힌 "매출=청구법인 단일" 주의), `project-entity-policy`, `multi-entity-progress`
> **진행 상태 표기 규칙**: 각 Phase 완료 시 이 문서의 해당 Phase 체크박스를 갱신하고 PROJECT_STATUS.md에 반영한다.

---

## 배경 (왜 / 무엇이 바뀌나)

청구법인 = '로그인 법인 자동 설정' → **'담당 생산법인 기준 분할'**로 전환.
한 주문에 동산(현수막)·선명(간판)이 섞이면 각 생산법인이 자기 품목을 고객에 직접 청구
(세금계산서·매출·미수금 각자 분리). 같은 거래처가 동산·선명 양쪽에서 각각 청구받음.
기존 "매출=청구법인 단일"(2026-06-04) 결정을 뒤집은 것.

`order_items.assigned_entity_id`(품목 담당)·`orderVisibilityFilter`·재고차감 COALESCE는
**이미 prod에 깔려 있음** = 백지 아님. 그 위에 '청구 레이어'만 얹는 작업.

## 확정 모델 (변하면 안 되는 불변식)

- 주문 **안 쪼갬**(단일 주문) + 내부에 법인별 **청구그룹**.
- 청구 분할 단위 = **품목**(`order_items.assigned_entity_id`). 품목 **내부** 타법인 공정만 내부정산.
- 생산 안 하는 품목(상품·부자재, 담당 NULL) = 주문 **주(主)법인**(=`orders.entity_id`=접수법인) 청구.
- `orders.entity_id` 의미 재정의: '단일 청구법인' → **'접수/주법인'**.
- 거래처(`clients`)는 법인 중립(entity_id 없음) 유지.

---

## Phase 로드맵

### ☑ P1. 스키마 + 백필 — **완료 (2026-06-10, prod 적용·검증)**
> 마이그 `0305_order_billing_groups.sql`. prod 적용 완료(435주문→435그룹 1:1). verify: orders=groups=435, dup=0, missing=0, BILLED 3 보존, 필드(status·amount·at·by) 불일치 0. 멱등(`IF NOT EXISTS`+`INSERT OR IGNORE`). supply/tax/tax_invoice_id는 NULL(P3/P4 산정). 기존 orders.billing_status/billed_* 유지(롤백용).

- 신규 테이블 `order_billing_groups` (spec §4 그대로):
  `id, order_id, entity_id, billing_status, billed_amount, supply_amount, tax_amount,
  billed_at, billed_by, tax_invoice_id, created_at` / `UNIQUE(order_id,entity_id)` / 인덱스 3개(order·entity·status).
- 기존 주문 전수 백필: 주문당 **1그룹** = `(order_id, orders.entity_id, 기존 billing_status·billed_amount·billed_at·billed_by)`. 멱등(`INSERT OR IGNORE`).
- `orders.billing_status/billed_*` 컬럼은 **유지**(롤백용, P5 후 제거).
- 파일: `migrations/`
- **verify**: 모든 기존 주문이 정확히 1그룹·금액 일치, BILLED/PAID 보존을 SELECT로 실증.

### ☑ P2. 주문 생성/수정 + UI — **완료 (2026-06-10 로컬 검증, 2026-06-11 prod 배포 — 커밋 72bd97ee + P3와 동반 배포)**
- ✅ 헬퍼 `recalcOrderBillingGroups(db, orderId)`(core.ts, export) — orders+order_items만 읽는 자기완결. POST(items INSERT 직후)·PUT(child INSERT 직후) 호출. `COALESCE(assigned_entity_id, 주법인)` group by → supply 합, tax=주문vat 비례배분(vat_base), discount=공급액 비례배분, **주법인 그룹 잔차흡수**, billed=supply+tax−disc. **BILLED/PAID 그룹 존재 시 재분할 skip**(불변식). 재계산=DELETE 후 재INSERT.
- ✅ 주문서 '청구 법인' 셀렉트(`billingEntity`) **완전 제거**(spec) → 품목 담당별 도출 칩(`billingGroupsHint`, calc.js `updateBillingHint`). 명시 담당=법인별 칩, 미지정='자동 N건'. 담당 셀렉트 onchange + calculateTotal 끝에서 갱신. calc.js `billing_entity_id` 전송 제거, sheet.js billingEntity 채우기 제거.
- ✅ 주문 상세 모달에 청구그룹 요약(`buildBillingGroupsSection`, orders.js) — 혼합(2그룹+)만 표시, 법인별 공급가·세액·청구금액·상태. 상세 GET(core.ts:861)에 `billing_groups` 반환 추가.
- 파일: `src/routes/orders/core.ts`, `src/pages/orderForm.ts`, `src/scripts/orderForm/{calc,sheet,itemRow}.js`, `src/scripts/orders.js`
- **verify(전부 통과)**: dev 서버 실검증 — 혼합주문 그룹2(선명 11k+동산 22k, NULL→주법인), 할인3000 비례배분(1k/2k, 잔차주법인), 단일주문 그룹1(33k, 회귀무영향), PUT 양방향 재계산(2↔1), 금액 정합(billed합=final). 브라우저: 셀렉트 제거 확인·도출칩 '선명1·자동2'·상세 분할테이블. typecheck·build OK, smoke 103/103, console 0 err.

### ☑ P3. 청구(billing) + 미수금 파생 — **완료 (2026-06-11 prod 배포·라이브 검증, 커밋 66b2fea6)**
- ✅ `billing_status` **그룹 단위** 반영: 헬퍼 `setOrderBillingStatus(db, orderId, status, billedBy)` — order_billing_groups + orders 미러를 batch 갱신, `IS NOT 'BILLED' AND IS NOT 'PAID'`(NULL/미청구 매칭). 기존 6개 청구 경로(bill·billing-status PATCH·soft/hard delete·PUT·cancel·sync-statuses) 전부 헬퍼 경유로 교체. *(주: 별도 `/order-invoices/:id/bill` 신규 엔드포인트 대신 기존 경로 그룹화 — 법인별 **독립** 청구/발행은 P4 그룹별 발행으로 이연. 현재 청구 행위는 주문 단위로 그룹 동반.)*
- ✅ `clients.balance` 단일 캐시 **폐기** → (거래처×법인) 파생. 헬퍼 `deriveClientBalance(c, clientId)` = `order_billing_groups[BILLED] JOIN orders(status≠CANCELLED) − payments − adjustments` (entityFilter g/p/a, 현 사용자 법인 기준). 미수금 목록은 파생 서브쿼리 + 외부 래퍼 `WHERE balance > ?`. balance 읽던 지점(receivables·overdue·collection-period·독촉·client ledger·settlement·integrity·recalculate·dashboard TOP10·financialReports total_ar·payment/adjustment new_balance) 전수 파생 전환. balance UPDATE 전부 제거(payments.ts·bank unapply·taxInvoices 포함).
- ✅ orders.billing_status/billed_amount **미러 유지**(롤백·P5 매출집계용, P5 검증 후 컬럼 제거).
- 파일: `core.ts`, `queries.ts`, `taxInvoices.ts`, `ledger/accounts-receivable.ts`, `lib/payments.ts`, `financialReports.ts`, `dashboard.ts`, `bank.ts`
- **verify(전부 통과)**: 로컬 — 혼합주문 2그룹 BILLED, 거래처×법인 미수금 분리(동산22k/선명11k), 입금차감 22k→12k, smoke 103/103. prod 라이브 — receivables 거래처3(대전벧엘원) 제외(파생=0, 구캐시 stale 60k 교정), balance-snapshot AR −9,224,710(파생 정본), order155 billing_groups·dashboard·overdue·collection-period 200, 14페이지/10·11 API.
- **사전 prod 비교**: 캐시합 −9,164,710 vs 파생합 −9,224,710, 차이 60,000 = **단일 원인**(취소주문 155 `20260518-025`가 BILLED 후 CANCELLED됐으나 구 취소로직이 balance 미복원 → stale). 파생(0)이 정답. 배포로 자동 교정.

### ☑ P4. 세금계산서 — **완료 (2026-06-11 prod 배포·검증, 커밋 68472035, dep 8d7009f 자동빌드)**
- ✅ 발행 단위 = (주문×법인). 헬퍼 `createSplitInvoices`(taxInvoices.ts) — 선택 주문의 청구그룹을 법인별로 묶어 **법인당 1장**(공급자=`getEntityCompanyInfo(entityId)`, 채번=`generateInvoiceNumber(entityId)`, 금액=그룹 supply/tax, 품목=`COALESCE(assigned_entity_id,주법인)=entity`). 단건/일괄(POST `/`)·`/batch-create`·`/monthly-create`(summary)·`/direct` 전부 경유. 단일법인=기존 동일 1장.
- ✅ `issueTaxInvoice`: **이 계산서(법인) 그룹만** BILLED + `group.tax_invoice_id` 연결, orders 미러는 전 그룹 청구완료 시만(`NOT EXISTS unbilled group`). `cancel`: **이 계산서 그룹만** 초기화(`tax_invoice_id=id` 스코프)→타 법인 그룹 불변, DIRECT_INVOICE 백업주문 CANCELLED.
- ⚠️ **구조 편차**: spec의 신규 `tax_invoice_billing_groups`(M:N) 대신 **기존 `order_billing_groups.tax_invoice_id` FK 활용**(1계산서:N그룹이라 FK로 충분, 신규 테이블·마이그 리스크↓). `tax_invoices.order_id`(1:1)+`tax_invoice_orders`(M:N) 공존 유지(전환기).
- 마이그 `0306`: 기존 단일그룹 supply/tax 백필(prod 435건 적용, supply=order.total)+계산서 연결(활성계산서 0건)+인덱스. 멱등.
- 파일: `src/routes/taxInvoices.ts`, `src/scripts/taxInvoices.js`(분할 toast)
- **verify(통과)**: 로컬 E2E 혼합주문→2장(동산110k 현수막/선명55k 간판, 법인별 공급자·채번·품목), 발행 부분청구 스코핑, 취소 그룹스코프 / prod 라이브 목록·eligible-orders 200·페이지 0err / tsc·build·smoke 103/103.
- ✅ **별건 수정(2026-06-11, 커밋 20f06907)**: GET `/:id`→`'/:id{[0-9]+}'`(숫자 전용 제약)으로 GET `/monthly-eligible` 섀도잉 해소(월합산 대상조회 200 복구). 로컬·prod 200 확인.

### ◐ P5. 매출·미수금·리포트 집계 그룹화 — **부분 완료 (2026-06-11, 커밋 20f06907·dep auto)**
- ✅ **매출 리포트 그룹화**: `financialReports.ts` `/pnl`·`/pnl/monthly`·CSV export(매출 = `Σ order_billing_groups[BILLED].billed_amount`, `entityFilter(c,'g')`, `o.status!='CANCELLED'`). 매출원가는 청구된 주문 단위(혼합주문 비분할=한계). 단일법인=현재 무변화.
- ✅ **입금예정 물질화 그룹화**: `cashSchedule.ts` BILLED 주문→입금예정을 **(주문×법인) 그룹 단위**로(`entity_id=g.entity_id`, 중복방지 NOT EXISTS에 `cs.entity_id=g.entity_id` 추가). cashflowEngine 합성과 이중계산 없음(materialized는 synthesis NOT EXISTS로 제외).
- ✅ **자금예측 §4 그룹화 + clients.balance 제거 (커밋 dce9f50b)**: `cashflowEngine.ts` §4(주문 예상입금)를 **청구그룹 단위로 통합**. §4a=미청구 그룹(그룹금액·납기), §4b=BILLED 그룹(파생 미수잔여 cap·billed_at). **2버그 동시수정**: ①§4b가 **폐기된 stale `clients.balance`를 cap으로 사용**(P3 잔재, balance 미유지) → (거래처×법인) 파생잔여(`ΣBILLED그룹−payments−adjustments−물질화PENDING/OVERDUE`)로 대체 ②§4a가 order 단위라 혼합주문 부분청구를 §4b와 이중계산 → 그룹 분할로 해소. **검증(차감법)**: stale balance=0+혼합주문에서 법인1 기여=110000(파생 합성=버그①수정), 법인0=165000(이중계산 없음=버그②수정).
- ☐ **잔여(P5-continued)**: dashboard KPI(`dashboard.ts:52` month_billed 등)·AR 하위 매출집계(`accounts-receivable.ts` 2009/2044/2090/2150)·`clients.ts`(c.balance 필터·credit)·`portal.ts`·`aiInsights.ts`. 모두 단일법인엔 정확(미러), 혼합주문서만 분리 필요.
- 파일: `financialReports.ts`✅·`cashSchedule.ts`✅·`cashflowEngine.ts`✅ / 잔여 `dashboard.ts`·`accounts-receivable.ts`·`clients.ts`·`portal.ts`·`aiInsights.ts`
- **verify(부분)**: /pnl·monthly·forecast 200, cashflow 차감법 검증, smoke 103/103, 단일법인 무변화.
- ★ **P5 전량 완료 + prod 검증 후**: `orders.billing_status/billed_*` legacy 컬럼 제거 마이그레이션.

### ☐ P6. 내부정산 — 후속(별도 설계)
- 품목 **내부** 타법인 공정 정산 추적. 별도 브레인스토밍 후 착수.

> **P1~P5 = MVP. P6 = 후속.** 각 Phase = 한 작업 단위, 한 세션에 섞지 말 것.

---

## 전 Phase 공통 가드레일

- ⚠️ **BILLED/PAID 주문은 절대 품목 기준 재분할 금지** → 1그룹 동결(이미 발행된 세금계산서가 `orders.entity_id` 기준).
- **마이그레이션 멱등성 필수**: 작성 전 prod 스키마 `PRAGMA table_info`로 실제 컬럼 확인 (메모리 `feedback-migration-idempotency`, `feedback-db-schema-check`). 신규 적용은 `db:migrate` 추적 불일치 가능 → `execute --file` 직접 적용 고려.
- **D1 `.bind(...binds)` 스프레드**(루프 체이닝 금지).
- routes/*.ts SELECT 수정 시 `entityFilter` 누락 점검(`/entity-audit`). 라우트 수정 시 stats/count/badge 포함.
- 각 Phase: **feature→verify(`npm run build && npm run smoke`)→next**.
- Windows 배포 한글 커밋은 `--commit-message` ASCII 우회. 배포(wrangler)≠push → 배포 후 `git push` 필수.
- 신규 페이지/엔드포인트 생성 시 `permission_pages` INSERT + `requirePagePermission`.

## 작업/문서 규칙

- 세션 시작 시 `.claude/PROJECT_STATUS.md` 읽기, 작업 시작/완료/차단 시 갱신.
- 각 Phase 완료 시 **이 문서 체크박스** + spec 해당 Phase 상태 갱신.
- 세션 종료 시 `memory/session-context.md` 덮어쓰기. 결정/이유는 `design-split-billing` 메모리에 누적.

---

## 진행 로그
- 2026-06-10: 설계 확정(브레인스토밍 9문항 + §7 세부 전부 확정). 구현 미착수. **다음 세션 P1부터.**
- 2026-06-10: **P1 완료** — 마이그 `0305_order_billing_groups.sql` 작성·로컬(스키마+멱등성)·prod 적용. 백필 435주문→435그룹 1:1, BILLED 3 동결, 필드 불일치 0.
- 2026-06-10: **P2 완료(로컬 검증·prod 미배포)** — `recalcOrderBillingGroups` 헬퍼 + POST/PUT 호출, 주문서 청구법인 셀렉트 제거→도출칩, 상세 분할요약. dev 실검증(혼합2/단일1/할인배분/PUT양방향/금액정합), 브라우저 UI 확인, smoke 103/103.
- 2026-06-11: **P3 완료(prod 배포·라이브 검증)** — `setOrderBillingStatus`(그룹+미러 batch)·`deriveClientBalance`(거래처×법인 파생) 헬퍼, clients.balance 캐시 전면 폐기(읽기/쓰기 ~20지점 전환). 커밋 66b2fea6, deploy 7d6f77bc, push 17852929(봇 XSS 머지). 배포 전 prod 비교 60k 차이 원인규명=취소주문155 stale 캐시 1건(파생이 정답, 배포로 교정). deploy-verify: 빌드·타입·entity감사·14페이지·API·라이브 검증 통과.
- 2026-06-11: **P4 완료(prod 배포·검증)** — `createSplitInvoices` 헬퍼로 발행 단위를 (주문×법인)으로 전환. 단건/일괄/월합산/직접발행 전부 법인 자동분할, 발행/취소 그룹 스코프. 연결=`order_billing_groups.tax_invoice_id` FK(M:N 테이블 대신). 마이그 0306 prod 적용(435 supply/tax 백필). 커밋 68472035, dep 8d7009f(자동빌드). 로컬 E2E 혼합주문 2장 분할 검증, prod 페이지·API 0err, smoke 103/103. **별건 발견: monthly-eligible 라우트 섀도잉(기존 버그).**
- 2026-06-11: **monthly-eligible 섀도잉 수정 + P5 부분(커밋 20f06907, dep auto)** — `/:id{[0-9]+}` 숫자 제약으로 월합산 대상조회 200 복구. P5: financialReports 매출 리포트(/pnl·monthly·CSV)+cashSchedule 입금예정 물질화 = 청구그룹 단위. smoke 103/103, monthly-eligible/pnl 200, 단일법인 무변화.
- 2026-06-11: **P5 cashflowEngine §4 그룹화(커밋 dce9f50b, dep auto)** — 자금예측 §4를 청구그룹 단위로 통합. **2버그 수정**: ①폐기 stale clients.balance cap → 파생 미수잔여(거래처×법인) ②혼합주문 §4a/§4b 이중계산 → 그룹 분할. 차감법 검증(법인1=110k 파생·법인0=165k 무중복). **P5 잔여: dashboard KPI·AR 하위집계·clients/portal/aiInsights·레거시 컬럼제거.** **다음: P5-continued 또는 마무리.**
