-- 0511: 간판 BOM — 실물 작업지시서 역추적 보정 (신규 프레임 9라인 검증 세션 2026-08-01)
-- 원천: Z:\1. 광고물\{오케이스카이·시선기획·수양광고·반하다디자인·더찬스디자인·푸른광고} 도안·견적 7건 판독.
-- 판정: FRL/FRN 신규 그룹 9라인 전부 실제 신규 제작 확정(오분류 아님 — 소형 신규 판가/㎡가 높은 것).
--       역방향 실증 1건: oi 14420(더찬스 8100×1650·748,000=56k/㎡)은 교체로 분류됐지만
--       실물(260428_더찬스디자인_진산전주식당_후레임.ai)이 신규 제작(LED형광등 조립·까치발 3ea).
--       → 대형 신규 판가 34~60k/㎡ = 교체 가격대와 겹침(90k 임계의 구조 한계 — 전수 보정은 용준님 결정 대기).

-- (1) oi 14420 재분류: FRL-R → FRL (실물 근거)
UPDATE order_items SET item_id=(SELECT id FROM items WHERE item_code='SIGN-FRL')
 WHERE id=14420 AND item_id=(SELECT id FROM items WHERE item_code='SIGN-FRL-R');

-- (2) 형광등 밀도 실측 보정 4 → 5.5/㎡ (손의손 3판: 80ea/15.11㎡=5.3 · 54/9.19=5.9 · 54/9.65=5.6)
UPDATE product_materials SET usage_param=5.5,
  notes='실측 5.5개/㎡ — 손의손 용인·충주호암 3판 역산(5.3~5.9) 2026-08-01 보정. 단 등조립 없음 주문도 실재(오케이스카이 260129)'
WHERE product_item_id=(SELECT id FROM items WHERE item_code='SIGN-FRL')
  AND material_item_id=(SELECT id FROM items WHERE item_code='SGM-LEDF-F20S')
  AND usage_param=4;

-- (3) 까치발 BOM 신설 — 작업지시 3건 전부 등장(2~5ea). 실측: 3.82m→2·6.38→3·6.7→3·8.1→3·11.19→5
--     ceil(가로/2.5m) 근사(5점 중 4점 적합·개별 장착=ceil 유지). 매입가 = 흑색 avg_unit_cost 3,801 기준.
UPDATE items SET base_price=3800 WHERE item_code='ACC-029' AND base_price=0;
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes)
SELECT p.id, m.id, 1, NULL, 'PER_WIDTH', 2.5, '★가로 2.5m당 1개(실측 5점 근사) — 판가 9,500~10,000/ea 실측'
FROM items p, items m WHERE p.item_code='SIGN-FRL' AND m.item_code='ACC-029';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes)
SELECT p.id, m.id, 1, NULL, 'PER_WIDTH', 2.5, '★가로 2.5m당 1개(실측 5점 근사)'
FROM items p, items m WHERE p.item_code='SIGN-FRN' AND m.item_code='ACC-029';
