-- 0494_sheet_unit_to_roll.sql
-- 시트 계열 재고 단위 → '롤' 전환 36품목 (사용자: "시트의 경우 단위가 전부 롤이어야 한다")
--
-- 배경: 시트는 매입도 재고도 롤 단위인데 items.unit 이 yd(33)·m(5)로 등록돼 있었다.
--   자동차감은 야드 길이를 빼고 있어, 롤 재고에서 야드 수치가 빠지는 상태였다
--   (3m 출력 1매 기준 0.06롤이 정답인데 3.28을 뺐다 = 54.7배 과차감).
--
-- ★ 이 마이그레이션은 **차감 코드의 롤 분기와 한 쌍**이다(utils/rollConsumption).
--   코드가 `unit='롤' && pack_size>0` 일 때만 롤 수로 환산하므로, 전환 대상은
--   **pack_size 가 채워진 품목으로 한정**한다. 롤길이를 모르는 품목을 롤로 바꾸면
--   코드가 yd 로 폴백해 단위 표시만 어긋난다(0490~0493 에서 시트 롤길이를 먼저 채운 이유).
--
-- 대상 조건: 시트 계열 · ROLL 차감 · width_mm 있음 · pack_size>0 · unit<>'롤'
--   그레이시트 SPM022G 4 · 일반시트 SPM011G 4(090 은 이미 롤) · 투명시트 SPC031G 4
--   조명시트 5 · 엠보시트 EP115 2 · 프리즘반사시트 4 · 뽀닥시트 2 · 고무자석시트 2
--   랩핑시트 LD59HTG · 옥외 랩핑시트 SPE030A · 리무브시트 LC6772G · 조명 리무브시트 SPE032G
--   조도향상시트 LDJ90DF · 보조시트 LC2000 · 울트라 보조/칼라시트 · 켈시트 LA9423NH
--
-- ⚠️ 코팅지 계열은 제외 — 사용자 지시가 '시트'에 한정됐다. 코팅지도 롤로 매입되므로
--    같은 전환이 필요할 수 있으나 별도 확인 후 처리한다(pack_size 는 이미 채워둠).
-- ⚠️ 현수막 계열도 제외 — yd 단위로 입고를 체크하므로(사용자) 현행이 옳다.
-- ⚠️ 무광시트 SPM011M(width_mm NULL·재고1롤 소진용)은 조건에서 자동 제외된다.
-- ⚠️ 지금 재고는 0 아닌 행이 1개뿐이라(FLEXN-090) 전환에 따른 기존 재고 수치 재해석 문제가
--    없다. 재고 실사 착수 전인 지금이 바꾸기 가장 안전한 시점이다.
--
-- 성격: 데이터 정정(UPDATE만). 조건이 `unit<>'롤'` 이라 멱등.

UPDATE items
   SET unit = '롤', updated_at = CURRENT_TIMESTAMP
 WHERE is_active = 1
   AND (item_name LIKE '%시트%' OR item_group LIKE '%시트%')
   AND COALESCE(deduction_method, 'ROLL') = 'ROLL'
   AND width_mm IS NOT NULL
   AND COALESCE(pack_size, 0) > 0
   AND COALESCE(unit, '') <> '롤';
