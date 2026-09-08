#!/usr/bin/env node
/**
 * 입고 단가 반영 판정 자체검증 — `src/utils/purchasePriceSync.ts`
 *
 * 왜 있는가: `items.base_price` 는 **고객 노출 단가**인데(단가표·견적·스캔이 전부 이 칸),
 *   입고가 그걸 매입 단가로 덮고 있었다. 판매가가 매입원가로 내려앉아도 응답은 200 이고
 *   타입체크·빌드·smoke 가 전부 통과한다 — 여기서만 잡힌다.
 *
 * 실측(2026-09-09 prod): 발주에 등장하는 판매품목 367종 중 135종이 10%+ 이동(115종 하락).
 *   대부분 정확히 −40% = 매입가 ÷ 0.6.
 *
 * 실행: node scripts/purchase-price-sync-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const path = require('path')
const { compileTs } = require('./lib/compile-ts.cjs')

const SRC = path.join(__dirname, '..', 'src', 'utils', 'purchasePriceSync.ts')
const { mod: M, cleanup } = compileTs(SRC)

let pass = 0, fail = 0
function verdict(label, item, price, wantSync, wantReason) {
  const v = M.judgeBasePriceSync(item, price)
  const okSync = v.sync === wantSync
  const okReason = wantSync ? true : v.reason === wantReason
  if (okSync && okReason) { pass++; return }
  fail++
  console.error(`❌ ${label}: got ${JSON.stringify(v)}, want sync=${wantSync}${wantReason ? ' reason=' + wantReason : ''}`)
}

// ── 매입 전용 품목 = 반영한다 (원자재 매입가 갱신은 정상 동작이다)
verdict('매입 전용·단가 다름 → 반영', { is_sales_item: 0, base_price: 100 }, 120, true)
verdict('매입 전용·base_price 0 → 반영', { is_sales_item: 0, base_price: 0 }, 105000, true)
verdict('매입 전용·base_price NULL → 반영', { is_sales_item: 0, base_price: null }, 4600, true)
verdict('is_sales_item 없음 → 매입 전용 취급', { base_price: 100 }, 120, true)
verdict('is_sales_item NULL → 매입 전용 취급', { is_sales_item: null, base_price: 100 }, 120, true)
verdict('is_sales_item false → 매입 전용 취급', { is_sales_item: false, base_price: 100 }, 120, true)

// ── ★판매품목 = 절대 덮지 않는다
verdict('판매품목 → 보존', { is_sales_item: 1, base_price: 217000 }, 129800, false, 'SALES_ITEM')
verdict('판매품목 boolean → 보존', { is_sales_item: true, base_price: 217000 }, 129800, false, 'SALES_ITEM')
verdict('판매품목·base_price 0 이어도 보존', { is_sales_item: 1, base_price: 0 }, 50000, false, 'SALES_ITEM')
verdict('판매품목·base_price NULL 이어도 보존', { is_sales_item: 1, base_price: null }, 50000, false, 'SALES_ITEM')
verdict('0 이 아닌 값은 전부 판매로 본다', { is_sales_item: 2, base_price: 100 }, 120, false, 'SALES_ITEM')
// 판매 여부가 「단가 동일」보다 먼저 판정돼야 한다 — 사유가 뒤집히면 응답 메시지가 거짓말을 한다
verdict('판매품목 + 단가 동일 → SALES_ITEM', { is_sales_item: 1, base_price: 120 }, 120, false, 'SALES_ITEM')

// ── 반영할 값이 없는 경우 (판매 여부보다 먼저 — 0원을 「보존했다」고 보고하면 오해를 부른다)
verdict('매입 단가 0 → NO_PRICE', { is_sales_item: 0, base_price: 100 }, 0, false, 'NO_PRICE')
verdict('매입 단가 음수 → NO_PRICE', { is_sales_item: 0, base_price: 100 }, -5, false, 'NO_PRICE')
verdict('매입 단가 NaN → NO_PRICE', { is_sales_item: 0, base_price: 100 }, NaN, false, 'NO_PRICE')
verdict('판매품목이어도 단가 0 이면 NO_PRICE', { is_sales_item: 1, base_price: 100 }, 0, false, 'NO_PRICE')

// ── 나머지
verdict('단가 동일 → UNCHANGED', { is_sales_item: 0, base_price: 120 }, 120, false, 'UNCHANGED')
verdict('base_price NULL 을 0 으로 읽고 단가 0 아님 → 반영', { is_sales_item: 0, base_price: null }, 1, true)
verdict('품목 없음 → NOT_FOUND', null, 100, false, 'NOT_FOUND')
verdict('품목 undefined → NOT_FOUND', undefined, 100, false, 'NOT_FOUND')

// ── prod 실측 회귀 (2026-09-09) — 이 값들이 실제로 덮일 뻔했다
const REAL = [
  ['ACC-041-AG 애기봉', 1, 1003200, 600000],
  ['JG-E4-P152 E4 엠보 무광 152폭', 1, 217000, 129800],
  ['JG-C4-P127 C4 엠보UV 무광 127폭', 1, 195000, 116600],
  ['HJ-YGILB-P127 유광코팅지 일반 127폭', 1, 175600, 105000],
  ['PJ-KELGR-P127 PVC(켈) 그레이-프라임 127폭', 1, 167200, 100000],
]
for (const [name, isSales, sell, buy] of REAL) {
  verdict(`실측: ${name} 보존`, { is_sales_item: isSales, base_price: sell }, buy, false, 'SALES_ITEM')
}

// ── 사유 라벨 (응답 메시지에 그대로 나간다)
for (const r of ['SALES_ITEM', 'UNCHANGED', 'NO_PRICE', 'NOT_FOUND']) {
  const label = M.priceSyncReasonLabel(r)
  if (typeof label === 'string' && label.length > 0) pass++
  else { fail++; console.error(`❌ 라벨 누락: ${r}`) }
}

console.log(fail === 0
  ? `✓ 입고 단가 반영 판정 자체검증 ${pass}건 통과`
  : `✗ ${fail}건 실패 / ${pass}건 통과`)
cleanup && cleanup()
process.exit(fail === 0 ? 0 : 1)
