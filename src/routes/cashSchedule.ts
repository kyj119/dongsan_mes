// 자금계획 (Cash Schedule) — cashFlow.ts와 분리된 라우터
// 같은 /api/cash-flow prefix에 mount되어 사용됨
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { requirePagePermission } from '../middleware/permissions'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { buildCashflowDays } from '../utils/cashflowEngine'

interface DailyAggRow {
  schedule_date: string
  flow_type: string
  status: string
  total_amount: number | string
  cnt: number
}

interface ScheduleItemRow {
  id: number
  schedule_date: string
  flow_type: string
  source_type: string
  amount: number | string
  description: string | null
  status: string
  client_id: number | null
  client_name: string | null
}

interface BilledOrderRow {
  id: number
  client_id: number | null
  billed_amount: number
  billed_at: string
  order_number: string
  payment_days: number
  client_name: string | null
}

interface ConfirmedPORow {
  id: number
  supplier_id: number | null
  final_amount: number
  po_number: string
  created_at: string
  delivery_date: string | null
  supplier_name: string | null
  payment_days: number
}

interface ForecastDay {
  date: string
  in_amount: number
  out_amount: number
  net: number
  balance: number
  is_negative: boolean
}

const cashScheduleRouter = new Hono<HonoEnv>()
cashScheduleRouter.use('/*', authMiddleware, requirePagePermission('/cash-schedule'))

// ============================================================================
// 자금 예정 (Cash Schedule)
// ============================================================================

// 예정 목록 (기간별)
cashScheduleRouter.get('/schedule', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { from, to, status, flow_type, source_type } = c.req.query()
    if (!from || !to) return c.json({ success: false, error: 'from, to 파라미터 필요' }, 400)

    const ef = entityFilter(c, 'cs')
    const clauses: string[] = ['cs.schedule_date BETWEEN ? AND ?']
    const params: any[] = [from, to]
    if (ef.params.length) { clauses.push('cs.entity_id = ?'); params.push(...ef.params) }
    if (status) { clauses.push('cs.status = ?'); params.push(status) }
    if (flow_type) { clauses.push('cs.flow_type = ?'); params.push(flow_type) }
    if (source_type) { clauses.push('cs.source_type = ?'); params.push(source_type) }

    const { results } = await c.env.DB.prepare(`
      SELECT cs.*, c.client_name, c.client_code
      FROM cash_schedule cs
      LEFT JOIN clients c ON c.id = cs.client_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY cs.schedule_date ASC, cs.flow_type DESC
    `).bind(...params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('cashSchedule list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 캘린더 (월간)
cashScheduleRouter.get('/schedule/calendar', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { year, month } = c.req.query()
    if (!year || !month) return c.json({ success: false, error: 'year, month 파라미터 필요' }, 400)

    const y = Number(year), m = Number(month)
    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const efDaily = entityFilter(c)
    const { results: daily } = await c.env.DB.prepare(`
      SELECT schedule_date, flow_type, status,
        SUM(amount) as total_amount,
        COUNT(*) as cnt
      FROM cash_schedule
      WHERE schedule_date BETWEEN ? AND ?${efDaily.clause}
      GROUP BY schedule_date, flow_type, status
      ORDER BY schedule_date
    `).bind(monthStart, monthEnd, ...efDaily.params).all<DailyAggRow>()

    const efItems = entityFilter(c, 'cs')
    const { results: items } = await c.env.DB.prepare(`
      SELECT cs.id, cs.schedule_date, cs.flow_type, cs.source_type,
        cs.amount, cs.description, cs.status, cs.client_id,
        c.client_name
      FROM cash_schedule cs
      LEFT JOIN clients c ON c.id = cs.client_id
      WHERE cs.schedule_date BETWEEN ? AND ?${efItems.clause}
      ORDER BY cs.schedule_date, cs.flow_type DESC
    `).bind(monthStart, monthEnd, ...efItems.params).all<ScheduleItemRow>()

    interface DayBucket { date: string; in_total: number; out_total: number; in_done: number; out_done: number; items: ScheduleItemRow[] }
    const days: Record<string, DayBucket> = {}
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      days[dateStr] = { date: dateStr, in_total: 0, out_total: 0, in_done: 0, out_done: 0, items: [] }
    }
    for (const row of daily) {
      const day = days[row.schedule_date]
      if (!day) continue
      if (row.flow_type === 'IN') {
        day.in_total += Number(row.total_amount) || 0
        if (row.status === 'DONE') day.in_done += Number(row.total_amount) || 0
      } else {
        day.out_total += Number(row.total_amount) || 0
        if (row.status === 'DONE') day.out_done += Number(row.total_amount) || 0
      }
    }
    for (const item of items) {
      const day = days[item.schedule_date]
      if (day) day.items.push(item)
    }

    const summary = {
      in_total: Object.values(days).reduce((s, d) => s + d.in_total, 0),
      out_total: Object.values(days).reduce((s, d) => s + d.out_total, 0),
      in_done: Object.values(days).reduce((s, d) => s + d.in_done, 0),
      out_done: Object.values(days).reduce((s, d) => s + d.out_done, 0),
    }

    return c.json({ success: true, data: { year: y, month: m, days, summary } })
  } catch (error) {
    console.error('cashSchedule calendar error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 특정 날짜 상세
cashScheduleRouter.get('/schedule/day/:date', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const date = c.req.param('date')
    const efDay = entityFilter(c, 'cs')
    const { results } = await c.env.DB.prepare(`
      SELECT cs.*, c.client_name, c.client_code
      FROM cash_schedule cs
      LEFT JOIN clients c ON c.id = cs.client_id
      WHERE cs.schedule_date = ?${efDay.clause}
      ORDER BY cs.flow_type DESC, cs.amount DESC
    `).bind(date, ...efDay.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('cashSchedule day error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 수동 등록
cashScheduleRouter.post('/schedule', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json<{
      schedule_date?: string; flow_type?: string; source_type?: string
      source_id?: number; client_id?: number; amount?: number
      description?: string; notes?: string
    }>()
    if (!body.schedule_date || !body.flow_type || !body.amount) {
      return c.json({ success: false, error: '필수 항목 누락' }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO cash_schedule (schedule_date, flow_type, source_type, source_id, client_id, amount, description, notes, created_by, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.schedule_date, body.flow_type, body.source_type || 'OTHER',
      body.source_id || null, body.client_id || null,
      body.amount, body.description || null, body.notes || null,
      user?.id || null, getEntityId(c)
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id }, message: '예정이 등록되었습니다.' })
  } catch (error) {
    console.error('cashSchedule insert error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 수정
cashScheduleRouter.patch('/schedule/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<Record<string, unknown>>()
    const updates: string[] = []
    const params: any[] = [] // dynamic SQL bind values

    for (const field of ['schedule_date', 'amount', 'description', 'notes', 'status', 'actual_date', 'actual_amount']) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`)
        params.push(body[field])
      }
    }
    if (updates.length === 0) return c.json({ success: false, error: '변경할 항목이 없습니다.' }, 400)

    updates.push('updated_at = CURRENT_TIMESTAMP')
    const efU = entityFilter(c)
    params.push(id, ...efU.params)

    await c.env.DB.prepare(`UPDATE cash_schedule SET ${updates.join(', ')} WHERE id = ?${efU.clause}`).bind(...params).run()
    return c.json({ success: true, message: '수정되었습니다.' })
  } catch (error) {
    console.error('cashSchedule update error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 삭제
cashScheduleRouter.delete('/schedule/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const efDel = entityFilter(c)
    await c.env.DB.prepare(`DELETE FROM cash_schedule WHERE id = ?${efDel.clause}`).bind(id, ...efDel.params).run()
    return c.json({ success: true, message: '삭제되었습니다.' })
  } catch (error) {
    console.error('cashSchedule delete error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 완료 처리
cashScheduleRouter.patch('/schedule/:id/complete', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const { actual_date, actual_amount } = await c.req.json() as { actual_date: string, actual_amount: number }
    if (!actual_date || actual_amount === undefined) {
      return c.json({ success: false, error: 'actual_date, actual_amount 필요' }, 400)
    }

    const efComplete = entityFilter(c)
    await c.env.DB.prepare(`
      UPDATE cash_schedule SET status = 'DONE', actual_date = ?, actual_amount = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?${efComplete.clause}
    `).bind(actual_date, actual_amount, id, ...efComplete.params).run()

    return c.json({ success: true, message: '완료 처리되었습니다.' })
  } catch (error) {
    console.error('cashSchedule complete error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 자동 생성 — 청구 완료 주문 + 발주 + 고정비
cashScheduleRouter.post('/schedule/auto-generate', requireRole('ADMIN'), async (c) => {
  try {
    const user = c.get('user')
    let inserted = 0

    const batchStmts: D1PreparedStatement[] = []

    const ef = entityFilter(c, 'o')

    // 1. 청구 완료된 주문 → 입금 예정 (LIMIT 500 안전장치)
    const { results: billedOrders } = await c.env.DB.prepare(`
      SELECT o.id, o.client_id, o.billed_amount, o.billed_at, o.order_number,
        COALESCE(c.payment_terms_days, 30) as payment_days,
        c.client_name
      FROM orders o
      LEFT JOIN clients c ON c.id = o.client_id
      WHERE o.billing_status = 'BILLED' AND o.billed_at IS NOT NULL${ef.clause}
        AND NOT EXISTS (
          SELECT 1 FROM cash_schedule cs
          WHERE cs.source_type = 'ORDER' AND cs.source_id = o.id
        )
      LIMIT 500
    `).bind(...ef.params).all<BilledOrderRow>()

    for (const order of billedOrders) {
      const billedDate = new Date(order.billed_at)
      const dueDate = new Date(billedDate.getTime() + (order.payment_days || 30) * 86400000)
      const dueDateStr = dueDate.toISOString().substring(0, 10)

      batchStmts.push(
        c.env.DB.prepare(`
          INSERT INTO cash_schedule (schedule_date, flow_type, source_type, source_id, client_id, amount, description, created_by, entity_id)
          VALUES (?, 'IN', 'ORDER', ?, ?, ?, ?, ?, ?)
        `).bind(
          dueDateStr, order.id, order.client_id,
          order.billed_amount,
          `${order.client_name || ''} 입금예정 (주문 ${order.order_number})`,
          user?.id || null, getEntityId(c)
        )
      )
      inserted++
    }

    // 2. 발주 → 지급 예정 (LIMIT 500 안전장치)
    const { results: confirmedPOs } = await c.env.DB.prepare(`
      SELECT po.id, po.supplier_id, po.final_amount, po.po_number, po.created_at, po.delivery_date,
        s.client_name as supplier_name,
        COALESCE(s.payment_terms_days, 30) as payment_days
      FROM purchase_orders po
      LEFT JOIN clients s ON s.id = po.supplier_id
      WHERE po.status IN ('CONFIRMED', 'RECEIVED', 'PARTIAL_RECEIVED')${entityFilter(c, 'po').clause}
        AND NOT EXISTS (
          SELECT 1 FROM cash_schedule cs
          WHERE cs.source_type = 'PURCHASE' AND cs.source_id = po.id
        )
      LIMIT 500
    `).bind(...entityFilter(c, 'po').params).all<ConfirmedPORow>()

    for (const po of confirmedPOs) {
      const baseDate = po.delivery_date || po.created_at
      const dueDate = new Date(new Date(baseDate).getTime() + (po.payment_days || 30) * 86400000)
      const dueDateStr = dueDate.toISOString().substring(0, 10)

      batchStmts.push(
        c.env.DB.prepare(`
          INSERT INTO cash_schedule (schedule_date, flow_type, source_type, source_id, client_id, amount, description, created_by, entity_id)
          VALUES (?, 'OUT', 'PURCHASE', ?, ?, ?, ?, ?, ?)
        `).bind(
          dueDateStr, po.id, po.supplier_id,
          po.final_amount,
          `${po.supplier_name || '공급사'} 지급예정 (발주 ${po.po_number})`,
          user?.id || null, getEntityId(c)
        )
      )
      inserted++
    }

    // 3. 고정비 → 온더플라이로 처리 (cash_schedule에 물질화하지 않음).
    //    하이브리드 경계: 고정비는 fixed_expenses 마스터에서 예측 시점에 합성 (cashflowEngine.buildCashflowDays).
    //    여기서 INSERT하면 온더플라이와 이중계산되므로 의도적으로 생성하지 않음.

    // 전체 batch 원자 실행 (N+1 루프 INSERT → 단일 batch call)
    if (batchStmts.length > 0) {
      const batchResults = await c.env.DB.batch(batchStmts)
      // 실제 삽입 수 재집계 (NOT EXISTS로 스킵된 건 제외)
      inserted = batchResults.reduce((sum, r) => sum + (r.meta?.changes || 0), 0)
    }

    return c.json({ success: true, data: { inserted }, message: `${inserted}건이 자동 생성되었습니다.` })
  } catch (error) {
    console.error('cashSchedule auto-generate error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 연체 처리
cashScheduleRouter.post('/schedule/check-overdue', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const today = new Date().toISOString().substring(0, 10)
    const result = await c.env.DB.prepare(`
      UPDATE cash_schedule SET status = 'OVERDUE', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'PENDING' AND schedule_date < ?
    `).bind(today).run()

    return c.json({ success: true, data: { updated: result.meta.changes }, message: `${result.meta.changes}건이 연체로 변경되었습니다.` })
  } catch (error) {
    console.error('cashSchedule overdue error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// A2: 추정 자금 일보 — 향후 N일 잔액 예측 (하이브리드 엔진: 물질화 + 온더플라이)
cashScheduleRouter.get('/schedule/forecast', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const days = Number(c.req.query('days') || '90')
    const startBalance = Number(c.req.query('start_balance') || '0')

    const today = new Date().toISOString().substring(0, 10)
    const endDate = new Date(Date.now() + days * 86400000).toISOString().substring(0, 10)

    const dayMap = await buildCashflowDays(c, today, endDate)

    const forecast: ForecastDay[] = []
    let runningBalance = startBalance
    const todayMs = new Date(today).getTime()
    for (let i = 0; i <= days; i++) {
      const dateStr = new Date(todayMs + i * 86400000).toISOString().substring(0, 10)
      const day = dayMap[dateStr]
      const inA = day?.in || 0
      const outA = day?.out || 0
      runningBalance += inA - outA
      forecast.push({
        date: dateStr,
        in_amount: inA,
        out_amount: outA,
        net: inA - outA,
        balance: +runningBalance.toFixed(2),
        is_negative: runningBalance < 0
      })
    }

    const riskDays = forecast.filter(d => d.is_negative)

    return c.json({
      success: true,
      data: {
        start_balance: startBalance,
        end_balance: runningBalance,
        min_balance: Math.min(...forecast.map(d => d.balance)),
        max_balance: Math.max(...forecast.map(d => d.balance)),
        risk_days_count: riskDays.length,
        risk_days: riskDays.slice(0, 10),
        forecast,
      }
    })
  } catch (error) {
    console.error('cashSchedule forecast error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 월별 집계 — 캐시플로 탭의 6개월 projection 대체 (cash_schedule 단일 소스 기반)
cashScheduleRouter.get('/schedule/monthly', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const monthCount = Math.min(Number(c.req.query('months') || '6'), 12)
    const now = new Date()
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth() + monthCount, 0)
    const to = lastMonthEnd.toISOString().substring(0, 10)

    const dayMap = await buildCashflowDays(c, from, to)

    const months: { month: string; in: number; out: number; net: number; cumulative: number }[] = []
    const idx: Record<string, number> = {}
    for (let i = 0; i < monthCount; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      idx[ym] = i
      months.push({ month: ym, in: 0, out: 0, net: 0, cumulative: 0 })
    }
    for (const dateStr of Object.keys(dayMap)) {
      const i = idx[dateStr.substring(0, 7)]
      if (i === undefined) continue
      months[i].in += dayMap[dateStr].in
      months[i].out += dayMap[dateStr].out
    }
    let cumulative = 0
    for (const m of months) {
      m.in = Math.round(m.in)
      m.out = Math.round(m.out)
      m.net = m.in - m.out
      cumulative += m.net
      m.cumulative = cumulative
    }

    return c.json({ success: true, data: months })
  } catch (error) {
    console.error('cashSchedule monthly error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 은행 실잔액 합계 — 추정자금일보 시작잔액 자동 주입용 (Phase 4 연결)
// bank_accounts에 잔액 컬럼이 없어 계좌별 최신 bank_transactions.balance_after 합산
cashScheduleRouter.get('/schedule/bank-balance', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const ef = entityFilter(c, 'ba')
    const row = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(latest.balance_after), 0) AS total_balance,
             COUNT(latest.bank_account_id) AS account_count
      FROM bank_accounts ba
      JOIN (
        SELECT bt1.bank_account_id, bt1.balance_after
        FROM bank_transactions bt1
        WHERE bt1.id = (
          SELECT MAX(bt2.id) FROM bank_transactions bt2
          WHERE bt2.bank_account_id = bt1.bank_account_id
        )
      ) latest ON latest.bank_account_id = ba.id
      WHERE ba.is_active = 1${ef.clause}
    `).bind(...ef.params).first<{ total_balance: number; account_count: number }>()
    return c.json({ success: true, data: { total_balance: row?.total_balance || 0, account_count: row?.account_count || 0 } })
  } catch (error) {
    console.error('cashSchedule bank-balance error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default cashScheduleRouter
