// 주간 매입 추천 — **단위 축 판정**을 순수 함수로 뺀 곳 (2026-09-18)
//
// ★왜 여기 있나
//   이 계산에는 단위가 **둘** 섞인다.
//     · 재고·안전재고·주간소모·MRP 소요 = **base**(재고 저장 단위, 예 'M')
//     · 발주 수량(`purchase_order_items.quantity`) = **관리단위**(예 '롤') — 입고가 ×pack_size 로 base 에 넣는다
//   종전엔 ①발주중(관리단위)을 base 재고에 그대로 더하고 ②base 로 낸 부족량을 관리단위 라벨로 내보냈다.
//   ①은 부족량을 과대하게 만들어 **헛경고**를 내고, ②는 `/create-prs` 가 만드는 발주요청을
//   최대 pack_size 배 부풀린다(무광코팅지 1롤=61M → 1,586M 필요가 「1,586롤」 발주가 된다).
//
//   판정이 2,000줄 라우트 안에 있으면 다음 사람이 또 섞는다 — 그래서 함수로 내리고 픽스처로 고정한다
//   (CLAUDE.md §조용한 격하 「판정을 순수 모듈로 뺀다」).
//
// ⚠️ 환산 여부는 `packFactor()` 가 정한다. base_unit 이 없는 편의계수 품목(AQ 현수막 등)은 1 이라
//    **절대 환산되지 않는다** — 그게 이 축의 가장 중요한 가드다.

import { packFactor, type UomItem } from './unitConvert'

export interface SuggestionInput {
  /** 현재고 [base] */
  currentStock: number
  /** 안전재고 [base] */
  safeStock: number
  /** 주간 평균 소모량 [base] */
  weeklyAvg: number
  /** 확정·생산중 주문의 자재 소요량 [base] */
  mrpDemand: number
  /** 발주중 잔량 — **관리단위**(purchase_order_items.quantity 축) */
  onOrderPack: number
  /** 리드타임(주) */
  leadTimeWeeks: number
}

export interface Suggestion {
  /** 발주중 [base] — 화면·계산이 쓰는 값 */
  onOrderBase: number
  /** 가용재고 = 현재고 + 발주중 [base] */
  availableBase: number
  /** 예상 소진량 [base] */
  expectedDemandBase: number
  /** 부족량 [base] */
  shortageBase: number
  /** 권장 발주량 — **관리단위**(발주서에 그대로 들어가는 값) */
  recommendedPack: number
  /** 권장 발주량 [base] — 화면 병기용 「26롤 (1,586 M)」 */
  recommendedBase: number
  /** 적용된 환산 계수(관리단위 1 = base 몇 개). 단일단위·편의계수는 1 */
  factor: number
}

export function computePurchaseSuggestion(input: SuggestionInput, item: UomItem | null | undefined): Suggestion {
  const factor = packFactor(item)
  const onOrderBase = (Number(input.onOrderPack) || 0) * factor
  const expectedDemandBase = (Number(input.weeklyAvg) || 0) * (Number(input.leadTimeWeeks) || 0) + (Number(input.mrpDemand) || 0)
  const availableBase = (Number(input.currentStock) || 0) + onOrderBase
  const shortageBase = Math.max(0, expectedDemandBase + (Number(input.safeStock) || 0) - availableBase)
  return {
    onOrderBase,
    availableBase,
    expectedDemandBase,
    shortageBase,
    // 발주는 관리단위로 나간다 — 올림은 **환산 뒤**에 한다(먼저 올리면 61M 한 자락이 1롤이 더 붙는다).
    recommendedPack: Math.ceil(shortageBase / factor),
    recommendedBase: Math.ceil(shortageBase),
    factor,
  }
}
