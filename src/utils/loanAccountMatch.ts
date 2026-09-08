/**
 * 통장 적요의 **대출계좌번호**로 차입금 거래를 가른다.
 *
 * ★왜 있는가 (2026-09-08)
 *   하나은행 대출계좌 거래의 적요는 `{계좌번호}-{일련번호}` 다. 그걸 아무도 안 읽어서
 *   만기일시 대출의 **월 이자 44건 40,233,462 가 「차입금상환」(NOT_EXPENSE)에 들어가**
 *   손익에서 통째로 빠져 있었다. MES 이자비용이 3,187,533 뿐이라 세무장부 정본 56,960,000 과
 *   17배 벌어져 있던 원인이 이것이다. 200 이 뜨고 화면도 정상이라 어떤 게이트도 못 잡았다.
 *
 * ★판정을 순수 모듈로 두는 이유 — 「이자냐 원금이냐」가 손익을 가르는데, 그 판단이 라우트 안에
 *   있으면 하네스가 닿지 않는다. 실제로 이 규칙은 대출 종류마다 다르다(아래).
 */

/** 원금 상환으로 보는 하한 배수 — 월 납입액의 이 배수 이상이면 원금이다. */
export const PRINCIPAL_MULTIPLE = 3
/** 이자로 보는 상한 배수 — 월 납입액의 이 배수 이하면 이자다. */
export const INTEREST_MULTIPLE = 1.5

export type LoanTxKind = 'DRAWDOWN' | 'INTEREST' | 'PRINCIPAL'

export interface LoanRef {
  /** 적요에서 뽑은 계좌번호(숫자만) */
  accountNo: string
  /** 대출 건별 일련번호 — 회전대출은 실행 건마다 다르다. 없으면 null */
  tranche: string | null
}

/**
 * 적요에서 대출계좌 참조를 뽑는다. `60298020073142-00012` → { accountNo, tranche }.
 * 계좌번호만 있는 형태(실행 입금)도 받는다.
 */
export function parseLoanAccountRef(counterpartName: string | null | undefined): LoanRef | null {
  const s = String(counterpartName ?? '').trim()
  const m = s.match(/^(\d{11,16})(?:-(\d{2,8}))?$/)
  if (!m) return null
  return { accountNo: m[1], tranche: m[2] ?? null }
}

/**
 * 대출계좌 거래의 성격을 판정한다. **모르면 null** — 사람에게 남긴다.
 *
 * ★대출 종류가 규칙을 바꾼다
 *   · 입금 = 언제나 **실행**(DRAWDOWN). 대출계좌에서 들어온 돈은 수익이 아니다.
 *   · `INTEREST_ONLY` = 원금이 만기에 한 번에 나가므로 **월 납입은 전액 이자**다.
 *     단 회전대출(구매자금대출)도 이 유형인데 건별 원금 상환이 섞인다 —
 *     실측상 원금은 월 납입액의 10~44배, 이자는 0.01~0.77배로 **간극이 크다**(최대 이자
 *     615,325 vs 최소 원금 8,321,611). 그래서 배수로 가른다.
 *   · `EQUAL_PRINCIPAL`·`EQUAL_INSTALLMENT` = 한 번의 납입에 **원금과 이자가 섞여** 있다.
 *     통장 한 줄로는 못 가른다 → 판정하지 않는다. 쪼개려면 상환 스케줄이 필요하다.
 */
export function classifyLoanTransaction(
  transactionType: string,
  amount: number,
  loan: { repayment_type?: string | null; monthly_payment_amount?: number | null } | null | undefined
): LoanTxKind | null {
  if (String(transactionType) === 'DEPOSIT') return 'DRAWDOWN'
  if (!loan) return null
  if (String(loan.repayment_type) !== 'INTEREST_ONLY') return null
  const mp = Number(loan.monthly_payment_amount)
  if (!Number.isFinite(mp) || mp <= 0) return null
  const v = Math.abs(Number(amount) || 0)
  if (v >= mp * PRINCIPAL_MULTIPLE) return 'PRINCIPAL'
  if (v <= mp * INTEREST_MULTIPLE) return 'INTEREST'
  return null   // 애매한 구간은 사람이 본다
}

/** 판정 → 붙일 계정 이름. 역할은 `expense_categories.role` 이 정한다(0584). */
export const LOAN_KIND_CATEGORY: Record<LoanTxKind, string> = {
  DRAWDOWN: '차입금',
  INTEREST: '이자비용',
  PRINCIPAL: '차입금상환',
}

export const LOAN_KIND_LABEL: Record<LoanTxKind, string> = {
  DRAWDOWN: '차입 실행',
  INTEREST: '대출 이자',
  PRINCIPAL: '원금 상환',
}
