// ============================================================================
// 주문 라인 원가 산정 (재료비 + 잉크)
// ----------------------------------------------------------------------------
// ★ 왜 필요한가 — `order_items.total_cost` 는 **쓰기 경로가 아예 없어 전량 0**이다
//   (2026년 22,973줄 실측). 그래서 /reports 수익성 탭은 `items.avg_unit_cost × 수량` 이라는
//   **매입-재판매 가정**으로만 마진을 추정해 왔고, 제조 인쇄물에는 무의미했다(커버리지 ~19%).
//   제조물의 원가는 「어느 원단을 얼마나 쓰는가」에서 나온다 — 그 계산은 이미 있다.
//
// ★ 산식은 새로 만들지 않는다 — `rollConsumption.resolveLineMaterials` 가 정본이고
//   소요량계획(materialRequirement)이 **같은 함수·같은 로더**를 쓴다(2026-09-03 2차 통합).
//   인쇄차감(autoDeductInventory)도 같은 함수를 지나되 **옵션이 다르다** —
//   출력 이벤트는 RIP 이 방향을 이미 정했으므로 회전·분할 폴백을 쓰지 않는다(그쪽 주석).
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
import { resolveLineMaterials, type LineMaterialSpec } from './rollConsumption'

/**
 * 자재 1종 — product_materials + items 조인 결과.
 * ★선택·소요 규칙은 `rollConsumption.resolveLineMaterials` 하나뿐이라 이 타입도 그쪽
 *   `LineMaterialSpec` 을 좁힌 것이고, **계획 로더도 같은 타입을 쓴다**.
 */
export interface CostMaterial extends LineMaterialSpec {
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
  | 'PARTIAL'           // 일부만 산정 — 단가 없는 자재가 섞였거나 usage_type 미구현(PER_LED)
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
    /** 대표 자재 = 금액이 가장 큰 행. 간판처럼 여러 종이 잡히면 `materials` 가 전부를 담는다. */
    material_item_id: number | null
    material_name: string | null
    /** base 단위 소요량 — 대표 자재 기준 */
    required: number
    unit_price: number
    /** 잉크 계산에 쓴 면적(㎡) */
    area_sqm: number
    /**
     * 적용한 잉크 ㎡단가. **null = 규칙 없음**(분류가 맵에 없다) · 0 = **명시적 0**이다.
     * 둘을 갈라야 호출부가 「cost_standards 로 메울 것인가」를 판단할 수 있다 —
     * 태극기(0)를 미상으로 보면 인쇄원단 매입분에 잉크가 다시 붙는다.
     */
    ink_per_sqm: number | null
    /** 잡힌 자재 전부 — 간판 BOM 처럼 여러 종이 함께 나오는 경우 */
    materials: Array<{ material_item_id: number; material_name: string | null; required: number; unit_price: number; cost: number }>
    /** 산정 규칙 미구현으로 **빠진** BOM 행(usage_type). 있으면 FULL 이 될 수 없다. */
    unsupported: string[]
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

/**
 * 라인에 적용할 잉크 ㎡단가. 맵이 있으면 맵만, 없으면 단일값.
 * **null = 규칙 없음** — 맵에 그 분류가 없거나 단일값도 안 넘어온 상태다. 0(명시적 무잉크)과 다르다.
 */
function inkRate(line: LineCostInput, opts: CostOptions): number | null {
  const map = opts.inkCostByCategory
  if (map) {
    const key = String(line.category ?? '')
    if (!Object.prototype.hasOwnProperty.call(map, key)) return null
    const v = Number(map[key])
    return Number.isFinite(v) ? v : null
  }
  if (opts.inkCostPerSqm === undefined || opts.inkCostPerSqm === null) return null
  const v = Number(opts.inkCostPerSqm)
  return Number.isFinite(v) ? v : null
}

const EMPTY_DETAIL = {
  material_item_id: null, material_name: null, required: 0, unit_price: 0, area_sqm: 0,
  ink_per_sqm: null as number | null,
  materials: [] as LineCost['detail']['materials'],
  unsupported: [] as string[],
}

function zero(coverage: CostCoverage, areaSqm = 0, inkPerSqm: number | null = null): LineCost {
  return {
    material_cost: 0, ink_cost: 0, total_cost: 0, unit_cost: 0,
    coverage,
    detail: { ...EMPTY_DETAIL, area_sqm: areaSqm, ink_per_sqm: inkPerSqm, materials: [], unsupported: [] },
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

  const qty = Number(line.quantity) || 1
  const inkPerSqm = inkRate(line, opts)

  // ★자재 선택·소요는 **여기서 계산하지 않는다** — `resolveLineMaterials` 가 정본이고
  //   소요량계획(materialRequirement)이 같은 함수를 지난다. 사본을 두면 둘이 갈린다.
  //   (면적은 실규격 기준이다. 청구는 10cm 올림·최소 1m 라 재료 소모와 다른 축이다.)
  const res = resolveLineMaterials(mats, line)
  const areaSqm = res.areaSqm
  // ★잉크는 **자재 연결과 무관**하다 — 규격과 분류만 있으면 계산된다(2026-09-03 리뷰).
  //   자재를 못 골랐다고 잉크까지 0으로 버리면 같은 인쇄물이 BOM 유무로 잉크가 갈린다.
  const inkCost = Math.round(areaSqm * (inkPerSqm ?? 0))
  // ⚠️ 자재를 하나도 못 골랐을 때도 `unsupported` 는 실어 보낸다 — **전부 미구현 규칙이라
  //    비었을 때**가 정확히 이 경로다. 여기서 빈 배열로 덮으면 「왜 0원인가」가 사라진다.
  const unsupportedAll = res.unsupported.map((u) => u.usage_type)
  const inkOnly = (coverage: CostCoverage): LineCost => ({
    material_cost: 0, ink_cost: inkCost, total_cost: inkCost,
    unit_cost: qty > 0 ? Math.round(inkCost / qty) : 0,
    coverage,
    detail: { ...EMPTY_DETAIL, area_sqm: areaSqm, ink_per_sqm: inkPerSqm, materials: [], unsupported: unsupportedAll },
  })

  if (res.reason === 'NO_SIZE') return zero('NO_SIZE', 0, inkPerSqm)
  if (res.reason === 'NO_MATERIAL_LINK') return inkOnly('NO_MATERIAL_LINK')
  // NONE(무차감)만 연결 — 의도된 0. 잉크는 붙일 수 있다.
  if (res.reason === 'NO_DEDUCT') return inkOnly('NO_DEDUCT')

  const materials = res.picks.map((p) => {
    const unitPrice = Number(p.mat.avg_unit_cost) || 0
    return {
      material_item_id: p.mat.material_item_id,
      material_name: p.mat.material_name ?? null,
      required: p.required,
      unit_price: unitPrice,
      cost: Math.round(p.required * unitPrice),
    }
  })
  const materialCost = materials.reduce((sum, m) => sum + m.cost, 0)
  const total = materialCost + inkCost
  const unsupported = unsupportedAll
  const pricedCount = materials.filter((m) => m.unit_price > 0).length

  // 커버리지 = 「원가 0」과 「원가 미상」을 가르는 값이다.
  //   FULL      전 자재에 단가가 있고 빠진 BOM 행도 없다
  //   NO_PRICE  자재는 골랐는데 **단가가 하나도 없다** — 0원이 아니라 미상이다
  //   PARTIAL   일부만 산정됐다(단가 없는 자재가 섞였거나 usage_type 미구현) — FULL 로 부르면 거짓말이다
  let coverage: CostCoverage = 'FULL'
  if (pricedCount === 0) coverage = 'NO_PRICE'
  else if (pricedCount < materials.length || unsupported.length > 0) coverage = 'PARTIAL'

  const lead = materials.reduce<typeof materials[number] | null>(
    (best, m) => (best === null || m.cost > best.cost ? m : best), null)

  return {
    material_cost: materialCost,
    ink_cost: inkCost,
    total_cost: total,
    unit_cost: qty > 0 ? Math.round(total / qty) : 0,
    coverage,
    detail: {
      material_item_id: lead?.material_item_id ?? null,
      material_name: lead?.material_name ?? null,
      required: lead?.required ?? 0,
      unit_price: lead?.unit_price ?? 0,
      area_sqm: areaSqm,
      ink_per_sqm: inkPerSqm,
      materials,
      unsupported,
    },
  }
}

/**
 * 제품 id 목록 → 자재 맵. **원가와 소요량계획이 이 로더 하나만 쓴다**(`materialRequirement` 가 이걸 부른다).
 *
 * ★2026-09-03 2차 통합 — 계획 쪽에 같은 조인이 한 벌 더 있었다. 1차에서 `avg_unit_cost` 를
 *   그쪽에도 넣어 값은 맞췄지만, **쿼리가 둘이면 다음 컬럼에서 또 갈린다** — 실제로 `usage_*`(0508)
 *   가 양쪽 모두에 없어 간판 BOM 의 LED·프레임이 조용히 탈락하고 있었다. 그래서 쿼리를 하나로 합쳤다.
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
              i.base_unit, i.unit, i.pack_size, i.avg_unit_cost,
              pm.quantity, pm.usage_type, pm.usage_param
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
 *
 * ★**유일한 조합 경로**다 — 종전엔 호출부가 0인 채로, 같은 3단 레시피(자재 로드 + 잉크 단가 +
 *   라인 계산)가 `costCalculator.recalculateOrderCosts` 와 `routes/costs.ts` 백필에 각각 인라인돼
 *   있었다. 셋이 갈리면 **저장되는 원가와 백필이 보고하는 커버리지가 서로 다른 규칙**이 된다.
 */
export async function computeOrderLineCosts(
  db: D1Database, lines: LineCostInput[], opts?: CostOptions
): Promise<LineCost[]> {
  if (!lines || lines.length === 0) return []
  const matMap = await loadCostMaterials(db, lines.map((l) => Number(l.item_id) || 0))
  const inkCostByCategory = opts?.inkCostByCategory ?? (await loadInkCostByCategory(db))
  // 맵이 있으면 단일값은 **넘기지 않는다**(undefined) — 분류별 명시적 0 이 공통값으로 되살아나면 안 된다.
  const inkCostPerSqm = opts?.inkCostPerSqm ?? (inkCostByCategory ? undefined : await loadInkCostPerSqm(db))
  return lines.map((l) => computeLineCost(matMap.get(Number(l.item_id) || 0), l, { inkCostPerSqm, inkCostByCategory }))
}
