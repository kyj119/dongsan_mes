var currentPage = 1;
var currentStatus = '';

var statusLabels = {
  'DRAFT': '임시저장', 'CONFIRMED': '발주확정',
  'PARTIAL_RECEIVED': '부분입고', 'RECEIVED': '입고완료', 'CANCELLED': '취소'
};
var statusColors = {
  'DRAFT': 'bg-gray-100 text-gray-700',
  'CONFIRMED': 'bg-blue-50 text-blue-700',
  'PARTIAL_RECEIVED': 'bg-amber-50 text-amber-700',
  'RECEIVED': 'bg-green-50 text-green-700',
  'CANCELLED': 'bg-red-50 text-red-700'
};
var statusIcons = {
  'DRAFT': 'fa-file',
  'CONFIRMED': 'fa-check',
  'PARTIAL_RECEIVED': 'fa-spinner',
  'RECEIVED': 'fa-check-circle',
  'CANCELLED': 'fa-times-circle'
};

function getDueBadge(expectedDate, status) {
  if (!expectedDate || status === 'RECEIVED' || status === 'CANCELLED' || status === 'DRAFT') return '';
  var now = new Date(); now.setHours(0,0,0,0);
  var due = new Date(expectedDate); due.setHours(0,0,0,0);
  var diff = Math.ceil((due - now) / (1000*60*60*24));
  if (diff < 0) return ' <span class="px-1.5 py-0.5 rounded text-xs font-bold bg-red-50 text-red-700">' + Math.abs(diff) + '일 지연</span>';
  if (diff === 0) return ' <span class="px-1.5 py-0.5 rounded text-xs font-bold bg-orange-100 text-orange-700">D-Day</span>';
  if (diff <= 3) return ' <span class="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-700">D-' + diff + '</span>';
  return '';
}

function filterByStatus(s) {
  currentStatus = s;
  if (s === 'OVERDUE') {
    document.getElementById('statusFilter').value = '';
  } else {
    document.getElementById('statusFilter').value = s;
  }
  loadPOs(1);
}

var urgencyLabels = { 'LOW': '낮음', 'NORMAL': '보통', 'HIGH': '높음', 'URGENT': '긴급' };
var urgencyColors = { 'LOW': 'bg-gray-100 text-gray-600', 'NORMAL': 'bg-blue-50 text-blue-600', 'HIGH': 'bg-orange-100 text-orange-700', 'URGENT': 'bg-red-50 text-red-700' };

function buildSourceRequestsHtml(requests) {
  if (!requests || requests.length === 0) return '';
  var html = '<div class="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">'
    + '<h4 class="font-medium mb-2 text-sm text-blue-800"><i class="fas fa-link mr-1"></i>원본 발주요청</h4>';
  requests.forEach(function(pr) {
    var urgBadge = '<span class="px-1.5 py-0.5 rounded text-xs ' + (urgencyColors[pr.urgency] || 'bg-gray-100 text-gray-600') + '">'
      + (urgencyLabels[pr.urgency] || pr.urgency || '-') + '</span>';
    html += '<div class="flex items-center justify-between text-sm">'
      + '<div>'
      + '<a href="/purchase-requests" class="text-blue-700 font-medium hover:underline">'
      + escapeHtml(pr.request_number) + '</a>'
      + ' <span class="text-gray-500">| ' + escapeHtml(pr.requester_name || '') + '</span>'
      + ' ' + urgBadge
      + '</div>'
      + '<span class="text-xs text-gray-400">' + (pr.created_at ? pr.created_at.substring(0, 10) : '') + '</span>'
      + '</div>';
    if (pr.reason) {
      html += '<div class="text-xs text-gray-500 mt-1">' + escapeHtml(pr.reason) + '</div>';
    }
  });
  html += '</div>';
  return html;
}

async function loadSupplierFilter() {
  try {
    var res = await axios.get('/api/clients', { params: { client_type: 'PURCHASES', is_active: '1' } });
    if (res.data.success) {
      var sel = document.getElementById('supplierFilter');
      if (!sel) return;
      var clients = (res.data.data || res.data.clients || []);
      clients.forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.client_name;
        sel.appendChild(opt);
      });
    }
  } catch(e) { console.warn('loadSupplierFilter:', e); }
}

async function loadStats() {
  try {
    var res = await axios.get('/api/purchase-orders/stats');
    if (res.data.success) {
      var d = res.data.data;
      var confirmedEl = document.getElementById('statConfirmed');
      if (confirmedEl) confirmedEl.textContent = d.CONFIRMED || 0;
      var partialEl = document.getElementById('statPartial');
      if (partialEl) partialEl.textContent = d.PARTIAL_RECEIVED || 0;
      var overdueEl = document.getElementById('statOverdue');
      if (overdueEl) overdueEl.textContent = d.overdue || 0;
      var monthEl = document.getElementById('statMonthlyAmount');
      if (monthEl) monthEl.textContent = formatAmount(d.monthly_amount || 0) + '원';
    }
  } catch(e) { console.error('loadStats error:', e); }
}

function formatAmount(n) {
  return Number(n || 0).toLocaleString('ko-KR');
}

// 재발주 기능 삭제됨 (2026-04-16)
function reorderPO() { showToast('재발주 기능은 삭제되었습니다. "복사하여 작성"을 사용하세요.', 'info'); }

// 재고 부족 알림 체크
async function checkStockAlerts() {
  try {
    var checkRes = await axios.post('/api/purchase-orders/stock-alerts/check');
    var alertsRes = await axios.get('/api/purchase-orders/stock-alerts', { params: { status: 'ACTIVE' } });
    if (alertsRes.data.success && alertsRes.data.data.length > 0) {
      var alerts = alertsRes.data.data;
      var msg = '재고 부족 품목 (' + alerts.length + '건):\\n\\n';
      alerts.slice(0, 10).forEach(function(a) {
        msg += '- ' + a.item_name + ': 현재 ' + a.current_stock + ' / 기준 ' + a.threshold_quantity;
        if (a.zone_name) msg += ' [' + a.zone_name + ']';
        msg += '\\n';
      });
      if (alerts.length > 10) msg += '\\n...외 ' + (alerts.length - 10) + '건';
      showToast(msg, 'warning');
    } else {
      showToast(checkRes.data.message || '재고 부족 품목이 없습니다.', 'error');
    }
    loadStats();
  } catch(e) {
    showToast('알림 확인 실패: ' + (e.response?.data?.error || e.message), 'error');
  }
}

async function loadPOs(page) {
  currentPage = page || 1;
  var search = document.getElementById('searchInput').value;
  var status = document.getElementById('statusFilter').value;
  var sort = document.getElementById('sortSelect').value;
  var overdue = '';
  if (currentStatus === 'OVERDUE') {
    status = '';
    overdue = '1';
  }
  var supplierId = document.getElementById('supplierFilter') ? document.getElementById('supplierFilter').value : '';
  var url = '/api/purchase-orders?page=' + currentPage + '&limit=20&search=' + encodeURIComponent(search)
    + '&status=' + status + '&sort=' + sort + (overdue ? '&overdue=1' : '')
    + (supplierId ? '&supplier_id=' + supplierId : '');
  try {
    var res = await axios.get(url);
    if (res.data.success) {
      displayPOs(res.data.data);
      renderPagination(res.data.pagination);
    }
  } catch(e) { console.error('loadPOs error:', e); }
}

function displayPOs(items) {
  var tbody = document.getElementById('poTableBody');
  if (!items || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-12 text-center">'
      + '<i class="fas fa-file-invoice text-3xl text-gray-300 mb-3 block"></i>'
      + '<p class="text-gray-500 text-sm mb-3">발주 내역이 없습니다.</p>'
      + '<a href="/purchase-order-form" class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-medium"><i class="fas fa-plus mr-1"></i>새 발주</a>'
      + '</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(function(po) {
    var icon = statusIcons[po.status] || 'fa-file';
    var badge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium '
      + (statusColors[po.status] || 'bg-gray-100 text-gray-700') + '">'
      + '<i class="fas ' + icon + ' text-[7px] mr-1"></i>'
      + (statusLabels[po.status] || po.status) + '</span>';
    var actions = '<div class="flex gap-1 justify-center">';
    actions += '<button onclick="viewDetail(' + po.id + ')" class="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200" title="상세"><i class="fas fa-eye"></i></button>';
    if (po.status !== 'CANCELLED') {
      actions += '<a href="/purchase-order-form?edit=' + po.id + '" class="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-200" title="수정"><i class="fas fa-edit"></i></a>';
    }
    if (po.status === 'DRAFT') {
      actions += '<button onclick="changeStatus(' + po.id + ',\'CONFIRMED\')" class="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-200" title="확정"><i class="fas fa-check"></i></button>';
    }
    // 입고 처리는 /receiving 페이지에서만 가능 (발주 관리에서는 제거)
    actions += '<button onclick="window.open(\'/purchase-invoice/' + po.id + '\', \'_blank\')" class="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200" title="인쇄"><i class="fas fa-print"></i></button>';
    if (po.status === 'DRAFT') {
      actions += '<button onclick="deletePO(' + po.id + ',\'' + po.status + '\')" class="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-200" title="삭제"><i class="fas fa-trash"></i></button>';
    }
    actions += '</div>';
    var isOverdue = po.expected_date && (po.status === 'CONFIRMED' || po.status === 'PARTIAL_RECEIVED')
      && new Date(po.expected_date) < new Date(new Date().toDateString());
    var rowClass = isOverdue ? 'border-t hover:bg-red-50 cursor-pointer bg-red-50' : 'border-t hover:bg-gray-50 cursor-pointer';
    // 부분입고 진행률 바
    var progressBar = '';
    if (po.status === 'PARTIAL_RECEIVED' && po.received_qty != null && po.total_qty > 0) {
      var pct = Math.round(po.received_qty / po.total_qty * 100);
      progressBar = '<div class="w-full bg-gray-200 rounded-full h-1 mt-1">'
        + '<div class="bg-blue-500 h-1 rounded-full" style="width:' + pct + '%"></div>'
        + '</div>';
    }
    return '<tr class="' + rowClass + '" ondblclick="viewDetail(' + po.id + ')">'
      + '<td class="px-4 py-3 font-medium">' + (po.po_number || '-') + '</td>'
      + '<td class="px-4 py-3">' + escapeHtml(po.supplier_name || '-') + '</td>'
      + '<td class="px-4 py-3 text-center">' + (po.order_date || '-') + '</td>'
      + '<td class="px-4 py-3 text-center">' + (po.expected_date || '-') + getDueBadge(po.expected_date, po.status) + '</td>'
      + '<td class="px-4 py-3 text-right tabular-nums">' + ((po.final_amount || 0).toLocaleString()) + '원</td>'
      + '<td class="px-4 py-3 text-center"><div>' + badge + '</div>' + progressBar + '</td>'
      + '<td class="px-4 py-3">' + actions + '</td>'
      + '</tr>';
  }).join('');
}

function renderPagination(p) {
  if (!p || p.total_pages <= 1) { document.getElementById('pagination').innerHTML = ''; return; }
  var html = '';
  for (var i = 1; i <= p.total_pages; i++) {
    html += '<button onclick="loadPOs(' + i + ')" class="px-3 py-1 mx-1 rounded '
      + (i === p.page ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300')
      + ' text-sm">' + i + '</button>';
  }
  document.getElementById('pagination').innerHTML = html;
}

async function viewDetail(id) {
  try {
    var res = await axios.get('/api/purchase-orders/' + id);
    if (!res.data.success) { showToast('불러오기 실패: ' + (res.data.error || ''), 'error'); return; }
    var po = res.data.data;
    var items = po.items || [];
    var statusBadge = '<span class="px-2 py-0.5 rounded text-xs font-medium '
      + (statusColors[po.status] || '') + '">'
      + (statusLabels[po.status] || po.status) + '</span>';
    // 라인별 진행률/상태/담당자 표시
    var itemRows = items.map(function(it) {
      var ordered = Number(it.quantity || 0);
      var received = Number(it.received_quantity || 0);
      var pct = ordered > 0 ? Math.round(received / ordered * 100) : 0;
      var lineStatus = it.line_status || 'PENDING';
      var statusBadge =
        lineStatus === 'RECEIVED' ? '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded bg-green-50 text-green-700"><i class="fas fa-check-circle text-[7px] mr-1"></i>완료</span>' :
        lineStatus === 'PARTIAL' ? '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded bg-amber-50 text-amber-700"><i class="fas fa-spinner text-[7px] mr-1"></i>' + pct + '%</span>' :
        lineStatus === 'CANCELLED' ? '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded bg-red-50 text-red-700"><i class="fas fa-times-circle text-[7px] mr-1"></i>취소</span>' :
        '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-500"><i class="far fa-clock text-[7px] mr-1"></i>대기</span>';
      var zoneLabel = it.zone_name
        ? '<span class="text-xs text-blue-700"><i class="fas fa-warehouse mr-0.5"></i>' + it.zone_name + '</span>'
        : '<span class="text-xs text-gray-400">창고 미지정</span>';
      var personLabel = it.received_by_name
        ? '<span class="text-xs text-gray-600">' + it.received_by_name + '</span>'
        + (it.received_at ? ' <span class="text-xs text-gray-400">· ' + (it.received_at || '').slice(5, 16).replace('T', ' ') + '</span>' : '')
        : (it.zone_manager_name ? '<span class="text-xs text-gray-500">담당 ' + it.zone_manager_name + '</span>' : '<span class="text-xs text-gray-400">-</span>');
      return '<tr class="border-t">'
        + '<td class="px-3 py-2"><div class="font-medium">' + (it.item_name || '-') + '</div><div class="mt-0.5">' + zoneLabel + '</div></td>'
        + '<td class="px-3 py-2 text-center">' + ordered + '</td>'
        + '<td class="px-3 py-2 text-center">' + (it.unit || '-') + '</td>'
        + '<td class="px-3 py-2 text-right">' + ((it.unit_price || 0).toLocaleString()) + '</td>'
        + '<td class="px-3 py-2 text-right">' + ((it.amount || 0).toLocaleString()) + '</td>'
        + '<td class="px-3 py-2 text-center"><div>' + received + ' / ' + ordered + '</div><div class="mt-1">' + statusBadge + '</div></td>'
        + '<td class="px-3 py-2 text-center">' + personLabel + '</td>'
        + '</tr>';
    }).join('');

    // PO 진행률 계산 (라인별 received/ordered 평균)
    var totalOrdered = items.reduce(function(s, it) { return s + Number(it.quantity || 0); }, 0);
    var totalReceived = items.reduce(function(s, it) { return s + Number(it.received_quantity || 0); }, 0);
    var overallPct = totalOrdered > 0 ? Math.round(totalReceived / totalOrdered * 100) : 0;
    var completedLines = items.filter(function(it) { return it.line_status === 'RECEIVED'; }).length;
    var progressBar = '<div class="mb-4 p-3 bg-gray-50 rounded">'
      + '<div class="flex justify-between items-center mb-1 text-xs">'
      + '<span class="text-gray-600">진행률 ' + completedLines + '/' + items.length + ' 라인 완료</span>'
      + '<span class="font-bold text-blue-600">' + overallPct + '%</span>'
      + '</div>'
      + '<div class="w-full bg-gray-200 rounded-full h-2">'
      + '<div class="bg-blue-500 h-2 rounded-full" style="width: ' + overallPct + '%"></div>'
      + '</div></div>';
    var showInspection = (po.status === 'CONFIRMED' || po.status === 'PARTIAL_RECEIVED' || po.status === 'RECEIVED');
    document.getElementById('detailContent').innerHTML =
      '<div class="flex justify-between items-start mb-4">'
      + '<h3 class="text-lg font-bold"><i class="fas fa-file-invoice text-blue-600 mr-2"></i>'
      + (po.po_number || '') + '</h3>'
      + '<button onclick="document.getElementById(\'detailModal\').classList.add(\'hidden\')"'
      + ' class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>'
      + '</div>'
      + '<div class="grid grid-cols-2 gap-4 mb-4 text-sm">'
      + '<div><span class="text-gray-500">공급업체:</span> <span class="font-medium">' + escapeHtml(po.supplier_name || '-') + '</span></div>'
      + '<div><span class="text-gray-500">상태:</span> ' + statusBadge + '</div>'
      + '<div><span class="text-gray-500">발주일:</span> ' + (po.order_date || '-') + '</div>'
      + '<div><span class="text-gray-500">납기예정:</span> ' + (po.expected_date || '-') + '</div>'
      + '<div><span class="text-gray-500">소계:</span> ' + ((po.total_amount || 0).toLocaleString()) + '원</div>'
      + '<div><span class="text-gray-500">부가세:</span> ' + ((po.vat_amount || 0).toLocaleString()) + '원</div>'
      + '<div class="col-span-2 font-bold text-lg"><span class="text-gray-500 font-normal">합계:</span> '
      + ((po.final_amount || 0).toLocaleString()) + '원</div>'
      + '</div>'
      + buildSourceRequestsHtml(po.source_requests || [])
      + progressBar
      + '<h4 class="font-medium mb-2 text-sm">발주 품목 · 라인별 진행상황</h4>'
      + '<div class="overflow-x-auto mb-4">'
      + '<table class="w-full text-sm ds-table-striped"><thead class="bg-gray-50"><tr>'
      + '<th class="px-3 py-2 text-left">품목 / 창고</th>'
      + '<th class="px-3 py-2 text-center">발주</th>'
      + '<th class="px-3 py-2 text-center">단위</th>'
      + '<th class="px-3 py-2 text-right">단가</th>'
      + '<th class="px-3 py-2 text-right">금액</th>'
      + '<th class="px-3 py-2 text-center">수령 / 상태</th>'
      + '<th class="px-3 py-2 text-center">담당자 / 시각</th>'
      + '</tr></thead>'
      + '<tbody>' + (itemRows || '<tr><td colspan="7" class="px-3 py-4 text-center text-gray-400"><i class="fas fa-inbox text-gray-300 mr-2"></i>품목 없음</td></tr>') + '</tbody>'
      + '</table></div>'
      + '<div class="mt-6">'
      + '<h4 class="text-sm font-bold text-gray-700 mb-2"><i class="fas fa-truck-loading mr-1"></i>입고 이력 (<span id="receiptsCount">0</span>건)</h4>'
      + '<div id="poReceiptsContainer" class="border border-gray-200 rounded overflow-hidden">'
      + '<table class="w-full text-sm"><thead class="bg-gray-50"><tr>'
      + '<th class="px-3 py-2 text-left">입고번호</th>'
      + '<th class="px-3 py-2 text-center">입고일</th>'
      + '<th class="px-3 py-2 text-right">라인</th>'
      + '<th class="px-3 py-2 text-right">수령</th>'
      + '<th class="px-3 py-2 text-right">거부</th>'
      + '<th class="px-3 py-2 text-center">검수 상태</th>'
      + '</tr></thead>'
      + '<tbody id="poReceiptsBody"><tr><td colspan="6" class="px-3 py-4 text-center text-gray-400 text-xs">(입고 이력 없음)</td></tr></tbody>'
      + '</table></div></div>'
      + (po.notes ? '<div class="text-sm text-gray-600 mt-2"><span class="font-medium">비고:</span> ' + escapeHtml(po.notes) + '</div>' : '')
      + (po.internal_notes ? '<div class="text-sm text-gray-600 mt-1"><span class="font-medium">내부메모:</span> ' + escapeHtml(po.internal_notes) + '</div>' : '')
      + (showInspection
        ? '<div class="mt-4 border-t pt-4"><h4 class="font-semibold mb-2 text-sm"><i class="fas fa-clipboard-check mr-1 text-green-600"></i>검수 이력</h4>'
          + '<div id="inspectionHistory"><div class="text-center py-4 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>로딩중...</div></div></div>'
        : '')
      + '<div class="mt-4 pt-4 border-t flex justify-end gap-2 flex-wrap">'
      + '<button onclick="copyPO(' + id + ')" class="px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50 text-sm"><i class="fas fa-copy mr-1"></i>복사하여 작성</button>'
      + (po.status !== 'CANCELLED' ? '<a href="/purchase-order-form?edit=' + id + '" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"><i class="fas fa-edit mr-1"></i>수정</a>' : '')
      + '<button onclick="window.open(\'/purchase-invoice/' + id + '\', \'_blank\')" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"><i class="fas fa-print mr-1"></i>발주서 인쇄</button>'
      + '<button onclick="sendPurchaseOrderNotice(' + id + ',\'' + escapeHtml(po.supplier_name || '') + '\',\'' + escapeHtml(po.po_number || '') + '\')" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"><i class="fas fa-paper-plane mr-1"></i>발주서 발송</button>'
      + '<button onclick="document.getElementById(\'detailModal\').classList.add(\'hidden\')" class="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm">닫기</button>'
      + '</div>';
    document.getElementById('detailModal').classList.remove('hidden');
    renderPoReceipts(po.receipts || []);
    if (showInspection) { loadInspectionHistory(id); }
  } catch(e) {
    showToast('상세 조회 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

async function changeStatus(id, newStatus) {
  var label = statusLabels[newStatus] || newStatus;
  if (!(await showConfirm(label + '(으)로 상태를 변경하시겠습니까?'))) return;
  try {
    var res = await axios.patch('/api/purchase-orders/' + id + '/status', { status: newStatus });
    if (res.data.success) {
      showToast('상태가 변경되었습니다.', 'success');
      loadStats();
      loadPOs(currentPage);
    } else {
      showToast('변경 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('변경 중 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

async function openReceiveModal(id) {
  try {
    var res = await axios.get('/api/purchase-orders/' + id);
    if (!res.data.success) { showToast('불러오기 실패', 'error'); return; }
    var po = res.data.data;
    var items = po.items || [];
    var itemRows = items.map(function(it) {
      var remaining = (it.quantity || 0) - (it.received_quantity || 0);
      var defaultRecv = Math.max(0, remaining);
      return '<tr class="border-t">'
        + '<td class="px-3 py-2 text-sm">' + (it.item_name || '-') + '</td>'
        + '<td class="px-3 py-2 text-center text-sm">' + (it.quantity || 0) + '</td>'
        + '<td class="px-3 py-2 text-center text-sm">' + (it.received_quantity || 0) + '</td>'
        + '<td class="px-3 py-2 text-center text-sm text-orange-600 font-medium">' + Math.max(0, remaining) + '</td>'
        + '<td class="px-3 py-2 text-center">'
        + '<input type="number" id="recv_' + it.id + '" value="' + defaultRecv + '"'
        + ' min="0" max="' + remaining + '" class="w-16 border rounded px-1 py-1 text-sm text-center">'
        + '</td>'
        + '</tr>';
    }).join('');
    document.getElementById('receiveContent').innerHTML =
      '<div class="flex justify-between items-center mb-4">'
      + '<h3 class="text-lg font-bold"><i class="fas fa-truck-loading text-blue-600 mr-2"></i>입고 처리</h3>'
      + '<button onclick="document.getElementById(\'receiveModal\').classList.add(\'hidden\')"'
      + ' class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>'
      + '</div>'
      + '<p class="text-sm text-gray-600 mb-3">발주번호: <strong>' + (po.po_number || '') + '</strong></p>'
      + '<div class="overflow-x-auto mb-4">'
      + '<table class="w-full text-sm ds-table-striped"><thead class="bg-gray-50"><tr>'
      + '<th class="px-3 py-2 text-left">품목명</th>'
      + '<th class="px-3 py-2 text-center">발주수량</th>'
      + '<th class="px-3 py-2 text-center">기입고</th>'
      + '<th class="px-3 py-2 text-center">잔여</th>'
      + '<th class="px-3 py-2 text-center">이번수령</th>'
      + '</tr></thead>'
      + '<tbody>' + (itemRows || '<tr><td colspan="5" class="px-3 py-4 text-center text-gray-400"><i class="fas fa-inbox text-gray-300 mr-2"></i>품목 없음</td></tr>') + '</tbody>'
      + '</table></div>'
      + '<div class="flex justify-end gap-3">'
      + '<button onclick="document.getElementById(\'receiveModal\').classList.add(\'hidden\')"'
      + ' class="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm">취소</button>'
      + '<button onclick="submitReceive(' + id + ')"'
      + ' class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium">입고 처리</button>'
      + '</div>';
    document.getElementById('receiveModal').classList.remove('hidden');
    window._receiveItems = items;
  } catch(e) {
    showToast('입고 모달 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}


async function submitReceive(id) {
  var items = window._receiveItems || [];
  var receiveData = items.map(function(it) {
    var recvEl = document.getElementById('recv_' + it.id);
    var recvQty = recvEl ? (parseFloat(recvEl.value) || 0) : 0;
    return {
      po_item_id: it.id,
      received_quantity: recvQty,
      accepted_quantity: recvQty,
      rejected_quantity: 0,
      reject_memo: ''
    };
  }).filter(function(r) { return r.received_quantity > 0; });
  if (receiveData.length === 0) { showToast('입고 수량을 1개 이상 입력하세요.', 'warning'); return; }
  try {
    var res = await axios.post('/api/purchase-orders/' + id + '/receive', { items: receiveData });
    if (res.data.success) {
      showToast('입고 처리가 완료되었습니다.', 'success');
      document.getElementById('receiveModal').classList.add('hidden');
      loadStats();
      loadPOs(currentPage);
    } else {
      showToast('입고 처리 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('입고 처리 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

async function deletePO(id, status) {
  if (status === 'RECEIVED') { showToast('입고 완료된 발주는 삭제할 수 없습니다.', 'warning'); return; }
  if (!(await showConfirm('이 발주를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.', { danger: true }))) return;
  try {
    var res = await axios.delete('/api/purchase-orders/' + id);
    if (res.data.success) {
      showToast('발주가 삭제되었습니다.', 'success');
      loadStats();
      loadPOs(currentPage);
    } else {
      showToast('삭제 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('삭제 중 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

async function copyPO(id) {
  if (!(await showConfirm('이 발주서를 복사하여 새 임시저장 발주를 생성하시겠습니까?'))) return;
  try {
    var res = await axios.post('/api/purchase-orders/' + id + '/copy');
    if (res.data.success) {
      showToast('발주가 복사되었습니다.', 'success');
      loadStats();
      loadPOs(1);
    } else {
      showToast('복사 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('복사 중 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

function renderPoReceipts(receipts) {
  var countEl = document.getElementById('receiptsCount');
  if (countEl) countEl.textContent = receipts.length;
  var tbody = document.getElementById('poReceiptsBody');
  if (!tbody) return;
  if (receipts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-3 py-4 text-center text-gray-400 text-xs">(입고 이력 없음)</td></tr>';
    return;
  }
  tbody.innerHTML = receipts.map(function(r) {
    var inspBadge = r.inspection_status === 'NORMAL' ? '<span class="text-xs text-green-700">정상</span>'
      : r.inspection_status === 'PENDING_REVIEW' ? '<span class="text-xs text-amber-700">확인대기</span>'
      : r.inspection_status === 'WAITING_RESHIP' ? '<span class="text-xs text-blue-700">재입고대기</span>'
      : r.inspection_status === 'CANCELLED' ? '<span class="text-xs text-red-700">취소</span>'
      : '<span class="text-xs text-gray-500">미검수</span>';
    return '<tr>'
      + '<td class="px-3 py-2">' + (r.receipt_number || '#' + r.id) + '</td>'
      + '<td class="px-3 py-2 text-center">' + (r.receipt_date || '-') + '</td>'
      + '<td class="px-3 py-2 text-right">' + (r.line_count || 0) + '</td>'
      + '<td class="px-3 py-2 text-right">' + (r.total_received || 0) + '</td>'
      + '<td class="px-3 py-2 text-right text-red-600">' + (r.total_rejected || 0) + '</td>'
      + '<td class="px-3 py-2 text-center">' + inspBadge + '</td>'
      + '</tr>';
  }).join('');
}

async function loadInspectionHistory(poId) {
  var container = document.getElementById('inspectionHistory');
  if (!container) return;
  try {
    var res = await axios.get('/api/purchase-orders/' + poId + '/inspections');
    if (!res.data.success) {
      container.innerHTML = '<div class="text-gray-400 text-sm">검수 이력 없음</div>';
      return;
    }
    var receipts = res.data.data || [];
    if (receipts.length === 0) {
      container.innerHTML = '<div class="text-gray-400 text-sm py-2">입고 이력이 없습니다.</div>';
      return;
    }
    var inspStatusLabels = { 'PASSED': '합격', 'PARTIAL': '부분합격', 'FAILED': '불합격' };
    var inspStatusColors = { 'PASSED': 'bg-green-50 text-green-700', 'PARTIAL': 'bg-amber-50 text-amber-700', 'FAILED': 'bg-red-50 text-red-700' };
    var html = receipts.map(function(r) {
      var badge = '<span class="px-2 py-0.5 rounded text-xs font-medium ' + (inspStatusColors[r.inspection_status] || 'bg-gray-100 text-gray-700') + '">'
        + (inspStatusLabels[r.inspection_status] || r.inspection_status || '-') + '</span>';
      var itemRows = (r.items || []).map(function(it) {
        var itStatus = it.quality_status || 'PASSED';
        var itBadge = '<span class="px-1.5 py-0.5 rounded text-xs ' + (inspStatusColors[itStatus] || 'bg-gray-100 text-gray-700') + '">'
          + (inspStatusLabels[itStatus] || itStatus) + '</span>';
        return '<tr class="border-t">'
          + '<td class="px-2 py-1.5 text-xs">' + (it.item_name || '-') + '</td>'
          + '<td class="px-2 py-1.5 text-xs text-center">' + (it.received_quantity || 0) + '</td>'
          + '<td class="px-2 py-1.5 text-xs text-center text-green-700">' + (it.accepted_quantity || 0) + '</td>'
          + '<td class="px-2 py-1.5 text-xs text-center text-red-700">' + (it.rejected_quantity || 0) + '</td>'
          + '<td class="px-2 py-1.5 text-xs text-center">' + itBadge + '</td>'
          + '<td class="px-2 py-1.5 text-xs text-gray-500">' + (it.reject_memo || '') + '</td>'
          + '</tr>';
      }).join('');
      return '<div class="border rounded-lg mb-2 overflow-hidden">'
        + '<div class="bg-gray-50 px-3 py-2 flex items-center justify-between">'
        + '<div class="text-xs font-medium">'
        + '<i class="fas fa-truck-loading text-gray-500 mr-1"></i>'
        + '입고 #' + (r.id || '') + ' &nbsp;|&nbsp; '
        + (r.received_at ? r.received_at.substring(0, 10) : '-')
        + (r.received_by_name ? ' &nbsp;|&nbsp; 검수자: ' + r.received_by_name : '')
        + '</div>'
        + badge
        + '</div>'
        + '<div class="overflow-x-auto"><table class="w-full text-xs ds-table-striped"><thead class="bg-gray-50"><tr>'
        + '<th class="px-2 py-1.5 text-left font-medium text-gray-500">품목명</th>'
        + '<th class="px-2 py-1.5 text-center font-medium text-gray-500">수령</th>'
        + '<th class="px-2 py-1.5 text-center font-medium text-green-700">합격</th>'
        + '<th class="px-2 py-1.5 text-center font-medium text-red-700">불합격</th>'
        + '<th class="px-2 py-1.5 text-center font-medium text-gray-500">상태</th>'
        + '<th class="px-2 py-1.5 text-left font-medium text-gray-500">불합격사유</th>'
        + '</tr></thead>'
        + '<tbody>' + (itemRows || '<tr><td colspan="6" class="px-2 py-2 text-center text-gray-400"><i class="fas fa-inbox text-gray-300 mr-2"></i>품목 없음</td></tr>') + '</tbody>'
        + '</table></div>'
        + '</div>';
    }).join('');
    container.innerHTML = html;
  } catch(e) {
    if (container) container.innerHTML = '<div class="text-gray-400 text-sm">검수 이력 조회 실패</div>';
    console.error('loadInspectionHistory error:', e);
  }
}

// 모달 외부 클릭 시 닫기
document.getElementById('detailModal').addEventListener('click', function(e) {
  if (e.target === this) this.classList.add('hidden');
});
document.getElementById('receiveModal').addEventListener('click', function(e) {
  if (e.target === this) this.classList.add('hidden');
});

// CSV 내보내기
async function exportPoCsv() {
  try {
    var params = new URLSearchParams();
    var status = document.getElementById('statusFilter').value;
    var search = document.getElementById('searchInput').value;
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    var res = await authFetch('/api/purchase-orders/export/csv?' + params.toString());
    if (!res.ok) throw new Error('서버 오류');
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '발주목록_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  } catch(e) {
    showToast('CSV 내보내기 실패: ' + e.message, 'error');
  }
}

// ── 템플릿에서 발주 생성 ──
var selectedTemplateId = null;
var selectedTemplateItems = [];

function openTemplateModal() {
  selectedTemplateId = null;
  selectedTemplateItems = [];
  document.getElementById('templateDetail').classList.add('hidden');
  document.getElementById('templateModal').classList.remove('hidden');
  loadTemplates();
}
function closeTemplateModal() {
  document.getElementById('templateModal').classList.add('hidden');
}

async function loadTemplates() {
  try {
    var res = await axios.get('/api/purchase-orders/templates');
    var templates = res.data.data || [];
    var container = document.getElementById('templateList');
    if (templates.length === 0) {
      container.innerHTML = '<div class="text-center text-gray-400 py-6">등록된 템플릿이 없습니다.</div>';
      return;
    }
    container.innerHTML = templates.map(function(t) {
      return '<div class="border rounded-lg p-3 hover:bg-blue-50 cursor-pointer transition" onclick="selectTemplate(' + t.id + ')">'
        + '<div class="flex justify-between items-center">'
        + '<div><span class="font-medium">' + (t.name || '-') + '</span>'
        + '<span class="text-xs text-gray-500 ml-2">' + escapeHtml(t.supplier_name || '공급업체 미지정') + '</span></div>'
        + '<span class="text-xs text-gray-400">' + (t.item_count || 0) + '개 품목</span>'
        + '</div>'
        + (t.notes ? '<div class="text-xs text-gray-500 mt-1">' + escapeHtml(t.notes) + '</div>' : '')
        + '</div>';
    }).join('');
  } catch(e) {
    document.getElementById('templateList').innerHTML = '<div class="text-red-500 text-center py-4">템플릿 로드 실패</div>';
  }
}

async function selectTemplate(id) {
  selectedTemplateId = id;
  try {
    var res = await axios.get('/api/purchase-orders/templates/' + id);
    var data = res.data.data;
    selectedTemplateItems = data.items || [];

    var itemsHtml = selectedTemplateItems.map(function(item) {
      return '<div class="flex items-center gap-2 text-sm bg-gray-50 rounded p-2" data-item-id="' + item.id + '">'
        + '<span class="flex-1 font-medium">' + (item.item_name || '-') + '</span>'
        + '<span class="text-xs text-gray-500 w-20">' + (item.category_name || '') + '</span>'
        + '<input type="number" class="w-20 px-2 py-1 border rounded text-right tmpl-qty" value="' + (item.quantity || 1) + '" min="1" step="1" />'
        + '<span class="text-xs text-gray-400">' + (item.unit || 'EA') + '</span>'
        + '<input type="number" class="w-24 px-2 py-1 border rounded text-right tmpl-price" value="' + (item.unit_price || 0) + '" min="0" step="100" />'
        + '<span class="text-xs text-gray-400">원</span>'
        + '</div>';
    }).join('');

    document.getElementById('templateItems').innerHTML = itemsHtml;
    document.getElementById('templateDetail').classList.remove('hidden');
  } catch(e) {
    showToast('템플릿 상세 로드 실패', 'error');
  }
}

async function createFromTemplate() {
  if (!selectedTemplateId) return;

  var overrides = {};
  var rows = document.querySelectorAll('#templateItems [data-item-id]');
  rows.forEach(function(row) {
    var itemId = row.getAttribute('data-item-id');
    var qty = row.querySelector('.tmpl-qty').value;
    var price = row.querySelector('.tmpl-price').value;
    overrides[itemId] = { quantity: parseFloat(qty), unit_price: parseFloat(price) };
  });

  try {
    var res = await axios.post('/api/purchase-orders/from-template/' + selectedTemplateId, {
      status: document.getElementById('tmplStatus').value,
      expected_date: document.getElementById('tmplExpectedDate').value || null,
      item_overrides: overrides
    });
    if (res.data.success) {
      showToast(res.data.message || '발주가 생성되었습니다.', 'success');
      closeTemplateModal();
      loadStats();
      loadPOs(1);
    }
  } catch(e) {
    showToast('발주 생성 실패: ' + (e.response?.data?.error || e.message), 'error');
  }
}

document.getElementById('templateModal').addEventListener('click', function(e) {
  if (e.target === this) closeTemplateModal();
});

// ==================== 발주서 발송 ====================

function sendPurchaseOrderNotice(id, supplierName, poNumber) {
  if (typeof window.openSendMessage !== 'function') {
    showToast('메시지 발송 기능을 사용할 수 없습니다.', 'error');
    return;
  }
  window.openSendMessage({
    receiver: { name: supplierName, phone: '', email: '' },
    context: { type: 'purchase_orders', id: id },
    defaultChannel: 'email',
    defaultContent: supplierName + '님, 동산현수막입니다.\n\n발주서를 확인해주시기 바랍니다.\n\n■ 발주번호: ' + poNumber + '\n\n문의: 042-523-1982'
  });
}

// 초기 로드
loadSupplierFilter();
loadStats();
loadPOs(1);
