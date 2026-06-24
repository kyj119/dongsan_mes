-- ============================================================================
-- Migration 0385: 26일 병존 — 1년미만 직원의 월차를 leave_type='MONTHLY'로 분리
-- ⚠️ 코드배포(ANNUAL+MONTHLY 합산 읽기) **이후** 적용. 신코드는 합산이라 relabel 전후 잔여 동일(무회귀).
--   적용 후 월차 적립(monthly)이 MONTHLY 버킷 사용 → 연차(ANNUAL) 부여와 충돌(B6) 해소.
--   relabel은 leave_type만 변경(값 불변) → 합산 잔여 보존. ⚠️ 적용 전 월차 적립 잡 실행 금지(이중계상).
-- ============================================================================

-- 1년 미만(입사 365일 미만) 직원의 'ANNUAL' 행 = 사실상 월차 → 'MONTHLY'로 relabel.
UPDATE leave_balances
SET leave_type = 'MONTHLY', updated_at = CURRENT_TIMESTAMP
WHERE leave_type = 'ANNUAL'
  AND employee_id IN (
    SELECT id FROM employees
    WHERE hire_date IS NOT NULL
      AND julianday(date('now', '+9 hours')) - julianday(hire_date) < 365
  );

-- 월차(MONTHLY) 만료일 = 입사일+1년(일괄 소멸 결정).
UPDATE leave_balances
SET expire_date = date((SELECT e.hire_date FROM employees e WHERE e.id = leave_balances.employee_id), '+1 year')
WHERE leave_type = 'MONTHLY'
  AND expire_date IS NULL
  AND (SELECT e.hire_date FROM employees e WHERE e.id = leave_balances.employee_id) IS NOT NULL;
