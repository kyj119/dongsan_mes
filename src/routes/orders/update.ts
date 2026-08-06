/**
 * orders/update.ts — 주문 수정 라우트 PUT /:id (core.ts에서 분리, 2026-06-11 대형파일 분할 4/4)
 *
 * 주문서 수정 엔드포인트(품목 재계산/카드 재생성/청구그룹 재계산, 단일 핸들러).
 * 배럴(orders.ts)에서 동일 prefix('/')에 마운트. ⚠️ 이동만, 로직 수정 0.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { Order } from '../../types/models'
import { authMiddleware } from '../../middleware/auth'
import { requireAnyPagePermission, requireEditOrRole } from '../../middleware/permissions'
import { recalculateOrderCosts } from '../../utils/costCalculator'
import { getEntityId, entityFilter } from '../../utils/entityFilter'
import { recommendAssignedEntity, recalcOrderBillingGroups, generateCardsForOrder } from './helpers'
import { computeLineAmount } from '../../utils/orderLineAmount'

const ordersUpdateRouter = new Hono<HonoEnv>()
ordersUpdateRouter.use('/*', authMiddleware, requireAnyPagePermission('/orders', '/cards'))

// Update order (MANAGER+ only)
ordersUpdateRouter.put('/:id', requireEditOrRole('/orders', 'MANAGER'), async (c) => {
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
      // 총액도 **최종 청구액(에누리 반영) 기준** — 자동값으로 잡으면 행 합계와 주문 총액이 갈린다
      const putItemAmt = computeLineAmount(item, pricingMethod).final
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

    // #597: 라인 부가 파일(order_ai_files.order_item_id, 0516 RESTRICT FK) — 라인 교체 전 매핑 저장.
    //   PUT은 라인 전량 재작성이라 DELETE로 정리하면 무관한 필드 수정에도 칼선(DXF) 기록이 소멸한다
    //   → 신규 라인에 재연결(#124 card_items 재매핑과 동일 규칙), 라인 자체가 삭제된 파일만 정리.
    const { results: savedLineFiles } = await c.env.DB.prepare(`
      SELECT f.id AS file_id, f.order_item_id AS old_item_id, oi.item_id, oi.sort_order
      FROM order_ai_files f
      JOIN order_items oi ON oi.id = f.order_item_id
      WHERE oi.order_id = ?
      ORDER BY oi.sort_order ASC, oi.id ASC, f.id ASC
    `).bind(id).all()

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
      // needs_reissue=1: 라인 교체가 일어나는데 카드는 보존 → 작업지시서 개정필요 표시 (지시 현황판 큐, reissue-ack로 해제)
      // 활성 카드만 — CANCELLED/SHIPPED에 찍으면 개정필요 큐·배너에 노이즈 (리뷰 2026-08-06)
      await c.env.DB.prepare(`
        UPDATE cards SET needs_reissue = 1
        WHERE order_id = ? AND status IN ('PRINT_PENDING', 'PRINTING', 'HOLD', 'PRINT_DONE')
      `).bind(id).run()
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
        c.env.DB.prepare('DELETE FROM card_checklist_items WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
        c.env.DB.prepare('DELETE FROM cards WHERE order_id = ?').bind(id),
        c.env.DB.prepare("DELETE FROM auto_process_jobs WHERE order_id = ? AND status IN ('pending','processing','failed')").bind(id),
        // #480: 검수 기록(shipment_checks, 0439)이 order_item_id FK로 물려 있으면 order_items 삭제가 FK throw
        //   → 라인 통째 교체이므로 구 라인 검수 기록도 함께 정리 (재검수 필요 — checklist GET이 새 라인 재스냅샷)
        c.env.DB.prepare('DELETE FROM shipment_checks WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)').bind(id),
        // #570: designer_intakes.order_item_id RESTRICT(0463) — 라인 통째 교체 시 흡수 이력은 존치(SET NULL)하고 order_item_id만 끊음 (order_items 삭제 전 FK throw 방지)
        c.env.DB.prepare('UPDATE designer_intakes SET order_item_id = NULL WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)').bind(id),
        // #597: order_ai_files.order_item_id RESTRICT(0516) 해제 — 행 보존, 신규 라인 삽입 후 재연결
        c.env.DB.prepare('UPDATE order_ai_files SET order_item_id = NULL WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)').bind(id),
        c.env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(id),
      ])
    }

    // 카드 보존 경로에서는 order_items 삭제 전 card_items 매핑을 저장
    // (order_items 삭제 시 card_items가 ON DELETE CASCADE로 함께 삭제되기 때문)
    let savedCardItemMappings: Array<{ card_id: number; old_item_id: number; item_id: number | null; sort_order: number; quantity: number }> = []
    if (cardsPreserved) {
      const { results: existingMappings } = await c.env.DB.prepare(`
        SELECT ci.card_id, ci.quantity, oi.id AS old_item_id, oi.item_id, oi.sort_order
        FROM card_items ci
        JOIN order_items oi ON ci.order_item_id = oi.id
        WHERE oi.order_id = ?
        ORDER BY oi.sort_order ASC, oi.id ASC, ci.id ASC
      `).bind(id).all()
      savedCardItemMappings = (existingMappings || []).map((m: any) => ({
        card_id: m.card_id,
        old_item_id: m.old_item_id,
        item_id: m.item_id,
        sort_order: m.sort_order,
        quantity: m.quantity,
      }))

      // #480: 카드 보존 경로도 동일 — 구 라인 검수 기록(shipment_checks) 선정리 (FK throw 방지)
      await c.env.DB.prepare('DELETE FROM shipment_checks WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)').bind(id).run()
      // #570: designer_intakes.order_item_id RESTRICT(0463) 정리 — 흡수 이력 존치(SET NULL), order_items 삭제 전 필수
      await c.env.DB.prepare('UPDATE designer_intakes SET order_item_id = NULL WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)').bind(id).run()
      // #597: order_ai_files.order_item_id RESTRICT(0516) 해제 — 행 보존, 신규 라인 삽입 후 재연결
      await c.env.DB.prepare('UPDATE order_ai_files SET order_item_id = NULL WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)').bind(id).run()
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
      // 금액 산식 = utils/orderLineAmount 단일 소스.
      //   ★수정 경로에도 반드시 있어야 한다 — 여기가 빠지면 "주문을 수정하면 에누리가 사라진다"
      //     (PUT 은 라인을 지우고 다시 INSERT 하는 구조라 에누리가 그대로 유실된다).
      const putAmt = computeLineAmount(item, putItemPricingMethod)
      const itemAmount = putAmt.final
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
          assigned_entity_id, assignment_status,
          auto_amount, line_discount, discount_reason, discount_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
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
        putAssignmentStatus,
        item.price_status === 'PENDING' ? 0 : putAmt.auto,
        item.price_status === 'PENDING' ? 0 : putAmt.discount,
        putAmt.manual ? ((item as { discount_reason?: string }).discount_reason || null) : null,
        putAmt.manual ? (user?.id ?? null) : null
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
          assigned_entity_id, assignment_status,
          auto_amount, line_discount
        -- 자녀(분할청구) 라인 = 금액 0 설계. auto_amount NULL 금지(COALESCE 폴백 이중계상 예방)
        ) VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, 0, 0, 1, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
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
        SELECT id, item_id, sort_order FROM order_items WHERE order_id = ? ORDER BY sort_order, id
      `).bind(id).all()

      // prod의 order_items.sort_order는 전 행 0이라 매칭이 item_id 단독으로 퇴화한다.
      // 같은 item_id 라인이 2개 이상인 주문(prod 102건)에서 매 mapping이 같은 첫 행을 집어
      // 카드가 엉뚱한 라인에 붙는 것을 막기 위해, 배정된 신규 order_item은 소진 처리한다.
      // 소진 단위는 mapping이 아니라 **원본 order_item(old_item_id)** — 한 라인이 여러 카드에
      // 걸린 경우(현 prod 0건이나 구조상 가능) 그 카드들이 모두 같은 신규 라인을 가리켜야 한다.
      const claimedItemIds = new Set<number>()
      const resolvedByOldItem = new Map<number, number>()
      const remapStmts: any[] = []
      for (const mapping of savedCardItemMappings) {
        let newItemId = resolvedByOldItem.get(mapping.old_item_id)
        if (newItemId === undefined) {
          // item_id + sort_order로 매칭, 없으면 item_id만으로 매칭 (둘 다 미배정 행에서만)
          let matched = (newOrderItems || []).find(
            (oi: any) => !claimedItemIds.has(oi.id) && oi.item_id === mapping.item_id && oi.sort_order === mapping.sort_order
          )
          if (!matched) {
            matched = (newOrderItems || []).find((oi: any) => !claimedItemIds.has(oi.id) && oi.item_id === mapping.item_id)
          }
          if (!matched) continue
          newItemId = (matched as any).id as number
          claimedItemIds.add(newItemId)
          resolvedByOldItem.set(mapping.old_item_id, newItemId)
        }
        remapStmts.push(
          c.env.DB.prepare(
            `INSERT INTO card_items (card_id, order_item_id, quantity) VALUES (?, ?, ?)`
          ).bind(mapping.card_id, newItemId, mapping.quantity)
        )
      }
      if (remapStmts.length > 0) {
        await c.env.DB.batch(remapStmts)
      }
    }

    // #597: 라인 부가 파일(칼선 DXF 등, 0516) 재연결 — #124와 동일한 item_id+sort_order 매칭.
    //   같은 old 라인의 파일들은 같은 신규 라인으로. 매칭 실패(라인 자체 삭제)면 행 삭제 —
    //   order_item_id NULL 로 남기면 어느 화면에도 안 잡히는 유령 행이 된다.
    if ((savedLineFiles || []).length > 0) {
      const { results: newItemsForFiles } = await c.env.DB.prepare(`
        SELECT id, item_id, sort_order FROM order_items WHERE order_id = ? ORDER BY sort_order, id
      `).bind(id).all()
      const fileClaimedIds = new Set<number>()
      const fileResolvedByOldItem = new Map<number, number | null>()
      const fileStmts: any[] = []
      for (const f of (savedLineFiles as any[])) {
        if (!fileResolvedByOldItem.has(f.old_item_id)) {
          let matched = (newItemsForFiles || []).find(
            (oi: any) => !fileClaimedIds.has(oi.id) && oi.item_id === f.item_id && oi.sort_order === f.sort_order
          )
          if (!matched) {
            matched = (newItemsForFiles || []).find((oi: any) => !fileClaimedIds.has(oi.id) && oi.item_id === f.item_id)
          }
          if (matched) fileClaimedIds.add((matched as any).id as number)
          fileResolvedByOldItem.set(f.old_item_id, matched ? ((matched as any).id as number) : null)
        }
        const newItemId = fileResolvedByOldItem.get(f.old_item_id)
        if (newItemId != null) {
          fileStmts.push(c.env.DB.prepare('UPDATE order_ai_files SET order_item_id = ? WHERE id = ?').bind(newItemId, f.file_id))
        } else {
          fileStmts.push(c.env.DB.prepare('DELETE FROM order_ai_files WHERE id = ?').bind(f.file_id))
        }
      }
      if (fileStmts.length > 0) {
        await c.env.DB.batch(fileStmts)
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
        entityId: getEntityId(c) || 1
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
