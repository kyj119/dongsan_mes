-- 엡손 솔벤잉크 계열 재분리 (2026-08-25) — 08-18 통합의 오류 정정
--
-- ★확정 사실(용준님): **9140·8140 겸용 잉크**와 **80610(이전 모델) 전용 잉크**는 서로 다른 물건이다.
--   80610 잉크는 자사 생산에 쓰지 않고 **유통(재판매) 취급만** 한다.
--   ⇒ 2026-08-18 에 80610 계열을 11색기로 통합한 것은 잘못이었다. 되돌린다.
--   (6색기 RM-I0023~0028 통합은 유지 — 9140·8140 이 같은 잉크를 쓰므로 그 통합은 옳았다.)
--
-- ★잘못 옮겨간 것: 80610 매입 라인 6건(poi 482~487, 2026-04-24, @73,000)이 11색기 품목(466~471)에
--   붙어 있다. 이 6건이 11색기의 **유일한 매입 근거**였고 avg_unit_cost 67,933 이 여기서 파생됐다.
--   (나머지 inventory_transactions 6건은 실사 보정 ADJUST 라 원가 근거가 아니다.)
--   ⇒ 라인을 되돌리면 11색기 원가는 근거를 잃으므로 0 으로 내린다. 실제 9140/8140 잉크 매입은
--     한국엡손 직거래 월말 계산서(`EPS-C13T51Y200`·`EPS-C13T891100`)에 뭉쳐 있고, 색상별 분해는
--     계산서 원본이 있어야 가능하다(별건).
--
-- 롤백: 백업 `_bak_0825_epson_resplit` 에 items 원본(before) 보존.
--   매입 라인 복구 = UPDATE purchase_order_items SET item_id = old_item_id (아래 매핑 역방향).

CREATE TABLE IF NOT EXISTS _bak_0825_epson_resplit AS
SELECT id, item_code, item_name, is_active, is_sales_item, is_purchase_item, avg_unit_cost, base_price,
       datetime('now') AS saved_at
  FROM items
 WHERE item_code LIKE 'RM-I002%' OR item_code LIKE 'RM-I003%'
    OR item_code LIKE 'RM-I007%' OR item_code LIKE 'RM-I008%'
    OR item_code IN ('GDS-EQ-EPS39405','GDS-EQ-EPS10153');

CREATE TABLE IF NOT EXISTS _bak_0825_epson_poi AS
SELECT id, item_id AS old_item_id, item_name, datetime('now') AS saved_at
  FROM purchase_order_items
 WHERE id IN (482,483,484,485,486,487);

-- ── 1) 매입 라인 6건을 80610 품목으로 되돌린다 ──────────────────────────
UPDATE purchase_order_items SET item_id = (SELECT id FROM items WHERE item_code='RM-I0075') WHERE id = 483; -- [C]
UPDATE purchase_order_items SET item_id = (SELECT id FROM items WHERE item_code='RM-I0076') WHERE id = 484; -- [M]
UPDATE purchase_order_items SET item_id = (SELECT id FROM items WHERE item_code='RM-I0077') WHERE id = 485; -- [Y]
UPDATE purchase_order_items SET item_id = (SELECT id FROM items WHERE item_code='RM-I0078') WHERE id = 482; -- [BK]
UPDATE purchase_order_items SET item_id = (SELECT id FROM items WHERE item_code='RM-I0079') WHERE id = 486; -- [LC]
UPDATE purchase_order_items SET item_id = (SELECT id FROM items WHERE item_code='RM-I0080') WHERE id = 487; -- [LM]

-- ── 2) 80610 계열 재활성화 = 유통(재판매) 전용 ─────────────────────────
--    매입해서 파는 상품이므로 is_sales_item·is_purchase_item 둘 다 1 (GOODS dual).
UPDATE items
   SET is_active = 1, is_sales_item = 1, is_purchase_item = 1,
       avg_unit_cost = 73000,
       search_keywords = TRIM(COALESCE(search_keywords,'') || ' 80610 S80610 유통 재판매 이전모델')
 WHERE item_code IN ('RM-I0075','RM-I0076','RM-I0077','RM-I0078','RM-I0079','RM-I0080');

UPDATE items
   SET is_active = 1, is_sales_item = 1, is_purchase_item = 1,
       search_keywords = TRIM(COALESCE(search_keywords,'') || ' 80610 S80610 유통 재판매 이전모델')
 WHERE item_code IN ('RM-I0082','RM-I0083','RM-I0084','RM-I0085');

-- ── 3) 9140/8140 겸용 계열 = 이름에 장비 세대를 명시하고 원가 근거 제거 ──
--    ★「품목명에 장비를 넣지 않는다」(08-18 규칙)는 **같은 잉크를 쓰는 장비끼리**에만 맞는 말이다.
--      세대가 다르면 잉크가 다르므로 세대는 반드시 이름에 남긴다.
UPDATE items
   SET item_name = REPLACE(item_name, '엡손솔벤잉크 ', '엡손 솔벤잉크 9140/8140 '),
       avg_unit_cost = 0,
       search_keywords = TRIM(COALESCE(search_keywords,'') || ' 9140 8140 S9140 S8140 겸용 생산용')
 WHERE item_code IN ('RM-I0029','RM-I0030','RM-I0031','RM-I0032','RM-I0033','RM-I0034',
                     'RM-I0035','RM-I0036','RM-I0037','RM-I0038','RM-I0039');

-- ── 4) 장비·소모품 품목명 판독 가능하게 (제품코드 실조회 결과 반영) ────
--    C11CL39405 = Epson SureColor SC-S8140 본체 (epson.co.kr 제품 페이지 확인)
--    C13S210153 = Epson 유지보수 키트(Maintenance Kit, SC-S9100/S9170 계열) — 장비가 아니라 소모품
UPDATE items
   SET item_name = '엡손 SureColor SC-S8140 본체 (C11CL39405)',
       search_keywords = TRIM(COALESCE(search_keywords,'') || ' S8140 SC-S8140 8140 프린터 장비 본체 C11CL39405')
 WHERE item_code = 'GDS-EQ-EPS39405';

UPDATE items
   SET item_name = '엡손 유지보수 키트 (C13S210153 · S9140/9170용)',
       search_keywords = TRIM(COALESCE(search_keywords,'') || ' 유지보수 메인터넌스 키트 와이퍼 필터 S9140 S9170 C13S210153')
 WHERE item_code = 'GDS-EQ-EPS10153';
