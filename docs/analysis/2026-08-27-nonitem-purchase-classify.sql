-- ============================================================================
-- 2026-08-27 (8) 뭉침 목록에서 **품목 축이 아닌 매입**을 빼낸다 (용준님 승인 「갈래①」)
--
-- ★배경: 미연결 뭉침 후보 192행 2.31억을 열어 보니 절반 가까이가 **애초에 품목이 아니다**.
--   장비·리스 전환·수선·용역은 청구서를 받아도 `avg_unit_cost` 가 갈 데가 없다.
--   이걸 목록에 남겨 두면 「청구서 받을 곳」이 부풀어 보이고, 진짜 대상이 묻힌다.
--
-- ⚠️보고 정정: 앞서 「갈래① 8,206만」이라 했으나 그 안에 **하우사인 706만(「N월 거래건」)**
--   과 **엘이디포유 1,825만(「원장 밖 매입」)** 이 섞여 있었다. 그 둘은 「품목이 아닌 것」이
--   아니라 **「품명이 없어서 모르는 것」** — 청구서 대상(갈래③)이다. 실제 갈래① = **5,675만**.
--
-- ── 두 가지 방식을 쓴다 ─────────────────────────────────────────────────────
-- ⑴ **품목이 실제로 있는 것은 연결한다** — 케이엠테크 Extreme-2280T 2행.
--    `GDS-EQ-EXT2280T`(품명 완전 일치)가 이미 있고, 뭉침 보고서는 `GDS-EQ-%` 를
--    이미 제외하므로 **연결만으로 목록에서 정확히 빠진다**(별도 규칙 불요).
--    ⚠️`avg_unit_cost` 는 안 건드린다 — 고정자산이라 재고 원가 축이 아니고,
--      새 backfill 은 `quantity > 1` 만 쓰므로 이 두 행(수량 1·−1)은 대상 밖이다.
--
-- ⑵ **품목이 없어야 맞는 것은 `notes` 에 분류 태그를 심는다** — `[분류:리스]` 등.
--    ★왜 태그인가: 스크립트에 품명 키워드 목록을 박으면 **조용히 낡는다**
--      (backfill 하드코딩 명단이 방금 그래서 폐기됐다 · CLAUDE.md §IA 손목록).
--      태그는 **데이터에 근거가 같이 남고**, 스크립트 쪽 규칙은 `notes LIKE '%[분류:%'`
--      하나로 끝나며, 태그가 없는 건 **그대로 목록에 남는다(fail-open)**.
--
-- 태그 어휘 = 장비 · 리스 · 수선 · 용역 · 할인   (늘릴 때 이 주석에 추가)
-- 멱등 = 이미 태그가 있으면 건드리지 않는다.
-- ============================================================================

DROP TABLE IF EXISTS _bak_0827_nonitem;
CREATE TABLE _bak_0827_nonitem AS
  SELECT id, item_id, notes FROM purchase_order_items
   WHERE id IN (3860, 3859, 1722, 2486, 3853, 3858, 1717, 3523, 3450);

-- ── ⑴ 장비 연결 ────────────────────────────────────────────────────────────
-- 07-15 케이엠테크 원장: 신규 +37,800,000 / 회수 −26,000,000 (순 +11,800,000)
UPDATE purchase_order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'GDS-EQ-EXT2280T'),
       updated_at = datetime('now', '+9 hours')
 WHERE id IN (3860, 3859) AND item_id IS NULL;

-- ── ⑵ 분류 태그 ────────────────────────────────────────────────────────────
-- 리스 — 캐피탈(아이비렌탈) 전환 차감. 매입이 아니라 **채무 이전**이다.
--   ⚠️[[design-loan-liability-model]] §리스료 삼중계상 — 여기를 매입으로 세면 또 겹친다.
UPDATE purchase_order_items SET notes = '[분류:리스] ' || COALESCE(notes, '')
 WHERE id IN (1722, 2486) AND COALESCE(notes, '') NOT LIKE '%[분류:%';

-- 수선 — 부품 교체·센서. 장비 신규가 아니라 **수선비**(용준님 2026-08-24 확인).
UPDATE purchase_order_items SET notes = '[분류:수선] ' || COALESCE(notes, '')
 WHERE id IN (3853, 3858) AND COALESCE(notes, '') NOT LIKE '%[분류:%';

-- 할인 — 매출할인(음수). 품목 대금이 아니다.
UPDATE purchase_order_items SET notes = '[분류:할인] ' || COALESCE(notes, '')
 WHERE id = 1717 AND COALESCE(notes, '') NOT LIKE '%[분류:%';

-- 용역 — 가공료·출장료. 재고를 잡지 않는다([[design-rework-rules]] 외주와 같은 성격,
--   2026-08-26 「외주가공은 처리 화면이 없어 조치 안 함」 확정과 동일 취급).
UPDATE purchase_order_items SET notes = '[분류:용역] ' || COALESCE(notes, '')
 WHERE id IN (3523, 3450) AND COALESCE(notes, '') NOT LIKE '%[분류:%';

-- ============================================================================
-- 검증
--   SELECT id, item_id, substr(notes,1,40) FROM purchase_order_items
--    WHERE id IN (3860,3859,1722,2486,3853,3858,1717,3523,3450);
--   -- 3860·3859 = item_id 채워짐 · 나머지 7행 = notes 가 '[분류:' 로 시작
--   npm run report:lump   -- 미연결 뭉침에서 5,675만이 「품목 축 아님」으로 분리돼야 한다
--
-- ── 롤백 ────────────────────────────────────────────────────────────────────
-- UPDATE purchase_order_items SET
--   item_id=(SELECT b.item_id FROM _bak_0827_nonitem b WHERE b.id=purchase_order_items.id),
--   notes  =(SELECT b.notes   FROM _bak_0827_nonitem b WHERE b.id=purchase_order_items.id)
--  WHERE id IN (SELECT id FROM _bak_0827_nonitem);
-- ============================================================================
