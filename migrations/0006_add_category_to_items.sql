-- Migration: Add category structure to items table
-- Date: 2026-02-12

-- Add category columns to items table
ALTER TABLE items ADD COLUMN category TEXT;      -- 대분류: 전사, 실사출력, 간판
ALTER TABLE items ADD COLUMN sub_category TEXT;  -- 소분류: 깃발, 태극기, 현수막 등

-- Update existing items (will be replaced with new data)
-- Mark old items as inactive
UPDATE items SET is_active = 0 WHERE 1=1;
