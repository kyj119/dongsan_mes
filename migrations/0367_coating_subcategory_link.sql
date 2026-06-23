-- 0367: Phase2 코팅 후가공(무광 PP-COAT-M / 유광 PP-COAT-G)을 '시트' 소분류에 연결.
-- finishing.js coating 분기와 함께 → 시트류(시트·그레이시트·랩핑시트·엠보·클리어필름) 주문 시 코팅 선택 가능 → 출고 시 코팅지 폭매칭 자동차감(엔진 0352).
-- 우선 '시트'만 연결(코팅 주 대상=실사 비닐 시트·윈도우필름). 현수막/후렉스 필요 시 동일 패턴으로 확장. (idempotent)
INSERT INTO pp_option_subcategories (pp_option_id, subcat_id)
SELECT o.id, s.id
FROM post_processing_options o
JOIN pp_applicable_subcategories s ON s.subcat_name='시트' AND s.group_name='실사출력'
WHERE o.option_code IN ('PP-COAT-M','PP-COAT-G')
  AND NOT EXISTS (SELECT 1 FROM pp_option_subcategories x WHERE x.pp_option_id=o.id AND x.subcat_id=s.id);
