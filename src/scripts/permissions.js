// 권한 관리 페이지 스크립트
// /api/permissions/matrix 로 데이터 로드 → 매트릭스 렌더 → 변경분만 PATCH 전송

var permPages = [];                // 페이지 마스터
var permMatrix = { ADMIN:{}, MANAGER:{}, DESIGNER:{}, OPERATOR:{} };  // {role: {page_key: 1}}
var permDirty = {};                // 변경분: { 'MANAGER:/orders': { role, page_key, can_access } }
var permCurrentRole = 'MANAGER';   // 활성 탭

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
    permMatrix = Object.assign({ ADMIN:{}, MANAGER:{}, DESIGNER:{}, OPERATOR:{} }, res.data.data.matrix || {});
    permDirty = {};
    permRender();
  } catch (e) {
    console.error('permLoad error:', e);
    var msg = e.response && e.response.status === 403
      ? 'ADMIN 만 접근 가능합니다.' : '로드 실패: ' + (e.message || e);
    document.getElementById('permContent').innerHTML =
      '<div class="text-center text-red-500 py-12">' + permEscape(msg) + '</div>';
  }
}

function permSwitchRole(role) {
  permCurrentRole = role;
  ['MANAGER','DESIGNER','OPERATOR'].forEach(function(r) {
    var btn = document.getElementById('permTab' + r);
    if (!btn) return;
    if (r === role) {
      btn.className = 'px-6 py-3 text-sm font-semibold border-b-2 border-blue-600 text-blue-600';
    } else {
      btn.className = 'px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700';
    }
  });
  permRender();
}

function permGetEffective(role, pageKey) {
  // dirty 우선
  var key = role + ':' + pageKey;
  if (permDirty[key] !== undefined) return permDirty[key].can_access ? 1 : 0;
  return (permMatrix[role] && permMatrix[role][pageKey]) ? 1 : 0;
}

function permToggle(pageKey) {
  if (permCurrentRole === 'ADMIN') return;
  var current = permGetEffective(permCurrentRole, pageKey);
  var next = current ? 0 : 1;
  var key = permCurrentRole + ':' + pageKey;
  var original = (permMatrix[permCurrentRole] && permMatrix[permCurrentRole][pageKey]) ? 1 : 0;
  if (next === original) {
    delete permDirty[key];   // 원복
  } else {
    permDirty[key] = { role: permCurrentRole, page_key: pageKey, can_access: next };
  }
  permRender();
}

function permSetSection(section, value) {
  if (permCurrentRole === 'ADMIN') return;
  permPages.filter(function(p) { return p.page_section === section; }).forEach(function(p) {
    var key = permCurrentRole + ':' + p.page_key;
    var original = (permMatrix[permCurrentRole] && permMatrix[permCurrentRole][p.page_key]) ? 1 : 0;
    if (value === original) {
      delete permDirty[key];
    } else {
      permDirty[key] = { role: permCurrentRole, page_key: p.page_key, can_access: value };
    }
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

  // 섹션별 그룹핑 (sort_order 유지)
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
        '<i class="fas fa-info-circle mr-1"></i>ADMIN 역할은 모든 페이지에 항상 접근 가능하며, 편집할 수 없습니다. (설계 안전장치)' +
      '</div>';
    return;
  }

  var html = '';
  sectionOrder.forEach(function(section) {
    var pages = sections[section];
    var enabledInSection = pages.filter(function(p) { return permGetEffective(permCurrentRole, p.page_key); }).length;
    var totalInSection = pages.length;
    var allOn = (enabledInSection === totalInSection);
    var allOff = (enabledInSection === 0);

    html += '<div class="mb-5 border border-gray-200 rounded-lg overflow-hidden">';
    html += '<div class="bg-gray-50 px-4 py-3 flex items-center justify-between">';
    html += '<div class="flex items-center gap-2">';
    html += '<i class="fas fa-folder text-gray-400"></i>';
    html += '<span class="font-bold text-gray-900">' + permEscape(section) + '</span>';
    html += '<span class="text-xs text-gray-500">(' + enabledInSection + ' / ' + totalInSection + ')</span>';
    html += '</div>';
    html += '<div class="flex gap-1">';
    html += '<button onclick="permSetSection(\'' + permEscape(section) + '\', 1)" '
      + (allOn ? 'disabled ' : '')
      + 'class="px-3 py-1 text-xs rounded ' + (allOn ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-100 text-blue-700 hover:bg-blue-200') + '">전체 ON</button>';
    html += '<button onclick="permSetSection(\'' + permEscape(section) + '\', 0)" '
      + (allOff ? 'disabled ' : '')
      + 'class="px-3 py-1 text-xs rounded ' + (allOff ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-100 text-gray-700 hover:bg-gray-200') + '">전체 OFF</button>';
    html += '</div>';
    html += '</div>';

    html += '<div class="divide-y divide-gray-100">';
    pages.forEach(function(p) {
      var dirtyKey = permCurrentRole + ':' + p.page_key;
      var isDirty = permDirty[dirtyKey] !== undefined;
      var enabled = permGetEffective(permCurrentRole, p.page_key);
      html += '<label class="flex items-center px-4 py-2 hover:bg-blue-50 cursor-pointer ' + (isDirty ? 'bg-amber-50' : '') + '">';
      html += '<input type="checkbox" ' + (enabled ? 'checked ' : '')
        + 'onchange="permToggle(\'' + permEscape(p.page_key) + '\')" '
        + 'class="w-4 h-4 mr-3 text-blue-600 rounded">';
      html += '<i class="fas ' + permEscape(p.page_icon || 'fa-file') + ' text-gray-400 w-5 mr-2"></i>';
      html += '<div class="flex-1">';
      html += '<div class="text-sm font-medium text-gray-900">' + permEscape(p.page_label) + '</div>';
      html += '<div class="text-xs text-gray-400 font-mono">' + permEscape(p.page_key) + '</div>';
      html += '</div>';
      if (isDirty) {
        html += '<span class="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">변경됨</span>';
      }
      html += '</label>';
    });
    html += '</div>';
    html += '</div>';
  });

  content.innerHTML = html;
}

permLoad();
