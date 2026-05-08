-- AI 분석 요청에 파일 내용(base64) 저장 컬럼 추가
-- 브라우저에서 파일 업로드 시 IllustratorAutomat이 다운로드하여 처리
ALTER TABLE ai_analysis_requests ADD COLUMN file_content TEXT;
