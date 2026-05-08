-- ============================================================================
-- Migration 0057: 재고 관리 고도화 (재주문점, 자동발주 플래그)
-- ============================================================================

-- inventory 테이블에 재주문점 컬럼 추가
ALTER TABLE inventory ADD COLUMN reorder_point REAL DEFAULT 0;

-- inventory 테이블에 자동 PR 활성화 플래그 추가
ALTER TABLE inventory ADD COLUMN auto_pr_enabled INTEGER DEFAULT 0;
