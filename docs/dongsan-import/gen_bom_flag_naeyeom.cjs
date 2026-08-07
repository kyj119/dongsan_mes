/**
 * BOM 미연결 기류(旗類) → 나염(T/P) 원단 원가 추정 (2026-08-07)
 *
 * 전제가 하나 확정됐다 — **나염은 외주이고 정운교역에서 해온다**(용준님 2026-08-07).
 *   정운교역 매입의 `T/P` 계열이 곧 나염품이고, `PONGEE 열승화`(전사용 폰지)와 같은 거래처다.
 *   ⇒ §5-7-b 에서 폰지(전사)로 잡았던 건 **공정을 틀린 것**이고 철회했다. 여기서는 나염으로 다시 세운다.
 *
 * 남은 문제: 이 규격들의 **2026-01~07 매입이 0건**이다.
 *   그런데 정운교역에는 「2025년말 이월 채무 **299,984,520**」이 있다 — 전년에 대량으로 사둔 정황이고,
 *   태극기 계절 진폭이 4.2배라 미리 확보하는 게 자연스럽다.
 *   ⇒ 실제 원가는 **2025년 매입 단가**다. 여기서 내는 값은 **2026 단가 곡선 기준 대체원가 추정**이다.
 *
 * ★ 단가 곡선 — 정운교역 T/P 실측 17건에서 나온다. 롤 폭에 거의 정확히 비례한다.
 *     51"  1,210·1,250·1,310 | 51.5" 1,210 | 53" 1,210 | 53.5" 1,206
 *     55"  1,270·1,370·1,370 | 61"  1,400·1,400 | 65" 1,400·1,416 | 67" 1,450
 *     75"  3,500             | 80"  3,700
 *   원/yd ÷ 롤cm 를 내면 51~67" 구간이 8.5~9.7 (중앙 9.0), 75~80" 가 18.2~18.4 (중앙 18.3).
 *   **광폭(≥75")에서 정확히 2배로 튄다.** 그래서 구간 두 개짜리 계단식으로 쓴다.
 *   (54" 2,300 = 해군기 `75D` 특수 소재라 곡선에서 제외했다)
 *
 * 배치 모델은 §5-7 과 동일 — 롤·방향 조합 중 **장당 원가가 가장 싼 것**.
 * 제외: 폭이 최대 롤(80"=203.2cm)에도 안 들어가는 대형기(이어붙임) · 자수/본염(공정 다름)
 *
 * 사용: node docs/dongsan-import/gen_bom_flag_naeyeom.cjs <nobom_prod.json>
 */
const fs = require('fs')
const IN = 2.54, YD = 91.44
const ROLL_IN = [51, 51.5, 53, 53.5, 55, 60, 61, 65, 67, 75, 80]
const WON_PER_CM_YD = (inch) => (inch >= 75 ? 18.3 : 9.0)
const EXCL = /자수|본염|근조/

function best(w, h) {
  let b = null
  for (const inch of ROLL_IN) {
    const roll = inch * IN
    const rate = roll * WON_PER_CM_YD(inch)          // 원/yd
    for (const [across, along] of [[w, h], [h, w]]) {
      const n = Math.floor(roll / across)
      if (n < 1) continue
      const yd = (along / YD) / n
      const cost = yd * rate
      if (!b || cost < b.cost) b = { inch, roll, rate, n, across, along, yd, cost }
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
  if (!b) { skip.push([r.ic, r.nm, r.amt, `폭 ${w}cm — 최대 롤 80"(203cm) 초과, 이어붙임`]); continue }
  link.push({ ic: r.ic, nm: r.nm, spec: w + '×' + h, inch: b.inch, lay: b.n + '벌×' + b.across + 'cm',
    rate: Math.round(b.rate), yd: +b.yd.toFixed(4), unit: Math.round(b.cost),
    q: r.q, amt: r.amt, cost: Math.round(b.cost * r.q), ratio: 100 * b.cost * r.q / r.amt })
}
link.sort((a, b) => b.amt - a.amt)

const A = link.reduce((s, r) => s + r.amt, 0), C = link.reduce((s, r) => s + r.cost, 0)
console.error(JSON.stringify({ link, skip, A, C }))

const out = [
  '-- BOM 미연결 기류 → 나염(T/P) 원단 원가 추정 (2026-08-07)',
  '-- 생성기 = docs/dongsan-import/gen_bom_flag_naeyeom.cjs (곡선·근거는 그 파일 헤더)',
  '-- 공정 확정: 나염 외주 = **정운교역**(용준님). 단가는 정운교역 T/P 실측 17건 곡선(롤cm × 9.0 / 광폭 18.3).',
  '-- ⚠️ 이 규격들은 2026 매입이 0건이라 **2025년 재고 소진**으로 본다(정운교역 2025년말 이월채무 3.0억).',
  '--    따라서 이 값은 실매입가가 아니라 **2026 단가 기준 대체원가**다.',
  '-- 원단 품목이 없으므로 items.avg_unit_cost 에 **완제품 원단원가**로 직접 넣는다',
  '--    (product_materials 는 대응 원단 품목이 있어야 하는데 미매입이라 만들 수 없다).',
  '-- 롤백 = docs/dongsan-import/rollback_bom_flag_naeyeom.sql',
  '',
]
const rb = ['-- 나염 기류 원가 추정 롤백 (2026-08-07) — 적용 전 전부 0 이었다', '']
for (const r of link) {
  const note = `나염 원단원가 추정 2026-08-07 · 정운교역 T/P 곡선(${r.inch}" ${r.rate}원/yd) · ${r.lay} · ${r.yd}yd/장 → ${r.unit}원/장 · ★2026단가 기준 대체원가(실매입은 2025 재고)`
  out.push(`UPDATE items SET avg_unit_cost = ${r.unit}, updated_at = CURRENT_TIMESTAMP,`
    + ` description = COALESCE(NULLIF(description,''),'') || ' · ${note}'`
    + ` WHERE item_code = '${r.ic}';  -- ${r.nm}`)
  rb.push(`UPDATE items SET avg_unit_cost = 0 WHERE item_code = '${r.ic}';`)
}
fs.writeFileSync('docs/dongsan-import/load/bom_flag_naeyeom.sql', out.join('\n') + '\n')
fs.writeFileSync('docs/dongsan-import/rollback_bom_flag_naeyeom.sql', rb.join('\n') + '\n')
