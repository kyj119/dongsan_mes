// 자금 예측 공통 엔진 (하이브리드)
// 물질화(cash_schedule 행) + 온더플라이(고정비·대출·미청구주문) 합성을 단일 소스로 제공.
// forecast / monthly / (Phase 3에서 calendar)가 모두 이 헬퍼를 호출 → 화면 간 숫자 일치.
//
// 하이브리드 경계 (project-cashflow-unification 설계):
//   - 물질화: cash_schedule (ORDER 청구입금 / PURCHASE 발주지급 / 수동 TAX·PAYROLL·OTHER·LOAN)
//             단 source_type='FIXED'는 제외 (고정비는 온더플라이로 통일 → 이중계산 방지)
//   - 온더플라이: 고정비(fixed_expenses), 대출(loan_payments), 미청구 확정주문 예상입금(orders)
//   - 카드: corporate_cards에 cutoff_day/payment_day 부재 → 범위 외 (스키마 보강 후 백로그)
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { entityFilter } from './entityFilter'
import { computeExpectedPaymentDate } from './paymentSchedule'
import { buildExpenseEstimator, type EstimateMethod } from './expenseEstimator'

export interface CashflowItem {
  flow: 'IN' | 'OUT'
  type: string                    // ORDER | PURCHASE | FIXED | LOAN | ORDER_EXPECTED | TAX | ...
  name: string
  amount: number
  status?: string
  materialized: boolean           // true=cash_schedule 행(은행매칭 DONE 대상), false=온더플라이
  schedule_id?: number            // 물질화 행 id
  estimated?: boolean             // true=과거 실적 추정치(변동비, 확정 전)
}

export interface CashflowDay {
  date: string                    // YYYY-MM-DD
  in: number
  out: number
  items: CashflowItem[]
}

/** from~to(YYYY-MM-DD, inclusive)에 걸치는 'YYYY-MM' 월 목록 */
function monthsBetween(from: string, to: string): { y: number; m: number; lastDay: number }[] {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const out: { y: number; m: number; lastDay: number }[] = []
  let y = fy, m = fm
  while (y < ty || (y === ty && m <= tm)) {
    out.push({ y, m, lastDay: new Date(y, m, 0).getDate() })
    m++; if (m > 12) { m = 1; y++ }
  }
  return out
}

/**
 * 기간 내 일별 자금 흐름(입/출 + 항목)을 합성해 반환.
 * @returns { 'YYYY-MM-DD': CashflowDay } — 항목이 있는 날짜만 채워짐
 */
export async function buildCashflowDays(
  c: Context<HonoEnv>,
  from: string,
  to: string
): Promise<Record<string, CashflowDay>> {
  const days: Record<string, CashflowDay> = {}
  const ensure = (d: string): CashflowDay => (days[d] ??= { date: d, in: 0, out: 0, items: [] })
  const add = (date: string, item: CashflowItem) => {
    if (date < from || date > to) return
    const day = ensure(date)
    if (item.flow === 'IN') day.in += item.amount
    else day.out += item.amount
    day.items.push(item)
  }

  // ── 1) 물질화: cash_schedule (FIXED 제외) ──────────────────────────────
  const efCs = entityFilter(c, 'cs')
  const { results: csRows } = await c.env.DB.prepare(`
    SELECT cs.id, cs.schedule_date, cs.flow_type, cs.source_type, cs.amount,
           cs.description, cs.status, cs.actual_amount, cl.client_name
    FROM cash_schedule cs
    LEFT JOIN clients cl ON cl.id = cs.client_id
    WHERE cs.schedule_date BETWEEN ? AND ?
      AND cs.status != 'CANCELLED'
      AND cs.source_type != 'FIXED'${efCs.clause}
  `).bind(from, to, ...efCs.params).all<{
    id: number; schedule_date: string; flow_type: string; source_type: string
    amount: number; description: string | null; status: string
    actual_amount: number | null; client_name: string | null
  }>()
  for (const r of csRows) {
    const effective = r.status === 'DONE' ? (r.actual_amount ?? r.amount) : r.amount
    add(r.schedule_date, {
      flow: r.flow_type === 'IN' ? 'IN' : 'OUT',
      type: r.source_type,
      name: r.description || r.client_name || r.source_type,
      amount: Number(effective) || 0,
      status: r.status,
      materialized: true,
      schedule_id: r.id,
    })
  }

  const months = monthsBetween(from, to)

  // ── 2) 온더플라이: 고정비 (ESTIMATED는 연결 카테고리 과거 실적으로 월별 추정) ──
  const efFixed = entityFilter(c)
  const { results: fixedRows } = await c.env.DB.prepare(`
    SELECT name, category, amount, payment_day, frequency, start_date, end_date,
           amount_type, estimate_method, linked_category_id
    FROM fixed_expenses
    WHERE is_active = 1 AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)${efFixed.clause}
  `).bind(to, from, ...efFixed.params).all<{
    name: string; category: string; amount: number; payment_day: number | null
    frequency: string; start_date: string | null; end_date: string | null
    amount_type: string | null; estimate_method: string | null; linked_category_id: number | null
  }>()
  // ESTIMATED 고정비는 연결 카테고리(card/bank 실적)로 추정 → estimator 일괄 빌드(쿼리 폭발 방지)
  const estCatIds = fixedRows
    .filter((fe) => fe.amount_type === 'ESTIMATED' && fe.linked_category_id != null)
    .map((fe) => fe.linked_category_id as number)
  const estimator = await buildExpenseEstimator(c, estCatIds, from.substring(0, 7), to.substring(0, 7))

  for (const fe of fixedRows) {
    const startMonth = Number((fe.start_date || '').split('-')[1] || '1')
    for (const { y, m, lastDay } of months) {
      if (fe.frequency === 'QUARTERLY' && (m - startMonth) % 3 !== 0) continue
      if (fe.frequency === 'YEARLY' && m !== startMonth) continue
      const day = Math.min(fe.payment_day || 1, lastDay)
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      if (fe.end_date && dateStr > fe.end_date) continue

      // 변동비(ESTIMATED): 해당 월 추정치로 대체, 실적 없으면 등록 금액(amount)으로 폴백
      let amount = Number(fe.amount) || 0
      let estimated = false
      if (fe.amount_type === 'ESTIMATED' && fe.linked_category_id != null) {
        const ym = `${y}-${String(m).padStart(2, '0')}`
        const est = estimator.estimate(
          fe.linked_category_id,
          (fe.estimate_method as EstimateMethod) || 'AVG_3M',
          ym
        )
        if (est != null) { amount = est; estimated = true }
      }
      add(dateStr, {
        flow: 'OUT', type: 'FIXED',
        name: `${fe.name} (${fe.category})${estimated ? '·추정' : ''}`,
        amount, materialized: false, estimated,
      })
    }
  }

  // ── 3) 온더플라이: 대출 상환 (loan_payments) ───────────────────────────
  const efLoan = entityFilter(c)
  const { results: loanRows } = await c.env.DB.prepare(`
    SELECT lp.scheduled_date, lp.total_amount, lp.status, l.creditor
    FROM loan_payments lp
    JOIN loans l ON lp.loan_id = l.id
    WHERE lp.scheduled_date BETWEEN ? AND ?
      AND lp.status IN ('SCHEDULED', 'OVERDUE', 'PARTIAL')${efLoan.clause.replace('entity_id', 'l.entity_id')}
  `).bind(from, to, ...efLoan.params).all<{
    scheduled_date: string; total_amount: number; status: string; creditor: string
  }>()
  for (const lp of loanRows) {
    add(lp.scheduled_date, {
      flow: 'OUT', type: 'LOAN', name: `${lp.creditor} 상환`,
      amount: Number(lp.total_amount) || 0, status: lp.status, materialized: false,
    })
  }

  // ── 4) 온더플라이: 주문 예상입금 (4a 미청구 확정주문 + 4b 청구 미수금) ──────
  const efOrd = entityFilter(c, 'o')

  // 4a) 미청구 확정주문: 아직 청구 전이라 clients.balance(미수)에 미포함 → final_amount로 합성.
  //     청구되면 4b(미수금)로 자동 이동(billing_status='BILLED' 분기).
  const { results: orderRows } = await c.env.DB.prepare(`
    SELECT o.order_number, o.final_amount, o.delivery_date, o.created_at,
           COALESCE(cl.payment_terms_days, 30) AS terms, cl.client_name,
           cl.payment_cycle_type, cl.closing_day, cl.payment_month_offset, cl.payment_day
    FROM orders o
    LEFT JOIN clients cl ON cl.id = o.client_id
    WHERE o.status NOT IN ('CANCELLED', 'DRAFT')
      AND (o.billing_status IS NULL OR o.billing_status != 'BILLED')
      AND o.final_amount > 0${efOrd.clause}
    LIMIT 1000
  `).bind(...efOrd.params).all<{
    order_number: string; final_amount: number; delivery_date: string | null
    created_at: string; terms: number; client_name: string | null
    payment_cycle_type: string | null; closing_day: number | null
    payment_month_offset: number | null; payment_day: number | null
  }>()
  for (const o of orderRows) {
    const base = o.delivery_date || (o.created_at || '').substring(0, 10)
    if (!base) continue
    const due = computeExpectedPaymentDate(base, {
      payment_cycle_type: o.payment_cycle_type, payment_terms_days: o.terms,
      closing_day: o.closing_day, payment_month_offset: o.payment_month_offset, payment_day: o.payment_day,
    })
    add(due, {
      flow: 'IN', type: 'ORDER_EXPECTED',
      name: `${o.client_name || ''} 예상입금 (주문 ${o.order_number})`.trim(),
      amount: Number(o.final_amount) || 0, materialized: false,
    })
  }

  // 4b) 청구 미수금: BILLED인데 cash_schedule에 미물질화된 주문을 ORDER_EXPECTED(IN)로 합성.
  //   금액 정합: 주문별 payments 할당이 없는 데이터 모델 → 거래처 미수(clients.balance,
  //   이미 수금이 차감된 실잔액)를 거래처별 cap으로 사용 → 부분수금/완납분 자동 반영.
  //   이중계산 방지: balance에서 '이미 물질화된 PENDING/OVERDUE ORDER 합계'(전 기간)를 뺀 잔여만 분배.
  //   (물질화분은 위 §1에서 기간 내 행으로 별도 표시됨)
  const { results: billedRows } = await c.env.DB.prepare(`
    SELECT o.id, o.order_number, o.billed_amount, o.billed_at, o.client_id, cl.client_name,
           COALESCE(cl.payment_terms_days, 30) AS terms,
           cl.payment_cycle_type, cl.closing_day, cl.payment_month_offset, cl.payment_day
    FROM orders o
    LEFT JOIN clients cl ON cl.id = o.client_id
    WHERE o.billing_status = 'BILLED' AND o.billed_at IS NOT NULL AND o.billed_amount > 0
      AND NOT EXISTS (
        SELECT 1 FROM cash_schedule cs WHERE cs.source_type = 'ORDER' AND cs.source_id = o.id
      )${efOrd.clause}
    LIMIT 1000
  `).bind(...efOrd.params).all<{
    id: number; order_number: string; billed_amount: number; billed_at: string; client_id: number
    client_name: string | null; terms: number; payment_cycle_type: string | null
    closing_day: number | null; payment_month_offset: number | null; payment_day: number | null
  }>()

  if (billedRows.length > 0) {
    // 거래처별 잔여 미수 = balance − 이미 물질화된 PENDING/OVERDUE ORDER 합계(전 기간).
    // clients는 entity_id 없음(법인 공유) → entityFilter 미적용.
    const { results: balRows } = await c.env.DB.prepare(`
      SELECT cl.id AS client_id, cl.balance,
        COALESCE((SELECT SUM(cs.amount) FROM cash_schedule cs
                  WHERE cs.client_id = cl.id AND cs.flow_type = 'IN' AND cs.source_type = 'ORDER'
                    AND cs.status IN ('PENDING', 'OVERDUE')), 0) AS materialized_pending
      FROM clients cl WHERE cl.balance > 0
    `).all<{ client_id: number; balance: number; materialized_pending: number }>()
    const residualByClient = new Map<number, number>()
    for (const b of balRows) {
      residualByClient.set(b.client_id, Math.max(0, (Number(b.balance) || 0) - (Number(b.materialized_pending) || 0)))
    }

    // 거래처별 그룹 → 예상입금일 오름차순(빠른 건부터) 분배, 각 주문 billed_amount 상한, 잔여 소진 시 중단.
    const byClient = new Map<number, { order_number: string; client_name: string | null; billed: number; due: string }[]>()
    for (const o of billedRows) {
      let due = computeExpectedPaymentDate(o.billed_at, {
        payment_cycle_type: o.payment_cycle_type, payment_terms_days: o.terms,
        closing_day: o.closing_day, payment_month_offset: o.payment_month_offset, payment_day: o.payment_day,
      })
      if (due < from) due = from   // 연체분(예상일이 과거)은 예측 시작일에 표시 — 미수는 즉시 회수 대상
      const list = byClient.get(o.client_id) ?? []
      list.push({ order_number: o.order_number, client_name: o.client_name, billed: Number(o.billed_amount) || 0, due })
      byClient.set(o.client_id, list)
    }
    for (const [clientId, list] of byClient) {
      let residual = residualByClient.get(clientId) ?? 0
      if (residual <= 0) continue   // 미수 잔액 없음(완납) → 합성 안 함
      list.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
      for (const it of list) {
        if (residual <= 0) break
        const amt = Math.min(it.billed, residual)
        if (amt <= 0) continue
        residual -= amt
        add(it.due, {
          flow: 'IN', type: 'ORDER_EXPECTED',
          name: `${it.client_name || ''} 미수 예상입금 (주문 ${it.order_number})`.trim(),
          amount: amt, materialized: false,
        })
      }
    }
  }

  return days
}
