// items/media.js — 인쇄매체 단일/그룹 CRUD, RM 그룹 일괄 편집 (Phase 3.1.B 분할)

// 소재 목록 로드
function loadPrintMedia() {
    axios.get('/api/print-system/media').then(function(res) {
        var data = res.data.data;
        cachedPrintMediaData = data;
        var html = '';

        // 그룹별 카드 (클릭 → 모달)
        if (data.groups) {
            Object.keys(data.groups).forEach(function(groupName) {
                var items = data.groups[groupName];
                var escapedGroup = escapeHtml(groupName).replace(/'/g, "\\'");
                var methods = new Set();
                var priceRange = [Infinity, 0];
                items.forEach(function(m) {
                    (m.methods || []).forEach(function(mt) { methods.add(mt.name); });
                    var p = m.price_per_unit || 0;
                    if (p < priceRange[0]) priceRange[0] = p;
                    if (p > priceRange[1]) priceRange[1] = p;
                });
                var methodStr = Array.from(methods).join(', ') || '미설정';
                var priceStr = priceRange[0] === priceRange[1]
                    ? fmtMoneyInput(priceRange[0]) + '원'
                    : fmtMoneyInput(priceRange[0]) + '~' + fmtMoneyInput(priceRange[1]) + '원';
                var rmCount = items.reduce(function(sum, m) { return sum + (m.raw_materials || []).length; }, 0);

                html += '<div class="border rounded-lg hover:border-blue-300 hover:shadow-sm transition cursor-pointer" '
                    + 'onclick="openMediaGroupModal(\'' + escapedGroup + '\')">'
                    + '<div class="p-3 flex items-center justify-between">'
                    + '<div>'
                    + '<span class="font-semibold text-sm">' + escapeHtml(groupName) + '</span>'
                    + '<span class="ml-2 text-xs text-gray-400">' + items.length + '개 소재</span>'
                    + '</div>'
                    + '<div class="flex items-center gap-3 text-xs text-gray-500">'
                    + '<span>' + methodStr + '</span>'
                    + '<span class="text-gray-300">|</span>'
                    + '<span>' + priceStr + '</span>'
                    + '<span class="text-gray-300">|</span>'
                    + '<span>원자재 ' + rmCount + '건</span>'
                    + '<i class="fas fa-chevron-right text-gray-300 ml-1"></i>'
                    + '</div></div></div>';
            });
        }

        // 그룹 없는 소재
        if (data.ungrouped && data.ungrouped.length > 0) {
            html += '<div class="border rounded-lg mt-3">'
                + '<div class="p-3 font-medium text-sm text-gray-500">기타 소재 (' + data.ungrouped.length + '건)</div>'
                + '<div class="border-t">' + buildPrintMediaTable(data.ungrouped, '') + '</div>'
                + '</div>';
        }

        if (!html) html = '<p class="text-gray-400 text-sm py-4 text-center">등록된 소재가 없습니다.</p>';
        document.getElementById('printMediaList').innerHTML = html;
    }).catch(function() {
        document.getElementById('printMediaList').innerHTML = '<p class="text-red-500 text-sm">로드 실패</p>';
    });
}

window.togglePrintMediaGroup = function(btn) {
    var content = btn.nextElementSibling;
    var icon = btn.querySelector('.ps-toggle-icon');
    content.classList.toggle('hidden');
    if (icon) {
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-right');
    }
};

function buildPrintMediaTable(items, groupName) {
    var gn = groupName ? escapeHtml(groupName).replace(/'/g, "\\'") : '';
    // 일괄 작업 바
    var html = '<div class="flex items-center gap-2 p-2 bg-gray-50 border-b text-xs">'
        + '<label class="flex items-center gap-1 cursor-pointer"><input type="checkbox" onchange="toggleMediaGroupAll(this,\'' + gn + '\')" class="h-3.5 w-3.5"> 전체선택</label>'
        + '<button onclick="bulkChangeMethodsForGroup(\'' + gn + '\')" class="px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">출력방식 일괄</button>'
        + '<button onclick="bulkChangeSizesForGroup(\'' + gn + '\')" class="px-2 py-1 bg-purple-50 text-purple-700 rounded hover:bg-purple-100">규격 일괄</button>'
        + '</div>';

    html += '<table class="w-full text-xs ds-table-striped" style="table-layout:fixed"><thead><tr class="text-gray-500 text-left">'
        + '<th class="p-2" style="width:5%"></th>'
        + '<th class="p-2" style="width:23%">소재명</th><th class="p-2" style="width:8%">유형</th><th class="p-2 text-right" style="width:13%">단가/㎡</th>'
        + '<th class="p-2" style="width:15%">규격</th><th class="p-2" style="width:22%">출력방식</th><th class="p-2" style="width:14%">작업</th>'
        + '</tr></thead><tbody>';
    items.forEach(function(m) {
        var specW = m.sheet_width_cm || '';
        var specH = m.sheet_height_cm || '';
        var methodIds = (m.methods || []).map(function(mt) { return mt.id; });
        var methodBadges = cachedPrintMethods.map(function(pm) {
            var active = methodIds.indexOf(pm.id) >= 0;
            return '<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded cursor-pointer select-none '
                + (active ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-400')
                + '" data-media-id="' + m.id + '" data-method-id="' + pm.id + '" onclick="toggleMediaMethod(this)">'
                + escapeHtml(pm.name) + '</span>';
        }).join(' ');

        html += '<tr class="border-t hover:bg-gray-50" data-media-id="' + m.id + '">'
            + '<td class="p-2 text-center"><input type="checkbox" class="media-row-check h-3.5 w-3.5" value="' + m.id + '"></td>'
            + '<td class="p-2"><input type="text" value="' + escapeHtml(m.name) + '" '
            + 'class="w-full border-0 bg-transparent text-sm font-medium focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 -mx-1 media-edit-name" data-media-id="' + m.id + '"></td>'
            + '<td class="p-2"><span class="px-1.5 py-0.5 rounded text-xs '
            + (m.media_type === 'SHEET' ? 'bg-orange-50 text-orange-700' : 'bg-cyan-50 text-cyan-700') + '">'
            + (m.media_type === 'SHEET' ? '판재' : '롤') + '</span></td>'
            + '<td class="p-2 text-right"><input type="text" value="' + fmtMoneyInput(m.price_per_unit || 0) + '" '
            + 'class="w-full text-right border-0 bg-transparent focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 -mx-1 media-edit-price" data-media-id="' + m.id + '" '
            + 'onfocus="this.select()" onblur="this.value=fmtMoneyInput(parseMoney(this.value))"></td>'
            + '<td class="p-2">';
        if (m.media_type === 'SHEET') {
            html += '<input type="number" value="' + specW + '" class="w-10 text-center border rounded px-0.5 media-edit-sw" data-media-id="' + m.id + '"> × '
                + '<input type="number" value="' + specH + '" class="w-10 text-center border rounded px-0.5 media-edit-sh" data-media-id="' + m.id + '">';
        } else {
            html += '<input type="number" value="' + (m.roll_width_cm || '') + '" class="w-14 text-center border rounded px-0.5 media-edit-rw" data-media-id="' + m.id + '" placeholder="폭cm">';
        }
        html += '</td>'
            + '<td class="p-2"><div class="flex flex-wrap gap-1">' + methodBadges + '</div></td>'
            + '<td class="p-2">'
            + '<button onclick="editMedia(' + m.id + ')" class="text-blue-400 hover:text-blue-600 mr-1" title="수정"><i class="fas fa-edit"></i></button>'
            + '<button onclick="showPriceHistory(\'MEDIA\',' + m.id + ')" class="text-gray-400 hover:text-blue-600 mr-1" title="단가 이력"><i class="fas fa-history"></i></button>'
            + '<button onclick="deleteMedia(' + m.id + ')" class="text-red-400 hover:text-red-600" title="삭제"><i class="fas fa-trash"></i></button></td>'
            + '</tr>';
    });
    html += '</tbody></table>';
    return html;
}

// 출력방식 토글 (배지 클릭)
// ═══ 소재 그룹명 일괄 변경 ═══
window.renameMediaGroup = function(oldGroupName) {
    var newGroupName = document.getElementById('mediaGroupNameEdit')?.value?.trim();
    if (!newGroupName || newGroupName === oldGroupName) { showToast('변경할 이름을 입력하세요', 'info'); return; }

    showConfirm('"' + oldGroupName + '" → "' + newGroupName + '"\n\n이 그룹의 모든 소재명·출력품목명·원자재명이 일괄 변경됩니다.\n\n예: "' + oldGroupName + ' 1T 백색" → "' + newGroupName + ' 1T 백색"\n\n계속하시겠습니까?').then(function(confirmed) {
        if (!confirmed) return;
        var items = cachedPrintMediaData?.groups?.[oldGroupName] || [];
        var promises = items.map(function(m) {
            var newName = m.name.replace(oldGroupName, newGroupName);
            return axios.put('/api/print-system/media/' + m.id, { name: newName, media_group: newGroupName });
        });
        Promise.all(promises).then(function() {
            showToast(items.length + '개 소재 이름 변경 완료', 'success');
            loadPrintMedia();
            document.getElementById('mediaGroupModal')?.remove();
        }).catch(function() { showToast('이름 변경 실패', 'error'); });
    });
};

// ═══ 소재 그룹 상세 모달 (통합: 소재 + 원자재) ═══
window.openMediaGroupModal = function(groupName) {
    if (!cachedPrintMediaData?.groups?.[groupName]) { showToast('그룹 데이터 없음', 'error'); return; }
    var items = cachedPrintMediaData.groups[groupName];
    var escapedGroup = escapeHtml(groupName).replace(/'/g, "\\'");

    // 기존 모달 제거
    var existing = document.getElementById('mediaGroupModal');
    if (existing) existing.remove();

    // 원자재 수집
    var allRMs = [];
    items.forEach(function(m) {
        if (m.raw_materials) {
            m.raw_materials.forEach(function(rm) {
                rm._mediaId = m.id;
                rm._mediaName = m.name;
                allRMs.push(rm);
            });
        }
    });
    allRMs.sort(function(a, b) { return (a.width_mm || 0) - (b.width_mm || 0); });

    // 원자재 섹션 HTML
    var rmHtml = '<div class="border-t mt-4 pt-4">'
        + '<div class="flex items-center justify-between mb-2">'
        + '<h3 class="text-sm font-bold text-gray-700"><i class="fas fa-cubes text-cyan-600 mr-1"></i>원자재 (' + allRMs.length + '개)</h3>'
        + '<div class="flex items-center gap-2 text-xs">'
        + '<button onclick="rmGroupBulkRename(\'' + escapedGroup + '\')" class="px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100"><i class="fas fa-i-cursor mr-1"></i>이름 변경</button>'
        + '<select id="rmGroupBulkSubCat" class="px-1.5 py-0.5 border rounded text-xs"><option value="">분류</option><option value="원단류">원단류</option><option value="판재류">판재류</option><option value="시트류">시트류</option><option value="부자재">부자재</option></select>'
        + '<select id="rmGroupBulkUnit" class="px-1.5 py-0.5 border rounded text-xs"><option value="">단위</option><option value="M">M</option><option value="EA">EA</option><option value="장">장</option><option value="kg">kg</option></select>'
        + '<button onclick="rmGroupToggleSales(true)" class="px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">판매ON</button>'
        + '<button onclick="rmGroupToggleSales(false)" class="px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200">판매OFF</button>'
        + '<button onclick="rmGroupBulkDelete()" class="px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"><i class="fas fa-trash mr-1"></i>삭제</button>'
        + '</div></div>';

    if (allRMs.length > 0) {
        var hasMultiMedia = items.filter(function(m) { return m.raw_materials && m.raw_materials.length > 0; }).length > 1;

        rmHtml += '<table class="w-full text-xs" style="table-layout:fixed"><thead><tr class="text-gray-500 border-b">'
            + '<th class="p-1.5 w-7"><input type="checkbox" class="h-3.5 w-3.5" onchange="toggleRMGroupAll(this)" checked></th>'
            + (hasMultiMedia ? '<th class="p-1.5 text-left" style="width:14%">소재</th>' : '')
            + '<th class="p-1.5 text-left" style="width:' + (hasMultiMedia ? '14' : '20') + '%">원자재명</th>'
            + '<th class="p-1.5 text-left" style="width:12%">규격</th>'
            + '<th class="p-1.5 text-right" style="width:12%">매입단가</th>'
            + '<th class="p-1.5 text-center" style="width:7%">판매</th>'
            + '<th class="p-1.5 text-right" style="width:12%">매출단가</th>'
            + '<th class="p-1.5 w-7"></th>'
            + '</tr></thead><tbody>';

        // 소재별로 그룹핑하여 표시
        var mediaOrder = items.filter(function(m) { return m.raw_materials && m.raw_materials.length > 0; });
        mediaOrder.forEach(function(media) {
            var mediaRMs = allRMs.filter(function(rm) { return rm._mediaId === media.id; });
            mediaRMs.forEach(function(rm, idx) {
                var spec = rm.specification || (rm.width_mm ? rm.width_mm + 'mm' : '');
                var isSales = !!rm.is_sales_item;
                rmHtml += '<tr class="border-t hover:bg-gray-50 rm-group-edit-row" data-rm-id="' + rm.id + '" data-media-id="' + rm._mediaId + '">'
                    + '<td class="p-1.5 text-center"><input type="checkbox" class="rm-group-check h-3.5 w-3.5" checked></td>';
                if (hasMultiMedia) {
                    rmHtml += '<td class="p-1.5 text-gray-400">' + (idx === 0 ? escapeHtml(media.name) : '') + '</td>';
                }
                rmHtml += '<td class="p-1.5"><input type="text" value="' + escapeHtml(rm.item_name || '') + '" class="rm-grp-name w-full border-0 bg-transparent text-sm focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 -mx-1"></td>'
                    + '<td class="p-1.5"><input type="text" value="' + escapeHtml(spec) + '" class="rm-grp-spec w-full border-0 bg-transparent text-sm focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 -mx-1" placeholder="1050mm"></td>'
                    + '<td class="p-1.5 text-right"><input type="text" value="' + fmtMoneyInput(rm.base_price || 0) + '" class="rm-grp-price w-full text-right border-0 bg-transparent text-sm focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1" onfocus="this.select()" onblur="this.value=fmtMoneyInput(parseMoney(this.value))"></td>'
                    + '<td class="p-1.5 text-center"><input type="checkbox" class="rm-grp-sales h-3.5 w-3.5" ' + (isSales ? 'checked' : '') + ' onchange="toggleRMGroupSalesPrice(this)"></td>'
                    + '<td class="p-1.5 text-right"><input type="text" value="' + fmtMoneyInput(rm.sales_price || 0) + '" class="rm-grp-sales-price w-full text-right border-0 bg-transparent text-sm focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 ' + (isSales ? '' : 'opacity-30') + '" ' + (isSales ? '' : 'disabled') + ' onfocus="this.select()" onblur="this.value=fmtMoneyInput(parseMoney(this.value))"></td>'
                    + '<td class="p-1.5"><button onclick="unlinkRMFromGroup(this)" class="text-red-400 hover:text-red-600" title="연결 해제"><i class="fas fa-unlink text-[10px]"></i></button></td>'
                    + '</tr>';
            });
        });
        rmHtml += '</tbody></table>';
    } else {
        rmHtml += '<p class="text-gray-400 text-xs py-3 text-center">연결된 원자재가 없습니다.</p>';
    }

    // 인라인 추가
    rmHtml += '<div class="flex items-center gap-2 mt-2 pt-2 border-t border-dashed">'
        + '<span class="text-xs text-gray-400"><i class="fas fa-plus mr-1"></i>추가:</span>'
        + '<input type="text" id="rmGroupAddSpec" placeholder="규격 (예: 1050mm, 900x1800)" class="w-40 px-2 py-1 border rounded text-xs">'
        + '<button onclick="addRMToGroup(\'' + escapedGroup + '\')" class="px-2 py-1 bg-cyan-50 text-cyan-600 rounded hover:bg-cyan-100 text-xs">추가</button>'
        + '</div></div>';

    var modal = document.createElement('div');
    modal.id = 'mediaGroupModal';
    modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';
    modal.innerHTML = '<div class="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col mx-4">'
        + '<div class="flex items-center justify-between p-4 border-b">'
        + '<div>'
        + '<div class="flex items-center gap-2">'
        + '<h2 class="text-lg font-bold">소재 그룹:</h2>'
        + '<input type="text" id="mediaGroupNameEdit" value="' + escapeHtml(groupName) + '" '
        + 'class="text-lg font-bold border-0 bg-transparent focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 -mx-1 w-40">'
        + '<button onclick="renameMediaGroup(\'' + escapedGroup + '\')" '
        + 'class="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200" title="그룹명 변경 시 모든 소재명·출력품목명·원자재명이 일괄 변경됩니다">이름 적용</button>'
        + (allRMs.length > 0 ? '<span class="px-2 py-0.5 bg-cyan-100 text-cyan-700 rounded-full text-xs font-medium">원자재 ' + allRMs.length + '</span>' : '')
        + '</div>'
        + '<p class="text-xs text-gray-400 mt-0.5">' + items.length + '개 소재 · 그룹명 변경 시 전체 명칭 일괄 반영</p>'
        + '</div>'
        + '<div class="flex items-center gap-2">'
        + '<button onclick="addMediaRowToGroup(\'' + escapedGroup + '\')" '
        + 'class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"><i class="fas fa-plus mr-1"></i>소재 추가</button>'
        + '<button onclick="document.getElementById(\'mediaGroupModal\').remove()" '
        + 'class="p-2 text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>'
        + '</div></div>'
        + '<div class="flex-1 overflow-auto p-4">'
        + buildPrintMediaTable(items, groupName)
        + rmHtml
        + '</div>'
        + '<div class="border-t p-3 bg-gray-50 rounded-b-xl">'
        + '<div class="flex items-center justify-between">'
        + '<div class="flex gap-2 text-xs">'
        + '<button onclick="showGroupPriceModal(\'' + escapedGroup + '\')" '
        + 'class="px-3 py-1.5 bg-amber-50 text-amber-700 rounded hover:bg-amber-100"><i class="fas fa-coins mr-1"></i>단가 일괄 조정</button>'
        + '</div>'
        + '<button onclick="saveUnifiedMediaGroup(\'' + escapedGroup + '\')" '
        + 'class="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">저장</button>'
        + '</div></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

// 그룹 내 소재 추가 (모달 안에서)
window.addMediaRowToGroup = function(groupName) {
    var tbody = document.querySelector('#mediaGroupModal tbody');
    if (!tbody) return;
    var newId = 'new-' + Date.now();
    var methodBadges = cachedPrintMethods.map(function(pm) {
        return '<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded cursor-pointer select-none '
            + 'bg-gray-100 text-gray-400'
            + '" data-media-id="' + newId + '" data-method-id="' + pm.id + '" onclick="toggleMediaMethod(this)">'
            + escapeHtml(pm.name) + '</span>';
    }).join(' ');

    var row = '<tr class="border-t bg-blue-50/30" data-media-id="' + newId + '">'
        + '<td class="p-2 text-center"><input type="checkbox" class="media-row-check h-3.5 w-3.5" value="' + newId + '" checked></td>'
        + '<td class="p-2"><input type="text" value="" placeholder="소재명 입력" '
        + 'class="w-full border border-blue-300 bg-white rounded px-2 py-1 text-sm font-medium focus:ring-1 focus:ring-blue-400 media-edit-name" data-media-id="' + newId + '"></td>'
        + '<td class="p-2"><span class="px-1.5 py-0.5 rounded text-xs bg-orange-50 text-orange-700">판재</span></td>'
        + '<td class="p-2 text-right"><input type="text" value="0" '
        + 'class="w-full text-right border border-blue-300 bg-white rounded px-2 py-1 focus:ring-1 focus:ring-blue-400 media-edit-price" data-media-id="' + newId + '"></td>'
        + '<td class="p-2">'
        + '<input type="number" value="" class="w-10 text-center border rounded px-0.5 media-edit-sw" data-media-id="' + newId + '" placeholder="W"> × '
        + '<input type="number" value="" class="w-10 text-center border rounded px-0.5 media-edit-sh" data-media-id="' + newId + '" placeholder="H">'
        + '</td>'
        + '<td class="p-2"><div class="flex flex-wrap gap-1">' + methodBadges + '</div></td>'
        + '<td class="p-2"><button onclick="this.closest(\'tr\').remove()" class="text-red-400 hover:text-red-600"><i class="fas fa-times"></i></button></td>'
        + '</tr>';
    tbody.insertAdjacentHTML('beforeend', row);
    // 새 행의 이름 입력에 포커스
    var newInput = tbody.querySelector('tr:last-child .media-edit-name');
    if (newInput) newInput.focus();
};

// ── 통합 모달 헬퍼 함수 ──

// 통합 모달: 원자재 전체선택
window.toggleRMGroupAll = function(checkbox) {
    var modal = document.getElementById('mediaGroupModal');
    if (!modal) return;
    modal.querySelectorAll('.rm-group-check').forEach(function(cb) { cb.checked = checkbox.checked; });
};

// 통합 모달: 판매 토글 → 매출단가 활성/비활성
window.toggleRMGroupSalesPrice = function(cb) {
    var row = cb.closest('tr');
    var spInput = row.querySelector('.rm-grp-sales-price');
    if (cb.checked) {
        spInput.disabled = false;
        spInput.classList.remove('opacity-30');
    } else {
        spInput.disabled = true;
        spInput.classList.add('opacity-30');
        spInput.value = fmtMoneyInput(0);
    }
};

// 통합 모달: 판매 일괄 ON/OFF
window.rmGroupToggleSales = function(on) {
    document.querySelectorAll('.rm-group-edit-row').forEach(function(row) {
        var check = row.querySelector('.rm-group-check');
        if (check && check.checked) {
            var salesCb = row.querySelector('.rm-grp-sales');
            salesCb.checked = on;
            toggleRMGroupSalesPrice(salesCb);
        }
    });
};

// 통합 모달: 이름 일괄 변경
window.rmGroupBulkRename = function(groupName) {
    var newName = prompt('변경할 원자재명을 입력하세요:');
    if (!newName) return;
    document.querySelectorAll('.rm-group-edit-row').forEach(function(row) {
        var check = row.querySelector('.rm-group-check');
        if (check && check.checked) {
            row.querySelector('.rm-grp-name').value = newName;
        }
    });
};

// 통합 모달: 선택 삭제 (저장 시 반영)
window.rmGroupBulkDelete = function() {
    var rows = document.querySelectorAll('.rm-group-edit-row');
    var toMark = [];
    rows.forEach(function(row) {
        var check = row.querySelector('.rm-group-check');
        if (check && check.checked && !row.dataset.deleted) toMark.push(row);
    });
    if (!toMark.length) { showToast('선택된 항목이 없습니다.', 'warning'); return; }
    toMark.forEach(function(row) {
        row.classList.add('opacity-20', 'line-through', 'bg-red-50');
        row.dataset.deleted = '1';
        var check = row.querySelector('.rm-group-check');
        if (check) check.checked = false;
    });
    showToast(toMark.length + '개 삭제 예약 (저장 시 반영)', 'info');
};

// 통합 모달: 연결 해제 (저장 시 반영)
window.unlinkRMFromGroup = function(btn) {
    var row = btn.closest('tr');
    row.classList.add('opacity-30', 'line-through');
    row.dataset.unlinked = '1';
    // 체크 해제
    var check = row.querySelector('.rm-group-check');
    if (check) check.checked = false;
    // 해제 버튼 → 되돌리기
    btn.innerHTML = '<i class="fas fa-undo text-[10px]"></i>';
    btn.title = '해제 취소';
    btn.onclick = function() { restoreRMRow(btn); };
};

window.restoreRMRow = function(btn) {
    var row = btn.closest('tr');
    row.classList.remove('opacity-30', 'line-through');
    delete row.dataset.unlinked;
    var check = row.querySelector('.rm-group-check');
    if (check) check.checked = true;
    btn.innerHTML = '<i class="fas fa-unlink text-[10px]"></i>';
    btn.title = '연결 해제';
    btn.onclick = function() { unlinkRMFromGroup(btn); };
};

// 통합 모달: 원자재 인라인 추가
window.addRMToGroup = async function(groupName) {
    var specInput = document.getElementById('rmGroupAddSpec');
    if (!specInput) return;
    var spec = specInput.value.trim();
    if (!spec) { showToast('규격을 입력하세요.', 'warning'); return; }

    // 첫 번째 소재의 ID와 이름 사용
    var firstRow = document.querySelector('#mediaGroupModal tr[data-media-id]');
    var mediaId = firstRow ? firstRow.dataset.mediaId : null;
    var nameInput = firstRow ? firstRow.querySelector('.media-edit-name') : null;
    var mediaName = nameInput ? nameInput.value.trim() : groupName;

    if (!mediaId) { showToast('소재가 없습니다.', 'warning'); return; }

    var widthMm = parseWidthFromSpec(spec);
    var subCat = widthMm ? '원단류' : '판재류';
    var unit = widthMm ? 'M' : 'EA';
    try {
        await axios.post('/api/items', {
            item_name: mediaName,
            item_type: 'MATERIAL',
            category: '원자재',
            sub_category: subCat,
            unit: unit,
            width_mm: widthMm,
            specification: spec,
            parent_media_id: parseInt(mediaId)
        });
        showToast(spec + ' 원자재 추가 완료', 'success');
        specInput.value = '';
        loadPrintMedia();
        setTimeout(function() { openMediaGroupModal(groupName); }, 300);
    } catch(err) { showToast('추가 실패: ' + (err.response?.data?.error || err.message), 'error'); }
};

// 통합 저장
window.saveUnifiedMediaGroup = async function(groupName) {
    // 1) 소재 저장 (기존 saveMediaGroup 로직)
    var mediaRows = document.querySelectorAll('#mediaGroupModal tr[data-media-id]');
    var mediaUpdates = [];
    var newItems = [];
    mediaRows.forEach(function(row) {
        var rawId = row.getAttribute('data-media-id');
        var nameInput = row.querySelector('.media-edit-name');
        if (!nameInput) return;
        var priceInput = row.querySelector('.media-edit-price');
        var swInput = row.querySelector('.media-edit-sw');
        var shInput = row.querySelector('.media-edit-sh');
        var rwInput = row.querySelector('.media-edit-rw');

        var methodIds = [];
        row.querySelectorAll('[data-method-id]').forEach(function(badge) {
            if (badge.classList.contains('bg-blue-100')) methodIds.push(parseInt(badge.dataset.methodId));
        });

        var data = {
            name: nameInput.value.trim(),
            price_per_unit: parseMoney(priceInput?.value || '0'),
            sheet_width_cm: swInput ? parseFloat(swInput.value) || null : undefined,
            sheet_height_cm: shInput ? parseFloat(shInput.value) || null : undefined,
            roll_width_cm: rwInput ? parseFloat(rwInput.value) || null : undefined,
            method_ids: methodIds
        };

        if (String(rawId).startsWith('new-')) {
            if (!data.name) return;
            data.media_type = swInput ? 'SHEET' : 'ROLL';
            data.media_group = groupName;
            newItems.push(data);
        } else {
            mediaUpdates.push({ id: rawId, data: data });
        }
    });

    // 2) 원자재 분류
    var rmRows = document.querySelectorAll('.rm-group-edit-row');
    var rmUpdates = [];
    var rmUnlinks = [];
    var rmDeletes = [];
    var bulkSubCat = document.getElementById('rmGroupBulkSubCat');
    var bulkUnit = document.getElementById('rmGroupBulkUnit');
    var subCatVal = bulkSubCat ? bulkSubCat.value : '';
    var unitVal = bulkUnit ? bulkUnit.value : '';

    rmRows.forEach(function(row) {
        var id = parseInt(row.dataset.rmId);
        if (row.dataset.deleted) { rmDeletes.push(id); return; }
        if (row.dataset.unlinked) { rmUnlinks.push(id); return; }
        var name = row.querySelector('.rm-grp-name').value.trim();
        var spec = row.querySelector('.rm-grp-spec').value.trim();
        var width = parseWidthFromSpec(spec);
        var price = parseMoney(row.querySelector('.rm-grp-price').value);
        var isSales = row.querySelector('.rm-grp-sales').checked ? 1 : 0;
        var salesPrice = isSales ? parseMoney(row.querySelector('.rm-grp-sales-price').value) : 0;

        var data = { item_name: name, specification: spec || null, width_mm: width, base_price: price, is_sales_item: isSales, sales_price: salesPrice };
        if (subCatVal) data.sub_category = subCatVal;
        if (unitVal) data.unit = unitVal;
        rmUpdates.push({ id: id, data: data });
    });

    // 삭제/해제가 있으면 최종 확인
    if (rmDeletes.length > 0 || rmUnlinks.length > 0) {
        var msg = '';
        if (rmDeletes.length) msg += rmDeletes.length + '개 삭제';
        if (rmUnlinks.length) msg += (msg ? ', ' : '') + rmUnlinks.length + '개 연결 해제';
        if (!(await showConfirm(msg + '를 포함하여 저장하시겠습니까?'))) return;
    }

    try {
        // 소재 저장
        var mediaPromises = mediaUpdates.map(function(u) {
            return axios.put('/api/print-system/media/' + u.id, u.data);
        });
        var newPromises = newItems.map(function(n) {
            return axios.post('/api/print-system/media', n);
        });
        await Promise.all(mediaPromises.concat(newPromises));

        // 원자재 삭제
        if (rmDeletes.length > 0) {
            await Promise.all(rmDeletes.map(function(id) { return axios.delete('/api/items/' + id); }));
        }
        // 원자재 연결 해제
        if (rmUnlinks.length > 0) {
            await Promise.all(rmUnlinks.map(function(id) { return axios.patch('/api/items/' + id, { parent_media_id: null }); }));
        }
        // 원자재 수정
        if (rmUpdates.length > 0) {
            await Promise.all(rmUpdates.map(function(u) {
                return axios.patch('/api/items/' + u.id, u.data);
            }));
        }

        // product_materials 동기화
        await axios.post('/api/print-system/sync-product-materials/' + encodeURIComponent(groupName));

        showToast('저장 완료', 'success');
        document.getElementById('mediaGroupModal')?.remove();
        loadPrintMedia();
    } catch(err) {
        showToast('저장 실패: ' + (err.response?.data?.error || err.message), 'error');
    }
};

// ── 원자재 일괄 수정 모달 (그룹명 기반) ──
window.openRMBulkEditByGroup = async function(groupName) {
    try {
        // 소재에 연결된 그룹이면 소재 그룹 모달로 유도
        if (cachedPrintMediaData && cachedPrintMediaData.groups) {
            for (var mgName in cachedPrintMediaData.groups) {
                var mediaItems = cachedPrintMediaData.groups[mgName];
                var hasLink = mediaItems.some(function(m) {
                    return m.raw_materials && m.raw_materials.some(function(rm) { return rm.item_name === groupName || (rm.item_name && rm.item_name.indexOf(groupName) >= 0); });
                });
                // parent_media_id 기준으로 정확히 확인
                var res0 = await axios.get('/api/items?item_type=MATERIAL&item_group=' + encodeURIComponent(groupName) + '&limit=1');
                var sample = (res0.data.data || [])[0];
                if (sample && sample.parent_media_id) {
                    // 소재 그룹명 찾기
                    var linkedMediaGroup = null;
                    for (var gn in cachedPrintMediaData.groups) {
                        if (cachedPrintMediaData.groups[gn].some(function(m) { return m.id === sample.parent_media_id; })) {
                            linkedMediaGroup = gn;
                            break;
                        }
                    }
                    if (linkedMediaGroup) {
                        openMediaGroupModal(linkedMediaGroup);
                        return;
                    }
                }
                break;
            }
        }
        var res = await axios.get('/api/items?item_type=MATERIAL&item_group=' + encodeURIComponent(groupName) + '&limit=500');
        var rms = (res.data.data || []).sort(function(a, b) { return (a.width_mm || 0) - (b.width_mm || 0); });
        if (!rms.length) { showToast('원자재가 없습니다.', 'warning'); return; }
        openRMBulkEditModalWithItems(rms, groupName);
    } catch(err) {
        showToast('데이터 로드 실패', 'error');
    }
};

// 규격 텍스트 → width_mm 자동 파싱 (롤: "1050mm" → 1050, 판재/기타: null)
function parseWidthFromSpec(spec) {
    if (!spec) return null;
    var s = spec.trim();
    // "1050mm" 또는 "1050" (숫자만) → 롤 폭
    var m = s.match(/^(\d+)\s*mm?$/i);
    if (m) return parseInt(m[1]);
    // 숫자만
    if (/^\d+$/.test(s)) return parseInt(s);
    // "900x1800" 등 다차원 → 롤 아님
    return null;
}

function openRMBulkEditModalWithItems(rms, title) {
    var existing = document.getElementById('rmBulkEditModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'rmBulkEditModal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[60]';

    var tableHtml = '<table class="w-full text-xs" style="table-layout:fixed"><thead><tr class="text-gray-500 border-b">'
        + '<th class="p-1.5 w-7"><input type="checkbox" class="h-3.5 w-3.5" onchange="toggleRMBulkAll(this)" checked></th>'
        + '<th class="p-1.5 text-left" style="width:15%">원자재명</th>'
        + '<th class="p-1.5 text-left" style="width:13%">규격</th>'
        + '<th class="p-1.5 text-right" style="width:12%">매입단가</th>'
        + '<th class="p-1.5 text-center" style="width:7%">판매</th>'
        + '<th class="p-1.5 text-right" style="width:12%">매출단가</th>'
        + '<th class="p-1.5 w-7"></th>'
        + '</tr></thead><tbody>';

    rms.forEach(function(rm) {
        var spec = rm.specification || (rm.width_mm ? rm.width_mm + 'mm' : '');
        var isSales = !!rm.is_sales_item;
        tableHtml += '<tr class="border-t hover:bg-gray-50 rm-bulk-row" data-rm-id="' + rm.id + '">'
            + '<td class="p-1.5 text-center"><input type="checkbox" class="rm-bulk-check h-3.5 w-3.5" checked></td>'
            + '<td class="p-1.5"><input type="text" value="' + escapeHtml(rm.item_name || '') + '" class="rm-bulk-name w-full border-0 bg-transparent text-sm focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 -mx-1"></td>'
            + '<td class="p-1.5"><input type="text" value="' + escapeHtml(spec) + '" class="rm-bulk-spec w-full border-0 bg-transparent text-sm focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 -mx-1" placeholder="1050mm"></td>'
            + '<td class="p-1.5 text-right"><input type="text" value="' + fmtMoneyInput(rm.base_price || 0) + '" class="rm-bulk-price w-full text-right border-0 bg-transparent text-sm focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1" onfocus="this.select()" onblur="this.value=fmtMoneyInput(parseMoney(this.value))"></td>'
            + '<td class="p-1.5 text-center"><input type="checkbox" class="rm-bulk-sales h-3.5 w-3.5" ' + (isSales ? 'checked' : '') + ' onchange="toggleRMSalesPrice(this)"></td>'
            + '<td class="p-1.5 text-right"><input type="text" value="' + fmtMoneyInput(rm.sales_price || 0) + '" class="rm-bulk-sales-price w-full text-right border-0 bg-transparent text-sm focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 ' + (isSales ? '' : 'opacity-30') + '" ' + (isSales ? '' : 'disabled') + ' onfocus="this.select()" onblur="this.value=fmtMoneyInput(parseMoney(this.value))"></td>'
            + '<td class="p-1.5"><button onclick="this.closest(\'tr\').remove()" class="text-red-400 hover:text-red-600"><i class="fas fa-times"></i></button></td>'
            + '</tr>';
    });
    tableHtml += '</tbody></table>';

    // 분류/단위 일괄 변경용 현재 값 파악
    var subCats = {};
    var units = {};
    rms.forEach(function(rm) {
        var sc = rm.sub_category || '기타';
        subCats[sc] = (subCats[sc] || 0) + 1;
        var u = rm.unit || 'EA';
        units[u] = (units[u] || 0) + 1;
    });
    var currentSubCat = Object.keys(subCats).length === 1 ? Object.keys(subCats)[0] : '';
    var currentUnit = Object.keys(units).length === 1 ? Object.keys(units)[0] : '';

    modal.innerHTML = '<div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col mx-4">'
        + '<div class="flex items-center justify-between p-4 border-b">'
        + '<div>'
        + '<h2 class="text-lg font-bold"><i class="fas fa-edit text-blue-600 mr-2"></i>원자재 일괄 수정</h2>'
        + '<p class="text-xs text-gray-400 mt-0.5">그룹: <span class="font-medium text-gray-600">' + escapeHtml(title) + '</span> · ' + rms.length + '개</p>'
        + '</div>'
        + '<button onclick="document.getElementById(\'rmBulkEditModal\').remove()" class="p-2 text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>'
        + '</div>'
        + '<div class="p-3 border-b bg-gray-50 flex flex-wrap items-center gap-2 text-xs">'
        + '<span class="text-gray-500 font-medium">선택 항목:</span>'
        + '<button onclick="rmBulkRename()" class="px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100"><i class="fas fa-i-cursor mr-1"></i>이름 변경</button>'
        + '<span class="text-gray-300">|</span>'
        + '<label class="flex items-center gap-1">분류 <select id="rmBulkSubCat" class="px-1.5 py-0.5 border rounded text-xs">'
        + '<option value="">변경 안 함</option><option value="원단류"' + (currentSubCat === '원단류' ? ' selected' : '') + '>원단류</option>'
        + '<option value="판재류"' + (currentSubCat === '판재류' ? ' selected' : '') + '>판재류</option>'
        + '<option value="시트류">시트류</option><option value="잉크">잉크</option>'
        + '<option value="전사자재">전사자재</option><option value="간판자재">간판자재</option>'
        + '<option value="부자재">부자재</option><option value="배너대">배너대</option>'
        + '</select></label>'
        + '<label class="flex items-center gap-1">단위 <select id="rmBulkUnit" class="px-1.5 py-0.5 border rounded text-xs">'
        + '<option value="">변경 안 함</option><option value="M"' + (currentUnit === 'M' ? ' selected' : '') + '>M</option>'
        + '<option value="EA"' + (currentUnit === 'EA' ? ' selected' : '') + '>EA</option>'
        + '<option value="장">장</option><option value="kg">kg</option>'
        + '<option value="L">L</option><option value="SET">SET</option>'
        + '</select></label>'
        + '<span class="text-gray-300">|</span>'
        + '<button onclick="rmBulkToggleSales(true)" class="px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">판매 ON</button>'
        + '<button onclick="rmBulkToggleSales(false)" class="px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200">판매 OFF</button>'
        + '<span class="text-gray-300">|</span>'
        + '<button onclick="rmBulkDelete()" class="px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"><i class="fas fa-trash mr-1"></i>삭제</button>'
        + '</div>'
        + '<div class="flex-1 overflow-auto p-4">' + tableHtml + '</div>'
        + '<div class="border-t p-3 flex justify-end gap-2 bg-gray-50 rounded-b-xl">'
        + '<button onclick="document.getElementById(\'rmBulkEditModal\').remove()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>'
        + '<button onclick="saveRMBulkEdit()" class="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">저장</button>'
        + '</div></div>';

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
}

window.toggleRMBulkAll = function(checkbox) {
    document.querySelectorAll('.rm-bulk-check').forEach(function(cb) { cb.checked = checkbox.checked; });
};

// 판매 체크 → 매출단가 활성/비활성
window.toggleRMSalesPrice = function(cb) {
    var row = cb.closest('tr');
    var spInput = row.querySelector('.rm-bulk-sales-price');
    if (cb.checked) {
        spInput.disabled = false;
        spInput.classList.remove('opacity-30');
    } else {
        spInput.disabled = true;
        spInput.classList.add('opacity-30');
        spInput.value = fmtMoneyInput(0);
    }
};

// 선택 항목 판매 ON/OFF 일괄
window.rmBulkToggleSales = function(on) {
    document.querySelectorAll('.rm-bulk-row').forEach(function(row) {
        var check = row.querySelector('.rm-bulk-check');
        if (check && check.checked) {
            var salesCb = row.querySelector('.rm-bulk-sales');
            salesCb.checked = on;
            toggleRMSalesPrice(salesCb);
        }
    });
};

window.rmBulkRename = function() {
    var newName = prompt('변경할 이름을 입력하세요:');
    if (!newName) return;
    document.querySelectorAll('.rm-bulk-row').forEach(function(row) {
        var check = row.querySelector('.rm-bulk-check');
        if (check && check.checked) {
            row.querySelector('.rm-bulk-name').value = newName;
        }
    });
};

window.rmBulkDelete = async function() {
    var rows = document.querySelectorAll('.rm-bulk-row');
    var toDelete = [];
    rows.forEach(function(row) {
        var check = row.querySelector('.rm-bulk-check');
        if (check && check.checked) toDelete.push(row);
    });
    if (!toDelete.length) { showToast('선택된 항목이 없습니다.', 'warning'); return; }
    if (!(await showConfirm(toDelete.length + '개 원자재를 삭제하시겠습니까?', { danger: true }))) return;

    var promises = toDelete.map(function(row) {
        var id = row.dataset.rmId;
        return axios.delete('/api/items/' + id);
    });
    try {
        await Promise.all(promises);
        toDelete.forEach(function(row) { row.remove(); });
        showToast(toDelete.length + '개 삭제 완료', 'success');
    } catch(err) {
        showToast('삭제 실패: ' + (err.response?.data?.error || err.message), 'error');
    }
};

window.saveRMBulkEdit = async function() {
    var rows = document.querySelectorAll('.rm-bulk-row');
    // 일괄 분류/단위
    var bulkSubCat = document.getElementById('rmBulkSubCat');
    var bulkUnit = document.getElementById('rmBulkUnit');
    var subCatVal = bulkSubCat ? bulkSubCat.value : '';
    var unitVal = bulkUnit ? bulkUnit.value : '';

    var updates = [];
    rows.forEach(function(row) {
        var id = parseInt(row.dataset.rmId);
        var name = row.querySelector('.rm-bulk-name').value.trim();
        var spec = row.querySelector('.rm-bulk-spec').value.trim();
        var width = parseWidthFromSpec(spec);
        var price = parseMoney(row.querySelector('.rm-bulk-price').value);
        var isSales = row.querySelector('.rm-bulk-sales').checked ? 1 : 0;
        var salesPrice = isSales ? parseMoney(row.querySelector('.rm-bulk-sales-price').value) : 0;

        var data = {
            item_name: name,
            specification: spec || null,
            width_mm: width,
            base_price: price,
            is_sales_item: isSales,
            sales_price: salesPrice
        };
        if (subCatVal) data.sub_category = subCatVal;
        if (unitVal) data.unit = unitVal;
        updates.push({ id: id, data: data });
    });

    if (!updates.length) {
        document.getElementById('rmBulkEditModal').remove();
        return;
    }

    try {
        await Promise.all(updates.map(function(u) {
            return axios.patch('/api/items/' + u.id, u.data);
        }));
        showToast(updates.length + '개 원자재 수정 완료', 'success');
        document.getElementById('rmBulkEditModal').remove();
        // 원자재 탭 갱신
        if (typeof loadRawMaterialGroupView === 'function') loadRawMaterialGroupView();
        // 소재 관리도 갱신
        if (typeof loadPrintMedia === 'function') loadPrintMedia();
    } catch(err) {
        showToast('수정 실패: ' + (err.response?.data?.error || err.message), 'error');
    }
};

window.toggleMediaMethod = function(el) {
    var isActive = el.classList.contains('bg-blue-100');
    el.classList.toggle('bg-blue-100', !isActive);
    el.classList.toggle('text-blue-800', !isActive);
    el.classList.toggle('bg-gray-100', isActive);
    el.classList.toggle('text-gray-400', isActive);
};

// 전체 선택
window.toggleMediaGroupAll = function(checkbox, groupName) {
    var container = checkbox.closest('.border-b').parentElement;
    var checks = container.querySelectorAll('.media-row-check');
    checks.forEach(function(c) { c.checked = checkbox.checked; });
};

// 그룹 저장
window.saveMediaGroup = function(groupName) {
    var rows = document.querySelectorAll('tr[data-media-id]');
    var updates = [];
    var newItems = [];
    rows.forEach(function(row) {
        var rawId = row.getAttribute('data-media-id');
        var isNew = String(rawId).startsWith('new-');
        var nameInput = row.querySelector('.media-edit-name');
        if (!nameInput) return;

        var priceInput = row.querySelector('.media-edit-price');
        var swInput = row.querySelector('.media-edit-sw');
        var shInput = row.querySelector('.media-edit-sh');
        var rwInput = row.querySelector('.media-edit-rw');

        // 활성 출력방식 수집
        var methodBadges = row.querySelectorAll('[data-method-id]');
        var methodIds = [];
        methodBadges.forEach(function(b) {
            if (b.classList.contains('bg-blue-100')) methodIds.push(parseInt(b.getAttribute('data-method-id')));
        });

        var itemData = {
            name: nameInput.value.trim(),
            price_per_unit: parseMoney(priceInput?.value || '0'),
            sheet_width_cm: swInput ? parseFloat(swInput.value) || null : undefined,
            sheet_height_cm: shInput ? parseFloat(shInput.value) || null : undefined,
            roll_width_cm: rwInput ? parseFloat(rwInput.value) || null : undefined,
            method_ids: methodIds
        };

        if (isNew) {
            if (!itemData.name) return; // 빈 이름 스킵
            itemData.media_type = swInput ? 'SHEET' : 'ROLL';
            itemData.media_group = groupName;
            newItems.push(itemData);
        } else {
            itemData.id = parseInt(rawId);
            updates.push(itemData);
        }
    });

    if (updates.length === 0 && newItems.length === 0) { showToast('변경 사항이 없습니다', 'info'); return; }

    // 기존 소재 PUT + 신규 소재 POST
    var promises = updates.map(function(u) {
        return axios.put('/api/print-system/media/' + u.id, u);
    });
    var newPromises = newItems.map(function(n) {
        return axios.post('/api/print-system/media', n);
    });
    Promise.all(promises.concat(newPromises)).then(function() {
        showToast((updates.length + newItems.length) + '개 소재 저장 완료', 'success');
        loadPrintMedia();
        var modal = document.getElementById('mediaGroupModal');
        if (modal) modal.remove();
    }).catch(function(err) {
        var msg = err?.response?.data?.error || '저장 실패';
        showToast(msg, 'error');
    });
};

// 출력방식 일괄 변경
window.bulkChangeMethodsForGroup = function(groupName) {
    var checked = getCheckedMediaIds();
    if (checked.length === 0) { showToast('소재를 선택하세요', 'info'); return; }

    // 모달 대신 간단한 체크박스 프롬프트
    var methodHtml = cachedPrintMethods.map(function(m) {
        return '<label class="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">'
            + '<input type="checkbox" class="bulk-method-cb h-4 w-4" value="' + m.id + '" checked>'
            + '<span>' + escapeHtml(m.name) + '</span></label>';
    }).join('');

    var modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/30 flex items-center justify-center z-50';
    modal.innerHTML = '<div class="bg-white rounded-xl shadow-xl p-5 w-80">'
        + '<h3 class="font-semibold mb-3">출력방식 일괄 변경 (' + checked.length + '개 소재)</h3>'
        + '<div class="border rounded divide-y">' + methodHtml + '</div>'
        + '<div class="flex gap-2 mt-4">'
        + '<button onclick="applyBulkMethods()" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">적용</button>'
        + '<button onclick="this.closest(\'.fixed\').remove()" class="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">취소</button>'
        + '</div></div>';
    document.body.appendChild(modal);
    modal.querySelector('.bg-black\\/30').addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

window.applyBulkMethods = function() {
    var modal = document.querySelector('.fixed.inset-0');
    var cbs = modal.querySelectorAll('.bulk-method-cb:checked');
    var methodIds = Array.from(cbs).map(function(c) { return parseInt(c.value); });
    modal.remove();

    var checked = getCheckedMediaIds();
    // 테이블에서 해당 소재의 method 배지 업데이트
    checked.forEach(function(mid) {
        var row = document.querySelector('tr[data-media-id="' + mid + '"]');
        if (!row) return;
        row.querySelectorAll('[data-method-id]').forEach(function(badge) {
            var bmid = parseInt(badge.getAttribute('data-method-id'));
            var active = methodIds.indexOf(bmid) >= 0;
            badge.classList.toggle('bg-blue-100', active);
            badge.classList.toggle('text-blue-800', active);
            badge.classList.toggle('bg-gray-100', !active);
            badge.classList.toggle('text-gray-400', !active);
        });
    });
    showToast(checked.length + '개 소재에 출력방식 반영 (저장 필요)', 'info');
};

// 규격 일괄 변경
window.bulkChangeSizesForGroup = function(groupName) {
    var checked = getCheckedMediaIds();
    if (checked.length === 0) { showToast('소재를 선택하세요', 'info'); return; }

    var modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/30 flex items-center justify-center z-50';
    modal.innerHTML = '<div class="bg-white rounded-xl shadow-xl p-5 w-80">'
        + '<h3 class="font-semibold mb-3">규격 일괄 변경 (' + checked.length + '개 소재)</h3>'
        + '<div class="flex items-center gap-2 mb-4">'
        + '<input type="number" id="bulkSizeW" class="w-20 border rounded px-2 py-1" placeholder="가로cm">'
        + '<span>×</span>'
        + '<input type="number" id="bulkSizeH" class="w-20 border rounded px-2 py-1" placeholder="세로cm">'
        + '</div>'
        + '<div class="flex gap-2">'
        + '<button onclick="applyBulkSizes()" class="flex-1 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">적용</button>'
        + '<button onclick="this.closest(\'.fixed\').remove()" class="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">취소</button>'
        + '</div></div>';
    document.body.appendChild(modal);
};

window.applyBulkSizes = function() {
    var w = parseFloat(document.getElementById('bulkSizeW').value) || 0;
    var h = parseFloat(document.getElementById('bulkSizeH').value) || 0;
    document.querySelector('.fixed.inset-0').remove();
    if (!w || !h) { showToast('규격을 입력하세요', 'error'); return; }

    var checked = getCheckedMediaIds();
    checked.forEach(function(mid) {
        var row = document.querySelector('tr[data-media-id="' + mid + '"]');
        if (!row) return;
        var sw = row.querySelector('.media-edit-sw');
        var sh = row.querySelector('.media-edit-sh');
        if (sw) sw.value = w;
        if (sh) sh.value = h;
    });
    showToast(checked.length + '개 소재 규격 반영 (저장 필요)', 'info');
};

function getCheckedMediaIds() {
    var checks = document.querySelectorAll('.media-row-check:checked');
    return Array.from(checks).map(function(c) { return parseInt(c.value); });
}

// 출력방식 체크박스 생성 헬퍼
function renderMethodCheckboxes(containerId, selectedIds) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (cachedPrintMethods.length === 0) {
        axios.get('/api/print-system/methods').then(function(res) {
            cachedPrintMethods = res.data.data || [];
            _buildMethodCheckboxes(container, cachedPrintMethods, selectedIds || []);
        });
    } else {
        _buildMethodCheckboxes(container, cachedPrintMethods, selectedIds || []);
    }
}

function _buildMethodCheckboxes(container, methods, selectedIds) {
    container.innerHTML = methods.map(function(m) {
        var checked = selectedIds.indexOf(m.id) >= 0 ? ' checked' : '';
        return '<label class="flex items-center gap-1.5 px-2 py-1 border rounded text-xs cursor-pointer hover:bg-gray-50">'
            + '<input type="checkbox" class="method-checkbox h-3.5 w-3.5" value="' + m.id + '"' + checked + '>'
            + escapeHtml(m.name)
            + '</label>';
    }).join('');
}

function getSelectedMethodIds(containerId) {
    var checks = document.getElementById(containerId).querySelectorAll('.method-checkbox:checked');
    return Array.from(checks).map(function(c) { return parseInt(c.value); });
}

// 소재 유형에 따른 필드 토글
window.toggleMediaSpecFields = function() {
    var type = document.getElementById('mediaType').value;
    document.getElementById('mediaRollFields').classList.toggle('hidden', type !== 'ROLL');
    document.getElementById('mediaSheetFields').classList.toggle('hidden', type !== 'SHEET');
};

// 소재 추가 모달
// 소재 모달 — 판재 규격 행 추가
window.addMediaSheetSizeRow = function(w, h) {
    var container = document.getElementById('mediaSheetSizesList');
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'flex gap-1 items-center';
    div.innerHTML = '<input type="number" class="media-sheet-w w-20 px-2 py-1 border rounded text-sm" placeholder="가로" value="' + (w || '') + '">'
        + '<span class="text-gray-400 text-xs">×</span>'
        + '<input type="number" class="media-sheet-h w-20 px-2 py-1 border rounded text-sm" placeholder="세로" value="' + (h || '') + '">'
        + '<span class="text-xs text-gray-400">cm</span>'
        + '<button type="button" onclick="this.parentElement.remove()" class="text-gray-400 hover:text-red-500 text-xs ml-1"><i class="fas fa-times"></i></button>';
    container.appendChild(div);
};

// 원자재 탭으로 이동
window.navigateToRMAdd = function() {
    closeMediaAddModal();
    switchMainTab('rawMaterial');
};

// 소재 모달 — 소분류 목록 로드
async function loadMediaSubcategories(selectedId) {
    var sel = document.getElementById('mediaSubcategory');
    if (!sel) return;
    try {
        var res = await axios.get('/api/post-processing/subcategories');
        var subcats = res.data.data || [];
        sel.innerHTML = '<option value="">미지정</option>'
            + subcats.map(function(s) {
                return '<option value="' + s.id + '"' + (s.id == selectedId ? ' selected' : '') + '>' + s.subcat_name + '</option>';
            }).join('');
    } catch(e) {
        sel.innerHTML = '<option value="">로드 실패</option>';
    }
}

window.showMediaAddModal = function() {
    document.getElementById('mediaModalTitle').textContent = '소재 추가';
    document.getElementById('mediaEditId').value = '';
    document.getElementById('mediaName').value = '';
    document.getElementById('mediaType').value = 'ROLL';
    document.getElementById('mediaPrice').value = fmtMoneyInput(0);
    document.getElementById('mediaRollWidth').value = '';
    var sheetList = document.getElementById('mediaSheetSizesList');
    if (sheetList) sheetList.innerHTML = '';
    document.getElementById('mediaGroup').value = '';
    loadMediaSubcategories('');
    // 추가 모드에서는 RM 섹션 숨기기
    var rmSection = document.getElementById('mediaRMSection');
    if (rmSection) rmSection.classList.add('hidden');
    toggleMediaSpecFields();
    renderMethodCheckboxes('mediaMethodCheckboxes', []);
    document.getElementById('mediaAddModal').classList.remove('hidden');
};

window.closeMediaAddModal = function() {
    document.getElementById('mediaAddModal').classList.add('hidden');
};

// 소재 저장
window.saveMedia = function() {
    var id = document.getElementById('mediaEditId').value;
    var name = document.getElementById('mediaName').value.trim();
    var mediaType = document.getElementById('mediaType').value;
    var price = readMoney('mediaPrice');

    if (!name) { showToast('소재명을 입력해주세요.', 'warning'); return; }

    // 판재 규격 수집 (복수)
    var sheetSizesArr = [];
    if (mediaType === 'SHEET') {
        document.querySelectorAll('#mediaSheetSizesList > div').forEach(function(row) {
            var w = parseFloat(row.querySelector('.media-sheet-w')?.value) || 0;
            var h = parseFloat(row.querySelector('.media-sheet-h')?.value) || 0;
            if (w > 0 && h > 0) sheetSizesArr.push({ w: w, h: h });
        });
    }

    var data = {
        name: name,
        media_type: mediaType,
        price_per_unit: price,
        roll_width_cm: mediaType === 'ROLL' ? (parseFloat(document.getElementById('mediaRollWidth').value) || null) : null,
        sheet_width_cm: sheetSizesArr.length > 0 ? sheetSizesArr[0].w : null,
        sheet_height_cm: sheetSizesArr.length > 0 ? sheetSizesArr[0].h : null,
        sheet_sizes: sheetSizesArr.length > 0 ? sheetSizesArr : null,
        media_group: document.getElementById('mediaGroup').value.trim() || null,
        subcategory_id: document.getElementById('mediaSubcategory').value || null
    };

    if (id) {
        // 수정 — 출력방식 연결 변경도 포함
        data.method_ids = getSelectedMethodIds('mediaMethodCheckboxes');
        axios.put('/api/print-system/media/' + id, data).then(function(res) {
            if (res.data.success) {
                var msg = '소재가 수정되었습니다.';
                var dd = res.data.data || {};
                if (dd.created_count > 0) msg += ' (품목 ' + dd.created_count + '개 생성)';
                if (dd.deactivated_count > 0) msg += ' (품목 ' + dd.deactivated_count + '개 비활성화)';
                showToast(msg, 'success');
                closeMediaAddModal();
                loadPrintMedia();
            }
        }).catch(function(err) { showToast('수정 실패: ' + (err.response?.data?.error || err.message), 'error'); });
    } else {
        // 추가 (출력방식 연결 포함)
        data.method_ids = getSelectedMethodIds('mediaMethodCheckboxes');
        axios.post('/api/print-system/media', data).then(function(res) {
            if (res.data.success) {
                var createdCount = (res.data.data.created_items || []).length;
                showToast('소재가 추가되었습니다.' + (createdCount > 0 ? ' (품목 ' + createdCount + '개 자동 생성)' : ''), 'success');
                closeMediaAddModal();
                loadPrintMedia();
            }
        }).catch(function(err) { showToast('추가 실패: ' + (err.response?.data?.error || err.message), 'error'); });
    }
};

// 소재 편집
window.editMedia = function(id) {
    // 캐시에서 찾기
    var media = null;
    if (cachedPrintMediaData) {
        var allMedia = [];
        if (cachedPrintMediaData.groups) {
            Object.values(cachedPrintMediaData.groups).forEach(function(arr) { allMedia = allMedia.concat(arr); });
        }
        if (cachedPrintMediaData.ungrouped) allMedia = allMedia.concat(cachedPrintMediaData.ungrouped);
        media = allMedia.find(function(m) { return m.id === id; });
    }

    if (!media) { showToast('소재 정보를 찾을 수 없습니다.', 'error'); return; }

    document.getElementById('mediaModalTitle').textContent = '소재 수정';
    document.getElementById('mediaEditId').value = id;
    document.getElementById('mediaName').value = media.name || '';
    document.getElementById('mediaType').value = media.media_type || 'ROLL';
    document.getElementById('mediaPrice').value = fmtMoneyInput(media.price_per_unit || 0);
    document.getElementById('mediaRollWidth').value = media.roll_width_cm || '';
    // 판재 규격 복수 표시
    var sheetList = document.getElementById('mediaSheetSizesList');
    if (sheetList) {
        sheetList.innerHTML = '';
        try {
            var sizes = media.sheet_sizes ? (typeof media.sheet_sizes === 'string' ? JSON.parse(media.sheet_sizes) : media.sheet_sizes) : null;
            if (sizes && Array.isArray(sizes) && sizes.length > 0) {
                sizes.forEach(function(s) { addMediaSheetSizeRow(s.w, s.h); });
            } else if (media.sheet_width_cm && media.sheet_height_cm) {
                addMediaSheetSizeRow(media.sheet_width_cm, media.sheet_height_cm);
            }
        } catch(e) {
            if (media.sheet_width_cm && media.sheet_height_cm) addMediaSheetSizeRow(media.sheet_width_cm, media.sheet_height_cm);
        }
    }
    document.getElementById('mediaGroup').value = media.media_group || '';
    loadMediaSubcategories(media.subcategory_id || '');
    toggleMediaSpecFields();

    var connectedMethodIds = (media.methods || []).map(function(m) { return m.id; });
    renderMethodCheckboxes('mediaMethodCheckboxes', connectedMethodIds);

    // 연결된 원자재 표시
    var rmSection = document.getElementById('mediaRMSection');
    var rmList = document.getElementById('mediaRMList');
    if (rmSection && rmList) {
        rmSection.classList.remove('hidden');
        if (media.raw_materials && media.raw_materials.length > 0) {
            rmList.innerHTML = media.raw_materials.map(function(rm) {
                var spec = rm.specification || (rm.width_mm ? rm.width_mm + 'mm' : '');
                return '<div class="flex items-center justify-between bg-gray-50 rounded px-2 py-1">'
                    + '<span>' + escapeHtml(rm.item_code) + ' ' + escapeHtml(rm.item_name)
                    + (spec ? ' <span class="text-gray-400 text-xs">' + escapeHtml(spec) + '</span>' : '')
                    + '</span></div>';
            }).join('');
        } else {
            rmList.innerHTML = '<span class="text-gray-400">연결된 원자재 없음</span>';
        }
    }

    document.getElementById('mediaAddModal').classList.remove('hidden');
};

window.deleteMedia = async function(id) {
    if (!(await showConfirm('이 소재를 삭제하시겠습니까? 관련 품목도 비활성화됩니다.', { danger: true }))) return;
    axios.delete('/api/print-system/media/' + id).then(function(res) {
        if (res.data.success) {
            showToast('소재가 삭제되었습니다.', 'success');
            loadPrintMedia();
        }
    }).catch(function(err) { showToast('삭제 실패: ' + (err.response?.data?.error || err.message), 'error'); });
};

// 일괄 추가 모달
