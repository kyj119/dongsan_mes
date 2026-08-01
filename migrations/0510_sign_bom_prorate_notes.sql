-- 0510: 간판 BOM 바류(장물) 자재 산정 방식 확정 기록 — 비례(자투리 이월). 용준님 확정 2026-08-01.
-- "트러스바는 잘라 쓰고 자투리는 활용. 날개·보강대도 같은 가정." + 입체바·캡바도 비례(같은 날 확정).
-- → 원가 산정 시 ceil 금지·둘레/가로 비례. SMPS·형광등·옆마구리는 간판별 개별 장착 → ceil/고정 유지.
-- 산정 엔진 = docs/dongsan-import/gen_sign_cost_report.py PRORATE 집합. notes 는 기록 목적(데이터 무변경).

UPDATE product_materials SET notes='개당 7m — ★산정=둘레 비례(자투리 이월·2026-08-01 확정). 폭 선택 규칙(세로≥1.5m→300?)은 미결'
WHERE material_item_id=(SELECT id FROM items WHERE item_code='SGM-TRB-R200-WH') AND usage_type='PER_PERIMETER';

UPDATE product_materials SET notes='날개 개당 7m — ★산정=둘레 비례(자투리 이월·2026-08-01 확정)'
WHERE material_item_id=(SELECT id FROM items WHERE item_code='SGM-TRW-WH') AND usage_type='PER_PERIMETER';

UPDATE product_materials SET notes='가로 0.9m당 1개(★간격 가정) — ★산정=비례(자투리 이월·2026-08-01 확정)'
WHERE material_item_id=(SELECT id FROM items WHERE item_code='SGM-TRF') AND usage_type='PER_WIDTH';

UPDATE product_materials SET notes='측면 입체바 80mm — 개당 3m·★산정=둘레 비례(자투리 이월·2026-08-01 확정)'
WHERE material_item_id=(SELECT id FROM items WHERE item_code='SGM-IPB-WH') AND usage_type='PER_PERIMETER';

UPDATE product_materials SET notes='캡바 개당 3m — ★산정=둘레 비례(자투리 이월·2026-08-01 확정). ★사용 여부·색상은 미결'
WHERE material_item_id=(SELECT id FROM items WHERE item_code='SGM-KPB-WH') AND usage_type='PER_PERIMETER';
