import type { D1Database } from '@cloudflare/workers-types'

/**
 * 출고 시 기성품/유통(production_required=0) 라인의 재고를 차감한다.
 * - 제작 라인(production_required=1)은 제외 (생산품은 RIP 단계에서 원단 차감)
 * - 차감 법인 = 라인별 COALESCE(order_items.assigned_entity_id, orders.entity_id)
 *   → 타법인 담당 품목은 그 담당 법인 재고에서 차감(물리 정합). 미지정(NULL)이면 청구 법인.
 *   담당 법인에 해당 품목 재고 row가 없으면 0으로 생성 후 차감(음수 허용).
 * - 음수 허용 (재고 부족이어도 차감하고 경고만; 주문서 작성 시 경고로 사전 고지)
 * - 멱등: 동일 (주문, 품목)에 OUT 이력이 있으면 스킵 → 재출고/복수 경로에서도 이중차감 방지
 *
 * order_type 무관 — 혼합 주문(제작+기성)의 기성 라인도 정확히 차감.
 * @param entityId 청구(주문) 법인 — assigned_entity_id 미지정 라인의 fallback.
 */
export async function deductStockLinesOnShip(
  db: D1Database,
  orderId: number,
  entityId: number
): Promise<void> {
  const { results: lines } = await db.prepare(`
    SELECT oi.item_id as item_id,
           COALESCE(oi.assigned_entity_id, o.entity_id) as entity_id,
           SUM(oi.quantity) as qty
    FROM order_items oi
    JOIN items i ON oi.item_id = i.id
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.order_id = ?
      AND oi.parent_item_id IS NULL
      AND oi.item_id IS NOT NULL
      AND i.production_required = 0
    GROUP BY oi.item_id, COALESCE(oi.assigned_entity_id, o.entity_id)
  `).bind(orderId).all<{ item_id: number; entity_id: number | null; qty: number }>()

  for (const ln of (lines || [])) {
    if (!ln.item_id || !ln.qty) continue
    // 담당 법인 우선, NULL이면 청구 법인 fallback
    const lineEntity = Number(ln.entity_id) || entityId
    // 중복 차감 방지 (주문×품목 단위 — 담당 법인 무관)
    const dup = await db.prepare(
      `SELECT 1 FROM inventory_transactions WHERE reference_type = 'ORDER' AND reference_id = ? AND item_id = ? AND transaction_type = 'OUT' LIMIT 1`
    ).bind(orderId, ln.item_id).first()
    if (dup) continue

    // 담당 법인 재고 row 부재 시 0으로 생성(음수 차감 허용) → UPDATE silent miss 방지
    await db.prepare(
      `INSERT OR IGNORE INTO inventory (item_id, entity_id, quantity) VALUES (?, ?, 0)`
    ).bind(ln.item_id, lineEntity).run()

    // #164 패턴: atomic UPDATE, 음수 허용
    await db.prepare(
      `UPDATE inventory SET quantity = quantity - ?, last_updated = CURRENT_TIMESTAMP WHERE item_id = ? AND entity_id = ?`
    ).bind(ln.qty, ln.item_id, lineEntity).run()
    const afterRow = await db.prepare(
      `SELECT quantity FROM inventory WHERE item_id = ? AND entity_id = ?`
    ).bind(ln.item_id, lineEntity).first<{ quantity: number }>()
    const after = afterRow?.quantity ?? 0
    if (after < 0) {
      console.warn(`[stockShip] ⚠️ 재고 음수: item=${ln.item_id}, entity=${lineEntity}, 잔량=${after}, order=${orderId}`)
    }
    await db.prepare(
      `INSERT INTO inventory_transactions (item_id, transaction_type, quantity, reference_type, reference_id, balance_after, notes, transaction_date, entity_id)
       VALUES (?, 'OUT', ?, 'ORDER', ?, ?, '기성/유통 출고 차감', date('now'), ?)`
    ).bind(ln.item_id, ln.qty, orderId, after, lineEntity).run()
  }
}
