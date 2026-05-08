// caps-worker/src/test-query.js
// 날짜 범위 조회 + MES 전송 테스트 (dry-run 옵션)
// 사용법:
//   node src/test-query.js              # 최근 2일 조회 (MES 전송 없음)
//   node src/test-query.js --push       # 최근 2일 조회 + MES 전송

const db = require('./dbAdapter');
const mes = require('./mesClient');
const config = require('./config');
const logger = require('./logger');

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

async function main() {
  const doPush = process.argv.includes('--push');
  const fromDate = daysAgo(config.lookbackDays);
  const toDate = daysAgo(0);

  logger.info(`=== 쿼리 테스트 (${fromDate} ~ ${toDate}) ===`);
  logger.info(`MES 전송: ${doPush ? 'YES' : 'NO (dry-run)'}`);

  try {
    const records = await db.queryRecords(fromDate, toDate);
    logger.info(`조회 결과: ${records.length}건`);

    if (records.length > 0) {
      // 처음 5건만 출력
      const preview = records.slice(0, 5);
      for (const r of preview) {
        logger.info(`  [${r.d_date}] ${r.e_idno} ${r.e_name} | IN:${r.in_time} OUT:${r.out_time} | 지각:${r.late_time} 연장:${r.over_time}`);
      }
      if (records.length > 5) logger.info(`  ... 외 ${records.length - 5}건`);
    }

    if (doPush && records.length > 0) {
      logger.info('--- MES 전송 시작 ---');
      const result = await mes.pushRecords(records, fromDate, toDate, 'MANUAL_TEST');
      logger.info(`MES 결과: inserted=${result.inserted}, updated=${result.updated}, skipped=${result.skipped}, errors=${result.errors}`);
      if (result.unmappedSamples && result.unmappedSamples.length > 0) {
        logger.info(`\n=== 미매핑 사원 샘플 (${result.unmappedSamples.length}명) ===`);
        result.unmappedSamples.forEach(s => {
          logger.info(`  fpid=${s.fpid || '?'} | e_idno=${s.e_idno || ''} | name=${s.e_name || ''}`);
        });
        logger.info('→ MES 설정 > CAPS 사원 매핑에서 위 fpid로 매핑해주세요');
      }
    }
  } catch (err) {
    logger.error('실패:', err.message);
  }

  await db.close();
  logger.info('=== 테스트 완료 ===');
}

main().catch(err => {
  console.error('실행 오류:', err);
  process.exit(1);
});
