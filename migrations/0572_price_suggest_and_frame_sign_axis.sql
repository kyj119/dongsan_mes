-- 0572: ①제안을 끄는 품목 플래그 ②프레임간판(원단 교체) 과금축 정정
--
-- 근거 = 2026-09-05 백테스트(`scripts/price-match-audit.py`). 2026년 전 라인을 날짜순으로 재생해
--        「그때 제안했을 값」을 실제 청구와 대조했다.
--
-- ① `items.price_suggest` — 주문제작이라 예측이 성립하지 않는 계열은 **빈칸이 낫다**
--    틀린 값이 채워져 있으면 「검토된 값」이라는 착시를 준다. 과금축으로 정규화한 뒤에도 이 지경이다:
--      SIGN-CH  채널간판                 오차 59% · 2배이상 23% · 규격 적힌 라인 **14%** · 장당 12,000~9,400,000
--      SIGN-FRN 비조명 프레임간판(신규)   오차 58% · 2배이상 22%
--      SIGN-FRL 조명 프레임간판(신규)     오차 55% · 2배이상 19%
--      SIGN-ETC 간판 기타(일반)          오차 50% · 2배이상 17% · 규격 14%
--      SGM-TRB  트러스바                 오차 55% · 2배이상 **30%**
--      SV-LSHT  솔벤 조명시트            오차 67% · 2배이상 26% · 규격 11%
--    ★규격을 맞춰도 안 나아진다(채널간판 59% → 57.7%). 크기가 아니라 **건마다 사양이 다른** 것이다.
--    ⚠️`(신규 제작)`만 끄고 `(원단 교체)`는 켠 채로 둔다 — 아래 ②로 예측이 되는 품목이 되기 때문.
--
-- ② `SIGN-FRN-R`·`SIGN-FRL-R`(원단 교체) FIXED → AREA
--    원단 교체는 **면적 비례 작업**이다. 면적대별 환산 ㎡단가가 실제로 평평하다:
--      조명 원단교체   1~3㎡ 46,761 · 3~6㎡ 48,350 · 6㎡~ 44,677   ← 거의 상수
--      비조명 원단교체 ~1㎡ 45,000 · 1~3㎡ 35,119 · 3~6㎡ 34,467 · 6㎡~ 30,353
--    반면 `(신규 제작)`은 40,000 / 50,493 / 86,700 / 34,376 로 들쭉날쭉하다 —
--    프레임·설치가 면적과 무관하게 붙기 때문. **신규 제작은 FIXED 로 둔다.**
--
--    ★★과금축을 바꾸면 `unit_price` 의 **뜻이 바뀐다**(`0571` 에서 데인 함정).
--      지금 값은 장당금액인데 AREA 가 되면 산식이 그걸 ㎡단가로 읽어 금액이 몇 배로 튄다.
--      그래서 같은 마이그레이션에서 `unit_price = amount ÷ (청구면적 × 수량)` 으로 재산정한다.
--      청구면적 = 10cm 올림 + 변당 최소 1m (`utils/orderLineAmount.ts` 와 같은 규칙,
--      두 품목 다 `min_billing_side_cm = 100`). `amount` 는 건드리지 않는다 = 청구 정정 아님.
--
--      ⚠️규격이 없는 11라인(FRL-R 2 · FRN-R 9)은 재산정할 수 없다. 그대로 두는 게 맞다 —
--        `/api/prices` 의 AREA_USABLE_SQL 이 규격 없는 AREA 라인을 이미 제외하므로 제안에 안 섞인다
--        (수성 현수막의 규격 없는 331라인과 같은 처리).
--
-- 되돌리기: `_bak_0572_frame_sign` 에 (id, unit_price) 가 있다. 축은 UPDATE 로 FIXED 복귀.

-- ① 제안 억제 플래그 (기본 1 = 제안함)
-- ⚠️ADD COLUMN 은 멱등이 아니다 — 재실행 시 "duplicate column" 으로 파일 전체가 멈춘다.
--    이미 적용됐다면 이 한 줄만 지우고 나머지를 돌린다.
ALTER TABLE items ADD COLUMN price_suggest INTEGER NOT NULL DEFAULT 1;

UPDATE items SET price_suggest = 0, updated_at = CURRENT_TIMESTAMP
 WHERE item_code IN ('SIGN-CH', 'SIGN-FRN', 'SIGN-FRL', 'SIGN-ETC', 'SGM-TRB', 'SV-LSHT');

-- ② 원단 교체 2종 — 백업 → 단가 재산정 → 축 전환 (순서 중요: 축을 먼저 바꾸면 중간 상태가 틀린다)
CREATE TABLE IF NOT EXISTS _bak_0572_frame_sign AS
  SELECT oi.id, oi.unit_price
    FROM order_items oi JOIN items i ON i.id = oi.item_id
   WHERE i.item_code IN ('SIGN-FRN-R', 'SIGN-FRL-R');

UPDATE order_items
   SET unit_price = ROUND(
         amount / (
             MAX(CAST((width  + 9) / 10 AS INT) * 10, 100) / 100.0
           * MAX(CAST((height + 9) / 10 AS INT) * 10, 100) / 100.0
           * quantity))
 WHERE item_id IN (SELECT id FROM items WHERE item_code IN ('SIGN-FRN-R', 'SIGN-FRL-R'))
   AND quantity > 0 AND amount > 0 AND width > 0 AND height > 0;

UPDATE items SET pricing_method = 'AREA', pricing_profile = 'AREA', updated_at = CURRENT_TIMESTAMP
 WHERE item_code IN ('SIGN-FRN-R', 'SIGN-FRL-R');
