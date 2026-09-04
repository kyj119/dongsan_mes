-- 0569: 0568 이 만든 AQ-GRB 를 **기존** AQ-GERILLA(173) 로 병합한다 — 중복 품목 교정
--
-- 무엇이 잘못됐나:
--   0568 이 '수성 게릴라 현수막'(AQ-GRB)을 신설했는데 **게릴라 품목은 이미 있었다**
--   — id 173 'AQ-GERILLA / 게릴라 현수막'(2026-06-21 생성, 판매 0라인).
--   계열 열거는 했지만 결과를 판매라인 내림차순으로 뽑아 **0라인인 품목이 목록 끝에서 잘렸다**.
--   [[feedback-item-duplicate-before-create]] 의 여섯 번째 재발이다.
--   ★교훈: 신설 전 열거는 **잘라 보지 않는다.** 신설하려는 품목은 판매 0라인일 가능성이 높아
--     정확히 "정렬 끝"에 있고, 거기가 잘리면 열거를 한 의미가 없다.
--
-- 어느 쪽을 남기나 = 173 (기존).
--   ① 2026-09-03 S2 원가 작업에서 이미 이 품목을 정본으로 보고 있었다
--      (현황판 "게릴라가 전부 AQ-BANNER 로 들어가 있다 → 게릴라 품목 재배선").
--   ② 과금축도 173 이 맞다. 173 = FIXED / base_price 4,500(장당 정액)인데,
--      게릴라를 일반 현수막과 가르는 신호가 바로 **장당 정액**(500원 배수 비율 95~100%)이었다.
--      실측 평균 장당가 4,482원(500x90 · 118라인 36,066장)으로 4,500 과 맞는다.
--      AREA 로 두면 영업이 ㎡단가를 역산해 넣어야 해서 현장 표현("4,500원")과 어긋난다.
--   ③ 이관 라인의 unit_price 가 **장당금액**이라([[feedback-imported-unit-price-semantics]])
--      FIXED 가 그 의미와 그대로 맞는다.
--
-- 173 의 원단 후보(product_materials 1건)는 **건드리지 않는다** — 게릴라는 저밀도 원단(AQD 계열)
--   전용이라 09-03 작업에서 좁혀 놓은 것으로 보이고, 172 의 19종을 덮으면 그 판단을 지운다.
--
-- 되돌리기: 0568 의 롤백 절차를 그대로 쓴다(_bak_0568_banner_split 스냅샷이 원래 item_id 를 갖고 있다).

-- 1) 라인 이관 (AQ-GRB -> AQ-GERILLA)
UPDATE order_items
   SET item_id = 173
 WHERE item_id = (SELECT id FROM items WHERE item_code = 'AQ-GRB');

-- 2) 중복 품목이 달고 있던 원단 후보 제거
DELETE FROM product_materials
 WHERE product_item_id = (SELECT id FROM items WHERE item_code = 'AQ-GRB');

-- 3) 중복 품목 제거
DELETE FROM items WHERE item_code = 'AQ-GRB';

-- 4) 검색 키워드만 보강한다(과금축·단가는 기존값 유지)
UPDATE items
   SET search_keywords = '게릴라,게릴라 현수막,수성 게릴라'
 WHERE id = 173 AND COALESCE(search_keywords, '') = '';
