import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter } from '../utils/entityFilter'

const cashFlowRouter = new Hono<HonoEnv>()
cashFlowRouter.use('/*', authMiddleware)

// ============================================================================
// 고정비 CRUD
// ============================================================================

cashFlowRouter.get('/fixed-expenses', requireRole('ADMIN'), async (c) => {
  try {
    const { category = '', active = '1' } = c.req.query()
    const clauses: string[] = []
    const params: any[] = []

    if (category) {
      clauses.push('category = ?')
      params.push(category)
    }
    if (active) {
      clauses.push('is_active = ?')
      params.push(Number(active))
    }

    const where = clauses.length ? 'WHERE ' + clauses.map(cl => cl.replace(/^(\w)/, 'fe.$1')).join(' AND ') : ''
    const sql = `SELECT fe.*, u.name as created_by_name
       FROM fixed_expenses fe
       LEFT JOIN users u ON fe.created_by = u.id
       ${where}
       ORDER BY fe.category, fe.name`
    const { results } = await c.env.DB.prepare(sql).bind(...params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/cashFlow.ts fixed-expenses error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

cashFlowRouter.post('/fixed-expenses', requireRole('ADMIN'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json<{
      name: string; category: string; amount: number; frequency?: string;
      payment_day?: number; start_date: string; end_date?: string;
      counterpart_name?: string; notes?: string
    }>()

    if (!body.name || !body.category || !body.amount || !body.start_date) {
      return c.json({ success: false, error: '필수 항목을 입력해주세요.' }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO fixed_expenses (name, category, amount, frequency, payment_day, start_date, end_date, counterpart_name, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.name, body.category, body.amount, body.frequency || 'MONTHLY',
      body.payment_day || 1, body.start_date, body.end_date || null,
      body.counterpart_name || null, body.notes || null, user?.id || null
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error) {
    console.error('src/routes/cashFlow.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

cashFlowRouter.put('/fixed-expenses/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<{
      name?: string; category?: string; amount?: number; frequency?: string;
      payment_day?: number; start_date?: string; end_date?: string;
      counterpart_name?: string; notes?: string; is_active?: number
    }>()

    const fields: string[] = []
    const params: any[] = []

    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`)
        params.push(value)
      }
    }
    if (fields.length === 0) return c.json({ success: false, error: '변경할 항목이 없습니다.' }, 400)

    fields.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    await c.env.DB.prepare(
      `UPDATE fixed_expenses SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...params).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/cashFlow.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

cashFlowRouter.delete('/fixed-expenses/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare(
      'UPDATE fixed_expenses SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/cashFlow.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// 대출 CRUD
// ============================================================================

cashFlowRouter.get('/loans', requireRole('ADMIN'), async (c) => {
  try {
    const { active = '1' } = c.req.query()
    const where = active ? 'WHERE l.is_active = ?' : ''
    const params = active ? [Number(active)] : []

    const { results } = await c.env.DB.prepare(`
      SELECT l.*,
        u.name as created_by_name,
        (SELECT COUNT(*) FROM loan_payments lp WHERE lp.loan_id = l.id AND lp.status = 'SCHEDULED') as pending_payments,
        (SELECT COUNT(*) FROM loan_payments lp WHERE lp.loan_id = l.id AND lp.status = 'OVERDUE') as overdue_payments
      FROM loans l
      LEFT JOIN users u ON l.created_by = u.id
      ${where}
      ORDER BY l.is_active DESC, l.creditor
    `).bind(...params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/cashFlow.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

cashFlowRouter.post('/loans', requireRole('ADMIN'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json<{
      loan_number?: string; creditor: string; description?: string;
      original_amount: number; current_balance: number;
      rate_type?: string; current_rate?: number;
      repayment_type?: string; start_date: string; maturity_date: string;
      monthly_payment_day?: number; monthly_payment_amount?: number; notes?: string
    }>()

    if (!body.creditor || !body.original_amount || !body.start_date || !body.maturity_date) {
      return c.json({ success: false, error: '필수 항목을 입력해주세요.' }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO loans (loan_number, creditor, description, original_amount, current_balance,
        rate_type, current_rate, repayment_type, start_date, maturity_date,
        monthly_payment_day, monthly_payment_amount, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.loan_number || null, body.creditor, body.description || null,
      body.original_amount, body.current_balance ?? body.original_amount,
      body.rate_type || 'FIXED', body.current_rate || 0,
      body.repayment_type || 'EQUAL_INSTALLMENT',
      body.start_date, body.maturity_date,
      body.monthly_payment_day || 1, body.monthly_payment_amount || 0,
      body.notes || null, user?.id || null
    ).run()

    // 초기 금리 이력 기록
    if (body.current_rate) {
      await c.env.DB.prepare(`
        INSERT INTO loan_rate_history (loan_id, effective_date, rate, changed_by, notes)
        VALUES (?, ?, ?, ?, '초기 설정')
      `).bind(result.meta.last_row_id, body.start_date, body.current_rate, user?.id || null).run()
    }

    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error) {
    console.error('src/routes/cashFlow.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

cashFlowRouter.put('/loans/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<Record<string, any>>()

    const allowedFields = [
      'loan_number', 'creditor', 'description', 'original_amount', 'current_balance',
      'rate_type', 'current_rate', 'repayment_type', 'start_date', 'maturity_date',
      'monthly_payment_day', 'monthly_payment_amount', 'notes', 'is_active'
    ]
    const fields: string[] = []
    const params: any[] = []

    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`)
        params.push(body[key])
      }
    }
    if (fields.length === 0) return c.json({ success: false, error: '변경할 항목이 없습니다.' }, 400)

    fields.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    await c.env.DB.prepare(
      `UPDATE loans SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...params).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/cashFlow.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// 금리 변경
// ============================================================================

cashFlowRouter.post('/loans/:id/rate-change', requireRole('ADMIN'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const body = await c.req.json<{ effective_date: string; rate: number; notes?: string }>()

    if (!body.effective_date || body.rate === undefined) {
      return c.json({ success: false, error: '적용일과 금리를 입력해주세요.' }, 400)
    }

    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO loan_rate_history (loan_id, effective_date, rate, changed_by, notes)
        VALUES (?, ?, ?, ?, ?)
      `).bind(id, body.effective_date, body.rate, user?.id || null, body.notes || null),
      c.env.DB.prepare(
        'UPDATE loans SET current_rate = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(body.rate, id)
    ])

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/cashFlow.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

cashFlowRouter.get('/loans/:id/rate-history', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const { results } = await c.env.DB.prepare(`
      SELECT lrh.*, u.name as changed_by_name
      FROM loan_rate_history lrh
      LEFT JOIN users u ON lrh.changed_by = u.id
      WHERE lrh.loan_id = ?
      ORDER BY lrh.effective_date DESC
    `).bind(id).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/cashFlow.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// 상환 스케줄
// ============================================================================

cashFlowRouter.get('/loans/:id/schedule', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')

    // 기존 스케줄 조회
    const { results } = await c.env.DB.prepare(`
      SELECT id, loan_id, payment_number, scheduled_date, principal_amount, interest_amount, total_amount, actual_paid_amount, actual_paid_date, status, notes, created_at FROM loan_payments WHERE loan_id = ? ORDER BY payment_number
    `).bind(id).all()

    // 대출 정보도 함께
    const loan = await c.env.DB.prepare('SELECT id, loan_number, creditor, description, original_amount, current_balance, rate_type, current_rate, repayment_type, start_date, maturity_date, monthly_payment_day, monthly_payment_amount, notes, is_active, created_at FROM loans WHERE id = ?').bind(id).first()

    return c.json({ success: true, data: { loan, payments: results } })
  } catch (error) {
    console.error('src/routes/cashFlow.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 상환 스케줄 자동 생성
cashFlowRouter.post('/loans/:id/generate-schedule', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const loan = await c.env.DB.prepare('SELECT id, start_date, maturity_date, current_rate, current_balance, monthly_payment_day, repayment_type FROM loans WHERE id = ?').bind(id).first<{
      start_date: string; maturity_date: string; current_rate: number;
      current_balance: number; monthly_payment_day: number | null;
      repayment_type: string
    }>()
    if (!loan) return c.json({ success: false, error: '대출을 찾을 수 없습니다.' }, 404)

    // 기존 SCHEDULED 스케줄 삭제 (PAID는 유지)
    await c.env.DB.prepare(
      "DELETE FROM loan_payments WHERE loan_id = ? AND status = 'SCHEDULED'"
    ).bind(id).run()

    const startDate = new Date(loan.start_date)
    const endDate = new Date(loan.maturity_date)
    const monthlyRate = loan.current_rate / 100 / 12
    let balance = loan.current_balance
    const payDay = loan.monthly_payment_day || 1

    // 이미 납부된 회차 수
    const { count } = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM loan_payments WHERE loan_id = ? AND status = 'PAID'"
    ).bind(id).first<{ count: number }>() ?? { count: 0 }
    let paymentNumber = (count || 0) + 1

    // 남은 개월 수 계산
    const totalMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      (endDate.getMonth() - startDate.getMonth())
    const remainingMonths = totalMonths - (paymentNumber - 1)
    if (remainingMonths <= 0) return c.json({ success: true, data: { generated: 0 } })

    const stmts = []
    for (let i = 0; i < remainingMonths && balance > 0; i++) {
      const payDate = new Date(startDate)
      payDate.setMonth(payDate.getMonth() + paymentNumber - 1 + i)
      payDate.setDate(Math.min(payDay, new Date(payDate.getFullYear(), payDate.getMonth() + 1, 0).getDate()))
      const dateStr = payDate.toISOString().slice(0, 10)

      let principal = 0, interest = 0, total = 0

      if (loan.repayment_type === 'EQUAL_PRINCIPAL') {
        principal = Math.round(balance / (remainingMonths - i))
        interest = Math.round(balance * monthlyRate)
        total = principal + interest
      } else if (loan.repayment_type === 'EQUAL_INSTALLMENT') {
        if (monthlyRate > 0) {
          total = Math.round(balance * monthlyRate * Math.pow(1 + monthlyRate, remainingMonths - i) /
            (Math.pow(1 + monthlyRate, remainingMonths - i) - 1))
        } else {
          total = Math.round(balance / (remainingMonths - i))
        }
        interest = Math.round(balance * monthlyRate)
        principal = total - interest
      } else if (loan.repayment_type === 'INTEREST_ONLY') {
        interest = Math.round(balance * monthlyRate)
        principal = (i === remainingMonths - 1) ? balance : 0
        total = principal + interest
      } else { // BULLET
        interest = Math.round(balance * monthlyRate)
        principal = (i === remainingMonths - 1) ? balance : 0
        total = principal + interest
      }

      if (principal > balance) principal = balance
      total = principal + interest

      stmts.push(
        c.env.DB.prepare(`
          INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, principal_amount, interest_amount, total_amount)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(id, paymentNumber + i, dateStr, principal, interest, total)
      )

      balance -= principal
    }

    if (stmts.length > 0) await c.env.DB.batch(stmts)

    return c.json({ success: true, data: { generated: stmts.length } })
  } catch (error) {
    console.error('src/routes/cashFlow.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 상환 실행
cashFlowRouter.post('/loans/:id/payments/:pid/pay', requireRole('ADMIN'), async (c) => {
  try {
    const { id, pid } = c.req.param()
    const body = await c.req.json<{ actual_paid_amount: number; actual_paid_date: string; notes?: string }>()

    const payment = await c.env.DB.prepare(
      'SELECT id, loan_id, payment_number, total_amount, principal_amount FROM loan_payments WHERE id = ? AND loan_id = ?'
    ).bind(pid, id).first<{ total_amount: number; principal_amount: number }>()
    if (!payment) return c.json({ success: false, error: '상환 스케줄을 찾을 수 없습니다.' }, 404)

    const status = body.actual_paid_amount >= payment.total_amount ? 'PAID' : 'PARTIAL'

    await c.env.DB.batch([
      c.env.DB.prepare(`
        UPDATE loan_payments SET actual_paid_amount = ?, actual_paid_date = ?, status = ?, notes = ?
        WHERE id = ?
      `).bind(body.actual_paid_amount, body.actual_paid_date, status, body.notes || null, pid),
      c.env.DB.prepare(`
        UPDATE loans SET current_balance = current_balance - ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(Math.min(body.actual_paid_amount, payment.principal_amount), id)
    ])

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/cashFlow.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// 캐시플로 프로젝션
// ============================================================================

cashFlowRouter.get('/projection', requireRole('ADMIN'), async (c) => {
  try {
    const { months = '6' } = c.req.query()
    const monthCount = Math.min(Number(months) || 6, 12)
    const efOrders = entityFilter(c)
    const efPayments = entityFilter(c)

    const now = new Date()
    const projections: {
      month: string; income: number; fixed_expenses: number; loan_payments: number;
      purchase_expenses: number; total_expenses: number; net_cash_flow: number; cumulative?: number
    }[] = []

    for (let i = 0; i < monthCount; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const monthStart = yearMonth + '-01'
      const monthEnd = yearMonth + '-' + new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()

      // 매출 (주문 금액)
      const revenue = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(final_amount), 0) as total
        FROM orders
        WHERE status NOT IN ('CANCELLED', 'DRAFT')
          AND DATE(created_at) BETWEEN ? AND ?${efOrders.clause}
      `).bind(monthStart, monthEnd, ...efOrders.params).first<{ total: number }>()

      // 입금 (결제)
      const payments = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM payments WHERE payment_date BETWEEN ? AND ?${efPayments.clause}
      `).bind(monthStart, monthEnd, ...efPayments.params).first<{ total: number }>()

      // 고정비
      const fixedExp = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM fixed_expenses
        WHERE is_active = 1
          AND start_date <= ?
          AND (end_date IS NULL OR end_date >= ?)
          AND (
            frequency = 'MONTHLY'
            OR (frequency = 'QUARTERLY' AND (CAST(strftime('%m', ?) AS INTEGER) - CAST(strftime('%m', start_date) AS INTEGER)) % 3 = 0)
            OR (frequency = 'YEARLY' AND strftime('%m', ?) = strftime('%m', start_date))
          )
      `).bind(monthEnd, monthStart, monthStart, monthStart).first<{ total: number }>()

      // 대출 상환
      const loanPay = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(total_amount), 0) as total
        FROM loan_payments
        WHERE scheduled_date BETWEEN ? AND ?
          AND status IN ('SCHEDULED', 'OVERDUE')
      `).bind(monthStart, monthEnd).first<{ total: number }>()

      // 구매 (발주)
      const efPurchase = entityFilter(c)
      const purchaseExp = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(final_amount), 0) as total
        FROM purchase_orders
        WHERE status NOT IN ('CANCELLED', 'DRAFT')
          AND order_date BETWEEN ? AND ?${efPurchase.clause}
      `).bind(monthStart, monthEnd, ...efPurchase.params).first<{ total: number }>()

      const income = (i === 0) ? (payments?.total || 0) : (revenue?.total || 0)
      const expenses = (fixedExp?.total || 0) + (loanPay?.total || 0) + (purchaseExp?.total || 0)
      const net = income - expenses

      projections.push({
        month: yearMonth,
        income: Math.round(income),
        fixed_expenses: Math.round(fixedExp?.total || 0),
        loan_payments: Math.round(loanPay?.total || 0),
        purchase_expenses: Math.round(purchaseExp?.total || 0),
        total_expenses: Math.round(expenses),
        net_cash_flow: Math.round(net),
      })
    }

    // 누적 계산
    let cumulative = 0
    for (const p of projections) {
      cumulative += p.net_cash_flow
      p.cumulative = cumulative
    }

    return c.json({ success: true, data: projections })
  } catch (error) {
    console.error('src/routes/cashFlow.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// 캘린더 데이터
// ============================================================================

cashFlowRouter.get('/calendar', requireRole('ADMIN'), async (c) => {
  try {
    const { year, month } = c.req.query()
    if (!year || !month) return c.json({ success: false, error: 'year, month 파라미터 필요' }, 400)

    const y = Number(year), m = Number(month)
    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const monthEnd = `${y}-${String(m).padStart(2, '0')}-${lastDay}`

    // 고정비 (해당 월에 활성인 것)
    const { results: fixedItems } = await c.env.DB.prepare(`
      SELECT name, category, amount, payment_day, frequency
      FROM fixed_expenses
      WHERE is_active = 1 AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)
    `).bind(monthEnd, monthStart).all<{
      name: string; category: string; amount: number; payment_day: number;
      frequency: string; start_date?: string
    }>()

    // 대출 상환
    const { results: loanItems } = await c.env.DB.prepare(`
      SELECT lp.scheduled_date, lp.total_amount, lp.status, l.creditor
      FROM loan_payments lp
      JOIN loans l ON lp.loan_id = l.id
      WHERE lp.scheduled_date BETWEEN ? AND ?
    `).bind(monthStart, monthEnd).all<{
      scheduled_date: string; total_amount: number; status: string; creditor: string
    }>()

    // 주문 매출 (delivery_date 또는 created_at 기준)
    const efCalOrders = entityFilter(c)
    const efCalPayments = entityFilter(c)
    const { results: orderItems } = await c.env.DB.prepare(`
      SELECT DATE(COALESCE(delivery_date, created_at)) as order_date,
             SUM(final_amount) as total, COUNT(*) as cnt
      FROM orders
      WHERE status NOT IN ('CANCELLED', 'DRAFT')
        AND DATE(COALESCE(delivery_date, created_at)) BETWEEN ? AND ?${efCalOrders.clause}
      GROUP BY order_date
    `).bind(monthStart, monthEnd, ...efCalOrders.params).all<{
      order_date: string; total: number; cnt: number
    }>()

    // 입금
    const { results: paymentItems } = await c.env.DB.prepare(`
      SELECT payment_date, SUM(amount) as total, COUNT(*) as cnt
      FROM payments WHERE payment_date BETWEEN ? AND ?${efCalPayments.clause}
      GROUP BY payment_date
    `).bind(monthStart, monthEnd, ...efCalPayments.params).all<{
      payment_date: string; total: number; cnt: number
    }>()

    // 일별 데이터 조합
    const days: Record<string, { type: string; name: string; amount: number; category?: string; status?: string }[]> = {}
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      days[dateStr] = []
    }

    // 고정비 배치
    for (const fe of fixedItems) {
      if (fe.frequency === 'QUARTERLY') {
        const startMonth = Number(fe.start_date?.split('-')[1] || '1')
        if ((m - startMonth) % 3 !== 0) continue
      }
      if (fe.frequency === 'YEARLY') {
        const startMonth = Number(fe.start_date?.split('-')[1] || '1')
        if (m !== startMonth) continue
      }
      const day = Math.min(fe.payment_day || 1, lastDay)
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      if (days[dateStr]) {
        days[dateStr].push({ type: 'EXPENSE', name: fe.name, amount: fe.amount, category: fe.category })
      }
    }

    // 대출 상환 배치
    for (const lp of loanItems) {
      if (days[lp.scheduled_date]) {
        days[lp.scheduled_date].push({
          type: 'LOAN', name: lp.creditor + ' 상환', amount: lp.total_amount, status: lp.status
        })
      }
    }

    // 매출 배치
    for (const o of orderItems) {
      if (days[o.order_date]) {
        days[o.order_date].push({ type: 'REVENUE', name: `주문 ${o.cnt}건`, amount: o.total })
      }
    }

    // 입금 배치
    for (const p of paymentItems) {
      if (days[p.payment_date]) {
        days[p.payment_date].push({ type: 'INCOME', name: `입금 ${p.cnt}건`, amount: p.total })
      }
    }

    return c.json({ success: true, data: { year: y, month: m, days } })
  } catch (error) {
    console.error('src/routes/cashFlow.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// 요약 통계
// ============================================================================

cashFlowRouter.get('/summary', requireRole('ADMIN'), async (c) => {
  try {
    const now = new Date()
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthStart = yearMonth + '-01'
    const monthEnd = yearMonth + '-' + new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

    const efSummary = entityFilter(c)
    const [incomeResult, fixedResult, loanResult, loanSummary] = await Promise.all([
      c.env.DB.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM payments
        WHERE payment_date BETWEEN ? AND ?${efSummary.clause}
      `).bind(monthStart, monthEnd, ...efSummary.params).first<{ total: number }>(),
      c.env.DB.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM fixed_expenses
        WHERE is_active = 1 AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)
          AND frequency = 'MONTHLY'
      `).bind(monthEnd, monthStart).first<{ total: number }>(),
      c.env.DB.prepare(`
        SELECT COALESCE(SUM(total_amount), 0) as total FROM loan_payments
        WHERE scheduled_date BETWEEN ? AND ? AND status IN ('SCHEDULED','OVERDUE')
      `).bind(monthStart, monthEnd).first<{ total: number }>(),
      c.env.DB.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(current_balance), 0) as total_balance
        FROM loans WHERE is_active = 1
      `).first<{ count: number; total_balance: number }>()
    ])

    return c.json({
      success: true,
      data: {
        month: yearMonth,
        income: Math.round(incomeResult?.total || 0),
        fixed_expenses: Math.round(fixedResult?.total || 0),
        loan_payments: Math.round(loanResult?.total || 0),
        active_loans: loanSummary?.count || 0,
        total_loan_balance: Math.round(loanSummary?.total_balance || 0),
      }
    })
  } catch (error) {
    console.error('src/routes/cashFlow.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default cashFlowRouter
