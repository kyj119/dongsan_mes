-- 0437: P3 동일 거래처 합포장 — shipment 묶음(merged_into) 모델
-- 같은 날 같은 거래처로 나가는 복수 법인 주문을 "한 박스"로 묶는 명시적 기록.
-- 각 주문의 shipment 행은 유지(법인별 출고 이력 보존), 부속 행이 대표(primary)를 가리킴.
-- 송장번호/라벨수량/수신자주소의 정본 = 대표 shipment (쓰기 리다이렉트는 코드에서 처리).
ALTER TABLE shipments ADD COLUMN merged_into_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_shipments_merged_into ON shipments(merged_into_id);
