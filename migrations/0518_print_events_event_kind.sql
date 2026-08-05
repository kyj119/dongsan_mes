-- neoStampa RIP 로그 연동: 리핑 전용 이벤트 구분
--
-- 한 물리 출력이 RIP SW(neoStampa)와 제어 SW(Topaz) 양쪽에 로그를 남긴다.
-- 구분 없이 둘 다 적재하면 print_events 가 2행이 되어 생산 실적이 이중계상된다.
--   'PRINT' = 실제 출력 (기존 파서 전부 — tns/flexi/printexp/epson/text_log)
--   'RIP'   = 리핑만 (neostampa). 카드 PRINT_DONE·불량등록·재고차감·실적집계에서 제외.
-- 기존 행은 DEFAULT 'PRINT' 로 회귀 없음.
ALTER TABLE print_events ADD COLUMN event_kind TEXT DEFAULT 'PRINT';

CREATE INDEX IF NOT EXISTS idx_print_events_kind ON print_events(event_kind);
