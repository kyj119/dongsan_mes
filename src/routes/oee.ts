import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const oee = new Hono<HonoEnv>()
oee.use('*', authMiddleware)

// ─── OEE 계산 (일자별 장비 전체) ──────────────────────────────────────────────
oee.post('/calculate', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { date } = await c.req.json()
    const targetDate = date || new Date().toISOString().split('T')[0]

    // 활성 장비 목록
    const { results: equipments } = await c.env.DB.prepare(
      `SELECT id, daily_capacity FROM equipment WHERE status = 'ACTIVE'`
    ).all<{ id: string; daily_capacity: number }>()

    const plannedHours = 8 // 기본 8시간/일

    const statements: any[] = []

    for (const eq of equipments) {
      // 1. 가동시간: print_events에서 실제 인쇄 시간 합계
      const runTime = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(
          CASE WHEN print_completed_at IS NOT NULL AND print_started_at IS NOT NULL
          THEN (julianday(print_completed_at) - julianday(print_started_at)) * 24
          ELSE 0 END
        ), 0) as run_hours,
        COUNT(CASE WHEN print_status = 'COMPLETED' THEN 1 END) as completed_count
        FROM print_events
        WHERE equipment_id = ? AND DATE(print_started_at) = ?
      `).bind(eq.id, targetDate).first<{ run_hours: number; completed_count: number }>()

      // 2. 다운타임: maintenance_logs
      const downtime = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(downtime_minutes), 0) as total_min,
          COALESCE(SUM(CASE WHEN log_type = 'MAINTENANCE' THEN downtime_minutes ELSE 0 END), 0) as planned_min,
          COALESCE(SUM(CASE WHEN log_type != 'MAINTENANCE' THEN downtime_minutes ELSE 0 END), 0) as unplanned_min
        FROM maintenance_logs
        WHERE equipment_id = ? AND DATE(performed_at) = ?
      `).bind(eq.id, targetDate).first<{ total_min: number; planned_min: number; unplanned_min: number }>()

      // 3. 실제 산출량 (sqm): print_events의 output dimensions
      const output = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(
          CAST(COALESCE(output_width, '0') AS REAL) * CAST(COALESCE(output_height, '0') AS REAL) / 1000000.0
        ), 0) as actual_sqm
        FROM print_events
        WHERE equipment_id = ? AND DATE(print_started_at) = ? AND print_status = 'COMPLETED'
      `).bind(eq.id, targetDate).first<{ actual_sqm: number }>()

      // 4. 불량: quality_issues (해당 장비, 해당 날짜)
      const defects = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(qi.quantity_defect), 0) as defect_count
        FROM quality_issues qi
        JOIN cards c ON qi.card_id = c.id
        WHERE c.equipment_id = ? AND DATE(qi.created_at) = ?
      `).bind(eq.id, targetDate).first<{ defect_count: number }>()

      // 계산
      const actualRunHours = runTime?.run_hours || 0
      const downtimePlanned = downtime?.planned_min || 0
      const downtimeUnplanned = downtime?.unplanned_min || 0
      const totalDowntimeHours = (downtimePlanned + downtimeUnplanned) / 60
      const availableHours = plannedHours - (downtimePlanned / 60)

      // Availability = (available - unplanned downtime) / available
      const availability = availableHours > 0
        ? Math.min(100, ((availableHours - (downtimeUnplanned / 60)) / availableHours) * 100)
        : 0

      // Performance = actual run / (available - unplanned)
      const netAvailable = availableHours - (downtimeUnplanned / 60)
      const performance = netAvailable > 0
        ? Math.min(100, (actualRunHours / netAvailable) * 100)
        : 0

      // Quality = (total - defects) / total
      const totalProduced = runTime?.completed_count || 0
      const defectCount = defects?.defect_count || 0
      const goodProduced = Math.max(0, totalProduced - defectCount)
      const quality = totalProduced > 0
        ? (goodProduced / totalProduced) * 100
        : 100

      // OEE
      const oeeValue = (availability * performance * quality) / 10000

      // 이론 산출량 (planned_hours * 평균 속도 기반, 단순화)
      const actualSqm = output?.actual_sqm || 0
      const theoreticalSqm = netAvailable > 0 && actualRunHours > 0
        ? actualSqm * (netAvailable / actualRunHours)
        : 0

      statements.push(
        c.env.DB.prepare(`
          INSERT INTO equipment_oee_daily (
            equipment_id, oee_date, planned_hours, actual_run_hours,
            downtime_planned_min, downtime_unplanned_min, availability_pct,
            theoretical_output_sqm, actual_output_sqm, performance_pct,
            total_produced, good_produced, defect_count, quality_pct, oee_pct
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(equipment_id, oee_date) DO UPDATE SET
            planned_hours=excluded.planned_hours, actual_run_hours=excluded.actual_run_hours,
            downtime_planned_min=excluded.downtime_planned_min, downtime_unplanned_min=excluded.downtime_unplanned_min,
            availability_pct=excluded.availability_pct, theoretical_output_sqm=excluded.theoretical_output_sqm,
            actual_output_sqm=excluded.actual_output_sqm, performance_pct=excluded.performance_pct,
            total_produced=excluded.total_produced, good_produced=excluded.good_produced,
            defect_count=excluded.defect_count, quality_pct=excluded.quality_pct, oee_pct=excluded.oee_pct
        `).bind(
          eq.id, targetDate, plannedHours, Math.round(actualRunHours * 100) / 100,
          downtimePlanned, downtimeUnplanned, Math.round(availability * 10) / 10,
          Math.round(theoreticalSqm * 100) / 100, Math.round(actualSqm * 100) / 100,
          Math.round(performance * 10) / 10,
          totalProduced, goodProduced, defectCount,
          Math.round(quality * 10) / 10, Math.round(oeeValue * 10) / 10
        )
      )
    }

    if (statements.length > 0) {
      await c.env.DB.batch(statements)
    }

    return c.json({ success: true, data: { date: targetDate, equipmentCount: equipments.length } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ─── OEE 일별 조회 ──────────────────────────────────────────────────────────
oee.get('/daily', async (c) => {
  const date = c.req.query('date') || new Date().toISOString().split('T')[0]

  const { results } = await c.env.DB.prepare(`
    SELECT o.*, e.name as equipment_name
    FROM equipment_oee_daily o
    LEFT JOIN equipment e ON o.equipment_id = e.id
    WHERE o.oee_date = ?
    ORDER BY o.oee_pct DESC
  `).bind(date).all()

  return c.json({ success: true, data: results })
})

// ─── OEE 추이 (기간별) ──────────────────────────────────────────────────────
oee.get('/trend', async (c) => {
  const from = c.req.query('from') || (() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]
  })()
  const to = c.req.query('to') || new Date().toISOString().split('T')[0]
  const equipmentId = c.req.query('equipment_id')

  let sql = `
    SELECT oee_date, equipment_id, availability_pct, performance_pct, quality_pct, oee_pct,
           actual_output_sqm, defect_count, total_produced
    FROM equipment_oee_daily
    WHERE oee_date BETWEEN ? AND ?
  `
  const binds: any[] = [from, to]

  if (equipmentId) {
    sql += ' AND equipment_id = ?'
    binds.push(equipmentId)
  }
  sql += ' ORDER BY oee_date ASC, equipment_id'

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ success: true, data: results })
})

// ─── 장비별 OEE 요약 (최근 7일 평균) ──────────────────────────────────────────
oee.get('/summary', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT equipment_id,
      e.name as equipment_name,
      ROUND(AVG(availability_pct), 1) as avg_availability,
      ROUND(AVG(performance_pct), 1) as avg_performance,
      ROUND(AVG(quality_pct), 1) as avg_quality,
      ROUND(AVG(oee_pct), 1) as avg_oee,
      ROUND(SUM(actual_output_sqm), 1) as total_output_sqm,
      SUM(defect_count) as total_defects,
      COUNT(*) as days_recorded
    FROM equipment_oee_daily o
    LEFT JOIN equipment e ON o.equipment_id = e.id
    WHERE oee_date >= DATE('now', '-7 days')
    GROUP BY equipment_id
    ORDER BY avg_oee DESC
  `).all()

  return c.json({ success: true, data: results })
})

export default oee
