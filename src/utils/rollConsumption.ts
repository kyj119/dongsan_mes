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

// ============================================================================
// ROLL 배치 선택 — 어느 원단을, 어느 방향으로 쓸 것인가
// ----------------------------------------------------------------------------
// ★ 2026-09-02: 종전 소요량 계산은 `width`=폭 / `height`=길이로 **고정**해 놓고 있었다.
//   그런데 주문 라인의 가로·세로는 방향이 고정돼 있지 않다 — 수성 현수막 6,369라인 실측에서
//   **5,496라인(86%·면적 94.5%)이 width > height**, 즉 width 가 길이였다.
//   450×90 현수막이면 실제로는 「폭 900mm 원단에 4500mm 길이」인데,
//   종전 로직은 「폭 4500mm 필요 → 최대폭 3200mm 로 2분할, 길이 900mm」로 읽어
//   소요량이 **2.5배 과소**로 나왔다(4.92yd → 1.97yd). 주간발주·부족체크가 그 값을 쓰고 있었다.
//
// ★★ 원단·분할은 **사람이 주문서에서 고른다**(용준님 확인 2026-09-02).
//   원단 폭마다 매입가가 달라 **청구 단가 자체가 달라지므로** 영업이 주문 받을 때 이미 정한다.
//   그러니 이 함수는 **그 선택을 대신하는 게 아니라, 선택이 기록돼 있지 않을 때의 추정**이다.
//   (현재 `order_items` 에 원단·폭·분할을 담을 컬럼이 없고 `size_grade_prices` 도 0행이다.)
//
// ★★★ 그래서 **분할 조합을 자동으로 만들어 최저가를 찾지 않는다.**
//   찾게 두면 언제나 「잘라 이어붙여라」로 수렴한다 — 좁은 폭이 ㎡당 싸고(900폭 558원/㎡ ·
//   1800폭 634 · 3200폭 1,619) **이음(봉제) 비용이 0**이기 때문이다. 실제 AQ2 23종으로 돌린 결과:
//     450× 90 → 900폭 무분할  (맞다)
//     450×300 → 900폭 **5분할** (틀렸다)
//     600×300 → 900폭 **7분할** (틀렸다)
//   봉제선은 재료비가 아니라 인건비·품질에서 비용이 나므로 재료비 최소화로는 절대 억제되지 않는다.
//
// ★ 규칙 = **원단 폭 안에 통으로 들어가는 조합만 후보**. 두 방향(가로↔세로)은 그대로 본다 —
//   두 변이 모두 폭 이하면 **긴 쪽을 폭**으로 둬야 길이가 줄어 소요가 적다.
//   어느 원단에도 안 들어갈 때만 **최대 폭 1종으로, 분할 수 최소**로 나눈다(`fitted=false`).
//
// ★ 「덜 쓴다」의 기준은 **소요량(yd)이 아니다**. 자체검증이 이걸 잡았다 —
//   450×90 을 폭 3200 원단에 2분할하면 1.97yd 로 폭 900 원단(4.92yd)보다 yd 가 적다.
//   그러나 실제로 쓰는 **면적은 5.76㎡ vs 4.05㎡** 로 더 크고, **금액은 9,327원 vs 2,259원** 으로 4배다.
//
// ★★★★ 기준은 **후보 전체가 아니라 「단가 있는 후보」로 먼저 따진다**(2026-09-03 리뷰 지적).
//   종전엔 `every(단가>0)` 이라 **한 번도 사 본 적 없는 원단 1종이 BOM 에 있으면 제품 전체가 면적 기준**으로
//   떨어졌고, 그 미상 원단이 뽑히면 원가가 **NO_PRICE → 0** 이 됐다. prod 실측 18개 제품이 그 상태였다.
//   `avg_unit_cost = 0` 은 **「공짜」가 아니라 「미상」**이다. 그래서 3단계로 본다:
//     ① 단가 있는 후보 중 **통으로 들어가는 것**이 있으면 → 그중 **금액** 최소
//     ② 없으면 전 후보로 → **면적** 최소 (미상 원단이 뽑히면 NO_PRICE 로 정직하게 보고된다)
//     ③ 그래도 없으면(어느 원단에도 안 들어감) 최대 폭 1종·분할 최소 폴백
//   ⇒ ①이 ②를 덮으므로 **미상 원단 1종이 멀쩡한 라인의 원가를 0으로 만들지 못한다.**
//   ⚠️ 대신 ①은 「단가 있는 것으로 대체」다 — 실제로 미상 원단을 썼다면 원가가 그만큼 어긋난다.
//      근본 해결은 주문 라인에 **선택한 원단을 기록**하는 것이다(별도 트랙).
//
// ⚠️ 원가(`orderLineCost`)와 소요량계획(`materialRequirement`)이 **같은 후보 목록**을 넘겨야 둘이 갈리지 않는다 —
//    계획 쪽이 `avg_unit_cost` 를 안 실어 보내면 같은 라인에서 **다른 원단**을 고른다(2026-09-03 리뷰가 실증).
//    그래서 `materialRequirement` 의 로더도 단가를 함께 읽는다.
//
// ⚠️ BOARD 는 손대지 않는다 — `selectBoardMaterial` 이 이미 회전을 허용한다.
// ============================================================================

export interface RollPlacement<T> {
  /** 선택된 자재 */
  mat: T
  /** 재고에서 뺄 수량 (base 단위) */
  qty: number
  /** 원단 폭에 대응시킨 변(mm) */
  widthMm: number
  /** 길이 방향으로 뽑는 변(mm) */
  lengthMm: number
  /** 폭 분할 횟수(1 = 분할 없음) */
  splits: number
  /**
   * 원단 폭 안에 **통으로** 들어갔는가.
   * false = 어느 원단에도 안 들어가 최대 폭으로 나눈 폴백이다 — 실제로는 사람이 다른 원단을
   * 골랐을 수 있으므로 **추정으로 표시**해야 한다.
   */
  fitted: boolean
}

export interface RollWidthSpec extends RollUnitSpec {
  width_mm?: number | null
}

type RollCandidate = RollWidthSpec & { material_item_id?: number | null; avg_unit_cost?: number | null }

/**
 * ROLL 자재 후보 중 **원단 폭 안에 통으로 들어가는 (자재 × 방향)** 조합을 고른다.
 *
 * @param mats   `deduction_method='ROLL'` 이고 `width_mm` 이 있는 자재 후보
 * @param aMm    주문 라인의 한 변(mm)
 * @param bMm    주문 라인의 다른 변(mm)
 * @param copies 수량
 *
 * tie-break = 금액(또는 면적) → 분할 적은 것 → 폭 좁은 것 → `material_item_id`.
 * (정렬 없는 행 순서에 의존하면 같은 주문이 실행마다 다른 자재를 고른다 — 판재에서 겪은 함정)
 */
export function selectRollPlacement<T extends RollCandidate>(
  mats: T[], aMm: number, bMm: number, copies: number = 1
): RollPlacement<T> | null {
  if (!mats || mats.length === 0) return null
  const a = Number(aMm) || 0
  const b = Number(bMm) || 0
  if (a <= 0 || b <= 0) return null

  const usable = mats.filter((m) => (Number(m.width_mm) || 0) > 0)
  if (usable.length === 0) return null
  const priced = usable.filter((m) => (Number(m.avg_unit_cost) || 0) > 0)

  /** 한 pool 안에서 최선 1개. `byPrice` 로 비교 기준을 바꾼다. */
  const pick = (pool: T[], byPrice: boolean, splitFallback: boolean): RollPlacement<T> | null => {
    let best: RollPlacement<T> | null = null
    let bestScore = Infinity
    const consider = (m: T, widthMm: number, lengthMm: number, splits: number, fitted: boolean): void => {
      const qty = computeRollConsumption(m, lengthMm, copies).qty * splits
      if (qty <= 0) return
      const w = Number(m.width_mm) || 0
      // 면적 = 원단 폭 × 길이 × 분할 — 잔폭은 이 라인이 쓴 것으로 본다(단일 주문 기준).
      const score = byPrice
        ? qty * (Number(m.avg_unit_cost) || 0)
        : (w / 1000) * (lengthMm / 1000) * copies * splits
      const prev = best
      if (
        prev === null ||
        score < bestScore - 1e-9 ||
        (Math.abs(score - bestScore) <= 1e-9 && (
          splits < prev.splits ||
          (splits === prev.splits && (
            w < (Number(prev.mat.width_mm) || 0) ||
            (w === (Number(prev.mat.width_mm) || 0) &&
              Number(m.material_item_id ?? 0) < Number(prev.mat.material_item_id ?? 0))
          ))
        ))
      ) {
        best = { mat: m, qty, widthMm, lengthMm, splits, fitted }
        bestScore = score
      }
    }

    if (!splitFallback) {
      // 무분할 — 한 변이 원단 폭 안에 들어가는 조합만 본다.
      for (const m of pool) {
        const w = Number(m.width_mm) || 0
        for (const [widthMm, lengthMm] of [[a, b], [b, a]] as Array<[number, number]>) {
          if (widthMm <= w) consider(m, widthMm, lengthMm, 1, true)
        }
      }
      return best
    }

    // 폴백 — 어느 원단에도 통으로 안 들어간다. **최대 폭**으로, **분할 수가 최소**가 되게 나눈다.
    // (여기서 폭을 더 좁혀 가며 최저가를 찾으면 ★★★ 의 분할 폭주가 그대로 되살아난다)
    const maxW = Math.max(...pool.map((m) => Number(m.width_mm) || 0))
    if (!(maxW > 0)) return null
    const minSplits = Math.min(Math.ceil(a / maxW), Math.ceil(b / maxW))
    for (const m of pool) {
      if ((Number(m.width_mm) || 0) !== maxW) continue
      for (const [widthMm, lengthMm] of [[a, b], [b, a]] as Array<[number, number]>) {
        if (Math.ceil(widthMm / maxW) !== minSplits) continue
        consider(m, widthMm, lengthMm, minSplits, false)
      }
    }
    return best
  }

  // ① 단가 있는 후보 중 통으로 들어가는 것 → 금액 최소
  if (priced.length > 0) {
    const byPriceFit = pick(priced, true, false)
    if (byPriceFit) return byPriceFit
  }
  // ② 없으면 전 후보 → 면적 최소 (미상 원단이 뽑히면 NO_PRICE 로 보고된다)
  const byAreaFit = pick(usable, false, false)
  if (byAreaFit) return byAreaFit
  // ③ 어느 원단에도 안 들어간다 → 최대 폭·분할 최소
  return pick(usable, priced.length === usable.length, true)
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
