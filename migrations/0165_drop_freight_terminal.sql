-- freight_terminal 컬럼 제거 (delivery_method + delivery_address로 통합 완료)
ALTER TABLE clients DROP COLUMN freight_terminal;
