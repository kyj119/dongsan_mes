-- 0365: Phase1 소분류 매핑 — 신모델 제품에 sub_category 부여(후가공 게이팅용). 명확한 68제품(전사 깃발/만장기/어구실명제 7개는 0366 별도).
-- finishing.js loadItemPP(subcat)가 items.sub_category(텍스트)로 후가공을 게이팅. subcat=pp_applicable_subcategories.subcat_name 정합.
-- 기존 후가공(마감·돔보·펀칭·주석·오프셋)은 이미 이 소분류들에 연결됨 → 매핑 즉시 작동. 코팅/WAY는 Phase2~3.

-- 현수막 (실사출력): 현수막류 + 패트/켈/합성지/텐트천/매쉬(배너 천)
UPDATE items SET sub_category='현수막'
WHERE item_type='PRODUCT' AND is_active=1 AND item_name IN (
  '수성 현수막','게릴라 현수막','수성 패트','수성 켈','수성 켈 그레이','수성 합성지','수성 합성지 그레이','수성 텐트천',
  '솔벤 현수막','솔벤 매쉬','솔벤 텐트천','UV 현수막','UV 매쉬');

-- 시트 (실사출력): 시트/그레이시트/랩핑시트/윈도우필름(엠보·클리어)
UPDATE items SET sub_category='시트'
WHERE item_type='PRODUCT' AND is_active=1 AND item_name IN (
  '솔벤 시트','솔벤 그레이시트','솔벤 랩핑시트','UV 시트','UV 그레이시트','UV 랩핑시트','UV 엠보시트','UV 클리어필름');

-- 후렉스 (실사출력): 조명/비조명/양면배너후렉스
UPDATE items SET sub_category='후렉스'
WHERE item_type='PRODUCT' AND is_active=1 AND item_name IN (
  '솔벤 조명후렉스','솔벤 비조명후렉스','UV 조명후렉스','UV 비조명후렉스','UV 양면배너후렉스');

-- 평판출력 (실사출력): 자작나무
UPDATE items SET sub_category='평판출력'
WHERE item_type='PRODUCT' AND is_active=1 AND item_group='자작나무';

-- 가로등배너 (전사): 전사 가로등배너 4규격변종
UPDATE items SET sub_category='가로등배너'
WHERE item_type='PRODUCT' AND is_active=1 AND item_group='가로등배너';

-- 태극기: 나염 깃발류 전체
UPDATE items SET sub_category='태극기'
WHERE item_type='PRODUCT' AND is_active=1 AND category='태극기';
