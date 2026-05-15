// 연차 관리 (Phase B3)
// IIFE 호이스팅 버그 방지: window.foo 할당은 IIFE 위, IIFE는 파일 맨 아래

// Skeleton loading
(function() {
  var el = document.getElementById('lvBalancesBody');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(5, 7);
})();

var lvCurrentTab = 'balances';
var lvEmployees = [];

function lvEscapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function lvFmtNum(n) {
  if (n == null) return '0';
  var v = parseFloat(n) || 0;
  return (Math.round(v * 10) / 10).toString();
}

function lvStatusBadge(status) {
  var map = {
    PENDING: '<span class="px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-700">결재대기</span>',
    APPROVED: '<span class="px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700">승인</span>',
    REJECTED: '<span class="px-2 py-0.5 text-xs rounded-full bg-red-50 text-red-700">반려</span>',
  };
  return map[status] || '<span class="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">' + status + '</span>';
}

function lvLeaveTypeLabel(t) {
  var map = {
    ANNUAL: '연차', HALF_AM: '오전반차', HALF_PM: '오후반차',
    QUARTER_1: '반반차(08:30~10:00)', QUARTER_2: '반반차(10:00~12:00)',
    QUARTER_3: '반반차(13:00~16:00)', QUARTER_4: '반반차(16:00~18:00)',
    SICK: '병가', FAMILY_EVENT: '경조휴가', PERSONAL: '개인사유', MATERNITY: '출산/육아'
  };
  return map[t] || t;
}

window.leavesSwitchTab = function(tab) {
  lvCurrentTab = tab;
  var panes = ['lvPaneBalances', 'lvPaneRequests', 'lvPaneAllowance'];
  var tabs = ['lvTabBalances', 'lvTabRequests', 'lvTabAllowance'];
  var activeClass = 'px-4 py-2 text-sm font-medium border-b-2 border-blue-600 text-blue-600';
  var inactiveClass = 'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500';
  panes.forEach(function(p) { var el = document.getElementById(p); if (el) el.classList.add('hidden'); });
  tabs.forEach(function(t) { var el = document.getElementById(t); if (el) el.className = inactiveClass; });
  if (tab === 'balances') {
    document.getElementById('lvPaneBalances').classList.remove('hidden');
    document.getElementById('lvTabBalances').className = activeClass;
    window.leavesLoadBalances();
  } else if (tab === 'requests') {
    document.getElementById('lvPaneRequests').classList.remove('hidden');
    document.getElementById('lvTabRequests').className = activeClass;
    window.leavesLoadRequests();
  } else if (tab === 'allowance') {
    document.getElementById('lvPaneAllowance').classList.remove('hidden');
    document.getElementById('lvTabAllowance').className = activeClass;
    window.leavesLoadAllowance();
  }
};

window.leavesLoadBalances = async function() {
  var year = document.getElementById('lvYear').value || new Date().getFullYear();
  var tbody = document.getElementById('lvBalancesBody');
  tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-400 py-6"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>로딩 중...</td></tr>';
  try {
    var res = await axios.get('/api/leaves/balances', { params: { year: year } });
    var rows = res.data.data || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-400 py-6">데이터 없음</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function(r) {
      var remaining = parseFloat(r.remaining) || 0;
      var remColor = remaining <= 0 ? 'text-red-600' : (remaining < 3 ? 'text-amber-600' : 'text-gray-900');
      return '<tr>' +
        '<td class="px-3 py-2">' + (r.employee_code || '-') + '</td>' +
        '<td class="px-3 py-2 font-medium">' + (r.name || '-') + '</td>' +
        '<td class="px-3 py-2 text-gray-600">' + (r.department || '-') + '</td>' +
        '<td class="px-3 py-2 text-gray-600">' + (r.position || '-') + '</td>' +
        '<td class="px-3 py-2 text-gray-600">' + (r.hire_date || '-') + '</td>' +
        '<td class="px-3 py-2 text-right">' + lvFmtNum(r.accrued) + '</td>' +
        '<td class="px-3 py-2 text-right">' + lvFmtNum(r.granted_extra) + '</td>' +
        '<td class="px-3 py-2 text-right">' + lvFmtNum(r.used) + '</td>' +
        '<td class="px-3 py-2 text-right font-bold ' + remColor + '">' + lvFmtNum(remaining) + '</td>' +
      '</tr>';
    }).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-red-500 py-6">조회 실패: ' + (e.response && e.response.data && e.response.data.error || e.message) + '</td></tr>';
  }
};

window.leavesLoadRequests = async function() {
  var status = document.getElementById('lvReqStatus').value;
  var tbody = document.getElementById('lvRequestsBody');
  tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-400 py-6"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>로딩 중...</td></tr>';
  try {
    var res = await axios.get('/api/leaves/requests', { params: status ? { status: status } : {} });
    var rows = res.data.data || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-400 py-6">신청 내역 없음</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function(r) {
      var actions = '';
      if (r.status === 'PENDING') {
        actions = '<button onclick="leavesApprove(' + r.id + ')" class="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 mr-1">승인</button>' +
                  '<button onclick="leavesReject(' + r.id + ')" class="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700">반려</button>';
      }
      return '<tr>' +
        '<td class="px-3 py-2 text-gray-600">' + (r.created_at || '').slice(0, 10) + '</td>' +
        '<td class="px-3 py-2">' + (r.employee_code || '') + ' / <span class="font-medium">' + (r.employee_name || '-') + '</span></td>' +
        '<td class="px-3 py-2 text-gray-600">' + (r.department || '-') + '</td>' +
        '<td class="px-3 py-2">' + lvLeaveTypeLabel(r.leave_type) + '</td>' +
        '<td class="px-3 py-2 text-gray-600">' + r.start_date + ' ~ ' + r.end_date + '</td>' +
        '<td class="px-3 py-2 text-right">' + lvFmtNum(r.days) + '</td>' +
        '<td class="px-3 py-2 text-gray-600">' + (r.reason || '-') + '</td>' +
        '<td class="px-3 py-2 text-center">' + lvStatusBadge(r.status) + '</td>' +
        '<td class="px-3 py-2 text-center">' + actions + '</td>' +
      '</tr>';
    }).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-red-500 py-6">조회 실패: ' + (e.response && e.response.data && e.response.data.error || e.message) + '</td></tr>';
  }
};

window.leavesRunMonthly = async function() {
  if (!(await showConfirm('입사 1년 미만 직원의 월차를 자동 적립합니다. 진행할까요?'))) return;
  try {
    var res = await axios.post('/api/leaves/accrual/monthly');
    window.showToast('월차 적립 완료: ' + res.data.processed + '명 처리', 'success');
    window.leavesLoadBalances();
  } catch (e) {
    window.showToast('실행 실패: ' + (e.response && e.response.data && e.response.data.error || e.message), 'error');
  }
};

window.leavesRunYearly = async function() {
  if (!(await showConfirm('1년차 이상 직원에게 연간 연차를 부여합니다. 연 1회만 실행해야 합니다. 진행할까요?'))) return;
  try {
    var res = await axios.post('/api/leaves/accrual/yearly');
    window.showToast('연간 부여 완료: ' + res.data.processed + '명 처리', 'success');
    window.leavesLoadBalances();
  } catch (e) {
    window.showToast('실행 실패: ' + (e.response && e.response.data && e.response.data.error || e.message), 'error');
  }
};

// 직원 검색 자동완성 공통 로직
var _lvSearchSetupDone = {};
function lvSetupEmployeeSearch(searchId, hiddenId, dropdownId) {
  // SPA 재방문 시 중복 등록 방지
  if (_lvSearchSetupDone[searchId]) return;
  var searchEl = document.getElementById(searchId);
  var hiddenEl = document.getElementById(hiddenId);
  var ddEl = document.getElementById(dropdownId);
  if (!searchEl || !hiddenEl || !ddEl) return;
  _lvSearchSetupDone[searchId] = true;

  searchEl.addEventListener('input', function() {
    var q = (searchEl.value || '').toLowerCase().trim();
    hiddenEl.value = '';
    if (!q) { ddEl.classList.add('hidden'); return; }
    var filtered = lvEmployees.filter(function(e) {
      return (e.employee_code || '').toLowerCase().indexOf(q) >= 0 ||
             (e.name || '').toLowerCase().indexOf(q) >= 0;
    }).slice(0, 20);
    if (!filtered.length) {
      ddEl.innerHTML = '<div class="px-3 py-2 text-xs text-gray-400">결과 없음</div>';
    } else {
      ddEl.innerHTML = filtered.map(function(e) {
        return '<div class="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer" data-id="' + e.id + '" data-label="' + lvEscapeHtml(e.employee_code) + ' / ' + lvEscapeHtml(e.name) + '">'
          + lvEscapeHtml(e.employee_code) + ' / <b>' + lvEscapeHtml(e.name) + '</b>'
          + '<span class="ml-2 text-xs text-gray-400">' + lvEscapeHtml(e.department || '') + '</span>'
          + '</div>';
      }).join('');
    }
    ddEl.classList.remove('hidden');
  });

  ddEl.addEventListener('click', function(ev) {
    var item = ev.target.closest('[data-id]');
    if (!item) return;
    hiddenEl.value = item.getAttribute('data-id');
    searchEl.value = item.getAttribute('data-label');
    ddEl.classList.add('hidden');
  });

  // 바깥 클릭 시 닫기 (document 레벨 — 1회만 등록)
  document.addEventListener('click', function(ev) {
    if (!searchEl.contains(ev.target) && !ddEl.contains(ev.target)) {
      ddEl.classList.add('hidden');
    }
  });
}

// 휴가 신청 모달
window.leavesOpenRequestModal = function() {
  document.getElementById('lvReqEmployeeSearch').value = '';
  document.getElementById('lvReqEmployee').value = '';
  document.getElementById('lvReqStart').value = '';
  document.getElementById('lvReqEnd').value = '';
  document.getElementById('lvReqDays').value = '';
  document.getElementById('lvReqDays').readOnly = false;
  document.getElementById('lvReqReason').value = '';
  document.getElementById('lvReqType').value = 'ANNUAL';
  var modal = document.getElementById('lvRequestModal');
  modal.style.display = '';  // ESC 핸들러가 남긴 인라인 스타일 제거
  modal.classList.remove('hidden');
};

window.leavesCloseRequestModal = function() {
  document.getElementById('lvRequestModal').classList.add('hidden');
};

window.leavesCalcDays = function() {
  var s = document.getElementById('lvReqStart').value;
  var e = document.getElementById('lvReqEnd').value;
  if (!s || !e) return;
  var d1 = new Date(s), d2 = new Date(e);
  var days = Math.floor((d2 - d1) / (24 * 3600 * 1000)) + 1;
  if (days > 0) document.getElementById('lvReqDays').value = days;
};

window.leavesSubmitRequest = async function() {
  var empId = document.getElementById('lvReqEmployee').value;
  if (!empId) { window.showToast('직원을 검색하여 선택하세요', 'warning'); return; }
  var payload = {
    employee_id: parseInt(empId),
    leave_type: document.getElementById('lvReqType').value,
    start_date: document.getElementById('lvReqStart').value,
    end_date: document.getElementById('lvReqEnd').value,
    days: parseFloat(document.getElementById('lvReqDays').value),
    reason: document.getElementById('lvReqReason').value || null,
  };
  if (!payload.employee_id || !payload.start_date || !payload.end_date || !payload.days) {
    window.showToast('필수 항목을 입력하세요', 'warning'); return;
  }
  try {
    await axios.post('/api/leaves/requests', payload);
    window.showToast('신청 완료', 'success');
    window.leavesCloseRequestModal();
    window.leavesLoadRequests();
  } catch (e) {
    window.showToast('신청 실패: ' + (e.response && e.response.data && e.response.data.error || e.message), 'error');
  }
};

window.leavesApprove = async function(id) {
  if (!(await showConfirm('승인하시겠습니까?'))) return;
  try {
    await axios.patch('/api/leaves/requests/' + id + '/approve');
    window.showToast('승인 완료', 'success');
    window.leavesLoadRequests();
  } catch (e) {
    window.showToast('승인 실패: ' + (e.response && e.response.data && e.response.data.error || e.message), 'error');
  }
};

window.leavesReject = async function(id) {
  var reason = prompt('반려 사유를 입력하세요:');
  if (reason === null) return;
  try {
    await axios.patch('/api/leaves/requests/' + id + '/reject', { reason: reason });
    window.showToast('반려 처리 완료', 'success');
    window.leavesLoadRequests();
  } catch (e) {
    window.showToast('반려 실패: ' + (e.response && e.response.data && e.response.data.error || e.message), 'error');
  }
};

// 특별 부여 모달
window.leavesOpenGrantModal = function() {
  document.getElementById('lvGrantEmployeeSearch').value = '';
  document.getElementById('lvGrantEmployee').value = '';
  document.getElementById('lvGrantYear').value = new Date().getFullYear();
  document.getElementById('lvGrantDays').value = '';
  document.getElementById('lvGrantReason').value = '';
  var modal = document.getElementById('lvGrantModal');
  modal.style.display = '';
  modal.classList.remove('hidden');
};

window.leavesCloseGrantModal = function() {
  document.getElementById('lvGrantModal').classList.add('hidden');
};

window.leavesSubmitGrant = async function() {
  var empId = document.getElementById('lvGrantEmployee').value;
  if (!empId) { window.showToast('직원을 검색하여 선택하세요', 'warning'); return; }
  var payload = {
    employee_id: parseInt(empId),
    year: parseInt(document.getElementById('lvGrantYear').value),
    days: parseFloat(document.getElementById('lvGrantDays').value),
    reason: document.getElementById('lvGrantReason').value || null,
  };
  if (!payload.employee_id || !payload.year || !payload.days) {
    window.showToast('필수 항목을 입력하세요', 'warning'); return;
  }
  try {
    await axios.post('/api/leaves/grant', payload);
    window.showToast('부여 완료', 'success');
    window.leavesCloseGrantModal();
    window.leavesLoadBalances();
  } catch (e) {
    window.showToast('부여 실패: ' + (e.response && e.response.data && e.response.data.error || e.message), 'error');
  }
};

// 미사용 연차수당 조회
window.leavesLoadAllowance = async function() {
  var year = document.getElementById('lvAllowYear') ? document.getElementById('lvAllowYear').value : new Date().getFullYear();
  var tbody = document.getElementById('lvAllowanceBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-400 py-6"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>로딩 중...</td></tr>';
  try {
    var res = await axios.get('/api/leaves/unused-allowance', { params: { year: year } });
    var d = res.data.data || {};
    var rows = d.employees || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-400 py-6">데이터 없음</td></tr>';
      return;
    }
    var fmtW = function(n) { return n ? n.toLocaleString() : '0'; };
    tbody.innerHTML = rows.map(function(r) {
      var rem = parseFloat(r.remaining_annual) || 0;
      var remColor = rem <= 0 ? 'text-gray-400' : (rem > 5 ? 'text-red-600 font-bold' : 'text-amber-600');
      var allowColor = r.unused_allowance > 0 ? 'text-red-600 font-bold' : 'text-gray-400';
      return '<tr>' +
        '<td class="px-3 py-2">' + (r.employee_code || '-') + '</td>' +
        '<td class="px-3 py-2 font-medium">' + (r.name || '-') + '</td>' +
        '<td class="px-3 py-2 text-gray-600">' + (r.department || '-') + '</td>' +
        '<td class="px-3 py-2 text-right">' + lvFmtNum(r.total_annual) + '</td>' +
        '<td class="px-3 py-2 text-right">' + lvFmtNum(r.used_annual) + '</td>' +
        '<td class="px-3 py-2 text-right ' + remColor + '">' + lvFmtNum(rem) + '</td>' +
        '<td class="px-3 py-2 text-right text-gray-600">' + fmtW(r.daily_rate) + '원</td>' +
        '<td class="px-3 py-2 text-right ' + allowColor + '">' + fmtW(r.unused_allowance) + '원</td>' +
      '</tr>';
    }).join('');
    // 합계 표시
    var totalEl = document.getElementById('lvAllowanceTotal');
    if (totalEl) totalEl.textContent = '총 미사용 수당: ' + (d.total_unused_allowance || 0).toLocaleString() + '원';
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-red-500 py-6">조회 실패: ' + (e.response && e.response.data && e.response.data.error || e.message) + '</td></tr>';
  }
};

// 휴가 유형 변경 시 일수 자동 계산
window.leavesTypeChanged = function() {
  var type = document.getElementById('lvReqType').value;
  var daysInput = document.getElementById('lvReqDays');
  // 반차/반반차는 일수 고정
  if (type === 'HALF_AM' || type === 'HALF_PM') {
    daysInput.value = 0.5;
    daysInput.readOnly = true;
  } else if (type.startsWith('QUARTER_')) {
    daysInput.value = 0.25;
    daysInput.readOnly = true;
  } else {
    daysInput.readOnly = false;
    window.leavesCalcDays();
  }
};

async function lvLoadEmployeeOptions() {
  try {
    var res = await axios.get('/api/hr/employees', { params: { limit: 200, status: 'ACTIVE' } });
    var d = res.data.data || {};
    lvEmployees = d.employees || d || [];
    if (!Array.isArray(lvEmployees)) lvEmployees = [];
  } catch (e) {
    console.error('직원 목록 로드 실패:', e);
    lvEmployees = [];
  }
}

// 초기화 (IIFE는 반드시 파일 맨 아래)
(async function lvInit() {
  var current = new Date().getFullYear();
  ['lvYear', 'lvAllowYear'].forEach(function(id) {
    var sel = document.getElementById(id);
    if (sel) {
      var html = '';
      for (var y = current - 2; y <= current + 1; y++) {
        html += '<option value="' + y + '"' + (y === current ? ' selected' : '') + '>' + y + '</option>';
      }
      sel.innerHTML = html;
    }
  });
  await lvLoadEmployeeOptions();
  // 검색 자동완성 셋업
  lvSetupEmployeeSearch('lvReqEmployeeSearch', 'lvReqEmployee', 'lvReqEmployeeDropdown');
  lvSetupEmployeeSearch('lvGrantEmployeeSearch', 'lvGrantEmployee', 'lvGrantEmployeeDropdown');
  window.leavesLoadBalances();
})();
