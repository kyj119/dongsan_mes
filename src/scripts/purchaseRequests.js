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
    // 목록과 같은 조건으로 집계 (상태는 카드가 담당하므로 제외)
    var sp = prBuildParams(prReadFilters(), { omitStatus: true });
    var res = await axios.get('/api/purchase-requests/stats' + (sp.toString() ? '?' + sp.toString() : ''));
    if (res.data.success) {
      var d = res.data.data;
      document.getElementById('prStatPending').textContent = d.pending || 0;
      document.getElementById('prStatApproved').textContent = d.approved || 0;
      document.getElementById('prStatConverted').textContent = d.converted || 0;
    }
  } catch(e) { console.error('loadPRStats error:', e); }
}

// ── 조회조건 SSOT (클라) — 서버 정본 = routes/purchaseRequests.ts buildPrFilter ──
function prReadFilters() {
  var g = function(id) { var el = document.getElementById(id); return el ? el.value : ''; };
  return { search: g('prSearchInput'), status: g('prStatusFilter'), urgency: g('prUrgencyFilter') };
}
function prBuildParams(f, opts) {
  opts = opts || {};
  var p = new URLSearchParams();
  if (f.search) p.append('search', f.search);
  if (f.status && !opts.omitStatus) p.append('status', f.status);
  if (f.urgency) p.append('urgency', f.urgency);
  return p;
}
function prLabelOf(selId, v) {
  var sel = document.getElementById(selId);
  if (sel) for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === v) return sel.options[i].textContent;
  return v;
}
function prRenderChips(f) {
  var items = [];
  var clear = function(id, extra) { return function() { document.getElementById(id).value = ''; if (extra) extra(); loadPurchaseRequests(1); }; };
  if (f.search) items.push({ label: '검색 "' + f.search + '"', onClear: clear('prSearchInput') });
  if (f.status) items.push({ label: '상태 ' + prLabelOf('prStatusFilter', f.status), onClear: clear('prStatusFilter', function() { prCurrentStatus = ''; }) });
  if (f.urgency) items.push({ label: '긴급도 ' + prLabelOf('prUrgencyFilter', f.urgency), onClear: clear('prUrgencyFilter') });
  if (!items.length) items.push({ label: '전체 조회', tone: 'static' });
  window.dsListUx.renderChips('prFilterChips', items);
}
function prRenderSummary(summary, pagination) {
  if (!summary) { window.dsListUx.renderSummary('prSummaryBar', null); return; }
  window.dsListUx.renderSummary('prSummaryBar', [
    { label: '건수', value: summary.count },
    { label: '요청수량', value: summary.quantity },
    { label: '예상금액', value: summary.estimated_amount, format: 'won', strong: true }
  ], { multiPage: !!(pagination && pagination.total_pages > 1) });
}
// 프리셋 적용
var prPresetApplied = false;
function prApplyFilters(f) {
  if (!f) return;
  var setVal = function(id, v) { var el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
  setVal('prSearchInput', f.search);
  setVal('prStatusFilter', f.status);
  setVal('prUrgencyFilter', f.urgency);
  prCurrentStatus = f.status || '';
  prPresetApplied = true;
  loadPurchaseRequests(1);
}

async function loadPurchaseRequests(page) {
  prCurrentPage = page || 1;
  var tbody = document.getElementById('prTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>로딩 중...</td></tr>';
  var f = prReadFilters();
  var params = prBuildParams(f);
  params.append('page', String(prCurrentPage));
  params.append('limit', String(window.dsListToolbar ? window.dsListToolbar.pageSize('purchase-requests', 20) : 20));

  prRenderChips(f);          // 조건 표시는 응답을 기다리지 않는다
  loadPRStats();             // 통계 카드도 같은 조건으로

  try {
    var res = await axios.get('/api/purchase-requests?' + params.toString());
    if (res.data.success) {
      renderPRTable(res.data.requests);
      renderPRPagination(res.data.pagination);
      prRenderSummary(res.data.summary, res.data.pagination);
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
        // 공급처 미지정 승인 건의 유일한 탈출구 — 없으면 변환·수정·반려·삭제가 전부 막힌다
        if (!pr.supplier_id) {
          actions += '<button onclick="assignPRSupplier(' + pr.id + ')" class="px-2 py-1 text-xs bg-amber-50 text-amber-700 rounded hover:bg-amber-100" title="공급처 지정 (변환하려면 필요)"><i class="fas fa-truck"></i></button>';
        }
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
      + '<td class="px-4 py-3 font-medium">' + escapeHtml(pr.request_number || '-') + '</td>'
      + '<td class="px-4 py-3" title="' + escapeHtml(pr.requester_name || '') + '">' + escapeHtml(pr.requester_name || '-') + '</td>'
      + '<td class="px-4 py-3 text-gray-600" title="' + escapeHtml(pr.supplier_name || '') + '">' + escapeHtml(pr.supplier_name || '-') + '</td>'
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
        + '<td class="px-3 py-2">' + escapeHtml(it.item_name || '-') + '</td>'
        + '<td class="px-3 py-2 text-center">' + (it.quantity || 0) + adminQtyDisplay + '</td>'
        + '<td class="px-3 py-2 text-center">' + escapeHtml(it.unit || '-') + '</td>'
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
        + '<span class="font-medium">' + escapeHtml(pr.linkedPO.po_number || '') + '</span>'
        + poBadge
        + '<span class="text-gray-600">' + escapeHtml(pr.linkedPO.supplier_name || '') + '</span>'
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
          + escapeHtml(cm.user_name ? cm.user_name.charAt(0) : '?') + '</div>'
          + '<div class="flex-1"><div class="text-xs text-gray-500">' + escapeHtml(cm.user_name || '') + ' · ' + cmTime + '</div>'
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
      + escapeHtml(pr.request_number || '') + '</h3>'
      + '<button onclick="document.getElementById(\'prDetailModal\').classList.add(\'hidden\')"'
      + ' class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>'
      + '</div>'
      + '<div class="grid grid-cols-2 gap-3 mb-4 text-sm">'
      + '<div><span class="text-gray-500">요청자:</span> <span class="font-medium">' + escapeHtml(pr.requester_name || '-') + '</span></div>'
      + '<div><span class="text-gray-500">긴급도:</span> ' + urgBadge + '</div>'
      + '<div><span class="text-gray-500">상태:</span> ' + statusBadge + '</div>'
      + '<div><span class="text-gray-500">요청일:</span> ' + (pr.created_at ? pr.created_at.substring(0, 10) : '-') + '</div>'
      + '<div><span class="text-gray-500">공급업체(추천):</span> ' + escapeHtml(pr.supplier_name || '-') + '</div>'
      + (pr.approved_by_name ? '<div><span class="text-gray-500">승인자:</span> ' + escapeHtml(pr.approved_by_name) + '</div>' : '')
      + (pr.reject_reason ? '<div class="col-span-2 text-red-600"><span class="text-gray-500">반려사유:</span> ' + escapeHtml(pr.reject_reason) + '</div>' : '')
      + '</div>'
      + (pr.reason ? '<div class="bg-gray-50 rounded p-3 mb-4 text-sm"><span class="font-medium">요청 사유:</span> ' + escapeHtml(pr.reason) + '</div>' : '')
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
        + '<td class="px-3 py-2 text-sm">' + escapeHtml(it.item_name || '-') + '</td>'
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

    // 공급업체는 "선택"이 아니다 — 미지정으로 승인하면 발주서 변환이 막히고, 승인 후에는
    //   [공급처 지정] 으로만 되돌릴 수 있다. 이름을 손으로 적어도 id 가 안 잡히므로 입력칸은
    //   readonly + 검색 모달 전용으로 둔다(2026-08-26: 타이핑=미지정인데 화면이 같아 보이던 함정).
    var supplierHtml = '<div class="mb-4">'
      + '<label class="block text-sm font-medium text-gray-700 mb-1">공급업체 <span class="text-xs font-normal text-gray-500">— 발주서 변환에 필요합니다</span></label>'
      + '<div class="flex gap-2">'
      + '<input type="text" id="apprSupplierName" value="' + escapeHtml(pr.supplier_name || '') + '" placeholder="검색으로 선택하세요" readonly'
      + ' onclick="searchApprSupplier()" class="flex-1 px-3 py-2 border rounded-lg text-sm bg-gray-50 cursor-pointer">'
      + '<input type="hidden" id="apprSupplierId" value="' + (pr.supplier_id || '') + '">'
      + '<button onclick="searchApprSupplier()" class="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm" title="거래처 검색">'
      + '<i class="fas fa-search"></i></button>'
      + '<button onclick="clearApprSupplier()" class="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm" title="지정 해제">'
      + '<i class="fas fa-times"></i></button>'
      + '</div>'
      + '</div>';

    document.getElementById('prApproveContent').innerHTML =
      '<div class="flex justify-between items-center mb-4">'
      + '<h3 class="text-lg font-bold text-green-700"><i class="fas fa-check-circle mr-2"></i>발주 요청 승인</h3>'
      + '<button onclick="document.getElementById(\'prApproveModal\').classList.add(\'hidden\')"'
      + ' class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>'
      + '</div>'
      + '<p class="text-sm text-gray-600 mb-4">요청번호: <strong>' + escapeHtml(pr.request_number || '') + '</strong>'
      + ' | 요청자: <strong>' + escapeHtml(pr.requester_name || '') + '</strong></p>'
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

// 공용 거래처 검색 모달 채택 (openClientSearchModal 파일럿 — 자체 드롭다운 9벌 통합의 1호)
function searchApprSupplier() {
  window.openClientSearchModal({
    search: document.getElementById('apprSupplierName').value.trim(),
    onSelect: function(cl) {
      document.getElementById('apprSupplierId').value = cl.id;
      document.getElementById('apprSupplierName').value = cl.client_name || '';
    }
  });
}

// 승인 후 공급처 지정 — PATCH /:id/supplier (상태는 APPROVED 그대로)
function assignPRSupplier(id) {
  window.openClientSearchModal({
    onSelect: async function(cl) {
      try {
        var res = await axios.patch('/api/purchase-requests/' + id + '/supplier', { supplier_id: cl.id });
        if (res.data.success) {
          showToast((cl.client_name || '') + ' 지정 완료 — 이제 발주서로 변환할 수 있습니다.', 'success');
          loadPurchaseRequests(prCurrentPage);
        } else {
          showToast(res.data.error || '공급처 지정 실패', 'error');
        }
      } catch (e) {
        showToast('공급처 지정 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
      }
    }
  });
}

function clearApprSupplier() {
  var idEl = document.getElementById('apprSupplierId');
  var nameEl = document.getElementById('apprSupplierName');
  if (!idEl || !nameEl) { console.warn('[purchaseRequests] #apprSupplierId/#apprSupplierName not found'); return; }
  idEl.value = '';
  nameEl.value = '';
}

async function submitApprove(prId, itemIds) {
  var supplierId = document.getElementById('apprSupplierId').value;
  var ids = itemIds || (window._approveItemIds || []);
  // 공급처 없이 승인하면 변환이 막힌다 — 되돌리려면 [공급처 지정]을 따로 눌러야 하므로 여기서 먼저 경고
  if (!supplierId) {
    var ok = await showConfirm('공급업체가 지정되지 않았습니다. 이대로 승인하면 발주서로 변환할 수 없고, 나중에 목록에서 [공급처 지정]을 눌러 지정해야 합니다. 계속하시겠습니까?');
    if (!ok) return;
  }
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
        msg += '\n\n미매핑 품목:\n• ' + unassigned.join('\n• ');
      }
      showToast(msg, 'warning');
      loadPurchaseRequests(prCurrentPage);
    } else {
      showToast('자동 변환 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('자동 변환 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

// CSV 내보내기 (현재 화면 필터 반영)
async function exportPrCsv() {
  try {
    var params = new URLSearchParams();
    var searchEl = document.getElementById('prSearchInput');
    var statusEl = document.getElementById('prStatusFilter');
    var urgencyEl = document.getElementById('prUrgencyFilter');
    var search = searchEl ? searchEl.value : '';
    var status = statusEl ? statusEl.value : '';
    var urgency = urgencyEl ? urgencyEl.value : '';
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (urgency) params.set('urgency', urgency);
    var res = await authFetch('/api/purchase-requests/export/csv?' + params.toString());
    if (!res.ok) throw new Error('서버 오류');
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '발주요청_' + (window.kstToday ? window.kstToday() : new Date().toISOString().slice(0, 10)) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  } catch(e) {
    showToast('CSV 내보내기 실패: ' + e.message, 'error');
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
// 도구모음을 먼저 붙이고 그 결과로 첫 조회 (설정을 모른 채 조회하면 두 번 조회하게 된다)
var _prTb = window.dsListToolbar && window.dsListToolbar.mount({
  pageKey: 'purchase-requests',
  container: 'prListToolbar',
  tableSelector: '.pr-tbl',
  defaultPageSize: 20,
  getFilters: function() { return prReadFilters(); },
  applyFilters: function(f) { prApplyFilters(f); },
  onChange: function() { loadPurchaseRequests(1); }
});
if (_prTb && _prTb.then) _prTb.then(function() { if (!prPresetApplied) loadPurchaseRequests(1); });
else loadPurchaseRequests(1);
