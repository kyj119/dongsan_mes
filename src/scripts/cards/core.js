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

// ===== Status Labels — 단일 소스 (window.MES_STATUS, layout 주입). SHIPPED/폐기값 포함 =====
var statusLabels = window.MES_STATUS.cardLabels;

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
    var colNames = ['출력대기', '출력중', '출력완료', '보류'];
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

