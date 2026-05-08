var currentPage = 1;

var actionLabels = {
  CREATE: '생성', STATUS_CHANGE: '상태변경', UPDATE: '수정', DELETE: '삭제'
};
var entityLabels = {
  ORDER: '주문', CARD: '카드', PAYMENT: '결제', CLIENT: '거래처', SHIPMENT: '출고'
};
var actionColors = {
  CREATE: 'bg-green-50 text-green-700',
  STATUS_CHANGE: 'bg-blue-50 text-blue-700',
  UPDATE: 'bg-amber-50 text-amber-700',
  DELETE: 'bg-red-50 text-red-700'
};
var actionIcons = {
  CREATE: 'fas fa-plus-circle',
  STATUS_CHANGE: 'fas fa-exchange-alt',
  UPDATE: 'fas fa-edit',
  DELETE: 'fas fa-trash'
};

async function loadLogs() {
  var tbody = document.getElementById('logTableBody');
  tbody.innerHTML = '<tr><td colspan="5" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>'
    + '<tr><td colspan="5" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>'
    + '<tr><td colspan="5" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>'
    + '<tr><td colspan="5" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>'
    + '<tr><td colspan="5" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>';
  try {
    var params = new URLSearchParams();
    var search = document.getElementById('logSearch').value || '';
    var entityType = document.getElementById('entityTypeFilter').value || '';
    var dateFrom = document.getElementById('logDateFrom').value || '';
    var dateTo = document.getElementById('logDateTo').value || '';

    if (search) params.append('search', search);
    if (entityType) params.append('entity_type', entityType);
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    params.append('page', String(currentPage));
    params.append('limit', '50');

    var res = await authFetch('/api/activity-logs?' + params.toString());
    var data = await res.json();
    if (!data.success) throw new Error(data.error);

    var logs = data.data || [];

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-12 text-center">'
        + '<i class="fas fa-clipboard-list text-3xl mb-3 block text-gray-300"></i>'
        + '<div class="text-sm text-gray-500 mb-1">활동 로그가 없습니다</div>'
        + '</td></tr>';
      renderLogPagination(data.pagination);
      return;
    }

    tbody.innerHTML = logs.map(function(log) {
      var actionBadge = '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full ' + (actionColors[log.action] || 'bg-gray-100 text-gray-600') + '">'
        + '<i class="' + (actionIcons[log.action] || 'fas fa-circle') + ' text-[7px] mr-1"></i>'
        + (actionLabels[log.action] || log.action) + '</span>';
      var entityBadge = '<span class="text-xs text-gray-500">' + (entityLabels[log.entity_type] || log.entity_type) + '</span>';

      var detailText = '';
      if (log.details) {
        try {
          var d = JSON.parse(log.details);
          if (d.from && d.to) detailText = d.from + ' → ' + d.to;
          else if (d.amount) detailText = Number(d.amount).toLocaleString() + '원';
          else detailText = log.details;
        } catch(e) { detailText = log.details; }
      }

      return '<tr class="hover:bg-gray-50">'
        + '<td class="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">' + new Date(log.created_at).toLocaleString('ko-KR') + '</td>'
        + '<td class="px-4 py-3 text-sm font-medium text-gray-700">' + (log.user_name || '-') + '</td>'
        + '<td class="px-4 py-3">' + actionBadge + '</td>'
        + '<td class="px-4 py-3"><div>' + entityBadge + '</div><div class="text-sm font-medium">' + (log.entity_label || '-') + '</div></td>'
        + '<td class="px-4 py-3 text-sm text-gray-500">' + (detailText || '-') + '</td>'
        + '</tr>';
    }).join('');

    renderLogPagination(data.pagination);
  } catch(e) {
    console.error('Load logs error:', e);
    document.getElementById('logTableBody').innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-red-400">로드 실패</td></tr>';
  }
}

function renderLogPagination(pagination) {
  var container = document.getElementById('logPagination');
  if (!pagination || pagination.total_pages <= 1) {
    container.innerHTML = pagination ? '<span class="text-sm text-gray-500">총 ' + pagination.total + '건</span>' : '';
    return;
  }
  var p = pagination.page;
  var tp = pagination.total_pages;
  var html = '';
  if (p > 1) html += '<button onclick="goLogPage(' + (p-1) + ')" class="px-3 py-1 border rounded text-sm hover:bg-gray-100">이전</button>';
  var start = Math.max(1, p - 2);
  var end = Math.min(tp, start + 4);
  for (var i = start; i <= end; i++) {
    html += '<button onclick="goLogPage(' + i + ')" class="px-3 py-1 border rounded text-sm ' + (i === p ? 'bg-blue-600 text-white' : 'hover:bg-gray-100') + '">' + i + '</button>';
  }
  if (p < tp) html += '<button onclick="goLogPage(' + (p+1) + ')" class="px-3 py-1 border rounded text-sm hover:bg-gray-100">다음</button>';
  html += '<span class="text-sm text-gray-500 ml-2">' + p + ' / ' + tp + ' (' + pagination.total + '건)</span>';
  container.innerHTML = html;
}

function goLogPage(n) {
  currentPage = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  loadLogs();
}

loadLogs();
