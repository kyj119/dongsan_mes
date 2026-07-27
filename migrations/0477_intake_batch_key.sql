-- 0477_intake_batch_key.sql
-- 디자이너 대기함 작업 그룹핑 키(batch_key) — spec 2026-07-23 §3-B·D6
-- batch_key = CEP 일괄 확정의 공유 배치 폴더(manifest batch_folder). 같은 원본 고객 파일에서
-- 나온 디자인들이 전 행 공통 값을 가져 "작업 단위" 그룹핑 키가 된다.
-- ⚠️ memo(=source_folder)는 배치에서 `#_N` 접미가 붙어 디자인마다 유니크 → 그룹핑 키 부적합(D6).
-- 성격: additive(컬럼+인덱스+backfill). ALTER는 멱등 아님 — 신규 1회 적용(feedback-migration-idempotency).
-- 적용: 로컬/원격 모두 `wrangler d1 execute … --file` 직접 실행(d1_migrations 트래킹 불일치).

ALTER TABLE designer_intakes ADD COLUMN batch_key TEXT;

CREATE INDEX IF NOT EXISTS idx_designer_intakes_batch_key ON designer_intakes(batch_key);

-- backfill: 기존 배치 회수분은 memo = '<배치폴더>#_N' — '#_' 앞부분이 곧 배치 폴더.
-- (단건 확정은 memo에 접미가 없어 batch_key NULL 유지 = 단독 작업으로 취급, 정상)
UPDATE designer_intakes
SET batch_key = substr(memo, 1, instr(memo, '#_') - 1)
WHERE batch_key IS NULL AND memo LIKE '%#\_%' ESCAPE '\';
