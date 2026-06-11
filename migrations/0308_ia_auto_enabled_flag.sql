-- #377: IA 자동가공 폴링 활성화 플래그 (기본 OFF)
-- /api/auto-process/pending 게이트. OFF(0)면 폴링 에이전트(IllustratorAutomat)에 빈 목록 반환 → 자동가공 정지.
-- 운영 절차: OFF(기본) → stale pending 정리 → 수동 테스트 1건 → ON(1) 전환(PATCH /api/settings)
INSERT OR IGNORE INTO settings (setting_key, setting_value, description)
VALUES ('ia_auto_enabled', '0', 'IA 자동가공 폴링 활성화 (0=OFF 기본, 1=ON)');
