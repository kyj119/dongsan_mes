-- 족자봉 부속 재연결 롤백 (2026-08-07)
UPDATE order_items SET item_id = 984 WHERE id IN (2636, 2695, 2703, 2706);  -- ACC-049-CR 로 복원
UPDATE order_items SET item_id = 983 WHERE id = 2554;                        -- ACC-049-SQ 로 복원
UPDATE items SET base_unit = NULL, pack_size = NULL WHERE item_code IN ('ACC-049-SQ','ACC-049-CR');
