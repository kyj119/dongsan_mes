/**
 * BOM 미연결 기류(旗類) → 폰지 원단 연결 SQL 생성기 (2026-08-07)
 *
 * ★★ 결과는 **추론**이다. 용준님 확인 전이며 롤백 파일 한 방으로 되돌린다.
 *
 * 근거 3가지
 *  ① 매입 부재 — 이 제품들이 쓸 규격의 태극기 인쇄원단 매입이 **0건**이다.
 *     인쇄원단은 규격별로 정확히 매입되는데(60×90·90×135·80×120·120×180·150×225·180×270),
 *     민방위 60×90 · 노인회 · 만국기 · 무재해 · 태극기 6호(102×153)·4호-1(140×210)·8호-1(70×105) 은 없다.
 *  ② 폰지 여유 — 폰지 매입 139,213yd 중 전사 제품 소요 88,457yd → 여유 50,756yd.
 *     이 제품들을 전부 폰지 자사출력으로 만들었다면 10,450yd 필요 → 여유 안에 들어온다.
 *  ③ 원가율 밴드 — 결과가 7.9~37.5%(가중 29.5%)로 인쇄원단 제품(27~55%)보다 낮다.
 *     폰지(820원/yd)가 인쇄원단(1,206~3,500원/yd)보다 싸고 **잉크·공임이 빠져 있으니** 방향이 맞다.
 *
 * 배치 모델은 §5-7(태극기 인쇄원단)과 동일 — 롤·방향 조합 중 **장당 원가가 가장 싼 것**.
 * 제외: 폭 180 초과(태극기 1·2호·특호·대형 = 이어붙임 필요) · 자수/본염(공정이 다름)
 *
 * 사용: node docs/dongsan-import/gen_bom_flag_pongee.cjs <nobom_prod.json>
 *   nobom_prod.json = SELECT id, item_code ic, item_name nm, SUM(quantity) q, SUM(amount) amt,
 *                     AVG(MIN(width,height)) aw, AVG(MAX(width,height)) ah
 *                     — 태극기 분류 · product_materials 0행 · width 파싱된 라인
 */
const fs = require('fs')
const YD = 91.44
// [품목코드, 폭cm, 원/yd] — 실측 avg_unit_cost
const ROLL = [
  ['PONGE-085', 85, 570], ['PONGE-095', 95, 640], ['PONGE-130', 130, 820],
  ['PONGE-155', 155, 970], ['PONGE-180', 180, 1200],
]
const EXCL = /자수|본염|근조/

function best(w, h) {
  let b = null
  for (const [code, rw, rate] of ROLL) {
    for (const [across, along] of [[w, h], [h, w]]) {
      const n = Math.floor(rw / across)
      if (n < 1) continue
      const yd = (along / YD) / n
      const cost = yd * rate
      if (!b || cost < b.cost) b = { code, rw, rate, n, across, along, yd, cost }
    }
  }
  return b
}

const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const link = [], skip = []
for (const r of rows) {
  const w = Math.min(r.aw, r.ah), h = Math.max(r.aw, r.ah)
  if (EXCL.test(r.nm)) { skip.push([r.ic, r.nm, r.amt, '자수·본염(공정 다름)']); continue }
  const b = best(w, h)
  if (!b) { skip.push([r.ic, r.nm, r.amt, `폭 ${w}cm — 폰지 최대 180 초과(이어붙임)`]); continue }
  link.push({ ic: r.ic, nm: r.nm, spec: w + '×' + h, code: b.code, lay: b.n + '벌×' + b.across + 'cm',
    yd: +b.yd.toFixed(4), unit: Math.round(b.cost), q: r.q, amt: r.amt, cost: Math.round(b.cost * r.q) })
}
link.sort((a, b) => b.amt - a.amt)

const out = [
  '-- BOM 미연결 기류(旗類) → 폰지 원단 연결 (2026-08-07)',
  '-- 생성기 = docs/dongsan-import/gen_bom_flag_pongee.cjs (근거·모델은 그 파일 헤더)',
  '-- ★★ **추론이다.** 용준님 확인 전. 틀리면 rollback_bom_flag_pongee.sql 로 되돌린다.',
  '-- 롤백 = docs/dongsan-import/rollback_bom_flag_pongee.sql',
  '',
]
for (const r of link) {
  const note = `★추론(미확인) 자사 전사출력 가정 · ${r.lay} · 규격 ${r.spec} · ${r.unit}원/장 · 해당 규격 인쇄원단 매입 0건이라 폰지로 연결`
  out.push('INSERT INTO product_materials (product_item_id, material_item_id, quantity, usage_type, is_default, notes)'
    + ` SELECT p.id, m.id, ${r.yd}, 'FIXED_QTY', 1, '${note}'`
    + ` FROM items p, items m WHERE p.item_code = '${r.ic}' AND m.item_code = '${r.code}'`
    + ` AND NOT EXISTS (SELECT 1 FROM product_materials x WHERE x.product_item_id = p.id AND x.material_item_id = m.id);`
    + `  -- ${r.nm}`)
}
fs.writeFileSync('docs/dongsan-import/load/bom_flag_pongee.sql', out.join('\n') + '\n')

const codes = link.map(r => `'${r.ic}'`).join(', ')
fs.writeFileSync('docs/dongsan-import/rollback_bom_flag_pongee.sql',
  '-- 기류 → 폰지 BOM 연결 롤백 (2026-08-07)\n'
  + '-- 적용 전 이 제품들은 product_materials 가 0행이었다.\n'
  + `DELETE FROM product_materials WHERE product_item_id IN (SELECT id FROM items WHERE item_code IN (${codes}));\n`)

const A = link.reduce((s, r) => s + r.amt, 0), C = link.reduce((s, r) => s + r.cost, 0)
console.error(link.length + '행 연결 · 매출 ' + A.toLocaleString() + ' · 원가 ' + C.toLocaleString()
  + ' · 원가율 ' + (100 * C / A).toFixed(1) + '%')
console.error('제외 ' + skip.length + '건 · 매출 ' + skip.reduce((s, x) => s + x[2], 0).toLocaleString())
