// ============================================================================
// 미반영 거래가 **왜** 미반영인지 — 한 곳에서 판정한다.
//
// 왜 있는가(2026-09-09 실측): prod 미반영 620건 중 83건 1.89억은 이미
// `match_reason = '매입대금 지급(...)'` 으로 **판정이 끝나 있는데** 상태가 UNMATCHED 라
// 화면에서 「근거 없음」 279건과 **똑같이 보인다**. 사람이 매달 같은 행을 다시 판단한다.
// 답은 DB 에 있었고 화면이 그걸 안 썼다.
//
// ★SQL 과 TS 두 벌로 판정한다(목록·집계는 SQL, 검증·다른 소비처는 TS) — 그래서
//   `scripts/pending-reason-selftest.cjs` 가 같은 픽스처를 in-memory SQLite 와 TS 에
//   각각 먹여 **둘이 같은 답을 내는지** 본다. 두 벌이 갈리는 건 이 프로젝트의 단골 결함이다.
// ============================================================================

import { SUGGESTION_WEAK_BELOW } from './bankMatchPolicy'

/** 「미반영」에 해당하는 상태 — 화면 탭의 PENDING 과 같은 집합 */
export const PENDING_STATUSES = ['UNMATCHED', 'SUGGESTED', 'CONFIRMED'] as const

export type PendingReasonKey = 'INTERNAL' | 'NO_INVOICE' | 'CONFIRMED' | 'WEAK' | 'SUGGESTED' | 'NONE'

export interface PendingReasonDef {
  key: PendingReasonKey
  /** 칩·뱃지에 쓰는 짧은 이름 */
  label: string
  /** 다음에 무엇을 해야 하는지 — 라벨만으로는 행동이 안 정해진다 */
  hint: string
  /** 행에도 뱃지를 다는가. 화면이 이미 말해 주는 것(약함 표식·빈 거래처칸)은 중복이라 안 단다 */
  rowBadge: boolean
  color: string
}

/** ★순서 = 판정 우선순위. 위에서부터 먼저 걸린 것이 답이다. */
export const PENDING_REASONS: readonly PendingReasonDef[] = [
  { key: 'INTERNAL',   label: '내부거래',        hint: '법인 간 거래입니다. 회계허브 내부거래 탭에서 확인하세요',          rowBadge: true,  color: '#7c3aed' },
  { key: 'NO_INVOICE', label: '매입 전표 없음',   hint: '매입 지급으로 판정됐지만 붙일 지급 전표가 없습니다. 매입 등록이 먼저입니다', rowBadge: true,  color: '#b45309' },
  { key: 'CONFIRMED',  label: '확정 · 적용 대기', hint: '거래처가 확정됐습니다. 적용만 하면 원장에 들어갑니다',              rowBadge: false, color: '#0f766e' },
  { key: 'WEAK',       label: '근거 약함',        hint: '대표자명·부분일치처럼 오탐이 잦은 근거입니다. 한 건씩 확인하세요',      rowBadge: false, color: '#e11d48' },
  { key: 'SUGGESTED',  label: '제안 있음',        hint: '근거가 충분한 제안입니다. 확인 후 적용하세요',                   rowBadge: false, color: '#2563eb' },
  { key: 'NONE',       label: '근거 없음',        hint: '단서가 없습니다. 거래처를 직접 지정해야 합니다',                  rowBadge: false, color: '#6b7280' },
] as const

export const PENDING_REASON_KEYS: readonly PendingReasonKey[] = PENDING_REASONS.map(r => r.key)

export function isPendingReasonKey(v: unknown): v is PendingReasonKey {
  return typeof v === 'string' && (PENDING_REASON_KEYS as readonly string[]).includes(v)
}

export interface PendingReasonRow {
  match_status?: string | null
  match_reason?: string | null
  match_confidence?: number | null
  matched_purchase_payment_id?: number | null
}

/**
 * TS 판정 — SQL(`pendingReasonSql`)과 **같은 답**을 내야 한다.
 * 미반영이 아닌 행은 null(반영·무시된 행에는 사유가 없다).
 */
export function pendingReasonOf(row: PendingReasonRow): PendingReasonKey | null {
  const status = String(row.match_status || '')
  if (!(PENDING_STATUSES as readonly string[]).includes(status)) return null

  const reason = String(row.match_reason || '')
  if (reason.includes('내부거래')) return 'INTERNAL'
  // 「매입대금 지급(...)」·「거래처 확정·매입전표 없음(...)」 — 판정은 끝났고 붙일 전표가 없는 상태.
  //   전표가 이미 붙어 있으면 이 축이 아니다(그건 적용만 남은 것).
  if (reason.includes('매입') && row.matched_purchase_payment_id == null) return 'NO_INVOICE'
  if (status === 'CONFIRMED') return 'CONFIRMED'
  if (status === 'SUGGESTED') {
    return (Number(row.match_confidence) || 0) < SUGGESTION_WEAK_BELOW ? 'WEAK' : 'SUGGESTED'
  }
  return 'NONE'
}

/**
 * SQL 판정 — 목록의 계산 컬럼·집계·필터가 **모두 이 문자열 하나**를 쓴다.
 * `alias` 는 bank_transactions 의 별칭. 상수만 넣으므로 인터폴레이션이 안전하다.
 */
export function pendingReasonSql(alias = 'bt'): string {
  // ★COALESCE 를 벗기지 말 것: match_status 가 NULL 이면 `NULL NOT IN (...)` 이 참이 아니라
  //   NULL 이라 첫 분기를 그냥 지나쳐 「근거 없음」으로 샌다(자체검증이 잡은 실제 어긋남).
  const st = `COALESCE(${alias}.match_status, '')`
  const rs = `COALESCE(${alias}.match_reason, '')`
  return `CASE
      WHEN ${st} NOT IN ('UNMATCHED', 'SUGGESTED', 'CONFIRMED') THEN NULL
      WHEN ${rs} LIKE '%내부거래%' THEN 'INTERNAL'
      WHEN ${rs} LIKE '%매입%' AND ${alias}.matched_purchase_payment_id IS NULL THEN 'NO_INVOICE'
      WHEN ${st} = 'CONFIRMED' THEN 'CONFIRMED'
      WHEN ${st} = 'SUGGESTED' AND COALESCE(${alias}.match_confidence, 0) < ${SUGGESTION_WEAK_BELOW} THEN 'WEAK'
      WHEN ${st} = 'SUGGESTED' THEN 'SUGGESTED'
      ELSE 'NONE'
    END`
}
