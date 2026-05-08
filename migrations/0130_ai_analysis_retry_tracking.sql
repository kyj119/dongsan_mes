-- ============================================================================
-- Migration 0130 — AI analysis retry tracking
-- ----------------------------------------------------------------------------
-- Adds retry bookkeeping to ai_analysis_requests so IllustratorAutomat failures
-- don't leave the row stuck in 'error'. The PATCH handler in
-- src/routes/aiAnalysis.ts uses these columns to:
--   * increment retry_count on each status→error write,
--   * auto-requeue (status := 'pending') while retry_count < max_retries,
--   * stamp last_error_at for the /tasks admin UI.
-- ============================================================================

ALTER TABLE ai_analysis_requests ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_analysis_requests ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 3;
ALTER TABLE ai_analysis_requests ADD COLUMN last_error_at DATETIME;
