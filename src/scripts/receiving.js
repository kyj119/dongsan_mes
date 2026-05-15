// Skeleton loading
(function() {
  var el = document.getElementById('pendingTableBody');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(5, 6);
})();

var currentTab = 'pending';
var pendingPage = 1;
var historyPage = 1;
var currentPOId = null;
var currentScope = 'mine';  // 'mine' | 'all' — 기본값은 init 시 role 따라 결정
var queuePoGroups = [];     // /receiving-queue 결과 캐시
var currentUserId = null;
// currentUserRole 은 layout.ts SHARED_AUTH_JS 가 글로벌 let 으로 선언함 (재선언 시 SyntaxError → 스크립트 전체 파싱 실패).

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
var inspStatusLabels = { 'PASSED': '합격', 'PARTIAL': '부분합격', 'FAILED': '불합격' };
var inspStatusColors = {
  'PASSED': 'bg-green-50 text-green-700',
  'PARTIAL': 'bg-amber-50 text-amber-700',
  'FAILED': 'bg-red-50 text-red-700'
};

// ── 탭 전환 ──
function switchTab(tab) {
  currentTab = tab;
  var pending = document.getElementById('panelPending');
  var history = document.getElementById('panelHistory');
  var tabPending = document.getElementById('tabPending');
  var tabHistory = document.getElementById('tabHistory');

  var activeClass = 'px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600';
  var inactiveClass = 'px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700';

  if (tab === 'pending') {
    pending.classList.remove('hidden');
    history.classList.add('hidden');
    tabPending.className = activeClass;
    tabHistory.className = inactiveClass;
    loadReceivingQueue();
  } else {
    pending.classList.add('hidden');
    history.classList.remove('hidden');
    tabPending.className = inactiveClass;
    tabHistory.className = activeClass;
    loadReceiptHistory(1);
  }
}

// ── 통계 로드 ──
async function loadPendingStats() {
  try {
    var res = await axios.get('/api/purchase-orders/stats');
    if (res.data.success) {
      var d = res.data.data;
      var pendingEl = document.getElementById('pendingCount');
      var partialEl = document.getElementById('partialCount');
      var overdueEl = document.getElementById('overdueCount');
      if (pendingEl) pendingEl.textContent = d.CONFIRMED || 0;
      if (partialEl) partialEl.textContent = d.PARTIAL_RECEIVED || 0;
      if (overdueEl) overdueEl.textContent = d.overdue || 0;
    }
  } catch(e) { console.error('loadPendingStats error:', e); }
}

// ── D-Day 배지 ──
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

// ── 숫자 콤마 포맷 ──
function formatNumber(n) {
  if (!n && n !== 0) return '0';
  return Number(n).toLocaleString();
}

// ── 페이지네이션 렌더 ──
function renderPagination(containerId, currentPage, totalPages, loadFn) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (!totalPages || totalPages <= 1) { container.innerHTML = ''; return; }
  var html = '';
  for (var i = 1; i <= totalPages; i++) {
    html += '<button onclick="' + loadFn + '(' + i + ')" class="px-3 py-1 mx-1 rounded text-sm '
      + (i === currentPage ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300')
      + '">' + i + '</button>';
  }
  container.innerHTML = html;
}

// ── 입고대기 발주 목록 ──
async function loadPendingPOs(page) {
  pendingPage = page || 1;
  var tbody = document.getElementById('pendingTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">로딩 중...</td></tr>';
  try {
    var url = '/api/purchase-orders?receiving=1&sort=expected_date_asc&page=' + pendingPage + '&limit=20';
    var res = await axios.get(url);
    if (!res.data.success) { throw new Error(res.data.error || '조회 실패'); }
    var items = res.data.data || [];
    var pagination = res.data.pagination || {};
    if (!tbody) return;
    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">입고 대기 발주서가 없습니다.</td></tr>';
      document.getElementById('pendingPagination').innerHTML = '';
      return;
    }
    tbody.innerHTML = items.map(function(po) {
      var badge = '<span class="px-2 py-0.5 rounded text-xs font-medium '
        + (statusColors[po.status] || 'bg-gray-100 text-gray-700') + '">'
        + (statusLabels[po.status] || po.status) + '</span>';
      var isOverdue = po.expected_date && (po.status === 'CONFIRMED' || po.status === 'PARTIAL_RECEIVED')
        && new Date(po.expected_date) < new Date(new Date().toDateString());
      var rowClass = isOverdue ? 'border-t hover:bg-red-50 bg-red-50 cursor-pointer' : 'border-t hover:bg-gray-50 cursor-pointer';
      var actions = '<div class="flex gap-1 justify-center">'
        + '<button onclick="event.stopPropagation();viewDetail(' + po.id + ')" class="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200" title="상세"><i class="fas fa-eye"></i></button>';
      if (po.status === 'CONFIRMED' || po.status === 'PARTIAL_RECEIVED') {
        actions += '<button onclick="event.stopPropagation();openReceiveModal(' + po.id + ')" class="px-2 py-1 text-xs bg-amber-50 text-amber-700 rounded hover:bg-amber-100" title="입고처리"><i class="fas fa-truck-loading"></i></button>';
      }
      actions += '</div>';
      return '<tr class="' + rowClass + '" ondblclick="viewDetail(' + po.id + ')">'
        + '<td class="px-4 py-3 font-medium text-blue-700 cursor-pointer hover:underline" onclick="viewDetail(' + po.id + ')">' + escapeHtml(po.po_number || '-') + '</td>'
        + '<td class="px-4 py-3">' + escapeHtml(po.supplier_name || '-') + '</td>'
        + '<td class="px-4 py-3 text-center">' + (po.order_date || '-') + '</td>'
        + '<td class="px-4 py-3 text-center">' + (po.expected_date || '-') + getDueBadge(po.expected_date, po.status) + '</td>'
        + '<td class="px-4 py-3 text-center">' + badge + '</td>'
        + '<td class="px-4 py-3">' + actions + '</td>'
        + '</tr>';
    }).join('');
    renderPagination('pendingPagination', pendingPage, pagination.total_pages, 'loadPendingPOs');
  } catch(e) {
    console.error('loadPendingPOs error:', e);
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-red-500">조회 실패: ' + escapeHtml(e.message) + '</td></tr>';
  }
}

// ── 입고이력 ──
async function loadReceiptHistory(page) {
  historyPage = page || 1;
  var tbody = document.getElementById('historyTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-gray-500">로딩 중...</td></tr>';
  try {
    var dateFrom = document.getElementById('historyDateFrom').value;
    var dateTo = document.getElementById('historyDateTo').value;
    var status = document.getElementById('historyStatus').value;
    var search = document.getElementById('historySearch').value;
    var url = '/api/purchase-orders/receipts?page=' + historyPage + '&limit=20';
    if (dateFrom) url += '&date_from=' + encodeURIComponent(dateFrom);
    if (dateTo) url += '&date_to=' + encodeURIComponent(dateTo);
    if (status) url += '&inspection_status=' + encodeURIComponent(status);
    if (search) url += '&search=' + encodeURIComponent(search);
    var res = await axios.get(url);
    if (!res.data.success) { throw new Error(res.data.error || '조회 실패'); }
    var items = res.data.data || [];
    var pagination = res.data.pagination || {};
    if (!tbody) return;
    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-gray-500">입고 이력이 없습니다.</td></tr>';
      document.getElementById('historyPagination').innerHTML = '';
      return;
    }
    tbody.innerHTML = items.map(function(r) {
      var badge = '<span class="px-2 py-0.5 rounded text-xs font-medium '
        + (inspStatusColors[r.inspection_status] || 'bg-gray-100 text-gray-700') + '">'
        + (inspStatusLabels[r.inspection_status] || r.inspection_status || '-') + '</span>';
      return '<tr class="border-t hover:bg-gray-50">'
        + '<td class="px-4 py-3 font-medium">#' + (r.id || '-') + '</td>'
        + '<td class="px-4 py-3 text-center">' + (r.receipt_date ? r.receipt_date.substring(0, 10) : '-') + '</td>'
        + '<td class="px-4 py-3 text-blue-700">' + escapeHtml(r.po_number || '-') + '</td>'
        + '<td class="px-4 py-3">' + escapeHtml(r.supplier_name || '-') + '</td>'
        + '<td class="px-4 py-3 text-center">' + badge + '</td>'
        + '<td class="px-4 py-3 text-center text-green-700 font-medium">' + (r.total_accepted || 0) + '</td>'
        + '<td class="px-4 py-3 text-center text-red-700 font-medium">' + (r.total_rejected || 0) + '</td>'
        + '<td class="px-4 py-3 text-center">' + escapeHtml(r.inspector_name || '-') + '</td>'
        + '</tr>';
    }).join('');
    renderPagination('historyPagination', historyPage, pagination.total_pages, 'loadReceiptHistory');
  } catch(e) {
    console.error('loadReceiptHistory error:', e);
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-red-500">조회 실패: ' + escapeHtml(e.message) + '</td></tr>';
  }
}


// ── 검수 이력 로드 ──
async function loadDetailInspections(poId) {
  var container = document.getElementById('detailInspections');
  if (!container) return;
  container.innerHTML = '<h4 class="font-semibold text-sm mb-2">검수 이력</h4>'
    + '<div class="text-center py-4 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>로딩중...</div>';
  try {
    var res = await axios.get('/api/purchase-orders/' + poId + '/inspections');
    if (!res.data.success) {
      container.innerHTML = '<h4 class="font-semibold text-sm mb-2">검수 이력</h4>'
        + '<div class="text-gray-400 text-sm py-2">검수 이력 없음</div>';
      return;
    }
    var receipts = res.data.data || [];
    if (receipts.length === 0) {
      container.innerHTML = '<h4 class="font-semibold text-sm mb-2">검수 이력</h4>'
        + '<div class="text-gray-400 text-sm py-2">입고 이력이 없습니다.</div>';
      return;
    }
    var html = '<h4 class="font-semibold text-sm mb-2"><i class="fas fa-clipboard-check mr-1 text-green-600"></i>검수 이력</h4>';
    html += receipts.map(function(r) {
      var badge = '<span class="px-2 py-0.5 rounded text-xs font-medium '
        + (inspStatusColors[r.inspection_status] || 'bg-gray-100 text-gray-700') + '">'
        + (inspStatusLabels[r.inspection_status] || r.inspection_status || '-') + '</span>';
      var itemRows = (r.items || []).map(function(it) {
        var itStatus = it.quality_status || 'PASSED';
        var itBadge = '<span class="px-1.5 py-0.5 rounded text-xs '
          + (inspStatusColors[itStatus] || 'bg-gray-100 text-gray-700') + '">'
          + (inspStatusLabels[itStatus] || itStatus) + '</span>';
        return '<tr class="border-t">'
          + '<td class="px-2 py-1.5 text-xs">' + escapeHtml(it.item_name || '-') + '</td>'
          + '<td class="px-2 py-1.5 text-xs text-center">' + (it.received_quantity || 0) + '</td>'
          + '<td class="px-2 py-1.5 text-xs text-center text-green-700">' + (it.accepted_quantity || 0) + '</td>'
          + '<td class="px-2 py-1.5 text-xs text-center text-red-700">' + (it.rejected_quantity || 0) + '</td>'
          + '<td class="px-2 py-1.5 text-xs text-center">' + itBadge + '</td>'
          + '<td class="px-2 py-1.5 text-xs text-gray-500">' + escapeHtml(it.reject_memo || '') + '</td>'
          + '</tr>';
      }).join('');
      return '<div class="border rounded-lg mb-2 overflow-hidden">'
        + '<div class="bg-gray-50 px-3 py-2 flex items-center justify-between">'
        + '<div class="text-xs font-medium">'
        + '<i class="fas fa-truck-loading text-gray-500 mr-1"></i>'
        + '입고 #' + (r.id || '') + ' &nbsp;|&nbsp; '
        + (r.receipt_date ? r.receipt_date.substring(0, 10) : '-')
        + (r.inspector_name ? ' &nbsp;|&nbsp; 검수자: ' + escapeHtml(r.inspector_name) : '')
        + '</div>' + badge + '</div>'
        + '<div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-gray-50"><tr>'
        + '<th class="px-2 py-1.5 text-left font-medium text-gray-500">품목명</th>'
        + '<th class="px-2 py-1.5 text-center font-medium text-gray-500">수령</th>'
        + '<th class="px-2 py-1.5 text-center font-medium text-green-700">합격</th>'
        + '<th class="px-2 py-1.5 text-center font-medium text-red-700">불합격</th>'
        + '<th class="px-2 py-1.5 text-center font-medium text-gray-500">상태</th>'
        + '<th class="px-2 py-1.5 text-left font-medium text-gray-500">불합격사유</th>'
        + '</tr></thead>'
        + '<tbody>' + (itemRows || '<tr><td colspan="6" class="px-2 py-2 text-center text-gray-400">품목 없음</td></tr>') + '</tbody>'
        + '</table></div>'
        + '</div>';
    }).join('');
    container.innerHTML = html;
  } catch(e) {
    if (container) container.innerHTML = '<h4 class="font-semibold text-sm mb-2">검수 이력</h4>'
      + '<div class="text-gray-400 text-sm">검수 이력 조회 실패</div>';
    console.error('loadDetailInspections error:', e);
  }
}

// ── 통합 모달 열기 (발주 상세 + 입고 처리) ──
// scope: 'mine' | 'all' | undefined
// 입고 가능 상태(CONFIRMED, PARTIAL_RECEIVED)면 입고 입력 영역 표시
// 입고 불가 상태(RECEIVED, CANCELLED 등)면 상세 전용 모드
async function openReceiveModal(id, scope) {
  currentPOId = id;
  window._currentPOId = id;
  var effectiveScope = scope;
  if (currentUserRole === 'OPERATOR') effectiveScope = 'mine';
  window._currentScope = effectiveScope;
  try {
    var res = await axios.get('/api/purchase-orders/' + id);
    if (!res.data.success) { showToast('불러오기 실패', 'error'); return; }
    var po = res.data.data;

    // PO 요약 정보 채우기
    var statusBadge = '<span class="px-2 py-0.5 rounded text-xs font-medium '
      + (statusColors[po.status] || 'bg-gray-100 text-gray-700') + '">'
      + (statusLabels[po.status] || po.status) + '</span>';
    var poInfoEl = document.getElementById('receivePoInfo');
    if (poInfoEl) {
      poInfoEl.innerHTML =
        '<div class="grid grid-cols-2 gap-3 text-sm">'
        + '<div><span class="text-gray-500">발주번호:</span> <span class="font-bold text-blue-700">' + escapeHtml(po.po_number || '-') + '</span></div>'
        + '<div><span class="text-gray-500">상태:</span> ' + statusBadge + '</div>'
        + '<div><span class="text-gray-500">공급업체:</span> <span class="font-medium">' + escapeHtml(po.supplier_name || '-') + '</span></div>'
        + '<div><span class="text-gray-500">납기예정:</span> ' + (po.expected_date || '-') + getDueBadge(po.expected_date, po.status) + '</div>'
        + '</div>';
    }

    var canReceive = (po.status === 'CONFIRMED' || po.status === 'PARTIAL_RECEIVED');
    var inputArea = document.getElementById('receiveInputArea');
    var detailOnly = document.getElementById('receiveDetailOnly');

    if (canReceive) {
      if (inputArea) inputArea.classList.remove('hidden');
      if (detailOnly) detailOnly.classList.add('hidden');

      // 입고 가능 품목 필터링
      var items = (po.items || []).filter(function(it) {
        var remaining = (it.quantity || 0) - (it.received_quantity || 0);
        if (remaining <= 0) return false;
        if (effectiveScope === 'mine') {
          if (it.zone_manager_id == null) {
            return currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER';
          }
          return it.zone_manager_id === currentUserId;
        }
        return true;
      });
      window._receiveItems = items;

      // 오늘 날짜 기본값
      var today = new Date().toISOString().split('T')[0];
      var dateEl = document.getElementById('receipt_date');
      if (dateEl) dateEl.value = today;
      var notesEl = document.getElementById('receipt_notes');
      if (notesEl) notesEl.value = '';

      var countEl = document.getElementById('receiveItemsCount');
      if (countEl) countEl.textContent = '입고 품목 (' + items.length + '건)';

      var tbody = document.getElementById('receiveItemsBody');
      if (tbody) {
        if (items.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" class="px-3 py-4 text-center text-gray-400">모든 품목이 입고 완료되었습니다.</td></tr>';
        } else {
          tbody.innerHTML = items.map(function(it) {
            var remaining = (it.quantity || 0) - (it.received_quantity || 0);
            var defaultRecv = Math.max(0, remaining);
            var isDone = remaining <= 0;
            var rowClass = isDone ? 'border-t opacity-50' : 'border-t';
            var specLabel = it.item_width_mm ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium">' + it.item_width_mm + 'mm</span>' : '';
            var unitLabel = it.item_unit ? ' <span class="text-xs font-medium text-gray-500">' + escapeHtml(it.item_unit) + '</span>' : '';
            return '<tr class="' + rowClass + '">'
              + '<td class="px-3 py-2 text-sm"><div class="font-medium">' + escapeHtml(it.item_name || '-') + '</div>'
              + '<div>' + specLabel + unitLabel + '</div></td>'
              + '<td class="px-3 py-2 text-center text-sm tabular-nums">' + (it.quantity || 0) + '</td>'
              + '<td class="px-3 py-2 text-center text-sm tabular-nums">' + (it.received_quantity || 0) + '</td>'
              + '<td class="px-3 py-2 text-center tabular-nums text-base font-bold text-amber-600">' + Math.max(0, remaining) + '</td>'
              + '<td class="px-3 py-2 text-center">'
              + '<input type="number" id="recv_' + it.id + '" value="' + defaultRecv + '"'
              + ' min="0" max="' + remaining + '" class="w-24 border rounded px-3 py-1.5 text-base font-bold text-center tabular-nums recv-input">'
              + '</td>'
              + '</tr>';
          }).join('');

          // 첫 번째 수령 input에 포커스
          var firstInput = document.querySelector('#receiveItemsBody .recv-input');
          if (firstInput) setTimeout(function() { firstInput.focus(); firstInput.select(); }, 100);
        }
      }
    } else {
      // 상세 전용 모드
      if (inputArea) inputArea.classList.add('hidden');
      if (detailOnly) detailOnly.classList.remove('hidden');

      // 품목 목록
      var allItems = po.items || [];
      var itemRows = allItems.map(function(it) {
        var remaining = (it.quantity || 0) - (it.received_quantity || 0);
        var dSpecLabel = it.item_width_mm ? ' <span class="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium">' + it.item_width_mm + 'mm</span>' : '';
        return '<tr class="border-t">'
          + '<td class="px-3 py-2"><div>' + escapeHtml(it.item_name || '-') + dSpecLabel + '</div></td>'
          + '<td class="px-3 py-2 text-center">' + (it.quantity || 0) + '</td>'
          + '<td class="px-3 py-2 text-center">' + (it.received_quantity || 0) + '</td>'
          + '<td class="px-3 py-2 text-center ' + (remaining > 0 ? 'text-orange-600 font-medium' : 'text-gray-400') + '">' + Math.max(0, remaining) + '</td>'
          + '</tr>';
      }).join('');
      var detailItemsEl = document.getElementById('detailItems');
      if (detailItemsEl) {
        detailItemsEl.innerHTML =
          '<h4 class="font-semibold text-sm mb-2">발주 품목</h4>'
          + '<div class="overflow-x-auto">'
          + '<table class="w-full text-sm"><thead class="bg-gray-50"><tr>'
          + '<th class="px-3 py-2 text-left">품목명</th>'
          + '<th class="px-3 py-2 text-center">발주수량</th>'
          + '<th class="px-3 py-2 text-center">입고수량</th>'
          + '<th class="px-3 py-2 text-center">잔여</th>'
          + '</tr></thead>'
          + '<tbody>' + (itemRows || '<tr><td colspan="4" class="px-3 py-4 text-center text-gray-400">품목 없음</td></tr>') + '</tbody>'
          + '</table></div>';
      }
      loadDetailInspections(id);
    }

    document.getElementById('receiveModal').classList.remove('hidden');
  } catch(e) {
    showToast('모달 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

// viewDetail은 openReceiveModal로 통합 (하위호환 유지)
function viewDetail(id) {
  openReceiveModal(id, currentScope);
}

// ── 입고 확정 ──
async function submitReceive() {
  var items = window._receiveItems || [];
  if (items.length === 0) { showToast('입고 처리할 품목이 없습니다.', 'warning'); return; }
  var dateEl = document.getElementById('receipt_date');
  var notesEl = document.getElementById('receipt_notes');
  var receiptDate = dateEl ? dateEl.value : '';
  var receiptNotes = notesEl ? notesEl.value.trim() : '';
  if (!receiptDate) { showToast('입고일을 입력해주세요.', 'warning'); return; }

  var receiveData = items.map(function(it) {
    var recvEl = document.getElementById('recv_' + it.id);
    var recvQty = recvEl ? (parseFloat(recvEl.value) || 0) : 0;
    return {
      po_item_id: it.id,
      received_quantity: recvQty,
      accepted_quantity: recvQty,
      rejected_quantity: 0,
      reject_memo: null
    };
  }).filter(function(r) { return r.received_quantity > 0; });

  if (receiveData.length === 0) { showToast('입고 수량을 1개 이상 입력하세요.', 'warning'); return; }

  try {
    var res = await axios.post('/api/purchase-orders/' + currentPOId + '/receive', {
      receipt_date: receiptDate,
      notes: receiptNotes,
      items: receiveData
    });
    if (res.data.success) {
      var isPending = res.data.data && res.data.data.inspection_status === 'PENDING_REVIEW';
      if (isPending) {
        showToast('입고 완료. 부족 수량이 감지되어 관리자 확인 대기로 전환됩니다.', 'warning');
      } else {
        showToast('입고 처리가 완료되었습니다.', 'success');
      }
      closeReceiveModal();
      loadPendingStats();
      loadReceivingQueue();
    } else {
      showToast('입고 처리 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('입고 처리 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

// ── 모달 닫기 ──
function closeDetailModal() {
  // 하위호환: detailModal이 없어도 receiveModal 닫기
  var m = document.getElementById('detailModal');
  if (m) m.classList.add('hidden');
  closeReceiveModal();
}

function closeReceiveModal() {
  document.getElementById('receiveModal').classList.add('hidden');
}

// 오버레이 클릭으로 닫기
document.getElementById('receiveModal').addEventListener('click', function(e) {
  if (e.target === this) closeReceiveModal();
});

// ── 전체 잔량 수령 ──
window.fillAllRemaining = function() {
  document.querySelectorAll('.recv-input').forEach(function(input) {
    var max = parseInt(input.getAttribute('max') || '0');
    if (max > 0) input.value = max;
  });
};

// ── 키보드 단축키 ──
document.addEventListener('keydown', function(e) {
  var modal = document.getElementById('receiveModal');
  if (!modal || modal.classList.contains('hidden')) return;
  // ESC 모달 닫기는 layout.ts 글로벌 핸들러가 처리
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    submitReceive();
    return;
  }
  if (e.key === 'Enter') {
    var active = document.activeElement;
    if (active && active.classList.contains('recv-input')) {
      e.preventDefault();
      var nextRow = active.closest('tr') && active.closest('tr').nextElementSibling;
      if (nextRow) {
        var nextInput = nextRow.querySelector('.recv-input');
        if (nextInput) { nextInput.focus(); nextInput.select(); }
      } else {
        submitReceive();
      }
    }
  }
});

// ============================================================
// 검수 결과 등록 모달 (입고 후 자동 트리거)
// ============================================================
var _inspContext = null;

// 수량 전용 검수 모달 (기본 흐름, 2026-04-15 전환)
// 템플릿/항목 없이 라인별 발주수량 vs 실제수량만 표시 + [확정] [나중에]
window.receivingStartInspection = async function(receiptId) {
  // 1) 입고 상세 (라인 포함) 조회
  let receipt = null
  try {
    const r = await axios.get('/api/inventory/receipts/' + receiptId)
    receipt = r.data.data
  } catch (e) { showToast('입고 조회 실패: ' + e.message, 'error'); return }
  if (!receipt) return

  _inspContext = {
    receipt_id: receiptId,
    receipt_number: receipt.receipt_number,
    receipt_items: receipt.items || []
  }

  const items = receipt.items || []
  const hasShortage = items.some(function(it) { return Number(it.rejected_quantity || 0) > 0 })
  const shortageBanner = hasShortage
    ? '<div class="mb-3 p-3 bg-amber-50 border border-amber-300 rounded text-sm text-amber-800"><i class="fas fa-exclamation-triangle mr-1"></i>부족/거부 수량이 감지되어 검수 확정 시 <b>관리자 확인 대기</b> 상태로 등록됩니다.</div>'
    : '<div class="mb-3 p-3 bg-green-50 border border-green-300 rounded text-sm text-green-800"><i class="fas fa-check-circle mr-1"></i>전량 정상 입고됨. 확정 시 <b>정상 완료</b>.</div>'

  const rows = items.map(function(it) {
    const expected = Number(it.quantity || 0)
    const received = Number(it.received_quantity || 0)
    const rejected = Number(it.rejected_quantity || 0)
    const diff = expected - received
    let statusBadge
    if (diff > 0) statusBadge = '<span class="px-2 py-0.5 text-xs rounded bg-red-50 text-red-700">부족 ' + diff + '</span>'
    else if (rejected > 0) statusBadge = '<span class="px-2 py-0.5 text-xs rounded bg-amber-50 text-amber-700">거부 ' + rejected + '</span>'
    else statusBadge = '<span class="px-2 py-0.5 text-xs rounded bg-green-50 text-green-700">정상</span>'
    return '<tr>' +
      '<td class="px-3 py-2 text-sm font-medium">' + (it.item_name || '#' + it.item_id) + '</td>' +
      '<td class="px-3 py-2 text-sm text-right">' + expected + '</td>' +
      '<td class="px-3 py-2 text-sm text-right">' + received + '</td>' +
      '<td class="px-3 py-2 text-sm text-right text-red-600">' + rejected + '</td>' +
      '<td class="px-3 py-2 text-sm text-center">' + statusBadge + '</td>' +
    '</tr>'
  }).join('')

  const body = document.getElementById('inspectionEntryBody')
  body.innerHTML =
    '<div class="p-6">' +
      '<div class="flex justify-between items-center mb-4">' +
        '<h3 class="text-lg font-bold"><i class="fas fa-clipboard-check mr-1"></i>수량 확인 — ' + (receipt.receipt_number || '#' + receiptId) + '</h3>' +
        '<button onclick="receivingCloseInspectionModal()" class="text-gray-400 hover:text-gray-600 text-xl">&times;</button>' +
      '</div>' +
      shortageBanner +
      '<div class="mb-4 border border-gray-200 rounded overflow-hidden">' +
        '<table class="w-full">' +
          '<thead class="bg-gray-50">' +
            '<tr>' +
              '<th class="px-3 py-2 text-left text-xs font-medium text-gray-500">품목</th>' +
              '<th class="px-3 py-2 text-right text-xs font-medium text-gray-500">발주</th>' +
              '<th class="px-3 py-2 text-right text-xs font-medium text-gray-500">수령</th>' +
              '<th class="px-3 py-2 text-right text-xs font-medium text-gray-500">거부</th>' +
              '<th class="px-3 py-2 text-center text-xs font-medium text-gray-500">상태</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="mb-4"><label class="ds-label">전체 메모 (선택)</label><textarea id="inspEntryNotes" rows="2" class="ds-input" placeholder="예: 포장 파손 1개"></textarea></div>' +
      '<div class="flex justify-between items-center">' +
        '<button onclick="receivingCloseInspectionModal()" class="ds-btn ds-btn-secondary"><i class="fas fa-clock mr-1"></i>나중에</button>' +
        '<div class="flex gap-2">' +
          '<button onclick="receivingSubmitQuantityInspection()" class="ds-btn ds-btn-primary"><i class="fas fa-check mr-1"></i>확정</button>' +
        '</div>' +
      '</div>' +
    '</div>'

  document.getElementById('inspectionEntryModal').classList.remove('hidden')
}

// 수량 전용 저장 핸들러
window.receivingSubmitQuantityInspection = async function() {
  if (!_inspContext || !_inspContext.receipt_id) return
  const notes = document.getElementById('inspEntryNotes').value
  try {
    const res = await axios.post('/api/inspections/results', {
      receipt_id: _inspContext.receipt_id,
      mode: 'quantity_only',
      notes: notes || null
    })
    const status = (res.data.data && res.data.data.inspection_status) || ''
    const extra = status === 'PENDING_REVIEW' ? ' (관리자 확인 대기)' : ''
    showToast((res.data.message || '수량 확인 완료') + extra, status === 'PENDING_REVIEW' ? 'warning' : 'success')
    receivingCloseInspectionModal()
  } catch (e) {
    const msg = (e.response && e.response.data && e.response.data.error) || e.message
    showToast('저장 실패: ' + msg, 'error')
  }
}

window.receivingStartInspectionFull = async function(receiptId) {
  // 1) 검수 템플릿 목록
  var templates = [];
  try {
    var tr = await axios.get('/api/inspections/templates');
    templates = tr.data.data || [];
  } catch(e) {
    showToast('템플릿 로드 실패: ' + e.message, 'error');
    return;
  }
  if (templates.length === 0) {
    showToast('등록된 검수 템플릿이 없습니다. /inspections에서 먼저 만드세요. (검수 보류됨)', 'warning');
    return;
  }

  // 2) 입고 상세 조회 (라인 포함)
  var receipt = null;
  try {
    var rr = await axios.get('/api/inventory/receipts/' + receiptId);
    receipt = rr.data.data;
  } catch(e) {
    showToast('입고 조회 실패: ' + e.message, 'error');
    return;
  }
  if (!receipt) return;

  _inspContext = {
    receipt_id: receiptId,
    receipt_number: receipt.receipt_number,
    receipt_items: receipt.items || [],
    template_id: null,
    template_items: [],
    notes: ''
  };

  var hasShortage = (receipt.items || []).some(function(it) {
    return Number(it.rejected_quantity || 0) > 0;
  });
  var shortageBanner = hasShortage
    ? '<div class="mb-3 p-3 bg-amber-50 border border-amber-300 rounded text-sm text-amber-800"><i class="fas fa-exclamation-triangle mr-1"></i>이 입고 건에 부족/거부 수량이 있어, 검수 후 자동으로 <b>관리자 확인 대기</b> 상태가 됩니다.</div>'
    : '';

  var itemsList = (receipt.items || []).map(function(it) {
    var expected = Number(it.quantity || 0);
    var received = Number(it.received_quantity || expected);
    var rejected = Number(it.rejected_quantity || 0);
    var diff = expected - received;
    var diffBadge = diff > 0
      ? '<span class="text-red-600 font-medium">부족 ' + diff + '</span>'
      : (rejected > 0
        ? '<span class="text-amber-600 font-medium">거부 ' + rejected + '</span>'
        : '<span class="text-green-700">정상</span>');
    return '<div class="text-xs py-1 border-b border-gray-100">\uD83D\uDCE6 ' + (it.item_name || '품목 #' + it.item_id) + ' \u2014 발주 ' + expected + ' / 수령 ' + received + ' (' + diffBadge + ')</div>';
  }).join('');

  var body = document.getElementById('inspectionEntryBody');
  body.innerHTML =
    '<div class="p-6">' +
      '<div class="flex justify-between items-center mb-4">' +
        '<h3 class="text-lg font-bold"><i class="fas fa-clipboard-check text-blue-600 mr-2"></i>검수 결과 등록 \u2014 ' + (receipt.receipt_number || '#' + receiptId) + '</h3>' +
        '<button onclick="receivingCloseInspectionModal()" class="text-gray-400 hover:text-gray-600 text-xl">&times;</button>' +
      '</div>' +
      shortageBanner +
      '<div class="mb-3 p-2 bg-gray-50 rounded text-xs"><div class="font-semibold mb-1">입고 라인 (' + (receipt.items || []).length + '개):</div>' + itemsList + '</div>' +
      '<div class="mb-4">' +
        '<label class="block text-sm font-medium text-gray-700 mb-1">검수 템플릿 선택</label>' +
        '<select id="inspTemplateSelect" class="w-full px-3 py-2 border rounded-lg text-sm" onchange="receivingLoadInspTemplate(this.value)">' +
          '<option value="">\u2014 선택 \u2014</option>' +
          templates.map(function(t) {
            return '<option value="' + t.id + '">' + t.template_name + (t.category_name ? ' (' + t.category_name + ')' : '') + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div id="inspItemsList" class="space-y-2 mb-4 max-h-96 overflow-y-auto"></div>' +
      '<div class="mb-4"><label class="block text-sm font-medium text-gray-700 mb-1">전체 메모 (선택)</label><textarea id="inspEntryNotes" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm resize-none" placeholder="검수 전반에 대한 메모..."></textarea></div>' +
      '<div class="flex justify-between items-center">' +
        '<button onclick="receivingCloseInspectionModal()" class="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"><i class="fas fa-clock mr-1"></i>나중에</button>' +
        '<div class="flex gap-2">' +
          '<button onclick="receivingCloseInspectionModal()" class="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm">취소</button>' +
          '<button onclick="receivingSubmitInspection()" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"><i class="fas fa-check mr-1"></i>저장</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.getElementById('inspectionEntryModal').classList.remove('hidden');
};

window.receivingCloseInspectionModal = function() {
  document.getElementById('inspectionEntryModal').classList.add('hidden');
  _inspContext = null;
};

window.receivingLoadInspTemplate = async function(templateId) {
  if (!templateId) {
    document.getElementById('inspItemsList').innerHTML = '';
    return;
  }
  try {
    var res = await axios.get('/api/inspections/templates/' + templateId);
    var tpl = res.data.data;
    _inspContext.template_id = Number(templateId);
    _inspContext.template_items = (tpl.items || []).map(function(it) {
      return { template_item_id: it.id, check_item: it.check_item, check_type: it.check_type, check_result: '', value: '', notes: '' };
    });
    receivingRenderInspItems();
  } catch(e) {
    showToast('템플릿 로드 실패: ' + e.message, 'error');
  }
};

function receivingRenderInspItems() {
  var items = _inspContext.template_items;
  var wrap = document.getElementById('inspItemsList');
  if (items.length === 0) {
    wrap.innerHTML = '<div class="text-center text-gray-400 py-3 text-sm">템플릿을 선택하세요.</div>';
    return;
  }
  wrap.innerHTML = items.map(function(it, idx) {
    var isPassFail = (it.check_type || 'PASS_FAIL') !== 'VALUE';
    var valueInput = isPassFail ? '' :
      '<input type="text" placeholder="\uAC12" oninput="window._receivingInspItem(' + idx + ',\'value\',this.value)" class="w-32 px-2 py-1 border rounded text-sm">';
    return '<div class="border rounded p-2 bg-gray-50">' +
      '<div class="flex items-center gap-2">' +
        '<span class="flex-1 text-sm font-medium">' + it.check_item + '</span>' +
        '<select onchange="window._receivingInspItem(' + idx + ',\'check_result\',this.value)" class="px-2 py-1 border rounded w-28 text-sm">' +
          '<option value="">\uc120\ud0dd</option><option value="PASS">PASS</option><option value="FAIL">FAIL</option><option value="NA">N/A</option>' +
        '</select>' + valueInput +
      '</div>' +
      '<input type="text" placeholder="\ud56d\ubaa9\ubcc4 \uba54\ubaa8 (\uc120\ud0dd)" oninput="window._receivingInspItem(' + idx + ',\'notes\',this.value)" class="w-full px-2 py-1 border rounded text-xs mt-1">' +
    '</div>';
  }).join('');
}

window._receivingInspItem = function(idx, key, val) {
  if (_inspContext && _inspContext.template_items[idx]) {
    _inspContext.template_items[idx][key] = val;
  }
};

window.receivingSubmitInspection = async function() {
  if (!_inspContext.template_id) { showToast('템플릿을 선택하세요', 'warning'); return; }
  if (_inspContext.template_items.length === 0) { showToast('검수 항목이 없습니다', 'warning'); return; }
  if (_inspContext.template_items.some(function(i) { return !i.check_result; })) {
    showToast('모든 항목의 결과를 선택하세요', 'warning');
    return;
  }
  _inspContext.notes = document.getElementById('inspEntryNotes').value;
  try {
    var res = await axios.post('/api/inspections/results', {
      receipt_id: _inspContext.receipt_id,
      template_id: _inspContext.template_id,
      items: _inspContext.template_items.map(function(i) {
        return {
          template_item_id: i.template_item_id,
          check_item: i.check_item,
          check_result: i.check_result,
          value: i.value || null,
          notes: i.notes || null
        };
      }),
      notes: _inspContext.notes || null
    });
    var status = (res.data.data && res.data.data.inspection_status) || '';
    var extra = status === 'PENDING_REVIEW' ? ' (관리자 확인 대기)' : '';
    showToast((res.data.message || '검수 저장 완료') + extra, status === 'PENDING_REVIEW' ? 'warning' : 'success');
    receivingCloseInspectionModal();
  } catch(e) {
    showToast('저장 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
};

// ============================================================================
// 입고 대기 큐 (카드 기반, 2026-04-15 저녁 재설계)
// ============================================================================

// 유저 정보 + 기본 scope 결정
async function detectUserScope() {
  try {
    var tok = localStorage.getItem('token');
    if (!tok) return;
    // JWT payload 디코딩 (verify 없음 — 표시 용도)
    var parts = tok.split('.');
    if (parts.length < 2) return;
    var payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
    currentUserId = payload.id;
    currentUserRole = payload.role;
    // OPERATOR → mine, ADMIN/MANAGER → all
    currentScope = (currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') ? 'all' : 'mine';
    updateScopeButtons();
  } catch(e) { /* silent */ }
}

function updateScopeButtons() {
  var mineBtn = document.getElementById('scopeMineBtn');
  var allBtn = document.getElementById('scopeAllBtn');
  if (!mineBtn || !allBtn) return;
  var active = 'px-4 py-2 text-sm font-medium bg-blue-600 text-white';
  var inactive = 'px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50';
  if (currentScope === 'mine') {
    mineBtn.className = active;
    allBtn.className = inactive;
  } else {
    mineBtn.className = inactive;
    allBtn.className = active;
  }
}

function switchScope(scope) {
  currentScope = scope;
  updateScopeButtons();
  loadReceivingQueue();
}
window.switchScope = switchScope;

async function loadReceivingQueue() {
  var wrap = document.getElementById('poCardList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="text-center text-gray-400 py-8">로딩 중...</div>';
  try {
    // 두 scope 모두 카운트 업데이트 (배지용)
    var [mineRes, allRes] = await Promise.all([
      axios.get('/api/purchase-orders/receiving-queue?scope=mine'),
      (currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER')
        ? axios.get('/api/purchase-orders/receiving-queue?scope=all')
        : Promise.resolve({ data: { data: { po_groups: [] } } })
    ]);
    var mineGroups = (mineRes.data.data || {}).po_groups || [];
    var allGroups = (allRes.data.data || {}).po_groups || [];
    // 카운트 = 라인 수 (탭 옆에 숫자)
    var mineLineCnt = mineGroups.reduce(function(s,g){ return s + g.lines.length; }, 0);
    var allLineCnt = allGroups.reduce(function(s,g){ return s + g.lines.length; }, 0);
    document.getElementById('scopeMineCount').textContent = mineLineCnt;
    document.getElementById('scopeAllCount').textContent = allLineCnt;
    // OPERATOR는 전체 버튼 숨김
    if (!(currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER')) {
      document.getElementById('scopeAllBtn').style.display = 'none';
    }

    queuePoGroups = (currentScope === 'mine') ? mineGroups : allGroups;

    // 납기 지연 > 임박 > 일반 순 정렬
    var groups = queuePoGroups.slice();
    groups.sort(function(a, b) {
      var now = new Date(); now.setHours(0,0,0,0);
      var aDate = a.expected_date ? new Date(a.expected_date) : new Date('2099-12-31');
      var bDate = b.expected_date ? new Date(b.expected_date) : new Date('2099-12-31');
      aDate.setHours(0,0,0,0); bDate.setHours(0,0,0,0);
      var aOverdue = aDate < now ? -2 : (aDate - now <= 3*86400000 ? -1 : 0);
      var bOverdue = bDate < now ? -2 : (bDate - now <= 3*86400000 ? -1 : 0);
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      return aDate - bDate;
    });
    renderPoCards(groups);
  } catch(e) {
    wrap.innerHTML = '<div class="text-center text-red-500 py-8">조회 실패: ' + escapeHtml(e.message) + '</div>';
  }
};

function renderPoCards(groups) {
  var wrap = document.getElementById('poCardList');
  if (groups.length === 0) {
    var msg = (currentScope === 'mine')
      ? '내 담당 창고의 입고 대기 라인이 없습니다.'
      : '입고 대기 PO가 없습니다.';
    wrap.innerHTML =
      '<div class="bg-white rounded-lg shadow text-center py-12 text-gray-400">' +
        '<i class="fas fa-check-circle text-5xl text-green-200 mb-4 block"></i>' +
        '<div class="text-base">' + msg + '</div>' +
      '</div>';
    return;
  }

  wrap.innerHTML = groups.map(function(g) {
    var totalOrdered = g.lines.reduce(function(s,l){ return s + Number(l.ordered_quantity||0); }, 0);
    var totalReceived = g.lines.reduce(function(s,l){ return s + Number(l.received_quantity||0); }, 0);
    var pct = totalOrdered > 0 ? Math.round(totalReceived / totalOrdered * 100) : 0;
    var statusBadge = '<span class="px-2 py-0.5 text-xs rounded ' + (statusColors[g.po_status] || 'bg-gray-100') + '">' + (statusLabels[g.po_status] || g.po_status) + '</span>';

    // 납기 상태별 좌측 테두리
    var now = new Date(); now.setHours(0,0,0,0);
    var expDate = g.expected_date ? new Date(g.expected_date) : null;
    var cardBorderClass = '';
    if (expDate) {
      expDate.setHours(0,0,0,0);
      if (expDate < now) cardBorderClass = 'border-l-4 border-red-500';
      else if (expDate - now <= 3*86400000) cardBorderClass = 'border-l-4 border-amber-400';
    }

    var lineRows = g.lines.map(function(l) {
      var lineReceived = Number(l.received_quantity || 0);
      var lineOrdered = Number(l.ordered_quantity || 0);
      var lineRemaining = lineOrdered - lineReceived;
      var lineStatusBadge =
        l.line_status === 'RECEIVED' ? '<span class="inline-flex items-center text-xs text-green-700"><i class="fas fa-check-circle text-[7px] mr-1"></i>완료</span>' :
        l.line_status === 'PARTIAL' ? '<span class="inline-flex items-center text-xs text-amber-700"><i class="fas fa-spinner text-[7px] mr-1"></i>부분</span>' :
        '<span class="inline-flex items-center text-xs text-gray-500"><i class="far fa-clock text-[7px] mr-1"></i>대기</span>';
      var zoneLabel = l.zone_name
        ? '<span class="text-xs text-blue-700"><i class="fas fa-warehouse mr-0.5"></i>' + escapeHtml(l.zone_name) + '</span>'
        : '<span class="text-xs text-gray-400">창고 미지정</span>';
      var ownerLabel = l.is_mine
        ? '<span class="text-xs font-semibold text-blue-700">내 담당</span>'
        : (l.zone_manager_name ? '<span class="text-xs text-gray-500">담당: ' + escapeHtml(l.zone_manager_name) + '</span>' : '<span class="text-xs text-gray-400">담당 미지정</span>');
      return '<div class="flex items-center gap-3 py-1.5 border-t border-gray-100 text-sm">' +
        '<div class="flex-1">' +
          '<div class="font-medium">' + escapeHtml(l.item_name || '#' + l.item_id) + '</div>' +
          '<div class="flex gap-2 mt-0.5">' + zoneLabel + ownerLabel + '</div>' +
        '</div>' +
        '<div class="text-right text-xs">' +
          '<div>발주 <b>' + lineOrdered + '</b>' + (l.unit ? ' ' + l.unit : '') + '</div>' +
          '<div>잔량 <b class="text-amber-600">' + lineRemaining + '</b></div>' +
        '</div>' +
        '<div style="min-width:60px" class="text-right">' + lineStatusBadge + '</div>' +
      '</div>';
    }).join('');

    return '<div class="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden ' + cardBorderClass + '">' +
      '<div class="p-4">' +
        '<div class="flex justify-between items-start mb-2">' +
          '<div>' +
            '<div class="flex items-center gap-2 mb-1">' +
              '<span class="font-bold text-base">' + escapeHtml(g.po_number || '#' + g.po_id) + '</span>' +
              statusBadge +
            '</div>' +
            '<div class="text-xs text-gray-500">' +
              '공급처 <b>' + escapeHtml(g.supplier_name || '-') + '</b>' +
              ' · 발주일 ' + escapeHtml(g.order_date || '-') +
              (g.expected_date ? ' · 예정 ' + escapeHtml(g.expected_date) : '') +
            '</div>' +
          '</div>' +
          '<button onclick="openReceiveModal(' + g.po_id + ', \'' + currentScope + '\')" class="ds-btn ds-btn-primary">' +
            '<i class="fas fa-check mr-1"></i>입고 처리' +
          '</button>' +
        '</div>' +
        '<div class="mb-2">' +
          '<div class="flex justify-between text-xs text-gray-500 mb-1">' +
            '<span>진행률 ' + totalReceived + ' / ' + totalOrdered + '</span>' +
            '<span class="font-bold text-blue-600">' + pct + '%</span>' +
          '</div>' +
          '<div class="w-full bg-gray-200 rounded-full h-1.5"><div class="bg-blue-500 h-1.5 rounded-full" style="width:' + pct + '%"></div></div>' +
        '</div>' +
        '<div class="mt-2">' + lineRows + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ── 초기화 ──
(async function init() {
  await detectUserScope();
  loadPendingStats();
  loadReceivingQueue();
})();
