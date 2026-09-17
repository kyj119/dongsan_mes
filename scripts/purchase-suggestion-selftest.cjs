#!/usr/bin/env node
/**
 * 매입 추천·자재 부족의 **단위 축** 자체검증 — `src/utils/purchaseSuggestion.ts`
 *
 * ★왜 있는가 (2026-09-18)
 *   재고는 base('M')로 저장되고 발주는 관리단위('롤')로 나간다(입고가 ×pack_size 로 base 에 넣는다).
 *   이 둘을 섞은 자리가 셋 있었다 —
 *     ① 자재 부족 경고의 재고 라벨이 관리단위였다(값은 base) → 「재고 1,586」이 1,586롤로 읽혔다
 *     ② 발주중(관리단위)을 base 재고에 그대로 더했다 → 부족량 과대 = **헛경고**
 *     ③ base 로 낸 권장 수량을 관리단위 라벨로 발주요청에 넣었다 → **최대 pack_size 배 과다발주**
 *   셋 다 타입체크·빌드·smoke 를 통과한다(숫자도 라벨도 유효하다). 값 대조만이 잡는다.
 *
 * 검사
 *   ① 환산 가드 — 다단위만 환산하고, base_unit 없는 편의계수(AQ)·단일단위는 **절대 환산 안 한다**
 *   ② 추천 산식 — 발주중 base 환산 · 부족량 · 권장 수량(관리단위, 올림은 환산 뒤)
 *   ③ **소스 스캔** — 발주 잔량(`received_quantity`)과 재고를 같은 파일에서 다루면 환산을 거쳐야 한다
 *   ④ 자재 부족 경고의 표시 단위가 재고 축(`mat.base_unit`)인가
 *
 * 실행: node scripts/purchase-suggestion-selftest.cjs   (실패 시 exit 1) — test:calc 편입
 */
'use strict'
const fs = require('fs')
const path = require('path')
const { compileTs } = require('./lib/compile-ts.cjs')

const ROOT = path.join(__dirname, '..')
const { mod, cleanup } = compileTs(path.join(ROOT, 'src', 'utils', 'purchaseSuggestion.ts'), { bundle: true })
const { computePurchaseSuggestion } = mod

let fails = 0
const check = (name, cond, detail) => {
  if (cond) console.log('  ✓', name)
  else { fails++; console.log('  ✗', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : '') }
}

// prod 실측 품목 세 종류 — 이 셋이 축의 전부다.
const 코팅지 = { unit: '롤', base_unit: 'M', pack_size: 61 }   // 진짜 다단위 (149품목)
const 현수막 = { unit: 'EA', base_unit: null, pack_size: 130 }  // pack_size 만 = 편의계수 (50품목) — 환산 금지
const 부속 = { unit: 'EA', base_unit: null, pack_size: null }   // 단일단위 (1,214품목)

console.log('[purchase-suggestion] ① 환산 가드')
{
  const base = { currentStock: 0, safeStock: 0, weeklyAvg: 0, mrpDemand: 0, leadTimeWeeks: 1 }
  check('다단위(롤/M×61) → 계수 61', computePurchaseSuggestion({ ...base, onOrderPack: 2 }, 코팅지).factor === 61)
  check('다단위 발주중 2롤 = 122 M', computePurchaseSuggestion({ ...base, onOrderPack: 2 }, 코팅지).onOrderBase === 122)
  check('★편의계수(pack_size 만, base_unit 없음)는 환산 안 한다 — 계수 1',
    computePurchaseSuggestion({ ...base, onOrderPack: 2 }, 현수막).factor === 1,
    computePurchaseSuggestion({ ...base, onOrderPack: 2 }, 현수막))
  check('단일단위도 계수 1', computePurchaseSuggestion({ ...base, onOrderPack: 2 }, 부속).factor === 1)
  check('품목 정보가 없으면 계수 1(안전측)', computePurchaseSuggestion({ ...base, onOrderPack: 2 }, null).factor === 1)
}

console.log('[purchase-suggestion] ② 추천 산식')
{
  // 무광코팅지 120g-호홍: 재고 1,586 M · 안전재고 300 M · 주간소모 200 M · MRP 0 · 발주중 3롤
  const r = computePurchaseSuggestion({
    currentStock: 1586, safeStock: 300, weeklyAvg: 200, mrpDemand: 0, onOrderPack: 3, leadTimeWeeks: 1,
  }, 코팅지)
  check('발주중 3롤 → 183 M', r.onOrderBase === 183)
  check('가용재고 = 1,586 + 183 = 1,769 M', r.availableBase === 1769)
  check('부족 없음(예상소진 200 + 안전 300 < 1,769)', r.shortageBase === 0 && r.recommendedPack === 0, r)

  // ★종전 버그 재현 방지 — 발주중을 환산 안 하면 available 이 1,589 라 여전히 부족 0 이지만,
  //   재고가 적을 때 갈린다. 재고 100 M 로 같은 조건.
  const r2 = computePurchaseSuggestion({
    currentStock: 100, safeStock: 300, weeklyAvg: 200, mrpDemand: 0, onOrderPack: 3, leadTimeWeeks: 1,
  }, 코팅지)
  check('발주중을 환산하면 부족 217 M (환산 안 하면 397 M 로 과대)', r2.shortageBase === 217, r2)
  check('권장 수량 = 올림(217 ÷ 61) = 4롤', r2.recommendedPack === 4, r2)
  check('base 병기값 = 217 M', r2.recommendedBase === 217, r2)

  // 올림 순서 — 환산 **뒤**에 올려야 한다. 먼저 올리면 217→217롤.
  check('★올림은 환산 뒤에 — 217 M 가 217롤이 되지 않는다', r2.recommendedPack < 10, r2.recommendedPack)

  // 편의계수 품목은 그대로
  const r3 = computePurchaseSuggestion({
    currentStock: 10, safeStock: 50, weeklyAvg: 0, mrpDemand: 0, onOrderPack: 5, leadTimeWeeks: 1,
  }, 현수막)
  check('편의계수 품목: 발주중 5 = 5(환산 없음)', r3.onOrderBase === 5)
  check('편의계수 품목: 권장 35 (÷130 안 한다)', r3.recommendedPack === 35, r3)
}

console.log('[purchase-suggestion] ③ 소스 스캔 — 발주 잔량과 재고를 같이 쓰면 환산을 거친다')
{
  function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p, out)
      else if (e.name.endsWith('.ts')) out.push(p)
    }
    return out
  }
  const RE_PENDING = /received_quantity/
  const RE_STOCK = /FROM\s+inventory[\s`]|inv\.quantity|current_stock/
  const RE_CONVERT = /packFactor\s*\(|toBase\s*\(|unit_factor|computePurchaseSuggestion\s*\(/
  const bad = []
  let n = 0
  for (const f of [...walk(path.join(ROOT, 'src', 'routes')), ...walk(path.join(ROOT, 'src', 'utils'))]) {
    const src = fs.readFileSync(f, 'utf8')
    if (!RE_PENDING.test(src) || !RE_STOCK.test(src)) continue
    n++
    if (!RE_CONVERT.test(src)) bad.push(path.relative(ROOT, f).split(path.sep).join('/'))
  }
  check(`발주 잔량 + 재고를 같이 쓰는 파일 ${n}개가 전부 환산을 거친다`, bad.length === 0, bad)
  check('스캔 대상이 실제로 잡혔다(패턴이 죽지 않았다)', n >= 3, n)
  const fake = `SELECT SUM(poi.quantity - received_quantity) FROM x; SELECT inv.quantity FROM inventory inv`
  check('환산 없는 소스는 검출된다', RE_PENDING.test(fake) && RE_STOCK.test(fake) && !RE_CONVERT.test(fake))
}

console.log('[purchase-suggestion] ④ 자재 부족 경고의 표시 단위')
{
  const src = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'materialShortageCheck.ts'), 'utf8')
  check('표시 단위가 재고 축(mat.base_unit)이다', /unit:\s*mat\.base_unit/.test(src))
  check('관리단위(stock.unit)를 라벨로 쓰지 않는다', !/unit:\s*stock\.itemId\s*\?\s*stock\.unit/.test(src))
}

cleanup && cleanup()
console.log(fails ? `[purchase-suggestion] FAIL ${fails}건` : '[purchase-suggestion] OK — 환산 가드·추천 산식·소스 스캔·표시 단위 전부 통과')
process.exit(fails ? 1 : 0)
