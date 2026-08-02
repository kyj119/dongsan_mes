/**
 * 실루엣 추출 두 경로 비교 계측 (spec §6.26)
 *
 *   node scripts/cut/vector-vs-raster.mjs <paths.txt> <raster.png> <ox> <oy> <mmpp> [--fill-closed]
 *
 * ⓐ**래스터 경로**(현행) = 일러가 렌더한 PNG → 알파 임계 → 마스크
 * ⓑ**벡터 경로**(후보)   = 호스트가 뽑은 좌표 → 평탄화 → 우리가 채운 마스크
 *
 * 왜 재는가: 실루엣은 파일 안에 이미 정확한 벡터로 있는데, 현행은 그걸 렌더 → 임계 →
 * 픽셀 계단 → 곡선 피팅으로 **복원**한다. 그 왕복이 실제로 손해인지 수치로 가른다.
 *
 * ⚠️ 두 마스크는 **같은 격자·같은 원점**이어야 비교가 성립한다 — ox/oy/mmpp 는
 *    `mesCut_rasterize` 가 돌려준 값을 그대로 넘길 것.
 */
import fs from 'node:fs'
const G = await import('./geometry.mjs')

const [, , pathsFile, pngFile, oxArg, oyArg, mmppArg] = process.argv
const FILL_CLOSED = process.argv.includes('--fill-closed')
if (!pathsFile || !pngFile) {
  console.error('사용: node scripts/cut/vector-vs-raster.mjs <paths.txt> <raster.png> <ox> <oy> <mmpp> [--fill-closed]')
  process.exit(2)
}
const ox = parseFloat(oxArg), oy = parseFloat(oyArg), mmpp = parseFloat(mmppArg)

// ── 좌표 파일 파싱 ─────────────────────────────────────────────────
// I <idx> <filled> <stroked> <strokeMm> <type>
// S <closed> ax,ay,lx,ly,rx,ry ...
const items = []
for (const raw of fs.readFileSync(pathsFile, 'utf8').split(/\r?\n/)) {
  const ln = raw.trim()
  if (!ln) continue
  const t = ln.split(/\s+/)
  if (t[0] === 'I') {
    items.push({ idx: +t[1], filled: t[2] === '1', stroked: t[3] === '1', strokeMm: +t[4] || 0, type: t[5], subs: [] })
  } else if (t[0] === 'S' && items.length) {
    const closed = t[1] === '1'
    const pts = []
    for (let i = 2; i < t.length; i++) {
      const v = t[i].split(',').map(Number)
      if (v.length === 6) pts.push({ a: [v[0], v[1]], l: [v[2], v[3]], r: [v[4], v[5]] })
    }
    if (pts.length) items[items.length - 1].subs.push({ closed, pts })
  }
}
const nSub = items.reduce((s, it) => s + it.subs.length, 0)
const nPt = items.reduce((s, it) => s + it.subs.reduce((q, sb) => q + sb.pts.length, 0), 0)

// ── ⓐ 래스터 마스크 ────────────────────────────────────────────────
const img = G.decodePNG(fs.readFileSync(pngFile))
const W = img.W, H = img.H
const tR0 = process.hrtime.bigint()
const rasterMask = G.inkMask(img, 'alpha', 128)
const tR1 = process.hrtime.bigint()

// ── ⓑ 벡터 마스크 ──────────────────────────────────────────────────
// 평탄화 허용오차 = 격자의 1/4 — 이보다 촘촘히 해도 마스크가 달라지지 않는다
const tol = mmpp / 4
const tV0 = process.hrtime.bigint()
const vecMask = new Uint8Array(W * H)
let strokeMaxMm = 0, filledUnits = 0
for (const it of items) {
  // 한 아이템(compound 포함)의 서브패스는 **한 번에** 넘겨야 even-odd 로 구멍이 뚫린다
  const polys = it.subs.map((sb) => G.flattenSubpath(sb.pts, sb.closed || FILL_CLOSED, tol))
  if (it.filled || FILL_CLOSED) { filledUnits++; G.fillPolygonsInto(vecMask, W, H, polys, mmpp, ox, oy, true) }
  if (it.stroked && it.strokeMm > strokeMaxMm) strokeMaxMm = it.strokeMm
}
const tV1 = process.hrtime.bigint()

// 획(stroke)만 있고 면이 없으면 채울 게 없다 — 선 폭의 절반만큼 팽창시켜야 실루엣이 된다
let vec = vecMask
let strokeNote = ''
if (strokeMaxMm > 0) {
  const r = (strokeMaxMm / 2) / mmpp
  if (r >= 0.5) { vec = G.offsetMask(vecMask, W, H, r); strokeNote = ` (+선폭 ${strokeMaxMm.toFixed(2)}mm 의 절반 팽창)` }
}

// ── 비교 ───────────────────────────────────────────────────────────
const count = (m) => { let n = 0; for (let i = 0; i < m.length; i++) n += m[i]; return n }
const iou = (a, b) => {
  let inter = 0, uni = 0
  for (let i = 0; i < a.length; i++) { const x = a[i], y = b[i]; if (x && y) inter++; if (x || y) uni++ }
  return uni ? inter / uni : 1
}
const comps = (m) => G.components(m, W, H, 1).sizes.filter((s) => s >= 16).length
const contour = (m) => {
  const cs = G.traceAll(m, W, H, 16)
  const sp = cs.map((c) => G.simplify(c.poly, 1))
  const bz = cs.map((c) => G.fitCurves(c.poly, 1))
  return { n: cs.length, pts: sp.reduce((s, p) => s + p.length, 0), segs: bz.reduce((s, p) => s + p.length, 0) }
}

const rN = count(rasterMask), vN = count(vec)
const cR = contour(rasterMask), cV = contour(vec)

const mm2 = (px) => (px * mmpp * mmpp / 100).toFixed(1)
console.log(`격자 ${W}×${H}px @${mmpp}mm/px · 원점 ${ox},${oy}`)
console.log(`좌표 파일: 아이템 ${items.length} · 서브패스 ${nSub} · 앵커 ${nPt}`
  + ` · filled ${items.filter((i) => i.filled).length} · stroked ${items.filter((i) => i.stroked).length}`
  + (FILL_CLOSED ? ' · [--fill-closed] 닫힌 패스를 면으로 간주' : ''))
console.log('')
console.log('구분        잉크%     면적cm²   섬   컨투어점  베지어  ms')
const row = (name, m, n, c, ms) => console.log(
  `${name.padEnd(10)} ${(100 * n / m.length).toFixed(1).padStart(6)}  ${mm2(n).padStart(9)}  ${String(comps(m)).padStart(3)}`
  + `  ${String(c.pts).padStart(8)}  ${String(c.segs).padStart(6)}  ${ms.toFixed(0).padStart(3)}`)
row('ⓐ래스터', rasterMask, rN, cR, Number(tR1 - tR0) / 1e6)
row('ⓑ벡터', vec, vN, cV, Number(tV1 - tV0) / 1e6)
console.log('')
console.log(`IoU(겹침 일치도) ${(100 * iou(rasterMask, vec)).toFixed(2)}%`
  + `  · 잉크 차 ${((vN - rN) / Math.max(rN, 1) * 100).toFixed(1)}%${strokeNote}`)
if (!filledUnits && !FILL_CLOSED) {
  console.log('\n⚠ filled 인 아이템이 0 이다 — **이미 칼선인 파일(면 없는 선)**.')
  console.log('  래스터는 획만 잉크로 보고, 벡터도 채울 면이 없다.')
  console.log('  `--fill-closed` 로 다시 돌려라 — 닫힌 패스를 면으로 간주하면 의도한 실루엣이 나온다.')
}
