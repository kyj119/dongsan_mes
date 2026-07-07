-- 결재 첨부 D1 base64 blob → R2 이관 (확장성 감사 P3).
-- approval_attachments.file_data(base64)를 R2로 옮기고 참조 키만 D1에 보관.
-- 키 형식: approvals/{request_id}/{attachId}/{safeName}
-- file_data는 스텁으로 유지(레거시 행 폴백·FK 컬럼 제거 불가 교훈). 신규 행은 NULL.
ALTER TABLE approval_attachments ADD COLUMN r2_key TEXT;
