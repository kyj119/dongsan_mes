/**
 * 자금예측의 **베이스라인** — 아직 주문·발주로 잡히지 않은 앞으로의 매출·매입을 실적 월평균으로 깐다.
 *
 * ★왜 있는가 (2026-09-09)
 *   유출은 「반복되는 것」이 미래로 깔린다 — 고정비·차입금 스케줄·확정 발주. 그런데 유입은
 *   **지금 있는 것만** 쓴다(§4a 미청구 수주잔고 + §4b 미수). 그게 소진되면 0 이 된다.
 *   prod 실측(2026-09-08, 법인1): 9월 유입 632,379,676 → 10월 3,367,045 → **11월 이후 0**.
 *   유출은 매월 6,300만(고정비+차입금)이 계속 남아 90일 뒤 잔액 −396,688,121 · 위험일 49/90 이 됐다.
 *   **매월 5.3억이 들어오는 회사인데** 예측이 그렇게 나온다 — 위험이 아니라 계산 구조의 산물이다.
 *
 * ★대칭이 규칙이다 — 유입만 깔면 반대쪽으로 똑같이 틀린다.
 *   [[design-cash-forecast-symmetry]] ③ 「분산 스위치는 하나」와 같은 이유다. 매입 런레이트도
 *   같은 스위치로 함께 깐다(prod AR 5.30억 vs AP 2.51억 — 한쪽만 켜면 순현금이 통째로 뒤집힌다).
 *
 * ★이중계상은 **구조로** 막는다 — 그 달에 확정분이 이미 런레이트만큼 있으면 0 을 더한다.
 *   `topUp = max(0, runRate − 그 달 확정분)`. 확정이 늘수록 베이스라인이 저절로 줄어든다.
 */

/** 런레이트 근거로 인정할 최소 완결월 수. 이보다 적으면 아무것도 깔지 않는다. */
export const BASELINE_MIN_MONTHS = 3
/** 런레이트 대비 이 비율 미만의 보충은 노이즈로 보고 버린다. */
export const BASELINE_NOISE_RATIO = 0.02

export interface BaselineTopUp {
  /** YYYY-MM */
  month: string
  amount: number
  /** 그 달에 이미 잡혀 있던 확정분 — 화면이 「왜 이 금액인지」를 설명할 수 있게 같이 준다. */
  existing: number
}

/**
 * 월별 보충액을 구한다.
 *
 * @param runRate       실적 월평균(원). 0 이하면 빈 배열.
 * @param runRateMonths 그 평균의 근거가 된 완결월 수.
 * @param existingByMonth 'YYYY-MM' → 그 달에 이미 잡힌 확정 금액.
 * @param months        예측창의 월 목록(YYYY-MM, 오름차순).
 * @param skipFirst     첫 달을 건너뛸지. **기본 true** — 진행 중인 달은 실적이 반쯤 들어와 있어
 *                      월평균과 비교하면 없는 돈을 만든다.
 */
export function baselineTopUps(
  runRate: number,
  runRateMonths: number,
  existingByMonth: Map<string, number>,
  months: string[],
  skipFirst = true
): BaselineTopUp[] {
  const rate = Number(runRate) || 0
  if (rate <= 0) return []
  if ((Number(runRateMonths) || 0) < BASELINE_MIN_MONTHS) return []
  const floor = rate * BASELINE_NOISE_RATIO
  const out: BaselineTopUp[] = []
  for (let i = 0; i < months.length; i++) {
    if (skipFirst && i === 0) continue
    const m = months[i]
    const existing = Number(existingByMonth.get(m)) || 0
    const topUp = rate - existing
    if (topUp < floor) continue
    out.push({ month: m, amount: Math.round(topUp), existing: Math.round(existing) })
  }
  return out
}

/** 예측창 [from, to] 이 걸치는 월 목록(YYYY-MM, 오름차순). */
export function monthsInWindow(from: string, to: string): string[] {
  const out: string[] = []
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7))
  const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7))
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++; if (m > 12) { m = 1; y++ }
    if (out.length > 240) break
  }
  return out
}

/** 그 달의 지정일. 말일을 넘으면 말일로 클램프한다(2월 31일 같은 날짜를 만들지 않게). */
export function monthDay(month: string, day: number): string {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7))
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const d = Math.min(Math.max(Math.round(day) || 1, 1), last)
  return `${month}-${String(d).padStart(2, '0')}`
}
