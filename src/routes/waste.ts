import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter } from '../utils/entityFilter'

const waste = new Hono<HonoEnv>()
waste.use('*', authMiddleware)

// ─── 폐기/로스 기록 목록 ─────────────────────────────────────────────────────
waste.get('/', async (c) => {
  const from = c.req.query('from')
  const to = c.req.query('to')
  const equipmentId = c.req.query('equipment_id')
  const eFilter = entityFilter(c)

  let where = `WHERE 1=1 ${eFilter.clause}`
  const binds: any[] = [...eFilter.params]
  if (from) { where += ' AND w.waste_date >= ?'; binds.push(from) }
  if (to) { where += ' AND w.waste_date <= ?'; binds.push(to) }
  if (equipmentId) { where += ' AND w.equipment_id = ?'; binds.push(equipmentId) }

  const { results } = await c.env.DB.prepare(`
    SELECT w.*, e.name as equipment_name, c.card_number, i.item_name as material_name
    FROM waste_records w
    LEFT JOIN equipment e ON w.equipment_id = e.id
    LEFT JOIN cards c ON w.card_id = c.id
    LEFT JOIN items i ON w.material_item_id = i.id
    ${where}
    ORDER BY w.waste_date DESC, w.created_at DESC
    LIMIT 200
  `).bind(...binds).all()

  return c.json({ success: true, data: results })
})

// ─── 폐기/로스 기록 생성 ─────────────────────────────────────────────────────
waste.post('/', async (c) => {
  const body = await c.req.json()
  const userId = c.get('user')?.id
  const { card_id, equipment_id, waste_date, waste_type, waste_reason, quantity, unit, estimated_cost, material_item_id, notes } = body

  if (!waste_date || !waste_type || !waste_reason || !quantity) {
    return c.json({ success: false, error: 'waste_date, waste_type, waste_reason, quantity 필수' }, 400)
  }

  const insertStmt = c.env.DB.prepare(`
    INSERT INTO waste_records (card_id, equipment_id, waste_date, waste_type, waste_reason, quantity, unit, estimated_cost, material_item_id, notes, recorded_by, entity_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    card_id || null, equipment_id || null, waste_date,
    waste_type, waste_reason, quantity, unit || 'SQM',
    estimated_cost || 0, material_item_id || null, notes || null,
    userId, getEntityId(c)
  )

  const stmts: ReturnType<typeof c.env.DB.prepare>[] = [insertStmt]
  if (card_id && (unit === 'SQM' || !unit)) {
    stmts.push(c.env.DB.prepare(`
      UPDATE cards SET waste_sqm = COALESCE(waste_sqm, 0) + ?, waste_reason = ? WHERE id = ?
    `).bind(quantity, waste_reason, card_id))
  }

  const [insertResult] = await c.env.DB.batch(stmts)
  return c.json({ success: true, data: { id: insertResult.meta.last_row_id } })
})

// ─── 로스 분석 (원인별/장비별/기간별) ─────────────────────────────────────────
waste.get('/analytics', async (c) => {
  const eFilter = entityFilter(c)

  // 원인별 파레토
  const { results: byReason } = await c.env.DB.prepare(`
    SELECT waste_reason, COUNT(*) as cnt, ROUND(SUM(quantity), 2) as total_qty, ROUND(SUM(estimated_cost), 0) as total_cost
    FROM waste_records w WHERE waste_date >= date('now', '-90 days') ${eFilter.clause}
    GROUP BY waste_reason ORDER BY total_qty DESC
  `).bind(...eFilter.params).all()

  // 장비별
  const { results: byEquipment } = await c.env.DB.prepare(`
    SELECT w.equipment_id, e.name as equipment_name, ROUND(SUM(w.quantity), 2) as total_qty, ROUND(SUM(w.estimated_cost), 0) as total_cost
    FROM waste_records w
    LEFT JOIN equipment e ON w.equipment_id = e.id
    WHERE w.waste_date >= date('now', '-90 days') AND w.equipment_id IS NOT NULL ${eFilter.clause}
    GROUP BY w.equipment_id ORDER BY total_qty DESC
  `).bind(...eFilter.params).all()

  // 월별 추이
  const { results: monthly } = await c.env.DB.prepare(`
    SELECT strftime('%Y-%m', waste_date) as month, ROUND(SUM(quantity), 2) as total_qty, ROUND(SUM(estimated_cost), 0) as total_cost
    FROM waste_records w WHERE waste_date >= date('now', '-6 months') ${eFilter.clause}
    GROUP BY month ORDER BY month
  `).bind(...eFilter.params).all()

  // 로스율 (최근 30일): waste / (output + waste)
  const outputRow = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(CAST(COALESCE(output_width,'0') AS REAL) * CAST(COALESCE(output_height,'0') AS REAL) / 1000000.0), 0) as output_sqm
    FROM print_events WHERE print_status = 'COMPLETED' AND print_started_at >= date('now', '-30 days')
  `).first<{ output_sqm: number }>()
  const wasteRow = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as waste_sqm
    FROM waste_records w WHERE unit = 'SQM' AND waste_date >= date('now', '-30 days') ${eFilter.clause}
  `).bind(...eFilter.params).first<{ waste_sqm: number }>()

  const output = outputRow?.output_sqm || 0
  const wasteTotal = wasteRow?.waste_sqm || 0
  const lossRate = (output + wasteTotal) > 0 ? Math.round((wasteTotal / (output + wasteTotal)) * 1000) / 10 : 0

  return c.json({ success: true, data: { byReason, byEquipment, monthly, lossRate, output_sqm_30d: output, waste_sqm_30d: wasteTotal } })
})

export default waste
