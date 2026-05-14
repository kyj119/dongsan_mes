// 손익계산서 페이지
var pnlData = null;
var monthlyData = null;
var monthlyChart = null;
var currentFinancialTab = 'pnl';

function fmt(n) { return (n || 0).toLocaleString(); }
// 초기화는 파일 맨 아래에서 실행 (window.* 함수 정의 이후)

// ============================================================
// P&L 탭 — 손익계산서
// ============================================================

window.loadPnl = async function() {
  var from = document.getElementById('pnlFromDate').value;
  var to = document.getElementById('pnlToDate').value;

  if (!from || !to) {
    showToast('기간을 선택해주세요.', 'warning');
    return;
  }

  try {
    var res = await axios.get('/api/financial/pnl?from=' + from + '&to=' + to);
    if (!res.data.success) {
      showToast('조회 실패: ' + (res.data.error || '알 수 없는 오류'), 'error');
      return;
    }
    pnlData = res.data.data;
    renderPnl(pnlData);
  } catch (e) {
    console.error('pnl error:', e);
    showToast('조회 오류: ' + (e.response?.data?.error || e.message), 'error');
  }
};

function renderPnl(d) {
  var revenue = d.revenue.total || 0;
  var cogs = d.cogs.total || 0;
  var grossProfit = d.gross_profit.total || 0;
  var grossMargin = d.gross_profit.margin_pct || 0;
  var opEx = d.operating_expense.total || 0;
  var opProfit = d.operating_profit.total || 0;
  var opMargin = d.operating_profit.margin_pct || 0;
  var netProfit = d.net_profit.total || 0;
  var netMargin = d.net_profit.margin_pct || 0;

  // KPI 카드
  document.getElementById('pnlRevenue').textContent = fmt(revenue);
  document.getElementById('pnlRevenueCount').textContent = d.revenue.order_count + '건';

  document.getElementById('pnlGrossProfit').textContent = fmt(grossProfit);
  document.getElementById('pnlGrossProfitMargin').textContent = grossMargin.toFixed(1) + '%';

  var opProfitColor = opProfit < 0 ? 'color:#DC2626;' : '';
  var netProfitColor = netProfit < 0 ? 'color:#DC2626;' : '';
  var opProfitEl = document.getElementById('pnlOperatingProfit');
  opProfitEl.style.cssText = opProfitColor + 'font-variant-numeric:tabular-nums;';
  opProfitEl.className = opProfit < 0 ? '' : 'text-gray-900';
  opProfitEl.textContent = fmt(opProfit);
  document.getElementById('pnlOperatingMargin').textContent = opMargin.toFixed(1) + '%';

  var netProfitEl = document.getElementById('pnlNetProfit');
  netProfitEl.style.cssText = netProfitColor + 'font-variant-numeric:tabular-nums;';
  netProfitEl.className = netProfit < 0 ? '' : 'text-gray-900';
  netProfitEl.textContent = fmt(netProfit);
  document.getElementById('pnlNetMargin').textContent = netMargin.toFixed(1) + '%';

  // P&L 테이블
  var html = '';
  html += '<tr class="border-b border-gray-300">'
    + '<td class="px-3 py-2 font-medium">매출</td>'
    + '<td class="px-3 py-2 text-right font-variant-numeric:tabular-nums;">' + fmt(revenue) + '</td>'
    + '<td class="px-3 py-2 text-right text-gray-500">' + d.revenue.order_count + '건</td>'
    + '</tr>';

  html += '<tr class="border-b border-gray-100">'
    + '<td class="px-3 py-2 text-gray-600 text-[11px]">  매출원가</td>'
    + '<td class="px-3 py-2 text-right font-variant-numeric:tabular-nums;">' + fmt(cogs) + '</td>'
    + '<td class="px-3 py-2 text-right text-gray-500">' + d.cogs.margin_pct.toFixed(1) + '%</td>'
    + '</tr>';

  html += '<tr class="border-t-2 border-gray-300 font-semibold">'
    + '<td class="px-3 py-2">매출총이익</td>'
    + '<td class="px-3 py-2 text-right font-variant-numeric:tabular-nums;">' + fmt(grossProfit) + '</td>'
    + '<td class="px-3 py-2 text-right">' + grossMargin.toFixed(1) + '%</td>'
    + '</tr>';

  html += '<tr class="border-b border-gray-100">'
    + '<td class="px-3 py-2 text-gray-600 text-[11px]">  매입비</td>'
    + '<td class="px-3 py-2 text-right font-variant-numeric:tabular-nums;">' + fmt(d.operating_expense.purchase_total || 0) + '</td>'
    + '<td class="px-3 py-2 text-right text-gray-500">참고용</td>'
    + '</tr>';

  html += '<tr class="border-b border-gray-100">'
    + '<td class="px-3 py-2 text-gray-600 text-[11px]">  경비</td>'
    + '<td class="px-3 py-2 text-right font-variant-numeric:tabular-nums;">' + fmt(d.operating_expense.expense_approved || 0) + '</td>'
    + '<td class="px-3 py-2"></td>'
    + '</tr>';

  html += '<tr class="border-b border-gray-100">'
    + '<td class="px-3 py-2 text-gray-600 text-[11px]">  인건비</td>'
    + '<td class="px-3 py-2 text-right font-variant-numeric:tabular-nums;">' + fmt(d.operating_expense.payroll || 0) + '</td>'
    + '<td class="px-3 py-2"></td>'
    + '</tr>';

  html += '<tr class="border-b border-gray-100">'
    + '<td class="px-3 py-2 text-gray-600 text-[11px]">  고정비</td>'
    + '<td class="px-3 py-2 text-right font-variant-numeric:tabular-nums;">' + fmt(d.operating_expense.fixed_cost || 0) + '</td>'
    + '<td class="px-3 py-2"></td>'
    + '</tr>';

  var opProfitClass = opProfit < 0 ? 'text-red-600' : '';
  html += '<tr class="border-t-2 border-gray-300 font-semibold ' + opProfitClass + '">'
    + '<td class="px-3 py-2">영업이익</td>'
    + '<td class="px-3 py-2 text-right font-variant-numeric:tabular-nums;">' + fmt(opProfit) + '</td>'
    + '<td class="px-3 py-2 text-right">' + opMargin.toFixed(1) + '%</td>'
    + '</tr>';

  var netProfitClass = netProfit < 0 ? 'text-red-600' : '';
  html += '<tr class="border-t-4 border-gray-300 font-bold text-base ' + netProfitClass + '">'
    + '<td class="px-3 py-3">당기순이익</td>'
    + '<td class="px-3 py-3 text-right font-variant-numeric:tabular-nums;">' + fmt(netProfit) + '</td>'
    + '<td class="px-3 py-3 text-right">' + netMargin.toFixed(1) + '%</td>'
    + '</tr>';

  document.getElementById('pnlTableBody').innerHTML = html;
}

// ============================================================
// 월별 추이 탭
// ============================================================

window.loadMonthlyPnl = async function() {
  var year = document.getElementById('monthlyYear').value;

  try {
    var res = await axios.get('/api/financial/pnl/monthly?year=' + year);
    if (!res.data.success) {
      showToast('조회 실패: ' + (res.data.error || '알 수 없는 오류'), 'error');
      return;
    }
    monthlyData = res.data.data;
    renderMonthlyPnl(monthlyData);
    renderMonthlyChart(monthlyData);
  } catch (e) {
    console.error('monthly pnl error:', e);
    showToast('조회 오류: ' + (e.response?.data?.error || e.message), 'error');
  }
};

function renderMonthlyPnl(d) {
  var yearTotal = d.total;
  var monthly = d.monthly || [];

  var avgRevenue = monthly.length > 0 ? yearTotal.revenue / 12 : 0;
  var avgMargin = yearTotal.profit > 0 && yearTotal.revenue > 0
    ? (yearTotal.profit / yearTotal.revenue) * 100
    : 0;

  // KPI 카드
  document.getElementById('monthlyYearRevenue').textContent = fmt(yearTotal.revenue);
  document.getElementById('monthlyYearProfit').textContent = fmt(yearTotal.profit);
  document.getElementById('monthlyAvgRevenue').textContent = fmt(avgRevenue);
  document.getElementById('monthlyAvgMargin').textContent = avgMargin.toFixed(1) + '%';

  // 월별 테이블
  var html = '';
  monthly.forEach(function(m) {
    var margin = m.margin_pct || 0;
    var marginColor = margin < 0 ? 'text-red-600' : '';
    html += '<tr class="border-b border-gray-100 hover:bg-blue-50/30">'
      + '<td class="px-3 py-2 text-center font-medium">' + m.month + '월</td>'
      + '<td class="px-3 py-2 text-right font-variant-numeric:tabular-nums;">' + fmt(m.revenue) + '</td>'
      + '<td class="px-3 py-2 text-right font-variant-numeric:tabular-nums;">' + fmt(m.expense + (m.payroll || 0)) + '</td>'
      + '<td class="px-3 py-2 text-right font-variant-numeric:tabular-nums;">' + fmt(m.profit) + '</td>'
      + '<td class="px-3 py-2 text-right font-variant-numeric:tabular-nums; ' + marginColor + '">' + margin.toFixed(1) + '%</td>'
      + '</tr>';
  });

  document.getElementById('monthlyTableBody').innerHTML = html || '<tr><td colspan="5" class="px-3 py-12 text-center"><div class="flex flex-col items-center"><i class="fas fa-chart-line text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 text-sm">데이터가 없습니다</p></div></td></tr>';
}

function renderMonthlyChart(d) {
  // Chart.js 로드 (CDN)
  if (typeof Chart === 'undefined') {
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js';
    script.onload = function() {
      drawMonthlyChart(d);
    };
    document.head.appendChild(script);
  } else {
    drawMonthlyChart(d);
  }
}

function drawMonthlyChart(d) {
  var monthly = d.monthly || [];
  var labels = monthly.map(function(m) { return m.month + '월'; });
  var revenueData = monthly.map(function(m) { return m.revenue; });
  var profitData = monthly.map(function(m) { return m.profit; });

  // 영업이익 = 매출 - (경비+인건비)
  var operatingData = monthly.map(function(m) {
    return m.revenue - (m.expense || 0) - (m.payroll || 0);
  });

  var canvas = document.getElementById('monthlyTrendChart');
  if (!canvas) return;

  if (monthlyChart) monthlyChart.destroy();

  var ctx = canvas.getContext('2d');
  monthlyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '매출',
          data: revenueData,
          borderColor: '#2563EB',
          backgroundColor: 'rgba(37, 99, 235, 0.05)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#2563EB',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
        },
        {
          label: '영업이익',
          data: operatingData,
          borderColor: '#16A34A',
          backgroundColor: 'rgba(22, 163, 74, 0.05)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#16A34A',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
        },
        {
          label: '순이익',
          data: profitData,
          borderColor: '#DC2626',
          backgroundColor: 'rgba(220, 38, 38, 0.05)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#DC2626',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: 12 },
            padding: 15,
            color: '#6B7280',
            usePointStyle: true,
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 11 },
            color: '#9CA3AF',
            callback: function(value) {
              return (value / 1000000).toFixed(0) + 'M';
            }
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)',
            drawBorder: false,
          }
        },
        x: {
          ticks: {
            font: { size: 11 },
            color: '#9CA3AF',
          },
          grid: {
            display: false,
            drawBorder: false,
          }
        }
      }
    }
  });
}

// ============================================================
// 재무 스냅샷 탭
// ============================================================

window.loadBalanceSnapshot = async function() {
  try {
    var res = await axios.get('/api/financial/balance-snapshot');
    if (!res.data.success) {
      showToast('조회 실패: ' + (res.data.error || '알 수 없는 오류'), 'error');
      return;
    }
    var data = res.data.data;
    renderBalanceSnapshot(data);
  } catch (e) {
    console.error('snapshot error:', e);
    showToast('조회 오류: ' + (e.response?.data?.error || e.message), 'error');
  }
};

function renderBalanceSnapshot(d) {
  var assets = d.assets || {};
  var liabilities = d.liabilities || {};
  var netAssets = d.net_assets || 0;

  var cash = assets.cash || 0;
  var ar = assets.accounts_receivable || 0;
  var inventory = assets.inventory || 0;
  var ap = liabilities.accounts_payable || 0;
  var loans = liabilities.loans || 0;

  document.getElementById('snapshotCash').textContent = fmt(cash);
  document.getElementById('snapshotAr').textContent = fmt(ar);
  document.getElementById('snapshotInventory').textContent = fmt(inventory);
  document.getElementById('snapshotAp').textContent = fmt(ap);
  document.getElementById('snapshotLoans').textContent = fmt(loans);

  var netAssetsColor = netAssets < 0 ? 'color:#DC2626;' : 'color:#16A34A;';
  document.getElementById('snapshotNetAssets').style.cssText = netAssetsColor + 'font-variant-numeric:tabular-nums;';
  document.getElementById('snapshotNetAssets').textContent = fmt(netAssets);

  // 타임스탐프
  if (d.snapshot_at) {
    var date = new Date(d.snapshot_at);
    var timeStr = date.toLocaleString('ko-KR');
    document.getElementById('snapshotTimestamp').textContent = '기준: ' + timeStr;
  }

  showToast('재무 스냅샷이 갱신되었습니다.', 'success');
}

// ============================================================
// 탭 전환
// ============================================================

window.switchFinancialTab = function(tab) {
  currentFinancialTab = tab;
  ['pnl', 'monthly', 'snapshot'].forEach(function(t) {
    var btn = document.getElementById('tab' + (t === 'pnl' ? 'Pnl' : t === 'monthly' ? 'Monthly' : 'Snapshot'));
    var panel = document.getElementById(t + 'Panel');

    if (t === tab) {
      btn.className = 'px-4 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600 flex items-center gap-2';
      panel.classList.remove('hidden');

      // 월별 추이 탭에서는 차트 리드로우
      if (tab === 'monthly' && monthlyChart) {
        setTimeout(function() { monthlyChart.resize(); }, 100);
      }
    } else {
      btn.className = 'px-4 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center gap-2';
      panel.classList.add('hidden');
    }
  });
};

// ============================================================
// CSV 내보내기
// ============================================================
window.exportFinancialCsv = async function() {
  try {
    var url;
    var filename;
    if (currentFinancialTab === 'monthly') {
      var year = document.getElementById('monthlyYear').value;
      url = '/api/financial/export/csv?type=monthly&year=' + year;
      filename = '월별추이_' + year + '.csv';
    } else {
      var from = document.getElementById('pnlFromDate').value;
      var to = document.getElementById('pnlToDate').value;
      if (!from || !to) {
        showToast('기간을 선택해주세요.', 'warning');
        return;
      }
      url = '/api/financial/export/csv?type=pnl&from=' + from + '&to=' + to;
      filename = '손익계산서_' + from + '_' + to + '.csv';
    }
    var res = await authFetch(url);
    if (!res.ok) throw new Error('서버 오류');
    var blob = await res.blob();
    var blobUrl = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);
  } catch(e) {
    showToast('CSV 내보내기 실패: ' + e.message, 'error');
  }
};

// ============================================================
// 초기화 (모든 window.* 함수 정의 이후 실행)
// ============================================================
(function init() {
  var year = new Date().getFullYear();
  var sel = document.getElementById('monthlyYear');
  for (var y = year - 2; y <= year + 2; y++) {
    var opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + '년';
    if (y === year) opt.selected = true;
    sel.appendChild(opt);
  }

  var today = new Date();
  var from = new Date(today.getFullYear(), today.getMonth(), 1);
  var to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  document.getElementById('pnlFromDate').value = from.toISOString().split('T')[0];
  document.getElementById('pnlToDate').value = to.toISOString().split('T')[0];

  window.loadPnl();
})();
