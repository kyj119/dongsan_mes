-- Migration 0317: IA 편집기 캔버스 검수(Konva) — 전체 렌더 + 그룹 절대좌표 보존
-- spec: docs/superpowers/specs/2026-06-16-ia-editor-nesting-intake.md (canvas-editor 피벗)
-- ExtractGroups가 만드는 전체 canvas PNG(현재 OpenCV 검증용으로만 쓰고 버림)을 분석 결과에 영속화.
--   canvas_json = {"render_base64":"<PNG base64>", "w_pt":,"h_pt":,"w_mm":,"h_mm":}
--   그룹별 절대좌표(canvas_x/y/w/h_pt)는 기존 groups_json[i]에 인라인 추가(스키마 변경 불필요, 하위호환).
-- ⚠️ ALTER ADD COLUMN은 비멱등 — 재적용 금지(중복 컬럼 에러). 신규 1회만 적용.
ALTER TABLE ai_analysis_requests ADD COLUMN canvas_json TEXT;
