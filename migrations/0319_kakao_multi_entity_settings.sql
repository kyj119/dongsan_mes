-- 0319: 바로빌 알림톡 멀티계정 — 법인별 설정 시드 (entity_settings)
-- (리넘버 2026-06-17: ia-editor 브랜치가 0317/0318 선점하여 0317→0319)
--
-- 검증 결과(2026-06-16): 파트너 단일 CERTKEY(전역 env) + 법인별 corpNum(entities) +
-- 법인별 SenderID(바로빌 연동회원 ID) 필수. 동산 DONGSAN / 선명 sunm2596.
-- 채널ID로 ID 추측 불가(동산: 채널 @실사출력_깃발_베너_현수막 ↔ ID DONGSAN).
--
-- 동산(entity 1)은 전역 settings fallback으로 현재 동작 유지 → 별도 시드하지 않음.
-- 선명(entity 2)만 명시 시드. kakao_sender_num(선명 발신번호)은 미확인 → 연동 후 UI/추가 시드.
-- (알림톡 SmsReply=N 발송엔 발신번호 불필요하나, MES 발송 라우트는 senderNum 체크가 있어
--  선명 MES 발송 전 발신번호 입력 필요)

INSERT INTO entity_settings (entity_id, setting_key, setting_value) VALUES
  (2, 'barobill_sender_id', 'sunm2596'),
  (2, 'kakao_channel_id', '@sunm2596'),
  (2, 'kakao_enabled', '1'),
  (2, 'kakao_alt_send_type', 'N')
ON CONFLICT(entity_id, setting_key) DO UPDATE SET setting_value = excluded.setting_value;
