-- 0370: (1) 소분류 '합성지' → '수성미디어' (2) 0369 코팅지 제조사 '호홍' 표기.
-- (1) 순수 데이터(코드 하드코딩 없음). pp_option 연결은 subcat_id 참조라 무영향.
-- (2) 그룹뷰가 item_group을 헤더로 표시하므로 item_name+item_group+PP material_item_group 동시 변경(차감 정합 유지). 멱등(이미 -호홍이면 IN 미매치).

-- (1) 소분류 이름 변경
UPDATE pp_applicable_subcategories SET subcat_name='수성미디어' WHERE subcat_name='합성지' AND group_name='실사출력';
UPDATE items SET sub_category='수성미디어' WHERE sub_category='합성지';

-- (2) 코팅지(무광120g/무광180g/유광) item_name + item_group 에 -호홍
UPDATE items SET item_name=item_name||'-호홍', item_group=item_group||'-호홍'
WHERE item_type='MATERIAL' AND item_group IN ('무광코팅지 120g','무광코팅지 180g','유광코팅지');

-- 코팅 PP옵션의 차감 키(material_item_group)도 동기화
UPDATE post_processing_options SET material_item_group=material_item_group||'-호홍'
WHERE material_item_group IN ('무광코팅지 120g','무광코팅지 180g','유광코팅지');
