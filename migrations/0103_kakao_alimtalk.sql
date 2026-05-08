-- 카카오 알림톡 발송 이력 테이블
CREATE TABLE IF NOT EXISTS kakao_send_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_num TEXT,                       -- 팝빌 접수번호
  template_code TEXT NOT NULL,            -- 알림톡 템플릿 코드
  send_type TEXT NOT NULL DEFAULT 'ATS',  -- ATS(알림톡), FTS(친구톡)

  -- 수신자 정보
  receiver_num TEXT NOT NULL,             -- 수신 전화번호
  receiver_name TEXT,                     -- 수신자명

  -- 관련 엔티티
  related_type TEXT,                      -- orders, shipments, tax_invoices, ledger
  related_id INTEGER,                     -- 관련 엔티티 ID
  client_id INTEGER REFERENCES clients(id),

  -- 발송 내용
  content TEXT,                           -- 발송 메시지 본문
  alt_content TEXT,                       -- 대체문자 내용

  -- 결과
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, SUCCESS, FAILED, ALT_SENT
  result_code TEXT,                       -- 팝빌 결과코드
  result_message TEXT,                    -- 팝빌 결과메시지

  -- 메타
  sent_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_kakao_send_logs_client ON kakao_send_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_kakao_send_logs_related ON kakao_send_logs(related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_kakao_send_logs_status ON kakao_send_logs(status);
CREATE INDEX IF NOT EXISTS idx_kakao_send_logs_created ON kakao_send_logs(created_at);

-- 설정 추가
INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('kakao_enabled', '0');
INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('kakao_sender_num', '');
INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('kakao_channel_id', '');
INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES ('kakao_alt_send_type', 'C');
