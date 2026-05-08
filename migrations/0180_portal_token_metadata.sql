-- 포털 토큰에 메타데이터 저장 (문서 유형, 주문ID, 기간 등)
ALTER TABLE portal_access_tokens ADD COLUMN metadata TEXT;
