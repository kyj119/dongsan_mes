-- 0488_fill_jg_widths_and_fix_typo.sql
-- ① JG- 라인 width_mm 채우기(0487 과 동일 기준) ② '뱌닥용' 오타 정리
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ① JG- 라인 width_mm  (사용자 확인: 시트/코팅지 계열 → 152폭=1520)
--
--   0487(프라임 PJ-·호진 HJ-)과 동일 클래스. 폭이 specification 문구에만 있고
--   width_mm 이 NULL 이라 폭매칭 후보에서 빠져 있었다.
--     60폭=600(4) · 90폭=900(7) · 127폭=1270(10) · 152폭=1520(5)  = 26품목
--
--   ⚠️ 깃발 4품목(JG-BONYEOM-*·JG-JASU-*)은 규격이 '120×80'·'135×90' 형태로 **폭이 아니다**.
--      `specification LIKE '%폭'` 조건이 이들을 자동으로 배제한다(대상 26 = 30 - 깃발 4).
--
-- ② '뱌닥용 코팅지' → '바닥용 코팅지'  (JG-BYADAK, 이름·그룹 양쪽)
--
--   ⚠️ HJ-BADAK('바닥용코팅지(30m)', 이미 1270)과 **통합하지 않았다**. 오타 정정만 지시받았고,
--      제조사가 다른 별개 품목이라 통합은 업무 판단이 필요하다. 이름이 서로 달라
--      ('바닥용 코팅지' vs '바닥용코팅지(30m)') 그룹은 계속 분리된 상태로 남는다.
--
-- 성격: 데이터 정정(UPDATE만). `width_mm IS NULL` 조건이라 멱등 + 기존 값 보호.

UPDATE items SET width_mm =  600, updated_at = CURRENT_TIMESTAMP
 WHERE item_code LIKE 'JG-%' AND specification = '60폭'  AND width_mm IS NULL;

UPDATE items SET width_mm =  900, updated_at = CURRENT_TIMESTAMP
 WHERE item_code LIKE 'JG-%' AND specification = '90폭'  AND width_mm IS NULL;

UPDATE items SET width_mm = 1270, updated_at = CURRENT_TIMESTAMP
 WHERE item_code LIKE 'JG-%' AND specification = '127폭' AND width_mm IS NULL;

UPDATE items SET width_mm = 1520, updated_at = CURRENT_TIMESTAMP
 WHERE item_code LIKE 'JG-%' AND specification = '152폭' AND width_mm IS NULL;

-- ② 오타 정정
UPDATE items
   SET item_name  = '바닥용 코팅지',
       item_group = '바닥용 코팅지',
       updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'JG-BYADAK';
