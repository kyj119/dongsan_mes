-- ============================================================================
-- Migration 0312: LogWatcher 장비 중심 모델 — equipment 수집 상태 컬럼
-- 스펙: docs/superpowers/specs/2026-06-15-logwatcher-equipment-centric.md
-- ----------------------------------------------------------------------------
-- heartbeat가 장비별로 equipment 테이블을 직접 갱신/자동등록할 수 있도록
-- 수집 상태 컬럼 추가. (에이전트=PC 단위 agent_heartbeats와 별개로 장비 단위 관리)
-- ============================================================================

-- 장비별 마지막 heartbeat 시각 (온라인 판정용, 120초 기준)
ALTER TABLE equipment ADD COLUMN last_seen_at DATETIME;

-- 장비별 인쇄 로그 경로 (LogWatcher가 감시 중인 경로)
ALTER TABLE equipment ADD COLUMN print_log_path TEXT;

-- 이 장비를 수집 중인 에이전트 PC (호스트명)
ALTER TABLE equipment ADD COLUMN agent_id TEXT;
