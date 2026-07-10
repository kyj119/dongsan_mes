// 권한 관리 페이지 스크립트
// /api/permissions/matrix 로드 → 역할 탭 + 페이지별 [열람][편집] 매트릭스 렌더 → 변경분만 PATCH.
// matrix[role][page_key] = { a: 열람, e: 편집 }. 편집 켜면 열람 자동 포함.

// 역할 탭 정의 (ADMIN 제외, roles.ts ROLES 와 동기 유지)
var PERM_ROLE_TABS = [
  { role: 'MANAGER',    label: '매니저',      icon: 'fa-user-tie' },
  { role: 'DESIGNER',   label: '디자이너',    icon: 'fa-paint-brush' },
  { role: 'OPERATOR',   label: '오퍼레이터',  icon: 'fa-hard-hat' },
  { role: 'ACCOUNTANT', label: '경리',        icon: 'fa-calculator' },
  { role: 'SALES',      label: '영업',        icon: 'fa-handshake' },
  { role: 'FINISHING',  label: '후가공',      icon: 'fa-scissors' },
  { role: 'SHIPPING',   label: '배송',        icon: 'fa-truck' },
];

function permBlankMatrix() {
  var m = { ADMIN: {} };
  PERM_ROLE_TABS.forEach(function(t) { m[t.role] = {}; });
  return m;
}

var permPages = [];                 // 페이지 마스터
var permMatrix = permBlankMatrix(); // {role: {page_key: {a,e}}}
var permDirty = {};                 // { 'ROLE:/page': {role, page_key, can_access, can_edit} }
var permCurrentRole = 'MANAGER';    // 활성 탭

function permEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function permLoad() {
  try {
    var res = await axios.get('/api/permissions/matrix');
    if (!res.data.success) throw new Error(res.data.error || '로드 실패');
    permPages = res.data.data.pages || [];
    permMatrix = Object.assign(permBlankMatrix(), res.data.data.matrix || {});
    permDirty = {};
    permRenderTabs();
    permRender();
  } catch (e) {
    console.error('permLoad error:', e);
    var msg = e.response && e.response.status === 403
      ? 'ADMIN 만 접근 가능합니다.' : '로드 실패: ' + (e.message || e);
    document.getElementById('permContent').innerHTML =
      '<div class="text-center text-red-500 py-12">' + permEscape(msg) + '</div>';
  }
}

function permTabClass(active, muted) {
  var base = 'px-5 py-3 text-sm border-b-2 ';
  if (active) return base + 'font-semibold border-blue-600 text-blue-600';
  return base + 'font-medium border-transparent ' + (muted ? 'text-gray-400 hover:text-gray-600' : 'text-gray-500 hover:text-gray-700');
}

function permRenderTabs() {
  var el = document.getElementById('permTabs');
  if (!el) return;
  var html = '';
  PERM_ROLE_TABS.forEach(function(t) {
    html += '<button id="permTab' + t.role + '" onclick="permSwitchRole(\'' + t.role + '\')" '
      + 'class="' + permTabClass(t.role === permCurrentRole, false) + '">'
      + '<i class="fas ' + t.icon + ' mr-1"></i>' + permEscape(t.label) + '</button>';
  });
  html += '<button id="permTabADMIN" onclick="permSwitchRole(\'ADMIN\')" '
    + 'class="' + permTabClass(permCurrentRole === 'ADMIN', true) + ' ml-auto">'
    + '<i class="fas fa-user-shield mr-1"></i>ADMIN (보기 전용)</button>';
  el.innerHTML = html;
}

function permSwitchRole(role) {
  permCurrentRole = role;
  permRenderTabs();
  permRender();
}

// 원본 {a,e}
function permOriginal(role, pageKey) {
  var cell = permMatrix[role] && permMatrix[role][pageKey];
  return { a: cell && cell.a ? 1 : 0, e: cell && cell.e ? 1 : 0 };
}

// 유효값 {a,e} (dirty 우선)
function permGetEffective(role, pageKey) {
  var key = role + ':' + pageKey;
  if (permDirty[key] !== undefined) {
    return { a: permDirty[key].can_access ? 1 : 0, e: permDirty[key].can_edit ? 1 : 0 };
  }
  return permOriginal(role, pageKey);
}

// 의도값 반영 (원본과 같으면 dirty 제거)
function permSetCell(role, pageKey, a, e) {
  if (e) a = 1;          // 편집 ⇒ 열람 자동
  if (!a) e = 0;         // 열람 해제 ⇒ 편집 해제
  var orig = permOriginal(role, pageKey);
  var key = role + ':' + pageKey;
  if (a === orig.a && e === orig.e) {
    delete permDirty[key];
  } else {
    permDirty[key] = { role: role, page_key: pageKey, can_access: a, can_edit: e };
  }
}

function permToggleAccess(pageKey) {
  if (permCurrentRole === 'ADMIN') return;
  var eff = permGetEffective(permCurrentRole, pageKey);
  permSetCell(permCurrentRole, pageKey, eff.a ? 0 : 1, eff.e);
  permRender();
}

function permToggleEdit(pageKey) {
  if (permCurrentRole === 'ADMIN') return;
  var eff = permGetEffective(permCurrentRole, pageKey);
  permSetCell(permCurrentRole, pageKey, eff.a, eff.e ? 0 : 1);
  permRender();
}

// 섹션 일괄 (열람 기준). value=1 → 열람 ON(편집 유지), value=0 → 열람·편집 모두 OFF
function permSetSection(section, value) {
  if (permCurrentRole === 'ADMIN') return;
  permPages.filter(function(p) { return p.page_section === section; }).forEach(function(p) {
    var eff = permGetEffective(permCurrentRole, p.page_key);
    permSetCell(permCurrentRole, p.page_key, value, value ? eff.e : 0);
  });
  permRender();
}

function permResetAll() {
  if (Object.keys(permDirty).length === 0) return;
  permDirty = {};
  permRender();
}

async function permSave() {
  var updates = Object.values(permDirty);
  if (updates.length === 0) {
    showToast('변경된 항목이 없습니다.', 'info');
    return;
  }
  var btn = document.getElementById('permSaveBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>저장 중...';
  try {
    var res = await axios.patch('/api/permissions', updates);
    if (res.data.success) {
      showToast(updates.length + '개 권한이 저장되었습니다.', 'success');
      await permLoad();
    } else {
      showToast('저장 실패: ' + (res.data.error || ''), 'error');
    }
  } catch (e) {
    showToast('저장 실패: ' + (e.response?.data?.error || e.message), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save mr-1"></i>저장';
  }
}

function permRender() {
  var content = document.getElementById('permContent');
  if (!content) return;

  var sections = {};
  var sectionOrder = [];
  permPages.forEach(function(p) {
    if (!sections[p.page_section]) {
      sections[p.page_section] = [];
      sectionOrder.push(p.page_section);
    }
    sections[p.page_section].push(p);
  });

  var dirtyCount = Object.keys(permDirty).length;
  document.getElementById('permDirtyCount').textContent = dirtyCount;
  document.getElementById('permSaveBtn').disabled = (dirtyCount === 0);

  if (permCurrentRole === 'ADMIN') {
    content.innerHTML =
      '<div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">' +
        '<i class="fas fa-info-circle mr-1"></i>ADMIN 역할은 모든 페이지에 항상 접근·편집 가능하며, 편집할 수 없습니다. (설계 안전장치)' +
      '</div>';
    return;
  }

  var html = '';
  sectionOrder.forEach(function(section) {
    var pages = sections[section];
    var accessCount = pages.filter(function(p) { return permGetEffective(permCurrentRole, p.page_key).a; }).length;
    var totalInSection = pages.length;
    var allOn = (accessCount === totalInSection);
    var allOff = (accessCount === 0);

    html += '<div class="mb-5 border border-gray-200 rounded-lg overflow-hidden">';
    html += '<div class="bg-gray-50 px-4 py-3 flex items-center justify-between">';
    html += '<div class="flex items-center gap-2">';
    html += '<i class="fas fa-folder text-gray-400"></i>';
    html += '<span class="font-bold text-gray-900">' + permEscape(section) + '</span>';
    html += '<span class="text-xs text-gray-500">(열람 ' + accessCount + ' / ' + totalInSection + ')</span>';
    html += '</div>';
    html += '<div class="flex gap-1">';
    html += '<button onclick="permSetSection(\'' + permEscape(section) + '\', 1)" '
      + (allOn ? 'disabled ' : '')
      + 'class="px-3 py-1 text-xs rounded ' + (allOn ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-100 text-blue-700 hover:bg-blue-200') + '">전체 열람 ON</button>';
    html += '<button onclick="permSetSection(\'' + permEscape(section) + '\', 0)" '
      + (allOff ? 'disabled ' : '')
      + 'class="px-3 py-1 text-xs rounded ' + (allOff ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-100 text-gray-700 hover:bg-gray-200') + '">전체 OFF</button>';
    html += '</div>';
    html += '</div>';

    // 헤더 행 (열람/편집 라벨)
    html += '<div class="flex items-center px-4 py-1.5 bg-gray-50/50 text-[11px] font-semibold text-gray-400 border-t border-gray-100">';
    html += '<span class="w-14 text-center">열람</span><span class="w-14 text-center">편집</span><span class="flex-1"></span>';
    html += '</div>';

    html += '<div class="divide-y divide-gray-100">';
    pages.forEach(function(p) {
      var dirtyKey = permCurrentRole + ':' + p.page_key;
      var isDirty = permDirty[dirtyKey] !== undefined;
      var eff = permGetEffective(permCurrentRole, p.page_key);
      html += '<div class="flex items-center px-4 py-2 hover:bg-blue-50 ' + (isDirty ? 'bg-amber-50' : '') + '">';
      // 열람
      html += '<span class="w-14 text-center"><input type="checkbox" ' + (eff.a ? 'checked ' : '')
        + 'onchange="permToggleAccess(\'' + permEscape(p.page_key) + '\')" '
        + 'class="w-4 h-4 text-blue-600 rounded cursor-pointer"></span>';
      // 편집
      html += '<span class="w-14 text-center"><input type="checkbox" ' + (eff.e ? 'checked ' : '')
        + 'onchange="permToggleEdit(\'' + permEscape(p.page_key) + '\')" '
        + 'class="w-4 h-4 text-emerald-600 rounded cursor-pointer"></span>';
      html += '<i class="fas ' + permEscape(p.page_icon || 'fa-file') + ' text-gray-400 w-5 mr-2 ml-1"></i>';
      html += '<div class="flex-1">';
      html += '<div class="text-sm font-medium text-gray-900">' + permEscape(p.page_label) + '</div>';
      html += '<div class="text-xs text-gray-400 font-mono">' + permEscape(p.page_key) + '</div>';
      html += '</div>';
      if (isDirty) {
        html += '<span class="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">변경됨</span>';
      }
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';
  });

  content.innerHTML = html;
}

permLoad();
