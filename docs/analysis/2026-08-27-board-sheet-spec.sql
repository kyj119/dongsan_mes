-- ============================================================================
-- 2026-08-27 (4) 판재 `sheet_spec` 채우기 — 40건
--
-- 배경: 라벨 스윕(앞 스크립트)에서 판재 39건을 `BOARD` 로 올리지 못한 이유가 이거였다.
--   `BOARD_AREA_SQM[sheet_spec] || '4x8'`(`autoDeductInventory.ts:137,164` · `materialRequirement.ts:144`)
--   이라 `sheet_spec` 이 비면 **전부 4x8 로 폴백**한다. `-36` 계열(3x6 = 1.674㎡)을
--   4x8(2.977㎡)로 계산하면 **면적이 1.78배**라 소요량·차감량이 그만큼 어긋난다.
--
-- ★출처는 코드 접미가 아니라 **`specification`** 이다 — 40건 전부 규격 문자열에 `3x6`·`4x8` 이
--   이미 들어 있다(「10T 3x6 백색」·「3T 은색 4x8」). 코드 접미(`-36`/`-48`)는 **교차검증용**으로만 쓴다.
--   접미로 유추하면 `FMX-PMT-10T-36-B` 처럼 뒤에 색 코드가 붙은 것에서 자리를 잘못 센다.
--
-- 대상 40건 = 포맥스 포마트 24 · 포맥스 예스 12 · 광확산PC 2 · 알마이트 1 · 스카시 1
--   (`unit='장'` 66건 중 나머지 26건은 이미 BOARD + sheet_spec 이 채워져 있다)
--
-- ⚠️**이 스크립트는 `deduction_method` 를 건드리지 않는다.** `sheet_spec` 은 BOARD 분기에서만 읽히므로
--   이것만으로는 동작이 바뀌지 않는다 — BOARD 승격은 별도 판단이다(아래 참조).
--
-- ── BOARD 승격을 지금 하지 않는 이유 ────────────────────────────────────────
--   실측: `inventory_auto_deductions` **0행** — 자동차감은 prod 에서 한 번도 실행된 적이 없다.
--   따라서 차감 쪽 위험은 0이다. 다만 `materialRequirement`(자재 소요량 계획)는 BOARD 를 즉시 읽으므로
--   **BOM 에 걸린 20건이 소요량 계획에 새로 등장한다**. 그건 옳은 방향이지만 발주요청 계통이
--   같은 주에 두 번 고쳐진 참이라(단위 축) 한 번에 섞지 않는다. 승격은 용준님 확인 후 별건으로.
--
-- 백업: _bak_0827_sheetspec (40행)
-- ============================================================================

CREATE TABLE IF NOT EXISTS _bak_0827_sheetspec AS
SELECT id, item_code, item_name, specification, sheet_spec, deduction_method
FROM items
WHERE is_active = 1 AND unit = '장' AND COALESCE(sheet_spec, '') = '';

UPDATE items SET
  sheet_spec = CASE
    WHEN specification LIKE '%3x6%' THEN '3x6'
    WHEN specification LIKE '%4x8%' THEN '4x8'
  END,
  updated_at = datetime('now', '+9 hours')
WHERE is_active = 1 AND unit = '장' AND COALESCE(sheet_spec, '') = ''
  AND (specification LIKE '%3x6%' OR specification LIKE '%4x8%');

-- ============================================================================
-- 검증
--   -- ① 남은 미기입 0 이어야 한다
--   SELECT COUNT(*) FROM items WHERE is_active=1 AND unit='장' AND COALESCE(sheet_spec,'')='';
--
--   -- ② 코드 접미 ↔ sheet_spec 교차검증 — 불일치 0 이어야 한다
--   SELECT item_code, specification, sheet_spec FROM items
--    WHERE is_active=1 AND unit='장'
--      AND ((item_code LIKE '%-36' OR item_code LIKE '%-36-%') AND sheet_spec <> '3x6'
--        OR (item_code LIKE '%-48' OR item_code LIKE '%-48-%') AND sheet_spec <> '4x8');
--
--   -- ③ 분포
--   SELECT deduction_method, sheet_spec, COUNT(*) FROM items
--    WHERE is_active=1 AND unit='장' GROUP BY 1,2;
--
-- ── 롤백 ────────────────────────────────────────────────────────────────────
-- UPDATE items SET sheet_spec = (SELECT b.sheet_spec FROM _bak_0827_sheetspec b WHERE b.id = items.id)
--   WHERE id IN (SELECT id FROM _bak_0827_sheetspec);
-- ============================================================================
