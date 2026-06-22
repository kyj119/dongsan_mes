-- 0340: '현수막'(HANGING) 분류 비활성 — 신모델 8분류 정렬
--
-- 현수막은 인쇄방식별 제품(수성 현수막·솔벤 현수막 등)으로 각 분류(수성/솔벤/UV) 하위에 존재 →
-- 별도 '현수막' 최상위 분류는 불필요. prod에만 HANGING이 is_active=1로 남아 9번째 탭으로 노출됨
-- (로컬은 이미 비활성, 0332 정리 시 prod 누락). 참조 품목 5건(P-0001~0005)은 모두 비활성 legacy라
-- 비활성화만으로 충분(삭제 X — category_id FK ON DELETE RESTRICT). 멱등.
UPDATE item_categories SET is_active = 0 WHERE category_code = 'HANGING';
