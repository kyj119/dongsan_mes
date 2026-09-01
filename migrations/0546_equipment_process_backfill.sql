-- 0546: 장비 공정(출력방식) 실배정 — equipment_processes 최초 채움 (2026-09-01 용준님)
--
-- 왜: `equipment_processes`(0389)·`constants/process.ts`·/equipment 의 공정 배지·필터·색상점이
--   2026-06-26 에 전부 만들어져 있는데 **테이블이 한 건도 없어** 모든 장비가 "공정 미지정" 이었다.
--   그 빈자리를 자유텍스트 `equipment.location_zone` 이 대신 메우면서 **EPSON-01 한 대만** '출력실' 이
--   들어가 장비 그룹이 혼자 튀었다(2026-09-01 문의). 축을 하나로 되돌린다 —
--   **위치 = `zone_id`(facility_zones), 출력방식 = `equipment_processes`, 자유텍스트는 은퇴.**
--
-- 근거(추정 아님):
--   · 현장이 키트 [1] 에서 직접 고른 공정 기록 — TOPM-01=수성 · HSM-03/04=수성 · UV-1800-01=UV ·
--     **HYB-3200-01=UV**(하이브리드를 UV 로 분류한 건 현장 판단, 파일명은 (솔벤현수막) 이라 반대로 보인다).
--   · 출력 파일명 소재 키워드 — EPSON=`솔벤시트/솔벤조명시트/앱슨 솔벤그레이시트` · SOLV=`솔벤시트 KM` ·
--     UV=`UV그레이후렉스` · FLAT=`포맥스3T+자동바니쉬` · FLEXI/TRANS/KOSTECH=`(60-180-10조)` 조 단위.
--   · TOPM/TPM 4대 = 수성 (용준님 확인 2026-09-01, TPM-03 은 320폭).
--
-- ★ 평판(FLAT-4X8-01)은 **UV 로 넣는다.** 코드 목록 정본이 `items.category` 와 1:1 인데
--   거기에 '평판' 이 없다(수성·솔벤·UV·전사·태극기·간판). 평판을 따로 보려면 그 1:1 선언부터
--   바꿔야 하므로 여기서 임의로 코드를 늘리지 않는다.
--
-- is_primary=1 은 전부 1개씩. 하이브리드도 UV 하나만 넣는다 — 솔벤을 같이 넣는 건 추론이지 기록이 아니다.
-- INSERT OR REPLACE = 재실행해도 같은 상태(멱등).

INSERT OR REPLACE INTO equipment_processes (equipment_id, process_code, is_primary) VALUES
  ('HSM-01','AQUEOUS',1), ('HSM-02','AQUEOUS',1), ('HSM-03','AQUEOUS',1),
  ('HSM-04','AQUEOUS',1), ('HSM-05','AQUEOUS',1), ('HSM-06','AQUEOUS',1),
  ('HSM-07','AQUEOUS',1), ('HSM-08','AQUEOUS',1), ('HSM-09','AQUEOUS',1),
  ('HSM-10','AQUEOUS',1), ('HSM-11','AQUEOUS',1), ('HSM-12','AQUEOUS',1),
  ('HSM-13','AQUEOUS',1),
  ('TOPM-01','AQUEOUS',1), ('TPM-01','AQUEOUS',1), ('TPM-02','AQUEOUS',1), ('TPM-03','AQUEOUS',1),
  ('SOLV-1800-01','SOLVENT',1), ('SOLV-3200-01','SOLVENT',1),
  ('EPSON-01','SOLVENT',1), ('EPSON-02','SOLVENT',1),
  ('UV-1800-01','UV',1), ('UV-3200-01','UV',1), ('HYB-3200-01','UV',1), ('FLAT-4X8-01','UV',1),
  ('FLEXI-01','TRANSFER',1), ('FLEXI-03','TRANSFER',1), ('FLEXI-TOYO1','TRANSFER',1),
  ('FLEXI-TOYO','TRANSFER',1),
  ('TRANS-8C-01','TRANSFER',1), ('TRANS-8C-02','TRANSFER',1), ('KOSTECH-TRANS-01','TRANSFER',1);

-- 자유텍스트 구역 은퇴 — EPSON-01 한 대만 값이 있고, 같은 뜻을 zone_id=8(출력실)이 이미 갖고 있다.
-- 남겨 두면 그룹 키가 다시 여기로 갈라진다(production.js 가 location_zone 을 1순위로 봤다).
UPDATE equipment SET location_zone = NULL WHERE location_zone IS NOT NULL;
