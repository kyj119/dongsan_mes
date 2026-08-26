-- ============================================================================
-- 2026-08-26 잉크 단위 통일 (L → 통) — 실행 내역 + 롤백
--
-- 용준님 확정: "잉크는 전체적으로 통으로 하고, TPM은 5L·20L 두 가지, UV-NEW/UV-E413은 1L,
--               R50 UV = 2L. 전체적으로 잉크 단위는 통으로 통일해줘"
--
-- 왜 — 잉크 107품목은 전부 `deduction_method='NONE'`(자동차감 없음)이라 L 로 들 실익이 없고,
--      현장은 통으로 센다. 그런데 83품목이 `base_unit='L'` + `pack_size` 제각각(1·1.5·2·5)이라
--      **수량은 L, 단가는 통**인 계열이 생겼다(엡손 9140/8140). `audit:items` F1 게이트가 잡았다.
--
-- 매입 데이터 교차검증: 6개 계열 전부 **병(통) 개수 단위로 매입**된다
--   (EXT q=80/20 · PEB q=90/80 · TPM q=2/3 · 코스테크 q=16/300 · 엡손80610 q=1).
--   ⇒ 통 단가 = 매입 단가. 나뉘어 있던 품목만 되돌리면 된다.
--
-- 백업 (prod 상주):
--   _bak_0826_ink_items        128행  items(id·code·name·unit·base_unit·pack_size·avg_unit_cost·spec·desc)
--   _bak_0826_ink_inv          113행  inventory(id·item_id·entity_id·zone·quantity·safe_stock·reorder_point)
--   _bak_0826_ink_count_items  123행  inventory_count_items(id·count_id·item_id·수량·unit·per_pack_qty)
--
-- 결과: 재고 평가액 115,244,128 → 113,633,663 (−1,610,465 = 엡손 잉크 1.5배 부풀림분)
--       잉크 평가액  11,795,401 →  10,184,936
--       부족 경고 대상 21건 유지(엡손 재주문점도 같이 환산했으므로 늘지 않았다)
-- ============================================================================

-- ── 실행한 것 (참고 — 이미 반영됨) ──────────────────────────────────────────
-- ① 엡손 9140/8140 재고 수량 L → 통 (÷1.5). 전 품목이 정수로 떨어졌다 = 1.5L 판독 확증.
--    UPDATE inventory SET quantity = quantity / 1.5
--      WHERE item_id IN (SELECT id FROM items WHERE item_code BETWEEN 'RM-I0029' AND 'RM-I0039')
--        AND quantity <> 0;                                                         -- 11행
--
-- ② L 기준으로 나뉘어 있던 단가를 통 단가(매입 가중평균)로 되돌림.
--    코스테크 RM-I0007~0010 (7,333 → 11,000·10,636·10,333 — description 의 「1통=1.5L·11,000원」과 일치)
--    잉크테크 5L RM-I-PEB-*  (9,000 → 42,352~42,857)
--    UPDATE items SET avg_unit_cost = (SELECT ROUND(SUM(p.amount)*1.0/SUM(p.quantity),2)
--        FROM purchase_order_items p WHERE p.item_id=items.id AND p.unit_price>0 AND p.quantity>0)
--      WHERE item_code IN ('RM-I0007','RM-I0008','RM-I0009','RM-I0010',
--                          'RM-I-PEB-C-5L','RM-I-PEB-K-5L','RM-I-PEB-M-5L','RM-I-PEB-Y-5L') ...;  -- 8행
--
-- ③ 단위 축 통일 — 전 잉크.
--    UPDATE items SET base_unit = NULL, pack_size = NULL, unit = '통'
--      WHERE item_code LIKE 'RM-I%';                                                -- 126행
--    ※ pack_size 를 비우면 입고 환산이 ×1 이 되어 **입고 수량(통) = 재고 수량(통)** 으로 맞고,
--      실사 두칸 입력(통 × 통당 용량)이 사라져 통 개수만 세게 된다. 둘 다 의도한 결과다.
--
-- ④ R50 UV·평판 단가 L → 통 환산. description 에 「1통=2L(92,000원/L)」 이 적혀 있었고,
--    뭉친 전표 1,840,000 ÷ 184,000 = 10통 이 같은 description 의 「10통 주문 시 1통 무상」과 맞는다.
--    UPDATE items SET avg_unit_cost = 184000 WHERE item_code BETWEEN 'RM-I0040' AND 'RM-I0049'
--      AND avg_unit_cost = 92000;                                                   -- 10행
--
-- ⑤ 엡손 재주문점·안전재고도 같은 축으로 (÷1.5). RM-I0029 만 값이 있었다.
--    안 하면 5통 < 5.3(L기준) 이 되어 **없던 부족 경고가 뜬다**.                     -- 1행
--
-- ⑥ 실사 이력 121행(11회차)도 통으로. 두칸 입력이라 사람이 쓴 것은 원래 통 개수였다
--    (RM-I0032 8/07 = 3 L → **2통**). 안 하면 소모량 API(기초+매입−기말)가 단위 전환 지점에서 깨진다.
--    UPDATE inventory_count_items SET system_quantity = ROUND(system_quantity/1.5,2), ...
--      per_pack_qty = NULL, unit = '통' WHERE item_id IN (...RM-I0029~0039);         -- 121행
--
-- ⑦ 확인된 통 용량을 description 에 기록(엡손 1.5L·TPM 5L/20L·PEB 5L). UV·R50·코스테크는 이미 적혀 있었다.

-- ============================================================================
-- 롤백 — 위 순서의 역순. 백업 테이블이 정본이다.
-- ============================================================================

-- ⑥ 실사 이력 원복
UPDATE inventory_count_items SET
  system_quantity  = (SELECT b.system_quantity  FROM _bak_0826_ink_count_items b WHERE b.id = inventory_count_items.id),
  counted_quantity = (SELECT b.counted_quantity FROM _bak_0826_ink_count_items b WHERE b.id = inventory_count_items.id),
  unit             = (SELECT b.unit             FROM _bak_0826_ink_count_items b WHERE b.id = inventory_count_items.id),
  per_pack_qty     = (SELECT b.per_pack_qty     FROM _bak_0826_ink_count_items b WHERE b.id = inventory_count_items.id)
WHERE id IN (SELECT id FROM _bak_0826_ink_count_items);

-- ①⑤ 재고 수량·재주문점·안전재고 원복
UPDATE inventory SET
  quantity      = (SELECT b.quantity      FROM _bak_0826_ink_inv b WHERE b.id = inventory.id),
  safe_stock    = (SELECT b.safe_stock    FROM _bak_0826_ink_inv b WHERE b.id = inventory.id),
  reorder_point = (SELECT b.reorder_point FROM _bak_0826_ink_inv b WHERE b.id = inventory.id)
WHERE id IN (SELECT id FROM _bak_0826_ink_inv);

-- ②③④⑦ 품목 축·단가·설명 원복
UPDATE items SET
  unit          = (SELECT b.unit          FROM _bak_0826_ink_items b WHERE b.id = items.id),
  base_unit     = (SELECT b.base_unit     FROM _bak_0826_ink_items b WHERE b.id = items.id),
  pack_size     = (SELECT b.pack_size     FROM _bak_0826_ink_items b WHERE b.id = items.id),
  avg_unit_cost = (SELECT b.avg_unit_cost FROM _bak_0826_ink_items b WHERE b.id = items.id),
  specification = (SELECT b.specification FROM _bak_0826_ink_items b WHERE b.id = items.id),
  description   = (SELECT b.description   FROM _bak_0826_ink_items b WHERE b.id = items.id)
WHERE id IN (SELECT id FROM _bak_0826_ink_items);

-- 검증: 재고 평가액이 115,244,128 로 돌아오면 완전 원복이다.
--   SELECT CAST(SUM(inv.quantity*COALESCE(i.avg_unit_cost,0)) AS INT)
--   FROM inventory inv JOIN items i ON i.id=inv.item_id WHERE inv.quantity>0 AND i.is_active=1;

-- ============================================================================
-- 남은 판단 (용준님)
--   · RM-I-TPM-*-18L 4품목 — ✅ 아래 §추가 에서 20L 로 통합·하드삭제 완료.
--   · RM-I0011~0014 「현수막 잉크」 4품목 — 아래 §추가 에서 하드삭제 완료.
-- ============================================================================

-- ============================================================================
-- 추가 2026-08-26 — RM-I-TPM-*-18L 4품목 통합·하드삭제 (용준님 「18L는 잘 모르겠는데 통합하고 하드삭제」)
--
-- 전수 참조 스캔: `sqlite_master` 에서 item 참조 컬럼을 가진 38개 테이블 전량 확인
--   (item_id 21개 + material_item_id/product_item_id/item_code 등 대체 컬럼 17개).
--   걸린 것은 **purchase_order_items 4행뿐** — 재고·실사·BOM·주문·견적·알림 전부 0.
--
-- 통합: item_id 1663→1055(C) · 1664→1059(M) · 1665→1061(Y) · 1666→1057(K)
--   ★avg_unit_cost 는 200,000 **유지**(가중평균 191,556 으로 내리지 않았다).
--     18L↔20L 은 시점 차이가 아니라 **병 크기 차이**라, 섞으면 20L 원가가 내려간다 —
--     코스테크 `XP1000` 의 1.5L 병 ↔ 1kg 병 혼입과 같은 함정이고, 그때도 주력 규격가로 고정했다
--     ([[design-ink-inventory]] §단가 — 「색마다 다르다」는 대부분 착시다).
--   매입 라인의 `item_name` 스냅샷(「TPM잉크 C 18L」)은 **그대로 뒀다** — 실제로 산 물건의 이름이다.
--
-- 백업: _bak_0826_tpm18_items(4행) · _bak_0826_tpm18_poi(4행)
-- 검증: 잔여 18L 0 · 고아 매입라인 0 · 20L 매입 C/M/Y 9통·K 4통 흡수 확인
-- ============================================================================

-- 롤백
INSERT INTO items SELECT * FROM _bak_0826_tpm18_items;
UPDATE purchase_order_items SET item_id = (SELECT b.item_id FROM _bak_0826_tpm18_poi b WHERE b.id = purchase_order_items.id)
  WHERE id IN (SELECT id FROM _bak_0826_tpm18_poi);
-- description 의 통합 문구는 수동 제거(20L 4품목 id 1055·1057·1059·1061).

-- ============================================================================
-- 추가 2026-08-26 — RM-I0011~0014 「현수막 잉크-C/M/Y/K」 하드삭제 (용준님 확정)
--
-- 정체: `specification='TPM-20L'` 인 **빈 껍데기**. 실물 `RM-I-TPM-*-20L` 과 같은 물건을 가리키는데
--   매입·판매·재고·단가가 전부 0 이었다. `item_group='수성잉크 TPM'` 을 이것들이 차지하고 있어서
--   **실물 TPM 8품목이 「수성잉크 잉크테크」로 밀려나** 검색어 블롭까지 복사되는 원인이 됐다(같은 날 정정).
--
-- 전수 참조 스캔: item 참조 컬럼을 가진 38개 테이블 전량(item_id 21 + 대체 컬럼 17).
--   걸린 것은 **inventory 4행뿐** — 전부 수량 0 · 구역 미배정 · 안전재고/재주문점 0 (동산 e1).
--   매입·주문·견적·BOM·실사·알림·발주요청 전부 0.
--
-- 백업: _bak_0826_banner_ink_items(4행) · _bak_0826_banner_ink_inv(4행)
-- 검증: 잔여 0 · 고아 inventory 0 · 「수성잉크 TPM」 그룹 = 실물 8품목만 · 활성 품목 1,199 → 1,195
--       `audit:items` G1 0건(게이트는 C 4건만 남음 = 뭉친 전표, 기존 항목)
-- ============================================================================

-- 롤백
INSERT INTO items     SELECT * FROM _bak_0826_banner_ink_items;
INSERT INTO inventory SELECT * FROM _bak_0826_banner_ink_inv;
