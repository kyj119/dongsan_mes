// ============================================================================
// 주문 라인 원가 산정 (재료비 + 잉크)
// ----------------------------------------------------------------------------
// ★ 왜 필요한가 — `order_items.total_cost` 는 **쓰기 경로가 아예 없어 전량 0**이다
//   (2026년 22,973줄 실측). 그래서 /reports 수익성 탭은 `items.avg_unit_cost × 수량` 이라는
//   **매입-재판매 가정**으로만 마진을 추정해 왔고, 제조 인쇄물에는 무의미했다(커버리지 ~19%).
//   제조물의 원가는 「어느 원단을 얼마나 쓰는가」에서 나온다 — 그 계산은 이미 있다.
//
// ★ 산식은 새로 만들지 않는다 — `utils/rollConsumption` 이 정본이고
//   인쇄차감(autoDeductInventory)·후가공차감·소요량계획(materialRequirement)이 같은 함수를 쓴다.
//   여기서 사본을 만들면 원가와 실차감이 조용히 갈린다.
//
// ★ 로스는 반영하지 않는다(용준님 확정 2026-09-01). **이론 재료비**만 담는다.
//   이유가 있다 — 이론값을 저장해 두면 자동차감이 돌기 시작했을 때
//   **이론 소요 ↔ 실제 차감 = 로스**가 자동으로 측정된다. 미리 섞으면 그 비교가 불가능해진다.
//   (2026-07 출력 로그 실측 로스율 21.5%. 이 값은 여기 들어가지 않는다.)
//
// ★ 잉크는 **인쇄방식마다 단가가 다르다** — 전 방식 공통 ㎡단가는 못 쓴다(용준님 지적 2026-09-02).
//   2026-01~07 prod 실측: 수성 189 · 전사 89 · 솔벤 1,011 · UV 1,174원/㎡ (태극기·간판 = 0).
//   ⚠️ 이 값을 낸 과정에서 원 데이터의 함정 둘을 걷어냈다 —
//     ① UV 「R50 UV INK」 920만은 **통당 230만**으로 기록돼 있는데 품명 원문이 「1 X 184,000」이다.
//        같은 거래처(재현테크)가 컷팅기 터치패드·라우터 수리·기기유지보수를 함께 판다 —
//        전표 총액이 잉크 코드 한 줄로 뭉친 것이다. 단가가 일관된 UV-NEW·UV-E413 만 남겨 1,174원.
//     ② 「TPM잉크 20L」 717만을 전사로 분류했으나 원본 품명이 「수성잉크(C)-18L」이다 → 수성.
//   ⇒ 값은 `settings.ink_cost_per_sqm_by_category` (JSON) 에 두고 **분류 축은 `items.category`**.
//   ⚠️ 맵에 없는 분류는 **0**이다. 공통값으로 흘리면 태극기(인쇄원단 매입)에 잉크가 붙는다.
//
// ★ 단위 — 원단 `avg_unit_cost` 는 **소요량과 같은 base 단위당 단가**다.
//   실측(AQ2-090): 459원/yd ÷ 0.823㎡/yd = ㎡당 558원 ≈ 매입 실적 568원. 환산 불필요.
//   ⚠️ 이 전제가 깨지는 자재가 나오면(base_unit 과 단가 축이 다른 품목) 원가가 pack_size 배로 튄다 —
//      [[design-stock-base-unit-rebase]] 의 50배 사고와 같은 축이다. 커버리지 리포트로 감시한다.
// ============================================================================
import type { D1Database } from '@cloudflare/workers-types'
import { selectRollPlacement, selectBoardMaterial, boardAreaSqm, type RollWidthSpec } from './rollConsumption'

/** 자재 1종 — product_materials + items 조인 결과 */
export interface CostMaterial extends RollWidthSpec {
  material_item_id: number
  material_name: string
  width_mm: number | null
  deduction_method: string
  sheet_spec: string | null
  waste_factor: number | null
  /** items.avg_unit_cost — base 단위당 단가 */
  avg_unit_cost: number | null
}

export interface LineCostInput {
  item_id: number | null
  /** cm */
  width: number | null
  /** cm */
  height: number | null
  quantity: number | null
  item_name?: string | null
  /** `items.category` — 잉크 ㎡단가 축(수성/솔벤/UV/전사/태극기/간판). 맵에 없으면 잉크 0. */
  category?: string | null
}

/**
 * 원가를 **못 낸** 이유. 「원가 0」과 「원가 미상」을 구분한다 —
 * 이 둘이 같아 보이면 커버리지가 거짓말을 한다(추정마진 탭이 겪은 함정).
 */
export type CostCoverage =
  | 'FULL'              // 자재도 단가도 있다
  | 'NO_ITEM'           // 품목 미연결(자유입력 라인)
  | 'NO_SIZE'           // 규격 0 — 소요량을 못 낸다
  | 'NO_MATERIAL_LINK'  // 품목은 있으나 product_materials 연결 없음
  | 'NO_PRICE'          // 자재는 골랐는데 avg_unit_cost 가 0
  | 'NO_DEDUCT'         // NONE(무차감)만 연결 — 의도된 0이지 미상이 아니다

export interface LineCost {
  /** 원단·판재 재료비 */
  material_cost: number
  /** 잉크비 (면적 × ㎡단가) */
  ink_cost: number
  /** material_cost + ink_cost */
  total_cost: number
  /** total_cost ÷ 수량 (수량 0이면 0) */
  unit_cost: number
  coverage: CostCoverage
  /** 근거 — 화면·감사에서 「왜 이 값인가」를 보여주기 위한 것 */
  detail: {
    material_item_id: number | null
    material_name: string | null
    /** base 단위 소요량 */
    required: number
    unit_price: number
    /** 잉크 계산에 쓴 면적(㎡) */
    area_sqm: number
  }
}

export interface CostOptions {
  /** 잉크 ㎡당 단가(원) — **분류 무관 단일값**. 아래 맵이 있으면 무시된다. 0이면 잉크비 미산입. */
  inkCostPerSqm?: number
  /**
   * 분류별 잉크 ㎡단가(`items.category` → 원/㎡).
   * 있으면 **이 맵만** 본다 — 없는 분류는 0이다(공통값으로 흘리지 않는다).
   */
  inkCostByCategory?: Record<string, number>
}

/** 라인에 적용할 잉크 ㎡단가. 맵이 있으면 맵만, 없으면 단일값. */
function inkRate(line: LineCostInput, opts: CostOptions): number {
  const map = opts.inkCostByCategory
  if (map) return Number(map[String(line.category ?? '')]) || 0
  return Number(opts.inkCostPerSqm) || 0
}

const EMPTY_DETAIL = { material_item_id: null, material_name: null, required: 0, unit_price: 0, area_sqm: 0 }

function zero(coverage: CostCoverage, areaSqm = 0): LineCost {
  return {
    material_cost: 0, ink_cost: 0, total_cost: 0, unit_cost: 0,
    coverage, detail: { ...EMPTY_DETAIL, area_sqm: areaSqm },
  }
}

/**
 * 라인 1건의 원가. **순수 함수** — DB 를 보지 않으므로 픽스처로 그대로 테스트된다.
 *
 * @param mats  이 제품(product_item_id)에 연결된 자재 목록. 없으면 NO_MATERIAL_LINK.
 * @param line  주문 라인(규격 cm)
 */
export function computeLineCost(
  mats: CostMaterial[] | undefined | null,
  line: LineCostInput,
  opts: CostOptions = {}
): LineCost {
  const pid = Number(line.item_id) || 0
  if (!(pid > 0)) return zero('NO_ITEM')

  const widthCm = Number(line.width) || 0
  const heightCm = Number(line.height) || 0
  const qty = Number(line.quantity) || 1
  if (widthCm <= 0 || heightCm <= 0) return zero('NO_SIZE')

  // 면적은 실규격 기준(청구면적 아님) — 청구는 10cm 올림·최소 1m 라 재료 소모와 다른 축이다.
  const areaSqm = (widthCm / 100) * (heightCm / 100) * qty
  const inkPerSqm = inkRate(line, opts)

  // ★잉크는 **자재 연결과 무관**하다 — 규격과 분류만 있으면 계산된다(2026-09-03 리뷰).
  //   자재를 못 골랐다고 잉크까지 0으로 버리면 같은 인쇄물이 BOM 유무로 잉크가 갈린다.
  const inkOnly = (coverage: CostCoverage): LineCost => {
    const ink = Math.round(areaSqm * inkPerSqm)
    return {
      material_cost: 0, ink_cost: ink, total_cost: ink,
      unit_cost: qty > 0 ? Math.round(ink / qty) : 0,
      coverage, detail: { ...EMPTY_DETAIL, area_sqm: areaSqm },
    }
  }

  if (!mats || mats.length === 0) return inkOnly('NO_MATERIAL_LINK')

  const outWmm = widthCm * 10
  const outHmm = heightCm * 10
  const rollMats = mats.filter((m) => m.deduction_method === 'ROLL' && m.width_mm != null)
  const boardMats = mats.filter((m) => m.deduction_method === 'BOARD')

  let picked: CostMaterial | null = null
  let required = 0

  if (rollMats.length > 0) {
    // 방향(가로↔세로)은 고정이 아니다 — 소요 최소 조합을 고른다(rollConsumption 정본).
    const p = selectRollPlacement(rollMats, outWmm, outHmm, qty)
    if (p) { picked = p.mat; required = p.qty }
  } else if (boardMats.length > 0) {
    const bm = selectBoardMaterial(boardMats, outWmm, outHmm)
    if (bm) {
      picked = bm
      // 판재만 waste_factor 를 쓴다 — 롤의 로스는 여기 넣지 않는다(위 헤더 참조).
      required = ((outWmm * outHmm) / 1e6) * qty * (Number(bm.waste_factor) || 1) / boardAreaSqm(bm.sheet_spec)
    }
  } else {
    // NONE(무차감)만 연결 — 의도된 0. 잉크는 붙일 수 있다.
    return inkOnly('NO_DEDUCT')
  }

  if (!picked) return inkOnly('NO_MATERIAL_LINK')

  const unitPrice = Number(picked.avg_unit_cost) || 0
  const materialCost = Math.round(required * unitPrice)
  const inkCost = Math.round(areaSqm * inkPerSqm)
  const total = materialCost + inkCost

  return {
    material_cost: materialCost,
    ink_cost: inkCost,
    total_cost: total,
    unit_cost: qty > 0 ? Math.round(total / qty) : 0,
    // 자재는 골랐는데 단가가 없으면 「0원」이 아니라 **미상**이다 — 커버리지에서 갈라 보여야 한다.
    coverage: unitPrice > 0 ? 'FULL' : 'NO_PRICE',
    detail: {
      material_item_id: picked.material_item_id,
      material_name: picked.material_name,
      required,
      unit_price: unitPrice,
      area_sqm: areaSqm,
    },
  }
}

/**
 * 제품 id 목록 → 자재 맵. `materialRequirement` 와 같은 조인이되 **avg_unit_cost 를 함께** 가져온다.
 * ⚠️ D1 바인드 한도 때문에 80개씩 청크로 나눈다(전례: 100 에서 터졌다).
 */
export async function loadCostMaterials(
  db: D1Database, productIds: number[]
): Promise<Map<number, CostMaterial[]>> {
  const out = new Map<number, CostMaterial[]>()
  const ids = [...new Set(productIds.filter((n) => Number(n) > 0))]
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80)
    const ph = chunk.map(() => '?').join(',')
    const { results } = await db.prepare(
      `SELECT pm.product_item_id, pm.material_item_id, i.item_name AS material_name,
              i.width_mm, COALESCE(i.deduction_method,'ROLL') AS deduction_method,
              i.sheet_spec, COALESCE(i.waste_factor,1.0) AS waste_factor,
              i.base_unit, i.unit, i.pack_size, i.avg_unit_cost
       FROM product_materials pm JOIN items i ON pm.material_item_id = i.id
       WHERE pm.product_item_id IN (${ph})`
    ).bind(...chunk).all<any>()
    for (const r of (results || [])) {
      const key = Number(r.product_item_id)
      const arr = out.get(key) || []
      arr.push(r as CostMaterial)
      out.set(key, arr)
    }
  }
  return out
}

/** 분류별 잉크 ㎡단가 설정 키 — 값은 JSON 객체(`{"수성":189,...}`). */
export const INK_BY_CATEGORY_KEY = 'ink_cost_per_sqm_by_category'

/**
 * settings 에서 **분류별** 잉크 ㎡단가 맵을 읽는다. 없거나 깨졌으면 undefined
 * (그러면 호출부가 단일값 폴백으로 간다).
 */
export async function loadInkCostByCategory(db: D1Database): Promise<Record<string, number> | undefined> {
  try {
    const row = await db
      .prepare(`SELECT setting_value FROM settings WHERE setting_key = ?`)
      .bind(INK_BY_CATEGORY_KEY)
      .first<{ setting_value: string }>()
    if (!row?.setting_value) return undefined
    const parsed = JSON.parse(row.setting_value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Number(v)
      if (Number.isFinite(n) && n >= 0) out[k] = n
    }
    return Object.keys(out).length > 0 ? out : undefined
  } catch (_) {
    return undefined
  }
}

/** settings 에서 잉크 ㎡단가를 읽는다. 없으면 0(잉크 미산입). */
export async function loadInkCostPerSqm(db: D1Database): Promise<number> {
  try {
    const row = await db
      .prepare(`SELECT setting_value FROM settings WHERE setting_key = 'ink_cost_per_sqm'`)
      .first<{ setting_value: string }>()
    const v = Number(row?.setting_value)
    return Number.isFinite(v) && v >= 0 ? v : 0
  } catch (_) {
    return 0
  }
}

/**
 * 주문 라인 묶음의 원가를 한 번에. 자재 로드는 1회(청크)만 하고 계산은 순수 함수에 위임한다.
 * 반환 순서는 입력 순서와 같다.
 */
export async function computeOrderLineCosts(
  db: D1Database, lines: LineCostInput[], opts?: CostOptions
): Promise<LineCost[]> {
  if (!lines || lines.length === 0) return []
  const matMap = await loadCostMaterials(db, lines.map((l) => Number(l.item_id) || 0))
  const inkCostByCategory = opts?.inkCostByCategory ?? (await loadInkCostByCategory(db))
  const inkCostPerSqm = opts?.inkCostPerSqm ?? (inkCostByCategory ? 0 : await loadInkCostPerSqm(db))
  return lines.map((l) => computeLineCost(matMap.get(Number(l.item_id) || 0), l, { inkCostPerSqm, inkCostByCategory }))
}
