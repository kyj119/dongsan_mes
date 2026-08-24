-- 긴급경영안정 1억(id7) 원금 개시일 확정 (2026-08-24, OLS 상환계획표 — 2년 거치)
-- 실행: npx wrangler d1 execute webapp-production --remote --file docs/analysis/2026-08-24-loan-id7-grace.sql
UPDATE loans SET notes=COALESCE(notes,'')||' | principal from 2028-04 (~2.78M/mo, OLS confirmed 2026-08-24)' WHERE id=7;
