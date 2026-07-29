-- 0491_pack_size_batch2.sql
-- 롤당 길이(pack_size) 2차 — 사용자 확인분 69품목 + 롤 단위 지정 2그룹
--
-- 0490 에 이어 롤당 길이를 계속 구조화한다. pack_size 단위는 **미터(m)** 로 통일(0490 규약).
--
-- ① 이름에 '30M' 이 박힌 6그룹 28품목 (사용자 "30M 맞아")
--    켈·켈그레이·패트배너·합성지·합성지그레이·비점착 합성지 — 품목명 자체가 30m 롤을 뜻한다.
--    ※ 각 그룹에는 호홍/잉크테크 두 제조사가 섞여 있으나(0483 group_sort 로 호홍 우선),
--      같은 제품의 대체재라 롤 규격도 동일하다.
--
-- ② 후렉스 계열 + 솔벤 매쉬 = 50m 고정 (사용자)
--    조명용 후렉스 13 · 비조명용 후렉스 12 · 솔벤 매쉬 9
--    ⚠️ '양면배너 후렉스'(FLEXD-137)는 제외 — 사용자가 언급한 3종에 없어 별도 확인 대기.
--
-- ③ 롤 단위 + 30m (사용자 "롤 단위로 30M")
--    나투라 솔벤패트 2 · 클리어필름 2 → unit 도 '롤' 로 변경
--    블랙아웃 패트 1 → 30m (단위는 미지정이라 yd 유지)
--
-- ④ 고무자석시트 2품목 = 10m
--    사용자 지시가 아니라 **매입 실적 근거** — 발주 기재가
--    '고무자석시트-일반(0.8T) [60폭/10m]' · '고무자석시트-차량용(0.8T) [100폭/10m]' 로
--    롤당 10m 를 명시하고 있다(시트 계열이지만 온라인 확인 불요).
--
-- ⚠️ 현수막 계열(솔벤 현수막·수성 1/2코팅·저밀도·친환경 TPM/eco/GRS·폰지·텐트천·깃발천·
--    미러천·샤틴·타포린·솔벤 캔버스원단·열전사원단)은 **yd 단위로 입고를 체크**하므로(사용자)
--    unit='yd' 를 그대로 두고 pack_size 도 채우지 않는다. 롤당 길이 개념이 필요 없는 자재다.
--    이 경우 현재 차감 로직(÷914.4 = yd)이 입고 단위와 이미 일치한다.
--
-- ⚠️ unit 전환(yd→롤)은 이번에도 **지시받은 2그룹만** 한다. 차감 코드가 아직 롤을 모르므로
--    (base_unit==='cm' ? ÷10 : ÷914.4) unit 은 표시에만 영향하고 계산은 불변이다.
--    재고가 사실상 비어 있어(0 아닌 행 1개) 지금이 바꿔도 안전한 시점.
--
-- 성격: 데이터 구조화(UPDATE만). `pack_size IS NULL` 조건이라 멱등 + 기존 값 보호.

-- ① 30M 그룹 (이름 기준 — 그룹에 호홍/잉크테크 혼재)
UPDATE items SET pack_size = 30, updated_at = CURRENT_TIMESTAMP
 WHERE pack_size IS NULL AND is_active = 1
   AND item_group IN ('켈 30M 호홍', '켈그레이 30M 호홍', '패트배너 30M 호홍',
                      '합성지 30M 호홍', '합성지그레이 30M 호홍', '비점착 합성지 30M 호홍');

-- ② 후렉스 · 솔벤 매쉬 = 50m
UPDATE items SET pack_size = 50, updated_at = CURRENT_TIMESTAMP
 WHERE pack_size IS NULL AND is_active = 1
   AND item_group IN ('조명용 후렉스', '비조명용 후렉스', '솔벤 매쉬');

-- ③-1 나투라 솔벤패트 · 클리어필름 = 롤 30m
UPDATE items SET pack_size = 30, unit = '롤', updated_at = CURRENT_TIMESTAMP
 WHERE is_active = 1 AND item_group IN ('나투라 솔벤패트', '클리어필름');

-- ③-2 블랙아웃 패트 = 30m (단위 미지정 → yd 유지)
UPDATE items SET pack_size = 30, updated_at = CURRENT_TIMESTAMP
 WHERE pack_size IS NULL AND is_active = 1 AND item_group = '블랙아웃 패트';

-- ④ 고무자석시트 = 10m (매입 기재 근거)
UPDATE items SET pack_size = 10, updated_at = CURRENT_TIMESTAMP
 WHERE pack_size IS NULL AND is_active = 1 AND item_group = '고무자석시트';
