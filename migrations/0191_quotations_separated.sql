-- 0191: 견적서를 orders와 별도 테이블로 분리 (Phase 3.2)
--
-- 배경:
--   - 기존: orders 테이블에 status='QUOTATION' 으로 견적서 저장 → 전환 시 status만 변경 → 원본 사라짐
--   - 변경: quotations 테이블 신설, 견적서는 영구 보존, 주문은 별도 레코드로 복사 생성
--   - 관계: 1:N (한 견적서 → 여러 주문 가능)
--
-- 기존 데이터 처리:
--   - 이미 orders에 status='QUOTATION' 또는 CONFIRMED인 데이터는 그대로 둠
--   - 신규 견적서부터 quotations 테이블 사용
--
-- 컬럼 설계:
--   - 견적서에 필요한 최소 컬럼만 포함 (주문 전용 billing_status, billed_at, layout_id, sheet_layout_params 등 제외)
--   - converted_count: 이 견적서로 만든 주문 개수 (1:N 추적)
--   - first_converted_at: 첫 변환 시점 (정보용)
--   - status: ACTIVE (기본) / EXPIRED (만료) / CANCELLED (취소) — 견적서 자체 상태

CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_number TEXT UNIQUE NOT NULL,
  client_id INTEGER NOT NULL,
  entity_id INTEGER DEFAULT 1,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'EXPIRED', 'CANCELLED')) DEFAULT 'ACTIVE',

  -- 일정/주문 정보
  quotation_date DATE DEFAULT CURRENT_DATE,
  delivery_date DATE,
  valid_until TEXT,

  -- 금액
  total_amount REAL DEFAULT 0,
  vat_amount REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  final_amount REAL DEFAULT 0,

  -- 배송 + 연락
  delivery_method TEXT DEFAULT '배송',
  delivery_time TEXT DEFAULT NULL,
  delivery_info TEXT,
  contact_phone TEXT DEFAULT NULL,
  contact_mobile TEXT DEFAULT NULL,
  shipping_payment TEXT DEFAULT NULL,

  -- 메모
  notes TEXT,
  internal_notes TEXT,

  -- 1:N 추적
  first_converted_at DATETIME DEFAULT NULL,
  converted_count INTEGER DEFAULT 0,

  -- 감사
  created_by INTEGER NOT NULL,
  updated_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_quotations_client_id ON quotations(client_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_valid_until ON quotations(valid_until);
CREATE INDEX IF NOT EXISTS idx_quotations_quotation_date ON quotations(quotation_date);
CREATE INDEX IF NOT EXISTS idx_quotations_entity_id ON quotations(entity_id);

-- 견적서 품목 (order_items와 동일 구조)
CREATE TABLE IF NOT EXISTS quotation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id INTEGER NOT NULL,
  item_id INTEGER,
  item_name TEXT NOT NULL,
  width REAL DEFAULT 0,
  height REAL DEFAULT 0,
  scale_factor REAL DEFAULT 1,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'EA',
  unit_price REAL DEFAULT 0,
  amount REAL DEFAULT 0,
  content TEXT,
  post_processing TEXT,
  finishing TEXT,
  pricing_method TEXT DEFAULT 'FIXED',
  parent_id INTEGER DEFAULT NULL,
  sort_order INTEGER DEFAULT 0,
  ai_group_index INTEGER DEFAULT NULL,
  media_subcategory_name TEXT DEFAULT NULL,
  print_method_id INTEGER DEFAULT NULL,
  print_method_name TEXT DEFAULT NULL,
  print_media_id INTEGER DEFAULT NULL,
  print_media_name TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation_id ON quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_item_id ON quotation_items(item_id);

-- orders 테이블에 견적서 FK 추가 (NULL OK — 견적서 없이 직접 생성한 주문)
-- 참고: SQLite는 ALTER TABLE ADD COLUMN에 REFERENCES 지원하지만 D1에서도 동일하게 동작
ALTER TABLE orders ADD COLUMN quotation_id INTEGER DEFAULT NULL REFERENCES quotations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_quotation_id ON orders(quotation_id);

-- quotation_number 형식: Q-YYYYMMDD-NNNN
-- (orders.order_number와 동일 패턴: SUBSTR + MAX로 시퀀스 계산)
