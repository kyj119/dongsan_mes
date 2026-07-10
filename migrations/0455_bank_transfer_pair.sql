-- ============================================================================
-- Migration 0455: 계좌간 자금이체 표식 (자동감지 + 확인)
-- 설계: docs/superpowers/specs/2026-07-10-bank-fund-management-expansion.md (P3)
--
-- 자기 계좌 간 이체는 A계좌 출금·B계좌 입금으로 이중 계상된다. 두 레코드를 짝지어
-- transfer_pair_id로 링크하고 match_status='IGNORED'로 매칭 큐/집계에서 제외한다.
-- (match_status는 CHECK 제약이라 'TRANSFER' 신규값 불가 → IGNORED + transfer_pair_id 마커.)
-- 잔액(balance_after)에는 이미 반영되어 있으므로 잔액 스냅샷은 정상.
-- ============================================================================

ALTER TABLE bank_transactions ADD COLUMN transfer_pair_id INTEGER;  -- 짝 거래 id (상호 참조)
CREATE INDEX IF NOT EXISTS idx_bt_transfer ON bank_transactions(transfer_pair_id);
