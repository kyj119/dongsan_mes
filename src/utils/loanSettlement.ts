// 차입금 상환 회차 ↔ 통장 출금 대사 — 파생 (2026-09-07)
//
// ■ 무엇이 문제였나
//   `loan_payments` 는 **344회차 전부 `bank_transaction_id` 가 비어 있었다**(prod 실측). 상환 실적을
//   사람이 손으로 PAID 처리해야 하는 구조인데 아무도 안 했고, 그래서 지난 회차 15건 19,251,119 이
//   `SCHEDULED` 로 남아 있었다. 자금예측(cashflowEngine §3)의 `carryOverdue` 는 과거 미납분을
//   **예측 시작일로 끌어오므로**, 이미 통장에서 나간 돈을 유출로 한 번 더 센다.
//   같은 세션에서 고친 매입(§0b apSettlement)·매출(§0)과 **같은 형태**이고, LOAN 축만 남아 있었다.
//
// ■ 왜 파생인가 (저장하지 않는다)
//   `loan_payments.status`·`actual_paid_amount` 를 채우는 배치를 두면, 통장 매칭이 정정될 때마다
//   되돌리는 짝이 필요하다. 파생이면 통장 쪽이 바뀌는 순간 다음 조회에서 저절로 따라온다.
//   CLAUDE.md §누적 캐시 1순위("파생으로 뺀다") · apSettlement 와 같은 판단.
//
// ■ 매칭 근거를 무엇으로 삼나 — **거래처 매칭과 반대로** 금액이 1차 근거다
//   거래처 입금은 「이 이름이 누구인가」를 모르는 상태에서 찾는 것이라 금액 단독이 위험하다
//   (2026-09-07 `홍익`→온오프컴퍼니 사고). 상환은 반대다 — **언제 얼마가 나갈지 이미 알고**
//   「그게 실제로 나갔나」를 확인하는 것이라, 스케줄 금액이 확인 근거로 성립한다.
//   그래도 금액만으로는 안 붙인다. 날짜 창 안이어야 하고, 창 안에서 **후보가 유일**하거나
//   채권자명이 이어져야 한다. prod 표기가 제각각이라 이름만으로는 못 붙는다:
//     `오릭스캐피탈코리아(주)` ↔ `CMS 오릭스코리아` · `신한카드` ↔ `신한카드할부` · `제일은행` ↔ 계좌번호
//
// ■ 게이트: scripts/loan-settle-selftest.cjs (test:calc)

/** 상환 회차 하나. */
export interface LoanInstallment {
  /** 엔진이 되찾을 키 — `loan_payments.id` */
  id: number
  loanId: number
  entityId: number
  creditor: string
  /** 예정일 YYYY-MM-DD */
  due: string
  amount: number
}

/** 통장 출금 한 건. */
export interface BankWithdrawal {
  id: number
  entityId: number
  /** YYYYMMDD 또는 YYYY-MM-DD 둘 다 받는다 — 테이블은 압축형, 스케줄은 하이픈형이다. */
  date: string
  amount: number
  counterpartName: string | null
}

export interface LoanSettleMatch {
  installmentId: number
  bankTxId: number
  /** 실제 출금일 YYYY-MM-DD */
  paidDate: string
  amount: number
  /** '이름+금액' | '금액(후보 유일)' */
  basis: string
  /** 예정일 대비 실제 출금일 차이(일). 음수면 앞당겨 나간 것. */
  lagDays: number
}

export interface LoanSettlementResult {
  /** 상환된 것으로 판정된 회차 id */
  settledIds: Set<number>
  matches: LoanSettleMatch[]
  /** 대사 못 한 회차 id — 통장 수집 밖(대출계좌 자동이체)일 수 있다. */
  unsettledIds: number[]
}

/** 금액 허용오차 — 원 단위 반올림·이자 정산 잔돈을 흡수한다. 비율은 소액에서 0 이 되므로 하한을 둔다. */
const AMOUNT_TOL_ABS = 1000
const AMOUNT_TOL_RATE = 0.005
/** 예정일 기준 창. 앞은 좁게(선납은 드물다) 뒤는 넓게(휴일 이월·영업일 밀림). */
const WINDOW_BEFORE = 5
const WINDOW_AFTER = 10

const ymd = (s: string): string => {
  const t = String(s || '').replace(/-/g, '')
  return t.length >= 8 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : ''
}
const toU = (s: string): number => {
  const d = ymd(s)
  return d ? Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) : NaN
}
/** 채권자명 대조용 정규화 — 법인격·공백·이체채널 토큰을 지운다. */
export function normalizeCreditor(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/주식회사|[(（]주[)）]|㈜|유한회사/g, '')
    .replace(/^(CMS|자동이체|펌뱅킹)\s*/i, '')
    .replace(/[\s()（）[\]{}.,\-_/·:'"]/g, '')
    .toLowerCase()
}
/** 한쪽이 다른 쪽을 품으면 같은 채권자로 본다(`신한카드` ⊂ `신한카드할부`). 2자 미만은 판단하지 않는다. */
export function creditorMatches(creditor: string | null | undefined, counterpart: string | null | undefined): boolean {
  const a = normalizeCreditor(creditor), b = normalizeCreditor(counterpart)
  if (a.length < 2 || b.length < 2) return false
  return a.includes(b) || b.includes(a)
}

/**
 * 상환 회차를 통장 출금과 1:1 로 붙인다.
 *
 * ★출금 한 건은 **한 회차만** 갚는다. 같은 날 같은 금액이 두 번 나가면 회차도 둘이다 —
 *   하나를 두 회차에 쓰면 안 나간 회차가 나간 것으로 바뀐다.
 * ★이름이 이어지는 후보를 **먼저** 가져간다. 금액만 맞는 후보는 그 다음이고, 그때는
 *   창 안에 후보가 **하나뿐일 때만** 쓴다(둘 이상이면 어느 쪽인지 모른다 → 안 붙인다).
 */
export function settleLoanPayments(
  installments: LoanInstallment[],
  withdrawals: BankWithdrawal[]
): LoanSettlementResult {
  const used = new Set<number>()
  const settledIds = new Set<number>()
  const matches: LoanSettleMatch[] = []

  const inWindow = (inst: LoanInstallment, w: BankWithdrawal): boolean => {
    if (Number(w.entityId) !== Number(inst.entityId)) return false
    const tol = Math.max(AMOUNT_TOL_ABS, Math.abs(inst.amount) * AMOUNT_TOL_RATE)
    if (Math.abs(Math.abs(w.amount) - Math.abs(inst.amount)) > tol) return false
    const d = (toU(w.date) - toU(inst.due)) / 86400000
    return Number.isFinite(d) && d >= -WINDOW_BEFORE && d <= WINDOW_AFTER
  }

  // 예정일 순으로 처리한다 — 오래된 회차가 먼저 갚아진다(FIFO).
  const sorted = [...installments].sort((a, b) => a.due.localeCompare(b.due) || a.id - b.id)

  // 1차: 이름이 이어지는 후보. 2차: 금액만 맞되 창 안에 유일한 후보.
  for (const pass of [1, 2]) {
    for (const inst of sorted) {
      if (settledIds.has(inst.id)) continue
      const cands = withdrawals.filter(w => !used.has(w.id) && inWindow(inst, w))
      if (!cands.length) continue
      let pick: BankWithdrawal | null = null
      let basis = ''
      if (pass === 1) {
        const named = cands.filter(w => creditorMatches(inst.creditor, w.counterpartName))
        if (named.length) {
          // 예정일에 가장 가까운 것
          named.sort((a, b) => Math.abs(toU(a.date) - toU(inst.due)) - Math.abs(toU(b.date) - toU(inst.due)))
          pick = named[0]; basis = '이름+금액'
        }
      } else if (cands.length === 1) {
        pick = cands[0]; basis = '금액(후보 유일)'
      }
      if (!pick) continue
      used.add(pick.id)
      settledIds.add(inst.id)
      matches.push({
        installmentId: inst.id, bankTxId: pick.id, paidDate: ymd(pick.date),
        amount: Math.abs(pick.amount), basis,
        lagDays: Math.round((toU(pick.date) - toU(inst.due)) / 86400000),
      })
    }
  }

  return {
    settledIds,
    matches,
    unsettledIds: installments.filter(i => !settledIds.has(i.id)).map(i => i.id),
  }
}
