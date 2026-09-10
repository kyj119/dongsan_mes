-- 0603: 코팅지를 원가에 넣는다 — `product_materials.material_role` 신설 + 코팅 BOM 연결
--
-- 무엇이 빠져 있었나 — 코팅지를 연결한 BOM 이 **전 품목 통틀어 1행**이었다. 솔벤 시트는 코팅을
--   하고 그 값이 **판매단가에는 이미 들어가 있는데**(용준님) 원가에는 한 푼도 안 잡혀 있었다.
--   그래서 솔벤 계열 재료비율 29.9% 는 코팅을 뺀 값이고, 단가 재조정의 근거로 쓰면 낮게 본다.
--
-- 왜 컬럼이 필요한가 — 폭 휴리스틱은 롤을 **1종만** 고른다(그래야 폭만 다른 후보 19개 중
--   하나가 뽑힌다). 코팅지를 그냥 후보로 넣으면 **원단 대신 코팅지가 뽑힌다**. 그래서 역할을
--   명시하고 역할마다 1종씩 고른다. 기존 데이터는 전부 역할이 하나뿐이라(prod 실측: 롤 후보를
--   가진 78개 제품 중 두 역할에 걸친 것 0개) **값이 하나도 바뀌지 않는다**.
--
-- ★자동차감은 BASE 만 본다 — 코팅은 인쇄 **뒤** 공정이라 출력 시점에 빠지면 안 되고,
--   자동차감은 롤을 1종만 고르므로 후보에 섞이면 원단 차감이 코팅지 차감으로 바뀐다.
--   (`utils/autoDeductInventory` 가 `baseRoleOnly` 로 거른다.)
--
-- 소요량계획·부족체크·주간발주는 코팅지를 **수요로 잡기 시작한다** — 같은 로더를 쓰기 때문이고,
--   실제로 사서 쓰는 자재이므로 의도된 변화다.
--
-- 대상 (용준님 확정 2026-09-09)
--   · SPP031M(무광) → 솔벤 시트 계열 4종: SV-SHEET · SV-SHEETG · SV-WRAP · SV-LSHT
--     (SV-SHEET-PERF 타공시트는 제외)
--   · 무광코팅지 120g-호홍 → 수성 8종: AQ-PAT · AQ-INB · AQ-MNB(패트배너 원단 공유)
--     · AQ-KEL · AQ-KELG · AQ-SYN · AQ-SYNG · AQ-BKLT
--   · 소요 = **출력물 면적과 같은 크기**로 코팅한다 → 원단과 같은 폭매칭·길이 산식을 그대로 탄다.
--
-- 유광(SPP031G)은 BOM 에 넣지 않는다 — 폭별 단가가 무광과 **완전히 동일**해서(105폭 1,844 ·
--   127폭 2,196 · 137폭 2,372 · 152폭 2,626) 원가가 갈리지 않는다. 유광 여부는 후가공 옵션
--   `PP-COAT-G` 로 **표시**만 하고, 나중에 단가가 갈라지면 그 옵션에 **차액**을 넣는다.
--
-- ⚠️ 재실행 시 ALTER 는 "duplicate column" 으로 실패한다(SQLite 에 IF NOT EXISTS 가 없다).
--   부분 반영이 아니라 그 문장만 실패하는 것이고, 아래 INSERT 는 NOT EXISTS 로 멱등이다.
--
-- 되돌리기: `DELETE FROM product_materials WHERE material_role = 'LAMINATE';`
--   (컬럼은 D1 에서 DROP 이 어렵고, NULL = BASE 라 남아 있어도 무해하다)

ALTER TABLE product_materials ADD COLUMN material_role TEXT;

-- ── 1. 솔벤 시트 계열 → 무광코팅지 SPP031M (90·105·127·137·152폭) ──────────────
INSERT INTO product_materials (product_item_id, material_item_id, is_default, material_role)
SELECT p.id, m.id, 0, 'LAMINATE'
  FROM items p
  JOIN items m ON m.item_group = '무광코팅지 SPP031M' AND m.is_active = 1 AND m.width_mm IS NOT NULL
 WHERE p.item_code IN ('SV-SHEET', 'SV-SHEETG', 'SV-WRAP', 'SV-LSHT')
   AND NOT EXISTS (SELECT 1 FROM product_materials x
                    WHERE x.product_item_id = p.id AND x.material_item_id = m.id);

-- ── 2. 수성 패트·켈·합성지·백릿 → 무광코팅지 120g-호홍 (60·90·127·152폭) ────────
INSERT INTO product_materials (product_item_id, material_item_id, is_default, material_role)
SELECT p.id, m.id, 0, 'LAMINATE'
  FROM items p
  JOIN items m ON m.item_group = '무광코팅지 120g-호홍' AND m.is_active = 1 AND m.width_mm IS NOT NULL
 WHERE p.item_code IN ('AQ-PAT', 'AQ-INB', 'AQ-MNB', 'AQ-KEL', 'AQ-KELG',
                       'AQ-SYN', 'AQ-SYNG', 'AQ-BKLT')
   AND NOT EXISTS (SELECT 1 FROM product_materials x
                    WHERE x.product_item_id = p.id AND x.material_item_id = m.id);

-- ── 검증 ────────────────────────────────────────────────────────────────────
--  ① 연결 수 = 솔벤 4종 × 5폭 = 20 · 수성 8종 × 4폭 = 32 → 합 52
--     SELECT COUNT(*) FROM product_materials WHERE material_role = 'LAMINATE';   → 52
--  ② BASE 는 하나도 안 건드렸다
--     SELECT COUNT(*) FROM product_materials WHERE material_role IS NULL;        → 477
--  ③ 역할이 둘인 제품 = 위 12종뿐
--     SELECT COUNT(DISTINCT product_item_id) FROM product_materials
--      WHERE material_role = 'LAMINATE';                                          → 12
