-- 0566: 품목 그룹 배정 정리 — 「그룹이 없다」가 아니라 「그룹은 있는데 배정이 안 됐다」
--
-- 배경 = 실사표·품목 선택기가 `item_group` 을 그룹 헤더로 쓰기 시작하면서(2026-09-04) 드러났다.
--   매입·활성 1,100품목 중 **162개가 그룹 없음**이고, 그중 상당수는 **형제가 이미 그룹을 갖고 있다**.
--   예: 스카시 7개 중 `SKS-50T-W-36` 만 · 광확산PC 4개 중 `PC-5T-M-48` 만 · 알마이트 2개 중 1개.
--   ★그 넷은 `0551` 에서 PRODUCT→MATERIAL 로 내린 바로 그 품목들이다 — **타입만 고치고 그룹을 안 채웠다.**
--   SGM(간판자재) 61개 중 55개도 이름이 기존 그룹명으로 시작한다(입체바 15·간판 후판 9·채널바 옆마구리 5…).
--
-- 규칙 = **품목명이 기존 그룹명으로 시작하면 그 그룹, 가장 긴 것 우선**.
--   데이터에서 뽑은 규칙이라 새 이름을 지어내지 않는다. 최장 우선이 아니면
--   「트러스바 보강대」가 「트러스바」로, 「간판 후판」이 「간판」으로 잘못 붙는다.
--   짧은 그룹명(까치발·도안지·발통·스카시·아일렛·아크릴) 오배정을 따로 훑었고 전부 맞았다.
--
-- ⚠️ **스냅샷을 먼저 뜬다.** 규칙이 `items` 를 읽으면서 `items` 를 고치면 방금 만든 그룹명이
--    후보로 섞여 결과가 실행 순서에 좌우된다. 고정 목록을 만들어 놓고 거기서만 찾는다.
-- ⚠️ 되돌리기 = `_bak_0566_item_group` 에 (id, item_group) 원본을 남긴다.
--    UPDATE items SET item_group = (SELECT b.item_group FROM _bak_0566_item_group b WHERE b.id = items.id)
--     WHERE id IN (SELECT id FROM _bak_0566_item_group);

DROP TABLE IF EXISTS _bak_0566_item_group;
CREATE TABLE _bak_0566_item_group AS
  SELECT id, item_group FROM items
   WHERE is_purchase_item = 1 AND is_active = 1;

DROP TABLE IF EXISTS _grp_snapshot_0566;
CREATE TABLE _grp_snapshot_0566 AS
  SELECT DISTINCT item_group AS g FROM items
   WHERE item_group IS NOT NULL AND item_group <> '';

-- ── ① 포맥스 = 제조사로 가른다 (용준님 2026-09-04) ────────────────────────────
-- ★일반 규칙에 맡기면 36개가 「포맥스」 하나로 뭉치는데, **국산·중국산의 규격이 같다**
--   (`2T 3x6 백색` 이 양쪽에 있다). 한 줄에 같은 칩이 두 번 나오면 어느 것을 누를지 알 수 없다.
--   품목명이 이미 제조사를 담고 있으므로 그 축을 그룹으로 올린다.
-- ⚠️ 「포맥스」 그룹은 `UV-FMX-*` 3개가 쓰고 있고 분류가 `UV` 라 트리에서 갈린다 — 그대로 둔다.
UPDATE items SET item_group = '포맥스 포마트(국산)', updated_at = datetime('now')
 WHERE item_code LIKE 'FMX-PMT-%' AND (item_group IS NULL OR item_group = '');
UPDATE items SET item_group = '포맥스 예스(중국산)', updated_at = datetime('now')
 WHERE item_code LIKE 'FMX-YES-%' AND (item_group IS NULL OR item_group = '');

-- ── ② 신규 그룹 — **형제가 둘 이상인 것만**(용준님) ────────────────────────────
-- 1개짜리 그룹은 묶는 의미가 없다. 단독 품목은 그룹 없이 둔다.

-- UV 아크릴 6 — 이름이 「UV 아크릴」로 시작해 일반 규칙(「아크릴」 접두)이 못 잡는다.
--   분류가 `UV` 라 원자재 아크릴과 트리에서 갈리므로 같은 이름을 써도 섞이지 않는다.
UPDATE items SET item_group = '아크릴', updated_at = datetime('now')
 WHERE item_code LIKE 'UV-ACR-%' AND (item_group IS NULL OR item_group = '');

-- 실내용 SMPS 8 — 「외부용 SMPS(방수)」 그룹이 이미 있어 대칭으로 만든다.
UPDATE items SET item_group = '실내용 SMPS(비방수)', updated_at = datetime('now')
 WHERE item_code LIKE 'SGM-SMPSI-%' AND (item_group IS NULL OR item_group = '');

-- 자동몰드 2 · 미니 근조기 2 — 둘 다 형제가 있고, 자동몰드는 **재고 행이 있어 실사에 뜬다**.
UPDATE items SET item_group = '자동몰드', updated_at = datetime('now')
 WHERE item_code IN ('ACC-MOLD-9', 'ACC-MOLD-24');
UPDATE items SET item_group = '미니 근조기', updated_at = datetime('now')
 WHERE item_code IN ('GJG-MINI-S50X70', 'GJG-MINI-RSET-50X75');

-- 용역·비용 7 — 재고로 세는 물건이 아니다(크레인 사용료·재단비·장비수리·외주가공).
-- ★`is_purchase_item` 은 **내리지 않는다** — 발주 이력이 있고(가로봉 도금 3 · 수기봉 도금 1 ·
--   갈바 외주 1 · 재단비 1) `ETC-MISC` 는 **주문 라인이 57건**인 판매 항목이다.
--   재고 행이 0이라 실사표에는 원래 안 뜨고, 선택기 후보에서만 한 덩어리로 모인다.
-- ⚠️`SGM-GALVA-OEM` 은 이미 1개짜리 「외주가공」 그룹이라 NULL 조건에 안 걸린다 → 코드로 덮는다.
UPDATE items SET item_group = '용역·비용', updated_at = datetime('now')
 WHERE item_code IN ('ETC-CRANE', 'ETC-CUT', 'ETC-MISC', 'ETC-REPAIR',
                     'SGM-GALVA-OEM', 'ACC-041-GA-PL', 'ACC-041-SU-PL');

-- ── ③ 일반 규칙 — 최장 접두 일치 (남은 것) ───────────────────────────────────
UPDATE items
   SET item_group = (
         SELECT t.g FROM _grp_snapshot_0566 t
          WHERE items.item_name LIKE t.g || '%'
          ORDER BY LENGTH(t.g) DESC LIMIT 1
       ),
       updated_at = datetime('now')
 WHERE is_purchase_item = 1 AND is_active = 1
   AND (item_group IS NULL OR item_group = '')
   AND EXISTS (SELECT 1 FROM _grp_snapshot_0566 t WHERE items.item_name LIKE t.g || '%');

DROP TABLE _grp_snapshot_0566;

-- ⚠️ 남는 것 — **단독 품목은 그룹 없이 둔다**(형제가 없어 묶을 대상이 없다).
--    그중 재고 행이 있는 것 셋: `GDS-OTB-GR`(원터치배너 그레이) · `SVCOAT-127`(솔벤용 코팅지) ·
--    `HJ-YMSIDE50-P127`(양면코팅지 50m — 형제 30m 는 그룹이 있으나 50m 는 이것 하나뿐).
--    실사 선택기에서 「(그룹 없음)」에 묶여 보인다. 거슬리면 1개짜리 그룹을 따로 만든다.
