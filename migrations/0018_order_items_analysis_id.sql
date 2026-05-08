-- 주문 품목별 AI 분석 요청 추적
-- order_items에 ai_analysis_id 추가: 어느 파일에서 온 그룹인지 품목 수준에서 추적
-- 이전에는 orders.ai_file_path (주문 단위 1개)만 저장 → 여러 파일 업로드 시 마지막 파일만 사용되는 버그
ALTER TABLE order_items ADD COLUMN ai_analysis_id INTEGER DEFAULT NULL;
