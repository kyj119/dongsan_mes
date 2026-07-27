-- #567: 클레임/반품 해결금액의 AR(adjustments) 자동조정 연동 — 출처(provenance) 추적.
-- 자동 생성된 조정 레코드가 어느 클레임/반품에서 왔는지 명시해, 재해결·금액수정 시
-- DELETE(해당 출처)→INSERT 로 멱등하게 재동기화(중복 조정 방지)한다.
-- source_type NULL = 회계담당 수동 입력(ledger/ar-payments.ts) — 자동 동기화 대상 아님(불간섭).
ALTER TABLE adjustments ADD COLUMN source_type TEXT;   -- 'CLAIM' | 'RETURN' | NULL(manual)
ALTER TABLE adjustments ADD COLUMN source_id INTEGER;  -- customer_claims.id | returns.id

-- 출처당 자동조정 1건 보장(수동 조정은 source_type NULL이라 제외 = 부분 인덱스).
CREATE UNIQUE INDEX IF NOT EXISTS idx_adjustments_source
  ON adjustments(source_type, source_id) WHERE source_type IS NOT NULL;
