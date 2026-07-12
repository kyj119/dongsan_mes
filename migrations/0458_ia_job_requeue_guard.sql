-- Migration 0458: IA 잡 stale 재큐 가드 (crash 하드닝 갭②)
-- 하드 crash로 'rendering' 낀 잡을 에이전트 폴링 진입 시 자동 재큐하되, 무한재큐(poison) 방지 카운터.
--   ia_process_jobs (0386): 단일 가공 렌더잡
--   sheet_layouts  (0316·0318): 네스팅/모아찍기 시트 렌더잡
-- ※ ai_analysis_requests는 기존 retry_count/max_retries(0130)로 이미 bound → 여기선 제외.
-- ⚠️ ALTER ADD COLUMN 비멱등 — 재적용 금지(중복 컬럼). 신규 1회만.
ALTER TABLE ia_process_jobs ADD COLUMN requeue_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sheet_layouts  ADD COLUMN requeue_count INTEGER NOT NULL DEFAULT 0;
