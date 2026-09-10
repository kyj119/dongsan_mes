/**
 * 제품별 원가율 워크북 (.xlsx) 생성 — 「계산식」과 「근거」를 시트로 갈라 놓는다.
 *
 * 왜 갈랐나 — 단가를 다시 짜려면 두 가지가 따로 필요하다.
 *   ① **근거**: 실적이 실제로 얼마였는가(제품별·규격별 재료비율, 원단·잉크 단가).
 *      값만 있는 표라 그대로 읽으면 된다.
 *   ② **계산식**: 그 값이 어떤 산식에서 나왔는가. 이쪽은 **엑셀 수식으로 넣는다** —
 *      원단 단가나 규격을 바꾸면 원가·재료비율이 그 자리에서 다시 계산된다.
 *      숫자를 박아 두면 "이 단가면 얼마가 되나"를 물어볼 수 없다.
 *
 * ⚠️ 워크북은 **재료비**만 담는다. 로스(2026-07 실측 21.5%)·후가공(단가 미등록)·
 *    인건비·감가는 들어 있지 않다 — 「산식·주의」 시트에 그대로 적어 둔다.
 *    재료비율을 원가율로 읽으면 이익을 과대평가한다.
 *
 * 값의 출처는 **prod DB 그 자체**다(집계를 다시 쓰지 않는다):
 *   `order_items.material_cost/ink_cost/total_cost` = `utils/orderLineCost` 가 계산해 저장한 값.
 *   그 값이 낡았으면 `scripts/cost-backfill-run.cjs` 로 먼저 재계산할 것.
 *
 * 사용:
 *   node scripts/cost-rate-workbook.cjs                     # prod, docs/price/ 에 저장
 *   node scripts/cost-rate-workbook.cjs --local             # 로컬 D1
 *   node scripts/cost-rate-workbook.cjs --from 2026-01-01 --out C:/tmp/a.xlsx
 */
const { execFileSync } = require('child_process')
const path = require('path')
const { writeWorkbook, S, colRef } = require('./lib/xlsx-writer.cjs')

const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d
}
const LOCAL = process.argv.includes('--local')
const FROM = arg('from', '2026-01-01')
// KST 기준 날짜 — UTC 로 찍으면 오전 9시 이전에 만든 파일이 **어제 날짜**로 저장된다.
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
const OUT = arg('out', path.join('docs', 'price', `원가율_${today}.xlsx`))

/**
 * D1 조회. wrangler 를 그대로 부른다 — 집계 SQL 이 곧 근거라 스크립트 안에 남겨 둔다.
 * ⚠️ `npx.cmd` 를 execFile 로 부르면 Windows·Node 20+ 에서 spawn 이 실패한다(.cmd 직접 실행 차단).
 *    shell 을 켜면 SQL 의 따옴표·괄호가 셸 인용에 걸리므로, wrangler 진입 js 를 node 로 직접 실행한다.
 */
const WRANGLER = require.resolve('wrangler/bin/wrangler.js')
function q(sql) {
  const out = execFileSync(
    process.execPath,
    [WRANGLER, 'd1', 'execute', 'webapp-production', LOCAL ? '--local' : '--remote', '--json', '--command', sql],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
  const start = out.indexOf('[')
  const parsed = JSON.parse(start > 0 ? out.slice(start) : out)
  return parsed[0].results || []
}

const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v))

// ── 시트 뼈대 ────────────────────────────────────────────────────────────────
// 12장짜리 워크북이라 **장마다 생김새가 다르면 못 읽는다**. 모든 시트를 같은 골격으로 맞춘다:
//   1행 제목 · 2행 한 줄 설명 · 3행 경고(없으면 빈 줄) · **4행 표 머리글** · 5행부터 데이터.
// 머리글 행이 고정이라 고정틀(freeze)·필터·조건부서식 범위를 한 곳에서 계산할 수 있다.
const TOP = 4
const DATA = TOP + 1

/** 시트 머리 3줄. `warn` 은 없으면 빈 줄로 자리만 잡는다(행 번호를 고정해야 한다). */
function head(title, caption, warn) {
  return [
    [{ v: title, s: S.TITLE }],
    [{ v: caption, s: S.CAPTION }],
    warn ? [{ v: warn, s: S.WARN }] : [],
  ]
}

/**
 * 표 머리글. 숫자 열은 오른쪽 정렬한다 — 머리글과 값의 축이 어긋나면 눈이 표를 못 훑는다.
 * `num` = 숫자가 시작되는 열 번호(그 뒤 전부) 또는 숫자 열 번호 배열(중간에 글자가 섞일 때).
 */
function hdr(labels, num = 99) {
  const isNum = Array.isArray(num) ? (i) => num.includes(i) : (i) => i >= num
  return labels.map((v, i) => ({ v, s: isNum(i) ? S.HEADERR : S.HEADER }))
}

/**
 * 시트 공통 옵션 — 고정틀·필터·제목 병합·행 높이를 한 벌로 준다.
 * `titleRows` 는 표 폭만큼 병합할 머리 줄 수(기본 3). ⚠️「단가설계」처럼 머리 줄 안에
 * **입력 칸이 있는 시트는 1** 로 줄여야 한다 — 병합하면 그 칸을 못 쓴다.
 */
function sheetOpts(cols, hdrRow = TOP, extra = {}) {
  const last = colRef(cols - 1)
  const merges = []
  for (let r = 1; r <= (extra.titleRows ?? 3); r++) merges.push(`A${r}:${last}${r}`)
  const { titleRows, noFilter, ...rest } = extra
  return {
    freeze: hdrRow,
    autoFilter: noFilter ? undefined : hdrRow,
    merges,
    rowHeights: { 1: 24, [hdrRow]: 30 },
    ...rest,
  }
}

/** 탭 색 — 성격이 같은 시트끼리 묶어 둔다. */
const TAB = { SUM: 'FF1F3864', DESIGN: 'FF2E75B6', EVIDENCE: 'FF548235', PRICE: 'FFBF8F00', REF: 'FF808080' }

// ── 조회 ─────────────────────────────────────────────────────────────────────
console.log(`[1/6] 방식별 집계 (${LOCAL ? 'local' : 'prod'}, ${FROM}~)`)
const byCat = q(`
  SELECT i.category AS cat, COUNT(*) AS lines,
         SUM(CASE WHEN oi.total_cost>0 THEN 1 ELSE 0 END) AS costed,
         ROUND(SUM(oi.amount)) AS sales,
         ROUND(SUM(CASE WHEN oi.total_cost>0 THEN oi.amount ELSE 0 END)) AS sales_costed,
         ROUND(SUM(oi.material_cost)) AS mat, ROUND(SUM(oi.ink_cost)) AS ink,
         ROUND(SUM(oi.pp_cost)) AS pp, ROUND(SUM(oi.total_cost)) AS cost,
         ROUND(SUM(oi.width*oi.height/10000.0*oi.quantity)) AS sqm
  FROM order_items oi JOIN orders o ON oi.order_id=o.id JOIN items i ON oi.item_id=i.id
  WHERE o.order_date >= '${FROM}' AND i.category IS NOT NULL
  GROUP BY 1 ORDER BY sales DESC`)

console.log('[2/6] 제품별 집계')
const byItem = q(`
  SELECT i.category AS cat, i.item_code AS code, i.item_name AS name,
         i.pricing_method AS pm, i.base_price AS base,
         COUNT(*) AS lines, SUM(CASE WHEN oi.total_cost>0 THEN 1 ELSE 0 END) AS costed,
         ROUND(SUM(oi.amount)) AS sales,
         ROUND(SUM(CASE WHEN oi.total_cost>0 THEN oi.amount ELSE 0 END)) AS sales_costed,
         ROUND(SUM(oi.material_cost)) AS mat, ROUND(SUM(oi.ink_cost)) AS ink,
         ROUND(SUM(oi.total_cost)) AS cost
  FROM order_items oi JOIN orders o ON oi.order_id=o.id JOIN items i ON oi.item_id=i.id
  WHERE o.order_date >= '${FROM}'
  GROUP BY i.id HAVING SUM(oi.amount) > 0 ORDER BY sales DESC LIMIT 200`)

console.log('[3/6] 규격별 집계')
// 청구면적 = 10cm 올림 → 최소 1m(변). `utils/orderLineAmount` 의 규칙을 SQL 로 옮긴 것이라
// 품목별 `min_billing_side_cm` 예외(UV 판재 = 실규격 청구)는 반영되지 않는다 — 그 계열은 참고값이다.
const bySize = q(`
  SELECT i.category AS cat, i.item_code AS code, CAST(oi.width AS INT) AS w, CAST(oi.height AS INT) AS h,
         COUNT(*) AS lines, SUM(oi.quantity) AS qty, ROUND(SUM(oi.amount)) AS sales,
         ROUND(SUM((max((CAST((oi.width+9.9999)/10 AS INT))*10,100)/100.0)
                  *(max((CAST((oi.height+9.9999)/10 AS INT))*10,100)/100.0)*oi.quantity),1) AS bsqm,
         ROUND(SUM(oi.width*oi.height/10000.0*oi.quantity),1) AS rsqm,
         ROUND(SUM(oi.material_cost)) AS mat, ROUND(SUM(oi.ink_cost)) AS ink,
         ROUND(SUM(oi.total_cost)) AS cost
  FROM order_items oi JOIN orders o ON oi.order_id=o.id JOIN items i ON oi.item_id=i.id
  WHERE o.order_date >= '${FROM}' AND oi.total_cost > 0 AND oi.width > 0 AND oi.height > 0
  GROUP BY 1,2,3,4 HAVING COUNT(*) >= 3 ORDER BY sales DESC LIMIT 120`)

console.log('[4/8] 자재 단가표')
// 「쓰는제품」은 품목코드가 아니라 **분류별로 묶은 품목명**으로 낸다 — 코드는 사람이 못 읽는다.
// ⚠️ SQLite 의 GROUP_CONCAT 은 DISTINCT 와 커스텀 구분자를 함께 못 쓴다(구분자는 ','로 고정).
//    품목명에 쉼표가 들어가면 여기서 갈라지므로 분류 구분자는 '§' 를 따로 쓴다.
const mats = q(`
  SELECT m.item_code AS code, m.item_name AS name, m.item_group AS grp, m.width_mm AS w,
         m.avg_unit_cost AS cost, m.unit, m.base_unit AS bu, m.pack_size AS pack,
         COALESCE(m.deduction_method,'ROLL') AS dm,
         COUNT(DISTINCT p.id) AS used_by,
         GROUP_CONCAT(DISTINCT COALESCE(p.category,'기타') || '§' || p.item_name) AS products
  FROM items m JOIN product_materials pm ON pm.material_item_id = m.id
       JOIN items p ON p.id = pm.product_item_id
  GROUP BY m.id ORDER BY m.item_group, m.width_mm`)

/** "수성§수성 현수막,수성§수성 장폭 현수막,솔벤§…" → "수성: 수성 현수막 · 수성 장폭 현수막 / 솔벤: …" */
function groupProducts(raw) {
  if (!raw) return ''
  const byCat = new Map()
  for (const token of String(raw).split(',')) {
    const i = token.indexOf('§')
    if (i < 0) continue
    const cat = token.slice(0, i)
    const nm = token.slice(i + 1)
    if (!byCat.has(cat)) byCat.set(cat, [])
    if (!byCat.get(cat).includes(nm)) byCat.get(cat).push(nm)
  }
  return [...byCat.entries()].map(([c, ns]) => `${c}: ${ns.join(' · ')}`).join('  /  ')
}

console.log('[5/8] 장비·잉크·후가공')
// ★잉크는 **장비마다 다른 제품**이다(용준님 지적 2026-09-08). 품목 그룹이 이미 장비별로 갈려 있다 —
//   방식 하나에 ㎡단가 하나를 두면 그 안의 장비 차이가 통째로 평균된다.
const equipment = q(`
  SELECT id, name, COALESCE(printer_name,'') AS printer, size_type AS size, status
  FROM equipment ORDER BY status DESC, id`)
const inkItems = q(`
  SELECT COALESCE(item_group,'(무그룹)') AS grp, COUNT(*) AS items,
         ROUND(AVG(NULLIF(avg_unit_cost,0))) AS avg_cost,
         MAX(COALESCE(search_keywords,'')) AS kw
  FROM items WHERE item_name LIKE '%잉크%' OR item_group LIKE '%잉크%'
  GROUP BY 1 ORDER BY 1`)
// 매입 라인의 **품명 원문**을 함께 낸다 — 뭉친 전표는 거기에 「1 X 184,000」 같은 적요가 남아 있다.
const inkBuy = q(`
  SELECT COALESCE(m.item_group,'(미연결)') AS grp, COUNT(*) AS lines,
         ROUND(SUM(poi.quantity),1) AS qty, ROUND(SUM(poi.amount)) AS amt,
         ROUND(SUM(poi.amount)/NULLIF(SUM(poi.quantity),0)) AS per_unit,
         GROUP_CONCAT(DISTINCT poi.item_name) AS raw_names
  FROM purchase_order_items poi JOIN purchase_orders po ON poi.po_id = po.id
       LEFT JOIN items m ON poi.item_id = m.id
  WHERE po.order_date >= '${FROM}'
    AND (COALESCE(m.item_group,'') LIKE '%잉크%' OR COALESCE(m.item_name,'') LIKE '%잉크%'
         OR poi.item_name LIKE '%잉크%' OR poi.item_name LIKE '%INK%')
  GROUP BY 1 ORDER BY amt DESC`)
const ppOptions = q(`
  SELECT option_code AS code, option_name AS name, pp_category AS cat, pricing_type AS ptype,
         unit_price AS uprice, additional_cost AS acost, is_active AS act,
         COALESCE(material_item_group,'') AS matgrp
  FROM post_processing_options ORDER BY pp_category, id`)

console.log('[6/8] 단가 편차(분위수)')
// ★min/max 로 보면 안 된다 — 규격 오입력 한 줄이 배수를 지배한다(UV 포맥스 max 1,393만원/㎡).
//   분위수로 봐야 「실제로 얼마에 팔리고 있나」가 나온다.
// 청구면적 기준과 실면적 기준을 **둘 다** 낸다: 최소 1m 청구 규칙이 작은 규격의 ㎡단가를 눌러
//   판재 계열이 12배 편차처럼 보이게 만든다(그쪽은 실규격 청구가 관행이다).
// ★과금축이 둘이고 **FIXED 가 매출의 68%**다(30.8억 vs AREA 14.5억). AREA 만 보면 3분의 1만 다룬다.
//   같은 표에 담되 단위가 다르다 — AREA 는 원/㎡, FIXED 는 원/장. 「단가축」 열이 그걸 말한다.
//   FIXED 는 규격이 없어도 장당 단가가 서므로 규격 조건을 AREA 에만 건다.
const spread = q(`
  WITH x AS (
    SELECT i.id AS iid, i.category AS cat, i.item_code AS code, i.item_name AS name,
           i.pricing_method AS pm,
           CASE WHEN i.pricing_method = 'AREA'
                THEN oi.amount / (max((CAST((oi.width+9.9999)/10 AS INT))*10,100)/100.0
                                 *max((CAST((oi.height+9.9999)/10 AS INT))*10,100)/100.0*oi.quantity)
                ELSE oi.amount / oi.quantity END AS unit_p,
           CASE WHEN oi.width > 0 AND oi.height > 0
                THEN oi.amount / (oi.width*oi.height/10000.0*oi.quantity) END AS real_p,
           oi.amount AS amt, o.client_id AS cid,
           CASE WHEN oi.width > 0 AND oi.height > 0 AND (oi.width < 100 OR oi.height < 100)
                THEN 1 ELSE 0 END AS small
    FROM order_items oi JOIN orders o ON oi.order_id = o.id JOIN items i ON oi.item_id = i.id
    WHERE o.order_date >= '${FROM}' AND oi.quantity > 0 AND oi.amount > 0
      AND (i.pricing_method <> 'AREA' OR (oi.width > 0 AND oi.height > 0))
  ), r AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY iid ORDER BY unit_p) AS rn,
              ROW_NUMBER() OVER (PARTITION BY iid ORDER BY real_p) AS rn2,
              COUNT(*) OVER (PARTITION BY iid) AS cnt FROM x
  )
  SELECT cat, code, name, pm, MAX(cnt) AS n, COUNT(DISTINCT cid) AS clients, SUM(small) AS small_lines,
         ROUND(MAX(CASE WHEN rn  = CAST(cnt*0.10 AS INT)+1 THEN unit_p END)) AS p10,
         ROUND(MAX(CASE WHEN rn  = CAST(cnt*0.50 AS INT)+1 THEN unit_p END)) AS p50,
         ROUND(MAX(CASE WHEN rn  = CAST(cnt*0.90 AS INT)+1 THEN unit_p END)) AS p90,
         ROUND(MAX(CASE WHEN rn2 = CAST(cnt*0.50 AS INT)+1 THEN real_p END)) AS real_p50,
         ROUND(SUM(amt)) AS sales
  FROM r GROUP BY iid HAVING MAX(cnt) >= 10 ORDER BY sales DESC LIMIT 80`)

console.log('[7/10] 단가 설계 기초 + 기본사양')
// 단가를 다시 짤 때 사람이 채워야 하는 칸을 **둘**로 줄인다(로스율·목표 재료비율).
// 나머지(원가 ㎡단가 → 하한 단가 → 현재가와의 갭)는 실측에서 수식으로 흐른다.
// ★품목별 수량 배율표를 사람이 짜게 하지 않는다 — 실측 배율이 품목마다 노이즈가 크다
//   (AQ-BANNER 는 1.00→0.60 으로 깨끗한데 TRG-PO 는 구간이 뒤집힌다). 참고값으로만 싣는다.
const designBase = q(`
  SELECT i.category AS cat, i.item_code AS code, i.item_name AS name, i.pricing_method AS pm,
         ROUND(SUM(oi.amount)) AS sales, COUNT(*) AS lines, SUM(oi.quantity) AS pcs,
         ROUND(SUM(oi.width*oi.height/10000.0*oi.quantity),1) AS rsqm,
         ROUND(SUM(oi.material_cost + oi.ink_cost)) AS mat,
         SUM(CASE WHEN oi.total_cost > 0 THEN 1 ELSE 0 END) AS costed,
         (SELECT COUNT(*) FROM product_materials pm WHERE pm.product_item_id = i.id) AS bom_n,
         (SELECT GROUP_CONCAT(DISTINCT m.item_group) FROM product_materials pm
           JOIN items m ON m.id = pm.material_item_id WHERE pm.product_item_id = i.id) AS bom
  FROM order_items oi JOIN orders o ON oi.order_id = o.id JOIN items i ON oi.item_id = i.id
  WHERE o.order_date >= '${FROM}' AND oi.quantity > 0
  GROUP BY i.id HAVING SUM(oi.amount) > 2000000 ORDER BY sales DESC LIMIT 80`)

// 수량대별 실측 ㎡단가 — 배율의 근거. 라인이 적은 칸은 비어 있고, 그건 그대로 비워 둔다.
const qmul = q(`
  WITH x AS (
    SELECT i.id AS iid, i.item_code AS code, oi.quantity AS qty, oi.amount AS amt,
           (max((CAST((oi.width+9.9999)/10 AS INT))*10,100)/100.0)
          *(max((CAST((oi.height+9.9999)/10 AS INT))*10,100)/100.0)*oi.quantity AS bsqm
    FROM order_items oi JOIN orders o ON oi.order_id = o.id JOIN items i ON oi.item_id = i.id
    WHERE o.order_date >= '${FROM}' AND i.pricing_method = 'AREA'
      AND oi.width > 0 AND oi.height > 0 AND oi.quantity > 0 AND oi.amount > 0 AND oi.total_cost > 0
  ), b AS (
    SELECT iid, code,
           CASE WHEN qty=1 THEN 'q1' WHEN qty<=3 THEN 'q2' WHEN qty<=10 THEN 'q3'
                WHEN qty<=30 THEN 'q4' WHEN qty<=100 THEN 'q5' ELSE 'q6' END AS band,
           SUM(amt)/SUM(bsqm) AS p, SUM(amt) AS amt, COUNT(*) AS c FROM x GROUP BY 1,3
  )
  SELECT code, SUM(c) AS lines,
         ROUND(MAX(CASE WHEN band='q1' THEN p END)) AS q1,
         ROUND(MAX(CASE WHEN band='q2' THEN p END)) AS q2,
         ROUND(MAX(CASE WHEN band='q3' THEN p END)) AS q3,
         ROUND(MAX(CASE WHEN band='q4' THEN p END)) AS q4,
         ROUND(MAX(CASE WHEN band='q5' THEN p END)) AS q5,
         ROUND(MAX(CASE WHEN band='q6' THEN p END)) AS q6,
         ROUND(SUM(amt)) AS sales
  FROM b GROUP BY iid HAVING SUM(c) >= 30 ORDER BY sales DESC LIMIT 25`)

console.log('[8/10] 잉크 ㎡단가 + BOM')
const inkRow = q(`SELECT setting_value AS v FROM settings WHERE setting_key='ink_cost_per_sqm_by_category'`)
let inkMap = {}
try { inkMap = JSON.parse(inkRow[0]?.v || '{}') } catch (_) { inkMap = {} }
// 시뮬레이터 행의 원단 초기값을 고르려면 제품별 BOM 후보가 필요하다.
const bom = q(`
  SELECT p.item_code AS product, m.item_code AS mat, m.width_mm AS w, m.avg_unit_cost AS cost,
         COALESCE(m.base_unit,'') AS bu
  FROM product_materials pm JOIN items p ON p.id = pm.product_item_id
       JOIN items m ON m.id = pm.material_item_id
  WHERE m.width_mm IS NOT NULL AND COALESCE(m.deduction_method,'ROLL') = 'ROLL'`)

// ── 시트 1: 요약 ──────────────────────────────────────────────────────────────
const sumRows = [
  ...head(
    '인쇄방식별 재료비율',
    `${FROM} 이후 주문 · 출처 ${LOCAL ? '로컬 D1' : 'prod webapp-production'} · 생성 ${today}`,
    '⚠️ 재료비율은 원가율이 아니다 — 로스·후가공·인건비·감가가 빠져 있다(「산식·주의」 시트를 먼저 볼 것)'
  ),
  hdr(['인쇄방식', '매출', '원단비', '잉크비', '재료비', '재료비율', '산정 매출', '산정률', '실면적㎡', '매출 원/㎡', '재료비 원/㎡'], 1),
]
const HDR = TOP // 머리글 행 번호(모든 시트 공통)
byCat.forEach((r, i) => {
  const row = HDR + 1 + i
  sumRows.push([
    r.cat,
    { v: n(r.sales), s: S.INT },
    { v: n(r.mat), s: S.INT },
    { v: n(r.ink), s: S.INT },
    { v: n(r.cost), s: S.INT },
    { f: `IF(G${row}=0,"",E${row}/G${row})`, s: S.PCT },
    { v: n(r.sales_costed), s: S.INT },
    { f: `IF(B${row}=0,"",G${row}/B${row})`, s: S.PCT },
    { v: n(r.sqm), s: S.INT },
    { f: `IF(I${row}=0,"",B${row}/I${row})`, s: S.INT },
    { f: `IF(I${row}=0,"",E${row}/I${row})`, s: S.INT },
  ])
})
const lastCat = HDR + byCat.length
const sumTotalRow = lastCat + 1
sumRows.push([
  { v: '합계', s: S.BOLD },
  { f: `SUM(B${HDR + 1}:B${lastCat})`, s: S.TOTAL },
  { f: `SUM(C${HDR + 1}:C${lastCat})`, s: S.TOTAL },
  { f: `SUM(D${HDR + 1}:D${lastCat})`, s: S.TOTAL },
  { f: `SUM(E${HDR + 1}:E${lastCat})`, s: S.TOTAL },
  { f: `IF(G${sumTotalRow}=0,"",E${sumTotalRow}/G${sumTotalRow})`, s: S.TOTALPCT },
  { f: `SUM(G${HDR + 1}:G${lastCat})`, s: S.TOTAL },
])

// 읽는 법 — 표 **바로 밑**에 둔다. 종전엔 시트 끝에 있어 아무도 안 봤다.
sumRows.push([])
sumRows.push([{ v: '읽는 법', s: S.SECTION }])
for (const t of [
  '· 재료비율 = 재료비 ÷ 「산정 매출」(원가가 계산된 라인의 매출)이다. 전체 매출로 나누면 미산정 라인이 섞여 낮게 보인다.',
  '· 산정률이 낮은 분류(원자재·상품·간판)는 재료비율을 신뢰하지 말 것 — 유통 매입원가는 별도 축이다.',
  '· 태극기·간판은 잉크가 0이다(인쇄원단을 사서 쓴다). 규칙이지 누락이 아니다.',
  '· 솔벤 시트·수성 패트 계열은 **코팅지**가 재료비에 들어 있다(2026-09-09 반영). 코팅은 판매단가에도 이미 포함돼 있다.',
]) sumRows.push([{ v: t, s: S.NOTE }])

// 시트 안내 — 12장이라 어디에 뭐가 있는지부터 알려 준다.
sumRows.push([])
sumRows.push([{ v: '이 워크북의 구성', s: S.SECTION }])
sumRows.push(hdr(['시트', '무엇이 들어 있나', '언제 보나']))
for (const g of [
  ['단가설계', '기준단가 × 수량·규격 배율로 판매가를 짜는 칸(노란 칸이 입력)', '단가를 새로 정할 때'],
  ['기본사양', '품목마다 과금축·기본 원단·가공이 무엇인지', '제품 사양을 확인할 때'],
  ['계산식', '원단·규격을 바꾸면 원가가 그 자리에서 다시 계산되는 시뮬레이터', '"이 단가면 얼마?"를 물을 때'],
  ['산식·주의', '무엇이 원가에 안 들어 있는지 · 값을 믿으면 안 되는 구간', '숫자를 인용하기 전에'],
  ['제품별원가율', '품목별 매출·재료비·재료비율 실적', '어느 제품이 남는지 볼 때'],
  ['규격별원가율', '같은 품목 안에서 규격별로 어떻게 갈리는지', '규격 배율을 정할 때'],
  ['단가편차', '같은 제품인데 출고 단가가 크게 갈린 곳', '가격 정책이 새는 곳을 찾을 때'],
  ['원단단가', '자재별 단가·폭·㎡환산·쓰는 제품', '매입 단가를 손볼 때'],
  ['잉크단가', '인쇄방식별 잉크 ㎡단가와 신뢰도', '잉크 원가를 따질 때'],
  ['장비·잉크', '장비마다 잉크 제품이 다른 것을 눈으로', '방식 평균이 미심쩍을 때'],
  ['후가공', '후가공 항목과 단가(현재 전부 0원)', '후가공 과금을 정할 때'],
]) sumRows.push(g)

// ── 시트 2: 계산식 (시뮬레이터) ───────────────────────────────────────────────
// 원단 초기값 = 그 제품의 BOM 후보 중 **비용이 가장 싼 폭**.
// ⚠️「짧은 변이 들어가는 최소폭」으로 고르면 틀린다 — 실측으로 확인했다(2026-09-08).
//   60×180 가로등배너를 850폭에 넣으면 짧은 변(600)은 눕지만 길이가 1,800mm 나가 1,122원이고,
//   1800폭에 긴 변을 눕히면 길이가 600mm 로 줄어 787원이다. 실적 재료비(787.4원/장)는 후자였다.
//   폭이 넓을수록 yd 단가가 오르지만 **길이가 줄어드는 효과가 더 크다.**
// 실제 엔진(`utils/rollConsumption.resolveLineMaterials`)은 여기에 회전·분할까지 더해 고른다.
const bomByProduct = {}
for (const b of bom) (bomByProduct[b.product] = bomByProduct[b.product] || []).push(b)

/** 폭 W 에 (w,h) 를 눕혔을 때 필요한 롤 길이(mm). 못 넣으면 null. */
function rollLengthMm(widthMm, wMm, hMm) {
  const fitsH = hMm <= widthMm
  const fitsW = wMm <= widthMm
  if (fitsH && fitsW) return Math.min(wMm, hMm) // 둘 다 눕으면 짧은 쪽을 길이로 = 소요 최소
  if (fitsH) return wMm
  if (fitsW) return hMm
  return null
}

function pickMaterial(product, wCm, hCm) {
  const wMm = wCm * 10
  const hMm = hCm * 10
  let best = null
  for (const c of bomByProduct[product] || []) {
    const len = rollLengthMm(Number(c.w), wMm, hMm)
    if (len === null) continue
    const price = Number(c.cost) || 0
    if (price <= 0) continue // 단가 0인 자재를 고르면 「가장 싼 폭」이 늘 그것이 된다
    const cost = (len / (c.bu === 'M' ? 1000 : 914.4)) * price
    if (best === null || cost < best.cost0) best = { ...c, cost0: cost }
  }
  return best
}

const simCases = bySize
  .filter((r) => ['수성', '솔벤', 'UV', '전사'].includes(r.cat))
  .slice(0, 25)
  .map((r) => ({ ...r, mat: pickMaterial(r.code, r.w, r.h) }))
  .filter((r) => r.mat)

const calcRows = [
  ...head(
    '원가 계산식 — 값을 바꾸면 다시 계산된다',
    '노란 칸이 입력이다(원단코드·규격·수량). 폭·단가는 「원단단가」 시트에서 VLOOKUP 으로 가져오므로 그 시트를 고치면 여기도 바뀐다',
    '⚠️ 여기 원단 선택은 「짧은 변을 폭에 눕히는」 단순 규칙이다. 실제 엔진은 회전·분할까지 보므로 실적과 몇 % 다를 수 있다'
  ),
  hdr([
    '제품코드', '방식', '가로cm', '세로cm', '수량', '원단코드',
    '원단폭mm', '원단단가', '단가단위', '잉크원/㎡',
    '배치길이mm', '원단소요', '원단비', '잉크비', '재료비',
    '실면적㎡', '청구면적㎡', '판매원/㎡', '청구액', '재료비율',
    '실적 재료비/장', '계산−실적',
  ], [2, 3, 4, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]),
]
const CHDR = calcRows.length
simCases.forEach((r, i) => {
  const row = CHDR + 1 + i
  const sellPerSqm = r.bsqm > 0 ? Math.round(r.sales / r.bsqm) : 0
  calcRows.push([
    { v: r.code, s: S.INPUT },
    { v: r.cat, s: S.INPUT },
    { v: r.w, s: S.INPUT },
    { v: r.h, s: S.INPUT },
    { v: 1, s: S.INPUT },
    { v: r.mat.mat, s: S.INPUT },
    // 원단단가 시트: A=코드 … D=폭mm, E=단가, G=재고단위(base_unit)
    { f: `IFERROR(VLOOKUP($F${row},원단단가!$A:$G,4,0),"")`, s: S.INT },
    { f: `IFERROR(VLOOKUP($F${row},원단단가!$A:$G,5,0),"")`, s: S.DEC2 },
    { f: `IF(IFERROR(VLOOKUP($F${row},원단단가!$A:$G,7,0),"")="M","M","yd")` },
    { f: `IFERROR(VLOOKUP($B${row},잉크단가!$A:$B,2,0),0)`, s: S.INT },
    // 배치길이 = 폭에 눕는 변을 뺀 나머지 변. 둘 다 눕으면 짧은 쪽을 길이로 써서 소요를 줄인다.
    { f: `IF(AND($D${row}*10<=$G${row},$C${row}*10<=$G${row}),MIN($C${row},$D${row})*10,IF($D${row}*10<=$G${row},$C${row}*10,IF($C${row}*10<=$G${row},$D${row}*10,NA())))`, s: S.INT },
    // 소요 단위는 재고 단위를 따른다 — base_unit='M' 이면 미터, 아니면 yd(÷914.4).
    { f: `$K${row}/IF($I${row}="M",1000,914.4)*$E${row}`, s: S.DEC2 },
    { f: `$L${row}*$H${row}`, s: S.INT },
    { f: `$P${row}*$J${row}`, s: S.INT },
    { f: `$M${row}+$N${row}`, s: S.INT },
    { f: `$C${row}*$D${row}/10000*$E${row}`, s: S.DEC2 },
    // 청구면적 = 10cm 올림 → 최소 1m(변)
    { f: `MAX(CEILING($C${row},10),100)/100*MAX(CEILING($D${row},10),100)/100*$E${row}`, s: S.DEC2 },
    { v: sellPerSqm, s: S.INPUT },
    { f: `$Q${row}*$R${row}`, s: S.INT },
    { f: `IF($S${row}=0,"",$O${row}/$S${row})`, s: S.PCT },
    // 대조용 — 같은 규격의 실적 재료비(장당). 계산이 실적에서 크게 벗어나면 원단 선택이 틀린 것이다.
    { v: r.qty > 0 ? Math.round((Number(r.mat) + Number(r.ink)) / r.qty) : null, s: S.INT },
    { f: `IF(OR($U${row}=0,$E${row}=0),"",($O${row}/$E${row}-$U${row})/$U${row})`, s: S.PCT },
  ])
})

calcRows.push([])
calcRows.push([{ v: '산식 (열 기호는 위 표 기준)', s: S.BOLD }])
;[
  ['배치길이mm (K)', '폭(G)에 눕는 변을 빼고 남은 변. 둘 다 눕으면 짧은 쪽을 길이로 쓴다. 어느 쪽도 안 들어가면 #N/A = 그 폭으로는 못 뽑는다'],
  ['원단소요 (L)', 'K ÷ 914.4 × 수량  (재고 단위가 M 인 자재는 ÷1000). 야드↔미터는 items.base_unit 이 정한다'],
  ['원단비 (M)', 'L × 원단단가(H). H 는 items.avg_unit_cost = 매입 가중평균이고 base 단위당 값이다'],
  ['잉크비 (N)', '실면적(P) × 방식별 ㎡단가(J). 잉크는 자재 연결과 무관하게 규격·분류만으로 붙는다'],
  ['재료비 (O)', 'M + N. 후가공비는 들어 있지 않다(단가 미등록)'],
  ['실면적㎡ (P)', '가로 × 세로 ÷ 10,000 × 수량 — 재료가 실제로 쓰이는 면적'],
  ['청구면적㎡ (Q)', '각 변을 10cm 올림 → 1m 미만이면 1m → 곱하고 수량. 청구는 이 면적으로 한다'],
  ['청구액 (S)', 'Q × 판매 ㎡단가(R). 장당 정액(FIXED) 품목은 S 를 직접 덮어써서 본다'],
  ['재료비율 (T)', 'O ÷ S'],
  ['실적 재료비/장 (U)', '같은 규격의 실적 = (원단비 + 잉크비) ÷ 수량. 계산값을 대조하는 눈금이다'],
  ['계산−실적 (V)', '(O÷E − U) ÷ U. 0 에 가까울수록 여기 원단 선택이 실제 엔진과 같다는 뜻이고, 크게 벌어지면 F 열의 원단코드를 바꿔 가며 맞춰 본다'],
].forEach(([k, v]) => calcRows.push([{ v: k, s: S.BOLD }, v]))

// ── 시트 3: 산식·주의 ─────────────────────────────────────────────────────────
const noteRows = [
  [{ v: '이 워크북을 읽을 때', s: S.TITLE }],
  [{ v: '숫자를 인용하기 전에 이 시트를 먼저 읽을 것 — 무엇이 원가에 안 들어 있는지가 여기 있다', s: S.CAPTION }],
  [],
  [{ v: '1. 여기 있는 것은 재료비다', s: S.BOLD }],
  ['들어 있는 것', '원단·판재(BOM 실소요량 × 매입 가중평균단가) + 잉크(실면적 × 인쇄방식별 ㎡단가)'],
  ['빠져 있는 것', '로스 · 후가공 · 인건비 · 감가상각 · 외주비 · 배송비'],
  ['로스', '이론 소요량만 담는다(확정). 이론 ↔ 실제 차감의 차이가 곧 로스라, 미리 섞으면 그 측정이 불가능해진다. 2026-07 출력 로그 실측 로스율 21.5%'],
  ['후가공', 'post_processing_options 17종의 단가가 전부 0원이라 pp_cost 가 전 라인 0이다. 마감·펀칭·아일렛이 통째로 빠져 있다'],
  ['인건비·감가', '2026 급여 실적 월 8,874만(연 10.6억) · 고정자산 연 감가 3.29억. 매출로 나누면 약 21%p'],
  [{ v: '⇒ 재료비율 55%를 넘는 품목은 이미 적자 구간으로 보는 편이 안전하다.', s: S.BOLD }],
  [],
  [{ v: '2. 원가는 어떻게 계산되나', s: S.BOLD }],
  ['정본', 'src/utils/orderLineCost.ts — computeLineCost(). 자재 선택·소요량은 utils/rollConsumption.resolveLineMaterials 하나뿐이고 자동차감·소요량계획·원가가 전부 그 함수를 지난다'],
  ['저장 위치', 'order_items.material_cost / ink_cost / pp_cost / total_cost'],
  ['갱신', 'POST /api/costs/backfill (= scripts/cost-backfill-run.cjs). 저장값은 계산 당시의 BOM 이라 품목·자재를 바꾸면 낡는다'],
  ['실제 사례', '게릴라 현수막이 0568~0571 로 품목을 옮긴 뒤 재계산되지 않아 구 원단(459원/yd) 값을 들고 있었다 — 재료비율이 77.1%로 보였고 실제는 61.1%였다(2026-09-08 교정)'],
  [],
  [{ v: '3. 커버리지 — 「원가 0」과 「원가 미상」은 다르다', s: S.BOLD }],
  ['FULL', '자재도 단가도 있다'],
  ['PARTIAL', '일부만 산정 — 단가 없는 자재가 섞였거나 산정 규칙이 없는 BOM 행이 있다'],
  ['NO_ITEM', '품목 미연결(자유입력 라인) — 간판 커스텀이 여기 많다'],
  ['NO_SIZE', '규격이 0 — 소요량을 낼 수 없다'],
  ['NO_MATERIAL_LINK', '품목은 있는데 product_materials 연결이 없다(잉크만 붙는다)'],
  ['NO_PRICE', '자재는 골랐는데 avg_unit_cost 가 0'],
  ['NO_DEDUCT', '무차감(NONE) 자재만 연결 — 의도된 0이지 미상이 아니다'],
  [],
  [{ v: '4. 단위 — 원단은 롤로 사서 미터로 자른다', s: S.BOLD }],
  ['items.unit', '입고·발주 단위 (롤 / yd)'],
  ['items.base_unit', '재고·소모 단위 (M=미터 / cm / NULL=yd). 차감은 이 값만 본다'],
  ['items.pack_size', '롤당 길이(미터). 입고 환산 계수'],
  ['avg_unit_cost', 'base 단위당 단가. 실측 대조(AQ2-090): 459원/yd ÷ 0.823㎡/yd = 558원/㎡ ≈ 매입 실적 568원'],
  [],
  [{ v: '5. 청구면적 규칙', s: S.BOLD }],
  ['규칙', '각 변을 10cm 올림 → 1m 미만 변은 1m 로 → 면적 × 수량 → 100원 반올림'],
  ['예외', 'UV 판재(포맥스·자작나무·폼보드 등)는 실규격 그대로 청구한다 — items.min_billing_side_cm = 0'],
  ['효과', '작은 규격일수록 청구면적이 실면적보다 커진다(60cm 현수막 2.24배). 재료비율이 낮게 나오는 이유가 이것이다'],
  [],
  [{ v: '6. 잉크 ㎡단가의 출처', s: S.BOLD }],
  ['정본', 'settings.ink_cost_per_sqm_by_category (JSON). 축은 items.category'],
  ['산출', '잉크 매입(2026-01~07) ÷ 같은 기간 판매 실면적. 분모와 적용 축이 같아 로스가 빠져도 총액은 자기정합적이다'],
  ['⚠️', '맵에 없는 분류는 0이다. 공통값으로 흘리면 태극기(233,557㎡)에 없는 잉크가 붙는다'],
  [],
  [{ v: '7. 이 표로 판단하면 안 되는 것', s: S.BOLD }],
  ['유통(원자재·상품)', '산정률이 0~7%다. 유통 매출원가는 판매수량 × 매입가 축이고 실제 원가율은 87.5% 수준이다'],
  ['간판', '산정률 25%. 나머지는 품목 미연결 커스텀 라인이라 구조적으로 원가가 안 선다'],
  ['UV 포맥스 계열', '원판을 사서 조각으로 파는 품목이라 매입 단위와 판매 수량 축이 다르다 — 재료비율 2~3%는 실제가 아니다'],
]
noteRows.forEach((r) => { if (r[0] && typeof r[0] === 'string') r[0] = { v: r[0], s: S.BOLD } })

// ── 시트 4: 제품별 근거 ───────────────────────────────────────────────────────
const itemRows = [
  ...head('제품별 재료비율', '매출 상위 200품목 · 재료비율이 붉을수록 남는 게 적다 · 산정률이 낮으면 그 비율은 못 믿는다'),
  hdr(['분류', '품목코드', '품목명', '과금축', '기준단가',
    '라인수', '산정라인', '매출', '산정매출', '원단비', '잉크비', '재료비', '재료비율', '산정률'], 4),
]
byItem.forEach((r, i) => {
  const row = DATA + i
  itemRows.push([
    r.cat, r.code, r.name, r.pm, { v: n(r.base), s: S.INT },
    { v: n(r.lines), s: S.INT }, { v: n(r.costed), s: S.INT },
    { v: n(r.sales), s: S.INT }, { v: n(r.sales_costed), s: S.INT },
    { v: n(r.mat), s: S.INT }, { v: n(r.ink), s: S.INT }, { v: n(r.cost), s: S.INT },
    { f: `IF(I${row}=0,"",L${row}/I${row})`, s: S.PCT },
    { f: `IF(F${row}=0,"",G${row}/F${row})`, s: S.PCT },
  ])
})

// ── 시트 5: 규격별 근거 ───────────────────────────────────────────────────────
const sizeRows = [
  ...head('규격별 재료비율', '같은 품목 안에서 규격이 원가를 얼마나 흔드는지 · 라인 3건 이상만 · 매출 상위 120',
    '⚠️ 청구면적은 10cm 올림·최소 1m 규칙으로 계산한 값이라, 실규격 청구인 UV 판재 계열은 참고값이다'),
  hdr(['분류', '품목코드', '가로cm', '세로cm', '라인수', '수량',
    '매출', '청구면적㎡', '실면적㎡', '청구/실', '원단비', '잉크비', '재료비',
    '판매원/㎡', '재료비원/㎡', '재료비율'], 2),
]
bySize.forEach((r, i) => {
  const row = DATA + i
  sizeRows.push([
    r.cat, r.code, { v: n(r.w), s: S.INT }, { v: n(r.h), s: S.INT },
    { v: n(r.lines), s: S.INT }, { v: n(r.qty), s: S.INT },
    { v: n(r.sales), s: S.INT }, { v: n(r.bsqm), s: S.DEC1 }, { v: n(r.rsqm), s: S.DEC1 },
    { f: `IF(I${row}=0,"",H${row}/I${row})`, s: S.DEC2 },
    { v: n(r.mat), s: S.INT }, { v: n(r.ink), s: S.INT }, { v: n(r.cost), s: S.INT },
    { f: `IF(H${row}=0,"",G${row}/H${row})`, s: S.INT },
    { f: `IF(H${row}=0,"",M${row}/H${row})`, s: S.INT },
    { f: `IF(G${row}=0,"",M${row}/G${row})`, s: S.PCT },
  ])
})

// ── 시트 6: 원단(자재) 단가 ───────────────────────────────────────────────────
// ★열 순서를 바꾸면 「계산식」 시트의 VLOOKUP 인덱스(4=폭, 5=단가, 7=재고단위)가 깨진다.
const matRows = [
  ...head('자재(원단·코팅지) 단가', '단가는 **재고단위당**이다 — 롤가가 아니다. ㎡환산단가로 폭이 다른 자재를 비교한다',
    '⚠️ 열 순서를 바꾸면 「계산식」 시트의 VLOOKUP 인덱스(4=폭 · 5=단가 · 7=재고단위)가 깨진다'),
  hdr(['자재코드', '자재명', '자재그룹', '폭mm', '단가', '입고단위', '재고단위',
    '롤길이', '차감방식', '㎡환산단가', '쓰는제품수', '쓰는제품'], [3, 4, 7, 9, 10]),
]
mats.forEach((r, i) => {
  const row = DATA + i
  matRows.push([
    r.code, r.name, r.grp, { v: n(r.w), s: S.INT }, { v: n(r.cost), s: S.DEC2 },
    r.unit, r.bu, { v: n(r.pack), s: S.INT }, r.dm,
    // ㎡ 환산 = 단가 ÷ (폭m × 1yd 길이). 재고 단위가 M 이면 길이 계수는 1.
    { f: `IF(OR(D${row}="",D${row}=0),"",E${row}/((D${row}/1000)*IF(G${row}="M",1,0.9144)))`, s: S.INT },
    { v: n(r.used_by), s: S.INT }, groupProducts(r.products),
  ])
})

// ── 시트 7: 잉크 ㎡단가 ───────────────────────────────────────────────────────
const inkNotes = {
  수성: ['~20', '높음', '실사 2026-09-03 개시 — 회차 2부터 소비/매입 검산 가능'],
  전사: ['~5', '높음', '주간 실사 소비/매입 1.06 (기말 재고 ≈ 0)'],
  솔벤: ['~18', '중간', '엡손 W 가 다른 색의 3~4배인 것은 정상'],
  UV: ['~17.5', '중간', '재현테크 전표 뭉침 제외 후 값 — 단가 일관된 UV-NEW·UV-E413만 사용'],
  태극기: ['0', '확정', '인쇄원단 매입·출력 없음'],
  간판: ['0', '확정', '인쇄원단 매입·출력 없음'],
}
const inkRows = [
  ...head('인쇄방식별 잉크 ㎡단가', '산출 = 잉크 매입(2026-01~07) ÷ 같은 기간 판매 실면적 · 정본 = settings.ink_cost_per_sqm_by_category',
    '⚠️ 인쇄방식마다 13배 차이가 난다. 전 방식 공통 ㎡단가를 쓰면 UV 가 7배 과소가 된다'),
  hdr(['분류', '원/㎡', '검산 ml/㎡', '신뢰도', '비고'], [1]),
]
for (const [k, v] of Object.entries(inkMap)) {
  const nt = inkNotes[k] || ['', '', '']
  inkRows.push([k, { v: Number(v), s: S.INT }, nt[0], nt[1], nt[2]])
}

// ── 시트 8: 장비·잉크 ─────────────────────────────────────────────────────────
// 잉크 ㎡단가는 방식(items.category) 하나로 붙는데, 잉크 **제품은 장비마다 다르다**.
// 그 어긋남을 눈으로 보라고 세 덩어리를 한 장에 세워 둔다: 장비 / 잉크 품목군 / 매입 실적.
const eqRows = [
  ...head(
    '장비별 잉크 — 방식 평균이 무엇을 뭉개는가',
    '잉크 품목은 이미 장비별로 그룹이 갈려 있는데, 원가 계산은 items.category(수성/솔벤/UV/전사) 한 축만 본다',
    '⚠️ 매입 「통당단가」가 품명 원문의 「n X 단가」와 안 맞으면 그 전표는 뭉친 것이다 — 잉크 외 품목이 섞여 있다'
  ),
  hdr(['잉크 품목군', '품목수', '평균 통단가', '매입 라인', '매입 수량', '매입액', '장부 통당단가', '품명 원문(중복 제거)'], [1, 2, 3, 4, 5, 6]),
]
const EHDR = eqRows.length
const buyByGrp = Object.fromEntries(inkBuy.map((b) => [b.grp, b]))
for (const g of inkItems) {
  const b = buyByGrp[g.grp]
  eqRows.push([
    g.grp, { v: n(g.items), s: S.INT }, { v: n(g.avg_cost), s: S.INT },
    { v: n(b?.lines), s: S.INT }, { v: n(b?.qty), s: S.DEC1 }, { v: n(b?.amt), s: S.INT },
    { v: n(b?.per_unit), s: S.INT },
    String(b?.raw_names || '').split(',').slice(0, 6).join(' | '),
  ])
}
eqRows.push([])
eqRows.push([{ v: '장비 목록', s: S.BOLD }])
const EQ2 = eqRows.length + 1
eqRows.push(['장비ID', '장비명', '프린터', '크기', '상태'].map((h) => ({ v: h, s: S.HEADER })))
for (const e of equipment) eqRows.push([e.id, e.name, e.printer, e.size, e.status])

// ── 시트 9: 후가공 ────────────────────────────────────────────────────────────
const ppRows = [
  ...head(
    '후가공 단가 — 전 항목이 0원이라 원가에 한 푼도 안 들어간다',
    '과금 기준은 항목마다 다르다(개당·m당·㎡당). 노란 칸(단가·추가비용)을 채우면 「기본가 + 후가공 가산」 조립이 열린다',
    '⚠️ 이관 주문에는 후가공 정보가 아예 없다 — 여기를 채워도 과거 원가는 안 바뀌고, MES 에서 받는 주문부터 붙는다'
  ),
  hdr(['코드', '항목명', '분류', '과금방식', '단가', '추가비용', '활성', '연결 자재그룹'], [4, 5]),
]
const PHDR = ppRows.length
for (const p of ppOptions) {
  ppRows.push([
    p.code, p.name, p.cat, p.ptype,
    { v: n(p.uprice), s: S.INPUT }, { v: n(p.acost), s: S.INPUT },
    p.act ? 'Y' : 'N', p.matgrp,
  ])
}

// ── 시트 10: 단가 편차 ────────────────────────────────────────────────────────
const spRows = [
  ...head(
    '같은 품목인데 ㎡단가가 얼마나 벌어지나',
    'P10/P50/P90 = 싼 쪽 10% · 중앙 · 비싼 쪽 10%. min/max 는 규격 오입력 한 줄이 지배해서 쓰지 않는다',
    '★「1m미만」 비중이 높은 품목은 청구면적 기준 값을 믿지 말 것 — 실규격 청구가 관행인 판재 계열이다(실면적 P50 을 볼 것)'
  ),
  hdr(['분류', '품목코드', '품목명', '단가축', '라인수', '거래처수', '1m미만', 'P10', 'P50', 'P90', 'P90/P10', '실면적 P50', '매출'], 4),
]
const SPHDR = spRows.length
spread.forEach((r, i) => {
  const row = SPHDR + 1 + i
  spRows.push([
    r.cat, r.code, r.name, r.pm, { v: n(r.n), s: S.INT }, { v: n(r.clients), s: S.INT },
    { v: n(r.small_lines), s: S.INT },
    { v: n(r.p10), s: S.INT }, { v: n(r.p50), s: S.INT }, { v: n(r.p90), s: S.INT },
    { f: `IF(OR(H${row}="",H${row}=0),"",J${row}/H${row})`, s: S.DEC1 },
    { v: n(r.real_p50), s: S.INT }, { v: n(r.sales), s: S.INT },
  ])
})

// ── 시트 11: 단가설계 ─────────────────────────────────────────────────────────
// 사람이 채우는 칸은 **둘뿐**이다 — 로스율(B2)과 목표 재료비율(B3).
// 품목마다 배율을 짜 넣게 하지 않는다. 하한 단가가 나오고, 현재 값이 그 위인지 아래인지만 본다.
const spreadByCode = Object.fromEntries(spread.map((s) => [s.code, s]))
const dsRows = [
  [{ v: '단가 설계 — 노란 칸 두 개만 정하면 나머지는 계산된다', s: S.TITLE }],
  [{ v: '로스율', s: S.BOLD }, { v: 0.215, s: S.INPUTPCT }, { v: '이론 소요 대비 실제 소비. 2026-07 출력 로그 실측 21.5%', s: S.CAPTION }],
  [{ v: '목표 재료비율', s: S.BOLD }, { v: 0.45, s: S.INPUTPCT }, { v: '재료비가 청구액의 몇 %까지 허용되나. 인건비·감가가 매출의 약 21%p 이므로 45%면 영업이익 약 13%', s: S.CAPTION }],
  [{ v: '하한 단가 = 재료비(로스 반영) ÷ 목표 재료비율. 이 값 아래로 팔면 인건비·감가를 못 덮는다. 단가축 AREA 는 원/㎡, FIXED 는 원/장이고 기준량도 그에 맞춘다.', s: S.WARN }],
  [],
  hdr([
    '분류', '품목코드', '품목명', '단가축', '매출', '기준량(㎡ 또는 장)',
    '원가/단위', '로스반영 원가', '하한 단가',
    '현재 P10', '현재 P50', 'P50−하한', '판정', '라인수',
  ], [4, 5, 6, 7, 8, 9, 10, 11, 13]),
]
const DHDR = dsRows.length
designBase.forEach((r, i) => {
  const row = DHDR + 1 + i
  const sp = spreadByCode[r.code]
  const isArea = r.pm === 'AREA'
  // 기준량 = 원가를 나눌 분모. AREA 는 실면적(㎡), FIXED 는 장수.
  const base = isArea ? Number(r.rsqm) || 0 : Number(r.pcs) || 0
  dsRows.push([
    r.cat, r.code, r.name, r.pm, { v: n(r.sales), s: S.INT },
    { v: base || null, s: isArea ? S.DEC1 : S.INT },
    { f: `IF(OR(F${row}="",F${row}=0),"",${Number(r.mat) || 0}/F${row})`, s: S.INT },
    { f: `IF(G${row}="","",G${row}*(1+$B$2))`, s: S.INT },
    { f: `IF(OR(H${row}="",$B$3=0),"",H${row}/$B$3)`, s: S.INT },
    { v: sp ? n(sp.p10) : null, s: S.INT },
    { v: sp ? n(sp.p50) : null, s: S.INT },
    { f: `IF(OR(K${row}="",I${row}=""),"",K${row}-I${row})`, s: S.INT },
    { f: `IF(OR(K${row}="",I${row}=""),"자료없음",IF(K${row}<I${row},"인상 필요",IF(J${row}<I${row},"하위구간 미달","적정")))` },
    { v: n(r.lines), s: S.INT },
  ])
})

dsRows.push([])
dsRows.push([{ v: '수량대별 실측 ㎡단가 — 배율의 근거(참고용, 손대지 말 것)', s: S.BOLD }])
dsRows.push([{ v: '★품목마다 배율이 다르고 노이즈가 크다. AQ-BANNER 는 1.00→0.60 으로 깨끗하지만 구간이 뒤집히는 품목도 있다 — 라인수가 적은 칸일수록 못 믿는다.', s: S.NOTE }])
const QHDR = dsRows.length + 1
dsRows.push(['품목코드', '1장', '2~3', '4~10', '11~30', '31~100', '100+', '100+ 배율', '라인수', '매출']
  .map((h) => ({ v: h, s: S.HEADER })))
qmul.forEach((r, i) => {
  const row = QHDR + 1 + i
  dsRows.push([
    r.code,
    { v: n(r.q1), s: S.INT }, { v: n(r.q2), s: S.INT }, { v: n(r.q3), s: S.INT },
    { v: n(r.q4), s: S.INT }, { v: n(r.q5), s: S.INT }, { v: n(r.q6), s: S.INT },
    { f: `IF(OR(B${row}="",B${row}=0,G${row}=""),"",G${row}/B${row})`, s: S.DEC2 },
    { v: n(r.lines), s: S.INT }, { v: n(r.sales), s: S.INT },
  ])
})

// ── 시트 12: 기본사양 ─────────────────────────────────────────────────────────
// ★코팅처럼 「단가에는 들어 있는데 원가에는 없는」 가공을 찾아내기 위한 표.
//   실측 확인(2026-09-08): SV-SHEET 의 BOM 은 일반시트뿐이고 코팅지가 없다.
//   코팅지는 SVCOAT-127 이라는 별도 판매품으로만 존재한다 → 솔벤 시트 재료비가 그만큼 비어 있다.
const specRows = [
  ...head(
    '품목별 기본 사양 — 「단가에 포함됐는데 원가에 없는 것」 찾기',
    '★ 표시된 노란 두 칸을 채워 주시면 BOM(product_materials)에 반영해 원가가 자동으로 잡히게 합니다',
    '· 항상 들어가는 가공 = 그 품목이면 무조건 들어가고 단가에 이미 녹아 있는 것(예: 솔벤 시트의 코팅) · 라인마다 고르는 것은 「후가공」 시트로'
  ),
  hdr([
    '분류', '품목코드', '품목명', '단가축', '매출', '원가/단위', 'BOM 자재수', '현재 BOM 자재그룹',
    '★항상 들어가는 가공', '★빠진 자재(있으면)', '비고',
  ], [4, 5, 6]),
]
const SHDR = specRows.length
designBase.forEach((r) => {
  const base = r.pm === 'AREA' ? Number(r.rsqm) || 0 : Number(r.pcs) || 0
  const mat = Number(r.mat) || 0
  specRows.push([
    r.cat, r.code, r.name, r.pm, { v: n(r.sales), s: S.INT },
    { v: base > 0 ? Math.round(mat / base) : null, s: S.INT },
    { v: n(r.bom_n), s: S.INT },
    String(r.bom || '(연결 없음)'),
    { v: '', s: S.INPUT }, { v: '', s: S.INPUT }, '',
  ])
})
specRows.push([])
specRows.push([{ v: '고를 수 있는 가공 항목 (후가공 시트의 코드)', s: S.BOLD }])
specRows.push([{ v: ppOptions.map((p) => `${p.name}(${p.code})`).join(' · '), s: S.NOTE }])

// ── 시트 13: 폭구간 원가 (원단 폭이 바뀌는 지점 = 금액이 끊어지는 지점) ────────
// ★유도: 무분할 1롤이면 원가 = 롤단가 × 길이/914.4 이고 면적 = 폭×길이 이므로
//   **원가/㎡ = 롤단가 × 1,093.6 ÷ 변길이(mm)** — 긴 변이 약분된다.
//   즉 원가/㎡ 를 정하는 건 **원단 폭에 눕히는 변 하나**이고, 그 변이 롤 폭을 넘는 순간
//   한 칸 위 롤로 올라가며 **계단**이 생긴다. 단가 구간을 그 계단에 맞추라는 게 이 시트다.
// ⚠️ 값은 **엔진을 실제로 불러서** 얻는다(`selectRollPlacement`). 산식을 여기 베끼면 갈린다.
const { compileTs } = require('./lib/compile-ts.cjs')
const { mod: rollMod, cleanup: rollCleanup } = compileTs(
  path.join(__dirname, '..', 'src', 'utils', 'rollConsumption.ts'))
const { selectRollPlacement } = rollMod

console.log('[9/10] 폭구간 원가 (엔진 실호출)')
const famRows = q(`
  SELECT m.item_group AS grp, m.item_code AS code, m.width_mm AS w, m.avg_unit_cost AS cost,
         m.base_unit AS bu, m.unit, m.pack_size AS pack, m.id AS id,
         GROUP_CONCAT(DISTINCT p.item_code) AS products
  FROM items m
  JOIN product_materials pm ON pm.material_item_id = m.id
       AND COALESCE(pm.material_role,'BASE') = 'BASE'
  JOIN items p ON p.id = pm.product_item_id
  WHERE COALESCE(m.deduction_method,'ROLL') = 'ROLL' AND m.width_mm > 0 AND m.avg_unit_cost > 0
  GROUP BY m.id ORDER BY m.item_group, m.width_mm`)

// 실측 — 그 원단을 쓰는 제품의 라인을 **짧은 변**으로 묶는다(원가/㎡ 를 정하는 축이 그것이다).
const sideRows = q(`
  SELECT i.item_code AS code, CAST(MIN(oi.width, oi.height) AS INT) AS side,
         COUNT(*) AS lines, ROUND(SUM(oi.amount)) AS sales,
         ROUND(SUM(oi.width*oi.height/10000.0*oi.quantity), 1) AS sqm,
         ROUND(SUM(oi.material_cost)) AS mat
  FROM order_items oi JOIN items i ON i.id = oi.item_id
  WHERE oi.material_cost > 0 AND oi.width > 0 AND oi.height > 0 AND oi.quantity > 0
  GROUP BY i.item_code, side`)

const byCode = new Map()
for (const r of sideRows) {
  if (!byCode.has(r.code)) byCode.set(r.code, [])
  byCode.get(r.code).push(r)
}

const fams = new Map()
for (const r of famRows) {
  if (!fams.has(r.grp)) fams.set(r.grp, [])
  fams.get(r.grp).push(r)
}

const bandRows = [
  ...head(
    '원단별 담당 구간과 원가 계단',
    '원가/㎡ = 롤단가 × 1,093.6 ÷ 원단 폭에 눕히는 변(mm) — 긴 변은 약분된다. 그 변이 롤 폭을 넘는 순간 한 칸 위 롤로 올라가며 계단이 생긴다',
    '★단가 정책이 「출력비 + 원자재」라 판정 기준은 재료비율이 아니라 **출력마진 원/㎡**(판매 − 재료)다. 구간마다 이 값이 평평해야 정책대로 받고 있는 것이다'
  ),
  hdr(['원단그룹', '원단코드', '폭cm', '롤단가/yd', '원/㎡(폭 만재)',
    '담당 구간(변 cm)', '구간시작 원가/㎡', '구간끝 원가/㎡', '끊김(직전끝 대비)', '안 뽑히는 이유',
    '실측 라인', '실측 매출', '판매 원/㎡', '재료 원/㎡', '출력마진 원/㎡', '쓰는 제품'],
    [2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14]),
]

// 엔진에 「이 변을 폭으로 눕혔을 때」를 1cm 씩 물어 **원단별 담당 구간**을 만든다.
// ★원단 행에 구간을 붙여야 읽힌다 — 구간 행에 원단을 붙이면 「60.1~70 구간인데 90폭」처럼
//   보여서 무슨 말인지 알 수 없다(용준님 지적 2026-09-10).
const LONG = 10000
function perSqm(pool, sideMm) {
  const p = selectRollPlacement(pool, sideMm, LONG, 1, { orientation: 'width-fixed' })
  if (!p || !(p.qty > 0)) return null
  return { perSqm: (p.qty * (Number(p.mat.avg_unit_cost) || 0)) / ((sideMm / 1000) * (LONG / 1000)), mat: p.mat }
}

let bandCount = 0
for (const [grp, rolls] of [...fams].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (rolls.length < 2) continue
  const pool = rolls.map((r) => ({
    material_item_id: r.id, material_name: r.code, width_mm: Number(r.w),
    deduction_method: 'ROLL', sheet_spec: null, waste_factor: 1,
    base_unit: r.bu, unit: r.unit, pack_size: r.pack, avg_unit_cost: Number(r.cost),
  }))
  const widths = [...new Set(rolls.map((r) => Number(r.w)))].sort((a, b) => a - b)
  const maxCm = Math.round(widths[widths.length - 1] / 10)
  const codes = [...new Set(String(rolls[0].products || '').split(','))].filter(Boolean)
  const lines = codes.flatMap((c) => byCode.get(c) || [])

  // 1cm 씩 훑어 어느 원단이 뽑히는지 — 담당 구간은 그 결과에서 나온다(추정하지 않는다).
  const at = new Map()
  for (let cm = 10; cm <= maxCm; cm++) at.set(cm, perSqm(pool, cm * 10))

  let prevEnd = null
  for (const W of widths) {
    const mine = [...at].filter(([, r]) => r && Number(r.mat.width_mm) === W).map(([cm]) => cm)
    const anyRow = rolls.find((r) => Number(r.w) === W)
    const winner = at.get(Math.round(W / 10))
    const rollPrice = mine.length ? Number(at.get(mine[0]).mat.avg_unit_cost) : Number(anyRow.cost)
    const code = mine.length ? at.get(mine[0]).mat.material_name : anyRow.code

    if (!mine.length) {
      // 어떤 변 길이에서도 안 뽑힌다 = 더 싸고 더 넓은 원단에 완전히 밀렸다.
      bandRows.push([
        grp, code, { v: Math.round(W / 10), s: S.INT }, { v: Math.round(rollPrice), s: S.INT },
        { v: Math.round(rollPrice * 1093.6 / W), s: S.INT },
        { v: '선택 안 됨', s: S.WARN }, null, null, null,
        winner ? `${winner.mat.material_name}(${Math.round(Number(winner.mat.width_mm) / 10)}폭)가 더 싸다` : '',
        null, null, null, null, null, codes.join(' · '),
      ])
      bandCount++
      continue
    }
    const lo = Math.min(...mine), hi = Math.max(...mine)
    const a = at.get(lo).perSqm, b = at.get(hi).perSqm
    const inBand = lines.filter((r) => r.side >= lo && r.side <= hi)
    const sSales = inBand.reduce((s, r) => s + Number(r.sales || 0), 0)
    const sSqm = inBand.reduce((s, r) => s + Number(r.sqm || 0), 0)
    const sMat = inBand.reduce((s, r) => s + Number(r.mat || 0), 0)
    const sLines = inBand.reduce((s, r) => s + Number(r.lines || 0), 0)
    const sellSqm = sSqm > 0 ? sSales / sSqm : null
    const matSqm = sSqm > 0 ? sMat / sSqm : null
    bandRows.push([
      grp, code, { v: Math.round(W / 10), s: S.INT }, { v: Math.round(rollPrice), s: S.INT },
      { v: Math.round(rollPrice * 1093.6 / W), s: S.INT },
      `${lo}~${hi}`,
      { v: Math.round(a), s: S.INT }, { v: Math.round(b), s: S.INT },
      prevEnd ? { v: a / prevEnd, s: S.DEC2 } : null,
      '',
      { v: sLines || null, s: S.INT }, { v: sSales ? Math.round(sSales) : null, s: S.INT },
      { v: sellSqm ? Math.round(sellSqm) : null, s: S.INT },
      { v: matSqm ? Math.round(matSqm) : null, s: S.INT },
      { v: sellSqm && matSqm ? Math.round(sellSqm - matSqm) : null, s: S.INT },
      codes.join(' · '),
    ])
    prevEnd = b
    bandCount++
  }
  bandRows.push([])
  prevEnd = null
}
// ── 시트 14: 제품 × 폭구간 ────────────────────────────────────────────────────
// 「폭구간원가」는 **원단군** 단위라 한 줄에 여러 제품이 섞인다(AQ-BANNER · AQ-WDB).
// 수성 재료비율이 왜 높은지 보려면 **제품마다** 어느 구간에서 새는지 봐야 한다.
// 실적이 있는 구간만 낸다 — 없는 구간까지 깔면 수백 줄이 되어 못 읽는다.
console.log('[9b/10] 제품 × 폭구간')
const pmRows = q(`
  SELECT p.item_code AS pcode, p.item_name AS pname, p.category AS cat,
         m.id AS mid, m.item_code AS mcode, m.width_mm AS w, m.avg_unit_cost AS cost,
         m.base_unit AS bu, m.unit, m.pack_size AS pack
  FROM product_materials pm
  JOIN items p ON p.id = pm.product_item_id
  JOIN items m ON m.id = pm.material_item_id
  WHERE COALESCE(pm.material_role,'BASE') = 'BASE'
    AND COALESCE(m.deduction_method,'ROLL') = 'ROLL'
    AND m.width_mm > 0 AND m.avg_unit_cost > 0`)

const pools = new Map()
for (const r of pmRows) {
  if (!pools.has(r.pcode)) pools.set(r.pcode, { cat: r.cat, name: r.pname, mats: [] })
  pools.get(r.pcode).mats.push({
    material_item_id: r.mid, material_name: r.mcode, width_mm: Number(r.w),
    deduction_method: 'ROLL', sheet_spec: null, waste_factor: 1,
    base_unit: r.bu, unit: r.unit, pack_size: r.pack, avg_unit_cost: Number(r.cost),
  })
}

const pxRows = [
  ...head(
    '제품 × 폭 구간 — 어느 제품의 어느 규격에서 새는가',
    '「폭구간원가」는 원단군 단위라 제품이 섞인다. 여기서는 제품마다 실적이 있는 구간만 뽑았다',
    '★판정은 출력마진 원/㎡(판매 − 재료). 단가 정책이 「출력비 + 원자재」라 이 값이 구간마다 평평해야 정상이다'
  ),
  hdr(['분류', '제품코드', '제품명', '구간(변 cm)', '원단', '라인', '매출', '실면적㎡',
    '판매 원/㎡', '재료 원/㎡', '출력마진 원/㎡', '재료비율'], [5, 6, 7, 8, 9, 10, 11]),
]

const prodSales = new Map()
for (const [code, arr] of byCode) prodSales.set(code, arr.reduce((s, r) => s + Number(r.sales || 0), 0))

const ordered = [...pools.keys()]
  .filter((c) => (prodSales.get(c) || 0) > 0)
  .sort((a, b) => (pools.get(a).cat || '').localeCompare(pools.get(b).cat || '') ||
                  (prodSales.get(b) || 0) - (prodSales.get(a) || 0))

for (const pcode of ordered) {
  const { cat, name, mats } = pools.get(pcode)
  const widths = [...new Set(mats.map((m) => Number(m.width_mm)))].sort((a, b) => a - b)
  const maxCm = Math.round(widths[widths.length - 1] / 10)
  const lines = byCode.get(pcode) || []
  // 이 제품 라인의 짧은 변마다 어느 원단이 뽑히는지 → 그 원단으로 묶는다.
  const bucket = new Map()
  for (const L of lines) {
    const side = Number(L.side)
    const r = side > 0 && side <= maxCm ? perSqm(mats, side * 10) : null
    const key = r ? r.mat.material_name : `${maxCm}폭 초과(분할)`
    if (!bucket.has(key)) bucket.set(key, { lo: side, hi: side, lines: 0, sales: 0, sqm: 0, mat: 0 })
    const b = bucket.get(key)
    b.lo = Math.min(b.lo, side); b.hi = Math.max(b.hi, side)
    b.lines += Number(L.lines || 0); b.sales += Number(L.sales || 0)
    b.sqm += Number(L.sqm || 0); b.mat += Number(L.mat || 0)
  }
  for (const [mcode, b] of [...bucket].sort((x, y) => x[1].lo - y[1].lo)) {
    if (!(b.sqm > 0)) continue
    const sell = b.sales / b.sqm, matS = b.mat / b.sqm
    pxRows.push([
      cat, pcode, name, `${b.lo}~${b.hi}`, mcode,
      { v: b.lines, s: S.INT }, { v: Math.round(b.sales), s: S.INT }, { v: Math.round(b.sqm), s: S.INT },
      { v: Math.round(sell), s: S.INT }, { v: Math.round(matS), s: S.INT },
      { v: Math.round(sell - matS), s: S.INT },
      { v: b.sales > 0 ? b.mat / b.sales : null, s: S.PCT },
    ])
  }
}

rollCleanup()


// ── 쓰기 ──────────────────────────────────────────────────────────────────────
console.log('[10/10] 워크북 쓰기')

/**
 * 같은 이름의 파일을 엑셀에서 열어 둔 채 다시 만들면 Windows 가 EBUSY 로 막는다.
 * 그때 죽어 버리면 조회를 다 하고도 결과가 사라지므로, 옆 이름으로 저장하고 그 사실을 알린다.
 */
function writeSafely(target, sheets) {
  try {
    return writeWorkbook(target, sheets)
  } catch (e) {
    if (e?.code !== 'EBUSY' && e?.code !== 'EPERM') throw e
    const alt = target.replace(/\.xlsx$/i, '') + '_' + new Date().toTimeString().slice(0, 5).replace(':', '') + '.xlsx'
    const out = writeWorkbook(alt, sheets)
    console.log(`  ⚠️ ${target} 가 열려 있어(EBUSY) 다른 이름으로 저장했습니다.`)
    return out
  }
}

// 「산식·주의」는 산문 시트다 — 본문 열을 **줄바꿈**으로 돌리지 않으면 한 줄이 화면 밖으로 나간다.
//   구역 제목(단독 굵은 줄)은 배경을 깔아 눈이 걸리게 한다.
for (const r of noteRows) {
  if (r.length === 1 && typeof r[0] === 'object' && r[0]?.s === S.BOLD) r[0] = { v: r[0].v, s: S.SECTION }
  if (r.length === 2) {
    if (typeof r[0] !== 'object') r[0] = { v: r[0], s: S.BOLD }
    if (typeof r[1] !== 'object') r[1] = { v: r[1], s: S.NOTEW }
  }
}

/** 데이터 구간(머리글 다음 행 ~ 끝)의 한 열 범위. 조건부 서식에 쓴다. */
const span = (col, rows, hdrRow = TOP) => `${col}${hdrRow + 1}:${col}${rows.length}`

const abs = writeSafely(OUT, [
  { name: '요약', rows: sumRows, ...sheetOpts(11, HDR, {
    tabColor: TAB.SUM, noFilter: true, freezeCol: 1,
    condFormat: [{ ref: `F${HDR + 1}:F${lastCat}`, kind: 'scale' }, { ref: `B${HDR + 1}:B${lastCat}`, kind: 'bar' }],
  }) },
  { name: '단가설계', rows: dsRows, ...sheetOpts(14, DHDR, {
    tabColor: TAB.DESIGN, titleRows: 1, freezeCol: 3,
    widths: [8, 14, 24, 9, 13, 14, 11, 13, 11, 10, 10, 11, 14, 8],
    condFormat: [{ ref: span('L', dsRows, DHDR), kind: 'scale', reverse: true }],
  }) },
  { name: '기본사양', rows: specRows, ...sheetOpts(11, TOP, {
    tabColor: TAB.DESIGN, freezeCol: 3,
    widths: [8, 14, 24, 9, 13, 11, 10, 40, 26, 26, 20],
  }) },
  { name: '계산식', rows: calcRows, ...sheetOpts(22, CHDR, { tabColor: TAB.DESIGN, freezeCol: 1 }) },
  { name: '산식·주의', rows: noteRows, freeze: 0, widths: [24, 118], tabColor: TAB.REF },
  { name: '제품별원가율', rows: itemRows, ...sheetOpts(14, TOP, {
    tabColor: TAB.EVIDENCE, freezeCol: 3,
    condFormat: [{ ref: span('M', itemRows), kind: 'scale' }, { ref: span('H', itemRows), kind: 'bar' }],
  }) },
  { name: '규격별원가율', rows: sizeRows, ...sheetOpts(16, TOP, {
    tabColor: TAB.EVIDENCE, freezeCol: 2,
    condFormat: [{ ref: span('P', sizeRows), kind: 'scale' }],
  }) },
  { name: '단가편차', rows: spRows, ...sheetOpts(13, SPHDR, {
    tabColor: TAB.EVIDENCE, freezeCol: 3,
    condFormat: [{ ref: span('K', spRows, SPHDR), kind: 'scale' }],
  }) },
  { name: '원단단가', rows: matRows, ...sheetOpts(12, TOP, {
    tabColor: TAB.PRICE, freezeCol: 2,
    widths: [14, 26, 24, 9, 11, 11, 10, 10, 11, 13, 11, 60],
    condFormat: [{ ref: span('J', matRows), kind: 'scale' }],
  }) },
  { name: '잉크단가', rows: inkRows, ...sheetOpts(5, TOP, { tabColor: TAB.PRICE, noFilter: true, widths: [12, 11, 13, 10, 70] }) },
  { name: '장비·잉크', rows: eqRows, ...sheetOpts(8, EHDR, {
    tabColor: TAB.REF, noFilter: true, widths: [24, 9, 13, 11, 12, 14, 15, 60],
  }) },
  { name: '폭구간원가', rows: bandRows, ...sheetOpts(13, TOP, {
    tabColor: TAB.PRICE, freezeCol: 2,
    widths: [26, 13, 16, 8, 10, 15, 14, 13, 10, 13, 14, 12, 40],
    condFormat: [{ ref: span('F', bandRows), kind: 'scale' }, { ref: span('L', bandRows), kind: 'scale' }],
  }) },
  { name: '제품x폭구간', rows: pxRows, ...sheetOpts(12, TOP, {
    tabColor: TAB.EVIDENCE, freezeCol: 3,
    widths: [8, 14, 24, 13, 16, 9, 13, 11, 12, 12, 15, 11],
    condFormat: [{ ref: span('K', pxRows), kind: 'scale', reverse: true },
                 { ref: span('L', pxRows), kind: 'scale' }],
  }) },
  { name: '후가공', rows: ppRows, ...sheetOpts(8, PHDR, { tabColor: TAB.PRICE, widths: [14, 18, 13, 11, 11, 12, 8, 28] }) },
])
console.log(`\n생성: ${abs}`)
console.log(`  요약 ${byCat.length}분류 · 제품 ${byItem.length} · 규격 ${bySize.length} · 편차 ${spread.length}`)
console.log(`  자재 ${mats.length} · 잉크군 ${inkItems.length} · 장비 ${equipment.length} · 후가공 ${ppOptions.length} · 시뮬 ${simCases.length}행`)
