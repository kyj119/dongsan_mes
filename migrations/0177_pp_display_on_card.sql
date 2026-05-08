-- 후가공 카드 표시 제어: 작업자 수동 작업 항목만 카드에 표시
ALTER TABLE post_processing_options ADD COLUMN display_on_card INTEGER DEFAULT 1;

-- IA 자동 처리 항목은 카드에서 숨김
UPDATE post_processing_options SET display_on_card = 0 WHERE option_code IN ('ANNOTATION', 'OFFSET', 'PP-DOMBO');
