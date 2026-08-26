/**
 * 뭉친 전표(수량 없는 매입) 명단 — 공급처별 추적표
 *
 * ★ 왜 필요한가 (2026-08-26)
 *   `audit:items` C2 가 「수량 1 · 단가=금액」인 매입 라인을 세어 준다. 그런데 **세는 것만으로는
 *   못 푼다** — 풀려면 공급처 청구서 실명세가 있어야 하고, 그건 사람이 공급처별로 받아 와야 한다.
 *   그래서 감사는 총량을 보고, 이 스크립트는 **누구에게 무엇을 요청해야 하는지**를 뽑는다.
 *
 *   해악이 드러나는 자리는 뭉친 품목이 아니라 **그 옆**이다:
 *     영광엔터테인먼트 깃대 대금이 `ACC-051`(우승기 부속) 월합계로 들어가 있는 동안
 *     정작 팔리는 `ACC-031`·`ACC-032`·`ACC-033` 는 **매입 라인이 0 건**이라 원가가 서지 않는다.
 *   그래서 이 보고서는 뭉친 라인과 함께 **그 공급처가 대던 무매입 판매품목**을 같이 붙인다.
 *
 * ⛔ 제외 — 외주가공 5종(용역이라 원래 수량이 없다 · 2026-08-26 용준님 확정)
 *          + 생산장비 `GDS-EQ-`(1 대 단위 매입이 정상)
 *
 * 사용:
 *   node scripts/lump-voucher-report.cjs                    # 요약 (공급처별)
 *   node scripts/lump-voucher-report.cjs --csv <경로>       # 라인 단위 CSV
 *   node scripts/lump-voucher-report.cjs --local
 */
const { spawnSync } = require('child_process')
const fs = require('fs')

const OEM_ITEMS = ['JG-IMGA-OEM', 'JG-OEM', 'SGM-GALVA-OEM', 'ACC-041-GA-PL', 'ACC-041-SU-PL']
const EXCLUDE = `i.item_code NOT LIKE 'GDS-EQ-%' AND i.item_code NOT IN (${OEM_ITEMS.map((c) => `'${c}'`).join(',')})`
// 「수량이 실수량이 아니다」의 서명 — 수량 1 이면서 단가가 곧 금액이다. 10만원 미만은 잡음이라 뺀다.
const LUMP = `p.quantity = 1 AND p.unit_price > 0 AND ABS(p.unit_price - p.amount) < 1 AND p.amount >= 100000`

const won = (n) => Number(n || 0).toLocaleString()

/**
 * 뭉친 전표 후보를 뽑아 **정상 매입을 걸러낸 뒤** 돌려준다.
 * ★ `audit:items` C2 도 이 함수를 쓴다 — 판정을 두 벌 두면 두 숫자가 갈린다.
 * @param d1 SQL 실행기(호출부의 것을 그대로 받는다 — local/remote 선택이 호출부에 있다)
 * @returns {{lines: object[], raw: object[], dropped: number}}
 */
function collectLumpLines(d1) {
// ── 라인 단위 ────────────────────────────────────────────────────────────
const raw = d1(`SELECT COALESCE(c.client_name,'(미지정)') supplier, po.supplier_id,
    i.item_code, i.item_name, i.item_type, po.entity_id, po.po_number,
    po.order_date, CAST(p.amount AS INT) amt,
    CAST((SELECT COALESCE(MAX(q.unit_price),0) FROM purchase_order_items q
          WHERE q.item_id = i.id AND q.quantity <> 1 AND q.unit_price > 0) AS INT) qmax
  FROM purchase_order_items p
    JOIN items i ON i.id = p.item_id
    JOIN purchase_orders po ON po.id = p.po_id
    LEFT JOIN clients c ON c.id = po.supplier_id
  WHERE i.is_active = 1 AND ${LUMP} AND ${EXCLUDE}
  ORDER BY po.supplier_id, i.item_code, po.order_date`)

// ★ `수량 1 · 단가=금액` 만으로는 뭉침이라 못 한다 — **1롤씩 사면 원래 그 모양이다**.
//   서울경금속 168행을 실측하니 시트 1롤 매입이었고 금액이 118,600·196,100 처럼 **반복**했다.
//   반복하는 금액은 뭉친 총액이 아니라 **실단가**다. 그래서 품목 단위로 두 가지를 본다:
//     ① 같은 금액이 2회 이상 나오고 그게 라인의 40% 이상 → 실단가 반복 = 정상 매입
//     ② 그 품목의 수량 있는 라인 최고단가의 3배 이내 → 스케일이 맞다 = 정상 매입
//   둘 다 아니면 뭉침 후보다(운산 421만 vs yd 910 · 영광엔터 월별 7건 전부 다른 금액).
const NORMAL = new Set()
const byItem = new Map()
for (const l of raw) {
  if (!byItem.has(l.item_code)) byItem.set(l.item_code, [])
  byItem.get(l.item_code).push(l)
}
for (const [code, ls] of byItem) {
  const freq = new Map()
  for (const l of ls) freq.set(l.amt, (freq.get(l.amt) || 0) + 1)
  const repeats = Math.max(...freq.values())
  const hi = Math.max(...ls.map((l) => l.amt))
  const qmax = ls[0].qmax
  if ((repeats >= 2 && repeats / ls.length >= 0.4) || (qmax > 0 && hi <= qmax * 3)) NORMAL.add(code)
}
const lines = raw.filter((l) => !NORMAL.has(l.item_code))
return { lines, raw, dropped: raw.length - lines.length }
}

module.exports = { collectLumpLines }
if (require.main !== module) return

// ── 이하 CLI ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const REMOTE = argv.includes('--local') ? '--local' : '--remote'
const csvAt = argv.indexOf('--csv')
const CSV_PATH = csvAt >= 0 ? argv[csvAt + 1] : null

function d1(sql) {
  const r = spawnSync(
    `npx wrangler d1 execute webapp-production ${REMOTE} --json --command "${sql.replace(/"/g, '\\"').replace(/\s+/g, ' ').trim()}"`,
    { shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
  if (r.error) { console.error('[lump] wrangler 오류: ' + r.error.message); process.exit(2) }
  const out = r.stdout || ''
  const i = out.lastIndexOf('\n[\n')
  const body = i >= 0 ? out.slice(i + 1) : out.slice(out.indexOf('['))
  try {
    const p = JSON.parse(body)
    if (!Array.isArray(p) || !p[0] || !p[0].results) throw new Error('shape')
    return p[0].results
  } catch (e) {
    console.error('[lump] 응답 파싱 실패:\n' + out.slice(0, 800)); process.exit(2)
  }
}

const { lines, raw, dropped } = collectLumpLines(d1)

// ── 그 계열에서 매입 라인이 0 건인 판매품목 ──────────────────────────────
// 뭉친 전표의 **진짜 피해자**다. 대금이 뭉침 품목에 다 붙어 있어 이쪽은 원가가 서지 않는다.
// 공급처로는 이을 수 없다(매입이 아예 없으니까) → **같은 품목계열(item_group)** 로 잡는다.
const codes = [...new Set(lines.map((l) => l.item_code))]
const groups = codes.length
  ? [...new Set(d1(`SELECT DISTINCT COALESCE(item_group,'') g FROM items
      WHERE item_code IN (${codes.map((c) => `'${c}'`).join(',')})`).map((r) => r.g).filter(Boolean))]
  : []
const orphans = groups.length ? d1(`SELECT i.item_code, i.item_name, COALESCE(i.item_group,'(미지정)') grp,
    (SELECT COUNT(*) FROM order_items o WHERE o.item_id = i.id) sn,
    CAST((SELECT COALESCE(SUM(o.amount),0) FROM order_items o WHERE o.item_id = i.id) AS INT) amt
  FROM items i
  WHERE i.is_active = 1 AND COALESCE(i.avg_unit_cost,0) = 0
    AND i.item_group IN (${groups.map((g) => `'${g.replace(/'/g, "''")}'`).join(',')})
    AND NOT EXISTS(SELECT 1 FROM purchase_order_items p WHERE p.item_id = i.id)
    AND NOT EXISTS(SELECT 1 FROM product_materials m WHERE m.product_item_id = i.id)
    AND EXISTS(SELECT 1 FROM order_items o WHERE o.item_id = i.id)
  ORDER BY amt DESC`) : []

// ── 보고 ─────────────────────────────────────────────────────────────────
const bySup = new Map()
for (const l of lines) {
  if (!bySup.has(l.supplier)) bySup.set(l.supplier, { n: 0, amt: 0, items: new Set(), from: l.order_date, to: l.order_date })
  const s = bySup.get(l.supplier)
  s.n++; s.amt += l.amt; s.items.add(l.item_code)
  if (l.order_date < s.from) s.from = l.order_date
  if (l.order_date > s.to) s.to = l.order_date
}
const total = lines.reduce((a, l) => a + l.amt, 0)

console.log(`\n■ 뭉친 전표(수량 없는 매입) — ${lines.length}행 · 품목 ${codes.length} · 공급처 ${bySup.size}곳 · ${won(total)}원`)
console.log('   청구서 실명세를 받아야 품목별로 쪼갤 수 있다. 금액 큰 공급처부터.')
console.log(`   ※ 후보 ${raw.length}행 중 ${dropped}행은 **반복 단가·스케일 정상**이라 제외했다(1롤씩 매입 등).\n`)
console.log('   공급처                     행   품목        금액        기간')
for (const [sup, s] of [...bySup].sort((a, b) => b[1].amt - a[1].amt)) {
  console.log(`   ${sup.padEnd(24)} ${String(s.n).padStart(4)} ${String(s.items.size).padStart(5)}  ${won(s.amt).padStart(12)}  ${s.from}~${s.to}`)
}

if (orphans.length) {
  const oamt = orphans.reduce((a, o) => a + o.amt, 0)
  console.log(`\n■ 그 계열에서 **매입 0건인 판매품목** — ${orphans.length}품목 · 판매 ${won(oamt)}원`)
  console.log('   대금이 뭉침 품목에 붙어 있어 원가가 서지 않는다. 위 청구서가 풀리면 여기가 채워진다.\n')
  for (const o of orphans.slice(0, 15)) {
    console.log(`   ${o.item_code.padEnd(20)} ${o.item_name.padEnd(24)} ${o.grp.padEnd(14)} 판매 ${String(o.sn).padStart(3)}행 ${won(o.amt).padStart(12)}원`)
  }
  if (orphans.length > 15) console.log(`   … 외 ${orphans.length - 15}품목`)
}

if (CSV_PATH) {
  const head = '공급처,법인,품목코드,품목명,유형,발주번호,일자,금액\n'
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const body = lines.map((l) => [l.supplier, l.entity_id, l.item_code, l.item_name, l.item_type, l.po_number, l.order_date, l.amt].map(q).join(',')).join('\n')
  fs.writeFileSync(CSV_PATH, '﻿' + head + body + '\n', 'utf8')   // BOM = 엑셀 한글 깨짐 방지
  console.log(`\n[lump] CSV → ${CSV_PATH} (${lines.length}행)`)
}
