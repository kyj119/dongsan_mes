// 세금계산서 에누리 분배 — 정본. taxInvoices/helpers.ts createSplitInvoices 가 쓴다.
//
// 주문 에누리(orders.discount_amount)는 **부가세 포함 최종액**에서 빼는 값이다(orders/create.ts finalAmount).
// 청구그룹도 billed = supply + tax − discount 로 저장한다(orders/helpers.ts). 세금계산서는 합계 = 공급가액 + 세액
// 이어야 하므로, AR 청구액과 계산서 합계를 같게 하려면 에누리를 공급가액·세액 몫으로 나눠 빼야 한다.
// 부가세법 §29③ — 에누리액은 과세표준(공급가액)에 포함하지 않는다 → 세액도 그만큼 준다.
//
// 게이트: scripts/tax-discount-selftest.cjs (test:calc)

/**
 * 에누리(부가세 포함 차감액)를 공급가액·세액 몫으로 나눈다.
 *   세액 비율 = tax / (supply + tax) (그룹의 실제 세율. 세액 0 이면 전액 공급가액).
 *   반올림 잔차는 공급가액 쪽이 흡수한다(supply + tax = discount 보장).
 */
export function splitDiscount(discount: number, supply: number, tax: number): { supply: number; tax: number } {
  const d = Math.max(0, Math.round(Number(discount) || 0))
  if (d === 0) return { supply: 0, tax: 0 }
  const s = Number(supply) || 0
  const t = Number(tax) || 0
  const gross = s + t
  if (gross <= 0 || !(t > 0)) return { supply: d, tax: 0 }
  const taxPart = Math.min(t, Math.round(d * t / gross))
  return { supply: d - taxPart, tax: taxPart }
}

/** 청구그룹 1건의 에누리 복원 = supply + tax − billed. [0, supply+tax] 로 클램프. */
export function groupDiscount(supply: number, tax: number, billed: number | null | undefined): number {
  const gs = Number(supply) || 0, gt = Number(tax) || 0
  const gross = gs + gt
  if (billed == null) return 0
  return Math.min(gross, Math.max(0, gross - (Number(billed) || 0)))
}
