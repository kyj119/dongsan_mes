/**
 * 주문 라인 → 전사 패널 입력 매핑 하네스 — `npm run cut:trorder`
 *
 * 검증 대상 = 패널의 `js/tr-order.js` **그 파일**(검증한 코드 = 배포된 코드).
 *
 * ★이 게이트가 보는 것 = 「채웠는가」가 아니라 **「모르는 것을 채우지 않고 말하는가」**다.
 *   주문서 값이 패널로 흐르는 길이 생기면, 틀린 값이 조용히 판이 된다(§조용한 격하).
 *   그래서 채운 것·기본값·못 채운 것이 따로 세어지는지, 그리고 결과가 실제로 판 산식(plate.js)을 통과하는지 본다.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const PANEL = path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js')
const load = (f) => import('file://' + path.join(PANEL, f).replace(/\\/g, '/'))

await load('plate-rules.js')
await load('plate.js')
await load('tr-order.js')
const R = globalThis.MesPlateRules
const P = globalThis.MesPlate
const O = globalThis.MesTrOrder

let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name) }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '   ← ' + extra : '')) }
}
const keys = (o) => Object.keys(o || {}).sort().join(',')
const dkeys = (r) => r.defaulted.map((d) => d.key).sort().join(',')

console.log('\n주문 라인 → 전사 입력 (js/tr-order.js)\n' + '='.repeat(58))

// 표준 가로등 라인 — 주문서에 전부 입력된 경우
const full = {
  order_number: 'SO-260923-001', client_name: '고양 소노', item_name: '전사 가로등배너 폰지 60×180', item_code: 'TRB-PO-180',
  sub_category: '가로등배너', width: 60, height: 180, quantity: 40, unit: 'EA', sales_unit: '조', sales_qty: 20, unit_factor: 2,
  finishing: JSON.stringify({ top: '봉미싱', top_cm: 5, left: '쌍침', right: '쌍침', bottom: '쌍침' }),
  post_processing: JSON.stringify([
    { code: 'PP-GROMMET', name: '하도매', params: { size: '5호', top: 2, side: 3 } },
    { code: 'PP-LOOP', name: '끈고리', params: { top: '넣음', mid: '넣음', bottom: '없음' } },
  ]),
}

// ── ① 전부 채워진 라인
{
  const r = O.mapLine(full, R)
  ok('① 가로등 라인을 받는다', r.ok, r.notes.join(' / '))
  ok('② 규격 60×180 · 판매단위 조 → 2벌', r.fields.specW === 60 && r.fields.specH === 180 && r.fields.vup === 2, JSON.stringify(r.fields))
  ok('③ 원단 = 품목코드 TRB-PO → 폰지', r.fields.fabric === '폰지')
  ok('④ 봉재 쌍침 · 3면(좌·우·하단)', r.fields.seam === '쌍침' && r.fields.sides === 3)
  ok('⑤ 마감 = 상단 봉미싱 · cm 5', r.fields.band === 'top' && r.fields.sewCm === 5)
  ok('⑥ 하도매 5호 · 상단 2 · 측면 3', r.fields.hwSize === 5 && r.fields.hwTop === 2 && r.fields.hwSide === 3)
  ok('⑦ 끈고리 상·중 켜짐 · 하 꺼짐', r.fields.loops.top === true && r.fields.loops.mid === true && r.fields.loops.bottom === false)
  ok('⑧ ★기본값으로 둔 것이 없다(전부 주문서 값)', r.defaulted.length === 0, dkeys(r))
  ok('⑨ 채운 키를 센다', r.filled.length >= 11, r.filled.join(','))
  // 결과가 실제 산식을 통과하는가
  const pl = P.computePlate({
    specW: r.fields.specW * 10, specH: r.fields.specH * 10, vup: r.fields.vup, seam: r.fields.seam, sewSides: r.fields.sides,
    band: r.fields.band, sewCm: r.fields.sewCm, media: Object.keys(R.RULES.media)[0], fabric: r.fields.fabric,
    holesTop: r.fields.hwTop, holesSide: r.fields.hwSide, loops: r.fields.loops,
  })
  ok('⑩ ★매핑 결과로 판이 만들어진다(1294×1920.24 · 벌당 하도매 4구 · 끈고리 상+중 2 · 접는선 2)', pl.ok && pl.plate.w === 1294 && pl.holes.length === 8 && pl.loops.length === 4 && pl.folds.length === 4,
    pl.ok ? JSON.stringify({ plate: pl.plate, holes: pl.holes.length, loops: pl.loops.length }) : pl.reason)
  ok('⑪ 피커 표기에 주문번호·거래처·규격·수량단위가 들어간다', /SO-260923-001 · 고양 소노 · .*60×180 · 20조/.test(O.label(full)), O.label(full))
}

// ── ② 상하단 · 부직포 · 옛 하도매
{
  const tb = O.mapLine(Object.assign({}, full, { finishing: JSON.stringify({ top: '봉미싱', top_cm: 6, bottom: '봉미싱', bottom_cm: 6, left: '쌍침', right: '쌍침' }) }), R)
  ok('⑫ 상·하 봉미싱 → topbottom · cm 6 · 2면', tb.fields.band === 'topbottom' && tb.fields.sewCm === 6 && tb.fields.sides === 2, JSON.stringify(tb.fields))
  const tb2 = O.mapLine(Object.assign({}, full, { finishing: JSON.stringify({ top: '봉미싱', top_cm: 5, bottom: '봉미싱', bottom_cm: 6, left: '쌍침', right: '쌍침' }) }), R)
  ok('⑬ 상·하 cm 이 다르면 상단값을 쓰고 말한다', tb2.fields.sewCm === 5 && tb2.notes.some((n) => /다르다/.test(n)), tb2.notes.join(' / '))

  const nw = O.mapLine(Object.assign({}, full, {
    finishing: JSON.stringify({ left: '쌍침', right: '쌍침', bottom: '쌍침' }),
    post_processing: JSON.stringify([{ code: 'PP-NONWOVEN', name: '부직포/바이어스', params: { type: '부직포', size: 7 } }]),
  }), R)
  ok('⑭ 부직포 7 → nonwoven7 · 봉미싱 cm 없음 · 하도매/끈고리는 기본값으로 세어진다', nw.fields.band === 'nonwoven7' && nw.fields.sewCm === undefined
    && dkeys(nw) === 'hwSide,hwTop,loops', JSON.stringify(nw.fields) + ' ' + dkeys(nw))
  const nw12 = O.mapLine(Object.assign({}, full, {
    finishing: JSON.stringify({ left: '쌍침', right: '쌍침', bottom: '쌍침' }),
    post_processing: JSON.stringify([{ code: 'PP-NONWOVEN', name: '부직포/바이어스', params: { type: '부직포', size: 12 } }]),
  }), R)
  ok('⑮ ★부직포 12 는 목록에 없어 마감을 채우지 않고 말한다', nw12.fields.band === undefined && nw12.notes.some((n) => /12cm/.test(n)), nw12.notes.join(' / '))

  const legacy = O.mapLine(Object.assign({}, full, { post_processing: JSON.stringify([{ code: 'PP-GROMMET', name: '하도매', params: { size: '5호', holes: '4구' } }]) }), R)
  ok('⑯ 옛 「4구」는 상단 2·측면 3 으로 두고 기본값으로 센다', legacy.fields.hwTop === 2 && legacy.fields.hwSide === 3 && legacy.defaulted.some((d) => d.key === 'hwTop' && /4구/.test(d.why)))
  const legacy2 = O.mapLine(Object.assign({}, full, { post_processing: JSON.stringify([{ code: 'PP-GROMMET', name: '하도매', params: { size: '5호', holes: '2구' } }]) }), R)
  ok('⑰ 옛 「2구」는 상단 2·측면 0', legacy2.fields.hwTop === 2 && legacy2.fields.hwSide === 0)
  const nine = O.mapLine(Object.assign({}, full, { post_processing: JSON.stringify([{ code: 'PP-GROMMET', name: '하도매', params: { size: '9호', top: 2, side: 0 } }]) }), R)
  ok('⑱ 9호는 규칙에 있어 채운다', nine.fields.hwSize === 9)
}

// ── ③ 모르는 것은 채우지 않고 말한다
{
  const ea = O.mapLine(Object.assign({}, full, { sales_unit: null, sales_qty: null, unit_factor: null }), R)
  ok('⑲ ★판매단위 스냅샷이 없으면(EA) 1벌로 두고 기본값으로 센다', ea.fields.vup === 1 && ea.defaulted.some((d) => d.key === 'vup' && /EA/.test(d.why)), JSON.stringify(ea.defaulted))
  const f2 = O.mapLine(Object.assign({}, full, { sales_unit: '세트', unit_factor: 2 }), R)
  ok('⑲-b 이름이 조가 아니어도 환산 2 면 2벌로 두고 말한다', f2.fields.vup === 2 && f2.defaulted.some((d) => d.key === 'vup' && /환산이 2/.test(d.why)))
  ok('⑲-c ★unit 열의 EA 는 근거가 아니다 — 판매단위 조가 이긴다', O.mapLine(Object.assign({}, full, { unit: 'EA', sales_unit: '조' }), R).fields.vup === 2)
  const bare = O.mapLine({ order_number: 'X', client_name: 'c', item_name: '전사 가로등배너', width: 60, height: 150, quantity: 2, unit: 'EA', sales_unit: '조', sales_qty: 1, unit_factor: 2, finishing: null, post_processing: null }, R)
  ok('⑳ ★마감이 없으면 band 를 채우지 않고 말한다', bare.ok && bare.fields.band === undefined && bare.notes.some((n) => /마감을 정하지 못했다/.test(n)), bare.notes.join(' / '))
  ok('㉑ 봉재가 없으면 seam·sides 를 채우지 않는다', bare.fields.seam === undefined && bare.fields.sides === undefined)
  ok('㉒ 원단을 못 읽으면 말한다', bare.fields.fabric === undefined && bare.notes.some((n) => /원단/.test(n)))
  const mixed = O.mapLine(Object.assign({}, full, { finishing: JSON.stringify({ top: '봉미싱', left: '쌍침', right: '오바' }) }), R)
  ok('㉓ 좌·우 봉재가 다르면 채우지 않고 말한다', mixed.fields.seam === undefined && mixed.notes.some((n) => /다르거나/.test(n)))
  const oldPreset = O.mapLine(Object.assign({}, full, { finishing: JSON.stringify({ top: '쌍침', left: '쌍침', right: '쌍침' }) }), R)
  ok('㉔ 옛 3면쌍침 프리셋(상단 쌍침)은 마감을 못 정하고 상단을 확인하라고 말한다', oldPreset.fields.band === undefined && oldPreset.notes.some((n) => /상단이/.test(n)))
  const wind = O.mapLine({ item_name: '윈드배너 S형', sub_category: '윈드배너', item_code: 'TRW-01', width: 70, height: 280 }, R)
  ok('㉕ ★가로등이 아닌 라인은 거절한다', wind.ok === false && /가로등배너 라인이 아니다/.test(wind.notes[0]))
  ok('㉖ 가로등 판정 — 소분류·품목명·코드 중 하나면 된다', O.isStreetlight({ sub_category: '가로등배너' }) && O.isStreetlight({ item_name: '가로등배너 60x180' }) && O.isStreetlight({ item_code: 'TRB-ME-150' }) && !O.isStreetlight({ item_name: '현수막' }))
  ok('㉗ finishing 이 객체로 와도 읽는다', O.mapLine(Object.assign({}, full, { finishing: { top: '봉미싱', top_cm: 5, left: '쌍침', right: '쌍침', bottom: '쌍침' } }), R).fields.band === 'top')
}

// ── ④ 설정 파일 경로는 재단과 같은 파일이어야 한다
{
  const fs = await import('node:fs')
  const cut = fs.readFileSync(path.join(PANEL, 'cut-main.js'), 'utf8')
  const m = cut.match(/CONFIG_PATH\s*=\s*'([^']+)'/)
  ok('㉘ ★config.json 경로가 재단(cut-main.js)과 같다', !!m && m[1] === O.CONFIG_PATH, (m && m[1]) + ' vs ' + O.CONFIG_PATH)
}

console.log('\n' + '='.repeat(58))
console.log(fail ? `실패 ${fail} / 전체 ${pass + fail}` : `전 항목 통과 (${pass})`)
process.exit(fail ? 1 : 0)
