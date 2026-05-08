-- 0099: 발주 워크플로우 개선
-- 빠른 발주(자동승인), 안전재고 알림, 재발주 기능 지원

-- 발주 요청에 자동승인 플래그 추가
ALTER TABLE purchase_requests ADD COLUMN auto_approved INTEGER DEFAULT 0;

-- 발주서에 원본 발주서 참조 (재발주 추적)
ALTER TABLE purchase_orders ADD COLUMN source_po_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL;

-- 안전재고 알림 테이블
CREATE TABLE IF NOT EXISTS stock_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL DEFAULT 'LOW_STOCK',  -- LOW_STOCK, REORDER_POINT
  current_quantity REAL NOT NULL,
  threshold_quantity REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, ACKNOWLEDGED, RESOLVED, PR_CREATED
  acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at DATETIME,
  linked_pr_id INTEGER REFERENCES purchase_requests(id) ON DELETE SET NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_status ON stock_alerts(status);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_item ON stock_alerts(item_id);

-- 자동승인 설정 (settings 테이블에 저장)
-- po_auto_approve_enabled: 1/0
-- po_auto_approve_limit: 금액 한도 (원)
-- po_auto_approve_template_only: 1이면 템플릿 기반 발주만 자동승인
