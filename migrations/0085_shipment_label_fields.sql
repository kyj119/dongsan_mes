-- clients 테이블: 거래처별 대신화물 기본 터미널
ALTER TABLE clients ADD COLUMN freight_terminal TEXT;

-- shipments 테이블: 라벨 수량 및 박스 수 (기본값 1)
ALTER TABLE shipments ADD COLUMN label_count INTEGER DEFAULT 1;
ALTER TABLE shipments ADD COLUMN box_count INTEGER DEFAULT 1;
