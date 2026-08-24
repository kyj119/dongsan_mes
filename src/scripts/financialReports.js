// 손익계산서 페이지

// Skeleton loading
(function() {
  var el = document.getElementById('pnlTableBody');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(8, 5);
})();

var pnlData = null;
var monthlyData = null;
var monthlyChart = null;
var currentFinancialTab = 'pnl';

function fmt(n) { return window.fmtNum(n); }
function escFin(str) { return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
// 초기화는 파일 맨 아래에서 실행 (window.* 함수 정의 이후)

// ============================================================
// P&L 탭 — 손익계산서
// ============================================================

window.loadPnl = async function() {
  var elFromDate = document.getElementById('pnlFromDate'); if (!elFromDate) { console.warn('[financialReports] #pnlFromDate not found'); return; }
  var elToDate = document.getElementById('pnlToDate'); if (!elToDate) { console.warn('[financialReports] #pnlToDate not found'); return; }
  var from = elFromDate.value;
  var to = elToDate.value;

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
  // 2026-08-24 재설계 — 판관비=통장·카드 계정분류(정본), 매출원가=매입(장비 제외)+직접원가, 재고증감 미반영
  var revenue = d.revenue.total || 0;
  var cogs = d.cogs.total || 0;
  var grossProfit = d.gross_profit.total || 0;
  var grossMargin = d.gross_profit.margin_pct || 0;
  var sga = d.operating_expense.total || 0;
  var opProfit = d.operating_profit.total || 0;
  var opMargin = d.operating_profit.margin_pct || 0;
  var netProfit = d.net_profit.total || 0;
  var netMargin = d.net_profit.margin_pct || 0;

  // 전제·한계 배너
  var cavEl = document.getElementById('pnlCaveats');
  if (cavEl) {
    var cav = d.caveats || {};
    var msgs = [];
    msgs.push('판관비 = <b>통장·카드 계정분류</b>(대출원금·부가세·가수금·리스료 등 비(非)비용 제외)');
    if (d.scope === 'GROUP') msgs.push('전체 법인 = <b>그룹 연결</b> — 법인간 거래 양변 제거(내부매출 ' + fmt(d.revenue.internal_removed || 0) + '원)');
    else if (d.revenue.internal_included) msgs.push('별도 기준 — 내부거래 포함(내부매출 ' + fmt(d.revenue.internal_included) + '원)');
    if (cav.stock_change_unreflected) msgs.push('<b>재고증감 미반영</b>(실사 앵커 없음) — 재고가 늘었으면 이익 과소, 줄었으면 과대');
    if (cav.unclassified_amount > 0) msgs.push('<span class="text-red-700">미분류 출금·카드 ' + fmt(cav.unclassified_amount) + '원 — 판관비가 그만큼 과소일 수 있음</span>');
    if (cav.interest_understated) msgs.push('이자비용은 계정 실측분만(통장 「대출상환」 혼입분 제외 — 과소)');
    cavEl.innerHTML = '<i class="fas fa-info-circle mr-1"></i>' + msgs.join(' · ');
    cavEl.classList.remove('hidden');
  }

  // KPI 카드
  var elRevenue = document.getElementById('pnlRevenue'); if (!elRevenue) { console.warn('[financialReports] #pnlRevenue not found'); return; }
  elRevenue.textContent = fmt(revenue);
  var elRevenueCount = document.getElementById('pnlRevenueCount'); if (!elRevenueCount) { console.warn('[financialReports] #pnlRevenueCount not found'); return; }
  elRevenueCount.textContent = (d.revenue.order_count || 0) + '건 청구';
  var elGrossProfit = document.getElementById('pnlGrossProfit'); if (!elGrossProfit) { console.warn('[financialReports] #pnlGrossProfit not found'); return; }
  elGrossProfit.textContent = fmt(grossProfit);
  var elGrossMargin = document.getElementById('pnlGrossProfitMargin'); if (!elGrossMargin) { console.warn('[financialReports] #pnlGrossProfitMargin not found'); return; }
  elGrossMargin.textContent = grossMargin.toFixed(1) + '%';
  var opProfitEl = document.getElementById('pnlOperatingProfit');
  if (opProfitEl) {
    opProfitEl.textContent = fmt(opProfit);
    opProfitEl.className = 'text-lg font-bold ' + (opProfit < 0 ? 'text-red-600' : 'text-gray-900');
  }
  var elOpMargin = document.getElementById('pnlOperatingMargin'); if (!elOpMargin) { console.warn('[financialReports] #pnlOperatingMargin not found'); return; }
  elOpMargin.textContent = opMargin.toFixed(1) + '%';
  var netProfitEl = document.getElementById('pnlNetProfit');
  if (netProfitEl) {
    netProfitEl.textContent = fmt(netProfit);
    netProfitEl.className = 'text-lg font-bold ' + (netProfit < 0 ? 'text-red-600' : 'text-gray-900');
  }
  var elNetMargin = document.getElementById('pnlNetMargin'); if (!elNetMargin) { console.warn('[financialReports] #pnlNetMargin not found'); return; }
  elNetMargin.textContent = netMargin.toFixed(1) + '%';

  // P&L 테이블
  function row(label, amount, note, cls) {
    return '<tr class="' + (cls || 'border-b border-gray-100') + '">'
      + '<td class="px-3 py-2">' + label + '</td>'
      + '<td class="px-3 py-2 text-right" style="font-variant-numeric:tabular-nums;">' + fmt(amount) + '</td>'
      + '<td class="px-3 py-2 text-right text-gray-500">' + (note || '') + '</td>'
      + '</tr>';
  }
  var html = '';
  html += row('<span class="font-medium">매출(외부)</span>', revenue, (d.revenue.order_count || 0) + '건', 'border-b border-gray-300');
  html += row('<span class="text-gray-600 text-[11px]">&nbsp;&nbsp;매입(외부)</span>', d.cogs.purchase || 0, '');
  if (d.cogs.equip_excluded) html += row('<span class="text-gray-600 text-[11px]">&nbsp;&nbsp;장비 제외(자산→감가상각)</span>', -(d.cogs.equip_excluded || 0), 'GDS-EQ-*');
  html += row('<span class="text-gray-600 text-[11px]">&nbsp;&nbsp;직접원가(원재료비·외주)</span>', d.cogs.direct || 0, '통장·카드');
  html += row('<span class="text-gray-600 text-[11px]">&nbsp;&nbsp;= 매출원가</span>', cogs, (d.cogs.margin_pct || 0).toFixed(1) + '% · 재고증감 미반영');
  html += row('<span class="font-semibold">매출총이익</span>', grossProfit, grossMargin.toFixed(1) + '%', 'border-t-2 border-gray-300 font-semibold');
  html += row('<span class="text-gray-600 text-[11px]">&nbsp;&nbsp;판관비(통장·카드)</span>', d.operating_expense.categories_total || 0, '');
  html += row('<span class="text-gray-600 text-[11px]">&nbsp;&nbsp;감가상각비</span>', d.operating_expense.depreciation || 0, '');
  html += row('<span class="font-semibold' + (opProfit < 0 ? ' text-red-600' : '') + '">영업이익</span>', opProfit, opMargin.toFixed(1) + '%', 'border-t-2 border-gray-300 font-semibold' + (opProfit < 0 ? ' text-red-600' : ''));
  html += row('<span class="text-gray-600 text-[11px]">&nbsp;&nbsp;이자비용·기부금</span>', d.non_operating.total || 0, '실측분만(과소)');
  html += row('<span class="text-gray-600 text-[11px]">&nbsp;&nbsp;법인세</span>', d.tax.total || 0, '');
  html += row('<span class="font-bold text-base' + (netProfit < 0 ? ' text-red-600' : '') + '">당기순이익</span>', netProfit, netMargin.toFixed(1) + '%', 'border-t-4 border-gray-300 font-bold' + (netProfit < 0 ? ' text-red-600' : ''));

  var elPnlBody = document.getElementById('pnlTableBody'); if (!elPnlBody) { console.warn('[financialReports] #pnlTableBody not found'); return; }
  elPnlBody.innerHTML = html;

  // 판관비 계정 상세
  var sgaBody = document.getElementById('pnlSgaBody');
  if (sgaBody) {
    var cats = d.sga_categories || [];
    if (cats.length === 0) {
      sgaBody.innerHTML = '<tr><td colspan="3" class="px-3 py-4 text-center text-gray-400">분류된 판관비 없음</td></tr>';
    } else {
      sgaBody.innerHTML = cats.map(function(cEnt) {
        return '<tr class="border-b border-gray-100">'
          + '<td class="px-3 py-1.5">' + escFin(cEnt.name) + '</td>'
          + '<td class="px-3 py-1.5 text-right" style="font-variant-numeric:tabular-nums;">' + fmt(cEnt.amount) + '</td>'
          + '<td class="px-3 py-1.5 text-right text-gray-500">' + (cEnt.count || 0) + '</td>'
          + '</tr>';
      }).join('');
    }
  }
}

// ============================================================
// 월별 추이 탭
// ============================================================

window.loadMonthlyPnl = async function() {
  var elMonthlyYear = document.getElementById('monthlyYear'); if (!elMonthlyYear) { console.warn('[financialReports] #monthlyYear not found'); return; }
  var year = elMonthlyYear.value;

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
  var avgMargin = yearTotal.revenue > 0 ? (yearTotal.profit / yearTotal.revenue) * 100 : 0;

  // KPI 카드
  var elYearRev = document.getElementById('monthlyYearRevenue'); if (!elYearRev) { console.warn('[financialReports] #monthlyYearRevenue not found'); return; }
  elYearRev.textContent = fmt(yearTotal.revenue);
  var elYearProfit = document.getElementById('monthlyYearProfit'); if (!elYearProfit) { console.warn('[financialReports] #monthlyYearProfit not found'); return; }
  elYearProfit.textContent = fmt(yearTotal.profit);
  var elAvgRev = document.getElementById('monthlyAvgRevenue'); if (!elAvgRev) { console.warn('[financialReports] #monthlyAvgRevenue not found'); return; }
  elAvgRev.textContent = fmt(avgRevenue);
  var elAvgMargin = document.getElementById('monthlyAvgMargin'); if (!elAvgMargin) { console.warn('[financialReports] #monthlyAvgMargin not found'); return; }
  elAvgMargin.textContent = avgMargin.toFixed(1) + '%';

  // 월별 테이블 — 매출/매출원가/판관비/영업이익/이익률
  var html = '';
  monthly.forEach(function(m) {
    var margin = m.margin_pct || 0;
    var marginColor = margin < 0 ? 'text-red-600' : '';
    html += '<tr class="border-b border-gray-100 hover:bg-blue-50/30">'
      + '<td class="px-3 py-2 text-center font-medium">' + m.month + '월</td>'
      + '<td class="px-3 py-2 text-right" style="font-variant-numeric:tabular-nums;">' + fmt(m.revenue) + '</td>'
      + '<td class="px-3 py-2 text-right" style="font-variant-numeric:tabular-nums;">' + fmt(m.cogs || 0) + '</td>'
      + '<td class="px-3 py-2 text-right" style="font-variant-numeric:tabular-nums;">' + fmt(m.sga || 0) + '</td>'
      + '<td class="px-3 py-2 text-right ' + ((m.profit || 0) < 0 ? 'text-red-600' : '') + '" style="font-variant-numeric:tabular-nums;">' + fmt(m.profit) + '</td>'
      + '<td class="px-3 py-2 text-right ' + marginColor + '" style="font-variant-numeric:tabular-nums;">' + margin.toFixed(1) + '%</td>'
      + '</tr>';
  });

  var elMonthlyBody = document.getElementById('finMonthlyTableBody'); if (!elMonthlyBody) { console.warn('[financialReports] #finMonthlyTableBody not found'); return; }
  elMonthlyBody.innerHTML = html || '<tr><td colspan="6" class="px-3 py-12 text-center"><div class="flex flex-col items-center"><i class="fas fa-chart-line text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 text-sm">데이터가 없습니다</p></div></td></tr>';
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

  // 영업이익 = m.profit (서버가 매출-매출원가-판관비로 계산)
  var operatingData = monthly.map(function(m) { return m.profit || 0; });

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

  var elCash = document.getElementById('snapshotCash'); if (!elCash) { console.warn('[financialReports] #snapshotCash not found'); return; }
  elCash.textContent = fmt(cash);
  var elAr = document.getElementById('snapshotAr'); if (!elAr) { console.warn('[financialReports] #snapshotAr not found'); return; }
  elAr.textContent = fmt(ar);
  // 선수금(부채) — 미수금과 상계 금지라 보조 줄로 별도 표기(accounting 허브와 동일 규약). 0이면 숨김
  var elArAdv = document.getElementById('snapshotArAdvance');
  if (elArAdv) {
    var advVal = liabilities.advance_received || 0;
    elArAdv.classList.toggle('hidden', !(advVal > 0));
    if (advVal > 0) elArAdv.textContent = '선수금 ' + fmt(advVal) + ' 별도(부채)';
  }
  var elInv = document.getElementById('snapshotInventory'); if (!elInv) { console.warn('[financialReports] #snapshotInventory not found'); return; }
  elInv.textContent = fmt(inventory);
  var elAp = document.getElementById('snapshotAp'); if (!elAp) { console.warn('[financialReports] #snapshotAp not found'); return; }
  elAp.textContent = fmt(ap);
  // 선급금(자산) — 매입채무와 상계하면 양변 동시 과소(부호 분리 2026-08-24). 0이면 숨김
  var elApPre = document.getElementById('snapshotApPrepaid');
  if (elApPre) {
    var preVal = assets.prepaid_expenses || 0;
    elApPre.classList.toggle('hidden', !(preVal > 0));
    if (preVal > 0) elApPre.textContent = '선급금 ' + fmt(preVal) + ' 별도(자산)';
  }
  var elLoans = document.getElementById('snapshotLoans'); if (!elLoans) { console.warn('[financialReports] #snapshotLoans not found'); return; }
  elLoans.textContent = fmt(loans);

  var netAssetsColor = netAssets < 0 ? 'color:#DC2626;' : 'color:#16A34A;';
  var elNetAssets = document.getElementById('snapshotNetAssets'); if (!elNetAssets) { console.warn('[financialReports] #snapshotNetAssets not found'); return; }
  elNetAssets.style.cssText = netAssetsColor + 'font-variant-numeric:tabular-nums;';
  elNetAssets.textContent = fmt(netAssets);

  // 타임스탐프
  if (d.snapshot_at) {
    var date = new Date(d.snapshot_at);
    var timeStr = date.toLocaleString('ko-KR');
    var elTimestamp = document.getElementById('snapshotTimestamp'); if (!elTimestamp) { console.warn('[financialReports] #snapshotTimestamp not found'); return; }
    elTimestamp.textContent = '기준: ' + timeStr;
  }

  showToast('재무 스냅샷이 갱신되었습니다.', 'success');
}

// ============================================================
// 탭 전환
// ============================================================

window.switchFinancialTab = function(tab) {
  currentFinancialTab = tab;
  // 손익허브 이식 시 reports.ts와 ID 충돌 회피: monthly 탭만 fin* 프리픽스(맵으로 명시).
  var idMap = {
    pnl:      { btn: 'tabPnl',        panel: 'pnlPanel' },
    monthly:  { btn: 'finTabMonthly', panel: 'finMonthlyPanel' },
    snapshot: { btn: 'tabSnapshot',   panel: 'snapshotPanel' }
  };
  ['pnl', 'monthly', 'snapshot'].forEach(function(t) {
    var btn = document.getElementById(idMap[t].btn);
    var panel = document.getElementById(idMap[t].panel);
    if (!btn || !panel) { console.warn('[financialReports] tab elements not found: ' + t); return; }

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
      var elMy = document.getElementById('monthlyYear'); if (!elMy) { console.warn('[financialReports] #monthlyYear not found'); return; }
      var year = elMy.value;
      url = '/api/financial/export/csv?type=monthly&year=' + year;
      filename = '월별추이_' + year + '.csv';
    } else {
      var elFd = document.getElementById('pnlFromDate'); if (!elFd) { console.warn('[financialReports] #pnlFromDate not found'); return; }
      var elTd = document.getElementById('pnlToDate'); if (!elTd) { console.warn('[financialReports] #pnlToDate not found'); return; }
      var from = elFd.value;
      var to = elTd.value;
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
// 손익허브(/reports) 이식 시 '손익계산서' 탭 첫 진입까지 지연(window.__finDefer). 단독 /financial-reports는 즉시.
// ============================================================
window.__finInit = function() {
  if (window.__finInit._done) return; // 멱등
  window.__finInit._done = true;
  var year = new Date().getFullYear();
  var sel = document.getElementById('monthlyYear');
  if (!sel) { console.warn('[financialReports] #monthlyYear not found'); return; }
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
  var elInitFrom = document.getElementById('pnlFromDate'); if (!elInitFrom) { console.warn('[financialReports] #pnlFromDate not found'); return; }
  var elInitTo = document.getElementById('pnlToDate'); if (!elInitTo) { console.warn('[financialReports] #pnlToDate not found'); return; }
  elInitFrom.value = new Date(from.getTime() - from.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  elInitTo.value = new Date(to.getTime() - to.getTimezoneOffset() * 60000).toISOString().split('T')[0];

  window.loadPnl();
};
if (!window.__finDefer) {
  window.__finInit();
}
