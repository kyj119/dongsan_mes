-- ============================================================================
-- 2026-08-27 (5) 판재 40건 `deduction_method` NONE → BOARD (용준님 승인)
--
-- 선행 = `2026-08-27-board-sheet-spec.sql` 로 40건 전부 `sheet_spec` 충전 완료.
--        (비어 있으면 `BOARD_AREA_SQM[..] || '4x8'` 폴백이라 3x6 면적이 1.78배로 잡힌다)
--
-- ── 영향 ────────────────────────────────────────────────────────────────────
--   ①자동차감(`autoDeductInventory`) — 실측 `inventory_auto_deductions` **0행**.
--     prod 에서 한 번도 실행된 적이 없어 이번 변경으로 즉시 바뀌는 건 없다.
--   ②소요량 계획(`materialRequirement`) — **즉시 반영된다.** 지금까지 이 40건은
--     ROLL 이면서 `width_mm` 이 NULL 이라 rollMats(폭 필요)에도 boardMats(BOARD 필요)에도
--     못 들어가 **소요량이 아예 계산되지 않았다**. 이제 계산된다.
--
--   영향 제품 = **12종 / 연결 22라인** (전부 `roll형제=0` 이라 ROLL 분기와 경합 없음)
--     · UV 포맥스 10종(2T·3T·5T·8T·10T × 백색·검정) — 각 BOM 에 **3x6·4x8 두 규격**
--     · SIGN-CH 채널간판 · SIGN-PRT 돌출간판 — `PC-1.8T-M-48` 단일
--
-- ── ⚠️같이 고친 것: 판재 선택 규칙 (코드) ──────────────────────────────────
--   `boardMats[0]` 이었다. 「제품→해당 두께 보드 1종」이라는 전제였는데 위 UV 포맥스 10종이
--   **같은 자재의 3x6·4x8 을 함께** 달고 있어 전제가 깨진다. `mats` 쿼리에 `ORDER BY` 가 없어
--   `[0]` 은 사실상 **행 순서**고, 3x6(1.674㎡)이냐 4x8(2.977㎡)이냐로 소요량이 **1.78배** 갈렸다.
--   표시가 아니라 **어느 자재가 처리되는지**가 바뀌는 선택 경로다(CLAUDE.md §정렬 tie-break 와 같은 부류).
--   → `utils/rollConsumption.selectBoardMaterial()` 신설 = **출력물이 들어가는 가장 작은 장**
--     (회전 허용 · 없으면 가장 큰 장 · 면적 동률이면 `material_item_id` tie-break).
--     롤이 「출력폭 이상 최소폭」을 고르는 것과 같은 규칙이고, 두 호출부가 이 함수 하나를 쓴다.
--   게이트 = `npm run test:stock-unit` 30항목(판재 11 신설). ★옛 `[0]` 을 주입하면 3건이 실패하는 것까지 확인.
--
-- 백업: _bak_0827_boardpromote (40행)
-- ============================================================================

CREATE TABLE IF NOT EXISTS _bak_0827_boardpromote AS
SELECT id, item_code, item_name, unit, sheet_spec, deduction_method, width_mm
FROM items
WHERE is_active = 1 AND unit = '장' AND deduction_method = 'NONE';

UPDATE items SET
  deduction_method = 'BOARD',
  updated_at = datetime('now', '+9 hours')
WHERE is_active = 1 AND unit = '장' AND deduction_method = 'NONE'
  AND sheet_spec IN ('3x6', '4x8');   -- ★규격 없는 건 올리지 않는다(4x8 폴백 = 조용한 오차)

-- ============================================================================
-- 검증
--   -- ① 장 단위 66건 전부 BOARD + 규격 보유
--   SELECT deduction_method, sheet_spec, COUNT(*) FROM items
--    WHERE is_active=1 AND unit='장' GROUP BY 1,2;
--   -- ② F6 위반 0 (BOARD 인데 규격 없음)
--   SELECT COUNT(*) FROM items WHERE is_active=1 AND deduction_method='BOARD'
--     AND COALESCE(sheet_spec,'') NOT IN ('3x6','4x8');
--
-- ── 롤백 ────────────────────────────────────────────────────────────────────
-- UPDATE items SET deduction_method = (SELECT b.deduction_method FROM _bak_0827_boardpromote b WHERE b.id = items.id)
--   WHERE id IN (SELECT id FROM _bak_0827_boardpromote);
-- ============================================================================
