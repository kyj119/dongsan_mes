/**
 * orders/update.ts — 주문 수정 라우트 PUT /:id (core.ts에서 분리, 2026-06-11 대형파일 분할 4/4)
 *
 * 주문서 수정 엔드포인트(품목 재계산/카드 재생성/청구그룹 재계산, 단일 핸들러).
 * 배럴(orders.ts)에서 동일 prefix('/')에 마운트. ⚠️ 이동만, 로직 수정 0.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { Order } from '../../types/models'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { requireAnyPagePermission } from '../../middleware/permissions'
import { recalculateOrderCosts } from '../../utils/costCalculator'
import { getEntityId, entityFilter } from '../../utils/entityFilter'
import { recommendAssignedEntity, recalcOrderBillingGroups, generateCardsForOrder } from './helpers'

const ordersUpdateRouter = new Hono<HonoEnv>()
ordersUpdateRouter.use('/*', authMiddleware, requireAnyPagePermission('/orders', '/cards'))

// Update order (MANAGER+ only)
ordersUpdateRouter.put('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const orderData = await c.req.json()

    // Check if order exists (client_id, final_amount 포함하여 balance 차액 계산에 활용)
    // #381: 멀티법인 IDOR 차단 — 소유 법인 주문만 수정 (전체 품목/금액 재작성·청구그룹 재계산)
    const efPut = entityFilter(c, 'orders')
    const existingOrder = await c.env.DB.prepare(`
      SELECT id, status, client_id, final_amount, order_number, billing_status, consolidate_with_order_id FROM orders WHERE id = ?${efPut.clause}
    `).bind(id, ...efPut.params).first<{ id: number; status: string; client_id: number; final_amount: number; order_number: string; billing_status: string | null; consolidate_with_order_id: number | null }>()

    if (!existingOrder) {
      return c.json({
        success: false,
        error: 'Order not found'
      }, 404)
    }

    // 회계반영된 주문은 ADMIN/MANAGER만 수정 가능
    if (existingOrder.billing_status === 'BILLED') {
      if (!user || !['ADMIN', 'MANAGER'].includes(user.role)) {
        return c.json({
          success: false,
          error: '회계반영된 주문은 매니저 이상만 수정할 수 있습니다'
        }, 403)
      }
    }

    // #101: CONFIRMED 이상 상태에서 delivery_date NULL 방지
    const confirmedStatuses = ['CONFIRMED', 'PRINTING', 'PRINT_DONE', 'SHIPPED']
    if (confirmedStatuses.includes(existingOrder.status) && !orderData.delivery_date) {
      return c.json({ success: false, error: '확정된 주문의 납품일은 필수입니다.' }, 400)
    }

    // 합배송 예약 (배송 후속 P1): 같은 거래처 검증 + root 해소 + 자기참조 차단.
    // key 자체가 없는 호출자(유통 폼 등)는 기존 예약 보존, key가 있고 null/무효면 해제.
    let consolidateWithOrderId: number | null = ('consolidate_with_order_id' in orderData)
      ? null
      : (existingOrder.consolidate_with_order_id ?? null)
    if (orderData.consolidate_with_order_id && Number(orderData.consolidate_with_order_id) !== Number(id)) {
      const conTarget = await c.env.DB.prepare(
        `SELECT id, client_id, consolidate_with_order_id FROM orders WHERE id = ? AND status NOT IN ('CANCELLED', 'DELETED')`
      ).bind(Number(orderData.consolidate_with_order_id)).first<{ id: number; client_id: number; consolidate_with_order_id: number | null }>()
      if (conTarget && Number(conTarget.client_id) === Number(orderData.client_id)) {
        const resolved = conTarget.consolidate_with_order_id || conTarget.id
        if (resolved !== Number(id)) consolidateWithOrderId = resolved
      }
    }

    // pricing_method batch 조회 (AREA 계산 분기용)
    const putItemIdsForPricing = [...new Set(
      orderData.items.map((it: any) => it.item_id).filter((pid: any) => pid != null)
    )] as number[]
    const putPricingMethodMap = new Map<number, string>()
    if (putItemIdsForPricing.length > 0) {
      const putPlaceholders = putItemIdsForPricing.map(() => '?').join(',')
      const { results: putPricingRows } = await c.env.DB.prepare(
        `SELECT id, pricing_method FROM items WHERE id IN (${putPlaceholders})`
      ).bind(...putItemIdsForPricing).all()
      for (const row of putPricingRows) {
        putPricingMethodMap.set(row.id as number, (row.pricing_method as string) || 'FIXED')
      }
    }

    // VAT rate from settings
    const vatSettingPut = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'vat_rate'`
    ).first<{ setting_value: string }>()
    const vatRatePut = vatSettingPut ? parseFloat(vatSettingPut.setting_value) : 0.10

    // Calculate totals (PENDING 품목은 0원 처리)
    let totalAmount = 0
    let vatAmount = 0
    for (const item of orderData.items) {
      if (item.price_status === 'PENDING') { continue }
      const pricingMethod = item.item_id ? (putPricingMethodMap.get(item.item_id) || 'FIXED') : 'FIXED'
      const w = item.width_mm || item.width || 0
      const h = item.height_mm || item.height || 0
      let putItemAmt: number
      if (pricingMethod === 'AREA' && w > 0 && h > 0) {
        const wR = Math.ceil(w / 10) * 10
        const hR = Math.ceil(h / 10) * 10
        putItemAmt = (item.unit_price || 0) * (wR / 100) * (hR / 100) * (item.quantity || 1)
      } else {
        putItemAmt = (item.unit_price || 0) * (item.quantity || 1)
      }
      putItemAmt = Math.round(putItemAmt / 100) * 100
      totalAmount += putItemAmt
      if (item.vat_included) {
        vatAmount += putItemAmt * vatRatePut
      }
    }

    const finalAmount = totalAmount + vatAmount - (orderData.discount_amount || 0)

    // Update order
    await c.env.DB.prepare(`
      UPDATE orders SET
        client_id = ?,
        delivery_date = ?,
        reception_location = ?,
        delivery_info = ?,
        total_amount = ?,
        vat_amount = ?,
        discount_amount = ?,
        final_amount = ?,
        notes = ?,
        internal_notes = ?,
        priority = ?,
        delivery_method = ?,
        delivery_time = ?,
        contact_phone = ?,
        contact_mobile = ?,
        shipping_payment = ?,
        consolidate_with_order_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      orderData.client_id,
      orderData.delivery_date || null,
      orderData.reception_location || null,
      orderData.delivery_info || null,
      totalAmount,
      vatAmount,
      orderData.discount_amount || 0,
      finalAmount,
      orderData.notes || null,
      orderData.internal_notes || null,
      orderData.priority || 'NORMAL',
      orderData.delivery_method || '배송',
      orderData.delivery_time || null,
      orderData.contact_phone || null,
      orderData.contact_mobile || null,
      orderData.shipping_payment || null,
      consolidateWithOrderId,
      id
    ).run()

    // split billing P3: balance 캐시 미사용. BILLED(청구 확정) 주문의 금액 수정은 미수금 파생에
    // 자동 반영되지 않는다 — order_billing_groups 가 동결(발행된 세금계산서 보호)되므로.
    // 청구 후 금액 변경분은 adjustment(감액/증액)로 처리한다.

    // ── 카드 보존 판단을 order_items 삭제 전에 수행 ──
    // CONFIRMED 상태에서만 카드 삭제+재생성
    // 단, 카드가 생산에 진입했으면 보존
    let canRegenerateCards = existingOrder.status === 'CONFIRMED'
    if (canRegenerateCards && existingOrder.status === 'CONFIRMED') {
      const activeCards = await c.env.DB.prepare(`
        SELECT COUNT(*) as cnt FROM cards
        WHERE order_id = ? AND (
          status IN ('PRINT_DONE', 'HOLD')
          OR rip_status IN ('QUEUED', 'SENT')
          OR id IN (SELECT DISTINCT card_id FROM print_events WHERE card_id IS NOT NULL)
        )
      `).bind(id).first<{ cnt: number }>()
      if (activeCards && activeCards.cnt > 0) {
        canRegenerateCards = false
      }
    }

    let cardsPreserved = false

    if (!canRegenerateCards) {
      // 생산 중 카드 보존 — order_item_id FK를 NULL로 해제하여 CASCADE 삭제 방지
      await c.env.DB.prepare(`
        UPDATE cards SET order_item_id = NULL WHERE order_id = ?
      `).bind(id).run()
      // 카드 메타데이터 동기화 (재생성 없이도 납기/우선순위/비고 반영)
      await c.env.DB.prepare(`
        UPDATE cards SET
          delivery_date = ?,
          priority = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE order_id = ?
      `).bind(
        orderData.delivery_date || null,
        orderData.priority === 'URGENT' ? 1 : 0,
        orderData.notes || null,
        id
      ).run()
      cardsPreserved = true
    } else {
      // #87 + #122: 카드 자식 테이블 + 카드 + order_items 원자적 삭제 (재생성 전)
      await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM card_status_history WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
        c.env.DB.prepare('DELETE FROM quality_issues WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
        c.env.DB.prepare('DELETE FROM waste_records WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
        // #396: work_records도 정리 (core.ts:563 정식 삭제와 대칭 — 미정리 시 카드 삭제 후 고아 누적)
        c.env.DB.prepare('DELETE FROM work_records WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
        c.env.DB.prepare('UPDATE print_events SET card_id = NULL WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
        c.env.DB.prepare('DELETE FROM card_items WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
        c.env.DB.prepare('DELETE FROM cards WHERE order_id = ?').bind(id),
        c.env.DB.prepare("DELETE FROM auto_process_jobs WHERE order_id = ? AND status IN ('pending','processing','failed')").bind(id),
        c.env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(id),
      ])
    }

    // 카드 보존 경로에서는 order_items 삭제 전 card_items 매핑을 저장
    // (order_items 삭제 시 card_items가 ON DELETE CASCADE로 함께 삭제되기 때문)
    let savedCardItemMappings: Array<{ card_id: number; item_id: number | null; sort_order: number; quantity: number }> = []
    if (cardsPreserved) {
      const { results: existingMappings } = await c.env.DB.prepare(`
        SELECT ci.card_id, ci.quantity, oi.item_id, oi.sort_order
        FROM card_items ci
        JOIN order_items oi ON ci.order_item_id = oi.id
        WHERE oi.order_id = ?
      `).bind(id).all()
      savedCardItemMappings = (existingMappings || []).map((m: any) => ({
        card_id: m.card_id,
        item_id: m.item_id,
        sort_order: m.sort_order,
        quantity: m.quantity,
      }))

      await c.env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(id).run()
    }

    // Insert updated order items — two-pass for parent_item_id support
    // Pass 1: parent/regular rows (no parent_client_id) → collect DB IDs
    // N+1 제거: 품목 상세 IN(...) 일괄 선조회 + INSERT db.batch(부모 last_row_id는 결과 인덱스로 매핑)
    const putClientIdMap = new Map<string, number>()

    const putLookupIds = [...new Set(
      (orderData.items as any[])
        .filter((it: any) => it.item_id && !it.item_name)
        .map((it: any) => it.item_id as number)
    )]
    const putItemDetailMap = new Map<number, { item_name: string; category: string; unit: string }>()
    if (putLookupIds.length > 0) {
      const dph = putLookupIds.map(() => '?').join(',')
      const { results: detailRows } = await c.env.DB.prepare(
        `SELECT id, item_name, category, unit FROM items WHERE id IN (${dph})`
      ).bind(...putLookupIds).all<{ id: number; item_name: string; category: string; unit: string }>()
      for (const dr of detailRows) putItemDetailMap.set(dr.id, { item_name: dr.item_name, category: dr.category, unit: dr.unit })
    }

    const putParentStmts: D1PreparedStatement[] = []
    const putParentClientGroupIds: (string | null)[] = []
    for (let i = 0; i < orderData.items.length; i++) {
      const item = orderData.items[i]
      if (item.parent_client_id) continue  // 자식 행은 2단계에서 처리

      const putItemPricingMethod = item.item_id ? (putPricingMethodMap.get(item.item_id) || 'FIXED') : 'FIXED'
      const putItemW = item.width_mm || item.width || 0
      const putItemH = item.height_mm || item.height || 0
      let itemAmount: number
      if (putItemPricingMethod === 'AREA' && putItemW > 0 && putItemH > 0) {
        const piWR = Math.ceil(putItemW / 10) * 10
        const piHR = Math.ceil(putItemH / 10) * 10
        itemAmount = (item.unit_price || 0) * (piWR / 100) * (piHR / 100) * (item.quantity || 1)
      } else {
        itemAmount = (item.unit_price || 0) * (item.quantity || 1)
      }
      itemAmount = Math.round(itemAmount / 100) * 100
      let itemName = item.item_name || null
      let categoryName = item.category_name || null
      let unit = item.unit || 'EA'

      if (item.item_id && !itemName) {
        const itemDetail = putItemDetailMap.get(item.item_id)
        if (itemDetail) {
          itemName = itemDetail.item_name
          categoryName = itemDetail.category
          unit = itemDetail.unit
        }
      }

      const putAssignedEntity = (item.assigned_entity_id !== undefined && item.assigned_entity_id !== null)
        ? item.assigned_entity_id
        : recommendAssignedEntity({ ...item, category_name: categoryName }, getEntityId(c) || 1)
      const putAssignmentStatus = putAssignedEntity ? (item.assignment_status || 'PENDING') : null
      putParentStmts.push(c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_id, item_name, category_name,
          width, height, quantity, unit,
          unit_price, amount, vat_included,
          post_processing, content, specification, sort_order,
          ai_group_index, scale_factor, ai_analysis_id, parent_item_id, finishing, price_status,
          assigned_entity_id, assignment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
      `).bind(
        id,
        item.item_id || null,
        itemName || 'Unknown',
        categoryName || null,
        item.width_mm || item.width || null,
        item.height_mm || item.height || null,
        item.quantity || 1,
        unit,
        item.price_status === 'PENDING' ? 0 : (item.unit_price || 0),
        item.price_status === 'PENDING' ? 0 : itemAmount,
        item.vat_included !== undefined ? (item.vat_included ? 1 : 0) : 1,
        item.post_processing || item.paper || null,
        item.content || item.print || null,
        item.specification || null,
        i,
        item.ai_group_index !== undefined ? item.ai_group_index : null,
        item.scale_factor || 1,
        item.ai_analysis_id || null,
        item.finishing || null,
        item.price_status || 'CONFIRMED',
        putAssignedEntity,
        putAssignmentStatus
      ))
      putParentClientGroupIds.push(item.client_group_id || null)
    }
    if (putParentStmts.length > 0) {
      const putParentResults = await c.env.DB.batch(putParentStmts)
      for (let i = 0; i < putParentClientGroupIds.length; i++) {
        const cg = putParentClientGroupIds[i]
        if (cg) putClientIdMap.set(cg, putParentResults[i].meta.last_row_id as number)
      }
    }

    // Pass 2: child rows (has parent_client_id) → resolve parent DB ID (N+1 제거: db.batch)
    const putParentOnlyCount = orderData.items.filter((i: any) => !i.parent_client_id).length
    const putChildStmts: D1PreparedStatement[] = []
    for (let i = 0; i < orderData.items.length; i++) {
      const item = orderData.items[i]
      if (!item.parent_client_id) continue

      const parentDbId = putClientIdMap.get(item.parent_client_id) ?? null

      putChildStmts.push(c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_id, item_name, category_name,
          width, height, quantity, unit,
          unit_price, amount, vat_included,
          post_processing, content, specification, sort_order,
          ai_group_index, scale_factor, ai_analysis_id, parent_item_id,
          assigned_entity_id, assignment_status
        ) VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, 0, 0, 1, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        item.item_name || '',
        item.width_mm || item.width || null,
        item.height_mm || item.height || null,
        item.quantity || 1,
        item.unit || 'EA',
        item.content || null,
        item.specification || null,
        putParentOnlyCount + i,
        item.ai_group_index !== undefined ? item.ai_group_index : null,
        item.scale_factor || 1,
        item.ai_analysis_id || null,
        parentDbId,
        item.assigned_entity_id || null,
        (item.assigned_entity_id ? (item.assignment_status || 'PENDING') : null)
      ))
    }
    if (putChildStmts.length > 0) await c.env.DB.batch(putChildStmts)

    // split billing P2: 품목 담당법인별 청구그룹 재계산(BILLED/PAID 동결은 헬퍼가 처리)
    await recalcOrderBillingGroups(c.env.DB, parseInt(id))

    // #124: 카드 보존 경로 — card_items 재매핑 (item_id + sort_order 기준)
    if (cardsPreserved && savedCardItemMappings.length > 0) {
      // 새로 삽입된 order_items 조회
      const { results: newOrderItems } = await c.env.DB.prepare(`
        SELECT id, item_id, sort_order FROM order_items WHERE order_id = ? ORDER BY sort_order
      `).bind(id).all()

      const remapStmts: any[] = []
      for (const mapping of savedCardItemMappings) {
        // item_id + sort_order로 매칭, 없으면 item_id만으로 매칭
        let matched = (newOrderItems || []).find(
          (oi: any) => oi.item_id === mapping.item_id && oi.sort_order === mapping.sort_order
        )
        if (!matched) {
          matched = (newOrderItems || []).find((oi: any) => oi.item_id === mapping.item_id)
        }
        if (matched) {
          remapStmts.push(
            c.env.DB.prepare(
              `INSERT INTO card_items (card_id, order_item_id, quantity) VALUES (?, ?, ?)`
            ).bind(mapping.card_id, (matched as any).id, mapping.quantity)
          )
        }
      }
      if (remapStmts.length > 0) {
        await c.env.DB.batch(remapStmts)
      }
    }

    // 카드 보존/삭제 로직은 order_items 삭제 전에 이미 처리됨
    let cardsGenerated = 0

    if (canRegenerateCards) {
      cardsGenerated = await generateCardsForOrder({
        db: c.env.DB,
        orderId: parseInt(id),
        orderNumber: existingOrder.order_number,
        clientId: orderData.client_id,
        deliveryDate: orderData.delivery_date || null,
        priority: orderData.priority || 'NORMAL',
        notes: orderData.notes || null,
        entityId: getEntityId(c)
      })
    } // end if (canRegenerateCards)

    // 주문 수정 시 원가 자동 재계산 (CONFIRMED 이상 상태에서)
    const costStatuses = ['CONFIRMED', 'PRINTING', 'PRINT_DONE', 'SHIPPED']
    if (costStatuses.includes(existingOrder.status)) {
      try {
        await recalculateOrderCosts(c.env.DB, parseInt(id))
      } catch (costErr) {
        console.error('Cost recalculation on update failed (non-blocking):', costErr)
      }
    }

    return c.json({
      success: true,
      message: `Order updated successfully. ${cardsGenerated} card(s) regenerated.`,
      ...(cardsPreserved && {
        cards_preserved: true,
        card_warning: '생산 중인 카드가 보존되었습니다. 카드 변경이 필요하면 주문을 임시저장 상태로 되돌려주세요.'
      })
    })
  } catch (error) {
    console.error('Order update error:', error)
    console.error('src/routes/orders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

export default ordersUpdateRouter
