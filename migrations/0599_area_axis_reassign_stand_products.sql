-- 0599: 면적이 변수가 아닌 6종을 AREA → FIXED 로 재배치 (금액은 안 건드린다)
--
-- 무엇이 잘못됐나:
--   `pricing_method='AREA'` 는 「면적이 가격을 정한다」는 뜻이다. 그런데 이 6종은 거치대가 있는
--   완제품이라 규격이 제품 사양으로 고정돼 있고, 영업은 **장당**으로 판다(용준님 확인 2026-09-09:
--   "실내배너는 출력 제품이 아닌 거치대 상품, EA 단위, 면적은 사실상 의미가 없다").
--   AREA 로 두면 `unit_price` 가 ㎡단가가 되는데, 청구면적이 늘 같으므로 그 값은
--   **장당가 ÷ 상수**일 뿐이다 — 정보가 없고 사람만 헷갈린다(0596 이 고친 그 표기 문제의 뿌리).
--
-- 면적 과금이 아니라는 근거 — prod 실측 2026-09-09. 장당가가 면적을 **역행**한다:
--   TRWK-ME-F  51×122 → 8,438원/장   ·  52×103 → 9,800원/장   (더 작은 쪽이 더 비싸다)
--   TRWK-ME-H  43×110 → 8,676       ·  43×102 → 8,000  ·  40×100 → 10,000
--   AQ-INB     60×180 **단 하나의 규격**으로 107라인 전부(1,206장·870만원)
--   6종 모두 단위가 `EA` 이고 규격 종류가 1~3 뿐이다.
--   ※ 규격 종류가 많은 품목(수성 패트 148종·솔벤 매쉬 45종)은 최빈 규격 비중이 높아도
--     면적이 실제 변수이므로 **건드리지 않는다**. 판정 기준은 최빈 비중이 아니라 규격 종류 수다.
--
-- 무엇을 하나:
--   ① `order_items.unit_price` = ROUND(amount ÷ quantity)  ← ㎡단가를 장당가로. `amount` 불변.
--   ② `auto_amount` = amount, `line_discount` = 0 로 스냅샷 재정렬
--      (전 라인 에누리 0건·PENDING 0건을 사전 확인했다. FIXED 에서 auto = 장당가×수량 = amount 다)
--   ③ `items.base_price` (정가) 도 같은 축으로 = ROUND(㎡단가 × 최빈규격 청구면적)
--      검산: TRFB 3,100×1.6 = 4,960 vs 실측 장당 5,000 · TRWK-ME-S 6,900×1.3 = 8,970 vs 8,714
--   ④ `items.pricing_method` = 'FIXED'
--   규격(`width`·`height`)은 **그대로 둔다** — 생산·작업지시·명세서가 쓴다. 과금에만 안 쓸 뿐이다.
--
-- 파급 확인(코드를 읽고 확인함):
--   · `utils/orderLineAmount.computeLineAmount` → FIXED 분기 = 단가×수량 → auto = amount ✅
--   · `routes/prices.ts` `AREA_UNIT_PRICE_SQL` → AREA 일 때만 되나눈다. FIXED 는 `ELSE oi.unit_price`
--     = 우리가 넣은 장당가를 그대로 제안한다 ✅ (`AREA_USABLE_SQL` 도 `pricing_method <> 'AREA'` 로 통과)
--   · `min_billing_side_cm` 은 FIXED 에서 안 읽힌다 — 남겨 둬도 무해하고, 되돌릴 때 필요하다.
--
-- 안전성: `amount` 불변(실제 청구액이자 이카운트 대사 기준). 수량 0/NULL·금액 0 라인은 제외.
-- 멱등: 목표값과 같으면 제외한다(0530·0596 과 같은 규칙).
-- ★prod 적용 완료 2026-09-09 (품목 6종 · 라인 231건). 파일 번호만 상류 충돌로 0597→0599 이고,
--   백업 테이블명은 적용 당시 이름(`_bak_0597_*`)을 그대로 쓴다 — 바꾸면 되돌리기 근거가 갈라진다.
--
-- 되돌리기: `_bak_0597_lines`(라인 단가·auto·에누리) · `_bak_0597_items`(품목 축·정가).

CREATE TABLE IF NOT EXISTS _bak_0597_items (
  id INTEGER PRIMARY KEY, pricing_method TEXT, base_price
);
CREATE TABLE IF NOT EXISTS _bak_0597_lines (
  id INTEGER PRIMARY KEY, unit_price, auto_amount, line_discount
);

DROP TABLE IF EXISTS _tmp_0597_items;
CREATE TABLE _tmp_0597_items AS
SELECT i.id,
       i.pricing_method AS old_pm,
       i.base_price     AS old_base,
       -- 최빈 규격의 청구면적(㎡) = 10cm 올림 후 최소 변 적용
       (SELECT MAX(CEIL(t.w / 10.0) * 10, COALESCE(i.min_billing_side_cm, 100)) / 100.0
             * MAX(CEIL(t.h / 10.0) * 10, COALESCE(i.min_billing_side_cm, 100)) / 100.0
          FROM (SELECT oi.width AS w, oi.height AS h, COUNT(*) AS c
                  FROM order_items oi
                 WHERE oi.item_id = i.id AND oi.width > 0 AND oi.height > 0
                 GROUP BY oi.width, oi.height
                 ORDER BY c DESC, oi.width DESC LIMIT 1) t) AS top_area
  FROM items i
 WHERE i.item_code IN ('AQ-INB', 'AQ-MNB', 'TRFB', 'TRWK-ME-S', 'TRWK-ME-F', 'TRWK-ME-H')
   AND i.pricing_method = 'AREA';

-- 원본 보존 (재실행해도 처음 값만 남는다)
INSERT INTO _bak_0597_items (id, pricing_method, base_price)
SELECT t.id, t.old_pm, t.old_base FROM _tmp_0597_items t
 WHERE NOT EXISTS (SELECT 1 FROM _bak_0597_items b WHERE b.id = t.id);

INSERT INTO _bak_0597_lines (id, unit_price, auto_amount, line_discount)
SELECT oi.id, oi.unit_price, oi.auto_amount, oi.line_discount
  FROM order_items oi
 WHERE oi.item_id IN (SELECT id FROM _tmp_0597_items)
   AND NOT EXISTS (SELECT 1 FROM _bak_0597_lines b WHERE b.id = oi.id);

-- ① 라인 단가 = 장당가, ② 스냅샷 재정렬
UPDATE order_items
   SET unit_price   = ROUND(amount / quantity),
       auto_amount  = amount,
       line_discount = 0,
       updated_at   = CURRENT_TIMESTAMP
 WHERE item_id IN (SELECT id FROM _tmp_0597_items)
   AND quantity IS NOT NULL AND quantity <> 0
   AND amount IS NOT NULL AND amount <> 0
   AND ROUND(amount / quantity) <> unit_price;

-- ③ 정가(base_price)도 같은 축으로
UPDATE items
   SET base_price = (SELECT ROUND(t.old_base * t.top_area) FROM _tmp_0597_items t WHERE t.id = items.id),
       updated_at = CURRENT_TIMESTAMP
 WHERE id IN (SELECT id FROM _tmp_0597_items WHERE old_base > 0 AND top_area > 0);

-- ④ 과금축 전환 (마지막 — 앞 단계들이 옛 축을 읽어야 한다)
UPDATE items
   SET pricing_method = 'FIXED',
       updated_at = CURRENT_TIMESTAMP
 WHERE id IN (SELECT id FROM _tmp_0597_items);

DROP TABLE _tmp_0597_items;
