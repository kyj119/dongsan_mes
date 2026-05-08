-- Seed data for production log tables
-- Test data for development

-- Dummy order for FK references
INSERT OR IGNORE INTO orders (id, order_number, client_id, status, delivery_date, created_by) VALUES
(1, 'TEST-ORDER-001', 1, 'PRODUCTION', date('now', '+7 days'), 1);

-- Dummy order_item for FK references
INSERT OR IGNORE INTO order_items (id, order_id, item_id, item_name, category_name, width, height, quantity) VALUES
(1, 1, 1, '실사출력 배너', '실사출력', 100, 200, 1);

-- First, ensure we have at least one card for foreign key references
INSERT OR IGNORE INTO cards (
  id, card_number, order_id, order_item_id, status,
  client_name, item_name, category_name,
  width, height, quantity, unit,
  rip_filename, delivery_date, priority
) VALUES (
  1, 'CARD-TEST-001', 1, 1, 'PRINT_PENDING',
  '테스트거래처', '실사출력 배너', '실사출력',
  100, 200, 1, 'EA',
  'TEST_001.pdf', date('now', '+7 days'), 0
);

-- Insert sample production logs (최근 7일)
INSERT OR IGNORE INTO production_logs (id, log_date, shift, weather, temperature, humidity, supervisor_id, notes, created_by) VALUES
(1, date('now', '-6 days'), 'DAY', '맑음', 22, 45, 1, '정상 가동', 1),
(2, date('now', '-6 days'), 'NIGHT', '맑음', 18, 50, 2, '야간 정상 가동', 1),
(3, date('now', '-5 days'), 'DAY', '흐림', 20, 55, 1, '정상 가동', 1),
(4, date('now', '-4 days'), 'DAY', '비', 18, 70, 2, '우천으로 인한 습도 관리 주의', 1),
(5, date('now', '-3 days'), 'DAY', '맑음', 23, 40, 1, '대량 주문 처리', 1),
(6, date('now', '-2 days'), 'DAY', '맑음', 24, 42, 2, '정상 가동', 1),
(7, date('now', '-1 days'), 'DAY', '흐림', 21, 48, 1, '정상 가동', 1);

-- Insert sample work records (카드별 작업 기록)
-- Assuming card_id 1 exists from previous seeds
INSERT OR IGNORE INTO work_records (production_log_id, card_id, employee_id, work_type, start_time, end_time, work_hours, quantity_completed, quantity_target, status, notes) VALUES
-- 6일 전
(1, 1, 3, 'PRINT', datetime('now', '-6 days', '09:00'), datetime('now', '-6 days', '12:00'), 3.0, 500, 500, 'COMPLETED', '실사출력 작업 완료'),
(1, 1, 4, 'POST_PROCESS', datetime('now', '-6 days', '13:00'), datetime('now', '-6 days', '15:30'), 2.5, 500, 500, 'COMPLETED', '후가공 완료'),
-- 5일 전
(3, 1, 3, 'QC', datetime('now', '-5 days', '09:00'), datetime('now', '-5 days', '10:00'), 1.0, 500, 500, 'COMPLETED', '품질 검사 완료'),
(3, 1, 5, 'PACKING', datetime('now', '-5 days', '10:30'), datetime('now', '-5 days', '11:30'), 1.0, 500, 500, 'COMPLETED', '포장 완료'),
-- 4일 전
(4, 1, 3, 'PRINT', datetime('now', '-4 days', '09:00'), datetime('now', '-4 days', '11:00'), 2.0, 300, 500, 'PAUSED', '습도 문제로 일시 중단'),
-- 3일 전
(5, 1, 3, 'PRINT', datetime('now', '-3 days', '09:00'), datetime('now', '-3 days', '13:00'), 4.0, 700, 1000, 'IN_PROGRESS', '대량 주문 진행 중'),
(5, 1, 4, 'PRINT', datetime('now', '-3 days', '09:00'), datetime('now', '-3 days', '13:00'), 4.0, 300, 500, 'COMPLETED', '추가 작업 완료');

-- Insert sample quality issues (불량 기록)
INSERT OR IGNORE INTO quality_issues (work_record_id, card_id, issue_type, defect_category, quantity_defect, description, root_cause, corrective_action, status, reported_by, cost_impact) VALUES
(1, 1, 'DEFECT', 'COLOR', 5, '색상 불일치 (청색 부분)', '잉크 혼합 비율 오류', '잉크 교체 및 재조정', 'RESOLVED', 3, 50000),
(2, 1, 'DEFECT', 'ALIGNMENT', 3, '인쇄 위치 틀어짐', '롤러 정렬 불량', '롤러 재정렬 및 테스트', 'RESOLVED', 4, 30000),
(5, 1, 'REWORK', 'CUT', 10, '재단 불량 (사이즈 초과)', '재단기 설정 오류', '재단 후 재작업', 'REWORK_REQUIRED', 3, 100000),
(6, 1, 'DEFECT', 'MATERIAL', 2, '원단 주름', '보관 상태 불량', '원단 교체', 'RESOLVED', 3, 80000);

-- Insert sample production metrics (생산 실적 요약)
INSERT OR IGNORE INTO production_metrics (metric_date, shift, total_cards_processed, total_work_hours, total_quantity_completed, total_defects, defect_rate, productivity_score) VALUES
(date('now', '-6 days'), 'DAY', 2, 5.5, 1000, 5, 0.5, 95.0),
(date('now', '-6 days'), 'NIGHT', 1, 3.0, 500, 0, 0.0, 100.0),
(date('now', '-5 days'), 'DAY', 2, 2.0, 1000, 3, 0.3, 97.0),
(date('now', '-4 days'), 'DAY', 1, 2.0, 300, 10, 3.3, 85.0),
(date('now', '-3 days'), 'DAY', 3, 8.0, 1500, 2, 0.13, 98.5),
(date('now', '-2 days'), 'DAY', 2, 6.0, 1200, 0, 0.0, 100.0),
(date('now', '-1 days'), 'DAY', 1, 4.0, 800, 1, 0.13, 99.0);
