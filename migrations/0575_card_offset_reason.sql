-- 0575: is_offset 이 겸하던 네 가지 뜻을 명시 마커로 분리
--
-- is_offset=1 은 "순비용에서 제외"라는 **결과**만 말하고 **왜**를 말하지 않는다. 그 결과
-- 「카드사가 실제로 청구한 금액」(청구 기준)을 코드가 계산할 수 없었다 — 카드로 결제한 매입은
-- 비용에선 빠지지만 카드사는 그대로 청구하기 때문이다. 출금액↔사용기간 귀속이 여기서 막혔다.
--
--   PAIR          승인↔취소 상계쌍 양쪽        offset_pair_id 있음        (0379 · 자동 reconcile)
--   PREAUTH       가승인 홀드                 가맹점명에 '가승인'          (0416 · ingest)
--   PURCHASE      카드로 결제한 매입           memo 로만 표시돼 있었음      (2026-08-13 수기)
--   ORPHAN_CANCEL 원승인이 수집분에 없는 취소   memo 로만 표시돼 있었음      (2026-08-13 수기)
--
-- 뒤 둘은 사람이 memo 에 자유텍스트로 남긴 것이 유일한 흔적이었다. 백필 근거가 추측이 아니라
-- 그 기록이므로 정확하다 — 별도 대조에서 PURCHASE 224건은 224건 모두 가맹점명이 발주 이력 있는
-- 거래처와 일치했고, ORPHAN_CANCEL 10건은 10건 모두 같은 카드·같은 가맹점의 동일금액 승인이
-- 전 수집기간에 존재하지 않았다.
--
-- 멱등: offset_reason IS NULL 인 행만 채운다. 순서 의존(PAIR → PREAUTH → memo)이므로 재실행해도
-- 이미 채워진 행은 건드리지 않는다. is_offset=0 인 행은 NULL 로 남는다(사유가 없으므로).

ALTER TABLE card_transactions ADD COLUMN offset_reason TEXT;

UPDATE card_transactions SET offset_reason = 'PAIR'
 WHERE COALESCE(is_offset, 0) = 1 AND offset_reason IS NULL AND offset_pair_id IS NOT NULL;

UPDATE card_transactions SET offset_reason = 'PREAUTH'
 WHERE COALESCE(is_offset, 0) = 1 AND offset_reason IS NULL
   AND COALESCE(merchant_name, '') LIKE '%가승인%';

UPDATE card_transactions SET offset_reason = 'PURCHASE'
 WHERE COALESCE(is_offset, 0) = 1 AND offset_reason IS NULL
   AND COALESCE(memo, '') LIKE '%매입대금 카드결제%';

UPDATE card_transactions SET offset_reason = 'ORPHAN_CANCEL'
 WHERE COALESCE(is_offset, 0) = 1 AND offset_reason IS NULL
   AND COALESCE(memo, '') LIKE '%짝없는 취소%';
