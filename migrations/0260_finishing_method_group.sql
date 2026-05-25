-- ============================================================================
-- Migration 0260: finishing_methods/presets에 method_group 추가
-- output=현수막 마감, transfer=전사 봉제 — UI에서 분리 표시
-- ============================================================================

ALTER TABLE finishing_methods ADD COLUMN method_group TEXT DEFAULT 'output';
ALTER TABLE finishing_presets ADD COLUMN method_group TEXT DEFAULT 'output';

-- 전사 봉제 방식 그룹 설정
UPDATE finishing_methods SET method_group = 'transfer' WHERE name IN ('쌍침', '오바', '봉미싱');

-- 전사 봉제 프리셋 그룹 설정
UPDATE finishing_presets SET method_group = 'transfer'
  WHERE name IN ('1면쌍침', '2면쌍침', '3면쌍침', '1면쌍침2면오바', '상단봉미싱+양쪽막음');
