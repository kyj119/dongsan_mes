var currentPage = 1;
var currentSearch = '';
var currentPageSize = 50;

function formatBizRegNum(el) {
    var raw = el.value.replace(/[^0-9]/g, '');
    if (raw.length > 10) raw = raw.substring(0, 10);
    var v = raw;
    if (v.length > 5) v = v.substring(0,3) + '-' + v.substring(3,5) + '-' + v.substring(5);
    else if (v.length > 3) v = v.substring(0,3) + '-' + v.substring(3);
    setValueKeepCursor(el, v);
}

function formatPhoneNum(el) {
    var raw = el.value.replace(/[^0-9]/g, '');
    if (raw.length > 11) raw = raw.substring(0, 11);
    var v = raw;
    if (v.startsWith('02')) {
        if (v.length > 6) v = v.substring(0,2) + '-' + v.substring(2, v.length-4) + '-' + v.substring(v.length-4);
        else if (v.length > 2) v = v.substring(0,2) + '-' + v.substring(2);
    } else {
        if (v.length > 7) v = v.substring(0,3) + '-' + v.substring(3, v.length-4) + '-' + v.substring(v.length-4);
        else if (v.length > 3) v = v.substring(0,3) + '-' + v.substring(3);
    }
    setValueKeepCursor(el, v);
}

function setValueKeepCursor(el, newVal) {
    var oldVal = el.value;
    if (oldVal === newVal) return;
    var pos = el.selectionStart;
    var diff = newVal.length - oldVal.length;
    el.value = newVal;
    var newPos = Math.max(0, Math.min(pos + diff, newVal.length));
    el.setSelectionRange(newPos, newPos);
}

async function checkBrnStatus() {
    var brn = document.getElementById('clientModalBizRegNum').value.trim();
    if (!brn || brn.replace(/-/g, '').length !== 10) {
        showToast('사업자등록번호 10자리를 입력하세요.', 'warning');
        return;
    }
    var btn = document.getElementById('btnCheckBrn');
    if (btn) { btn.disabled = true; btn.textContent = '조회중...'; }
    try {
        var res = await axios.get('/api/clients/check-brn/' + encodeURIComponent(brn));
        if (res.data.success) {
            var d = res.data.data;
            var stateText = d.state || '확인불가';
            var taxText = d.taxType || '';
            var dateText = d.stateDate || '';
            var statusEl = document.getElementById('brnStatusResult');
            if (statusEl) {
                var color = stateText.includes('계속') ? 'text-green-600' : (stateText.includes('폐업') ? 'text-red-600' : 'text-amber-600');
                statusEl.innerHTML = '<span class="' + color + ' font-medium">' + stateText + '</span>'
                    + (taxText ? ' / ' + taxText : '')
                    + (dateText ? ' (' + dateText + ')' : '');
                statusEl.classList.remove('hidden');
            }
        } else {
            showToast('조회 실패: ' + (res.data.error || ''), 'error');
        }
    } catch(e) {
        handleApiError(e, '조회 오류');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '상태조회'; }
    }
}

// ── 필터 ────────────────────────────────────────────────

function getFilters() {
    return {
        search: (document.getElementById('searchInput') || {}).value || '',
        client_type: (document.getElementById('clientTypeFilter') || {}).value || '',
        invoice_method: (document.getElementById('invoiceMethodFilter') || {}).value || '',
        delivery_method: (document.getElementById('deliveryMethodFilter') || {}).value || '',
        active: (document.getElementById('activeFilter') || {}).value || '1',
        sort: (document.getElementById('sortBy') || {}).value || 'name',
        dormant: (document.getElementById('dormantFilter') || {}).value || '',
        has_balance: (document.getElementById('balanceFilter') || {}).value || '',
        credit_hold: (document.getElementById('creditHoldFilter') || {}).value || '',
    };
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('clientTypeFilter').value = '';
    document.getElementById('invoiceMethodFilter').value = '';
    document.getElementById('deliveryMethodFilter').value = '';
    document.getElementById('activeFilter').value = '1';
    var sortEl = document.getElementById('sortBy');
    if (sortEl) sortEl.value = 'name';
    var dormantEl = document.getElementById('dormantFilter');
    if (dormantEl) dormantEl.value = '';
    var balanceEl = document.getElementById('balanceFilter');
    if (balanceEl) balanceEl.value = '';
    var creditHoldEl = document.getElementById('creditHoldFilter');
    if (creditHoldEl) creditHoldEl.value = '';
    loadClients(1);
}

function searchClients() {
    currentPage = 1;
    loadClients(1);
}

function changePageSize() {
    currentPageSize = parseInt(document.getElementById('pageSizeSelect').value) || 50;
    currentPage = 1;
    loadClients(1);
}

// ── 목록 로드 ───────────────────────────────────────────────

async function loadClients(page) {
    if (page === undefined) page = 1;
    try {
        var f = getFilters();
        var url = '/api/clients?page=' + page + '&limit=' + currentPageSize
            + '&search=' + encodeURIComponent(f.search)
            + '&active=' + f.active;
        if (f.client_type) url += '&client_type=' + f.client_type;
        if (f.invoice_method) url += '&invoice_method=' + f.invoice_method;
        if (f.delivery_method) url += '&delivery_method=' + f.delivery_method;
        if (f.sort && f.sort !== 'name') url += '&sort=' + f.sort;
        if (f.dormant) url += '&dormant=' + f.dormant;
        if (f.has_balance) url += '&has_balance=' + f.has_balance;
        if (f.credit_hold) url += '&credit_hold=' + f.credit_hold;

        var response = await axios.get(url, { timeout: 10000 });

        if (response.data && response.data.data && response.data.data.clients) {
            displayClients(response.data.data.clients, response.data.data.pagination);
            currentPage = page;
        } else {
            throw new Error('서버 응답 형식 오류');
        }
    } catch (error) {
        var errorMsg = '거래처 목록을 불러오는데 실패했습니다.';
        if (error.code === 'ECONNABORTED') {
            errorMsg = '서버 응답 시간 초과.';
        } else if (!error.response) {
            errorMsg = '서버에 연결할 수 없습니다.';
        }
        document.getElementById('clientsList').innerHTML =
            '<div class="text-center py-12">'
            + '<i class="fas fa-exclamation-circle text-3xl mb-3 block text-gray-300"></i>'
            + '<div class="text-sm text-gray-500 mb-1">' + errorMsg + '</div>'
            + '<button onclick="loadClients(' + page + ')" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded mt-2"><i class="fas fa-redo mr-1"></i>재시도</button>'
            + '</div>';
    }
}

// ── 목록 표시 ───────────────────────────────────────────────

function displayClients(clients, pagination) {
    var countEl = document.getElementById('totalCount');
    if (countEl) countEl.textContent = pagination.total.toLocaleString('ko-KR') + '건';

    if (clients.length === 0) {
        document.getElementById('clientsList').innerHTML =
            '<div class="text-center py-12">'
            + '<i class="fas fa-inbox text-3xl mb-3 block text-gray-300"></i>'
            + '<div class="text-sm text-gray-500 mb-1">검색 결과가 없습니다</div>'
            + '</div>';
        document.getElementById('paginationArea').innerHTML = '';
        return;
    }

    var invoiceLabels = {
        PER_ORDER: '건별', MONTHLY: '월합산', UNDECIDED: '미분류',
        CARD: '카드', ISSUED_BY_OTHER: '타발행'
    };

    var rows = clients.map(function(c) {
        var typeBadge = '';
        if (c.client_type === 'SALES') typeBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">매출</span>';
        else if (c.client_type === 'PURCHASE') typeBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">매입</span>';
        else if (c.client_type === 'BOTH') typeBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">매출+매입</span>';

        var statusBadge = c.is_active
            ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700"><i class="fas fa-check-circle text-[7px] mr-1"></i>활성</span>'
            : '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600"><i class="fas fa-power-off text-[7px] mr-1"></i>비활성</span>';

        var invLabel = invoiceLabels[c.invoice_method] || '-';

        var orderDisplay = '-';
        if (c.last_order_date) {
            var days = Math.floor((Date.now() - new Date(c.last_order_date).getTime()) / 86400000);
            orderDisplay = c.last_order_date.substring(0, 10);
            if (days >= 90) orderDisplay = '<span class="text-red-600 font-medium">' + orderDisplay + '</span>';
        }

        var rowClass = !c.is_active ? 'opacity-50' : '';

        return '<tr class="border-b border-gray-100 hover:bg-blue-50/30 group ' + rowClass + '">'
            + '<td class="px-3 py-2.5 text-xs text-gray-400 tabular-nums">' + escapeHtml(c.business_registration_number || '-') + '</td>'
            + '<td class="px-3 py-2.5 text-sm font-medium" style="color:#212529;">'
                + '<a href="/clients/' + c.id + '" class="hover:text-blue-600">' + escapeHtml(c.client_name) + '</a>'
            + '</td>'
            + '<td class="px-3 py-2.5">' + typeBadge + '</td>'
            + '<td class="px-3 py-2.5 text-xs text-gray-500">' + escapeHtml(c.representative || '-') + '</td>'
            + '<td class="px-3 py-2.5 text-xs text-gray-500 tabular-nums">' + escapeHtml(c.phone || c.mobile || '-') + '</td>'
            + '<td class="px-3 py-2.5 text-xs text-gray-500">' + invLabel + '</td>'
            + '<td class="px-3 py-2.5">' + statusBadge + '</td>'
            + '<td class="px-3 py-2.5 text-xs tabular-nums">' + orderDisplay + '</td>'
            + '<td class="px-3 py-2.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">'
                + '<button onclick="editClient(' + c.id + ')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i></button>'
                + '<button onclick="deleteClient(' + c.id + ', \'' + escapeHtml(c.client_name).replace(/'/g, "&#039;") + '\')" class="text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>'
            + '</td>'
            + '</tr>';
    }).join('');

    document.getElementById('clientsList').innerHTML =
        '<table class="w-full ds-table ds-table-striped">'
        + '<thead class="bg-gray-50 sticky top-0 z-[5]">'
            + '<tr>'
            + '<th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-600">사업자번호</th>'
            + '<th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-600">거래처명</th>'
            + '<th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-600">유형</th>'
            + '<th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-600">대표자</th>'
            + '<th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-600">연락처</th>'
            + '<th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-600">계산서</th>'
            + '<th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-600">상태</th>'
            + '<th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-600">최근 주문</th>'
            + '<th class="px-3 py-2.5 w-16"></th>'
            + '</tr>'
        + '</thead>'
        + '<tbody>' + rows + '</tbody>'
        + '</table>';

    var p = pagination;
    var pageNums = '';
    var startPage = Math.max(1, p.page - 2);
    var endPage = Math.min(p.total_pages, p.page + 2);
    for (var i = startPage; i <= endPage; i++) {
        if (i === p.page) {
            pageNums += '<span class="px-2.5 py-1 bg-blue-600 text-white rounded text-xs font-medium">' + i + '</span>';
        } else {
            pageNums += '<button onclick="loadClients(' + i + ')" class="px-2.5 py-1 border rounded text-xs hover:bg-gray-50">' + i + '</button>';
        }
    }

    document.getElementById('paginationArea').innerHTML =
        '<div class="flex justify-between items-center">'
        + '<div class="text-xs text-gray-500">싙 <span class="font-medium">' + p.total.toLocaleString('ko-KR') + '</span>건 (페이지 ' + p.page + ' / ' + p.total_pages + ')</div>'
        + '<div class="flex gap-1 items-center">'
            + (p.page > 1 ? '<button onclick="loadClients(1)" class="px-2 py-1 border rounded text-xs hover:bg-gray-50"><i class="fas fa-angle-double-left"></i></button>' : '')
            + (p.page > 1 ? '<button onclick="loadClients(' + (p.page - 1) + ')" class="px-2 py-1 border rounded text-xs hover:bg-gray-50"><i class="fas fa-angle-left"></i></button>' : '')
            + pageNums
            + (p.page < p.total_pages ? '<button onclick="loadClients(' + (p.page + 1) + ')" class="px-2 py-1 border rounded text-xs hover:bg-gray-50"><i class="fas fa-angle-right"></i></button>' : '')
            + (p.page < p.total_pages ? '<button onclick="loadClients(' + p.total_pages + ')" class="px-2 py-1 border rounded text-xs hover:bg-gray-50"><i class="fas fa-angle-double-right"></i></button>' : '')
        + '</div>'
        + '</div>';
}

// ── 모달 ────────────────────────────────────────────────

function showAddClientModal() {
    document.getElementById('clientModalTitle').textContent = '거래처 추가';
    var fields = ['clientModalId','clientModalBizRegNum','clientModalName','clientModalRepresentative',
        'clientModalBizType','clientModalBizItem','clientModalPhone','clientModalMobile','clientModalFax',
        'clientModalEmail','clientModalAddress','clientModalPostalCode','clientModalAddressDetail',
        'clientModalSearchKeywords','clientModalTransferInfo','clientModalDeliveryAddress','clientModalNotes'];
    fields.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('editClientType').value = 'SALES';
    document.getElementById('clientModalDeliveryMethod').value = 'SAME';
    var plSel = document.getElementById('clientModalPriceList');
    if (plSel) plSel.value = '';
    var ppSel = document.getElementById('clientModalPricePolicy');
    if (ppSel) ppSel.value = '';
    document.getElementById('clientModal').classList.remove('hidden');
}

async function editClient(clientId) {
    try {
        var response = await axios.get('/api/clients/' + clientId);
        if (response.data.success) {
            var c = response.data.data;
            document.getElementById('clientModalTitle').textContent = '거래처 수정';
            document.getElementById('clientModalId').value = c.id;
            document.getElementById('clientModalBizRegNum').value = c.business_registration_number || '';
            document.getElementById('clientModalName').value = c.client_name;
            document.getElementById('clientModalRepresentative').value = c.representative || '';
            document.getElementById('clientModalBizType').value = c.business_type || '';
            document.getElementById('clientModalBizItem').value = c.business_item || '';
            document.getElementById('clientModalPhone').value = c.phone || '';
            document.getElementById('clientModalMobile').value = c.mobile || '';
            document.getElementById('clientModalFax').value = c.fax || '';
            document.getElementById('clientModalEmail').value = c.email || '';
            document.getElementById('clientModalAddress').value = c.address || '';
            document.getElementById('clientModalPostalCode').value = c.postal_code || '';
            document.getElementById('clientModalAddressDetail').value = c.address_detail || '';
            document.getElementById('editClientType').value = c.client_type || 'SALES';
            if (document.getElementById('clientModalPriceList')) {
                document.getElementById('clientModalPriceList').value = c.price_list_id || '';
            }
            if (document.getElementById('clientModalPricePolicy')) {
                document.getElementById('clientModalPricePolicy').value = c.price_policy_id || '';
            }
            document.getElementById('clientModalSearchKeywords').value = c.search_keywords || '';
            document.getElementById('clientModalTransferInfo').value = c.transfer_info || '';
            document.getElementById('clientModalDeliveryMethod').value = c.delivery_method || 'SAME';
            document.getElementById('clientModalDeliveryAddress').value = c.delivery_address || '';
            document.getElementById('clientModalNotes').value = c.notes || '';
            document.getElementById('clientModal').classList.remove('hidden');
        }
    } catch (error) {
        handleApiError(error, '거래처 정보를 불러오는데 실패했습니다.');
    }
}

async function saveClient() {
    var id = document.getElementById('clientModalId').value;
    var name = document.getElementById('clientModalName').value.trim();
    if (!name) { showToast('거래처명을 입력해주세요.', 'warning'); return; }

    var clientType = document.getElementById('editClientType').value || 'SALES';
    var priceListId = document.getElementById('clientModalPriceList') ? document.getElementById('clientModalPriceList').value : '';
    var pricePolicyEl = document.getElementById('clientModalPricePolicy');
    var pricePolicyId = pricePolicyEl ? pricePolicyEl.value : '';

    var payload = {
        client_name: name,
        business_registration_number: document.getElementById('clientModalBizRegNum').value.trim() || null,
        representative: document.getElementById('clientModalRepresentative').value || null,
        business_type: document.getElementById('clientModalBizType').value || null,
        business_item: document.getElementById('clientModalBizItem').value || null,
        phone: document.getElementById('clientModalPhone').value || null,
        mobile: document.getElementById('clientModalMobile').value || null,
        fax: document.getElementById('clientModalFax').value || null,
        email: document.getElementById('clientModalEmail').value || null,
        address: document.getElementById('clientModalAddress').value || null,
        postal_code: document.getElementById('clientModalPostalCode').value || null,
        address_detail: document.getElementById('clientModalAddressDetail').value || null,
        client_type: clientType,
        price_list_id: priceListId ? parseInt(priceListId) : null,
        price_policy_id: pricePolicyId ? parseInt(pricePolicyId) : null,
        search_keywords: document.getElementById('clientModalSearchKeywords').value || null,
        transfer_info: document.getElementById('clientModalTransferInfo').value || null,
        delivery_method: document.getElementById('clientModalDeliveryMethod').value || 'SAME',
        delivery_address: document.getElementById('clientModalDeliveryAddress').value.trim() || null,
        notes: document.getElementById('clientModalNotes').value || null
    };

    try {
        if (id) {
            await axios.patch('/api/clients/' + id, payload);
            showToast('거래처가 수정되었습니다.', 'success');
        } else {
            payload.client_code = payload.business_registration_number || ('C' + Date.now());
            await axios.post('/api/clients', payload);
            showToast('거래처가 추가되었습니다.', 'success');
        }
        document.getElementById('clientModal').classList.add('hidden');
        loadClients(currentPage);
    } catch (error) {
        handleApiError(error, '저장 실패');
    }
}

async function deleteClient(clientId, clientName) {
    if (!(await showConfirm('거래처 "' + clientName + '"을(를) 삭제하시겠습니까?\n\n주문 내역이 있는 경우 비활성화됩니다.', { danger: true }))) {
        return;
    }
    try {
        await axios.delete('/api/clients/' + clientId);
        showToast('거래처가 삭제되었습니다.', 'success');
        loadClients(currentPage);
    } catch (error) {
        handleApiError(error, '삭제 실패');
    }
}

// ── 엑셀 임포트 ──────────────────────────────────

async function importExcel() {
    var fileInput = document.getElementById('excelFile');
    var file = fileInput.files[0];
    if (!file) { showToast('파일을 선택해주세요.', 'warning'); return; }

    var resultDiv = document.getElementById('importResult');
    resultDiv.className = 'mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm';
    resultDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>파일을 처리하는 중...';
    resultDiv.classList.remove('hidden');

    try {
        if (!window.XLSX) {
            resultDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>XLSX 라이브러리 로딩 중...';
            await new Promise(function(resolve, reject) {
                var s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
                s.onload = resolve;
                s.onerror = function() { reject(new Error('XLSX 라이브러리 로딩 실패')); };
                document.head.appendChild(s);
            });
        }
        var data = await file.arrayBuffer();
        var workbook = window.XLSX.read(data);
        var worksheet = workbook.Sheets[workbook.SheetNames[0]];
        var jsonData = window.XLSX.utils.sheet_to_json(worksheet);

        var findVal = function(row, keys) {
            for (var i = 0; i < keys.length; i++) {
                if (row[keys[i]] !== undefined && row[keys[i]] !== null) return row[keys[i]];
            }
            for (var k in row) {
                for (var i = 0; i < keys.length; i++) {
                    if (k.indexOf(keys[i]) >= 0) return row[k];
                }
            }
            return null;
        };

        var clients = jsonData.map(function(row) {
            var code = findVal(row, ['client_code', '거래처코드']) || '';
            return {
                client_code: String(code),
                client_name: findVal(row, ['client_name', '거래처명']) || '',
                representative: findVal(row, ['representative', '대표자명']),
                business_type: findVal(row, ['business_type', '업태']),
                business_item: findVal(row, ['business_item', '종목']),
                phone: findVal(row, ['phone', '전화']),
                mobile: findVal(row, ['mobile', '모바일']),
                fax: findVal(row, ['fax', 'Fax']),
                email: findVal(row, ['email', 'Email']),
                address: findVal(row, ['address', '기본주소', '주소1']),
                address_detail: findVal(row, ['address_detail', '상세주소']),
                search_keywords: findVal(row, ['search_keywords', '검색창내용']),
                transfer_info: findVal(row, ['transfer_info', '이체정보']),
                business_registration_number: findVal(row, ['business_registration_number', '사업자등록번호']) || null,
                delivery_method: findVal(row, ['delivery_method', '배송방식']) || 'SAME',
                delivery_address: findVal(row, ['delivery_address', '배송지', '지점명']),
                invoice_method: findVal(row, ['invoice_method', 'invoice_type', '계산서유형']) || 'PER_ORDER',
                is_active: 1
            };
        }).filter(function(c) { return c.client_code && c.client_name; });

        var response = await axios.post('/api/clients/import', { clients });

        if (response.data.success) {
            var r = response.data.data;
            resultDiv.className = 'mt-3 p-3 bg-green-50 border border-green-200 rounded text-sm';
            resultDiv.innerHTML =
                '<div class="font-medium text-green-700 mb-1"><i class="fas fa-check-circle mr-1"></i>임포트 완료</div>'
                + '<div class="text-gray-700">'
                + '전체: ' + r.total + ' / 신규: ' + r.inserted + ' / 업데이트: ' + r.updated + ' / 건너눠: ' + r.skipped
                + (r.errors.length > 0 ? '<div class="mt-1 text-red-600 text-xs">' + r.errors.slice(0,3).join('<br>') + '</div>' : '')
                + '</div>';
            loadClients(currentPage);
            fileInput.value = '';
        }
    } catch (error) {
        resultDiv.className = 'mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700';
        resultDiv.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>임포트 실패: ' + escapeHtml(error.response && error.response.data ? error.response.data.error : error.message);
    }
}

function loadPriceListOptions() {
    axios.get('/api/price-lists').then(function(res) {
        var lists = res.data.price_lists || [];
        var sel = document.getElementById('clientModalPriceList');
        if (!sel) return;
        sel.innerHTML = '<option value="">기본</option>';
        for (var i = 0; i < lists.length; i++) {
            var pct = lists[i].adjustment_percent > 0 ? '+' + lists[i].adjustment_percent : lists[i].adjustment_percent;
            sel.innerHTML += '<option value="' + lists[i].id + '">' + escapeHtml(lists[i].name) + ' (' + pct + '%)</option>';
        }
    }).catch(function(err) { console.error('[clients] 가격표 목록 로드 실패', err); });
}

function loadPricePolicyOptions() {
    axios.get('/api/price-list/policies').then(function(res) {
        var policies = (res.data && res.data.data) || [];
        var sel = document.getElementById('clientModalPricePolicy');
        if (!sel) { console.warn('[clients] #clientModalPricePolicy not found'); return; }
        sel.innerHTML = '<option value="">정가 (기본)</option>';
        for (var i = 0; i < policies.length; i++) {
            var p = policies[i];
            if (p.is_default) continue;
            var label = escapeHtml(p.name) + (p.rule_count ? ' (' + p.rule_count + '개 규칙)' : '');
            sel.innerHTML += '<option value="' + p.id + '">' + label + '</option>';
        }
    }).catch(function(err) { console.error('[clients] 가격 정책 목록 로드 실패', err); });
}

// ── 초기화 ────────────────────────────────────────────────

loadClients(1);
loadPriceListOptions();
loadPricePolicyOptions();

document.getElementById('searchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') searchClients();
});