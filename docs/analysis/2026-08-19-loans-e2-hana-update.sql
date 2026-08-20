-- 선명(e2) 하나은행 4건 만기·금리·잔액 실측 반영 (2026-08-19, 용준님 인터넷뱅킹 실측)
-- 실행: npx wrangler d1 execute webapp-production --remote --file docs/analysis/2026-08-19-loans-e2-hana-update.sql
-- 매핑 근거 = 월 이자 교차검증:
--   id21 월납 285,000 ≈ 9,000만×3.805%/12=285,375 · id22 22,000 ≈ 1,500만×1.92%/12=24,000 · id19 110,000 ≈ 7,000만×1.91%/12=111,417
-- ★잔액 정정 2건: id21 5,150만→9,000만 · id22 443만→1,500만 (이관 잔액 오추정 — 월 이자가 원금 전액 기준과 일치)
-- ★id20 만기 2030-07-19→2027-05-19 (은행 화면 우선 · 월 100만 원금분할은 계속, 만기 시 잔액 상환/연장)
-- 멱등: 백업 INSERT는 NOT IN 가드, UPDATE는 재실행 무해
INSERT INTO _bak_0819_loans_maturity SELECT * FROM loans WHERE id IN (19,20,21,22) AND id NOT IN (SELECT id FROM _bak_0819_loans_maturity);
UPDATE loans SET start_date='2025-03-26', maturity_date='2027-03-12', current_rate=3.805, current_balance=90000000, maturity_confirmed=1, notes=COALESCE(notes,'')||' | verified 2026-08-19 (hana e2; balance corrected 51.5M->90M by interest cross-check)' WHERE id=21;
UPDATE loans SET start_date='2025-04-28', maturity_date='2027-04-09', current_rate=1.92, current_balance=15000000, maturity_confirmed=1, notes=COALESCE(notes,'')||' | verified 2026-08-19 (hana e2; balance corrected 4.43M->15M by interest cross-check)' WHERE id=22;
UPDATE loans SET start_date='2026-04-10', maturity_date='2028-04-10', current_rate=1.91, maturity_confirmed=1, notes=COALESCE(notes,'')||' | verified 2026-08-19 (hana e2)' WHERE id=19;
UPDATE loans SET start_date='2026-05-19', maturity_date='2027-05-19', current_rate=6.997, current_balance=47000000, maturity_confirmed=1, notes=COALESCE(notes,'')||' | verified 2026-08-19 (hana e2; maturity 2030->2027 per bank screen, 1M/mo principal continues)' WHERE id=20;
