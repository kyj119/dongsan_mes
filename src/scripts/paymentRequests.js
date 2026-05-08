// 지출결의서
function fmt(n) { return (n || 0).toLocaleString(); }
var prEditingId = null;
// 초기화는 파일 맨 아래에서 실행 (window.* 함수 정의 이후)

window.loadPaymentRequests = async function() {
  try {
    var status = document.getElementById('prFilterStatus').value;
    var type = document.getElementById('prFilterType').value;
    var qs = [];
    if (status) qs.push('status=' + status);
    if (type) qs.push('type=' + type);
    var res = await axios.get('/api/payment-requests' + (qs.length ? '?' + qs.join('&') : ''));
    if (!res.data.success) return;
    renderPrTable(res.data.data || []);
  } catch (e) {
    console.error('load pr error:', e);
  }
};

async function loadPrStats() {
  try {
    var res = await axios.get('/api/payment-requests/stats/summary');
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
      + '<td class="px-2 py-1.5">' + (r.recipient_client_name || r.recipient_name) + '</td>'
      + '<td class="px-2 py-1.5 text-right font-medium" style="font-variant-numeric:tabular-nums;">' + fmt(r.amount) + '</td>'
      + '<td class="px-2 py-1.5 text-gray-500 truncate" style="max-width:200px;">' + (r.description || '') + '</td>'
      + '<td class="px-2 py-1.5 text-center">' + statusBadge(r.status) + '</td>'
      + '<td class="px-2 py-1.5 text-center text-gray-500">' + (r.creator_name || '') + '</td>'
      + '<td class="px-2 py-1.5 text-center">' + actions + '</td>'
      + '</tr>';
  }).join('');
}

window.prOpenAddModal = function() {
  prEditingId = null;
  document.getElementById('prModalTitle').textContent = '지출결의서 작성';
  document.getElementById('prDate').value = new Date().toISOString().substring(0, 10);
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
    loadPrStats();
  } catch (e) {
    showToast('저장 실패: ' + (e.response?.data?.error || e.message), 'error');
  }
};

window.prSubmit = async function(id) {
  if (!(await showConfirm('결재 상신하시겠습니까?'))) return;
  try {
    await axios.patch('/api/payment-requests/' + id + '/submit');
    loadPaymentRequests();
    loadPrStats();
  } catch (e) { showToast('실패: ' + (e.response?.data?.error || e.message), 'error'); }
};

window.prDelete = async function(id) {
  if (!(await showConfirm('삭제하시겠습니까?', { danger: true }))) return;
  try {
    await axios.delete('/api/payment-requests/' + id);
    loadPaymentRequests();
    loadPrStats();
  } catch (e) { showToast('실패: ' + (e.response?.data?.error || e.message), 'error'); }
};

window.prApprove = async function(id) {
  if (!(await showConfirm('승인하시겠습니까? (자금예정에 자동 등록됩니다)'))) return;
  try {
    await axios.patch('/api/payment-requests/' + id + '/approve');
    loadPaymentRequests();
    loadPrStats();
  } catch (e) { showToast('실패: ' + (e.response?.data?.error || e.message), 'error'); }
};

window.prReject = async function(id) {
  var reason = prompt('반려 사유를 입력하세요:');
  if (reason === null) return;
  try {
    await axios.patch('/api/payment-requests/' + id + '/reject', { reject_reason: reason });
    loadPaymentRequests();
    loadPrStats();
  } catch (e) { showToast('실패: ' + (e.response?.data?.error || e.message), 'error'); }
};

window.prPay = async function(id) {
  if (!(await showConfirm('이체 완료 처리하시겠습니까?'))) return;
  try {
    await axios.patch('/api/payment-requests/' + id + '/pay', {
      paid_at: new Date().toISOString().substring(0, 10)
    });
    loadPaymentRequests();
    loadPrStats();
  } catch (e) { showToast('실패: ' + (e.response?.data?.error || e.message), 'error'); }
};

// ============================================================
// 초기화 (모든 window.* 함수 정의 이후 실행)
// ============================================================
(function init() {
  window.loadPaymentRequests();
  loadPrStats();
})();
