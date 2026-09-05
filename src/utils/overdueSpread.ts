// 연체 분산 — 매입·매출 **공용**. (2026-09-06)
//
// ■ 왜 별도 모듈인가
//   「연체를 실적 속도로 나눠 얹는다」는 판단은 지급(매입)과 수금(매출) 양쪽에 똑같이 필요하다.
//   매입 쪽에 먼저 만들었다고 apSettlement.ts 에 두면 매출이 그걸 가져다 쓰는 순간
//   파일 이름이 거짓말을 하고, 안 가져다 쓰면 **사본이 생긴다**(CLAUDE.md §사본 신설 금지).
//   FIFO 충당만 매입 전용이라 거기 남고(발주↔지급 연결이 없어서 생긴 문제), 여기는 양쪽이 함께 쓴다.
//
// ■ 공통 원칙 하나: **마지막 입력월은 평균에서 뺀다**
//   지급도 수금도 입력이 밀린다(prod 2026-09-06 실측: 매입 최종 2026-08 4건 · 매출 최종 2026-08-11 7건).
//   진행 중인 달을 평균에 넣으면 런레이트가 통째로 주저앉아 연체가 영원히 안 끝나는 것처럼 보인다.

/** 실적 이벤트(지급 또는 수금) 한 건. 런레이트는 실제 현금(CASH)만 세고, 조정은 통장에서 움직이지 않는다. */
export interface CashEvent {
  date: string          // YYYY-MM-DD
  amount: number
  kind: 'PAYMENT' | 'ADJUSTMENT'
}

/** YYYY-MM-DD 두 개의 일수 차(b - a). 잘못된 값이면 null. */
export function daysBetween(a: string, b: string): number | null {
  const pa = Date.parse(a + 'T00:00:00Z'), pb = Date.parse(b + 'T00:00:00Z')
  if (!Number.isFinite(pa) || !Number.isFinite(pb)) return null
  return Math.round((pb - pa) / 86400000)
}

/** 표본 중앙값(정수 반올림). 비면 null. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  const v = s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  return Math.round(v)
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
export function paymentRunRate(events: CashEvent[], maxMonths = 6): RunRate {
  const byMonth = new Map<string, number>()
  for (const e of events) {
    if (e.kind !== 'PAYMENT') continue
    const m = (e.date || '').substring(0, 7)
    if (m.length !== 7) continue
    byMonth.set(m, (byMonth.get(m) || 0) + (Number(e.amount) || 0))
  }
  return runRateFromMonthly(byMonth, maxMonths)
}

/**
 * 월별 합계(YYYY-MM → 금액)에서 바로 런레이트를 구한다.
 * 행이 수천 건인 쪽(수금 3,816건)은 행을 다 끌어오지 않고 GROUP BY 결과만 넘긴다.
 */
export function runRateFromMonthly(byMonth: Map<string, number>, maxMonths = 6): RunRate {
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
export function medianPaymentDay(events: CashEvent[]): number {
  const counts = new Map<number, number>()
  for (const e of events) {
    if (e.kind !== 'PAYMENT') continue
    const d = Number((e.date || '').substring(8, 10))
    if (d >= 1 && d <= 31) counts.set(d, (counts.get(d) || 0) + 1)
  }
  return medianDayFromCounts(counts)
}

/** 일자별 건수(1~31 → 건수)에서 대표일을 구한다. 표본이 없으면 25일(결제 관행). */
export function medianDayFromCounts(counts: Map<number, number>): number {
  let total = 0
  for (const n of counts.values()) total += n
  if (total === 0) return 25
  const half = Math.floor(total / 2)
  let seen = 0
  for (const d of [...counts.keys()].sort((a, b) => a - b)) {
    seen += counts.get(d) || 0
    if (seen > half) return d
  }
  return 25
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
