-- 0578: 계정 마스터 정리 — 이름 통일 2쌍 + 실제로 막고 있던 결번 3종
--
-- ■ 왜 이름을 통일하나
--   `CAT_ROLE`(financialReports.ts + scripts/finance-diagnose.cjs 사본 쌍)이 **계정명 문자열**로
--   비용/비용아님을 가르고, 그룹 손익도 이름으로 묶는다. 같은 성격이 법인마다 다른 이름이면
--   같은 돈이 두 줄로 갈린다.
--
--   (1) 대출계좌 상환 출금 — 법인1 `대출상환`(168건 4.23억) · 법인2 `대출금`(5건 1.32억).
--       양쪽 다 적요가 대출계좌번호(`60298020073142-00012`)로 성격이 같다. → **대출상환**(용준님 확정).
--       「대출금」은 재무상태표의 부채 계정처럼 읽혀 출금 분류명으로 혼동된다.
--   (2) 용역 수수료 — 법인1 `수수료`(87건 2,774만 = 법무·세무·노무법인) ·
--       법인2 `지급수수료`(55건 862만 = 중개수수료·세무조정료). → **지급수수료**(용준님 확정, 표준 계정명).
--       ⚠️ 법인1 `지급수수료`(#98)는 0577 에서 신설한 것이라 `수수료`(#69)와 개념이 겹쳤다 — 여기서 합친다.
--
-- ■ 결번은 **실제로 막고 있는 것만** 만든다 (빈 계정은 오분류 선택지를 늘린다)
--   부가세(법인2) · 리스료(법인2·법인3) · 고정자산취득(법인1). 셋 다 다른 법인에 관행이 있다
--   (법인2 `(주)티.피.엠.기계구입대금` 이 이미 고정자산취득으로 처리돼 있다).
--
-- ■ ⛔ 만들지 않은 것 — 키워드가 잡았지만 **대조에서 뒤집힌 것**
--   · `대출상환` 법인2·3 = 「외상대출금」 35건 275,933,451 은 대출이 아니라
--     **「거래처+월+외상대금 출금」**이다(운산직물·호홍·서울경금속·티피엠 = 전부 매입처). 거래처 매칭 축.
--   · `수선비` 법인1 = `5808차량수리비` 는 같은 계열 `5067차량수리비` 가 이미 **차량유지비**로 처리돼 있다.
--
-- 멱등: 신설은 NOT EXISTS · 이동은 대상 id 를 이름으로 다시 찾는다 · 비활성은 is_active=0 재실행 무해.

-- ── (1) 대출상환으로 통일 ────────────────────────────────────────────────
INSERT INTO expense_categories (name, icon, color, sort_order, is_active, entity_id)
SELECT '대출상환', 'fa-money-bill-transfer', '#6b7280', 660, 1, 2
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = '대출상환' AND entity_id = 2);

UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories WHERE name = '대출상환' AND entity_id = 2)
WHERE matched_category_id = (SELECT id FROM expense_categories WHERE name = '대출금' AND entity_id = 2);

UPDATE expense_categories SET is_active = 0 WHERE name = '대출금' AND entity_id = 2;

-- ── (2) 지급수수료로 통일 ────────────────────────────────────────────────
UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories WHERE name = '지급수수료' AND entity_id = 1)
WHERE matched_category_id = (SELECT id FROM expense_categories WHERE name = '수수료' AND entity_id = 1);

UPDATE card_transactions
SET category_id = (SELECT id FROM expense_categories WHERE name = '지급수수료' AND entity_id = 1)
WHERE category_id = (SELECT id FROM expense_categories WHERE name = '수수료' AND entity_id = 1);

UPDATE expense_categories SET is_active = 0 WHERE name = '수수료' AND entity_id = 1;

-- ── (3) 막고 있던 결번 3종 ───────────────────────────────────────────────
INSERT INTO expense_categories (name, icon, color, sort_order, is_active, entity_id)
SELECT '부가세', 'fa-receipt', '#6b7280', 680, 1, 2
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = '부가세' AND entity_id = 2);

INSERT INTO expense_categories (name, icon, color, sort_order, is_active, entity_id)
SELECT '리스료', 'fa-car-side', '#6b7280', 910, 1, 2
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = '리스료' AND entity_id = 2);

INSERT INTO expense_categories (name, icon, color, sort_order, is_active, entity_id)
SELECT '리스료', 'fa-car-side', '#6b7280', 910, 1, 3
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = '리스료' AND entity_id = 3);

INSERT INTO expense_categories (name, icon, color, sort_order, is_active, entity_id)
SELECT '고정자산취득', 'fa-building', '#6b7280', 890, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = '고정자산취득' AND entity_id = 1);
