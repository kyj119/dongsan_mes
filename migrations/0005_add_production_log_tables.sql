-- Migration 0005: Add production log tables
-- Created: 2026-02-12
-- Description: Production logs, work records, and quality control

-- Production logs (일일 생산 일지)
CREATE TABLE IF NOT EXISTS production_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_date DATE NOT NULL,                    -- 일지 작성 날짜
  shift TEXT NOT NULL DEFAULT 'DAY',         -- 근무 조 (DAY, NIGHT)
  weather TEXT,                              -- 날씨 (선택)
  temperature INTEGER,                       -- 온도 (선택)
  humidity INTEGER,                          -- 습도 (선택)
  supervisor_id INTEGER,                     -- 감독자 (직원 ID)
  notes TEXT,                                -- 특이사항/비고
  created_by INTEGER NOT NULL,               -- 작성자 (user_id)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supervisor_id) REFERENCES employees(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE(log_date, shift)                    -- 날짜+근무조 조합 유일
);

-- Work records (카드별 작업 기록)
CREATE TABLE IF NOT EXISTS work_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  production_log_id INTEGER NOT NULL,        -- 생산 일지 ID
  card_id INTEGER NOT NULL,                  -- 현장 카드 ID
  employee_id INTEGER NOT NULL,              -- 작업자 ID
  work_type TEXT NOT NULL,                   -- 작업 유형 (PRINT, POST_PROCESS, QC, PACKING)
  start_time DATETIME NOT NULL,              -- 작업 시작 시간
  end_time DATETIME,                         -- 작업 종료 시간
  work_hours REAL,                           -- 작업 시간 (시간 단위)
  quantity_completed INTEGER DEFAULT 0,      -- 완료 수량
  quantity_target INTEGER,                   -- 목표 수량
  status TEXT DEFAULT 'IN_PROGRESS',         -- 상태 (IN_PROGRESS, COMPLETED, PAUSED)
  notes TEXT,                                -- 작업 메모
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (production_log_id) REFERENCES production_logs(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

-- Quality issues (불량/재작업 기록)
CREATE TABLE IF NOT EXISTS quality_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_record_id INTEGER,                    -- 작업 기록 ID (선택)
  card_id INTEGER NOT NULL,                  -- 현장 카드 ID
  issue_type TEXT NOT NULL,                  -- 불량 유형 (DEFECT, REWORK, DAMAGE, OTHER)
  defect_category TEXT,                      -- 불량 분류 (COLOR, ALIGNMENT, CUT, MATERIAL, etc.)
  quantity_defect INTEGER NOT NULL DEFAULT 1,-- 불량 수량
  description TEXT NOT NULL,                 -- 불량 상세 설명
  root_cause TEXT,                           -- 원인 분석
  corrective_action TEXT,                    -- 조치 사항
  status TEXT DEFAULT 'REPORTED',            -- 상태 (REPORTED, UNDER_REVIEW, RESOLVED, REWORK_REQUIRED)
  rework_card_id INTEGER,                    -- 재작업 카드 ID (재작업인 경우)
  reported_by INTEGER NOT NULL,              -- 보고자 (employee_id)
  reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_by INTEGER,                       -- 해결자 (employee_id)
  resolved_at DATETIME,
  cost_impact REAL DEFAULT 0,                -- 비용 영향
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (work_record_id) REFERENCES work_records(id) ON DELETE SET NULL,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (rework_card_id) REFERENCES cards(id) ON DELETE SET NULL,
  FOREIGN KEY (reported_by) REFERENCES employees(id),
  FOREIGN KEY (resolved_by) REFERENCES employees(id)
);

-- Production metrics (생산 실적 요약)
CREATE TABLE IF NOT EXISTS production_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_date DATE NOT NULL,                 -- 집계 날짜
  shift TEXT NOT NULL DEFAULT 'DAY',         -- 근무 조
  total_cards_processed INTEGER DEFAULT 0,   -- 처리된 카드 수
  total_work_hours REAL DEFAULT 0,           -- 총 작업 시간
  total_quantity_completed INTEGER DEFAULT 0,-- 총 완료 수량
  total_defects INTEGER DEFAULT 0,           -- 총 불량 수량
  defect_rate REAL DEFAULT 0,                -- 불량률 (%)
  productivity_score REAL DEFAULT 0,         -- 생산성 점수
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(metric_date, shift)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_production_logs_date ON production_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_production_logs_supervisor ON production_logs(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_work_records_log ON work_records(production_log_id);
CREATE INDEX IF NOT EXISTS idx_work_records_card ON work_records(card_id);
CREATE INDEX IF NOT EXISTS idx_work_records_employee ON work_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_records_status ON work_records(status);
CREATE INDEX IF NOT EXISTS idx_quality_issues_card ON quality_issues(card_id);
CREATE INDEX IF NOT EXISTS idx_quality_issues_type ON quality_issues(issue_type);
CREATE INDEX IF NOT EXISTS idx_quality_issues_status ON quality_issues(status);
CREATE INDEX IF NOT EXISTS idx_production_metrics_date ON production_metrics(metric_date);
