-- 후가공 옵션 '돔보' 추가
INSERT OR IGNORE INTO post_processing_options (option_code, option_name, margin_left, margin_right, margin_top, margin_bottom, additional_cost, description, is_active, pricing_type, unit_price, pp_category)
VALUES ('PP-DOMBO', '돔보', 0, 0, 0, 0, 0, '돔보 처리', 1, 'fixed', 0, 'finish');
