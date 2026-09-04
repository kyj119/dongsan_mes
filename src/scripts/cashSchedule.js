// 자금계획 (Cash Schedule) 페이지

// Skeleton loading
(function() {
  var el = document.getElementById('schCalendarContainer');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.cards(6);
})();

var schCurrentYear = null;
var schCurrentMonth = null;
var schOverviewData = null;   // /schedule/overview 응답 전체 (달력·예측·월별·구성·Top)
var schCalendarData = null;   // = schOverviewData.calendar (일자 상세 모달이 참조)

function fmt(n) {
  return (n || 0).toLocaleString('ko-KR', { maximumFractionDigits: 0 });
}

// 하이브리드 엔진 항목 type → 한글 라벨 (달력 pill·일자 상세 공용)
var SCH_TYPE_LABELS = {
  ORDER: '입금예정', ORDER_EXPECTED: '예상입금',
  PURCHASE: '지급예정', PURCHASE_EXPECTED: '지급예상',
  CARD: '카드대금', CARD_EXPECTED: '카드대금',
  FIXED: '고정비', LOAN: '대출상환',
  PAYROLL: '급여', PAYROLL_TAX: '4대보험·원천세',
  TAX: '세금', OTHER: '기타'
};
function schTypeLabel(type) {
  return SCH_TYPE_LABELS[type] || type || '';
}

function fmtDate(d) {
  if (typeof d === 'string') return d;
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function parseDate(s) {
  var parts = s.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

// 초기화는 파일 맨 아래에서 실행 (window.* 함수 정의 이후)

// 계획 화면 전체(달력·예측·월별·구성·Top)를 한 번에 로드. 종전 3개 화면이 각각 부르던 무거운 엔진을 서버에서 접었다.
window.loadOverview = async function() {
  try {
    var y = schCurrentYear;
    var m = schCurrentMonth;
    var params = 'year=' + y + '&month=' + m;
    var daysEl = document.getElementById('fcDays');
    if (daysEl && daysEl.value) params += '&days=' + encodeURIComponent(daysEl.value);
    // 시작잔액: 비워두면 서버가 은행 실잔액을 쓴다. 사용자가 손으로 넣은 값만 넘긴다.
    var startEl = document.getElementById('fcStartBalance');
    if (startEl) {
      var raw = String(startEl.value || '').replace(/[^\d.-]/g, '');
      if (raw !== '') params += '&start_balance=' + encodeURIComponent(raw);
    }
    var res = await axios.get('/api/cash-flow/schedule/overview?' + params);
    if (!res.data.success) {
      showToast('자금계획 로드 실패', 'error');
      return;
    }
    schOverviewData = res.data.data;
    schCalendarData = schOverviewData.calendar;
    renderSchedule();
  } catch (e) {
    console.error('loadOverview error:', e);
    showToast('오류: ' + (e.response?.data?.error || e.message), 'error');
  }
};
// 기존 호출부(자동생성·연체체크·완료·삭제·저장) 호환 alias
window.loadSchedule = window.loadOverview;

function renderSchedule() {
  if (!schCalendarData) return;

  var d = schCalendarData;
  var y = d.year;
  var m = d.month;
  var days = d.days;
  var summary = d.summary;

  // 제목
  document.getElementById('schMonthLabel').textContent = y + '년 ' + m + '월';

  // KPI
  var netFlow = summary.in_total - summary.out_total;
  document.getElementById('schKpiInTotal').textContent = fmt(summary.in_total);
  document.getElementById('schKpiOutTotal').textContent = fmt(summary.out_total);
  document.getElementById('schKpiNetFlow').textContent = fmt(netFlow);
  document.getElementById('schKpiInDone').textContent = fmt(summary.in_done);

  // 연체 = 예정일이 지났는데 안 끝난 '물질화' 행. 서버(overview)가 같은 기준으로 세어 보내므로 그 값을 쓴다.
  // 날짜끼리 비교한다 — parseDate(dateStr)는 그날 00:00 이라 시각과 비교하면 **오늘 만기 건이 전부 연체**로 잡힌다.
  var todayStr = (schOverviewData && schOverviewData.today) || window.kstToday();
  document.getElementById('schKpiOverdue').textContent = (summary.overdue_count != null ? summary.overdue_count : 0);

  // 우측 통계 + 하단 전망 (overview 응답이 있을 때만 — 달력만 갱신되는 경로 대비)
  if (schOverviewData) {
    renderForecastPanel(schOverviewData.forecast, schOverviewData.carried);
    renderComposition(schOverviewData.composition);
    renderTopReceipts(schOverviewData.top_receipts);
    renderMonthlyOutlook(schOverviewData.monthly);
  }

  // 캘린더 그리드
  var firstDate = new Date(y, m - 1, 1);
  var firstDayOfWeek = firstDate.getDay();
  var lastDay = new Date(y, m, 0).getDate();

  var html = '';

  // 빈 셀 (이전 달)
  for (var i = 0; i < firstDayOfWeek; i++) {
    html += '<div class="p-1.5 text-[9px] h-24 bg-gray-50 rounded border border-gray-200"></div>';
  }

  // 날짜 셀
  for (var day = 1; day <= lastDay; day++) {
    var dateStr = y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    var dayData = days[dateStr];
    var inAmount = dayData.in_total;
    var outAmount = dayData.out_total;
    var itemCount = dayData.items.length;

    var isPast = dateStr < todayStr;   // 날짜 비교 — 오늘 셀이 '지남'으로 칠해지지 않게
    var isToday = dateStr === todayStr;
    var className = 'p-1.5 text-[9px] h-24 border rounded cursor-pointer transition-colors hover:bg-blue-50/50 ' +
      (isToday ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200 hover:border-blue-300');

    html += '<div class="' + className + '" onclick="schOpenDayDetail(\'' + dateStr + '\')">';
    html += '<div class="font-bold text-gray-700">' + day + '</div>';

    if (inAmount > 0) {
      html += '<div class="text-[8px] text-green-600 font-medium">입 ' + fmt(inAmount) + '</div>';
    }
    if (outAmount > 0) {
      html += '<div class="text-[8px] text-red-600 font-medium">출 ' + fmt(outAmount) + '</div>';
    }

    // 항목 피드백 (엔진 항목: flow/type, 추정치는 ~ 표시)
    if (itemCount > 0) {
      var items = dayData.items;
      var maxPills = 3;
      for (var j = 0; j < Math.min(maxPills, itemCount); j++) {
        var item = items[j];
        var pillClass = item.flow === 'IN' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700';
        html += '<span class="inline-block text-[7px] px-1 py-0.5 rounded ' + pillClass + ' mr-0.5 mt-0.5">' +
          schTypeLabel(item.type) + (item.estimated ? '~' : '') + '</span>';
      }
      if (itemCount > maxPills) {
        html += '<span class="text-[7px] text-gray-500">+' + (itemCount - maxPills) + '</span>';
      }
    }

    html += '</div>';
  }

  document.getElementById('schCalendarContainer').innerHTML = html;
}

// ============================================================
// 우측 통계 패널 · 하단 전망 (구 '추정자금일보'·'월별 요약' 탭을 한 화면으로 흡수)
// ============================================================

// 유형별 색 — 달력 pill/구성 스택바/범례가 같은 색을 쓴다.
var SCH_TYPE_COLORS = {
  ORDER: '#16a34a', ORDER_EXPECTED: '#86efac',
  PURCHASE: '#dc2626', PURCHASE_EXPECTED: '#fca5a5',
  CARD: '#f59e0b', CARD_EXPECTED: '#fcd34d',
  FIXED: '#8b5cf6', LOAN: '#0ea5e9',
  PAYROLL: '#ec4899', PAYROLL_TAX: '#f9a8d4',
  TAX: '#64748b', OTHER: '#94a3b8'
};
function schTypeColor(type) { return SCH_TYPE_COLORS[type] || '#94a3b8'; }

// 잔액 추이 스파크라인 — 외부 차트 라이브러리 없이 SVG로 직접 그린다(CSP상 CDN 사용 불가).
// preserveAspectRatio="none"으로 가로를 늘리므로 선 두께는 vector-effect로 고정한다.
function schSparklineSvg(series) {
  if (!series || series.length === 0) return '<div class="text-[10px] text-gray-400 text-center py-6">예측 데이터 없음</div>';
  var W = 300, H = 64;
  var vals = series.map(function(s) { return s.balance; });
  var min = Math.min.apply(null, vals);
  var max = Math.max.apply(null, vals);
  if (min > 0) min = 0;                 // 0선을 항상 보이게 — '얼마나 남았나'가 이 그래프의 요점
  var range = (max - min) || 1;
  var yOf = function(v) { return H - ((v - min) / range) * H; };
  var xOf = function(i) { return series.length > 1 ? (i / (series.length - 1)) * W : 0; };

  var pts = series.map(function(s, i) { return xOf(i).toFixed(1) + ',' + yOf(s.balance).toFixed(1); }).join(' ');
  var area = '0,' + yOf(min).toFixed(1) + ' ' + pts + ' ' + W + ',' + yOf(min).toFixed(1);
  var zeroY = yOf(0).toFixed(1);
  var hasRisk = min < 0;

  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" class="w-full" style="height:64px;display:block">';
  svg += '<polygon points="' + area + '" fill="' + (hasRisk ? 'rgba(37,99,235,0.10)' : 'rgba(37,99,235,0.14)') + '"/>';
  if (hasRisk) {
    // 0선 아래 = 잔고 부족 구간
    svg += '<rect x="0" y="' + zeroY + '" width="' + W + '" height="' + (H - zeroY).toFixed(1) + '" fill="rgba(220,38,38,0.07)"/>';
  }
  svg += '<line x1="0" y1="' + zeroY + '" x2="' + W + '" y2="' + zeroY + '" stroke="#dc2626" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" opacity="0.6"/>';
  svg += '<polyline points="' + pts + '" fill="none" stroke="#2563eb" stroke-width="1.5" vector-effect="non-scaling-stroke"/>';
  svg += '</svg>';
  return svg;
}

function renderForecastPanel(fc, carried) {
  if (!fc) return;
  var spark = document.getElementById('schBalanceSpark');
  if (spark) spark.innerHTML = schSparklineSvg(fc.series);

  var setTxt = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('schFcMin', fmt(fc.min_balance));
  setTxt('schFcRisk', fc.risk_days_count + '일');
  setTxt('schKpiMinDays', fc.days);
  setTxt('schKpiMinBalance', fmt(fc.min_balance));
  var minKpi = document.getElementById('schKpiMinBalance');
  if (minKpi) minKpi.className = 'text-lg font-bold tabular-nums ' + (fc.min_balance < 0 ? 'text-red-600' : 'text-gray-900');
  var minEl = document.getElementById('schFcMin');
  if (minEl) minEl.className = 'text-[11px] font-bold tabular-nums py-0.5 ' + (fc.min_balance < 0 ? 'text-red-600' : 'text-gray-900');

  // 시작잔액 input — 사용자가 손대지 않았으면 은행 실잔액을 채워 넣는다(직접 입력한 값은 건드리지 않음).
  var startEl = document.getElementById('fcStartBalance');
  if (startEl && String(startEl.value || '').replace(/[^\d.-]/g, '') === '') {
    startEl.value = fmt(fc.start_balance);
    startEl.title = '은행 실잔액 ' + fmt(fc.bank_balance) + '원(계좌 ' + fc.account_count + '개) 기준. 비우면 이 값으로 되돌아갑니다.';
  }

  // 연체 이월 안내 — 예측 첫날의 큰 숫자가 '오늘 들어온다'는 뜻이 아님을 밝힌다.
  var note = document.getElementById('schCarriedNote');
  if (note) {
    if (carried && carried.count > 0) {
      // 등록/자동을 나눠 적는다 — 연체 KPI는 '등록'만 세므로, 안 나누면 'KPI 0 · 안내 8건'이 모순으로 읽힌다.
      var mat = carried.materialized || 0;
      var auto = carried.count - mat;
      note.innerHTML = '<i class="fas fa-circle-exclamation mr-1"></i>기한이 지난 ' + carried.count + '건(등록 ' + mat +
        ' · 자동 ' + auto + ' · 입금 ' + fmt(carried.in) + ' · 지급 ' + fmt(carried.out) +
        ')을 예측 시작일에 얹었습니다. 달력에는 원래 예정일에 표시됩니다.';
      note.classList.remove('hidden');
    } else {
      note.classList.add('hidden');
    }
  }

  // 접이식: 음수 잔액 일자 / 일별 예측
  var riskEl = document.getElementById('fcRiskTable');
  if (riskEl) {
    var riskDays = fc.risk_days || [];
    if (riskDays.length === 0) {
      riskEl.innerHTML = '<div class="text-xs text-gray-400 text-center py-4">음수 잔액 일자가 없습니다.</div>';
    } else {
      var rh = '<table class="w-full text-xs" style="table-layout:fixed"><colgroup><col style="width:88px"><col></colgroup>' +
        '<thead><tr class="bg-gray-50"><th class="px-2 py-1.5 text-left text-gray-600">날짜</th>' +
        '<th class="px-2 py-1.5 text-right text-gray-600">잔액</th></tr></thead><tbody>';
      riskDays.forEach(function(row) {
        rh += '<tr class="border-b border-gray-100 hover:bg-red-50/30"><td class="px-2 py-1">' + row.date + '</td>' +
          '<td class="px-2 py-1 text-right font-medium text-red-600 tabular-nums">' + fmt(row.balance) + '</td></tr>';
      });
      riskEl.innerHTML = rh + '</tbody></table>';
    }
  }

  var fcEl = document.getElementById('fcForecastTable');
  if (fcEl) {
    var fh = '<table class="w-full text-xs" style="table-layout:fixed"><colgroup><col style="width:88px"><col><col><col><col></colgroup>' +
      '<thead><tr class="bg-gray-50">' +
      '<th class="px-2 py-1.5 text-left text-gray-600">날짜</th>' +
      '<th class="px-2 py-1.5 text-right text-gray-600">입금</th>' +
      '<th class="px-2 py-1.5 text-right text-gray-600">지급</th>' +
      '<th class="px-2 py-1.5 text-right text-gray-600">순이동</th>' +
      '<th class="px-2 py-1.5 text-right text-gray-600">잔액</th></tr></thead><tbody>';
    (fc.series || []).forEach(function(row) {
      fh += '<tr class="border-b border-gray-100 ' + (row.balance < 0 ? 'bg-red-50/30' : '') + '">' +
        '<td class="px-2 py-1">' + row.date + '</td>' +
        '<td class="px-2 py-1 text-right text-green-600 tabular-nums">' + fmt(row.in_amount) + '</td>' +
        '<td class="px-2 py-1 text-right text-red-600 tabular-nums">' + fmt(row.out_amount) + '</td>' +
        '<td class="px-2 py-1 text-right tabular-nums">' + fmt(row.net) + '</td>' +
        '<td class="px-2 py-1 text-right font-medium tabular-nums ' + (row.balance < 0 ? 'text-red-600' : 'text-gray-900') + '">' + fmt(row.balance) + '</td>' +
        '</tr>';
    });
    fcEl.innerHTML = fh + '</tbody></table>';
  }
}

// 이번달 입/출 구성 — 유형별 스택바 + 범례
function schCompositionBlock(title, byType, total, accentClass) {
  var entries = Object.keys(byType || {}).map(function(k) { return { type: k, amount: byType[k] }; })
    .filter(function(e) { return e.amount > 0; })
    .sort(function(a, b) { return b.amount - a.amount; });
  if (entries.length === 0) {
    return '<div class="text-[11px] text-gray-500 mb-1">' + title + '</div>' +
      '<div class="text-[10px] text-gray-400 py-1">항목 없음</div>';
  }
  var sum = total || entries.reduce(function(s, e) { return s + e.amount; }, 0) || 1;
  var bar = '<div class="flex h-2.5 rounded overflow-hidden bg-gray-100">';
  entries.forEach(function(e) {
    var pct = (e.amount / sum) * 100;
    bar += '<div style="width:' + pct.toFixed(2) + '%;background:' + schTypeColor(e.type) + '" title="' +
      escapeHtml(schTypeLabel(e.type)) + ' ' + fmt(e.amount) + '"></div>';
  });
  bar += '</div>';
  var legend = '<div class="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-1.5">';
  entries.forEach(function(e) {
    legend += '<div class="flex items-center gap-1 text-[10px]">' +
      '<span class="inline-block w-2 h-2 rounded-sm flex-shrink-0" style="background:' + schTypeColor(e.type) + '"></span>' +
      '<span class="text-gray-600 truncate">' + escapeHtml(schTypeLabel(e.type)) + '</span>' +
      '<span class="ml-auto tabular-nums text-gray-700">' + fmt(e.amount) + '</span></div>';
  });
  legend += '</div>';
  return '<div class="flex items-baseline justify-between mb-1"><span class="text-[11px] ' + accentClass + '">' + title + '</span>' +
    '<span class="text-[11px] font-bold tabular-nums text-gray-900">' + fmt(sum) + '</span></div>' + bar + legend;
}

function renderComposition(comp) {
  var inEl = document.getElementById('schCompIn');
  var outEl = document.getElementById('schCompOut');
  if (!comp) return;
  if (inEl) inEl.innerHTML = schCompositionBlock('입금', comp.in, 0, 'text-green-600 font-medium');
  if (outEl) outEl.innerHTML = schCompositionBlock('지출', comp.out, 0, 'text-red-600 font-medium');
}

// 예상수금 Top — 근거 배지로 '확정 미수'와 '미청구 추정'을 구분한다(합성 근거가 화면에서 안 보이던 문제).
function renderTopReceipts(list) {
  var el = document.getElementById('schTopReceipts');
  if (!el) return;
  if (!list || list.length === 0) {
    el.innerHTML = '<div class="text-[10px] text-gray-400 py-2 text-center">이번달 예상 수금이 없습니다.</div>';
    return;
  }
  var html = '';
  list.forEach(function(it) {
    var badge, badgeClass;
    if (it.materialized) { badge = '등록'; badgeClass = 'bg-blue-50 text-blue-700'; }
    else if (it.basis === 'BILLED') { badge = '확정미수'; badgeClass = 'bg-emerald-50 text-emerald-700'; }
    else if (it.basis === 'UNBILLED') { badge = '미청구'; badgeClass = 'bg-amber-50 text-amber-700'; }
    else { badge = '추정'; badgeClass = 'bg-purple-50 text-purple-700'; }
    html += '<div class="flex items-center gap-1.5 text-[10px] border-b border-gray-50 pb-1">' +
      '<span class="text-gray-400 tabular-nums flex-shrink-0">' + it.date.substring(5) + '</span>' +
      '<span class="truncate text-gray-700 flex-1" title="' + escapeHtml(it.name) + '">' + escapeHtml(it.name) + '</span>' +
      '<span class="px-1 py-0.5 rounded ' + badgeClass + ' flex-shrink-0">' + badge + '</span>' +
      '<span class="tabular-nums font-medium text-gray-900 flex-shrink-0">' + fmt(it.amount) + '</span>' +
      '</div>';
  });
  el.innerHTML = html;
}

// 6개월 전망 — 구 '월별 요약' 탭의 차트/표. 당월 값은 서버가 달력과 같은 소스로 맞춰 보낸다.
function renderMonthlyOutlook(data) {
  if (!data) return;
  var maxVal = 1;
  data.forEach(function(d) { maxVal = Math.max(maxVal, d.in, d.out); });

  var chartEl = document.getElementById('monthlyChart');
  if (chartEl) chartEl.innerHTML = data.map(function(d) {
    var inPct = Math.round((d.in / maxVal) * 100);
    var outPct = Math.round((d.out / maxVal) * 100);
    return '<div class="flex items-center gap-2 text-xs">'
      + '<span class="w-16 text-gray-600">' + d.month + '</span>'
      + '<div class="flex-1">'
      + '<div class="flex items-center gap-1 mb-0.5"><span class="w-8 text-green-600">수입</span><div class="flex-1 h-3 bg-gray-100 rounded-full"><div class="h-full bg-green-500 rounded-full" style="width:' + inPct + '%"></div></div><span class="w-24 text-right tabular-nums">' + fmt(d.in) + '</span></div>'
      + '<div class="flex items-center gap-1"><span class="w-8 text-red-600">지출</span><div class="flex-1 h-3 bg-gray-100 rounded-full"><div class="h-full bg-red-400 rounded-full" style="width:' + outPct + '%"></div></div><span class="w-24 text-right tabular-nums">' + fmt(d.out) + '</span></div>'
      + '</div></div>';
  }).join('');

  var tableEl = document.getElementById('monthlyTable');
  if (tableEl) tableEl.innerHTML = data.map(function(d) {
    var netClass = d.net >= 0 ? 'text-green-600' : 'text-red-600';
    var cumClass = d.cumulative >= 0 ? 'text-green-600' : 'text-red-600';
    return '<tr class="border-b hover:bg-gray-50">'
      + '<td class="px-3 py-2 font-medium">' + d.month + '</td>'
      + '<td class="px-3 py-2 text-right text-green-600 tabular-nums">' + fmt(d.in) + '</td>'
      + '<td class="px-3 py-2 text-right text-red-600 tabular-nums">' + fmt(d.out) + '</td>'
      + '<td class="px-3 py-2 text-right font-bold tabular-nums ' + netClass + '">' + fmt(d.net) + '</td>'
      + '<td class="px-3 py-2 text-right tabular-nums ' + cumClass + '">' + fmt(d.cumulative) + '</td>'
      + '</tr>';
  }).join('');
}

// #363: 현재 월 자금일정 CSV 내보내기 (서버 엔드포인트 — 일관성 패턴)
window.exportCashScheduleCsv = async function() {
  try {
    var y = schCurrentYear;
    var m = schCurrentMonth;
    if (!y || !m) { showToast('내보낼 기간이 없습니다', 'info'); return; }
    var from = y + '-' + String(m).padStart(2, '0') + '-01';
    var lastDay = new Date(y, m, 0).getDate();
    var to = y + '-' + String(m).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
    var params = new URLSearchParams();
    params.set('from', from);
    params.set('to', to);
    var res = await authFetch('/api/cash-flow/schedule/export/csv?' + params.toString());
    if (!res.ok) throw new Error('서버 오류');
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '자금계획_' + (window.kstToday ? window.kstToday() : new Date().toISOString().slice(0, 10)) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  } catch(e) {
    showToast('CSV 내보내기 실패: ' + e.message, 'error');
  }
};
// 기존 버튼 호환 alias
window.schExportCSV = window.exportCashScheduleCsv;

window.schPrevMonth = function() {
  schCurrentMonth--;
  if (schCurrentMonth < 1) {
    schCurrentMonth = 12;
    schCurrentYear--;
  }
  loadSchedule();
};

window.schNextMonth = function() {
  schCurrentMonth++;
  if (schCurrentMonth > 12) {
    schCurrentMonth = 1;
    schCurrentYear++;
  }
  loadSchedule();
};

window.schToday = function() {
  var today = new Date();
  schCurrentYear = today.getFullYear();
  schCurrentMonth = today.getMonth() + 1;
  loadSchedule();
};

window.schAutoGenerate = async function() {
  if (!(await showConfirm('주문/발주/고정비에서 자금 예정을 자동 생성하시겠습니까?'))) return;
  try {
    var res = await axios.post('/api/cash-flow/schedule/auto-generate');
    if (res.data.success) {
      showToast('자동 생성 완료', 'success');
      loadSchedule();
    } else {
      showToast('실패: ' + res.data.error, 'error');
    }
  } catch (e) {
    showToast('오류: ' + (e.response?.data?.error || e.message), 'error');
  }
};

window.schCheckOverdue = async function() {
  try {
    var res = await axios.post('/api/cash-flow/schedule/check-overdue');
    if (res.data.success) {
      var data = res.data.data;
      showToast('연체 ' + data.overdue_count + '건 / 기한 준수 ' + data.on_time_count + '건', 'success');
      loadSchedule();
    } else {
      showToast('실패: ' + res.data.error, 'error');
    }
  } catch (e) {
    showToast('오류: ' + (e.response?.data?.error || e.message), 'error');
  }
};

// 일자 상세 — 달력 데이터(하이브리드 엔진 항목) 기반. 물질화 행만 완료/삭제 가능, 온더플라이는 표시 전용.
var schDetailDate = null;

window.schOpenDayDetail = function(dateStr) {
  if (!schCalendarData || !schCalendarData.days || !schCalendarData.days[dateStr]) return;
  schDetailDate = dateStr;
  var items = schCalendarData.days[dateStr].items || [];
  var d = parseDate(dateStr);
  var dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];

  document.getElementById('schDayModalTitle').textContent =
    dateStr + ' (' + dayOfWeek + ') - ' + items.length + '건';

  var html = '';
  if (items.length === 0) {
    html = '<div class="text-sm text-gray-400 text-center py-4">데이터가 없습니다.</div>';
  } else {
    items.forEach(function(it) {
      var typeClass = it.flow === 'IN' ? 'text-green-600' : 'text-red-600';
      var statusBadge;
      if (it.materialized) {
        statusBadge = it.status === 'DONE' ?
          '<span class="inline-flex items-center text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded"><i class="fas fa-check-circle text-[7px] mr-0.5"></i>완료</span>' :
          '<span class="inline-flex items-center text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded"><i class="far fa-clock text-[7px] mr-0.5"></i>대기</span>';
      } else {
        statusBadge = it.estimated ?
          '<span class="inline-flex items-center text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded"><i class="fas fa-wand-magic-sparkles text-[7px] mr-0.5"></i>추정</span>' :
          '<span class="inline-flex items-center text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded"><i class="fas fa-bolt text-[7px] mr-0.5"></i>자동</span>';
      }

      html += '<div class="p-2 border rounded bg-gray-50 space-y-1">';
      html += '<div class="flex justify-between items-start">';
      html += '<div class="text-xs font-medium">' + schTypeLabel(it.type) + ' <span class="' + typeClass + '">' + (it.flow === 'IN' ? '입금' : '지급') + '</span></div>';
      html += '<div>' + statusBadge + '</div>';
      html += '</div>';
      html += '<div class="text-[11px] text-gray-600">' + escapeHtml(it.name || '-') + '</div>';
      html += '<div class="text-sm font-bold tabular-nums text-gray-900">' + fmt(it.amount) + '</div>';
      if (it.materialized && it.schedule_id) {
        html += '<div class="flex gap-1 pt-1">';
        if (it.status !== 'DONE') {
          html += '<button onclick="schCompleteItem(' + it.schedule_id + ')" class="px-2 py-0.5 text-[10px] bg-green-600 text-white rounded hover:bg-green-700">완료</button>';
          // '수정' 버튼 제거: schEditItem 미구현(ReferenceError 유발)이라 제거. 수정 필요 시 삭제 후 재등록.
        }
        html += '<button onclick="schDeleteItem(' + it.schedule_id + ')" class="px-2 py-0.5 text-[10px] border border-red-300 text-red-700 rounded hover:bg-red-50">삭제</button>';
        html += '</div>';
      }
      html += '</div>';
    });
  }

  document.getElementById('schDayModalContent').innerHTML = html;
  document.getElementById('schDayModal').classList.remove('hidden');
};

window.schCloseDayDetail = function() {
  document.getElementById('schDayModal').classList.add('hidden');
};

window.schCompleteItem = async function(id) {
  if (!(await showConfirm('완료 처리하시겠습니까?'))) return;
  try {
    var today = fmtDate(new Date());
    var res = await axios.patch('/api/cash-flow/schedule/' + id + '/complete', {
      actual_date: today,
      actual_amount: null
    });
    if (res.data.success) {
      showToast('완료 처리되었습니다.', 'success');
      await loadSchedule();
      if (schDetailDate) schOpenDayDetail(schDetailDate);
    } else {
      showToast('실패: ' + res.data.error, 'error');
    }
  } catch (e) {
    showToast('오류: ' + (e.response?.data?.error || e.message), 'error');
  }
};

window.schDeleteItem = async function(id) {
  if (!(await showConfirm('삭제하시겠습니까?', { danger: true }))) return;
  try {
    var res = await axios.delete('/api/cash-flow/schedule/' + id);
    if (res.data.success) {
      showToast('삭제되었습니다.', 'success');
      schCloseDayDetail();
      loadSchedule();
    } else {
      showToast('실패: ' + res.data.error, 'error');
    }
  } catch (e) {
    showToast('오류: ' + (e.response?.data?.error || e.message), 'error');
  }
};

window.schOpenAddModal = function() {
  // toISOString 은 UTC — KST 00:00~09:00 에 열면 전날이 채워진다. 업무일은 window.kstToday()가 정본.
  document.getElementById('schAddDate').value = window.kstToday();
  document.getElementById('schAddType').value = 'IN';
  document.getElementById('schAddSource').value = 'ORDER';
  document.getElementById('schAddAmount').value = '';
  document.getElementById('schAddDesc').value = '';
  var cs = document.getElementById('schAddClientSearch'); if (cs) cs.value = '';
  var ci = document.getElementById('schAddClientId'); if (ci) ci.value = '';
  var cd = document.getElementById('schAddClientDropdown'); if (cd) cd.classList.add('hidden');
  clearErrors();
  document.getElementById('schAddModal').classList.remove('hidden');
};

window.schCloseAddModal = function() {
  document.getElementById('schAddModal').classList.add('hidden');
  var cd = document.getElementById('schAddClientDropdown'); if (cd) cd.classList.add('hidden');
};

// 거래처 검색 autocomplete (디바운스) — bank.js 패턴, sch* prefix(?raw 전역스코프 충돌 방지)
var schClientTimer = null;
window.schSearchClient = function(query) {
  var dropdown = document.getElementById('schAddClientDropdown');
  if (!dropdown) return;
  // 입력이 비면 선택 해제 + 드롭다운 닫기
  if (!query || !query.trim()) {
    var ci0 = document.getElementById('schAddClientId'); if (ci0) ci0.value = '';
    dropdown.classList.add('hidden');
    return;
  }
  if (schClientTimer) clearTimeout(schClientTimer);
  schClientTimer = setTimeout(function() {
    axios.get('/api/cash-flow/clients/search?q=' + encodeURIComponent(query)).then(function(r) {
      var items = (r.data && r.data.data) || [];
      if (!items.length) {
        dropdown.innerHTML = '<div class="px-3 py-2 text-xs text-gray-400">검색 결과 없음</div>';
        dropdown.classList.remove('hidden');
        return;
      }
      var html = '';
      items.forEach(function(cl) {
        var safe = escapeHtml(cl.client_name || '');
        var rep = cl.representative ? ' <span class="text-gray-400 text-xs">(' + escapeHtml(cl.representative) + ')</span>' : '';
        html += '<div class="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-50" onclick="schSelectClient(' + cl.id + ',\'' + escapeJsAttr(cl.client_name || '') + '\')">';
        html += '<span class="font-medium">' + safe + '</span>' + rep + '</div>';
      });
      dropdown.innerHTML = html;
      dropdown.classList.remove('hidden');
    }).catch(function() { dropdown.classList.add('hidden'); });
  }, 200);
};

window.schSelectClient = function(clientId, clientName) {
  var cs = document.getElementById('schAddClientSearch'); if (cs) cs.value = clientName;
  var ci = document.getElementById('schAddClientId'); if (ci) ci.value = clientId;
  var cd = document.getElementById('schAddClientDropdown'); if (cd) cd.classList.add('hidden');
};

// 드롭다운 외부 클릭 시 닫기
document.addEventListener('click', function(e) {
  var t = e.target;
  if (t && t.closest && !t.closest('#schAddClientSearch') && !t.closest('#schAddClientDropdown')) {
    var cd = document.getElementById('schAddClientDropdown');
    if (cd && !cd.classList.contains('hidden')) cd.classList.add('hidden');
  }
});

function clearErrors() {
  document.getElementById('schAddDateErr').textContent = '';
  document.getElementById('schAddAmountErr').textContent = '';
}

window.schSave = async function() {
  clearErrors();
  var date = document.getElementById('schAddDate').value;
  var type = document.getElementById('schAddType').value;
  var source = document.getElementById('schAddSource').value;
  var amount = (window.parseMoney ? window.parseMoney(document.getElementById('schAddAmount').value) : parseInt(String(document.getElementById('schAddAmount').value || '').replace(/[^\d.-]/g, ''))) || 0;
  var desc = document.getElementById('schAddDesc').value;

  if (!date) { showFieldError('schAddDate', '필수 입력'); return; }
  if (amount <= 0) { showFieldError('schAddAmount', '0보다 큰 금액 입력'); return; }

  try {
    var res = await axios.post('/api/cash-flow/schedule', {
      schedule_date: date,
      flow_type: type,
      source_type: source,
      amount: amount,
      description: desc || null,
      client_id: (document.getElementById('schAddClientId') && document.getElementById('schAddClientId').value) || null
    });
    if (res.data.success) {
      showToast('예정이 등록되었습니다.', 'success');
      schCloseAddModal();
      loadSchedule();
    } else {
      showToast('실패: ' + res.data.error, 'error');
    }
  } catch (e) {
    showToast('오류: ' + (e.response?.data?.error || e.message), 'error');
  }
};

window.switchScheduleTab = function(tab) {
  // schedule(자금계획=달력+통계 한 화면) | fixed(고정비) | loans(대출)
  //   구 'monthly'(월별요약)·'forecast'(추정자금일보) 탭은 schedule 화면에 흡수됐다.
  //   외부(bank.js·bank.ts)가 hubGoto('plan','fixed'|'loans')로 부르므로 이 둘은 유지한다.
  if (tab === 'monthly' || tab === 'forecast') tab = 'schedule';   // 구 링크·북마크 호환
  ['schedule', 'fixed', 'loans'].forEach(function(t) {
    var btn = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
    var panel = document.getElementById(t + 'Panel');
    if (!btn || !panel) { console.warn('[cashSchedule] tab nodes not found:', t); return; }
    if (t === tab) {
      btn.className = 'px-4 py-2 text-sm font-medium border-b-2 border-blue-600 text-blue-600 flex items-center gap-2';
      panel.classList.remove('hidden');
      if (t === 'fixed' && window.loadFixedExpenses) window.loadFixedExpenses();
      if (t === 'loans' && window.loadLoans) window.loadLoans();
    } else {
      btn.className = 'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center gap-2';
      panel.classList.add('hidden');
    }
  });
};

// showToast, showFieldError는 layout.ts의 SHARED_AUTH_JS에서 전역으로 제공됨
// 로컬 fallback 정의하면 호이스팅으로 window.showToast를 덮어써서 무한 재귀 발생 → 정의하지 말 것

// ============================================================
// 초기화 (모든 window.* 함수 정의 이후 실행)
// ============================================================
(function init() {
  var today = new Date();
  schCurrentYear = today.getFullYear();
  schCurrentMonth = today.getMonth() + 1;
  var addDateEl = document.getElementById('schAddDate');
  if (addDateEl) addDateEl.value = window.kstToday();   // UTC 슬라이스 금지(오전 전날로 밀림)
  window.loadOverview();
})();
