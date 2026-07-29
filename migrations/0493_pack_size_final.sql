-- 0493_pack_size_final.sql
-- 롤당 길이 마무리 2품목 (사용자 확인)
--
-- ① 양면배너 후렉스(FLEXD-137) = 50m — 다른 후렉스 3그룹과 동일 규격
-- ② 유광코팅지-호홍(GCP-127) = 61m
--    무광코팅지 호홍 127폭이 120g=61m / 180g=45m 로 갈려 확인이 필요했던 건. 유광은 61m.
--
-- ※ 매쉬(MESH-127/160)는 '전사매쉬'가 맞고 yd 단위로 입고를 체크하므로(사용자)
--   pack_size 를 채우지 않는다 — 현수막 계열과 동일 처리.
--
-- 성격: 데이터 구조화(UPDATE만). `pack_size IS NULL` 조건이라 멱등.

UPDATE items SET pack_size = 50, updated_at = CURRENT_TIMESTAMP
 WHERE pack_size IS NULL AND is_active = 1 AND item_group = '양면배너 후렉스';

UPDATE items SET pack_size = 61, updated_at = CURRENT_TIMESTAMP
 WHERE pack_size IS NULL AND is_active = 1 AND item_group = '유광코팅지-호홍';
