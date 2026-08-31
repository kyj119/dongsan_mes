-- 0544: 직배(직접배송) 배차 슬롯 — 오전/오후 2택 + 생산 완료기한 파생 (2026-08-31 용준님)
--
-- 왜: 직배는 실제 배차가 **오전편·오후편 2회뿐**인데 주문서는 09~18시 시:분을 자유 선택하게 했다.
--   접수자가 고른 시각은 배차 현실과 무관하고, 현장은 그 시각을 생산 마감으로 읽는다
--   (칸반 카운트다운 = delivery_date + delivery_time).
--
-- ★핵심: 「완료기한」은 납품시간과 **다른 축**이다.
--   오전편은 전날 18:00 까지 생산이 끝나 있어야 하고(= 납품일보다 **하루 앞선 날짜**),
--   오후편은 당일 13:00 이다. `delivery_time` 은 시각(HH:MM)만 담아 '전날'을 표현할 자리가 없다 —
--   여기에 18:00 만 넣으면 칸반이 「납품일 당일 18시」로 읽어 마감이 하루 늦게 잡힌다(의도와 정반대).
--
-- 그래서 **슬롯만 저장하고 마감시각은 저장하지 않는다**(파생). 정본 = src/utils/productionDeadline.ts.
--   마감을 컬럼으로 들고 있으면 납품일·출고방법이 바뀔 때 따라 갱신해야 하는 누적 캐시가 하나 더 생긴다
--   (CLAUDE.md §누적 캐시 = 수정·삭제가 안 따라온다).
--
-- 값: 'AM' | 'PM' | NULL. **NULL = 종전 동작**(delivery_date + delivery_time 그대로) —
--   과거 직배 주문은 소급하지 않는다(용준님 확인 2026-08-31). delivery_time 으로 AM/PM 을 추정하면
--   실제 배차와 다른 **추측값**이 영구 기록으로 남는다.
--
-- quotations 에도 같이 넣는 이유: 견적→주문 전환이 delivery_method/delivery_time 을 그대로 복사한다
--   (routes/quotations.ts:658). 여기에 슬롯이 없으면 전환 순간 조용히 소실된다.

ALTER TABLE orders ADD COLUMN delivery_slot TEXT;
ALTER TABLE quotations ADD COLUMN delivery_slot TEXT;
