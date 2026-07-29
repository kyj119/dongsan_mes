-- 0483_prefer_hohong_over_inktec.sql
-- 동폭 대체재 우선순위 지정 — 호홍을 우선 소비, 잉크테크를 후순위로.
--
-- 배경: dup_widths 감사가 잡은 4개 그룹은 코인텍/깃발천 건과 성격이 다르다.
--   제품명이 같고 제조사만 다른 **대체재**라 그룹을 나누는 게 아니라 순서를 준다.
--
--     켈 30M 호홍        900·1270 : KEL-*   ↔ KEL-IT-*
--     켈그레이 30M 호홍  900·1270 : KELG-*  ↔ KELG-IT-*
--     패트배너 30M 호홍 1270·1520 : PAT-*   ↔ PAT-IT-*
--     합성지 30M 호홍        1270 : SYN-127 ↔ SYN-IT-127
--
-- 방식: `items.group_sort` (자재 선택 규칙 ② — utils/autoDeductPostProcessingMaterials).
--   호홍 = 0(우선), 잉크테크 = 1(후순위). 폭매칭이 항상 호홍을 먼저 집는다.
--
-- ★ is_active 를 쓰지 않은 이유: 비활성으로 내리면 매입·발주·재고 화면에서도 사라져
--   실제로 잉크테크를 사올 때 곤란해진다. group_sort 는 **소비 순서만** 바꾸므로
--   양쪽 다 정상 품목으로 남고, 제조사를 바꿀 때는 값을 뒤집기만 하면 된다.
--   전환 UI = 품목 페이지 > 그룹 일괄 수정 > "우선 소비 자재"(동폭 경합 시에만 노출).
--
-- ⚠️ SYN-NA-127(비점착 합성지 30M 호홍)은 손대지 않았다 — 같은 호홍이지만 점착/비점착이
--    갈리는 별개 사양이라 대체재가 아니다. 그룹 분리 대상인지는 업무 확인 후 별건 처리.
--    (지금은 SYN-127 과 함께 group_sort=0 이라 id 순서로 SYN-127 이 선택된다)
--
-- 성격: 데이터 정정(UPDATE만). item_code 기준이라 멱등.

UPDATE items SET group_sort = 1, updated_at = CURRENT_TIMESTAMP
 WHERE item_code IN (
   'KEL-IT-090',  'KEL-IT-127',
   'KELG-IT-090', 'KELG-IT-127',
   'PAT-IT-127',  'PAT-IT-152',
   'SYN-IT-127'
 );

-- 호홍(기존 0)은 명시적으로 0을 재확인 — 이후 전환에서 되돌릴 때의 기준점.
UPDATE items SET group_sort = 0, updated_at = CURRENT_TIMESTAMP
 WHERE item_code IN (
   'KEL-060',  'KEL-090',  'KEL-127',  'KEL-152',
   'KELG-060', 'KELG-090', 'KELG-127', 'KELG-152',
   'PAT-060',  'PAT-090',  'PAT-127',  'PAT-152',
   'SYN-060',  'SYN-090',  'SYN-127',  'SYN-152'
 );
