-- 품목 원가(items.avg_unit_cost) backfill — 매입 실적(purchase_order_items) 기반
-- 2026-07-19 최초 적용 (prod, 315개 품목). 재실행 멱등(매입 증가 시 주기적 재실행 가능).
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
--
-- 방식: 품목별 가중평균 = SUM(amount)/SUM(quantity)  (recalculate-avg 이동평균 공식과 동일)
-- 소스: purchase_order_items (당시 2026-01~06, 6개월). inventory_transactions는 가격 IN이 비어
--       designed recalculate-avg가 동작 못 함 → 매입 원장에서 직접 backfill.
-- VAT: 입력값 그대로(데이터 vat_amount=0, 실거래액=선명 미지급 정합, 매출 order_items와 동일 기준). 순액 변환 안 함.
-- 범위: 매입이력 있는 품목만 갱신, 없는 품목(당시 514개)은 미변경(0 유지, 추후 수동/규칙).
--
-- ⚠️ 향후 정식화: 매입 입고 → inventory_transactions IN 기록 → recalculate-avg 자동화(Policy B, 6월초 재고 baseline 필요).
--    현재는 그 정식 파이프라인 미가동이라 이 직접 backfill로 대체.

UPDATE items SET avg_unit_cost = (
  SELECT ROUND(SUM(poi.amount) * 1.0 / NULLIF(SUM(poi.quantity), 0), 2)
  FROM purchase_order_items poi
  WHERE poi.item_id = items.id
    AND COALESCE(poi.unit_price, 0) > 0
    AND COALESCE(poi.quantity, 0) > 0
)
WHERE id IN (
  SELECT DISTINCT item_id FROM purchase_order_items
  WHERE item_id IS NOT NULL AND COALESCE(unit_price, 0) > 0 AND COALESCE(quantity, 0) > 0
);

-- ★ 전표 뭉치 품목 제외 (2026-08-07)
--   아래 품목들은 매입이 **월별 세금계산서 1줄**(적요=대표품명 「… 외 1」 · 수량 1)로 적재돼 있다.
--   금액은 맞지만 수량이 전표 단위라 SUM(amount)/SUM(quantity) 가 **전표 총액**이 된다
--   (`GDS-FB1-CASE` 7,261,100원/개 → 국기함세트 BOM 롤업이 원가율 157,312% 로 튀었다).
--   어떤 값이든 틀리므로 **모른다(0)** 로 두는 게 맞다. 실수량이 확보되면 이 목록에서 빼면 된다.
--   판별 = avg_unit_cost > 500,000 인 품목을 훑어 매입 라인이 전표 대표품명인지 확인(정상 고가 롤·장비와 구분).
UPDATE items SET avg_unit_cost = 0, updated_at = CURRENT_TIMESTAMP
WHERE item_code IN (
  'ACC-036',        -- 수기대(깃대) — 유진프라스틱 12,840,000 수량 1
  'GDS-FB1-CASE',   -- 국기함 보급형 케이스 — 에코컴퍼니 「태극기 보관함 외 1」 2건
  'RM-I0040',       -- R50 UV 잉크-C — 적요 「5 X 184,000」 인데 전표는 1,840,000
  'RM-I0045',       -- 평판잉크 C — 적요 「2 X 92,000」 인데 전표는 942,000
  'RM-I0046',       -- 평판잉크 M — 전표 1줄
  -- 세무장부 대조로 적재한 **금액 전용** 외주 품목 (2026-08-09).
  -- 원장 적요에 수량·단가가 아예 없어 수량 1 로 넣었다 — 단가가 아니라 전표 금액이다.
  -- 명세서가 확보되면 라인을 쪼개고 이 목록에서 빼면 된다.
  'SGM-GALVA-OEM',  -- 갈바 제작(외주) — 극동잔넬 12,840,000 수량 1
  'JG-OEM',         -- 깃발 제작(외주) — 대진국기사 7건 전부 수량 1
  -- 2026-08-10 추가분 (거래처원장 253/251 대조).
  'JG-IMGA-OEM',    -- 깃발외 임가공(외주) — 오다플래그 9건 전부 수량 1 (월 1~2.7천만)
  'TGK-MIX-OEM',    -- 태극기 외(매입 전표 대표품명) — NTIC 4건. 액자 등 혼재라 실물 단위가 없다
  'ACC-030-WOOD',   -- 환봉나무 — 바로 4건. ★적요 형식은 「수량 X 단가」(54,600개 × 140원)인데
                    --   4건 중 2건만 금액과 맞고 「환봉나무25」는 350원/개 다른 규격이다.
                    --   섞으면 가중평균이 틀어지므로 0 유지. 규격 분리되면 이 목록에서 뺄 것.
  -- 영광엔터테인먼트 21전표 (2026-08-10). 실수량 라인과 금액전용 라인이 **한 품목 안에 섞인** 것만 제외한다.
  -- 목창꽂이(ACC-054·ACC-054-NS)와 국기봉(ACC-042)은 전 라인이 수량×단가와 일치해 실단가가 남는다 → 제외 안 함.
  'ACC-051',        -- 우승기 부속 — 8건 중 1건만 실수량(22,000원/개), 나머지는 대표품명
  'ACC-052',        -- 원형 받침대 — 3건 중 2건 실수량(35,000원/개), 07-06 은 대표품명
  'ACC-053',        -- 우승기 깃대 — 1건, 적요(10×11,000)와 금액(160,000) 불일치
  'ACC-034'         -- 깃대(기타) — 영광 07-21 6,135,000 수량 표기 없음
);
