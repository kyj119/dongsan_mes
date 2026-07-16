-- 솔벤 현수막 152폭 정정 (SVB-150→152, 미사용 확인)
UPDATE items SET item_code='SVB-152', updated_at=CURRENT_TIMESTAMP WHERE item_code='SVB-150';
