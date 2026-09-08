/**
 * 입고 시 「매입 단가를 품목 마스터에 반영해도 되는가」 판정 — 순수 함수.
 *
 * 왜 순수 모듈인가 (2026-09-09)
 *   입고(`purchaseOrders/po-receive.ts` Phase 4)는 매입 단가를 `items.base_price` 에 그대로 덮어썼다.
 *   그런데 그 칸은 **고객 노출 단가**다 — `priceSheets.ts` 가 2026-09-03 에 「단가표 기준 = base_price」로
 *   통일했고(`sales_price` 는 prod 전량 0이라 `priceList.ts:251` 의 `sales_price || base_price` 도
 *   결국 base_price 를 읽는다), `prices.ts`·`scan.ts`·견적 미리보기가 전부 같은 칸을 본다.
 *
 *   ⇒ 판매품목을 입고하면 **판매가가 매입원가로 내려앉는다.**
 *   실측(2026-09-09 prod): 발주에 등장하는 판매품목 **367종** 중 **135종**이 10% 이상 움직이고,
 *   그중 115종이 하락한다. 대부분 정확히 −40%(= 매입가 ÷ 0.6, 마진 40%) —
 *   애기봉 1,003,200 → 600,000 · E4 엠보 무광 152폭 217,000 → 129,800.
 *
 *   ★입고는 prod 에서 **한 번도 돈 적이 없다**(`inventory_receipts` 0행). 그래서 이 결함이
 *     3년 동안 잠복했고, 오늘 첫 입고가 곧 첫 실행이다. 터지고 나서 되돌리려면
 *     135종의 「원래 판매가」를 어디서도 복원할 수 없다(덮어쓴 값만 남는다).
 *
 * 판정을 라우트 밖으로 뺀 이유 = CLAUDE.md 「조용한 격하」 — 값이 틀려도 200 이고,
 *   타입체크·빌드·smoke 가 전부 통과한다. 픽스처 게이트(`npm run test:purchase-price`)에서만 잡힌다.
 *
 * ⚠️매입 단가 자체는 버리지 않는다 — `client_item_prices`(매입처×품목)가 정본이고
 *   그건 판매품목이든 아니든 **항상** 기록한다. 여기서 막는 건 품목 마스터 노출 단가뿐이다.
 */

export type PriceSyncItem = {
  is_sales_item?: number | boolean | null
  base_price?: number | null
}

export type PriceSyncReason =
  | 'NOT_FOUND'    // 품목 행이 없다
  | 'NO_PRICE'     // 매입 단가가 0·음수·비수 → 반영할 값이 없다
  | 'SALES_ITEM'   // ★판매품목 — base_price 는 고객 노출 단가라 건드리지 않는다
  | 'UNCHANGED'    // 이미 같은 값

export type PriceSyncVerdict =
  | { sync: true }
  | { sync: false; reason: PriceSyncReason }

/**
 * @param item              품목 (`is_sales_item`, `base_price`). D1 은 0/1 정수로 준다.
 * @param purchaseUnitPrice 이번 입고 라인의 매입 단가(관리단위 당)
 */
export function judgeBasePriceSync(
  item: PriceSyncItem | null | undefined,
  purchaseUnitPrice: number
): PriceSyncVerdict {
  if (!item) return { sync: false, reason: 'NOT_FOUND' }
  if (!Number.isFinite(purchaseUnitPrice) || purchaseUnitPrice <= 0) {
    return { sync: false, reason: 'NO_PRICE' }
  }
  // ★판매 여부가 먼저다 — 값이 달라도 판매품목이면 덮지 않는다.
  //   `is_sales_item` 은 D1 에서 0/1, 폼에서 boolean 으로 온다. NULL·undefined 는 「판매 아님」.
  //   0 이 아닌 값은 **전부** 판매로 본다 — 보존이 안전한 쪽이다(덮은 판매가는 복원할 수 없다).
  if (item.is_sales_item != null && Number(item.is_sales_item) !== 0) {
    return { sync: false, reason: 'SALES_ITEM' }
  }
  if (Number(item.base_price ?? 0) === purchaseUnitPrice) {
    return { sync: false, reason: 'UNCHANGED' }
  }
  return { sync: true }
}

/** 사람이 읽을 사유 (입고 응답 메시지용). */
export function priceSyncReasonLabel(reason: PriceSyncReason): string {
  switch (reason) {
    case 'SALES_ITEM': return '판매품목이라 판매단가를 보존했습니다'
    case 'UNCHANGED': return '단가 동일'
    case 'NO_PRICE': return '매입 단가 없음'
    case 'NOT_FOUND': return '품목 없음'
  }
}
