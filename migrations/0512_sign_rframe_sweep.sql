-- 0512: 교체(-R) 그룹 대형 신규 전수 보정 — 실물 작업지시 12건 판독 근거 (생성기 gen_sign_rframe_sweep.py)
-- 규칙: -R & 금액≥300,000 & 품명에 재단/천갈이/교체 없음 → 신규 승격. 30만 미만은 교체 유지(보수).
-- 롤백: 아래 id 를 역방향 UPDATE (audit=load/sign_rframe_sweep_audit.csv)

UPDATE order_items SET item_id=(SELECT id FROM items WHERE item_code='SIGN-FRL') WHERE id IN (3495, 4215, 4216, 4217, 4864, 4893, 5955, 6938, 7282, 9815, 10876, 11104, 11763, 12234, 12235, 13006, 13054, 13823, 16239, 16241, 16245, 16343, 16622, 16878, 17436, 17611, 18053, 18054, 18296, 18892, 18942, 19281, 19624) AND item_id=(SELECT id FROM items WHERE item_code='SIGN-FRL-R');
UPDATE order_items SET item_id=(SELECT id FROM items WHERE item_code='SIGN-FRN') WHERE id IN (3249, 3251, 3252, 3254, 3256, 3739, 3740, 4631, 6514, 6690, 7524, 7525, 7526, 8167, 8364, 8853, 8854, 8855, 9308, 9309, 9310, 9949, 10037, 10219, 10429, 10430, 10431, 10432, 10555, 10556, 10660, 10661, 10832, 10839, 10997, 11751, 11752, 11753, 12088, 12691, 12994, 12995, 13067, 13691, 13705, 14029, 14065, 14103, 14715, 15777, 15850, 15851, 15853, 17686, 17687, 17699, 18294, 19555) AND item_id=(SELECT id FROM items WHERE item_code='SIGN-FRN-R');

SELECT i.item_code, COUNT(*) n, SUM(oi.amount) amt FROM order_items oi JOIN items i ON i.id=oi.item_id WHERE i.item_code LIKE 'SIGN-FR%' GROUP BY 1 ORDER BY 1;
