import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'

/**
 * 발주 헤더 금액 재계산 — **라인에서 파생하는 정본**(2026-09-27).
 *
 * AP 잔액은 `purchase_orders.final_amount` 파생이라(`utils/supplierPayable`), 헤더가 틀리면 AP 가 틀린다.
 * 종전엔 같은 산식이 네 곳에 제각각 있었고(부분입고 마감·매입확정·입고 취소·자동 입고완료),
 * 한 곳이 다른 축으로 다시 세면 앞 단계의 결정을 **조용히 되돌렸다** —
 * 매입확정이 `단가 × 발주수량` 으로 다시 세서 부분입고 마감(입고분 금액)이 풀린 것이 그 실물이다(C6).
 *
 * 축(basis):
 * - `ordered`  : 발주 수량(`quantity`). 아직 입고가 끝나지 않은 발주(CONFIRMED·PARTIAL_RECEIVED)의 정상 규칙.
 * - `accepted` : **합격 수량**. 입고가 끝난(RECEIVED) 발주의 규칙 — 부분입고 마감·예상수량(원단) 실측·불합격 제외가
 *                전부 여기로 모인다. 자동 입고완료된 일반 라인은 합격=발주수량이라 `ordered` 와 같은 값이다
 *                (입고 상한 가드가 합격분을 남은 수량 안으로 묶는다).
 *
 * 규칙은 발주 생성(core.ts POST)과 같다: 부가세 = 라인별 `ROUND(금액 × 0.1)`(vat_included=1),
 * 최종 = MAX(0, 공급가 + 부가세 − 할인). 미지급 예정(cash_schedule)은 **아직 안 치른 행만**(PENDING·OVERDUE) 맞춘다 —
 * 지급 완료된 예정행을 고치면 자금 이력이 바뀐다.
 */
export type PoAmountBasis = 'ordered' | 'accepted'

/**
 * 라인의 합격 수량 — `received − rejected`.
 * ⚠️`accepted_quantity` 를 직접 읽지 않는다: DEFAULT 0 이라 0040 이전 입고 라인은 받았는데도 0 이다.
 *   입고(po-receive)는 `합격 + 불합격 = 수령` 을 검증하므로 새 데이터에서는 두 식이 같고,
 *   옛 데이터(불합격 0)에서는 수령 수량으로 자연스럽게 떨어진다.
 */
export const PO_LINE_ACCEPTED_QTY_SQL = 'MAX(0, COALESCE(received_quantity, 0) - COALESCE(rejected_quantity, 0))'

/** `PO_LINE_ACCEPTED_QTY_SQL` 의 JS 짝 — 입고 완료 판정·상한 가드가 같은 축을 보게 한다. */
export function poLineAccepted(row: { received_quantity?: unknown; rejected_quantity?: unknown }): number {
  return Math.max(0, (Number(row.received_quantity) || 0) - (Number(row.rejected_quantity) || 0))
}

export function poLineQtySql(basis: PoAmountBasis): string {
  return basis === 'accepted' ? PO_LINE_ACCEPTED_QTY_SQL : 'COALESCE(quantity, 0)'
}

/**
 * 헤더 total/vat/final 재계산 + 미지급 예정 동기화 문장 2개. 호출처가 **자기 batch 에 끼워 넣는다**
 * (라인 수량을 바꾸는 문장 **뒤에** 둬야 바뀐 값을 본다 — batch 는 순서대로 실행된다).
 */
export function poHeaderRecalcStmts(
  db: D1Database, poId: number | string, basis: PoAmountBasis, userId?: number | null
): D1PreparedStatement[] {
  const q = poLineQtySql(basis)
  const SUB = `(SELECT COALESCE(SUM(${q} * unit_price), 0) FROM purchase_order_items WHERE po_id = ?)`
  const VAT = `(SELECT COALESCE(SUM(CASE WHEN vat_included = 1 THEN ROUND(${q} * unit_price * 0.1) ELSE 0 END), 0) FROM purchase_order_items WHERE po_id = ?)`
  return [
    db.prepare(`
      UPDATE purchase_orders SET
        total_amount = ${SUB},
        vat_amount = ${VAT},
        final_amount = MAX(0, ${SUB} + ${VAT} - COALESCE(discount_amount, 0)),
        updated_by = COALESCE(?, updated_by),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(poId, poId, poId, poId, userId ?? null, poId),
    db.prepare(`
      UPDATE cash_schedule SET amount = (SELECT final_amount FROM purchase_orders WHERE id = ?), updated_at = CURRENT_TIMESTAMP
      WHERE source_type = 'PURCHASE' AND source_id = ? AND status IN ('PENDING', 'OVERDUE')
    `).bind(poId, poId),
  ]
}
