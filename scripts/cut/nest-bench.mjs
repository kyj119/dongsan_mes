/**
 * 네스팅 하네스 — `js/nesting.js`(패널 정본)를 직접 검증한다.
 *
 *   node scripts/cut/nest-bench.mjs        (npm run cut:nest)
 *
 * 판정(실패 시 exit 1):
 *   N1 전수배치      — 시트가 충분하면 모든 조각이 배치된다
 *   N2 겹침 0        — 배치된 마스크끼리 픽셀이 겹치지 않는다(= gap 보장)
 *   N3 경계          — 시트 밖으로 나가지 않는다
 *   N4 절감          — true-shape 가 bbox 패킹보다 나쁘지 않다
 *   N5 다중 시트     — 한 장에 안 들어가면 다음 장으로 넘어가고 유실이 없다
 */
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import G from './geometry.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const NEST_PATH = path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js', 'nesting.js')
await import(pathToFileURL(NEST_PATH).href)
const N = globalThis.MesCutNest
if (!N) throw new Error('네스팅 엔진 로드 실패: ' + NEST_PATH)

const fails = []
const ok = (c, rule, msg) => { if (!c) fails.push(`[${rule}] ${msg}`) }

const piece = (id, w, h, fn) => {
  const m = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fn(x, y, w, h)) m[y * w + x] = 1
  return { id, W: w, H: h, m }
}
const tri = (id, w, h) => piece(id, w, h, (x, y) => Math.abs(x - w / 2) <= (w / 2) * (y / h))
const triD = (id, w, h) => piece(id, w, h, (x, y) => Math.abs(x - w / 2) <= (w / 2) * (1 - y / h))
const circ = (id, d) => piece(id, d, d, (x, y) => Math.hypot(x - d / 2, y - d / 2) <= d / 2)
const Lsh = (id, w, h) => piece(id, w, h, (x, y) => (y > h * 0.6) || (x < w * 0.4))
const box = (id, w, h) => piece(id, w, h, () => true)

/** 배치 결과를 시트에 다시 찍어 겹침·경계를 독립 검증한다(엔진 내부 상태를 믿지 않는다) */
function verify(res, pieces, SW, SH, label) {
  const byId = new Map(pieces.map((p) => [p.id, p]))
  let placed = 0
  for (const sh of res.sheets) {
    const canvas = new Uint8Array(SW * (res.roll ? sh.usedH : SH))
    const H = res.roll ? sh.usedH : SH
    for (const pl of sh.placements) {
      placed++
      const src = byId.get(pl.id)
      const rp = N.trim(N.rotate(src, pl.rot))
      ok(rp.W === pl.W && rp.H === pl.H, 'N2', `${label} id=${pl.id} 치수 불일치 ${rp.W}x${rp.H} vs ${pl.W}x${pl.H}`)
      ok(pl.x >= 0 && pl.y >= 0 && pl.x + pl.W <= SW && pl.y + pl.H <= H, 'N3',
        `${label} id=${pl.id} 경계 이탈 (${pl.x},${pl.y}) ${pl.W}x${pl.H} / 시트 ${SW}x${H}`)
      for (let y = 0; y < rp.H; y++) {
        for (let x = 0; x < rp.W; x++) {
          if (!rp.m[y * rp.W + x]) continue
          const idx = (pl.y + y) * SW + (pl.x + x)
          if (idx < 0 || idx >= canvas.length) continue
          if (canvas[idx]) { ok(false, 'N2', `${label} id=${pl.id} 겹침 @(${pl.x + x},${pl.y + y})`); return placed }
          canvas[idx] = 1
        }
      }
    }
  }
  return placed
}

const SW = 600, SH = 900, GAP = 4
/** gap 은 마스크를 gap/2 팽창시켜 처리 — 칼선 엔진의 offsetMask 를 그대로 쓴다 */
const grow = (p) => ({ id: p.id, W: p.W, H: p.H, m: G.offsetMask(p.m, p.W, p.H, GAP / 2) })

// ── ① 삼각형 20개: true-shape vs bbox ────────────────────────────
console.log('── ① true-shape vs bbox (삼각형 20개) ──')
{
  const tris = [], boxes = []
  for (let i = 0; i < 20; i++) {
    const p = i % 2 ? tri('t' + i, 140, 120) : triD('t' + i, 140, 120)
    tris.push(grow(p)); boxes.push(grow(box('t' + i, 140, 120)))
  }
  const t0 = process.hrtime.bigint()
  const rt = N.nest(tris, { sheetW: SW, sheetH: 0, rollMaxH: 3000, step: 4, rotations: [0] })
  const t1 = process.hrtime.bigint()
  const rb = N.nest(boxes, { sheetW: SW, sheetH: 0, rollMaxH: 3000, step: 4, rotations: [0] })
  const pt = verify(rt, tris, SW, 3000, 'true-shape')
  verify(rb, boxes, SW, 3000, 'bbox')
  console.table([
    { 방식: 'bbox', 배치: rb.sheets[0].placements.length + '/20', '사용길이': rb.sheets[0].usedH, '효율%': +(100 * rb.efficiency).toFixed(1) },
    { 방식: 'true-shape', 배치: pt + '/20', '사용길이': rt.sheets[0].usedH, '효율%': +(100 * rt.efficiency).toFixed(1), ms: +(Number(t1 - t0) / 1e6).toFixed(0) },
  ])
  ok(pt === 20, 'N1', `true-shape 배치 ${pt}/20`)
  ok(rt.sheets[0].usedH <= rb.sheets[0].usedH, 'N4',
    `true-shape ${rt.sheets[0].usedH} > bbox ${rb.sheets[0].usedH} — 이형이 사각보다 나쁘면 쓸 이유가 없다`)
  console.log(`  절감 ${(100 * (1 - rt.sheets[0].usedH / rb.sheets[0].usedH)).toFixed(1)}%`)
}

// ── ② 회전 허용 ──────────────────────────────────────────────────
console.log('── ② 회전 허용(0/90/180/270) ──')
{
  const ps = []
  for (let i = 0; i < 12; i++) ps.push(grow(tri('r' + i, 190, 90)))
  const noRot = N.nest(ps, { sheetW: SW, sheetH: 0, rollMaxH: 3000, step: 4, rotations: [0] })
  const t0 = process.hrtime.bigint()
  const withRot = N.nest(ps, { sheetW: SW, sheetH: 0, rollMaxH: 3000, step: 4, rotations: [0, 90, 180, 270] })
  const t1 = process.hrtime.bigint()
  const n1 = verify(noRot, ps, SW, 3000, 'norot')
  const n2 = verify(withRot, ps, SW, 3000, 'rot')
  console.table([
    { 회전: '없음', 배치: n1 + '/12', 사용길이: noRot.sheets[0].usedH },
    { 회전: '0/90/180/270', 배치: n2 + '/12', 사용길이: withRot.sheets[0].usedH, ms: +(Number(t1 - t0) / 1e6).toFixed(0) },
  ])
  ok(n2 === 12, 'N1', `회전 허용 배치 ${n2}/12`)
  ok(withRot.sheets[0].usedH <= noRot.sheets[0].usedH, 'N4',
    `회전 허용이 더 나빠졌다 ${withRot.sheets[0].usedH} > ${noRot.sheets[0].usedH}`)
}

// ── ③ 다중 시트(평판) ────────────────────────────────────────────
console.log('── ③ 다중 시트(평판 600×400) ──')
{
  const ps = []
  for (let i = 0; i < 14; i++) ps.push(grow(circ('c' + i, 150)))
  const res = N.nest(ps, { sheetW: 600, sheetH: 400, step: 4, rotations: [0], maxSheets: 10 })
  const placed = verify(res, ps, 600, 400, 'multi')
  console.log(`  시트 ${res.sheets.length}장 · 배치 ${placed}/14 · 미배치 ${res.unplaced.length} · 효율 ${(100 * res.efficiency).toFixed(1)}%`)
  ok(placed + res.unplaced.length === 14, 'N5', `유실 발생: 배치 ${placed} + 미배치 ${res.unplaced.length} ≠ 14`)
  ok(res.sheets.length >= 2, 'N5', `다중 시트가 안 만들어졌다 (${res.sheets.length}장)`)
  ok(res.unplaced.length === 0, 'N5', `미배치 ${res.unplaced.length}개 — 시트 10장이면 다 들어가야 한다`)
}

// ── ④ 혼합 도형 ──────────────────────────────────────────────────
console.log('── ④ 혼합(삼각·원·L) ──')
{
  const ps = [], bs = []
  for (let i = 0; i < 6; i++) {
    ps.push(grow(tri('m' + i, 150, 130))); bs.push(grow(box('m' + i, 150, 130)))
    ps.push(grow(circ('n' + i, 110))); bs.push(grow(box('n' + i, 110, 110)))
    ps.push(grow(Lsh('o' + i, 130, 130))); bs.push(grow(box('o' + i, 130, 130)))
  }
  const rt = N.nest(ps, { sheetW: SW, sheetH: 0, rollMaxH: 4000, step: 4, rotations: [0, 90] })
  const rb = N.nest(bs, { sheetW: SW, sheetH: 0, rollMaxH: 4000, step: 4, rotations: [0, 90] })
  const p = verify(rt, ps, SW, 4000, 'mixed')
  console.log(`  bbox ${rb.sheets[0].usedH} → true-shape ${rt.sheets[0].usedH} (${(100 * (1 - rt.sheets[0].usedH / rb.sheets[0].usedH)).toFixed(1)}% 절감) · 배치 ${p}/18`)
  ok(p === 18, 'N1', `혼합 배치 ${p}/18`)
}

console.log('\n── 판정 ──')
if (fails.length) {
  fails.forEach((f) => console.log('  ❌ ' + f))
  console.log(`\n결과: 실패 ${fails.length}건`)
  process.exit(1)
}
console.log('  ✅ 전 항목 통과 (전수배치·겹침0·경계·절감·다중시트)')
