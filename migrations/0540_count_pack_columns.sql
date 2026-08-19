-- 실사 입력을 「포장 수 × 포장당 수량」 두 칸으로 — 롤당 수량이 롤마다 다른 자재를 담기 위해
--
-- 왜 필요한가 (용준님 2026-08-19)
--   기존 구조는 **포장당 수량이 고정**이라는 전제였다(`items.pack_size`, 시트 50m·잉크 1.5L).
--   규격품은 그걸로 충분하다 — 화면이 이미 관리단위(롤/통) 입력을 받아 × pack_size 로 base 저장한다
--   (`inventoryCount.js` updateItemCount · `unitConvert.ts` uomToBase).
--   문제는 **현수막 원단**이다. 쓰던 롤이 섞여 롤당 야드가 **112~135 로 제각각**이다(청주 실사 실측).
--   고정 계수로는 담을 수 없고, 그렇다고 현장에 야드를 곱해서 적으라 하면 오입력이 난다.
--   종이 실사표(`scripts/stock-count-sheet.py`)는 처음부터 ①롤 수 / ②롤당 수량 두 칸이었는데
--   화면만 한 칸이라 어긋나 있었다.
--
-- 설계
--   pack_count    = 포장(롤·통) 수 — 현장이 세는 값
--   per_pack_qty  = 그 실사에서 적용한 포장당 수량 (기본값 = items.pack_size, 예외 롤만 손으로 조정)
--   counted_quantity = pack_count × per_pack_qty  ← **기존 컬럼 그대로**(base 단위)
--   ⇒ 승인·보정(`:498` NULL 제외)·재고평가는 counted_quantity 만 보므로 **회귀 없음**.
--   ⇒ 두 칸을 안 쓰고 counted_quantity 를 직접 넣는 기존 경로도 그대로 동작한다(둘 다 NULL 로 남을 뿐).
--
-- 현수막 원단 pack_size = 130 (용준님 확정)
--   과거 재고는 확정이 불가능하므로 130yd 로 추론한다. 「250」으로 적힌 롤은 실사 때 per_pack_qty 로 개별 조정.
--   ★부수 효과 = 이미 들어간 7/31 실사가 화면에서 **롤 수로 바르게 보인다**(5,850yd ÷ 130 = 45롤 — 판독값과 일치).
--   base_unit 은 NULL 로 둔다(입고·재고 모두 yd). pack_size 는 실사 편의 계수로만 쓴다.
--
-- 멱등: ALTER 는 1회성(재실행 시 duplicate column = 정상). UPDATE 는 절대값이라 무해.
-- 되돌리기: UPDATE items SET pack_size = NULL WHERE item_code LIKE 'AQ2-%' ...   (D1 에서 컬럼 DROP 금지)

ALTER TABLE inventory_count_items ADD COLUMN pack_count REAL;
ALTER TABLE inventory_count_items ADD COLUMN per_pack_qty REAL;

UPDATE items SET pack_size = 130
 WHERE COALESCE(pack_size, 0) = 0
   AND (item_code LIKE 'AQ2-%' OR item_code LIKE 'AQ1-%' OR item_code LIKE 'AQD-%');
