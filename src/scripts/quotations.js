var quotCurrentPage = 1;
var quotCurrentStatusFilter = '';

// 견적 상태 판별 (Phase 3.2: quotations 테이블 직접 사용)
// status: ACTIVE / EXPIRED / CANCELLED + converted_count로 전환 여부
function getQuotStatus(q) {
  if (q.status === 'CANCELLED') return 'cancelled';
  if (q.status === 'EXPIRED') return 'expired';
  // ACTIVE — converted_count가 있어도 ACTIVE (1:N이라 여러 주문 가능)
  if (q.actual_order_count > 0 || q.converted_count > 0) return 'partial';
  return 'valid';
}

function getQuotStatusBadge(q) {
  var s = getQuotStatus(q);
  if (s === 'cancelled') return '<span class="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">취소</span>';
  if (s === 'partial')   return '<span class="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">주문생성 ' + (q.actual_order_count || q.converted_count || 0) + '건</span>';
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
    // 서버 집계 사용 (limit=500 fetch 후 클라 합산 → 상한 초과 시 수치 조용히 축소 제거)
    var res = await axios.get('/api/quotations/stats');
    if (!res.data.success) return;
    var d = res.data.data || {};
    var elT = document.getElementById('statTotal');
    var elV = document.getElementById('statValid');
    var elE = document.getElementById('statExpired');
    var elA = document.getElementById('statAmount');
    if (elT) elT.textContent = d.total || 0;
    if (elV) elV.textContent = d.valid || 0;
    if (elE) elE.textContent = d.expired || 0;
    if (elA) elA.textContent = (d.amount || 0).toLocaleString() + '원';
  } catch(e) { console.error('loadStats error:', e); }
}

async function loadQuotations(page) {
  quotCurrentPage = page || 1;
  var client = document.getElementById('quotClientSearch').value;
  var statusUI = document.getElementById('quotStatusFilter').value;

  var url = '/api/quotations?page=' + quotCurrentPage + '&limit=20';
  if (client) url += '&search=' + encodeURIComponent(client);
  if (statusUI === 'expired') url += '&status=EXPIRED';
  else if (statusUI === 'cancelled') url += '&status=CANCELLED';
  else if (statusUI === 'valid') url += '&status=ACTIVE';

  try {
    // #421: 로딩 표시(일관 포맷)
    var _quotTb = document.getElementById('quotTableBody');
    if (_quotTb && window.dsSkeleton) _quotTb.innerHTML = window.dsSkeleton.loadingRow(8);
    var res = await axios.get(url);
    if (res.data.success) {
      var quotations = res.data.data || [];

      // 추가 클라이언트 필터: partial (주문 생성됨) — 별도 API 파라미터 없음
      if (statusUI === 'partial') {
        quotations = quotations.filter(function(q) { return getQuotStatus(q) === 'partial'; });
      }

      renderQuotationTable(quotations);
      renderQuotPagination(res.data.pagination);
    }
  } catch(e) {
    console.error('loadQuotations error:', e);
    document.getElementById('quotTableBody').innerHTML =
      '<tr><td colspan="8" class="px-4 py-8 text-center text-red-500">불러오기 실패</td></tr>';
  }
}

function renderQuotationTable(orders) {
  var tbody = document.getElementById('quotTableBody');
  if (!orders || orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="ds-empty"><i class="fas fa-file-invoice"></i><p>견적 내역이 없습니다</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(function(q) {
    var quotStat = getQuotStatus(q);
    var badge = getQuotStatusBadge(q);
    var validUntilCell = q.valid_until
      ? '<span class="' + (quotStat === 'expired' ? 'text-red-500 font-medium' : 'text-blue-700') + '">' + q.valid_until + '</span>'
      : '<span class="text-gray-400">-</span>';
    var createdDate = (q.created_at || '').substring(0, 10);
    var amount = (parseFloat(q.final_amount) || 0).toLocaleString() + '원';

    var spec = (q.main_item_width && q.main_item_height) ? ' <span class="text-xs text-gray-500">[' + q.main_item_width + '×' + q.main_item_height + ']</span>' : '';
    var itemMore = (q.item_count > 1) ? ' <span class="text-xs text-gray-400">외 ' + (q.item_count - 1) + '건</span>' : '';
    var itemCell = '<div class="truncate" title="' + escapeHtml(q.main_item_name || '') + '">'
      + (q.main_item_name ? escapeHtml(q.main_item_name) : '<span class="text-gray-400">-</span>') + spec + itemMore + '</div>';

    var actions = '<div class="flex gap-3 items-center justify-center">';
    actions += '<button onclick="event.stopPropagation();viewQuotation(' + q.id + ')" class="text-blue-600 hover:text-blue-900" title="상세"><i class="fas fa-eye"></i></button>';
    if (quotStat !== 'cancelled') {
      actions += '<a href="/quotation-form/' + q.id + '" onclick="event.stopPropagation()" class="text-green-600 hover:text-green-900" title="수정"><i class="fas fa-edit"></i></a>';
    }
    actions += '<a href="/quotation/' + q.id + '" target="_blank" onclick="event.stopPropagation()" class="text-blue-600 hover:text-blue-900" title="인쇄"><i class="fas fa-print"></i></a>';
    if (quotStat !== 'cancelled') {
      actions += '<button onclick="event.stopPropagation();deleteQuotation(' + q.id + ')" class="text-red-400 hover:text-red-700" title="삭제"><i class="fas fa-trash"></i></button>';
    }
    actions += '</div>';

    return '<tr class="border-t hover:bg-gray-50 cursor-pointer" ondblclick="viewQuotation(' + q.id + ')">'
      + '<td class="font-medium text-blue-700">' + escapeHtml(q.quotation_number || '-') + '</td>'
      + '<td>' + escapeHtml(q.client_name || '-') + '</td>'
      + '<td>' + itemCell + '</td>'
      + '<td class="text-right font-medium">' + amount + '</td>'
      + '<td class="text-center">' + validUntilCell + '</td>'
      + '<td class="text-center">' + badge + '</td>'
      + '<td class="text-center text-gray-500">' + createdDate + '</td>'
      + '<td class="quot-act">' + actions + '</td>'
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
    var res = await axios.get('/api/quotations/' + id);
    if (!res.data.success) { showToast('불러오기 실패: ' + (res.data.error || ''), 'error'); return; }
    var q = res.data.data || {};
    var order = q;  // 기존 변수명 호환
    var client = { client_name: q.client_name, contact_name: '', phone: '', business_registration_number: q.business_registration_number, address: q.address };
    var items = (q.items || []).filter(function(it) { return !it.parent_id; });

    var totalAmount = 0;
    var itemRows = items.map(function(it) {
      var amt = parseFloat(it.amount) || 0;
      totalAmount += amt;
      var spec = (it.width && it.height) ? it.width + 'x' + it.height + 'cm' : '';
      var nameDisplay = escapeHtml(it.item_name || '-') + (spec ? ' <span class="text-gray-400 text-xs">[' + spec + ']</span>' : '');
      return '<tr class="border-t">'
        + '<td class="px-3 py-2" title="' + escapeHtml(it.item_name || '') + '">' + nameDisplay + '</td>'
        + '<td class="px-3 py-2 text-center text-gray-500">' + escapeHtml(it.spec || spec || '-') + '</td>'
        + '<td class="px-3 py-2 text-center">' + (it.quantity || 0) + '</td>'
        + '<td class="px-3 py-2 text-right">' + (parseFloat(it.unit_price) || 0).toLocaleString() + '</td>'
        + '<td class="px-3 py-2 text-right font-medium">' + amt.toLocaleString() + '</td>'
        + '</tr>';
    }).join('');

    var quotStat = getQuotStatus(order);
    var badge = getQuotStatusBadge(order);
    var validUntilDisplay = order.valid_until
      ? '<span class="' + (quotStat === 'expired' ? 'text-red-500 font-medium' : 'text-blue-700 font-medium') + '">'
        + order.valid_until + (quotStat === 'expired' ? ' (만료)' : '') + '</span>'
      : '-';

    document.getElementById('quotDetailContent').innerHTML =
      '<div class="flex justify-between items-start mb-4">'
      + '<div>'
      + '<h3 class="text-lg font-bold"><i class="fas fa-file-alt text-blue-600 mr-2"></i>'
      + escapeHtml(order.quotation_number || order.order_number || '') + '</h3>'
      + '<div class="mt-1">' + badge + '</div>'
      + '</div>'
      + '<div class="flex gap-2 items-center">'
      + (quotStat !== 'cancelled'
        ? '<button onclick="convertToOrder(' + id + ');closeQuotModal()" class="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"><i class="fas fa-exchange-alt mr-1"></i>주문 생성</button>'
        : '')
      + '<a href="/quotation/' + id + '" target="_blank" class="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200"><i class="fas fa-print mr-1"></i>인쇄</a>'
      + '<button onclick="closeQuotModal()" class="text-gray-400 hover:text-gray-600 text-2xl ml-2">&times;</button>'
      + '</div>'
      + '</div>'
      + '<div class="grid grid-cols-2 gap-3 mb-4 text-sm bg-gray-50 rounded-lg p-4">'
      + '<div><span class="text-gray-500">거래처:</span> <span class="font-medium">' + escapeHtml(client.client_name || '-') + '</span></div>'
      + '<div><span class="text-gray-500">담당자:</span> ' + escapeHtml(client.contact_name || '-') + '</div>'
      + '<div><span class="text-gray-500">전화:</span> ' + escapeHtml(client.phone || '-') + '</div>'
      + '<div><span class="text-gray-500">유효기한:</span> ' + validUntilDisplay + '</div>'
      + '<div><span class="text-gray-500">작성자:</span> <span class="font-medium">' + escapeHtml(order.created_by_name || '-') + '</span></div>'
      + '<div><span class="text-gray-500">견적금액:</span> <span class="font-bold text-blue-700">' + (parseFloat(order.final_amount) || 0).toLocaleString() + '원</span></div>'
      + '<div><span class="text-gray-500">작성일:</span> ' + ((order.created_at || '').substring(0, 10) || '-') + '</div>'
      + (order.notes ? '<div class="col-span-2"><span class="text-gray-500">비고:</span> ' + escapeHtml(order.notes) + '</div>' : '')
      + '</div>'
      + '<h4 class="font-semibold mb-2 text-sm text-gray-700">견적 품목</h4>'
      + '<div class="overflow-x-auto">'
      + '<table class="ds-table ds-table-striped ds-table-fixed text-sm"><thead class="bg-gray-50"><tr>'
      + '<th class="col-name px-3 py-2 text-left">품명</th>'
      + '<th class="col-tag px-3 py-2 text-center">규격</th>'
      + '<th class="col-qty px-3 py-2 text-center">수량</th>'
      + '<th class="col-amount px-3 py-2 text-right">단가</th>'
      + '<th class="col-amount px-3 py-2 text-right">금액</th>'
      + '</tr></thead>'
      + '<tbody>' + (itemRows || '<tr><td colspan="5" class="px-3 py-4 text-center text-gray-400">품목 없음</td></tr>') + '</tbody>'
      + '<tfoot class="border-t-2 border-gray-300"><tr>'
      + '<td colspan="4" class="px-3 py-2 text-right font-semibold text-gray-700">합계</td>'
      + '<td class="px-3 py-2 text-right font-bold text-blue-700">' + totalAmount.toLocaleString() + '원</td>'
      + '</tr></tfoot>'
      + '</table></div>';

    // Phase 3.2: 이 견적서로 만들어진 주문 목록 표시
    var convertedOrders = q.converted_orders || [];
    if (convertedOrders.length > 0) {
      var ordersHtml = '<h4 class="font-semibold mt-5 mb-2 text-sm text-gray-700">'
        + '<i class="fas fa-link mr-1 text-blue-500"></i>이 견적서로 생성된 주문 (' + convertedOrders.length + '건)</h4>'
        + '<div class="overflow-x-auto"><table class="ds-table ds-table-striped ds-table-fixed text-xs">'
        + '<thead class="bg-blue-50"><tr>'
        + '<th class="col-name px-3 py-2 text-left">주문번호</th>'
        + '<th class="col-status px-3 py-2 text-center">상태</th>'
        + '<th class="col-amount px-3 py-2 text-right">금액</th>'
        + '<th class="col-date px-3 py-2 text-center">생성일</th>'
        + '</tr></thead><tbody>';
      convertedOrders.forEach(function(o) {
        ordersHtml += '<tr class="border-t hover:bg-gray-50">'
          + '<td class="px-3 py-2 font-medium"><a href="/orders/' + o.id + '" class="text-blue-600 hover:underline">' + (o.order_number || '#' + o.id) + '</a></td>'
          + '<td class="px-3 py-2 text-center">' + (o.status ? window.MES_STATUS.orderLabel(o.status) : '-') + '</td>'
          + '<td class="px-3 py-2 text-right">' + (parseFloat(o.final_amount) || 0).toLocaleString() + '원</td>'
          + '<td class="px-3 py-2 text-center text-gray-500">' + ((o.created_at || '').substring(0, 10)) + '</td>'
          + '</tr>';
      });
      ordersHtml += '</tbody></table></div>';
      document.getElementById('quotDetailContent').innerHTML += ordersHtml;
    }

    document.getElementById('quotDetailModal').classList.remove('hidden');
  } catch(e) {
    showToast('상세 조회 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

function closeQuotModal() {
  document.getElementById('quotDetailModal').classList.add('hidden');
}

async function deleteQuotation(id) {
  if (!(await showConfirm('이 견적서를 취소하시겠습니까?\n취소된 견적서는 주문 생성이 불가능합니다.', { danger: true }))) return;
  try {
    var res = await axios.delete('/api/quotations/' + id);
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

// 견적서 → 주문 전환: 견적 정보를 주문서 입력 양식에 prefill하여 이동.
// 사용자가 납품일 등 추가 정보를 폼에서 입력/검토 후 저장하면 주문이 생성되고,
// orders.quotation_id로 견적서와 자동 연결된다 (orderForm: loadQuotationForPrefill).
function convertToOrder(id) {
  window.location.href = '/order-form?quotation_id=' + id;
}

// 모달 외부 클릭 시 닫기
document.getElementById('quotDetailModal').addEventListener('click', function(e) {
  if (e.target === this) this.classList.add('hidden');
});

// 초기 로드
loadStats();
loadQuotations(1);
