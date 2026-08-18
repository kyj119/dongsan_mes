-- 0534_order_recon_status.sql
-- 주문에 이카운트 대사(對査) 결과를 기록한다.
--
-- 왜: 이카운트 병행 기간에 **수정이 한쪽에만 반영**되면, 시간이 지날수록 어느 쪽이 맞는지
--     판정할 수 없게 된다. 주 1회 대사(scripts/zscan-reconcile.py)를 돌려도 결과가 CSV 로만
--     남으면 다음 주엔 잊힌다. 주문 자체에 붙여야 화면에서 보이고 이력이 쌓인다.
--     "오류·문제점을 기록·관리해 교훈으로 삼는다"(2026-08-12 용준님)가 여기서 실현된다.
--
-- 값:
--   NULL        아직 대사 안 함
--   MATCHED     이카운트 주문과 값이 일치
--   MISMATCH    양쪽 다 있는데 값이 다름 (recon_note 에 무엇이 다른지)
--   NO_ECOUNT   이카운트에 대응 주문이 없음 (재출력·샘플이거나 청구 누락 후보)
--   NO_FILE     Z: 작업파일을 못 찾음
--
-- 성격: additive(컬럼+인덱스). ALTER 는 멱등 아님 — 신규 1회 적용(feedback-migration-idempotency).
-- 적용: 로컬/원격 모두 `wrangler d1 execute … --file` 직접 실행.

ALTER TABLE orders ADD COLUMN recon_status TEXT;
ALTER TABLE orders ADD COLUMN recon_note TEXT;
ALTER TABLE orders ADD COLUMN recon_at TEXT;

-- 목록에서 「불일치만 보기」가 흔한 조회다. NULL(미대사)이 대부분이라 부분 인덱스로 좁힌다.
CREATE INDEX IF NOT EXISTS idx_orders_recon ON orders(recon_status) WHERE recon_status IS NOT NULL;
