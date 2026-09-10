-- 0610: 발주 라인에 **롤 수**와 **예상 수량 표시**를 둔다 (Phase 1)
--
-- 왜 필요한가 — 원단은 **발주 시점에 정확한 yd 를 모른다**. 롤마다 길이가 다르고, 실측은
--   물건이 와야 나온다. 그런데 발주서는 수량을 정확히 요구하니 담당자가 「정확히 못 쓸 바엔
--   나중에」로 미루고, 그 결과 **MES 에서 실시간으로 작성된 발주가 사실상 없다**
--   (최근 발주일 2026-08-06 · 「직접작성」 380건도 전부 8월 하순에 몰아 입력한 사후 등록).
--   입고 검수 전표가 **0건**인 것도 같은 뿌리다 — 입고 시점에 시스템에 발주가 없다.
--
-- 무엇을 바꾸나 — 전화로 말하는 단위 그대로 **「3롤」** 로 쓰게 하고, yd 는 **예상치**로 채운다.
--   · `order_packs`     = 발주한 롤 수. 원단은 롤이 실물 개수라 검수에서 「롤 수가 맞나」와
--                         「길이가 맞나」를 갈라 봐야 한다.
--   · `qty_is_estimate` = `quantity` 가 롤 수에서 환산한 **예상치**라는 표시. 입고 실측이
--                         들어오면 그게 정본이 된다.
--
-- ★`quantity` 의 축은 **바꾸지 않는다** — 지금처럼 매입 단위(yd 등) 그대로다.
--   롤 수를 `quantity` 에 넣으면 재고·원가가 pack_size 배(최대 130배) 어긋난다.
--   롤 입력은 **입력 보조**일 뿐이고 저장 축은 하나로 유지한다(CLAUDE.md 단위 3층 규약).
--
-- ⚠️ 재실행 시 ALTER 는 duplicate column 으로 실패한다(SQLite 에 IF NOT EXISTS 가 없다).
--    그 문장만 실패하는 것이고 데이터는 건드리지 않는다.
--
-- 되돌리기: 두 컬럼 다 NULL/0 이 기본이라 남아 있어도 무해하다.

ALTER TABLE purchase_order_items ADD COLUMN order_packs REAL;
ALTER TABLE purchase_order_items ADD COLUMN qty_is_estimate INTEGER DEFAULT 0;

-- 검증: SELECT COUNT(*) FROM purchase_order_items WHERE qty_is_estimate = 1;   → 0 (신규 컬럼)
