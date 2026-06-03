// 미수금 회수율(충당) — IFRS9 단순화 provision matrix (4-3b)
// 설계·딥리서치: docs/superpowers/specs/2026-06-03-receivables-purchase-barobill-brainstorm.md
// 위험조정 회수액 = 잔액 × (1 − 유효손실률), 유효손실률 = aging버킷 손실률 × 신용등급 승수.
// 손실률은 ar_provision_rates(편집 가능)에서 로드. 테이블 부재 시 DEFAULT로 graceful fallback.

export interface ProvisionData {
  rates: Record<string, number>        // bucket → loss_rate
  multipliers: Record<string, number>  // grade → multiplier
}

// aging 오래될수록 단조증가 (평탄값 금지 — 연구 검증)
const DEFAULT_RATES: Record<string, number> = {
  CURRENT: 0.005, D1_30: 0.02, D31_60: 0.05, D61_90: 0.15, D90_PLUS: 0.40,
}
const DEFAULT_MULT: Record<string, number> = {
  A: 0.5, B: 0.8, C: 1.0, D: 1.5, F: 2.5, 'N/A': 1.0,
}

export async function loadProvision(db: any): Promise<ProvisionData> {
  const rates: Record<string, number> = {}
  const multipliers: Record<string, number> = {}
  try {
    const rr = await db.prepare('SELECT aging_bucket, loss_rate FROM ar_provision_rates').all()
    for (const r of (rr.results || []) as any[]) rates[r.aging_bucket] = Number(r.loss_rate) || 0
    const mr = await db.prepare('SELECT grade, multiplier FROM ar_grade_multipliers').all()
    for (const m of (mr.results || []) as any[]) multipliers[m.grade] = Number(m.multiplier) || 1
  } catch (_) { /* 테이블 부재 → DEFAULT 사용 */ }
  return { rates, multipliers }
}

/** 미수금 aging_category(최근 입금일 경과 기반) → provision 버킷 */
export function agingCategoryToBucket(category: string): string {
  switch (category) {
    case 'normal': return 'CURRENT'
    case 'warning': return 'D31_60'
    case 'danger': return 'D61_90'
    case 'critical': return 'D90_PLUS'
    case 'no_payment': return 'D31_60' // 이력없음 = 중간 위험(보수적), cold-start
    default: return 'CURRENT'
  }
}

/** 유효 손실률 = 버킷 손실률 × 등급 승수, [0,1] 클램프 */
export function effectiveLossRate(bucket: string, grade: string | null, p: ProvisionData): number {
  const base = p.rates[bucket] ?? DEFAULT_RATES[bucket] ?? 0
  const mult = p.multipliers[grade || 'N/A'] ?? DEFAULT_MULT[grade || 'N/A'] ?? 1
  return Math.min(1, Math.max(0, base * mult))
}
