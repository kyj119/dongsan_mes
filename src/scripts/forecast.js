var currentFcTab = 'forecast';

function switchFcTab(tab) {
  currentFcTab = tab;
  var tabs = ['forecast', 'capacity', 'clientFc'];
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

function fmt(n) { return (n || 0).toLocaleString(); }

// 1. 수주 예측
async function loadForecast() {
  try {
    var res = await axios.get('/api/forecast/order-forecast');
    if (!res.data.success) return;
    var d = res.data.data;
    var fc = d.forecast;

    // 요약 카드
    document.getElementById('fcRevenue').textContent = fmt(fc.revenue) + '원';
    document.getElementById('fcOrders').textContent = fmt(fc.order_count) + '건';
    document.getElementById('fcMethod').textContent = '예측 방법: ' + fc.method;
    document.getElementById('fcMonth').textContent = fc.month;

    var growthEl = document.getElementById('fcGrowth');
    var gr = fc.growth_rate || 0;
    growthEl.textContent = (gr > 0 ? '+' : '') + gr + '%';
    growthEl.className = 'text-2xl font-bold ' + (gr > 0 ? 'text-green-600' : gr < 0 ? 'text-red-600' : 'text-gray-600');

    // 월별 추이 차트 (실적 + 예측)
    var monthly = d.monthly || [];
    var allData = monthly.concat([{ month: fc.month, revenue: fc.revenue, order_count: fc.order_count, isForecast: true }]);
    var maxRev = Math.max.apply(null, allData.map(function(m) { return m.revenue || 0; })) || 1;
    var chartEl = document.getElementById('fcMonthlyChart');
    chartEl.innerHTML = allData.map(function(m) {
      var pct = Math.round((m.revenue / maxRev) * 100);
      var color = m.isForecast ? 'bg-blue-300 border-2 border-dashed border-blue-500' : 'bg-blue-500';
      var label = m.isForecast ? ' <span class="text-blue-500 text-xs font-bold">(예측)</span>' : '';
      return '<div class="flex items-center gap-3">'
        + '<span class="w-20 text-xs text-gray-500 text-right">' + m.month + label + '</span>'
        + '<div class="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">'
        + '<div class="h-full ' + color + ' rounded-full" style="width:' + Math.max(pct, 2) + '%"></div></div>'
        + '<span class="w-28 text-right text-xs font-medium">' + fmt(m.revenue) + '원</span>'
        + '<span class="w-16 text-right text-xs text-gray-400">' + fmt(m.order_count) + '건</span>'
        + '</div>';
    }).join('');

    // 요일별 차트
    var dow = d.day_of_week || [];
    var dowLabels = ['일', '월', '화', '수', '목', '금', '토'];
    var maxDow = Math.max.apply(null, dow.map(function(d) { return parseFloat(d.avg_orders) || 0; })) || 1;
    var dowEl = document.getElementById('fcDowChart');
    dowEl.innerHTML = dow.map(function(d) {
      var avg = parseFloat(d.avg_orders) || 0;
      var pct = Math.round((avg / maxDow) * 100);
      var dayLabel = dowLabels[d.dow] || d.dow;
      var color = d.dow === 0 || d.dow === 6 ? 'bg-gray-300' : 'bg-green-500';
      return '<div class="flex items-center gap-3">'
        + '<span class="w-8 text-sm font-medium text-center">' + dayLabel + '</span>'
        + '<div class="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">'
        + '<div class="h-full ' + color + ' rounded-full" style="width:' + Math.max(pct, 2) + '%"></div></div>'
        + '<span class="w-20 text-right text-xs">' + avg.toFixed(1) + '건/일</span>'
        + '</div>';
    }).join('');

    // 카테고리별 예측
    var cats = d.category_forecast || [];
    var maxCat = Math.max.apply(null, cats.map(function(c) { return c.forecast_revenue || 0; })) || 1;
    var catEl = document.getElementById('fcCategoryChart');
    if (cats.length === 0) {
      catEl.innerHTML = '<div class="text-center py-12"><i class="fas fa-inbox text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 text-sm">데이터 없음</p></div>';
    } else {
      catEl.innerHTML = cats.map(function(c) {
        var pct = Math.round((c.forecast_revenue / maxCat) * 100);
        var trendColor = c.trend > 0 ? 'text-green-600' : c.trend < 0 ? 'text-red-600' : 'text-gray-500';
        var trendArrow = c.trend > 0 ? '▲' : c.trend < 0 ? '▼' : '-';
        return '<div class="flex items-center gap-2">'
          + '<span class="w-20 text-xs text-gray-600 truncate" title="' + c.category + '">' + c.category + '</span>'
          + '<div class="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">'
          + '<div class="h-full bg-purple-500 rounded-full" style="width:' + Math.max(pct, 2) + '%"></div></div>'
          + '<span class="w-24 text-right text-xs font-medium">' + fmt(c.forecast_revenue) + '원</span>'
          + '<span class="w-16 text-right text-xs ' + trendColor + '">' + trendArrow + c.trend + '%</span>'
          + '</div>';
      }).join('');
    }
  } catch(e) {
    console.error('Forecast error:', e);
  }
}

// 2. 용량 분석
async function loadCapacity() {
  try {
    var months = document.getElementById('capMonths').value || '3';
    var res = await axios.get('/api/forecast/capacity-analysis?months=' + months);
    if (!res.data.success) return;
    var d = res.data.data;

    // 장비 테이블
    var eqBody = document.getElementById('capEquipmentBody');
    var equipment = d.equipment || [];
    if (equipment.length === 0) {
      eqBody.innerHTML = '<tr><td colspan="7" class="px-4 py-12 text-center"><div class="flex flex-col items-center"><i class="fas fa-print text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 text-sm">출력 데이터가 없습니다</p></div></td></tr>';
    } else {
      eqBody.innerHTML = equipment.map(function(eq) {
        var utilColor = eq.utilization >= 80 ? 'bg-red-500' : eq.utilization >= 50 ? 'bg-amber-500' : 'bg-green-500';
        var rateColor = eq.success_rate >= 95 ? 'text-green-600' : eq.success_rate >= 80 ? 'text-amber-600' : 'text-red-600';
        return '<tr class="border-t hover:bg-gray-50">'
          + '<td class="px-4 py-3 font-medium">' + eq.printer_name + '</td>'
          + '<td class="px-4 py-3 text-right">' + fmt(eq.total_prints) + '</td>'
          + '<td class="px-4 py-3 text-right ' + rateColor + '">' + eq.success_rate + '%</td>'
          + '<td class="px-4 py-3 text-right">' + eq.active_days + '일</td>'
          + '<td class="px-4 py-3 text-right">' + eq.avg_daily + '</td>'
          + '<td class="px-4 py-3 text-right font-bold">' + eq.peak_daily + '</td>'
          + '<td class="px-4 py-3"><div class="flex items-center gap-2">'
          + '<div class="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">'
          + '<div class="h-full ' + utilColor + ' rounded-full" style="width:' + Math.min(eq.utilization, 100) + '%"></div></div>'
          + '<span class="text-xs w-10 text-right">' + eq.utilization + '%</span></div></td>'
          + '</tr>';
      }).join('');
    }

    // 주간별 추이
    var weekEl = document.getElementById('capWeeklyChart');
    var weeks = d.weekly_trend || [];
    if (weeks.length === 0) {
      weekEl.innerHTML = '<div class="text-center py-12"><i class="fas fa-calendar-week text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 text-sm">데이터 없음</p></div>';
    } else {
      var maxWeek = Math.max.apply(null, weeks.map(function(w) { return w.total || 0; })) || 1;
      weekEl.innerHTML = weeks.map(function(w) {
        var pct = Math.round((w.total / maxWeek) * 100);
        return '<div class="flex items-center gap-2">'
          + '<span class="w-20 text-xs text-gray-500 text-right">' + w.week + '</span>'
          + '<div class="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">'
          + '<div class="h-full bg-green-500 rounded-full" style="width:' + Math.max(pct, 2) + '%"></div></div>'
          + '<span class="w-16 text-right text-xs">' + fmt(w.total) + '건</span>'
          + '</div>';
      }).join('');
    }

    // 시간대별 분포
    var hourEl = document.getElementById('capHourlyChart');
    var hours = d.hourly_distribution || [];
    if (hours.length === 0) {
      hourEl.innerHTML = '<div class="text-center py-12"><i class="fas fa-clock text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 text-sm">데이터 없음</p></div>';
    } else {
      var maxHour = Math.max.apply(null, hours.map(function(h) { return h.count || 0; })) || 1;
      hourEl.innerHTML = hours.map(function(h) {
        var pct = Math.round((h.count / maxHour) * 100);
        var isPeak = pct >= 80;
        var color = isPeak ? 'bg-red-500' : pct >= 50 ? 'bg-amber-400' : 'bg-blue-400';
        return '<div class="flex items-center gap-2">'
          + '<span class="w-10 text-xs text-gray-500 text-right">' + h.hour + '시</span>'
          + '<div class="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">'
          + '<div class="h-full ' + color + ' rounded-full" style="width:' + Math.max(pct, 1) + '%"></div></div>'
          + '<span class="w-14 text-right text-xs">' + fmt(h.count) + (isPeak ? ' 🔥' : '') + '</span>'
          + '</div>';
      }).join('');
    }
  } catch(e) {
    console.error('Capacity error:', e);
  }
}

// 3. 거래처별 예측
async function loadClientForecast() {
  try {
    var res = await axios.get('/api/forecast/client-forecast');
    if (!res.data.success) return;
    var d = res.data.data;
    var clients = d.clients || [];

    // 테이블
    var tbody = document.getElementById('cfClientsBody');
    if (clients.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-12 text-center"><div class="flex flex-col items-center"><i class="fas fa-users text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 text-sm">데이터가 없습니다</p></div></td></tr>';
    } else {
      tbody.innerHTML = clients.map(function(cl, i) {
        var trendColor = cl.trend > 0 ? 'text-green-600' : cl.trend < 0 ? 'text-red-600' : 'text-gray-500';
        var trendArrow = cl.trend > 0 ? '▲' : cl.trend < 0 ? '▼' : '-';
        var riskBadge = '';
        if (cl.risk === 'LOW_FREQUENCY') riskBadge = '<span class="px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700">저빈도</span>';
        else if (cl.risk === 'DECLINING') riskBadge = '<span class="px-2 py-0.5 rounded text-xs bg-red-50 text-red-700">감소세</span>';
        else riskBadge = '<span class="text-xs text-green-500">정상</span>';

        return '<tr class="border-t hover:bg-gray-50 cursor-pointer" onclick="location.href=\'/clients/' + cl.client_id + '\'">'
          + '<td class="px-4 py-3 text-center text-gray-400 font-bold">' + (i+1) + '</td>'
          + '<td class="px-4 py-3 font-medium">' + cl.client_name + '</td>'
          + '<td class="px-4 py-3 text-right">' + fmt(cl.total_revenue) + '원</td>'
          + '<td class="px-4 py-3 text-right text-gray-500">' + fmt(cl.avg_monthly) + '원</td>'
          + '<td class="px-4 py-3 text-right font-bold text-blue-600">' + fmt(cl.forecast_revenue) + '원</td>'
          + '<td class="px-4 py-3 text-right ' + trendColor + '">' + trendArrow + ' ' + Math.abs(cl.trend) + '%</td>'
          + '<td class="px-4 py-3 text-right">' + cl.frequency + '/6개월</td>'
          + '<td class="px-4 py-3 text-center">' + riskBadge + '</td>'
          + '</tr>';
      }).join('');
    }

    // 미니 추이 차트 (상위 5개)
    var trendEl = document.getElementById('cfTrendChart');
    var top5 = clients.slice(0, 5);
    if (top5.length === 0) {
      trendEl.innerHTML = '<div class="text-center py-12"><i class="fas fa-chart-line text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 text-sm">데이터 없음</p></div>';
    } else {
      trendEl.innerHTML = top5.map(function(cl) {
        var months = cl.months || [];
        var maxRev = Math.max.apply(null, months.map(function(m) { return m.revenue || 0; })) || 1;
        var bars = months.map(function(m) {
          var h = Math.max(Math.round((m.revenue / maxRev) * 40), 2);
          return '<div class="flex flex-col items-center">'
            + '<div class="w-8 bg-blue-400 rounded-t" style="height:' + h + 'px" title="' + m.month + ': ' + fmt(m.revenue) + '원"></div>'
            + '<span class="text-[9px] text-gray-400 mt-0.5">' + m.month.slice(5) + '</span>'
            + '</div>';
        }).join('');
        return '<div class="flex items-center gap-4 py-2 border-b border-gray-100">'
          + '<span class="w-32 text-sm font-medium truncate">' + cl.client_name + '</span>'
          + '<div class="flex items-end gap-1">' + bars + '</div>'
          + '<span class="text-xs text-gray-500 ml-auto">' + fmt(cl.forecast_revenue) + '원/월</span>'
          + '</div>';
      }).join('');
    }
  } catch(e) {
    console.error('Client forecast error:', e);
  }
}

// 초기 로드
loadForecast();
loadCapacity();
loadClientForecast();
