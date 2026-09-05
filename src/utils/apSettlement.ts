// 매입 지급예정 ↔ 실제 지급 대사 — 파생 FIFO + 연체 분산 (2026-09-05)
//
// ■ 왜 파생인가 (저장하지 않는다)
//   지급 생성 경로가 둘(bank.ts 출금적용 · ledger/accounts-payable POST)이고 삭제 경로도 둘이라,
//   충당 결과를 테이블에 저장하면 네 곳 전부에 충당·복원을 심어야 하고 하나만 빠지면 예정이 영영 굳는다.
//   파생이면 지급을 지우는 순간 다음 조회에서 저절로 복구된다 — 매출 §0(cashflowEngine)과 같은 판단이다.
//   CLAUDE.md §누적 캐시 1순위("파생으로 뺀다").
//
// ■ 왜 순수 모듈인가
//   「무엇을 얼마나 갚은 것으로 볼 것인가」가 600줄 엔진 안에 있으면 하네스가 못 닿는다.
//   여기 함수는 전부 입력→출력만 본다 → scripts/cashflow-ap-selftest.cjs 가 픽스처로 직접 때린다.
//   (CLAUDE.md §조용한 격하 "판정을 순수 모듈로 뺀다"와 같은 이유)
//
// ■ 왜 지급 이벤트를 '합계'가 아니라 '행'으로 받나
//   매출 §0 은 SUM 만 쓴다. 매입은 **관측 지연**(실제 지급일 − 예정일)을 같이 뽑아야 해서 날짜가 필요하다.
//   prod 실측 536행이라 메모리 부담이 없고, 호출부가 LIMIT 으로 상한을 건다.

/** 지급 의무 한 건 = 물질화된 cash_schedule PURCHASE 행 또는 미물질화 확정발주. */
export interface ApObligation {
  /** 엔진이 되찾을 키. 'cs:<id>' 또는 'po:<id>' */
  ref: string
  supplierId: number
  entityId: number
  /** 예정일 YYYY-MM-DD */
  due: string
  amount: number
  /** 이미 완료(DONE) 처리된 행 — 충당 대상이 아니되 그 금액만큼 풀에서 뺀다.
   *  안 빼면 같은 지급이 다른 예정을 한 번 더 지운다(매출 §0 과 동일한 함정). */
  done?: boolean
  /** done 일 때의 실지급액(없으면 amount) */
  doneAmount?: number
}

/** 실제로 나간 돈 한 건 = purchase_payments 또는 purchase_adjustments. */
export interface ApSettlementEvent {
  supplierId: number
  entityId: number
  /** YYYY-MM-DD */
  date: string
  amount: number
  /** 'PAYMENT' | 'ADJUSTMENT' — 런레이트는 실제 현금(PAYMENT)만 센다. 조정은 감액이라 통장에서 나가지 않는다. */
  kind: 'PAYMENT' | 'ADJUSTMENT'
}

export interface ApSettlementResult {
  /** ref → 이미 지급된 금액. 없으면 0. */
  settledByRef: Map<string, number>
  /** 관측 지연 표본(일) — FIFO 가 '닫은' 의무의 (실제 지급일 − 예정일). 음수 = 예정보다 일찍 냄. */
  lagSamples: number[]
  /** 충당하고도 남은 지급(발주 없이 지급만 있는 이관 흔적). 공급처×법인 합계. */
  unappliedTotal: number
}

const keyOf = (s: number, e: number) => s + ':' + e

/** YYYY-MM-DD 두 개의 일수 차(b - a). 잘못된 값이면 null. */
export function daysBetween(a: string, b: string): number | null {
  const pa = Date.parse(a + 'T00:00:00Z'), pb = Date.parse(b + 'T00:00:00Z')
  if (!Number.isFinite(pa) || !Number.isFinite(pb)) return null
  return Math.round((pb - pa) / 86400000)
}

/**
 * 공급처×법인 안에서 예정일 순으로 실제 지급을 충당한다.
 *
 * 발주와 지급을 잇는 기록이 사실상 없어서(prod 실측: purchase_payments 536건 중 po_id 가 붙은 건 **1건**)
 * 건별 매칭은 불가능하다 → 잔액식(발주 − 지급 − 조정)과 같은 결과를 내면서
 * 「어느 예정이 남았는지」까지 말해 주는 FIFO 가 유일하게 성립하는 방법이다.
 */
export function settleApFifo(
  obligations: ApObligation[],
  events: ApSettlementEvent[]
): ApSettlementResult {
  const settledByRef = new Map<string, number>()
  const lagSamples: number[] = []

  const obByKey = new Map<string, ApObligation[]>()
  for (const o of obligations) {
    const k = keyOf(o.supplierId, o.entityId)
    const list = obByKey.get(k) ?? []
    list.push(o)
    obByKey.set(k, list)
  }
  const evByKey = new Map<string, ApSettlementEvent[]>()
  for (const e of events) {
    const k = keyOf(e.supplierId, e.entityId)
    const list = evByKey.get(k) ?? []
    list.push(e)
    evByKey.set(k, list)
  }

  let unappliedTotal = 0
  const allKeys = new Set<string>([...obByKey.keys(), ...evByKey.keys()])

  for (const k of allKeys) {
    const obs = (obByKey.get(k) ?? []).slice().sort((a, b) =>
      a.due === b.due ? (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0) : (a.due < b.due ? -1 : 1))
    // 조정(감액)은 현금이 아니지만 채무를 줄이는 것은 같다 → 같은 스트림에 날짜순으로 섞는다.
    const evs = (evByKey.get(k) ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

    let ei = 0
    let evLeft = evs.length > 0 ? Number(evs[0].amount) || 0 : 0

    /** 스트림에서 need 만큼 꺼낸다. 마지막으로 꺼낸 이벤트의 날짜를 함께 돌려준다(관측 지연용). */
    const consume = (need: number): { taken: number; lastDate: string | null } => {
      let taken = 0
      let lastDate: string | null = null
      while (need > 0 && ei < evs.length) {
        if (evLeft <= 0) { ei++; evLeft = ei < evs.length ? Number(evs[ei].amount) || 0 : 0; continue }
        const t = Math.min(need, evLeft)
        taken += t; need -= t; evLeft -= t
        lastDate = evs[ei].date
        if (evLeft <= 0) { ei++; evLeft = ei < evs.length ? Number(evs[ei].amount) || 0 : 0 }
      }
      return { taken, lastDate }
    }

    for (const o of obs) {
      const amt = Number(o.amount) || 0
      if (o.done) {
        // 이미 해결된 건 — 충당 대상은 아니지만 풀은 그만큼 소진시킨다.
        const doneAmt = Number(o.doneAmount ?? o.amount) || 0
        consume(doneAmt)
        settledByRef.set(o.ref, doneAmt)
        continue
      }
      if (amt <= 0) continue
      const { taken, lastDate } = consume(amt)
      if (taken > 0) settledByRef.set(o.ref, taken)
      // 완전히 닫힌 의무만 관측 지연 표본이 된다 — 부분 지급은 '언제 다 갚았는지'를 아직 모른다.
      if (taken >= amt - 0.5 && lastDate) {
        const d = daysBetween(o.due, lastDate)
        if (d !== null) lagSamples.push(d)
      }
    }

    // 남은 지급 = 발주가 없는 지급(이관 흔적). 채무를 음수로 만들지 않는다.
    let left = 0
    if (ei < evs.length) {
      left += evLeft
      for (let j = ei + 1; j < evs.length; j++) left += Number(evs[j].amount) || 0
    }
    unappliedTotal += Math.max(0, left)
  }

  return { settledByRef, lagSamples, unappliedTotal }
}

export interface RunRate {
  /** 월 평균 실지급액. 표본이 없으면 0. */
  rate: number
  /** 평균에 쓴 완결월 수 */
  months: number
  /** 'YYYY-MM~YYYY-MM' — 근거를 화면에 그대로 적기 위한 것 */
  basis: string
  /** 지급 입력이 있는 마지막 월(YYYY-MM). 이 달은 진행 중일 수 있어 평균에서 뺀다. */
  lastMonth: string | null
}

/**
 * 실제 지급 런레이트(월평균).
 *
 * ★ 마지막 입력월은 평균에서 뺀다 — prod 실측(2026-09-05)에서 8월 지급 입력이 4건 36.9M 뿐인데
 *   같은 달 발주는 379건 791M 이었다. 입력이 진행 중인 달을 평균에 넣으면 런레이트가 통째로 주저앉는다.
 *   (지급 입력은 발주보다 두 달 밀려 있다 — 이건 '연체'가 아니라 '미입력'이다)
 */
export function paymentRunRate(events: ApSettlementEvent[], maxMonths = 6): RunRate {
  const byMonth = new Map<string, number>()
  for (const e of events) {
    if (e.kind !== 'PAYMENT') continue
    const m = (e.date || '').substring(0, 7)
    if (m.length !== 7) continue
    byMonth.set(m, (byMonth.get(m) || 0) + (Number(e.amount) || 0))
  }
  const months = [...byMonth.keys()].sort()
  if (months.length === 0) return { rate: 0, months: 0, basis: '', lastMonth: null }
  const lastMonth = months[months.length - 1]
  const complete = months.filter(m => m < lastMonth)
  if (complete.length === 0) {
    // 표본이 한 달뿐 — 그 달을 그대로 쓴다(빼면 0이 되어 분산 자체가 불가능해진다).
    return { rate: byMonth.get(lastMonth) || 0, months: 1, basis: `${lastMonth}~${lastMonth}`, lastMonth }
  }
  const used = complete.slice(-maxMonths)
  const sum = used.reduce((a, m) => a + (byMonth.get(m) || 0), 0)
  return {
    rate: used.length > 0 ? Math.round(sum / used.length) : 0,
    months: used.length,
    basis: `${used[0]}~${used[used.length - 1]}`,
    lastMonth,
  }
}

/** 실제 지급이 몰리는 '월중 대표일'(중앙값). 표본이 없으면 말일 대신 25일(월급·결제 관행)로 둔다. */
export function medianPaymentDay(events: ApSettlementEvent[]): number {
  const days = events
    .filter(e => e.kind === 'PAYMENT')
    .map(e => Number((e.date || '').substring(8, 10)))
    .filter(d => d >= 1 && d <= 31)
    .sort((a, b) => a - b)
  if (days.length === 0) return 25
  return days[Math.floor(days.length / 2)]
}

/** 표본 중앙값(정수 반올림). 비면 null. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  const v = s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  return Math.round(v)
}

export interface SpreadTranche { date: string; amount: number; index: number; of: number }

/**
 * 연체 매입채무를 실적 런레이트로 향후 여러 달에 나눈다.
 *
 * 왜 1일차 일괄이 아닌가: 확정발주 최종일 + 결제조건이 이미 전부 지나 있어(prod 실측 전량 만기 도래)
 * 통째로 예측 첫날에 얹으면 잔액이 −12억으로 시작해 위험일이 영구히 100% 가 된다.
 * 실제로 나가는 속도는 월 3.5억이고, 그 속도야말로 이 회사가 실제로 하는 행동이다.
 *
 * @param total   연체 잔여 합계
 * @param rate    월 실지급 런레이트(0 이면 분산 불가 → 빈 배열, 호출부가 일괄로 되돌린다)
 * @param from    예측 시작일 YYYY-MM-DD
 * @param day     월중 대표 지급일
 * @param maxMonths 안전 상한 — 초과분은 마지막 회차에 몰아 넣는다(돈이 조용히 사라지지 않게)
 */
export function spreadOverdue(
  total: number, rate: number, from: string, day: number, maxMonths = 24
): SpreadTranche[] {
  if (!(total > 0) || !(rate > 0)) return []
  const n = Math.min(maxMonths, Math.max(1, Math.ceil(total / rate)))
  const [fy, fm] = from.split('-').map(Number)
  if (!fy || !fm) return []
  const out: SpreadTranche[] = []
  let left = total
  for (let i = 0; i < n; i++) {
    let y = fy, m = fm + i
    y += Math.floor((m - 1) / 12); m = ((m - 1) % 12) + 1
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const d = Math.min(day, lastDay)
    let date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    // 첫 회차의 대표일이 이미 지났으면 예측 시작일로 당긴다(과거 날짜에 얹으면 곡선 밖으로 떨어진다).
    if (date < from) date = from
    const amount = i === n - 1 ? left : Math.min(rate, left)
    if (amount <= 0) break
    out.push({ date, amount, index: i + 1, of: n })
    left -= amount
  }
  return out
}
