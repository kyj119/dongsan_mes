-- 파일명 ↔ 카드 매핑 테이블
-- IllustratorAutomat이 EPS 파일 생성 시 등록, LogWatcher가 인쇄 이벤트 수신 시 조회
CREATE TABLE IF NOT EXISTS print_file_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL,
  file_seq INTEGER NOT NULL,
  card_id INTEGER,
  card_number TEXT,
  order_item_id INTEGER,
  file_name TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_number, file_seq)
);

CREATE INDEX IF NOT EXISTS idx_file_map_order ON print_file_map(order_number);
CREATE INDEX IF NOT EXISTS idx_file_map_filename ON print_file_map(file_name);
