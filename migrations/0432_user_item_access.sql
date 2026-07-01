-- 0432_user_item_access.sql
-- C2: 사용자별 사용품목 분리 (item_group 단위 allowlist).
-- 규칙 없는 사용자=전체 노출(하위호환). 규칙 있으면 허용 그룹 + 그룹없는 품목(제품)만.
-- 적용 범위=주문서 품목검색(for_user=1). 관리=사용자 관리 페이지(ADMIN).
CREATE TABLE IF NOT EXISTS user_item_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  item_group TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, item_group)
);
CREATE INDEX IF NOT EXISTS idx_user_item_access_user ON user_item_access(user_id);
