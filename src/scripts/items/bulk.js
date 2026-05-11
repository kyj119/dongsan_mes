// items/bulk.js — 소재 일괄 추가, 그룹 가격 일괄, 품목 대량 추가, 가격 이력, window exports, 초기 로딩 (Phase 3.1.B 분할)

// ===== 소재 일괄 추가 (교차 생성) =====
var bulkAxisData = { 1: [], 2: [] };
var bulkRollWidthsData = [];

window.addBulkRollWidth = function() {
    var input = document.getElementById('bulkRollWidthNewVal');
    var val = parseInt(input.value);
    if (!val || val <= 0) return;
    if (bulkRollWidthsData.includes(val)) { showToast('이미 추가됨', 'warning'); return; }
    bulkRollWidthsData.push(val);
    bulkRollWidthsData.sort(function(a, b) { return a - b; });
    input.value = '';
    renderBulkRollWidths();
};

window.removeBulkRollWidth = function(idx) {
    bulkRollWidthsData.splice(idx, 1);
    renderBulkRollWidths();
};

function renderBulkRollWidths() {
    var container = document.getElementById('bulkRollWidths');
    container.innerHTML = bulkRollWidthsData.map(function(w, i) {
        return '<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-100 text-cyan-700 rounded text-xs">'
            + w + '폭'
            + '<button type="button" onclick="removeBulkRollWidth(' + i + ')" class="text-cyan-400 hover:text-red-500">&times;</button></span>';
    }).join('');
}

window.showMediaBulkAddModal = function() {
    document.getElementById('bulkMediaBaseName').value = '';
    document.getElementById('bulkMediaType').value = 'ROLL';
    document.getElementById('bulkAxis1Name').value = '두께';
    document.getElementById('bulkAxis2Name').value = '색상';
    bulkAxisData = { 1: [], 2: [] };
    document.getElementById('bulkAxis1Values').innerHTML = '';
    document.getElementById('bulkAxis2Values').innerHTML = '';
    document.getElementById('bulkAxis1NewVal').value = '';
    document.getElementById('bulkAxis2NewVal').value = '';
    document.getElementById('bulkMatrixPrice').checked = false;
    document.getElementById('bulkPreview').classList.add('hidden');
    var sheetArea = document.getElementById('bulkSheetSizesArea');
    if (sheetArea) sheetArea.classList.add('hidden');
    var sheetSizes = document.getElementById('bulkSheetSizes');
    if (sheetSizes) sheetSizes.innerHTML = '';
    bulkRollWidthsData = [];
    var rollWidths = document.getElementById('bulkRollWidths');
    if (rollWidths) rollWidths.innerHTML = '';
    var rollWidthNew = document.getElementById('bulkRollWidthNewVal');
    if (rollWidthNew) rollWidthNew.value = '';
    var rmWidthsArea = document.getElementById('bulkRollWidthsArea');
    if (rmWidthsArea) rmWidthsArea.classList.remove('hidden');
    var sheetRMCheck = document.getElementById('bulkSheetRMAutoCheck');
    if (sheetRMCheck) sheetRMCheck.checked = true;
    renderMethodCheckboxes('bulkMediaMethodCheckboxes', []);
    renderBulkPriceTable();
    document.getElementById('mediaBulkAddModal').classList.remove('hidden');
};

window.closeMediaBulkAddModal = function() {
    document.getElementById('mediaBulkAddModal').classList.add('hidden');
};

window.onBulkMediaTypeChange = function() {
    var type = document.getElementById('bulkMediaType').value;
    var sheetArea = document.getElementById('bulkSheetSizesArea');
    var rmWidthsArea = document.getElementById('bulkRollWidthsArea');
    if (type === 'SHEET') {
        if (sheetArea) sheetArea.classList.remove('hidden');
        if (rmWidthsArea) rmWidthsArea.classList.add('hidden');
        if (document.getElementById('bulkSheetSizes').children.length === 0) addBulkSheetSize();
    } else {
        if (sheetArea) sheetArea.classList.add('hidden');
        if (rmWidthsArea) rmWidthsArea.classList.remove('hidden');
    }
};

window.addBulkSheetSize = function() {
    var container = document.getElementById('bulkSheetSizes');
    var div = document.createElement('div');
    div.className = 'flex gap-1 items-center';
    div.innerHTML = '<input type="number" class="bulk-sheet-w w-20 px-2 py-1 border rounded text-sm" placeholder="가로cm">'
        + '<span class="text-gray-400">×</span>'
        + '<input type="number" class="bulk-sheet-h w-20 px-2 py-1 border rounded text-sm" placeholder="세로cm">'
        + '<span class="text-xs text-gray-400">cm</span>'
        + '<button type="button" onclick="this.parentElement.remove()" class="text-gray-400 hover:text-red-500 text-xs ml-1"><i class="fas fa-times"></i></button>';
    container.appendChild(div);
};

window.addBulkAxisValue = function(axisNum) {
    var input = document.getElementById('bulkAxis' + axisNum + 'NewVal');
    var val = input.value.trim();
    if (!val) return;
    if (bulkAxisData[axisNum].includes(val)) { showToast('이미 추가된 값입니다.', 'warning'); return; }
    bulkAxisData[axisNum].push(val);
    input.value = '';
    renderBulkAxisTags(axisNum);
    renderBulkPriceTable();
};

function renderBulkAxisTags(axisNum) {
    var container = document.getElementById('bulkAxis' + axisNum + 'Values');
    container.innerHTML = bulkAxisData[axisNum].map(function(v, i) {
        return '<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">'
            + escapeHtml(v)
            + '<button type="button" onclick="removeBulkAxisValue(' + axisNum + ',' + i + ')" class="text-blue-400 hover:text-red-500">&times;</button></span>';
    }).join('');
}

window.removeBulkAxisValue = function(axisNum, idx) {
    bulkAxisData[axisNum].splice(idx, 1);
    renderBulkAxisTags(axisNum);
    renderBulkPriceTable();
};

window.renderBulkPriceTable = function() {
    var axis1 = bulkAxisData[1];
    if (axis1.length === 0) {
        // 축 없음 → 단일 단가 입력
        document.getElementById('bulkPriceTable').innerHTML = '<div class="flex items-center gap-2"><span class="text-xs font-medium">단가:</span><input type="number" data-price-key="__default__" class="bulk-price-input w-28 px-2 py-1 border rounded text-sm text-right" value="0" placeholder="원/㎡"></div>';
        return;
    }
    var isMatrix = document.getElementById('bulkMatrixPrice').checked;
    var axis2 = bulkAxisData[2];
    var html = '';

    if (!isMatrix || axis2.length === 0) {
        // 축1별 단가만
        html = '<div class="space-y-1">';
        axis1.forEach(function(v) {
            html += '<div class="flex items-center gap-2">'
                + '<span class="w-20 text-xs font-medium">' + escapeHtml(v) + '</span>'
                + '<input type="number" data-price-key="' + escapeHtml(v) + '" class="bulk-price-input w-28 px-2 py-1 border rounded text-sm text-right" value="0" placeholder="원/㎡">'
                + '</div>';
        });
        html += '</div>';
    } else {
        // 매트릭스: 축1 × 축2
        html = '<table class="text-xs w-full"><thead><tr><th class="p-1 text-left"></th>';
        axis2.forEach(function(c) { html += '<th class="p-1 text-center">' + escapeHtml(c) + '</th>'; });
        html += '</tr></thead><tbody>';
        axis1.forEach(function(r) {
            html += '<tr><td class="p-1 font-medium">' + escapeHtml(r) + '</td>';
            axis2.forEach(function(c) {
                var key = r + '_' + c;
                html += '<td class="p-1"><input type="number" data-price-key="' + escapeHtml(key) + '" class="bulk-price-input w-full px-1 py-0.5 border rounded text-right text-xs" value="0"></td>';
            });
            html += '</tr>';
        });
        html += '</tbody></table>';
    }
    document.getElementById('bulkPriceTable').innerHTML = html;
};

window.previewBulkMedia = function() {
    var baseName = document.getElementById('bulkMediaBaseName').value.trim();
    var axis1 = bulkAxisData[1];
    var axis2 = bulkAxisData[2];
    if (!baseName) { showToast('기본 소재명을 입력하세요.', 'warning'); return; }

    var combos = [];
    if (axis2.length > 0) {
        axis1.forEach(function(a) { axis2.forEach(function(b) { combos.push(a + ' ' + b); }); });
    } else {
        axis1.forEach(function(a) { combos.push(a); });
    }

    var methodIds = getSelectedMethodIds('bulkMediaMethodCheckboxes');
    var itemCount = combos.length * (methodIds.length || 1);
    var html = '<div class="text-gray-600 mb-1">소재 ' + combos.length + '건 + 품목 ' + itemCount + '건 생성 예정</div>';
    html += combos.map(function(c) { return '<div class="text-gray-500">· ' + escapeHtml(baseName) + ' ' + escapeHtml(c) + '</div>'; }).join('');

    document.getElementById('bulkPreviewContent').innerHTML = html;
    document.getElementById('bulkPreview').classList.remove('hidden');
};

window.saveBulkMedia = async function() {
    var baseName = document.getElementById('bulkMediaBaseName').value.trim();
    var mediaType = document.getElementById('bulkMediaType').value;
    if (!baseName) { showToast('기본 소재명을 입력해주세요.', 'warning'); return; }

    var axis1 = bulkAxisData[1];
    // 축 없이 단일 소재 등록도 허용

    var axis2 = bulkAxisData[2];
    var isMatrix = document.getElementById('bulkMatrixPrice').checked && axis2.length > 0;

    // 단가 수집
    var priceValues = {};
    document.querySelectorAll('.bulk-price-input').forEach(function(inp) {
        priceValues[inp.dataset.priceKey] = parseFloat(inp.value) || 0;
    });

    // 축 구성 (축 없으면 빈 배열 → 백엔드에서 단일 소재 생성)
    var axes = [];
    if (axis1.length > 0) {
        axes.push({ name: document.getElementById('bulkAxis1Name').value.trim() || '규격', values: axis1 });
        if (axis2.length > 0) {
            axes.push({ name: document.getElementById('bulkAxis2Name').value.trim() || '속성', values: axis2 });
        }
    }

    // 축 없을 때 default_price
    var defaultPrice = priceValues['__default__'] || 0;

    // 판재 규격 수집
    var sheetSizes = [];
    if (mediaType === 'SHEET') {
        document.querySelectorAll('#bulkSheetSizes > div').forEach(function(row) {
            var w = parseFloat(row.querySelector('.bulk-sheet-w').value) || 0;
            var h = parseFloat(row.querySelector('.bulk-sheet-h').value) || 0;
            if (w > 0 && h > 0) sheetSizes.push({ w: w, h: h });
        });
    }
    var rollWidth = null; // 롤 폭은 RM 폭 목록으로 관리 (단일 입력 제거됨)

    var methodIds = getSelectedMethodIds('bulkMediaMethodCheckboxes');

    // 예상 생성 수
    var comboCount = axis1.length > 0 ? axis1.length * (axis2.length || 1) : 1;
    if (!(await showConfirm('소재 ' + comboCount + '건을 생성하시겠습니까?'))) return;

    try {
        var requestData = {
            base_name: baseName,
            media_type: mediaType,
            axes: axes.length > 0 ? axes : undefined,
            default_price: defaultPrice,
            prices: axes.length > 0 ? { type: isMatrix ? 'matrix' : 'by_first_axis', values: priceValues } : undefined,
            sheet_sizes: sheetSizes.length > 0 ? sheetSizes : null,
            roll_width_cm: rollWidth,
            method_ids: methodIds,
            rm_widths: mediaType === 'ROLL' ? (bulkRollWidthsData.length > 0 ? bulkRollWidthsData : null) : null,
            rm_auto: mediaType === 'SHEET' ? (document.getElementById('bulkSheetRMAutoCheck') ? document.getElementById('bulkSheetRMAutoCheck').checked : false) : false,
            rm_sub_category: mediaType === 'ROLL' ? '원단류' : '판재류'
        };
        var res = await axios.post('/api/print-system/media/bulk', requestData);
        if (res.data.success) {
            var d = res.data.data;
            var msg = '소재 ' + d.media_count + '개, 품목 ' + d.item_count + '개';
            if (d.rm_count > 0) msg += ', 원자재 ' + d.rm_count + '개';
            showToast(msg + ' 생성 완료', 'success');
            closeMediaBulkAddModal();
            loadPrintMedia();
        }
    } catch (err) {
        showToast('일괄 생성 실패: ' + (err.response?.data?.error || err.message), 'error');
    }
};

// 그룹 단가 조정 모달
window.showGroupPriceModal = function(groupName) {
    document.getElementById('groupPriceName').value = groupName;
    document.getElementById('groupPriceTitle').textContent = '"' + groupName + '" 단가 조정';
    document.getElementById('groupPriceAdjustType').value = 'PERCENT';
    document.getElementById('groupPriceValue').value = '0';
    document.getElementById('groupPricePreview').classList.add('hidden');
    document.getElementById('groupPriceModal').classList.remove('hidden');
    previewGroupPrice();
};

window.closeGroupPriceModal = function() {
    document.getElementById('groupPriceModal').classList.add('hidden');
};

window.previewGroupPrice = function() {
    var groupName = document.getElementById('groupPriceName').value;
    var adjustType = document.getElementById('groupPriceAdjustType').value;
    var value = parseFloat(document.getElementById('groupPriceValue').value) || 0;
    var previewEl = document.getElementById('groupPricePreview');

    if (value === 0) { previewEl.classList.add('hidden'); return; }

    // 캐시에서 그룹 소재 찾기
    var items = (cachedPrintMediaData && cachedPrintMediaData.groups && cachedPrintMediaData.groups[groupName]) || [];
    if (items.length === 0) { previewEl.classList.add('hidden'); return; }

    var html = '<table class="w-full text-xs"><thead><tr class="text-gray-500"><th class="text-left pb-1">소재</th><th class="text-right pb-1">현재</th><th class="text-right pb-1">변경후</th></tr></thead><tbody>';
    items.forEach(function(m) {
        var oldP = m.price_per_unit || 0;
        var newP = adjustType === 'PERCENT' ? Math.round(oldP * (1 + value / 100)) : oldP + value;
        if (newP < 0) newP = 0;
        html += '<tr class="border-t"><td class="py-1">' + escapeHtml(m.name) + '</td>'
            + '<td class="py-1 text-right">' + oldP.toLocaleString() + '</td>'
            + '<td class="py-1 text-right font-medium ' + (newP > oldP ? 'text-red-600' : newP < oldP ? 'text-blue-600' : '') + '">' + newP.toLocaleString() + '</td></tr>';
    });
    html += '</tbody></table>';
    previewEl.innerHTML = html;
    previewEl.classList.remove('hidden');
};

window.applyGroupPrice = async function() {
    var groupName = document.getElementById('groupPriceName').value;
    var adjustType = document.getElementById('groupPriceAdjustType').value;
    var value = parseFloat(document.getElementById('groupPriceValue').value) || 0;

    if (value === 0) { showToast('조정 값을 입력해주세요.', 'warning'); return; }

    if (!(await showConfirm('"' + groupName + '" 그룹의 단가를 ' + (adjustType === 'PERCENT' ? value + '%' : value.toLocaleString() + '원') + ' 조정하시겠습니까?'))) return;

    try {
        var res = await axios.patch('/api/print-system/media/group/' + encodeURIComponent(groupName) + '/price', {
            adjust_type: adjustType,
            value: value
        });
        if (res.data.success) {
            showToast(res.data.data.updated_count + '개 소재 단가 조정 완료', 'success');
            closeGroupPriceModal();
            loadPrintMedia();
        }
    } catch (err) {
        showToast('단가 조정 실패: ' + (err.response?.data?.error || err.message), 'error');
    }
};

// ── 이벤트 리스너 ──────────────────────────────────────────

// Enter 키 검색 지원
var itemSearchEl = document.getElementById('itemSearch');
if (itemSearchEl) {
    itemSearchEl.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && typeof window.applyFilters === 'function') window.applyFilters();
    });
}

// 새 그룹명 입력 시 hidden input 동기화 + 멤버 미리보기
var newGroupInput = document.getElementById('itemGroupNew');
if (newGroupInput) {
    newGroupInput.addEventListener('input', function() {
        document.getElementById('itemGroup').value = this.value.trim();
        showGroupMembers();
    });
}

// 재료 검색 드롭다운 숨김 (외부 클릭 시)
document.addEventListener('click', function(e) {
    var dropdown = document.getElementById('materialSearchDropdown');
    var searchField = document.getElementById('materialSearch');
    if (dropdown && !dropdown.contains(e.target) && e.target !== searchField) {
        dropdown.classList.add('hidden');
    }
});

// 원단 검색 Enter 키 지원
var materialSearchInput = document.getElementById('materialSearch');
if (materialSearchInput) {
    materialSearchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            showMaterialSearchDropdown();
        }
    });
}

// ── 품목 복사 ──────────────────────────────────────────────

// copyItem 제거됨 — UI에 복사 버튼 없음

// ── 일괄 등록 ──────────────────────────────────────────────

function showBulkModal() {
    document.getElementById('bulkItemName').value = '';
    document.getElementById('bulkUnit').value = 'YD';
    document.getElementById('bulkPrice').value = fmtMoneyInput(0);

    // 카테고리 드롭다운 채우기
    var bulkCatSel = document.getElementById('bulkCategory');
    var mainCatSel = document.getElementById('itemCategoryFilter');
    bulkCatSel.innerHTML = '<option value="">선택...</option>';
    Array.from(mainCatSel.options).forEach(function(opt) {
        if (opt.value) bulkCatSel.appendChild(new Option(opt.text, opt.value));
    });

    // 폭 입력란 초기화 (3개)
    var container = document.getElementById('bulkWidthList');
    container.innerHTML = '';
    for (var i = 0; i < 3; i++) {
        addBulkWidthRow();
    }

    document.getElementById('bulkItemPreview').classList.add('hidden');
    document.getElementById('bulkModal').classList.remove('hidden');
}

function closeBulkModal() {
    document.getElementById('bulkModal').classList.add('hidden');
}

function addBulkWidthRow() {
    var container = document.getElementById('bulkWidthList');
    var div = document.createElement('div');
    div.className = 'flex gap-2 items-center';
    div.innerHTML = '<input type="number" class="bulk-width-input flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="예: 914">' +
        '<span class="text-xs text-gray-400">mm</span>' +
        '<button type="button" onclick="this.parentElement.remove(); updateBulkPreview();" class="text-gray-400 hover:text-red-500 text-sm"><i class="fas fa-times"></i></button>';
    container.appendChild(div);

    // 입력 시 미리보기 업데이트
    div.querySelector('input').addEventListener('input', updateBulkPreview);
}

function updateBulkPreview() {
    var name = document.getElementById('bulkItemName').value.trim();
    var inputs = document.querySelectorAll('.bulk-width-input');
    var widths = [];
    inputs.forEach(function(inp) {
        var v = parseInt(inp.value);
        if (v > 0) widths.push(v);
    });

    var preview = document.getElementById('bulkItemPreview');
    if (!preview) return;
    if (!name || widths.length === 0) {
        preview.classList.add('hidden');
        return;
    }

    var html = '<span class="font-medium">생성될 품목 (' + widths.length + '개):</span><br>';
    html += widths.map(function(w) { return '• ' + name + ' (규격: ' + w + 'mm)'; }).join('<br>');
    html += '<br><span class="text-gray-400">그룹: "' + name + '"으로 자동 묶임</span>';
    preview.innerHTML = html;
    preview.classList.remove('hidden');
}

async function saveBulkItems() {
    var name = document.getElementById('bulkItemName').value.trim();
    var category = document.getElementById('bulkCategory').value;
    var unit = document.getElementById('bulkUnit').value || 'YD';
    var price = readMoney('bulkPrice');

    if (!name) { showToast('품목명을 입력해주세요.', 'warning'); return; }
    if (!category) { showToast('대분류를 선택해주세요.', 'warning'); return; }

    var inputs = document.querySelectorAll('.bulk-width-input');
    var widths = [];
    inputs.forEach(function(inp) {
        var v = parseInt(inp.value);
        if (v > 0) widths.push(v);
    });

    if (widths.length === 0) { showToast('원단 폭을 하나 이상 입력해주세요.', 'warning'); return; }

    if (!(await showConfirm(widths.length + '개 품목을 생성하시겠습니까?\n\n' + widths.map(function(w) { return name + ' (규격: ' + w + 'mm)'; }).join('\n')))) {
        return;
    }

    try {
        var res = await axios.post('/api/items/bulk', {
            base: {
                item_name: name,
                category: category,
                unit: unit,
                base_price: price,
                item_type: 'MATERIAL',
                item_group: name
            },
            widths: widths
        });
        if (res.data.success) {
            showToast(res.data.message, 'warning');
            closeBulkModal();
            loadItems();
        }
    } catch (error) {
        showToast('일괄 생성 실패: ' + (error.response?.data?.error || error.message), 'error');
    }
}

// 품목명 입력 시 미리보기 업데이트
var bulkNameInput = document.getElementById('bulkItemName');
if (bulkNameInput) {
    bulkNameInput.addEventListener('input', updateBulkPreview);
}

// ── 창고 구역 드롭다운 로드 ──
var _storageZonesCache = null;
async function loadStorageZonesForItem() {
    try {
        var res = await axios.get('/api/storage-zones');
        if (res.data.success) {
            _storageZonesCache = res.data.data || [];
            var sel = document.getElementById('itemStorageZone');
            if (sel) {
                sel.innerHTML = '<option value="">미지정</option>'
                    + _storageZonesCache.map(function(z) {
                        return '<option value="' + z.id + '">' + z.zone_name
                            + (z.manager_name ? ' (' + z.manager_name + ')' : '') + '</option>';
                    }).join('');
            }
        }
    } catch (e) { console.warn('창고 구역 로드 실패:', e); }
}

// ═══════════════════════════════════════════════════════
// 전역 함수 등록 (onclick 핸들러에서 접근 가능하도록)
// ═══════════════════════════════════════════════════════
window.editItem = editItem;
window.deleteItem = deleteItem;
window.showCreateModal = showCreateModal;
window.closeModal = closeModal;
window.saveItem = saveItem;
window.selectItemType = selectItemType;
window.switchModalTab = switchModalTab;
window.showBulkModal = showBulkModal;
window.closeBulkModal = closeBulkModal;
window.addBulkWidthRow = addBulkWidthRow;
window.updateBulkPreview = updateBulkPreview;
window.saveBulkItems = saveBulkItems;
window.showGroupEditModal = showGroupEditModal;
window.closeGroupEditModal = closeGroupEditModal;
window.saveGroupEdit = saveGroupEdit;
window.toggleGroupField = toggleGroupField;
// applyFilters 제거됨 (tabItems 삭제)
window.updatePricingLabel = updatePricingLabel;
window.loadItems = loadItems;
window.changeMaterialSort = changeMaterialSort;
window.toggleMaterialGroup = toggleMaterialGroup;
window.addMaterialMapping = addMaterialMapping;
window.addMaterialGroupMapping = addMaterialGroupMapping;
window.removeMaterialMapping = removeMaterialMapping;
window.removeMaterialGroupMapping = removeMaterialGroupMapping;
window.showGroupMembers = showGroupMembers;

// ── 단가 이력 조회 ──

window.showPriceHistory = function(targetType, targetId) {
    var modal = document.getElementById('priceHistoryModal');
    var body = document.getElementById('priceHistoryBody');
    if (!modal || !body) return;

    body.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">로딩 중...</p>';
    modal.classList.remove('hidden');

    axios.get('/api/print-system/price-history?target_type=' + targetType + '&target_id=' + targetId + '&limit=20')
        .then(function(res) {
            var history = res.data.data || [];
            if (!history.length) {
                body.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">변경 이력이 없습니다.</p>';
                return;
            }
            var title = history[0].target_name || (targetType + ' #' + targetId);
            document.getElementById('priceHistoryTitle').textContent = title + ' 단가 이력';

            var html = '<table class="w-full text-sm"><thead><tr class="text-left text-gray-500 text-xs">'
                + '<th class="pb-2">변경일</th><th class="pb-2 text-right">이전 단가</th>'
                + '<th class="pb-2 text-right">변경 단가</th><th class="pb-2">변경자</th></tr></thead><tbody>';
            history.forEach(function(h) {
                var date = h.changed_at ? h.changed_at.substring(0, 10) : '';
                var diff = (h.new_price || 0) - (h.old_price || 0);
                var diffClass = diff > 0 ? 'text-red-500' : diff < 0 ? 'text-blue-500' : 'text-gray-400';
                var diffSign = diff > 0 ? '+' : '';
                html += '<tr class="border-t">'
                    + '<td class="py-1.5 text-gray-600">' + date + '</td>'
                    + '<td class="py-1.5 text-right tabular-nums">' + (h.old_price || 0).toLocaleString() + '</td>'
                    + '<td class="py-1.5 text-right tabular-nums font-medium">' + (h.new_price || 0).toLocaleString()
                    + ' <span class="text-xs ' + diffClass + '">(' + diffSign + diff.toLocaleString() + ')</span></td>'
                    + '<td class="py-1.5 text-gray-500 text-xs">' + (h.changed_by_name || '') + '</td>'
                    + '</tr>';
            });
            html += '</tbody></table>';
            body.innerHTML = html;
        })
        .catch(function() {
            body.innerHTML = '<p class="text-red-500 text-sm text-center py-4">이력 로드 실패</p>';
        });
};

window.closePriceHistoryModal = function() {
    document.getElementById('priceHistoryModal').classList.add('hidden');
};

// 초기 로딩
loadCategories();
loadStorageZonesForItem();
// 출력 탭이 기본
switchMainTab('output');
