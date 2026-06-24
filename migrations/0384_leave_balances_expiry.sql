-- ============================================================================
-- Migration 0384: 연차 만료/소멸 + 26일 병존 (옵션B = leave_balances 확장)
-- 결정: D1 입사일 기준 / 월차 입사일+1년 일괄 소멸 / 미사용분 소멸+사용촉진.
--   ① expire_date·expired 컬럼 추가(소멸 추적). 잔여 = accrued+granted_extra+carried_over-used-expired.
--   ② 병존: 1년미만 직원의 월차를 leave_type='MONTHLY'로 분리(기존 'ANNUAL' 단일행 충돌 B6 해소).
--      → 적립 monthly 잡이 'MONTHLY', yearly 잡이 'ANNUAL'에 적립. 읽기경로는 ANNUAL+MONTHLY 합산.
--   잔여 보존: relabel은 leave_type만 변경(값 불변) → 합산 잔여 동일(무회귀).
--   ⚠️ ALTER ADD COLUMN은 IF NOT EXISTS 불가 — 1회만 적용(prod execute --file).
-- 설계: docs/superpowers/specs/2026-06-24-leave-promotion-expiry-design.md §6-A (옵션B)
-- ============================================================================

ALTER TABLE leave_balances ADD COLUMN expire_date TEXT;            -- 만료일(월차=입사+1년, 연차=발생+1년). NULL=비만료
ALTER TABLE leave_balances ADD COLUMN expired REAL NOT NULL DEFAULT 0;  -- 소멸 처리된 일수(촉진 적법분)

-- 병존 분리: 1년 미만(입사 365일 미만) 직원의 'ANNUAL' 행은 사실상 월차 → 'MONTHLY'로 relabel.
--   1년 이상자의 'ANNUAL'(15+가산)은 그대로. 월차는 이미 입사+1년에 소멸했으므로 분리 불필요.
UPDATE leave_balances
SET leave_type = 'MONTHLY', updated_at = CURRENT_TIMESTAMP
WHERE leave_type = 'ANNUAL'
  AND employee_id IN (
    SELECT id FROM employees
    WHERE hire_date IS NOT NULL
      AND julianday(date('now', '+9 hours')) - julianday(hire_date) < 365
  );

-- 월차(MONTHLY) 만료일 = 입사일+1년 (일괄 소멸 결정)
UPDATE leave_balances
SET expire_date = date((SELECT e.hire_date FROM employees e WHERE e.id = leave_balances.employee_id), '+1 year')
WHERE leave_type = 'MONTHLY'
  AND expire_date IS NULL
  AND (SELECT e.hire_date FROM employees e WHERE e.id = leave_balances.employee_id) IS NOT NULL;

-- 연차(ANNUAL) 기존 행 expire_date는 NULL 유지(비만료) — 정확 발생일 미상.
--   향후 yearly 적립 잡이 신규 부여분에 expire_date(발생일+1년) 설정. 소멸 sweep는 expire_date<today만 대상이라 무영향.
