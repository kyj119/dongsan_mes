-- order_items에 파일 스케일 배율 컬럼 추가
-- scale_factor: 실제크기 / 파일크기 배율 (1:1=1, 1/5축소=5, 1/10축소=10)
-- Program.cs에서 margin을 scale_factor로 나누어 JSX에 전달 (블리드 cm 보정)
ALTER TABLE order_items ADD COLUMN scale_factor REAL DEFAULT 1;
