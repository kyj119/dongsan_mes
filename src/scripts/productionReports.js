// ── 시간 포맷 헬퍼 ──
function formatDuration(sec) {
  if (!sec || sec <= 0) return '-';
  sec = Math.round(sec);
  if (sec < 60) return sec + '초';
  if (sec < 3600) return Math.floor(sec / 60) + '분 ' + (sec % 60) + '초';
  return Math.floor(sec / 3600) + '시간 ' + Math.floor((sec % 3600) / 60) + '분';
}

function formatHours(hours) {
  if (!hours || hours <= 0) return '-';
  if (hours < 1) return Math.round(hours * 60) + '분';
  return Number(hours).toFixed(1) + '시간';
}

var statusLabels = { PRINT_PENDING: '대기', PRINTING: '인쇄중', PRINT_DONE: '인쇄완료', HOLD: '보류' };
var statusColors = { PRINT_PENDING: 'text-amber-600', PRINTING: 'text-blue-600', PRINT_DONE: 'text-green-600', HOLD: 'text-red-600' };

// ── 바 차트 헬퍼 ──
function renderBar(value, maxVal, label, color) {
  var pct = maxVal > 0 ? Math.round((value / maxVal) * 100) : 0;
  return '<div class="flex items-center gap-2 text-[11px]">'
    + '<span class="w-20 text-gray-600 text-right truncate" title="' + escapeHtml(label) + '">' + escapeHtml(label) + '</span>'
    + '<div class="flex-1 bg-gray-100 rounded-full h-4">'
    + '<div class="' + color + ' h-4 rounded-full flex items-center justify-end pr-1.5 text-[10px] text-white font-medium" style="width: ' + Math.max(pct, 8) + '%">' + value + '</div>'
    + '</div>'
    + '</div>';
}

// ════════════════════════════════════════════════════════════
// 상위 탭 전환: 'daily' | 'period'
// ════════════════════════════════════════════════════════════
var currentMainTab = 'daily';

function switchMainTab(tab) {
  currentMainTab = tab;
  var dailyPanel = document.getElementById('mainPanelDaily');
  var periodPanel = document.getElementById('mainPanelPeriod');
  var dailyBtn = document.getElementById('mainTabDaily');
  var periodBtn = document.getElementById('mainTabPeriod');

  if (tab === 'daily') {
    dailyPanel.classList.remove('hidden');
    periodPanel.classList.add('hidden');
    dailyBtn.classList.remove('border-transparent', 'text-gray-500');
    dailyBtn.classList.add('border-blue-500', 'text-blue-600');
    periodBtn.classList.remove('border-blue-500', 'text-blue-600');
    periodBtn.classList.add('border-transparent', 'text-gray-500');
    loadDailySummary();
  } else {
    periodPanel.classList.remove('hidden');
    dailyPanel.classList.add('hidden');
    periodBtn.classList.remove('border-transparent', 'text-gray-500');
    periodBtn.classList.add('border-blue-500', 'text-blue-600');
    dailyBtn.classList.remove('border-blue-500', 'text-blue-600');
    dailyBtn.classList.add('border-transparent', 'text-gray-500');
    loadCurrentTab();
  }
}

// ════════════════════════════════════════════════════════════
// 일일 생산 탭
// ════════════════════════════════════════════════════════════
function getToday() {
  return new Date().toISOString().substring(0, 10);
}

function setToday() {
  document.getElementById('reportDate').value = getToday();
  loadDailySummary();
}

function changeDailyDate(delta) {
  var input = document.getElementById('reportDate');
  var d = new Date(input.value);
  d.setDate(d.getDate() + delta);
  input.value = d.toISOString().substring(0, 10);
  loadDailySummary();
}

async function loadDailySummary() {
  var date = document.getElementById('reportDate').value;
  if (!date) return;

  try {
    var res = await axios.get('/api/production-reports/daily-summary', { params: { date: date } });
    if (!res.data.success) return;
    var d = res.data.data;

    // KPI
    document.getElementById('kpiPrints').textContent = d.ok_count;
    document.getElementById('kpiOk').textContent = d.ok_count;
    document.getElementById('kpiError').textContent = d.error_count + d.cancel_count;
    document.getElementById('kpiSqm').textContent = (d.total_sqm || 0).toLocaleString(undefined, {maximumFractionDigits:1});
    document.getElementById('kpiRate').textContent = (d.completion_rate || 0) + '%';
    var equipArr = d.by_equipment || [];
    var overdueArr = d.overdue_orders || d.overdue || [];
    if (document.getElementById('kpiCardDone')) document.getElementById('kpiCardDone').textContent = d.card_completed || 0;
    if (document.getElementById('kpiCardTotal')) document.getElementById('kpiCardTotal').textContent = d.card_total || 0;
    if (document.getElementById('kpiEquipCount')) document.getElementById('kpiEquipCount').textContent = equipArr.length;
    if (document.getElementById('kpiOverdue')) document.getElementById('kpiOverdue').textContent = overdueArr.length;

    // 장비별 테이블
    renderEquipmentTable(equipArr);

    // 시간대별 차트
    renderHourlyChart(d.by_hour || []);

    // 미완료 주문
    renderOverdueTable(overdueArr);

  } catch (err) {
    console.error('일일 리포트 로딩 실패:', err);
  }
}

function renderEquipmentTable(data) {
  var el = document.getElementById('equipmentTable');
  if (!data || data.length === 0) {
    el.innerHTML = '<div class="text-center py-4 text-gray-400 text-sm">출력 데이터 없음</div>';
    return;
  }

  var totalSqm = 0;
  data.forEach(function(e) { totalSqm += (e.sqm || 0); });

  var html = '<table class="w-full text-sm">';
  html += '<thead class="bg-gray-50"><tr>';
  html += '<th class="px-3 py-2 text-left text-xs font-semibold text-gray-600">장비</th>';
  html += '<th class="px-3 py-2 text-right text-xs font-semibold text-gray-600">건수</th>';
  html += '<th class="px-3 py-2 text-right text-xs font-semibold text-gray-600">면적(㎡)</th>';
  html += '<th class="px-3 py-2 text-right text-xs font-semibold text-gray-600">비율</th>';
  html += '<th class="px-3 py-2 text-left text-xs font-semibold text-gray-600">OK/에러</th>';
  html += '</tr></thead><tbody class="divide-y">';

  data.forEach(function(e) {
    var pct = totalSqm > 0 ? Math.round((e.sqm || 0) / totalSqm * 100) : 0;
    html += '<tr class="hover:bg-gray-50">';
    html += '<td class="px-3 py-2 font-medium">' + e.equipment_name + '</td>';
    html += '<td class="px-3 py-2 text-right">' + e.total + '</td>';
    html += '<td class="px-3 py-2 text-right font-medium">' + (e.sqm || 0).toLocaleString(undefined, {maximumFractionDigits:1}) + '</td>';
    html += '<td class="px-3 py-2 text-right">';
    html += '<div class="flex items-center justify-end gap-1">';
    html += '<div class="w-16 bg-gray-200 rounded-full h-2"><div class="bg-blue-600 h-2 rounded-full" style="width:' + pct + '%"></div></div>';
    html += '<span class="text-xs text-gray-500 w-8 text-right">' + pct + '%</span>';
    html += '</div></td>';
    html += '<td class="px-3 py-2"><span class="text-green-600">' + e.ok + '</span>';
    if (e.error > 0) html += ' / <span class="text-red-500">' + e.error + '</span>';
    html += '</td>';
    html += '</tr>';
  });

  html += '</tbody></table>';
  el.innerHTML = html;
}

function renderHourlyChart(data) {
  var el = document.getElementById('hourlyChart');
  if (!data || data.length === 0) {
    el.innerHTML = '<div class="text-center py-4 text-gray-400 text-sm">출력 데이터 없음</div>';
    return;
  }

  // 7시~20시 범위
  var hours = [];
  for (var h = 7; h <= 20; h++) hours.push(h);

  var hourMap = {};
  data.forEach(function(d) { hourMap[d.hour] = d; });

  var maxSqm = 0;
  hours.forEach(function(h) {
    var sqm = hourMap[h] ? hourMap[h].sqm : 0;
    if (sqm > maxSqm) maxSqm = sqm;
  });

  var html = '<div class="flex items-end gap-1" style="height:200px;">';
  hours.forEach(function(h) {
    var d = hourMap[h] || { count: 0, sqm: 0 };
    var pct = maxSqm > 0 ? Math.round(d.sqm / maxSqm * 100) : 0;
    var barH = Math.max(pct, d.count > 0 ? 5 : 0);

    html += '<div class="flex-1 flex flex-col items-center">';
    html += '<div class="text-xs text-gray-500 mb-1">' + (d.sqm > 0 ? d.sqm.toFixed(0) : '') + '</div>';
    html += '<div class="w-full bg-blue-500 rounded-t" style="height:' + barH + '%" title="' + h + '시: ' + d.count + '건 / ' + d.sqm + '㎡"></div>';
    html += '<div class="text-xs text-gray-400 mt-1">' + h + '</div>';
    html += '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

function renderOverdueTable(data) {
  var el = document.getElementById('overdueTable');
  if (!data || data.length === 0) {
    el.innerHTML = '<div class="text-center py-4 text-green-600 text-sm"><i class="fas fa-check-circle mr-1"></i> 미완료 주문 없음</div>';
    return;
  }

  var html = '<table class="w-full text-sm">';
  html += '<thead class="bg-gray-50"><tr>';
  html += '<th class="px-3 py-2 text-left text-xs font-semibold text-gray-600">주문번호</th>';
  html += '<th class="px-3 py-2 text-left text-xs font-semibold text-gray-600">거래처</th>';
  html += '<th class="px-3 py-2 text-left text-xs font-semibold text-gray-600">마감일</th>';
  html += '<th class="px-3 py-2 text-left text-xs font-semibold text-gray-600">상태</th>';
  html += '<th class="px-3 py-2 text-right text-xs font-semibold text-gray-600">품목 수</th>';
  html += '</tr></thead><tbody class="divide-y">';

  data.forEach(function(o) {
    var todayStr = new Date().toISOString().substring(0, 10);
    var isOverdue = o.due_date < todayStr;
    var statusColor = isOverdue ? 'text-red-600 font-bold' : 'text-amber-600';

    html += '<tr class="hover:bg-gray-50">';
    html += '<td class="px-3 py-2"><a href="/orders?search=' + o.order_number + '" class="text-blue-600 hover:underline">' + o.order_number + '</a></td>';
    html += '<td class="px-3 py-2">' + (o.client_name || '-') + '</td>';
    html += '<td class="px-3 py-2 ' + statusColor + '">' + o.due_date + (isOverdue ? ' (지연)' : '') + '</td>';
    html += '<td class="px-3 py-2">' + o.status + '</td>';
    html += '<td class="px-3 py-2 text-right">' + o.item_count + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table>';
  el.innerHTML = html;
}

// ════════════════════════════════════════════════════════════
// 기간 분석 탭
// ════════════════════════════════════════════════════════════
var currentReportTab = 'production';

// ── 기간 초기화 ──
(function() {
  var today = new Date();
  var thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
  var fromEl = document.getElementById('dateFrom');
  var toEl = document.getElementById('dateTo');
  if (fromEl) fromEl.value = thirtyDaysAgo.toISOString().substring(0, 10);
  if (toEl) toEl.value = today.toISOString().substring(0, 10);
})();

// ── 탭 전환 ──
function switchReportTab(tab) {
  currentReportTab = tab;
  var tabs = ['production', 'postprocess', 'uptime', 'defects', 'consumption', 'duration', 'dwelltime'];
  tabs.forEach(function(t) {
    var panel = document.getElementById('panel' + t.charAt(0).toUpperCase() + t.slice(1));
    if (panel) panel.classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('.report-tab').forEach(function(btn) {
    btn.classList.remove('bg-white', 'shadow', 'text-gray-800');
    btn.classList.add('text-gray-500');
  });
  var tabId = 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1);
  var activeBtn = document.getElementById(tabId);
  if (activeBtn) {
    activeBtn.classList.add('bg-white', 'shadow', 'text-gray-800');
    activeBtn.classList.remove('text-gray-500');
  }
  loadCurrentTab();
}

function getDateParams() {
  return 'from=' + document.getElementById('dateFrom').value + '&to=' + document.getElementById('dateTo').value;
}

function loadCurrentTab() {
  if (currentReportTab === 'production') loadProduction();
  else if (currentReportTab === 'postprocess') loadPostProcessing();
  else if (currentReportTab === 'uptime') loadUptime();
  else if (currentReportTab === 'defects') loadDefects();
  else if (currentReportTab === 'consumption') loadConsumption();
  else if (currentReportTab === 'duration') loadPrintDuration();
  else if (currentReportTab === 'dwelltime') loadCardDwellTime();
}

// ── 생산 실적 ──
async function loadProduction() {
  try {
    var res = await axios.get('/api/production-reports/production?' + getDateParams());
    if (!res.data.success) return;
    var d = res.data.data;
    var t = d.totals || {};
    document.getElementById('prodTotal').textContent = (t.total_prints || 0).toLocaleString();
    document.getElementById('prodOk').textContent = (t.ok_count || 0).toLocaleString();
    document.getElementById('prodError').textContent = ((t.error_count || 0) + (t.cancel_count || 0)).toLocaleString();
    document.getElementById('prodCards').textContent = (t.card_count || 0).toLocaleString();

    // 장비별
    var equipData = d.by_equipment || [];
    var maxOk = equipData.length > 0 ? Math.max.apply(null, equipData.map(function(e) { return e.ok_count; })) : 1;
    var equipHtml = equipData.length === 0 ? '<div class="text-center text-gray-400 text-sm py-4">데이터 없음</div>' : '';
    equipData.forEach(function(eq) {
      var errRate = eq.total > 0 ? Math.round((eq.error_count + eq.cancel_count) / eq.total * 100) : 0;
      equipHtml += '<div class="flex items-center gap-2 text-[11px]">'
        + '<span class="w-20 text-gray-600 text-right truncate" title="' + escapeHtml(eq.equipment_name) + '">' + escapeHtml(eq.equipment_name) + '</span>'
        + '<div class="flex-1 bg-gray-100 rounded-full h-5">'
        + '<div class="bg-blue-500 h-5 rounded-full flex items-center justify-end pr-1.5 text-[10px] text-white font-medium" style="width: ' + Math.max(Math.round(eq.ok_count / maxOk * 100), 8) + '%">'
        + eq.ok_count + '건</div></div>'
        + (errRate > 0 ? '<span class="text-red-500 w-10 text-right">' + errRate + '%</span>' : '<span class="text-gray-300 w-10 text-right">0%</span>')
        + '</div>';
    });
    document.getElementById('prodByEquipment').innerHTML = equipHtml;

    // 구역별
    var zoneData = d.by_zone || [];
    var maxZone = zoneData.length > 0 ? Math.max.apply(null, zoneData.map(function(z) { return z.ok_count; })) : 1;
    var zoneHtml = zoneData.length === 0 ? '<div class="text-center text-gray-400 text-sm py-4">데이터 없음</div>' : '';
    zoneData.forEach(function(z) {
      zoneHtml += renderBar(z.ok_count, maxZone, z.zone, 'bg-green-500');
    });
    document.getElementById('prodByZone').innerHTML = zoneHtml;

    // 일별 추이
    var dailyData = d.daily || [];
    var maxDaily = dailyData.length > 0 ? Math.max.apply(null, dailyData.map(function(dd) { return dd.ok_count; })) : 1;
    var dailyHtml = dailyData.length === 0 ? '<div class="text-center text-gray-400 text-sm py-4">데이터 없음</div>' : '';
    dailyData.forEach(function(dd) {
      var dateLabel = dd.date ? dd.date.substring(5, 10) : '';
      dailyHtml += renderBar(dd.ok_count, maxDaily, dateLabel, 'bg-blue-500');
    });
    document.getElementById('prodDaily').innerHTML = dailyHtml;

  } catch(e) { console.error('Load production error:', e); }
}

// ── 후가공 ──
async function loadPostProcessing() {
  try {
    var res = await axios.get('/api/production-reports/post-processing?' + getDateParams());
    if (!res.data.success) return;
    var d = res.data.data;

    // 유형별
    var typeData = d.by_type || [];
    var maxType = typeData.length > 0 ? Math.max.apply(null, typeData.map(function(t) { return t.total; })) : 1;
    var typeHtml = typeData.length === 0 ? '<div class="text-center text-gray-400 text-sm py-4">후가공 데이터 없음</div>' : '';
    typeData.forEach(function(t) {
      typeHtml += '<div class="flex items-center gap-2 text-[11px]">'
        + '<span class="w-24 text-gray-600 text-right truncate">' + escapeHtml(t.name) + '</span>'
        + '<div class="flex-1 bg-gray-100 rounded-full h-5">'
        + '<div class="bg-amber-500 h-5 rounded-full flex items-center justify-end pr-1.5 text-[10px] text-white font-medium" style="width: ' + Math.max(Math.round(t.total / maxType * 100), 8) + '%">'
        + t.total + '</div></div>'
        + '<span class="text-gray-400 w-16 text-[10px]">진행:' + t.printing + ' 완료:' + t.done + '</span>'
        + '</div>';
    });
    document.getElementById('ppByType').innerHTML = typeHtml;

    // 카테고리별
    var catData = d.by_category || [];
    var maxCat = catData.length > 0 ? Math.max.apply(null, catData.map(function(c) { return c.count; })) : 1;
    var catHtml = catData.length === 0 ? '<div class="text-center text-gray-400 text-sm py-4">데이터 없음</div>' : '';
    catData.forEach(function(c) {
      catHtml += renderBar(c.count, maxCat, c.category, 'bg-purple-500');
    });
    document.getElementById('ppByCategory').innerHTML = catHtml;

  } catch(e) { console.error('Load post-processing error:', e); }
}

// ── 가동률 ──
async function loadUptime() {
  try {
    var res = await axios.get('/api/production-reports/uptime?months=6');
    if (!res.data.success) return;
    var d = res.data.data;

    var uptimeRows = d.uptime || [];
    var maintCosts = d.maintenance_costs || [];

    // 장비별 그룹핑
    var equipMap = {};
    uptimeRows.forEach(function(r) {
      if (!equipMap[r.equipment_id]) equipMap[r.equipment_id] = { name: r.equipment_name, months: {} };
      equipMap[r.equipment_id].months[r.month] = { active_days: r.active_days, print_count: r.print_count };
    });
    maintCosts.forEach(function(r) {
      if (!equipMap[r.equipment_id]) equipMap[r.equipment_id] = { name: r.equipment_id, months: {} };
      if (!equipMap[r.equipment_id].months[r.month]) equipMap[r.equipment_id].months[r.month] = { active_days: 0, print_count: 0 };
      equipMap[r.equipment_id].months[r.month].maint_cost = r.total_cost;
    });

    // 최근 6개월 목록 생성
    var months = [];
    for (var i = 5; i >= 0; i--) {
      var dt = new Date();
      dt.setMonth(dt.getMonth() - i);
      months.push(dt.toISOString().substring(0, 7));
    }

    var html = '';
    var equipIds = Object.keys(equipMap);
    if (equipIds.length === 0) {
      html = '<div class="text-center text-gray-400 text-sm py-4">데이터 없음</div>';
    } else {
      // 테이블 헤더
      html += '<div class="overflow-x-auto"><table class="w-full text-sm">'
        + '<thead class="bg-gray-50"><tr><th class="px-3 py-2 text-left">장비</th>';
      months.forEach(function(m) { html += '<th class="px-3 py-2 text-center">' + m.substring(2) + '</th>'; });
      html += '</tr></thead><tbody>';

      equipIds.forEach(function(eid) {
        var eq = equipMap[eid];
        html += '<tr class="border-b">';
        html += '<td class="px-3 py-2 font-medium text-sm">' + escapeHtml(eq.name) + '</td>';
        months.forEach(function(m) {
          var md = eq.months[m] || {};
          var days = md.active_days || 0;
          var prints = md.print_count || 0;
          var cost = md.maint_cost || 0;
          var dayPct = Math.round(days / 30 * 100);
          var barColor = dayPct >= 70 ? 'bg-green-500' : dayPct >= 40 ? 'bg-amber-500' : 'bg-red-400';
          html += '<td class="px-3 py-2 text-center">'
            + '<div class="w-full bg-gray-100 rounded-full h-3 mb-0.5">'
            + '<div class="' + barColor + ' h-3 rounded-full" style="width: ' + dayPct + '%"></div></div>'
            + '<div class="text-[10px] text-gray-500">' + days + '일 / ' + prints + '건</div>'
            + (cost > 0 ? '<div class="text-[10px] text-red-500">' + Number(cost).toLocaleString() + '원</div>' : '')
            + '</td>';
        });
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    }
    document.getElementById('uptimeData').innerHTML = html;

  } catch(e) { console.error('Load uptime error:', e); }
}

// ── 불량률 ──
async function loadDefects() {
  try {
    var res = await axios.get('/api/production-reports/defects?' + getDateParams());
    if (!res.data.success) return;
    var d = res.data.data;

    // 장비별
    var eqData = d.by_equipment || [];
    var eqHtml = eqData.length === 0 ? '<div class="text-center text-gray-400 text-sm py-4">데이터 없음</div>' : '';
    eqData.forEach(function(eq) {
      var rate = eq.defect_rate || 0;
      var barColor = rate > 10 ? 'bg-red-500' : rate > 5 ? 'bg-amber-500' : 'bg-green-500';
      eqHtml += '<div class="flex items-center gap-2 p-2 border-b">'
        + '<span class="w-24 text-sm text-gray-700 truncate">' + escapeHtml(eq.equipment_name) + '</span>'
        + '<div class="flex-1">'
        + '<div class="flex items-center gap-2">'
        + '<div class="flex-1 bg-gray-100 rounded-full h-4">'
        + '<div class="' + barColor + ' h-4 rounded-full" style="width: ' + Math.min(rate * 5, 100) + '%"></div></div>'
        + '<span class="text-sm font-medium ' + (rate > 10 ? 'text-red-600' : rate > 5 ? 'text-amber-600' : 'text-green-600') + '">' + rate + '%</span>'
        + '</div>'
        + '<div class="text-[10px] text-gray-400 mt-0.5">전체: ' + eq.total + ' | 정상: ' + eq.ok + ' | 에러: ' + eq.errors + ' | 취소: ' + eq.cancels + '</div>'
        + '</div>'
        + '</div>';
    });
    document.getElementById('defectsByEquipment').innerHTML = eqHtml;

    // 월별 추이
    var mData = d.monthly_trend || [];
    var mHtml = mData.length === 0 ? '<div class="text-center text-gray-400 text-sm py-4">데이터 없음</div>' : '';
    mData.forEach(function(m) {
      var rate = m.defect_rate || 0;
      var barColor = rate > 10 ? 'bg-red-500' : rate > 5 ? 'bg-amber-500' : 'bg-green-500';
      mHtml += '<div class="flex items-center gap-2 text-[11px]">'
        + '<span class="w-16 text-gray-600 text-right">' + (m.month || '').substring(2) + '</span>'
        + '<div class="flex-1 bg-gray-100 rounded-full h-4">'
        + '<div class="' + barColor + ' h-4 rounded-full flex items-center justify-end pr-1.5 text-[10px] text-white font-medium" style="width: ' + Math.max(Math.min(rate * 5, 100), 8) + '%">'
        + rate + '%</div></div>'
        + '<span class="text-gray-400 w-20">(' + m.defects + '/' + m.total + ')</span>'
        + '</div>';
    });
    document.getElementById('defectsMonthly').innerHTML = mHtml;

    // 불량 접수 유형별 (quality_issues)
    var qiData = d.quality_issues || [];
    var catLabels = { COLOR: '색상불량', ALIGNMENT: '정렬불량', CUT: '재단불량', MATERIAL: '소재불량', PRINT: '출력불량', PP: '후가공불량', OTHER: '기타' };
    var qiHtml = qiData.length === 0 ? '<div class="text-center text-gray-400 text-sm py-4">접수된 불량 없음</div>' : '';
    qiData.forEach(function(qi) {
      var pct = qi.count > 0 ? Math.round((qi.resolved / qi.count) * 100) : 0;
      qiHtml += '<div class="flex items-center gap-2 p-2 border-b text-sm">'
        + '<span class="w-20 font-medium">' + (catLabels[qi.defect_category] || qi.defect_category || '미분류') + '</span>'
        + '<span class="text-gray-700 font-bold w-10 text-right">' + qi.count + '건</span>'
        + '<div class="flex-1 bg-gray-100 rounded-full h-3"><div class="bg-green-500 h-3 rounded-full" style="width:' + pct + '%"></div></div>'
        + '<span class="text-xs text-gray-500 w-16">해결 ' + pct + '%</span>'
        + (qi.total_cost_impact > 0 ? '<span class="text-xs text-red-500 w-20 text-right">' + Number(qi.total_cost_impact).toLocaleString() + '원</span>' : '')
        + '</div>';
    });
    var qiEl = document.getElementById('defectsQualityIssues');
    if (qiEl) qiEl.innerHTML = qiHtml;

  } catch(e) { console.error('Load defects error:', e); }
}

// ── 자재 소비 ──
async function loadConsumption() {
  try {
    var res = await axios.get('/api/production-reports/consumption?' + getDateParams());
    if (!res.data.success) return;
    var d = res.data.data;

    // 품목별 소비
    var items = d.consumption || [];
    var maxCons = items.length > 0 ? Math.max.apply(null, items.map(function(i) { return i.total_consumed; })) : 1;
    var itemHtml = items.length === 0 ? '<div class="text-center text-gray-400 text-sm py-4">소비 데이터 없음</div>' : '';
    items.forEach(function(item) {
      var stockClass = item.safety_stock > 0 && item.current_stock <= item.safety_stock ? 'text-red-600 font-medium' : 'text-gray-500';
      itemHtml += '<div class="flex items-center gap-2 text-[11px] py-1 border-b border-gray-100">'
        + '<span class="w-28 text-gray-700 truncate" title="' + escapeHtml(item.item_name) + '">' + escapeHtml(item.item_name) + '</span>'
        + '<div class="flex-1 bg-gray-100 rounded-full h-4">'
        + '<div class="bg-blue-600 h-4 rounded-full flex items-center justify-end pr-1.5 text-[10px] text-white font-medium" style="width: ' + Math.max(Math.round(item.total_consumed / maxCons * 100), 8) + '%">'
        + item.total_consumed + ' ' + (item.unit || '') + '</div></div>'
        + '<span class="w-20 ' + stockClass + ' text-right">재고: ' + (item.current_stock || 0) + '</span>'
        + '</div>';
    });
    document.getElementById('consumptionByItem').innerHTML = itemHtml;

    // 월별 소비 추이
    var monthly = d.monthly || [];
    var maxMonth = monthly.length > 0 ? Math.max.apply(null, monthly.map(function(m) { return m.total_consumed || 0; })) : 1;
    var mHtml = monthly.length === 0 ? '<div class="text-center text-gray-400 text-sm py-4">데이터 없음</div>' : '';
    monthly.forEach(function(m) {
      var cost = m.total_cost ? Number(m.total_cost).toLocaleString() + '원' : '';
      mHtml += '<div class="flex items-center gap-2 text-[11px]">'
        + '<span class="w-16 text-gray-600 text-right">' + (m.month || '').substring(2) + '</span>'
        + '<div class="flex-1 bg-gray-100 rounded-full h-4">'
        + '<div class="bg-teal-500 h-4 rounded-full flex items-center justify-end pr-1.5 text-[10px] text-white font-medium" style="width: ' + Math.max(Math.round((m.total_consumed || 0) / maxMonth * 100), 8) + '%">'
        + (m.total_consumed || 0) + '</div></div>'
        + (cost ? '<span class="text-gray-400 w-24 text-right">' + cost + '</span>' : '')
        + '</div>';
    });
    document.getElementById('consumptionMonthly').innerHTML = mHtml;

  } catch(e) { console.error('Load consumption error:', e); }
}

// ── 인쇄시간 분석 ──
async function loadPrintDuration() {
  try {
    var res = await axios.get('/api/production-reports/print-duration?' + getDateParams());
    if (!res.data.success) return;
    var d = res.data.data;
    var equipData = d.by_equipment || [];
    var dailyData = d.daily || [];

    // KPI 계산
    var totalCount = 0, totalSec = 0, totalHours = 0;
    equipData.forEach(function(eq) {
      totalCount += eq.print_count || 0;
      totalHours += eq.total_hours || 0;
      totalSec += (eq.avg_sec || 0) * (eq.print_count || 0);
    });
    var avgSec = totalCount > 0 ? Math.round(totalSec / totalCount) : 0;

    document.getElementById('durAvg').textContent = formatDuration(avgSec);
    document.getElementById('durTotalHours').textContent = totalHours.toFixed(1) + 'h';
    document.getElementById('durCount').textContent = totalCount.toLocaleString() + '건';

    // 장비별
    var maxAvg = equipData.length > 0 ? Math.max.apply(null, equipData.map(function(e) { return e.avg_sec || 0; })) : 1;
    var eqHtml = equipData.length === 0 ? '<div class="text-center text-gray-400 text-sm py-4">데이터 없음</div>' : '';
    equipData.forEach(function(eq) {
      eqHtml += '<div class="flex items-center gap-2 text-[11px] py-1 border-b border-gray-100">'
        + '<span class="w-24 text-gray-600 text-right truncate" title="' + escapeHtml(eq.equipment_name) + '">' + escapeHtml(eq.equipment_name) + '</span>'
        + '<div class="flex-1 bg-gray-100 rounded-full h-5">'
        + '<div class="bg-cyan-500 h-5 rounded-full flex items-center justify-end pr-1.5 text-[10px] text-white font-medium" style="width: ' + Math.max(Math.round((eq.avg_sec || 0) / maxAvg * 100), 8) + '%">'
        + formatDuration(eq.avg_sec) + '</div></div>'
        + '<span class="text-gray-400 w-16 text-right text-[10px]">' + (eq.print_count || 0) + '건</span>'
        + '<span class="text-gray-400 w-14 text-right text-[10px]">' + (eq.total_hours || 0) + 'h</span>'
        + '</div>';
    });
    document.getElementById('durByEquipment').innerHTML = eqHtml;

    // 일별
    var maxDailyDur = dailyData.length > 0 ? Math.max.apply(null, dailyData.map(function(dd) { return dd.avg_sec || 0; })) : 1;
    var dayHtml = dailyData.length === 0 ? '<div class="text-center text-gray-400 text-sm py-4">데이터 없음</div>' : '';
    dailyData.forEach(function(dd) {
      var dateLabel = dd.date ? dd.date.substring(5, 10) : '';
      dayHtml += '<div class="flex items-center gap-2 text-[11px]">'
        + '<span class="w-14 text-gray-600 text-right">' + dateLabel + '</span>'
        + '<div class="flex-1 bg-gray-100 rounded-full h-4">'
        + '<div class="bg-blue-500 h-4 rounded-full flex items-center justify-end pr-1.5 text-[10px] text-white font-medium" style="width: ' + Math.max(Math.round((dd.avg_sec || 0) / maxDailyDur * 100), 8) + '%">'
        + formatDuration(dd.avg_sec) + '</div></div>'
        + '<span class="text-gray-400 w-10 text-right text-[10px]">' + (dd.print_count || 0) + '</span>'
        + '</div>';
    });
    document.getElementById('durDaily').innerHTML = dayHtml;

    // 프린터별 규격 대비 인쇄시간
    var psByPrinter = d.by_printer_size || [];
    if (psByPrinter.length === 0) {
      document.getElementById('durByPrinterSize').innerHTML = '<div class="text-center text-gray-400 text-sm py-4">데이터 없음</div>';
    } else {
      // 프린터별로 그룹핑
      var printers = {};
      psByPrinter.forEach(function(r) {
        var pn = r.printer_name || '(미상)';
        if (!printers[pn]) printers[pn] = [];
        printers[pn].push(r);
      });
      var psHtml = '';
      Object.keys(printers).forEach(function(pn) {
        var rows = printers[pn];
        psHtml += '<div class="mb-4"><div class="text-xs font-bold text-gray-600 mb-1"><i class="fas fa-print text-blue-400 mr-1"></i>' + escapeHtml(pn) + '</div>'
          + '<table class="w-full text-[11px]"><thead><tr class="bg-gray-50 text-gray-500">'
          + '<th class="px-2 py-1 text-left">면적 구간</th>'
          + '<th class="px-2 py-1 text-right">건수</th>'
          + '<th class="px-2 py-1 text-right">평균면적</th>'
          + '<th class="px-2 py-1 text-right">평균시간</th>'
          + '<th class="px-2 py-1 text-right">최소</th>'
          + '<th class="px-2 py-1 text-right">최대</th>'
          + '<th class="px-2 py-1 text-right">속도(㎡/h)</th>'
          + '</tr></thead><tbody>';
        rows.forEach(function(r) {
          var speedColor = (r.avg_sqm_per_hour || 0) >= 5 ? 'text-green-600' : (r.avg_sqm_per_hour || 0) >= 2 ? 'text-blue-600' : 'text-orange-600';
          psHtml += '<tr class="border-b border-gray-100 hover:bg-gray-50">'
            + '<td class="px-2 py-1.5 font-medium">' + escapeHtml(r.area_range) + '</td>'
            + '<td class="px-2 py-1.5 text-right text-gray-500">' + r.print_count + '</td>'
            + '<td class="px-2 py-1.5 text-right text-gray-500">' + (r.avg_area_sqm || 0) + '㎡</td>'
            + '<td class="px-2 py-1.5 text-right font-medium">' + formatDuration(r.avg_sec) + '</td>'
            + '<td class="px-2 py-1.5 text-right text-gray-400">' + formatDuration(r.min_sec) + '</td>'
            + '<td class="px-2 py-1.5 text-right text-gray-400">' + formatDuration(r.max_sec) + '</td>'
            + '<td class="px-2 py-1.5 text-right font-bold ' + speedColor + '">' + (r.avg_sqm_per_hour || 0) + '</td>'
            + '</tr>';
        });
        psHtml += '</tbody></table></div>';
      });
      document.getElementById('durByPrinterSize').innerHTML = psHtml;
    }

  } catch(e) { console.error('Load print duration error:', e); }
}

// ── 카드 체류시간 분석 ──
async function loadCardDwellTime() {
  try {
    var res = await axios.get('/api/production-reports/card-dwell-time?' + getDateParams());
    if (!res.data.success) return;
    var d = res.data.data;
    var statusData = d.by_status || [];
    var catData = d.by_category || [];

    // 상태별 테이블
    var sHtml = '';
    if (statusData.length === 0) {
      sHtml = '<div class="text-center text-gray-400 text-sm py-4">데이터 없음</div>';
    } else {
      sHtml = '<table class="w-full text-sm"><thead class="bg-gray-50"><tr>'
        + '<th class="px-3 py-2 text-left">상태</th>'
        + '<th class="px-3 py-2 text-right">건수</th>'
        + '<th class="px-3 py-2 text-right">평균</th>'
        + '<th class="px-3 py-2 text-right">최소</th>'
        + '<th class="px-3 py-2 text-right">최대</th>'
        + '</tr></thead><tbody>';
      statusData.forEach(function(s) {
        var label = statusLabels[s.status] || s.status;
        var colorCls = statusColors[s.status] || 'text-gray-700';
        sHtml += '<tr class="border-b">'
          + '<td class="px-3 py-2 font-medium ' + colorCls + '">' + label + '</td>'
          + '<td class="px-3 py-2 text-right text-gray-600">' + (s.transition_count || 0) + '</td>'
          + '<td class="px-3 py-2 text-right font-medium">' + formatHours(s.avg_hours) + '</td>'
          + '<td class="px-3 py-2 text-right text-gray-500">' + formatHours(s.min_hours) + '</td>'
          + '<td class="px-3 py-2 text-right text-gray-500">' + formatHours(s.max_hours) + '</td>'
          + '</tr>';
      });
      sHtml += '</tbody></table>';
    }
    document.getElementById('dwellByStatus').innerHTML = sHtml;

    // 카테고리별
    var maxCatHours = catData.length > 0 ? Math.max.apply(null, catData.map(function(c) { return c.avg_hours || 0; })) : 1;
    var cHtml = catData.length === 0 ? '<div class="text-center text-gray-400 text-sm py-4">데이터 없음</div>' : '';
    catData.forEach(function(c) {
      var label = statusLabels[c.status] || c.status;
      var barColor = c.status === 'PRINT_PENDING' ? 'bg-amber-500' : c.status === 'PRINTING' ? 'bg-blue-500' : 'bg-green-500';
      cHtml += '<div class="flex items-center gap-2 text-[11px] py-0.5">'
        + '<span class="w-20 text-gray-600 text-right truncate">' + escapeHtml(c.category) + '</span>'
        + '<span class="w-12 text-[10px] ' + (statusColors[c.status] || '') + '">' + label + '</span>'
        + '<div class="flex-1 bg-gray-100 rounded-full h-4">'
        + '<div class="' + barColor + ' h-4 rounded-full flex items-center justify-end pr-1.5 text-[10px] text-white font-medium" style="width: ' + Math.max(Math.round((c.avg_hours || 0) / maxCatHours * 100), 8) + '%">'
        + formatHours(c.avg_hours) + '</div></div>'
        + '<span class="text-gray-400 w-10 text-right text-[10px]">' + (c.count || 0) + '건</span>'
        + '</div>';
    });
    document.getElementById('dwellByCategory').innerHTML = cHtml;

  } catch(e) { console.error('Load card dwell time error:', e); }
}

// ── CSV 내보내기 ──
async function exportProductionCsv() {
  try {
    var p = getDateParams();
    var type = currentReportTab === 'production' ? 'production' : 'daily';
    var res = await authFetch('/api/production-reports/export/csv?from=' + p.from + '&to=' + p.to + '&type=' + type);
    if (!res.ok) throw new Error('서버 오류');
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (type === 'daily' ? '일별생산_' : '생산실적_') + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  } catch(e) {
    showToast('CSV 내보내기 실패: ' + e.message, 'error');
  }
}

// ── 초기 로드: 일일 생산 탭 기본 ──
document.getElementById('reportDate').value = getToday();
loadDailySummary();
