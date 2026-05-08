-- 재고 관리 초기 데이터
-- Created: 2026-02-12

-- 재고 품목 마스터
INSERT OR IGNORE INTO inventory_items (item_code, item_name, category, sub_category, unit, unit_price, current_stock, safety_stock, location, supplier, description) VALUES
-- 원단 (FABRIC)
('MAT-BANNER-001', '실사출력 배너 원단 (440g)', 'FABRIC', 'BANNER', 'M', 5000, 500, 100, '창고-A1', '한들플라인', '실사출력용 440g 배너 원단'),
('MAT-BANNER-002', '실사출력 배너 원단 (550g)', 'FABRIC', 'BANNER', 'M', 6000, 300, 50, '창고-A1', '한들플라인', '실사출력용 550g 배너 원단'),
('MAT-MESH-001', '메쉬 원단 (4홀)', 'FABRIC', 'MESH', 'M', 4500, 200, 50, '창고-A2', '한빛레이저', '4홀 메쉬 원단'),
('MAT-FLAG-001', '태극기 원단 (폴리)', 'FABRIC', 'FLAG', 'M', 8000, 150, 30, '창고-A3', '코리아플래그', '태극기용 폴리 원단'),
('MAT-SIGN-001', '간판 아크릴판 (3mm)', 'FABRIC', 'SIGN', 'EA', 15000, 50, 10, '창고-B1', '대한간판', '3mm 투명 아크릴판'),
('MAT-SIGN-002', '간판 아크릴판 (5mm)', 'FABRIC', 'SIGN', 'EA', 25000, 30, 5, '창고-B1', '대한간판', '5mm 투명 아크릴판'),

-- 부자재 (ACCESSORY)
('ACC-WOOD-001', '원형나무봉 (20mm)', 'ACCESSORY', 'WOOD', 'EA', 1000, 500, 100, '창고-C1', '목재마트', '20mm 원형나무봉 (2m)'),
('ACC-WOOD-002', '원형나무봉 (25mm)', 'ACCESSORY', 'WOOD', 'EA', 1500, 300, 50, '창고-C1', '목재마트', '25mm 원형나무봉 (2m)'),
('ACC-EYELET-001', '하토메 (10mm)', 'ACCESSORY', 'EYELET', 'EA', 50, 2000, 500, '창고-C2', '부자재마트', '10mm 하토메'),
('ACC-EYELET-002', '하토메 (12mm)', 'ACCESSORY', 'EYELET', 'EA', 70, 1500, 300, '창고-C2', '부자재마트', '12mm 하토메'),
('ACC-THREAD-001', '줄미싱용 실 (백색)', 'ACCESSORY', 'THREAD', 'EA', 5000, 20, 5, '창고-C3', '봉제자재', '백색 줄미싱용 실 (2000m)'),
('ACC-THREAD-002', '줄미싱용 실 (흑색)', 'ACCESSORY', 'THREAD', 'EA', 5000, 15, 5, '창고-C3', '봉제자재', '흑색 줄미싱용 실 (2000m)'),
('ACC-GLUE-001', '접착제 (일반)', 'ACCESSORY', 'GLUE', 'L', 8000, 30, 10, '창고-C4', '화학마트', '일반 접착제 (1L)'),

-- 소모품 (CONSUMABLE)
('CON-INK-001', '잉크 카트리지 (CYAN)', 'CONSUMABLE', 'INK', 'EA', 45000, 10, 3, '창고-D1', 'HP', 'HP 시아 잉크 카트리지'),
('CON-INK-002', '잉크 카트리지 (MAGENTA)', 'CONSUMABLE', 'INK', 'EA', 45000, 10, 3, '창고-D1', 'HP', 'HP 마젠타 잉크 카트리지'),
('CON-INK-003', '잉크 카트리지 (YELLOW)', 'CONSUMABLE', 'INK', 'EA', 45000, 10, 3, '창고-D1', 'HP', 'HP 옐로우 잉크 카트리지'),
('CON-INK-004', '잉크 카트리지 (BLACK)', 'CONSUMABLE', 'INK', 'EA', 50000, 15, 5, '창고-D1', 'HP', 'HP 블랙 잉크 카트리지'),
('CON-CLEAN-001', '프린터 청소용품', 'CONSUMABLE', 'CLEAN', 'EA', 15000, 5, 2, '창고-D2', '청소마트', '프린터 청소 키트'),
('CON-TAPE-001', '양면테이프 (50mm)', 'CONSUMABLE', 'TAPE', 'EA', 8000, 20, 5, '창고-D3', '테이프마트', '50mm 양면테이프 (50m)');

-- 초기 입고 트랜잭션 (현재 재고 반영)
-- 배너 원단 440g 입고
INSERT OR IGNORE INTO inventory_transactions (item_id, transaction_type, transaction_date, quantity, unit_price, total_amount, reference_type, balance_after, reason, handled_by, notes)
SELECT id, 'IN', datetime('now', '-30 days'), 500, 5000, 2500000, 'PURCHASE', 500, '초기 재고 입고', 1, '기초 재고 등록'
FROM inventory_items WHERE item_code = 'MAT-BANNER-001';

-- 배너 원단 550g 입고
INSERT OR IGNORE INTO inventory_transactions (item_id, transaction_type, transaction_date, quantity, unit_price, total_amount, reference_type, balance_after, reason, handled_by, notes)
SELECT id, 'IN', datetime('now', '-30 days'), 300, 6000, 1800000, 'PURCHASE', 300, '초기 재고 입고', 1, '기초 재고 등록'
FROM inventory_items WHERE item_code = 'MAT-BANNER-002';

-- 원형나무봉 20mm 입고
INSERT OR IGNORE INTO inventory_transactions (item_id, transaction_type, transaction_date, quantity, unit_price, total_amount, reference_type, balance_after, reason, handled_by, notes)
SELECT id, 'IN', datetime('now', '-25 days'), 500, 1000, 500000, 'PURCHASE', 500, '초기 재고 입고', 1, '기초 재고 등록'
FROM inventory_items WHERE item_code = 'ACC-WOOD-001';

-- 하토메 10mm 입고
INSERT OR IGNORE INTO inventory_transactions (item_id, transaction_type, transaction_date, quantity, unit_price, total_amount, reference_type, balance_after, reason, handled_by, notes)
SELECT id, 'IN', datetime('now', '-20 days'), 2000, 50, 100000, 'PURCHASE', 2000, '초기 재고 입고', 1, '기초 재고 등록'
FROM inventory_items WHERE item_code = 'ACC-EYELET-001';

-- 잉크 카트리지 CYAN 입고
INSERT OR IGNORE INTO inventory_transactions (item_id, transaction_type, transaction_date, quantity, unit_price, total_amount, reference_type, balance_after, reason, handled_by, notes)
SELECT id, 'IN', datetime('now', '-15 days'), 10, 45000, 450000, 'PURCHASE', 10, '초기 재고 입고', 1, '기초 재고 등록'
FROM inventory_items WHERE item_code = 'CON-INK-001';

-- 샘플 입고 내역
INSERT OR IGNORE INTO inventory_receipts (receipt_number, receipt_date, supplier, total_amount, status, received_by, notes)
VALUES ('RCV-20260113-001', date('now', '-30 days'), '한들플라인', 4300000, 'COMPLETED', 1, '배너 원단 대량 입고');

INSERT OR IGNORE INTO inventory_receipt_items (receipt_id, item_id, quantity, unit_price, amount, location)
SELECT 
  (SELECT id FROM inventory_receipts WHERE receipt_number = 'RCV-20260113-001'),
  id, 500, 5000, 2500000, '창고-A1'
FROM inventory_items WHERE item_code = 'MAT-BANNER-001';

INSERT OR IGNORE INTO inventory_receipt_items (receipt_id, item_id, quantity, unit_price, amount, location)
SELECT 
  (SELECT id FROM inventory_receipts WHERE receipt_number = 'RCV-20260113-001'),
  id, 300, 6000, 1800000, '창고-A1'
FROM inventory_items WHERE item_code = 'MAT-BANNER-002';
