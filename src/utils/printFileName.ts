/**
 * 출력 파일명에서 **선언 수량**을 읽는다 — 과다 출력 판정의 분모.
 *
 * 파일명은 축이 둘이다(CLAUDE.md §재작업 — 축부터 갈린다):
 *   패널 축   「거래처-키워드(폭-높이-N조|N장)-후가공」      → 괄호 안 `-N조)` / `-N장)`
 *   에이전트 축 「...-NEA-E1-yyyymmdd-nnn-nnn」                → `-NEA-`
 * 2026-09-22 실기: TOPM-01 에 1EA 주문을 2매 출력했는데 과다가 안 떴다 — 판정이 패널 축 정규식만 갖고 있어
 * 에이전트 축 이름(`에이블D-500x120_1-10-BYD광주전시장-원형나무-1EA-E1-20260922-001-001`)을 **아예 안 읽었다**.
 * 「양면」이 붙으면 앞뒤 2매가 정상이라 ×2 — 호출부가 아니라 여기서 한다(규칙은 한 곳).
 *
 * @returns 선언 수량(≥1) · 못 읽으면 null(판정하지 않는다 — 추측으로 배지를 찍지 않는다)
 */
export const DECLARED_QTY_RE = /-(\d+)\s*(조|장)\)|-(\d+)EA-/

export function parseDeclaredQty(fileName: string | null | undefined): number | null {
  const fn = String(fileName || '')
  const m = fn.match(DECLARED_QTY_RE)
  if (!m) return null
  let n = parseInt(m[1] || m[3], 10)
  if (!(n >= 1)) return null
  if (fn.includes('양면')) n *= 2
  return n
}
