/**
 * 재단 파일 구조 조사 — `.ai` / `.eps` / `.dxf` 를 일러 없이 해부한다 (spec §2.2·§2.3)
 *
 *   node scripts/cut/probe-cut-file.mjs "Z:/★시트 CUT★/완료/푸른.ai"
 *   node scripts/cut/probe-cut-file.mjs "Z:/★UV솔벤★/.../유구 수국축제04(110x12-1장).dxf"
 *
 * 왜: 외부에서 들어오는 재단 파일의 규격(레이어·스펙컬러·엔티티·단위)을 확정하려면
 *     일러를 열지 않고도 볼 수 있어야 한다. spec §2 의 수치가 전부 이 도구의 산출물이다.
 */
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const CUT_KEYWORDS = [
  'CutContour', 'Cut Contour', 'Thru-cut', 'ThruCut', 'Kiss Cut', 'KissCut',
  'Crease', 'Perf', 'RegMark', 'Regmark', 'cutline', 'CutLine',
  '재단', '재단선', '칼선', '컷팅', '반컷', '완컷',
]

// 한글이 CP949 일 수도 UTF-8 일 수도 있다 — DXF 헤더는 ANSI_949 라고 적어 두고도 일러는 UTF-8 로 쓴다.
// 대체문자(U+FFFD)가 없는 쪽을 채택한다.
const decodeKr = (s) => {
  const buf = Buffer.from(s, 'latin1')
  for (const enc of ['utf-8', 'euc-kr']) {
    try {
      const out = new TextDecoder(enc, { fatal: false }).decode(buf)
      if (!out.includes('�')) return out
    } catch { /* 다음 인코딩 */ }
  }
  return s
}

// ── PDF/EPS ────────────────────────────────────────────────────────
function inflateStreams(buf, limit = 60) {
  const txt = buf.toString('latin1')
  const out = []
  const re = /stream\r?\n/g
  let m, n = 0
  while ((m = re.exec(txt)) && n < limit) {
    const start = m.index + m[0].length
    const end = txt.indexOf('endstream', start)
    if (end < 0) continue
    const raw = buf.subarray(start, end)
    if (raw[0] !== 0x78) continue
    try { out.push(inflateSync(raw).toString('latin1')); n++ } catch { /* 부분 스트림 무시 */ }
  }
  return out.join('\n')
}

function probePostScript(file, buf) {
  const head = buf.subarray(0, 32).toString('latin1')
  const all = buf.toString('latin1') + '\n' + inflateStreams(buf)
  const spots = new Set()
  let m
  const reSep = /\/Separation\s*\/([^\s/[\]<>()]+)/g
  while ((m = reSep.exec(all))) spots.add(decodeURIComponent(m[1].replace(/#([0-9A-Fa-f]{2})/g, '%$1')))
  const reDsc = /%%DocumentCustomColors:\s*([^\r\n]+)/g
  while ((m = reDsc.exec(all))) spots.add('DSC:' + m[1].trim())
  const layers = new Set()
  const reOcg = /\/Type\s*\/OCG[\s\S]{0,200}?\/Name\s*\(([^)]{1,80})\)/g
  while ((m = reOcg.exec(all))) layers.add(m[1])
  const reAi = /%AI5_BeginLayer[\s\S]{0,400}?\(([^)]{1,80})\)\s*Ln/g
  while ((m = reAi.exec(all))) layers.add(m[1])
  const hits = {}
  for (const k of CUT_KEYWORDS) {
    const n = (all.match(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
    if (n) hits[k] = n
  }
  return {
    file: file.split(/[\\/]/).pop(),
    size_MB: +(buf.length / 1048576).toFixed(2),
    kind: head.startsWith('%PDF') ? 'PDF호환 .ai' : head.startsWith('%!PS') ? 'PostScript/EPS' : 'binary(DOS-EPS?)',
    spot_colors: [...spots].map(decodeKr),
    layers: [...layers].map(decodeKr),
    cut_keyword_hits: hits,
    embedded_raster: /\/Subtype\s*\/Image|%AI9_BeginImage|BeginBinary/.test(all),
  }
}

// ── DXF ────────────────────────────────────────────────────────────
const DXF_UNITS = { 0: '없음', 1: 'inch', 4: 'mm', 5: 'cm', 6: 'm' }

function probeDXF(file, buf) {
  const lines = buf.toString('latin1').replace(/\r/g, '').split('\n')
  // ⚠️ 값에는 .trim() 을 쓰면 안 된다 — latin1 로 읽은 UTF-8 한글의 끝 바이트가 0xA0 이면
  //    JS 의 trim() 이 그것을 NBSP 로 보고 **잘라내** 디코딩이 깨진다('재단선' → 'ì¬ë¨ì').
  //    그룹코드(숫자)만 trim 하고, 값은 앞뒤 스페이스/탭만 벗긴다.
  const val0 = (s) => String(s || '').replace(/^[ \t]+|[ \t]+$/g, '')
  const entities = {}, layers = {}, circles = []
  let insunits = null, acadver = null, inEntities = false
  let cur = null, pend = null, cx = null, cy = null, lay = null
  for (let i = 0; i < lines.length; i++) {
    const code = lines[i].trim(), val = val0(lines[i + 1])
    if (code === '9' && val === '$INSUNITS') insunits = (lines[i + 3] || '').trim()
    if (code === '9' && val === '$ACADVER') acadver = (lines[i + 3] || '').trim()
    if (code === '2' && val === 'ENTITIES') inEntities = true
    if (code === '0' && val === 'ENDSEC') inEntities = false
    if (!inEntities) continue
    if (code === '0') {
      if (cur === 'CIRCLE' && cx !== null && pend !== null) circles.push({ x: +cx, y: +cy, r: +pend, layer: lay })
      cur = val; entities[val] = (entities[val] || 0) + 1
      pend = cx = cy = null; lay = null
    } else if (code === '8') { lay = val; layers[val] = (layers[val] || 0) + 1 }
    else if (code === '10' && cur === 'CIRCLE') cx = val
    else if (code === '20' && cur === 'CIRCLE') cy = val
    else if (code === '40' && cur === 'CIRCLE') pend = val
  }
  const r = {
    file: file.split(/[\\/]/).pop(),
    size_MB: +(buf.length / 1048576).toFixed(2),
    kind: 'DXF ' + (acadver || '?'),
    units: DXF_UNITS[insunits] || insunits,
    entities,
    // 레이어명은 한글일 수 있다 — 헤더가 ANSI_949 라고 적혀 있어도 일러는 UTF-8 로 쓴다(실측).
    layers: Object.fromEntries(Object.entries(layers).map(([k, v]) => [decodeKr(k), v])),
  }
  if (circles.length) {
    const radii = [...new Set(circles.map(c => +c.r.toFixed(2)))]
    r.circles = { count: circles.length, radii_mm: radii, diameters_mm: radii.map(v => +(v * 2).toFixed(1)) }
    // 돔보 판정: 지름 6mm 단일 + A0 규칙(간격 = span/(floor(span/500)+1))과 일치하는가
    if (radii.length === 1 && Math.abs(radii[0] * 2 - 6) < 0.1) {
      const xs = [...new Set(circles.map(c => +c.x.toFixed(1)))].sort((a, b) => a - b)
      const ys = [...new Set(circles.map(c => +c.y.toFixed(1)))].sort((a, b) => a - b)
      const chk = arr => {
        if (arr.length < 3) return null
        const span = arr[arr.length - 1] - arr[0]
        const n = Math.floor(span / 500)
        const expected = span / (n + 1)
        const steps = arr.slice(1).map((v, i) => +(v - arr[i]).toFixed(1))
        // 등간격이어야 돔보다. 재단 패널이 만드는 타공도 지름 6mm 라 **지름만으로는 구분되지 않는다**.
        //   ⚠️ 간격(step)이 아니라 **격자 위치**로 봐야 한다 — 방향마크(DIR_OFFSET 60mm)가 끼면
        //      한 구간이 60 + (expected-60) 으로 쪼개져 step 비교는 오탐이 난다
        //      (실측: 404.7 구간이 60 + 344.7 로 갈렸다).
        const onGrid = (rel) => {
          const k = Math.round(rel / expected)
          return Math.abs(rel - k * expected) < 1.5 || Math.abs(rel - (k * expected + 60)) < 1.5
        }
        const fits = arr.every((v) => onGrid(v - arr[0]))
        return { span: +span.toFixed(1), expected_step: +expected.toFixed(2), actual_steps: steps, fits_dombo_rule: fits }
      }
      const cx = chk(xs), cy = chk(ys)
      const fits = [cx, cy].filter(Boolean).every(c => c.fits_dombo_rule)
      r.dombo_check = {
        verdict: fits
          ? '돔보로 판정 — 지름 6mm + 간격이 A0 규칙(MAX_GAP 500mm)과 일치'
          : '⚠ 지름 6mm 이나 **간격이 A0 현재 규칙(MAX_GAP 500mm)과 불일치** — ⓐ다른 간격 규칙으로 생성됐거나(실측: 어떤 판은 400mm 로 나뉘어 있다) ⓑ돔보가 아니라 타공일 수 있다',
        x: cx, y: cy,
        note: 'expected_step = span/(floor(span/500)+1) — mes-a0-host.jsx:566 의 interDombo 공식. 60mm 는 방향마크(DIR_OFFSET)',
      }
    }
  }
  return r
}

// ── main ───────────────────────────────────────────────────────────
const files = process.argv.slice(2)
if (!files.length) {
  console.log('사용법: node scripts/cut/probe-cut-file.mjs <파일...>   (.ai/.eps/.dxf)')
  process.exit(0)
}
for (const f of files) {
  try {
    const buf = readFileSync(f)
    const isDxf = /\.dxf$/i.test(f) || buf.subarray(0, 200).toString('latin1').includes('$ACADVER')
    console.log(JSON.stringify(isDxf ? probeDXF(f, buf) : probePostScript(f, buf), null, 1))
  } catch (e) {
    console.log(JSON.stringify({ file: f, error: String(e.message) }))
  }
}
