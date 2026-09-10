-- 0612: 발주 **검수 승인** 표시 (Phase 3)
--
-- 흐름의 마지막 칸이다 — 발주서 작성(0610) → 입고 실측(0611) → **발주 담당자 확인**.
-- 담당자가 「뭐가 안 들어왔지」를 기억으로 찾지 않게, **차이가 있는 건만** 큐로 올리고
-- 확인이 끝나면 그 자리에 도장을 찍는다. 확인이 일이 아니라 **승인**이 되게 하는 것이 목적이다.
--
--   · `reviewed_at` / `reviewed_by` = 누가 언제 확인했나.
--
-- 검수 대기 판정(코드 정본 = `routes/purchaseOrders/listFilter.ts` PO_REVIEW_PENDING_SQL):
--   ① 입고가 끝났거나 진행 중인데(RECEIVED·PARTIAL_RECEIVED) **발주 수량 ≠ 입고 수량**인 라인이 있다
--      — 단, 예상 수량 라인은 **롤 수**로 판정한다(길이는 원래 달라진다).
--   ② 또는 **입고 화면에서 사후 생성**된 발주다(`adhoc_source='RECEIVING'`).
--   그리고 아직 `reviewed_at IS NULL`.
--
-- ⚠️ 재실행 시 ALTER 는 duplicate column 으로 실패한다(그 문장만 실패).
-- 되돌리기: 두 컬럼 다 NULL 기본이라 남아 있어도 무해하다.

ALTER TABLE purchase_orders ADD COLUMN reviewed_at DATETIME;
ALTER TABLE purchase_orders ADD COLUMN reviewed_by INTEGER;

-- 검수 대기 조회가 목록 필터로 매번 돈다 — 미확인만 빠르게 걸러 낸다.
CREATE INDEX IF NOT EXISTS idx_po_review_pending ON purchase_orders(reviewed_at, status);

-- 검증: SELECT COUNT(*) FROM purchase_orders WHERE reviewed_at IS NOT NULL;   → 0 (신규)
