-- ============================================================================
-- Migration 0253: 전사 출력 방식 + 원단(소재) 등록
-- 전사 print_method + 매쉬/폰지/사틴 print_media + 연결
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 전사 출력 방식 (print_methods)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO print_methods (name, code, card_group, price_per_sqm, sort_order, is_active) VALUES
  ('전사', 'TRANSFER', 'TRANSFER_FLAG', 0, 5, 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 전사용 원단 (print_media) — 원단 = 소재
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO print_media (name, code, media_type, price_per_unit, unit, media_group, group_sort, sort_order, is_active) VALUES
  ('매쉬', 'MESH', 'ROLL', 0, '㎡', '전사', 1, 20, 1),
  ('폰지', 'PONGE', 'ROLL', 0, '㎡', '전사', 1, 21, 1),
  ('사틴', 'SATIN', 'ROLL', 0, '㎡', '전사', 1, 22, 1),
  ('옥스포드', 'OXFORD', 'ROLL', 0, '㎡', '전사', 1, 23, 1),
  ('트로피컬', 'TROPICAL', 'ROLL', 0, '㎡', '전사', 1, 24, 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 전사 ↔ 원단 연결 (print_method_media)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO print_method_media (print_method_id, print_media_id)
  SELECT pm.id, pmed.id
  FROM print_methods pm, print_media pmed
  WHERE pm.code = 'TRANSFER'
    AND pmed.code IN ('MESH', 'PONGE', 'SATIN', 'OXFORD', 'TROPICAL');
