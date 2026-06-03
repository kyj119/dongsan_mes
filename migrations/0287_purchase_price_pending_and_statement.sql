-- 0287: 매입 관리 — 입고·매입확정 분리 Phase 1
-- 발주 단가 미정 플래그 + 입고 거래명세서 첨부
-- 설계: docs/superpowers/specs/2026-06-03-receivables-purchase-barobill-brainstorm.md

-- 발주 품목 단가 확정 상태
--   CONFIRMED = 단가 확정 (기존 발주·기본값, 입고 시 자동 매입확정)
--   PENDING   = 단가 미정 (매입확정 단계에서 실단가 수기 입력)
ALTER TABLE purchase_order_items ADD COLUMN price_status TEXT NOT NULL DEFAULT 'CONFIRMED';

-- 입고 건당 거래명세서 첨부 (R2 object key). 법인카드 영수증 첨부와 동일 패턴.
ALTER TABLE inventory_receipts ADD COLUMN statement_file_key TEXT;
