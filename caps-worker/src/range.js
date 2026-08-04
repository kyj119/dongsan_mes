// caps-worker/src/range.js
// 조회 기간 계산 — 외부 의존성 0 (node_modules 없이도 test-range.js로 검증 가능).
//
// ⚠️ toISOString()은 UTC 기준이라 KST 00~09시에 하루 밀린다 → '오늘'은 반드시 +9h 보정 후 잘라낸다.
//    날짜 산술(ymdShift/spanDays)은 UTC 자정 기준이라 시간대 영향이 없다.

var KST_OFFSET_MS = 9 * 3600 * 1000;

/** 오늘 날짜(KST) YYYYMMDD. nowMs 주입 시 테스트용 고정 시각 사용 */
function today(nowMs) {
  var t = (nowMs == null ? Date.now() : nowMs) + KST_OFFSET_MS;
  return new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
}

/** 'YYYYMMDD' → UTC 자정 ms (날짜 산술 전용) */
function ymdToMs(s) {
  return Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
}

/** 'YYYYMMDD'에 N일 가감 */
function ymdShift(s, days) {
  return new Date(ymdToMs(s) + days * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
}

/** 두 날짜의 포함 일수 (같은 날 = 1) */
function spanDays(from, to) {
  return Math.round((ymdToMs(to) - ymdToMs(from)) / 86400000) + 1;
}

/** 'YYYYMMDD' 정규화 — 8자리가 아니면 null */
function normYmd(v) {
  var s = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  return s.length === 8 ? s : null;
}

/**
 * 이번 동기화가 조회할 기간을 정한다.
 *   1) 기간 지정(MES 수동 트리거 / HTTP body)이 있으면 그대로
 *   2) 없으면 기본 lookback. 단 MES의 '마지막 성공 to_date'가 그보다 과거면 거기까지 자동 확장
 *      → PC가 며칠 꺼져 있어도 켜기만 하면 공백이 자동으로 메워진다.
 *   3) 어느 경우든 상한(maxBackfillDays)으로 클램프
 *
 * @param {Object} opts
 *   - lookbackDays {number}
 *   - maxBackfillDays {number}
 *   - autoGapRecovery {boolean}
 *   - getState {Function} async () => { last_ok_to_date, max_backfill_days } | null
 *   - logger {Object} (선택) { warn, debug }
 *   - nowMs {number} (선택) 테스트용 고정 시각
 * @param {string|null} explicitFrom 'YYYYMMDD'
 * @param {string|null} explicitTo   'YYYYMMDD'
 * @returns {Promise<{fromDate:string,toDate:string,reason:string}>}
 */
async function resolveRange(opts, explicitFrom, explicitTo) {
  var log = opts.logger || { warn: function () {}, debug: function () {} };
  var toDate = today(opts.nowMs);
  var fromDate = ymdShift(toDate, -opts.lookbackDays);
  var reason = 'lookback ' + opts.lookbackDays + '일';
  var cap = opts.maxBackfillDays;

  var from = normYmd(explicitFrom);
  var to = normYmd(explicitTo);

  if (from && to) {
    fromDate = from;
    toDate = to;
    reason = '기간 지정';
  } else if (opts.autoGapRecovery && typeof opts.getState === 'function') {
    var state = await opts.getState();
    if (state) {
      if (state.max_backfill_days > 0) cap = state.max_backfill_days;
      var lastOk = normYmd(state.last_ok_to_date);
      // 마지막 성공일 자체도 다시 조회한다 — ingest가 UPSERT라 중복 안전하고,
      // 그날 오후 퇴근분처럼 부분만 수집된 마지막 날을 보정하는 효과가 있다.
      if (lastOk && lastOk < fromDate) {
        fromDate = lastOk;
        reason = '자동 갭 복구 (마지막 성공 ' + lastOk + ')';
      }
    }
  }

  if (fromDate > toDate) {
    log.warn('시작일이 종료일보다 늦음 — 교환: ' + fromDate + ' ~ ' + toDate);
    var t = fromDate; fromDate = toDate; toDate = t;
  }

  var span = spanDays(fromDate, toDate);
  if (span > cap) {
    var clamped = ymdShift(toDate, -(cap - 1));
    log.warn('조회 기간 ' + span + '일 → 상한 ' + cap + '일로 축소 (' + fromDate + ' → ' + clamped + ')');
    fromDate = clamped;
    reason += ' / 상한 클램프';
  }

  return { fromDate: fromDate, toDate: toDate, reason: reason };
}

module.exports = { today: today, ymdToMs: ymdToMs, ymdShift: ymdShift, spanDays: spanDays, normYmd: normYmd, resolveRange: resolveRange };
