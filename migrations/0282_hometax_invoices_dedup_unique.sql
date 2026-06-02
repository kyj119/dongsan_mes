-- 0282_hometax_invoices_dedup_unique.sql
-- #323: 홈택스 세금계산서 재수집 시 중복 INSERT 방지
--   원인: hometax_invoices INSERT가 dedup 없는 단순 INSERT + idx_hometax_invoices_nts가 비-UNIQUE(0088)
--   → 같은 기간 재수집 시 동일 nts_confirm_number 중복 INSERT → VAT/매입·매출 집계 이중 합산
--
-- 조치:
--   (1) 기존 중복 정리: (entity_id, nts_confirm_number) 동일 건은 최신(id 최대) 1건만 유지
--   (2) UNIQUE 인덱스 생성 → 라우트의 `INSERT OR IGNORE`가 이후 중복을 자동 스킵
--   ※ nts_confirm_number IS NULL 건은 SQLite UNIQUE에서 서로 distinct로 취급되어 충돌하지 않음(정상)

DELETE FROM hometax_invoices
WHERE nts_confirm_number IS NOT NULL
  AND id NOT IN (
    SELECT MAX(id)
    FROM hometax_invoices
    WHERE nts_confirm_number IS NOT NULL
    GROUP BY entity_id, nts_confirm_number
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_hometax_nts_uniq
  ON hometax_invoices(entity_id, nts_confirm_number);
