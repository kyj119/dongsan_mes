// 재무제표 (간이 손익계산서) — 기존 데이터로 집계
// 별도 복식부기 전표 시스템 없이 orders/payments/purchase_orders/payment_requests에서 산출
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter } from '../utils/entityFilter'

// ── Row types for D1 queries ──
interface SalesRow { order_count: number; total_billed: number; total_final: number }
interface CostRow { total_cost: number }
interface PurchaseRow { po_count: number; total_purchase: number }
interface ExpenseRow { expense_count: number; total_expense: number }
interface PayrollRow { total_payroll: number }
interface FixedRow { total_fixed: number }
interface MonthlyRevenueRow { month: string; revenue: number }
interface MonthlyExpenseRow { month: string; expense: number }
interface MonthlyPayrollRow { month: string; payroll: number }
interface ArRow { total_ar: number }
interface ApRow { total_ap: number }
interface InventoryRow { total_inventory: number }
interface BankRow { total_bank: number }
interface LoanRow { total_loan: number }

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
    `).bind(from, to, ...ef.params).first<SalesRow>()

    // 2. 매출원가 — 주문에 연결된 cost (있으면)
    const costRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(material_cost + labor_cost + overhead_cost), 0) as total_cost
      FROM order_costs
      WHERE order_id IN (
        SELECT id FROM orders WHERE billing_status = 'BILLED' AND date(billed_at) BETWEEN ? AND ?${ef.clause}
      )
    `).bind(from, to, ...ef.params).first<CostRow>().catch((): CostRow => ({ total_cost: 0 }))

    // 3. 매입 — CONFIRMED/RECEIVED 발주서
    const purchaseRow = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as po_count,
        COALESCE(SUM(final_amount), 0) as total_purchase
      FROM purchase_orders
      WHERE status IN ('CONFIRMED', 'RECEIVED', 'PARTIAL_RECEIVED')
        AND date(created_at) BETWEEN ? AND ?
    `).bind(from, to).first<PurchaseRow>()

    // 4. 경비 — 승인된 지출결의서 (EXPENSE 유형)
    const expenseRow = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as expense_count,
        COALESCE(SUM(amount), 0) as total_expense
      FROM payment_requests
      WHERE status IN ('APPROVED', 'PAID')
        AND request_type = 'EXPENSE'
        AND date(request_date) BETWEEN ? AND ?
    `).bind(from, to).first<ExpenseRow>().catch((): ExpenseRow => ({ total_expense: 0, expense_count: 0 }))

    // 5. 인건비 — 급여 (B Phase 후 활성화)
    const payrollRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(net_pay), 0) as total_payroll
      FROM payroll_slips
      WHERE status IN ('CONFIRMED', 'PAID')
        AND date(pay_date) BETWEEN ? AND ?
    `).bind(from, to).first<PayrollRow>().catch((): PayrollRow => ({ total_payroll: 0 }))

    // 6. 고정비 — fixed_expenses (해당 월에 활성)
    const fixedRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_fixed
      FROM fixed_expenses
      WHERE is_active = 1
        AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)
        AND frequency = 'MONTHLY'
    `).bind(to, from).first<FixedRow>().catch((): FixedRow => ({ total_fixed: 0 }))

    // 월 수 계산
    const fromDate = new Date(from)
    const toDate = new Date(to)
    const monthsCount = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / (30 * 86400000)))

    // 손익 계산
    const revenue = Number(salesRow?.total_billed) || 0
    const cogs = Number(costRow?.total_cost) || 0
    const purchase = Number(purchaseRow?.total_purchase) || 0
    const expense = Number(expenseRow?.total_expense) || 0
    const payroll = Number(payrollRow?.total_payroll) || 0
    const fixed = (Number(fixedRow?.total_fixed) || 0) * monthsCount

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
          order_count: salesRow?.order_count || 0,
          original_amount: Number(salesRow?.total_final) || 0,
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
    const year = Number(c.req.query('year') || new Date().getFullYear())
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
    `).bind(String(year), ...ef.params).all<MonthlyRevenueRow>()

    const expenseResult = await c.env.DB.prepare(`
      SELECT
        strftime('%m', request_date) as month,
        COALESCE(SUM(amount), 0) as expense
      FROM payment_requests
      WHERE status IN ('APPROVED', 'PAID')
        AND strftime('%Y', request_date) = ?
      GROUP BY month
      ORDER BY month
    `).bind(String(year)).all<MonthlyExpenseRow>().catch((): { results: MonthlyExpenseRow[] } => ({ results: [] }))
    const expenseRows = expenseResult.results

    const payrollResult = await c.env.DB.prepare(`
      SELECT
        printf('%02d', pay_month) as month,
        COALESCE(SUM(net_pay), 0) as payroll
      FROM payroll_slips
      WHERE status IN ('CONFIRMED', 'PAID')
        AND pay_year = ?
      GROUP BY pay_month
    `).bind(year).all<MonthlyPayrollRow>().catch((): { results: MonthlyPayrollRow[] } => ({ results: [] }))
    const payrollRows = payrollResult.results

    // 12개월 데이터 조합
    interface MonthlyEntry { month: number; revenue: number; expense: number; payroll: number; profit: number; margin_pct: number }
    const monthly: MonthlyEntry[] = []
    for (let m = 1; m <= 12; m++) {
      const mStr = String(m).padStart(2, '0')
      const sales = salesRows.find(r => r.month === mStr)
      const exp = expenseRows.find(r => r.month === mStr)
      const pay = payrollRows.find(r => r.month === mStr)

      const revenue = Number(sales?.revenue) || 0
      const expense = Number(exp?.expense) || 0
      const payroll = Number(pay?.payroll) || 0
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
    `).first<ArRow>()

    // 매입 미지급 (purchase_balance)
    const apRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(purchase_balance), 0) as total_ap
      FROM clients WHERE is_active = 1
    `).first<ApRow>()

    // 재고 평가액 (현재 재고 × 단가)
    const inventoryRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(current_stock * COALESCE(unit_price, 0)), 0) as total_inventory
      FROM items WHERE is_active = 1
    `).first<InventoryRow>().catch((): InventoryRow => ({ total_inventory: 0 }))

    // 은행 잔액 합계 (있으면)
    const bankRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(current_balance), 0) as total_bank
      FROM bank_accounts WHERE is_active = 1
    `).first<BankRow>().catch((): BankRow => ({ total_bank: 0 }))

    // 대출 잔액
    const loanRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(remaining_principal), 0) as total_loan
      FROM loans WHERE status = 'ACTIVE'
    `).first<LoanRow>().catch((): LoanRow => ({ total_loan: 0 }))

    const cash = Number(bankRow?.total_bank) || 0
    const ar = Number(arRow?.total_ar) || 0
    const inventory = Number(inventoryRow?.total_inventory) || 0
    const ap = Number(apRow?.total_ap) || 0
    const loans = Number(loanRow?.total_loan) || 0

    return c.json({
      success: true,
      data: {
        snapshot_at: new Date().toISOString(),
        assets: {
          cash,
          accounts_receivable: ar,
          inventory,
          total: cash + ar + inventory,
        },
        liabilities: {
          accounts_payable: ap,
          loans,
          total: ap + loans,
        },
        net_assets: (cash + ar + inventory) - (ap + loans),
      }
    })
  } catch (error) {
    console.error('financial balance-snapshot error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================
// CSV 내보내기
// GET /export/csv?type=pnl&from=&to=  OR  ?type=monthly&year=
// ============================================================
financialReportsRouter.get('/export/csv', async (c) => {
  try {
    const type = c.req.query('type')
    if (!type || !['pnl', 'monthly'].includes(type)) {
      return c.json({ success: false, error: 'type 파라미터 필요 (pnl | monthly)' }, 400)
    }

    const { generateCsv, csvResponse } = await import('../utils/csv')

    if (type === 'pnl') {
      const from = c.req.query('from')
      const to = c.req.query('to')
      if (!from || !to) return c.json({ success: false, error: 'from, to 파라미터 필요' }, 400)

      const ef = entityFilter(c)

      const salesRow = await c.env.DB.prepare(`
        SELECT COUNT(*) as order_count, COALESCE(SUM(billed_amount), 0) as total_billed, COALESCE(SUM(final_amount), 0) as total_final
        FROM orders WHERE billing_status = 'BILLED' AND date(billed_at) BETWEEN ? AND ?${ef.clause}
      `).bind(from, to, ...ef.params).first<SalesRow>()

      const costRow = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(material_cost + labor_cost + overhead_cost), 0) as total_cost
        FROM order_costs WHERE order_id IN (SELECT id FROM orders WHERE billing_status = 'BILLED' AND date(billed_at) BETWEEN ? AND ?${ef.clause})
      `).bind(from, to, ...ef.params).first<CostRow>().catch((): CostRow => ({ total_cost: 0 }))

      const expenseRow = await c.env.DB.prepare(`
        SELECT COUNT(*) as expense_count, COALESCE(SUM(amount), 0) as total_expense
        FROM payment_requests WHERE status IN ('APPROVED', 'PAID') AND request_type = 'EXPENSE' AND date(request_date) BETWEEN ? AND ?
      `).bind(from, to).first<ExpenseRow>().catch((): ExpenseRow => ({ total_expense: 0, expense_count: 0 }))

      const payrollRow = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(net_pay), 0) as total_payroll
        FROM payroll_slips WHERE status IN ('CONFIRMED', 'PAID') AND date(pay_date) BETWEEN ? AND ?
      `).bind(from, to).first<PayrollRow>().catch((): PayrollRow => ({ total_payroll: 0 }))

      const revenue = Number(salesRow?.total_billed) || 0
      const cogs = Number(costRow?.total_cost) || 0
      const grossProfit = revenue - cogs
      const expense = Number(expenseRow?.total_expense) || 0
      const payroll = Number(payrollRow?.total_payroll) || 0
      const operatingProfit = grossProfit - expense - payroll
      const grossMargin = revenue > 0 ? +((grossProfit / revenue) * 100).toFixed(1) : 0
      const operatingMargin = revenue > 0 ? +((operatingProfit / revenue) * 100).toFixed(1) : 0

      const headers = ['기간', '매출', '매출건수', '매출원가', '매출총이익', '매출총이익률(%)', '영업이익', '영업이익률(%)']
      const rows = [[
        `${from} ~ ${to}`,
        revenue,
        salesRow?.order_count || 0,
        cogs,
        grossProfit,
        grossMargin,
        operatingProfit,
        operatingMargin,
      ]]
      const csv = generateCsv(headers, rows)
      return csvResponse(c, `손익계산서_${from}_${to}.csv`, csv)
    }

    // type === 'monthly'
    const year = Number(c.req.query('year') || new Date().getFullYear())
    const ef = entityFilter(c)

    const { results: salesRows } = await c.env.DB.prepare(`
      SELECT strftime('%m', billed_at) as month, COALESCE(SUM(billed_amount), 0) as revenue
      FROM orders WHERE billing_status = 'BILLED' AND strftime('%Y', billed_at) = ?${ef.clause}
      GROUP BY month ORDER BY month
    `).bind(String(year), ...ef.params).all<MonthlyRevenueRow>()

    const expenseResult = await c.env.DB.prepare(`
      SELECT strftime('%m', request_date) as month, COALESCE(SUM(amount), 0) as expense
      FROM payment_requests WHERE status IN ('APPROVED', 'PAID') AND strftime('%Y', request_date) = ?
      GROUP BY month ORDER BY month
    `).bind(String(year)).all<MonthlyExpenseRow>().catch((): { results: MonthlyExpenseRow[] } => ({ results: [] }))

    const payrollResult = await c.env.DB.prepare(`
      SELECT printf('%02d', pay_month) as month, COALESCE(SUM(net_pay), 0) as payroll
      FROM payroll_slips WHERE status IN ('CONFIRMED', 'PAID') AND pay_year = ?
      GROUP BY pay_month
    `).bind(year).all<MonthlyPayrollRow>().catch((): { results: MonthlyPayrollRow[] } => ({ results: [] }))

    const headers = ['월', '매출', '매출원가', '인건비', '경비', '영업이익', '이익률(%)']
    const rows: (string | number)[][] = []
    for (let m = 1; m <= 12; m++) {
      const mStr = String(m).padStart(2, '0')
      const sales = salesRows.find(r => r.month === mStr)
      const exp = expenseResult.results.find(r => r.month === mStr)
      const pay = payrollResult.results.find(r => r.month === mStr)

      const revenue = Number(sales?.revenue) || 0
      const expense = Number(exp?.expense) || 0
      const payroll = Number(pay?.payroll) || 0
      const profit = revenue - expense - payroll
      const margin = revenue > 0 ? +((profit / revenue) * 100).toFixed(1) : 0

      rows.push([`${m}월`, revenue, 0, payroll, expense, profit, margin])
    }
    const csv = generateCsv(headers, rows)
    return csvResponse(c, `월별추이_${year}.csv`, csv)
  } catch (error) {
    console.error('financial csv export error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default financialReportsRouter
