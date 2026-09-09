/**
 * 입고가 품목 평균원가(`items.avg_unit_cost`)의 **공백만 채운다** — 순수 함수.
 *
 * 왜 「채우기만」인가 (2026-09-09)
 *   `avg_unit_cost` 는 소모 금액(`/inventory-counts/consumption` 의 `used × avg`)·수익성 탭 추정원가
 *   (`estMaterialCostSql`)·재고 평가액이 전부 읽는 칸인데, **입고가 이 칸을 아예 안 건드렸다.**
 *   실측(2026-09-09 prod): 매입품목 1,106종 중 **381종(34%)이 0** — 그만큼 소모 금액이 0으로 나온다.
 *   그런데 그 381종 중 발주 단가라도 있는 건 **25종**뿐이라 backfill 로는 못 채운다.
 *   ⇒ 채우는 길은 **입고밖에 없다.**
 *
 *   ★그럼 왜 이동평균이 아닌가 — 이동평균은 **누적 캐시**다(CLAUDE.md). 만들면 입고 취소가
 *     되돌려야 하는데 이동평균의 역산은 **순서 의존**이라 그 사이 다른 입고가 끼면 틀린다.
 *     반면 「0일 때만 채운다」는 CLAUDE.md 규칙 ②**자기교정 산식**이다 —
 *     조건이 `avg <= 0` 이라 **두 번 돌려도 두 번째는 아무 일도 안 한다**. 되돌릴 짝이 필요 없다.
 *     정밀한 이동평균이 필요해지면 그때 **원장 기반 파생**으로 제대로 만든다(규칙 ①).
 *
 *   ★손으로 맞춘 값을 절대 안 덮는다 — 0555(AQ2-200)·0559(TPM 잉크)·0576(롤 단위축)이
 *     마이그레이션으로 넣은 값이고, 원장에는 근거가 없다(원장 IN 행이 prod 전체에 **1건**,
 *     그마저 단가 0). 덮으면 복원할 수 없다.
 *
 * 단위 축 — **base 당**이다. `inventory.quantity`·`inventory_transactions.quantity` 와 같은 축이고,
 *   발주·입고의 관리단위(롤·통)가 아니다. 그래서 인자를 「단가」가 아니라 **(base 수량, 총액)** 으로 받는다.
 *   호출부가 나눗셈을 따로 하면 축을 틀릴 자리가 하나 더 생긴다(memory `feedback-avg-cost-backfill-axis`
 *   — 재실행으로 원단이 50배가 된 전례가 정확히 이 축 혼동이다).
 */

export type AvgCostItem = {
  avg_unit_cost?: number | null
}

export type AvgCostFillReason =
  | 'NOT_FOUND'    // 품목 행이 없다
  | 'NO_QTY'       // 입고 base 수량이 0 이하 → 나눌 수 없다
  | 'NO_PRICE'     // 입고 금액이 0 이하 → ★0 은 「공짜」가 아니라 「미상」이다. 미상으로 미상을 못 채운다
  | 'ALREADY_SET'  // ★이미 값이 있다 — 덮지 않는다

export type AvgCostFillVerdict =
  | { fill: true; value: number }
  | { fill: false; reason: AvgCostFillReason }

/**
 * @param item             품목 (`avg_unit_cost`)
 * @param incomingQtyBase  이번 입고의 **base 수량** (관리단위 × pack_size)
 * @param incomingAmount   이번 입고의 **총액** (관리수량 × 관리단가)
 */
export function judgeAvgCostFill(
  item: AvgCostItem | null | undefined,
  incomingQtyBase: number,
  incomingAmount: number
): AvgCostFillVerdict {
  if (!item) return { fill: false, reason: 'NOT_FOUND' }
  if (!Number.isFinite(incomingQtyBase) || incomingQtyBase <= 0) {
    return { fill: false, reason: 'NO_QTY' }
  }
  if (!Number.isFinite(incomingAmount) || incomingAmount <= 0) {
    return { fill: false, reason: 'NO_PRICE' }
  }
  if (Number(item.avg_unit_cost ?? 0) > 0) {
    return { fill: false, reason: 'ALREADY_SET' }
  }
  return { fill: true, value: incomingAmount / incomingQtyBase }
}

/**
 * 채우기 UPDATE. **조건을 SQL 에도 건다** — JS 판정은 batch 앞에서 읽은 값을 쓰므로,
 * 그 사이 다른 경로가 값을 넣었으면 여기서 걸러진다(자기교정). 두 겹이라 경합에서도 안 덮는다.
 * 바인드 = (value, itemId).
 */
export const AVG_COST_FILL_SQL =
  `UPDATE items SET avg_unit_cost = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND COALESCE(avg_unit_cost, 0) <= 0`

/** 사람이 읽을 사유 (응답 메시지·재계산 리포트용). */
export function avgCostFillReasonLabel(reason: AvgCostFillReason): string {
  switch (reason) {
    case 'ALREADY_SET': return '이미 원가가 있어 보존'
    case 'NO_PRICE': return '매입 금액 없음(0=미상)'
    case 'NO_QTY': return '입고 수량 없음'
    case 'NOT_FOUND': return '품목 없음'
  }
}
