-- 연락처 그룹 (메시지 대상 그룹) — 정적(수동 지정) 방식
--
-- 목적: 거래처 3,700+ 건에서 매번 검색해 고르는 대신, 한 번 묶어두고 그룹 선택 한 번으로 발송.
-- 정책:
--  - 거래처는 법인 공유 자산이므로([[project-entity-policy]]) 그룹도 entity_id 없이 전사 공유.
--  - billing_groups(합산청구용)와 용도가 다르다 → 별도 테이블. 이름 혼동 방지로 contact_* 사용.
--  - member_type으로 거래처·직원 겸용 구조. 1차 UI는 거래처(CLIENT)만 노출.
--  - 멤버는 참조만 저장(연락처 스냅샷 금지) → 거래처 번호가 바뀌면 발송 시점 최신값이 쓰인다.

CREATE TABLE IF NOT EXISTS contact_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_groups_name ON contact_groups(name);

CREATE TABLE IF NOT EXISTS contact_group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  member_type TEXT NOT NULL DEFAULT 'CLIENT',   -- CLIENT | EMPLOYEE
  member_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (group_id) REFERENCES contact_groups(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_group_members_uniq
  ON contact_group_members(group_id, member_type, member_id);
CREATE INDEX IF NOT EXISTS idx_contact_group_members_group ON contact_group_members(group_id);
