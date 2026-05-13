import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { requireAnyPagePermission } from '../middleware/permissions'
import type { HonoEnv } from '../types/env'
import { getEntityId } from '../utils/entityFilter'

const productionRouter = new Hono<HonoEnv>()

// Apply authentication middleware
productionRouter.use('/*', authMiddleware, requireAnyPagePermission('/production', '/schedule', '/production-daily'))

// Get production logs list
productionRouter.get('/logs', async (c) => {
  try {
    const { start_date, end_date, shift, limit = '30' } = c.req.query()

    let query = `
      SELECT 
        pl.*,
        e.name as supervisor_name,
        u.username as created_by_name
      FROM production_logs pl
      LEFT JOIN employees e ON pl.supervisor_id = e.id
      LEFT JOIN users u ON pl.created_by = u.id
      WHERE 1=1
    `
    const params: any[] = []

    if (start_date) {
      query += ` AND pl.log_date >= ?`
      params.push(start_date)
    }

    if (end_date) {
      query += ` AND pl.log_date <= ?`
      params.push(end_date)
    }

    if (shift) {
      query += ` AND pl.shift = ?`
      params.push(shift)
    }

    query += ` ORDER BY pl.log_date DESC, pl.shift LIMIT ?`
    params.push(Number(limit))

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    return c.json({ success: true, data: { logs: results } })
  } catch (error) {
    console.error('Failed to get production logs:', error)
    console.error('Production error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get production log by ID with details
productionRouter.get('/logs/:id', async (c) => {
  try {
    const id = c.req.param('id')

    // Get log details
    const { results: logResults } = await c.env.DB.prepare(`
      SELECT 
        pl.*,
        e.name as supervisor_name
      FROM production_logs pl
      LEFT JOIN employees e ON pl.supervisor_id = e.id
      WHERE pl.id = ?
    `).bind(id).all()

    if (logResults.length === 0) {
      return c.json({ success: false, error: 'Production log not found' }, 404)
    }

    // Get work records for this log
    const { results: workRecords } = await c.env.DB.prepare(`
      SELECT 
        wr.*,
        e.name as employee_name,
        c.card_number,
        c.item_name
      FROM work_records wr
      LEFT JOIN employees e ON wr.employee_id = e.id
      LEFT JOIN cards c ON wr.card_id = c.id
      WHERE wr.production_log_id = ?
      ORDER BY wr.start_time
    `).bind(id).all()

    // Get quality issues for this log
    const { results: qualityIssues } = await c.env.DB.prepare(`
      SELECT 
        qi.*,
        c.card_number,
        e1.name as reported_by_name,
        e2.name as resolved_by_name
      FROM quality_issues qi
      LEFT JOIN cards c ON qi.card_id = c.id
      LEFT JOIN employees e1 ON qi.reported_by = e1.id
      LEFT JOIN employees e2 ON qi.resolved_by = e2.id
      LEFT JOIN work_records wr ON qi.work_record_id = wr.id
      WHERE wr.production_log_id = ?
      ORDER BY qi.reported_at DESC
    `).bind(id).all()

    return c.json({
      success: true,
      data: {
        log: logResults[0],
        work_records: workRecords,
        quality_issues: qualityIssues
      }
    })
  } catch (error) {
    console.error('Failed to get production log:', error)
    console.error('Production error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Create production log
productionRouter.post('/logs', async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json()
    const { log_date, shift = 'DAY', weather, temperature, humidity, supervisor_id, notes } = body

    const result = await c.env.DB.prepare(`
      INSERT INTO production_logs (log_date, shift, weather, temperature, humidity, supervisor_id, notes, created_by, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(log_date, shift, weather, temperature, humidity, supervisor_id, notes, user.id, getEntityId(c) || 1).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error) {
    console.error('Failed to create production log:', error)
    console.error('Production error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get work records
productionRouter.get('/work-records', async (c) => {
  try {
    const { log_id, card_id, employee_id, status, limit = '50' } = c.req.query()

    let query = `
      SELECT 
        wr.*,
        e.name as employee_name,
        e.employee_code,
        c.card_number,
        c.item_name,
        pl.log_date
      FROM work_records wr
      LEFT JOIN employees e ON wr.employee_id = e.id
      LEFT JOIN cards c ON wr.card_id = c.id
      LEFT JOIN production_logs pl ON wr.production_log_id = pl.id
      WHERE 1=1
    `
    const params: any[] = []

    if (log_id) {
      query += ` AND wr.production_log_id = ?`
      params.push(log_id)
    }

    if (card_id) {
      query += ` AND wr.card_id = ?`
      params.push(card_id)
    }

    if (employee_id) {
      query += ` AND wr.employee_id = ?`
      params.push(employee_id)
    }

    if (status) {
      query += ` AND wr.status = ?`
      params.push(status)
    }

    query += ` ORDER BY wr.start_time DESC LIMIT ?`
    params.push(Number(limit))

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    return c.json({ success: true, data: { work_records: results } })
  } catch (error) {
    console.error('Failed to get work records:', error)
    console.error('Production error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Create work record
productionRouter.post('/work-records', async (c) => {
  try {
    const body = await c.req.json()
    const {
      production_log_id,
      card_id,
      employee_id,
      work_type,
      start_time,
      end_time,
      quantity_completed,
      quantity_target,
      status = 'IN_PROGRESS',
      notes
    } = body

    // Calculate work hours if both times provided
    let work_hours = null
    if (start_time && end_time) {
      const start = new Date(start_time)
      const end = new Date(end_time)
      work_hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO work_records (
        production_log_id, card_id, employee_id, work_type,
        start_time, end_time, work_hours,
        quantity_completed, quantity_target, status, notes, entity_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      production_log_id, card_id, employee_id, work_type,
      start_time, end_time, work_hours,
      quantity_completed, quantity_target, status, notes, getEntityId(c) || 1
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error) {
    console.error('Failed to create work record:', error)
    console.error('Production error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Update work record (complete/pause)
productionRouter.patch('/work-records/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { end_time, quantity_completed, status, notes } = body

    // Get current record
    const { results } = await c.env.DB.prepare(`
      SELECT id, production_log_id, card_id, employee_id, work_type, start_time, end_time, work_hours, quantity_completed, quantity_target, status, notes FROM work_records WHERE id = ?
    `).bind(id).all()

    if (results.length === 0) {
      return c.json({ success: false, error: 'Work record not found' }, 404)
    }

    const record = results[0] as Record<string, unknown>

    // Calculate work hours
    let work_hours = record.work_hours as number | null
    if (end_time && record.start_time) {
      const start = new Date(record.start_time as string)
      const end = new Date(end_time)
      work_hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
    }

    await c.env.DB.prepare(`
      UPDATE work_records
      SET end_time = ?, work_hours = ?, quantity_completed = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(end_time, work_hours, quantity_completed, status, notes, id).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('Failed to update work record:', error)
    console.error('Production error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get quality issues
productionRouter.get('/quality-issues', async (c) => {
  try {
    const { card_id, issue_type, status, start_date, end_date, limit = '50' } = c.req.query()

    let query = `
      SELECT 
        qi.*,
        c.card_number,
        c.item_name,
        e1.name as reported_by_name,
        e2.name as resolved_by_name
      FROM quality_issues qi
      LEFT JOIN cards c ON qi.card_id = c.id
      LEFT JOIN employees e1 ON qi.reported_by = e1.id
      LEFT JOIN employees e2 ON qi.resolved_by = e2.id
      WHERE 1=1
    `
    const params: any[] = []

    if (card_id) {
      query += ` AND qi.card_id = ?`
      params.push(card_id)
    }

    if (issue_type) {
      query += ` AND qi.issue_type = ?`
      params.push(issue_type)
    }

    if (status) {
      query += ` AND qi.status = ?`
      params.push(status)
    }

    if (start_date) {
      query += ` AND DATE(qi.reported_at) >= ?`
      params.push(start_date)
    }

    if (end_date) {
      query += ` AND DATE(qi.reported_at) <= ?`
      params.push(end_date)
    }

    query += ` ORDER BY qi.reported_at DESC LIMIT ?`
    params.push(Number(limit))

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    return c.json({ success: true, data: { quality_issues: results } })
  } catch (error) {
    console.error('Failed to get quality issues:', error)
    console.error('Production error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Create quality issue
productionRouter.post('/quality-issues', async (c) => {
  try {
    const body = await c.req.json()
    const {
      work_record_id,
      card_id,
      issue_type,
      defect_category,
      quantity_defect,
      description,
      root_cause,
      corrective_action,
      reported_by,
      cost_impact = 0
    } = body

    const result = await c.env.DB.prepare(`
      INSERT INTO quality_issues (
        work_record_id, card_id, issue_type, defect_category,
        quantity_defect, description, root_cause, corrective_action,
        reported_by, cost_impact, entity_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      work_record_id, card_id, issue_type, defect_category,
      quantity_defect, description, root_cause, corrective_action,
      reported_by, cost_impact, getEntityId(c) || 1
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error) {
    console.error('Failed to create quality issue:', error)
    console.error('Production error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Update quality issue (resolve)
productionRouter.patch('/quality-issues/:id', async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const body = await c.req.json()
    const { status, corrective_action, resolved_at } = body

    // Get associated employee_id for the user
    const { results: empResults } = await c.env.DB.prepare(`
      SELECT id FROM employees WHERE user_id = ? LIMIT 1
    `).bind(user.id).all()

    const resolved_by = empResults.length > 0 ? (empResults[0] as Record<string, unknown>).id : null

    await c.env.DB.prepare(`
      UPDATE quality_issues
      SET status = ?, corrective_action = ?, resolved_by = ?, resolved_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(status, corrective_action, resolved_by, resolved_at || new Date().toISOString(), id).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('Failed to update quality issue:', error)
    console.error('Production error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get production statistics
productionRouter.get('/stats', async (c) => {
  try {
    const { start_date, end_date } = c.req.query()

    // Default to last 7 days if no dates provided
    const startDate = start_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = end_date || new Date().toISOString().split('T')[0]

    // Total work hours
    const { results: hoursResults } = await c.env.DB.prepare(`
      SELECT SUM(work_hours) as total_hours
      FROM work_records wr
      JOIN production_logs pl ON wr.production_log_id = pl.id
      WHERE pl.log_date BETWEEN ? AND ?
    `).bind(startDate, endDate).all()

    // Total quantity completed
    const { results: quantityResults } = await c.env.DB.prepare(`
      SELECT SUM(quantity_completed) as total_quantity
      FROM work_records wr
      JOIN production_logs pl ON wr.production_log_id = pl.id
      WHERE pl.log_date BETWEEN ? AND ?
    `).bind(startDate, endDate).all()

    // Total defects
    const { results: defectsResults } = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_issues,
        SUM(quantity_defect) as total_defects,
        SUM(cost_impact) as total_cost_impact
      FROM quality_issues
      WHERE DATE(reported_at) BETWEEN ? AND ?
    `).bind(startDate, endDate).all()

    // Cards processed
    const { results: cardsResults } = await c.env.DB.prepare(`
      SELECT COUNT(DISTINCT card_id) as cards_processed
      FROM work_records wr
      JOIN production_logs pl ON wr.production_log_id = pl.id
      WHERE pl.log_date BETWEEN ? AND ?
    `).bind(startDate, endDate).all()

    // Work type distribution
    const { results: workTypeResults } = await c.env.DB.prepare(`
      SELECT 
        work_type,
        COUNT(*) as count,
        SUM(work_hours) as total_hours
      FROM work_records wr
      JOIN production_logs pl ON wr.production_log_id = pl.id
      WHERE pl.log_date BETWEEN ? AND ?
      GROUP BY work_type
    `).bind(startDate, endDate).all()

    // Defect by category
    const { results: defectCategoryResults } = await c.env.DB.prepare(`
      SELECT 
        defect_category,
        COUNT(*) as count,
        SUM(quantity_defect) as total_quantity
      FROM quality_issues
      WHERE DATE(reported_at) BETWEEN ? AND ?
      AND defect_category IS NOT NULL
      GROUP BY defect_category
    `).bind(startDate, endDate).all()

    const totalHours = Number((hoursResults[0] as Record<string, unknown>)?.total_hours) || 0
    const totalQuantity = Number((quantityResults[0] as Record<string, unknown>)?.total_quantity) || 0
    const totalDefects = Number((defectsResults[0] as Record<string, unknown>)?.total_defects) || 0
    const defectRate = totalQuantity > 0 ? (totalDefects / totalQuantity * 100).toFixed(2) : 0

    return c.json({
      success: true,
      data: {
        total_work_hours: totalHours,
        total_quantity_completed: totalQuantity,
        total_defects: totalDefects,
        total_issues: Number((defectsResults[0] as Record<string, unknown>)?.total_issues) || 0,
        total_cost_impact: Number((defectsResults[0] as Record<string, unknown>)?.total_cost_impact) || 0,
        defect_rate: Number(defectRate),
        cards_processed: Number((cardsResults[0] as Record<string, unknown>)?.cards_processed) || 0,
        work_type_distribution: workTypeResults,
        defect_by_category: defectCategoryResults,
        period: { start_date: startDate, end_date: endDate }
      }
    })
  } catch (error) {
    console.error('Failed to get production stats:', error)
    console.error('Production error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default productionRouter
