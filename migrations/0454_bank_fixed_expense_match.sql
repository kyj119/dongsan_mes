-- ============================================================================
-- Migration 0454: 은행거래 ↔ 고정비 매칭 + 규칙 부분일치(적요 변동 추적)
-- 설계: docs/superpowers/specs/2026-07-10-bank-fund-management-expansion.md
--
-- 배경: 출금 거래를 비용분류/고정비에 자동 제안. 적요가 매달 달라도(5월 선명 전기요금
--   → 6월 선명 전기요금) 고정비 항목(fixed_expenses)에 앵커해 월별 실적을
--   recurring_expense_actuals에 누적한다. 규칙은 완전일치→부분일치(CONTAINS) 확장.
-- ============================================================================

-- 1) 거래가 어떤 고정비의 실적인지 역참조 (당월 출금 확인 · 적요변동 무관 추적)
ALTER TABLE bank_transactions ADD COLUMN matched_fixed_expense_id INTEGER;  -- → fixed_expenses(id)
CREATE INDEX IF NOT EXISTS idx_bt_fixed ON bank_transactions(matched_fixed_expense_id);

-- 2) 규칙 매칭 방식: EXACT(기존 하위호환 기본) | CONTAINS(입금자명 부분일치)
ALTER TABLE bank_match_rules ADD COLUMN match_type TEXT NOT NULL DEFAULT 'EXACT';
