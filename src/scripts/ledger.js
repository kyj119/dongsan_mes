// Skeleton loading
(function() {
  var el = document.getElementById('clientsTableBody');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(8, 7);
})();

// State
var selectedClientId = null;
var selectedClientName = '';
var allClients = [];
var currentDateFilter = { startDate: '', endDate: '' };
var _adjustmentOrderList = [];
var agingMap = {}; // client_id -> { aging_days, aging_category }
var modalContext = { clientId: null, clientName: '', mode: 'sales' };

// Date helpers
function setQuickDate(key) {
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth();
    var sd = '', ed = '';

    if (key === 'thisMonth') {
        sd = new Date(y, m, 1).toISOString().split('T')[0];
        ed = new Date(y, m + 1, 0).toISOString().split('T')[0];
    } else if (key === 'lastMonth') {
        sd = new Date(y, m - 1, 1).toISOString().split('T')[0];
        ed = new Date(y, m, 0).toISOString().split('T')[0];
    } else if (key === '3months') {
        sd = new Date(y, m - 2, 1).toISOString().split('T')[0];
        ed = new Date(y, m + 1, 0).toISOString().split('T')[0];
    } else if (key === 'thisYear') {
        sd = y + '-01-01';
        ed = y + '-12-31';
    } else {
        sd = ''; ed = '';
    }

    document.getElementById('startDate').value = sd;
    document.getElementById('endDate').value = ed;

    // Highlight active button
    document.querySelectorAll('.quick-date').forEach(function(btn) {
        if (btn.dataset.key === key) {
            btn.className = 'quick-date px-3 py-1 text-xs rounded border bg-orange-100 border-orange-300';
        } else {
            btn.className = 'quick-date px-3 py-1 text-xs rounded border hover:bg-orange-50';
        }
    });

    applyDateFilter();
}

function applyDateFilter() {
    currentDateFilter.startDate = document.getElementById('startDate').value;
    currentDateFilter.endDate = document.getElementById('endDate').value;
    loadSettlement();
    loadMonthlySummary();
    if (selectedClientId) {
        loadClientDetail(selectedClientId);
    }
    var pContent = document.getElementById('purchaseContent');
    if (pContent && pContent.style.display !== 'none') {
        loadPurchaseSettlement();
        loadPurchaseMonthlySummary();
    }
    loadAgingData();
}

function getDateParams() {
    var p = '';
    if (currentDateFilter.startDate) p += '&startDate=' + currentDateFilter.startDate;
    if (currentDateFilter.endDate) p += '&endDate=' + currentDateFilter.endDate;
    return p;
}

// Load settlement + clients
async function loadSettlement() {
    try {
        var url = '/api/ledger/settlement?' + getDateParams().substring(1);
        var res = await axios.get(url);
        if (res.data.success) {
            var s = res.data.data.summary;
            document.getElementById('totalSales').textContent = s.total_sales.toLocaleString() + '원';
            document.getElementById('totalPayments').textContent = s.total_payments.toLocaleString() + '원';
            document.getElementById('totalBalance').textContent = s.total_balance.toLocaleString() + '원';
            document.getElementById('totalClients').textContent = s.total_clients;
            var ratio = s.total_sales > 0 ? Math.round(s.total_balance / s.total_sales * 100) : 0;
            document.getElementById('balanceRatio').textContent = '미수금율 ' + ratio + '%';

            allClients = res.data.data.clients || [];
            renderClientTable(allClients);
        }
    } catch (e) {
        console.error('Settlement load error:', e);
        showToast('정산 데이터 로드 실패', 'error');
    }
}

function renderClientTable(clients) {
    var tbody = document.getElementById('clientsTableBody');
    var tfoot = document.getElementById('clientsTableFoot');
    tbody.innerHTML = '';

    var sumSales = 0, sumPayments = 0, sumBalance = 0, sumOrders = 0;

    clients.forEach(function(cl) {
        sumSales += cl.total_sales || 0;
        sumPayments += cl.total_payments || 0;
        sumBalance += cl.balance || 0;
        sumOrders += cl.order_count || 0;

        var balColor = cl.balance > 0 ? 'text-red-600 font-bold' : cl.balance < 0 ? 'text-blue-600' : 'text-green-600';
        var activeClass = selectedClientId == cl.id ? ' active' : '';
        var row = document.createElement('tr');
        row.className = 'client-row' + activeClass;
        row.dataset.id = cl.id;
        row.dataset.name = cl.client_name;
        row.onclick = function() { selectClient(cl.id, cl.client_name); };
        var safeClientName = escapeHtml(cl.client_name).replace(/'/g, "\\'");
        // Aging info from merged receivables data
        var aging = agingMap[cl.id];
        var agingHtml = '-';
        if (aging && aging.aging_days > 0) {
            var agingCls = 'aging-normal';
            var agingLabel = aging.aging_days + '일';
            if (aging.aging_days > 90) { agingCls = 'aging-critical'; }
            else if (aging.aging_days > 60) { agingCls = 'aging-danger'; }
            else if (aging.aging_days > 30) { agingCls = 'aging-warning'; }
            agingHtml = '<span class="aging-badge ' + agingCls + '">' + agingLabel + '</span>';
        }
        row.innerHTML =
            '<td class="px-4 py-2 text-gray-500">' + escapeHtml(cl.client_code || '') + '</td>' +
            '<td class="px-4 py-2 font-medium">' + escapeHtml(cl.client_name) + '</td>' +
            '<td class="px-4 py-2 text-right tabular-nums">' + (cl.order_count || 0) + '</td>' +
            '<td class="px-4 py-2 text-right tabular-nums">' + (cl.total_sales || 0).toLocaleString() + '</td>' +
            '<td class="px-4 py-2 text-right tabular-nums">' + (cl.total_payments || 0).toLocaleString() + '</td>' +
            '<td class="px-4 py-2 text-right tabular-nums ' + balColor + '">' + (cl.balance || 0).toLocaleString() + '</td>' +
            '<td class="px-4 py-2 text-center">' + agingHtml + '</td>' +
            '<td class="px-4 py-2 text-center" onclick="event.stopPropagation()">' +
            '<button onclick="openLedgerSendModal(' + cl.id + ',\'' + safeClientName + '\',' + (cl.balance || 0) + ')" class="text-blue-500 hover:text-blue-700 p-1 rounded" title="원장 알림 발송"><i class="fas fa-paper-plane text-xs"></i></button>' +
            '</td>';
        tbody.appendChild(row);
    });

    tfoot.innerHTML =
        '<tr>' +
        '<td class="px-4 py-2" colspan="2">합계 (' + clients.length + '개 거래처)</td>' +
        '<td class="px-4 py-2 text-right">' + sumOrders + '</td>' +
        '<td class="px-4 py-2 text-right">' + sumSales.toLocaleString() + '</td>' +
        '<td class="px-4 py-2 text-right">' + sumPayments.toLocaleString() + '</td>' +
        '<td class="px-4 py-2 text-right ' + (sumBalance > 0 ? 'text-red-600' : 'text-green-600') + '">' + sumBalance.toLocaleString() + '</td>' +
        '<td colspan="2"></td>' +
        '</tr>';
}

function filterClientTable() {
    var q = document.getElementById('clientSearch').value.toLowerCase();
    var filtered = allClients.filter(function(cl) {
        return cl.client_name.toLowerCase().indexOf(q) >= 0 ||
               (cl.client_code || '').toLowerCase().indexOf(q) >= 0;
    });
    renderClientTable(filtered);
}

// ===== Modal Open/Close =====
function openDetailModal(clientId, clientName, mode) {
    modalContext.clientId = clientId;
    modalContext.clientName = clientName;
    modalContext.mode = mode || 'sales';
    document.getElementById('modalClientName').textContent = clientName;
    document.getElementById('clientDetailModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // 매출/매입 모드에 따라 표시
    var salesContent = document.getElementById('detailSection');
    var purchaseContent = document.getElementById('pDetailSection');
    var salesSummary = document.getElementById('modalSummaryRow');
    var purchaseSummary = document.getElementById('modalPurchaseSummaryRow');
    if (mode === 'purchase') {
        salesContent.classList.add('hidden');
        purchaseContent.classList.remove('hidden');
        if (salesSummary) salesSummary.classList.add('hidden');
        if (purchaseSummary) purchaseSummary.classList.remove('hidden');
    } else {
        salesContent.classList.remove('hidden');
        purchaseContent.classList.add('hidden');
        if (salesSummary) salesSummary.classList.remove('hidden');
        if (purchaseSummary) purchaseSummary.classList.add('hidden');
    }
}

function closeDetailModal() {
    document.getElementById('clientDetailModal').classList.add('hidden');
    document.body.style.overflow = '';
    selectedClientId = null;
    selectedSupplierId = null;
    document.querySelectorAll('.client-row').forEach(function(r) { r.classList.remove('active'); });
}

// Select client (opens modal)
function selectClient(clientId, clientName) {
    selectedClientId = clientId;
    selectedClientName = clientName;

    // Set today as default payment date
    document.getElementById('paymentDate').value = new Date().toISOString().split('T')[0];

    // Highlight row
    document.querySelectorAll('#clientsTableBody .client-row').forEach(function(r) {
        r.classList.toggle('active', r.dataset.id == clientId);
    });

    openDetailModal(clientId, clientName, 'sales');
    loadClientDetail(clientId);
}

function closeDetail() {
    closeDetailModal();
}

// Load client detail (transactions + payments)
async function loadClientDetail(clientId) {
    try {
        var url = '/api/ledger/client/' + clientId + '?' + getDateParams().substring(1);
        var res = await axios.get(url);
        if (res.data.success) {
            var d = res.data.data;
            document.getElementById('clientTotalSales').textContent = d.summary.total_orders.toLocaleString() + '원';
            document.getElementById('clientTotalPayments').textContent = d.summary.total_payments.toLocaleString() + '원';
            var adjEl = document.getElementById('clientTotalAdjustments');
            if (adjEl) adjEl.textContent = (d.summary.total_adjustments || 0).toLocaleString() + '원';
            document.getElementById('clientBalance').textContent = d.summary.balance.toLocaleString() + '원';
            document.getElementById('clientLastPayment').textContent = d.summary.last_payment_date || '-';

            // 이중잔액 표시
            renderDualBalance(d, clientId);

            // Render transactions with color-coded timeline
            var txBody = document.getElementById('transactionsTableBody');
            txBody.innerHTML = '';
            (d.transactions || []).forEach(function(tx) {
                var row = document.createElement('tr');
                var type = tx.type;
                var badgeClass, badgeText, rowBg;
                if (type === 'order') {
                    badgeClass = 'bg-green-100 text-green-800';
                    badgeText = '주문';
                    rowBg = 'bg-green-50/50';
                } else if (type === 'payment') {
                    badgeClass = 'bg-blue-100 text-blue-800';
                    badgeText = '입금';
                    rowBg = 'bg-blue-50/50';
                } else if (type === 'adjustment') {
                    badgeClass = 'bg-yellow-100 text-yellow-800';
                    badgeText = '할인/조정';
                    rowBg = 'bg-yellow-50/50';
                } else {
                    badgeClass = 'bg-gray-100 text-gray-600';
                    badgeText = type || '기타';
                    rowBg = '';
                }
                row.className = rowBg + ' hover:bg-gray-100 transition-colors';
                var balClass = tx.balance > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold';
                // billing_status 확인 표시
                var billedMark = (type === 'order' && tx.billing_status === 'BILLED')
                    ? ' <i class="fas fa-check-circle text-blue-500 text-xs" title="회계반영완료"></i>'
                    : '';
                // 인라인 액션 (입금: 수정/삭제, 감액: 삭제)
                var actionHtml = '';
                if (type === 'payment' && tx.id) {
                    actionHtml = '<td class="px-2 py-2 text-center whitespace-nowrap">' +
                        '<button onclick="editPayment(' + tx.id + ')" class="text-blue-400 hover:text-blue-600 p-1" title="수정"><i class="fas fa-edit text-xs"></i></button>' +
                        '<button onclick="deletePayment(' + tx.id + ',' + (tx.credit || 0) + ')" class="text-red-400 hover:text-red-600 p-1" title="삭제"><i class="fas fa-trash text-xs"></i></button>' +
                        '</td>';
                } else if (type === 'adjustment' && tx.id) {
                    actionHtml = '<td class="px-2 py-2 text-center">' +
                        '<button onclick="deleteAdjustment(' + tx.id + ',' + (tx.credit || 0) + ')" class="text-red-400 hover:text-red-600 p-1" title="삭제"><i class="fas fa-trash text-xs"></i></button>' +
                        '</td>';
                } else {
                    actionHtml = '<td class="px-2 py-2"></td>';
                }
                row.innerHTML =
                    '<td class="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">' + formatDate(tx.date) + '</td>' +
                    '<td class="px-2 py-2 text-center"><span class="px-2 py-0.5 text-xs font-medium rounded ' + badgeClass + '">' + badgeText + '</span></td>' +
                    '<td class="px-3 py-2 text-sm">' + (tx.description || '-') + billedMark + '</td>' +
                    '<td class="px-3 py-2 text-right tabular-nums text-sm">' + (tx.debit > 0 ? tx.debit.toLocaleString() : '') + '</td>' +
                    '<td class="px-3 py-2 text-right tabular-nums text-sm">' + (tx.credit > 0 ? tx.credit.toLocaleString() : '') + '</td>' +
                    '<td class="px-3 py-2 text-right tabular-nums text-sm ' + balClass + '">' + tx.balance.toLocaleString() + '</td>' +
                    actionHtml;
                txBody.appendChild(row);
            });

            if ((d.transactions || []).length === 0) {
                txBody.innerHTML = '<tr><td colspan="7" class="text-center py-10"><i class="fas fa-receipt text-3xl mb-2 block text-gray-300"></i><div class="text-sm text-gray-400">거래 내역이 없습니다</div></td></tr>';
            }
        }
    } catch (e) {
        console.error('Client detail error:', e);
        showToast('거래처 상세 로드 실패', 'error');
    }
}

// 이중잔액 렌더링
function renderDualBalance(d, clientId) {
    var container = document.getElementById('dualBalanceSection');
    if (!container) return;

    var calcBal = d.calculated_balance;
    var cacheBal = d.cached_balance;
    var hasDisc = d.has_discrepancy;

    if (calcBal === undefined && cacheBal === undefined) {
        container.innerHTML = '';
        return;
    }

    var discHtml = '';
    if (hasDisc) {
        discHtml = '<div class="flex items-center gap-2 mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">'
            + '<i class="fas fa-exclamation-triangle"></i>'
            + '<span>잔액 불일치가 감지되었습니다. 재계산이 필요합니다.</span>'
            + '<button onclick="recalculateBalance(' + clientId + ')" class="ml-auto px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">잔액 재계산</button>'
            + '</div>';
    }

    container.innerHTML =
        '<div class="mt-3 pt-3 border-t border-gray-100">'
        + '<div class="flex flex-wrap gap-3 text-xs">'
        + '<div class="flex items-center gap-1 text-gray-600">'
        + '<span class="text-gray-500">확정 잔액:</span>'
        + '<span class="font-bold text-gray-800">' + (calcBal !== undefined ? Number(calcBal).toLocaleString() : '-') + '원</span>'
        + '<span class="text-gray-400">(실계산)</span>'
        + '</div>'
        + '<div class="flex items-center gap-1 text-gray-600">'
        + '<span class="text-gray-500">캐시 잔액:</span>'
        + '<span class="font-bold text-gray-800">' + (cacheBal !== undefined ? Number(cacheBal).toLocaleString() : '-') + '원</span>'
        + '</div>'
        + '</div>'
        + discHtml
        + '</div>';
}

async function recalculateBalance(clientId) {
    try {
        var res = await axios.post('/api/ledger/recalculate/' + clientId, {});
        if (res.data.success) {
            showToast('잔액이 재계산되었습니다', 'success');
            await loadClientDetail(clientId);
            await loadSettlement();
        } else {
            showToast(res.data.error || '재계산 실패', 'error');
        }
    } catch (e) {
        showToast('재계산 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
    }
}

// Load payments for edit/delete
async function loadPayments(clientId) {
    try {
        var url = '/api/ledger/payments?clientId=' + clientId + getDateParams();
        var res = await axios.get(url);
        if (res.data.success) {
            var tbody = document.getElementById('paymentsTableBody');
            if (!tbody) return;
            tbody.innerHTML = '';
            var payments = res.data.data || [];

            if (payments.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10"><i class="fas fa-coins text-3xl mb-2 block text-gray-300"></i><div class="text-sm text-gray-400">입금 내역이 없습니다</div></td></tr>';
                return;
            }

            var canEdit = currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER';
            var canDelete = currentUserRole === 'ADMIN';

            payments.forEach(function(p) {
                var row = document.createElement('tr');
                row.className = 'hover:bg-gray-50';
                var actions = '';
                if (canEdit) {
                    actions += '<button onclick="editPayment(' + p.id + ')" class="px-2 py-1 text-xs text-orange-600 hover:bg-orange-50 rounded"><i class="fas fa-edit"></i></button>';
                }
                if (canDelete) {
                    actions += '<button onclick="deletePayment(' + p.id + ', ' + p.amount + ')" class="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded ml-1"><i class="fas fa-trash"></i></button>';
                }
                row.innerHTML =
                    '<td class="px-4 py-2">' + (p.payment_date || '') + '</td>' +
                    '<td class="px-4 py-2 text-right font-medium text-green-700">' + (p.amount || 0).toLocaleString() + '원</td>' +
                    '<td class="px-4 py-2">' + (p.payment_method || '-') + '</td>' +
                    '<td class="px-4 py-2 text-gray-500">' + (p.reference_number || '-') + '</td>' +
                    '<td class="px-4 py-2 text-gray-500">' + (p.notes || '-') + '</td>' +
                    '<td class="px-4 py-2 text-gray-500">' + (p.created_by_name || '-') + '</td>' +
                    '<td class="px-4 py-2 text-center act-col">' + (actions || '-') + '</td>';
                tbody.appendChild(row);
            });
        }
    } catch (e) {
        console.error('Payments load error:', e);
    }
}

// ===== 감액 관리 =====
async function loadAdjustments(clientId) {
    try {
        var res = await axios.get('/api/ledger/adjustments/' + clientId);
        if (res.data.success) {
            renderAdjustmentsTable(res.data.data || []);
        }
    } catch (e) {
        console.error('Adjustments load error:', e);
        showToast('감액 이력 조회 실패', 'error');
    }
}

function renderAdjustmentsTable(adjustments) {
    var tbody = document.getElementById('adjustmentsTableBody');
    if (!tbody) return;

    if (adjustments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-10"><i class="fas fa-minus-circle text-3xl mb-2 block text-gray-300"></i><div class="text-sm text-gray-400">감액 이력이 없습니다</div></td></tr>';
        return;
    }

    var canDelete = currentUserRole === 'ADMIN';
    tbody.innerHTML = '';
    adjustments.forEach(function(adj) {
        var typeLabel = { DISCOUNT:'할인', CLAIM:'클레임', RETURN:'반품', OTHER:'기타' }[adj.type] || adj.type;
        var row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        var delBtn = canDelete
            ? '<button onclick="deleteAdjustment(' + adj.id + ', ' + adj.amount + ')" class="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"><i class="fas fa-trash"></i></button>'
            : '-';
        row.innerHTML =
            '<td class="px-4 py-2 text-gray-500">' + formatDate(adj.created_at) + '</td>' +
            '<td class="px-4 py-2"><span class="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">' + typeLabel + '</span></td>' +
            '<td class="px-4 py-2 text-right font-medium text-orange-700">-' + Number(adj.amount).toLocaleString() + '원</td>' +
            '<td class="px-4 py-2 text-gray-600">' + (adj.reason || '-') + '</td>' +
            '<td class="px-4 py-2 text-gray-500">' + (adj.order_number || '-') + '</td>' +
            '<td class="px-4 py-2 text-center act-col">' + delBtn + '</td>';
        tbody.appendChild(row);
    });
}

function openAdjustmentModal() {
    if (!selectedClientId) {
        showToast('거래처를 먼저 선택해주세요', 'warning');
        return;
    }
    document.getElementById('adjType').value = 'DISCOUNT';
    document.getElementById('adjAmount').value = '';
    document.getElementById('adjReason').value = '';
    document.getElementById('adjOrderId').value = '';
    var modal = document.getElementById('adjustmentModal');
    modal.style.display = 'flex';
    modal.classList.add('show');
    // 주문 목록 로드 (SHIPPED 상태)
    loadOrdersForAdjustment();
}

function closeAdjustmentModal() {
    var modal = document.getElementById('adjustmentModal');
    modal.style.display = 'none';
    modal.classList.remove('show');
}

async function loadOrdersForAdjustment() {
    try {
        var res = await axios.get('/api/orders?status=SHIPPED&limit=100&clientId=' + selectedClientId);
        var orders = [];
        if (res.data.success) {
            orders = res.data.data || [];
        }
        _adjustmentOrderList = orders;
        var sel = document.getElementById('adjOrderId');
        sel.innerHTML = '<option value="">주문 선택 (선택사항)</option>';
        orders.forEach(function(o) {
            var opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = o.order_number + ' (' + Number(o.final_amount || 0).toLocaleString() + '원)';
            sel.appendChild(opt);
        });
    } catch (e) {
        console.error('Load orders for adjustment error:', e);
    }
}

async function saveAdjustment() {
    var type = document.getElementById('adjType').value;
    var amount = parseMoney(document.getElementById('adjAmount').value);
    var reason = document.getElementById('adjReason').value.trim();
    var orderId = document.getElementById('adjOrderId').value;

    if (!type) { showToast('유형을 선택해주세요', 'warning'); return; }
    if (!amount || amount <= 0) { showToast('유효한 금액을 입력해주세요', 'warning'); return; }
    if (!reason) { showToast('사유를 입력해주세요', 'warning'); return; }

    try {
        var body = {
            client_id: selectedClientId,
            type: type,
            amount: amount,
            reason: reason
        };
        if (orderId) body.order_id = parseInt(orderId);

        var res = await axios.post('/api/ledger/adjustment', body);
        if (res.data.success) {
            showToast('감액이 등록되었습니다', 'success');
            closeAdjustmentModal();
            await loadClientDetail(selectedClientId);
            await loadSettlement();
        } else {
            showToast(res.data.error || '등록 실패', 'error');
        }
    } catch (e) {
        showToast('감액 등록 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
    }
}

async function deleteAdjustment(adjId, amount) {
    if (!(await showConfirm('감액 내역 ' + Number(amount).toLocaleString() + '원을 삭제하시겠습니까?', { danger: true }))) return;
    try {
        var res = await axios.delete('/api/ledger/adjustment/' + adjId);
        if (res.data.success) {
            showToast('감액 내역이 삭제되었습니다', 'success');
            await loadClientDetail(selectedClientId);
            await loadSettlement();
        } else {
            showToast(res.data.error || '삭제 실패', 'error');
        }
    } catch (e) {
        showToast('삭제 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
    }
}

// ===== 미수금 경고 =====
async function loadOverdueWarning() {
    try {
        var res = await axios.get('/api/ledger/overdue');
        if (res.data.success) {
            renderOverdueWarning(res.data.data || []);
        }
    } catch (e) {
        console.error('Overdue load error:', e);
    }
}

function renderOverdueWarning(overdueList) {
    var container = document.getElementById('overdueWarningSection');
    if (!container) return;
    if (!overdueList || overdueList.length === 0) {
        container.innerHTML = '';
        return;
    }

    var cardsHtml = overdueList.map(function(item) {
        var overdue = Number(item.overdue_amount || 0);
        return '<div onclick="selectClient(' + item.client_id + ', \'' + escapeHtml(item.client_name || '').replace(/'/g, "&#039;") + '\')" '
            + 'class="flex items-center justify-between p-3 bg-white rounded border border-red-200 cursor-pointer hover:bg-red-50 transition-colors">'
            + '<div>'
            + '<div class="font-medium text-gray-800 text-sm">' + escapeHtml(item.client_name || '-') + '</div>'
            + '<div class="text-xs text-gray-500 mt-0.5">연체 ' + (item.overdue_count || 0) + '건 &nbsp;|&nbsp; 최초확인: ' + (item.first_billed_at ? formatDate(item.first_billed_at) : '-') + '</div>'
            + '</div>'
            + '<div class="text-right ml-4">'
            + '<div class="font-bold text-red-600 text-sm">' + overdue.toLocaleString() + '원</div>'
            + '<div class="text-xs text-gray-400">미수금</div>'
            + '</div>'
            + '</div>';
    }).join('');

    container.innerHTML =
        '<div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">'
        + '<div class="flex items-center gap-2 mb-3">'
        + '<i class="fas fa-exclamation-circle text-red-500"></i>'
        + '<h3 class="text-sm font-bold text-red-700">미수금 경고 (' + overdueList.length + '개 거래처)</h3>'
        + '</div>'
        + '<div class="space-y-2">' + cardsHtml + '</div>'
        + '</div>';
}

// Add payment
var _addPaymentInProgress = false;
async function addPayment() {
    if (_addPaymentInProgress) return;
    if (!selectedClientId) {
        showToast('거래처를 먼저 선택해주세요', 'warning');
        return;
    }
    var amount = parseMoney(document.getElementById('paymentAmount').value);
    var paymentDate = document.getElementById('paymentDate').value;
    var method = document.getElementById('paymentMethod').value;
    var ref = document.getElementById('paymentRef').value;
    var notes = document.getElementById('paymentNotes').value;

    if (!amount || amount <= 0) {
        showToast('유효한 입금액을 입력해주세요', 'warning');
        return;
    }
    if (!paymentDate) {
        showToast('입금일을 선택해주세요', 'warning');
        return;
    }

    _addPaymentInProgress = true;
    try {
        var res = await axios.post('/api/ledger/payment', {
            client_id: selectedClientId,
            amount: amount,
            payment_date: paymentDate,
            payment_method: method || null,
            reference_number: ref || null,
            notes: notes || null
        });
        if (res.data.success) {
            showToast('입금이 등록되었습니다 (' + amount.toLocaleString() + '원)', 'success');
            document.getElementById('paymentAmount').value = '';
            document.getElementById('paymentRef').value = '';
            document.getElementById('paymentNotes').value = '';
            await loadClientDetail(selectedClientId);
            await loadSettlement();
        } else {
            showToast(res.data.error || '등록 실패', 'error');
        }
    } catch (e) {
        console.error('Add payment error:', e);
        showToast('입금 등록 실패: ' + (e.response?.data?.error || e.message), 'error');
    } finally {
        _addPaymentInProgress = false;
    }
}

// Edit payment
async function editPayment(paymentId) {
    try {
        var res = await axios.get('/api/ledger/payment/' + paymentId);
        if (res.data.success) {
            var p = res.data.data;
            document.getElementById('editPaymentId').value = p.id;
            document.getElementById('editAmount').value = fmtMoneyInput(p.amount);
            document.getElementById('editDate').value = p.payment_date;
            document.getElementById('editMethod').value = p.payment_method || '';
            document.getElementById('editRef').value = p.reference_number || '';
            document.getElementById('editNotes').value = p.notes || '';
            document.getElementById('paymentEditModal').classList.add('show');
        }
    } catch (e) {
        showToast('입금 정보 로드 실패', 'error');
    }
}
window.editPayment = editPayment;

async function savePaymentEdit() {
    var id = document.getElementById('editPaymentId').value;
    var amount = parseMoney(document.getElementById('editAmount').value);
    if (!amount || amount <= 0) {
        showToast('유효한 금액을 입력해주세요', 'warning');
        return;
    }
    try {
        var res = await axios.put('/api/ledger/payment/' + id, {
            amount: amount,
            payment_date: document.getElementById('editDate').value,
            payment_method: document.getElementById('editMethod').value || null,
            reference_number: document.getElementById('editRef').value || null,
            notes: document.getElementById('editNotes').value || null
        });
        if (res.data.success) {
            showToast('입금 내역이 수정되었습니다', 'success');
            closePaymentModal();
            await loadClientDetail(selectedClientId);
            await loadSettlement();
        } else {
            showToast(res.data.error || '수정 실패', 'error');
        }
    } catch (e) {
        showToast('수정 실패: ' + (e.response?.data?.error || e.message), 'error');
    }
}

function closePaymentModal() {
    document.getElementById('paymentEditModal').classList.remove('show');
}

// Delete payment
async function deletePayment(paymentId, amount) {
    if (!(await showConfirm('입금 내역(' + amount.toLocaleString() + '원)을 삭제하시겠습니까?\n삭제 시 거래처 잔액이 복원됩니다.', { danger: true }))) return;
    try {
        var res = await axios.delete('/api/ledger/payment/' + paymentId);
        if (res.data.success) {
            showToast('입금 내역이 삭제되었습니다', 'success');
            await loadClientDetail(selectedClientId);
            await loadSettlement();
        } else {
            showToast(res.data.error || '삭제 실패', 'error');
        }
    } catch (e) {
        showToast('삭제 실패: ' + (e.response?.data?.error || e.message), 'error');
    }
}
window.deletePayment = deletePayment;

// Monthly summary
async function loadMonthlySummary() {
    try {
        var res = await axios.get('/api/ledger/monthly-summary?months=12');
        if (res.data.success) {
            var data = res.data.data || [];
            var container = document.getElementById('monthlyChart');
            container.innerHTML = '';

            if (data.length === 0) {
                container.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">데이터 없음</p>';
                return;
            }

            // Find max for scale
            var maxVal = 0;
            data.forEach(function(m) {
                if (m.total_sales > maxVal) maxVal = m.total_sales;
                if (m.total_payments > maxVal) maxVal = m.total_payments;
            });
            if (maxVal === 0) maxVal = 1;

            // Render bars (most recent first, but reverse for chronological display)
            data.slice().reverse().forEach(function(m) {
                var salesW = Math.round(m.total_sales / maxVal * 100);
                var payW = Math.round(m.total_payments / maxVal * 100);
                var row = document.createElement('div');
                row.className = 'flex items-center gap-2 text-xs';
                row.innerHTML =
                    '<span class="w-16 text-gray-500 text-right shrink-0">' + m.month + '</span>' +
                    '<div class="flex-1 flex flex-col gap-0.5">' +
                    '  <div class="flex items-center gap-1">' +
                    '    <div class="bar-cell bg-blue-400" style="width:' + salesW + '%"></div>' +
                    '    <span class="text-blue-600 shrink-0">' + (m.total_sales > 0 ? m.total_sales.toLocaleString() : '') + '</span>' +
                    '  </div>' +
                    '  <div class="flex items-center gap-1">' +
                    '    <div class="bar-cell bg-green-400" style="width:' + payW + '%"></div>' +
                    '    <span class="text-green-600 shrink-0">' + (m.total_payments > 0 ? m.total_payments.toLocaleString() : '') + '</span>' +
                    '  </div>' +
                    '</div>';
                container.appendChild(row);
            });

            // Legend
            var legend = document.createElement('div');
            legend.className = 'flex gap-4 justify-center mt-2 text-xs text-gray-500';
            legend.innerHTML = '<span><span class="inline-block w-3 h-3 bg-blue-400 rounded mr-1"></span>매출</span><span><span class="inline-block w-3 h-3 bg-green-400 rounded mr-1"></span>입금</span>';
            container.appendChild(legend);
        }
    } catch (e) {
        console.error('Monthly summary error:', e);
    }
}

function toggleMonthly() {
    var sec = document.getElementById('monthlySection');
    var icon = document.getElementById('monthlyToggleIcon');
    sec.classList.toggle('hidden');
    icon.classList.toggle('fa-chevron-down');
    icon.classList.toggle('fa-chevron-up');
}

// CSV Export
function exportClientsCSV() {
    if (allClients.length === 0) { showToast('내보낼 데이터가 없습니다', 'info'); return; }
    var bom = '\uFEFF';
    var csv = bom + '거래처코드,거래처명,주문수,매출,입금,잔액\n';
    allClients.forEach(function(cl) {
        csv += '"' + (cl.client_code || '').replace(/"/g, '""') + '","' + (cl.client_name || '').replace(/"/g, '""') + '",' + (cl.order_count || 0) + ',' + (cl.total_sales || 0) + ',' + (cl.total_payments || 0) + ',' + (cl.balance || 0) + '\n';
    });
    downloadCSV(csv, 'ledger_clients.csv');
}

function exportTransactionsCSV() {
    var rows = document.querySelectorAll('#transactionsTableBody tr');
    if (rows.length === 0 || (rows.length === 1 && rows[0].querySelector('td[colspan]'))) {
        showToast('내보낼 데이터가 없습니다', 'info');
        return;
    }
    var bom = '\uFEFF';
    var csv = bom + '일시,유형,상세,차변,대변,잔액\n';
    rows.forEach(function(row) {
        var cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
            var vals = [];
            cells.forEach(function(c) { vals.push('"' + c.textContent.trim().replace(/"/g, '""') + '"'); });
            csv += vals.join(',') + '\n';
        }
    });
    downloadCSV(csv, 'ledger_transactions_' + (selectedClientName || 'all') + '.csv');
}

function downloadCSV(csv, filename) {
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('CSV 다운로드 완료', 'success');
}

async function exportLedgerCsv() {
    if (!selectedClientId) { showToast('거래처를 선택하세요.', 'warning'); return; }
    try {
        var params = new URLSearchParams();
        var startDate = document.getElementById('startDate')?.value || '';
        var endDate = document.getElementById('endDate')?.value || '';
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);

        var res = await authFetch('/api/ledger/client/' + selectedClientId + '/export/csv?' + params.toString());
        if (!res.ok) throw new Error('Export failed');
        var blob = await res.blob();
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = '원장_' + new Date().toISOString().slice(0,10) + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch(e) {
        showToast('CSV 내보내기 실패: ' + e.message, 'error');
    }
}

// Utility
function formatDate(dateStr) {
    if (!dateStr) return '-';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function refreshAll() {
    loadSettlement();
    loadMonthlySummary();
    if (selectedClientId) loadClientDetail(selectedClientId);
    showToast('새로고침 완료', 'success');
}

// ===== Tab Switch (매출/매입) =====
function switchLedgerTab(tab) {
    var salesTab = document.getElementById('tabSales');
    var purchaseTab = document.getElementById('tabPurchase');
    var salesContent = document.getElementById('salesContent');
    var purchaseContent = document.getElementById('purchaseContent');
    var activeClass = 'px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600';
    var inactiveClass = 'px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700';
    if (tab === 'sales') {
        salesTab.className = activeClass;
        purchaseTab.className = inactiveClass;
        salesContent.style.display = '';
        purchaseContent.style.display = 'none';
    } else {
        purchaseTab.className = activeClass;
        salesTab.className = inactiveClass;
        salesContent.style.display = 'none';
        purchaseContent.style.display = '';
        loadPurchaseSettlement();
        loadPurchaseMonthlySummary();
        loadPurchaseOverdue();
    }
}

// ===== Purchase Ledger State =====
var selectedSupplierId = null;
var selectedSupplierName = '';
var allSuppliers = [];

async function loadPurchaseSettlement() {
    try {
        var dateP = getDateParams();
        var res = await axios.get('/api/ledger/purchase-settlement' + (dateP ? '?' + dateP.substring(1) : ''));
        if (res.data.success) {
            var d = res.data.data;
            var s = d.summary || {};
            document.getElementById('pTotalPurchase').textContent = (s.total_purchases || 0).toLocaleString() + '원';
            document.getElementById('pTotalPayments').textContent = (s.total_payments || 0).toLocaleString() + '원';
            document.getElementById('pTotalBalance').textContent = (s.total_balance || 0).toLocaleString() + '원';
            document.getElementById('pTotalSuppliers').textContent = s.total_suppliers || 0;
            allSuppliers = d.suppliers || [];
            renderSupplierTable(allSuppliers);
        }
    } catch (e) {
        console.error('Purchase settlement error:', e);
        showToast('매입 정산 데이터 로드 실패', 'error');
    }
}

function renderSupplierTable(suppliers) {
    var tbody = document.getElementById('supplierTableBody');
    var tfoot = document.getElementById('supplierTableFoot');
    tbody.innerHTML = '';
    var sumPurchase = 0, sumPayments = 0, sumBalance = 0, sumOrders = 0;
    suppliers.forEach(function(sp) {
        sumPurchase += sp.total_purchases || 0;
        sumPayments += sp.total_payments || 0;
        sumBalance += sp.purchase_balance || 0;
        sumOrders += sp.po_count || 0;
        var balColor = sp.purchase_balance > 0 ? 'text-red-600 font-bold' : sp.purchase_balance < 0 ? 'text-blue-600' : 'text-green-600';
        var activeClass = selectedSupplierId == sp.id ? ' active' : '';
        var row = document.createElement('tr');
        row.className = 'client-row' + activeClass;
        row.dataset.id = sp.id;
        row.onclick = function() { selectSupplier(sp.id, sp.client_name || sp.supplier_name || ''); };
        row.innerHTML =
            '<td class="px-4 py-2 font-medium">' + escapeHtml(sp.client_name || sp.supplier_name || '') + '</td>' +
            '<td class="px-4 py-2 text-right">' + (sp.po_count || 0) + '</td>' +
            '<td class="px-4 py-2 text-right">' + (sp.total_purchases || 0).toLocaleString() + '</td>' +
            '<td class="px-4 py-2 text-right">' + (sp.total_payments || 0).toLocaleString() + '</td>' +
            '<td class="px-4 py-2 text-right ' + balColor + '">' + (sp.purchase_balance || 0).toLocaleString() + '</td>';
        tbody.appendChild(row);
    });
    tfoot.innerHTML =
        '<tr>' +
        '<td class="px-4 py-2">합계 (' + suppliers.length + '개 공급업체)</td>' +
        '<td class="px-4 py-2 text-right">' + sumOrders + '</td>' +
        '<td class="px-4 py-2 text-right">' + sumPurchase.toLocaleString() + '</td>' +
        '<td class="px-4 py-2 text-right">' + sumPayments.toLocaleString() + '</td>' +
        '<td class="px-4 py-2 text-right ' + (sumBalance > 0 ? 'text-red-600' : 'text-green-600') + '">' + sumBalance.toLocaleString() + '</td>' +
        '</tr>';
}

function filterSupplierTable() {
    var q = document.getElementById('supplierSearch').value.toLowerCase();
    var filtered = allSuppliers.filter(function(sp) {
        return (sp.client_name || sp.supplier_name || '').toLowerCase().indexOf(q) >= 0;
    });
    renderSupplierTable(filtered);
}

function selectSupplier(supplierId, supplierName) {
    selectedSupplierId = supplierId;
    currentPurchaseClientId = supplierId;
    selectedSupplierName = supplierName;
    document.getElementById('pPaymentDate').value = new Date().toISOString().split('T')[0];
    document.querySelectorAll('#supplierTableBody .client-row').forEach(function(r) {
        r.classList.toggle('active', r.dataset.id == supplierId);
    });
    openDetailModal(supplierId, supplierName, 'purchase');
    loadPurchaseClientLedger(supplierId);
}

function closePurchaseDetail() {
    closeDetailModal();
}

async function loadPurchaseClientLedger(clientId) {
    try {
        var res = await axios.get('/api/ledger/purchase-client/' + clientId);
        if (res.data.success) {
            var d = res.data.data;
            var s = d.summary || {};
            document.getElementById('pClientTotalPurchase').textContent = (s.total_purchase || 0).toLocaleString() + '원';
            document.getElementById('pClientTotalPayments').textContent = (s.total_payments || 0).toLocaleString() + '원';
            document.getElementById('pClientBalance').textContent = (s.balance || 0).toLocaleString() + '원';
            document.getElementById('pClientLastPayment').textContent = s.last_payment_date || '-';

            var txBody = document.getElementById('pTransactionsBody');
            txBody.innerHTML = '';
            (d.transactions || []).forEach(function(tx) {
                var row = document.createElement('tr');
                row.className = 'hover:bg-gray-50';
                var isPO = tx.type === 'purchase_order' || tx.type === 'order';
                var badgeClass = isPO ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700';
                var badgeText = isPO ? '발주' : '지급';
                var balClass = (tx.balance || 0) > 0 ? 'text-red-600 font-medium' : 'text-green-600';
                row.innerHTML =
                    '<td class="px-4 py-2 text-gray-600">' + formatDate(tx.date) + '</td>' +
                    '<td class="px-4 py-2"><span class="px-2 py-0.5 text-xs rounded ' + badgeClass + '">' + badgeText + '</span></td>' +
                    '<td class="px-4 py-2">' + (tx.description || '-') + '</td>' +
                    '<td class="px-4 py-2 text-right">' + ((tx.debit || 0) > 0 ? (tx.debit).toLocaleString() : '-') + '</td>' +
                    '<td class="px-4 py-2 text-right">' + ((tx.credit || 0) > 0 ? (tx.credit).toLocaleString() : '-') + '</td>' +
                    '<td class="px-4 py-2 text-right ' + balClass + '">' + (tx.balance || 0).toLocaleString() + '</td>';
                txBody.appendChild(row);
            });
            if ((d.transactions || []).length === 0) {
                txBody.innerHTML = '<tr><td colspan="6" class="text-center py-10"><i class="fas fa-receipt text-3xl mb-2 block text-gray-300"></i><div class="text-sm text-gray-400">거래 내역이 없습니다</div></td></tr>';
            }

            var pBody = document.getElementById('pPaymentsBody');
            pBody.innerHTML = '';
            var payments = d.payments || [];
            if (payments.length === 0) {
                pBody.innerHTML = '<tr><td colspan="7" class="text-center py-10"><i class="fas fa-coins text-3xl mb-2 block text-gray-300"></i><div class="text-sm text-gray-400">지급 내역이 없습니다</div></td></tr>';
            } else {
                payments.forEach(function(p) {
                    var row = document.createElement('tr');
                    row.className = 'hover:bg-gray-50';
                    row.innerHTML =
                        '<td class="px-4 py-2">' + (p.payment_date || '') + '</td>' +
                        '<td class="px-4 py-2 text-right font-medium text-green-700">' + (p.amount || 0).toLocaleString() + '원</td>' +
                        '<td class="px-4 py-2">' + (p.payment_method || '-') + '</td>' +
                        '<td class="px-4 py-2 text-gray-500">' + (p.reference_number || '-') + '</td>' +
                        '<td class="px-4 py-2 text-gray-500">' + (p.notes || '-') + '</td>' +
                        '<td class="px-4 py-2 text-gray-500">' + (p.created_by_name || '-') + '</td>' +
                        '<td class="px-4 py-2 text-center act-col">' +
                        '<button onclick="editPurchasePayment(this)" ' +
                        'data-id="' + p.id + '" ' +
                        'data-date="' + (p.payment_date || '') + '" ' +
                        'data-amount="' + (p.amount || 0) + '" ' +
                        'data-method="' + (p.payment_method || '계좌이체') + '" ' +
                        'data-ref="' + (p.reference_number || '') + '" ' +
                        'data-notes="' + (p.notes || '') + '" ' +
                        'class="text-blue-500 hover:text-blue-700 mr-2 text-sm"><i class="fas fa-edit"></i></button>' +
                        '<button onclick="deletePurchasePayment(' + p.id + ', ' + (p.amount || 0) + ')" class="text-red-500 hover:text-red-700 text-sm"><i class="fas fa-trash"></i></button>' +
                        '</td>';
                    pBody.appendChild(row);
                });
            }
        }
    } catch (e) {
        console.error('Purchase client ledger error:', e);
        showToast('공급업체 상세 로드 실패', 'error');
    }
}

async function addPurchasePayment() {
    if (!selectedSupplierId) {
        showToast('공급업체를 먼저 선택해주세요', 'warning');
        return;
    }
    var amount = parseMoney(document.getElementById('pPaymentAmount').value);
    var paymentDate = document.getElementById('pPaymentDate').value;
    var method = document.getElementById('pPaymentMethod').value;
    var ref = document.getElementById('pPaymentRef').value;
    var notes = document.getElementById('pPaymentNotes').value;
    if (!amount || amount <= 0) {
        showToast('유효한 지급액을 입력해주세요', 'warning');
        return;
    }
    if (!paymentDate) {
        showToast('지급일을 선택해주세요', 'warning');
        return;
    }
    try {
        var res = await axios.post('/api/ledger/purchase-payment', {
            supplier_id: selectedSupplierId,
            amount: amount,
            payment_date: paymentDate,
            payment_method: method || null,
            reference_number: ref || null,
            notes: notes || null
        });
        if (res.data.success) {
            showToast('지급이 등록되었습니다 (' + amount.toLocaleString() + '원)', 'success');
            document.getElementById('pPaymentAmount').value = '';
            document.getElementById('pPaymentRef').value = '';
            document.getElementById('pPaymentNotes').value = '';
            await loadPurchaseClientLedger(selectedSupplierId);
            await loadPurchaseSettlement();
        } else {
            showToast(res.data.error || '등록 실패', 'error');
        }
    } catch (e) {
        console.error('Add purchase payment error:', e);
        showToast('지급 등록 실패: ' + (e.response?.data?.error || e.message), 'error');
    }
}

// ===== Purchase Payment Edit/Delete =====
function editPurchasePayment(btn) {
    document.getElementById('pEditPaymentId').value = btn.dataset.id;
    document.getElementById('pEditPaymentDate').value = btn.dataset.date;
    document.getElementById('pEditPaymentAmount').value = fmtMoneyInput(btn.dataset.amount);
    document.getElementById('pEditPaymentMethod').value = btn.dataset.method;
    document.getElementById('pEditPaymentRef').value = btn.dataset.ref;
    document.getElementById('pEditPaymentNotes').value = btn.dataset.notes;
    document.getElementById('pPaymentEditModal').classList.remove('hidden');
}

async function savePurchasePaymentEdit() {
    var id = document.getElementById('pEditPaymentId').value;
    if (!id) return;
    var amount = parseMoney(document.getElementById('pEditPaymentAmount').value);
    if (!amount || amount <= 0) { showToast('금액을 입력해주세요.', 'warning'); return; }
    var data = {
        payment_date: document.getElementById('pEditPaymentDate').value,
        amount: amount,
        payment_method: document.getElementById('pEditPaymentMethod').value,
        reference_number: document.getElementById('pEditPaymentRef').value,
        notes: document.getElementById('pEditPaymentNotes').value
    };
    try {
        await axios.put('/api/ledger/purchase-payment/' + id, data);
        document.getElementById('pPaymentEditModal').classList.add('hidden');
        loadPurchaseClientLedger(selectedSupplierId);
        loadPurchaseSettlement();
        showToast('지급 내역이 수정되었습니다.');
    } catch (e) {
        showToast('수정 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
    }
}

async function deletePurchasePayment(id, amount) {
    if (!(await showConfirm('지급 내역 ' + amount.toLocaleString() + '원을 삭제하시겠습니까?', { danger: true }))) return;
    try {
        await axios.delete('/api/ledger/purchase-payment/' + id);
        loadPurchaseClientLedger(selectedSupplierId);
        loadPurchaseSettlement();
        showToast('지급 내역이 삭제되었습니다.');
    } catch (e) {
        showToast('삭제 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
    }
}

// ===== Purchase Monthly Chart =====
function loadPurchaseMonthlySummary() {
    axios.get('/api/ledger/purchase-monthly-summary?months=12').then(function(res) {
        if (res.data.success) {
            var months = (res.data.data && res.data.data.months) ? res.data.data.months : (res.data.data || []);
            var chart = document.getElementById('pMonthlyChart');
            if (!chart) return;
            if (!months.length) {
                chart.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">데이터 없음</p>';
                return;
            }
            var maxVal = 0;
            months.forEach(function(m) {
                if ((m.total_purchases || 0) > maxVal) maxVal = m.total_purchases;
                if ((m.total_payments || 0) > maxVal) maxVal = m.total_payments;
            });
            if (maxVal === 0) maxVal = 1;
            var html = '';
            months.slice().reverse().forEach(function(m) {
                var purchaseW = Math.round((m.total_purchases || 0) / maxVal * 100);
                var paymentW = Math.round((m.total_payments || 0) / maxVal * 100);
                html += '<div class="flex items-center gap-2 text-xs">'
                    + '<span class="w-16 text-gray-500">' + (m.month || '') + '</span>'
                    + '<div class="flex-1">'
                    + '<div class="flex gap-1 mb-0.5">'
                    + '<div class="h-3 bg-orange-400 rounded" style="width:' + purchaseW + '%" title="매입: ' + (m.total_purchases || 0).toLocaleString() + '원"></div>'
                    + '</div>'
                    + '<div class="flex gap-1">'
                    + '<div class="h-3 bg-green-400 rounded" style="width:' + paymentW + '%" title="지급: ' + (m.total_payments || 0).toLocaleString() + '원"></div>'
                    + '</div>'
                    + '</div>'
                    + '<span class="w-24 text-right text-gray-500">' + (m.total_purchases || 0).toLocaleString() + '</span>'
                    + '</div>';
            });
            html += '<div class="flex gap-4 justify-center mt-2 text-xs text-gray-500">'
                + '<span><span class="inline-block w-3 h-3 bg-orange-400 rounded mr-1"></span>매입</span>'
                + '<span><span class="inline-block w-3 h-3 bg-green-400 rounded mr-1"></span>지급</span>'
                + '</div>';
            chart.innerHTML = html;
        }
    }).catch(function(e) { console.error(e); });
}

function togglePurchaseMonthly() {
    var chart = document.getElementById('pMonthlyChart');
    chart.classList.toggle('hidden');
    var icon = document.getElementById('pMonthlyToggleIcon');
    icon.className = chart.classList.contains('hidden') ? 'fas fa-chevron-right' : 'fas fa-chevron-down';
}

// ===== Purchase CSV Export =====
function exportSuppliersCSV() {
    var bom = '\uFEFF';
    var csv = bom + '공급업체명,발주수,총매입,총지급,잔액\n';
    allSuppliers.forEach(function(sp) {
        csv += '"' + (sp.client_name || '') + '",' + (sp.po_count || 0) + ',' + (sp.total_purchases || 0) + ',' + (sp.total_payments || 0) + ',' + (sp.purchase_balance || 0) + '\n';
    });
    downloadCSV(csv, 'purchase_settlement_' + new Date().toISOString().split('T')[0] + '.csv');
}

function exportPurchaseTransactionsCSV() {
    var body = document.getElementById('pTransactionsBody');
    if (!body) return;
    var bom = '\uFEFF';
    var csv = bom + '일시,유형,상세,차변(매입),대변(지급),잔액\n';
    var rows = body.querySelectorAll('tr');
    rows.forEach(function(row) {
        var cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
            var vals = [];
            for (var i = 0; i < cells.length; i++) {
                vals.push('"' + (cells[i].textContent || '').replace(/"/g, '""') + '"');
            }
            csv += vals.join(',') + '\n';
        }
    });
    downloadCSV(csv, 'purchase_transactions_' + new Date().toISOString().split('T')[0] + '.csv');
}

// ===== Collection Logs (수금 독촉 이력) =====
var collectionMethodLabels = {
    'PHONE': '전화', 'SMS': '문자', 'EMAIL': '이메일',
    'VISIT': '방문', 'LETTER': '내용증명', 'OTHER': '기타'
};

async function loadCollectionLogs(clientId) {
    var tbody = document.getElementById('collectionLogsBody');
    if (!tbody) return;
    try {
        var res = await axios.get('/api/ledger/collection-logs/' + clientId);
        if (!res.data.success) return;
        var logs = res.data.data || [];
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10"><i class="fas fa-bell text-3xl mb-2 block text-gray-300"></i><div class="text-sm text-gray-400">독촉 이력이 없습니다</div></td></tr>';
            return;
        }
        tbody.innerHTML = logs.map(function(cl) {
            var methodLabel = collectionMethodLabels[cl.contact_method] || cl.contact_method;
            var promisedOk = '';
            if (cl.promised_date) {
                var now = new Date(); now.setHours(0,0,0,0);
                var pd = new Date(cl.promised_date); pd.setHours(0,0,0,0);
                if (pd < now) promisedOk = ' <span class="text-red-500 text-xs">(미이행)</span>';
            }
            return '<tr class="hover:bg-gray-50">'
                + '<td class="px-4 py-2 text-gray-600">' + formatDate(cl.contact_date) + '</td>'
                + '<td class="px-4 py-2"><span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-700">' + methodLabel + '</span></td>'
                + '<td class="px-4 py-2">' + (cl.contact_person || cl.created_by_name || '-') + '</td>'
                + '<td class="px-4 py-2">' + (cl.promised_date ? formatDate(cl.promised_date) + promisedOk : '-') + '</td>'
                + '<td class="px-4 py-2 text-right">' + (cl.promised_amount ? cl.promised_amount.toLocaleString() + '원' : '-') + '</td>'
                + '<td class="px-4 py-2 text-gray-500 text-xs">' + (cl.notes || '-') + '</td>'
                + '<td class="px-4 py-2 text-center act-col">'
                + '<button onclick="deleteCollectionLog(' + cl.id + ')" class="text-red-400 hover:text-red-600 text-xs" title="삭제"><i class="fas fa-trash"></i></button>'
                + '</td></tr>';
        }).join('');
    } catch(e) {
        console.error('Load collection logs error:', e);
        showToast('독촉 이력 조회 실패', 'error');
    }
}

function openCollectionModal() {
    if (!selectedClientId) { showToast('거래처를 먼저 선택하세요', 'error'); return; }
    document.getElementById('colDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('colMethod').value = 'PHONE';
    document.getElementById('colPerson').value = '';
    document.getElementById('colPromisedDate').value = '';
    document.getElementById('colPromisedAmount').value = '';
    document.getElementById('colNotes').value = '';
    var modal = document.getElementById('collectionModal');
    modal.classList.remove('hidden');
    modal.classList.add('show');
    modal.style.display = 'flex';
}

function closeCollectionModal() {
    var modal = document.getElementById('collectionModal');
    modal.classList.add('hidden');
    modal.classList.remove('show');
    modal.style.display = 'none';
}

async function saveCollectionLog() {
    if (!selectedClientId) return;
    var data = {
        client_id: parseInt(selectedClientId),
        contact_date: document.getElementById('colDate').value,
        contact_method: document.getElementById('colMethod').value,
        contact_person: document.getElementById('colPerson').value.trim() || undefined,
        promised_date: document.getElementById('colPromisedDate').value || undefined,
        promised_amount: parseMoney(document.getElementById('colPromisedAmount').value) || undefined,
        notes: document.getElementById('colNotes').value.trim() || undefined
    };
    if (!data.contact_date || !data.contact_method) {
        showToast('연락일과 연락 방법은 필수입니다', 'error');
        return;
    }
    try {
        var res = await axios.post('/api/ledger/collection-log', data);
        if (res.data.success) {
            showToast('독촉 이력이 등록되었습니다', 'success');
            closeCollectionModal();
            loadCollectionLogs(selectedClientId);
        } else {
            showToast(res.data.error || '등록 실패', 'error');
        }
    } catch(e) {
        showToast('독촉 이력 등록 오류', 'error');
    }
}

async function deleteCollectionLog(id) {
    if (!(await showConfirm('이 독촉 이력을 삭제하시겠습니까?', { danger: true }))) return;
    try {
        var res = await axios.delete('/api/ledger/collection-log/' + id);
        if (res.data.success) {
            showToast('삭제되었습니다', 'success');
            loadCollectionLogs(selectedClientId);
        } else {
            showToast(res.data.error || '삭제 실패', 'error');
        }
    } catch(e) {
        showToast('삭제 오류', 'error');
    }
}

// ===== 잔액 정합성 검사 =====
var _integrityDiscrepancies = [];

async function runIntegrityCheck() {
    try {
        showToast('정합성 검사 중...', 'info');
        var res = await axios.get('/api/ledger/integrity-check');
        if (!res.data.success) { showToast(res.data.error || '검사 실패', 'error'); return; }

        var d = res.data.data;
        _integrityDiscrepancies = d.discrepancies || [];
        var panel = document.getElementById('integrityPanel');
        var body = document.getElementById('integrityBody');
        var countEl = document.getElementById('integrityCount');

        if (d.discrepancy_count === 0) {
            panel.classList.add('hidden');
            _integrityDiscrepancies = [];
            showToast('전체 ' + d.total_checked + '개 거래처 잔액 정상', 'success');
            return;
        }

        countEl.textContent = d.discrepancy_count;
        body.innerHTML = '';
        d.discrepancies.forEach(function(item) {
            var diffColor = item.difference > 0 ? 'text-red-600' : 'text-blue-600';
            var sign = item.difference > 0 ? '+' : '';
            body.innerHTML += '<tr>'
                + '<td class="text-left">' + escapeHtml(item.client_name || '') + '</td>'
                + '<td class="text-right">' + Number(item.cached_balance).toLocaleString() + '</td>'
                + '<td class="text-right font-bold">' + Number(item.calculated_balance).toLocaleString() + '</td>'
                + '<td class="text-right ' + diffColor + ' font-bold">' + sign + Number(item.difference).toLocaleString() + '</td>'
                + '<td class="text-center"><button onclick="fixSingleIntegrity(' + item.client_id + ')" class="text-xs text-orange-600 hover:text-orange-800 underline">수정</button></td>'
                + '</tr>';
        });
        panel.classList.remove('hidden');
        showToast(d.total_checked + '개 검사, ' + d.discrepancy_count + '건 불일치 발견', 'warning');
    } catch(e) {
        showToast('정합성 검사 오류: ' + (e.response?.data?.error || e.message), 'error');
    }
}

async function fixSingleIntegrity(clientId) {
    if (!(await showConfirm('이 거래처의 잔액을 재계산하시겠습니까?'))) return;
    try {
        var res = await axios.post('/api/ledger/recalculate/' + clientId, {});
        if (res.data.success) {
            showToast('잔액 수정 완료 (차이: ' + Number(res.data.data.difference).toLocaleString() + ')', 'success');
            runIntegrityCheck();
            loadSettlement();
        }
    } catch(e) {
        showToast('수정 실패: ' + (e.response?.data?.error || e.message), 'error');
    }
}

async function fixAllIntegrity() {
    if (!(await showConfirm('불일치 거래처의 잔액을 모두 재계산하시겠습니까?'))) return;
    try {
        var ids = _integrityDiscrepancies.map(function(d) { return d.client_id; });
        var res = await axios.post('/api/ledger/integrity-fix', { client_ids: ids });
        if (res.data.success) {
            showToast(res.data.message, 'success');
            runIntegrityCheck();
            loadSettlement();
        }
    } catch(e) {
        showToast('일괄 수정 실패: ' + (e.response?.data?.error || e.message), 'error');
    }
}

// ===== Purchase Adjustment Management =====
var currentPurchaseClientId = null;

window.recordPurchaseAdjustment = function() {
    var supplierId = currentPurchaseClientId;
    if (!supplierId) { showToast('공급처를 먼저 선택하세요.', 'warning'); return; }
    var type = document.getElementById('purchAdjType').value;
    var amount = parseMoney(document.getElementById('purchAdjAmount').value);
    var date = document.getElementById('purchAdjDate').value;
    var reason = document.getElementById('purchAdjReason').value.trim();
    var poId = document.getElementById('purchAdjPoId')?.value || '';

    if (!type || !amount || !date) { showToast('유형, 금액, 날짜를 입력하세요.', 'warning'); return; }

    axios.post('/api/ledger/purchase-adjustment', {
        supplier_id: supplierId,
        type: type,
        amount: amount,
        adjustment_date: date,
        reason: reason,
        po_id: poId || undefined
    }).then(function(r) {
        showToast('감액이 등록되었습니다.', 'success');
        document.getElementById('purchAdjAmount').value = '';
        document.getElementById('purchAdjReason').value = '';
        loadPurchaseClientLedger(supplierId);
        loadPurchaseSettlement();
    }).catch(function(e) {
        showToast((e.response && e.response.data && e.response.data.error) || '감액 등록 실패', 'error');
    });
};

window.deletePurchaseAdjustment = async function(id) {
    if (!(await showConfirm('이 감액을 삭제하시겠습니까? 미지급금이 복원됩니다.', { danger: true }))) return;
    axios.delete('/api/ledger/purchase-adjustment/' + id).then(function() {
        showToast('감액이 삭제되었습니다.', 'success');
        if (currentPurchaseClientId) loadPurchaseClientLedger(currentPurchaseClientId);
        loadPurchaseSettlement();
    }).catch(function(e) {
        showToast((e.response && e.response.data && e.response.data.error) || '삭제 실패', 'error');
    });
};

// ===== Purchase Overdue Warning =====
function loadPurchaseOverdue() {
    axios.get('/api/ledger/purchase-overdue').then(function(r) {
        var data = r.data.data || [];
        var container = document.getElementById('purchaseOverdueList');
        if (!container) return;
        if (!data.length) {
            container.innerHTML = '<div class="text-center py-4 text-gray-400 text-sm">미지급 경고 항목이 없습니다.</div>';
            return;
        }
        var html = '<div class="space-y-2">';
        data.forEach(function(item) {
            var badgeClass = item.is_overdue ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700';
            var badgeText = item.is_overdue ? '지급 지연' : '미지급';
            html += '<div class="flex items-center justify-between p-3 bg-white border rounded-lg">';
            html += '<div><span class="font-medium text-gray-800">' + escapeHtml(item.client_name) + '</span>';
            if (item.days_since_last_payment !== null) {
                html += '<span class="text-xs text-gray-500 ml-2">마지막 지급: ' + item.days_since_last_payment + '일 전</span>';
            }
            html += '</div>';
            html += '<div class="flex items-center gap-3">';
            html += '<span class="text-red-600 font-semibold">' + Number(item.purchase_balance).toLocaleString() + '원</span>';
            html += '<span class="rounded-full px-2.5 py-0.5 text-xs font-medium ' + badgeClass + '">' + badgeText + '</span>';
            html += '</div></div>';
        });
        html += '</div>';
        container.innerHTML = html;
    }).catch(function() {
        var container = document.getElementById('purchaseOverdueList');
        if (container) container.innerHTML = '<div class="text-center py-4 text-red-400 text-sm">미지급 경고 로딩 실패</div>';
    });
}

// ===== Purchase Integrity Check =====
window.checkPurchaseIntegrity = function() {
    var btn = document.getElementById('purchIntegrityBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>검사 중...'; }

    axios.get('/api/ledger/purchase-integrity-check').then(function(r) {
        var data = r.data.data || { mismatches: [], total_checked: 0 };
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-shield-alt mr-1"></i>정합성 검사'; }

        var panel = document.getElementById('purchIntegrityPanel');
        if (!data.mismatches.length) {
            panel.innerHTML = '<div class="p-4 bg-green-50 text-green-700 rounded-lg text-sm"><i class="fas fa-check-circle mr-1"></i>모든 공급처(' + data.total_checked + '개)의 잔액이 정확합니다.</div>';
            return;
        }

        var html = '<div class="p-3 bg-amber-50 text-amber-700 rounded-lg text-sm mb-3"><i class="fas fa-exclamation-triangle mr-1"></i>' + data.mismatches.length + '개 공급처에서 잔액 불일치가 발견되었습니다.</div>';
        html += '<table class="w-full text-sm ds-table-striped"><thead><tr class="bg-gray-50 text-gray-600 text-xs font-semibold"><th class="p-2 text-left">공급처</th><th class="p-2 text-right">저장된 잔액</th><th class="p-2 text-right">계산된 잔액</th><th class="p-2 text-right">차이</th></tr></thead><tbody>';
        data.mismatches.forEach(function(m) {
            html += '<tr class="border-b"><td class="p-2">' + escapeHtml(m.client_name) + '</td>';
            html += '<td class="p-2 text-right">' + Number(m.cached_balance).toLocaleString() + '원</td>';
            html += '<td class="p-2 text-right">' + Number(m.calculated_balance).toLocaleString() + '원</td>';
            html += '<td class="p-2 text-right text-red-600 font-medium">' + Number(m.difference).toLocaleString() + '원</td></tr>';
        });
        html += '</tbody></table>';
        html += '<div class="mt-3 text-right"><button onclick="fixPurchaseIntegrity()" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"><i class="fas fa-wrench mr-1"></i>일괄 수정</button></div>';
        panel.innerHTML = html;
    }).catch(function(e) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-shield-alt mr-1"></i>정합성 검사'; }
        showToast('정합성 검사 실패', 'error');
    });
};

window.fixPurchaseIntegrity = async function() {
    if (!(await showConfirm('불일치 잔액을 모두 수정하시겠습니까?'))) return;
    axios.post('/api/ledger/purchase-integrity-fix').then(function(r) {
        showToast(r.data.data.fixed_count + '개 공급처 잔액이 수정되었습니다.', 'success');
        loadPurchaseSettlement();
        checkPurchaseIntegrity();
    }).catch(function() { showToast('수정 실패', 'error'); });
};

// ===== Purchase CSV Export =====
window.exportPurchaseCsv = function(clientId) {
    if (!clientId) clientId = currentPurchaseClientId;
    if (!clientId) { showToast('공급처를 먼저 선택하세요.', 'warning'); return; }
    window.open('/api/ledger/purchase-client/' + clientId + '/export/csv', '_blank');
};

// ===== 원장 알림 발송 =====
var ledgerSendClientId = null;
var ledgerSendClientName = '';

async function openLedgerSendModal(clientId, clientName, balance, defaultChannel) {
    ledgerSendClientId = clientId;
    ledgerSendClientName = clientName;

    document.getElementById('ledgerSendName').value = clientName;
    document.getElementById('ledgerSendMobile').value = '';
    document.getElementById('ledgerSendEmail').value = '';
    document.getElementById('ledgerNoMobile').classList.add('hidden');
    document.getElementById('ledgerNoEmail').classList.add('hidden');

    // 채널 기본값 설정
    if (defaultChannel) {
        document.getElementById('ledgerSendChannel').value = defaultChannel;
    } else {
        document.getElementById('ledgerSendChannel').value = 'sms';
    }
    toggleLedgerChannelFields();

    // 거래처 연락처 조회
    try {
        var res = await axios.get('/api/clients/' + clientId);
        var client = res.data.data || res.data;
        var mobile = client.mobile || client.phone || '';
        var email = client.email || '';
        document.getElementById('ledgerSendMobile').value = mobile;
        document.getElementById('ledgerSendEmail').value = email;
        if (!mobile) {
            document.getElementById('ledgerNoMobile').classList.remove('hidden');
        }
        if (!email) {
            document.getElementById('ledgerNoEmail').classList.remove('hidden');
        }
    } catch(e) {
        document.getElementById('ledgerNoMobile').classList.remove('hidden');
        document.getElementById('ledgerNoEmail').classList.remove('hidden');
    }

    // 기본 메시지 세팅
    var balanceText = (balance || 0).toLocaleString() + '원';
    var today = new Date().toISOString().slice(0, 10);
    document.getElementById('ledgerSendContent').value =
        clientName + '님, 동산기획입니다.\n\n'
        + '거래 내역을 안내드립니다.\n\n'
        + '■ 미수금: ' + balanceText + '\n'
        + '■ 기준일: ' + today + '\n\n'
        + '상세 내역은 아래 링크에서 확인하세요.\n\n'
        + '문의: 042-523-1982';

    // 카카오톡 템플릿 드롭다운 로드
    try {
        var tplRes = await axios.get('/api/kakao/templates');
        if (tplRes.data.success) {
            var tpls = (tplRes.data.data || []).filter(function(t) { return t.state === 'S' || t.state === '3'; });
            var sel = document.getElementById('ledgerTemplateCode');
            if (sel) {
                sel.innerHTML = '<option value="">직접 작성 (템플릿 없이)</option>' + tpls.map(function(t) {
                    return '<option value="' + t.templateCode + '">' + t.templateName + '</option>';
                }).join('');
                // 자동 선택: ledger_notice
                sel.value = 'ledger_notice';
            }
        }
    } catch(e) {}

    var modal = document.getElementById('ledgerSendModal');
    modal.classList.remove('hidden');
    modal.onclick = function(e) {
        if (e.target === this) closeLedgerSendModal();
    };
}

function toggleLedgerChannelFields() {
    var channel = document.getElementById('ledgerSendChannel').value;
    var phoneRow = document.getElementById('ledgerPhoneRow');
    var emailRow = document.getElementById('ledgerEmailRow');
    if (channel === 'email') {
        phoneRow.classList.add('hidden');
        emailRow.classList.remove('hidden');
    } else {
        phoneRow.classList.remove('hidden');
        emailRow.classList.add('hidden');
    }
}

function closeLedgerSendModal() {
    document.getElementById('ledgerSendModal').classList.add('hidden');
}

async function sendLedgerNotification() {
    var content = document.getElementById('ledgerSendContent').value.trim();
    var channel = document.getElementById('ledgerSendChannel').value;

    // 이메일 채널 별도 처리
    if (channel === 'email') {
        var toEmail = document.getElementById('ledgerSendEmail').value.trim();
        if (!toEmail) { showToast('이메일 주소를 입력해주세요', 'warning'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) { showToast('올바른 이메일 형식이 아닙니다', 'warning'); return; }

        if (!(await showConfirm(ledgerSendClientName + '에게 이메일을 발송합니다.'))) return;

        try {
            var emailPayload = {
                client_id: ledgerSendClientId,
                to_email: toEmail,
                period_start: currentDateFilter.startDate || '',
                period_end: currentDateFilter.endDate || ''
            };
            var emailRes = await axios.post('/api/ledger/send-email', emailPayload);
            if (emailRes.data.success) {
                showToast('이메일 발송 완료', 'success');
                closeLedgerSendModal();
            } else {
                showToast(emailRes.data.error || '이메일 발송 실패', 'error');
            }
        } catch(e) {
            showToast('이메일 발송 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
        }
        return;
    }

    var mobile = document.getElementById('ledgerSendMobile').value.trim();

    if (!mobile) { showToast('수신번호를 입력해주세요', 'warning'); return; }
    if (!content) { showToast('메시지 내용을 입력해주세요', 'warning'); return; }

    var channelLabel = channel === 'alimtalk' ? '카카오톡' : '문자';
    if (!(await showConfirm(ledgerSendClientName + '에게 ' + channelLabel + '를 발송합니다.'))) return;

    try {
        // 포털 임시 토큰 생성 후 링크 삽입
        var portalUrl = '';
        try {
            var tokenRes = await axios.post('/api/portal/generate-token', { client_id: ledgerSendClientId });
            if (tokenRes.data.success) {
                portalUrl = tokenRes.data.data.url;
                if (content.indexOf('portal') === -1 && portalUrl) {
                    content += '\n\n▶ 거래 내역 확인: ' + portalUrl;
                }
            }
        } catch(e) {
            console.warn('Portal token generation failed:', e);
        }

        if (channel === 'alimtalk') {
            var templateCode = document.getElementById('ledgerTemplateCode').value.trim();
            var payload = {
                template_code: templateCode || '',
                receiver_num: mobile,
                receiver_name: ledgerSendClientName,
                content: content,
                client_id: ledgerSendClientId,
                related_type: 'ledger',
                related_id: ledgerSendClientId
            };
            if (portalUrl) {
                payload.buttons = [{ n: '거래 내역 확인', t: 'WL', u1: portalUrl, u2: portalUrl }];
            }
            var res = await axios.post('/api/kakao/send', payload);
            if (res.data.success) {
                showToast('카카오톡 발송 완료', 'success');
                closeLedgerSendModal();
            } else {
                showToast(res.data.error || '발송 실패', 'error');
            }
        } else {
            var subject = document.getElementById('ledgerSmsSubject').value.trim();
            var smsPayload = {
                receiver_num: mobile,
                receiver_name: ledgerSendClientName,
                content: content,
                client_id: ledgerSendClientId,
                related_type: 'ledger',
                related_id: ledgerSendClientId
            };
            if (subject) smsPayload.subject = subject;
            var res2 = await axios.post('/api/kakao/send-sms', smsPayload);
            if (res2.data.success) {
                showToast('문자 발송 완료', 'success');
                closeLedgerSendModal();
            } else {
                showToast(res2.data.error || '발송 실패', 'error');
            }
        }
    } catch(e) {
        showToast('발송 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
    }
}

// ===== Aging Data (merged from receivables) =====
async function loadAgingData() {
    try {
        var res = await axios.get('/api/ledger/receivables');
        if (res.data.success) {
            var list = res.data.data || [];
            agingMap = {};
            var over30 = 0, over60 = 0;
            list.forEach(function(c) {
                agingMap[c.client_id || c.id] = { aging_days: c.aging_days || 0, aging_category: c.aging_category || 'normal' };
                var bal = parseFloat(c.balance) || 0;
                if (c.aging_days > 60) over60 += bal;
                if (c.aging_days > 30) over30 += bal;
            });
            var el30 = document.getElementById('agingOver30');
            var el60 = document.getElementById('agingOver60');
            if (el30) el30.textContent = over30.toLocaleString() + '원';
            if (el60) el60.textContent = over60.toLocaleString() + '원';
            // Re-render client table with aging data
            if (allClients.length) renderClientTable(allClients);
        }
    } catch (e) {
        console.error('Aging data load error:', e);
    }
}

// ===== Billing Pending Banner =====
async function loadBillingPending() {
    try {
        var res = await axios.get('/api/orders?status=SHIPPED&billing_status=NONE&limit=500');
        if (res.data.success) {
            var orders = (res.data.data || []).filter(function(o) { return !o.billing_status; });
            var count = orders.length;
            var amount = orders.reduce(function(s, o) { return s + (parseFloat(o.final_amount) || 0); }, 0);
            var banner = document.getElementById('billingPendingBanner');
            if (count > 0 && banner) {
                banner.classList.remove('hidden');
                document.getElementById('billingPendingCount').textContent = count;
                document.getElementById('billingPendingAmount').textContent = amount.toLocaleString() + '원';
            }
        }
    } catch (e) {
        console.error('Billing pending load error:', e);
    }
}

// Initial load
setQuickDate('thisMonth');
loadOverdueWarning();
loadAgingData();
loadBillingPending();
