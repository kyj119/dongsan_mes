-- 0355: 태극기 -1 호수 표기 정정 — "4-1호"→"4호-1" (주문 관례 일치)
-- 0354 생성 시 "N-1호"로 들어감. 실제 주문/표준 관례는 "N호-1". item_name·specification 동시 정정.
UPDATE items SET
  item_name = REPLACE(item_name, '-1호', '호-1'),
  specification = REPLACE(specification, '-1호', '호-1')
WHERE category = '태극기' AND (item_name LIKE '%-1호%' OR specification LIKE '%-1호%');
