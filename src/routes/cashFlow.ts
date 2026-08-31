import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { requireAccessOrRole } from '../middleware/permissions'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { kstYm, kstDate } from '../utils/kstDate'

const cashFlowRouter = new Hono<HonoEnv>()
cashFlowRouter.use('/*', authMiddleware)

// ============================================================================
// 고정비 CRUD
// ============================================================================

cashFlowRouter.get('/fixed-expenses', requireAccessOrRole('/cash-schedule', 'MANAGER'), async (c) => {
  try {
    const { category = '', active = '1' } = c.req.query()
    const clauses: string[] = ['1=1']
    const params: any[] = []
    const ef = entityFilter(c, 'fe')
    if (ef.clause) { clauses.push(ef.clause.replace(' AND ', '')); params.push(...ef.params) }

    if (category) {
      clauses.push('fe.category = ?')
      params.push(category)
    }
    if (active) {
      clauses.push('fe.is_active = ?')
      params.push(Number(active))
    }

    const where = 'WHERE ' + clauses.join(' AND ')
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
      INSERT INTO fixed_expenses (name, category, amount, frequency, payment_day, start_date, end_date, counterpart_name, notes, created_by, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.name, body.category, body.amount, body.frequency || 'MONTHLY',
      body.payment_day || 1, body.start_date, body.end_date || null,
      body.counterpart_name || null, body.notes || null, user?.id || null,
      getEntityId(c)
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

    // #314: 컬럼 allowlist — 클라이언트 키를 컬럼명으로 직접 사용하던 SQL injection 차단
    const ALLOWED_FIELDS = ['name', 'category', 'amount', 'frequency', 'payment_day', 'start_date', 'end_date', 'counterpart_name', 'notes', 'is_active']
    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED_FIELDS.includes(key)) continue
      if (value !== undefined) {
        fields.push(`${key} = ?`)
        params.push(value)
      }
    }
    if (fields.length === 0) return c.json({ success: false, error: '변경할 항목이 없습니다.' }, 400)

    fields.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    const ef = entityFilter(c)
    await c.env.DB.prepare(
      `UPDATE fixed_expenses SET ${fields.join(', ')} WHERE id = ?${ef.clause}`
    ).bind(...params, ...ef.params).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/cashFlow.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

cashFlowRouter.delete('/fixed-expenses/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c)
    // #554: 비활성화 시 end_date를 오늘로 마감(미설정 시). 부문손익(/pnl)이 is_active(현재상태) 대신
    //   기간중첩(start~end)으로 과거 자재비/고정비를 재현성 있게 조회하려면 종료시점이 기록돼야 함.
    await c.env.DB.prepare(
      `UPDATE fixed_expenses SET is_active = 0, end_date = COALESCE(end_date, ${kstDate()}), updated_at = CURRENT_TIMESTAMP WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/cashFlow.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// 대출 CRUD
// ============================================================================

cashFlowRouter.get('/loans', requireAccessOrRole('/cash-schedule', 'MANAGER'), async (c) => {
  try {
    const { active = '1' } = c.req.query()
    const clauses: string[] = []
    const params: any[] = []
    const ef = entityFilter(c, 'l')
    if (ef.clause) { clauses.push(ef.clause.replace(' AND ', '')); params.push(...ef.params) }
    if (active) { clauses.push('l.is_active = ?'); params.push(Number(active)) }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''

    const { results } = await c.env.DB.prepare(`
      SELECT l.*,
        u.name as created_by_name,
        (SELECT COUNT(*) FROM loan_payments lp WHERE lp.loan_id = l.id AND lp.status = 'SCHEDULED') as pending_payments,
        (SELECT COUNT(*) FROM loan_payments lp WHERE lp.loan_id = l.id AND lp.status = 'OVERDUE') as overdue_payments,
        -- G1 역참조: 이 부채로 취득한 자산(담보/리스 대상). 만기 도래 시 함께 점검하기 위한 것
        (SELECT GROUP_CONCAT(fa.name, ' · ') FROM fixed_assets fa WHERE fa.loan_id = l.id AND fa.status <> 'DISPOSED') as linked_assets,
        (SELECT COALESCE(SUM(fa.current_book_value), 0) FROM fixed_assets fa WHERE fa.loan_id = l.id AND fa.status <> 'DISPOSED') as linked_book_value
      FROM loans l
      LEFT JOIN users u ON l.created_by = u.id
      ${where}
      ORDER BY l.is_active DESC, l.creditor, l.id
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
        monthly_payment_day, monthly_payment_amount, notes, created_by, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.loan_number || null, body.creditor, body.description || null,
      body.original_amount, body.current_balance ?? body.original_amount,
      body.rate_type || 'FIXED', body.current_rate || 0,
      body.repayment_type || 'EQUAL_INSTALLMENT',
      body.start_date, body.maturity_date,
      body.monthly_payment_day || 1, body.monthly_payment_amount || 0,
      body.notes || null, user?.id || null,
      getEntityId(c)
    ).run()

    // 초기 금리 이력 기록
    if (body.current_rate) {
      await c.env.DB.prepare(`
        INSERT INTO loan_rate_history (loan_id, effective_date, rate, changed_by, notes, entity_id)
        VALUES (?, ?, ?, ?, '초기 설정', ?)
      `).bind(result.meta.last_row_id, body.start_date, body.current_rate, user?.id || null, getEntityId(c) || 1).run()
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
      'monthly_payment_day', 'monthly_payment_amount', 'notes', 'is_active', 'maturity_confirmed'
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

    const ef = entityFilter(c)
    await c.env.DB.prepare(
      `UPDATE loans SET ${fields.join(', ')} WHERE id = ?${ef.clause}`
    ).bind(...params, ...ef.params).run()

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

    const ef = entityFilter(c)
    const ownLoan = await c.env.DB.prepare(`SELECT id FROM loans WHERE id = ?${ef.clause}`).bind(id, ...ef.params).first()
    if (!ownLoan) return c.json({ success: false, error: '대출을 찾을 수 없습니다.' }, 404)

    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO loan_rate_history (loan_id, effective_date, rate, changed_by, notes, entity_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(id, body.effective_date, body.rate, user?.id || null, body.notes || null, getEntityId(c) || 1),
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

cashFlowRouter.get('/loans/:id/rate-history', requireAccessOrRole('/cash-schedule', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c, 'lrh')
    const { results } = await c.env.DB.prepare(`
      SELECT lrh.*, u.name as changed_by_name
      FROM loan_rate_history lrh
      LEFT JOIN users u ON lrh.changed_by = u.id
      WHERE lrh.loan_id = ?${ef.clause}
      ORDER BY lrh.effective_date DESC, lrh.id DESC
    `).bind(id, ...ef.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/cashFlow.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// 상환 스케줄
// ============================================================================

cashFlowRouter.get('/loans/:id/schedule', requireAccessOrRole('/cash-schedule', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')

    const ef = entityFilter(c)
    // 기존 스케줄 조회
    const { results } = await c.env.DB.prepare(`
      SELECT id, loan_id, payment_number, scheduled_date, principal_amount, interest_amount, total_amount, actual_paid_amount, actual_paid_date, status, notes, created_at FROM loan_payments WHERE loan_id = ?${ef.clause} ORDER BY payment_number, id
    `).bind(id, ...ef.params).all()

    // 대출 정보도 함께
    const loan = await c.env.DB.prepare(`SELECT id, loan_number, creditor, description, original_amount, current_balance, rate_type, current_rate, repayment_type, start_date, maturity_date, monthly_payment_day, monthly_payment_amount, notes, is_active, maturity_confirmed, created_at FROM loans WHERE id = ?${ef.clause}`).bind(id, ...ef.params).first()

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
    const ef = entityFilter(c)
    const loan = await c.env.DB.prepare(`SELECT id, start_date, maturity_date, current_rate, current_balance, monthly_payment_day, repayment_type, maturity_confirmed, entity_id FROM loans WHERE id = ?${ef.clause}`).bind(id, ...ef.params).first<{
      start_date: string; maturity_date: string; current_rate: number;
      current_balance: number; monthly_payment_day: number | null;
      repayment_type: string; maturity_confirmed: number; entity_id: number
    }>()
    if (!loan) return c.json({ success: false, error: '대출을 찾을 수 없습니다.' }, 404)

    // 만기 미확인이면 **원금 회차를 만들지 않는다**. maturity_date 가 NOT NULL 이라
    //   만기를 모르는 차입금엔 placeholder 가 들어가는데, 아래 INTEREST_ONLY/BULLET 분기가
    //   마지막 회차에 원금 전액을 넣어 그 달에 없는 현금유출을 만든다(이관분 12.6억).
    const bulletLike = loan.repayment_type === 'INTEREST_ONLY' || loan.repayment_type === 'BULLET'
    const openEnded = loan.maturity_confirmed === 0 && bulletLike
    // 분할상환은 만기 없이는 회차수 자체가 정해지지 않는다. 조용히 12개월로 털면
    //   원금이 실제보다 훨씬 빨리 상환되는 스케줄이 나오므로 여기서 막는다.
    if (loan.maturity_confirmed === 0 && !bulletLike) {
      return c.json({ success: false, error: '만기가 확인되지 않아 원리금 스케줄을 만들 수 없습니다. 만기일을 입력한 뒤 다시 시도하세요.' }, 400)
    }

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
    // 만기 미확인 = 회차수를 만기에서 못 구한다. 당월부터 고정 지평(12개월)만큼 이자만 굴린다.
    const OPEN_HORIZON_MONTHS = 12
    const openBase = new Date(`${kstYm()}-01T00:00:00Z`)
    const remainingMonths = openEnded ? OPEN_HORIZON_MONTHS : totalMonths - (paymentNumber - 1)
    if (remainingMonths <= 0) return c.json({ success: true, data: { generated: 0 } })

    const stmts = []
    for (let i = 0; i < remainingMonths && balance > 0; i++) {
      const payDate = openEnded ? new Date(openBase) : new Date(startDate)
      payDate.setMonth(payDate.getMonth() + (openEnded ? i : paymentNumber - 1 + i))
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
      } else { // INTEREST_ONLY · BULLET — 만기에 원금 일시상환
        interest = Math.round(balance * monthlyRate)
        // 만기 미확인이면 원금 회차를 만들지 않는다. placeholder 만기에 원금을 태우면
        //   있지도 않은 현금유출이 자금예측에 잡힌다.
        principal = (!openEnded && i === remainingMonths - 1) ? balance : 0
        total = principal + interest
      }

      if (principal > balance) principal = balance
      total = principal + interest

      stmts.push(
        c.env.DB.prepare(`
          INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, principal_amount, interest_amount, total_amount, entity_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(id, paymentNumber + i, dateStr, principal, interest, total,
          // 세션 법인이 아니라 **대출이 속한 법인**으로 기록한다(#594 와 같은 함정 —
          //   전체모드에서 getEntityId 는 0 이라 `|| 1` 이 타법인 스케줄을 동산에 귀속시킨다).
          loan.entity_id || 1)
      )

      balance -= principal
    }

    if (stmts.length > 0) await c.env.DB.batch(stmts)

    return c.json({ success: true, data: { generated: stmts.length, open_ended: openEnded } })
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

    const ef = entityFilter(c)
    // ★이전 반영분(actual_paid_amount)까지 읽는다 — 이게 없으면 재호출 시 이미 반영된 걸 모른다.
    const payment = await c.env.DB.prepare(
      `SELECT id, loan_id, payment_number, total_amount, principal_amount, actual_paid_amount, status FROM loan_payments WHERE id = ? AND loan_id = ?${ef.clause}`
    ).bind(pid, id, ...ef.params).first<{ total_amount: number; principal_amount: number; actual_paid_amount: number | null; status: string | null }>()
    if (!payment) return c.json({ success: false, error: '상환 스케줄을 찾을 수 없습니다.' }, 404)

    const status = body.actual_paid_amount >= payment.total_amount ? 'PAID' : 'PARTIAL'

    // 잔액에 반영하는 값 = **원금 충당분**. 이자분은 잔액을 줄이지 않으므로 원금 상한을 씌운다.
    const principalApplied = (amt: number) => Math.min(Math.max(Number(amt) || 0, 0), payment.principal_amount)
    // ★차액만 반영한다(2026-08-31). 이 라우트는 「상환 실행」이자 「금액 정정」 입구다 —
    //   예전엔 이전 반영분을 안 봐서 **다시 부를 때마다 전액이 또 빠졌다**(되돌리는 라우트도 없다).
    //   같은 값으로 재호출하면 delta 0 → 잔액 불변(멱등). 금액을 고치면 그 차이만 움직인다.
    const prevApplied = principalApplied(payment.actual_paid_amount ?? 0)
    const nextApplied = principalApplied(body.actual_paid_amount)
    const delta = nextApplied - prevApplied

    const stmts = [
      c.env.DB.prepare(`
        UPDATE loan_payments SET actual_paid_amount = ?, actual_paid_date = ?, status = ?, notes = ?
        WHERE id = ?
      `).bind(body.actual_paid_amount, body.actual_paid_date, status, body.notes || null, pid),
    ]
    if (delta !== 0) {
      stmts.push(c.env.DB.prepare(`
        UPDATE loans SET current_balance = current_balance - ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(delta, id))
    }
    await c.env.DB.batch(stmts)

    return c.json({ success: true, data: { principal_applied: nextApplied, balance_delta: -delta, restated: prevApplied > 0 } })
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

    const nowYm = kstYm()
    const baseY = Number(nowYm.slice(0, 4))
    const baseM0 = Number(nowYm.slice(5, 7)) - 1
    const projections: {
      month: string; income: number; fixed_expenses: number; loan_payments: number;
      card_payments: number; purchase_expenses: number; total_expenses: number; net_cash_flow: number; cumulative?: number
    }[] = []

    // #341: 월 루프×6쿼리(N+1) → 월별 GROUP BY 집계로 통합 (72→6쿼리, 결과값 불변)
    const monthsList: { ym: string; monthStart: string; monthEnd: string; prevYM: string }[] = []
    for (let i = 0; i < monthCount; i++) {
      const d = new Date(baseY, baseM0 + i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const monthStart = ym + '-01'
      const monthEnd = ym + '-' + new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1)
      const prevYM = `${prev.getFullYear()}${String(prev.getMonth() + 1).padStart(2, '0')}`
      monthsList.push({ ym, monthStart, monthEnd, prevYM })
    }
    const rangeStart = monthsList[0].monthStart
    const rangeEnd = monthsList[monthsList.length - 1].monthEnd

    const buildMap = (rows: any[]): Map<string, number> => {
      const m = new Map<string, number>()
      for (const r of rows || []) m.set(String(r.ym), Number(r.total) || 0)
      return m
    }

    // 매출 (주문) — 월별 집계
    const { results: revRows } = await c.env.DB.prepare(`
      SELECT strftime('%Y-%m', created_at) as ym, COALESCE(SUM(final_amount), 0) as total
      FROM orders
      WHERE status NOT IN ('CANCELLED', 'DRAFT')
        AND DATE(created_at) BETWEEN ? AND ?${efOrders.clause}
      GROUP BY ym
    `).bind(rangeStart, rangeEnd, ...efOrders.params).all()
    const revMap = buildMap(revRows)

    // 입금 (결제) — 월별 집계
    const { results: payRows } = await c.env.DB.prepare(`
      SELECT strftime('%Y-%m', payment_date) as ym, COALESCE(SUM(amount), 0) as total
      FROM payments WHERE payment_date BETWEEN ? AND ?${efPayments.clause}
      GROUP BY ym
    `).bind(rangeStart, rangeEnd, ...efPayments.params).all()
    const payMap = buildMap(payRows)

    // 대출 상환 — 월별 집계
    const efLoan = entityFilter(c)
    const { results: loanRows } = await c.env.DB.prepare(`
      SELECT strftime('%Y-%m', lp.scheduled_date) as ym, COALESCE(SUM(lp.total_amount), 0) as total
      FROM loan_payments lp
      JOIN loans l ON lp.loan_id = l.id
      WHERE lp.scheduled_date BETWEEN ? AND ?
        AND lp.status IN ('SCHEDULED', 'OVERDUE')${efLoan.clause.replace('entity_id', 'l.entity_id')}
      GROUP BY ym
    `).bind(rangeStart, rangeEnd, ...efLoan.params).all()
    const loanMap = buildMap(loanRows)

    // 구매 (발주) — 월별 집계
    const efPurchase = entityFilter(c)
    const { results: purRows } = await c.env.DB.prepare(`
      SELECT strftime('%Y-%m', order_date) as ym, COALESCE(SUM(final_amount), 0) as total
      FROM purchase_orders
      WHERE status NOT IN ('CANCELLED', 'DRAFT')
        AND order_date BETWEEN ? AND ?${efPurchase.clause}
      GROUP BY ym
    `).bind(rangeStart, rangeEnd, ...efPurchase.params).all()
    const purMap = buildMap(purRows)

    // 카드 결제 예정 (전월 사용분) — usage월(YYYYMM) 집계 후 결제월 = usage+1
    const cardMap = new Map<string, number>() // key: usage YYYYMM
    try {
      const firstPrev = monthsList[0].prevYM
      const lastPrev = monthsList[monthsList.length - 1].prevYM
      const efCard = entityFilter(c, 'ct')
      const { results: cardRows } = await c.env.DB.prepare(`
        SELECT substr(ct.transaction_date, 1, 6) as ym,
               COALESCE(SUM(CASE WHEN ct.approval_type != 'CANCEL' THEN ct.amount ELSE 0 END), 0) as total
        FROM card_transactions ct
        WHERE substr(ct.transaction_date, 1, 6) BETWEEN ? AND ?${efCard.clause}
        GROUP BY ym
      `).bind(firstPrev, lastPrev, ...efCard.params).all()
      for (const r of cardRows || []) cardMap.set(String((r as any).ym), Number((r as any).total) || 0)
    } catch (_) { /* card_transactions 테이블 없을 수 있음 */ }

    // 고정비 — frequency 조건이 월별 가변이라 활성 행 1회 조회 후 JS 매핑
    const efFixed = entityFilter(c)
    const { results: fixedRows } = await c.env.DB.prepare(`
      SELECT amount, start_date, end_date, frequency
      FROM fixed_expenses WHERE is_active = 1${efFixed.clause}
    `).bind(...efFixed.params).all<{ amount: number; start_date: string; end_date: string | null; frequency: string }>()
    const fixedForMonth = (monthStart: string, monthEnd: string): number => {
      const msMonth = parseInt(monthStart.slice(5, 7), 10)
      let total = 0
      for (const f of fixedRows || []) {
        if (!(f.start_date <= monthEnd)) continue
        if (!(f.end_date === null || f.end_date >= monthStart)) continue
        const startMonth = parseInt(String(f.start_date).slice(5, 7), 10)
        let include = false
        if (f.frequency === 'MONTHLY') include = true
        else if (f.frequency === 'QUARTERLY') include = ((msMonth - startMonth) % 3) === 0
        else if (f.frequency === 'YEARLY') include = msMonth === startMonth
        if (include) total += Number(f.amount) || 0
      }
      return total
    }

    monthsList.forEach((mo, i) => {
      const revTotal = revMap.get(mo.ym) || 0
      const payTotal = payMap.get(mo.ym) || 0
      const fixedTotal = fixedForMonth(mo.monthStart, mo.monthEnd)
      const loanTotal = loanMap.get(mo.ym) || 0
      const purTotal = purMap.get(mo.ym) || 0
      const cardPayment = cardMap.get(mo.prevYM) || 0

      const income = (i === 0) ? payTotal : revTotal
      const expenses = fixedTotal + loanTotal + purTotal + cardPayment
      const net = income - expenses

      projections.push({
        month: mo.ym,
        income: Math.round(income),
        fixed_expenses: Math.round(fixedTotal),
        loan_payments: Math.round(loanTotal),
        purchase_expenses: Math.round(purTotal),
        card_payments: Math.round(cardPayment),
        total_expenses: Math.round(expenses),
        net_cash_flow: Math.round(net),
      })
    })

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
    const efCalFixed = entityFilter(c)
    const { results: fixedItems } = await c.env.DB.prepare(`
      SELECT name, category, amount, payment_day, frequency, start_date
      FROM fixed_expenses
      WHERE is_active = 1 AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)${efCalFixed.clause}
    `).bind(monthEnd, monthStart, ...efCalFixed.params).all<{
      name: string; category: string; amount: number; payment_day: number;
      frequency: string; start_date?: string
    }>()

    // 대출 상환
    const efCalLoan = entityFilter(c)
    const { results: loanItems } = await c.env.DB.prepare(`
      SELECT lp.scheduled_date, lp.total_amount, lp.status, l.creditor
      FROM loan_payments lp
      JOIN loans l ON lp.loan_id = l.id
      WHERE lp.scheduled_date BETWEEN ? AND ?${efCalLoan.clause.replace('entity_id', 'l.entity_id')}
    `).bind(monthStart, monthEnd, ...efCalLoan.params).all<{
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

    // 법인카드 결제 예정 — 카드사별 집계
    // 마감 주기: 전월 cutoff_day+1 ~ 당월 cutoff_day 사용분 → 당월 payment_day에 결제
    const efCards = entityFilter(c, 'cc')
    let cardPaymentItems: { card_company: string; payment_day: number; total: number }[] = []
    try {
      const { results: activeCards } = await c.env.DB.prepare(`
        SELECT cc.id, cc.card_company, cc.cutoff_day, cc.payment_day
        FROM corporate_cards cc
        WHERE cc.is_active = 1${efCards.clause}
      `).bind(...efCards.params).all<{
        id: number; card_company: string; cutoff_day: number; payment_day: number
      }>()

      // 카드별 마감 기간 내 거래액 합산
      for (const card of (activeCards || [])) {
        const cutoff = card.cutoff_day || 15
        // 마감 기간: 전월 cutoff+1 ~ 당월 cutoff
        const prevMonth = new Date(y, m - 2, 1) // m is 1-based, Date month is 0-based
        const prevY = prevMonth.getFullYear()
        const prevM = prevMonth.getMonth() + 1
        const billingStart = `${prevY}-${String(prevM).padStart(2, '0')}-${String(Math.min(cutoff + 1, 28)).padStart(2, '0')}`
        const billingEnd = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(cutoff, lastDay)).padStart(2, '0')}`

        const efTxSum = entityFilter(c)
        const txSum = await c.env.DB.prepare(`
          SELECT COALESCE(SUM(CASE WHEN approval_type != 'CANCEL' THEN amount ELSE -amount END), 0) as total
          FROM card_transactions
          WHERE card_id = ? AND transaction_date >= ? AND transaction_date <= ?${efTxSum.clause}
        `).bind(card.id, billingStart.replace(/-/g, ''), billingEnd.replace(/-/g, ''), ...efTxSum.params).first<{ total: number }>()

        if (txSum && txSum.total > 0) {
          cardPaymentItems.push({
            card_company: card.card_company,
            payment_day: card.payment_day || 15,
            total: txSum.total
          })
        }
      }
    } catch (e) {
      // cutoff_day 칼럼 미존재 시 무시
      console.error('Card payment calendar error:', e)
    }

    // 카드사별로 합산 (같은 카드사 + 같은 결제일)
    const cardByCompany: Record<string, { company: string; day: number; total: number }> = {}
    for (const cp of cardPaymentItems) {
      const k = `${cp.card_company}_${cp.payment_day}`
      if (!cardByCompany[k]) cardByCompany[k] = { company: cp.card_company, day: cp.payment_day, total: 0 }
      cardByCompany[k].total += cp.total
    }

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

    // 카드 결제 배치
    for (const k of Object.keys(cardByCompany)) {
      const cp = cardByCompany[k]
      const day = Math.min(cp.day, lastDay)
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      if (days[dateStr]) {
        days[dateStr].push({ type: 'CARD', name: `${cp.company} 결제`, amount: cp.total })
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

cashFlowRouter.get('/summary', requireAccessOrRole('/cash-schedule', 'MANAGER'), async (c) => {
  try {
    const yearMonth = kstYm()
    const smY = Number(yearMonth.slice(0, 4))
    const smM = Number(yearMonth.slice(5, 7))
    const monthStart = yearMonth + '-01'
    const monthEnd = yearMonth + '-' + new Date(smY, smM, 0).getDate()

    const efSummary = entityFilter(c)
    const efSumFixed = entityFilter(c)
    const efSumLoan = entityFilter(c)
    const efSumLoanBal = entityFilter(c)
    const [incomeResult, fixedResult, loanResult, loanSummary] = await Promise.all([
      c.env.DB.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM payments
        WHERE payment_date BETWEEN ? AND ?${efSummary.clause}
      `).bind(monthStart, monthEnd, ...efSummary.params).first<{ total: number }>(),
      c.env.DB.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM fixed_expenses
        WHERE is_active = 1 AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)
          AND frequency = 'MONTHLY'${efSumFixed.clause}
      `).bind(monthEnd, monthStart, ...efSumFixed.params).first<{ total: number }>(),
      c.env.DB.prepare(`
        SELECT COALESCE(SUM(lp.total_amount), 0) as total FROM loan_payments lp
        JOIN loans l ON lp.loan_id = l.id
        WHERE lp.scheduled_date BETWEEN ? AND ? AND lp.status IN ('SCHEDULED','OVERDUE')${efSumLoan.clause.replace('entity_id', 'l.entity_id')}
      `).bind(monthStart, monthEnd, ...efSumLoan.params).first<{ total: number }>(),
      c.env.DB.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(current_balance), 0) as total_balance
        FROM loans WHERE is_active = 1${efSumLoanBal.clause}
      `).bind(...efSumLoanBal.params).first<{ count: number; total_balance: number }>()
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
