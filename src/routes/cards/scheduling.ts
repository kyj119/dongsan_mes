/**
 * cards/scheduling.ts — 카드 일정 + 우선순위 (4 라우트)
 * Phase 3.1.A 분할: 2026-05-09
 *   - PUT /schedule/assign/:id, PUT /schedule/priority/:id
 *   - PATCH /bulk/priority, PATCH /:id (notes/priority/delivery_date)
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { requireAnyPagePermission } from '../../middleware/permissions'
import { logActivity } from '../../utils/activityLog'

const cardsSchedulingRouter = new Hono<HonoEnv>()
cardsSchedulingRouter.use('/*', authMiddleware, requireAnyPagePermission('/cards', '/orders'))


// ── 스케줄: 카드 장비 배정 ──
cardsSchedulingRouter.put('/schedule/assign/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const { equipment_id } = await c.req.json()

    const card = await c.env.DB.prepare(
      'SELECT id, equipment_id, card_number FROM cards WHERE id = ?'
    ).bind(id).first() as any

    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }

    if (equipment_id) {
      const equip = await c.env.DB.prepare(
        "SELECT id, equipment_status FROM equipment WHERE id = ? AND status = 'ACTIVE'"
      ).bind(equipment_id).first() as any
      if (!equip) {
        return c.json({ success: false, error: 'Equipment not found or inactive' }, 404)
      }
      if (equip.equipment_status === 'MAINTENANCE' || equip.equipment_status === 'BROKEN') {
        return c.json({ success: false, error: '유지보수/고장 중인 장비에는 배정할 수 없습니다.' }, 400)
      }
    }

    await c.env.DB.prepare(
      'UPDATE cards SET equipment_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(equipment_id || null, id).run()

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'UPDATE', entityType: 'CARD', entityId: parseInt(id),
      entityLabel: card.card_number || String(id),
      details: JSON.stringify({ equipment_id_from: card.equipment_id, equipment_id_to: equipment_id })
    })

    return c.json({ success: true, message: '장비 배정 완료' })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ── 스케줄: 카드 우선순위 변경 ──
cardsSchedulingRouter.put('/schedule/priority/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { priority } = await c.req.json()

    if (typeof priority !== 'number' || priority < 0 || priority > 99) {
      return c.json({ success: false, error: 'Priority must be 0-99' }, 400)
    }

    const card = await c.env.DB.prepare(
      'SELECT id FROM cards WHERE id = ?'
    ).bind(id).first()

    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }

    await c.env.DB.prepare(
      'UPDATE cards SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(priority, id).run()

    return c.json({ success: true, message: '우선순위 변경 완료' })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Bulk priority update (must be before /:id)
cardsSchedulingRouter.patch('/bulk/priority', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { card_ids, priority } = await c.req.json()

    if (!Array.isArray(card_ids) || card_ids.length === 0) {
      return c.json({ success: false, error: 'card_ids array required' }, 400)
    }

    if (typeof priority !== 'number' || priority < 0 || priority > 99) {
      return c.json({ success: false, error: 'Priority must be 0-99' }, 400)
    }

    const stmts = card_ids.map((id: number) =>
      c.env.DB.prepare('UPDATE cards SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(priority, id)
    )
    for (let i = 0; i < stmts.length; i += 80) {
      await c.env.DB.batch(stmts.slice(i, i + 80))
    }

    return c.json({ success: true, data: { updated: card_ids.length }, message: `${card_ids.length}장 우선순위 변경 완료` })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})


// Update card details (notes, priority, delivery_date)
cardsSchedulingRouter.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()

    const card = await c.env.DB.prepare('SELECT * FROM cards WHERE id = ?').bind(id).first()
    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }

    const updates: string[] = []
    const params: any[] = []

    if (body.notes !== undefined) { updates.push('notes = ?'); params.push(body.notes) }
    if (body.priority !== undefined) { updates.push('priority = ?'); params.push(body.priority) }
    if (body.delivery_date !== undefined) { updates.push('delivery_date = ?'); params.push(body.delivery_date) }

    if (updates.length === 0) {
      return c.json({ success: false, error: 'No fields to update' }, 400)
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    await c.env.DB.prepare(`UPDATE cards SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run()

    return c.json({ success: true, message: 'Card updated' })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})


export default cardsSchedulingRouter
