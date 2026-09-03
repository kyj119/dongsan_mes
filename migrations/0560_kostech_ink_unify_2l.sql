-- 0560: 수성잉크 코스테크 4종 — 용량을 「2L」로 통일 (쪼개지 않음)
--
-- 결정 = **쪼개지 않고 2L 로 통일한다**(용준님 2026-09-04).
--   현재 `RM-I0007~10` 한 품목 안에 매입 원문이 세 가지 용량으로 섞여 있다:
--     수성안료잉크 XP1000 1.5L        316통 @11,000
--     Extreme 수성-C (1.5L)            80통 @ 8,000
--     Extreme 수성-C (3L)              20통 @16,000   ← 용량 2배
--     XP1000 M (B) [수성잉크, 1kg(병)]  30통 @ 7,000   ← 단위가 kg
--   TPM 은 `-5L`/`-20L` 로 나뉘어 있는데 코스테크만 안 나뉘어 있어 150통이 몇 L 인지 계산이
--   안 됐다. 품목을 늘리지 않고 **표기를 하나로 고정**하는 쪽을 택했다.
--
-- ⚠️ `base_unit`·`pack_size` 는 **채우지 않는다.** 잉크 110종이 전부 NULL 이고, 이 프로젝트는
--    잉크 용량을 **이름에만** 적는다(`TPM잉크 C 20L` · `수성잉크 잉크테크 C 5L` 모두 두 칸 NULL).
--    채우면 매입 입고가 `quantity × pack_size` 로 base 를 쌓는 경로(`inventory.ts` MU3)가 켜지는데
--    기존 재고 150 은 통 단위 숫자이고 `avg_unit_cost` 도 통당이라 축이 섞인다
--    → [[design-stock-base-unit-rebase]] 의 「두 칸 base = 50배」가 정확히 그 사고다.
--
-- ⚠️ `avg_unit_cost` 도 **손대지 않는다.** 지금 값(10,333~11,000/통)은 1.5L·3L·1kg 이 섞인
--    과거 매입의 가중평균이다. 2L 로 재환산하면 있지도 않은 이력을 만든다.
--    이 결정은 **앞으로의 표기 기준**이고, 기존 150통의 실제 병 크기는 소급 확정할 수 없다.
--    (앞으로 2L 로 들어오는 매입이 쌓이면 평균이 자연히 2L 축으로 수렴한다.)
--
-- 영향면 확인 = `product_materials` 0행 · `bom_items` 0행 · `item_group` 은 이 4종 전용.
--   이름을 참조하는 코드도 없다(`scripts/ecount-stock-match.cjs` 는 item_code 로 매핑한다).
--
-- ⚠️ 되돌리기 = UPDATE items SET item_name = replace(item_name,' 2L',''), specification = NULL
--               WHERE item_code IN ('RM-I0007','RM-I0008','RM-I0009','RM-I0010');

UPDATE items
   SET item_name = item_name || ' 2L',
       specification = '2L',
       updated_at = datetime('now')
 WHERE item_code IN ('RM-I0007', 'RM-I0008', 'RM-I0009', 'RM-I0010')
   AND item_name NOT LIKE '%2L%';
