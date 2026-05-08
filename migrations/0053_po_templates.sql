-- ============================================================================
-- Migration 0053: 발주서 템플릿 시스템
-- 반복 발주 시 템플릿에서 품목 세트를 불러와 빠르게 발주서 작성
-- ============================================================================

-- 템플릿 헤더
CREATE TABLE IF NOT EXISTS po_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    supplier_id INTEGER,
    notes TEXT,
    created_by INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 템플릿 품목
CREATE TABLE IF NOT EXISTS po_template_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES po_templates(id),
    item_id INTEGER,
    item_name TEXT NOT NULL,
    category_name TEXT,
    quantity REAL DEFAULT 1,
    unit TEXT DEFAULT 'EA',
    unit_price REAL DEFAULT 0,
    vat_included INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_po_templates_supplier ON po_templates(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_templates_active ON po_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_po_template_items_template ON po_template_items(template_id);
