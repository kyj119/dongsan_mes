-- ============================================================================
-- Migration 0439: 출고 포장 검수 체크리스트 (출고관리 고도화 v2 P1)
--   spec: docs/superpowers/specs/2026-07-03-shipping-verification-consolidation-v2.md
--   검수 단위 = shipment × 주문 라인(order_item, top-level).
--   packed_quantity NULL = 전량 담음(기본). 예외(수량 불일치) 시에만 값 기록.
--   checked_at NULL = 미검수. 체크 해제 시 NULL 복귀(행은 유지).
-- ============================================================================

CREATE TABLE IF NOT EXISTS shipment_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL,
  order_item_id INTEGER NOT NULL,
  packed_quantity REAL,              -- NULL = 전량 (라인 체크 + 예외 시 수량)
  checked_at DATETIME,               -- NULL = 미검수
  checked_by INTEGER,
  UNIQUE(shipment_id, order_item_id),
  FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id),
  FOREIGN KEY (checked_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_shipment_checks_shipment ON shipment_checks(shipment_id);

-- /pack 모바일 출고 검수 페이지 권한 등록 (P4)
INSERT OR IGNORE INTO permission_pages (page_key, page_label, page_section, page_icon, sort_order, is_active)
VALUES ('/pack', '출고 검수', '운영', 'fa-clipboard-check', 51, 1);

-- 기본 권한: 관리자·매니저·오퍼레이터 (ADMIN은 미들웨어에서 전체 통과)
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
VALUES ('MANAGER', '/pack', 1), ('OPERATOR', '/pack', 1);
