// caps-worker/src/config.js
// 환경변수 로드 + 기본값 설정

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
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

  // 트리거 서버
  triggerPort: parseInt(process.env.TRIGGER_PORT || '9100', 10),

  // 로그
  logLevel: process.env.LOG_LEVEL || 'info',
  logDir: path.join(__dirname, '..', 'logs'),
};
