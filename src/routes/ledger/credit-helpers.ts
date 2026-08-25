/**
 * ledger/credit-helpers.ts — 여신(credit) 판정 SSOT (2026-08-25)
 *
 * ★ 왜 파생인가 — 거래처별로 한도를 손으로 넣는 방식은 실패했다. prod 실측(2026-08-25):
 *   활성 매출처 2,873곳 중 `clients.credit_limit` 이 채워진 곳 **0곳**. 기능(orders/create 여신검사·
 *   credit_overrides·승인결재)은 완성돼 있는데 값이 비어 한 번도 발동하지 않았다.
 *   `safe_stock`(재고 부족경고)과 **같은 병**이다 — "기능은 있고 값이 비어 있다".
 *
 *   그래서 한도를 **입력값이 아니라 규칙의 산출물**로 바꾼다. 컬럼에 배치로 써넣는 방식(materialize)도
 *   검토했지만, 그건 "배치가 수동 조정값을 덮어쓴다"는 새 함정을 만든다. 파생은 빈 값 문제 자체를 없앤다.
 *
 * ★ `clients.credit_limit` 의 의미 (2026-08-25 반전 — 종전 주석 `0 = 무제한` 은 폐기)
 *     > 0  수동 지정. 규칙보다 우선한다(MANUAL).
 *     = 0  **자동 파생**(DERIVED). 전 거래처의 현재 상태.
 *     < 0  무제한(UNLIMITED). 규칙을 끄고 싶은 거래처의 탈출구.
 *   ⚠️ 종전 의미가 `0 = 무제한` 이었으므로, 이 반전으로 **전 거래처가 규칙 적용 대상이 된다**. 의도한 바다.
 *
 * ★ 규모 편차를 규칙이 흡수한다 — 정액 한도는 못 쓴다. prod 실측 월평균 청구액 = 평균 59.7만 / 최대 2,821만(47배).
 *   정액 500만은 "그냥 거래가 큰 곳" 25곳만 상시 초과시켜 노이즈가 되고, 소형 거래처엔 영원히 안 걸린다.
 *   월평균 배수(×2)는 53곳을 잡는데 그건 **자기 거래 규모에 비해 밀린 곳**이다. 위험 신호는 이쪽이다.
 *
 * ★ 잔액은 deriveClientBalance 하나뿐 — 이 파일이 잔액을 직접 세지 않는 이유.
 *   `clients.ts /:id/credit-check` 는 2026-08-25까지 `SUM(orders.final_amount) − payments` 를 직접 셌다.
 *   `orders/create.ts` 주석이 "원장과 세 군데가 다르다"며 폐기한 바로 그 산식이 다른 파일에 남아 있었고
 *   (① 청구 전 주문까지 채권 계산 ② entity 필터 부재 ③ adjustments 누락),
 *   그 결과 **화면 경고와 실제 차단이 다른 숫자로 움직였다**. 잔액을 세는 곳은 한 군데뿐이어야 한다.
 */
import type { Context } from 'hono'
import type { HonoEnv } from '../../types/env'
import { entityFilter } from '../../utils/entityFilter'
import { excludeArExcludedClientsSql } from '../../constants/arPolicy'
import { deriveClientBalance } from './ar-helpers'

/** settings 키 (setting_key/setting_value KV) — 값이 없으면 CREDIT_POLICY_DEFAULTS 사용. */
export const CREDIT_SETTING_KEYS = {
  multiplier: 'credit_limit_multiplier',
  months: 'credit_limit_months',
  floor: 'credit_limit_floor',
  cap: 'credit_limit_cap',
  warnRatio: 'credit_warn_ratio',
} as const

export interface CreditPolicy {
  multiplier: number   // 월평균 청구액 × 이 배수 = 한도
  months: number       // 월평균 산출 기간(개월)
  floor: number        // 한도 하한 — 신규·휴면 거래처가 한도 0이 되는 걸 막는다
  cap: number          // 한도 상한 — 초대형 거래처가 사실상 무제한이 되는 걸 막는다
  warnRatio: number    // 이 비율 도달 시 WARNING(차단 아님)
}

/** 용준님 확정(2026-08-25): 배수 2배. 하한/상한/기간은 prod 분포 기준 초기값. */
export const CREDIT_POLICY_DEFAULTS: CreditPolicy = {
  multiplier: 2,
  months: 6,
  floor: 1_000_000,
  cap: 50_000_000,
  warnRatio: 0.8,
}

/** 설정 1회 조회(키 5개 한 쿼리). 파싱 실패·범위 밖은 조용히 기본값으로 되돌린다. */
export async function getCreditPolicy(c: Context<HonoEnv>): Promise<CreditPolicy> {
  const keys = Object.values(CREDIT_SETTING_KEYS)
  const ph = keys.map(() => '?').join(',')
  const { results } = await c.env.DB.prepare(
    `SELECT setting_key, setting_value FROM settings WHERE setting_key IN (${ph})`
  ).bind(...keys).all<{ setting_key: string; setting_value: string | null }>()

  const map: Record<string, string> = {}
  for (const r of results || []) map[r.setting_key] = r.setting_value ?? ''

  const num = (key: string, fallback: number, min: number, max: number): number => {
    const v = Number(map[key])
    if (!Number.isFinite(v) || v < min || v > max) return fallback
    return v
  }
  const d = CREDIT_POLICY_DEFAULTS
  return {
    multiplier: num(CREDIT_SETTING_KEYS.multiplier, d.multiplier, 0.1, 100),
    months: Math.round(num(CREDIT_SETTING_KEYS.months, d.months, 1, 24)),
    floor: num(CREDIT_SETTING_KEYS.floor, d.floor, 0, 1_000_000_000),
    cap: num(CREDIT_SETTING_KEYS.cap, d.cap, 1, 100_000_000_000),
    warnRatio: num(CREDIT_SETTING_KEYS.warnRatio, d.warnRatio, 0.1, 1),
  }
}

export type CreditLimitSource = 'MANUAL' | 'DERIVED' | 'UNLIMITED'

export interface DerivedCreditLimit {
  limit: number              // UNLIMITED 이면 Infinity
  source: CreditLimitSource
  avgMonthly: number         // 파생 근거(수동/무제한이어도 참고용으로 채운다)
}

/**
 * 여신한도 산출 — 수동값 우선, 없으면 최근 N개월 월평균 청구액 × 배수(하한·상한 clamp).
 *
 * 집계원 = `order_billing_groups[BILLED]` (deriveClientBalance 의 청구 정의와 동일. `orders.final_amount`
 *   이 아니다 — 청구 전 주문은 채권이 아니므로 여신 산출에도 넣지 않는다).
 * 기간 경계 = `COALESCE(accounting_date, date(billed_at))` — 원장 업무일자 기준(CLAUDE.md §목록 정렬 규약과 동일 이유로
 *   created_at 은 이관 데이터에서 "이관 실행 시각"이라 무의미).
 * ⚠️ 이관 기초잔액 전표(E1-OPEN-*, accounting_date=2025-12-31)는 기간 밖이라 자연히 빠진다 —
 *    별도 제외가 필요 없지만, months 를 12 이상으로 늘리면 들어오기 시작한다는 뜻이기도 하다.
 * 음수 합계(선수금 우위)는 0으로 절단 후 clamp → 하한이 적용된다.
 */
export async function deriveCreditLimit(
  c: Context<HonoEnv>,
  clientId: number | string,
  policy: CreditPolicy,
  manualLimit: number
): Promise<DerivedCreditLimit> {
  const { clause: gEf, params: gP } = entityFilter(c, 'g')
  // months 는 getCreditPolicy 에서 1~24 정수로 clamp 됨 → 인라인 안전(SQLite date() 수정자).
  const months = policy.months
  const row = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(g.billed_amount), 0) AS v
       FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
      WHERE o.client_id = ? AND g.billing_status = 'BILLED' AND o.status != 'CANCELLED'
        AND COALESCE(g.accounting_date, date(g.billed_at)) >= date('now', '+9 hours', '-${months} months')
        ${gEf}`
  ).bind(clientId, ...gP).first<{ v: number }>()

  const billed = Math.max(0, Number(row?.v) || 0)
  const avgMonthly = billed / months

  if (manualLimit < 0) return { limit: Infinity, source: 'UNLIMITED', avgMonthly }
  if (manualLimit > 0) return { limit: manualLimit, source: 'MANUAL', avgMonthly }

  const raw = avgMonthly * policy.multiplier
  const limit = Math.round(Math.min(policy.cap, Math.max(policy.floor, raw)))
  return { limit, source: 'DERIVED', avgMonthly }
}

/**
 * 전 거래처 여신 상태를 **한 쿼리**로 산출하는 SQL — deriveCreditLimit(단건 TS)의 SQL 판.
 *
 * ★왜 필요한가: deriveCreditLimit + deriveClientBalance 는 거래처당 4쿼리라 850곳을 돌면 3,400쿼리다.
 *   연체 알림 배치·정책 시뮬레이션처럼 **전수**를 봐야 하는 경로는 이걸 쓴다.
 *
 * ⚠️ 산식이 TS(deriveCreditLimit)와 여기 둘로 나뉜다. 한쪽을 고치면 반드시 다른 쪽도 고칠 것.
 *   둘을 합치지 못하는 이유 = 단건 경로는 entityFilter 가 걸린 3쿼리 파생(deriveClientBalance)을 재사용해야
 *   원장 화면과 잔액이 한 글자도 안 어긋난다. 여기서 잔액을 다시 정의하는 건 그 SSOT 를 복제하는 것이라
 *   **정의를 똑같이 유지하는 것이 계약**이다(billed[BILLED] − payments − adjustments).
 *
 * 반환 컬럼: client_id · client_name · credit_hold · balance · avg_monthly · lim(−1=무제한) · limit_source
 *
 * 대상 = 활성 거래처 중 **원장 활동이 있는 곳**(기간 내 청구 or 잔액). AR 제외(내부법인·현금소매)는 빠진다.
 * ⚠️ 이 활동 조건이 `credit_hold` 보다 **먼저** 걸린다 — 거래 이력이 아예 없는 차단 거래처는 여기 안 나온다.
 *    의도한 동작이다(잔액이 0이면 조치할 게 없고, 차단은 이벤트가 아니라 상태다). 잔액이 있으면 bal 에 잡히므로
 *    "차단 + 미수 있음"은 정상적으로 걸린다. 차단 전량을 보려면 clients 를 직접 조회할 것.
 */
export function buildCreditEvalSql(
  c: Context<HonoEnv>,
  policy: CreditPolicy
): { sql: string; params: unknown[] } {
  const gWin = entityFilter(c, 'g')
  const gBal = entityFilter(c, 'g')
  const pBal = entityFilter(c, 'p')
  const aBal = entityFilter(c, 'a')

  const sql = `
    WITH win AS (
      SELECT o.client_id AS cid, SUM(g.billed_amount) AS billed
        FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
       WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'
         AND COALESCE(g.accounting_date, date(g.billed_at)) >= date('now', '+9 hours', '-${policy.months} months')
         ${gWin.clause}
       GROUP BY o.client_id
    ),
    bal AS (
      SELECT cid, SUM(v) AS b FROM (
        SELECT o.client_id AS cid, g.billed_amount AS v
          FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
         WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${gBal.clause}
        UNION ALL SELECT p.client_id, -p.amount FROM payments p WHERE 1=1${pBal.clause}
        UNION ALL SELECT a.client_id, -a.amount FROM adjustments a WHERE 1=1${aBal.clause}
      ) GROUP BY cid
    )
    SELECT c.id AS client_id, c.client_name, c.credit_hold,
           COALESCE(bal.b, 0) AS balance,
           MAX(0, COALESCE(win.billed, 0)) * 1.0 / ? AS avg_monthly,
           CASE WHEN c.credit_limit < 0 THEN -1
                WHEN c.credit_limit > 0 THEN c.credit_limit
                ELSE MIN(?, MAX(?, MAX(0, COALESCE(win.billed, 0)) * 1.0 / ? * ?))
           END AS lim,
           CASE WHEN c.credit_limit < 0 THEN 'UNLIMITED'
                WHEN c.credit_limit > 0 THEN 'MANUAL'
                ELSE 'DERIVED' END AS limit_source
      FROM clients c
      LEFT JOIN win ON win.cid = c.id
      LEFT JOIN bal ON bal.cid = c.id
     WHERE c.is_active = 1
       AND (win.billed IS NOT NULL OR bal.b IS NOT NULL)
       ${excludeArExcludedClientsSql('c.id')}`

  const params = [
    ...gWin.params, ...gBal.params, ...pBal.params, ...aBal.params,
    policy.months,                                              // avg_monthly
    policy.cap, policy.floor, policy.months, policy.multiplier,  // lim
  ]
  return { sql, params }
}

export interface CreditExceededRow {
  client_id: number
  client_name: string
  balance: number
  limit: number
  limit_source: CreditLimitSource
  avg_monthly: number
  hold: boolean
}

/**
 * 여신 한도를 넘었거나 수동 차단된 거래처 전량 — 연체(여신) 알림 배치의 판정 정본.
 * WARNING(한도 80% 도달)은 **제외**한다. 알림은 조치가 필요한 것만 와야 한다.
 */
export async function queryCreditExceeded(c: Context<HonoEnv>): Promise<CreditExceededRow[]> {
  const policy = await getCreditPolicy(c)
  const { sql, params } = buildCreditEvalSql(c, policy)
  // 정렬 규약(CLAUDE.md): 고유키 tie-break 필수 — balance 동값 구간이 페이지마다 뒤집히지 않게.
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM (${sql}) WHERE credit_hold = 1 OR (lim >= 0 AND balance >= lim)
      ORDER BY balance DESC, client_id DESC`
  ).bind(...params).all<{
    client_id: number; client_name: string; credit_hold: number
    balance: number; avg_monthly: number; lim: number; limit_source: string
  }>()

  return (results || []).map(r => ({
    client_id: Number(r.client_id),
    client_name: r.client_name,
    balance: Number(r.balance) || 0,
    limit: Number(r.lim) || 0,
    limit_source: (r.limit_source as CreditLimitSource) || 'DERIVED',
    avg_monthly: Number(r.avg_monthly) || 0,
    hold: r.credit_hold === 1,
  }))
}

/**
 * EXEMPT = 여신 판정 대상 아님. AR 제외 거래처(내부법인 3사 + 현금소매 더미)는 채권 개념이 없으므로
 * 잔액이 얼마든 경고·차단하지 않는다(`constants/arPolicy` 와 같은 기준을 쓴다 — 여기서 id를 다시 나열하지 말 것).
 */
async function isCreditExempt(c: Context<HonoEnv>, clientId: number | string): Promise<boolean> {
  const row = await c.env.DB.prepare(
    `SELECT 1 AS ok FROM clients c WHERE c.id = ?${excludeArExcludedClientsSql('c.id')}`
  ).bind(clientId).first<{ ok: number }>()
  return !row
}

export type CreditStatusCode = 'OK' | 'WARNING' | 'EXCEEDED' | 'BLOCKED' | 'EXEMPT'

export interface CreditStatus {
  status: CreditStatusCode
  balance: number
  limit: number                    // UNLIMITED/EXEMPT 이면 0 (JSON 직렬화 — Infinity 는 null 이 된다)
  limit_source: CreditLimitSource | 'EXEMPT'
  avg_monthly: number
  hold: boolean
  message: string
  /** 차단·결재 대상인가 (BLOCKED | EXCEEDED). ADMIN 은 이 값이 true 여도 경고만 띄운다. */
  blocking: boolean
}

/**
 * 거래처 여신 상태 판정 — 여신을 보는 모든 화면·경로가 이걸 쓴다(주문 생성·거래처 상세·주문서 배너).
 * 판정 순서: EXEMPT → BLOCKED(수동차단) → UNLIMITED → EXCEEDED → WARNING → OK.
 */
export async function evaluateClientCredit(
  c: Context<HonoEnv>,
  clientId: number | string
): Promise<CreditStatus> {
  const base: CreditStatus = {
    status: 'OK', balance: 0, limit: 0, limit_source: 'DERIVED',
    avg_monthly: 0, hold: false, message: '', blocking: false,
  }

  if (await isCreditExempt(c, clientId)) {
    return { ...base, status: 'EXEMPT', limit_source: 'EXEMPT', message: '' }
  }

  const client = await c.env.DB.prepare(
    'SELECT credit_limit, credit_hold FROM clients WHERE id = ?'
  ).bind(clientId).first<{ credit_limit: number | null; credit_hold: number | null }>()
  if (!client) return base

  const manualLimit = Number(client.credit_limit) || 0
  const hold = client.credit_hold === 1

  const policy = await getCreditPolicy(c)
  const [balance, derived] = await Promise.all([
    deriveClientBalance(c, clientId),
    deriveCreditLimit(c, clientId, policy, manualLimit),
  ])

  const fmt = (n: number) => Math.round(n).toLocaleString()
  const srcLabel = derived.source === 'MANUAL' ? '수동' : '자동'

  if (hold) {
    return {
      ...base, status: 'BLOCKED', balance, hold: true, blocking: true,
      limit: Number.isFinite(derived.limit) ? derived.limit : 0,
      limit_source: derived.source, avg_monthly: derived.avgMonthly,
      message: '관리자에 의해 주문이 차단되었습니다.',
    }
  }

  if (derived.source === 'UNLIMITED') {
    return { ...base, balance, limit_source: 'UNLIMITED', avg_monthly: derived.avgMonthly }
  }

  const common = {
    balance, limit: derived.limit, limit_source: derived.source,
    avg_monthly: derived.avgMonthly, hold: false,
  }
  const detail = `미수금 ${fmt(balance)}원 / 한도 ${fmt(derived.limit)}원(${srcLabel})`

  if (balance >= derived.limit) {
    return { ...base, ...common, status: 'EXCEEDED', blocking: true, message: detail }
  }
  if (balance >= derived.limit * policy.warnRatio) {
    const pct = derived.limit > 0 ? Math.round((balance / derived.limit) * 100) : 0
    return { ...base, ...common, status: 'WARNING', message: `${detail} — ${pct}%` }
  }
  return { ...base, ...common, status: 'OK' }
}
