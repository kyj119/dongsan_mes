-- Migration 0386: IA 편집기 단일 가공 렌더잡 (Export-first P2)
-- spec: docs/superpowers/specs/2026-06-25-ia-editor-eps-export.md §5.1
-- 주문 없이 단일 그룹을 ProcessOrderItem.jsx로 가공(EPS/DXF/JPG) → R2 → 브라우저 다운로드.
--   status: queued(사용자 요청) → rendering(에이전트 claim) → done | error
--   result_json = {eps_r2, dxf_r2, jpg_r2, jpg_base64, width_cm, height_cm}
-- entity_id 격리 + 멱등(IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS ia_process_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL,          -- ai_analysis_requests.id (소스 .ai)
  group_index INTEGER NOT NULL,          -- 가공할 그룹/아트보드 인덱스
  params_json TEXT NOT NULL,             -- {target_w_cm,target_h_cm,finishing,trim,rotate90}
  status TEXT NOT NULL DEFAULT 'queued', -- queued|rendering|done|error
  result_json TEXT,                      -- {eps_r2,dxf_r2,jpg_r2,jpg_base64,width_cm,height_cm}
  error_message TEXT,
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ia_process_jobs_status ON ia_process_jobs(status);
