-- 0285_items_production_required.sql
-- 기성품/유통 즉시출고 기능 (Phase 1):
--   "제작 필요 여부"를 카테고리에서 파생하지 않고 품목 정적 속성으로 분리.
--   production_required = 1: 제작품(made-to-order) → 카드 생성, 생산 후 출고
--   production_required = 0: 기성품/유통(from-stock) → 카드 미생성, 생성 즉시 출고 준비(shipment_ready=1), 출고 시 재고차감
-- 기본값: 기존 동작 보존 위해 1. 단 item_type=GOODS/MATERIAL은 자동 0(유통/부자재는 제작 무관).
-- 그 외 기성 PRODUCT(태극기 호수별 등)는 품목 관리 UI에서 수동 지정.

ALTER TABLE items ADD COLUMN production_required INTEGER NOT NULL DEFAULT 1;

UPDATE items SET production_required = 0 WHERE item_type IN ('GOODS', 'MATERIAL');
