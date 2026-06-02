-- 0283_nts_approval_number_unique.sql
-- #329 (2): 국세청 승인번호(nts_approval_number) UNIQUE 누락 → 중복 수집 방지
--   tax_invoices / cash_receipts 는 업무상 (법인, 승인번호)가 유일해야 하나 UNIQUE 제약 없음.
--   재수집/중복 발행 시 동일 승인번호가 여러 행으로 들어가 VAT·매출 집계 이중 합산 가능.
--
-- 조치(#323과 동일 패턴):
--   (1) 기존 중복 정리 — (entity_id, nts_approval_number) 동일 건은 최신(id 최대) 1건만 유지
--   (2) partial UNIQUE 인덱스 — nts_approval_number IS NOT NULL 행만 대상 (미발행/미승인 NULL 다수 허용)
-- ⚠️ 재무 레코드 삭제를 포함하므로 prod 적용 전 중복 존재 여부 확인 권장.

-- (1) tax_invoices 중복 정리
DELETE FROM tax_invoices
WHERE nts_approval_number IS NOT NULL
  AND id NOT IN (
    SELECT MAX(id) FROM tax_invoices
    WHERE nts_approval_number IS NOT NULL
    GROUP BY entity_id, nts_approval_number
  );

-- (1) cash_receipts 중복 정리
DELETE FROM cash_receipts
WHERE nts_approval_number IS NOT NULL
  AND id NOT IN (
    SELECT MAX(id) FROM cash_receipts
    WHERE nts_approval_number IS NOT NULL
    GROUP BY entity_id, nts_approval_number
  );

-- (2) partial UNIQUE 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_invoices_nts_uniq
  ON tax_invoices(entity_id, nts_approval_number)
  WHERE nts_approval_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_receipts_nts_uniq
  ON cash_receipts(entity_id, nts_approval_number)
  WHERE nts_approval_number IS NOT NULL;
