// 은행 실잔액 단일 소스 (P1, 2026-07-17)
// bank fund-summary(/api/bank/fund-summary)와 cash-flow bank-balance(/api/cash-flow/schedule/bank-balance)가
// 서로 다른 "계좌별 최신 거래" 판정(날짜정렬 vs MAX(id))을 써서 현금잔액이 어긋날 수 있었음 → 단일 로직으로 수렴.
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { entityFilter } from './entityFilter'

// 계좌별 최신 거래 잔액 = 거래일·시각·id 내림차순 첫 행(balance_after 존재). 외부 쿼리의 bank_accounts 별칭은 `ba`.
export const LATEST_BALANCE_SUBQUERY = `(
  SELECT bt.balance_after FROM bank_transactions bt
  WHERE bt.bank_account_id = ba.id AND bt.balance_after IS NOT NULL
  ORDER BY bt.transaction_date DESC, bt.transaction_time DESC, bt.id DESC LIMIT 1
)`

/** 활성 계좌 실잔액 합계 + 계좌 수. bank fund-summary의 계좌별 SUM과 동일 결과를 보장. */
export async function getTotalBankBalance(
  c: Context<HonoEnv>
): Promise<{ total_balance: number; account_count: number }> {
  const ef = entityFilter(c, 'ba')
  const row = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(${LATEST_BALANCE_SUBQUERY}), 0) AS total_balance,
            COUNT(ba.id) AS account_count
     FROM bank_accounts ba
     WHERE ba.is_active = 1${ef.clause}`
  )
    .bind(...ef.params)
    .first<{ total_balance: number; account_count: number }>()
  return {
    total_balance: Number(row?.total_balance) || 0,
    account_count: Number(row?.account_count) || 0,
  }
}
