-- ============================================================================
-- Migration 0384: 연차 사용촉진 통지 이력 (근로기준법 제61조)
-- 목적: 1·2차 통지·도달·회신 기록 = 미사용수당 지급의무 면제 입증 정본(3년 보존).
--   적법 촉진 이행분만 소멸(수당 면제), 미이행분은 수당 산정 대상. 소멸 sweep이 이 표를 참조.
-- ============================================================================

CREATE TABLE IF NOT EXISTS leave_promotion_notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  entity_id INTEGER NOT NULL DEFAULT 1,
  grant_id INTEGER,                            -- 대상 grant (NULL=연도 일괄)
  fiscal_year INTEGER NOT NULL,               -- 입사일 기준 부여 연도
  source TEXT NOT NULL,                        -- ANNUAL / MONTHLY_A / MONTHLY_B (촉진 트랙)
  stage TEXT NOT NULL,                         -- FIRST / RESPONSE / SECOND
  remaining_days REAL NOT NULL DEFAULT 0,      -- 통지 시점 잔여
  notice_date TEXT NOT NULL,                   -- 발송일 YYYY-MM-DD
  delivered_at TEXT,                           -- 도달일(도달주의 — 면제판정 기준)
  read_at TEXT,                                -- 열람
  designated_use_date TEXT,                    -- 지정 사용일
  channel TEXT,                                -- KAKAO / SMS / EMAIL / PAPER
  message_ref TEXT,                            -- 카톡 접수번호·이메일 id 등
  status TEXT NOT NULL DEFAULT 'SENT',         -- SENT / DELIVERED / ACKED / FAILED
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (grant_id) REFERENCES leave_grants(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_promo_emp ON leave_promotion_notices(employee_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_promo_entity ON leave_promotion_notices(entity_id);
-- 멱등: 같은 (employee, fiscal_year, source, stage, grant) 중복 통지 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_unique
  ON leave_promotion_notices(employee_id, fiscal_year, source, stage, COALESCE(grant_id, 0));
