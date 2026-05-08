-- AI 파일 청크 분할 저장 테이블
-- D1의 단일 값 크기 제한(SQLITE_TOOBIG)을 우회하기 위해 파일을 500KB 단위로 분할 저장
CREATE TABLE IF NOT EXISTS ai_file_chunks (
  analysis_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_data TEXT NOT NULL,
  PRIMARY KEY (analysis_id, chunk_index)
);
