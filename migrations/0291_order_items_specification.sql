-- 0291: order_items 규격(specification) 컬럼 추가
-- 목적: 유통품목(원단/시트 등) 주문 시 폭 등 규격을 주문에 저장 → 명세서·원장에서 차감/피킹 확인
-- 기존 width/height(REAL, cm)와 별개로, 자유 텍스트 규격을 담는다 (단위는 order_items.unit 사용)
-- items 마스터의 specification과 동일 명칭 사용 (일관성)
ALTER TABLE order_items ADD COLUMN specification TEXT;
