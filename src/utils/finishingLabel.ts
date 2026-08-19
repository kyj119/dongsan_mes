/**
 * 마감·후가공 표기 정본 (2026-08-19 용준님)
 *
 * 왜 여기 모았는가: 같은 마감 데이터가 화면마다 다른 문장으로 나왔다 —
 *   체크리스트 `마감(2면열재단)` · 카드 배지 `열재단 사방` · 봉제 지시표 `2면열재단`.
 *   게다가 **어느 변인지가 전부 소실**돼(방식별 개수만 셈) 현장이 카드만 보고 작업할 수 없었다.
 *   펀칭은 더 심해서 params 값을 순서대로 이어붙인 `펀칭 1cm 1cm 2cm 0cm 0cm 0cm 0cm 0cm` 이 나왔다
 *   (개수에 cm 오붙임 + 0도 출력 + 위치 미표기).
 *
 * 현장 표기 규칙:
 *   - 4변 전부 같은 방식 → `4방열재단`
 *   - 그 외          → 방향을 그대로 적는다 `상하좌 열재단` · `좌우 줄미싱+상하 봉미싱`
 *   - 펀칭          → `4개(상 2, 모서리 좌상·우상)` — 총 개수 먼저, 위치는 괄호
 *
 * ⚠️ 클라 사본 = `src/scripts/shared/finishingLabel.js` (카드 상세·모달·봉제 지시표가 씀).
 *    한쪽만 고치면 "화면 표기 ≠ 체크리스트 라벨"이 된다 — 반드시 쌍으로 수정.
 *    서버 쪽 게이트 = `npm run test:finishing-label`.
 */

const DIR_ORDER = ['top', 'bottom', 'left', 'right'] as const
const DIR_KO: Record<string, string> = { top: '상', bottom: '하', left: '좌', right: '우' }

const PUNCH_CORNERS: Array<[string, string]> = [
  ['corner_tl', '좌상'], ['corner_tr', '우상'], ['corner_bl', '좌하'], ['corner_br', '우하'],
]
const PUNCH_SIDES: Array<[string, string]> = [
  ['side_top', '상'], ['side_bottom', '하'], ['side_left', '좌'], ['side_right', '우'],
]

/**
 * 마감(order_items.finishing) 4변 → 현장 표기.
 * `{top:'열재단',bottom:'열재단',left:'열재단',right:'열재단'}` → `4방열재단`
 * `{left:'줄미싱',right:'줄미싱',top:'봉미싱',bottom:'봉미싱'}` → `좌우 줄미싱+상하 봉미싱`
 */
export function formatFinishing(fin: any): string {
  const f = parseMaybeJson(fin)
  if (!f || typeof f !== 'object') return ''

  const groups = new Map<string, string[]>()   // 방식 → 방향(상하좌우 순으로 쌓임)
  for (const d of DIR_ORDER) {
    const m = f[d]
    if (m && typeof m === 'string') {
      if (!groups.has(m)) groups.set(m, [])
      groups.get(m)!.push(d)
    }
  }
  if (groups.size === 0) return ''

  const entries = [...groups.entries()]
  if (entries.length === 1 && entries[0][1].length === 4) return `4방${entries[0][0]}`

  // 좌우 축을 먼저 적는 현장 표기(「좌우 줄미싱+상하 봉미싱」)를 따른다.
  // 방향 문자 자체는 상하좌우 순(「상하좌 열재단」) — 그룹 정렬만 좌우 우선.
  entries.sort((a, b) => sideRank(a[1]) - sideRank(b[1]))
  return entries
    .map(([method, dirs]) => `${dirs.map((d) => DIR_KO[d]).join('')} ${method}`)
    .join('+')
}

function sideRank(dirs: string[]): number {
  return dirs.some((d) => d === 'left' || d === 'right') ? 0 : 1
}

/**
 * 펀칭 params → `4개(상 2, 모서리 좌상·우상)`.
 * 개수 0인 위치·margin_* 는 뺀다(여백은 카드 규격에 이미 반영 — 지시문에선 잡음).
 * 반환값에 「펀칭」은 안 붙는다(PP 이름은 호출부가 붙임).
 */
export function formatPunching(params: any): string {
  const p = parseMaybeJson(params)
  if (!p || typeof p !== 'object') return ''

  const num = (k: string) => Math.max(0, Math.floor(Number(p[k]) || 0))
  const corners = PUNCH_CORNERS.map(([k, ko]) => ({ ko, n: num(k) })).filter((x) => x.n > 0)
  const sides = PUNCH_SIDES.map(([k, ko]) => ({ ko, n: num(k) })).filter((x) => x.n > 0)
  const total = [...corners, ...sides].reduce((s, x) => s + x.n, 0)
  if (total === 0) return ''

  const parts: string[] = []
  const allCorners = corners.length === 4 && corners.every((c) => c.n === 1)
  if (allCorners) parts.push('4모서리')
  for (const s of sides) parts.push(`${s.ko} ${s.n}`)
  if (!allCorners && corners.length > 0) {
    parts.push('모서리 ' + corners.map((c) => (c.n === 1 ? c.ko : `${c.ko} ${c.n}`)).join('·'))
  }
  return `${total}개(${parts.join(', ')})`
}

/** 후가공 1건 → `펀칭 4개(상 2, 모서리 좌상·우상)` · `부직포 7cm` · `열재단 상하` */
export function formatPP(pp: any): string {
  if (!pp) return ''
  if (typeof pp === 'string') return pp
  const name = String(pp.name || pp.code || '').trim()
  if (!name) return ''
  const params = pp.params && typeof pp.params === 'object' ? pp.params : null
  if (!params) return name

  if (String(pp.code || '') === 'PUNCHING' || name === '펀칭' || isPunchParams(params)) {
    const t = formatPunching(params)
    return t ? `${name} ${t}` : name
  }
  const detail = formatParams(params, name)
  return detail ? `${name} ${detail}` : name
}

/** 후가공 배열 → `펀칭 4개(상 2), 부직포 7cm` */
export function formatPPList(list: any, sep = ', '): string {
  const arr = parseMaybeJson(list)
  if (!Array.isArray(arr)) return ''
  return arr.map(formatPP).filter(Boolean).join(sep)
}

function isPunchParams(params: any): boolean {
  return PUNCH_CORNERS.concat(PUNCH_SIDES).some(([k]) => k in params)
}

function formatParams(params: Record<string, any>, name: string): string {
  const out: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue
    if (k.startsWith('margin_')) continue          // 여백 = 규격에 반영됨. 지시문엔 불필요
    if (Array.isArray(v)) {                        // annotation.positions 등
      const s = v.map((x) => DIR_KO[String(x)] || String(x)).filter(Boolean).join('')
      if (s) out.push(s)
      continue
    }
    if (typeof v === 'object') {
      // 마감 후가공의 params.directions — 예전엔 String(객체)라 `열재단 [object Object]` 가 찍혔다.
      // 값(여백 cm)이 아니라 **어느 변인지**만 쓴다(0cm 열재단도 방향은 유효).
      const dirs = DIR_ORDER.filter((d) => Object.prototype.hasOwnProperty.call(v, d))
      if (dirs.length === 4) out.push('4방')
      else if (dirs.length > 0) out.push(dirs.map((d) => DIR_KO[d]).join(''))
      continue
    }
    const s = String(v).trim()
    if (!s || s === '없음' || s === name) continue
    out.push(/^\d+(\.\d+)?$/.test(s) ? `${s}cm` : s)
  }
  return out.join(' ')
}

function parseMaybeJson(v: any): any {
  if (typeof v !== 'string') return v
  if (!v.trim()) return null
  try { return JSON.parse(v) } catch { return null }
}
