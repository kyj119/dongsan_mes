-- ============================================================================
-- 0114: 연말정산 (Year-End Tax Settlement) 테이블
-- Phase B4: 근로소득 원천징수영수증 정산 데이터 저장
-- ============================================================================

-- 연말정산 마스터: 연도별 직원별 1건
CREATE TABLE IF NOT EXISTS year_end_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT / CALCULATED / CONFIRMED / LOCKED

  -- ── 급여 집계 (자동 계산) ──
  total_salary INTEGER DEFAULT 0,       -- 총급여액 (과세+비과세)
  total_nontax INTEGER DEFAULT 0,       -- 비과세 합계 (식대/교통/보육)
  gross_taxable INTEGER DEFAULT 0,      -- 총급여 - 비과세 = 근로소득금액 기준

  -- ── 근로소득공제 (자동 계산) ──
  earned_income_deduction INTEGER DEFAULT 0,  -- 근로소득공제액

  -- ── 인적공제 ──
  basic_deduction INTEGER DEFAULT 0,          -- 기본공제 (본인+부양가족 × 150만)
  dependents_count INTEGER DEFAULT 1,         -- 기본공제 대상자 수 (본인 포함)
  additional_aged INTEGER DEFAULT 0,          -- 경로우대 (70세 이상 × 100만)
  additional_disabled INTEGER DEFAULT 0,      -- 장애인 (× 200만)
  additional_single_parent INTEGER DEFAULT 0, -- 부녀자/한부모 (50만/100만)

  -- ── 특별소득공제 ──
  insurance_deduction INTEGER DEFAULT 0,      -- 보장성보험료 (본인+부양가족, 최대 100만)
  medical_deduction INTEGER DEFAULT 0,        -- 의료비공제 (총급여 3% 초과분)
  education_deduction INTEGER DEFAULT 0,      -- 교육비공제
  housing_deduction INTEGER DEFAULT 0,        -- 주택자금공제
  donation_deduction INTEGER DEFAULT 0,       -- 기부금공제

  -- ── 기타소득공제 ──
  pension_saving INTEGER DEFAULT 0,           -- 연금저축공제 (최대 400만)
  credit_card_deduction INTEGER DEFAULT 0,    -- 신용카드공제

  -- ── 과세표준 → 세액 ──
  taxable_income INTEGER DEFAULT 0,           -- 과세표준 = 근로소득금액 - 각종 공제
  calculated_tax INTEGER DEFAULT 0,           -- 산출세액 (세율표 적용)

  -- ── 세액공제 ──
  earned_tax_credit INTEGER DEFAULT 0,        -- 근로소득세액공제 (최대 74만)
  child_tax_credit INTEGER DEFAULT 0,         -- 자녀세액공제
  pension_contribution_credit INTEGER DEFAULT 0,  -- 연금보험료 세액공제
  insurance_premium_credit INTEGER DEFAULT 0,     -- 보장성보험료 세액공제 (12%)
  medical_credit INTEGER DEFAULT 0,           -- 의료비 세액공제 (15%)
  education_credit INTEGER DEFAULT 0,         -- 교육비 세액공제 (15%)
  donation_credit INTEGER DEFAULT 0,          -- 기부금 세액공제 (15%/30%)
  standard_tax_credit INTEGER DEFAULT 0,      -- 표준세액공제 (13만)

  -- ── 결정세액 ──
  determined_tax INTEGER DEFAULT 0,           -- 결정세액 = 산출세액 - 세액공제
  determined_local_tax INTEGER DEFAULT 0,     -- 결정 지방소득세 (결정세액 × 10%)

  -- ── 기납부세액 (급여에서 원천징수된 총합) ──
  prepaid_income_tax INTEGER DEFAULT 0,       -- 기납부 소득세
  prepaid_local_tax INTEGER DEFAULT 0,        -- 기납부 지방소득세

  -- ── 차감징수(환급)세액 ──
  refund_income_tax INTEGER DEFAULT 0,        -- 소득세 환급(+)/추징(-)
  refund_local_tax INTEGER DEFAULT 0,         -- 지방소득세 환급(+)/추징(-)
  refund_total INTEGER DEFAULT 0,             -- 총 환급(+)/추징(-) 합계

  -- ── 메타 ──
  notes TEXT,
  calculated_at TEXT,
  confirmed_by INTEGER,
  confirmed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  UNIQUE(employee_id, year)
);

-- 연말정산 공제 증빙 항목 (직원이 제출한 서류 기반)
CREATE TABLE IF NOT EXISTS year_end_deduction_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id INTEGER NOT NULL,
  category TEXT NOT NULL,    -- INSURANCE / MEDICAL / EDUCATION / HOUSING / DONATION / PENSION / CREDIT_CARD
  sub_category TEXT,         -- 세부 분류 (예: medical_self, medical_disabled, education_child)
  description TEXT,          -- 설명 (병원명, 학교명 등)
  amount INTEGER DEFAULT 0,  -- 금액
  deductible_amount INTEGER DEFAULT 0,  -- 공제 인정 금액 (한도 적용 후)
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (settlement_id) REFERENCES year_end_settlements(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_year_end_settlements_emp_year ON year_end_settlements(employee_id, year);
CREATE INDEX IF NOT EXISTS idx_year_end_deduction_items_sid ON year_end_deduction_items(settlement_id);
