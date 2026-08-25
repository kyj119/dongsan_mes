-- 0543: 대량 발송 수신자별 이력 — 발송 피로도 가드의 데이터 소스.
--
-- ★왜 새 테이블인가: 대량 발송은 `kakao_send_logs` 에 **대표 로그 1건**만 남긴다
--   (`receiver_num = 'BULK(60)'` — messages.ts·kakao.ts 3곳). 즉 **누구에게 보냈는지가 저장되지 않는다.**
--   그래서 "최근 N일 안에 이미 받은 사람은 빼자"는 피로도 가드가 볼 데이터가 아예 없었다.
--   개별 발송(1:1)만 번호가 남아 있어, 정작 막아야 할 판촉 대량 발송은 몇 번을 보내도 걸리지 않는다.
--
-- 왜 `kakao_send_logs` 에 개별 행을 넣지 않는가:
--   ① 그 테이블은 본문(content·alt_content)을 함께 저장한다 → 800명 발송이 본문 800벌이 되어 D1 이 팽창한다
--      (base64 저장 금지와 같은 취지).
--   ② 발송 이력 화면이 한 번의 대량 발송으로 800줄이 되어 못 쓰게 된다.
--   ⇒ 본문 없이 **번호·대상·상태만** 담는 경량 테이블로 분리하고, 이력 화면은 기존 대표 로그를 계속 쓴다.
--
-- 부수 효과: "누가 못 받았는지 영원히 알 수 없다"(messages.ts #574 주석)가 함께 풀린다.
--   광고 발송 분쟁에서 "누구에게 보냈는가"의 증거로도 쓰인다.
--
-- `phone_norm` 은 **하이픈·공백을 제거한 형태로 저장**한다. 기존 로그는 `01088123819` 와
-- `010-8812-3819` 가 섞여 있어 조회 때마다 REPLACE 를 걸어야 했고 그러면 인덱스를 타지 못한다.
-- log_id 는 kakao_send_logs.id 를 가리키지만 **FK 는 걸지 않는다** — D1 은 컬럼 제거가 불가해
-- 제약을 늘리면 되돌리기 어렵고, 대표 로그가 지워져도 이력 자체는 남는 편이 낫다.

CREATE TABLE IF NOT EXISTS message_send_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id INTEGER,                                  -- kakao_send_logs.id (대표 로그, 참조만)
  phone_norm TEXT NOT NULL,                        -- 하이픈·공백 제거 번호
  client_id INTEGER,
  receiver_name TEXT,
  channel TEXT NOT NULL DEFAULT 'sms',             -- sms | lms | mms | kakao
  message_type TEXT NOT NULL DEFAULT 'INFO',       -- INFO | AD (광고 발송 추적)
  status TEXT NOT NULL DEFAULT 'SUCCESS',          -- SUCCESS | FAILED
  entity_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 피로도 조회의 주 경로: 번호 + 기간
CREATE INDEX IF NOT EXISTS idx_msr_phone_created
  ON message_send_recipients(phone_norm, created_at);
-- 대표 로그에서 수신자 목록을 펼칠 때
CREATE INDEX IF NOT EXISTS idx_msr_log ON message_send_recipients(log_id);
