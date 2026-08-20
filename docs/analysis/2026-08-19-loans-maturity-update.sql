-- 하나은행(동산 e1) 대출 만기·금리 실측 반영 (2026-08-19)
-- 근거: 품목마스터/계좌목록_20260819.xls · _만기도래내역조회20260819.xlsx (하나은행 인터넷뱅킹 출력)
-- 실행: npx wrangler d1 execute webapp-production --remote --file docs/analysis/2026-08-19-loans-maturity-update.sql
-- 멱등: 백업은 IF NOT EXISTS(최초 1회만 생성), UPDATE는 같은 값 재설정이라 재실행 무해
-- ⚠️ wrangler --file 가짜 오류 주의: 「Not currently importing anything」이 떠도 반영됐을 수 있음 → 아래 검증 쿼리로 확인
--   npx wrangler d1 execute webapp-production --remote --command "SELECT id,maturity_date,maturity_confirmed FROM loans WHERE id IN (2,3,5,6,8,18)"
CREATE TABLE IF NOT EXISTS _bak_0819_loans_maturity AS SELECT * FROM loans WHERE id IN (2,3,5,6,8,18);
UPDATE loans SET maturity_date='2026-09-20', current_rate=3.9,  maturity_confirmed=1, notes=COALESCE(notes,'')||' | maturity/rate verified 2026-08-19 (hana bank xls)' WHERE id=6;
UPDATE loans SET maturity_date='2027-03-30', current_rate=4.75, maturity_confirmed=1, notes=COALESCE(notes,'')||' | maturity/rate verified 2026-08-19 (hana bank xls)' WHERE id IN (2,3,8);
UPDATE loans SET maturity_date='2027-03-30', current_rate=4.7,  maturity_confirmed=1, notes=COALESCE(notes,'')||' | maturity/rate verified 2026-08-19 (hana bank xls)' WHERE id=5;
UPDATE loans SET maturity_date='2027-03-30', current_rate=5.45, maturity_confirmed=1, notes=COALESCE(notes,'')||' | maturity/rate verified 2026-08-19 (hana bank xls)' WHERE id=18;
