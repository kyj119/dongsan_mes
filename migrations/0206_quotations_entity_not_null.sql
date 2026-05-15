-- quotations.entity_id NULL → 1 보정
-- SQLite는 기존 컬럼에 NOT NULL 추가 불가 → NULL 데이터 보정 + 앱 레벨 방어
UPDATE quotations SET entity_id = 1 WHERE entity_id IS NULL;
