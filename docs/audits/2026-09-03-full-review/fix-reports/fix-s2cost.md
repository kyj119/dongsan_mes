# 번들 ⑥ — S2 주문 라인 원가 리뷰 수정 (2026-09-03)

- 워크트리 `C:\Users\user\dongsan_mes-worktrees\fix-s2cost` · 브랜치 `session/fix-s2cost`
- **베이스 변경**: 작업 중 다른 세션이 S2 작업을 main 에 커밋(`c317e8fe`)했다.
  지시대로 미커밋분을 `..\fix-s2cost-old.patch` 로 보존 → `git stash` → `git reset --hard main`.
  WIP 커밋 `dda86b96` 는 폐기(main 이 같은 내용을 이미 담고 있다).
  현재 main = `7d845b31`(내 브랜치 이후 문서 커밋 1건 추가됨 — 코드 충돌 없음).
- 집계: **main 이 이미 고침 3 · 내가 고침 7 · 건너뜀 0**
  (10항목 중 3·5·6번은 `c317e8fe` 에서 해결됨. 나머지 7항목 중 4개는 부분 해결 상태였고 잔여분을 마저 고쳤다.)

---

## 항목별 판정

### 1. 계획↔원가가 다른 롤을 고른다 — **부분 해결 → 마저 고침**
`c317e8fe` 가 계획 로더에 `avg_unit_cost` 를 넣어 **값의 발산은 없앴다**.
그러나 리뷰가 요구한 「하나의 함수」는 없었고 선택 로직이 여전히 3벌이었다 — 규약은 다음 사람이 모르면 깨진다.
실제로 그 상태에서 `usage_*`(0508)가 **양쪽 로더 모두에서** 빠져 간판 BOM 이 조용히 탈락하고 있었다(9번).

- `src/utils/rollConsumption.ts:376` `resolveLineMaterials()` 신설 = 「어느 자재를 얼마나」 단일 정본.
- `src/utils/orderLineCost.ts:174` · `src/utils/materialRequirement.ts:111` 둘 다 이 함수를 지난다.
- `src/utils/materialRequirement.ts:91` 계획 전용 쿼리 삭제 → `loadCostMaterials()` **로더도 하나**.
- **선택 규칙 결정**: 기준은 「단가 있는 후보 우선(금액) → 없으면 면적」 **하나**, 방향 2가지, 무분할 우선.
  근거 = 원가·계획 둘 다 「사람이 고른 원단」의 **추정**이라 같은 추정을 써야 로스 측정이 성립한다.
- **자동차감은 규칙을 바꾸지 않았다**(리뷰가 허용한 쪽). 대신 사본을 지우고 **옵션으로 명시**해서 부른다:
  `src/utils/autoDeductInventory.ts:161` → `{ orientation:'width-fixed', criterion:'area', splitFallback:false }`.
  값은 종전(「출력폭 이상 최소폭 롤, 없으면 차감 안 함」)과 동일하다.
  이유 = 출력 이벤트의 `output_width` 는 RIP 이 방향을 정한 뒤의 **실측 폭**이라 회전시키면 안 되고,
  어느 롤에도 안 들어가면 멋대로 분할해 재고를 빼는 것보다 차감하지 않는 편이 맞다.

### 2. 단가 0 한 종이 선택 기준을 뒤집는다 — **부분 해결 → 마저 고침**
`c317e8fe` 가 「단가 있는 후보 우선 → 면적 → 폴백」 3단으로 고쳤다. 다만 **③ 폴백 경로에만** 옛
`every(단가>0)` 판정이 남아 있었다 — 어느 폭에도 안 들어가는 라인에서 같은 결함이 그대로 재현된다.
- `src/utils/rollConsumption.ts:246` 폴백도 ①과 같은 우선순위(단가 있는 pool 먼저)를 쓴다.

### 3. 마진 분모가 `unit_price × qty` — **main 이 해결(부분) → 폴백만 마저 고침**
`c317e8fe` 가 `order_items.amount` 를 읽는다. 다만 amount 가 비었을 때 폴백이 다시
`unit_price × qty` 라 AREA 라인에서 **같은 오류가 그대로 재현**된다.
- `src/utils/costCalculator.ts:118` 폴백을 청구 산식 정본 `computeLineAmount()` 로 교체
  (`i.pricing_method` · `i.min_billing_side_cm` 를 SELECT 에 추가).

> ⚠️ **리뷰 수치 정정**: 리뷰의 「450×90 → 20,250원, 마진 88.8%」는 **최소 청구 변 1m 규칙을 뺀 값**이다.
> 90cm 는 100cm 로 올라가므로 실제 청구는 4.5×1.0 = **22,500원**, 마진은 **90.0%** 다(오류 방향은 동일).
> 재료 소모 면적(4.05㎡)과 청구 면적(4.5㎡)은 원래 다른 축이다. 게이트는 22,500 으로 고정했다.

### 4. 재료 커버리지와 잉크 커버리지가 붙어 있다 — **부분 해결 → 마저 고침**
`c317e8fe` 가 `bom.ink_cost > 0 ? bom.ink_cost : stdInk` 로 무차감 라인의 잉크를 살렸다.
그러나 판정이 **금액**이라, 맵이 **명시적으로 0** 으로 정한 분류(태극기·간판 = 인쇄원단 매입)까지
「미상」으로 보고 `cost_standards` 가 그 0을 다시 채운다.
- `src/utils/orderLineCost.ts:126` `inkRate()` 가 `number | null` 반환 —
  **null = 규칙 없음 · 0 = 명시적 0**. `detail.ink_per_sqm` 로 노출.
- `src/utils/costCalculator.ts:96` 잉크 폴백 판정을 `ink_per_sqm !== null` 로 교체.
- 재료비도 `coverage === 'FULL'` 에서 `bom.material_cost > 0` 으로 바꿨다 —
  새로 생긴 PARTIAL 라인의 **실제 자재비를 카테고리 평균으로 덮어쓰지 않기** 위해서다.

### 5. 라인마다 `cost_standards` SELECT + 백필 커서가 실패분을 건너뛴다 — **main 이 해결**
`c317e8fe` 가 주문당 1회 조회로 바꾸고 `error_order_ids` 를 응답에 담았다. 추가 수정 없음.
(부수적으로 `calculateItemCost()` 호출부가 0이 되어 삭제했다 — 10번 참조.)

### 6. 견적 전환·주문 복사가 `recalculateOrderCosts` 를 안 부른다 — **main 이 해결**
`src/routes/quotations.ts:741` · `src/routes/orders/operations.ts:275` 에 이미 들어가 있다. 추가 수정 없음.

### 7. `width_mm ≤ 0` 라인이 조용히 사라진다 — **main 이 해결 → 잔여분(BOARD 폴스루)만 추가**
`c317e8fe` 가 `else unresolved.push({reason:'NO_MATERIAL_LINK'})` 를 넣었다.
남아 있던 것 = 같은 BOM 의 **BOARD 행을 `else if` 가 계속 무시**하는 문제.
- `src/utils/rollConsumption.ts:452` ROLL 이 아무것도 못 고르면 BOARD 로 폴스루한다.

### 8. 「단일 선택 규칙」이라 주장하는 주석이 거짓 — **main 이 부분 해결 → 갱신**
`materialRequirement.ts` 헤더는 main 이 이미 정정했다(자동차감과 다르다고 명시).
1번 작업으로 사실관계가 또 바뀌었으므로 3파일 헤더를 현재 구조에 맞게 다시 썼다:
`rollConsumption.ts:120` · `orderLineCost.ts:9` · `costCalculator.ts:9` · `materialRequirement.ts:4`.

### 9. `product_materials.usage_type`(0508)을 아무도 안 읽는다 — **미해결 → 구현**
`grep` 결과 `src/` 전체에서 읽는 코드가 **0곳**이었다. 간판 부속(LED·SMPS·입체바)은 EA 품목이라
`COALESCE(deduction_method,'ROLL')` 로 ROLL 취급 → `width_mm` NULL 로 탈락했고,
그 결과 **간판 원가가 알루미늄 한 장**인데 커버리지는 FULL 이었다.

- `src/utils/rollConsumption.ts:400` `usageRequired()` 구현:
  **FIXED_QTY · PER_AREA · PER_AREA_SHEET · PER_WIDTH · PER_PERIMETER**.
  `usage_type` 이 붙은 행은 휴리스틱보다 **우선**하고, 여러 종이 함께 나온다(반환이 배열).
- **미구현 2종은 조용히 빠지지 않는다** — `unsupported` 로 올려 `PARTIAL` 로 보고한다.
  - `PER_LED` — 「LED 몇 개」가 **다른 BOM 행**에서 나오는데 「어느 행이 LED 인가」가 데이터에 없다.
    품목코드로 추측하면 그게 또 하나의 숨은 규칙이 된다. 해당 = SIGN-CH·SIGN-PRT 의 SMPS·LED바.
  - `PER_AREA_ROLL` — **단위 축이 안 맞는다**. 결과가 「롤 수」인데 원단 `avg_unit_cost` 는
    base 단위(m/yd)당이라 그대로 곱하면 **pack_size 배(50m 롤이면 50배)** 어긋난다.
    `design-stock-base-unit-rebase` 의 50배 사고와 같은 축이다. param 65㎡ 는 폭×길이를 이미
    곱한 값이고 0508 주석이 「폭 변종 대체 가능」이라 롤 길이 역산이 유일하지 않다.
    **틀린 숫자보다 공백이 낫다** 는 판단으로 미구현. 해당 = SIGN-FRL·SIGN-FRN·-R 의 후렉스.
- 커버리지에 `PARTIAL` 신설 · 계획 쪽에는 `UnresolvedReason` 에 `PARTIAL_USAGE` 신설
  (`materialShortageCheck` 의 집계·문구도 같이 갱신).

### 10. 로더 중복 · `computeOrderLineCosts` 호출부 0 — **미해결 → 정리**
- 로더 1개: `materialRequirement` 의 사본 쿼리 삭제.
- `computeOrderLineCosts()` 를 **두 호출부 모두** 채택 —
  `costCalculator.ts:118`(저장 경로) · `routes/costs.ts:131`(백필 dry-run).
  종전엔 같은 3단 레시피가 양쪽에 인라인이라 「저장되는 원가」와 「백필이 보고하는 커버리지」가
  서로 다른 규칙이 될 수 있었다.
- `calculateItemCost()` **삭제**(호출부 0). 라인마다 await 하느라 `cost_standards` SELECT 가 라인 수만큼
  났는데 정작 쓰는 건 `pp_cost` 뿐이었다.
- `materialRequirement` · `autoDeductInventory` 의 **의미 없는 폭 정렬 제거**(선택이 행 순서에 의존하지 않는다).
- 저장값 판정을 순수 함수 `combineLineCost()` 로 분리 — DB 없이 게이트가 실행할 수 있게 하기 위함
  (재료 vs 잉크 폴백·마진 분모는 전부 「200 이 나오는 오답」이라 값 대조로만 잡힌다).

---

## 게이트

| 게이트 | 결과 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | ✓ 446 modules · `_worker.js` 6,748 kB |
| `npm run test:orderline-cost` | **30건 → 46건 통과** (요구 5종 + 파생 10종 추가) |
| `npm run test:orderline` | 30/30 통과 |
| `npm run test:calc` | 전 항목 통과 (orderline 30 · 마감표기 28 · 직배 67 · 파일규격 19 · 여신 11 · 재고단위 30 · **orderline-cost 46** · 재고평가 22 · 품목중복) |
| `npm run audit:subquery` | exit 0 |
| `git diff main...HEAD --stat` | **원가 계열 8파일만** (utils 5 · routes 1 · scripts 1 · shortageCheck 1) |

### 추가한 자체검증 (요구 5종 = a~e)
- **(a)** 70×170 에서 계획과 원가가 **같은 자재 · 같은 소요량**을 낸다 (2건)
- **(b)** 단가 없는 롤을 BOM 에 한 줄 더해도 단가 있는 선택이 안 바뀐다 — 무분할 + **분할 폴백** (2건)
- **(c)** NO_DEDUCT 라인의 잉크가 저장값까지 살아남는다 + 명시적 0 은 기준표로 안 메운다 + 규칙 없는 분류는 메운다 (3건)
- **(d)** AREA 라인 마진이 청구금액 기준(90.0) · 단가×수량이면 54.8 · amount 결측 폴백도 청구식 · 에누리 분모 (4건)
- **(e)** 간판 BOM 4종 합산 113,000원 · PER_LED 있으면 PARTIAL · 산정분 유지 · 계획도 4종 · PER_AREA_ROLL 미상 (5건)

---

## 배포 전에 소유자가 정해야 할 것

1. **백필 재실행 필요** — 이번 변경으로 저장값이 달라지는 라인이 있다.
   - 잉크: 명시적 0 분류(태극기·간판)가 `cost_standards` 로 되메워지지 않는다. (지금은 표가 0행이라 실질 영향 0)
   - 마진: `amount` 가 비어 있던 옛 AREA 라인의 분모가 바뀐다.
   - 간판: `usage_type` 이 붙은 SIGN-* 제품 라인의 원가가 **0 → 실값**으로 바뀐다.
   → `POST /costs/backfill` 을 `order_id_gt` 커서로 돌리고, 응답의 `error_order_ids` 는 **따로 재시도**할 것.
2. **`PARTIAL` 커버리지 신설** — 백필 dry-run 응답에 새 키가 생긴다. 화면·집계가 이 값을 모르면 누락된다.
   같은 축으로 부족체크 문구에 「산정규칙 미구현 N」이 뜬다.
3. **`PER_AREA_ROLL` 값 확정** — SIGN-FRL·FRN·-R 후렉스 원단은 **원가 0(PARTIAL)** 로 남아 있다.
   롤당 길이(또는 ㎡당 단가)를 확정해 주면 바로 켤 수 있다.
   `PER_LED` 는 「어느 BOM 행이 LED 인가」를 데이터로 표시할 방법이 필요하다.
4. **마이그레이션** — `0554`(분류별 잉크 단가) · `0555`(AQ2-200 단가 · AQ2-095 BOM 제외)는 **main 소유**이고
   이 브랜치가 새로 추가한 마이그레이션은 **없다**. 다만 `loadCostMaterials` 가 `pm.quantity/usage_type/usage_param`
   을 읽으므로 **`0508` 이 적용된 DB** 여야 한다(로컬·prod 모두 확인 필요).
5. **자동차감 회귀** — 동작은 동일하게 유지했지만 코드 경로가 바뀌었다.
   서버가 필요한 게이트라 이 세션에서 못 돌렸다: **`npm run test:autodeduct`** 를 배포 전에 실행할 것.

---

## 커밋

| 해시 | 내용 |
|---|---|
| `86dc91f9` | 공용 resolver 신설 · 분할 폴백에도 단가 우선 · usage_type 구현 |
| `e32b3cf2` | 계획·원가·자동차감이 같은 resolver/로더를 쓰도록 배선 |
| `3a781289` | 잉크 폴백 판정을 「규칙 유무」로 · AREA 인지 마진 폴백 · `calculateItemCost` 삭제 |
| `20768836` | 자체검증 15건 추가(30→45) · `combineLineCost` 분리 |
| `86c127fc` | `PER_AREA_ROLL` 미구현 확정 · 빈 결과에서도 unsupported 유지 (45→46) |

참고: 스테일 베이스에서 작업하던 미커밋분은 `..\fix-s2cost-old.patch` 에 보존돼 있다(`git stash` 에도 1건).
