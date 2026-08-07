#!/usr/bin/env node
/**
 * 신규 품목 중복 감사 — 이관 직후 「새로 생긴 품목이 기존 것과 겹치나」를 훑는다.
 *
 * ★ 왜 필요한가 (2026-08-07, 실제로 세 번 당했다)
 *   매입 적재는 **공급처 전표 품명**으로 품목을 찾고, 못 찾으면 새로 만든다.
 *   공급처마다 같은 물건을 다르게 부르므로 이관이 돌 때마다 같은 자재가 새 품목으로 갈린다.
 *     · 정운교역 「트로피칼」            = AQ2 수성 현수막원단 2코팅 (규격에 "BW/2코팅" 이 적혀 있었다)
 *     · 서울경금속 「LG-DPM1270mmSPM011G」 = SPM011G-127
 *     · 「300D 무연새틴」               = 샤틴
 *   갈리면 매입이 BOM 밖 품목으로 새서 원가에서 빠지고, 최악의 경우 같은 폭 자재가 두 개가 되어
 *   자동차감이 어느 쪽에서 나갈지 미정이 된다.
 *
 * ★ 왜 별칭 테이블을 안 만들었나 (용준님 판단 · 실측 근거)
 *   신규 품목 생성이 2026-06 540 → 07 694 → **08 10개**로 떨어졌다. 중복은 이관기 산물이고
 *   이미 잦아들었다. 마이그레이션+적재경로 수정+배포를 붙일 빈도가 아니라서,
 *   **「이관 직후 사람이 훑는다」는 운영 절차**로 대체하기로 했고 이 스크립트가 그 도구다.
 *   (같은 이유로 ROLL 선택 tie-break 도 하지 않았다 — 한 제품에 동폭 자재가 2개 이상 걸린 경우 0건.)
 *
 * 판정 규칙 — 위 세 사례를 그대로 규칙화했다.
 *   R1 코드토큰   신규·기존 item_code 가 4자 이상 영숫자 토큰을 공유    (SATIN300-155 ↔ SATIN-155)
 *   R2 품명→코드  신규 품목명 안의 코드형 토큰이 기존 item_code 에 있다 (LG-DPM1270mm**SPM011G** ↔ **SPM011G**-127)
 *   R3 동폭·동가  같은 width_mm·같은 unit·단가 차 25% 이내             (TROPICAL-070 700/412 ↔ AQ2-070 700/432)
 *   R1/R2 = 강한 신호(exit 1) · R3 = 참고(exit 0). 셋 다 아래 전제를 통과해야 성립한다.
 *
 * 규칙만으로는 못 쓴다 — 전제 3개가 오탐의 90%를 걷어낸다 (전부 실측으로 붙인 것):
 *   ① 같은 분류        「솔벤 텐트천」(제품)↔「수성 텐트천」(자재) 류 차단
 *   ② 다른 코드 체계    같은 체계면 규격 변종이다 (MCP120-060/090/127 · SGM-SMPS-W200/300/400)
 *   ③ 희소 토큰         `P127`·`S135X90`·`GDSET` 같은 공통 접미사는 식별자가 아니다
 *   ①②③ 없이 돌리면 의심 225건이 나오고, 넣으면 14건이 남는다.
 *
 * 사용:
 *   npm run audit:new-items            # 최근 30일
 *   npm run audit:new-items -- --days 90
 *   npm run audit:new-items -- --local # 로컬 D1
 * 의심 건이 있으면 exit 1 (다른 audit:* 과 같은 계약).
 */
const { spawnSync } = require('child_process')

const argv = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt
}
const DAYS = Number(arg('days', 30))
const REMOTE = argv.includes('--local') ? '--local' : '--remote'

function d1(sql) {
  const r = spawnSync(
    `npx wrangler d1 execute webapp-production ${REMOTE} --json --command "${sql.replace(/"/g, '\\"').replace(/\s+/g, ' ').trim()}"`,
    { shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
  if (r.error) { console.error('[new-item-audit] wrangler 실행 오류: ' + r.error.message); process.exit(2) }
  const out = r.stdout || ''
  // wrangler 는 JSON 앞에 배너를 찍는다. 마지막 최상위 배열만 취한다.
  const i = out.lastIndexOf('\n[\n')
  const body = i >= 0 ? out.slice(i + 1) : out.slice(out.indexOf('['))
  let parsed
  try { parsed = JSON.parse(body) } catch (e) {
    console.error('[new-item-audit] 응답 파싱 실패. wrangler 출력:\n' + out.slice(0, 800))
    process.exit(2)
  }
  if (!Array.isArray(parsed) || !parsed[0] || !parsed[0].results) {
    console.error('[new-item-audit] 예상과 다른 응답:\n' + body.slice(0, 800)); process.exit(2)
  }
  return parsed[0].results
}

// ── 데이터 ──
const ITEM_COLS = `id, item_code, item_name, COALESCE(specification,'') sp, width_mm,
  COALESCE(unit,'') unit, COALESCE(category,'') cat, COALESCE(avg_unit_cost,0) cost,
  is_active, substr(created_at,1,10) created`
const fresh = d1(
  `SELECT ${ITEM_COLS},
     (SELECT COUNT(*) FROM purchase_order_items p WHERE p.item_id = items.id) po_n,
     (SELECT CAST(COALESCE(SUM(p.amount),0) AS INT) FROM purchase_order_items p WHERE p.item_id = items.id) po_amt
   FROM items
   WHERE created_at >= date('now', '-${DAYS} day') AND is_active = 1`
)
if (fresh.length === 0) {
  console.log(`[new-item-audit] 최근 ${DAYS}일 신규 품목 없음 — 이상 없음`)
  process.exit(0)
}
const older = d1(
  `SELECT ${ITEM_COLS},
     (SELECT COUNT(*) FROM purchase_order_items p WHERE p.item_id = items.id) po_n
   FROM items WHERE created_at < date('now', '-${DAYS} day') AND is_active = 1`
)

// ── 규칙 ──
const tokens = (s) => {
  const out = new Set()
  for (const t of String(s || '').toUpperCase().split(/[^A-Z0-9]+/)) {
    if (t.length >= 4 && /[A-Z]/.test(t) && !/^\d+$/.test(t)) out.add(t)
  }
  return out
}
// 품목명 안의 코드형 토큰: 영문+숫자가 섞인 4자 이상 덩어리 (SPM011G, LT4071, LD59HTG)
const codeish = (s) => {
  const out = new Set()
  for (const m of String(s || '').toUpperCase().matchAll(/[A-Z]{2,}\d{2,}[A-Z0-9]*/g)) {
    if (m[0].length >= 4) out.add(m[0])
  }
  return out
}
const near = (a, b) => a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) <= 0.25

// ★ R3 를 폭·단가만으로 두면 「고무자석시트 ↔ 솔벤 매쉬」 같은 오탐이 쏟아진다(실측).
//   그래서 **희소 단어 공유**를 함께 요구한다. 희소도는 전체 품목에서의 등장 빈도로 자동 판정하므로
//   「호홍」(공급처)·「시트」·「백색」 같은 흔한 말은 저절로 빠지고 「2코팅」 같은 식별어만 남는다.
//   (트로피칼 ↔ AQ2 는 코드도 품명도 안 겹치고 규격의 "2코팅" 하나로 이어진다 — 그게 이 규칙의 표적이다.)
const words = (it) => {
  const out = new Set()
  for (const w of String((it.item_name || '') + ' ' + (it.sp || ''))
    .split(/[^0-9A-Za-z가-힣]+/)) {
    const t = w.trim()
    if (t.length >= 2 && !/^\d+(cm|mm|m|g|kg)?$/i.test(t)) out.add(t.toUpperCase())
  }
  return out
}
const allItems = fresh.concat(older)
const df = new Map()
for (const it of allItems) for (const w of words(it)) df.set(w, (df.get(w) || 0) + 1)
const RARE_MAX = Math.max(3, Math.round(allItems.length * 0.02)) // 전체의 2% 이하 등장 = 식별어

// ★ 코드 토큰에도 같은 희소도 필터를 건다. 안 걸면 `P127`·`P152`(폭 접미) `S135X90`(규격)
//   `GDSET`·`JASU`(제품유형) 같은 **변별력 없는 공통 접미사**가 R1 을 통째로 오염시킨다
//   (실측: 이것 하나로 의심 42건 중 30건이 허수였다). 식별자는 정의상 몇 개 품목에만 나온다.
const cdf = new Map()
for (const it of allItems) for (const t of tokens(it.item_code)) cdf.set(t, (cdf.get(t) || 0) + 1)
const CODE_RARE_MAX = Math.max(4, Math.round(allItems.length * 0.007))
const rareCode = (t) => (cdf.get(t) || 0) <= CODE_RARE_MAX

// ★ 비교 대상에 신규끼리도 넣는다.
//   한 번의 이관이 같은 자재를 두 품목으로 동시에 만들면 신규↔기존 비교로는 절대 안 걸린다.
//   (실측: LX-LT4510 ↔ LT4510 이 둘 다 이관 생성분이라 1차 버전에서 통째로 새어나갔다.)
//   같은 쌍을 두 번 보고하지 않도록 id 가 큰 쪽(나중에 생긴 쪽)만 신규로 취급한다.
const oldIdx = older.concat(fresh).map((o) => ({ o, codeTok: tokens(o.item_code), wordSet: words(o) }))

const strong = []
const weak = []
for (const f of fresh) {
  const fCodeTok = tokens(f.item_code)
  const fNameTok = codeish(f.item_name + ' ' + f.sp)
  const fWords = words(f)
  const hits = []
  for (const { o, codeTok, wordSet } of oldIdx) {
    if (o.id >= f.id) continue   // 자기 자신 + 신규끼리의 역방향 중복 보고 차단
    // ★ 분류가 다르면 코드토큰만으로는 못 믿는다 — 「솔벤 텐트천」(제품, 분류=솔벤)이
    //   「수성 텐트천」(자재, 분류=원자재)과 TENT 토큰으로 걸리는 식의 오탐이 실측으로 나왔다.
    //   중복 품목은 정의상 **같은 분류의 같은 물건**이므로 분류 일치를 R1/R2 의 전제로 둔다.
    const sameCat = (f.cat || '') === (o.cat || '')
    // ★ 코드 체계가 같으면 **규격 변종**이지 중복이 아니다 — 이걸 안 걸면 MCP120-060/090/127,
    //   SGM-SMPS-W200/300/400, RM-I0001 vs RM-I0001-ITP 처럼 정상 변종이 225건 쏟아진다(실측).
    //   실제 중복은 예외 없이 **코드 체계가 달랐다**:
    //     LX-SPM011G↔SPM011G-137 · SK-1555↔SPM011G-127 · SATIN300-155↔SATIN-155
    //   판별선 = 코드 앞 토큰(첫 '-' 앞)이 서로 다른가.
    const base = (c) => String(c || '').toUpperCase().split('-')[0]
    const diffScheme = base(f.item_code) !== base(o.item_code)
    // ★ 양쪽 다 매입 이력이 0이면 자재 중복이 아니다.
    //   이 감사의 표적은 「매입이 엉뚱한 품목으로 새는 것」이므로 최소 한쪽엔 매입이 있어야 한다.
    //   빼면 「태극기 정기자수 깃발」↔「정기 자수 깃발」, 「민방위기 깃대조립 SET」↔「태극기 깃대조립 SET」
    //   처럼 **판매 제품끼리**가 6건 걸린다 — 서로 다른 제품이지 중복이 아니다(실측).
    //   (샤틴은 한쪽이 0이고 다른 쪽에 매입이 있어 이 조건을 통과한다 — 진짜 중복은 안 놓친다.)
    const anyPurchase = (Number(f.po_n) || 0) > 0 || (Number(o.po_n) || 0) > 0
    const rules = []
    if (sameCat && diffScheme && anyPurchase) {
      for (const t of fCodeTok) if (codeTok.has(t) && rareCode(t)) { rules.push('R1:' + t); break }
      for (const t of fNameTok) if (String(o.item_code).toUpperCase().includes(t)) { rules.push('R2:' + t); break }
    }
    if (f.width_mm && o.width_mm && Number(f.width_mm) === Number(o.width_mm)
        && f.unit === o.unit && near(Number(f.cost), Number(o.cost))) {
      const shared = [...fWords].filter((w) => wordSet.has(w) && (df.get(w) || 0) <= RARE_MAX)
      if (shared.length) rules.push('R3:동폭·동가+' + shared[0])
    }
    if (rules.length) hits.push({ o, rules, hard: rules.some((r) => r.startsWith('R1') || r.startsWith('R2')) })
  }
  if (!hits.length) continue
  hits.sort((a, b) => (b.hard - a.hard) || (b.rules.length - a.rules.length))
  ;(hits.some((h) => h.hard) ? strong : weak).push({ f, hits: hits.slice(0, 3) })
}
const suspects = strong.concat(weak)

// ── 보고 ──
const won = (n) => Number(n).toLocaleString()
console.log(`[new-item-audit] 최근 ${DAYS}일 신규 ${fresh.length}품목 (매입이력 보유 ${fresh.filter((x) => x.po_n > 0).length}) · 비교대상 기존 ${older.length}품목`)

if (suspects.length === 0) {
  console.log('[new-item-audit] ✅ 중복 의심 없음')
  process.exit(0)
}

const byAmt = (a, b) => (b.f.po_amt || 0) - (a.f.po_amt || 0)
const show = (list, title) => {
  if (!list.length) return
  console.log('\n' + title + '\n')
  for (const { f, hits } of list.sort(byAmt)) {
    console.log(`  ${f.item_code}  「${f.item_name}」  ${f.sp ? '규격 ' + f.sp + ' · ' : ''}폭 ${f.width_mm || '-'} · 단가 ${won(f.cost)} · 매입 ${won(f.po_amt)}(${f.po_n}행) · ${f.created} 생성`)
    for (const h of hits) {
      console.log(`     ↔ ${h.o.item_code}  「${h.o.item_name}」  폭 ${h.o.width_mm || '-'} · 단가 ${won(h.o.cost)}   [${h.rules.join(' ')}]`)
    }
    console.log('')
  }
}
show(strong, `⚠️  중복 의심(강) ${strong.length}품목 — 코드·품명이 직접 겹친다`)
show(weak, `· 참고(약) ${weak.length}품목 — 폭·단가가 같고 식별어를 공유한다. 오탐 가능`)

console.log('판정이 서면 병합은 docs/dongsan-import/gen_merge_dup.cjs 패턴을 따른다:')
console.log('  ① purchase_order_items.item_id 재지정  ② 중복품목 is_active=0')
console.log('  ③ docs/price/backfill_avg_cost.sql 재실행(가중평균 재계산)  ④ 롤백 파일 동시 생성')
console.log('오탐이면 그대로 두면 된다 — 이 스크립트는 상태를 바꾸지 않는다.')

// 강한 신호만 exit 1. 약한 신호까지 실패로 처리하면 매번 빨개져 감사 자체가 무뎌진다.
process.exit(strong.length ? 1 : 0)
