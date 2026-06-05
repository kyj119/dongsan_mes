-- ============================================================================
-- Migration 0299: 정기 변동비용(준고정비) 관리
-- 통신비·전기세처럼 정기 발생하나 금액이 변동되는 비용을 과거 실적 기반 추정→정산.
-- 설계: docs/superpowers/specs/2026-06-05-recurring-variable-expense.md
-- ============================================================================

-- 1) fixed_expenses 확장: 변동 추정 메타데이터
--    amount_type=ESTIMATED 이면 linked_category_id 의 과거 실적으로 금액을 추정.
ALTER TABLE fixed_expenses ADD COLUMN amount_type TEXT NOT NULL DEFAULT 'FIXED';  -- FIXED | ESTIMATED
ALTER TABLE fixed_expenses ADD COLUMN estimate_method TEXT;                       -- AVG_3M | AVG_6M | SAME_MONTH_LAST_YEAR | LAST
ALTER TABLE fixed_expenses ADD COLUMN linked_category_id INTEGER;                 -- → expense_categories(id)

CREATE INDEX IF NOT EXISTS idx_fe_amount_type ON fixed_expenses(amount_type);

-- 2) 월별 추정 vs 실적 이력 (자금예측·손익·추적·추정학습 공용 단일 소스)
CREATE TABLE IF NOT EXISTS recurring_expense_actuals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixed_expense_id INTEGER NOT NULL REFERENCES fixed_expenses(id) ON DELETE CASCADE,
  period TEXT NOT NULL,                       -- YYYY-MM
  estimated_amount REAL,                      -- 예측 시점 추정치
  actual_amount REAL,                         -- 실제 결제 확정치
  actual_source TEXT,                         -- CARD | BANK | MANUAL
  variance REAL,                              -- actual_amount - estimated_amount
  note TEXT,
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(fixed_expense_id, period)
);

CREATE INDEX IF NOT EXISTS idx_rea_fe ON recurring_expense_actuals(fixed_expense_id);
CREATE INDEX IF NOT EXISTS idx_rea_period ON recurring_expense_actuals(period);
CREATE INDEX IF NOT EXISTS idx_rea_entity ON recurring_expense_actuals(entity_id);
