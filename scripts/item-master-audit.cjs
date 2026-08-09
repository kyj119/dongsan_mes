#!/usr/bin/env node
/**
 * 품목 마스터 감사 — 규격 표기 규약 · 단위 혼재 · 건강 지표
 *
 * ★ 왜 필요한가 (2026-08-09, 하루치 사고에서 나왔다)
 *   `audit:new-items` 는 **중복**을 본다. 그런데 그날 터진 문제는 중복만이 아니었다:
 *     · 규격에 고정값이 섞여(`200mm*7m 진회색`) 매칭기가 `200mm` 와 다른 규격으로 봤다
 *       → 트러스바 계열이 「신설 후보」로 잘못 분류돼 **중복을 대량 등록할 뻔했다**
 *     · 같은 품목에 롤 단가(61,200)와 yd 단가(1,020)가 섞여 `avg_unit_cost` 가 무의미했다
 *     · 코드는 `MCP180-*` 인데 품명이 전부 「120g」이라 **품명 매칭이 전부 120g 으로 빨려 들어갔다**
 *     · 팔렸는데 `is_sales_item=0` 인 품목이 42개(778라인 118,959,380원) — 주문서 선택기에 안 보여
 *       다음에 같은 물건을 팔 때 **또 새 품목을 만들게 된다**
 *   전부 「나중에 원가가 이상하다」로 드러나는 종류다. 그전에 잡는 게 이 스크립트다.
 *
 * 검사 (A~D = 규약 위반 · E = 추세 지표)
 *   A 규격에 계열 고정값   `*7m`·`*3m` 처럼 형제 전원이 공유하는 값 (참고 — 롤 사양은 남기는 게 맞다)
 *   B 규격에 색상          색이 품명에도 규격에도 있다 (참고 — 규격이 완결적이면 둬도 된다)
 *   C 단가 스케일 혼재     한 품목의 매입 단가가 50배 이상 벌어진다 — 단위 혼재이거나 **금액전용 라인 혼입**
 *   D 품명↔코드 불일치     코드의 식별 토큰(180G·5T)이 품명과 어긋난다
 *   E 건강 지표            원가없음·규격없음·무실적·판매플래그 불일치 (절대값이 아니라 **추세**를 본다)
 *
 * ★ 등급을 나눈다 — **C·D 만 게이트(exit 1)**, A·B 는 참고(exit 0).
 *   A·B 를 게이트로 두면 매번 빨개져 감사 자체가 무뎌진다(기존 audit 들이 같은 이유로 강/약을 나눴다).
 *   실제로 A 는 `BUJIK-*` 의 `50m` 처럼 **남겨야 하는 롤 사양**까지 잡는다 — 「그 계열 전원이 공유한다」는
 *   기계적 사실일 뿐, 빼도 되는지는 사람이 안다(트러스바의 7m 는 빼도 되고 원단의 50m 는 아니다).
 *   C·D 는 다르다. 단가가 50배 벌어지거나 코드와 품명이 어긋난 건 **어느 경우에도 잘못**이다.
 *
 * 사용:
 *   npm run audit:items
 *   npm run audit:items -- --local
 *   npm run audit:items -- --metrics-only    # 지표만 (게이트 없이)
 */
const { spawnSync } = require('child_process')

const argv = process.argv.slice(2)
const REMOTE = argv.includes('--local') ? '--local' : '--remote'
const METRICS_ONLY = argv.includes('--metrics-only')

function d1(sql) {
  const r = spawnSync(
    `npx wrangler d1 execute webapp-production ${REMOTE} --json --command "${sql.replace(/"/g, '\\"').replace(/\s+/g, ' ').trim()}"`,
    { shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
  if (r.error) { console.error('[item-audit] wrangler 오류: ' + r.error.message); process.exit(2) }
  const out = r.stdout || ''
  const i = out.lastIndexOf('\n[\n')
  const body = i >= 0 ? out.slice(i + 1) : out.slice(out.indexOf('['))
  try {
    const p = JSON.parse(body)
    if (!Array.isArray(p) || !p[0] || !p[0].results) throw new Error('shape')
    return p[0].results
  } catch (e) {
    console.error('[item-audit] 응답 파싱 실패:\n' + out.slice(0, 800)); process.exit(2)
  }
}

const items = d1(`SELECT id, item_code, item_name, COALESCE(specification,'') sp,
  COALESCE(category,'') cat, COALESCE(unit,'') unit, COALESCE(avg_unit_cost,0) cost
  FROM items WHERE is_active = 1`)
console.log(`[item-audit] 활성 품목 ${items.length}`)

const violations = []
const add = (code, kind, msg) => violations.push({ code, kind, msg })

// ── A. 규격에 계열 고정값 ────────────────────────────────────────────────
// 「그 계열 전원이 같은 값」이면 규격에 넣어 봐야 구분에 기여하지 않는다.
// 계열 = 코드에서 마지막 세그먼트를 뗀 접두. 형제가 2 이상이고 **전원이 같은 조각**을 공유하면 고정값이다.
const famOf = (c) => String(c).split('-').slice(0, -1).join('-') || String(c)
const fam = new Map()
for (const it of items) {
  if (!fam.has(famOf(it.item_code))) fam.set(famOf(it.item_code), [])
  fam.get(famOf(it.item_code)).push(it)
}
// 규격을 조각으로 쪼갠다: `1.0T 100mm*3m` → ['1.0T','100mm','3m']
const parts = (sp) => String(sp).split(/[\s*×x]+/).map((t) => t.trim()).filter(Boolean)
for (const [f, list] of fam) {
  if (list.length < 2) continue
  const withSp = list.filter((i) => i.sp)
  if (withSp.length < 2) continue
  const sets = withSp.map((i) => new Set(parts(i.sp)))
  const common = [...sets[0]].filter((p) => sets.every((s) => s.has(p)))
  // 형제가 **하나뿐인 조각**만 남았으면 그게 유일한 식별자다 — 그건 고정값이 아니다.
  const varying = new Set()
  for (const s of sets) for (const p of s) if (!common.includes(p)) varying.add(p)
  if (!varying.size) continue          // 규격이 아예 안 갈리는 계열은 여기서 판단하지 않는다
  for (const p of common) {
    // 단위가 붙은 치수(3m·7m·100mm)만 고정값으로 본다. 색·재질 이름은 B 가 본다.
    if (!/^\d+(\.\d+)?(mm|cm|m|T)$/i.test(p)) continue
    for (const it of withSp) add(it.item_code, 'A 규격 고정값', `「${it.sp}」의 '${p}' 는 ${f}-* ${withSp.length}종 전원이 공유한다`)
    break
  }
}

// ── B. 규격에 색상 ───────────────────────────────────────────────────────
const COLORS = ['검정', '흑색', '백색', '진회색', '연회색', '그레이', '진청색', '연청색',
  '진핑크', '연핑크', '주황색', '형광색', '밤색', '옥색', '녹색', '적색', '황색', '금색', '연두', '은색']
for (const it of items) {
  const hit = COLORS.find((c) => it.sp.includes(c))
  // 품명에 이미 색이 있으면 규격의 색은 중복 표기다. 품명에 없으면 규격이 유일한 색 정보라 둔다.
  if (hit && it.item_name.includes(hit)) add(it.item_code, 'B 규격 색상', `「${it.sp}」의 '${hit}' 는 품명 「${it.item_name}」에 이미 있다`)
}

// ── C. 단위 혼재 ─────────────────────────────────────────────────────────
// 같은 품목의 매입 단가가 50배 이상 벌어지면 단위가 섞인 것이다(50m 롤 = 54.68yd).
const mixed = d1(`SELECT i.item_code, i.item_name,
    CAST(MIN(p.unit_price) AS INT) lo, CAST(MAX(p.unit_price) AS INT) hi, COUNT(*) n,
    COUNT(DISTINCT p.unit) units
  FROM purchase_order_items p JOIN items i ON i.id = p.item_id
  WHERE i.is_active = 1 AND p.unit_price > 0
  GROUP BY i.id HAVING MAX(p.unit_price) >= MIN(p.unit_price) * 50`)
// 원인은 둘 중 하나다 — ① 롤/yd 처럼 **단위가 섞였거나** ② 수량 없는 **금액전용 라인이 끼었거나**.
//   ②는 세무장부 전표에서 온다(「가로봉 진공증착 1 × 6,498,500」 = 도금 외주비). 수량 1 로 들어와
//   가중평균을 통째로 망가뜨린다 — 그 라인은 공정비지 그 자재의 단가가 아니다.
for (const m of mixed) add(m.item_code, 'C 단가 스케일 혼재',
  `매입 단가 ${Number(m.lo).toLocaleString()} ~ ${Number(m.hi).toLocaleString()} (${m.n}행·단위표기 ${m.units}종) — 단위 혼재 또는 금액전용 라인 혼입`)

// ── D. 품명↔코드 불일치 ──────────────────────────────────────────────────
// 코드에 든 식별 토큰(평량 180G · 두께 5T)이 품명과 어긋나면 품명 매칭이 엉뚱한 데로 간다.
for (const it of items) {
  const m = String(it.item_code).toUpperCase().match(/-?(\d{2,3})G\b|(\d+(?:\.\d+)?)T\b/)
  if (!m) continue
  if (m[1]) {           // 평량
    const inName = it.item_name.match(/(\d{2,3})\s*g\b/i)
    if (inName && inName[1] !== m[1]) add(it.item_code, 'D 품명 불일치', `코드는 ${m[1]}g 인데 품명은 「${it.item_name}」`)
  }
}

// ── 보고 ─────────────────────────────────────────────────────────────────
if (!METRICS_ONLY) {
  if (violations.length) {
    const byKind = new Map()
    for (const v of violations) {
      if (!byKind.has(v.kind)) byKind.set(v.kind, [])
      byKind.get(v.kind).push(v)
    }
    for (const [kind, list] of [...byKind].sort()) {
      const gate = /^[CD] /.test(kind)
      console.log(`\n${gate ? '⚠️  [게이트]' : '·   [참고] '} ${kind} — ${list.length}건`)
      const n = gate ? 20 : 6
      for (const v of list.slice(0, n)) console.log(`   ${v.code.padEnd(20)} ${v.msg}`)
      if (list.length > n) console.log(`   … 외 ${list.length - n}건`)
    }
    if (![...byKind.keys()].some((k) => /^[CD] /.test(k))) {
      console.log('\n[item-audit] ✅ 게이트 항목(C·D) 위반 없음 — 위는 판단이 필요한 참고 정보다')
    }
  } else {
    console.log('[item-audit] ✅ 규약 위반 없음 (A~D 전부)')
  }
}

// ── E. 건강 지표 — 절대값이 아니라 **추세**를 본다 ──────────────────────
// 0 으로 만들 필요는 없다. 늘어나면 이관이 뭔가를 흘리고 있다는 신호다.
const met = d1(`SELECT COUNT(*) total,
    SUM(CASE WHEN COALESCE(avg_unit_cost,0)=0 THEN 1 ELSE 0 END) no_cost,
    SUM(CASE WHEN COALESCE(specification,'')='' THEN 1 ELSE 0 END) no_spec,
    SUM(CASE WHEN NOT EXISTS(SELECT 1 FROM purchase_order_items p WHERE p.item_id=i.id)
          AND NOT EXISTS(SELECT 1 FROM order_items o WHERE o.item_id=i.id) THEN 1 ELSE 0 END) no_tx,
    SUM(CASE WHEN is_sales_item=0 AND EXISTS(SELECT 1 FROM order_items o WHERE o.item_id=i.id) THEN 1 ELSE 0 END) flag_sale,
    SUM(CASE WHEN is_purchase_item=0 AND EXISTS(SELECT 1 FROM purchase_order_items p WHERE p.item_id=i.id) THEN 1 ELSE 0 END) flag_buy
  FROM items i WHERE i.is_active=1`)[0]

// ★ 「원가 없음」을 뭉뚱그리면 겁만 준다 — 570 중 대부분이 **원가가 없는 게 정상**이다.
//   출력 제품은 원단을 사서 만들어 파는 것이라 `avg_unit_cost` 가 아니라 **BOM 롤업**이 원가다.
//   무실적 품목은 매트릭스를 채운 것이라 애초에 살 일이 없었다.
//   조치가 필요한 건 **매입도 BOM 도 없는데 팔린 것**뿐이다 — 그것만 따로 센다.
const cost = d1(`SELECT
    SUM(CASE WHEN pn > 0 THEN 1 ELSE 0 END) buy_zero,
    SUM(CASE WHEN pn = 0 AND sn > 0 AND bom > 0 THEN 1 ELSE 0 END) bom_ok,
    SUM(CASE WHEN pn = 0 AND sn > 0 AND bom = 0 THEN 1 ELSE 0 END) actionable,
    CAST(SUM(CASE WHEN pn = 0 AND sn > 0 AND bom = 0 THEN sales_amt ELSE 0 END) AS INT) actionable_amt,
    SUM(CASE WHEN pn = 0 AND sn = 0 THEN 1 ELSE 0 END) idle
  FROM (SELECT i.id,
      (SELECT COUNT(*) FROM purchase_order_items p WHERE p.item_id=i.id) pn,
      (SELECT COUNT(*) FROM order_items o WHERE o.item_id=i.id) sn,
      (SELECT COUNT(*) FROM product_materials m WHERE m.product_item_id=i.id) bom,
      (SELECT COALESCE(SUM(o.amount),0) FROM order_items o WHERE o.item_id=i.id) sales_amt
    FROM items i WHERE i.is_active=1 AND COALESCE(i.avg_unit_cost,0)=0)`)[0]

const pct = (n) => `${n} (${Math.round((n / met.total) * 100)}%)`
console.log('\n■ 건강 지표 — 추세용. 절대값 0 이 목표가 아니다')
console.log(`   활성 품목        ${met.total}`)
console.log(`   원가 없음        ${pct(met.no_cost)}`)
console.log(`     ├ 매입 있는데 0   ${cost.buy_zero}        backfill 미반영이거나 전표뭉치(수량이 실수량 아님)`)
console.log(`     ├ BOM 으로 냄     ${cost.bom_ok}        출력 제품 — avg_unit_cost 가 아니라 **BOM 롤업**이 원가다. 정상`)
console.log(`     ├ ★조치 필요      ${cost.actionable}        매입도 BOM 도 없는데 팔렸다 (판매 ${Number(cost.actionable_amt).toLocaleString()}원)`)
console.log(`     └ 무실적          ${cost.idle}        살 일이 없었다. 정상`)
console.log(`   규격 없음        ${pct(met.no_spec)}   매칭·필터가 갈린다`)
console.log(`   무실적           ${pct(met.no_tx)}   매입·판매 둘 다 0 — 선택기만 어지럽힌다`)
console.log(`   판매플래그 불일치 ${met.flag_sale}        팔렸는데 판매품목이 아니다`)
console.log(`   매입플래그 불일치 ${met.flag_buy}        샀는데 매입품목이 아니다`)
console.log('\n   ★ 플래그 불일치는 **즉시 고칠 것** — 선택기에 안 보여 같은 물건을 또 만들게 된다.')

// C·D 만 실패로 처리한다. A·B 는 판단이 필요한 참고 정보라 게이트로 두면 감사가 무뎌진다.
const hard = violations.filter((v) => /^[CD] /.test(v.kind))
process.exit(!METRICS_ONLY && hard.length ? 1 : 0)
