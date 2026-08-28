-- ============================================================================
-- 2026-08-27 (10) 원가 정합화 — 수동 라운드값을 **매입 실적**으로 맞춘다 (용준님 위임)
--
-- ★대상 산정: `npm run audit:avgcost` 가 「수정 공식과 5% 넘게 어긋난다」고 지목한 것 중
--   **수량 라인이 있는** 것들. 뭉침만 품목(8개)은 실단가를 알 길이 없어 애초에 대상이 아니다.
--   121품목이 아니다 — 121 은 **옛 공식**이 바꿀 뻔한 수(대부분 pack_size 배 오류)이고,
--   수정 공식 기준으로 실제 값이 움직이는 건 **28품목**, 그중 24품목을 여기서 맞춘다.
--
-- ── 왜 매입 실적이 정본인가 ─────────────────────────────────────────────────
-- 잉크 14품목이 **전부 딱 떨어지는 값**이다 — KM 열전사 6색이 **전부 12,000**,
-- 코스테크 수성 2색이 **전부 11,000**, TPM 20L 4색이 **전부 200,000**.
-- 매입 가중평균이 우연히 이렇게 나올 수 없다 → **사람이 넣은 임시값**이고,
-- 그때는 매입 이력이 없었거나 얕았다. 지금은 품목당 3~6건이 쌓였다.
-- `backfill_avg_cost.sql` 의 설계 의도 자체가 「매입 원장에서 직접 산출」이다.
--   예: `RM-I0057` 12,000 → **13,772.73**(5건 02-11~07-27). 11% 낮게 잡히고 있었다.
--
-- 원단 9품목(BUJIK·FLEXL·FLEXN·SVM)도 같다 — 08-11~12 통합 작업에서 계산해 넣은 값인데
-- 그 뒤 07월까지 매입이 더 쌓였다(`FLEXL-100` 5건 01-22~07-27). 최신 실적이 정본이다.
--
-- ⛔**오늘(2026-08-27) `updated_at` 이 찍힌 4품목은 건드리지 않는다** —
--   `ACC-015` · `FMX-PMT-2T-48` · `FMX-PMT-8T-48` · `FMX-PMT-10T-48`.
--   다른 세션이 진행 중인 작업일 수 있다(포맥스는 08-26 분류 정비 계열). 재고 0 이라 급하지 않다.
--   ⇒ 다음 `audit:avgcost` 에 그대로 남는다. 사라지지 않으니 잊히지 않는다.
--
-- ⛔**품목 코드를 손으로 나열하지 않는다** — 조건식으로 고른다(backfill 하드코딩 명단이
--   양방향으로 낡아 폐기된 게 오늘이다). 실제로 무엇이 바뀌었는지는 백업 테이블이 남긴다.
--
-- 영향: 재고 평가액 **+157,048원**(6,147만의 0.26%). 재고를 가진 건 5품목뿐이고
--   나머지는 원가율·마진 계산에만 반영된다.
-- ============================================================================

DROP TABLE IF EXISTS _bak_0827_avgcost;
CREATE TABLE _bak_0827_avgcost AS
  SELECT i.id, i.item_code, i.avg_unit_cost AS old_cost, i.updated_at AS old_upd
    FROM items i
   WHERE i.is_active = 1
     AND COALESCE(i.avg_unit_cost, 0) > 0
     AND substr(COALESCE(i.updated_at, ''), 1, 10) <> '2026-08-27'
     AND EXISTS (SELECT 1 FROM purchase_order_items p
                  WHERE p.item_id = i.id AND p.unit_price > 0 AND p.quantity > 1)
     AND ABS((SELECT SUM(p.amount) * 1.0 / NULLIF(SUM(p.quantity * (
                CASE WHEN i.base_unit IS NOT NULL AND i.base_unit <> i.unit
                      AND COALESCE(i.pack_size, 0) > 0 THEN i.pack_size ELSE 1 END)), 0)
               FROM purchase_order_items p
              WHERE p.item_id = i.id AND p.unit_price > 0 AND p.quantity > 1)
             - i.avg_unit_cost) > i.avg_unit_cost * 0.05;

-- 공식은 `docs/price/backfill_avg_cost.sql` 과 **글자 그대로 같아야 한다** — 다르면 다음
-- 재실행이 여기서 넣은 값을 도로 흔든다.
UPDATE items SET
  avg_unit_cost = ROUND((
    SELECT SUM(p.amount) * 1.0 / NULLIF(SUM(p.quantity * (
      CASE WHEN items.base_unit IS NOT NULL AND items.base_unit <> items.unit
            AND COALESCE(items.pack_size, 0) > 0 THEN items.pack_size ELSE 1 END)), 0)
      FROM purchase_order_items p
     WHERE p.item_id = items.id AND p.unit_price > 0 AND p.quantity > 1), 2),
  updated_at = datetime('now', '+9 hours')
WHERE id IN (SELECT id FROM _bak_0827_avgcost);

-- ============================================================================
-- 검증
--   SELECT COUNT(*) FROM _bak_0827_avgcost;                 -- 24 이어야 한다
--   SELECT b.item_code, b.old_cost, ROUND(i.avg_unit_cost,2) new_cost
--     FROM _bak_0827_avgcost b JOIN items i ON i.id = b.id ORDER BY b.item_code;
--   npm run audit:avgcost   -- 「수량 라인이 있는데도 어긋나는」이 28 → **4** 로 줄어야 한다
--
-- ── 롤백 ────────────────────────────────────────────────────────────────────
-- UPDATE items SET avg_unit_cost=(SELECT b.old_cost FROM _bak_0827_avgcost b WHERE b.id=items.id),
--                  updated_at   =(SELECT b.old_upd  FROM _bak_0827_avgcost b WHERE b.id=items.id)
--  WHERE id IN (SELECT id FROM _bak_0827_avgcost);
-- ============================================================================
