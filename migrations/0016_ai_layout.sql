-- ============================================================================
-- Migration 0016: AI 레이아웃 처리 요청 테이블
-- 그룹 분석 결과를 기반으로 bin packing + 돔보 마크 + 재단선 파일 생성 작업 관리
-- ============================================================================

-- 레이아웃 처리 작업 테이블
CREATE TABLE IF NOT EXISTS ai_layout_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL,        -- ai_analysis_requests.id 참조
  mode TEXT NOT NULL,                  -- 'individual' | 'combined'
  status TEXT DEFAULT 'pending',       -- pending/processing/done/error
  result_json TEXT,                    -- JSON: {width_cm, height_cm, output_1_path, output_2_path, thumbnail_base64}
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (analysis_id) REFERENCES ai_analysis_requests(id)
);

CREATE INDEX IF NOT EXISTS idx_ai_layout_status ON ai_layout_requests(status);
CREATE INDEX IF NOT EXISTS idx_ai_layout_analysis_id ON ai_layout_requests(analysis_id);

-- orders 테이블에 레이아웃 결과 컬럼 추가
ALTER TABLE orders ADD COLUMN layout_id INTEGER DEFAULT NULL;
ALTER TABLE orders ADD COLUMN layout_output_1 TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN layout_output_2 TEXT DEFAULT NULL;
