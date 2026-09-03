// 법인카드 순지출 정본 — card_transactions 를 "쓴 돈"으로 합산하는 규칙은 여기 한 곳뿐이다.
//
// 규칙 (memory project-card-offset-reconcile · feedback-card-cancel-dedup)
//   · 금액은 절대값으로 적재되고 부호는 approval_type='CANCEL' 이 표현한다 → 취소는 **차감**한다.
//   · is_offset=1 = "순비용 제외"(승인↔취소 상계쌍 **양쪽** + 가승인 홀드). 상계쌍은 어차피 0 이고
//     가승인은 실지출이 아니므로 **행 자체를 제외**한다. 상계 실패한 취소(±30일 밖·가맹점명 상이·부분취소)는
//     is_offset=0 으로 남으므로 CANCEL 차감이 있어야 빠진다 — 둘 중 하나만 걸면 틀린다.
//
// 2026-09-03 이전엔 세 곳이 세 가지로 셌다: accounting /summary(취소−, offset 무필터) ·
//   cashFlow /projection(취소 → 0, 차감 안 함) · cashflowEngine CARD_EXPECTED(전부 +).
//   100만 승인 + 100만 취소가 같은 사이클에 있으면 예정액이 0 이 아니라 200만으로 잡혔다.
//
// 게이트: scripts/card-spend-selftest.cjs (test:calc)

/** SELECT 절 — 순지출 금액 식. `SUM(${cardNetAmountSql('ct')})` 로 쓴다. */
export function cardNetAmountSql(alias = ''): string {
  const p = alias ? `${alias}.` : ''
  return `CASE WHEN ${p}approval_type = 'CANCEL' THEN -${p}amount ELSE ${p}amount END`
}

/** WHERE 절 — 상계쌍·가승인 제외. 앞에 ` AND ` 가 붙어 있다(entityFilter 와 같은 결합 방식). */
export function cardSpendFilterSql(alias = ''): string {
  const p = alias ? `${alias}.` : ''
  return ` AND COALESCE(${p}is_offset, 0) = 0`
}

/** 메모리 합산용 — 조회 결과 행 하나의 순지출 기여분(제외 대상은 0). */
export function cardNetAmount(row: { amount: number | string | null; approval_type?: string | null; is_offset?: number | null }): number {
  if (Number(row.is_offset) === 1) return 0
  const a = Number(row.amount) || 0
  return row.approval_type === 'CANCEL' ? -a : a
}
