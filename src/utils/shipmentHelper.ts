import type { D1Database } from '@cloudflare/workers-types'
import { getNextSeqNumber } from './sequenceGenerator'

/**
 * delivery_method(주문서 한글 7종 + 레거시) → shipments.delivery_type
 * CHECK 제약(0052): DELIVERY / PICKUP / FREIGHT / QUICK
 * 정본 매핑 — 기존 cards/lifecycle·shipments 라우트의 부분 복제본을 이 파일로 일원화.
 */
export const DELIVERY_TYPE_MAP: Record<string, string> = {
  '대신택배': 'DELIVERY',
  '한진택배': 'DELIVERY',
  '직배': 'DELIVERY',
  '직접배송': 'DELIVERY',
  '배송': 'DELIVERY',
  '대신화물': 'FREIGHT',
  '용차': 'FREIGHT',
  '퀵': 'QUICK',
  '방문수령': 'PICKUP',
  '직접수령': 'PICKUP',
}

export function deliveryMethodToType(method: string | null | undefined): string {
  return (method && DELIVERY_TYPE_MAP[method.trim()]) || 'DELIVERY'
}

interface EnsureShipmentOpts {
  userId?: number | null
  /** orders.entity_id가 NULL일 때 사용할 법인 (세션 entity) */
  fallbackEntityId?: number
  /**
   * 'SHIPPED'(기본) = 출고확정 경로 — 신규 생성 시 shipped_at 스탬프,
   *   기존 PREPARING shipment가 있으면 SHIPPED로 승격.
   * 'PREPARING' = 출고확정 전 송장/라벨 선입력 경로 — 상태 승격 없음.
   */
  status?: 'SHIPPED' | 'PREPARING'
}

/**
 * 주문에 대한 shipment 레코드를 보장한다 (멱등).
 * - 활성(비CANCELLED) shipment가 없으면 생성 (수신자 = 주문 배송정보 → 거래처 폴백)
 * - 출고된 카드 전부를 shipment_items에 동기 (unique(shipment_id, card_id) + OR IGNORE)
 * - 카드 없는 주문(유통/기성)은 신규 생성 시 주문 라인을 스냅샷
 * 기존에는 카드 단건 출고 경로만 shipment를 만들어 주 출고경로(bulk-ship)에서
 * 송장/수신자 데이터가 축적되지 않던 것을 일원화.
 */
export async function ensureShipmentForOrder(
  db: D1Database,
  orderId: number,
  opts: EnsureShipmentOpts = {}
): Promise<number | null> {
  const targetStatus = opts.status || 'SHIPPED'

  const order = await db.prepare(`
    SELECT o.id, o.delivery_method, o.delivery_info, o.contact_phone, o.entity_id,
           cl.client_name, cl.delivery_address, cl.mobile
    FROM orders o
    LEFT JOIN clients cl ON o.client_id = cl.id
    WHERE o.id = ?
  `).bind(orderId).first<{
    id: number; delivery_method: string | null; delivery_info: string | null
    contact_phone: string | null; entity_id: number | null
    client_name: string | null; delivery_address: string | null; mobile: string | null
  }>()
  if (!order) return null

  let shipment = await db.prepare(
    `SELECT id, status FROM shipments WHERE order_id = ? AND status != 'CANCELLED' ORDER BY id DESC LIMIT 1`
  ).bind(orderId).first<{ id: number; status: string }>()

  let created = false
  if (!shipment) {
    const eid = order.entity_id ?? opts.fallbackEntityId ?? 1
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const shipmentNumber = await getNextSeqNumber(db, 'shipments', 'shipment_number', `SHP-E${eid}-${dateStr}-`, 3, eid)
    const res = await db.prepare(`
      INSERT INTO shipments (
        shipment_number, order_id, status, delivery_type, courier_name, shipped_at,
        receiver_name, receiver_phone, receiver_address, created_by, entity_id
      ) VALUES (?, ?, ?, ?, ?, ${targetStatus === 'SHIPPED' ? 'CURRENT_TIMESTAMP' : 'NULL'}, ?, ?, ?, ?, ?)
    `).bind(
      shipmentNumber, orderId, targetStatus,
      deliveryMethodToType(order.delivery_method),
      order.delivery_method || null,
      order.client_name || null,
      order.contact_phone || order.mobile || null,
      order.delivery_info || order.delivery_address || null,
      opts.userId ?? null,
      eid
    ).run()
    shipment = { id: res.meta.last_row_id as number, status: targetStatus }
    created = true
  } else if (targetStatus === 'SHIPPED' && shipment.status === 'PREPARING') {
    // 선입력(송장 저장 등)으로 만들어진 PREPARING → 출고확정 시 승격
    await db.prepare(
      `UPDATE shipments SET status = 'SHIPPED', shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(shipment.id).run()
  }

  // 출고된 카드 → shipment_items 동기 (멱등: unique(shipment_id, card_id) WHERE card_id IS NOT NULL)
  await db.prepare(`
    INSERT OR IGNORE INTO shipment_items (shipment_id, card_id, order_item_id, quantity)
    SELECT ?, c.id, COALESCE(ci.order_item_id, c.order_item_id), COALESCE(ci.quantity, 1)
    FROM cards c
    LEFT JOIN card_items ci ON ci.card_id = c.id
    WHERE c.order_id = ? AND c.shipped_at IS NOT NULL
  `).bind(shipment.id, orderId).run()

  // 카드 없는 주문(유통/기성): card_id NULL 행은 unique 미적용 → 신규 생성 시에만 스냅샷 (중복 방지)
  if (created) {
    await db.prepare(`
      INSERT INTO shipment_items (shipment_id, card_id, order_item_id, quantity)
      SELECT ?, NULL, oi.id, oi.quantity
      FROM order_items oi
      WHERE oi.order_id = ? AND oi.parent_item_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM cards c2 WHERE c2.order_id = oi.order_id)
    `).bind(shipment.id, orderId).run()
  }

  return shipment.id
}
