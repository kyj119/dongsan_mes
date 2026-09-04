-- 0563: 회계 전표성 주문을 플래그로 구분 (명명 규칙 의존 제거)
--
-- 왜 필요한가
--   기초채권 이월(`*OPEN*`)·법인간 미러(`ICM-*`)는 status=SHIPPED 지만 실제 출고·판매가 아니다.
--   prod 197건 5억 3,936만. 걸러내지 않으면 「2025-12-31 출고 5.3억」이 뜨고 매출 통계가 오염된다.
--
--   지금까지는 `order_number LIKE 'ICM-%' OR LIKE '%OPEN%'` 로 걸렀는데, 이 방식은 **접두가 하나만
--   늘어나도 조용히 샌다**. 실제로 `E1-ACCT-1670 회계매출 1,150,000`(2026-06-30)이 그 규칙에 안 걸려
--   6월 매출에 들어가 있었다 — 코드 주석이 「후속 과제」로 지목했던 그 사고가 이미 일어난 상태였다.
--
-- ⚠️ 새 전표성 주문을 만들 때는 이 플래그를 직접 세운다. 이름으로 추론하지 않는다.

ALTER TABLE orders ADD COLUMN is_voucher INTEGER NOT NULL DEFAULT 0;

-- 기존분 백필 — 세 패턴 모두(멱등)
UPDATE orders SET is_voucher = 1
 WHERE is_voucher = 0
   AND (order_number LIKE 'ICM-%'
     OR order_number LIKE '%OPEN%'
     OR order_number LIKE 'E1-ACCT-%'
     OR order_number LIKE 'E2-ACCT-%'
     OR order_number LIKE 'E3-ACCT-%');
