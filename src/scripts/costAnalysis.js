// ===== 원가분석 페이지 스크립트 =====
var analysisData = {};
var deductionsList = [];

// ===== 번호 포맷팅 =====
function formatCurrency(n) {
  return (parseFloat(n) || 0).toLocaleString();
}

function formatNumber(n, decimals) {
  var dec = decimals || 0;
  return (parseFloat(n) || 0).toFixed(dec);
}

// ===== 요약 업데이트 =====
function updateSummary() {
  var agg = analysisData.aggregate || {};
  var avgCost = parseFloat(agg.avg_cost_per_sqm) || 0;
  var avgLoss = parseFloat(agg.avg_loss_rate) || 0;
  var totalConsumed = parseFloat(agg.total_consumed_sqm) || 0;
  var totalCost = parseFloat(agg.total_cost) || 0;

  document.getElementById('avgCostPerSqm').textContent = formatNumber(avgCost, 2) + '원';
  document.getElementById('avgLossRate').textContent = formatNumber(avgLoss, 2) + '%';
  document.getElementById('totalConsumed').textContent = formatNumber(totalConsumed, 1) + '㎡';
  document.getElementById('totalCost').textContent = formatCurrency(totalCost) + '원';
}

// ===== 월별 원가 추이 차트 (수평 바 차트) =====
function renderMonthlyChart() {
  var snapshots = analysisData.snapshots || [];
  var grouped = {};

  snapshots.forEach(function(s) {
    if (!grouped[s.period]) {
      grouped[s.period] = { period: s.period, cost_per_sqm: 0, count: 0 };
    }
    grouped[s.period].cost_per_sqm += parseFloat(s.total_cost_per_sqm) || 0;
    grouped[s.period].count += 1;
  });

  var periods = Object.keys(grouped).sort().reverse();
  var maxCost = Math.max(
    1,
    Math.max.apply(null, periods.map(function(p) { return grouped[p].cost_per_sqm / grouped[p].count; }))
  );

  var container = document.getElementById('monthlyChart');
  if (periods.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:48px;"><i class="fas fa-chart-line" style="font-size:36px;color:#d1d5db;margin-bottom:12px;display:block;"></i><p style="color:#6b7280;font-size:13px;">데이터 없음</p></div>';
    return;
  }

  var html = '';
  periods.forEach(function(p) {
    var item = grouped[p];
    var avg = item.cost_per_sqm / item.count;
    var pct = (avg / maxCost * 100).toFixed(0);

    html += '<div style="margin-bottom:12px;">'
      + '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">'
        + '<span style="font-size:12px;font-weight:500;color:#374151;">' + p + '</span>'
        + '<span style="font-size:12px;color:#9ca3af;">' + formatNumber(avg, 2) + '원/㎡</span>'
      + '</div>'
      + '<div style="display:flex;height:24px;border-radius:4px;overflow:hidden;background:#f3f4f6;">'
        + '<div style="flex:' + pct + ';background:#3b82f6;transition:flex 0.2s;"></div>'
      + '</div>'
    + '</div>';
  });

  container.innerHTML = html;
}

// ===== 로스율 추이 차트 =====
function renderLossRateChart() {
  var snapshots = analysisData.snapshots || [];
  var filtered = snapshots.filter(function(s) { return parseFloat(s.loss_rate) > 0; });

  if (filtered.length === 0) {
    document.getElementById('lossRateChart').innerHTML = '<div style="text-align:center;padding:48px;"><i class="fas fa-percentage" style="font-size:36px;color:#d1d5db;margin-bottom:12px;display:block;"></i><p style="color:#6b7280;font-size:13px;">데이터 없음</p></div>';
    return;
  }

  var html = '';
  filtered.slice(0, 10).forEach(function(s) {
    var loss = parseFloat(s.loss_rate);
    var pct = Math.min(100, loss * 5); // 스케일 조정

    html += '<div style="margin-bottom:12px;">'
      + '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">'
        + '<span style="font-size:12px;font-weight:500;color:#374151;">' + (s.period || '') + '</span>'
        + '<span style="font-size:12px;color:#9ca3af;">' + formatNumber(loss, 2) + '%</span>'
      + '</div>'
      + '<div style="display:flex;height:20px;border-radius:3px;overflow:hidden;background:#f3f4f6;">'
        + '<div style="flex:' + pct + ';background:#f59e0b;transition:flex 0.2s;"></div>'
      + '</div>'
    + '</div>';
  });

  document.getElementById('lossRateChart').innerHTML = html;
}

// ===== 원단별 원가 테이블 =====
function renderMaterialTable() {
  var snapshots = analysisData.snapshots || [];
  if (snapshots.length === 0) {
    document.getElementById('materialBody').innerHTML = '<tr><td colspan="6" style="text-align:center;padding:48px;"><div style="display:flex;flex-direction:column;align-items:center;"><i class="fas fa-folder-open" style="font-size:36px;color:#d1d5db;margin-bottom:12px;"></i><p style="color:#6b7280;font-size:13px;margin:0;">데이터 없음</p></div></td></tr>';
    return;
  }

  // material_item_id별로 그룹화하고 최신 데이터만 사용
  var grouped = {};
  snapshots.forEach(function(s) {
    var mid = s.material_item_id || 'unknown';
    if (!grouped[mid] || s.period > grouped[mid].period) {
      grouped[mid] = s;
    }
  });

  var tbody = document.getElementById('materialBody');
  var rows = Object.values(grouped).map(function(s) {
    return '<tr>'
      + '<td style="padding:10px 12px;">' + escapeHtml(s.category_name || '원단') + '</td>'
      + '<td style="padding:10px 12px;text-align:center;color:#666;font-size:13px;">-</td>'
      + '<td style="padding:10px 12px;text-align:right;font-family:monospace;">' + formatNumber(s.total_consumed_sqm, 1) + ' ㎡</td>'
      + '<td style="padding:10px 12px;text-align:right;font-family:monospace;font-size:13px;">' + formatNumber(s.avg_purchase_price_yd, 1) + '원</td>'
      + '<td style="padding:10px 12px;text-align:right;font-family:monospace;font-weight:600;color:#3b82f6;">' + formatNumber(s.material_cost_per_sqm, 2) + '원</td>'
      + '<td style="padding:10px 12px;text-align:center;color:#f59e0b;font-weight:600;">' + formatNumber(s.loss_rate, 2) + '%</td>'
      + '</tr>';
  });

  tbody.innerHTML = rows.length > 0 ? rows.join('') : '<tr><td colspan="6" style="text-align:center;padding:48px;"><div style="display:flex;flex-direction:column;align-items:center;"><i class="fas fa-inbox" style="font-size:36px;color:#d1d5db;margin-bottom:12px;"></i><p style="color:#6b7280;font-size:13px;margin:0;">데이터 없음</p></div></td></tr>';
}

// ===== 자동차감 이력 로드 =====
async function loadDeductions() {
  var tbody = document.getElementById('deductionBody');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#9ca3af;"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</td></tr>';

  try {
    var params = new URLSearchParams({ limit: '50' });
    var res = await axios.get('/api/costs/deductions?' + params.toString());
    deductionsList = res.data.data || [];

    var rows = deductionsList.map(function(d) {
      var dedLength = parseFloat(d.deducted_length_mm) || 0;
      var outputSize = (parseFloat(d.output_width_mm) || 0) + ' x ' + (parseFloat(d.output_height_mm) || 0);

      return '<tr>'
        + '<td style="padding:10px 12px;font-family:monospace;font-size:12px;">' + escapeHtml(d.order_number || '-') + '</td>'
        + '<td style="padding:10px 12px;font-size:12px;color:#666;">' + escapeHtml(d.material_item_id || '-') + '</td>'
        + '<td style="padding:10px 12px;text-align:right;font-family:monospace;font-size:12px;">' + formatNumber(dedLength, 1) + 'mm</td>'
        + '<td style="padding:10px 12px;text-align:center;font-size:12px;">' + formatNumber(d.matched_width_mm, 0) + '</td>'
        + '<td style="padding:10px 12px;text-align:center;font-size:12px;">' + outputSize + '</td>'
        + '<td style="padding:10px 12px;text-align:center;font-size:12px;">' + (d.copy_total || 1) + '</td>'
        + '<td style="padding:10px 12px;text-align:center;font-size:12px;color:#9ca3af;">' + (d.created_at ? d.created_at.substring(0, 10) : '-') + '</td>'
        + '</tr>';
    });

    tbody.innerHTML = rows.length > 0 ? rows.join('') : '<tr><td colspan="7" style="text-align:center;padding:48px;"><div style="display:flex;flex-direction:column;align-items:center;"><i class="fas fa-inbox" style="font-size:36px;color:#d1d5db;margin-bottom:12px;"></i><p style="color:#6b7280;font-size:13px;margin:0;">차감 이력 없음</p></div></td></tr>';
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:48px;"><div style="display:flex;flex-direction:column;align-items:center;"><i class="fas fa-exclamation-circle" style="font-size:36px;color:#fca5a5;margin-bottom:12px;"></i><p style="color:#dc2626;font-size:13px;margin:0;">로드 실패</p><p style="color:#9ca3af;font-size:11px;margin:4px 0 0 0;">' + escapeHtml(msg) + '</p></div></td></tr>';
  }
}

// ===== 원가 분석 데이터 로드 =====
async function loadAnalysis() {
  try {
    var periodFrom = document.getElementById('fPeriodFrom').value;
    var periodTo = document.getElementById('fPeriodTo').value;

    var params = new URLSearchParams();
    if (periodFrom) params.append('period_from', periodFrom);
    if (periodTo) params.append('period_to', periodTo);

    var res = await axios.get('/api/costs/analysis?' + params.toString());
    analysisData = res.data.data || {};

    updateSummary();
    renderMonthlyChart();
    renderLossRateChart();
    renderMaterialTable();
    loadDeductions();
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    showToast('로드 실패: ' + msg, 'error');
  }
}

// ===== 기본 날짜 범위 설정 =====
function setDefaultPeriod() {
  var now = new Date();
  var monthStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  document.getElementById('fPeriodFrom').value = monthStr;
  document.getElementById('fPeriodTo').value = monthStr;
}

// ===== 초기 로드 =====
setDefaultPeriod();
loadAnalysis();
