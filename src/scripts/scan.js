// QR/바코드 스캔 클라이언트 (#80)
// html5-qrcode 기반 카메라 스캔 + 수동 입력 폴백

var scanner = null;
var currentResult = null;
var isScanning = false;

// ── html5-qrcode CDN 동적 로드 ──
(function loadHtml5Qrcode() {
  if (typeof Html5Qrcode !== 'undefined') return;
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
  s.async = true;
  document.head.appendChild(s);
})();

// ── 초기화 ──
function initScanner() {
  var startBtn = document.getElementById('startScanBtn');
  var stopBtn = document.getElementById('stopScanBtn');
  var manualInput = document.getElementById('manualCodeInput');
  var manualBtn = document.getElementById('manualLookupBtn');

  if (startBtn) startBtn.addEventListener('click', startScan);
  if (stopBtn) stopBtn.addEventListener('click', stopScan);
  if (manualBtn) manualBtn.addEventListener('click', manualLookup);
  if (manualInput) manualInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') manualLookup();
  });
}

// ── 카메라 스캔 시작 ──
function startScan() {
  var readerEl = document.getElementById('qr-reader');
  if (!readerEl) return;

  document.getElementById('startScanBtn').classList.add('hidden');
  document.getElementById('stopScanBtn').classList.remove('hidden');
  document.getElementById('scanPlaceholder').classList.add('hidden');
  readerEl.classList.remove('hidden');

  if (typeof Html5Qrcode === 'undefined') {
    showToast('QR 스캐너 라이브러리 로딩 중...', 'warning');
    return;
  }

  scanner = new Html5Qrcode('qr-reader');
  isScanning = true;

  scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
    function(decodedText) {
      // 스캔 성공 — 중복 방지
      if (currentResult && currentResult._lastCode === decodedText) return;
      navigator.vibrate && navigator.vibrate(100);
      lookupCode(decodedText);
    },
    function() { /* scan miss — 무시 */ }
  ).catch(function(err) {
    console.error('[scan] Camera error:', err);
    showToast('카메라 접근 실패. HTTPS가 필요하거나 권한이 거부되었습니다.', 'error');
    stopScan();
  });
}

// ── 스캔 중지 ──
function stopScan() {
  document.getElementById('startScanBtn').classList.remove('hidden');
  document.getElementById('stopScanBtn').classList.add('hidden');
  document.getElementById('scanPlaceholder').classList.remove('hidden');
  document.getElementById('qr-reader').classList.add('hidden');

  if (scanner && isScanning) {
    scanner.stop().then(function() {
      scanner.clear();
      scanner = null;
      isScanning = false;
    }).catch(function() {
      scanner = null;
      isScanning = false;
    });
  }
}

// ── 수동 입력 조회 ──
function manualLookup() {
  var input = document.getElementById('manualCodeInput');
  var code = (input.value || '').trim();
  if (!code) { showToast('코드를 입력하세요.', 'warning'); return; }
  lookupCode(code);
}

// ── 코드 조회 API ──
function lookupCode(code) {
  var resultPanel = document.getElementById('resultPanel');
  var resultContent = document.getElementById('resultContent');
  resultPanel.classList.remove('hidden');
  resultContent.innerHTML = '<div class="text-center py-6 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i><p class="mt-2 text-sm">조회 중...</p></div>';

  axios.get('/api/scan/' + encodeURIComponent(code)).then(function(r) {
    currentResult = r.data.data;
    currentResult._lastCode = code;
    renderResult(currentResult);
  }).catch(function(e) {
    var msg = (e.response && e.response.data && e.response.data.error) || '코드를 인식할 수 없습니다.';
    resultContent.innerHTML = '<div class="text-center py-6"><i class="fas fa-exclamation-triangle text-3xl text-yellow-500"></i><p class="mt-2 text-sm text-gray-600">' + escHtml(msg) + '</p><p class="text-xs text-gray-400 mt-1">코드: ' + escHtml(code) + '</p></div>';
  });
}

// ── 결과 렌더링 ──
function renderResult(data) {
  var html = '';

  // 타입 뱃지
  var typeBadge = {
    'CARD': '<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-50 text-blue-700"><i class="fas fa-id-card mr-1"></i>카드</span>',
    'ITEM': '<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-50 text-green-700"><i class="fas fa-box mr-1"></i>품목</span>',
    'EQUIPMENT': '<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700"><i class="fas fa-server mr-1"></i>장비</span>',
    'ORDER': '<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-50 text-amber-700"><i class="fas fa-file-alt mr-1"></i>주문</span>',
  };

  html += '<div class="mb-4">';
  html += (typeBadge[data.type] || '') + '<span class="ml-2 text-lg font-bold text-gray-800">' + escHtml(data.label) + '</span>';
  html += '</div>';

  // 상세 정보 테이블
  html += '<div class="bg-gray-50 rounded-lg p-4 mb-4">';
  html += '<table class="w-full text-sm">';
  var labels = getDetailLabels(data.type);
  Object.keys(data.detail).forEach(function(key) {
    var val = data.detail[key];
    if (val == null) return;
    var label = labels[key] || key;
    var displayVal = formatDetailValue(key, val, data.type);
    html += '<tr class="border-b border-gray-200 last:border-0">';
    html += '<td class="py-2 pr-4 text-gray-500 font-medium whitespace-nowrap">' + escHtml(label) + '</td>';
    html += '<td class="py-2 text-gray-800">' + displayVal + '</td>';
    html += '</tr>';
  });
  html += '</table>';
  html += '</div>';

  // 액션 버튼
  if (data.actions && data.actions.length > 0) {
    html += '<div class="grid grid-cols-2 gap-3">';
    data.actions.forEach(function(action) {
      var btnClass = action.key === 'detail' ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-blue-600 text-white hover:bg-blue-700';
      html += '<button onclick="executeScanAction(\'' + action.key + '\')" class="flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-sm transition-colors min-h-[48px] ' + btnClass + '">';
      html += '<i class="fas ' + action.icon + '"></i>' + escHtml(action.label);
      html += '</button>';
    });
    html += '</div>';
  }

  document.getElementById('resultContent').innerHTML = html;
}

function getDetailLabels(type) {
  var common = {
    card_number: '카드번호', status: '상태', order_number: '주문번호',
    client_name: '거래처', item_name: '품목명', quantity: '수량',
    shipped_at: '출고일시', created_at: '생성일',
    item_code: '품목코드', item_type: '유형', item_group: '그룹',
    unit: '단위', specification: '규격', base_price: '기준가', sales_price: '판매가',
    name: '장비명', equipment_type: '유형', location: '위치',
    manufacturer: '제조사', order_date: '주문일', total_amount: '총액',
  };
  return common;
}

function formatDetailValue(key, val, type) {
  // 상태 뱃지
  if (key === 'status') {
    // 카드/주문 라벨 = 단일 소스(window.MES_STATUS). CSS 클래스 + 장비/보조 상태만 로컬.
    var cls = {
      PRINT_PENDING: 'badge-warning', PRINTING: 'badge-info', PRINT_DONE: 'badge-success', SHIPPED: 'badge-success',
      PP_DONE: 'badge-success', CONFIRMED: 'badge-info', IN_PRODUCTION: 'badge-warning',
      ACTIVE: 'badge-success', IDLE: 'badge-secondary', MAINTENANCE: 'badge-warning'
    };
    var extra = { PP_DONE: '후가공 완료', IN_PRODUCTION: '생산중', ACTIVE: '가동중', IDLE: '대기', MAINTENANCE: '정비중' };
    var S = window.MES_STATUS;
    var label = S.cardLabels[val] || S.orderLabels[val] || extra[val];
    if (!label) return '<span class="badge-status badge-secondary">' + escHtml(val) + '</span>';
    return '<span class="badge-status ' + (cls[val] || 'badge-secondary') + '">' + label + '</span>';
  }
  // 금액
  if (key === 'total_amount' || key === 'base_price' || key === 'sales_price') {
    return '₩' + Number(val).toLocaleString('ko-KR');
  }
  // 수량
  if (key === 'quantity') {
    return '<span class="font-semibold">' + Number(val).toLocaleString('ko-KR') + '</span>';
  }
  // 날짜
  if (key === 'shipped_at' || key === 'created_at' || key === 'order_date') {
    return formatKST(val);
  }
  return escHtml(String(val));
}

// ── 액션 실행 ──
window.executeScanAction = function(actionKey) {
  if (!currentResult) return;

  // 상세보기 → 해당 페이지로 이동
  if (actionKey === 'detail') {
    var url = getDetailUrl(currentResult.type, currentResult.id, currentResult.detail);
    if (url) window.navigateTo(url);
    return;
  }

  // 수량 입력 필요한 액션
  if (actionKey === 'stock-in' || actionKey === 'stock-out') {
    showQuantityModal(actionKey);
    return;
  }

  // 확인 후 실행
  var actionLabel = '';
  currentResult.actions.forEach(function(a) { if (a.key === actionKey) actionLabel = a.label; });
  showConfirm(actionLabel + ' 처리하시겠습니까?').then(function(ok) {
    if (!ok) return;
    executeAction(actionKey);
  });
};

function getDetailUrl(type, id, detail) {
  switch (type) {
    case 'CARD': return '/cards';
    case 'ITEM': return '/items';
    case 'EQUIPMENT': return '/equipment';
    case 'ORDER': return '/orders';
    default: return null;
  }
}

function showQuantityModal(actionKey) {
  var label = actionKey === 'stock-in' ? '입고' : '출고';
  var modal = document.getElementById('quantityModal');
  var title = document.getElementById('qtyModalTitle');
  var input = document.getElementById('qtyInput');
  title.textContent = label + ' 수량 입력';
  input.value = '';
  input.placeholder = label + ' 수량';
  modal.dataset.action = actionKey;
  modal.classList.add('show');
  setTimeout(function() { input.focus(); }, 100);
}

window.closeQuantityModal = function() {
  document.getElementById('quantityModal').classList.remove('show');
};

window.confirmQuantity = function() {
  var modal = document.getElementById('quantityModal');
  var qty = parseInt(document.getElementById('qtyInput').value);
  var actionKey = modal.dataset.action;
  if (!qty || qty <= 0) { showToast('올바른 수량을 입력하세요.', 'warning'); return; }
  closeQuantityModal();
  executeAction(actionKey, qty);
};

function executeAction(actionKey, quantity) {
  var payload = {
    type: currentResult.type,
    id: currentResult.id,
    action: actionKey,
  };
  if (quantity) payload.quantity = quantity;

  axios.post('/api/scan/action', payload).then(function(r) {
    showToast(r.data.message || '완료', 'success');
    // 결과 새로고침
    if (currentResult._lastCode) {
      lookupCode(currentResult._lastCode);
    }
  }).catch(function(e) {
    var msg = (e.response && e.response.data && e.response.data.error) || '처리 실패';
    showToast(msg, 'error');
  });
}

var escHtml = window.escapeHtml || function(str) {
  return String(str == null ? '' : str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
};

// ── 시작 ──
initScanner();
