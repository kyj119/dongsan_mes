var currentItemId = null;
var currentItemData = null;

var itemSearchTimer = null;
function searchItemsForPurchasePrice() {
    clearTimeout(itemSearchTimer);
    var q = document.getElementById('itemSearchInput').value.trim();
    if (q.length < 1) {
        document.getElementById('itemDropdown').classList.add('hidden');
        return;
    }
    itemSearchTimer = setTimeout(function() {
        axios.get('/api/items?search=' + encodeURIComponent(q) + '&type=purchase&limit=20').then(function(res) {
            var items = (res.data.items || res.data.data || []);
            var dd = document.getElementById('itemDropdown');
            var html = '';
            for (var i = 0; i < items.length; i++) {
                var it = items[i];
                html += '<div class="p-2 hover:bg-orange-50 cursor-pointer border-b text-sm" onclick="selectItemForPurchasePrice(' + it.id + ', \'' + it.item_name.replace(/'/g, "\\'") + '\', ' + (it.base_price || 0) + ', \'' + (it.item_code || '').replace(/'/g, "\\'") + '\')">'
                    + '<span class="font-medium">' + it.item_name + '</span>'
                    + '<span class="text-gray-400 ml-2 text-xs">' + (it.item_code || '') + '</span>'
                    + '<span class="text-gray-400 ml-2 text-xs">기본: ' + (it.base_price || 0).toLocaleString() + '원</span>'
                    + '</div>';
            }
            dd.innerHTML = html || '<div class="p-2 text-gray-400 text-sm">검색 결과 없음</div>';
            dd.classList.remove('hidden');
        }).catch(function(err) { console.error('[clientPrices] 품목 검색 실패', err); });
    }, 200);
}

function selectItemForPurchasePrice(id, name, basePrice, code) {
    currentItemId = id;
    currentItemData = { id: id, item_name: name, base_price: basePrice, item_code: code };
    document.getElementById('selectedItemId').value = id;
    document.getElementById('selectedItemName').textContent = name + ' (' + code + ')';
    document.getElementById('selectedItemBase').textContent = '기본단가: ' + (basePrice || 0).toLocaleString() + '원';
    document.getElementById('selectedItemBadge').classList.remove('hidden');
    document.getElementById('itemDropdown').classList.add('hidden');
    document.getElementById('itemSearchInput').value = '';
    document.getElementById('supplierPriceSection').classList.remove('hidden');
    loadSupplierPrices(id);
}

function clearSelectedItem() {
    currentItemId = null;
    currentItemData = null;
    document.getElementById('selectedItemBadge').classList.add('hidden');
    document.getElementById('supplierPriceSection').classList.add('hidden');
    document.getElementById('selectedItemId').value = '';
}

function loadSupplierPrices(itemId) {
    axios.get('/api/prices/item-supplier-prices?item_id=' + itemId).then(function(res) {
        var suppliers = res.data.suppliers || [];
        var body = document.getElementById('supplierPriceBody');
        var html = '';
        var minPrice = Infinity;
        for (var i = 0; i < suppliers.length; i++) {
            if (suppliers[i].price < minPrice) minPrice = suppliers[i].price;
        }
        for (var i = 0; i < suppliers.length; i++) {
            var sp = suppliers[i];
            var isLowest = sp.price === minPrice && suppliers.length > 1;
            var rowClass = isLowest ? 'bg-green-50' : '';
            var diffPct = '';
            if (sp.recent_price && sp.price) {
                var pctVal = ((sp.price - sp.recent_price) / sp.recent_price * 100).toFixed(1);
                var pctColor = pctVal > 0 ? 'text-red-600' : (pctVal < 0 ? 'text-blue-600' : 'text-gray-400');
                diffPct = '<span class="' + pctColor + '">' + (pctVal > 0 ? '+' : '') + pctVal + '%</span>';
            } else {
                diffPct = '<span class="text-gray-300">-</span>';
            }
            var lowestBadge = isLowest ? ' <span class="text-xs bg-green-200 text-green-700 px-1 rounded">최저가</span>' : '';
            html += '<tr class="border-b hover:bg-gray-50 ' + rowClass + '">'
                + '<td class="px-4 py-2 font-medium">' + sp.client_name + lowestBadge + '</td>'
                + '<td class="px-4 py-2 text-right font-bold">' + (sp.price || 0).toLocaleString() + '</td>'
                + '<td class="px-4 py-2 text-right">' + (sp.recent_price ? sp.recent_price.toLocaleString() : '<span class="text-gray-300">-</span>') + '</td>'
                + '<td class="px-4 py-2 text-gray-500">' + (sp.recent_date || '-') + '</td>'
                + '<td class="px-4 py-2 text-right">' + diffPct + '</td>'
                + '<td class="px-4 py-2 text-gray-500">' + (sp.notes || '') + '</td>'
                + '<td class="px-4 py-2 text-center">'
                + '<button onclick="editSupplierPrice(' + sp.id + ', ' + sp.client_id + ', \'' + sp.client_name.replace(/'/g, "\\'") + '\', ' + sp.price + ', \'' + (sp.notes || '').replace(/'/g, "\\'") + '\')" class="text-blue-500 hover:text-blue-700 mr-2"><i class="fas fa-edit"></i></button>'
                + '<button onclick="deleteSupplierPrice(' + sp.id + ', \'' + sp.client_name.replace(/'/g, "\\'") + '\')" class="text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>'
                + '</td></tr>';
        }
        body.innerHTML = html || '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-400">등록된 공급업체 단가가 없습니다.</td></tr>';
        document.getElementById('supplierPriceCount').textContent = suppliers.length + '개 공급업체';
    }).catch(function(e) {
        console.error(e);
    });
}

function showAddSupplierPriceModal() {
    document.getElementById('spModalId').value = '';
    document.getElementById('spModalClientId').value = '';
    document.getElementById('spModalPrice').value = '';
    document.getElementById('spModalNotes').value = '';
    document.getElementById('spSupplierSearch').value = '';
    document.getElementById('spSupplierSearchWrap').classList.remove('hidden');
    document.getElementById('spSupplierFixed').classList.add('hidden');
    document.getElementById('spModalTitle').textContent = '공급업체 단가 추가';
    document.getElementById('supplierPriceModal').classList.remove('hidden');
}

function editSupplierPrice(id, clientId, clientName, price, notes) {
    document.getElementById('spModalId').value = id;
    document.getElementById('spModalClientId').value = clientId;
    document.getElementById('spModalPrice').value = fmtMoneyInput(price);
    document.getElementById('spModalNotes').value = notes || '';
    document.getElementById('spSupplierSearchWrap').classList.add('hidden');
    document.getElementById('spSupplierFixed').classList.remove('hidden');
    document.getElementById('spSupplierName').value = clientName;
    document.getElementById('spModalTitle').textContent = '단가 수정';
    document.getElementById('supplierPriceModal').classList.remove('hidden');
}

var spSearchTimer = null;
function searchSuppliersForPrice() {
    clearTimeout(spSearchTimer);
    var q = document.getElementById('spSupplierSearch').value.trim();
    if (q.length < 1) {
        document.getElementById('spSupplierDropdown').classList.add('hidden');
        return;
    }
    spSearchTimer = setTimeout(function() {
        axios.get('/api/clients?search=' + encodeURIComponent(q) + '&client_type=PURCHASE&limit=20').then(function(res) {
            var clients = res.data.clients || [];
            var dd = document.getElementById('spSupplierDropdown');
            var html = '';
            for (var i = 0; i < clients.length; i++) {
                var cl = clients[i];
                html += '<div class="p-2 hover:bg-gray-100 cursor-pointer border-b text-sm" onclick="selectSupplierForPrice(' + cl.id + ', \'' + cl.client_name.replace(/'/g, "\\'") + '\')">'
                    + cl.client_name + '</div>';
            }
            dd.innerHTML = html || '<div class="p-2 text-gray-400 text-sm">검색 결과 없음</div>';
            dd.classList.remove('hidden');
        }).catch(function(err) { console.error('[clientPrices] 거래처 검색 실패', err); });
    }, 200);
}

function selectSupplierForPrice(id, name) {
    document.getElementById('spModalClientId').value = id;
    document.getElementById('spSupplierSearch').value = name;
    document.getElementById('spSupplierDropdown').classList.add('hidden');
}

function saveSupplierPrice() {
    var clientId = document.getElementById('spModalClientId').value;
    var price = parseMoney(document.getElementById('spModalPrice').value);
    var notes = document.getElementById('spModalNotes').value.trim();

    if (!clientId) { showToast('공급업체를 선택해주세요.', 'warning'); return; }
    if (isNaN(price) || price < 0) { showToast('단가를 입력해주세요.', 'warning'); return; }
    if (!currentItemId) { showToast('품목을 먼저 선택해주세요.', 'warning'); return; }

    axios.post('/api/prices/client-item-prices', {
        client_id: parseInt(clientId),
        item_id: parseInt(currentItemId),
        price: price,
        notes: notes || null
    }).then(function() {
        document.getElementById('supplierPriceModal').classList.add('hidden');
        loadSupplierPrices(currentItemId);
        showToast('단가가 저장되었습니다.', 'success');
    }).catch(function(e) {
        showToast('저장 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
    });
}

async function deleteSupplierPrice(id, clientName) {
    if (!(await showConfirm(clientName + ' 공급업체의 단가를 삭제하시겠습니까?', { danger: true }))) return;
    axios.delete('/api/prices/client-item-prices/' + id).then(function() {
        loadSupplierPrices(currentItemId);
        showToast('삭제되었습니다.', 'success');
    }).catch(function(e) {
        showToast('삭제 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
    });
}
