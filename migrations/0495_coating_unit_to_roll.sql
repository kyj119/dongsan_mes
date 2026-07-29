-- 0495_coating_unit_to_roll.sql
-- 코팅지 계열 재고 단위 → '롤' 전환 27품목 (사용자: "코팅지도 시트처럼 롤로")
--
-- 0494(시트 36품목)와 같은 처리. 코팅지도 롤 단위로 매입되는데(MCP120-127 '60cm 61m' 등)
-- unit 이 yd 로 등록돼 있어 후가공 자재차감이 야드 길이를 빼고 있었다.
--
-- ★ 전환 조건은 0494 와 동일 — **차감 대상(deduction_method='ROLL')이고 pack_size 가
--   채워진 품목만**. 코드(utils/rollConsumption)가 `unit='롤' && pack_size>0` 일 때만
--   롤 수로 환산하므로, 롤길이 없는 품목을 롤로 바꾸면 yd 로 폴백해 표시만 어긋난다.
--
-- 대상 27품목:
--   무광코팅지 120g-호홍 4(61/45m) · 180g-호홍 4(45m) · SPP031M 5(50m)
--   유광코팅지 SPP031G 5(50m) · 유광코팅지-호홍 1(61m)
--   코인텍 계열 8 — UV무광 200g 3(45m) · 일반 140g 1(45m) · 일반 200g 2(45m) · 자동용 140g 2(45/61m)
--
-- ⚠️ 프라임(PJ-)·호진(HJ-)·JG- 코팅지 라인(약 25품목)은 **제외**한다.
--    `deduction_method='NONE'` 이라 애초에 자동차감을 하지 않고(그래서 pack_size 도 없다),
--    unit 이 'EA'(= 롤 개수)로 이미 개수 관리다. 단위를 바꿔도 실익이 없고 폴백만 만든다.
--    이 라인을 차감에 물리려면 deduction_method 부터 ROLL 로 올려야 하는데 그건 별도 판단.
-- ⚠️ '코팅지(판매)'·그룹 없는 1품목은 width_mm 이 NULL 이라 폭매칭 후보가 아니므로 제외.
--
-- ★ 이 마이그레이션은 코드(롤 분기)가 **이미 prod 에 배포된 뒤** 적용된다(deploy c0b16996).
--   0494 때처럼 마이그가 코드보다 앞서면 'unit=롤인데 계산은 yd' 상태가 생긴다.
--
-- 성격: 데이터 정정(UPDATE만). 조건이 `unit<>'롤'` 이라 멱등.

UPDATE items
   SET unit = '롤', updated_at = CURRENT_TIMESTAMP
 WHERE is_active = 1
   AND (item_name LIKE '%코팅지%' OR item_group LIKE '%코팅지%')
   AND COALESCE(deduction_method, 'ROLL') = 'ROLL'
   AND width_mm IS NOT NULL
   AND COALESCE(pack_size, 0) > 0
   AND COALESCE(unit, '') <> '롤';
