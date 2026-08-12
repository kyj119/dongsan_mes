-- 롤백 — _bak_0812_bank_class 로 원복
UPDATE bank_transactions SET
  match_status = (SELECT match_status FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id),
  matched_category_id = (SELECT matched_category_id FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id),
  match_reason = (SELECT match_reason FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id),
  match_confidence = (SELECT match_confidence FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id)
WHERE id IN (320,321,322,323,353,573,2815,5009,5010,5011,5012,5370,6820,7420,7421,7422,7423,7932,7933,7934,7935,7936,8014,8015,8016,8017,8091,8132,8135,8592,8645,8646,8647,8648,8649,8682,8683,8684,8685,8742,8774,8810,8909,9170,9228,9229,9230,9231,9320,9321,9322,9323,9386,9420,9452,9543,9946,9996,9997,9998,9999,10102,10103,10104,10105,10204,10229,10230,10336,10668,10817,10818,10819,10820,10883,10909,11220,11321,11337,324) AND EXISTS (SELECT 1 FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id);
UPDATE bank_transactions SET
  match_status = (SELECT match_status FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id),
  matched_category_id = (SELECT matched_category_id FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id),
  match_reason = (SELECT match_reason FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id),
  match_confidence = (SELECT match_confidence FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id)
WHERE id IN (389,391,396,427,429,430,473,474,475,476,485,524,576,577,578,579,592,597,650,795,797,798,799,800,2106,2107,2108,2109,2263,2286,2423,2425,2818,4214,4907,5002,5189,5371,5392,5593,5594,6904,7415,7416,7682,7757,7758,7759,7760,7840,7858,7869,7870,7962,7974,8046,8216,8277,8310,8311,8312,8429,8430,8431,8432,8535,8553,8574,8585,8587,8588,8589,8654,8717,8864,8865,8886,8887,8888,8889) AND EXISTS (SELECT 1 FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id);
UPDATE bank_transactions SET
  match_status = (SELECT match_status FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id),
  matched_category_id = (SELECT matched_category_id FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id),
  match_reason = (SELECT match_reason FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id),
  match_confidence = (SELECT match_confidence FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id)
WHERE id IN (9019,9020,9021,9022,9106,9133,9136,9137,9138,9164,9166,9167,9290,9358,9427,9459,9472,9497,9546,9547,9663,9760,9761,9762,9763,9885,9886,9887,9888,9909,9910,9942,9943,10014,10069,10134,10203,10211,10340,10341,10431,10493,10494,10495,10496,10601,10629,10630,10631,10632,10650,10664,10665,10727,10791,10843,10895,10915,11017,11202,11223,11292,11548,11549,11550,477,490,1171,7725,7729,7735,7737,7741,8408,8410,8513,9084,9868,9869,10587) AND EXISTS (SELECT 1 FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id);
UPDATE bank_transactions SET
  match_status = (SELECT match_status FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id),
  matched_category_id = (SELECT matched_category_id FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id),
  match_reason = (SELECT match_reason FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id),
  match_confidence = (SELECT match_confidence FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id)
WHERE id IN (10590,10591,532,4173,5394,6917,6924,7430,7937,7938,8012,8013,8045,8090,8136,8650,8651,8678,8679,8716,8775,8780,9232,9233,9310,9313,9422,9423,9827,10000,10001,10099,10202,10231,10704,10720,10721,10867,10912,11224,11225,11298,11322,5303,7992,8789,10119,10983,5490,7402,7429,7839,8063,8118,8497,8680,8756,9091,9314,9400,9645,9880,10100,10216,10816,11212,11291,6725,7838,8309,8496,8699,9090,9738,9879,9896,10005,10025,10252,10517) AND EXISTS (SELECT 1 FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id);
UPDATE bank_transactions SET
  match_status = (SELECT match_status FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id),
  matched_category_id = (SELECT matched_category_id FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id),
  match_reason = (SELECT match_reason FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id),
  match_confidence = (SELECT match_confidence FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id)
WHERE id IN (10595,10725,11183,11216,6745,7836,8493,9782,11156,6769,6822,7902,8096,8605,8746,9199,9390,9976,10209,10700,10890,11208,11313,7403,7837,8495,9089,9878,10598,11186,7693,7707,8382,8951,9735,10462) AND EXISTS (SELECT 1 FROM _bak_0812_bank_class b WHERE b.id = bank_transactions.id);
