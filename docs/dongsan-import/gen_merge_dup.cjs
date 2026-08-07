/**
 * 공급처 품명 중복 품목 병합 SQL 생성기 (2026-08-07)
 *
 * 근본 원인: 매입 적재가 **공급처 전표 품명**으로 품목을 찾고, 못 찾으면 새로 만든다.
 *   정운교역은 「트로피칼」, 서울경금속은 「LG-DPM1270mmSPM011G」 라고 부르는데
 *   실체는 각각 AQ2 수성 현수막원단 2코팅 · SPM011G-127 이다.
 *   이관이 돌 때마다 같은 자재가 새 품목으로 갈렸다(샤틴 포함 3번째).
 *
 * 사용: node docs/dongsan-import/gen_merge_dup.cjs <poiids.json> <costsnap.json> [pairs.json] [출력접미사]
 *   pairs.json 미지정 시 아래 PAIRS(1차 22쌍)를 쓴다. 2차분은 [[dup_id,canon_id,dup_code,canon_code],...] 로 넘긴다.
 *   poiids.json  = SELECT id poi_id, item_id did FROM purchase_order_items WHERE item_id IN (<dup ids>)
 *   costsnap.json= SELECT id, item_code, COALESCE(avg_unit_cost,0) c FROM items WHERE id IN (<dup+canon ids>)
 */
const fs = require('fs')

const [, , poiPath, snapPath, pairsPath, sfxArg] = process.argv
if (!poiPath || !snapPath) {
  console.error('usage: gen_merge_dup.cjs <poiids.json> <costsnap.json>')
  process.exit(1)
}

// [dup_id, canon_id, dup_code, canon_code]
const PAIRS_DEFAULT = [
  [1233, 200, 'TROPICAL-070', 'AQ2-070'],
  [1234, 202, 'TROPICAL-090', 'AQ2-090'],
  [1257, 299, 'SK-1555', 'SPM011G-127'],
  [1256, 298, 'SK-1612', 'SPM011G-105'],
  [1258, 300, 'SK-1613', 'SPM011G-137'],
  [1288, 301, 'SK-1614', 'SPM011G-152'],
  [1289, 303, 'SK-1557', 'SPM022G-127'],
  [1339, 302, 'SK-1724', 'SPM022G-105'],
  [1335, 304, 'SK-1971', 'SPM022G-137'],
  [1259, 307, 'SK-1556', 'SPP031M-105'],
  [1260, 308, 'SK-1615', 'SPP031M-127'],
  [1261, 309, 'SK-1616', 'SPP031M-137'],
  [1308, 310, 'SK-1617', 'SPP031M-152'],
  [1336, 313, 'SK-1683', 'SPP031G-127'],
  [1309, 312, 'SK-1707', 'SPP031G-105'],
  [1337, 314, 'SK-1708', 'SPP031G-137'],
  [1310, 315, 'SK-1709', 'SPP031G-152'],
  [1255, 848, 'SK-1682', 'SPT031M'],
  [1290, 389, 'SK-26303', 'LD59HTG-137'],
  [1251, 844, 'SK-934', 'LT4071M'],
  [1331, 845, 'SK-937', 'LT4080M'],
  [1348, 846, 'SK-940', 'LT4510'],
]

const HEAD = [
  '-- 공급처 품명 중복 품목 병합 (2026-08-07, 용준님 승인)',
  '-- 생성기 = docs/dongsan-import/gen_merge_dup.cjs',
  '--',
  '-- 근본 원인: 매입 적재가 **공급처 전표 품명**으로 품목을 찾고 못 찾으면 새로 만든다.',
  '--   정운교역 「트로피칼」 = AQ2 수성 현수막원단 2코팅(규격에 "BW/2코팅" 이 이미 적혀 있다)',
  '--   서울경금속 「LG-DPM1270mmSPM011G」 = SPM011G-127',
  '--   이관 때마다 같은 자재가 새 품목으로 갈렸다(샤틴 포함 3번째 사례).',
  '--',
  '-- ★ 별칭 테이블(item_aliases)·ROLL tie-break 는 **하지 않기로 했다**(용준님 판단 · 실측 근거):',
  '--   · 한 제품에 동폭 자재가 2개 이상 걸린 경우 = **0건** → tie-break 는 없는 문제를 위한 코드수정이다',
  '--   · 신규 품목 생성 6월 540 → 7월 694 → **8월 10개** → 중복은 이관기 산물이고 이미 잦아들었다',
  '--   대신 「이관 직후 신규 품목 목록을 훑는다」는 운영 절차로 대체한다.',
  '--',
  '-- 참조 전수 스캔: dup 22품목은 **purchase_order_items 에만** 걸려 있다',
  '--   (product_materials·order_items·inventory·inventory_transactions 전부 0건) → 매입 재지정만으로 끝난다.',
  '-- 단위 검산: dup 은 unit=EA·pack 0, canon 은 unit=롤·pack 50 이지만 **수량 의미가 같다**',
  '--   (SK-1555 117,082원/EA ≈ SPM011G-127 114,517원/롤). 그래서 가중평균이 성립한다.',
  '--',
  '-- ⚠️ 실행 후 반드시 docs/price/backfill_avg_cost.sql 을 재실행한다 —',
  '--   합쳐진 매입으로 단가를 다시 계산해야 병합 효과가 원가에 반영된다.',
  '-- 롤백 = rollback_merge_dup_items.sql + docs/price/rollback_avg_cost_2026-08-07_merge.sql (둘 다)',
  '',
]

const PAIRS = pairsPath ? JSON.parse(fs.readFileSync(pairsPath, 'utf8')) : PAIRS_DEFAULT
const SFX = sfxArg || ''
const poi = JSON.parse(fs.readFileSync(poiPath, 'utf8'))
const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'))

const byDup = new Map()
for (const p of poi) {
  const k = Number(p.did)
  if (!byDup.has(k)) byDup.set(k, [])
  byDup.get(k).push(Number(p.poi_id))
}

const out = [...HEAD]
const rb = [
  '-- 중복 품목 병합 롤백 (2026-08-07) — 매입 재지정·비활성 원상복구',
  '-- ⚠️ avg_unit_cost 는 별도다: docs/price/rollback_avg_cost_2026-08-07_merge.sql 을 함께 실행할 것.',
  '',
]

let lines = 0
for (const [did, cid, dcode, ccode] of PAIRS) {
  const ids = (byDup.get(did) || []).sort((a, b) => a - b)
  if (ids.length === 0) { out.push('-- (매입 라인 없음) ' + dcode + ' -> ' + ccode); continue }
  lines += ids.length
  out.push('UPDATE purchase_order_items SET item_id = ' + cid + ' WHERE id IN (' + ids.join(',') + ');'
    + '  -- ' + dcode + ' -> ' + ccode + ' (' + ids.length + '행)')
  rb.push('UPDATE purchase_order_items SET item_id = ' + did + ' WHERE id IN (' + ids.join(',') + ');'
    + '  -- ' + ccode + ' -> ' + dcode + ' 복원')
}

out.push('')
for (const [did, , dcode, ccode] of PAIRS) {
  out.push("UPDATE items SET is_active = 0, description = COALESCE(description,'') || "
    + "' · 2026-08-07 " + ccode + " 로 병합(공급처 품명 중복)', updated_at = CURRENT_TIMESTAMP WHERE id = " + did + ';')
  rb.push('UPDATE items SET is_active = 1 WHERE id = ' + did + ';  -- ' + dcode)
}

const cs = ['-- 병합 전 avg_unit_cost 스냅샷 (2026-08-07) — merge 롤백 시 함께 실행', '']
for (const x of snap) cs.push('UPDATE items SET avg_unit_cost = ' + x.c + ' WHERE id = ' + x.id + ';  -- ' + x.item_code)

fs.writeFileSync('docs/dongsan-import/load/merge_dup_items' + SFX + '.sql', out.join('\n') + '\n')
fs.writeFileSync('docs/dongsan-import/load/rollback_merge_dup_items' + SFX + '.sql', rb.join('\n') + '\n')
fs.writeFileSync('docs/price/rollback_avg_cost_2026-08-07_merge' + SFX + '.sql', cs.join('\n') + '\n')
console.log('매입 라인 재지정 ' + lines + '행 · 비활성 ' + PAIRS.length + '품목 · 단가 스냅샷 ' + snap.length + '품목')
