// ============================================================================
// ROLL 자재 소비량 산정 — 재고 단위별 환산 단일 소스
// ----------------------------------------------------------------------------
// 같은 산식이 인쇄차감(autoDeductInventory)·후가공차감(autoDeductPostProcessingMaterials)·
// 소요량계획(materialRequirement) 3곳에 흩어져 있어 한 곳만 고치면 나머지가 갈리던 것을 통합.
//
// ★ 왜 롤 분기가 필요한가 (2026-07-29)
//   매입은 EA(롤)로 들어오는데(SPM011G-127 = 10 EA × 112,200원 = 롤 10개) 차감은 야드로
//   빠지고 있었다. 재고 단위가 '롤'인 자재에 야드 수치를 빼면 롤 하나가 몇 미터인지와 무관하게
//   수십 배 과차감된다. pack_size(롤당 길이, 미터)를 도입해 롤 수로 환산한다.
//
// ⚠️ 우선순위가 곧 회귀 범위다. `unit === '롤'` 인 자재만 새 경로를 타고, 나머지는
//    기존 계산(cm / yd)이 그대로 유지된다 — 현수막 계열은 yd 로 입고를 체크하므로 옳은 동작이다.
// ============================================================================

export interface RollUnitSpec {
  /** items.unit — 재고·발주에 쓰는 표시 단위. '롤'이면 롤 수로 차감한다. */
  unit?: string | null
  /** items.base_unit — 'cm' 자재만 cm 로 차감(MU4). 그 외는 yd. */
  base_unit?: string | null
  /** items.pack_size — 롤당 길이(미터). 롤 차감의 분모. */
  pack_size?: number | null
}

export interface RollConsumption {
  /** 재고에서 뺄 수량 (아래 unit 기준) */
  qty: number
  /** 차감 단위 — '롤' | 'cm' | 'yd' */
  unit: string
}

/**
 * 출력 길이(mm) → 재고 차감량.
 *
 * @param m         자재의 단위 설정 (unit / base_unit / pack_size)
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
  const pack = Number(m?.pack_size) || 0

  // ① 롤 단위 재고 — 소비 롤수 = 출력길이(m) ÷ 롤당 길이(m)
  //    pack_size 가 없으면 나눌 수가 없으므로 롤로 치지 않고 아래 경로로 폴백한다
  //    (단위만 '롤'이고 롤길이는 모르는 미완성 데이터를 과차감으로 만들지 않기 위함).
  if (m?.unit === '롤' && pack > 0) {
    return { qty: (len / 1000 / pack) * n, unit: '롤' }
  }

  // ② cm 자재 (MU4)
  if (m?.base_unit === 'cm') {
    return { qty: (len / 10) * n, unit: 'cm' }
  }

  // ③ 기본 = 야드
  return { qty: (len / 914.4) * n, unit: 'yd' }
}

/** 소요량 표기용 단위 라벨 — computeRollConsumption 과 동일 규칙 (BOARD 는 호출측에서 '장'). */
export function resolveStockUnit(m: RollUnitSpec): string {
  if (m?.unit === '롤' && (Number(m?.pack_size) || 0) > 0) return '롤'
  if (m?.base_unit === 'cm') return 'cm'
  return 'yd'
}
