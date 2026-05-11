var prCurrentPage = 1;
var prCurrentStatus = '';

var prUrgencyLabels = { 'LOW': '낮음', 'NORMAL': '보통', 'HIGH': '높음', 'URGENT': '긴급' };
var prUrgencyColors = {
  'LOW': 'bg-gray-100 text-gray-700',
  'NORMAL': 'bg-blue-50 text-blue-700',
  'HIGH': 'bg-orange-100 text-orange-700',
  'URGENT': 'bg-red-50 text-red-700'
};
var prStatusLabels = { 'PENDING': '승인대기', 'APPROVED': '승인됨', 'REJECTED': '반려', 'CONVERTED': '발주전환' };
var prStatusColors = {
  'PENDING': 'bg-amber-50 text-amber-700',
  'APPROVED': 'bg-blue-50 text-blue-700',
  'REJECTED': 'bg-red-50 text-red-700',
  'CONVERTED': 'bg-green-50 text-green-700'
};

function filterPRByStatus(s) {
  prCurrentStatus = s;
  document.getElementById('prStatusFilter').value = s;
  loadPurchaseRequests(1);
}

async function loadPRStats() {
  try {
    var res = await axios.get('/api/purchase-requests/stats');
    if (res.data.success) {
      var d = res.data.data;
      document.getElementById('prStatPending').textContent = d.pending || 0;
      document.getElementById('prStatApproved').textContent = d.approved || 0;
      document.getElementById('prStatConverted').textContent = d.converted || 0;
    }
  } catch(e) { console.error('loadPRStats error:', e); }
}

async function loadPurchaseRequests(page) {
  prCurrentPage = page || 1;
  var search = document.getElementById('prSearchInput').value;
  var status = document.getElementById('prStatusFilter').value;
  var urgency = document.getElementById('prUrgencyFilter').value;
  var url = '/api/purchase-requests?page=' + prCurrentPage + '&limit=20'
    + '&search=' + encodeURIComponent(search)
    + '&status=' + status
    + '&urgency=' + urgency;
  try {
    var res = await axios.get(url);
    if (res.data.success) {
      renderPRTable(res.data.requests);
      renderPRPagination(res.data.pagination);
    }
  } catch(e) { console.error('loadPurchaseRequests error:', e); }
}

function renderPRTable(requests) {
  var tbody = document.getElementById('prTableBody');
  if (!requests || requests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-12 text-center">'
      + '<div class="flex flex-col items-center gap-3 text-gray-400">'
      + '<i class="fas fa-clipboard-list text-4xl text-gray-300"></i>'
      + '<div class="text-sm font-medium text-gray-500">발주 요청이 없습니다</div>'
      + '<div class="text-xs text-gray-400">새 발주 요청을 작성해보세요</div>'
      + '<button onclick="window.location.href=\'/purchase-request-form\'" class="mt-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-medium"><i class="fas fa-plus mr-1"></i>새 요청</button>'
      + '</div></td></tr>';
    return;
  }
  var userStr = localStorage.getItem('user');
  var currentUserId = null;
  try { var u = JSON.parse(userStr || '{}'); currentUserId = u.id; } catch(e) {}

  var prUrgencyIcons = { 'LOW': '<i class="fas fa-arrow-down text-[7px] mr-1"></i>', 'NORMAL': '', 'HIGH': '<i class="fas fa-bolt text-[7px] mr-1"></i>', 'URGENT': '<i class="fas fa-bolt text-[7px] mr-1"></i>' };
  var prStatusIcons = {
    'PENDING': '<i class="far fa-clock text-[7px] mr-1"></i>',
    'APPROVED': '<i class="fas fa-check text-[7px] mr-1"></i>',
    'REJECTED': '<i class="fas fa-times-circle text-[7px] mr-1"></i>',
    'CONVERTED': '<i class="fas fa-exchange-alt text-[7px] mr-1"></i>'
  };

  tbody.innerHTML = requests.map(function(pr) {
    var urgIcon = prUrgencyIcons[pr.urgency] || '';
    var urgBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium '
      + (prUrgencyColors[pr.urgency] || 'bg-gray-100 text-gray-700') + '">'
      + urgIcon + (prUrgencyLabels[pr.urgency] || pr.urgency || '-') + '</span>';
    if (pr.urgency === 'URGENT') {
      urgBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 animate-pulse">'
        + '<i class="fas fa-bolt text-[7px] mr-1"></i>긴급</span>';
    }
    var statusIcon = prStatusIcons[pr.status] || '';
    var statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium '
      + (prStatusColors[pr.status] || 'bg-gray-100 text-gray-700') + '">'
      + statusIcon + (prStatusLabels[pr.status] || pr.status) + '</span>';

    var actions = '<div class="flex gap-1 justify-center flex-wrap">';
    actions += '<button onclick="viewPRDetail(' + pr.id + ')" class="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200" title="상세"><i class="fas fa-eye"></i></button>';

    if (pr.status === 'PENDING') {
      var canEdit = (currentUserRole === 'ADMIN') || (pr.requester_id === currentUserId);
      if (canEdit) {
        actions += '<button onclick="window.location.href=\'/purchase-request-form?edit=' + pr.id + '\'" class="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-200" title="수정"><i class="fas fa-edit"></i></button>';
      }
      if (currentUserRole === 'ADMIN') {
        actions += '<button onclick="openApproveModal(' + pr.id + ')" class="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-200" title="승인"><i class="fas fa-check"></i></button>';
        actions += '<button onclick="rejectPR(' + pr.id + ')" class="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-200" title="반려"><i class="fas fa-ban"></i></button>';
      } else {
        actions += '<span class="text-xs text-gray-400 ml-2"><i class="fas fa-lock mr-1"></i>승인/반려는 관리자 권한이 필요합니다</span>';
      }
      var canDelete = (currentUserRole === 'ADMIN') || (pr.requester_id === currentUserId);
      if (canDelete) {
        actions += '<button onclick="deletePR(' + pr.id + ')" class="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-200" title="삭제"><i class="fas fa-trash"></i></button>';
      }
    } else if (pr.status === 'APPROVED') {
      if (currentUserRole === 'ADMIN') {
        actions += '<button onclick="convertToPO(' + pr.id + ')" class="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100" title="발주서 변환"><i class="fas fa-exchange-alt"></i></button>';
        actions += '<button onclick="autoConvertToPO(' + pr.id + ')" class="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100" title="자동 분리 변환"><i class="fas fa-project-diagram"></i></button>';
      } else {
        actions += '<span class="text-xs text-gray-400 ml-2"><i class="fas fa-lock mr-1"></i>발주서 변환은 관리자 권한이 필요합니다</span>';
      }
    } else if (pr.status === 'CONVERTED') {
      if (pr.converted_po_id) {
        actions += '<button onclick="window.location.href=\'/purchase-orders\'" class="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200" title="발주서 이동"><i class="fas fa-external-link-alt"></i></button>';
      }
    } else if (pr.status === 'REJECTED') {
      var canDeleteRej = (currentUserRole === 'ADMIN') || (pr.requester_id === currentUserId);
      if (canDeleteRej) {
        actions += '<button onclick="deletePR(' + pr.id + ')" class="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-200" title="삭제"><i class="fas fa-trash"></i></button>';
      }
    }
    actions += '</div>';

    return '<tr class="border-t hover:bg-gray-50">'
      + '<td class="px-4 py-3 font-medium">' + (pr.request_number || '-') + '</td>'
      + '<td class="px-4 py-3">' + (pr.requester_name || '-') + '</td>'
      + '<td class="px-4 py-3 text-gray-600">' + (pr.supplier_name || '-') + '</td>'
      + '<td class="px-4 py-3 text-center">' + urgBadge + '</td>'
      + '<td class="px-4 py-3 text-center">' + (pr.created_at ? pr.created_at.substring(0, 10) : '-') + '</td>'
      + '<td class="px-4 py-3 text-right tabular-nums">' + (pr.item_count || 0) + '</td>'
      + '<td class="px-4 py-3 text-center">' + statusBadge + '</td>'
      + '<td class="px-4 py-3">' + actions + '</td>'
      + '</tr>';
  }).join('');
}

function renderPRPagination(p) {
  if (!p || p.total_pages <= 1) { document.getElementById('prPagination').innerHTML = ''; return; }
  var html = '';
  for (var i = 1; i <= p.total_pages; i++) {
    html += '<button onclick="loadPurchaseRequests(' + i + ')" class="px-3 py-1 mx-1 rounded '
      + (i === p.page ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300')
      + ' text-sm">' + i + '</button>';
  }
  document.getElementById('prPagination').innerHTML = html;
}

async function viewPRDetail(id) {
  try {
    var res = await axios.get('/api/purchase-requests/' + id);
    if (!res.data.success) { showToast('불러오기 실패', 'error'); return; }
    var pr = res.data.request;
    var items = pr.items || [];
    var history = pr.history || [];

    var urgBadge = '<span class="px-2 py-0.5 rounded text-xs font-medium '
      + (prUrgencyColors[pr.urgency] || 'bg-gray-100 text-gray-700') + '">'
      + (prUrgencyLabels[pr.urgency] || pr.urgency || '-') + '</span>';
    var statusBadge = '<span class="px-2 py-0.5 rounded text-xs font-medium '
      + (prStatusColors[pr.status] || 'bg-gray-100 text-gray-700') + '">'
      + (prStatusLabels[pr.status] || pr.status) + '</span>';

    var itemRows = items.map(function(it) {
      var adminQtyDisplay = (it.admin_quantity && it.admin_quantity !== it.quantity)
        ? ' <span class="text-blue-600 text-xs">(승인: ' + it.admin_quantity + ')</span>' : '';
      var adminPriceDisplay = (it.admin_unit_price && it.admin_unit_price !== it.estimated_unit_price)
        ? ' <span class="text-blue-600 text-xs">(승인: ' + (it.admin_unit_price || 0).toLocaleString() + ')</span>' : '';
      return '<tr class="border-t">'
        + '<td class="px-3 py-2">' + (it.item_name || '-') + '</td>'
        + '<td class="px-3 py-2 text-center">' + (it.quantity || 0) + adminQtyDisplay + '</td>'
        + '<td class="px-3 py-2 text-center">' + (it.unit || '-') + '</td>'
        + '<td class="px-3 py-2 text-right">' + ((it.estimated_unit_price || 0).toLocaleString()) + adminPriceDisplay + '</td>'
        + '<td class="px-3 py-2 text-right">'
        + (((it.admin_quantity || it.quantity || 0) * (it.admin_unit_price || it.estimated_unit_price || 0)).toLocaleString())
        + '</td>'
        + '</tr>';
    }).join('');

    var historyRows = history.map(function(h) {
      var isEdit = h.from_status && h.from_status === h.to_status;
      var fromLabel = prStatusLabels[h.from_status] || h.from_status || '신규';
      var toLabel = prStatusLabels[h.to_status] || h.to_status || '-';
      var icon = isEdit
        ? '<i class="fas fa-pen text-xs text-amber-500 mr-1"></i>'
        : '<i class="fas fa-arrow-right text-xs text-gray-400 mx-1"></i>';
      var statusHtml = isEdit
        ? icon + '<span class="font-medium text-amber-700">내용 수정</span>'
        : '<span class="text-gray-500">' + fromLabel + '</span> ' + icon + '<span class="font-medium">' + toLabel + '</span>';
      return '<div class="flex items-start gap-3 py-2 border-t first:border-t-0' + (isEdit ? ' bg-amber-50 -mx-3 px-3 rounded' : '') + '">'
        + '<div class="text-xs text-gray-500 whitespace-nowrap pt-0.5">'
        + (h.changed_at ? h.changed_at.substring(0, 16).replace('T', ' ') : '-')
        + '</div>'
        + '<div class="flex-1 text-sm">'
        + statusHtml
        + (h.changed_by_name ? ' <span class="text-gray-500 text-xs">by ' + h.changed_by_name + '</span>' : '')
        + (h.change_reason ? '<div class="text-xs text-gray-500 mt-0.5">' + escapeHtml(h.change_reason) + '</div>' : '')
        + '</div>'
        + '</div>';
    }).join('');

    var linkedPOHtml = '';
    if (pr.linkedPO) {
      var poStatusLabels = { 'DRAFT': '임시저장', 'CONFIRMED': '발주확정', 'PARTIAL_RECEIVED': '부분입고', 'RECEIVED': '입고완료', 'CANCELLED': '취소' };
      var poStatusColors = { 'DRAFT': 'bg-gray-100 text-gray-700', 'CONFIRMED': 'bg-blue-50 text-blue-700', 'PARTIAL_RECEIVED': 'bg-amber-50 text-amber-700', 'RECEIVED': 'bg-green-50 text-green-700', 'CANCELLED': 'bg-red-50 text-red-700' };
      var poBadge = '<span class="px-2 py-0.5 rounded text-xs font-medium ' + (poStatusColors[pr.linkedPO.status] || 'bg-gray-100') + '">' + (poStatusLabels[pr.linkedPO.status] || pr.linkedPO.status) + '</span>';
      linkedPOHtml = '<div class="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">'
        + '<h4 class="font-medium mb-2 text-sm text-blue-700"><i class="fas fa-link mr-1"></i>연결된 발주서</h4>'
        + '<div class="flex items-center gap-3 text-sm">'
        + '<span class="font-medium">' + (pr.linkedPO.po_number || '') + '</span>'
        + poBadge
        + '<span class="text-gray-600">' + (pr.linkedPO.supplier_name || '') + '</span>'
        + '<span class="text-gray-600">' + ((pr.linkedPO.final_amount || 0).toLocaleString()) + '원</span>'
        + '<button onclick="window.location.href=\'/purchase-orders\'" class="text-blue-600 hover:text-blue-700 text-xs"><i class="fas fa-external-link-alt mr-1"></i>발주서 보기</button>'
        + '</div></div>';
    }

    var comments = pr.comments || [];
    var commentsHtml = '<div class="mt-4 border-t pt-4">'
      + '<h4 class="font-medium mb-2 text-sm"><i class="fas fa-comments mr-1 text-gray-500"></i>댓글 (' + comments.length + ')</h4>';

    if (comments.length > 0) {
      commentsHtml += '<div class="space-y-2 mb-3 max-h-48 overflow-y-auto">';
      for (var ci = 0; ci < comments.length; ci++) {
        var cm = comments[ci];
        var cmTime = cm.created_at ? cm.created_at.substring(0, 16).replace('T', ' ') : '';
        commentsHtml += '<div class="flex items-start gap-2 text-sm p-2 bg-gray-50 rounded">'
          + '<div class="flex-shrink-0 w-7 h-7 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">'
          + (cm.user_name ? cm.user_name.charAt(0) : '?') + '</div>'
          + '<div class="flex-1"><div class="text-xs text-gray-500">' + (cm.user_name || '') + ' · ' + cmTime + '</div>'
          + '<div class="text-gray-700 mt-0.5">' + escapeHtml(cm.content) + '</div></div></div>';
      }
      commentsHtml += '</div>';
    }

    commentsHtml += '<div class="flex gap-2">'
      + '<input type="text" id="prCommentInput" placeholder="댓글을 입력하세요..." '
      + 'class="flex-1 px-3 py-2 border rounded-lg text-sm" onkeyup="if(event.key===\'Enter\')submitPRComment(' + pr.id + ')">'
      + '<button onclick="submitPRComment(' + pr.id + ')" class="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">'
      + '<i class="fas fa-paper-plane"></i></button></div></div>';

    var adminButtons = '';
    if (currentUserRole === 'ADMIN') {
      if (pr.status === 'PENDING') {
        adminButtons = '<div class="flex gap-2 mt-4 pt-4 border-t">'
          + '<button onclick="document.getElementById(\'prDetailModal\').classList.add(\'hidden\');openApproveModal(' + pr.id + ')"'
          + ' class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"><i class="fas fa-check mr-1"></i>승인</button>'
          + '<button onclick="document.getElementById(\'prDetailModal\').classList.add(\'hidden\');rejectPR(' + pr.id + ')"'
          + ' class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium"><i class="fas fa-ban mr-1"></i>반려</button>'
          + '</div>';
      } else if (pr.status === 'APPROVED') {
        adminButtons = '<div class="flex gap-2 mt-4 pt-4 border-t">'
          + '<button onclick="document.getElementById(\'prDetailModal\').classList.add(\'hidden\');convertToPO(' + pr.id + ')"'
          + ' class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"><i class="fas fa-exchange-alt mr-1"></i>발주서 변환</button>'
          + '<button onclick="document.getElementById(\'prDetailModal\').classList.add(\'hidden\');autoConvertToPO(' + pr.id + ')"'
          + ' class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"><i class="fas fa-project-diagram mr-1"></i>자동 분리 변환</button>'
          + '</div>';
      }
    }

    document.getElementById('prDetailContent').innerHTML =
      '<div class="flex justify-between items-start mb-4">'
      + '<h3 class="text-lg font-bold"><i class="fas fa-clipboard-list text-blue-600 mr-2"></i>'
      + (pr.request_number || '') + '</h3>'
      + '<button onclick="document.getElementById(\'prDetailModal\').classList.add(\'hidden\')"'
      + ' class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>'
      + '</div>'
      + '<div class="grid grid-cols-2 gap-3 mb-4 text-sm">'
      + '<div><span class="text-gray-500">요청자:</span> <span class="font-medium">' + (pr.requester_name || '-') + '</span></div>'
      + '<div><span class="text-gray-500">긴급도:</span> ' + urgBadge + '</div>'
      + '<div><span class="text-gray-500">상태:</span> ' + statusBadge + '</div>'
      + '<div><span class="text-gray-500">요청일:</span> ' + (pr.created_at ? pr.created_at.substring(0, 10) : '-') + '</div>'
      + '<div><span class="text-gray-500">공급업체(추천):</span> ' + (pr.supplier_name || '-') + '</div>'
      + (pr.approved_by_name ? '<div><span class="text-gray-500">승인자:</span> ' + pr.approved_by_name + '</div>' : '')
      + (pr.reject_reason ? '<div class="col-span-2 text-red-600"><span class="text-gray-500">반려사유:</span> ' + pr.reject_reason + '</div>' : '')
      + '</div>'
      + (pr.reason ? '<div class="bg-gray-50 rounded p-3 mb-4 text-sm"><span class="font-medium">요청 사유:</span> ' + pr.reason + '</div>' : '')
      + '<h4 class="font-medium mb-2 text-sm">요청 품목</h4>'
      + '<div class="overflow-x-auto mb-4">'
      + '<table class="w-full text-sm ds-table-striped"><thead class="bg-gray-50"><tr>'
      + '<th class="px-3 py-2 text-left">품목명</th>'
      + '<th class="px-3 py-2 text-center">수량</th>'
      + '<th class="px-3 py-2 text-center">단위</th>'
      + '<th class="px-3 py-2 text-right">예상단가</th>'
      + '<th class="px-3 py-2 text-right">예상금액</th>'
      + '</tr></thead>'
      + '<tbody>' + (itemRows || '<tr><td colspan="5" class="px-3 py-4 text-center text-gray-400">품목 없음</td></tr>') + '</tbody>'
      + '</table></div>'
      + (history.length > 0
        ? '<h4 class="font-medium mb-2 text-sm">상태 이력</h4><div class="border rounded-lg p-3 text-sm mb-4">' + historyRows + '</div>'
        : '')
      + linkedPOHtml + commentsHtml
      + adminButtons;

    document.getElementById('prDetailModal').classList.remove('hidden');
  } catch(e) {
    showToast('상세 조회 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

async function openApproveModal(id) {
  try {
    var res = await axios.get('/api/purchase-requests/' + id);
    if (!res.data.success) { showToast('불러오기 실패', 'error'); return; }
    var pr = res.data.request;
    var items = pr.items || [];

    var itemRows = items.map(function(it, idx) {
      return '<tr class="border-t" id="appr-row-' + it.id + '">'
        + '<td class="px-3 py-2 text-sm">' + (it.item_name || '-') + '</td>'
        + '<td class="px-3 py-2 text-center text-sm">' + (it.quantity || 0) + '</td>'
        + '<td class="px-2 py-2">'
        + '<input type="number" id="appr_qty_' + it.id + '" value="' + (it.quantity || 0) + '" min="0"'
        + ' class="w-20 border rounded px-2 py-1 text-sm text-center">'
        + '</td>'
        + '<td class="px-3 py-2 text-right text-sm">' + ((it.estimated_unit_price || 0).toLocaleString()) + '</td>'
        + '<td class="px-2 py-2">'
        + '<input type="number" id="appr_price_' + it.id + '" value="' + (it.estimated_unit_price || 0) + '" min="0"'
        + ' class="w-28 border rounded px-2 py-1 text-sm text-right">'
        + '</td>'
        + '</tr>';
    }).join('');

    var supplierHtml = '<div class="mb-4">'
      + '<label class="block text-sm font-medium text-gray-700 mb-1">공급업체 변경 (선택)</label>'
      + '<div class="flex gap-2">'
      + '<input type="text" id="apprSupplierName" value="' + (pr.supplier_name || '') + '" placeholder="공급업체명 입력"'
      + ' class="flex-1 px-3 py-2 border rounded-lg text-sm">'
      + '<input type="hidden" id="apprSupplierId" value="' + (pr.supplier_id || '') + '">'
      + '<button onclick="searchApprSupplier()" class="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm">'
      + '<i class="fas fa-search"></i></button>'
      + '</div>'
      + '<div id="apprSupplierDd" class="border rounded-lg hidden max-h-40 overflow-y-auto mt-1 bg-white shadow-lg"></div>'
      + '</div>';

    document.getElementById('prApproveContent').innerHTML =
      '<div class="flex justify-between items-center mb-4">'
      + '<h3 class="text-lg font-bold text-green-700"><i class="fas fa-check-circle mr-2"></i>발주 요청 승인</h3>'
      + '<button onclick="document.getElementById(\'prApproveModal\').classList.add(\'hidden\')"'
      + ' class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>'
      + '</div>'
      + '<p class="text-sm text-gray-600 mb-4">요청번호: <strong>' + (pr.request_number || '') + '</strong>'
      + ' | 요청자: <strong>' + (pr.requester_name || '') + '</strong></p>'
      + supplierHtml
      + '<h4 class="font-medium mb-2 text-sm">품목 수량/단가 검토 (수정 가능)</h4>'
      + '<div class="overflow-x-auto mb-4">'
      + '<table class="w-full text-sm ds-table-striped"><thead class="bg-gray-50"><tr>'
      + '<th class="px-3 py-2 text-left">품목명</th>'
      + '<th class="px-3 py-2 text-center">요청수량</th>'
      + '<th class="px-3 py-2 text-center">승인수량</th>'
      + '<th class="px-3 py-2 text-right">예상단가</th>'
      + '<th class="px-3 py-2 text-right">승인단가</th>'
      + '</tr></thead>'
      + '<tbody>' + (itemRows || '<tr><td colspan="5" class="px-3 py-4 text-center text-gray-400">품목 없음</td></tr>') + '</tbody>'
      + '</table></div>'
      + '<div class="flex justify-end gap-3">'
      + '<button onclick="document.getElementById(\'prApproveModal\').classList.add(\'hidden\')"'
      + ' class="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm">취소</button>'
      + '<button onclick="submitApprove(' + id + ',' + JSON.stringify(items.map(function(it){return it.id;})) + ')"'
      + ' class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"><i class="fas fa-check mr-1"></i>승인</button>'
      + '</div>';

    document.getElementById('prApproveModal').classList.remove('hidden');
    window._approveItemIds = items.map(function(it) { return it.id; });
  } catch(e) {
    showToast('승인 모달 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

async function searchApprSupplier() {
  var q = document.getElementById('apprSupplierName').value.trim();
  if (!q) return;
  try {
    var res = await axios.get('/api/clients?type=PURCHASE&search=' + encodeURIComponent(q) + '&limit=20');
    var clients = (res.data && res.data.data && res.data.data.clients) ? res.data.data.clients : [];
    var dd = document.getElementById('apprSupplierDd');
    if (clients.length === 0) {
      dd.innerHTML = '<div class="px-3 py-2 text-sm text-gray-400">검색 결과 없음</div>';
    } else {
      dd.innerHTML = clients.map(function(cl) {
        var safeName = (cl.client_name || '').replace(/'/g, "\\'");
        return '<div class="px-3 py-2 cursor-pointer hover:bg-blue-50 text-sm border-b last:border-b-0"'
          + ' onclick="selectApprSupplier(' + cl.id + ',\'' + safeName + '\')">'
          + (cl.client_name || '') + '</div>';
      }).join('');
    }
    dd.classList.remove('hidden');
  } catch(e) { console.error('searchApprSupplier error:', e); }
}

function selectApprSupplier(id, name) {
  document.getElementById('apprSupplierId').value = id;
  document.getElementById('apprSupplierName').value = name;
  document.getElementById('apprSupplierDd').classList.add('hidden');
}

async function submitApprove(prId, itemIds) {
  var supplierId = document.getElementById('apprSupplierId').value;
  var ids = itemIds || (window._approveItemIds || []);
  var itemUpdates = ids.map(function(itemId) {
    var qtyEl = document.getElementById('appr_qty_' + itemId);
    var priceEl = document.getElementById('appr_price_' + itemId);
    return {
      request_item_id: itemId,
      admin_quantity: qtyEl ? (parseFloat(qtyEl.value) || 0) : null,
      admin_unit_price: priceEl ? (parseFloat(priceEl.value) || 0) : null
    };
  });
  try {
    var payload = { items: itemUpdates };
    if (supplierId) payload.supplier_id = parseInt(supplierId);
    var res = await axios.patch('/api/purchase-requests/' + prId + '/approve', payload);
    if (res.data.success) {
      showToast('승인 완료되었습니다.', 'success');
      document.getElementById('prApproveModal').classList.add('hidden');
      loadPRStats();
      loadPurchaseRequests(prCurrentPage);
    } else {
      showToast('승인 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('승인 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

function rejectPR(id) {
  document.getElementById('rejectReasonInput').value = '';
  document.getElementById('prRejectModal').classList.remove('hidden');
  document.getElementById('rejectConfirmBtn').onclick = function() { submitReject(id); };
}

async function submitReject(id) {
  var reason = document.getElementById('rejectReasonInput').value.trim();
  if (!reason) { showToast('반려 사유를 입력해주세요.', 'warning'); return; }
  try {
    var res = await axios.patch('/api/purchase-requests/' + id + '/reject', { reject_reason: reason });
    if (res.data.success) {
      showToast('반려 처리되었습니다.', 'success');
      document.getElementById('prRejectModal').classList.add('hidden');
      loadPRStats();
      loadPurchaseRequests(prCurrentPage);
    } else {
      showToast('반려 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('반려 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

async function convertToPO(id) {
  if (!(await showConfirm('이 발주 요청을 발주서(임시저장)로 변환하시겠습니까?'))) return;
  try {
    var res = await axios.post('/api/purchase-requests/' + id + '/convert');
    if (res.data.success) {
      var poId = res.data.po_id;
      showToast('발주서가 생성되었습니다.', 'success');
      loadPRStats();
      loadPurchaseRequests(prCurrentPage);
      if (poId) {
        setTimeout(function() {
          window.location.href = '/purchase-order-form?edit=' + poId;
        }, 800);
      }
    } else {
      showToast('변환 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('변환 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

async function deletePR(id) {
  if (!(await showConfirm('이 발주 요청을 삭제하시겠습니까?', { danger: true }))) return;
  try {
    var res = await axios.delete('/api/purchase-requests/' + id);
    if (res.data.success) {
      showToast('삭제되었습니다.', 'success');
      loadPRStats();
      loadPurchaseRequests(prCurrentPage);
    } else {
      showToast('삭제 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('삭제 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

async function submitPRComment(prId) {
  var input = document.getElementById('prCommentInput');
  var content = input ? input.value.trim() : '';
  if (!content) return;
  try {
    var res = await axios.post('/api/purchase-requests/' + prId + '/comments', { content: content });
    if (res.data.success) {
      input.value = '';
      // 모달 새로고침
      viewPRDetail(prId);
    } else {
      showToast('댓글 등록 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('댓글 등록 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

async function autoConvertToPO(id) {
  if (!(await showConfirm('이 발주 요청의 품목을 최근 입고 이력 기준으로 공급업체별 발주서를 자동 생성하시겠습니까?'))) return;
  try {
    var res = await axios.post('/api/purchase-requests/' + id + '/auto-convert');
    if (res.data.success) {
      var pos = res.data.created_pos || [];
      var msg = res.data.message || '';
      if (pos.length > 0) {
        msg += '\n\n생성된 발주서:';
        for (var i = 0; i < pos.length; i++) {
          msg += '\n• ' + pos[i].po_number + ' (' + pos[i].supplier_name + ', ' + pos[i].item_count + '품목)';
        }
      }
      var unassigned = res.data.unassigned_items || [];
      if (unassigned.length > 0) {
        msg += '\n\n⚠ 미매핑 품목:\n• ' + unassigned.join('\n• ');
      }
      showToast(msg, 'warning');
      loadPRStats();
      loadPurchaseRequests(prCurrentPage);
    } else {
      showToast('자동 변환 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('자동 변환 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

// 모달 외부 클릭 시 닫기
document.getElementById('prDetailModal').addEventListener('click', function(e) {
  if (e.target === this) this.classList.add('hidden');
});
document.getElementById('prApproveModal').addEventListener('click', function(e) {
  if (e.target === this) this.classList.add('hidden');
});
document.getElementById('prRejectModal').addEventListener('click', function(e) {
  if (e.target === this) this.classList.add('hidden');
});

// 초기 로드
loadPRStats();
loadPurchaseRequests(1);
