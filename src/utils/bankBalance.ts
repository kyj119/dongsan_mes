// 은행 실잔액 단일 소스 (P1, 2026-07-17)
// bank fund-summary(/api/bank/fund-summary)와 cash-flow bank-balance(/api/cash-flow/schedule/bank-balance)가
// 서로 다른 "계좌별 최신 거래" 판정(날짜정렬 vs MAX(id))을 써서 현금잔액이 어긋날 수 있었음 → 단일 로직으로 수렴.
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { entityFilter } from './entityFilter'

// 대표자 개인통장(is_personal=1)은 법인 자금이 아니다 — 잔액 집계에서 제외한다(0539).
//   입금(수금) 반영 용도로만 남긴 계좌라 거래내역·매칭에는 그대로 살아 있다. 정책 = memory `design-personal-bank-account`.
//   외부 쿼리의 bank_accounts 별칭은 `ba`.
export const NOT_PERSONAL_ACCOUNT = `COALESCE(ba.is_personal, 0) = 0`

// 계좌별 최신 거래 잔액 = 거래일·시각·id 내림차순 첫 행(balance_after 존재). 외부 쿼리의 bank_accounts 별칭은 `ba`.
export const LATEST_BALANCE_SUBQUERY = `(
  SELECT bt.balance_after FROM bank_transactions bt
  WHERE bt.bank_account_id = ba.id AND bt.balance_after IS NOT NULL
  ORDER BY bt.transaction_date DESC, bt.transaction_time DESC, bt.id DESC LIMIT 1
)`

/** 활성 계좌 실잔액 합계 + 계좌 수. bank fund-summary의 계좌별 SUM과 동일 결과를 보장.
 *  대표자 개인통장은 제외한다(0539) — fund-summary·재무상태 현금과 같은 기준. */
export async function getTotalBankBalance(
  c: Context<HonoEnv>
): Promise<{ total_balance: number; account_count: number }> {
  const ef = entityFilter(c, 'ba')
  const row = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(${LATEST_BALANCE_SUBQUERY}), 0) AS total_balance,
            COUNT(ba.id) AS account_count
     FROM bank_accounts ba
     WHERE ba.is_active = 1 AND ${NOT_PERSONAL_ACCOUNT}${ef.clause}`
  )
    .bind(...ef.params)
    .first<{ total_balance: number; account_count: number }>()
  return {
    total_balance: Number(row?.total_balance) || 0,
    account_count: Number(row?.account_count) || 0,
  }
}

// ── 자금계획 시작잔액 (0573) ──────────────────────────────────────────────────
// 위 getTotalBankBalance 와 **일부러 다른 값**이다. 회계상 현금(재무상태)은 가진 계좌를 다 세지만,
// 계획의 출발점은 '지금 실제로 쓸 수 있는 돈'이어야 한다. 마이너스통장 잔액은 가진 돈이 아니라
// 빌려 쓴 돈이라 더하면 prod 기준 -4.2억에서 출발했고, 90일 예측의 위험일이 91일 중 91일이 됐다.
// 두 값은 쓰임이 다를 뿐 각각 여기 한 곳에서만 정의되므로 화면 간 불일치(2026-07-17 P1)는 생기지 않는다.

/** 계획 시작잔액에 넣을 계좌인가. 외부 쿼리의 bank_accounts 별칭은 `ba`. */
export const IN_CASH_PLAN = `COALESCE(ba.include_in_cash_plan, 1) = 1`

/** JS 쪽 동일 판정 — fund-summary 처럼 계좌 행을 이미 들고 있는 곳에서 쓴다(규칙이 갈라지지 않게). */
export function isInCashPlan(a: { is_personal?: number | null; include_in_cash_plan?: number | null }): boolean {
  return !Number(a.is_personal) && Number(a.include_in_cash_plan ?? 1) === 1
}

/**
 * 자금계획 예측의 시작잔액. 활성 · 법인(개인통장 제외) · include_in_cash_plan=1 계좌의 최신잔액 합.
 * 제외된 계좌(마통 등)의 합계도 같이 돌려준다 — 화면에 병기해야 '빠진 돈'이 안 보이게 되는 걸 막는다.
 */
export async function getCashPlanStartBalance(c: Context<HonoEnv>): Promise<{
  start_balance: number
  account_count: number
  excluded_balance: number
  excluded_count: number
}> {
  const ef = entityFilter(c, 'ba')
  const row = await c.env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN ${IN_CASH_PLAN} THEN ${LATEST_BALANCE_SUBQUERY} ELSE 0 END), 0) AS start_balance,
       COALESCE(SUM(CASE WHEN ${IN_CASH_PLAN} THEN 1 ELSE 0 END), 0) AS account_count,
       COALESCE(SUM(CASE WHEN ${IN_CASH_PLAN} THEN 0 ELSE ${LATEST_BALANCE_SUBQUERY} END), 0) AS excluded_balance,
       COALESCE(SUM(CASE WHEN ${IN_CASH_PLAN} THEN 0 ELSE 1 END), 0) AS excluded_count
     FROM bank_accounts ba
     WHERE ba.is_active = 1 AND ${NOT_PERSONAL_ACCOUNT}${ef.clause}`
  )
    .bind(...ef.params)
    .first<{ start_balance: number; account_count: number; excluded_balance: number; excluded_count: number }>()
  return {
    start_balance: Number(row?.start_balance) || 0,
    account_count: Number(row?.account_count) || 0,
    excluded_balance: Number(row?.excluded_balance) || 0,
    excluded_count: Number(row?.excluded_count) || 0,
  }
}
