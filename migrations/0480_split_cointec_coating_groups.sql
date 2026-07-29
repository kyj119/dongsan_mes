-- 0480_split_cointec_coating_groups.sql
-- 코팅지 자재그룹 분류 정정 — 코인텍 8품목이 호홍 그룹에 섞여 있던 것을 분리.
--
-- 배경: 후가공 자재 폭매칭(utils/autoDeductPostProcessingMaterials)은 PP옵션에 매핑된
--   item_group 안에서 "출력폭 이상 최소폭" 자재를 고른다. 그런데 prod 그룹 구성이
--   아래처럼 제조사·평량·라미방식이 다른 품목을 한 그룹에 담고 있어 동폭 경합이 났다.
--
--   무광코팅지 120g-호홍  600 : 호홍120g(399) ↔ 코인텍 자동용140g(1088)
--                         900 : 호홍120g(400) ↔ 코인텍 일반140g(1091)
--                        1520 : 호홍120g(402) ↔ 코인텍 자동용140g(1087)
--   무광코팅지 180g-호홍  600 : 호홍180g(403) ↔ 코인텍 일반200g(1090) ↔ 코인텍 UV200g(1093)
--                         900 : 호홍180g(404) ↔ 코인텍 UV200g(1094)
--                        1270 : 호홍180g(405) ↔ 코인텍 일반200g(1089) ↔ 코인텍 UV200g(1092)
--
--   같은 자재의 중복 등록이 아니라 서로 대체 불가한 별개 자재다(호홍 120g ↔ 코인텍 140g,
--   호홍 180g ↔ 코인텍 200g, 자동용/일반은 라미네이터 방식이 갈림). 코인텍 8품목은
--   2026-06-23 등록 이후 매입·입고·차감 이력이 전부 0 → 그룹 오배치로 판단(사용자 확인).
--
-- 효과: 분리 후 코팅지 전 그룹에서 (item_group, width_mm) 중복 0.
--   PP옵션 매핑(post_processing_options.material_item_group)은 호홍 그룹을 계속 가리키므로
--   차감 대상은 불변(회귀 0). 코인텍을 실제로 쓰게 되면 그때 옵션 매핑을 새 그룹으로 바꾼다.
--
-- 성격: 데이터 정정(UPDATE만). item_code 기준이라 멱등 — 재실행해도 결과 동일.

UPDATE items SET item_group = '무광코팅지 자동용 140g-코인텍', updated_at = CURRENT_TIMESTAMP
 WHERE item_code IN ('MCA140-CO-060', 'MCA140-CO-152');

UPDATE items SET item_group = '무광코팅지 일반 140g-코인텍', updated_at = CURRENT_TIMESTAMP
 WHERE item_code IN ('MCN140-CO-090');

UPDATE items SET item_group = '무광코팅지 일반 200g-코인텍', updated_at = CURRENT_TIMESTAMP
 WHERE item_code IN ('MCN200-CO-060', 'MCN200-CO-127');

UPDATE items SET item_group = 'UV무광코팅지 200g-코인텍', updated_at = CURRENT_TIMESTAMP
 WHERE item_code IN ('MCUV200-CO-060', 'MCUV200-CO-090', 'MCUV200-CO-127');
