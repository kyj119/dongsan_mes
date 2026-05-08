import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter } from '../utils/entityFilter'

const reportsRouter = new Hono<HonoEnv>()
reportsRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// 1. 거래처별 매출 추이 (월별)
reportsRouter.get('/client-revenue', async (c) => {
  try {
    const { client_id, months = '12' } = c.req.query()
    const monthCount = parseInt(months)
    const ef = entityFilter(c, 'o')

    let query: string
    let params: any[]

    if (client_id) {
      // 특정 거래처의 월별 매출
      query = `
        SELECT
          strftime('%Y-%m', o.created_at) as month,
          COUNT(*) as order_count,
          COALESCE(SUM(o.final_amount), 0) as revenue
        FROM orders o
        WHERE o.client_id = ? AND o.status != 'CANCELLED'${ef.clause}
        GROUP BY strftime('%Y-%m', o.created_at)
        ORDER BY month DESC
        LIMIT ?
      `
      params = [client_id, ...ef.params, monthCount]
    } else {
      // 전체 거래처 + 월별 (최근 N개월)
      query = `
        SELECT
          c.id as client_id, c.client_name,
          strftime('%Y-%m', o.created_at) as month,
          COUNT(*) as order_count,
          COALESCE(SUM(o.final_amount), 0) as revenue
        FROM orders o
        JOIN clients c ON o.client_id = c.id
        WHERE o.status != 'CANCELLED'
          AND o.created_at >= date('now', '-' || ? || ' months')${ef.clause}
        GROUP BY c.id, c.client_name, strftime('%Y-%m', o.created_at)
        ORDER BY revenue DESC
      `
      params = [monthCount, ...ef.params]
    }

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // 거래처별 요약 (TOP 20)
    const { results: clientSummary } = await c.env.DB.prepare(`
      SELECT
        c.id, c.client_name, c.balance,
        COUNT(o.id) as total_orders,
        COALESCE(SUM(o.final_amount), 0) as total_revenue,
        COALESCE(AVG(o.final_amount), 0) as avg_order_amount
      FROM clients c
      JOIN orders o ON c.id = o.client_id
      WHERE c.is_active = 1 AND o.status != 'CANCELLED'
        AND o.created_at >= date('now', '-' || ? || ' months')${ef.clause}
      GROUP BY c.id
      ORDER BY total_revenue DESC
      LIMIT 20
    `).bind(monthCount, ...ef.params).all()

    return c.json({ success: true, data: { monthly: results, clients: clientSummary } })
  } catch (error) {
    console.error('src/routes/reports.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 2. 품목별 매출 분석
reportsRouter.get('/item-analysis', async (c) => {
  try {
    const { months = '6' } = c.req.query()
    const monthCount = parseInt(months)
    const ef = entityFilter(c, 'o')

    const { results } = await c.env.DB.prepare(`
      SELECT
        i.id as item_id, i.item_name, i.category,
        COUNT(oi.id) as order_count,
        COALESCE(SUM(oi.quantity), 0) as total_quantity,
        COALESCE(SUM(oi.amount), 0) as total_revenue,
        COALESCE(AVG(oi.unit_price), 0) as avg_unit_price
      FROM order_items oi
      JOIN items i ON oi.item_id = i.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'CANCELLED'
        AND o.created_at >= date('now', '-' || ? || ' months')${ef.clause}
      GROUP BY i.id, i.item_name, i.category
      ORDER BY total_revenue DESC
      LIMIT 30
    `).bind(monthCount, ...ef.params).all()

    // 카테고리별 요약
    const { results: categories } = await c.env.DB.prepare(`
      SELECT
        i.category,
        COUNT(DISTINCT oi.order_id) as order_count,
        COALESCE(SUM(oi.amount), 0) as total_revenue
      FROM order_items oi
      JOIN items i ON oi.item_id = i.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'CANCELLED'
        AND o.created_at >= date('now', '-' || ? || ' months')${ef.clause}
      GROUP BY i.category
      ORDER BY total_revenue DESC
    `).bind(monthCount, ...ef.params).all()

    return c.json({ success: true, data: { items: results, categories } })
  } catch (error) {
    console.error('src/routes/reports.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 3. 디자이너별 주문 처리 통계
reportsRouter.get('/designer-stats', async (c) => {
  try {
    const { months = '3' } = c.req.query()
    const monthCount = parseInt(months)
    const ef = entityFilter(c, 'o')

    const { results } = await c.env.DB.prepare(`
      SELECT
        u.id as user_id, u.name as designer_name,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.final_amount), 0) as total_revenue,
        COALESCE(AVG(o.final_amount), 0) as avg_amount,
        COUNT(CASE WHEN o.status = 'SHIPPED' THEN 1 END) as completed_count,
        COUNT(CASE WHEN o.status IN ('PRINTING', 'PRINT_DONE') THEN 1 END) as in_progress_count
      FROM users u
      LEFT JOIN orders o ON o.created_by = u.id
        AND o.status != 'CANCELLED'
        AND o.created_at >= date('now', '-' || ? || ' months')${ef.clause}
      WHERE u.is_active = 1 AND u.role IN ('DESIGNER', 'ADMIN', 'MANAGER')
      GROUP BY u.id, u.name
      ORDER BY order_count DESC
    `).bind(monthCount, ...ef.params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/reports.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 4. 월간 매출 종합 리포트
// NOTE: D1/SQLite에는 재귀 CTE 기반 날짜 시리즈 생성이 불안정하므로
// 실제 데이터 기반 집계로 단순화 (대시보드 패턴과 동일)
reportsRouter.get('/monthly-summary', async (c) => {
  try {
    const { months = '12' } = c.req.query()
    const monthCount = parseInt(months)
    const ef = entityFilter(c, 'o')
    const efP = entityFilter(c)

    // 월별 주문/매출
    const { results: monthly } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', o.created_at) as month,
        COUNT(*) as order_count,
        COALESCE(SUM(o.final_amount), 0) as revenue,
        COUNT(DISTINCT o.client_id) as unique_clients
      FROM orders o
      WHERE o.status != 'CANCELLED'
        AND o.created_at >= date('now', '-' || ? || ' months')${ef.clause}
      GROUP BY strftime('%Y-%m', o.created_at)
      ORDER BY month DESC
    `).bind(monthCount, ...ef.params).all()

    // 월별 수금 (payments)
    const { results: payments } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', payment_date) as month,
        COUNT(*) as payment_count,
        COALESCE(SUM(amount), 0) as payments
      FROM payments
      WHERE payment_date >= date('now', '-' || ? || ' months')${efP.clause}
      GROUP BY strftime('%Y-%m', payment_date)
      ORDER BY month DESC
    `).bind(monthCount, ...efP.params).all()

    return c.json({ success: true, data: { monthly, payments } })
  } catch (error) {
    console.error('src/routes/reports.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 5. 수익성 분석 (마진)
reportsRouter.get('/margin-analysis', async (c) => {
  try {
    const { months = '6' } = c.req.query()
    const monthCount = parseInt(months)
    const ef = entityFilter(c, 'o')

    // 1. 기간 전체 요약
    const { results: summaryRows } = await c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(oi.unit_price * oi.quantity), 0) as total_revenue,
        COALESCE(SUM(oi.total_cost), 0) as total_cost,
        COALESCE(AVG(oi.margin_rate), 0) as avg_margin_rate
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'CANCELLED'
        AND oi.parent_item_id IS NULL
        AND o.created_at >= date('now', '-' || ? || ' months')${ef.clause}
    `).bind(monthCount, ...ef.params).all()

    const summaryRaw = summaryRows[0] as any
    const totalRevenue = parseFloat(summaryRaw?.total_revenue ?? 0)
    const totalCost = parseFloat(summaryRaw?.total_cost ?? 0)
    const summary = {
      total_revenue: totalRevenue,
      total_cost: totalCost,
      total_profit: totalRevenue - totalCost,
      avg_margin_rate: parseFloat(summaryRaw?.avg_margin_rate ?? 0),
    }

    // 2. 카테고리별 마진율
    const { results: byCategory } = await c.env.DB.prepare(`
      SELECT
        i.category as category_name,
        COALESCE(SUM(oi.unit_price * oi.quantity), 0) as revenue,
        COALESCE(SUM(oi.total_cost), 0) as cost,
        COALESCE(SUM(oi.unit_price * oi.quantity) - SUM(oi.total_cost), 0) as profit,
        CASE
          WHEN SUM(oi.unit_price * oi.quantity) > 0
          THEN ROUND((SUM(oi.unit_price * oi.quantity) - SUM(oi.total_cost)) * 100.0 / SUM(oi.unit_price * oi.quantity), 2)
          ELSE 0
        END as margin_rate,
        COUNT(oi.id) as item_count
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN items i ON oi.item_id = i.id
      WHERE o.status != 'CANCELLED'
        AND oi.parent_item_id IS NULL
        AND o.created_at >= date('now', '-' || ? || ' months')${ef.clause}
      GROUP BY i.category
      ORDER BY revenue DESC
    `).bind(monthCount, ...ef.params).all()

    const byCategoryMapped = (byCategory as any[]).map((r) => ({
      category_name: r.category_name,
      revenue: parseFloat(r.revenue),
      cost: parseFloat(r.cost),
      profit: parseFloat(r.profit),
      margin_rate: parseFloat(r.margin_rate),
      item_count: r.item_count,
    }))

    // 3. 월별 수익성 추이
    const { results: byMonth } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', o.created_at) as month,
        COALESCE(SUM(oi.unit_price * oi.quantity), 0) as revenue,
        COALESCE(SUM(oi.total_cost), 0) as cost,
        COALESCE(SUM(oi.unit_price * oi.quantity) - SUM(oi.total_cost), 0) as profit,
        CASE
          WHEN SUM(oi.unit_price * oi.quantity) > 0
          THEN ROUND((SUM(oi.unit_price * oi.quantity) - SUM(oi.total_cost)) * 100.0 / SUM(oi.unit_price * oi.quantity), 2)
          ELSE 0
        END as margin_rate
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'CANCELLED'
        AND oi.parent_item_id IS NULL
        AND o.created_at >= date('now', '-' || ? || ' months')${ef.clause}
      GROUP BY strftime('%Y-%m', o.created_at)
      ORDER BY month DESC
    `).bind(monthCount, ...ef.params).all()

    const byMonthMapped = (byMonth as any[]).map((r) => ({
      month: r.month,
      revenue: parseFloat(r.revenue),
      cost: parseFloat(r.cost),
      profit: parseFloat(r.profit),
      margin_rate: parseFloat(r.margin_rate),
    }))

    // 4. 마진율 낮은 주문 TOP 10 (margin_rate < 20 우선, 없으면 전체 최하위)
    const { results: lowMarginOrders } = await c.env.DB.prepare(`
      SELECT
        o.id as order_id,
        o.order_number,
        c.client_name,
        COALESCE(SUM(oi.unit_price * oi.quantity), 0) as total_revenue,
        COALESCE(SUM(oi.total_cost), 0) as total_cost,
        CASE
          WHEN SUM(oi.unit_price * oi.quantity) > 0
          THEN ROUND((SUM(oi.unit_price * oi.quantity) - SUM(oi.total_cost)) * 100.0 / SUM(oi.unit_price * oi.quantity), 2)
          ELSE 0
        END as margin_rate
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.status != 'CANCELLED'
        AND oi.parent_item_id IS NULL
        AND o.created_at >= date('now', '-' || ? || ' months')${ef.clause}
      GROUP BY o.id, o.order_number, c.client_name
      HAVING SUM(oi.total_cost) > 0
      ORDER BY margin_rate ASC
      LIMIT 10
    `).bind(monthCount, ...ef.params).all()

    const lowMarginMapped = (lowMarginOrders as any[]).map((r) => ({
      order_id: r.order_id,
      order_number: r.order_number,
      client_name: r.client_name,
      total_revenue: parseFloat(r.total_revenue),
      total_cost: parseFloat(r.total_cost),
      margin_rate: parseFloat(r.margin_rate),
    }))

    return c.json({
      success: true,
      data: {
        summary,
        by_category: byCategoryMapped,
        by_month: byMonthMapped,
        low_margin_orders: lowMarginMapped,
      },
    })
  } catch (error) {
    console.error('src/routes/reports.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 6. 거래처별 마진 분석
reportsRouter.get('/margin-by-client', async (c) => {
  try {
    const { months = '6' } = c.req.query()
    const monthCount = parseInt(months)
    const ef = entityFilter(c, 'o')

    const { results } = await c.env.DB.prepare(`
      SELECT
        c.id as client_id, c.client_name,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(oi_agg.revenue), 0) as total_revenue,
        COALESCE(SUM(oi_agg.cost), 0) as total_cost,
        COALESCE(SUM(oi_agg.revenue), 0) - COALESCE(SUM(oi_agg.cost), 0) as margin_amount,
        CASE WHEN SUM(oi_agg.revenue) > 0
          THEN ROUND((SUM(oi_agg.revenue) - SUM(oi_agg.cost)) * 100.0 / SUM(oi_agg.revenue), 1)
          ELSE 0
        END as margin_rate
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      LEFT JOIN (
        SELECT order_id,
          SUM(unit_price * quantity) as revenue,
          SUM(total_cost) as cost
        FROM order_items
        WHERE parent_item_id IS NULL AND total_cost > 0
        GROUP BY order_id
      ) oi_agg ON o.id = oi_agg.order_id
      WHERE o.status != 'CANCELLED'
        AND o.created_at >= date('now', '-' || ? || ' months')
        AND oi_agg.cost > 0${ef.clause}
      GROUP BY c.id, c.client_name
      HAVING total_revenue > 0
      ORDER BY margin_rate DESC
    `).bind(monthCount, ...ef.params).all()

    // TOP 10 / BOTTOM 10
    const all = results || []
    const top10 = all.slice(0, 10)
    const bottom10 = all.slice().reverse().slice(0, 10)

    // 수익성 등급
    const graded = all.map((r: any) => {
      let grade = 'D'
      if (r.margin_rate >= 50) grade = 'A'
      else if (r.margin_rate >= 35) grade = 'B'
      else if (r.margin_rate >= 20) grade = 'C'
      return { ...r, grade }
    })

    return c.json({ success: true, data: { top10, bottom10, all: graded } })
  } catch (error) {
    console.error('src/routes/reports.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 8. 미수금 분석
reportsRouter.get('/receivables-analysis', async (c) => {
  try {
    const { months = '6' } = c.req.query()
    const monthCount = parseInt(months)
    const ef = entityFilter(c)

    // 1) 미수금 요약
    const { results: summaryRows } = await c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) as total_ar,
        COUNT(CASE WHEN balance > 0 THEN 1 END) as ar_client_count
      FROM clients WHERE is_active = 1
    `).all()

    // 당월 매출 발생 (billing)
    const { results: billedRows } = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(final_amount), 0) as billed
      FROM orders
      WHERE status != 'CANCELLED'
        AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')${ef.clause}
    `).bind(...ef.params).all()

    // 당월 수금
    const { results: collectedRows } = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as collected
      FROM payments
      WHERE strftime('%Y-%m', payment_date) = strftime('%Y-%m', 'now')${ef.clause}
    `).bind(...ef.params).all()

    const summary = {
      total_ar: parseFloat((summaryRows[0] as any)?.total_ar ?? 0),
      ar_client_count: (summaryRows[0] as any)?.ar_client_count ?? 0,
      month_billed: parseFloat((billedRows[0] as any)?.billed ?? 0),
      month_collected: parseFloat((collectedRows[0] as any)?.collected ?? 0),
    }

    // 2) Aging Buckets (미수금 연령 분석) - clients.balance 기준
    // 최근 입금일 기준으로 연령 판단
    const { results: agingData } = await c.env.DB.prepare(`
      SELECT
        c.id, c.client_name, c.balance,
        MAX(p.payment_date) as last_payment_date,
        julianday('now') - julianday(COALESCE(MAX(p.payment_date), c.created_at)) as days_since_payment
      FROM clients c
      LEFT JOIN payments p ON c.id = p.client_id
      WHERE c.is_active = 1 AND c.balance > 0
      GROUP BY c.id
    `).all()

    const buckets = { current: 0, days30: 0, days60: 0, days90: 0 }
    const bucketCounts = { current: 0, days30: 0, days60: 0, days90: 0 }
    for (const row of agingData as any[]) {
      const days = row.days_since_payment || 0
      const bal = parseFloat(row.balance) || 0
      if (days <= 30) { buckets.current += bal; bucketCounts.current++ }
      else if (days <= 60) { buckets.days30 += bal; bucketCounts.days30++ }
      else if (days <= 90) { buckets.days60 += bal; bucketCounts.days60++ }
      else { buckets.days90 += bal; bucketCounts.days90++ }
    }
    const aging = [
      { label: '0~30일', amount: buckets.current, count: bucketCounts.current },
      { label: '31~60일', amount: buckets.days30, count: bucketCounts.days30 },
      { label: '61~90일', amount: buckets.days60, count: bucketCounts.days60 },
      { label: '90일+', amount: buckets.days90, count: bucketCounts.days90 },
    ]

    // 3) 미수금 TOP 15 거래처
    const { results: topAR } = await c.env.DB.prepare(`
      SELECT
        c.id, c.client_name, c.balance,
        MAX(p.payment_date) as last_payment_date,
        CAST(julianday('now') - julianday(COALESCE(MAX(p.payment_date), c.created_at)) AS INTEGER) as days_overdue,
        (SELECT COUNT(*) FROM collection_logs cl WHERE cl.client_id = c.id) as collection_count,
        COALESCE(SUM(p.amount), 0) as total_paid
      FROM clients c
      LEFT JOIN payments p ON c.id = p.client_id
      WHERE c.is_active = 1 AND c.balance > 0
      GROUP BY c.id
      ORDER BY c.balance DESC
      LIMIT 15
    `).all()

    // 4) 월별 수금 추이
    const efOrders = entityFilter(c)
    const efPayments = entityFilter(c)
    const { results: monthlyTrend } = await c.env.DB.prepare(`
      SELECT
        m.month,
        COALESCE(rev.revenue, 0) as revenue,
        COALESCE(pay.payments, 0) as payments
      FROM (
        SELECT DISTINCT strftime('%Y-%m', created_at) as month
        FROM orders WHERE created_at >= date('now', '-' || ? || ' months')${efOrders.clause}
        UNION
        SELECT DISTINCT strftime('%Y-%m', payment_date) as month
        FROM payments WHERE payment_date >= date('now', '-' || ? || ' months')${efPayments.clause}
      ) m
      LEFT JOIN (
        SELECT strftime('%Y-%m', created_at) as month, SUM(final_amount) as revenue
        FROM orders WHERE status != 'CANCELLED'${efOrders.clause} GROUP BY 1
      ) rev ON m.month = rev.month
      LEFT JOIN (
        SELECT strftime('%Y-%m', payment_date) as month, SUM(amount) as payments
        FROM payments WHERE 1=1${efPayments.clause} GROUP BY 1
      ) pay ON m.month = pay.month
      ORDER BY m.month DESC
      LIMIT ?
    `).bind(monthCount, ...efOrders.params, monthCount, ...efPayments.params, ...efOrders.params, ...efPayments.params, monthCount).all()

    return c.json({ success: true, data: { summary, aging, top_clients: topAR, monthly_trend: monthlyTrend } })
  } catch (error) {
    console.error('src/routes/reports.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 9. 생산 실적 분석
reportsRouter.get('/production-analysis', async (c) => {
  try {
    const { months = '6' } = c.req.query()
    const monthCount = parseInt(months)

    // 1) 요약
    const { results: summaryRows } = await c.env.DB.prepare(`
      SELECT
        COUNT(CASE WHEN print_status = 'OK' THEN 1 END) as ok_count,
        COUNT(CASE WHEN print_status != 'OK' THEN 1 END) as error_count,
        COUNT(*) as total_count
      FROM print_events
      WHERE created_at >= date('now', '-' || ? || ' months')
    `).bind(monthCount).all()

    const { results: qualityRows } = await c.env.DB.prepare(`
      SELECT COUNT(*) as issue_count
      FROM quality_issues
      WHERE created_at >= date('now', '-' || ? || ' months')
    `).bind(monthCount).all()

    const { results: maintRows } = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(cost), 0) as maint_cost
      FROM maintenance_logs
      WHERE performed_at >= date('now', '-' || ? || ' months')
    `).bind(monthCount).all()

    const ps = summaryRows[0] as any
    const summary = {
      ok_count: ps?.ok_count ?? 0,
      error_count: ps?.error_count ?? 0,
      total_count: ps?.total_count ?? 0,
      quality_issues: (qualityRows[0] as any)?.issue_count ?? 0,
      maintenance_cost: parseFloat((maintRows[0] as any)?.maint_cost ?? 0),
    }

    // 2) 장비별 실적
    const { results: byEquipment } = await c.env.DB.prepare(`
      SELECT
        pe.printer_name,
        COUNT(*) as total,
        COUNT(CASE WHEN pe.print_status = 'OK' THEN 1 END) as ok_count,
        COUNT(DISTINCT date(pe.created_at)) as active_days
      FROM print_events pe
      WHERE pe.created_at >= date('now', '-' || ? || ' months')
        AND pe.printer_name IS NOT NULL AND pe.printer_name != ''
      GROUP BY pe.printer_name
      ORDER BY total DESC
    `).bind(monthCount).all()

    // 3) 월별 출력 추이
    const { results: byMonth } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as total,
        COUNT(CASE WHEN print_status = 'OK' THEN 1 END) as ok_count
      FROM print_events
      WHERE created_at >= date('now', '-' || ? || ' months')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
    `).bind(monthCount).all()

    // 4) 불량 유형별 분포
    const { results: defectTypes } = await c.env.DB.prepare(`
      SELECT
        COALESCE(defect_category, '미분류') as category,
        COUNT(*) as count,
        COALESCE(SUM(cost_impact), 0) as cost
      FROM quality_issues
      WHERE created_at >= date('now', '-' || ? || ' months')
      GROUP BY defect_category
      ORDER BY count DESC
    `).bind(monthCount).all()

    return c.json({ success: true, data: { summary, by_equipment: byEquipment, by_month: byMonth, defect_types: defectTypes } })
  } catch (error) {
    console.error('src/routes/reports.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 10. 기간 비교 분석
reportsRouter.get('/period-comparison', async (c) => {
  try {
    const { base_month, compare = 'MOM' } = c.req.query()

    // 기준월: 지정 안 하면 전월
    const now = new Date()
    const defaultBase = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const baseM = base_month || (defaultBase.getFullYear() + '-' + String(defaultBase.getMonth() + 1).padStart(2, '0'))

    // 비교월 계산
    const [by, bm] = baseM.split('-').map(Number)
    let compM: string
    if (compare === 'YOY') {
      compM = (by - 1) + '-' + String(bm).padStart(2, '0')
    } else {
      // MOM: 전월
      const cd = new Date(by, bm - 2, 1)
      compM = cd.getFullYear() + '-' + String(cd.getMonth() + 1).padStart(2, '0')
    }

    const efKPI = entityFilter(c)
    const efKPIo = entityFilter(c, 'o')

    // KPI 쿼리 함수
    async function getMonthKPI(month: string) {
      const { results: orderRows } = await c.env.DB.prepare(`
        SELECT
          COUNT(*) as order_count,
          COALESCE(SUM(final_amount), 0) as revenue,
          COALESCE(AVG(final_amount), 0) as avg_amount,
          COUNT(DISTINCT client_id) as client_count
        FROM orders
        WHERE status != 'CANCELLED'
          AND strftime('%Y-%m', created_at) = ?${efKPI.clause}
      `).bind(month, ...efKPI.params).all()

      const { results: payRows } = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(amount), 0) as payments
        FROM payments
        WHERE strftime('%Y-%m', payment_date) = ?${efKPI.clause}
      `).bind(month, ...efKPI.params).all()

      const { results: marginRows } = await c.env.DB.prepare(`
        SELECT
          COALESCE(SUM(oi.unit_price * oi.quantity), 0) as revenue,
          COALESCE(SUM(oi.total_cost), 0) as cost
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status != 'CANCELLED'
          AND oi.parent_item_id IS NULL
          AND strftime('%Y-%m', o.created_at) = ?${efKPIo.clause}
      `).bind(month, ...efKPIo.params).all()

      const { results: newClientRows } = await c.env.DB.prepare(`
        SELECT COUNT(DISTINCT client_id) as new_clients
        FROM orders
        WHERE status != 'CANCELLED'
          AND strftime('%Y-%m', created_at) = ?${efKPI.clause}
          AND client_id NOT IN (
            SELECT DISTINCT client_id FROM orders
            WHERE status != 'CANCELLED' AND created_at < ? || '-01'${efKPI.clause}
          )
      `).bind(month, ...efKPI.params, month, ...efKPI.params).all()

      const o = orderRows[0] as any
      const p = payRows[0] as any
      const m = marginRows[0] as any
      const mr = parseFloat(m?.revenue ?? 0)
      const mc = parseFloat(m?.cost ?? 0)

      return {
        order_count: o?.order_count ?? 0,
        revenue: parseFloat(o?.revenue ?? 0),
        avg_amount: parseFloat(o?.avg_amount ?? 0),
        client_count: o?.client_count ?? 0,
        payments: parseFloat(p?.payments ?? 0),
        margin_rate: mr > 0 ? Math.round((mr - mc) / mr * 1000) / 10 : 0,
        new_clients: (newClientRows[0] as any)?.new_clients ?? 0,
      }
    }

    const [baseKPI, compKPI] = await Promise.all([getMonthKPI(baseM), getMonthKPI(compM)])

    // 카테고리별 비교
    async function getCategoryRevenue(month: string) {
      const { results } = await c.env.DB.prepare(`
        SELECT
          i.category,
          COALESCE(SUM(oi.unit_price * oi.quantity), 0) as revenue
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN items i ON oi.item_id = i.id
        WHERE o.status != 'CANCELLED'
          AND oi.parent_item_id IS NULL
          AND strftime('%Y-%m', o.created_at) = ?${efKPIo.clause}
        GROUP BY i.category
      `).bind(month, ...efKPIo.params).all()
      return results as any[]
    }

    const [baseCat, compCat] = await Promise.all([getCategoryRevenue(baseM), getCategoryRevenue(compM)])

    // 카테고리 병합
    const catMap = new Map<string, { base: number; comp: number }>()
    for (const r of baseCat) catMap.set(r.category || '기타', { base: parseFloat(r.revenue), comp: 0 })
    for (const r of compCat) {
      const key = r.category || '기타'
      const existing = catMap.get(key) || { base: 0, comp: 0 }
      existing.comp = parseFloat(r.revenue)
      catMap.set(key, existing)
    }
    const categories = Array.from(catMap.entries()).map(([cat, v]) => ({
      category: cat,
      base_revenue: v.base,
      comp_revenue: v.comp,
      change: v.base - v.comp,
      change_rate: v.comp > 0 ? Math.round((v.base - v.comp) / v.comp * 1000) / 10 : (v.base > 0 ? 100 : 0),
    })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change))

    // 거래처 변동 TOP 5
    async function getClientRevenue(month: string) {
      const { results } = await c.env.DB.prepare(`
        SELECT c.id, c.client_name, COALESCE(SUM(o.final_amount), 0) as revenue
        FROM orders o
        JOIN clients c ON o.client_id = c.id
        WHERE o.status != 'CANCELLED' AND strftime('%Y-%m', o.created_at) = ?${efKPIo.clause}
        GROUP BY c.id
      `).bind(month, ...efKPIo.params).all()
      return results as any[]
    }

    const [baseClients, compClients] = await Promise.all([getClientRevenue(baseM), getClientRevenue(compM)])

    const clientMap = new Map<string, { name: string; base: number; comp: number }>()
    for (const r of baseClients) clientMap.set(r.id, { name: r.client_name, base: parseFloat(r.revenue), comp: 0 })
    for (const r of compClients) {
      const existing = clientMap.get(r.id) || { name: r.client_name, base: 0, comp: 0 }
      existing.comp = parseFloat(r.revenue)
      clientMap.set(r.id, existing)
    }
    const clientChanges = Array.from(clientMap.values()).map(v => ({
      client_name: v.name,
      base_revenue: v.base,
      comp_revenue: v.comp,
      change: v.base - v.comp,
    })).sort((a, b) => b.change - a.change)

    const increased = clientChanges.filter(c => c.change > 0).slice(0, 5)
    const decreased = clientChanges.filter(c => c.change < 0).slice(-5).reverse()

    return c.json({
      success: true,
      data: {
        base_month: baseM,
        comp_month: compM,
        compare_type: compare,
        base: baseKPI,
        comp: compKPI,
        categories,
        clients: { increased, decreased },
      },
    })
  } catch (error) {
    console.error('src/routes/reports.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 7. 월별 매출 CSV 다운로드
reportsRouter.get('/monthly-summary/csv', async (c) => {
  try {
    const { months = '6' } = c.req.query()
    const monthsInt = Math.min(parseInt(months) || 6, 24)
    const ef = entityFilter(c, 'o')
    const efP = entityFilter(c)

    const { results } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', o.created_at) as month,
        COUNT(*) as order_count,
        COALESCE(SUM(o.final_amount), 0) as revenue
      FROM orders o
      WHERE o.status != 'CANCELLED'
        AND o.created_at >= date('now', '-' || ? || ' months')${ef.clause}
      GROUP BY strftime('%Y-%m', o.created_at)
      ORDER BY month DESC
    `).bind(monthsInt, ...ef.params).all() as any

    const { results: payments } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', payment_date) as month,
        COALESCE(SUM(amount), 0) as total_payments
      FROM payments
      WHERE payment_date >= date('now', '-' || ? || ' months')${efP.clause}
      GROUP BY strftime('%Y-%m', payment_date)
    `).bind(monthsInt, ...efP.params).all() as any

    const payMap: Record<string, number> = {}
    for (const p of (payments || [])) payMap[p.month] = p.total_payments || 0

    const headers = ['월', '주문수', '매출액', '수금액', '수금률']
    const rows = (results || []).map((r: any) => {
      const pay = payMap[r.month] || 0
      const rate = r.revenue > 0 ? Math.round((pay / r.revenue) * 100) : 0
      return [r.month, r.order_count, r.revenue, pay, rate + '%']
    })

    const { generateCsv, csvResponse } = await import('../utils/csv')
    const today = new Date().toISOString().slice(0, 10)
    return csvResponse(c, `월별매출분석_${today}.csv`, generateCsv(headers, rows))
  } catch (error) {
    console.error('src/routes/reports.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default reportsRouter
