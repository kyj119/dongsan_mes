// 자금 예측 공통 엔진 (하이브리드)
// 물질화(cash_schedule 행) + 온더플라이(고정비·대출·미청구주문) 합성을 단일 소스로 제공.
// forecast / monthly / (Phase 3에서 calendar)가 모두 이 헬퍼를 호출 → 화면 간 숫자 일치.
//
// 하이브리드 경계 (project-cashflow-unification 설계):
//   - 물질화: cash_schedule (ORDER 청구입금 / PURCHASE 발주지급 / 수동 TAX·PAYROLL·OTHER·LOAN)
//             단 source_type='FIXED'는 제외 (고정비는 온더플라이로 통일 → 이중계산 방지)
//   - 온더플라이: 고정비(fixed_expenses), 대출(loan_payments), 미청구 확정주문 예상입금(orders)
//   - 카드: corporate_cards.cutoff_day/payment_day 기반 청구 예정(CARD_EXPECTED) — 일시불 가정·실적+AVG_3M 혼합
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

  // ── 1b) 연체(과거일) 물질화 항목을 from으로 끌어옴 (H7) ────────────────────
  //   §1은 schedule_date BETWEEN from..to라 예측창 이전의 PENDING/OVERDUE가 통째로 빠진다.
  //   연체 미수/지급은 즉시 회수·지급 대상이므로 from(예측 시작일)에 표시(§4b 미수 from-clamp와 대칭).
  //   FIXED 제외(온더플라이 통일)·CANCELLED 제외. DONE은 이미 정산분이라 과거에 남김.
  //   ※ ORDER 연체분은 §4b residual의 mAgg(전 기간 PENDING/OVERDUE)에서 차감되고 §4b 합성 대상(materialized=0)도 아니므로
  //     여기서 from에 표시해도 이중계산 없음.
  const efOv = entityFilter(c, 'cs')
  const { results: ovRows } = await c.env.DB.prepare(`
    SELECT cs.id, cs.flow_type, cs.source_type, cs.amount, cs.description, cs.status, cl.client_name
    FROM cash_schedule cs
    LEFT JOIN clients cl ON cl.id = cs.client_id
    WHERE cs.schedule_date < ?
      AND cs.status IN ('PENDING', 'OVERDUE')
      AND cs.source_type != 'FIXED'${efOv.clause}
  `).bind(from, ...efOv.params).all<{
    id: number; flow_type: string; source_type: string; amount: number
    description: string | null; status: string; client_name: string | null
  }>()
  for (const r of ovRows) {
    add(from, {
      flow: r.flow_type === 'IN' ? 'IN' : 'OUT',
      type: r.source_type,
      name: `${r.description || r.client_name || r.source_type} (연체)`,
      amount: Number(r.amount) || 0,
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

  // ── 4) 온더플라이: 주문 예상입금 — split billing P5: 청구그룹(주문×법인) 단위 ──
  //   §4a 미청구 그룹(billing_status≠BILLED) → 예상입금(그룹 금액, 납기 기준)
  //   §4b 청구 그룹(BILLED·미물질화) → 미수 예상입금(거래처×법인 파생잔여 cap, billed_at 기준)
  //   ⚠️ 그룹 단위라 혼합주문 부분청구 시 §4a↔§4b 이중계산 없음 + clients.balance(P3 폐기·stale) 미사용.
  const efG = entityFilter(c, 'g')
  const { results: grpRows } = await c.env.DB.prepare(`
    SELECT g.order_id, g.entity_id, g.billing_status,
           CAST(COALESCE(g.billed_amount, g.supply_amount + COALESCE(g.tax_amount, 0), 0) AS INTEGER) AS amount,
           g.billed_at, g.accounting_date, o.order_number, o.delivery_date, o.created_at, o.client_id, cl.client_name,
           COALESCE(cl.payment_terms_days, 30) AS terms,
           cl.payment_cycle_type, cl.closing_day, cl.payment_month_offset, cl.payment_day,
           (SELECT COUNT(*) FROM cash_schedule cs WHERE cs.source_type = 'ORDER' AND cs.source_id = g.order_id AND cs.entity_id = g.entity_id) AS materialized
    FROM order_billing_groups g
    JOIN orders o ON o.id = g.order_id
    LEFT JOIN clients cl ON cl.id = o.client_id
    WHERE o.status NOT IN ('CANCELLED', 'DRAFT')${efG.clause}
    LIMIT 2000
  `).bind(...efG.params).all<{
    order_id: number; entity_id: number; billing_status: string | null; amount: number
    billed_at: string | null; accounting_date: string | null; order_number: string; delivery_date: string | null; created_at: string
    client_id: number; client_name: string | null; terms: number
    payment_cycle_type: string | null; closing_day: number | null
    payment_month_offset: number | null; payment_day: number | null; materialized: number
  }>()

  // 4a) 미청구 그룹: 청구 전 → 그룹 금액으로 예상입금 합성(납기 기준). 청구되면 §4b로 이동.
  for (const g of grpRows) {
    // BILLED는 §4b(미수 잔여 cap)에서, PAID(수금완료)는 이미 회수돼 AR 파생서 제외 → §4a도 제외(유령 수입 방지).
    if (g.billing_status === 'BILLED' || g.billing_status === 'PAID') continue
    if (!(Number(g.amount) > 0)) continue
    const base = g.delivery_date || (g.created_at || '').substring(0, 10)
    if (!base) continue
    const due = computeExpectedPaymentDate(base, {
      payment_cycle_type: g.payment_cycle_type, payment_terms_days: g.terms,
      closing_day: g.closing_day, payment_month_offset: g.payment_month_offset, payment_day: g.payment_day,
    })
    add(due, {
      flow: 'IN', type: 'ORDER_EXPECTED',
      name: `${g.client_name || ''} 예상입금 (주문 ${g.order_number})`.trim(),
      amount: Number(g.amount) || 0, materialized: false,
    })
  }

  // 4b) 청구 그룹(BILLED·미물질화) → 미수 예상입금. cap = (거래처×법인) 파생 미수잔여.
  //   파생잔여 = Σ BILLED그룹 − payments − adjustments − 이미 물질화된 PENDING/OVERDUE(전 기간).
  //   (clients.balance P3 폐기 → 파생. 물질화분은 §1에서 별도 표시 → 잔여만 분배해 이중계산 방지.)
  const billedGroups = grpRows.filter(g => g.billing_status === 'BILLED' && Number(g.materialized) === 0 && Number(g.amount) > 0)
  if (billedGroups.length > 0) {
    const ckey = (cid: number, eid: number) => cid + ':' + eid
    const efP = entityFilter(c)
    const efA = entityFilter(c)
    const efCsB = entityFilter(c, 'cs')
    const [bAgg, pAgg, aAgg, mAgg] = await Promise.all([
      c.env.DB.prepare(`SELECT o.client_id, g.entity_id, COALESCE(SUM(g.billed_amount), 0) AS v FROM order_billing_groups g JOIN orders o ON o.id = g.order_id WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${efG.clause} GROUP BY o.client_id, g.entity_id`).bind(...efG.params).all<{ client_id: number; entity_id: number; v: number }>(),
      c.env.DB.prepare(`SELECT client_id, entity_id, COALESCE(SUM(amount), 0) AS v FROM payments WHERE 1=1${efP.clause} GROUP BY client_id, entity_id`).bind(...efP.params).all<{ client_id: number; entity_id: number; v: number }>(),
      c.env.DB.prepare(`SELECT client_id, entity_id, COALESCE(SUM(amount), 0) AS v FROM adjustments WHERE 1=1${efA.clause} GROUP BY client_id, entity_id`).bind(...efA.params).all<{ client_id: number; entity_id: number; v: number }>(),
      c.env.DB.prepare(`SELECT cs.client_id, cs.entity_id, COALESCE(SUM(cs.amount), 0) AS v FROM cash_schedule cs WHERE cs.flow_type = 'IN' AND cs.source_type = 'ORDER' AND cs.status IN ('PENDING', 'OVERDUE')${efCsB.clause} GROUP BY cs.client_id, cs.entity_id`).bind(...efCsB.params).all<{ client_id: number; entity_id: number; v: number }>(),
    ])
    const billedByCE = new Map<string, number>(), paidByCE = new Map<string, number>(), adjByCE = new Map<string, number>(), matByCE = new Map<string, number>()
    for (const r of bAgg.results) billedByCE.set(ckey(r.client_id, r.entity_id), Number(r.v) || 0)
    for (const r of pAgg.results) paidByCE.set(ckey(r.client_id, r.entity_id), Number(r.v) || 0)
    for (const r of aAgg.results) adjByCE.set(ckey(r.client_id, r.entity_id), Number(r.v) || 0)
    for (const r of mAgg.results) matByCE.set(ckey(r.client_id, r.entity_id), Number(r.v) || 0)
    const residualByCE = new Map<string, number>()
    for (const k of billedByCE.keys()) {
      residualByCE.set(k, Math.max(0, (billedByCE.get(k) || 0) - (paidByCE.get(k) || 0) - (adjByCE.get(k) || 0) - (matByCE.get(k) || 0)))
    }

    // (거래처×법인)별 그룹 → 예상입금일 오름차순(빠른 건부터) 분배, 그룹 금액 상한, 잔여 소진 시 중단.
    const byCE = new Map<string, { order_number: string; client_name: string | null; amount: number; due: string }[]>()
    for (const g of billedGroups) {
      let due = computeExpectedPaymentDate(g.accounting_date || g.billed_at || (g.created_at || '').substring(0, 10), {
        payment_cycle_type: g.payment_cycle_type, payment_terms_days: g.terms,
        closing_day: g.closing_day, payment_month_offset: g.payment_month_offset, payment_day: g.payment_day,
      })
      if (due < from) due = from   // 연체분(예상일이 과거)은 예측 시작일에 표시 — 미수는 즉시 회수 대상
      const k = ckey(g.client_id, g.entity_id)
      const list = byCE.get(k) ?? []
      list.push({ order_number: g.order_number, client_name: g.client_name, amount: Number(g.amount) || 0, due })
      byCE.set(k, list)
    }
    for (const [k, list] of byCE) {
      let residual = residualByCE.get(k) ?? 0
      if (residual <= 0) continue   // 미수 잔액 없음(완납) → 합성 안 함
      list.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
      for (const it of list) {
        if (residual <= 0) break
        const amt = Math.min(it.amount, residual)
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

  // ── 4.5) 온더플라이: 매입 지급예정 (PURCHASE_EXPECTED) — 매출 §4 대칭 (H1b) ──
  //   확정발주(CONFIRMED/RECEIVED/PARTIAL_RECEIVED) 중 cash_schedule 미물질화분을 공급사 결제조건으로 OUT 합성.
  //   이전: 매입은 물질화(auto-generate·매입확정)된 행만 §1에 등장 → 미물질화 확정발주는 예측에서 누락(매출은 자동 합성인데 비대칭).
  //   dedup: (a) cash_schedule PURCHASE source_id=po.id 존재 시 §1과 중복 → skip,
  //          (b) 지출결의(payment_requests.related_po_id) APPROVED/PAID 존재 시 그 결의 행과 중복 → skip.
  const efPo = entityFilter(c, 'po')
  const { results: poRows } = await c.env.DB.prepare(`
    SELECT po.id, po.po_number, po.final_amount, po.delivery_date, po.created_at, po.supplier_id,
           s.client_name AS supplier_name,
           s.payment_cycle_type, s.closing_day, s.payment_month_offset, s.payment_day,
           COALESCE(s.payment_terms_days, 30) AS terms,
           (SELECT COUNT(*) FROM cash_schedule cs WHERE cs.source_type = 'PURCHASE' AND cs.source_id = po.id) AS materialized,
           (SELECT COUNT(*) FROM payment_requests pr WHERE pr.related_po_id = po.id AND pr.status IN ('APPROVED', 'PAID')) AS pr_materialized
    FROM purchase_orders po
    LEFT JOIN clients s ON s.id = po.supplier_id
    WHERE po.status IN ('CONFIRMED', 'RECEIVED', 'PARTIAL_RECEIVED')${efPo.clause}
    LIMIT 2000
  `).bind(...efPo.params).all<{
    id: number; po_number: string; final_amount: number; delivery_date: string | null; created_at: string
    supplier_id: number | null; supplier_name: string | null
    payment_cycle_type: string | null; closing_day: number | null
    payment_month_offset: number | null; payment_day: number | null; terms: number
    materialized: number; pr_materialized: number
  }>()
  for (const po of poRows) {
    if (Number(po.materialized) > 0 || Number(po.pr_materialized) > 0) continue
    if (!(Number(po.final_amount) > 0)) continue
    const base = po.delivery_date || (po.created_at || '').substring(0, 10)
    if (!base) continue
    let due = computeExpectedPaymentDate(base, {
      payment_cycle_type: po.payment_cycle_type, payment_terms_days: po.terms,
      closing_day: po.closing_day, payment_month_offset: po.payment_month_offset, payment_day: po.payment_day,
    })
    if (due < from) due = from   // 연체 지급(예정일 경과)은 예측 시작일에 표시 (매출 §4b와 대칭)
    add(due, {
      flow: 'OUT', type: 'PURCHASE_EXPECTED',
      name: `${po.supplier_name || '공급사'} 지급예정 (발주 ${po.po_number})`,
      amount: Number(po.final_amount) || 0, materialized: false,
    })
  }

  // ── 5) 온더플라이: 법인카드 청구 예정 (CARD_EXPECTED) ──────────────────
  //   카드별 청구 = Σ card_transactions[직전 cutoff+1 ~ cutoff] → payment_day에 OUT.
  //   청산 cycle: payment_day > cutoff_day면 당월 마감분(동월결제), else 전월 마감분(익월결제).
  //   미마감/미래 cycle = 진행분 실적 + 잔여일 × 최근90일 일평균(AVG_3M). 일시불 가정(D1-가, 할부는 2차).
  //   이중계산 가드: cash_schedule source_type='CARD' OUT 있는 달은 §1에서 합산 → skip.
  const efCard = entityFilter(c, 'cc')
  const { results: cardRows } = await c.env.DB.prepare(`
    SELECT id, card_name, COALESCE(cutoff_day, 15) AS cutoff_day, COALESCE(payment_day, 15) AS payment_day
    FROM corporate_cards cc WHERE is_active = 1${efCard.clause}
  `).bind(...efCard.params).all<{ id: number; card_name: string; cutoff_day: number; payment_day: number }>()

  if (cardRows.length > 0) {
    const pad2 = (n: number) => String(n).padStart(2, '0')
    const toYmd = (d: Date) => `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`
    const ymdToDate = (s: string) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)))
    const addDays = (s: string, n: number) => { const d = ymdToDate(s); d.setUTCDate(d.getUTCDate() + n); return toYmd(d) }
    const daysInclusive = (a: string, b: string) => (b < a ? 0 : Math.round((ymdToDate(b).getTime() - ymdToDate(a).getTime()) / 86400000) + 1)

    // 오늘(KST) YYYYMMDD
    const todayRow = await c.env.DB.prepare(`SELECT strftime('%Y%m%d', date('now','+9 hours')) AS t`).first<{ t: string }>()
    const todayYmd = todayRow?.t || toYmd(new Date())

    // 거래 일괄 조회 (가장 이른 cycleStart + AVG_3M 90일 포함 → from-100일부터)
    const earliest = addDays(from.replace(/-/g, ''), -100)
    const latest = to.replace(/-/g, '')
    const efTx = entityFilter(c, 'ct')
    const { results: txRows } = await c.env.DB.prepare(`
      SELECT card_id, transaction_date, amount FROM card_transactions ct
      WHERE transaction_date BETWEEN ? AND ?${efTx.clause}
    `).bind(earliest, latest, ...efTx.params).all<{ card_id: number; transaction_date: string; amount: number }>()
    const txByCard = new Map<number, { d: string; a: number }[]>()
    for (const t of txRows) {
      const l = txByCard.get(t.card_id) ?? []
      l.push({ d: String(t.transaction_date), a: Number(t.amount) || 0 })
      txByCard.set(t.card_id, l)
    }

    // 이중계산 가드: 수동 카드 OUT(cash_schedule source_type='CARD')이 있는 달은 합성 skip
    const efCardCs = entityFilter(c, 'cs')
    const { results: manualCardCs } = await c.env.DB.prepare(`
      SELECT DISTINCT strftime('%Y-%m', cs.schedule_date) AS ym FROM cash_schedule cs
      WHERE cs.source_type = 'CARD' AND cs.flow_type = 'OUT' AND cs.status != 'CANCELLED'${efCardCs.clause}
    `).bind(...efCardCs.params).all<{ ym: string }>()
    const manualCardMonths = new Set(manualCardCs.map((r) => r.ym))

    const since90 = addDays(todayYmd, -90)
    for (const card of cardRows) {
      const tx = txByCard.get(card.id) ?? []
      const sum90 = tx.reduce((s, t) => (t.d >= since90 && t.d <= todayYmd ? s + t.a : s), 0)
      const dailyAvg = sum90 / 90
      for (const { y, m, lastDay } of months) {
        const ym = `${y}-${pad2(m)}`
        if (manualCardMonths.has(ym)) continue
        const payDay = Math.min(card.payment_day, lastDay)
        const paymentDate = `${y}-${pad2(m)}-${pad2(payDay)}`
        if (paymentDate < from || paymentDate > to) continue

        // 이 결제가 청산하는 cycle의 마감(close) 월
        const sameMonth = card.payment_day > card.cutoff_day
        let ccY = y, ccM = m
        if (!sameMonth) { ccM = m - 1; if (ccM === 0) { ccM = 12; ccY = y - 1 } }
        const ccLast = new Date(ccY, ccM, 0).getDate()
        const cutoff = Math.min(card.cutoff_day, ccLast)
        const cycleEnd = `${ccY}${pad2(ccM)}${pad2(cutoff)}`
        // cycleStart = 직전월 cutoff + 1일
        let psY = ccY, psM = ccM - 1; if (psM === 0) { psM = 12; psY = ccY - 1 }
        const psLast = new Date(psY, psM, 0).getDate()
        const prevCutoff = Math.min(card.cutoff_day, psLast)
        const cycleStart = addDays(`${psY}${pad2(psM)}${pad2(prevCutoff)}`, 1)

        const actualEnd = cycleEnd < todayYmd ? cycleEnd : todayYmd
        const actual = actualEnd >= cycleStart
          ? tx.reduce((s, t) => (t.d >= cycleStart && t.d <= actualEnd ? s + t.a : s), 0) : 0
        const projStart = todayYmd >= cycleStart ? addDays(todayYmd, 1) : cycleStart
        const projDays = cycleEnd >= projStart ? daysInclusive(projStart, cycleEnd) : 0
        const amount = Math.round(actual + projDays * dailyAvg)
        if (amount <= 0) continue
        const estimated = projDays > 0
        add(paymentDate, {
          flow: 'OUT', type: 'CARD_EXPECTED',
          name: `${card.card_name} 카드대금${estimated ? '·추정' : ''}`,
          amount, materialized: false, estimated,
        })
      }
    }
  }

  // ── 6) 온더플라이: 급여 (PAYROLL) — 회사 최대 월간 현금유출 (H2) ───────────
  //   이전: 급여는 어떤 자동 경로로도 cash_schedule에 안 들어와(수동등록만) 예측에서 통째 누락.
  //   payroll 레코드(PENDING/APPROVED/PAID)에서 합성:
  //     · 실지급액(net_pay) → pay_date에 OUT
  //     · 공제총액(total_deduction=4대보험 직원부담+원천세) → 귀속월(pay_period) 익월 10일 납부 OUT
  //   ⚠️ 4대보험 '회사부담분'은 payroll 테이블에 미저장 → 본 합성에 미포함(실제 유출은 이보다 큼, 추후 보완).
  //   dedup: 수동 PAYROLL cash_schedule(§1)이 있는 달은 합성 skip(이중계산 방지).
  const efPay = entityFilter(c)
  const { results: payRows } = await c.env.DB.prepare(`
    SELECT pay_period, pay_date, net_pay, total_deduction
    FROM payroll
    WHERE status IN ('PENDING', 'APPROVED', 'PAID') AND pay_date IS NOT NULL${efPay.clause}
  `).bind(...efPay.params).all<{
    pay_period: string; pay_date: string; net_pay: number; total_deduction: number
  }>()
  if (payRows.length > 0) {
    const efPayCs = entityFilter(c, 'cs')
    const { results: manualPay } = await c.env.DB.prepare(`
      SELECT DISTINCT strftime('%Y-%m', cs.schedule_date) AS ym FROM cash_schedule cs
      WHERE cs.source_type = 'PAYROLL' AND cs.flow_type = 'OUT' AND cs.status != 'CANCELLED'${efPayCs.clause}
    `).bind(...efPayCs.params).all<{ ym: string }>()
    const manualPayMonths = new Set(manualPay.map((r) => r.ym))
    // 'YYYY-MM' 귀속월 → 익월 10일 'YYYY-MM-10'
    const nextMonth10 = (period: string): string => {
      const [py, pm] = (period || '').split('-').map(Number)
      if (!py || !pm) return ''
      let ny = py, nm = pm + 1
      if (nm > 12) { nm = 1; ny++ }
      return `${ny}-${String(nm).padStart(2, '0')}-10`
    }
    for (const p of payRows) {
      const payDate = (p.pay_date || '').substring(0, 10)
      const payMonth = payDate.substring(0, 7)
      if (Number(p.net_pay) > 0 && payDate && !manualPayMonths.has(payMonth)) {
        add(payDate, {
          flow: 'OUT', type: 'PAYROLL',
          name: `급여 ${p.pay_period}`,
          amount: Number(p.net_pay) || 0, materialized: false,
        })
      }
      if (Number(p.total_deduction) > 0) {
        const remit = nextMonth10(p.pay_period)
        if (remit && !manualPayMonths.has(remit.substring(0, 7))) {
          add(remit, {
            flow: 'OUT', type: 'PAYROLL_TAX',
            name: `4대보험·원천세 ${p.pay_period}`,
            amount: Number(p.total_deduction) || 0, materialized: false,
          })
        }
      }
    }
  }

  return days
}
