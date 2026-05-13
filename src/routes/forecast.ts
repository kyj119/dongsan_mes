import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const forecastRouter = new Hono<HonoEnv>()
forecastRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// 1. 수주 예측
forecastRouter.get('/order-forecast', async (c) => {
  try {
    // 최근 12개월 월별 데이터
    const { results: monthly } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as order_count,
        COALESCE(SUM(final_amount), 0) as revenue,
        COUNT(DISTINCT client_id) as client_count
      FROM orders
      WHERE status != 'CANCELLED'
        AND created_at >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month ASC
    `).all<{ month: string; order_count: number; revenue: number; client_count: number }>()

    // 카테고리별 최근 6개월 추이
    const { results: categoryTrend } = await c.env.DB.prepare(`
      SELECT
        i.category,
        strftime('%Y-%m', o.created_at) as month,
        COUNT(oi.id) as item_count,
        COALESCE(SUM(oi.unit_price * oi.quantity), 0) as revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN items i ON oi.item_id = i.id
      WHERE o.status != 'CANCELLED'
        AND oi.parent_item_id IS NULL
        AND o.created_at >= date('now', '-6 months')
      GROUP BY i.category, strftime('%Y-%m', o.created_at)
      ORDER BY i.category, month ASC
    `).all<{ category: string; month: string; item_count: number; revenue: number }>()

    // 요일별 평균 주문량 (패턴 분석)
    const { results: dayOfWeek } = await c.env.DB.prepare(`
      SELECT
        CAST(strftime('%w', created_at) AS INTEGER) as dow,
        COUNT(*) * 1.0 / COUNT(DISTINCT date(created_at)) as avg_orders,
        COALESCE(AVG(final_amount), 0) as avg_revenue
      FROM orders
      WHERE status != 'CANCELLED'
        AND created_at >= date('now', '-6 months')
      GROUP BY strftime('%w', created_at)
      ORDER BY dow
    `).all()

    // 예측 계산: 3개월 이동 평균 + 전년 동기 가중치
    const data = monthly.map((r) => ({
      month: r.month,
      order_count: r.order_count,
      revenue: Number(r.revenue),
      client_count: r.client_count,
    }))

    // 다음달 예측
    const recent3 = data.slice(-3)
    const avgOrders3m = recent3.length > 0 ? Math.round(recent3.reduce((s, m) => s + m.order_count, 0) / recent3.length) : 0
    const avgRevenue3m = recent3.length > 0 ? Math.round(recent3.reduce((s, m) => s + m.revenue, 0) / recent3.length) : 0

    // 전년 동기 (있으면)
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const nextMonthStr = nextMonth.getFullYear() + '-' + String(nextMonth.getMonth() + 1).padStart(2, '0')
    const yoyMonth = (nextMonth.getFullYear() - 1) + '-' + String(nextMonth.getMonth() + 1).padStart(2, '0')
    const yoyData = data.find(m => m.month === yoyMonth)

    // 가중 예측: 이동평균 70% + 전년동기 30% (전년 데이터 있을 때)
    let forecastOrders = avgOrders3m
    let forecastRevenue = avgRevenue3m
    if (yoyData) {
      forecastOrders = Math.round(avgOrders3m * 0.7 + yoyData.order_count * 0.3)
      forecastRevenue = Math.round(avgRevenue3m * 0.7 + yoyData.revenue * 0.3)
    }

    // 성장률 (최근 3개월 vs 이전 3개월)
    const prev3 = data.slice(-6, -3)
    const prevAvgRevenue = prev3.length > 0 ? prev3.reduce((s, m) => s + m.revenue, 0) / prev3.length : 0
    const growthRate = prevAvgRevenue > 0 ? Math.round((avgRevenue3m - prevAvgRevenue) / prevAvgRevenue * 1000) / 10 : 0

    // 카테고리별 추이 병합
    const catMap = new Map<string, { month: string; count: number; revenue: number }[]>()
    for (const r of categoryTrend) {
      const key = r.category || '기타'
      if (!catMap.has(key)) catMap.set(key, [])
      catMap.get(key)!.push({ month: r.month, count: r.item_count, revenue: Number(r.revenue) })
    }
    const categoryForecast = Array.from(catMap.entries()).map(([cat, months]) => {
      const last3 = months.slice(-3)
      const avgRev = last3.length > 0 ? Math.round(last3.reduce((s, m) => s + m.revenue, 0) / last3.length) : 0
      const first3 = months.slice(0, 3)
      const firstAvg = first3.length > 0 ? first3.reduce((s, m) => s + m.revenue, 0) / first3.length : 0
      const trend = firstAvg > 0 ? Math.round((avgRev - firstAvg) / firstAvg * 1000) / 10 : 0
      return { category: cat, forecast_revenue: avgRev, trend, months }
    }).sort((a, b) => b.forecast_revenue - a.forecast_revenue)

    return c.json({
      success: true,
      data: {
        monthly: data,
        forecast: {
          month: nextMonthStr,
          order_count: forecastOrders,
          revenue: forecastRevenue,
          method: yoyData ? 'MA3+YoY' : 'MA3',
          growth_rate: growthRate,
        },
        day_of_week: dayOfWeek,
        category_forecast: categoryForecast,
      },
    })
  } catch (error) {
    console.error('src/routes/forecast.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 2. 용량 분석
forecastRouter.get('/capacity-analysis', async (c) => {
  try {
    const { months = '3' } = c.req.query()
    const monthCount = Number(months)

    // 장비별 일별 출력 건수
    const { results: dailyPrint } = await c.env.DB.prepare(`
      SELECT
        printer_name,
        date(created_at) as print_date,
        COUNT(*) as print_count,
        COUNT(CASE WHEN print_status = 'OK' THEN 1 END) as ok_count
      FROM print_events
      WHERE created_at >= date('now', '-' || ? || ' months')
        AND printer_name IS NOT NULL AND printer_name != ''
      GROUP BY printer_name, date(created_at)
      ORDER BY printer_name, print_date
    `).bind(monthCount).all<{ printer_name: string; print_date: string; print_count: number; ok_count: number }>()

    // 장비별 가동률 집계
    const equipmentMap = new Map<string, { days: number; total: number; ok: number; maxDay: number; dates: Set<string> }>()
    for (const row of dailyPrint) {
      const name = row.printer_name
      if (!equipmentMap.has(name)) {
        equipmentMap.set(name, { days: 0, total: 0, ok: 0, maxDay: 0, dates: new Set() })
      }
      const eq = equipmentMap.get(name)!
      eq.dates.add(row.print_date)
      eq.total += row.print_count
      eq.ok += row.ok_count
      eq.maxDay = Math.max(eq.maxDay, row.print_count)
    }

    // 영업일 수 (대략 계산: 월 22일)
    const businessDays = monthCount * 22

    const equipment = Array.from(equipmentMap.entries()).map(([name, stats]) => {
      stats.days = stats.dates.size
      const utilization = Math.round(stats.days / businessDays * 100)
      const avgDaily = stats.days > 0 ? Math.round(stats.total / stats.days) : 0
      const successRate = stats.total > 0 ? Math.round(stats.ok / stats.total * 100) : 0
      return {
        printer_name: name,
        active_days: stats.days,
        total_prints: stats.total,
        ok_prints: stats.ok,
        success_rate: successRate,
        utilization,
        avg_daily: avgDaily,
        peak_daily: stats.maxDay,
      }
    }).sort((a, b) => b.total_prints - a.total_prints)

    // 주간별 총 출력 추이 (최근 12주)
    const { results: weeklyTrend } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-W%W', created_at) as week,
        COUNT(*) as total,
        COUNT(CASE WHEN print_status = 'OK' THEN 1 END) as ok_count,
        COUNT(DISTINCT printer_name) as active_equipment
      FROM print_events
      WHERE created_at >= date('now', '-3 months')
        AND printer_name IS NOT NULL AND printer_name != ''
      GROUP BY strftime('%Y-W%W', created_at)
      ORDER BY week ASC
    `).all()

    // 시간대별 출력 분포 (피크 타임 분석)
    const { results: hourlyDist } = await c.env.DB.prepare(`
      SELECT
        CAST(strftime('%H', created_at) AS INTEGER) as hour,
        COUNT(*) as count
      FROM print_events
      WHERE created_at >= date('now', '-' || ? || ' months')
      GROUP BY strftime('%H', created_at)
      ORDER BY hour
    `).bind(monthCount).all()

    return c.json({
      success: true,
      data: {
        equipment,
        weekly_trend: weeklyTrend,
        hourly_distribution: hourlyDist,
        business_days: businessDays,
      },
    })
  } catch (error) {
    console.error('src/routes/forecast.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 3. 거래처별 수주 예측
forecastRouter.get('/client-forecast', async (c) => {
  try {
    // 최근 6개월 거래처별 월 매출 (상위 15개)
    const { results } = await c.env.DB.prepare(`
      SELECT
        c.id, c.client_name,
        strftime('%Y-%m', o.created_at) as month,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.final_amount), 0) as revenue
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.status != 'CANCELLED'
        AND o.created_at >= date('now', '-6 months')
      GROUP BY c.id, strftime('%Y-%m', o.created_at)
      ORDER BY c.id, month ASC
    `).all<{ id: number; client_name: string; month: string; order_count: number; revenue: number }>()

    // 거래처별 월간 데이터 집계
    const clientMap = new Map<string, { name: string; months: { month: string; order_count: number; revenue: number }[] }>()
    for (const r of results) {
      const key = String(r.id)
      if (!clientMap.has(key)) clientMap.set(key, { name: r.client_name, months: [] })
      clientMap.get(key)!.months.push({
        month: r.month,
        order_count: r.order_count,
        revenue: Number(r.revenue),
      })
    }

    // 상위 15개 거래처 (총 매출 기준)
    const clients = Array.from(clientMap.entries()).map(([id, data]) => {
      const totalRevenue = data.months.reduce((s, m) => s + m.revenue, 0)
      const avgMonthly = data.months.length > 0 ? Math.round(totalRevenue / data.months.length) : 0
      const last3 = data.months.slice(-3)
      const recent3Avg = last3.length > 0 ? Math.round(last3.reduce((s, m) => s + m.revenue, 0) / last3.length) : 0
      const first3 = data.months.slice(0, 3)
      const early3Avg = first3.length > 0 ? first3.reduce((s, m) => s + m.revenue, 0) / first3.length : 0
      const trend = early3Avg > 0 ? Math.round((recent3Avg - early3Avg) / early3Avg * 1000) / 10 : 0
      const frequency = data.months.length

      return {
        client_id: id,
        client_name: data.name,
        total_revenue: totalRevenue,
        avg_monthly: avgMonthly,
        forecast_revenue: recent3Avg,
        trend,
        frequency,
        months: data.months,
        risk: frequency <= 2 ? 'LOW_FREQUENCY' : trend < -30 ? 'DECLINING' : null,
      }
    }).sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 15)

    return c.json({ success: true, data: { clients } })
  } catch (error) {
    console.error('src/routes/forecast.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 원단 소모 예측 (TODO: 구현 필요) ───

export default forecastRouter