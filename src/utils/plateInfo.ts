/**
 * 재단 판 정보 — 한 장을 판 여러 개로 나눈 등록의 「판 k/N」과 그 판의 조각 번호 (2026-09-26 작업지시서 「가」 안).
 *
 * 재단 패널(호스트 CUT-CEP-0.58.0+)이 manifest 에 싣는다: `batch_index`(k) · `batch_total`(N) · `pieces`([{n,w,h,x,y,r}]).
 * 에이전트는 manifest 를 통째로 넘기므로 POST /intakes body 에 그대로 온다.
 * **스키마를 바꾸지 않고** ai_analysis_requests.groups_json 의 첫 그룹에 싣는다 — 작업지시서·대기함이 이미 그 JSON 을 읽는다.
 *
 * ⚠️ 받는 값은 디자이너 PC 에서 온 것이다 → 형태를 엄격히 거른다. 이상하면 **싣지 않는다**(종전 동작 = 판 정보 없음).
 */
export interface PlateInfo {
  plate_index?: number
  plate_total?: number
  piece_labels?: string[]
  /** 조각 상세 — 판짜기 작업지시서 목록표(규격)·배치도(원본 그림 위 상자 %). 셸 0.102.0+ 만 b 를 싣는다 */
  pieces?: PieceInfo[]
}

export interface PieceInfo {
  n: string
  w: number
  h: number
  /** 원본 전체 그림(overview) 대비 % [x, y, w, h] — 없으면 배치도에 테두리를 못 그린다(표는 그린다) */
  b?: [number, number, number, number]
}

const LABEL_RE = /^[0-9]{1,4}(-[0-9]{1,4})?$/

/** 조각 1개 → 상세(번호·실물 mm·상자). 규격이 이상하면 null(표에 거짓 규격을 싣지 않는다) */
function pieceOf(p: unknown): PieceInfo | null {
  if (!p || typeof p !== 'object') return null
  const r = p as Record<string, unknown>
  const n = String(r.n ?? ''), w = Number(r.w), h = Number(r.h)
  if (!LABEL_RE.test(n) || !(Number.isInteger(w) && w > 0 && w <= 100000) || !(Number.isInteger(h) && h > 0 && h <= 100000)) return null
  const out: PieceInfo = { n, w, h }
  const b = r.b
  if (Array.isArray(b) && b.length === 4 && b.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= -5 && v <= 105)) {
    out.b = [b[0], b[1], b[2], b[3]] as [number, number, number, number]
  }
  return out
}

const MAX_PLATES = 99
const MAX_PIECES = 500

/** manifest(body) → 판 정보. 판이 1장이거나 값이 이상하면 빈 객체 */
export function parsePlateInfo(body: Record<string, unknown>): PlateInfo {
  const k = Number(body.batch_index), n = Number(body.batch_total)
  if (!(Number.isInteger(k) && Number.isInteger(n) && n >= 2 && n <= MAX_PLATES && k >= 1 && k <= n)) return {}
  const out: PlateInfo = { plate_index: k, plate_total: n }
  const raw = body.pieces
  if (Array.isArray(raw)) {
    const labels: string[] = []
    const detail: PieceInfo[] = []
    for (const p of raw.slice(0, MAX_PIECES)) {
      const lab = p && typeof p === 'object' ? String((p as Record<string, unknown>).n ?? '') : ''
      // 번호는 패널이 만든 「줄-순번」(1-3) 또는 일련(12) — 숫자·대시만 받는다
      if (LABEL_RE.test(lab)) labels.push(lab)
      const d = pieceOf(p)
      if (d) detail.push(d)
    }
    if (labels.length) out.piece_labels = labels
    if (detail.length) out.pieces = detail
  }
  return out
}

/** groups_json 의 첫 그룹에서 판 정보를 읽는다(작업지시서·대기함 공용). 없으면 null */
export function plateOfGroup(g: unknown): PlateInfo | null {
  if (!g || typeof g !== 'object') return null
  const r = g as Record<string, unknown>
  const k = Number(r.plate_index), n = Number(r.plate_total)
  if (!(Number.isInteger(k) && Number.isInteger(n) && n >= 2 && k >= 1 && k <= n)) return null
  const labels = Array.isArray(r.piece_labels) ? (r.piece_labels as unknown[]).map(String).filter((s) => LABEL_RE.test(s)) : []
  const out: PlateInfo = { plate_index: k, plate_total: n, piece_labels: labels }
  if (Array.isArray(r.pieces)) {
    const detail = (r.pieces as unknown[]).slice(0, MAX_PIECES).map(pieceOf).filter((d): d is PieceInfo => !!d)
    if (detail.length) out.pieces = detail
  }
  return out
}
