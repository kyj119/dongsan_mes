-- 소재 ↔ 원자재 그룹 M:N 연결 테이블
-- 1개 소재가 여러 원자재 그룹을 사용 (예: 솔벤시트 = 시트 + 코팅지)
-- 1개 원자재 그룹이 여러 소재에 연결 (예: 코팅지 → 솔벤시트, 그레이시트, 랩핑시트)
CREATE TABLE IF NOT EXISTS media_material_groups (
  media_id    INTEGER NOT NULL REFERENCES print_media(id) ON DELETE CASCADE,
  item_group  TEXT NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (media_id, item_group)
);

CREATE INDEX IF NOT EXISTS idx_mmg_item_group ON media_material_groups(item_group);
