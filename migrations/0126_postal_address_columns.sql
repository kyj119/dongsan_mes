-- ============================================================================
-- 우편번호 + 상세주소 컬럼 추가
-- 적용 대상: employees (직원), clients (거래처)
-- 다음(카카오) 우편번호 API 연동을 위한 컬럼 분리
-- ============================================================================

-- employees: 우편번호 + 상세주소
ALTER TABLE employees ADD COLUMN postal_code TEXT;          -- 우편번호 (5자리)
ALTER TABLE employees ADD COLUMN address_detail TEXT;       -- 상세주소 (101동 1502호 등)

-- clients: 우편번호 + 상세주소
ALTER TABLE clients ADD COLUMN postal_code TEXT;            -- 우편번호 (5자리)
ALTER TABLE clients ADD COLUMN address_detail TEXT;         -- 상세주소
