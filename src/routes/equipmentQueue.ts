import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const equipmentQueue = new Hono<HonoEnv>()
equipmentQueue.use('*', authMiddleware)

// ─── 장비별 작업 큐 조회 ──────────────────────────────────────────────────────
equipmentQueue.get('/:equipmentId/queue', async (c) => {
  const equipmentId = c.req.param('equipmentId')

  const { results } = await c.env.DB.prepare(`
    SELECT c.id, c.card_number, c.client_name, c.item_name,
      c.width, c.height, c.quantity, c.priority, c.delivery_date,
      c.estimated_minutes, c.queue_position, c.estimated_start_at, c.estimated_end_at,
      c.rip_status, c.status
    FROM cards c
    WHERE c.equipment_id = ? AND c.status = 'PRINTING'
    ORDER BY c.priority DESC, c.delivery_date ASC, c.created_at ASC
  `).bind(equipmentId).all()

  return c.json({ success: true, data: results })
})

// ─── 전체 장비 부하 현황 ──────────────────────────────────────────────────────
equipmentQueue.get('/workload', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT e.id, e.name, e.daily_capacity, e.avg_print_minutes_per_sqm,
      e.working_hours_start, e.working_hours_end, e.status as equipment_status,
      COUNT(c.id) as queue_count,
      COALESCE(SUM(c.estimated_minutes), 0) as total_estimated_minutes,
      MIN(c.delivery_date) as earliest_deadline
    FROM equipment e
    LEFT JOIN cards c ON c.equipment_id = e.id AND c.status = 'PRINTING'
    WHERE e.status = 'ACTIVE'
    GROUP BY e.id
    ORDER BY total_estimated_minutes DESC
  `).all()

  return c.json({ success: true, data: results })
})

// ─── 카드 예상시간 계산 + 큐 포지션 갱신 ──────────────────────────────────────
equipmentQueue.post('/:equipmentId/recalculate', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const equipmentId = c.req.param('equipmentId')

  // 장비 정보
  const eq = await c.env.DB.prepare(
    `SELECT avg_print_minutes_per_sqm, working_hours_start, working_hours_end FROM equipment WHERE id = ?`
  ).bind(equipmentId).first<{ avg_print_minutes_per_sqm: number; working_hours_start: string; working_hours_end: string }>()

  if (!eq) return c.json({ success: false, error: '장비를 찾을 수 없습니다.' }, 404)

  const avgRate = eq.avg_print_minutes_per_sqm || 2 // 기본 2분/㎡

  // 큐의 카드 목록 (우선순위순)
  const { results: cards } = await c.env.DB.prepare(`
    SELECT id, width, height, quantity
    FROM cards
    WHERE equipment_id = ? AND status = 'PRINTING'
    ORDER BY priority DESC, delivery_date ASC, created_at ASC
  `).bind(equipmentId).all<{ id: number; width: number; height: number; quantity: number }>()

  // 예상시간 계산 + 큐 위치
  const now = new Date()
  let accumulatedMinutes = 0
  const stmts: any[] = []

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    const areaSqm = ((card.width || 0) * (card.height || 0)) / 10000 // cm² → ㎡
    const estimatedMin = Math.max(5, areaSqm * avgRate * (card.quantity || 1))

    const startAt = new Date(now.getTime() + accumulatedMinutes * 60000)
    accumulatedMinutes += estimatedMin
    const endAt = new Date(now.getTime() + accumulatedMinutes * 60000)

    stmts.push(
      c.env.DB.prepare(`
        UPDATE cards SET estimated_minutes = ?, queue_position = ?, estimated_start_at = ?, estimated_end_at = ?
        WHERE id = ?
      `).bind(
        Math.round(estimatedMin * 10) / 10,
        i + 1,
        startAt.toISOString(),
        endAt.toISOString(),
        card.id
      )
    )
  }

  if (stmts.length > 0) {
    await c.env.DB.batch(stmts)
  }

  return c.json({ success: true, data: { updated: stmts.length } })
})

// ─── 큐 순서 변경 (드래그앤드롭) ──────────────────────────────────────────────
equipmentQueue.patch('/:equipmentId/queue/reorder', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const equipmentId = c.req.param('equipmentId')
  const { card_ids } = await c.req.json() // [cardId1, cardId2, ...] 순서대로

  if (!Array.isArray(card_ids)) {
    return c.json({ success: false, error: 'card_ids 배열 필요' }, 400)
  }

  // priority를 순서 기반으로 갱신 (높은 priority = 먼저 인쇄)
  const stmts = card_ids.map((cardId: number, idx: number) =>
    c.env.DB.prepare(
      `UPDATE cards SET priority = ?, queue_position = ? WHERE id = ? AND equipment_id = ?`
    ).bind(card_ids.length - idx, idx + 1, cardId, equipmentId)
  )

  if (stmts.length > 0) {
    await c.env.DB.batch(stmts)
  }

  return c.json({ success: true, data: { reordered: stmts.length } })
})

// ─── 장비 평균 속도 자동 갱신 (print_events 기반) ──────────────────────────────
equipmentQueue.post('/update-avg-speed', requireRole('ADMIN', 'MANAGER'), async (c) => {
  // 최근 30일 print_events 기반으로 장비별 평균 인쇄 속도 계산
  const { results } = await c.env.DB.prepare(`
    SELECT equipment_id,
      SUM(CAST(COALESCE(output_width,'0') AS REAL) * CAST(COALESCE(output_height,'0') AS REAL) / 1000000.0) as total_sqm,
      SUM((julianday(print_completed_at) - julianday(print_started_at)) * 24 * 60) as total_minutes
    FROM print_events
    WHERE print_status = 'COMPLETED'
      AND print_started_at >= date('now', '-30 days')
      AND equipment_id IS NOT NULL
    GROUP BY equipment_id
    HAVING total_sqm > 0
  `).all<{ equipment_id: string; total_sqm: number; total_minutes: number }>()

  const stmts = results
    .filter(r => r.total_sqm > 0 && r.total_minutes > 0)
    .map(r => {
      const avgRate = r.total_minutes / r.total_sqm
      return c.env.DB.prepare(
        `UPDATE equipment SET avg_print_minutes_per_sqm = ? WHERE id = ?`
      ).bind(Math.round(avgRate * 100) / 100, r.equipment_id)
    })

  if (stmts.length > 0) {
    await c.env.DB.batch(stmts)
  }

  return c.json({ success: true, data: { updated: stmts.length } })
})

export default equipmentQueue
