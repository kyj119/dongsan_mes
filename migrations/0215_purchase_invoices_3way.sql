-- #71: 3-Way Matching (PO - 입고 - 매입인보이스)

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES clients(id),
  po_id INTEGER REFERENCES purchase_orders(id),
  invoice_date DATE NOT NULL,
  due_date DATE,
  subtotal REAL NOT NULL DEFAULT 0,
  vat_amount REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  match_status TEXT DEFAULT 'UNMATCHED',
    -- UNMATCHED | MATCHED | PRICE_VARIANCE | QUANTITY_VARIANCE | DISPUTED
  variance_amount REAL DEFAULT 0,
  payment_status TEXT DEFAULT 'UNPAID',  -- UNPAID | PARTIAL | PAID
  paid_amount REAL DEFAULT 0,
  notes TEXT,
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pi_supplier ON purchase_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_pi_po ON purchase_invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_pi_status ON purchase_invoices(match_status);

CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  po_item_id INTEGER REFERENCES purchase_order_items(id),
  item_id INTEGER REFERENCES items(id),
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  amount REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pii_invoice ON purchase_invoice_items(invoice_id);
