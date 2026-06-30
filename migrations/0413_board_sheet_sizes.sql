-- 0413: 판재 보드 MATERIAL 사이즈(3×6/4×8) 변종 추가 — 0412의 사이즈 없는 보드 폐기·재구성. UV 평판 출력(0412)은 사이즈 무관 유지·재링크.
-- 포맥스=3×6+4×8 / 아크릴·폼보드·광확산PC·알마이트=4×8 / 스카시=3×6 (사용자 확정). 보드는 주문참조 0건이라 삭제 안전. 자작나무(BOARD)는 item_group 미포함=불변.
DELETE FROM product_materials WHERE material_item_id IN (SELECT id FROM items WHERE deduction_method='BOARD' AND item_group IN ('포맥스','아크릴','폼보드','스카시','광확산PC','알마이트'));
DELETE FROM items WHERE deduction_method='BOARD' AND item_group IN ('포맥스','아크릴','폼보드','스카시','광확산PC','알마이트');

INSERT INTO items (item_code,item_name,item_type,category,category_id,unit,base_price,sales_price,pricing_method,is_active,is_sales_item,is_purchase_item,production_required,item_group,specification,deduction_method,sheet_spec) VALUES
 ('FMX-2T-W-36','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','2T 백색 3x6','BOARD','3x6'),
 ('FMX-2T-W-48','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','2T 백색 4x8','BOARD','4x8'),
 ('FMX-2T-B-36','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','2T 검정 3x6','BOARD','3x6'),
 ('FMX-2T-B-48','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','2T 검정 4x8','BOARD','4x8'),
 ('FMX-3T-W-36','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','3T 백색 3x6','BOARD','3x6'),
 ('FMX-3T-W-48','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','3T 백색 4x8','BOARD','4x8'),
 ('FMX-3T-B-36','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','3T 검정 3x6','BOARD','3x6'),
 ('FMX-3T-B-48','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','3T 검정 4x8','BOARD','4x8'),
 ('FMX-5T-W-36','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','5T 백색 3x6','BOARD','3x6'),
 ('FMX-5T-W-48','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','5T 백색 4x8','BOARD','4x8'),
 ('FMX-5T-B-36','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','5T 검정 3x6','BOARD','3x6'),
 ('FMX-5T-B-48','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','5T 검정 4x8','BOARD','4x8'),
 ('FMX-8T-W-36','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','8T 백색 3x6','BOARD','3x6'),
 ('FMX-8T-W-48','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','8T 백색 4x8','BOARD','4x8'),
 ('FMX-8T-B-36','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','8T 검정 3x6','BOARD','3x6'),
 ('FMX-8T-B-48','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','8T 검정 4x8','BOARD','4x8'),
 ('FMX-10T-W-36','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','10T 백색 3x6','BOARD','3x6'),
 ('FMX-10T-W-48','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','10T 백색 4x8','BOARD','4x8'),
 ('FMX-10T-B-36','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','10T 검정 3x6','BOARD','3x6'),
 ('FMX-10T-B-48','포맥스','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'포맥스','10T 검정 4x8','BOARD','4x8'),
 ('ACR-2T-W-48','아크릴','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'아크릴','2T 백색 4x8','BOARD','4x8'),
 ('ACR-2T-B-48','아크릴','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'아크릴','2T 검정 4x8','BOARD','4x8'),
 ('ACR-2T-C-48','아크릴','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'아크릴','2T 투명 4x8','BOARD','4x8'),
 ('ACR-3T-W-48','아크릴','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'아크릴','3T 백색 4x8','BOARD','4x8'),
 ('ACR-3T-B-48','아크릴','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'아크릴','3T 검정 4x8','BOARD','4x8'),
 ('ACR-3T-C-48','아크릴','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'아크릴','3T 투명 4x8','BOARD','4x8'),
 ('ACR-5T-W-48','아크릴','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'아크릴','5T 백색 4x8','BOARD','4x8'),
 ('ACR-5T-B-48','아크릴','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'아크릴','5T 검정 4x8','BOARD','4x8'),
 ('ACR-5T-C-48','아크릴','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'아크릴','5T 투명 4x8','BOARD','4x8'),
 ('FOM-5T-W-48','폼보드','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'폼보드','5T 백색 4x8','BOARD','4x8'),
 ('SKS-10T-W-36','스카시','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'스카시','10T 백색 3x6','BOARD','3x6'),
 ('SKS-10T-B-36','스카시','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'스카시','10T 검정 3x6','BOARD','3x6'),
 ('SKS-20T-W-36','스카시','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'스카시','20T 백색 3x6','BOARD','3x6'),
 ('SKS-20T-B-36','스카시','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'스카시','20T 검정 3x6','BOARD','3x6'),
 ('SKS-30T-W-36','스카시','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'스카시','30T 백색 3x6','BOARD','3x6'),
 ('SKS-30T-B-36','스카시','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'스카시','30T 검정 3x6','BOARD','3x6'),
 ('PC-2T-M-48','광확산PC','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'광확산PC','2T 유백 4x8','BOARD','4x8'),
 ('PC-3T-M-48','광확산PC','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'광확산PC','3T 유백 4x8','BOARD','4x8'),
 ('ALM-2T-S-48','알마이트','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'알마이트','2T 은색 4x8','BOARD','4x8');

-- 재링크: UV 평판 출력 → 동일 (판재·두께·색상)의 보드 전 사이즈 (코드 = SUBSTR(UV,4)||'-%')
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0 FROM items p JOIN items m ON m.item_code LIKE SUBSTR(p.item_code,4) || '-%'
WHERE (p.item_code LIKE 'UV-FMX-%' OR p.item_code LIKE 'UV-ACR-%' OR p.item_code LIKE 'UV-FOM-%' OR p.item_code LIKE 'UV-SKS-%' OR p.item_code LIKE 'UV-PC-%' OR p.item_code LIKE 'UV-ALM-%') AND m.deduction_method='BOARD';
