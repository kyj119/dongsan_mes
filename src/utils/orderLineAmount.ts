/**
 * 주문 라인 금액 = 단일 소스.
 *
 * 같은 산식(10cm 올림 → 최소 1m → 면적 → 100원 반올림)이 서버 5곳(create 3 · update 2)과 클라 2곳에
 * 복붙돼 있었다. 규칙이 여러 곳이면 갈린다 — 이 프로젝트가 이미 확립한 정리 패턴
 * (utils/rollConsumption · services/messageBulkLimit · 패널 stripFinishing)을 그대로 적용한다.
 *
 * ★금액은 파생값이다: `단가 × 면적(10cm 올림) × 수량` → 100원 반올림.
 *   사용자가 금액을 손으로 덮는 것은 = **행 에누리(할인)** 라는 의미로 확정됐다(2026-07-30).
 *   그래서 여기서 세 값을 함께 낸다:
 *     auto     = 자동 계산값(스냅샷으로 저장 → 나중에 단가·규칙이 바뀌어도 재현 가능)
 *     final    = 실제 청구 금액(= order_items.amount, 기존 소비자가 읽는 그 값)
 *     discount = auto - final (추가작업비로 증액이면 음수)
 *
 * 서버는 클라 금액을 **범위 제한 없이 수용**한다(사용자 결정) — 대신 auto·discount·사유·수정자를
 * 전부 기록해 사후 추적으로 감당한다. 범위로 막으면 정상 에누리까지 막힌다.
 *
 * ⚠️ 짝이 되는 화면 구현 = `src/scripts/orderForm/calc.js` 의 calcItem(). 언어가 달라 코드를
 *    공유할 수 없는 유일한 지점이므로 **규칙을 바꿀 때는 반드시 두 곳을 함께** 고친다.
 *    갈리면 "화면 금액과 저장 금액이 다른" 상태가 된다(수동 수정이 없으면 서버 자동값이 저장된다).
 */

export type PricingMethod = 'AREA' | 'FIXED' | string

export interface LineAmountInput {
  unit_price?: number | null
  quantity?: number | null
  width_mm?: number | null
  width?: number | null
  height_mm?: number | null
  height?: number | null
  /**
   * 클라가 보낸 수동 금액(에누리 의도). 없으면 자동값을 그대로 쓴다.
   * string 도 허용 — JSON 본문이 문자열로 올 수 있고, 여기서 한 번에 정규화하는 편이 안전하다.
   */
  amount?: number | string | null
  price_status?: string | null
  /**
   * 품목별 최소 청구 변 길이(cm). 미지정이면 `MIN_BILLING_SIDE_CM`(100) — 기존 동작.
   * 0 = 최소청구 없음(실규격 그대로) — UV 판재 계열이 이 형이다(아래 상수 주석 참조).
   * 라우트는 `items.min_billing_side_cm` 을 실어 보낸다.
   */
  min_billing_side_cm?: number | null
}

export interface LineAmount {
  /** 자동 계산값(스냅샷) */
  auto: number
  /** 최종 청구액 = order_items.amount */
  final: number
  /** auto - final (증액이면 음수) */
  discount: number
  /** 사용자가 금액을 덮었는가 */
  manual: boolean
}

/**
 * 최소 청구 변 길이(cm) — 0.5m×0.7m 는 1m×1m 로 청구한다(용준님 2026-08-11 확인).
 *
 * 실측으로 전 AREA 품목 공통임을 확인했다: 1m 미만 변이 있는 라인만 모아 ㎡ 단가를 역산하면
 * 보정 전에는 품목 중앙값의 2~3배로 튀는데(SV-SHEET 19,942 vs 중앙값 10,000),
 * 이 보정을 넣으면 중앙값에 수렴한다(9,757). AQ-PAT 11,940→6,680(중앙값 6,700),
 * SV-BANNER 16,417→7,280(7,100), UV-FLEXL 15,772→9,860(10,000)도 같은 양상.
 *
 * ★2026-08-25 정정 — **전 품목 공통이 아니다**. 위 검증은 현수막·시트 계열 표본이었고,
 * 그 범위에선 여전히 옳다(운영 중 AREA 53종의 base_price 를 이 규칙으로 53/53 재현).
 * 그러나 **UV 판재(포맥스·자작나무·폼보드 등)는 실규격 그대로 청구한다**(용준님 확인).
 * 근거: 자작나무 6T 는 62건 중 55건(89%)이 1㎡ 미만이라 이 규칙을 적용하면 ㎡단가가
 * 8,000→33,300→109,500 으로 13배 벌어지지만, 실면적 기준이면 ≈120,000 으로 평평하다.
 * 포맥스 5T 실측도 30×15=2,500원·40×30=7,000원 → 실면적 55,556·58,333원/㎡ 로 일치한다.
 * ⇒ 품목별 `items.min_billing_side_cm` 로 재정의한다. 기본 100 = 종전 동작.
 */
const MIN_BILLING_SIDE_CM = 100

/**
 * 청구 기준 치수(cm) — 10cm 올림 후 최소 변 길이 적용. 표시 치수는 원본을 유지한다.
 * ⚠️ 입력 단위는 **cm** 다. 필드명이 `width_mm` 인 것은 과거 명명 잔재이고 값은 cm 로 들어온다
 *    (아래 `/100` 로 m 로 환산하는 것이 그 증거).
 */
function billingSide(v: number, minSideCm: number = MIN_BILLING_SIDE_CM): number {
  return Math.max(Math.ceil(v / 10) * 10, minSideCm)
}

/**
 * 품목의 최소청구 변(cm) 정규화 — 미지정·비유한·음수는 기본값(100)으로 되돌린다.
 * 0 은 **유효한 값**이다(최소청구 없음). `|| MIN` 로 쓰면 0 이 100 으로 되살아나므로 쓰지 말 것.
 */
function resolveMinSide(v: number | null | undefined): number {
  // ★null/undefined/'' 를 Number() 에 넣으면 0(=예외)이 된다 — 「미지정」이 「최소청구 없음」으로
  //   뒤집히는 사고. 먼저 걸러야 한다(게이트 `test:orderline` 이 이 회귀를 잡는다).
  if (v === null || v === undefined || (v as unknown) === '') return MIN_BILLING_SIDE_CM
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : MIN_BILLING_SIDE_CM
}

/** 100원 단위 반올림 — 최종 청구 단위 */
function round100(v: number): number {
  return Math.round(v / 100) * 100
}

export function computeLineAmount(item: LineAmountInput, pricingMethod: PricingMethod): LineAmount {
  // 미정 품목은 0원 — 단가·금액 모두 0으로 저장된다(기존 동작)
  if (item.price_status === 'PENDING') {
    return { auto: 0, final: 0, discount: 0, manual: false }
  }

  const unitPrice = Number(item.unit_price) || 0
  const qty = Number(item.quantity) || 1
  const w = Number(item.width_mm ?? item.width) || 0
  const h = Number(item.height_mm ?? item.height) || 0

  let auto: number
  if (pricingMethod === 'AREA' && w > 0 && h > 0) {
    const minSide = resolveMinSide(item.min_billing_side_cm)
    auto = unitPrice * (billingSide(w, minSide) / 100) * (billingSide(h, minSide) / 100) * qty
  } else {
    auto = unitPrice * qty
  }
  auto = round100(auto)

  // 수동 금액 수용 — 유한한 숫자면 그대로 받는다(음수 허용: 반품·조정 라인이 실재한다).
  //   NaN·null·undefined 는 '안 보낸 것'으로 보고 자동값을 쓴다.
  const raw = item.amount
  const hasManual = raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw))
  if (!hasManual) {
    return { auto, final: auto, discount: 0, manual: false }
  }

  const final = Math.round(Number(raw))
  return { auto, final, discount: auto - final, manual: final !== auto }
}
