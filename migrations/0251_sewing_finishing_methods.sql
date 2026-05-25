-- ============================================================================
-- Migration 0251: 봉제 마감 방식 추가 (전사/깃발 작업지시서 통합)
-- 쌍침, 오바를 finishing_methods에 추가 + 봉제 프리셋 등록
-- ============================================================================

-- 1. finishing_methods에 봉제 방식 추가 (margin_cm=0: 전사 봉제는 인쇄 규격에 영향 없음)
INSERT OR IGNORE INTO finishing_methods (name, margin_cm, description, sort_order, is_active) VALUES
  ('쌍침', 0, '쌍바늘 박음질 (더블 스티치)', 10, 1),
  ('오바', 0, '오버로크 봉제 (가장자리 감침)', 11, 1),
  ('봉미싱', 0, '봉 삽입 미싱 처리', 12, 1);

-- 2. finishing_presets에 봉제 조합 프리셋 추가
INSERT OR IGNORE INTO finishing_presets (name, config, sort_order, is_active) VALUES
  ('1면쌍침', '{"top":"쌍침"}', 10, 1),
  ('2면쌍침', '{"top":"쌍침","left":"쌍침"}', 11, 1),
  ('3면쌍침', '{"top":"쌍침","left":"쌍침","right":"쌍침"}', 12, 1),
  ('1면쌍침2면오바', '{"top":"쌍침","left":"오바","right":"오바"}', 13, 1),
  ('상단봉미싱+양쪽막음', '{"top":"봉미싱","left":"열재단","right":"열재단"}', 14, 1);
