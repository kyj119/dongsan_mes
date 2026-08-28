-- 품목 원가(items.avg_unit_cost) backfill — 매입 실적(purchase_order_items) 기반
-- 2026-07-19 최초 적용 (prod, 315개 품목). 재실행 멱등(매입 증가 시 주기적 재실행 가능).
--
-- ⛔⛔ 재실행 전 반드시 `npm run audit:avgcost` — 바뀔 품목을 먼저 눈으로 본다. ⛔⛔
--     재고 평가액이 움직이는 작업이다. 백업 없이 돌리지 않는다.
--
-- ════════════════════════════════════════════════════════════════════════════
-- ★2026-08-27 공식 수정 — 그대로 돌렸으면 재고 평가액이 6,147만 → 30억이 됐다
-- ════════════════════════════════════════════════════════════════════════════
-- 두 가지가 어긋나 있었다.
--
-- ① **base 리베이스를 몰랐다** (2026-08-19~20). 그때 `avg_unit_cost` 축이 관리단위(롤)에서
--    **`base_unit`(yd·M)** 으로 내려갔는데, `poi.quantity` 는 여전히 **롤 수**다.
--    그래서 `SUM(amount)/SUM(quantity)` 가 「롤 단가」를 낸다 → 원단 43품목이 **정확히
--    pack_size 배**(50배) 튄다(`FLEXN-130` 2,080 → 110,964 · `SPM011G-152` 2,831 → 143,706).
--    backfill 마지막 실행은 **08-07**, 리베이스는 08-19~20 — **리베이스 이후 한 번도 안 돌았다.**
--    ⇒ 분모를 base 축으로 환산한다. 계수 정본 = `src/utils/unitConvert.ts` `packFactor()`
--       (`base_unit` 이 있고 `unit` 과 **다를 때만**. AQ* 계열의 130 은 실사 입력 편의 계수라
--        환산 대상이 아니다 — 마이그 0540).
--
-- ② **뭉친 전표 라인이 분모에 1 로 들어갔다.** 수량 1 · 단가=금액인 월합계 라인이다.
--    `ACC-051` 22,000 → 25,575(+16%) · `ACC-052` 35,000 → 40,968(+17%) · `ACC-053` 11,000 → 14,545(+32%).
--    ⇒ 분자·분모 모두 **수량 라인만** 쓴다.
--
-- ⚠️⚠️ `quantity > 1` 을 **대상 선정에도** 걸어야 한다. 안 걸면 「뭉침만 있는 품목」의
--       분모가 0 이 되어 `avg_unit_cost` 가 **NULL 로 날아간다**.
--       그리고 「수량 1 = 뭉침」이 아니다 — **1롤씩 사면 원래 그 모양**이다(서울경금속 168행).
--       근거가 없으므로 그런 품목(112개)은 **아예 손대지 않고 현재 값을 보존**한다.
--
-- ★그래서 옛 「전표 뭉치 품목 제외 목록」(하드코딩 20여 품목을 0 으로 덮던 블록)을 **삭제했다.**
--   ⑴ 대상 선정이 그 일을 규칙으로 해 준다 — 뭉침만 품목은 애초에 UPDATE 되지 않는다.
--   ⑵ 손목록은 **조용히 낡는다**. 실제로 `ACC-051`·`ACC-052`·`ACC-053`·`ACC-034` 는 08-26~27 에
--      적요 분해로 실수량이 생겼는데 목록에는 그대로 남아 있어, 재실행했으면 **방금 채운 원가를
--      도로 0 으로 만들** 참이었다. 반대로 `ACC-055`(2,000 → 361,500)·`MAG-060`·`FLEXN-200` 은
--      같은 성격인데 목록에 **없었다**. (CLAUDE.md §IA 배포 「손목록 하드코딩」과 같은 병)
--   ⑶ 「이 품목은 원가를 모른다」를 알리는 일은 이미 `audit:items` C2 · `npm run report:lump` 가 한다.
--      backfill 이 0 으로 덮으면 **정합화된 기존 값까지 잃는다**(그 편이 더 나쁘다).
--
-- 검증 = `npm run audit:avgcost` — 현행 공식 어긋남 **121품목 → 수정 후 36품목**
--        (그중 86품목이 base 환산만으로 해결). 남은 36 = 뭉침만 8(미대상) + 수동 보정 28.
-- ════════════════════════════════════════════════════════════════════════════
--
-- 재실행 이력
--   2026-08-07 prod 재실행 (634품목) — 이카운트·SmartA 매입 이관이 07-19 **이후**에 들어와
--     주력 원단(폰지·태극기 인쇄원단·매쉬·후렉스·텐트천)이 전부 단가 0으로 남아 있었다.
--     결과: 0→값 309품목 · 기존값 갱신 57품목(대부분 ±3%, 신규 매입 반영) · 불변 268품목.
--     매출 원가커버 34.8% → **65.8%** (전사 0→96%, 솔벤 93→100%, 태극기 0→46%, UV 16→38%).
--     롤백 = `docs/price/rollback_avg_cost_2026-08-07.sql` (실행 전 634품목 값 그대로).
--     ⚠️ 재실행 전 확인한 것: ① CANCELLED 발주 라인 0건 ② `vat_included=1` 975줄도 amount 가
--       공급가(PO `total_amount` 와 원 단위 일치)라 VAT 왜곡 없음 ③ 수기 보정된 LED 단가 불변
--       ④ `inventory` 평가액·`inventory_auto_deductions` 모두 0이라 기존 재무 숫자 영향 없음.
--     분석 = `docs/analysis/2026-08-07-sales-cost-analysis.md` §5
--   2026-08-27 공식 수정(위 참조). **아직 재실행하지 않았다** — 바뀔 121품목을 용준님과 확인 후.
--
-- 방식: 품목별 가중평균 = SUM(amount) / SUM(quantity × packFactor)  — 수량 라인만
-- 소스: purchase_order_items. inventory_transactions 는 가격 IN 이 비어 recalculate-avg 가
--       동작 못 함 → 매입 원장에서 직접 backfill.
-- VAT: 입력값 그대로(데이터 vat_amount=0, 실거래액=선명 미지급 정합, 매출 order_items와 동일 기준).
-- 범위: **수량 라인이 있는 품목만** 갱신. 없는 품목은 미변경(현재 값 보존).
--
-- ⚠️ 향후 정식화: 매입 입고 → inventory_transactions IN 기록 → recalculate-avg 자동화(Policy B).
--    ⚠️`recalculate-avg`(`src/routes/inventoryValuation.ts:150`)도 **같은 base 환산이 필요**하다 —
--      지금은 `inventory_transactions` 가 사실상 비어 있어 드러나지 않을 뿐이다.

UPDATE items SET avg_unit_cost = (
  SELECT ROUND(SUM(poi.amount) * 1.0 / NULLIF(SUM(poi.quantity * (
    -- packFactor: base_unit 이 있고 unit 과 다를 때만 환산 (unitConvert.ts 정본과 동일)
    CASE WHEN items.base_unit IS NOT NULL AND items.base_unit <> items.unit
          AND COALESCE(items.pack_size, 0) > 0 THEN items.pack_size ELSE 1 END
  )), 0), 2)
  FROM purchase_order_items poi
  WHERE poi.item_id = items.id
    AND COALESCE(poi.unit_price, 0) > 0
    AND poi.quantity > 1              -- ★뭉친 전표(수량 1 = 월합계) 제외
)
WHERE id IN (
  SELECT DISTINCT item_id FROM purchase_order_items
  WHERE item_id IS NOT NULL AND COALESCE(unit_price, 0) > 0
    AND quantity > 1                  -- ★수량 라인이 없는 품목은 아예 대상이 아니다(현재 값 보존)
);
