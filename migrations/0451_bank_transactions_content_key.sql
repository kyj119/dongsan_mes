-- Migration 0451: bank_transactions 내용 기반 dedup (외부 TransRefKey 재생성 방어)
--
-- 배경: 바로빌 계좌내역 서비스가 동일 거래에 TransKey(=codef_transaction_id)를 재생성하는
--   사고 발생(2026-07-07 공지). 기존 sync는 insert-only(ON CONFLICT codef DO NOTHING)라
--   키가 바뀌면 같은 거래를 새 행으로 중복 삽입하고, 스스로 정리하지 못함(자가치유 불가).
-- 해결: dedup 신원을 외부 가변키 → (계좌,일자,시각,유형,금액,잔액) '내용키'로 이전.
--   공급자 키(codef_transaction_id)는 참고 속성으로 강등. 키가 재생성돼도 내용이 같으면
--   INSERT OR IGNORE로 재삽입이 차단됨.
-- 사전검증(prod 2026-07-07): 전체 458행 내용중복 0 / balance·time·codef null 0 → UNIQUE 추가 안전.
--
-- content_key 규칙: balance_after가 있으면(API 경로=항상 존재) 잔액으로 식별(적요 변경에 견고),
--   없으면(수동 CSV import) counterpart_name으로 폴백(같은 분·금액의 서로 다른 거래처 구분).

-- 1) 내용키(VIRTUAL 생성열 — 저장·백필 불요, 인덱스가 계산). 금액/잔액은 printf로 결정적 문자열화.
ALTER TABLE bank_transactions ADD COLUMN content_key TEXT
  GENERATED ALWAYS AS (
    bank_account_id || '|' || transaction_date || '|' ||
    COALESCE(transaction_time, '') || '|' || transaction_type || '|' ||
    printf('%.2f', COALESCE(amount, 0)) || '|' ||
    CASE WHEN balance_after IS NOT NULL THEN printf('%.2f', balance_after)
         ELSE COALESCE(counterpart_name, '') END
  ) VIRTUAL;

-- 2) 내용키 UNIQUE — 신규 dedup 신원(키 재생성 시 같은 거래 재삽입 차단)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bt_content ON bank_transactions(content_key);

-- 3) 공급자 키 UNIQUE 강등 → 일반 인덱스
--    (키 재사용 시 서로 다른 거래가 오탐-차단되어 유실되는 것을 방지. codef는 이제 참고용)
DROP INDEX IF EXISTS idx_bt_codef_id;
CREATE INDEX IF NOT EXISTS idx_bt_codef_ref ON bank_transactions(bank_account_id, codef_transaction_id);
