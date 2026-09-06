// 자금 예측 공통 엔진 (하이브리드)
// 물질화(cash_schedule 행) + 온더플라이(고정비·대출·미청구주문) 합성을 단일 소스로 제공.
// forecast / monthly / calendar가 모두 이 헬퍼를 호출 → 화면 간 숫자 일치.
// calendar는 carryOverdueToStart:false(월뷰 — 연체를 원래 예정일에 표시).
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
import { cardNetAmountSql, cardSpendFilterSql } from './cardSpend'
import { excludePurchaseNonCounterpartiesSql } from '../constants/intercompany'
import { excludeArExcludedClientsSql } from '../constants/arPolicy'
import { settleApFifo, type ApObligation, type ApSettlementEvent } from './apSettlement'
import {
  paymentRunRate, runRateFromMonthly, medianPaymentDay, medianDayFromCounts,
  median, spreadOverdue, daysBetween, type RunRate,
} from './overdueSpread'

export interface CashflowItem {
  flow: 'IN' | 'OUT'
  type: string                    // ORDER | PURCHASE | FIXED | LOAN | ORDER_EXPECTED | TAX | ...
  name: string
  amount: number
  status?: string
  materialized: boolean           // true=cash_schedule 행(은행매칭 DONE 대상), false=온더플라이
  schedule_id?: number            // 물질화 행 id
  estimated?: boolean             // true=과거 실적 추정치(변동비, 확정 전)
  /** 입금예정 중 이미 회수된 금액(파생 FIFO 충당). amount는 '잔여'라 이 값만큼 이미 들어와 있다. */
  settled_amount?: number
  /** 연체 이월(carryOverdueToStart)로 from에 당겨온 항목의 '원래 예정일'.
   *  없으면 표시일 = 예정일. 이게 없으면 달력(원 날짜)과 월별·예측(이월 후)의 같은 달 합계가 조용히 어긋난다. */
  carried_from?: string
  /** 예상입금 근거: BILLED=청구완료 미수 · UNBILLED=미청구 확정주문 추정. 화면 배지용. */
  basis?: 'BILLED' | 'UNBILLED'
}

export interface CashflowDay {
  date: string                    // YYYY-MM-DD
  in: number
  out: number
  items: CashflowItem[]
}

export interface CashflowOptions {
  /** true(기본)=연체·기한경과 항목을 from으로 끌어옴(예측용 — 즉시 회수·지급 대상).
   *  false=원래 예정일 유지(달력 월뷰용 — 범위 밖 연체는 해당 월에서만 표시). */
  carryOverdueToStart?: boolean
  /** 연체(매입 지급 · 매출 수금)를 실적 런레이트로 분산할지. carryOverdueToStart 가 true 일 때만 의미가 있다.
   *  false = 예측 첫날 일괄(구 동작). 달력 월뷰는 원래 예정일을 지켜야 하므로 호출부가 끈다.
   *  ★매입·매출을 한 스위치로 묶는다 — 한쪽만 분산하면 유출은 여러 달에 깔리고 유입은 첫날에 뭉쳐
   *    곡선이 「첫날 급등 후 우하향」이 되어 고치기 전보다 더 오해를 부른다. */
  spreadOverdue?: boolean
  /** 진단 out-param — 엔진이 채워 준다. 엔진을 두 번 부르지 않고 대사 결과를 꺼내기 위한 통로. */
  diagnostics?: { ap?: ApDiagnostics; ar?: ArDiagnostics }
}

/** 매입 지급예정 ↔ 실제 지급 대사 결과. 숫자를 화면에 그대로 적기 위한 것이라 전부 원 단위. */
export interface ApDiagnostics {
  /** 대사 대상 채무 총액(취소 발주·제외 거래처 뺀 값) */
  obligation_total: number
  obligation_count: number
  /** FIFO 로 이미 지급된 것으로 판정된 금액 */
  settled_total: number
  /** 아직 안 나간 돈 */
  remaining_total: number
  /** 잔여 중 만기가 이미 지난 것 */
  overdue_total: number
  overdue_count: number
  /** 발주 없이 지급만 있는 금액 */
  unapplied_total: number
  /** 그게 어느 거래처인지 — 총액만으로는 아무도 못 고친다 */
  unapplied_suppliers: { name: string; amount: number }[]
  /** 내부법인·관계사라서 제외한 금액 — 회계허브 내부거래 탭에서 본다 */
  excluded_total: number
  excluded_count: number
  /** 취소된 발주인데 예정 행이 남아 있어 걷어낸 금액 */
  cancelled_total: number
  cancelled_count: number
  /** 실지급 월평균(완결월 기준) */
  run_rate: number
  run_rate_months: number
  run_rate_basis: string
  /** 연체 분산 회차 수(0 = 분산 안 함) */
  spread_months: number
  /** 지급 입력이 있는 마지막 달 · 마지막 지급일 · 오늘까지의 지연 일수 */
  last_payment_month: string | null
  last_payment_date: string | null
  entry_lag_days: number | null
  /** 입력이 한 달 넘게 멈췄나 — true 면 '연체'의 상당분이 미입력일 수 있다. */
  entry_stalled: boolean
  /** 관측 지연 = FIFO 가 닫은 건의 (실제 지급일 − 예정일) 중앙값. 명목 결제조건과 실제 습성의 차이. */
  observed_lag_days: number | null
  observed_lag_samples: number
  /** 잔여가 큰데 지급 입력이 오래 멈춘 공급처 — '연체'가 아니라 '미입력'일 수 있는 후보 */
  lagging_suppliers: { name: string; remaining: number; last_payment_date: string | null; days: number | null }[]
}

/** 관측 지연 중앙값을 내놓기 위한 최소 표본 수. */
const MIN_LAG_SAMPLES = 10

/** 입력이 「멈췄다」고 볼 기준(일). 한 달치가 통째로 비면 그 달의 실적을 아예 모르는 상태이고,
 *  화면의 '연체'는 미지급·미회수가 아니라 **미입력**일 가능성이 높다.
 *  ★임의값이 아니라 런레이트의 단위(월)에서 나온 값이다 — 30일을 넘으면 완결월 하나가 통째로 빈다.
 *  ⚠️ 판정을 서버에 두는 이유: 화면 두 곳(매입·매출)이 각자 숫자를 들고 비교하면 기준이 갈린다. */
const ENTRY_STALL_DAYS = 30

/** 매출 수금 연체 분산의 근거. 매입(ApDiagnostics)과 같은 축만 담는다 — 다르면 화면이 둘을 못 나란히 놓는다. */
export interface ArDiagnostics {
  /** 연체(만기 경과) 미수 잔여 */
  overdue_total: number
  overdue_count: number
  /** 실제 수금 월평균(완결월 기준) */
  run_rate: number
  run_rate_months: number
  run_rate_basis: string
  /** 연체 분산 회차 수(0 = 분산 안 함) */
  spread_months: number
  last_receipt_month: string | null
  last_receipt_date: string | null
  entry_lag_days: number | null
  entry_stalled: boolean
}

/** §0b(대사)와 §4.5(합성)가 같은 발주 목록을 쓴다 — 두 번 조회하지 않기 위해 형태를 공유한다. */
interface PoRow {
  id: number; po_number: string; final_amount: number; delivery_date: string | null; created_at: string
  supplier_id: number | null; entity_id: number | null; supplier_name: string | null
  payment_cycle_type: string | null; closing_day: number | null
  payment_month_offset: number | null; payment_day: number | null; terms: number
  materialized: number; pr_materialized: number
}

/** 발주의 지급 예정일 = (납기 또는 등록일) + 공급처 결제조건. 근거 날짜가 없으면 ''. */
function poExpectedDate(po: PoRow): string {
  const base = po.delivery_date || (po.created_at || '').substring(0, 10)
  if (!base) return ''
  return computeExpectedPaymentDate(base, {
    payment_cycle_type: po.payment_cycle_type, payment_terms_days: po.terms,
    closing_day: po.closing_day, payment_month_offset: po.payment_month_offset, payment_day: po.payment_day,
  })
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
  to: string,
  opts: CashflowOptions = {}
): Promise<Record<string, CashflowDay>> {
  const carryOverdue = opts.carryOverdueToStart !== false
  const doSpread = carryOverdue && opts.spreadOverdue === true
  // 채권·채무 집계에서 빼는 거래처 — **여기서 정책을 새로 정하지 않는다.**
  //   AR = 내부법인 3사 + 현금소매 더미(constants/arPolicy) · AP = 내부법인 3사 + 관계사(constants/intercompany).
  //   AP 원장·재무제표·미수금 화면이 이미 이 SSOT 를 쓰는데 자금 예측만 안 써서, 같은 거래처가
  //   원장에선 빠지고 예측에선 잡히는 상태였다(prod 실측 매입 460,286,796 · 매출 275,326,225).
  //   내부거래는 회계허브 「내부거래 채권·채무」 탭이 흡수한다 → 예측에서 빼도 볼 곳이 남는다.
  const arExcl = excludeArExcludedClientsSql            // (col) => ' AND ...'
  const apExcl = excludePurchaseNonCounterpartiesSql
  const days: Record<string, CashflowDay> = {}
  const ensure = (d: string): CashflowDay => (days[d] ??= { date: d, in: 0, out: 0, items: [] })
  const add = (date: string, item: CashflowItem) => {
    if (date < from || date > to) return
    const day = ensure(date)
    if (item.flow === 'IN') day.in += item.amount
    else day.out += item.amount
    day.items.push(item)
  }

  // ── 0) 입금예정의 '이미 회수된 금액'을 파생으로 구한다 (FIFO 충당) ─────────
  //   payments·adjustments에는 '어느 예정 행을 갚은 것인지' 기록이 없다 → 거래처×법인 안에서 예정일 순으로 충당한다.
  //   ⚠️ 충당 결과를 테이블에 저장하지 않는 이유: 수금 생성 경로가 둘(은행매칭 bank.ts·원장등록 ledger/ar-payments.ts)이고
  //      삭제 경로도 둘이라, 저장하면 네 곳 모두에 충당·복원을 심어야 하고 하나만 빠지면 예정이 영영 굳는다.
  //      실제로 bank.ts는 입금 적용 때 DONE을 찍으면서 적용 취소 때 되돌리지 않아 그 상태였다.
  //      파생이면 수금을 지우는 순간 다음 조회에서 저절로 복구된다. [[design-ar-overdue-fifo]] 와 같은 방식.
  const ckeyOf = (cid: number, eid: number) => cid + ':' + eid
  const efArCs = entityFilter(c, 'cs')
  const { results: arScheduleRows } = await c.env.DB.prepare(`
    SELECT cs.id, cs.client_id, cs.entity_id, cs.schedule_date, cs.amount, cs.status, cs.actual_amount
    FROM cash_schedule cs
    WHERE cs.flow_type = 'IN' AND cs.source_type = 'ORDER'
      AND cs.status != 'CANCELLED' AND cs.client_id IS NOT NULL${efArCs.clause}${arExcl('cs.client_id')}
    ORDER BY cs.client_id, cs.entity_id, cs.schedule_date, cs.id
  `).bind(...efArCs.params).all<{
    id: number; client_id: number; entity_id: number; schedule_date: string
    amount: number; status: string; actual_amount: number | null
  }>()

  /** 예정 행 id → 이미 회수된 금액 */
  const settledById = new Map<number, number>()
  /** 거래처×법인 → 미회수 예정 잔여 합계 (§4b 미수 residual에서 차감) */
  const pendingRemainByCE = new Map<string, number>()
  /** payments·adjustments 집계 — §4b도 같은 값을 쓰므로 한 번만 조회해 공유한다 */
  let arAggCache: { paid: Map<string, number>; adj: Map<string, number> } | null = null
  const loadArAgg = async () => {
    if (arAggCache) return arAggCache
    const efP = entityFilter(c)
    const efA = entityFilter(c)
    const [pAgg, aAgg] = await Promise.all([
      c.env.DB.prepare(`SELECT client_id, entity_id, COALESCE(SUM(amount), 0) AS v FROM payments WHERE 1=1${efP.clause}${arExcl('client_id')} GROUP BY client_id, entity_id`).bind(...efP.params).all<{ client_id: number; entity_id: number; v: number }>(),
      c.env.DB.prepare(`SELECT client_id, entity_id, COALESCE(SUM(amount), 0) AS v FROM adjustments WHERE 1=1${efA.clause}${arExcl('client_id')} GROUP BY client_id, entity_id`).bind(...efA.params).all<{ client_id: number; entity_id: number; v: number }>(),
    ])
    const paid = new Map<string, number>(), adj = new Map<string, number>()
    for (const r of pAgg.results) paid.set(ckeyOf(r.client_id, r.entity_id), Number(r.v) || 0)
    for (const r of aAgg.results) adj.set(ckeyOf(r.client_id, r.entity_id), Number(r.v) || 0)
    arAggCache = { paid, adj }
    return arAggCache
  }

  if (arScheduleRows.length > 0) {
    const { paid, adj } = await loadArAgg()
    const byCEsched = new Map<string, typeof arScheduleRows>()
    for (const r of arScheduleRows) {
      const k = ckeyOf(r.client_id, r.entity_id)
      const list = byCEsched.get(k) ?? []
      list.push(r)
      byCEsched.set(k, list)
    }
    for (const [k, list] of byCEsched) {
      // 수동 완료(DONE)로 처리된 행은 이미 해결된 건이므로 충당 대상에서 빼되,
      // 그 금액만큼 회수 풀에서도 뺀다 — 안 그러면 같은 입금이 다른 예정을 한 번 더 지운다.
      let pool = (paid.get(k) || 0) + (adj.get(k) || 0)
      for (const r of list) {
        if (r.status !== 'DONE') continue
        pool -= Number(r.actual_amount ?? r.amount) || 0
      }
      if (pool < 0) pool = 0
      let remainSum = 0
      for (const r of list) {                       // 이미 schedule_date, id 순으로 정렬돼 있다
        const amt = Number(r.amount) || 0
        if (r.status === 'DONE') { settledById.set(r.id, Number(r.actual_amount ?? r.amount) || 0); continue }
        const take = Math.min(pool, amt)
        if (take > 0) { settledById.set(r.id, take); pool -= take }
        remainSum += Math.max(0, amt - take)
      }
      pendingRemainByCE.set(k, remainSum)
    }
  }

  // ── 0b) 매입 지급예정의 '이미 지급된 금액'을 파생으로 구한다 (FIFO 충당) — 매출 §0 대칭 ──
  //   왜 필요했나: 매출은 §0 이 회수분을 빼는데 매입은 아무것도 안 뺐다. prod 실측(2026-09-05)에서
  //   확정발주 3,737,785,592 중 **이미 지급한 2,483,414,286 이 계속 '앞으로 낼 돈'** 으로 잡혀
  //   예측 첫날 잔액을 −21억으로 만들고 위험일을 91/91 로 고정시켰다.
  //   발주↔지급을 잇는 기록은 사실상 없다(purchase_payments 536건 중 po_id 있는 건 1건) → 공급처×법인 FIFO.
  //   판정 로직은 utils/apSettlement.ts(순수 모듈). 여기서는 데이터만 모은다.
  const apSettledByRef = new Map<string, number>()
  let apDiag: ApDiagnostics | null = null
  let poRows: PoRow[] = []
  let apEvents: ApSettlementEvent[] = []
  {
    const efApCs = entityFilter(c, 'cs')
    const efApPo = entityFilter(c, 'po')
    const efPp = entityFilter(c)
    const efPa = entityFilter(c)
    const [csApRes, poRes, ppRes, paRes] = await Promise.all([
      // 물질화된 지급예정 — 창(from..to) 밖도 전부 본다. 충당은 기간이 아니라 잔액의 문제라서다.
      c.env.DB.prepare(`
        SELECT cs.id, cs.client_id, cs.entity_id, cs.schedule_date, cs.amount, cs.status, cs.actual_amount,
               cs.source_id, po.status AS po_status,
               COALESCE(po.delivery_date, substr(po.created_at, 1, 10)) AS po_base
        FROM cash_schedule cs
        LEFT JOIN purchase_orders po ON po.id = cs.source_id
        WHERE cs.flow_type = 'OUT' AND cs.source_type = 'PURCHASE'
          AND cs.status != 'CANCELLED' AND cs.client_id IS NOT NULL${efApCs.clause}${apExcl('cs.client_id')}
        ORDER BY cs.schedule_date, cs.id
        LIMIT 5000
      `).bind(...efApCs.params).all<{
        id: number; client_id: number; entity_id: number; schedule_date: string
        amount: number; status: string; actual_amount: number | null
        source_id: number | null; po_status: string | null; po_base: string | null
      }>(),
      c.env.DB.prepare(`
        SELECT po.id, po.po_number, po.final_amount, po.delivery_date, po.created_at,
               po.supplier_id, po.entity_id, s.client_name AS supplier_name,
               s.payment_cycle_type, s.closing_day, s.payment_month_offset, s.payment_day,
               COALESCE(s.payment_terms_days, 30) AS terms,
               (SELECT COUNT(*) FROM cash_schedule cs WHERE cs.source_type = 'PURCHASE' AND cs.source_id = po.id AND cs.status != 'CANCELLED') AS materialized,
               (SELECT COUNT(*) FROM payment_requests pr WHERE pr.related_po_id = po.id AND pr.status IN ('APPROVED', 'PAID')) AS pr_materialized
        FROM purchase_orders po
        LEFT JOIN clients s ON s.id = po.supplier_id
        WHERE po.status IN ('CONFIRMED', 'RECEIVED', 'PARTIAL_RECEIVED')${efApPo.clause}${apExcl('po.supplier_id')}
        ORDER BY po.id
        LIMIT 2000
      `).bind(...efApPo.params).all<PoRow>(),
      c.env.DB.prepare(`
        SELECT supplier_id, entity_id, substr(payment_date, 1, 10) AS d, amount
        FROM purchase_payments WHERE 1=1${efPp.clause}${apExcl('supplier_id')}
        ORDER BY d, id LIMIT 20000
      `).bind(...efPp.params).all<{ supplier_id: number; entity_id: number; d: string; amount: number }>(),
      c.env.DB.prepare(`
        SELECT supplier_id, entity_id, substr(adjustment_date, 1, 10) AS d, amount
        FROM purchase_adjustments WHERE 1=1${efPa.clause}${apExcl('supplier_id')}
        ORDER BY d, id LIMIT 20000
      `).bind(...efPa.params).all<{ supplier_id: number; entity_id: number; d: string; amount: number }>(),
    ])

    poRows = poRes.results
    const events = apEvents
    for (const r of ppRes.results) {
      events.push({ supplierId: r.supplier_id, entityId: Number(r.entity_id) || 0, date: r.d, amount: Number(r.amount) || 0, kind: 'PAYMENT' })
    }
    for (const r of paRes.results) {
      events.push({ supplierId: r.supplier_id, entityId: Number(r.entity_id) || 0, date: r.d, amount: Number(r.amount) || 0, kind: 'ADJUSTMENT' })
    }

    const obligations: ApObligation[] = []
    let cancelledTotal = 0, cancelledCount = 0
    for (const r of csApRes.results) {
      // 취소된 발주인데 예정 행이 안 지워진 것 — 채무가 아니다. prod 실측 28건 52,006,174.
      // 「수정·삭제가 안 따라온다」의 재발이라 여기서 걷어내되, 몇 건인지 진단에 남겨 사람이 지울 수 있게 한다.
      // 취소·초안이거나, 발주 행이 아예 사라진 것(하드 삭제 잔재) — 셋 다 채무가 아니다.
      if (r.po_status === 'CANCELLED' || r.po_status === 'DRAFT' || (r.source_id != null && r.po_status === null)) {
        cancelledTotal += Number(r.amount) || 0; cancelledCount++; continue
      }
      obligations.push({
        ref: 'cs:' + r.id, supplierId: r.client_id, entityId: Number(r.entity_id) || 0,
        due: r.schedule_date, amount: Number(r.amount) || 0,
        notBefore: r.po_base || undefined,
        ...(r.status === 'DONE' ? { done: true, doneAmount: Number(r.actual_amount ?? r.amount) || 0 } : {}),
      })
    }
    for (const po of poRows) {
      if (Number(po.materialized) > 0 || Number(po.pr_materialized) > 0) continue
      if (!(Number(po.final_amount) > 0)) continue
      const due = poExpectedDate(po)
      if (!due) continue
      obligations.push({
        ref: 'po:' + po.id, supplierId: Number(po.supplier_id) || 0, entityId: Number(po.entity_id) || 0,
        due, amount: Number(po.final_amount) || 0,
        notBefore: po.delivery_date || (po.created_at || '').substring(0, 10),
      })
    }

    const settled = settleApFifo(obligations, events)
    for (const [k, v] of settled.settledByRef) apSettledByRef.set(k, v)

    // ── 진단: 「지급 예정을 실제와 비교해서 추측」의 근거를 숫자로 남긴다 ──
    // 제외한 금액은 위 쿼리가 이미 걸러 버려서 셀 수가 없다 → 제외 대상만 따로 한 번 센다.
    //   숨기는 게 아니라 옮기는 것임을 화면이 말할 수 있어야 한다("회계허브 내부거래 탭에서 확인").
    const efEx = entityFilter(c, 'po')
    const exclRow = await c.env.DB.prepare(`
      SELECT COUNT(*) AS n, COALESCE(SUM(po.final_amount), 0) AS v
      FROM purchase_orders po
      WHERE po.status IN ('CONFIRMED', 'RECEIVED', 'PARTIAL_RECEIVED')${efEx.clause}
        AND NOT (1=1${apExcl('po.supplier_id')})
    `).bind(...efEx.params).first<{ n: number; v: number }>()
    const rr = paymentRunRate(events)
    let obligationTotal = 0, remainingTotal = 0, overdueTotal = 0, overdueCount = 0
    const remainBySupplier = new Map<number, number>()
    for (const o of obligations) {
      const amt = Number(o.amount) || 0
      obligationTotal += amt
      const rem = Math.max(0, amt - (apSettledByRef.get(o.ref) || 0))
      remainingTotal += rem
      if (rem > 0) {
        remainBySupplier.set(o.supplierId, (remainBySupplier.get(o.supplierId) || 0) + rem)
        if (o.due < from) { overdueTotal += rem; overdueCount++ }
      }
    }
    const lastPayDate = ppRes.results.length > 0 ? ppRes.results[ppRes.results.length - 1].d : null
    const nameOf = new Map<number, string>()
    for (const po of poRows) if (po.supplier_id) nameOf.set(po.supplier_id, po.supplier_name || '공급사')
    const lastPayBySupplier = new Map<number, string>()
    for (const r of ppRes.results) lastPayBySupplier.set(r.supplier_id, r.d)   // 날짜 오름차순이라 마지막이 최신
    // 발주 없이 지급만 있는 거래처는 poRows 에 없어 이름을 모른다 → 상위 8곳만 따로 찾는다(있을 때만).
    const unappliedTop = [...settled.unappliedBySupplier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    const unappliedNames = new Map<number, string>()
    if (unappliedTop.length > 0) {
      const ids = unappliedTop.map(([sid]) => sid)
      const { results: nmRows } = await c.env.DB.prepare(
        `SELECT id, client_name FROM clients WHERE id IN (${ids.map(() => '?').join(',')})`
      ).bind(...ids).all<{ id: number; client_name: string | null }>()
      for (const r of nmRows) unappliedNames.set(r.id, r.client_name || '')
    }

    const lagging = [...remainBySupplier.entries()]
      .map(([sid, remaining]) => {
        const lp = lastPayBySupplier.get(sid) ?? null
        return { name: nameOf.get(sid) || `공급사#${sid}`, remaining, last_payment_date: lp, days: lp ? daysBetween(lp, from) : null }
      })
      .sort((a, b) => b.remaining - a.remaining)
      .slice(0, 8)

    apDiag = {
      obligation_total: Math.round(obligationTotal), obligation_count: obligations.length,
      settled_total: Math.round(obligationTotal - remainingTotal), remaining_total: Math.round(remainingTotal),
      overdue_total: Math.round(overdueTotal), overdue_count: overdueCount,
      unapplied_total: Math.round(settled.unappliedTotal),
      unapplied_suppliers: unappliedTop.map(([sid, amount]) => ({
        name: nameOf.get(sid) || unappliedNames.get(sid) || `공급사#${sid}`, amount: Math.round(amount),
      })),
      excluded_total: Math.round(Number(exclRow?.v) || 0), excluded_count: Number(exclRow?.n) || 0,
      cancelled_total: Math.round(cancelledTotal), cancelled_count: cancelledCount,
      run_rate: rr.rate, run_rate_months: rr.months, run_rate_basis: rr.basis,
      spread_months: 0,
      last_payment_month: rr.lastMonth, last_payment_date: lastPayDate,
      entry_lag_days: lastPayDate ? daysBetween(lastPayDate, from) : null,
      entry_stalled: !!lastPayDate && (daysBetween(lastPayDate, from) ?? 0) > ENTRY_STALL_DAYS,
      // 표본이 적으면 중앙값을 내지 않는다 — 몇 건짜리 중앙값을 '우리 회사 지급 습성'으로 읽으면 안 된다.
      observed_lag_days: settled.lagSamples.length >= MIN_LAG_SAMPLES ? median(settled.lagSamples) : null,
      observed_lag_samples: settled.lagSamples.length,
      lagging_suppliers: lagging,
    }
  }

  /** 물질화 예정 행의 표시 금액 = 아직 안 들어온 잔여. 이미 받은 몫은 은행 잔액에 있으므로 예정에 또 세면 이중계상이다. */
  const remainingOf = (row: { id: number; amount: number; status: string; actual_amount: number | null }, isArRow: boolean, isApRow = false) => {
    const amt = Number(row.amount) || 0
    if (isApRow) {
      const settled = apSettledByRef.get('cs:' + row.id) ?? (row.status === 'DONE' ? (Number(row.actual_amount ?? row.amount) || 0) : 0)
      return { remaining: Math.max(0, amt - settled), settled }
    }
    if (!isArRow) return { remaining: row.status === 'DONE' ? (Number(row.actual_amount ?? row.amount) || 0) : amt, settled: 0 }
    const settled = settledById.get(row.id) ?? (row.status === 'DONE' ? (Number(row.actual_amount ?? row.amount) || 0) : 0)
    return { remaining: Math.max(0, amt - settled), settled }
  }
  const isApRow = (r: { flow_type: string; source_type: string }) => r.flow_type === 'OUT' && r.source_type === 'PURCHASE'
  /** 지급예정 행의 근거 발주가 사라졌거나 취소된 것 — 채무가 아니다.
   *  ★`source_id` 는 있는데 `po_status` 가 없으면 **발주 행이 하드 삭제된 잔재**다.
   *    상태 조인으로는 안 걸러지므로(null 은 CANCELLED 가 아니다) 여기서 명시적으로 뺀다. */
  const isCancelledPurchaseRow = (r: { source_type: string; source_id?: number | null; po_status: string | null }) =>
    r.source_type === 'PURCHASE' &&
    (r.po_status === 'CANCELLED' || r.po_status === 'DRAFT' || (r.source_id != null && r.po_status === null))

  // ── 1) 물질화: cash_schedule (FIXED 제외) ──────────────────────────────
  const efCs = entityFilter(c, 'cs')
  //   제외 거래처는 행 유형별로 다르다(AR=매출 정책·AP=매입 정책) → 유형이 맞을 때만 제외를 건다.
  //   `(1=1 ...)` 로 감싸는 건 SSOT 헬퍼가 ' AND a AND b' 형태를 돌려주기 때문 — 문자열을 쪼개지 않고 그대로 쓴다.
  const { results: csRows } = await c.env.DB.prepare(`
    SELECT cs.id, cs.schedule_date, cs.flow_type, cs.source_type, cs.amount,
           cs.description, cs.status, cs.actual_amount, cs.client_id, cs.entity_id, cs.source_id,
           cl.client_name, po.status AS po_status
    FROM cash_schedule cs
    LEFT JOIN clients cl ON cl.id = cs.client_id
    LEFT JOIN purchase_orders po ON cs.source_type = 'PURCHASE' AND po.id = cs.source_id
    WHERE cs.schedule_date BETWEEN ? AND ?
      AND cs.status != 'CANCELLED'
      AND cs.source_type != 'FIXED'${efCs.clause}
      AND (cs.flow_type != 'IN'  OR cs.source_type != 'ORDER'    OR (1=1${arExcl('cs.client_id')}))
      AND (cs.flow_type != 'OUT' OR cs.source_type != 'PURCHASE' OR (1=1${apExcl('cs.client_id')}))
  `).bind(from, to, ...efCs.params).all<{
    id: number; schedule_date: string; flow_type: string; source_type: string
    amount: number; description: string | null; status: string
    actual_amount: number | null; client_id: number | null; entity_id: number | null
    source_id: number | null; client_name: string | null; po_status: string | null
  }>()
  for (const r of csRows) {
    const isAr = r.flow_type === 'IN' && r.source_type === 'ORDER'
    if (isCancelledPurchaseRow(r)) continue
    const { remaining, settled } = remainingOf(r, isAr, isApRow(r))
    if (isApRow(r) && remaining <= 0) continue    // 전액 지급됨 — 예정으로 또 세면 이중계상
    add(r.schedule_date, {
      flow: r.flow_type === 'IN' ? 'IN' : 'OUT',
      type: r.source_type,
      name: r.description || r.client_name || r.source_type,
      amount: remaining,
      // 잔여가 0이면 물리 status가 아직 PENDING이어도 회수 완료다(은행매칭이 못 잡은 부분·합산 입금).
      status: isAr && remaining <= 0 ? 'DONE' : r.status,
      materialized: true,
      schedule_id: r.id,
      ...(settled > 0 ? { settled_amount: settled } : {}),
    })
  }

  // ── 1b) 연체(과거일) 물질화 항목을 from으로 끌어옴 (H7) ────────────────────
  //   §1은 schedule_date BETWEEN from..to라 예측창 이전의 PENDING/OVERDUE가 통째로 빠진다.
  //   연체 미수/지급은 즉시 회수·지급 대상이므로 from(예측 시작일)에 표시(§4b 미수 from-clamp와 대칭).
  //   FIXED 제외(온더플라이 통일)·CANCELLED 제외. DONE은 이미 정산분이라 과거에 남김.
  //   ※ ORDER 연체분은 §4b residual의 mAgg(전 기간 PENDING/OVERDUE)에서 차감되고 §4b 합성 대상(materialized=0)도 아니므로
  //     여기서 from에 표시해도 이중계산 없음.
  /** 연체 풀 — doSpread 일 때 from 에 얹지 않고 여기 모았다가 §4.6(매입)·§4.7(매출)에서 런레이트로 나눈다. */
  const apOverduePool: { name: string; amount: number; due: string }[] = []
  const arOverduePool: { name: string; amount: number; due: string }[] = []
  if (carryOverdue) {
    const efOv = entityFilter(c, 'cs')
    const { results: ovRows } = await c.env.DB.prepare(`
      SELECT cs.id, cs.schedule_date, cs.flow_type, cs.source_type, cs.amount, cs.description, cs.status,
             cs.source_id, cl.client_name, po.status AS po_status
      FROM cash_schedule cs
      LEFT JOIN clients cl ON cl.id = cs.client_id
      LEFT JOIN purchase_orders po ON cs.source_type = 'PURCHASE' AND po.id = cs.source_id
      WHERE cs.schedule_date < ?
        AND cs.status IN ('PENDING', 'OVERDUE')
        AND cs.source_type != 'FIXED'${efOv.clause}
        AND (cs.flow_type != 'IN'  OR cs.source_type != 'ORDER'    OR (1=1${arExcl('cs.client_id')}))
        AND (cs.flow_type != 'OUT' OR cs.source_type != 'PURCHASE' OR (1=1${apExcl('cs.client_id')}))
    `).bind(from, ...efOv.params).all<{
      id: number; schedule_date: string; flow_type: string; source_type: string; amount: number
      description: string | null; status: string; source_id: number | null
      client_name: string | null; po_status: string | null
    }>()
    for (const r of ovRows) {
      const isAr = r.flow_type === 'IN' && r.source_type === 'ORDER'
      const isAp = isApRow(r)
      if (isCancelledPurchaseRow(r)) continue
      // 부분수금된 연체는 잔여만 끌어온다. 전액 회수됐으면(은행매칭이 못 잡은 합산 입금 등) 연체가 아니다.
      const { remaining, settled } = remainingOf({ ...r, actual_amount: null }, isAr, isAp)
      if ((isAr || isAp) && remaining <= 0) continue
      const label = `${r.description || r.client_name || r.source_type} (연체)`
      if (isAp && doSpread) { apOverduePool.push({ name: label, amount: remaining, due: r.schedule_date }); continue }
      if (isAr && doSpread) { arOverduePool.push({ name: label, amount: remaining, due: r.schedule_date }); continue }
      add(from, {
        flow: r.flow_type === 'IN' ? 'IN' : 'OUT',
        type: r.source_type,
        name: label,
        amount: remaining,
        status: r.status,
        materialized: true,
        schedule_id: r.id,
        carried_from: r.schedule_date,
        ...(settled > 0 ? { settled_amount: settled } : {}),
      })
    }
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
  //   A1: PARTIAL은 total_amount 전액이 아닌 잔여(total − 기납부)만 계상. A2: 최근 과거미납(from-31d~)을 from으로 끌어옴(매출 §4b 대칭).
  const efLoan = entityFilter(c)
  const { results: loanRows } = await c.env.DB.prepare(`
    SELECT lp.scheduled_date, lp.total_amount, lp.actual_paid_amount, lp.status, l.creditor
    FROM loan_payments lp
    JOIN loans l ON lp.loan_id = l.id
    WHERE lp.scheduled_date >= ${carryOverdue ? "date(?, '-31 days')" : '?'} AND lp.scheduled_date <= ?
      AND lp.status IN ('SCHEDULED', 'OVERDUE', 'PARTIAL')${efLoan.clause.replace('entity_id', 'l.entity_id')}
  `).bind(from, to, ...efLoan.params).all<{
    scheduled_date: string; total_amount: number; actual_paid_amount: number | null; status: string; creditor: string
  }>()
  for (const lp of loanRows) {
    const remaining = (Number(lp.total_amount) || 0) - (Number(lp.actual_paid_amount) || 0)
    if (remaining <= 0) continue
    const carried = carryOverdue && lp.scheduled_date < from
    const due = carried ? from : lp.scheduled_date  // 과거 미납분은 예측 시작일에 표시
    add(due, {
      flow: 'OUT', type: 'LOAN', name: `${lp.creditor} 상환`,
      amount: remaining, status: lp.status, materialized: false,
      ...(carried ? { carried_from: lp.scheduled_date } : {}),
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
           (SELECT COUNT(*) FROM cash_schedule cs WHERE cs.source_type = 'ORDER' AND cs.source_id = g.order_id AND cs.entity_id = g.entity_id AND cs.status != 'CANCELLED') AS materialized
    FROM order_billing_groups g
    JOIN orders o ON o.id = g.order_id
    LEFT JOIN clients cl ON cl.id = o.client_id
    WHERE o.status NOT IN ('CANCELLED', 'DRAFT')${efG.clause}${arExcl('o.client_id')}
    ORDER BY o.delivery_date IS NULL, o.delivery_date ASC, g.order_id ASC, g.entity_id ASC
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
      amount: Number(g.amount) || 0, materialized: false, basis: 'UNBILLED',
    })
  }

  // 4b) 청구 그룹(BILLED·미물질화) → 미수 예상입금. cap = (거래처×법인) 파생 미수잔여.
  //   파생잔여 = Σ BILLED그룹 − payments − adjustments − 물질화 예정의 '미회수 잔여'(전 기간).
  //   (clients.balance P3 폐기 → 파생. 물질화분은 §1에서 별도 표시 → 잔여만 분배해 이중계산 방지.)
  //   ⚠️ 물질화분을 예정 '전액'으로 빼면 안 된다 — §1이 잔여만 표시하도록 바뀌었으므로 여기서도 잔여로 빼야
  //      총합(§1 잔여 + §4b 합성)이 실제 미수와 맞는다. §0에서 계산한 pendingRemainByCE가 그 값이다.
  const billedGroups = grpRows.filter(g => g.billing_status === 'BILLED' && Number(g.materialized) === 0 && Number(g.amount) > 0)
  if (billedGroups.length > 0) {
    const ckey = ckeyOf
    const { paid: paidByCE, adj: adjByCE } = await loadArAgg()   // §0과 동일 집계 — 재조회하지 않는다
    const { results: bAggRows } = await c.env.DB.prepare(`SELECT o.client_id, g.entity_id, COALESCE(SUM(g.billed_amount), 0) AS v FROM order_billing_groups g JOIN orders o ON o.id = g.order_id WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${efG.clause}${arExcl('o.client_id')} GROUP BY o.client_id, g.entity_id`).bind(...efG.params).all<{ client_id: number; entity_id: number; v: number }>()
    const billedByCE = new Map<string, number>()
    for (const r of bAggRows) billedByCE.set(ckey(r.client_id, r.entity_id), Number(r.v) || 0)
    const matByCE = pendingRemainByCE
    const residualByCE = new Map<string, number>()
    for (const k of billedByCE.keys()) {
      residualByCE.set(k, Math.max(0, (billedByCE.get(k) || 0) - (paidByCE.get(k) || 0) - (adjByCE.get(k) || 0) - (matByCE.get(k) || 0)))
    }

    // (거래처×법인)별 그룹 → 예상입금일 오름차순(빠른 건부터) 분배, 그룹 금액 상한, 잔여 소진 시 중단.
    const byCE = new Map<string, { order_number: string; client_name: string | null; amount: number; due: string; carriedFrom?: string }[]>()
    for (const g of billedGroups) {
      const expected = computeExpectedPaymentDate(g.accounting_date || g.billed_at || (g.created_at || '').substring(0, 10), {
        payment_cycle_type: g.payment_cycle_type, payment_terms_days: g.terms,
        closing_day: g.closing_day, payment_month_offset: g.payment_month_offset, payment_day: g.payment_day,
      })
      const carried = carryOverdue && expected < from   // 연체분(예상일이 과거)은 예측 시작일에 표시 — 미수는 즉시 회수 대상
      const due = carried ? from : expected
      const k = ckey(g.client_id, g.entity_id)
      const list = byCE.get(k) ?? []
      list.push({ order_number: g.order_number, client_name: g.client_name, amount: Number(g.amount) || 0, due, ...(carried ? { carriedFrom: expected } : {}) })
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
        const arName = `${it.client_name || ''} 미수 예상입금 (주문 ${it.order_number})`.trim()
        if (it.carriedFrom && doSpread) { arOverduePool.push({ name: arName, amount: amt, due: it.carriedFrom }); continue }
        add(it.due, {
          flow: 'IN', type: 'ORDER_EXPECTED',
          name: arName,
          amount: amt, materialized: false, basis: 'BILLED',
          ...(it.carriedFrom ? { carried_from: it.carriedFrom } : {}),
        })
      }
    }
  }

  // ── 4.5) 온더플라이: 매입 지급예정 (PURCHASE_EXPECTED) — 매출 §4 대칭 (H1b) ──
  //   확정발주(CONFIRMED/RECEIVED/PARTIAL_RECEIVED) 중 cash_schedule 미물질화분을 공급사 결제조건으로 OUT 합성.
  //   dedup: (a) cash_schedule PURCHASE source_id=po.id 존재 시 §1과 중복 → skip,
  //          (b) 지출결의(payment_requests.related_po_id) APPROVED/PAID 존재 시 그 결의 행과 중복 → skip.
  //   ★ 발주 목록·제외 필터는 §0b 에서 이미 한 번 조회했다(poRows) — 여기서 다시 조회하지 않는다.
  //   ★ 금액은 final_amount 가 아니라 **FIFO 로 차감하고 남은 잔여**다. 이게 없어서 이미 낸 24.8억이
  //     계속 '앞으로 낼 돈'으로 잡혔다(2026-09-05 수정).
  for (const po of poRows) {
    if (Number(po.materialized) > 0 || Number(po.pr_materialized) > 0) continue
    if (!(Number(po.final_amount) > 0)) continue
    const expected = poExpectedDate(po)
    if (!expected) continue
    const settled = apSettledByRef.get('po:' + po.id) || 0
    const remaining = Math.max(0, (Number(po.final_amount) || 0) - settled)
    if (remaining <= 0) continue        // 이미 다 낸 발주 — 예정에 남기면 이중계상
    const name = `${po.supplier_name || '공급사'} 지급예정 (발주 ${po.po_number})`
    const carried = carryOverdue && expected < from   // 연체 지급(예정일 경과)은 예측 시작일에 표시 (매출 §4b와 대칭)
    if (carried && doSpread) { apOverduePool.push({ name, amount: remaining, due: expected }); continue }
    add(carried ? from : expected, {
      flow: 'OUT', type: 'PURCHASE_EXPECTED',
      name,
      amount: remaining, materialized: false,
      ...(settled > 0 ? { settled_amount: settled } : {}),
      ...(carried ? { carried_from: expected } : {}),
    })
  }

  // ── 4.6) 연체 매입채무를 실적 런레이트로 분산 (PURCHASE_OVERDUE) ────────────
  //   왜 첫날 일괄이 아닌가: 확정발주가 전부 만기 도래 상태라(prod 실측 최종 발주 2026-08-06 + NET30 = 오늘)
  //   통째로 얹으면 잔액이 −12억으로 시작해 위험일이 영구히 100%가 되고, 그 화면은 아무도 안 본다.
  //   실제로 나가는 속도는 완결월 기준 월평균이고, 그게 이 회사가 실제로 하는 행동이다.
  //   ⚠️ 이건 '추정'이다 — estimated:true 로 표시하고, 근거(런레이트·산출 기간)를 진단에 함께 싣는다.
  //   ⚠️ 달력 월뷰(carryOverdueToStart:false)는 원래 예정일을 지켜야 하므로 호출부가 spreadOverdueAp 를 끈다.
  if (doSpread && apOverduePool.length > 0 && apDiag) {
    const total = apOverduePool.reduce((a, x) => a + x.amount, 0)
    const day = medianPaymentDay(apEvents)
    const tranches = spreadOverdue(total, apDiag.run_rate, from, day)
    if (tranches.length === 0) {
      // 런레이트를 못 구했다(지급 이력 없음) → 구 동작으로 되돌린다. 조용히 빠뜨리지 않는다.
      for (const it of apOverduePool) {
        add(from, {
          flow: 'OUT', type: 'PURCHASE_EXPECTED', name: it.name, amount: it.amount,
          materialized: false, carried_from: it.due,
        })
      }
    } else {
      apDiag.spread_months = tranches.length
      const oldest = apOverduePool.reduce((m, x) => (x.due < m ? x.due : m), apOverduePool[0].due)
      for (const t of tranches) {
        add(t.date, {
          flow: 'OUT', type: 'PURCHASE_OVERDUE',
          name: `연체 매입채무 분산 ${t.index}/${t.of} (실적 월평균 기준)`,
          amount: t.amount, materialized: false, estimated: true,
          carried_from: oldest,
        })
      }
    }
  }

  // ── 4.7) 연체 미수를 실적 수금 런레이트로 분산 (ORDER_OVERDUE) — §4.6 대칭 ──
  //   매입만 분산하면 유출은 여러 달에 깔리고 유입은 첫날에 뭉친다 → 곡선이 「첫날 급등 후 우하향」이 되어
  //   고치기 전보다 더 오해를 부른다. prod 실측(2026-09-06) 미수 파생잔여 9.0억 vs 매입 잔여 10.4억으로
  //   규모가 비슷해, 한쪽만 고치면 정확히 그 모양이 나온다.
  //   ★수금은 '상대의 행동'이지만 근거는 같다 — 우리가 실제로 받아 온 속도.
  //   ⚠️ 행이 수천 건(prod 3,816)이라 매입처럼 행을 끌어오지 않고 GROUP BY 결과만 받는다.
  if (doSpread && arOverduePool.length > 0) {
    const efRr = entityFilter(c)
    const efRd = entityFilter(c)
    const [mRes, dRes] = await Promise.all([
      c.env.DB.prepare(`SELECT substr(payment_date, 1, 7) AS m, COALESCE(SUM(amount), 0) AS v, MAX(substr(payment_date, 1, 10)) AS mx
                        FROM payments WHERE payment_date IS NOT NULL${efRr.clause}${arExcl('client_id')} GROUP BY 1`)
        .bind(...efRr.params).all<{ m: string; v: number; mx: string }>(),
      c.env.DB.prepare(`SELECT CAST(substr(payment_date, 9, 2) AS INTEGER) AS d, COUNT(*) AS n
                        FROM payments WHERE payment_date IS NOT NULL${efRd.clause}${arExcl('client_id')} GROUP BY 1`)
        .bind(...efRd.params).all<{ d: number; n: number }>(),
    ])
    const byMonth = new Map<string, number>()
    let lastDate: string | null = null
    for (const r of mRes.results) {
      if (!r.m || r.m.length !== 7) continue
      byMonth.set(r.m, Number(r.v) || 0)
      if (r.mx && (!lastDate || r.mx > lastDate)) lastDate = r.mx
    }
    const dayCounts = new Map<number, number>()
    for (const r of dRes.results) if (r.d >= 1 && r.d <= 31) dayCounts.set(r.d, Number(r.n) || 0)

    const rr: RunRate = runRateFromMonthly(byMonth)
    const total = arOverduePool.reduce((a, x) => a + x.amount, 0)
    const tranches = spreadOverdue(total, rr.rate, from, medianDayFromCounts(dayCounts))
    if (tranches.length === 0) {
      // 수금 실적이 없어 속도를 못 구했다 → 구 동작(첫날 일괄)으로 되돌린다. 조용히 빠뜨리지 않는다.
      for (const it of arOverduePool) {
        add(from, {
          flow: 'IN', type: 'ORDER_EXPECTED', name: it.name, amount: it.amount,
          materialized: false, basis: 'BILLED', carried_from: it.due,
        })
      }
    } else {
      const oldest = arOverduePool.reduce((m, x) => (x.due < m ? x.due : m), arOverduePool[0].due)
      for (const t of tranches) {
        add(t.date, {
          flow: 'IN', type: 'ORDER_OVERDUE',
          name: `연체 미수 회수 분산 ${t.index}/${t.of} (실적 월평균 기준)`,
          amount: t.amount, materialized: false, estimated: true, basis: 'BILLED',
          carried_from: oldest,
        })
      }
    }
    if (opts.diagnostics) {
      opts.diagnostics.ar = {
        overdue_total: Math.round(total), overdue_count: arOverduePool.length,
        run_rate: rr.rate, run_rate_months: rr.months, run_rate_basis: rr.basis,
        spread_months: tranches.length,
        last_receipt_month: rr.lastMonth, last_receipt_date: lastDate,
        entry_lag_days: lastDate ? daysBetween(lastDate, from) : null,
        entry_stalled: !!lastDate && (daysBetween(lastDate, from) ?? 0) > ENTRY_STALL_DAYS,
      }
    }
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
    // 순지출 정본(utils/cardSpend): 취소는 차감, 상계쌍·가승인은 제외.
    //   종전엔 전부 + 로 더해 100만 승인 + 100만 취소가 예정액 200만이 됐다(2026-09-03).
    const efTx = entityFilter(c, 'ct')
    const { results: txRows } = await c.env.DB.prepare(`
      SELECT card_id, transaction_date, ${cardNetAmountSql('ct')} AS amount FROM card_transactions ct
      WHERE transaction_date BETWEEN ? AND ?${efTx.clause}${cardSpendFilterSql('ct')}
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
    // 직원별 payroll 행을 (날짜×귀속월) 단위로 합산 — 달력/일자상세에 인원수만큼 나열되는 노이즈 제거
    const payAgg = new Map<string, { date: string; period: string; sum: number; cnt: number; type: 'PAYROLL' | 'PAYROLL_TAX' }>()
    const accumulate = (type: 'PAYROLL' | 'PAYROLL_TAX', date: string, period: string, amount: number) => {
      const k = `${type}|${date}|${period}`
      const e = payAgg.get(k) ?? { date, period, sum: 0, cnt: 0, type }
      e.sum += amount; e.cnt++
      payAgg.set(k, e)
    }
    for (const p of payRows) {
      const payDate = (p.pay_date || '').substring(0, 10)
      const payMonth = payDate.substring(0, 7)
      if (Number(p.net_pay) > 0 && payDate && !manualPayMonths.has(payMonth)) {
        accumulate('PAYROLL', payDate, p.pay_period, Number(p.net_pay) || 0)
      }
      if (Number(p.total_deduction) > 0) {
        const remit = nextMonth10(p.pay_period)
        if (remit && !manualPayMonths.has(remit.substring(0, 7))) {
          accumulate('PAYROLL_TAX', remit, p.pay_period, Number(p.total_deduction) || 0)
        }
      }
    }
    for (const e of payAgg.values()) {
      add(e.date, {
        flow: 'OUT', type: e.type,
        name: `${e.type === 'PAYROLL' ? '급여' : '4대보험·원천세'} ${e.period} (${e.cnt}명)`,
        amount: e.sum, materialized: false,
      })
    }
  }

  if (opts.diagnostics && apDiag) opts.diagnostics.ap = apDiag
  return days
}
