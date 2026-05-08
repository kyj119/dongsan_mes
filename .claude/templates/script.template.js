// {RESOURCE_KR} 페이지 스크립트
//
// 치환 필요:
//   {RESOURCE}          예: employee
//   {RESOURCE_PLURAL}   예: employees
//   {RESOURCE_KR}       예: 직원
//
// ⚠️ 중요 규칙 (Phase A 세션에서 디버깅한 교훈)
//   1. IIFE 초기화는 파일 맨 아래에 둘 것. `window.*`가 호이스팅되지 않기 때문.
//   2. showToast/showFieldError는 layout.ts가 제공하므로 재정의 금지.
//   3. 모든 DOM 조회는 요소 존재 확인 후 사용.

// ============================================================================
// 상태
// ============================================================================
window.{RESOURCE}State = {
  rows: [],
  total: 0,
  limit: 50,
  offset: 0,
  editingId: null,
};

// ============================================================================
// 포맷터
// ============================================================================
function {RESOURCE}FmtDate(s) {
  if (!s) return '';
  return String(s).substring(0, 10);
}

function {RESOURCE}Esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ============================================================================
// 데이터 로드
// ============================================================================
window.{RESOURCE}Load = async function() {
  var tbody = document.getElementById('{RESOURCE}TableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">로딩 중...</td></tr>';

  try {
    var q = (document.getElementById('{RESOURCE}Search') || {}).value || '';
    var params = {
      limit: window.{RESOURCE}State.limit,
      offset: window.{RESOURCE}State.offset,
    };
    if (q) params.q = q;

    var res = await axios.get('/api/{RESOURCE_PLURAL}', { params: params });
    var rows = (res.data && res.data.data) || [];
    var pagination = (res.data && res.data.pagination) || {};

    window.{RESOURCE}State.rows = rows;
    window.{RESOURCE}State.total = pagination.total || 0;

    {RESOURCE}Render();
  } catch (e) {
    console.error(e);
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-red-500">로드 실패: ' + (e.message || 'unknown') + '</td></tr>';
    if (window.showToast) showToast('로드 실패: ' + (e.message || 'unknown'), 'error');
  }
};

function {RESOURCE}Render() {
  var tbody = document.getElementById('{RESOURCE}TableBody');
  if (!tbody) return;

  var rows = window.{RESOURCE}State.rows;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">데이터 없음</td></tr>';
    return;
  }

  var html = '';
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    html += '<tr>' +
      '<td class="px-3 py-2 text-gray-500">' + r.id + '</td>' +
      '<td class="px-3 py-2 font-medium">' + {RESOURCE}Esc(r.name) + '</td>' +
      '<td class="px-3 py-2 text-xs text-gray-600">' + {RESOURCE}FmtDate(r.created_at) + '</td>' +
      '<td class="px-3 py-2 text-center whitespace-nowrap">' +
        '<button onclick="{RESOURCE}OpenEditModal(' + r.id + ')" class="text-blue-600 hover:text-blue-800 mx-1" title="수정"><i class="fas fa-edit"></i></button>' +
        '<button onclick="{RESOURCE}Delete(' + r.id + ')" class="text-red-600 hover:text-red-800 mx-1" title="삭제"><i class="fas fa-trash"></i></button>' +
      '</td>' +
      '</tr>';
  }
  tbody.innerHTML = html;

  // 페이지네이션 표시
  var pag = document.getElementById('{RESOURCE}Pagination');
  if (pag) {
    pag.innerHTML = '전체 ' + window.{RESOURCE}State.total + '건';
  }
}

// ============================================================================
// 모달 (생성/수정)
// ============================================================================
window.{RESOURCE}OpenCreateModal = function() {
  window.{RESOURCE}State.editingId = null;
  var title = document.getElementById('{RESOURCE}ModalTitle');
  if (title) title.innerHTML = '<i class="fas fa-plus mr-1"></i>{RESOURCE_KR} 추가';
  var nameEl = document.getElementById('{RESOURCE}Name');
  if (nameEl) nameEl.value = '';
  var modal = document.getElementById('{RESOURCE}EditModal');
  if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
};

window.{RESOURCE}OpenEditModal = function(id) {
  var row = window.{RESOURCE}State.rows.find(function(r) { return r.id === id; });
  if (!row) return;
  window.{RESOURCE}State.editingId = id;
  var title = document.getElementById('{RESOURCE}ModalTitle');
  if (title) title.innerHTML = '<i class="fas fa-edit mr-1"></i>{RESOURCE_KR} 수정 #' + id;
  var nameEl = document.getElementById('{RESOURCE}Name');
  if (nameEl) nameEl.value = row.name || '';
  var modal = document.getElementById('{RESOURCE}EditModal');
  if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
};

window.{RESOURCE}CloseModal = function() {
  var modal = document.getElementById('{RESOURCE}EditModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

window.{RESOURCE}Save = async function() {
  var nameEl = document.getElementById('{RESOURCE}Name');
  var name = (nameEl && nameEl.value || '').trim();
  if (!name) {
    if (window.showToast) showToast('이름을 입력하세요', 'error');
    return;
  }

  var payload = { name: name };
  var id = window.{RESOURCE}State.editingId;

  try {
    if (id) {
      await axios.put('/api/{RESOURCE_PLURAL}/' + id, payload);
      if (window.showToast) showToast('{RESOURCE_KR}가 수정되었습니다', 'success');
    } else {
      await axios.post('/api/{RESOURCE_PLURAL}', payload);
      if (window.showToast) showToast('{RESOURCE_KR}가 생성되었습니다', 'success');
    }
    window.{RESOURCE}CloseModal();
    window.{RESOURCE}Load();
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) || e.message;
    if (window.showToast) showToast('저장 실패: ' + msg, 'error');
  }
};

window.{RESOURCE}Delete = async function(id) {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  try {
    await axios.delete('/api/{RESOURCE_PLURAL}/' + id);
    if (window.showToast) showToast('{RESOURCE_KR}가 삭제되었습니다', 'success');
    window.{RESOURCE}Load();
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) || e.message;
    if (window.showToast) showToast('삭제 실패: ' + msg, 'error');
  }
};

// ============================================================================
// 초기화 (IIFE는 반드시 파일 맨 아래)
// ============================================================================
(function {RESOURCE}Init() {
  if (typeof window.{RESOURCE}Load === 'function') {
    window.{RESOURCE}Load();
  }
})();
