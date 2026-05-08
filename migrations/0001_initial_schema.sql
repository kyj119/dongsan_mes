-- ============================================================================
-- ERP+MES System - Initial Database Schema
-- Migration: 0001_initial_schema.sql
-- Created: 2026-02-12
-- ============================================================================

-- ============================================================================
-- 1. Users & Authentication
-- ============================================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL CHECK(role IN ('ADMIN', 'MANAGER', 'DESIGNER', 'OPERATOR')) DEFAULT 'OPERATOR',
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User sessions (for login tracking)
CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- 2. Clients (거래처)
-- ============================================================================

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_code TEXT UNIQUE NOT NULL,          -- 거래처코드
  client_name TEXT NOT NULL,                 -- 거래처명
  representative TEXT,                        -- 대표자명
  business_type TEXT,                         -- 업태
  business_item TEXT,                         -- 종목
  phone TEXT,                                 -- 전화
  mobile TEXT,                                -- 모바일
  fax TEXT,                                   -- Fax
  email TEXT,                                 -- Email
  address TEXT,                               -- 주소
  search_keywords TEXT,                       -- 검색창내용
  transfer_info TEXT,                         -- 이체정보
  is_active INTEGER NOT NULL DEFAULT 1,      -- 사용구분
  balance REAL DEFAULT 0,                     -- 미수금 잔액
  notes TEXT,                                 -- 비고
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 3. Items (품목)
-- ============================================================================

-- Item categories (실사출력, 태극기, 간판)
CREATE TABLE IF NOT EXISTS item_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_name TEXT UNIQUE NOT NULL,        -- 실사출력, 태극기, 간판
  category_code TEXT UNIQUE NOT NULL,        -- PRINT, FLAG, SIGN
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Item sub-categories
CREATE TABLE IF NOT EXISTS item_subcategories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  subcategory_name TEXT NOT NULL,
  subcategory_code TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES item_categories(id) ON DELETE CASCADE,
  UNIQUE(category_id, subcategory_code)
);

-- Items (품목)
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  subcategory_id INTEGER,
  item_code TEXT UNIQUE NOT NULL,
  item_name TEXT NOT NULL,
  description TEXT,
  unit TEXT DEFAULT 'EA',                    -- 단위: EA, M, YD, ㎡
  base_price REAL DEFAULT 0,                 -- 기본 단가
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES item_categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (subcategory_id) REFERENCES item_subcategories(id) ON DELETE SET NULL
);

-- ============================================================================
-- 4. Post-Processing Options (후가공)
-- ============================================================================

CREATE TABLE IF NOT EXISTS post_processing_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  option_code TEXT UNIQUE NOT NULL,          -- HEAT_CUT, ROUND_WOOD, LINE_SEWING
  option_name TEXT NOT NULL,                 -- 열재단, 원형나무, 줄미싱
  margin_left REAL DEFAULT 0,                -- 좌 마진 (cm)
  margin_right REAL DEFAULT 0,               -- 우 마진 (cm)
  margin_top REAL DEFAULT 0,                 -- 상 마진 (cm)
  margin_bottom REAL DEFAULT 0,              -- 하 마진 (cm)
  additional_cost REAL DEFAULT 0,            -- 추가 비용
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 5. Orders (주문)
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,         -- 주문번호 (자동생성: ORD-YYYYMMDD-001)
  client_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN (
    'DRAFT',           -- 임시저장
    'CONFIRMED',       -- 접수확정
    'PRODUCTION',      -- 작업중
    'RIP_SENT',        -- RIP 전송완료
    'PRINT_DONE',      -- 출력완료
    'SHIPPED',         -- 출고완료
    'CLOSED',          -- 마감
    'CANCELLED'        -- 취소
  )) DEFAULT 'DRAFT',
  
  -- ECOUNT 주문 입력 화면 필드
  order_year INTEGER,                        -- 인자(년)
  order_month INTEGER,                       -- 인자(월)
  reception_location TEXT,                   -- 접수지
  delivery_info TEXT,                        -- 배송정보
  delivery_date DATE,                        -- 납기일
  order_date DATE DEFAULT CURRENT_DATE,     -- 조고일자
  
  -- 금액 정보
  total_amount REAL DEFAULT 0,               -- 총 금액
  vat_amount REAL DEFAULT 0,                 -- 부가세
  discount_amount REAL DEFAULT 0,            -- 할인액
  final_amount REAL DEFAULT 0,               -- 최종 금액
  
  notes TEXT,                                -- 비고
  internal_notes TEXT,                       -- 내부 메모
  
  -- 담당자 및 이력
  created_by INTEGER NOT NULL,
  updated_by INTEGER,
  confirmed_at DATETIME,                     -- 확정 시간
  confirmed_by INTEGER,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- Order items (주문 상세)
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  item_id INTEGER,                           -- 품목 ID (nullable, 직접 입력 시)
  item_name TEXT NOT NULL,                   -- 품목명 (스냅샷)
  category_name TEXT,                        -- 분류명
  
  -- 규격 정보
  width REAL,                                -- 폭 (cm)
  height REAL,                               -- 높이 (cm)
  quantity INTEGER NOT NULL DEFAULT 1,       -- 수량
  unit TEXT DEFAULT 'EA',                    -- 단위
  
  -- 금액 정보
  unit_price REAL DEFAULT 0,                 -- 단가
  amount REAL DEFAULT 0,                     -- 금액
  vat_included INTEGER DEFAULT 1,            -- 부가세 포함 여부
  
  -- 후가공
  post_processing TEXT,                      -- 후가공 옵션 (JSON array)
  
  -- 기타
  content TEXT,                              -- 내용/설명
  sort_order INTEGER DEFAULT 0,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT
);

-- ============================================================================
-- 6. Cards (현장 카드)
-- ============================================================================

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_number TEXT UNIQUE NOT NULL,          -- 카드번호 (자동생성: CARD-YYYYMMDD-001)
  order_id INTEGER NOT NULL,
  order_item_id INTEGER NOT NULL,
  
  status TEXT NOT NULL CHECK(status IN (
    'PRINT_PENDING',   -- 출력대기
    'PRINTING',        -- 출력중
    'PRINT_DONE',      -- 출력완료
    'HOLD'             -- 보류
  )) DEFAULT 'PRINT_PENDING',
  
  -- 카드 정보
  client_name TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category_name TEXT NOT NULL,               -- 실사출력, 태극기, 간판
  
  -- 규격 정보
  width REAL NOT NULL,                       -- 폭 (cm)
  height REAL NOT NULL,                      -- 높이 (cm)
  quantity INTEGER NOT NULL,                 -- 수량
  unit TEXT DEFAULT 'EA',
  
  -- RIP 파일명 (자동 생성 규칙)
  rip_filename TEXT,                         -- [순번]-[거래처명] [품목명]([규격-수량])후가공_납기
  
  -- 후가공
  post_processing TEXT,                      -- 후가공 옵션 (JSON)
  final_width REAL,                          -- 최종 폭 (후가공 마진 포함)
  final_height REAL,                         -- 최종 높이 (후가공 마진 포함)
  
  -- 납기 및 우선순위
  delivery_date DATE NOT NULL,
  priority INTEGER DEFAULT 0,                -- 우선순위 (높을수록 우선)
  
  -- RIP 연동
  rip_sent_at DATETIME,                      -- RIP 전송 시간
  rip_preview_path TEXT,                     -- Preview 폴더 경로
  rip_job_path TEXT,                         -- Job 폴더 경로
  rip_status TEXT,                           -- RIP 상태
  
  -- 보류 정보
  hold_reason TEXT,                          -- 보류 사유
  hold_at DATETIME,                          -- 보류 시간
  hold_by INTEGER,                           -- 보류자
  
  notes TEXT,                                -- 비고
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  FOREIGN KEY (hold_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================================
-- 7. Status History (상태 이력)
-- ============================================================================

-- Order status history
CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by INTEGER NOT NULL,
  change_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- Card status history
CREATE TABLE IF NOT EXISTS card_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by INTEGER NOT NULL,
  change_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- ============================================================================
-- 8. Notifications (알림)
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_type TEXT NOT NULL CHECK(notification_type IN (
    'SHIPPED',         -- 출고 알림
    'CONFIRM',         -- 확인 요청
    'HOLD',            -- 보류 알림
    'DELAY'            -- 지연 알림
  )),
  target_type TEXT NOT NULL CHECK(target_type IN ('ORDER', 'CARD')),
  target_id INTEGER NOT NULL,
  recipient_phone TEXT NOT NULL,             -- 수신자 전화번호
  message TEXT NOT NULL,                     -- 알림 메시지
  sent_at DATETIME,                          -- 발송 시간
  status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'SENT', 'FAILED')),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 9. System Settings (시스템 설정)
-- ============================================================================

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  description TEXT,
  updated_by INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Users
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Clients
CREATE INDEX IF NOT EXISTS idx_clients_code ON clients(client_code);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(client_name);
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active);

-- Items
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_code ON items(item_code);
CREATE INDEX IF NOT EXISTS idx_items_active ON items(is_active);

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_delivery ON orders(delivery_date);

-- Order Items
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_item ON order_items(item_id);

-- Cards
CREATE INDEX IF NOT EXISTS idx_cards_number ON cards(card_number);
CREATE INDEX IF NOT EXISTS idx_cards_order ON cards(order_id);
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_category ON cards(category_name);
CREATE INDEX IF NOT EXISTS idx_cards_delivery ON cards(delivery_date);
CREATE INDEX IF NOT EXISTS idx_cards_priority ON cards(priority DESC);

-- Status History
CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_card_history_card ON card_status_history(card_id);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
