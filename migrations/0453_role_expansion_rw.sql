-- 0453: 사용자 역할 확장(4→8) + 읽기/쓰기(can_edit) 권한 분리
-- 설계: docs/superpowers/specs/2026-07-10-role-expansion-rw-permissions.md
--
-- ⚠️ users.role CHECK(0001) 재빌드 불가 실증(2026-07-10):
--   wrangler execute --file 이 FK 를 강제(PRAGMA foreign_keys=OFF 도 트랜잭션 래핑으로 무력) →
--   orders/quotations/status_history 의 ON DELETE RESTRICT 자식 때문에 DROP TABLE users 실패.
--   → users 는 재빌드 대신 ADD COLUMN job_role(무 CHECK) 사용. 로그인이 COALESCE(job_role, role) 를 JWT.role 로 발급.
--
-- role_page_permissions 는 리프 테이블(참조하는 자식 없음)이라 재빌드 안전.
--   CHECK 제거(app-level ROLE_SET 검증) + can_edit 컬럼 추가.

-- ── 1. users.job_role (확장 역할 저장; 무 CHECK, FK 무관 → ADD COLUMN 안전) ──
ALTER TABLE users ADD COLUMN job_role TEXT;
UPDATE users SET job_role = role WHERE job_role IS NULL;

-- ── 2. role_page_permissions 재빌드: role CHECK 제거 + can_edit 추가 ──
--   기존 행 백필: can_edit = can_access (열람 가능하던 역할은 편집도 유지 → 현행 무변).
CREATE TABLE role_page_permissions_new (
  role TEXT NOT NULL,
  page_key TEXT NOT NULL,
  can_access INTEGER NOT NULL DEFAULT 0,
  can_edit INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  PRIMARY KEY (role, page_key),
  FOREIGN KEY (page_key) REFERENCES permission_pages(page_key) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO role_page_permissions_new (role, page_key, can_access, can_edit, updated_at, updated_by)
  SELECT role, page_key, can_access, can_access, updated_at, updated_by FROM role_page_permissions;

DROP TABLE role_page_permissions;
ALTER TABLE role_page_permissions_new RENAME TO role_page_permissions;

CREATE INDEX IF NOT EXISTS idx_rpp_role_access ON role_page_permissions(role, can_access);
CREATE INDEX IF NOT EXISTS idx_rpp_role_edit ON role_page_permissions(role, can_edit);

-- ── 3. 신규 4역할 기본 매트릭스 seed (관리자가 /permissions 에서 미세조정 가능) ──
--   can_access=1 열람, can_edit=1 편집. 전 신규역할 공통: /dashboard(랜딩)·/approvals(전자결재 참여).
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access, can_edit) VALUES
  -- 경리 (ACCOUNTANT): 재무 전반 편집 + 세무/입금 + 거래처 열람
  ('ACCOUNTANT','/dashboard',1,0),
  ('ACCOUNTANT','/approvals',1,1),
  ('ACCOUNTANT','/clients',1,0),
  ('ACCOUNTANT','/card-expenses',1,1),
  ('ACCOUNTANT','/accounting',1,1),
  ('ACCOUNTANT','/ledger',1,1),
  ('ACCOUNTANT','/tax-invoices',1,1),
  ('ACCOUNTANT','/bank',1,1),
  ('ACCOUNTANT','/cash-schedule',1,1),
  ('ACCOUNTANT','/payment-requests',1,1),
  ('ACCOUNTANT','/vat-reports',1,1),
  ('ACCOUNTANT','/financial-reports',1,0),
  ('ACCOUNTANT','/reports',1,0),
  -- 영업 (SALES): 주문·견적·거래처·클레임 편집 + 단가/출고 열람
  ('SALES','/dashboard',1,0),
  ('SALES','/approvals',1,1),
  ('SALES','/orders',1,1),
  ('SALES','/quotations',1,1),
  ('SALES','/clients',1,1),
  ('SALES','/quality',1,1),
  ('SALES','/price-list',1,0),
  ('SALES','/shipments',1,0),
  -- 후가공 (FINISHING): 현장 카드·후가공 편집 + 생산현황 열람
  ('FINISHING','/dashboard',1,0),
  ('FINISHING','/approvals',1,1),
  ('FINISHING','/cards',1,1),
  ('FINISHING','/post-processing',1,1),
  ('FINISHING','/production-board',1,0),
  ('FINISHING','/production',1,0),
  ('FINISHING','/production-daily',1,0),
  -- 배송 (SHIPPING): 출고/배송/검수/합포장 편집 + 카드 열람
  ('SHIPPING','/dashboard',1,0),
  ('SHIPPING','/approvals',1,1),
  ('SHIPPING','/shipments',1,1),
  ('SHIPPING','/shipments-dashboard',1,1),
  ('SHIPPING','/pack',1,1),
  ('SHIPPING','/cards',1,0),
  ('SHIPPING','/delivery-analytics',1,0);
