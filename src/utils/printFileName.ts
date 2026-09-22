/**
 * 출력 파일명에서 **선언 수량**을 읽는다 — 과다 출력 판정의 분모(파일명 경로).
 *
 * 파일명은 축이 둘이다(CLAUDE.md §재작업 — 축부터 갈린다):
 *   패널 축    「거래처-키워드(폭-높이-N조|N장)-후가공」   → 괄호 안 `-N조)` / `-N장)`
 *   에이전트 축 「...-NEA-E1-yyyymmdd-nnn-nnn」             → `-NEA-` (Program.cs:3107 = 주문 라인 수량)
 * 2026-09-22 실기: TOPM-01 에 1EA 주문을 2매 출력했는데 과다가 안 떴다 — 판정이 패널 축 정규식만 갖고 있어
 * 에이전트 축 이름(`에이블D-500x120_1-10-BYD광주전시장-원형나무-1EA-E1-20260922-001-001`)을 **아예 안 읽었다**.
 *
 * ★분모의 **정본은 카드 수량**이다(연결된 행). 파일명은 카드가 없을 때의 대리값이다 — 라우트가 그 순서로 고른다.
 *   여기 있는 것은 파일명을 읽는 규칙과, 두 경로가 **같이** 써야 하는 양면 배수뿐이다.
 */
export const DECLARED_QTY_RE = /-(\d+)\s*(조|장)\)|-(\d+)EA-/

/** 「양면」은 앞뒤 2매가 정상 → 분모 ×2. 카드 수량 경로도 같은 배수를 쓴다(규칙은 한 곳). */
export function doubleSidedFactor(fileName: string | null | undefined): number {
  return String(fileName || '').includes('양면') ? 2 : 1
}

/** 파일명에서 읽은 선언 수량(양면 반영, ≥1). 못 읽으면 null — 추측으로 배지를 찍지 않는다. */
export function parseDeclaredQty(fileName: string | null | undefined): number | null {
  const fn = String(fileName || '')
  const m = fn.match(DECLARED_QTY_RE)
  if (!m) return null
  const n = parseInt(m[1] || m[3], 10)
  if (!(n >= 1)) return null
  return n * doubleSidedFactor(fn)
}

/**
 * 과다 판정의 분모를 고른다 — **카드 수량이 있으면 그것**, 없으면 파일명.
 * @returns {qty, source}  qty=null 이면 판정하지 않는다
 */
export function declaredQtyFor(fileName: string | null | undefined, cardQty: number | null | undefined):
  { qty: number | null; source: 'card' | 'file' | null } {
  if (typeof cardQty === 'number' && cardQty >= 1) {
    return { qty: cardQty * doubleSidedFactor(fileName), source: 'card' }
  }
  const fromName = parseDeclaredQty(fileName)
  return fromName == null ? { qty: null, source: null } : { qty: fromName, source: 'file' }
}
