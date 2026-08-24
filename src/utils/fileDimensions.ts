/**
 * 파일 규격 자동 판독 — 일러스트레이터 없이 파일 머리(+꼬리) 텍스트에서 규격(cm)을 읽는다.
 *
 * 정본 스펙 = docs/superpowers/specs/2026-08-24-file-dimension-probe.md
 * 근거 = 파일→주문서 백테스트 EPS %%BoundingBox 헤더 파싱 100% 판독(4,614건,
 *        docs/order-file-matching/specless.py:16).
 *
 * 의미 차이(중요): BoundingBox=작업물 범위(도련 포함 가능) · MediaBox=아트보드.
 * 따라서 결과는 항상 "제안"이며 확정은 사람 — 소비자는 허용오차로 흡수해야 한다.
 *
 * 순수 함수(문자열 입력) — 게이트 = npm run test:file-dims (scripts/file-dims-selftest.cjs)
 */

export type MeasureSource = 'eps-hires' | 'eps-bbox' | 'pdf-mediabox' | 'none'

export interface FileDimensions {
  w_cm: number | null
  h_cm: number | null
  source: MeasureSource
}

/** 판독 입력 크기 — 머리/꼬리 각 64KB (specless.py 검증 구간과 동일) */
export const PROBE_BYTES = 65536

const PT_TO_CM = 2.54 / 72

// specless.py:16 RX_BB 와 같은 수용 폭([\d.\-]+). HiRes/일반을 분리해 우선순위를 준다.
const RX_HIRES = /%%HiResBoundingBox:[ \t]*([\d.\-]+)[ \t]+([\d.\-]+)[ \t]+([\d.\-]+)[ \t]+([\d.\-]+)/
const RX_BBOX = /%%BoundingBox:[ \t]*([\d.\-]+)[ \t]+([\d.\-]+)[ \t]+([\d.\-]+)[ \t]+([\d.\-]+)/
// PDF: 첫 /MediaBox [x0 y0 x1 y1] — 대괄호 안 개행 허용. 간접참조(`/MediaBox 3 0 R`)는 매치 안 됨 = 실패 허용.
const RX_MEDIABOX = /\/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s*\]/

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 4수치 매치 → {w,h} cm. 0·음수·비유한은 실패(null). */
function toCm(m: RegExpMatchArray | null): { w: number; h: number } | null {
  if (!m) return null
  const x0 = parseFloat(m[1]); const y0 = parseFloat(m[2])
  const x1 = parseFloat(m[3]); const y1 = parseFloat(m[4])
  const w = (x1 - x0) * PT_TO_CM
  const h = (y1 - y0) * PT_TO_CM
  if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return null
  return { w: round2(w), h: round2(h) }
}

/** EPS 텍스트 한 덩어리에서 규격 추출 — HiRes 우선, 없으면 일반 BoundingBox. */
function scanEps(text: string): FileDimensions | null {
  const hires = toCm(text.match(RX_HIRES))
  if (hires) return { w_cm: hires.w, h_cm: hires.h, source: 'eps-hires' }
  const bbox = toCm(text.match(RX_BBOX))
  if (bbox) return { w_cm: bbox.w, h_cm: bbox.h, source: 'eps-bbox' }
  return null
}

function scanPdf(text: string): FileDimensions | null {
  const mb = toCm(text.match(RX_MEDIABOX))
  if (mb) return { w_cm: mb.w, h_cm: mb.h, source: 'pdf-mediabox' }
  return null
}

function isEps(head: string): boolean {
  // DOS EPS 바이너리 래퍼는 디코드 시 앞에 쓰레기가 붙을 수 있어 시작 고정 대신 포함 판정
  return head.includes('%!PS-Adobe')
}

function isPdf(head: string): boolean {
  // PDF 헤더는 파일 앞 1KB 내 존재(사양상 오프셋 여유 허용). .ai(PDF호환)도 이 형.
  return head.slice(0, 1024).includes('%PDF-')
}

/**
 * 판정 순서(실파일 실측 근거, 2026-08-24):
 * ① %PDF- 컨테이너면 MediaBox(아트보드) 우선 — .ai 는 머리 64KB 안에 AI 네이티브 헤더
 *    (`%!PS-Adobe` + `%%BoundingBox: 0 0 0 0`)를 임베드하고 있어, EPS 마커를 먼저 보면
 *    0×0 bbox 에 가로채여 정상 .ai 가 none 이 된다(실측: Illustrator 30.7 저장본).
 * ② PDF 스캔 실패 시 임베디드 EPS 헤더 폴백 — 실작업 .ai 의 네이티브 bbox 는 실제 작업물
 *    범위라 MediaBox 를 못 찾을 때 유효한 차선이다.
 * ③ %PDF- 부재 + %!PS-Adobe 존재 = EPS(DOS 래퍼 포함).
 */
function scannersFor(head: string): Array<(text: string) => FileDimensions | null> {
  if (isPdf(head)) return [scanPdf, scanEps]
  if (isEps(head)) return [scanEps]
  return []
}

/**
 * 머리 판독으로 부족해 꼬리 64KB 재스캔이 필요한가.
 * EPS `(atend)`(값이 %%Trailer 뒤) 또는 PDF MediaBox 미발견(뒤쪽 페이지 오브젝트)이 해당.
 * 라우트에서 꼬리 slice 를 추가로 읽을지 결정하는 데 쓴다.
 */
export function needsTailScan(head: string): boolean {
  if (scannersFor(head).length === 0) return false
  return parseFileDimensions(head).source === 'none'
}

/**
 * 파일 머리(+선택적 꼬리) 텍스트 → 규격(cm).
 * 판독 불가는 { w_cm:null, h_cm:null, source:'none' } — 프리필이 "안 뜨는 것"이 정답인 형.
 * JPG/PNG 는 1차 제외(DPI 신뢰 불가) — 자연히 none.
 * ⚠️ 스펙은 .ai(pdfCompatible=false)=%PDF- 부재=none 을 가정했으나, 최신 일러(30.7) 저장본은
 *    비호환이어도 %PDF- 컨테이너+정상 MediaBox 를 가진다(실측) → 이 경우 아트보드가 판독된다.
 */
export function parseFileDimensions(head: string, tail?: string): FileDimensions {
  const scanners = scannersFor(head)
  for (const scan of scanners) {
    const r = scan(head)
    if (r) return r
  }
  if (tail) {
    // %%BoundingBox: (atend)(실값이 %%Trailer 뒤) 또는 뒤쪽 페이지 오브젝트의 MediaBox
    for (const scan of scanners) {
      const r = scan(tail)
      if (r) return r
    }
  }
  return { w_cm: null, h_cm: null, source: 'none' }
}
