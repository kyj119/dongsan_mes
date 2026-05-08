import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const productionReportsRouter = new Hono<HonoEnv>()

productionReportsRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER', 'OPERATOR'))

// ─── 일일 생산 요약 ───────────────────────────────────────────────────────

productionReportsRouter.get('/daily-summary', async (c) => {
  try {
    const { date } = c.req.query()
    const targetDate = date || new Date().toISOString().substring(0, 10)

    // 기본 통계
    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(CASE WHEN print_status = 'OK' THEN 1 END) as ok_count,
        COUNT(CASE WHEN print_status = 'ERROR' THEN 1 END) as error_count,
        COUNT(CASE WHEN print_status = 'CANCEL' THEN 1 END) as cancel_count,
        COUNT(*) as total_count,
        COALESCE(SUM(CASE WHEN print_status = 'OK' THEN CAST(output_width AS REAL) * CAST(output_height AS REAL) / 1000000 END), 0) as total_sqm,
        AVG(CASE WHEN print_status = 'OK' AND print_duration_sec > 0 THEN print_duration_sec END) as avg_duration
      FROM print_events
      WHERE date(print_completed_at) = ?
    `).bind(targetDate).first() as any

    // 장비별 통계
    const { results: byEquipment } = await c.env.DB.prepare(`
      SELECT
        COALESCE(e.name, pe.agent_id) as equipment_name,
        COUNT(CASE WHEN pe.print_status = 'OK' THEN 1 END) as ok_count,
        COUNT(CASE WHEN pe.print_status != 'OK' THEN 1 END) as error_count,
        COUNT(*) as total
      FROM print_events pe
      LEFT JOIN equipment e ON pe.equipment_id = e.id
      WHERE date(pe.print_completed_at) = ?
      GROUP BY COALESCE(e.name, pe.agent_id)
      ORDER BY ok_count DESC
    `).bind(targetDate).all()

    // 시간대별 통계
    const { results: byHour } = await c.env.DB.prepare(`
      SELECT
        CAST(strftime('%H', print_completed_at) AS INTEGER) as hour,
        COUNT(CASE WHEN print_status = 'OK' THEN 1 END) as ok_count,
        COUNT(CASE WHEN print_status != 'OK' THEN 1 END) as error_count
      FROM print_events
      WHERE date(print_completed_at) = ?
      GROUP BY hour
      ORDER BY hour
    `).bind(targetDate).all()

    // 납기 초과 주문
    const { results: overdue } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.delivery_date, c.client_name, o.status
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.delivery_date < ? AND o.status IN ('CONFIRMED', 'PRINTING')
      ORDER BY o.delivery_date ASC
      LIMIT 20
    `).bind(targetDate).all()

    const okCount = stats?.ok_count || 0
    const totalCount = stats?.total_count || 0
    const completionRate = totalCount > 0 ? Math.round((okCount / totalCount) * 100) : 0

    return c.json({
      success: true,
      data: {
        ok_count: okCount,
        error_count: stats?.error_count || 0,
        cancel_count: stats?.cancel_count || 0,
        total_count: totalCount,
        total_sqm: stats?.total_sqm || 0,
        avg_duration: Math.round(stats?.avg_duration || 0),
        completion_rate: completionRate,
        by_equipment: byEquipment,
        by_hour: byHour,
        overdue
      }
    })
  } catch (error) {
    console.error('daily-summary error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ─── 장비별 생산 실적 ───────────────────────────────────────────────────────

productionReportsRouter.get('/production', async (c) => {
  try {
    const { from, to } = c.req.query()
    const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10)
    const dateTo = to || new Date().toISOString().substring(0, 10)

    // 장비별 집계
    const { results: byEquipment } = await c.env.DB.prepare(`
      SELECT
        pe.equipment_id,
        COALESCE(e.name, pe.equipment_id) as equipment_name,
        e.location_zone,
        COUNT(*) as total_prints,
        COUNT(CASE WHEN pe.print_status = 'OK' THEN 1 END) as ok_count,
        COUNT(CASE WHEN pe.print_status = 'ERROR' THEN 1 END) as error_count,
        COUNT(CASE WHEN pe.print_status = 'CANCEL' THEN 1 END) as cancel_count,
        COUNT(DISTINCT pe.card_number) as card_count,
        COUNT(DISTINCT date(pe.print_completed_at)) as active_days
      FROM print_events pe
      LEFT JOIN equipment e ON pe.equipment_id = e.id
      WHERE pe.equipment_id IS NOT NULL
        AND date(pe.print_completed_at) >= ? AND date(pe.print_completed_at) <= ?
      GROUP BY pe.equipment_id
      ORDER BY ok_count DESC
    `).bind(dateFrom, dateTo).all()

    // 일별 추이
    const { results: daily } = await c.env.DB.prepare(`
      SELECT
        date(print_completed_at) as date,
        COUNT(*) as total_prints,
        COUNT(CASE WHEN print_status = 'OK' THEN 1 END) as ok_count,
        COUNT(DISTINCT card_number) as card_count
      FROM print_events
      WHERE equipment_id IS NOT NULL
        AND date(print_completed_at) >= ? AND date(print_completed_at) <= ?
      GROUP BY date(print_completed_at)
      ORDER BY date ASC
    `).bind(dateFrom, dateTo).all()

    // 구역별 집계
    const { results: byZone } = await c.env.DB.prepare(`
      SELECT
        COALESCE(e.location_zone, '미지정') as zone,
        COUNT(*) as total_prints,
        COUNT(CASE WHEN pe.print_status = 'OK' THEN 1 END) as ok_count,
        COUNT(DISTINCT pe.card_number) as card_count
      FROM print_events pe
      LEFT JOIN equipment e ON pe.equipment_id = e.id
      WHERE pe.equipment_id IS NOT NULL
        AND date(pe.print_completed_at) >= ? AND date(pe.print_completed_at) <= ?
      GROUP BY COALESCE(e.location_zone, '미지정')
      ORDER BY ok_count DESC
    `).bind(dateFrom, dateTo).all()

    // 총합
    const totals = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_prints,
        COUNT(CASE WHEN print_status = 'OK' THEN 1 END) as ok_count,
        COUNT(CASE WHEN print_status = 'ERROR' THEN 1 END) as error_count,
        COUNT(CASE WHEN print_status = 'CANCEL' THEN 1 END) as cancel_count,
        COUNT(DISTINCT card_number) as card_count
      FROM print_events
      WHERE equipment_id IS NOT NULL
        AND date(print_completed_at) >= ? AND date(print_completed_at) <= ?
    `).bind(dateFrom, dateTo).first()

    return c.json({
      success: true,
      data: { by_equipment: byEquipment, by_zone: byZone, daily, totals, date_from: dateFrom, date_to: dateTo }
    })
  } catch (error) {
    console.error('ProductionReports error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── 후가공 처리 통계 ───────────────────────────────────────────────────────

productionReportsRouter.get('/post-processing', async (c) => {
  try {
    const { from, to } = c.req.query()
    const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10)
    const dateTo = to || new Date().toISOString().substring(0, 10)

    // 후가공이 있는 카드 조회
    const { results: ppCards } = await c.env.DB.prepare(`
      SELECT c.post_processing, c.status, c.created_at, c.category_name
      FROM cards c
      WHERE c.post_processing IS NOT NULL AND c.post_processing != '' AND c.post_processing != '[]'
        AND date(c.created_at) >= ? AND date(c.created_at) <= ?
    `).bind(dateFrom, dateTo).all() as any

    // 후가공 유형별 집계
    const ppCounts: Record<string, { total: number, printing: number, done: number }> = {}
    for (const row of (ppCards || [])) {
      try {
        const ppArr = JSON.parse(row.post_processing)
        if (Array.isArray(ppArr)) {
          for (const pp of ppArr) {
            const name = pp.name || pp.code || String(pp)
            if (!ppCounts[name]) ppCounts[name] = { total: 0, printing: 0, done: 0 }
            ppCounts[name].total++
            if (row.status === 'PRINTING') ppCounts[name].printing++
            if (row.status === 'PRINT_DONE') ppCounts[name].done++
          }
        }
      } catch (e) {
        console.error('post_processing JSON 파싱 실패:', String(e))
      }
    }

    // 카테고리별 후가공 분포
    const catPp: Record<string, number> = {}
    for (const row of (ppCards || [])) {
      const cat = row.category_name || '미분류'
      catPp[cat] = (catPp[cat] || 0) + 1
    }

    return c.json({
      success: true,
      data: {
        by_type: Object.entries(ppCounts).map(([name, counts]) => ({ name, ...counts })).sort((a, b) => b.total - a.total),
        by_category: Object.entries(catPp).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
        total_cards_with_pp: ppCards.length,
        date_from: dateFrom,
        date_to: dateTo
      }
    })
  } catch (error) {
    console.error('ProductionReports error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── 장비 가동률 리포트 ─────────────────────────────────────────────────────

productionReportsRouter.get('/uptime', async (c) => {
  try {
    const { months } = c.req.query()
    const monthCount = parseInt(months || '6') || 6

    // 장비별 월간 가동일수
    const { results } = await c.env.DB.prepare(`
      SELECT
        pe.equipment_id,
        COALESCE(e.name, pe.equipment_id) as equipment_name,
        strftime('%Y-%m', pe.print_completed_at) as month,
        COUNT(DISTINCT date(pe.print_completed_at)) as active_days,
        COUNT(*) as print_count
      FROM print_events pe
      LEFT JOIN equipment e ON pe.equipment_id = e.id
      WHERE pe.equipment_id IS NOT NULL
        AND pe.print_status = 'OK'
        AND pe.print_completed_at >= date('now', '-' || ? || ' months')
      GROUP BY pe.equipment_id, strftime('%Y-%m', pe.print_completed_at)
      ORDER BY pe.equipment_id, month
    `).bind(monthCount).all()

    // 장비별 유지보수 비용 (같은 기간)
    const { results: maintCosts } = await c.env.DB.prepare(`
      SELECT
        equipment_id,
        strftime('%Y-%m', performed_at) as month,
        COALESCE(SUM(cost), 0) as total_cost,
        COUNT(*) as log_count
      FROM maintenance_logs
      WHERE performed_at >= date('now', '-' || ? || ' months')
      GROUP BY equipment_id, strftime('%Y-%m', performed_at)
    `).bind(monthCount).all()

    return c.json({
      success: true,
      data: { uptime: results, maintenance_costs: maintCosts }
    })
  } catch (error) {
    console.error('ProductionReports error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── 불량률 분석 (검수 데이터 기반) ─────────────────────────────────────────

productionReportsRouter.get('/defects', async (c) => {
  try {
    const { from, to } = c.req.query()
    const dateFrom = from || new Date(Date.now() - 90 * 86400000).toISOString().substring(0, 10)
    const dateTo = to || new Date().toISOString().substring(0, 10)

    // 출력 에러/취소 비율 (장비별)
    const { results: printDefects } = await c.env.DB.prepare(`
      SELECT
        pe.equipment_id,
        COALESCE(e.name, pe.equipment_id) as equipment_name,
        COUNT(*) as total,
        COUNT(CASE WHEN pe.print_status = 'OK' THEN 1 END) as ok,
        COUNT(CASE WHEN pe.print_status = 'ERROR' THEN 1 END) as errors,
        COUNT(CASE WHEN pe.print_status = 'CANCEL' THEN 1 END) as cancels,
        ROUND(CAST(COUNT(CASE WHEN pe.print_status != 'OK' THEN 1 END) AS REAL) / MAX(COUNT(*), 1) * 100, 1) as defect_rate
      FROM print_events pe
      LEFT JOIN equipment e ON pe.equipment_id = e.id
      WHERE pe.equipment_id IS NOT NULL
        AND date(pe.print_completed_at) >= ? AND date(pe.print_completed_at) <= ?
      GROUP BY pe.equipment_id
      ORDER BY defect_rate DESC
    `).bind(dateFrom, dateTo).all()

    // 월별 불량률 추이
    const { results: monthlyTrend } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', print_completed_at) as month,
        COUNT(*) as total,
        COUNT(CASE WHEN print_status = 'OK' THEN 1 END) as ok,
        COUNT(CASE WHEN print_status != 'OK' THEN 1 END) as defects,
        ROUND(CAST(COUNT(CASE WHEN print_status != 'OK' THEN 1 END) AS REAL) / MAX(COUNT(*), 1) * 100, 1) as defect_rate
      FROM print_events
      WHERE equipment_id IS NOT NULL
        AND date(print_completed_at) >= ? AND date(print_completed_at) <= ?
      GROUP BY strftime('%Y-%m', print_completed_at)
      ORDER BY month ASC
    `).bind(dateFrom, dateTo).all()

    // quality_issues 유형별 통계
    const { results: qiByCategory } = await c.env.DB.prepare(`
      SELECT defect_category, COUNT(*) as count,
        SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN status IN ('OPEN', 'UNDER_REVIEW') THEN 1 ELSE 0 END) as open_count,
        ROUND(SUM(cost_impact), 0) as total_cost_impact
      FROM quality_issues
      WHERE card_id IS NOT NULL AND date(created_at) >= ? AND date(created_at) <= ?
      GROUP BY defect_category ORDER BY count DESC
    `).bind(dateFrom, dateTo).all()

    return c.json({
      success: true,
      data: { by_equipment: printDefects, monthly_trend: monthlyTrend, quality_issues: qiByCategory, date_from: dateFrom, date_to: dateTo }
    })
  } catch (error) {
    console.error('ProductionReports error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── 원자재 소비 분석 ───────────────────────────────────────────────────────

productionReportsRouter.get('/consumption', async (c) => {
  try {
    const { from, to } = c.req.query()
    const dateFrom = from || new Date(Date.now() - 90 * 86400000).toISOString().substring(0, 10)
    const dateTo = to || new Date().toISOString().substring(0, 10)

    // 품목별 출고(소비) 집계
    const { results: consumption } = await c.env.DB.prepare(`
      SELECT
        ii.id as item_id,
        i.item_name,
        i.category,
        i.unit,
        COALESCE(SUM(CASE WHEN it.transaction_type = 'OUT' THEN ABS(it.quantity) ELSE 0 END), 0) as total_consumed,
        COALESCE(SUM(CASE WHEN it.transaction_type = 'IN' THEN it.quantity ELSE 0 END), 0) as total_received,
        ii.quantity as current_stock,
        COALESCE(ii.safe_stock, 0) as safety_stock
      FROM inventory_items ii
      JOIN items i ON ii.item_id = i.id
      LEFT JOIN inventory_transactions it ON it.item_id = ii.id
        AND date(it.transaction_date) >= ? AND date(it.transaction_date) <= ?
      WHERE i.is_active = 1
      GROUP BY ii.id
      HAVING total_consumed > 0 OR total_received > 0
      ORDER BY total_consumed DESC
      LIMIT 30
    `).bind(dateFrom, dateTo).all()

    // 월별 소비 추이 (상위 품목)
    const { results: monthlyConsumption } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', it.transaction_date) as month,
        COUNT(DISTINCT it.item_id) as item_count,
        SUM(CASE WHEN it.transaction_type = 'OUT' THEN ABS(it.quantity) ELSE 0 END) as total_consumed,
        SUM(CASE WHEN it.transaction_type = 'OUT' THEN ABS(it.total_amount) ELSE 0 END) as total_cost
      FROM inventory_transactions it
      WHERE date(it.transaction_date) >= ? AND date(it.transaction_date) <= ?
      GROUP BY strftime('%Y-%m', it.transaction_date)
      ORDER BY month ASC
    `).bind(dateFrom, dateTo).all()

    return c.json({
      success: true,
      data: { consumption, monthly: monthlyConsumption, date_from: dateFrom, date_to: dateTo }
    })
  } catch (error) {
    console.error('ProductionReports error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── 카드 상태별 체류시간 분석 ────────────────────────────────────────────────

productionReportsRouter.get('/card-dwell-time', async (c) => {
  try {
    const { from, to } = c.req.query()
    const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10)
    const dateTo = to || new Date().toISOString().substring(0, 10)

    // card_status_history의 연속된 created_at 차이로 각 상태 체류시간 계산
    const { results } = await c.env.DB.prepare(`
      WITH history_with_next AS (
        SELECT
          csh.card_id,
          csh.to_status,
          csh.created_at as entered_at,
          LEAD(csh.created_at) OVER (PARTITION BY csh.card_id ORDER BY csh.created_at) as exited_at
        FROM card_status_history csh
        JOIN cards c ON csh.card_id = c.id
        WHERE date(csh.created_at) >= ? AND date(csh.created_at) <= ?
      )
      SELECT
        to_status as status,
        COUNT(*) as transition_count,
        ROUND(AVG(
          (julianday(COALESCE(exited_at, datetime('now'))) - julianday(entered_at)) * 24
        ), 1) as avg_hours,
        ROUND(MIN(
          (julianday(COALESCE(exited_at, datetime('now'))) - julianday(entered_at)) * 24
        ), 1) as min_hours,
        ROUND(MAX(
          (julianday(COALESCE(exited_at, datetime('now'))) - julianday(entered_at)) * 24
        ), 1) as max_hours
      FROM history_with_next
      WHERE to_status IN ('PRINT_PENDING', 'PRINTING', 'PRINT_DONE', 'HOLD')
      GROUP BY to_status
      ORDER BY avg_hours DESC
    `).bind(dateFrom, dateTo).all()

    // 카테고리별 체류시간
    const { results: byCategory } = await c.env.DB.prepare(`
      WITH history_with_next AS (
        SELECT
          csh.card_id,
          csh.to_status,
          csh.created_at as entered_at,
          LEAD(csh.created_at) OVER (PARTITION BY csh.card_id ORDER BY csh.created_at) as exited_at,
          c.category_name
        FROM card_status_history csh
        JOIN cards c ON csh.card_id = c.id
        WHERE date(csh.created_at) >= ? AND date(csh.created_at) <= ?
      )
      SELECT
        COALESCE(category_name, '미분류') as category,
        to_status as status,
        COUNT(*) as count,
        ROUND(AVG(
          (julianday(COALESCE(exited_at, datetime('now'))) - julianday(entered_at)) * 24
        ), 1) as avg_hours
      FROM history_with_next
      WHERE to_status IN ('PRINT_PENDING', 'PRINTING', 'PRINT_DONE')
      GROUP BY category_name, to_status
      ORDER BY category, avg_hours DESC
    `).bind(dateFrom, dateTo).all()

    return c.json({
      success: true,
      data: { by_status: results, by_category: byCategory, date_from: dateFrom, date_to: dateTo }
    })
  } catch (error) {
    console.error('ProductionReports error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── 인쇄 소요시간 분석 (print_duration_sec 활용) ────────────────────────────

productionReportsRouter.get('/print-duration', async (c) => {
  try {
    const { from, to } = c.req.query()
    const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10)
    const dateTo = to || new Date().toISOString().substring(0, 10)

    // 장비별 평균 인쇄시간
    const { results: byEquipment } = await c.env.DB.prepare(`
      SELECT
        pe.equipment_id,
        COALESCE(e.name, pe.equipment_id) as equipment_name,
        COUNT(*) as print_count,
        ROUND(AVG(pe.print_duration_sec), 0) as avg_sec,
        ROUND(MIN(pe.print_duration_sec), 0) as min_sec,
        ROUND(MAX(pe.print_duration_sec), 0) as max_sec,
        ROUND(SUM(pe.print_duration_sec) / 3600.0, 1) as total_hours
      FROM print_events pe
      LEFT JOIN equipment e ON pe.equipment_id = e.id
      WHERE pe.print_status = 'OK' AND pe.print_duration_sec IS NOT NULL AND pe.print_duration_sec > 0
        AND date(pe.print_completed_at) >= ? AND date(pe.print_completed_at) <= ?
      GROUP BY pe.equipment_id
      ORDER BY avg_sec DESC
    `).bind(dateFrom, dateTo).all()

    // 일별 평균 인쇄시간 추이
    const { results: daily } = await c.env.DB.prepare(`
      SELECT
        date(print_completed_at) as date,
        COUNT(*) as print_count,
        ROUND(AVG(print_duration_sec), 0) as avg_sec,
        ROUND(SUM(print_duration_sec) / 3600.0, 1) as total_hours
      FROM print_events
      WHERE print_status = 'OK' AND print_duration_sec IS NOT NULL AND print_duration_sec > 0
        AND date(print_completed_at) >= ? AND date(print_completed_at) <= ?
      GROUP BY date(print_completed_at)
      ORDER BY date ASC
    `).bind(dateFrom, dateTo).all()

    // 프린터별 규격 대비 인쇄시간 (면적 구간별)
    const { results: byPrinterSize } = await c.env.DB.prepare(`
      SELECT
        printer_name,
        CASE
          WHEN CAST(output_width AS REAL) * CAST(output_height AS REAL) / 1000000 < 1 THEN '~1㎡'
          WHEN CAST(output_width AS REAL) * CAST(output_height AS REAL) / 1000000 < 3 THEN '1~3㎡'
          WHEN CAST(output_width AS REAL) * CAST(output_height AS REAL) / 1000000 < 5 THEN '3~5㎡'
          WHEN CAST(output_width AS REAL) * CAST(output_height AS REAL) / 1000000 < 10 THEN '5~10㎡'
          WHEN CAST(output_width AS REAL) * CAST(output_height AS REAL) / 1000000 < 20 THEN '10~20㎡'
          ELSE '20㎡~'
        END as area_range,
        COUNT(*) as print_count,
        ROUND(AVG(CAST(output_width AS REAL) * CAST(output_height AS REAL) / 1000000), 2) as avg_area_sqm,
        ROUND(AVG(print_duration_sec), 0) as avg_sec,
        ROUND(MIN(print_duration_sec), 0) as min_sec,
        ROUND(MAX(print_duration_sec), 0) as max_sec,
        ROUND(AVG(CAST(output_width AS REAL) * CAST(output_height AS REAL) / 1000000 / (print_duration_sec / 3600.0)), 2) as avg_sqm_per_hour
      FROM print_events
      WHERE print_status = 'OK'
        AND print_duration_sec IS NOT NULL AND print_duration_sec > 0
        AND output_width IS NOT NULL AND output_height IS NOT NULL
        AND date(print_completed_at) >= ? AND date(print_completed_at) <= ?
      GROUP BY printer_name, area_range
      ORDER BY printer_name, avg_area_sqm
    `).bind(dateFrom, dateTo).all()

    return c.json({
      success: true,
      data: { by_equipment: byEquipment, daily, by_printer_size: byPrinterSize, date_from: dateFrom, date_to: dateTo }
    })
  } catch (error) {
    console.error('ProductionReports error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── 생산 실적 CSV 내보내기 ──────────────────────────────────────────────────

productionReportsRouter.get('/export/csv', async (c) => {
  try {
    const { from, to, type = 'production' } = c.req.query()
    const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10)
    const dateTo = to || new Date().toISOString().substring(0, 10)
    const { generateCsv, csvResponse } = await import('../utils/csv')
    const today = new Date().toISOString().slice(0, 10)

    if (type === 'production') {
      const { results } = await c.env.DB.prepare(`
        SELECT
          pe.equipment_id,
          COALESCE(e.name, pe.equipment_id) as equipment_name,
          COALESCE(e.location_zone, '미지정') as zone,
          COUNT(*) as total_prints,
          COUNT(CASE WHEN pe.print_status = 'OK' THEN 1 END) as ok_count,
          COUNT(CASE WHEN pe.print_status = 'ERROR' THEN 1 END) as error_count,
          COUNT(CASE WHEN pe.print_status = 'CANCEL' THEN 1 END) as cancel_count,
          COUNT(DISTINCT pe.card_number) as card_count,
          COUNT(DISTINCT date(pe.print_completed_at)) as active_days
        FROM print_events pe
        LEFT JOIN equipment e ON pe.equipment_id = e.id
        WHERE pe.equipment_id IS NOT NULL
          AND date(pe.print_completed_at) >= ? AND date(pe.print_completed_at) <= ?
        GROUP BY pe.equipment_id
        ORDER BY ok_count DESC
      `).bind(dateFrom, dateTo).all()

      const headers = ['장비ID', '장비명', '구역', '총출력', '정상', '오류', '취소', '카드수', '가동일수']
      const rows = (results || []).map((r: any) => [
        r.equipment_id, r.equipment_name, r.zone,
        r.total_prints, r.ok_count, r.error_count, r.cancel_count,
        r.card_count, r.active_days
      ])
      return csvResponse(c, `생산실적_${dateFrom}_${dateTo}.csv`, generateCsv(headers, rows))
    }

    if (type === 'daily') {
      const { results } = await c.env.DB.prepare(`
        SELECT
          date(print_completed_at) as date,
          COUNT(*) as total_prints,
          COUNT(CASE WHEN print_status = 'OK' THEN 1 END) as ok_count,
          COUNT(CASE WHEN print_status != 'OK' THEN 1 END) as fail_count,
          COUNT(DISTINCT card_number) as card_count,
          COUNT(DISTINCT equipment_id) as equipment_count
        FROM print_events
        WHERE equipment_id IS NOT NULL
          AND date(print_completed_at) >= ? AND date(print_completed_at) <= ?
        GROUP BY date(print_completed_at)
        ORDER BY date ASC
      `).bind(dateFrom, dateTo).all()

      const headers = ['날짜', '총출력', '정상', '불량', '카드수', '가동장비수']
      const rows = (results || []).map((r: any) => [
        r.date, r.total_prints, r.ok_count, r.fail_count, r.card_count, r.equipment_count
      ])
      return csvResponse(c, `일별생산_${dateFrom}_${dateTo}.csv`, generateCsv(headers, rows))
    }

    return c.json({ success: false, error: 'Invalid type. Use: production, daily' }, 400)
  } catch (error) {
    console.error('src/routes/productionReports.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 일일 생산 리포트 (TODO: 구현 필요) ───

export default productionReportsRouter