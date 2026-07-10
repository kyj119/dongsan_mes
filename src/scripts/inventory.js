var currentPage = 1;
var totalPages = 1;
var allItems = [];

// MU2: 다단위 표시 — 단일단위면 "X unit", 다단위면 "N통 (X L)" 등 환산 병기.
function uomFmt(qty, item) {
  if (window.uomFormatStock) return window.uomFormatStock(qty, item);
  return (Math.round((Number(qty) || 0) * 100) / 100) + ' ' + (item && item.unit ? item.unit : '');
}

// MU4: 입력 단위 선택 — value 'unit'=관리단위(×pack_size 환산), 'base'=차감·저장단위(그대로). 단일단위=고정.
function invUomRenderUnitSelect(selectId, item) {
  var sel = document.getElementById(selectId);
  if (!sel) { console.warn('[inventory] #' + selectId + ' not found'); return; }
  var multi = item && window.uomIsMulti && window.uomIsMulti(item);
  if (!multi) {
    sel.innerHTML = '<option value="base">' + escapeHtml((item && item.unit) || '-') + '</option>';
    sel.disabled = true;
    return;
  }
  sel.innerHTML = '<option value="unit">' + escapeHtml(item.unit) + '</option>'
    + '<option value="base">' + escapeHtml(item.base_unit) + '</option>';
  sel.disabled = false;
  sel.value = (item.stock_mode === 'PACK') ? 'unit' : 'base'; // formatStock 표시 우선순위와 동일한 기본값
}

// MU4: 입력값(선택 단위) → base 수량 (API는 항상 base로 받음)
function invUomInputToBase(qty, selectId, item) {
  var sel = document.getElementById(selectId);
  if (sel && sel.value === 'unit' && item && window.uomToBase) return window.uomToBase(qty, item);
  return qty;
}

// MU4: 환산 힌트 — 다단위일 때 반대 단위 병기 ("= 40 L")
function invUomUpdateHint(hintId, qtyInputId, selectId, item) {
  var el = document.getElementById(hintId);
  if (!el) return;
  var input = document.getElementById(qtyInputId);
  var qty = input ? parseFloat(input.value) : NaN;
  var multi = item && window.uomIsMulti && window.uomIsMulti(item);
  if (!multi || !qty) { el.textContent = ''; return; }
  var r2 = function(n) { return Math.round((Number(n) || 0) * 100) / 100; };
  var sel = document.getElementById(selectId);
  if (sel && sel.value === 'unit') {
    el.textContent = '= ' + r2(window.uomToBase(qty, item)) + ' ' + (item.base_unit || '');
  } else {
    el.textContent = '= ' + r2(window.uomFromBase(qty, item)) + ' ' + (item.unit || '');
  }
}

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

        // #421: 로딩 표시(일관 포맷) — 대용량 재고 조회 중 빈 화면 방지
        var _invTb = document.getElementById('inventoryTableBody');
        if (_invTb && window.dsSkeleton) _invTb.innerHTML = window.dsSkeleton.loadingRow(8);

        var response = await axios.get(url);
        if (response.data.success) {
            var data = response.data.data;
            allItems = data.items;
            totalPages = data.pagination.total_pages;

            renderInventoryTable(data.items, data.pagination.total);
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
function renderInventoryTable(items, total) {
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
            + '<td class="px-4 py-3 text-sm text-gray-900" title="' + escapeHtml(item.item_name) + '">' + escapeHtml(item.item_name) + '</td>'
            + '<td class="px-4 py-3 text-sm">'
            + '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700">' + escapeHtml(item.category) + '</span>'
            + '</td>'
            + '<td class="px-4 py-3 text-sm ' + stockClass + ' text-right tabular-nums" title="' + escapeHtml(uomFmt(stock, item)) + '">'
            + stockIcon + escapeHtml(uomFmt(stock, item))
            + '</td>'
            + '<td class="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">' + safety + '</td>'
            + '<td class="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">' + (rop || '-') + '</td>'
            + '<td class="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">' + (item.unit_price || 0).toLocaleString() + '원</td>'
            + '<td class="px-4 py-3 text-sm text-gray-500" title="' + escapeHtml(item.location || '') + '">' + escapeHtml(item.location || '-') + '</td>'
            + '<td class="px-4 py-3 text-center">'
            + '<div class="flex gap-1 justify-center">'
            + '<button onclick="openZoneStock(' + item.id + ',\'' + itemNameSafe + '\')" '
            + 'class="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100" title="창고별/이동">'
            + '<i class="fas fa-warehouse"></i></button>'
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

    document.getElementById('totalCount').textContent = (total != null ? total : items.length);
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
        var muItem = (allItems || []).find(function(it) { return it.id === itemId; }) || null; // MU4: 단위 표기용
        var response = await axios.get('/api/inventory/' + itemId + '/transactions?limit=50');
        if (response.data.success) {
            var transactions = response.data.data.transactions;
            var tbody = document.getElementById('transactionTableBody');
            tbody.innerHTML = '';
            transactions.forEach(function(tx) {
                // 조정 사유(adjustReason 옵션 + inventoryCount.ts STOCK_COUNT)과 통일
                var reasonLabels = { 'STOCK_COUNT': '실사 보정', 'COUNT_ERROR': '실사 차이', 'DAMAGE': '파손·불량', 'LOSS': '분실', 'FOUND': '추가 발견', 'OTHER': '기타' };
                var typeLabels = { 'IN': '입고', 'OUT': '출고', 'ADJUST': '조정', 'TRANSFER_IN': '이동입고', 'TRANSFER_OUT': '이동출고' };
                var typeColors = { 'IN': 'bg-blue-50 text-blue-700', 'OUT': 'bg-amber-50 text-amber-700', 'ADJUST': 'bg-gray-100 text-gray-700', 'TRANSFER_IN': 'bg-indigo-50 text-indigo-700', 'TRANSFER_OUT': 'bg-purple-50 text-purple-700' };
                var typeIcons = { 'IN': 'fas fa-arrow-down', 'OUT': 'fas fa-arrow-up', 'ADJUST': 'fas fa-sliders-h', 'TRANSFER_IN': 'fas fa-right-to-bracket', 'TRANSFER_OUT': 'fas fa-right-from-bracket' };
                var typeClass = typeColors[tx.transaction_type] || 'bg-gray-100 text-gray-800';
                var typeIcon = typeIcons[tx.transaction_type] || 'fas fa-circle';
                var typeText = typeLabels[tx.transaction_type] || tx.transaction_type;
                var qtyClass = tx.quantity > 0 ? 'text-blue-600' : 'text-orange-600';

                var row = document.createElement('tr');
                row.className = 'hover:bg-gray-50';
                row.innerHTML = ''
                    + '<td class="px-4 py-2 text-sm text-gray-900">' + (tx.transaction_date || '-').substring(0, 16).replace('T', ' ') + '</td>'
                    + '<td class="px-4 py-2 text-sm"><span class="inline-flex items-center px-2 py-0.5 text-xs rounded ' + typeClass + '"><i class="' + typeIcon + ' text-[7px] mr-1"></i>' + typeText + '</span></td>'
                    + '<td class="px-4 py-2 text-sm ' + qtyClass + ' text-right font-medium tabular-nums">' + (tx.quantity > 0 ? '+' : '') + escapeHtml(uomFmt(tx.quantity, muItem)) + '</td>'
                    + '<td class="px-4 py-2 text-sm text-gray-900 text-right font-medium tabular-nums">' + (tx.balance_after == null ? '-' : escapeHtml(uomFmt(tx.balance_after, muItem))) + '</td>'
                    + '<td class="px-4 py-2 text-sm text-gray-900" title="' + escapeHtml(reasonLabels[tx.reason] || tx.reason || '') + '">' + escapeHtml(reasonLabels[tx.reason] || tx.reason || '-') + '</td>'
                    + '<td class="px-4 py-2 text-sm text-gray-900" title="' + escapeHtml(tx.handled_by_name || '') + '">' + escapeHtml(tx.handled_by_name || '-') + '</td>';
                tbody.appendChild(row);
            });
            document.getElementById('transactionModal').classList.remove('hidden');
        }
    } catch (error) {
        console.error('Failed to load transactions:', error);
        showToast('거래 이력을 불러오는데 실패했습니다.', 'error');
    }
};


// 조정 드롭다운 (MU4: 다단위 환산 표기 — 기존 base수량+관리단위 라벨 오표기 수정)
function updateAdjustSelect(items) {
    var adjustSelect = document.getElementById('adjustItem');
    adjustSelect.innerHTML = '<option value="">품목 선택...</option>';
    items.forEach(function(item) {
        var option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.item_name + ' (재고: ' + uomFmt(item.current_stock || 0, item) + ')';
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

// ===== 기본창고 일괄배정 (운영설계 B) =====
var bulkAssignBtnEl = document.getElementById('bulkAssignBtn');
if (bulkAssignBtnEl) bulkAssignBtnEl.addEventListener('click', openBulkAssign);
var cancelBulkAssignEl = document.getElementById('cancelBulkAssign');
if (cancelBulkAssignEl) cancelBulkAssignEl.addEventListener('click', function() { document.getElementById('bulkAssignModal').classList.add('hidden'); });
var submitBulkAssignEl = document.getElementById('submitBulkAssign');
if (submitBulkAssignEl) submitBulkAssignEl.addEventListener('click', submitBulkAssign);
var previewBulkAssignEl = document.getElementById('previewBulkAssign');
if (previewBulkAssignEl) previewBulkAssignEl.addEventListener('click', previewBulkAssign);
var bulkAssignZoneEl = document.getElementById('bulkAssignZone');
if (bulkAssignZoneEl) bulkAssignZoneEl.addEventListener('change', syncBulkAssignMoveStock);

// '미배정으로 환원' 선택 시 재고이동 옵션 비활성 (이동할 대상 창고가 없음)
function syncBulkAssignMoveStock() {
    var sel = document.getElementById('bulkAssignZone');
    var move = document.getElementById('bulkAssignMoveStock');
    if (!sel || !move) return;
    move.disabled = sel.value === '';
    hideBulkAssignPreview();
}

function hideBulkAssignPreview() {
    var p = document.getElementById('bulkAssignPreview');
    if (p) { p.classList.add('hidden'); p.textContent = ''; }
}

async function openBulkAssign() {
    var sel = document.getElementById('bulkAssignZone');
    if (!sel) { console.warn('[inventory] #bulkAssignZone not found'); return; }
    if (!invZoneStorageZones.length) await loadInvStorageZones();
    var opts = '<option value="">미배정으로 환원</option>';
    invZoneStorageZones.forEach(function(z) {
        var label = (z.entity_name ? z.entity_name + ' · ' : '') + (z.zone_name || z.zone_code || ('zone ' + z.id));
        opts += '<option value="' + z.id + '">' + escapeHtml(label) + '</option>';
    });
    sel.innerHTML = opts;
    document.getElementById('bulkAssignCategory').value = '';
    document.getElementById('bulkAssignName').value = '';
    document.getElementById('bulkAssignUnassignedOnly').checked = false;
    var move = document.getElementById('bulkAssignMoveStock');
    if (move) move.checked = true;
    syncBulkAssignMoveStock();
    document.getElementById('bulkAssignModal').classList.remove('hidden');
}

// 필터 검증 + 요청 body 조립 (미리보기/적용 공용). 필터 미충족 시 null.
function buildBulkAssignBody() {
    var zoneVal = document.getElementById('bulkAssignZone').value;
    var category = document.getElementById('bulkAssignCategory').value;
    var nameLike = document.getElementById('bulkAssignName').value.trim();
    var unassignedOnly = document.getElementById('bulkAssignUnassignedOnly').checked;
    var moveEl = document.getElementById('bulkAssignMoveStock');
    if (!category && !nameLike) { showToast('카테고리 또는 이름을 1개 이상 지정하세요.', 'warning'); return null; }
    var body = { zone_id: zoneVal === '' ? null : parseInt(zoneVal), only_unassigned: unassignedOnly };
    if (category) body.category = category;
    if (nameLike) body.name_like = nameLike.indexOf('%') >= 0 ? nameLike : ('%' + nameLike + '%');
    if (zoneVal !== '' && moveEl && moveEl.checked) body.move_stock = true;
    return body;
}

async function previewBulkAssign() {
    var body = buildBulkAssignBody();
    if (!body) return;
    body.dry_run = true;
    try {
        var res = await axios.post('/api/inventory/bulk-assign-zones', body);
        if (res.data.success) {
            var d = res.data.data;
            var msg = '대상 품목 ' + d.matched_items + '개';
            if (body.zone_id != null) {
                msg += ' · 이동될 미배정 재고 ' + d.movable_rows + '건';
                if (!body.move_stock) msg += ' (이동 체크 해제 — 기본창고만 변경)';
            }
            var p = document.getElementById('bulkAssignPreview');
            if (p) { p.textContent = msg; p.classList.remove('hidden'); }
        }
    } catch (e) {
        showToast('미리보기 실패: ' + (e.response?.data?.error || e.message), 'error');
    }
}

async function submitBulkAssign() {
    var body = buildBulkAssignBody();
    if (!body) return;
    try {
        var res = await axios.post('/api/inventory/bulk-assign-zones', body);
        if (res.data.success) {
            var d = res.data.data;
            var msg = d.assigned + '개 품목 배정 완료';
            if (d.moved_rows) msg += ' · 미배정 재고 ' + d.moved_rows + '건 이동';
            showToast(msg, 'success');
            hideBulkAssignPreview();
            document.getElementById('bulkAssignModal').classList.add('hidden');
            loadInventory();
        }
    } catch (e) {
        showToast('배정 실패: ' + (e.response?.data?.error || e.message), 'error');
    }
}

// ===== 창고별 재고 + 창고 간 이동 (UP3-B1) =====
var invZoneStorageZones = [];   // 현재 법인 storage_zones 캐시 (도착 창고 드롭다운)
var invZoneCurrentItem = null;  // 모달 대상 { id, name }

async function loadInvStorageZones() {
    try {
        var res = await axios.get('/api/storage-zones');
        if (res.data.success) invZoneStorageZones = res.data.data || [];
    } catch (e) { console.warn('[inventory] storage-zones 로드 실패', e); }
}

window.openZoneStock = async function(itemId, itemName) {
    var nameEl = document.getElementById('zoneStockItemName');
    var idEl = document.getElementById('zoneStockItemId');
    if (!nameEl || !idEl) { console.warn('[inventory] #zoneStockModal not found'); return; }
    invZoneCurrentItem = { id: itemId, name: itemName };
    nameEl.textContent = itemName;
    idEl.value = itemId;
    try {
        if (invZoneStorageZones.length === 0) await loadInvStorageZones();
        var res = await axios.get('/api/inventory/' + itemId);
        if (!res.data.success) return;
        invZoneCurrentItem.mu = res.data.data; // MU2: 다단위 환산용(base_unit/pack_size/stock_mode)
        renderZoneStock(res.data.data.zones || []);
        invUomRenderUnitSelect('transferUnit', invZoneCurrentItem.mu); // MU4: 이동 수량 입력 단위
        var trHint = document.getElementById('transferConvertHint');
        if (trHint) trHint.textContent = '';
        document.getElementById('zoneStockModal').classList.remove('hidden');
    } catch (e) {
        console.error('Failed to load zone stock:', e);
        showToast('창고별 재고를 불러오지 못했습니다.', 'error');
    }
};

function renderZoneStock(zones) {
    var tbody = document.getElementById('zoneStockBody');
    var fromSel = document.getElementById('transferFrom');
    var toSel = document.getElementById('transferTo');
    if (!tbody || !fromSel || !toSel) { console.warn('[inventory] zoneStock elements missing'); return; }

    // 창고별 분해 표 (NULL zone = 미배정). MU2: 수량 다단위 환산 표시.
    var mu = (invZoneCurrentItem && invZoneCurrentItem.mu) || {};
    if (zones.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="px-4 py-6 text-center text-gray-400 text-sm">재고 없음</td></tr>';
    } else {
        tbody.innerHTML = zones.map(function(z) {
            return '<tr>'
                + '<td class="px-4 py-2 text-sm text-gray-900">' + escapeHtml(z.zone_name || '미배정') + '</td>'
                + '<td class="px-4 py-2 text-sm text-right tabular-nums">' + escapeHtml(uomFmt(z.quantity, mu)) + '</td>'
                + '<td class="px-4 py-2 text-sm text-right tabular-nums text-gray-500">' + (z.safe_stock || 0) + '</td>'
                + '</tr>';
        }).join('');
    }

    // 출발 창고 = 재고 보유 창고(수량 ≠ 0). NULL zone은 value=''(서버가 미배정으로 처리)
    var fromZones = zones.filter(function(z) { return (z.quantity || 0) !== 0; });
    if (fromZones.length === 0) {
        fromSel.innerHTML = '<option value="">(재고 보유 창고 없음)</option>';
    } else {
        fromSel.innerHTML = fromZones.map(function(z) {
            var v = (z.storage_zone_id == null) ? '' : z.storage_zone_id;
            return '<option value="' + v + '">' + escapeHtml(z.zone_name || '미배정') + ' (' + escapeHtml(uomFmt(z.quantity, mu)) + ')</option>';
        }).join('');
    }

    // 도착 창고 = 미배정 + 전 창고 목록
    var opts = '<option value="">미배정</option>';
    invZoneStorageZones.forEach(function(sz) {
        opts += '<option value="' + sz.id + '">' + escapeHtml(sz.zone_name) + '</option>';
    });
    toSel.innerHTML = opts;
}

var invTransferBusy = false;  // #459: 더블클릭/중복제출 가드
window.submitInvTransfer = async function() {
    if (!invZoneCurrentItem) return;
    var fromV = document.getElementById('transferFrom').value;
    var toV = document.getElementById('transferTo').value;
    var qty = parseFloat(document.getElementById('transferQty').value);
    var notes = document.getElementById('transferNotes').value;
    if (!qty || qty <= 0) { showToast('이동 수량을 입력해주세요.', 'warning'); return; }
    if ((fromV || '') === (toV || '')) { showToast('출발 창고와 도착 창고가 같습니다.', 'warning'); return; }
    if (invTransferBusy) return;  // #459: 진행 중 중복 제출 차단 (백엔드 원자 가드와 이중 방어)
    invTransferBusy = true;
    var btn = document.querySelector('#zoneStockModal button.ds-btn-primary');
    if (btn) btn.disabled = true;
    try {
        // MU4: 입력 단위(관리단위 선택 시 ×pack_size) → base 환산 후 전송
        var trBaseQty = invUomInputToBase(qty, 'transferUnit', (invZoneCurrentItem && invZoneCurrentItem.mu) || null);
        var res = await axios.post('/api/inventory/transfer', {
            item_id: invZoneCurrentItem.id,
            from_zone_id: fromV === '' ? null : parseInt(fromV),
            to_zone_id: toV === '' ? null : parseInt(toV),
            quantity: trBaseQty,
            notes: notes
        });
        if (res.data.success) {
            showToast('창고 이동 완료', 'success');
            document.getElementById('transferQty').value = '';
            document.getElementById('transferNotes').value = '';
            openZoneStock(invZoneCurrentItem.id, invZoneCurrentItem.name); // 분해 새로고침
            loadInventory();
        }
    } catch (e) {
        console.error('Transfer failed:', e);
        showToast('이동 실패: ' + (e.response?.data?.error || e.message), 'error');
    } finally {
        invTransferBusy = false;
        if (btn) btn.disabled = false;
    }
};

// ===== Modal handlers =====
document.getElementById('closeModal').addEventListener('click', function() {
    document.getElementById('transactionModal').classList.add('hidden');
});

// 입고/출고 모달 제거됨 — /receiving 페이지에서 처리

// Adjustment modal
var invAdjustCurrentItem = null; // MU4: 선택 품목 (다단위 환산·현재고 표시용)
document.getElementById('adjustmentBtn').addEventListener('click', function() {
    document.getElementById('adjustDate').valueAsDate = new Date();
    document.getElementById('adjustItem').value = '';
    invAdjustCurrentItem = null;
    document.getElementById('adjustCurrentStock').textContent = '-';
    document.getElementById('adjustQuantity').value = '';
    document.getElementById('adjustReason').value = '';
    document.getElementById('adjustNotes').value = '';
    invUomRenderUnitSelect('adjustUnit', null);
    var adjHint = document.getElementById('adjustConvertHint');
    if (adjHint) adjHint.textContent = '';
    document.getElementById('adjustmentModal').classList.remove('hidden');
});
document.getElementById('cancelAdjust').addEventListener('click', function() {
    document.getElementById('adjustmentModal').classList.add('hidden');
});

// Update current stock when adjustment item is selected (MU4: uomFmt + 단위 select 갱신)
document.getElementById('adjustItem').addEventListener('change', function() {
    var id = parseInt(this.value, 10);
    invAdjustCurrentItem = (allItems || []).find(function(it) { return it.id === id; }) || null;
    document.getElementById('adjustCurrentStock').textContent = invAdjustCurrentItem
        ? uomFmt(invAdjustCurrentItem.current_stock || 0, invAdjustCurrentItem) : '-';
    invUomRenderUnitSelect('adjustUnit', invAdjustCurrentItem);
    invUomUpdateHint('adjustConvertHint', 'adjustQuantity', 'adjustUnit', invAdjustCurrentItem);
});
document.getElementById('adjustQuantity').addEventListener('input', function() {
    invUomUpdateHint('adjustConvertHint', 'adjustQuantity', 'adjustUnit', invAdjustCurrentItem);
});
var invAdjUnitSel = document.getElementById('adjustUnit');
if (invAdjUnitSel) invAdjUnitSel.addEventListener('change', function() {
    invUomUpdateHint('adjustConvertHint', 'adjustQuantity', 'adjustUnit', invAdjustCurrentItem);
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
        // MU4: 입력 단위(관리단위 선택 시 ×pack_size) → base 환산 후 전송 (API·inventory.quantity=base)
        var adjBaseQty = invUomInputToBase(parseFloat(adjustQty), 'adjustUnit', invAdjustCurrentItem);
        var response = await axios.post('/api/inventory/adjustments', {
            item_id: parseInt(itemId),
            adjustment_date: adjustDate,
            adjustment_quantity: adjBaseQty,
            reason: reason,
            notes: notes
        });
        if (response.data.success) {
            showToast('재고 조정 완료 (조정 전: ' + uomFmt(response.data.data.quantity_before, invAdjustCurrentItem) + ' → 조정 후: ' + uomFmt(response.data.data.quantity_after, invAdjustCurrentItem) + ')', 'success');
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

// MU4: 이동 수량 환산 힌트
var invTrQtyInput = document.getElementById('transferQty');
if (invTrQtyInput) invTrQtyInput.addEventListener('input', function() {
    invUomUpdateHint('transferConvertHint', 'transferQty', 'transferUnit', (invZoneCurrentItem && invZoneCurrentItem.mu) || null);
});
var invTrUnitSel = document.getElementById('transferUnit');
if (invTrUnitSel) invTrUnitSel.addEventListener('change', function() {
    invUomUpdateHint('transferConvertHint', 'transferQty', 'transferUnit', (invZoneCurrentItem && invZoneCurrentItem.mu) || null);
});

// Close modals on backdrop click
['transactionModal', 'adjustmentModal', 'settingsModal', 'zoneStockModal'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function(e) {
        if (e.target === this) this.classList.add('hidden');
    });
});

// Initial load
loadStats();
loadCategories();
loadInventory();
