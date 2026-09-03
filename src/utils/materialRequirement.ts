// ============================================================================
// 신모델 자재 소요량 산정 (product_materials + 품목 차감설정)
//   주문 규격 → 자재별 소요량 도출. 소요량 **환산 산식**(mm→yd/m/cm)은 `rollConsumption` 단일 소스다.
//   ★ 선택·소요 규칙은 **이 파일에 없다** — `rollConsumption.resolveLineMaterials` 하나뿐이고
//     주문 라인 원가(`orderLineCost.computeLineCost`)가 같은 함수를, 같은 로더
//     (`orderLineCost.loadCostMaterials`)로 지난다(2026-09-03 2차).
//     1차에서는 「양쪽 로더가 같은 컬럼을 읽자」는 **규약**으로 맞췄는데, 규약은 다음 사람이 모르면
//     깨진다 — 실제로 `usage_*`(0508) 가 양쪽 모두에서 빠져 간판 BOM 이 조용히 탈락하고 있었다.
//   ⚠️ **자동차감(autoDeductInventory)은 규칙이 다르고, 그게 맞다** — 「동일 산식·미러링」이라던
//      옛 주석은 사실이 아니었다. 다만 이제는 사본이 아니라 **같은 함수를 다른 옵션으로** 부른다:
//      · 여기(계획·원가) = 방향 2가지 + 단가 있는 후보 우선 + 무분할, 안 들어가면 최대폭 분할 추정
//      · 자동차감        = `{ orientation:'width-fixed', criterion:'area', splitFallback:false }`
//        (실제 출력 로그의 폭으로 「출력폭 이상 최소폭」 1종. RIP 이 방향을 이미 정했으므로 회전 금지)
//      자동차감은 실측이라 그게 맞다. 대신 「이론 소요 ↔ 실제 차감 = 로스」를 볼 때 **다른 SKU 가
//      잡힐 수 있다**는 것을 알고 봐야 한다.
//   부족체크(materialShortageCheck)·주간발주(weeklyPurchase) 계획 공용. (#465 bom_items 대체)
// ============================================================================
import type { D1Database } from '@cloudflare/workers-types'
import { resolveStockUnit, resolveLineMaterials } from './rollConsumption'
import { loadCostMaterials, type CostMaterial } from './orderLineCost'

export interface MaterialReq {
  material_item_id: number
  material_name: string
  required: number   // 재고 단위 (롤 / yd / cm / 장)
  base_unit: string
}

/**
 * 소요량을 **못 낸** 이유. 「부족 없음」과 「판정 불가」를 구분하기 위한 값이다.
 *   NO_ITEM            품목 미연결(자유입력 라인) → 자재를 알 길이 없다
 *   NO_SIZE            규격(가로·세로) 0 → 롤 소요 길이를 못 낸다
 *   NO_MATERIAL_LINK   품목은 있으나 product_materials 연결이 없다 **또는 후보를 하나도 못 골랐다**
 *   PARTIAL_USAGE      일부 BOM 행의 산정 규칙이 미구현(PER_LED) → 그만큼 **덜 계획된다**.
 *                      라인 자체는 소요가 나왔으므로 「부족 없음」이라고 말할 수는 없는 상태다.
 * ⚠️ 「NONE(무차감)만 연결」은 여기 포함하지 않는다 — 그건 의도된 0이지 미상이 아니다.
 */
export type UnresolvedReason = 'NO_ITEM' | 'NO_SIZE' | 'NO_MATERIAL_LINK' | 'PARTIAL_USAGE'

export interface UnresolvedLine {
  reason: UnresolvedReason
  item_name: string | null
}

export interface MaterialCoverage {
  requirements: Map<number, MaterialReq>
  unresolved: UnresolvedLine[]
}

export interface MaterialLineInput {
  item_id: number | null
  width: number | null
  height: number | null
  quantity: number | null
  item_name?: string | null
}

// 판재 면적·선택 규칙은 `utils/rollConsumption` 이 정본이다(사본을 두면 두 경로가 갈린다).

/**
 * order_items 규격(cm) → 자재별 소요량(base_unit). 규칙 정본 = `resolveLineMaterials`.
 * - `usage_type`(0508) 이 있으면 그 규칙이 우선 — 간판 BOM 처럼 **여러 자재가 함께** 나온다.
 * - 없으면 폭·판재 휴리스틱으로 **1종**: ROLL(폭 안에 통으로 들어가는 자재×방향) 우선 → BOARD.
 * - NONE / 미링크 제품: 소요 없음(제외).
 * ※ Step2 예정: print_events 실측으로 출력완료 order_item 제외(미출력분만 계획).
 */
export async function computeMaterialRequirements(
  db: D1Database,
  orderItems: MaterialLineInput[]
): Promise<Map<number, MaterialReq>> {
  return (await computeMaterialCoverage(db, orderItems)).requirements
}

/**
 * 위와 같은 산식이되, **소요량을 못 낸 라인도 함께** 돌려준다.
 * 소요량만 보면 「자재 충분」과 「자재 모름」이 똑같이 빈 결과라 화면에서 구분되지 않는다.
 */
export async function computeMaterialCoverage(
  db: D1Database,
  orderItems: MaterialLineInput[]
): Promise<MaterialCoverage> {
  const requirements = new Map<number, MaterialReq>()
  const unresolved: UnresolvedLine[] = []
  const productIds = [...new Set(orderItems.map((o) => Number(o.item_id)).filter((id) => id > 0))]
  if (productIds.length === 0) {
    // 품목이 하나도 안 붙은 주문 — 전 라인이 판정 불가다(예전엔 조용히 빈 결과였다).
    for (const oi of orderItems) unresolved.push({ reason: 'NO_ITEM', item_name: oi.item_name ?? null })
    return { requirements, unresolved }
  }

  // product_materials + 차감설정 일괄 로드 — **원가와 같은 로더**(avg_unit_cost·usage_* 포함).
  const pmByProduct = await loadCostMaterials(db, productIds)

  const add = (m: CostMaterial, required: number) => {
    if (required <= 0) return
    const ex = requirements.get(m.material_item_id)
    if (ex) { ex.required += required; return }
    requirements.set(m.material_item_id, {
      material_item_id: m.material_item_id,
      material_name: m.material_name,
      required,
      // BOARD → '장' 분기는 resolveStockUnit 안으로 들어갔다(2026-08-26) — 여기서 다시 갈라 놓으면 규칙이 둘이 된다.
      base_unit: resolveStockUnit(m),
    })
  }

  for (const oi of orderItems) {
    const name = oi.item_name ?? null
    const pid = Number(oi.item_id)
    if (!(pid > 0)) { unresolved.push({ reason: 'NO_ITEM', item_name: name }); continue }

    // ★규칙은 여기서 다시 쓰지 않는다 — 원가와 **같은 함수**를 지난다.
    const res = resolveLineMaterials(pmByProduct.get(pid), oi)
    for (const p of res.picks) add(p.mat, p.required)

    if (res.reason === 'NO_SIZE') { unresolved.push({ reason: 'NO_SIZE', item_name: name }); continue }
    // NO_MATERIAL_LINK = 미링크 **또는** 후보를 못 고름(예: ROLL 후보가 전부 width_mm ≤ 0).
    // 후자를 조용히 건너뛰면 「자재 이상 없음」으로 보고돼 부족체크·주간발주가 수요를 0으로 본다 —
    // 원가 쪽은 같은 상태를 NO_MATERIAL_LINK 로 부른다.
    if (res.reason === 'NO_MATERIAL_LINK') { unresolved.push({ reason: 'NO_MATERIAL_LINK', item_name: name }); continue }
    // 'NO_DEDUCT'(NONE 만 연결) = 의도된 무차감 → 판정 불가가 아니다.
    // 일부 BOM 행만 산정됐으면 그만큼 계획이 비어 있다 — 「부족 없음」이라고 말하면 안 된다.
    if (res.unsupported.length > 0) unresolved.push({ reason: 'PARTIAL_USAGE', item_name: name })
  }
  return { requirements, unresolved }
}
