// items/tabs.js — 메인 탭 전환, 출력/원자재 그룹 뷰, 인쇄방식 (Phase 3.1.B 분할)

// 메인 탭 전환 (7탭)
var mainTabNames = ['output', 'transfer', 'flag', 'sign', 'goods', 'rawMaterial', 'settings'];
var currentMainTab = 'output';

window.switchMainTab = function(tab) {
    currentMainTab = tab;
    // 모든 탭 콘텐츠 숨김
    mainTabNames.forEach(function(t) {
        var elId = 'tab' + t.charAt(0).toUpperCase() + t.slice(1);
        var el = document.getElementById(elId);
        if (el) el.classList.add('hidden');
        var btnId = 'tabBtn' + t.charAt(0).toUpperCase() + t.slice(1);
        var btn = document.getElementById(btnId);
        if (btn) {
            btn.classList.remove('border-blue-600', 'text-blue-600');
            btn.classList.add('text-gray-500', 'border-transparent');
        }
    });
    // 기존 tabItems도 숨김
    var oldTab = document.getElementById('tabItems');
    if (oldTab) oldTab.classList.add('hidden');

    // 선택 탭 표시
    var activeElId = 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1);
    var activeEl = document.getElementById(activeElId);
    if (activeEl) activeEl.classList.remove('hidden');
    var activeBtnId = 'tabBtn' + tab.charAt(0).toUpperCase() + tab.slice(1);
    var activeBtn = document.getElementById(activeBtnId);
    if (activeBtn) {
        activeBtn.classList.add('border-blue-600', 'text-blue-600');
        activeBtn.classList.remove('text-gray-500', 'border-transparent');
    }

    // 탭별 데이터 로드
    if (tab === 'output') loadOutputItems('');
    else if (tab === 'settings') { loadPrintMethods(); loadPrintMedia(); }
    else loadTabItems(tab);
};

// ── 출력 탭 ──────────────────────────────────────────────

var currentOutputFilter = '';

window.filterOutputItems = function(prefix) {
    currentOutputFilter = prefix;
    // 필터 버튼 스타일
    document.querySelectorAll('.output-filter-btn').forEach(function(btn) {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('bg-gray-200', 'text-gray-700');
    });
    if (event && event.target) {
        event.target.classList.add('bg-blue-600', 'text-white');
        event.target.classList.remove('bg-gray-200', 'text-gray-700');
    }
    loadOutputItems(prefix);
};

function loadOutputItems(prefix) {
    var url = '/api/print-system/items-for-order';
    if (prefix) url += '?method_code=' + prefix;
    axios.get(url).then(function(res) {
        var items = res.data.data || [];

        // 검색 필터
        var search = (document.getElementById('outputSearch') ? document.getElementById('outputSearch').value : '').toLowerCase().trim();
        if (search) {
            items = items.filter(function(it) {
                var name = (it.item_name || '').toLowerCase();
                var code = (it.item_code || '').toLowerCase();
                // 숫자만 입력하면 PM- 접두사 매칭도
                if (/^\d+$/.test(search)) {
                    return code.includes(search) || code.includes('pm-' + search);
                }
                return name.includes(search) || code.includes(search);
            });
        }

        // 정렬
        if (tabSortState.column) {
            items.sort(function(a, b) {
                var va = a[tabSortState.column]; if (va == null) va = '';
                var vb = b[tabSortState.column]; if (vb == null) vb = '';
                if (typeof va === 'number' && typeof vb === 'number') return tabSortState.asc ? va - vb : vb - va;
                return tabSortState.asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
            });
        }

        document.getElementById('outputItemCount').textContent = items.length + '건';
        if (!items.length) {
            document.getElementById('outputItemsList').innerHTML = '<p class="text-gray-400 text-sm py-8 text-center">등록된 출력 품목이 없습니다.<br><span class="text-xs">설정 탭에서 소재를 등록하고 출력방식에 연결하면 자동 생성됩니다.</span></p>';
            return;
        }
        var html = '<table class="w-full text-sm ds-table-striped"><thead><tr class="text-left text-gray-500 text-xs">'
            + '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(\'output\', \'item_code\')">코드' + sortIcon('item_code') + '</th>'
            + '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(\'output\', \'item_name\')">품목명' + sortIcon('item_name') + '</th>'
            + '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(\'output\', \'category\')">출력방식' + sortIcon('category') + '</th>'
            + '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(\'output\', \'sub_category\')">소재' + sortIcon('sub_category') + '</th>'
            + '<th class="p-2 text-right cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(\'output\', \'base_price\')">단가/㎡' + sortIcon('base_price') + '</th>'
            + '<th class="p-2">상태</th></tr></thead><tbody>';
        items.forEach(function(it) {
            html += '<tr class="border-t hover:bg-gray-50">'
                + '<td class="p-2 font-mono text-blue-600 text-xs">' + escapeHtml(it.item_code || '') + '</td>'
                + '<td class="p-2 font-medium">' + escapeHtml(it.item_name || '') + '</td>'
                + '<td class="p-2 text-gray-500">' + escapeHtml(it.category || '') + '</td>'
                + '<td class="p-2 text-gray-500">' + escapeHtml(it.sub_category || it.media_name || '') + '</td>'
                + '<td class="p-2 text-right tabular-nums">' + (it.base_price || 0).toLocaleString() + '</td>'
                + '<td class="p-2">' + (it.is_active !== 0 ? '<span class="text-green-600 text-xs">활성</span>' : '<span class="text-gray-400 text-xs">비활성</span>') + '</td>'
                + '</tr>';
        });
        html += '</tbody></table>';
        document.getElementById('outputItemsList').innerHTML = html;
    }).catch(function() {
        document.getElementById('outputItemsList').innerHTML = '<p class="text-red-500 text-sm py-4 text-center">데이터 로드 실패</p>';
    });
}

// ── 범용 탭 로드 (전사·태극기, 간판, 상품·소재, 원자재) ──

var TAB_FILTERS = {
    transfer: {
        label: '전사',
        match: function(it) {
            var cat = (it.category || it.category_direct || '').toLowerCase();
            return ['전사', '깃발', '윈드배너', '가로등배너'].some(function(k) { return cat.indexOf(k) >= 0; });
        }
    },
    flag: {
        label: '태극기',
        match: function(it) {
            var cat = (it.category || it.category_direct || '').toLowerCase();
            return ['태극기', '새마을기', '민방위기'].some(function(k) { return cat.indexOf(k) >= 0; });
        }
    },
    sign: {
        label: '간판',
        match: function(it) {
            var cat = (it.category || it.category_direct || '').toLowerCase();
            return cat.indexOf('간판') >= 0;
        }
    },
    goods: {
        label: '상품',
        match: function(it) {
            var type = (it.item_type || '').toUpperCase();
            return type === 'GOODS' || (type !== 'MATERIAL' && !it.print_method_id && !['전사','깃발','윈드배너','가로등배너','민방위기','태극기','새마을기','간판'].some(function(k) { return (it.category || '').toLowerCase().indexOf(k) >= 0; }));
        }
    },
    rawMaterial: {
        label: '원자재',
        match: function(it) {
            return (it.item_type || '').toUpperCase() === 'MATERIAL' || (it.item_code || '').startsWith('RM-');
        }
    }
};

// ── 원자재 그룹 카드 뷰 ──────────────────────────────────────

function loadRawMaterialGroupView() {
    var search = (document.getElementById('rmSearch') || {}).value || '';
    var rmSubCat = (document.getElementById('rmSubCatFilter') || {}).value || '';
    var rmMediaFilter = (document.getElementById('rmMediaFilter') || {}).value || '';

    // 아이템 목록 + 연결된 그룹 목록 병렬 조회
    var itemsUrl = '/api/items?limit=500' + (search ? '&search=' + encodeURIComponent(search) : '');
    Promise.all([
        axios.get(itemsUrl),
        rmMediaFilter ? axios.get('/api/items/groups').then(function(r) {
            // media_material_groups에 등록된 item_group 목록 (간접 조회)
            return axios.get('/api/print-system/rm-connections/___all___').catch(function() { return { data: { data: [] } }; });
        }).catch(function() { return { data: { data: [] } }; }) : Promise.resolve(null)
    ]).then(function(results) {
        var res = results[0];
        // 연결된 item_group 수집 (media_material_groups 기반)
        var linkedGroups = new Set();
        if (results[1] && results[1].data && results[1].data.data) {
            results[1].data.data.forEach(function(g) {
                if (g.connectedCount > 0) linkedGroups.add(g.name);
            });
        }

        var allRMs = (res.data.data || []).filter(function(it) {
            if (rmSubCat) return (it.item_code || '').startsWith(rmSubCat);
            return (it.item_type || '').toUpperCase() === 'MATERIAL' || (it.item_code || '').startsWith('RM-');
        });

        // 연결 판단: parent_media_id 또는 item_group이 media_material_groups에 있는 경우
        if (rmMediaFilter === 'linked') allRMs = allRMs.filter(function(it) { return it.parent_media_id || linkedGroups.has(it.item_group); });
        else if (rmMediaFilter === 'unlinked') allRMs = allRMs.filter(function(it) { return !it.parent_media_id && !linkedGroups.has(it.item_group); });

        // item_group 기준 그룹핑
        var groups = {};
        var ungrouped = [];
        allRMs.forEach(function(it) {
            if (it.item_group) {
                if (!groups[it.item_group]) groups[it.item_group] = [];
                groups[it.item_group].push(it);
            } else {
                ungrouped.push(it);
            }
        });

        var html = '';

        // 그룹 카드
        Object.keys(groups).sort().forEach(function(groupName) {
            var items = groups[groupName];
            items.sort(function(a, b) { return (a.width_mm || 0) - (b.width_mm || 0); });

            var subCats = {};
            var widths = [];
            items.forEach(function(it) {
                var sc = it.sub_category || '기타';
                subCats[sc] = (subCats[sc] || 0) + 1;
                if (it.width_mm) widths.push(it.width_mm);
            });
            var subCatStr = Object.keys(subCats).join(', ');
            var widthRange = widths.length > 0
                ? Math.min.apply(null, widths) + '~' + Math.max.apply(null, widths) + 'mm'
                : '';

            // 연결 소재 표시 (parent_media_id 기준)
            var linkedMedia = {};
            items.forEach(function(it) {
                if (it.parent_media_name) linkedMedia[it.parent_media_name] = true;
            });
            var mediaStr = Object.keys(linkedMedia).join(', ') || '';

            var escapedGroup = escapeHtml(groupName).replace(/'/g, "\\'");
            html += '<div class="border rounded-lg hover:border-blue-300 hover:shadow-sm transition mb-2">'
                + '<div class="p-3 cursor-pointer flex items-center justify-between" onclick="toggleRMGroup(this, event)">'
                + '<div>'
                + '<span class="font-semibold text-sm">' + escapeHtml(groupName) + '</span>'
                + '<span class="ml-2 text-xs text-gray-400">' + items.length + '개</span>'
                + (widthRange ? '<span class="ml-2 text-xs text-blue-500">' + widthRange + '</span>' : '')
                + '</div>'
                + '<div class="flex items-center gap-3 text-xs text-gray-500">'
                + '<span class="px-2 py-0.5 rounded-full bg-green-50 text-green-700">' + subCatStr + '</span>'
                + (mediaStr ? '<span class="text-gray-300">|</span><span>소재: ' + escapeHtml(mediaStr) + '</span>' : '')
                + '<button onclick="event.stopPropagation(); openRMBulkEditByGroup(\'' + escapedGroup + '\')" class="px-2 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100" title="일괄 수정"><i class="fas fa-edit mr-0.5"></i>일괄 수정</button>'
                + '<i class="fas fa-chevron-down text-gray-300 ml-1 rm-group-chevron transition-transform"></i>'
                + '</div></div>'
                + '<div class="rm-group-content hidden border-t">'
                + buildRMGroupTable(items, groupName)
                + '</div></div>';
        });

        // 미분류
        if (ungrouped.length > 0) {
            html += '<div class="border rounded-lg mt-3">'
                + '<div class="p-3 font-medium text-sm text-gray-500">미분류 (' + ungrouped.length + '개)</div>'
                + '<div class="border-t">' + buildRMGroupTable(ungrouped, '') + '</div>'
                + '</div>';
        }

        if (!html) html = '<p class="text-gray-400 text-sm py-8 text-center">등록된 원자재가 없습니다.</p>';
        document.getElementById('rmItemsList').innerHTML = html;
    }).catch(function() {
        document.getElementById('rmItemsList').innerHTML = '<p class="text-red-500 text-sm py-4 text-center">데이터 로드 실패</p>';
    });
}

function buildRMGroupTable(items, groupName) {
    var html = '<table class="w-full text-sm"><thead><tr class="text-left text-gray-500 text-xs">'
        + '<th class="p-2">코드</th><th class="p-2">품목명</th><th class="p-2">규격</th>'
        + '<th class="p-2">분류</th><th class="p-2 text-right">단가</th><th class="p-2">단위</th>'
        + '<th class="p-2">작업</th></tr></thead><tbody>';
    items.forEach(function(it) {
        var escapedName = (it.item_name || '').replace(/'/g, '').replace(/"/g, '');
        var specStr = it.specification || (it.width_mm ? it.width_mm + 'mm' : '') || (it.sub_category === '판재류' ? '판재' : '');
        html += '<tr class="border-t hover:bg-gray-50">'
            + '<td class="p-2 font-mono text-blue-600 text-xs">' + escapeHtml(it.item_code || '') + '</td>'
            + '<td class="p-2 font-medium text-sm">' + escapeHtml(it.item_name || '') + '</td>'
            + '<td class="p-2 text-gray-500 text-xs">' + specStr + '</td>'
            + '<td class="p-2 text-gray-500 text-xs">' + escapeHtml(it.sub_category || it.category || '') + '</td>'
            + '<td class="p-2 text-right tabular-nums text-sm">' + (it.base_price || 0).toLocaleString() + '</td>'
            + '<td class="p-2 text-gray-500 text-xs">' + (it.unit || 'EA') + '</td>'
            + '<td class="p-2">'
            + '<button onclick="editItem(' + it.id + ')" class="text-blue-600 hover:underline text-xs mr-2">수정</button>'
            + '<button onclick="deleteItem(' + it.id + ', \'' + escapedName + '\')" class="text-red-500 hover:underline text-xs">삭제</button>'
            + '</td></tr>';
    });
    html += '</tbody></table>';
    return html;
}

window.toggleRMGroup = function(el, e) {
    // 버튼 클릭은 무시 (일괄 수정 버튼 등)
    if (e && (e.target.closest('button') || e.target.tagName === 'BUTTON')) return;
    var content = el.nextElementSibling;
    var chevron = el.querySelector('.rm-group-chevron');
    if (content) content.classList.toggle('hidden');
    if (chevron) chevron.classList.toggle('rotate-180');
};

function loadTabItems(tabName) {
    // 원자재는 그룹 카드 뷰로 전환
    if (tabName === 'rawMaterial') { loadRawMaterialGroupView(); return; }

    var config = TAB_FILTERS[tabName];
    if (!config) return;

    var searchEl = document.getElementById(tabName === 'rawMaterial' ? 'rmSearch' : tabName + 'Search');
    var search = searchEl ? searchEl.value.trim() : '';

    // 원자재: 하위 분류 필터
    var rmSubCat = '';
    if (tabName === 'rawMaterial') {
        var rmFilter = document.getElementById('rmSubCatFilter');
        rmSubCat = rmFilter ? rmFilter.value : '';
    }

    var url = '/api/items?limit=200';
    if (search) url += '&search=' + encodeURIComponent(search);

    // 원자재: 소재 연결 필터
    var rmMediaFilter = '';
    if (tabName === 'rawMaterial') {
        var rmMediaEl = document.getElementById('rmMediaFilter');
        rmMediaFilter = rmMediaEl ? rmMediaEl.value : '';
    }

    axios.get(url).then(function(res) {
        var allTabItems = res.data.data || [];
        var filtered = allTabItems.filter(function(it) {
            if (rmSubCat) return (it.item_code || '').startsWith(rmSubCat);
            return config.match(it);
        });

        // 원자재: 소재 연결 필터 적용
        if (rmMediaFilter === 'linked') {
            filtered = filtered.filter(function(it) { return it.parent_media_id; });
        } else if (rmMediaFilter === 'unlinked') {
            filtered = filtered.filter(function(it) { return !it.parent_media_id; });
        }

        // 정렬
        if (tabSortState.column) {
            filtered.sort(function(a, b) {
                var va = a[tabSortState.column]; if (va == null) va = '';
                var vb = b[tabSortState.column]; if (vb == null) vb = '';
                if (typeof va === 'number' && typeof vb === 'number') return tabSortState.asc ? va - vb : vb - va;
                return tabSortState.asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
            });
        }

        var listId = tabName === 'rawMaterial' ? 'rmItemsList' : tabName + 'ItemsList';

        if (!filtered.length) {
            document.getElementById(listId).innerHTML = '<p class="text-gray-400 text-sm py-8 text-center">등록된 품목이 없습니다.</p>';
            return;
        }

        var tn = "'" + tabName + "'";
        var isRM = tabName === 'rawMaterial';
        var html = '<table class="w-full text-sm ds-table-striped"><thead><tr class="text-left text-gray-500 text-xs">'
            + '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(' + tn + ', \'item_code\')">코드' + sortIcon('item_code') + '</th>'
            + '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(' + tn + ', \'item_name\')">품목명' + sortIcon('item_name') + '</th>'
            + (isRM ? '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(' + tn + ', \'width_mm\')">규격' + sortIcon('width_mm') + '</th>' : '')
            + '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(' + tn + ', \'category\')">분류' + sortIcon('category') + '</th>'
            + '<th class="p-2 text-right cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(' + tn + ', \'base_price\')">단가' + sortIcon('base_price') + '</th>'
            + '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(' + tn + ', \'unit\')">단위' + sortIcon('unit') + '</th>'
            + '<th class="p-2">작업</th></tr></thead><tbody>';
        filtered.forEach(function(it) {
            var escapedName = (it.item_name || '').replace(/'/g, '').replace(/"/g, '');
            var specStr = '';
            if (isRM) {
                if (it.width_mm) specStr = it.width_mm + 'mm';
                else if (it.sub_category === '판재류') specStr = '판재';
            }
            html += '<tr class="border-t hover:bg-gray-50">'
                + '<td class="p-2 font-mono text-blue-600 text-xs">' + escapeHtml(it.item_code || '') + '</td>'
                + '<td class="p-2 font-medium">' + escapeHtml(it.item_name || '') + '</td>'
                + (isRM ? '<td class="p-2 text-gray-500 text-xs">' + specStr + '</td>' : '')
                + '<td class="p-2 text-gray-500 text-xs">' + escapeHtml(it.sub_category || it.category || '') + '</td>'
                + '<td class="p-2 text-right tabular-nums">' + (it.base_price || 0).toLocaleString() + '</td>'
                + '<td class="p-2 text-gray-500">' + (it.unit || 'EA') + '</td>'
                + '<td class="p-2">'
                + '<button onclick="editItem(' + it.id + ')" class="text-blue-600 hover:underline text-xs mr-2">수정</button>'
                + '<button onclick="deleteItem(' + it.id + ', \'' + escapedName + '\')" class="text-red-500 hover:underline text-xs">삭제</button>'
                + '</td></tr>';
        });
        html += '</tbody></table>';
        document.getElementById(listId).innerHTML = html;
    }).catch(function() {
        var listId = tabName === 'rawMaterial' ? 'rmItemsList' : tabName + 'ItemsList';
        document.getElementById(listId).innerHTML = '<p class="text-red-500 text-sm py-4 text-center">데이터 로드 실패</p>';
    });
}

// ── 탭별 품목 추가 ──

window.showCreateModalForTab = function(tabName) {
    showCreateModal();
    // 탭에 따라 item_type 및 대분류 기본값 설정
    if (tabName === 'transfer') {
        selectItemType('PRODUCT');
        setCategoryForTab('전사');
    } else if (tabName === 'flag') {
        selectItemType('PRODUCT');
        setCategoryForTab('태극기');
    } else if (tabName === 'rawMaterial') {
        selectItemType('MATERIAL');
        loadParentMediaOptions();
    } else if (tabName === 'goods') {
        selectItemType('GOODS');
    } else if (tabName === 'sign') {
        selectItemType('PRODUCT');
        setCategoryForTab('간판');
    }
    updateAutoCodePreview();
};

// 탭에서 품목 추가 시 해당 탭의 첫 번째 카테고리를 기본 선택
function setCategoryForTab(defaultCat) {
    var catEl = document.getElementById('itemCategory');
    if (!catEl) return;
    // 옵션 중 defaultCat과 일치하는 것 선택
    for (var i = 0; i < catEl.options.length; i++) {
        if (catEl.options[i].value === defaultCat) {
            catEl.value = defaultCat;
            return;
        }
    }
}

// 출력방식 목록 로드
function loadPrintMethods() {
    axios.get('/api/print-system/methods').then(function(res) {
        var methods = res.data.data;
        cachedPrintMethods = methods;
        var html = '<table class="w-full text-sm"><thead><tr class="text-left text-gray-500 text-xs">'
            + '<th class="pb-2">출력방식</th><th class="pb-2">코드</th><th class="pb-2">카드그룹</th>'
            + '<th class="pb-2">단가 (원/㎡)</th><th class="pb-2">상태</th></tr></thead><tbody>';
        methods.forEach(function(m) {
            html += '<tr class="border-t">'
                + '<td class="py-2 font-medium">' + escapeHtml(m.name) + '</td>'
                + '<td class="py-2 text-gray-500">' + (m.code || '') + '</td>'
                + '<td class="py-2"><span class="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">' + (m.card_group || '') + '</span></td>'
                + '<td class="py-2"><input type="number" id="method-price-' + m.id + '" value="' + (m.price_per_sqm || 0) + '" '
                + 'class="w-24 px-2 py-1 border rounded text-right">'
                + '<button onclick="updateMethodPrice(' + m.id + ', document.getElementById(\'method-price-' + m.id + '\').value)" '
                + 'class="ml-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100">적용</button>'
                + '<button onclick="showPriceHistory(\'METHOD\',' + m.id + ')" class="text-xs text-gray-400 hover:text-blue-600 ml-2" title="단가 이력"><i class="fas fa-history"></i></button></td>'
                + '<td class="py-2">' + (m.is_active ? '<span class="text-green-600">활성</span>' : '<span class="text-gray-400">비활성</span>') + '</td>'
                + '</tr>';
        });
        html += '</tbody></table>';
        document.getElementById('printMethodsList').innerHTML = html;
    }).catch(function() {
        document.getElementById('printMethodsList').innerHTML = '<p class="text-red-500 text-sm">로드 실패</p>';
    });
}

// 출력방식 단가 수정
window.updateMethodPrice = function(id, price) {
    var newPrice = parseFloat(price) || 0;
    showConfirm('출력방식 단가를 변경하면 관련 모든 품목의 기본 단가가 연쇄 업데이트됩니다.\n\n변경 단가: ' + fmtMoneyInput(newPrice) + '원/㎡\n\n계속하시겠습니까?').then(function(confirmed) {
        if (!confirmed) return;
        axios.patch('/api/print-system/methods/' + id, { price_per_sqm: newPrice })
            .then(function(res) {
                if (res.data.success) showToast('단가가 업데이트되었습니다. 관련 품목 연쇄 반영됨.', 'success');
            }).catch(function() { showToast('업데이트 실패', 'error'); });
    });
};

