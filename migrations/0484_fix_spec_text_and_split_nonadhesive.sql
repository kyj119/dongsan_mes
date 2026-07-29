-- 0484_fix_spec_text_and_split_nonadhesive.sql
-- ① specification(규격 표시문구) 오등록 정정 ② 비점착 합성지 분리 ③ LG조명용시트 폭 정정
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ① specification 정정 — 0482 는 width_mm 만 고쳤고 표시문구가 남아 있었다
--
--   솔벤 현수막 5품목·수성 저밀도 1품목의 규격이 전부 "90cm" 로 적혀 있었다.
--   width_mm(0482 정정) 과 specification 이 **서로 다른 컬럼**이라 함께 안 고치면
--   내부 계산은 맞는데 화면·발주서에는 계속 90cm 로 나간다.
--
--   ⚠️ 폭 정보가 items 에 두 벌(width_mm 숫자 / specification 문구)로 존재하는 구조 자체가
--      불일치의 원인이다. 지금은 값만 맞추고, 단일 소스화는 별건.
--
-- ② 비점착 합성지 분리
--   '합성지 30M 호홍' 1270mm 에 SYN-127(점착) ↔ SYN-NA-127(비점착) 이 함께 있었다.
--   같은 호홍이지만 점착/비점착은 대체 불가한 별개 사양 → 제조사 대체재(0483 group_sort)가
--   아니라 그룹 분리 대상.
--
-- ③ LG조명용시트 width_mm 정정 (사용자 확인: 실물 폭 122cm)
--   등록 1000mm/"100cm" ↔ 실물 1220mm. 매입 이력도 'LG조명용시트(켈/LA9423NH) [1220mm]' 로
--   1220 을 기재하고 있어 근거가 일치한다.
--
-- 성격: 데이터 정정(UPDATE만). item_code 기준이라 멱등.

-- ① specification 정정
UPDATE items SET specification =  '40cm', updated_at = CURRENT_TIMESTAMP WHERE item_code = 'SVB-040';
UPDATE items SET specification =  '50cm', updated_at = CURRENT_TIMESTAMP WHERE item_code = 'SVB-050';
UPDATE items SET specification =  '60cm', updated_at = CURRENT_TIMESTAMP WHERE item_code = 'SVB-060';
UPDATE items SET specification =  '80cm', updated_at = CURRENT_TIMESTAMP WHERE item_code = 'SVB-080';
UPDATE items SET specification = '110cm', updated_at = CURRENT_TIMESTAMP WHERE item_code = 'SVB-110';
UPDATE items SET specification =  '70cm', updated_at = CURRENT_TIMESTAMP WHERE item_code = 'AQD-070';

-- ② 비점착 합성지 분리
UPDATE items SET item_group = '비점착 합성지 30M 호홍', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'SYN-NA-127';

-- ③ LG조명용시트 폭 정정
UPDATE items SET width_mm = 1220, specification = '122cm', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'LGSHT-122';
