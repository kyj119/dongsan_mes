/**
 * orders/lifecycle.ts — 주문 상태/청구 전이 라우트 (core.ts에서 분리, 2026-06-11 대형파일 분할 2/4)
 *
 * 청구(bill·billing-status)·출력폴더·상태전이(status)·취소(cancel)·복원(restore)·일괄동기화(sync-statuses).
 * 배럴(orders.ts)에서 동일 prefix('/')에 마운트 — 경로가 core와 겹치지 않아 순서 영향 없음.
 * ⚠️ 이동만, 로직 수정 0.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { Order } from '../../types/models'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { requireAnyPagePermission } from '../../middleware/permissions'
import { logActivity } from '../../utils/activityLog'
import { notifyRoles } from '../../utils/notify'
import { recalculateOrderCosts } from '../../utils/costCalculator'
import { checkMaterialShortage } from '../../utils/materialShortageCheck'
import { getEntityId, entityFilter } from '../../utils/entityFilter'
import { setOrderBillingStatus } from './helpers'
import { deriveClientBalance } from '../ledger/ar-helpers'

const ordersLifecycleRouter = new Hono<HonoEnv>()
ordersLifecycleRouter.use('/*', authMiddleware, requireAnyPagePermission('/orders', '/cards'))

// PATCH /:id/bill - 주문 청구 처리 (BILLED 전이 + 미수금 파생)
ordersLifecycleRouter.patch('/:id/bill', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const body = await c.req.json().catch(() => ({})) as { billed_amount?: number }

    // #381: 멀티법인 IDOR 차단 — 소유 법인(orders.entity_id)만 청구 처리 (DELETE #333 선례)
    const efBill = entityFilter(c, 'orders')
    const order = await c.env.DB.prepare(
      `SELECT id, status, client_id, final_amount, billing_status,
        (SELECT CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END FROM order_items WHERE order_id = orders.id AND price_status = 'PENDING') as has_pending_prices
       FROM orders WHERE id = ?${efBill.clause}`
    ).bind(id, ...efBill.params).first<{ id: number; status: string; client_id: number; final_amount: number; billing_status: string | null; has_pending_prices: number }>()

    if (!order) {
      return c.json({ success: false, error: 'Order not found' }, 404)
    }

    if (order.status !== 'SHIPPED' && order.status !== 'COMPLETED') {
      return c.json({
        success: false,
        error: '출고완료 후(출고/배송완료) 주문만 회계반영할 수 있습니다'
      }, 400)
    }

    if (order.billing_status === 'BILLED') {
      return c.json({ success: false, error: '이미 회계반영된 주문입니다' }, 400)
    }

    if (order.has_pending_prices) {
      return c.json({ success: false, error: '단가 미정 품목이 있는 주문은 회계반영할 수 없습니다. 먼저 단가를 확정해주세요.' }, 400)
    }

    // split billing P3: 청구를 그룹 단위로 — 그룹 BILLED + orders 미러. balance 캐시 미사용(미수금 파생).
    const billed = await setOrderBillingStatus(c.env.DB, Number(id), 'BILLED', user?.id || null)
    if (!billed) {
      return c.json({ success: false, error: '이미 처리된 주문입니다 (동시 요청 감지)' }, 409)
    }

    return c.json({
      success: true,
      data: { billing_status: 'BILLED' }
    })
  } catch (error) {
    console.error('Bill order error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Update billing status (회계반영/수금완료/취소)
ordersLifecycleRouter.patch('/:id/billing-status', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const { billing_status: newStatus } = await c.req.json() as { billing_status: string }

    // #381: 멀티법인 IDOR 차단 — 소유 법인만 청구상태 변경
    const efBs = entityFilter(c, 'orders')
    const order = await c.env.DB.prepare(
      `SELECT id, status, client_id, final_amount, billing_status, billed_amount FROM orders WHERE id = ?${efBs.clause}`
    ).bind(id, ...efBs.params).first<{ id: number; status: string; client_id: number; final_amount: number; billing_status: string | null; billed_amount: number | null }>()

    if (!order) {
      return c.json({ success: false, error: 'Order not found' }, 404)
    }

    const oldStatus = order.billing_status || ''

    if (newStatus === 'BILLED') {
      // 회계반영: SHIPPED 상태만 가능
      if (order.status !== 'SHIPPED' && order.status !== 'COMPLETED') {
        return c.json({ success: false, error: '출고완료 후(출고/배송완료) 주문만 회계반영 가능합니다' }, 400)
      }
      // split billing P3: 그룹 단위 BILLED + orders 미러 (balance 캐시 미사용 — 미수금 파생)
      await setOrderBillingStatus(c.env.DB, Number(id), 'BILLED', user?.id || null)
    } else if (newStatus === 'PAID') {
      // 수금완료
      if (oldStatus !== 'BILLED') {
        return c.json({ success: false, error: '회계반영된 주문만 수금완료 처리할 수 있습니다' }, 400)
      }
      await setOrderBillingStatus(c.env.DB, Number(id), 'PAID', user?.id || null)
    } else {
      // 회계반영 취소 (빈 문자열)
      if (oldStatus === 'PAID') {
        // PAID에서 되돌리기는 허용하지 않음
        return c.json({ success: false, error: '수금완료 상태에서는 직접 미확인으로 변경할 수 없습니다' }, 400)
      }
      await setOrderBillingStatus(c.env.DB, Number(id), null, user?.id || null)
    }

    return c.json({ success: true, data: { billing_status: newStatus || null } })
  } catch (error) {
    console.error('Update billing status error:', error)
    console.error('src/routes/orders.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH output_folder (C#에서 파일 저장 완료 후 호출)
ordersLifecycleRouter.patch('/:id/output-folder', async (c) => {
  try {
    const id = c.req.param('id')
    const { output_folder } = await c.req.json()
    if (!output_folder) return c.json({ success: false, error: 'output_folder required' }, 400)
    // #381: 멀티법인 IDOR 차단 — 소유 법인 주문만 변경 (0건이면 404)
    const efOf = entityFilter(c, 'orders')
    const r = await c.env.DB.prepare(`UPDATE orders SET output_folder = ? WHERE id = ?${efOf.clause}`).bind(output_folder, id, ...efOf.params).run()
    if (!r.meta.changes) return c.json({ success: false, error: 'Order not found' }, 404)
    return c.json({ success: true })
  } catch (err: any) {
    console.error('orders output_folder error:', err)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// Update order status (MANAGER+ only)
ordersLifecycleRouter.patch('/:id/status', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const { status, reason, confirmed_card_ids, cancelled_card_ids } = await c.req.json()
    const user = c.get('user')

    // Validate status
    const validStatuses = ['CONFIRMED', 'PRINTING', 'PRINT_DONE', 'SHIPPED']
    if (!validStatuses.includes(status)) {
      return c.json({
        success: false,
        error: 'Invalid status'
      }, 400)
    }

    // 상태 전이 유효성 검사
    // 취소(CANCELLED)는 별도 cancel 엔드포인트, 견적→주문은 convert-to-order에서 처리
    const validTransitions: Record<string, string[]> = {
      'CONFIRMED':  ['PRINTING', 'PRINT_DONE'],
      'PRINTING':   ['PRINT_DONE', 'CONFIRMED'],
      'PRINT_DONE': ['SHIPPED', 'PRINTING', 'CONFIRMED'],
      'SHIPPED':    [],
    }

    // Get current status (#381: 소유 법인만 상태 변경)
    const efSt = entityFilter(c, 'orders')
    const order = await c.env.DB.prepare(`SELECT status, client_id, final_amount, order_number, delivery_date FROM orders WHERE id = ?${efSt.clause}`).bind(id, ...efSt.params).first<{ status: string; client_id: number; final_amount: number; order_number: string; delivery_date: string | null }>()

    if (!order) {
      return c.json({
        success: false,
        error: 'Order not found'
      }, 404)
    }

    const allowed = validTransitions[order.status] ?? []
    if (!allowed.includes(status)) {
      return c.json({
        success: false,
        error: `상태 전이 불가: ${order.status} → ${status}`
      }, 400)
    }

    // #217: CONFIRMED 전환 시 납기일 필수 검증
    if (status === 'CONFIRMED' && !order.delivery_date) {
      return c.json({ success: false, error: '납기일이 설정되지 않은 주문은 확정할 수 없습니다.' }, 400)
    }

    // SHIPPED 전환 시 미완료 카드 체크
    if (status === 'SHIPPED') {
      const { results: pendingCards } = await c.env.DB.prepare(`
        SELECT id, card_number, status, shipped_at FROM cards
        WHERE order_id = ? AND (status != 'PRINT_DONE' OR shipped_at IS NULL)
      `).bind(id).all()

      const unfinishedCards = (pendingCards || []).filter((cd) => cd.status !== 'PRINT_DONE')

      // 미완료 카드가 있고 확인 응답이 아닌 경우 → 확인 요청 반환
      if (unfinishedCards.length > 0 && !confirmed_card_ids && !cancelled_card_ids) {
        return c.json({
          success: false,
          requires_confirmation: true,
          pending_cards: unfinishedCards.map((cd) => ({
            id: cd.id,
            card_number: cd.card_number,
            status: cd.status,
          })),
          message: `인쇄 미완료 카드 ${unfinishedCards.length}건이 있습니다. 확인 후 진행해주세요.`
        })
      }

      // 확인 응답 처리: 확정된 카드 → PRINT_DONE + shipped_at (N+1 제거: IN(...) 1쿼리)
      if (confirmed_card_ids && confirmed_card_ids.length > 0) {
        const cph = (confirmed_card_ids as number[]).map(() => '?').join(',')
        await c.env.DB.prepare(`
          UPDATE cards SET status = 'PRINT_DONE', shipped_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE order_id = ? AND id IN (${cph})
        `).bind(id, ...confirmed_card_ids).run()
      }

      // 취소된 카드 → HOLD 처리 (N+1 제거: IN(...) 1쿼리)
      if (cancelled_card_ids && cancelled_card_ids.length > 0) {
        const xph = (cancelled_card_ids as number[]).map(() => '?').join(',')
        await c.env.DB.prepare(`
          UPDATE cards SET status = 'HOLD', updated_at = CURRENT_TIMESTAMP
          WHERE order_id = ? AND id IN (${xph})
        `).bind(id, ...cancelled_card_ids).run()
      }

      // PRINT_DONE 카드 중 shipped_at 없는 것도 일괄 출고 처리
      await c.env.DB.prepare(`
        UPDATE cards SET shipped_at = CURRENT_TIMESTAMP
        WHERE order_id = ? AND status = 'PRINT_DONE' AND shipped_at IS NULL
      `).bind(id).run()
    }

    // #48: 주문 → 카드 상태 하향 동기화
    // PRINT_DONE 전환 시: 아직 PRINTING인 카드를 PRINT_DONE으로 일괄 전환
    if (status === 'PRINT_DONE') {
      const printingCards = await c.env.DB.prepare(`
        SELECT id FROM cards WHERE order_id = ? AND status = 'PRINTING'
      `).bind(id).all<{ id: number }>()

      if (printingCards.results && printingCards.results.length > 0) {
        const batchStmts: D1PreparedStatement[] = []
        for (const card of printingCards.results) {
          batchStmts.push(
            c.env.DB.prepare(`
              UPDATE cards SET status = 'PRINT_DONE', updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `).bind(card.id)
          )
          batchStmts.push(
            c.env.DB.prepare(`
              INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
              VALUES (?, 'PRINTING', 'PRINT_DONE', ?, '주문 상태 PRINT_DONE 동기화')
            `).bind(card.id, user?.id || null)
          )
        }
        for (let i = 0; i < batchStmts.length; i += 80) {
          const chunk = batchStmts.slice(i, i + 80)
          if (chunk.length > 0) await c.env.DB.batch(chunk)
        }
      }
    }

    // Update order status
    await c.env.DB.prepare(`
      UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP,
        confirmed_at = CASE WHEN ? = 'CONFIRMED' THEN CURRENT_TIMESTAMP ELSE confirmed_at END
      WHERE id = ?
    `).bind(status, status, id).run()

    // balance는 경리 확인(BILLED) 시점에만 반영 — QUOTATION→CONFIRMED 전환 시 미반영

    // Insert status history
    await c.env.DB.prepare(`
      INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, order.status, status, user?.id || null, reason || null).run()

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'STATUS_CHANGE', entityType: 'ORDER', entityId: parseInt(id),
      entityLabel: order.order_number,
      details: JSON.stringify({ from: order.status, to: status })
    })

    // Phase 5: 자재 부족 경고 (CONFIRMED 전환 시, non-blocking)
    let materialWarnings: any[] = []
    if (status === 'CONFIRMED') {
      try {
        const entityId = getEntityId(c) || 1
        materialWarnings = await checkMaterialShortage(c.env.DB, parseInt(id), entityId)
      } catch (mErr) {
        console.error('Material shortage check failed (non-blocking):', mErr)
      }

      await notifyRoles(c.env.DB, ['OPERATOR'], '주문 확정', `${order.order_number} 주문이 확정되었습니다.`, '/orders')

      // 원가 자동계산
      try {
        await recalculateOrderCosts(c.env.DB, parseInt(id))
      } catch (costErr) {
        console.error('Cost calculation failed (non-blocking):', costErr)
      }
    } else if (status === 'SHIPPED') {
      await notifyRoles(c.env.DB, ['ADMIN', 'MANAGER'], '출고 완료', `${order.order_number} 출고 처리되었습니다.`, '/orders')
      // 연체 거래처 경고: 파생 미수금(deriveClientBalance) > 0이고 30일 이상 미입금이면 경리에게 알림
      // X5: 폐기 clients.balance 캐시(prod 전체 0) 대신 파생 — 캐시 의존 시 이 경고가 영구 미발동이던 것 정상화
      try {
        const derivedBal = await deriveClientBalance(c, order.client_id as number)
        if (derivedBal > 0) {
          const clientCheck = await c.env.DB.prepare(`
            SELECT c.client_name,
              (SELECT MIN(COALESCE(o2.accounting_date, o2.billed_at)) FROM orders o2 WHERE o2.client_id = c.id AND o2.billing_status = 'BILLED') as oldest_billed
            FROM clients c WHERE c.id = ?
          `).bind(order.client_id).first<{ client_name: string; oldest_billed: string | null }>()
          if (clientCheck && clientCheck.oldest_billed) {
            const daysSince = Math.floor((Date.now() - new Date(clientCheck.oldest_billed).getTime()) / 86400000)
            if (daysSince > 30) {
              await notifyRoles(c.env.DB, ['ADMIN', 'MANAGER'], '연체 거래처 출고',
                `${clientCheck.client_name} 미수금 ${derivedBal.toLocaleString()}원 (${daysSince}일 연체)`,
                '/receivables')
            }
          }
        }
      } catch (_) { /* 알림 실패해도 출고는 진행 */ }
    }

    return c.json({
      success: true,
      message: 'Order status updated successfully',
      ...(materialWarnings.length > 0 && {
        material_warnings: materialWarnings,
        warning_message: `자재 부족 ${materialWarnings.length}건: ${materialWarnings.slice(0, 3).map(w => w.material_name).join(', ')}${materialWarnings.length > 3 ? ' 외' : ''}`,
      }),
    })
  } catch (error) {
    console.error('src/routes/orders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// PATCH /:id/cancel - 주문 취소 (별도 버튼, 이유 필수)
// ============================================================================
ordersLifecycleRouter.patch('/:id/cancel', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const { reason, reason_detail } = await c.req.json<{ reason: string; reason_detail?: string }>()

    if (!reason) {
      return c.json({ success: false, error: '취소 이유를 선택해주세요.' }, 400)
    }

    // #381: 소유 법인만 취소 (재무 역분개 IDOR 차단)
    const efCx = entityFilter(c, 'orders')
    const order = await c.env.DB.prepare(
      `SELECT id, status, order_number, client_id, billing_status, billed_amount, final_amount FROM orders WHERE id = ?${efCx.clause}`
    ).bind(id, ...efCx.params).first<{ id: number; status: string; order_number: string; client_id: number; billing_status: string | null; billed_amount: number | null; final_amount: number }>()
    if (!order) return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)

    if (order.status === 'CANCELLED') {
      return c.json({ success: false, error: '이미 취소된 주문입니다.' }, 400)
    }
    if (order.status === 'SHIPPED') {
      return c.json({ success: false, error: '출고완료 주문은 취소할 수 없습니다.' }, 400)
    }

    // #55: 부분 출고 체크 — 출고된 카드가 1장이라도 있으면 취소 거부
    const shippedCardCheck = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM cards WHERE order_id = ? AND shipped_at IS NOT NULL
    `).bind(id).first<{ cnt: number }>()
    if (shippedCardCheck && shippedCardCheck.cnt > 0) {
      return c.json({
        success: false,
        error: `출고된 카드가 ${shippedCardCheck.cnt}건 있어 취소할 수 없습니다. 먼저 출고를 취소해주세요.`
      }, 400)
    }

    const cancelText = reason_detail ? `${reason}: ${reason_detail}` : reason

    // #55: 미출고 카드만 HOLD 처리 대상 조회
    const { results: cardsToHold } = await c.env.DB.prepare(`
      SELECT id, status FROM cards WHERE order_id = ? AND status NOT IN ('HOLD') AND shipped_at IS NULL
    `).bind(id).all<{ id: number; status: string }>()

    // 주문 취소 + 카드 HOLD + balance 롤백 + 이력 기록을 원자적 batch 처리
    const cancelStmts: D1PreparedStatement[] = [
      // 주문 취소
      c.env.DB.prepare(`
        UPDATE orders SET status = 'CANCELLED', cancel_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(cancelText, id),
    ]

    // 카드 HOLD 처리
    if (cardsToHold && cardsToHold.length > 0) {
      for (const card of cardsToHold) {
        cancelStmts.push(
          c.env.DB.prepare(`
            UPDATE cards SET status = 'HOLD', hold_reason = ?, hold_at = CURRENT_TIMESTAMP, hold_by = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind('주문 취소: ' + cancelText, user?.id || null, card.id)
        )
        cancelStmts.push(
          c.env.DB.prepare(`
            INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
            VALUES (?, ?, 'HOLD', ?, ?)
          `).bind(card.id, card.status, user?.id || null, '주문 취소: ' + cancelText)
        )
      }
    }

    // split billing P3: balance 캐시 미사용 — 미수금은 status != 'CANCELLED' 파생이라 취소 시 자동 제외.

    // 이력 기록
    cancelStmts.push(
      c.env.DB.prepare(`
        INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
        VALUES (?, ?, 'CANCELLED', ?, ?)
      `).bind(id, order.status, user?.id || null, cancelText)
    )

    // D1 batch 최대 크기 제한 대응 (80건씩 chunk)
    for (let i = 0; i < cancelStmts.length; i += 80) {
      const chunk = cancelStmts.slice(i, i + 80)
      if (chunk.length > 0) await c.env.DB.batch(chunk)
    }

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'ORDER_CANCEL', entityType: 'ORDER', entityId: parseInt(id),
      entityLabel: order.order_number, details: cancelText
    })

    return c.json({ success: true, message: `주문 ${order.order_number}이(가) 취소되었습니다.` })
  } catch (error) {
    console.error('Order cancel error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// PATCH /:id/restore - 취소된 주문 복구 (→ CONFIRMED)
// ============================================================================
ordersLifecycleRouter.patch('/:id/restore', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')

    // #381: 소유 법인만 복구
    const efRs = entityFilter(c, 'orders')
    const order = await c.env.DB.prepare(
      `SELECT id, status, order_number FROM orders WHERE id = ?${efRs.clause}`
    ).bind(id, ...efRs.params).first<{ id: number; status: string; order_number: string }>()
    if (!order) return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)

    if (order.status !== 'CANCELLED') {
      return c.json({ success: false, error: '취소 상태의 주문만 복구할 수 있습니다.' }, 400)
    }

    // 주문 복원 + 카드 복원 + 이력 기록을 원자적 batch 처리
    await c.env.DB.batch([
      c.env.DB.prepare(`
        UPDATE orders SET status = 'CONFIRMED', cancel_reason = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(id),
      c.env.DB.prepare(`
        UPDATE cards SET status = 'PRINTING', hold_reason = NULL, hold_at = NULL, hold_by = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE order_id = ? AND status = 'HOLD'
          AND (hold_reason LIKE '주문 취소%' OR hold_reason LIKE '주문 삭제%')
      `).bind(id),
      c.env.DB.prepare(`
        INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
        VALUES (?, 'CANCELLED', 'CONFIRMED', ?, '주문 복구')
      `).bind(id, user?.id || null),
    ])

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'ORDER_RESTORE', entityType: 'ORDER', entityId: parseInt(id),
      entityLabel: order.order_number, details: '취소 주문 복구 → CONFIRMED'
    })

    return c.json({ success: true, message: `주문 ${order.order_number}이(가) 복구되었습니다.` })
  } catch (error) {
    console.error('Order restore error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST /sync-statuses - 상태 동기화 (출고완료 지연 전이 + 회계반영 자동 전이)
// ============================================================================
ordersLifecycleRouter.post('/sync-statuses', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const db = c.env.DB
    const user = c.get('user')

    // Step 1: 출고완료 자동 전이 — auto_complete_date 도래 + 모든 카드 출고완료
    const ef = entityFilter(c, 'o')
    // 출고완료 전이: auto_complete_date 도래 + 미출고 카드 없음 (PRINT_DONE 가정 제거).
    //   · 제작 주문: status=PRINT_DONE + 카드 전부 출고
    //   · 기성/유통 주문: status=CONFIRMED + 카드 없음(NOT EXISTS 자동 충족) → 동일하게 전이
    //   auto_complete_date는 출고 처리 시에만 설정되므로 "출고됨" 신호로 신뢰 가능
    const { results: toShip } = await db.prepare(`
      SELECT o.id, o.status, o.delivery_method FROM orders o
      WHERE o.auto_complete_date IS NOT NULL
        AND o.auto_complete_date <= date('now', '+9 hours')
        AND o.status NOT IN ('SHIPPED', 'COMPLETED', 'CANCELLED', 'QUOTATION', 'HOLD')
        AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.order_id = o.id AND c.shipped_at IS NULL)
        ${ef.clause}
    `).bind(...ef.params).all()

    // N+1 제거: 주문당 UPDATE + 이력 INSERT를 db.batch로 묶음 (청크 80, 짝수라 쌍 분할 없음)
    const shipStmts: D1PreparedStatement[] = []
    for (const order of toShip) {
      const method = ((order.delivery_method as string) || '').trim()
      const isQuick = method === '방문수령' || method === '직접수령' || method === '직접배송' || method === '퀵'
      const billableDays = isQuick ? 1 : 2
      const fromStatus = (order.status as string) || 'CONFIRMED'

      shipStmts.push(db.prepare(`
        UPDATE orders SET status = 'SHIPPED', updated_at = CURRENT_TIMESTAMP,
          billable_after = date('now', '+9 hours', '+' || ? || ' days')
        WHERE id = ? AND status = ?
      `).bind(billableDays, order.id, fromStatus))

      shipStmts.push(db.prepare(`
        INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
        VALUES (?, ?, 'SHIPPED', ?, '동기화: 출고완료 자동 전이')
      `).bind(order.id, fromStatus, user?.id || null))
    }
    for (let i = 0; i < shipStmts.length; i += 80) {
      await db.batch(shipStmts.slice(i, i + 80))
    }

    // Step 2: 회계반영 자동 전이 — auto_billing=1 거래처 + billable_after 도래
    const { results: toBill } = await db.prepare(`
      SELECT o.id, o.client_id FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.status = 'SHIPPED'
        AND o.billing_status IS NULL
        AND o.billable_after IS NOT NULL
        AND o.billable_after <= date('now', '+9 hours')
        AND o.final_amount > 0
        AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.price_status = 'PENDING')
        AND c.auto_billing = 1
        ${ef.clause}
    `).bind(...ef.params).all()

    // N+1 제거: 주문당 per-order batch → 전체를 청크 80 batch로 묶음 (짝수라 주문쌍 분할 없음 → 원자성 보존)
    const toBillStmts: D1PreparedStatement[] = []
    for (const order of toBill) {
      // #146/#121: billing_status + balance 원자적 업데이트
      // split billing P3: 그룹 BILLED + orders 미러 (balance 캐시 미사용). 청크 80=짝수라 주문쌍 분할 없음(원자성).
      toBillStmts.push(db.prepare(`UPDATE order_billing_groups SET billing_status = 'BILLED', billed_at = CURRENT_TIMESTAMP, billed_by = ?, accounting_date = COALESCE((SELECT COALESCE(o.billable_after, o.delivery_date) FROM orders o WHERE o.id = order_billing_groups.order_id), date('now','+9 hours')) WHERE order_id = ? AND billing_status IS NOT 'BILLED' AND billing_status IS NOT 'PAID'`).bind(user?.id || null, order.id))
      toBillStmts.push(db.prepare(`UPDATE orders SET billing_status = 'BILLED', billed_at = CURRENT_TIMESTAMP, billed_by = ?, billed_amount = final_amount, accounting_date = COALESCE(billable_after, delivery_date, date('now','+9 hours')), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND billing_status IS NULL`).bind(user?.id || null, order.id))
    }
    for (let i = 0; i < toBillStmts.length; i += 80) {
      await db.batch(toBillStmts.slice(i, i + 80))
    }

    // Step 3: CARD/ISSUED_BY_OTHER 거래처 — 발행 불필요, 자동 BILLED
    const { results: noInvoice } = await db.prepare(`
      SELECT o.id, o.client_id FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.status = 'SHIPPED'
        AND o.billing_status IS NULL
        AND o.billable_after IS NOT NULL
        AND o.billable_after <= date('now', '+9 hours')
        AND o.final_amount > 0
        AND c.invoice_method IN ('CARD', 'ISSUED_BY_OTHER')
        ${ef.clause}
    `).bind(...ef.params).all()

    // N+1 제거: 주문당 per-order batch → 전체를 청크 80 batch로 묶음 (짝수라 주문쌍 분할 없음 → 원자성 보존)
    const noInvStmts: D1PreparedStatement[] = []
    for (const order of noInvoice) {
      // #146/#121: billing_status + balance 원자적 업데이트
      // split billing P3: 그룹 BILLED + orders 미러 (balance 캐시 미사용). 청크 80=짝수라 주문쌍 분할 없음(원자성).
      noInvStmts.push(db.prepare(`UPDATE order_billing_groups SET billing_status = 'BILLED', billed_at = CURRENT_TIMESTAMP, billed_by = ?, accounting_date = COALESCE((SELECT COALESCE(o.billable_after, o.delivery_date) FROM orders o WHERE o.id = order_billing_groups.order_id), date('now','+9 hours')) WHERE order_id = ? AND billing_status IS NOT 'BILLED' AND billing_status IS NOT 'PAID'`).bind(user?.id || null, order.id))
      noInvStmts.push(db.prepare(`UPDATE orders SET billing_status = 'BILLED', billed_at = CURRENT_TIMESTAMP, billed_by = ?, billed_amount = final_amount, accounting_date = COALESCE(billable_after, delivery_date, date('now','+9 hours')), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND billing_status IS NULL`).bind(user?.id || null, order.id))
    }
    for (let i = 0; i < noInvStmts.length; i += 80) {
      await db.batch(noInvStmts.slice(i, i + 80))
    }

    const billedCount = toBill.length + noInvoice.length

    await logActivity({
      db,
      action: 'SYNC_STATUSES',
      entityType: 'ORDER',
      userId: user?.id,
      details: `상태 동기화 실행: 출고완료 ${toShip.length}건, 회계반영 ${billedCount}건`
    })

    return c.json({
      success: true,
      data: {
        shipped: toShip.length,
        billed: billedCount,
        shipped_ids: toShip.map((o) => o.id)
      }
    })
  } catch (error) {
    console.error('sync-statuses error:', error)
    return c.json({ success: false, error: '동기화 처리 중 오류가 발생했습니다.' }, 500)
  }
})


export default ordersLifecycleRouter
