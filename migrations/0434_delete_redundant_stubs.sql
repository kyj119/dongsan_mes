-- 0434_delete_redundant_stubs.sql
-- 비활성 stub 하드 삭제 (사용자: 비활성 말고 삭제). 참조 0 확인(order_items·product_materials).
-- 대상=플랫분리/중복정리로 남은 단순 stub(spec_group 없음, 기능 없음):
--   부속품 분리 잔재(ACC-029/030/035/045/047/049/050)·볼로프 base(ACC-037)·CPP 중복(CPP-E4/C4)
-- 보존=변종 모품목(TEMPLATE, spec_group 보유: 깃발 JG-JASU/BONYEOM·TGK-JASU·GJG-JASU·액자 GDS-LRF
--        + 간판바 SGM-*·조광/화진/프라임 coating base) — 변종 모델 기준(is_active=0 정상).
DELETE FROM items WHERE is_active=0 AND spec_group_id IS NULL AND item_code IN (
  'ACC-029','ACC-030','ACC-035','ACC-037','ACC-045','ACC-047','ACC-049','ACC-050','CPP-E4','CPP-C4'
);
