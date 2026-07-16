// items/tabs.js — 분류 기반 탭 (item_categories 동적) — 신모델
// (구) 출력/원자재 그룹뷰·인쇄방식·소재 설정 탭 = 신모델 전환으로 전량 제거 (2026-06-21)

var ITEM_CATS = [];
var currentCatCode = '';
var currentMainTab = ''; // (구) 하위호환

window.initItemTabs = async function() {
    var bar = document.getElementById('itemMainTabs');
    if (!bar) { console.warn('[items] #itemMainTabs not found'); return; }
    try {
        var res = await axios.get('/api/items/categories');
        ITEM_CATS = (res.data && res.data.data) ? res.data.data.filter(function(c){ return c.is_active !== 0; }) : [];
    } catch (e) { ITEM_CATS = []; }
    var tabs = ITEM_CATS.filter(function(c){ return c.category_code !== 'ETC'; }); // 기타=fallback, 탭 숨김
    var html = tabs.map(function(c){
        return '<button class="itm-tab px-4 py-2 font-medium text-sm text-gray-500 hover:text-gray-700 border-b-2 border-transparent whitespace-nowrap" data-code="' + c.category_code + '" onclick="switchCatTab(\'' + c.category_code + '\')">' + escapeHtml(c.category_name) + '</button>';
    }).join('');
    bar.innerHTML = html;
    if (tabs.length) switchCatTab(tabs[0].category_code);
};

window.switchCatTab = function(code) {
    currentCatCode = code; currentMainTab = code;
    tabSortState = { column: '', asc: true };
    document.querySelectorAll('#itemMainTabs .itm-tab').forEach(function(b) {
        var on = b.getAttribute('data-code') === code;
        b.classList.toggle('border-blue-600', on);
        b.classList.toggle('text-blue-600', on);
        b.classList.toggle('text-gray-500', !on);
        b.classList.toggle('border-transparent', !on);
    });
    var content = document.getElementById('itemCatContent');
    if (!content) return;
    content.classList.remove('hidden');
    var cat = ITEM_CATS.find(function(c){ return c.category_code === code; }) || { category_name: code };
    content.innerHTML = '<div class="ds-card">'
        + '<div class="flex items-center justify-between mb-3">'
        + '<div class="flex items-center gap-3"><h3 class="text-lg font-bold">' + escapeHtml(cat.category_name) + '</h3>'
        + '<span id="catCount" class="text-sm text-gray-500"></span></div>'
        + '<div class="flex gap-2">'
        + '<input type="text" id="catSearch" placeholder="품목명/코드 검색..." class="w-48 px-3 py-1.5 border rounded text-sm" oninput="catSearchDebounced()">'
        + '<label class="flex items-center text-xs text-gray-500 whitespace-nowrap px-1" title="비활성(삭제·단종) 품목까지 표시"><input type="checkbox" id="catInactive" onchange="loadCatTable(currentCatCode)" class="mr-1">비활성 포함</label>'
        + '<button onclick="showCreateModalForCategory(\'' + code + '\')" class="ds-btn ds-btn-primary ds-btn-sm"><i class="fas fa-plus mr-1"></i>추가</button>'
        + '</div></div><div id="catItemsList"><p class="text-gray-400 text-sm py-6 text-center">로딩 중...</p></div></div>';
    loadCatTable(code);
};

var _catSearchTimer = null;
window.catSearchDebounced = function() {
    if (_catSearchTimer) clearTimeout(_catSearchTimer);
    _catSearchTimer = setTimeout(function() { loadCatTable(currentCatCode); }, 300);
};
window.sortCat = function(col) {
    if (tabSortState.column === col) tabSortState.asc = !tabSortState.asc;
    else { tabSortState.column = col; tabSortState.asc = true; }
    loadCatTable(currentCatCode);
};
window.refreshItemTab = function() {
    if (currentCatCode) loadCatTable(currentCatCode);
    if (typeof loadItems === 'function') loadItems(); // 캐시 갱신
};

// 품목 작업 버튼 — 활성: 비활성화/삭제, 비활성: 복구/삭제
function itemActionBtns(it, en) {
    var b = '<button onclick="editItem(' + it.id + ')" class="text-blue-600 hover:underline text-xs mr-2">수정</button>';
    if (it.is_active !== 0) {
        b += '<button onclick="deactivateItem(' + it.id + ', \'' + en + '\')" class="text-amber-600 hover:underline text-xs mr-2">비활성화</button>';
    } else {
        b += '<button onclick="activateItem(' + it.id + ', \'' + en + '\')" class="text-green-600 hover:underline text-xs mr-2">복구</button>';
    }
    b += '<button onclick="hardDeleteItem(' + it.id + ', \'' + en + '\')" class="text-red-500 hover:underline text-xs">삭제</button>';
    return b;
}

function loadCatTable(code) {
    var listEl = document.getElementById('catItemsList');
    if (!listEl) return;
    var isMat = (code === 'MATERIAL');
    var searchEl = document.getElementById('catSearch');
    var search = searchEl ? searchEl.value.trim() : '';
    var inactiveEl = document.getElementById('catInactive');
    var incInactive = inactiveEl && inactiveEl.checked ? '&include_inactive=1' : '';
    var url = '/api/items?category=' + encodeURIComponent(code) + '&limit=500' + (search ? '&search=' + encodeURIComponent(search) : '') + incInactive;
    axios.get(url).then(function(res) {
        var items = res.data.data || [];
        if (tabSortState.column) {
            items.sort(function(a, b) {
                var va = a[tabSortState.column]; if (va == null) va = '';
                var vb = b[tabSortState.column]; if (vb == null) vb = '';
                if (typeof va === 'number' && typeof vb === 'number') return tabSortState.asc ? va - vb : vb - va;
                return tabSortState.asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
            });
        }
        // 카운트 = 서버 총계(pagination.total) — 응답 행수는 limit에 잘릴 수 있음 ("200건" 오표시 원인)
        var catTotal = (res.data.pagination && res.data.pagination.total != null) ? res.data.pagination.total : items.length;
        var cntEl = document.getElementById('catCount');
        if (cntEl) cntEl.textContent = catTotal + '건' + (catTotal > items.length ? ' (표시 ' + items.length + ')' : '');
        if (!items.length) { listEl.innerHTML = '<p class="text-gray-400 text-sm py-8 text-center">등록된 품목이 없습니다.</p>'; return; }
        // item_group 보유 품목이 과반이면 묶음 표시 (원자재·태극기 등). 그 외(개별 제품)는 평면.
        var grouped = items.filter(function(i){ return i.item_group && String(i.item_group).trim(); });
        if (grouped.length >= items.length / 2) { listEl.innerHTML = buildGroupedHtml(items, !!search); return; }
        var html = '<div class="overflow-x-auto"><table class="w-full text-sm ds-table ds-table-striped"><thead><tr class="text-left text-gray-500 text-xs">'
            + '<th class="col-code p-2 cursor-pointer select-none" onclick="sortCat(\'item_code\')">코드' + sortIcon('item_code') + '</th>'
            + '<th class="col-name p-2 cursor-pointer select-none" onclick="sortCat(\'item_name\')">품목명' + sortIcon('item_name') + '</th>'
            + (isMat ? '<th class="col-qty p-2 text-right cursor-pointer select-none" onclick="sortCat(\'width_mm\')">폭(mm)' + sortIcon('width_mm') + '</th>' : '')
            + '<th class="col-tag p-2 cursor-pointer select-none" onclick="sortCat(\'item_type\')">타입' + sortIcon('item_type') + '</th>'
            + '<th class="col-amount p-2 text-right cursor-pointer select-none" onclick="sortCat(\'base_price\')">단가' + sortIcon('base_price') + '</th>'
            + '<th class="col-status p-2">상태</th><th class="col-action p-2">작업</th></tr></thead><tbody>';
        items.forEach(function(it) {
            var en = (it.item_name || '').replace(/['"]/g, '');
            html += '<tr class="border-t hover:bg-gray-50">'
                + '<td class="p-2 font-mono text-blue-600 text-xs">' + escapeHtml(it.item_code || '') + '</td>'
                + '<td class="p-2 font-medium" title="' + escapeHtml(it.item_name || '') + '">' + escapeHtml(it.item_name || '') + '</td>'
                + (isMat ? '<td class="p-2 text-right tabular-nums text-gray-500 text-xs">' + (it.width_mm || '') + '</td>' : '')
                + '<td class="p-2">' + getTypeBadge(it) + '</td>'
                + '<td class="p-2 text-right tabular-nums">' + (it.base_price || 0).toLocaleString() + '</td>'
                + '<td class="p-2">' + (it.is_active !== 0 ? '<span class="text-green-600 text-xs">활성</span>' : '<span class="text-gray-400 text-xs">비활성</span>') + '</td>'
                + '<td class="p-2 whitespace-nowrap">' + itemActionBtns(it, en) + '</td></tr>';
        });
        html += '</tbody></table></div>';
        listEl.innerHTML = html;
    }).catch(function() { listEl.innerHTML = '<p class="text-red-500 text-sm py-4 text-center">데이터 로드 실패</p>'; });
}

// item_group 묶음 표시 (원자재=폭별, 태극기=호수별 등). 규격 컬럼=specification(폭/호수 공용). 접기/펼치기.
function buildGroupedHtml(items, expand) {
    var groups = {}, order = [];
    items.forEach(function(it) {
        var g = (it.item_group && String(it.item_group).trim()) || '(기타)';
        if (!groups[g]) { groups[g] = []; order.push(g); }
        groups[g].push(it);
    });
    order.sort(function(a, b) { return a.localeCompare(b); });
    function sortKey(it) {
        if (it.width_mm) return it.width_mm; // 원자재=폭 오름차순
        var s = String(it.specification || '');
        var main = s.match(/(\d+)/);          // 선두 숫자=호수 (4호-1·4-1호 형식 무관)
        if (!main) return 99999;
        var sub = s.match(/-\s*(\d+)/);        // -N 세부(7호-1)
        return parseInt(main[1], 10) * 100 + (sub ? parseInt(sub[1], 10) * 10 : 0) + (/게양용/.test(s) ? 1 : 0);
    }
    var html = '<div class="space-y-2">';
    order.forEach(function(g) {
        var gi = groups[g];
        gi.sort(function(a, b) { return sortKey(a) - sortKey(b); });
        var ws = gi.map(function(x) { return x.width_mm; }).filter(Boolean);
        var sub = ws.length ? (gi.length + '개 · ' + (Math.min.apply(null, ws) / 10) + '~' + (Math.max.apply(null, ws) / 10) + 'cm') : (gi.length + '개');
        var chevron = expand ? 'fa-chevron-down' : 'fa-chevron-right';
        var bodyHidden = expand ? '' : ' hidden';
        var rows = '';
        gi.forEach(function(it) {
            var en = (it.item_name || '').replace(/['"]/g, '');
            var spec = it.specification || (it.width_mm ? (it.width_mm / 10) + 'cm' : '-');
            var specHint = (spec && spec !== '-') ? ' <span class="text-gray-400 text-xs">(' + escapeHtml(spec) + ')</span>' : '';
            rows += '<tr class="border-t hover:bg-gray-50">'
                + '<td class="p-2 font-mono text-blue-600 text-xs">' + escapeHtml(it.item_code || '') + '</td>'
                + '<td class="p-2" title="' + escapeHtml((it.item_name || '') + ' · ' + spec) + '">' + escapeHtml(it.item_name || '') + specHint + '</td>'
                + '<td class="p-2">' + getTypeBadge(it) + '</td>'
                + '<td class="p-2 text-right tabular-nums">' + (it.base_price || 0).toLocaleString() + '</td>'
                + '<td class="p-2">' + (it.is_active !== 0 ? '<span class="text-green-600 text-xs">활성</span>' : '<span class="text-gray-400 text-xs">비활성</span>') + '</td>'
                + '<td class="p-2 whitespace-nowrap">' + itemActionBtns(it, en) + '</td></tr>';
        });
        html += '<div class="border rounded-lg overflow-hidden">'
            + '<div class="px-3 py-2 bg-gray-50 flex items-center justify-between cursor-pointer hover:bg-gray-100 select-none" onclick="toggleMatGroup(this)">'
            + '<div class="font-medium text-sm"><i class="fas ' + chevron + ' text-gray-400 mr-2 text-xs"></i>' + escapeHtml(g) + '</div>'
            + '<span class="text-xs text-gray-400">' + sub + '</span></div>'
            + '<div class="mat-grp-body' + bodyHidden + '"><table class="w-full text-sm ds-table ds-table-striped"><thead><tr class="text-left text-gray-500 text-xs">'
            + '<th class="col-code p-2">코드</th><th class="col-name p-2">품목명</th><th class="col-tag p-2">타입</th><th class="col-amount p-2 text-right">단가</th><th class="col-status p-2">상태</th><th class="col-action p-2">작업</th>'
            + '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    });
    html += '</div>';
    return html;
}
window.toggleMatGroup = function(el) {
    var body = el.nextElementSibling;
    if (!body) return;
    body.classList.toggle('hidden');
    var ic = el.querySelector('i');
    if (ic) { ic.classList.toggle('fa-chevron-right'); ic.classList.toggle('fa-chevron-down'); }
};

window.showCreateModalForCategory = async function(code) {
    await showCreateModal(); // 내부 selectItemType('PRODUCT') 완료까지 대기 → 이후 프리셋이 안 덮임
    if (code === 'MATERIAL') { selectItemType('MATERIAL'); if (typeof loadParentMediaOptions === 'function') loadParentMediaOptions(); }
    else if (code === 'GOODS') { selectItemType('GOODS'); }
    else {
        selectItemType('PRODUCT');
        var cat = ITEM_CATS.find(function(c){ return c.category_code === code; });
        if (cat && typeof setCategoryForTab === 'function') setCategoryForTab(cat.category_name);
    }
};

// (구) 7탭 진입점 — 하위호환 no-op (호출부 없음)
window.switchMainTab = function() {};

// 추가 모달에서 해당 분류를 기본 선택
function setCategoryForTab(defaultCat) {
    var catEl = document.getElementById('itemCategory');
    if (!catEl) return;
    for (var i = 0; i < catEl.options.length; i++) {
        if (catEl.options[i].value === defaultCat) {
            catEl.value = defaultCat;
            return;
        }
    }
}
