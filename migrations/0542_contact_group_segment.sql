-- 0542: 연락처 그룹에 「조건(세그먼트)」 축 추가 — 법인 × 품목묶음 × 최근 N개월로 대상을 자동 산출.
--
-- 왜: 명절 공지는 1년 거래처 전체, 단가표 재공지는 해당 품목 거래처만 — 대상이 매번 다르고
--   3,000곳에서 손으로 고를 수 없다. 기존 그룹은 수동 지정이라 "1년 이내"가 시간이 지나면 낡는다.
--   조건을 저장해 두고 [명단 갱신]으로 다시 평가한다(발송 시점 자동 평가 아님 — 대상 수·비용이
--   눈에 보인 뒤에 발송해야 오조작이 없다. [[design-contact-groups]] 정적 채택 이유와 같은 취지).
--
-- ★source 가 없으면 갱신이 수동 멤버를 지운다.
--   조건 산출분(AUTO)만 교체하고 손으로 담은 멤버(MANUAL)는 보존해야 한다.
--   기존 행은 전부 수동으로 담은 것이므로 기본값 MANUAL 이 맞다.
--
-- ★matched_reason = "왜 이 거래처가 들어왔는지"의 근거(품목묶음·최근거래일·1년 거래액).
--   이게 없으면 화면에서 명단을 검증할 방법이 없다(용준님 지적, 2026-08-25).
--
-- 판정 규칙 정본 = src/services/clientSegment.ts (SQL 에 규칙을 복제하지 않는다)

ALTER TABLE contact_groups ADD COLUMN filter_json TEXT;
ALTER TABLE contact_groups ADD COLUMN synced_at TEXT;

ALTER TABLE contact_group_members ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE contact_group_members ADD COLUMN matched_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_contact_group_members_source
  ON contact_group_members(group_id, source);
