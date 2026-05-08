// caps-worker/src/dbAdapter.js
// ODBC를 통해 CAPS Access DB (nOutput 테이블) 조회

const odbc = require('odbc');
const config = require('./config');
const logger = require('./logger');

let pool = null;

/**
 * ODBC 연결 풀 생성
 * Access DB는 동시 접속에 제한이 있으므로 connectionLimit=1
 */
async function getPool() {
  if (pool) return pool;

  // DSN-less 드라이버 직접 연결 (64비트 호환)
  var connStr = 'Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=' + config.capsDbPath + ';';
  if (config.capsDbPassword) {
    connStr += 'PWD=' + config.capsDbPassword + ';';
  }

  logger.info('ODBC 연결 시도:', config.capsDbPath);
  pool = await odbc.pool(connStr, { initialSize: 1, maxSize: 1 });
  logger.info('ODBC 연결 풀 생성 완료');
  return pool;
}

// 날짜 문자열 sanitize (숫자만 남김)
function safe(s) {
  return String(s).replace(/[^0-9]/g, '');
}

/**
 * nOutput 테이블에서 날짜 범위로 레코드 조회
 * @param {string} fromDate - YYYYMMDD 형식
 * @param {string} toDate - YYYYMMDD 형식
 * @returns {Array} nOutput 레코드 배열
 *
 * 실제 컬럼명 (2026-04-10 확인):
 *   fpid, e_idno, e_name, c_dept, d_date, n_date,
 *   in_time, out_time, leave_time, return_time,
 *   late_time, early_time, over_time, night_time, total_time,
 *   basic_time, off_time, allow_time, holidaywork, decision, ...
 *
 * 시간 값은 숫자 (HHMM or HHMMSS, -1 = 미등록)
 */
async function queryRecords(fromDate, toDate) {
  var db = await getPool();

  // Access ODBC는 파라미터 바인딩(?)이 불안정하므로 직접 삽입
  // fromDate/toDate는 내부 생성값(YYYYMMDD)이므로 SQL injection 위험 없음
  // tuser JOIN으로 퇴사자(retire_date != '') 자동 제외
  var sql = "SELECT n.fpid, n.e_idno, n.e_name, n.c_dept, n.d_date, " +
    "n.in_time, n.out_time, n.leave_time, n.return_time, " +
    "n.late_time, n.early_time, n.over_time, n.night_time, n.total_time " +
    "FROM nOutput n " +
    "INNER JOIN tuser u ON n.fpid = u.id " +
    "WHERE n.d_date >= '" + safe(fromDate) + "' AND n.d_date <= '" + safe(toDate) + "' " +
    "AND (u.retire_date IS NULL OR u.retire_date = '') " +
    "ORDER BY n.d_date, n.in_time";

  logger.debug('쿼리: ' + fromDate + ' ~ ' + toDate);
  var result = await db.query(sql);
  logger.info('조회 결과: ' + result.length + '건 (' + fromDate + ' ~ ' + toDate + ')');
  return result;
}

/**
 * 연결 테스트 — 단순 카운트 쿼리
 */
async function testConnection() {
  var db = await getPool();
  var result = await db.query('SELECT COUNT(*) AS cnt FROM nOutput');
  return result[0] ? result[0].cnt : 0;
}

/**
 * 오늘 날짜 기준 샘플 조회
 */
async function queryToday(limit) {
  limit = limit || 10;
  var db = await getPool();
  var d = new Date();
  var today = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  var sql = "SELECT TOP " + limit + " fpid, e_idno, e_name, c_dept, d_date, " +
    "in_time, out_time, late_time, early_time, over_time, night_time, total_time " +
    "FROM nOutput WHERE d_date = '" + today + "' ORDER BY in_time DESC";
  return db.query(sql);
}

/**
 * 풀 종료
 */
async function close() {
  if (pool) {
    await pool.close();
    pool = null;
    logger.info('ODBC 연결 풀 종료');
  }
}

module.exports = { getPool, queryRecords, testConnection, queryToday, close };
