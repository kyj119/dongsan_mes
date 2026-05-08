-- 통합 메시지 발송 시스템: kakao_send_logs에 channel 컬럼 추가
-- 기존 데이터는 모두 'kakao'로 처리
ALTER TABLE kakao_send_logs ADD COLUMN channel TEXT DEFAULT 'kakao';

CREATE INDEX IF NOT EXISTS idx_ksl_channel ON kakao_send_logs(channel);
