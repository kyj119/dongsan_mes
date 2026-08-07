// 2026 생산장비 미등록분 고정자산 등록 SQL 생성 (2026-08-07)
const fs = require('fs')
const LAST = '2026-08'   // depreciation_records 가 이미 돌아간 마지막 기간
const A = [
  { code:'FA-2026-007', name:'Extreme 집진기·핸드미스트 (1880T 부대장치)', date:'2026-02-11', cost:2000000, dept:1, e:1,
    note:'케이엠테크 E1-PO-KM-2602EQ · 집진기 1,200,000 + 핸드미스트 950,000 − 매출할인 150,000 · 세금계산서 공급가 30,000,000 = 본체 28,000,000(FA-2026-002) + 이 건 2,000,000' },
  { code:'FA-2026-008', name:'CF2000 발색기 2000폭', date:'2026-03-24', cost:8000000, dept:2, e:1,
    note:'다다모아 매입(E1-PO-DADA-0324) · 전사 발색기 · 용준님 확인 2026-08-07' },
  { code:'FA-2026-009', name:'EP-시리즈 전사기 EP1852 (피더기 포함)', date:'2026-03-23', cost:11000000, dept:2, e:2,
    note:'(주)티피엠 매입(SMP-0069) · 선명커뮤니케이션 전사 장비 · 잉크 108,000 은 소모품으로 제외' },
]
const RATE = 0.259, LIFE = 120, SALV = 1000
const months = (from) => { const out=[]; let [y,m]=from.split('-').map(Number)
  for(;;){ const p=y+'-'+String(m).padStart(2,'0'); out.push(p); if(p===LAST) break; m++; if(m>12){m=1;y++} } return out }

const out = [
  '-- 2026년 취득 생산장비 미등록분 고정자산 등록 (2026-08-07, 용준님 지시)',
  '--',
  '-- 배경: 2026년 장비 매입 5건 중 4건(OPTIMUM-EP3208 · Extreme-1880T · Extreme-2280T ×2 = 133,096,000)은',
  '--   이미 FA-2026-001~004 로 등록돼 있었다. 남아 있던 것이 아래 3건이다.',
  '--   세무장부(SmartA)에는 2026년 취득분이 아직 0건 — 결산 때 등록되므로 대사 대상이 아니다.',
  '--',
  '-- 상각 = 세법 정률법 0.259(기계장치 10년) · 비망가액 1,000. 취득 연도라 연초 미상각잔액 = 취득가.',
  '--   월액 = 취득가 × 0.259 / 12 (같은 해 안에서는 정액) — 기존 FA-2026-001~004 와 원 단위까지 같은 방식.',
  '--',
  '-- ★ 자산화하지 않은 것 (즉시 비용): 케이엠테크 E1-PO-KM-260527 의 블로어 3개(550,000/개)·인두기 11개(110,000/개)',
  '--   = 2,860,000. 장비 인도 6주 뒤 소모 부품·공구로 들어왔고 거래단위별 취득가액이 100만원 이하다.',
  '-- 롤백 = docs/dongsan-import/load/rollback_fa_2026_equipment.sql',
  '',
]
const rb = ['-- 2026 생산장비 등록 롤백 (2026-08-07)', '']
for (const a of A) {
  out.push(`INSERT INTO fixed_assets (asset_code, name, category, acquisition_date, acquisition_cost, useful_life_months, depreciation_method, depreciation_rate, salvage_value, current_book_value, department_id, notes, status, entity_id) VALUES ('${a.code}', '${a.name}', 'EQUIPMENT', '${a.date}', ${a.cost}, ${LIFE}, 'DECLINING_BALANCE', ${RATE}, ${SALV}, ${a.cost}, ${a.dept}, '${a.note}', 'IN_USE', ${a.e});`)
}
out.push('')
for (const a of A) {
  const mo = Math.round(a.cost * RATE / 12)
  const ps = months(a.date.slice(0,7))
  let acc = 0
  for (const p of ps) { acc += mo
    out.push(`INSERT INTO depreciation_records (asset_id, period, depreciation_amount, accumulated_depreciation, book_value, entity_id) SELECT id, '${p}', ${mo}, ${acc}, ${a.cost-acc}, ${a.e} FROM fixed_assets WHERE asset_code='${a.code}';`) }
  out.push(`UPDATE fixed_assets SET current_book_value = ${a.cost-acc}, updated_at = CURRENT_TIMESTAMP WHERE asset_code='${a.code}';  -- ${ps.length}개월 상각 ${mo}/월`)
  out.push('')
  console.log(a.code, a.name, '| 취득', a.cost.toLocaleString(), '| 월', mo.toLocaleString(), '|', ps.length + '개월(' + ps[0] + '~' + LAST + ')', '| 누계', acc.toLocaleString(), '| 장부가', (a.cost-acc).toLocaleString())
}
for (const a of A) {
  rb.push(`DELETE FROM depreciation_records WHERE asset_id = (SELECT id FROM fixed_assets WHERE asset_code='${a.code}');`)
  rb.push(`DELETE FROM fixed_assets WHERE asset_code='${a.code}';`)
}
fs.writeFileSync('docs/dongsan-import/load/fa_2026_equipment.sql', out.join('\n') + '\n')
fs.writeFileSync('docs/dongsan-import/load/rollback_fa_2026_equipment.sql', rb.join('\n') + '\n')
console.log('\n총 취득가', A.reduce((s,a)=>s+a.cost,0).toLocaleString(), '· 연 상각비', A.reduce((s,a)=>s+Math.round(a.cost*RATE),0).toLocaleString())
