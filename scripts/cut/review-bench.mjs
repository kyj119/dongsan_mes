/**
 * 자동/확인 분담 하네스 — `npm run cut:review`
 *
 * 검증 대상 = 패널의 `js/review.js` **그 파일**.
 *
 * ★이 게이트가 보는 것은 「목록이 떴는가」가 아니라 **「전제가 안 설 때 하지 않는가」**다.
 *   2026-09-17 실기에서 클립 확장 코드가 전제를 주석에만 적고 검사하지 않아
 *   6개 중 5개를 「무손실 확장」으로 보고했는데 실물 도련은 0이었다.
 *   그래서 여기서는 **침범을 만들면 뜨고, 없애면 사라지는지**를 양방향으로 확인한다.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const PANEL = path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js')
const load = (f) => import('file://' + path.join(PANEL, f).replace(/\\/g, '/'))

await load('plate-rules.js')
await load('plate.js')
await load('frame-catalog.js')
await load('frame.js')
await load('review.js')
const R = globalThis.MesReview
const P = globalThis.MesPlate
const F = globalThis.MesFrame

let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name) }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '   ← ' + extra : '')) }
}
const codes = (list) => list.map((x) => x.code)

console.log('\n자동/확인 분담 (js/review.js)\n' + '='.repeat(58))

// 가로등 판 하나를 만들어 도련 판정의 입력으로 쓴다
const plate = P.computePlate({ specW: 600, specH: 1800, vup: 2, seam: '쌍침', sewCm: 5, band: 'top', media: '60폭' })
const design = plate.design[0]
const panel = plate.panels[0]

// ── ① 도련 경로 — 전제에 따라 갈린다
{
  // ★2026-09-22 정책 전환(용준님 실기): 기본은 **픽셀 반복**이다 — 「전체를 덮는 칠」은 가장자리에 보이는 것이 아니었다
  //   (고양 소노: 좌·우·하 가장자리는 사진+줄무늬, 그라디언트는 위 변뿐). 단색·늘리기·클립은 픽셀을 못 만들 때의 폴백이다.
  let b = R.planBleed({ design, panel, edge: { solid: true, color: [0, 0, 100, 0] } })
  ok('① 단색 가장자리도 기본은 픽셀 반복 — 폴백은 solid 로 남긴다', b.mode === 'repeat' && b.fallback === 'solid', JSON.stringify(b))
  ok('①-b 픽셀을 못 쓰면 단색으로 내려간다', R.planBleed({ design, panel, edge: { solid: true, color: [0, 0, 100, 0] }, allowRepeat: false }).mode === 'solid')
  ok('② 확장량이 좌우 23.25 로 나온다', Math.abs(b.grow.l - 23.25) < 0.02 && Math.abs(b.grow.r - 23.25) < 0.02,
    JSON.stringify(b.grow))
  ok('③ 밴드 쪽(위)은 0 · 반대쪽(아래)에 여유', Math.abs(b.grow.t) < 0.02 && b.grow.b > 29,
    JSON.stringify(b.grow))

  b = R.planBleed({ design, panel, edge: { solid: false, outside: true } })
  ok('④ 클립 밖 그림이 있어도 기본은 픽셀 반복', b.mode === 'repeat', JSON.stringify(b))
  ok('④-b ★픽셀을 못 쓰면 클립 밖 그림이 **있을 때만** clip 을 고른다',
    R.planBleed({ design, panel, edge: { solid: false, outside: true }, allowRepeat: false }).mode === 'clip'
    && R.planBleed({ design, panel, edge: { solid: false, outside: false }, allowRepeat: false }).mode !== 'clip')

  b = R.planBleed({ design, panel, edge: { solid: false, outside: false } })
  ok('⑤ ★클립 밖 그림이 없으면 clip 을 고르지 않는다(래스터로 내려간다)', b.mode === 'repeat', JSON.stringify(b))

  b = R.planBleed({ design, panel, edge: { solid: false, outside: false }, allowRepeat: false })
  ok('⑥ ★래스터도 막히면 skip 하고 사유를 남긴다', b.mode === 'skip' && b.why === 'edge-multicolor', JSON.stringify(b))

  b = R.planBleed({ design: panel, panel })
  ok('⑦ 넓힐 곳이 없으면 none', b.mode === 'none', JSON.stringify(b))
  ok('⑧ 기하가 없으면 skip', R.planBleed({}).mode === 'skip')
}

// ── ② 거절을 **센다** — 실행 횟수로 성공을 판정하지 않는다
{
  const t = R.tally([{ mode: 'solid' }, { mode: 'solid' }, { mode: 'skip' }, { mode: 'repeat' }])
  ok('⑨ ★판정 결과가 한 줄로 세어진다', /solid:2/.test(t) && /skip:1/.test(t) && /repeat:1/.test(t), t)
}

// ── ③ 확인 목록 — 인수인계 문장이 빠지지 않는가 (가로등)
{
  const b = R.planBleed({ design, panel, edge: { solid: true, color: [0, 0, 100, 0] } })
  let list = R.build({ mode: 'plate', bleed: b, edge: { solid: true, light: false } })
  let c = codes(list)
  ok('⑩ 검정테두리 항목이 있다', c.indexOf('no-black-border') >= 0, c.join(','))
  ok('⑪ 봉미싱 확인 항목이 있다', c.indexOf('sew-confirm') >= 0, c.join(','))
  ok('⑫ 부직포가 없으면 부직포 항목은 안 뜬다', c.indexOf('nonwoven-avoid') < 0, c.join(','))

  list = R.build({ mode: 'plate', bleed: b, edge: { solid: true, light: false }, nonwoven: true })
  c = codes(list)
  ok('⑬ ★부직포가 붙으면 「자리를 피해 글자를 옮긴다」가 뜬다', c.indexOf('nonwoven-avoid') >= 0, c.join(','))
  // 부직포(밴드 0)엔 봉미싱이 없다 — 봉미싱 확인 항목이 뜨면 사람이 없는 것을 찾는다(2026-09-23)
  const nwc = codes(R.build({ mode: 'plate', bleed: b, edge: {}, nonwoven: true, trace: { bandCount: 0, nonwovenCm: 7 } }))
  ok('⑬-b ★부직포(밴드 0)면 봉미싱 확인 항목이 안 뜬다', nwc.indexOf('sew-confirm') < 0 && nwc.indexOf('nonwoven-cm') >= 0, nwc.join(','))

  ok('⑭ must 가 check 보다 위에 온다', list[0].level === 'must', JSON.stringify(list.map((x) => x.level)))
  ok('⑮ 같은 code 가 두 번 나오지 않는다', new Set(c).size === c.length, c.join(','))
}

// ── ④ 도련이 자동으로 안 되면 **조용히 넘어가지 않는다**
{
  const skip = R.planBleed({ design, panel, edge: { solid: false, outside: false }, allowRepeat: false })
  const c = codes(R.build({ mode: 'plate', bleed: skip, edge: { solid: false, light: false } }))
  ok('⑯ ★도련 skip 은 must 로 올라온다', c.indexOf('bleed-skip') >= 0, c.join(','))

  const rep = R.planBleed({ design, panel, edge: { solid: false, outside: false } })
  const c2 = codes(R.build({ mode: 'plate', bleed: rep, edge: { solid: false, light: false } }))
  ok('⑰ 래스터로 채운 것도 확인 항목으로 남는다', c2.indexOf('bleed-repeat') >= 0, c2.join(','))
}

// ── ⑤ 연한 바탕 — 재단선
{
  const b = R.planBleed({ design, panel, edge: { solid: true, color: [0, 0, 0, 0] } })
  const c = codes(R.build({ mode: 'plate', bleed: b, edge: { solid: true, light: true } }))
  ok('⑱ ★바탕이 연하면 재단선이 must 로 뜬다', c.indexOf('cut-mark-needed') >= 0, c.join(','))
  const c2 = codes(R.build({ mode: 'plate', bleed: b, edge: { solid: true, light: false } }))
  ok('⑲ 자가시험 — 연하지 않으면 사라진다', c2.indexOf('cut-mark-needed') < 0, c2.join(','))
}

// ── ⑥ 윈드 — frame.plan 의 목록이 그대로 실린다
{
  const f = F.lookup({ type: 'S', specW: 700, specH: 2800 }).frame
  const fp = F.plan({ frame: f })
  const c = codes(R.build({ mode: 'frame', framePlan: fp }))
  ok('⑳ ★라운드 7cm 바이어스 / 글씨 4cm 가 실린다', c.indexOf('bias-7cm') >= 0, c.join(','))
  ok('㉑ ★윈드 재단선은 점선 없이 항목이 실린다', c.indexOf('cut-mark-solid') >= 0, c.join(','))
  ok('㉒ 윈드에는 가로등 전용 항목(점선 재단선)이 안 섞인다', c.indexOf('cut-mark-dashed') < 0, c.join(','))
}

// ── ⑦ 작업지시서 축 — 인수인계 대조로 새로 들어온 입력들 (2026-09-18)
{
  const b = R.planBleed({ design, panel, edge: { solid: true, color: [0, 0, 100, 0] } })
  const mk = (over) => codes(R.build(Object.assign({ mode: 'plate', bleed: b, edge: {} }, over)))

  const hw = mk({ trace: { hardware: { size: 5, holes: 4 } } })
  ok('㉕ ★하도매 구 수가 있으면 「직접 넣는다」가 must 로 뜬다', hw.indexOf('hardware-holes') >= 0, hw.join(','))
  ok('㉖ 자가시험 — 구 수가 0이면 사라진다',
    mk({ trace: { hardware: { size: 5, holes: 0 } } }).indexOf('hardware-holes') < 0)

  const nw = mk({ trace: { nonwovenCm: 7 } })
  ok('㉗ 부직포 cm 를 고르면 그 값이 확인 목록에 실린다', nw.indexOf('nonwoven-cm') >= 0, nw.join(','))

  const sn = mk({ trace: { sidesNote: '3면쌍침인데 밴드가 상·하 둘이다 — 면 수를 확인하라' } })
  ok('㉘ 면 수와 밴드가 어긋나면 알린다', sn.indexOf('sides-band') >= 0, sn.join(','))

  // 원단별 재단선 두께가 문구에 실리는가
  const lp = R.build({ mode: 'plate', bleed: b, edge: { solid: true, light: true }, trace: { fabric: '매쉬' } })
  const msg = (lp.filter((x) => x.code === 'cut-mark-needed')[0] || {}).msg || ''
  ok('㉙ ★연한 바탕이면 원단별 재단선 두께를 알려 준다', /매쉬/.test(msg) && /0\.08PT/.test(msg), msg)
}

// ── ⑧ 저장 관문
{
  const skip = R.planBleed({ design, panel, edge: { solid: false, outside: false }, allowRepeat: false })
  const list = R.build({ mode: 'plate', bleed: skip, edge: { solid: false, light: true } })
  ok('㉓ must 개수를 셀 수 있다(저장 전 관문용)', R.mustCount(list) >= 2, R.mustCount(list))
  ok('㉔ 빈 목록은 0', R.mustCount([]) === 0)
}

console.log('\n' + '='.repeat(58))
console.log(fail ? `실패 ${fail} / 전체 ${pass + fail}` : `전 항목 통과 (${pass})`)
process.exit(fail ? 1 : 0)
