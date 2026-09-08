-- 0591: 대출 식별 키를 컬럼 하나가 아니라 **규칙 테이블**로
--
-- `loans.account_no`(0589)는 은행 대출에만 통한다. 실제로 통장이 대출을 부르는 방법은 넷이다:
--   계좌번호   `60298020082142-00001`  (하나 대출계좌)
--   적요 이름  `CMS 오릭스코리아` · `신한카드할부` · `비씨카드` · `현대캐피탈` · `중진공대출`
--   사업자번호 `652-73-159234`          (제일은행)
--   (카드 끝4)  — 카드는 corporate_cards 축이라 여기 아님
--
-- 계좌번호가 없다고 「미등록」이 아니었다 — 계좌번호 없는 11건 중 9건이 적요로 잡힌다.
-- ★키를 컬럼에 넣으면 유형이 하나 늘 때마다 컬럼이 하나 는다. 행으로 두면 늘지 않는다.
--
-- ⚠️이름 앵커는 **모호하다** — `중진공대출` 하나에 #4·#7·#16 셋이 걸린다. 금액이 푼다:
--   실측 673,082 / 304,109 / 2,6xx,xxx  ↔ 월납 661,917 / 310,245 / 2,624,763 (2:1, 4:1 로 분리)
--   ★단 「가장 가까운 금액」이 아니라 **월별 1:1 배정**이어야 한다. 근사만 보면 엉뚱한 대출이
--     먼저 가져간다(utils/loanAccountMatch.matchMonthlyPayments 주석 참조).
--
-- key_type: ACCOUNT = 계좌번호(유일하므로 금액 무관) · ANCHOR = 적요 이름(금액으로 갈라야 한다)
--
-- 백필 근거는 전부 실측이다(2026-09-08, 8개월 통장):
--   #4·#7·#16 중진공대출 — 월 2~3건이 세 대출과 금액대로 대응. #7 은 4월부터 시작 = 2026-03-27 실행과 일치
--   #10 비씨카드 8회 2,332,225 ↔ 월납 2,332,300 · #11 CMS 오릭스코리아 8회 2,570,040 ↔ 월납 동일
--   #12 현대캐피탈 882,236×3(6~8월) · #13 신한카드할부 8회 745,630 ↔ 월납 동일
--   #14 652-73-159234 4,009,492×6(3~8월) · #15 현대캐피탈 427,744×5·428,968×1 ↔ 월납 428,968
-- #1(월납 미등록)·#9(통장 흔적 없음)는 키를 만들지 않는다 — 근거가 없으면 비워 둔다.
--
-- 멱등: (loan_id, key_text) UNIQUE + INSERT OR IGNORE.

CREATE TABLE IF NOT EXISTS loan_match_keys (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id    INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  key_text   TEXT NOT NULL,
  key_type   TEXT NOT NULL DEFAULT 'ANCHOR',
  entity_id  INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (loan_id, key_text)
);

CREATE INDEX IF NOT EXISTS idx_loan_match_keys_text ON loan_match_keys (key_text);

-- 계좌번호(0589 백필분)를 키로 승격 — 매칭은 이 표만 읽는다.
INSERT OR IGNORE INTO loan_match_keys (loan_id, key_text, key_type, entity_id)
SELECT l.id, l.account_no, 'ACCOUNT', COALESCE(l.entity_id, 1)
  FROM loans l WHERE COALESCE(l.account_no, '') != '';

INSERT OR IGNORE INTO loan_match_keys (loan_id, key_text, key_type, entity_id)
SELECT l.id, '중진공대출', 'ANCHOR', COALESCE(l.entity_id, 1) FROM loans l WHERE l.id = 4 AND l.is_active = 1;

INSERT OR IGNORE INTO loan_match_keys (loan_id, key_text, key_type, entity_id)
SELECT l.id, '중진공대출', 'ANCHOR', COALESCE(l.entity_id, 1) FROM loans l WHERE l.id = 7 AND l.is_active = 1;

INSERT OR IGNORE INTO loan_match_keys (loan_id, key_text, key_type, entity_id)
SELECT l.id, '중진공대출', 'ANCHOR', COALESCE(l.entity_id, 1) FROM loans l WHERE l.id = 16 AND l.is_active = 1;

INSERT OR IGNORE INTO loan_match_keys (loan_id, key_text, key_type, entity_id)
SELECT l.id, '비씨카드', 'ANCHOR', COALESCE(l.entity_id, 1) FROM loans l WHERE l.id = 10 AND l.is_active = 1;

INSERT OR IGNORE INTO loan_match_keys (loan_id, key_text, key_type, entity_id)
SELECT l.id, 'CMS 오릭스코리아', 'ANCHOR', COALESCE(l.entity_id, 1) FROM loans l WHERE l.id = 11 AND l.is_active = 1;

INSERT OR IGNORE INTO loan_match_keys (loan_id, key_text, key_type, entity_id)
SELECT l.id, '현대캐피탈', 'ANCHOR', COALESCE(l.entity_id, 1) FROM loans l WHERE l.id = 12 AND l.is_active = 1;

INSERT OR IGNORE INTO loan_match_keys (loan_id, key_text, key_type, entity_id)
SELECT l.id, '신한카드할부', 'ANCHOR', COALESCE(l.entity_id, 1) FROM loans l WHERE l.id = 13 AND l.is_active = 1;

INSERT OR IGNORE INTO loan_match_keys (loan_id, key_text, key_type, entity_id)
SELECT l.id, '652-73-159234', 'ANCHOR', COALESCE(l.entity_id, 1) FROM loans l WHERE l.id = 14 AND l.is_active = 1;

INSERT OR IGNORE INTO loan_match_keys (loan_id, key_text, key_type, entity_id)
SELECT l.id, '현대캐피탈', 'ANCHOR', COALESCE(l.entity_id, 1) FROM loans l WHERE l.id = 15 AND l.is_active = 1;
