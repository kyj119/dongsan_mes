-- 0576: 롤 자재 2종의 **단위 축**을 형제 계열과 맞춘다 (SVCV-127 · KMT-UVONEWAY)
--
-- 무엇이 잘못됐나:
--   매입이 「1 EA」로 들어왔다 — 실제로는 **롤 1개**를 산 것인데 수량 1·단가 158,000 으로 기록됐고,
--   품목의 `unit` 은 'yd' 인데 `base_unit`·`pack_size` 가 비어 있어 환산이 없다.
--   그래서 `avg_unit_cost` 가 **158,000원/yd** 가 됐다. 실제는 158,000원/**롤**(20M)이다.
--   결과: 솔벤 캔버스(SV-CANVAS) 9라인의 원가율이 **577%** — 매출 584,100원에 원가 3,367,523원.
--   수익성 탭이 이 품목을 「단가 점검 필요」로 통째 제외하고 있었다(2026-09-07 발견).
--
-- ★형제 계열이 정본을 보여 준다 — `SPM011G-*`·`SPM022G-*` 는 전부 `롤 | M | pack 50` 이고
--   `avg_unit_cost` 가 **원/M** 다(일반시트 127폭 2,325원/M). 여기도 같은 모양으로 맞춘다.
--
-- ⚠️ **나눗셈을 쓰지 않는다** — `avg_unit_cost = avg_unit_cost / 20` 으로 쓰면 재실행 때 또 나뉜다.
--   목표값을 그대로 박고 WHERE 로 현재값을 확인해 **멱등**으로 만든다.
--   ([[feedback-avg-cost-backfill-axis]] — 재실행으로 원단 단가가 50배 어긋난 전례)
--
-- ⚠️ **재고·원장 노출 없음을 확인하고 고른 2종이다**(2026-09-07 prod 실측):
--     SVCV-127     inventory 0행 · inventory_transactions 0행 · 직판 1건(원가 0, BOM 없음)
--     KMT-UVONEWAY inventory 0행 · inventory_transactions 0행 · 직판 0건
--   `base_unit` 을 채우면 재고 수량의 **의미가 바뀌므로**(수량×pack·단가÷pack 로 평가액 보존)
--   재고가 있는 품목은 여기 넣지 않았다 — [[design-stock-base-unit-rebase]] 의 50배 축이다.
--   ⛔ 같은 병에 걸린 `SPM011M`(무광시트 50M @102,450)은 **제외**했다:
--      inventory 2행(E2 1롤)이 있어 1 → 50 재기표가 함께 필요하고, `width_mm` 도 비어 있어
--      지금 고쳐도 제조 원가는 여전히 0이다. 폭과 함께 별도 마이그레이션으로 처리한다.
--
-- ⚠️ KMT-UVONEWAY 는 이 마이그레이션만으로는 **효과가 없다** — `width_mm` 이 비어 있어
--   ROLL 후보 선택(`width_mm != null`)에서 탈락하고, 쓰는 제품(SV-SHEET-PERF)의 원가는 0으로 남는다.
--   단위 축이 맞아 있어야 폭을 넣는 순간 바로 맞으므로 지금 함께 정리해 둔다.
--
-- 검증(실제 엔진 dry-run, 2026-09-07):
--   SV-CANVAS 9라인 합계 원가 3,367,523 → **166,165** · 원가율 577% → **28%**
--   385×81 1장 = 소요 3.85M × 7,900원 = 재료 30,415 + 솔벤잉크 3,153 = 33,568
--
-- 되돌리기: `_bak_0576_roll_unit_axis` 에 원값이 있다.

CREATE TABLE IF NOT EXISTS _bak_0576_roll_unit_axis AS
  SELECT id, item_code, unit, base_unit, pack_size, avg_unit_cost
    FROM items WHERE item_code IN ('SVCV-127', 'KMT-UVONEWAY');

-- 솔벤 캔버스원단 — 20M 롤 @158,000 → 7,900원/M (폭 1270 은 이미 있다)
UPDATE items
   SET unit = '롤', base_unit = 'M', pack_size = 20, avg_unit_cost = 7900
 WHERE item_code = 'SVCV-127'
   AND avg_unit_cost = 158000
   AND COALESCE(base_unit, '') = '';

-- UV-Oneway film — 50M 롤 @230,000 → 4,600원/M (unit 은 이미 '롤')
UPDATE items
   SET base_unit = 'M', pack_size = 50, avg_unit_cost = 4600
 WHERE item_code = 'KMT-UVONEWAY'
   AND avg_unit_cost = 230000
   AND COALESCE(base_unit, '') = '';
