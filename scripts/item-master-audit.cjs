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
 * 검사 (A~D·F = 규약 위반 · E = 추세 지표)
 *   A 규격에 계열 고정값   `*7m`·`*3m` 처럼 형제 전원이 공유하는 값 (참고 — 롤 사양은 남기는 게 맞다)
 *   B 규격에 색상          색이 품명에도 규격에도 있다 (참고 — 규격이 완결적이면 둬도 된다)
 *   C1 단위 혼재           수량 있는 매입 단가가 50배 이상 벌어진다 — 롤/yd 가 섞였다 (게이트)
 *   C2 수량 없는 매입      `수량 1 · 단가=금액` 인 뭉친 전표 — 실수량을 몰라 원가가 서지 않는다 (참고)
 *   D 품명↔코드 불일치     코드의 식별 토큰(180G·5T)이 품명과 어긋난다
 *   F 재고단위 정합성      수량(base)과 단가의 기준이 어긋난다 — 평가액이 pack_size 배로 튄다
 *   E 건강 지표            원가없음·규격없음·무실적·판매플래그 불일치 (절대값이 아니라 **추세**를 본다)
 *
 *   F4 무효한 ROLL        개수 단위인데 `deduction_method=ROLL` — 라벨이 `yd` 로 나온다 (게이트)
 *   F5 기준단가 축 오류    `base_price` 가 관리단위(롤)가 아니라 재고단위(M) 당 값이다 (게이트)
 *
 * ★ 등급을 나눈다 — **C1·D·F1·F4·F5·G1·H4a 만 게이트(exit 1)**, A·B·C2·F2·F3 는 참고(exit 0).
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
  COALESCE(category,'') cat, COALESCE(unit,'') unit, COALESCE(avg_unit_cost,0) cost,
  COALESCE(item_group,'') grp, COALESCE(search_keywords,'') kw, COALESCE(item_type,'') itype
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

// ── C. 매입 단가 이상 — C1 단위 혼재(게이트) · C2 수량 없는 매입(참고) ──
//
// ★2026-08-26 분리. 종전에는 한 검사였고 **영구 빨간불**이었다(같은 4건이 상주).
//   그 4건을 실측하니 **단위 혼재는 하나도 없었다** — 전부 `수량 1 · 단가=금액` 인 월합계 전표였다
//   (운산 07-31 421만 · 부림엔에프 3건 · 「바로」 4건 · 영광엔터 월별 7건).
//   뭉친 전표는 **코드로 못 고친다** — 공급처 청구서 실명세가 있어야 품목별로 쪼갤 수 있다.
//   못 고치는 것을 게이트에 두면 **새 위반이 그 빨간불 뒤에 숨는다**. 그래서 C2 는 참고축이다.

// C1 = 진짜 단위 혼재(50m 롤 = 54.68yd). **수량이 있는 라인만** 본다 —
//      수량 1 라인은 단가가 곧 금액이라 애초에 단가로 읽을 수 없고,
//      섞어 넣으면 모든 뭉친 전표가 「단위 혼재」로 오진된다.
const mixed = d1(`SELECT i.item_code, i.item_name,
    CAST(MIN(p.unit_price) AS INT) lo, CAST(MAX(p.unit_price) AS INT) hi, COUNT(*) n,
    COUNT(DISTINCT p.unit) units
  FROM purchase_order_items p JOIN items i ON i.id = p.item_id
  WHERE i.is_active = 1 AND p.unit_price > 0 AND p.quantity <> 1
  GROUP BY i.id HAVING MAX(p.unit_price) >= MIN(p.unit_price) * 50`)
for (const m of mixed) add(m.item_code, 'C1 단위 혼재',
  `수량 있는 매입 단가 ${Number(m.lo).toLocaleString()} ~ ${Number(m.hi).toLocaleString()} (${m.n}행·단위표기 ${m.units}종) — 롤/yd 처럼 단위가 섞였다`)

// C2 = 수량 없는 매입. **그 자체로는 잘못이 아니다** — 용역·1식 매입이 원래 그렇다.
//   해악은 두 갈래다: ① 실수량을 몰라 `avg_unit_cost` 가 서지 않는다
//   ② 대금이 뭉침 품목에 다 붙어 **정작 팔리는 개별 품목은 매입 0 건**이 된다
//      (깃대 계열 ACC-031·032·033·037 은 판매 4,189만인데 매입 라인이 하나도 없다 —
//       영광엔터 대금이 `ACC-051` 월합계로 들어가 있기 때문이다).
// ★판정은 `lump-voucher-report.cjs` 한 곳에만 둔다 — 여기에 사본을 두면 감사와 보고서의
//   숫자가 갈린다. 공급처별 추적표·CSV 는 `npm run report:lump`.
const { collectLumpLines } = require('./lump-voucher-report.cjs')
const { lines: lumpLines, dropped: lumpDropped } = collectLumpLines(d1)
const lumpByItem = new Map()
for (const l of lumpLines) {
  if (!lumpByItem.has(l.item_code)) lumpByItem.set(l.item_code, { n: 0, amt: 0, sup: new Set() })
  const e = lumpByItem.get(l.item_code)
  e.n++; e.amt += l.amt; e.sup.add(l.supplier)
}
for (const [code, e] of [...lumpByItem].sort((a, b) => b[1].amt - a[1].amt)) {
  add(code, 'C2 수량 없는 매입',
    `${e.n}행 ${Number(e.amt).toLocaleString()}원이 수량 1·단가=금액 (${[...e.sup].join('·')})`)
}
const lumpTotal = lumpLines.reduce((a, l) => a + l.amt, 0)

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

// ── F. 재고단위(base_unit) 정합성 ────────────────────────────────────────
// ★왜 뒤늦게 붙었나 (2026-08-26): 이 스크립트에 `base_unit` 참조가 **0회**였다.
//   수량과 단가를 둘 다 base 로 넣어 **평가액 50배**를 낸 축인데 감사가 안 보고 있었다
//   ([[design-stock-base-unit-rebase]]). C(단가 스케일)는 **매입 단가끼리** 비교하므로
//   "매입은 일관되게 통 단가인데 재고 수량만 L" 인 이 결함을 원리적으로 못 잡는다.
//
// 단위 3층 = unit(입고·발주) / base_unit(재고·소모) / pack_size(환산 계수).
//   재고 수량이 base 로 저장되면 **단가도 base 기준**이어야 평가액이 맞는다(수량×pack ÷ 단가×pack = 불변).
const unitRows = d1(`SELECT i.item_code, i.item_name,
    COALESCE(i.base_unit,'') bu, COALESCE(i.unit,'') un, COALESCE(i.pack_size,0) ps,
    COALESCE(i.deduction_method,'') dm, i.width_mm wmm,
    CAST(COALESCE(i.avg_unit_cost,0) AS INT) auc,
    CAST(COALESCE(i.base_price,0) AS INT) bp,
    CAST(COALESCE((SELECT AVG(p.unit_price) FROM purchase_order_items p
                   WHERE p.item_id = i.id AND p.unit_price > 0), 0) AS INT) po_avg
  FROM items i WHERE i.is_active = 1`)

// F4 (게이트) — 무효한 `ROLL` 이 재고 단위 라벨을 `yd` 로 만든다.
//   ★2026-08-27 실측: 활성 품목 **409건**이 개수 단위(EA·장)인데 `deduction_method='ROLL'` 이었고,
//     `resolveStockUnit` 이 base_unit 없는 ROLL 을 `yd` 로 떨어뜨려 **봉·아일렛·판재가 야드로 표시**됐다.
//   원인은 스키마 기본값 — `deduction_method TEXT DEFAULT 'ROLL'` 이라 지정 없이 만든 품목에 전부 흘러든다.
//   ★ROLL 차감은 `deduction_method='ROLL' AND width_mm != null` 로 걸러지므로(`autoDeductInventory.ts:139`)
//     width 없는 ROLL 은 **차감에 아예 못 들어간다** — 즉 설정이 무효인데 라벨만 망가뜨린다.
//     그래서 고치는 값은 `NONE`(라벨이 `unit` 으로 떨어진다)이고, 동작 변화는 0이다.
//   ⛔판재를 `BOARD` 로 올리는 건 **여기서 하지 않는다** — `sheet_spec` 이 비면 4x8 로 폴백해
//     `-36`(3x6) 계열이 과소차감되고, 지금 무차감인 BOM 품목에 차감이 갑자기 붙는다.
const PIECE_UNITS = ['EA', '장', '개', '통', '세트', 'SET', '박스', '팩']
for (const r of unitRows) {
  if (r.dm.toUpperCase() !== 'ROLL') continue
  if (r.bu) continue                                   // base_unit 이 있으면 그게 라벨이라 문제없다
  if (r.wmm != null) continue                          // 폭이 있으면 진짜 롤이다
  if (!PIECE_UNITS.includes(r.un)) continue            // yd·롤·m 은 라벨이 맞는다
  add(r.item_code, 'F4 무효한 ROLL',
    `단위가 ${r.un} 인데 deduction_method=ROLL·폭 없음 — 차감엔 안 걸리고 재고 라벨만 「yd」로 나온다. NONE 이어야 한다`)
}

let f2 = 0, f3 = 0
for (const r of unitRows) {
  // F1 (게이트) — 수량은 base 인데 단가가 관리단위 그대로다.
  //   ★판정은 **두 후보 중 어느 쪽에 더 가까운가**로 한다 — 「매입단가의 N% 이상」 같은 단일 임계는 못 쓴다.
  //     pack_size 가 1.5 처럼 작으면 환산값(÷1.5 = 66.7%)과 미환산값(100%)이 붙어서,
  //     임계 80% 로 잡으면 **제대로 나눈 품목까지 잡힌다**(코스테크 수성 RM-I0007~0010 이 그랬다).
  //   ⚠️ base_unit 이 빈 품목은 제외한다 — AQ* 처럼 **애초에 base 로 안 옮긴 무리**라 통 단가가 정상이다.
  if (r.bu && r.ps > 1 && r.auc > 0 && r.po_avg > 0) {
    const divided = r.po_avg / r.ps
    if (Math.abs(r.auc - r.po_avg) < Math.abs(r.auc - divided)) {
      add(r.item_code, 'F1 재고단가 미환산',
        `재고는 ${r.bu} 인데 단가 ${Number(r.auc).toLocaleString()} 가 ${r.un} 단가(${Number(r.po_avg).toLocaleString()}) 그대로다`
        + ` — ÷${r.ps} = ${Math.round(divided).toLocaleString()} 이어야 하고, 평가액이 ${r.ps} 배 부푼다`)
      continue
    }
  }
  // F2 (참고) — 관리단위≠재고단위인데 환산 계수가 없다. 입고가 ×1 로 들어가 수량이 pack 배 적게 잡힌다.
  if (r.bu && r.ps <= 1 && r.un && r.un.toLowerCase() !== r.bu.toLowerCase()) { f2++; continue }
  // F3 (참고) — 환산 계수는 있는데 재고 단위가 없다.
  //   ★2026-08-27 정정: 종전 주석은 「×pack_size 로 수량이 늘어난다」였는데, 그건 **버그**였지 사양이 아니었다.
  //     쓰기 경로 5곳이 base_unit 을 안 보고 환산해 현수막 원단(AQ*)이 130배로 들어오던 것 —
  //     `unitConvert.packFactor()` 로 막았다. 지금 이 무리는 「환산하지 않는 품목」으로 안전하게 처리된다.
  //     남은 건 메타데이터 미완성(진짜 롤인데 base_unit 을 안 넣은 LW2800M·LM5400-137 같은 것)뿐이라 참고축이다.
  if (!r.bu && r.ps > 1) f3++
}

// F5 (게이트) — `base_price` 축이 어긋났다. 재고 단가(base)와 같은 값이 관리단위 칸에 들어 있다.
//
// ★왜 (2026-08-27 전수조사): `items.base_price` 는 **관리단위(롤·통) 당** 값이다 —
//   입고(`po-receive`)가 매입 단가로 덮어쓰고, 2026-08-11 `derive-item-prices.cjs` 가
//   **판매 실거래 중앙값**을 심었다. 즉 이 칸은 「포장 하나의 값」이고, 주문서 품목 선택기가
//   그대로 프리필한다(`shell.js` data-price). 여기에 미터당 단가가 들어 있으면
//   **롤 하나를 1/pack 가격에 견적**하게 된다(실측 ULTRA-CAL-100: 2,700원 vs 실제 판매 87,000원).
//
//   판정은 F1 과 같은 방식 — 두 후보 중 어디에 더 가까운가. prod 실측 분포가 뚜렷하게 갈렸다:
//   정상군 100건은 `bp ÷ (auc×pack)` 이 **0.978~1.638**, 어긋난 4건은 **0.019~0.034** 였다.
//   ⚠️ base_unit 이 없는 품목(AQ*)은 애초에 한 축이라 제외한다.
for (const r of unitRows) {
  if (!r.bu || !(r.ps > 1) || !(r.bp > 0) || !(r.auc > 0)) continue
  const expect = r.auc * r.ps
  if (Math.abs(r.bp - r.auc) < Math.abs(r.bp - expect)) {
    add(r.item_code, 'F5 기준단가 축 오류',
      `${r.un} 당 단가여야 할 base_price ${Number(r.bp).toLocaleString()} 가 ${r.bu} 당 단가다`
      + ` — 매입원가 ${Number(r.auc).toLocaleString()}/${r.bu} × ${r.ps} = ${Math.round(expect).toLocaleString()} 축이어야 한다`
      + ` (주문서가 이 값을 ${r.un} 단가로 프리필한다)`)
  }
}

// ── G. 계열(item_group)·검색어 정합성 ────────────────────────────────────
// ★왜 (2026-08-26): TPM 잉크 8품목이 `item_group='수성잉크 잉크테크'` 에 들어가 있었다.
//   빈 껍데기 4품목(「현수막 잉크-*」)이 반대로 `수성잉크 TPM` 을 차지해 **두 그룹이 뒤바뀐** 상태였다.
//   증상은 검색어였다 — 잉크테크의 「수성잉크 C/M/Y/K/LC/LM」 블롭이 TPM 에 통째로 복사돼
//   「수성잉크 C」 한 단어가 20품목에 매칭됐다. 그런데 **검색어만 고치면 원인이 남는다**:
//   `item_group` 은 `user_item_access`(사용자별 사용품목)의 축이라 오배정은 **권한까지 어긋나게 한다**.
const norm = (s) => String(s || '').replace(/[\s()（）\[\]_/·]/g, '').toLowerCase()
const groupTokens = (g) => String(g || '').split(/\s+/).map((t) => norm(t)).filter((t) => t.length >= 2)

// G1 — 품명이 자기 그룹은 안 가리키는데 **다른 그룹은 가리킨다**.
//   ⚠️ 「자기 그룹을 안 가리킨다」만으로는 못 쓴다 — 142건이 나오고 대부분 오탐이다.
//      `item_group` 에는 제품라인형(「수성잉크 잉크테크」)과 **범주형**(「배너 부속품」·「게양 부속품」)이 섞여 있고,
//      범주형은 품명이 그룹명을 반복하지 않는 게 정상이다(「삼발이받침대」가 「배너 부속품」에 있는 건 맞다).
//   ⇒ **더 잘 맞는 그룹이 실재할 때만** 지목한다. 그게 오배정의 지문이다
//      (「TPM잉크 C 20L」이 「수성잉크 잉크테크」에 있는데 「수성잉크 TPM」 그룹이 따로 있었다).
//   ⚠️ 「엡손솔벤잉크 11색기」↔「엡손 솔벤잉크 9140/8140 C」 처럼 띄어쓰기만 다른 게 흔해 정규화가 필수다.
//   ★한 번 더 좁힌다 — **형제 그룹**(첫 토큰이 같은 그룹)끼리만 본다.
//      「그냥 다른 그룹을 가리킨다」로 두면 87건이 나오는데, 대부분 **범주 그룹 ↔ 세부 그룹** 관계다
//      (「깃대(기타)」가 「게양 부속품」에 있고 「깃대 파이프」 그룹도 따로 있는 건 둘 다 맞다).
//      형제끼리는 그런 포함 관계가 없어서, 변별 토큰이 엇갈리면 그건 **바뀐 것**이다.
const allGroups = [...new Set(items.map((i) => i.grp).filter(Boolean))]
const groupTokMap = new Map(allGroups.map((g) => [g, groupTokens(g)]))
const headOf = (g) => (groupTokMap.get(g) || [])[0] || ''
for (const it of items) {
  if (!it.grp) continue
  const own = groupTokMap.get(it.grp) || []
  if (own.length < 2) continue                       // 변별 토큰이 없는 단일어 그룹은 판단하지 않는다
  const n = norm(it.item_name)
  if (own.some((t) => n.includes(t))) continue
  const head = headOf(it.grp)
  const siblings = allGroups.filter((g) => g !== it.grp && headOf(g) === head && (groupTokMap.get(g) || []).length >= 2)
  const hit = siblings.filter((g) => groupTokMap.get(g).slice(1).some((t) => n.includes(t)))
  if (!hit.length) continue
  add(it.item_code, 'G1 계열 오배정 의심',
    `품명 「${it.item_name}」 은 그룹 「${it.grp}」 가 아니라 형제 그룹 「${hit.slice(0, 2).join('」·「')}」 를 가리킨다`)
}

// G2 — 같은 검색어 블롭이 여러 그룹에 걸쳐 있다. 한쪽에서 복사된 흔적이거나 그룹이 갈려야 할 무리다.
const byKw = new Map()
for (const it of items) {
  if (!it.kw) continue
  if (!byKw.has(it.kw)) byKw.set(it.kw, [])
  byKw.get(it.kw).push(it)
}
let g2 = 0
for (const [kw, list] of byKw) {
  const groups = new Set(list.map((i) => i.grp || '(그룹없음)'))
  if (groups.size < 2) continue
  g2++
  add(list[0].item_code, 'G2 검색어 계열 혼재',
    `「${kw.slice(0, 30)}…」 블롭이 ${list.length}품목 · ${groups.size}계열에 걸쳐 있다 (${[...groups].join(' / ')})`)
}
const g3 = items.filter((i) => !i.grp).length

// ── H. 제품↔원자재 축 ────────────────────────────────────────────────────
// 겹업(dual 플래그)이 정상인 도메인이라 `is_sales_item`/`is_purchase_item` 로는 못 가른다
// ([[design-item-role-multi-flag]]). **실제 거래가 한쪽으로만 있는데 분류가 반대**인 것만 본다.
// 주문서 선택기가 `exclude_type=MATERIAL` 로 자르므로 오분류는 **품목이 안 보이거나 원단이 딸려오는** 결과가 된다.
const roleRows = d1(`SELECT i.item_code, i.item_name, COALESCE(i.item_type,'') itype,
    (SELECT COUNT(*) FROM order_items o WHERE o.item_id = i.id) sn,
    (SELECT COUNT(*) FROM purchase_order_items p WHERE p.item_id = i.id) pn
  FROM items i WHERE i.is_active = 1`)
const h1 = roleRows.filter((r) => r.itype === 'MATERIAL' && r.pn === 0 && r.sn > 0)
const h2 = roleRows.filter((r) => r.itype === 'PRODUCT' && r.sn === 0 && r.pn > 0)

// ── H4 (게이트) — 계열 안에서 **혼자만 다른 `item_type`** ────────────────
// ★왜 H1·H2 를 게이트로 못 쓰나 (2026-08-26 실측): H2 49건을 계열별로 갈라 보니
//   **대부분이 형제와 일관되게 PRODUCT** 였다(GDS-EQ 장비 11/11 · 포맥스 FMX-PMT 24/24 · FMX-YES 12/12 ·
//   포장박스 5/5). 「아직 안 팔린 제품」과 「분류가 틀린 제품」이 같은 조건에 걸린다.
//   개별로 뒤집으면 **형제가 갈라져 오히려 나빠진다** — 계열 전체를 옮길지는 사람이 정할 일이다.
//   진짜 신호는 **계열 안의 소수파**다(「게양 부속품」 21건 중 16이 GOODS 인데 5건만 PRODUCT).
// 계열 축 = `item_group`, 없으면 코드 접두(두 번째 '-' 까지). 표본이 작으면 다수결이 무의미하니 5건 이상만 본다.
const famKeyOf = (it) => {
  if (it.grp) return `G:${it.grp}`
  const c = String(it.item_code)
  const i1 = c.indexOf('-')
  if (i1 < 0) return `C:${c}`
  const i2 = c.indexOf('-', i1 + 1)
  return `C:${i2 < 0 ? c : c.slice(0, i2)}`
}
const famType = new Map()
for (const it of items) {
  const k = famKeyOf(it)
  if (!famType.has(k)) famType.set(k, new Map())
  const m = famType.get(k)
  m.set(it.itype, (m.get(it.itype) || 0) + 1)
}
for (const it of items) {
  if (!it.itype) continue
  const m = famType.get(famKeyOf(it))
  const total = [...m.values()].reduce((a, b) => a + b, 0)
  if (total < 5) continue
  const [majType, majN] = [...m].sort((a, b) => b[1] - a[1])[0]
  if (majType === it.itype) continue
  if (majN / total < 0.7) continue              // 계열이 반반이면 다수결이 근거가 못 된다
  add(it.item_code, 'H4a 계열 소수 분류',
    `${it.itype} 인데 계열 ${majN}/${total} 이 ${majType} 다 (${famKeyOf(it).slice(2)})`)
}
// H3 — 같은 품명에 제품과 자재가 공존한다(솔벤 현수막 = 판매 제품 1 + 매입 원단 N폭).
//   설계상 정상이지만 **화면에서 구분이 안 되면** 오선택이 난다 → 품목검색 모달에 구분 배지를 붙였다.
const byName = new Map()
for (const r of roleRows) {
  if (!byName.has(r.item_name)) byName.set(r.item_name, new Set())
  byName.get(r.item_name).add(r.itype)
}
const h3 = [...byName].filter(([, t]) => t.has('PRODUCT') && t.has('MATERIAL'))

// ── 보고 ─────────────────────────────────────────────────────────────────
// 게이트 = C1·D·F1·G1·H4a. 전부 "어느 경우에도 잘못"인 것만 골랐다(나머지는 사람 판단이 필요).
// ★H1·H2 를 게이트로 두지 않는 이유는 H4a 주석 참조 — 「아직 안 팔린 제품」과 구분이 안 된다.
// ★C2(수량 없는 매입)도 게이트가 아니다 — 용역·1식 매입은 정상이고, 뭉친 전표는 공급처
//   청구서 없이는 못 푼다. 고칠 수 없는 항목을 게이트에 두면 감사 전체가 무뎌진다(C 분리 주석 참조).
const GATE_KIND = /^(C1|D|F1|F4|F5|G1|H4a) /
if (!METRICS_ONLY) {
  if (violations.length) {
    const byKind = new Map()
    for (const v of violations) {
      if (!byKind.has(v.kind)) byKind.set(v.kind, [])
      byKind.get(v.kind).push(v)
    }
    for (const [kind, list] of [...byKind].sort()) {
      const gate = GATE_KIND.test(kind)
      console.log(`\n${gate ? '⚠️  [게이트]' : '·   [참고] '} ${kind} — ${list.length}건`)
      const n = gate ? 20 : 6
      for (const v of list.slice(0, n)) console.log(`   ${v.code.padEnd(20)} ${v.msg}`)
      if (list.length > n) console.log(`   … 외 ${list.length - n}건`)
    }
    if (![...byKind.keys()].some((k) => GATE_KIND.test(k))) {
      console.log('\n[item-audit] ✅ 게이트 항목(C1·D·F1·F4·G1·H4a) 위반 없음 — 위는 판단이 필요한 참고 정보다')
    }
  } else {
    console.log('[item-audit] ✅ 규약 위반 없음 (A~F 전부)')
  }
  if (lumpByItem.size) {
    console.log(`\n·   [참고]  C2 합계 — ${lumpLines.length}행 ${Number(lumpTotal).toLocaleString()}원 (후보 중 ${lumpDropped}행은 반복 단가·스케일 정상이라 제외)`)
    console.log('            공급처별 추적표·CSV = `npm run report:lump`. 청구서 실명세가 있어야 쪼갤 수 있다.')
  }
  // F2·F3 는 개별 지목이 아니라 총량으로 본다 — 지금은 잘못이 아닐 수 있고(미취급·단일단위), 늘어나는 게 신호다.
  console.log(`\n·   [참고]  F2 환산계수 없는 이중단위 ${f2}건 · F3 단위 없는 환산계수 ${f3}건`)
  console.log('            F2=입고가 ×1 로 들어가 수량이 pack 배 적게 잡힌다 · F3=늘어난 수량의 단위가 미정의')

  console.log(`\n·   [참고]  G3 계열(item_group) 미지정 ${g3}건 — 사용자별 사용품목(user_item_access) 축이라 비면 필터가 안 걸린다`)
  console.log('\n■ 제품↔원자재 축 — 실제 거래가 한쪽뿐인데 분류가 반대인 것')
  console.log(`   H1 자재인데 판매만  ${h1.length}건   ⚠️겹업(원자재 그대로 판매)이 정상 포함된다 — 포맥스 원판·조명시트가 그렇다`)
  for (const r of h1.slice(0, 5)) console.log(`      ${r.item_code.padEnd(20)} ${r.item_name} (판매 ${r.sn})`)
  console.log(`   H2 제품인데 매입만  ${h2.length}건   원가·재고 축에서 제품으로 잡혀 BOM 롤업이 어긋난다`)
  for (const r of h2.slice(0, 5)) console.log(`      ${r.item_code.padEnd(20)} ${r.item_name} (매입 ${r.pn})`)
  console.log(`   H3 같은 품명에 제품+자재 공존 ${h3.length}건   설계상 정상 — 화면 구분(품목검색 모달 배지)으로 막는다`)
  if (h3.length) console.log(`      ${h3.slice(0, 5).map(([n]) => n).join(' · ')}`)
  console.log('   ★H1·H2 는 추세용이다 — 계열 전체가 그 유형이면 「아직 안 팔린 제품」일 뿐이라 개별로 뒤집으면 형제가 갈라진다.')
  console.log('     조치 대상은 위 **H4a**(계열 소수 이탈)뿐. 계열 전체를 옮기는 건 사람이 정한다.')
  console.log('     ⛔H2 의 상수 5건 = **외주가공**(깃발 임가공·갈바·도금 1.90억). 용역이라 재고를 잡지 않는다 —')
  console.log('       MES 에 다룰 화면이 없어 `item_type` 을 바꿔도 나아지는 게 없다(2026-08-26 용준님 확정). 재제안 금지.')
}

// ── E. 건강 지표 — 절대값이 아니라 **추세**를 본다 ──────────────────────
// 0 으로 만들 필요는 없다. 늘어나면 이관이 뭔가를 흘리고 있다는 신호다.
const met = d1(`SELECT COUNT(*) total,
    SUM(CASE WHEN COALESCE(avg_unit_cost,0)=0 THEN 1 ELSE 0 END) no_cost,
    SUM(CASE WHEN COALESCE(specification,'')='' THEN 1 ELSE 0 END) no_spec,
    SUM(CASE WHEN NOT EXISTS(SELECT 1 FROM purchase_order_items p WHERE p.item_id=i.id)
          AND NOT EXISTS(SELECT 1 FROM order_items o WHERE o.item_id=i.id) THEN 1 ELSE 0 END) no_tx,
    SUM(CASE WHEN is_sales_item=0 AND EXISTS(SELECT 1 FROM order_items o WHERE o.item_id=i.id) THEN 1 ELSE 0 END) flag_sale,
    SUM(CASE WHEN is_purchase_item=0 AND i.item_code NOT IN ('ETC-SHIP','ETC-EXP','ETC-DISC')
          AND EXISTS(SELECT 1 FROM purchase_order_items p WHERE p.item_id=i.id) THEN 1 ELSE 0 END) flag_buy
  FROM items i WHERE i.is_active=1`)[0]
// ★ETC 3종(SHIP·EXP·DISC)은 **청구 보조 라인**이라 매입차단이 의도된 것이다(2026-08-24 확정 —
//   실비는 운반비 계정이 정본). 과거 매입 라인이 남아 있어 조건에 걸리므로 모수에서 뺀다.
//   빼지 않으면 「즉시 고칠 것」이 영구히 3 을 가리켜 **진짜 불일치가 그 뒤에 묻힌다**.

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

// C·D·F1 만 실패로 처리한다. A·B·F2·F3 는 판단이 필요한 참고 정보라 게이트로 두면 감사가 무뎌진다.
const hard = violations.filter((v) => GATE_KIND.test(v.kind))
process.exit(!METRICS_ONLY && hard.length ? 1 : 0)
