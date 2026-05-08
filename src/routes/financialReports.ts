// 재무제표 (간이 손익계산서) — 기존 데이터로 집계
// 별도 복식부기 전표 시스템 없이 orders/payments/purchase_orders/payment_requests에서 산출
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter } from '../utils/entityFilter'

const financialReportsRouter = new Hono<HonoEnv>()
financialReportsRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// ============================================================
// 손익계산서 (P&L)
// GET /pnl?from=&to=
// ============================================================
financialReportsRouter.get('/pnl', async (c) => {
  try {
    const { from, to } = c.req.query()
    if (!from || !to) return c.json({ success: false, error: 'from, to 파라미터 필요' }, 400)

    const ef = entityFilter(c)

    // 1. 매출 — 청구 완료된 주문
    const salesRow = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as order_count,
        COALESCE(SUM(billed_amount), 0) as total_billed,
        COALESCE(SUM(final_amount), 0) as total_final
      FROM orders
      WHERE billing_status = 'BILLED'
        AND date(billed_at) BETWEEN ? AND ?${ef.clause}
    `).bind(from, to, ...ef.params).first() as any

    // 2. 매출원가 — 주문에 연결된 cost (있으면)
    const costRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(material_cost + labor_cost + overhead_cost), 0) as total_cost
      FROM order_costs
      WHERE order_id IN (
        SELECT id FROM orders WHERE billing_status = 'BILLED' AND date(billed_at) BETWEEN ? AND ?${ef.clause}
      )
    `).bind(from, to, ...ef.params).first().catch(() => ({ total_cost: 0 })) as any

    // 3. 매입 — CONFIRMED/RECEIVED 발주서
    const purchaseRow = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as po_count,
        COALESCE(SUM(final_amount), 0) as total_purchase
      FROM purchase_orders
      WHERE status IN ('CONFIRMED', 'RECEIVED', 'PARTIAL_RECEIVED')
        AND date(created_at) BETWEEN ? AND ?
    `).bind(from, to).first() as any

    // 4. 경비 — 승인된 지출결의서 (EXPENSE 유형)
    const expenseRow = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as expense_count,
        COALESCE(SUM(amount), 0) as total_expense
      FROM payment_requests
      WHERE status IN ('APPROVED', 'PAID')
        AND request_type = 'EXPENSE'
        AND date(request_date) BETWEEN ? AND ?
    `).bind(from, to).first().catch(() => ({ total_expense: 0, expense_count: 0 })) as any

    // 5. 인건비 — 급여 (B Phase 후 활성화)
    const payrollRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(net_pay), 0) as total_payroll
      FROM payroll_slips
      WHERE status IN ('CONFIRMED', 'PAID')
        AND date(pay_date) BETWEEN ? AND ?
    `).bind(from, to).first().catch(() => ({ total_payroll: 0 })) as any

    // 6. 고정비 — fixed_expenses (해당 월에 활성)
    const fixedRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_fixed
      FROM fixed_expenses
      WHERE is_active = 1
        AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)
        AND frequency = 'MONTHLY'
    `).bind(to, from).first().catch(() => ({ total_fixed: 0 })) as any

    // 월 수 계산
    const fromDate = new Date(from)
    const toDate = new Date(to)
    const monthsCount = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / (30 * 86400000)))

    // 손익 계산
    const revenue = parseFloat(salesRow.total_billed) || 0
    const cogs = parseFloat(costRow.total_cost) || 0
    const purchase = parseFloat(purchaseRow.total_purchase) || 0
    const expense = parseFloat(expenseRow.total_expense) || 0
    const payroll = parseFloat(payrollRow.total_payroll) || 0
    const fixed = (parseFloat(fixedRow.total_fixed) || 0) * monthsCount

    const grossProfit = revenue - cogs                  // 매출총이익
    const operatingExpense = expense + payroll + fixed  // 판관비
    const operatingProfit = grossProfit - operatingExpense // 영업이익
    const netProfit = operatingProfit                   // 단순화 — 영업외 손익 미반영
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
    const operatingMargin = revenue > 0 ? (operatingProfit / revenue) * 100 : 0

    return c.json({
      success: true,
      data: {
        period: { from, to, months: monthsCount },
        revenue: {
          total: revenue,
          order_count: salesRow.order_count || 0,
          original_amount: parseFloat(salesRow.total_final) || 0,
        },
        cogs: {
          total: cogs,
          margin_pct: revenue > 0 ? +((cogs / revenue) * 100).toFixed(1) : 0,
        },
        gross_profit: {
          total: grossProfit,
          margin_pct: +grossMargin.toFixed(1),
        },
        operating_expense: {
          total: operatingExpense,
          purchase_total: purchase,  // 참고용 (매출원가에 이미 포함될 수 있음)
          expense_approved: expense,
          payroll: payroll,
          fixed_cost: fixed,
        },
        operating_profit: {
          total: operatingProfit,
          margin_pct: +operatingMargin.toFixed(1),
        },
        net_profit: {
          total: netProfit,
          margin_pct: +operatingMargin.toFixed(1),
        },
      }
    })
  } catch (error) {
    console.error('financial pnl error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================
// 월별 손익 추이
// GET /pnl/monthly?year=
// ============================================================
financialReportsRouter.get('/pnl/monthly', async (c) => {
  try {
    const year = parseInt(c.req.query('year') || String(new Date().getFullYear()))
    const ef = entityFilter(c)

    const { results: salesRows } = await c.env.DB.prepare(`
      SELECT
        strftime('%m', billed_at) as month,
        COALESCE(SUM(billed_amount), 0) as revenue
      FROM orders
      WHERE billing_status = 'BILLED'
        AND strftime('%Y', billed_at) = ?${ef.clause}
      GROUP BY month
      ORDER BY month
    `).bind(String(year), ...ef.params).all() as any

    const { results: expenseRows } = await c.env.DB.prepare(`
      SELECT
        strftime('%m', request_date) as month,
        COALESCE(SUM(amount), 0) as expense
      FROM payment_requests
      WHERE status IN ('APPROVED', 'PAID')
        AND strftime('%Y', request_date) = ?
      GROUP BY month
      ORDER BY month
    `).bind(String(year)).all().catch(() => ({ results: [] })) as any

    const { results: payrollRows } = await c.env.DB.prepare(`
      SELECT
        printf('%02d', pay_month) as month,
        COALESCE(SUM(net_pay), 0) as payroll
      FROM payroll_slips
      WHERE status IN ('CONFIRMED', 'PAID')
        AND pay_year = ?
      GROUP BY pay_month
    `).bind(year).all().catch(() => ({ results: [] })) as any

    // 12개월 데이터 조합
    const monthly: any[] = []
    for (let m = 1; m <= 12; m++) {
      const mStr = String(m).padStart(2, '0')
      const sales = (salesRows as any[]).find(r => r.month === mStr)
      const exp = (expenseRows as any[]).find(r => r.month === mStr)
      const pay = (payrollRows as any[]).find(r => r.month === mStr)

      const revenue = parseFloat(sales?.revenue) || 0
      const expense = parseFloat(exp?.expense) || 0
      const payroll = parseFloat(pay?.payroll) || 0
      const profit = revenue - expense - payroll

      monthly.push({
        month: m,
        revenue,
        expense,
        payroll,
        profit,
        margin_pct: revenue > 0 ? +((profit / revenue) * 100).toFixed(1) : 0,
      })
    }

    const yearTotal = {
      revenue: monthly.reduce((s, m) => s + m.revenue, 0),
      expense: monthly.reduce((s, m) => s + m.expense, 0),
      payroll: monthly.reduce((s, m) => s + m.payroll, 0),
      profit: monthly.reduce((s, m) => s + m.profit, 0),
    }

    return c.json({ success: true, data: { year, monthly, total: yearTotal } })
  } catch (error) {
    console.error('financial monthly pnl error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================
// 재무 스냅샷 (현금/미수금/매입미지급/재고)
// GET /balance-snapshot
// ============================================================
financialReportsRouter.get('/balance-snapshot', async (c) => {
  try {
    // 미수금 합계 (clients.balance)
    const arRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(balance), 0) as total_ar
      FROM clients WHERE is_active = 1
    `).first() as any

    // 매입 미지급 (purchase_balance)
    const apRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(purchase_balance), 0) as total_ap
      FROM clients WHERE is_active = 1
    `).first() as any

    // 재고 평가액 (현재 재고 × 단가)
    const inventoryRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(current_stock * COALESCE(unit_price, 0)), 0) as total_inventory
      FROM items WHERE is_active = 1
    `).first().catch(() => ({ total_inventory: 0 })) as any

    // 은행 잔액 합계 (있으면)
    const bankRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(current_balance), 0) as total_bank
      FROM bank_accounts WHERE is_active = 1
    `).first().catch(() => ({ total_bank: 0 })) as any

    // 대출 잔액
    const loanRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(remaining_principal), 0) as total_loan
      FROM loans WHERE status = 'ACTIVE'
    `).first().catch(() => ({ total_loan: 0 })) as any

    return c.json({
      success: true,
      data: {
        snapshot_at: new Date().toISOString(),
        assets: {
          cash: parseFloat(bankRow.total_bank) || 0,
          accounts_receivable: parseFloat(arRow.total_ar) || 0,
          inventory: parseFloat(inventoryRow.total_inventory) || 0,
          total: (parseFloat(bankRow.total_bank) || 0)
                + (parseFloat(arRow.total_ar) || 0)
                + (parseFloat(inventoryRow.total_inventory) || 0),
        },
        liabilities: {
          accounts_payable: parseFloat(apRow.total_ap) || 0,
          loans: parseFloat(loanRow.total_loan) || 0,
          total: (parseFloat(apRow.total_ap) || 0) + (parseFloat(loanRow.total_loan) || 0),
        },
        net_assets: ((parseFloat(bankRow.total_bank) || 0)
                    + (parseFloat(arRow.total_ar) || 0)
                    + (parseFloat(inventoryRow.total_inventory) || 0))
                  - ((parseFloat(apRow.total_ap) || 0) + (parseFloat(loanRow.total_loan) || 0)),
      }
    })
  } catch (error) {
    console.error('financial balance-snapshot error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default financialReportsRouter
