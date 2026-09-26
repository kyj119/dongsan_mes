// 배송비 = 출고 박스 수 × 단가 (2026-09-17, 마이그 0621)
//
// ── 왜 ──
//   배송비는 `order_items` 한 줄인데 실제 배송은 **박스(출고 묶음)** 에서 일어난다. 축이 달라서
//   합포장하면 두 주문에 각각 붙어 **이중청구**가 되고, 수량은 안 세고 「1건 얼마」로 뭉쳐 적힌다
//   (prod 2026: 배송비 1,625라인 중 수량 1 이 94% · 하우사인 4,200원 × 665건 = 택배 1박스 기본요금).
//
// ── 규칙 ──
//   라인에 `fee_source='SHIPMENT_BOX'` 가 붙어 있으면 **그 주문이 속한 출고 묶음의 박스 수**가 수량을 정한다.
//     · 대표 주문(= 묶음 대표 출고의 주문) 라인 → 수량 = 박스 수
//     · 부속 주문 라인 → **수량 0**(박스는 하나고 청구도 한 번이다). 라인을 지우지 않는 이유 = 묶음을 풀면 되돌린다.
//     · 묶음이 아니면 그 주문이 곧 대표다.
//   금액 = 수량 × 단가. `auto_amount` 도 같이 맞춘다(에누리 판정이 자동값과 비교하므로).
//
// ── 안 건드리는 것 ──
//   · 이미 청구된 주문(`billing_status` BILLED·PAID 또는 청구그룹 BILLED·PAID) — 발행된 계산서와 어긋난다.
//     조용히 건너뛰지 않고 `skippedBilled` 로 돌려준다 — 호출부가 「박스 수는 저장됐지만 배송비는 안 바뀌었다」를 띄운다
//     (주문 PUT 의 청구 후 금액 잠금과 같은 정책, 2026-09-27).
//   · `fee_source` 가 NULL 인 라인 — 사람이 쓴 수량이 정본이다(현행 전량).
//   · 취소된 출고(`status='CANCELLED'`) 는 묶음 판정에서 뺀다.
//
// 라인과 함께 **주문 헤더**(total·vat·discount·final)도 같은 batch 에서 다시 센다(2026-09-27).
//   종전엔 라인 금액만 바뀌어 헤더 최종액·부가세가 옛 값으로 남았고, 청구그룹은 헤더 vat·discount 를 읽으므로 같이 틀렸다.
//   규칙은 주문 PUT(orders/update.ts)과 같다 — 부가세 = 과세 라인(vat_included=1) 합 × 세율을 원 단위 반올림,
//   에누리 clamp 0..(공급가+부가세), 최종 = 공급가 + 부가세 − 에누리.
// 청구그룹 재계산은 **호출부**가 한다(`recalcOrderBillingGroups`).

import type { D1Database } from '@cloudflare/workers-types'

export interface FeeSyncResult {
  orderIds: number[]        // 라인이 실제로 바뀐 주문
  primaryOrderId: number | null
  boxCount: number
  skippedBilled: number[]   // 청구돼서 배송비를 못 맞춘 주문(박스 수와 라인 수량이 다르다)
}

/** 이 출고가 속한 묶음의 (대표 출고 id, 소속 주문 id 목록). 묶음이 아니면 자기 자신 1건. */
async function loadGroup(db: D1Database, shipmentId: number): Promise<{ primaryShipmentId: number; orders: { orderId: number; shipmentId: number }[] } | null> {
  const me = await db.prepare(
    `SELECT id, order_id, merged_into_id FROM shipments WHERE id = ?`
  ).bind(shipmentId).first<{ id: number; order_id: number; merged_into_id: number | null }>()
  if (!me) return null
  const primaryShipmentId = me.merged_into_id || me.id
  const { results } = await db.prepare(
    `SELECT id, order_id FROM shipments
      WHERE (id = ? OR merged_into_id = ?) AND COALESCE(status, '') <> 'CANCELLED' AND order_id IS NOT NULL`
  ).bind(primaryShipmentId, primaryShipmentId).all<{ id: number; order_id: number }>()
  const orders = (results || []).map((r) => ({ orderId: Number(r.order_id), shipmentId: Number(r.id) }))
  if (!orders.length) return null
  return { primaryShipmentId, orders }
}

/**
 * 박스 수가 바뀐 뒤 그 묶음의 배송비 라인을 맞춘다. 멱등.
 * @param shipmentId 방금 저장한 출고(대표가 아니어도 된다 — 묶음으로 올라간다)
 * @returns 바뀐 주문 id 목록(호출부가 청구그룹을 재계산한다). 대상이 없으면 빈 배열.
 */
export async function syncShippingFeeFromBoxes(db: D1Database, shipmentId: number): Promise<FeeSyncResult> {
  const empty: FeeSyncResult = { orderIds: [], primaryOrderId: null, boxCount: 0, skippedBilled: [] }
  const group = await loadGroup(db, shipmentId)
  if (!group) return empty

  const primary = await db.prepare(
    `SELECT order_id, COALESCE(box_count, 0) AS box_count FROM shipments WHERE id = ?`
  ).bind(group.primaryShipmentId).first<{ order_id: number; box_count: number }>()
  if (!primary) return empty
  const boxCount = Number(primary.box_count) || 0
  if (boxCount <= 0) return { ...empty, primaryOrderId: Number(primary.order_id) }  // 아직 안 셌으면 손대지 않는다

  const primaryOrderId = Number(primary.order_id)
  const changed: number[] = []
  const skippedBilled: number[] = []
  const stmts: D1PreparedStatement[] = []
  let vatRate: number | null = null

  for (const o of group.orders) {
    const ord = await db.prepare(
      `SELECT billing_status,
              EXISTS(SELECT 1 FROM order_billing_groups g WHERE g.order_id = orders.id AND g.billing_status IN ('BILLED','PAID')) AS group_billed
         FROM orders WHERE id = ?`
    ).bind(o.orderId).first<{ billing_status: string | null; group_billed: number }>()
    if (!ord) continue
    const billed = ord.billing_status === 'BILLED' || ord.billing_status === 'PAID' || Number(ord.group_billed) === 1

    const qty = o.orderId === primaryOrderId ? boxCount : 0
    const { results: lines } = await db.prepare(
      `SELECT oi.id, oi.quantity, oi.unit_price
         FROM order_items oi
        WHERE oi.order_id = ? AND oi.fee_source = 'SHIPMENT_BOX'`
    ).bind(o.orderId).all<{ id: number; quantity: number; unit_price: number }>()
    const toFix = results(lines).filter((ln) => Number(ln.quantity) !== qty)   // 멱등 — 이미 맞으면 제외
    if (!toFix.length) continue
    // 청구된 주문은 건드리지 않는다 — 발행된 계산서와 어긋난다. 대신 알린다.
    if (billed) { skippedBilled.push(o.orderId); continue }

    for (const ln of toFix) {
      stmts.push(db.prepare(
        `UPDATE order_items
            SET quantity = ?, amount = ? * unit_price, auto_amount = ? * unit_price, updated_at = datetime('now')
          WHERE id = ?`
      ).bind(qty, qty, qty, ln.id))
    }
    if (vatRate === null) {
      const vs = await db.prepare(`SELECT setting_value FROM settings WHERE setting_key = 'vat_rate'`).first<{ setting_value: string }>()
      const parsed = vs ? parseFloat(vs.setting_value) : NaN
      vatRate = Number.isFinite(parsed) ? parsed : 0.10
    }
    // 헤더 ① 공급가·부가세 — 위 라인 UPDATE 뒤에 실행되므로(batch 순차) 새 라인 금액을 본다.
    stmts.push(db.prepare(
      `UPDATE orders SET
          total_amount = (SELECT COALESCE(SUM(amount), 0) FROM order_items WHERE order_id = orders.id),
          vat_amount = CAST(ROUND((SELECT COALESCE(SUM(CASE WHEN vat_included = 1 THEN amount ELSE 0 END), 0)
                                     FROM order_items WHERE order_id = orders.id) * ?) AS INTEGER)
        WHERE id = ?`
    ).bind(vatRate, o.orderId))
    // 헤더 ② 에누리 clamp·최종액 — ①의 새 값을 읽어야 하므로 별도 문장(같은 UPDATE 안에서는 옛 값이 보인다)
    stmts.push(db.prepare(
      `UPDATE orders SET
          discount_amount = MIN(MAX(COALESCE(discount_amount, 0), 0), ROUND(total_amount) + vat_amount),
          final_amount = ROUND(total_amount) + vat_amount - MIN(MAX(COALESCE(discount_amount, 0), 0), ROUND(total_amount) + vat_amount),
          updated_at = datetime('now')
        WHERE id = ?`
    ).bind(o.orderId))
    changed.push(o.orderId)
  }

  if (stmts.length) await db.batch(stmts)
  return { orderIds: changed, primaryOrderId, boxCount, skippedBilled }
}

function results<T>(r: T[] | undefined | null): T[] {
  return r || []
}
