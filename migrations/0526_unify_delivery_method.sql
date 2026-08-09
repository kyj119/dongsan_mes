-- 0526: 배송방법 표기 통일 → '직접배송' (2026-08-09)
--
-- 같은 업무를 법인이 다르게 적어왔다: '직배'=동산(e1) 월 130~190건 · '직접배송'=선명(e2) 월 57~104건.
-- 정본은 '직접배송'(사용자 결정). 코드 SSOT = src/constants/deliveryMethod.ts
-- 설계 = docs/specs/2026-08-09-shipment-history-list.md §2-3
--
-- ⚠️ '배송' 206건을 같이 묶으면 안 된다. 그중 189건이 기초채권 이월 전표(E1-OPEN-*, ICM-*)이고
--    delivery_method='배송' 은 이관 생성기가 넣은 무의미한 기본값이다. 합치면 가짜 직접배송 실적 189건이 생긴다.
--    → 전표성 주문은 NULL(미기재)로 비우고, 나머지(실주문)만 '직접배송'으로 옮긴다.

-- ① 직배 → 직접배송 (주문)
UPDATE orders
   SET delivery_method = '직접배송'
 WHERE delivery_method = '직배';

-- ② '배송' 중 회계 전표성 주문 → NULL. 배송이 아니다.
UPDATE orders
   SET delivery_method = NULL
 WHERE delivery_method = '배송'
   AND (order_number LIKE 'ICM-%' OR order_number LIKE '%OPEN%');

-- ③ '배송' 중 남은 실주문 → 직접배송
UPDATE orders
   SET delivery_method = '직접배송'
 WHERE delivery_method = '배송';

-- ④ 거래처 기본 배송방법도 같이 통일 (주문 생성 시 기본값으로 흘러들어간다)
UPDATE clients
   SET delivery_method = '직접배송'
 WHERE delivery_method IN ('직배', '배송');
