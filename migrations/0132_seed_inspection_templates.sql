-- 0132: 검수 체크리스트 기본 템플릿 시드 (5종)
-- 사용자 첫 사용 시 막막함 해소 — 카테고리별 템플릿 + 기본 항목
-- 모두 is_active=1, sort_order로 카테고리별 정렬

-- 1. 현수막 검수
INSERT INTO inspection_templates (template_name, category_name, is_active, sort_order)
  VALUES ('현수막 입고 검수', '현수막', 1, 1);
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '폭 확인', 'NUMERIC', '발주 폭 ±2cm 이내', 1, 1 FROM inspection_templates WHERE template_name='현수막 입고 검수';
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '길이 확인', 'NUMERIC', '발주 길이 ±5cm 이내', 1, 2 FROM inspection_templates WHERE template_name='현수막 입고 검수';
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '색상 일치도', 'PASS_FAIL', '디자인 시안 대비 색상', 1, 3 FROM inspection_templates WHERE template_name='현수막 입고 검수';
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '인쇄 선명도', 'PASS_FAIL', '얼룩/번짐/누락 없음', 1, 4 FROM inspection_templates WHERE template_name='현수막 입고 검수';
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '가장자리 처리', 'PASS_FAIL', '재단 깔끔, 미싱/돔보 정확', 0, 5 FROM inspection_templates WHERE template_name='현수막 입고 검수';

-- 2. 솔벤시트 검수
INSERT INTO inspection_templates (template_name, category_name, is_active, sort_order)
  VALUES ('솔벤시트 입고 검수', '솔벤시트', 1, 2);
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '폭 확인', 'NUMERIC', '발주 폭 ±1cm', 1, 1 FROM inspection_templates WHERE template_name='솔벤시트 입고 검수';
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '색상 일치도', 'PASS_FAIL', '디자인 시안 대비 색상', 1, 2 FROM inspection_templates WHERE template_name='솔벤시트 입고 검수';
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '접착력', 'PASS_FAIL', '시험 부착 테스트', 1, 3 FROM inspection_templates WHERE template_name='솔벤시트 입고 검수';
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '박리지 상태', 'PASS_FAIL', '찢김/벗겨짐 없음', 0, 4 FROM inspection_templates WHERE template_name='솔벤시트 입고 검수';

-- 3. 래핑시트 검수
INSERT INTO inspection_templates (template_name, category_name, is_active, sort_order)
  VALUES ('래핑시트 입고 검수', '래핑시트', 1, 3);
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '폭 확인', 'NUMERIC', '발주 폭 ±1cm', 1, 1 FROM inspection_templates WHERE template_name='래핑시트 입고 검수';
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '색상 일치도', 'PASS_FAIL', '디자인 시안 대비 색상', 1, 2 FROM inspection_templates WHERE template_name='래핑시트 입고 검수';
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '접착면 보호', 'PASS_FAIL', '오염/이물질 없음', 1, 3 FROM inspection_templates WHERE template_name='래핑시트 입고 검수';

-- 4. UV출력 검수
INSERT INTO inspection_templates (template_name, category_name, is_active, sort_order)
  VALUES ('UV출력 입고 검수', 'UV출력', 1, 4);
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '색상 정확도', 'PASS_FAIL', 'CMYK 색차 ΔE<3', 1, 1 FROM inspection_templates WHERE template_name='UV출력 입고 검수';
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '인쇄 선명도', 'PASS_FAIL', '얼룩/번짐/누락 없음', 1, 2 FROM inspection_templates WHERE template_name='UV출력 입고 검수';
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '표면 코팅', 'PASS_FAIL', 'UV 코팅 균일성', 0, 3 FROM inspection_templates WHERE template_name='UV출력 입고 검수';
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '재단 정확도', 'PASS_FAIL', '재단선 깔끔', 1, 4 FROM inspection_templates WHERE template_name='UV출력 입고 검수';

-- 5. 일반 자재 검수 (범용)
INSERT INTO inspection_templates (template_name, category_name, is_active, sort_order)
  VALUES ('일반 자재 입고 검수', NULL, 1, 99);
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '수량 확인', 'NUMERIC', '발주 수량 일치', 1, 1 FROM inspection_templates WHERE template_name='일반 자재 입고 검수';
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '외관 손상 여부', 'PASS_FAIL', '파손/오염 없음', 1, 2 FROM inspection_templates WHERE template_name='일반 자재 입고 검수';
INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
  SELECT id, '품목 일치', 'PASS_FAIL', '발주 품목과 동일', 1, 3 FROM inspection_templates WHERE template_name='일반 자재 입고 검수';
