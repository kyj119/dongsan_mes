-- 오프셋 후가공: 단일 거리 → 상하좌우 개별 방향
-- 기존 offset_distance (사방 동일) → offset_top/bottom/left/right (방향별)

UPDATE post_processing_options
SET parameter_schema = '{"fields":[{"key":"offset_top","label":"상단","type":"number","unit":"mm","default":0,"min":0,"max":20},{"key":"offset_bottom","label":"하단","type":"number","unit":"mm","default":0,"min":0,"max":20},{"key":"offset_left","label":"좌측","type":"number","unit":"mm","default":0,"min":0,"max":20},{"key":"offset_right","label":"우측","type":"number","unit":"mm","default":0,"min":0,"max":20}]}'
WHERE option_code = 'OFFSET';
