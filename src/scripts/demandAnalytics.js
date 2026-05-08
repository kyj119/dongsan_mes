// ===== 수요 분석 페이지 스크립트 =====

var demandData = {
  monthly: [],
  forecast: {},
  categories: [],
  clients: [],
  items: []
};

// ===== 숫자 포매팅 =====
function fmt(n) { return (n || 0).toLocaleString(); }

// ===== 페이지 초기화 =====
function initDemandAnalytics() {
  loadForecast();
  loadItemAnalysis();
  loadClientForecast();
}

// ===== 1. Forecast 데이터 로드 =====
async function loadForecast() {
  try {
    var res = await axios.get('/api/forecast/order-forecast');
    if (!res.data.success) return;

    var d = res.data.data;
    demandData.monthly = d.monthly || [];
    demandData.forecast = d.forecast || {};
    demandData.categories = d.category_forecast || [];

    // 요약 카드 업데이트
    updateSummaryCards();

    // 월별 매출 차트 (최근 6개월)
    renderMonthlyChart();

    // 카테고리별 분포
    renderCategoryBreakdown();
  } catch (error) {
    console.error('Failed to load forecast:', error);
  }
}

// ===== 2. 품목 분석 데이터 로드 =====
async function loadItemAnalysis() {
  try {
    var res = await axios.get('/api/reports/item-analysis?months=6');
    if (!res.data.success) return;

    demandData.items = (res.data.data.items || []).slice(0, 10);
    renderItemTable();
  } catch (error) {
    console.error('Failed to load item analysis:', error);
  }
}

// ===== 3. 거래처 예측 데이터 로드 =====
async function loadClientForecast() {
  try {
    var res = await axios.get('/api/forecast/client-forecast');
    if (!res.data.success) return;

    demandData.clients = res.data.data.clients || [];
    renderClientTable();
  } catch (error) {
    console.error('Failed to load client forecast:', error);
  }
}

// ===== 요약 카드 업데이트 =====
function updateSummaryCards() {
  var now = new Date();
  var thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  var lastMonth = (now.getMonth() === 0 ? (now.getFullYear() - 1) : now.getFullYear())
                  + '-' + String((now.getMonth() === 0 ? 12 : now.getMonth())).padStart(2, '0');

  // 이번달 데이터 찾기
  var thisMonthData = demandData.monthly.find(function(m) { return m.month.startsWith(thisMonth); });
  var lastMonthData = demandData.monthly.find(function(m) { return m.month.startsWith(lastMonth); });

  var thisRevenue = thisMonthData ? (thisMonthData.revenue || 0) : 0;
  var thisOrders = thisMonthData ? (thisMonthData.order_count || 0) : 0;
  var lastRevenue = lastMonthData ? (lastMonthData.revenue || 0) : 0;

  // 전월 대비
  var momPct = lastRevenue > 0 ? Math.round((thisRevenue - lastRevenue) / lastRevenue * 1000) / 10 : 0;

  // DOM 업데이트
  document.getElementById('thisMonthOrders').textContent = fmt(thisOrders) + '건';
  document.getElementById('thisMonthRevenue').textContent = fmt(thisRevenue) + '원';

  var momEl = document.getElementById('momGrowth');
  momEl.textContent = (momPct > 0 ? '▲' : momPct < 0 ? '▼' : '●') + ' ' + momPct + '%';
  if (momPct > 0) {
    momEl.style.color = '#10b981';
  } else if (momPct < 0) {
    momEl.style.color = '#ef4444';
  } else {
    momEl.style.color = '#9ca3af';
  }

  // 다음달 예측
  var forecast = demandData.forecast || {};
  document.getElementById('nextMonthForecast').textContent = fmt(forecast.order_count) + '건';
}

// ===== 월별 매출 차트 렌더 =====
function renderMonthlyChart() {
  var container = document.getElementById('monthlyChart');
  var data = demandData.monthly.slice(-6) || [];

  if (data.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:#9ca3af;">데이터가 없습니다.</div>';
    return;
  }

  var maxRev = Math.max.apply(null, data.map(function(m) { return m.revenue || 0; })) || 1;

  var html = data.map(function(m) {
    var pct = Math.round((m.revenue / maxRev) * 100);
    var label = m.month || '';

    return '<div style="display:flex;align-items:center;gap:12px;">'
      + '<span style="width:60px;font-size:var(--fs-sm);color:var(--c-text-secondary);text-align:right;">' + label + '</span>'
      + '<div style="flex:1;height:32px;background:var(--c-border);border-radius:6px;overflow:hidden;">'
      + '<div style="height:100%;background:#3b82f6;border-radius:6px;width:' + Math.max(pct, 2) + '%;transition:width 0.3s;"></div>'
      + '</div>'
      + '<span style="width:100px;text-align:right;font-weight:600;font-size:var(--fs-sm);">' + fmt(m.revenue) + '원</span>'
      + '<span style="width:60px;text-align:center;font-size:var(--fs-xs);color:var(--c-text-secondary);">' + fmt(m.order_count) + '건</span>'
      + '</div>';
  }).join('');

  container.innerHTML = html;
}

// ===== 카테고리별 매출 분포 렌더 =====
function renderCategoryBreakdown() {
  var container = document.getElementById('categoryChart');
  var categories = demandData.categories || [];

  if (categories.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:#9ca3af;">데이터가 없습니다.</div>';
    return;
  }

  var total = categories.reduce(function(s, c) { return s + (c.forecast_revenue || 0); }, 0);

  if (total === 0) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:#9ca3af;">데이터가 없습니다.</div>';
    return;
  }

  var colors = (window.CHART_COLORS || ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#9333ea', '#ec4899', '#06b6d4', '#84cc16']);

  var html = '<div style="display:grid;gap:16px;">';

  // 가로 스택 바
  html += '<div style="display:flex;height:40px;border-radius:8px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.05);gap:0;">';
  categories.forEach(function(cat, idx) {
    var pct = ((cat.forecast_revenue || 0) / total * 100).toFixed(1);
    if (pct > 0.5) {
      html += '<div style="flex:' + pct + ';background:' + colors[idx % colors.length] + ';transition:flex 0.3s;"></div>';
    }
  });
  html += '</div>';

  // 범례
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;">';
  categories.forEach(function(cat, idx) {
    var pct = ((cat.forecast_revenue || 0) / total * 100).toFixed(1);
    html += '<div style="display:flex;align-items:center;gap:8px;font-size:var(--fs-sm);">'
      + '<div style="width:12px;height:12px;background:' + colors[idx % colors.length] + ';border-radius:2px;flex-shrink:0;"></div>'
      + '<div>'
      + '<div style="font-weight:600;color:#1e293b;">' + (cat.category || '기타') + '</div>'
      + '<div style="font-size:var(--fs-xs);color:var(--c-text-secondary);">' + fmt(cat.forecast_revenue) + '원 (' + pct + '%)</div>'
      + '</div>'
      + '</div>';
  });
  html += '</div>';

  html += '</div>';
  container.innerHTML = html;
}

// ===== 거래처 테이블 렌더 =====
function renderClientTable() {
  var tbody = document.getElementById('clientTable');
  var clients = demandData.clients || [];

  if (clients.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#9ca3af;">데이터가 없습니다.</td></tr>';
    return;
  }

  var html = clients.map(function(c, idx) {
    var trend = c.trend || 0;
    var trendIcon = trend > 0 ? '▲' : trend < 0 ? '▼' : '●';
    var trendColor = trend > 0 ? '#10b981' : trend < 0 ? '#ef4444' : '#9ca3af';

    var riskBadge = '';
    if (c.risk === 'DECLINING') {
      riskBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:#fee2e2;color:#b91c1c;">위험</span>';
    } else if (c.risk === 'LOW_FREQUENCY') {
      riskBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:#fef9c3;color:#a16207;">주의</span>';
    } else {
      riskBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:#dcfce7;color:#15803d;">양호</span>';
    }

    return '<tr>'
      + '<td style="text-align:center;font-size:var(--fs-sm);color:var(--c-text-secondary);">' + (idx + 1) + '</td>'
      + '<td style="font-weight:500;color:#1e293b;">' + (c.client_name || '-') + '</td>'
      + '<td style="text-align:right;font-weight:600;">' + fmt(c.forecast_revenue) + '원</td>'
      + '<td style="text-align:center;color:' + trendColor + ';font-weight:600;">' + trendIcon + ' ' + trend + '%</td>'
      + '<td style="text-align:center;">' + riskBadge + '</td>'
      + '<td style="text-align:center;font-size:var(--fs-sm);color:var(--c-text-secondary);">' + c.frequency + '개월</td>'
      + '</tr>';
  }).join('');

  tbody.innerHTML = html;
}

// ===== 품목 테이블 렌더 =====
function renderItemTable() {
  var tbody = document.getElementById('itemTable');
  var items = demandData.items || [];

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#9ca3af;">데이터가 없습니다.</td></tr>';
    return;
  }

  var html = items.map(function(item, idx) {
    return '<tr>'
      + '<td style="text-align:center;font-size:var(--fs-sm);color:var(--c-text-secondary);">' + (idx + 1) + '</td>'
      + '<td style="font-weight:500;color:#1e293b;">' + (item.item_name || '-') + '</td>'
      + '<td style="font-size:var(--fs-sm);color:var(--c-text-secondary);">' + (item.category || '-') + '</td>'
      + '<td style="text-align:right;font-weight:600;">' + fmt(item.total_revenue) + '원</td>'
      + '<td style="text-align:center;font-size:var(--fs-sm);color:var(--c-text-secondary);">' + (item.order_count || 0) + '건</td>'
      + '<td style="text-align:right;font-size:var(--fs-sm);color:var(--c-text-secondary);">' + fmt(item.total_quantity) + '</td>'
      + '</tr>';
  }).join('');

  tbody.innerHTML = html;
}

// ===== 페이지 로드 시 초기화 =====
initDemandAnalytics();
