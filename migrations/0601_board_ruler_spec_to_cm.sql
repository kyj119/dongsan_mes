-- 0601: 자(尺) 판재 규격을 cm 칸에서 빼내고, 관례 표기는 `specification` 에 남긴다
--
-- 무엇이 잘못됐나:
--   판재는 현장에서 **3*6 · 4*8**(자)로 부른다 — 그게 맞는 표기다. 그런데 그 숫자가 면적 계산에 쓰이는
--   `width`·`height`(cm) 칸에 그대로 들어가 있어서, 청구면적이 3cm×6cm = **0.0018㎡** 로 계산된다.
--   최소청구 1m 가 있던 동안은 면적이 1㎡ 로 뭉개져 아무도 몰랐다. UV 판재가 실면적 청구
--   (`min_billing_side_cm=0`)로 바뀌자 분모가 무너져, 되나누기가 **정확히 100배**로 튀었다(0596 사고).
--
-- 표기와 계산을 나눈다 — 구조가 이미 지원한다:
--   `specification` = `3*6`   → 거래명세서·견적서가 **이 값을 우선 표시**한다(`invoice.js:105`).
--   `width`/`height` = 90/180 → 면적 계산 전용. 화면에는 안 나간다.
--
-- ★90×180 이지 91×182 가 아니다(용준님 2026-09-09): 실물은 910×1820mm 지만 **통상 90*180 으로 표기**하고
--   영업도 그렇게 입력한다. 청구면적이 1.62㎡(90×180) vs 1.9㎡(91→100·182→190, 10cm 올림) 로 **17% 갈린다** —
--   통상 표기를 써야 다음 주문에서 같은 규격을 넣었을 때 파생 ㎡단가가 그대로 재현된다(자기정합).
--   3자→90 · 6자→180 · 4자→120 · 8자→240.
--
-- ⚠️ 대상 18건에는 자 규격이 아닐 수 있는 건이 섞여 있다 — 장당가를 정가×면적과 대조하면 배수가
--   0.12 ~ 573 로 벌어진다. 용준님께 아래 3건을 지목해 보고했고 **18건 전부 진행으로 확정**했다(2026-09-09):
--     · id 5232  E1-20260129-I001 삼우엔지니어링 13,930,000원(배수 573) — 전표 뭉침 의심
--     · id 18336 E1-20260612-I059 파인에스엔에스  「포스터 5종, A2사이즈」(배수 13.2) — A2 와 3*6 이 모순
--     · id 19832 E1-20260630-I003 삼우엔지니어링 「부착명패」65장 @5,000(배수 0.12) — 4×8cm 가능성
--   나머지 15건 중 나무그리고 10T 4*8 은 배수 **0.97** 로 정가와 거의 일치해 자 규격이 확실하고,
--   출력업체(성진·두용·기영·윤기획)의 0.24~0.53 은 **원판만 납품**이면 설명된다.
--   되돌리기는 `_bak_0601_board_spec` 로 전량 가능하다.
--
-- 안전성: `amount` 는 **건드리지 않는다**(확정 청구액). 규격이 바뀌면 청구면적이 바뀌므로
--   `unit_price` 를 새 면적 기준으로 다시 나눈다(0596 과 같은 규칙) — 그래야 재계산이 금액을 재현한다.
--   대상 18건 전부 에누리 0 · PENDING 0 · 라인 스냅샷 `min_billing_side_cm=0` 임을 사전 확인했다.
--
-- 멱등: 변환 후에는 width 가 90/120 이 되어 대상 조건에서 빠진다. 백업 INSERT 도 id 중복을 거른다.

CREATE TABLE IF NOT EXISTS _bak_0601_board_spec (
  id INTEGER PRIMARY KEY, width, height, specification, unit_price, auto_amount
);

-- 원본 보존 (재실행해도 처음 값만 남는다)
INSERT INTO _bak_0601_board_spec (id, width, height, specification, unit_price, auto_amount)
SELECT oi.id, oi.width, oi.height, oi.specification, oi.unit_price, oi.auto_amount
  FROM order_items oi JOIN items i ON i.id = oi.item_id
 WHERE i.pricing_method = 'AREA'
   AND oi.width > 0 AND oi.height > 0 AND oi.width <= 10 AND oi.height <= 10
   AND ((oi.width = 3 AND oi.height = 6) OR (oi.width = 6 AND oi.height = 3)
     OR (oi.width = 4 AND oi.height = 8) OR (oi.width = 8 AND oi.height = 4))
   AND NOT EXISTS (SELECT 1 FROM _bak_0601_board_spec b WHERE b.id = oi.id);

-- ① 관례 표기를 specification 에 남긴다 (비어 있는 라인만 — 이미 '3*6' 이 있는 11건은 그대로)
UPDATE order_items
   SET specification = CAST(width AS INT) || '*' || CAST(height AS INT)
 WHERE id IN (SELECT id FROM _bak_0601_board_spec)
   AND (specification IS NULL OR TRIM(specification) = '');

-- ② 계산용 규격을 cm 로 (3자→90 · 6자→180 · 4자→120 · 8자→240)
UPDATE order_items
   SET width  = CASE width  WHEN 3 THEN 90 WHEN 6 THEN 180 WHEN 4 THEN 120 WHEN 8 THEN 240 ELSE width END,
       height = CASE height WHEN 3 THEN 90 WHEN 6 THEN 180 WHEN 4 THEN 120 WHEN 8 THEN 240 ELSE height END,
       updated_at = CURRENT_TIMESTAMP
 WHERE id IN (SELECT id FROM _bak_0601_board_spec)
   AND width <= 10 AND height <= 10;

-- ③ 단가를 새 청구면적으로 되나눈다. `amount` 불변 → 재계산이 금액을 재현한다.
--    청구면적 = 10cm 올림 후 최소청구 변 적용(이 품목들은 라인 스냅샷 min_billing_side_cm = 0).
--    ★목표값을 임시 테이블로 먼저 낸다 — `unit_price <> 목표값` 을 걸어야 재실행이 완전 무동작이 된다
--      (0530 함정: 산식만 반복하면 같은 값을 매번 다시 써서 rows_written 이 0 이 아니다).
DROP TABLE IF EXISTS _tmp_0601_price;

CREATE TABLE _tmp_0601_price AS
SELECT oi.id,
       ROUND(oi.amount / (
             (MAX(CEIL(oi.width  / 10.0) * 10, COALESCE(oi.min_billing_side_cm, 100)) / 100.0)
           * (MAX(CEIL(oi.height / 10.0) * 10, COALESCE(oi.min_billing_side_cm, 100)) / 100.0)
           * oi.quantity)) AS new_price
  FROM order_items oi
 WHERE oi.id IN (SELECT id FROM _bak_0601_board_spec)
   AND oi.quantity IS NOT NULL AND oi.quantity <> 0
   AND oi.amount IS NOT NULL AND oi.amount <> 0
   AND oi.width > 10 AND oi.height > 10;

UPDATE order_items
   SET unit_price    = (SELECT t.new_price FROM _tmp_0601_price t WHERE t.id = order_items.id),
       auto_amount   = amount,
       line_discount = 0,
       updated_at    = CURRENT_TIMESTAMP
 WHERE id IN (SELECT id FROM _tmp_0601_price)
   AND unit_price <> (SELECT t.new_price FROM _tmp_0601_price t WHERE t.id = order_items.id);

DROP TABLE _tmp_0601_price;
