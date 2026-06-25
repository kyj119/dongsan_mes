-- Migration 0390: 장비 배치도 회전 (공장 배치도 P2 후속)
-- 배치도에서 장비 핀을 90° 단위로 회전(0/90/180/270). 물리적 설치 방향 반영.
-- (SQLite ALTER ADD COLUMN은 IF NOT EXISTS 미지원 — 신규 컬럼이라 1회 적용)
ALTER TABLE equipment ADD COLUMN layout_rotation INTEGER NOT NULL DEFAULT 0;
