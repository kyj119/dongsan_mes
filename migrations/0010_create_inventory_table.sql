-- Create inventory table for items stock tracking
-- This table stores stock quantities for items (separate from inventory_items)
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL UNIQUE,           -- Reference to items.id
  quantity REAL DEFAULT 0,                    -- Current stock quantity
  safe_stock REAL DEFAULT 0,                  -- Safety stock level
  location TEXT,                              -- Storage location
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_inventory_item_id ON inventory(item_id);
