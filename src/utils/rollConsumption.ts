// ============================================================================
// ROLL 자재 소비량 산정 — 재고 단위별 환산 단일 소스
// ----------------------------------------------------------------------------
// 같은 산식이 인쇄차감(autoDeductInventory)·후가공차감(autoDeductPostProcessingMaterials)·
// 소요량계획(materialRequirement) 3곳에 흩어져 있어 한 곳만 고치면 나머지가 갈리던 것을 통합.
//
// ★ 단위 3층 구조 (2026-07-29 사용자 확인)
//   items.unit       = **입고·발주 단위**   — '롤' 또는 'yd'
//   items.base_unit  = **재고·소모 단위**   — 'M'(미터) / 'cm' / NULL(=yd)
//   items.pack_size  = 롤당 길이(미터)      — 입고 시 롤 → 미터 환산 계수
//
//   원단은 **롤로 사 와서 미터로 잘라 쓴다**. 그래서 재고는 미터로 들고 소모도 미터로 뺀다.
//   pack_size 는 차감이 아니라 **입고 환산**에 쓰인다(50m 롤 3개 입고 → 재고 150m).
//   반면 현수막 계열은 yd 로 입고를 체크하므로 재고·소모가 모두 yd 다(base_unit NULL).
//
//   ⚠️ 차감은 base_unit 만 본다. unit 은 보지 않는다 — 사 오는 단위와 쓰는 단위는 별개다.
//      (초기 구현에서 unit='롤' 이면 롤 수로 차감했는데, 0.06롤 같은 값이 나와 실무와 맞지 않았다)
// ============================================================================

export interface RollUnitSpec {
  /** items.base_unit — 재고·소모 단위. 'M'=미터 / 'cm' / NULL=yd */
  base_unit?: string | null
  /** items.unit — 입고·발주 단위('롤'/'yd'). 차감 계산에는 쓰지 않는다. */
  unit?: string | null
  /** items.pack_size — 롤당 길이(미터). 입고 환산용(롤 → m). */
  pack_size?: number | null
}

export interface RollConsumption {
  /** 재고에서 뺄 수량 (아래 unit 기준) */
  qty: number
  /** 차감 단위 — 'm' | 'cm' | 'yd' */
  unit: string
}

/**
 * 출력 길이(mm) → 재고 차감량.
 *
 * @param m         자재의 단위 설정 (base_unit 이 판정 기준)
 * @param lengthMm  출력 길이(mm) — 보통 print_event.output_height
 * @param copies    매수 (copy_total)
 */
export function computeRollConsumption(
  m: RollUnitSpec,
  lengthMm: number,
  copies: number = 1
): RollConsumption {
  const len = Number(lengthMm) || 0
  const n = Number(copies) || 1
  const base = String(m?.base_unit ?? '').toLowerCase()

  // ① 미터 재고 — 롤로 입고해 미터로 소모하는 자재(시트·코팅지·후렉스·매쉬 등)
  if (base === 'm') {
    return { qty: (len / 1000) * n, unit: 'm' }
  }

  // ② cm 재고 (MU4)
  if (base === 'cm') {
    return { qty: (len / 10) * n, unit: 'cm' }
  }

  // ③ 기본 = 야드 — yd 로 입고를 체크하는 현수막 계열
  return { qty: (len / 914.4) * n, unit: 'yd' }
}

/**
 * 입고 수량 → 재고 수량 환산.
 * 롤로 입고하는 자재는 재고를 미터로 들기 때문에 `롤 개수 × 롤당 길이` 로 바꿔 쌓아야 한다.
 * 그 외(yd 입고 등)는 입고 수량이 곧 재고 수량이다.
 */
export function convertReceiptToStock(m: RollUnitSpec, receiptQty: number): number {
  const qty = Number(receiptQty) || 0
  const pack = Number(m?.pack_size) || 0
  const base = String(m?.base_unit ?? '').toLowerCase()
  if (m?.unit === '롤' && base === 'm' && pack > 0) return qty * pack
  return qty
}

/** 소요량 표기용 단위 라벨 — computeRollConsumption 과 동일 규칙 (BOARD 는 호출측에서 '장'). */
export function resolveStockUnit(m: RollUnitSpec): string {
  const base = String(m?.base_unit ?? '').toLowerCase()
  if (base === 'm') return 'm'
  if (base === 'cm') return 'cm'
  return 'yd'
}
