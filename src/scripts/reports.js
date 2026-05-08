var currentReportTab = 'monthly';

function switchReportTab(tab) {
  currentReportTab = tab;
  var tabs = ['monthly', 'clients', 'items', 'designers', 'margin', 'receivables', 'production', 'comparison'];
  tabs.forEach(function(t) {
    var btn = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
    var panel = document.getElementById(t + 'Panel');
    if (t === tab) {
      btn.className = 'px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600';
      panel.classList.remove('hidden');
    } else {
      btn.className = 'px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700';
      panel.classList.add('hidden');
    }
  });
}

function getMonths() {
  return document.getElementById('periodMonths').value || '6';
}

function fmt(n) { return (n || 0).toLocaleString(); }

async function loadAllReports() {
  loadMonthlySummary();
  loadClientRevenue();
  loadItemAnalysis();
  loadDesignerStats();
  loadMarginAnalysis();
  loadReceivablesAnalysis();
  loadProductionAnalysis();
}

// 1. Monthly Summary
async function loadMonthlySummary() {
  try {
    var res = await axios.get('/api/reports/monthly-summary?months=' + getMonths());
    if (!res.data.success) return;
    var raw = res.data.data || {};
    var monthlyData = raw.monthly || [];
    var payData = raw.payments || [];

    // 수금 데이터를 월 기준 맵으로 변환
    var payMap = {};
    payData.forEach(function(p) { payMap[p.month] = parseFloat(p.payments) || 0; });

    // monthly + payments 병합
    var data = monthlyData.map(function(m) {
      return { month: m.month, order_count: m.order_count, revenue: parseFloat(m.revenue) || 0, payments: payMap[m.month] || 0, unique_clients: m.unique_clients || 0 };
    });

    var totalRev = 0, totalPay = 0, totalOrd = 0;
    data.forEach(function(m) {
      totalRev += m.revenue || 0;
      totalPay += m.payments || 0;
      totalOrd += m.order_count || 0;
    });

    document.getElementById('rptTotalRevenue').textContent = fmt(totalRev) + '원';
    document.getElementById('rptTotalPayments').textContent = fmt(totalPay) + '원';
    document.getElementById('rptTotalOrders').textContent = fmt(totalOrd) + '건';
    var rate = totalRev > 0 ? Math.round((totalPay / totalRev) * 100) : 0;
    document.getElementById('rptCollectionRate').textContent = rate + '%';

    // Bar chart
    var maxVal = Math.max.apply(null, data.map(function(m) { return Math.max(m.revenue || 0, m.payments || 0); })) || 1;
    var chartArea = document.getElementById('monthlyChartArea');
    var reversed = data.slice().reverse();
    chartArea.innerHTML = reversed.map(function(m) {
      var revW = Math.round(((m.revenue || 0) / maxVal) * 100);
      var payW = Math.round(((m.payments || 0) / maxVal) * 100);
      return '<div class="flex items-center gap-3">'
        + '<span class="w-16 text-xs text-gray-500 text-right">' + m.month + '</span>'
        + '<div class="flex-1">'
        + '<div class="h-3 bg-blue-400 rounded mb-0.5" style="width:' + Math.max(revW, 1) + '%" title="매출: ' + fmt(m.revenue) + '원"></div>'
        + '<div class="h-3 bg-green-400 rounded" style="width:' + Math.max(payW, 1) + '%" title="입금: ' + fmt(m.payments) + '원"></div>'
        + '</div>'
        + '<span class="w-24 text-right text-xs text-gray-500">' + fmt(m.revenue) + '</span>'
        + '</div>';
    }).join('') + '<div class="flex gap-4 justify-center mt-2 text-xs text-gray-500">'
      + '<span><span class="inline-block w-3 h-3 bg-blue-400 rounded mr-1"></span>매출</span>'
      + '<span><span class="inline-block w-3 h-3 bg-green-400 rounded mr-1"></span>입금</span></div>';

    // Table
    var tbody = document.getElementById('monthlyTableBody');
    tbody.innerHTML = reversed.map(function(m) {
      var r = (m.revenue || 0) > 0 ? Math.round(((m.payments || 0) / (m.revenue || 1)) * 100) : 0;
      var rColor = r >= 80 ? 'text-green-600' : r >= 50 ? 'text-amber-600' : 'text-red-600';
      return '<tr class="border-t hover:bg-gray-50">'
        + '<td class="px-4 py-3 font-medium">' + m.month + '</td>'
        + '<td class="px-4 py-3 text-right">' + fmt(m.order_count) + '</td>'
        + '<td class="px-4 py-3 text-right font-medium text-blue-600">' + fmt(m.revenue) + '원</td>'
        + '<td class="px-4 py-3 text-right font-medium text-green-600">' + fmt(m.payments) + '원</td>'
        + '<td class="px-4 py-3 text-right ' + rColor + '">' + r + '%</td>'
        + '<td class="px-4 py-3 text-right">' + fmt(m.unique_clients) + '</td>'
        + '</tr>';
    }).join('');
  } catch(e) {
    console.error('Monthly summary error:', e);
  }
}

// 2. Client Revenue
async function loadClientRevenue() {
  try {
    var res = await axios.get('/api/reports/client-revenue?months=' + getMonths());
    if (!res.data.success) return;
    var clients = res.data.data.clients || [];
    var totalRev = clients.reduce(function(s, c) { return s + (c.total_revenue || 0); }, 0) || 1;

    var tbody = document.getElementById('clientsTableBody2');
    tbody.innerHTML = clients.map(function(c, i) {
      var pct = Math.round(((c.total_revenue || 0) / totalRev) * 100);
      var balColor = (c.balance || 0) > 0 ? 'text-red-600 font-medium' : 'text-green-600';
      return '<tr class="border-t hover:bg-gray-50">'
        + '<td class="px-4 py-3 text-center text-gray-400 font-bold">' + (i+1) + '</td>'
        + '<td class="px-4 py-3 font-medium">' + c.client_name + '</td>'
        + '<td class="px-4 py-3 text-right">' + fmt(c.total_orders) + '</td>'
        + '<td class="px-4 py-3 text-right font-medium text-blue-600">' + fmt(c.total_revenue) + '원</td>'
        + '<td class="px-4 py-3 text-right">' + fmt(Math.round(c.avg_order_amount)) + '원</td>'
        + '<td class="px-4 py-3 text-right ' + balColor + '">' + fmt(c.balance) + '원</td>'
        + '<td class="px-4 py-3"><div class="h-2 bg-gray-200 rounded-full overflow-hidden w-full"><div class="h-full bg-blue-500 rounded-full" style="width:' + pct + '%"></div></div><span class="text-xs text-gray-400">' + pct + '%</span></td>'
        + '</tr>';
    }).join('');

    if (clients.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-12 text-center"><div class="flex flex-col items-center"><i class="fas fa-inbox text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 text-sm">데이터가 없습니다</p></div></td></tr>';
    }
  } catch(e) {
    console.error('Client revenue error:', e);
  }
}

// 3. Item Analysis
async function loadItemAnalysis() {
  try {
    var res = await axios.get('/api/reports/item-analysis?months=' + getMonths());
    if (!res.data.success) return;
    var items = res.data.data.items || [];
    var categories = res.data.data.categories || [];

    // Category chart
    var maxCat = Math.max.apply(null, categories.map(function(c) { return c.total_revenue || 0; })) || 1;
    var catColors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-red-500', 'bg-amber-500', 'bg-blue-600', 'bg-pink-500'];
    var categoryChart = document.getElementById('categoryChart');
    categoryChart.innerHTML = categories.map(function(c, i) {
      var pct = Math.round(((c.total_revenue || 0) / maxCat) * 100);
      return '<div class="flex items-center gap-3">'
        + '<span class="w-20 text-xs text-gray-600 text-right truncate" title="' + (c.category || '기타') + '">' + (c.category || '기타') + '</span>'
        + '<div class="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">'
        + '<div class="h-full ' + catColors[i % catColors.length] + ' rounded-full" style="width:' + Math.max(pct, 2) + '%"></div></div>'
        + '<span class="w-24 text-right text-xs font-medium">' + fmt(c.total_revenue) + '원</span>'
        + '</div>';
    }).join('');

    // Items table
    var tbody = document.getElementById('itemsTableBody');
    tbody.innerHTML = items.map(function(item) {
      return '<tr class="border-t hover:bg-gray-50">'
        + '<td class="px-4 py-2"><span class="font-medium">' + (item.item_name || '-') + '</span>'
        + (item.category ? ' <span class="text-[10px] text-gray-400">[' + item.category + ']</span>' : '') + '</td>'
        + '<td class="px-4 py-2 text-right">' + fmt(item.order_count) + '</td>'
        + '<td class="px-4 py-2 text-right">' + fmt(item.total_quantity) + '</td>'
        + '<td class="px-4 py-2 text-right font-medium text-blue-600">' + fmt(item.total_revenue) + '원</td>'
        + '</tr>';
    }).join('');

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-gray-400">데이터가 없습니다</td></tr>';
    }
  } catch(e) {
    console.error('Item analysis error:', e);
  }
}

// 4. Designer Stats
async function loadDesignerStats() {
  try {
    var res = await axios.get('/api/reports/designer-stats?months=' + getMonths());
    if (!res.data.success) return;
    var designers = res.data.data || [];

    var tbody = document.getElementById('designersTableBody');
    tbody.innerHTML = designers.map(function(d) {
      var total = (d.completed_count || 0) + (d.in_progress_count || 0);
      var completionRate = total > 0 ? Math.round(((d.completed_count || 0) / total) * 100) : 0;
      var barColor = completionRate >= 80 ? 'bg-green-500' : completionRate >= 50 ? 'bg-amber-500' : 'bg-red-500';
      return '<tr class="border-t hover:bg-gray-50">'
        + '<td class="px-4 py-3 font-medium">' + (d.designer_name || '-') + '</td>'
        + '<td class="px-4 py-3 text-right">' + fmt(d.order_count) + '건</td>'
        + '<td class="px-4 py-3 text-right font-medium text-blue-600">' + fmt(d.total_revenue) + '원</td>'
        + '<td class="px-4 py-3 text-right">' + fmt(Math.round(d.avg_amount)) + '원</td>'
        + '<td class="px-4 py-3 text-right text-green-600">' + (d.completed_count || 0) + '</td>'
        + '<td class="px-4 py-3 text-right text-amber-600">' + (d.in_progress_count || 0) + '</td>'
        + '<td class="px-4 py-3"><div class="flex items-center gap-2"><div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden"><div class="h-full ' + barColor + ' rounded-full" style="width:' + completionRate + '%"></div></div><span class="text-xs text-gray-500">' + completionRate + '%</span></div></td>'
        + '</tr>';
    }).join('');

    if (designers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-400">데이터가 없습니다</td></tr>';
    }
  } catch(e) {
    console.error('Designer stats error:', e);
  }
}

// 5. Margin Analysis
async function loadMarginAnalysis() {
  var months = document.getElementById('periodMonths').value;
  try {
    var res = await authFetch('/api/reports/margin-analysis?months=' + months);
    var json = await res.json();
    if (!json.success) return;

    var summary = json.data.summary;
    var by_category = json.data.by_category;
    var by_month = json.data.by_month;
    var low_margin_orders = json.data.low_margin_orders;

    // 요약 카드
    var fmtWon = function(n) { return (n || 0).toLocaleString() + '원'; };
    document.getElementById('mgTotalRevenue').textContent = fmtWon(summary.total_revenue);
    document.getElementById('mgTotalCost').textContent = fmtWon(summary.total_cost);
    document.getElementById('mgTotalProfit').textContent = fmtWon(summary.total_profit);
    document.getElementById('mgAvgMargin').textContent = (summary.avg_margin_rate || 0).toFixed(1) + '%';

    // 카테고리별
    var catEl = document.getElementById('mgByCategory');
    if (!by_category || by_category.length === 0) {
      catEl.innerHTML = '<div class="text-center text-gray-400 py-4 text-sm">원가 데이터가 없습니다</div>';
    } else {
      var maxRev = Math.max.apply(null, by_category.map(function(c) { return c.revenue || 0; }).concat([1]));
      catEl.innerHTML = by_category.map(function(c) {
        var pct = ((c.revenue || 0) / maxRev * 100).toFixed(0);
        var marginRate = c.margin_rate || 0;
        var marginColor = marginRate >= 30 ? 'text-green-600' : marginRate >= 15 ? 'text-amber-600' : 'text-red-600';
        return '<div class="flex items-center justify-between text-sm">'
          + '<span class="w-24 truncate font-medium">' + (c.category_name || '미분류') + '</span>'
          + '<div class="flex-1 mx-3"><div class="bg-gray-100 rounded-full h-4 relative">'
          + '<div class="bg-blue-400 h-4 rounded-full" style="width:' + pct + '%"></div></div></div>'
          + '<span class="w-20 text-right text-gray-600">' + fmtWon(c.revenue) + '</span>'
          + '<span class="w-16 text-right font-bold ' + marginColor + '">' + marginRate.toFixed(1) + '%</span>'
          + '</div>';
      }).join('');
    }

    // 월별 추이
    var monthEl = document.getElementById('mgByMonth');
    if (!by_month || by_month.length === 0) {
      monthEl.innerHTML = '<div class="text-center text-gray-400 py-4 text-sm">데이터 없음</div>';
    } else {
      var maxProfit = Math.max.apply(null, by_month.map(function(m) { return Math.abs(m.profit || 0); }).concat([1]));
      monthEl.innerHTML = by_month.slice().reverse().map(function(m) {
        var profit = m.profit || 0;
        var pct = (Math.abs(profit) / maxProfit * 100).toFixed(0);
        var color = profit >= 0 ? 'bg-green-400' : 'bg-red-400';
        var marginRate = m.margin_rate || 0;
        var mColor = marginRate >= 20 ? 'text-green-600' : 'text-red-600';
        return '<div class="flex items-center text-sm">'
          + '<span class="w-16 text-gray-600">' + m.month + '</span>'
          + '<div class="flex-1 mx-2 bg-gray-100 rounded-full h-3">'
          + '<div class="' + color + ' h-3 rounded-full" style="width:' + pct + '%"></div></div>'
          + '<span class="w-20 text-right">' + fmtWon(profit) + '</span>'
          + '<span class="w-14 text-right font-bold ' + mColor + '">' + marginRate.toFixed(1) + '%</span>'
          + '</div>';
      }).join('');
    }

    // 저마진 주문
    var tbody = document.getElementById('mgLowMarginBody');
    if (!low_margin_orders || low_margin_orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-4">데이터 없음</td></tr>';
    } else {
      tbody.innerHTML = low_margin_orders.map(function(o) {
        var profit = (o.total_revenue || 0) - (o.total_cost || 0);
        var marginRate = o.margin_rate || 0;
        var marginColor = marginRate < 0 ? 'text-red-600 font-bold' : marginRate < 15 ? 'text-orange-600' : 'text-gray-700';
        return '<tr class="border-t hover:bg-gray-50 cursor-pointer" onclick="location.href=\'/orders?highlight=' + o.order_id + '\'">'
          + '<td class="px-4 py-3 font-medium text-blue-600">' + (o.order_number || '') + '</td>'
          + '<td class="px-4 py-3">' + (o.client_name || '') + '</td>'
          + '<td class="px-4 py-3 text-right">' + fmtWon(o.total_revenue) + '</td>'
          + '<td class="px-4 py-3 text-right">' + fmtWon(o.total_cost) + '</td>'
          + '<td class="px-4 py-3 text-right' + (profit < 0 ? ' text-red-600' : '') + '">' + fmtWon(profit) + '</td>'
          + '<td class="px-4 py-3 text-right ' + marginColor + '">' + marginRate.toFixed(1) + '%</td>'
          + '</tr>';
      }).join('');
    }

    // 거래처별 마진 로드
    loadClientMargin();
  } catch(e) {
    console.error('Margin analysis load error:', e);
  }
}

function gradeColor(grade) {
  if (grade === 'A') return 'bg-green-50 text-green-700';
  if (grade === 'B') return 'bg-blue-50 text-blue-700';
  if (grade === 'C') return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-700';
}

function gradeBadge(grade) {
  return '<span class="px-2 py-0.5 rounded text-xs font-bold ' + gradeColor(grade) + '">' + grade + '</span>';
}

function renderClientMarginTable(tbodyId, clients) {
  var fmtWon = function(n) { return (n || 0).toLocaleString() + '원'; };
  var tbody = document.getElementById(tbodyId);
  if (!clients || clients.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-4">데이터 없음</td></tr>';
    return;
  }
  tbody.innerHTML = clients.map(function(cl) {
    var marginRate = cl.margin_rate || 0;
    var marginColor = marginRate >= 40 ? 'text-green-600' : marginRate >= 20 ? 'text-amber-600' : 'text-red-600';
    var grade = 'D';
    if (marginRate >= 50) grade = 'A';
    else if (marginRate >= 35) grade = 'B';
    else if (marginRate >= 20) grade = 'C';
    return '<tr class="border-t hover:bg-gray-50">'
      + '<td class="px-3 py-2 font-medium">' + (cl.client_name || '') + ' <span class="text-xs text-gray-400">(' + (cl.order_count || 0) + '건)</span></td>'
      + '<td class="px-3 py-2 text-right">' + fmtWon(cl.total_revenue) + '</td>'
      + '<td class="px-3 py-2 text-right font-bold ' + marginColor + '">' + marginRate.toFixed(1) + '%</td>'
      + '<td class="px-3 py-2 text-center">' + gradeBadge(grade) + '</td>'
      + '</tr>';
  }).join('');
}

async function loadClientMargin() {
  var months = document.getElementById('periodMonths').value;
  try {
    var res = await axios.get('/api/reports/margin-by-client?months=' + months);
    if (!res.data.success) return;
    var data = res.data.data;

    renderClientMarginTable('mgTopClientsBody', data.top10);
    renderClientMarginTable('mgBottomClientsBody', data.bottom10);

    // 등급 분포
    var gradeCount = { A: 0, B: 0, C: 0, D: 0 };
    (data.all || []).forEach(function(cl) {
      gradeCount[cl.grade] = (gradeCount[cl.grade] || 0) + 1;
    });
    var total = (data.all || []).length || 1;
    var distEl = document.getElementById('mgGradeDistribution');
    distEl.innerHTML = ['A', 'B', 'C', 'D'].map(function(g) {
      var count = gradeCount[g] || 0;
      var pct = Math.round(count / total * 100);
      var labels = { A: '우수 (50%+)', B: '양호 (35-50%)', C: '보통 (20-35%)', D: '주의 (<20%)' };
      var colors = { A: 'border-green-400 bg-green-50', B: 'border-blue-400 bg-blue-50', C: 'border-amber-400 bg-amber-50', D: 'border-red-400 bg-red-50' };
      return '<div class="border-2 rounded-lg p-4 text-center ' + colors[g] + '">'
        + '<div class="text-3xl font-bold">' + count + '</div>'
        + '<div class="text-sm font-medium mt-1">' + gradeBadge(g) + ' ' + labels[g] + '</div>'
        + '<div class="text-xs text-gray-500 mt-1">' + pct + '%</div>'
        + '</div>';
    }).join('');
  } catch(e) {
    console.error('Client margin load error:', e);
  }
}

// 6. Receivables Analysis (미수금 분석)
async function loadReceivablesAnalysis() {
  try {
    var res = await axios.get('/api/reports/receivables-analysis?months=' + getMonths());
    if (!res.data.success) return;
    var d = res.data.data;

    // 요약 카드
    document.getElementById('rcTotalAR').textContent = fmt(d.summary.total_ar) + '원';
    document.getElementById('rcARClients').textContent = d.summary.ar_client_count + '곳';
    document.getElementById('rcMonthBilled').textContent = fmt(d.summary.month_billed) + '원';
    document.getElementById('rcMonthCollected').textContent = fmt(d.summary.month_collected) + '원';

    // Aging 차트
    var agingEl = document.getElementById('rcAgingChart');
    var totalAR = d.summary.total_ar || 1;
    var agingColors = ['bg-green-400', 'bg-amber-400', 'bg-orange-400', 'bg-red-500'];
    agingEl.innerHTML = d.aging.map(function(a, i) {
      var pct = Math.round((a.amount / totalAR) * 100);
      return '<div>'
        + '<div class="flex justify-between text-sm mb-1">'
        + '<span class="font-medium">' + a.label + '</span>'
        + '<span class="text-gray-600">' + a.count + '곳 / ' + fmt(a.amount) + '원</span>'
        + '</div>'
        + '<div class="h-4 bg-gray-200 rounded-full overflow-hidden">'
        + '<div class="h-full ' + agingColors[i] + ' rounded-full" style="width:' + Math.max(pct, 2) + '%"></div>'
        + '</div>'
        + '<div class="text-right text-xs text-gray-400">' + pct + '%</div>'
        + '</div>';
    }).join('');

    // 월별 수금 추이
    var trendEl = document.getElementById('rcMonthlyTrend');
    var trend = (d.monthly_trend || []).slice().reverse();
    var maxTrend = Math.max.apply(null, trend.map(function(t) { return Math.max(parseFloat(t.revenue) || 0, parseFloat(t.payments) || 0); })) || 1;
    trendEl.innerHTML = trend.map(function(t) {
      var rev = parseFloat(t.revenue) || 0;
      var pay = parseFloat(t.payments) || 0;
      var revW = Math.round((rev / maxTrend) * 100);
      var payW = Math.round((pay / maxTrend) * 100);
      return '<div class="flex items-center gap-2">'
        + '<span class="w-16 text-xs text-gray-500 text-right">' + t.month + '</span>'
        + '<div class="flex-1">'
        + '<div class="h-3 bg-blue-400 rounded mb-0.5" style="width:' + Math.max(revW, 1) + '%" title="매출: ' + fmt(rev) + '원"></div>'
        + '<div class="h-3 bg-green-400 rounded" style="width:' + Math.max(payW, 1) + '%" title="수금: ' + fmt(pay) + '원"></div>'
        + '</div>'
        + '</div>';
    }).join('') + '<div class="flex gap-4 justify-center mt-2 text-xs text-gray-500">'
      + '<span><span class="inline-block w-3 h-3 bg-blue-400 rounded mr-1"></span>매출</span>'
      + '<span><span class="inline-block w-3 h-3 bg-green-400 rounded mr-1"></span>수금</span></div>';

    // TOP 15 테이블
    var tbody = document.getElementById('rcTopClientsBody');
    tbody.innerHTML = (d.top_clients || []).map(function(cl, i) {
      var balance = parseFloat(cl.balance) || 0;
      var daysClass = (cl.days_overdue || 0) > 90 ? 'text-red-600 font-bold' : (cl.days_overdue || 0) > 60 ? 'text-orange-600' : '';
      return '<tr class="border-t hover:bg-gray-50 cursor-pointer" onclick="location.href=\'/clients/' + cl.id + '\'">'
        + '<td class="px-4 py-3 text-center text-gray-400 font-bold">' + (i+1) + '</td>'
        + '<td class="px-4 py-3 font-medium">' + (cl.client_name || '') + '</td>'
        + '<td class="px-4 py-3 text-right font-bold text-red-600">' + fmt(balance) + '원</td>'
        + '<td class="px-4 py-3 text-right text-sm">' + (cl.last_payment_date || '-') + '</td>'
        + '<td class="px-4 py-3 text-right ' + daysClass + '">' + (cl.days_overdue || '-') + '일</td>'
        + '<td class="px-4 py-3 text-right">' + (cl.collection_count || 0) + '회</td>'
        + '</tr>';
    }).join('');
    if (!d.top_clients || d.top_clients.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">미수금 거래처가 없습니다</td></tr>';
    }
  } catch(e) {
    console.error('Receivables analysis error:', e);
  }
}

// 7. Production Analysis (생산 실적)
async function loadProductionAnalysis() {
  try {
    var res = await axios.get('/api/reports/production-analysis?months=' + getMonths());
    if (!res.data.success) return;
    var d = res.data.data;

    // 요약 카드
    document.getElementById('prOkCount').textContent = fmt(d.summary.ok_count) + '건';
    document.getElementById('prErrorCount').textContent = fmt(d.summary.error_count) + '건';
    document.getElementById('prQualityCount').textContent = fmt(d.summary.quality_issues) + '건';
    document.getElementById('prMaintCost').textContent = fmt(d.summary.maintenance_cost) + '원';

    // 장비별 테이블
    var eqBody = document.getElementById('prEquipmentBody');
    var equipments = d.by_equipment || [];
    if (equipments.length === 0) {
      eqBody.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-gray-400">출력 이벤트 데이터가 없습니다</td></tr>';
    } else {
      eqBody.innerHTML = equipments.map(function(eq) {
        var rate = eq.total > 0 ? Math.round(eq.ok_count / eq.total * 100) : 0;
        var rateColor = rate >= 95 ? 'text-green-600' : rate >= 80 ? 'text-amber-600' : 'text-red-600';
        return '<tr class="border-t hover:bg-gray-50">'
          + '<td class="px-4 py-2 font-medium">' + (eq.printer_name || '-') + '</td>'
          + '<td class="px-4 py-2 text-right">' + fmt(eq.total) + '</td>'
          + '<td class="px-4 py-2 text-right ' + rateColor + '">' + rate + '%</td>'
          + '<td class="px-4 py-2 text-right">' + (eq.active_days || 0) + '일</td>'
          + '</tr>';
      }).join('');
    }

    // 월별 출력 추이
    var monthChart = document.getElementById('prMonthlyChart');
    var months = (d.by_month || []).slice().reverse();
    var maxPrint = Math.max.apply(null, months.map(function(m) { return m.total || 0; })) || 1;
    if (months.length === 0) {
      monthChart.innerHTML = '<div class="text-center text-gray-400 py-4 text-sm">데이터 없음</div>';
    } else {
      monthChart.innerHTML = months.map(function(m) {
        var pct = Math.round((m.total / maxPrint) * 100);
        var okRate = m.total > 0 ? Math.round(m.ok_count / m.total * 100) : 0;
        return '<div class="flex items-center gap-2">'
          + '<span class="w-16 text-xs text-gray-500 text-right">' + m.month + '</span>'
          + '<div class="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">'
          + '<div class="h-full bg-blue-500 rounded-full" style="width:' + Math.max(pct, 2) + '%"></div></div>'
          + '<span class="w-20 text-right text-xs">' + fmt(m.total) + '건</span>'
          + '<span class="w-12 text-right text-xs text-gray-400">' + okRate + '%</span>'
          + '</div>';
      }).join('');
    }

    // 불량 유형 분포
    var defectEl = document.getElementById('prDefectChart');
    var defects = d.defect_types || [];
    if (defects.length === 0) {
      defectEl.innerHTML = '<div class="text-center text-gray-400 py-4 text-sm">불량 데이터가 없습니다</div>';
    } else {
      var maxDefect = Math.max.apply(null, defects.map(function(df) { return df.count || 0; })) || 1;
      defectEl.innerHTML = defects.map(function(df) {
        var pct = Math.round((df.count / maxDefect) * 100);
        return '<div class="flex items-center gap-3">'
          + '<span class="w-20 text-xs text-gray-600 text-right truncate">' + (df.category || '미분류') + '</span>'
          + '<div class="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">'
          + '<div class="h-full bg-red-400 rounded-full" style="width:' + Math.max(pct, 2) + '%"></div></div>'
          + '<span class="w-16 text-right text-xs font-medium">' + df.count + '건</span>'
          + '<span class="w-20 text-right text-xs text-gray-400">' + fmt(parseFloat(df.cost) || 0) + '원</span>'
          + '</div>';
      }).join('');
    }
  } catch(e) {
    console.error('Production analysis error:', e);
  }
}

// 8. Period Comparison (기간 비교)
function initComparison() {
  var input = document.getElementById('cpBaseMonth');
  if (input) {
    var now = new Date();
    var lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    input.value = lastMonth.getFullYear() + '-' + String(lastMonth.getMonth() + 1).padStart(2, '0');
  }
}

async function loadComparison() {
  var baseMonth = document.getElementById('cpBaseMonth').value;
  var compareType = document.getElementById('cpCompareType').value;
  if (!baseMonth) { showToast('기준월을 선택하세요', 'warning'); return; }

  try {
    var res = await axios.get('/api/reports/period-comparison?base_month=' + baseMonth + '&compare=' + compareType);
    if (!res.data.success) return;
    var d = res.data.data;

    // 기간 라벨
    var label = document.getElementById('cpPeriodLabel');
    label.textContent = d.base_month + ' vs ' + d.comp_month + ' (' + (d.compare_type === 'YOY' ? '전년 동기' : '전월') + ')';

    // KPI 카드
    function changeArrow(base, comp) {
      if (comp === 0) return base > 0 ? '<span class="text-green-500 text-sm">NEW</span>' : '';
      var pct = Math.round((base - comp) / comp * 100);
      if (pct > 0) return '<span class="text-green-500 text-sm"><i class="fas fa-arrow-up"></i> +' + pct + '%</span>';
      if (pct < 0) return '<span class="text-red-500 text-sm"><i class="fas fa-arrow-down"></i> ' + pct + '%</span>';
      return '<span class="text-gray-400 text-sm">-</span>';
    }

    var kpis = [
      { label: '매출액', base: d.base.revenue, comp: d.comp.revenue, color: 'blue', suffix: '원' },
      { label: '주문수', base: d.base.order_count, comp: d.comp.order_count, color: 'gray', suffix: '건' },
      { label: '수금액', base: d.base.payments, comp: d.comp.payments, color: 'green', suffix: '원' },
      { label: '마진율', base: d.base.margin_rate, comp: d.comp.margin_rate, color: 'purple', suffix: '%', noFmt: true },
    ];

    var kpiEl = document.getElementById('cpKPICards');
    kpiEl.innerHTML = kpis.map(function(k) {
      var baseVal = k.noFmt ? k.base : fmt(k.base);
      return '<div class="bg-white rounded-lg shadow p-4">'
        + '<div class="text-sm text-gray-500">' + k.label + '</div>'
        + '<div class="text-2xl font-bold text-' + k.color + '-600">' + baseVal + k.suffix + '</div>'
        + '<div class="flex justify-between items-center mt-1">'
        + '<span class="text-xs text-gray-400">비교: ' + (k.noFmt ? k.comp : fmt(k.comp)) + k.suffix + '</span>'
        + changeArrow(k.base, k.comp)
        + '</div></div>';
    }).join('');

    // 카테고리 비교
    var catBody = document.getElementById('cpCategoryBody');
    var cats = d.categories || [];
    if (cats.length === 0) {
      catBody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-4">데이터 없음</td></tr>';
    } else {
      catBody.innerHTML = cats.map(function(cat) {
        var changeColor = cat.change > 0 ? 'text-green-600' : cat.change < 0 ? 'text-red-600' : '';
        var arrow = cat.change > 0 ? '▲' : cat.change < 0 ? '▼' : '-';
        return '<tr class="border-t hover:bg-gray-50">'
          + '<td class="px-4 py-2 font-medium">' + (cat.category || '기타') + '</td>'
          + '<td class="px-4 py-2 text-right">' + fmt(cat.base_revenue) + '원</td>'
          + '<td class="px-4 py-2 text-right text-gray-500">' + fmt(cat.comp_revenue) + '원</td>'
          + '<td class="px-4 py-2 text-right ' + changeColor + '">' + arrow + ' ' + fmt(Math.abs(cat.change)) + '원 (' + cat.change_rate + '%)</td>'
          + '</tr>';
      }).join('');
    }

    // 거래처 변동
    function renderClientChanges(elId, clients, isIncrease) {
      var el = document.getElementById(elId);
      if (!clients || clients.length === 0) {
        el.innerHTML = '<div class="text-sm text-gray-400">변동 없음</div>';
        return;
      }
      el.innerHTML = clients.map(function(cl) {
        var color = isIncrease ? 'text-green-600' : 'text-red-600';
        return '<div class="flex justify-between items-center text-sm py-1 border-b border-gray-100">'
          + '<span class="font-medium">' + cl.client_name + '</span>'
          + '<span class="' + color + ' font-bold">' + (cl.change > 0 ? '+' : '') + fmt(cl.change) + '원</span>'
          + '</div>';
      }).join('');
    }

    renderClientChanges('cpIncreased', d.clients.increased, true);
    renderClientChanges('cpDecreased', d.clients.decreased, false);

  } catch(e) {
    console.error('Period comparison error:', e);
  }
}

initComparison();

async function exportReportCsv() {
  try {
    var period = document.getElementById('periodMonths')?.value || '6';
    var res = await authFetch('/api/reports/monthly-summary/csv?months=' + period);
    if (!res.ok) throw new Error('Export failed');
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '월별매출분석_' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch(e) {
    showToast('CSV 내보내기 실패: ' + e.message, 'error');
  }
}

// Initial load
loadAllReports();
