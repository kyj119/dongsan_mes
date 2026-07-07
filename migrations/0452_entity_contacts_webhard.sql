-- 0452: 회사정보 확장 — 웹하드 주소(entities.webhard_url) + 부서별 연락처(entity_contacts)
-- 단가표/전달 문서 인쇄 헤더에 부서별 연락처·웹하드 주소를 표시(entity별 분리).
-- 직인(stamp_base64)은 0152에 이미 존재 → 스키마 변경 없음.
-- hard FK 대신 plain INTEGER + 앱단 검증(제거 유연성 · FK 컬럼 영구제거 불가 함정 회피).

ALTER TABLE entities ADD COLUMN webhard_url TEXT;

CREATE TABLE IF NOT EXISTS entity_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL,
  department TEXT NOT NULL,   -- 부서명(제작부/영업부 등)
  person_name TEXT,
  phone TEXT,
  fax TEXT,
  sort_order INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_entity_contacts_entity ON entity_contacts(entity_id);
