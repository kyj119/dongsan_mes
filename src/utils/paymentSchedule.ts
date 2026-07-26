// 거래처 결제 주기 기반 입금 예정일 계산 (미수금 회수예측 4-3a)
// 설계: docs/superpowers/specs/2026-06-03-receivables-purchase-barobill-brainstorm.md
//
// 거래처마다 결제주기가 제각각(용준님 확인): 월정산 당월말, 월정산 익월말,
// 주단위 누적 임계 정산, 청구건별. 정적 payment_terms_days(전부 30일) → 거래처별 모델.
//
// NET_DAYS(기본·현행 호환): 청구일 + payment_terms_days
// MONTHLY: 마감일 기준 → (마감월 + payment_month_offset)월의 payment_day에 결제
// THRESHOLD: 누적 임계 정산(4-3d) — 현재는 NET_DAYS로 폴백

export interface ClientPaymentTerms {
  payment_cycle_type?: string | null    // NET_DAYS | MONTHLY | THRESHOLD
  payment_terms_days?: number | null
  closing_day?: number | null           // 마감일: null/0/>=29=말일, 1~28=특정일
  payment_month_offset?: number | null  // 0=당월, 1=익월, 2=익익월
  payment_day?: number | null           // 결제일: null/0/>=29=말일, 1~28=특정일
}

function lastDayOfMonth(y: number, m: number): number {
  // m: 1~12 → 해당 월 말일 (new Date(y, m, 0)은 m월의 0일 = m월 말일)
  return new Date(y, m, 0).getDate()
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * 청구일(billedDateStr, YYYY-MM-DD…)과 거래처 결제조건으로 입금 예정일(YYYY-MM-DD) 계산.
 * 파싱 불가 시 입력 날짜 그대로 반환(안전).
 */
export function computeExpectedPaymentDate(billedDateStr: string, t: ClientPaymentTerms): string {
  const datePart = (billedDateStr || '').substring(0, 10)
  const parts = datePart.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return datePart
  let y = parts[0], m = parts[1], d = parts[2] // m: 1~12

  const cycle = (t.payment_cycle_type || 'NET_DAYS').toUpperCase()

  if (cycle === 'MONTHLY') {
    const endClosing = !t.closing_day || t.closing_day >= 29
    const closingDay = endClosing ? lastDayOfMonth(y, m) : Math.min(t.closing_day as number, lastDayOfMonth(y, m))
    // 청구일이 이번 달 마감일 이후면 다음 달 마감 주기로 이월
    if (d > closingDay) { m++; if (m > 12) { m = 1; y++ } }
    const offset = (t.payment_month_offset == null) ? 1 : t.payment_month_offset
    let pm = m + offset, py = y
    while (pm > 12) { pm -= 12; py++ }
    const endPay = !t.payment_day || t.payment_day >= 29
    const payDay = endPay ? lastDayOfMonth(py, pm) : Math.min(t.payment_day as number, lastDayOfMonth(py, pm))
    let result = ymd(py, pm, payDay)
    // 결제일이 청구일보다 이르면(offset=0 + payment_day<청구일 같은 모순 설정) 한 주기 밀어 최소 청구일 이후 보장
    if (result < datePart) {
      pm += 1; if (pm > 12) { pm = 1; py++ }
      const pd2 = endPay ? lastDayOfMonth(py, pm) : Math.min(t.payment_day as number, lastDayOfMonth(py, pm))
      result = ymd(py, pm, pd2)
    }
    return result
  }

  // NET_DAYS(기본) / THRESHOLD(폴백): 청구일 + N일
  const days = (t.payment_terms_days == null) ? 30 : t.payment_terms_days
  const due = new Date(Date.UTC(y, m - 1, d) + days * 86400000)
  return due.toISOString().substring(0, 10)
}

