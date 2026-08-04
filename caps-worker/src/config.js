// caps-worker/src/config.js
// 환경변수 로드 + 기본값 설정

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// 워커 버전 — ingest 시 MES로 전송되어 sync_log.notes에 기록된다.
// 기간 지정/자동 갭 복구 지원 여부를 MES 화면에서 구분하기 위한 값. 기능 변경 시 올릴 것.
const WORKER_VERSION = '1.1.0';

module.exports = {
  workerVersion: WORKER_VERSION,

  // ODBC (DSN-less 드라이버 직접 연결)
  capsDbPath: process.env.CAPS_DB_PATH || 'C:\\Caps\\ACServer\\ACCESS.mdb',
  capsDbPassword: process.env.CAPS_DB_PASSWORD || '',

  // MES
  mesUrl: (process.env.MES_URL || 'https://webapp-9i0.pages.dev').replace(/\/$/, ''),
  mesApiKey: process.env.MES_API_KEY || '',
  siteId: process.env.SITE_ID || 'DJ',

  // 스케줄
  syncCron: process.env.SYNC_CRON || '0 9,13,19 * * *',
  lookbackDays: parseInt(process.env.LOOKBACK_DAYS || '2', 10),

  // 백필 상한 — MES(src/routes/caps.ts CAPS_MAX_BACKFILL_DAYS)와 같은 값을 유지할 것
  maxBackfillDays: parseInt(process.env.MAX_BACKFILL_DAYS || '60', 10),

  // 자동 갭 복구 — MES가 알려준 '마지막 성공 to_date'부터 다시 조회 (PC 장기 다운 후 자동 복구)
  autoGapRecovery: String(process.env.AUTO_GAP_RECOVERY || '1') !== '0',

  // 트리거 서버
  triggerPort: parseInt(process.env.TRIGGER_PORT || '9100', 10),

  // 로그
  logLevel: process.env.LOG_LEVEL || 'info',
  logDir: path.join(__dirname, '..', 'logs'),
};
