/**
 * 깃대 단가 역산 — 공급처 전액을 길이 비례로 배분 (2026-08-07)
 *
 * ★★ **추론이다.** 용준님 확인 전이며 rollback_pole_cost.sql 로 되돌린다.
 *
 * 왜 필요한가: 조립 SET(태극기+깃대) 5.56억이 **깃대 단가 0** 때문에 통째로 미산출이다.
 *   `ACC-030-*`(가로기 깃대)·`ACC-036-L*`(수기대)는 **매입 라인이 0건**이다.
 *
 * 왜 라인이 없나: 이 공급처들의 매입은 **통장 출금 역산 / SmartA 월집계**로 만든 PO 다
 *   (`E1-PO-BK-*` · notes 에 「통장 출금 역산 · 매입일 미상(지급일로 대체)」 명시).
 *   AP 잔액을 맞추려고 **금액만** 넣은 것이라 품목란이 애초에 없다. 적재 버그가 아니다.
 *   전 법인1 2026년 발주 294건 중 **82건 480,931,275원(28%)** 이 이 형태다.
 *
 * 배분 근거
 *  · 가로기 깃대 = **진안알미늄**(용준님 확인). 업태가 「알루미늄 제조업」 단일이라
 *    이 거래처 매입 전액을 깃대로 보는 게 합리적이다. 5건 46,558,550(VAT포함) → 공급가 42,325,955.
 *  · 수기대 = 유진프라스틱 12,840,000. **전표 1줄·수량 1**이라 단가를 못 만들던 건인데,
 *    소요 수량으로 나누면 개당 값이 나온다. (공급처는 용준님도 미확정 — 유진프라스틱 전표를 그대로 썼다)
 *  · 규격별 배분은 **길이 비례**(R120/R130/R150 · L40/L50/L60). 알루미늄·플라스틱 봉이라
 *    길이가 원가를 지배하고, 구멍 수(2구/3구)는 가공비라 여기선 무시한다.
 *  · 소요 = 단독 판매 + 조립 SET 구성분(entity 1). 매입 = 소요 가정(재고 변동 무시).
 *
 * 검증: 조립 SET 원가율이 43~58% 로 태극기 인쇄원단 제품 밴드(27~55%)와 같은 자리에 온다.
 *
 * 사용: node docs/dongsan-import/gen_pole_cost.cjs
 */
const fs = require('fs')

const GROUPS = [
  {
    label: '가로기 깃대 (진안알미늄)',
    vatIncl: 46558550,
    note: '진안알미늄 5건 46,558,550(VAT포함) 길이비례 배분',
    items: [
      { code: 'ACC-030-R120-3', len: 120, qty: 500 },
      { code: 'ACC-030-R130-2', len: 130, qty: 1281 + 1370 },
      { code: 'ACC-030-R130-3', len: 130, qty: 491 },
      { code: 'ACC-030-R150-2', len: 150, qty: 490 + 1213 },
      { code: 'ACC-030-R150-3', len: 150, qty: 20666 + 5047 },
    ],
  },
  {
    label: '수기대 (유진프라스틱)',
    vatIncl: 12840000,
    vatFree: true,   // 이 건은 전표 금액이 이미 공급가로 적재돼 있다(poi.amount = PO total_amount)
    note: '유진프라스틱 전표 12,840,000(수량 1 뭉치) 길이비례 배분',
    items: [
      { code: 'ACC-036-L40', len: 40, qty: 4820 },
      { code: 'ACC-036-L50', len: 50, qty: 217061 },
      { code: 'ACC-036-L60', len: 60, qty: 522 },
    ],
  },
]

const out = [
  '-- 깃대 단가 역산 — 공급처 전액 길이비례 배분 (2026-08-07)',
  '-- 생성기 = docs/dongsan-import/gen_pole_cost.cjs (근거·검증은 그 파일 헤더)',
  '-- ★★ **추론이다.** 용준님 확인 전. 롤백 = docs/dongsan-import/rollback_pole_cost.sql',
  '--',
  '-- ⚠️ backfill_avg_cost.sql 은 **매입 라인이 있는 품목만** 갱신한다. 이 품목들은 라인이 0건이라',
  '--    재실행해도 덮어쓰지 않는다(ACC-036 부모는 제외 목록에 있어 0 유지).',
  '',
]
const rb = ['-- 깃대 단가 역산 롤백 (2026-08-07) — 적용 전 전부 0 이었다', '']
for (const g of GROUPS) {
  const supply = g.vatFree ? g.vatIncl : Math.round(g.vatIncl / 1.1)
  const cm = g.items.reduce((s, i) => s + i.len * i.qty, 0)
  const perCm = supply / cm
  out.push(`-- ${g.label} — 공급가 ${supply.toLocaleString()} · 총 ${cm.toLocaleString()}cm · cm당 ${perCm.toFixed(2)}원`)
  for (const i of g.items) {
    const unit = Math.round(perCm * i.len)
    out.push(`UPDATE items SET avg_unit_cost = ${unit}, updated_at = CURRENT_TIMESTAMP,`
      + ` description = COALESCE(NULLIF(description,''),'') || ' · ★추론(미확인) 2026-08-07 ${g.note} → ${i.len}cm ${unit}원/개'`
      + ` WHERE item_code = '${i.code}';`)
    rb.push(`UPDATE items SET avg_unit_cost = 0 WHERE item_code = '${i.code}';`)
    console.error(`${i.code.padEnd(16)} ${String(i.len).padStart(3)}cm  소요 ${String(i.qty).padStart(7)}  →  ${unit.toLocaleString()}원/개`)
  }
  out.push('')
  console.error(`  └ ${g.label}: 공급가 ${supply.toLocaleString()} / ${cm.toLocaleString()}cm = ${perCm.toFixed(2)}원/cm\n`)
}
fs.writeFileSync('docs/dongsan-import/load/pole_cost.sql', out.join('\n') + '\n')
fs.writeFileSync('docs/dongsan-import/rollback_pole_cost.sql', rb.join('\n') + '\n')
