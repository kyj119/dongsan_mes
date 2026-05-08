-- 0136: 페이지별 역할 권한 매트릭스 (DB 기반 권한 관리)
-- 설계: .claude/plans/2026-04-16-permission-management-system.md
-- ADMIN은 항상 모든 페이지 통과 (미들웨어에서 처리). 나머지 역할은 이 테이블 기준.

CREATE TABLE IF NOT EXISTS permission_pages (
  page_key TEXT PRIMARY KEY,        -- 예: '/orders', '/receiving'
  page_label TEXT NOT NULL,          -- 표시명: '주문 관리'
  page_section TEXT NOT NULL,        -- 사이드바 그룹: '영업', '생산', '관리' 등
  page_icon TEXT,                    -- FontAwesome 클래스: 'fa-file-alt'
  badge_id TEXT,                     -- 사이드바 배지 ID (있는 경우)
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,       -- 0이면 사이드바 숨김
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_page_permissions (
  role TEXT NOT NULL CHECK(role IN ('ADMIN','MANAGER','DESIGNER','OPERATOR')),
  page_key TEXT NOT NULL,
  can_access INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  PRIMARY KEY (role, page_key),
  FOREIGN KEY (page_key) REFERENCES permission_pages(page_key) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_rpp_role_access ON role_page_permissions(role, can_access);
