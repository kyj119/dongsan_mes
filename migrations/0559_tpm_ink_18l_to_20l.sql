-- 0559: 티피엠 수성잉크 「18L」 표기 정정(→20L) + 20L 4종 평균원가 재계산
--
-- 확정 근거 = **티피엠은 18L 를 판매하지 않는다**(용준님 2026-09-04). 따라서 SmartA 세무전표의
--   「수성잉크(C)-18L」 은 **전표 오기**이고 실물은 20L 다.
--
-- ⚠️ 품목 연결은 이미 맞다 — 4행 전부 `RM-I-TPM-{C,M,Y,K}-20L` 에 붙어 있다. 옮길 것이 없고,
--    남은 건 ①전표에 남은 「18L」 글자 ②그 글자가 만든 평균원가 오염 둘이다.
--    ①을 고치는 이유: `0554`(잉크 ㎡단가)가 이 품명을 근거로 인용했다 —
--    글자를 그대로 두면 다음 분석이 「18L 통이 존재한다」를 또 재도출한다.
--
-- 이중계상 확인 = **없다**. TPM 잉크 매입 발주 8건의 전표일이 전부 별건이다
--   (3/10 5L · 3/31 세무 · 4/08 · 4/13 5L · 5/08 · 6/19 · 6/30 세무 · 7/31 세무).
--   3/31 세무전표에 대응하는 MES 원본 20L 발주가 없다 → 겹치지 않는 실매입이다.
--
-- ⚠️ 남는 물음(코드로 답할 수 없음) = 3/31 단가 **162,000**(8,100원/L)이 4/08 이후
--    **200,000**(10,000원/L)보다 19% 낮다. 20L 로 통합하면 이 구간이 「단가 인상」으로 기록된다.
--    실제 인상이었는지 전표 금액 오기인지는 티피엠 거래명세서로만 확정된다. 여기서는
--    **전표 금액을 그대로 신뢰**한다(품명만 오기로 판정).

-- ── 1. 전표 품명 「18L」 → 「20L」 (4행) ─────────────────────────────────────
-- ⚠️ 되돌리기 = UPDATE purchase_order_items SET item_name = replace(item_name,'-20L','-18L')
--               WHERE id IN (3800, 3801, 3802, 3803);
UPDATE purchase_order_items
   SET item_name = replace(item_name, '-18L', '-20L')
 WHERE id IN (3800, 3801, 3802, 3803)
   AND item_name LIKE '%-18L';

-- ── 2. 20L 4종 평균원가 재계산 ──────────────────────────────────────────────
-- 현재값은 이관 시점에 박힌 뒤 갱신된 적이 없다. K 는 3/31 단가 162,000 이 그대로 남아 있다.
--   C·M·Y  189,142.86 → 191,555.56  (9통 / 1,724,000)
--   K      162,000.00 → 181,000.00  (4통 /   724,000)
-- ⚠️ 앱의 `/inventory-valuation/recalculate-avg` 로는 **고쳐지지 않는다** — 그 경로는
--    `inventory_transactions` 의 IN 행만 보는데, 잉크는 IN 행이 0 이고 09-03 실사가 만든
--    `ADJUST` 1행뿐이며 `total_amount` 가 NULL 이다(`HAVING total_in > 0` 불충족).
--    그래서 매입 라인에서 직접 계산한다. 단위축은 **통** 하나로 일관(pack_size NULL·환산 없음)
--    이라 [[feedback-avg-cost-backfill-axis]] 의 base 축 혼동 위험은 없다.
-- ⚠️ 되돌리기 = UPDATE items SET avg_unit_cost = 189142.86
--               WHERE item_code IN ('RM-I-TPM-C-20L','RM-I-TPM-M-20L','RM-I-TPM-Y-20L');
--               UPDATE items SET avg_unit_cost = 162000 WHERE item_code = 'RM-I-TPM-K-20L';
UPDATE items
   SET avg_unit_cost = (
         SELECT ROUND(SUM(poi.amount) * 1.0 / NULLIF(SUM(poi.quantity), 0), 2)
           FROM purchase_order_items poi
          WHERE poi.item_id = items.id
       ),
       updated_at = datetime('now')
 WHERE item_code IN ('RM-I-TPM-C-20L', 'RM-I-TPM-M-20L', 'RM-I-TPM-Y-20L', 'RM-I-TPM-K-20L')
   AND EXISTS (SELECT 1 FROM purchase_order_items poi WHERE poi.item_id = items.id);
