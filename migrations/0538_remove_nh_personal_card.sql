-- 법인카드 목록에서 NH농협카드(#16) 제거 — 법인카드가 아니라 대표자 개인카드다
--
-- 판정 근거: `NH농협카드` 출금이 나가는 계좌 = `bank_accounts` #17
--   농협은행 08712205285 · 예금주 **김진수** · 별칭 **「대표자」**.
--   같은 통장에 청약저축 58~65회 · NH손보 개인보험 01~08 · KB오픈 개인이체가 섞여 있는 개인 통장이다.
--   (2026-01~08 실측 10건 916만원 — 액수가 있어 「법인 카드가 예측에서 빠졌다」로 오독하기 쉽다. 아니다.)
--
-- 지우는 행: id=16 `동산기획 농협카드 1` — 카드번호·명의자 없음 · 한도 0 · is_active=0 ·
--   `card_transactions` 0건 · 바로빌 미등록. 2026-08-10 생성된 껍데기라 참조가 하나도 없다.
--   ⚠️ `corporate_cards` 를 참조하는 테이블은 `card_transactions` 하나뿐이고 #16 참조는 0건 — 고아 안 생긴다.
--
-- ⚠️ 남는 문제(코드 아님·판단 필요): 그 개인 통장 #17 이 `entity_id=1` 활성 계좌로 등록돼 있어
--    자금·판관비 집계에 섞인다. 입금 쪽엔 실거래(다울광고·서울야생화 등)도 있어 단순 제외는 안 된다.
--
-- 되돌리기:
--   INSERT INTO corporate_cards (id, card_name, card_company, card_number_last4, holder_name, monthly_limit,
--                                is_active, connected_id, entity_id, payment_day, assigned_user_id, cutoff_day,
--                                barobill_registered, collect_cycle, created_at)
--   SELECT card_id, card_name, card_company, card_number_last4, holder_name, monthly_limit, is_active,
--          connected_id, entity_id, payment_day, assigned_user_id, cutoff_day, barobill_registered,
--          collect_cycle, created_at FROM _bak_0538_removed_cards WHERE card_id = 16;
--
-- 멱등: 재실행 = no-op(백업은 INSERT OR IGNORE · 삭제 대상은 이미 없음).

CREATE TABLE IF NOT EXISTS _bak_0538_removed_cards (
  card_id            INTEGER PRIMARY KEY,
  card_name          TEXT,
  card_company       TEXT,
  card_number_last4  TEXT,
  holder_name        TEXT,
  monthly_limit      REAL,
  is_active          INTEGER,
  connected_id       TEXT,
  entity_id          INTEGER,
  payment_day        INTEGER,
  assigned_user_id   INTEGER,
  cutoff_day         INTEGER,
  barobill_registered INTEGER,
  collect_cycle      TEXT,
  created_at         TEXT,
  removed_reason     TEXT
);

INSERT OR IGNORE INTO _bak_0538_removed_cards
  (card_id, card_name, card_company, card_number_last4, holder_name, monthly_limit, is_active,
   connected_id, entity_id, payment_day, assigned_user_id, cutoff_day, barobill_registered,
   collect_cycle, created_at, removed_reason)
SELECT id, card_name, card_company, card_number_last4, holder_name, monthly_limit, is_active,
       connected_id, entity_id, payment_day, assigned_user_id, cutoff_day, barobill_registered,
       collect_cycle, created_at,
       '대표자 개인카드(출금계좌=농협 08712205285 김진수) — 법인카드 아님. 참조 0건 껍데기.'
  FROM corporate_cards WHERE id = 16;

DELETE FROM corporate_cards
 WHERE id = 16
   AND NOT EXISTS (SELECT 1 FROM card_transactions ct WHERE ct.card_id = 16);
