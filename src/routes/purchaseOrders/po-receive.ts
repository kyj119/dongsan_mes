/**
 * purchaseOrders/po-receive.ts — 발주 입고 처리 (core.ts에서 분리, 2026-06-12 대형파일 분할 3/4)
 *
 * POST /:id/receive — 입고 처리(검수·재고반영·라인 상태전이, 단일 핸들러).
 * 배럴(purchaseOrders.ts)에서 core 앞 마운트. ⚠️ 이동만, 로직 수정 0.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { PurchaseOrder } from '../../types/models'
import { authMiddleware } from '../../middleware/auth'
import { requireAnyPagePermission } from '../../middleware/permissions'
import { getEntityId, entityFilter } from '../../utils/entityFilter'

const poReceiveRouter = new Hono<HonoEnv>()
poReceiveRouter.use('/*', authMiddleware, requireAnyPagePermission('/purchase-orders', '/receiving'))

// ============================================================================
// POST /:id/receive - 입고 처리
// ============================================================================
poReceiveRouter.post('/:id/receive', async (c) => {
  // #420: 선점 락을 획득한 PO id (오류 시 function catch에서 락 해제용 — try 밖 스코프).
  let lockReleaseId: string | null = null
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const { items: receiveItems, receipt_date, notes } = await c.req.json()

    if (!receiveItems || receiveItems.length === 0) {
      return c.json({ success: false, error: 'items are required' }, 400)
    }

    const ef = entityFilter(c)  // #358계열: 발주 입고처리 법인 격리
    const po = await c.env.DB.prepare(`
      SELECT id, status, supplier_id
      FROM purchase_orders WHERE id = ?${ef.clause}
    `).bind(id, ...ef.params).first<PurchaseOrder>()

    if (!po) {
      return c.json({ success: false, error: 'Purchase order not found' }, 404)
    }

    if (!['CONFIRMED', 'PARTIAL_RECEIVED'].includes(po.status)) {
      return c.json({
        success: false,
        error: `'${po.status}' 상태에서는 입고 처리할 수 없습니다. CONFIRMED 또는 PARTIAL_RECEIVED 상태만 가능합니다.`
      }, 400)
    }

    const receiptDate = receipt_date || new Date().toISOString().split('T')[0]

    // 입고 번호 생성: RCV-YYYYMMDD-001
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '')
    const rcvCountRow = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM inventory_receipts WHERE receipt_number LIKE ?
    `).bind(`RCV-${dateStr}%`).first<{ count: number }>()

    const sequence = ((rcvCountRow?.count || 0) + 1).toString().padStart(3, '0')
    const receiptNumber = `RCV-${dateStr}-${sequence}`

    // po_item 정보 로딩
    const { results: poItems } = await c.env.DB.prepare(`
      SELECT id, item_id, item_name, quantity, received_quantity, unit_price
      FROM purchase_order_items WHERE po_id = ?
    `).bind(id).all()

    type PoItemRow = Record<string, unknown>
    const poItemMap = new Map<number, PoItemRow>()
    for (const pi of poItems as PoItemRow[]) {
      poItemMap.set(pi.id as number, pi)
    }

    // 수량 초과 검증 + 입고 총액 계산
    // 하위호환: received_quantity 없으면 quantity 사용
    let receiptTotalAmount = 0
    for (const ri of receiveItems) {
      const poItem = poItemMap.get(ri.po_item_id)
      if (!poItem) {
        return c.json({
          success: false,
          error: `po_item_id ${ri.po_item_id}가 이 발주에 존재하지 않습니다.`
        }, 400)
      }
      const receiveQty: number = Number(ri.received_quantity ?? ri.quantity ?? 0)
      const acceptedQty: number = ri.accepted_quantity !== undefined ? Number(ri.accepted_quantity) : receiveQty
      const rejectedQty: number = ri.rejected_quantity !== undefined ? Number(ri.rejected_quantity) : 0

      // 합격 + 불합격 = 수령 수량 검증
      if (Math.abs((acceptedQty + rejectedQty) - receiveQty) > 0.0001) {
        return c.json({
          success: false,
          error: `품목 '${poItem.item_name}': 합격(${acceptedQty}) + 불합격(${rejectedQty}) = ${acceptedQty + rejectedQty} 이 수령수량(${receiveQty})과 일치하지 않습니다.`
        }, 400)
      }

      const remaining = Number(poItem.quantity) - Number(poItem.received_quantity)
      if (receiveQty > remaining) {
        return c.json({
          success: false,
          error: `품목 '${poItem.item_name}': 입고 가능 수량(${remaining})을 초과했습니다. 요청: ${receiveQty}`
        }, 400)
      }
      receiptTotalAmount += receiveQty * (Number(poItem.unit_price) || 0)
    }

    // ============================================================================
    // Phase 1: 선행 SELECT (재고 조회) + 쓰기 전 전체 계산
    // ============================================================================
    const perItemPrep: Array<{
      poItemId: number
      itemId: number | null
      receiveQty: number
      acceptedQty: number
      rejectedQty: number
      unitPrice: number
      amount: number
      qualityStatus: string
      rejectMemo: string | null
      balanceAfter: number
      hasInventoryRow: boolean
      acceptedBase: number
      packSize: number
      entityId: number
      zoneId: number | null
    }> = []
    let summaryAccepted = 0
    let summaryRejected = 0

    // #389: inventory/items 건별 조회 N+1 제거 — item_ids로 IN-prefetch (루프 내 재고 쓰기 없음 → 등가)
    const poEntityIdPrefetch = getEntityId(c) || 1
    const recvItemIds = [...new Set(
      receiveItems.map((ri: any) => poItemMap.get(ri.po_item_id)?.item_id).filter((x: any) => x != null)
    )] as number[]
    // 0396 다중행: invQtyMap = 각 품목 기본창고(items.storage_zone_id) 행의 현재고만.
    //   itemZoneMap을 먼저 채운 뒤 (item,entity,기본창고) 행만 채택(IFNULL(...,0) 동등). 다른 창고 행은 입고 정책상 무시.
    const invQtyMap = new Map<number, number>()
    const itemZoneMap = new Map<number, number | null>()
    // #462 MU3: 다단위 — 입고 수량(관리단위) → base_unit 환산용 pack_size. NULL/0→1(단일단위·불변).
    //   inventory.quantity·inventory_transactions.quantity는 base 단위. scan/수기입고(inventory.ts:324-357,381)와 동일.
    const packMap = new Map<number, number>()
    if (recvItemIds.length > 0) {
      const iph = recvItemIds.map(() => '?').join(',')
      const { results: zoneRows } = await c.env.DB.prepare(
        `SELECT id, storage_zone_id, pack_size FROM items WHERE id IN (${iph})`
      ).bind(...recvItemIds).all<{ id: number; storage_zone_id: number | null; pack_size: number | null }>()
      for (const r of (zoneRows || [])) {
        itemZoneMap.set(Number(r.id), r.storage_zone_id ?? null)
        packMap.set(Number(r.id), (r.pack_size && r.pack_size > 0) ? r.pack_size : 1)
      }
      const { results: invRows } = await c.env.DB.prepare(
        `SELECT item_id, storage_zone_id, quantity FROM inventory WHERE entity_id = ? AND item_id IN (${iph})`
      ).bind(poEntityIdPrefetch, ...recvItemIds).all<{ item_id: number; storage_zone_id: number | null; quantity: number }>()
      for (const r of (invRows || [])) {
        const itemId = Number(r.item_id)
        if ((r.storage_zone_id ?? 0) === (itemZoneMap.get(itemId) ?? 0)) invQtyMap.set(itemId, Number(r.quantity))
      }
    }

    for (const ri of receiveItems) {
      const poItem = poItemMap.get(ri.po_item_id)!
      const receiveQty: number = Number(ri.received_quantity ?? ri.quantity ?? 0)
      const acceptedQty: number = ri.accepted_quantity !== undefined ? Number(ri.accepted_quantity) : receiveQty
      const rejectedQty: number = ri.rejected_quantity !== undefined ? Number(ri.rejected_quantity) : 0
      const unitPrice: number = Number(poItem.unit_price) || 0
      const amount = receiveQty * unitPrice
      const qualityStatus = rejectedQty === 0 ? 'PASSED' : acceptedQty === 0 ? 'FAILED' : 'PARTIAL'

      // #462 MU3: 관리단위 → base 환산. inventory/tx는 base 단위(invQtyMap 현재고도 base).
      const packSize = poItem.item_id ? (packMap.get(poItem.item_id as number) || 1) : 1
      const acceptedBase = acceptedQty * packSize
      let balanceAfter = 0
      let hasInventoryRow = false
      const poEntityId = poEntityIdPrefetch
      if (poItem.item_id && acceptedQty > 0) {
        // 0396 다중행: 기본창고 행 기준 현재고 (invQtyMap = 기본창고 행만 보유, base 단위)
        hasInventoryRow = invQtyMap.has(poItem.item_id as number)
        const currentStock = invQtyMap.get(poItem.item_id as number) || 0
        balanceAfter = currentStock + acceptedBase
      }

      // 품목 기본창고 (0396): UPDATE WHERE zone·INSERT·tx 모두 사용 → hasInventoryRow 무관 항상 설정
      let itemZoneId: number | null = null
      if (poItem.item_id) {
        itemZoneId = itemZoneMap.get(poItem.item_id as number) ?? null
      }

      perItemPrep.push({
        poItemId: ri.po_item_id,
        itemId: (poItem.item_id as number) || null,
        receiveQty, acceptedQty, rejectedQty, unitPrice, amount, qualityStatus,
        rejectMemo: ri.reject_memo || null,
        balanceAfter, hasInventoryRow, acceptedBase, packSize,
        entityId: poEntityId, zoneId: itemZoneId,
      })
      summaryAccepted += acceptedQty
      summaryRejected += rejectedQty
    }

    // 워크플로우 상태: 정상(전량) → NORMAL, 부족/거부 1개라도 → PENDING_REVIEW (관리자 결정 대기)
    //   (이전 PASSED/FAILED/PARTIAL 값은 InspectionQualityStatus enum — 관리자 결정 UI 필터와 불일치였음)
    const inspectionStatusForReceipt = summaryRejected === 0 ? 'NORMAL' : 'PENDING_REVIEW'

    // 새 PO status 사전 계산 (in-memory, 쓰기 전)
    const willAllReceived = (poItems as PoItemRow[]).every((pi) => {
      const match = perItemPrep.find(p => p.poItemId === (pi.id as number))
      const afterReceived = Number(pi.received_quantity || 0) + (match ? match.receiveQty : 0)
      return afterReceived >= Number(pi.quantity)
    })
    const prevStatus = po.status
    const newStatus = willAllReceived ? 'RECEIVED' : 'PARTIAL_RECEIVED'

    // ============================================================================
    // #420: 동시 입고 처리 선점 락 (옵션2 backend 원자성)
    // 더블클릭/멀티탭/재시도로 인한 영수증·재고 이중 가산 방지. 모든 검증 통과 후·receipt INSERT 직전에 원자적 claim.
    // 직전 status 검사(line 40)와 이 claim 사이엔 status/lock 변경 await 없음 → 정상 단건은 changes=1 보장.
    // 30초 stale timeout으로 크래시 자동복구. 성공 batch + function catch에서 NULL 복원.
    // ============================================================================
    const lockClaim = await c.env.DB.prepare(`
      UPDATE purchase_orders SET receiving_locked_at = CURRENT_TIMESTAMP
      WHERE id = ?${ef.clause}
        AND status IN ('CONFIRMED', 'PARTIAL_RECEIVED')
        AND (receiving_locked_at IS NULL OR receiving_locked_at <= datetime('now', '-30 seconds'))
    `).bind(id, ...ef.params).run()
    if (!lockClaim.meta.changes) {
      return c.json({ success: false, error: '이미 입고 처리 중입니다. 잠시 후 다시 시도해주세요.' }, 409)
    }
    lockReleaseId = id  // 이 시점부터 오류 시 function catch가 락 해제

    // ============================================================================
    // Phase 2: 부모 INSERT (receipt_id 획득 필요)
    // ============================================================================
    const receiptResult = await c.env.DB.prepare(`
      INSERT INTO inventory_receipts (
        receipt_number, receipt_date, supplier, total_amount,
        status, received_by, notes, po_id, supplier_id, entity_id
      ) VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?)
    `).bind(
      receiptNumber,
      receiptDate,
      String(po.supplier_id || ''),
      receiptTotalAmount,
      user?.id || 1,
      notes || null,
      parseInt(id),
      po.supplier_id || null,
      getEntityId(c) || 1
    ).run()

    const receiptId = receiptResult.meta.last_row_id

    // ============================================================================
    // Phase 3: 원자적 batch 쓰기 (실패 시 부모 receipt 보상 삭제)
    // ============================================================================
    try {
      const stmts: ReturnType<typeof c.env.DB.prepare>[] = []

      for (const p of perItemPrep) {
        // purchase_order_items 누적 update + line_status 재계산 + 담당자 이력
        //   - 기존 received_quantity + 이번 receiveQty >= ordered quantity → RECEIVED
        //   - 아니면 PARTIAL
        //   - line_status 는 INSERT/UPDATE 시점에 CASE 문으로 결정
        stmts.push(c.env.DB.prepare(`
          UPDATE purchase_order_items
          SET received_quantity = received_quantity + ?,
              accepted_quantity = accepted_quantity + ?,
              rejected_quantity = rejected_quantity + ?,
              line_status = CASE
                WHEN (received_quantity + ?) >= quantity THEN 'RECEIVED'
                ELSE 'PARTIAL'
              END,
              received_by = ?,
              received_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(p.receiveQty, p.acceptedQty, p.rejectedQty, p.receiveQty, user?.id || null, p.poItemId))

        // inventory_receipt_items 라인 insert
        stmts.push(c.env.DB.prepare(`
          INSERT INTO inventory_receipt_items (
            receipt_id, item_id, quantity, unit_price, amount,
            received_quantity, accepted_quantity, rejected_quantity,
            quality_status, reject_memo, po_item_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          receiptId, p.itemId ?? null, p.receiveQty, p.unitPrice, p.amount,
          p.receiveQty, p.acceptedQty, p.rejectedQty,
          p.qualityStatus, p.rejectMemo, p.poItemId
        ))

        // inventory stock + transaction (합격 수량 있을 때만)
        if (p.itemId && p.acceptedQty > 0) {
          if (p.hasInventoryRow) {
            stmts.push(c.env.DB.prepare(`
              UPDATE inventory SET quantity = ?, last_updated = CURRENT_TIMESTAMP
              WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id,0)=IFNULL(?,0)
            `).bind(p.balanceAfter, p.itemId, p.entityId, p.zoneId))
          } else {
            stmts.push(c.env.DB.prepare(`
              INSERT INTO inventory (item_id, quantity, entity_id, storage_zone_id, last_updated) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).bind(p.itemId, p.balanceAfter, p.entityId, p.zoneId))
          }

          stmts.push(c.env.DB.prepare(`
            INSERT INTO inventory_transactions (
              item_id, transaction_type, transaction_date, quantity,
              unit_price, total_amount, reference_type, reference_id,
              balance_after, reason, handled_by, entity_id, storage_zone_id
            ) VALUES (?, 'IN', ?, ?, ?, ?, 'PURCHASE', ?, ?, '발주입고(합격분)', ?, ?, ?)
          `).bind(
            // #462 MU3: 거래는 base 단위 — quantity=base(×pack), unit_price=base당(÷pack), total_amount=관리단위×관리단가(불변)
            p.itemId, receiptDate, p.acceptedBase, p.unitPrice / p.packSize,
            p.acceptedQty * p.unitPrice, receiptId, p.balanceAfter, user?.id || 1,
            getEntityId(c) || 1, p.zoneId
          ))
        }
      }

      // inventory_receipts.inspection_status 업데이트 (사전계산값 사용)
      stmts.push(c.env.DB.prepare(`
        UPDATE inventory_receipts SET inspection_status = ? WHERE id = ?
      `).bind(inspectionStatusForReceipt, receiptId))

      // purchase_orders status 업데이트 (사전계산값 사용) + #420: 선점 락 해제(원자적, 입고 커밋과 동시)
      stmts.push(c.env.DB.prepare(`
        UPDATE purchase_orders SET status = ?, receiving_locked_at = NULL, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(newStatus, user?.id || 1, id))

      // 상태 변경 시만 이력
      if (newStatus !== prevStatus) {
        stmts.push(c.env.DB.prepare(`
          INSERT INTO po_status_history (po_id, from_status, to_status, changed_by, change_reason)
          VALUES (?, ?, ?, ?, '입고 처리')
        `).bind(parseInt(id), prevStatus, newStatus, user?.id || 1))
      }

      await c.env.DB.batch(stmts)
    } catch (batchErr) {
      // 보상 트랜잭션: 이미 삽입된 부모 receipt + 자식 items 삭제 (#311 고아 방지)
      try {
        await c.env.DB.batch([
          c.env.DB.prepare(`DELETE FROM inventory_receipt_items WHERE receipt_id = ?`).bind(receiptId),
          c.env.DB.prepare(`DELETE FROM inventory_receipts WHERE id = ?`).bind(receiptId)
        ])
      } catch (_) { /* best effort */ }
      throw batchErr
    }

    // ============================================================================
    // Phase 4: 단가 자동 갱신 (트랜잭션 밖 — 실패해도 입고 롤백 안 함)
    // ① 매입처 단가 upsert → ② base_price 갱신 → ③ 그룹 연쇄 → ④ 이력
    // ============================================================================
    const priceUpdates: Array<{ itemId: number; name: string; old: number; new_: number }> = []
    try {
      for (const p of perItemPrep) {
        if (!p.itemId || p.unitPrice <= 0) continue

        // ① client_item_prices upsert (매입처 단가)
        if (po.supplier_id) {
          await c.env.DB.prepare(`
            INSERT INTO client_item_prices (client_id, item_id, price)
            VALUES (?, ?, ?)
            ON CONFLICT(client_id, item_id) DO UPDATE SET price = ?, updated_at = CURRENT_TIMESTAMP
          `).bind(po.supplier_id, p.itemId, p.unitPrice, p.unitPrice).run()
        }

        // ② items.base_price 갱신
        const oldItem = await c.env.DB.prepare(
          'SELECT base_price, item_group, item_name FROM items WHERE id = ?'
        ).bind(p.itemId).first<{ base_price: number; item_group: string | null; item_name: string }>()

        if (!oldItem || oldItem.base_price === p.unitPrice) continue

        // 직접 입고 품목 갱신
        await c.env.DB.prepare(
          'UPDATE items SET base_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(p.unitPrice, p.itemId).run()

        await c.env.DB.prepare(
          `INSERT INTO price_change_history (target_type, target_id, field_name, old_value, new_value, changed_by, entity_id)
           VALUES ('ITEM', ?, 'base_price', ?, ?, ?, ?)`
        ).bind(p.itemId, oldItem.base_price, p.unitPrice, user?.username || 'system', getEntityId(c)).run()

        priceUpdates.push({ itemId: p.itemId, name: oldItem.item_name, old: oldItem.base_price, new_: p.unitPrice })

        // ③ 같은 item_group + 단가 연동(price_linked) 품목 연쇄 갱신
        if (oldItem.item_group) {
          const linked = await c.env.DB.prepare(
            'SELECT price_linked FROM item_group_settings WHERE group_name = ?'
          ).bind(oldItem.item_group).first<{ price_linked: number }>()

          if (linked?.price_linked) {
            const { results: groupItems } = await c.env.DB.prepare(
              'SELECT id, base_price, item_name FROM items WHERE item_group = ? AND id != ? AND is_active = 1'
            ).bind(oldItem.item_group, p.itemId).all<{ id: number; base_price: number; item_name: string }>()

            const updateStmts = []
            for (const gi of groupItems) {
              if (gi.base_price === p.unitPrice) continue
              updateStmts.push(
                c.env.DB.prepare('UPDATE items SET base_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                  .bind(p.unitPrice, gi.id)
              )
              updateStmts.push(
                c.env.DB.prepare(
                  `INSERT INTO price_change_history (target_type, target_id, field_name, old_value, new_value, changed_by, entity_id)
                   VALUES ('ITEM', ?, 'base_price', ?, ?, ?, ?)`
                ).bind(gi.id, gi.base_price, p.unitPrice, user?.username || 'system', getEntityId(c))
              )
              priceUpdates.push({ itemId: gi.id, name: gi.item_name, old: gi.base_price, new_: p.unitPrice })
            }
            if (updateStmts.length) await c.env.DB.batch(updateStmts)
          }
        }
      }
    } catch (priceErr) {
      console.warn('purchaseOrders receive: price auto-update failed (non-fatal)', priceErr)
    }

    // PENDING_REVIEW 시 ADMIN/MANAGER에게 알림 자동 생성 (트랜잭션 밖 — 알림 실패가 입고를 롤백하면 안 됨)
    if (inspectionStatusForReceipt === 'PENDING_REVIEW') {
      try {
        const poNumber = po.po_number as string
        const title = '[검수 대기] ' + poNumber + ' 부족 수량 감지'
        const message = poNumber + ' 발주의 입고 수량이 발주 수량보다 부족합니다. 관리자 확인이 필요합니다.'
        const existing = await c.env.DB.prepare(
          `SELECT id FROM notifications WHERE target_role = 'ADMIN' AND title = ? AND date(created_at) = date('now') LIMIT 1`
        ).bind(title).first()
        if (!existing) {
          await c.env.DB.prepare(
            `INSERT INTO notifications (target_role, title, message, link, entity_id) VALUES ('ADMIN', ?, ?, '/inspections', ?)`
          ).bind(title, message, getEntityId(c)).run()
        }
      } catch (notifErr) {
        console.warn('purchaseOrders receive: notification insert failed (non-fatal)', notifErr)
      }
    }

    const priceMsg = priceUpdates.length
      ? ` 단가 변경: ${priceUpdates.length}건 (${priceUpdates.map(u => u.name + ' ' + u.old.toLocaleString() + '→' + u.new_.toLocaleString()).join(', ')})`
      : ''

    return c.json({
      success: true,
      data: {
        receipt_number: receiptNumber,
        receipt_id: receiptId,
        po_status: newStatus,
        inspection_status: inspectionStatusForReceipt,
        price_updates: priceUpdates.length ? priceUpdates : undefined
      },
      message: `입고 처리 완료. 발주 상태: ${newStatus}${priceMsg}`
    })
  } catch (error: any) {
    console.error('purchaseOrders receive error:', error)
    // #420: 락 획득 후 오류 발생 시 선점 락 해제(성공 batch의 해제가 커밋되지 않았으므로). 미획득(null)이면 건드리지 않음.
    if (lockReleaseId) {
      try { await c.env.DB.prepare('UPDATE purchase_orders SET receiving_locked_at = NULL WHERE id = ?').bind(lockReleaseId).run() } catch (_) { /* best effort */ }
    }
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})


export default poReceiveRouter
