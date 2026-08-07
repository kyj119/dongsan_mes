-- 오다플래그 마커 · 수기대 문구 롤백 (2026-08-07)
UPDATE purchase_orders SET internal_notes = NULLIF(REPLACE(REPLACE(COALESCE(internal_notes,''),
  ' · [관계사 자금이동] 2026-08-07 용준님 확정 — 오다플래그는 매입거래처 아님. 매입·원가 집계에서 제외할 것',''),
  '[관계사 자금이동] 2026-08-07 용준님 확정 — 오다플래그는 매입거래처 아님. 매입·원가 집계에서 제외할 것',''),'')
WHERE supplier_id = 1655;
UPDATE items SET description = REPLACE(description,
  '금액 확인 2026-08-07(통장 14,124,000 = 12,840,000×1.1) · 유진프라스틱 전표 전액 수기대 · 수량만 추정',
  '★추론(미확인) 2026-08-07 유진프라스틱 전표 12,840,000(수량 1 뭉치)')
WHERE item_code LIKE 'ACC-036-L%';
