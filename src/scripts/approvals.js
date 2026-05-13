// ============================================================================
// 전자결재 프론트엔드
// ============================================================================

var pendingApprovals = [];
var myRequests = [];
var allRequests = [];
var templates = [];
var currentUser = {};
try { currentUser = JSON.parse(localStorage.getItem('user') || '{}'); } catch(e) { console.warn('[approvals] Failed to parse user from localStorage'); }

// ─── 초기화 ────────────────────────────────────────────────────────────────────

async function initApprovals() {
  setupTabs();
  await loadTemplates();
  await Promise.all([loadPending(), loadMyRequests(), loadAllRequests()]);
  updateBadge();
}

function setupTabs() {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach(b => { b.classList.remove('bg-blue-600', 'text-white'); b.classList.add('bg-gray-200', 'text-gray-700'); });
      btn.classList.remove('bg-gray-200', 'text-gray-700');
      btn.classList.add('bg-blue-600', 'text-white');
      document.querySelectorAll('.tab-content').forEach(p => p.classList.add('hidden'));
      document.getElementById('tab-' + btn.dataset.tab)?.classList.remove('hidden');
    });
  });
}

// ─── 데이터 로드 ──────────────────────────────────────────────────────────────

async function loadTemplates() {
  try {
    const res = await axios.get('/api/approvals/templates');
    templates = res.data.data || [];
  } catch (e) { console.error(e); }
}

async function loadPending() {
  try {
    const res = await axios.get('/api/approvals/pending');
    pendingApprovals = res.data.data || [];
    renderPending();
  } catch (e) { console.error(e); }
}

async function loadMyRequests() {
  try {
    const res = await axios.get('/api/approvals');
    myRequests = res.data.data || [];
    renderMyRequests();
  } catch (e) { console.error(e); }
}

async function loadAllRequests() {
  try {
    const res = await axios.get('/api/approvals');
    allRequests = res.data.data || [];
    renderAllRequests();
  } catch (e) { console.error(e); }
}

async function updateBadge() {
  try {
    const res = await axios.get('/api/approvals/badge/count');
    const cnt = res.data.data?.count || 0;
    const badge = document.getElementById('nav-badge-approvals');
    if (badge) {
      badge.textContent = cnt;
      badge.classList.toggle('hidden', cnt === 0);
    }
    const tabBadge = document.getElementById('pending-count');
    if (tabBadge) tabBadge.textContent = cnt > 0 ? ` (${cnt})` : '';
  } catch (e) { /* ignore */ }
}

// ─── 상태 배지 ──────────────────────────────────────────────────────────────

var STATUS_MAP = {
  DRAFT: { label: '작성중', cls: 'bg-gray-100 text-gray-800' },
  PENDING: { label: '대기', cls: 'bg-amber-50 text-amber-700' },
  IN_REVIEW: { label: '검토중', cls: 'bg-blue-50 text-blue-700' },
  APPROVED: { label: '승인', cls: 'bg-green-50 text-green-700' },
  REJECTED: { label: '반려', cls: 'bg-red-50 text-red-700' },
  CANCELLED: { label: '취소', cls: 'bg-gray-100 text-gray-500' },
};
var TYPE_MAP = {
  PURCHASE_REQUEST: '발주 요청',
  DISCOUNT: '할인 승인',
  BAD_DEBT_WRITEOFF: '대손처리',
  EQUIPMENT_PURCHASE: '장비 구매',
  EXPENSE_CLAIM: '경비 청구',
  GENERAL: '일반',
};

function statusBadge(status) {
  const s = STATUS_MAP[status] || { label: status, cls: 'bg-gray-100' };
  return `<span class="px-2 py-0.5 rounded text-xs ${s.cls}">${s.label}</span>`;
}

// ─── 대기 결재 렌더링 ────────────────────────────────────────────────────────

function renderPending() {
  const container = document.getElementById('pending-list');
  if (!container) return;

  if (pendingApprovals.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-gray-400"><i class="fas fa-check-circle text-4xl mb-3"></i><p>처리할 결재 건이 없습니다.</p></div>';
    return;
  }

  container.innerHTML = pendingApprovals.map(r => `
    <div class="border rounded-lg p-4 hover:shadow-md transition cursor-pointer" onclick="viewApprovalDetail(${r.id})">
      <div class="flex justify-between items-start">
        <div>
          <div class="font-semibold">${escapeHtml(r.title)}</div>
          <div class="text-sm text-gray-500 mt-1">${escapeHtml(r.request_number)} | ${TYPE_MAP[r.type] || r.type} | ${escapeHtml(r.requester_name)}</div>
        </div>
        <div class="text-right">
          ${statusBadge(r.status)}
          ${r.amount ? `<div class="text-sm font-medium mt-1">${Number(r.amount).toLocaleString()}원</div>` : ''}
        </div>
      </div>
      <div class="mt-2 flex space-x-2">
        <button onclick="event.stopPropagation(); approveRequest(${r.id})" class="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"><i class="fas fa-check mr-1"></i>승인</button>
        <button onclick="event.stopPropagation(); rejectRequest(${r.id})" class="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"><i class="fas fa-times mr-1"></i>반려</button>
      </div>
    </div>
  `).join('');
}

// ─── 내 요청 렌더링 ──────────────────────────────────────────────────────────

function renderMyRequests() {
  const tbody = document.getElementById('my-requests-tbody');
  if (!tbody) return;

  if (myRequests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">요청 내역이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = myRequests.map(r => `<tr class="hover:bg-blue-50 border-b cursor-pointer" onclick="viewApprovalDetail(${r.id})">
    <td class="px-3 py-2 text-sm font-mono">${escapeHtml(r.request_number)}</td>
    <td class="px-3 py-2 text-sm">${TYPE_MAP[r.type] || r.type}</td>
    <td class="px-3 py-2 text-sm">${escapeHtml(r.title)}</td>
    <td class="px-3 py-2 text-sm text-right">${r.amount ? Number(r.amount).toLocaleString() + '원' : '-'}</td>
    <td class="px-3 py-2 text-sm">${statusBadge(r.status)}</td>
    <td class="px-3 py-2 text-sm">${new Date(r.created_at).toLocaleDateString('ko-KR')}</td>
  </tr>`).join('');
}

// ─── 전체 현황 렌더링 ────────────────────────────────────────────────────────

function renderAllRequests() {
  const tbody = document.getElementById('all-requests-tbody');
  if (!tbody) return;

  if (allRequests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">결재 내역이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = allRequests.map(r => `<tr class="hover:bg-blue-50 border-b cursor-pointer" onclick="viewApprovalDetail(${r.id})">
    <td class="px-3 py-2 text-sm font-mono">${escapeHtml(r.request_number)}</td>
    <td class="px-3 py-2 text-sm">${TYPE_MAP[r.type] || r.type}</td>
    <td class="px-3 py-2 text-sm">${escapeHtml(r.title)}</td>
    <td class="px-3 py-2 text-sm">${escapeHtml(r.requester_name || '-')}</td>
    <td class="px-3 py-2 text-sm text-right">${r.amount ? Number(r.amount).toLocaleString() + '원' : '-'}</td>
    <td class="px-3 py-2 text-sm">${statusBadge(r.status)}</td>
    <td class="px-3 py-2 text-sm">${new Date(r.created_at).toLocaleDateString('ko-KR')}</td>
  </tr>`).join('');
}

// ─── 결재 상세 모달 ──────────────────────────────────────────────────────────

async function viewApprovalDetail(id) {
  try {
    const res = await axios.get('/api/approvals/' + id);
    const { request, steps, attachments } = res.data.data;
    showDetailModal(request, steps, attachments);
  } catch (e) {
    showToast('조회 실패', 'error');
  }
}

function showDetailModal(request, steps, attachments) {
  const existing = document.getElementById('approval-detail-modal');
  if (existing) existing.remove();

  // 타임라인 렌더링
  const timeline = steps.map((s, i) => {
    let dotClass = '', lineClass = '';
    if (s.status === 'APPROVED') { dotClass = 'bg-green-500'; lineClass = 'border-green-300'; }
    else if (s.status === 'REJECTED') { dotClass = 'bg-red-500'; lineClass = 'border-red-300'; }
    else if (s.step_order === request.current_step && ['PENDING','IN_REVIEW'].includes(request.status)) { dotClass = 'bg-blue-500 animate-pulse'; lineClass = 'border-blue-300'; }
    else { dotClass = 'bg-gray-300'; lineClass = 'border-gray-200'; }

    return `<div class="flex items-start space-x-3 ${i < steps.length - 1 ? 'pb-6' : ''}">
      <div class="flex flex-col items-center">
        <div class="w-4 h-4 rounded-full ${dotClass}"></div>
        ${i < steps.length - 1 ? `<div class="w-0.5 flex-1 ${lineClass} border-l-2 mt-1"></div>` : ''}
      </div>
      <div class="flex-1 -mt-0.5">
        <div class="text-sm font-medium">${escapeHtml(s.label || s.step_order + '단계')}</div>
        <div class="text-xs text-gray-500">${escapeHtml(s.approver_name || s.approver_role || '-')}</div>
        ${s.comment ? `<div class="text-xs text-gray-600 mt-1 bg-gray-50 p-2 rounded">${escapeHtml(s.comment)}</div>` : ''}
        ${s.acted_at ? `<div class="text-xs text-gray-400 mt-1">${new Date(s.acted_at).toLocaleString('ko-KR')}</div>` : ''}
      </div>
      <div>${statusBadge(s.status)}</div>
    </div>`;
  }).join('');

  // 첨부 파일 목록
  const attList = attachments.length > 0
    ? attachments.map(a => `<div class="text-sm"><i class="fas fa-paperclip mr-1"></i>${escapeHtml(a.file_name)}</div>`).join('')
    : '<div class="text-sm text-gray-400">첨부 파일 없음</div>';

  let contentHtml = '';
  try {
    const parsed = JSON.parse(request.content || '{}');
    if (typeof parsed === 'object') {
      contentHtml = Object.entries(parsed).map(([k, v]) => `<div class="text-sm"><span class="font-medium">${escapeHtml(String(k))}:</span> ${escapeHtml(String(v ?? ''))}</div>`).join('');
    }
  } catch { contentHtml = `<div class="text-sm">${escapeHtml(request.content || '-')}</div>`; }

  const canApprove = ['PENDING', 'IN_REVIEW'].includes(request.status);
  const canCancel = request.requester_id === currentUser.id && ['DRAFT', 'PENDING'].includes(request.status);

  const html = `<div id="approval-detail-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <div class="p-6">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-lg font-bold">${escapeHtml(request.title)}</h3>
            <div class="text-sm text-gray-500">${escapeHtml(request.request_number)} | ${TYPE_MAP[request.type] || request.type}</div>
          </div>
          <button onclick="document.getElementById('approval-detail-modal').remove()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>
        </div>

        <div class="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div><span class="text-gray-500">요청자:</span> ${escapeHtml(request.requester_name)}</div>
          <div><span class="text-gray-500">금액:</span> ${request.amount ? Number(request.amount).toLocaleString() + '원' : '-'}</div>
          <div><span class="text-gray-500">상태:</span> ${statusBadge(request.status)}</div>
          <div><span class="text-gray-500">요청일:</span> ${new Date(request.created_at).toLocaleDateString('ko-KR')}</div>
        </div>

        <div class="mb-4 p-3 bg-gray-50 rounded">
          <div class="text-sm font-medium mb-2">내용</div>
          ${contentHtml}
        </div>

        <div class="mb-4">
          <div class="text-sm font-medium mb-3">결재 진행 상황</div>
          ${timeline}
        </div>

        <div class="mb-4">
          <div class="text-sm font-medium mb-2">첨부 파일</div>
          ${attList}
        </div>

        ${canApprove || canCancel ? `<div class="flex justify-end space-x-2 pt-4 border-t">
          ${canCancel ? `<button onclick="cancelRequest(${request.id})" class="px-4 py-2 bg-gray-200 rounded text-sm">취소</button>` : ''}
          ${canApprove ? `
            <button onclick="rejectRequest(${request.id})" class="px-4 py-2 bg-red-600 text-white rounded text-sm"><i class="fas fa-times mr-1"></i>반려</button>
            <button onclick="approveRequest(${request.id})" class="px-4 py-2 bg-green-600 text-white rounded text-sm"><i class="fas fa-check mr-1"></i>승인</button>
          ` : ''}
        </div>` : ''}
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

// ─── 결재 액션 ──────────────────────────────────────────────────────────────

async function approveRequest(id) {
  const comment = prompt('승인 의견 (선택):', '');
  if (comment === null) return;
  try {
    await axios.post(`/api/approvals/${id}/approve`, { comment });
    document.getElementById('approval-detail-modal')?.remove();
    showToast('승인 처리되었습니다.');
    await Promise.all([loadPending(), loadMyRequests(), loadAllRequests()]);
    updateBadge();
  } catch (e) {
    showToast(e.response?.data?.error || '승인 실패', 'error');
  }
}

async function rejectRequest(id) {
  const comment = prompt('반려 사유:', '');
  if (!comment) { showToast('반려 사유를 입력해주세요.', 'warning'); return; }
  try {
    await axios.post(`/api/approvals/${id}/reject`, { comment });
    document.getElementById('approval-detail-modal')?.remove();
    showToast('반려 처리되었습니다.');
    await Promise.all([loadPending(), loadMyRequests(), loadAllRequests()]);
    updateBadge();
  } catch (e) {
    showToast(e.response?.data?.error || '반려 실패', 'error');
  }
}

async function cancelRequest(id) {
  if (!(await showConfirm('이 결재 요청을 취소하시겠습니까?'))) return;
  try {
    await axios.post(`/api/approvals/${id}/cancel`);
    document.getElementById('approval-detail-modal')?.remove();
    showToast('결재가 취소되었습니다.');
    await loadMyRequests();
  } catch (e) {
    showToast(e.response?.data?.error || '취소 실패', 'error');
  }
}

// ─── 새 결재 요청 ────────────────────────────────────────────────────────────

function openNewRequestModal() {
  const existing = document.getElementById('new-request-modal');
  if (existing) existing.remove();

  const tmplOptions = templates.map(t => `<option value="${t.id}" data-type="${escapeHtml(t.type)}">${escapeHtml(t.name)} (${TYPE_MAP[t.type] || escapeHtml(t.type)})</option>`).join('');

  const html = `<div id="new-request-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold">새 결재 요청</h3>
        <button onclick="document.getElementById('new-request-modal').remove()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
      </div>
      <form onsubmit="submitNewRequest(event)">
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">결재 양식</label>
            <select id="req-template" class="w-full border rounded px-3 py-2 text-sm" onchange="onTemplateChange()">
              <option value="">선택</option>${tmplOptions}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">제목</label>
            <input type="text" id="req-title" class="w-full border rounded px-3 py-2 text-sm" required>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">금액</label>
            <input type="number" id="req-amount" class="w-full border rounded px-3 py-2 text-sm" placeholder="0">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">내용</label>
            <textarea id="req-content" class="w-full border rounded px-3 py-2 text-sm" rows="4" placeholder="결재 요청 내용"></textarea>
          </div>
          <div id="req-steps-preview" class="hidden p-3 bg-blue-50 rounded text-sm">
            <div class="font-medium mb-1">결재 단계</div>
            <div id="req-steps-list"></div>
          </div>
        </div>
        <div class="flex justify-end mt-4 space-x-2">
          <button type="button" onclick="document.getElementById('new-request-modal').remove()" class="px-4 py-2 bg-gray-200 rounded text-sm">취소</button>
          <button type="submit" id="btn-save-draft" class="px-4 py-2 bg-gray-600 text-white rounded text-sm">임시 저장</button>
          <button type="button" onclick="submitAndSend()" class="px-4 py-2 bg-blue-600 text-white rounded text-sm">바로 상신</button>
        </div>
      </form>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function onTemplateChange() {
  const sel = document.getElementById('req-template');
  const tmplId = Number(sel.value);
  const tmpl = templates.find(t => t.id === tmplId);
  const preview = document.getElementById('req-steps-preview');
  const list = document.getElementById('req-steps-list');

  if (tmpl) {
    const steps = JSON.parse(tmpl.steps || '[]');
    list.innerHTML = steps.map(s => `<div>${s.step_order}. ${escapeHtml(s.label)} (${escapeHtml(s.role_or_user_id)})</div>`).join('');
    preview.classList.remove('hidden');
  } else {
    preview.classList.add('hidden');
  }
}

async function submitNewRequest(e) {
  e.preventDefault();
  await createRequest(false);
}

async function submitAndSend() {
  await createRequest(true);
}

async function createRequest(autoSubmit) {
  const data = {
    template_id: Number(document.getElementById('req-template').value) || null,
    type: (() => {
      const sel = document.getElementById('req-template');
      const opt = sel.options[sel.selectedIndex];
      return opt?.dataset?.type || 'GENERAL';
    })(),
    title: document.getElementById('req-title').value,
    amount: Number(document.getElementById('req-amount').value) || 0,
    content: document.getElementById('req-content').value,
  };

  if (!data.title) { showToast('제목을 입력해주세요.', 'warning'); return; }
  if (!data.template_id) { showToast('결재 양식을 선택해주세요.', 'warning'); return; }

  try {
    const res = await axios.post('/api/approvals', data);
    const { id, requestNumber } = res.data.data;

    if (autoSubmit) {
      await axios.post(`/api/approvals/${id}/submit`);
      showToast(`결재 요청 ${requestNumber}이 상신되었습니다.`);
    } else {
      showToast(`결재 요청 ${requestNumber}이 저장되었습니다.`);
    }

    document.getElementById('new-request-modal')?.remove();
    await Promise.all([loadPending(), loadMyRequests(), loadAllRequests()]);
    updateBadge();
  } catch (e) {
    showToast(e.response?.data?.error || '요청 실패', 'error');
  }
}

// ─── 양식 관리 ──────────────────────────────────────────────────────────────

function renderTemplates() {
  const tbody = document.getElementById('templates-tbody');
  if (!tbody) return;

  if (templates.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-500">등록된 양식이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = templates.map(t => {
    const steps = JSON.parse(t.steps || '[]');
    return `<tr class="hover:bg-blue-50 border-b">
      <td class="px-3 py-2 text-sm font-medium">${escapeHtml(t.name)}</td>
      <td class="px-3 py-2 text-sm">${TYPE_MAP[t.type] || escapeHtml(t.type)}</td>
      <td class="px-3 py-2 text-sm">${steps.map(s => escapeHtml(s.label)).join(' → ')}</td>
      <td class="px-3 py-2 text-sm text-center">
        <button onclick="deleteTemplate(${t.id})" class="text-red-600 hover:text-red-700"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

async function deleteTemplate(id) {
  if (!(await showConfirm('이 양식을 삭제하시겠습니까?', { danger: true }))) return;
  try {
    await axios.delete('/api/approvals/templates/' + id);
    await loadTemplates();
    renderTemplates();
    showToast('양식이 삭제되었습니다.');
  } catch (e) { showToast('삭제 실패', 'error'); }
}

document.addEventListener('DOMContentLoaded', initApprovals);
