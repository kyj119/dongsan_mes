/**
 * 주문 라인 금액 = 단일 소스.
 *
 * 같은 산식(10cm 올림 → 면적 → 100원 반올림)이 서버 5곳(create 3 · update 2)과 클라 2곳에
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

/** 10cm 올림 — 청구 기준 치수. 표시 치수는 원본을 유지한다. */
function roundUp10(v: number): number {
  return Math.ceil(v / 10) * 10
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
    auto = unitPrice * (roundUp10(w) / 100) * (roundUp10(h) / 100) * qty
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
