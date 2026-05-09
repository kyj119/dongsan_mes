-- Phase 1.2: 멀티사업자 이메일 발신 분리
-- entity별 발신 주소/이름을 설정하여 거래명세서/원장 이메일이 각 사업자 도메인으로 발송됨
--
-- email_from_address: 예) "billing@dongsan.co.kr" (NULL이면 글로벌 settings.email_from_address fallback)
-- email_from_name:    예) "동산현수막" (NULL이면 entity.name 사용)

ALTER TABLE entities ADD COLUMN email_from_address TEXT;
ALTER TABLE entities ADD COLUMN email_from_name TEXT;
