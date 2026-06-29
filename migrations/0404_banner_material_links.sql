-- 0404: 배너 원단 product_materials 링크(기등록 원단만) — 자이언트(폰지/매쉬)·실내/미니(패트배너 30M 호홍).
-- 폭매칭 자동차감(ROLL) 활성화. 윈드(TRW)·워킹(TRWK)=니트 미등록 / 솔벤패트(SV-PATB)=솔벤급 패트 미등록 → 원단 등록 후 별도 링크(후속).
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m ON (
     (p.item_code='TRGI-PO' AND m.item_group='폰지')
  OR (p.item_code='TRGI-ME' AND m.item_group='매쉬')
  OR (p.item_code IN ('AQ-INB','AQ-MNB') AND m.item_group='패트배너 30M 호홍') )
WHERE p.item_code IN ('TRGI-PO','TRGI-ME','AQ-INB','AQ-MNB')
  AND m.item_type='MATERIAL';
