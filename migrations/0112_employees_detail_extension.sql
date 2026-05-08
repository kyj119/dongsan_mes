-- ============================================================================
-- Phase B1-2: employees 테이블 상세 필드 확장
-- - 직원 상세 페이지에서 관리할 급여/수당/공제/4대보험 토글 필드 추가
-- - 0109(간이세액/부양가족/CAPS 매핑)과 0111(payroll 확장)의 후속
-- ============================================================================

-- ---------- 기본 정보 ----------
ALTER TABLE employees ADD COLUMN birth_date DATE;
  -- 생년월일 (주민번호와 별개로 관리)
ALTER TABLE employees ADD COLUMN bank_holder TEXT;
  -- 급여통장 예금주 (직원 본인이 아닐 수 있음)

-- ---------- 고정 지급 항목 (월 정액) ----------
-- payroll 생성 시 기본값으로 사용되며, 페이지에서 덮어쓸 수 있음
ALTER TABLE employees ADD COLUMN position_allowance INTEGER DEFAULT 0;
  -- 직책수당 (월 정액)
ALTER TABLE employees ADD COLUMN vehicle_allowance INTEGER DEFAULT 0;
  -- 차량유지비 (월 정액, 비과세 자가운전보조금 한도 내)
ALTER TABLE employees ADD COLUMN meal_allowance_fixed INTEGER DEFAULT 0;
  -- 식대 (월 정액, 비과세 한도 내)
ALTER TABLE employees ADD COLUMN special_bonus_fixed INTEGER DEFAULT 0;
  -- 특별상여 (고정급으로 매월 지급되는 경우)
ALTER TABLE employees ADD COLUMN other_allowance_fixed INTEGER DEFAULT 0;
  -- 기타수당 (월 정액)

-- ---------- 고정 공제 항목 (월 정액) ----------
ALTER TABLE employees ADD COLUMN mutual_aid_fee INTEGER DEFAULT 0;
  -- 상조회비 (월 정액)
ALTER TABLE employees ADD COLUMN other_deduction_fixed INTEGER DEFAULT 0;
  -- 기타공제 (월 정액, 예: 대출상환 등)

-- ---------- 4대보험 적용 토글 ----------
-- 기본은 모두 적용(1). 대표이사/임원/단기알바 등 비적용 케이스 대응
ALTER TABLE employees ADD COLUMN insurance_apply_national_pension INTEGER DEFAULT 1;
  -- 국민연금 적용 여부
ALTER TABLE employees ADD COLUMN insurance_apply_health INTEGER DEFAULT 1;
  -- 건강보험 적용 여부
ALTER TABLE employees ADD COLUMN insurance_apply_long_term_care INTEGER DEFAULT 1;
  -- 장기요양보험 적용 여부 (건강보험 적용 시 자동 적용이 일반적이지만 별도 토글)
ALTER TABLE employees ADD COLUMN insurance_apply_employment INTEGER DEFAULT 1;
  -- 고용보험 적용 여부
ALTER TABLE employees ADD COLUMN insurance_apply_industrial_accident INTEGER DEFAULT 1;
  -- 산재보험 적용 여부 (전액 사업주 부담)

-- ---------- CAPS 연동 메모 ----------
ALTER TABLE employees ADD COLUMN caps_last_synced_at DATETIME;
  -- 해당 직원이 CAPS로부터 마지막으로 동기화된 시점
