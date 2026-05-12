var equipList = [];
var currentEquipId = null;
var currentDetail = null;
var currentTab = 'list';

// 배치도 탭 전용
var zones = [];
var editMode = false;

// ─── 상태 맵핑 ─────────────────────────────────────────────────────────────

var STATUS_MAP = {
    RUNNING: { label: '가동중', color: 'green', bg: 'bg-green-50 text-green-700', dot: 'bg-green-500' },
    IDLE: { label: '대기', color: 'yellow', bg: 'bg-amber-50 text-amber-700', dot: 'bg-amber-400' },
    MAINTENANCE: { label: '점검중', color: 'orange', bg: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
    BROKEN: { label: '고장', color: 'red', bg: 'bg-red-50 text-red-700', dot: 'bg-red-500' }
};

var SIZE_MAP = {
    SMALL: { w: 72, h: 28 },   // 1.8m
    LARGE: { w: 128, h: 36 },  // 3.2m (기본)
};

var STATUS_COLORS = {
    RUNNING: '#16a34a',
    IDLE: '#ca8a04',
    MAINTENANCE: 'var(--c-orange)',
    BROKEN: '#dc2626',
};

var HEAD_STATUS_MAP = {
    NORMAL: { label: '정상', bg: 'bg-green-50 text-green-700 border-green-300' },
    CLOGGED: { label: '노즐막힘', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
    REPLACE_NEEDED: { label: '교체필요', bg: 'bg-red-50 text-red-700 border-red-300' },
    REPLACED: { label: '교체완료', bg: 'bg-blue-50 text-blue-700 border-blue-300' }
};

var LOG_TYPE_MAP = {
    MAINTENANCE: { label: '정기 점검', icon: 'fa-wrench', color: 'text-blue-600' },
    REPAIR: { label: '수리', icon: 'fa-tools', color: 'text-orange-600' },
    PART_REPLACEMENT: { label: '부품 교체', icon: 'fa-exchange-alt', color: 'text-purple-600' },
    STATUS_CHANGE: { label: '상태 변경', icon: 'fa-sync-alt', color: 'text-gray-600' },
    INSPECTION: { label: '검사', icon: 'fa-search', color: 'text-cyan-600' }
};

// ─── 탭 전환 ────────────────────────────────────────────────────────────────

function switchTab(tab) {
    currentTab = tab;
    document.getElementById('panelList').classList.toggle('hidden', tab !== 'list');
    document.getElementById('panelLayout').classList.toggle('hidden', tab !== 'layout');
    var panelDashboard = document.getElementById('panelDashboard');
    if (panelDashboard) {
        panelDashboard.classList.toggle('hidden', tab !== 'dashboard');
    }

    document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.classList.remove('bg-white', 'shadow', 'text-gray-800');
        btn.classList.add('text-gray-500');
    });
    var tabIdMap = { 'list': 'tabList', 'layout': 'tabLayout', 'dashboard': 'tabDashboard' };
    var activeBtn = document.getElementById(tabIdMap[tab]);
    if (activeBtn) {
        activeBtn.classList.add('bg-white', 'shadow', 'text-gray-800');
        activeBtn.classList.remove('text-gray-500');
    }

    if (tab === 'layout') {
        loadLayout();
    } else if (tab === 'dashboard') {
        loadEquipmentData();
    }
}

// ─── 데이터 로드 ────────────────────────────────────────────────────────────

async function loadEquipment() {
    try {
        var res = await axios.get('/api/rip/equipment');
        equipList = res.data.data || [];
        renderTable();
        if (currentTab === 'layout') loadLayout();
    } catch(e) {
        document.getElementById('equipTableBody').innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-400">로딩 실패</td></tr>';
    }
}

// ─── 목록 테이블 렌더링 ─────────────────────────────────────────────────────

function renderTable() {
    var tbody = document.getElementById('equipTableBody');
    if (equipList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">등록된 장비가 없습니다</td></tr>';
        return;
    }
    var html = '';
    equipList.forEach(function(eq) {
        var st = STATUS_MAP[eq.equipment_status] || STATUS_MAP.IDLE;
        var isOnline = eq.agent_status === 'ONLINE';
        var agentBadge = isOnline
            ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs"><span class="w-2 h-2 rounded-full bg-green-500 inline-block"></span>ON</span>'
            : '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs"><span class="w-2 h-2 rounded-full bg-gray-400 inline-block"></span>OFF</span>';
        var statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full ' + st.bg + ' text-xs font-medium"><span class="w-2 h-2 rounded-full ' + st.dot + ' inline-block"></span>' + st.label + '</span>';
        var headInfo = eq.head_count ? eq.head_count + '개' : '-';

        html += '<tr class="border-b hover:bg-gray-50 cursor-pointer" onclick="openDetail(\'' + eq.id + '\')">'
            + '<td class="px-4 py-3 font-mono text-xs text-gray-600">' + (eq.id || '') + '</td>'
            + '<td class="px-4 py-3 font-medium">' + (eq.name || '') + '</td>'
            + '<td class="px-4 py-3 text-sm text-gray-600">' + (eq.printer_name || '<span class="text-gray-300">-</span>') + '</td>'
            + '<td class="px-4 py-3 text-center">' + statusBadge + '</td>'
            + '<td class="px-4 py-3 text-center">' + agentBadge + '</td>'
            + '<td class="px-4 py-3 text-center text-sm">' + headInfo + '</td>'
            + '<td class="px-4 py-3 text-sm text-gray-600">' + (eq.location_zone || '<span class="text-gray-300">-</span>') + '</td>'
            + '<td class="px-4 py-3 text-center act-col">'
            +   '<button onclick="event.stopPropagation(); openEditModal(\'' + eq.id + '\')" class="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-200 mr-1" title="수정"><i class="fas fa-edit"></i></button>'
            +   '<button onclick="event.stopPropagation(); deactivateEquip(\'' + eq.id + '\')" class="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-200" title="비활성화"><i class="fas fa-ban"></i></button>'
            + '</td>'
            + '</tr>';
    });
    tbody.innerHTML = html;
}

// ─── 배치도 렌더링 ──────────────────────────────────────────────────────────

async function loadLayout() {
    try {
        var facilityRes = await axios.get('/api/facility/layout-data');
        zones = (facilityRes.data.data && facilityRes.data.data.zones ? facilityRes.data.data.zones : []).filter(function(z) { return z.is_active !== 0; });
        // equipList는 이미 loadEquipment()에서 로드됨. facility 응답에 equipment도 있지만 rip API가 더 상세함
        renderLayoutEquipment(equipList);
        renderZoneSummary(equipList);
    } catch(e) {
        console.error('loadLayout error', e);
        // facility API 실패 시 zones 없이 장비만 렌더링
        zones = [];
        renderLayoutEquipment(equipList);
        renderZoneSummary(equipList);
    }
}

function renderLayoutEquipment(equipData) {
    var canvas = document.getElementById('layoutCanvas');
    if (!canvas) return;
    // 기존 장비 카드 제거
    canvas.querySelectorAll('.eq-card').forEach(function(el) { el.remove(); });

    var empty = document.getElementById('layoutEmpty');
    var activeEquip = equipData.filter(function(e) { return e.status === 'ACTIVE' || e.status == null; });

    if (empty) empty.style.display = activeEquip.length === 0 ? 'flex' : 'none';

    activeEquip.forEach(function(eq) {
        var size = SIZE_MAP[eq.size_type] || SIZE_MAP.LARGE;
        var color = STATUS_COLORS[eq.equipment_status] || '#94a3b8';
        var div = document.createElement('div');
        div.className = 'eq-card';
        div.dataset.id = eq.id;
        var shadow = eq.is_printing
            ? '0 0 0 3px ' + color + '44, 0 1px 4px rgba(0,0,0,0.15)'
            : '0 1px 4px rgba(0,0,0,0.15)';
        div.style.cssText = [
            'position:absolute',
            'left:' + (eq.location_x != null ? eq.location_x : 50) + '%',
            'top:' + (eq.location_y != null ? eq.location_y : 50) + '%',
            'width:' + size.w + 'px',
            'height:' + size.h + 'px',
            'transform:translate(-50%,-50%)',
            'border:2px solid ' + color,
            'background:white',
            'border-radius:5px',
            'z-index:2',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'font-size:11px',
            'font-weight:600',
            'cursor:pointer',
            'box-shadow:' + shadow,
            'user-select:none',
            'overflow:hidden',
            'text-overflow:ellipsis',
            'white-space:nowrap',
            'padding:0 4px',
        ].join(';');

        div.textContent = eq.name;
        div.title = eq.name + (eq.printer_name ? ' (' + eq.printer_name + ')' : '');

        (function(capturedEq, capturedDiv) {
            capturedDiv.addEventListener('click', function(e) {
                e.stopPropagation();
                showEquipPopover(capturedEq, capturedDiv);
            });
            setupEquipDrag(capturedDiv, capturedEq);
        })(eq, div);

        canvas.appendChild(div);
    });
}

function showEquipPopover(eq, el) {
    var pop = document.getElementById('equipPopover');
    if (!pop) return;

    var stMap = STATUS_MAP[eq.equipment_status] || { label: eq.equipment_status };
    var statusLabel = stMap.label || eq.equipment_status;
    var statusColor = STATUS_COLORS[eq.equipment_status] || '#94a3b8';
    var sizeLabel = eq.size_type === 'SMALL' ? '1.8m (소형)' : '3.2m (대형)';

    pop.innerHTML = '<div class="p-3">'
        + '<div class="flex items-center justify-between mb-2">'
        + '<div class="font-bold text-sm text-gray-900">' + escapeHtml(eq.name) + '</div>'
        + '<button onclick="document.getElementById(\'equipPopover\').classList.add(\'hidden\')" class="text-gray-400 hover:text-gray-600 text-xs ml-2">\u2715</button>'
        + '</div>'
        + (eq.printer_name ? '<div class="text-xs text-gray-500 mb-2">' + escapeHtml(eq.printer_name) + '</div>' : '')
        + '<div class="flex items-center gap-1.5 mb-2">'
        + '<span class="inline-block w-2 h-2 rounded-full" style="background:' + statusColor + '"></span>'
        + '<span class="text-xs font-medium" style="color:' + statusColor + '">' + statusLabel + '</span>'
        + (eq.is_printing ? '<span class="text-xs text-blue-600 font-medium">인쇄중</span>' : '')
        + '</div>'
        + '<div class="text-xs text-gray-500 space-y-1">'
        + '<div>진행중: <span class="font-medium text-gray-700">' + (eq.active_cards || 0) + '건</span></div>'
        + '<div>크기: <span class="font-medium text-gray-700">' + sizeLabel + '</span></div>'
        + '</div>'
        + '<button onclick="document.getElementById(\'equipPopover\').classList.add(\'hidden\');openDetail(\'' + escapeHtml(String(eq.id)) + '\')" class="mt-3 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">'
        + '상세 보기 <i class="fas fa-arrow-right text-[10px]"></i></button>'
        + '</div>';

    var rect = el.getBoundingClientRect();
    var popW = 240;
    var left = rect.right + 8;
    var top = rect.top;

    if (left + popW > window.innerWidth - 16) {
        left = rect.left - popW - 8;
    }
    if (top + 150 > window.innerHeight - 16) {
        top = window.innerHeight - 166;
    }

    pop.style.left = Math.max(8, left) + 'px';
    pop.style.top = Math.max(8, top) + 'px';
    pop.classList.remove('hidden');
}

function toggleEditMode() {
    editMode = !editMode;
    var btn = document.getElementById('btnEditLayout');
    if (btn) {
        if (editMode) {
            btn.innerHTML = '<i class="fas fa-lock-open"></i><span>편집 중</span>';
            btn.className = 'px-3 py-1 text-xs rounded border border-blue-600 bg-blue-600 text-white flex items-center gap-1';
        } else {
            btn.innerHTML = '<i class="fas fa-lock"></i><span>배치 편집</span>';
            btn.className = 'px-3 py-1 text-xs rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 flex items-center gap-1';
        }
    }
    document.querySelectorAll('.eq-card').forEach(function(el) {
        el.style.cursor = editMode ? 'grab' : 'default';
    });
}

function setupEquipDrag(el, eq) {
    var dragging = false, startX, startY, origLeft, origTop, moved = false;

    el.style.cursor = 'default';
    el.addEventListener('mousedown', function(e) {
        if (!editMode) return;
        e.preventDefault();
        dragging = true; moved = false;
        startX = e.clientX; startY = e.clientY;
        origLeft = parseFloat(el.style.left);
        origTop = parseFloat(el.style.top);
        el.style.cursor = 'grabbing';
        el.style.zIndex = '10';
    });

    document.addEventListener('mousemove', function(e) {
        if (!dragging) return;
        var canvas = document.getElementById('layoutCanvas');
        var cr = canvas.getBoundingClientRect();
        var dx = ((e.clientX - startX) / cr.width) * 100;
        var dy = ((e.clientY - startY) / cr.height) * 100;
        var newLeft = Math.max(2, Math.min(98, origLeft + dx));
        var newTop = Math.max(2, Math.min(98, origTop + dy));
        el.style.left = newLeft + '%';
        el.style.top = newTop + '%';
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) moved = true;
    });

    document.addEventListener('mouseup', async function() {
        if (!dragging) return;
        dragging = false;
        el.style.cursor = editMode ? 'grab' : 'default';
        el.style.zIndex = '2';
        if (moved) {
            var x = parseFloat(el.style.left);
            var y = parseFloat(el.style.top);
            try {
                await axios.patch('/api/rip/equipment/' + eq.id + '/position', { location_x: x, location_y: y });
                var found = equipList.find(function(e) { return e.id === eq.id; });
                if (found) { found.location_x = x; found.location_y = y; }
            } catch(err) { console.error('position save error', err); }
        }
    });
}

// ─── 구역 관리 ──────────────────────────────────────────────────────────────

function renderZoneSummary(equipData) {
    var container = document.getElementById('zoneSummary');
    if (!container) return;
    if (zones.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = zones.map(function(z) {
        var zoneEquip = equipData.filter(function(e) { return e.zone_id === z.id || e.location_zone === z.name; });
        var running = zoneEquip.filter(function(e) { return e.equipment_status === 'RUNNING'; }).length;
        return '<div class="bg-white border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow" style="border-left:3px solid ' + z.color + '">'
            + '<div class="font-semibold text-sm" style="color:' + z.color + '">' + escapeHtml(z.name) + '</div>'
            + '<div class="text-xs text-gray-500 mt-1">장비 ' + zoneEquip.length + '대 &middot; 가동 ' + running + '대</div>'
            + '</div>';
    }).join('');
}

async function savePosition(equipId, x, y) {
    try {
        await axios.patch('/api/rip/equipment/' + equipId + '/position', {
            location_x: Math.round(x * 10) / 10,
            location_y: Math.round(y * 10) / 10
        });
        var eq = equipList.find(function(e) { return e.id === equipId; });
        if (eq) { eq.location_x = x; eq.location_y = y; }
    } catch(e) {
        // 실패 시 무시 (다음 로드에 원래 위치로 복귀)
    }
}

// ─── 장비 상세 패널 ─────────────────────────────────────────────────────────

async function openDetail(equipId) {
    currentEquipId = equipId;
    try {
        var res = await axios.get('/api/rip/equipment/' + equipId);
        currentDetail = res.data.data;
        renderDetail();
        document.getElementById('detailPanel').classList.remove('hidden');
        document.getElementById('detailPanel').scrollIntoView({ behavior: 'smooth' });
        // 추가 데이터 비동기 로드
        loadConsumables();
        loadSchedules();
        loadStats();
    } catch(e) {
        showToast('장비 상세 로딩 실패', 'error');
    }
}

function closeDetail() {
    document.getElementById('detailPanel').classList.add('hidden');
    currentEquipId = null;
    currentDetail = null;
}

function renderDetail() {
    var eq = currentDetail;
    if (!eq) return;

    document.getElementById('detailTitle').textContent = eq.name + ' (' + eq.id + ')';

    // 상태
    var st = STATUS_MAP[eq.equipment_status] || STATUS_MAP.IDLE;
    var isAutoStatus = eq.agent_status === 'ONLINE' && (eq.equipment_status === 'RUNNING' || eq.equipment_status === 'IDLE');
    var autoTag = isAutoStatus ? ' <span class="text-[10px] text-gray-400 font-normal">(자동 감지)</span>' : '';
    var statusHtml = '<div class="flex items-center gap-2 mb-2">'
        + '<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full ' + st.bg + ' text-sm font-medium"><span class="w-2.5 h-2.5 rounded-full ' + st.dot + ' inline-block"></span>' + st.label + '</span>'
        + autoTag
        + '</div>'
        + '<div class="flex flex-wrap gap-1 mt-2">';
    ['RUNNING', 'IDLE', 'MAINTENANCE', 'BROKEN'].forEach(function(s) {
        var sm = STATUS_MAP[s];
        var isActive = eq.equipment_status === s;
        statusHtml += '<button onclick="changeStatus(\'' + s + '\')" class="px-2 py-1 text-xs rounded border '
            + (isActive ? 'border-gray-400 font-bold ' + sm.bg : 'border-gray-200 text-gray-500 hover:bg-gray-50')
            + '">' + sm.label + '</button>';
    });
    statusHtml += '</div>';
    if (isAutoStatus) {
        statusHtml += '<div class="text-[10px] text-gray-400 mt-1"><i class="fas fa-info-circle mr-1"></i>에이전트가 온라인일 때 가동/대기는 자동 전환됩니다</div>';
    }
    document.getElementById('detailStatus').innerHTML = statusHtml;

    // 정보
    var infoHtml = '<div><span class="text-gray-400">프린터:</span> ' + escapeHtml(eq.printer_name || '-') + '</div>'
        + '<div><span class="text-gray-400">IP:</span> ' + escapeHtml(eq.ip_address || '-') + '</div>'
        + '<div><span class="text-gray-400">구역:</span> ' + escapeHtml(eq.location_zone || '-') + '</div>'
        + '<div><span class="text-gray-400">에이전트:</span> ' + (eq.agent_status === 'ONLINE' ? '<span class="text-green-600">온라인</span>' : '<span class="text-gray-400">오프라인</span>') + '</div>';
    document.getElementById('detailInfo').innerHTML = infoHtml;

    // 메모
    document.getElementById('detailNotes').innerHTML = eq.notes
        ? '<p class="text-sm">' + escapeHtml(eq.notes) + '</p>'
        : '<span class="text-gray-300">메모 없음</span>';

    // 헤드
    renderHeads(eq.heads || []);

    // 프리셋
    renderPresets(eq.presets || []);

    // 유지보수 이력
    renderLogs(eq.maintenance_logs || []);
}

function renderHeads(heads) {
    var container = document.getElementById('detailHeads');
    if (!heads || heads.length === 0) {
        container.innerHTML = '<div class="col-span-full text-sm text-gray-400">헤드가 설정되지 않았습니다. 우측 상단 "헤드 설정" 버튼으로 초기화하세요.</div>';
        return;
    }
    var html = '';
    heads.forEach(function(h) {
        var hs = HEAD_STATUS_MAP[h.status] || HEAD_STATUS_MAP.NORMAL;
        var replacedText = h.replaced_at ? h.replaced_at.substring(0, 10) : '';
        html += '<div onclick="openHeadEdit(' + h.head_number + ')" class="border rounded-lg p-2 text-center cursor-pointer hover:shadow-md transition-shadow ' + hs.bg + '">'
            + '<div class="text-xs font-bold mb-1">#' + h.head_number + '</div>'
            + '<div class="text-[10px]">' + hs.label + '</div>'
            + (replacedText ? '<div class="text-[10px] mt-1 text-gray-500">교체: ' + replacedText + '</div>' : '')
            + '</div>';
    });
    container.innerHTML = html;
}

function renderPresets(presets) {
    var container = document.getElementById('detailPresets');
    if (!presets || presets.length === 0) {
        container.innerHTML = '<span class="text-sm text-gray-400">프리셋 없음</span>';
        return;
    }
    var html = '';
    presets.forEach(function(p) {
        var defaultBadge = p.is_default ? ' bg-blue-50 text-blue-700 border-blue-200' : ' bg-gray-100 text-gray-600 border-gray-200';
        html += '<span class="inline-flex items-center gap-1 px-2 py-1 border rounded text-xs' + defaultBadge + '">'
            + (p.is_default ? '<i class="fas fa-star text-blue-500 text-xs"></i>' : '')
            + p.preset_name
            + ' <button onclick="deletePreset(' + p.id + ')" class="ml-1 text-gray-400 hover:text-red-500 font-bold leading-none">&times;</button>'
            + '</span>';
    });
    container.innerHTML = html;
}

function renderLogs(logs) {
    var container = document.getElementById('detailLogs');
    if (!logs || logs.length === 0) {
        container.innerHTML = '<div class="text-sm text-gray-400 py-2">기록 없음</div>';
        return;
    }
    var html = '';
    logs.forEach(function(log) {
        var lt = LOG_TYPE_MAP[log.log_type] || LOG_TYPE_MAP.MAINTENANCE;
        var dateStr = log.performed_at ? log.performed_at.substring(0, 16).replace('T', ' ') : '';
        var costStr = log.cost ? Number(log.cost).toLocaleString() + '원' : '';
        html += '<div class="flex items-start gap-3 p-2 rounded hover:bg-gray-50 border-b border-gray-100">'
            + '<div class="mt-0.5"><i class="fas ' + lt.icon + ' ' + lt.color + '"></i></div>'
            + '<div class="flex-1 min-w-0">'
            + '<div class="flex items-center gap-2">'
            + '<span class="text-xs font-medium ' + lt.color + '">' + lt.label + '</span>'
            + '<span class="text-xs text-gray-400">' + dateStr + '</span>'
            + (log.performed_by_name ? '<span class="text-xs text-gray-400">- ' + log.performed_by_name + '</span>' : '')
            + '</div>'
            + '<div class="text-sm text-gray-700 mt-0.5">' + (log.description || '').replace(/</g, '&lt;') + '</div>'
            + (costStr ? '<div class="text-xs text-gray-500 mt-0.5">비용: ' + costStr + '</div>' : '')
            + '</div>'
            + '<button onclick="deleteLog(' + log.id + ')" class="text-gray-300 hover:text-red-500 text-xs flex-shrink-0" title="삭제"><i class="fas fa-trash"></i></button>'
            + '</div>';
    });
    container.innerHTML = html;
}

// ─── 상태 변경 ──────────────────────────────────────────────────────────────

async function changeStatus(newStatus) {
    if (!currentEquipId) return;
    var notes = null;
    if (newStatus === 'BROKEN' || newStatus === 'MAINTENANCE') {
        notes = prompt(newStatus === 'BROKEN' ? '고장 내용을 입력하세요:' : '점검 내용을 입력하세요:');
        if (notes === null) return;
    }
    try {
        await axios.patch('/api/rip/equipment/' + currentEquipId + '/status', {
            equipment_status: newStatus,
            notes: notes
        });
        await loadEquipment();
        await openDetail(currentEquipId);
    } catch(e) {
        showToast('상태 변경 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
    }
}

// ─── 장비 추가/수정 모달 ────────────────────────────────────────────────────

function openAddModal() {
    document.getElementById('equipModalTitle').textContent = '장비 추가';
    document.getElementById('equipEditId').value = '';
    document.getElementById('fEquipId').value = '';
    document.getElementById('fEquipId').readOnly = false;
    document.getElementById('fEquipName').value = '';
    document.getElementById('fEquipPrinter').value = '';
    document.getElementById('fEquipIp').value = '';
    document.getElementById('fEquipHeadCount').value = '0';
    document.getElementById('fEquipZone').value = '';
    document.getElementById('equipModal').classList.remove('hidden');
}

function openEditModal(equipId) {
    var eq = equipList.find(function(e) { return e.id === equipId; });
    if (!eq) return;
    document.getElementById('equipModalTitle').textContent = '장비 수정';
    document.getElementById('equipEditId').value = eq.id;
    document.getElementById('fEquipId').value = eq.id;
    document.getElementById('fEquipId').readOnly = true;
    document.getElementById('fEquipName').value = eq.name || '';
    document.getElementById('fEquipPrinter').value = eq.printer_name || '';
    document.getElementById('fEquipIp').value = eq.ip_address || '';
    document.getElementById('fEquipHeadCount').value = String(eq.head_count || 0);
    document.getElementById('fEquipZone').value = eq.location_zone || '';
    document.getElementById('equipModal').classList.remove('hidden');
}

function closeEquipModal() {
    document.getElementById('equipModal').classList.add('hidden');
}

async function saveEquip() {
    var editId = document.getElementById('equipEditId').value;
    var id = document.getElementById('fEquipId').value.trim();
    var name = document.getElementById('fEquipName').value.trim();
    var printer = document.getElementById('fEquipPrinter').value.trim();
    var ip = document.getElementById('fEquipIp').value.trim();
    var headCount = parseInt(document.getElementById('fEquipHeadCount').value) || 0;
    var zone = document.getElementById('fEquipZone').value.trim();
    if (!name) { showFieldError('fEquipName', '이름을 입력하세요.'); return; }
    try {
        if (editId) {
            await axios.put('/api/rip/equipment/' + editId, {
                name: name, printer_name: printer, ip_address: ip,
                head_count: headCount, location_zone: zone
            });
        } else {
            if (!id) { showFieldError('fEquipId', 'ID를 입력하세요.'); return; }
            await axios.post('/api/rip/equipment', {
                id: id, name: name, printer_name: printer, ip_address: ip
            });
            // 헤드 초기화
            if (headCount > 0) {
                await axios.post('/api/rip/equipment/' + id + '/heads', { head_count: headCount });
            }
        }
        closeEquipModal();
        await loadEquipment();
    } catch(e) {
        showToast('저장 실패: ' + (e.response && e.response.data && e.response.data.error ? e.response.data.error : e.message), 'error');
    }
}

async function deactivateEquip(equipId) {
    if (!(await showConfirm('\'' + equipId + '\' 장비를 비활성화하시겠습니까?'))) return;
    try {
        await axios.put('/api/rip/equipment/' + equipId, { status: 'INACTIVE' });
        await loadEquipment();
        if (currentEquipId === equipId) closeDetail();
    } catch(e) {
        showToast('비활성화 실패: ' + (e.response && e.response.data && e.response.data.error ? e.response.data.error : e.message), 'error');
    }
}

// ─── 프리셋 ─────────────────────────────────────────────────────────────────

function openPresetModal() {
    if (!currentEquipId) return;
    document.getElementById('fPresetName').value = '';
    document.getElementById('fPresetTps').value = '';
    document.getElementById('fPresetDesc').value = '';
    document.getElementById('fPresetDefault').checked = false;
    document.getElementById('presetModal').classList.remove('hidden');
}

function closePresetModal() {
    document.getElementById('presetModal').classList.add('hidden');
}

function syncTpsFilename() {
    var name = document.getElementById('fPresetName').value.trim();
    document.getElementById('fPresetTps').value = name ? name + '.tps' : '';
}

async function savePreset() {
    if (!currentEquipId) return;
    var presetName = document.getElementById('fPresetName').value.trim();
    var tpsFilename = document.getElementById('fPresetTps').value.trim();
    var desc = document.getElementById('fPresetDesc').value.trim();
    var isDefault = document.getElementById('fPresetDefault').checked;
    if (!presetName) { showFieldError('fPresetName', '프리셋명을 입력하세요.'); return; }
    if (!tpsFilename) { showFieldError('fPresetTps', 'TPS 파일명을 입력하세요.'); return; }
    try {
        await axios.post('/api/rip/equipment/' + currentEquipId + '/presets', {
            preset_name: presetName,
            tps_filename: tpsFilename,
            description: desc || null,
            is_default: isDefault ? 1 : 0
        });
        closePresetModal();
        await openDetail(currentEquipId);
    } catch(e) {
        showToast('프리셋 저장 실패: ' + (e.response && e.response.data && e.response.data.error ? e.response.data.error : e.message), 'error');
    }
}

async function deletePreset(presetId) {
    if (!currentEquipId) return;
    if (!(await showConfirm('프리셋을 삭제하시겠습니까?', { danger: true }))) return;
    try {
        await axios.delete('/api/rip/equipment/' + currentEquipId + '/presets/' + presetId);
        await openDetail(currentEquipId);
    } catch(e) {
        showToast('프리셋 삭제 실패', 'error');
    }
}

// ─── 헤드 관리 ──────────────────────────────────────────────────────────────

function openHeadSetup() {
    if (!currentDetail) return;
    document.getElementById('fHeadCount').value = String(currentDetail.head_count || 4);
    document.getElementById('headSetupModal').classList.remove('hidden');
}

function closeHeadSetup() {
    document.getElementById('headSetupModal').classList.add('hidden');
}

async function saveHeadSetup() {
    if (!currentEquipId) return;
    var count = parseInt(document.getElementById('fHeadCount').value);
    if (!(await showConfirm(count + '개 헤드로 초기화합니다. 기존 헤드 데이터가 삭제됩니다. 계속하시겠습니까?', { danger: true }))) return;
    try {
        await axios.post('/api/rip/equipment/' + currentEquipId + '/heads', { head_count: count });
        closeHeadSetup();
        await loadEquipment();
        await openDetail(currentEquipId);
    } catch(e) {
        showToast('헤드 설정 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
    }
}

function openHeadEdit(headNum) {
    if (!currentDetail) return;
    var head = (currentDetail.heads || []).find(function(h) { return h.head_number === headNum; });
    if (!head) return;
    document.getElementById('headEditTitle').textContent = '헤드 #' + headNum;
    document.getElementById('fHeadNum').value = headNum;
    document.getElementById('fHeadStatus').value = head.status || 'NORMAL';
    document.getElementById('fHeadReplacedAt').value = head.replaced_at ? head.replaced_at.substring(0, 10) : '';
    document.getElementById('fHeadNotes').value = head.notes || '';
    document.getElementById('headEditModal').classList.remove('hidden');
}

function closeHeadEdit() {
    document.getElementById('headEditModal').classList.add('hidden');
}

async function saveHeadEdit() {
    if (!currentEquipId) return;
    var headNum = document.getElementById('fHeadNum').value;
    var status = document.getElementById('fHeadStatus').value;
    var replacedAt = document.getElementById('fHeadReplacedAt').value || null;
    var notes = document.getElementById('fHeadNotes').value.trim();
    try {
        await axios.put('/api/rip/equipment/' + currentEquipId + '/heads/' + headNum, {
            status: status,
            replaced_at: replacedAt,
            notes: notes || null
        });
        closeHeadEdit();
        await openDetail(currentEquipId);
    } catch(e) {
        showToast('헤드 저장 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
    }
}

// ─── 유지보수 이력 ──────────────────────────────────────────────────────────

function openMaintenanceModal() {
    if (!currentEquipId) return;
    document.getElementById('fLogType').value = 'MAINTENANCE';
    document.getElementById('fLogDesc').value = '';
    document.getElementById('fLogCost').value = '';
    var now = new Date();
    var localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('fLogDate').value = localISO;
    document.getElementById('maintenanceModal').classList.remove('hidden');
}

function closeMaintenanceModal() {
    document.getElementById('maintenanceModal').classList.add('hidden');
}

async function saveMaintenance() {
    if (!currentEquipId) return;
    var logType = document.getElementById('fLogType').value;
    var desc = document.getElementById('fLogDesc').value.trim();
    var cost = parseFloat(document.getElementById('fLogCost').value) || 0;
    var date = document.getElementById('fLogDate').value;
    if (!desc) { showFieldError('fLogDesc', '작업 내용을 입력하세요.'); return; }
    try {
        await axios.post('/api/rip/equipment/' + currentEquipId + '/maintenance', {
            log_type: logType,
            description: desc,
            cost: cost,
            performed_at: date || null
        });
        closeMaintenanceModal();
        await openDetail(currentEquipId);
    } catch(e) {
        showToast('기록 저장 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
    }
}

async function deleteLog(logId) {
    if (!currentEquipId) return;
    if (!(await showConfirm('이 기록을 삭제하시겠습니까?', { danger: true }))) return;
    try {
        await axios.delete('/api/rip/equipment/' + currentEquipId + '/maintenance/' + logId);
        await openDetail(currentEquipId);
    } catch(e) {
        showToast('삭제 실패', 'error');
    }
}

// ─── 소모품 관리 ────────────────────────────────────────────────────────────

async function loadConsumables() {
    if (!currentEquipId) return;
    try {
        var res = await axios.get('/api/rip/equipment/' + currentEquipId + '/consumables');
        renderConsumables(res.data.data || []);
    } catch(e) {
        document.getElementById('detailConsumables').innerHTML = '<div class="text-sm text-red-400">로딩 실패</div>';
    }
}

function renderConsumables(items) {
    var container = document.getElementById('detailConsumables');
    if (!items || items.length === 0) {
        container.innerHTML = '<div class="text-sm text-gray-400 py-2">등록된 소모품이 없습니다</div>';
        return;
    }
    var html = '';
    items.forEach(function(item) {
        var dueClass = item.due_status === 'OVERDUE' ? 'border-red-300 bg-red-50'
            : item.due_status === 'DUE_SOON' ? 'border-amber-300 bg-amber-50'
            : 'border-gray-200';
        var dueBadge = item.due_status === 'OVERDUE' ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700">교체 필요</span>'
            : item.due_status === 'DUE_SOON' ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">곧 교체</span>'
            : '';
        var nextDue = item.next_due_at ? item.next_due_at.substring(0, 10) : '-';
        var lastReplaced = item.last_replaced_at ? item.last_replaced_at.substring(0, 10) : '-';
        html += '<div class="flex items-center justify-between p-2 border rounded ' + dueClass + '">'
            + '<div class="flex-1 min-w-0">'
            + '<div class="flex items-center gap-2">'
            + '<span class="text-sm font-medium">' + (item.name || '').replace(/</g, '&lt;') + '</span>'
            + dueBadge
            + '</div>'
            + '<div class="flex gap-3 text-[11px] text-gray-500 mt-0.5">'
            + '<span>주기: ' + (item.replacement_cycle_days || 0) + '일</span>'
            + '<span>최종교체: ' + lastReplaced + '</span>'
            + '<span>다음: ' + nextDue + '</span>'
            + (item.quantity_on_hand > 0 ? '<span>재고: ' + item.quantity_on_hand + '</span>' : '')
            + '</div>'
            + '</div>'
            + '<div class="flex gap-1 ml-2">'
            + '<button onclick="replaceConsumable(' + item.id + ')" class="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-200" title="교체 완료"><i class="fas fa-check"></i></button>'
            + '<button onclick="deleteConsumable(' + item.id + ')" class="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-200" title="삭제"><i class="fas fa-trash"></i></button>'
            + '</div>'
            + '</div>';
    });
    container.innerHTML = html;
}

function openConsumableModal() {
    if (!currentEquipId) return;
    document.getElementById('fConsName').value = '';
    document.getElementById('fConsCycle').value = '30';
    document.getElementById('fConsLastReplaced').value = new Date().toISOString().substring(0, 10);
    document.getElementById('fConsQty').value = '0';
    document.getElementById('fConsNotes').value = '';
    document.getElementById('consumableModal').classList.remove('hidden');
}

function closeConsumableModal() {
    document.getElementById('consumableModal').classList.add('hidden');
}

async function saveConsumable() {
    if (!currentEquipId) return;
    var name = document.getElementById('fConsName').value.trim();
    if (!name) { showFieldError('fConsName', '소모품명을 입력하세요.'); return; }
    try {
        await axios.post('/api/rip/equipment/' + currentEquipId + '/consumables', {
            name: name,
            replacement_cycle_days: parseInt(document.getElementById('fConsCycle').value) || 0,
            last_replaced_at: document.getElementById('fConsLastReplaced').value || null,
            quantity_on_hand: parseInt(document.getElementById('fConsQty').value) || 0,
            notes: document.getElementById('fConsNotes').value.trim() || null
        });
        closeConsumableModal();
        await loadConsumables();
    } catch(e) {
        showToast('저장 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
    }
}

async function replaceConsumable(cid) {
    if (!currentEquipId) return;
    if (!(await showConfirm('이 소모품을 교체 완료 처리하시겠습니까?'))) return;
    try {
        await axios.post('/api/rip/equipment/' + currentEquipId + '/consumables/' + cid + '/replace');
        await loadConsumables();
    } catch(e) {
        showToast('교체 기록 실패', 'error');
    }
}

async function deleteConsumable(cid) {
    if (!currentEquipId) return;
    if (!(await showConfirm('이 소모품을 삭제하시겠습니까?', { danger: true }))) return;
    try {
        await axios.delete('/api/rip/equipment/' + currentEquipId + '/consumables/' + cid);
        await loadConsumables();
    } catch(e) {
        showToast('삭제 실패', 'error');
    }
}

// ─── 예방정비 스케줄 ────────────────────────────────────────────────────────

async function loadSchedules() {
    if (!currentEquipId) return;
    try {
        var res = await axios.get('/api/rip/equipment/' + currentEquipId + '/schedules');
        renderSchedules(res.data.data || []);
    } catch(e) {
        document.getElementById('detailSchedules').innerHTML = '<div class="text-sm text-red-400">로딩 실패</div>';
    }
}

function renderSchedules(items) {
    var container = document.getElementById('detailSchedules');
    if (!items || items.length === 0) {
        container.innerHTML = '<div class="text-sm text-gray-400 py-2">등록된 정비 스케줄이 없습니다</div>';
        return;
    }
    var html = '';
    items.forEach(function(item) {
        var dueClass = item.due_status === 'OVERDUE' ? 'border-red-300 bg-red-50'
            : item.due_status === 'DUE_SOON' ? 'border-amber-300 bg-amber-50'
            : 'border-gray-200';
        var dueBadge = item.due_status === 'OVERDUE' ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700">기한 초과</span>'
            : item.due_status === 'DUE_SOON' ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">곧 도래</span>'
            : '';
        var nextDue = item.next_due_at ? item.next_due_at.substring(0, 10) : '-';
        var lastDone = item.last_performed_at ? item.last_performed_at.substring(0, 10) : '미실시';

        // 체크리스트 표시
        var checklistHtml = '';
        if (item.checklist) {
            var checks = item.checklist.split('\n').filter(function(c) { return c.trim(); });
            if (checks.length > 0) {
                checklistHtml = '<div class="mt-1 text-[11px] text-gray-500">';
                checks.forEach(function(chk) {
                    checklistHtml += '<div><i class="far fa-square mr-1"></i>' + chk.replace(/</g, '&lt;') + '</div>';
                });
                checklistHtml += '</div>';
            }
        }

        html += '<div class="p-2 border rounded ' + dueClass + '">'
            + '<div class="flex items-center justify-between">'
            + '<div class="flex-1 min-w-0">'
            + '<div class="flex items-center gap-2">'
            + '<span class="text-sm font-medium">' + (item.title || '').replace(/</g, '&lt;') + '</span>'
            + dueBadge
            + '</div>'
            + '<div class="flex gap-3 text-[11px] text-gray-500 mt-0.5">'
            + '<span>주기: ' + item.interval_days + '일</span>'
            + '<span>최종: ' + lastDone + '</span>'
            + '<span>다음: ' + nextDue + '</span>'
            + '</div>'
            + (item.description ? '<div class="text-[11px] text-gray-500 mt-0.5">' + item.description.replace(/</g, '&lt;') + '</div>' : '')
            + checklistHtml
            + '</div>'
            + '<div class="flex gap-1 ml-2">'
            + '<button onclick="completeSchedule(' + item.id + ')" class="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-200" title="완료 처리"><i class="fas fa-check"></i></button>'
            + '<button onclick="deleteSchedule(' + item.id + ')" class="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-200" title="삭제"><i class="fas fa-trash"></i></button>'
            + '</div>'
            + '</div>'
            + '</div>';
    });
    container.innerHTML = html;
}

function openScheduleModal() {
    if (!currentEquipId) return;
    document.getElementById('fSchedTitle').value = '';
    document.getElementById('fSchedInterval').value = '30';
    document.getElementById('fSchedDesc').value = '';
    document.getElementById('fSchedChecklist').value = '';
    document.getElementById('scheduleModal').classList.remove('hidden');
}

function closeScheduleModal() {
    document.getElementById('scheduleModal').classList.add('hidden');
}

async function saveSchedule() {
    if (!currentEquipId) return;
    var title = document.getElementById('fSchedTitle').value.trim();
    var interval = parseInt(document.getElementById('fSchedInterval').value);
    if (!title) { showFieldError('fSchedTitle', '점검 항목을 입력하세요.'); return; }
    if (!interval || interval < 1) { showFieldError('fSchedInterval', '점검 주기는 1일 이상이어야 합니다.'); return; }
    try {
        await axios.post('/api/rip/equipment/' + currentEquipId + '/schedules', {
            title: title,
            interval_days: interval,
            description: document.getElementById('fSchedDesc').value.trim() || null,
            checklist: document.getElementById('fSchedChecklist').value.trim() || null
        });
        closeScheduleModal();
        await loadSchedules();
    } catch(e) {
        showToast('저장 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
    }
}

async function completeSchedule(sid) {
    if (!currentEquipId) return;
    var notes = prompt('점검 완료 메모 (선택):');
    if (notes === null) return;
    try {
        await axios.post('/api/rip/equipment/' + currentEquipId + '/schedules/' + sid + '/complete', {
            notes: notes || null
        });
        await loadSchedules();
    } catch(e) {
        showToast('완료 처리 실패', 'error');
    }
}

async function deleteSchedule(sid) {
    if (!currentEquipId) return;
    if (!(await showConfirm('이 정비 스케줄을 삭제하시겠습니까?', { danger: true }))) return;
    try {
        await axios.delete('/api/rip/equipment/' + currentEquipId + '/schedules/' + sid);
        await loadSchedules();
    } catch(e) {
        showToast('삭제 실패', 'error');
    }
}

// ─── 생산 실적 ──────────────────────────────────────────────────────────────

async function loadStats() {
    if (!currentEquipId) return;
    try {
        var res = await axios.get('/api/rip/equipment/' + currentEquipId + '/stats');
        renderStats(res.data.data);
    } catch(e) {
        document.getElementById('detailStats').innerHTML = '<div class="text-sm text-gray-400 py-2">통계 데이터 없음</div>';
    }
}

function renderStats(data) {
    var container = document.getElementById('detailStats');
    if (!data) {
        container.innerHTML = '<div class="text-sm text-gray-400 py-2">통계 데이터 없음</div>';
        return;
    }

    var todayCount = data.today ? data.today.print_count || 0 : 0;
    var todayCards = data.today ? data.today.card_count || 0 : 0;
    var uptimeRate = data.uptime_rate_7d || 0;
    var maintCost = data.maintenance && data.maintenance.total_cost ? Number(data.maintenance.total_cost).toLocaleString() : '0';
    var maintCount = data.maintenance ? data.maintenance.maintenance_count || 0 : 0;

    var html = '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">'
        + '<div class="border rounded p-2 text-center">'
        + '<div class="text-[11px] text-gray-500">오늘 출력</div>'
        + '<div class="text-lg font-bold text-gray-700">' + todayCount + '</div>'
        + '<div class="text-[10px] text-gray-400">' + todayCards + '카드</div>'
        + '</div>'
        + '<div class="border rounded p-2 text-center">'
        + '<div class="text-[11px] text-gray-500">7일 가동률</div>'
        + '<div class="text-lg font-bold ' + (uptimeRate >= 70 ? 'text-gray-700' : uptimeRate >= 40 ? 'text-amber-600' : 'text-red-600') + '">' + uptimeRate + '%</div>'
        + '<div class="text-[10px] text-gray-400">' + data.uptime_days_7d + '/7일</div>'
        + '</div>'
        + '<div class="border rounded p-2 text-center">'
        + '<div class="text-[11px] text-gray-500">6개월 정비비</div>'
        + '<div class="text-lg font-bold text-gray-700">' + maintCost + '<span class="text-xs">원</span></div>'
        + '<div class="text-[10px] text-gray-400">' + maintCount + '건</div>'
        + '</div>'
        + '</div>';

    // 최근 7일 일별 실적 바 차트
    var daily = data.daily || [];
    if (daily.length > 0) {
        var maxCount = Math.max.apply(null, daily.map(function(d) { return d.print_count; })) || 1;
        html += '<div class="mt-2"><div class="text-[11px] text-gray-500 mb-1">최근 출력 실적 (일별)</div>';
        html += '<div class="space-y-1">';
        daily.slice(0, 7).reverse().forEach(function(d) {
            var pct = Math.round((d.print_count / maxCount) * 100);
            var dateLabel = d.date ? d.date.substring(5, 10) : '';
            html += '<div class="flex items-center gap-2 text-[11px]">'
                + '<span class="w-12 text-gray-500 text-right">' + dateLabel + '</span>'
                + '<div class="flex-1 bg-gray-100 rounded-full h-4">'
                + '<div class="bg-blue-500 h-4 rounded-full flex items-center justify-end pr-1 text-[10px] text-white font-medium" style="width: ' + Math.max(pct, 8) + '%">' + d.print_count + '</div>'
                + '</div>'
                + '</div>';
        });
        html += '</div></div>';
    }

    container.innerHTML = html;
}

// ─── 초기 로드 ──────────────────────────────────────────────────────────────

document.addEventListener('click', function(e) {
    var pop = document.getElementById('equipPopover');
    if (pop && !pop.contains(e.target) && !e.target.closest('.eq-card')) {
        pop.classList.add('hidden');
    }
});

// URL 파라미터에서 탭 정보 읽기 (예: ?tab=dashboard)
(function() {
    var params = new URLSearchParams(window.location.search);
    var tab = params.get('tab');
    if (tab === 'dashboard' || tab === 'layout') {
        currentTab = tab;
        switchTab(tab);
    } else {
        loadEquipment();
    }
})();
