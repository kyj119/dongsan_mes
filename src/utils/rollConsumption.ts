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
  /** items.base_unit — 재고·소모 단위. 'M'=미터 / 'cm' / 'L'(잉크) / NULL=품목 단위 따름 */
  base_unit?: string | null
  /** items.unit — 입고·발주 단위('롤'/'yd'/'통'/'EA'). 차감 **계산**에는 쓰지 않는다(표기 폴백에만). */
  unit?: string | null
  /** items.pack_size — 롤당 길이(미터). 입고 환산용(롤 → m). */
  pack_size?: number | null
  /** items.deduction_method — 'ROLL' | 'BOARD' | 'NONE'. base_unit 이 비었을 때 표기 판정에 쓴다. */
  deduction_method?: string | null
}

// ============================================================================
// BOARD 자재 선택 — 판재도 롤과 같은 「맞는 것 중 가장 작은 것」 규칙을 쓴다
// ----------------------------------------------------------------------------
// ★ 2026-08-27: 두 호출부가 `boardMats[0]` 이었다. 「제품→해당 두께 보드 1종」이라는 전제였는데
//   그 전제가 깨졌다 — UV 포맥스 10종은 BOM 에 **같은 자재의 3x6·4x8 두 규격**이 들어 있다.
//   `mats` 쿼리에 `ORDER BY` 가 없어 `[0]` 은 **행 순서**고, 3x6(1.674㎡)이냐 4x8(2.977㎡)이냐에 따라
//   소요량이 **1.78배** 갈렸다. 표시가 아니라 **어느 자재가 처리되는지**가 바뀌는 선택 경로다.
//   → 롤이 「출력폭 이상인 최소폭」을 고르듯, 판재는 **출력물이 들어가는 최소 장**을 고른다.
// ============================================================================

/** 지원 판재 규격 — 면적(㎡)과 실치수(mm). 값을 늘리면 두 호출부에 동시에 반영된다. */
export const BOARD_SHEETS: Record<string, { w: number; h: number }> = {
  '3x6': { w: 915, h: 1830 },
  '4x8': { w: 1220, h: 2440 },
}
const DEFAULT_SHEET = '4x8'

/** 판재 1장의 면적(㎡). 미지원·미기입이면 4x8 로 폴백한다(감사 F6 가 그 상태를 게이트로 잡는다). */
export function boardAreaSqm(sheetSpec?: string | null): number {
  const s = BOARD_SHEETS[String(sheetSpec ?? '')] ?? BOARD_SHEETS[DEFAULT_SHEET]
  return (s.w * s.h) / 1e6
}

export interface BoardSpec {
  material_item_id?: number | null
  sheet_spec?: string | null
}

/**
 * 판재 후보 중 **출력물이 들어가는 가장 작은 장**을 고른다. 회전(가로↔세로)은 허용한다.
 * 들어가는 장이 없으면 **가장 큰 장**을 돌려준다(롤에서 최대폭 분할출력으로 폴백하는 것과 같은 취지).
 * ★면적이 같으면 `material_item_id` 로 tie-break — 행 순서에 의존하지 않게 한다.
 */
export function selectBoardMaterial<T extends BoardSpec>(
  mats: T[], outWidthMm: number, outHeightMm: number
): T | null {
  if (!mats || mats.length === 0) return null
  const sorted = [...mats].sort((a, b) =>
    boardAreaSqm(a.sheet_spec) - boardAreaSqm(b.sheet_spec) ||
    Number(a.material_item_id ?? 0) - Number(b.material_item_id ?? 0))
  const fits = sorted.find((m) => {
    const s = BOARD_SHEETS[String(m.sheet_spec ?? '')] ?? BOARD_SHEETS[DEFAULT_SHEET]
    return (outWidthMm <= s.w && outHeightMm <= s.h) || (outWidthMm <= s.h && outHeightMm <= s.w)
  })
  return fits ?? sorted[sorted.length - 1]
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

// ── 입고 환산은 여기가 아니다 ────────────────────────────────────────────────
// 입고 수량(관리단위) → 재고 수량(base) 환산은 **#462 MU3 로 이미 구현돼 있다**:
//   routes/inventory.ts        입고 등록 / 입고 취소 역분개
//   routes/purchaseOrders/po-receive.ts   발주 입고
// 규칙은 `pack_size > 0 이면 × pack_size, 아니면 ×1`. 이 파일에 같은 함수를 또 두면
// 규칙이 둘이 되어 갈린다 — 입고 쪽을 고칠 일이 있으면 위 두 파일을 고칠 것.
// (2026-07-29: 취소 경로만 환산이 빠져 있어 비대칭이었고, 같은 회차에 맞췄다.)

/**
 * 재고 수량에 붙일 **단위 라벨**.
 *
 * ⚠️ computeRollConsumption 과 같은 규칙이 아니다 — 그건 **ROLL 자재만** 통과하는 함수라
 *    "m/cm 아니면 yd" 로 끝나도 됐지만, 이 함수는 **전 품목**이 지나간다(주간 실사 라인 전개·출고 저재고 알림).
 *    그래서 종전 폴백이 잉크·판재·부속까지 **전부 「yd」로 찍고 있었다**(2026-08-26 수정).
 *    prod 실측 = base_unit 'L' 83품목(잉크) + base_unit 없는 비-ROLL 445품목이 오표기 대상이었다.
 *
 * 규칙:
 *   ① base_unit 이 있으면 **그대로** 쓴다 — 재고 수량이 실제로 그 단위로 저장돼 있다('M'→m, 'L'→L).
 *   ② base_unit 이 없고 ROLL 차감이면 'yd' — computeRollConsumption 이 yd 로 빼므로 재고도 yd 다.
 *   ③ base_unit 이 없고 BOARD 차감이면 '장'.
 *   ④ 나머지는 품목 자신의 단위(items.unit). 입고단위와 재고단위가 갈리지 않는 자재다.
 */
export function resolveStockUnit(m: RollUnitSpec): string {
  const base = String(m?.base_unit ?? '').trim()
  if (base) {
    const lower = base.toLowerCase()
    if (lower === 'm') return 'm'
    if (lower === 'cm') return 'cm'
    return base
  }
  const method = String(m?.deduction_method ?? '').trim().toUpperCase()
  if (method === 'ROLL') return 'yd'
  if (method === 'BOARD') return '장'
  return String(m?.unit ?? '').trim()
}
