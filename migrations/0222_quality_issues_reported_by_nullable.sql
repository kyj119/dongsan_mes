-- #85: quality_issues.reported_by NULL 허용 (시스템 자동 감지 = NULL)
-- SQLite는 NOT NULL 제약을 ALTER로 변경 불가하므로 테이블 재생성

CREATE TABLE quality_issues_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_record_id INTEGER,
  card_id INTEGER NOT NULL,
  issue_type TEXT NOT NULL DEFAULT 'DEFECT',
  defect_category TEXT DEFAULT 'OTHER',
  quantity_defect INTEGER DEFAULT 1,
  description TEXT NOT NULL,
  root_cause TEXT,
  corrective_action TEXT,
  status TEXT NOT NULL DEFAULT 'REPORTED',
  rework_card_id INTEGER,
  reported_by INTEGER,                        -- NULL = 시스템 자동 감지
  reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_by INTEGER,
  resolved_at DATETIME,
  cost_impact REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  entity_id INTEGER NOT NULL DEFAULT 1,
  defect_code_id INTEGER
);

INSERT INTO quality_issues_new
  SELECT id, work_record_id, card_id, issue_type, defect_category, quantity_defect,
    description, root_cause, corrective_action, status, rework_card_id,
    CASE WHEN reported_by = 1 THEN NULL ELSE reported_by END,
    reported_at, resolved_by, resolved_at, cost_impact,
    created_at, updated_at, entity_id, defect_code_id
  FROM quality_issues;

DROP TABLE quality_issues;
ALTER TABLE quality_issues_new RENAME TO quality_issues;

CREATE INDEX IF NOT EXISTS idx_qi_card ON quality_issues(card_id);
CREATE INDEX IF NOT EXISTS idx_qi_status ON quality_issues(status);
CREATE INDEX IF NOT EXISTS idx_qi_entity ON quality_issues(entity_id);
CREATE INDEX IF NOT EXISTS idx_qi_defect_code ON quality_issues(defect_code_id);
