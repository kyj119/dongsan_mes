// ── 부문 관리 스크립트 (전역 스코프: 모든 top-level 이름 dept 접두) ──
// 설계: memory/design-departmental-pnl.md
var deptTree = [];
var deptEmps = [];
var deptCat = [];
var deptShowResignedFlag = false;

function deptEscAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 부문 라벨(상위 › 하위)
function deptLabel(d) {
  if (d.parent_id) {
    var p = deptTree.find(function (x) { return x.id === d.parent_id; });
    if (p) return p.name + ' › ' + d.name;
  }
  return d.name;
}

async function loadDepartmentsPage() {
  try {
    var q = deptShowResignedFlag ? '?include_resigned=1' : '';
    var res = await Promise.all([
      axios.get('/api/departments'),
      axios.get('/api/departments/employees' + q),
      axios.get('/api/departments/category-map'),
    ]);
    deptTree = res[0].data.success ? res[0].data.data : [];
    deptEmps = res[1].data.success ? res[1].data.data : [];
    deptCat = res[2].data.success ? res[2].data.data : [];
    renderDeptTree();
    renderDeptEmps();
    renderDeptCat();
    deptFillModalSelects();
  } catch (err) {
    console.error('[departments] load failed:', err);
    if (typeof showToast === 'function') showToast('부문 데이터 로드 실패', 'error');
  }
}

function renderDeptTree() {
  var tbody = document.getElementById('deptTreeBody');
  var empty = document.getElementById('deptTreeEmpty');
  if (!tbody) { console.warn('[departments] #deptTreeBody not found'); return; }
  if (deptTree.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  tbody.innerHTML = deptTree.map(function (d) {
    var indent = d.parent_id ? 'padding-left:1.5rem' : '';
    var prefix = d.parent_id ? '<span class="text-gray-300 mr-1">└</span>' : '';
    var typeBadge = d.dept_type === 'PRODUCTION'
      ? '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">생산</span>'
      : '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">지원</span>';
    var stat = d.is_active
      ? '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">활성</span>'
      : '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">비활성</span>';
    return '<tr class="border-b border-gray-100 hover:bg-gray-50">'
      + '<td class="px-3 py-2 text-sm font-medium text-gray-900" style="' + indent + '">' + prefix + deptEscAttr(d.name) + '</td>'
      + '<td class="px-3 py-2 text-center">' + typeBadge + '</td>'
      + '<td class="px-3 py-2 text-sm text-gray-500">' + deptEscAttr(d.serves_name || '—') + '</td>'
      + '<td class="px-3 py-2 text-center text-sm text-gray-700">' + d.emp_active + ' / ' + d.emp_total + '</td>'
      + '<td class="px-3 py-2 text-center">' + stat + '</td>'
      + '<td class="px-3 py-2 text-center">'
      + '<button onclick="openEditDeptModal(' + d.id + ')" class="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="수정"><i class="fas fa-pen"></i></button>'
      + '</td></tr>';
  }).join('');
}

// 직원 배정용 <option> 목록 (활성 부문만). selectedId 선택.
function deptOptionsHtml(selectedId) {
  var opts = '<option value="">(미배정)</option>';
  opts += deptTree.filter(function (d) { return d.is_active; }).map(function (d) {
    var sel = (selectedId != null && Number(selectedId) === d.id) ? ' selected' : '';
    return '<option value="' + d.id + '"' + sel + '>' + deptEscAttr(deptLabel(d)) + '</option>';
  }).join('');
  return opts;
}

function renderDeptEmps() {
  var tbody = document.getElementById('deptEmpBody');
  var empty = document.getElementById('deptEmpEmpty');
  var cnt = document.getElementById('deptEmpCount');
  if (!tbody) { console.warn('[departments] #deptEmpBody not found'); return; }
  if (cnt) cnt.textContent = '(' + deptEmps.length + '명)';
  if (deptEmps.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  var posMap = (typeof window !== 'undefined' && window.POSITION_NAMES) || {};
  tbody.innerHTML = deptEmps.map(function (e) {
    var resigned = e.status === 'RESIGNED'
      ? '<span class="ml-1 text-xs text-red-400">(퇴사)</span>' : '';
    var pos = posMap[e.position] || e.position || '-';
    return '<tr class="border-b border-gray-100 hover:bg-gray-50">'
      + '<td class="px-3 py-2 text-sm font-medium text-gray-900">' + deptEscAttr(e.name) + resigned + '</td>'
      + '<td class="px-3 py-2 text-sm text-gray-500">' + deptEscAttr(pos) + '</td>'
      + '<td class="px-3 py-2 text-sm text-gray-500">' + deptEscAttr(e.entity_name || '-') + '</td>'
      + '<td class="px-3 py-2 text-xs text-gray-400">' + deptEscAttr(e.legacy || '-') + '</td>'
      + '<td class="px-3 py-2">'
      + '<select onchange="deptAssignEmployee(' + e.id + ', this.value)" class="w-full border border-gray-300 rounded px-2 py-1 text-sm">'
      + deptOptionsHtml(e.department_id) + '</select>'
      + '</td></tr>';
  }).join('');
}

function renderDeptCat() {
  var box = document.getElementById('deptCatBody');
  var empty = document.getElementById('deptCatEmpty');
  if (!box) return;
  if (deptCat.length === 0) {
    box.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  box.innerHTML = deptCat.map(function (m) {
    return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm">'
      + '<span class="text-gray-700">' + deptEscAttr(m.category) + '</span>'
      + '<i class="fas fa-arrow-right text-gray-300 text-xs"></i>'
      + '<span class="font-medium text-blue-700">' + deptEscAttr(m.dept_name || '?') + '</span>'
      + '</span>';
  }).join('');
}

// 모달 상위/지원 부문 select 채우기
function deptFillModalSelects() {
  var parentSel = document.getElementById('deptModalParent');
  if (parentSel) {
    parentSel.innerHTML = '<option value="">(최상위)</option>' + deptTree.map(function (d) {
      return '<option value="' + d.id + '">' + deptEscAttr(deptLabel(d)) + '</option>';
    }).join('');
  }
  var servesSel = document.getElementById('deptModalServes');
  if (servesSel) {
    servesSel.innerHTML = '<option value="">(공통 · 없음)</option>' + deptTree.filter(function (d) {
      return d.dept_type === 'PRODUCTION';
    }).map(function (d) {
      return '<option value="' + d.id + '">' + deptEscAttr(d.name) + '</option>';
    }).join('');
  }
}

function deptSyncServesVisibility() {
  var type = document.getElementById('deptModalType');
  var wrap = document.getElementById('deptServesWrap');
  if (!type || !wrap) return;
  // serves(지원 생산부문)는 SUPPORT 부문에만 의미 있음
  wrap.style.display = type.value === 'SUPPORT' ? '' : 'none';
}

function openAddDeptModal() {
  var m = document.getElementById('deptModal');
  if (!m) return;
  document.getElementById('deptModalId').value = '';
  document.getElementById('deptModalTitle').textContent = '부문 추가';
  document.getElementById('deptModalName').value = '';
  document.getElementById('deptModalType').value = 'PRODUCTION';
  document.getElementById('deptModalParent').value = '';
  document.getElementById('deptModalServes').value = '';
  document.getElementById('deptModalSort').value = '0';
  document.getElementById('deptModalActive').checked = true;
  deptSyncServesVisibility();
  m.classList.remove('hidden');
}

function openEditDeptModal(id) {
  var d = deptTree.find(function (x) { return x.id === id; });
  if (!d) return;
  var m = document.getElementById('deptModal');
  if (!m) return;
  document.getElementById('deptModalId').value = d.id;
  document.getElementById('deptModalTitle').textContent = '부문 수정';
  document.getElementById('deptModalName').value = d.name || '';
  document.getElementById('deptModalType').value = d.dept_type || 'SUPPORT';
  document.getElementById('deptModalParent').value = d.parent_id || '';
  document.getElementById('deptModalServes').value = d.serves_department_id || '';
  document.getElementById('deptModalSort').value = d.sort_order != null ? d.sort_order : 0;
  document.getElementById('deptModalActive').checked = !!d.is_active;
  deptSyncServesVisibility();
  m.classList.remove('hidden');
}

function closeDeptModal() {
  var m = document.getElementById('deptModal');
  if (m) m.classList.add('hidden');
}

async function saveDept() {
  var id = document.getElementById('deptModalId').value;
  var name = document.getElementById('deptModalName').value.trim();
  if (!name) { if (typeof showToast === 'function') showToast('부문명을 입력해주세요.', 'warning'); return; }
  var type = document.getElementById('deptModalType').value;
  var parentVal = document.getElementById('deptModalParent').value;
  var servesVal = document.getElementById('deptModalServes').value;
  var payload = {
    name: name,
    dept_type: type,
    parent_id: parentVal ? parseInt(parentVal) : null,
    // serves 는 SUPPORT 부문에만 적용
    serves_department_id: (type === 'SUPPORT' && servesVal) ? parseInt(servesVal) : null,
    sort_order: parseInt(document.getElementById('deptModalSort').value) || 0,
    is_active: document.getElementById('deptModalActive').checked ? 1 : 0,
  };
  var btn = document.getElementById('deptModalSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
  try {
    var res = id
      ? await axios.put('/api/departments/' + id, payload)
      : await axios.post('/api/departments', payload);
    if (res.data.success) {
      closeDeptModal();
      await loadDepartmentsPage();
      if (typeof showToast === 'function') showToast(id ? '부문이 수정되었습니다.' : '부문이 추가되었습니다.', 'success');
    } else if (typeof showToast === 'function') {
      showToast(res.data.error || '저장 실패', 'error');
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast('저장 실패: ' + ((err.response && err.response.data && err.response.data.error) || err.message), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '저장'; }
  }
}

async function deptAssignEmployee(empId, val) {
  var deptId = val ? parseInt(val) : null;
  try {
    var res = await axios.patch('/api/departments/employees/' + empId, { department_id: deptId });
    if (res.data.success) {
      // 로컬 반영 + 트리 인원수 갱신
      var e = deptEmps.find(function (x) { return x.id === empId; });
      if (e) e.department_id = deptId;
      var treeRes = await axios.get('/api/departments');
      if (treeRes.data.success) { deptTree = treeRes.data.data; renderDeptTree(); }
      if (typeof showToast === 'function') showToast('부문이 변경되었습니다.', 'success');
    } else if (typeof showToast === 'function') {
      showToast(res.data.error || '변경 실패', 'error');
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast('변경 실패: ' + ((err.response && err.response.data && err.response.data.error) || err.message), 'error');
  }
}

function deptToggleResigned(cb) {
  deptShowResignedFlag = !!(cb && cb.checked);
  loadDepartmentsPage();
}

// 초기 로드
loadDepartmentsPage();
