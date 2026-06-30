-- 0416: 가승인 비용 제외 백필 + 수수료(card_fee_rates) 제거
--
-- (1) 가승인(pre-auth) 비용 제외:
--   가승인은 임시 홀드일 뿐 실지출이 아님(실청구는 별도 거래로 옴). 비용·미분류에서 제외하기 위해
--   is_offset=1로 마킹(모든 합계/미분류 쿼리가 is_offset=0만 집계 → 자동 제외). 단독 가승인은
--   offset_pair_id NULL로 진짜 상계와 구분. 신규 수집분은 cardExpenses.ts ingest에서 동일 처리.
--   멱등: 이미 is_offset=1인 행 제외.
UPDATE card_transactions
SET is_offset = 1, updated_at = CURRENT_TIMESTAMP
WHERE merchant_name LIKE '%가승인%' AND is_offset = 0;

-- (2) 카드사 수수료율 기능 제거(법인카드 페이지 부적합·매출 개념). 탭/스크립트/엔드포인트와 함께 데이터도 삭제.
--   FK 참조 없음 확인됨. 복원 필요 시 마이그 0239 + git 이력.
DROP INDEX IF EXISTS idx_card_fee_rates_company_entity;
DROP TABLE IF EXISTS card_fee_rates;
