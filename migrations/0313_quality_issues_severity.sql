-- #403/#406: quality_issues.severity 컬럼 추가
-- 코드(cards/lifecycle.ts:165 자동 'MEDIUM', :492 불량접수 body)가 severity를 INSERT하나
-- 스키마에 부재 → prepare 단계 throw → 불량접수/불량동반 상태전환 100% 500.
-- prod·local 둘 다 미존재 확인(2026-06-16, PRAGMA) → 신규 ALTER 모든 환경 안전.
ALTER TABLE quality_issues ADD COLUMN severity TEXT DEFAULT 'MEDIUM';
