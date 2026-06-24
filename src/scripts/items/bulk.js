// items/bulk.js — 품목 대량 추가, 가격 이력, window exports, 초기 로딩 (소재 일괄·그룹가격 모달=print-system 폐기로 제거)

// (#429: 그룹 단가 조정 모달 showGroupPriceModal/closeGroupPriceModal/previewGroupPrice/applyGroupPrice 제거
//  — print-system 폐기로 트리거·loadPrintMedia 의존성 해체된 dead 블록. /api/print-system/media/group/:g/price 404 호출 제거.)

// ── 이벤트 리스너 ──────────────────────────────────────────

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
                        return '<option value="' + z.id + '">' + escapeHtml(z.zone_name || '')
                            + (z.manager_name ? ' (' + escapeHtml(z.manager_name) + ')' : '') + '</option>';
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
window.onDeductionMethodChange = onDeductionMethodChange;
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

    axios.get('/api/items/price-history?target_type=' + targetType + '&target_id=' + targetId + '&limit=20')
        .then(function(res) {
            var history = res.data.data || [];
            if (!history.length) {
                body.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">변경 이력이 없습니다.</p>';
                return;
            }
            var title = history[0].target_name || (targetType + ' #' + targetId);
            document.getElementById('priceHistoryTitle').textContent = title + ' 단가 이력';

            var html = '<table class="w-full text-sm ds-table"><thead><tr class="text-left text-gray-500 text-xs">'
                + '<th class="col-date pb-2">변경일</th><th class="col-amount pb-2 text-right">이전 단가</th>'
                + '<th class="col-amount pb-2 text-right">변경 단가</th><th class="col-name pb-2">변경자</th></tr></thead><tbody>';
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
                    + '<td class="py-1.5 text-gray-500 text-xs" title="' + escapeHtml(h.changed_by_name || '') + '">' + (h.changed_by_name || '') + '</td>'
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
// 분류 기반 탭 초기화 (item_categories 동적)
initItemTabs();
