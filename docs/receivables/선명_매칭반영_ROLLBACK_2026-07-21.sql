-- ROLLBACK: 선명 미매칭 출금 매칭 반영 되돌리기 (2026-07-21)
DELETE FROM purchase_payments WHERE reference_number='713' AND entity_id=2 AND supplier_id=1733 AND created_by=9;
UPDATE clients SET purchase_balance = COALESCE(purchase_balance,0) + 20000000 WHERE id=1733;
DELETE FROM purchase_payments WHERE reference_number='1093' AND entity_id=2 AND supplier_id=2632 AND created_by=9;
UPDATE clients SET purchase_balance = COALESCE(purchase_balance,0) + 13095291 WHERE id=2632;
DELETE FROM purchase_payments WHERE reference_number='809' AND entity_id=2 AND supplier_id=2347 AND created_by=9;
UPDATE clients SET purchase_balance = COALESCE(purchase_balance,0) + 177767 WHERE id=2347;
DELETE FROM purchase_payments WHERE reference_number='709' AND entity_id=2 AND supplier_id=291 AND created_by=9;
UPDATE clients SET purchase_balance = COALESCE(purchase_balance,0) + 18700 WHERE id=291;
UPDATE bank_transactions SET match_status='UNMATCHED', matched_client_id=NULL, matched_category_id=NULL, matched_purchase_payment_id=NULL, matched_link_mode=NULL, matched_by=NULL, matched_at=NULL, match_confidence=NULL, match_reason=NULL WHERE id IN (713,703,698,1093,4126,4130,1073,3046,994,700,2944,995,2889,3363,3447,3039,2868,766,3023,3130,3266,3359,3439,2890,3107,3160,3279,3376,3462,4909,2859,908,3038,906,3022,3108,1090,1072,923,738,4222,4908,2922,3159,3277,3375,3461,2822,3191,809,2836,993,2902,3026,3137,3268,3362,3446,2908,4990,2926,2912,3223,2971,2853,2998,3091,3337,2840,2881,3037,3161,3280,3377,3463,904,924,2878,2842,3365,4922,2913,810,2927,811,2987,2846,2880,2882,2879,709,4113,3076,3270,2845,2979,2989,3214,3325,3424,4218,4217,2864,2940,3193,3289,3388,3095,726,3354,1074,2863);
