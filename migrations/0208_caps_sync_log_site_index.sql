-- 0208: caps_sync_log.site_id 인덱스 추가
-- 0199에서 site_id 컬럼 추가됐으나 인덱스 누락
-- GET /api/caps/sync-log?site_id=DJ 필터링 성능 보완
CREATE INDEX IF NOT EXISTS idx_caps_sync_log_site_id ON caps_sync_log(site_id);
