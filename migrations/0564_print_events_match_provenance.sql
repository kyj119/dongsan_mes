-- 0564: print_events 매칭 출처(match_method) — 소급 매칭의 되돌리는 짝
--
-- 왜 필요한가
--   LogWatcher 는 RIP 에 들어간 **파일명**만 본다. 디자이너는 주문이 생기기 전에 파일을 만들어서
--   파일명에 주문번호를 심을 수가 없고(workbench.ts 흡수 경로 주석 참조), 그 결과 prod print_events
--   10,095건 중 order_number 가 붙은 건 **1건**뿐이었다(2026-09-04 실측).
--   과거분은 파일명 텍스트(거래처·내용·규격·수량)로 **추정 매칭**할 수밖에 없다.
--
-- ★추정은 사실과 구분해서 적고, 되돌릴 수 있어야 한다
--   `order_number` 만 채우면 「에이전트가 심은 확정 매칭」과 「스크립트가 추정한 매칭」이 섞여
--   나중에 구분도 철회도 불가능해진다. 그래서 출처를 같은 행에 남긴다.
--     NULL          = 종전 경로(에이전트/흡수 학습) — 확정
--     'BACKFILL_A'  = 소급 추정 · 규격정확 + 거래처 + 내용 3축 일치
--     'BACKFILL_B'  = 소급 추정 · 규격정확 + (거래처 또는 내용) 1축 일치
--   되돌리기 = scripts/print-order-backfill.py --revert (아래 UPDATE 1문과 동치)
--     UPDATE print_events SET order_number=NULL, card_id=NULL, card_number=NULL, match_method=NULL
--      WHERE match_method LIKE 'BACKFILL%';
--
-- ⚠️ print_file_map 에는 일부러 쓰지 않는다 — 그 테이블은 resolveCard 2차 패스(file_name 직접 일치)가
--    읽는 **미래 매칭용 인덱스**다. 과거 추정을 넣으면 같은 파일명이 다른 주문으로 다시 들어올 때
--    옛 주문에 조용히 붙는다(재출력·정기 반복 작업에서 실제로 일어난다).

ALTER TABLE print_events ADD COLUMN match_method TEXT;

CREATE INDEX IF NOT EXISTS idx_print_events_match_method
  ON print_events(match_method) WHERE match_method IS NOT NULL;
