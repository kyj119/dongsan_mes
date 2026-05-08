// caps-worker/src/test-connection.js
// ODBC 연결 테스트 — 경리 PC에서 실행
// 사용법: node src/test-connection.js

const db = require('./dbAdapter');
const logger = require('./logger');

async function main() {
  logger.info('=== ODBC 연결 테스트 ===');

  try {
    const count = await db.testConnection();
    logger.info(`✅ 연결 성공! nOutput 테이블 전체 레코드: ${count}건`);
  } catch (err) {
    logger.error('❌ 연결 실패:', err.message);
    logger.error('');
    logger.error('확인사항:');
    logger.error('  1. CAPS_DB_PATH가 .env에 올바르게 설정되었는지');
    logger.error('  2. CAPS_DB_PASSWORD가 올바른지');
    logger.error('  3. Microsoft Access Driver 64비트가 설치되었는지');
    logger.error('  4. Access DB 파일이 다른 프로그램에 잠겨있지 않은지');
    process.exit(1);
  }

  // 오늘 샘플 조회
  try {
    const samples = await db.queryToday(5);
    if (samples.length === 0) {
      logger.info('⚠️ 오늘 날짜 레코드가 없습니다 (주말/공휴일?)');
    } else {
      logger.info(`오늘 레코드 샘플 (${samples.length}건):`);
      for (const r of samples) {
        logger.info(`  ${r.e_idno} ${r.e_name} | 출근: ${r.in_time} | 퇴근: ${r.out_time} | 부서: ${r.c_dept}`);
      }
    }
  } catch (err) {
    logger.warn('샘플 조회 실패:', err.message);
  }

  await db.close();
  logger.info('=== 테스트 완료 ===');
}

main().catch(err => {
  console.error('테스트 실행 오류:', err);
  process.exit(1);
});
