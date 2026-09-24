// 굳히기 격자 나누기 하네스 — `mes-cut-host.jsx` 의 `mesCut_hardenGrids` 를 **소스에서 떼어** 가짜 조각으로 돌린다.
//   2026-09-24 실기: 1/10 축소 파일 14조각이 한 격자(≈2m)에 들어가 10배 확대하면 20m → 캔버스(5.6m) 초과로
//   격자가 통째로 버려지고(`hardenwhy=canvas`) 전 조각이 조각별 굳히기로 떨어졌다(적용 332초).
//   판정: ①배율 10배에서 격자가 여럿으로 나뉘고 **각 격자의 확대 후 크기 ≤ 캔버스** ②모든 조각이 어느 격자엔가 든다
//        ③배율 1배(보통 파일)에서는 종전처럼 **격자 1개** ④혼자서도 안 들어가는 조각만 빠진다(조각별 경로)
//   실행 = npm run cut:hardengrid   (실패 시 exit 1)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx'), 'utf8')
const m = /function mesCut_hardenGrids\([\s\S]*?\r?\n}\r?\n/.exec(SRC)
if (!m) { console.error('mesCut_hardenGrids 를 소스에서 못 찾았다'); process.exit(1) }
const num = (re) => { const x = re.exec(SRC); if (!x) throw new Error('상수 없음 ' + re); return parseFloat(x[1]) }
const PT = 72 / 25.4
const PDF_MAX = num(/var MESCUT_PDF_MAX_PT = (\d+)/)
const CANVAS_MAX = num(/var MESCUT_CANVAS_MAX_PT = (\d+)/)
const GAP_MM = num(/var MESCUT_HARDEN_GAP_MM = (\d+)/)

let fails = 0
const ok = (name, c, extra = '') => { if (c) console.log(`  PASS  ${name}`); else { fails++; console.log(`  FAIL  ${name}   ← ${extra}`) } }

/** 조각 크기(mm, 파일 좌표)로 hardenGrids 를 돌린다 — hardenGrid 는 받은 조각을 **같은 줄바꿈 규칙**으로 재서 돌려준다 */
function run(sizesMm, pct) {
  const items = sizesMm.map(([w, h]) => ({ b: [0, h * PT, w * PT, 0] }))
  const calls = []
  const env = {
    MESCUT_PT_PER_MM: PT, MESCUT_PDF_MAX_PT: PDF_MAX, MESCUT_CANVAS_MAX_PT: CANVAS_MAX, MESCUT_HARDEN_GAP_MM: GAP_MM,
    MESCUT_NEST_ITEMS: items, MESCUT_HARDEN_ERR: '',
    mesCut_inkBounds: (it) => it.b,
    // 실제 hardenGrid 의 크기 산수(줄바꿈·높이)를 그대로 흉내 — 어긋나면 격자가 null 이 된다
    mesCut_hardenGrid: (doc, idxs, lim, tag) => {
      const GAP = GAP_MM * PT
      let totW = 0, totH = 0, rowW = 0, rowH = 0
      for (const i of idxs) {
        const b = items[i].b, cw = b[2] - b[0] + GAP, ch = b[1] - b[3] + GAP
        if (cw > lim || ch > lim) return null
        if (rowW > 0 && rowW + cw > lim) { totW = Math.max(totW, rowW); totH += rowH; rowW = 0; rowH = 0 }
        rowW += cw; rowH = Math.max(rowH, ch)
      }
      totW = Math.max(totW, rowW); totH += rowH
      if (totH > lim) return null
      const g = { pdf: 'x' + tag, w: totW, h: totH, cells: Object.fromEntries(idxs.map((i) => [String(i), {}])) }
      calls.push(g); return g
    },
  }
  const fn = new Function(...Object.keys(env), m[0] + '\nreturn mesCut_hardenGrids')(...Object.values(env))
  return fn(null, sizesMm.map((_, i) => i), pct)
}

// 이번 실기 파일 — 1/10 축소, 조각 14개(판 L 줄의 실물 mm ÷ 10, 도련 제외 근사)
const REAL = [[75, 199], [70, 150], [170, 84], [146, 84], [167, 84], [146, 84], [167, 84], [148, 84], [70, 141], [70, 141], [97, 141], [97, 141], [97, 141], [97, 141]]
console.log('\n── 1 실기 파일(1/10 · 배율 1000%) ──')
{
  const r = run(REAL, 1000)
  const all = new Set(r.grids.flatMap((g) => Object.keys(g.cells)))
  ok('격자가 2개 이상으로 나뉜다', r.grids.length >= 2, `grids=${r.grids.length}`)
  ok('격자마다 확대 후 크기 ≤ 캔버스', r.grids.every((g) => g.w * 10 <= CANVAS_MAX && g.h * 10 <= CANVAS_MAX), r.grids.map((g) => `${Math.round(g.w * 10 / PT)}x${Math.round(g.h * 10 / PT)}mm`).join(' '))
  ok('14조각 전부 어느 격자엔가 든다', all.size === 14, `${all.size}/14`)
  ok('실패 사유 없음', !r.fail, r.fail)
  // 종전(단일 격자·PDF 한계 줄바꿈)이었다면 캔버스를 넘었는가 — 사고 재현
  let rowW = 0; for (const [w] of REAL) rowW += (w + GAP_MM) * PT
  ok('종전 규칙이면 한 줄 격자가 10배에서 캔버스 초과(사고 재현)', rowW <= PDF_MAX && rowW * 10 > CANVAS_MAX, `${Math.round(rowW / PT)}mm ×10`)
  console.log(`  격자 ${r.grids.length}개: ` + r.grids.map((g) => Object.keys(g.cells).length + '조각').join(' · '))
}
console.log('\n── 2 보통 파일(배율 100%) ──')
{
  // 종전에도 한 격자로 되던 크기(실물 ×3) → 그대로 1개(회귀 0 — 한계값이 종전과 같다: min(PDF, 캔버스÷1) = PDF)
  const r = run(REAL.map(([w, h]) => [w * 3, h * 3]), 100)
  ok('종전에 한 격자로 되던 잡 → 격자 1개(종전과 동일)', r.grids.length === 1 && Object.keys(r.grids[0].cells).length === 14, `grids=${r.grids.length}`)
  // 실물 크기 14조각 → 종전 단일 격자는 높이가 PDF 한계를 넘어 통째로 실패('size')했다 → 이제 나눠서 산다
  const big = REAL.map(([w, h]) => [w * 10, h * 10])
  const r2 = run(big, 100)
  const all2 = new Set(r2.grids.flatMap((g) => Object.keys(g.cells)))
  ok('종전엔 통째로 실패하던 잡 → 나눠서 14조각 전부 격자로', r2.grids.length >= 2 && all2.size === 14, `grids=${r2.grids.length} 조각=${all2.size}`)
}
console.log('\n── 3 혼자서도 안 들어가는 조각만 빠진다 ──')
{
  const r = run([[80, 80], [700, 80], [80, 80]], 1000)   // 700mm ×10 = 7m > 캔버스
  const all = new Set(r.grids.flatMap((g) => Object.keys(g.cells)))
  ok('큰 조각(#1)만 빠지고 나머지 둘은 격자에', all.size === 2 && !all.has('1'), [...all].join(','))
}
console.log('\n── 4 빈 목록 ──')
{
  const r = run([], 1000)
  ok('격자 0 · 예외 없음', r.grids.length === 0)
}

console.log('\n── 5 패널 결과창 — 적용 내역·느린 경로를 말한다(applyBreakdown) ──')
{
  const CM = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js', 'cut-main.js'), 'utf8')
  const pick = (re) => { const x = re.exec(CM); if (!x) throw new Error('패널 소스 없음 ' + re); return x[0] }
  const code = pick(/var APPLY_STAGE = [^\r\n]*/) + '\n' + pick(/var HARDEN_WHY = [^\r\n]*/) + '\n' + pick(/function applyBreakdown\(a\) \{[\s\S]*?\r?\n {2}\}\r?\n/)
  const AB = new Function(code + '\nreturn applyBreakdown')()
  // 이번 실기와 같은 모양 — 격자 포기(canvas) → 14조각 전부 조각별
  const slow = AB({ ms: 'harden:1500,scale:250000,vecsil:60000,bleed:9000,fit:4000', placed: '14', fast: '0', hardenwhy: 'canvas' })
  ok('적용 내역을 큰 것부터 쓴다', /적용 내역: 조각별 굳히기 250초 · 벡터 칼선 60초/.test(slow), slow)
  ok('느린 경로 조각 수와 사유(확대 후 캔버스 초과)', /14\/14개 조각이 \*\*조각별 굳히기\*\*.*확대 후 캔버스 초과/.test(slow), slow)
  const fast = AB({ ms: 'harden:1500,master:8000', placed: '14', fast: '14', grids: '2' })
  ok('정상 경로는 격자 수를 쓰고 경고 없음', /굳히기 격자 2개로 14개 조각/.test(fast) && !/⚠/.test(fast), fast)
  ok('굳히기가 없는 잡은 내역만', AB({ ms: 'vecsil:3000' }) === '\n  └ 적용 내역: 벡터 칼선 3초')
  ok('값이 없으면 빈 문자열', AB({}) === '')
}

console.log(fails ? `\n✗ ${fails}건 실패` : '\n✓ 전부 통과')
process.exit(fails ? 1 : 0)
