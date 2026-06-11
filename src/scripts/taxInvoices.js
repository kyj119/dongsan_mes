var currentPage = 1;
var cancelTargetId = null;
var modifyTargetId = null;
var unbilledData = [];

var statusLabels = {
  'DRAFT': '작성중',
  'ISSUED': '발행완료',
  'SENT': '전송완료',
  'FAILED': '전송실패',
  'CANCELLED': '취소',
  'NTS_SUCCESS': '국세청 전송성공',
  'NTS_FAILED': '국세청 전송실패'
};
var statusColors = {
  'DRAFT': 'bg-gray-100 text-gray-600',
  'ISSUED': 'bg-blue-50 text-blue-700',
  'SENT': 'bg-green-50 text-green-700',
  'FAILED': 'bg-red-50 text-red-700',
  'CANCELLED': 'bg-gray-100 text-gray-400 line-through',
  'NTS_SUCCESS': 'bg-green-50 text-green-700',
  'NTS_FAILED': 'bg-amber-50 text-amber-700'
};
var statusIcons = {
  'DRAFT': 'far fa-clock',
  'ISSUED': 'fas fa-check',
  'SENT': 'fas fa-check-circle',
  'FAILED': 'fas fa-exclamation-triangle',
  'CANCELLED': 'fas fa-ban',
  'NTS_SUCCESS': 'fas fa-check-circle',
  'NTS_FAILED': 'fas fa-exclamation-triangle'
};

function fmt(n) {
  return (parseFloat(n) || 0).toLocaleString();
}

// ==================== 탭 전환 ====================

function switchMainTab(tab) {
  var tabs = ['billing', 'list', 'unbilled', 'monthly'];
  tabs.forEach(function(t) {
    var btnEl = document.getElementById('mainTab' + t.charAt(0).toUpperCase() + t.slice(1));
    var panelEl = document.getElementById('panel' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btnEl) btnEl.className = 'px-5 py-3 text-sm font-medium border-b-2 '
      + (t === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700');
    if (panelEl) panelEl.classList.toggle('hidden', t !== tab);
  });
  // 하단 바 관리
  var batchBar = document.getElementById('batchBar');
  var batchSpacer = document.getElementById('batchBarSpacer');
  var billingBar = document.getElementById('billingBar');
  var billingSpacer = document.getElementById('billingBarSpacer');
  if (tab !== 'unbilled' && batchBar) { batchBar.classList.remove('visible'); batchSpacer.classList.remove('visible'); }
  if (tab !== 'billing' && billingBar) { billingBar.classList.remove('visible'); billingSpacer.classList.remove('visible'); }
  if (tab === 'billing') loadBillingPendingOrders();
  if (tab === 'list') loadInvoices(1);
  if (tab === 'monthly') {
    var periodEl = document.getElementById('monthlyPeriod');
    if (!periodEl.value) {
      var now = new Date();
      periodEl.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }
  }
}

// ==================== 발행 목록 ====================

async function loadInvoices(page) {
  currentPage = page || 1;
  var status = document.getElementById('statusFilter').value;
  var search = document.getElementById('searchInput').value;
  var dateFrom = document.getElementById('dateFrom').value;
  var dateTo = document.getElementById('dateTo').value;
  var url = '/api/tax-invoices?page=' + currentPage + '&limit=50'
    + '&status=' + encodeURIComponent(status)
    + '&search=' + encodeURIComponent(search)
    + '&date_from=' + encodeURIComponent(dateFrom)
    + '&date_to=' + encodeURIComponent(dateTo);
  var tbody = document.getElementById('invoiceTableBody');
  tbody.innerHTML = '<tr><td colspan="9" class="px-4 py-8 text-center text-gray-400"><i class="fas fa-spinner fa-spin mr-2"></i>로딩 중...</td></tr>';
  try {
    var res = await axios.get(url);
    if (res.data.success) {
      displayInvoices(res.data.data);
      renderPagination(res.data.pagination);
    } else {
      tbody.innerHTML = '<tr><td colspan="9" class="px-4 py-8 text-center text-red-400">불러오기 실패: ' + (res.data.error || '') + '</td></tr>';
    }
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="9" class="px-4 py-8 text-center text-red-400">오류: ' + (e.message || '') + '</td></tr>';
  }
}

// #345: 세금계산서 목록 CSV 내보내기 (현재 필터 기준 전량)
function tiCsvCell(v) {
  var s = (v === null || v === undefined) ? '' : String(v);
  if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
async function exportInvoicesCsv() {
  var status = document.getElementById('statusFilter').value;
  var search = document.getElementById('searchInput').value;
  var dateFrom = document.getElementById('dateFrom').value;
  var dateTo = document.getElementById('dateTo').value;
  var url = '/api/tax-invoices?page=1&limit=1000'
    + '&status=' + encodeURIComponent(status)
    + '&search=' + encodeURIComponent(search)
    + '&date_from=' + encodeURIComponent(dateFrom)
    + '&date_to=' + encodeURIComponent(dateTo);
  try {
    var res = await axios.get(url);
    if (!res.data.success) { showToast('내보내기 실패', 'error'); return; }
    var items = res.data.data || [];
    if (!items.length) { showToast('내보낼 데이터가 없습니다.', 'warning'); return; }
    var headers = ['계산서번호', '주문번호', '거래처', '작성일', '공급가액', '세액', '합계', '상태'];
    var rows = items.map(function(inv) {
      return [
        inv.invoice_number || '',
        inv.order_number || (inv.order_numbers || ''),
        inv.buyer_name || '',
        inv.issue_date || '',
        inv.supply_amount || 0,
        inv.tax_amount || 0,
        inv.total_amount || 0,
        statusLabels[inv.status] || inv.status || ''
      ].map(tiCsvCell).join(',');
    });
    var csv = '﻿' + headers.join(',') + '\n' + rows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'tax_invoices_' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('CSV 다운로드 완료', 'success');
  } catch (e) {
    showToast('내보내기 오류: ' + (e.message || ''), 'error');
  }
}
window.exportInvoicesCsv = exportInvoicesCsv;

function displayInvoices(items) {
  var tbody = document.getElementById('invoiceTableBody');
  if (!items || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="px-4 py-12 text-center">'
      + '<i class="fas fa-file-invoice text-3xl mb-3 block text-gray-300"></i>'
      + '<div class="text-sm text-gray-500 mb-1">세금계산서가 없습니다</div>'
      + '</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(function(inv) {
    var badge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium '
      + (statusColors[inv.status] || 'bg-gray-100 text-gray-600') + '">'
      + '<i class="' + (statusIcons[inv.status] || 'far fa-clock') + ' text-[7px] mr-1"></i>'
      + (statusLabels[inv.status] || inv.status) + '</span>';
    var actions = '<div class="flex gap-1 justify-center">';
    if (inv.status === 'DRAFT') {
      actions += '<button onclick="issueInvoice(' + inv.id + ')" class="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-200" title="발행"><i class="fas fa-paper-plane"></i></button>';
      actions += '<button onclick="deleteInvoice(' + inv.id + ')" class="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-200" title="삭제"><i class="fas fa-trash"></i></button>';
    }
    if (inv.status === 'FAILED') {
      actions += '<button onclick="retryInvoice(' + inv.id + ')" class="px-2 py-1 text-xs bg-amber-50 text-amber-700 rounded hover:bg-amber-200" title="재시도"><i class="fas fa-redo"></i></button>';
    }
    if (inv.status === 'SENT' || inv.status === 'NTS_FAILED') {
      actions += '<button onclick="refreshStatus(' + inv.id + ')" class="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-200" title="상태 새로고침"><i class="fas fa-sync-alt"></i></button>';
    }
    if (inv.status === 'SENT' || inv.status === 'NTS_SUCCESS' || inv.status === 'ISSUED') {
      actions += '<button onclick="openPrintURL(' + inv.id + ')" class="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200" title="인쇄/PDF"><i class="fas fa-print"></i></button>';
    }
    if (inv.status === 'ISSUED' || inv.status === 'SENT' || inv.status === 'NTS_SUCCESS' || inv.status === 'FAILED') {
      actions += '<button onclick="event.stopPropagation();sendTaxInvoiceNotice(' + inv.id + ',\'' + escapeHtml(inv.buyer_name || '') + '\',\'' + escapeHtml(inv.buyer_email || '') + '\',\'' + escapeHtml(inv.invoice_number || '') + '\')" class="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-200" title="발행 알림 발송"><i class="fas fa-paper-plane text-xs"></i></button>';
    }
    if (inv.status === 'ISSUED' || inv.status === 'SENT' || inv.status === 'FAILED') {
      actions += '<button onclick="openCancelModal(' + inv.id + ')" class="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-200" title="취소"><i class="fas fa-ban"></i></button>';
    }
    actions += '</div>';
    var orderCell;
    if (inv.order_count && inv.order_count > 1) {
      var firstNum = (inv.order_numbers || '').split(',')[0].trim() || '-';
      orderCell = firstNum + ' <span class="text-gray-400 text-xs">외 ' + (inv.order_count - 1) + '건</span>';
    } else {
      orderCell = inv.order_number || '-';
    }
    return '<tr class="border-t hover:bg-gray-50 cursor-pointer" ondblclick="viewDetail(' + inv.id + ')">'
      + '<td class="px-4 py-3 font-medium text-sm">' + (inv.invoice_number || '-') + '</td>'
      + '<td class="px-4 py-3 text-sm text-gray-600">' + orderCell + '</td>'
      + '<td class="px-4 py-3 text-sm">' + (inv.buyer_name || '-') + '</td>'
      + '<td class="px-4 py-3 text-center text-sm">' + (inv.issue_date || '-') + '</td>'
      + '<td class="px-4 py-3 text-right text-sm tabular-nums">' + fmt(inv.supply_amount) + '</td>'
      + '<td class="px-4 py-3 text-right text-sm tabular-nums">' + fmt(inv.tax_amount) + '</td>'
      + '<td class="px-4 py-3 text-right text-sm font-medium tabular-nums">' + fmt(inv.total_amount) + '</td>'
      + '<td class="px-4 py-3 text-center">' + badge + '</td>'
      + '<td class="px-4 py-3">' + actions + '</td>'
      + '</tr>';
  }).join('');
}

function renderPagination(p) {
  var el = document.getElementById('pagination');
  if (!p || p.total_pages <= 1) { el.innerHTML = ''; return; }
  var html = '';
  for (var i = 1; i <= p.total_pages; i++) {
    html += '<button onclick="loadInvoices(' + i + ')" class="px-3 py-1 rounded text-sm '
      + (i === p.page ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300') + '">' + i + '</button>';
  }
  el.innerHTML = html;
}

// ==================== 미발행 관리 ====================

async function loadUnbilled() {
  var from = document.getElementById('unbilledFrom').value;
  var to = document.getElementById('unbilledTo').value;
  if (!from || !to) { showToast('기간을 선택하세요.', 'warning'); return; }
  var accordion = document.getElementById('unbilledAccordion');
  accordion.innerHTML = '<div class="text-center py-12 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
  document.getElementById('unbilledSummary').classList.add('hidden');
  updateBatchBar();
  try {
    var res = await axios.get('/api/tax-invoices/eligible-orders?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to));
    if (!res.data.success) {
      accordion.innerHTML = '<div class="text-center py-12 text-red-400 text-sm">조회 실패: ' + (res.data.error || '') + '</div>';
      return;
    }
    unbilledData = res.data.data || [];
    var grandTotal = res.data.grand_total || {};
    renderUnbilledAccordion();
    // 요약 표시
    var summaryEl = document.getElementById('unbilledSummary');
    var totalOrders = unbilledData.reduce(function(s, c) { return s + (c.orders ? c.orders.length : 0); }, 0);
    var totalAmt = parseFloat(grandTotal.total_amount) || unbilledData.reduce(function(s, cl) {
      return s + (cl.orders || []).reduce(function(ss, o) { return ss + (parseFloat(o.total_amount) || 0); }, 0);
    }, 0);
    document.getElementById('summaryText').textContent = '전체 ' + totalOrders + '건 / ' + totalAmt.toLocaleString() + '원';
    summaryEl.classList.remove('hidden');
    updateBatchBar();
  } catch(e) {
    accordion.innerHTML = '<div class="text-center py-12 text-red-400 text-sm">오류: ' + (e.message || '') + '</div>';
  }
}

function renderUnbilledAccordion() {
  var accordion = document.getElementById('unbilledAccordion');
  if (!unbilledData || unbilledData.length === 0) {
    accordion.innerHTML = '<div class="text-center py-12 text-gray-400 text-sm">미발행 주문이 없습니다.</div>';
    updateBatchBar();
    return;
  }
  accordion.innerHTML = unbilledData.map(function(cl, ci) {
    var isMissing = cl.brn_missing;
    var orders = cl.orders || [];
    var clientTotal = orders.reduce(function(s, o) { return s + (parseFloat(o.total_amount) || 0); }, 0);
    // 헤더
    var headerClass = isMissing
      ? 'bg-amber-50 px-4 py-3 flex items-center justify-between'
      : 'bg-gray-50 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-100';
    var toggleAttr = isMissing ? '' : ' onclick="toggleAccordion(' + ci + ')"';
    var clientEmail = cl.client_email || '';
    var emailHtml = isMissing ? '' :
      '<span class="text-gray-400 text-xs mr-1" id="emailLabel_' + ci + '">' + (clientEmail || '이메일 없음') + '</span>'
      + '<button onclick="event.stopPropagation();editEmail(' + ci + ')" class="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 mr-1" title="이메일 편집"><i class="fas fa-envelope"></i></button>';
    var actionHtml = isMissing ? '' :
      '<button onclick="event.stopPropagation();selectAllForClient(' + ci + ',true)" class="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 mr-1">전체선택</button>'
      + emailHtml
      + '<button onclick="event.stopPropagation();issueForClient(' + ci + ')" class="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">발행</button>';
    var warningHtml = isMissing
      ? '<span class="inline-flex items-center px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-medium"><i class="fas fa-exclamation-triangle text-[7px] mr-1"></i>사업자번호 미등록 (발행 불가)</span>'
      : '';
    var countBadge = '<span class="text-gray-500 text-xs ml-2">' + orders.length + '건 / ' + clientTotal.toLocaleString() + '원</span>';
    // invoice_method 뱃지
    var invMethodLabels = { PER_ORDER: '건별', MONTHLY: '월합산', UNDECIDED: '미분류', CARD: '카드', ISSUED_BY_OTHER: '타발행' };
    var invMethodColors = { PER_ORDER: 'bg-blue-50 text-blue-700', MONTHLY: 'bg-purple-50 text-purple-700', UNDECIDED: 'bg-amber-50 text-amber-700' };
    var clInvMethod = cl.invoice_method || 'PER_ORDER';
    var methodBadge = '';
    if (clInvMethod === 'MONTHLY') {
      methodBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-medium ' + (invMethodColors[clInvMethod] || 'bg-gray-100 text-gray-600') + ' ml-1">' + (invMethodLabels[clInvMethod] || clInvMethod) + ' → 월합산 탭</span>';
    } else if (clInvMethod === 'UNDECIDED') {
      methodBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 ml-1"><i class="fas fa-exclamation-circle text-[7px] mr-0.5"></i>' + (invMethodLabels[clInvMethod]) + '</span>';
    }
    // 완료 상태 표시용
    var doneHtml = '<span id="clientDone_' + ci + '" class="hidden px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs font-medium ml-2"><i class="fas fa-check mr-1"></i>발행완료</span>';
    var headerContent = '<div' + toggleAttr + ' class="' + headerClass + ' w-full">'
      + '<div class="flex items-center flex-wrap gap-2">'
      + '<span class="font-medium text-sm">' + (cl.client_name || '-') + '</span>'
      + methodBadge
      + countBadge
      + warningHtml
      + doneHtml
      + '</div>'
      + '<div class="flex items-center">' + actionHtml + '<i id="chevron_' + ci + '" class="fas fa-chevron-down text-gray-400 ml-2 text-xs transition-transform"></i></div>'
      + '</div>';
    // 주문 목록
    var orderRows = orders.map(function(o, oi) {
      var total = parseFloat(o.total_amount) || 0;
      var chkId = 'chk_' + ci + '_' + oi;
      // billing_status 뱃지
      var billingBadge = '';
      if (o.billing_status === 'BILLED') {
        billingBadge = '<span class="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 text-blue-700">회계반영</span>';
      } else if (o.billing_status === 'PAID') {
        billingBadge = '<span class="px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-100 text-green-700">수금완료</span>';
      } else {
        billingBadge = '<span class="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-500">미확인</span>';
      }
      return '<label class="flex items-center gap-3 px-4 py-2 border-b last:border-0 hover:bg-gray-50 cursor-pointer text-sm" for="' + chkId + '">'
        + '<input type="checkbox" id="' + chkId + '" class="unbilled-chk" data-ci="' + ci + '" data-oi="' + oi + '"'
        + ' data-total="' + total + '" data-order-id="' + o.id + '" onchange="updateBatchBar()" checked>'
        + '<span class="font-medium w-32 text-blue-700">' + (o.order_number || o.id) + '</span>'
        + '<span class="text-gray-500 w-24">' + (o.order_date || '-') + '</span>'
        + billingBadge
        + '<span class="ml-auto text-gray-700 font-medium">' + total.toLocaleString() + '원</span>'
        + '</label>';
    }).join('');
    var bodyId = 'accordionBody_' + ci;
    return '<div class="bg-white rounded-lg shadow mb-3 overflow-hidden" id="clientSection_' + ci + '">'
      + headerContent
      + '<div id="' + bodyId + '">' + orderRows + '</div>'
      + '</div>';
  }).join('');
  updateBatchBar();
}

function toggleAccordion(ci) {
  var body = document.getElementById('accordionBody_' + ci);
  var chevron = document.getElementById('chevron_' + ci);
  if (!body) return;
  var isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden', !isHidden);
  if (chevron) chevron.style.transform = isHidden ? '' : 'rotate(-90deg)';
}

function selectAllForClient(ci, checked) {
  var chks = document.querySelectorAll('.unbilled-chk[data-ci="' + ci + '"]');
  chks.forEach(function(chk) { chk.checked = checked; });
  updateBatchBar();
}

function editEmail(ci) {
  var cl = unbilledData[ci];
  if (!cl) return;
  var labelEl = document.getElementById('emailLabel_' + ci);
  if (!labelEl) return;
  var currentEmail = cl.client_email || '';
  var input = document.createElement('input');
  input.type = 'email';
  input.value = currentEmail;
  input.className = 'px-2 py-0.5 border rounded text-xs w-40 mr-1';
  input.onblur = function() {
    cl.client_email = input.value.trim();
    labelEl.textContent = cl.client_email || '이메일 없음';
    input.parentNode.replaceChild(labelEl, input);
  };
  input.onkeydown = function(e) {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { input.value = currentEmail; input.blur(); }
  };
  labelEl.parentNode.replaceChild(input, labelEl);
  input.focus();
  input.select();
}

function updateBatchBar() {
  var allChks = document.querySelectorAll('.unbilled-chk:checked');
  var clientSet = {};
  var totalOrders = 0;
  var totalAmt = 0;
  allChks.forEach(function(chk) {
    var ci = chk.getAttribute('data-ci');
    clientSet[ci] = true;
    totalOrders++;
    totalAmt += parseFloat(chk.getAttribute('data-total')) || 0;
  });
  var clientCount = Object.keys(clientSet).length;
  document.getElementById('batchSelClients').textContent = clientCount;
  document.getElementById('batchSelOrders').textContent = totalOrders;
  document.getElementById('batchSelAmount').textContent = totalAmt.toLocaleString();
  var bar = document.getElementById('batchBar');
  var spacer = document.getElementById('batchBarSpacer');
  var panelUnbilled = document.getElementById('panelUnbilled');
  if (!panelUnbilled.classList.contains('hidden') && clientCount > 0) {
    bar.classList.add('visible');
    spacer.classList.add('visible');
  } else {
    bar.classList.remove('visible');
    spacer.classList.remove('visible');
  }
}

function getIssueDateValue() {
  var d = document.getElementById('unbilledIssueDate').value;
  if (!d) d = new Date().toISOString().split('T')[0];
  return d;
}

async function issueForClient(ci) {
  var cl = unbilledData[ci];
  if (!cl) return;
  var chks = document.querySelectorAll('.unbilled-chk[data-ci="' + ci + '"]:checked');
  if (chks.length === 0) { showToast('주문을 하나 이상 선택하세요.', 'warning'); return; }
  var orderIds = [];
  chks.forEach(function(chk) {
    var oi = parseInt(chk.getAttribute('data-oi'));
    var o = cl.orders[oi];
    if (o) orderIds.push(o.id);
  });
  var issueDate = getIssueDateValue();
  if (!(await showConfirm(cl.client_name + '\n' + orderIds.length + '건을 발행하시겠습니까?'))) return;
  try {
    var body = {
      order_ids: orderIds,
      client_id: cl.client_id,
      issue_date: issueDate,
      auto_issue: true,
      buyer_email: cl.client_email || null
    };
    var res = await axios.post('/api/tax-invoices', body);
    if (res.data.success) {
      var sc = res.data.data && res.data.data.split_count;
      showToast(cl.client_name + ' 발행 완료' + (sc > 1 ? ' (' + sc + '개 법인 분할)' : ''), 'success');
      document.getElementById('clientDone_' + ci).classList.remove('hidden');
      var section = document.getElementById('clientSection_' + ci);
      if (section) {
        section.style.opacity = '0.5';
        section.style.pointerEvents = 'none';
      }
      // 발행된 거래처 데이터 제거 후 바 업데이트
      chks.forEach(function(chk) { chk.checked = false; });
      updateBatchBar();
    } else {
      showToast('발행 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('발행 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

async function submitBatchIssue() {
  var checkedChks = document.querySelectorAll('.unbilled-chk:checked');
  if (checkedChks.length === 0) { showToast('발행할 주문을 선택하세요.', 'warning'); return; }
  // 거래처별로 그룹핑
  var clientGroups = {};
  checkedChks.forEach(function(chk) {
    var ci = parseInt(chk.getAttribute('data-ci'));
    var oi = parseInt(chk.getAttribute('data-oi'));
    if (!clientGroups[ci]) clientGroups[ci] = [];
    clientGroups[ci].push(oi);
  });
  var clientCount = Object.keys(clientGroups).length;
  if (!(await showConfirm(clientCount + '개 거래처 / ' + checkedChks.length + '건을 일괄 발행하시겠습니까?'))) return;
  var issueDate = getIssueDateValue();
  var results = { success: [], fail: [] };
  for (var ciStr in clientGroups) {
    var ci = parseInt(ciStr);
    var cl = unbilledData[ci];
    if (!cl) continue;
    var orderIds = clientGroups[ciStr].map(function(oi) {
      return cl.orders[oi] ? cl.orders[oi].id : null;
    }).filter(function(id) { return id !== null; });
    try {
      var body = {
        order_ids: orderIds,
        client_id: cl.client_id,
        issue_date: issueDate,
        auto_issue: true,
        buyer_email: cl.client_email || null
      };
      var res = await axios.post('/api/tax-invoices', body);
      if (res.data.success) {
        var sc2 = res.data.data && res.data.data.split_count;
        results.success.push(cl.client_name + ' (' + orderIds.length + '건' + (sc2 > 1 ? ', ' + sc2 + '개 법인 분할' : '') + ')');
        document.getElementById('clientDone_' + ci).classList.remove('hidden');
        var section = document.getElementById('clientSection_' + ci);
        if (section) { section.style.opacity = '0.5'; section.style.pointerEvents = 'none'; }
        var ciChks = document.querySelectorAll('.unbilled-chk[data-ci="' + ci + '"]');
        ciChks.forEach(function(chk) { chk.checked = false; });
      } else {
        results.fail.push(cl.client_name + ': ' + (res.data.error || '알 수 없는 오류'));
      }
    } catch(e) {
      results.fail.push(cl.client_name + ': ' + (e.response && e.response.data ? e.response.data.error : e.message));
    }
  }
  updateBatchBar();
  // 결과 모달
  var html = '';
  if (results.success.length > 0) {
    html += '<div class="mb-3"><div class="font-medium text-green-700 mb-1"><i class="fas fa-check-circle mr-1"></i>발행 성공 (' + results.success.length + '건)</div>'
      + '<ul class="text-gray-600 space-y-0.5">' + results.success.map(function(s) { return '<li class="text-sm">' + s + '</li>'; }).join('') + '</ul></div>';
  }
  if (results.fail.length > 0) {
    html += '<div><div class="font-medium text-red-600 mb-1"><i class="fas fa-exclamation-circle mr-1"></i>발행 실패 (' + results.fail.length + '건)</div>'
      + '<ul class="text-gray-600 space-y-0.5">' + results.fail.map(function(s) { return '<li class="text-sm text-red-500">' + s + '</li>'; }).join('') + '</ul></div>';
  }
  document.getElementById('batchResultContent').innerHTML = html;
  document.getElementById('batchResultModal').classList.remove('hidden');
}

// ==================== 상세 모달 ====================

async function viewDetail(id) {
  try {
    var res = await axios.get('/api/tax-invoices/' + id);
    if (!res.data.success) { showToast('불러오기 실패: ' + (res.data.error || ''), 'error'); return; }
    var inv = res.data.data;
    var items = inv.items || [];
    var badge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium '
      + (statusColors[inv.status] || 'bg-gray-100 text-gray-600') + '">'
      + '<i class="' + (statusIcons[inv.status] || 'far fa-clock') + ' text-[7px] mr-1"></i>'
      + (statusLabels[inv.status] || inv.status) + '</span>';
    var itemRows = items.map(function(it) {
      return '<tr class="border-t">'
        + '<td class="px-3 py-2">' + (it.item_name || it.description || '-') + '</td>'
        + '<td class="px-3 py-2 text-right">' + fmt(it.supply_amount || it.amount) + '</td>'
        + '<td class="px-3 py-2 text-right">' + fmt(it.tax_amount) + '</td>'
        + '</tr>';
    }).join('');
    var actionBtns = '';
    if (inv.status === 'DRAFT') {
      actionBtns += '<button onclick="issueInvoice(' + inv.id + ');document.getElementById(\'detailModal\').classList.add(\'hidden\')"'
        + ' class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium">'
        + '<i class="fas fa-paper-plane mr-1"></i>발행</button>';
      actionBtns += '<button onclick="deleteInvoice(' + inv.id + ');document.getElementById(\'detailModal\').classList.add(\'hidden\')"'
        + ' class="px-4 py-2 bg-red-50 text-red-700 rounded hover:bg-red-200 text-sm">'
        + '<i class="fas fa-trash mr-1"></i>삭제</button>';
    }
    if (inv.status === 'FAILED') {
      actionBtns += '<button onclick="retryInvoice(' + inv.id + ');document.getElementById(\'detailModal\').classList.add(\'hidden\')"'
        + ' class="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 text-sm font-medium">'
        + '<i class="fas fa-redo mr-1"></i>재시도</button>';
    }
    if (inv.status === 'SENT' || inv.status === 'NTS_FAILED') {
      actionBtns += '<button onclick="refreshStatus(' + inv.id + ')"'
        + ' class="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50 text-sm">'
        + '<i class="fas fa-sync-alt mr-1"></i>상태 새로고침</button>';
    }
    if (inv.status === 'ISSUED' || inv.status === 'SENT' || inv.status === 'NTS_SUCCESS') {
      actionBtns += '<button onclick="sendInvoiceEmail(' + inv.id + ',\'' + escapeHtml(inv.buyer_email || '') + '\')"'
        + ' class="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50 text-sm">'
        + '<i class="fas fa-envelope mr-1"></i>이메일</button>';
      actionBtns += '<button onclick="openPrintURL(' + inv.id + ')"'
        + ' class="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50 text-sm">'
        + '<i class="fas fa-print mr-1"></i>인쇄/PDF</button>';
    }
    if (inv.status === 'ISSUED' || inv.status === 'SENT' || inv.status === 'NTS_SUCCESS') {
      actionBtns += '<button onclick="document.getElementById(\'detailModal\').classList.add(\'hidden\');openModifyModal(' + inv.id + ',\'' + (inv.invoice_number || '') + '\')"'
        + ' class="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm font-medium">'
        + '<i class="fas fa-edit mr-1"></i>수정발행</button>';
    }
    if (inv.status === 'ISSUED' || inv.status === 'SENT' || inv.status === 'FAILED') {
      actionBtns += '<button onclick="document.getElementById(\'detailModal\').classList.add(\'hidden\');openCancelModal(' + inv.id + ')"'
        + ' class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium">'
        + '<i class="fas fa-ban mr-1"></i>취소</button>';
    }
    document.getElementById('detailContent').innerHTML =
      '<div class="flex justify-between items-start mb-4">'
      + '<h3 class="text-lg font-bold"><i class="fas fa-file-invoice text-blue-600 mr-2"></i>'
      + (inv.invoice_number || '-') + '</h3>'
      + '<button onclick="document.getElementById(\'detailModal\').classList.add(\'hidden\')"'
      + ' class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>'
      + '</div>'
      + '<div class="grid grid-cols-2 gap-3 text-sm mb-4">'
      + '<div><span class="text-gray-500">주문번호:</span> <span class="font-medium">' + (inv.order_number || '-') + '</span></div>'
      + '<div><span class="text-gray-500">상태:</span> ' + badge + '</div>'
      + '<div><span class="text-gray-500">거래처:</span> <span class="font-medium">' + (inv.buyer_name || '-') + '</span></div>'
      + '<div><span class="text-gray-500">작성일:</span> ' + (inv.issue_date || '-') + '</div>'
      + '<div><span class="text-gray-500">공급가액:</span> ' + fmt(inv.supply_amount) + '원</div>'
      + '<div><span class="text-gray-500">세액:</span> ' + fmt(inv.tax_amount) + '원</div>'
      + '<div class="col-span-2 font-bold text-base"><span class="text-gray-500 font-normal text-sm">합계:</span> ' + fmt(inv.total_amount) + '원</div>'
      + (inv.nts_confirm_number ? '<div class="col-span-2"><span class="text-gray-500">국세청 승인번호:</span> <span class="font-mono text-green-700">' + inv.nts_confirm_number + '</span></div>' : '')
      + (inv.buyer_email ? '<div class="col-span-2"><span class="text-gray-500">수신 이메일:</span> ' + inv.buyer_email + '</div>' : '')
      + (inv.notes ? '<div class="col-span-2"><span class="text-gray-500">비고:</span> ' + escapeHtml(inv.notes) + '</div>' : '')
      + (inv.cancel_reason ? '<div class="col-span-2 text-red-600"><span class="font-medium">취소 사유:</span> ' + escapeHtml(inv.cancel_reason) + '</div>' : '')
      + '</div>'
      + (items.length > 0
        ? '<h4 class="text-sm font-medium mb-2">품목 내역</h4>'
          + '<div class="overflow-x-auto mb-4">'
          + '<table class="w-full text-sm"><thead class="bg-gray-50"><tr>'
          + '<th class="px-3 py-2 text-left">품목명</th>'
          + '<th class="px-3 py-2 text-right">공급가액</th>'
          + '<th class="px-3 py-2 text-right">세액</th>'
          + '</tr></thead>'
          + '<tbody>' + itemRows + '</tbody>'
          + '</table></div>'
        : '')
      + (inv.orders && inv.orders.length > 0
        ? '<h4 class="text-sm font-medium mb-2 mt-2">연결 주문</h4>'
          + '<div class="overflow-x-auto mb-4">'
          + '<table class="w-full text-sm"><thead class="bg-gray-50"><tr>'
          + '<th class="px-3 py-2 text-left">주문번호</th>'
          + '<th class="px-3 py-2 text-center">주문일</th>'
          + '<th class="px-3 py-2 text-right">공급가액</th>'
          + '<th class="px-3 py-2 text-right">세액</th>'
          + '</tr></thead><tbody>'
          + inv.orders.map(function(o) {
              return '<tr class="border-t">'
                + '<td class="px-3 py-2 font-medium">' + (o.order_number || o.id) + '</td>'
                + '<td class="px-3 py-2 text-center text-gray-500">' + (o.order_date || '-') + '</td>'
                + '<td class="px-3 py-2 text-right">' + fmt(o.supply_amount) + '</td>'
                + '<td class="px-3 py-2 text-right">' + fmt(o.tax_amount) + '</td>'
                + '</tr>';
            }).join('')
          + '</tbody></table></div>'
        : '')
      + (actionBtns ? '<div class="flex justify-end gap-2 mt-2 flex-wrap">' + actionBtns + '</div>' : '');
    document.getElementById('detailModal').classList.remove('hidden');
  } catch(e) {
    showToast('상세 조회 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

async function issueInvoice(id) {
  if (!(await showConfirm('이 세금계산서를 발행하시겠습니까?'))) return;
  try {
    var res = await axios.post('/api/tax-invoices/' + id + '/issue');
    if (res.data.success) {
      showToast('세금계산서가 발행되었습니다.', 'success');
      loadInvoices(currentPage);
    } else {
      showToast('발행 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('발행 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

// ==================== 상태 새로고침 (바로빌 조회) ====================

async function refreshStatus(id) {
  try {
    var btn = event && event.target ? event.target.closest('button') : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    var res = await axios.post('/api/tax-invoices/' + id + '/refresh-status');
    if (res.data.success) {
      var providerInfo = res.data.provider || {};
      var status = res.data.data.status;
      var label = statusLabels[status] || status;
      showToast('상태 업데이트: ' + label + ' (코드: ' + (providerInfo.stateCode || '-') + ')', 'success');
      loadInvoices(currentPage);
      // 상세 모달이 열려있으면 새로고침
      var detailModal = document.getElementById('detailModal');
      if (detailModal && !detailModal.classList.contains('hidden')) {
        viewDetail(id);
      }
    } else {
      showToast(res.data.error || '상태 조회 실패', 'error');
    }
  } catch(e) {
    showToast('상태 조회 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
  }
}

// ==================== FAILED 재시도 ====================

async function retryInvoice(id) {
  if (!(await showConfirm('이 세금계산서를 작성중(DRAFT) 상태로 되돌려서 재발행하시겠습니까?'))) return;
  try {
    var res = await axios.post('/api/tax-invoices/' + id + '/retry');
    if (res.data.success) {
      showToast('작성중 상태로 되돌렸습니다. 다시 발행해주세요.', 'success');
      loadInvoices(currentPage);
    } else {
      showToast('재시도 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('재시도 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

// ==================== 수정발행 ====================

function openModifyModal(id, invoiceNumber) {
  modifyTargetId = id;
  document.getElementById('modifyOriginalInfo').textContent = '원본 세금계산서: ' + invoiceNumber;
  document.getElementById('modifyCode').value = '1';
  document.getElementById('modifyIssueDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('modifyNotes').value = '';
  document.getElementById('modifyModal').classList.remove('hidden');
}

async function submitModify() {
  if (!modifyTargetId) return;
  var code = document.getElementById('modifyCode').value;
  var issueDate = document.getElementById('modifyIssueDate').value;
  if (!issueDate) { showFieldError('modifyIssueDate', '작성일을 입력하세요.'); return; }
  var notes = document.getElementById('modifyNotes').value.trim();
  try {
    var res = await axios.post('/api/tax-invoices/' + modifyTargetId + '/modify', {
      modify_code: code,
      issue_date: issueDate,
      notes: notes || null
    });
    if (res.data.success) {
      showToast('수정 세금계산서가 생성되었습니다.', 'success');
      document.getElementById('modifyModal').classList.add('hidden');
      modifyTargetId = null;
      loadInvoices(currentPage);
    } else {
      showToast('수정발행 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('수정발행 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

// ==================== 취소 ====================

function openCancelModal(id) {
  cancelTargetId = id;
  document.getElementById('cancelReason').value = '';
  document.getElementById('cancelModal').classList.remove('hidden');
}

async function submitCancel() {
  if (!cancelTargetId) return;
  var reason = document.getElementById('cancelReason').value.trim();
  if (!reason) { showFieldError('cancelReason', '취소 사유를 입력하세요.'); return; }
  try {
    var res = await axios.post('/api/tax-invoices/' + cancelTargetId + '/cancel', { cancel_reason: reason });
    if (res.data.success) {
      showToast('세금계산서가 취소되었습니다.', 'success');
      document.getElementById('cancelModal').classList.add('hidden');
      cancelTargetId = null;
      loadInvoices(currentPage);
    } else {
      showToast('취소 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('취소 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

async function deleteInvoice(id) {
  if (!(await showConfirm('이 세금계산서를 삭제하시겠습니까?\n작성중(DRAFT) 상태만 삭제 가능합니다.', { danger: true }))) return;
  try {
    var res = await axios.delete('/api/tax-invoices/' + id);
    if (res.data.success) {
      showToast('세금계산서가 삭제되었습니다.', 'success');
      loadInvoices(currentPage);
    } else {
      showToast('삭제 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('삭제 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

// ==================== 모달 외부 클릭 닫기 ====================

document.getElementById('detailModal').addEventListener('click', function(e) {
  if (e.target === this) this.classList.add('hidden');
});
document.getElementById('cancelModal').addEventListener('click', function(e) {
  if (e.target === this) this.classList.add('hidden');
});
document.getElementById('modifyModal').addEventListener('click', function(e) {
  if (e.target === this) this.classList.add('hidden');
});
document.getElementById('batchResultModal').addEventListener('click', function(e) {
  if (e.target === this) this.classList.add('hidden');
});

// ==================== 초기 로드 ====================

// ==================== 회계반영 대기 ====================

var _billingPendingOrders = [];

async function loadBillingPendingOrders() {
  var container = document.getElementById('billingOrdersList');
  container.innerHTML = '<div class="text-center py-12 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
  try {
    var res = await axios.get('/api/orders?status=SHIPPED&billing_status=NONE&limit=500&sort=order_date_desc');
    if (!res.data.success) { container.innerHTML = '<div class="text-center py-8 text-red-400">조회 실패</div>'; return; }
    _billingPendingOrders = (res.data.data || []).filter(function(o) { return !o.billing_status; });

    // billable_after 기준 분리
    var today = new Date().toISOString().split('T')[0];
    var ready = _billingPendingOrders.filter(function(o) { return !o.billable_after || o.billable_after <= today; });
    var waiting = _billingPendingOrders.filter(function(o) { return o.billable_after && o.billable_after > today; });

    // 동기화 바 표시
    var syncBar = document.getElementById('billingSyncBar');
    if (syncBar) syncBar.classList.remove('hidden');

    // 알림 배너
    var totalAmt = ready.reduce(function(s, o) { return s + (parseFloat(o.final_amount) || 0); }, 0);
    var banner = document.getElementById('billingAlertBanner');
    if (ready.length > 0) {
      banner.classList.remove('hidden');
      document.getElementById('billingAlertCount').textContent = ready.length;
      document.getElementById('billingAlertAmount').textContent = totalAmt.toLocaleString();
      document.getElementById('billingWaitingInfo').textContent = waiting.length > 0 ? '정산대기 ' + waiting.length + '건 (billable_after 미도래)' : '';
    } else {
      banner.classList.add('hidden');
    }

    // 탭 뱃지
    var badge = document.getElementById('billingTabBadge');
    if (badge) {
      if (ready.length > 0) { badge.textContent = ready.length; badge.classList.remove('hidden'); }
      else { badge.classList.add('hidden'); }
    }

    // 거래처별 그룹핑
    var clientMap = {};
    ready.forEach(function(o) {
      var cid = o.client_id || 0;
      if (!clientMap[cid]) clientMap[cid] = { client_name: o.client_name || '(미지정)', orders: [] };
      clientMap[cid].orders.push(o);
    });
    var clients = Object.keys(clientMap).map(function(k) { return clientMap[k]; });
    clients.sort(function(a, b) { return (a.client_name || '').localeCompare(b.client_name || ''); });

    renderBillingPending(clients, waiting);
    updateBillingBar();
  } catch(e) {
    container.innerHTML = '<div class="text-center py-8 text-red-400">오류: ' + (e.message || '') + '</div>';
  }
}

function renderBillingPending(clients, waiting) {
  var container = document.getElementById('billingOrdersList');
  if (clients.length === 0 && waiting.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-gray-400"><i class="fas fa-check-circle text-4xl mb-3 block text-green-300"></i><div class="text-sm">회계반영 대기 주문이 없습니다</div></div>';
    return;
  }
  var html = '';
  clients.forEach(function(cl, ci) {
    var clientTotal = cl.orders.reduce(function(s, o) { return s + (parseFloat(o.final_amount) || 0); }, 0);
    html += '<div class="bg-white rounded-lg shadow mb-3 overflow-hidden">';
    // 거래처 헤더
    html += '<div class="bg-gray-50 px-4 py-3 flex items-center justify-between">';
    html += '<div class="flex items-center gap-2">';
    html += '<i class="fas fa-building text-orange-400"></i>';
    html += '<span class="font-bold text-sm">' + escapeHtml(cl.client_name) + '</span>';
    html += '<span class="text-gray-400 text-xs">' + cl.orders.length + '건</span>';
    html += '<span class="text-gray-500 text-xs font-medium">' + clientTotal.toLocaleString() + '원</span>';
    html += '</div>';
    html += '<button onclick="selectAllBilling(' + ci + ')" class="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300">전체선택</button>';
    html += '</div>';
    // 주문 목록
    cl.orders.forEach(function(o, oi) {
      var amt = parseFloat(o.final_amount) || 0;
      var chkId = 'bill_' + ci + '_' + oi;
      var shipDate = o.shipped_at ? o.shipped_at.split('T')[0] : (o.shipment_date || '-');
      html += '<label class="flex items-center gap-3 px-4 py-2.5 border-b last:border-0 hover:bg-green-50/50 cursor-pointer text-sm" for="' + chkId + '">';
      html += '<input type="checkbox" id="' + chkId + '" class="billing-chk" data-order-id="' + o.id + '" data-amount="' + amt + '" onchange="updateBillingBar()" checked>';
      html += '<span class="font-mono font-medium text-blue-700 w-36">' + (o.order_number || 'ORD-' + o.id) + '</span>';
      html += '<span class="text-gray-500 w-24">' + (o.order_date || '-') + '</span>';
      html += '<span class="text-gray-600 flex-1 truncate">' + escapeHtml(o.title || o.notes || '-') + '</span>';
      html += '<span class="text-gray-400 text-xs w-20">출고 ' + shipDate + '</span>';
      html += '<span class="text-gray-800 font-medium w-24 text-right">' + amt.toLocaleString() + '원</span>';
      html += '</label>';
    });
    html += '</div>';
  });

  // billable_after 미도래 건
  if (waiting.length > 0) {
    html += '<div class="bg-gray-50 rounded-lg border border-dashed border-gray-300 p-4 mt-4">';
    html += '<div class="text-sm text-gray-500 mb-2"><i class="fas fa-hourglass-half text-gray-400 mr-1"></i>정산대기 (billable_after 미도래) — ' + waiting.length + '건</div>';
    waiting.forEach(function(o) {
      html += '<div class="flex items-center gap-3 text-xs text-gray-400 py-1">';
      html += '<span class="font-mono w-36">' + (o.order_number || 'ORD-' + o.id) + '</span>';
      html += '<span>' + (o.client_name || '-') + '</span>';
      html += '<span class="ml-auto">' + (o.billable_after || '-') + ' 이후 반영 가능</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  container.innerHTML = html;
}

function selectAllBilling(ci) {
  // 해당 거래처 그룹의 체크박스 전체 선택
  var container = document.getElementById('billingOrdersList');
  var groups = container.querySelectorAll('.bg-white.rounded-lg');
  if (!groups[ci]) return;
  var chks = groups[ci].querySelectorAll('.billing-chk');
  var allChecked = Array.from(chks).every(function(c) { return c.checked; });
  chks.forEach(function(c) { c.checked = !allChecked; });
  updateBillingBar();
}

function updateBillingBar() {
  var chks = document.querySelectorAll('.billing-chk:checked');
  var count = chks.length;
  var amount = 0;
  chks.forEach(function(c) { amount += parseFloat(c.getAttribute('data-amount')) || 0; });
  document.getElementById('billingSelCount').textContent = count;
  document.getElementById('billingSelAmount').textContent = amount.toLocaleString();
  var bar = document.getElementById('billingBar');
  var spacer = document.getElementById('billingBarSpacer');
  var panel = document.getElementById('panelBilling');
  if (panel && !panel.classList.contains('hidden') && count > 0) {
    bar.classList.add('visible'); spacer.classList.add('visible');
  } else {
    bar.classList.remove('visible'); spacer.classList.remove('visible');
  }
}

async function submitBulkBilling() {
  var chks = document.querySelectorAll('.billing-chk:checked');
  if (chks.length === 0) { showToast('주문을 선택하세요.', 'warning'); return; }
  var orderIds = [];
  chks.forEach(function(c) { orderIds.push(parseInt(c.getAttribute('data-order-id'))); });

  // Phase 1.1: 증빙 유형 (선택)
  var receiptTypeEl = document.getElementById('billingReceiptType');
  var receiptType = receiptTypeEl ? receiptTypeEl.value : '';
  var rtLabel = { TAX_INVOICE: '세금계산서', CASH_RECEIPT: '현금영수증', CARD: '카드', SIMPLE: '간이영수증' }[receiptType] || '미분류';

  if (!confirm(orderIds.length + '건의 주문을 [' + rtLabel + '] 증빙으로 회계반영 처리하시겠습니까?')) return;
  try {
    var payload = { orderIds: orderIds };
    if (receiptType) payload.receiptType = receiptType;
    var res = await axios.patch('/api/orders/bulk-bill', payload);
    if (res.data.success) {
      showToast(orderIds.length + '건 회계반영 완료 (' + rtLabel + ')', 'success');
      loadBillingPendingOrders(); // 새로고침
    } else {
      showToast(res.data.error || '회계반영 실패', 'error');
    }
  } catch(e) {
    showToast('오류: ' + (e.response ? e.response.data.error : e.message), 'error');
  }
}

// ==================== 회계반영 (미발행 관리 내 벌크) ====================

async function bulkBillSelected() {
  var allChks = document.querySelectorAll('.unbilled-chk:checked');
  if (allChks.length === 0) { showToast('주문을 선택하세요.', 'warning'); return; }
  // Collect order IDs from checked items
  var orderIds = [];
  allChks.forEach(function(chk) {
    var ci = parseInt(chk.getAttribute('data-ci'));
    var oi = parseInt(chk.getAttribute('data-oi'));
    var cl = unbilledData[ci];
    if (cl && cl.orders && cl.orders[oi]) {
      var o = cl.orders[oi];
      if (!o.billing_status || o.billing_status !== 'BILLED') {
        orderIds.push(o.id);
      }
    }
  });
  if (orderIds.length === 0) { showToast('회계반영할 미확인 주문이 없습니다.', 'info'); return; }
  if (!confirm(orderIds.length + '건의 주문을 회계반영 처리하시겠습니까?')) return;
  try {
    var res = await axios.patch('/api/orders/bulk-bill', { orderIds: orderIds });
    if (res.data.success) {
      showToast(orderIds.length + '건 회계반영 완료', 'success');
      // Update local data
      orderIds.forEach(function(id) {
        unbilledData.forEach(function(cl) {
          (cl.orders || []).forEach(function(o) {
            if (o.id === id) o.billing_status = 'BILLED';
          });
        });
      });
      renderUnbilledAccordion();
    } else {
      showToast(res.data.error || '회계반영 실패', 'error');
    }
  } catch(e) {
    showToast('회계반영 오류: ' + (e.response ? e.response.data.error : e.message), 'error');
  }
}

// 미발행 관리 탭 기본 날짜 설정 (이번 달)
(function() {
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  document.getElementById('unbilledFrom').value = y + '-' + m + '-01';
  document.getElementById('unbilledTo').value = y + '-' + m + '-' + String(lastDay).padStart(2, '0');
  document.getElementById('unbilledIssueDate').value = now.toISOString().split('T')[0];
})();

// 초기 로드: 회계반영 탭이 기본 (발행이력은 탭 전환 시 로드)
loadBillingPendingOrders();

// URL/hash 파라미터 처리
if (!window._taxInvoiceInitDone) {
  window._taxInvoiceInitDone = true;
  var _doTabInit = function() {
    var params = new URLSearchParams(window.location.search);
    var openId = params.get('open');
    if (openId) {
      switchMainTab('list');
      loadInvoices(1);
      viewDetail(parseInt(openId));
      history.replaceState(null, '', '/tax-invoices');
      return;
    }
    var hash = window.location.hash;
    if (hash === '#unbilled') { switchMainTab('unbilled'); loadUnbilled(); }
    else if (hash === '#list') { switchMainTab('list'); loadInvoices(1); }
    // 기본: billing 탭 (이미 로드됨)
  };
  if (document.readyState !== 'loading') _doTabInit();
  else window.addEventListener('DOMContentLoaded', _doTabInit);
}

// ==================== 월합산 발행 ====================

var monthlyEligibleData = [];

async function loadMonthlyEligible() {
  var period = document.getElementById('monthlyPeriod').value;
  if (!period) { showToast('대상 월을 선택하세요.', 'warning'); return; }
  var parts = period.split('-');
  var year = parts[0];
  var month = parts[1];

  document.getElementById('monthlyContent').innerHTML = '<div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin"></i> 조회 중...</div>';

  try {
    var res = await axios.get('/api/tax-invoices/monthly-eligible?year=' + year + '&month=' + month);
    monthlyEligibleData = res.data.data || [];

    if (monthlyEligibleData.length === 0) {
      document.getElementById('monthlyContent').innerHTML = '<div class="text-center py-8 text-gray-400">월합산 대상 거래처가 없습니다.<br><span class="text-xs">거래처 상세에서 계산서 유형을 \'월합산\'으로 설정하세요.</span></div>';
      document.getElementById('btnMonthlyCreate').classList.add('hidden');
      document.getElementById('btnMonthlyIssue').classList.add('hidden');
      return;
    }

    document.getElementById('btnMonthlyCreate').classList.remove('hidden');
    document.getElementById('btnMonthlyIssue').classList.remove('hidden');

    var html = '<div class="space-y-3">';
    monthlyEligibleData.forEach(function(group) {
      html += '<div class="bg-white rounded-lg shadow p-4">'
        + '<div class="flex justify-between items-center mb-2">'
          + '<div><span class="font-bold text-gray-800">' + escapeHtml(group.client_name) + '</span>'
          + '<span class="text-xs text-gray-400 ml-2">' + (group.business_registration_number || '') + '</span></div>'
          + '<div class="text-right">'
            + '<div class="font-bold text-blue-700" style="font-family:monospace;">' + Math.round(group.total_amount).toLocaleString() + '원</div>'
            + '<div class="text-xs text-gray-400">공급가 ' + Math.round(group.total_supply).toLocaleString() + ' + 세액 ' + Math.round(group.total_tax).toLocaleString() + '</div>'
          + '</div>'
        + '</div>'
        + '<div class="text-xs text-gray-500">'
          + group.orders.map(function(o) { return o.order_number + ' (' + (parseFloat(o.final_amount) || 0).toLocaleString() + '원)'; }).join(' / ')
        + '</div>'
        + '</div>';
    });
    html += '</div>';

    var totalAmount = monthlyEligibleData.reduce(function(s, g) { return s + g.total_amount; }, 0);
    var summary = '<div class="bg-blue-50 rounded-lg p-4 mb-3 flex justify-between items-center">'
      + '<span class="text-sm text-blue-700 font-medium">' + monthlyEligibleData.length + '개 거래처 / ' + monthlyEligibleData.reduce(function(s, g) { return s + g.orders.length; }, 0) + '건 주문</span>'
      + '<span class="text-lg font-bold text-blue-700" style="font-family:monospace;">' + Math.round(totalAmount).toLocaleString() + '원</span>'
      + '</div>';

    document.getElementById('monthlyContent').innerHTML = summary + html;
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    document.getElementById('monthlyContent').innerHTML = '<div class="text-center py-8 text-red-500">오류: ' + escapeHtml(msg) + '</div>';
  }
}

async function createMonthlyInvoices(autoIssue) {
  var period = document.getElementById('monthlyPeriod').value;
  if (!period) return;
  var parts = period.split('-');

  var action = autoIssue ? '생성+발행' : '생성(임시저장)';
  if (!(await showConfirm(monthlyEligibleData.length + '개 거래처 월합산 세금계산서를 ' + action + '하시겠습니까?'))) return;

  try {
    var res = await axios.post('/api/tax-invoices/monthly-create', {
      year: parts[0],
      month: parts[1],
      auto_issue: autoIssue
    });

    if (res.data.success) {
      var d = res.data.data || {};
      var msg = (d.created || []).length + '건 생성';
      if ((d.errors || []).length > 0) msg += ', ' + d.errors.length + '건 오류';
      showToast(msg, 'success');
      loadMonthlyEligible();
    } else {
      showToast(res.data.error || '생성 실패', 'error');
    }
  } catch (e) {
    showToast((e.response && e.response.data && e.response.data.error) || '생성 실패', 'error');
  }
}

// ==================== 이메일 재전송 ====================

async function sendInvoiceEmail(id, defaultEmail) {
  var email = prompt('이메일 주소를 입력하세요:', defaultEmail || '');
  if (!email) return;
  try {
    var res = await axios.post('/api/tax-invoices/' + id + '/send-email', { email: email });
    if (res.data.success) {
      showToast(email + '로 이메일이 전송되었습니다.', 'success');
    } else {
      showToast('이메일 전송 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('이메일 전송 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

// ==================== 발행 알림 발송 ====================

function sendTaxInvoiceNotice(id, buyerName, email, invoiceNumber) {
  if (typeof window.openSendMessage !== 'function') {
    showToast('메시지 발송 기능을 사용할 수 없습니다.', 'error');
    return;
  }
  window.openSendMessage({
    receiver: { name: buyerName, phone: '', email: email },
    context: { type: 'tax_invoices', id: id },
    defaultChannel: 'kakao',
    defaultContent: buyerName + '님, 동산기획입니다.\n\n세금계산서가 발행되었습니다.\n\n■ 세금계산서 번호: ' + invoiceNumber + '\n\n문의: 042-523-1982',
    autoTemplate: '026040001090',
    templateVars: { '고객명': buyerName, '기준일': new Date().toISOString().slice(0, 10) },
  });
}

// ==================== 인쇄/PDF ====================

async function openPrintURL(id) {
  try {
    var res = await axios.get('/api/tax-invoices/' + id + '/print-url');
    if (res.data.success && res.data.data.url) {
      window.open(res.data.data.url, '_blank');
    } else {
      showToast('인쇄 URL 조회 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('인쇄 URL 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

// ==================== 상태 동기화 ====================

async function runSyncFromInvoicePage() {
  if (!(await showConfirm('상태 동기화를 실행하시겠습니까?\n출고완료 전이 + 자동 회계반영이 처리됩니다.'))) return;
  try {
    var res = await axios.post('/api/orders/sync-statuses');
    if (res.data.success) {
      var d = res.data.data;
      var msg = '동기화 완료: 출고완료 ' + d.shipped + '건, 회계반영 ' + d.billed + '건';
      showToast(msg, 'success');
      var timeEl = document.getElementById('syncLastTimeInvoice');
      if (timeEl) {
        var now = new Date();
        timeEl.textContent = '마지막: ' + now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
      }
      loadBillingPendingOrders();
    } else {
      showToast(res.data.error || '동기화 실패', 'error');
    }
  } catch(e) {
    showToast('동기화 오류: ' + (e.response?.data?.error || e.message), 'error');
  }
}

// ==================== 직접발행 (주문 없이 세금계산서 발행, issue #310 방안 A) ====================

var _diRowSeq = 0;

// 로컬 기준 오늘 날짜 (toISOString의 UTC off-by-one 회피)
function _diToday() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _diNum(v) {
  return parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')) || 0;
}

function openDirectIssueModal() {
  var modal = document.getElementById('directIssueModal');
  if (!modal) { console.warn('[taxInvoices] #directIssueModal not found'); return; }
  // 초기화
  var idEl = document.getElementById('diClientId');
  var searchEl = document.getElementById('diClientSearch');
  var selEl = document.getElementById('diClientSelected');
  var resEl = document.getElementById('diClientResults');
  var dateEl = document.getElementById('diIssueDate');
  var notesEl = document.getElementById('diNotes');
  var autoEl = document.getElementById('diAutoIssue');
  if (idEl) idEl.value = '';
  if (searchEl) searchEl.value = '';
  if (selEl) { selEl.classList.add('hidden'); selEl.textContent = ''; }
  if (resEl) { resEl.classList.add('hidden'); resEl.innerHTML = ''; }
  if (dateEl) dateEl.value = _diToday();
  if (notesEl) notesEl.value = '';
  if (autoEl) autoEl.checked = false;
  // 품목 행 초기화: 1행
  var rows = document.getElementById('diItemRows');
  if (rows) rows.innerHTML = '';
  addDirectItemRow();
  recalcDirectTotals();
  modal.classList.remove('hidden');
  if (searchEl) setTimeout(function() { searchEl.focus(); }, 50);
}

function closeDirectIssueModal() {
  var modal = document.getElementById('directIssueModal');
  if (modal) modal.classList.add('hidden');
}

async function searchDirectClient() {
  var searchEl = document.getElementById('diClientSearch');
  var resEl = document.getElementById('diClientResults');
  if (!searchEl || !resEl) { console.warn('[taxInvoices] direct client search elements not found'); return; }
  var q = searchEl.value.trim();
  if (!q) { showToast('거래처명을 입력하세요.', 'warning'); return; }
  resEl.classList.remove('hidden');
  resEl.innerHTML = '<div class="px-3 py-2 text-sm text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>검색 중...</div>';
  try {
    var res = await axios.get('/api/clients?search=' + encodeURIComponent(q) + '&limit=50');
    var clients = (res.data && res.data.data && res.data.data.clients) ? res.data.data.clients : [];
    if (clients.length === 0) {
      resEl.innerHTML = '<div class="px-3 py-2 text-sm text-gray-400">검색 결과가 없습니다.</div>';
      return;
    }
    resEl.innerHTML = clients.map(function(cl) {
      var safeName = escapeHtml(cl.client_name || '').replace(/'/g, "\\'");
      var brn = cl.business_registration_number ? ' · ' + escapeHtml(cl.business_registration_number) : '';
      return '<div class="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer border-b last:border-0" '
        + 'onclick="selectDirectClient(' + cl.id + ',\'' + safeName + '\')">'
        + '<span class="font-medium text-gray-800">' + escapeHtml(cl.client_name || '') + '</span>'
        + '<span class="text-xs text-gray-400">' + brn + '</span>'
        + '</div>';
    }).join('');
  } catch(e) {
    resEl.innerHTML = '<div class="px-3 py-2 text-sm text-red-400">검색 오류: ' + escapeHtml(e.message || '') + '</div>';
  }
}

function selectDirectClient(id, name) {
  var idEl = document.getElementById('diClientId');
  var selEl = document.getElementById('diClientSelected');
  var resEl = document.getElementById('diClientResults');
  if (idEl) idEl.value = id;
  if (selEl) { selEl.innerHTML = '<i class="fas fa-check-circle mr-1"></i>선택: ' + escapeHtml(name); selEl.classList.remove('hidden'); }
  if (resEl) { resEl.classList.add('hidden'); resEl.innerHTML = ''; }
}

function addDirectItemRow() {
  var tbody = document.getElementById('diItemRows');
  if (!tbody) { console.warn('[taxInvoices] #diItemRows not found'); return; }
  var rid = 'diRow_' + (_diRowSeq++);
  var tr = document.createElement('tr');
  tr.id = rid;
  tr.className = 'border-t';
  tr.innerHTML =
      '<td class="px-2 py-1"><input type="text" class="ds-input di-name" style="min-height:30px" placeholder="품목명"></td>'
    + '<td class="px-2 py-1"><input type="text" inputmode="numeric" class="ds-input di-qty text-right" style="min-height:30px" value="1" oninput="recalcDirectRow(\'' + rid + '\')"></td>'
    + '<td class="px-2 py-1"><input type="text" inputmode="numeric" class="ds-input di-price text-right" style="min-height:30px" value="0" oninput="recalcDirectRow(\'' + rid + '\')"></td>'
    + '<td class="px-2 py-1"><input type="text" inputmode="numeric" class="ds-input di-amount text-right" style="min-height:30px" value="0" oninput="recalcDirectTotals()"></td>'
    + '<td class="px-2 py-1 text-center"><button type="button" onclick="removeDirectItemRow(\'' + rid + '\')" class="text-gray-300 hover:text-red-500" title="삭제"><i class="fas fa-times"></i></button></td>';
  tbody.appendChild(tr);
}

function removeDirectItemRow(rid) {
  var tbody = document.getElementById('diItemRows');
  var tr = document.getElementById(rid);
  if (!tbody || !tr) return;
  if (tbody.querySelectorAll('tr').length <= 1) {
    showToast('최소 1개 품목이 필요합니다.', 'warning');
    return;
  }
  tr.parentNode.removeChild(tr);
  recalcDirectTotals();
}

// 수량/단가 변경 시 금액 자동 계산 (금액을 수동 편집하면 그 값 우선)
function recalcDirectRow(rid) {
  var tr = document.getElementById(rid);
  if (!tr) return;
  var qty = _diNum(tr.querySelector('.di-qty').value);
  var price = _diNum(tr.querySelector('.di-price').value);
  var amtEl = tr.querySelector('.di-amount');
  if (amtEl) amtEl.value = String(Math.round(qty * price));
  recalcDirectTotals();
}

function recalcDirectTotals() {
  var tbody = document.getElementById('diItemRows');
  if (!tbody) return;
  var supply = 0;
  tbody.querySelectorAll('tr').forEach(function(tr) {
    supply += _diNum(tr.querySelector('.di-amount').value);
  });
  supply = Math.round(supply);
  var vat = Math.round(supply * 0.1);
  var total = supply + vat;
  var sEl = document.getElementById('diSupplyDisplay');
  var vEl = document.getElementById('diVatDisplay');
  var tEl = document.getElementById('diTotalDisplay');
  if (sEl) sEl.textContent = supply.toLocaleString();
  if (vEl) vEl.textContent = vat.toLocaleString();
  if (tEl) tEl.textContent = total.toLocaleString();
}

async function submitDirectIssue() {
  var clientId = (document.getElementById('diClientId') || {}).value;
  var issueDate = (document.getElementById('diIssueDate') || {}).value;
  var notes = (document.getElementById('diNotes') || {}).value || '';
  var autoIssue = !!(document.getElementById('diAutoIssue') || {}).checked;
  if (!clientId) { showToast('거래처를 선택하세요.', 'warning'); return; }
  if (!issueDate) { showToast('발행일을 선택하세요.', 'warning'); return; }

  // 품목 수집
  var tbody = document.getElementById('diItemRows');
  var items = [];
  var supplyTotal = 0;
  if (tbody) {
    tbody.querySelectorAll('tr').forEach(function(tr, i) {
      var name = (tr.querySelector('.di-name').value || '').trim();
      var qty = _diNum(tr.querySelector('.di-qty').value);
      var price = _diNum(tr.querySelector('.di-price').value);
      var amount = Math.round(_diNum(tr.querySelector('.di-amount').value));
      // 빈 행(품목명 없고 금액 0) 스킵
      if (!name && amount === 0) return;
      supplyTotal += amount;
      items.push({
        item_name: name || '품목',
        quantity: qty || 1,
        unit_price: price || 0,
        supply_amount: amount,
        sort_order: i
      });
    });
  }
  if (items.length === 0) { showToast('품목을 1개 이상 입력하세요.', 'warning'); return; }
  if (supplyTotal <= 0) { showToast('공급가액이 0원입니다. 금액을 입력하세요.', 'warning'); return; }

  var supplyAmount = Math.round(supplyTotal);
  var vatAmount = Math.round(supplyAmount * 0.1);
  var totalAmount = supplyAmount + vatAmount;

  var payload = {
    client_id: parseInt(clientId, 10),
    issue_date: issueDate,
    invoice_type: 'NORMAL',
    notes: notes,
    supply_amount: supplyAmount,
    vat_amount: vatAmount,
    total_amount: totalAmount,
    items: items,
    auto_issue: autoIssue
  };

  var btn = document.getElementById('diSubmitBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>발행 중...'; }
  try {
    var res = await axios.post('/api/tax-invoices/direct', payload);
    if (res.data.success) {
      showToast(autoIssue ? '세금계산서가 발행(전송)되었습니다.' : '세금계산서가 작성되었습니다.', 'success');
      closeDirectIssueModal();
      switchMainTab('list');
      loadInvoices(1);
    } else {
      showToast('직접발행 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('직접발행 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>발행'; }
  }
}

// 모달 외부 클릭 닫기
(function() {
  var dim = document.getElementById('directIssueModal');
  if (dim) dim.addEventListener('click', function(e) { if (e.target === this) this.classList.add('hidden'); });
})();
