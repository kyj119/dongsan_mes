-- 품목 원가(items.avg_unit_cost) backfill — 매입 실적(purchase_order_items) 기반
-- 2026-07-19 최초 적용 (prod, 315개 품목). 재실행 멱등(매입 증가 시 주기적 재실행 가능).
--
-- 재실행 이력
--   2026-08-07 prod 재실행 (634품목) — 이카운트·SmartA 매입 이관이 07-19 **이후**에 들어와
--     주력 원단(폰지·태극기 인쇄원단·매쉬·후렉스·텐트천)이 전부 단가 0으로 남아 있었다.
--     결과: 0→값 309품목 · 기존값 갱신 57품목(대부분 ±3%, 신규 매입 반영) · 불변 268품목.
--     매출 원가커버 34.8% → **65.8%** (전사 0→96%, 솔벤 93→100%, 태극기 0→46%, UV 16→38%).
--     롤백 = `docs/price/rollback_avg_cost_2026-08-07.sql` (실행 전 634품목 값 그대로).
--     ⚠️ 재실행 전 확인한 것: ① CANCELLED 발주 라인 0건 ② `vat_included=1` 975줄도 amount 가
--       공급가(PO `total_amount` 와 원 단위 일치)라 VAT 왜곡 없음 ③ 수기 보정된 LED 단가 불변
--       ④ `inventory` 평가액·`inventory_auto_deductions` 모두 0이라 기존 재무 숫자 영향 없음.
--     분석 = `docs/analysis/2026-08-07-sales-cost-analysis.md` §5
--
-- 방식: 품목별 가중평균 = SUM(amount)/SUM(quantity)  (recalculate-avg 이동평균 공식과 동일)
-- 소스: purchase_order_items (당시 2026-01~06, 6개월). inventory_transactions는 가격 IN이 비어
--       designed recalculate-avg가 동작 못 함 → 매입 원장에서 직접 backfill.
-- VAT: 입력값 그대로(데이터 vat_amount=0, 실거래액=선명 미지급 정합, 매출 order_items와 동일 기준). 순액 변환 안 함.
-- 범위: 매입이력 있는 품목만 갱신, 없는 품목(당시 514개)은 미변경(0 유지, 추후 수동/규칙).
--
-- ⚠️ 향후 정식화: 매입 입고 → inventory_transactions IN 기록 → recalculate-avg 자동화(Policy B, 6월초 재고 baseline 필요).
--    현재는 그 정식 파이프라인 미가동이라 이 직접 backfill로 대체.

UPDATE items SET avg_unit_cost = (
  SELECT ROUND(SUM(poi.amount) * 1.0 / NULLIF(SUM(poi.quantity), 0), 2)
  FROM purchase_order_items poi
  WHERE poi.item_id = items.id
    AND COALESCE(poi.unit_price, 0) > 0
    AND COALESCE(poi.quantity, 0) > 0
)
WHERE id IN (
  SELECT DISTINCT item_id FROM purchase_order_items
  WHERE item_id IS NOT NULL AND COALESCE(unit_price, 0) > 0 AND COALESCE(quantity, 0) > 0
);
