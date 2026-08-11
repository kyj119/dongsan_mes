/**
 * ledger/ar-helpers.ts — 매출원장(AR) 공유 헬퍼 (accounts-receivable.ts에서 분리, 2026-06-12 대형파일 분할)
 *
 * 미수금 파생(deriveClientBalance) / 정합성 집계 쿼리(buildIntegrityQuery) /
 * aging 분류(getAgingCategory) + D1 Row 타입. ar-* 라우트 그룹에서 공유. ⚠️ 이동만, 로직 수정 0.
 */
import type { Context } from 'hono'
import type { HonoEnv } from '../../types/env'
import { entityFilter } from '../../utils/entityFilter'
import { kstYmd } from '../../utils/kstDate'
import { excludeArExcludedClientsSql } from '../../constants/arPolicy'

// ── split billing P3: (거래처) 미수금 파생 — order_billing_groups[BILLED] − payments − adjustments ──
// clients.balance 캐시 대체. entityFilter 적용(현재 사용자 법인 = 청구 법인 기준).
export async function deriveClientBalance(c: Context<HonoEnv>, clientId: number | string): Promise<number> {
  const { clause: gEf, params: gP } = entityFilter(c, 'g')
  const billed = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(g.billed_amount), 0) AS v FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
     WHERE o.client_id = ? AND g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${gEf}`
  ).bind(clientId, ...gP).first<{ v: number }>()
  const { clause: pEf, params: pP } = entityFilter(c, 'p')
  const paid = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS v FROM payments p WHERE client_id = ?${pEf}`
  ).bind(clientId, ...pP).first<{ v: number }>()
  const { clause: aEf, params: aP } = entityFilter(c, 'a')
  const adj = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS v FROM adjustments a WHERE client_id = ?${aEf}`
  ).bind(clientId, ...aP).first<{ v: number }>()
  return (Number(billed?.v) || 0) - (Number(paid?.v) || 0) - (Number(adj?.v) || 0)
}

/**
 * 여러 거래처의 미수금을 한 번에 파생 — deriveClientBalance와 동일 정의(billed − payments − adjustments).
 * 단건 헬퍼는 거래처당 3쿼리라 대량 발송(수백 명)에서 못 쓴다 → IN 그룹쿼리 3회(청크당)로 축약.
 * ⚠️ D1 바인드 한도(~100) 때문에 80개씩 청크 분할 [[d1-bind-param-limit]].
 * 반환: { [clientId]: 미수금 }. 조회되지 않은 거래처는 키 없음.
 */
export async function deriveClientBalancesBulk(
  c: Context<HonoEnv>,
  clientIds: Array<number | string>
): Promise<Record<number, number>> {
  const ids = Array.from(new Set(clientIds.map(Number).filter(n => Number.isFinite(n) && n > 0)))
  const out: Record<number, number> = {}
  if (ids.length === 0) return out

  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80)
    const ph = chunk.map(() => '?').join(',')

    const { clause: gEf, params: gP } = entityFilter(c, 'g')
    const { results: billed } = await c.env.DB.prepare(
      `SELECT o.client_id AS cid, COALESCE(SUM(g.billed_amount), 0) AS v
       FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
       WHERE o.client_id IN (${ph}) AND g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${gEf}
       GROUP BY o.client_id`
    ).bind(...chunk, ...gP).all<{ cid: number; v: number }>()

    const { clause: pEf, params: pP } = entityFilter(c, 'p')
    const { results: paid } = await c.env.DB.prepare(
      `SELECT client_id AS cid, COALESCE(SUM(amount), 0) AS v FROM payments p
       WHERE client_id IN (${ph})${pEf} GROUP BY client_id`
    ).bind(...chunk, ...pP).all<{ cid: number; v: number }>()

    const { clause: aEf, params: aP } = entityFilter(c, 'a')
    const { results: adj } = await c.env.DB.prepare(
      `SELECT client_id AS cid, COALESCE(SUM(amount), 0) AS v FROM adjustments a
       WHERE client_id IN (${ph})${aEf} GROUP BY client_id`
    ).bind(...chunk, ...aP).all<{ cid: number; v: number }>()

    for (const id of chunk) out[id] = 0
    for (const r of billed || []) out[Number(r.cid)] = (out[Number(r.cid)] || 0) + (Number(r.v) || 0)
    for (const r of paid || []) out[Number(r.cid)] = (out[Number(r.cid)] || 0) - (Number(r.v) || 0)
    for (const r of adj || []) out[Number(r.cid)] = (out[Number(r.cid)] || 0) - (Number(r.v) || 0)
  }
  return out
}

/**
 * AR 총액을 **매출채권(양수)** 과 **선수금(음수)** 으로 분리 집계.
 *
 * ★ 왜 필요한가 — 단순 `SUM(billed) − SUM(paid) − SUM(adj)` 는 거래처를 뭉개서 합산하기 때문에
 *   **선수금이 매출채권을 상쇄해 미수금이 과소 표시**된다. 2026-08-06 실측: 동산기획 e1 에서
 *   음수 잔액 34곳 −314,789,819 이 양수 잔액을 깎아먹고 있었다(그 중 −269,518,210 은
 *   2025년말 기초채권 자체가 음수인 선수금 28건 — 이카운트 원본 채권파일과 원 단위로 일치하는 정상 데이터다).
 *   선수금은 회계상 **부채**라 매출채권과 상계해 한 숫자로 보여주면 안 된다.
 *
 * 계산 = 거래처별로 먼저 잔액을 구한 뒤 부호별로 합산(그래서 UNION ALL + GROUP BY 가 필요하다).
 * 정의는 deriveClientBalance 와 동일: order_billing_groups[BILLED] − payments − adjustments.
 * 제외도 동일: 내부법인 + 현금소매 더미(excludeArExcludedClientsSql).
 *
 * 반환 receivable(양수합) · advance(음수합의 절대값) · net(= receivable − advance, 종전 단일값과 동일).
 */
export async function deriveArSplit(
  c: Context<HonoEnv>,
  opts: { allEntities?: boolean } = {}
): Promise<{ receivable: number; advance: number; net: number; advanceClients: number }> {
  // allEntities = 전사 기준(entity 무필터). /financial/balance-snapshot 이 설계상 전사라 필요하다.
  const NO_EF = { clause: '', params: [] as unknown[] }
  const g = opts.allEntities ? NO_EF : entityFilter(c, 'g')
  const p = opts.allEntities ? NO_EF : entityFilter(c, 'p')
  const a = opts.allEntities ? NO_EF : entityFilter(c, 'a')
  const row = await c.env.DB.prepare(
    `WITH bal AS (
       SELECT cid, SUM(v) AS b FROM (
         SELECT o.client_id AS cid, g.billed_amount AS v
           FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
          WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${g.clause}${excludeArExcludedClientsSql('o.client_id')}
         UNION ALL
         SELECT p.client_id, -p.amount FROM payments p WHERE 1=1${p.clause}${excludeArExcludedClientsSql('p.client_id')}
         UNION ALL
         SELECT a.client_id, -a.amount FROM adjustments a WHERE 1=1${a.clause}${excludeArExcludedClientsSql('a.client_id')}
       ) GROUP BY cid
     )
     SELECT COALESCE(SUM(CASE WHEN b > 0 THEN b ELSE 0 END), 0) AS receivable,
            COALESCE(SUM(CASE WHEN b < 0 THEN -b ELSE 0 END), 0) AS advance,
            COALESCE(SUM(CASE WHEN b < 0 THEN 1 ELSE 0 END), 0) AS advance_clients
       FROM bal`
  ).bind(...g.params, ...p.params, ...a.params).first<{ receivable: number; advance: number; advance_clients: number }>()
  const receivable = Number(row?.receivable) || 0
  const advance = Number(row?.advance) || 0
  return { receivable, advance, net: receivable - advance, advanceClients: Number(row?.advance_clients) || 0 }
}

/**
 * 연체(미수금 경고) 판정 SSOT — **FIFO(선입선출) 충당** 기준.
 *
 * ★ 왜 FIFO인가 (2026-08-11) — payments/adjustments 는 청구그룹에 매칭되지 않고 **거래처 단위 총액**이다.
 *   종전 `/overdue` 는 `연체액 = min(연체청구합, 잔액)` 으로 계산했는데, 이는 "입금이 **최신** 청구건부터
 *   충당된다"(LIFO)는 가정이라 실무(오래된 건부터 충당)와 반대다. 그래서 활발히 거래·입금 중인 거래처도
 *   최근 청구분 잔액이 통째로 "223일 연체"로 표시됐다.
 *   실측(prod E1 2026-08-11): 종전 201곳 814,929,314 → FIFO 133곳 439,533,638.
 *
 * 계산 = 거래처별로 청구건을 **청구일 오름차순 누적**(window)하고, 충당액(payments+adjustments)을
 *   오래된 건부터 소진시켜 건별 미충당액 `un = min(청구액, max(0, 누적청구 − 충당액))` 을 구한다.
 *   그중 거래처별 `overdue_alert_days`(NULL=30일)를 넘긴 건들의 합이 연체액.
 *
 * 제외: 비활성 거래처(`is_active=0`) + AR 정책 제외(내부법인·현금소매) — 종전 `/overdue` 는 is_active 를
 *   안 걸러 거래중지 거래처의 옛 채권이 경고에 떴다(`/receivables` 목록은 원래 is_active=1 필터가 있어 불일치).
 *
 * carryover_amount = 연체액 중 **이관 기초잔액 전표**(order_number 에 'OPEN') 유래분. 이 전표들은
 *   accounting_date 가 이관 기준일(E1=2025-12-31)로 일괄 고정돼 연체일수가 "실제 청구 후 경과일"이 아니다
 *   → UI에서 '이월'로 구분 표기해야 오독하지 않는다. (E1 189건 / E2·E3 없음)
 */
export interface FifoOverdueRow {
  client_id: number
  client_name: string
  overdue_alert_days: number | null
  overdue_amount: number
  overdue_count: number
  carryover_amount: number
  unpaid_total: number
  oldest_unpaid_at: string | null
}

/** 이관 기초잔액 전표 판정 — order_number 에 'OPEN'(E1-OPEN-*, ICM-AR-E1-OPEN). */
export const CARRYOVER_ORDER_NUMBER_LIKE = "'%OPEN%'"

export async function queryFifoOverdue(c: Context<HonoEnv>): Promise<FifoOverdueRow[]> {
  const g = entityFilter(c, 'g')
  const p = entityFilter(c, 'p')
  const a = entityFilter(c, 'a')
  const { results } = await c.env.DB.prepare(
    `WITH grp AS (
       SELECT o.client_id AS cid,
              COALESCE(g.accounting_date, g.billed_at) AS bdate,
              g.billed_amount AS amt,
              o.order_number AS onum,
              SUM(g.billed_amount) OVER (
                PARTITION BY o.client_id
                ORDER BY COALESCE(g.accounting_date, g.billed_at), g.id
              ) AS cum
         FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
        WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${g.clause}
     ),
     settle AS (
       SELECT cid, SUM(v) AS settled FROM (
         SELECT p.client_id AS cid, p.amount AS v FROM payments p WHERE 1=1${p.clause}
         UNION ALL
         SELECT a.client_id, a.amount FROM adjustments a WHERE 1=1${a.clause}
       ) GROUP BY cid
     ),
     unpaid AS (
       SELECT grp.cid, grp.bdate, grp.onum,
              MIN(grp.amt, MAX(0, grp.cum - COALESCE(s.settled, 0))) AS un
         FROM grp LEFT JOIN settle s ON s.cid = grp.cid
     )
     SELECT * FROM (
       SELECT c.id AS client_id, c.client_name, c.overdue_alert_days,
              SUM(CASE WHEN date(u.bdate, '+' || COALESCE(c.overdue_alert_days, 30) || ' days') < date('now', '+9 hours')
                       THEN u.un ELSE 0 END) AS overdue_amount,
              COUNT(CASE WHEN date(u.bdate, '+' || COALESCE(c.overdue_alert_days, 30) || ' days') < date('now', '+9 hours')
                         THEN 1 END) AS overdue_count,
              SUM(CASE WHEN date(u.bdate, '+' || COALESCE(c.overdue_alert_days, 30) || ' days') < date('now', '+9 hours')
                        AND u.onum LIKE ${CARRYOVER_ORDER_NUMBER_LIKE}
                       THEN u.un ELSE 0 END) AS carryover_amount,
              SUM(u.un) AS unpaid_total,
              MIN(CASE WHEN date(u.bdate, '+' || COALESCE(c.overdue_alert_days, 30) || ' days') < date('now', '+9 hours')
                       THEN u.bdate END) AS oldest_unpaid_at
         FROM unpaid u JOIN clients c ON c.id = u.cid
        WHERE u.un > 0 AND c.is_active = 1${excludeArExcludedClientsSql('c.id')}
        GROUP BY c.id, c.client_name, c.overdue_alert_days
     ) WHERE overdue_amount > 0
     ORDER BY overdue_amount DESC, client_id DESC`
    // ⚠️ HAVING 에 별칭(overdue_amount)을 쓰지 말 것 — SQLite 는 실컬럼 우선이라 clients 의 동명 컬럼이
    //    있으면 조용히 그쪽에 바인딩된다(2026-08-10 clients.balance 사고). 서브쿼리로 감싸 필터한다.
  ).bind(...g.params, ...p.params, ...a.params).all<FifoOverdueRow>()

  return (results || []).map(r => ({
    client_id: Number(r.client_id),
    client_name: r.client_name,
    overdue_alert_days: r.overdue_alert_days,
    overdue_amount: Number(r.overdue_amount) || 0,
    overdue_count: Number(r.overdue_count) || 0,
    carryover_amount: Number(r.carryover_amount) || 0,
    unpaid_total: Number(r.unpaid_total) || 0,
    oldest_unpaid_at: r.oldest_unpaid_at,
  }))
}

// ── #567: 클레임/반품 해결금액 → AR(adjustments) 자동조정 멱등 동기화 ──
// 출처(source_type/source_id)당 자동조정 1건. 재해결·금액수정·처리방식 변경 시 DELETE→(조건충족)INSERT로 재동기화.
// amount<=0 이거나 비-환불/할인이면 기존 자동조정만 제거(INSERT 없음). 수동 조정(source_type NULL)은 불간섭.
// D1 batch 반환 → 호출부에서 다른 mutation과 함께 원자적으로 실행.
export function syncArAdjustmentStmts(
  db: D1Database,
  p: {
    sourceType: 'CLAIM' | 'RETURN'
    sourceId: number
    clientId: number
    orderId: number | null
    entityId: number
    amount: number          // 해결금액(REAL 가능) — INTEGER 컬럼이라 반올림
    type: 'CLAIM' | 'RETURN'
    reason: string
    createdBy: number | null
  }
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM adjustments WHERE source_type = ? AND source_id = ?').bind(p.sourceType, p.sourceId),
  ]
  const amt = Math.round(Number(p.amount) || 0)
  if (amt > 0) {
    stmts.push(
      db.prepare(
        `INSERT INTO adjustments (client_id, order_id, type, amount, reason, created_by, entity_id, source_type, source_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(p.clientId, p.orderId, p.type, amt, p.reason, p.createdBy, p.entityId, p.sourceType, p.sourceId)
    )
  }
  return stmts
}

// ── Row types for D1 .first<T>() / .all<T>() ──

export interface ClientRow {
  id: number
  client_code: string
  client_name: string
  balance: number
  is_active: number
  email?: string | null
  overdue_alert_days?: number | null
}

export interface OrderRow {
  id: number
  order_number: string
  order_date: string
  delivery_date: string | null
  final_amount: number
  billed_amount: number | null
  billing_status: string | null
  billed_at: string | null
  status: string
  created_at: string
}

export interface PaymentRow {
  id: number
  client_id: number
  payment_date: string
  amount: number
  payment_method: string | null
  reference_number: string | null
  notes: string | null
  created_at: string
  client_name?: string
  created_by_name?: string
}

export interface AdjustmentRow {
  id: number
  client_id: number
  order_id: number | null
  type: string
  amount: number
  reason: string | null
  created_at: string
  created_by_name?: string
}

export interface IntegrityRow {
  id: number
  client_code: string
  client_name: string
  balance: number
  total_billed: number
  total_paid: number
  total_adj: number
}

export interface OrderAggRow { client_id: number; order_count: number; total_sales: number }
export interface PaymentAggRow { client_id: number; total_payments: number }

export interface MonthlyOrderRow { month: string; order_count: number; total_sales: number }
export interface MonthlyPaymentRow { month: string; payment_count: number; total_payments: number }

export interface OverdueClientRow {
  id: number
  client_name: string
  overdue_alert_days: number | null
  balance: number
  oldest_billed_at: string | null
  overdue_days: number
}

export interface NotifLinkRow { link: string }

export interface CollectionLogRow {
  id: number
  client_id: number
  contact_date: string
  contact_method: string
  contact_person: string | null
  promised_date: string | null
  promised_amount: number | null
  notes: string | null
  result: string | null
  created_by: number | null
  created_at: string
  client_name?: string
  created_by_name?: string
}

export interface ReceivableClientRow {
  id: number
  client_code: string
  client_name: string
  overdue_alert_days: number | null
  balance: number
  last_payment_date: string | null
  billed_order_count: number
  oldest_unpaid_date: string | null
}

export interface ReceivableOrderRow {
  id: number
  order_number: string
  order_date: string
  delivery_date: string | null
  final_amount: number
  billed_amount: number
  billing_status: string
  billed_at: string | null
  days_since_billed: number | null
}

// /overdue SQL 행 (overdue_billed=연체 청구합 원값, 응답의 overdue_amount는 min(overdue_billed, balance) 캡)
export interface OverdueAlertRow {
  client_id: number
  client_name: string
  overdue_count: number
  overdue_billed: number
  balance: number
  oldest_billed_at: string | null
  overdue_alert_days: number | null
}

export interface UnpaidOrderRow {
  order_number: string
  billed_amount: number
  order_date: string
}
// 잔액 정합성 집계 쿼리 빌더 (단일 JOIN — N+1 방지)
export function buildIntegrityQuery(c: Context<HonoEnv>): { query: string; params: number[] } {
  // split billing P3: billed 소스 = order_billing_groups(청구 법인 g 기준)
  const { clause: oEf, params: oParams } = entityFilter(c, 'g')
  const { clause: pEf, params: pParams } = entityFilter(c)
  const { clause: aEf, params: aParams } = entityFilter(c)
  const query = `
  SELECT c.id, c.client_code, c.client_name, c.balance,
    COALESCE(o.v, 0) as total_billed,
    COALESCE(p.v, 0) as total_paid,
    COALESCE(a.v, 0) as total_adj
  FROM clients c
  LEFT JOIN (
    SELECT o.client_id, SUM(CASE WHEN g.billing_status = 'BILLED' THEN g.billed_amount ELSE 0 END) as v
    FROM order_billing_groups g JOIN orders o ON o.id = g.order_id WHERE o.status != 'CANCELLED'${oEf} GROUP BY o.client_id
  ) o ON o.client_id = c.id
  LEFT JOIN (
    SELECT client_id, SUM(amount) as v FROM payments WHERE 1=1${pEf} GROUP BY client_id
  ) p ON p.client_id = c.id
  LEFT JOIN (
    SELECT client_id, SUM(amount) as v FROM adjustments WHERE 1=1${aEf} GROUP BY client_id
  ) a ON a.client_id = c.id
  WHERE c.is_active = 1${excludeArExcludedClientsSql('c.id')}
`
  return { query, params: [...oParams, ...pParams, ...aParams] }
}
// Aging 카테고리 분류 헬퍼
export function getAgingCategory(days: number | null): string {
  if (days === null || days < 0) return 'normal'
  if (days <= 30) return 'normal'
  if (days <= 60) return 'warning'
  if (days <= 90) return 'danger'
  return 'critical'
}

// ── 미수금 aging 단일소스(SSOT): 채권 나이 = 최고령 미결제 청구건(oldest_unpaid_date) 기준 ──
//    ar-receivables(/receivables)가 정본. reports·bank 가 동일 기준을 쓰도록 JOIN 조각/일수 헬퍼로 공유.
//    (일원화 2026-07-17: 기존 reports·bank 의 '최근 입금일 경과'(payment recency) 기준을 폐기하고 이 채권나이로 통일)
//    oldest_unpaid_date = BILLED 청구그룹 중 '해당 건 이상을 커버하는 결제가 없는'(NOT EXISTS) 건들의 MIN(청구일).
//    outer 쿼리는 clients 를 alias `c` 로 두어야 함(oup.client_id = c.id). alias `oup` 로 조인.
//    entityScoped=true → 청구(g)·결제(p) 서브쿼리에 현재 법인 필터(호출부의 balance 스코프와 일치시킬 것).
export function buildOldestUnpaidJoin(
  c: Context<HonoEnv>,
  opts: { entityScoped?: boolean } = {}
): { sql: string; params: unknown[] } {
  const g = opts.entityScoped ? entityFilter(c, 'g') : { clause: '', params: [] as unknown[] }
  const p = opts.entityScoped ? entityFilter(c, 'p') : { clause: '', params: [] as unknown[] }
  const sql = `
      LEFT JOIN (
        SELECT o.client_id AS client_id,
               MIN(COALESCE(g.accounting_date, g.billed_at)) AS oldest_unpaid_date
        FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
        WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${g.clause}
          AND NOT EXISTS (
            SELECT 1 FROM payments p
            WHERE p.client_id = o.client_id${p.clause}
              AND p.amount >= g.billed_amount
              AND p.payment_date >= COALESCE(g.accounting_date, g.billed_at)
          )
        GROUP BY o.client_id
      ) oup ON oup.client_id = c.id`
  return { sql, params: [...g.params, ...p.params] }
}

// oldest_unpaid_date → aging_days (KST 자정 기준, ar-receivables 와 동일 계산). null/미결제특정불가 → null.
export function agingDaysFromOldest(oldestUnpaidDate: string | null | undefined): number | null {
  if (!oldestUnpaidDate) return null
  // KST SSOT(#366): 입력·'오늘'을 모두 KST 업무일(YYYY-MM-DD)로 환원한 뒤 whole-day 차이.
  //   oldest_unpaid_date = MIN(COALESCE(accounting_date, billed_at)) →
  //     · 'YYYY-MM-DD' (accounting_date, 이미 KST 업무일) → 그대로 사용
  //     · 'YYYY-MM-DD HH:MM:SS' (billed_at = CURRENT_TIMESTAMP, UTC·TZ표기 없음) → UTC로 파싱 후 +9h → 날짜부
  //   구현: UTC 타임스탬프를 setHours(로컬)로 자정 절단하면 KST 자정 경계(00~09시)에서 하루 어긋남(off-by-one).
  const s = String(oldestUnpaidDate).trim()
  let oldestYmd: string
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    oldestYmd = s
  } else {
    let iso = s.replace(' ', 'T')
    if (!/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(iso)) iso += 'Z' // TZ 미표기 → UTC로 강제 파싱
    const ms = Date.parse(iso)
    if (Number.isNaN(ms)) return null
    oldestYmd = new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10)
  }
  const todayMs = Date.parse(kstYmd() + 'T00:00:00Z')
  const oldestMs = Date.parse(oldestYmd + 'T00:00:00Z')
  return Math.floor((todayMs - oldestMs) / (1000 * 60 * 60 * 24))
}
