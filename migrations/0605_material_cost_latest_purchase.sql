-- 0605: 자재 등록단가를 **최근 매입가**로 통일 (67종) — 폭 역전을 없애기 위해
--
-- 무엇이 어긋나 있었나 — `items.avg_unit_cost` 의 의미가 **폭마다 섞여 있었다**.
--   `0574` 가 이카운트 발주가로 83종을 갱신하면서 그 품목만 「최근 매입가」가 되고 나머지는
--   「가중평균」으로 남았다. 같은 원단군 안에서 축이 갈리자 **좁은 폭이 넓은 폭보다 비싸지는**
--   역전이 생겼다. 수성 현수막 2코팅이 그랬다:
--     60폭 350(평균) · 70폭 480(최근) · 80폭 510(최근) · **90폭 459(평균)**
--   90폭이 70·80폭보다 싸고 넓으니 **70·80폭은 어떤 규격에서도 선택되지 않는다**.
--   실제로는 매입해서 쓰는 폭인데(용준님 확인) 원가 계산에서 통째로 빠져 있었다.
--
-- 축 환산 — 발주 단가는 `items.unit`(매입 단위) 기준이고 등록 단가는 base 단위 기준이다.
--   · unit='롤' + base_unit='M' → **÷ pack_size** (롤가를 그대로 넣으면 pack_size 배 = 최대 50배)
--   · unit='yd'(base NULL) · '장'/'EA'(판재) → 같은 축이라 그대로
--
-- 두 겹의 가드를 통과한 것만 넣는다:
--   ① **오염 가드** — 현재값 대비 0.5~2.0배를 벗어나면 제외. 발주에 **총액이 단가 칸에 들어간 행**이
--      있다(`PONGE-130` 4,216,200원 = 5,270배). 제외분은 아래 「보류」에 적었다.
--   ② **역전 가드** — 갱신 후 그 원단군의 역전이 **늘면** 그 군 전체를 보류한다. 폭마다 마지막
--      매입 시점이 다르면(4월 vs 7월) 「최근가」 자체가 시점 뒤섞임이 되어 새 역전을 만든다.
--
-- 효과: 수성 현수막 2코팅 역전 8종 → 5종(70·80·105·127·137폭 해소). 부직포·저밀도 1종 → 0종.
--
-- 보류 — 사람이 판단할 것 (여기서 손대지 않는다):
--   · 조명용 후렉스   : 등록값이 **폭 × 17.5원/yd** 로 완벽히 규칙적인데, 100폭·120폭 발주가
--                      각각 90폭·110폭과 **같은 총액**으로 들어와 있다(품목 오귀속 의심).
--   · 솔벤 현수막     : 60·80·110폭이 4월 매입, 70·90·127폭이 6~7월 매입 → 시점차가 역전을 만든다.
--   · 깃발 인쇄원단   : 같은 사유로 역전이 13→14종으로 늘어난다.
--   · `PONGE-130`    : 발주 단가 4,216,200원(총액 오염). · `SVB-152` : 2.6배 급등(확인 필요).
--   ⇒ 이 군들은 발주 이력 재구성이 아니라 **매입처 현행 단가표**를 한 번에 받아야 맞다.
--
-- ⚠️ 이 마이그레이션은 **원가를 올린다**(60폭 350→420 등). 재료비율이 오르는 게 정상이고,
--    적용 후 `scripts/cost-backfill-run.cjs` 로 저장 원가를 재계산해야 화면에 반영된다.
--
-- 되돌리기: `_bak_0605_material_cost` 에 원래 값이 있다.

CREATE TABLE IF NOT EXISTS _bak_0605_material_cost AS
SELECT id, item_code, item_name, item_group, avg_unit_cost
  FROM items
 WHERE COALESCE(deduction_method,'ROLL') IN ('ROLL','BOARD')
   AND EXISTS (SELECT 1 FROM product_materials pm WHERE pm.material_item_id = items.id);

UPDATE items SET avg_unit_cost = 4363.7 WHERE item_code = 'MAG-060';  -- 고무자석시트 60cm 4550 → 4363.7 (÷pack(10m), 매입 2026-06-11)
UPDATE items SET avg_unit_cost = 11000 WHERE item_code = 'MAG-100';  -- 고무자석시트 100cm 9500 → 11000 (÷pack(10m), 매입 2026-06-01)
UPDATE items SET avg_unit_cost = 33500 WHERE item_code = 'PC-1.8T-M-48';  -- 광확산PC 28513.79 → 33500 (동일 축, 매입 2026-06-19)
UPDATE items SET avg_unit_cost = 2145 WHERE item_code = 'SPM022G-105';  -- 그레이시트 SPM022G 105cm 1992 → 2145 (÷pack(50m), 매입 2026-07-30)
UPDATE items SET avg_unit_cost = 2574 WHERE item_code = 'SPM022G-127';  -- 그레이시트 SPM022G 127cm 2392 → 2574 (÷pack(50m), 매입 2026-07-21)
UPDATE items SET avg_unit_cost = 2788.6 WHERE item_code = 'SPM022G-137';  -- 그레이시트 SPM022G 137cm 2586 → 2788.6 (÷pack(50m), 매입 2026-07-01)
UPDATE items SET avg_unit_cost = 3100.6 WHERE item_code = 'SPM022G-152';  -- 그레이시트 SPM022G 152cm 2880 → 3100.6 (÷pack(50m), 매입 2026-07-13)
UPDATE items SET avg_unit_cost = 951.78 WHERE item_code = 'MCP120-090';  -- 무광코팅지 120g-호홍 90cm 873.6296 → 951.78 (÷pack(45m), 매입 2026-07-03)
UPDATE items SET avg_unit_cost = 1553.2 WHERE item_code = 'SPP031M-090';  -- 무광코팅지 SPP031M 90cm 1440 → 1553.2 (÷pack(50m), 매입 2026-07-13)
UPDATE items SET avg_unit_cost = 1989 WHERE item_code = 'SPP031M-105';  -- 무광코팅지 SPP031M 105cm 1844 → 1989 (÷pack(50m), 매입 2026-07-27)
UPDATE items SET avg_unit_cost = 2369.4 WHERE item_code = 'SPP031M-127';  -- 무광코팅지 SPP031M 127cm 2196 → 2369.4 (÷pack(50m), 매입 2026-07-13)
UPDATE items SET avg_unit_cost = 2554.6 WHERE item_code = 'SPP031M-137';  -- 무광코팅지 SPP031M 137cm 2372 → 2554.6 (÷pack(50m), 매입 2026-07-27)
UPDATE items SET avg_unit_cost = 2827.6 WHERE item_code = 'SPP031M-152';  -- 무광코팅지 SPP031M 152cm 2626 → 2827.6 (÷pack(50m), 매입 2026-07-27)
UPDATE items SET avg_unit_cost = 1224 WHERE item_code = 'BUJIK-060';  -- 부직포 60cm 1232.9332 → 1224 (÷pack(50m), 매입 2026-07-23)
UPDATE items SET avg_unit_cost = 1574.8 WHERE item_code = 'BUJIK-090';  -- 부직포 90cm 1200 → 1574.8 (÷pack(50m), 매입 2026-05-15)
UPDATE items SET avg_unit_cost = 2220 WHERE item_code = 'BUJIK-127';  -- 부직포 127cm 2053.51 → 2220 (÷pack(50m), 매입 2026-07-23)
UPDATE items SET avg_unit_cost = 2559.01 WHERE item_code = 'BUJIK-152';  -- 부직포 152cm 2345.76 → 2559.01 (÷pack(50m), 매입 2026-05-15)
UPDATE items SET avg_unit_cost = 2820 WHERE item_code = 'BUJIK-180';  -- 부직포 180cm 2869.1194 → 2820 (÷pack(50m), 매입 2026-07-31)
UPDATE items SET avg_unit_cost = 2100 WHERE item_code = 'FLEXN-120';  -- 비조명용 후렉스 120cm 1992 → 2100 (÷pack(50m), 매입 2026-05-11)
UPDATE items SET avg_unit_cost = 2880 WHERE item_code = 'FLEXN-180';  -- 비조명용 후렉스 180cm 3150 → 2880 (÷pack(50m), 매입 2026-03-30)
UPDATE items SET avg_unit_cost = 1143 WHERE item_code = 'SVM-060';  -- 솔벤 매쉬 60cm 1270 → 1143 (÷pack(50m), 매입 2026-07-06)
UPDATE items SET avg_unit_cost = 2286 WHERE item_code = 'SVM-127';  -- 솔벤 매쉬 127cm 2540 → 2286 (÷pack(50m), 매입 2026-07-06)
UPDATE items SET avg_unit_cost = 5800 WHERE item_code = 'SVM-250';  -- 솔벤 매쉬 250cm 6125 → 5800 (÷pack(50m), 매입 2026-07-29)
UPDATE items SET avg_unit_cost = 310 WHERE item_code = 'AQ2-040';  -- 수성 현수막원단 2코팅 40cm 295.89 → 310 (동일 축, 매입 2026-07-23)
UPDATE items SET avg_unit_cost = 350 WHERE item_code = 'AQ2-050';  -- 수성 현수막원단 2코팅 50cm 327.35 → 350 (동일 축, 매입 2026-07-23)
UPDATE items SET avg_unit_cost = 420 WHERE item_code = 'AQ2-060';  -- 수성 현수막원단 2코팅 60cm 350 → 420 (동일 축, 매입 2026-07-31)
UPDATE items SET avg_unit_cost = 500 WHERE item_code = 'AQ2-080';  -- 수성 현수막원단 2코팅 80cm 510 → 500 (동일 축, 매입 2026-07-23)
UPDATE items SET avg_unit_cost = 510 WHERE item_code = 'AQ2-090';  -- 수성 현수막원단 2코팅 90cm 459 → 510 (동일 축, 매입 2026-07-23)
UPDATE items SET avg_unit_cost = 720 WHERE item_code = 'AQ2-100';  -- 수성 현수막원단 2코팅 100cm 700 → 720 (동일 축, 매입 2026-07-09)
UPDATE items SET avg_unit_cost = 770 WHERE item_code = 'AQ2-110';  -- 수성 현수막원단 2코팅 110cm 683.76 → 770 (동일 축, 매입 2026-07-09)
UPDATE items SET avg_unit_cost = 900 WHERE item_code = 'AQ2-130';  -- 수성 현수막원단 2코팅 130cm 740 → 900 (동일 축, 매입 2026-05-19)
UPDATE items SET avg_unit_cost = 1030 WHERE item_code = 'AQ2-140';  -- 수성 현수막원단 2코팅 140cm 860 → 1030 (동일 축, 매입 2026-05-15)
UPDATE items SET avg_unit_cost = 1040 WHERE item_code = 'AQ2-152';  -- 수성 현수막원단 2코팅 150cm 920 → 1040 (동일 축, 매입 2026-07-23)
UPDATE items SET avg_unit_cost = 1140 WHERE item_code = 'AQ2-160';  -- 수성 현수막원단 2코팅 160cm 950 → 1140 (동일 축, 매입 2026-07-31)
UPDATE items SET avg_unit_cost = 1140 WHERE item_code = 'AQ2-170';  -- 수성 현수막원단 2코팅 170cm 950 → 1140 (동일 축, 매입 2026-06-01)
UPDATE items SET avg_unit_cost = 4200 WHERE item_code = 'AQ2-250';  -- 수성 현수막원단 2코팅 250cm 4036.18 → 4200 (동일 축, 매입 2026-05-08)
UPDATE items SET avg_unit_cost = 4990 WHERE item_code = 'AQ2-320';  -- 수성 현수막원단 2코팅 320cm 4738.35 → 4990 (동일 축, 매입 2026-05-14)
UPDATE items SET avg_unit_cost = 380 WHERE item_code = 'AQD-090';  -- 수성 현수막원단 저밀도 90cm 331.4 → 380 (동일 축, 매입 2026-07-23)
UPDATE items SET avg_unit_cost = 14950 WHERE item_code = 'SKS-20T-B-36';  -- 스카시 13000 → 14950 (동일 축, 매입 2026-06-01)
UPDATE items SET avg_unit_cost = 20130 WHERE item_code = 'SKS-30T-B-36';  -- 스카시 17500 → 20130 (동일 축, 매입 2026-06-01)
UPDATE items SET avg_unit_cost = 19000 WHERE item_code = 'ALM-2T-WH-48';  -- 알마이트 18612.24 → 19000 (동일 축, 매입 2026-06-19)
UPDATE items SET avg_unit_cost = 2252.4 WHERE item_code = 'EP115-100';  -- 엠보시트 EP115 100cm 2088 → 2252.4 (÷pack(50m), 매입 2026-07-03)
UPDATE items SET avg_unit_cost = 2700.8 WHERE item_code = 'EP115-122';  -- 엠보시트 EP115 122cm 2520 → 2700.8 (÷pack(50m), 매입 2026-07-03)
UPDATE items SET avg_unit_cost = 1579.6 WHERE item_code = 'SPM011G-090';  -- 일반시트 SPM011G 90cm 1542.4 → 1579.6 (÷pack(50m), 매입 2026-07-03)
UPDATE items SET avg_unit_cost = 1998.8 WHERE item_code = 'SPM011G-105';  -- 일반시트 SPM011G 105cm 1854 → 1998.8 (÷pack(50m), 매입 2026-07-27)
UPDATE items SET avg_unit_cost = 2418 WHERE item_code = 'SPM011G-127';  -- 일반시트 SPM011G 127cm 2244 → 2418 (÷pack(50m), 매입 2026-07-23)
UPDATE items SET avg_unit_cost = 2613 WHERE item_code = 'SPM011G-137';  -- 일반시트 SPM011G 137cm 2430 → 2613 (÷pack(50m), 매입 2026-07-21)
UPDATE items SET avg_unit_cost = 2905.6 WHERE item_code = 'SPM011G-152';  -- 일반시트 SPM011G 152cm 2694 → 2905.6 (÷pack(50m), 매입 2026-07-27)
UPDATE items SET avg_unit_cost = 4436.4 WHERE item_code = 'SPT031M';  -- 조명시트 137cm 4291.6728 → 4436.4 (÷pack(50m), 매입 2026-07-13)
UPDATE items SET avg_unit_cost = 1826.67 WHERE item_code = 'KEL-090';  -- 켈 30M 호홍 90cm 1716.9697 → 1826.67 (÷pack(30m), 매입 2026-07-03)
UPDATE items SET avg_unit_cost = 1962 WHERE item_code = 'KEL-127';  -- 켈 30M 호홍 127cm 1875.3537 → 1962 (÷pack(30m), 매입 2026-07-03)
UPDATE items SET avg_unit_cost = 2706.67 WHERE item_code = 'KEL-152';  -- 켈 30M 호홍 152cm 2531.0257 → 2706.67 (÷pack(30m), 매입 2026-07-03)
UPDATE items SET avg_unit_cost = 1986.67 WHERE item_code = 'KELG-090';  -- 켈그레이 30M 호홍 90cm 1706.111 → 1986.67 (÷pack(30m), 매입 2026-06-02)
UPDATE items SET avg_unit_cost = 2150 WHERE item_code = 'KELG-127';  -- 켈그레이 30M 호홍 127cm 1931.5477 → 2150 (÷pack(30m), 매입 2026-07-03)
UPDATE items SET avg_unit_cost = 1570.33 WHERE item_code = 'PAT-090';  -- 패트배너 30M 호홍 90cm 1371.8333 → 1570.33 (÷pack(30m), 매입 2026-07-03)
UPDATE items SET avg_unit_cost = 1900 WHERE item_code = 'PAT-152';  -- 패트배너 30M 호홍 152cm 2463 → 1900 (÷pack(30m), 매입 2026-07-28)
UPDATE items SET avg_unit_cost = 11730 WHERE item_code = 'FMX-PMT-2T-48';  -- 포맥스 포마트(국산) 9320 → 11730 (동일 축, 매입 2026-07-30)
UPDATE items SET avg_unit_cost = 9780 WHERE item_code = 'FMX-PMT-3T-36';  -- 포맥스 포마트(국산) 7820 → 9780 (동일 축, 매입 2026-06-29)
UPDATE items SET avg_unit_cost = 17600 WHERE item_code = 'FMX-PMT-3T-48';  -- 포맥스 포마트(국산) 14030 → 17600 (동일 축, 매입 2026-07-30)
UPDATE items SET avg_unit_cost = 16330 WHERE item_code = 'FMX-PMT-5T-36';  -- 포맥스 포마트(국산) 13000 → 16330 (동일 축, 매입 2026-04-20)
UPDATE items SET avg_unit_cost = 29330 WHERE item_code = 'FMX-PMT-5T-48';  -- 포맥스 포마트(국산) 23350 → 29330 (동일 축, 매입 2026-06-29)
UPDATE items SET avg_unit_cost = 46920 WHERE item_code = 'FMX-PMT-8T-48';  -- 포맥스 포마트(국산) 37380 → 46920 (동일 축, 매입 2026-07-30)
UPDATE items SET avg_unit_cost = 58770 WHERE item_code = 'FMX-PMT-10T-48';  -- 포맥스 포마트(국산) 46690 → 58770 (동일 축, 매입 2026-07-30)
UPDATE items SET avg_unit_cost = 970 WHERE item_code = 'PONGE-155';  -- 폰지 155cm 965 → 970 (동일 축, 매입 2026-04-27)
UPDATE items SET avg_unit_cost = 1426.67 WHERE item_code = 'SYN-090';  -- 합성지 30M 호홍 90cm 1213.846 → 1426.67 (÷pack(30m), 매입 2026-06-02)
UPDATE items SET avg_unit_cost = 1618 WHERE item_code = 'SYN-127';  -- 합성지 30M 호홍 127cm 1517.0257 → 1618 (÷pack(30m), 매입 2026-07-03)
UPDATE items SET avg_unit_cost = 1770 WHERE item_code = 'SYNG-127';  -- 합성지그레이 30M 호홍 127cm 1560 → 1770 (÷pack(30m), 매입 2026-07-03)
-- ── 검증 ────────────────────────────────────────────────────────────────────
--  ① 수성 현수막 2코팅에서 70·80폭이 90폭보다 싸야 한다(그래야 다시 선택된다)
--     SELECT item_code, width_mm, avg_unit_cost FROM items
--      WHERE item_group='수성 현수막원단 2코팅' AND width_mm BETWEEN 600 AND 900 ORDER BY width_mm;
--     → 60폭 420 · 70폭 480 · 80폭 510 · 90폭 510
--  ② 백업이 잡혔는가
--     SELECT COUNT(*) FROM _bak_0605_material_cost;   → 200 내외
