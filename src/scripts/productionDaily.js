// 일일 생산 리포트

function getToday() {
    return new Date().toISOString().substring(0, 10);
}

function setToday() {
    document.getElementById('reportDate').value = getToday();
    loadDailySummary();
}

function changeDate(delta) {
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
        document.getElementById('kpiSqm').textContent = d.total_sqm.toLocaleString(undefined, {maximumFractionDigits:1});
        document.getElementById('kpiRate').textContent = d.completion_rate + '%';
        document.getElementById('kpiCardDone').textContent = d.card_completed;
        document.getElementById('kpiCardTotal').textContent = d.card_total;
        document.getElementById('kpiEquipCount').textContent = d.by_equipment.length;
        document.getElementById('kpiOverdue').textContent = d.overdue_orders.length;

        // 장비별 테이블
        renderEquipmentTable(d.by_equipment);

        // 시간대별 차트
        renderHourlyChart(d.by_hour);

        // 미완료 주문
        renderOverdueTable(d.overdue_orders);

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

    // 8시~20시 범위
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
        var today = new Date().toISOString().substring(0, 10);
        var isOverdue = o.due_date < today;
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

// 초기화
document.getElementById('reportDate').value = getToday();
loadDailySummary();
