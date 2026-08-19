// 정기 변동비용(준고정비) 추정 엔진 — design-recurring-variable-expense
// 통신비·전기세처럼 정기 발생하나 금액이 변동되는 비용을, 과거 실적(카드·은행 출금)
// category별 월합계로부터 추정. cashflowEngine(자금예측)·정산이 공통 사용한다.
//
// 소스: card_transactions(category_id) + bank_transactions(matched_category_id, WITHDRAWAL)
// 추정법: LAST(직전월) / AVG_3M / AVG_6M / SAME_MONTH_LAST_YEAR(계절성)
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { entityFilter } from './entityFilter'

export type EstimateMethod = 'LAST' | 'AVG_3M' | 'AVG_6M' | 'SAME_MONTH_LAST_YEAR'

export interface ExpenseEstimator {
  /** 추정치(원). 실적이 없어 추정 불가하면 null → 호출측에서 등록금액으로 폴백. */
  estimate(categoryId: number, method: EstimateMethod, targetYm: string): number | null
}

/** 'YYYY-MM' 에 delta개월(음수 가능)을 더한 'YYYY-MM' */
function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

/**
 * categoryIds 의 과거 월별 실적(카드+은행출금)을 [targetFrom 직전 12개월 ~ targetTo] 범위로
 * 한 번에 로드해 메모리 맵으로 보관 → (category, method, 대상월) 추정을 N×M 쿼리 없이 계산.
 *
 * @param targetFromYm 추정 대상 기간 시작 'YYYY-MM'
 * @param targetToYm   추정 대상 기간 끝 'YYYY-MM'
 */
export async function buildExpenseEstimator(
  c: Context<HonoEnv>,
  categoryIds: number[],
  targetFromYm: string,
  targetToYm: string
): Promise<ExpenseEstimator> {
  const ids = [...new Set(categoryIds.filter((n) => Number.isFinite(n)))]
  if (ids.length === 0) return { estimate: () => null }

  const totals = new Map<string, number>() // `${cid}:${ym}` → 월합계
  const loadFrom = addMonths(targetFromYm, -12) // SAME_MONTH_LAST_YEAR 까지 커버
  const ph = ids.map(() => '?').join(',')

  // 카드 실적 (지출은 항상 출금 방향)
  const efCard = entityFilter(c)
  const { results: cardRows } = await c.env.DB.prepare(`
    SELECT category_id AS cid, substr(transaction_date,1,7) AS ym, SUM(amount) AS total
    FROM card_transactions
    WHERE category_id IN (${ph})
      AND substr(transaction_date,1,7) BETWEEN ? AND ?${efCard.clause}
    GROUP BY category_id, ym
  `).bind(...ids, loadFrom, targetToYm, ...efCard.params).all<{ cid: number; ym: string; total: number }>()
  for (const r of cardRows) {
    const k = `${r.cid}:${r.ym}`
    totals.set(k, (totals.get(k) || 0) + (Number(r.total) || 0))
  }

  // 은행 출금 실적 (자동이체 통신비·전기세 등)
  //   0539: 대표자 개인통장(bank_accounts.is_personal=1) 출금은 법인 비용이 아니라 추정 소스에서 뺀다.
  const efBank = entityFilter(c, 'bt')
  const { results: bankRows } = await c.env.DB.prepare(`
    SELECT bt.matched_category_id AS cid, substr(bt.transaction_date,1,7) AS ym, SUM(bt.amount) AS total
    FROM bank_transactions bt
    JOIN bank_accounts ba ON ba.id = bt.bank_account_id
    WHERE bt.matched_category_id IN (${ph})
      AND bt.transaction_type = 'WITHDRAWAL'
      AND COALESCE(ba.is_personal, 0) = 0
      AND substr(bt.transaction_date,1,7) BETWEEN ? AND ?${efBank.clause}
    GROUP BY bt.matched_category_id, ym
  `).bind(...ids, loadFrom, targetToYm, ...efBank.params).all<{ cid: number; ym: string; total: number }>()
  for (const r of bankRows) {
    const k = `${r.cid}:${r.ym}`
    totals.set(k, (totals.get(k) || 0) + (Number(r.total) || 0))
  }

  /** 대상월 직전 n개월 중 실적이 존재하는 월만 평균 (데이터 빈 월은 제외) */
  const avg = (cid: number, ym: string, n: number): number | null => {
    const vals: number[] = []
    for (let i = 1; i <= n; i++) {
      const v = totals.get(`${cid}:${addMonths(ym, -i)}`)
      if (v != null) vals.push(v)
    }
    if (vals.length === 0) return null
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  }

  return {
    estimate(categoryId, method, targetYm) {
      switch (method) {
        case 'LAST': {
          const v = totals.get(`${categoryId}:${addMonths(targetYm, -1)}`)
          return v == null ? null : Math.round(v)
        }
        case 'AVG_3M':
          return avg(categoryId, targetYm, 3)
        case 'AVG_6M':
          return avg(categoryId, targetYm, 6)
        case 'SAME_MONTH_LAST_YEAR': {
          const v = totals.get(`${categoryId}:${addMonths(targetYm, -12)}`)
          return v == null ? null : Math.round(v)
        }
        default:
          return null
      }
    },
  }
}
