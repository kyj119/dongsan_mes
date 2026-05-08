var quotCurrentPage = 1;
var quotCurrentStatusFilter = '';

// 견적 상태 판별
function getQuotStatus(order) {
  if (order.status !== 'QUOTATION') return 'converted';
  if (!order.valid_until) return 'valid';
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var expDate = new Date(order.valid_until);
  expDate.setHours(0, 0, 0, 0);
  return expDate < today ? 'expired' : 'valid';
}

function getQuotStatusBadge(order) {
  var s = getQuotStatus(order);
  if (s === 'converted') return '<span class="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">전환됨</span>';
  if (s === 'expired')   return '<span class="px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600">만료</span>';
  return '<span class="px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">유효</span>';
}

function filterByQuotStatus(s) {
  quotCurrentStatusFilter = s;
  document.getElementById('quotStatusFilter').value = s;
  loadQuotations(1);
}

async function loadStats() {
  try {
    var res = await axios.get('/api/orders?status=QUOTATION&limit=500&page=1');
    if (!res.data.success) return;
    var orders = res.data.data || [];
    var total = orders.length;
    var valid = 0, expired = 0, amount = 0;
    orders.forEach(function(o) {
      var s = getQuotStatus(o);
      if (s === 'valid') valid++;
      if (s === 'expired') expired++;
      amount += parseFloat(o.final_amount) || 0;
    });
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statValid').textContent = valid;
    document.getElementById('statExpired').textContent = expired;
    document.getElementById('statAmount').textContent = amount.toLocaleString() + '원';
  } catch(e) { console.error('loadStats error:', e); }
}

async function loadQuotations(page) {
  quotCurrentPage = page || 1;
  var client = document.getElementById('quotClientSearch').value;
  var dateFrom = document.getElementById('quotDateFrom').value;
  var dateTo = document.getElementById('quotDateTo').value;
  var statusUI = document.getElementById('quotStatusFilter').value;

  // QUOTATION 상태 고정, 추가 필터는 클라이언트 측 처리
  var url = '/api/orders?status=QUOTATION&page=' + quotCurrentPage + '&limit=20';
  if (client) url += '&search=' + encodeURIComponent(client);
  if (dateFrom) url += '&date_from=' + encodeURIComponent(dateFrom);
  if (dateTo) url += '&date_to=' + encodeURIComponent(dateTo);

  try {
    var res = await axios.get(url);
    if (res.data.success) {
      var orders = res.data.data || [];

      // 클라이언트 측 상태 필터 (유효/만료/전환됨)
      if (statusUI) {
        orders = orders.filter(function(o) { return getQuotStatus(o) === statusUI; });
      }

      renderQuotationTable(orders);
      renderQuotPagination(res.data.pagination);
    }
  } catch(e) {
    console.error('loadQuotations error:', e);
    document.getElementById('quotTableBody').innerHTML =
      '<tr><td colspan="7" class="px-4 py-8 text-center text-red-500">불러오기 실패</td></tr>';
  }
}

function renderQuotationTable(orders) {
  var tbody = document.getElementById('quotTableBody');
  if (!orders || orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">견적 내역이 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(function(o) {
    var quotStat = getQuotStatus(o);
    var badge = getQuotStatusBadge(o);
    var validUntilCell = o.valid_until
      ? '<span class="' + (quotStat === 'expired' ? 'text-red-500 font-medium' : 'text-teal-700') + '">' + o.valid_until + '</span>'
      : '<span class="text-gray-400">-</span>';
    var createdDate = (o.created_at || '').substring(0, 10);
    var amount = (parseFloat(o.final_amount) || 0).toLocaleString() + '원';

    var actions = '<div class="flex gap-1 items-center">';
    actions += '<button onclick="viewQuotation(' + o.id + ')" class="text-blue-600 hover:text-blue-900 mr-2"><i class="fas fa-eye"></i> 상세</button>';
    if (quotStat !== 'converted') {
      actions += '<a href="/quotation-form/' + o.id + '" class="text-green-600 hover:text-green-900 mr-2"><i class="fas fa-edit"></i> 수정</a>';
    }
    actions += '<a href="/quotation/' + o.id + '" target="_blank" class="text-purple-600 hover:text-purple-900 mr-2"><i class="fas fa-print"></i> 인쇄</a>';
    if (quotStat !== 'converted') {
      actions += '<button onclick="deleteQuotation(' + o.id + ')" class="text-red-400 hover:text-red-700"><i class="fas fa-trash"></i></button>';
    }
    actions += '</div>';

    return '<tr class="border-t hover:bg-gray-50 cursor-pointer" ondblclick="viewQuotation(' + o.id + ')">'
      + '<td class="px-4 py-3 font-medium text-teal-700">' + (o.order_number || '-') + '</td>'
      + '<td class="px-4 py-3">' + (o.client_name || '-') + '</td>'
      + '<td class="px-4 py-3 text-right font-medium">' + amount + '</td>'
      + '<td class="px-4 py-3 text-center">' + validUntilCell + '</td>'
      + '<td class="px-4 py-3 text-center">' + badge + '</td>'
      + '<td class="px-4 py-3 text-center text-gray-500">' + createdDate + '</td>'
      + '<td class="px-4 py-3">' + actions + '</td>'
      + '</tr>';
  }).join('');
}

function renderQuotPagination(p) {
  var container = document.getElementById('quotPagination');
  if (!p || p.total_pages <= 1) { container.innerHTML = ''; return; }
  var html = '';
  for (var i = 1; i <= p.total_pages; i++) {
    html += '<button onclick="loadQuotations(' + i + ')" class="px-3 py-1 mx-1 rounded '
      + (i === p.page ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300')
      + ' text-sm">' + i + '</button>';
  }
  container.innerHTML = html;
}

async function viewQuotation(id) {
  try {
    var res = await axios.get('/api/orders/' + id + '/invoice');
    if (!res.data.success) { showToast('불러오기 실패: ' + (res.data.error || ''), 'error'); return; }
    var data = res.data.data;
    var order = data.order || {};
    var client = data.client || {};
    var items = (data.items || []).filter(function(it) { return !it.parent_item_id; });

    var totalAmount = 0;
    var itemRows = items.map(function(it) {
      var amt = parseFloat(it.amount) || 0;
      totalAmount += amt;
      var spec = (it.width && it.height) ? it.width + 'x' + it.height + 'cm' : '';
      var nameDisplay = (it.item_name || '-') + (spec ? ' <span class="text-gray-400 text-xs">[' + spec + ']</span>' : '');
      return '<tr class="border-t">'
        + '<td class="px-3 py-2">' + nameDisplay + '</td>'
        + '<td class="px-3 py-2 text-center text-gray-500">' + (it.spec || spec || '-') + '</td>'
        + '<td class="px-3 py-2 text-center">' + (it.quantity || 0) + '</td>'
        + '<td class="px-3 py-2 text-right">' + (parseFloat(it.unit_price) || 0).toLocaleString() + '</td>'
        + '<td class="px-3 py-2 text-right font-medium">' + amt.toLocaleString() + '</td>'
        + '</tr>';
    }).join('');

    var quotStat = getQuotStatus(order);
    var badge = getQuotStatusBadge(order);
    var validUntilDisplay = order.valid_until
      ? '<span class="' + (quotStat === 'expired' ? 'text-red-500 font-medium' : 'text-teal-700 font-medium') + '">'
        + order.valid_until + (quotStat === 'expired' ? ' (만료)' : '') + '</span>'
      : '-';

    document.getElementById('quotDetailContent').innerHTML =
      '<div class="flex justify-between items-start mb-4">'
      + '<div>'
      + '<h3 class="text-lg font-bold"><i class="fas fa-file-alt text-teal-600 mr-2"></i>'
      + (order.order_number || '') + '</h3>'
      + '<div class="mt-1">' + badge + '</div>'
      + '</div>'
      + '<div class="flex gap-2 items-center">'
      + (quotStat !== 'converted'
        ? '<button onclick="convertToOrder(' + id + ');closeQuotModal()" class="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"><i class="fas fa-exchange-alt mr-1"></i>주문전환</button>'
        : '')
      + '<a href="/quotation/' + id + '" target="_blank" class="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200"><i class="fas fa-print mr-1"></i>인쇄</a>'
      + '<button onclick="closeQuotModal()" class="text-gray-400 hover:text-gray-600 text-2xl ml-2">&times;</button>'
      + '</div>'
      + '</div>'
      + '<div class="grid grid-cols-2 gap-3 mb-4 text-sm bg-gray-50 rounded-lg p-4">'
      + '<div><span class="text-gray-500">거래처:</span> <span class="font-medium">' + (client.client_name || '-') + '</span></div>'
      + '<div><span class="text-gray-500">담당자:</span> ' + (client.contact_name || '-') + '</div>'
      + '<div><span class="text-gray-500">전화:</span> ' + (client.phone || '-') + '</div>'
      + '<div><span class="text-gray-500">유효기한:</span> ' + validUntilDisplay + '</div>'
      + '<div><span class="text-gray-500">작성자:</span> <span class="font-medium">' + (order.created_by_name || '-') + '</span></div>'
      + '<div><span class="text-gray-500">견적금액:</span> <span class="font-bold text-blue-700">' + (parseFloat(order.final_amount) || 0).toLocaleString() + '원</span></div>'
      + '<div><span class="text-gray-500">작성일:</span> ' + ((order.created_at || '').substring(0, 10) || '-') + '</div>'
      + (order.notes ? '<div class="col-span-2"><span class="text-gray-500">비고:</span> ' + escapeHtml(order.notes) + '</div>' : '')
      + '</div>'
      + '<h4 class="font-semibold mb-2 text-sm text-gray-700">견적 품목</h4>'
      + '<div class="overflow-x-auto">'
      + '<table class="w-full text-sm"><thead class="bg-gray-50"><tr>'
      + '<th class="px-3 py-2 text-left">품명</th>'
      + '<th class="px-3 py-2 text-center">규격</th>'
      + '<th class="px-3 py-2 text-center">수량</th>'
      + '<th class="px-3 py-2 text-right">단가</th>'
      + '<th class="px-3 py-2 text-right">금액</th>'
      + '</tr></thead>'
      + '<tbody>' + (itemRows || '<tr><td colspan="5" class="px-3 py-4 text-center text-gray-400">품목 없음</td></tr>') + '</tbody>'
      + '<tfoot class="border-t-2 border-gray-300"><tr>'
      + '<td colspan="4" class="px-3 py-2 text-right font-semibold text-gray-700">합계</td>'
      + '<td class="px-3 py-2 text-right font-bold text-blue-700">' + totalAmount.toLocaleString() + '원</td>'
      + '</tr></tfoot>'
      + '</table></div>';

    document.getElementById('quotDetailModal').classList.remove('hidden');
  } catch(e) {
    showToast('상세 조회 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

function closeQuotModal() {
  document.getElementById('quotDetailModal').classList.add('hidden');
}

async function deleteQuotation(id) {
  if (!(await showConfirm('이 견적서를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.', { danger: true }))) return;
  try {
    var res = await axios.delete('/api/orders/' + id);
    if (res.data.success) {
      showToast('견적서가 삭제되었습니다.', 'success');
      loadStats();
      loadQuotations(quotCurrentPage);
    } else {
      showToast('삭제 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('삭제 중 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

async function convertToOrder(id) {
  if (!(await showConfirm('이 견적서를 주문으로 전환하시겠습니까?\n전환 후 주문 목록에서 확인하실 수 있습니다.'))) return;
  try {
    var res = await axios.post('/api/orders/' + id + '/convert-to-order');
    if (res.data.success) {
      showToast('주문으로 전환되었습니다.', 'success');
      loadStats();
      loadQuotations(quotCurrentPage);
    } else {
      showToast('전환 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('전환 중 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

// 모달 외부 클릭 시 닫기
document.getElementById('quotDetailModal').addEventListener('click', function(e) {
  if (e.target === this) this.classList.add('hidden');
});

// 초기 로드
loadStats();
loadQuotations(1);
