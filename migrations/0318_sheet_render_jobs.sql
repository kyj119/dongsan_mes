-- Migration 0318: 시트 네스팅 독립 렌더잡 (P5 출력) — 에이전트 렌더잡 폴링
-- spec: docs/superpowers/specs/2026-06-16-ia-editor-nesting-intake.md §5.5·P5
-- ia-editor 네스팅(sheet_layouts)을 주문 없이 직접 SheetLayout.jsx로 렌더(EPS/DXF/JPG).
--   render_status: none → queued(사용자 출력요청) → rendering(에이전트 claim) → done | error
--   render_result_json = {eps_path, dxf_path, jpg_path, jpg_base64, width_cm, height_cm, warnings}
-- ⚠️ ALTER ADD COLUMN 비멱등 — 재적용 금지(중복 컬럼). 신규 1회만.
ALTER TABLE sheet_layouts ADD COLUMN render_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE sheet_layouts ADD COLUMN render_result_json TEXT;
ALTER TABLE sheet_layouts ADD COLUMN render_error TEXT;

CREATE INDEX IF NOT EXISTS idx_sheet_layouts_render ON sheet_layouts(render_status);
