-- 0151: 미사용 테이블 삭제
-- user_sessions: JWT 기반 인증 사용 중, 세션 테이블 미사용
-- payroll_details: 급여 구조 단순화로 미사용 (payroll_records로 대체)
-- production_metrics: production_logs 집계로 대체

DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS payroll_details;
DROP TABLE IF EXISTS production_metrics;
