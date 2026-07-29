-- 0485_merge_premium_solvent_banner.sql
-- 솔벤 현수막 고급형(SVB-PR-152) 을 일반형(SVB-152)에 통합 후 하드삭제 (사용자 지시)
--
-- 배경: '솔벤 현수막' 1500mm 에 SVB-152(일반형) ↔ SVB-PR-152(고급형)가 동폭 경합.
--   고급형은 운영상 불필요하다는 판단 → 품목 마스터에서 제거한다.
--
-- ⚠️ 하드삭제 전 참조 전수 확인 (items(id) 를 FK로 참조하는 22개 컬럼 전건 조회):
--     purchase_order_items.item_id = 2건  ← 유일한 참조
--     나머지 21개 컬럼(order_items·inventory·product_materials·quotation_items·
--     inventory_transactions·pp_material_deductions 등) = 전부 0건
--   → 매입 라인 2건만 일반형으로 재연결하면 고아 참조 없이 삭제 가능하다.
--
-- 재연결 대상 (이력 자체는 보존 — item_name 텍스트는 발주 당시 기재 그대로 둔다):
--     2026-05-04 SMP-0126 (주)티피엠  120 x 1,490 = 178,800  RECEIVED
--     2026-05-22 SMP-0160 경원GH      240 x 1,650 = 396,000  RECEIVED
--
-- ⚠️ 원가 영향(사용자 고지 후 진행): 통합 전 SVB-152 매입 3건 평균 1,393원(1,170~1,650),
--    고급형 2건 평균 1,570원(1,490~1,650). 합치면 5건 평균이 올라간다.
--    items.avg_unit_cost 는 입고 시점에 갱신되는 캐시라 이 UPDATE 로 자동 재계산되지 않는다
--    (SVB-152 = 1335.21 유지). 즉 지금 당장 왜곡은 없고, 다음 입고 때 5건 기준으로 잡힌다.
--
-- ⚠️ 되돌릴 수 없다. items 행이 사라지므로 복구는 재등록뿐이다.
-- 성격: 데이터 이관 + 하드삭제. item_code 기준이라 재실행해도 안전(이미 삭제됐으면 0행).

-- ① 매입 라인 2건을 일반형으로 재연결
UPDATE purchase_order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'SVB-152'),
       updated_at = CURRENT_TIMESTAMP
 WHERE item_id = (SELECT id FROM items WHERE item_code = 'SVB-PR-152');

-- ② 고급형 품목 하드삭제
DELETE FROM items WHERE item_code = 'SVB-PR-152';
