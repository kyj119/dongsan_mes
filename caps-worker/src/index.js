// caps-worker/src/index.js
// CAPS 근태 동기화 워커 — 메인 엔트리

const cron = require('node-cron');
const axios = require('axios');
const config = require('./config');
const logger = require('./logger');
const db = require('./dbAdapter');
const mes = require('./mesClient');

// ---------- 날짜 유틸 ----------

/** 오늘 기준 N일 전 날짜를 YYYYMMDD로 반환 */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/** 오늘 날짜 YYYYMMDD */
function today() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

// ---------- 동기화 실행 ----------

async function runSync(triggerType = 'SCHEDULED') {
  const fromDate = daysAgo(config.lookbackDays);
  const toDate = today();

  logger.info(`=== 동기화 시작 [${triggerType}] ${fromDate} ~ ${toDate} ===`);

  try {
    // 1. CAPS DB 조회
    const records = await db.queryRecords(fromDate, toDate);

    if (records.length === 0) {
      logger.info('조회된 레코드 없음. 건너뜀.');
      return;
    }

    // 2. MES로 전송
    const result = await mes.pushRecords(records, fromDate, toDate, triggerType);

    logger.info(`=== 동기화 완료: +${result.inserted} ~${result.updated} =${result.skipped} !${result.errors} ===`);
  } catch (err) {
    logger.error('동기화 실패:', err.message);
  }
}

// ---------- HTTP 트리거 서버 ----------

const http = require('http');

function startTriggerServer() {
  const port = parseInt(process.env.TRIGGER_PORT || '9100', 10);
  const apiKey = config.mesApiKey;

  const server = http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type, X-Agent-Key, Authorization' });
      return res.end();
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Method not allowed' }));
    }

    // API key 검증
    if (apiKey && req.headers['x-agent-key'] !== apiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    try {
      logger.info('HTTP 수동 트리거 수신');
      await runSync('MANUAL');
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true, message: 'Sync completed' }));
    } catch (err) {
      logger.error('수동 트리거 실패:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`포트 ${port} 이미 사용 중 — 트리거 서버 건너뜀 (스케줄/폴링은 정상 작동)`);
    } else {
      logger.error('트리거 서버 오류:', err.message);
    }
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info(`트리거 서버 시작: http://0.0.0.0:${port}`);
  });

  return server;
}

// ---------- 시작 ----------

async function main() {
  logger.info('==================================');
  logger.info('CAPS Worker 시작');
  logger.info(`MES: ${config.mesUrl}`);
  logger.info(`DB: ${config.capsDbPath}`);
  logger.info(`PW: ${config.capsDbPassword ? '****' : '(없음)'}`);
  logger.info(`주기: ${config.syncCron}`);
  logger.info(`Site ID: ${config.siteId}`);
  logger.info(`Lookback: ${config.lookbackDays}일`);
  logger.info('==================================');

  // 시작 시 1회 즉시 실행
  try {
    await runSync('STARTUP');
  } catch (err) {
    logger.error('초기 동기화 실패:', err.message);
    logger.info('스케줄은 계속 실행됩니다.');
  }

  // cron 스케줄 등록
  cron.schedule(config.syncCron, async () => {
    try {
      await runSync('SCHEDULED');
    } catch (err) {
      logger.error('스케줄 동기화 실패:', err.message);
    }
  });

  // HTTP 트리거 서버 시작
  startTriggerServer();

  // MES 폴링: 수동 동기화 요청 감지 (30초마다)
  startPendingPoller();

  logger.info('스케줄러 등록 완료. 대기 중...');
}

// ---------- MES 폴링 (수동 트리거 감지) ----------

function startPendingPoller() {
  var POLL_INTERVAL = 30000; // 30초

  async function checkPending() {
    try {
      var res = await axios.get(config.mesUrl + '/api/caps/sync/pending', {
        headers: { 'X-Agent-Key': config.mesApiKey },
        params: { site_id: config.siteId },
        timeout: 10000,
      });
      if (res.data && res.data.pending) {
        logger.info('수동 동기화 요청 감지 (requested_at: ' + res.data.requested_at + ')');
        await runSync('MANUAL');
      }
    } catch (err) {
      // 네트워크 오류 시 무시 (다음 폴링에서 재시도)
      if (err.code !== 'ECONNREFUSED' && err.code !== 'ENOTFOUND') {
        logger.debug('폴링 오류: ' + (err.message || err));
      }
    }
  }

  setInterval(checkPending, POLL_INTERVAL);
  logger.info('MES 폴링 시작 (간격: ' + (POLL_INTERVAL / 1000) + '초)');
}

// 종료 핸들링
process.on('SIGINT', async () => {
  logger.info('SIGINT 수신. 종료 중...');
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM 수신. 종료 중...');
  await db.close();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', String(reason));
});

main().catch(err => {
  logger.error('Worker 시작 실패:', err.message);
  process.exit(1);
});
