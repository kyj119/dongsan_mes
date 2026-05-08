// caps-worker/src/logger.js
// 간단한 파일 + 콘솔 로거 (Winston 없이 경량 구현)

const fs = require('fs');
const path = require('path');
const config = require('./config');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[config.logLevel] ?? 1;

// 로그 디렉토리 보장
if (!fs.existsSync(config.logDir)) {
  fs.mkdirSync(config.logDir, { recursive: true });
}

// 7일 이상 된 로그 정리
function cleanOldLogs() {
  try {
    const files = fs.readdirSync(config.logDir);
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const f of files) {
      if (!f.endsWith('.log')) continue;
      const fp = path.join(config.logDir, f);
      const stat = fs.statSync(fp);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(fp);
    }
  } catch { /* ignore */ }
}

function getLogFile() {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return path.join(config.logDir, `caps-worker-${dateStr}.log`);
}

function formatTime() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function log(level, ...args) {
  if ((LEVELS[level] ?? 1) < currentLevel) return;
  const tag = `[${formatTime()}] [${level.toUpperCase()}]`;
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  const line = `${tag} ${msg}`;

  // 콘솔
  if (level === 'error') console.error(line);
  else console.log(line);

  // 파일
  try {
    fs.appendFileSync(getLogFile(), line + '\n');
  } catch { /* ignore */ }
}

// 시작 시 오래된 로그 정리
cleanOldLogs();

module.exports = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
};
