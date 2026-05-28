-- item_group 단가 연동 설정
-- item_group TEXT 값을 키로 사용 (별도 FK 불필요)
CREATE TABLE IF NOT EXISTS item_group_settings (
  group_name TEXT PRIMARY KEY,
  price_linked INTEGER DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
