// caps-worker/src/test-range.js
// 조회 기간 계산 자체검사 — 외부 의존성 0. `npm run test-range`
// 경리 PC에 파일을 복사한 뒤 ODBC/MES 없이도 로직이 살아있는지 확인하는 용도.

var r = require('./range');

var pass = 0, fail = 0;

function eq(label, actual, expected) {
  var ok = String(actual) === String(expected);
  console.log((ok ? '  OK   ' : '  FAIL ') + label + ' → ' + actual + (ok ? '' : ' (기대: ' + expected + ')'));
  ok ? pass++ : fail++;
}

// 2026-08-04 00:30 KST = 2026-08-03 15:30 UTC — KST 새벽에도 '오늘'이 8/4여야 한다
var NOW_KST_EARLY = Date.UTC(2026, 7, 3, 15, 30);

async function main() {
  console.log('\n[1] 날짜 유틸');
  eq('today (KST 00:30)', r.today(NOW_KST_EARLY), '20260804');
  eq('UTC 그대로였다면(버그 재현)', new Date(NOW_KST_EARLY).toISOString().slice(0, 10).replace(/-/g, ''), '20260803');
  eq('ymdShift 월경계', r.ymdShift('20260301', -1), '20260228');
  eq('ymdShift 연경계', r.ymdShift('20260101', -1), '20251231');
  eq('ymdShift 윤년', r.ymdShift('20240301', -1), '20240229');
  eq('spanDays 5일', r.spanDays('20260726', '20260730'), 5);
  eq('spanDays 당일', r.spanDays('20260804', '20260804'), 1);
  eq('normYmd 하이픈', r.normYmd('2026-07-26'), '20260726');
  eq('normYmd 잘못된 값', r.normYmd('2026-7-2'), 'null');

  var base = {
    lookbackDays: 2, maxBackfillDays: 60, autoGapRecovery: true,
    nowMs: NOW_KST_EARLY, logger: { warn: function () {}, debug: function () {} },
  };
  var noState = function () { return Promise.resolve(null); };
  var state = function (lastOk, cap) {
    return function () { return Promise.resolve({ last_ok_to_date: lastOk, max_backfill_days: cap || 60 }); };
  };

  console.log('\n[2] 기본 lookback');
  var a = await resolve(Object.assign({}, base, { getState: noState }));
  eq('from', a.fromDate, '20260802');
  eq('to', a.toDate, '20260804');

  console.log('\n[3] 자동 갭 복구 — PC가 7/25까지만 동기화하고 꺼져 있었던 경우');
  var b = await resolve(Object.assign({}, base, { getState: state('20260725') }));
  eq('from (마지막 성공일까지 확장)', b.fromDate, '20260725');
  eq('to', b.toDate, '20260804');
  eq('사유', /자동 갭 복구/.test(b.reason), 'true');

  console.log('\n[3-1] ★ 마지막 성공일은 반드시 "포함"해서 다시 조회 (다음날부터 X)');
  // 실사고 시나리오: 7/26 아침에 PC를 켜서 동기화(→ to_date=20260726 기록)하고 저녁에 껐다.
  // 그날 퇴근 펀치는 아직 MES에 없다. 27일부터 받으면 26일 퇴근시각이 영영 유실된다.
  var s26 = await resolve(Object.assign({}, base, { getState: state('20260726') }));
  eq('from = 마지막 성공일 그 자체', s26.fromDate, '20260726');
  eq('from ≠ 그 다음날', s26.fromDate === '20260727', 'false');
  eq('26일이 조회 범위에 포함', r.spanDays(s26.fromDate, s26.toDate) >= 1 && s26.fromDate <= '20260726', 'true');

  console.log('\n[4] 자동 갭 복구 — 최근에 성공했으면 확장하지 않음');
  var c = await resolve(Object.assign({}, base, { getState: state('20260803') }));
  eq('from (lookback 유지)', c.fromDate, '20260802');

  console.log('\n[5] 자동 갭 복구 OFF');
  var d = await resolve(Object.assign({}, base, { autoGapRecovery: false, getState: state('20260601') }));
  eq('from (확장 안 함)', d.fromDate, '20260802');

  console.log('\n[6] MES 응답 실패해도 기본 lookback으로 진행');
  var e = await resolve(Object.assign({}, base, { getState: noState }));
  eq('from', e.fromDate, '20260802');

  console.log('\n[7] 기간 지정');
  var f = await resolve(Object.assign({}, base, { getState: state('20260725') }), '20260726', '20260730');
  eq('from', f.fromDate, '20260726');
  eq('to', f.toDate, '20260730');
  eq('사유', f.reason, '기간 지정');

  console.log('\n[8] 기간 한쪽만 주면 무시하고 기본 동작');
  var g = await resolve(Object.assign({}, base, { getState: noState }), '20260726', null);
  eq('from', g.fromDate, '20260802');

  console.log('\n[9] 상한 클램프 — 126일 요청 → 60일');
  var h = await resolve(Object.assign({}, base, { getState: noState }), '20260401', '20260804');
  eq('from', h.fromDate, '20260606');
  eq('span', r.spanDays(h.fromDate, h.toDate), 60);

  console.log('\n[10] 자동 갭 복구도 상한을 넘지 않음 (1년 방치)');
  var i = await resolve(Object.assign({}, base, { getState: state('20250801') }));
  eq('span ≤ 60', r.spanDays(i.fromDate, i.toDate) <= 60, 'true');

  console.log('\n[11] 뒤집힌 기간은 교환');
  var j = await resolve(Object.assign({}, base, { getState: noState }), '20260730', '20260726');
  eq('from', j.fromDate, '20260726');
  eq('to', j.toDate, '20260730');

  console.log('\n[12] MES가 더 낮은 상한을 지시하면 그걸 따름');
  var k = await resolve(Object.assign({}, base, { getState: state('20250801', 10) }));
  eq('span ≤ 10', r.spanDays(k.fromDate, k.toDate) <= 10, 'true');

  console.log('\n─────────────────────────────');
  console.log(fail === 0 ? `전체 통과 (${pass}건)` : `실패 ${fail}건 / 통과 ${pass}건`);
  process.exit(fail === 0 ? 0 : 1);
}

function resolve(opts, from, to) {
  return r.resolveRange(opts, from, to);
}

main().catch(function (err) {
  console.error('테스트 실행 오류:', err);
  process.exit(1);
});
