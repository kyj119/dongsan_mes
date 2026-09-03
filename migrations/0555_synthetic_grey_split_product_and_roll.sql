-- 0555: 수성 합성지 그레이 — 인쇄물 단가 등록 + 원단 롤 판매 16줄을 자재로 이관
--
-- 배경 = 2026-09-03. 「기준단가 0 인 품목에 값을 넣자」에서 시작했는데, 실적을 원자료로 보니
--   **제품 코드에 원단 롤 판매가 붙어 있었다**. 요약값(평균·중앙)만 보면 안 보이고, 라인의
--   규격·내용·거래처를 봐야 갈린다.
--
-- 판정 근거 넷:
--   ① 16줄 **전부 높이 0** — 규격이 `127x0`·`152x0`·`90x0` 로 폭만 있다(= 롤).
--   ② 라인의 `item_name` 이 **「합성지 그레이(30m)-호홍」** — 자재 이름 그대로다.
--   ③ 폭별 실청구가 형제 자재 등록단가와 자릿수가 맞는다:
--        90폭 41,000 / 127폭 50,000~60,000(자재 47,800) / 152폭 65,000(자재 60,700)
--   ④ 형제 제품 `AQ-SYN`(일반 합성지)은 정반대다 — 50줄 **전부 높이 있음**, ㎡ 단가 중앙
--      **5,384원**으로 등록단가 5,000 과 일치. 즉 인쇄물은 저렇게 생겼다.
--   ⑤ 주 거래처(영기획 13줄)가 사는 것은 패트배너 30M · 수성 현수막원단 · 솔벤 현수막 —
--      **전부 MATERIAL 롤**이다. AQ-SYNG 만 PRODUCT 인데 성격이 같다.
--
-- ⚠️ 이관하지 않으면 이 제품의 기준단가를 실적에서 뽑을 수 없다 — 무엇을 재도 **롤 단가**가
--    나온다. (2026-09-03 에 실제로 그렇게 10,500원/㎡ 을 잘못 산출했다. 롤 길이를 가정해
--    ㎡ 로 환산했는데, 가정한 길이가 답을 정해 버리는 순환이었다.)

-- ── 1. 인쇄물 기준단가 ───────────────────────────────────────────────────────
-- 용준님 확인값 = ㎡당 1만원~1만1천원. 기본값은 **10,000** 으로 둔다(일반 합성지 5,000 의 2배).
-- ⚠️ 이 값은 실적 검증이 **불가능**하다 — 그레이 인쇄물 주문이 0줄이다(전부 롤이었다).
--    아래 이관이 끝나면 이 품목의 주문 라인은 0 이 되고, 앞으로 쌓이는 것이 인쇄물 실적이다.
UPDATE items SET base_price = 10000, updated_at = datetime('now')
 WHERE item_code = 'AQ-SYNG' AND COALESCE(base_price, 0) = 0;

-- ── 2. 롤 판매 16줄을 폭별 자재로 이관 ───────────────────────────────────────
-- `item_id` 만 바꾼다. `item_name` 은 이미 자재 이름이라 손대지 않는다 —
-- 사람이 그때 적은 글자가 그대로 남아 있어야 나중에 무슨 일이 있었는지 읽을 수 있다.
UPDATE order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'SYNG-090'),
       updated_at = datetime('now')
 WHERE item_id = (SELECT id FROM items WHERE item_code = 'AQ-SYNG')
   AND width = 90 AND COALESCE(height, 0) = 0;

UPDATE order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'SYNG-127'),
       updated_at = datetime('now')
 WHERE item_id = (SELECT id FROM items WHERE item_code = 'AQ-SYNG')
   AND width = 127 AND COALESCE(height, 0) = 0;

UPDATE order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'SYNG-152'),
       updated_at = datetime('now')
 WHERE item_id = (SELECT id FROM items WHERE item_code = 'AQ-SYNG')
   AND width = 152 AND COALESCE(height, 0) = 0;

-- ⚠️ 되돌리기 — 폭 조건만으로는 **구분이 안 된다**. SYNG-127 에는 원래 20줄이 있고 폭이 같다.
--    그래서 옮기는 라인 id 를 여기 남긴다(실행 전 조회분, 2026-09-03):
--      90폭  1줄 : 1117
--      127폭 12줄: 239, 371, 462, 543, 777, 1059, 1118, 1148, 1886, 2327, 2520, 2548
--      152폭  3줄: 240, 1060, 1149
--    복구 = UPDATE order_items SET item_id=(SELECT id FROM items WHERE item_code='AQ-SYNG')
--           WHERE id IN (…위 16개…);
