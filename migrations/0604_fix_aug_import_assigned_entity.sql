-- 0604: 8월 이관(2026-09-04) 선명·청주 주문 299건의 담당법인 오배정 정정 + 회계반영
--
-- 무엇이 틀렸나: `scripts/ecount-order-import.py` 가 `POST /api/orders` 로 적재하며 `item_name` 을 실어 보내
--   생성 라우트가 품목 마스터 조회를 건너뛰었고, 축(category·item_type) 없는 라인은 카드그룹 기본값 OUTPUT →
--   동산 담당(assigned_entity_id=1, PENDING) 으로 흘렀다. 선명 262건 749라인 · 청주 37건 79라인 전부.
--   결과 ① 동산 /orders 목록에 선명 주문이 「타법인」 배지로 섞임 ② 선명 8월 청구그룹 262건 161,539,670원이
--   동산(entity 1) 귀속 ③ 동산 요청 카드 193장(card_items 336) 생성. 6·7월 이관(직접 SQL)은 담당 NULL·카드 0.
--   코드 정정 = helpers.resolveAssignedEntity(마스터 축으로 추천 + 명시 null opt-out).
--
-- 실행: prod 는 문장별 `wrangler d1 execute --remote -y --command` 로 적용하고 changes 를 확인했다(2026-09-10).
--   `--command` 다문장은 원자적이라 하나 실패 시 전체 롤백 — 백업 → 정정 → 회계반영 순서를 지킬 것.
-- 멱등: 백업은 IF NOT EXISTS, 정정/삭제는 조건이 소진되면 0 changes.
-- 되돌리기: _bak_0910_* 5개 테이블에서 역적용(assigned/assignment_status 복원 · 청구그룹 entity/status 복원 ·
--   cards/card_items 재삽입 · orders billing 5컬럼 복원).

-- 0. 대상 범위 고정 (299 주문) + 백업
CREATE TABLE IF NOT EXISTS _bak_0910_aug_scope AS
  SELECT DISTINCT oi.order_id FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE oi.assigned_entity_id = 1 AND oi.assignment_status = 'PENDING' AND o.entity_id IN (2, 3);

CREATE TABLE IF NOT EXISTS _bak_0910_order_items AS
  SELECT id, order_id, assigned_entity_id, assignment_status FROM order_items
  WHERE assigned_entity_id = 1 AND order_id IN (SELECT order_id FROM _bak_0910_aug_scope);

CREATE TABLE IF NOT EXISTS _bak_0910_billing_groups AS
  SELECT * FROM order_billing_groups WHERE order_id IN (SELECT order_id FROM _bak_0910_aug_scope);

CREATE TABLE IF NOT EXISTS _bak_0910_cards AS
  SELECT * FROM cards WHERE requesting_entity_id = 1 AND order_id IN (SELECT order_id FROM _bak_0910_aug_scope);

CREATE TABLE IF NOT EXISTS _bak_0910_card_items AS
  SELECT * FROM card_items WHERE card_id IN (SELECT id FROM _bak_0910_cards);

CREATE TABLE IF NOT EXISTS _bak_0910_orders AS
  SELECT id, billing_status, billed_at, billed_by, billed_amount, accounting_date FROM orders
  WHERE id IN (SELECT order_id FROM _bak_0910_aug_scope);

-- 1. 담당 법인 해제 (828 라인) — 이관 = 청구법인 담당(NULL), 6·7월 규약과 동일
UPDATE order_items SET assigned_entity_id = NULL, assignment_status = NULL
WHERE assigned_entity_id = 1 AND assignment_status = 'PENDING'
  AND order_id IN (SELECT order_id FROM _bak_0910_aug_scope);

-- 2. 동산 요청 카드 철회 (193 카드 · 336 card_items) — 이관 = 카드 0 규약. print_events·print_file_map·
--    inventory_auto_deductions·card_transactions·work_records·waste_records 종속 0건 확인(2026-09-10).
DELETE FROM card_items WHERE card_id IN (SELECT id FROM _bak_0910_cards);
DELETE FROM cards WHERE id IN (SELECT id FROM _bak_0910_cards);
--    ⚠️실측 changes=579: cards 193 + card_status_history 386(ON DELETE CASCADE, 카드당 생성·SHIPPED 2행) — 백업 없음.
--    잘못 만든 카드의 이력이라 복원 불요. 필요 시 D1 Time Travel(30일).

-- 3. 청구그룹 법인 정정 동산→선명 (262). 청주 37건은 22/23_cheongju_move_aug 가 이미 3 으로 옮겼다.
UPDATE order_billing_groups SET entity_id = 2
WHERE entity_id = 1
  AND order_id IN (SELECT id FROM orders WHERE entity_id = 2 AND id IN (SELECT order_id FROM _bak_0910_aug_scope));

-- 4. 회계반영 (299) — docs/sunmyung-import/05_accounting_reflect.sql 의 6·7월 규약 미러:
--    orders.billing_status=BILLED · billed_at=전표일 09:00 · billed_by=5 · billed_amount=final · accounting_date=전표일
UPDATE orders SET billing_status = 'BILLED', billed_at = order_date || ' 09:00:00', billed_by = 5,
  billed_amount = final_amount, accounting_date = order_date, updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT order_id FROM _bak_0910_aug_scope) AND billing_status IS NULL;

UPDATE order_billing_groups SET billing_status = 'BILLED',
  billed_at = (SELECT o.order_date FROM orders o WHERE o.id = order_billing_groups.order_id),
  billed_by = 5,
  accounting_date = (SELECT o.order_date FROM orders o WHERE o.id = order_billing_groups.order_id)
WHERE order_id IN (SELECT order_id FROM _bak_0910_aug_scope) AND billing_status IS NULL;
