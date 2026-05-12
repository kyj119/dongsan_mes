var currentPage = 1;
var _statusChangeOrderId = null;
var selectedOrderIds = new Set();

// Skeleton loading
(function() {
  var tbody = document.getElementById('ordersTable');
  if (tbody && window.dsSkeleton) tbody.innerHTML = dsSkeleton.table(8, 9);
  // 새 주문 버튼: 마지막 사용한 주문서 형식으로 링크 설정
  var link = document.getElementById('newOrderLink');
  if (link) {
    var lastType = localStorage.getItem('lastOrderFormType');
    link.href = lastType === 'dist' ? '/order-form?type=dist' : '/order-form';
  }
})();

// 일괄 선택 관련
function toggleSelectAll(el) {
  var checkboxes = document.querySelectorAll('.order-checkbox');
  checkboxes.forEach(function(cb) {
    cb.checked = el.checked;
    var orderId = parseInt(cb.dataset.orderId);
    if (el.checked) selectedOrderIds.add(orderId);
    else selectedOrderIds.delete(orderId);
  });
  updateBulkBar();
}

function toggleOrderSelect(el) {
  var orderId = parseInt(el.dataset.orderId);
  if (el.checked) selectedOrderIds.add(orderId);
  else selectedOrderIds.delete(orderId);
  var allCb = document.getElementById('selectAllOrders');
  var checkboxes = document.querySelectorAll('.order-checkbox');
  allCb.checked = checkboxes.length > 0 && selectedOrderIds.size === checkboxes.length;
  updateBulkBar();
}

var STATUS_TRANSITIONS = {
  CONFIRMED: ['PRINTING', 'PRINT_DONE'],
  PRINTING: ['PRINT_DONE', 'CONFIRMED'],
  PRINT_DONE: ['SHIPPED', 'PRINTING', 'CONFIRMED'],
  SHIPPED: []
};
var STATUS_LABELS = { QUOTATION: '견적', CONFIRMED: '확정', PRINTING: '출력중', PRINT_DONE: '출력완료', SHIPPED: '출고완료', CANCELLED: '취소' };

function updateBulkBar() {
  var bar = document.getElementById('bulkActionBar');
  var spacer = document.getElementById('bulkActionSpacer');
  var count = document.getElementById('bulkCount');
  if (selectedOrderIds.size > 0) {
    bar.classList.add('visible');
    if (spacer) spacer.classList.add('visible');
    count.textContent = selectedOrderIds.size;
    // 선택된 주문들의 상태 수집 → 공통 전이 가능 상태만 표시
    var statuses = new Set();
    selectedOrderIds.forEach(function(id) {
      var row = document.querySelector('tr[data-order-id="' + id + '"]');
      if (row && row.dataset.status) statuses.add(row.dataset.status);
    });
    var validNext = null;
    statuses.forEach(function(s) {
      var next = new Set(STATUS_TRANSITIONS[s] || []);
      if (validNext === null) validNext = next;
      else {
        var intersection = new Set();
        next.forEach(function(n) { if (validNext.has(n)) intersection.add(n); });
        validNext = intersection;
      }
    });
    var sel = document.getElementById('bulkStatusSelect');
    if (sel) {
      sel.innerHTML = '<option value="">상태 선택</option>';
      (validNext || new Set()).forEach(function(s) {
        sel.innerHTML += '<option value="' + s + '">' + (STATUS_LABELS[s] || s) + '</option>';
      });
    }
  } else {
    bar.classList.remove('visible');
    if (spacer) spacer.classList.remove('visible');
  }
}

function clearBulkSelection() {
  selectedOrderIds.clear();
  document.querySelectorAll('.order-checkbox').forEach(function(cb) { cb.checked = false; });
  var allCb = document.getElementById('selectAllOrders');
  if (allCb) allCb.checked = false;
  updateBulkBar();
}

async function bulkShipSelected() {
  if (selectedOrderIds.size === 0) return;
  if (!(await showConfirm(selectedOrderIds.size + '건의 주문을 일괄 출고 처리하시겠습니까?\n(출력완료 상태의 카드만 출고됩니다)'))) return;
  try {
    var res = await axios.patch('/api/orders/bulk-ship', { order_ids: Array.from(selectedOrderIds) });
    if (res.data.success) {
      var results = res.data.data || [];
      var totalShipped = 0, failCount = 0, remainingCards = [];
      results.forEach(function(r) {
        if (r.success) {
          totalShipped += (r.shipped_cards || 0);
          if (r.remaining > 0 && r.unshipped_cards) {
            remainingCards = remainingCards.concat(r.unshipped_cards.map(function(c) { return c.card_number + ' (' + c.status + ')'; }));
          }
        } else failCount++;
      });
      var msg = totalShipped + '건 카드 출고 완료';
      if (remainingCards.length > 0) msg += '\n⚠️ 미출고 카드 ' + remainingCards.length + '건: ' + remainingCards.join(', ');
      if (failCount > 0) msg += ', ' + failCount + '건 실패';
      showToast(msg, remainingCards.length > 0 ? 'warning' : (failCount > 0 ? 'warning' : 'success'));
      clearBulkSelection();
      loadOrderStats();
      loadOrders();
    } else {
      showToast('일괄 출고 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('일괄 출고 오류: ' + (e.response?.data?.error || e.message), 'error');
  }
}

async function bulkBillingConfirm() {
  if (selectedOrderIds.size === 0) return;
  if (!(await showConfirm(selectedOrderIds.size + '건의 주문을 회계반영 처리하시겠습니까?'))) return;
  var success = 0, fail = 0;
  for (var id of selectedOrderIds) {
    try {
      var res = await axios.patch('/api/orders/' + id + '/billing-status', { billing_status: 'BILLED' });
      if (res.data.success) success++;
      else fail++;
    } catch(e) { fail++; }
  }
  showToast(success + '건 회계반영 완료' + (fail > 0 ? ', ' + fail + '건 실패' : ''), fail > 0 ? 'warning' : 'success');
  clearBulkSelection();
  loadOrders();
}

async function bulkChangeStatus() {
  var newStatus = document.getElementById('bulkStatusSelect').value;
  if (!newStatus) { showFieldError('bulkStatusSelect', '변경할 상태를 선택하세요.'); return; }
  if (selectedOrderIds.size === 0) return;
  if (!(await showConfirm(selectedOrderIds.size + '건의 주문을 ' + getStatusText(newStatus) + '(으)로 변경하시겠습니까?'))) return;

  var success = 0, fail = 0;
  for (var id of selectedOrderIds) {
    try {
      var res = await axios.patch('/api/orders/' + id + '/status', { status: newStatus });
      if (res.data.success) success++;
      else fail++;
    } catch(e) { fail++; }
  }
  showToast(success + '건 변경 완료' + (fail > 0 ? ', ' + fail + '건 실패' : ''), fail > 0 ? 'warning' : 'success');
  clearBulkSelection();
  loadOrderStats();
  loadOrders();
}

// 긴급도 계산
function getOrderUrgency(deliveryDate) {
  if (!deliveryDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const delivery = new Date(deliveryDate);
  delivery.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((delivery - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: '지연', color: '#dc2626', bg: '#fef2f2' };
  if (diffDays === 0) return { label: 'D-Day', color: 'var(--c-orange)', bg: 'var(--c-orange-light)' };
  if (diffDays === 1) return { label: 'D-1', color: '#d97706', bg: '#fffbeb' };
  if (diffDays <= 3) return { label: 'D-' + diffDays, color: '#2563eb', bg: '#eff6ff' };
  return null;
}

function getStatusText(status) {
  const m = { CONFIRMED:'확정', PRINTING:'출력중', PRINT_DONE:'출력완료', SHIPPED:'출고완료', CANCELLED:'취소' };
  return m[status] || status;
}

function getStatusIcon(status) {
  const m = { CONFIRMED:'fas fa-check', PRINTING:'fas fa-spinner', PRINT_DONE:'fas fa-check-circle', SHIPPED:'fas fa-box', CANCELLED:'fas fa-times-circle' };
  return m[status] || 'fas fa-circle';
}

function getBillingStatusText(billingStatus) {
  if (!billingStatus) return '-';
  if (billingStatus === 'BILLED') return '회계반영';
  if (billingStatus === 'PAID') return '수금완료';
  return billingStatus;
}

function getBillingStatusColor(billingStatus) {
  if (!billingStatus) return 'ds-badge ds-badge-gray';
  if (billingStatus === 'BILLED') return 'ds-badge ds-badge-purple';
  if (billingStatus === 'PAID') return 'ds-badge ds-badge-green';
  return 'ds-badge ds-badge-gray';
}

function getStatusColor(status) {
  const m = { CONFIRMED:'ds-badge ds-badge-blue', PRINTING:'ds-badge ds-badge-orange', PRINT_DONE:'ds-badge ds-badge-green', SHIPPED:'ds-badge ds-badge-purple', CANCELLED:'ds-badge ds-badge-red' };
  return m[status] || 'ds-badge ds-badge-gray';
}


// 페이지네이션 렌더링
function renderPagination(pagination) {
  const container = document.getElementById('ordersPagination');
  if (!pagination || pagination.total_pages <= 1) {
    container.innerHTML = pagination ? `<span style="font-size:13px;color:#6b7280;">총 ${pagination.total}건</span>` : '';
    return;
  }
  const { page, total_pages, total } = pagination;
  const btnStyle = 'padding:6px 14px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;background:#fff;';
  const btnDisabledStyle = 'padding:6px 14px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;cursor:not-allowed;background:#f9fafb;color:#9ca3af;';
  let pageButtons = '';
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(total_pages, startPage + 4);
  for (let p = startPage; p <= endPage; p++) {
    const activeStyle = p === page
      ? 'padding:6px 12px;border:1px solid #2563eb;border-radius:6px;font-size:13px;cursor:pointer;background:#2563eb;color:#fff;font-weight:600;'
      : btnStyle;
    pageButtons += `<button onclick="goToPage(${p})" style="${activeStyle}">${p}</button>`;
  }
  container.innerHTML = `
    <button onclick="goToPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}
      style="${page <= 1 ? btnDisabledStyle : btnStyle}">이전</button>
    ${pageButtons}
    <button onclick="goToPage(${page + 1})" ${page >= total_pages ? 'disabled' : ''}
      style="${page >= total_pages ? btnDisabledStyle : btnStyle}">다음</button>
    <span style="font-size:13px;color:#6b7280;margin-left:8px;">${page} / ${total_pages} 페이지 (총 ${total}건)</span>
  `;
}

function goToPage(n) {
  currentPage = n;
  localStorage.setItem('orders_filter_page', String(n));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  loadOrders();
}

function clearDateFilter() {
  document.getElementById('orderDateFrom').value = '';
  document.getElementById('orderDateTo').value = '';
  localStorage.removeItem('orders_filter_date_from');
  localStorage.removeItem('orders_filter_date_to');
  currentPage = 1;
  loadOrders();
}

function resetAllFilters() {
  document.getElementById('searchQuery').value = '';
  document.getElementById('statusFilter').value = '';
  document.getElementById('deliveryMethodFilter').value = '';
  document.getElementById('billingStatusFilter').value = '';
  document.getElementById('priorityFilter').value = '';
  document.getElementById('sortBy').value = 'created_at_desc';
  document.getElementById('orderDateFrom').value = '';
  document.getElementById('orderDateTo').value = '';
  localStorage.removeItem('orders_filter_search');
  localStorage.removeItem('orders_filter_status');
  localStorage.removeItem('orders_filter_sort');
  localStorage.removeItem('orders_filter_page');
  localStorage.removeItem('orders_filter_date_from');
  localStorage.removeItem('orders_filter_date_to');
  localStorage.removeItem('orders_filter_delivery_method');
  localStorage.removeItem('orders_filter_billing_status');
  localStorage.removeItem('orders_filter_priority');
  currentPage = 1;
  loadOrders();
}

// 통계
async function loadOrderStats() {
  try {
    const res = await authFetch('/api/orders/stats');
    const data = await res.json();
    if (data.success) {
      document.getElementById('statTotal').textContent = data.data.total || 0;
      document.getElementById('statConfirmed').textContent = data.data.CONFIRMED || 0;
      document.getElementById('statProduction').textContent = (data.data.PRINTING || 0) + (data.data.PRINT_DONE || 0);
      document.getElementById('statShipped').textContent = data.data.SHIPPED || 0;
    }
  } catch(e) { console.error('Load stats error:', e); }
}

// 주문 목록
async function loadOrders() {
  try {
    const searchQuery = document.getElementById('searchQuery')?.value || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    const sortBy = document.getElementById('sortBy')?.value || 'created_at_desc';
    const dateFrom = document.getElementById('orderDateFrom')?.value || '';
    const dateTo = document.getElementById('orderDateTo')?.value || '';
    const priorityFilter = document.getElementById('priorityFilter')?.value || '';
    const deliveryMethodFilter = document.getElementById('deliveryMethodFilter')?.value || '';
    const billingStatusFilter = document.getElementById('billingStatusFilter')?.value || '';

    localStorage.setItem('orders_filter_search', searchQuery);
    localStorage.setItem('orders_filter_status', statusFilter);
    localStorage.setItem('orders_filter_sort', sortBy);
    localStorage.setItem('orders_filter_page', String(currentPage));
    localStorage.setItem('orders_filter_delivery_method', deliveryMethodFilter);
    localStorage.setItem('orders_filter_billing_status', billingStatusFilter);
    localStorage.setItem('orders_filter_priority', priorityFilter);
    if (dateFrom) localStorage.setItem('orders_filter_date_from', dateFrom);
    else localStorage.removeItem('orders_filter_date_from');
    if (dateTo) localStorage.setItem('orders_filter_date_to', dateTo);
    else localStorage.removeItem('orders_filter_date_to');

    const params = new URLSearchParams();
    if (searchQuery) params.append('search', searchQuery);
    if (statusFilter) params.append('status', statusFilter);
    if (!statusFilter) params.append('exclude_status', 'CANCELLED,QUOTATION');
    if (priorityFilter) params.append('priority', priorityFilter);
    if (deliveryMethodFilter) params.append('delivery_method', deliveryMethodFilter);
    if (billingStatusFilter) params.append('billing_status', billingStatusFilter);
    params.append('sort', sortBy);
    params.append('page', String(currentPage));
    params.append('limit', '50');
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);

    const response = await axios.get(`/api/orders?${params.toString()}`);

    if (response.data.success) {
      const orders = response.data.data;
      const pagination = response.data.pagination;
      const tbody = document.getElementById('ordersTable');

      if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-12"><i class="fas fa-inbox text-3xl mb-3 block text-gray-300"></i><div class="text-sm text-gray-500 mb-1">주문이 없습니다.</div></td></tr>';
        renderPagination(pagination || null);
        return;
      }

      tbody.innerHTML = orders.map(order => {
        const urgency = getOrderUrgency(order.delivery_date);
        const urgencyBadge = urgency
          ? `<span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;color:${urgency.color};background:${urgency.bg};margin-left:4px;">${urgency.label}</span>`
          : '';
        const priorityBadge = order.priority === 'URGENT'
          ? '<span class="ml-1 px-1.5 py-0.5 rounded text-xs font-bold bg-red-50 text-red-700">긴급</span>'
          : '';
        const deliveryLabel = order.delivery_method
          ? (order.delivery_method + (order.delivery_time ? ' ' + order.delivery_time : ''))
          : '-';
        const billingText = getBillingStatusText(order.billing_status);
        const billingColor = getBillingStatusColor(order.billing_status);
        const billingBadge = order.billing_status
          ? `<span class="px-2 py-0.5 text-xs rounded-full ${billingColor}">${billingText}</span>`
          : `<span class="text-xs text-gray-400">-</span>`;
        return `
          <tr class="hover:bg-gray-50" data-order-id="${order.id}" data-status="${order.status}">
            <td class="px-3 py-4 text-center">
              <input type="checkbox" class="order-checkbox rounded border-gray-300" data-order-id="${order.id}" onchange="toggleOrderSelect(this)" ${selectedOrderIds.has(order.id) ? 'checked' : ''}>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm font-medium text-gray-900">${escapeHtml(order.order_number)}${priorityBadge}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm text-gray-900">${escapeHtml(order.client_name || '-')}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm text-gray-900">${escapeHtml(order.delivery_date || '-')}${urgencyBadge}</div>
              <div class="text-xs text-gray-400 mt-0.5">${escapeHtml(deliveryLabel)}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right tabular-nums">
              <div class="text-sm text-gray-900">${order.final_amount?.toLocaleString() || '0'}원</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span class="px-2 inline-flex items-center text-xs leading-5 font-semibold rounded-full ${getStatusColor(order.status)}">
                <i class="${getStatusIcon(order.status)} text-[7px] mr-1"></i>${getStatusText(order.status)}
              </span>${order.total_cards > 0 && order.shipped_cards > 0 && order.shipped_cards < order.total_cards ? '<span class="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-amber-100 text-amber-700">' + order.shipped_cards + '/' + order.total_cards + ' 출고</span>' : ''}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              ${billingBadge}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm text-gray-500">${new Date(order.created_at).toLocaleDateString('ko-KR')}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm act-col">
              <button onclick="viewOrder(${order.id})" class="text-blue-600 hover:text-blue-900 mr-3">
                <i class="fas fa-eye"></i> 상세
              </button>
              <button onclick="showStatusChangeModal(${order.id}, '${order.status}')" class="text-green-600 hover:text-green-900 mr-3">
                <i class="fas fa-sync-alt"></i> 상태변경
              </button>
              <button onclick="openInvoice(${order.id})" class="text-purple-600 hover:text-purple-900 text-sm mr-3"><i class="fas fa-file-invoice"></i> 명세서</button>
              ${['CONFIRMED','PRINTING','PRINT_DONE','SHIPPED'].indexOf(order.status) >= 0
                ? `<button onclick="event.stopPropagation(); sendOrderNotice(${order.id},'${escapeHtml(order.client_name || '')}','${escapeHtml(order.contact_mobile || order.client_mobile || '')}','${escapeHtml(order.contact_phone || order.client_phone || '')}','${escapeHtml(order.order_number || '')}','${escapeHtml(order.client_email || '')}','${escapeHtml(order.client_fax || '')}',${order.client_id || 0})" class="text-blue-500 hover:text-blue-700 text-sm" title="접수 확인 발송"><i class="fas fa-paper-plane text-xs"></i></button>`
                : ''}
            </td>
          </tr>
        `;
      }).join('');
      renderPagination(pagination || null);
      // selectAll 체크박스 상태 동기화
      var allCb = document.getElementById('selectAllOrders');
      if (allCb) allCb.checked = false;
      updateBulkBar();
    }
  } catch (error) {
    console.error('Load orders error:', error);
    document.getElementById('ordersTable').innerHTML =
      '<tr><td colspan="9" class="ds-empty" style="color:var(--c-danger)">주문 목록을 불러오는데 실패했습니다.</td></tr>';
  }
}

// 상태변경 모달
function showStatusChangeModal(orderId, currentStatus) {
  _statusChangeOrderId = orderId;
  var select = document.getElementById('newStatusSelect');
  // 유효한 전이만 옵션으로 표시
  var allowed = STATUS_TRANSITIONS[currentStatus] || [];
  select.innerHTML = '';
  if (allowed.length === 0) {
    select.innerHTML = '<option value="">전이 가능한 상태 없음</option>';
    showToast('이 주문은 상태 변경이 불가합니다 (' + (STATUS_LABELS[currentStatus] || currentStatus) + ')', 'info');
    return;
  }
  allowed.forEach(function(s) {
    var opt = document.createElement('option');
    opt.value = s;
    opt.textContent = STATUS_LABELS[s] || s;
    select.appendChild(opt);
  });
  document.getElementById('statusChangeModal').classList.remove('hidden');
}

function closeStatusModal() {
  document.getElementById('statusChangeModal').classList.add('hidden');
  _statusChangeOrderId = null;
}

var _statusChangeInProgress = false;
async function confirmStatusChange() {
  if (_statusChangeInProgress) return;
  var newStatus = document.getElementById('newStatusSelect').value;
  if (!newStatus || !_statusChangeOrderId) return;
  _statusChangeInProgress = true;
  var btn = document.querySelector('#statusChangeModal .btn-primary, #statusChangeModal button[onclick*="confirmStatusChange"]');
  if (btn) { btn.disabled = true; btn.textContent = '처리중...'; }
  try {
    var response = await axios.patch('/api/orders/' + _statusChangeOrderId + '/status', {
      status: newStatus
    });
    if (response.data.success) {
      closeStatusModal();
      loadOrderStats();
      loadOrders();
    } else if (response.data.requires_confirmation) {
      // 미완료 카드 확인 모달 표시
      closeStatusModal();
      showCardConfirmModal(_statusChangeOrderId, newStatus, response.data.pending_cards);
    } else {
      showToast('상태 변경 실패: ' + response.data.error, 'error');
    }
  } catch (error) {
    var errData = error.response?.data;
    if (errData && errData.requires_confirmation) {
      closeStatusModal();
      showCardConfirmModal(_statusChangeOrderId, errData.pending_cards ? 'SHIPPED' : 'SHIPPED', errData.pending_cards);
    } else {
      showToast('상태 변경 중 오류: ' + (errData?.error || error.message), 'error');
    }
  } finally {
    _statusChangeInProgress = false;
    if (btn) { btn.disabled = false; btn.textContent = '변경'; }
  }
}

// 미완료 카드 확인 모달
var _cardConfirmOrderId = null;
var _cardConfirmStatus = null;
var _cardConfirmPending = [];

function showCardConfirmModal(orderId, targetStatus, pendingCards) {
  _cardConfirmOrderId = orderId;
  _cardConfirmStatus = targetStatus;
  _cardConfirmPending = pendingCards || [];

  var STATUS_KR = { PRINTING: '출력중', CONFIRMED: '확정', RIP_WAITING: 'RIP대기', HOLD: '보류' };
  var html = '<div class="mb-3 text-sm text-gray-600">인쇄 미완료 카드 <b class="text-red-600">' + _cardConfirmPending.length + '건</b>이 있습니다. 각 카드를 확정(출고) 또는 취소(보류) 처리해주세요.</div>'
    + '<div class="space-y-2 max-h-60 overflow-y-auto">';
  _cardConfirmPending.forEach(function(card) {
    html += '<div class="flex items-center justify-between p-2 bg-gray-50 rounded border" id="cardRow_' + card.id + '">'
      + '<div><span class="font-mono text-sm font-semibold">' + escapeHtml(card.card_number) + '</span>'
      + ' <span class="ml-2 px-1.5 py-0.5 text-xs rounded bg-amber-100 text-amber-700">' + (STATUS_KR[card.status] || card.status) + '</span></div>'
      + '<div class="flex gap-1">'
      + '<button onclick="setCardAction(' + card.id + ',&#39;confirm&#39;)" class="px-2 py-1 text-xs rounded bg-green-100 text-green-700 hover:bg-green-200 card-action-btn" data-card="' + card.id + '" data-action="">확정</button>'
      + '<button onclick="setCardAction(' + card.id + ',&#39;cancel&#39;)" class="px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200 card-action-btn" data-card="' + card.id + '" data-action="">취소</button>'
      + '</div></div>';
  });
  html += '</div>'
    + '<div class="mt-3 flex gap-2">'
    + '<button onclick="selectAllCardActions(&#39;confirm&#39;)" class="px-3 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700">전체 확정</button>'
    + '<button onclick="selectAllCardActions(&#39;cancel&#39;)" class="px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700">전체 취소</button>'
    + '</div>';

  showModal('미완료 카드 처리', html, [
    { text: '출고 진행', class: 'btn-primary', onclick: 'submitCardConfirm()' },
    { text: '닫기', class: 'btn-secondary', onclick: 'closeModal()' }
  ]);
}

function setCardAction(cardId, action) {
  var row = document.getElementById('cardRow_' + cardId);
  if (!row) return;
  var btns = row.querySelectorAll('.card-action-btn');
  btns.forEach(function(b) {
    b.style.opacity = '0.4';
    b.style.fontWeight = 'normal';
  });
  var activeBtn = row.querySelector('[onclick*="' + action + '"]');
  if (activeBtn) {
    activeBtn.style.opacity = '1';
    activeBtn.style.fontWeight = 'bold';
    activeBtn.dataset.action = action;
  }
  // 모든 카드의 액션 버튼에 data-action 저장
  btns.forEach(function(b) {
    if (b === activeBtn) {
      b.dataset.action = action;
    }
  });
  // row에 선택 상태 저장
  row.dataset.selectedAction = action;
}

function selectAllCardActions(action) {
  _cardConfirmPending.forEach(function(card) {
    setCardAction(card.id, action);
  });
}

async function submitCardConfirm() {
  var confirmedIds = [];
  var cancelledIds = [];
  var unset = 0;

  _cardConfirmPending.forEach(function(card) {
    var row = document.getElementById('cardRow_' + card.id);
    var action = row ? row.dataset.selectedAction : null;
    if (action === 'confirm') confirmedIds.push(card.id);
    else if (action === 'cancel') cancelledIds.push(card.id);
    else unset++;
  });

  if (unset > 0) {
    showToast('모든 카드에 대해 확정 또는 취소를 선택해주세요. (' + unset + '건 미선택)', 'warning');
    return;
  }

  try {
    var response = await axios.patch('/api/orders/' + _cardConfirmOrderId + '/status', {
      status: _cardConfirmStatus,
      confirmed_card_ids: confirmedIds,
      cancelled_card_ids: cancelledIds
    });
    if (response.data.success) {
      closeModal();
      showToast('출고 처리 완료 (확정 ' + confirmedIds.length + '건, 취소 ' + cancelledIds.length + '건)', 'success');
      loadOrderStats();
      loadOrders();
    } else {
      showToast('출고 처리 실패: ' + response.data.error, 'error');
    }
  } catch (error) {
    showToast('출고 처리 오류: ' + (error.response?.data?.error || error.message), 'error');
  }
}

async function viewOrder(orderId) {
  try {
    const orderRes = await axios.get(`/api/orders/${orderId}`);
    if (orderRes.data.success) {
      const order = orderRes.data.data;
      // API가 items를 별도 필드로 반환하는 경우 order.items에 병합
      if (orderRes.data.items && orderRes.data.items.length > 0) {
        order.items = orderRes.data.items;
      }
      // 주문번호로 카드 검색 (exact match를 위해 search 파라미터 활용)
      const cardsRes = await axios.get(
        `/api/cards?search=${encodeURIComponent(order.order_number)}&limit=100`
      ).catch(function() { return { data: { data: [] } }; });
      const cards = (cardsRes.data.data || []).filter(function(c) {
        return c.order_number === order.order_number;
      });
      // 자동가공 결과 조회
      var autoJobs = [];
      try {
        var apRes = await axios.get('/api/auto-process/order/' + orderId);
        if (apRes.data.success) autoJobs = apRes.data.jobs || [];
      } catch(_) {}
      showOrderModal(order, cards, autoJobs);
    } else {
      showToast('주문 조회 실패', 'error');
    }
  } catch (error) {
    console.error('View order error:', error);
    showToast('주문 정보를 불러오는데 실패했습니다.', 'error');
  }
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('orderModal')) return;
  const m = document.getElementById('orderModal');
  if (m) m.remove();
}

function buildOrderCardsSection(order, cards) {
  if (!cards || cards.length === 0) return '';
  var shippedCount = 0;
  var printDoneCount = 0;
  for (var ci = 0; ci < cards.length; ci++) {
    if (cards[ci].shipped_at) shippedCount++;
    if (cards[ci].status === 'PRINT_DONE' && !cards[ci].shipped_at) printDoneCount++;
  }
  var total = cards.length;
  var canShip = printDoneCount > 0;
  var cardRows = '';
  for (var ki = 0; ki < cards.length; ki++) {
    var c = cards[ki];
    var statusBadge = '';
    if (c.shipped_at) {
      statusBadge = '<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-green-50 text-green-700">출고완료</span>';
    } else if (c.status === 'PRINT_DONE') {
      statusBadge = '<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-green-50 text-green-700">출력완료</span>';
    } else if (c.status === 'PRINTING') {
      statusBadge = '<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700">출력중</span>';
    } else if (c.status === 'HOLD') {
      statusBadge = '<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-gray-200 text-gray-600">보류</span>';
    } else {
      statusBadge = '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700"><i class="far fa-clock text-[7px] mr-1"></i>대기</span>';
    }
    cardRows += '<tr class="border-b border-gray-100">'
      + '<td class="px-3 py-1.5 text-xs font-mono text-gray-500">' + (c.card_number || '-') + '</td>'
      + '<td class="px-3 py-1.5 text-xs">' + (c.category_name || '-') + '</td>'
      + '<td class="px-3 py-1.5 text-xs text-center">' + statusBadge + '</td>'
      + '<td class="px-3 py-1.5 text-xs text-gray-400">' + (c.shipped_at ? new Date(c.shipped_at).toLocaleString('ko-KR') : '-') + '</td>'
      + '</tr>';
  }
  var shipBtnHtml = '';
  if (canShip) {
    shipBtnHtml = '<button onclick="bulkShipOrder(' + order.id + ')" class="px-4 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"><i class="fas fa-shipping-fast mr-1"></i>출고 가능 카드 출고 처리 (' + printDoneCount + '건)</button>';
  } else if (shippedCount === total) {
    shipBtnHtml = '<span class="text-sm text-green-600 font-semibold"><i class="fas fa-check-circle mr-1"></i>전체 출고 완료</span>';
  } else {
    shipBtnHtml = '<span class="text-sm text-gray-400">출고 가능한 카드 없음</span>';
  }
  return '<div class="mb-6">'
    + '<div class="flex items-center justify-between mb-2">'
    + '<h3 class="text-lg font-bold">카드 출고 현황 <span class="text-sm font-normal text-gray-500">(' + shippedCount + '/' + total + ' 출고)</span></h3>'
    + shipBtnHtml
    + '</div>'
    + '<div class="overflow-x-auto border border-gray-200 rounded">'
    + '<table class="w-full text-sm ds-table-striped">'
    + '<thead class="bg-gray-50"><tr>'
    + '<th class="px-3 py-1.5 text-left text-xs font-medium text-gray-500">카드번호</th>'
    + '<th class="px-3 py-1.5 text-left text-xs font-medium text-gray-500">카테고리</th>'
    + '<th class="px-3 py-1.5 text-center text-xs font-medium text-gray-500">상태</th>'
    + '<th class="px-3 py-1.5 text-left text-xs font-medium text-gray-500">출고일시</th>'
    + '</tr></thead>'
    + '<tbody>' + cardRows + '</tbody>'
    + '</table>'
    + '</div>'
    + '</div>';
}

async function bulkShipOrder(orderId) {
  if (!(await showConfirm('출력완료 상태의 카드를 모두 출고 처리하시겠습니까?'))) return;
  try {
    const res = await axios.patch('/api/orders/bulk-ship', { order_ids: [orderId] });
    if (res.data.success) {
      const result = res.data.data && res.data.data[0];
      if (!result || !result.success) {
        showToast('출고 처리 실패: ' + (result ? result.error : '알 수 없는 오류'), 'error');
        return;
      }
      var shipped = result.shipped_cards || 0;
      var remaining = result.remaining || 0;
      var msg = shipped + '건 출고 완료';
      if (result.order_shipped) msg += ' - 주문 출고 완료';
      else if (remaining > 0) msg += ' (' + remaining + '건 미출고)';
      showToast(msg, 'success');
      document.getElementById('orderModal').remove();
      loadOrderStats();
      loadOrders();
    } else {
      showToast('출고 처리 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('출고 처리 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

function buildCostSummary(items, order) {
  var totalCost = 0, hasCost = false;
  (items || []).forEach(function(it) {
    if (it.total_cost > 0) { totalCost += it.total_cost; hasCost = true; }
  });
  if (!hasCost) return '';
  var revenue = order.total_amount || 0; // 공급가액 (VAT 제외)
  var margin = revenue - totalCost;
  var marginRate = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;
  var color = marginRate < 20 ? 'text-red-600' : marginRate < 40 ? 'text-amber-600' : 'text-green-600';
  var bgColor = marginRate < 20 ? 'bg-red-50' : marginRate < 40 ? 'bg-amber-50' : 'bg-green-50';
  return `<div class="p-3 rounded ${bgColor}">
    <div class="text-sm font-medium text-gray-600 mb-1">원가 분석</div>
    <div class="text-sm mb-1">총 원가: <span class="font-bold">${totalCost.toLocaleString()}원</span></div>
    <div class="text-sm mb-1">마진: <span class="font-bold ${color}">${margin.toLocaleString()}원 (${marginRate}%)</span></div>
  </div>`;
}

function showOrderModal(order, cards, autoJobs) {
  cards = cards || [];
  autoJobs = autoJobs || [];
  const items = order.items || [];
  let itemCounter = 0;
  const itemsHtml = items.map((item) => {
    const isChild = !!item.parent_item_id;
    if (!isChild) itemCounter++;
    const rowNum = isChild ? '' : itemCounter;
    const rowClass = isChild ? 'bg-green-50' : '';
    const namePrefix = isChild ? '└ ' : '';
    const sizeStr = (item.width && item.height) ? `${item.width}×${item.height}cm` : '-';
    let ppText = '-';
    if (item.post_processing) {
      try {
        const ppArr = typeof item.post_processing === 'string' ? JSON.parse(item.post_processing) : item.post_processing;
        if (Array.isArray(ppArr) && ppArr.length > 0) ppText = ppArr.map(p => p.name || p.code || '').filter(Boolean).join(', ');
      } catch(e) { ppText = '-'; }
    }
    return `
      <tr class="border-b ${rowClass}">
        <td class="px-4 py-2 text-center">${rowNum}</td>
        <td class="px-4 py-2">${namePrefix}${escapeHtml(item.item_name || '-')}</td>
        <td class="px-4 py-2 text-center">${sizeStr}</td>
        <td class="px-4 py-2 text-center tabular-nums">${item.quantity || 1} ${item.unit || 'EA'}</td>
        <td class="px-4 py-2 text-right tabular-nums">${isChild ? '-' : (item.unit_price?.toLocaleString() || 0) + '원'}</td>
        <td class="px-4 py-2 text-right tabular-nums">${isChild ? '-' : (item.amount?.toLocaleString() || 0) + '원'}</td>
        <td class="px-4 py-2">${escapeHtml(item.content || '-')}</td>
        <td class="px-4 py-2">${ppText}</td>
      </tr>
    `;
  }).join('');

  const canEdit = (currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER' || currentUserRole === 'DESIGNER');
  const modalHtml = `
    <div id="orderModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="closeModal(event)">
      <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto m-4" onclick="event.stopPropagation()">
        <div class="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 class="text-2xl font-bold">주문 상세</h2>
          <button onclick="document.getElementById('orderModal').remove()" class="text-gray-500 hover:text-gray-700">
            <i class="fas fa-times text-2xl"></i>
          </button>
        </div>
        <div class="p-6">
          <div class="grid grid-cols-2 gap-4 mb-6">
            <div><label class="text-sm font-medium text-gray-600">주문번호</label><p class="text-lg font-bold">${escapeHtml(order.order_number)}</p></div>
            <div><label class="text-sm font-medium text-gray-600">상태</label><p><span class="px-3 py-1 rounded-full ${getStatusColor(order.status)}">${getStatusText(order.status)}</span></p></div>
            <div><label class="text-sm font-medium text-gray-600">거래처</label><p class="text-lg">${escapeHtml(order.client_name || '-')}</p></div>
            <div><label class="text-sm font-medium text-gray-600">납기일</label><p class="text-lg">${escapeHtml(order.delivery_date || '-')}</p></div>
            <div><label class="text-sm font-medium text-gray-600">배송처</label><p class="text-lg">${escapeHtml(order.reception_location || '-')}</p></div>
            <div><label class="text-sm font-medium text-gray-600">출고방법</label><p class="text-lg">${escapeHtml(order.delivery_method || '-')}${order.delivery_time ? ' ' + escapeHtml(order.delivery_time) : ' (미정)'}</p></div>
            <div><label class="text-sm font-medium text-gray-600">배송처 주소</label><p class="text-lg">${escapeHtml(order.delivery_info || '-')}</p></div>
            <div><label class="text-sm font-medium text-gray-600">우선순위</label><p class="text-lg">${order.priority === 'URGENT' ? '<span class="px-2 py-1 rounded-full bg-red-50 text-red-700 font-bold text-sm">긴급</span>' : '<span class="text-gray-500">일반</span>'}</p></div>
            <div><label class="text-sm font-medium text-gray-600">등록일</label><p class="text-lg">${new Date(order.created_at).toLocaleString('ko-KR')}</p></div>
            <div><label class="text-sm font-medium text-gray-600">등록자</label><p class="text-lg">${order.created_by_name || '-'}</p></div>
            ${order.quotation_id ? `<div class="col-span-2 bg-blue-50 border border-blue-200 rounded p-3"><label class="text-sm font-medium text-blue-700"><i class="fas fa-link mr-1"></i>견적서 연결</label><p class="text-sm mt-1">이 주문은 견적서 <a href="/quotations#${order.quotation_id}" class="font-bold text-blue-700 underline hover:text-blue-900">#${order.quotation_id}${order.quotation_number ? ' (' + escapeHtml(order.quotation_number) + ')' : ''}</a>에서 생성되었습니다.</p></div>` : ''}
          </div>
          <div class="mb-6">
            <h3 class="text-lg font-bold mb-3">주문 품목</h3>
            <div class="overflow-x-auto">
              <table class="w-full border text-sm ds-table-striped">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-2 text-center w-10">번호</th>
                    <th class="px-4 py-2 text-left">품목명</th>
                    <th class="px-4 py-2 text-center">규격</th>
                    <th class="px-4 py-2 text-center">수량</th>
                    <th class="px-4 py-2 text-right tabular-nums">단가</th>
                    <th class="px-4 py-2 text-right tabular-nums">금액</th>
                    <th class="px-4 py-2 text-left">내용</th>
                    <th class="px-4 py-2 text-left">후가공</th>
                  </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
              </table>
            </div>
          </div>
          ${buildOrderCardsSection(order, cards)}
          ${buildAutoProcessSection(order, autoJobs)}
          <div class="grid grid-cols-2 gap-4 border-t pt-4">
            <div>${buildCostSummary(items, order)}</div>
            <div class="text-right">
              <div class="mb-2"><span class="font-medium">공급가액:</span> <span class="text-lg">${order.total_amount?.toLocaleString() || 0}원</span></div>
              <div class="mb-2"><span class="font-medium">VAT:</span> <span class="text-lg">${order.vat_amount?.toLocaleString() || 0}원</span></div>
              <div class="text-xl font-bold text-gray-700"><span>총 금액:</span> <span>${order.final_amount?.toLocaleString() || 0}원</span></div>
            </div>
          </div>
          <div id="orderTimeline_${order.id}" class="mt-6 border-t pt-4">
            <h3 class="text-sm font-bold text-gray-600 mb-2"><i class="fas fa-history mr-1"></i>상태 이력</h3>
            <div class="ds-skeleton ds-skeleton-text" style="width:60%"></div>
          </div>
          ${order.notes ? `<div class="mt-4 p-4 bg-gray-50 rounded"><label class="text-sm font-medium text-gray-600">비고</label><p class="mt-1">${order.notes}</p></div>` : ''}
          <!-- 경리 상태 -->
          <div class="mt-4 p-4 bg-gray-50 rounded-lg border flex items-center justify-between">
            <div>
              <span class="text-sm font-medium text-gray-600 mr-2">회계상태:</span>
              ${order.billing_status === 'BILLED'
                ? '<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">회계반영</span>'
                : order.billing_status === 'PAID'
                  ? '<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">수금완료</span>'
                  : '<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">미확인</span>'
              }
            </div>
            <div class="flex gap-2" id="billingActions_${order.id}">
              ${!order.billing_status || order.billing_status === ''
                ? '<button onclick="setBillingStatus(' + order.id + ', \'BILLED\')" class="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700"><i class="fas fa-check mr-1"></i>회계반영</button>'
                : ''}
              ${order.billing_status === 'BILLED'
                ? '<button onclick="setBillingStatus(' + order.id + ', \'PAID\')" class="px-3 py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700"><i class="fas fa-won-sign mr-1"></i>수금완료</button>'
                  + '<button onclick="setBillingStatus(' + order.id + ', \'\')" class="px-3 py-1.5 text-xs font-medium rounded bg-gray-400 text-white hover:bg-gray-500">취소</button>'
                : ''}
              ${order.billing_status === 'PAID'
                ? '<button onclick="setBillingStatus(' + order.id + ', \'BILLED\')" class="px-3 py-1.5 text-xs font-medium rounded bg-gray-400 text-white hover:bg-gray-500">수금취소</button>'
                : ''}
            </div>
          </div>
          <div class="mt-6 flex flex-wrap justify-end gap-2">
            ${canEdit ? `<button onclick="location.href='/order-form?edit=${order.id}'" class="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"><i class="fas fa-edit mr-1"></i>수정</button>` : ''}
            <button onclick="openInvoice(${order.id})" class="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"><i class="fas fa-file-invoice mr-1"></i>명세서</button>
            ${canEdit ? '<button onclick="copyOrder(' + order.id + ')" class="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded text-sm hover:bg-gray-50"><i class="fas fa-copy mr-1"></i>복사</button>' : ''}
            ${canEdit && order.status !== 'CANCELLED' && order.status !== 'SHIPPED' ? `<button onclick="showCancelModal(${order.id}, '${order.order_number}')" class="px-4 py-2 bg-amber-500 text-white rounded text-sm hover:bg-amber-600"><i class="fas fa-ban mr-1"></i>취소</button>` : ''}
            ${canEdit && order.status === 'CANCELLED' ? `<button onclick="restoreOrder(${order.id}, '${order.order_number}')" class="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"><i class="fas fa-undo mr-1"></i>복구</button>` : ''}
            ${canEdit && (order.status === 'QUOTATION' || order.status === 'CANCELLED') ? `<button onclick="deleteOrder(${order.id}, '${order.order_number}', '${order.status}')" class="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"><i class="fas fa-trash-alt mr-1"></i>삭제</button>` : ''}
            <button onclick="document.getElementById('orderModal').remove()" class="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded text-sm hover:bg-gray-50">닫기</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  loadOrderTimeline(order.id);
}

// ── 자동가공 결과 섹션 ──────────────────────────────────────────────
function buildAutoProcessSection(order, jobs) {
  if (!jobs || jobs.length === 0) return '';

  var statusMap = {
    pending: { label: '대기', color: 'bg-amber-50 text-amber-700', icon: 'far fa-clock' },
    processing: { label: '처리중', color: 'bg-blue-100 text-blue-700', icon: 'fas fa-spinner fa-spin' },
    done: { label: '완료', color: 'bg-green-100 text-green-700', icon: 'fas fa-check' },
    approved: { label: '승인됨', color: 'bg-blue-50 text-blue-700', icon: 'fas fa-check-double' },
    failed: { label: '실패', color: 'bg-red-100 text-red-700', icon: 'fas fa-times' }
  };

  var rows = '';
  for (var i = 0; i < jobs.length; i++) {
    var job = jobs[i];
    var st = statusMap[job.status] || statusMap.pending;
    var thumbHtml = job.output_png_base64
      ? '<img src="data:image/png;base64,' + job.output_png_base64 + '" class="w-20 h-20 object-contain border rounded cursor-pointer" onclick="window.open(this.src)">'
      : '<div class="w-20 h-20 border rounded bg-gray-100 flex items-center justify-center text-gray-400 text-xs">' + (job.status === 'pending' || job.status === 'processing' ? '<i class="' + st.icon + '"></i>' : '없음') + '</div>';
    var actionsHtml = '';
    if (job.status === 'done') {
      actionsHtml = '<button onclick="approveAutoProcess(' + job.id + ')" class="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"><i class="fas fa-check mr-1"></i>승인</button>'
        + ' <button onclick="retryAutoProcess(' + job.id + ')" class="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"><i class="fas fa-redo mr-1"></i>재가공</button>';
    } else if (job.status === 'failed') {
      actionsHtml = '<button onclick="retryAutoProcess(' + job.id + ')" class="px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600"><i class="fas fa-redo mr-1"></i>재시도</button>';
    } else if (job.status === 'approved') {
      actionsHtml = '<span class="text-xs text-gray-500">' + (job.saved_path || '') + '</span>';
    }

    rows += '<div class="flex items-center gap-3 p-3 border rounded-lg ' + (job.status === 'failed' ? 'border-red-200 bg-red-50' : 'border-gray-200') + '">'
      + thumbHtml
      + '<div class="flex-1 min-w-0">'
      + '<div class="flex items-center gap-2">'
      + '<span class="font-medium text-sm">' + (job.product || job.item_name || '품목 ' + (i + 1)) + '</span>'
      + '<span class="px-1.5 py-0.5 rounded text-xs font-semibold ' + st.color + '"><i class="' + st.icon + ' mr-1"></i>' + st.label + '</span>'
      + '</div>'
      + '<div class="text-xs text-gray-500 mt-1">'
      + (job.width_cm && job.height_cm ? job.width_cm + '×' + job.height_cm + 'cm' : '') + ' | '
      + '축소비율 1:' + (job.scale_factor || '?') + ' | '
      + (job.finishing || '후가공 없음')
      + '</div>'
      + (job.error_message ? '<div class="text-xs text-red-600 mt-1"><i class="fas fa-exclamation-triangle mr-1"></i>' + job.error_message + '</div>' : '')
      + '</div>'
      + '<div class="flex-shrink-0">' + actionsHtml + '</div>'
      + '</div>';
  }

  return '<div class="mt-4 mb-4">'
    + '<h3 class="text-lg font-bold mb-3"><i class="fas fa-magic mr-2 text-purple-600"></i>자동가공 결과</h3>'
    + '<div class="space-y-2">' + rows + '</div>'
    + '</div>';
}

async function approveAutoProcess(jobId) {
  if (!(await showConfirm('이 가공 결과를 승인하시겠습니까? 공유폴더에 EPS 파일이 저장됩니다.'))) return;
  try {
    var res = await axios.post('/api/auto-process/' + jobId + '/approve');
    if (res.data.success) {
      showToast('승인 완료! 저장 경로: ' + (res.data.saved_path || ''), 'success');
      // 모달 새로고침
      document.getElementById('orderModal')?.remove();
      var urlParams = new URLSearchParams(window.location.search);
      var viewId = urlParams.get('view');
      if (viewId) viewOrder(parseInt(viewId));
    } else {
      showToast('승인 실패: ' + (res.data.error || '알 수 없는 오류'), 'error');
    }
  } catch (e) {
    showToast('승인 중 오류: ' + e.message, 'error');
  }
}

async function retryAutoProcess(jobId) {
  // 재가공 시 파라미터 수정 모달
  var newScale = prompt('축소비율을 수정하시겠습니까? (현재값 유지: 빈칸)');
  var newFinishing = prompt('후가공을 수정하시겠습니까? (현재값 유지: 빈칸)');

  var body = {};
  if (newScale && !isNaN(parseInt(newScale))) body.scale_factor = parseInt(newScale);
  if (newFinishing) body.finishing = newFinishing;

  try {
    var res = await axios.post('/api/auto-process/' + jobId + '/retry', body);
    if (res.data.success) {
      showToast('재가공 요청됨. IA PC에서 자동으로 처리됩니다.', 'success');
      document.getElementById('orderModal')?.remove();
      var urlParams = new URLSearchParams(window.location.search);
      var viewId = urlParams.get('view');
      if (viewId) viewOrder(parseInt(viewId));
    } else {
      showToast('재가공 실패: ' + (res.data.error || '알 수 없는 오류'), 'error');
    }
  } catch (e) {
    showToast('재가공 중 오류: ' + e.message, 'error');
  }
}

async function loadOrderTimeline(orderId) {
  try {
    var res = await axios.get('/api/orders/' + orderId + '/timeline');
    var el = document.getElementById('orderTimeline_' + orderId);
    if (!el || !res.data.success) return;
    var events = res.data.data || [];

    // 스텝 정의 (CONFIRMED → PRINTING → PRINT_DONE → SHIPPED)
    var steps = [
      { key: 'CONFIRMED',  label: '접수 확정', icon: 'fa-file-alt' },
      { key: 'PRINTING',   label: '생산 시작', icon: 'fa-industry' },
      { key: 'PRINT_DONE', label: '인쇄 완료', icon: 'fa-check-double' },
      { key: 'SHIPPED',    label: '출고',      icon: 'fa-truck' }
    ];
    var statusOrder = ['CONFIRMED', 'PRINTING', 'PRINT_DONE', 'SHIPPED'];

    // 각 스텝별 완료 시각/담당자 수집
    var stepTimes = {};
    events.forEach(function(e) {
      if (e.to_status && !stepTimes[e.to_status]) {
        stepTimes[e.to_status] = {
          time: e.created_at || '',
          user: e.changed_by_name || ''
        };
      }
    });

    // 현재 상태 (마지막 이벤트의 to_status)
    var currentStatus = events.length > 0 ? events[events.length - 1].to_status : 'CONFIRMED';
    var isCancelled = (currentStatus === 'CANCELLED');
    var isHold = (currentStatus === 'HOLD');

    // CANCELLED / HOLD 일 때는 그 직전 정상 스텝까지만 완료로 표시
    var baseStatus = currentStatus;
    if (isCancelled || isHold) {
      // 마지막 정상 스텝 찾기 (events 역순 탐색)
      for (var ei = events.length - 1; ei >= 0; ei--) {
        var ts = events[ei].to_status;
        if (statusOrder.indexOf(ts) !== -1) { baseStatus = ts; break; }
      }
      if (statusOrder.indexOf(baseStatus) === -1) baseStatus = '';
    }
    var currentIdx = statusOrder.indexOf(baseStatus);

    // 머리글 (CANCELLED / HOLD 배지 포함)
    var headerBadge = '';
    if (isCancelled) {
      headerBadge = ' <span class="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700"><i class="fas fa-times mr-1"></i>취소됨</span>';
    } else if (isHold) {
      headerBadge = ' <span class="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700"><i class="fas fa-pause mr-1"></i>보류 중</span>';
    }

    var html = '<h3 class="text-sm font-bold text-gray-600 mb-3"><i class="fas fa-route mr-1"></i>주문 진행 상황' + headerBadge + '</h3>';
    html += '<div class="bg-white rounded-lg border border-gray-200 p-4">';
    html += '<div class="flex items-start justify-between relative">';

    // 배경 선 (전체)
    html += '<div class="absolute top-5 left-10 right-10 h-0.5 bg-gray-200"></div>';
    // 완료 구간 선
    if (currentIdx >= 0) {
      var linePct = (currentIdx / (steps.length - 1)) * 100;
      var lineColor = isCancelled ? '#9ca3af' : '#3b82f6';
      html += '<div class="absolute top-5 left-10 h-0.5 transition-all" style="width:calc((100% - 80px) * ' + linePct + ' / 100);background:' + lineColor + ';"></div>';
    }

    steps.forEach(function(step, idx) {
      var stepInOrder = statusOrder.indexOf(step.key);
      var completed = stepInOrder <= currentIdx && currentIdx >= 0;
      var isCur = (step.key === baseStatus) && !isCancelled && !isHold;
      var info = stepTimes[step.key];

      // 원 스타일 결정
      var circleStyle, iconColor;
      if (isCancelled && completed) {
        // 취소된 경우 완료 구간은 회색
        circleStyle = 'background:#6b7280;';
        iconColor = '#fff';
      } else if (isHold && isCur) {
        // HOLD 현재 위치: amber
        circleStyle = 'background:#d97706;';
        iconColor = '#fff';
      } else if (completed) {
        circleStyle = 'background:#2563eb;';
        iconColor = '#fff';
      } else {
        circleStyle = 'background:#e5e7eb;';
        iconColor = '#9ca3af';
      }

      var ringClass = '';
      if (isHold && isCur) {
        ringClass = ' ring-2 ring-amber-300 ring-offset-2';
      } else if (isCur) {
        ringClass = ' ring-2 ring-blue-300 ring-offset-2';
      }

      // CANCELLED 마지막 완료 스텝 뒤에 X 아이콘 표시
      var cancelMarker = '';
      if (isCancelled && stepInOrder === currentIdx) {
        cancelMarker = '<div class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center"><i class="fas fa-times text-white" style="font-size:8px"></i></div>';
      }

      var labelColor = completed ? 'color:#111827' : 'color:#9ca3af';
      var timeStr = '';
      if (info && info.time) {
        var rawTime = String(info.time);
        // ISO 문자열: 앞 16자 (YYYY-MM-DDTHH:MM) → 공백으로 구분
        timeStr = rawTime.length >= 16 ? rawTime.substring(5, 16).replace('T', ' ') : rawTime;
      }

      html += '<div class="flex flex-col items-center relative z-10" style="min-width:80px;flex:1">';
      html += '<div class="relative w-10 h-10 rounded-full flex items-center justify-center text-sm' + ringClass + '" style="' + circleStyle + '">';
      html += '<i class="fas ' + step.icon + '" style="color:' + iconColor + '"></i>';
      html += cancelMarker;
      html += '</div>';
      html += '<div class="text-xs font-medium mt-2 text-center" style="' + labelColor + '">' + step.label + '</div>';
      if (timeStr) {
        html += '<div class="text-center" style="font-size:10px;color:#9ca3af;margin-top:2px">' + timeStr + '</div>';
      }
      if (info && info.user) {
        html += '<div class="text-center" style="font-size:10px;color:#6b7280">' + escapeHtml(info.user) + '</div>';
      }
      html += '</div>';
    });

    html += '</div>';
    html += '</div>';

    // 이력이 없는 경우
    if (events.length === 0) {
      html = '<h3 class="text-sm font-bold text-gray-600 mb-2"><i class="fas fa-route mr-1"></i>주문 진행 상황</h3>'
           + '<div class="text-sm text-gray-400">이력 없음</div>';
    }

    el.innerHTML = html;
  } catch(e) {
    console.warn('Timeline load error:', e);
  }
}

async function setBillingStatus(orderId, status) {
  var label = status === 'BILLED' ? '회계반영' : status === 'PAID' ? '수금완료' : '미확인';
  try {
    var res = await axios.patch('/api/orders/' + orderId + '/billing-status', { billing_status: status });
    if (res.data.success) {
      showToast(label + ' 처리 완료', 'success');
      document.getElementById('orderModal').remove();
      loadOrders();
    } else {
      showToast('처리 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('처리 오류: ' + (e.response?.data?.error || e.message), 'error');
  }
}

async function copyOrder(orderId) {
  if (!(await showConfirm('이 주문을 복사하여 새 주문 입력 폼을 열겠습니까?'))) return;
  try {
    const res = await axios.get('/api/orders/' + orderId);
    if (res.data.success) {
      sessionStorage.setItem('copyOrderData', JSON.stringify(res.data.data));
      window.location.href = '/order-form?copy=1';
    } else {
      showToast('주문 정보 조회 실패: ' + res.data.error, 'error');
    }
  } catch(e) {
    showToast('복사 중 오류: ' + (e.response?.data?.error || e.message), 'error');
  }
}

async function deleteOrder(orderId, orderNumber, status) {
  if (status === 'SHIPPED') {
    showToast('출고완료된 주문은 삭제할 수 없습니다.', 'warning');
    return;
  }
  if (!(await showConfirm(`주문 ${orderNumber}을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`, { danger: true }))) return;
  try {
    const res = await axios.delete(`/api/orders/${orderId}`);
    if (res.data.success) {
      showToast('주문이 삭제되었습니다.');
      document.getElementById('orderModal')?.remove();
      loadOrders();
    } else {
      showToast('삭제 실패: ' + res.data.error, 'error');
    }
  } catch(e) {
    showToast('삭제 중 오류: ' + (e.response?.data?.error || e.message), 'error');
  }
}

// 주문 취소 (이유 선택 모달)
function showCancelModal(orderId, orderNumber) {
  var modal = document.getElementById('cancelReasonModal');
  if (!modal) return;
  document.getElementById('cancelOrderId').value = orderId;
  document.getElementById('cancelOrderNumber').textContent = orderNumber;
  document.getElementById('cancelReasonSelect').value = '';
  document.getElementById('cancelReasonDetail').value = '';
  document.getElementById('cancelReasonDetailRow').classList.add('hidden');
  modal.classList.remove('hidden');
}

function onCancelReasonChange() {
  var val = document.getElementById('cancelReasonSelect').value;
  var detailRow = document.getElementById('cancelReasonDetailRow');
  if (val === '기타') {
    detailRow.classList.remove('hidden');
  } else {
    detailRow.classList.add('hidden');
  }
}

async function confirmCancelOrder() {
  var orderId = document.getElementById('cancelOrderId').value;
  var reason = document.getElementById('cancelReasonSelect').value;
  if (!reason) { showToast('취소 이유를 선택해주세요.', 'warning'); return; }
  var detail = reason === '기타' ? document.getElementById('cancelReasonDetail').value.trim() : '';
  if (reason === '기타' && !detail) { showToast('기타 사유를 입력해주세요.', 'warning'); return; }

  try {
    var res = await axios.patch('/api/orders/' + orderId + '/cancel', {
      reason: reason,
      reason_detail: detail || undefined
    });
    if (res.data.success) {
      showToast(res.data.message, 'success');
      document.getElementById('cancelReasonModal').classList.add('hidden');
      document.getElementById('orderModal')?.remove();
      loadOrders();
    } else {
      showToast('취소 실패: ' + res.data.error, 'error');
    }
  } catch(e) {
    showToast('취소 오류: ' + (e.response?.data?.error || e.message), 'error');
  }
}

// 주문 복구 (CANCELLED → CONFIRMED)
async function restoreOrder(orderId, orderNumber) {
  if (!(await showConfirm('주문 ' + orderNumber + '을(를) 확정 상태로 복구하시겠습니까?'))) return;
  try {
    var res = await axios.patch('/api/orders/' + orderId + '/restore');
    if (res.data.success) {
      showToast(res.data.message, 'success');
      document.getElementById('orderModal')?.remove();
      loadOrders();
    } else {
      showToast('복구 실패: ' + res.data.error, 'error');
    }
  } catch(e) {
    showToast('복구 오류: ' + (e.response?.data?.error || e.message), 'error');
  }
}

async function exportOrdersCsv() {
  try {
    var params = new URLSearchParams();
    var searchQuery = document.getElementById('searchQuery')?.value || '';
    var statusFilter = document.getElementById('statusFilter')?.value || '';
    var sortBy = document.getElementById('sortBy')?.value || 'created_at_desc';
    var dateFrom = document.getElementById('orderDateFrom')?.value || '';
    var dateTo = document.getElementById('orderDateTo')?.value || '';
    var priorityFilter = document.getElementById('priorityFilter')?.value || '';
    var deliveryMethodFilter = document.getElementById('deliveryMethodFilter')?.value || '';
    var billingStatusFilter = document.getElementById('billingStatusFilter')?.value || '';

    if (searchQuery) params.append('search', searchQuery);
    if (statusFilter) params.append('status', statusFilter);
    if (!statusFilter) params.append('exclude_status', 'CANCELLED,QUOTATION');
    if (priorityFilter) params.append('priority', priorityFilter);
    if (deliveryMethodFilter) params.append('delivery_method', deliveryMethodFilter);
    if (billingStatusFilter) params.append('billing_status', billingStatusFilter);
    params.append('sort', sortBy);
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);

    var res = await authFetch('/api/orders/export/csv?' + params.toString());
    if (!res.ok) throw new Error('Export failed');
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '주문목록_' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch(e) {
    showToast('CSV 내보내기 실패: ' + e.message, 'error');
  }
}

// 초기 로드
(function init() {
  // 역할에 따라 새 주문 버튼 표시
  if (currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER' || currentUserRole === 'DESIGNER') {
    document.getElementById('newOrderBtnWrap').classList.remove('hidden');
  }
  // 필터 복원
  const savedSearch = localStorage.getItem('orders_filter_search');
  const savedStatus = localStorage.getItem('orders_filter_status');
  const savedSort = localStorage.getItem('orders_filter_sort');
  const savedPage = localStorage.getItem('orders_filter_page');
  const savedDateFrom = localStorage.getItem('orders_filter_date_from');
  const savedDateTo = localStorage.getItem('orders_filter_date_to');
  const savedDeliveryMethod = localStorage.getItem('orders_filter_delivery_method');
  const savedBillingStatus = localStorage.getItem('orders_filter_billing_status');
  const savedPriority = localStorage.getItem('orders_filter_priority');
  if (savedSearch) document.getElementById('searchQuery').value = savedSearch;
  var TRANSIENT_STATUSES = ['CANCELLED', 'QUOTATION'];
  if (savedStatus && TRANSIENT_STATUSES.indexOf(savedStatus) === -1) document.getElementById('statusFilter').value = savedStatus;
  if (savedSort) document.getElementById('sortBy').value = savedSort;
  if (savedPage) currentPage = parseInt(savedPage) || 1;
  if (savedDateFrom) document.getElementById('orderDateFrom').value = savedDateFrom;
  if (savedDateTo) document.getElementById('orderDateTo').value = savedDateTo;
  if (savedDeliveryMethod) document.getElementById('deliveryMethodFilter').value = savedDeliveryMethod;
  if (savedBillingStatus) document.getElementById('billingStatusFilter').value = savedBillingStatus;
  if (savedPriority) document.getElementById('priorityFilter').value = savedPriority;
  loadOrderStats();
  loadOrders();
})();

// 거래명세서/견적서 iframe 모달
function openInvoicePanel(url, title, orderId) {
  title = title || '거래 명세서';
  var overlay = document.createElement('div');
  overlay.id = 'invoicePanel';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  var emailBtn = orderId
    ? '<button onclick="openInvoiceEmail(' + orderId + ')" style="padding:6px 16px;border:none;border-radius:6px;background:var(--c-teal);color:#fff;font-size:13px;font-weight:600;cursor:pointer;"><i class="fas fa-envelope" style="margin-right:4px;"></i>이메일</button>'
    : '';
  overlay.innerHTML =
    '<div style="background:#fff;width:95vw;max-width:900px;height:92vh;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 25px 60px rgba(0,0,0,.3);">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;background:#1e40af;color:#fff;">'
    + '<span style="font-weight:700;font-size:15px;"><i class="fas fa-file-invoice" style="margin-right:8px;"></i>' + title + '</span>'
    + '<div style="display:flex;gap:8px;">'
    + emailBtn
    + '<button onclick="document.getElementById(\'invoicePanel\').querySelector(\'iframe\').contentWindow.print()" style="padding:6px 16px;border:none;border-radius:6px;background:#fff;color:#1e40af;font-size:13px;font-weight:600;cursor:pointer;"><i class="fas fa-print" style="margin-right:4px;"></i>인쇄</button>'
    + '<button onclick="document.getElementById(\'invoicePanel\').remove()" style="padding:6px 16px;border:none;border-radius:6px;background:#ef4444;color:#fff;font-size:13px;font-weight:600;cursor:pointer;"><i class="fas fa-times" style="margin-right:4px;"></i>닫기</button>'
    + '</div></div>'
    + '<iframe src="' + url + '" style="flex:1;border:none;width:100%;"></iframe>'
    + '</div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// 명세서 이메일 발송 모달
function openInvoiceEmail(orderId) {
  var existing = document.getElementById('invoiceEmailModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'invoiceEmailModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:20000;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:12px;padding:28px;width:400px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.3);">'
    + '<h3 style="font-size:18px;font-weight:700;margin-bottom:16px;color:#1f2937;"><i class="fas fa-envelope" style="color:#1e40af;margin-right:8px;"></i>이메일 발송</h3>'
    + '<label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">수신 이메일</label>'
    + '<input type="email" id="invoiceEmailTo" placeholder="example@company.com" style="width:100%;padding:10px 14px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;margin-bottom:16px;">'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
    + '<button onclick="document.getElementById(\'invoiceEmailModal\').remove()" style="padding:8px 20px;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600;background:#e5e7eb;color:#374151;">취소</button>'
    + '<button id="invoiceEmailSendBtn" onclick="sendInvoiceEmail(' + orderId + ')" style="padding:8px 20px;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600;background:#1e40af;color:#fff;"><i class="fas fa-paper-plane" style="margin-right:4px;"></i>발송</button>'
    + '</div></div>';
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  // 거래처 이메일 자동 채우기
  axios.get('/api/orders/' + orderId + '/invoice').then(function(res) {
    if (res.data.success && res.data.data.client && res.data.data.client.email) {
      document.getElementById('invoiceEmailTo').value = res.data.data.client.email;
    }
  }).catch(function(err) { console.error('[orders] 이메일 자동입력 실패', err); });
  document.getElementById('invoiceEmailTo').focus();
}

async function sendInvoiceEmail(orderId) {
  var email = document.getElementById('invoiceEmailTo').value.trim();
  if (!email) { showFieldError('invoiceEmailTo', '이메일 주소를 입력하세요.'); return; }

  var btn = document.getElementById('invoiceEmailSendBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>발송 중...';

  try {
    var res = await axios.post('/api/orders/' + orderId + '/send-email', {
      type: 'invoice',
      to_email: email
    });
    if (res.data.success) {
      document.getElementById('invoiceEmailModal').remove();
      showToast('이메일이 발송되었습니다.', 'success');
    } else {
      showToast('발송 실패: ' + (res.data.error || '알 수 없는 오류'), 'error');
    }
  } catch (err) {
    var msg = (err.response && err.response.data && err.response.data.error) || err.message || '알 수 없는 오류';
    showToast('발송 실패: ' + msg, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane" style="margin-right:4px;"></i>발송';
  }
}

function openInvoice(orderId) {
  openInvoicePanel('/invoice/' + orderId, '거래 명세서', orderId);
}

function openQuotationView(orderId) {
  openInvoicePanel('/quotation/' + orderId, '견 적 서', orderId);
}

// ─── 메시지 발송 ──────────────────────────────────────────────────────────────

function sendOrderNotice(orderId, clientName, mobile, contactPhone, orderNumber, clientEmail, clientFax, clientId) {
  if (typeof window.openSendMessage !== 'function') {
    showToast('메시지 발송 기능을 사용할 수 없습니다', 'error');
    return;
  }
  var phone = mobile || contactPhone || '';
  var today = new Date().toISOString().slice(0, 10);
  window.openSendMessage({
    receiver: { name: clientName, phone: phone, email: clientEmail || '', fax: clientFax || '' },
    context: { type: 'orders', id: orderId, client_id: clientId },
    defaultChannel: 'kakao',
    defaultContent: clientName + '님, 동산현수막입니다.\n\n주문이 접수되었습니다.\n\n■ 주문번호: ' + orderNumber + '\n\n진행 상황은 추후 안내드리겠습니다.\n감사합니다.\n\n문의: 042-523-1982',
    autoTemplate: '026040001087',
    templateVars: { '고객명': clientName, '품목': orderNumber, '날짜': today },
  });
}
