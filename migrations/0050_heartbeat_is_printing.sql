-- agent_heartbeats: 현재 인쇄 중 여부 플래그
ALTER TABLE agent_heartbeats ADD COLUMN is_printing INTEGER DEFAULT 0;
