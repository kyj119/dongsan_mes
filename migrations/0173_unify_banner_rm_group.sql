-- "현수막" 그룹의 "현수막 2코팅" 원자재를 "현수막 2코팅" 그룹으로 통일
UPDATE items SET item_group = '현수막 2코팅'
WHERE item_type = 'MATERIAL' AND item_group = '현수막' AND item_name = '현수막 2코팅' AND is_active = 1;
