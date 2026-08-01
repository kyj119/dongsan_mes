-- 0509: 간판 BOM P3 사전 보정 — LED 밀도 실측 역산 + 단가 0 자재 실단가 반영
-- ★LED 밀도 근거(가정 35/㎡ → 실측 62/㎡): 성환농협 채널간판 실측 문서
--   `Z:\1. 광고물\다담 010-9909-7001\260609_다담_성환농협_LED갯수확인.jpg` (LED 간격 40×40mm·글자별 산출)
--   × 동일 건 주문(2026-06-15 다담디자인, order_items 18387~18403)의 트러스바 규격 = 간판 폭:
--   8700×1800mm(961ea)×2벌 · 5800×1200(433) · (8840+6450)×400(463) · 9730×900(472) · 4350×900(248)
--   → bbox 기준 54~76개/㎡, 가중평균 62개/㎡ (총 3,538ea / 57.1㎡. 실청구 LED 3,400ea와 정합)
--   SMPS 교차검증: 실청구 12대 = ceil(3,400/300) — PER_LED 300 가정 그대로 확정(실측 283ea/대).
-- 돌출(양면)은 단면 62×2=124/㎡.
-- 후렉스 실단가: 서울경금속 예스후렉스 조명(NSP)·비조명(그레이) 전 폭 1,750원/㎡ 일관
--   (130폭 50M롤=65㎡=113,750원, 매입 2026-05-11~06-18 다건). 알마이트 2T 백색 4×8=19,000원/장(2026-06-22).
-- 멱등: usage_param/base_price 가드 — 재실행·후속 수동 보정 덮어쓰기 없음.

UPDATE product_materials SET usage_param=62,
  notes='실측 62개/㎡(bbox) — 성환농협 5세트 역산(54~76/㎡ 가중평균·간격40×40·2026-08-01 보정). 원천=260609_다담_성환농협_LED갯수확인.jpg'
WHERE product_item_id=(SELECT id FROM items WHERE item_code='SIGN-CH')
  AND material_item_id=(SELECT id FROM items WHERE item_code='SGM-LED3-2835')
  AND usage_param=35;

UPDATE product_materials SET usage_param=124,
  notes='양면 124개/㎡ = 실측 단면 62×2 (성환농협 역산 2026-08-01 보정)'
WHERE product_item_id=(SELECT id FROM items WHERE item_code='SIGN-PRT')
  AND material_item_id=(SELECT id FROM items WHERE item_code='SGM-LED3-2835')
  AND usage_param=70;

UPDATE product_materials SET
  notes='SMPS N개용=LED N개 — ceil(LED수/300). 실측 확정: 성환농협 LED 3,400ea→12대 청구=ceil 일치(283ea/대)'
WHERE material_item_id=(SELECT id FROM items WHERE item_code='SGM-SMPS-W300')
  AND usage_type='PER_LED';

-- 단가 0 자재 실단가 (base_price=최신 매입단가 원칙 — 품목 단가 트랙과 동일 축)
UPDATE items SET base_price=113750 WHERE item_code IN ('FLEXL-130','FLEXN-130') AND base_price=0; -- 1,750원/㎡×65㎡
UPDATE items SET base_price=19000 WHERE item_code='ALM-2T-WH-48' AND base_price=0;

-- P3 재분류 3라인 — 규격 단위 오파싱(cm를 mm로 읽어 판가/㎡ 100배 과대 → 신규 오분류)
--   5747 '200*250'(실제 cm=5㎡·30k/㎡) · 7282 '1300x130cm'(16.9㎡·45k/㎡) · 17291 '300x70cm'(2.1㎡·54k/㎡)
--   전부 교체 가격대 → FRL→FRL-R / FRN→FRN-R. per_m2 단위 규칙은 gen_sign_retro.py 에 동일 반영(재실행 일치).
UPDATE order_items SET item_id=(SELECT id FROM items WHERE item_code='SIGN-FRN-R')
 WHERE id IN (5747, 17291) AND item_id=(SELECT id FROM items WHERE item_code='SIGN-FRN');
UPDATE order_items SET item_id=(SELECT id FROM items WHERE item_code='SIGN-FRL-R')
 WHERE id=7282 AND item_id=(SELECT id FROM items WHERE item_code='SIGN-FRL');
