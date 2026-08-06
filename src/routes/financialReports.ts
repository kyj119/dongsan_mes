// 재무제표 (간이 손익계산서) — 기존 데이터로 집계
// 별도 복식부기 전표 시스템 없이 orders/payments/purchase_orders/payment_requests에서 산출
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter } from '../utils/entityFilter'
import { LATEST_BALANCE_SUBQUERY } from '../utils/bankBalance'
import { excludeInternalClientsSql } from '../constants/intercompany'
import { excludeArExcludedClientsSql } from '../constants/arPolicy'
import { kstYear } from '../utils/kstDate'
import { deriveArSplit } from './ledger/ar-helpers'

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

    // P5 split billing: 매출=청구그룹(생산법인) 기준. 단일법인 주문은 group.billed_amount==orders.billed_amount라 무변화.
    const ef = entityFilter(c, 'g')

    // 1. 매출 — 청구 완료된 청구그룹(주문×법인)
    const salesRow = await c.env.DB.prepare(`
      SELECT
        COUNT(DISTINCT g.order_id) as order_count,
        COALESCE(SUM(g.billed_amount), 0) as total_billed,
        COALESCE(SUM(g.billed_amount), 0) as total_final
      FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
      WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'
        AND date(COALESCE(g.accounting_date, g.billed_at)) BETWEEN ? AND ?${ef.clause}
    `).bind(from, to, ...ef.params).first<SalesRow>()

    // 2. 매출원가 — 청구된 주문에 연결된 cost (주문 단위 — 혼합주문 비분할, 한계)
    const costRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(material_cost + labor_cost + overhead_cost), 0) as total_cost
      FROM order_costs
      WHERE order_id IN (
        SELECT DISTINCT g.order_id FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
        WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED' AND date(COALESCE(g.accounting_date, g.billed_at)) BETWEEN ? AND ?${ef.clause}
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
    const year = Number(c.req.query('year') || kstYear())
    // P5 split billing: 월별 매출=청구그룹 기준
    const ef = entityFilter(c, 'g')

    const { results: salesRows } = await c.env.DB.prepare(`
      SELECT
        strftime('%m', COALESCE(g.accounting_date, g.billed_at)) as month,
        COALESCE(SUM(g.billed_amount), 0) as revenue
      FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
      WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'
        AND strftime('%Y', COALESCE(g.accounting_date, g.billed_at)) = ?${ef.clause}
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
    // split billing P3: clients.balance 캐시 폐기 → 전체 미수금 파생(order_billing_groups[BILLED] − payments − adjustments)
    // ★ 2026-08-06: 거래처별 부호 분리 — 잔액이 음수인 거래처는 **선수금(부채)** 이라 자산에 마이너스로 섞으면 안 된다.
    //   종전엔 뭉쳐 SUM 해서 매출채권이 선수금만큼 과소, 부채는 과소로 **양변이 동시에 축소**됐다(순자산은 동일).
    //   allEntities = 이 엔드포인트는 설계상 전사 기준(entity 무필터)이라 헬퍼도 같은 기준으로 부른다.
    const arSplit = await deriveArSplit(c, { allEntities: true })

    // 매입 미지급 — purchase_balance 캐시 폐기 → 파생(POs[NOT IN DRAFT/CANCELLED] − payments − adjustments). AR과 동일 전사 기준(entity 무필터), 단 내부법인(그룹 3사)은 제외(법인간거래 탭 이관)
    const apRow = await c.env.DB.prepare(`
      SELECT (
        (SELECT COALESCE(SUM(final_amount), 0) FROM purchase_orders WHERE status NOT IN ('DRAFT', 'CANCELLED')${excludeInternalClientsSql('supplier_id')})
        - (SELECT COALESCE(SUM(amount), 0) FROM purchase_payments WHERE 1=1${excludeInternalClientsSql('supplier_id')})
        - (SELECT COALESCE(SUM(amount), 0) FROM purchase_adjustments WHERE 1=1${excludeInternalClientsSql('supplier_id')})
      ) as total_ap
    `).first<ApRow>()

    // 재고 평가액 (#433: 재고는 items가 아니라 inventory.quantity, 평가단가=items.avg_unit_cost 이동평균)
    const inventoryRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(inv.quantity * COALESCE(it.avg_unit_cost, 0)), 0) as total_inventory
      FROM inventory inv JOIN items it ON it.id = inv.item_id
      WHERE it.is_active = 1
    `).first<InventoryRow>().catch((): InventoryRow => ({ total_inventory: 0 }))

    // 은행 잔액 합계 (#433: bank_accounts엔 잔액 컬럼 없음 → 계좌별 최신 거래의 balance_after 합산)
    // #537: 현금잔액 SSOT — bankBalance.ts LATEST_BALANCE_SUBQUERY(balance_after IS NOT NULL 필터 포함)로 통일.
    //   bank fund-summary/getTotalBankBalance와 동일 판정 → 페이지 간 현금잔액 불일치 제거.
    const efBank = entityFilter(c, 'ba')
    const bankRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(${LATEST_BALANCE_SUBQUERY}), 0) as total_bank
      FROM bank_accounts ba
      WHERE ba.is_active = 1${efBank.clause}
    `).bind(...efBank.params).first<BankRow>().catch((): BankRow => ({ total_bank: 0 }))

    // 대출 잔액 (#433: loans 실제 컬럼 = current_balance / is_active. remaining_principal·status는 부재)
    const loanRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(current_balance), 0) as total_loan
      FROM loans WHERE is_active = 1
    `).first<LoanRow>().catch((): LoanRow => ({ total_loan: 0 }))

    const cash = Number(bankRow?.total_bank) || 0
    const ar = arSplit.receivable          // 매출채권 = 양수 잔액만
    const advance = arSplit.advance        // 선수금 = 음수 잔액 절대값(부채)
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
          advance_received: advance,
          loans,
          total: ap + advance + loans,
        },
        // 순자산은 분리 전후 불변 — (ar − advance) 가 종전 total_ar 과 같다
        net_assets: (cash + ar + inventory) - (ap + advance + loans),
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

      // P5 split billing: 매출=청구그룹(생산법인) 기준
      const ef = entityFilter(c, 'g')

      const salesRow = await c.env.DB.prepare(`
        SELECT COUNT(DISTINCT g.order_id) as order_count, COALESCE(SUM(g.billed_amount), 0) as total_billed, COALESCE(SUM(g.billed_amount), 0) as total_final
        FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
        WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED' AND date(COALESCE(g.accounting_date, g.billed_at)) BETWEEN ? AND ?${ef.clause}
      `).bind(from, to, ...ef.params).first<SalesRow>()

      const costRow = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(material_cost + labor_cost + overhead_cost), 0) as total_cost
        FROM order_costs WHERE order_id IN (SELECT DISTINCT g.order_id FROM order_billing_groups g JOIN orders o ON o.id = g.order_id WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED' AND date(COALESCE(g.accounting_date, g.billed_at)) BETWEEN ? AND ?${ef.clause})
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
    const year = Number(c.req.query('year') || kstYear())
    // P5 split billing: 월별 매출=청구그룹 기준
    const ef = entityFilter(c, 'g')

    const { results: salesRows } = await c.env.DB.prepare(`
      SELECT strftime('%m', COALESCE(g.accounting_date, g.billed_at)) as month, COALESCE(SUM(g.billed_amount), 0) as revenue
      FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
      WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED' AND strftime('%Y', COALESCE(g.accounting_date, g.billed_at)) = ?${ef.clause}
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
