-- 0453: 품목 검색 키워드(별칭) — 2026-07-10
-- 검색 매칭 전용(화면 표시 안 함). 쉼표 구분 다중 키워드 (예: "운산1, 운산코팅").
-- 용도: 품명 정식명 전환 시 현장 호칭·공급사명 등으로 검색 연속성 보장.
-- ⚠️ ALTER ADD COLUMN은 멱등 아님 — 1회만 적용.
ALTER TABLE items ADD COLUMN search_keywords TEXT;
