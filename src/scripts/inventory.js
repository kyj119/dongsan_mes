var currentPage = 1;
var totalPages = 1;
var allItems = [];

// Load statistics
async function loadStats() {
    try {
        var response = await axios.get('/api/inventory/stats/summary');
        if (response.data.success) {
            var d = response.data.data;
            var lowEl = document.getElementById('lowStockItems');
            if (lowEl) lowEl.textContent = d.low_stock_items;
        }
        // 로스율 + 마지막 실사일 로드
        var countRes = await axios.get('/api/inventory-counts?limit=1&status=APPROVED');
        if (countRes.data.success && countRes.data.data.length > 0) {
            var lastCount = countRes.data.data[0];
            var dateEl = document.getElementById('lastCountDate');
            if (dateEl) dateEl.textContent = lastCount.count_date || '-';
            // 로스율 계산: 전체 차이 합 / 전체 시스템 재고 합
            var detailRes = await axios.get('/api/inventory-counts/' + lastCount.id);
            if (detailRes.data.success) {
                var items = detailRes.data.data.items || [];
                var totalSystem = 0, totalDiff = 0;
                items.forEach(function(it) {
                    totalSystem += (it.system_quantity || 0);
                    totalDiff += Math.abs(it.difference || 0);
                });
                var lossEl = document.getElementById('lossRate');
                if (lossEl) {
                    if (totalSystem > 0) {
                        lossEl.textContent = (totalDiff / totalSystem * 100).toFixed(1) + '%';
                    } else {
                        lossEl.textContent = '-';
                    }
                }
            }
        } else {
            var dateEl2 = document.getElementById('lastCountDate');
            if (dateEl2) dateEl2.textContent = '미실시';
            var lossEl2 = document.getElementById('lossRate');
            if (lossEl2) lossEl2.textContent = '-';
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Load categories for filter
async function loadCategories() {
    try {
        var response = await axios.get('/api/inventory/meta/categories');
        if (response.data.success) {
            var categoryFilter = document.getElementById('categoryFilter');
            response.data.data.categories.forEach(function(cat) {
                var option = document.createElement('option');
                option.value = cat.category;
                option.textContent = cat.category + ' (' + cat.item_count + '개)';
                categoryFilter.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Failed to load categories:', error);
    }
}

// Load inventory items
async function loadInventory() {
    try {
        var category = document.getElementById('categoryFilter').value;
        var search = document.getElementById('searchInput').value;
        var stockFilter = document.getElementById('stockFilter').value;

        var url = '/api/inventory?page=' + currentPage + '&limit=20';
        if (category) url += '&category=' + encodeURIComponent(category);
        if (search) url += '&search=' + encodeURIComponent(search);
        if (stockFilter === 'low') url += '&low_stock=true';

        var response = await axios.get(url);
        if (response.data.success) {
            var data = response.data.data;
            allItems = data.items;
            totalPages = data.pagination.total_pages;

            renderInventoryTable(data.items);
            updatePagination(data.pagination);
            updateAdjustSelect(data.items);
        }
    } catch (error) {
        console.error('Failed to load inventory:', error);
    }
}

// 입고 드롭다운: 재고 미등록 신규 품목도 포함하도록 items API에서 로딩
// loadAllPurchaseItems 제거됨 — 입고는 /receiving 페이지에서 처리

// Render inventory table with stock level highlighting
function renderInventoryTable(items) {
    var tbody = document.getElementById('inventoryTableBody');
    tbody.innerHTML = '';

    if (!items || items.length === 0) {
        var emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="8" class="text-center py-12">'
            + '<i class="fas fa-boxes text-3xl mb-3 block text-gray-300"></i>'
            + '<div class="text-sm text-gray-500 mb-1">재고 품목이 없습니다</div>'
            + '</td>';
        tbody.appendChild(emptyRow);
        document.getElementById('totalCount').textContent = '0';
        return;
    }

    items.forEach(function(item) {
        var stock = item.current_stock || 0;
        var safety = item.safety_stock || 0;
        var rop = item.reorder_point || 0;

        var rowClass = 'hover:bg-gray-50';
        var stockClass = 'text-green-600';
        var stockIcon = '';

        if (safety > 0 && stock <= safety) {
            rowClass = 'bg-red-50 hover:bg-red-50';
            stockClass = 'text-red-600 font-bold';
            stockIcon = '<i class="fas fa-exclamation-triangle text-red-500 mr-1"></i>';
        } else if (rop > 0 && stock <= rop) {
            rowClass = 'bg-orange-50 hover:bg-orange-100';
            stockClass = 'text-orange-600 font-bold';
            stockIcon = '<i class="fas fa-exclamation-circle text-orange-400 mr-1"></i>';
        }

        var itemNameSafe = escapeHtml(item.item_name).replace(/'/g, "\\'");
        var row = document.createElement('tr');
        row.className = rowClass;
        row.innerHTML = ''
            + '<td class="px-4 py-3 text-sm text-gray-900">' + escapeHtml(item.item_name) + '</td>'
            + '<td class="px-4 py-3 text-sm">'
            + '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700">' + escapeHtml(item.category) + '</span>'
            + '</td>'
            + '<td class="px-4 py-3 text-sm ' + stockClass + ' text-right tabular-nums">'
            + stockIcon + stock + ' ' + escapeHtml(item.unit || '')
            + '</td>'
            + '<td class="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">' + safety + '</td>'
            + '<td class="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">' + (rop || '-') + '</td>'
            + '<td class="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">' + (item.unit_price || 0).toLocaleString() + '원</td>'
            + '<td class="px-4 py-3 text-sm text-gray-500">' + escapeHtml(item.location || '-') + '</td>'
            + '<td class="px-4 py-3 text-center">'
            + '<div class="flex gap-1 justify-center">'
            + '<button onclick="viewTransactions(' + item.id + ',\'' + itemNameSafe + '\')" '
            + 'class="px-2 py-1 bg-green-50 text-green-700 rounded text-xs hover:bg-green-100" title="이력">'
            + '<i class="fas fa-history"></i></button>'
            + '<button onclick="openSettings(' + item.id + ',\'' + itemNameSafe + '\',' + stock + ',' + safety + ',' + rop + ')" '
            + 'class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200" title="설정">'
            + '<i class="fas fa-cog"></i></button>'
            + '</div>'
            + '</td>';
        tbody.appendChild(row);
    });

    document.getElementById('totalCount').textContent = items.length;
}

// Update pagination
function updatePagination(pagination) {
    currentPage = pagination.page;
    document.getElementById('currentPage').textContent = currentPage;
    document.getElementById('totalPages').textContent = pagination.total_pages;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === pagination.total_pages;
}

// View transactions
window.viewTransactions = async function(itemId, itemName) {
    try {
        document.getElementById('modalItemName').textContent = itemName;
        var response = await axios.get('/api/inventory/' + itemId + '/transactions?limit=50');
        if (response.data.success) {
            var transactions = response.data.data.transactions;
            var tbody = document.getElementById('transactionTableBody');
            tbody.innerHTML = '';
            transactions.forEach(function(tx) {
                var typeLabels = { 'IN': '입고', 'OUT': '출고', 'ADJUST': '조정' };
                var typeColors = { 'IN': 'bg-blue-50 text-blue-700', 'OUT': 'bg-amber-50 text-amber-700', 'ADJUST': 'bg-gray-100 text-gray-700' };
                var typeIcons = { 'IN': 'fas fa-arrow-down', 'OUT': 'fas fa-arrow-up', 'ADJUST': 'fas fa-sliders-h' };
                var typeClass = typeColors[tx.transaction_type] || 'bg-gray-100 text-gray-800';
                var typeIcon = typeIcons[tx.transaction_type] || 'fas fa-circle';
                var typeText = typeLabels[tx.transaction_type] || tx.transaction_type;
                var qtyClass = tx.quantity > 0 ? 'text-blue-600' : 'text-orange-600';

                var row = document.createElement('tr');
                row.className = 'hover:bg-gray-50';
                row.innerHTML = ''
                    + '<td class="px-4 py-2 text-sm text-gray-900">' + (tx.transaction_date || '-').substring(0, 16).replace('T', ' ') + '</td>'
                    + '<td class="px-4 py-2 text-sm"><span class="inline-flex items-center px-2 py-0.5 text-xs rounded ' + typeClass + '"><i class="' + typeIcon + ' text-[7px] mr-1"></i>' + typeText + '</span></td>'
                    + '<td class="px-4 py-2 text-sm ' + qtyClass + ' text-right font-medium tabular-nums">' + (tx.quantity > 0 ? '+' : '') + tx.quantity + '</td>'
                    + '<td class="px-4 py-2 text-sm text-gray-900 text-right font-medium tabular-nums">' + tx.balance_after + '</td>'
                    + '<td class="px-4 py-2 text-sm text-gray-900">' + escapeHtml(tx.reason || '-') + '</td>'
                    + '<td class="px-4 py-2 text-sm text-gray-900">' + escapeHtml(tx.handled_by_name || '-') + '</td>';
                tbody.appendChild(row);
            });
            document.getElementById('transactionModal').classList.remove('hidden');
        }
    } catch (error) {
        console.error('Failed to load transactions:', error);
        showToast('거래 이력을 불러오는데 실패했습니다.', 'error');
    }
};


// 조정 드롭다운
function updateAdjustSelect(items) {
    var adjustSelect = document.getElementById('adjustItem');
    adjustSelect.innerHTML = '<option value="">품목 선택...</option>';
    items.forEach(function(item) {
        var option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.item_name + ' (재고: ' + (item.current_stock || 0) + (item.unit || '') + ')';
        option.dataset.currentStock = item.current_stock || 0;
        option.dataset.unit = item.unit || '';
        adjustSelect.appendChild(option);
    });
}

// ===== Settings Modal =====
window.openSettings = function(itemId, itemName, stock, safety, rop) {
    document.getElementById('settingsItemId').value = itemId;
    document.getElementById('settingsItemName').textContent = itemName;
    document.getElementById('settingsCurrentStock').textContent = stock;
    document.getElementById('settingsSafeStock').value = safety;
    document.getElementById('settingsReorderPoint').value = rop;
    document.getElementById('settingsModal').classList.remove('hidden');
};

document.getElementById('cancelSettings').addEventListener('click', function() {
    document.getElementById('settingsModal').classList.add('hidden');
});

document.getElementById('submitSettings').addEventListener('click', async function() {
    var itemId = document.getElementById('settingsItemId').value;
    var safeStock = parseFloat(document.getElementById('settingsSafeStock').value) || 0;
    var reorderPoint = parseFloat(document.getElementById('settingsReorderPoint').value) || 0;

    try {
        var response = await axios.put('/api/inventory/' + itemId + '/settings', {
            safe_stock: safeStock,
            reorder_point: reorderPoint
        });
        if (response.data.success) {
            showToast('설정이 저장되었습니다.', 'success');
            document.getElementById('settingsModal').classList.add('hidden');
            loadInventory();
            loadStats();
        }
    } catch (error) {
        console.error('Failed to save settings:', error);
        showToast('설정 저장 실패: ' + (error.response?.data?.error || error.message), 'error');
    }
});

// ===== Modal handlers =====
document.getElementById('closeModal').addEventListener('click', function() {
    document.getElementById('transactionModal').classList.add('hidden');
});

// 입고/출고 모달 제거됨 — /receiving 페이지에서 처리

// Adjustment modal
document.getElementById('adjustmentBtn').addEventListener('click', function() {
    document.getElementById('adjustDate').valueAsDate = new Date();
    document.getElementById('adjustCurrentStock').textContent = '-';
    document.getElementById('adjustQuantity').value = '';
    document.getElementById('adjustReason').value = '';
    document.getElementById('adjustNotes').value = '';
    document.getElementById('adjustmentModal').classList.remove('hidden');
});
document.getElementById('cancelAdjust').addEventListener('click', function() {
    document.getElementById('adjustmentModal').classList.add('hidden');
});

// Update current stock when adjustment item is selected
document.getElementById('adjustItem').addEventListener('change', function() {
    var sel = this.options[this.selectedIndex];
    document.getElementById('adjustCurrentStock').textContent = sel.value
        ? (sel.dataset.currentStock + ' ' + sel.dataset.unit) : '-';
});

// 입고/출고 submit 제거됨 — /receiving 페이지에서 처리

// Submit adjustment
document.getElementById('submitAdjust').addEventListener('click', async function() {
    var itemId = document.getElementById('adjustItem').value;
    var adjustDate = document.getElementById('adjustDate').value;
    var adjustQty = document.getElementById('adjustQuantity').value;
    var reason = document.getElementById('adjustReason').value;
    var notes = document.getElementById('adjustNotes').value;

    if (!itemId || !adjustDate || !adjustQty || !reason) {
        showToast('품목, 조정일, 수량, 사유를 모두 입력해주세요.', 'warning');
        return;
    }

    try {
        var response = await axios.post('/api/inventory/adjustments', {
            item_id: parseInt(itemId),
            adjustment_date: adjustDate,
            adjustment_quantity: parseFloat(adjustQty),
            reason: reason,
            notes: notes
        });
        if (response.data.success) {
            showToast('재고 조정 완료 (조정 전: ' + response.data.data.quantity_before + ' → 조정 후: ' + response.data.data.quantity_after + ')', 'success');
            document.getElementById('adjustmentModal').classList.add('hidden');
            loadInventory();
            loadStats();
        }
    } catch (error) {
        console.error('Failed to create adjustment:', error);
        showToast('재고 조정 실패: ' + (error.response?.data?.message || error.message), 'error');
    }
});

// Search and filter
document.getElementById('searchBtn').addEventListener('click', function() {
    currentPage = 1;
    loadInventory();
});
document.getElementById('refreshBtn').addEventListener('click', function() {
    currentPage = 1;
    loadInventory();
    loadStats();
});

// Pagination
document.getElementById('prevPage').addEventListener('click', function() {
    if (currentPage > 1) { currentPage--; loadInventory(); }
});
document.getElementById('nextPage').addEventListener('click', function() {
    if (currentPage < totalPages) { currentPage++; loadInventory(); }
});

// Close modals on backdrop click
['transactionModal', 'adjustmentModal', 'settingsModal'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function(e) {
        if (e.target === this) this.classList.add('hidden');
    });
});

// Initial load
loadStats();
loadCategories();
loadInventory();
