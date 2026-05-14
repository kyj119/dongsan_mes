import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { entityFilter } from '../utils/entityFilter'

const deliveryAnalyticsRouter = new Hono<HonoEnv>()

// GET /export/csv - 납기분석 CSV 내보내기
deliveryAnalyticsRouter.get('/export/csv', async (c) => {
  try {
    const { from, to } = c.req.query()
    const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10)
    const dateTo = to || new Date().toISOString().substring(0, 10)

    const ef = entityFilter(c, 'o')
    const { generateCsv, csvResponse } = await import('../utils/csv')

    const { results } = await c.env.DB.prepare(`
      SELECT
        o.order_number,
        c.name AS client_name,
        o.delivery_date,
        o.updated_at,
        o.status,
        o.final_amount,
        CASE
          WHEN o.status = 'SHIPPED' THEN CAST(julianday(o.updated_at) - julianday(o.delivery_date) AS INTEGER)
          ELSE CAST(julianday('now') - julianday(o.delivery_date) AS INTEGER)
        END AS delay_days
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.delivery_date >= ? AND o.delivery_date <= ?
        AND o.status NOT IN ('DRAFT', 'QUOTATION', 'CANCELLED')
        ${ef.clause}
      ORDER BY o.delivery_date ASC
    `).bind(dateFrom, dateTo, ...ef.params).all()

    const statusLabel: Record<string, string> = {
      'CONFIRMED': '확정',
      'PRINTING': '인쇄중',
      'PRINT_DONE': '인쇄완료',
      'SHIPPED': '출고',
      'HOLD': '보류',
    }

    const headers = ['주문번호', '거래처', '납기일', '출고일', '상태', '최종금액', '지연일수']
    const rows = (results || []).map((r: any) => [
      r.order_number,
      r.client_name || '-',
      r.delivery_date || '-',
      r.status === 'SHIPPED' ? (r.updated_at || '-') : '-',
      statusLabel[r.status] || r.status,
      r.final_amount != null ? r.final_amount : 0,
      r.delay_days != null ? r.delay_days : '-',
    ])

    const filename = `납기분석_${dateFrom}_${dateTo}.csv`
    return csvResponse(c, filename, generateCsv(headers, rows))
  } catch (error) {
    console.error('deliveryAnalytics export/csv error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default deliveryAnalyticsRouter
