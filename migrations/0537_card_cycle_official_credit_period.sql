-- 법인카드 마감일·결제일을 카드사 공식 「결제일별 신용공여기간」으로 재정정 (0536 의 추정치를 대체)
--
-- 0536 은 사용내역↔출금액 상관으로 마감일을 추정했다. 그 추정은 틀렸다 —
-- ★할부가 상관을 뒤집는다: 큰 할부 구매가 있던 달은 그 달 결제액이 오히려 낮고 이후 달이 높아져,
--   정답 마감일에서도 음의 상관이 나온다(전북 cut7 r=-0.56 인데 공식값이 7). 여기에 사용내역 수집
--   결손(동산 하나 -21%·비씨 -35%·전북 -50%)까지 겹쳐 추정 자체가 성립하지 않았다.
--   → 마감일은 데이터로 추정하지 말 것. 카드사 공식표가 정본이다.
--
-- 공식 신용공여기간(일시불/할부) — 2026-08-19 확인
--   하나카드   결제 15일 = 전월 3일 ~ 당월 2일        → 마감 2일 · 동월 15일 결제
--              결제 10일 = 전전월 28일 ~ 전월 27일     → 마감 27일 · 익월 10일 결제
--              (bccard.com 회원사별 신용공여기간 ind0625 / hanacard.co.kr)
--   BC(IBK기업) 결제 15일 = 전월 1일 ~ 전월 말일        → 마감 말일 · 익월 15일 결제
--              결제 10일 = 전전월 26일 ~ 전월 25일     → 마감 25일 · 익월 10일 결제
--              (bccard.com pop_credit_giving_ibk — 동산·선명 비씨 출금계좌가 둘 다 기업은행)
--   전북은행JB 결제 22일 = 전월 8일 ~ 당월 7일         → 마감 7일 · 동월 22일 결제
--              (jbbank.co.kr MPST_GDNC_SETL_MTHD)
--
-- 결제일은 0536 과 동일(은행 출금 실측): 동산 하나·비씨 15일 / 전북 22일, 선명 하나·비씨 10일, 청주 하나 10일.
--
-- 마감일 31 = 말일. 라우트·엔진 모두 min(cutoff_day, 그 달 말일) 로 클램프하므로 2월도 안전
-- (cardExpenses.ts clampDay · cashflowEngine.ts Math.min).
--
-- NH농협(#16)은 손대지 않는다 — 출금계좌가 농협 08712205285(예금주 김진수·별칭 '대표자')로
-- **대표자 개인 통장**이라 법인카드가 아니다. 카드번호·명의자·한도 전부 비어 있고 is_active=0.
--
-- 되돌리기: _bak_0536_card_days 에 0536 이전 원본이 그대로 있다(0536 주석의 롤백 SQL 사용).
-- 멱등: 절대값 대입 → 재실행 no-op.

-- 하나카드
UPDATE corporate_cards SET cutoff_day =  2, payment_day = 15, updated_at = CURRENT_TIMESTAMP
 WHERE card_company = '하나' AND entity_id = 1 AND id <> 1;
UPDATE corporate_cards SET cutoff_day = 27, payment_day = 10, updated_at = CURRENT_TIMESTAMP
 WHERE card_company = '하나' AND entity_id IN (2, 3) AND id <> 1;

-- BC카드(기업은행 발급)
UPDATE corporate_cards SET cutoff_day = 31, payment_day = 15, updated_at = CURRENT_TIMESTAMP
 WHERE card_company = 'BC' AND entity_id = 1 AND id <> 1;
UPDATE corporate_cards SET cutoff_day = 25, payment_day = 10, updated_at = CURRENT_TIMESTAMP
 WHERE card_company = 'BC' AND entity_id = 2 AND id <> 1;

-- 전북은행 JB카드 (하이패스 6장 포함, 전부 동산)
UPDATE corporate_cards SET cutoff_day =  7, payment_day = 22, updated_at = CURRENT_TIMESTAMP
 WHERE card_company = '전북' AND id <> 1;
