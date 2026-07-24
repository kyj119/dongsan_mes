-- 0472_intake_field_carry.sql
-- 디자이너 대기함 필드 캐리 — CEP 패널 manifest의 keyword·후가공(post_desc)·펀칭·담당자 보존
-- spec: docs/superpowers/specs/2026-07-24-designer-intake-field-carry.md
-- 성격: designer_intakes 컬럼 추가(전부 additive·NULL 기본). 하위호환(구 mes-core manifest=NULL 무해).
-- ⚠️ ALTER는 멱등 아님(중복 컬럼 시 실패) — 신규 1회 적용 (feedback-migration-idempotency)

ALTER TABLE designer_intakes ADD COLUMN keyword TEXT;        -- CEP 키워드 → 주문 라인 내용(content)
ALTER TABLE designer_intakes ADD COLUMN post_desc TEXT;      -- 후가공 요약(양옆접어미싱+사방펀칭 등) — 힌트
ALTER TABLE designer_intakes ADD COLUMN punch_json TEXT;     -- 펀칭 구조(top/bottom/left/right/corners)
ALTER TABLE designer_intakes ADD COLUMN worker_name TEXT;    -- 가공자(담당자) 이름 — 한정 조회
ALTER TABLE designer_intakes ADD COLUMN worker_id INTEGER;   -- MES user 매핑(현재 null, 후속)

CREATE INDEX IF NOT EXISTS idx_designer_intakes_worker ON designer_intakes(worker_name);
