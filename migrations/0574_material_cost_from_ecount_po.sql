-- 0574: 자재 원가를 이카운트 발주 실단가로 맞춘다 (95종)
--
-- 근거 = 이카운트 `발주서현황` 2026-01-08~09-08 전량(70,079개 · 2억 5,441만원)을 받아
--   MES `items.avg_unit_cost` 와 1:1 대조했다. 83종 중 61종이 10% 이내로 이미 맞았고,
--   6종은 값이 아예 비어 있었으며, 나머지가 인상·인하분이다.
--
-- ★단가 축이 다르다 — 발주는 **롤/장 단가**, MES 는 **base 단위당 단가**다.
--   `base_unit='M'` 이고 `pack_size` 가 있으면 **롤단가 ÷ 롤길이(m)** 로 환산했고,
--   판재(장)·현수막 원단(yd)은 발주 단가를 그대로 쓴다.
--   예: SPM011G [127폭] 112,200원/롤 ÷ 50m = 2,244원/m  (MES 2,325 → 2,244)
--
-- ★★`avg_unit_cost` 의 뜻이 바뀐다 — 종전엔 「매입 가중평균」이었는데 이 마이그레이션 이후로는
--   **「최근 매입 단가」**다(용준님 선택 2026-09-08). 현재 원가를 더 정확히 비추는 대신,
--   과거 주문의 원가를 재계산하면 그 시점 단가가 아니게 된다.
--   ⇒ 원가 백필(`scripts/cost-backfill-run.cjs`)을 다시 돌릴 때 이 점을 감안할 것.
--
-- 15% 이상 움직이는 것은 6종뿐이다:
--   FMX-PMT-5T-36  16,330 → 13,000 (-20.4%)    FLEXN-200  3,000 → 3,500 (+16.7%)
--   FMX-PMT-3T-36   9,290 →  7,820 (-15.8%)    SVB-152    1,441 → 1,200 (-16.7%)
--   FMX-PMT-5T-48  27,522 → 23,350 (-15.2%)    PAT-152    2,097 → 2,463 (+17.5%)
--
-- 값이 비어 있던 6종이 채워진다:
--   JJN-06T 40,700 · JJN-09T 45,400 · JJN-12T 55,100  (자작나무 = 판재 + 코팅비 합산.
--     우드케이가 코팅을 입혀 보내므로 코팅비는 자재 원가의 일부다)
--   PRM-W122 9,952/m (455,000 ÷ 45.72m) · CLEAR-152 4,767/m · SPC031G-137 2,616/m
--
-- ⚠️ **폭이 어긋나 갱신하지 않은 것 2종** — 다른 폭의 값을 덮어쓰면 원가가 통째로 틀어진다:
--   · SVCV-127(솔벤 캔버스원단, MES 1,270mm) ↔ 발주 「솔벤캔버스 [1520*20M]」 = 1,520폭
--     → 1520폭 품목이 MES 에 없다. 신설할지 판단이 먼저다.
--   · KMT-UVONEWAY(원웨이 필름, MES 1,370mm) ↔ 발주 「[1370*50M]」
--     → 그 표기는 폭이 아니라 원단 크기라 파서가 13,700mm 로 읽었다. 값 자체는 맞을 수 있으나
--       확인 전까지 건드리지 않는다.
-- ⚠️ 발주에는 있는데 MES 에 품목이 없는 것 3종: SPC031G [150폭] · SPT031M [137폭] · LC2000 [105폭].
--    (LC2000 은 MES 에 100폭만 있다 — 105 가 맞다면 폭 정정이 먼저다.)
--
-- ★안 쓰는 자재도 품목은 남긴다(용준님 2026-09-08) — 간혹 들어오기 때문이다.
--   그래서 이 마이그레이션은 어떤 품목도 비활성화하거나 지우지 않는다. 단가만 손댄다.
--
-- 생성 = `node scripts/../scratchpad/gen.js`(대조·폭검증·환산). 발주 원본은 이카운트 화면이 정본이다.
-- 되돌리기: `_bak_0574_material_cost` 에 MATERIAL 839종의 원래 값이 그대로 있다.

-- ── 0. 백업 (자재 전량 — 되돌릴 때 대상을 고르지 않아도 되게) ────────────────
CREATE TABLE IF NOT EXISTS _bak_0574_material_cost AS
SELECT id, item_code, item_name, avg_unit_cost
  FROM items WHERE item_type = 'MATERIAL';

-- ── 1. 갱신 (발주 최신단가 → base 단위 환산) ─────────────────────────────────
UPDATE items SET avg_unit_cost = 1854 WHERE item_code = 'SPM011G-105';  -- 일반시트 SPM011G 92700 ÷50m · 1937 → 1854 (-4.3%)
UPDATE items SET avg_unit_cost = 2244 WHERE item_code = 'SPM011G-127';  -- 일반시트 SPM011G 112200 ÷50m · 2325 → 2244 (-3.5%)
UPDATE items SET avg_unit_cost = 2430 WHERE item_code = 'SPM011G-137';  -- 일반시트 SPM011G 121500 ÷50m · 2531 → 2430 (-4.0%)
UPDATE items SET avg_unit_cost = 2694 WHERE item_code = 'SPM011G-152';  -- 일반시트 SPM011G 134700 ÷50m · 2832 → 2694 (-4.9%)
UPDATE items SET avg_unit_cost = 1992 WHERE item_code = 'SPM022G-105';  -- 그레이시트 SPM022G 99600 ÷50m · 2086 → 1992 (-4.5%)
UPDATE items SET avg_unit_cost = 2392 WHERE item_code = 'SPM022G-127';  -- 그레이시트 SPM022G 119600 ÷50m · 2447 → 2392 (-2.2%)
UPDATE items SET avg_unit_cost = 2586 WHERE item_code = 'SPM022G-137';  -- 그레이시트 SPM022G 129300 ÷50m · 2687 → 2586 (-3.8%)
UPDATE items SET avg_unit_cost = 2880 WHERE item_code = 'SPM022G-152';  -- 그레이시트 SPM022G 144000 ÷50m · 3101 → 2880 (-7.1%)
UPDATE items SET avg_unit_cost = 1440 WHERE item_code = 'SPP031M-090';  -- 무광코팅지 SPP031M 72000 ÷50m · 1501 → 1440 (-4.1%)
UPDATE items SET avg_unit_cost = 1844 WHERE item_code = 'SPP031M-105';  -- 무광코팅지 SPP031M 92200 ÷50m · 1943 → 1844 (-5.1%)
UPDATE items SET avg_unit_cost = 2196 WHERE item_code = 'SPP031M-127';  -- 무광코팅지 SPP031M 109800 ÷50m · 2288 → 2196 (-4.0%)
UPDATE items SET avg_unit_cost = 2372 WHERE item_code = 'SPP031M-137';  -- 무광코팅지 SPP031M 118600 ÷50m · 2457 → 2372 (-3.5%)
UPDATE items SET avg_unit_cost = 2626 WHERE item_code = 'SPP031M-152';  -- 무광코팅지 SPP031M 131300 ÷50m · 2740 → 2626 (-4.2%)
UPDATE items SET avg_unit_cost = 1844 WHERE item_code = 'SPP031G-105';  -- 유광코팅지 SPP031G 92200 ÷50m · 1965 → 1844 (-6.2%)
UPDATE items SET avg_unit_cost = 2196 WHERE item_code = 'SPP031G-127';  -- 유광코팅지 SPP031G 109800 ÷50m · 2294 → 2196 (-4.3%)
UPDATE items SET avg_unit_cost = 2372 WHERE item_code = 'SPP031G-137';  -- 유광코팅지 SPP031G 118600 ÷50m · 2486 → 2372 (-4.6%)
UPDATE items SET avg_unit_cost = 2626 WHERE item_code = 'SPP031G-152';  -- 유광코팅지 SPP031G 131300 ÷50m · 2727 → 2626 (-3.7%)
UPDATE items SET avg_unit_cost = 2616 WHERE item_code = 'SPC031G-137';  -- 투명시트 SPC031G 130800 ÷50m · 0 → 2616 ((0→채움))
UPDATE items SET avg_unit_cost = 2088 WHERE item_code = 'EP115-100';  -- 엠보시트 EP115 104400 ÷50m · 2235 → 2088 (-6.6%)
UPDATE items SET avg_unit_cost = 2520 WHERE item_code = 'EP115-122';  -- 엠보시트 EP115 126000 ÷50m · 2639 → 2520 (-4.5%)
UPDATE items SET avg_unit_cost = 3422.4 WHERE item_code = 'LD59HTG-137';  -- 랩핑시트 LD59HTG 171120 ÷50m · 3322 → 3422.4 (3.0%)
UPDATE items SET avg_unit_cost = 1575 WHERE item_code = 'FLEXL-090';  -- 조명용 후렉스 78750 ÷50m · 1482 → 1575 (6.3%)
UPDATE items SET avg_unit_cost = 1750 WHERE item_code = 'FLEXL-100';  -- 조명용 후렉스 87500 ÷50m · 1625 → 1750 (7.7%)
UPDATE items SET avg_unit_cost = 1925 WHERE item_code = 'FLEXL-110';  -- 조명용 후렉스 96250 ÷50m · 1870 → 1925 (2.9%)
UPDATE items SET avg_unit_cost = 2100 WHERE item_code = 'FLEXL-120';  -- 조명용 후렉스 105000 ÷50m · 1920 → 2100 (9.4%)
UPDATE items SET avg_unit_cost = 2275 WHERE item_code = 'FLEXL-130';  -- 조명용 후렉스 113750 ÷50m · 2303 → 2275 (-1.2%)
UPDATE items SET avg_unit_cost = 2625 WHERE item_code = 'FLEXL-150';  -- 조명용 후렉스 131250 ÷50m · 2513 → 2625 (4.5%)
UPDATE items SET avg_unit_cost = 2800 WHERE item_code = 'FLEXL-160';  -- 조명용 후렉스 140000 ÷50m · 2604 → 2800 (7.5%)
UPDATE items SET avg_unit_cost = 3150 WHERE item_code = 'FLEXL-180';  -- 조명용 후렉스 157500 ÷50m · 2948 → 3150 (6.9%)
UPDATE items SET avg_unit_cost = 3850 WHERE item_code = 'FLEXL-220';  -- 조명용 후렉스 192500 ÷50m · 3850 → 3850 (0.0%)
UPDATE items SET avg_unit_cost = 4550 WHERE item_code = 'FLEXL-260';  -- 조명용 후렉스 227500 ÷50m · 4394 → 4550 (3.6%)
UPDATE items SET avg_unit_cost = 5600 WHERE item_code = 'FLEXL-320';  -- 조명용 후렉스 280000 ÷50m · 5120 → 5600 (9.4%)
UPDATE items SET avg_unit_cost = 1575 WHERE item_code = 'FLEXN-090';  -- 비조명용 후렉스 78750 ÷50m · 1508 → 1575 (4.4%)
UPDATE items SET avg_unit_cost = 1750 WHERE item_code = 'FLEXN-100';  -- 비조명용 후렉스 87500 ÷50m · 1667 → 1750 (5.0%)
UPDATE items SET avg_unit_cost = 1925 WHERE item_code = 'FLEXN-110';  -- 비조명용 후렉스 96250 ÷50m · 1859 → 1925 (3.6%)
UPDATE items SET avg_unit_cost = 2275 WHERE item_code = 'FLEXN-130';  -- 비조명용 후렉스 113750 ÷50m · 2219 → 2275 (2.5%)
UPDATE items SET avg_unit_cost = 2625 WHERE item_code = 'FLEXN-150';  -- 비조명용 후렉스 131250 ÷50m · 2475 → 2625 (6.1%)
UPDATE items SET avg_unit_cost = 2800 WHERE item_code = 'FLEXN-160';  -- 비조명용 후렉스 140000 ÷50m · 2800 → 2800 (0.0%)
UPDATE items SET avg_unit_cost = 3150 WHERE item_code = 'FLEXN-180';  -- 비조명용 후렉스 157500 ÷50m · 2880 → 3150 (9.4%)
UPDATE items SET avg_unit_cost = 3500 WHERE item_code = 'FLEXN-200';  -- 비조명용 후렉스 175000 ÷50m · 3000 → 3500 (16.7%)
UPDATE items SET avg_unit_cost = 4000 WHERE item_code = 'FLEXN-250';  -- 비조명용 후렉스 200000 ÷50m · 3930 → 4000 (1.8%)
UPDATE items SET avg_unit_cost = 5600 WHERE item_code = 'FLEXN-320';  -- 비조명용 후렉스 280000 ÷50m · 5600 → 5600 (0.0%)
UPDATE items SET avg_unit_cost = 600 WHERE item_code = 'SVB-070';  -- 솔벤 현수막 600 · 690 → 600 (-13.0%)
UPDATE items SET avg_unit_cost = 650 WHERE item_code = 'SVB-090';  -- 솔벤 현수막 650 · 673 → 650 (-3.4%)
UPDATE items SET avg_unit_cost = 1130 WHERE item_code = 'SVB-127';  -- 솔벤 현수막 1130 · 1197 → 1130 (-5.6%)
UPDATE items SET avg_unit_cost = 1200 WHERE item_code = 'SVB-152';  -- 솔벤 현수막 1200 · 1441 → 1200 (-16.7%)
UPDATE items SET avg_unit_cost = 2500 WHERE item_code = 'SVB-200';  -- 솔벤 현수막 2500 · 2559 → 2500 (-2.3%)
UPDATE items SET avg_unit_cost = 3980 WHERE item_code = 'SVB-250';  -- 솔벤 현수막 3980 · 4096 → 3980 (-2.8%)
UPDATE items SET avg_unit_cost = 4700 WHERE item_code = 'SVB-320';  -- 솔벤 현수막 4700 · 4830 → 4700 (-2.7%)
UPDATE items SET avg_unit_cost = 350 WHERE item_code = 'AQ2-060';  -- 수성 현수막원단 2코팅 350 · 375 → 350 (-6.7%)
UPDATE items SET avg_unit_cost = 480 WHERE item_code = 'AQ2-070';  -- 수성 현수막원단 2코팅 480 · 436 → 480 (10.1%)
UPDATE items SET avg_unit_cost = 510 WHERE item_code = 'AQ2-080';  -- 수성 현수막원단 2코팅 510 · 462 → 510 (10.4%)
UPDATE items SET avg_unit_cost = 700 WHERE item_code = 'AQ2-100';  -- 수성 현수막원단 2코팅 700 · 634 → 700 (10.4%)
UPDATE items SET avg_unit_cost = 870 WHERE item_code = 'AQ2-120';  -- 수성 현수막원단 2코팅 870 · 812 → 870 (7.1%)
UPDATE items SET avg_unit_cost = 740 WHERE item_code = 'AQ2-130';  -- 수성 현수막원단 2코팅 740 · 833 → 740 (-11.2%)
UPDATE items SET avg_unit_cost = 860 WHERE item_code = 'AQ2-140';  -- 수성 현수막원단 2코팅 860 · 888 → 860 (-3.2%)
UPDATE items SET avg_unit_cost = 920 WHERE item_code = 'AQ2-152';  -- 수성 현수막원단 2코팅 920 · 927 → 920 (-0.8%)
UPDATE items SET avg_unit_cost = 950 WHERE item_code = 'AQ2-160';  -- 수성 현수막원단 2코팅 950 · 1004 → 950 (-5.4%)
UPDATE items SET avg_unit_cost = 950 WHERE item_code = 'AQ2-170';  -- 수성 현수막원단 2코팅 950 · 1011 → 950 (-6.0%)
UPDATE items SET avg_unit_cost = 1140 WHERE item_code = 'AQ2-180';  -- 수성 현수막원단 2코팅 1140 · 1044 → 1140 (9.2%)
UPDATE items SET avg_unit_cost = 1270 WHERE item_code = 'SVM-060';  -- 솔벤 매쉬 63500 ÷50m · 1256 → 1270 (1.1%)
UPDATE items SET avg_unit_cost = 2540 WHERE item_code = 'SVM-127';  -- 솔벤 매쉬 127000 ÷50m · 2286 → 2540 (11.1%)
UPDATE items SET avg_unit_cost = 3200 WHERE item_code = 'SVM-160';  -- 솔벤 매쉬 160000 ÷50m · 3200 → 3200 (0.0%)
UPDATE items SET avg_unit_cost = 4000 WHERE item_code = 'SVM-200';  -- 솔벤 매쉬 200000 ÷50m · 4000 → 4000 (0.0%)
UPDATE items SET avg_unit_cost = 6125 WHERE item_code = 'SVM-250';  -- 솔벤 매쉬 306250 ÷50m · 5800 → 6125 (5.6%)
UPDATE items SET avg_unit_cost = 7840 WHERE item_code = 'SVM-320';  -- 솔벤 매쉬 392000 ÷50m · 7213 → 7840 (8.7%)
UPDATE items SET avg_unit_cost = 5180 WHERE item_code = 'FMX-PMT-2T-36';  -- 포맥스 포마트(국산) 5180 · 5180 → 5180 (0.0%)
UPDATE items SET avg_unit_cost = 9320 WHERE item_code = 'FMX-PMT-2T-48';  -- 포맥스 포마트(국산) 9320 · 9320 → 9320 (0.0%)
UPDATE items SET avg_unit_cost = 7820 WHERE item_code = 'FMX-PMT-3T-36';  -- 포맥스 포마트(국산) 7820 · 9290 → 7820 (-15.8%)
UPDATE items SET avg_unit_cost = 14030 WHERE item_code = 'FMX-PMT-3T-48';  -- 포맥스 포마트(국산) 14030 · 14680 → 14030 (-4.4%)
UPDATE items SET avg_unit_cost = 13000 WHERE item_code = 'FMX-PMT-5T-36';  -- 포맥스 포마트(국산) 13000 · 16330 → 13000 (-20.4%)
UPDATE items SET avg_unit_cost = 23350 WHERE item_code = 'FMX-PMT-5T-48';  -- 포맥스 포마트(국산) 23350 · 27522 → 23350 (-15.2%)
UPDATE items SET avg_unit_cost = 37380 WHERE item_code = 'FMX-PMT-8T-48';  -- 포맥스 포마트(국산) 37380 · 37380 → 37380 (0.0%)
UPDATE items SET avg_unit_cost = 46690 WHERE item_code = 'FMX-PMT-10T-48';  -- 포맥스 포마트(국산) 46690 · 50717 → 46690 (-7.9%)
UPDATE items SET avg_unit_cost = 8040 WHERE item_code = 'FMX-YES-2T-48';  -- 포맥스 예스(중국산) 8040 · 8040 → 8040 (0.0%)
UPDATE items SET avg_unit_cost = 8400 WHERE item_code = 'FMX-YES-3T-36';  -- 포맥스 예스(중국산) 8400 · 0 → 8400 ((0→채움))
UPDATE items SET avg_unit_cost = 13060 WHERE item_code = 'FMX-YES-3T-48';  -- 포맥스 예스(중국산) 13060 · 12873 → 13060 (1.5%)
UPDATE items SET avg_unit_cost = 12490 WHERE item_code = 'FMX-YES-5T-36';  -- 포맥스 예스(중국산) 12490 · 12490 → 12490 (0.0%)
UPDATE items SET avg_unit_cost = 13000 WHERE item_code = 'SKS-20T-W-36';  -- 스카시 13000 · 13000 → 13000 (0.0%)
UPDATE items SET avg_unit_cost = 13000 WHERE item_code = 'SKS-20T-B-36';  -- 스카시 13000 · 13696 → 13000 (-5.1%)
UPDATE items SET avg_unit_cost = 17500 WHERE item_code = 'SKS-30T-W-36';  -- 스카시 17500 · 17500 → 17500 (0.0%)
UPDATE items SET avg_unit_cost = 17500 WHERE item_code = 'SKS-30T-B-36';  -- 스카시 17500 · 19379 → 17500 (-9.7%)
UPDATE items SET avg_unit_cost = 40700 WHERE item_code = 'JJN-06T';  -- 자작나무 40700 · 0 → 40700 ((0→채움))
UPDATE items SET avg_unit_cost = 45400 WHERE item_code = 'JJN-09T';  -- 자작나무 45400 · 0 → 45400 ((0→채움))
UPDATE items SET avg_unit_cost = 55100 WHERE item_code = 'JJN-12T';  -- 자작나무 55100 · 0 → 55100 ((0→채움))
UPDATE items SET avg_unit_cost = 4766.67 WHERE item_code = 'CLEAR-152';  -- 클리어필름 143000 ÷30m · 0 → 4766.67 ((0→채움))
UPDATE items SET avg_unit_cost = 4550 WHERE item_code = 'MAG-060';  -- 고무자석시트 45500 ÷10m · 5300 → 4550 (-14.2%)
UPDATE items SET avg_unit_cost = 9500 WHERE item_code = 'MAG-100';  -- 고무자석시트 95000 ÷10m · 11000 → 9500 (-13.6%)
UPDATE items SET avg_unit_cost = 9951.88 WHERE item_code = 'PRM-W122';  -- 프리즘반사시트 백색 455000 ÷45.72m · 0 → 9951.88 ((0→채움))
UPDATE items SET avg_unit_cost = 530.82 WHERE item_code = 'MCP120-060';  -- 무광코팅지 120g-호홍 32380 ÷61m · 506 → 530.82 (4.9%)
UPDATE items SET avg_unit_cost = 1061.48 WHERE item_code = 'MCP120-127';  -- 무광코팅지 120g-호홍 64750 ÷61m · 1007 → 1061.48 (5.4%)
UPDATE items SET avg_unit_cost = 805 WHERE item_code = 'PAT-060';  -- 패트배너 30M 호홍 24150 ÷30m · 758 → 805 (6.2%)
UPDATE items SET avg_unit_cost = 1610 WHERE item_code = 'PAT-127';  -- 패트배너 30M 호홍 48300 ÷30m · 1444 → 1610 (11.5%)
UPDATE items SET avg_unit_cost = 2463 WHERE item_code = 'PAT-152';  -- 패트배너 30M 호홍 73890 ÷30m · 2097 → 2463 (17.5%)
UPDATE items SET avg_unit_cost = 800 WHERE item_code = 'PONGE-130';  -- 폰지 800 · 839 → 800 (-4.6%)

-- ── 2. 검증 (적용 후) ───────────────────────────────────────────────────────
--  ① 실제로 바뀐 건수
--     SELECT COUNT(*) FROM items i JOIN _bak_0574_material_cost b ON b.id = i.id
--      WHERE COALESCE(i.avg_unit_cost,0) <> COALESCE(b.avg_unit_cost,0);
--  ② 비어 있던 6종이 채워졌는지
--     SELECT item_code, avg_unit_cost FROM items
--      WHERE item_code IN ('JJN-06T','JJN-09T','JJN-12T','PRM-W122','CLEAR-152','SPC031G-137');
--     → 40,700 · 45,400 · 55,100 · 9,952.32 · 4,766.67 · 2,616
--  ③ BOM 연결 자재 중 단가 0 이 51종 → 45종으로 줄었는지
--     SELECT COUNT(*) FROM items m WHERE COALESCE(m.avg_unit_cost,0)=0
--       AND EXISTS (SELECT 1 FROM product_materials pm WHERE pm.material_item_id = m.id);
