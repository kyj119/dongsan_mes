-- 0286_cards_add_print_done_at_shipped_by.sql
-- 코드/스키마 드리프트 정정: cards.print_done_at, cards.shipped_by 가 코드에서 참조되나
--   스키마(마이그레이션)에 추가된 적이 없어 카드 완료/출고 경로가 'no such column' 500.
--   영향: PATCH /cards/:id/complete, scan/PP 완료, printEvents RIP 완료, shipments ship(shipped_by).
-- 둘 다 감사 시각/담당자 컬럼 → 추가(저위험 ADD COLUMN, 기존 데이터 NULL).

ALTER TABLE cards ADD COLUMN print_done_at DATETIME;
ALTER TABLE cards ADD COLUMN shipped_by INTEGER;
