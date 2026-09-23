/**
 * 조각 번호 하네스 — `js/piece-number.js`(패널 정본)를 직접 검증한다.
 *
 *   node scripts/cut/number-bench.mjs        (npm run cut:number)
 *
 * 판정(실패 시 exit 1):
 *   M1 줄 판정      — 실측 47조각(fixtures/sheet47.json)이 7줄 [8,6,6,6,7,6,8] · 40% 지그재그도 같은 줄
 *   M2 폴백         — 60% 지그재그·무작위·한 열 세로쌓기는 줄 구조 없음 → 일련 1~N
 *   M3 수동 모드    — row/seq 강제가 자동 판정을 이긴다 · 일련 순서 = 줄 순회
 *   M4 꼬리표 기하  — attachTab 이 붙인 자리와 placedGeom 이 되돌린 자리가 **실제 회전**(nesting.js)과 일치
 *   M5 폭 규칙      — 세워야 들어가는 조각은 꼬리표 두께가 폭에 더해진다(canTab)
 *   M6 배치 비용    — 47조각 롤 1520 에서 꼬리표가 판 수를 늘리지 않고 총 길이 +1% 이내(실측 +0.13%)
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import G from './geometry.mjs'
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const JS = path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js')
await import(pathToFileURL(path.join(JS, 'nesting.js')).href)
await import(pathToFileURL(path.join(JS, 'piece-number.js')).href)
const N = globalThis.MesCutNest, PN = globalThis.MesPieceNumber
if (!N || !PN) throw new Error('엔진 로드 실패: nesting.js / piece-number.js')
const fails = []
const ok = (c, rule, msg) => { if (!c) fails.push(`[${rule}] ${msg}`) }
const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'cut', 'fixtures', 'sheet47.json'), 'utf8')).pieces
const sizes = (r) => PN.rowsOf(r).map((x) => x.items.length).join(',')

// ── M1 줄 판정 ────────────────────────────────────────────────
{
  const a = PN.assign(FIX, 'auto')
  ok(a.mode === 'row' && a.rows === 7, 'M1', `원본: mode=${a.mode} rows=${a.rows} (기대 row/7)`)
  ok(sizes(FIX) === '8,6,6,6,7,6,8', 'M1', `원본 줄 구성 ${sizes(FIX)} (기대 8,6,6,6,7,6,8)`)
  // labels[i] 는 **입력 순서**다(FIX[0] 은 맨 아래 백색 시트 = 7-4). 1-1 은 1줄 맨 왼쪽 1700×840 이어야 한다.
  const i11 = a.labels.indexOf('1-1')
  ok(new Set(a.labels).size === 47 && i11 >= 0 && FIX[i11].w === 1700, 'M1', `라벨 고유 ${new Set(a.labels).size} · 1-1 = ${i11 >= 0 ? FIX[i11].w + 'x' + FIX[i11].h : '없음'}`)
  const first = FIX.map((p, i) => ({ p, l: a.labels[i] })).filter((z) => z.l === '1-7' || z.l === '1-8')
  ok(first.length === 2 && first.every((z) => z.p.h > 1400), 'M1', '1줄의 긴 조각 둘(700×1500·750×1980)이 같은 줄 끝에 온다(top 이 아니라 겹침으로 묶는다)')
  const B = FIX.map((p, i) => ({ ...p, y: p.y + (i % 2 ? Math.round(p.h * 0.4) : 0) }))
  const b = PN.assign(B, 'auto')
  ok(b.mode === 'row' && sizes(B) === '8,6,6,6,7,6,8', 'M1', `40% 지그재그: mode=${b.mode} 줄 ${sizes(B)}`)
  ok(b.labels.join('|') === a.labels.join('|'), 'M1', '40% 지그재그의 라벨이 원본과 동일')
}
// ── M2 폴백 ───────────────────────────────────────────────────
{
  const B2 = FIX.map((p, i) => ({ ...p, y: p.y + (i % 2 ? Math.round(p.h * 0.6) : 0) }))
  ok(PN.assign(B2, 'auto').mode === 'seq', 'M2', '60% 지그재그 → 일련')
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  const C = FIX.map((p) => ({ ...p, x: Math.round(rnd() * 12000), y: Math.round(rnd() * 17000) }))
  const c = PN.assign(C, 'auto')
  ok(c.mode === 'seq' && c.chain > PN.CHAIN_MAX, 'M2', `무작위 → 일련 (chain=${c.chain.toFixed(2)})`)
  const E = FIX.map((p, i) => ({ ...p, x: 0, y: i * 1600 }))
  const e = PN.assign(E, 'auto')
  ok(e.mode === 'seq' && e.rows === 47 && e.labels[0] === '1' && e.labels[46] === '47', 'M2', `한 열 세로쌓기 → 일련 (rows=${e.rows})`)
  const one = PN.assign(FIX.slice(0, 6).map((p, i) => ({ x: i * 800, y: 0, w: 700, h: 1410 })), 'auto')
  ok(one.mode === 'seq' && one.labels.join(',') === '1,2,3,4,5,6', 'M2', `한 줄 6장 → 일련 (${one.labels.join(',')})`)
  ok(PN.assign([], 'auto').labels.length === 0, 'M2', '빈 입력')
}
// ── M3 수동 모드 ──────────────────────────────────────────────
{
  const s = PN.assign(FIX, 'seq')
  ok(s.mode === 'seq' && s.labels.every((l) => /^\d+$/.test(l)), 'M3', '강제 일련')
  // 일련 순서 = 줄 순회: 1줄 8장 뒤에 2줄 첫 조각이 9번
  const a = PN.assign(FIX, 'auto')
  const i21 = a.labels.indexOf('2-1'), i18 = a.labels.indexOf('1-8')
  ok(s.labels[i18] === '8' && s.labels[i21] === '9', 'M3', `일련 순서(1-8→${s.labels[i18]} · 2-1→${s.labels[i21]})`)
  let seed = 3; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  const C = FIX.map((p) => ({ ...p, x: Math.round(rnd() * 12000), y: Math.round(rnd() * 17000) }))
  ok(PN.assign(C, 'row').mode === 'row', 'M3', '강제 줄번호(흩어져도)')
}
// ── M4 꼬리표 기하 — 실제 회전과 대조 ───────────────────────────
{
  const Wg = 9, Hg = 14, tw = 5, th = 2
  const base = { W: Wg, H: Hg, m: new Uint8Array(Wg * Hg).fill(1) }
  const tabbed = PN.attachTab(base, tw, th)
  ok(tabbed.W === Wg && tabbed.H === Hg + th && tabbed.tabX0 === th && tabbed.tabW === tw, 'M4', `attachTab 크기 ${tabbed.W}x${tabbed.H} x0=${tabbed.tabX0}`)
  let cnt = 0; for (const v of tabbed.m) cnt += v
  ok(cnt === Wg * Hg + tw * th, 'M4', `attachTab 픽셀 수 ${cnt} (기대 ${Wg * Hg + tw * th})`)
  for (const rot of [0, 90, 180, 270]) {
    const rp = N.trim(N.rotate({ W: tabbed.W, H: tabbed.H, m: tabbed.m }, rot))
    ok(rp.offX === 0 && rp.offY === 0, 'M4', `rot${rot} trim 무손실`)
    const g = PN.placedGeom({ x: 0, y: 0, rot }, Wg, Hg, tw, th, tabbed.tabX0)
    // 조각 사각 안은 전부 1
    let inside = true
    for (let y = g.piece.y; y < g.piece.y + g.piece.H; y++) for (let x = g.piece.x; x < g.piece.x + g.piece.W; x++) if (!rp.m[y * rp.W + x]) inside = false
    ok(inside, 'M4', `rot${rot} 조각 사각이 전부 채워져 있다`)
    // 조각 사각 밖의 1 = 꼬리표 → bbox 가 placedGeom.tab 과 같다
    let L = 1e9, T = 1e9, R = -1, B = -1, extra = 0
    for (let y = 0; y < rp.H; y++) for (let x = 0; x < rp.W; x++) {
      if (!rp.m[y * rp.W + x]) continue
      const inPiece = x >= g.piece.x && x < g.piece.x + g.piece.W && y >= g.piece.y && y < g.piece.y + g.piece.H
      if (inPiece) continue
      extra++; L = Math.min(L, x); T = Math.min(T, y); R = Math.max(R, x); B = Math.max(B, y)
    }
    const same = extra === tw * th && L === g.tab.x && T === g.tab.y && (R - L + 1) === g.tab.w && (B - T + 1) === g.tab.h
    ok(same, 'M4', `rot${rot} 꼬리표 자리 실측 (${L},${T}) ${R - L + 1}x${B - T + 1} vs placedGeom (${g.tab.x},${g.tab.y}) ${g.tab.w}x${g.tab.h}`)
    ok(g.tab.vertical === (rot === 90 || rot === 270), 'M4', `rot${rot} 세로 꼬리표 여부`)
  }
  // 조각 폭이 꼬리표보다 좁으면 왼쪽부터 붙는다(들여쓰기 포기)
  const narrow = PN.attachTab({ W: 4, H: 6, m: new Uint8Array(24).fill(1) }, 5, 2)
  ok(narrow.tabX0 === 0 && narrow.tabW === 4, 'M4', `좁은 조각 꼬리표 x0=${narrow.tabX0} w=${narrow.tabW}`)
}
// ── M5 폭 규칙 ────────────────────────────────────────────────
{
  // usableW 675px(=1350mm/2) 기준: 700×1410 조각(px 350×705) — 세우면 350 ≤ 675 통과 → 꼬리표 가능
  ok(PN.canTab(350, 705, 4, 675) === true, 'M5', '세워서 들어가는 조각은 꼬리표 가능')
  // 1400×840(px 700×420): 세우면 700 > 675 → 눕혀야 하고 눕힌 폭 420+4 ≤ 675 → 가능
  ok(PN.canTab(700, 420, 4, 675) === true, 'M5', '눕혀 들어가는 조각 — 폭 여유 있음')
  // 1400×1346(px 700×673): 눕힌 폭 673+4 = 677 > 675 → 꼬리표 불가(건너뛰고 센다)
  ok(PN.canTab(700, 673, 4, 675) === false, 'M5', '눕힌 폭이 꼬리표 두께만큼 모자라면 불가')
  // 둘 다 안 들어가는 조각 — 엔진이 미배치로 낸다(꼬리표 판정은 false)
  ok(PN.canTab(700, 690, 4, 675) === false, 'M5', '폭보다 큰 조각')
}
// ── M6 배치 비용 (실제 엔진) ──────────────────────────────────
{
  const MMPP = 2, ROLL_W = 1520, DOMBO = 10, ROLL_MAX = 5600
  const sheetW = Math.floor((ROLL_W - DOMBO * 2) / MMPP), rollMaxH = Math.floor((ROLL_MAX - DOMBO * 2) / MMPP)
  const grow = Math.round(4.5 / MMPP)
  const build = (tab) => FIX.map((p, i) => {
    const W = Math.round(p.w / MMPP), H = Math.round(p.h / MMPP)
    let q = { id: i, W, H, m: G.offsetMask(new Uint8Array(W * H).fill(1), W, H, grow) }
    if (tab && PN.canTab(W, H, 4, sheetW)) q = PN.attachTab(q, 10, 4)
    return { id: i, W: q.W, H: q.H, m: q.m }
  })
  const run = (ps) => N.nest(ps, { sheetW, sheetH: 0, rollMaxH, rotations: [0, 90], maxSheets: 20 })
  const A = run(build(false)), B = run(build(true))
  const len = (r) => r.sheets.reduce((a, s) => a + s.usedH * MMPP + DOMBO * 2, 0)
  ok(A.unplaced.length === 0 && B.unplaced.length === 0, 'M6', `미배치 A=${A.unplaced.length} B=${B.unplaced.length}`)
  ok(A.sheets.length === B.sheets.length, 'M6', `판 수 A=${A.sheets.length} B=${B.sheets.length}`)
  const inc = (len(B) - len(A)) / len(A)
  ok(inc < 0.01, 'M6', `총 길이 증가 ${(inc * 100).toFixed(2)}% (상한 1%)`)
  console.log(`M6 롤 ${ROLL_W}: 판 ${A.sheets.length}→${B.sheets.length} · 길이 ${len(A)}→${len(B)}mm (+${(inc * 100).toFixed(2)}%)`)
}

if (fails.length) { console.error('cut:number FAIL\n  ' + fails.join('\n  ')); process.exit(1) }
console.log('cut:number OK — M1~M6 (줄 판정·폴백·수동·꼬리표 기하 4회전·폭 규칙·배치 비용)')
