-- 0156: 소재 판 규격 복수 지원 (JSON 배열)
-- 기존 sheet_width_cm/sheet_height_cm은 유지 (하위 호환)
-- sheet_sizes: [{"w":90,"h":180},{"w":120,"h":240}] 형태

ALTER TABLE print_media ADD COLUMN sheet_sizes TEXT;
