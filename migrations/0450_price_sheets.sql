-- 0450: 단가표 세트 (price_sheets / price_sheet_items)
-- 전달용으로 특정 품목만 골라 이름 붙여 저장·재사용. 단가는 값을 굳히지 않고 참조(인쇄 시점 최신가).
-- price_sheets: 세트 메타(entity별 분리). client_id NULL = 표준 sales_price, 지정 시 그 거래처 정책 적용가.
-- price_sheet_items: 세트에 담긴 품목(sort_order = 배열순). hard FK 대신 plain INTEGER + 앱단 검증(제거 유연성).

CREATE TABLE IF NOT EXISTS price_sheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  client_id INTEGER,                 -- 대상 거래처(적용가). NULL=표준 sales_price
  valid_until TEXT,                  -- YYYY-MM-DD
  notes TEXT,                        -- 비고·조건 문구
  contact_person TEXT,               -- 담당자명
  contact_phone TEXT,                -- 담당자 연락처
  show_stamp INTEGER DEFAULT 1,      -- 직인 표시
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS price_sheet_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sheet_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(sheet_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_price_sheet_items_sheet ON price_sheet_items(sheet_id);
CREATE INDEX IF NOT EXISTS idx_price_sheets_entity ON price_sheets(entity_id);
