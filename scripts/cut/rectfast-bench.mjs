// 사각 빠른 경로 하네스 — 패널이 **실제로 로드하는 파일**(rect-fast.js · bleed.js · butt.js)을 그대로 검증한다.
//   핵심 = 「결과물 불변」의 증명: 띠로 만든 도련이 **전체 PNG 도련과 같은 픽셀**인가.
//   실행 = npm run cut:rectfast   (실패 시 exit 1)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const JS = path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js')
const load = (f) => { const mod = { exports: {} }; new Function('module', 'globalThis', fs.readFileSync(path.join(JS, f), 'utf8'))(mod, {}); return mod.exports }
const RF = load('rect-fast.js')
const BL = load('bleed.js')
const BT = load('butt.js')

let fails = 0
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  PASS  ${name}`)
  else { fails++; console.log(`  FAIL  ${name}   ← ${extra}`) }
}
function make(W, H, fn) {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = fn(x, y); const i = (y * W + x) * 4
    if (c) { data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c[3] === undefined ? 255 : c[3] }
  }
  return { W, H, data }
}
function sub(img, x0, y0, W, H) {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = ((y + y0) * img.W + x + x0) * 4, t = (y * W + x) * 4
    for (let c = 0; c < 4; c++) data[t + c] = img.data[s + c]
  }
  return { W, H, data }
}
/** a 전체가 full 의 (x0,y0) 자리와 같은가 — 다른 픽셀 수 */
function diffAt(a, full, x0, y0) {
  let d = 0
  for (let y = 0; y < a.H; y++) for (let x = 0; x < a.W; x++) {
    const s = (y * a.W + x) * 4, t = ((y + y0) * full.W + x + x0) * 4
    for (let c = 0; c < 4; c++) if (a.data[s + c] !== full.data[t + c]) { d++; break }
  }
  return d
}
let seed = 7
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff

/** 띠 도련 == 전체 도련 (같은 옵션: square · srcInsetPx 0) */
function identity(label, F, gPx, d) {
  const full = BL.repeatLastPixel(F, gPx, { corner: 'square', srcInsetPx: 0 })
  const g = Math.ceil(gPx), W = F.W, H = F.H
  const strips = { t: sub(F, 0, 0, W, d), b: sub(F, 0, H - d, W, d), l: sub(F, 0, 0, d, H), r: sub(F, W - d, 0, d, H) }
  const out = RF.stripBleeds(BL, strips, gPx)
  ok(`${label} — 띠 4장이 만들어진다`, !!out, 'null')
  if (!out) return
  ok(`${label} — 위 띠 크기 (W+2g)×(g+d)`, out.t.W === W + 2 * g && out.t.H === g + d, `${out.t.W}x${out.t.H}`)
  ok(`${label} — 왼 띠 크기 (g+d)×H`, out.l.W === g + d && out.l.H === H, `${out.l.W}x${out.l.H}`)
  const dt = diffAt(out.t, full, 0, 0)
  const db = diffAt(out.b, full, 0, g + H - d)
  const dl = diffAt(out.l, full, 0, g)
  const dr = diffAt(out.r, full, g + W - d, g)
  ok(`${label} — 위·아래·왼·오른 띠가 전체 PNG 와 픽셀 동일`, dt + db + dl + dr === 0, `diff t${dt} b${db} l${dl} r${dr}`)
  // 띠가 덮는 곳 = 전체 도련에서 새로 채워진 픽셀 전부(잉크 밖) — 빠진 도련이 없어야 한다
  let miss = 0
  for (let y = 0; y < full.H; y++) for (let x = 0; x < full.W; x++) {
    const inInk = x >= g && x < g + W && y >= g && y < g + H
    if (inInk || full.data[(y * full.W + x) * 4 + 3] === 0) continue
    const covered = y < g + d || y >= g + H - d || x < g + d || x >= g + W - d
    if (!covered) miss++
  }
  ok(`${label} — 전체 도련의 모든 픽셀이 띠에 들어 있다`, miss === 0, `빠짐 ${miss}`)
}

console.log('\n── 1 ★결과물 불변 — 띠 도련 = 전체 PNG 도련 ──')
identity('무작위 색 37×23 g6 d4', make(37, 23, () => [Math.floor(rnd() * 256), Math.floor(rnd() * 256), Math.floor(rnd() * 256)]), 6, 4)
identity('1px 테두리선(집게 실기) 40×30 g8 d4', make(40, 30, (x, y) => (x === 0 || y === 0 || x === 39 || y === 29) ? [0, 0, 0] : [255, 255, 255]), 8, 4)
identity('소수 도련 5.4px', make(25, 19, (x, y) => [x * 9, y * 13, (x + y) * 5]), 5.4, 4)
identity('띠 깊이 1px', make(20, 20, (x, y) => [x * 12, 0, y * 12]), 3, 1)

console.log('\n── 2 띠 공급원 — 하나라도 투명이면 쓰지 않는다 ──')
{
  const F = make(20, 12, () => [10, 20, 30])
  F.data[(0 * 20 + 5) * 4 + 3] = 200
  const strips = { t: sub(F, 0, 0, 20, 3), b: sub(F, 0, 9, 20, 3), l: sub(F, 0, 0, 3, 12), r: sub(F, 17, 0, 3, 12) }
  ok('반투명 1px → null(종전 경로)', RF.stripBleeds(BL, strips, 4) === null)
  ok('stripsOpaque(불투명) = true', RF.stripsOpaque(make(3, 3, () => [1, 2, 3])))
}

console.log('\n── 3 채움 판정(저해상도) ──')
{
  const m = (W, H, fn) => RF.alphaMask(make(W, H, (x, y) => fn(x, y) ? [0, 0, 0] : null))
  ok('꽉 찬 사각 = ok', RF.strictRect(m(30, 20, (x, y) => x >= 3 && x < 27 && y >= 2 && y < 18)).ok)
  const aa = make(30, 20, (x, y) => (x >= 3 && x < 27 && y >= 2 && y < 18) ? [0, 0, 0, (x === 3 && y % 3 === 0) ? 60 : 255] : null)
  ok('가장자리 AA 반투명은 허용', RF.strictRect(RF.alphaMask(aa)).ok)
  const hole = RF.strictRect(m(30, 20, (x, y) => x >= 3 && x < 27 && y >= 2 && y < 18 && !((x - 15) ** 2 + (y - 10) ** 2 <= 1)))
  ok('지름 2px 구멍 → 거절', !hole.ok && /^fill/.test(hole.why), hole.why)
  const rc = RF.strictRect(m(40, 40, (x, y) => {
    if (!(x >= 0 && x < 40 && y >= 0 && y < 40)) return false
    const cx = x < 6 ? 6 : x > 33 ? 33 : x, cy = y < 6 ? 6 : y > 33 ? 33 : y
    return (x - cx) ** 2 + (y - cy) ** 2 <= 36
  }))
  ok('둥근 모서리(반경 6px) → 거절', !rc.ok, rc.why)
  const stray = RF.strictRect(m(40, 20, (x, y) => (x >= 2 && x < 20 && y >= 2 && y < 18) || (x === 35 && y === 10)))
  ok('떨어진 개체 → 거절', !stray.ok, stray.why)
  const sz = RF.strictRect(m(30, 20, (x, y) => x >= 3 && x < 27 && y >= 2 && y < 18), 30, 16)
  ok('벡터 크기와 어긋남 → 거절', !sz.ok && /^size/.test(sz.why), sz.why)
  ok('벡터 크기와 ±2px 이내 → ok', RF.strictRect(m(30, 20, (x, y) => x >= 3 && x < 27 && y >= 2 && y < 18), 25, 17).ok)
  ok('CHECK_MMPP ≤ 구멍 하한/2(1mm)', RF.CHECK_MMPP <= 1)
}

console.log('\n── 4 합성 마스크 — 굽기와 같은 틀 · 맞붙임 판정과 호환 ──')
{
  const s = RF.syntheticBase(100, 50, 0.5, 7)
  ok('잉크 200×100 + pad 7', s.W === 214 && s.H === 114 && s.inkW === 200, `${s.W}x${s.H}`)
  let n = 0; for (const v of s.m) n += v
  ok('잉크 픽셀 수 = 200×100', n === 20000, String(n))
  ok('butt.isRectish = true (맞붙임이 그대로 켜진다)', !!BT.isRectish({ W: s.W, H: s.H, m: s.m }))
  const bb = BT.inkBBox({ W: s.W, H: s.H, m: s.m })
  ok('butt.inkBBox = 잉크 상자', bb && bb.W === 200 && bb.H === 100 && bb.L === 7, JSON.stringify(bb))
}

console.log('\n── 5 칼선 — 여백에 따른 모양(현행과 같은 모양) ──')
{
  const p0 = RF.cutLine(10, 20, 100, 50, 0)
  ok('여백 0 → 각진 사각 P', p0 === 'P 10.00,20.00 110.00,20.00 110.00,70.00 10.00,70.00', p0)
  const pn = RF.cutLine(10, 20, 100, 50, -2)
  ok('여백 −2 → 안쪽 각진 사각', pn === 'P 12.00,22.00 108.00,22.00 108.00,68.00 12.00,68.00', pn)
  const b = RF.cutLine(10, 20, 100, 50, 3)
  const pts = b.slice(2).split(' ').map((s) => s.split(',').map(Number))
  ok('여백 3 → 베지어 B 25점(앵커 1 + 8세그 × 3)', b[0] === 'B' && pts.length === 25, String(pts.length))
  const anc = [pts[0]]; for (let i = 3; i < pts.length; i += 3) anc.push(pts[i])
  const xs = anc.map((p) => p[0]), ys = anc.map((p) => p[1])
  ok('외곽 = 잉크 + 여백 (7,17)-(113,73)', Math.min(...xs) === 7 && Math.max(...xs) === 113 && Math.min(...ys) === 17 && Math.max(...ys) === 73, `${Math.min(...xs)},${Math.min(...ys)}-${Math.max(...xs)},${Math.max(...ys)}`)
  ok('닫힘 — 끝 앵커 = 시작 앵커', anc[0].join() === anc[anc.length - 1].join())
  // 모서리 호 = 반경 3 원 (오른쪽 위 세그먼트 2: 앵커(110,17) → (113,20), 중심 (110,20))
  const P0 = pts[3], P1 = pts[4], P2 = pts[5], P3 = pts[6]
  let worst = 0
  for (let t = 0; t <= 1.0001; t += 0.125) {
    const u = 1 - t
    const x = u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0]
    const y = u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1]
    worst = Math.max(worst, Math.abs(Math.hypot(x - 110, y - 20) - 3))
  }
  ok('모서리 = 반경 3 원호(오차 < 0.01mm · 래스터 팽창·벡터 jntp=0 과 같은 모양)', worst < 0.01, worst.toFixed(4))
}

console.log('\n── 6 판정 — 사유를 말한다 ──')
{
  const P = (n, bad) => Array.from({ length: n }, (_, i) => ({ rect: !bad.includes(i), why: bad.includes(i) ? 'clip-round' : '' }))
  ok('꺼짐 → off', RF.decide({ enabled: false }).stage === 'off')
  ok('구 호스트 → host', RF.decide({ enabled: true, hostOk: false }).stage === 'host')
  ok('선 도안 → fill', RF.decide({ enabled: true, hostOk: true, fill: true, probe: P(2, []) }).stage === 'fill')
  const v = RF.decide({ enabled: true, hostOk: true, probe: P(3, [1]), check: null })
  ok('벡터 이형 → vector + #2 번호', v.stage === 'vector' && /#2\(clip-round\)/.test(v.why), v.why)
  const c = RF.decide({ enabled: true, hostOk: true, probe: P(2, []), check: [{ ok: true }, { ok: false, why: 'fill:3px' }] })
  ok('채움 실패 → fill-check + #2', !c.on && c.stage === 'fill-check' && /#2\(fill:3px\)/.test(c.why), c.why)
  ok('전부 통과 → on', RF.decide({ enabled: true, hostOk: true, probe: P(2, []), check: [{ ok: true }, { ok: true }] }).on)
}

console.log(fails ? `\n✗ ${fails}건 실패` : '\n✓ 전부 통과')
process.exit(fails ? 1 : 0)
