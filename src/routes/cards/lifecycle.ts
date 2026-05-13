/**
 * cards/lifecycle.ts — 카드 상태 전환 + 출고 + 불량 + 카드 생성 (14 라우트)
 * Phase 3.1.A 분할: 2026-05-09
 *   - PATCH /bulk/status, /:id/status, /:id/pp-complete, /bulk/pp-complete
 *   - POST /bulk-ship, /:id/ship, /:id/defects
 *   - PATCH /:id/ship, /:id/unship, /:id/complete, /:id/revert
 *   - PATCH /defects/:defectId, /:cardId/items/:itemId/print-toggle
 *   - POST /generate/:orderId
 *
 * 내부 헬퍼: syncOrderStatusFromCards (cards.ts의 카드 상태 → 주문 상태 동기화)
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { requireAnyPagePermission } from '../../middleware/permissions'
import { logActivity } from '../../utils/activityLog'
import { entityFilter, getEntityId } from '../../utils/entityFilter'

const cardsLifecycleRouter = new Hono<HonoEnv>()
cardsLifecycleRouter.use('/*', authMiddleware, requireAnyPagePermission('/cards', '/orders'))

async function syncOrderStatusFromCards(db: any, orderId: number) {
  // 1. 해당 주문의 모든 카드 상태 조회 (HOLD 제외)
  const cards = await db.prepare(
    `SELECT status FROM cards WHERE order_id = ? AND status != 'HOLD'`
  ).bind(orderId).all()

  if (!cards.results || cards.results.length === 0) return

  const statuses: string[] = cards.results.map((c: any) => c.status)

  // 2. 주문 현재 상태 확인 — 아래 상태는 카드로 자동 변경하지 않음
  const order = await db.prepare(
    `SELECT status FROM orders WHERE id = ?`
  ).bind(orderId).first()
  if (!order) return

  const skipStatuses = ['SHIPPED', 'CANCELLED', 'HOLD']
  if (skipStatuses.includes(order.status)) return

  // 3. 카드 상태 집계 → 주문 상태 결정
  let newStatus: string | null = null
  if (statuses.every((s) => s === 'PRINT_DONE')) {
    newStatus = 'PRINT_DONE'
  } else if (statuses.some((s) => s === 'PRINTING')) {
    // CONFIRMED 상태에서는 실제 출력 시작(카드 중 하나라도 PRINT_DONE이 있을 때)만 전이
    // 카드 생성 시 기본 PRINTING이므로, 모두 PRINTING이면 아직 실제 출력 시작 안 한 것
    if (order.status === 'CONFIRMED' && !statuses.some((s) => s === 'PRINT_DONE')) {
      return // 카드 생성 직후 — 아직 실제 출력 안 했으므로 CONFIRMED 유지
    }
    newStatus = 'PRINTING'
  }

  // 4. 변경이 필요한 경우만 UPDATE + 이력 기록
  if (newStatus && newStatus !== order.status) {
    await db.prepare(
      `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(newStatus, orderId).run()

    await db.prepare(`
      INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, ?, ?, 1, ?)
    `).bind(orderId, order.status, newStatus, '카드 상태 자동 동기화').run()
  }
}

// Bulk status change (must be before /:id)
cardsLifecycleRouter.patch('/bulk/status', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (c) => {
  try {
    const user = c.get('user')
    const { card_ids, status, reason, defect_category } = await c.req.json()

    if (!Array.isArray(card_ids) || card_ids.length === 0) {
      return c.json({ success: false, error: 'card_ids array required' }, 400)
    }

    const validStatuses = ['PRINTING', 'PRINT_DONE', 'HOLD']
    if (!validStatuses.includes(status)) {
      return c.json({ success: false, error: 'Invalid status' }, 400)
    }

    const affectedOrderIds = new Set<number>()

    // HOLD + defect_category 시 quality_issues에 사용할 employee_id 조회
    let employeeId: number | null = null
    if (status === 'HOLD' && defect_category && user?.id) {
      const emp = await c.env.DB.prepare('SELECT id FROM employees WHERE user_id = ?').bind(user.id).first() as any
      employeeId = emp?.id || null
    }

    // N+1 → 일괄 SELECT로 현재 상태 조회 (루프 SELECT 제거)
    const placeholders = card_ids.map(() => '?').join(',')
    const efBulk = entityFilter(c, 'o')
    const { results: existingCards } = await c.env.DB.prepare(`
      SELECT cards.id, cards.status, cards.order_id, cards.post_processing
      FROM cards
      JOIN orders o ON cards.order_id = o.id
      WHERE cards.id IN (${placeholders})${efBulk.clause}
    `).bind(...card_ids, ...efBulk.params).all()
    const cardMap = new Map((existingCards as any[]).map(c => [c.id, c]))

    // batch 문 구성
    const batchStmts: any[] = []
    let updated = 0

    for (const cardId of card_ids) {
      const card = cardMap.get(cardId) as any
      if (!card) continue

      if (status === 'HOLD') {
        batchStmts.push(
          c.env.DB.prepare(`
            UPDATE cards SET status = ?, hold_reason = ?, hold_at = CURRENT_TIMESTAMP,
            hold_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).bind(status, reason || null, user?.id || null, cardId)
        )

        // 불량 유형이 있으면 quality_issues 자동 생성
        if (defect_category && employeeId) {
          batchStmts.push(
            c.env.DB.prepare(`
              INSERT OR IGNORE INTO quality_issues (card_id, issue_type, defect_category, description, severity, status, reported_by)
              VALUES (?, 'DEFECT', ?, ?, 'MEDIUM', 'OPEN', ?)
            `).bind(cardId, defect_category, reason || defect_category, employeeId)
          )
        }
      } else if (status === 'PRINT_DONE') {
        // 후가공 상태 자동 설정 (이미 일괄 SELECT에서 post_processing 조회됨)
        const hasPP = card.post_processing && card.post_processing !== '[]' && card.post_processing !== ''
        const ppStatus = hasPP ? 'PENDING' : 'N/A'
        batchStmts.push(
          c.env.DB.prepare(`
            UPDATE cards SET status = ?, pp_status = ?, hold_reason = NULL, hold_at = NULL,
            hold_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).bind(status, ppStatus, cardId)
        )
      } else {
        batchStmts.push(
          c.env.DB.prepare(`
            UPDATE cards SET status = ?, hold_reason = NULL, hold_at = NULL,
            hold_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).bind(status, cardId)
        )
      }

      // 상태 이력
      batchStmts.push(
        c.env.DB.prepare(`
          INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
          VALUES (?, ?, ?, ?, ?)
        `).bind(cardId, card.status, status, user?.id || null, reason || 'Bulk status change')
      )

      if (card.order_id) affectedOrderIds.add(card.order_id)
      updated++
    }

    // D1 batch로 실행 (100개 단위 분할 — D1 batch 제한)
    for (let i = 0; i < batchStmts.length; i += 80) {
      const chunk = batchStmts.slice(i, i + 80)
      if (chunk.length > 0) await c.env.DB.batch(chunk)
    }

    // 영향받은 주문들의 상태 자동 동기화 (병렬 실행)
    await Promise.all([...affectedOrderIds].map(orderId =>
      syncOrderStatusFromCards(c.env.DB, orderId).catch(() => {})
    ))

    return c.json({ success: true, data: { updated }, message: `${updated}장 상태 변경 완료` })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})


// PATCH /defects/:defectId — 불량 처리 (해결/조치) — must be before /:id
cardsLifecycleRouter.patch('/defects/:defectId', async (c) => {
  try {
    const defectId = c.req.param('defectId')
    const user = c.get('user')
    const { status, corrective_action, root_cause, cost_impact } = await c.req.json()

    const validStatuses = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REWORK_REQUIRED']
    if (status && !validStatuses.includes(status)) {
      return c.json({ success: false, error: '유효하지 않은 상태입니다.' }, 400)
    }

    let employeeId: number | null = null
    if (user?.id) {
      const emp = await c.env.DB.prepare('SELECT id FROM employees WHERE user_id = ?').bind(user.id).first() as any
      employeeId = emp?.id || null
    }

    const sets: string[] = ['updated_at = CURRENT_TIMESTAMP']
    const params: any[] = []

    if (status) { sets.push('status = ?'); params.push(status) }
    if (corrective_action !== undefined) { sets.push('corrective_action = ?'); params.push(corrective_action) }
    if (root_cause !== undefined) { sets.push('root_cause = ?'); params.push(root_cause) }
    if (cost_impact !== undefined) { sets.push('cost_impact = ?'); params.push(parseFloat(cost_impact) || 0) }

    if (status === 'RESOLVED') {
      sets.push('resolved_by = ?', 'resolved_at = CURRENT_TIMESTAMP')
      params.push(employeeId)
    }

    params.push(defectId)
    await c.env.DB.prepare(`UPDATE quality_issues SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()

    return c.json({ success: true, message: '불량 처리가 업데이트되었습니다.' })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})


// 일괄 출고 처리 (/:id/ship 보다 먼저 등록되어야 함)
cardsLifecycleRouter.post('/bulk-ship', async (c) => {
  try {
    const user = c.get('user')
    const { card_ids } = await c.req.json() as { card_ids: number[] }

    if (!Array.isArray(card_ids) || card_ids.length === 0) {
      return c.json({ success: false, error: 'card_ids 배열이 필요합니다.' }, 400)
    }

    let shipped = 0
    let failed = 0
    const errors: string[] = []
    const processedOrderIds = new Set<number>()

    // N+1 → 일괄 SELECT로 카드 정보 조회
    const placeholders = card_ids.map(() => '?').join(',')
    const { results: existingCards } = await c.env.DB.prepare(`
      SELECT id, status, order_id, card_number, shipped_at FROM cards WHERE id IN (${placeholders})
    `).bind(...card_ids).all()
    const cardMap = new Map((existingCards as any[]).map(c => [c.id, c]))

    // 적격 카드 필터링 + batch UPDATE 구성
    const shipBatchStmts: any[] = []
    for (const cardId of card_ids) {
      const card = cardMap.get(cardId) as any
      if (!card) { failed++; errors.push(`ID ${cardId}: not found`); continue }
      if (card.status !== 'PRINT_DONE') { failed++; errors.push(`${card.card_number}: 상태 ${card.status}`); continue }
      if (card.shipped_at) { failed++; errors.push(`${card.card_number}: 이미 출고됨`); continue }

      shipBatchStmts.push(
        c.env.DB.prepare('UPDATE cards SET shipped_at = CURRENT_TIMESTAMP WHERE id = ?').bind(card.id)
      )
      shipped++
      processedOrderIds.add(card.order_id)
    }

    // batch로 출고 UPDATE 원자 실행
    if (shipBatchStmts.length > 0) {
      await c.env.DB.batch(shipBatchStmts)
    }

    // 주문 전체 출고 확인 — 주문별 1회 쿼리는 유지 (orderId 수 << card 수)
    let orderShippedCount = 0
    for (const orderId of processedOrderIds) {
      const progress = await c.env.DB.prepare(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN shipped_at IS NOT NULL THEN 1 ELSE 0 END) as shipped_count
        FROM cards WHERE order_id = ?
      `).bind(orderId).first() as any

      if (progress && progress.total > 0 && progress.total === progress.shipped_count) {
        const order = await c.env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(orderId).first() as any
        if (order && order.status !== 'SHIPPED' && order.status !== 'CANCELLED') {
          // batch로 UPDATE + 이력 INSERT 원자 처리
          await c.env.DB.batch([
            c.env.DB.prepare(
              `UPDATE orders SET status = 'SHIPPED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
            ).bind(orderId),
            c.env.DB.prepare(`
              INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
              VALUES (?, ?, 'SHIPPED', ?, '카드 전체 출고 완료 자동 처리')
            `).bind(orderId, order.status, user?.id || 1)
          ])
          orderShippedCount++
        }
      }
    }

    return c.json({
      success: true,
      data: { shipped, failed, errors, order_shipped_count: orderShippedCount },
      message: `${shipped}건 출고 완료` + (failed > 0 ? `, ${failed}건 실패` : '') + (orderShippedCount > 0 ? `, ${orderShippedCount}건 주문 출고완료` : '')
    })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// QR 출고 처리 — card_id(숫자) 또는 card_number(CARD-YYYYMMDD-NNN)로 출고
cardsLifecycleRouter.post('/:id/ship', async (c) => {
  try {
    const idParam = c.req.param('id')
    const user = c.get('user')

    // card_number 패턴 여부 확인
    const isCardNumber = /^CARD-\d{8}-\d{3,}$/i.test(idParam)

    const card = isCardNumber
      ? await c.env.DB.prepare(`
          SELECT id, status, order_id, card_number, shipped_at FROM cards WHERE card_number = ?
        `).bind(idParam).first() as any
      : await c.env.DB.prepare(`
          SELECT id, status, order_id, card_number, shipped_at FROM cards WHERE id = ?
        `).bind(idParam).first() as any

    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }

    if (card.status !== 'PRINT_DONE') {
      return c.json({
        success: false,
        error: `출고 처리는 PRINT_DONE 상태에서만 가능합니다. 현재 상태: ${card.status}`
      }, 400)
    }

    if (card.shipped_at) {
      return c.json({ success: false, error: '이미 출고 처리된 카드입니다.' }, 409)
    }

    // 후가공 미완료 체크
    const cardFull = await c.env.DB.prepare('SELECT pp_status FROM cards WHERE id = ?').bind(card.id).first() as any
    if (cardFull?.pp_status === 'PENDING') {
      const body = await c.req.json().catch(() => ({})) as any
      if (!body?.force) {
        return c.json({
          success: false,
          error: '후가공이 완료되지 않은 카드입니다. 강제 출고하려면 force: true를 전달하세요.',
          pp_pending: true
        }, 400)
      }
    }

    // shipped_at 설정으로 출고 처리
    await c.env.DB.prepare(
      'UPDATE cards SET shipped_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(card.id).run()

    // 해당 주문의 모든 카드 출고 여부 확인
    const progress = await c.env.DB.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN shipped_at IS NOT NULL THEN 1 ELSE 0 END) as shipped_count
      FROM cards WHERE order_id = ?
    `).bind(card.order_id).first() as any

    let orderShipped = false
    if (progress && progress.total > 0 && progress.total === progress.shipped_count) {
      const order = await c.env.DB.prepare(
        'SELECT status FROM orders WHERE id = ?'
      ).bind(card.order_id).first() as any

      if (order && order.status !== 'SHIPPED' && order.status !== 'CANCELLED') {
        await c.env.DB.prepare(`
          UPDATE orders SET status = 'SHIPPED', updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(card.order_id).run()

        await c.env.DB.prepare(`
          INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
          VALUES (?, ?, 'SHIPPED', ?, '카드 전체 출고 완료 자동 처리')
        `).bind(card.order_id, order.status, user?.id || 1).run()

        orderShipped = true
      }
    }

    return c.json({
      success: true,
      data: {
        card_id: card.id,
        card_number: card.card_number,
        order_shipped: orderShipped
      },
      message: orderShipped
        ? '카드 출고 처리 완료. 주문이 출고완료 상태로 변경되었습니다.'
        : '카드 출고 처리 완료'
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})


// POST /:id/defects — 불량 접수
cardsLifecycleRouter.post('/:id/defects', async (c) => {
  try {
    const cardId = c.req.param('id')
    const user = c.get('user')
    const { defect_category, description, severity, auto_hold } = await c.req.json()

    if (!defect_category || !description) {
      return c.json({ success: false, error: '불량 유형과 설명은 필수입니다.' }, 400)
    }

    // 사용자의 employee_id 조회
    let employeeId: number | null = null
    if (user?.id) {
      const emp = await c.env.DB.prepare('SELECT id FROM employees WHERE user_id = ?').bind(user.id).first() as any
      employeeId = emp?.id || null
    }
    if (!employeeId) {
      return c.json({ success: false, error: '직원 정보가 없습니다.' }, 400)
    }

    const card = await c.env.DB.prepare('SELECT id, status, order_id FROM cards WHERE id = ?').bind(cardId).first() as any
    if (!card) return c.json({ success: false, error: '카드를 찾을 수 없습니다.' }, 404)

    // 불량 기록 생성
    const result = await c.env.DB.prepare(`
      INSERT INTO quality_issues (card_id, issue_type, defect_category, description, severity, status, reported_by, entity_id)
      VALUES (?, 'DEFECT', ?, ?, ?, 'OPEN', ?, ?)
    `).bind(cardId, defect_category, description, severity || 'MEDIUM', employeeId, getEntityId(c) || 1).run()

    // auto_hold가 true이고 현재 HOLD 상태가 아니면 HOLD 전환
    if (auto_hold && card.status !== 'HOLD') {
      await c.env.DB.prepare(`
        UPDATE cards SET status = 'HOLD', hold_reason = ?, hold_at = CURRENT_TIMESTAMP,
        hold_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(description, user?.id || null, cardId).run()

      await c.env.DB.prepare(`
        INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
        VALUES (?, ?, 'HOLD', ?, ?)
      `).bind(cardId, card.status, user?.id || null, '불량 접수: ' + defect_category).run()

      if (card.order_id) {
        await syncOrderStatusFromCards(c.env.DB, card.order_id)
      }
    }

    return c.json({ success: true, data: { id: result.meta?.last_row_id }, message: '불량이 접수되었습니다.' })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})


// Update card status
cardsLifecycleRouter.patch('/:id/status', async (c) => {
  try {
    const id = c.req.param('id')
    const { status, reason, defect_category, rip_file_path } = await c.req.json() as {
      status: string
      reason?: string
      defect_category?: string
      rip_file_path?: string
    }
    const user = c.get('user')

    // Validate status — PRINT_ERROR added so LogWatcher/EdgeAgent can report
    // RIP failures observed in Print.log (Step 4 / PrintLogMonitor.cs).
    const validStatuses = ['PRINTING', 'PRINT_DONE', 'PRINT_ERROR', 'HOLD']
    if (!validStatuses.includes(status)) {
      return c.json({
        success: false,
        error: 'Invalid status'
      }, 400)
    }

    // Get current status and order_id
    const card = await c.env.DB.prepare('SELECT status, order_id, card_number FROM cards WHERE id = ?').bind(id).first() as any

    if (!card) {
      return c.json({
        success: false,
        error: 'Card not found'
      }, 404)
    }

    // Update card status with hold fields
    if (status === 'HOLD') {
      await c.env.DB.prepare(`
        UPDATE cards SET status = ?, hold_reason = ?, hold_at = CURRENT_TIMESTAMP,
        hold_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(status, reason || null, user?.id || null, id).run()

      // HOLD 전환 시 defect_category가 있으면 quality_issues 자동 생성
      if (defect_category) {
        const validDefectCategories = ['COLOR', 'SIZE', 'DAMAGE', 'MATERIAL', 'DESIGN', 'OTHER']
        const safeCategory = validDefectCategories.includes(defect_category) ? defect_category : 'OTHER'

        // reported_by: employees 테이블에서 user_id로 employee_id 조회
        const empRow = await c.env.DB.prepare(
          'SELECT id FROM employees WHERE user_id = ? LIMIT 1'
        ).bind(user?.id || null).first() as any
        const reportedBy = empRow?.id || null

        if (reportedBy) {
          await c.env.DB.prepare(`
            INSERT INTO quality_issues (
              work_record_id, card_id, issue_type, defect_category,
              quantity_defect, description, status, reported_by, created_at, entity_id
            ) VALUES (NULL, ?, 'DEFECT', ?, 1, ?, 'REPORTED', ?, CURRENT_TIMESTAMP, ?)
          `).bind(parseInt(id), safeCategory, reason || '', reportedBy, getEntityId(c) || 1).run()
        }
      }
    } else {
      // PRINT_DONE 전환 시 후가공 상태 자동 설정
      if (status === 'PRINT_DONE') {
        const cardDetail = await c.env.DB.prepare('SELECT post_processing FROM cards WHERE id = ?').bind(id).first() as any
        const hasPP = cardDetail?.post_processing && cardDetail.post_processing !== '[]' && cardDetail.post_processing !== ''
        const ppStatus = hasPP ? 'PENDING' : 'N/A'
        await c.env.DB.prepare(`
          UPDATE cards SET status = ?, pp_status = ?, hold_reason = NULL, hold_at = NULL,
          hold_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(status, ppStatus, id).run()
      } else if (rip_file_path) {
        // EdgeAgent/LogWatcher reports the EPS path picked up by RIP so we can
        // trace print-log lines back to the originating card.
        await c.env.DB.prepare(`
          UPDATE cards SET status = ?, rip_file_path = ?, hold_reason = NULL,
          hold_at = NULL, hold_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(status, rip_file_path, id).run()
      } else {
        await c.env.DB.prepare(`
          UPDATE cards SET status = ?, hold_reason = NULL, hold_at = NULL,
          hold_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(status, id).run()
      }
    }

    // Insert status history
    await c.env.DB.prepare(`
      INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, card.status, status, user?.id || null, reason || null).run()

    // 주문 상태 자동 동기화
    if (card.order_id) {
      await syncOrderStatusFromCards(c.env.DB, card.order_id)
    }

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'STATUS_CHANGE', entityType: 'CARD', entityId: parseInt(id),
      entityLabel: card.card_number || String(id),
      details: JSON.stringify({ from: card.status, to: status })
    })

    return c.json({
      success: true,
      message: 'Card status updated successfully'
    })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ── 후가공 완료 처리 ──────────────────────────────────────────────────────────
cardsLifecycleRouter.patch('/:id/pp-complete', async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')

    const card = await c.env.DB.prepare(
      'SELECT id, card_number, order_id, status, pp_status, post_processing FROM cards WHERE id = ?'
    ).bind(id).first() as any

    if (!card) return c.json({ success: false, error: 'Card not found' }, 404)
    if (card.status !== 'PRINT_DONE') return c.json({ success: false, error: '인쇄 완료 상태에서만 후가공 완료 처리 가능합니다' }, 400)
    if (card.pp_status === 'DONE') return c.json({ success: false, error: '이미 후가공 완료 처리되었습니다' }, 400)
    if (card.pp_status === 'N/A') return c.json({ success: false, error: '후가공이 없는 카드입니다' }, 400)

    await c.env.DB.prepare(
      `UPDATE cards SET pp_status = 'DONE', pp_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(id).run()

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'PP_COMPLETE', entityType: 'CARD', entityId: parseInt(id),
      entityLabel: card.card_number || String(id),
      details: JSON.stringify({ post_processing: card.post_processing })
    })

    return c.json({ success: true, message: '후가공 완료 처리되었습니다' })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 후가공 완료 일괄 처리 ────────────────────────────────────────────────────
cardsLifecycleRouter.patch('/bulk/pp-complete', async (c) => {
  try {
    const { card_ids } = await c.req.json()
    const user = c.get('user')

    if (!card_ids?.length) return c.json({ success: false, error: 'card_ids required' }, 400)

    // N+1 → 단일 조건부 UPDATE (SELECT 루프 제거)
    const placeholders = card_ids.map(() => '?').join(',')
    const result = await c.env.DB.prepare(`
      UPDATE cards SET pp_status = 'DONE', pp_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders}) AND status = 'PRINT_DONE' AND pp_status = 'PENDING'
    `).bind(...card_ids).run()
    const completed = result.meta?.changes ?? 0

    return c.json({ success: true, message: `${completed}건 후가공 완료 처리`, data: { completed } })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})


// 카드 개별 출고 처리
cardsLifecycleRouter.patch('/:id/ship', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')

    // 1. 카드 조회
    const card = await c.env.DB.prepare(
      'SELECT * FROM cards WHERE id = ?'
    ).bind(id).first() as any

    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }

    // 2. 검증
    if (card.status !== 'PRINT_DONE') {
      return c.json({
        success: false,
        error: '출력 완료(PRINT_DONE) 상태의 카드만 출고할 수 있습니다.'
      }, 400)
    }

    if (card.shipped_at) {
      return c.json({ success: false, error: '이미 출고된 카드입니다.' }, 400)
    }

    // 후가공 미완료 검증 (경고)
    if (card.pp_status === 'PENDING') {
      const { force } = await c.req.json().catch(() => ({ force: false }))
      if (!force) {
        return c.json({
          success: false,
          error: '후가공이 완료되지 않은 카드입니다. 강제 출고하려면 force: true를 전달하세요.',
          pp_pending: true
        }, 400)
      }
    }

    // 3. 출고 처리
    await c.env.DB.prepare(
      'UPDATE cards SET shipped_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(id).run()

    // 4. 해당 주문의 모든 카드 출고 여부 확인
    const progress = await c.env.DB.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN shipped_at IS NOT NULL THEN 1 ELSE 0 END) as shipped
      FROM cards WHERE order_id = ?
    `).bind(card.order_id).first() as any

    let orderShipped = false
    const allShipped = progress && progress.total > 0 && progress.total === progress.shipped

    // 5. 모두 출고되었으면 주문 상태를 SHIPPED로 변경
    if (allShipped) {
      const order = await c.env.DB.prepare(
        'SELECT status FROM orders WHERE id = ?'
      ).bind(card.order_id).first() as any

      if (order && order.status !== 'SHIPPED' && order.status !== 'CANCELLED') {
        await c.env.DB.prepare(
          `UPDATE orders SET status = 'SHIPPED', updated_at = datetime('now') WHERE id = ?`
        ).bind(card.order_id).run()

        await c.env.DB.prepare(`
          INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
          VALUES (?, ?, 'SHIPPED', ?, '카드 전체 출고 완료 자동 처리')
        `).bind(card.order_id, order.status, user?.id || 1).run()

        orderShipped = true
      }
    }

    // 5-1. 출고 기록(shipments) 생성 — 실패해도 카드 출고는 유지
    try {
      const existingShipment = await c.env.DB.prepare(
        'SELECT id FROM shipments WHERE order_id = ?'
      ).bind(card.order_id).first() as any

      if (!existingShipment) {
        // 출고번호 생성: SHP-YYYYMMDD-NNN
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const countResult = await c.env.DB.prepare(
          `SELECT COUNT(*) as cnt FROM shipments WHERE shipment_number LIKE ?`
        ).bind(`SHP-${today}-%`).first() as any
        const seq = String((countResult?.cnt || 0) + 1).padStart(3, '0')
        const shipmentNumber = `SHP-${today}-${seq}`

        // 주문 정보 조회
        const orderInfo = await c.env.DB.prepare(
          'SELECT delivery_method, delivery_info, contact_phone FROM orders WHERE id = ?'
        ).bind(card.order_id).first() as any

        // delivery_method → delivery_type 매핑 (CHECK 제약: DELIVERY, PICKUP, FREIGHT, QUICK)
        const dtMap: Record<string, string> = {
          '대신택배': 'DELIVERY', '한진택배': 'DELIVERY', '직배': 'DELIVERY',
          '대신화물': 'FREIGHT', '용차': 'FREIGHT', '퀵': 'QUICK', '방문수령': 'PICKUP'
        }
        const deliveryType = dtMap[orderInfo?.delivery_method] || 'DELIVERY'

        const shipmentResult = await c.env.DB.prepare(`
          INSERT INTO shipments (shipment_number, order_id, status, delivery_type, courier_name, shipped_at, receiver_address, created_by, entity_id)
          VALUES (?, ?, 'SHIPPED', ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
        `).bind(
          shipmentNumber,
          card.order_id,
          deliveryType,
          orderInfo?.delivery_method || null,
          orderInfo?.delivery_info || null,
          user?.id || 1,
          getEntityId(c) || 1
        ).run()

        const shipmentId = shipmentResult.meta?.last_row_id

        if (shipmentId) {
          // 카드에 연결된 card_items에서 order_item_id와 수량 조회
          const cardItems = await c.env.DB.prepare(
            'SELECT order_item_id, quantity FROM card_items WHERE card_id = ?'
          ).bind(card.id).all()

          if (cardItems.results?.length) {
            for (const ci of cardItems.results as any[]) {
              await c.env.DB.prepare(`
                INSERT INTO shipment_items (shipment_id, card_id, order_item_id, quantity)
                VALUES (?, ?, ?, ?)
              `).bind(shipmentId, card.id, ci.order_item_id, ci.quantity).run()
            }
          } else {
            // card_items가 없으면 카드 자체 정보로 1건 생성
            await c.env.DB.prepare(`
              INSERT INTO shipment_items (shipment_id, card_id, order_item_id, quantity)
              VALUES (?, ?, ?, 1)
            `).bind(shipmentId, card.id, card.order_item_id || null).run()
          }
        }
      } else {
        // 이미 shipment가 있으면 현재 카드의 아이템만 추가
        const existsItem = await c.env.DB.prepare(
          'SELECT id FROM shipment_items WHERE shipment_id = ? AND card_id = ?'
        ).bind(existingShipment.id, card.id).first()

        if (!existsItem) {
          const cardItems = await c.env.DB.prepare(
            'SELECT order_item_id, quantity FROM card_items WHERE card_id = ?'
          ).bind(card.id).all()

          if (cardItems.results?.length) {
            for (const ci of cardItems.results as any[]) {
              await c.env.DB.prepare(`
                INSERT INTO shipment_items (shipment_id, card_id, order_item_id, quantity)
                VALUES (?, ?, ?, ?)
              `).bind(existingShipment.id, card.id, ci.order_item_id, ci.quantity).run()
            }
          } else {
            await c.env.DB.prepare(`
              INSERT INTO shipment_items (shipment_id, card_id, order_item_id, quantity)
              VALUES (?, ?, ?, 1)
            `).bind(existingShipment.id, card.id, card.order_item_id || null).run()
          }
        }
      }
    } catch (shipErr) {
      console.error('shipment record creation failed (card ship continues):', shipErr)
    }

    // 6. 응답
    return c.json({ success: true, card_shipped: true, order_shipped: orderShipped })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// 카드 출고 취소
cardsLifecycleRouter.patch('/:id/unship', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')

    // 1. 카드 조회
    const card = await c.env.DB.prepare(
      'SELECT * FROM cards WHERE id = ?'
    ).bind(id).first() as any

    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }

    // 2. 검증
    if (!card.shipped_at) {
      return c.json({ success: false, error: '출고되지 않은 카드입니다.' }, 400)
    }

    // 3. 출고 취소
    await c.env.DB.prepare(
      'UPDATE cards SET shipped_at = NULL WHERE id = ?'
    ).bind(id).run()

    // 4. 주문이 SHIPPED 상태였으면 PRINT_DONE으로 되돌림
    const order = await c.env.DB.prepare(
      'SELECT status FROM orders WHERE id = ?'
    ).bind(card.order_id).first() as any

    if (order && order.status === 'SHIPPED') {
      await c.env.DB.prepare(
        `UPDATE orders SET status = 'PRINT_DONE', updated_at = datetime('now') WHERE id = ?`
      ).bind(card.order_id).run()

      await c.env.DB.prepare(`
        INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
        VALUES (?, 'SHIPPED', 'PRINT_DONE', ?, '카드 출고 취소로 주문 상태 복원')
      `).bind(card.order_id, user?.id || 1).run()
    }

    return c.json({ success: true })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})


// Generate cards from order
cardsLifecycleRouter.post('/generate/:orderId', async (c) => {
  try {
    const orderId = c.req.param('orderId')
    const user = c.get('user')

    // Get order details
    const order = await c.env.DB.prepare(`
      SELECT o.*, c.client_name
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.id = ?
    `).bind(orderId).first() as any

    if (!order) {
      return c.json({
        success: false,
        error: 'Order not found'
      }, 404)
    }

    // Get order items
    const { results: orderItems } = await c.env.DB.prepare(`
      SELECT * FROM order_items WHERE order_id = ? ORDER BY sort_order ASC
    `).bind(orderId).all() as any

    if (orderItems.length === 0) {
      return c.json({
        success: false,
        error: 'No order items found'
      }, 400)
    }

    // Get post-processing options for margin calculation
    const { results: postProcOptions } = await c.env.DB.prepare(`
      SELECT * FROM post_processing_options WHERE is_active = 1
    `).all() as any

    const postProcMap = new Map()
    postProcOptions.forEach((opt: any) => {
      postProcMap.set(opt.option_code, opt)
    })

    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')

    // Get today's card count for numbering
    const { count } = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM cards
      WHERE date(created_at) = date('now')
    `).first() as any

    let cardCount = count
    const createdCards = []

    // Generate cards for each order item
    for (const item of orderItems) {
      cardCount++
      const cardNumber = `CARD-${dateStr}-${String(cardCount).padStart(3, '0')}`

      // Calculate final dimensions with post-processing margins
      let finalWidth = item.width || 0
      let finalHeight = item.height || 0

      if (item.post_processing) {
        const postProcs = JSON.parse(item.post_processing)
        postProcs.forEach((procCode: string) => {
          const proc = postProcMap.get(procCode)
          if (proc) {
            finalWidth += (proc.margin_left + proc.margin_right)
            finalHeight += (proc.margin_top + proc.margin_bottom)
          }
        })
      }

      // Generate RIP filename
      const specs = item.width && item.height ? `${item.width}x${item.height}` : '규격미정'
      const postProcStr = item.post_processing ? JSON.parse(item.post_processing).join('+') : ''
      const ripFilename = `${cardCount}-${order.client_name} ${item.item_name}(${specs}-${item.quantity}${item.unit})${postProcStr}_${order.delivery_date || '미정'}`

      // Insert card
      const cardResult = await c.env.DB.prepare(`
        INSERT INTO cards (
          card_number, order_id, order_item_id, status,
          client_name, item_name, category_name,
          width, height, quantity, unit,
          rip_filename, post_processing,
          final_width, final_height,
          delivery_date, priority,
          requesting_entity_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        cardNumber, orderId, item.id, 'PRINTING',
        order.client_name || 'Unknown', item.item_name, item.category_name,
        item.width || 0, item.height || 0, item.quantity, item.unit || 'EA',
        ripFilename, item.post_processing,
        finalWidth, finalHeight,
        order.delivery_date || null, order.priority || 'NORMAL',
        getEntityId(c)
      ).run()

      const cardId = cardResult.meta.last_row_id

      // Add card info to created cards array
      createdCards.push({
        id: cardId,
        card_number: cardNumber,
        order_item_id: item.id,
        rip_filename: ripFilename
      })
    }

    // Try to set thumbnail from ai_analysis if available (단일 UPDATE 서브쿼리, N+1 제거)
    try {
      await c.env.DB.prepare(`
        UPDATE cards SET thumbnail_url = (
          SELECT aa.thumbnail_url FROM ai_analysis aa
          JOIN order_items oi ON oi.ai_analysis_id = aa.id
          WHERE oi.id = cards.order_item_id AND aa.thumbnail_url IS NOT NULL
        )
        WHERE order_id = ? AND thumbnail_url IS NULL
          AND order_item_id IN (SELECT id FROM order_items WHERE ai_analysis_id IS NOT NULL)
      `).bind(orderId).run()
    } catch (thumbErr) {
      console.error('Thumbnail sync failed (non-blocking):', thumbErr)
    }

    // Log activity
    try {
      await c.env.DB.prepare(`
        INSERT INTO activity_logs (user_id, action, resource_type, resource_id, details)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        user.id,
        'CREATE',
        'CARD',
        orderId,
        JSON.stringify({
          card_count: createdCards.length,
          card_numbers: createdCards.map((c: any) => c.card_number)
        })
      ).run()
    } catch (logErr) {
      console.error('Activity log failed (non-blocking):', logErr)
    }

    return c.json({
      success: true,
      data: {
        id: orderId,
        order_number: order.order_number
      },
      message: `${createdCards.length}장의 카드가 생성되었습니다.`
    })
  } catch (error) {
    console.error('Card generation error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})


// ===== 개별 card_item 출력완료 토글 =====
cardsLifecycleRouter.patch('/:cardId/items/:itemId/print-toggle', async (c) => {
  try {
    const cardId = c.req.param('cardId')
    const itemId = c.req.param('itemId')
    const user = c.get('user')

    // card_item 확인
    const ci = await c.env.DB.prepare(
      'SELECT ci.id, ci.card_id, ci.print_completed, c.status, c.order_id FROM card_items ci JOIN cards c ON c.id = ci.card_id WHERE ci.id = ? AND ci.card_id = ?'
    ).bind(itemId, cardId).first() as any

    if (!ci) {
      return c.json({ success: false, error: 'Card item not found' }, 404)
    }

    const newVal = ci.print_completed === 1 ? 0 : 1

    if (newVal === 1) {
      await c.env.DB.prepare(
        'UPDATE card_items SET print_completed = 1, print_completed_at = CURRENT_TIMESTAMP, print_completed_by = ? WHERE id = ?'
      ).bind(user?.id || null, itemId).run()
    } else {
      await c.env.DB.prepare(
        'UPDATE card_items SET print_completed = 0, print_completed_at = NULL, print_completed_by = NULL WHERE id = ?'
      ).bind(itemId).run()
    }

    // 전체 완료 여부 확인 → 자동 PRINT_DONE 전환
    const { results: allItems } = await c.env.DB.prepare(
      'SELECT print_completed FROM card_items WHERE card_id = ?'
    ).bind(cardId).all() as any

    const total = allItems.length
    const done = allItems.filter((i: any) => i.print_completed === 1).length
    const allDone = total > 0 && done === total

    if (allDone && ci.status !== 'PRINT_DONE') {
      // 모든 파일 완료 → PRINT_DONE
      await c.env.DB.prepare(
        "UPDATE cards SET status = 'PRINT_DONE', print_done_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(cardId).run()
      await syncOrderStatusFromCards(c.env.DB, ci.order_id)
    } else if (!allDone && ci.status === 'PRINT_DONE') {
      // 체크 해제로 미완료 → PRINTING으로 되돌림
      await c.env.DB.prepare(
        "UPDATE cards SET status = 'PRINTING', print_done_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(cardId).run()
      await syncOrderStatusFromCards(c.env.DB, ci.order_id)
    }

    return c.json({
      success: true,
      data: { card_item_id: Number(itemId), print_completed: newVal, progress: { total, done } }
    })
  } catch (err) {
    console.error('card item print toggle error:', err)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===== 전체 품목 출력완료 (카드 PRINT_DONE 단축키) =====
// - 모든 card_items.print_completed = 1
// - cards.status = PRINT_DONE (+ pp_status 자동 설정)
// - card_status_history 기록
// - 주문 상태 동기화
// 단일 경로로 item과 card 상태 동기화를 보장한다.
cardsLifecycleRouter.patch('/:id/complete', async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')

    const card = await c.env.DB.prepare(
      'SELECT id, status, order_id, post_processing FROM cards WHERE id = ?'
    ).bind(id).first() as any

    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }
    if (card.status === 'PRINT_DONE') {
      return c.json({ success: false, error: '이미 출력완료 상태입니다.' }, 400)
    }

    // 1) 모든 card_items를 print_completed=1 로 일괄 갱신
    await c.env.DB.prepare(
      'UPDATE card_items SET print_completed = 1, print_completed_at = CURRENT_TIMESTAMP, print_completed_by = ? WHERE card_id = ? AND print_completed = 0'
    ).bind(user?.id || null, id).run()

    // 2) pp_status 결정
    const hasPP = card.post_processing && card.post_processing !== '[]' && card.post_processing !== ''
    const ppStatus = hasPP ? 'PENDING' : 'N/A'

    // 3) 카드 상태 PRINT_DONE 전환
    await c.env.DB.prepare(
      "UPDATE cards SET status = 'PRINT_DONE', pp_status = ?, print_done_at = CURRENT_TIMESTAMP, hold_reason = NULL, hold_at = NULL, hold_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(ppStatus, id).run()

    // 4) 상태 이력 기록
    await c.env.DB.prepare(
      "INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason) VALUES (?, ?, 'PRINT_DONE', ?, '출력완료')"
    ).bind(id, card.status, user?.id || null).run()

    // 5) 주문 상태 동기화
    await syncOrderStatusFromCards(c.env.DB, card.order_id)

    // 6) 진행률 반환
    const { results: allItems } = await c.env.DB.prepare(
      'SELECT print_completed FROM card_items WHERE card_id = ?'
    ).bind(id).all() as any
    const total = allItems.length
    const done = allItems.filter((i: any) => i.print_completed === 1).length

    return c.json({
      success: true,
      data: { card_id: Number(id), status: 'PRINT_DONE', progress: { total, done } }
    })
  } catch (err) {
    console.error('card complete error:', err)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===== 출력완료 → 진행중 되돌리기 =====
cardsLifecycleRouter.patch('/:id/revert', async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')

    const card = await c.env.DB.prepare(
      'SELECT id, status, order_id, card_number FROM cards WHERE id = ?'
    ).bind(id).first() as any

    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }
    if (card.status !== 'PRINT_DONE') {
      return c.json({ success: false, error: '출력완료 상태의 카드만 되돌릴 수 있습니다.' }, 400)
    }

    // 카드를 RIP_WAITING으로 되돌림
    await c.env.DB.prepare(
      "UPDATE cards SET status = 'RIP_WAITING', print_done_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(id).run()

    // card_items의 print_completed도 모두 초기화
    await c.env.DB.prepare(
      'UPDATE card_items SET print_completed = 0, print_completed_at = NULL, print_completed_by = NULL WHERE card_id = ?'
    ).bind(id).run()

    // 주문 상태 동기화
    await syncOrderStatusFromCards(c.env.DB, card.order_id)

    return c.json({ success: true, message: '진행중으로 되돌렸습니다.' })
  } catch (err) {
    console.error('card revert error:', err)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})


export default cardsLifecycleRouter
