-- 2026-08-13 8월 이카운트 이관 주문 510건 삭제 — 롤백 SQL
--
-- 삭제 대상 = orders.order_date 2026-08-01~08-31 전량(510건, 전부 `이카운트 주문서 자동생성` 마커).
-- 백업 스냅샷 = `_bak_0813_aug_*` 8개 테이블(prod 상주). 이 파일은 그 스냅샷을 되돌리는 절차다.
--
-- ⚠️ 되돌리기 전 확인
--   ① 8월 주문이 정말 0건인가 — 재적재 후 실행하면 id 충돌 또는 이중 계상이 난다.
--   ② `_bak_0813_aug_*` 가 아직 남아 있는가(정리했다면 롤백 불가).
--   ③ 대기함 62건은 삭제 시 waiting 으로 되돌렸다 → 그 사이 다시 흡수됐다면 UPDATE 가 덮어쓴다.
--
-- 실행: npx wrangler d1 execute webapp-production --remote --file <이 파일>
--   ⚠️ wrangler --file 은 성공해도 "Not currently importing anything" 오류를 뱉는 경우가 있다.
--      **재실행 전에 반드시 결과를 조회**할 것(그대로 재실행하면 이중 적재).

INSERT INTO orders                SELECT * FROM _bak_0813_aug_orders;
INSERT INTO order_items           SELECT * FROM _bak_0813_aug_order_items;
INSERT INTO cards                 SELECT * FROM _bak_0813_aug_cards;
INSERT INTO card_items            SELECT * FROM _bak_0813_aug_card_items;
INSERT INTO order_ai_files        SELECT * FROM _bak_0813_aug_order_ai_files;
INSERT INTO order_status_history  SELECT * FROM _bak_0813_aug_status_history;
INSERT INTO order_billing_groups  SELECT * FROM _bak_0813_aug_billing_groups;

-- 대기함 흡수 상태 복원(행 삭제가 아니라 상태 변경이었다)
UPDATE designer_intakes
   SET status        = (SELECT b.status        FROM _bak_0813_aug_intakes b WHERE b.id = designer_intakes.id),
       order_item_id = (SELECT b.order_item_id FROM _bak_0813_aug_intakes b WHERE b.id = designer_intakes.id),
       absorbed_at   = (SELECT b.absorbed_at   FROM _bak_0813_aug_intakes b WHERE b.id = designer_intakes.id)
 WHERE id IN (SELECT id FROM _bak_0813_aug_intakes);

-- 검산 (기대: 510 / 1036 / 488 / 901 / 582 / 510 / 510 / 62)
SELECT (SELECT COUNT(*) FROM orders WHERE order_date BETWEEN '2026-08-01' AND '2026-08-31') orders,
       (SELECT COUNT(*) FROM order_items WHERE order_id IN (SELECT id FROM _bak_0813_aug_orders)) order_items,
       (SELECT COUNT(*) FROM cards WHERE order_id IN (SELECT id FROM _bak_0813_aug_orders)) cards,
       (SELECT COUNT(*) FROM card_items WHERE card_id IN (SELECT id FROM _bak_0813_aug_cards)) card_items,
       (SELECT COUNT(*) FROM order_ai_files WHERE order_id IN (SELECT id FROM _bak_0813_aug_orders)) ai_files,
       (SELECT COUNT(*) FROM order_status_history WHERE order_id IN (SELECT id FROM _bak_0813_aug_orders)) status_hist,
       (SELECT COUNT(*) FROM order_billing_groups WHERE order_id IN (SELECT id FROM _bak_0813_aug_orders)) billing,
       (SELECT COUNT(*) FROM designer_intakes WHERE status='absorbed'
          AND order_item_id IN (SELECT id FROM _bak_0813_aug_order_items)) intakes;

-- 백업 테이블 정리(롤백 가능성이 완전히 사라진 뒤에만)
-- DROP TABLE _bak_0813_aug_intakes;
-- DROP TABLE _bak_0813_aug_billing_groups;
-- DROP TABLE _bak_0813_aug_status_history;
-- DROP TABLE _bak_0813_aug_order_ai_files;
-- DROP TABLE _bak_0813_aug_card_items;
-- DROP TABLE _bak_0813_aug_cards;
-- DROP TABLE _bak_0813_aug_order_items;
-- DROP TABLE _bak_0813_aug_orders;
