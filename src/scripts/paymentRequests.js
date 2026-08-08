// 지출결의서

// Skeleton loading
(function() {
  var el = document.getElementById('prTableBody');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(5, 9);
})();

function fmt(n) { return window.fmtNum(n); }
var prEditingId = null;
var prCurrentPage = 1;
// 초기화는 파일 맨 아래에서 실행 (window.* 함수 정의 이후)

// ── 조회조건 SSOT (클라) — 서버 정본 = routes/paymentRequests.ts buildPayReqFilter ──
function payreqReadFilters() {
  var g = function(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
  return { status: g('prFilterStatus'), type: g('prFilterType'), from: g('prFilterFrom'), to: g('prFilterTo'), search: g('prFilterSearch') };
}
function payreqBuildParams(f, opts) {
  opts = opts || {};
  var p = new URLSearchParams();
  if (f.status && !opts.omitStatus) p.append('status', f.status);
  if (f.type) p.append('type', f.type);
  if (f.from) p.append('from', f.from);
  if (f.to) p.append('to', f.to);
  if (f.search) p.append('search', f.search);
  return p;
}
function payreqLabel(selId, v) {
  var sel = document.getElementById(selId);
  if (sel) for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === v) return sel.options[i].textContent;
  return v;
}
function payreqRenderChips(f) {
  var items = [];
  var clear = function(id) { return function() { document.getElementById(id).value = ''; window.loadPaymentRequests(1); }; };
  if (f.from || f.to) {
    var label = f.from && f.to ? ('청구일 ' + f.from + ' ~ ' + f.to) : f.from ? ('청구일 ' + f.from + ' 이후') : ('청구일 ' + f.to + ' 이전');
    items.push({ label: label, onClear: function() {
      document.getElementById('prFilterFrom').value = '';
      document.getElementById('prFilterTo').value = '';
      window.loadPaymentRequests(1);
    } });
  } else {
    items.push({ label: '전체 기간', tone: 'static' });
  }
  if (f.status) items.push({ label: '상태 ' + payreqLabel('prFilterStatus', f.status), onClear: clear('prFilterStatus') });
  if (f.type) items.push({ label: '유형 ' + payreqLabel('prFilterType', f.type), onClear: clear('prFilterType') });
  if (f.search) items.push({ label: '검색 "' + f.search + '"', onClear: clear('prFilterSearch') });
  window.dsListUx.renderChips('payreqFilterChips', items);
}
function payreqRenderSummary(summary, pagination) {
  if (!summary) { window.dsListUx.renderSummary('payreqSummaryBar', null); return; }
  window.dsListUx.renderSummary('payreqSummaryBar', [
    { label: '건수', value: summary.count },
    { label: '금액', value: summary.amount, format: 'won', strong: true }
  ], { multiPage: !!(pagination && pagination.total_pages > 1) });
}
// 카드 드릴다운 — 같은 카드를 다시 누르면 해제
window.prFilterByStatus = function(status) {
  var sel = document.getElementById('prFilterStatus');
  if (!sel) { console.warn('[paymentRequests] #prFilterStatus not found'); return; }
  sel.value = (sel.value === status) ? '' : status;
  window.loadPaymentRequests(1);
};
// 프리셋 적용
var payreqPresetApplied = false;
function payreqApplyFilters(f) {
  if (!f) return;
  var setVal = function(id, v) { var el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
  setVal('prFilterStatus', f.status);
  setVal('prFilterType', f.type);
  setVal('prFilterFrom', f.from);
  setVal('prFilterTo', f.to);
  setVal('prFilterSearch', f.search);
  payreqPresetApplied = true;
  window.loadPaymentRequests(1);
}

window.loadPaymentRequests = async function(page) {
  prCurrentPage = page || 1;
  try {
    var f = payreqReadFilters();
    var params = payreqBuildParams(f);
    params.append('page', String(prCurrentPage));
    params.append('limit', String(window.dsListToolbar ? window.dsListToolbar.pageSize('payment-requests', 50) : 50));

    payreqRenderChips(f);                                        // 조건 표시는 응답을 기다리지 않는다
    window.dsListUx.markActiveStat(f.status, '#payreqStatsArea ');
    loadPrStats();                                                // KPI 도 같은 조건으로

    var res = await axios.get('/api/payment-requests?' + params.toString());
    if (!res.data.success) return;
    renderPrTable(res.data.data || []);
    renderPrPagination(res.data.pagination);
    payreqRenderSummary(res.data.summary, res.data.pagination);
  } catch (e) {
    console.error('load pr error:', e);
    // #362: 로드 실패 시 스켈레톤 잔류 방지 — 에러 행 + 재시도 버튼
    var tb = document.getElementById('prTableBody');
    if (tb) tb.innerHTML = '<tr><td colspan="9" class="px-4 py-8 text-center text-red-500"><i class="fas fa-exclamation-triangle mr-1"></i>불러오기 실패 <button onclick="loadPaymentRequests()" class="underline text-blue-600 ml-1">다시 시도</button></td></tr>';
  }
};

async function loadPrStats() {
  try {
    // 목록과 같은 조건 (상태는 카드가 담당하므로 제외)
    var sp = payreqBuildParams(payreqReadFilters(), { omitStatus: true });
    var res = await axios.get('/api/payment-requests/stats/summary' + (sp.toString() ? '?' + sp.toString() : ''));
    if (!res.data.success) return;
    var s = res.data.data || {};
    document.getElementById('prKpiDraft').textContent = s.draft_count || 0;
    document.getElementById('prKpiPending').textContent = s.pending_count || 0;
    document.getElementById('prKpiApproved').textContent = s.approved_count || 0;
    document.getElementById('prKpiPaid').textContent = s.paid_count || 0;
  } catch (e) { console.error(e); }
}

function renderPrTable(rows) {
  var tbody = document.getElementById('prTableBody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-gray-400"><i class="fas fa-inbox text-2xl block mb-2"></i>지출결의서가 없습니다.</td></tr>';
    return;
  }
  var typeLabel = { PURCHASE: '매입대금', EXPENSE: '경비', OTHER: '기타' };
  var statusBadge = function(s) {
    if (s === 'DRAFT') return '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600"><i class="far fa-edit text-[7px] mr-0.5"></i>작성중</span>';
    if (s === 'PENDING') return '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700"><i class="far fa-clock text-[7px] mr-0.5"></i>결재대기</span>';
    if (s === 'APPROVED') return '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700"><i class="fas fa-check text-[7px] mr-0.5"></i>승인</span>';
    if (s === 'PAID') return '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700"><i class="fas fa-check-circle text-[7px] mr-0.5"></i>이체완료</span>';
    if (s === 'REJECTED') return '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700"><i class="fas fa-times-circle text-[7px] mr-0.5"></i>반려</span>';
    return '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">취소</span>';
  };

  tbody.innerHTML = rows.map(function(r) {
    var actions = '';
    if (r.status === 'DRAFT') {
      actions = '<button onclick="prSubmit(' + r.id + ')" class="text-[10px] text-blue-600 hover:underline">상신</button> '
        + '<button onclick="prDelete(' + r.id + ')" class="text-[10px] text-red-600 hover:underline">삭제</button>';
    } else if (r.status === 'PENDING') {
      actions = '<button onclick="prApprove(' + r.id + ')" class="text-[10px] text-green-600 hover:underline">승인</button> '
        + '<button onclick="prReject(' + r.id + ')" class="text-[10px] text-red-600 hover:underline">반려</button>';
    } else if (r.status === 'APPROVED') {
      actions = '<button onclick="prPay(' + r.id + ')" class="text-[10px] text-blue-600 hover:underline">이체완료</button>';
    }

    return '<tr class="border-b border-gray-100 hover:bg-blue-50/30">'
      + '<td class="px-2 py-1.5 font-medium text-gray-900">' + r.request_number + '</td>'
      + '<td class="px-2 py-1.5 text-gray-500">' + r.request_date + '</td>'
      + '<td class="px-2 py-1.5">' + (typeLabel[r.request_type] || r.request_type) + '</td>'
      + '<td class="px-2 py-1.5" title="' + window.escapeHtml(r.recipient_client_name || r.recipient_name || '') + '">' + (r.recipient_client_name || r.recipient_name) + '</td>'
      + '<td class="px-2 py-1.5 text-right font-medium" style="font-variant-numeric:tabular-nums;">' + fmt(r.amount) + '</td>'
      + '<td class="px-2 py-1.5 text-gray-500 truncate" style="max-width:200px;" title="' + window.escapeHtml(r.description || '') + '">' + (r.description || '') + '</td>'
      + '<td class="px-2 py-1.5 text-center">' + statusBadge(r.status) + '</td>'
      + '<td class="px-2 py-1.5 text-center text-gray-500">' + (r.creator_name || '') + '</td>'
      + '<td class="px-2 py-1.5 text-center">' + actions + '</td>'
      + '</tr>';
  }).join('');
}

// #359: 페이지네이션 컨트롤 + 총건수 (peer: quotations.js renderQuotPagination)
function renderPrPagination(p) {
  var container = document.getElementById('prPagination');
  if (!container) return;
  if (!p) { container.innerHTML = ''; return; }
  var html = '<span class="text-xs text-gray-500 mr-3">총 ' + (p.total || 0) + '건</span>';
  if (p.total_pages > 1) {
    for (var i = 1; i <= p.total_pages; i++) {
      html += '<button onclick="loadPaymentRequests(' + i + ')" class="px-2.5 py-1 mx-0.5 rounded text-xs '
        + (i === p.page ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700') + '">' + i + '</button>';
    }
  }
  container.innerHTML = html;
}

window.prOpenAddModal = function() {
  prEditingId = null;
  document.getElementById('prModalTitle').textContent = '지출결의서 작성';
  document.getElementById('prDate').value = (window.kstToday ? window.kstToday() : new Date().toISOString().substring(0, 10));
  document.getElementById('prType').value = 'EXPENSE';
  document.getElementById('prRecipientName').value = '';
  document.getElementById('prBank').value = '';
  document.getElementById('prAccount').value = '';
  document.getElementById('prAmount').value = '';
  document.getElementById('prDesc').value = '';
  document.getElementById('prNotes').value = '';
  document.getElementById('prModal').classList.remove('hidden');
};
window.prCloseModal = function() {
  document.getElementById('prModal').classList.add('hidden');
};

window.prSave = async function() {
  var data = {
    request_date: document.getElementById('prDate').value,
    request_type: document.getElementById('prType').value,
    recipient_name: document.getElementById('prRecipientName').value,
    recipient_bank: document.getElementById('prBank').value,
    recipient_account: document.getElementById('prAccount').value,
    amount: (window.parseMoney ? window.parseMoney(document.getElementById('prAmount').value) : parseFloat(String(document.getElementById('prAmount').value || '').replace(/[^\d.-]/g, ''))) || 0,
    description: document.getElementById('prDesc').value,
    notes: document.getElementById('prNotes').value
  };
  if (!data.recipient_name) { showFieldError('prRecipientName', '지급처를 입력하세요'); return; }
  if (!data.amount) { showFieldError('prAmount', '금액을 입력하세요'); return; }
  if (!data.description) { showFieldError('prDesc', '사유를 입력하세요'); return; }
  try {
    await axios.post('/api/payment-requests', data);
    prCloseModal();
    loadPaymentRequests();
  } catch (e) {
    showToast('저장 실패: ' + (e.response?.data?.error || e.message), 'error');
  }
};

window.prSubmit = async function(id) {
  if (!(await showConfirm('결재 상신하시겠습니까?'))) return;
  try {
    await axios.patch('/api/payment-requests/' + id + '/submit');
    loadPaymentRequests();
  } catch (e) { showToast('실패: ' + (e.response?.data?.error || e.message), 'error'); }
};

window.prDelete = async function(id) {
  if (!(await showConfirm('삭제하시겠습니까?', { danger: true }))) return;
  try {
    await axios.delete('/api/payment-requests/' + id);
    loadPaymentRequests();
  } catch (e) { showToast('실패: ' + (e.response?.data?.error || e.message), 'error'); }
};

window.prApprove = async function(id) {
  if (!(await showConfirm('승인하시겠습니까? (자금예정에 자동 등록됩니다)'))) return;
  try {
    await axios.patch('/api/payment-requests/' + id + '/approve');
    loadPaymentRequests();
  } catch (e) { showToast('실패: ' + (e.response?.data?.error || e.message), 'error'); }
};

window.prReject = async function(id) {
  var reason = prompt('반려 사유를 입력하세요:');
  if (reason === null) return;
  try {
    await axios.patch('/api/payment-requests/' + id + '/reject', { reject_reason: reason });
    loadPaymentRequests();
  } catch (e) { showToast('실패: ' + (e.response?.data?.error || e.message), 'error'); }
};

window.prPay = async function(id) {
  if (!(await showConfirm('이체 완료 처리하시겠습니까?'))) return;
  try {
    await axios.patch('/api/payment-requests/' + id + '/pay', {
      paid_at: (window.kstToday ? window.kstToday() : new Date().toISOString().substring(0, 10))
    });
    loadPaymentRequests();
  } catch (e) { showToast('실패: ' + (e.response?.data?.error || e.message), 'error'); }
};

// ============================================================
// 초기화 (모든 window.* 함수 정의 이후 실행)
// ============================================================
(function init() {
  // 도구모음을 먼저 붙이고 그 결과로 첫 조회 (설정을 모른 채 조회하면 두 번 조회하게 된다)
  var tb = window.dsListToolbar && window.dsListToolbar.mount({
    pageKey: 'payment-requests',
    container: 'payreqListToolbar',
    tableSelector: '.payreq-tbl',
    defaultPageSize: 50,
    getFilters: function() { return payreqReadFilters(); },
    applyFilters: function(f) { payreqApplyFilters(f); },
    onChange: function() { window.loadPaymentRequests(1); }
  });
  if (tb && tb.then) tb.then(function() { if (!payreqPresetApplied) window.loadPaymentRequests(1); });
  else window.loadPaymentRequests();
})();
