// ============================================================================
// 고객 포털 주문 내역 스크립트
// ============================================================================

// Skeleton loading
(function() {
  var el = document.getElementById('orders-tbody');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(5, 6);
})();

var STATUS_MAP = {
  'QUOTATION': { label: '견적', color: 'gray', step: 0 },
  'CONFIRMED': { label: '확정', color: 'blue', step: 1 },
  'PRINTING': { label: '생산 중', color: 'amber', step: 2 },
  'PRINT_DONE': { label: '출력 완료', color: 'green', step: 3 },
  'SHIPPED': { label: '출고', color: 'green', step: 4 },
  'HOLD': { label: '보류', color: 'red', step: -1 },
  'CANCELLED': { label: '취소', color: 'red', step: -1 }
};

// 상태별 뱃지 클래스
var STATUS_BADGE_CLS = {
  'QUOTATION': 'bg-gray-100 text-gray-600',
  'CONFIRMED': 'bg-blue-100 text-blue-800',
  'PRINTING': 'bg-amber-50 text-amber-700',
  'PRINT_DONE': 'bg-green-50 text-green-700',
  'SHIPPED': 'bg-green-100 text-green-800',
  'HOLD': 'bg-red-50 text-red-700',
  'CANCELLED': 'bg-gray-100 text-gray-400'
};

var currentPage = 1;

// ─── 진행 바 (목록용) ─────────────────────────────────────────────────────────

function renderProgressBar(status) {
  var info = STATUS_MAP[status] || { label: status, step: 0 };
  var currentStep = Math.max(0, info.step);

  var html = '<div class="flex items-center gap-0.5 mt-1.5">';
  for (var i = 1; i <= 4; i++) {
    var active = i <= currentStep;
    html += '<div class="h-1.5 flex-1 rounded-full ' + (active ? 'bg-blue-500' : 'bg-gray-200') + '"></div>';
  }
  html += '</div>';
  return html;
}

// ─── 배송 조회 버튼 (목록용) ─────────────────────────────────────────────────

function renderTrackingButton(tracking_number, courier_name) {
  if (!tracking_number) return '';
  var url = '';
  if (/한진/.test(courier_name || '')) {
    url = 'https://trace.hanjin.co.kr/newinfo/gonsang/tracking?waybillNo=' + tracking_number;
  } else if (/대신/.test(courier_name || '')) {
    return '<span class="text-xs text-gray-500"><i class="fas fa-truck mr-1"></i>' + tracking_number + '</span>';
  }
  if (url) {
    return '<a href="' + url + '" target="_blank" onclick="event.stopPropagation()" class="inline-flex items-center px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100"><i class="fas fa-truck mr-1"></i>배송 조회</a>';
  }
  return '<span class="text-xs text-gray-500">' + tracking_number + '</span>';
}

// ─── 진행 스테퍼 (상세 모달용) ───────────────────────────────────────────────

function renderStepper(status) {
  var steps = [
    { key: 'CONFIRMED', icon: 'fa-check-circle', label: '확정' },
    { key: 'PRINTING', icon: 'fa-print', label: '생산' },
    { key: 'PRINT_DONE', icon: 'fa-check-double', label: '출력완료' },
    { key: 'SHIPPED', icon: 'fa-shipping-fast', label: '출고' }
  ];
  var info = STATUS_MAP[status] || { step: 0 };
  var currentStep = info.step;

  var html = '<div class="flex items-center justify-between mb-6 px-2">';
  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];
    var stepNum = i + 1;
    var isActive = stepNum <= currentStep;
    var isCurrent = stepNum === currentStep;

    // 원형 아이콘
    html += '<div class="flex flex-col items-center min-w-0">';
    html += '<div class="w-9 h-9 rounded-full flex items-center justify-center text-sm flex-shrink-0 '
      + (isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400')
      + (isCurrent ? ' ring-2 ring-offset-1 ring-blue-300' : '') + '">';
    html += '<i class="fas ' + step.icon + '"></i></div>';
    html += '<span class="text-xs mt-1 text-center ' + (isActive ? 'text-blue-600 font-medium' : 'text-gray-400') + '">' + step.label + '</span>';
    html += '</div>';

    // 연결선 (마지막 제외)
    if (i < steps.length - 1) {
      html += '<div class="flex-1 h-0.5 mx-1 mb-5 ' + (stepNum < currentStep ? 'bg-blue-500' : 'bg-gray-200') + '"></div>';
    }
  }
  html += '</div>';

  // 보류/취소 상태 배너
  if (status === 'HOLD') {
    html += '<div class="text-center mb-4"><span class="px-3 py-1 bg-red-50 text-red-700 rounded-full text-sm font-medium"><i class="fas fa-pause-circle mr-1"></i>보류 중</span></div>';
  } else if (status === 'CANCELLED') {
    html += '<div class="text-center mb-4"><span class="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-sm font-medium"><i class="fas fa-times-circle mr-1"></i>취소됨</span></div>';
  }

  return html;
}

// ─── 배송 정보 섹션 (상세 모달용) ────────────────────────────────────────────

function renderShipmentInfo(shipments) {
  if (!shipments || !shipments.length) return '';

  var html = '<div class="mt-4 pt-4 border-t"><h4 class="text-sm font-semibold text-gray-700 mb-2"><i class="fas fa-truck mr-1"></i>배송 정보</h4>';
  shipments.forEach(function(s) {
    html += '<div class="bg-gray-50 rounded-lg p-3 mb-2">';
    html += '<div class="flex items-center justify-between">';
    html += '<div>';
    if (s.courier_name) html += '<span class="text-sm font-medium">' + s.courier_name + '</span>';
    if (s.tracking_number) html += '<span class="text-sm text-gray-500 ml-2">' + s.tracking_number + '</span>';
    html += '</div>';

    // 배송 조회 버튼
    if (s.tracking_number && /한진/.test(s.courier_name || '')) {
      html += '<a href="https://trace.hanjin.co.kr/newinfo/gonsang/tracking?waybillNo=' + s.tracking_number + '" target="_blank" class="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"><i class="fas fa-search mr-1"></i>배송 조회</a>';
    }
    html += '</div>';
    if (s.shipped_at) {
      html += '<div class="text-xs text-gray-400 mt-1">출고일: ' + s.shipped_at.replace('T', ' ').substring(0, 16) + '</div>';
    }
    html += '</div>';
  });
  html += '</div>';
  return html;
}

// ─── 생산 진행률 (상세 모달용) ───────────────────────────────────────────────

function renderCardProgress(progress) {
  if (!progress || !progress.total) return '';
  var donePlusShipped = (progress.done || 0) + (progress.shipped || 0);
  var pct = Math.round((donePlusShipped / progress.total) * 100);
  return '<div class="mt-3 pt-3 border-t">'
    + '<div class="flex justify-between text-xs text-gray-500 mb-1">'
    + '<span><i class="fas fa-layer-group mr-1"></i>생산 진행률</span>'
    + '<span>' + donePlusShipped + '/' + progress.total + ' (' + pct + '%)</span>'
    + '</div>'
    + '<div class="w-full bg-gray-200 rounded-full h-2">'
    + '<div class="bg-blue-600 h-2 rounded-full transition-all" style="width:' + pct + '%"></div>'
    + '</div>'
    + '</div>';
}

// ─── 주문 목록 ───────────────────────────────────────────────────────────────

async function loadOrders(page) {
  currentPage = page || 1;
  try {
    var res = await axios.get('/api/portal/orders?page=' + currentPage);
    var data = res.data.data;
    renderOrders(data.orders, data.total);
  } catch (e) { console.error(e); }
}

function renderOrders(orders, total) {
  var tbody = document.getElementById('orders-tbody');
  if (!tbody) return;

  if (!orders || orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">주문 내역이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map(function(o) {
    var s = STATUS_MAP[o.status] || { label: o.status, step: 0 };
    var badgeCls = STATUS_BADGE_CLS[o.status] || 'bg-gray-100 text-gray-500';
    var progressBar = (s.step > 0) ? renderProgressBar(o.status) : '';
    var trackingBtn = renderTrackingButton(o.tracking_number, o.courier_name);

    return '<tr class="hover:bg-blue-50 border-b cursor-pointer" onclick="viewOrder(' + o.id + ')">'
      + '<td class="px-3 py-2 text-sm font-mono">' + o.order_number + '</td>'
      + '<td class="px-3 py-2 text-sm">' + (o.order_date || '-') + '</td>'
      + '<td class="px-3 py-2 text-sm">' + (o.due_date || '-') + '</td>'
      + '<td class="px-3 py-2 text-sm">'
      +   '<span class="px-2 py-0.5 rounded text-xs ' + badgeCls + '">' + s.label + '</span>'
      +   progressBar
      + '</td>'
      + '<td class="px-3 py-2 text-sm text-right">' + (o.total_amount ? Number(o.total_amount).toLocaleString() + '원' : '-') + '</td>'
      + '<td class="px-3 py-2 text-sm">'
      +   (trackingBtn || (o.delivery_method || '-'))
      + '</td>'
      + '</tr>';
  }).join('');

  // 페이지네이션
  var totalPages = Math.ceil(total / 20);
  var pagination = document.getElementById('orders-pagination');
  if (pagination && totalPages > 1) {
    var html = '';
    for (var i = 1; i <= totalPages; i++) {
      html += '<button onclick="loadOrders(' + i + ')" class="px-3 py-1 rounded text-sm ' + (i === currentPage ? 'bg-blue-600 text-white' : 'bg-gray-200') + '">' + i + '</button>';
    }
    pagination.innerHTML = html;
  } else if (pagination) {
    pagination.innerHTML = '';
  }
}

// ─── 주문 상세 ───────────────────────────────────────────────────────────────

async function viewOrder(id) {
  try {
    var res = await axios.get('/api/portal/orders/' + id);
    var data = res.data.data;
    showOrderDetail(data.order, data.items, data.shipments, data.card_progress);
  } catch (e) { showToast('조회 실패', 'error'); }
}

function showOrderDetail(order, items, shipments, card_progress) {
  var existing = document.getElementById('order-detail-modal');
  if (existing) existing.remove();

  var s = STATUS_MAP[order.status] || { label: order.status, step: 0 };
  var badgeCls = STATUS_BADGE_CLS[order.status] || 'bg-gray-100 text-gray-500';

  var itemRows = items.map(function(i) {
    return '<tr class="border-b">'
      + '<td class="px-3 py-2 text-sm">' + i.item_name + '</td>'
      + '<td class="px-3 py-2 text-sm">' + (i.width || '-') + ' x ' + (i.height || '-') + '</td>'
      + '<td class="px-3 py-2 text-sm text-right">' + i.quantity + '</td>'
      + '<td class="px-3 py-2 text-sm text-right">' + (i.amount ? Number(i.amount).toLocaleString() + '원' : '-') + '</td>'
      + '</tr>';
  }).join('');

  var stepperHtml = renderStepper(order.status);
  var shipmentHtml = renderShipmentInfo(shipments);
  var progressHtml = renderCardProgress(card_progress);

  var html = '<div id="order-detail-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">'
    + '<div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">'

    // 헤더
    + '<div class="flex justify-between items-start mb-4">'
    +   '<div>'
    +     '<h3 class="text-lg font-bold">주문 상세</h3>'
    +     '<div class="text-sm text-gray-500">' + order.order_number + '</div>'
    +   '</div>'
    +   '<button onclick="document.getElementById(\'order-detail-modal\').remove()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>'
    + '</div>'

    // 진행 스테퍼
    + '<div id="orderStepper">' + stepperHtml + '</div>'

    // 기본 정보 그리드
    + '<div class="grid grid-cols-2 gap-3 mb-4 text-sm">'
    +   '<div><span class="text-gray-500">주문일:</span> ' + (order.order_date || '-') + '</div>'
    +   '<div><span class="text-gray-500">납기일:</span> ' + (order.due_date || '-') + '</div>'
    +   '<div><span class="text-gray-500">상태:</span> <span class="px-2 py-0.5 rounded text-xs ' + badgeCls + '">' + s.label + '</span></div>'
    +   '<div><span class="text-gray-500">총액:</span> ' + (order.total_amount ? Number(order.total_amount).toLocaleString() + '원' : '-') + '</div>'
    + '</div>'

    // 품목 테이블
    + '<table class="w-full mb-2">'
    +   '<thead><tr class="bg-gray-50 border-b text-sm text-gray-500">'
    +     '<th class="px-3 py-2 text-left">품목</th>'
    +     '<th class="px-3 py-2 text-left">규격(cm)</th>'
    +     '<th class="px-3 py-2 text-right">수량</th>'
    +     '<th class="px-3 py-2 text-right">금액</th>'
    +   '</tr></thead>'
    +   '<tbody>' + itemRows + '</tbody>'
    + '</table>'

    // 생산 진행률
    + '<div id="orderCardProgress">' + progressHtml + '</div>'

    // 배송 정보
    + '<div id="orderShipments">' + shipmentHtml + '</div>'

    // 액션 버튼
    + '<div class="flex justify-end space-x-2 mt-4">'
    +   '<button onclick="requestReorder(' + order.id + ')" class="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">'
    +     '<i class="fas fa-redo mr-1"></i>재주문 요청'
    +   '</button>'
    + '</div>'

    + '</div>'
    + '</div>';

  document.body.insertAdjacentHTML('beforeend', html);
}

// ─── 재주문 요청 ─────────────────────────────────────────────────────────────

async function requestReorder(orderId) {
  var desc = prompt('재주문 요청 사항을 입력해주세요:', '이전 주문과 동일하게 재주문 요청합니다.');
  if (!desc) return;

  try {
    await axios.post('/api/portal/reorder', {
      reference_order_id: orderId,
      description: desc,
    });
    document.getElementById('order-detail-modal') && document.getElementById('order-detail-modal').remove();
    showToast('재주문 요청이 접수되었습니다. 담당자가 확인 후 연락드리겠습니다.', 'warning');
  } catch (e) {
    showToast((e.response && e.response.data && e.response.data.error) || '요청 실패', 'error');
  }
}

document.addEventListener('DOMContentLoaded', function() { loadOrders(1); });
