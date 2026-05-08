-- 시트 배치 파라미터: 주문-레벨 배치 정보 (placements, canvas, margin 등)
-- sheet_layout_params가 있으면 IA PC에서 SheetLayout.jsx로 합본 처리
ALTER TABLE orders ADD COLUMN sheet_layout_params TEXT;
