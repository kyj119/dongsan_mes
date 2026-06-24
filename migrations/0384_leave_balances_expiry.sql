-- ============================================================================
-- Migration 0384: 연차 만료/소멸 컬럼 추가 (옵션B) — 컬럼만(relabel은 0385, 코드배포 후)
-- 잔여 = accrued+granted_extra+carried_over-used-expired. expire_date=만료일.
-- 컬럼 추가는 구/신 코드 모두 안전(구코드는 새 컬럼 무시) → 무회귀 배포 가능.
-- ⚠️ ALTER ADD COLUMN은 IF NOT EXISTS 불가 — 1회만 적용.
-- ============================================================================

ALTER TABLE leave_balances ADD COLUMN expire_date TEXT;
ALTER TABLE leave_balances ADD COLUMN expired REAL NOT NULL DEFAULT 0;
