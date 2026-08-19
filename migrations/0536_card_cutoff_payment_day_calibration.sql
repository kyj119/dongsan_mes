-- 법인카드 마감일(cutoff_day)·결제일(payment_day)을 은행 출금 실측에 맞춰 정정
--
-- 배경: corporate_cards 의 두 값은 등록 당시 임의 기본값(15/15) 또는 손입력이라 카드사별로
--       제각각이었다. 두 값은 결제예정(cardExpenses `/payment-schedule`)과 자금예측
--       (utils/cashflowEngine.ts) 이 "다음 출금일 · 그 출금이 청산하는 사용 구간"을 정하는
--       유일한 기준이다 — payment_day > cutoff_day 면 동월결제, 아니면 익월결제.
--
-- 근거 ① 결제일 = 은행 출금 실측(bank_transactions WITHDRAWAL, 2026-01~08)
--   동산  하나카드기업(하나은행) 15일 · 비씨카드출금(기업은행) 15일 · NH농협카드(농협) 15일
--         JB카드결제7988/7996/9243(전북은행) 22일
--   선명  하나카드기업 10일 · 비씨카드출금 10일        청주  하나카드기업 10일
--   휴일 이월까지 일관: 2/19(설연휴) · 3/16(일→월) · 5/26(대체공휴일) · 8/18(광복절 대체).
--
-- 근거 ② 마감일 = 사용내역(card_transactions net) 사이클 합계 ↔ 출금액 상관 최대점
--   하나 cut17~22 동률 고원(동산 r=0.90 · 선명 r=0.26~0.30) → 21 채택
--   비씨 cut19 뚜렷(r=0.94, cut6~14 는 음의 상관)          → 19 채택
--   전북 cut22 뚜렷(r=0.83, cut2~21 전 구간 음의 상관)      → 22 채택 (기존 15 는 r=-0.63)
--   NH농협 = 사용내역 수집 0건이라 추정 불가 → 기존 동작값 15 를 명시화(NULL→15)만 한다.
--   ⚠️ 상관은 사용내역 수집 결손(출금액 대비 동산 하나 -21% · 비씨 -35% · 전북 -50%) 위에서
--      잰 값이다. 카드사 명세서의 실제 이용기간이 확인되면 그 값이 우선한다.
--
-- 되돌리기:
--   UPDATE corporate_cards SET
--     cutoff_day  = (SELECT old_cutoff_day  FROM _bak_0536_card_days b WHERE b.card_id = corporate_cards.id),
--     payment_day = (SELECT old_payment_day FROM _bak_0536_card_days b WHERE b.card_id = corporate_cards.id)
--    WHERE id IN (SELECT card_id FROM _bak_0536_card_days);
--
-- 멱등: 절대값 대입 + 대상 고정(card_company) → 재실행 no-op. 백업은 INSERT OR IGNORE 라 최초 1회만.
-- 대상 제외: id=1 '테스트 법인카드'(실물 없음).

CREATE TABLE IF NOT EXISTS _bak_0536_card_days (
  card_id         INTEGER PRIMARY KEY,
  old_cutoff_day  INTEGER,
  old_payment_day INTEGER
);

INSERT OR IGNORE INTO _bak_0536_card_days (card_id, old_cutoff_day, old_payment_day)
SELECT id, cutoff_day, payment_day FROM corporate_cards WHERE id <> 1;

-- 하나카드: 마감 21일 → 익월 결제(동산 15일 / 선명·청주 10일)
UPDATE corporate_cards SET cutoff_day = 21, payment_day = 15, updated_at = CURRENT_TIMESTAMP
 WHERE card_company = '하나' AND entity_id = 1 AND id <> 1;
UPDATE corporate_cards SET cutoff_day = 21, payment_day = 10, updated_at = CURRENT_TIMESTAMP
 WHERE card_company = '하나' AND entity_id IN (2, 3) AND id <> 1;

-- 비씨(BC)카드: 마감 19일 → 익월 결제(동산 15일 / 선명 10일)
UPDATE corporate_cards SET cutoff_day = 19, payment_day = 15, updated_at = CURRENT_TIMESTAMP
 WHERE card_company = 'BC' AND entity_id = 1 AND id <> 1;
UPDATE corporate_cards SET cutoff_day = 19, payment_day = 10, updated_at = CURRENT_TIMESTAMP
 WHERE card_company = 'BC' AND entity_id = 2 AND id <> 1;

-- 전북(JB)카드: 마감 22일 → 익월 22일 결제 (하이패스 6장 포함, 전부 동산)
UPDATE corporate_cards SET cutoff_day = 22, payment_day = 22, updated_at = CURRENT_TIMESTAMP
 WHERE card_company = '전북' AND id <> 1;

-- NH농협카드: 추정 불가 → 기존 동작값(COALESCE 15) 명시화만
UPDATE corporate_cards SET cutoff_day = 15, payment_day = 15, updated_at = CURRENT_TIMESTAMP
 WHERE card_company = 'NH농협' AND id <> 1;
