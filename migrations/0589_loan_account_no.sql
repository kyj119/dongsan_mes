-- 0589: 대출계좌번호를 `loans` 의 컬럼으로 — 통장 적요와 이어지는 유일한 열쇠였다
--
-- 하나은행 대출계좌 거래의 적요는 `{계좌번호}-{일련번호}` 다. 그 계좌번호가 `loans.description`
-- 자유텍스트 안에만 있어서 아무 코드도 못 읽었고, 그래서 만기일시 대출의 월 이자가 「차입금상환」에
-- 들어가 손익에서 빠져 있었다(0588 로 정정, 44건 40,233,462).
--
-- 컬럼으로 올리면 스윕이 적요를 보고 바로 그 대출을 찾는다 — 같은 누락이 다시 안 생긴다.
-- 판정(이자냐 원금이냐)은 `src/utils/loanAccountMatch.ts`(순수 모듈)에 있다.
--
-- 백필 근거는 전부 `description` 원문이다(추측 아님):
--   #2  '계좌 602-980200-82142 · 만기일시(원금 이동 없음)'
--   #3  '계좌 602-980200-72442 · …'   #5 '…-84442'   #8 '…-83842'
--   #6  '계좌 602-980186-41042 · …'
--   #19 '보증서담보대출 — 2026-04-10 실행 70,000,000 (입금계좌 60228625205)'
--   #20 '보증서담보대출 추정 — 2026-05-19 실행 50,000,000 (입금계좌 60291004297504)'
--
-- ⚠️#18(구매자금대출·회전)만 description 에 계좌번호가 없다. `60298020073142` 로 본 근거는
--   ①그 계좌가 유일하게 입금·출금을 반복한다(회전의 모습) ②그 계좌의 큰 출금 16건 288,145,937 이
--   실행 입금 17건 287,684,299 와 0.16% 차이로 대응한다 ③회전대출은 #18 하나뿐이다.
--   대조로 좁힌 것이지 원문은 아니다 — `audit:loan-bank` 가 계속 감시한다.
--
-- ★#19·#20 의 「입금계좌」는 **돈이 들어온 우리 계좌**지 대출계좌가 아니다. 실제 대출계좌는
--   적요에 나온 `60298022057942`(#19 실행 7,000만)·`60298022283142`(#20 실행 5,000만) 다.
--   description 을 곧이곧대로 넣으면 틀린 키가 된다 → 적요 쪽을 쓴다.
--
-- 멱등: account_no IS NULL 인 행만 채운다.

ALTER TABLE loans ADD COLUMN account_no TEXT;

UPDATE loans SET account_no = '60298020082142' WHERE id = 2  AND account_no IS NULL;
UPDATE loans SET account_no = '60298020072442' WHERE id = 3  AND account_no IS NULL;
UPDATE loans SET account_no = '60298020084442' WHERE id = 5  AND account_no IS NULL;
UPDATE loans SET account_no = '60298018641042' WHERE id = 6  AND account_no IS NULL;
UPDATE loans SET account_no = '60298020083842' WHERE id = 8  AND account_no IS NULL;
UPDATE loans SET account_no = '60298020073142' WHERE id = 18 AND account_no IS NULL;
UPDATE loans SET account_no = '60298022057942' WHERE id = 19 AND account_no IS NULL;
UPDATE loans SET account_no = '60298022283142' WHERE id = 20 AND account_no IS NULL;
