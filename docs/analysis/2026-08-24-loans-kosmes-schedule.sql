-- 중진공 3건 상환계획 실측 반영 (2026-08-24, OLS 상환계획표)
-- 실행: npx wrangler d1 execute webapp-production --remote --file docs/analysis/2026-08-24-loans-kosmes-schedule.sql
-- ①id4 개발기술사업화 2.5억: 금리 3.31 · ★거치 종료 — 2026-12-21부터 원금 7,100,000/월(+이자, 총 ~778만/월) ~2029-11
-- ②id7 긴급경영안정 1억: 금리 3.84 · 현재 이자만(~32.6만/월) · 첫 원금 회차 미확인(2년 거치면 2028-03 추정)
-- ③id16 시설 잔액 9,996만: 금리 3.04 (2026-09부터)
-- 백업은 08-19 _bak_0819_loans_maturity 에 이미 있음(NOT IN 가드로 중복 방지) · UPDATE 재실행 무해
INSERT INTO _bak_0819_loans_maturity SELECT * FROM loans WHERE id IN (4,7,16) AND id NOT IN (SELECT id FROM _bak_0819_loans_maturity);
UPDATE loans SET current_rate=3.31, notes=COALESCE(notes,'')||' | OLS 2026-08-24: grace ends - principal 7,100,000/mo from 2026-12-21 (total ~7.78M/mo) to 2029-11' WHERE id=4;
UPDATE loans SET current_rate=3.84, notes=COALESCE(notes,'')||' | OLS 2026-08-24: interest-only ~326K/mo; first principal date TBD (2y grace -> ~2028-03?)' WHERE id=7;
UPDATE loans SET current_rate=3.04, notes=COALESCE(notes,'')||' | OLS 2026-08-24: rate 3.04 from 2026-09' WHERE id=16;
