-- 0444: 장/롤 분류 불일치 8건 정비 (2026-07-06, 사용자 결정: 8건 전부)
-- 배경: MATERIAL 품목에서 unit ↔ deduction_method 조합 비정합 8건 (prod 재고 0행 확인 → 무충돌 적기)
--   ① 조명시트 4종 + 도안지: unit='롤'·NONE → 롤 원단 표준(yd·ROLL)으로 통일.
--      간판 소비는 여전히 수동(제품 연결 0이라 자동차감 미발동), 간판 BOM 연결 시 즉시 작동 가능 상태로.
--   ② 볼로프 4/5mm: 부속 로프가 deduction=ROLL(0359 기본값 잔재) → NONE. 폭매칭+yd 차감 대상 아님.
--   ③ 그레이시트 SPM022G-105: 형제(127/137/152=yd)와 달리 unit='롤'인데 솔벤/UV 그레이시트
--      폭매칭 차감 풀 멤버 → 차감 엔진이 yd 기준 기록이라 수량 왜곡 위험 → yd 통일 + sub_category 형제 정합(NULL).
-- 멱등: UPDATE만, 재실행 무해.

-- ① 조명시트 LT/LC 4종 + 도안지 → yd + ROLL
UPDATE items SET unit = 'yd', deduction_method = 'ROLL'
WHERE item_code IN ('LT4071M', 'LT4080M', 'LT4510', 'LC6770P', 'RM-DOAN');

-- ② 볼로프 4/5mm → 차감 없음 (unit=EA 유지)
UPDATE items SET deduction_method = 'NONE'
WHERE item_code IN ('ACC-037-4MM', 'ACC-037-5MM');

-- ③ 그레이시트 105cm → yd + sub_category 형제 통일
UPDATE items SET unit = 'yd', sub_category = NULL
WHERE item_code = 'SPM022G-105';
