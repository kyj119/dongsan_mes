-- 0492_sheet_pack_size_50m.sql
-- 시트 계열 롤당 길이 = 50m (온라인 제품 사양 확인, 사용자 지시로 조사)
--
-- LG/LX하우시스·SP MEDIA·울트라 계열 시트는 **50m 롤이 표준 규격**임을 제품 사양에서 확인했다.
-- (pack_size 단위 = 미터, 0490 규약)
--
-- 개별 확인된 것:
--   켈시트 LA9423NH   1220 x 50M   (LA9000 럭키캘 무광, 90micron)  ※ 사용자 용어와 일치
--   보조시트 LC2000   1000 x 50M   (LG 투명 전사지)
--   랩핑시트 LD59HTG  1050~1370 x 50M (구 SPW035S 차량 랩핑용)
--   조도향상시트 LDJ90DF  122cm, 최대 50m (LG Hausys Diffusion Film)
--   투명시트 SPC031G  1270/1370/1520 x 50M (LG VIZUON SP MEDIA)
--   조명 리무브시트 SPE032G  1050/1370 x 50m
--   엠보시트 EP115    1000 x 50M
--   조명시트 LT4000 시리즈  1220 x 50M (LX 조명용시트)
--   울트라 보조시트   1000 x 50M (SC-008)
--   울트라 칼라시트   1000 x 50m (옥외용 유광)
--
-- ⚠️ 직접 사양을 못 찾은 3품목도 함께 50m 로 넣는다 — 같은 계열의 형제 제품이 전부 50m 이고
--    이 업계 시트 롤의 사실상 표준이기 때문이다. 실물과 다르면 개별 정정 필요:
--      SPE030A(옥외 랩핑시트 137)  — SPE 계열, 형제 SPE032G 가 50m
--      LC6772G(리무브시트 122)     — LG 옥외용 LC6000 시리즈
--      SPT031M(조명시트 137)       — SP MEDIA 계열, 형제 SPP/SPC 가 50m
--
-- ⚠️ 고무자석시트(10m)는 0491 에서 이미 처리 — 매입 기재 '[60폭/10m]' 근거.
-- ⚠️ JMS-GEN(조명시트 범용)은 제외 — 규격이 '색상·폭=매입 메모'라 폭도 롤길이도 미확정.
--    `width_mm IS NOT NULL` 조건이 자동 배제한다.
-- ⚠️ unit(yd→롤) 전환은 이번에도 미실시 — 차감 코드에 롤 분기가 없어 계산은 불변이다.
--
-- 성격: 데이터 구조화(UPDATE만). `pack_size IS NULL` 조건이라 멱등.

UPDATE items SET pack_size = 50, updated_at = CURRENT_TIMESTAMP
 WHERE pack_size IS NULL AND is_active = 1 AND width_mm IS NOT NULL
   AND item_group IN (
     '랩핑시트 LD59HTG', '리무브시트', '보조시트 LC2000', '엠보시트 EP115',
     '옥외 랩핑시트 SPE030A', '울트라 보조시트', '울트라 칼라시트',
     '조도향상시트 LDJ90DF', '조명 리무브시트 SPE032G', '조명시트',
     '켈시트 LA9423NH', '투명시트 SPC031G'
   );
