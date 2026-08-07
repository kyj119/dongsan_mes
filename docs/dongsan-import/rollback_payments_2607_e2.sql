-- 선명 2026-07 수금 적재 롤백 (2026-08-07)
DELETE FROM payments WHERE notes LIKE '선명 이관 2026-07 수금%';
