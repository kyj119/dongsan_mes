-- Migration: Create card_items junction table
-- Date: 2026-02-15
-- Purpose: Allow multiple order items to be grouped into one card by category

-- Create card_items junction table
CREATE TABLE IF NOT EXISTS card_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  order_item_id INTEGER NOT NULL,
  quantity INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_card_items_card_id ON card_items(card_id);
CREATE INDEX IF NOT EXISTS idx_card_items_order_item_id ON card_items(order_item_id);
