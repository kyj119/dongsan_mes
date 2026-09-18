/**
 * 윈드배너 틀 조회 하네스 — `npm run cut:frame`
 *
 * 검증 대상 = 패널의 `js/frame.js` · `js/frame-catalog.js` **그 파일**.
 *
 * ★이 모듈의 값어치는 「만드는 것」이 아니라 **「안 만드는 것」**에 있다.
 *   틀이 없는 규격을 추정해서 앉히면 판은 멀쩡히 나오고 천만 틀린다(§조용한 격하).
 *   X형·H형은 인수인계에 형만 있고 틀이 없다 — 그걸 거절하는지가 여기서 가장 중요한 항목이다.
 *
 * ★`--verify` 를 붙이면 Z: 의 실제 틀 파일을 다시 읽어 판 크기를 대조한다(드리프트).
 *   Z: 가 없으면 건너뛴다 — CI 에서는 카탈로그 내부 일관성만 본다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const PANEL = path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js')
const load = (f) => import('file://' + path.join(PANEL, f).replace(/\\/g, '/'))

await load('frame-catalog.js')
await load('frame.js')
const F = globalThis.MesFrame
const C = globalThis.MesFrameCatalog

let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name) }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '   ← ' + extra : '')) }
}

console.log('\n윈드배너 틀 조회 (js/frame.js · frame-catalog.js)\n' + '='.repeat(62))

// ── ① 카탈로그 내부 일관성
{
  ok('① 틀이 6종이다', C.FRAMES.length === 6, C.FRAMES.length)
  const ids = C.FRAMES.map((f) => f.id)
  ok('② id 가 중복되지 않는다', new Set(ids).size === ids.length, ids.join(','))
  const bad = C.FRAMES.filter((f) =>
    !(f.spec.w > 0 && f.spec.h > 0 && f.plate.w > 0 && f.plate.h > 0) ||
    f.plate.w + 0.01 < f.silhouette.w || f.plate.h + 0.01 < f.silhouette.h ||
    !/^Z:\\/.test(f.file) || !/\.eps$/.test(f.file) ||
    ['auto', 'manual'].indexOf(f.placement) < 0)
  ok('③ 모든 틀이 판 ≥ 실루엣 · 경로·placement 가 온전하다', bad.length === 0, bad.map((f) => f.id).join(','))
  const autoBad = C.FRAMES.filter((f) => f.placement === 'auto' &&
    (Math.abs(f.silhouette.w - f.spec.w) > F.SPEC_TOL || Math.abs(f.silhouette.h - f.spec.h) > F.SPEC_TOL))
  ok('④ ★auto 로 표시된 틀은 실루엣이 규격과 일치한다', autoBad.length === 0, autoBad.map((f) => f.id).join(','))
}

// ── ② 조회 — 맞는 것
{
  let r = F.lookup({ type: 'S', specW: 700, specH: 2800 })
  ok('⑤ S형 70×280 을 찾는다', r.ok && r.frame.id === 'S-70-280', JSON.stringify(r))
  r = F.lookup({ type: 'F', specW: 1050, specH: 2670 })
  ok('⑥ F형 105×267 을 찾는다', r.ok && r.frame.id === 'F-105-267', JSON.stringify(r))
  r = F.lookup({ type: 'S', specW: 698, specH: 2801 })
  ok('⑦ 허용오차 안이면 같은 틀을 찾는다', r.ok && r.frame.id === 'S-70-280', JSON.stringify(r))
}

// ── ③ ★거절 — 만들지 않는 것이 이 모듈의 일이다
{
  const cases = [
    ['⑧ ★X형은 틀이 없어 거절', { type: 'X', specW: 700, specH: 2800 }, 'type'],
    ['⑨ ★H형은 틀이 없어 거절', { type: 'H', specW: 700, specH: 2800 }, 'type'],
    ['⑩ ★틀 없는 규격은 거절(S형 90×300)', { type: 'S', specW: 900, specH: 3000 }, 'nomatch'],
    ['⑪ 규격이 없으면 거절', { type: 'S' }, 'spec'],
    ['⑫ 형이 없으면 거절', { specW: 700, specH: 2800 }, 'type'],
  ]
  for (const [name, input, code] of cases) {
    const r = F.lookup(input)
    ok(name, r.ok === false && r.code === code, JSON.stringify(r))
  }
}

// ── ④ 거래처 전용 틀
{
  let r = F.lookup({ type: 'F', specW: 510, specH: 1220 })
  ok('⑬ 하우사인 전용 틀은 거래처 없이 못 쓴다', r.ok === false && r.code === 'client', JSON.stringify(r))
  r = F.lookup({ type: 'F', specW: 510, specH: 1220, client: '하우사인' })
  ok('⑭ 거래처가 맞으면 쓴다', r.ok && r.frame.id === 'F-51-122-하우사인', JSON.stringify(r))
}

// ── ⑤ 앉히기 판정
{
  const s = F.lookup({ type: 'S', specW: 700, specH: 2800 }).frame
  let p = F.plan({ frame: s, design: { w: 700, h: 2800 } })
  ok('⑮ S형은 규격이 맞으면 auto', p.ok && p.mode === 'auto', JSON.stringify({ mode: p.mode, why: p.why }))
  p = F.plan({ frame: s, design: { w: 690, h: 2800 } })
  ok('⑯ ★원본이 규격과 다르면 auto 라도 manual 로 내려간다', p.mode === 'manual' && p.why === 'design-off-spec',
    JSON.stringify({ mode: p.mode, why: p.why }))
  ok('⑰ 그때 확인 목록에 사유가 올라온다', p.review.some((x) => x.code === 'design-off-spec'),
    p.review.map((x) => x.code).join(','))

  const f105 = F.lookup({ type: 'F', specW: 1050, specH: 2670 }).frame
  p = F.plan({ frame: f105 })
  ok('⑱ ★F형은 실루엣이 규격과 달라 언제나 manual', p.mode === 'manual' && p.why === 'silhouette-off-spec',
    JSON.stringify({ mode: p.mode, why: p.why }))
}

// ── ⑥ 디자이너 확인 목록 — 인수인계 문장이 빠지지 않는가
{
  const s = F.lookup({ type: 'S', specW: 700, specH: 2800 }).frame
  const p = F.plan({ frame: s })
  const codes = p.review.map((x) => x.code)
  ok('⑲ 검정테두리 항목이 있다', codes.indexOf('no-black-border') >= 0, codes.join(','))
  ok('⑳ ★재단선 점선 없이 항목이 있다', codes.indexOf('cut-mark-solid') >= 0, codes.join(','))
  ok('㉑ ★라운드 7cm 바이어스 / 글씨 4cm 항목이 있다', codes.indexOf('bias-7cm') >= 0, codes.join(','))
  const f76 = F.lookup({ type: 'F', specW: 760, specH: 1800 }).frame
  const p2 = F.plan({ frame: f76 })
  ok('㉒ 시접이 안 그려진 틀은 그 사실을 알린다', p2.review.some((x) => x.code === 'seam-missing'),
    p2.review.map((x) => x.code).join(','))
}

// ── ⑦ 자가시험 — 카탈로그를 건드리면 잡히는가
{
  const t = C.FRAMES.find((f) => f.id === 'S-70-280')
  const keep = t.silhouette.w
  t.silhouette.w = 650                               // auto 인데 규격과 어긋나게 만든다
  const bad = C.FRAMES.filter((f) => f.placement === 'auto' &&
    Math.abs(f.silhouette.w - f.spec.w) > F.SPEC_TOL)
  t.silhouette.w = keep
  const back = C.FRAMES.filter((f) => f.placement === 'auto' &&
    Math.abs(f.silhouette.w - f.spec.w) > F.SPEC_TOL)
  ok('㉓ 자가시험 — 실루엣을 어긋나게 하면 ④가 잡는다', bad.length === 1, bad.length)
  ok('㉔ 자가시험 — 되돌리면 통과', back.length === 0, back.length)
}

// ── ⑧ 드리프트 — Z: 의 실제 틀과 판 크기 대조
// ★플래그를 붙여야 도는 검사는 아무도 안 붙인다(`cut:butt` 가 한 달간 GATES 밖에 있던 전례).
//   틀 파일이 보이면 **저절로** 돈다. 안 보이면(CI·Z: 미연결) 건너뛴다. `--no-verify` 로만 끈다.
const canVerify = !process.argv.includes('--no-verify') && C.FRAMES.some((f) => fs.existsSync(f.file))
if (canVerify) {
  console.log('\n[드리프트] Z: 의 실제 틀 파일과 판 크기 대조')
  const PT = 25.4 / 72
  for (const f of C.FRAMES) {
    if (!fs.existsSync(f.file)) { console.log(`  SKIP  ${f.id} — 틀 파일 없음 (${f.file})`); continue }
    const head = fs.readFileSync(f.file).subarray(0, 4000).toString('latin1')
    const m = head.match(/%%HiResBoundingBox:\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/)
    if (!m) { ok(`${f.id} 판 크기`, false, 'BoundingBox 를 못 읽었다'); continue }
    const w = Math.round((+m[3] - +m[1]) * PT * 100) / 100
    const h = Math.round((+m[4] - +m[2]) * PT * 100) / 100
    ok(`${f.id} 판 ${w}×${h}`, Math.abs(w - f.plate.w) <= 0.1 && Math.abs(h - f.plate.h) <= 0.1,
      `카탈로그 ${f.plate.w}×${f.plate.h}`)
  }
} else {
  console.log('\n[드리프트] 건너뜀 — 틀 파일이 안 보인다(Z: 미연결이거나 --no-verify)')
}

console.log('\n' + '='.repeat(62))
console.log(fail ? `실패 ${fail} / 전체 ${pass + fail}` : `전 항목 통과 (${pass})`)
process.exit(fail ? 1 : 0)
