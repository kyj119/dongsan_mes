/**
 * 재단 패널 — 오프셋/컨투어 실측 재현 하네스 (spec §4·§7)
 *
 *   node scripts/cut/bench.mjs           # 전체
 *   node scripts/cut/bench.mjs --res     # 해상도 벤치만(무겁다)
 *
 * spec 에 적힌 수치는 전부 이 스크립트가 뽑은 것이다. 엔진을 고치면 여기부터 돌린다.
 * 판정 실패 시 exit 1 — 오프셋 코드 수정의 선행 게이트.
 */
import {
  traceAll, traceOuter, simplify, polyArea, polyBBox, findHoles, assignHoles,
  offsetMask, insetMask, distanceOutside, sampleEvenly, pickResolution,
  fitCurves, snapResolution, downsampleMask, fillHoles,
} from './geometry.mjs'

const W = 900, H = 900, cx = W / 2, cy = H / 2
const mk = fn => { const m = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fn(x, y)) m[y * W + x] = 1; return m }
const inkPx = m => { let n = 0; for (let i = 0; i < m.length; i++) n += m[i]; return n }
const fails = []
const ok = (cond, rule, msg) => { if (!cond) fails.push(`[${rule}] ${msg}`) }

// ── ① 컨투어 정확도 — 원형·곡선·오목이 1% 미만인가 ────────────────
const SHAPES = {
  '원형 r=380': mk((x, y) => Math.hypot(x - cx, y - cy) <= 380),
  '타원 380x200': mk((x, y) => ((x - cx) / 380) ** 2 + ((y - cy) / 200) ** 2 <= 1),
  '별 5각': mk((x, y) => {
    const dx = x - cx, dy = y - cy, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy)
    const k = 5, inner = 160, outer = 390
    const t = ((a + Math.PI) % (2 * Math.PI / k)) / (2 * Math.PI / k)
    return d <= inner + (outer - inner) * (1 - Math.abs(t - 0.5) * 2)
  }),
  '초승달(오목)': mk((x, y) => Math.hypot(x - cx, y - cy) <= 380 && Math.hypot(x - cx + 210, y - cy) > 310),
  'L자': mk((x, y) => (x > 150 && x < 750 && y > 520 && y < 750) || (x > 150 && x < 380 && y > 150 && y < 750)),
}
console.log('── ① 컨투어 정확도 (tol=1) ──')
const c1 = []
for (const [name, m] of Object.entries(SHAPES)) {
  const t0 = process.hrtime.bigint()
  const all = traceAll(m, W, H)
  const t1 = process.hrtime.bigint()
  const s = simplify(all[0].poly, 1)
  const err = 100 * Math.abs(polyArea(s) - inkPx(m)) / inkPx(m)
  c1.push({ 도형: name, 원곽점: all[0].poly.length, '단순화': s.length, '면적오차%': +err.toFixed(2), 섬: all.length, ms: +(Number(t1 - t0) / 1e6).toFixed(0) })
  ok(err < 1.5, 'C1', `${name} 면적오차 ${err.toFixed(2)}% (기대 <1.5%)`)
}
console.table(c1)

// ── ② ★다중 섬 전수 보존 — 조각 유실 = 잘림 (spec §7 ⓓ) ──────────
console.log('── ② 다중 섬 보존 (최대성분만 추적하면 유실된다) ──')
const islands = mk((x, y) => Math.hypot(x - 250, y - cy) <= 160 || Math.hypot(x - 650, y - cy) <= 160)
const allIsl = traceAll(islands, W, H)
const oneIsl = traceOuter(islands, W, H)
const areaAll = allIsl.reduce((s, c) => s + polyArea(simplify(c.poly, 1)), 0)
const areaOne = polyArea(simplify(oneIsl.poly, 1))
const errAll = 100 * Math.abs(areaAll - inkPx(islands)) / inkPx(islands)
const errOne = 100 * Math.abs(areaOne - inkPx(islands)) / inkPx(islands)
console.log(`  traceAll  → 폴리곤 ${allIsl.length}개 · 면적오차 ${errAll.toFixed(1)}%`)
console.log(`  traceOuter→ 폴리곤 1개  · 면적오차 ${errOne.toFixed(1)}%  ← 이만큼이 잘려나간다`)
ok(allIsl.length === 2, 'C2', `분리 2섬인데 traceAll 이 ${allIsl.length}개 반환`)
ok(errAll < 2, 'C2', `traceAll 면적오차 ${errAll.toFixed(1)}% (기대 <2%)`)

// ── ②b ★구멍(내부 홀) — 없으면 ㅇ·ㅁ·0·8 속이 안 뚫린다 (spec §4.6) ──────
console.log('── ②b 구멍 추출 ──')
{
  const HOLE_CASES = {
    '도넛': mk((x, y) => { const d = Math.hypot(x - cx, y - cy); return d <= 380 && d >= 180 }),
    '액자(사각+사각구멍)': mk((x, y) => (Math.abs(x - cx) <= 350 && Math.abs(y - cy) <= 350) && !(Math.abs(x - cx) <= 150 && Math.abs(y - cy) <= 150)),
    'ㅇ자': mk((x, y) => { const dx = (x - cx) / 230, dy = (y - cy) / 320, r = dx * dx + dy * dy; return r <= 1 && r >= 0.35 }),
    '구멍 2개': mk((x, y) => Math.hypot(x - cx, y - cy) <= 380 && Math.hypot(x - 330, y - cy) > 90 && Math.hypot(x - 570, y - cy) > 90),
    '구멍 없음(원)': mk((x, y) => Math.hypot(x - cx, y - cy) <= 380),
  }
  const EXPECT = { '도넛': 1, '액자(사각+사각구멍)': 1, 'ㅇ자': 1, '구멍 2개': 2, '구멍 없음(원)': 0 }
  const rows = []
  for (const [name, m] of Object.entries(HOLE_CASES)) {
    const outers = traceAll(m, W, H)
    const holes = findHoles(m, W, H)
    const aOut = outers.reduce((s, p) => s + polyArea(simplify(p.poly, 1)), 0)
    const aHole = holes.reduce((s, p) => s + polyArea(simplify(p.poly, 1)), 0)
    const net = aOut - aHole, truth = inkPx(m)
    const err = 100 * Math.abs(net - truth) / truth
    rows.push({ 도형: name, 외곽: outers.length, 구멍: holes.length, 기대: EXPECT[name], '순면적오차%': +err.toFixed(2) })
    ok(holes.length === EXPECT[name], 'H1', `${name} 구멍 ${holes.length}개 (기대 ${EXPECT[name]})`)
    ok(err < 1.5, 'H2', `${name} 순면적오차 ${err.toFixed(2)}% (기대 <1.5%)`)
  }
  console.table(rows)

  // 오프셋을 주면 구멍이 그만큼 **작아지고**, 오프셋이 구멍 반지름을 넘으면 사라져야 한다.
  const donut = HOLE_CASES['도넛']   // 구멍 반지름 180
  const shrink = []
  for (const r of [20, 60, 150, 200]) {
    const off = offsetMask(donut, W, H, r)
    const hs = findHoles(off, W, H)
    const rad = hs.length ? Math.round(Math.sqrt(hs[0].px / Math.PI)) : 0
    shrink.push({ offset: r, 구멍: hs.length, '반지름': rad, '기대반지름': Math.max(0, 180 - r) })
    if (r < 180) ok(hs.length === 1 && Math.abs(rad - (180 - r)) <= 3, 'H3', `offset=${r} 구멍 반지름 ${rad} (기대 ${180 - r})`)
    else ok(hs.length === 0, 'H3', `offset=${r} 에서 구멍이 남았다(칼날이 못 들어가는 크기)`)
  }
  console.table(shrink)

  // 구멍이 외곽에 올바로 배정되는가 — compound path 를 만들려면 짝이 맞아야 한다
  const two = mk((x, y) => (Math.hypot(x - 250, y - cy) <= 200 && Math.hypot(x - 250, y - cy) >= 90)
    || (Math.hypot(x - 680, y - cy) <= 200 && Math.hypot(x - 680, y - cy) >= 90))
  const g = assignHoles(traceAll(two, W, H), findHoles(two, W, H))
  ok(g.length === 2 && g.every((x) => x.holes.length === 1), 'H4',
    '도넛 2개 → 각 외곽에 구멍 1개씩: ' + g.map((x) => x.holes.length).join(','))
  console.log('  도넛 2개 배정 → ' + g.map((x, i) => `외곽${i}:구멍${x.holes.length}`).join(' '))
}

// ── ③ 오프셋 커버리지 — 기본 도형을 따로 그릴 필요가 없는가 (spec §4.2) ──
console.log('── ③ 오프셋 커버리지 (R=30px) ──')
const R = 30
const OFF = {
  '정사각 400': mk((x, y) => Math.abs(x - cx) <= 200 && Math.abs(y - cy) <= 200),
  '원 r=200': mk((x, y) => Math.hypot(x - cx, y - cy) <= 200),
  '타원 250x120': mk((x, y) => ((x - cx) / 250) ** 2 + ((y - cy) / 120) ** 2 <= 1),
  'L자(오목)': SHAPES['L자'],
}
const c3 = []
for (const [name, m] of Object.entries(OFF)) {
  const b0 = polyBBox(traceAll(m, W, H)[0].poly)
  const t0 = process.hrtime.bigint()
  const off = offsetMask(m, W, H, R)
  const t1 = process.hrtime.bigint()
  const b1 = polyBBox(traceAll(off, W, H)[0].poly)
  const grow = (b1.w - b0.w) / 2
  c3.push({ 도형: name, '원본bbox': `${b0.w}×${b0.h}`, '오프셋bbox': `${b1.w}×${b1.h}`, '팽창량': +grow.toFixed(1), '기대': R, ms: +(Number(t1 - t0) / 1e6).toFixed(0) })
  ok(Math.abs(grow - R) <= 1, 'O1', `${name} 팽창량 ${grow.toFixed(1)} ≠ ${R}`)
}
console.table(c3)

// 사각형 + 오프셋 = 라운드사각. 코너 대각 여백 이론값 = R(√2−1)
{
  const sq = OFF['정사각 400']
  const off = offsetMask(sq, W, H, R)
  const bb = polyBBox(traceAll(off, W, H)[0].poly)
  let t = 0
  while (t < 400 && !off[(Math.round(bb.T) + t) * W + (Math.round(bb.L) + t)]) t++
  const diag = t * Math.SQRT2, theory = R * (Math.SQRT2 - 1)
  console.log(`  사각형+오프셋 = 라운드사각 · 코너 대각여백 실측 ${diag.toFixed(1)} ↔ 이론 ${theory.toFixed(1)}`)
  ok(Math.abs(diag - theory) <= 2, 'O2', `코너 반지름 실측 ${diag.toFixed(1)} ↔ 이론 ${theory.toFixed(1)}`)
}

// ── ④ 섬 병합 임계 = gap/2 — 글자가 흩어지지 않는 오프셋 (spec §4.2) ──
console.log('── ④ 섬 병합 임계 (간격 60px) ──')
const gapM = mk((x, y) => (Math.abs(x - (cx - 130)) <= 100 && Math.abs(y - cy) <= 100) || (Math.abs(x - (cx + 130)) <= 100 && Math.abs(y - cy) <= 100))
for (const r of [29, 30]) {
  const n = traceAll(offsetMask(gapM, W, H, r), W, H).length
  console.log(`  offset=${r}px → 섬 ${n}개${n === 1 ? ' (병합)' : ''}`)
  ok(r === 29 ? n === 2 : n === 1, 'O3', `offset=${r} 에서 섬 ${n}개 (병합 임계는 gap/2=30 이어야 함)`)
}

// ── ⑤ 타공 = 인셋 경로 등간격 (spec §4.4) ─────────────────────────
console.log('── ⑤ 타공 배치 (인셋 30px · 8점) ──')
{
  const sq = OFF['정사각 400']
  const path = traceAll(insetMask(sq, W, H, 30), W, H)[0].poly
  const pts = sampleEvenly(path, 8)
  console.log('  ' + pts.map(p => `(${p[0]},${p[1]})`).join(' '))
  ok(pts.length === 8, 'P1', `타공 후보 ${pts.length}점 (기대 8)`)
}

// ── ⑦ 간격 보장 = 해상도 스냅 (spec §6.20) ────────────────────────
// `offsetMask` 는 `dist <= r` 라 **r 의 소수부가 버려진다**. gap/2 가 픽셀 정수배가 아니면
// 요청보다 좁게 나가고, 조용히 틀리므로 재단해 보기 전에는 알 수 없다.
//   보장 간격 = 2 × (실제 팽창 px) × mmPerPx
console.log('\n── ⑦ 간격 보장 (해상도 스냅) ──')
{
  // 실제 축방향 팽창량을 잰다 — 이론값이 아니라 엔진이 실제로 넓히는 픽셀 수
  const grow = (rPx) => {
    const w = 60, h = 9, m = new Uint8Array(w * h)
    for (let y = 3; y < 6; y++) for (let x = 20; x < 30; x++) m[y * w + x] = 1
    const g = offsetMask(m, w, h, rPx)
    for (let x = 0; x < w; x++) if (g[4 * w + x]) return 20 - x
    return 0
  }
  ok(grow(1.5) === 1, 'R7', `소수 반경 1.5px 의 실팽창이 ${grow(1.5)}px — 1px 이어야 이 게이트의 전제가 성립한다`)
  // 스냅 없이 쓰던 값(1370 롤 = 1mm/px) 에서 3mm·5mm 가 실제로 부족했는지 = 회귀의 근거
  ok(2 * grow(1.5) * 1.0 < 3, 'R7', '스냅 전 3mm@1mm/px 이 부족하지 않다 — 전제 확인 실패')

  for (const [gapMm, baseMmpp, wMm, hMm] of [
    [3, 1.0, 1370, 3000], [5, 1.0, 1370, 3000], [3, 1.0, 1520, 3000],
    [3, 0.5, 900, 1800], [4, 1.0, 1370, 3000], [10, 1.0, 1370, 3000], [2, 0.5, 914, 3000],
  ]) {
    const s = snapResolution(baseMmpp, gapMm, wMm, hMm)
    const g = grow(s.rPx)
    const guaranteed = 2 * g * s.mmPerPx
    const px = Math.ceil(wMm / s.mmPerPx) * Math.ceil((hMm || 6000) / s.mmPerPx)
    console.log(`  gap ${String(gapMm).padStart(3)}mm @${baseMmpp} (${wMm}×${hMm}) → ${s.mmPerPx.toFixed(3)}mm/px · r=${s.rPx}px · 보장 ${guaranteed.toFixed(2)}mm · ${(px / 1e6).toFixed(1)}M px`)
    ok(s.rPx === g, 'R7', `요청 반경 ${s.rPx}px 인데 실팽창 ${g}px — 스냅이 정수 반경을 못 만들었다`)
    ok(guaranteed >= gapMm - 1e-9, 'R7', `gap ${gapMm}mm @${baseMmpp} → 실보장 ${guaranteed.toFixed(2)}mm (부족)`)
    ok(px <= 12e6, 'R7', `gap ${gapMm}mm @${baseMmpp} → ${(px / 1e6).toFixed(1)}M px (상한 12M 초과)`)
  }
}

// ── ⑧ 곡선 피팅 (spec §6.21) ──────────────────────────────────────
// 판정 = ⓐ면적오차 <1% ⓑ정점 수 감소 ⓒ세그먼트가 끊기지 않음 ⓓ**진짜 코너 보존**
console.log('\n── ⑧ 곡선 피팅 (베지어) ──')
{
  const flat = (segs, per = 24) => {
    const o = []
    for (const s of segs) for (let i = 0; i < per; i++) {
      const t = i / per, mt = 1 - t
      const b = [mt * mt * mt, 3 * mt * mt * t, 3 * mt * t * t, t * t * t]
      o.push([b[0] * s[0][0] + b[1] * s[1][0] + b[2] * s[2][0] + b[3] * s[3][0],
      b[0] * s[0][1] + b[1] * s[1][1] + b[2] * s[2][1] + b[3] * s[3][1]])
    }
    return o
  }
  const gap = (segs) => {
    let w = 0
    for (let i = 0; i < segs.length; i++) {
      const a = segs[i][3], b = segs[(i + 1) % segs.length][0]
      w = Math.max(w, Math.hypot(a[0] - b[0], a[1] - b[1]))
    }
    return w
  }
  const corners = (segs, deg = 40) => {
    let n = 0
    for (let i = 0; i < segs.length; i++) {
      const a = segs[i], b = segs[(i + 1) % segs.length]
      const t1 = [a[3][0] - a[2][0], a[3][1] - a[2][1]], t2 = [b[1][0] - b[0][0], b[1][1] - b[0][1]]
      const l1 = Math.hypot(t1[0], t1[1]) || 1, l2 = Math.hypot(t2[0], t2[1]) || 1
      if ((t1[0] * t2[0] + t1[1] * t2[1]) / (l1 * l2) < Math.cos(Math.PI * deg / 180)) n++
    }
    return n
  }
  // 기대 코너 수: 원·타원 0, 사각 4, L자 6, 별 10
  const EXPECT = { '원형 r=380': 0, '타원 380x200': 0, 'L자': 6 }
  for (const [name, m] of Object.entries(SHAPES)) {
    const poly = traceAll(m, W, H)[0].poly
    const sp = simplify(poly, 1)
    const segs = fitCurves(poly, 1)
    const aRef = Math.abs(polyArea(poly))
    const err = 100 * Math.abs(Math.abs(polyArea(flat(segs))) - aRef) / aRef
    const nc = corners(segs)
    console.log(`  ${name.padEnd(14)} 폴리라인 ${String(sp.length).padStart(3)}점 → 베지어 ${String(segs.length).padStart(3)}세그 · 면적오차 ${err.toFixed(2)}% · 코너 ${nc} · 이음새 ${gap(segs).toFixed(3)}px`)
    ok(segs.length > 0, 'R8', `${name}: 세그먼트 0개 (칼선이 통째로 사라진다)`)
    ok(err < 1, 'R8', `${name}: 면적오차 ${err.toFixed(2)}% (<1% 이어야 함)`)
    // 폭주 방지 가드 — 형상이 아니라 **픽셀 계단을 쫓으면** 여기서 터진다
    // (실측: 평활화 없이 원본에 맞췄더니 원 r=380 이 61점 → 134세그. 평활화 후 23세그)
    ok(segs.length <= sp.length * 2 + 4, 'R8',
      `${name}: 베지어 ${segs.length}세그 (폴리라인 ${sp.length}점 대비 폭주) — 계단 잡음을 쫓고 있다`)
    ok(gap(segs) < 0.01, 'R8', `${name}: 세그먼트가 ${gap(segs).toFixed(3)}px 끊겼다 (닫힌 경로여야 재단된다)`)
    if (EXPECT[name] !== undefined) {
      ok(nc === EXPECT[name], 'R8', `${name}: 코너 ${nc}개 (기대 ${EXPECT[name]}) — 곡선이 코너를 먹거나 곡선부를 쪼갰다`)
    }
  }
  // 사각형은 **네 코너가 전부 남아야** 한다 — 곡선화가 재단 형상을 바꾸면 안 된다
  const sq = mk((x, y) => x > 250 && x < 650 && y > 250 && y < 650)
  const sqSegs = fitCurves(traceAll(sq, W, H)[0].poly, 1)
  ok(corners(sqSegs) === 4, 'R8', `정사각 코너 ${corners(sqSegs)}개 (기대 4) — 직각이 둥글어졌다`)
  console.log(`  정사각 400     베지어 ${sqSegs.length}세그 · 코너 ${corners(sqSegs)}`)

  // ── ★점별 편차 — 면적오차만으로는 못 잡는다 ──────────────────────
  // 실측(2026-07-31): 글자 배너 310×65mm 의 재단선이 **6.21mm 부풀었는데**
  // 원인은 "긴 직선 변에 내부 표본이 없어" 최소제곱이 구속되지 않은 것이었다.
  // 면적오차는 6.05% 라 그나마 걸렸지만, **부풀고 꺼진 게 상쇄되면 면적은 멀쩡해 보인다.**
  // → 곡선 위 점이 원본 컨투어에서 얼마나 떨어지는지를 직접 잰다.
  const d2seg = (p, a, b) => {
    const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy
    let t = L2 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2 : 0
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy))
  }
  const maxDev = (segs, poly) => {
    let worst = 0
    for (const p of flat(segs, 16)) {
      let best = Infinity
      for (let i = 0; i < poly.length; i++) {
        const d = d2seg(p, poly[i], poly[(i + 1) % poly.length])
        if (d < best) best = d
        if (best === 0) break
      }
      if (best > worst) worst = best
    }
    return worst
  }
  // ★라운드사각 = **긴 직선 + 둥근 코너**. 코너 검출이 안 걸리는(=한 바퀴 통째로 피팅되는)
  //   형태라 이번 결함이 정확히 여기서 났다. bbox 모드 산출물이 바로 이 모양이다.
  const rr = (rad) => mk((x, y) => {
    const L = 120, R = 780, T = 330, B = 570
    if (x < L || x > R || y < T || y > B) return false
    const cx = Math.min(Math.max(x, L + rad), R - rad), cy = Math.min(Math.max(y, T + rad), B - rad)
    return Math.hypot(x - cx, y - cy) <= rad
  })
  const DEV_CASES = [
    ['라운드사각 r=40', rr(40)],
    ['라운드사각 r=110', rr(110)],
    ['원형 r=380', SHAPES['원형 r=380']],
    ['L자', SHAPES['L자']],
    ['별 5각', SHAPES['별 5각']],
  ]
  for (const [name, m] of DEV_CASES) {
    const poly = traceAll(m, W, H)[0].poly
    const segs = fitCurves(poly, 1)
    const dev = maxDev(segs, poly)
    const chord = Math.max(...segs.map((s) => Math.hypot(s[3][0] - s[0][0], s[3][1] - s[0][1])))
    console.log(`  ${name.padEnd(14)} 베지어 ${String(segs.length).padStart(3)}세그 · 최대편차 ${dev.toFixed(2)}px · 최장코드 ${chord.toFixed(0)}px`)
    // tol=1px 로 맞췄으니 픽셀 계단(±0.5px)을 감안해도 2px 를 넘으면 안 된다
    ok(dev <= 2, 'R8', `${name}: 곡선이 원본에서 ${dev.toFixed(2)}px 벗어났다 (한계 2px) — 부풀거나 꺼진 것`)
  }

  // ★★직선↔호 전환에서 **바깥으로 튀지 않는가** (2026-08-07 실사용).
  //   코너 판정은 꺾임 각도만 본다. 직선↔호는 접선이 연속(0°)이라 코너로 안 잡혀,
  //   하나의 베지어가 직선 끝과 호 시작을 함께 근사하며 바깥으로 부푼다 —
  //   화면에서는 **직선이 호로 넘어가는 자리에 갈고리처럼 튀어나온 모양**이 된다.
  //   실측(500×350 라운드 사각, 조각 10장 전부): 윗변 앵커는 전부 y=980 인데 패스 bbox 상단이 980.16.
  //   편차 평균으로는 안 잡힌다 — **bbox 초과**로 재야 잡힌다.
  console.log('\n  직선↔호 전환 (bbox 초과 = 튐)')
  for (const [name, m] of [['라운드사각 r=40', rr(40)], ['라운드사각 r=110', rr(110)], ['정사각 400', mk((x, y) => x > 250 && x < 650 && y > 250 && y < 650)]]) {
    const poly = traceAll(m, W, H)[0].poly
    const segs = fitCurves(poly, 1)
    let pl = Infinity, pt = Infinity, pr = -Infinity, pb = -Infinity
    for (const p of poly) {
      if (p[0] < pl) pl = p[0]; if (p[0] > pr) pr = p[0]
      if (p[1] < pt) pt = p[1]; if (p[1] > pb) pb = p[1]
    }
    // 베지어 껍질(앵커+제어점)의 극값 — 곡선은 껍질 밖으로 못 나가므로 이게 상한이다
    let bl = Infinity, bt = Infinity, br = -Infinity, bb = -Infinity
    for (const s of segs) for (const p of s) {
      if (p[0] < bl) bl = p[0]; if (p[0] > br) br = p[0]
      if (p[1] < bt) bt = p[1]; if (p[1] > bb) bb = p[1]
    }
    const over = Math.max(pl - bl, pt - bt, br - pr, bb - pb)
    console.log(`  ${name.padEnd(14)} bbox 초과 ${over.toFixed(2)}px`)
    ok(over <= 1.5, 'R8', `${name}: 곡선이 원본 bbox 밖으로 ${over.toFixed(2)}px 튀어나왔다 (한계 1.5px)`)
  }
}

// ── ⑨ 마스크 축소 = 경계 정확도 (spec §6.23) ───────────────────────
// 일러 PNG 는 **해상도가 거칠수록 경계가 크게 번진다**(100×60mm 사각 실측: 0.75mm/px 에서
// 102.00×60.75mm = 최대오차 1.5mm). 미세 격자로 굽어 배치 격자로 줄이면 오차가 격자 하나로 제한된다.
console.log('\n── ⑨ 마스크 축소(경계 정확도) ──')
{
  // 격자에 안 맞는 위치·크기의 사각을 미세 격자에 그린 뒤 3배로 줄인다
  const FINE = 3
  const cw = 240, ch = 180
  const fw = cw * FINE, fh = ch * FINE
  // 참값: 미세 픽셀 기준 [37.4, 25.6] ~ [187.4, 121.6] → 거친 격자로는 소수 자리에 걸친다
  const L0 = 37.4 * FINE, T0 = 25.6 * FINE, R0 = 187.4 * FINE, B0 = 121.6 * FINE
  const fine = new Uint8Array(fw * fh)
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    if (x + 0.5 >= L0 && x + 0.5 <= R0 && y + 0.5 >= T0 && y + 0.5 <= B0) fine[y * fw + x] = 1
  }
  const bboxOf = (m, W, H) => {
    let l = W, t = H, r = -1, b = -1
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y }
    return { l, t, r, b }
  }
  const trueW = (R0 - L0) / FINE, trueH = (B0 - T0) / FINE
  const ds = downsampleMask(fine, fw, fh, FINE, 0.5)
  const bb = bboxOf(ds.m, ds.W, ds.H)
  const gotW = bb.r - bb.l + 1, gotH = bb.b - bb.t + 1
  console.log(`  참 ${trueW.toFixed(2)}×${trueH.toFixed(2)} → 축소 후 ${gotW}×${gotH} (거친 px)`)
  ok(Math.abs(gotW - trueW) <= 1 && Math.abs(gotH - trueH) <= 1, 'R9',
    `축소 오차 ${Math.abs(gotW - trueW).toFixed(2)}×${Math.abs(gotH - trueH).toFixed(2)}px (한계 1px)`)
  // f=1 은 무손실이어야 한다 — 단품 경로가 이 분기를 탄다
  const same = downsampleMask(fine, fw, fh, 1, 0.5)
  ok(same.W === fw && same.H === fh && same.m === fine, 'R9', 'f=1 인데 마스크가 바뀌었다')
  // 피복률이 낮을수록 바깥으로 커져야 한다(안전 방향 조절이 실제로 먹는가)
  const wide = downsampleMask(fine, fw, fh, FINE, 0.2)
  const bw = bboxOf(wide.m, wide.W, wide.H)
  ok((bw.r - bw.l) >= (bb.r - bb.l), 'R9', '피복률을 낮췄는데 마스크가 커지지 않았다')
  console.log(`  피복 0.5 → ${gotW}px · 피복 0.2 → ${bw.r - bw.l + 1}px (낮출수록 바깥)`)
}

// ── ⑥ 해상도 벤치 (--res) ─────────────────────────────────────────
if (process.argv.includes('--res')) {
  console.log('── ⑥ 해상도 비용 (spec §4.3) ──')
  for (const [name, wMm, hMm] of [['시트컷 79×14cm', 790, 140], ['CNC 판 122×207cm', 1220, 2070]]) {
    for (const mmPerPx of [1.0, 0.5, 0.25]) {
      const w = Math.ceil(wMm / mmPerPx), h = Math.ceil(hMm / mmPerPx)
      if (w * h > 45e6) { console.log(`  ${name} ${mmPerPx}mm/px → ${(w * h / 1e6).toFixed(1)}M px (측정 생략)`); continue }
      const m = new Uint8Array(w * h)
      for (let y = h >> 2; y < (h * 3 >> 2); y++) for (let x = w >> 2; x < (w * 3 >> 2); x++) m[y * w + x] = 1
      const t0 = process.hrtime.bigint(); distanceOutside(m, w, h); const t1 = process.hrtime.bigint()
      console.log(`  ${name} ${mmPerPx}mm/px → ${w}×${h} = ${(w * h / 1e6).toFixed(1)}M px · EDT ${(Number(t1 - t0) / 1e6).toFixed(0)}ms`)
    }
  }
  const pick = pickResolution(1220, 2070)
  console.log(`  자동 선택(판 122×207cm) → ${pick.mmPerPx}mm/px · ${pick.W}×${pick.H} · ${(pick.px / 1e6).toFixed(1)}M px`)
}

// ── ⑧ 속 메우기 — "테두리 사각 + 안쪽 글자" 를 한 덩어리로 만드는가 ──
// 실물 sample1.ai 가 이 모양이다. 안 메우면 조각 bbox 채움 14.4% → 네스터가 테두리 안쪽에
// 다른 조각을 밀어 넣고, mainPart 가 글자를 본체로 골라 맞붙임이 거절되고, 칼선이 10줄 나온다.
{
  const BW = 300, BH = 120
  const mkB = fn => { const m = new Uint8Array(BW * BH); for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) if (fn(x, y)) m[y * BW + x] = 1; return m }
  const cnt = m => { let n = 0; for (let i = 0; i < m.length; i++) n += m[i]; return n }
  const comps = m => { const c = []; const seen = new Uint8Array(BW * BH)
    for (let i = 0; i < BW * BH; i++) { if (!m[i] || seen[i]) continue
      let n = 0; const st = [i]; seen[i] = 1
      while (st.length) { const j = st.pop(); n++
        const x = j % BW, y = (j / BW) | 0
        const nb = [x > 0 ? j - 1 : -1, x < BW - 1 ? j + 1 : -1, y > 0 ? j - BW : -1, y < BH - 1 ? j + BW : -1]
        for (const k of nb) if (k >= 0 && m[k] && !seen[k]) { seen[k] = 1; st.push(k) } }
      c.push(n) }
    return c }

  // 테두리 링(두께 2) + 안쪽에 떨어진 글자 3개
  const border = (x, y) => (x >= 2 && x < BW - 2 && y >= 2 && y < BH - 2)
    && (x < 4 || x >= BW - 4 || y < 4 || y >= BH - 4)
  const letters = (x, y) => {
    for (let k = 0; k < 3; k++) { const lx = 40 + k * 80
      if (x >= lx && x < lx + 50 && y >= 40 && y < 80) return true }
    return false
  }
  const piece = mkB((x, y) => border(x, y) || letters(x, y))
  const before = { ink: cnt(piece), comps: comps(piece).length }
  const filled = fillHoles(piece, BW, BH)
  const after = { ink: cnt(filled), comps: comps(filled).length }
  const bboxArea = (BW - 4) * (BH - 4)
  console.log('\n⑧ 속 메우기 (테두리 + 안쪽 글자)')
  console.log(`  전: 잉크 ${before.ink} · 덩어리 ${before.comps}개 · 채움 ${(before.ink / bboxArea * 100).toFixed(1)}%`)
  console.log(`  후: 잉크 ${after.ink} · 덩어리 ${after.comps}개 · 채움 ${(after.ink / bboxArea * 100).toFixed(1)}%`)
  ok(before.comps === 4, '속메우기', `전 덩어리 4개(테두리+글자3) 기대, 실제 ${before.comps}`)
  ok(after.comps === 1, '속메우기', `후 덩어리는 1개여야 한다(그룹 하나=칼선 하나), 실제 ${after.comps}`)
  ok(after.ink / bboxArea > 0.97, '속메우기', `후 채움 97% 초과 기대(맞붙임 98% 게이트), 실제 ${(after.ink / bboxArea * 100).toFixed(1)}%`)
  ok(cnt(piece) === before.ink, '속메우기', '원본 마스크를 바꾸면 안 된다(효율%가 팽창 전 잉크를 센다)')

  // 칼선 수 — 메우기 전후
  const cpsBefore = traceAll(piece, BW, BH, 16)
  const holesBefore = findHoles(piece, BW, BH, 16)
  const cpsAfter = traceAll(filled, BW, BH, 16)
  const holesAfter = findHoles(filled, BW, BH, 16)
  console.log(`  칼선: 전 외곽 ${cpsBefore.length} + 구멍 ${holesBefore.length} = ${cpsBefore.length + holesBefore.length}줄 → 후 ${cpsAfter.length + holesAfter.length}줄`)
  ok(cpsAfter.length === 1 && holesAfter.length === 0, '속메우기', `후 칼선은 1줄이어야 한다, 실제 외곽 ${cpsAfter.length} 구멍 ${holesAfter.length}`)
  ok(cpsBefore.length + holesBefore.length > 1, '속메우기', '전에는 여러 줄이어야 이 케이스가 의미가 있다')

  // 구멍이 없는 도형은 그대로여야 한다(불필요한 변형 금지)
  const solid = mkB((x, y) => x >= 10 && x < 200 && y >= 10 && y < 100)
  const solidFilled = fillHoles(solid, BW, BH)
  ok(cnt(solid) === cnt(solidFilled), '속메우기', '구멍 없는 도형은 변하지 않아야 한다')

  // 오목(바깥으로 열린 홈)은 메우면 안 된다 — 구멍이 아니다
  const cShape = mkB((x, y) => (x >= 10 && x < 200 && y >= 10 && y < 100) && !(x >= 100 && y >= 40 && y < 70))
  const cFilled = fillHoles(cShape, BW, BH)
  ok(cnt(cShape) === cnt(cFilled), '속메우기', 'ㄷ자 홈은 바깥과 통하므로 메우면 안 된다')
}

// ── 판정 ──────────────────────────────────────────────────────────
console.log('\n── 판정 ──')
if (fails.length) {
  fails.forEach(f => console.log('  ❌ ' + f))
  console.log(`\n결과: 실패 ${fails.length}건`)
  process.exit(1)
}
console.log('  ✅ 전 항목 통과 (컨투어 정확도·다중 섬 보존·구멍 추출·오프셋 팽창량·병합 임계·타공 배치·속 메우기)')
