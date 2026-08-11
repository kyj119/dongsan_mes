-- 품목 기본단가 백필 — 이카운트 이관 실거래 이력에서 역산한 중앙값
--
-- 생성 = node scripts/derive-item-prices.cjs --sql   (재생성하면 같은 결과가 나온다)
-- 대상 = A(변동<0.15)·B(<0.60) 등급만. C·N·X 는 사람이 정한다(근거 = docs/pricing/derived-prices.csv).
-- AREA 품목은 원/㎡, FIXED 품목은 원/개. 청구면적 = 10cm 올림 + 최소 1m.
--
-- 멱등 = base_price 가 0 인 행만 건드린다. 재실행하면 조건이 안 맞아 no-op.
--
-- 되돌리기 = 변경 전 값이 price_change_history 에 남는다. 실행 직후 시각을 적어 범위를 좁힐 것
-- (이 테이블은 사람이 바꾼 단가도 함께 쌓이므로 조건 없이 되돌리면 남의 변경까지 지운다):
--   SELECT changed_at, COUNT(*) FROM price_change_history WHERE target_type = 'ITEM' GROUP BY 1 ORDER BY 1 DESC LIMIT 3;
--   UPDATE items SET base_price = 0 WHERE id IN (
--     SELECT target_id FROM price_change_history
--      WHERE target_type = 'ITEM' AND old_price = 0 AND changed_at >= '<위에서 확인한 실행시각>');

-- SV-SHEET 솔벤 시트 — 1306라인 28곳 · 10000원/㎡ (Q1 8900~Q3 11700, 변동 0.28)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 10000, NULL FROM items
   WHERE item_code = 'SV-SHEET' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 10000, updated_at = datetime('now')
 WHERE item_code = 'SV-SHEET' AND COALESCE(base_price, 0) = 0;

-- ETC-SHIP 배송비(택배/화물) — 1285라인 97곳 · 4200원 (Q1 4200~Q3 4200, 변동 0.00)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 4200, NULL FROM items
   WHERE item_code = 'ETC-SHIP' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 4200, updated_at = datetime('now')
 WHERE item_code = 'ETC-SHIP' AND COALESCE(base_price, 0) = 0;

-- SV-BANNER 솔벤 현수막 — 1073라인 48곳 · 7100원/㎡ (Q1 7000~Q3 9000, 변동 0.28)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 7100, NULL FROM items
   WHERE item_code = 'SV-BANNER' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 7100, updated_at = datetime('now')
 WHERE item_code = 'SV-BANNER' AND COALESCE(base_price, 0) = 0;

-- AQ-PAT 수성 패트 — 637라인 70곳 · 6700원/㎡ (Q1 5600~Q3 7200, 변동 0.24)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 6700, NULL FROM items
   WHERE item_code = 'AQ-PAT' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 6700, updated_at = datetime('now')
 WHERE item_code = 'AQ-PAT' AND COALESCE(base_price, 0) = 0;

-- UV-FLEXL UV 조명후렉스 — 429라인 43곳 · 10000원/㎡ (Q1 8000~Q3 10000, 변동 0.20)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 10000, NULL FROM items
   WHERE item_code = 'UV-FLEXL' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 10000, updated_at = datetime('now')
 WHERE item_code = 'UV-FLEXL' AND COALESCE(base_price, 0) = 0;

-- SV-SHEETG 솔벤 그레이시트 — 336라인 12곳 · 10500원/㎡ (Q1 9800~Q3 11300, 변동 0.14)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 10500, NULL FROM items
   WHERE item_code = 'SV-SHEETG' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 10500, updated_at = datetime('now')
 WHERE item_code = 'SV-SHEETG' AND COALESCE(base_price, 0) = 0;

-- TGK-7G 태극기 7호 게양용 — 201라인 54곳 · 3000원 (Q1 2500~Q3 3600, 변동 0.37)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 3000, NULL FROM items
   WHERE item_code = 'TGK-7G' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 3000, updated_at = datetime('now')
 WHERE item_code = 'TGK-7G' AND COALESCE(base_price, 0) = 0;

-- UV-SHEET UV 시트 — 181라인 5곳 · 7900원/㎡ (Q1 6600~Q3 9300, 변동 0.34)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 7900, NULL FROM items
   WHERE item_code = 'UV-SHEET' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 7900, updated_at = datetime('now')
 WHERE item_code = 'UV-SHEET' AND COALESCE(base_price, 0) = 0;

-- ACC-011 실외배너 물통SET(복배너) — 136라인 22곳 · 15000원 (Q1 13000~Q3 17000, 변동 0.27)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 15000, NULL FROM items
   WHERE item_code = 'ACC-011' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 15000, updated_at = datetime('now')
 WHERE item_code = 'ACC-011' AND COALESCE(base_price, 0) = 0;

-- AQ2-090 수성 현수막원단 2코팅 — 128라인 16곳 · 540원 (Q1 490~Q3 610, 변동 0.22)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 540, NULL FROM items
   WHERE item_code = 'AQ2-090' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 540, updated_at = datetime('now')
 WHERE item_code = 'AQ2-090' AND COALESCE(base_price, 0) = 0;

-- TRW-PO-S 전사 윈드배너 폰지 S형 — 125라인 13곳 · 5600원/㎡ (Q1 5000~Q3 6100, 변동 0.20)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 5600, NULL FROM items
   WHERE item_code = 'TRW-PO-S' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 5600, updated_at = datetime('now')
 WHERE item_code = 'TRW-PO-S' AND COALESCE(base_price, 0) = 0;

-- SV-MESH 솔벤 매쉬 — 115라인 17곳 · 7800원/㎡ (Q1 6700~Q3 10000, 변동 0.42)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 7800, NULL FROM items
   WHERE item_code = 'SV-MESH' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 7800, updated_at = datetime('now')
 WHERE item_code = 'SV-MESH' AND COALESCE(base_price, 0) = 0;

-- AQ2-070 수성 현수막원단 2코팅 — 110라인 10곳 · 470원 (Q1 470~Q3 540, 변동 0.15)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 470, NULL FROM items
   WHERE item_code = 'AQ2-070' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 470, updated_at = datetime('now')
 WHERE item_code = 'AQ2-070' AND COALESCE(base_price, 0) = 0;

-- TGK-8 태극기 8호 — 106라인 18곳 · 1500원 (Q1 1000~Q3 1500, 변동 0.33)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 1500, NULL FROM items
   WHERE item_code = 'TGK-8' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 1500, updated_at = datetime('now')
 WHERE item_code = 'TGK-8' AND COALESCE(base_price, 0) = 0;

-- PAT-127 패트배너 30M 호홍 — 103라인 5곳 · 53000원 (Q1 48000~Q3 60000, 변동 0.23)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 53000, NULL FROM items
   WHERE item_code = 'PAT-127' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 53000, updated_at = datetime('now')
 WHERE item_code = 'PAT-127' AND COALESCE(base_price, 0) = 0;

-- AQ-INB 수성 실내배너 — 90라인 25곳 · 5600원/㎡ (Q1 3900~Q3 6700, 변동 0.50)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 5600, NULL FROM items
   WHERE item_code = 'AQ-INB' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 5600, updated_at = datetime('now')
 WHERE item_code = 'AQ-INB' AND COALESCE(base_price, 0) = 0;

-- TRB-PO-150 전사 가로등배너 폰지 60×150 — 89라인 28곳 · 5000원 (Q1 4000~Q3 5000, 변동 0.20)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 5000, NULL FROM items
   WHERE item_code = 'TRB-PO-150' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 5000, updated_at = datetime('now')
 WHERE item_code = 'TRB-PO-150' AND COALESCE(base_price, 0) = 0;

-- TRWK-ME-S 전사 워킹배너 매쉬 S형 — 86라인 1곳 · 6900원/㎡ (Q1 6200~Q3 8200, 변동 0.29)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 6900, NULL FROM items
   WHERE item_code = 'TRWK-ME-S' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 6900, updated_at = datetime('now')
 WHERE item_code = 'TRWK-ME-S' AND COALESCE(base_price, 0) = 0;

-- UV-FLEXN UV 비조명후렉스 — 82라인 10곳 · 10000원/㎡ (Q1 9400~Q3 10000, 변동 0.06)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 10000, NULL FROM items
   WHERE item_code = 'UV-FLEXN' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 10000, updated_at = datetime('now')
 WHERE item_code = 'UV-FLEXN' AND COALESCE(base_price, 0) = 0;

-- ACC-012 배너대 — 78라인 8곳 · 4000원 (Q1 3000~Q3 4500, 변동 0.38)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 4000, NULL FROM items
   WHERE item_code = 'ACC-012' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 4000, updated_at = datetime('now')
 WHERE item_code = 'ACC-012' AND COALESCE(base_price, 0) = 0;

-- UV-CLEAR UV 클리어필름 — 73라인 3곳 · 14500원/㎡ (Q1 10000~Q3 17000, 변동 0.48)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 14500, NULL FROM items
   WHERE item_code = 'UV-CLEAR' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 14500, updated_at = datetime('now')
 WHERE item_code = 'UV-CLEAR' AND COALESCE(base_price, 0) = 0;

-- SV-WRAP 솔벤 랩핑시트 — 72라인 3곳 · 14300원/㎡ (Q1 12400~Q3 16000, 변동 0.25)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 14300, NULL FROM items
   WHERE item_code = 'SV-WRAP' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 14300, updated_at = datetime('now')
 WHERE item_code = 'SV-WRAP' AND COALESCE(base_price, 0) = 0;

-- TRW-ME-S 전사 윈드배너 매쉬 S형 — 72라인 4곳 · 5700원/㎡ (Q1 5000~Q3 6000, 변동 0.18)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 5700, NULL FROM items
   WHERE item_code = 'TRW-ME-S' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 5700, updated_at = datetime('now')
 WHERE item_code = 'TRW-ME-S' AND COALESCE(base_price, 0) = 0;

-- KEL-127 켈 30M 호홍 — 64라인 4곳 · 80000원 (Q1 67400~Q3 103000, 변동 0.45)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 80000, NULL FROM items
   WHERE item_code = 'KEL-127' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 80000, updated_at = datetime('now')
 WHERE item_code = 'KEL-127' AND COALESCE(base_price, 0) = 0;

-- MCP120-127 무광코팅지 120g-호홍 — 63라인 4곳 · 71000원 (Q1 67500~Q3 79000, 변동 0.16)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 71000, NULL FROM items
   WHERE item_code = 'MCP120-127' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 71000, updated_at = datetime('now')
 WHERE item_code = 'MCP120-127' AND COALESCE(base_price, 0) = 0;

-- AQ1-152 수성 현수막원단 1코팅 — 54라인 4곳 · 950원 (Q1 930~Q3 1090, 변동 0.17)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 950, NULL FROM items
   WHERE item_code = 'AQ1-152' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 950, updated_at = datetime('now')
 WHERE item_code = 'AQ1-152' AND COALESCE(base_price, 0) = 0;

-- TRGI-PO 전사 자이언트배너 폰지 — 53라인 5곳 · 6900원/㎡ (Q1 5400~Q3 6900, 변동 0.22)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 6900, NULL FROM items
   WHERE item_code = 'TRGI-PO' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 6900, updated_at = datetime('now')
 WHERE item_code = 'TRGI-PO' AND COALESCE(base_price, 0) = 0;

-- AQ2-180 수성 현수막원단 2코팅 — 53라인 5곳 · 1120원 (Q1 1000~Q3 1175, 변동 0.16)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 1120, NULL FROM items
   WHERE item_code = 'AQ2-180' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 1120, updated_at = datetime('now')
 WHERE item_code = 'AQ2-180' AND COALESCE(base_price, 0) = 0;

-- AQ2-152 수성 현수막원단 2코팅 — 51라인 6곳 · 1090원 (Q1 1000~Q3 1200, 변동 0.18)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 1090, NULL FROM items
   WHERE item_code = 'AQ2-152' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 1090, updated_at = datetime('now')
 WHERE item_code = 'AQ2-152' AND COALESCE(base_price, 0) = 0;

-- TGK-7-1G 태극기 7호-1 게양용 — 51라인 16곳 · 2700원 (Q1 2500~Q3 3000, 변동 0.19)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 2700, NULL FROM items
   WHERE item_code = 'TGK-7-1G' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 2700, updated_at = datetime('now')
 WHERE item_code = 'TGK-7-1G' AND COALESCE(base_price, 0) = 0;

-- SMG-7G 새마을기 7호 게양용 — 50라인 14곳 · 3500원 (Q1 3000~Q3 4000, 변동 0.29)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 3500, NULL FROM items
   WHERE item_code = 'SMG-7G' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 3500, updated_at = datetime('now')
 WHERE item_code = 'SMG-7G' AND COALESCE(base_price, 0) = 0;

-- TRB-PO-160 전사 가로등배너 폰지 60×160 — 50라인 18곳 · 5000원 (Q1 5000~Q3 5000, 변동 0.00)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 5000, NULL FROM items
   WHERE item_code = 'TRB-PO-160' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 5000, updated_at = datetime('now')
 WHERE item_code = 'TRB-PO-160' AND COALESCE(base_price, 0) = 0;

-- ACC-031 차량/자전거 깃대 — 48라인 7곳 · 1300원 (Q1 1000~Q3 1500, 변동 0.38)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 1300, NULL FROM items
   WHERE item_code = 'ACC-031' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 1300, updated_at = datetime('now')
 WHERE item_code = 'ACC-031' AND COALESCE(base_price, 0) = 0;

-- AQ2-120 수성 현수막원단 2코팅 — 48라인 11곳 · 850원 (Q1 770~Q3 1040, 변동 0.32)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 850, NULL FROM items
   WHERE item_code = 'AQ2-120' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 850, updated_at = datetime('now')
 WHERE item_code = 'AQ2-120' AND COALESCE(base_price, 0) = 0;

-- RM-I0001 수성잉크 잉크테크 C — 47라인 5곳 · 12000원 (Q1 9800~Q3 15000, 변동 0.43)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 12000, NULL FROM items
   WHERE item_code = 'RM-I0001' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 12000, updated_at = datetime('now')
 WHERE item_code = 'RM-I0001' AND COALESCE(base_price, 0) = 0;

-- AQD-090 수성 현수막원단 저밀도 — 46라인 4곳 · 400원 (Q1 340~Q3 400, 변동 0.15)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 400, NULL FROM items
   WHERE item_code = 'AQD-090' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 400, updated_at = datetime('now')
 WHERE item_code = 'AQD-090' AND COALESCE(base_price, 0) = 0;

-- AQ-TENT 수성 텐트천 — 45라인 3곳 · 7500원/㎡ (Q1 7400~Q3 7600, 변동 0.03)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 7500, NULL FROM items
   WHERE item_code = 'AQ-TENT' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 7500, updated_at = datetime('now')
 WHERE item_code = 'AQ-TENT' AND COALESCE(base_price, 0) = 0;

-- AQ2-060 수성 현수막원단 2코팅 — 45라인 7곳 · 410원 (Q1 400~Q3 460, 변동 0.15)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 410, NULL FROM items
   WHERE item_code = 'AQ2-060' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 410, updated_at = datetime('now')
 WHERE item_code = 'AQ2-060' AND COALESCE(base_price, 0) = 0;

-- AQ-KEL 수성 켈 — 44라인 3곳 · 10000원/㎡ (Q1 8000~Q3 12100, 변동 0.41)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 10000, NULL FROM items
   WHERE item_code = 'AQ-KEL' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 10000, updated_at = datetime('now')
 WHERE item_code = 'AQ-KEL' AND COALESCE(base_price, 0) = 0;

-- RM-I0002 수성잉크 잉크테크 M — 44라인 4곳 · 12000원 (Q1 9800~Q3 15000, 변동 0.43)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 12000, NULL FROM items
   WHERE item_code = 'RM-I0002' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 12000, updated_at = datetime('now')
 WHERE item_code = 'RM-I0002' AND COALESCE(base_price, 0) = 0;

-- SV-FLEXL 솔벤 조명후렉스 — 42라인 2곳 · 8400원/㎡ (Q1 7400~Q3 8600, 변동 0.14)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 8400, NULL FROM items
   WHERE item_code = 'SV-FLEXL' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 8400, updated_at = datetime('now')
 WHERE item_code = 'SV-FLEXL' AND COALESCE(base_price, 0) = 0;

-- UV-JJN-12T UV 자작나무 12t — 40라인 1곳 · 21000원/㎡ (Q1 21000~Q3 21000, 변동 0.00)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 21000, NULL FROM items
   WHERE item_code = 'UV-JJN-12T' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 21000, updated_at = datetime('now')
 WHERE item_code = 'UV-JJN-12T' AND COALESCE(base_price, 0) = 0;

-- MJG-7G 무재해기 7호 게양용 — 40라인 12곳 · 3500원 (Q1 2600~Q3 4000, 변동 0.40)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 3500, NULL FROM items
   WHERE item_code = 'MJG-7G' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 3500, updated_at = datetime('now')
 WHERE item_code = 'MJG-7G' AND COALESCE(base_price, 0) = 0;

-- TGK-5 태극기 5호 — 40라인 8곳 · 6000원 (Q1 5500~Q3 7500, 변동 0.33)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 6000, NULL FROM items
   WHERE item_code = 'TGK-5' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 6000, updated_at = datetime('now')
 WHERE item_code = 'TGK-5' AND COALESCE(base_price, 0) = 0;

-- GDS-FBSET 가정용 국기함세트 — 38라인 8곳 · 5000원 (Q1 4000~Q3 6000, 변동 0.40)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 5000, NULL FROM items
   WHERE item_code = 'GDS-FBSET' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 5000, updated_at = datetime('now')
 WHERE item_code = 'GDS-FBSET' AND COALESCE(base_price, 0) = 0;

-- AQ2-080 수성 현수막원단 2코팅 — 37라인 7곳 · 520원 (Q1 450~Q3 600, 변동 0.29)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 520, NULL FROM items
   WHERE item_code = 'AQ2-080' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 520, updated_at = datetime('now')
 WHERE item_code = 'AQ2-080' AND COALESCE(base_price, 0) = 0;

-- JG-BONYEOM-S135X90 정기 본염 깃발 135×90 — 37라인 2곳 · 160000원 (Q1 87719~Q3 170000, 변동 0.51)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 160000, NULL FROM items
   WHERE item_code = 'JG-BONYEOM-S135X90' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 160000, updated_at = datetime('now')
 WHERE item_code = 'JG-BONYEOM-S135X90' AND COALESCE(base_price, 0) = 0;

-- RM-I0003 수성잉크 잉크테크 Y — 37라인 4곳 · 12000원 (Q1 9700~Q3 15000, 변동 0.44)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 12000, NULL FROM items
   WHERE item_code = 'RM-I0003' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 12000, updated_at = datetime('now')
 WHERE item_code = 'RM-I0003' AND COALESCE(base_price, 0) = 0;

-- TGK-7-1 태극기 7호-1 — 37라인 9곳 · 2200원 (Q1 1900~Q3 2500, 변동 0.27)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 2200, NULL FROM items
   WHERE item_code = 'TGK-7-1' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 2200, updated_at = datetime('now')
 WHERE item_code = 'TGK-7-1' AND COALESCE(base_price, 0) = 0;

-- SIGN-FRL-R 조명 프레임간판(원단 교체) — 36라인 3곳 · 210000원 (Q1 162000~Q3 246000, 변동 0.40)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 210000, NULL FROM items
   WHERE item_code = 'SIGN-FRL-R' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 210000, updated_at = datetime('now')
 WHERE item_code = 'SIGN-FRL-R' AND COALESCE(base_price, 0) = 0;

-- TGK-6 태극기 6호 — 36라인 7곳 · 3600원 (Q1 3000~Q3 4000, 변동 0.28)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 3600, NULL FROM items
   WHERE item_code = 'TGK-6' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 3600, updated_at = datetime('now')
 WHERE item_code = 'TGK-6' AND COALESCE(base_price, 0) = 0;

-- TGK-SGSET-30-L50 태극기 수기대조립 SET 30×20 수기대 50cm — 36라인 5곳 · 800원 (Q1 800~Q3 1000, 변동 0.25)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 800, NULL FROM items
   WHERE item_code = 'TGK-SGSET-30-L50' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 800, updated_at = datetime('now')
 WHERE item_code = 'TGK-SGSET-30-L50' AND COALESCE(base_price, 0) = 0;

-- ACC-046 인치밴드 — 35라인 5곳 · 1100원 (Q1 1000~Q3 1300, 변동 0.27)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 1100, NULL FROM items
   WHERE item_code = 'ACC-046' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 1100, updated_at = datetime('now')
 WHERE item_code = 'ACC-046' AND COALESCE(base_price, 0) = 0;

-- GDS-DESK 탁상용 국기 — 35라인 12곳 · 10000원 (Q1 10000~Q3 10000, 변동 0.00)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 10000, NULL FROM items
   WHERE item_code = 'GDS-DESK' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 10000, updated_at = datetime('now')
 WHERE item_code = 'GDS-DESK' AND COALESCE(base_price, 0) = 0;

-- TGK-4 태극기 4호 — 34라인 7곳 · 8000원 (Q1 7500~Q3 9000, 변동 0.19)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 8000, NULL FROM items
   WHERE item_code = 'TGK-4' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 8000, updated_at = datetime('now')
 WHERE item_code = 'TGK-4' AND COALESCE(base_price, 0) = 0;

-- UV-EMBO UV 엠보시트 — 32라인 3곳 · 9600원/㎡ (Q1 7900~Q3 11400, 변동 0.36)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 9600, NULL FROM items
   WHERE item_code = 'UV-EMBO' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 9600, updated_at = datetime('now')
 WHERE item_code = 'UV-EMBO' AND COALESCE(base_price, 0) = 0;

-- TRTB 전사 태극기배너 — 31라인 4곳 · 2200원/㎡ (Q1 1700~Q3 2800, 변동 0.50)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 2200, NULL FROM items
   WHERE item_code = 'TRTB' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 2200, updated_at = datetime('now')
 WHERE item_code = 'TRTB' AND COALESCE(base_price, 0) = 0;

-- PAT-060 패트배너 30M 호홍 — 30라인 3곳 · 27500원 (Q1 25500~Q3 30000, 변동 0.16)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 27500, NULL FROM items
   WHERE item_code = 'PAT-060' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 27500, updated_at = datetime('now')
 WHERE item_code = 'PAT-060' AND COALESCE(base_price, 0) = 0;

-- AQ2-050 수성 현수막원단 2코팅 — 29라인 5곳 · 350원 (Q1 320~Q3 400, 변동 0.23)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 350, NULL FROM items
   WHERE item_code = 'AQ2-050' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 350, updated_at = datetime('now')
 WHERE item_code = 'AQ2-050' AND COALESCE(base_price, 0) = 0;

-- SV-TENT 솔벤 텐트천 — 28라인 4곳 · 13900원/㎡ (Q1 12000~Q3 14600, 변동 0.19)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 13900, NULL FROM items
   WHERE item_code = 'SV-TENT' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 13900, updated_at = datetime('now')
 WHERE item_code = 'SV-TENT' AND COALESCE(base_price, 0) = 0;

-- ACC-037-4MM 볼로프 4mm — 28라인 4곳 · 60000원 (Q1 52000~Q3 68000, 변동 0.27)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 60000, NULL FROM items
   WHERE item_code = 'ACC-037-4MM' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 60000, updated_at = datetime('now')
 WHERE item_code = 'ACC-037-4MM' AND COALESCE(base_price, 0) = 0;

-- ACC-040 아연날개 — 27라인 8곳 · 600원 (Q1 600~Q3 800, 변동 0.33)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 600, NULL FROM items
   WHERE item_code = 'ACC-040' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 600, updated_at = datetime('now')
 WHERE item_code = 'ACC-040' AND COALESCE(base_price, 0) = 0;

-- TGK-9 태극기 9호 — 27라인 5곳 · 1200원 (Q1 800~Q3 1500, 변동 0.58)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 1200, NULL FROM items
   WHERE item_code = 'TGK-9' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 1200, updated_at = datetime('now')
 WHERE item_code = 'TGK-9' AND COALESCE(base_price, 0) = 0;

-- GDS-LRF-S30X45 좌우보필형 액자 30×45 — 26라인 4곳 · 18000원 (Q1 15000~Q3 18000, 변동 0.17)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 18000, NULL FROM items
   WHERE item_code = 'GDS-LRF-S30X45' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 18000, updated_at = datetime('now')
 WHERE item_code = 'GDS-LRF-S30X45' AND COALESCE(base_price, 0) = 0;

-- RM-I0004 수성잉크 잉크테크 K — 25라인 4곳 · 12000원 (Q1 9900~Q3 15000, 변동 0.42)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 12000, NULL FROM items
   WHERE item_code = 'RM-I0004' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 12000, updated_at = datetime('now')
 WHERE item_code = 'RM-I0004' AND COALESCE(base_price, 0) = 0;

-- SGM-LED3-KPL LED 3구 KPL — 25라인 4곳 · 600원 (Q1 400~Q3 600, 변동 0.33)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 600, NULL FROM items
   WHERE item_code = 'SGM-LED3-KPL' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 600, updated_at = datetime('now')
 WHERE item_code = 'SGM-LED3-KPL' AND COALESCE(base_price, 0) = 0;

-- TGK-GDSET-7-1-R150-3 태극기 깃대조립 SET 7호-1 R150 3구 — 25라인 3곳 · 5000원 (Q1 4400~Q3 5700, 변동 0.26)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 5000, NULL FROM items
   WHERE item_code = 'TGK-GDSET-7-1-R150-3' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 5000, updated_at = datetime('now')
 WHERE item_code = 'TGK-GDSET-7-1-R150-3' AND COALESCE(base_price, 0) = 0;

-- AQ-SASH 수성 어깨띠 — 24라인 3곳 · 1800원/㎡ (Q1 1700~Q3 2500, 변동 0.44)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 1800, NULL FROM items
   WHERE item_code = 'AQ-SASH' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 1800, updated_at = datetime('now')
 WHERE item_code = 'AQ-SASH' AND COALESCE(base_price, 0) = 0;

-- TGK-3 태극기 3호 — 24라인 6곳 · 20000원 (Q1 18000~Q3 24000, 변동 0.30)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 20000, NULL FROM items
   WHERE item_code = 'TGK-3' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 20000, updated_at = datetime('now')
 WHERE item_code = 'TGK-3' AND COALESCE(base_price, 0) = 0;

-- GDS-TIMER 전자 타이머 — 23라인 10곳 · 40000원 (Q1 40000~Q3 45000, 변동 0.13)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 40000, NULL FROM items
   WHERE item_code = 'GDS-TIMER' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 40000, updated_at = datetime('now')
 WHERE item_code = 'GDS-TIMER' AND COALESCE(base_price, 0) = 0;

-- SMG-7-1 새마을기 7호-1 — 23라인 4곳 · 2700원 (Q1 2700~Q3 3300, 변동 0.22)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 2700, NULL FROM items
   WHERE item_code = 'SMG-7-1' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 2700, updated_at = datetime('now')
 WHERE item_code = 'SMG-7-1' AND COALESCE(base_price, 0) = 0;

-- AQ2-127 수성 현수막원단 2코팅 — 22라인 4곳 · 870원 (Q1 830~Q3 930, 변동 0.11)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 870, NULL FROM items
   WHERE item_code = 'AQ2-127' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 870, updated_at = datetime('now')
 WHERE item_code = 'AQ2-127' AND COALESCE(base_price, 0) = 0;

-- SMG-8 새마을기 8호 — 22라인 5곳 · 2000원 (Q1 1800~Q3 2400, 변동 0.30)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 2000, NULL FROM items
   WHERE item_code = 'SMG-8' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 2000, updated_at = datetime('now')
 WHERE item_code = 'SMG-8' AND COALESCE(base_price, 0) = 0;

-- TGK-2 태극기 2호 — 22라인 3곳 · 26000원 (Q1 22000~Q3 30000, 변동 0.31)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 26000, NULL FROM items
   WHERE item_code = 'TGK-2' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 26000, updated_at = datetime('now')
 WHERE item_code = 'TGK-2' AND COALESCE(base_price, 0) = 0;

-- TGK-4-1 태극기 4호-1 — 22라인 5곳 · 8000원 (Q1 7000~Q3 8500, 변동 0.19)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 8000, NULL FROM items
   WHERE item_code = 'TGK-4-1' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 8000, updated_at = datetime('now')
 WHERE item_code = 'TGK-4-1' AND COALESCE(base_price, 0) = 0;

-- MCP120-060 무광코팅지 120g-호홍 — 21라인 3곳 · 39000원 (Q1 34000~Q3 42000, 변동 0.21)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 39000, NULL FROM items
   WHERE item_code = 'MCP120-060' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 39000, updated_at = datetime('now')
 WHERE item_code = 'MCP120-060' AND COALESCE(base_price, 0) = 0;

-- TRE-ME 전사 어구실명제 — 20라인 1곳 · 3500원/㎡ (Q1 3000~Q3 3500, 변동 0.14)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 3500, NULL FROM items
   WHERE item_code = 'TRE-ME' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 3500, updated_at = datetime('now')
 WHERE item_code = 'TRE-ME' AND COALESCE(base_price, 0) = 0;

-- UV-FMX-8T-W UV 포맥스 8T 백색 — 20라인 2곳 · 23000원/㎡ (Q1 23000~Q3 30000, 변동 0.30)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 23000, NULL FROM items
   WHERE item_code = 'UV-FMX-8T-W' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 23000, updated_at = datetime('now')
 WHERE item_code = 'UV-FMX-8T-W' AND COALESCE(base_price, 0) = 0;

-- ACC-045-24-S 아일렛 24호 은 — 20라인 4곳 · 17000원 (Q1 14100~Q3 20000, 변동 0.35)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 17000, NULL FROM items
   WHERE item_code = 'ACC-045-24-S' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 17000, updated_at = datetime('now')
 WHERE item_code = 'ACC-045-24-S' AND COALESCE(base_price, 0) = 0;

-- SYN-127 합성지 30M 호홍 — 20라인 2곳 · 55000원 (Q1 49000~Q3 59800, 변동 0.20)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 55000, NULL FROM items
   WHERE item_code = 'SYN-127' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 55000, updated_at = datetime('now')
 WHERE item_code = 'SYN-127' AND COALESCE(base_price, 0) = 0;

-- TGK-1 태극기 1호 — 20라인 5곳 · 80000원 (Q1 65000~Q3 93000, 변동 0.35)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 80000, NULL FROM items
   WHERE item_code = 'TGK-1' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 80000, updated_at = datetime('now')
 WHERE item_code = 'TGK-1' AND COALESCE(base_price, 0) = 0;

-- ACC-029-1000 까치발 1000mm — 19라인 9곳 · 7000원 (Q1 6000~Q3 7000, 변동 0.14)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 7000, NULL FROM items
   WHERE item_code = 'ACC-029-1000' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 7000, updated_at = datetime('now')
 WHERE item_code = 'ACC-029-1000' AND COALESCE(base_price, 0) = 0;

-- KEL-090 켈 30M 호홍 — 19라인 2곳 · 65800원 (Q1 53000~Q3 75000, 변동 0.33)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 65800, NULL FROM items
   WHERE item_code = 'KEL-090' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 65800, updated_at = datetime('now')
 WHERE item_code = 'KEL-090' AND COALESCE(base_price, 0) = 0;

-- UV-FLEXD UV 양면배너후렉스 — 17라인 2곳 · 27800원/㎡ (Q1 16700~Q3 32800, 변동 0.58)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 27800, NULL FROM items
   WHERE item_code = 'UV-FLEXD' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 27800, updated_at = datetime('now')
 WHERE item_code = 'UV-FLEXD' AND COALESCE(base_price, 0) = 0;

-- ACC-029-200 까치발 200mm — 17라인 8곳 · 4000원 (Q1 4000~Q3 5000, 변동 0.25)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 4000, NULL FROM items
   WHERE item_code = 'ACC-029-200' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 4000, updated_at = datetime('now')
 WHERE item_code = 'ACC-029-200' AND COALESCE(base_price, 0) = 0;

-- ACC-033 R단 깃대 — 17라인 6곳 · 4000원 (Q1 4000~Q3 5000, 변동 0.25)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 4000, NULL FROM items
   WHERE item_code = 'ACC-033' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 4000, updated_at = datetime('now')
 WHERE item_code = 'ACC-033' AND COALESCE(base_price, 0) = 0;

-- TGK-GDSET-7-R150-3 태극기 깃대조립 SET 7호 R150 3구 — 17라인 2곳 · 4900원 (Q1 4800~Q3 5700, 변동 0.18)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 4900, NULL FROM items
   WHERE item_code = 'TGK-GDSET-7-R150-3' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 4900, updated_at = datetime('now')
 WHERE item_code = 'TGK-GDSET-7-R150-3' AND COALESCE(base_price, 0) = 0;

-- TRW-PO-F 전사 윈드배너 폰지 F형 — 16라인 5곳 · 5400원/㎡ (Q1 5100~Q3 5700, 변동 0.11)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 5400, NULL FROM items
   WHERE item_code = 'TRW-PO-F' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 5400, updated_at = datetime('now')
 WHERE item_code = 'TRW-PO-F' AND COALESCE(base_price, 0) = 0;

-- ACC-014 가로등배너 회전고리 — 16라인 2곳 · 70원 (Q1 60~Q3 80, 변동 0.29)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 70, NULL FROM items
   WHERE item_code = 'ACC-014' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 70, updated_at = datetime('now')
 WHERE item_code = 'ACC-014' AND COALESCE(base_price, 0) = 0;

-- ACC-029-1200 까치발 1200mm — 16라인 6곳 · 7000원 (Q1 7000~Q3 8000, 변동 0.14)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 7000, NULL FROM items
   WHERE item_code = 'ACC-029-1200' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 7000, updated_at = datetime('now')
 WHERE item_code = 'ACC-029-1200' AND COALESCE(base_price, 0) = 0;

-- ACC-029-900 까치발 900mm — 16라인 7곳 · 6000원 (Q1 6000~Q3 7000, 변동 0.17)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 6000, NULL FROM items
   WHERE item_code = 'ACC-029-900' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 6000, updated_at = datetime('now')
 WHERE item_code = 'ACC-029-900' AND COALESCE(base_price, 0) = 0;

-- GDS-JIGWANSET 태극기 가정용(지관)세트 — 16라인 5곳 · 9000원 (Q1 7500~Q3 9000, 변동 0.17)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 9000, NULL FROM items
   WHERE item_code = 'GDS-JIGWANSET' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 9000, updated_at = datetime('now')
 WHERE item_code = 'GDS-JIGWANSET' AND COALESCE(base_price, 0) = 0;

-- ACC-029-300 까치발 300mm — 15라인 6곳 · 4000원 (Q1 4000~Q3 5000, 변동 0.25)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 4000, NULL FROM items
   WHERE item_code = 'ACC-029-300' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 4000, updated_at = datetime('now')
 WHERE item_code = 'ACC-029-300' AND COALESCE(base_price, 0) = 0;

-- PAT-152 패트배너 30M 호홍 — 15라인 1곳 · 82500원 (Q1 61000~Q3 82500, 변동 0.26)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 82500, NULL FROM items
   WHERE item_code = 'PAT-152' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 82500, updated_at = datetime('now')
 WHERE item_code = 'PAT-152' AND COALESCE(base_price, 0) = 0;

-- AQ-BKLT 수성 백릿 — 14라인 2곳 · 16000원/㎡ (Q1 15000~Q3 18200, 변동 0.20)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 16000, NULL FROM items
   WHERE item_code = 'AQ-BKLT' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 16000, updated_at = datetime('now')
 WHERE item_code = 'AQ-BKLT' AND COALESCE(base_price, 0) = 0;

-- TRW-ME-F 전사 윈드배너 매쉬 F형 — 14라인 2곳 · 5700원/㎡ (Q1 5300~Q3 7200, 변동 0.33)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 5700, NULL FROM items
   WHERE item_code = 'TRW-ME-F' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 5700, updated_at = datetime('now')
 WHERE item_code = 'TRW-ME-F' AND COALESCE(base_price, 0) = 0;

-- TGK-7 태극기 7호 — 14라인 3곳 · 2000원 (Q1 2000~Q3 2500, 변동 0.25)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 2000, NULL FROM items
   WHERE item_code = 'TGK-7' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 2000, updated_at = datetime('now')
 WHERE item_code = 'TGK-7' AND COALESCE(base_price, 0) = 0;

-- ACC-035-P-1 깃대 꽂이 P형 1구 — 13라인 1곳 · 400원 (Q1 300~Q3 400, 변동 0.25)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 400, NULL FROM items
   WHERE item_code = 'ACC-035-P-1' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 400, updated_at = datetime('now')
 WHERE item_code = 'ACC-035-P-1' AND COALESCE(base_price, 0) = 0;

-- ACC-049-SQ 족자봉 사각 85~150cm — 13라인 1곳 · 4500원 (Q1 4500~Q3 5400, 변동 0.20)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 4500, NULL FROM items
   WHERE item_code = 'ACC-049-SQ' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 4500, updated_at = datetime('now')
 WHERE item_code = 'ACC-049-SQ' AND COALESCE(base_price, 0) = 0;

-- ACC-029-1400 까치발 1400mm — 12라인 5곳 · 9000원 (Q1 8000~Q3 9000, 변동 0.11)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 9000, NULL FROM items
   WHERE item_code = 'ACC-029-1400' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 9000, updated_at = datetime('now')
 WHERE item_code = 'ACC-029-1400' AND COALESCE(base_price, 0) = 0;

-- ACC-047-OT 큐방 원터치 40파이 — 12라인 3곳 · 17000원 (Q1 17000~Q3 18000, 변동 0.06)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 17000, NULL FROM items
   WHERE item_code = 'ACC-047-OT' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 17000, updated_at = datetime('now')
 WHERE item_code = 'ACC-047-OT' AND COALESCE(base_price, 0) = 0;

-- MGG-8 만국기 8호 — 12라인 3곳 · 2400원 (Q1 2000~Q3 3000, 변동 0.42)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 2400, NULL FROM items
   WHERE item_code = 'MGG-8' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 2400, updated_at = datetime('now')
 WHERE item_code = 'MGG-8' AND COALESCE(base_price, 0) = 0;

-- UV-BANNER UV 현수막 — 11라인 1곳 · 8200원/㎡ (Q1 7800~Q3 9700, 변동 0.23)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 8200, NULL FROM items
   WHERE item_code = 'UV-BANNER' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 8200, updated_at = datetime('now')
 WHERE item_code = 'UV-BANNER' AND COALESCE(base_price, 0) = 0;

-- GDS-JASUSET-S120X80 자수깃발 세트(삼발이) 120×80 — 11라인 1곳 · 220000원 (Q1 220000~Q3 220000, 변동 0.00)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 220000, NULL FROM items
   WHERE item_code = 'GDS-JASUSET-S120X80' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 220000, updated_at = datetime('now')
 WHERE item_code = 'GDS-JASUSET-S120X80' AND COALESCE(base_price, 0) = 0;

-- KELG-127 켈그레이 30M 호홍 — 11라인 1곳 · 76000원 (Q1 69000~Q3 85000, 변동 0.21)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 76000, NULL FROM items
   WHERE item_code = 'KELG-127' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 76000, updated_at = datetime('now')
 WHERE item_code = 'KELG-127' AND COALESCE(base_price, 0) = 0;

-- TGK-SGSET-45-L50 태극기 수기대조립 SET 45×30 수기대 50cm — 11라인 1곳 · 1300원 (Q1 1200~Q3 1500, 변동 0.23)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 1300, NULL FROM items
   WHERE item_code = 'TGK-SGSET-45-L50' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 1300, updated_at = datetime('now')
 WHERE item_code = 'TGK-SGSET-45-L50' AND COALESCE(base_price, 0) = 0;

-- ACC-030-R130-2 가로기 깃대(조립) R130 2구 — 10라인 5곳 · 3000원 (Q1 2500~Q3 3000, 변동 0.17)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 3000, NULL FROM items
   WHERE item_code = 'ACC-030-R130-2' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 3000, updated_at = datetime('now')
 WHERE item_code = 'ACC-030-R130-2' AND COALESCE(base_price, 0) = 0;

-- ACC-043 대대기 — 10라인 2곳 · 13000원 (Q1 13000~Q3 13000, 변동 0.00)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 13000, NULL FROM items
   WHERE item_code = 'ACC-043' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 13000, updated_at = datetime('now')
 WHERE item_code = 'ACC-043' AND COALESCE(base_price, 0) = 0;

-- MCP180-127 무광코팅지 180g-호홍 — 10라인 1곳 · 78000원 (Q1 67500~Q3 78000, 변동 0.13)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 78000, NULL FROM items
   WHERE item_code = 'MCP180-127' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 78000, updated_at = datetime('now')
 WHERE item_code = 'MCP180-127' AND COALESCE(base_price, 0) = 0;

-- PONGE-130 폰지 — 10라인 1곳 · 1250원 (Q1 1100~Q3 1250, 변동 0.12)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 1250, NULL FROM items
   WHERE item_code = 'PONGE-130' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 1250, updated_at = datetime('now')
 WHERE item_code = 'PONGE-130' AND COALESCE(base_price, 0) = 0;

-- SGM-LED3-JPL LED 3구 JPL — 10라인 2곳 · 450원 (Q1 450~Q3 530, 변동 0.18)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 450, NULL FROM items
   WHERE item_code = 'SGM-LED3-JPL' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 450, updated_at = datetime('now')
 WHERE item_code = 'SGM-LED3-JPL' AND COALESCE(base_price, 0) = 0;

-- TGK-8-1 태극기 8호-1 — 10라인 3곳 · 2000원 (Q1 1800~Q3 2000, 변동 0.10)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 2000, NULL FROM items
   WHERE item_code = 'TGK-8-1' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 2000, updated_at = datetime('now')
 WHERE item_code = 'TGK-8-1' AND COALESCE(base_price, 0) = 0;

-- ACC-026 실외 철제배너 거치대(TSO) — 9라인 2곳 · 60000원 (Q1 52000~Q3 60000, 변동 0.13)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 60000, NULL FROM items
   WHERE item_code = 'ACC-026' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 60000, updated_at = datetime('now')
 WHERE item_code = 'ACC-026' AND COALESCE(base_price, 0) = 0;

-- ACC-037-5MM 볼로프 5mm — 9라인 1곳 · 64000원 (Q1 54000~Q3 70000, 변동 0.25)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 64000, NULL FROM items
   WHERE item_code = 'ACC-037-5MM' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 64000, updated_at = datetime('now')
 WHERE item_code = 'ACC-037-5MM' AND COALESCE(base_price, 0) = 0;

-- FLEXN-090 비조명용 후렉스 — 9라인 1곳 · 123500원 (Q1 104500~Q3 142500, 변동 0.31)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 123500, NULL FROM items
   WHERE item_code = 'FLEXN-090' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 123500, updated_at = datetime('now')
 WHERE item_code = 'FLEXN-090' AND COALESCE(base_price, 0) = 0;

-- SVB-152 솔벤 현수막 — 9라인 2곳 · 1500원 (Q1 1400~Q3 1700, 변동 0.20)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 1500, NULL FROM items
   WHERE item_code = 'SVB-152' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 1500, updated_at = datetime('now')
 WHERE item_code = 'SVB-152' AND COALESCE(base_price, 0) = 0;

-- AQ-MNB 수성 미니배너 — 8라인 5곳 · 4000원/㎡ (Q1 4000~Q3 4000, 변동 0.00)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 4000, NULL FROM items
   WHERE item_code = 'AQ-MNB' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 4000, updated_at = datetime('now')
 WHERE item_code = 'AQ-MNB' AND COALESCE(base_price, 0) = 0;

-- JG-E4-P60 E4 엠보 무광(45m/200g) 60폭 — 8라인 1곳 · 109000원 (Q1 73000~Q3 111200, 변동 0.35)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 109000, NULL FROM items
   WHERE item_code = 'JG-E4-P60' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 109000, updated_at = datetime('now')
 WHERE item_code = 'JG-E4-P60' AND COALESCE(base_price, 0) = 0;

-- TAPE-2T 양면테이프 2T — 8라인 7곳 · 5000원 (Q1 5000~Q3 5000, 변동 0.00)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 5000, NULL FROM items
   WHERE item_code = 'TAPE-2T' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 5000, updated_at = datetime('now')
 WHERE item_code = 'TAPE-2T' AND COALESCE(base_price, 0) = 0;

-- TGK-JASUSET-S135X90 태극기 정기자수삼발이 SET 135×90 — 8라인 2곳 · 230000원 (Q1 200000~Q3 240000, 변동 0.17)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 230000, NULL FROM items
   WHERE item_code = 'TGK-JASUSET-S135X90' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 230000, updated_at = datetime('now')
 WHERE item_code = 'TGK-JASUSET-S135X90' AND COALESCE(base_price, 0) = 0;

-- UV-PRM-W UV 고휘도반사 백색 — 7라인 1곳 · 22700원/㎡ (Q1 16000~Q3 23400, 변동 0.33)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 22700, NULL FROM items
   WHERE item_code = 'UV-PRM-W' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 22700, updated_at = datetime('now')
 WHERE item_code = 'UV-PRM-W' AND COALESCE(base_price, 0) = 0;

-- ACC-015 삼발이받침대 — 7라인 4곳 · 22000원 (Q1 22000~Q3 30000, 변동 0.36)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 22000, NULL FROM items
   WHERE item_code = 'ACC-015' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 22000, updated_at = datetime('now')
 WHERE item_code = 'ACC-015' AND COALESCE(base_price, 0) = 0;

-- ACC-029-1500 까치발 1500mm — 7라인 4곳 · 8500원 (Q1 8500~Q3 9500, 변동 0.12)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 8500, NULL FROM items
   WHERE item_code = 'ACC-029-1500' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 8500, updated_at = datetime('now')
 WHERE item_code = 'ACC-029-1500' AND COALESCE(base_price, 0) = 0;

-- ACC-029-250 까치발 250mm — 7라인 4곳 · 4000원 (Q1 4000~Q3 5000, 변동 0.25)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 4000, NULL FROM items
   WHERE item_code = 'ACC-029-250' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 4000, updated_at = datetime('now')
 WHERE item_code = 'ACC-029-250' AND COALESCE(base_price, 0) = 0;

-- ACC-035-R-D 깃대 꽂이 R형 ㄷ자 — 7라인 3곳 · 800원 (Q1 800~Q3 800, 변동 0.00)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 800, NULL FROM items
   WHERE item_code = 'ACC-035-R-D' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 800, updated_at = datetime('now')
 WHERE item_code = 'ACC-035-R-D' AND COALESCE(base_price, 0) = 0;

-- ACC-035-S-2 깃대 꽂이 S형 2구 — 7라인 3곳 · 12000원 (Q1 10000~Q3 12000, 변동 0.17)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 12000, NULL FROM items
   WHERE item_code = 'ACC-035-S-2' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 12000, updated_at = datetime('now')
 WHERE item_code = 'ACC-035-S-2' AND COALESCE(base_price, 0) = 0;

-- GJG-JASU-S80X115 근조기 자수 깃발 80×115 — 7라인 2곳 · 213000원 (Q1 200000~Q3 290000, 변동 0.42)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 213000, NULL FROM items
   WHERE item_code = 'GJG-JASU-S80X115' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 213000, updated_at = datetime('now')
 WHERE item_code = 'GJG-JASU-S80X115' AND COALESCE(base_price, 0) = 0;

-- MJG-8 무재해기 8호 — 7라인 3곳 · 2000원 (Q1 1500~Q3 2400, 변동 0.45)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 2000, NULL FROM items
   WHERE item_code = 'MJG-8' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 2000, updated_at = datetime('now')
 WHERE item_code = 'MJG-8' AND COALESCE(base_price, 0) = 0;

-- TGK-SGSET-30-L40 태극기 수기대조립 SET 30×20 수기대 40cm — 7라인 2곳 · 800원 (Q1 700~Q3 1000, 변동 0.38)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 800, NULL FROM items
   WHERE item_code = 'TGK-SGSET-30-L40' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 800, updated_at = datetime('now')
 WHERE item_code = 'TGK-SGSET-30-L40' AND COALESCE(base_price, 0) = 0;

-- TGK-SPECIAL-S1200X800 대형태극기 1200×800 — 7라인 2곳 · 630000원 (Q1 630000~Q3 630000, 변동 0.00)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 630000, NULL FROM items
   WHERE item_code = 'TGK-SPECIAL-S1200X800' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 630000, updated_at = datetime('now')
 WHERE item_code = 'TGK-SPECIAL-S1200X800' AND COALESCE(base_price, 0) = 0;

-- ACC-029-1100 까치발 1100mm — 6라인 3곳 · 6500원 (Q1 6500~Q3 7500, 변동 0.15)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 6500, NULL FROM items
   WHERE item_code = 'ACC-029-1100' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 6500, updated_at = datetime('now')
 WHERE item_code = 'ACC-029-1100' AND COALESCE(base_price, 0) = 0;

-- ACC-035-S-1 깃대 꽂이 S형 1구 — 6라인 2곳 · 5000원 (Q1 5000~Q3 6000, 변동 0.20)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 5000, NULL FROM items
   WHERE item_code = 'ACC-035-S-1' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 5000, updated_at = datetime('now')
 WHERE item_code = 'ACC-035-S-1' AND COALESCE(base_price, 0) = 0;

-- ETC-DESIGN 시안비 — 6라인 3곳 · 15000원 (Q1 14000~Q3 15000, 변동 0.07)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 15000, NULL FROM items
   WHERE item_code = 'ETC-DESIGN' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 15000, updated_at = datetime('now')
 WHERE item_code = 'ETC-DESIGN' AND COALESCE(base_price, 0) = 0;

-- FMX-3T-W-48 포맥스 (브랜드 미상) — 6라인 1곳 · 14500원 (Q1 14500~Q3 17000, 변동 0.17)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 14500, NULL FROM items
   WHERE item_code = 'FMX-3T-W-48' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 14500, updated_at = datetime('now')
 WHERE item_code = 'FMX-3T-W-48' AND COALESCE(base_price, 0) = 0;

-- HJ-MGAUTOB-P127 무광코팅지 자동엠보 보급형(61m/120g) 127폭 — 6라인 2곳 · 90000원 (Q1 82000~Q3 90000, 변동 0.09)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 90000, NULL FROM items
   WHERE item_code = 'HJ-MGAUTOB-P127' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 90000, updated_at = datetime('now')
 WHERE item_code = 'HJ-MGAUTOB-P127' AND COALESCE(base_price, 0) = 0;

-- HJ-MGILBO-P60 무광코팅지 일반엠보(45m/180g) 60폭 — 6라인 1곳 · 83000원 (Q1 54000~Q3 94000, 변동 0.48)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 83000, NULL FROM items
   WHERE item_code = 'HJ-MGILBO-P60' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 83000, updated_at = datetime('now')
 WHERE item_code = 'HJ-MGILBO-P60' AND COALESCE(base_price, 0) = 0;

-- MCP120-090 무광코팅지 120g-호홍 — 6라인 1곳 · 50000원 (Q1 46000~Q3 55000, 변동 0.18)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 50000, NULL FROM items
   WHERE item_code = 'MCP120-090' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 50000, updated_at = datetime('now')
 WHERE item_code = 'MCP120-090' AND COALESCE(base_price, 0) = 0;

-- MCP120-152 무광코팅지 120g-호홍 — 6라인 1곳 · 79000원 (Q1 76000~Q3 79000, 변동 0.04)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 79000, NULL FROM items
   WHERE item_code = 'MCP120-152' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 79000, updated_at = datetime('now')
 WHERE item_code = 'MCP120-152' AND COALESCE(base_price, 0) = 0;

-- RM-I0006 수성잉크 잉크테크 Lm — 6라인 2곳 · 9900원 (Q1 9500~Q3 15000, 변동 0.56)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 9900, NULL FROM items
   WHERE item_code = 'RM-I0006' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 9900, updated_at = datetime('now')
 WHERE item_code = 'RM-I0006' AND COALESCE(base_price, 0) = 0;

-- SGM-LEDF-F30D LED형광등 30W양면돌출 — 6라인 3곳 · 5000원 (Q1 5000~Q3 6300, 변동 0.26)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 5000, NULL FROM items
   WHERE item_code = 'SGM-LEDF-F30D' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 5000, updated_at = datetime('now')
 WHERE item_code = 'SGM-LEDF-F30D' AND COALESCE(base_price, 0) = 0;

-- TGK-GDSET-8-R130-2 태극기 깃대조립 SET 8호 R130 2구 — 6라인 2곳 · 4000원 (Q1 4000~Q3 4500, 변동 0.13)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 4000, NULL FROM items
   WHERE item_code = 'TGK-GDSET-8-R130-2' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 4000, updated_at = datetime('now')
 WHERE item_code = 'TGK-GDSET-8-R130-2' AND COALESCE(base_price, 0) = 0;

-- TRFB 전사 외국기배너 — 5라인 1곳 · 3100원/㎡ (Q1 3100~Q3 3100, 변동 0.00)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 3100, NULL FROM items
   WHERE item_code = 'TRFB' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 3100, updated_at = datetime('now')
 WHERE item_code = 'TRFB' AND COALESCE(base_price, 0) = 0;

-- TRG-SA 전사 깃발 샤틴 — 5라인 2곳 · 10000원/㎡ (Q1 8300~Q3 10000, 변동 0.17)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 10000, NULL FROM items
   WHERE item_code = 'TRG-SA' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 10000, updated_at = datetime('now')
 WHERE item_code = 'TRG-SA' AND COALESCE(base_price, 0) = 0;

-- TRM-ME 전사 만장기 매쉬 — 5라인 1곳 · 8800원/㎡ (Q1 8800~Q3 11400, 변동 0.30)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 8800, NULL FROM items
   WHERE item_code = 'TRM-ME' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 8800, updated_at = datetime('now')
 WHERE item_code = 'TRM-ME' AND COALESCE(base_price, 0) = 0;

-- ACC-045-9-S 아일렛 9호 은 — 5라인 1곳 · 10000원 (Q1 7350~Q3 12000, 변동 0.47)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 10000, NULL FROM items
   WHERE item_code = 'ACC-045-9-S' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 10000, updated_at = datetime('now')
 WHERE item_code = 'ACC-045-9-S' AND COALESCE(base_price, 0) = 0;

-- ACC-BN-STR 실내배너 일자형(W) — 5라인 2곳 · 7500원 (Q1 7000~Q3 10000, 변동 0.40)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 7500, NULL FROM items
   WHERE item_code = 'ACC-BN-STR' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 7500, updated_at = datetime('now')
 WHERE item_code = 'ACC-BN-STR' AND COALESCE(base_price, 0) = 0;

-- ACC-JJ-ZD5 족자봉 쫄대 5mm — 5라인 2곳 · 250원 (Q1 250~Q3 250, 변동 0.00)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 250, NULL FROM items
   WHERE item_code = 'ACC-JJ-ZD5' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 250, updated_at = datetime('now')
 WHERE item_code = 'ACC-JJ-ZD5' AND COALESCE(base_price, 0) = 0;

-- BUJIK-127 부직포 — 5라인 1곳 · 114400원 (Q1 114400~Q3 133000, 변동 0.16)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 114400, NULL FROM items
   WHERE item_code = 'BUJIK-127' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 114400, updated_at = datetime('now')
 WHERE item_code = 'BUJIK-127' AND COALESCE(base_price, 0) = 0;

-- KELG-090 켈그레이 30M 호홍 — 5라인 2곳 · 59000원 (Q1 55000~Q3 59000, 변동 0.07)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 59000, NULL FROM items
   WHERE item_code = 'KELG-090' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 59000, updated_at = datetime('now')
 WHERE item_code = 'KELG-090' AND COALESCE(base_price, 0) = 0;

-- MJG-7-1 무재해기 7호-1 — 5라인 1곳 · 3000원 (Q1 2800~Q3 3000, 변동 0.07)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 3000, NULL FROM items
   WHERE item_code = 'MJG-7-1' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 3000, updated_at = datetime('now')
 WHERE item_code = 'MJG-7-1' AND COALESCE(base_price, 0) = 0;

-- PJ-HAP-P60 합성지-프라임 60폭 — 5라인 1곳 · 59200원 (Q1 58000~Q3 65000, 변동 0.12)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 59200, NULL FROM items
   WHERE item_code = 'PJ-HAP-P60' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 59200, updated_at = datetime('now')
 WHERE item_code = 'PJ-HAP-P60' AND COALESCE(base_price, 0) = 0;

-- PJ-KEL-P60 PVC(켈)-프라임 60폭 — 5라인 1곳 · 78000원 (Q1 47500~Q3 79600, 변동 0.41)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 78000, NULL FROM items
   WHERE item_code = 'PJ-KEL-P60' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 78000, updated_at = datetime('now')
 WHERE item_code = 'PJ-KEL-P60' AND COALESCE(base_price, 0) = 0;

-- PONGE-155 폰지 — 5라인 1곳 · 1250원 (Q1 1250~Q3 1250, 변동 0.00)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 1250, NULL FROM items
   WHERE item_code = 'PONGE-155' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 1250, updated_at = datetime('now')
 WHERE item_code = 'PONGE-155' AND COALESCE(base_price, 0) = 0;

-- RM-I0005 수성잉크 잉크테크 Lc — 5라인 2곳 · 9900원 (Q1 9500~Q3 15000, 변동 0.56)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 9900, NULL FROM items
   WHERE item_code = 'RM-I0005' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 9900, updated_at = datetime('now')
 WHERE item_code = 'RM-I0005' AND COALESCE(base_price, 0) = 0;

-- TGK-SG45 태극기 수기 45×30 — 5라인 1곳 · 700원 (Q1 600~Q3 700, 변동 0.14)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 700, NULL FROM items
   WHERE item_code = 'TGK-SG45' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 700, updated_at = datetime('now')
 WHERE item_code = 'TGK-SG45' AND COALESCE(base_price, 0) = 0;
