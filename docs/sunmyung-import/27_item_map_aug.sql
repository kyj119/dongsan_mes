-- ===== 1차 =====
-- 선명 8월 이관 품목 미해소 연결 1차 (2026-09-04)
-- 기존 품목에 명확히 대응되는 58종. 조합 표기(채널간판+시트+바 등)는 대표 품목으로 접는다
-- (품목 축 원칙: 조합이 폭발하는 축은 규격/내용으로, 정체성 축만 품목으로).
-- item_name 은 원본 그대로 둔다 - 이카운트 표기가 근거로 남아야 한다.
UPDATE order_items SET item_id = 1491, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '간판' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1484, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '채널간판+바(완제품)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1485, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '조명용 후레임간판(검정)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1624, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '갈바 라운드프레임' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1484, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '채널간판+시트+바(완제)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1555, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '각관 트러스+포맥스' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1487, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '비조명 후레임간판+LED+시트부착' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1484, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '채널간판+시트/평판인쇄' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1496, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = 'LED 3구(백색)-UPL' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1484, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '채널간판+시트' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1487, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '비조명 후레임간판(후렉스X)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시10T/20T/아크릴도색' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1495, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '설치비' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 733, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '트러스바(백색)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 733, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '트러스바(백색' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시20T/10T/아크릴-부착포함' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1489, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '돌출간판(조명용)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1496, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = 'LED 3구(UPL)-조립' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 733, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '트러스바(검정)+뒷판포맥스' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1485, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '조명용 후레임간판(후렉스X)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 733, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '트러스바(팬톤2262c도색)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1496, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = 'LED 3구(UPL)조립' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시20T/10T/아크릴부착포함' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1555, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '각관 트러스(도색)+포5T부착' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시10T/30T' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 801, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = 'LED 3구(JPL)-조립' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1489, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '돌출간판(후레임)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시10T금색밀러' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 827, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스텐원형돌출(포인트)+실사부착' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 733, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '트러스바(진회색)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시20T+실사부착' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시10T(백색수지_검정고무)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시10T(은색-검정포)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1495, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '부착비' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시(은밀러_검정고무)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1699, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '채널간판(뚜껑)+스카시' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1555, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '각관 트러스제작' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시10T(은밀러_검정)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 792, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '외부용 SMPS(유니온)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시30T(검정/검정)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시10T(은밀_흑고무)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시30T' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1485, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '조명용 후레임간판(카바로제작))' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시10T(검정+시트부착)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1699, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '채널간판(뚜껑)+컷팅부착' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시10T(백색-백색)-부착' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시10T(LT4075부착_검정)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시20T(검정+검정)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 843, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '종이도안지' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1487, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '비조명 후레임간판+후판' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시30T(백색수지_백고무)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시30T(검정_검정)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시20T(백색수지_백고무)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 985, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '까치발(검정)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1699, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '채널간판(뚜껑만)_캘시트부착' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 843, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '종이도안/밑본컷팅' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 906, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '유광 코팅지(45m/120g)-호홍' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE order_items SET item_id = 1490, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '스카시20T/30T' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');

-- ===== 2차 =====
-- 선명 8월 품목 연결 2차 - 출력·판재 계열 (2026-09-04)
-- UV후렉스(양면)배너용 -> UV-FLEXD UV 양면배너후렉스
UPDATE order_items SET item_id = 281, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = 'UV후렉스(양면)배너용' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- UV후렉스 양면출력 -> UV-FLEXD UV 양면배너후렉스
UPDATE order_items SET item_id = 281, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = 'UV후렉스 양면출력' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- UV후렉스 출력 및 텐션 -> UV-FLEXL UV 조명후렉스
UPDATE order_items SET item_id = 254, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = 'UV후렉스 출력 및 텐션' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 솔벤 패트배너-존슨 -> SV-PATB 솔벤 패트배너
UPDATE order_items SET item_id = 518, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '솔벤 패트배너-존슨' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 솔벤매쉬-TPM -> SV-MESH 솔벤 매쉬
UPDATE order_items SET item_id = 373, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '솔벤매쉬-TPM' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 광확산PC3T+시트+알마이트 -> UV-PC-3T-M UV 광확산PC 3T 유백
UPDATE order_items SET item_id = 603, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '광확산PC3T+시트+알마이트' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- LT4081 -> SK-938 LG시트-LT4081(122폭)
UPDATE order_items SET item_id = 1365, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = 'LT4081' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- LT4510컷팅 -> LT4510 조명시트 LT4510
UPDATE order_items SET item_id = 846, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = 'LT4510컷팅' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- uv타공시트부착 -> SV-SHEET-PERF 타공시트
UPDATE order_items SET item_id = 1559, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = 'uv타공시트부착' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 솔벤시트+돔보포함 -> SV-SHEET-PERF 타공시트
UPDATE order_items SET item_id = 1559, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '솔벤시트+돔보포함' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');

-- ===== 3차 =====
-- 선명 8월 품목 연결 3차 - 시트부착(후가공)·기타·신설 (2026-09-04)
-- LG조명시트부착 -> JMS-GEN 조명시트 + 후가공 부착
UPDATE order_items SET item_id = 425, post_processing = '부착', updated_at = datetime('now') WHERE item_id IS NULL AND item_name = 'LG조명시트부착' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- LG조명시트부착(LT4027) -> SK-1454 LG시트-LT4027(122폭) + 후가공 부착
UPDATE order_items SET item_id = 1291, post_processing = '부착', updated_at = datetime('now') WHERE item_id IS NULL AND item_name = 'LG조명시트부착(LT4027)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- LG캘시트부착외 -> LGS-CAL-122 LG 캘시트 + 후가공 부착
UPDATE order_items SET item_id = 1554, post_processing = '부착', updated_at = datetime('now') WHERE item_id IS NULL AND item_name = 'LG캘시트부착외' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- LG조명컷팅(LT4075) -> JMS-GEN 조명시트 (LT4075 는 계열에 없음)
UPDATE order_items SET item_id = 425, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = 'LG조명컷팅(LT4075)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- SKYTAC 플러스 출력용 백색시트(유광) -> ETC-MISC 기타 부자재
UPDATE order_items SET item_id = 1693, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = 'SKYTAC 플러스 출력용 백색시트(유광)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- SKYTAC 플러스 출력용 백색시트 -> ETC-MISC 기타 부자재
UPDATE order_items SET item_id = 1693, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = 'SKYTAC 플러스 출력용 백색시트' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 유광 코팅지(61m/120g)-호홍 -> HJ-YGAUTOB 신설
UPDATE order_items SET item_id = 1722, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '유광 코팅지(61m/120g)-호홍' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 일체형 채널클립 -> ETC-MISC 기타 부자재
UPDATE order_items SET item_id = 1693, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '일체형 채널클립' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 롱타카 -> ETC-MISC 기타 부자재
UPDATE order_items SET item_id = 1693, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '롱타카' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 정문배너 -> SIGN-ETC 간판 기타(일반)
UPDATE order_items SET item_id = 1491, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '정문배너' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 미니배너대 -> ACC-012 배너대
UPDATE order_items SET item_id = 530, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '미니배너대' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 배너 깃대 -> ACC-034 깃대(기타)
UPDATE order_items SET item_id = 649, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '배너 깃대' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- LT4070 -> LT4070M 신설
UPDATE order_items SET item_id = 1723, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = 'LT4070' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 윈드배너 사각베이스형-SET(대) -> ACC-016-SQ-L 신설
UPDATE order_items SET item_id = 1724, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '윈드배너 사각베이스형-SET(대)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');

-- ===== 4차 =====
-- 선명 8월 품목 연결 4차 (2026-09-04)
-- 아크릴제작및평판인쇄 -> 아크릴 가공 · 평판인쇄는 부수공정
UPDATE order_items SET item_id = 1725, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '아크릴제작및평판인쇄' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 아크릴 8T/15T레이져 -> 아크릴 가공
UPDATE order_items SET item_id = 1725, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '아크릴 8T/15T레이져' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 아크릴 3T/5T(도색) -> 아크릴 가공 + 후가공 도색
UPDATE order_items SET item_id = 1725, post_processing = '도색', updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '아크릴 3T/5T(도색)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 아크릴 5T(도색)+컷팅 -> 아크릴 가공 + 후가공 도색
UPDATE order_items SET item_id = 1725, post_processing = '도색', updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '아크릴 5T(도색)+컷팅' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 백색아크릴 3T 레이져 -> 아크릴 가공
UPDATE order_items SET item_id = 1725, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '백색아크릴 3T 레이져' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 아크릴 3T/5T -> 아크릴 가공
UPDATE order_items SET item_id = 1725, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '아크릴 3T/5T' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 아크릴 3T(노랑) -> 아크릴 가공
UPDATE order_items SET item_id = 1725, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '아크릴 3T(노랑)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 아크릴 3T레이져 -> 아크릴 가공
UPDATE order_items SET item_id = 1725, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '아크릴 3T레이져' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 기초 제작 -> SIGN-ETC 간판 기타(일반) · 간판 기초 구조물
UPDATE order_items SET item_id = 1491, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '기초 제작' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 각관+반도(4인치) -> SGM-TRUSS-SQ 각관 트러스
UPDATE order_items SET item_id = 1555, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '각관+반도(4인치)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 투명PC3T+스카시(도색) -> SIGN-SCS 스카시(입체문자) + 후가공 도색
UPDATE order_items SET item_id = 1490, post_processing = '도색', updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '투명PC3T+스카시(도색)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 카바(재단) -> SIGN-ETC · 간판 카바 재단
UPDATE order_items SET item_id = 1491, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '카바(재단)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 조립+보강대 -> SIGN-ETC · 간판 조립
UPDATE order_items SET item_id = 1491, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '조립+보강대' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 포맥스5T+평판인쇄 -> UV-FMX-5T-W UV 포맥스 5T
UPDATE order_items SET item_id = 580, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '포맥스5T+평판인쇄' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 포맥스3T 재단 -> ETC-CUT 재단/컷팅비
UPDATE order_items SET item_id = 1034, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '포맥스3T 재단' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 포맥스3T(노랑) 재단 -> ETC-CUT 재단/컷팅비
UPDATE order_items SET item_id = 1034, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '포맥스3T(노랑) 재단' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 칼판 -> ETC-CUT 재단/컷팅비
UPDATE order_items SET item_id = 1034, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '칼판' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 시트컷팅(검정밑본) -> ETC-CUT · 0원 무상 부속작업
UPDATE order_items SET item_id = 1034, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '시트컷팅(검정밑본)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 밑본용 백색컷팅 -> ETC-CUT · 0원 무상 부속작업
UPDATE order_items SET item_id = 1034, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '밑본용 백색컷팅' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 검정컷팅(밑본용) -> ETC-CUT · 0원 무상 부속작업
UPDATE order_items SET item_id = 1034, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '검정컷팅(밑본용)' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 아크릴 -> ETC-DISC 할인 (내용=할인, -100,000)
UPDATE order_items SET item_id = 1035, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '아크릴' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
-- 6월29일 8월24일 각1개씩 총 2개 140700을 147000 기입 -> ETC-DISC 할인 · 적요가 품목명 칸에 들어간 금액 정정 라인(-12,600)
UPDATE order_items SET item_id = 1035, updated_at = datetime('now') WHERE item_id IS NULL AND item_name = '6월29일 8월24일 각1개씩 총 2개 140700을 147000 기입' AND order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
