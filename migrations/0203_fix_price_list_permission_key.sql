-- Fix permission key: sidebar/route use '/price-list' (singular) but was registered as '/price-lists'
-- Must handle FK constraint: role_page_permissions references permission_pages(page_key)

-- Step 1: Insert new permission_pages row with correct key
INSERT OR IGNORE INTO permission_pages (page_key, page_label, page_section, page_icon, badge_id, sort_order, is_active)
SELECT '/price-list', page_label, page_section, page_icon, badge_id, sort_order, is_active
FROM permission_pages WHERE page_key = '/price-lists';

-- Step 2: Copy role_page_permissions to new key (now FK target exists)
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access, updated_at, updated_by)
SELECT role, '/price-list', can_access, updated_at, updated_by
FROM role_page_permissions WHERE page_key = '/price-lists';

-- Step 3: Delete old entries (CASCADE would handle role_page_permissions but be explicit)
DELETE FROM role_page_permissions WHERE page_key = '/price-lists';
DELETE FROM permission_pages WHERE page_key = '/price-lists';
