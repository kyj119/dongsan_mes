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

// 부서/직책 코드 → 한글 라벨 (HR SSOT 전역주입 window.DEPT_NAMES/POSITION_NAMES, design-hr-enum-ssot)
// ⚠️ var DEPT_NAMES 재선언 금지(?raw concat 전역스코프 충돌) → window 직접 read
function lvDeptLabel(d){ return (window.DEPT_NAMES && window.DEPT_NAMES[d]) || d || '-'; }
function lvPosLabel(p){ return (window.POSITION_NAMES && window.POSITION_NAMES[p]) || p || '-'; }

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
    CANCELLED: '<span class="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500">승인취소</span>',
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
  var deptEl = document.getElementById('lvBalanceDept'); // #346: 부서 필터
  var tbody = document.getElementById('lvBalancesBody');
  tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-400 py-6"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>로딩 중...</td></tr>';
  try {
    var balParams = { year: year };
    if (deptEl && deptEl.value) balParams.department = deptEl.value;
    var res = await axios.get('/api/leaves/balances', { params: balParams });
    var rows = res.data.data || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-400 py-6">데이터 없음</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function(r) {
      var remaining = parseFloat(r.remaining) || 0;
      var remColor = remaining <= 0 ? 'text-red-600' : (remaining < 3 ? 'text-amber-600' : 'text-gray-900');
      return '<tr>' +
        '<td class="px-3 py-2">' + lvEscapeHtml(r.employee_code || '-') + '</td>' +
        '<td class="px-3 py-2 font-medium" title="' + lvEscapeHtml(r.name || '-') + '">' + lvEscapeHtml(r.name || '-') + '</td>' +
        '<td class="px-3 py-2 text-gray-600" title="' + lvEscapeHtml(lvDeptLabel(r.department)) + '">' + lvEscapeHtml(lvDeptLabel(r.department)) + '</td>' +
        '<td class="px-3 py-2 text-gray-600" title="' + lvEscapeHtml(lvPosLabel(r.position)) + '">' + lvEscapeHtml(lvPosLabel(r.position)) + '</td>' +
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
  var fromEl = document.getElementById('lvReqFrom'); // #353: 날짜 범위 필터
  var toEl = document.getElementById('lvReqTo');
  var tbody = document.getElementById('lvRequestsBody');
  tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-400 py-6"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>로딩 중...</td></tr>';
  try {
    var reqParams = {};
    if (status) reqParams.status = status;
    if (fromEl && fromEl.value) reqParams.from = fromEl.value;
    if (toEl && toEl.value) reqParams.to = toEl.value;
    var res = await axios.get('/api/leaves/requests', { params: reqParams });
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
      } else if (r.status === 'APPROVED') {
        actions = '<button onclick="leavesCancelApproved(' + r.id + ')" class="px-2 py-0.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-100" title="승인 취소 — 잔여 복원·근태 마킹 해제">승인취소</button>';
      }
      return '<tr>' +
        '<td class="px-3 py-2 text-gray-600">' + (r.created_at || '').slice(0, 10) + '</td>' +
        '<td class="px-3 py-2" title="' + lvEscapeHtml((r.employee_code || '') + ' / ' + (r.employee_name || '-')) + '">' + lvEscapeHtml(r.employee_code || '') + ' / <span class="font-medium">' + lvEscapeHtml(r.employee_name || '-') + '</span></td>' +
        '<td class="px-3 py-2 text-gray-600" title="' + lvEscapeHtml(lvDeptLabel(r.department)) + '">' + lvEscapeHtml(lvDeptLabel(r.department)) + '</td>' +
        '<td class="px-3 py-2">' + lvLeaveTypeLabel(r.leave_type) + '</td>' +
        '<td class="px-3 py-2 text-gray-600" title="' + lvEscapeHtml((r.start_date || '') + ' ~ ' + (r.end_date || '')) + '">' + r.start_date + ' ~ ' + r.end_date + '</td>' +
        '<td class="px-3 py-2 text-right">' + lvFmtNum(r.days) + '</td>' +
        '<td class="px-3 py-2 text-gray-600" title="' + lvEscapeHtml(r.reason || '-') + '">' + lvEscapeHtml(r.reason || '-') + '</td>' +
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

// 사용촉진 (제61조)
window.leavesOpenPromotionModal = function() {
  var res = document.getElementById('lvPromoResult');
  if (res) res.innerHTML = '미리보기를 눌러 대상을 확인하세요.';
  var btn = document.getElementById('lvPromoSendBtn');
  if (btn) btn.disabled = true;
  var m = document.getElementById('lvPromotionModal');
  if (m) { m.style.display = ''; m.classList.remove('hidden'); }
};
window.leavesClosePromotionModal = function() {
  var m = document.getElementById('lvPromotionModal');
  if (m) m.classList.add('hidden');
};
window.leavesPromotionPreview = async function() {
  var source = document.getElementById('lvPromoSource').value;
  var stage = document.getElementById('lvPromoStage').value;
  var res = document.getElementById('lvPromoResult');
  res.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 조회 중...';
  try {
    var r = await axios.post('/api/leaves/promotion/run', { source: source, stage: stage, dryRun: true });
    var list = r.data.eligible || [];
    document.getElementById('lvPromoSendBtn').disabled = list.length === 0;
    if (!list.length) { res.innerHTML = '<span class="text-gray-400">현재 통지 윈도우 대상 없음(법정 기간 외이거나 잔여 0).</span>'; return; }
    res.innerHTML = '<div class="font-medium mb-1">' + list.length + '명 대상 (이메일 발송)</div>' + list.map(function(t) {
      return '<div class="flex justify-between border-b border-gray-100 py-0.5"><span>' + lvEscapeHtml(t.name) + ' (' + lvEscapeHtml(lvDeptLabel(t.department)) + ')' + (t.email ? '' : ' <span class="text-red-500">[이메일없음]</span>') + '</span><span>잔여 ' + t.remaining + '일 · 소멸 ' + lvEscapeHtml(t.expire_base || '') + '</span></div>';
    }).join('');
  } catch (e) {
    res.innerHTML = '<span class="text-red-500">조회 실패: ' + (e.response && e.response.data && e.response.data.error || e.message) + '</span>';
  }
};
window.leavesPromotionSend = async function() {
  var source = document.getElementById('lvPromoSource').value;
  var stage = document.getElementById('lvPromoStage').value;
  if (!(await showConfirm('선택한 대상에게 사용촉진 통지를 이메일로 발송합니다. 진행할까요?', { title: '사용촉진 발송', confirmText: '발송' }))) return;
  try {
    var r = await axios.post('/api/leaves/promotion/run', { source: source, stage: stage, dryRun: false });
    var d = r.data;
    window.showToast('발송 완료: 성공 ' + (d.sent || 0) + ' / 실패 ' + (d.failed || 0) + ' / 연락처없음 ' + (d.noContact || 0), (d.failed ? 'warning' : 'success'));
    window.leavesPromotionPreview();
  } catch (e) {
    window.showToast('발송 실패: ' + (e.response && e.response.data && e.response.data.error || e.message), 'error');
  }
};
window.leavesRunExpire = async function() {
  try {
    var r = await axios.post('/api/leaves/expire', { dryRun: true });
    var cands = r.data.candidates || [];
    var lawful = r.data.lawful || 0;
    if (!cands.length) { window.showToast('소멸 대상 없음(만료 경과 + 잔여>0 없음)', 'info'); return; }
    if (lawful === 0) { window.showToast('소멸 가능(촉진 적법) 건 없음. 사용촉진 1·2차 통지를 먼저 완료하세요.', 'warning'); return; }
    var msg = '만료 경과 잔여 ' + cands.length + '건 중 촉진 적법 ' + lawful + '건을 소멸 처리합니다.\n(촉진 미이행분은 제외 — 수당 산정 대상 유지)\n노무수령거부 등 촉진 절차 완료를 확인했으면 진행하세요.';
    if (!(await showConfirm(msg, { title: '연차 소멸', confirmText: '소멸 실행', danger: true }))) return;
    var rr = await axios.post('/api/leaves/expire', { dryRun: false });
    window.showToast('소멸 완료: ' + (rr.data.expired || 0) + '건 (제외 ' + (rr.data.skipped_unlawful || 0) + ')', 'success');
    window.leavesLoadBalances();
  } catch (e) {
    window.showToast('소멸 실패: ' + (e.response && e.response.data && e.response.data.error || e.message), 'error');
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
          + '<span class="ml-2 text-xs text-gray-400">' + lvEscapeHtml(lvDeptLabel(e.department)) + '</span>'
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
  // 반차/반반차는 일수 고정(0.5/0.25). readOnly일 때 날짜 변경으로 덮어쓰지 않음.
  var daysEl = document.getElementById('lvReqDays');
  if (daysEl && daysEl.readOnly) return;
  var s = document.getElementById('lvReqStart').value;
  var e = document.getElementById('lvReqEnd').value;
  if (!s || !e) return;
  var d1 = new Date(s + 'T00:00:00'), d2 = new Date(e + 'T00:00:00');
  if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d2 < d1) return;
  // 주말(토·일) 제외 추정치. 공휴일은 신청 시 서버가 추가 제외하여 확정(소정근로일 기준).
  var n = 0;
  for (var t = d1.getTime(); t <= d2.getTime(); t += 86400000) {
    var dow = new Date(t).getDay();
    if (dow === 0 || dow === 6) continue;
    n++;
  }
  if (n > 0) document.getElementById('lvReqDays').value = n;
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
    var res = await axios.post('/api/leaves/requests', payload);
    var actualDays = res.data && res.data.data && res.data.data.days;
    window.showToast('신청 완료' + (actualDays != null ? ' (소정근로일 ' + actualDays + '일)' : ''), 'success');
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
  var reason = await showPrompt('반려 사유를 입력하세요:', { title: '휴가 반려', placeholder: '반려 사유 (선택)', confirmText: '반려', danger: true });
  if (reason === null) return; // 취소
  try {
    await axios.patch('/api/leaves/requests/' + id + '/reject', { reason: reason });
    window.showToast('반려 처리 완료', 'success');
    window.leavesLoadRequests();
  } catch (e) {
    window.showToast('반려 실패: ' + (e.response && e.response.data && e.response.data.error || e.message), 'error');
  }
};

window.leavesCancelApproved = async function(id) {
  if (!(await showConfirm('승인된 휴가를 취소합니다. 차감된 잔여가 복원되고 근태 마킹이 해제됩니다. 진행할까요?', { title: '승인 취소', confirmText: '승인취소', danger: true }))) return;
  try {
    await axios.patch('/api/leaves/requests/' + id + '/cancel-approved');
    window.showToast('승인 취소 완료 (잔여 복원됨)', 'success');
    window.leavesLoadRequests();
    if (typeof window.leavesLoadBalances === 'function') window.leavesLoadBalances();
  } catch (e) {
    window.showToast('승인 취소 실패: ' + (e.response && e.response.data && e.response.data.error || e.message), 'error');
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
  var deptEl = document.getElementById('lvAllowanceDept'); // #346: 부서 필터
  var tbody = document.getElementById('lvAllowanceBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400 py-6"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>로딩 중...</td></tr>';
  try {
    var allowParams = { year: year };
    if (deptEl && deptEl.value) allowParams.department = deptEl.value;
    var res = await axios.get('/api/leaves/unused-allowance', { params: allowParams });
    var d = res.data.data || {};
    var rows = d.employees || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400 py-6">데이터 없음</td></tr>';
      return;
    }
    var fmtW = function(n) { return n ? n.toLocaleString() : '0'; };
    tbody.innerHTML = rows.map(function(r) {
      var rem = parseFloat(r.remaining_annual) || 0;
      var remColor = rem <= 0 ? 'text-gray-400' : (rem > 5 ? 'text-red-600 font-bold' : 'text-amber-600');
      var allowColor = r.unused_allowance > 0 ? 'text-red-600 font-bold' : 'text-gray-400';
      return '<tr>' +
        '<td class="px-3 py-2">' + lvEscapeHtml(r.employee_code || '-') + '</td>' +
        '<td class="px-3 py-2 font-medium" title="' + lvEscapeHtml(r.name || '-') + '">' + lvEscapeHtml(r.name || '-') + '</td>' +
        '<td class="px-3 py-2 text-gray-600" title="' + lvEscapeHtml(lvDeptLabel(r.department)) + '">' + lvEscapeHtml(lvDeptLabel(r.department)) + '</td>' +
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

  // 촉진/소멸 대상 경보 (선제 가시화) — 기존 dryRun 엔드포인트 재사용(부수효과 없음)
  window.leavesLoadAlerts = async function() {
    var el = document.getElementById('lvAlertBanner');
    if (!el) return;
    try {
      var pr = await axios.post('/api/leaves/promotion/run', { dryRun: true });
      var ex = await axios.post('/api/leaves/expire', { dryRun: true });
      var promo = (pr.data && pr.data.count) || 0;
      var exp = (ex.data && (ex.data.lawful != null ? ex.data.lawful : ex.data.total)) || 0;
      if (promo === 0 && exp === 0) { el.className = 'hidden'; el.innerHTML = ''; return; }
      var parts = [];
      if (promo > 0) parts.push('사용촉진 대상 ' + promo + '명');
      if (exp > 0) parts.push('소멸 예정(적법) ' + exp + '명');
      el.className = 'bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-center gap-2';
      el.innerHTML = '<i class="fas fa-bullhorn"></i><span><b>연차 관리 알림</b> — ' + parts.join(' · ') + '. 상단 <b>사용촉진</b>·<b>연차 소멸</b> 버튼으로 처리하세요.</span>';
    } catch (e) { el.className = 'hidden'; }
  };
  window.leavesLoadAlerts();
})();
