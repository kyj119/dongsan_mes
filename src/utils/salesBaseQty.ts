// ============================================================================
// 판매 라인 수량 → base 단위 환산 (재료비 추정 전용) — 단일 소스
// ----------------------------------------------------------------------------
// 왜 필요한가 (2026-08-25 발견)
//   items.avg_unit_cost 는 **base_unit 기준**이다(base 리베이스, 2026-08-20).
//   그런데 유통 판매 라인의 order_items.quantity 는 **관리단위(롤)** 로 들어온다 —
//   SPM011G-127 은 avg_unit_cost 2,325원/M · pack_size 50 · 롤 판매단가 115,000원인데
//   라인은 「수량 2 · 단위 yd · 단가 115,000」이다. oi.unit 라벨은 이관 잔재라 못 믿는다.
//   그대로 곱하면 원가가 pack_size 배(30~61배) 과소로 잡힌다.
//   실측 2026년 롤 품목 886라인 매출 1억 5,296만에서 원가가 357만(2.3%)으로 인식됐고,
//   환산하면 1억 3,381만(87.5%)이다 — **원가 1억 3,024만이 사라져 있었다.**
//   ⚠️ 이 왜곡은 「추정원가 > 매출」 이상치 표에 절대 안 걸린다. 방향이 반대다.
//
// 환산 여부 — base_unit 이 NULL 이면 환산하지 않는다(현수막 AQ* 계열: 발주도 재고도 yd).
//   그 pack_size=130 은 실사 입력 편의 계수일 뿐 환산계수가 아니다
//   (inventoryCount.ts:76 · 마이그 0540). 놓치면 현수막 원가가 130배가 된다.
//   단위 3층 구조 정본 = utils/rollConsumption.ts 헤더.
//
// 라인 단위 판별 — 같은 품목에 롤 판매와 절단(미터) 판매가 섞인다(실측 9품목·혼재 9라인).
//   기준값 = avg_unit_cost × √pack_size = base 원가와 롤 원가의 **기하평균**.
//   비율 축에서 양쪽에 등거리라 임의 상수가 아니다(pack_size 가 달라도 같은 규칙).
//   유상 라인의 단가가 이 값 미만이면 base 단위 판매로 본다.
//   실측 검증(2026-08-25) — base 판정: 부직포 60yd@2,500 · LG시트 17개@6,000 ·
//   족자봉 12개@2,100 / 롤 판정: 나머지 877라인 전량. 오분류 0.
//   ★단가 0원 라인은 롤로 본다 — 원가를 숨기지 않는 쪽이 안전하다
//     (실측 4건 전부 롤 판매의 무상분: 패트배너·SPP031M 청주향).
// ============================================================================

/**
 * 판매 라인 수량을 base 단위로 환산하는 SQL 조각.
 * @param oi order_items 별칭
 * @param it items 별칭
 */
export function salesBaseQtySql(oi: string = 'oi', it: string = 'i'): string {
  return `(CASE
    WHEN ${it}.base_unit IS NULL OR COALESCE(${it}.pack_size, 1) <= 1 THEN ${oi}.quantity
    WHEN ${oi}.unit_price > 0
     AND ${oi}.unit_price < ${it}.avg_unit_cost * SQRT(${it}.pack_size) THEN ${oi}.quantity
    ELSE ${oi}.quantity * ${it}.pack_size
  END)`
}

/** 추정 재료원가 SQL 조각 = avg_unit_cost(base 단가) × base 환산 수량. */
export function estMaterialCostSql(oi: string = 'oi', it: string = 'i'): string {
  return `(COALESCE(${it}.avg_unit_cost, 0) * ${salesBaseQtySql(oi, it)})`
}
