-- 품목 기본단가 백필 — 이카운트 이관 실거래 이력에서 역산한 중앙값
--
-- 생성 = node scripts/derive-item-prices.cjs --sql <이 경로>   (재생성하면 같은 결과가 나온다)
-- 대상 = A·B 등급 + C 중 "틀려도 해가 작은" 것(C적용_면적흡수·C적용_소액). 판정 기준 = 그 스크립트의 classify().
--        빠진 것 = C보류_무질서(변동>=2.0, 할인·조정 라인)·C보류_표본편향(거래처<3곳)
--                 ·C보류_주문제작(FIXED 고액 — 간판은 BOM 조립견적, 운임은 거리별)·N(표본<5)·X(이력없음).
--        근거표 = docs/pricing/derived-prices.csv (등급 컬럼에 사유가 그대로 들어 있다).
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

-- AQ-BANNER 수성 현수막 — 6330라인 318곳 · 1800원/㎡ (Q1 1300~Q3 3000, 변동 0.94)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 1800, NULL FROM items
   WHERE item_code = 'AQ-BANNER' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 1800, updated_at = datetime('now')
 WHERE item_code = 'AQ-BANNER' AND COALESCE(base_price, 0) = 0;

-- TRG-PO 전사 깃발 폰지 — 1154라인 334곳 · 5000원/㎡ (Q1 3600~Q3 6700, 변동 0.62)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 5000, NULL FROM items
   WHERE item_code = 'TRG-PO' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 5000, updated_at = datetime('now')
 WHERE item_code = 'TRG-PO' AND COALESCE(base_price, 0) = 0;

-- UV-FMX-3T-W UV 포맥스 3T 백색 — 149라인 51곳 · 16900원/㎡ (Q1 10000~Q3 25600, 변동 0.92)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 16900, NULL FROM items
   WHERE item_code = 'UV-FMX-3T-W' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 16900, updated_at = datetime('now')
 WHERE item_code = 'UV-FMX-3T-W' AND COALESCE(base_price, 0) = 0;

-- UV-FMX-2T-W UV 포맥스 2T 백색 — 103라인 19곳 · 15000원/㎡ (Q1 5000~Q3 23500, 변동 1.23)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 15000, NULL FROM items
   WHERE item_code = 'UV-FMX-2T-W' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 15000, updated_at = datetime('now')
 WHERE item_code = 'UV-FMX-2T-W' AND COALESCE(base_price, 0) = 0;

-- UV-FMX-5T-W UV 포맥스 5T 백색 — 99라인 40곳 · 17100원/㎡ (Q1 10000~Q3 29200, 변동 1.12)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 17100, NULL FROM items
   WHERE item_code = 'UV-FMX-5T-W' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 17100, updated_at = datetime('now')
 WHERE item_code = 'UV-FMX-5T-W' AND COALESCE(base_price, 0) = 0;

-- UV-FOM-5T-W UV 폼보드 5T 백색 — 99라인 25곳 · 18500원/㎡ (Q1 10000~Q3 24600, 변동 0.79)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 18500, NULL FROM items
   WHERE item_code = 'UV-FOM-5T-W' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 18500, updated_at = datetime('now')
 WHERE item_code = 'UV-FOM-5T-W' AND COALESCE(base_price, 0) = 0;

-- UV-SHEETG UV 그레이시트 — 54라인 10곳 · 7600원/㎡ (Q1 400~Q3 8800, 변동 1.11)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 7600, NULL FROM items
   WHERE item_code = 'UV-SHEETG' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 7600, updated_at = datetime('now')
 WHERE item_code = 'UV-SHEETG' AND COALESCE(base_price, 0) = 0;

-- AQ-SYN 수성 합성지 — 50라인 7곳 · 5000원/㎡ (Q1 2000~Q3 8700, 변동 1.34)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 5000, NULL FROM items
   WHERE item_code = 'AQ-SYN' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 5000, updated_at = datetime('now')
 WHERE item_code = 'AQ-SYN' AND COALESCE(base_price, 0) = 0;

-- ACC-030-R150-3 가로기 깃대(조립) R150 3구 — 35라인 23곳 · 3000원 (Q1 2500~Q3 5000, 변동 0.83)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 3000, NULL FROM items
   WHERE item_code = 'ACC-030-R150-3' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 3000, updated_at = datetime('now')
 WHERE item_code = 'ACC-030-R150-3' AND COALESCE(base_price, 0) = 0;

-- ACC-032 P단 깃대 — 29라인 13곳 · 1400원 (Q1 700~Q3 2000, 변동 0.93)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 1400, NULL FROM items
   WHERE item_code = 'ACC-032' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 1400, updated_at = datetime('now')
 WHERE item_code = 'ACC-032' AND COALESCE(base_price, 0) = 0;

-- TRM-PO 전사 만장기 폰지 — 21라인 7곳 · 11300원/㎡ (Q1 6300~Q3 19400, 변동 1.16)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 11300, NULL FROM items
   WHERE item_code = 'TRM-PO' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 11300, updated_at = datetime('now')
 WHERE item_code = 'TRM-PO' AND COALESCE(base_price, 0) = 0;

-- TGK-SG30 태극기 수기 30×20 — 21라인 13곳 · 400원 (Q1 250~Q3 600, 변동 0.88)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 400, NULL FROM items
   WHERE item_code = 'TGK-SG30' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 400, updated_at = datetime('now')
 WHERE item_code = 'TGK-SG30' AND COALESCE(base_price, 0) = 0;

-- UV-FMX-10T-W UV 포맥스 10T 백색 — 20라인 7곳 · 48100원/㎡ (Q1 30000~Q3 85200, 변동 1.15)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 48100, NULL FROM items
   WHERE item_code = 'UV-FMX-10T-W' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 48100, updated_at = datetime('now')
 WHERE item_code = 'UV-FMX-10T-W' AND COALESCE(base_price, 0) = 0;

-- MGG-7 만국기 7호 — 20라인 7곳 · 4000원 (Q1 3500~Q3 6000, 변동 0.63)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 4000, NULL FROM items
   WHERE item_code = 'MGG-7' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 4000, updated_at = datetime('now')
 WHERE item_code = 'MGG-7' AND COALESCE(base_price, 0) = 0;

-- UV-SPC031G UV 투명시트 — 19라인 14곳 · 10000원/㎡ (Q1 5000~Q3 13300, 변동 0.83)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 10000, NULL FROM items
   WHERE item_code = 'UV-SPC031G' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 10000, updated_at = datetime('now')
 WHERE item_code = 'UV-SPC031G' AND COALESCE(base_price, 0) = 0;

-- ETC-CUT 재단/컷팅비 — 15라인 6곳 · 9000원 (Q1 1400~Q3 13600, 변동 1.36)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 9000, NULL FROM items
   WHERE item_code = 'ETC-CUT' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 9000, updated_at = datetime('now')
 WHERE item_code = 'ETC-CUT' AND COALESCE(base_price, 0) = 0;

-- TRG-ME 전사 깃발 매쉬 — 14라인 9곳 · 1500원/㎡ (Q1 1000~Q3 2500, 변동 1.00)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 1500, NULL FROM items
   WHERE item_code = 'TRG-ME' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 1500, updated_at = datetime('now')
 WHERE item_code = 'TRG-ME' AND COALESCE(base_price, 0) = 0;

-- ACC-030-R150-2 가로기 깃대(조립) R150 2구 — 13라인 11곳 · 3000원 (Q1 2500~Q3 5000, 변동 0.83)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 3000, NULL FROM items
   WHERE item_code = 'ACC-030-R150-2' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 3000, updated_at = datetime('now')
 WHERE item_code = 'ACC-030-R150-2' AND COALESCE(base_price, 0) = 0;

-- SV-LSHT 솔벤 조명시트 — 12라인 39곳 · 13900원/㎡ (Q1 7000~Q3 16400, 변동 0.68)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 13900, NULL FROM items
   WHERE item_code = 'SV-LSHT' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 13900, updated_at = datetime('now')
 WHERE item_code = 'SV-LSHT' AND COALESCE(base_price, 0) = 0;

-- ACC-018 양고리 폴대 — 12라인 7곳 · 700원 (Q1 520~Q3 1000, 변동 0.69)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 700, NULL FROM items
   WHERE item_code = 'ACC-018' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 700, updated_at = datetime('now')
 WHERE item_code = 'ACC-018' AND COALESCE(base_price, 0) = 0;

-- AQ-BUJIK 수성 부직포 — 11라인 12곳 · 4000원/㎡ (Q1 1300~Q3 4500, 변동 0.80)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 4000, NULL FROM items
   WHERE item_code = 'AQ-BUJIK' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 4000, updated_at = datetime('now')
 WHERE item_code = 'AQ-BUJIK' AND COALESCE(base_price, 0) = 0;

-- UV-ALM-2T-S UV 알마이트 2T 은색 — 8라인 8곳 · 7300원/㎡ (Q1 2000~Q3 15000, 변동 1.78)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 7300, NULL FROM items
   WHERE item_code = 'UV-ALM-2T-S' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 7300, updated_at = datetime('now')
 WHERE item_code = 'UV-ALM-2T-S' AND COALESCE(base_price, 0) = 0;

-- NHG-8 노인회기 8호 — 8라인 4곳 · 1300원 (Q1 1300~Q3 2400, 변동 0.85)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 1300, NULL FROM items
   WHERE item_code = 'NHG-8' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 1300, updated_at = datetime('now')
 WHERE item_code = 'NHG-8' AND COALESCE(base_price, 0) = 0;

-- ACC-029-800 까치발 800mm — 7라인 6곳 · 6000원 (Q1 5000~Q3 15000, 변동 1.67)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 6000, NULL FROM items
   WHERE item_code = 'ACC-029-800' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 6000, updated_at = datetime('now')
 WHERE item_code = 'ACC-029-800' AND COALESCE(base_price, 0) = 0;

-- TRWK-PO-S 전사 워킹배너 폰지 S형 — 6라인 4곳 · 6200원/㎡ (Q1 6200~Q3 10900, 변동 0.76)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 6200, NULL FROM items
   WHERE item_code = 'TRWK-PO-S' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 6200, updated_at = datetime('now')
 WHERE item_code = 'TRWK-PO-S' AND COALESCE(base_price, 0) = 0;

-- UV-ACR-5T-W UV 아크릴 5T 백색 — 6라인 16곳 · 30000원/㎡ (Q1 20000~Q3 45000, 변동 0.83)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 30000, NULL FROM items
   WHERE item_code = 'UV-ACR-5T-W' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 30000, updated_at = datetime('now')
 WHERE item_code = 'UV-ACR-5T-W' AND COALESCE(base_price, 0) = 0;

-- UV-PC-2T-M UV 광확산PC 2T 유백 — 5라인 6곳 · 14400원/㎡ (Q1 10000~Q3 20000, 변동 0.69)
INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)
  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), 14400, NULL FROM items
   WHERE item_code = 'UV-PC-2T-M' AND COALESCE(base_price, 0) = 0;
UPDATE items SET base_price = 14400, updated_at = datetime('now')
 WHERE item_code = 'UV-PC-2T-M' AND COALESCE(base_price, 0) = 0;
