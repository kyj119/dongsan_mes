-- 0309: 개인사업자 '오다플래그' 추가 (entity_id=4)
-- 용도: 급여/인사 관리 전용. 주문·생산·재고·매출·세금계산서 미사용.
-- 사업자정보: 사업자등록번호 889-16-02571 / 대표 안혜옥 / 제조업 / 현수막,깃발,태극기,광고물
-- 멱등: INSERT OR IGNORE (id 충돌 시 무시). 적용 시점 entities = 1,2,3,99 → id=4 비어있음.
INSERT OR IGNORE INTO entities
  (id, name, short_name, business_reg_no, representative, business_type, business_item, address, is_active, sort_order)
VALUES
  (4, '오다플래그', '오다플래그', '889-16-02571', '안혜옥', '제조업', '현수막,깃발,태극기,광고물', '대전광역시 서구 월드컵대로 484번길 187-50', 1, 4);
