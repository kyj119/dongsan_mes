-- Migration: Remove ORD- and CARD- prefixes from order and card numbers
-- Changes:
--   orders.order_number: ORD-20260215-001 → 20260215-001
--   cards.card_number: CARD-20260215-001-01 → 20260215-001-01

-- Update existing order numbers
UPDATE orders
SET order_number = REPLACE(order_number, 'ORD-', '')
WHERE order_number LIKE 'ORD-%';

-- Update existing card numbers  
UPDATE cards
SET card_number = REPLACE(card_number, 'CARD-', '')
WHERE card_number LIKE 'CARD-%';

-- Update RIP filenames in cards table
UPDATE cards
SET rip_filename = REPLACE(rip_filename, 'CARD-', '')
WHERE rip_filename LIKE 'CARD-%';

-- Note: This migration modifies existing data
-- Backup recommended before applying
