// Skeleton loading
(function() {
  var el = document.getElementById('clientsTableBody');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(8, 7);
})();

// State
var selectedClientId = null;
var selectedClientName = '';
var allClients = [];
var settlementTotals = null; // 서버 집계 합계(전체 clientRows) — 합계 행이 목록 cap로 잘려도 정확
var currentDateFilter = { startDate: '', endDate: '' };
var _adjustmentOrderList = [];
var agingMap = {}; // client_id -> { aging_days, aging_category }
var modalContext = { clientId: null, clientName: '', mode: 'sales', startDate: '', endDate: '' };

// Date helpers
function computeQuickRange(key) {
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth();
    var sd = '', ed = '';
    if (key === 'thisMonth') {
        sd = fmtLocalDate(new Date(y, m, 1));
        ed = fmtLocalDate(new Date(y, m + 1, 0));
    } else if (key === 'lastMonth') {
        sd = fmtLocalDate(new Date(y, m - 1, 1));
        ed = fmtLocalDate(new Date(y, m, 0));
    } else if (key === '3months') {
        sd = fmtLocalDate(new Date(y, m - 2, 1));
        ed = fmtLocalDate(new Date(y, m + 1, 0));
    } else if (key === 'thisYear') {
        sd = y + '-01-01';
        ed = y + '-12-31';
    }
    return { sd: sd, ed: ed };
}

function _highlightQuick(scopeSel, key) {
    document.querySelectorAll(scopeSel + ' .quick-date').forEach(function(btn) {
        btn.className = (btn.dataset.key === key)
            ? 'quick-date px-3 py-1 text-xs rounded border bg-orange-100 border-orange-300'
            : 'quick-date px-3 py-1 text-xs rounded border hover:bg-orange-50';
    });
}

function setQuickDate(key) {
    var r = computeQuickRange(key);
    document.getElementById('startDate').value = r.sd;
    document.getElementById('endDate').value = r.ed;
    _highlightQuick('#salesContent', key);
    applyDateFilter();
}

// ===== 매입 탭 기간 필터 (매출과 동일 구조, 공유 currentDateFilter) =====
function setPurchaseQuickDate(key) {
    var r = computeQuickRange(key);
    var psd = document.getElementById('pStartDate'), ped = document.getElementById('pEndDate');
    if (psd) psd.value = r.sd;
    if (ped) ped.value = r.ed;
    _highlightQuick('#purchaseContent', key);
    applyPurchaseDateFilter();
}

function applyPurchaseDateFilter() {
    var psd = document.getElementById('pStartDate'), ped = document.getElementById('pEndDate');
    currentDateFilter.startDate = psd ? psd.value : '';
    currentDateFilter.endDate = ped ? ped.value : '';
    // 매출 탭 입력과 동기화 (탭 전환 시 기간 일관 유지)
    var sd = document.getElementById('startDate'), ed = document.getElementById('endDate');
    if (sd) sd.value = currentDateFilter.startDate;
    if (ed) ed.value = currentDateFilter.endDate;
    loadPurchaseSettlement();
    loadPurchaseMonthlySummary();
}

function applyDateFilter() {
    currentDateFilter.startDate = document.getElementById('startDate').value;
    currentDateFilter.endDate = document.getElementById('endDate').value;
    loadSettlement();
    loadMonthlySummary();
    if (selectedClientId) {
        // 페이지 기간 변경 시 열려있는 상세 모달 기간도 동기화 (기본=동일)
        modalContext.startDate = currentDateFilter.startDate;
        modalContext.endDate = currentDateFilter.endDate;
        var _msd = document.getElementById('modalStartDate'), _med = document.getElementById('modalEndDate');
        if (_msd) _msd.value = modalContext.startDate;
        if (_med) _med.value = modalContext.endDate;
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

// 상세 모달 전용 조회기간 (페이지 기간과 독립, 기본값은 페이지 기간)
function getModalDateParams() {
    var p = '';
    if (modalContext.startDate) p += '&startDate=' + modalContext.startDate;
    if (modalContext.endDate) p += '&endDate=' + modalContext.endDate;
    return p;
}

// 로컬 날짜 YYYY-MM-DD (toISOString의 UTC 변환으로 인한 하루 밀림 방지)
function fmtLocalDate(dt) {
    var mm = String(dt.getMonth() + 1).padStart(2, '0');
    var dd = String(dt.getDate()).padStart(2, '0');
    return dt.getFullYear() + '-' + mm + '-' + dd;
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

            // 합계 행용 서버 집계(전체 거래처 기준) 저장 — total_orders는 추가된 키(없으면 클라 합산 폴백)
            settlementTotals = {
                total_orders: (s.total_orders != null) ? s.total_orders : null,
                total_sales: s.total_sales,
                total_payments: s.total_payments,
                total_balance: s.total_balance,
                client_count: s.total_clients
            };

            allClients = res.data.data.clients || [];
            renderClientTable(allClients, true);
            applyLedgerDrilldown();  // #402: 드릴다운 진입 파라미터 최초 1회 적용
        }
    } catch (e) {
        console.error('Settlement load error:', e);
        showToast('정산 데이터 로드 실패', 'error');
    }
}

function renderClientTable(clients, isFullList) {
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

    // 합계 행: 전체 목록이면 서버 집계(목록 방어적 cap로 잘려도 정확), 필터 뷰면 표시행 합산
    var fClients, fOrders, fSales, fPayments, fBalance;
    if (isFullList && settlementTotals) {
        fClients = (settlementTotals.client_count != null) ? settlementTotals.client_count : clients.length;
        fOrders = (settlementTotals.total_orders != null) ? settlementTotals.total_orders : sumOrders;
        fSales = settlementTotals.total_sales;
        fPayments = settlementTotals.total_payments;
        fBalance = settlementTotals.total_balance;
    } else {
        fClients = clients.length; fOrders = sumOrders;
        fSales = sumSales; fPayments = sumPayments; fBalance = sumBalance;
    }
    tfoot.innerHTML =
        '<tr>' +
        '<td class="px-4 py-2" colspan="2">합계 (' + fClients + '개 거래처)</td>' +
        '<td class="px-4 py-2 text-right">' + fOrders + '</td>' +
        '<td class="px-4 py-2 text-right">' + fSales.toLocaleString() + '</td>' +
        '<td class="px-4 py-2 text-right">' + fPayments.toLocaleString() + '</td>' +
        '<td class="px-4 py-2 text-right ' + (fBalance > 0 ? 'text-red-600' : 'text-green-600') + '">' + fBalance.toLocaleString() + '</td>' +
        '<td colspan="2"></td>' +
        '</tr>';
}

// #402: 대시보드 드릴다운(미수금 목록 → /ledger?search=거래처명, TOP 거래처 → /ledger?client_id=id)을
// 거래처 목록 로드 후 최초 1회 적용. client_id 우선(상세 모달), 없으면 search 검색.
var _ledgerDrilldownDone = false;
function applyLedgerDrilldown() {
    if (_ledgerDrilldownDone) return;
    var up = new URLSearchParams(window.location.search);
    var cid = up.get('client_id');
    var q = up.get('search');
    _ledgerDrilldownDone = true;
    if (cid) {
        var match = allClients.filter(function(cl) { return String(cl.id) === String(cid); })[0];
        if (match) { selectClient(match.id, match.client_name); return; }
        // 목록에 없는 거래처(내부법인 등 AR 제외 대상) — 상세 직접 로드(서버 is_internal_entity 플래그로 안내 분기)
        openDetailModal(cid, '', 'sales');
        loadClientDetail(cid);
        return;
    }
    if (q) {
        var si = document.getElementById('clientSearch');
        if (si) { si.value = q; filterClientTable(); }
    }
}

function filterClientTable() {
    var q = document.getElementById('clientSearch').value.toLowerCase();
    var filtered = allClients.filter(function(cl) {
        return cl.client_name.toLowerCase().indexOf(q) >= 0 ||
               (cl.client_code || '').toLowerCase().indexOf(q) >= 0;
    });
    renderClientTable(filtered, false);
}

// ===== Modal Open/Close =====
function openDetailModal(clientId, clientName, mode) {
    modalContext.clientId = clientId;
    modalContext.clientName = clientName;
    modalContext.mode = mode || 'sales';
    // 모달 조회기간 = 페이지 기간(기본). 모달 헤더 컨트롤에 반영.
    modalContext.startDate = currentDateFilter.startDate || '';
    modalContext.endDate = currentDateFilter.endDate || '';
    var _msd = document.getElementById('modalStartDate'), _med = document.getElementById('modalEndDate');
    if (_msd) _msd.value = modalContext.startDate;
    if (_med) _med.value = modalContext.endDate;
    document.getElementById('modalClientName').textContent = clientName;
    document.getElementById('clientDetailModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // A→B 전환/미수금경고 경로: 이전 거래처 내용 잔존 방지 + 스크롤 최상단 초기화
    var _tb = document.getElementById('transactionsTableBody'); if (_tb) _tb.innerHTML = '';
    var _modalEl = document.getElementById('clientDetailModal');
    if (_modalEl) { _modalEl.scrollTop = 0; var _sc = _modalEl.querySelector('.overflow-y-auto'); if (_sc) _sc.scrollTop = 0; }
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
    // 스크롤 복원은 무조건 실행 (중간 에러가 나도 body 잠금이 남지 않도록 finally 보장)
    try {
        var _m = document.getElementById('clientDetailModal'); if (_m) _m.classList.add('hidden');
        selectedClientId = null;
        selectedSupplierId = null;
        document.querySelectorAll('.client-row').forEach(function(r) { r.classList.remove('active'); });
    } finally {
        document.body.style.overflow = '';
    }
}
// ESC 닫기는 layout.ts 전역 ESC 핸들러가 data-esc-close="closeDetailModal" 위임으로 처리.
// (자체 keydown 리스너를 두면 위 모달 닫는 ESC에도 상세 모달이 같이 닫히는 이중 닫힘 발생)

// Select client (opens modal)
function selectClient(clientId, clientName) {
    selectedClientId = clientId;
    selectedClientName = clientName;

    // Set today as default payment date
    document.getElementById('paymentDate').value = fmtLocalDate(new Date());

    // Highlight row
    document.querySelectorAll('#clientsTableBody .client-row').forEach(function(r) {
        r.classList.toggle('active', r.dataset.id == clientId);
    });

    openDetailModal(clientId, clientName, 'sales');
    loadClientDetail(clientId);
    loadCollectionLogs(clientId);  // #370 독촉 이력 조회 (등록/삭제 완결)
}

function closeDetail() {
    closeDetailModal();
}

// ===== 상세 모달 조회기간 컨트롤 (페이지 기간과 독립) =====
function applyModalPeriod() {
    var msd = document.getElementById('modalStartDate'), med = document.getElementById('modalEndDate');
    modalContext.startDate = msd ? msd.value : '';
    modalContext.endDate = med ? med.value : '';
    if (!modalContext.clientId) return;
    if (modalContext.mode === 'purchase') {
        loadPurchaseClientLedger(modalContext.clientId);  // 매입도 기간필터 적용 (getModalDateParams)
    } else {
        loadClientDetail(modalContext.clientId);
    }
}
function setModalPeriodThisYear() {
    var y = new Date().getFullYear();
    var msd = document.getElementById('modalStartDate'), med = document.getElementById('modalEndDate');
    if (msd) msd.value = y + '-01-01';
    if (med) med.value = fmtLocalDate(new Date());
    applyModalPeriod();
}
function setModalPeriodAll() {
    var msd = document.getElementById('modalStartDate'), med = document.getElementById('modalEndDate');
    if (msd) msd.value = '';   // 빈 값 = 전체(하한 없음)
    if (med) med.value = '';
    applyModalPeriod();
}

// Load client detail (transactions + payments)
async function loadClientDetail(clientId) {
    try {
        var url = '/api/ledger/client/' + clientId + '?' + getModalDateParams().substring(1);
        var res = await axios.get(url);
        if (res.data.success) {
            var d = res.data.data;
            // 인쇄/팩스용 데이터 캐시
            _ledgerStatementData = d;
            // 내부법인(그룹 3사): 거래처원장 대신 회계허브 법인간거래 탭 안내 (AR 제외 정책)
            if (d.is_internal_entity) {
                var _dbs = document.getElementById('dualBalanceSection'); if (_dbs) _dbs.innerHTML = '';
                var _tb = document.getElementById('transactionsTableBody');
                if (_tb) _tb.innerHTML = '<tr><td colspan="7" class="text-center py-12 text-gray-500">'
                    + '<i class="fas fa-building-columns text-3xl text-indigo-300 mb-3 block"></i>'
                    + '<div class="font-semibold text-gray-700 mb-1">법인간 내부거래처입니다</div>'
                    + '<div class="text-sm text-gray-500 mb-4 leading-relaxed">동산기획·선명·청주 간 채권·채무는 거래처원장이 아니라<br>회계허브 &gt; 법인간거래 탭에서 통합 확인합니다.</div>'
                    + '<a href="/accounting?tab=inter" class="ds-btn ds-btn-primary ds-btn-sm inline-flex items-center"><i class="fas fa-arrow-right mr-1"></i>법인간거래 탭 열기</a>'
                    + '</td></tr>';
                ['clientTotalSales', 'clientTotalPayments', 'clientTotalAdjustments', 'clientBalance', 'clientLastPayment'].forEach(function (id) { var e = document.getElementById(id); if (e) e.textContent = '─'; });
                return;
            }
            document.getElementById('clientTotalSales').textContent = d.summary.total_orders.toLocaleString() + '원';
            document.getElementById('clientTotalPayments').textContent = d.summary.total_payments.toLocaleString() + '원';
            var adjEl = document.getElementById('clientTotalAdjustments');
            if (adjEl) adjEl.textContent = (d.summary.total_adjustments || 0).toLocaleString() + '원';
            document.getElementById('clientBalance').textContent = d.summary.balance.toLocaleString() + '원';
            document.getElementById('clientLastPayment').textContent = d.summary.last_payment_date || '-';

            // 이중잔액 표시
            renderDualBalance(d, clientId);

            // Render transactions — 매출(+)/입금(-) 2컬럼, 주문 품목 항상 펼침
            var txBody = document.getElementById('transactionsTableBody');
            txBody.innerHTML = '';
            // ── 전기이월 행 (과거순 원장 맨 위) — 잔액이 위→아래로 누적 증가 ──
            var openingBal = (d.summary && d.summary.opening_balance) || 0;
            if (Math.round(openingBal) !== 0) {
                var obTop = document.createElement('tr');
                obTop.className = 'border-b-2 border-gray-300 bg-gray-100';
                obTop.innerHTML =
                    '<td class="px-3 py-2 text-gray-500 whitespace-nowrap text-xs">' + (modalContext.startDate || '') + '</td>' +
                    '<td class="px-2 py-2 text-center"><span class="tx-badge bg-gray-300 text-gray-700">전기이월</span></td>' +
                    '<td class="px-3 py-2 text-sm text-gray-500 italic">조회 시작일 이전 잔액</td>' +
                    '<td class="px-3 py-2"></td>' +
                    '<td class="px-3 py-2"></td>' +
                    '<td class="px-3 py-2 text-right tabular-nums text-sm font-semibold ' + (openingBal > 0 ? 'text-red-600' : 'text-green-600') + '">' + openingBal.toLocaleString() + '</td>' +
                    '<td></td>';
                txBody.appendChild(obTop);
            }
            // 백엔드는 newest-first 반환 → reverse해서 과거→최신(잔액 누적 증가) 표시
            (d.transactions || []).slice().reverse().forEach(function(tx) {
                var type = tx.type;
                var balClass = tx.balance > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold';

                if (type === 'order') {
                    // ── 주문 헤더 행 ──
                    var billedMark = tx.billing_status === 'BILLED'
                        ? ' <i class="fas fa-check-circle text-blue-500" style="font-size:10px" title="회계반영"></i>' : '';
                    // 부가세 표시: 주문 합계(debit,VAT포함) − 품목합(공급가) = 부가세
                    var _itemsSum = (tx.items || []).reduce(function(s, it){ return s + (Number(it.amount) || 0); }, 0);
                    var _vat = Math.round((Number(tx.debit) || 0) - _itemsSum);
                    var vatNote = (_itemsSum > 0 && _vat > 0)
                        ? ' <span class="text-gray-400 font-normal" style="font-size:10px">(공급 ' + _itemsSum.toLocaleString() + ' + VAT ' + _vat.toLocaleString() + ')</span>' : '';
                    var headerRow = document.createElement('tr');
                    headerRow.className = 'border-t-2 border-green-200 bg-green-50';
                    headerRow.innerHTML =
                        '<td class="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">' + formatDate(tx.date) + '</td>' +
                        '<td class="px-2 py-2 text-center"><span class="tx-badge bg-green-100 text-green-800">주문</span></td>' +
                        '<td class="px-3 py-2 text-sm font-bold text-green-800"><i class="fas fa-file-alt text-green-400 mr-1"></i>' + escapeHtml(tx.reference || '') + billedMark + vatNote + '</td>' +
                        '<td class="px-3 py-2 text-right tabular-nums text-sm font-bold text-green-700">' + tx.debit.toLocaleString() + '</td>' +
                        '<td class="px-3 py-2"></td>' +
                        '<td class="px-3 py-2 text-right tabular-nums text-sm ' + balClass + '">' + tx.balance.toLocaleString() + '</td>' +
                        '<td></td>';
                    txBody.appendChild(headerRow);

                    // ── 품목 라인 행 ──
                    if (tx.items && tx.items.length > 0) {
                        tx.items.forEach(function(item) {
                            var itemRow = document.createElement('tr');
                            itemRow.className = 'bg-green-50/30';
                            var specStr = item.spec ? ' [' + escapeHtml(item.spec) + ']' : '';
                            var contentStr = item.content ? ' ' + escapeHtml(item.content) : '';
                            itemRow.innerHTML =
                                '<td></td><td></td>' +
                                '<td class="pl-8 pr-2 py-1 text-xs text-gray-700">' +
                                    '<span class="text-gray-800">' + escapeHtml(item.item_name) + '</span>' +
                                    '<span class="text-gray-400">' + specStr + '</span>' +
                                    '<span class="text-gray-500 italic">' + contentStr + '</span>' +
                                    '<span class="text-gray-400 ml-2">' + item.quantity + (item.unit || '') + '×' + (item.unit_price ? item.unit_price.toLocaleString() : '-') +
                                    (item.vat_included ? '<span class="text-blue-400 ml-0.5" title="부가세포함">✓</span>' : '') + '</span>' +
                                '</td>' +
                                '<td class="px-3 py-1 text-right tabular-nums text-xs text-gray-600">' + (item.amount || 0).toLocaleString() + '</td>' +
                                '<td></td><td></td><td></td>';
                            txBody.appendChild(itemRow);
                        });
                    }
                } else if (type === 'payment') {
                    // ── 입금 행 ──
                    var pm = tx.payment_method || '기타';
                    var badgeClass;
                    if (pm === '카드') badgeClass = 'bg-purple-100 text-purple-800';
                    else if (pm === '현금') badgeClass = 'bg-emerald-100 text-emerald-800';
                    else if (pm === '수표') badgeClass = 'bg-amber-100 text-amber-800';
                    else if (pm === '어음') badgeClass = 'bg-rose-100 text-rose-800';
                    else if (pm === '계좌이체') badgeClass = 'bg-blue-100 text-blue-800';
                    else badgeClass = 'bg-gray-100 text-gray-700';
                    var payRow = document.createElement('tr');
                    payRow.className = 'border-t border-blue-100 bg-blue-50/30 hover:bg-blue-50 transition-colors';
                    var payDesc = '';
                    if (tx.reference) payDesc += '<span class="text-gray-400 text-xs mr-2">#' + escapeHtml(tx.reference) + '</span>';
                    if (tx.notes) payDesc += '<span class="text-gray-500 text-xs">' + escapeHtml(tx.notes) + '</span>';
                    payRow.innerHTML =
                        '<td class="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">' + formatDate(tx.date) + '</td>' +
                        '<td class="px-2 py-2 text-center"><span class="tx-badge ' + badgeClass + '">' + escapeHtml(pm) + '</span></td>' +
                        '<td class="px-3 py-2 text-sm">' + payDesc + '</td>' +
                        '<td class="px-3 py-2"></td>' +
                        '<td class="px-3 py-2 text-right tabular-nums text-sm font-medium text-blue-700">' + tx.credit.toLocaleString() + '</td>' +
                        '<td class="px-3 py-2 text-right tabular-nums text-sm ' + balClass + '">' + tx.balance.toLocaleString() + '</td>' +
                        '<td class="px-2 py-2 text-center"><button onclick="editPayment(' + tx.id + ')" class="text-gray-400 hover:text-blue-600 p-0.5" title="수정"><i class="fas fa-pen text-xs"></i></button></td>';
                    txBody.appendChild(payRow);
                } else if (type === 'adjustment') {
                    // ── 감액 행 ──
                    var adjLabel = { DISCOUNT: '할인', CLAIM: '클레임', RETURN: '반품', BAD_DEBT: '대손', OTHER: '기타' };
                    var adjRow = document.createElement('tr');
                    adjRow.className = 'border-t border-yellow-100 bg-yellow-50/30 hover:bg-yellow-50 transition-colors';
                    adjRow.innerHTML =
                        '<td class="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">' + formatDate(tx.date) + '</td>' +
                        '<td class="px-2 py-2 text-center"><span class="tx-badge bg-yellow-100 text-yellow-800">' + (adjLabel[tx.adj_type] || '감액') + '</span></td>' +
                        '<td class="px-3 py-2 text-sm text-gray-600">' + escapeHtml(tx.description || '-').replace('감액: ', '') + '</td>' +
                        '<td class="px-3 py-2"></td>' +
                        '<td class="px-3 py-2 text-right tabular-nums text-sm font-medium text-orange-600">' + tx.credit.toLocaleString() + '</td>' +
                        '<td class="px-3 py-2 text-right tabular-nums text-sm ' + balClass + '">' + tx.balance.toLocaleString() + '</td>' +
                        '<td class="px-2 py-2 text-center"><button onclick="deleteAdjustment(' + tx.id + ',' + (tx.credit || 0) + ')" class="text-gray-400 hover:text-red-600 p-0.5" title="삭제"><i class="fas fa-trash text-xs"></i></button></td>';
                    txBody.appendChild(adjRow);
                }
            });

            if ((d.transactions || []).length === 0 && Math.round(openingBal) === 0) {
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

// #370 loadPayments / loadAdjustments / renderAdjustmentsTable 제거 — 미배선 dead code.
//   (대상 DOM paymentsTableBody·adjustmentsTableBody가 src 어디에도 없고 호출처 0건.
//    입금·감액은 거래 내역 통합 타임라인 transactionsTableBody에 이미 표시됨.)

// ===== 감액 관리 =====
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
            + '<div class="text-xs text-gray-500 mt-0.5">연체 ' + (item.overdue_count || 0) + '건 &nbsp;|&nbsp; 최초확인: ' + (item.oldest_billed_at ? formatDate(item.oldest_billed_at) : '-') + '</div>'
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
            document.getElementById('paymentEditModal').classList.remove('hidden');
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
    document.getElementById('paymentEditModal').classList.add('hidden');
}

// 수정 모달 내 삭제 버튼
async function deletePaymentFromModal() {
    var id = document.getElementById('editPaymentId').value;
    var amount = parseMoney(document.getElementById('editAmount').value);
    if (!(await showConfirm('입금 내역(' + (amount || 0).toLocaleString() + '원)을 삭제하시겠습니까?\n삭제 시 거래처 잔액이 복원됩니다.', { danger: true }))) return;
    try {
        var res = await axios.delete('/api/ledger/payment/' + id);
        if (res.data.success) {
            showToast('입금 내역이 삭제되었습니다', 'success');
            closePaymentModal();
            await loadClientDetail(selectedClientId);
            await loadSettlement();
        } else {
            showToast(res.data.error || '삭제 실패', 'error');
        }
    } catch (e) {
        showToast('삭제 실패: ' + (e.response?.data?.error || e.message), 'error');
    }
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
        a.download = '원장_' + (window.kstToday ? window.kstToday() : new Date().toISOString().slice(0,10)) + '.csv';
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

// ===== Tab Switch (매출/매입/분석) =====
function switchLedgerTab(tab) {
    var salesTab = document.getElementById('tabSales');
    var purchaseTab = document.getElementById('tabPurchase');
    var analysisTab = document.getElementById('tabAnalysis');
    var salesContent = document.getElementById('salesContent');
    var purchaseContent = document.getElementById('purchaseContent');
    var analysisContent = document.getElementById('analysisContent');
    var activeClass = 'px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600';
    var inactiveClass = 'px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700';

    salesTab.className = inactiveClass;
    purchaseTab.className = inactiveClass;
    analysisTab.className = inactiveClass;
    salesContent.style.display = 'none';
    purchaseContent.style.display = 'none';
    analysisContent.style.display = 'none';

    if (tab === 'sales') {
        salesTab.className = activeClass;
        salesContent.style.display = '';
    } else if (tab === 'purchase') {
        purchaseTab.className = activeClass;
        purchaseContent.style.display = '';
        // 매입 탭 기간 입력을 현재 공유 기간과 동기화 (매출 탭에서 설정한 기간 승계)
        var _psd = document.getElementById('pStartDate'), _ped = document.getElementById('pEndDate');
        if (_psd) _psd.value = currentDateFilter.startDate || '';
        if (_ped) _ped.value = currentDateFilter.endDate || '';
        loadPurchaseSettlement();
        loadPurchaseMonthlySummary();
        loadPurchaseOverdue();
    } else if (tab === 'analysis') {
        analysisTab.className = activeClass;
        analysisContent.style.display = '';
        loadClosingSummary();
        loadProfitSummary();
        loadCollectionPeriod();
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
    document.getElementById('pPaymentDate').value = (window.kstToday ? window.kstToday() : new Date().toISOString().split('T')[0]);
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
        var res = await axios.get('/api/ledger/purchase-client/' + clientId + '?' + getModalDateParams().substring(1));
        if (res.data.success) {
            var d = res.data.data;
            _ledgerStatementData = d;  // 인쇄/팩스/발송용 캐시 (매출과 동일 구조)
            // 내부법인(그룹 3사): 매입원장 대신 회계허브 법인간거래 탭 안내 (AP 제외 정책)
            if (d.is_internal_entity) {
                ['pClientTotalPurchase', 'pClientTotalPayments', 'pClientBalance', 'pClientLastPayment'].forEach(function (id) { var e = document.getElementById(id); if (e) e.textContent = '─'; });
                var _ptb = document.getElementById('pTransactionsBody');
                if (_ptb) _ptb.innerHTML = '<tr><td colspan="7" class="text-center py-12 text-gray-500">'
                    + '<i class="fas fa-building-columns text-3xl text-indigo-300 mb-3 block"></i>'
                    + '<div class="font-semibold text-gray-700 mb-1">법인간 내부거래처입니다</div>'
                    + '<div class="text-sm text-gray-500 mb-4 leading-relaxed">동산기획·선명·청주 간 채권·채무는 매입원장이 아니라<br>회계허브 &gt; 법인간거래 탭에서 통합 확인합니다.</div>'
                    + '<a href="/accounting?tab=inter" class="ds-btn ds-btn-primary ds-btn-sm inline-flex items-center"><i class="fas fa-arrow-right mr-1"></i>법인간거래 탭 열기</a>'
                    + '</td></tr>';
                return;
            }
            var s = d.summary || {};
            document.getElementById('pClientTotalPurchase').textContent = (s.total_purchases || 0).toLocaleString() + '원';
            document.getElementById('pClientTotalPayments').textContent = (s.total_payments || 0).toLocaleString() + '원';
            document.getElementById('pClientBalance').textContent = (s.balance || 0).toLocaleString() + '원';
            document.getElementById('pClientLastPayment').textContent = s.last_payment_date || '-';

            var txBody = document.getElementById('pTransactionsBody');
            txBody.innerHTML = '';
            // ── 전기이월 행 (과거순 맨 위, 조회 시작일 이전 잔액) — 매출 원장과 동일 ──
            var openingBal = s.opening_balance || 0;
            if (Math.round(openingBal) !== 0) {
                var obTop = document.createElement('tr');
                obTop.className = 'border-b-2 border-gray-300 bg-gray-100';
                obTop.innerHTML =
                    '<td class="px-4 py-2 text-gray-500 whitespace-nowrap text-xs">' + (modalContext.startDate || '') + '</td>' +
                    '<td class="px-4 py-2 text-center"><span class="px-2 py-0.5 text-xs rounded bg-gray-300 text-gray-700">전기이월</span></td>' +
                    '<td class="px-4 py-2 text-sm text-gray-500 italic">조회 시작일 이전 잔액</td>' +
                    '<td class="px-4 py-2"></td><td class="px-4 py-2"></td>' +
                    '<td class="px-4 py-2 text-right font-semibold ' + (openingBal > 0 ? 'text-red-600' : 'text-green-600') + '">' + openingBal.toLocaleString() + '</td>' +
                    '<td></td>';
                txBody.appendChild(obTop);
            }
            // 백엔드는 newest-first 반환 → reverse해서 과거→최신(잔액 누적) 표시 (매출과 동일)
            var txs = (d.transactions || []).slice().reverse();
            txs.forEach(function(tx) {
                var row = document.createElement('tr');
                row.className = 'hover:bg-gray-50';
                var t = tx.type;
                var badgeClass, badgeText;
                if (t === 'purchase') { badgeClass = 'bg-blue-50 text-blue-700'; badgeText = '발주'; }
                else if (t === 'adjustment') { badgeClass = 'bg-orange-50 text-orange-700'; badgeText = '감액'; }
                else { badgeClass = 'bg-green-50 text-green-700'; badgeText = '지급'; }
                var balClass = (tx.balance || 0) > 0 ? 'text-red-600 font-medium' : 'text-green-600';
                var amt = (tx.amount != null ? tx.amount : (tx.credit || 0));
                // 발주 품목 공급가 합 / 부가세 표기 (매출 원장과 동일)
                var descExtra = '';
                if (t === 'purchase' && tx.items && tx.items.length > 0) {
                    var _itemsSum = tx.items.reduce(function(s, it){ return s + (Number(it.amount) || 0); }, 0);
                    var _vat = Math.round((Number(tx.debit) || 0) - _itemsSum);
                    if (_itemsSum > 0 && _vat > 0) descExtra = ' <span class="text-gray-400" style="font-size:10px">(공급 ' + _itemsSum.toLocaleString() + ' + VAT ' + _vat.toLocaleString() + ')</span>';
                }
                var actionCell = '<td></td>';
                if (t === 'payment') {
                    actionCell = '<td class="px-2 py-2 text-center whitespace-nowrap">'
                        + '<button onclick="editPurchasePayment(this)" data-id="' + tx.id + '" data-date="' + escapeHtml(tx.date || '') + '" data-amount="' + amt + '" data-method="' + escapeHtml(tx.payment_method || '') + '" data-ref="' + escapeHtml(tx.reference || '') + '" data-notes="' + escapeHtml(tx.notes || '') + '" class="text-gray-400 hover:text-blue-600 p-0.5" title="수정"><i class="fas fa-pen text-xs"></i></button>'
                        + '<button onclick="deletePurchasePayment(' + tx.id + ',' + amt + ')" class="text-gray-400 hover:text-red-600 p-0.5 ml-1" title="삭제"><i class="fas fa-trash text-xs"></i></button>'
                        + '</td>';
                }
                row.innerHTML =
                    '<td class="px-4 py-2 text-gray-600">' + formatDate(tx.date) + '</td>' +
                    '<td class="px-4 py-2"><span class="px-2 py-0.5 text-xs rounded ' + badgeClass + '">' + badgeText + '</span></td>' +
                    '<td class="px-4 py-2">' + escapeHtml(tx.description || '-') + descExtra + '</td>' +
                    '<td class="px-4 py-2 text-right">' + ((tx.debit || 0) > 0 ? (tx.debit).toLocaleString() : '-') + '</td>' +
                    '<td class="px-4 py-2 text-right">' + ((tx.credit || 0) > 0 ? (tx.credit).toLocaleString() : '-') + '</td>' +
                    '<td class="px-4 py-2 text-right ' + balClass + '">' + (tx.balance || 0).toLocaleString() + '</td>' +
                    actionCell;
                txBody.appendChild(row);

                // ── 발주 품목 라인 행 (매출 원장과 동일하게 항상 펼침) ──
                if (t === 'purchase' && tx.items && tx.items.length > 0) {
                    tx.items.forEach(function(item) {
                        var itemRow = document.createElement('tr');
                        itemRow.className = 'bg-blue-50/30';
                        itemRow.innerHTML =
                            '<td></td><td></td>' +
                            '<td class="pl-8 pr-4 py-1 text-xs text-gray-700">' +
                                '<span class="text-gray-800">' + escapeHtml(item.item_name) + '</span>' +
                                '<span class="text-gray-400 ml-2">' + item.quantity + (item.unit || '') + ' × ' + (item.unit_price ? item.unit_price.toLocaleString() : '-') +
                                (item.vat_included ? '<span class="text-blue-400 ml-0.5" title="부가세포함">✓</span>' : '') + '</span>' +
                            '</td>' +
                            '<td class="px-4 py-1 text-right tabular-nums text-xs text-gray-600">' + (item.amount || 0).toLocaleString() + '</td>' +
                            '<td></td><td></td><td></td>';
                        txBody.appendChild(itemRow);
                    });
                }
            });
            if (txs.length === 0 && Math.round(openingBal) === 0) {
                txBody.innerHTML = '<tr><td colspan="7" class="text-center py-10"><i class="fas fa-receipt text-3xl mb-2 block text-gray-300"></i><div class="text-sm text-gray-400">거래 내역이 없습니다</div></td></tr>';
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
    document.getElementById('colDate').value = (window.kstToday ? window.kstToday() : new Date().toISOString().split('T')[0]);
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

async function openLedgerSendModal(clientId, clientName, balance, defaultChannel, mode) {
    ledgerSendClientId = clientId;
    ledgerSendClientName = clientName;
    var isPur = mode === 'purchase';
    // 매입 발송: 잔액 미지정 시 현재 로드된 매입원장 요약에서 미지급 잔액 사용
    if (isPur && (!balance || balance === 0) && _ledgerStatementData && _ledgerStatementData.summary) {
        balance = _ledgerStatementData.summary.balance || 0;
    }

    document.getElementById('ledgerSendName').value = clientName;
    document.getElementById('ledgerSendMobile').value = '';
    document.getElementById('ledgerSendEmail').value = '';
    document.getElementById('ledgerNoMobile').classList.add('hidden');
    document.getElementById('ledgerNoEmail').classList.add('hidden');

    // 채널 기본값 설정
    setLedgerChannel(defaultChannel || 'sms');

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
    var today = (window.kstToday ? window.kstToday() : new Date().toISOString().slice(0, 10));
    document.getElementById('ledgerSendContent').value =
        clientName + '님, 동산기획입니다.\n\n'
        + (isPur ? '매입 거래 내역을 안내드립니다.\n\n' : '거래 내역을 안내드립니다.\n\n')
        + '■ ' + (isPur ? '미지급금' : '미수금') + ': ' + balanceText + '\n'
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
                // 발송 위치별 기본 템플릿 — DB(kakao_template_defaults)에서 resolve
                try {
                    var dr = await axios.get('/api/kakao/template-defaults/resolve', { params: { context: 'ledger', key: '' } });
                    var autoCode = (dr.data && dr.data.data && dr.data.data.template_code) || '';
                    if (autoCode) sel.value = autoCode;
                } catch (e2) {}
            }
        }
    } catch(e) {}

    var modal = document.getElementById('ledgerSendModal');
    modal.classList.remove('hidden');
    modal.onclick = function(e) {
        if (e.target === this) closeLedgerSendModal();
    };
}

var _ledgerChannel = 'sms';
function setLedgerChannel(ch) {
    _ledgerChannel = ch;
    var btns = { alimtalk: 'ledgerChAlimtalk', sms: 'ledgerChSms', email: 'ledgerChEmail' };
    var activeClass = 'flex-1 px-3 py-2 text-sm rounded-lg border-2 border-blue-500 bg-blue-50 text-blue-700 font-medium';
    var inactiveClass = 'flex-1 px-3 py-2 text-sm rounded-lg border-2 border-gray-200 text-gray-600';
    Object.keys(btns).forEach(function(k) {
        var el = document.getElementById(btns[k]);
        if (el) el.className = k === ch ? activeClass : inactiveClass;
    });
    var phoneRow = document.getElementById('ledgerPhoneRow');
    var emailRow = document.getElementById('ledgerEmailRow');
    var alimArea = document.getElementById('ledgerAlimtalkArea');
    var smsArea = document.getElementById('ledgerSmsArea');
    phoneRow.classList.toggle('hidden', ch === 'email');
    emailRow.classList.toggle('hidden', ch !== 'email');
    alimArea.classList.toggle('hidden', ch !== 'alimtalk');
    smsArea.classList.toggle('hidden', ch !== 'sms');
}

// 하위 호환
function toggleLedgerChannelFields() { }

function closeLedgerSendModal() {
    document.getElementById('ledgerSendModal').classList.add('hidden');
}

async function sendLedgerNotification() {
    var content = document.getElementById('ledgerSendContent').value.trim();
    var channel = _ledgerChannel;

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
            if (allClients.length) renderClientTable(allClients, true);
        }
    } catch (e) {
        console.error('Aging data load error:', e);
    }
}

// ===== Billing Pending Banner =====
async function loadBillingPending() {
    try {
        // 서버 집계 사용 (limit=500 fetch 후 클라 합산 → 상한 초과 시 수치 조용히 축소 제거)
        var res = await axios.get('/api/tax-invoices/billing-pending-summary');
        if (res.data.success) {
            var d = res.data.data || {};
            var count = d.total_count || 0;
            var amount = d.total_amount || 0;
            var banner = document.getElementById('billingPendingBanner');
            if (count > 0 && banner) {
                banner.classList.remove('hidden');
                var cEl = document.getElementById('billingPendingCount');
                var aEl = document.getElementById('billingPendingAmount');
                if (cEl) cEl.textContent = count;
                if (aEl) aEl.textContent = amount.toLocaleString() + '원';
            }
        }
    } catch (e) {
        console.error('Billing pending load error:', e);
    }
}

// ===== 분석 탭: 월말 마감 대시보드 =====
async function loadClosingSummary() {
    try {
        var res = await axios.get('/api/ledger/closing-summary');
        if (!res.data.success) return;
        var d = res.data.data;

        document.getElementById('closingPeriod').textContent = d.period.start + ' ~ ' + d.period.end;
        document.getElementById('closingSales').textContent = d.month_sales.toLocaleString() + '원';
        document.getElementById('closingPayments').textContent = d.month_payments.toLocaleString() + '원';
        document.getElementById('closingReceivables').textContent = d.total_receivables.toLocaleString() + '원';
        document.getElementById('closingReceivableClients').textContent = d.receivable_clients + '개 거래처';
        document.getElementById('closingUnbilled').textContent = d.unbilled_count + '건';
        document.getElementById('closingUnbilledAmount').textContent = d.unbilled_amount.toLocaleString() + '원';
        document.getElementById('closingAdj').textContent = d.adj_amount.toLocaleString() + '원';
        document.getElementById('closingAdjCount').textContent = d.adj_count + '건';

        // 회수율
        var collRate = d.month_sales > 0 ? Math.round(d.month_payments / d.month_sales * 100) : 0;
        var rateEl = document.getElementById('closingCollRate');
        rateEl.textContent = collRate + '%';
        rateEl.className = 'text-lg font-bold tabular-nums text-right ' + (collRate >= 80 ? 'text-green-600' : collRate >= 50 ? 'text-amber-600' : 'text-red-600');

        // 전월 대비
        renderDiffBadge('closingSalesDiff', d.month_sales, d.prev_month_sales);
        renderDiffBadge('closingPaymentsDiff', d.month_payments, d.prev_month_payments);
    } catch (e) {
        console.error('Closing summary error:', e);
    }
}

function renderDiffBadge(elId, current, prev) {
    var el = document.getElementById(elId);
    if (!el || !prev) { if (el) el.textContent = ''; return; }
    var diff = current - prev;
    var pct = prev > 0 ? Math.round(diff / prev * 100) : 0;
    var sign = diff >= 0 ? '+' : '';
    var color = diff >= 0 ? 'text-green-600' : 'text-red-600';
    var icon = diff >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
    el.innerHTML = '<span class="' + color + '"><i class="fas ' + icon + ' mr-1" style="font-size:9px"></i>' + sign + pct + '% 전월비</span>';
}

// ===== 분석 탭: 매출-매입 손익 요약 =====
var _profitClients = [];

async function loadProfitSummary() {
    try {
        var months = document.getElementById('profitMonthRange').value || '6';
        var res = await axios.get('/api/ledger/profit-summary?months=' + months);
        if (!res.data.success) return;
        var data = res.data.data;

        // 월별 테이블
        var tbody = document.getElementById('profitMonthlyBody');
        var tfoot = document.getElementById('profitMonthlyFoot');
        tbody.innerHTML = '';
        var maxProfit = Math.max.apply(null, data.monthly.map(function(m) { return Math.abs(m.profit); })) || 1;
        var totSales = 0, totPurch = 0, totProfit = 0, totPay = 0, totPPay = 0;

        data.monthly.forEach(function(m) {
            totSales += m.sales; totPurch += m.purchases; totProfit += m.profit;
            totPay += m.payments; totPPay += m.purch_payments;
            var rate = m.sales > 0 ? Math.round(m.profit / m.sales * 100) : 0;
            var barW = Math.round(Math.abs(m.profit) / maxProfit * 100);
            var barColor = m.profit >= 0 ? '#22c55e' : '#ef4444';
            var profitColor = m.profit >= 0 ? 'text-green-600' : 'text-red-600';
            var row = '<tr>' +
                '<td class="px-3 py-2 font-medium">' + m.month + '</td>' +
                '<td class="px-3 py-2 text-right tabular-nums">' + m.sales.toLocaleString() + '</td>' +
                '<td class="px-3 py-2 text-right tabular-nums">' + m.purchases.toLocaleString() + '</td>' +
                '<td class="px-3 py-2 text-right tabular-nums font-bold ' + profitColor + '">' + m.profit.toLocaleString() + '</td>' +
                '<td class="px-3 py-2 text-right tabular-nums ' + profitColor + '">' + rate + '%</td>' +
                '<td class="px-3 py-2 text-right tabular-nums text-blue-600">' + m.payments.toLocaleString() + '</td>' +
                '<td class="px-3 py-2 text-right tabular-nums text-orange-600">' + m.purch_payments.toLocaleString() + '</td>' +
                '<td class="px-3 py-2"><div style="display:flex;align-items:center;gap:4px">' +
                '<div style="width:' + barW + '%;height:16px;background:' + barColor + ';border-radius:3px;min-width:2px"></div>' +
                '<span class="text-xs text-gray-400">' + m.profit.toLocaleString() + '</span></div></td>' +
                '</tr>';
            tbody.innerHTML += row;
        });

        var totRate = totSales > 0 ? Math.round(totProfit / totSales * 100) : 0;
        tfoot.innerHTML = '<tr>' +
            '<td class="px-3 py-2">합계</td>' +
            '<td class="px-3 py-2 text-right tabular-nums">' + totSales.toLocaleString() + '</td>' +
            '<td class="px-3 py-2 text-right tabular-nums">' + totPurch.toLocaleString() + '</td>' +
            '<td class="px-3 py-2 text-right tabular-nums ' + (totProfit >= 0 ? 'text-green-600' : 'text-red-600') + '">' + totProfit.toLocaleString() + '</td>' +
            '<td class="px-3 py-2 text-right tabular-nums">' + totRate + '%</td>' +
            '<td class="px-3 py-2 text-right tabular-nums text-blue-600">' + totPay.toLocaleString() + '</td>' +
            '<td class="px-3 py-2 text-right tabular-nums text-orange-600">' + totPPay.toLocaleString() + '</td>' +
            '<td></td></tr>';

        // 거래처별 손익
        _profitClients = data.clients || [];
        renderProfitClientTable(_profitClients);
    } catch (e) {
        console.error('Profit summary error:', e);
    }
}

function renderProfitClientTable(clients) {
    var tbody = document.getElementById('profitClientBody');
    tbody.innerHTML = '';
    if (!clients.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">데이터 없음</td></tr>';
        return;
    }
    var maxVal = Math.max.apply(null, clients.map(function(c) { return Math.max(c.sales, c.purchases); })) || 1;

    clients.forEach(function(c) {
        var rate = c.sales > 0 ? Math.round(c.profit / c.sales * 100) : (c.purchases > 0 ? -100 : 0);
        var profitColor = c.profit >= 0 ? 'text-green-600' : 'text-red-600';
        var salesW = Math.round(c.sales / maxVal * 100);
        var purchW = Math.round(c.purchases / maxVal * 100);
        var row = '<tr>' +
            '<td class="px-3 py-2 font-medium">' + escapeHtml(c.client_name) + '</td>' +
            '<td class="px-3 py-2 text-right tabular-nums">' + c.sales.toLocaleString() + '</td>' +
            '<td class="px-3 py-2 text-right tabular-nums">' + c.purchases.toLocaleString() + '</td>' +
            '<td class="px-3 py-2 text-right tabular-nums font-bold ' + profitColor + '">' + c.profit.toLocaleString() + '</td>' +
            '<td class="px-3 py-2 text-right tabular-nums ' + profitColor + '">' + rate + '%</td>' +
            '<td class="px-3 py-2"><div style="position:relative;height:20px">' +
            '<div style="position:absolute;top:0;left:0;height:10px;width:' + salesW + '%;background:#3b82f6;border-radius:2px" title="매출"></div>' +
            '<div style="position:absolute;top:10px;left:0;height:10px;width:' + purchW + '%;background:#f97316;border-radius:2px" title="매입"></div>' +
            '</div></td></tr>';
        tbody.innerHTML += row;
    });
}

function filterProfitClientTable() {
    var q = (document.getElementById('profitClientSearch').value || '').toLowerCase();
    var filtered = _profitClients.filter(function(c) { return c.client_name.toLowerCase().indexOf(q) >= 0; });
    renderProfitClientTable(filtered);
}

// ===== 분석 탭: 거래처별 평균 회수 기간 =====
async function loadCollectionPeriod() {
    try {
        var res = await axios.get('/api/ledger/collection-period');
        if (!res.data.success) return;
        var data = res.data.data || [];

        var tbody = document.getElementById('collectionPeriodBody');
        tbody.innerHTML = '';

        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">충분한 입금 데이터가 없습니다</td></tr>';
            return;
        }

        var maxDays = Math.max.apply(null, data.map(function(c) { return c.avg_days; })) || 1;

        data.forEach(function(c) {
            var avgDays = Math.round(c.avg_days);
            var speedColor, speedLabel;
            if (avgDays <= 15) { speedColor = '#22c55e'; speedLabel = '빠름'; }
            else if (avgDays <= 30) { speedColor = '#3b82f6'; speedLabel = '보통'; }
            else if (avgDays <= 60) { speedColor = '#f59e0b'; speedLabel = '느림'; }
            else { speedColor = '#ef4444'; speedLabel = '지연'; }

            var barW = Math.round(avgDays / maxDays * 100);
            var balColor = c.balance > 0 ? 'text-red-600 font-bold' : 'text-green-600';

            var row = '<tr>' +
                '<td class="px-3 py-2 font-medium">' + escapeHtml(c.client_name) + '</td>' +
                '<td class="px-3 py-2 text-right tabular-nums font-bold">' + avgDays + '일</td>' +
                '<td class="px-3 py-2 text-right tabular-nums text-gray-500">' + Math.round(c.min_days) + '일</td>' +
                '<td class="px-3 py-2 text-right tabular-nums text-gray-500">' + Math.round(c.max_days) + '일</td>' +
                '<td class="px-3 py-2 text-right tabular-nums">' + c.settled_orders + '건</td>' +
                '<td class="px-3 py-2 text-right tabular-nums ' + balColor + '">' + c.balance.toLocaleString() + '</td>' +
                '<td class="px-3 py-2"><div style="display:flex;align-items:center;gap:6px">' +
                '<div style="width:' + barW + '%;height:14px;background:' + speedColor + ';border-radius:3px;min-width:4px"></div>' +
                '<span class="text-xs font-medium" style="color:' + speedColor + '">' + speedLabel + '</span>' +
                '</div></td></tr>';
            tbody.innerHTML += row;
        });
    } catch (e) {
        console.error('Collection period error:', e);
    }
}

// ===== 원장 명세서 인쇄/팩스 =====
var _ledgerStatementData = null; // 마지막 로드된 거래처 데이터 캐시

function buildLedgerStatementHtml(clientName, transactions, summary, mode) {
    var isPur = (mode || modalContext.mode) === 'purchase';
    var title = isPur ? '매입 원장' : '거래처 원장';
    var debitLabel = isPur ? '매입' : '매출';
    var creditLabel = isPur ? '지급' : '입금';
    var debitTotal = isPur ? (summary.total_purchases || 0) : (summary.total_orders || 0);
    var today = (window.kstToday ? window.kstToday() : new Date().toISOString().split('T')[0]);
    var sd = modalContext.startDate || '';
    var ed = modalContext.endDate || '';
    var periodText = sd && ed ? sd + ' ~ ' + ed : (sd || ed || '전체 기간');

    var h = '<div style="font-family:Malgun Gothic,sans-serif;color:#000;width:780px;padding:10px;">';
    // 헤더
    h += '<table style="width:100%;border:none;margin-bottom:8px;"><tr>'
      + '<td style="border:none;padding:0;vertical-align:top;"><div style="font-size:22pt;font-weight:bold;">' + title + '</div>'
      + '<div style="font-size:10pt;color:#666;margin-top:2px;">기간: ' + periodText + '</div></td>'
      + '<td style="border:none;padding:0;text-align:right;vertical-align:top;">'
      + '<div style="font-size:9pt;color:#888;">발행일: ' + today + '</div></td></tr></table>';

    // 거래처 정보
    h += '<table style="width:100%;border-collapse:collapse;margin-bottom:10px;border:2px solid #000;">'
      + '<tr><td style="background:#f0f0f0;border:1px solid #999;padding:5px 10px;font-size:10pt;font-weight:bold;width:100px;">거래처</td>'
      + '<td style="border:1px solid #999;padding:5px 10px;font-size:12pt;font-weight:bold;">' + escapeHtml(clientName) + '</td>'
      + '<td style="background:#f0f0f0;border:1px solid #999;padding:5px 10px;font-size:10pt;font-weight:bold;width:80px;">' + debitLabel + '</td>'
      + '<td style="border:1px solid #999;padding:5px 10px;font-size:10pt;text-align:right;">' + debitTotal.toLocaleString() + '원</td></tr>'
      + '<tr><td style="background:#f0f0f0;border:1px solid #999;padding:5px 10px;font-size:10pt;font-weight:bold;">잔액</td>'
      + '<td style="border:1px solid #999;padding:5px 10px;font-size:12pt;font-weight:bold;color:#dc2626;">' + (summary.balance || 0).toLocaleString() + '원</td>'
      + '<td style="background:#f0f0f0;border:1px solid #999;padding:5px 10px;font-size:10pt;font-weight:bold;">' + creditLabel + '</td>'
      + '<td style="border:1px solid #999;padding:5px 10px;font-size:10pt;text-align:right;">' + (summary.total_payments || 0).toLocaleString() + '원</td></tr></table>';

    // 거래 내역 테이블
    h += '<table style="width:100%;border-collapse:collapse;border:1px solid #999;">'
      + '<tr style="background:#e5e5e5;"><th style="border:1px solid #999;padding:4px 6px;font-size:8pt;">일자</th>'
      + '<th style="border:1px solid #999;padding:4px 6px;font-size:8pt;">구분</th>'
      + '<th style="border:1px solid #999;padding:4px 6px;font-size:8pt;text-align:left;">내용</th>'
      + '<th style="border:1px solid #999;padding:4px 6px;font-size:8pt;text-align:right;">' + debitLabel + '(+)</th>'
      + '<th style="border:1px solid #999;padding:4px 6px;font-size:8pt;text-align:right;">' + creditLabel + '(-)</th>'
      + '<th style="border:1px solid #999;padding:4px 6px;font-size:8pt;text-align:right;">잔액</th></tr>';

    (transactions || []).forEach(function(tx, i) {
        var bg = i % 2 ? '#f9f9f9' : '#fff';
        var typeLabel;
        if (tx.type === 'payment') typeLabel = tx.payment_method || creditLabel;
        else if (tx.type === 'adjustment') typeLabel = '감액';
        else typeLabel = isPur ? '발주' : '주문';
        var desc = '';
        if (tx.type === 'payment') {
            desc = tx.notes || tx.reference || '';
        } else if (tx.type === 'adjustment') {
            desc = (tx.description || '').replace('감액: ', '');
        } else {
            desc = tx.reference || '';
            if (tx.items && tx.items.length > 0) {
                var first = tx.items[0].item_name || '';
                desc += ' ' + first + (tx.items.length > 1 ? ' 외 ' + (tx.items.length - 1) + '건' : '');
            }
            if (isPur && !desc) desc = (tx.description || '');
        }
        h += '<tr style="background:' + bg + ';">'
          + '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;text-align:center;">' + formatDate(tx.date) + '</td>'
          + '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;text-align:center;">' + typeLabel + '</td>'
          + '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;">' + escapeHtml(desc) + '</td>'
          + '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;text-align:right;">' + (tx.debit > 0 ? tx.debit.toLocaleString() : '') + '</td>'
          + '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;text-align:right;">' + (tx.credit > 0 ? tx.credit.toLocaleString() : '') + '</td>'
          + '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;text-align:right;font-weight:bold;">' + tx.balance.toLocaleString() + '</td></tr>';
    });

    // 전기이월 행 (조회 시작일 이전 잔액) — 최신순 목록의 맨 아래
    var openBal = summary.opening_balance || 0;
    if (Math.round(openBal) !== 0) {
        h += '<tr style="background:#eee;font-weight:bold;">'
          + '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;text-align:center;">' + (sd || '') + '</td>'
          + '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;text-align:center;">전기이월</td>'
          + '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;">조회 시작일 이전 잔액</td>'
          + '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;"></td>'
          + '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;"></td>'
          + '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;text-align:right;">' + openBal.toLocaleString() + '</td></tr>';
    }

    // 합계
    h += '<tr style="background:#e5e5e5;font-weight:bold;">'
      + '<td colspan="3" style="border:1px solid #999;padding:5px 8px;font-size:9pt;text-align:center;">합계</td>'
      + '<td style="border:1px solid #999;padding:5px 6px;font-size:9pt;text-align:right;">' + debitTotal.toLocaleString() + '</td>'
      + '<td style="border:1px solid #999;padding:5px 6px;font-size:9pt;text-align:right;">' + ((summary.total_payments || 0) + (summary.total_adjustments || 0)).toLocaleString() + '</td>'
      + '<td style="border:1px solid #999;padding:5px 6px;font-size:9pt;text-align:right;color:#dc2626;">' + (summary.balance || 0).toLocaleString() + '</td></tr>';
    h += '</table></div>';
    return h;
}

function printLedgerStatement() {
    if (!modalContext.clientId || !_ledgerStatementData) { showToast('거래처를 먼저 선택하세요', 'warning'); return; }
    var area = document.getElementById('ledgerPrintArea');
    area.innerHTML = buildLedgerStatementHtml(modalContext.clientName, _ledgerStatementData.transactions, _ledgerStatementData.summary);
    area.style.display = 'block';
    var ps = document.createElement('style');
    ps.id = 'ledgerPrintStyle';
    // 인쇄영역이 페이지 컨테이너에 중첩되어 있어 'body 직계자식 숨김' 방식은 조상까지 숨겨 백지가 됨.
    // visibility 기반(중첩 무관)으로 인쇄영역만 노출 + 페이지 좌상단 고정.
    ps.textContent = '@media print { body * { visibility: hidden !important; } #ledgerPrintArea, #ledgerPrintArea * { visibility: visible !important; } #ledgerPrintArea { display:block !important; position:absolute; left:0; top:0; width:100%; } } @page { size: A4 portrait; margin: 10mm; }';
    document.head.appendChild(ps);
    setTimeout(function() {
        window.print();
        area.innerHTML = ''; area.style.display = 'none';
        var el = document.getElementById('ledgerPrintStyle'); if (el) el.remove();
    }, 300);
}

function openLedgerFaxModal() {
    if (!modalContext.clientId) { showToast('거래처를 먼저 선택하세요', 'warning'); return; }
    document.getElementById('ledgerFaxModal').classList.remove('hidden');
    document.getElementById('ledgerFaxName').value = modalContext.clientName || '';
    document.getElementById('ledgerFaxStatus').textContent = '';
    document.getElementById('ledgerFaxSendBtn').disabled = false;
}
function closeLedgerFaxModal() { document.getElementById('ledgerFaxModal').classList.add('hidden'); }

function loadHtml2Canvas() {
    return new Promise(function(resolve, reject) {
        if (window.html2canvas) return resolve(window.html2canvas);
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
        s.onload = function() { resolve(window.html2canvas); };
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

async function sendLedgerFax() {
    var faxNum = document.getElementById('ledgerFaxNum').value.trim().replace(/[^0-9\-]/g, '');
    var faxName = document.getElementById('ledgerFaxName').value.trim();
    if (!faxNum) { document.getElementById('ledgerFaxStatus').textContent = '팩스번호를 입력해주세요.'; document.getElementById('ledgerFaxStatus').style.color = '#ef4444'; return; }

    var statusEl = document.getElementById('ledgerFaxStatus');
    var sendBtn = document.getElementById('ledgerFaxSendBtn');
    sendBtn.disabled = true;
    statusEl.textContent = '원장 명세서 PDF 생성 중...';
    statusEl.style.color = '#6b7280';

    var area = document.getElementById('ledgerPrintArea');
    try {
        area.innerHTML = buildLedgerStatementHtml(modalContext.clientName, _ledgerStatementData.transactions, _ledgerStatementData.summary);
        area.style.display = 'block';
        area.style.position = 'absolute';
        area.style.left = '-9999px';

        // PDF 생성 → 서버가 FTP 업로드+발송 (동기)
        var r = await window.faxSend(area, {
            receiver_num: faxNum,
            receiver_name: faxName,
            file_name: '원장_' + modalContext.clientName + '.pdf',
            related_type: 'LEDGER',
            client_id: modalContext.clientId
        }, function(msg) { statusEl.textContent = msg; statusEl.style.color = '#6b7280'; });

        if (r.ok) {
            statusEl.textContent = '팩스 발송 완료! (접수번호: ' + (r.receipt || '-') + ')';
            statusEl.style.color = '#16a34a';
        } else {
            statusEl.textContent = '팩스 전송 실패: ' + r.error;
            statusEl.style.color = '#ef4444';
        }
    } catch (err) {
        statusEl.textContent = '팩스 전송 실패: ' + (err.message || '알 수 없는 오류');
        statusEl.style.color = '#ef4444';
    } finally {
        area.innerHTML = ''; area.style.display = 'none'; area.style.position = ''; area.style.left = '';
        sendBtn.disabled = false;
    }
}

// Initial load
setQuickDate('thisMonth');
loadOverdueWarning();
loadAgingData();
loadBillingPending();
