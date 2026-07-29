-- 0490_pack_size_roll_length.sql
-- 롤당 길이(pack_size) 구조화 — 규격 문구에 섞여 있던 '폭 + 롤길이' 를 분리 (사용자 지시)
--
-- 배경: 원단·시트·코팅지의 규격이 "152cm 45m"·"122폭/50m" 처럼 **폭과 롤당 길이를 한 문자열에**
--   담고 있었다. 폭은 0480~0489 에서 width_mm 으로 구조화했고, 이번엔 길이를 pack_size 로 뺀다.
--   매입이 EA(롤) 단위로 들어오는데(SPM011G-127 = 10 EA × 112,200원 = 롤 10개) 자동차감은
--   yd 길이로 빼고 있어, 롤↔길이 환산에 반드시 롤당 길이가 필요하다.
--
-- ★ pack_size 의 단위는 **미터(m)** 로 통일한다.
--   기존에 유일하게 채워져 있던 SPM011G-090(pack_size=50 · base_unit='M')과 같은 규약이다.
--   프리즘반사시트 4품목만 규격이 '50yd' 라 미터로 환산했다(50yd × 0.9144 = 45.72m).
--   규격 문구는 '50yd' 그대로 두어 원 표기를 추적할 수 있게 했다.
--
-- ⚠️ unit(yd→롤) 전환과 base_unit 은 **이번에 건드리지 않는다**. 자동차감 코드가 아직 롤을
--    모르기 때문이다 — 현재 분기는 `base_unit === 'cm'` 이면 ÷10, 아니면 ÷914.4(yd) 둘뿐이다.
--    pack_size 만 채워도 계산은 그대로이므로 **동작 변화 0**(데이터 준비 단계).
--    unit 전환은 나머지 품목의 롤길이가 모이고 차감 코드에 롤 분기를 넣을 때 일괄로 한다.
--
-- ⚠️ 롤↔길이 불일치는 SPM011G-090 만의 문제가 아니다. 매입이 롤로 들어오고 차감이 yd 로
--    나가는 구조는 ROLL 원단 227품목 공통이며, 090 은 unit='롤' 이라 그게 표시에 드러났을 뿐이다.
--
-- 성격: 데이터 구조화(UPDATE만). `pack_size IS NULL` 조건이라 멱등 + 기존 값 보호.

-- ① 규격 문구에서 추출한 33품목
UPDATE items SET pack_size = 30, updated_at = CURRENT_TIMESTAMP
 WHERE pack_size IS NULL AND item_code IN ('BKLT-UV-127', 'PDK-J137', 'PDK-F137', 'BKLT-AQ-090', 'BKLT-AQ-127', 'BKLT-AQ-150');

UPDATE items SET pack_size = 45, updated_at = CURRENT_TIMESTAMP
 WHERE pack_size IS NULL AND item_code IN ('MCUV200-CO-060', 'MCUV200-CO-090', 'MCUV200-CO-127', 'MCP120-090', 'MCP120-152', 'MCP180-060', 'MCP180-090', 'MCP180-127', 'MCP180-152', 'MCN140-CO-090', 'MCN200-CO-060', 'MCN200-CO-127', 'MCA140-CO-152');

UPDATE items SET pack_size = 45.72, updated_at = CURRENT_TIMESTAMP
 WHERE pack_size IS NULL AND item_code IN ('PRM-Y094', 'PRM-Y122', 'PRM-W094', 'PRM-W122');

UPDATE items SET pack_size = 50, updated_at = CURRENT_TIMESTAMP
 WHERE pack_size IS NULL AND item_code IN ('IJ35C-137', 'BUJIK-060', 'BUJIK-090', 'BUJIK-127', 'BUJIK-152', 'BUJIK-180', 'LC6770P');

UPDATE items SET pack_size = 61, updated_at = CURRENT_TIMESTAMP
 WHERE pack_size IS NULL AND item_code IN ('MCP120-060', 'MCP120-127', 'MCA140-CO-060');

-- ② 사용자 지정 4계열 = 50m (SPM011G · SPM022G · SPP031M · SPP031G)
--    SPM011G-090 은 이미 50 이라 IS NULL 조건에서 자동 제외된다.
UPDATE items SET pack_size = 50, updated_at = CURRENT_TIMESTAMP
 WHERE pack_size IS NULL
   AND (item_code LIKE 'SPM011G-%' OR item_code LIKE 'SPM022G-%'
     OR item_code LIKE 'SPP031M-%' OR item_code LIKE 'SPP031G-%');
