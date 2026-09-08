-- 0596: `order_items.unit_price` 의 **의미**를 서버 재계산과 일치시킨다 (금액은 안 건드린다)
--
-- 무엇이 잘못됐나:
--   `unit_price` 는 과금축에 따라 뜻이 다르다 — AREA 면 ㎡단가, FIXED 면 장당가.
--   그런데 **의미 환산은 적재 시점 1회**만 돈다(`ecount-order-import.py:588`
--   `method == 'AREA' and w and h and q and amt`). 규격 파싱이 실패했거나(`RX_WH` 는 양끝 앵커라
--   `F형(51*122)`·`395-295`·`244*122, 100*122` 를 못 읽는다) 품목이 사전에 없으면 그 조건을 못 넘어
--   **장당금액이 그대로 저장**된다. 그 뒤 규격·품목만 나중에 채워지면 같은 값이 ㎡단가로 읽힌다.
--   prod 실측 2026-09-08: 26,751 라인 중 **336건**(이관 303 · 8월 자동적재 33 · 수기 입력 0).
--
-- 왜 위험한가 — **청구액은 맞다**(`amount` 가 정본). 위험은 그 주문을 화면에서 열어 저장할 때다:
--   서버가 저장된 단가로 auto 를 재계산해 차액을 통째로 **행 에누리**로 기록한다.
--   최악 사례 E1-20260812-I012 SV-BANNER 290×240×2 → 저장 184,000 vs 재계산 1,280,600
--   (에누리 -1,096,600 이 실적·마진에 그대로 들어간다). 이관 107건 합산 격차 4.40억.
--
-- 무엇을 하나 — **금액에서 되나눈다**. 0530·0571·0572 와 같은 규칙이고, 같은 종류의 4번째다.
--   정정값 = 서버 `utils/orderLineAmount.computeLineAmount()` 의 **분기를 그대로 역산**한다:
--     AREA + 규격 있음 → ROUND(amount ÷ (청구폭 × 청구높이 × 수량))     ← ㎡단가
--     그 외             → ROUND(amount ÷ 수량)                          ← 장당가
--   청구 치수 = 10cm 올림 후 `items.min_billing_side_cm`(기본 100) 적용.
--   ★0530 은 최소청구를 100 으로 **하드코딩**했다 — 그때는 품목별 예외가 없었다.
--     지금은 UV 판재가 0(실규격 청구)이라 여기서 반드시 컬럼을 읽어야 한다.
--
-- 안전성:
--   · `amount` 는 건드리지 않는다 — 실제 청구액이고 이카운트 818곳 잔액 대사가 그 위에 서 있다.
--   · `line_discount <> 0` 인 라인은 **제외**한다. 그건 사람이 의도한 에누리라 되나누면 그 의도가 지워진다.
--   · `amount = 0` 인 라인도 제외 — 되나누면 단가가 0이 되어 「무상/취소」의 원 단가 정보가 사라진다(1건).
--   · `price_status='PENDING'`(단가 미정)은 애초에 auto=0 이라 대상이 아니다.
--   · 수량 음수(반품·클레임 20건)는 대상이다 — 금액도 음수라 나누면 부호가 맞는다.
--
-- 멱등: `new_price <> unit_price` 조건이 핵심이다.
--   ★0530 의 함정 — "변환되면 조건에서 빠진다"만으로는 부족했다. 정수 반올림 잔차 때문에
--     정정 후에도 `|재계산 − 금액| > 100` 인 라인이 남는데(면적이 크면 ±0.5원 × 면적이 100원을 넘는다),
--     그 라인은 매번 **같은 값**을 다시 써서 rows_written 이 0 이 아니게 된다.
--     목표값과 같으면 빼야 완전 멱등이다.
--
-- 되돌리기: `_bak_0575_unit_price_semantics` (id, unit_price) 에 원본 보존.
--   UPDATE order_items SET unit_price = (SELECT unit_price FROM _bak_0575_unit_price_semantics b WHERE b.id = order_items.id)
--    WHERE id IN (SELECT id FROM _bak_0575_unit_price_semantics);
--
-- ★prod 적용 완료 2026-09-08 (307건 · 백업 테이블명은 그때 만든 `_bak_0575_...` 를 그대로 쓴다 —
--   이름을 바꾸면 되돌리기 근거가 갈라진다). 파일 번호만 상류 충돌(0575_card_offset_reason)로 0596 이다.
--
-- ⚠️ 이 마이그는 **재발을 막지 못한다**. 규격·품목을 나중에 채우는 작업(스크립트가 아니라 수동 SQL 이었다)이
--    단가를 안 따라가면 또 생긴다 → 상시 감사 = `npm run audit:unit-price-semantics`.

CREATE TABLE IF NOT EXISTS _bak_0575_unit_price_semantics (
  id INTEGER PRIMARY KEY,
  unit_price
);

DROP TABLE IF EXISTS _tmp_0596_fix;

CREATE TABLE _tmp_0596_fix AS
WITH base AS (
  SELECT oi.id, oi.unit_price, oi.quantity, oi.amount, oi.width, oi.height,
         oi.price_status, oi.line_discount,
         i.pricing_method AS pm,
         COALESCE(i.min_billing_side_cm, 100) AS ms
    FROM order_items oi
    LEFT JOIN items i ON i.id = oi.item_id
),
dim AS (
  SELECT b.*,
         MAX(CEIL(b.width  / 10.0) * 10, b.ms) / 100.0 AS bw,   -- 청구 폭(m)
         MAX(CEIL(b.height / 10.0) * 10, b.ms) / 100.0 AS bh    -- 청구 높이(m)
    FROM base b
),
calc AS (
  SELECT d.*,
         -- 서버가 지금 계산해 낼 금액(= 화면을 열어 저장하면 나올 값)
         CASE WHEN d.pm = 'AREA' AND d.width > 0 AND d.height > 0
              THEN ROUND(d.unit_price * d.bw * d.bh * d.quantity / 100.0) * 100
              ELSE ROUND(d.unit_price * d.quantity / 100.0) * 100 END AS recalc,
         -- 금액에서 되나눈 정정값
         CASE WHEN d.pm = 'AREA' AND d.width > 0 AND d.height > 0
              THEN ROUND(d.amount / (d.bw * d.bh * d.quantity))
              ELSE ROUND(d.amount / d.quantity) END AS new_price
    FROM dim d
)
SELECT id, unit_price AS old_price, new_price
  FROM calc
 WHERE quantity IS NOT NULL AND quantity <> 0
   AND amount IS NOT NULL AND amount <> 0
   AND COALESCE(price_status, '') <> 'PENDING'
   AND COALESCE(line_discount, 0) = 0
   AND ABS(recalc - amount) > 100          -- 지금 어긋나 있는 라인만
   AND new_price <> unit_price;            -- ★멱등: 목표값과 같으면 제외

-- 원본 보존 — 재실행해도 처음 값만 남는다(이미 백업된 id 는 다시 넣지 않는다)
INSERT INTO _bak_0575_unit_price_semantics (id, unit_price)
SELECT f.id, f.old_price
  FROM _tmp_0596_fix f
 WHERE NOT EXISTS (SELECT 1 FROM _bak_0575_unit_price_semantics b WHERE b.id = f.id);

UPDATE order_items
   SET unit_price = (SELECT f.new_price FROM _tmp_0596_fix f WHERE f.id = order_items.id),
       updated_at = CURRENT_TIMESTAMP
 WHERE id IN (SELECT id FROM _tmp_0596_fix);

DROP TABLE _tmp_0596_fix;
