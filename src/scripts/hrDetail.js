// 직원 상세 페이지 (근태 + 급여 이력)

// Skeleton loading
(function() {
  var el = document.getElementById('hrdPayBody');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(5, 6);
  var el2 = document.getElementById('hrdContractsBody');
  if (el2 && window.dsSkeleton) el2.innerHTML = dsSkeleton.table(3, 5);
})();

var DEPT_NAMES = { ADMIN_DEPT: '사무직', DESIGN: '디자인', SALES: '영업', TRANSFER: '전사', SIGN: '간판', PRINTING: '출력', PRODUCTION: '생산직', EXECUTIVE: '임원' };
var ENTITY_NAMES = { 1: '동산기획', 2: '선명', 3: '동산기획 청주' };
var POSITION_NAMES = {
  STAFF: '사원', SENIOR_STAFF: '주임', ASSISTANT_MANAGER: '대리', MANAGER: '과장',
  DEPUTY_GENERAL_MANAGER: '차장', GENERAL_MANAGER: '부장', DIRECTOR: '이사', CEO: '대표이사'
};
var EMPLOYMENT_NAMES = { FULL_TIME: '정규직', CONTRACT: '계약직', PART_TIME: '시간제' };

function hrdGetEmployeeId() {
  var el = document.querySelector('[data-employee-id]');
  return el ? parseInt(el.getAttribute('data-employee-id')) : 0;
}

function hrdGetCurrentUserRole() {
  try {
    var u = JSON.parse(localStorage.getItem('user') || '{}');
    return u.role || null;
  } catch (e) { return null; }
}

function hrdGetExpectedDeletePhrase(name, code) {
  return '삭제 ' + name + ' ' + code;
}

window.hrdDeleteEmployee = function() {
  var id = hrdGetEmployeeId();
  if (!id) return;
  var name = (document.getElementById('hrdName').textContent || '').trim();
  var code = (document.getElementById('hrdCode').textContent || '').trim();
  if (!name || !code || name === '-' || code === '-') {
    showToast('직원 정보를 먼저 불러오세요.', 'error');
    return;
  }
  var modal = document.getElementById('hrdDeleteModal');
  if (!modal) return;

  var phrase = hrdGetExpectedDeletePhrase(name, code);
  document.getElementById('hrdDelTargetName').textContent = name;
  document.getElementById('hrdDelTargetCode').textContent = '(' + code + ')';
  document.getElementById('hrdDelExpectPhrase').textContent = phrase;

  var input = document.getElementById('hrdDelInput');
  var btn = document.getElementById('hrdDelConfirmBtn');
  var hint = document.getElementById('hrdDelHint');
  input.value = '';
  btn.disabled = true;
  hint.classList.add('hidden');

  input.oninput = function() {
    var match = input.value.trim() === phrase;
    btn.disabled = !match;
    if (input.value.length > 0 && !match) {
      hint.classList.remove('hidden');
    } else {
      hint.classList.add('hidden');
    }
  };

  modal.classList.remove('hidden');
  setTimeout(function() { input.focus(); }, 50);
};

window.hrdCloseDeleteModal = function() {
  var modal = document.getElementById('hrdDeleteModal');
  if (modal) modal.classList.add('hidden');
};

window.hrdConfirmDelete = async function() {
  var id = hrdGetEmployeeId();
  if (!id) return;
  var name = (document.getElementById('hrdName').textContent || '').trim();
  var code = (document.getElementById('hrdCode').textContent || '').trim();
  var phrase = hrdGetExpectedDeletePhrase(name, code);
  var input = document.getElementById('hrdDelInput');
  if (!input || input.value.trim() !== phrase) {
    showToast('확인 문구가 일치하지 않습니다.', 'error');
    return;
  }

  var btn = document.getElementById('hrdDelConfirmBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 삭제 중...'; }

  try {
    await axios.delete('/api/hr/employees/' + id);
    window.hrdCloseDeleteModal();
    showToast('직원이 삭제되었습니다: ' + name, 'success');
    setTimeout(function() {
      if (window.spaNavigate) window.spaNavigate('/hr');
      else window.location.href = '/hr';
    }, 600);
  } catch (e) {
    var rd = (e.response && e.response.data) || {};
    var parts = [];
    if (rd.error) parts.push(rd.error);
    if (rd.detail) parts.push(rd.detail);
    var msg = parts.length ? parts.join(' — ') : (e.message || '알 수 없는 오류');
    showToast('직원 삭제 실패: ' + msg, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash mr-1"></i> 영구 삭제'; }
  }
};

function hrdFmtMoney(n) {
  // 전역 헬퍼 위임 — 정책: null/undefined/'' → '-', 숫자 → 콤마 포맷
  if (typeof window.fmtMoney === 'function') return window.fmtMoney(n);
  if (n == null || n === '') return '-';
  var v = parseInt(n, 10);
  return isNaN(v) ? '-' : v.toLocaleString('ko-KR');
}

function hrdFmtMoneyShort(n) {
  var v = parseInt(n) || 0;
  if (v >= 100000000) return (v / 100000000).toFixed(1) + '억';
  if (v >= 10000) return (v / 10000).toFixed(0) + '만';
  return v.toLocaleString();
}

function hrdStatusBadge(status) {
  var map = {
    PENDING: '<span class="px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-700">작성중</span>',
    APPROVED: '<span class="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">승인</span>',
    PAID: '<span class="px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700">지급완료</span>',
  };
  return map[status] || '<span class="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">' + (status || '-') + '</span>';
}

function hrdAttendanceCellClass(type) {
  // 가이드: bg-*-50 + border-*-200 (은은한 톤)
  var map = {
    NORMAL: 'bg-green-50 border-green-200 text-green-700',
    LATE: 'bg-amber-50 border-amber-200 text-amber-700',
    EARLY_LEAVE: 'bg-amber-50 border-amber-200 text-amber-700',
    ABSENT: 'bg-red-50 border-red-200 text-red-700',
    VACATION: 'bg-blue-50 border-blue-200 text-blue-700',
    HOLIDAY: 'bg-gray-100 border-gray-200 text-gray-500',
  };
  return map[type] || 'bg-white border-gray-200 text-gray-400';
}

function hrdAttendanceTypeIcon(type) {
  var map = {
    NORMAL: 'fa-check-circle',
    LATE: 'fa-clock',
    EARLY_LEAVE: 'fa-sign-out-alt',
    ABSENT: 'fa-times-circle',
    VACATION: 'fa-umbrella-beach',
    HOLIDAY: 'fa-calendar-times',
  };
  return map[type] || '';
}

window.hrdLoadDetail = async function() {
  var id = hrdGetEmployeeId();
  if (!id) return;
  var month = document.getElementById('hrdMonth').value;
  if (!month) return;

  try {
    var res = await axios.get('/api/hr/employees/' + id + '/detail', { params: { month: month } });
    var data = (res.data && res.data.data) || {};
    var emp = data.employee || {};

    // 프로필
    document.getElementById('hrdName').textContent = emp.name || '-';
    document.getElementById('hrdAvatar').textContent = (emp.name || '?').charAt(0);
    document.getElementById('hrdCode').textContent = emp.employee_code || '-';
    document.getElementById('hrdDept').textContent = DEPT_NAMES[emp.department] || emp.department || '-';
    document.getElementById('hrdPosition').textContent = POSITION_NAMES[emp.position] || emp.position || '-';
    document.getElementById('hrdPhone').textContent = emp.phone || '-';
    document.getElementById('hrdEmail').textContent = emp.email || '-';
    document.getElementById('hrdHireDate').textContent = emp.hire_date || '-';
    document.getElementById('hrdEmploymentType').textContent = EMPLOYMENT_NAMES[emp.employment_type] || emp.employment_type || '-';
    var statusEl = document.getElementById('hrdStatus');
    if (emp.status === 'ACTIVE') {
      statusEl.className = 'px-2.5 py-0.5 text-xs rounded-full bg-green-50 text-green-700';
      statusEl.textContent = '재직';
    } else {
      statusEl.className = 'px-2.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700';
      statusEl.textContent = '퇴사';
    }

    // ADMIN만 삭제 버튼 노출
    var delBtn = document.getElementById('hrdDeleteBtn');
    if (delBtn && hrdGetCurrentUserRole() === 'ADMIN') {
      delBtn.classList.remove('hidden');
    }

    // 근태 요약
    var att = data.attendance || {};
    var s = att.summary || {};
    document.getElementById('hrdTotalDays').textContent = s.total_days || 0;
    document.getElementById('hrdTotalHours').textContent = (s.total_work_hours || 0).toFixed(1);
    document.getElementById('hrdOtHours').textContent = (s.total_overtime_hours || 0).toFixed(1);
    document.getElementById('hrdLateCount').textContent = s.late_count || 0;
    document.getElementById('hrdAbsentDays').textContent = s.absent_days || 0;

    // 근태 달력
    hrdRenderCalendar(month, att.records || []);

    // 급여 이력
    var pay = data.payroll || {};
    hrdRenderPayroll(pay);

  } catch (e) {
    console.error('직원 상세 로드 실패', e);
    showToast('직원 상세 로드 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
};

function hrdRenderCalendar(month, records) {
  var cal = document.getElementById('hrdCalendar');
  cal.innerHTML = '';
  if (!month) return;

  var parts = month.split('-');
  var year = parseInt(parts[0]);
  var mon = parseInt(parts[1]);
  var firstDay = new Date(year, mon - 1, 1).getDay(); // 0=일
  var daysInMonth = new Date(year, mon, 0).getDate();

  // 오늘 날짜
  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

  // 요일 헤더
  var weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  for (var i = 0; i < 7; i++) {
    var th = document.createElement('div');
    var weekdayColor = i === 0 ? 'text-red-600' : i === 6 ? 'text-blue-600' : 'text-gray-500';
    th.className = 'text-center text-[11px] font-semibold py-2 uppercase tracking-wider ' + weekdayColor;
    th.textContent = weekdays[i];
    cal.appendChild(th);
  }

  // 빈 셀 (월 시작 전) — 시각적으로 비어있음을 명확히
  for (var j = 0; j < firstDay; j++) {
    var empty = document.createElement('div');
    empty.className = 'h-24 rounded-md bg-transparent';
    cal.appendChild(empty);
  }

  // 레코드 맵
  var map = {};
  for (var k = 0; k < records.length; k++) {
    map[records[k].work_date] = records[k];
  }

  // 날짜 셀
  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = year + '-' + String(mon).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var dow = new Date(year, mon - 1, d).getDay(); // 0=일, 6=토
    var rec = map[dateStr];
    var isToday = dateStr === todayStr;

    var cell = document.createElement('div');
    var baseCls = 'h-24 border rounded-md p-1.5 text-xs bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden';
    var typeCls = rec ? hrdAttendanceCellClass(rec.attendance_type) : 'border-gray-200 text-gray-400';
    var todayCls = isToday ? ' ring-2 ring-blue-500 ring-offset-1' : '';
    cell.className = baseCls + ' ' + typeCls + todayCls;

    // 상단: 날짜 (주말 색상 강조)
    var dayColor = dow === 0 ? 'text-red-600' : dow === 6 ? 'text-blue-600' : '';
    var dayHtml = '<div class="flex items-center justify-between">' +
      '<span class="font-semibold tabular-nums text-sm ' + dayColor + '">' + d + '</span>';

    if (rec) {
      var iconCls = hrdAttendanceTypeIcon(rec.attendance_type);
      if (iconCls) dayHtml += '<i class="fas ' + iconCls + ' text-[10px] opacity-70"></i>';
    }
    dayHtml += '</div>';

    var inner = dayHtml;

    if (rec) {
      var typeLabel = {
        NORMAL: '정상', LATE: '지각', EARLY_LEAVE: '조퇴',
        ABSENT: '결근', VACATION: '연차', HOLIDAY: '휴일'
      }[rec.attendance_type] || rec.attendance_type || '';
      inner += '<div class="text-[10px] mt-0.5 font-medium">' + typeLabel + '</div>';
      if (rec.work_hours && Number(rec.work_hours) > 0) {
        inner += '<div class="text-[10px] tabular-nums mt-0.5">' + Number(rec.work_hours).toFixed(1) + 'h</div>';
      }
      if (rec.overtime_hours && Number(rec.overtime_hours) > 0) {
        inner += '<div class="text-[10px] tabular-nums font-semibold text-amber-700">+' + Number(rec.overtime_hours).toFixed(1) + 'h</div>';
      }
    }
    cell.innerHTML = inner;
    cal.appendChild(cell);
  }
}

function hrdRenderPayroll(pay) {
  var records = pay.records || [];
  var tbody = document.getElementById('hrdPayBody');
  if (records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">급여 데이터가 없습니다</td></tr>';
    document.getElementById('hrdPaySum').textContent = '-';
    return;
  }

  var sumNet = 0;
  var html = '';
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    sumNet += parseInt(r.net_pay || 0);
    var otHrs = parseFloat(r.overtime_hours || 0);
    html += '<tr class="border-b border-gray-100 hover:bg-gray-50">' +
      '<td class="px-4 py-2 font-medium">' + (r.pay_period || '-') + '</td>' +
      '<td class="px-4 py-2 text-right">' + hrdFmtMoney(r.base_salary) + '</td>' +
      '<td class="px-4 py-2 text-right ' + (otHrs > 0 ? 'text-amber-700 font-medium' : 'text-gray-400') + '">' + otHrs.toFixed(1) + '</td>' +
      '<td class="px-4 py-2 text-right">' + hrdFmtMoney(r.overtime_pay) + '</td>' +
      '<td class="px-4 py-2 text-right font-medium">' + hrdFmtMoney(r.total_salary) + '</td>' +
      '<td class="px-4 py-2 text-right text-red-600">' + hrdFmtMoney(r.total_deduction) + '</td>' +
      '<td class="px-4 py-2 text-right font-bold text-green-700">' + hrdFmtMoney(r.net_pay) + '</td>' +
      '<td class="px-4 py-2 text-center">' + hrdStatusBadge(r.status) + '</td>' +
      '</tr>';
  }
  tbody.innerHTML = html;
  document.getElementById('hrdPaySum').textContent = hrdFmtMoneyShort(sumNet) + '원';
}

// ============================================================================
// 포맷 헬퍼 (주민번호/전화/휴대폰/금액)
// ============================================================================
function hrdFmtRRN(v) {
  var d = String(v == null ? '' : v).replace(/\D/g, '').slice(0, 13);
  if (d.length <= 6) return d;
  return d.slice(0, 6) + '-' + d.slice(6);
}

function hrdFmtMobilePhone(v) {
  var d = String(v == null ? '' : v).replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
  return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
}

function hrdFmtTelPhone(v) {
  var d = String(v == null ? '' : v).replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  // 서울 02
  if (d.indexOf('02') === 0) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return '02-' + d.slice(2);
    if (d.length <= 9) return '02-' + d.slice(2, 5) + '-' + d.slice(5);
    return '02-' + d.slice(2, 6) + '-' + d.slice(6);
  }
  // 지역번호 0XX (031, 032, ...) 또는 휴대폰 010, 070
  if (d.length < 4) return d;
  if (d.length < 7) return d.slice(0, 3) + '-' + d.slice(3);
  if (d.length <= 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
  return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
}

// 전역 헬퍼 위임 (window.parseMoney) — 레이아웃 로드 실패 대비 fallback 유지
function hrdFmtMoneyInput(v) {
  if (typeof window.parseMoney === 'function') {
    var n = window.parseMoney(v);
    return n == null ? '' : n.toLocaleString('ko-KR');
  }
  if (v == null || v === '') return '';
  var s = String(v).replace(/[^\d-]/g, '');
  if (s === '' || s === '-') return s;
  var n2 = parseInt(s, 10);
  return isNaN(n2) ? '' : n2.toLocaleString('ko-KR');
}

function hrdParseMoneyInput(v) {
  if (typeof window.parseMoney === 'function') return window.parseMoney(v);
  if (v == null || v === '') return null;
  var s = String(v).replace(/[^\d-]/g, '');
  if (s === '' || s === '-') return null;
  var n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

// 주민번호 → 생년월일 (YYYY-MM-DD)
function hrdRRNToBirthDate(rrn) {
  var d = String(rrn == null ? '' : rrn).replace(/\D/g, '');
  if (d.length < 7) return '';
  var yy = d.slice(0, 2);
  var mm = d.slice(2, 4);
  var dd = d.slice(4, 6);
  var g = d.charAt(6);
  var century;
  if (g === '1' || g === '2' || g === '5' || g === '6') century = '19';
  else if (g === '3' || g === '4' || g === '7' || g === '8') century = '20';
  else if (g === '9' || g === '0') century = '18';
  else return '';
  var mi = parseInt(mm, 10), di = parseInt(dd, 10);
  if (mi < 1 || mi > 12 || di < 1 || di > 31) return '';
  return century + yy + '-' + mm + '-' + dd;
}

// ============================================================================
// 직원 상세 편집/저장 로직
// ============================================================================
var HRD_CURRENT_EMP = null;
var HRD_FORMATTERS_BOUND = false;

function hrdPopulateForm(emp) {
  if (!emp) return;
  HRD_CURRENT_EMP = emp;
  var inputs = document.querySelectorAll('#hrdManageCard .hrd-input');
  for (var i = 0; i < inputs.length; i++) {
    var el = inputs[i];
    var field = el.getAttribute('data-field');
    var val = emp[field];
    if (val == null) val = '';
    // 라디오 버튼 처리
    if (el.type === 'radio') {
      el.checked = (el.value === (val || 'VARIABLE'));
      continue;
    }
    // 체크박스 처리 (overtime_daily_hours → 0보다 크면 체크)
    if (el.type === 'checkbox') {
      el.checked = val > 0;
      continue;
    }
    // 포맷 적용
    var fmt = el.getAttribute('data-format');
    if (fmt === 'rrn') val = hrdFmtRRN(val);
    else if (fmt === 'phone') val = hrdFmtTelPhone(val);
    else if (fmt === 'mobile') val = hrdFmtMobilePhone(val);
    else if (el.getAttribute('data-money') === '1') val = hrdFmtMoneyInput(val);
    el.value = val;
  }
  var checks = document.querySelectorAll('#hrdManageCard .hrd-check');
  for (var j = 0; j < checks.length; j++) {
    var cf = checks[j].getAttribute('data-field');
    checks[j].checked = !!(emp[cf] === 1 || emp[cf] === '1' || emp[cf] === true);
  }
  // 포맷터 이벤트 바인딩 (한 번만)
  hrdBindFormatters();
}

// 입력 실시간 포맷터 바인딩
function hrdBindFormatters() {
  if (HRD_FORMATTERS_BOUND) return;
  HRD_FORMATTERS_BOUND = true;

  var inputs = document.querySelectorAll('#hrdManageCard .hrd-input');
  for (var i = 0; i < inputs.length; i++) {
    (function (el) {
      var fmt = el.getAttribute('data-format');
      var isMoney = el.getAttribute('data-money') === '1';
      if (!fmt && !isMoney) return;

      el.addEventListener('input', function (e) {
        var raw = el.value;
        var formatted = raw;
        if (fmt === 'rrn') formatted = hrdFmtRRN(raw);
        else if (fmt === 'phone') formatted = hrdFmtTelPhone(raw);
        else if (fmt === 'mobile') formatted = hrdFmtMobilePhone(raw);
        else if (isMoney) formatted = hrdFmtMoneyInput(raw);

        if (formatted !== raw) {
          // 커서를 가능한 뒤쪽에 유지
          var diff = formatted.length - raw.length;
          var pos = (el.selectionStart || formatted.length) + diff;
          el.value = formatted;
          try { el.setSelectionRange(pos, pos); } catch (err) { /* noop */ }
        }

        // 주민번호 → 생년월일 자동 추출
        if (fmt === 'rrn') {
          var birth = hrdRRNToBirthDate(el.value);
          if (birth) {
            var birthEl = document.querySelector('#hrdManageCard [data-field="birth_date"]');
            if (birthEl) birthEl.value = birth;
          }
        }
      });
    })(inputs[i]);
  }
}

window.hrdToggleEdit = function(enable) {
  var inputs = document.querySelectorAll('#hrdManageCard .hrd-input, #hrdManageCard .hrd-check');
  for (var i = 0; i < inputs.length; i++) {
    inputs[i].disabled = !enable;
    if (enable) {
      inputs[i].classList.remove('bg-gray-50');
      inputs[i].classList.add('bg-white');
    } else {
      inputs[i].classList.add('bg-gray-50');
      inputs[i].classList.remove('bg-white');
    }
  }
  document.getElementById('hrdEditBtn').classList.toggle('hidden', enable);
  document.getElementById('hrdSaveBtn').classList.toggle('hidden', !enable);
  document.getElementById('hrdCancelBtn').classList.toggle('hidden', !enable);
  // 주소 검색 버튼은 편집 모드에서만 표시
  var addrBtn = document.getElementById('hrdAddressSearchBtn');
  if (addrBtn) addrBtn.classList.toggle('hidden', !enable);
  // 취소 시 원본으로 복원
  if (!enable && HRD_CURRENT_EMP) {
    hrdPopulateForm(HRD_CURRENT_EMP);
  }
};

window.hrdSave = async function() {
  var id = hrdGetEmployeeId();
  if (!id) return;
  var payload = {};
  var orig = HRD_CURRENT_EMP || {};
  var inputs = document.querySelectorAll('#hrdManageCard .hrd-input');
  for (var i = 0; i < inputs.length; i++) {
    var el = inputs[i];
    var field = el.getAttribute('data-field');
    // 라디오 버튼: checked된 것만 payload에 추가
    if (el.type === 'radio') {
      if (el.checked) {
        var origRadio = String(orig[field] || 'VARIABLE');
        if (el.value !== origRadio) payload[field] = el.value;
      }
      continue;
    }
    // 체크박스: overtime_daily_hours → 0.5 or 0
    if (el.type === 'checkbox') {
      var checkNum = el.checked ? 0.5 : 0;
      var origNum = Number(orig[field]) || 0;
      if (checkNum !== origNum) payload[field] = checkNum;
      continue;
    }
    var val = el.value;
    var isMoney = el.getAttribute('data-money') === '1';
    var newVal;

    if (isMoney) {
      newVal = hrdParseMoneyInput(val);
    } else if (el.type === 'number') {
      newVal = val === '' ? null : Number(val);
    } else {
      newVal = val === '' ? null : val;
    }

    // 변경된 필드만 전송 (원본과 비교)
    var origVal = orig[field];
    if (origVal === undefined) origVal = null;
    // 주민번호 마스킹 값은 무조건 제외 (서버에서도 방어하지만 프론트에서도 차단)
    if (field === 'resident_number' && typeof newVal === 'string' && newVal.indexOf('*') >= 0) continue;
    // 정규화 비교: null/undefined/0/'' 모두 동등 취급
    var sNew = String(newVal == null ? '' : newVal);
    var sOrig = String(origVal == null ? '' : origVal);
    if (sNew !== sOrig) {
      payload[field] = newVal;
    }
  }
  var checks = document.querySelectorAll('#hrdManageCard .hrd-check');
  for (var j = 0; j < checks.length; j++) {
    var cf = checks[j].getAttribute('data-field');
    var checkVal = checks[j].checked ? 1 : 0;
    var origCheck = orig[cf];
    var origBool = (origCheck === 1 || origCheck === '1' || origCheck === true) ? 1 : 0;
    if (checkVal !== origBool) payload[cf] = checkVal;
  }

  // 변경사항이 없으면 저장 생략
  if (Object.keys(payload).length === 0) {
    showToast('변경된 항목이 없습니다.', 'info');
    window.hrdToggleEdit(false);
    return;
  }

  try {
    var res = await axios.put('/api/hr/employees/' + id, payload);
    if (res.data && res.data.success) {
      HRD_CURRENT_EMP = res.data.data;
      hrdPopulateForm(HRD_CURRENT_EMP);
      window.hrdToggleEdit(false);
      if (res.data.warnings && res.data.warnings.length > 0) {
        showToast('저장되었습니다.\n\n⚠️ ' + res.data.warnings.join('\n'), 'success');
      } else {
        showToast('저장되었습니다.', 'success');
      }
      // 헤더 프로필도 재로드
      window.hrdLoadDetail();
    } else {
      var msg = (res.data && res.data.error) || '알 수 없는 오류';
      if (res.data && res.data.detail) msg += '\n\n' + res.data.detail;
      showToast('저장 실패: ' + msg, 'error');
    }
  } catch (e) {
    console.error('저장 실패', e);
    var errData = e.response && e.response.data;
    var msg = (errData && errData.error) || e.message;
    if (errData && errData.detail) msg += '\n\n' + errData.detail;
    showToast('저장 실패: ' + msg, 'error');
  }
};

// ============================================================================
// 근로계약 섹션
// ============================================================================
var HRD_CONTRACT_TYPE = { HOURLY: '시급제', MONTHLY: '월급제', DAILY: '일급제' };
var HRD_CONTRACT_STATUS = {
  DRAFT: '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600"><i class="fas fa-pen text-[7px] mr-1"></i>작성중</span>',
  PENDING_SIGNATURE: '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-700"><i class="fas fa-clock text-[7px] mr-1"></i>서명 대기</span>',
  ACTIVE: '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700"><i class="fas fa-check-circle text-[7px] mr-1"></i>활성</span>',
  SIGNED: '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700"><i class="fas fa-check-circle text-[7px] mr-1"></i>서명 완료</span>',
  CONFIRMED: '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700"><i class="fas fa-check-double text-[7px] mr-1"></i>확정</span>',
  EXPIRED: '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-red-50 text-red-700"><i class="fas fa-times-circle text-[7px] mr-1"></i>만료</span>',
};

function hrdContractStatusBadge(status) {
  return HRD_CONTRACT_STATUS[status] || '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">' + (status || '-') + '</span>';
}

function hrdFmtDateShort(d) {
  if (!d) return '-';
  return String(d).substring(0, 10);
}

async function hrdLoadContracts() {
  var id = hrdGetEmployeeId();
  if (!id) return;
  var tbody = document.getElementById('hrdContractsBody');
  if (!tbody) return;

  try {
    var res = await axios.get('/api/hr/contracts', { params: { employee_id: id, limit: '100' } });
    var data = (res.data && res.data.data) || [];
    var records = Array.isArray(data) ? data : (data.records || data.items || []);
    var countEl = document.getElementById('hrdContractsCount');
    if (countEl) countEl.textContent = records.length + '건';

    if (records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">등록된 근로계약이 없습니다</td></tr>';
      return;
    }

    var html = '';
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var period = hrdFmtDateShort(r.contract_start_date || r.contract_date) + ' ~ ' + (r.contract_end_date ? hrdFmtDateShort(r.contract_end_date) : '무기한');
      var monthly = r.monthly_salary ? hrdFmtMoney(r.monthly_salary) : '-';
      html += '<tr class="border-b border-gray-100 hover:bg-gray-50">'
        + '<td class="px-4 py-2 text-sm">' + (HRD_CONTRACT_TYPE[r.contract_type] || r.contract_type || '-') + '</td>'
        + '<td class="px-4 py-2 text-sm">' + period + '</td>'
        + '<td class="px-4 py-2 text-right text-sm">' + hrdFmtMoney(r.hourly_rate) + '</td>'
        + '<td class="px-4 py-2 text-right text-sm">' + monthly + '</td>'
        + '<td class="px-4 py-2 text-center">' + hrdContractStatusBadge(r.status) + '</td>'
        + '<td class="px-4 py-2 text-center text-sm text-gray-500">' + hrdFmtDateShort(r.created_at) + '</td>'
        + '<td class="px-4 py-2 text-center"><a href="/labor-contracts?highlight=' + r.id + '" onclick="if(window.spaNavigate){event.preventDefault();window.spaNavigate(\'/labor-contracts?highlight=' + r.id + '\')}" class="text-blue-600 hover:text-blue-800 text-xs font-medium"><i class="fas fa-external-link-alt mr-0.5"></i>상세</a></td>'
        + '</tr>';
    }
    tbody.innerHTML = html;
  } catch (e) {
    console.error('[hrDetail] 계약 목록 로드 실패', e);
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-red-500">계약 데이터 로드 실패</td></tr>';
  }
}

window.hrdNewContract = function() {
  var id = hrdGetEmployeeId();
  var url = '/labor-contracts?new=1&employee_id=' + id;
  if (window.spaNavigate) window.spaNavigate(url);
  else window.location.href = url;
};

// hrdLoadDetail 함수 감싸기 — 폼 바인딩 추가
var _hrdOrigLoad = window.hrdLoadDetail;
window.hrdLoadDetail = async function() {
  await _hrdOrigLoad.apply(this, arguments);
  // 별도 GET으로 최신 employee 재조회 (detail API는 이미 반환하지만 masking 동기화)
  var id = hrdGetEmployeeId();
  if (!id) return;
  try {
    var res = await axios.get('/api/hr/employees/' + id);
    if (res.data && res.data.success) {
      hrdPopulateForm(res.data.data);
      // 초기 상태는 읽기 전용 회색 배경
      var inputs = document.querySelectorAll('#hrdManageCard .hrd-input');
      for (var i = 0; i < inputs.length; i++) inputs[i].classList.add('bg-gray-50');
      // 급여 자동 계산 바인딩 + 고정연장 미리보기
      hrdBindSalaryCalc();
      hrdUpdateOvertimePreview();
    }
  } catch (e) {
    console.error('직원 정보 로드 실패', e);
  }
  // 근로계약 목록 로드
  hrdLoadContracts();
};

// ============================================================================
// base_salary ↔ hourly_rate 자동 계산 + 고정연장 미리보기
// ============================================================================
function hrdGetPayType() {
  var radios = document.querySelectorAll('#hrdManageCard input[name="pay_type"]');
  for (var i = 0; i < radios.length; i++) {
    if (radios[i].checked) return radios[i].value;
  }
  return 'VARIABLE';
}

function hrdGetOvertimeDivisor() {
  var otToggle = document.getElementById('hrdOvertimeToggle');
  return (otToggle && otToggle.checked) ? 225.5 : 209;
}

function hrdUpdateOvertimePreview() {
  var preview = document.getElementById('hrdOvertimePreview');
  if (!preview) return;

  var otToggle = document.getElementById('hrdOvertimeToggle');
  var baseSalaryEl = document.querySelector('#hrdManageCard [data-field="base_salary"]');
  var hourlyRateEl = document.querySelector('#hrdManageCard [data-field="hourly_rate"]');

  var hasOvertime = otToggle && otToggle.checked;
  var baseSalary = hrdParseMoneyInput(baseSalaryEl ? baseSalaryEl.value : '');

  // 시급 필드도 연동 갱신 (OT ON=225.5, OFF=209)
  if (baseSalary && baseSalary > 0 && hourlyRateEl) {
    var divisor = hasOvertime ? 225.5 : 209;
    var hourly = Math.round(baseSalary / divisor);
    hourlyRateEl.value = hrdFmtMoneyInput(hourly);
  }

  if (!baseSalary || !hasOvertime) {
    preview.innerHTML = '';
    return;
  }

  // 기본급 ÷ 225.5 = 시급, 기본급(209h) = 시급×209, 연장 = 기본급(입력) - 기본급(209h)
  var hourly = Math.round(baseSalary / 225.5);
  var base209 = hourly * 209;
  var otPay = baseSalary - base209;
  preview.innerHTML = '<p class="text-xs text-blue-600">' +
    '시급: ' + hourly.toLocaleString('ko-KR') + '원 | ' +
    '기본급(209h): ' + base209.toLocaleString('ko-KR') + '원 | ' +
    '고정연장(16.5h): ' + otPay.toLocaleString('ko-KR') + '원 | ' +
    '합계: ' + baseSalary.toLocaleString('ko-KR') + '원</p>';
}

var HRD_SALARY_CALC_BOUND = false;
function hrdBindSalaryCalc() {
  if (HRD_SALARY_CALC_BOUND) return;
  HRD_SALARY_CALC_BOUND = true;

  var baseSalaryEl = document.querySelector('#hrdManageCard [data-field="base_salary"]');
  var hourlyRateEl = document.querySelector('#hrdManageCard [data-field="hourly_rate"]');
  var otToggle = document.getElementById('hrdOvertimeToggle');

  if (baseSalaryEl) {
    baseSalaryEl.addEventListener('input', function() {
      if (hrdGetPayType() !== 'VARIABLE') { hrdUpdateOvertimePreview(); return; }
      var base = hrdParseMoneyInput(baseSalaryEl.value);
      if (base != null && base > 0 && hourlyRateEl) {
        var divisor = hrdGetOvertimeDivisor();
        var hourly = Math.round(base / divisor);
        hourlyRateEl.value = hrdFmtMoneyInput(hourly);
      }
      hrdUpdateOvertimePreview();
    });
  }

  if (hourlyRateEl) {
    hourlyRateEl.addEventListener('input', function() {
      if (hrdGetPayType() !== 'VARIABLE') { hrdUpdateOvertimePreview(); return; }
      var hourly = hrdParseMoneyInput(hourlyRateEl.value);
      if (hourly != null && hourly > 0 && baseSalaryEl) {
        var divisor = hrdGetOvertimeDivisor();
        var base = hourly * divisor;
        baseSalaryEl.value = hrdFmtMoneyInput(Math.round(base));
      }
      hrdUpdateOvertimePreview();
    });
  }

  if (otToggle) otToggle.addEventListener('change', hrdUpdateOvertimePreview);

  // pay_type 라디오 변경 시 갱신
  var radios = document.querySelectorAll('#hrdManageCard input[name="pay_type"]');
  for (var i = 0; i < radios.length; i++) {
    radios[i].addEventListener('change', hrdUpdateOvertimePreview);
  }
}

(function hrdInit() {
  var input = document.getElementById('hrdMonth');
  if (input && !input.value) {
    var now = new Date();
    input.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }
  window.hrdLoadDetail();
})();
