-- 0532_designer_intake_item.sql
-- 가공대기함에 품목(item_id)을 실어 나른다 — Z: 스캔 초안이 품목까지 채우도록.
--
-- 왜: 대기함 → 주문서 프리필이 지금 규격·수량·마감·썸네일·내용까지만 채우고
--     **품목은 사람이 매번 손으로 고른다**(scripts/orderForm/intake.js). 그런데 품목이 정해지면
--     단가까지 자동으로 따라온다(/api/prices — 최근거래가 > 특약가 > 단가표 > 기본단가).
--     파일명 제품유형 → 품목 매핑표가 docs/order-file-matching/item_map_draft.csv 에 있으므로
--     그 결과를 대기함에 담을 자리만 있으면 된다.
--
-- 성격: additive(컬럼+인덱스). ALTER는 멱등 아님 — 신규 1회 적용(feedback-migration-idempotency).
-- 적용: 로컬/원격 모두 `wrangler d1 execute … --file` 직접 실행(d1_migrations 트래킹 불일치).
--
-- NULL 유지 = 품목 미해소. 사람이 트레이/주문서에서 고른다(자동 확정 금지 원칙 유지).

ALTER TABLE designer_intakes ADD COLUMN item_id INTEGER REFERENCES items(id);

CREATE INDEX IF NOT EXISTS idx_designer_intakes_item ON designer_intakes(item_id);
