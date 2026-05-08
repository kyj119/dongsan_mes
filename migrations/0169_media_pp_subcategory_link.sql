-- 포맥스/폼보드 소재의 후가공 소분류를 '평판출력'으로 설정
UPDATE print_media SET subcategory_id = (
  SELECT id FROM pp_applicable_subcategories WHERE subcat_name = '평판출력' LIMIT 1
)
WHERE media_group IN ('포맥스', '폼보드') AND is_active = 1;
