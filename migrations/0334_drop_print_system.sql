-- 0334: 소재(print_media)·출력방식(print_methods) 시스템 제거 (단순 구조 모델 전환)
-- 신모델=인쇄방식별 개별제품 + 폭별원단(product_materials 연결) + autoDeductInventory.
-- 코드 디커플 선행 완료: items/cards/orders/quotations/priceList JOIN 제거, 설정 탭·주문폼 필터·printSystem 라우터 제거, 후가공=item.sub_category 직접.
-- ⚠️ items/quotation_items의 print_* 컬럼은 dead로 유지(테이블 재빌드 회피). 단 FK 참조값을 NULL로 비워야 부모 테이블 DROP 허용됨(SQLite는 참조 행 존재 시 DROP 거부).
UPDATE items SET print_media_id=NULL, print_method_id=NULL, parent_media_id=NULL
  WHERE print_media_id IS NOT NULL OR print_method_id IS NOT NULL OR parent_media_id IS NOT NULL;
UPDATE quotation_items SET print_media_id=NULL, print_method_id=NULL
  WHERE print_media_id IS NOT NULL OR print_method_id IS NOT NULL;
DROP INDEX IF EXISTS idx_items_print_method;
DROP INDEX IF EXISTS idx_items_print_media;
DROP TABLE IF EXISTS print_method_media;
DROP TABLE IF EXISTS media_material_groups;
DROP TABLE IF EXISTS print_media;
DROP TABLE IF EXISTS print_methods;
