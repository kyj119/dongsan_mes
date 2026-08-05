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

// 초기 로드는 /hr '부문 관리' 탭 최초 열람 시 hr.js(hrSwitchTab)가 lazy 호출.
// (이 스크립트는 /hr pageScript에 concat 되어 loadDepartmentsPage 등이 전역 함수로 노출됨)

// ── 부문 손익 (P2: 매출·자재비·인건비 → 공헌이익) ──
function deptFmtWon(n) { return (Number(n) || 0).toLocaleString('ko-KR'); }

function deptDefaultPnlRange() {
  // 당월 1일 ~ 오늘 (KST)
  var now = new Date(Date.now() + 9 * 3600 * 1000);
  var pad = function (x) { return (x < 10 ? '0' : '') + x; };
  var first = now.getUTCFullYear() + '-' + pad(now.getUTCMonth() + 1) + '-01';
  var today = now.toISOString().slice(0, 10);
  return { from: first, to: today };
}

async function loadDeptPnl() {
  var fromEl = document.getElementById('deptPnlFrom');
  var toEl = document.getElementById('deptPnlTo');
  if (!fromEl || !toEl) { console.warn('[departments] pnl inputs not found'); return; }
  if (!fromEl.value || !toEl.value) {
    var d = deptDefaultPnlRange();
    if (!fromEl.value) fromEl.value = d.from;
    if (!toEl.value) toEl.value = d.to;
  }
  var basisEl = document.getElementById('deptPnlBasis');
  var basis = basisEl ? basisEl.value : 'revenue';
  var body = document.getElementById('deptPnlBody');
  if (body) body.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-gray-400">조회 중...</td></tr>';
  try {
    var res = await axios.get('/api/departments/pnl', { params: { from: fromEl.value, to: toEl.value, basis: basis } });
    if (res.data.success) renderDeptPnl(res.data.data);
    else if (typeof showToast === 'function') showToast(res.data.error || '조회 실패', 'error');
  } catch (err) {
    if (typeof showToast === 'function') showToast('손익 조회 실패: ' + ((err.response && err.response.data && err.response.data.error) || err.message), 'error');
  }
}

function renderDeptPnl(data) {
  var body = document.getElementById('deptPnlBody');
  var foot = document.getElementById('deptPnlFoot');
  var empty = document.getElementById('deptPnlEmpty');
  var poolEl = document.getElementById('deptPnlPool');
  if (!body) return;
  if (empty) empty.classList.add('hidden');
  var rows = (data && data.rows) || [];
  var html = rows.map(function (r) {
    var contribCls = r.contribution < 0 ? 'text-red-600' : 'text-gray-700';
    var opCls = r.operating_profit < 0 ? 'text-red-600' : 'text-gray-900';
    var alloc = (r.serves_alloc || 0) + (r.common_alloc || 0);
    var allocTitle = '지원 직접귀속 ' + deptFmtWon(r.serves_alloc) + ' + 공통 안분 ' + deptFmtWon(r.common_alloc);
    var opm = (r.op_margin == null) ? '-' : (r.op_margin + '%');
    return '<tr class="border-b border-gray-100">'
      + '<td class="px-3 py-2 font-medium text-gray-900">' + deptEscAttr(r.name) + '</td>'
      + '<td class="px-3 py-2 text-right tabular-nums">' + deptFmtWon(r.revenue) + '</td>'
      + '<td class="px-3 py-2 text-right tabular-nums text-gray-500">' + deptFmtWon(r.material) + '</td>'
      + '<td class="px-3 py-2 text-right tabular-nums text-gray-500">' + deptFmtWon(r.labor) + '</td>'
      + '<td class="px-3 py-2 text-right tabular-nums ' + contribCls + '">' + deptFmtWon(r.contribution) + '</td>'
      + '<td class="px-3 py-2 text-right tabular-nums text-gray-500" title="이 부문에 지정된 고정자산의 감가상각비">' + deptFmtWon(r.depreciation) + '</td>'
      + '<td class="px-3 py-2 text-right tabular-nums text-gray-500" title="' + allocTitle + '">' + deptFmtWon(alloc) + '</td>'
      + '<td class="px-3 py-2 text-right tabular-nums font-semibold ' + opCls + '">' + deptFmtWon(r.operating_profit) + '</td>'
      + '<td class="px-3 py-2 text-right tabular-nums text-gray-500">' + opm + '</td>'
      + '</tr>';
  }).join('');
  var u = (data && data.unclassified) || { revenue: 0, material: 0 };
  if (u.revenue || u.material) {
    html += '<tr class="border-b border-gray-100 text-gray-400">'
      + '<td class="px-3 py-2">(미분류)</td>'
      + '<td class="px-3 py-2 text-right tabular-nums">' + deptFmtWon(u.revenue) + '</td>'
      + '<td class="px-3 py-2 text-right tabular-nums">' + deptFmtWon(u.material) + '</td>'
      + '<td class="px-3 py-2 text-gray-400" colspan="6">배부 제외(미매핑)</td>'
      + '</tr>';
  }
  body.innerHTML = html || '<tr><td colspan="9" class="text-center py-6 text-gray-400">데이터 없음</td></tr>';
  if (foot) {
    var t = (data && data.totals) || {};
    foot.innerHTML = '<tr>'
      + '<td class="px-3 py-2">합계</td>'
      + '<td class="px-3 py-2 text-right tabular-nums">' + deptFmtWon(t.revenue) + '</td>'
      + '<td class="px-3 py-2 text-right tabular-nums">' + deptFmtWon(t.material) + '</td>'
      + '<td class="px-3 py-2 text-right tabular-nums">' + deptFmtWon(t.labor) + '</td>'
      + '<td class="px-3 py-2 text-right tabular-nums">' + deptFmtWon(t.contribution) + '</td>'
      + '<td class="px-3 py-2 text-right tabular-nums" title="직접귀속+serves+공통 전부 포함한 전체 감가상각">' + deptFmtWon(t.depreciation) + '</td>'
      + '<td class="px-3 py-2"></td>'
      + '<td class="px-3 py-2 text-right tabular-nums ' + ((t.operating_profit < 0) ? 'text-red-600' : '') + '">' + deptFmtWon(t.operating_profit) + '</td>'
      + '<td class="px-3 py-2"></td>'
      + '</tr>';
  }
  // 공통비·지원부문 배부 풀
  if (poolEl) {
    var pool = (data && data.pool) || { support_common_labor: 0, fixed_common: 0, total: 0 };
    var sd = (data && data.support_detail) || [];
    var basisLabel = ({ revenue: '매출비례', headcount: '인원비례', labor: '인건비비례' })[(data && data.basis) || 'revenue'] || '매출비례';
    var sdHtml = sd.map(function (s) {
      return '<div class="flex justify-between py-0.5"><span class="text-gray-600">' + deptEscAttr(s.name)
        + ' <span class="text-xs text-gray-400">(' + deptEscAttr(s.target) + ')</span></span>'
        + '<span class="tabular-nums text-gray-700">' + deptFmtWon(s.labor) + '</span></div>';
    }).join('');
    poolEl.classList.remove('hidden');
    poolEl.innerHTML = '<div class="flex items-center justify-between mb-2"><h4 class="text-sm font-bold text-gray-900">공통비·지원부문 배부 풀</h4>'
      + '<span class="text-xs text-gray-400">배부기준: ' + basisLabel + '</span></div>'
      + '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">'
      + '<div>' + (sdHtml || '<span class="text-gray-400">지원부문 인건비 없음</span>') + '</div>'
      + '<div class="space-y-0.5">'
      + '<div class="flex justify-between"><span class="text-gray-600">공통 안분 인건비(봉제·관리 등)</span><span class="tabular-nums">' + deptFmtWon(pool.support_common_labor) + '</span></div>'
      + '<div class="flex justify-between"><span class="text-gray-600">고정비(임대·통신·전기 등)</span><span class="tabular-nums">' + deptFmtWon(pool.fixed_common) + '</span></div>'
      + '<div class="flex justify-between"><span class="text-gray-600">감가상각(부문 미지정)<span class="text-xs text-gray-400 ml-1">← 자산에 부문 지정 시 줄어듦</span></span><span class="tabular-nums">' + deptFmtWon(pool.common_depreciation) + '</span></div>'
      + '<div class="flex justify-between border-t border-gray-200 pt-1 mt-1 font-semibold"><span>공통풀 합계(생산부문 안분)</span><span class="tabular-nums">' + deptFmtWon(pool.total) + '</span></div>'
      + '</div></div>';
  }
}
