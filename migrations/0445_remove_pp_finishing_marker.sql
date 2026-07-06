-- 0445: PP-FINISHING 유령 마커 행 제거
-- 배경: 0176이 만든 pp_category='finishing' 마커(소분류 연결용, UI 비표시 전제).
--       0407 형(型)옵션 범용 렌더러가 미등록 pp_category를 전부 라벨+select로 노출 →
--       주문서 후가공에 "finishing" 영문 라벨 + '마감방식' 무기능 드롭다운 출현.
-- 근거: 소비 코드 없음(전수 grep), order_items.post_processing 내 PP-FINISHING 저장 이력 0건.
--       실제 마감 방식 UI는 finishing_methods 기반 별도 섹션으로 무관. (idempotent)

DELETE FROM pp_option_subcategories
WHERE pp_option_id IN (SELECT id FROM post_processing_options WHERE option_code = 'PP-FINISHING');

DELETE FROM post_processing_options WHERE option_code = 'PP-FINISHING';
