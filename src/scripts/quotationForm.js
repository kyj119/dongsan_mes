// quotationForm.js — 견적서 등록/수정 스크립트

var itemCount = 0;
var searchTimers = {};
var editMode = null; // 수정 모드일 때 주문 ID 저장

// ── 거래처 검색 ──────────────────────────────────────────────

function handleClientEnter(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var q = document.getElementById('clientSearch').value.trim();
    if (!q) return;
    document.getElementById('clientId').value = '';
    document.getElementById('clientSearch').style.borderColor = '#0d9488';
    axios.get('/api/clients?search=' + encodeURIComponent(q) + '&limit=50')
        .then(function(res) {
            document.getElementById('clientSearch').style.borderColor = '';
            var clients = (res.data && res.data.clients) ? res.data.clients : [];
            if (clients.length === 1) {
                selectClient(clients[0].id, clients[0].client_name);
                showToast(clients[0].client_name + ' 선택됨', 'success');
            } else {
                openClientModal(q, clients);
            }
        })
        .catch(function(err) {
            document.getElementById('clientSearch').style.borderColor = '';
            console.error('Client search error:', err);
        });
}

function openClientModal(query, clients) {
    var modal = document.getElementById('clientModal');
    var listHtml = '';
    if (clients.length === 0) {
        listHtml = '<div class="text-center py-8 text-gray-400"><i class="fas fa-inbox text-2xl mb-2"></i><p>검색 결과가 없습니다.</p></div>';
    } else {
        listHtml = clients.map(function(cl) {
            var safeName = (cl.client_name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return '<div class="client-modal-row" onclick="selectClientFromModal(' + cl.id + ',\'' + safeName + '\')">'
                + '<div class="font-medium text-sm">' + (cl.client_name || '') + '</div>'
                + '<div class="text-xs text-gray-500">'
                + (cl.client_code || '')
                + (cl.business_registration_number ? ' | ' + cl.business_registration_number : '')
                + (cl.phone ? ' | ' + cl.phone : '')
                + '</div></div>';
        }).join('');
    }
    modal.innerHTML = '<div class="client-modal-overlay" onclick="closeClientModal(event)">'
        + '<div class="client-modal" onclick="event.stopPropagation()">'
        + '<div class="p-4 border-b flex items-center justify-between">'
        + '<h3 class="font-bold text-gray-800">거래처 선택</h3>'
        + '<button onclick="closeClientModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>'
        + '</div>'
        + '<div class="p-4 border-b">'
        + '<input type="text" id="modalClientSearch" value="' + (query || '').replace(/"/g, '&quot;') + '"'
        + ' placeholder="거래처명 검색 후 Enter" class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500"'
        + ' onkeydown="handleModalClientSearch(event)" autofocus>'
        + '<div class="text-xs text-gray-400 mt-1">' + (clients.length > 0 ? clients.length + '건 검색됨' : '검색 결과 없음') + '</div>'
        + '</div>'
        + '<div style="max-height:50vh; overflow-y:auto;">' + listHtml + '</div>'
        + '</div></div>';
    setTimeout(function() {
        var searchInput = document.getElementById('modalClientSearch');
        if (searchInput) { searchInput.focus(); searchInput.select(); }
    }, 100);
}

function handleModalClientSearch(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var q = document.getElementById('modalClientSearch').value.trim();
    if (!q) return;
    axios.get('/api/clients?search=' + encodeURIComponent(q) + '&limit=50')
        .then(function(res) {
            var clients = (res.data && res.data.clients) ? res.data.clients : [];
            if (clients.length === 1) {
                selectClientFromModal(clients[0].id, clients[0].client_name);
            } else {
                openClientModal(q, clients);
            }
        });
}

function selectClientFromModal(id, name) {
    selectClient(id, name);
    closeClientModal();
    showToast(name + ' 선택됨', 'success');
}

function closeClientModal(e) {
    if (e && e.target && !e.target.classList.contains('client-modal-overlay')) return;
    document.getElementById('clientModal').innerHTML = '';
}

function selectClient(id, name) {
    document.getElementById('clientId').value = id;
    document.getElementById('clientSearch').value = name;
}

// ── 품목 행 관리 ──────────────────────────────────────────────

function buildItemHtml(id) {
    return `<div class="border border-gray-200 rounded-lg p-4 mb-3 bg-gray-50" id="item-${id}">
        <input type="hidden" name="pricing_method_${id}" value="FIXED">
        <div class="flex justify-between items-center mb-3">
            <span class="font-bold text-gray-700">품목 #${id}</span>
            <button type="button" onclick="removeItem(${id})" class="text-red-400 hover:text-red-600 text-sm px-2 py-1 rounded hover:bg-red-50">
                <i class="fas fa-trash mr-1"></i>삭제
            </button>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-2">
            <div class="col-span-2 relative">
                <label class="block text-xs font-medium text-gray-600 mb-1">품목 <span class="text-red-500">*</span></label>
                <input type="hidden" name="item_id_${id}">
                <input type="hidden" name="item_unit_${id}" value="EA">
                <input type="hidden" name="category_name_${id}">
                <input type="text" name="item_search_${id}" placeholder="품목명 검색..." autocomplete="off"
                       class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500">
                <div id="item_dd_${id}" class="item-dd hidden"></div>
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">가로 (cm)</label>
                <input type="number" name="width_${id}" min="0" step="0.1" placeholder="예: 90"
                       class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" oninput="calcItem(${id})">
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">세로 (cm)</label>
                <input type="number" name="height_${id}" min="0" step="0.1" placeholder="예: 60"
                       class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" oninput="calcItem(${id})">
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">수량 <span class="text-red-500">*</span></label>
                <input type="number" name="quantity_${id}" value="1" min="1" required
                       class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" oninput="calcItem(${id})">
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">단위</label>
                <input type="text" name="unit_display_${id}" value="EA" readonly
                       class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-600">
            </div>
            <div>
                <label id="unit_price_label_${id}" class="block text-xs font-medium text-gray-600 mb-1">단가 (원)</label>
                <input type="text" inputmode="numeric" data-money name="unit_price_${id}" value="0"
                       class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" oninput="calcItem(${id})">
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">금액</label>
                <input type="text" name="amount_${id}" readonly
                       class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 font-bold text-blue-700" value="0원">
            </div>
            <div class="col-span-2">
                <label class="block text-xs font-medium text-gray-600 mb-1">내용</label>
                <input type="text" name="content_${id}" placeholder="예: 홍보용 현수막 (선택)"
                       class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            </div>
            <div class="flex items-end pb-1">
                <label class="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" name="vat_${id}" checked class="rounded border-gray-300 text-teal-600" onchange="calculateTotal()">
                    <span class="text-gray-700">부가세 포함</span>
                </label>
            </div>
        </div>
    </div>`;
}

function setupAutocomplete(id) {
    const input = document.querySelector(`[name="item_search_${id}"]`);
    const dd = document.getElementById(`item_dd_${id}`);
    const hidId = document.querySelector(`[name="item_id_${id}"]`);
    const hidUnit = document.querySelector(`[name="item_unit_${id}"]`);
    const hidCat = document.querySelector(`[name="category_name_${id}"]`);
    const unitDisp = document.querySelector(`[name="unit_display_${id}"]`);
    const priceInp = document.querySelector(`[name="unit_price_${id}"]`);

    function applyQuotItem(item) {
        hidId.value = item.id;
        input.value = item.name;
        hidUnit.value = item.unit;
        if (hidCat) hidCat.value = item.category;
        unitDisp.value = item.unit;
        priceInp.value = fmtMoneyInput(item.price);
        var pm = item.pricing_method || 'FIXED';
        var pmInp = document.querySelector('[name="pricing_method_' + id + '"]');
        if (pmInp) pmInp.value = pm;
        var wInp = document.querySelector('[name="width_' + id + '"]');
        var hInp = document.querySelector('[name="height_' + id + '"]');
        var priceLbl = document.getElementById('unit_price_label_' + id);
        if (pm === 'AREA') {
            if (wInp) { wInp.classList.add('border-purple-500'); wInp.classList.remove('border-gray-300'); }
            if (hInp) { hInp.classList.add('border-purple-500'); hInp.classList.remove('border-gray-300'); }
            if (priceLbl) priceLbl.textContent = '단가 (원/㎡)';
        } else {
            if (wInp) { wInp.classList.remove('border-purple-500'); wInp.classList.add('border-gray-300'); }
            if (hInp) { hInp.classList.remove('border-purple-500'); hInp.classList.add('border-gray-300'); }
            if (priceLbl) priceLbl.textContent = '단가 (원)';
        }
        calcItem(id);
        var clientId = document.getElementById('clientId').value;
        if (clientId && item.id) {
            axios.get('/api/prices?item_id=' + item.id + '&client_id=' + clientId + '&context=sales')
                .then(function(r) { if (r.data && r.data.suggested_price > 0) { priceInp.value = fmtMoneyInput(r.data.suggested_price); calcItem(id); } })
                .catch(function() {});
        }
    }

    input.addEventListener('input', function() {
        clearTimeout(searchTimers[id]);
        hidId.value = '';
        var q = input.value.trim();
        if (!q) return;
        searchTimers[id] = setTimeout(async function() {
            try {
                var res = await axios.get('/api/items?search=' + encodeURIComponent(q) + '&type=sales&limit=50');
                var items = res.data.data || [];
                if (items.length === 1) {
                    var it = items[0];
                    applyQuotItem({
                        id: it.id, name: it.item_name, price: it.base_price || 0,
                        unit: it.unit || 'EA', category: it.category || it.category_direct || '',
                        pricing_method: it.pricing_method || 'FIXED',
                        specification: it.specification || ''
                    });
                } else if (items.length > 1) {
                    window.openItemSearchModal({ type: 'sales', search: q, onSelect: applyQuotItem });
                }
            } catch(e) { console.error('Item search error:', e); }
        }, 300);
    });
}

function renumberDisplay() {
    document.querySelectorAll('#itemsContainer > [id^="item-"]').forEach(function(row, idx) {
        var span = row.querySelector('span.font-bold.text-gray-700');
        if (span) span.textContent = '품목 #' + (idx + 1);
    });
}

window.addItemRow = function() {
    var rows = document.querySelectorAll('#itemsContainer > [id^="item-"]');
    var maxId = 0;
    rows.forEach(function(row) {
        var id = parseInt(row.id.replace('item-', ''));
        if (id > maxId) maxId = id;
    });
    itemCount = maxId + 1;
    var wrap = document.createElement('div');
    wrap.innerHTML = buildItemHtml(itemCount);
    var newRow = wrap.firstElementChild;
    document.getElementById('itemsContainer').appendChild(newRow);
    setupAutocomplete(itemCount);
    if (window.bindMoneyInputs) window.bindMoneyInputs(newRow);
    renumberDisplay();
};

window.removeItem = function(id) {
    var el = document.getElementById('item-' + id);
    if (el) { el.remove(); renumberDisplay(); calculateTotal(); }
};

// ── 금액 계산 ──────────────────────────────────────────────

window.calcItem = function(id) {
    var qty = parseInt(document.querySelector('[name="quantity_' + id + '"]').value) || 0;
    var price = parseMoney((document.querySelector('[name="unit_price_' + id + '"]') || {}).value);
    var pmEl = document.querySelector('[name="pricing_method_' + id + '"]');
    var pm = pmEl ? pmEl.value : 'FIXED';
    var amt;
    if (pm === 'AREA') {
        var w = parseFloat((document.querySelector('[name="width_' + id + '"]') || {}).value) || 0;
        var h = parseFloat((document.querySelector('[name="height_' + id + '"]') || {}).value) || 0;
        amt = price * (w / 100) * (h / 100) * qty;
    } else {
        amt = qty * price;
    }
    var el = document.querySelector('[name="amount_' + id + '"]');
    if (el) el.value = Math.round(amt).toLocaleString() + '원';
    calculateTotal();
};

function calculateTotal() {
    var total = 0, vat = 0;
    document.querySelectorAll('#itemsContainer > [id^="item-"]').forEach(function(row) {
        var id = row.id.replace('item-', '');
        var qty = parseInt((document.querySelector('[name="quantity_' + id + '"]') || {}).value || 0);
        var price = parseMoney((document.querySelector('[name="unit_price_' + id + '"]') || {}).value);
        var pmEl = document.querySelector('[name="pricing_method_' + id + '"]');
        var pm = pmEl ? pmEl.value : 'FIXED';
        var amt;
        if (pm === 'AREA') {
            var w = parseFloat((document.querySelector('[name="width_' + id + '"]') || {}).value || 0);
            var h = parseFloat((document.querySelector('[name="height_' + id + '"]') || {}).value || 0);
            amt = price * (w / 100) * (h / 100) * qty;
        } else {
            amt = qty * price;
        }
        total += amt;
        var vatEl = document.querySelector('[name="vat_' + id + '"]');
        if (vatEl && vatEl.checked) vat += Math.round(amt * 0.1);
    });
    var discount = parseMoney((document.getElementById('discountAmount') || {}).value);
    document.getElementById('totalAmount').textContent = Math.round(total).toLocaleString();
    document.getElementById('totalVat').textContent = vat.toLocaleString();
    document.getElementById('grandTotal').textContent = Math.max(0, Math.round(total) + vat - discount).toLocaleString();
}

// ── 수정 모드 로드 ──────────────────────────────────────────────

async function loadQuotation(id) {
    try {
        var res = await axios.get('/api/orders/' + id);
        if (!res.data.success) {
            showToast('견적서 로딩 실패', 'error');
            return;
        }
        var data = res.data;
        var order = data.data || data;
        var orderItems = data.items || order.items || [];

        // 거래처
        if (order.client_id) {
            document.getElementById('clientId').value = order.client_id;
            document.getElementById('clientSearch').value = order.client_name || '';
        }

        // 유효기한
        if (order.valid_until) {
            document.getElementById('validUntil').value = order.valid_until.slice(0, 10);
        }

        // 비고
        if (document.getElementById('notes')) {
            document.getElementById('notes').value = order.notes || '';
        }

        // 할인
        if (document.getElementById('discountAmount')) {
            document.getElementById('discountAmount').value = fmtMoneyInput(order.discount_amount || 0);
        }

        // 품목 행 추가
        document.getElementById('itemsContainer').innerHTML = '';
        orderItems.forEach(function(item) {
            window.addItemRow();
            var rowId = itemCount;
            var nameEl = document.querySelector('[name="item_search_' + rowId + '"]');
            if (nameEl) nameEl.value = item.item_name || '';
            var itemIdEl = document.querySelector('[name="item_id_' + rowId + '"]');
            if (itemIdEl && item.item_id) itemIdEl.value = item.item_id;
            var catEl = document.querySelector('[name="category_name_' + rowId + '"]');
            if (catEl) catEl.value = item.category_name || '';
            var wEl = document.querySelector('[name="width_' + rowId + '"]');
            if (wEl && item.width) wEl.value = item.width;
            var hEl = document.querySelector('[name="height_' + rowId + '"]');
            if (hEl && item.height) hEl.value = item.height;
            var qEl = document.querySelector('[name="quantity_' + rowId + '"]');
            if (qEl) qEl.value = item.quantity || 1;
            var unitEl = document.querySelector('[name="unit_display_' + rowId + '"]');
            if (unitEl) unitEl.value = item.unit || 'EA';
            var unitHidEl = document.querySelector('[name="item_unit_' + rowId + '"]');
            if (unitHidEl) unitHidEl.value = item.unit || 'EA';
            var priceEl = document.querySelector('[name="unit_price_' + rowId + '"]');
            if (priceEl) priceEl.value = fmtMoneyInput(item.unit_price || 0);
            var vatEl = document.querySelector('[name="vat_' + rowId + '"]');
            if (vatEl) vatEl.checked = item.vat_included !== 0;
            var contentEl = document.querySelector('[name="content_' + rowId + '"]');
            if (contentEl) contentEl.value = item.content || '';
            var pmEl = document.querySelector('[name="pricing_method_' + rowId + '"]');
            if (pmEl) pmEl.value = item.pricing_method || 'FIXED';
            calcItem(rowId);
        });

        calculateTotal();

        // 제목 업데이트
        var titleEl = document.querySelector('.top-bar-title');
        if (titleEl) titleEl.textContent = '견적서 수정';
        document.title = '견적서 수정 - ERP+MES';

        // 저장 버튼 텍스트 변경
        var btn = document.getElementById('submitBtn');
        if (btn) btn.innerHTML = '<i class="fas fa-save mr-2"></i>수정 저장';

    } catch(err) {
        console.error('loadQuotation error:', err);
        showToast('견적서 로딩 실패: ' + (err.response && err.response.data && err.response.data.error ? err.response.data.error : err.message), 'error');
    }
}

// ── 저장/수정 제출 ──────────────────────────────────────────────

var isSubmitting = false;

document.getElementById('quotationForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    if (isSubmitting) return;

    var clientId = document.getElementById('clientId').value;
    if (!clientId) { showToast('거래처를 선택하세요.', 'warning'); return; }

    var validUntil = document.getElementById('validUntil').value;
    if (!validUntil) { showToast('유효기한을 입력하세요.', 'warning'); return; }

    var itemRows = document.querySelectorAll('#itemsContainer > [id^="item-"]');
    if (!itemRows.length) { showToast('최소 1개 이상의 품목을 추가하세요.', 'warning'); return; }

    var items = [];
    var valid = true;
    itemRows.forEach(function(row, idx) {
        if (!valid) return;
        var id = row.id.replace('item-', '');
        var itemName = (document.querySelector('[name="item_search_' + id + '"]') || {}).value;
        if (itemName) itemName = itemName.trim();
        if (!itemName) { showToast('품목 #' + (idx + 1) + ': 품목명을 입력하세요.', 'warning'); valid = false; return; }

        var wVal = (document.querySelector('[name="width_' + id + '"]') || {}).value;
        var hVal = (document.querySelector('[name="height_' + id + '"]') || {}).value;
        var pmEl = document.querySelector('[name="pricing_method_' + id + '"]');
        var pm = pmEl ? pmEl.value : 'FIXED';

        items.push({
            item_id: (function() { var v = (document.querySelector('[name="item_id_' + id + '"]') || {}).value; return v ? parseInt(v) : undefined; })(),
            item_name: itemName,
            category_name: (document.querySelector('[name="category_name_' + id + '"]') || {}).value || '',
            width: wVal ? parseFloat(wVal) : null,
            height: hVal ? parseFloat(hVal) : null,
            quantity: parseInt((document.querySelector('[name="quantity_' + id + '"]') || {}).value || 1),
            unit: (document.querySelector('[name="item_unit_' + id + '"]') || {}).value || 'EA',
            unit_price: parseMoney((document.querySelector('[name="unit_price_' + id + '"]') || {}).value),
            pricing_method: pm,
            vat_included: (document.querySelector('[name="vat_' + id + '"]') || {}).checked ? 1 : 0,
            content: (document.querySelector('[name="content_' + id + '"]') || {}).value || '',
            post_processing: '[]',
            sort_order: idx + 1
        });
    });
    if (!valid) return;

    // AREA 품목 가로/세로 미입력 경고
    var areaNoSize = items.filter(function(i) { return i.pricing_method === 'AREA' && (!i.width || !i.height); });
    if (areaNoSize.length > 0) {
        if (!(await showConfirm(areaNoSize.length + '개 면적 단위 품목의 가로/세로가 입력되지 않았습니다. 금액이 0원으로 계산됩니다. 계속하시겠습니까?'))) return;
    }

    // 단가 0원 경고
    var zeroItems = items.filter(function(i) { return i.unit_price === 0 || !i.unit_price; });
    if (zeroItems.length > 0) {
        if (!(await showConfirm(zeroItems.length + '개 품목의 단가가 0원입니다. 계속하시겠습니까?'))) return;
    }

    isSubmitting = true;
    var btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>저장 중...';

    var orderData = {
        client_id: parseInt(clientId),
        status: 'QUOTATION',
        valid_until: validUntil,
        discount_amount: parseMoney(document.getElementById('discountAmount').value),
        notes: document.getElementById('notes').value,
        items: items
    };

    try {
        var res;
        if (editMode) {
            res = await axios.patch('/api/orders/' + editMode, orderData);
        } else {
            res = await axios.post('/api/orders', orderData);
        }

        if (res.data.success) {
            var savedId = editMode ? editMode : res.data.data.id;
            showToast(editMode ? '견적서가 수정되었습니다.' : '견적서가 저장되었습니다.', 'success');
            setTimeout(function() {
                window.location.href = '/quotation/' + savedId;
            }, 800);
        } else {
            showToast((editMode ? '수정' : '저장') + ' 실패: ' + (res.data.error || '알 수 없는 오류'), 'error');
            isSubmitting = false;
            btn.disabled = false;
            btn.innerHTML = editMode
                ? '<i class="fas fa-save mr-2"></i>수정 저장'
                : '<i class="fas fa-save mr-2"></i>저장';
        }
    } catch(err) {
        showToast((editMode ? '수정' : '저장') + ' 실패: ' + ((err.response && err.response.data && err.response.data.error) ? err.response.data.error : err.message), 'error');
        isSubmitting = false;
        btn.disabled = false;
        btn.innerHTML = editMode
            ? '<i class="fas fa-save mr-2"></i>수정 저장'
            : '<i class="fas fa-save mr-2"></i>저장';
    }
});

// ── 초기화 ──────────────────────────────────────────────

document.getElementById('addItemBtn').addEventListener('click', function() {
    window.addItemRow();
});

(function init() {
    // 유효기한 기본값: 오늘 + 30일
    var d = new Date();
    d.setDate(d.getDate() + 30);
    document.getElementById('validUntil').value = d.toISOString().slice(0, 10);

    // URL에서 ID 추출 — /quotation-form 또는 /quotation-form/123
    var pathParts = window.location.pathname.split('/');
    var lastPart = pathParts[pathParts.length - 1];
    if (lastPart && /^\d+$/.test(lastPart)) {
        editMode = parseInt(lastPart);
        loadQuotation(editMode);
    } else {
        // 신규: 기본 품목 1행 추가
        window.addItemRow();
    }
})();
