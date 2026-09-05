// 자금계획 (Cash Schedule) — cashFlow.ts와 분리된 라우터
// 같은 /api/cash-flow prefix에 mount되어 사용됨
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { requireEditOrRole } from '../middleware/permissions'
import { requirePagePermission } from '../middleware/permissions'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { buildCashflowDays, type CashflowItem } from '../utils/cashflowEngine'
import { computeExpectedPaymentDate } from '../utils/paymentSchedule'
import { kstYm, kstYmd } from '../utils/kstDate'
import { getTotalBankBalance, getCashPlanStartBalance } from '../utils/bankBalance'

interface BilledOrderRow {
  id: number
  client_id: number | null
  billed_amount: number
  billed_at: string
  order_number: string
  payment_days: number
  client_name: string | null
  payment_cycle_type: string | null
  closing_day: number | null
  payment_month_offset: number | null
  payment_day: number | null
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
  payment_cycle_type: string | null
  closing_day: number | null
  payment_month_offset: number | null
  payment_day: number | null
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
cashScheduleRouter.get('/schedule', requireEditOrRole('/cash-schedule', 'MANAGER'), async (c) => {
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
      ORDER BY cs.schedule_date ASC, cs.flow_type DESC, cs.id DESC
      LIMIT 500
    `).bind(...params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('cashSchedule list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 예정 목록 CSV (현재 필터 기준) — /schedule/:id 류보다 먼저 등록
cashScheduleRouter.get('/schedule/export/csv', requireEditOrRole('/cash-schedule', 'MANAGER'), async (c) => {
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
      SELECT cs.schedule_date, cs.flow_type, cs.source_type, cs.amount, cs.description, cs.status,
        c.client_name
      FROM cash_schedule cs
      LEFT JOIN clients c ON c.id = cs.client_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY cs.schedule_date ASC, cs.flow_type DESC, cs.id DESC
      LIMIT 5001
    `).bind(...params).all()
    const truncated = (results || []).length > 5000  // #372
    const exportRows = truncated ? (results || []).slice(0, 5000) : (results || [])

    const flowLabels: Record<string, string> = { IN: '수입', OUT: '지출' }
    const statusLabels: Record<string, string> = { PENDING: '예정', DONE: '완료', OVERDUE: '연체' }

    const headers = ['예정일', '구분', '출처', '거래처', '내용', '금액', '상태']
    const rows = exportRows.map((r: any) => [
      r.schedule_date || '',
      flowLabels[r.flow_type] || r.flow_type || '',
      r.source_type || '',
      r.client_name || '',
      r.description || '',
      Number(r.amount) || 0,
      statusLabels[r.status] || r.status || ''
    ])

    const { generateCsv, csvResponse, CSV_TRUNCATION_NOTE } = await import('../utils/csv')
    return csvResponse(c, `자금계획_${kstYmd()}.csv`, generateCsv(headers, rows, { footerNote: truncated ? CSV_TRUNCATION_NOTE : undefined }))
  } catch (error) {
    console.error('cashSchedule CSV export error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 캘린더 (월간) — 하이브리드 엔진 사용: 물질화(cash_schedule) + 온더플라이(카드대금·고정비·대출·급여·예상입금/지급)
// forecast/monthly와 동일 소스 → 화면 간 숫자 일치. carryOverdueToStart:false = 연체를 원래 예정일에 표시(월뷰).
cashScheduleRouter.get('/schedule/calendar', requireEditOrRole('/cash-schedule', 'MANAGER'), async (c) => {
  try {
    const { year, month } = c.req.query()
    if (!year || !month) return c.json({ success: false, error: 'year, month 파라미터 필요' }, 400)

    const y = Number(year), m = Number(month)
    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const dayMap = await buildCashflowDays(c, monthStart, monthEnd, { carryOverdueToStart: false })

    interface DayBucket { date: string; in_total: number; out_total: number; in_done: number; out_done: number; items: CashflowItem[] }
    const days: Record<string, DayBucket> = {}
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      days[dateStr] = { date: dateStr, in_total: 0, out_total: 0, in_done: 0, out_done: 0, items: [] }
    }
    for (const [dateStr, cfDay] of Object.entries(dayMap)) {
      const day = days[dateStr]
      if (!day) continue
      day.in_total = cfDay.in
      day.out_total = cfDay.out
      day.items = cfDay.items
      for (const it of cfDay.items) {
        if (it.materialized && it.status === 'DONE') {
          if (it.flow === 'IN') day.in_done += it.amount
          else day.out_done += it.amount
        }
      }
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

// 계획 화면 통합 개요 — 달력 + 90일 예측 + 6개월 월별 + 유형 구성 + 예상수금 Top을 한 응답으로.
//   종전엔 calendar/forecast/monthly 세 화면이 각각 buildCashflowDays(무거운 하이브리드 엔진)를 호출했다.
//   한 화면에 모으면 진입마다 엔진이 3번 도므로 여기서 2회로 접는다:
//     A = 당월(carryOverdueToStart:false — 연체를 '원래 예정일'에)  → 달력·월별 당월·구성·Top
//     B = 오늘~수평선(연체 이월)                                   → 예측·다음 달 이후 월별
//   ⚠️ 월별의 '당월'을 B로 집계하면 안 된다 — B는 과거 연체 전부를 오늘로 끌어와 당월에 얹으므로
//      같은 화면의 달력 합계와 조용히 어긋난다(통합 전 월별요약 탭이 실제로 그랬다).
cashScheduleRouter.get('/schedule/overview', requireEditOrRole('/cash-schedule', 'MANAGER'), async (c) => {
  try {
    const nowYm = kstYm()
    const y = Number(c.req.query('year') || nowYm.substring(0, 4))
    const m = Number(c.req.query('month') || nowYm.substring(5, 7))
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
      return c.json({ success: false, error: 'year, month 값이 올바르지 않습니다' }, 400)
    }
    const days = Math.min(Math.max(Number(c.req.query('days') || '90') || 90, 7), 365)
    const monthCount = Math.min(Math.max(Number(c.req.query('months') || '6') || 6, 1), 12)

    const pad2 = (n: number) => String(n).padStart(2, '0')
    const lastDay = new Date(y, m, 0).getDate()
    const monthStart = `${y}-${pad2(m)}-01`
    const monthEnd = `${y}-${pad2(m)}-${pad2(lastDay)}`

    const today = kstYmd()
    const todayMs = Date.parse(`${today}T00:00:00Z`)
    const forecastEnd = new Date(todayMs + days * 86400000).toISOString().substring(0, 10)
    // 월별 수평선 = (조회월 + monthCount-1)의 말일. 예측창보다 멀면 그쪽까지 한 번에 덮는다.
    const monthlyLast = new Date(y, m - 1 + monthCount, 0)
    const monthlyEnd = `${monthlyLast.getFullYear()}-${pad2(monthlyLast.getMonth() + 1)}-${pad2(monthlyLast.getDate())}`
    const horizonEnd = forecastEnd > monthlyEnd ? forecastEnd : monthlyEnd

    const [calMap, fcMap, bank] = await Promise.all([
      buildCashflowDays(c, monthStart, monthEnd, { carryOverdueToStart: false }),
      buildCashflowDays(c, today, horizonEnd),
      getCashPlanStartBalance(c),
    ])

    // ── 달력 (calendar 엔드포인트와 동일 구조) ──────────────────────────────
    interface DayBucket { date: string; in_total: number; out_total: number; in_done: number; out_done: number; items: CashflowItem[] }
    const calDays: Record<string, DayBucket> = {}
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${y}-${pad2(m)}-${pad2(d)}`
      calDays[dateStr] = { date: dateStr, in_total: 0, out_total: 0, in_done: 0, out_done: 0, items: [] }
    }
    let overdueCount = 0
    const inByType: Record<string, number> = {}
    const outByType: Record<string, number> = {}
    const receipts: { date: string; name: string; amount: number; type: string; basis?: string; materialized: boolean; status?: string }[] = []
    for (const [dateStr, cfDay] of Object.entries(calMap)) {
      const day = calDays[dateStr]
      if (!day) continue
      day.in_total = cfDay.in
      day.out_total = cfDay.out
      day.items = cfDay.items
      for (const it of cfDay.items) {
        if (it.materialized && it.status === 'DONE') {
          if (it.flow === 'IN') day.in_done += it.amount
          else day.out_done += it.amount
        }
        const bucket = it.flow === 'IN' ? inByType : outByType
        bucket[it.type] = (bucket[it.type] || 0) + it.amount
        if (it.flow === 'IN') {
          receipts.push({ date: dateStr, name: it.name, amount: it.amount, type: it.type, basis: it.basis, materialized: it.materialized, status: it.status })
        }
      }
    }
    const summary = {
      in_total: Object.values(calDays).reduce((s, d) => s + d.in_total, 0),
      out_total: Object.values(calDays).reduce((s, d) => s + d.out_total, 0),
      in_done: Object.values(calDays).reduce((s, d) => s + d.in_done, 0),
      out_done: Object.values(calDays).reduce((s, d) => s + d.out_done, 0),
      overdue_count: overdueCount,
    }

    // ── 예측 (오늘부터 days일) ─────────────────────────────────────────────
    //   시작잔액 = '계획에 넣기로 한' 계좌들의 실잔액(0574). 마이너스통장처럼 제외된 계좌는
    //   빠진 사실이 안 보이면 안 되므로 excluded_* 를 응답에 실어 화면에 병기한다.
    const startBalanceRaw = c.req.query('start_balance')
    const startBalance = startBalanceRaw !== undefined ? (Number(startBalanceRaw) || 0) : (bank.start_balance || 0)
    const series: ForecastDay[] = []
    let running = startBalance
    for (let i = 0; i <= days; i++) {
      const dateStr = new Date(todayMs + i * 86400000).toISOString().substring(0, 10)
      const day = fcMap[dateStr]
      const inA = day?.in || 0
      const outA = day?.out || 0
      running += inA - outA
      series.push({ date: dateStr, in_amount: inA, out_amount: outA, net: inA - outA, balance: +running.toFixed(2), is_negative: running < 0 })
    }
    const riskDays = series.filter((d) => d.is_negative)

    // 연체 이월분(예측 첫날에 얹힌 금액) — 예측 시작일의 큰 숫자가 '오늘 들어온다'는 뜻이 아님을 화면에 알리기 위함.
    //   연체 건수도 여기서 센다: 이월 대상 = schedule_date < 오늘 & 미완료라 연체의 정의와 정확히 같다.
    //   ⚠️ 달력(A)에서 당월분만 세면 지난 달 연체가 빠져 'KPI 연체 0 · 안내문 8건'처럼 같은 화면이 서로 다른 말을 한다.
    let carriedIn = 0, carriedOut = 0, carriedCount = 0
    for (const it of fcMap[today]?.items || []) {
      if (!it.carried_from) continue
      carriedCount++
      if (it.flow === 'IN') carriedIn += it.amount
      else carriedOut += it.amount
      if (it.materialized) overdueCount++   // 연체 KPI = 물질화 행만(온더플라이 추정치는 '연체'가 아니다)
    }
    summary.overdue_count = overdueCount

    // ── 월별 (당월=A, 이후=B) ──────────────────────────────────────────────
    const months: { month: string; in: number; out: number; net: number; cumulative: number }[] = []
    const idx: Record<string, number> = {}
    for (let i = 0; i < monthCount; i++) {
      const d = new Date(y, m - 1 + i, 1)
      const ym = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
      idx[ym] = i
      months.push({ month: ym, in: 0, out: 0, net: 0, cumulative: 0 })
    }
    months[0].in = summary.in_total
    months[0].out = summary.out_total
    for (const [dateStr, day] of Object.entries(fcMap)) {
      const i = idx[dateStr.substring(0, 7)]
      if (i === undefined || i === 0) continue   // 당월은 A 기준(위) — B로 더하면 연체 이월분이 이중 계상된다
      months[i].in += day.in
      months[i].out += day.out
    }
    let cumulative = 0
    for (const mo of months) {
      mo.in = Math.round(mo.in)
      mo.out = Math.round(mo.out)
      mo.net = mo.in - mo.out
      cumulative += mo.net
      mo.cumulative = cumulative
    }

    // 예상수금 Top — 금액 내림차순, 동액이면 빠른 날짜부터
    receipts.sort((a, b) => (b.amount - a.amount) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

    return c.json({
      success: true,
      data: {
        today,
        calendar: { year: y, month: m, days: calDays, summary },
        forecast: {
          start_balance: startBalance,
          bank_balance: bank.start_balance || 0,
          account_count: bank.account_count || 0,
          excluded_balance: bank.excluded_balance || 0,   // 계획에서 뺀 계좌 합(주로 마이너스통장 사용액)
          excluded_count: bank.excluded_count || 0,
          end_balance: running,
          min_balance: series.length ? Math.min(...series.map((d) => d.balance)) : startBalance,
          max_balance: series.length ? Math.max(...series.map((d) => d.balance)) : startBalance,
          risk_days_count: riskDays.length,
          risk_days: riskDays.slice(0, 10),
          days,
          series,
        },
        monthly: months,
        composition: { in: inByType, out: outByType },
        top_receipts: receipts.slice(0, 5),
        // materialized = 등록된 예정 행(연체 KPI와 같은 수) · count-materialized = 자동 합성분(대출·발주 등)
        carried: { in: carriedIn, out: carriedOut, count: carriedCount, materialized: overdueCount },
      },
    })
  } catch (error) {
    console.error('cashSchedule overview error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 특정 날짜 상세
cashScheduleRouter.get('/schedule/day/:date', requireEditOrRole('/cash-schedule', 'MANAGER'), async (c) => {
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
cashScheduleRouter.post('/schedule', requireEditOrRole('/cash-schedule', 'MANAGER'), async (c) => {
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
      user?.id || null, getEntityId(c) || 1
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id }, message: '예정이 등록되었습니다.' })
  } catch (error) {
    console.error('cashSchedule insert error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 수정
cashScheduleRouter.patch('/schedule/:id', requireEditOrRole('/cash-schedule', 'MANAGER'), async (c) => {
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
cashScheduleRouter.delete('/schedule/:id', requireEditOrRole('/cash-schedule', 'MANAGER'), async (c) => {
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
cashScheduleRouter.patch('/schedule/:id/complete', requireEditOrRole('/cash-schedule', 'MANAGER'), async (c) => {
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

    // P5 split billing: 입금예정=청구그룹(주문×법인) 기준. 혼합주문은 법인별 입금예정 분리.
    // entity_id=g.entity_id(청구법인), 중복방지에 entity 차원 추가(같은 주문 다법인 그룹 각각 물질화).
    const ef = entityFilter(c, 'g')

    // 1. 청구 완료된 청구그룹 → 입금 예정 (LIMIT 500 안전장치)
    const { results: billedOrders } = await c.env.DB.prepare(`
      SELECT g.order_id as id, g.entity_id as billing_entity_id, o.client_id,
        g.billed_amount, COALESCE(g.accounting_date, g.billed_at) as billed_at, o.order_number,
        COALESCE(c.payment_terms_days, 30) as payment_days,
        c.client_name,
        c.payment_cycle_type, c.closing_day, c.payment_month_offset, c.payment_day
      FROM order_billing_groups g
      JOIN orders o ON o.id = g.order_id
      LEFT JOIN clients c ON c.id = o.client_id
      WHERE g.billing_status = 'BILLED' AND g.billed_at IS NOT NULL AND o.status != 'CANCELLED'${ef.clause}
        AND NOT EXISTS (
          SELECT 1 FROM cash_schedule cs
          WHERE cs.source_type = 'ORDER' AND cs.source_id = g.order_id AND cs.entity_id = g.entity_id AND cs.status != 'CANCELLED'
        )
      LIMIT 500
    `).bind(...ef.params).all<BilledOrderRow & { billing_entity_id: number }>()

    for (const order of billedOrders) {
      const dueDateStr = computeExpectedPaymentDate(order.billed_at, {
        payment_cycle_type: order.payment_cycle_type,
        payment_terms_days: order.payment_days,
        closing_day: order.closing_day,
        payment_month_offset: order.payment_month_offset,
        payment_day: order.payment_day,
      })

      batchStmts.push(
        c.env.DB.prepare(`
          INSERT INTO cash_schedule (schedule_date, flow_type, source_type, source_id, client_id, amount, description, created_by, entity_id)
          VALUES (?, 'IN', 'ORDER', ?, ?, ?, ?, ?, ?)
        `).bind(
          dueDateStr, order.id, order.client_id,
          order.billed_amount,
          `${order.client_name || ''} 입금예정 (주문 ${order.order_number})`,
          user?.id || null, order.billing_entity_id
        )
      )
      inserted++
    }

    // 2. 발주 → 지급 예정 (LIMIT 500 안전장치)
    //   공급사 결제조건(MONTHLY 월말/이월결제 포함)을 computeExpectedPaymentDate로 반영 — 매출측과 대칭 (H1a)
    const { results: confirmedPOs } = await c.env.DB.prepare(`
      SELECT po.id, po.supplier_id, po.final_amount, po.po_number, po.created_at, po.delivery_date,
        s.client_name as supplier_name,
        COALESCE(s.payment_terms_days, 30) as payment_days,
        s.payment_cycle_type, s.closing_day, s.payment_month_offset, s.payment_day
      FROM purchase_orders po
      LEFT JOIN clients s ON s.id = po.supplier_id
      WHERE po.status IN ('CONFIRMED', 'RECEIVED', 'PARTIAL_RECEIVED')${entityFilter(c, 'po').clause}
        AND NOT EXISTS (
          SELECT 1 FROM cash_schedule cs
          WHERE cs.source_type = 'PURCHASE' AND cs.source_id = po.id AND cs.status != 'CANCELLED'
        )
      LIMIT 500
    `).bind(...entityFilter(c, 'po').params).all<ConfirmedPORow>()

    for (const po of confirmedPOs) {
      const baseDate = (po.delivery_date || po.created_at || '').substring(0, 10)
      const dueDateStr = computeExpectedPaymentDate(baseDate, {
        payment_cycle_type: po.payment_cycle_type,
        payment_terms_days: po.payment_days,
        closing_day: po.closing_day,
        payment_month_offset: po.payment_month_offset,
        payment_day: po.payment_day,
      })

      batchStmts.push(
        c.env.DB.prepare(`
          INSERT INTO cash_schedule (schedule_date, flow_type, source_type, source_id, client_id, amount, description, created_by, entity_id)
          VALUES (?, 'OUT', 'PURCHASE', ?, ?, ?, ?, ?, ?)
        `).bind(
          dueDateStr, po.id, po.supplier_id,
          po.final_amount,
          `${po.supplier_name || '공급사'} 지급예정 (발주 ${po.po_number})`,
          user?.id || null, getEntityId(c) || 1
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
cashScheduleRouter.post('/schedule/check-overdue', requireEditOrRole('/cash-schedule', 'MANAGER'), async (c) => {
  try {
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().substring(0, 10)  // KST 기준일
    const result = await c.env.DB.prepare(`
      UPDATE cash_schedule SET status = 'OVERDUE', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'PENDING' AND schedule_date < ?
    `).bind(today).run()
    const onTime = await c.env.DB.prepare(
      `SELECT COUNT(*) AS c FROM cash_schedule WHERE status = 'PENDING' AND schedule_date >= ?`
    ).bind(today).first<{ c: number }>()
    const overdueCount = result.meta.changes || 0
    // 프론트(schCheckOverdue)가 overdue_count/on_time_count를 읽음 → 응답계약 정렬(기존 {updated}만이라 'undefined건' 토스트)
    return c.json({ success: true, data: { updated: overdueCount, overdue_count: overdueCount, on_time_count: onTime?.c || 0 }, message: `${overdueCount}건이 연체로 변경되었습니다.` })
  } catch (error) {
    console.error('cashSchedule overdue error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// A2: 추정 자금 일보 — 향후 N일 잔액 예측 (하이브리드 엔진: 물질화 + 온더플라이)
cashScheduleRouter.get('/schedule/forecast', requireEditOrRole('/cash-schedule', 'MANAGER'), async (c) => {
  try {
    const days = Number(c.req.query('days') || '90')
    const startBalance = Number(c.req.query('start_balance') || '0')

    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().substring(0, 10)  // KST 기준일
    const endDate = new Date(Date.now() + 9 * 3600 * 1000 + days * 86400000).toISOString().substring(0, 10)

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
cashScheduleRouter.get('/schedule/monthly', requireEditOrRole('/cash-schedule', 'MANAGER'), async (c) => {
  try {
    const monthCount = Math.min(Number(c.req.query('months') || '6'), 12)
    const nowYm = kstYm()
    const from = nowYm + '-01'
    const lastMonthEnd = new Date(Number(nowYm.slice(0, 4)), Number(nowYm.slice(5, 7)) - 1 + monthCount, 0)
    const to = lastMonthEnd.toISOString().substring(0, 10)

    const dayMap = await buildCashflowDays(c, from, to)

    const months: { month: string; in: number; out: number; net: number; cumulative: number }[] = []
    const idx: Record<string, number> = {}
    for (let i = 0; i < monthCount; i++) {
      const d = new Date(Number(nowYm.slice(0, 4)), Number(nowYm.slice(5, 7)) - 1 + i, 1)
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

// 자금계획 시작잔액 — bank_accounts에 잔액 컬럼이 없어 계좌별 최신 bank_transactions.balance_after 합산.
//   0574: '계획에 넣기로 한' 계좌만 센다(overview 와 같은 헬퍼) — 이 엔드포인트 이름이 곧 자금계획 기준이라
//   전체 현금(getTotalBankBalance)을 돌려주면 화면과 어긋난다. 전체 현금은 /api/bank/fund-summary 가 준다.
cashScheduleRouter.get('/schedule/bank-balance', requireEditOrRole('/cash-schedule', 'MANAGER'), async (c) => {
  try {
    const { start_balance, account_count, excluded_balance, excluded_count } = await getCashPlanStartBalance(c)
    // total_balance 키는 기존 응답계약 유지(값의 기준만 계획 포함분으로 좁혀졌다).
    return c.json({ success: true, data: { total_balance: start_balance, account_count, excluded_balance, excluded_count } })
  } catch (error) {
    console.error('cashSchedule bank-balance error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 거래처 검색 (수동 자금예정 등록 autocomplete용) — /api/bank/client-search는 /bank 권한 게이트라 별도 제공
cashScheduleRouter.get('/clients/search', requireEditOrRole('/cash-schedule', 'MANAGER'), async (c) => {
  try {
    const q = (c.req.query('q') || '').trim()
    if (!q) return c.json({ success: true, data: [] })
    const { results } = await c.env.DB.prepare(`
      SELECT id, client_name, representative
      FROM clients
      WHERE is_active = 1 AND client_name LIKE ?
      ORDER BY client_name, id LIMIT 20
    `).bind('%' + q + '%').all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('cashSchedule client-search error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default cashScheduleRouter
