-- #70: 반품/RMA 워크플로

CREATE TABLE IF NOT EXISTS returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_number TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  claim_id INTEGER REFERENCES customer_claims(id),
  return_date DATE NOT NULL,
  return_reason TEXT NOT NULL,  -- DEFECT | WRONG_ITEM | OVERSTOCK | CUSTOMER_CHANGE
  status TEXT NOT NULL DEFAULT 'REQUESTED',
    -- REQUESTED | APPROVED | SHIPPED_BACK | RECEIVED | INSPECTED | RESOLVED
  resolution TEXT,  -- REFUND | EXCHANGE | CREDIT_NOTE | REJECT
  refund_amount REAL DEFAULT 0,
  restocking_fee REAL DEFAULT 0,
  notes TEXT,
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_returns_client ON returns(client_id);
CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);

CREATE TABLE IF NOT EXISTS return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id),
  quantity REAL NOT NULL,
  condition TEXT DEFAULT 'UNKNOWN',  -- GOOD | DAMAGED | UNUSABLE
  disposition TEXT,  -- RESTOCK | SCRAP | REWORK
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);
