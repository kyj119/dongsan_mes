-- Migration 0316: 시트 네스팅 레이아웃 (IA 편집·네스팅·접수 워크벤치 P3)
-- spec: docs/superpowers/specs/2026-06-16-ia-editor-nesting-intake.md §6·§12
-- 동일 품목 그룹들을 시트(롤/평판)에 자동 배치(shelfBinPack)한 결과를 보존.
--   canvas_json   = {mode:'roll'|'flatbed', preset_w_cm, preset_h_cm, margin_cm, gap_cm, sheet_count}
--   placements_json = [{sheet, group_index, analysis_id, label, x_cm, y_cm, width_cm, height_cm, rotated}]
-- 실제 출력(EPS/DXF/JPG)은 SheetLayout.jsx가 수행(P5). 여기는 좌표·메타만.
CREATE TABLE IF NOT EXISTS sheet_layouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'roll',              -- 'roll'(폭고정·길이가변) | 'flatbed'(고정 W×H)
  canvas_json TEXT NOT NULL,                       -- 시트 규격/모드/여백
  placements_json TEXT NOT NULL DEFAULT '[]',
  item_code TEXT,                                  -- 공통 품목 (D8 동일품목 가드 — P4에서 강화)
  source_analysis_ids TEXT,                        -- 참여 ai_analysis_id 목록(JSON)
  sheet_count INTEGER DEFAULT 1,
  efficiency REAL,                                 -- 자재 효율 0~1
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','rendered','ordered')),
  output_job_id INTEGER,
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sheet_layouts_entity ON sheet_layouts(entity_id);
CREATE INDEX IF NOT EXISTS idx_sheet_layouts_status ON sheet_layouts(status);
