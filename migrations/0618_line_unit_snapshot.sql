-- 0618 라인 단위 스냅샷 (2026-09-17) — spec docs/superpowers/specs/2026-09-17-item-units.md 2·3단계
-- 단위 스위칭의 조건 = 라인이 (입력수량·입력단위·계수)를 스스로 갖는다. 품목 마스터의 단위표가 뒤에 바뀌어도
-- 입고 환산·문서 표기는 라인 계수를 쓴다(단가 축 0600 과 같은 원리). 컬럼은 전부 NULL 허용 = 없으면 현행(품목 마스터 계수).
--
-- 발주·입고: unit_factor = 라인 unit 1개가 기본단위 몇 개인가. 입고 환산 = accepted × unit_factor(없으면 packFactor(item)).
-- 주문서·견적서: quantity 는 기본단위(EA) 그대로. sales_unit/sales_qty 는 입력·표기용(「10조(20EA)」), unit_factor = 1 sales_unit 이 기본단위 몇 개.
ALTER TABLE purchase_order_items ADD COLUMN unit_factor REAL;
ALTER TABLE inventory_receipt_items ADD COLUMN unit_factor REAL;
ALTER TABLE order_items ADD COLUMN sales_unit TEXT;
ALTER TABLE order_items ADD COLUMN sales_qty REAL;
ALTER TABLE order_items ADD COLUMN unit_factor REAL;
ALTER TABLE quotation_items ADD COLUMN sales_unit TEXT;
ALTER TABLE quotation_items ADD COLUMN sales_qty REAL;
ALTER TABLE quotation_items ADD COLUMN unit_factor REAL;
-- 폼 스위칭 노출 스위치 — OFF 가 기본(병행테스트 종료 후 ON). 표시·저장 경로는 켜기 전까지 현행 그대로.
INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('item_units.forms', '0');
