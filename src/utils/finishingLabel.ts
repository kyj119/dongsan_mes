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
 *   - 펀칭          → `8개(모서리 4, 4변 1)` — 총 개수 → 모서리 → 변마다 **모서리 사이** 개수(실물 표기, 2026-09-11)
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
 * 펀칭 params → 실물 표기 `8개(모서리 4, 4변 1)` · `4개(모서리 좌상·우상, 상 2)`.
 *
 * ★개수 규칙 = 호스트(`mes-a0-host.jsx`)·에이전트(`ProcessOrderItem.jsx`)와 같다(2026-09-11 용준님 확정 「나」):
 *   변 N 은 **양 끝을 포함해** 균등 분배 → N≥2 면 양 끝이 모서리 자리, N=1 이면 가운데 1개.
 *   모서리 체크가 그 자리와 겹치면 하나로 센다(호스트 dedupe 0.1mm). 그래서 상3·하3·좌3·우3 = 12 가 아니라 **8**.
 * 표기는 입력값이 아니라 **실제 뚫리는 자리**로 적는다 — 총개수 → 모서리 → 변마다 「모서리 사이」 개수.
 *   같은 값인 변은 묶는다(상하 · 좌우 · 4변). 개수 0인 위치·margin_* 는 뺀다(여백은 카드 규격에 이미 반영).
 * ★잃는 것: 「모서리 따로 + 변 안쪽 N」 이던 옛 해석(side_top=2 가 안쪽 2개) — 이제 양 끝 2개다.
 *   그 뜻으로 저장된 옛 라인은 라벨이 달라진다(카드 라벨은 발행 시점 스냅샷이라 기존 카드는 불변).
 * 반환값에 「펀칭」은 안 붙는다(PP 이름은 호출부가 붙임).
 * ⚠️ 패널(`a0-panel/js/main.js` punchLabel)이 같은 문장을 만든다 — 게이트 `panel:smoke` 7f 가 둘을 대조한다.
 */
export function formatPunching(params: any): string {
  const p = parseMaybeJson(params)
  if (!p || typeof p !== 'object') return ''

  const num = (k: string) => Math.max(0, Math.floor(Number(p[k]) || 0))
  const t = num('side_top'), b = num('side_bottom'), l = num('side_left'), r = num('side_right')
  // 모서리 = 체크했거나, 이웃한 변의 개수가 2 이상이라 양 끝이 그 자리에 놓이거나
  const corners: Array<[string, boolean]> = [
    ['좌상', num('corner_tl') > 0 || t >= 2 || l >= 2],
    ['우상', num('corner_tr') > 0 || t >= 2 || r >= 2],
    ['좌하', num('corner_bl') > 0 || b >= 2 || l >= 2],
    ['우하', num('corner_br') > 0 || b >= 2 || r >= 2],
  ]
  const inner = (n: number) => (n >= 2 ? n - 2 : n)   // 모서리 사이 개수
  const it = inner(t), ib = inner(b), il = inner(l), ir = inner(r)
  const cornerNames = corners.filter((c) => c[1]).map((c) => c[0])
  const total = cornerNames.length + it + ib + il + ir
  if (total === 0) return ''

  const parts: string[] = []
  if (cornerNames.length === 4) parts.push('모서리 4')
  else if (cornerNames.length > 0) parts.push('모서리 ' + cornerNames.join('·'))
  if (it > 0 && it === ib && it === il && it === ir) parts.push(`4변 ${it}`)
  else {
    if (it > 0 && it === ib) parts.push(`상하 ${it}`)
    else { if (it > 0) parts.push(`상 ${it}`); if (ib > 0) parts.push(`하 ${ib}`) }
    if (il > 0 && il === ir) parts.push(`좌우 ${il}`)
    else { if (il > 0) parts.push(`좌 ${il}`); if (ir > 0) parts.push(`우 ${ir}`) }
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
