/**
 * 태극기·기류 인쇄원단 yd → 장수 환산 생성기 (2026-08-07)
 *
 * 원단은 `yd` 로 사고 완제품은 `장(EA)` 으로 판다. 그 사이를 잇는 값이 없어
 * 태극기 매출 8.3억(동산 25.9%)의 원가가 통째로 0 이었다.
 *
 * ★ 잃어버린 조각 = **롤 폭**. `items.width_mm` 는 전 품목 비어 있는데
 *   매입 라인 품명에 「T/P 75" 태극기 180*270」 처럼 **인치로 적혀 있다.**
 *
 * 배치 모델: floor(롤폭 ÷ 가로지르는 변) 벌을 나란히 놓고, 나머지 변만큼 길이를 먹는다.
 *   장/yd = 벌수 × (91.44 ÷ 길이변).  yd/장 = 그 역수 → `product_materials.quantity`.
 *
 * ★ 어느 변이 롤을 가로지르는가 = **장/yd 가 큰 쪽**(공급처가 원단을 아끼는 방향).
 *   근거: 180×270@75" · 150×225@61" · 120×180@51" 은 **한 변만 롤에 들어간다**(다른 변은 롤보다 길다).
 *   그 세 건 모두 로스 3~7% 로 롤 폭이 변에 딱 맞게 골라져 있다. 같은 설계 원리를 적용하면
 *   90×135@55"(139.7cm) 는 **135 를 가로지르는 게 맞다**(로스 3.4%) — 90 을 가로지르면 로스 36%.
 *
 * ★ 검증 = 원가율. 90 가로지름으로 읽으면 태극기 7호가 **77~81%** 가 되는데
 *   원단비만으로 그 값은 나올 수 없다. 135 가로지름이면 51~54% 로 나머지 14개 제품과 같은 밴드다.
 *   최종: 15개 제품 전부 **27~55%** · 이상치 없음.
 *
 * ★ 「두폭」은 배치가 아니라 **제품명**이다(가로기 두폭 등). 폭수 근거로 쓰면 안 된다 —
 *   「새마을 두폭 90×135」 는 55"(139.7cm) 라 90 을 2벌 놓을 수 없다(180 > 139.7).
 *
 * 사용: node docs/dongsan-import/gen_tgk_yd_conv.cjs > docs/dongsan-import/load/tgk_yd_conv.sql
 */
const IN = 2.54, YD = 91.44
// [원단코드, 롤폭(inch), 짧은변, 긴변]  — 롤폭·규격 모두 매입 라인 품명에서 읽었다
const FABRIC = [
  ['RM-TP-TGK-4060',      51.5,  40,  60],
  ['RM-TP-TGK-6090-2',    53.5,  60,  90],
  ['RM-TP-TGK-60180-2',   51,    60, 180],
  ['RM-TP-TGK-80120-2',   67,    80, 120],
  ['RM-TP-TGK-90135',     55,    90, 135],
  ['RM-TP-TGK-120180',    51,   120, 180],
  ['RM-TP-TGK-150225',    61,   150, 225],
  ['RM-TP-TGK-180270',    75,   180, 270],
  ['RM-TP-TGK-2032-ME',   60,    20,  32],
  ['RM-TP-TGK-JR-150225', 61,   150, 225],
  ['RM-TP-TGKH-6090-2',   51,    60,  90],
  ['RM-TP-SMU-6090-2',    51,    60,  90],
  ['RM-TP-SMU-80120',     51,    80, 120],
  ['RM-TP-SMU-90135-2',   55,    90, 135],
  ['RM-TP-MBG-90135',     55,    90, 135],
  ['RM-TP-NAVY-90135',    54,    90, 135],
]
// 복합 원단 = 한 롤에 두 규격이 나란히 인쇄된다. 폭 방향으로 60 + 90 = 150 ≤ 165.1(65")
//   길이 방향은 규격별로 따로 반복하므로 장/yd 를 규격마다 계산한다.
const CPX = { code: 'RM-TP-TGK-CPX', inch: 65, parts: [[60, 90], [90, 135]] }

function best(rollCm, d1, d2) {
  const opts = [[d1, d2], [d2, d1]].map(([across, along]) => {
    const n = Math.floor(rollCm / across)
    return { across, along, n, perYd: n > 0 ? n * (YD / along) : 0, waste: n > 0 ? 1 - n * across / rollCm : 1 }
  })
  return opts[0].perYd >= opts[1].perYd ? opts[0] : opts[1]
}

// 제품 → 원단 매핑은 이미 product_materials 에 있다. 여기선 (제품규격, 원단) 짝마다 yd/장 을 채운다.
// [pm.id, 제품코드, 원단코드, 제품의 짧은변, 긴변]
const ROWS = [
  [422, 'TGK-9',     'RM-TP-TGK-4060',     40,  60],
  [423, 'TGK-8',     'RM-TP-TGK-6090-2',   60,  90],
  [424, 'TGK-8',     'RM-TP-TGK-CPX',      60,  90],
  [425, 'TGK-7',     'RM-TP-TGK-90135',    90, 135],
  [426, 'TGK-7',     'RM-TP-TGK-CPX',      90, 135],
  [427, 'TGK-7G',    'RM-TP-TGK-90135',    90, 135],
  [428, 'TGK-7-1',   'RM-TP-TGK-80120-2',  80, 120],
  [429, 'TGK-7-1G',  'RM-TP-TGK-80120-2',  80, 120],
  [430, 'TGK-5',     'RM-TP-TGK-120180',  120, 180],
  [431, 'TGK-4',     'RM-TP-TGK-150225',  150, 225],
  [432, 'TGK-3',     'RM-TP-TGK-180270',  180, 270],
  [433, 'TGK-SG30',  'RM-TP-TGK-2032-ME',  20,  32],
  [434, 'SMG-7-1',   'RM-TP-SMU-80120',    80, 120],
  [435, 'SMG-8',     'RM-TP-SMU-6090-2',   60,  90],
  [436, 'SMG-7',     'RM-TP-SMU-90135-2',  90, 135],
  [437, 'SMG-7G',    'RM-TP-SMU-90135-2',  90, 135],
  [438, 'MBG-7',     'RM-TP-MBG-90135',    90, 135],
]
const rollOf = new Map(FABRIC.map(f => [f[0], f[1] * IN]))
rollOf.set(CPX.code, CPX.inch * IN)

const out = [
  '-- 태극기·기류 인쇄원단 yd → 장수 환산 (2026-08-07)',
  '-- 생성기 = docs/dongsan-import/gen_tgk_yd_conv.cjs (모델·검증 근거는 그 파일 헤더)',
  '-- ① 롤 폭을 items.width_mm 에 채운다 — 매입 라인 품명의 인치 표기가 유일한 출처였다.',
  '-- ② product_materials.quantity = **장당 소요 yd** · usage_type=FIXED_QTY',
  '--    → 원가 = quantity × 원단 avg_unit_cost(원/yd). 새 계산기가 필요 없다.',
  '-- 롤백 = docs/dongsan-import/rollback_tgk_yd_conv.sql',
  '',
]
for (const [code, inch] of FABRIC.map(f => [f[0], f[1]]).concat([[CPX.code, CPX.inch]])) {
  out.push(`UPDATE items SET width_mm = ${Math.round(inch * IN * 10)}, updated_at = CURRENT_TIMESTAMP WHERE item_code = '${code}';  -- ${inch}"`)
}
out.push('')
const report = []
for (const [pmid, pc, mc, d1, d2] of ROWS) {
  const roll = rollOf.get(mc)
  let b
  if (mc === CPX.code) {
    // 복합: 폭 방향은 두 규격이 각자 자기 칸을 차지한다(60칸 + 90칸). 각 규격은 **1벌**씩.
    b = { across: d1, along: d2, n: 1, perYd: YD / d2, waste: 1 - (60 + 90) / roll }
  } else {
    b = best(roll, d1, d2)
  }
  const ydPer = 1 / b.perYd
  out.push(`UPDATE product_materials SET quantity = ${ydPer.toFixed(4)}, usage_type = 'FIXED_QTY',`
    + ` notes = '${b.n}벌 × ${b.across}cm 가로지름 · 길이 ${b.along}cm · ${b.perYd.toFixed(3)}장/yd (롤 ${Math.round(roll)}cm · 로스 ${(100 * b.waste).toFixed(1)}%)'`
    + ` WHERE id = ${pmid};  -- ${pc} ← ${mc}`)   // ★ product_materials 에는 updated_at 컬럼이 없다(items 와 다름)
  report.push({ 제품: pc, 원단: mc, 배치: b.n + '벌×' + b.across, '장/yd': +b.perYd.toFixed(3), 'yd/장': +ydPer.toFixed(4), 로스: (100 * b.waste).toFixed(1) + '%' })
}
console.error(JSON.stringify(report, null, 0))
console.log(out.join('\n'))
