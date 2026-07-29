-- 0489_doanji_floorcoat_backlit_wooddowel.sql
-- 자재 마스터 잔여 4건 정리 (사용자 확인) — 도안지 · 바닥코팅 · 백릿 · 원형나무
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ① 도안지(RM-DOAN) — 폭 125 확정 + 출력 미사용
--
--   '출력에는 사용하지 않는다'(사용자) → deduction_method 를 ROLL 에서 NONE 으로 내린다.
--   ROLL 로 두면 인쇄 자동차감(autoDeductInventory)의 폭매칭 후보가 되어, 제품에 연결되는
--   순간 출력물 원단으로 차감될 수 있다. 폭(1250)은 발주·재고 판단용으로 채워 둔다.
--   ⚠️ 현재 product_materials 연결 0개라 동작 변화는 없다(예방 조치).
--
-- ② 무광 바닥코팅(MCFLOOR-127) — 별개 제품이므로 그룹 분리
--
--   호홍 품목인데 그룹이 '무광코팅지 자동엠보(45m/120g)'(호진 라인)로 잘못 들어가 있었다.
--   '바닥코팅(사선)'은 자동엠보와 다른 제품(사용자 확인) → 자기 이름의 그룹으로 분리.
--   분리하면 HJ-MGAUTO-P127(1270)과의 동폭 경합이 생기지 않으므로 폭도 함께 채운다.
--
-- ③ 수성 백릿-프라임(PJ-BACKLIT-P152) — 1520 확정(사용자)
--
--   0487 에서 보류했던 건. 호홍 백릿(BKLT-AQ-150)은 1500 이지만 프라임 것은 1520 이 맞다.
--   같은 '백릿'이어도 제조사별 실물 폭이 달라 서로 대체 가능한 자재가 아니다.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ④ 원형나무(WDR-01) 품목 분할 + 25mm 90폭 신설
--
--   한 품목의 규격이 '20mm·90/70폭' 으로 **폭 2종이 뭉쳐** 있어 단일 값으로 관리 불가였다.
--   발주 기재명이 규격을 구분하고 있어(90폭 12건 / 70폭 2건) 이력까지 정확히 나눌 수 있다.
--
--     WDR-01      (유지·재정의) 원형나무 20mm 90폭   ← 매입 12건이 이 규격
--     WDR-20-070  (신설)        원형나무 20mm 70폭   ← 매입 2건 이관
--     WDR-25-090  (신설)        원형나무 25mm 90폭   ← 신규 제품
--
--   ⚠️ WDR-01 코드는 유지한다 — 매입 14건이 붙어 있고 참조는 items.id 기준이라 코드를 바꿀
--      이득이 없다. 다수 규격(90폭)을 기존 코드에 남기는 쪽이 이력 추적에도 유리하다.
--   ⚠️ width_mm 은 세 품목 모두 채우지 않는다. 원형나무는 현수막 거치봉(부속)이고
--      '90폭'은 **대응하는 현수막 폭**이지 이 자재 자체의 폭이 아니다. width_mm 에 넣으면
--      원단 폭매칭 후보로 잘못 들어가고, 같은 그룹에 90폭이 둘(20mm·25mm)이라 동폭 경합까지
--      만든다. 구분은 specification 으로 한다.
--   ⚠️ 단가: 20mm 70폭은 기존에 같은 값으로 매입·판매되던 규격이라 승계한다
--      (실매입 2건 모두 155원 · 판매가 215원). 25mm 90폭은 신규라 0 — **판매 전 단가 지정 필요**.
--   ⚠️ WDR-01 의 avg_unit_cost(147.68)는 14건 혼합 평균이라 70폭 2건을 떼면 147.24 가 되지만
--      이 값은 입고 시점 갱신 캐시라 여기서 건드리지 않는다(다음 입고 때 반영).
--
-- 성격: 데이터 정정 + 신규 2품목. INSERT 는 NOT EXISTS 가드라 멱등.

-- ① 도안지
UPDATE items SET width_mm = 1250, deduction_method = 'NONE', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'RM-DOAN';

-- ② 무광 바닥코팅
UPDATE items SET item_group = '무광 바닥코팅(사선)-호홍', width_mm = 1270, updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'MCFLOOR-127';

-- ③ 수성 백릿-프라임
UPDATE items SET width_mm = 1520, updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'PJ-BACKLIT-P152';

-- ④-1 기존 품목을 20mm 90폭으로 재정의
UPDATE items
   SET item_name = '원형나무 20mm 90폭', specification = '20mm·90폭', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'WDR-01';

-- ④-2 20mm 70폭 신설 (단가 승계)
INSERT INTO items (
  item_code, item_name, item_group, item_type, category, category_id, unit,
  specification, deduction_method, is_active, is_sales_item, is_purchase_item,
  production_required, base_price, avg_unit_cost
)
SELECT 'WDR-20-070', '원형나무 20mm 70폭', '원형나무', 'MATERIAL', '원자재', 5, 'EA',
       '20mm·70폭', 'NONE', 1, 1, 1, 0, 215, 155
 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'WDR-20-070');

-- ④-3 25mm 90폭 신설 (신규 제품 — 단가 미정)
INSERT INTO items (
  item_code, item_name, item_group, item_type, category, category_id, unit,
  specification, deduction_method, is_active, is_sales_item, is_purchase_item,
  production_required, base_price, avg_unit_cost
)
SELECT 'WDR-25-090', '원형나무 25mm 90폭', '원형나무', 'MATERIAL', '원자재', 5, 'EA',
       '25mm·90폭', 'NONE', 1, 1, 1, 0, 0, 0
 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'WDR-25-090');

-- ④-4 70폭 매입 이력 2건을 신설 품목으로 이관 (발주 기재명이 규격을 구분한다)
UPDATE purchase_order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'WDR-20-070'),
       updated_at = CURRENT_TIMESTAMP
 WHERE item_id = (SELECT id FROM items WHERE item_code = 'WDR-01')
   AND item_name LIKE '%70폭%';
