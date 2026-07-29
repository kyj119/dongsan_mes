-- 0482_fix_material_width_and_split_groups.sql
-- 자재 마스터 정정 2건 — ① width_mm 오등록 정정 ② 겉도는 품목 그룹 분리
-- (0480 코인텍 코팅지 · 0481 깃발천/미러천에 이은 dup_widths 감사 후속. 전수 스윕 결과)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ① width_mm 오등록 정정 (사용자 지시: 품목코드 값에 맞춘다)
--
--   품목코드 접미 = 폭(cm) 규약인데 아래 6품목이 전부 900mm 로 등록돼 있었다.
--   '솔벤 현수막' 그룹 900mm 에 6품목이 몰려 있던 게 그래서다(감사가 잡은 최대 군집).
--
--     SVB-040  900 → 400    SVB-080  900 →  800
--     SVB-050  900 → 500    SVB-110  900 → 1100
--     SVB-060  900 → 600    AQD-070  900 →  700
--
--   ⚠️ 폭은 표시값이 아니라 자재 폭매칭(autoDeductInventory·autoDeductPostProcessingMaterials)의
--      1차 선택 기준이다. 400mm 출력에 400mm 원단이 있는데도 900mm 로 등록돼 있으면
--      "출력폭 이상 최소폭"이 엉뚱하게 잡히고, 발주·재고 판단도 함께 틀어진다.
--   ⚠️ SVB-152·SVB-PR-152 의 1500 은 정정 대상 아님 — 같은 계열 AQ1-152 도 1500 이라
--      이 계열은 152→1500 관행일 수 있다(코팅지 계열만 152→1520). 근거 확보 전까지 보류.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ② 겉도는 품목 그룹 분리 (0481 과 동일 클래스 — 이름부터 별개 자재)
--
--     보조시트 LC2000   1000mm : LC2000-100 ↔ LGSHT-122 ↔ ULTRA-CAL-100 ↔ ULTRA-BOJO-100
--     패트배너 30M 호홍 1270mm : PAT-127 ↔ PAT-IT-127 ↔ PAT-BO-127(블랙아웃 패트)
--
--   각각 1품목이므로 그룹명 = 품목명(단독 품목은 동명 그룹 — 0481 과 동일 관행).
--   ⚠️ LGSHT-122 는 width_mm 도 어긋난다(코드상 1220 ↔ 등록 1000). 여기선 그룹만 분리하고
--      폭은 건드리지 않았다 — 지시 범위 밖이고, LG조명용시트 실물 폭 확인이 필요하다.
--   ⚠️ 패트배너의 잉크테크(PAT-IT-*)는 분리 대상이 아니다. 제품명이 같고 제조사만 다른
--      대체재라 그룹을 유지하고 group_sort 로 우선순위를 준다(0483).
--
-- 성격: 데이터 정정(UPDATE만). item_code 기준이라 멱등.

-- ① width_mm 정정
UPDATE items SET width_mm =  400, updated_at = CURRENT_TIMESTAMP WHERE item_code = 'SVB-040';
UPDATE items SET width_mm =  500, updated_at = CURRENT_TIMESTAMP WHERE item_code = 'SVB-050';
UPDATE items SET width_mm =  600, updated_at = CURRENT_TIMESTAMP WHERE item_code = 'SVB-060';
UPDATE items SET width_mm =  800, updated_at = CURRENT_TIMESTAMP WHERE item_code = 'SVB-080';
UPDATE items SET width_mm = 1100, updated_at = CURRENT_TIMESTAMP WHERE item_code = 'SVB-110';
UPDATE items SET width_mm =  700, updated_at = CURRENT_TIMESTAMP WHERE item_code = 'AQD-070';

-- ② 그룹 분리
UPDATE items SET item_group = 'LG조명용시트',  updated_at = CURRENT_TIMESTAMP WHERE item_code = 'LGSHT-122';
UPDATE items SET item_group = '울트라 보조시트', updated_at = CURRENT_TIMESTAMP WHERE item_code = 'ULTRA-BOJO-100';
UPDATE items SET item_group = '울트라 칼라시트', updated_at = CURRENT_TIMESTAMP WHERE item_code = 'ULTRA-CAL-100';
UPDATE items SET item_group = '블랙아웃 패트',  updated_at = CURRENT_TIMESTAMP WHERE item_code = 'PAT-BO-127';
