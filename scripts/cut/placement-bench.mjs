/**
 * 배치 판정 하네스 — `npm run cut:placement`
 *
 * 검증 대상 = 패널의 `js/placement.js` **그 파일**(검증한 코드 = 배포된 코드).
 *
 * ★이 하네스가 있는 이유 = **「기능이 켜진 채로 끝났는가」를 아무도 안 봤다.**
 *   2026-09-04, 판 길이 관문을 배치 엔진 밖에 두면서 맞붙임이 조용히 래스터로 격하됐는데
 *   기존 게이트가 전부 통과했다 — cut:butt 는 엔진 단독이라 "패널이 안 골랐다"를 못 보고,
 *   cut:smoke 는 소스 텍스트라 "코드 모양은 그대로"였고, cut:e2e 는 판이 정상적으로 나왔다.
 *   격하는 실패가 아니라 **성공처럼 생겼다.** 그래서 여기서는 격하를 실패로 센다.
 *
 * ★엔진을 주입하므로 일러가 필요 없다 — 판정만 떼어 손으로 셀 수 있는 값으로 확인한다.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const PANEL = path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js')
const load = (f) => import('file://' + path.join(PANEL, f).replace(/\\/g, '/'))

await load('placement.js')
await load('butt.js')
const P = globalThis.MesCutPlacement
const B = globalThis.MesCutButt

let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name) }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '   ← ' + extra : '')) }
}

console.log('\n배치 판정 (js/placement.js)\n' + '='.repeat(52))

// 판 하나를 흉내낸다 — 길이만 의미가 있다(관문이 재는 값).
const sheet = (usedH) => ({ usedH, placements: [], inkPx: 1 })
const resOf = (...hs) => ({ sheets: hs.map(sheet), unplaced: [] })
// plateMm = usedH 를 그대로 mm 로 본다(돔보는 이 하네스의 관심사가 아니다 — 산식은 패널 몫)
const base = (over = {}) => ({
  offsetMm: 0, gapMm: 0,
  hasButt: true, hostOk: true, hostVersion: 'CUT-CEP-0.38.2', minHost: 'CUT-CEP-0.18.0',
  rectish: [true, true], ids: [0, 1], wantVec: false,
  sheetHmm: 0, rollMaxMm: 5600,
  placeButt: () => resOf(3000),
  placeRaster: () => resOf(2000, 2000),
  plateMm: (r) => Math.max(...r.sheets.map((s) => s.usedH)),
  ...over,
})

// ── ① 켜질 조건이면 켜진다 ───────────────────────────────────────
{
  const r = P.choose(base())
  ok('① 여백0·간격0·직사각이면 맞붙임', r.engine === 'butt', r.engine + ' / ' + r.why)
  ok('① 켜졌으면 사유가 비어 있다', r.why === '', JSON.stringify(r.why))
  ok('① 치명 오류 없음', r.fatal === '', r.fatal)
}

// ── ② 안 켜지면 **왜인지 말한다** — 조용한 격하 금지 ─────────────
{
  const cases = [
    // ★여백·간격이 **양수**면 "맞붙임을 요청하지 않았다"는 뜻이라 사유가 없어야 한다(아래 침묵 항목).
    //   음수는 다르다 — 요청 문턱(≤0)은 넘었는데 정확히 0 이 아니라 못 쓰는 것이라 말해 줘야 한다.
    ['여백이 음수면', { offsetMm: -2 }, /여백\/간격이 0이 아님/],
    ['간격이 음수면', { gapMm: -1 }, /여백\/간격이 0이 아님/],
    ['butt.js 가 없으면', { hasButt: false }, /butt\.js 미설치/],
    ['호스트가 구버전이면', { hostOk: false }, /호스트 구버전.*mes-cut-host/],
    ['조각 크기를 모르면', { rectish: [] }, /조각 크기를 못 받았습니다/],
    ['이형 조각이 섞이면', { rectish: [true, false] }, /조각 #1 .*직사각이 아님/],
  ]
  for (const [name, over, re] of cases) {
    const r = P.choose(base(over))
    ok('② ' + name + ' 래스터', r.engine === 'raster', r.engine)
    ok('② ' + name + ' 사유를 말한다', re.test(r.why), JSON.stringify(r.why))
  }
  // 여백>0·간격>0 은 "맞붙임을 요청하지 않았다"는 뜻이라 사유가 없어야 한다(엉뚱한 경고 금지)
  for (const [name, over] of [['여백', { offsetMm: 3 }], ['간격', { gapMm: 3 }]]) {
    const r = P.choose(base(over))
    ok('② ' + name + '이 양수면 래스터', r.engine === 'raster', r.engine)
    ok('② ' + name + '이 양수면 침묵(요청이 아님)', r.why === '', JSON.stringify(r.why))
  }
}

// ── ③ ★어제의 회귀 — 길이 관문이 맞붙임을 죽이면 잡아낸다 ────────
{
  // 판을 못 나누던 시절의 맞붙임: 13,442mm 한 판
  const old = P.choose(base({ placeButt: () => resOf(13442) }))
  ok('③ 상한을 넘는 맞붙임은 래스터로 되돌린다', old.engine === 'raster', old.engine)
  ok('③ 되돌린 이유를 말한다', /길이 한계 5600mm 를 넘어\(13442mm\)/.test(old.why), old.why)

  // 판을 나눈 뒤: 같은 잡이 5,600 이하 판 3장 → **맞붙임이 살아 있어야 한다**
  const now = P.choose(base({ placeButt: () => resOf(4500, 4500, 4442) }))
  ok('③ ★판을 나누면 맞붙임이 살아남는다', now.engine === 'butt', now.engine + ' / ' + now.why)
  ok('③ 판이 3장이다', now.res.sheets.length === 3, String(now.res.sheets.length))
  ok('③ 격하 사유가 없다', now.why === '', JSON.stringify(now.why))
}

// ── ④ 평판은 높이가 규격이라 길이 관문을 안 탄다 ─────────────────
{
  const r = P.choose(base({ sheetHmm: 2400, placeButt: () => resOf(9999) }))
  ok('④ 평판은 길이 관문 면제', r.engine === 'butt', r.engine + ' / ' + r.why)
}

// ── ⑤ 맞붙임이 벡터보다 우선한다 ─────────────────────────────────
{
  const r = P.choose(base({ wantVec: true }))
  ok('⑤ 벡터 요청이어도 맞붙임', r.engine === 'butt' && r.overVec === true, r.engine + '/' + r.overVec)
  // ★폴백했으면 벡터를 **돌려준다** — 전에는 맞붙임도 안 되고 벡터도 잃었다
  const f = P.choose(base({ wantVec: true, placeButt: () => resOf(13442) }))
  ok('⑤ ★폴백하면 벡터 요청을 되돌려 준다', f.engine === 'raster' && f.overVec === false,
    f.engine + '/' + f.overVec)
  // 애초에 맞붙임이 아니면 벡터를 건드리지 않는다
  ok('⑤ 맞붙임이 아니면 벡터 그대로', P.choose(base({ offsetMm: 3, wantVec: true })).overVec === false)
}

// ── ⑥ 여기서 끝내는 실패 — 호스트로 보내면 PARM 으로 죽는다 ──────
{
  const none = P.choose(base({ placeButt: () => null, placeRaster: () => ({ sheets: [], unplaced: [0] }) }))
  ok('⑥ 아무것도 못 놓으면 치명', /배치 실패/.test(none.fatal), none.fatal)

  const over = P.choose(base({
    offsetMm: 3,                                    // 래스터 경로
    placeRaster: () => resOf(9000),                 // 래스터인데도 상한 초과
  }))
  ok('⑥ 래스터도 상한을 넘으면 치명', /판 길이 9000mm 가 한계 5600mm/.test(over.fatal), over.fatal)
  ok('⑥ 정상이면 치명 없음', P.choose(base()).fatal === '')
}

// ── ⑦ 관문은 판 **전부**를 본다 (가장 긴 판 기준) ────────────────
{
  ok('⑦ 마지막 판이 넘으면 통과 못 한다',
    P.fitsLength(resOf(1000, 1000, 9999), { sheetHmm: 0, rollMaxMm: 5600, plateMm: (r) => Math.max(...r.sheets.map((s) => s.usedH)) }) === false)
  ok('⑦ 전부 이하면 통과',
    P.fitsLength(resOf(1000, 5600), { sheetHmm: 0, rollMaxMm: 5600, plateMm: (r) => Math.max(...r.sheets.map((s) => s.usedH)) }) === true)
  ok('⑦ 판이 없으면 통과 못 한다',
    P.fitsLength({ sheets: [] }, { sheetHmm: 0, rollMaxMm: 5600, plateMm: () => 0 }) === false)
}

// ── ⑧ 실제 엔진과 물려서도 성립하는가 (butt.js 주입) ─────────────
{
  // 1050폭에 950x2380 조각 6장 = 한 줄 13,442mm → 5,600 상한이면 판이 나뉜다
  const rects = []
  for (let i = 0; i < 6; i++) rects.push({ id: i, w: 950, h: 2240 })
  const sheets = B.packSheets(rects, 1050, false, 5600)
  ok('⑧ 실제 엔진이 판을 나눈다', sheets && sheets.length === 3, sheets ? String(sheets.length) : 'null')
  ok('⑧ 조각을 하나도 안 잃는다',
    sheets && sheets.reduce((n, s) => n + s.placements.length, 0) === 6,
    sheets ? String(sheets.reduce((n, s) => n + s.placements.length, 0)) : 'null')
  ok('⑧ 모든 판이 상한 이하', sheets && sheets.every((s) => s.usedH <= 5600),
    sheets ? sheets.map((s) => s.usedH).join(',') : 'null')

  const r = P.choose(base({
    rectish: [true, true, true, true, true, true], ids: [0, 1, 2, 3, 4, 5],
    placeButt: () => ({ sheets: sheets.map((s) => ({ usedH: s.usedH, placements: s.placements })), unplaced: [], butt: true }),
    plateMm: (x) => Math.max(...x.sheets.map((s) => s.usedH)),
  }))
  ok('⑧ ★실물 형태에서 맞붙임이 켜진 채 끝난다', r.engine === 'butt', r.engine + ' / ' + r.why)
}

console.log('\n' + '='.repeat(52))
console.log(fail ? `실패 ${fail} / 전체 ${pass + fail}` : `전 항목 통과 (${pass})`)
process.exit(fail ? 1 : 0)
