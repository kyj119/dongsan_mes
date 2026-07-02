-- 0438: 접수 시점 합배송 예약 (배송 후속 P1)
-- 신규 주문이 같은 거래처의 미출고 주문(root)을 가리키는 포인터.
-- 저장 시 root 해소(대상이 이미 포인터 보유 시 그 root를 저장) → 체인 없음.
-- 출고확정 시 ensureShipmentForOrder가 양방향 조회로 자동 합포장(shipments.merged_into_id).
-- /shipments 합포장 해제(unmerge) 시 그룹 내 예약도 함께 해제(NULL).
ALTER TABLE orders ADD COLUMN consolidate_with_order_id INTEGER;
