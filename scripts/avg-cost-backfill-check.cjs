/**
 * `docs/price/backfill_avg_cost.sql` 재실행 시뮬레이션 — **돌리기 전에 이걸 먼저 본다.**
 *
 * ★ 왜 필요한가 (2026-08-27)
 *   backfill 은 `SUM(amount)/SUM(quantity)` 로 원가를 덮어쓴다. 그런데 2026-08-19~20 의
 *   **base 리베이스**가 `items.avg_unit_cost` 축을 관리단위(롤)에서 **base_unit(yd·M)** 으로 내렸다.
 *   backfill 은 그걸 모른다 — `poi.quantity` 는 여전히 **롤 수**라 나눗셈이 「롤 단가」를 낸다.
 *   실측: 원단 43품목이 전부 **정확히 pack_size 배**(50배) 튀었다(`FLEXN-130` 2,080 → 110,964).
 *   backfill 마지막 실행은 08-07, 리베이스는 08-19~20 → **리베이스 이후 한 번도 안 돌았다.**
 *   그대로 돌렸으면 재고 평가액이 6,147만에서 30억으로 갔다.
 *
 *   두 번째 오차원: **뭉친 전표 라인**(수량 1 · 단가=금액)이 분모에 1 로 들어간다.
 *   `ACC-051` 22,000 → 25,575(+16%) · `ACC-053` 11,000 → 14,545(+32%).
 *
 * ⇒ 수정 공식 두 축 (SQL 정본에 반영됨):
 *     ① 분모를 base 축으로 환산 — `quantity × packFactor` (`src/utils/unitConvert.ts` 정본)
 *     ② **수량 라인이 하나라도 있는 품목**에서만 뭉침 라인을 뺀다
 *        (⛔전량 `quantity>1` 은 안 된다 — 1롤씩 사는 품목은 수량 1 이 정상이라 원가가 통째로 날아간다.
 *          「뭉침만」 112품목이 그 무리다. 그쪽은 근거가 없으므로 **현행 유지 + 하드 제외 목록**.)
 *
 * ⚠️이 스크립트는 **읽기 전용**이다. 값을 바꾸지 않는다.
 *
 * 사용:
 *   node scripts/avg-cost-backfill-check.cjs            # 요약 + 바뀔 품목
 *   node scripts/avg-cost-backfill-check.cjs --all      # 전량 나열
 *   node scripts/avg-cost-backfill-check.cjs --local
 */
const { spawnSync } = require('child_process')

const argv = process.argv.slice(2)
const REMOTE = argv.includes('--local') ? '--local' : '--remote'
const ALL = argv.includes('--all')
const TOL = 0.05 // 5% 이내는 매입 시점 차이로 본다

// SQL 정본과 **같은 식**이어야 한다 — 다르면 이 검사가 거짓말을 한다.
const PF = `(CASE WHEN i.base_unit IS NOT NULL AND i.base_unit <> i.unit
                   AND COALESCE(i.pack_size, 0) > 0 THEN i.pack_size ELSE 1 END)`

const won = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString())

function d1(sql) {
  const r = spawnSync(
    `npx wrangler d1 execute webapp-production ${REMOTE} --json --command "${sql.replace(/"/g, '\\"').replace(/\s+/g, ' ').trim()}"`,
    { shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
  if (r.error) { console.error('[avgcost] wrangler 오류: ' + r.error.message); process.exit(2) }
  const out = r.stdout || ''
  const i = out.lastIndexOf('\n[\n')
  const body = i >= 0 ? out.slice(i + 1) : out.slice(out.indexOf('['))
  try {
    const p = JSON.parse(body)
    if (!Array.isArray(p) || !p[0] || !p[0].results) throw new Error('shape')
    return p[0].results
  } catch (e) {
    console.error('[avgcost] 응답 파싱 실패:\n' + out.slice(0, 800)); process.exit(2)
  }
}

const rows = d1(`SELECT item_code, item_name, cost, v_now,
    CASE WHEN qn > 0 THEN ROUND(a_qty * 1.0 / NULLIF(q_qty, 0), 2)
         ELSE ROUND(a_all * 1.0 / NULLIF(q_all, 0), 2) END v_fix,
    qn, ln, pf
  FROM (
    SELECT i.item_code, i.item_name, CAST(i.avg_unit_cost AS REAL) cost, ${PF} pf,
      ROUND(SUM(p.amount) * 1.0 / NULLIF(SUM(p.quantity), 0), 2) v_now,
      SUM(p.amount) a_all, SUM(p.quantity * ${PF}) q_all,
      SUM(CASE WHEN p.quantity > 1 THEN p.amount ELSE 0 END) a_qty,
      SUM(CASE WHEN p.quantity > 1 THEN p.quantity * ${PF} ELSE 0 END) q_qty,
      SUM(CASE WHEN p.quantity > 1 THEN 1 ELSE 0 END) qn,
      SUM(CASE WHEN p.quantity = 1 THEN 1 ELSE 0 END) ln
    FROM items i
      JOIN purchase_order_items p ON p.item_id = i.id AND p.unit_price > 0 AND p.quantity > 0
    WHERE i.is_active = 1
    GROUP BY i.id
  ) ORDER BY item_code`)

const gap = (v, c) => (c > 0 && v ? Math.abs(v - c) / c : 0)
const nowBad = rows.filter((r) => gap(r.v_now, r.cost) > TOL)
const fixBad = rows.filter((r) => gap(r.v_fix, r.cost) > TOL)
const packHit = rows.filter((r) => r.pf > 1 && gap(r.v_now, r.cost) > TOL && gap(r.v_fix, r.cost) <= TOL)
const lumpOnly = fixBad.filter((r) => r.qn === 0)

console.log(`\n■ backfill 재실행 시뮬레이션 — 매입 보유 활성품목 ${rows.length}`)
console.log(`   현행 공식이 현재값과 ${TOL * 100}% 넘게 어긋남 : ${nowBad.length}품목`)
console.log(`   수정 공식(base 환산 + 혼재 뭉침 제외)        : ${fixBad.length}품목`)
console.log(`   └ 그중 base 환산만으로 해결된 것             : ${packHit.length}품목 (pack_size 배 오류)`)

if (lumpOnly.length) {
  console.log(`\n■ 「뭉침만」 ${lumpOnly.length}품목 — **backfill 대상이 아니다(현재 값 그대로 보존)**`)
  console.log('   수량 라인이 하나도 없어 실단가를 알 길이 없다. 아래 「공식」은 돌렸다면 나왔을 값 —')
  console.log('   그래서 대상에서 뺀다. 청구서로 실수량이 서면 자동으로 대상이 된다.\n')
  for (const r of lumpOnly) {
    console.log(`   ${String(r.item_code).padEnd(22)} 현재 ${won(r.cost).padStart(10)}  ≠  공식 ${won(r.v_fix).padStart(12)}  (뭉침 ${r.ln}행)`)
  }
}

const rest = fixBad.filter((r) => r.qn > 0)
if (rest.length) {
  console.log(`\n■ 수량 라인이 있는데도 어긋나는 ${rest.length}품목 — 판단 필요(수동 보정값 vs 매입 가중평균)`)
  for (const r of (ALL ? rest : rest.slice(0, 15))) {
    const pct = Math.round((r.v_fix / r.cost - 1) * 100)
    console.log(`   ${String(r.item_code).padEnd(22)} 현재 ${won(r.cost).padStart(10)}  →  공식 ${won(r.v_fix).padStart(12)}  (${pct > 0 ? '+' : ''}${pct}% · 수량 ${r.qn}행)`)
  }
  if (!ALL && rest.length > 15) console.log(`   … 외 ${rest.length - 15}품목 (--all 로 전량)`)
}

console.log(`\n⚠️ 재실행은 재고 평가액을 바꾼다. 위 목록을 용준님과 확인한 뒤에만 돌린다.`)
console.log(`   정본 SQL = docs/price/backfill_avg_cost.sql · 롤백 = 실행 전 값 백업 필수\n`)
