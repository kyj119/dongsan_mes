// 인사 관리 - 직원 목록 전용 (근태/급여는 별도 페이지로 분리)

var DEPT_NAMES = { ADMIN_DEPT: '사무직', DESIGN: '디자인', SALES: '영업', TRANSFER: '전사', SIGN: '간판', PRINTING: '출력', PRODUCTION: '생산직', EXECUTIVE: '임원' };
// 법인명은 window.entityName(id) 사용 (shell.js 공용 헬퍼, DB 기반 — 하드코딩 제거)
var POSITION_NAMES = {
  STAFF: '사원', SENIOR_STAFF: '주임', ASSISTANT_MANAGER: '대리', MANAGER: '과장',
  DEPUTY_GENERAL_MANAGER: '차장', GENERAL_MANAGER: '부장', DIRECTOR: '이사', CEO: '대표이사'
};

function hrEscape(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function hrFmtMoney(n) {
  if (n == null || n === '') return '-';
  return (parseInt(n) || 0).toLocaleString('ko-KR');
}

window.hrLoadStats = async function() {
  try {
    var res = await axios.get('/api/hr/stats');
    var s = (res.data && res.data.data) || {};
    document.getElementById('hrTotalEmployees').textContent = s.total_employees || 0;
    document.getElementById('hrTodayAttendance').textContent = s.today_attendance || 0;
    document.getElementById('hrAvgWorkHours').textContent = s.avg_work_hours ? Number(s.avg_work_hours).toFixed(1) + 'h' : '-';
    document.getElementById('hrMonthlyPayroll').textContent = s.monthly_payroll ? (Number(s.monthly_payroll) / 10000).toFixed(0) + '만' : '-';
  } catch (e) {
    console.error('인사 통계 로드 실패', e);
  }
};

window.hrLoadEmployees = async function() {
  var tbody = document.getElementById('hrEmployeeBody');
  tbody.innerHTML = '<tr><td colspan="10" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>'
    + '<tr><td colspan="10" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>'
    + '<tr><td colspan="10" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>'
    + '<tr><td colspan="10" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>'
    + '<tr><td colspan="10" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>';
  try {
    var params = {};
    var dept = document.getElementById('hrFilterDept').value;
    var pos = document.getElementById('hrFilterPosition').value;
    var status = document.getElementById('hrFilterStatus').value;
    var q = document.getElementById('hrSearch').value;
    if (dept) params.department = dept;
    if (pos) params.position = pos;
    if (status) params.status = status;
    if (q) params.search = q;
    params.limit = 500;

    var res = await axios.get('/api/hr/employees', { params: params });
    var employees = (res.data && res.data.data && res.data.data.employees) || [];

    if (employees.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center py-12 text-gray-400">' +
        '<i class="fas fa-users text-3xl text-gray-300 mb-3 block"></i>' +
        '<div class="text-sm text-gray-500 mb-1">등록된 직원이 없습니다</div>' +
        '<button onclick="hrOpenEmployeeModal()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded mt-2">+ 직원 등록</button>' +
        '</td></tr>';
      return;
    }

    var html = '';
    for (var i = 0; i < employees.length; i++) {
      var e = employees[i];
      var statusBadge = e.status === 'ACTIVE'
        ? '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700"><i class="fas fa-check-circle text-[7px] mr-1"></i>재직</span>'
        : '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600"><i class="fas fa-power-off text-[7px] mr-1"></i>퇴사</span>';
      var payBadge = e.pay_type === 'FIXED'
        ? '<span class="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-gray-200 text-gray-600">고정급</span>'
        : '';
      var qStr = q ? encodeURIComponent(q) : '';
      html += '<tr class="border-b border-gray-100 hover:bg-blue-50 cursor-pointer" onclick="hrOpenDetail(' + e.id + ')">' +
        '<td class="px-4 py-3 font-medium">' + hrEscape(e.employee_code) + '</td>' +
        '<td class="px-4 py-3 font-semibold text-gray-900">' + hrEscape(e.name) + payBadge + '</td>' +
        '<td class="px-4 py-3 text-gray-600">' + (e.entity_name || (window.entityName ? window.entityName(e.entity_id) : '-')) + '</td>' +
        '<td class="px-4 py-3 text-gray-700">' + (DEPT_NAMES[e.department] || e.department || '-') + '</td>' +
        '<td class="px-4 py-3 text-gray-700">' + (POSITION_NAMES[e.position] || e.position || '-') + '</td>' +
        '<td class="px-4 py-3 text-gray-600">' + hrEscape(e.phone || '-') + '</td>' +
        '<td class="px-4 py-3 text-gray-600">' + hrEscape(e.hire_date || '-') + '</td>' +
        '<td class="px-4 py-3 text-right text-gray-700 tabular-nums">' + hrFmtMoney(e.base_salary) + '</td>' +
        '<td class="px-4 py-3 text-center">' + statusBadge + '</td>' +
        '<td class="px-4 py-3 text-center">' +
          '<button onclick="event.stopPropagation(); hrOpenDetail(' + e.id + ')" class="text-blue-600 hover:text-blue-800" title="상세">' +
          '<i class="fas fa-chevron-right"></i></button>' +
        '</td>' +
        '</tr>';
    }
    tbody.innerHTML = html;
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-red-500 py-6">로드 실패: ' + (e.message || '') + '</td></tr>';
  }
};

window.hrOpenDetail = function(id) {
  if (window.spaNavigate) {
    window.spaNavigate('/hr/' + id);
  } else {
    window.location.href = '/hr/' + id;
  }
};

// ────────────────────────────────────────────────────────
// 자동 포맷 헬퍼
// ────────────────────────────────────────────────────────
function hrFormatPhone(v) {
  var d = String(v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.startsWith('02')) {
    if (d.length <= 5) return d.slice(0, 2) + '-' + d.slice(2);
    if (d.length <= 9) return d.slice(0, 2) + '-' + d.slice(2, d.length - 4) + '-' + d.slice(-4);
    return d.slice(0, 2) + '-' + d.slice(2, 6) + '-' + d.slice(6, 10);
  }
  if (d.length <= 7) return d.slice(0, 3) + '-' + d.slice(3);
  if (d.length <= 10) return d.slice(0, 3) + '-' + d.slice(3, d.length - 4) + '-' + d.slice(-4);
  return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7, 11);
}

function hrFormatRRN(v) {
  var d = String(v || '').replace(/\D/g, '').slice(0, 13);
  if (d.length <= 6) return d;
  return d.slice(0, 6) + '-' + d.slice(6);
}

// 생년월일 자동 하이픈 (YYYYMMDD → YYYY-MM-DD)
function hrFormatDate(v) {
  var d = String(v || '').replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return d.slice(0, 4) + '-' + d.slice(4);
  return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6);
}

function hrAttachAutoFormat(modal) {
  ['phone', 'mobile', 'emergency_phone'].forEach(function(name) {
    var el = modal.querySelector('input[name="' + name + '"]');
    if (!el || el.dataset.fmtBound) return;
    el.dataset.fmtBound = '1';
    el.addEventListener('input', function() {
      el.value = hrFormatPhone(el.value);
      try { el.setSelectionRange(el.value.length, el.value.length); } catch(e) {}
    });
  });
  var rrn = modal.querySelector('input[name="resident_number"]');
  if (rrn && !rrn.dataset.fmtBound) {
    rrn.dataset.fmtBound = '1';
    rrn.addEventListener('input', function() {
      rrn.value = hrFormatRRN(rrn.value);
    });
  }
  ['birth_date', 'hire_date', 'resignation_date'].forEach(function(dname) {
    var del = modal.querySelector('input[name="' + dname + '"]');
    if (del && !del.dataset.fmtBound) {
      del.dataset.fmtBound = '1';
      del.addEventListener('input', function() { del.value = hrFormatDate(del.value); });
    }
  });
}

window.hrOpenEmployeeModal = async function() {
  var modal = document.getElementById('hrEmployeeModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  var form = document.getElementById('hrEmployeeForm');
  form.reset();

  // 소속법인 select 동적 채우기 (기본 = 현재 법인 모드)
  var entSel = form.querySelector('select[name="entity_id"]');
  if (entSel && window.fillEntitySelect) {
    var curEnt = parseInt(localStorage.getItem('entityId')) || 0;
    window.fillEntitySelect(entSel, curEnt > 0 ? curEnt : null);
  }

  // 입사일자 = 오늘 (KST)
  var todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  var hireEl = form.querySelector('input[name="hire_date"]');
  if (hireEl) hireEl.value = todayKst;

  // 자동 포맷 바인딩
  hrAttachAutoFormat(modal);
  // 날짜 input flatpickr 달력 초기화
  if (window.hrInitDatePickers) window.hrInitDatePickers('#hrEmployeeForm');

  // 금액 input 자동 콤마 바인딩 (전역 헬퍼)
  if (typeof window.bindMoneyInputs === 'function') window.bindMoneyInputs(modal);

  // 사원번호 자동 채우기
  var codeEl = form.querySelector('input[name="employee_code"]');
  if (codeEl) {
    codeEl.value = '생성 중...';
    try {
      var r = await axios.get('/api/hr/employees/next-code');
      codeEl.value = (r.data && r.data.data && r.data.data.next_code) || '';
    } catch (e) {
      codeEl.value = '';
      console.error('사원번호 자동 생성 실패', e);
    }
  }
};

window.hrCloseEmployeeModal = function() {
  var modal = document.getElementById('hrEmployeeModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
};

(function hrInit() {
  // 폼 제출
  var form = document.getElementById('hrEmployeeForm');
  if (form) {
    form.addEventListener('submit', async function(ev) {
      ev.preventDefault();
      var formEl = ev.target;
      var data = {};

      // 모든 input/select/textarea 순회
      var fields = formEl.querySelectorAll('input[name], select[name], textarea[name]');
      fields.forEach(function(el) {
        var name = el.name;
        if (!name) return;
        if (el.type === 'checkbox') {
          data[name] = el.checked ? 1 : 0;
        } else if (el.type === 'radio') {
          if (el.checked) data[name] = el.value;
        } else {
          var v = el.value;
          if (v === '') return; // 빈 값은 전송하지 않음
          data[name] = v;
        }
      });

      // data-money 필드는 콤마 제거 후 정수 변환 (전역 헬퍼)
      if (typeof window.collectMoneyFields === 'function') {
        window.collectMoneyFields(formEl, data);
      }

      // 그 외 정수 필드 변환
      var NUMERIC_FIELDS = [
        'dependents_count', 'children_under_20_count', 'income_tax_table_option'
      ];
      NUMERIC_FIELDS.forEach(function(f) {
        if (f in data) {
          var n = parseInt(data[f], 10);
          data[f] = isNaN(n) ? null : n;
        }
      });

      try {
        await axios.post('/api/hr/employees', data);
        showToast('직원이 등록되었습니다', 'success');
        window.hrCloseEmployeeModal();
        window.hrLoadEmployees();
        window.hrLoadStats();
      } catch (e) {
        var rd = (e.response && e.response.data) || {};
        var parts = [];
        if (rd.error) parts.push(rd.error);
        if (rd.detail) parts.push(rd.detail);
        var msg = parts.length ? parts.join(' — ') : (e.message || '알 수 없는 오류');
        console.error('직원 등록 실패', rd, e);
        showToast('직원 등록 실패: ' + msg, 'error');
      }
    });
  }

  // 검색 엔터키
  var search = document.getElementById('hrSearch');
  if (search) {
    search.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') window.hrLoadEmployees();
    });
  }

  window.hrLoadStats();
  window.hrLoadEmployees();

  // 셀렉트 마스터 동적 로드 — 하드코딩 옵션은 API 실패 시 폴백 (감사 2026-06-12)
  axios.get('/api/auth/entities').then(function (res) {
    var list = (res.data && res.data.data) || [];
    if (!list.length) return;
    ENTITY_NAMES = {};
    var opts = '';
    list.forEach(function (e) {
      ENTITY_NAMES[e.id] = e.name || e.short_name;
      var nm = String(e.name || e.short_name).replace(/[&<>"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
      });
      opts += '<option value="' + e.id + '">' + nm + '</option>';
    });
    var sel = document.querySelector('select[name="entity_id"]');
    if (sel) { var cur = sel.value; sel.innerHTML = opts; if (cur) sel.value = cur; }
  }).catch(function () { /* 폴백: 하드코딩 옵션 유지 */ });

  axios.get('/api/caps/sites').then(function (res) {
    var list = (res.data && res.data.data) || [];
    if (!list.length) return;
    var sel = document.querySelector('select[name="caps_site_id"]');
    if (!sel) return;
    var esc = function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
      });
    };
    var cur = sel.value;
    sel.innerHTML = '<option value="">— 미설정 —</option>' + list.map(function (s) {
      return '<option value="' + esc(s.id) + '">' + esc(s.name) + ' (' + esc(s.id) + ')</option>';
    }).join('');
    if (cur) sel.value = cur;
  }).catch(function () { /* 폴백: 하드코딩 옵션 유지 */ });
})();
