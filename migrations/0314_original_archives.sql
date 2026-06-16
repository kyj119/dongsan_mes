-- Migration 0314: 시안 원본 아카이브 (IA 편집·네스팅·접수 워크벤치 P1)
-- spec: docs/superpowers/specs/2026-06-16-ia-editor-nesting-intake.md §6
-- 현행 IA는 가공 후 고객 원본을 임시폴더 처리 후 폐기(Program.cs:1760).
-- → 원본을 별도 트리(Z:\원본\[카테고리]\YYYY\MM\DD\[주문번호]\)에 영구 보존하고 여기 기록.
--   작업 EPS는 기존 auto_process_jobs.output_eps_path/saved_path(Z:\DESIGN\...) 사용.

CREATE TABLE IF NOT EXISTS original_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,                     -- 연결 주문
  ai_analysis_id INTEGER,               -- 분석/썸네일 연결
  order_ai_file_id INTEGER,             -- 1:N 파일(order_ai_files, 0254) 연결 (있으면)
  archive_path TEXT NOT NULL,           -- Z:\원본\[카테고리]\YYYY\MM\DD\[주문번호]\[파일명].[ext]
  original_filename TEXT,               -- 고객 제공 원래 파일명 (참조)
  file_ext TEXT,                        -- ai|eps|pdf
  thumbnail_base64 TEXT,                -- 보드 표시용 (groups_json에서 복사 가능)
  status TEXT NOT NULL DEFAULT 'archived' CHECK(status IN ('archived','failed')),
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_original_archives_order ON original_archives(order_id);
CREATE INDEX IF NOT EXISTS idx_original_archives_analysis ON original_archives(ai_analysis_id);
CREATE INDEX IF NOT EXISTS idx_original_archives_entity ON original_archives(entity_id);
