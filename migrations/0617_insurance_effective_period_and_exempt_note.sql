-- 0617: 4대보험 요율 기간 관리(T3) + 가입 예외 사유 메모(T1)
--
-- [T3] 왜: insurance_rates 가 UNIQUE(year, insurance_type) 이라 연 1행만 존재할 수 있었다.
--   국민연금 기준소득월액 상·하한은 매년 7월 재조정되는데 이를 표현할 방법이 없어,
--   2026-07-18 에 상한을 637만→659만으로 UPDATE 하자 그 값이 상반기에도 소급됐다.
--   2026-09-17 실측: 2026-06 급여 재계산 시 과세 800만 직원의 국민연금이
--   302,570(상한 637만) 이어야 하는데 313,020(상한 659만)으로 계산됐다(이카운트 대조로 발견).
--   effective_from/effective_to 컬럼은 처음부터 있었으나 UNIQUE 제약이 사용을 막고 있었다.
--
-- [T1] 왜: insurance_apply_* 5개 토글이 전 직원 기본값 1 인 채로 방치됐는데
--   "왜 켜져 있는지/왜 껐는지"를 적을 곳이 없어 아무도 이상을 눈치채지 못했다.
--   2026-09-17 이카운트 대조에서 월 1,712,980원 과다공제가 확인됐다.

-- ─────────────────────────────────────────────────────────────
-- 1) insurance_rates: UNIQUE(year, insurance_type) → UNIQUE(insurance_type, effective_from)
--    D1(SQLite)은 제약 변경이 불가하므로 테이블 재생성.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insurance_rates_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  insurance_type TEXT NOT NULL,
  total_rate REAL NOT NULL,
  employee_rate REAL NOT NULL DEFAULT 0,
  employer_rate REAL NOT NULL DEFAULT 0,
  base TEXT NOT NULL DEFAULT 'TAXABLE_PAY',
  min_base INTEGER,
  max_base INTEGER,
  effective_from DATE NOT NULL,
  effective_to DATE,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(insurance_type, effective_from)
);

INSERT OR IGNORE INTO insurance_rates_v2
  (id, year, insurance_type, total_rate, employee_rate, employer_rate, base,
   min_base, max_base, effective_from, effective_to, notes, created_at)
SELECT id, year, insurance_type, total_rate, employee_rate, employer_rate, base,
       min_base, max_base, effective_from, effective_to, notes, created_at
FROM insurance_rates;

DROP TABLE insurance_rates;
ALTER TABLE insurance_rates_v2 RENAME TO insurance_rates;

-- 조회 패턴: effective_from <= 기준일 AND (effective_to IS NULL OR effective_to >= 기준일)
CREATE INDEX IF NOT EXISTS idx_insurance_rates_effective
  ON insurance_rates(insurance_type, effective_from);

-- ─────────────────────────────────────────────────────────────
-- 2) 2026 국민연금 기준소득월액 상·하한을 상/하반기 2행으로 분리
--    상반기(1/1~6/30): 하한 400,000 · 상한 6,370,000
--    하반기(7/1~    ): 하한 410,000 · 상한 6,590,000  ← 현재 단일 행에 들어있는 값
-- ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO insurance_rates
  (year, insurance_type, total_rate, employee_rate, employer_rate, base,
   min_base, max_base, effective_from, effective_to, notes)
SELECT year, insurance_type, total_rate, employee_rate, employer_rate, base,
       410000, 6590000, '2026-07-01', NULL,
       '2026 하반기 기준소득월액(국민연금공단 고시). 매년 7월 재조정 — 다음=2027-07'
FROM insurance_rates
WHERE insurance_type = 'NATIONAL_PENSION' AND year = 2026 AND effective_from = '2026-01-01';

UPDATE insurance_rates
   SET min_base = 400000,
       max_base = 6370000,
       effective_to = '2026-06-30',
       notes = '2026 상반기 기준소득월액. 하반기(7/1~)는 별도 행'
 WHERE insurance_type = 'NATIONAL_PENSION' AND year = 2026 AND effective_from = '2026-01-01';

-- ─────────────────────────────────────────────────────────────
-- 3) 4대보험 가입 예외 사유 메모 (T1)
--    보험별 사유가 서로 다를 수 있어(예: 고용만 친인척 제외) 자유 텍스트 1칸으로 둔다.
--    구조화된 판정은 코드 규칙(생년월일·직위·주민번호·입퇴사일)이 담당한다.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE employees ADD COLUMN insurance_exempt_note TEXT;
