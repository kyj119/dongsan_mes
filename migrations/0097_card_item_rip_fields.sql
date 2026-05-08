-- card_items에 RIP 전송 관련 필드 추가
-- 아이템별 개별 장비/프리셋 선택 및 전송 지원

ALTER TABLE card_items ADD COLUMN source_file_path TEXT;
ALTER TABLE card_items ADD COLUMN rip_equipment_id TEXT;
ALTER TABLE card_items ADD COLUMN rip_preset TEXT;
ALTER TABLE card_items ADD COLUMN rip_status TEXT;
ALTER TABLE card_items ADD COLUMN rip_queued_at DATETIME;
ALTER TABLE card_items ADD COLUMN rip_sent_at DATETIME;
ALTER TABLE card_items ADD COLUMN rip_job_path TEXT;
