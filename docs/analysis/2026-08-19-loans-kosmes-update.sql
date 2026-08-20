-- 중진공(중소벤처기업진흥공단) 3건 만기·잔액 실측 반영 (2026-08-19, 용준님 조회 실측)
-- 실행: npx wrangler d1 execute webapp-production --remote --file docs/analysis/2026-08-19-loans-kosmes-update.sql
-- 매핑 근거 = 월 이자 교차검증: id7 310,245 = 1억×3.723%/12(310,250) · id4 661,917 = 2.5억×3.177%/12(661,875)
-- ①1억 26DR04708: 2026-03-27~2031-03-26 → id7 · ②2.5억 24DR14915: 2024-11-22~2029-11-21 → id4
-- ③시설 20DR01199: 원금 2억·잔액 99,960,000·2020-02-13~2030-02-12 → id16 (만기 이미 정확, 잔액만 1회차 보정)
-- ★id4 주의: 거치 2년이면 2026-11부터 월 ~694만 원금 상환 시작 가능 — 거치 종료일 중진공 확인 필요
-- 멱등: 백업 INSERT는 NOT IN 가드, UPDATE는 재실행 무해
INSERT INTO _bak_0819_loans_maturity SELECT * FROM loans WHERE id IN (4,7,16) AND id NOT IN (SELECT id FROM _bak_0819_loans_maturity);
UPDATE loans SET start_date='2026-03-27', maturity_date='2031-03-26', maturity_confirmed=1, notes=COALESCE(notes,'')||' | maturity verified 2026-08-19 (kosmes; grace end unconfirmed)' WHERE id=7;
UPDATE loans SET start_date='2024-11-22', maturity_date='2029-11-21', maturity_confirmed=1, notes=COALESCE(notes,'')||' | maturity verified 2026-08-19 (kosmes; if 2y grace, principal ~6.94M/mo from 2026-11 - confirm)' WHERE id=4;
UPDATE loans SET start_date='2020-02-13', current_balance=99960000, notes=COALESCE(notes,'')||' | balance synced 2026-08-19 (kosmes 99,960,000)' WHERE id=16;
