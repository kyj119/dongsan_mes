window.onerror = function(msg, url, line, col, err) {
    var statusEl = document.getElementById('kanbanStatus');
    if (statusEl) {
        statusEl.className = 'mb-2 p-2 rounded-lg text-sm text-center bg-red-50 text-red-700';
        statusEl.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> JS 오류: ' + msg + ' (line:' + line + ')';
    }
};
window.addEventListener('unhandledrejection', function(event) {
    var statusEl = document.getElementById('kanbanStatus');
    if (statusEl) {
        statusEl.className = 'mb-2 p-2 rounded-lg text-sm text-center bg-red-50 text-red-700';
        statusEl.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> Promise 오류: ' + (event.reason || 'unknown');
    }
});

// ===== State =====
var ripWaitingCards = [];
var printingCards = [];
var inProgressCards = []; // RIP대기 + 출력중 통합
var printDoneCards = [];
var holdCards = [];
var kanbanSummary = null;
var selectedCardIds = new Set();
var currentMobileTab = 'progress';
var holdExpanded = false;
var searchTerm = '';
var categoryFilter = '';
var urgencyFilter = '';
var kanbanSort = 'delivery_asc';
var availableCategories = [];
var searchTimeout;

// HOLD 모달 상태
var _holdTargetIds = [];
var _holdIsBulk = false;

// ===== 필터 저장/복원 =====
function saveKanbanFilters() {
    try {
        localStorage.setItem('kanban_filters', JSON.stringify({
            category: categoryFilter,
            urgency: urgencyFilter,
            sort: kanbanSort,
            search: searchTerm
        }));
    } catch(e) {}
}
function restoreKanbanFilters() {
    try {
        var saved = JSON.parse(localStorage.getItem('kanban_filters') || '{}');
        categoryFilter = saved.category || '';
        urgencyFilter = saved.urgency || '';
        kanbanSort = saved.sort || 'delivery_asc';
        searchTerm = saved.search || '';
        // UI 동기화
        var uf = document.getElementById('urgencyFilter');
        if (uf) uf.value = urgencyFilter;
        var ks = document.getElementById('kanbanSort');
        if (ks) ks.value = kanbanSort;
        var si = document.getElementById('kanbanSearch');
        if (si) si.value = searchTerm;
    } catch(e) {}
}

// ===== Status Labels =====
var statusLabels = {
    'PRINTING': '출력중',
    'PRINT_DONE': '출력완료',
    'HOLD': '보류'
};

// ===== Urgency =====
function getUrgency(deliveryDate) {
    if (!deliveryDate) return { level: '-', label: '미정', css: 'urgency-d4', badge: 'bg-gray-400 text-white', diff: 999 };
    var today = new Date(); today.setHours(0,0,0,0);
    var d = new Date(deliveryDate); d.setHours(0,0,0,0);
    var diff = Math.ceil((d - today) / 86400000);
    if (diff <= 0) return { level: 'D-0', label: '긴급', css: 'urgency-d0', badge: 'bg-red-500 text-white', diff: diff };
    if (diff === 1) return { level: 'D-1', label: '높음', css: 'urgency-d1', badge: 'bg-orange-500 text-white', diff: diff };
    if (diff <= 3) return { level: 'D-' + diff, label: '보통', css: 'urgency-d2', badge: 'bg-amber-400 text-white', diff: diff };
    return { level: 'D-' + diff, label: '여유', css: 'urgency-d4', badge: 'bg-green-500 text-white', diff: diff };
}


// ===== 남은 시간 계산 =====
function getTimeRemaining(deliveryDate, deliveryTime) {
    if (!deliveryDate) return null;
    var now = new Date();
    var todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    var tomorrowDate = new Date(now);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    var tomorrowStr = tomorrowDate.getFullYear() + '-' + String(tomorrowDate.getMonth()+1).padStart(2,'0') + '-' + String(tomorrowDate.getDate()).padStart(2,'0');

    if (deliveryDate < todayStr) return { text: '지연', urgent: true };
    if (deliveryDate === tomorrowStr) return { text: '내일', urgent: false };
    if (deliveryDate > tomorrowStr) return { text: deliveryDate.slice(5), urgent: false };

    // 오늘 납기
    if (!deliveryTime) return { text: '오늘', urgent: false };
    var parts = deliveryTime.split(':');
    var deadline = new Date(now);
    deadline.setHours(parseInt(parts[0]), parseInt(parts[1]), 0, 0);
    var diffMs = deadline - now;
    var diffMin = Math.floor(diffMs / 60000);
    if (diffMin <= 0) return { text: '마감!', urgent: true };
    var h = Math.floor(diffMin / 60);
    var m = diffMin % 60;
    var txt = h > 0 ? h + 'h ' + m + 'm' : m + 'm';
    return { text: txt, urgent: diffMin <= 60 };
}

// ===== 데이터 로드 =====
async function loadKanban() {
    // 후가공 카드 표시 플래그 로드 (최초 1회)
    await loadPPDisplayFlags();

    var statusEl = document.getElementById('kanbanStatus');
    if (statusEl) {
        statusEl.style.display = '';
        statusEl.className = 'mb-2 p-2 rounded-lg text-sm text-center bg-blue-50 text-blue-700';
        statusEl.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 카드 데이터 로딩중...';
    }

    var catParam = categoryFilter ? '&category=' + encodeURIComponent(categoryFilter) : '';
    var searchParam = searchTerm ? '&search=' + encodeURIComponent(searchTerm) : '';
    var urgencyParam = urgencyFilter ? '&urgency=' + encodeURIComponent(urgencyFilter) : '';
    var sortParam = kanbanSort || 'delivery_asc';
    var baseParams = '&sort=' + sortParam + '&limit=500' + catParam + searchParam + urgencyParam;

    var urls = [
        '/api/cards?kanban_column=rip_waiting' + baseParams,
        '/api/cards?kanban_column=printing' + baseParams,
        '/api/cards?kanban_column=print_done&exclude_order_status=SHIPPED' + baseParams,
        '/api/cards?status=HOLD' + baseParams
    ];
    var colNames = ['RIP대기', '출력중', '출력완료', '보류'];
    var colEls = ['listInProgress', 'listInProgress', 'listPrintDone', null];
    var fetched = [[], [], [], []];
    var errors = [];

    for (var i = 0; i < urls.length; i++) {
        try {
            var res = await axios.get(urls[i]);
            if (res.data && res.data.data) {
                fetched[i] = res.data.data || [];
            } else {
                fetched[i] = [];
                errors.push(colNames[i] + ': 응답 형식 이상');
            }
        } catch (e) {
            fetched[i] = [];
            if (e.response && e.response.status === 401) {
                return; // 글로벌 axios 인터셉터(handleAuthExpired)가 처리
            }
            var errMsg = e.response ? 'HTTP ' + e.response.status : (e.message || 'network error');
            errors.push(colNames[i] + ': ' + errMsg);
            if (colEls[i]) {
                var errEl = document.getElementById(colEls[i]);
                if (errEl) errEl.innerHTML = '<div class="text-center text-red-500 py-4 text-sm"><i class="fas fa-exclamation-triangle mr-1"></i>' + colNames[i] + ' 로드 실패: ' + errMsg + '</div>';
            }
        }
    }

    ripWaitingCards = fetched[0];
    printingCards = fetched[1];
    printDoneCards = fetched[2];
    holdCards = fetched[3];
    // 진행중 = RIP대기 + 출력중 통합
    inProgressCards = ripWaitingCards.concat(printingCards);

    try {
        var summaryParams = [];
        if (categoryFilter) summaryParams.push('category=' + encodeURIComponent(categoryFilter));
        var summaryUrl = '/api/cards/kanban-summary' + (summaryParams.length ? '?' + summaryParams.join('&') : '');
        var summaryRes = await axios.get(summaryUrl);
        kanbanSummary = (summaryRes.data && summaryRes.data.data) ? summaryRes.data.data : null;
    } catch (e) {
        kanbanSummary = null;
    }

    try {
        loadCardCategories();
        renderAll();
    } catch (renderErr) {
        if (statusEl) {
            statusEl.className = 'mb-2 p-2 rounded-lg text-sm text-center bg-red-50 text-red-700';
            statusEl.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> 렌더링 오류: ' + (renderErr.message || renderErr);
        }
        return;
    }

    var total = inProgressCards.length + printDoneCards.length;
    if (statusEl) {
        if (errors.length > 0) {
            statusEl.className = 'mb-2 p-2 rounded-lg text-sm text-center bg-red-50 text-red-700';
            statusEl.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> 일부 오류: ' + errors.join(', ') + ' (정상 ' + total + '장)';
        } else if (total === 0) {
            statusEl.className = 'mb-2 p-2 rounded-lg text-sm text-center bg-amber-50 text-amber-700';
            statusEl.innerHTML = '<i class="fas fa-info-circle mr-1"></i> 진행중인 카드가 없습니다. 주문을 확정하면 카드가 자동 생성됩니다.';
        } else {
            statusEl.className = 'mb-2 p-2 rounded-lg text-sm text-center bg-green-50 text-green-700';
            statusEl.innerHTML = '<i class="fas fa-check mr-1"></i> ' + total + '장 로드 (진행:' + inProgressCards.length + ' 완료:' + printDoneCards.length + ')';
            setTimeout(function() { if (statusEl) statusEl.style.display = 'none'; }, 3000);
        }
    }
}

// ===== 정렬 =====
function sortCards(cards) {
    return cards.slice().sort(function(a, b) {
        var aUrgent = (a.priority || 0) >= 90 ? 1 : 0;
        var bUrgent = (b.priority || 0) >= 90 ? 1 : 0;
        if (aUrgent !== bUrgent) return bUrgent - aUrgent;
        var aDate = (a.delivery_date || '9999') + (a.delivery_time || '99:99');
        var bDate = (b.delivery_date || '9999') + (b.delivery_time || '99:99');
        if (aDate !== bDate) return aDate < bDate ? -1 : 1;
        return (a.id || 0) - (b.id || 0);
    });
}

// ===== 필터 핸들러 =====
function filterKanban(val) {
    clearTimeout(searchTimeout);
    searchTerm = val.trim();
    searchTimeout = setTimeout(function() {
        saveKanbanFilters();
        loadKanban();
    }, 400);
}

function setUrgencyFilter(val) {
    urgencyFilter = val;
    saveKanbanFilters();
    loadKanban();
}

function setKanbanSort(val) {
    kanbanSort = val;
    saveKanbanFilters();
    loadKanban();
}

// ===== renderAll =====
var printDoneExpanded = {};  // { clientName: boolean }

function renderAll() {
    // 진행중 (RIP대기 + 출력중 통합) — 칸반 카드
    renderColumn('listInProgress', sortCards(inProgressCards), 'progress');
    renderPrintDoneGrouped(printDoneCards);
    var cntEl = document.getElementById('colCntProgress');
    if (cntEl) cntEl.textContent = inProgressCards.length;
    var cntDoneEl = document.getElementById('colCntDone');
    if (cntDoneEl) cntDoneEl.textContent = printDoneCards.length;
    renderHoldSection();
    renderDashboard();
    if (window.innerWidth < 1024) renderMobileTab();
    initDragAndDrop();
}

// ===== 컬럼 렌더링 =====
function renderColumn(containerId, cards, columnType) {
    var el = document.getElementById(containerId);
    if (!el) { console.error('[Cards] element NOT FOUND:', containerId); return; }
    if (cards.length === 0) {
        var emptyMsgs = {
            progress: '진행중인 카드 없음',
            done: '미출고 완료 카드 없음'
        };
        var allEmpty = inProgressCards.length === 0 && printDoneCards.length === 0;
        var msg = emptyMsgs[columnType] || '없음';
        if (allEmpty && columnType === 'progress') {
            msg = '진행중인 카드가 없습니다.<br><span class="text-xs">주문 확정 시 카드가 자동 생성됩니다.</span>';
        }
        el.innerHTML = '<div class="text-center text-gray-400 py-8 text-sm"><i class="fas fa-inbox text-3xl mb-3 block text-gray-300"></i>' + msg + '</div>';
        return;
    }
    // 진행중 → 칸반 카드 (진행률 포함), 출력완료 → 그리드 뷰
    var useGrid = (columnType === 'done');
    var html = '';
    if (useGrid) {
        html += '<div class="grid-card-container">';
        cards.forEach(function(card) { html += buildGridCard(card, columnType); });
        html += '</div>';
    } else {
        cards.forEach(function(card) { html += buildKanbanCard(card, columnType); });
    }
    el.innerHTML = html;
}

// ===== 그리드 카드 빌더 (출력중/출력완료 전용) =====
function buildGridCard(card, columnType) {
    var urg = getUrgency(card.delivery_date);
    var isHold = card.status === 'HOLD';
    var ripStatus = card.rip_status || '';
    var deliveryMethod = card.delivery_method || '';
    var deliveryTime = card.delivery_time || '';
    var isUrgentPulse = urg.diff <= 0 && columnType !== 'done';
    var hasThumbnail = card.thumbnail_url && card.thumbnail_url.length > 10;

    // 긴급도 보더 색상
    var borderColor = '#e5e7eb';
    if (isHold) borderColor = '#94a3b8';
    else if (urg.diff <= 0) borderColor = '#ef4444';
    else if (urg.diff <= 1) borderColor = '#f97316';
    else if (urg.diff <= 3) borderColor = '#eab308';
    else borderColor = '#22c55e';

    var html = '<div class="grid-card' + (isUrgentPulse ? ' urgent-pulse' : '') + '" data-card-id="' + card.id + '" data-card-status="' + card.status + '" onclick="viewCardDetail(' + card.id + ')" style="border-top:3px solid ' + borderColor + '">';

    // ── 썸네일 영역 (이미지가 있을 때만 표시) ──
    if (hasThumbnail) {
        html += '<div class="grid-card-thumb">';
        // 규격 정보 (오버레이용)
        var specText = '';
        if (card._items && card._items.length > 0) {
            var fi = card._items[0];
            if (fi.width && fi.height) specText = Math.round(fi.width) + ' x ' + Math.round(fi.height) + 'cm';
        } else if (card.width && card.height) {
            specText = Math.round(card.width) + ' x ' + Math.round(card.height) + 'cm';
        }
        html += '<img src="' + card.thumbnail_url + '" alt="" class="grid-card-img" onerror="this.parentElement.style.display=\'none\'">';
        if (specText) {
            html += '<div class="grid-card-spec-overlay">' + specText + '</div>';
        }
        html += '</div>';
    }

    // ── 카드 정보 영역 ──
    html += '<div class="grid-card-info">';

    // 체크박스 + 긴급도 + 거래처
    var isSelected = selectedCardIds.has(card.id);
    html += '<div class="flex items-center gap-1 mb-1">';
    html += '<div class="flex-shrink-0" onclick="event.stopPropagation()">';
    html += '<input type="checkbox" class="card-checkbox rounded border-gray-300" style="width:14px;height:14px" data-card-id="' + card.id + '" '
        + (isSelected ? 'checked' : '') + ' onchange="toggleCardSelect(this)">';
    html += '</div>';
    html += '<span class="px-1 py-0.5 rounded text-[10px] font-bold ' + urg.badge + '">' + urg.level + '</span>';
    if (ripStatus === 'QUEUED') html += '<span class="rip-badge rip-badge-queued" style="font-size:9px">RIP</span>';
    else if (ripStatus === 'SENT') html += '<span class="rip-badge rip-badge-sent" style="font-size:9px">RIP</span>';
    html += '<span class="font-semibold text-xs text-gray-800 truncate flex-1">' + escapeHtml(card.client_name || '') + '</span>';
    if (card.created_by_name) {
        html += '<span class="text-[10px] text-gray-400 flex-shrink-0">' + escapeHtml(card.created_by_name) + '</span>';
    }
    html += '</div>';

    // 품목 + 수량
    var itemName = '';
    var qty = 1;
    if (card._items && card._items.length > 0) {
        itemName = card._items[0].item_name || '품목';
        qty = card._items[0].quantity || 1;
        if (card._items.length > 1) itemName += ' 외 ' + (card._items.length - 1) + '건';
    } else {
        itemName = card.item_name || '품목';
        qty = card.quantity || 1;
    }
    html += '<div class="text-xs text-gray-700 truncate">' + escapeHtml(itemName) + ' <span class="font-bold text-blue-600">x' + qty + '</span></div>';

    // 후가공 뱃지
    var allPP = [];
    if (card._items && card._items.length > 0) {
        card._items.forEach(function(item) {
            if (item.post_processing) {
                try {
                    var ppArr = typeof item.post_processing === 'string' ? JSON.parse(item.post_processing) : item.post_processing;
                    if (Array.isArray(ppArr)) {
                        ppArr.forEach(function(pp) {
                            var ppName = pp.name || pp.code || pp;
                            if (!isPPHidden(ppName)) allPP.push(ppName);
                        });
                    }
                } catch(ex) {}
            }
        });
    }
    if (allPP.length > 0) {
        html += '<div class="flex flex-wrap gap-0.5 mt-1">';
        // 중복 제거
        var seen = {};
        allPP.forEach(function(ppName) {
            if (seen[ppName]) return;
            seen[ppName] = true;
            var badge = getPPBadge(ppName);
            html += '<span style="display:inline-flex;align-items:center;padding:0 5px;font-size:10px;font-weight:500;border-radius:9999px;background:' + badge.bg + ';color:' + badge.color + ';border:1px solid ' + badge.border + ';line-height:18px">' + escapeHtml(String(ppName)) + '</span>';
        });
        html += '</div>';
    }

    // 마감방식 (그리드)
    if (card.finishing) {
        var gFinText = formatFinishing(card.finishing);
        if (gFinText) {
            html += '<div style="margin-top:3px;padding:2px 6px;background:#fef3c7;border:1px solid #fde68a;border-radius:4px;font-size:9px;color:#92400e">'
                + '<i class="fas fa-cut" style="font-size:8px;margin-right:2px"></i>' + escapeHtml(gFinText) + '</div>';
        }
    }

    // 납품 + 마감
    html += '<div class="flex items-center justify-between mt-1">';
    var timeRem = getTimeRemaining(card.delivery_date, deliveryTime);
    if (timeRem) {
        html += '<span class="text-[10px] ' + (timeRem.urgent ? 'text-red-600 font-bold' : 'text-gray-500') + '">&#128345;' + timeRem.text + '</span>';
    } else {
        html += '<span class="text-[10px] text-gray-400">' + (card.delivery_date || '') + '</span>';
    }
    if (deliveryMethod) {
        html += '<span class="text-[10px] text-gray-500">' + deliveryMethod + '</span>';
    }
    html += '</div>';

    // 액션 버튼 (UI가이드: Primary=파랑, Danger=빨강테두리, Secondary=회색테두리)
    html += '<div class="flex gap-1 mt-1.5">';
    if (columnType === 'printing') {
        html += '<button class="grid-action-btn" style="background:#2563eb;color:#fff;border:1px solid #2563eb;flex:1" onclick="event.stopPropagation();completeCard(' + card.id + ')">출력완료</button>';
        html += '<button class="grid-action-btn" style="background:#fff;color:#dc2626;border:1px solid #fca5a5" onclick="event.stopPropagation();quickHold(' + card.id + ')">보류</button>';
    } else if (columnType === 'done') {
        if (card.pp_status === 'PENDING') {
            html += '<button class="grid-action-btn" style="background:#fff;color:#374151;border:1px solid #d1d5db;flex:1" onclick="event.stopPropagation();ppComplete(' + card.id + ')">후가공</button>';
        } else if (card.pp_status === 'DONE') {
            html += '<span class="grid-action-btn" style="background:#f0fdf4;color:#16a34a;border:1px solid #86efac;font-size:10px;cursor:default">후가공 &#10003;</span>';
        }
        if (card.shipped_at) {
            html += '<button class="grid-action-btn" style="background:#fff;color:#374151;border:1px solid #d1d5db;flex:1" onclick="event.stopPropagation();unshipCard(' + card.id + ')">&#10003; 출고됨</button>';
        } else {
            html += '<button class="grid-action-btn" style="background:#2563eb;color:#fff;border:1px solid #2563eb;flex:1" onclick="event.stopPropagation();shipCard(' + card.id + ')">출고</button>';
            html += '<button class="grid-action-btn" style="background:#fff;color:#6b7280;border:1px solid #d1d5db" onclick="event.stopPropagation();revertCard(' + card.id + ')" title="진행중으로 되돌리기"><i class="fas fa-undo" style="font-size:10px"></i></button>';
        }
    }
    html += '</div>';

    html += '</div>'; // end grid-card-info
    html += '</div>'; // end grid-card
    return html;
}

// ===== 후가공 뱃지 색상 맵 =====
// 후가공 뱃지: neutral 톤 통일 (UI 가이드 — 분류 목적이므로 시맨틱 색 불필요)
var ppBadgeColors = {};
var ppDefaultBadge = { bg: '#f3f4f6', color: '#374151', border: '#d1d5db' };
// 카드에 숨길 후가공 코드 (DB display_on_card=0 기반, 초기화 시 로드)
var ppHiddenCodes = [];
var ppHiddenLoaded = false;

async function loadPPDisplayFlags() {
    if (ppHiddenLoaded) return;
    try {
        var res = await axios.get('/api/post-processing');
        if (res.data.success) {
            ppHiddenCodes = (res.data.data || [])
                .filter(function(pp) { return pp.display_on_card === 0; })
                .map(function(pp) { return { code: pp.option_code, name: pp.option_name }; });
        }
    } catch(e) { console.warn('PP display flags load failed:', e); }
    ppHiddenLoaded = true;
}

function isPPHidden(ppNameOrCode) {
    var val = String(ppNameOrCode || '');
    for (var i = 0; i < ppHiddenCodes.length; i++) {
        if (val === ppHiddenCodes[i].code || val.indexOf(ppHiddenCodes[i].name) !== -1) return true;
    }
    return false;
}

// 마감방식 간략화 헬퍼: 동일 방식 그룹핑
function formatFinishing(fin) {
    if (!fin) return '';
    try {
        var f = typeof fin === 'string' ? JSON.parse(fin) : fin;
        var t = f.top || '', b = f.bottom || '', l = f.left || '', r = f.right || '';
        if (!t && !b && !l && !r) return '';
        // 사방 동일
        if (t && t === b && t === l && t === r) return t + ' 사방';
        // 그룹핑: 같은 방식끼리 묶기
        var groups = {};
        if (t) { groups[t] = groups[t] || []; groups[t].push('상'); }
        if (b) { groups[b] = groups[b] || []; groups[b].push('하'); }
        if (l) { groups[l] = groups[l] || []; groups[l].push('좌'); }
        if (r) { groups[r] = groups[r] || []; groups[r].push('우'); }
        var parts = [];
        for (var method in groups) {
            var dirs = groups[method];
            parts.push(dirs.join('') + ':' + method);
        }
        return parts.join(' ');
    } catch(e) { return ''; }
}

function getPPBadge(ppName) {
    var name = String(ppName || '');
    for (var key in ppBadgeColors) {
        if (name.indexOf(key) !== -1) return ppBadgeColors[key];
    }
    return ppDefaultBadge;
}

// ===== 카드 빌더 =====
function buildKanbanCard(card, columnType) {
    var urg = getUrgency(card.delivery_date);
    var isHold = card.status === 'HOLD';
    var ripStatus = card.rip_status || '';
    var deliveryMethod = card.delivery_method || '';
    var deliveryTime = card.delivery_time || '';
    var isUrgentPulse = urg.diff <= 0 && columnType !== 'done';

    var cardCss = 'kanban-card';
    if (isHold) {
        cardCss += ' hold-card';
    } else {
        cardCss += ' ' + urg.css;
    }
    if (isUrgentPulse) cardCss += ' urgent-pulse';

    var html = '<div class="' + cardCss + '" draggable="true" data-card-id="' + card.id + '" data-card-status="' + card.status + '" onclick="viewCardDetail(' + card.id + ')">';

    // ── 상단: 체크박스 + 긴급도 + 거래처 + 납품방법 (한 줄) ──
    html += '<div class="flex items-center gap-1.5 mb-2">';
    // 체크박스
    var isSelected = selectedCardIds.has(card.id);
    html += '<div class="flex-shrink-0" onclick="event.stopPropagation()">';
    html += '<input type="checkbox" class="card-checkbox rounded border-gray-300" data-card-id="' + card.id + '" '
        + (isSelected ? 'checked' : '') + ' onchange="toggleCardSelect(this)">';
    html += '</div>';
    html += '<span class="px-1.5 py-0.5 rounded text-xs font-bold ' + urg.badge + '">' + urg.level + '</span>';
    if (ripStatus === 'QUEUED') html += '<span class="rip-badge rip-badge-queued">RIP전송됨</span>';
    else if (ripStatus === 'SENT') html += '<span class="rip-badge rip-badge-sent">RIP수신됨</span>';
    html += '<span class="font-semibold text-sm text-gray-800 truncate flex-1">' + escapeHtml(card.client_name || '') + '</span>';
    if (deliveryMethod) {
        var dmLabel = deliveryMethod + (deliveryTime ? ' ' + deliveryTime : '');
        html += '<span class="text-xs text-gray-500 whitespace-nowrap flex-shrink-0">' + dmLabel + '</span>';
    }
    // 메모 아이콘 (주문 메모 또는 카드 메모가 있으면)
    if (card.order_notes || card.notes) {
        html += '<span style="font-size:11px;color:#6b7280;flex-shrink:0" title="메모 있음">&#128221;</span>';
    }
    // 진행률 원형 뱃지 (다건 카드만)
    var _progData = card.print_progress || (card._items ? { total: card._items.length, done: card._items.filter(function(it) { return it.print_completed; }).length } : null);
    if (_progData && _progData.total > 1) {
        var _allDone = _progData.done >= _progData.total;
        html += '<span style="display:inline-flex;align-items:center;justify-content:center;min-width:28px;padding:0 5px;height:18px;border-radius:9px;font-size:10px;font-weight:700;flex-shrink:0;'
            + (_allDone ? 'background:#dcfce7;color:#15803d;border:1px solid #86efac' : 'background:#fef3c7;color:#92400e;border:1px solid #fde68a')
            + '">' + _progData.done + '/' + _progData.total + (_allDone ? ' ✓' : '') + '</span>';
    }
    html += '</div>';

    // ── 주문번호 + 진행률 바 (인라인) ──
    var hasProg = columnType === 'progress' && card._items && card._items.length > 0;
    var prog = hasProg ? (card.print_progress || { total: card._items.length, done: 0 }) : null;
    var pct = prog ? (prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0) : 0;

    html += '<div class="flex items-center gap-1.5 mb-2">';
    html += '<span class="text-xs text-gray-400 font-mono flex-shrink-0">' + (card.order_number || '') + '</span>';
    if (card.created_by_name) {
        html += '<span class="text-[10px] text-gray-400 flex-shrink-0">' + escapeHtml(card.created_by_name) + '</span>';
    }
    if (hasProg) {
        // 진행률 바 (주문번호 옆 인라인)
        html += '<div style="flex:1;display:flex;align-items:center;gap:6px">';
        html += '<div style="flex:1;height:5px;background:#e5e7eb;border-radius:3px;overflow:hidden">';
        html += '<div style="height:100%;width:' + pct + '%;background:' + (pct === 100 ? '#16a34a' : '#3b82f6') + ';border-radius:3px;transition:width 0.3s"></div>';
        html += '</div>';
        html += '<span class="text-[10px] font-bold ' + (pct === 100 ? 'text-green-600' : 'text-blue-600') + ' flex-shrink-0">' + pct + '%</span>';
        html += '</div>';
    }
    if (columnType === 'done' && card.order_card_total) {
        var allDone = card.order_card_done >= card.order_card_total;
        if (allDone) {
            html += '<span class="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700">' + card.order_card_done + '/' + card.order_card_total + ' &#10003;</span>';
        } else {
            html += '<span class="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">' + card.order_card_done + '/' + card.order_card_total + ' \ubbf8\uc644\ub8cc</span>';
        }
    }
    html += '</div>';

    // ── 메인 콘텐츠: 썸네일(좌) + 통합 아이템 리스트(우) ──
    var hasThumbnail = card.thumbnail_url && card.thumbnail_url.length > 10;
    html += '<div class="flex gap-3">';

    // 썸네일 영역
    if (hasThumbnail) {
        html += '<div class="flex-shrink-0">';
        html += '<img src="' + card.thumbnail_url + '" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;background:#f9fafb" onerror="this.parentElement.style.display=\'none\'">';
        html += '</div>';
    }

    // 통합 아이템 리스트 (품목+규격+수량+후가공을 한 줄씩, 읽기 전용)
    html += '<div class="flex-1 min-w-0">';
    if (card._items && card._items.length > 0) {
        card._items.forEach(function(item, idx) {
            var isDone = item.print_completed === 1;
            var ispec = '';
            if (item.width && item.height) ispec = Math.round(item.width) + 'x' + Math.round(item.height);

            // 2줄 구조: 1줄=품목명+내용+규격+수량, 2줄=후가공+마감
            html += '<div class="rounded" style="padding:3px 2px' + (idx > 0 ? ';margin-top:3px;border-top:1px solid #f1f5f9' : '') + '">';

            // 1줄: [완료아이콘] 품목명 — 내용 — 규격 x수량
            html += '<div class="flex items-center gap-1.5" style="min-height:22px">';
            if (columnType === 'progress') {
                if (isDone) {
                    html += '<i class="fas fa-check-circle flex-shrink-0" style="font-size:12px;color:#16a34a"></i>';
                } else {
                    html += '<i class="far fa-circle flex-shrink-0" style="font-size:12px;color:#d1d5db"></i>';
                }
            }
            html += '<span class="text-xs font-medium truncate ' + (isDone ? 'text-gray-400 line-through' : 'text-gray-800') + '">'
                + escapeHtml(item.item_name || '품목') + '</span>';
            if (item.content) {
                html += '<span class="text-[10px] text-gray-500 truncate">' + escapeHtml(item.content) + '</span>';
            }
            if (ispec) {
                html += '<span class="text-[10px] text-gray-400 flex-shrink-0">' + ispec + '</span>';
            }
            html += '<span class="text-xs font-bold text-blue-600 flex-shrink-0">x' + (item.quantity || 1) + '</span>';
            html += '</div>';

            // 2줄: 후가공뱃지 + 마감방식 (있을 때만)
            var hasLine2 = false;
            var line2Html = '';
            // 후가공
            if (item.post_processing) {
                try {
                    var ppArr = typeof item.post_processing === 'string' ? JSON.parse(item.post_processing) : item.post_processing;
                    var visiblePP = Array.isArray(ppArr) ? ppArr.filter(function(pp) { return !isPPHidden(pp.name || pp.code || pp); }) : [];
                    visiblePP.forEach(function(pp) {
                        var ppName = pp.name || pp.code || pp;
                        var badge = getPPBadge(ppName);
                        line2Html += '<span style="display:inline-flex;padding:0 4px;font-size:9px;font-weight:600;border-radius:9999px;background:' + badge.bg + ';color:' + badge.color + ';border:1px solid ' + badge.border + ';line-height:16px">' + escapeHtml(String(ppName)) + '</span>';
                        hasLine2 = true;
                    });
                } catch(ex) {}
            }
            // 마감방식 (품목별)
            if (item.finishing) {
                try {
                    var iFinText = formatFinishing(item.finishing);
                    if (iFinText) {
                        line2Html += '<span style="display:inline-flex;padding:0 5px;font-size:9px;font-weight:600;border-radius:9999px;background:#fef3c7;color:#92400e;border:1px solid #fde68a;line-height:16px"><i class="fas fa-cut" style="font-size:8px;margin-right:2px"></i>' + escapeHtml(iFinText) + '</span>';
                        hasLine2 = true;
                    }
                } catch(e) {}
            }
            if (hasLine2) {
                html += '<div class="flex flex-wrap items-center gap-1" style="margin-top:2px;padding-left:' + (columnType === 'progress' ? '20px' : '0') + '">' + line2Html + '</div>';
            }

            html += '</div>';
        });
    } else {
        // 단일 품목 (fallback)
        var fspec = '';
        if (card.width && card.height) fspec = Math.round(card.width) + 'x' + Math.round(card.height);
        html += '<div class="flex items-center gap-1.5" style="padding:3px 2px">';
        html += '<span class="text-xs font-medium text-gray-800 truncate">' + escapeHtml(card.item_name || '품목') + '</span>';
        if (fspec) html += '<span class="text-[10px] text-gray-400">' + fspec + '</span>';
        html += '<span class="text-xs font-bold text-blue-600">x' + (card.quantity || 1) + '</span>';
        html += '</div>';
    }
    html += '</div>'; // end 통합 아이템 리스트
    html += '</div>'; // end 메인 콘텐츠 flex

    // 마감방식: 품목 라인별로 이동됨 (카드 레벨 제거)

    // ── 구분선 ──
    html += '<div style="border-top:1px solid #f1f5f9;margin:8px 0 6px"></div>';

    // ── 하단: 마감 카운트다운 + 액션 버튼 ──
    html += '<div class="flex items-center justify-between">';
    var timeRem = getTimeRemaining(card.delivery_date, deliveryTime);
    if (timeRem) {
        html += '<span class="text-xs ' + (timeRem.urgent ? 'text-red-600 font-bold' : 'text-gray-500') + '">';
        html += '&#128345; ' + timeRem.text;
        html += '</span>';
    } else {
        html += '<span class="text-xs text-gray-400">' + (card.delivery_date || '납기미정') + '</span>';
    }

    // 액션 버튼 (이벤트 전파 차단)
    html += '<div class="flex gap-1">';
    if (columnType === 'progress') {
        // 진행중: RIP 전송 (미전송 시) + 보류
        if (!ripStatus) {
            html += '<button class="action-btn action-btn-rip text-xs" style="min-height:36px;padding:4px 10px" onclick="event.stopPropagation();showRipSendModal(' + card.id + ')">RIP 전송</button>';
        }
        html += '<button class="action-btn action-btn-hold text-xs" style="min-height:36px;padding:4px 8px" onclick="event.stopPropagation();quickHold(' + card.id + ')">보류</button>';
    } else if (columnType === 'hold') {
        html += '<button class="action-btn action-btn-resume text-xs" style="min-height:36px;padding:4px 10px" onclick="event.stopPropagation();quickStatus(' + card.id + ',\'PRINTING\')">재개</button>';
    }
    html += '</div>';
    html += '</div>';

    if (isHold && card.hold_reason) {
        html += '<div class="mt-1 text-xs text-red-500 bg-red-50 rounded px-2 py-1">보류: ' + escapeHtml(card.hold_reason) + '</div>';
    }

    html += '</div>';
    return html;
}

// ===== 개별 파일 출력완료 토글 =====
async function toggleItemPrint(cardId, cardItemId) {
    try {
        var res = await axios.patch('/api/cards/' + cardId + '/items/' + cardItemId + '/print-toggle');
        if (res.data && res.data.success) {
            // 상태 전환이 일어났을 수 있으므로 전체 새로고침
            await loadKanban();
        }
    } catch (e) {
        console.error('[cards] toggleItemPrint error:', e);
        showToast('출력 상태 변경에 실패했습니다.', 'error');
        loadKanban();
    }
}

// ===== 출력완료 → 진행중 되돌리기 =====
var _revertInProgress = {};
async function revertCard(cardId) {
    if (_revertInProgress[cardId]) return;
    if (!(await showConfirm('이 카드를 진행중으로 되돌리시겠습니까?'))) return;
    _revertInProgress[cardId] = true;
    try {
        var res = await axios.patch('/api/cards/' + cardId + '/revert');
        if (res.data && res.data.success) {
            await loadKanban();
        } else {
            showToast(res.data.error || '되돌리기 실패', 'error');
        }
    } catch (e) {
        console.error('[cards] revertCard error:', e);
        showToast('되돌리기에 실패했습니다.', 'error');
    } finally {
        delete _revertInProgress[cardId];
    }
}

// ===== 보류 섹션 =====
function renderHoldSection() {
    var filtered = holdCards;
    var section = document.getElementById('holdSection');
    var countEl = document.getElementById('holdCount');
    var listEl = document.getElementById('listHold');
    if (!section || !countEl || !listEl) return;
    if (filtered.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = '';
    countEl.textContent = filtered.length;
    var html = '';
    filtered.forEach(function(card) { html += buildKanbanCard(card, 'hold'); });
    listEl.innerHTML = html;
    listEl.style.display = holdExpanded ? '' : 'none';
}

function toggleHoldSection() {
    holdExpanded = !holdExpanded;
    var listEl = document.getElementById('listHold');
    if (listEl) listEl.style.display = holdExpanded ? '' : 'none';
}

// ===== 출력완료 거래처별 그룹 렌더링 =====
function renderPrintDoneGrouped(cards, targetId) {
    var el = document.getElementById(targetId || 'listPrintDone');
    if (!el) return;
    if (cards.length === 0) {
        el.innerHTML = '<div class="text-center text-gray-400 py-8 text-sm">미출고 완료 카드 없음</div>';
        return;
    }
    // 거래처별 그룹핑
    var groups = {};
    var groupOrder = [];
    cards.forEach(function(card) {
        var cn = card.client_name || '(미지정)';
        if (!groups[cn]) { groups[cn] = []; groupOrder.push(cn); }
        groups[cn].push(card);
    });
    // 각 그룹 내 정렬 + 그룹 간 정렬 (가장 급한 납기 기준)
    groupOrder.sort(function(a, b) {
        var aMin = Math.min.apply(null, groups[a].map(function(c) { return getUrgency(c.delivery_date).diff; }));
        var bMin = Math.min.apply(null, groups[b].map(function(c) { return getUrgency(c.delivery_date).diff; }));
        return aMin - bMin;
    });

    var html = '';
    groupOrder.forEach(function(clientName) {
        var groupCards = sortCards(groups[clientName]);
        var isExpanded = printDoneExpanded[clientName] !== false; // 기본 펼침
        var minUrg = Math.min.apply(null, groupCards.map(function(c) { return getUrgency(c.delivery_date).diff; }));
        var urgBadge = '';
        if (minUrg <= 0) urgBadge = '<span class="px-1 py-0.5 rounded text-xs font-bold bg-red-50 text-red-700 mr-1">긴급</span>';
        else if (minUrg <= 1) urgBadge = '<span class="px-1 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-700 mr-1">D-1</span>';

        var safeClient = clientName.replace(/'/g, '\x27').replace(/\\/g, '\\\\');
        html += '<div class="mb-2 border border-gray-200 rounded-lg overflow-hidden bg-white">';
        // 아코디언 헤더
        html += '<div class="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer select-none" onclick="togglePrintDoneGroup(\'' + safeClient + '\')">';
        html += '<div class="flex items-center gap-1.5">';
        html += '<span class="text-xs text-gray-400">' + (isExpanded ? '&#9660;' : '&#9654;') + '</span>';
        html += urgBadge;
        html += '<span class="font-semibold text-sm">' + clientName + '</span>';
        html += '<span class="text-xs text-gray-500">(' + groupCards.length + '건)</span>';
        html += '</div>';
        html += '<button class="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors" onclick="event.stopPropagation();bulkShipByClient(\'' + safeClient + '\')">일괄 출고</button>';
        html += '</div>';
        // 카드 목록 (그리드 뷰)
        html += '<div style="display:' + (isExpanded ? 'block' : 'none') + '">';
        html += '<div class="grid-card-container">';
        groupCards.forEach(function(card) { html += buildGridCard(card, 'done'); });
        html += '</div>';
        html += '</div>';
        html += '</div>';
    });
    el.innerHTML = html;
}

function togglePrintDoneGroup(clientName) {
    var current = printDoneExpanded[clientName];
    printDoneExpanded[clientName] = current === false ? true : false;
    renderPrintDoneGrouped(printDoneCards);
}

// ===== 출고 처리 =====
var _shipInProgress = {};
async function shipCard(cardId, force) {
    if (_shipInProgress[cardId]) return;
    var card = printDoneCards.find(function(c) { return c.id === cardId; });
    var msg = '이 카드를 출고 처리하시겠습니까?';
    if (card && card.pp_status === 'PENDING' && !force) {
        msg = '⚠️ 후가공이 완료되지 않았습니다.\n그래도 출고하시겠습니까?';
    } else if (card && card.order_card_total && card.order_card_done < card.order_card_total) {
        msg = '이 주문의 카드 ' + card.order_card_done + '/' + card.order_card_total + '만 출력완료 상태입니다.\n미완료 카드가 있지만 출고하시겠습니까?';
    }
    if (!(await showConfirm(msg))) return;
    _shipInProgress[cardId] = true;
    try {
        var payload = (card && card.pp_status === 'PENDING') ? { force: true } : {};
        var res = await axios.patch('/api/cards/' + cardId + '/ship', payload);
        var toastMsg = '출고 완료';
        if (res.data.order_shipped) toastMsg += ' (주문 전체 출고)';
        showToast(toastMsg, 'success');
        window.dispatchEvent(new Event('ordersUpdated'));
        loadKanban();
    } catch(e) {
        var msg2 = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '출고 처리 실패';
        showToast(msg2, 'error');
    } finally {
        delete _shipInProgress[cardId];
    }
}

var _unshipInProgress = {};
async function unshipCard(cardId) {
    if (_unshipInProgress[cardId]) return;
    if (!(await showConfirm('이 카드의 출고를 취소하시겠습니까?'))) return;
    _unshipInProgress[cardId] = true;
    try {
        var res = await axios.patch('/api/cards/' + cardId + '/unship', {});
        showToast('출고 취소 완료', 'success');
        loadKanban();
    } catch(e) {
        var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '출고 취소 실패';
        showToast(msg, 'error');
    } finally {
        delete _unshipInProgress[cardId];
    }
}

var _bulkShipInProgress = false;
async function bulkShipByClient(clientName) {
    if (_bulkShipInProgress) return;
    var targetCards = printDoneCards.filter(function(c) { return (c.client_name || '(미지정)') === clientName; });
    if (targetCards.length === 0) return;
    var incomplete = targetCards.filter(function(c) { return c.order_card_total && c.order_card_done < c.order_card_total; });
    var confirmMsg = clientName + ' - ' + targetCards.length + '건 일괄 출고하시겠습니까?';
    if (incomplete.length > 0) {
        confirmMsg = clientName + ' - ' + targetCards.length + '건 중 ' + incomplete.length + '건의 주문에 미완료 카드가 있습니다.\n그래도 출고하시겠습니까?';
    }
    if (!(await showConfirm(confirmMsg))) return;
    _bulkShipInProgress = true;
    try {
        var ids = targetCards.map(function(c) { return c.id; });
        var res = await axios.post('/api/cards/bulk-ship', { card_ids: ids });
        showToast(res.data.message || '일괄 출고 완료', 'success');
        loadKanban();
    } catch(e) {
        var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '일괄 출고 실패';
        showToast(msg, 'error');
    } finally {
        _bulkShipInProgress = false;
    }
}

// ===== 대시보드 =====
function renderDashboard() {
    renderProgressGauge();
    renderDeliverySummary();
    renderTodayShip();
    renderKanbanKpi();
}

function renderKanbanKpi() {
    var summary = kanbanSummary;
    // KPI 1: 납기 지연
    var overdueEl = document.getElementById('kpiOverdue');
    if (overdueEl) {
        var ov = (summary && summary.overdue) || 0;
        overdueEl.textContent = '지연 ' + ov + '건';
        if (ov > 0) {
            overdueEl.className = 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700';
        } else {
            overdueEl.className = 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-400';
        }
    }
    // KPI 2: 컬럼별 카드 수
    var ripEl = document.getElementById('kpiRipWaiting');
    if (ripEl) ripEl.textContent = 'RIP대기 ' + ((summary && summary.rip_waiting) || 0);
    var printingEl = document.getElementById('kpiPrinting');
    if (printingEl) printingEl.textContent = '출력중 ' + ((summary && summary.printing) || 0);
    var doneEl = document.getElementById('kpiPrintDone');
    if (doneEl) doneEl.textContent = '완료 ' + ((summary && summary.print_done) || 0);
    // KPI 3: 보류 건수
    var holdEl = document.getElementById('kpiHold');
    if (holdEl) {
        var hv = (summary && summary.hold) || 0;
        holdEl.textContent = '보류 ' + hv + '건';
        if (hv > 0) {
            holdEl.className = 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700';
        } else {
            holdEl.className = 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-400';
        }
    }
}

function renderProgressGauge() {
    var summary = kanbanSummary;
    if (!summary) {
        var g = document.getElementById('progressGauge');
        if (g) g.innerHTML = '<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="24" fill="none" stroke="#e5e7eb" stroke-width="6"/></svg>';
        return;
    }
    var total = summary.today_total || 0;
    var done = summary.today_done || 0;
    var pct = total > 0 ? Math.round(done / total * 100) : 0;
    var circumference = 2 * Math.PI * 24;
    var offset = circumference * (1 - pct / 100);
    var color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#eab308' : '#3b82f6';
    var gaugeEl = document.getElementById('progressGauge');
    if (gaugeEl) {
        gaugeEl.innerHTML = '<svg width="60" height="60" viewBox="0 0 60 60">'
            + '<circle cx="30" cy="30" r="24" fill="none" stroke="#e5e7eb" stroke-width="6"/>'
            + '<circle cx="30" cy="30" r="24" fill="none" stroke="' + color + '" stroke-width="6" '
            + 'stroke-dasharray="' + circumference + '" stroke-dashoffset="' + offset + '" '
            + 'transform="rotate(-90 30 30)" stroke-linecap="round"/>'
            + '</svg>';
    }
    var textEl = document.getElementById('progressText');
    if (textEl) textEl.textContent = pct + '%';
    var countEl = document.getElementById('progressCount');
    if (countEl) countEl.textContent = done + '/' + total + ' 완료';
}

function renderDeliverySummary() {
    var summary = kanbanSummary;
    var el = document.getElementById('deliverySummary');
    if (!el) return;
    if (!summary || !summary.by_delivery_method || summary.by_delivery_method.length === 0) {
        el.innerHTML = '<div class="text-xs text-gray-400">데이터 없음</div>';
        return;
    }
    var html = '';
    summary.by_delivery_method.forEach(function(dm) {
        var remaining = dm.total - dm.done;
        html += '<div class="flex items-center justify-between text-xs">'
            + '<span class="truncate">' + (dm.method || '') + (dm.time ? ' ' + dm.time : '') + '</span>'
            + '<span class="font-semibold ' + (remaining > 0 ? 'text-red-600' : 'text-gray-700') + '">'
            + dm.done + '/' + dm.total + '</span>'
            + '</div>';
    });
    el.innerHTML = html;
}

function renderTodayShip() {
    var countEl = document.getElementById('todayShipCount');
    var detailEl = document.getElementById('todayShipDetail');
    if (!countEl) return;

    var now = new Date();
    var todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

    // 오늘 납기인 카드 (진행중 + 출력완료 중 미출고)
    var allCards = inProgressCards.concat(printDoneCards);
    var todayCards = allCards.filter(function(c) {
        return c.delivery_date && c.delivery_date <= todayStr && !c.shipped_at;
    });

    countEl.textContent = todayCards.length;
    countEl.className = 'text-2xl font-bold ' + (todayCards.length > 0 ? 'text-red-600' : 'text-green-600');

    if (detailEl) {
        if (todayCards.length === 0) {
            detailEl.textContent = '모든 출고 완료';
        } else {
            // 배송방법별 분류
            var byMethod = {};
            todayCards.forEach(function(c) {
                var m = c.delivery_method || '미정';
                byMethod[m] = (byMethod[m] || 0) + 1;
            });
            var parts = [];
            for (var m in byMethod) parts.push(m + ' ' + byMethod[m] + '건');
            detailEl.textContent = parts.join(' / ');
        }
    }
}

// ===== 카테고리 필터 =====
async function loadCardCategories() {
    try {
        var res = await axios.get('/api/cards/categories');
        availableCategories = res.data.data || [];
        renderCategoryFilter();
    } catch (e) { console.error('loadCategories error:', e); }
}

function renderCategoryFilter() {
    var bar = document.getElementById('categoryFilterBar');
    if (!bar) return;
    if (availableCategories.length === 0) { bar.innerHTML = ''; return; }
    var html = '<button class="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors '
        + (!categoryFilter ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')
        + '" onclick="setCategoryFilter(\'\')">전체</button>';
    availableCategories.forEach(function(cat) {
        var isActive = categoryFilter === cat;
        html += '<button class="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors '
            + (isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')
            + '" onclick="setCategoryFilter(\'' + cat + '\')">' + cat + '</button>';
    });
    bar.innerHTML = html;
}

function setCategoryFilter(cat) {
    categoryFilter = cat;
    saveKanbanFilters();
    renderCategoryFilter();
    loadKanban();
}

// ===== 상태 변경 =====
var _statusInProgress = {};
async function quickStatus(cardId, status) {
    var key = cardId + '_' + status;
    if (_statusInProgress[key]) return;
    _statusInProgress[key] = true;
    try {
        await axios.patch('/api/cards/' + cardId + '/status', { status: status, reason: status === 'PRINT_DONE' ? '출력완료' : '재개' });
        showToast((statusLabels[status] || status) + ' 처리됨', 'success');
        window.dispatchEvent(new Event('ordersUpdated'));
        loadKanban();
    } catch (e) { showToast('상태 변경 실패', 'error'); }
    finally { delete _statusInProgress[key]; }
}

// ===== 전체 품목 출력완료 (카드 PRINT_DONE 단축키) =====
// item 체크 + 카드 상태 전환을 단일 트랜잭션으로 처리.
// quickStatus(id,'PRINT_DONE') 대체 — item과 card 상태 불일치 방지.
var _completeInProgress = {};
async function completeCard(cardId) {
    if (_completeInProgress[cardId]) return;
    _completeInProgress[cardId] = true;
    try {
        var res = await axios.patch('/api/cards/' + cardId + '/complete');
        if (res.data && res.data.success) {
            showToast('출력완료 처리됨', 'success');
            window.dispatchEvent(new Event('ordersUpdated'));
            loadKanban();
        } else {
            showToast(res.data.error || '출력완료 처리 실패', 'error');
        }
    } catch (e) {
        var msg = e.response?.data?.error || '출력완료 처리 실패';
        showToast(msg, 'error');
    } finally { delete _completeInProgress[cardId]; }
}

var _ppCompleteInProgress = {};
async function ppComplete(cardId) {
    if (_ppCompleteInProgress[cardId]) return;
    if (!(await showConfirm('후가공 완료 처리하시겠습니까?'))) return;
    _ppCompleteInProgress[cardId] = true;
    try {
        await axios.patch('/api/cards/' + cardId + '/pp-complete');
        showToast('후가공 완료 처리됨', 'success');
        loadKanban();
    } catch (e) {
        var msg = e.response?.data?.error || '후가공 완료 처리 실패';
        showToast(msg, 'error');
    } finally {
        delete _ppCompleteInProgress[cardId];
    }
}

function quickHold(cardId) {
    openHoldModal(cardId, false);
}

function openHoldModal(cardIds, isBulk) {
    _holdTargetIds = Array.isArray(cardIds) ? cardIds : [cardIds];
    _holdIsBulk = isBulk || false;
    var catEl = document.getElementById('holdDefectCategory');
    var reasonEl = document.getElementById('holdReason');
    var modalEl = document.getElementById('holdModal');
    if (catEl) catEl.value = '';
    if (reasonEl) reasonEl.value = '';
    if (modalEl) modalEl.style.display = 'flex';
}

function closeHoldModal() {
    document.getElementById('holdModal').style.display = 'none';
    _holdTargetIds = [];
}

async function confirmHold() {
    var reason = document.getElementById('holdReason').value.trim();
    if (!reason) {
        showToast('보류 사유를 입력하세요.', 'warning');
        return;
    }
    var defectCategory = document.getElementById('holdDefectCategory').value || null;
    try {
        if (_holdIsBulk) {
            await axios.patch('/api/cards/bulk/status', {
                card_ids: _holdTargetIds,
                status: 'HOLD',
                reason: reason,
                defect_category: defectCategory
            });
        } else {
            await axios.patch('/api/cards/' + _holdTargetIds[0] + '/status', {
                status: 'HOLD',
                reason: reason,
                defect_category: defectCategory
            });
        }
        showToast('보류 처리 완료', 'success');
        closeHoldModal();
        loadKanban();
    } catch(e) {
        var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
        showToast('오류: ' + msg, 'error');
    }
}

// ===== RIP 전송 모달 =====
var _ripEquipmentList = null; // 캐시

async function loadRipEquipment() {
    if (_ripEquipmentList) return _ripEquipmentList;
    try {
        var res = await axios.get('/api/rip/equipment');
        _ripEquipmentList = res.data.data || [];
        return _ripEquipmentList;
    } catch(e) {
        showToast('장비 목록 로드 실패', 'error');
        return [];
    }
}

async function showRipSendModal(cardId) {
    // 로딩 토스트
    showToast('장비 정보 로딩중...', 'info');

    // 1. 장비 목록 + 카드 아이템 동시 로드
    var equipmentList, items;
    try {
        var [eqList, itemsRes] = await Promise.all([
            loadRipEquipment(),
            axios.get('/api/rip/card-items/' + cardId)
        ]);
        equipmentList = eqList || [];
        items = (itemsRes.data && itemsRes.data.data) || [];
    } catch(e) {
        showToast('데이터 로드 실패: ' + (e.message || '알 수 없는 오류'), 'error');
        return;
    }

    if (items.length === 0) {
        showToast('전송할 아이템이 없습니다', 'warning');
        return;
    }

    var unsent = items.filter(function(it) { return !it.rip_status; });
    if (unsent.length === 0) {
        showToast('모든 아이템이 이미 전송되었습니다', 'info');
        return;
    }

    // 2. 모달 HTML
    var overlay = document.createElement('div');
    overlay.id = 'ripSendOverlay';
    overlay.className = 'card-panel-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) closeRipSendModal(); };

    var html = '<div class="card-panel" id="ripSendPanel" style="width:520px">';

    // 헤더
    html += '<div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">';
    html += '<div style="display:flex;align-items:center;gap:8px"><i class="fas fa-satellite-dish" style="color:#2563eb"></i><span style="font-size:16px;font-weight:600;color:#111827">RIP 전송</span></div>';
    html += '<button onclick="closeRipSendModal()" style="background:none;border:none;cursor:pointer;padding:4px;color:#6b7280;font-size:18px">&times;</button>';
    html += '</div>';

    // 본문
    html += '<div style="padding:20px;overflow-y:auto;max-height:calc(100vh - 140px)">';

    // 장비 상태 요약
    html += '<div style="margin-bottom:16px;padding:10px 14px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb">';
    html += '<div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:6px">장비 상태</div>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    equipmentList.forEach(function(eq) {
        var isOnline = eq.agent_status === 'ONLINE';
        var dotColor = isOnline ? '#16a34a' : '#d1d5db';
        var textColor = isOnline ? '#111827' : '#9ca3af';
        html += '<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:' + textColor + '">';
        html += '<span style="width:6px;height:6px;border-radius:50%;background:' + dotColor + ';display:inline-block"></span>';
        html += escapeHtml(eq.name);
        html += '</span>';
    });
    html += '</div></div>';

    // 아이템 목록
    items.forEach(function(item, idx) {
        var isSent = item.rip_status === 'QUEUED' || item.rip_status === 'SENT';
        var borderColor = isSent ? '#d1d5db' : '#e5e7eb';
        var bgColor = isSent ? '#f9fafb' : '#fff';

        html += '<div class="rip-item-row" data-idx="' + idx + '" style="margin-bottom:12px;padding:14px;border:1px solid ' + borderColor + ';border-radius:8px;background:' + bgColor + '">';

        // 아이템 정보 헤더
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
        html += '<div style="font-size:13px;font-weight:600;color:#111827">' + escapeHtml(item.item_name) + '</div>';
        if (isSent) {
            var badgeBg = item.rip_status === 'QUEUED' ? '#dbeafe' : '#d1fae5';
            var badgeColor = item.rip_status === 'QUEUED' ? '#1d4ed8' : '#15803d';
            var badgeText = item.rip_status === 'QUEUED' ? 'RIP 대기중' : 'RIP 전송됨';
            html += '<span style="font-size:11px;padding:2px 8px;border-radius:9999px;background:' + badgeBg + ';color:' + badgeColor + '">' + badgeText + '</span>';
        }
        html += '</div>';

        // 규격 정보
        var w = item.width || 0;
        var h = item.height || 0;
        var sf = item.scale_factor || 1;
        var displayW = (w * sf).toFixed(0);
        var displayH = (h * sf).toFixed(0);
        html += '<div style="font-size:12px;color:#6b7280;margin-bottom:10px">';
        html += displayW + '×' + displayH + 'cm · ' + (item.quantity || 1) + '매';
        if (item.content) html += ' · ' + escapeHtml(item.content);
        html += '</div>';

        if (!isSent) {
            // 장비 선택
            html += '<div style="display:flex;gap:8px;margin-bottom:8px">';
            html += '<div style="flex:1">';
            html += '<label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">장비</label>';
            html += '<select id="ripEq_' + idx + '" onchange="onRipEquipmentChange(' + idx + ')" style="width:100%;padding:6px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;background:#fff">';
            html += '<option value="">선택</option>';
            equipmentList.forEach(function(eq) {
                var disabled = eq.agent_status !== 'ONLINE' ? ' disabled' : '';
                var suffix = eq.agent_status !== 'ONLINE' ? ' (OFFLINE)' : '';
                html += '<option value="' + eq.id + '"' + disabled + '>' + escapeHtml(eq.name) + suffix + '</option>';
            });
            html += '</select></div>';

            // 프리셋 선택
            html += '<div style="flex:1">';
            html += '<label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">프리셋</label>';
            html += '<select id="ripPreset_' + idx + '" style="width:100%;padding:6px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;background:#fff" disabled>';
            html += '<option value="">장비를 먼저 선택</option>';
            html += '</select></div>';
            html += '</div>';

            // 개별 전송 버튼
            html += '<button id="ripSendBtn_' + idx + '" onclick="sendRipItem(' + item.card_item_id + ',' + idx + ')" ';
            html += 'style="width:100%;padding:7px;font-size:12px;font-weight:600;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer" disabled>';
            html += '<i class="fas fa-satellite-dish" style="margin-right:4px"></i>전송</button>';
        }

        html += '</div>';
    });

    // 일괄 전송 섹션
    var unsent = items.filter(function(it) { return !it.rip_status; });
    if (unsent.length > 1) {
        html += '<div style="margin-top:16px;padding:14px;border:1px solid #e5e7eb;border-radius:8px;background:#f0f7ff">';
        html += '<div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:10px"><i class="fas fa-layer-group" style="margin-right:6px;color:#2563eb"></i>일괄 전송</div>';

        html += '<div style="display:flex;gap:8px;margin-bottom:10px">';
        html += '<div style="flex:1">';
        html += '<label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">장비</label>';
        html += '<select id="ripBulkEq" onchange="onRipBulkEquipmentChange()" style="width:100%;padding:6px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;background:#fff">';
        html += '<option value="">선택</option>';
        equipmentList.forEach(function(eq) {
            var disabled = eq.agent_status !== 'ONLINE' ? ' disabled' : '';
            var suffix = eq.agent_status !== 'ONLINE' ? ' (OFFLINE)' : '';
            html += '<option value="' + eq.id + '"' + disabled + '>' + escapeHtml(eq.name) + suffix + '</option>';
        });
        html += '</select></div>';

        html += '<div style="flex:1">';
        html += '<label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">프리셋</label>';
        html += '<select id="ripBulkPreset" style="width:100%;padding:6px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;background:#fff" disabled>';
        html += '<option value="">장비를 먼저 선택</option>';
        html += '</select></div>';
        html += '</div>';

        html += '<button id="ripBulkSendBtn" onclick="sendRipBulk(' + cardId + ')" ';
        html += 'style="width:100%;padding:8px;font-size:13px;font-weight:600;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer" disabled>';
        html += '<i class="fas fa-satellite-dish" style="margin-right:4px"></i>미전송 ' + unsent.length + '건 일괄 전송</button>';
        html += '</div>';
    }

    html += '</div>'; // 본문 끝
    html += '</div>'; // 패널 끝

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    // 저장: 아이템 데이터 참조
    window._ripItems = items;
    window._ripEquipmentList = equipmentList;
    window._ripCardId = cardId;

    // ESC 모달 닫기는 layout.ts 글로벌 핸들러가 처리

    // 슬라이드 인 애니메이션
    requestAnimationFrame(function() {
        var panel = document.getElementById('ripSendPanel');
        if (panel) panel.classList.add('card-panel-open');
    });
}

function closeRipSendModal() {
    var panel = document.getElementById('ripSendPanel');
    if (panel) {
        panel.classList.remove('card-panel-open');
        setTimeout(function() {
            var overlay = document.getElementById('ripSendOverlay');
            if (overlay) overlay.remove();
        }, 250);
    } else {
        var overlay = document.getElementById('ripSendOverlay');
        if (overlay) overlay.remove();
    }
    // 전역 변수 정리
    window._ripItems = null;
    window._ripEquipmentList = null;
    window._ripCardId = null;
    // ESC 모달 닫기는 layout.ts 글로벌 핸들러가 처리
}

function _ripEscHandler(e) {
    if (e.key === 'Escape' && document.getElementById('ripSendOverlay')) {
        closeRipSendModal();
    }
}

function onRipEquipmentChange(idx) {
    var eqEl = document.getElementById('ripEq_' + idx);
    var presetSelect = document.getElementById('ripPreset_' + idx);
    var sendBtn = document.getElementById('ripSendBtn_' + idx);
    if (!eqEl || !presetSelect || !sendBtn) return;
    var eqId = eqEl.value;

    presetSelect.innerHTML = '';
    sendBtn.disabled = true;

    if (!eqId) {
        presetSelect.innerHTML = '<option value="">장비를 먼저 선택</option>';
        presetSelect.disabled = true;
        return;
    }

    var eq = (window._ripEquipmentList || []).find(function(e) { return e.id === eqId; });
    var presets = (eq && eq.presets) ? eq.presets : [];

    if (presets.length === 0) {
        presetSelect.innerHTML = '<option value="">프리셋 없음</option>';
        presetSelect.disabled = true;
        return;
    }

    presetSelect.disabled = false;
    presets.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p.preset_name;
        opt.textContent = p.preset_name + (p.is_default ? ' (기본)' : '');
        presetSelect.appendChild(opt);
    });

    // 기본 프리셋 자동 선택
    var defaultPreset = presets.find(function(p) { return p.is_default; });
    if (defaultPreset) presetSelect.value = defaultPreset.preset_name;

    sendBtn.disabled = false;
}

function onRipBulkEquipmentChange() {
    var eqId = document.getElementById('ripBulkEq').value;
    var presetSelect = document.getElementById('ripBulkPreset');
    var sendBtn = document.getElementById('ripBulkSendBtn');

    presetSelect.innerHTML = '';
    sendBtn.disabled = true;

    if (!eqId) {
        presetSelect.innerHTML = '<option value="">장비를 먼저 선택</option>';
        presetSelect.disabled = true;
        return;
    }

    var eq = (window._ripEquipmentList || []).find(function(e) { return e.id === eqId; });
    var presets = (eq && eq.presets) ? eq.presets : [];

    if (presets.length === 0) {
        presetSelect.innerHTML = '<option value="">프리셋 없음</option>';
        presetSelect.disabled = true;
        return;
    }

    presetSelect.disabled = false;
    presets.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p.preset_name;
        opt.textContent = p.preset_name + (p.is_default ? ' (기본)' : '');
        presetSelect.appendChild(opt);
    });

    var defaultPreset = presets.find(function(p) { return p.is_default; });
    if (defaultPreset) presetSelect.value = defaultPreset.preset_name;

    sendBtn.disabled = false;
}

async function sendRipItem(cardItemId, idx) {
    var eqEl = document.getElementById('ripEq_' + idx);
    var presetEl = document.getElementById('ripPreset_' + idx);
    var btn = document.getElementById('ripSendBtn_' + idx);
    if (!eqEl || !presetEl || !btn) return;

    var eqId = eqEl.value;
    var preset = presetEl.value;

    if (!eqId || !preset) {
        showToast('장비와 프리셋을 선택해주세요', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:4px"></i>전송중...';

    try {
        await axios.post('/api/rip/send-item/' + cardItemId, {
            equipment_id: eqId,
            rip_preset: preset
        });
        showToast('RIP 전송 완료', 'success');

        // 해당 아이템 행을 전송됨 상태로 업데이트
        var row = document.querySelector('.rip-item-row[data-idx="' + idx + '"]');
        if (row) {
            row.style.background = '#f9fafb';
            row.style.borderColor = '#d1d5db';
            // 선택/버튼 영역 교체
            var itemName = (window._ripItems[idx] || {}).item_name || '';
            row.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center">' +
                '<div style="font-size:13px;font-weight:600;color:#111827">' + escapeHtml(itemName) + '</div>' +
                '<span style="font-size:11px;padding:2px 8px;border-radius:9999px;background:#dbeafe;color:#1d4ed8">RIP 대기중</span>' +
                '</div>';
        }

        loadKanban();
    } catch(e) {
        var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
        showToast('전송 실패: ' + msg, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-satellite-dish" style="margin-right:4px"></i>전송';
    }
}

async function sendRipBulk(cardId) {
    var eqEl = document.getElementById('ripBulkEq');
    var presetEl = document.getElementById('ripBulkPreset');
    var btn = document.getElementById('ripBulkSendBtn');
    if (!eqEl || !presetEl || !btn) return;

    var eqId = eqEl.value;
    var preset = presetEl.value;

    if (!eqId || !preset) {
        showToast('장비와 프리셋을 선택해주세요', 'warning');
        return;
    }

    var unsent = (window._ripItems || []).filter(function(it) { return !it.rip_status; });
    if (unsent.length === 0) {
        showToast('전송할 아이템이 없습니다', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:4px"></i>전송중...';

    try {
        var payload = {
            items: unsent.map(function(it) {
                return { card_item_id: it.card_item_id, equipment_id: eqId, rip_preset: preset };
            })
        };
        var res = await axios.post('/api/rip/send-items-bulk', payload);
        var data = res.data.data;
        var sentCount = (data.sent || []).length;
        var errorCount = (data.errors || []).length;

        if (sentCount > 0) showToast(sentCount + '건 RIP 전송 완료' + (errorCount > 0 ? ' (' + errorCount + '건 실패)' : ''), 'success');
        else showToast('전송 실패: ' + (data.errors[0] || {}).error, 'error');

        closeRipSendModal();
        loadKanban();
    } catch(e) {
        var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
        showToast('일괄 전송 실패: ' + msg, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-satellite-dish" style="margin-right:4px"></i>일괄 전송';
    }
}

// ===== QR 스캔 =====
async function processQrScan(value) {
    if (!value || !value.trim()) return;
    var cardNumber = value.trim();
    try {
        // 카드 상태 조회 후 다음 단계로 자동 전환
        var infoRes = await axios.get('/api/cards/' + encodeURIComponent(cardNumber));
        if (!infoRes.data.success) { showToast('카드를 찾을 수 없습니다: ' + cardNumber, 'error'); return; }
        var card = infoRes.data.data;
        var status = card.status;

        if (status === 'PRINTING') {
            // PRINTING → PRINT_DONE
            await axios.patch('/api/cards/' + card.id + '/status', { status: 'PRINT_DONE' });
            showToast(cardNumber + ' 출력완료 처리됨', 'success');
        } else if (status === 'PRINT_DONE') {
            // PRINT_DONE → 출고
            var res = await axios.post('/api/cards/' + encodeURIComponent(cardNumber) + '/ship', {});
            showToast(cardNumber + ' 출고 처리 완료' + (res.data.order_shipped ? ' (주문 전체 출고)' : ''), 'success');
        } else if (status === 'HOLD') {
            // HOLD → PRINTING (재개)
            await axios.patch('/api/cards/' + card.id + '/status', { status: 'PRINTING' });
            showToast(cardNumber + ' 보류 해제 → 진행중', 'success');
        } else {
            showToast(cardNumber + ' 현재 상태: ' + status, 'info');
        }
        loadKanban();
    } catch (e) {
        var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : 'QR 처리 실패';
        showToast(msg, 'error');
    }
}

// ===== 선택/벌크 =====
function toggleCardSelection(cardId, checked) {
    if (checked) selectedCardIds.add(cardId); else selectedCardIds.delete(cardId);
    updateBulkBar();
}

function clearSelection() {
    selectedCardIds.clear();
    document.querySelectorAll('input[type=checkbox][data-id]').forEach(function(cb) { cb.checked = false; });
    document.querySelectorAll('.card-checkbox').forEach(function(cb) { cb.checked = false; });
    updateBulkBar();
    updateCardBulkBar();
}

function updateBulkBar() {
    var bar = document.getElementById('bulkBar');
    if (selectedCardIds.size > 0) bar.classList.add('visible');
    else bar.classList.remove('visible');
    document.getElementById('selectedCount').textContent = selectedCardIds.size + '장 선택됨';
}

async function bulkChangeStatus(status) {
    if (selectedCardIds.size === 0) return;
    if (status === 'HOLD') {
        openHoldModal(Array.from(selectedCardIds), true);
        return;
    }
    var reason = '일괄 변경';
    try {
        await axios.patch('/api/cards/bulk/status', { card_ids: Array.from(selectedCardIds), status: status, reason: reason });
        showToast(selectedCardIds.size + '장 ' + (statusLabels[status] || status) + ' 처리됨', 'success');
        selectedCardIds.clear();
        updateBulkBar();
        loadKanban();
    } catch (e) { showToast('일괄 변경 실패', 'error'); }
}

// ===== 카드 상세 모달 =====
async function viewCardDetail(cardId) {
    try {
        var results = await Promise.all([
            axios.get('/api/cards/' + cardId),
            axios.get('/api/cards/' + cardId + '/history'),
            axios.get('/api/cards/' + cardId + '/defects')
        ]);
        var card = results[0].data.data;
        // 같은 주문의 다른 카드 조회 (알림 배너용)
        var siblingCards = [];
        if (card && card.order_id) {
            try {
                var sibRes = await axios.get('/api/cards?order_id=' + card.order_id);
                siblingCards = (sibRes.data.data || []).filter(function(c) { return c.id !== cardId; });
            } catch(_) {}
        }
        showCardModal(card, results[1].data.data || [], results[2].data.data || [], siblingCards);
    } catch (e) { showToast('카드 정보 로드 실패', 'error'); }
}

function buildDefectsHtml(defects) {
  if (!defects || defects.length === 0) return '';
  var catLabels = { COLOR: '색상', ALIGNMENT: '정렬', CUT: '재단', MATERIAL: '소재', PRINT: '출력', PP: '후가공', OTHER: '기타' };
  var statusLabels = { OPEN: '미처리', UNDER_REVIEW: '검토중', RESOLVED: '해결', REWORK_REQUIRED: '재작업필요' };
  var statusColors = { OPEN: 'bg-red-50 text-red-700', UNDER_REVIEW: 'bg-amber-50 text-amber-700', RESOLVED: 'bg-green-50 text-green-700', REWORK_REQUIRED: 'bg-amber-50 text-amber-700' };
  var rows = defects.map(function(d) {
    return '<div class="flex items-start gap-2 py-1.5 border-b border-gray-100 last:border-0">'
      + '<span class="px-1.5 py-0.5 rounded text-xs font-medium ' + (statusColors[d.status] || 'bg-gray-100') + '">' + (statusLabels[d.status] || d.status) + '</span>'
      + '<span class="text-xs font-medium">' + (catLabels[d.defect_category] || d.defect_category || '') + '</span>'
      + '<span class="text-xs text-gray-500 flex-1">' + (d.description || '') + '</span>'
      + '<span class="text-xs text-gray-400 whitespace-nowrap">' + (d.reported_at ? new Date(d.reported_at).toLocaleDateString('ko-KR') : '') + '</span>'
      + '</div>';
  }).join('');
  return '<div class="mt-3 bg-amber-50 rounded p-2">'
    + '<div class="text-xs font-bold text-amber-700 mb-1"><i class="fas fa-exclamation-triangle mr-1"></i>불량 이력 (' + defects.length + '건)</div>'
    + rows + '</div>';
}

function showCardModal(card, history, defects, siblingCards) {
    var existing = document.getElementById('cardModal');
    if (existing) existing.remove();

    // 같은 주문 다른 카드 알림 배너
    var siblingBannerHtml = '';
    if (siblingCards && siblingCards.length > 0) {
        var pendingSiblings = siblingCards.filter(function(s) {
            return s.status !== 'PRINT_DONE' && s.status !== 'SHIPPED';
        });
        if (pendingSiblings.length > 0) {
            siblingBannerHtml = '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:12px">'
                + '<div style="font-size:13px;font-weight:600;color:#92400e"><i class="fas fa-exclamation-triangle" style="margin-right:4px"></i>이 주문에 다른 카드가 있습니다</div>';
            pendingSiblings.forEach(function(s) {
                var sLabel = statusLabels[s.status] || s.status;
                siblingBannerHtml += '<div style="font-size:12px;color:#b45309;margin-top:4px">'
                    + s.card_number + ': ' + (s.category_name || s.item_name || '') + ' (' + sLabel + ')</div>';
            });
            siblingBannerHtml += '<div style="font-size:11px;color:#d97706;margin-top:6px">→ 전체 완료 후 같이 출고해야 합니다</div></div>';
        } else {
            // 모든 형제 카드 완료
            siblingBannerHtml = '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-bottom:12px">'
                + '<div style="font-size:13px;font-weight:600;color:#166534"><i class="fas fa-check-circle" style="margin-right:4px"></i>이 주문의 모든 카드가 완료되었습니다</div>'
                + '<div style="font-size:11px;color:#15803d;margin-top:2px">출고 가능 상태입니다.</div></div>';
        }
    }

    var urg = getUrgency(card.delivery_date);
    var stLabel = statusLabels[card.status] || card.status;
    var statusBg = card.status === 'PRINT_DONE' ? 'background:#f0fdf4;color:#166534'
        : card.status === 'HOLD' ? 'background:#fef2f2;color:#991b1b'
        : 'background:#eff6ff;color:#1d4ed8';
    var deliveryMethod = card.delivery_method || '';
    var deliveryTime = card.delivery_time || '';
    var itemsArr = card.items || card._items || [];

    // ── 진행률 계산 ──
    var totalItems = itemsArr.length || 1;
    var doneItems = 0;
    itemsArr.forEach(function(it) { if (it.print_completed === 1) doneItems++; });
    var pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
    var hasProgress = card.status !== 'PRINT_DONE' && itemsArr.length > 0;

    // ── 아이템 리스트 (개별 썸네일 + 체크박스) ──
    var itemsHtml = '';
    if (itemsArr.length > 0) {
        itemsArr.forEach(function(it) {
            var realW = Math.round(it.width || 0);
            var realH = Math.round(it.height || 0);
            var sf = it.scale_factor || 1;
            var isDone = it.print_completed === 1;
            var ciId = it.card_item_id || it.id;

            // 썸네일 (크게)
            var thumbHtml = it.thumbnail_url
                ? '<img src="' + it.thumbnail_url + '" style="width:100%;height:100%;object-fit:contain;background:#f9fafb" onclick="event.stopPropagation();zoomThumb(this.src)">'
                : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#d1d5db"><i class="fas fa-image" style="font-size:28px"></i></div>';

            itemsHtml += '<div class="card-modal-item' + (isDone ? ' item-completed' : '') + '">';

            // 썸네일 영역
            itemsHtml += '<div class="card-modal-thumb" onclick="event.stopPropagation()">' + thumbHtml + '</div>';

            // 정보 영역
            itemsHtml += '<div class="card-modal-item-info">';
            itemsHtml += '<div style="display:flex;align-items:center;gap:8px">';
            itemsHtml += '<span style="font-size:14px;font-weight:600;color:' + (isDone ? '#9ca3af' : '#111827') + ';' + (isDone ? 'text-decoration:line-through;' : '') + '">' + escapeHtml(it.item_name || '품목') + '</span>';
            itemsHtml += '<span style="font-size:13px;font-weight:700;color:#2563eb">x' + (it.quantity || 1) + (it.unit || 'EA') + '</span>';
            itemsHtml += '</div>';

            // 규격
            itemsHtml += '<div style="font-size:12px;color:#6b7280;margin-top:2px">' + realW + ' x ' + realH + 'cm';
            if (sf > 1) itemsHtml += ' <span style="color:#9ca3af">(축척 1/' + sf + ')</span>';
            itemsHtml += '</div>';

            // 내용
            if (it.content) {
                itemsHtml += '<div style="font-size:12px;color:#2563eb;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(it.content) + '</div>';
            }

            // 후가공 뱃지
            if (it.post_processing) {
                try {
                    var ppA = typeof it.post_processing === 'string' ? JSON.parse(it.post_processing) : it.post_processing;
                    var visPP = Array.isArray(ppA) ? ppA.filter(function(pp) { return !isPPHidden(pp.name || pp.code || pp); }) : [];
                    if (visPP.length > 0) {
                        itemsHtml += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">';
                        visPP.forEach(function(pp) {
                            var ppName = pp.name || pp.code || pp;
                            var badge = getPPBadge(ppName);
                            itemsHtml += '<span style="display:inline-flex;padding:1px 6px;font-size:10px;font-weight:600;border-radius:999px;background:' + badge.bg + ';color:' + badge.color + ';border:1px solid ' + badge.border + '">' + escapeHtml(String(ppName)) + '</span>';
                        });
                        itemsHtml += '</div>';
                    }
                } catch(ex2) {}
            }
            // 마감방식 (품목별)
            if (it.finishing) {
                var dFinText = formatFinishing(it.finishing);
                if (dFinText) {
                    itemsHtml += '<div style="margin-top:4px;padding:2px 8px;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;font-size:11px;color:#92400e;display:inline-block">'
                        + '<i class="fas fa-cut" style="font-size:9px;margin-right:3px"></i>마감: ' + escapeHtml(dFinText) + '</div>';
                }
            }
            itemsHtml += '</div>'; // end info

            // 체크박스 (출력 완료 토글)
            if (ciId && card.status !== 'PRINT_DONE') {
                itemsHtml += '<div style="display:flex;align-items:center;flex-shrink:0;padding-left:8px" onclick="event.stopPropagation()">';
                itemsHtml += '<input type="checkbox" style="width:20px;height:20px;accent-color:#2563eb;cursor:pointer" '
                    + (isDone ? 'checked' : '') + ' onchange="toggleItemPrint(' + card.id + ',' + ciId + ')">';
                itemsHtml += '</div>';
            } else if (isDone) {
                itemsHtml += '<div style="flex-shrink:0;padding-left:8px"><i class="fas fa-check-circle" style="font-size:18px;color:#16a34a"></i></div>';
            }

            itemsHtml += '</div>'; // end card-modal-item
        });
    } else if (card.category_name) {
        itemsHtml = '<div style="padding:12px 0;font-size:13px;color:#6b7280">' + (card.category_name || '') + ' · ' + (card.item_count || 1) + '건</div>';
    }

    // ── 상태 이력 타임라인 ──
    var histHtml = '';
    if (history.length > 0) {
        histHtml += '<div style="border-top:1px solid #f1f5f9;margin:14px 0 10px"></div>';
        histHtml += '<div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">상태 이력</div>';
        history.forEach(function(h) {
            var fromLabel = h.from_status ? (statusLabels[h.from_status] || h.from_status) : '-';
            var toLabel = statusLabels[h.to_status] || h.to_status;
            var dotColor = h.to_status === 'PRINT_DONE' ? '#16a34a' : h.to_status === 'HOLD' ? '#ef4444' : '#3b82f6';
            histHtml += '<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 0;font-size:11px">';
            histHtml += '<div style="width:8px;height:8px;border-radius:50%;background:' + dotColor + ';margin-top:4px;flex-shrink:0"></div>';
            histHtml += '<span style="color:#9ca3af;white-space:nowrap;flex-shrink:0;width:70px">' + new Date(h.created_at).toLocaleString('ko-KR', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) + '</span>';
            histHtml += '<span style="color:#374151">' + fromLabel + ' → <b>' + toLabel + '</b>'
                + (h.change_reason ? ' <span style="color:#9ca3af">(' + escapeHtml(h.change_reason) + ')</span>' : '') + '</span>';
            histHtml += '</div>';
        });
    }

    // ── 액션 버튼 ──
    var actionBtns = '';
    if (card.status === 'PRINTING' || card.status === 'RIP_WAITING') {
        if (!card.rip_status) {
            actionBtns += '<button class="action-btn action-btn-rip flex-1" onclick="closeCardModal();showRipSendModal(' + card.id + ')">RIP 전송</button>';
        }
        actionBtns += '<button class="action-btn action-btn-hold flex-1" onclick="closeCardModal();quickHold(' + card.id + ')">보류</button>';
    } else if (card.status === 'HOLD') {
        actionBtns += '<button class="action-btn action-btn-resume flex-1" onclick="closeCardModal();quickStatus(' + card.id + ',\'PRINTING\')">재개</button>';
    } else if (card.status === 'PRINT_DONE') {
        if (card.shipped_at) {
            actionBtns += '<button class="action-btn flex-1" style="background:#fff;color:#6b7280;border:1px solid #d1d5db;border-radius:8px" onclick="closeCardModal();unshipCard(' + card.id + ')"><i class="fas fa-undo"></i> 출고 취소</button>';
        } else {
            actionBtns += '<button class="action-btn action-btn-done flex-1" onclick="closeCardModal();shipCard(' + card.id + ')"><i class="fas fa-truck"></i> 출고</button>';
            actionBtns += '<button class="action-btn flex-1" style="background:#fff;color:#6b7280;border:1px solid #d1d5db;border-radius:8px" onclick="closeCardModal();revertCard(' + card.id + ')"><i class="fas fa-undo"></i> 되돌리기</button>';
        }
    }
    actionBtns += '<button class="action-btn action-btn-hold flex-1" onclick="closeCardModal();showDefectForm(' + card.id + ')"><i class="fas fa-exclamation-triangle"></i> 불량접수</button>';
    actionBtns += '<button class="action-btn flex-1" style="background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:8px" onclick="printWorkOrder(' + card.order_id + ')"><i class="fas fa-print"></i> 작업지시서</button>';

    // ── 모달 조립 (C형 슬라이드 패널) ──
    var modal = document.createElement('div');
    modal.id = 'cardModal';
    modal.className = 'card-panel-overlay';
    modal.onclick = function(e) { if (e.target === modal) closeCardModal(); };

    var timeRem = getTimeRemaining(card.delivery_date, deliveryTime);
    var timeHtml = '';
    if (timeRem) {
        timeHtml = '<span style="font-size:12px;' + (timeRem.urgent ? 'color:#dc2626;font-weight:700' : 'color:#6b7280') + '"><i class="far fa-clock"></i> ' + timeRem.text + '</span>';
    } else {
        timeHtml = '<span style="font-size:12px;color:#9ca3af">' + (card.delivery_date || '납기미정') + '</span>';
    }

    modal.innerHTML = '<div class="card-panel" id="cardPanel">'
        // 헤더
        + '<div class="card-panel-header">'
        + '  <div style="flex:1;min-width:0">'
        + '    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
        + '      <span style="font-size:17px;font-weight:700">' + escapeHtml(card.client_name || '') + '</span>'
        + '      <span style="padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;' + statusBg + '">' + stLabel + '</span>'
        + '    </div>'
        + '    <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#9ca3af">'
        + '      <span>' + escapeHtml(card.card_number || '') + '</span>'
        + '      <span>·</span>'
        + '      <span>' + escapeHtml(card.order_number || '') + '</span>'
        + '      <span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;' + (urg.diff <= 0 ? 'background:#ef4444;color:#fff' : urg.diff <= 1 ? 'background:#f97316;color:#fff' : urg.diff <= 3 ? 'background:#eab308;color:#fff' : 'background:#22c55e;color:#fff') + '">' + urg.level + '</span>'
        + '      ' + timeHtml
        + '    </div>'
        + '  </div>'
        + '  <button onclick="closeCardModal()" style="background:none;border:none;font-size:20px;color:#9ca3af;cursor:pointer;padding:4px;flex-shrink:0">&times;</button>'
        + '</div>'
        // 본문 (스크롤)
        + '<div class="card-panel-body">'
        // 같은 주문 다른 카드 알림 배너
        + siblingBannerHtml
        // 진행률 바
        + (hasProgress
            ? '<div style="margin-bottom:14px">'
            + '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
            + '    <span style="font-size:12px;font-weight:600;color:#6b7280">출력 진행</span>'
            + '    <span style="font-size:12px;font-weight:700;color:' + (pct === 100 ? '#16a34a' : '#2563eb') + '">' + pct + '% (' + doneItems + '/' + totalItems + ')</span>'
            + '  </div>'
            + '  <div style="height:6px;background:#e5e7eb;border-radius:4px;overflow:hidden">'
            + '    <div style="height:100%;width:' + pct + '%;background:' + (pct === 100 ? '#16a34a' : '#3b82f6') + ';border-radius:4px;transition:width 0.3s"></div>'
            + '  </div>'
            + '</div>'
            : '')
        // 아이템 리스트
        + itemsHtml
        // 메타 정보
        + '<div style="border-top:1px solid #f1f5f9;margin:14px 0 10px"></div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
        + '  <div style="font-size:12px"><span style="color:#9ca3af">납기일:</span> <span style="color:#111827;font-weight:500">' + (card.delivery_date || '미정') + '</span></div>'
        + '  <div style="font-size:12px"><span style="color:#9ca3af">납품:</span> <span style="color:#111827;font-weight:500">' + (deliveryMethod || '-') + (deliveryTime ? ' ' + deliveryTime : '') + '</span></div>'
        + '  <div style="font-size:12px"><span style="color:#9ca3af">카테고리:</span> <span style="color:#111827;font-weight:500">' + (card.category_name || '-') + '</span></div>'
        + '  <div style="font-size:12px"><span style="color:#9ca3af">접수자:</span> <span style="color:#111827;font-weight:500">' + escapeHtml(card.created_by_name || '-') + '</span></div>'
        + '</div>'
        // 메모/보류
        + (card.order_notes ? '<div style="margin-top:8px;padding:8px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;color:#1e40af"><i class="fas fa-clipboard" style="margin-right:4px"></i><b>주문 메모:</b> ' + escapeHtml(card.order_notes) + '</div>' : '')
        + (card.client_notes && card.client_notes.length > 0 ? '<div style="margin-top:6px;padding:8px 10px;background:#fefce8;border:1px solid #fde68a;border-radius:8px;font-size:12px;color:#854d0e"><i class="fas fa-user-tag" style="margin-right:4px"></i><b>거래처 참고:</b><ul style="margin:4px 0 0 16px;padding:0">' + card.client_notes.map(function(cn) { return '<li>' + escapeHtml(cn.content || '') + '</li>'; }).join('') + '</ul></div>' : '')
        + (card.notes ? '<div style="margin-top:6px;padding:8px 10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;color:#6b7280"><i class="far fa-sticky-note" style="margin-right:4px"></i>' + escapeHtml(card.notes) + '</div>' : '')
        + (card.hold_reason ? '<div style="margin-top:6px;padding:8px 10px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:12px;color:#991b1b"><i class="fas fa-pause-circle" style="margin-right:4px"></i>보류: ' + escapeHtml(card.hold_reason) + '</div>' : '')
        // 불량
        + buildDefectsHtml(defects || [])
        // 이력 타임라인
        + histHtml
        + '</div>'
        // 하단 고정 액션
        + '<div class="card-panel-footer">'
        + '  <div style="display:flex;gap:8px">' + actionBtns + '</div>'
        + '</div>'
        + '</div>';

    document.body.appendChild(modal);
    // 슬라이드 인 애니메이션
    requestAnimationFrame(function() {
        var panel = document.getElementById('cardPanel');
        if (panel) panel.classList.add('card-panel-open');
    });
}

function closeCardModal() {
    var panel = document.getElementById('cardPanel');
    if (panel) {
        panel.classList.remove('card-panel-open');
        setTimeout(function() {
            var modal = document.getElementById('cardModal');
            if (modal) modal.remove();
        }, 250);
    } else {
        var modal = document.getElementById('cardModal');
        if (modal) modal.remove();
    }
}

// ===== 작업지시서 인쇄 =====
async function printWorkOrder(orderId) {
    try {
        var res = await axios.get('/api/orders/' + orderId);
        if (!res.data.success) { showToast('주문 조회 실패', 'error'); return; }
        var order = res.data.data;
        var allItems = order.items || [];

        // Q7: 그룹 품목 처리 — 자식(parent_item_id 있는)만 표시, 부모는 건너뜀
        var childIds = new Set();
        allItems.forEach(function(it) { if (it.parent_item_id) childIds.add(it.parent_item_id); });
        var items = allItems.filter(function(it) { return !childIds.has(it.id); });

        // 카드 썸네일 조회 (주문의 카드들에서 thumbnail_url 가져오기)
        var thumbMap = {};
        try {
            var cardsRes = await axios.get('/api/cards?order_id=' + orderId + '&limit=50');
            if (cardsRes.data.success) {
                var cardsList = cardsRes.data.data?.cards || cardsRes.data.data || [];
                cardsList.forEach(function(c) {
                    if (c.thumbnail_url && c._items) {
                        c._items.forEach(function(ci) { thumbMap[ci.item_name] = c.thumbnail_url; });
                    } else if (c.thumbnail_url) {
                        thumbMap[c.item_name] = c.thumbnail_url;
                    }
                });
            }
        } catch(e) {}

        // QR 코드 생성
        var qrUrl = window.location.origin + '/cards?order_id=' + orderId;
        var qrDataUrl = '';
        if (typeof QRCode !== 'undefined') {
            try { qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 120, margin: 1 }); } catch(e) {}
        }

        // 마감방식 포맷 헬퍼
        function fmtFinishing(fin) {
            if (!fin) return '';
            try {
                var f = typeof fin === 'string' ? JSON.parse(fin) : fin;
                var t = f.top || '', b = f.bottom || '', l = f.left || '', r = f.right || '';
                if (!t && !b && !l && !r) return '';
                if (t && t === b && t === l && t === r) return t + ' 사방';
                var p = [];
                if (t) p.push('상:' + t); if (b) p.push('하:' + b);
                if (l) p.push('좌:' + l); if (r) p.push('우:' + r);
                return p.join(' ');
            } catch(e) { return ''; }
        }

        // 마감 다이어그램 (4변 시각화)
        function finishingDiagram(fin) {
            if (!fin) return '';
            try {
                var f = typeof fin === 'string' ? JSON.parse(fin) : fin;
                var t = f.top || '', b = f.bottom || '', l = f.left || '', r = f.right || '';
                if (!t && !b && !l && !r) return '';
                return '<div style="position:relative;width:100px;height:70px;border:2px solid #92400e;border-radius:4px;margin:4px 0;font-size:9px;color:#92400e">'
                    + '<span style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#fff;padding:0 3px">' + (t || '-') + '</span>'
                    + '<span style="position:absolute;bottom:-12px;left:50%;transform:translateX(-50%);background:#fff;padding:0 3px">' + (b || '-') + '</span>'
                    + '<span style="position:absolute;left:-2px;top:50%;transform:translateY(-50%) rotate(-90deg);background:#fff;padding:0 3px">' + (l || '-') + '</span>'
                    + '<span style="position:absolute;right:-2px;top:50%;transform:translateY(-50%) rotate(90deg);background:#fff;padding:0 3px">' + (r || '-') + '</span>'
                    + '<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:8px;color:#6b7280">디자인</span>'
                    + '</div>';
            } catch(e) { return ''; }
        }

        // 인쇄 창 생성
        var win = window.open('', '_blank', 'width=700,height=900');
        var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>작업지시서 - ' + (order.order_number || '') + '</title>'
            + '<style>'
            + 'body { font-family: "Malgun Gothic", sans-serif; padding: 20px; font-size: 13px; color: #111; }'
            + 'h1 { font-size: 18px; margin: 0 0 12px; border-bottom: 2px solid #111; padding-bottom: 6px; }'
            + '.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }'
            + '.info { font-size: 13px; line-height: 1.8; }'
            + '.info b { display: inline-block; width: 70px; }'
            + '.notes { background: #f0f7ff; border: 1px solid #bdd7ff; border-radius: 6px; padding: 8px 12px; margin: 10px 0; font-size: 12px; }'
            + '.item-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-top: 12px; page-break-inside: avoid; }'
            + '.item-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }'
            + '.item-thumb { width: 80px; height: 80px; border: 1px solid #e5e7eb; border-radius: 6px; object-fit: contain; background: #f9fafb; }'
            + '.item-info { flex: 1; }'
            + '.item-title { font-size: 14px; font-weight: 700; }'
            + '.item-spec { font-size: 12px; color: #6b7280; margin-top: 2px; }'
            + '.item-detail { display: flex; gap: 16px; align-items: flex-start; margin-top: 8px; }'
            + '.pp-badge { display: inline-block; padding: 1px 8px; font-size: 11px; border-radius: 12px; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; margin-right: 4px; }'
            + '.fin-badge { display: inline-block; padding: 1px 8px; font-size: 11px; border-radius: 12px; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }'
            + '@media print { body { padding: 10px; } @page { size: A5; margin: 8mm; } .item-card { break-inside: avoid; } }'
            + '</style></head><body>';

        html += '<div class="header">';
        html += '<div><h1>작업지시서</h1>';
        html += '<div class="info">';
        html += '<b>주문번호</b> ' + (order.order_number || '-') + '<br>';
        html += '<b>거래처</b> ' + (order.client_name || '-') + '<br>';
        html += '<b>납기</b> ' + (order.delivery_date || '-') + ' (' + (order.delivery_method || '배송') + ')<br>';
        if (order.contact_mobile || order.contact_phone) {
            html += '<b>연락처</b> ' + (order.contact_mobile || order.contact_phone || '') + '<br>';
        }
        html += '</div></div>';
        if (qrDataUrl) html += '<img src="' + qrDataUrl + '" style="width:100px;height:100px">';
        html += '</div>';

        if (order.internal_notes) {
            html += '<div class="notes"><b>특이사항:</b> ' + order.internal_notes + '</div>';
        }

        // 품목별 카드 형태로 표시 (Q8: 시각적 작업지시서)
        items.forEach(function(item, idx) {
            var spec = '';
            if (item.width && item.height) spec = Math.round(item.width) + 'x' + Math.round(item.height) + 'cm';
            var thumb = thumbMap[item.item_name] || '';

            html += '<div class="item-card">';
            html += '<div class="item-header">';
            // 썸네일
            if (thumb) {
                html += '<img src="' + thumb + '" class="item-thumb">';
            } else {
                html += '<div class="item-thumb" style="display:flex;align-items:center;justify-content:center;color:#d1d5db;font-size:24px"><span>&#128444;</span></div>';
            }
            // 기본 정보
            html += '<div class="item-info">';
            html += '<div class="item-title">#' + (idx + 1) + ' ' + (item.item_name || '-') + '</div>';
            html += '<div class="item-spec">' + (spec || '-') + ' / ' + (item.quantity || 1) + (item.unit || 'EA') + '</div>';
            if (item.content) html += '<div class="item-spec" style="color:#2563eb">' + item.content + '</div>';
            html += '</div>';
            html += '</div>';

            // 후가공 + 마감 다이어그램
            html += '<div class="item-detail">';
            // 좌: 후가공 뱃지
            var ppHtml = '';
            if (item.post_processing) {
                try {
                    var ppArr = typeof item.post_processing === 'string' ? JSON.parse(item.post_processing) : item.post_processing;
                    if (Array.isArray(ppArr)) {
                        ppArr.filter(function(pp) { return !isPPHidden(pp.name || pp.code || pp); })
                            .forEach(function(pp) { ppHtml += '<span class="pp-badge">' + (pp.name || pp.code || pp) + '</span>'; });
                    }
                } catch(e) {}
            }
            var finText = fmtFinishing(item.finishing);
            if (finText) ppHtml += '<span class="fin-badge">✂ ' + finText + '</span>';
            if (ppHtml) html += '<div>' + ppHtml + '</div>';

            // 우: 마감 다이어그램
            var diagram = finishingDiagram(item.finishing);
            if (diagram) html += '<div>' + diagram + '</div>';
            html += '</div>'; // end item-detail

            html += '</div>'; // end item-card
        });

        html += '<div style="margin-top:20px;border-top:1px solid #d1d5db;padding-top:10px;font-size:11px;color:#6b7280">';
        html += '출력일: ' + new Date().toLocaleDateString('ko-KR') + ' | 담당: __________ | 확인: __________';
        html += '</div>';

        html += '<script>window.onload = function() { window.print(); }<\/script>';
        html += '</body></html>';
        win.document.write(html);
        win.document.close();
    } catch(e) {
        showToast('작업지시서 생성 실패: ' + (e.message || e), 'error');
    }
}

// ===== 썸네일 줌 =====
function zoomThumb(src) {
    var existing = document.getElementById('zoomModal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'zoomModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[60]';
    modal.style.cursor = 'grab';
    var safeSrc = src.replace(/[<>"']/g, '');
    modal.innerHTML = '<img src="' + safeSrc + '" id="zoomImg" style="max-width:95vw;max-height:90vh;object-fit:contain;transform-origin:center;transition:transform 0.1s">'
        + '<div style="position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:1">'
        + '<button onclick="event.stopPropagation();zoomChange(1)" style="background:rgba(255,255,255,0.9);border:none;border-radius:8px;width:40px;height:40px;font-size:20px;cursor:pointer">+</button>'
        + '<button onclick="event.stopPropagation();zoomChange(-1)" style="background:rgba(255,255,255,0.9);border:none;border-radius:8px;width:40px;height:40px;font-size:20px;cursor:pointer">&#8722;</button>'
        + '<button onclick="event.stopPropagation();zoomReset()" style="background:rgba(255,255,255,0.9);border:none;border-radius:8px;width:40px;height:40px;font-size:14px;cursor:pointer">1:1</button>'
        + '</div>';
    var scale = 1, posX = 0, posY = 0, dragging = false, startX = 0, startY = 0;
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.onwheel = function(e) { e.preventDefault(); zoomChange(e.deltaY < 0 ? 1 : -1); };
    window.zoomChange = function(dir) {
        scale = Math.max(0.5, Math.min(5, scale + dir * 0.3));
        var img = document.getElementById('zoomImg');
        if (img) img.style.transform = 'scale(' + scale + ') translate(' + posX + 'px,' + posY + 'px)';
    };
    window.zoomReset = function() {
        scale = 1; posX = 0; posY = 0;
        var img = document.getElementById('zoomImg');
        if (img) img.style.transform = 'scale(1)';
    };
    modal.onmousedown = function(e) {
        if (e.target.tagName === 'IMG') {
            dragging = true;
            startX = e.clientX - posX;
            startY = e.clientY - posY;
            modal.style.cursor = 'grabbing';
            e.preventDefault();
        }
    };
    modal.onmousemove = function(e) {
        if (dragging) {
            posX = e.clientX - startX;
            posY = e.clientY - startY;
            var img = document.getElementById('zoomImg');
            if (img) img.style.transform = 'scale(' + scale + ') translate(' + posX + 'px,' + posY + 'px)';
        }
    };
    modal.onmouseup = function() { dragging = false; modal.style.cursor = 'grab'; };
    document.body.appendChild(modal);
}

// ===== 모바일 탭 =====
function switchMobileTab(tab) {
    currentMobileTab = tab;
    document.querySelectorAll('.mobile-tab').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });
    renderMobileTab();
}

function renderMobileTab() {
    var container = document.getElementById('mobileContent');
    if (!container) return;
    var cards = [];
    var colType = 'progress';
    if (currentMobileTab === 'progress') { cards = inProgressCards; colType = 'progress'; }
    else if (currentMobileTab === 'done') { cards = printDoneCards; colType = 'done'; }
    // done 탭은 거래처별 그룹핑
    if (colType === 'done') {
        renderPrintDoneGrouped(cards, 'mobileContent');
    } else {
        var filtered = sortCards(cards);
        if (filtered.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-400 py-8 text-sm">없음</div>';
        } else {
            var html = '';
            filtered.forEach(function(card) { html += buildKanbanCard(card, colType); });
            container.innerHTML = html;
        }
    }
    document.querySelectorAll('.mobile-tab').forEach(function(btn) {
        var t = btn.getAttribute('data-tab');
        if (t === 'progress') btn.textContent = '진행중 (' + inProgressCards.length + ')';
        else if (t === 'done') btn.textContent = '출력완료 (' + printDoneCards.length + ')';
    });
}

// ===== 리사이즈: 모바일↔데스크탑 전환 시 탭 카운트 동기화 =====
window.addEventListener('resize', function() {
    if (window.innerWidth < 1024) renderMobileTab();
});

// ===== 불량 접수 =====
var DEFECT_CATEGORIES = [
  { code: 'COLOR', name: '색상불량' },
  { code: 'ALIGNMENT', name: '정렬불량' },
  { code: 'CUT', name: '재단불량' },
  { code: 'MATERIAL', name: '소재불량' },
  { code: 'PRINT', name: '출력불량' },
  { code: 'PP', name: '후가공불량' },
  { code: 'OTHER', name: '기타' }
];

function showDefectForm(cardId) {
  var existing = document.getElementById('defectModal');
  if (existing) existing.remove();

  var optionsHtml = DEFECT_CATEGORIES.map(function(dc) {
    return '<option value="' + dc.code + '">' + dc.name + '</option>';
  }).join('');

  var modal = document.createElement('div');
  modal.id = 'defectModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML = '<div class="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onclick="event.stopPropagation()">'
    + '<h3 class="text-lg font-bold mb-4"><i class="fas fa-exclamation-triangle text-amber-500 mr-2"></i>불량 접수</h3>'
    + '<div class="space-y-3">'
    + '  <div><label class="block text-sm font-medium text-gray-700 mb-1">불량 유형 *</label>'
    + '    <select id="defectCategory" class="w-full px-3 py-2 border rounded-lg">' + optionsHtml + '</select></div>'
    + '  <div><label class="block text-sm font-medium text-gray-700 mb-1">심각도</label>'
    + '    <select id="defectSeverity" class="w-full px-3 py-2 border rounded-lg">'
    + '      <option value="LOW">경미</option><option value="MEDIUM" selected>보통</option><option value="HIGH">심각</option></select></div>'
    + '  <div><label class="block text-sm font-medium text-gray-700 mb-1">상세 설명 *</label>'
    + '    <textarea id="defectDesc" class="w-full px-3 py-2 border rounded-lg" rows="3" placeholder="불량 내용을 입력하세요"></textarea></div>'
    + '  <div class="flex items-center gap-2">'
    + '    <input type="checkbox" id="defectAutoHold" checked class="w-4 h-4">'
    + '    <label for="defectAutoHold" class="text-sm text-gray-600">카드를 보류(HOLD) 상태로 전환</label></div>'
    + '  <div class="flex gap-2 mt-4">'
    + '    <button onclick="submitDefect(' + cardId + ')" class="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium">접수</button>'
    + '    <button onclick="document.getElementById(\'defectModal\').remove()" class="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">취소</button>'
    + '  </div>'
    + '</div></div>';
  document.body.appendChild(modal);
  document.getElementById('defectDesc').focus();
}

async function submitDefect(cardId) {
  var catEl = document.getElementById('defectCategory');
  var sevEl = document.getElementById('defectSeverity');
  var descEl = document.getElementById('defectDesc');
  var holdEl = document.getElementById('defectAutoHold');
  if (!catEl || !sevEl || !descEl || !holdEl) return;
  var category = catEl.value;
  var severity = sevEl.value;
  var desc = descEl.value.trim();
  var autoHold = holdEl.checked;

  if (!desc) { showToast('설명을 입력하세요', 'warning'); return; }

  try {
    var res = await axios.post('/api/cards/' + cardId + '/defects', {
      defect_category: category,
      description: desc,
      severity: severity,
      auto_hold: autoHold
    });
    if (res.data.success) {
      showToast('불량이 접수되었습니다', 'success');
      document.getElementById('defectModal').remove();
      loadKanban();
    } else {
      showToast(res.data.error || '접수 실패', 'error');
    }
  } catch (err) {
    showToast(err.response?.data?.error || '접수 실패', 'error');
  }
}

// ===== 키보드 단축키 =====
document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    switch(e.key) {
        case 'r': case 'R':
            if (!e.ctrlKey && !e.metaKey) { loadKanban(); showToast('새로고침', 'info'); }
            break;
        case 'Escape':
            // 모달 닫기는 layout.ts 글로벌 핸들러가 처리
            // 모달이 없을 때만 선택 해제
            var hasModal = document.querySelectorAll('.fixed.inset-0:not(.hidden)').length > 0;
            if (!hasModal && selectedCardIds.size > 0) clearSelection();
            break;
        case 'a':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                inProgressCards.forEach(function(c) { selectedCardIds.add(c.id); });
                updateBulkBar();
            }
            break;
        case '?':
            var helpModal = document.createElement('div');
            helpModal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
            helpModal.onclick = function(ev) { if (ev.target === helpModal) helpModal.remove(); };
            helpModal.innerHTML = '<div class="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">'
                + '<h3 class="text-lg font-bold mb-4"><i class="fas fa-keyboard mr-2"></i>키보드 단축키</h3>'
                + '<div class="space-y-2 text-sm">'
                + '<div class="flex justify-between"><span class="text-gray-600">새로고침</span><kbd class="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">R</kbd></div>'
                + '<div class="flex justify-between"><span class="text-gray-600">전체 선택</span><kbd class="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">Ctrl+A</kbd></div>'
                + '<div class="flex justify-between"><span class="text-gray-600">모달/선택 해제</span><kbd class="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">Esc</kbd></div>'
                + '<div class="flex justify-between"><span class="text-gray-600">이 도움말</span><kbd class="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">?</kbd></div>'
                + '</div>'
                + '<div class="mt-4 flex justify-end"><button onclick="this.closest(\'.fixed\').remove()" class="px-4 py-2 bg-gray-600 text-white rounded text-sm">닫기</button></div>'
                + '</div>';
            document.body.appendChild(helpModal);
            break;
    }
});

// ===== 카드 일괄 선택 (인라인 bulk bar용) =====
function toggleCardSelect(el) {
    var cardId = parseInt(el.dataset.cardId);
    if (el.checked) selectedCardIds.add(cardId);
    else selectedCardIds.delete(cardId);
    updateBulkBar();
    updateCardBulkBar();
}

function updateCardBulkBar() {
    var bar = document.getElementById('cardBulkBar');
    var spacer = document.getElementById('cardBulkSpacer');
    var countEl = document.getElementById('cardBulkCount');
    if (!bar) return;
    if (selectedCardIds.size > 0) {
        bar.classList.add('visible');
        if (spacer) spacer.classList.add('visible');
        if (countEl) countEl.textContent = selectedCardIds.size;
    } else {
        bar.classList.remove('visible');
        if (spacer) spacer.classList.remove('visible');
    }
}

function clearCardSelection() {
    selectedCardIds.clear();
    document.querySelectorAll('.card-checkbox').forEach(function(cb) { cb.checked = false; });
    updateBulkBar();
    updateCardBulkBar();
}

async function cardBulkChangeStatus() {
    var bulkEl = document.getElementById('cardBulkStatus');
    if (!bulkEl) return;
    var newStatus = bulkEl.value;
    if (!newStatus) { showFieldError('cardBulkStatus', '변경할 상태를 선택하세요.'); return; }
    if (selectedCardIds.size === 0) return;
    if (newStatus === 'HOLD') {
        openHoldModal(Array.from(selectedCardIds), true);
        return;
    }
    if (!(await showConfirm(selectedCardIds.size + '건의 카드를 ' + (statusLabels[newStatus] || newStatus) + '(으)로 변경하시겠습니까?'))) return;
    try {
        await axios.patch('/api/cards/bulk/status', {
            card_ids: Array.from(selectedCardIds),
            status: newStatus,
            reason: '일괄 변경'
        });
        showToast(selectedCardIds.size + '건 ' + (statusLabels[newStatus] || newStatus) + ' 처리됨', 'success');
        selectedCardIds.clear();
        updateBulkBar();
        updateCardBulkBar();
        loadKanban();
    } catch (e) {
        showToast('일괄 변경 실패', 'error');
    }
}

// ===== 초기화 =====
(function initKanban() {
    var statusEl = document.getElementById('kanbanStatus');

    if (typeof axios === 'undefined') {
        if (statusEl) {
            statusEl.className = 'mb-2 p-2 rounded-lg text-sm text-center bg-red-50 text-red-700';
            statusEl.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> axios 라이브러리 미로드. 페이지를 새로고침하세요.';
        }
        return;
    }

    var requiredIds = ['listInProgress', 'listPrintDone'];
    var missing = [];
    for (var j = 0; j < requiredIds.length; j++) {
        if (!document.getElementById(requiredIds[j])) missing.push(requiredIds[j]);
    }
    if (missing.length > 0) {
        if (statusEl) {
            statusEl.className = 'mb-2 p-2 rounded-lg text-sm text-center bg-red-50 text-red-700';
            statusEl.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> DOM 요소 누락: ' + missing.join(', ') + '. 페이지를 새로고침하세요.';
        }
        return;
    }

    restoreKanbanFilters();
    loadKanban();
    setInterval(function() { loadKanban(); }, 30000);
    setInterval(function() { renderTodayShip(); }, 60000);
})();

// ===== 드래그앤드롭 =====
var _dragCardId = null;
var _dragFromColumn = null;

var _dndZonesInitialized = false;
function initDragAndDrop() {
    // 드롭 존 이벤트는 최초 1회만 등록 (innerHTML 교체와 무관한 컨테이너)
    if (!_dndZonesInitialized) {
        _dndZonesInitialized = true;
        var dropZones = [
            { el: document.getElementById('listInProgress'), target: 'PRINTING' },
            { el: document.getElementById('listPrintDone'), target: 'PRINT_DONE' },
            { el: document.getElementById('holdSection'), target: 'HOLD' }
        ];

        dropZones.forEach(function(zone) {
            if (!zone.el) return;
            zone.el.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                zone.el.classList.add('dnd-over');
            });
            zone.el.addEventListener('dragleave', function(e) {
                if (zone.el.contains(e.relatedTarget)) return;
                zone.el.classList.remove('dnd-over');
            });
            zone.el.addEventListener('drop', function(e) {
                e.preventDefault();
                zone.el.classList.remove('dnd-over');
                var cardId = parseInt(e.dataTransfer.getData('text/plain'));
                if (!cardId || isNaN(cardId)) return;
                handleDrop(cardId, zone.target);
            });
        });
    }

    // 각 카드에 dragstart 이벤트
    document.querySelectorAll('.kanban-card[draggable="true"]').forEach(function(card) {
        card.addEventListener('dragstart', function(e) {
            _dragCardId = parseInt(card.getAttribute('data-card-id'));
            _dragFromColumn = card.getAttribute('data-card-status');
            e.dataTransfer.setData('text/plain', String(_dragCardId));
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(function() { card.classList.add('dnd-dragging'); }, 0);
            // 드래그 시작 시 보류 섹션 표시 (드롭 타겟으로)
            var holdSec = document.getElementById('holdSection');
            if (holdSec) holdSec.style.display = '';
        });
        card.addEventListener('dragend', function() {
            card.classList.remove('dnd-dragging');
            document.querySelectorAll('.dnd-over').forEach(function(el) { el.classList.remove('dnd-over'); });
            _dragCardId = null;
            _dragFromColumn = null;
            // 보류 카드 없으면 보류 섹션 다시 숨기기
            if (holdCards.length === 0) {
                var holdSec = document.getElementById('holdSection');
                if (holdSec) holdSec.style.display = 'none';
            }
        });
    });
}

function handleDrop(cardId, targetStatus) {
    // 같은 상태로 드롭하면 무시
    if (_dragFromColumn === targetStatus) return;
    // HOLD는 보류 모달 필요
    if (targetStatus === 'HOLD') {
        quickHold(cardId);
        return;
    }
    // PRINT_DONE은 item 전체 체크 + 카드 상태 전환을 원자 처리
    if (targetStatus === 'PRINT_DONE') {
        completeCard(cardId);
        return;
    }
    quickStatus(cardId, targetStatus);
}
