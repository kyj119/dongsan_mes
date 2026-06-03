-- 0288: 미수금 회수예측 4-3a — 거래처별 결제주기 모델
-- 설계: docs/superpowers/specs/2026-06-03-receivables-purchase-barobill-brainstorm.md
-- 기존 payment_terms_days(NET_DAYS)는 유지. 신규 컬럼은 모두 가산적 — 기본값이 현행 동작 보존.

-- 결제 주기 유형: NET_DAYS(청구건별 N일) | MONTHLY(월정산) | THRESHOLD(누적 임계, 로직 후순위)
ALTER TABLE clients ADD COLUMN payment_cycle_type TEXT NOT NULL DEFAULT 'NET_DAYS';
-- 마감일: NULL/0/99=말일, 1~28=특정일 (MONTHLY용)
ALTER TABLE clients ADD COLUMN closing_day INTEGER;
-- 결제월 오프셋: 0=당월, 1=익월, 2=익익월 (MONTHLY용)
ALTER TABLE clients ADD COLUMN payment_month_offset INTEGER DEFAULT 1;
-- 결제일: NULL/0/99=말일, 1~28=특정일 (MONTHLY용)
ALTER TABLE clients ADD COLUMN payment_day INTEGER;
-- 누적 정산 임계금액 (THRESHOLD용, 4-3d)
ALTER TABLE clients ADD COLUMN settlement_threshold REAL DEFAULT 0;
