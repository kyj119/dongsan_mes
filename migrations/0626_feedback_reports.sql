-- 0626: 병행테스트 문제 접수함 (2026-09-22)
--
-- 왜: 병행테스트가 시작되면 **옆에 아무도 없다.** 「안 되는데 말할 데가 없어서 그냥
--   예전 방식으로 했다」가 채택을 가장 빨리 망가뜨리는데, 그건 아무 기록도 남기지 않는다.
--   → 막힌 **그 화면에서** 버튼 하나로 접수한다.
--
-- ★입구는 **웹 전역**이다. 패널이 아니다 — 출력실·재단·봉제는 일러스트를 아예 안 연다
--   (활성 사용자 22명 = OPERATOR 12 · DESIGNER 7 · ADMIN 3). 패널은 「신고에 붙일 정보
--   복사」 보조로만 쓴다(패널에서 MES 로 가는 배선이 없다 — 전부 Z: 파일 경유라, 지금
--   병행테스트로 검증 중인 축에 없던 네트워크 배선을 까는 위험을 피한다).
--
-- 설계 셋:
-- ① **사람이 쓰는 칸은 둘뿐이다**(category + body). 나머지는 화면이 안다.
--    새 화면을 만들면 안 쓴다는 전례가 이 DB 안에 있다 — card_checklist_items 가
--    2,496칸 만들어졌는데 **체크 0건**이다. 기능이 없어서가 아니라 「가야 할 곳」이라서다.
--    그래서 페이지가 아니라 **전 화면에 떠 있는 버튼**으로 둔다.
-- ② ★증거 1순위는 업로드가 아니라 **file_path(Z: 경로)** 다. 디자이너 파일은 이미
--    `Z:\DESIGNS\IA-등록\...` 에 있고 같은 망이라 **경로만 있으면 원본을 그대로 연다.**
--    20MB 를 올렸다 받는 건 돌아가는 길이다. attachments_json 은 **로컬에만 있는 파일**용 예비.
-- ③ ★notified_at — 고친 걸 본인에게 **안 알리면 다음부터 신고를 안 한다.** 채택이 죽는
--    자리가 정확히 여기라서 「알렸는가」를 칸으로 둔다. 안 두면 알렸다고 착각한다.
--
-- ⚠️CHECK 제약을 **일부러 안 건다** — 분류가 하나 늘 때마다 테이블을 다시 만들어야 한다
--   (ai_analysis_requests.status 가 같은 이유로 무제약이다). 값 검증은 라우트에서.
-- ⚠️entity_id 는 DEFAULT 1 이지만 **INSERT 에서 명시**한다(전역 DEFAULT 1 함정).

CREATE TABLE IF NOT EXISTS feedback_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 누가 · 언제
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reporter_name TEXT,                                   -- 스냅샷: 계정이 지워져도 누가 냈는지 남는다
  entity_id     INTEGER DEFAULT 1,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- 사람이 쓰는 것 — 이 둘뿐이다
  category TEXT NOT NULL,     -- MISSING 기능없음 | NOTFOUND 못찾음 | ERROR 오류·느림 | WRONG 값이틀림
  body     TEXT NOT NULL,     -- 한 줄

  -- 화면이 아는 것 (전부 자동)
  page_path   TEXT,           -- /orders?view=...
  page_label  TEXT,           -- 주문 목록
  context_ref TEXT,           -- 화면이 집은 주문번호·카드번호
  client_info TEXT,           -- 브라우저·화면크기·역할 (JSON)
  last_error  TEXT,           -- 방금 실패한 요청·콘솔 오류

  -- 증거
  file_path        TEXT,      -- ★1순위. Z: 경로 (패널 「복사」가 자동으로 넣는다)
  attachments_json TEXT,      -- 예비. [{kind:'capture'|'file', key, name, size}] — 캡처·첨부를 한 칸에

  -- 처리
  status       TEXT NOT NULL DEFAULT 'OPEN',   -- OPEN | DONE (둘뿐. 접수·검토중·보류를 만들면 그걸 관리하는 일이 또 생긴다)
  handled_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  handled_at   DATETIME,
  handled_note TEXT,
  notified_at  DATETIME                        -- ★신고자에게 실제로 알린 시각
);

-- 목록 정렬은 id DESC 단독으로 유일하다(AUTOINCREMENT) — tie-break 불요.
CREATE INDEX IF NOT EXISTS idx_feedback_status_id ON feedback_reports(status, id DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id   ON feedback_reports(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_entity_id ON feedback_reports(entity_id, id DESC);

-- 목록 화면만 권한을 건다. **신고 버튼 자체는 권한 불요**(로그인만) — 모두가 내야 하는 것이라
-- 권한을 걸면 정작 막힌 사람이 못 낸다.
INSERT OR IGNORE INTO permission_pages (page_key, page_label, page_section, page_icon, sort_order, is_active)
VALUES ('/feedback', '문제 접수함', '관리', 'fa-bug', 690, 1);

INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access, can_edit) VALUES ('ADMIN', '/feedback', 1, 1);
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access, can_edit) VALUES ('MANAGER', '/feedback', 1, 1);
