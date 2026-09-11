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
// 게이트: scripts/card-spend-selftest.cjs (test:calc) · scripts/card-offset-reason-audit.cjs (audit:card-offset-reason)

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

// ---------------------------------------------------------------------------
// ⚠️ 미배선(WIP) — 아래 청구축 3종(NON_BILLED_REASONS·cardBillingFilterSql·cardBillingAmount)은
//   아직 라우트가 소비하지 않는다(2026-09-11 #638 확인). 죽은 코드가 아니라 **카드사 청구액↔통장 출금액
//   대사** 화면을 위한 인프라다: 마이그 0575 의 offset_reason 컬럼은 prod 에 있고 OFFSET_REASON_LABEL 은
//   이미 화면에서 쓰인다. 순지출축(cardSpendFilterSql)과 뜻이 달라 한 함수로 겸할 수 없어 분리해 둔 것으로,
//   할부·마감주기 대사(memory design-card-billing-cycle)가 배선될 때 소비한다. 테스트는 test:card-spend 에 있다.
//   ★소비처가 계속 0 이면 이 주석부터 의심할 것 — 대사 기능이 취소됐다면 그때 함께 제거한다.
// ---------------------------------------------------------------------------
// 청구 기준 — 카드사가 실제로 **청구**하는 금액 (위의 순지출과 다른 축이다)
//
// 위 `cardSpendFilterSql` 은 「우리 장부의 비용」이라 카드로 결제한 매입(매입전표로 따로 계상)을
// 뺀다. 카드사는 그런 사정을 모르고 그대로 청구하므로, 출금액과 맞춰 보려면 그 행을 **되살려야**
// 한다. 두 축을 한 함수로 겸할 수 없어서 마이그 0575 로 사유 마커(offset_reason)를 분리했다.
//
//   청구에 들어감  PAIR(부호대로 · 같은 사이클이면 0, 사이클을 걸치면 각자) · PURCHASE · 마커없음
//   청구에 안 들어감  PREAUTH(홀드일 뿐 청구 안 됨) · ORPHAN_CANCEL(원승인이 청구된 적 없어 환급도 없음)
//
// 마커가 NULL 이면 청구에 **포함**한다 — 카드사는 사정을 봐주지 않는다는 쪽이 안전한 기본값이고,
// 신규 수집분은 ingest 가 항상 채우므로 NULL 은 감사(`audit:card-offset-reason`)로 걸린다.
//
// ⚠️ 사이클 합을 출금액과 맞출 땐 **카드사 단위**로 묶는다. 하이패스 부카드가 본카드 청구에
//    합산되므로 카드 한 장으로는 맞지 않는다(2026-09-07 실측).

/** 청구에서 빠지는 사유 — 이 둘만 카드사가 청구하지 않는다. */
export const NON_BILLED_REASONS = ['PREAUTH', 'ORPHAN_CANCEL'] as const

/** 제외 사유 코드. is_offset=1 인 행에만 붙고, is_offset=0 이면 NULL. */
export type OffsetReason = 'PAIR' | 'PREAUTH' | 'PURCHASE' | 'ORPHAN_CANCEL'

/** WHERE 절 — 청구 기준. 금액식은 `cardNetAmountSql`(취소 차감)을 그대로 쓴다. */
export function cardBillingFilterSql(alias = ''): string {
  const p = alias ? `${alias}.` : ''
  return ` AND COALESCE(${p}offset_reason, '') NOT IN (${NON_BILLED_REASONS.map(r => `'${r}'`).join(', ')})`
}

/** 메모리 합산용 — 조회 결과 행 하나의 청구 기여분(청구 안 되는 사유는 0). */
export function cardBillingAmount(row: { amount: number | string | null; approval_type?: string | null; offset_reason?: string | null }): number {
  if ((NON_BILLED_REASONS as readonly string[]).includes(String(row.offset_reason || ''))) return 0
  const a = Number(row.amount) || 0
  return row.approval_type === 'CANCEL' ? -a : a
}

/** 화면·CSV 표기. 사유가 없는 옛 행(마커 이전 잔재)은 '상계'로 폴백한다. */
export const OFFSET_REASON_LABEL: Record<string, string> = {
  PAIR: '상계',
  PREAUTH: '가승인',
  PURCHASE: '매입계상',
  ORPHAN_CANCEL: '짝없는취소',
}
