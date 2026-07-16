-- 폭 라벨 정정 (150→152, 105→106; 매출3건 사용 AQ2-105 포함)
UPDATE items SET item_code='AQ1-152', updated_at=CURRENT_TIMESTAMP WHERE item_code='AQ1-150';
UPDATE items SET item_code='AQ2-152', updated_at=CURRENT_TIMESTAMP WHERE item_code='AQ2-150';
UPDATE items SET item_code='AQ2-106', updated_at=CURRENT_TIMESTAMP WHERE item_code='AQ2-105';
