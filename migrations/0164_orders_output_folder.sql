-- 주문 출력 파일 저장 경로 (Z드라이브)
-- C#이 파일 저장 완료 후 PATCH로 기록
ALTER TABLE orders ADD COLUMN output_folder TEXT;
