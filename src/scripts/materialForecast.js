// 원단 소모 예측

var allMaterialData = [];

async function loadMaterialForecast() {
    try {
        var res = await axios.get('/api/forecast/material-consumption');
        if (!res.data.success) return;
        allMaterialData = res.data.data.materials || [];

        // KPI
        var danger = 0, warning = 0, good = 0;
        allMaterialData.forEach(function(m) {
            if (m.status === 'danger') danger++;
            else if (m.status === 'warning') warning++;
            else good++;
        });
        document.getElementById('kpiTotal').textContent = allMaterialData.length;
        document.getElementById('kpiDanger').textContent = danger;
        document.getElementById('kpiWarning').textContent = warning;
        document.getElementById('kpiGood').textContent = good;

        renderMaterialTable();
        populateTrendSelector();

    } catch (err) {
        console.error('원단 소모 예측 로딩 실패:', err);
    }
}

function renderMaterialTable() {
    var el = document.getElementById('materialTable');
    if (allMaterialData.length === 0) {
        el.innerHTML = '<div class="text-center py-4 text-gray-400 text-sm">원단 데이터 없음. 품목 관리에서 원단(MATERIAL)을 등록하세요.</div>';
        return;
    }

    // 위험 → 주의 → 양호 순 정렬
    var sorted = allMaterialData.slice().sort(function(a, b) {
        var order = { danger: 0, warning: 1, good: 2 };
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return a.days_remaining - b.days_remaining;
    });

    var html = '<div class="overflow-x-auto"><table class="w-full text-sm">';
    html += '<thead class="bg-gray-50"><tr>';
    html += '<th class="px-3 py-2 text-left text-xs font-semibold text-gray-600">상태</th>';
    html += '<th class="px-3 py-2 text-left text-xs font-semibold text-gray-600">원단명</th>';
    html += '<th class="px-3 py-2 text-right text-xs font-semibold text-gray-600">폭</th>';
    html += '<th class="px-3 py-2 text-right text-xs font-semibold text-gray-600">현재고(yd)</th>';
    html += '<th class="px-3 py-2 text-right text-xs font-semibold text-gray-600">일평균 소모</th>';
    html += '<th class="px-3 py-2 text-right text-xs font-semibold text-gray-600">예상 잔여일</th>';
    html += '<th class="px-3 py-2 text-right text-xs font-semibold text-gray-600">확정주문 수요</th>';
    html += '</tr></thead><tbody class="divide-y">';

    sorted.forEach(function(m) {
        var statusBadge = '';
        var rowBg = '';
        if (m.status === 'danger') {
            statusBadge = '<span class="px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700">위험</span>';
            rowBg = 'bg-red-50';
        } else if (m.status === 'warning') {
            statusBadge = '<span class="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-700">주의</span>';
            rowBg = 'bg-amber-50';
        } else {
            statusBadge = '<span class="px-2 py-0.5 text-xs font-bold rounded-full bg-green-100 text-green-700">양호</span>';
        }

        var widthCm = m.width_mm ? Math.round(m.width_mm / 10) + 'cm' : '-';
        var daysText = m.days_remaining >= 999 ? '소모 없음' : m.days_remaining + '일';

        html += '<tr class="' + rowBg + ' hover:bg-gray-100">';
        html += '<td class="px-3 py-2">' + statusBadge + '</td>';
        html += '<td class="px-3 py-2 font-medium">' + m.item_name + '</td>';
        html += '<td class="px-3 py-2 text-right text-gray-600">' + widthCm + '</td>';
        html += '<td class="px-3 py-2 text-right font-medium">' + m.current_stock_yd.toLocaleString() + '</td>';
        html += '<td class="px-3 py-2 text-right">' + m.avg_daily_consumption_yd + ' yd/일</td>';
        html += '<td class="px-3 py-2 text-right font-bold ' + (m.status === 'danger' ? 'text-red-600' : m.status === 'warning' ? 'text-amber-600' : 'text-green-600') + '">' + daysText + '</td>';
        html += '<td class="px-3 py-2 text-right">' + (m.confirmed_demand_yd > 0 ? m.confirmed_demand_yd + ' yd' : '-') + '</td>';
        html += '</tr>';
    });

    html += '</tbody></table></div>';
    el.innerHTML = html;
}

function populateTrendSelector() {
    var sel = document.getElementById('trendMaterial');
    sel.innerHTML = '<option value="">원단 선택...</option>';
    allMaterialData.forEach(function(m) {
        if (m.trend_30d && m.trend_30d.length > 0) {
            sel.innerHTML += '<option value="' + m.item_id + '">' + m.item_name + ' (' + Math.round(m.width_mm/10) + 'cm)</option>';
        }
    });
}

function renderTrendChart() {
    var el = document.getElementById('trendChart');
    var itemId = parseInt(document.getElementById('trendMaterial').value);
    if (!itemId) {
        el.innerHTML = '<div class="text-center py-4 text-gray-400 text-sm">원단을 선택하세요</div>';
        return;
    }

    var mat = allMaterialData.find(function(m) { return m.item_id === itemId; });
    if (!mat || !mat.trend_30d || mat.trend_30d.length === 0) {
        el.innerHTML = '<div class="text-center py-4 text-gray-400 text-sm">소모 이력 없음</div>';
        return;
    }

    var data = mat.trend_30d;
    var maxYd = 0;
    data.forEach(function(d) { if (d.yd > maxYd) maxYd = d.yd; });

    var html = '<div class="flex items-end gap-0.5" style="height:170px;">';
    data.forEach(function(d) {
        var pct = maxYd > 0 ? Math.round(d.yd / maxYd * 100) : 0;
        var barH = Math.max(pct, d.yd > 0 ? 3 : 0);
        var dateShort = d.date.substring(5); // MM-DD

        html += '<div class="flex-1 flex flex-col items-center">';
        html += '<div class="text-xs text-gray-500 mb-0.5" style="font-size:9px;">' + (d.yd > 0 ? d.yd : '') + '</div>';
        html += '<div class="w-full bg-indigo-500 rounded-t" style="height:' + barH + '%" title="' + d.date + ': ' + d.yd + 'yd"></div>';
        html += '<div class="text-gray-400 mt-0.5" style="font-size:8px;writing-mode:vertical-lr;">' + dateShort + '</div>';
        html += '</div>';
    });
    html += '</div>';
    html += '<div class="text-center text-xs text-gray-500 mt-2">일평균: ' + mat.avg_daily_consumption_yd + ' yd/일 | 잔여: ' + (mat.days_remaining >= 999 ? '소모없음' : mat.days_remaining + '일') + '</div>';
    el.innerHTML = html;
}

function filterMaterials() {
    var searchEl = document.getElementById('materialSearch');
    var statusEl = document.getElementById('materialStatusFilter');
    if (!searchEl || !statusEl) return;

    var keyword = searchEl.value.trim().toLowerCase();
    var statusVal = statusEl.value;

    var tbody = document.querySelector('#materialTable tbody');
    if (!tbody) return;

    var rows = tbody.querySelectorAll('tr');
    rows.forEach(function(row) {
        var nameCell = row.querySelectorAll('td')[1];
        var name = nameCell ? nameCell.textContent.toLowerCase() : '';

        var statusCell = row.querySelectorAll('td')[0];
        var statusText = statusCell ? statusCell.textContent.trim() : '';
        var rowStatus = '';
        if (statusText === '위험') rowStatus = 'danger';
        else if (statusText === '주의') rowStatus = 'warning';
        else if (statusText === '양호') rowStatus = 'good';

        var matchSearch = !keyword || name.indexOf(keyword) !== -1;
        var matchStatus = !statusVal || rowStatus === statusVal;

        row.style.display = (matchSearch && matchStatus) ? '' : 'none';
    });
}

// 초기화
loadMaterialForecast();
