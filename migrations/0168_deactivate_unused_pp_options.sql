-- 미사용 후가공 옵션 삭제
DELETE FROM post_processing_options
WHERE option_code IN ('PP-GROMMET', 'PP-HEMMING', 'PP-POCKET', 'PP-ROPE', 'PP-MOUNT', 'PP-FRAME');
