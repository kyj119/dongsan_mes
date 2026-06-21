-- 0338: 원단(폭별 개별품목)의 specification에 폭(cm) 백필 — 동일명 원단 식별성
--
-- 신모델에서 원단은 폭별 개별품목이나 item_name은 코팅단위로 동일(예: "수성 현수막원단 2코팅" 24개).
-- 폭은 width_mm/코드(AQ2-030)에만 있어 주문/재고/단가 화면에서 구분이 어려움.
-- → specification에 폭(cm)을 채워 단일 소스로 식별(이름은 불변). [design-item-specification] 정합.
-- 단위 cm: 코드 AQ2-030=30cm, 사용자 표기 "폭 30" 와 일치. items.ts 중복검사 specVal도 cm로 통일됨.
-- 멱등: 빈 specification만 채움.
UPDATE items
SET specification = (width_mm / 10) || 'cm'
WHERE item_type = 'MATERIAL'
  AND width_mm IS NOT NULL
  AND (specification IS NULL OR specification = '');
