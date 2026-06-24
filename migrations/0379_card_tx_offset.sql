-- 0379: 법인카드 승인↔취소 자동 상계
-- 같은 카드+금액+가맹점+근접날짜(±30일)의 승인/취소 쌍을 1:1 매칭해 '상계됨' 표시.
-- 상계건은 KPI(미분류/대기/승인·이번달 합계)·결의 생성·자동분류 대상에서 제외.
-- 신규 컬럼 → fresh/prod 모두 부재, 중복 ALTER 없음.

ALTER TABLE card_transactions ADD COLUMN is_offset INTEGER NOT NULL DEFAULT 0;
ALTER TABLE card_transactions ADD COLUMN offset_pair_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_card_tx_offset ON card_transactions(is_offset);
