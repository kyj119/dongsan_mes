-- 0487_fill_prime_hojin_widths.sql
-- 프라임(PJ-)·호진(HJ-) 라인 width_mm 채우기 — 시트/코팅지 계열이므로 152폭=1520 (사용자 확인)
--
-- 배경: 폭이 specification 문구("127폭")에만 있고 width_mm 이 NULL 이라 자재 폭매칭이
--   `width_mm IS NOT NULL` 에서 후보로 잡지 못한다(0486 조명시트와 동일 클래스).
--   PJ-/HJ- 51품목이 전부 이 상태였다.
--
--   규격 문구 → width_mm :  60폭=600 · 90폭=900 · 127폭=1270 · 152폭=1520
--
--   ★152폭=1520 의 근거: 이 라인은 시트/코팅지 계열이다(사용자 확인). 현수막 원단 계열만
--     실물 152cm 를 통상 150 으로 적어 1500 으로 등록한다(SVB-152·AQ1-152·FLEXL-150 …).
--     계열을 잘못 보면 20mm 씩 어긋나므로 코드 숫자만 보고 일괄 변환하면 안 된다.
--
-- ⚠️ PJ-BACKLIT-P152(수성 백릿-프라임)는 **의도적으로 제외**했다.
--    백릿은 시트/코팅지가 아니라 현수막 원단 계열이고, 같은 자재의 호홍 제품
--    BKLT-AQ-150(수성 백릿-호홍)이 **1500** 으로 등록돼 있다. 프라임 것만 1520 으로 넣으면
--    같은 자재가 제조사별로 20mm 달라져 폭매칭이 갈린다. 실물 폭 확인 후 별도 처리.
--    (같은 그룹의 P90·P127 은 논쟁이 없어 함께 채웠다)
--
-- ⚠️ 깃발(JG-BONYEOM-*·JG-JASU-*)은 규격이 '120×80' 형태라 폭이 아니다 — 대상 아님.
--    JG- 라인 30품목은 이번 지시 범위 밖이라 손대지 않았다(별도 확인).
--
-- ⚠️ 이 품목들은 deduction_method='NONE' 이라 **인쇄 자동차감(autoDeductInventory)은
--    폭을 채워도 여전히 건너뛴다**(ROLL/BOARD 만 처리). 폭을 채우는 효과는 ①후가공
--    자재차감(autoDeductPostProcessingMaterials 은 deduction_method 를 보지 않고 item_group+
--    width_mm 만 본다) ②발주·재고 화면의 폭 기준 판단 ③dup_widths 감사 대상 편입 이다.
--
-- ⚠️ specification 문구는 '127폭' 형식 그대로 뒀다(다른 자재는 '127cm'). 표기 통일은 별건.
--
-- 성격: 데이터 정정(UPDATE만). `width_mm IS NULL` 조건이라 멱등 + 기존 값 보호.

UPDATE items SET width_mm =  600, updated_at = CURRENT_TIMESTAMP
 WHERE (item_code LIKE 'PJ-%' OR item_code LIKE 'HJ-%')
   AND specification = '60폭'  AND width_mm IS NULL;

UPDATE items SET width_mm =  900, updated_at = CURRENT_TIMESTAMP
 WHERE (item_code LIKE 'PJ-%' OR item_code LIKE 'HJ-%')
   AND specification = '90폭'  AND width_mm IS NULL;

UPDATE items SET width_mm = 1270, updated_at = CURRENT_TIMESTAMP
 WHERE (item_code LIKE 'PJ-%' OR item_code LIKE 'HJ-%')
   AND specification = '127폭' AND width_mm IS NULL;

UPDATE items SET width_mm = 1520, updated_at = CURRENT_TIMESTAMP
 WHERE (item_code LIKE 'PJ-%' OR item_code LIKE 'HJ-%')
   AND specification = '152폭' AND width_mm IS NULL
   AND item_code <> 'PJ-BACKLIT-P152';
