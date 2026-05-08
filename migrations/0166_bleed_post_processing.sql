-- ============================================================================
-- Migration 0166: OFFSET parameter_schema 확장 (BLEED 통합)
-- BLEED(도련) 기능을 OFFSET에 통합. method/cut_line 파라미터 추가.
-- ============================================================================

-- OFFSET의 parameter_schema에 method/cut_line 필드 추가
UPDATE post_processing_options
SET parameter_schema = '{"fields":[{"key":"offset_top","label":"상단(mm)","type":"number","default":3,"min":0,"max":20,"step":0.5},{"key":"offset_bottom","label":"하단(mm)","type":"number","default":3,"min":0,"max":20,"step":0.5},{"key":"offset_left","label":"좌측(mm)","type":"number","default":3,"min":0,"max":20,"step":0.5},{"key":"offset_right","label":"우측(mm)","type":"number","default":3,"min":0,"max":20,"step":0.5},{"key":"method","label":"확장방식","type":"select","options":["edge_strip","scale"],"default":"edge_strip"},{"key":"cut_line","label":"재단선(M100)","type":"boolean","default":true}]}'
WHERE option_code = 'OFFSET';

-- BLEED 옵션이 존재하면 비활성화 (데이터 보존, 기능은 OFFSET에 통합)
UPDATE post_processing_options SET is_active = 0 WHERE option_code = 'BLEED';
