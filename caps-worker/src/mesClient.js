// caps-worker/src/mesClient.js
// MES /api/caps/ingest 로 레코드 전송
// CAPS 시간 포맷 → MES 포맷 변환 포함

const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

const client = axios.create({
  baseURL: config.mesUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'X-Agent-Key': config.mesApiKey,
  },
});

// ============================================================================
// CAPS 시간 변환 유틸
// CAPS nOutput 시간 포맷:
//   - in_time/out_time: 전일 자정 기준 분 (value - 1440 = 당일 자정 기준 분)
//     예: 1946 → 1946-1440 = 506분 = 08:26, -1 = 미등록
//   - late_time/early_time/over_time/night_time/total_time: 순수 분 단위
//     예: 600 = 600분 = 10시간
//
// MES parseTime 기대 포맷: HHMMSS 또는 HHMM 문자열
// MES parseMin 기대 포맷: HHMM 문자열 (HH*60+MM → 분)
// ============================================================================

/**
 * CAPS 출퇴근 시간(전일 자정 기준 분) → HHMMSS 문자열
 * @param {number} value - CAPS in_time/out_time 값
 * @returns {string|null} 'HHMMSS' 또는 null
 */
function capsClockToHHMMSS(value) {
  if (value == null || value < 0) return null;
  var min = value - 1440;
  if (min < 0) min += 2880; // 야간 래핑
  var h = Math.floor(min / 60);
  var m = min % 60;
  return String(h).padStart(2, '0') + String(m).padStart(2, '0') + '00';
}

/**
 * CAPS 분 단위 → HHMM 문자열 (MES parseMin이 기대하는 포맷)
 * @param {number} minutes - 순수 분 단위 (예: 600 = 10시간)
 * @returns {string} 'HHMM' (예: '1000')
 */
function capsMinToHHMM(minutes) {
  if (minutes == null || minutes <= 0) return '0000';
  var h = Math.floor(minutes / 60);
  var m = minutes % 60;
  return String(h).padStart(2, '0') + String(m).padStart(2, '0');
}

/**
 * nOutput 레코드를 MES로 전송
 * @param {Array} records - dbAdapter.queryRecords()에서 반환된 레코드
 * @param {string} fromDate - YYYYMMDD
 * @param {string} toDate - YYYYMMDD
 * @param {string} triggerType - 'SCHEDULED' | 'MANUAL'
 * @returns {Object} MES 응답
 */
async function pushRecords(records, fromDate, toDate, triggerType) {
  triggerType = triggerType || 'SCHEDULED';

  if (!records || records.length === 0) {
    logger.info('전송할 레코드 없음');
    return { success: true, inserted: 0, updated: 0, skipped: 0, errors: 0, message: 'No records' };
  }

  // Access 컬럼 → MES 필드 매핑 + 시간 포맷 변환
  var mapped = records.map(function(r) {
    return {
      fpid: r.fpid != null ? r.fpid : null,
      e_idno: String(r.e_idno || ''),
      e_name: String(r.e_name || ''),
      c_dept: String(r.c_dept || ''),
      d_date: String(r.d_date || ''),
      // 출퇴근 시간: CAPS 분 → HHMMSS
      in_time: capsClockToHHMMSS(r.in_time),
      out_time: capsClockToHHMMSS(r.out_time),
      leave_time: capsClockToHHMMSS(r.leave_time),
      return_time: capsClockToHHMMSS(r.return_time),
      // 분 단위 값: CAPS 분 → HHMM
      late_time: capsMinToHHMM(r.late_time),
      ealry_time: capsMinToHHMM(r.early_time),  // Access: early_time → MES: ealry_time
      over_time: capsMinToHHMM(r.over_time),
      night_time: capsMinToHHMM(r.night_time),
      total_time: capsMinToHHMM(r.total_time),
    };
  });

  var payload = {
    from_date: fromDate,
    to_date: toDate,
    trigger_type: triggerType,
    records: mapped,
  };

  logger.info('MES 전송: ' + mapped.length + '건 (' + fromDate + '~' + toDate + ')');

  // 변환 샘플 로그 (첫 2건)
  if (mapped.length > 0) {
    var s = mapped[0];
    logger.debug('샘플[0]: ' + s.e_name + ' IN:' + s.in_time + ' OUT:' + s.out_time + ' total:' + s.total_time);
  }

  try {
    var res = await client.post('/api/caps/ingest', payload);
    // MES 응답: { success, data: { log_id, fetched, inserted, updated, skipped, errors, status } }
    var body = res.data;
    var data = body.data || body;
    logger.info('MES 응답: inserted=' + data.inserted + ', updated=' + data.updated + ', skipped=' + data.skipped + ', errors=' + data.errors + ', status=' + data.status);

    if (data.unmappedSamples && data.unmappedSamples.length > 0) {
      logger.warn('미매핑 사원 ' + data.unmappedSamples.length + '명:');
      data.unmappedSamples.forEach(function(s) {
        logger.warn('  fpid=' + (s.fpid || '?') + ' e_idno=' + (s.e_idno || '') + ' name=' + (s.e_name || ''));
      });
    }

    return data;
  } catch (err) {
    var status = (err.response && err.response.status) || 'N/A';
    var msg = (err.response && err.response.data && err.response.data.error) || err.message;
    logger.error('MES 전송 실패 [' + status + ']: ' + msg);
    throw new Error('MES 전송 실패: [' + status + '] ' + msg);
  }
}

module.exports = { pushRecords };
