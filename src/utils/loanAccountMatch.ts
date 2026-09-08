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

// ---------------------------------------------------------------------------
// 앵커 매칭 — 계좌번호가 안 찍히는 대출(캐피탈·할부·CMS)을 적요 이름으로 잡는다
// ---------------------------------------------------------------------------

/** 월 납입액에서 이만큼까지 벗어나도 같은 대출로 본다 — 변동금리 실측 −8.2%~+6.2%(중진공 #4). */
export const MONTHLY_DEVIATION_MAX = 0.12

export interface LoanCandidate {
  id: number
  /** 월 납입액. 0·null 이면 후보에서 빠진다(비교할 눈금이 없다). */
  monthly_payment_amount?: number | null
}

export interface MonthlyAssignment {
  /** payments 배열의 인덱스 */
  paymentIndex: number
  loanId: number
  /** 월납액 대비 이탈률(부호 있음) */
  deviation: number
}

export interface MonthlyMatchResult {
  assigned: MonthlyAssignment[]
  /** 어느 대출에도 못 붙은 출금 인덱스 — **미등록 대출 후보**다. */
  unassigned: number[]
}

/**
 * 한 달치 출금을 후보 대출에 **1:1 로** 배정한다.
 *
 * ★왜 「가장 가까운 금액」이 아니라 1:1 배정인가
 *   같은 적요에 대출이 여럿이면 금액 근사만으로는 **엉뚱한 대출이 먼저 가져간다**.
 *   실측 2026-09-08 「현대캐피탈」 1월: 출금 427,744 · 446,341 · 505,225 에 등록 대출은
 *   #12(882,236) · #15(428,968) 둘뿐이다. 근사만 보면 446,341 도 #15 에 붙지만(+4.05%),
 *   427,744(−0.3%)가 더 가깝다. **1:1 이면 427,744 가 #15 를 가져가고 나머지 둘이 남는다** —
 *   그 남은 둘이 바로 미등록 할부다(505,225 는 1~8월 매월, 446,341 은 1~6월 매월).
 *
 * ★전제: **한 대출은 한 달에 한 번 낸다.** 이게 금액 근사보다 강한 식별 축이다.
 *   그래서 「앵커별 월 출금 건수 > 등록 대출 수」면 그 차이가 곧 미등록 건수다.
 *
 * 배정은 이탈률이 작은 쌍부터 확정하는 그리디다 — 결정적이고(입력 순서 무관) 설명 가능하다.
 */
export function matchMonthlyPayments(
  loans: LoanCandidate[],
  payments: number[]
): MonthlyMatchResult {
  const usable = loans.filter(l => Number(l.monthly_payment_amount) > 0)
  const pairs: { p: number; l: number; dev: number; abs: number }[] = []
  for (let p = 0; p < payments.length; p++) {
    const v = Math.abs(Number(payments[p]) || 0)
    for (const l of usable) {
      const mp = Number(l.monthly_payment_amount)
      const dev = (v - mp) / mp
      if (Math.abs(dev) > MONTHLY_DEVIATION_MAX) continue
      pairs.push({ p, l: l.id, dev, abs: Math.abs(dev) })
    }
  }
  // 이탈률 오름차순 → 같으면 인덱스·id 로 tie-break(입력 순서에 흔들리지 않게)
  pairs.sort((a, b) => a.abs - b.abs || a.p - b.p || a.l - b.l)
  const takenP = new Set<number>(), takenL = new Set<number>()
  const assigned: MonthlyAssignment[] = []
  for (const q of pairs) {
    if (takenP.has(q.p) || takenL.has(q.l)) continue
    takenP.add(q.p); takenL.add(q.l)
    assigned.push({ paymentIndex: q.p, loanId: q.l, deviation: q.dev })
  }
  const unassigned: number[] = []
  for (let p = 0; p < payments.length; p++) if (!takenP.has(p)) unassigned.push(p)
  return { assigned, unassigned }
}
