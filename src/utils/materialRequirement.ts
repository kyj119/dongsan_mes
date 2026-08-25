// ============================================================================
// 신모델 자재 소요량 산정 (product_materials + 품목 차감설정)
//   인쇄 자동차감(autoDeductInventory)과 동일 산식으로 주문 규격 → 자재별 소요량 도출.
//   부족체크(materialShortageCheck)·주간발주(weeklyPurchase) 계획 공용. (#465 bom_items 대체)
// ============================================================================
import type { D1Database } from '@cloudflare/workers-types'
import { computeRollConsumption, resolveStockUnit } from './rollConsumption'

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
 *   NO_MATERIAL_LINK   품목은 있으나 product_materials 연결이 없다
 * ⚠️ 「NONE(무차감)만 연결」은 여기 포함하지 않는다 — 그건 의도된 0이지 미상이 아니다.
 */
export type UnresolvedReason = 'NO_ITEM' | 'NO_SIZE' | 'NO_MATERIAL_LINK'

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

const BOARD_AREA_SQM: Record<string, number> = { '4x8': (1220 * 2440) / 1e6, '3x6': (915 * 1830) / 1e6 }

/**
 * order_items 규격(cm) → 자재별 소요량(base_unit). autoDeductInventory와 동일 산식.
 * - ROLL(원단): 주문폭 이상 최소폭 원단 선택 → 길이 = 높이 ÷ divisor(cm:10 / yd:914.4) × 수량.
 *   주문폭 > 원단 최대폭이면 분할출력 근사 — 최대폭 원단으로 N=ceil(주문폭÷최대폭) 배 소요.
 * - BOARD(판재): 면적 × 로스율 ÷ 보드1장 면적 = 장수.
 * - NONE / 미링크 제품: 소요 없음(제외).
 * 제품당 자재 1종 선택(ROLL 우선 → BOARD) — autoDeduct 미러링.
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

  // product_materials + 차감설정 일괄 로드 (바인드 한도: 80 청크)
  const pmByProduct = new Map<number, any[]>()
  for (let i = 0; i < productIds.length; i += 80) {
    const chunk = productIds.slice(i, i + 80)
    const ph = chunk.map(() => '?').join(',')
    const { results } = await db.prepare(
      `SELECT pm.product_item_id, pm.material_item_id, i.item_name AS material_name,
              i.width_mm, COALESCE(i.deduction_method,'ROLL') AS deduction_method,
              i.sheet_spec, COALESCE(i.waste_factor,1.0) AS waste_factor, i.base_unit,
              i.unit, i.pack_size
       FROM product_materials pm JOIN items i ON pm.material_item_id = i.id
       WHERE pm.product_item_id IN (${ph})`
    ).bind(...chunk).all<any>()
    for (const r of (results || [])) {
      const arr = pmByProduct.get(Number(r.product_item_id)) || []
      arr.push(r)
      pmByProduct.set(Number(r.product_item_id), arr)
    }
  }

  const add = (m: any, required: number) => {
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
    const widthCm = Number(oi.width) || 0
    const heightCm = Number(oi.height) || 0
    const qty = Number(oi.quantity) || 1
    if (widthCm <= 0 || heightCm <= 0) { unresolved.push({ reason: 'NO_SIZE', item_name: name }); continue }
    const mats = pmByProduct.get(pid)
    if (!mats || mats.length === 0) {         // 미링크 제품 → 계획 제외
      unresolved.push({ reason: 'NO_MATERIAL_LINK', item_name: name })
      continue
    }

    const outWmm = widthCm * 10
    const outHmm = heightCm * 10
    const rollMats = mats
      .filter((m: any) => m.deduction_method === 'ROLL' && m.width_mm != null)
      .sort((a: any, b: any) => a.width_mm - b.width_mm)
    const boardMats = mats.filter((m: any) => m.deduction_method === 'BOARD')

    if (rollMats.length > 0) {
      const fit = rollMats.find((m: any) => m.width_mm >= outWmm)
      if (fit) {
        add(fit, computeRollConsumption(fit, outHmm, qty).qty)
      } else {
        // 주문폭 > 원단 최대폭 → 최대폭 원단 분할출력 근사(봉제). N=ceil(주문폭÷최대폭).
        const maxRoll = rollMats[rollMats.length - 1]
        const splits = Math.ceil(outWmm / maxRoll.width_mm)
        add(maxRoll, computeRollConsumption(maxRoll, outHmm, qty).qty * splits)
      }
    } else if (boardMats.length > 0) {
      const bm = boardMats[0]
      const boardArea = BOARD_AREA_SQM[bm.sheet_spec as string] || BOARD_AREA_SQM['4x8']
      add(bm, ((outWmm * outHmm) / 1e6) * qty * (Number(bm.waste_factor) || 1) / boardArea)
    }
    // else: NONE만 연결 or 유효자재 없음 → 의도된 무차감(판정 불가 아님)
  }
  return { requirements, unresolved }
}
