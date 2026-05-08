-- 사용자가 확인한 4구역 평면도로 재설정
-- SVG 900×580 픽셀 좌표 → % 변환 적용
-- 기존 6구역 삭제 (equipment.zone_id → NULL, inventory_locations.zone_id → NULL)
DELETE FROM facility_zones;

INSERT INTO facility_zones (name, description, color, sort_order, bounds) VALUES
  ('전사출력실', '전사 프린터 — 깃발, 가로등배너',        '#3B82F6', 1, '{"x":4,"y":17,"width":25,"height":54}'),
  ('출력실',     '솔벤트/래핑/플렉스 복합 출력 + 재단',   '#10B981', 2, '{"x":34,"y":24,"width":38,"height":47}'),
  ('UV실',       'UV/솔벤트 3.2m 대형 출력',              '#F97316', 3, '{"x":80,"y":17,"width":18,"height":54}'),
  ('현수막실',   '현수막 전용 출력 + 미싱 (11대)',         '#8B5CF6', 4, '{"x":34,"y":78,"width":63,"height":19}');
