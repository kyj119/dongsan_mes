#!/usr/bin/env node
/**
 * 주문 라인 원가 자체검증 — `src/utils/orderLineCost.ts` computeLineCost()
 *                          + `src/utils/rollConsumption.ts` selectRollPlacement()
 *
 * 왜 있는가 (2026-09-02):
 *   ① `order_items.total_cost` 는 쓰기 경로가 없어 **22,973줄 전량 0**이었다. 마진이 원리적으로 안 나왔다.
 *   ② 소요량 계산이 `width`=폭 / `height`=길이로 **고정**돼 있었다. 그런데 수성 현수막 6,369라인 중
 *      **5,496라인(86%·면적 94.5%)이 width > height**, 즉 width 가 길이였다.
 *      450×90 현수막이면 실제는 「폭 900mm 원단에 4500mm」인데 종전 로직은
 *      「폭 4500mm → 최대폭 3200mm 로 2분할, 길이 900mm」로 읽어 **소요량이 2.5배 과소**였다.
 *      주간발주·자재부족체크가 그 값을 쓰고 있었다.
 *
 * 이 종류는 타입체크·빌드·smoke 를 전부 통과한다 — 1.97 도 4.92 도 유효한 숫자다. **값 대조만이 잡는다.**
 *
 * 실행: node scripts/orderline-cost-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const { compileTs } = require('./lib/compile-ts.cjs')
const path = require('path')

const ROLL_SRC = path.join(__dirname, '..', 'src', 'utils', 'rollConsumption.ts')
const COST_SRC = path.join(__dirname, '..', 'src', 'utils', 'orderLineCost.ts')
const { mod: rollMod, cleanup: rollCleanup } = compileTs(ROLL_SRC)
// orderLineCost 는 rollConsumption 을 import 하므로 bundle 필요(단일 파일 컴파일이면 MODULE_NOT_FOUND)
const { mod: costMod, cleanup: costCleanup } = compileTs(COST_SRC, { bundle: true })
const { selectRollPlacement } = rollMod
const { computeLineCost } = costMod

let pass = 0
const fails = []

function near(a, b, eps = 0.0001) { return Math.abs(a - b) < eps }

/** 배치 선택 — 어느 자재·어느 방향·소요 얼마 */
function placement(name, mats, aMm, bMm, copies, expect) {
  const got = selectRollPlacement(mats, aMm, bMm, copies)
  if (!got) { fails.push(`${name}\n    기대 ${JSON.stringify(expect)} · 실제 null`); return }
  const ok = near(got.qty, expect.qty)
    && (expect.width_mm === undefined || got.mat.width_mm === expect.width_mm)
    && (expect.splits === undefined || got.splits === expect.splits)
  if (!ok) {
    fails.push(`${name}\n    기대 qty=${expect.qty} 폭=${expect.width_mm} 분할=${expect.splits}`
      + `\n    실제 qty=${got.qty} 폭=${got.mat.width_mm} 분할=${got.splits}`)
  } else pass++
}

/** 라인 원가 */
function cost(name, mats, line, opts, expect) {
  const got = computeLineCost(mats, line, opts || {})
  const ok = got.coverage === expect.coverage
    && (expect.material_cost === undefined || got.material_cost === expect.material_cost)
    && (expect.ink_cost === undefined || got.ink_cost === expect.ink_cost)
    && (expect.total_cost === undefined || got.total_cost === expect.total_cost)
  if (!ok) {
    fails.push(`${name}\n    기대 ${JSON.stringify(expect)}`
      + `\n    실제 cov=${got.coverage} mat=${got.material_cost} ink=${got.ink_cost} tot=${got.total_cost}`)
  } else pass++
}

// ── 픽스처: 수성 현수막 원단(실제 prod 값) ──────────────────────────────────
// base_unit 비어 있음 → computeRollConsumption 이 yd 로 계산(÷914.4). 단가도 yd 당이라 환산 불요.
const M = (id, w, price) => ({
  material_item_id: id, material_name: `AQ2-${w / 10}`, width_mm: w,
  deduction_method: 'ROLL', sheet_spec: null, waste_factor: 1,
  base_unit: null, unit: 'yd', pack_size: 130, avg_unit_cost: price,
})
const AQ = [M(200, 700, 436), M(202, 900, 459), M(207, 1200, 811.66), M(215, 1800, 1044), M(218, 3200, 4738.35)]

// ── ① 방향 정규화 (이 게이트의 존재 이유) ──────────────────────────────────
// 450×90 현수막 1장: 폭 900mm 원단에 4500mm 길이 = 4500/914.4 = 4.9213yd
placement('450×90 — 긴 변이 앞에 와도 폭 900 을 고른다', AQ, 4500, 900, 1,
  { qty: 4500 / 914.4, width_mm: 900, splits: 1 })
placement('90×450 — 순서를 바꿔도 같은 결과(대칭)', AQ, 900, 4500, 1,
  { qty: 4500 / 914.4, width_mm: 900, splits: 1 })

// 종전 버그 재현 방지: width 를 폭으로 고정했다면 3200mm 2분할 × 900mm = 1.9685yd 였다.
const buggy = (900 / 914.4) * Math.ceil(4500 / 3200)
if (near(buggy, 4500 / 914.4)) fails.push('픽스처 오류 — 버그값과 정답이 같으면 이 게이트는 의미가 없다')
else pass++

// 수량 반영
placement('450×90 10장', AQ, 4500, 900, 10, { qty: (4500 / 914.4) * 10, width_mm: 900, splits: 1 })

// 두 변 모두 원단 폭 이하 → 긴 쪽을 폭으로 둬야 소요가 적다(짧은변=폭 규칙의 반례)
// 600×800mm, 폭 900 원단: 폭800·길이600 = 0.6562yd  <  폭600·길이800 = 0.8749yd
placement('두 변 모두 폭 이하 — 긴 쪽을 폭으로', [M(202, 900, 459)], 600, 800, 1,
  { qty: 600 / 914.4, width_mm: 900, splits: 1 })

// ── 분할은 자동으로 만들지 않는다 (2026-09-02) ──────────────────────────────
// 원단·분할은 **영업이 주문서에서 고른다**(원단 폭마다 청구 단가가 다르다). 이 함수는 추정이다.
// 자동으로 분할 조합을 뒤지게 두면 언제나 「잘라 이어붙여라」로 수렴한다 —
// 좁은 폭이 ㎡당 싸고(900폭 558원/㎡ · 3200폭 1,619) 이음(봉제) 비용이 0이기 때문이다.
// 실측으로 450×300 → 900폭 **5분할**, 600×300 → **7분할** 이 나왔다. 그래서 무분할만 후보로 둔다.

// 한 변이 폭 안에 들어가면 분할하지 않는다. 3500×1000, 폭3200 → 폭에 1000 을 눕혀 길이 3500.
placement('한 변이 폭 안에 들어가면 분할 안 한다', [M(218, 3200, 4738.35)], 3500, 1000, 1,
  { qty: 3500 / 914.4, width_mm: 3200, splits: 1, fitted: true })

// 3000×650 — 종전엔 900폭 4분할(1,305원)이 700폭 1장(1,430원)을 이겼다. 이제 무분할만 본다.
placement('협폭 분할이 싸도 무분할을 고른다', AQ, 3000, 650, 1,
  { qty: 3000 / 914.4, width_mm: 700, splits: 1, fitted: true })

// 450×300 대형 — 종전 900폭 5분할(7,530원). 이제 3000 이 들어가는 3200폭 무분할.
placement('450×300 — 5분할 대신 3200폭 통으로', AQ, 4500, 3000, 1,
  { qty: 4500 / 914.4, width_mm: 3200, splits: 1, fitted: true })

// tie-break — 폭·단가가 완전히 같은 후보 2개면 material_item_id 가 작은 쪽(행 순서 의존 방지)
placement('동점이면 material_item_id 우선', [M(310, 900, 459), M(299, 900, 459)], 4500, 900, 1,
  { qty: 4500 / 914.4, width_mm: 900, splits: 1 })
const tieGot = selectRollPlacement([M(310, 900, 459), M(299, 900, 459)], 4500, 900, 1)
if (!tieGot || tieGot.mat.material_item_id !== 299) fails.push(`동점 tie-break — 기대 id=299 · 실제 ${tieGot && tieGot.mat.material_item_id}`)
else pass++

// 어느 원단에도 통으로 안 들어갈 때만 폴백 — **최대 폭**으로 **분할 최소**. fitted=false 로 표시된다.
// 3500×4000, 최대폭 3200 → 두 방향 다 2분할. 길이가 짧은 쪽(3500)이 싸다.
placement('두 변 다 최대폭 초과 — 최대폭·분할 최소 폴백', AQ, 3500, 4000, 1,
  { qty: (3500 / 914.4) * 2, width_mm: 3200, splits: 2, fitted: false })

// 단가가 하나라도 없으면 면적 기준으로 넘어간다 — 기준을 섞지 않는다.
// [700, 3200(단가0)] 에 4500×900 → 700 은 어느 방향도 안 들어가고 3200 은 900 이 들어간다.
placement('단가 미상 섞이면 면적 기준(무분할 우선은 그대로)', [M(200, 700, 436), M(218, 3200, 0)], 4500, 900, 1,
  { qty: 4500 / 914.4, width_mm: 3200, splits: 1, fitted: true })

// ── 단가 미상 1종이 멀쩡한 라인을 0으로 만들지 못한다 (2026-09-03 리뷰) ──────
// 종전엔 `every(단가>0)` 이라 한 번도 사 본 적 없는 원단 1종이 BOM 에 있으면 제품 전체가
// 면적 기준으로 떨어졌고, 그 미상 원단이 뽑히면 원가가 NO_PRICE → 0 이 됐다.
// prod 실측 18개 제품이 그 상태였다. 이제 **단가 있는 후보 중 들어가는 것**을 먼저 본다.
placement('미상 원단이 섞여도 단가 있는 쪽을 고른다', [M(200, 700, 0), M(202, 900, 459)], 650, 3000, 1,
  { qty: 3000 / 914.4, width_mm: 900, splits: 1, fitted: true })
cost('  └ 그래서 원가가 0이 아니다', [M(200, 700, 0), M(202, 900, 459)],
  { item_id: 172, width: 65, height: 300, quantity: 1 }, {},
  { coverage: 'FULL', material_cost: 1506 })
// 단가 있는 후보로는 아무것도 안 맞으면 전 후보·면적 기준 — 미상이 뽑히면 NO_PRICE 로 정직하게 보고
cost('단가 있는 후보가 안 맞으면 미상이라도 고르고 NO_PRICE', [M(200, 700, 436), M(218, 3200, 0)],
  { item_id: 172, width: 450, height: 90, quantity: 1 }, {},
  { coverage: 'NO_PRICE', material_cost: 0 })

// ── ② 라인 원가 ─────────────────────────────────────────────────────────────
// 450×90 1장 · 폭900 원단 459원/yd → 4.9213 × 459 = 2258.9 → 2259
cost('현수막 1장 재료비', AQ, { item_id: 172, width: 450, height: 90, quantity: 1 }, {},
  { coverage: 'FULL', material_cost: 2259, ink_cost: 0, total_cost: 2259 })

// 단일값 경로(맵 없음) — 면적 4.5×0.9 = 4.05㎡ × 189 = 765.45 → 765
cost('잉크 산입(단일값)', AQ, { item_id: 172, width: 450, height: 90, quantity: 1 }, { inkCostPerSqm: 189 },
  { coverage: 'FULL', material_cost: 2259, ink_cost: 765, total_cost: 3024 })

// 수량 10장 — 재료·잉크 모두 비례
cost('수량 비례', AQ, { item_id: 172, width: 450, height: 90, quantity: 10 }, { inkCostPerSqm: 189 },
  { coverage: 'FULL', material_cost: 22589, ink_cost: 7655, total_cost: 30244 })

// ── 잉크는 **인쇄방식마다 다르다** (용준님 지적 2026-09-02) ─────────────────
// prod 실측 2026-01~07: 수성 189 · 전사 89 · 솔벤 1,011 · UV 1,174 · 태극기/간판 0.
// 173원 공통값이면 UV 는 7배 과소다 — 그래서 맵이 있으면 단일값은 쓰지 않는다.
const INK = { 수성: 189, 전사: 89, 솔벤: 1011, UV: 1174, 태극기: 0, 간판: 0 }
cost('분류별 — 수성 189', AQ, { item_id: 172, width: 450, height: 90, quantity: 1, category: '수성' },
  { inkCostByCategory: INK }, { coverage: 'FULL', ink_cost: 765 })
cost('분류별 — UV 1,174 (같은 면적, 잉크만 다르다)', AQ,
  { item_id: 172, width: 450, height: 90, quantity: 1, category: 'UV' },
  { inkCostByCategory: INK }, { coverage: 'FULL', ink_cost: 4755 })
// 맵이 있으면 **맵에 없는 분류는 0**이다. 공통값으로 흘리면 태극기(인쇄원단 매입)에 잉크가 붙는다.
cost('맵에 없는 분류는 0 (공통값으로 흐르지 않는다)', AQ,
  { item_id: 172, width: 450, height: 90, quantity: 1, category: '상품' },
  { inkCostByCategory: INK, inkCostPerSqm: 189 }, { coverage: 'FULL', ink_cost: 0 })
cost('태극기는 0 — 인쇄원단을 매입한다', AQ,
  { item_id: 172, width: 450, height: 90, quantity: 1, category: '태극기' },
  { inkCostByCategory: INK }, { coverage: 'FULL', ink_cost: 0 })

// ── ③ 커버리지 — 「0원」과 「미상」을 가른다 ─────────────────────────────────
cost('품목 미연결', AQ, { item_id: null, width: 450, height: 90, quantity: 1 }, {}, { coverage: 'NO_ITEM', total_cost: 0 })
cost('규격 0', AQ, { item_id: 172, width: 0, height: 90, quantity: 1 }, {}, { coverage: 'NO_SIZE', total_cost: 0 })
cost('자재 미연결', [], { item_id: 172, width: 450, height: 90, quantity: 1 }, {}, { coverage: 'NO_MATERIAL_LINK', total_cost: 0 })
cost('단가 없음은 0원이 아니라 미상', [M(203, 950, 0)],
  { item_id: 172, width: 450, height: 90, quantity: 1 }, {}, { coverage: 'NO_PRICE', material_cost: 0 })

// NONE(무차감)만 연결 — 의도된 0. 잉크는 붙는다.
cost('무차감 자재 — 잉크만', [{ material_item_id: 900, material_name: '무차감', width_mm: null,
  deduction_method: 'NONE', sheet_spec: null, waste_factor: 1, base_unit: null, unit: 'EA', pack_size: null, avg_unit_cost: 100 }],
  { item_id: 172, width: 450, height: 90, quantity: 1, category: '수성' }, { inkCostByCategory: INK },
  { coverage: 'NO_DEDUCT', material_cost: 0, ink_cost: 765 })

// 잉크는 **자재 연결과 무관**하다 — 규격+분류만 있으면 계산된다(2026-09-03 리뷰).
// 묶어 두면 같은 인쇄물이 BOM 유무로 잉크가 갈린다.
cost('자재 미연결이어도 잉크는 낸다', [], { item_id: 172, width: 450, height: 90, quantity: 1, category: '수성' },
  { inkCostByCategory: INK }, { coverage: 'NO_MATERIAL_LINK', material_cost: 0, ink_cost: 765 })
cost('단가 미상이어도 잉크는 낸다', [M(203, 950, 0)],
  { item_id: 172, width: 450, height: 90, quantity: 1, category: '수성' },
  { inkCostByCategory: INK }, { coverage: 'NO_PRICE', material_cost: 0, ink_cost: 765 })

// ── ④ 판재(BOARD) — waste_factor 는 판재에만 적용된다 ──────────────────────
const BOARD = [{ material_item_id: 500, material_name: '포맥스 3T', width_mm: null,
  deduction_method: 'BOARD', sheet_spec: '4x8', waste_factor: 1.1, base_unit: null, unit: '장', pack_size: null, avg_unit_cost: 12000 }]
// 1220×2440mm 1장 = 2.97608㎡ · 출력 600×900mm=0.54㎡ × 1.1 ÷ 2.97608 = 0.19959장 × 12000 = 2395
cost('판재 — 장수 환산 + waste_factor', BOARD,
  { item_id: 300, width: 60, height: 90, quantity: 1 }, {}, { coverage: 'FULL', material_cost: 2395 })

// ── 결과 ───────────────────────────────────────────────────────────────────
rollCleanup(); costCleanup()
if (fails.length) {
  console.error(`\n[orderline-cost] ❌ ${fails.length}건 실패 / ${pass + fails.length}건`)
  for (const f of fails) console.error('  - ' + f)
  process.exit(1)
}
console.log(`[orderline-cost] ✅ ${pass}건 통과`)
