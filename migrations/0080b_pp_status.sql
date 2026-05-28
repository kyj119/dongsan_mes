-- 카드 후가공 진행 상태 추적
-- pp_status: N/A(후가공 없음), PENDING(대기), DONE(완료)
ALTER TABLE cards ADD COLUMN pp_status TEXT DEFAULT 'N/A';
ALTER TABLE cards ADD COLUMN pp_completed_at TEXT;

-- 기존 PRINT_DONE 카드: 후가공 있으면 PENDING, 없으면 N/A
UPDATE cards SET pp_status = 'PENDING'
WHERE status = 'PRINT_DONE'
  AND post_processing IS NOT NULL
  AND post_processing != '[]'
  AND post_processing != '';

CREATE INDEX IF NOT EXISTS idx_cards_pp_status ON cards(pp_status);
