-- 0545: 에이전트가 자기 키트 버전·파서 종류를 heartbeat 로 보고 (2026-09-01 용준님)
--
-- 왜: 「그 PC 에 [2] 가 돌았는가 / 지금 어떤 파서로 도는가」를 지금은 Z: 수거 폴더로 추측한다.
--   그 추측은 실제로 틀렸다 — 2026-09-01 현장 일괄에서
--     · HSM-05·08·09 는 수거 폴더가 비었거나 아예 없는데 실제로는 2축으로 전환돼 있었고,
--     · 출력실2 는 실행했다는데 Z: 에 흔적이 없어 갱신 여부를 **원격으로 판정할 수 없었다**.
--   수거 폴더는 키트를 어디서 실행했느냐(Z: 직접 / PC 로 복사)에 따라 남는 위치가 달라진다
--   (kit.ps1 의 수거 경로 = $KitRoot 기준). 즉 **폴더 유무는 설치 여부의 증거가 아니다.**
--
-- ★ 그래서 에이전트가 스스로 말하게 한다. 매 heartbeat(60초)에 실려 오므로
--   배포 직후부터 31대 전부를 prod 한 줄로 확인할 수 있다.
--
--   kit_version  = bin\version.txt 원문 ("kit git=<sha> built=<yyyy-MM-dd HH:mm>")
--                  파일이 없으면 빈 문자열 → 구버전 에이전트와 구분된다(NULL = 아직 안 올린 PC).
--   parser_type  = 그 장비가 실제로 물고 있는 파서 (tns / tns_flora / flexi_printexp / ...).
--                  레거시(1.1.0) 모드는 'legacy'. equipment.json 이 뭐라고 적혀 있든
--                  **런타임이 실제로 만든 파서**라 설정 파일과 어긋나면 여기서 드러난다.
--
-- 둘 다 NULL 허용 = 구버전 에이전트가 계속 붙어도 heartbeat 가 깨지지 않는다(점진 롤아웃).

ALTER TABLE agent_heartbeats ADD COLUMN kit_version TEXT;
ALTER TABLE agent_heartbeats ADD COLUMN parser_type TEXT;
