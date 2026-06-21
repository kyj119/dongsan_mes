// 규격그룹 관리 스크립트 (prefix: sgp — ?raw 전역 스코프 충돌 방지)
// spec: docs/superpowers/specs/2026-06-20-spec-group-variant-item-plan.md §5

var sgpGroups = [];
var sgpSelectedId = null;
var sgpDetail = null;

function sgpEsc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s == null ? '' : String(s)) : (s == null ? '' : String(s)); }

// ===== 좌: 그룹 목록 =====
window.sgpLoad = async function() {
  var box = document.getElementById('sgpGroupList');
  if (!box) { console.warn('[specGroups] #sgpGroupList not found'); return; }
  try {
    var res = await axios.get('/api/spec-groups');
    sgpGroups = (res.data && res.data.data) || [];
    if (!sgpGroups.length) {
      box.innerHTML = '<div class="p-4 text-center text-gray-400 text-sm">규격그룹이 없습니다. "새 규격그룹"으로 추가하세요.</div>';
      return;
    }
    box.innerHTML = sgpGroups.map(function(g) {
      var active = sgpSelectedId === g.id;
      var inactive = !g.is_active;
      return '<div onclick="sgpSelect(' + g.id + ')" class="px-3 py-2.5 cursor-pointer hover:bg-indigo-50 transition-colors ' + (active ? 'bg-indigo-50 border-l-2 border-indigo-500' : '') + '">'
        + '<div class="flex items-center justify-between">'
        + '<div class="text-sm font-semibold ' + (inactive ? 'text-gray-400 line-through' : 'text-gray-800') + '">' + sgpEsc(g.name) + (g.unit ? ' <span class="text-xs font-normal text-gray-400">(' + sgpEsc(g.unit) + ')</span>' : '') + '</div>'
        + '<i class="fas fa-chevron-right text-[10px] text-gray-300"></i>'
        + '</div>'
        + '<div class="text-xs text-gray-500 mt-0.5">값 ' + (g.value_count || 0) + '개 · 품목 ' + (g.item_count || 0) + '개</div>'
        + '</div>';
    }).join('');
  } catch (e) {
    box.innerHTML = '<div class="p-4 text-center text-red-400 text-sm">로드 실패</div>';
  }
};

// ===== 우: 그룹 상세 (값 관리) =====
window.sgpSelect = async function(id) {
  sgpSelectedId = id;
  sgpLoad(); // 좌측 하이라이트 갱신
  var box = document.getElementById('sgpDetail');
  if (!box) return;
  box.innerHTML = '<div class="p-6 text-center text-gray-400 text-sm">로드 중...</div>';
  try {
    var res = await axios.get('/api/spec-groups/' + id);
    sgpDetail = (res.data && res.data.data) || null;
    sgpRenderDetail();
  } catch (e) {
    box.innerHTML = '<div class="p-6 text-center text-red-400 text-sm">로드 실패</div>';
  }
};

function sgpRenderDetail() {
  var box = document.getElementById('sgpDetail');
  if (!box || !sgpDetail) return;
  var g = sgpDetail;
  var values = g.values || [];
  var rows = values.map(function(v) {
    var inactive = !v.is_active;
    return '<tr class="' + (inactive ? 'opacity-40' : '') + '">'
      + '<td class="px-3 py-1.5 text-left font-mono text-xs text-gray-500">' + sgpEsc(v.value_code) + '</td>'
      + '<td class="px-3 py-1.5 text-left">' + sgpEsc(v.label) + '</td>'
      + '<td class="px-3 py-1.5 text-center text-xs text-gray-400">' + (v.sort_order || 0) + '</td>'
      + '<td class="px-3 py-1.5 text-center">' + (inactive
          ? '<span class="text-xs text-gray-400">비활성</span>'
          : '<span class="inline-flex items-center px-1.5 py-0.5 text-xs rounded-full bg-green-50 text-green-700">활성</span>') + '</td>'
      + '<td class="px-3 py-1.5 text-center whitespace-nowrap">'
      + '<button onclick="sgpEditValue(' + v.id + ')" class="text-indigo-500 hover:text-indigo-700 text-xs mr-2" title="라벨 수정"><i class="fas fa-pen"></i></button>'
      + (inactive
          ? '<button onclick="sgpToggleValue(' + v.id + ',1)" class="text-green-500 hover:text-green-700 text-xs" title="활성화"><i class="fas fa-rotate-left"></i></button>'
          : '<button onclick="sgpToggleValue(' + v.id + ',0)" class="text-red-400 hover:text-red-600 text-xs" title="비활성화"><i class="fas fa-ban"></i></button>')
      + '</td></tr>';
  }).join('');

  box.innerHTML =
    '<div class="ds-card overflow-hidden">'
    + '<div class="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">'
    + '<div><span class="text-base font-bold text-gray-800">' + sgpEsc(g.name) + '</span>'
    + (g.unit ? ' <span class="text-xs text-gray-400">단위: ' + sgpEsc(g.unit) + '</span>' : '') + '</div>'
    + '<div class="flex items-center gap-2">'
    + '<button onclick="sgpOpenGroupModal(' + g.id + ')" class="text-xs text-gray-500 hover:text-gray-700"><i class="fas fa-cog mr-1"></i>그룹 설정</button>'
    + '</div></div>'
    + '<div class="overflow-x-auto"><table class="w-full text-sm ds-table-striped ds-table-fixed">'
    + '<thead class="bg-gray-50 text-xs text-gray-600"><tr>'
    + '<th class="px-3 py-2 text-left" style="width:120px">코드</th>'
    + '<th class="px-3 py-2 text-left">라벨</th>'
    + '<th class="px-3 py-2 text-center" style="width:70px">정렬</th>'
    + '<th class="px-3 py-2 text-center" style="width:90px">상태</th>'
    + '<th class="px-3 py-2 text-center" style="width:110px">액션</th>'
    + '</tr></thead><tbody>'
    + (rows || '<tr><td colspan="5" class="text-center text-gray-400 py-4">값이 없습니다</td></tr>')
    + '</tbody></table></div>'
    // 값 추가 인라인
    + '<div class="p-3 border-t bg-gray-50 flex items-end gap-2 flex-wrap">'
    + '<div><label class="text-xs text-gray-500 block mb-0.5">코드 (ASCII)</label>'
    + '<input id="sgpNewCode" class="border rounded px-2 py-1 text-sm w-24" placeholder="5T / 7HO"></div>'
    + '<div><label class="text-xs text-gray-500 block mb-0.5">라벨</label>'
    + '<input id="sgpNewLabel" class="border rounded px-2 py-1 text-sm w-28" placeholder="5T / 7호"></div>'
    + '<div><label class="text-xs text-gray-500 block mb-0.5">정렬</label>'
    + '<input id="sgpNewSort" type="number" class="border rounded px-2 py-1 text-sm w-16" value="' + ((values.length + 1)) + '"></div>'
    + '<button onclick="sgpAddValue()" class="ds-btn ds-btn-primary px-3 py-1.5 text-xs"><i class="fas fa-plus mr-1"></i>값 추가</button>'
    + '</div>'
    + '</div>'
    + '<div class="text-xs text-gray-400 px-1">코드(value_code)는 품목코드 suffix로 박혀 불변입니다(예: P-0033-7HO). 라벨·정렬·활성만 수정 가능. 값 비활성화는 기존 변종품목에 영향 없습니다.</div>'
    + sgpRenderBases();
}

// base 품목 섹션 (이 그룹으로 변종 생성)
function sgpRenderBases() {
  var g = sgpDetail;
  var bases = (g && g.bases) || [];
  var baseRows = bases.map(function(b) {
    var inactive = !b.is_active;
    var axes = sgpEsc(b.group1_name || '') + (b.group2_name ? ' <span class="text-gray-300">×</span> ' + sgpEsc(b.group2_name) : '');
    return '<tr>'
      + '<td class="px-3 py-1.5 text-left font-mono text-xs text-gray-500">' + sgpEsc(b.item_code) + '</td>'
      + '<td class="px-3 py-1.5 text-left ds-wrap">' + sgpEsc(b.item_name) + (inactive ? ' <span class="text-[10px] text-amber-500">(비활성)</span>' : '')
        + '<div class="text-[10px] text-indigo-400">' + axes + (b.group2_name ? ' <span class="text-purple-400">(2축)</span>' : '') + '</div></td>'
      + '<td class="px-3 py-1.5 text-center text-xs text-gray-500">' + (b.variant_count || 0) + '개</td>'
      + '<td class="px-3 py-1.5 text-center whitespace-nowrap">'
      + '<button onclick="sgpOpenVariantModal(' + b.id + ')" class="ds-btn ds-btn-primary px-2 py-1 text-xs mr-1"><i class="fas fa-wand-magic-sparkles mr-1"></i>변종 생성</button>'
      + '<button onclick="sgpDisconnectBase(' + b.id + ',' + (b.spec_group_id2 && b.spec_group_id2 === sgpSelectedId ? 2 : 1) + ')" class="text-red-400 hover:text-red-600 text-xs" title="이 그룹 연결 해제"><i class="fas fa-unlink"></i></button>'
      + '</td></tr>';
  }).join('');
  return '<div class="ds-card overflow-hidden mt-4">'
    + '<div class="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">'
    + '<div class="text-sm font-semibold text-gray-700"><i class="fas fa-cubes mr-1 text-indigo-400"></i>이 그룹으로 변종 만드는 품목</div>'
    + '<button onclick="sgpOpenConnectModal()" class="text-xs text-indigo-600 hover:underline"><i class="fas fa-plus mr-1"></i>품목 연결</button>'
    + '</div>'
    + '<div class="overflow-x-auto"><table class="w-full text-sm ds-table-striped ds-table-fixed">'
    + '<thead class="bg-gray-50 text-xs text-gray-600"><tr>'
    + '<th class="px-3 py-2 text-left" style="width:120px">코드</th>'
    + '<th class="px-3 py-2 text-left">품목명</th>'
    + '<th class="px-3 py-2 text-center" style="width:80px">변종수</th>'
    + '<th class="px-3 py-2 text-center" style="width:160px">액션</th>'
    + '</tr></thead><tbody>'
    + (baseRows || '<tr><td colspan="4" class="text-center text-gray-400 py-4">연결된 품목이 없습니다. "품목 연결"로 추가하세요.</td></tr>')
    + '</tbody></table></div></div>';
}

// ===== 변종 생성 (1D / 2D 다축) =====
var sgpAxis1 = null; // {id, name, values:[]}
var sgpAxis2 = null;

async function sgpFetchAxis(groupId) {
  if (!groupId) return null;
  try {
    var r = await axios.get('/api/spec-groups/' + groupId);
    var d = r.data.data;
    return { id: d.id, name: d.name, values: (d.values || []).filter(function(v) { return v.is_active; }) };
  } catch (e) { return null; }
}

window.sgpOpenVariantModal = async function(baseId) {
  var b = ((sgpDetail && sgpDetail.bases) || []).find(function(x) { return x.id === baseId; });
  if (!b) return;
  var modal = document.getElementById('sgpVariantModal');
  if (!modal) return;
  document.getElementById('sgpVariantBaseId').value = baseId;
  document.getElementById('sgpVariantTitle').textContent = '변종 생성 — ' + b.item_name;
  var box = document.getElementById('sgpVariantValues');
  if (box) box.innerHTML = '<div class="col-span-2 text-center text-gray-400 text-sm py-4">로드 중...</div>';
  modal.classList.remove('hidden');
  sgpAxis1 = await sgpFetchAxis(b.spec_group_id);
  sgpAxis2 = b.spec_group_id2 ? await sgpFetchAxis(b.spec_group_id2) : null;
  sgpRenderVariantModal();
};

function sgpRenderVariantModal() {
  var box = document.getElementById('sgpVariantValues');
  if (!box) return;
  var hint = document.getElementById('sgpVariantHint');
  function col(axis, cls) {
    if (!axis || !axis.values.length) return '<div class="text-xs text-gray-400 py-2">활성 값 없음</div>';
    return axis.values.map(function(v) {
      return '<label class="flex items-center gap-2 px-2 py-1.5 border rounded text-sm cursor-pointer hover:bg-indigo-50">'
        + '<input type="checkbox" class="' + cls + ' rounded" value="' + sgpEsc(v.value_code) + '" checked>'
        + '<span>' + sgpEsc(v.label) + ' <span class="text-[10px] text-gray-400 font-mono">' + sgpEsc(v.value_code) + '</span></span>'
        + '</label>';
    }).join('');
  }
  if (sgpAxis2) {
    if (hint) hint.textContent = '2축(' + sgpAxis1.name + ' × ' + sgpAxis2.name + ') 조합으로 생성됩니다. 이미 존재하는 변종은 건너뜁니다.';
    box.className = 'grid grid-cols-2 gap-3 max-h-72 overflow-y-auto';
    box.innerHTML = '<div><div class="text-xs font-semibold text-gray-600 mb-1">' + sgpEsc(sgpAxis1.name) + '</div><div class="space-y-1">' + col(sgpAxis1, 'sgp-variant-val') + '</div></div>'
      + '<div><div class="text-xs font-semibold text-gray-600 mb-1">' + sgpEsc(sgpAxis2.name) + '</div><div class="space-y-1">' + col(sgpAxis2, 'sgp-variant-val2') + '</div></div>';
  } else {
    if (hint) hint.textContent = '생성할 규격값을 선택하세요. 이미 존재하는 변종은 건너뜁니다(멱등).';
    box.className = 'grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto';
    box.innerHTML = col(sgpAxis1, 'sgp-variant-val');
  }
}

window.sgpCloseVariantModal = function() {
  var modal = document.getElementById('sgpVariantModal');
  if (modal) modal.classList.add('hidden');
};

window.sgpVariantCheckAll = function(checked) {
  document.querySelectorAll('.sgp-variant-val, .sgp-variant-val2').forEach(function(el) { el.checked = checked; });
};

window.sgpGenerateVariants = async function() {
  var baseId = parseInt(document.getElementById('sgpVariantBaseId').value) || 0;
  if (!baseId) return;
  var codes = [], codes2 = [];
  document.querySelectorAll('.sgp-variant-val:checked').forEach(function(el) { codes.push(el.value); });
  document.querySelectorAll('.sgp-variant-val2:checked').forEach(function(el) { codes2.push(el.value); });
  if (!codes.length) { alert((sgpAxis2 ? sgpAxis1.name : '') + ' 규격값을 선택하세요.'); return; }
  if (sgpAxis2 && !codes2.length) { alert(sgpAxis2.name + ' 규격값을 선택하세요.'); return; }
  var payload = { value_codes: codes };
  if (sgpAxis2) payload.value_codes2 = codes2;
  try {
    var res = await axios.post('/api/items/' + baseId + '/generate-variants', payload);
    var d = (res.data && res.data.data) || {};
    alert('변종 ' + (d.created_count || 0) + '개 생성, ' + (d.skipped_count || 0) + '개 기존 유지');
    sgpCloseVariantModal();
    sgpSelect(sgpSelectedId);
    sgpLoad();
  } catch (e) {
    alert((e.response && e.response.data && e.response.data.error) || '변종 생성 실패');
  }
};

// ===== base 품목 연결 (기존 품목에 spec_group_id 지정) =====
var sgpConnectTimer = null;
window.sgpOpenConnectModal = function() {
  var modal = document.getElementById('sgpConnectModal');
  if (!modal) return;
  var s = document.getElementById('sgpConnectSearch');
  if (s) s.value = '';
  var r = document.getElementById('sgpConnectResults');
  if (r) r.innerHTML = '<div class="p-3 text-center text-gray-400 text-xs">품목명을 입력하세요.</div>';
  modal.classList.remove('hidden');
  if (s) s.focus();
};

window.sgpCloseConnectModal = function() {
  var modal = document.getElementById('sgpConnectModal');
  if (modal) modal.classList.add('hidden');
};

window.sgpConnectSearchDebounced = function() {
  if (sgpConnectTimer) clearTimeout(sgpConnectTimer);
  sgpConnectTimer = setTimeout(sgpConnectSearch, 250);
};

async function sgpConnectSearch() {
  var s = document.getElementById('sgpConnectSearch');
  var r = document.getElementById('sgpConnectResults');
  if (!s || !r) return;
  var q = (s.value || '').trim();
  if (!q) { r.innerHTML = '<div class="p-3 text-center text-gray-400 text-xs">품목명을 입력하세요.</div>'; return; }
  try {
    var res = await axios.get('/api/items?search=' + encodeURIComponent(q) + '&limit=20&include_inactive=1');
    var items = (res.data && res.data.data) || [];
    if (!items.length) { r.innerHTML = '<div class="p-3 text-center text-gray-400 text-xs">검색 결과 없음</div>'; return; }
    r.innerHTML = items.map(function(it) {
      var already = it.spec_group_id === sgpSelectedId || it.spec_group_id2 === sgpSelectedId;
      var variant = it.spec_value != null && it.spec_value !== '';
      return '<div class="px-3 py-2 flex items-center justify-between text-sm hover:bg-gray-50">'
        + '<div><span class="font-mono text-xs text-gray-400 mr-2">' + sgpEsc(it.item_code) + '</span>' + sgpEsc(it.item_name) + '</div>'
        + (variant ? '<span class="text-[10px] text-gray-400">변종품목</span>'
            : already ? '<span class="text-[10px] text-green-600">연결됨</span>'
            : '<button onclick="sgpConnectItem(' + it.id + ')" class="text-indigo-600 hover:underline text-xs">연결</button>')
        + '</div>';
    }).join('');
  } catch (e) {
    r.innerHTML = '<div class="p-3 text-center text-red-400 text-xs">검색 실패</div>';
  }
}

window.sgpConnectItem = async function(itemId) {
  if (!sgpSelectedId) return;
  try {
    var r = await axios.get('/api/items/' + itemId);
    var it = r.data.data;
    var patch = {};
    if (!it.spec_group_id || it.spec_group_id === sgpSelectedId) patch.spec_group_id = sgpSelectedId;
    else if (!it.spec_group_id2 || it.spec_group_id2 === sgpSelectedId) patch.spec_group_id2 = sgpSelectedId; // 2번째 축
    else { alert('이 품목은 이미 규격그룹 2개에 연결돼 있습니다.'); return; }
    await axios.patch('/api/items/' + itemId, patch);
    sgpCloseConnectModal();
    sgpSelect(sgpSelectedId);
    sgpLoad();
  } catch (e) {
    alert((e.response && e.response.data && e.response.data.error) || '연결 실패');
  }
};

window.sgpDisconnectBase = async function(baseId, axis) {
  if (!confirm('이 품목의 규격그룹 연결을 해제하시겠습니까? (기존 변종품목은 그대로 유지됩니다)')) return;
  var patch = (axis === 2) ? { spec_group_id2: null } : { spec_group_id: null };
  try {
    await axios.patch('/api/items/' + baseId, patch);
    sgpSelect(sgpSelectedId);
    sgpLoad();
  } catch (e) {
    alert((e.response && e.response.data && e.response.data.error) || '해제 실패');
  }
};

// ===== 값 추가/수정/토글 =====
window.sgpAddValue = async function() {
  if (!sgpSelectedId) return;
  var codeEl = document.getElementById('sgpNewCode');
  var labelEl = document.getElementById('sgpNewLabel');
  var sortEl = document.getElementById('sgpNewSort');
  if (!codeEl || !labelEl) return;
  var code = (codeEl.value || '').trim();
  var label = (labelEl.value || '').trim();
  if (!code || !label) { alert('코드와 라벨을 입력하세요.'); return; }
  try {
    await axios.post('/api/spec-groups/' + sgpSelectedId + '/values', {
      value_code: code, label: label, sort_order: parseInt(sortEl && sortEl.value) || 0
    });
    sgpSelect(sgpSelectedId);
    sgpLoad();
  } catch (e) {
    alert((e.response && e.response.data && e.response.data.error) || '추가 실패');
  }
};

window.sgpEditValue = async function(valueId) {
  var v = (sgpDetail && sgpDetail.values || []).find(function(x) { return x.id === valueId; });
  if (!v) return;
  var label = prompt('라벨 수정 (코드 ' + v.value_code + ')', v.label);
  if (label === null) return;
  label = label.trim();
  if (!label) return;
  try {
    await axios.put('/api/spec-groups/values/' + valueId, { label: label });
    sgpSelect(sgpSelectedId);
  } catch (e) {
    alert((e.response && e.response.data && e.response.data.error) || '수정 실패');
  }
};

window.sgpToggleValue = async function(valueId, active) {
  try {
    await axios.put('/api/spec-groups/values/' + valueId, { is_active: active });
    sgpSelect(sgpSelectedId);
    sgpLoad();
  } catch (e) {
    alert((e.response && e.response.data && e.response.data.error) || '변경 실패');
  }
};

// ===== 그룹 생성/수정 모달 =====
window.sgpOpenGroupModal = function(id) {
  var modal = document.getElementById('sgpGroupModal');
  if (!modal) return;
  var g = id ? sgpGroups.find(function(x) { return x.id === id; }) || (sgpDetail && sgpDetail.id === id ? sgpDetail : null) : null;
  document.getElementById('sgpGroupId').value = id || 0;
  document.getElementById('sgpGroupModalTitle').textContent = id ? '규격그룹 수정' : '새 규격그룹';
  document.getElementById('sgpGroupName').value = g ? g.name : '';
  document.getElementById('sgpGroupUnit').value = g ? (g.unit || '') : '';
  document.getElementById('sgpGroupSort').value = g ? (g.sort_order || 0) : (sgpGroups.length + 1);
  modal.classList.remove('hidden');
};

window.sgpCloseGroupModal = function() {
  var modal = document.getElementById('sgpGroupModal');
  if (modal) modal.classList.add('hidden');
};

window.sgpSaveGroup = async function() {
  var id = parseInt(document.getElementById('sgpGroupId').value) || 0;
  var name = (document.getElementById('sgpGroupName').value || '').trim();
  var unit = (document.getElementById('sgpGroupUnit').value || '').trim();
  var sort = parseInt(document.getElementById('sgpGroupSort').value) || 0;
  if (!name) { alert('그룹명을 입력하세요.'); return; }
  try {
    if (id) {
      await axios.put('/api/spec-groups/' + id, { name: name, unit: unit, sort_order: sort });
    } else {
      var res = await axios.post('/api/spec-groups', { name: name, unit: unit, sort_order: sort });
      id = res.data && res.data.data && res.data.data.id;
    }
    sgpCloseGroupModal();
    await sgpLoad();
    if (id) sgpSelect(id);
  } catch (e) {
    alert((e.response && e.response.data && e.response.data.error) || '저장 실패');
  }
};

// ===== 초기화 =====
(function() {
  sgpLoad();
})();
