-- 0336: quotation_items의 print-system 잔존 컬럼 물리 제거
-- print_media/print_methods 시스템 폐기(신모델 전환). 해당 컬럼은 FK 없음·인덱스 없음 → ALTER DROP COLUMN 가능.
-- 코드 참조(quotations.ts INSERT/SELECT, models.ts) 전량 제거 후 적용.
-- 참고: items.print_method_id/print_media_id/parent_media_id 3개는 inline FK(+parent_media_id 인덱스)라
--       SQLite DROP COLUMN 불가 + 참조테이블 재빌드도 D1(workerd FK가드)에서 롤백되어 물리 제거 불가.
--       → 코드 참조만 제거해 dead NULL로 잔존(무해).
ALTER TABLE quotation_items DROP COLUMN media_subcategory_name;
ALTER TABLE quotation_items DROP COLUMN print_method_id;
ALTER TABLE quotation_items DROP COLUMN print_method_name;
ALTER TABLE quotation_items DROP COLUMN print_media_id;
ALTER TABLE quotation_items DROP COLUMN print_media_name;
