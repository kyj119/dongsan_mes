-- 0412: 법인카드 취소건 dedup 키 네임스페이스 분리 (취소 유실 버그 수정)
--
-- 배경: 수집 dedup 키 = 승인번호(codef_transaction_id). 바로빌이 취소에 원거래(가승인 등)와
--   같은 승인번호를 재사용하면 승인행과 키가 충돌 → 취소가 "중복"으로 스킵되어 유실됨.
--   (예: 카카오T 가승인 승인번호 39071162 — 가승인 APPROVED만 남고 취소 -8,500 유실)
-- 수정: 코드(cardExpenses.ts)가 취소 키에 'C:' 프리픽스를 붙여 승인/취소가 같은 승인번호여도 공존.
--   기존 취소 행도 동일 규칙으로 백필해야 재동기화 시 중복 INSERT가 발생하지 않음.
--
-- 멱등: 이미 'C:' 프리픽스가 붙은 행·NULL 키는 제외.
UPDATE card_transactions
SET codef_transaction_id = 'C:' || codef_transaction_id,
    updated_at = CURRENT_TIMESTAMP
WHERE approval_type = 'CANCEL'
  AND codef_transaction_id IS NOT NULL
  AND codef_transaction_id NOT LIKE 'C:%';
