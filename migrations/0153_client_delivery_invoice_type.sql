-- 거래처 배송정보 통합: freight_terminal → delivery_method + delivery_address

-- 1. 배송 관련 컬럼 추가 (이미 존재하면 에러 → wrangler가 마이그레이션 단위로 실행하므로 OK)
ALTER TABLE clients ADD COLUMN delivery_method TEXT DEFAULT 'SAME';
ALTER TABLE clients ADD COLUMN delivery_address TEXT;

-- 2. 기존 freight_terminal 데이터 이전 (delivery_method가 기본값일 때만)
UPDATE clients
SET delivery_method = 'FREIGHT',
    delivery_address = freight_terminal
WHERE freight_terminal IS NOT NULL AND freight_terminal != ''
  AND delivery_method = 'SAME';

-- 3. client_code 사업자번호 통합은 제거 (기존 코드 체계 유지)
-- 거래처 코드는 자동 채번 시스템으로 관리
