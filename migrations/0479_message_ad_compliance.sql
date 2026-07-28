-- 광고성 문자/MMS 발송 법적 준수 가드 (정보통신망법 §50)
--
-- 배경: MMS 추가로 단가 인하 안내·명절 홍보·판촉을 보낼 계획인데, 광고성 정보 전송에는
--       ①(광고) 표기 ②수신거부 무료 수단 ③사전동의(또는 6개월 거래 예외) ④야간 21~08 금지가 강제된다.
--       위반 시 과태료는 직원이 아니라 사업자(동산기획)에 귀속 → 사람 규칙이 아니라 시스템으로 막는다.
--
-- 설계 결정:
--  - opt-out은 clients 컬럼이 아니라 **번호 기준 별도 테이블**. 발송 대상엔 거래처뿐 아니라
--    직원(employees)·직접입력 번호도 있어 거래처 컬럼으로는 구멍이 남는다.
--  - 수신거부 토큰은 **무기한**. portal_access_tokens는 expires_at이 있어(portal.ts:204) 재사용 불가 —
--    수신거부 링크가 만료되면 그 자체가 §50⑤ 수신거부 방해가 된다.
--  - 금지어는 하드코딩이 아니라 테이블. 업종 문구가 바뀌므로 운영자가 추가·삭제할 수 있어야 한다.

-- ────────────────────────────────────────────────────────────────────────────
-- 1) 수신거부 명단 — 번호 기준(거래처·직원·직접입력 공통)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_opt_outs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,                        -- 숫자만 정규화 저장(01012345678)
  client_id INTEGER,                          -- 알 수 있으면 연결(참조용). FK 미설정 = 직원/외부번호 수용
  source TEXT NOT NULL DEFAULT 'WEB',         -- WEB(링크 클릭) | MANUAL(직원 등록) | CALL(전화 요청)
  reason TEXT,
  created_by INTEGER,                         -- MANUAL/CALL 등록자
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 번호당 1건 — 재클릭·중복 등록은 무시(INSERT OR IGNORE)
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_opt_outs_phone ON message_opt_outs(phone);

-- ────────────────────────────────────────────────────────────────────────────
-- 2) 수신거부 링크 토큰 — 무기한, 번호당 1개 재사용
-- ────────────────────────────────────────────────────────────────────────────
-- 발송할 때마다 새 토큰을 만들면 같은 사람에게 매번 다른 링크가 나가고 토큰이 무한 증식한다.
-- 번호당 1개를 만들어 계속 재사용한다(UNIQUE phone).
CREATE TABLE IF NOT EXISTS unsubscribe_tokens (
  token TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  client_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unsubscribe_tokens_phone ON unsubscribe_tokens(phone);

-- ────────────────────────────────────────────────────────────────────────────
-- 3) 금지어 — 정보성 발송에서 광고 문구를 차단
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ad_banned_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_banned_words_word ON ad_banned_words(word);

-- 시드는 보수적으로: 오탐이 잦은 단어('무료'는 '무료배송 안내' 같은 정보성에도 쓰임)는 제외하고
-- 운영자가 필요에 따라 추가한다.
INSERT OR IGNORE INTO ad_banned_words (word) VALUES
  ('할인'), ('특가'), ('세일'), ('이벤트'), ('사은품'), ('경품'),
  ('프로모션'), ('쿠폰'), ('최저가'), ('공짜'), ('무료체험'), ('신규오픈'), ('오픈기념');

-- ────────────────────────────────────────────────────────────────────────────
-- 4) 발송 로그에 유형 기록 — 사후 증빙
-- ────────────────────────────────────────────────────────────────────────────
-- 분쟁 시 "이 발송은 정보성이었다"를 입증할 근거. 기존 행은 전부 정보성(INFO)이 맞다
-- (광고 발송 경로 자체가 없었음).
ALTER TABLE kakao_send_logs ADD COLUMN message_type TEXT DEFAULT 'INFO';   -- INFO | AD
