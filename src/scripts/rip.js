var eventsPage = 1;
var autoRefreshTimer = null;

// Skeleton loading
(function() {
  var el = document.getElementById('agentsBody');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(3, 7);
  var el2 = document.getElementById('eventsBody');
  if (el2 && window.dsSkeleton) el2.innerHTML = dsSkeleton.table(5, 8);
})();

// Tabs
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("tab-active"));
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
        btn.classList.add("tab-active");
        document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");
    });
});

function formatTime(dt) {
    if (!dt) return "-";
    const d = new Date(dt);
    const pad = n => String(n).padStart(2, "0");
    return pad(d.getMonth()+1) + "/" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

function statusBadge(s) {
    if (s === "OK") return '<span class="px-2 py-0.5 rounded text-xs font-medium badge-ok">OK</span>';
    if (s === "ERROR") return '<span class="px-2 py-0.5 rounded text-xs font-medium badge-error">ERROR</span>';
    return '<span class="px-2 py-0.5 rounded text-xs font-medium badge-cancel">CANCEL</span>';
}

async function loadStats() {
    try {
        const res = await axios.get("/api/print-events/stats");
        const d = res.data.data;
        document.getElementById("kpiOk").textContent = d.today.ok_count || 0;
        document.getElementById("kpiError").textContent = d.today.error_count || 0;
        document.getElementById("kpiCancel").textContent = d.today.cancel_count || 0;
        document.getElementById("kpiTotal").textContent = d.today.total_count || 0;
        renderChart(d.daily);
    } catch(e) {
        console.error("Stats error", e);
    }
}

function renderChart(daily) {
    const box = document.getElementById("dailyChart");
    if (!daily || daily.length === 0) {
        box.innerHTML = '<div class="text-gray-400 text-center py-8">데이터 없음</div>';
        return;
    }
    const maxVal = Math.max(...daily.map(d => d.total_count || 1));
    box.innerHTML = daily.map(d => {
        const okW = Math.round(((d.ok_count||0)/maxVal)*100);
        const errW = Math.round(((d.error_count||0)/maxVal)*100);
        const canW = Math.round(((d.cancel_count||0)/maxVal)*100);
        return '<div class="flex items-center gap-3">' +
            '<span class="w-20 text-sm text-gray-600 shrink-0">' + d.date + '</span>' +
            '<div class="flex-1 flex h-6 rounded overflow-hidden bg-gray-100">' +
                (okW ? '<div class="bar-ok h-full" style="width:'+okW+'%"></div>' : '') +
                (errW ? '<div class="bar-error h-full" style="width:'+errW+'%"></div>' : '') +
                (canW ? '<div class="bar-cancel h-full" style="width:'+canW+'%"></div>' : '') +
            '</div>' +
            '<span class="w-16 text-sm text-right text-gray-700 shrink-0">' + (d.total_count||0) + '건</span>' +
        '</div>';
    }).join("");
}

async function loadAgents() {
    try {
        const res = await axios.get("/api/print-events/agents");
        const d = res.data.data;
        document.getElementById("agentTotal").textContent = d.summary.total;
        document.getElementById("agentOnline").textContent = d.summary.online;
        document.getElementById("agentOffline").textContent = d.summary.offline;

        // Populate filter dropdown
        const sel = document.getElementById("filterAgent");
        const cur = sel.value;
        sel.innerHTML = '<option value="">전체 장비</option>';
        d.agents.forEach(a => {
            const label = a.equipment_id ? a.equipment_id + ' (' + a.agent_id + ')' : a.agent_id;
            sel.innerHTML += '<option value="' + a.agent_id + '">' + label + '</option>';
        });
        sel.value = cur;

        // Offline warning
        const offlineAgents = d.agents.filter(a => a.computed_status === "offline");
        if (offlineAgents.length > 0) {
            document.getElementById("offlineWarning").classList.remove("hidden");
            document.getElementById("offlineNames").textContent = offlineAgents.map(a => a.agent_id).join(", ");
        } else {
            document.getElementById("offlineWarning").classList.add("hidden");
        }

        // Agent table
        const tbody = document.getElementById("agentsBody");
        if (d.agents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-400">등록된 에이전트가 없습니다</td></tr>';
            return;
        }
        tbody.innerHTML = d.agents.map(a => {
            const isOnline = a.computed_status === "online";
            return '<tr class="border-b hover:bg-gray-50">' +
                '<td class="px-4 py-2"><span class="px-2 py-0.5 rounded text-xs font-medium ' + (isOnline ? 'badge-online' : 'badge-offline') + '">' + (isOnline ? '온라인' : '오프라인') + '</span></td>' +
                '<td class="px-4 py-2 font-bold text-blue-700">' + (a.equipment_id || '<span class="text-gray-400 font-normal">미설정</span>') + '</td>' +
                '<td class="px-4 py-2 text-gray-600">' + a.agent_id + '</td>' +
                '<td class="px-4 py-2 text-gray-600">' + (a.ip_address || '-') + '</td>' +
                '<td class="px-4 py-2 text-gray-600">' + (a.agent_version || '-') + '</td>' +
                '<td class="px-4 py-2 text-gray-600">' + formatTime(a.last_seen_at) + '</td>' +
                '<td class="px-4 py-2 text-gray-500 text-xs">' + (a.print_log_path || '-') + '</td>' +
            '</tr>';
        }).join("");
    } catch(e) {
        console.error("Agents error", e);
    }
}

async function loadEvents() {
    try {
        const status = document.getElementById("filterStatus").value;
        const agent = document.getElementById("filterAgent").value;
        const date = document.getElementById("filterDate").value;
        let url = "/api/print-events?page=" + eventsPage + "&limit=50";
        if (status) url += "&status=" + status;
        if (agent) url += "&agent_id=" + encodeURIComponent(agent);
        if (date) url += "&date=" + date;

        const res = await axios.get(url);
        const events = res.data.data;
        const pg = res.data.pagination;

        document.getElementById("eventsTotal").textContent = pg.total;
        document.getElementById("currentPageNum").textContent = pg.page;
        document.getElementById("totalPagesNum").textContent = pg.total_pages;
        document.getElementById("prevPage").disabled = pg.page <= 1;
        document.getElementById("nextPage").disabled = pg.page >= pg.total_pages;

        const tbody = document.getElementById("eventsBody");
        if (events.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-gray-400">이벤트가 없습니다</td></tr>';
            return;
        }
        tbody.innerHTML = events.map(ev => {
            const matched = ev.card_id ? '<span class="text-green-600 text-xs"><i class="fas fa-check-circle mr-1"></i>' + ev.card_number + '</span>' : (ev.card_number ? '<span class="text-amber-600 text-xs"><i class="fas fa-question-circle mr-1"></i>' + ev.card_number + '</span>' : '<span class="text-gray-400 text-xs">-</span>');
            const size = ev.output_width && ev.output_height ? ev.output_width + ' x ' + ev.output_height : '-';
            const equipLabel = ev.equipment_id ? '<span class="font-bold text-blue-700">' + ev.equipment_id + '</span>' : '<span class="text-gray-500">' + ev.agent_id + '</span>';
            var layoutInfo = '';
            if (ev.tile_count > 0) {
                layoutInfo = '<span class="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">'
                    + ev.tile_index + '/' + ev.tile_count + ' 타일</span>';
            } else if (ev.copy_total > 1) {
                layoutInfo = '<span class="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">'
                    + ev.copy_columns + '\u00d7' + ev.copy_rows + ' (' + ev.copy_total + '매)</span>';
                if (ev.print_status === 'CANCEL') {
                    if (ev.actual_printed !== null && ev.actual_printed !== undefined) {
                        layoutInfo += '<br><span class="text-xs text-orange-600">'
                            + '\u2714 실제 ' + ev.actual_printed + '매 (' + ev.actual_printed_by + ')</span>';
                    } else {
                        layoutInfo += '<br><button onclick="showActualPrintedInput(' + ev.id + ', ' + ev.copy_total + ')" '
                            + 'class="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded hover:bg-orange-200 mt-1">'
                            + '<i class="fas fa-edit mr-1"></i>매수 입력</button>';
                    }
                }
            } else {
                layoutInfo = '<span class="text-xs text-gray-400">1매</span>';
            }
            return '<tr class="border-b hover:bg-gray-50">' +
                '<td class="px-4 py-2 text-gray-600 whitespace-nowrap">' + formatTime(ev.print_completed_at || ev.created_at) + '</td>' +
                '<td class="px-4 py-2">' + equipLabel + '</td>' +
                '<td class="px-4 py-2 text-gray-600">' + (ev.printer_name || '-') + '</td>' +
                '<td class="px-4 py-2 text-gray-700 max-w-xs truncate" title="' + (ev.file_path || '') + '">' + (ev.file_name || '-') + '</td>' +
                '<td class="px-4 py-2">' + statusBadge(ev.print_status) + '</td>' +
                '<td class="px-4 py-2">' + matched + '</td>' +
                '<td class="px-4 py-2">' + layoutInfo + '</td>' +
                '<td class="px-4 py-2 text-gray-500 text-xs">' + size + '</td>' +
            '</tr>';
        }).join("");
    } catch(e) {
        console.error("Events error", e);
        document.getElementById("eventsBody").innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-red-500">이벤트 로드 실패</td></tr>';
    }
}

function changePage(delta) {
    eventsPage += delta;
    if (eventsPage < 1) eventsPage = 1;
    loadEvents();
}

async function showActualPrintedInput(eventId, copyTotal) {
    var input = prompt('실제 출력된 매수를 입력하세요 (전체 ' + copyTotal + '매 중):', '');
    if (input === null) return;
    var num = parseInt(input);
    if (isNaN(num) || num < 0 || num > copyTotal) {
        showToast('0 ~ ' + copyTotal + ' 사이의 숫자를 입력하세요.', 'warning');
        return;
    }
    try {
        var resp = await axios.patch('/api/print-events/' + eventId + '/actual-printed', {
            actual_printed: num
        });
        if (resp.data.success) {
            showToast('저장되었습니다: ' + num + '매', 'success');
            loadEvents();
        }
    } catch (err) {
        showToast('저장 실패: ' + (err.response ? err.response.data.error : err.message), 'error');
    }
}

async function refreshAll() {
    document.getElementById("lastRefresh").textContent = "갱신 중...";
    await Promise.all([loadStats(), loadAgents(), loadEvents()]);
    const now = new Date();
    document.getElementById("lastRefresh").textContent = "마지막 갱신: " + now.getHours() + ":" + String(now.getMinutes()).padStart(2,"0") + ":" + String(now.getSeconds()).padStart(2,"0");
}

// Initial load
refreshAll();

// Auto-refresh every 15 seconds
autoRefreshTimer = setInterval(refreshAll, 15000);
