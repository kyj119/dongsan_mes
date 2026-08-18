-- 0533_item_street_banner.sql
-- 수성 가로등현수막 품목 신설 (파일명 제품유형 `(가로등현수막)` 대응)
--
-- 근거: Z: `★현수막-수성출력★` 축에 `(가로등현수막)` 3건. 규격 60x180 으로 전사 가로등배너와 같지만
--       **축이 다르다** — 전사(TRB-PO-180 폰지 / TRB-ME-180 매쉬)는 원단에 열전사,
--       이건 수성 잉크젯 출력에 현수막 후가공(삼면접어미싱+상단봉미싱+끈고리)이다.
--       수성/솔벤 계열에 대응 품목이 없어 신설한다.
--
-- ★신설 전 계열 전량 열거 완료(feedback-item-duplicate-before-create, 재발 4회):
--   가로등 계열 = TRB-PO-150/160/180 · TRB-ME-150/160/180 (전량 전사) · AQ-INB(실내배너) · AQ-MNB(미니배너).
--   수성 축 가로등 품목 없음 확인 → 중복 아님.
--
-- ⚠️ 함께 요청된 「비점착 합성지」는 **만들지 않는다**.
--    AQ-SYN(수성 합성지)의 search_keywords 가 이미 `합성지(비접착)` 이다 — 그 품목이 곧 비접착이다.
--    별도 등록하면 중복이 된다. 원단 축에도 SYN-NA-127(비점착 합성지 30M 호홍)이 이미 있다.
--
-- 코드 체계: 실사용 관행을 따른다. `PM-####` 자동채번은 **prod 에 단 한 건도 없다** —
--   전부 의미 코드다(AQ-BANNER·AQ-INB 실내배너·AQ-MNB 미니배너). 그래서 AQ-STB(STreet Banner).
-- pricing_method=AREA: 현수막 계열은 면적 단가(AQ-BANNER 와 동일).
-- base_price=0: 단가는 /api/prices 가 최근거래가에서 제안한다(품목 마스터에 임의값을 박지 않는다).
-- 성격: 데이터 additive. WHERE NOT EXISTS 로 멱등.

INSERT INTO items (
  item_code, item_name, category, sub_category, unit, base_price,
  is_active, is_sales_item, is_purchase_item, pricing_method,
  item_type, category_id, production_required, stock_mode, search_keywords
)
SELECT
  'AQ-STB', '수성 가로등현수막', '수성', '현수막', 'EA', 0,
  1, 1, 0, 'AREA',
  'PRODUCT',
  -- category_id 는 NOT NULL 이다. 형제(AQ-BANNER) → 카테고리표 '수성' → '기타' → 첫 행 순으로 떨어뜨린다.
  -- ⚠️ 형제 하나만 참조하면 그 품목이 없는 DB(로컬 시드)에서 NULL 이 되어 제약 위반으로 죽는다(실제 발생).
  COALESCE(
    (SELECT category_id FROM items WHERE item_code = 'AQ-BANNER'),
    (SELECT id FROM item_categories WHERE category_name = '수성'),
    (SELECT id FROM item_categories WHERE category_name = '기타'),
    (SELECT id FROM item_categories ORDER BY id LIMIT 1)
  ),
  1, 'CONTINUOUS', '가로등현수막,가로등 현수막,가로등배너(수성)'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'AQ-STB')
  AND EXISTS (SELECT 1 FROM item_categories);
