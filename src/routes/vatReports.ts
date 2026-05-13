// 부가세 신고서 자동집계
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, getEntityId } from '../utils/entityFilter'

const vatReportsRouter = new Hono<HonoEnv>()
vatReportsRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// 분기별 자동 집계 (저장 X, 미리보기용)
vatReportsRouter.get('/summary', async (c) => {
  try {
    const year = parseInt(c.req.query('year') || String(new Date().getFullYear()))
    const quarter = parseInt(c.req.query('quarter') || '1')
    if (quarter < 1 || quarter > 4) return c.json({ success: false, error: 'quarter는 1~4' }, 400)

    const startMonth = (quarter - 1) * 3 + 1
    const endMonth = quarter * 3
    const lastDay = new Date(year, endMonth, 0).getDate()
    const periodStart = `${year}-${String(startMonth).padStart(2, '0')}-01`
    const periodEnd = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const ef = entityFilter(c)

    // 매출 세금계산서 (시스템 발행분 — 발행 완료된 것만)
    const salesAgg = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as cnt,
        COALESCE(SUM(supply_amount), 0) as supply_sum,
        COALESCE(SUM(tax_amount), 0) as tax_sum
      FROM tax_invoices
      WHERE status IN ('ISSUED', 'NTS_SUCCESS', 'SENT')
        AND issue_date BETWEEN ? AND ?${ef.clause}
    `).bind(periodStart, periodEnd, ...ef.params).first<{ cnt: number; supply_sum: string; tax_sum: string }>()

    // 매출 세금계산서 상세
    const { results: salesList } = await c.env.DB.prepare(`
      SELECT id, invoice_number, issue_date, buyer_name, buyer_brn,
        supply_amount, tax_amount, total_amount, status
      FROM tax_invoices
      WHERE status IN ('ISSUED', 'NTS_SUCCESS', 'SENT')
        AND issue_date BETWEEN ? AND ?${ef.clause}
      ORDER BY issue_date DESC
    `).bind(periodStart, periodEnd, ...ef.params).all()

    // 매입 세금계산서 (홈택스 수집분)
    const purchaseAgg = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as cnt,
        COALESCE(SUM(supply_amount), 0) as supply_sum,
        COALESCE(SUM(tax_amount), 0) as tax_sum
      FROM hometax_invoices
      WHERE invoice_type = 'BUY'
        AND issue_date BETWEEN ? AND ?
    `).bind(periodStart, periodEnd).first<{ cnt: number; supply_sum: string; tax_sum: string }>().catch(() => null)

    // 매입 상세
    const { results: purchaseList } = await c.env.DB.prepare(`
      SELECT id, nts_confirm_number, issue_date,
        issuer_corp_name as supplier_name,
        issuer_corp_num as supplier_brn,
        supply_amount, tax_amount, total_amount
      FROM hometax_invoices
      WHERE invoice_type = 'BUY'
        AND issue_date BETWEEN ? AND ?
      ORDER BY issue_date DESC
    `).bind(periodStart, periodEnd).all().catch(() => ({ results: [] }))

    const salesSupply = Number(salesAgg?.supply_sum) || 0
    const salesTax = Number(salesAgg?.tax_sum) || 0
    const purchaseSupply = Number(purchaseAgg?.supply_sum) || 0
    const purchaseTax = Number(purchaseAgg?.tax_sum) || 0
    const payableTax = salesTax - purchaseTax

    return c.json({
      success: true,
      data: {
        report_year: year,
        report_quarter: quarter,
        period_start: periodStart,
        period_end: periodEnd,
        sales: {
          count: salesAgg?.cnt || 0,
          supply_amount: salesSupply,
          tax_amount: salesTax,
          total_amount: salesSupply + salesTax,
          list: salesList,
        },
        purchase: {
          count: purchaseAgg?.cnt || 0,
          supply_amount: purchaseSupply,
          tax_amount: purchaseTax,
          total_amount: purchaseSupply + purchaseTax,
          list: purchaseList,
        },
        payable_tax: payableTax,
      }
    })
  } catch (error) {
    console.error('vat summary error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 신고 이력 저장
vatReportsRouter.post('/reports', async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json() as any

    const result = await c.env.DB.prepare(`
      INSERT INTO vat_reports (
        report_year, report_quarter, period_start, period_end,
        sales_count, sales_supply_amount, sales_tax_amount,
        purchase_count, purchase_supply_amount, purchase_tax_amount,
        payable_tax, status, notes, created_by, entity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(report_year, report_quarter) DO UPDATE SET
        sales_count = excluded.sales_count,
        sales_supply_amount = excluded.sales_supply_amount,
        sales_tax_amount = excluded.sales_tax_amount,
        purchase_count = excluded.purchase_count,
        purchase_supply_amount = excluded.purchase_supply_amount,
        purchase_tax_amount = excluded.purchase_tax_amount,
        payable_tax = excluded.payable_tax,
        notes = excluded.notes
    `).bind(
      body.report_year, body.report_quarter,
      body.period_start, body.period_end,
      body.sales_count || 0, body.sales_supply_amount || 0, body.sales_tax_amount || 0,
      body.purchase_count || 0, body.purchase_supply_amount || 0, body.purchase_tax_amount || 0,
      body.payable_tax || 0,
      body.status || 'DRAFT',
      body.notes || null,
      user?.id || null,
      getEntityId(c) || 1
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id }, message: '저장되었습니다.' })
  } catch (error) {
    console.error('vat save error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 신고 이력 목록
vatReportsRouter.get('/reports', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT vr.*, u.name as created_by_name
      FROM vat_reports vr
      LEFT JOIN users u ON u.id = vr.created_by
      ORDER BY vr.report_year DESC, vr.report_quarter DESC
    `).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('vat list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 신고 완료 처리
vatReportsRouter.patch('/reports/:id/submit', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare(`
      UPDATE vat_reports SET status = 'SUBMITTED', submitted_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(id).run()
    return c.json({ success: true, message: '신고 완료 처리되었습니다.' })
  } catch (error) {
    console.error('vat submit error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default vatReportsRouter
