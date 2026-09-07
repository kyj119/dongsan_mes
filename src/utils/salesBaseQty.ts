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
// 환산 여부 — 판정은 `utils/unitConvert.ts` isMultiUom() 과 **같은 규칙**이어야 한다:
//   base_unit 이 있고 · unit 과 **다르고** · pack_size 가 유효할 때만 환산한다.
//   현수막 AQ* 계열은 발주도 재고도 yd 라 환산 대상이 아니고, 그 pack_size=130 은
//   실사 입력 편의 계수일 뿐 환산계수가 아니다(inventoryCount.ts:101 · 마이그 0540).
//   ⚠️2026-09-03 까지 이 식은 `base_unit IS NULL` 만 봤다. 오늘 값으로는 결과가 같지만
//   (base_unit=unit 이면서 pack>1 인 품목 prod 0건), AQ* 47종에 base_unit 을 채우는 순간
//   130 이 환산계수로 살아나 **현수막 원가가 130배**가 된다. base_unit 공백은 결함이 아니라
//   「포장 환산 없음」이라는 설계된 상태다 — 채우려면 pack_size 를 먼저 정리해야 한다.
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
    WHEN ${it}.base_unit IS NULL OR ${it}.base_unit = '' OR ${it}.base_unit = ${it}.unit
      OR COALESCE(${it}.pack_size, 1) <= 1 THEN ${oi}.quantity
    WHEN ${oi}.unit_price > 0
     AND ${oi}.unit_price < ${it}.avg_unit_cost * SQRT(${it}.pack_size) THEN ${oi}.quantity
    ELSE ${oi}.quantity * ${it}.pack_size
  END)`
}

/** 추정 재료원가 SQL 조각 = avg_unit_cost(base 단가) × base 환산 수량. */
export function estMaterialCostSql(oi: string = 'oi', it: string = 'i'): string {
  return `(COALESCE(${it}.avg_unit_cost, 0) * ${salesBaseQtySql(oi, it)})`
}

// ============================================================================
// 라인 원가 = **조립 우선, 없으면 추정** (2026-09-07)
// ----------------------------------------------------------------------------
// 원가 축은 품목 종류에 따라 둘이고, 둘은 **경쟁하는 정본이 아니라 서로 다른 대상**을 잰다:
//
//   조립 `order_items.total_cost` — 제조물. `utils/orderLineCost` 가 규격에서 원단 소요량을
//     내고(폭매칭) 인쇄방식별 잉크 ㎡단가를 더한 **이론 재료비**다. 로스는 안 들어 있다.
//   추정 `estMaterialCostSql`     — 유통물(MATERIAL·GOODS). 매입 평균단가 × base 환산 수량.
//
// ★2026-09-07 실측 — 이 파일의 소비자(수익성 탭)는 조립축을 **아예 안 보고 있었다.**
//   `reports.ts` 주석이 "total_cost 는 생산 경로가 없어 전량 0(감사 확정)" 이라 단정했는데
//   그 사이 S2 가 원가를 채웠다: 2026년 수성 99% · 전사 99% · 솔벤 93% · UV 89% 가 값을 갖는다.
//   낡은 전제 때문에 인쇄물 매출 **28.9억이 통째로 「원가 미상」** 으로 빠져 있었고,
//   커버리지가 30% 로 보고됐다. 같은 파일 `:865`(월간 KPI)는 이미 total_cost 를 쓰고 있어
//   **한 파일 안에서 두 원가축이 공존**했다.
//
// ⚠️ 우선순위를 조립에 두는 이유 — 겸용 품목(태극기 PRODUCT 79종 중 77종이 `is_purchase_item=1`)은
//   양쪽 축에 값이 다 있다. 그때 **라인별 규격으로 계산된 조립값이 품목 평균 매입단가보다 구체적**이다.
//   CASE 로 하나만 고르므로 이중계상은 구조적으로 불가능하다.
//
// ⚠️ **`departments.ts`(부문별 손익 COGS)는 일부러 바꾸지 않았다.** 그쪽 영업이익은 실측 대사를
//   거친 값이라(1~7월 그룹 +3억 825만) 원가축을 조용히 갈면 검증된 숫자가 소리 없이 움직인다.
//   전환하려면 값 대조를 먼저 한다 — [[design-pnl-expense-sourcing]].
// ============================================================================

/**
 * 라인 원가 SQL 조각 — 조립원가(`total_cost`)가 있으면 그것, 없으면 매입 추정.
 * `hasLineCostSql` 과 **짝으로** 쓴다(WHERE 로 거르지 않으면 원가 0 라인이 마진 100% 로 섞인다).
 */
export function lineCostSql(oi: string = 'oi', it: string = 'i'): string {
  return `(CASE WHEN COALESCE(${oi}.total_cost, 0) > 0 THEN ${oi}.total_cost
                ELSE ${estMaterialCostSql(oi, it)} END)`
}

/** 원가를 낼 수 있는 라인인가 = 조립값이 있거나 매입단가가 있다. */
export function hasLineCostSql(oi: string = 'oi', it: string = 'i'): string {
  return `(COALESCE(${oi}.total_cost, 0) > 0 OR COALESCE(${it}.avg_unit_cost, 0) > 0)`
}

/** 이 라인이 조립축인가(= 매출을 조립/추정으로 가르는 데 쓴다). */
export function isBuildupCostSql(oi: string = 'oi'): string {
  return `(COALESCE(${oi}.total_cost, 0) > 0)`
}
