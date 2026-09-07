/**
 * 계정 역할 — 손익에서 무엇이 비용이고 무엇이 아닌지의 **정본**.
 *
 * 왜 순수 모듈인가: 이 판정이 틀려도 화면은 200 이고, 표는 정상적으로 그려진다. 숫자만 틀린다.
 * 예전에는 계정 **이름 문자열 배열**(`CAT_ROLE`)이 이 판정을 했고, 그 배열이 두 파일에 사본으로
 * 있었다. 2026-09-07 하루에 계정 이름을 세 번 바꾸면서(0578·0579·0583) 매번 두 곳을 손으로
 * 따라 고쳐야 했다 — 한 번만 빠뜨렸으면 차입금상환 4.3억이 조용히 판관비가 됐다.
 * 이제 역할은 `expense_categories.role` 에 있고, 여기는 그 값을 **해석만** 한다(0584).
 */

export const EXPENSE_ROLES = ['SGA', 'COGS', 'NONOP', 'TAX', 'NOT_EXPENSE'] as const
export type ExpenseRole = (typeof EXPENSE_ROLES)[number]

export const EXPENSE_ROLE_LABEL: Record<ExpenseRole, string> = {
  SGA: '판매관리비',
  COGS: '매출원가',
  NONOP: '영업외비용',
  TAX: '법인세',
  NOT_EXPENSE: '비용 아님(자금이동)',
}

/** 역할별 한 줄 설명 — 계정 편집 화면이 그대로 쓴다(설명이 코드와 갈라지지 않게). */
export const EXPENSE_ROLE_HINT: Record<ExpenseRole, string> = {
  SGA: '판매비와관리비 — 급여·임차료·소모품처럼 영업이익을 깎는 비용',
  COGS: '매출원가 — 원재료비·외주가공비',
  NONOP: '영업외비용 — 이자비용·기부금 (영업이익 아래)',
  TAX: '법인세 — 세전이익 아래',
  NOT_EXPENSE: '비용이 아닌 자금이동 — 차입·상환·예수금·자산취득·세금 납부',
}

/**
 * 저장된 값을 역할로 해석한다. 모르는 값·빈값은 **SGA(비용)**.
 *
 * ★기본을 SGA 로 두는 이유: 반대로 두면 비용이 조용히 **누락**돼 영업이익이 과대해지고,
 *   그건 화면에서 티가 나지 않는다. 과대계상은 숫자가 움직여 눈에 띈다.
 *   「틀리더라도 보이는 쪽」으로 떨어뜨린다.
 */
export function normalizeRole(v: unknown): ExpenseRole {
  const s = String(v ?? '').trim().toUpperCase()
  return (EXPENSE_ROLES as readonly string[]).includes(s) ? (s as ExpenseRole) : 'SGA'
}

/** 손익(비용) 축에 들어가는가 — NOT_EXPENSE 만 빠진다. */
export function countsAsExpense(v: unknown): boolean {
  return normalizeRole(v) !== 'NOT_EXPENSE'
}

/** 영업이익 축(매출원가+판관비)에 들어가는가 — NONOP·TAX·NOT_EXPENSE 는 아래로 뺀다. */
export function countsAsOperating(v: unknown): boolean {
  const r = normalizeRole(v)
  return r === 'SGA' || r === 'COGS'
}
