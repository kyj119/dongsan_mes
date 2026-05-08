// 급여 관리 (Phase B1)
// IIFE 호이스팅 버그 방지: window.foo 할당은 IIFE 위, IIFE는 파일 맨 아래

var prEmployees = [];
var prCurrentEditId = 0;
var prPreviewTimer = null;
var prSelected = {};   // 선택된 payroll id → true
var currentPayrollData = [];   // 현재 표시된 급여 목록 (일괄 발송용)


function prFmtMoneyShort(n) {
  if (n == null) return '0';
  var v = parseInt(n) || 0;
  if (v >= 100000000) return (v / 100000000).toFixed(1) + '억';
  if (v >= 10000) return (v / 10000).toFixed(0) + '만';
  return v.toLocaleString();
}

function prStatusBadge(status) {
  var map = {
    PENDING: '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-700"><i class="fas fa-pause text-[7px] mr-1"></i>작성중</span>',
    APPROVED: '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700"><i class="fas fa-check text-[7px] mr-1"></i>승인</span>',
    PAID: '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700"><i class="fas fa-check-circle text-[7px] mr-1"></i>지급완료</span>',
  };
  return map[status] || '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600"><i class="far fa-clock text-[7px] mr-1"></i>' + status + '</span>';
}

async function prLoadEmployeeOptions() {
  try {
    var res = await axios.get('/api/hr/employees', { params: { limit: 200 } });
    var d = res.data && res.data.data;
    // /api/hr/employees는 { data: { employees: [...], pagination: {} } } 형태
    if (d && Array.isArray(d.employees)) prEmployees = d.employees;
    else if (Array.isArray(d)) prEmployees = d;
    else prEmployees = [];
    var sel = document.getElementById('prEmpSelect');
    if (sel) {
      var opts = '<option value="">- 직원 선택 -</option>';
      for (var i = 0; i < prEmployees.length; i++) {
        var e = prEmployees[i];
        if (e.status && e.status !== 'ACTIVE') continue;
        opts += '<option value="' + e.id + '" data-base="' + (e.base_salary || 0) + '">' + (e.employee_code || '') + ' ' + (e.name || '') + ' (' + (e.department || '') + ')</option>';
      }
      sel.innerHTML = opts;
    }
  } catch (e) {
    console.error('직원 로드 실패', e);
  }
}

window.payrollLoad = async function() {
  var period = document.getElementById('prPeriod').value;
  var status = document.getElementById('prStatus').value;
  var tbody = document.getElementById('prBody');
  tbody.innerHTML = '<tr><td colspan="13" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>'
    + '<tr><td colspan="13" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>'
    + '<tr><td colspan="13" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>'
    + '<tr><td colspan="13" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>'
    + '<tr><td colspan="13" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>';

  // 이전 선택 초기화
  prSelected = {};
  var selAll = document.getElementById('prSelectAll');
  if (selAll) selAll.checked = false;
  payrollUpdateSelectedCount();

  try {
    var params = {};
    if (period) params.period = period;
    if (status) params.status = status;
    var res = await axios.get('/api/payroll', { params: params });
    var d = res.data && res.data.data;
    var rows = [];
    if (Array.isArray(d)) rows = d;
    else if (d && Array.isArray(d.items)) rows = d.items;
    else if (d && Array.isArray(d.list)) rows = d.list;

    currentPayrollData = rows;

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="13" class="text-center py-12"><i class="fas fa-file-invoice-dollar text-3xl mb-3 block text-gray-300"></i><div class="text-sm text-gray-500 mb-1">해당 월 급여 내역이 없습니다</div><button onclick="payrollBatch()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded mt-2">+ 일괄 생성</button></td></tr>';
      document.getElementById('prSumCount').textContent = '0';
      document.getElementById('prSumGross').textContent = '0';
      document.getElementById('prSumDeduct').textContent = '0';
      document.getElementById('prSumNet').textContent = '0';
      return;
    }

    var sumGross = 0, sumDeduct = 0, sumNet = 0;
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      sumGross += parseFloat(r.total_salary || 0);
      sumDeduct += parseFloat(r.total_deduction || 0);
      sumNet += parseFloat(r.net_pay || 0);

      var allowances =
        parseFloat(r.night_pay || 0) + parseFloat(r.holiday_pay || 0) +
        parseFloat(r.meal_allowance || 0) + parseFloat(r.transportation_allowance || 0) +
        parseFloat(r.other_allowance || 0) + parseFloat(r.bonus || 0) + parseFloat(r.annual_leave_pay || 0);

      var year = (r.pay_period || '').substring(0, 4);
      var prEscName = (r.employee_name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      var prEscPhone = (r.employee_mobile || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      var prEscPeriod = (r.pay_period || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      var actions = '<button onclick="payrollSyncOne(' + r.id + ')" class="text-amber-600 hover:text-amber-800 mx-1" title="이 직원 근태 동기화"><i class="fas fa-sync-alt"></i></button>';
      actions += '<button onclick="payrollOpenEditModal(' + r.id + ')" class="text-blue-600 hover:text-blue-800 mx-1" title="수정"><i class="fas fa-edit"></i></button>';
      actions += '<button onclick="payrollOpenSlip(' + r.id + ')" class="text-gray-600 hover:text-gray-800 mx-1" title="명세서"><i class="fas fa-file-invoice-dollar"></i></button>';
      actions += '<button onclick="payrollOpenYearEnd(' + r.employee_id + ',\'' + year + '\')" class="text-purple-600 hover:text-purple-800 mx-1" title="연말정산"><i class="fas fa-file-contract"></i></button>';
      actions += '<button onclick="sendPayslipNotice(' + r.id + ',' + r.employee_id + ',\'' + prEscName + '\',\'' + prEscPhone + '\',\'' + prEscPeriod + '\')" class="text-green-600 hover:text-green-800 mx-1" title="명세서 발송"><i class="fas fa-paper-plane"></i></button>';
      if (r.status === 'PENDING') {
        actions += '<button onclick="payrollApprove(' + r.id + ')" class="text-green-600 hover:text-green-800 mx-1" title="승인"><i class="fas fa-check"></i></button>';
        actions += '<button onclick="payrollDelete(' + r.id + ')" class="text-red-600 hover:text-red-800 mx-1" title="삭제"><i class="fas fa-trash"></i></button>';
      } else if (r.status === 'APPROVED') {
        actions += '<button onclick="payrollPay(' + r.id + ')" class="text-blue-600 hover:text-blue-800 mx-1" title="지급처리"><i class="fas fa-money-bill-wave"></i></button>';
      }

      var otHrs = parseFloat(r.overtime_hours || 0);
      var syncedMark = r.attendance_synced_at
        ? '<i class="fas fa-check-circle text-green-500 ml-1" title="근태 동기화: ' + r.attendance_synced_at + '"></i>'
        : '';

      html += '<tr>' +
        '<td class="px-2 py-2 text-center"><input type="checkbox" onchange="payrollToggleRow(' + r.id + ', this.checked)" ' + (prSelected[r.id] ? 'checked' : '') + '></td>' +
        '<td class="px-3 py-2">' + (r.employee_code || '') + '</td>' +
        '<td class="px-3 py-2 font-medium">' + (r.employee_name || '') + syncedMark + '</td>' +
        '<td class="px-3 py-2 text-xs text-gray-600">' + (r.department || '') + ' / ' + (r.position || '') + '</td>' +
        '<td class="px-3 py-2 text-right tabular-nums">' + fmtMoney(r.base_salary) + '</td>' +
        '<td class="px-3 py-2 text-right tabular-nums ' + (otHrs > 0 ? 'text-amber-700 font-medium' : 'text-gray-400') + '">' + otHrs.toFixed(1) + '</td>' +
        '<td class="px-3 py-2 text-right tabular-nums">' + fmtMoney(r.overtime_pay) + '</td>' +
        '<td class="px-3 py-2 text-right tabular-nums">' + fmtMoney(allowances) + '</td>' +
        '<td class="px-3 py-2 text-right font-medium tabular-nums">' + fmtMoney(r.total_salary) + '</td>' +
        '<td class="px-3 py-2 text-right text-red-600 tabular-nums">' + fmtMoney(r.total_deduction) + '</td>' +
        '<td class="px-3 py-2 text-right font-bold text-green-700 tabular-nums">' + fmtMoney(r.net_pay) + '</td>' +
        '<td class="px-3 py-2 text-center">' + prStatusBadge(r.status) + '</td>' +
        '<td class="px-3 py-2 text-center whitespace-nowrap">' + actions + '</td>' +
        '</tr>';
    }
    tbody.innerHTML = html;
    document.getElementById('prSumCount').textContent = rows.length + '명';
    document.getElementById('prSumGross').textContent = prFmtMoneyShort(sumGross);
    document.getElementById('prSumDeduct').textContent = prFmtMoneyShort(sumDeduct);
    document.getElementById('prSumNet').textContent = prFmtMoneyShort(sumNet);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="13" class="text-center text-red-500 py-6">로드 실패: ' + (err.message || '') + '</td></tr>';
  }
};

function payrollUpdateSelectedCount() {
  var n = 0;
  for (var k in prSelected) { if (prSelected[k]) n++; }
  var el = document.getElementById('prSelectedCount');
  if (el) el.textContent = '선택: ' + n + '명';
  return n;
}

window.payrollToggleAll = function(checked) {
  var boxes = document.querySelectorAll('#prBody input[type="checkbox"]');
  prSelected = {};
  boxes.forEach(function(cb) {
    cb.checked = !!checked;
    if (checked) {
      var m = (cb.getAttribute('onchange') || '').match(/payrollToggleRow\((\d+)/);
      if (m) prSelected[m[1]] = true;
    }
  });
  payrollUpdateSelectedCount();
};

window.payrollToggleRow = function(id, checked) {
  if (checked) prSelected[id] = true;
  else delete prSelected[id];
  payrollUpdateSelectedCount();
};

function prGetSelectedIds() {
  var ids = [];
  for (var k in prSelected) { if (prSelected[k]) ids.push(parseInt(k)); }
  return ids;
}

window.payrollOpenEditModal = async function(id) {
  prCurrentEditId = id || 0;
  document.getElementById('prEditModal').classList.remove('hidden');
  // 초기화
  ['prBase','prOvertime','prNight','prHoliday','prAnnualPay','prBonus','prMeal','prTransport','prOther',
   'prOvertimeHrs','prNightHrs','prHolidayHrs',
   'prWorkDays','prAbsent','prLate','prOtherDed','prNotes','prEditPayDate'].forEach(function(k) {
    var el = document.getElementById(k); if (el) el.value = '';
  });
  // 수동 입력 모드 기본 숨김
  var manual = document.getElementById('prOvertimeManual');
  if (manual) manual.classList.add('hidden');
  window.prOvertimeManualMode = false;
  ['prHourlyWage','prOvertimeAmt','prNightAmt','prHolidayAmt'].forEach(function(k) {
    var el = document.getElementById(k); if (el) el.textContent = k === 'prHourlyWage' ? '-' : '0';
  });
  document.getElementById('prEditPeriod').value = document.getElementById('prPeriod').value || '';
  ['prCalcNP','prCalcHI','prCalcLTC','prCalcEI','prCalcTax','prCalcLocal','prCalcGross','prCalcDeduct','prCalcNet'].forEach(function(k) {
    document.getElementById(k).textContent = '-';
  });

  if (id) {
    // 기존 급여 로드
    try {
      var res = await axios.get('/api/payroll/' + id);
      var p = res.data.data;
      document.getElementById('prEmpSelect').value = p.employee_id;
      document.getElementById('prEditPeriod').value = p.pay_period;
      document.getElementById('prEditPayDate').value = p.pay_date || '';
      document.getElementById('prBase').value = fmtMoneyInput(p.base_salary);
      // 기존 데이터는 수동 모드로 복원 (금액만 저장되어 있음)
      document.getElementById('prOvertime').value = fmtMoneyInput(p.overtime_pay);
      document.getElementById('prNight').value = fmtMoneyInput(p.night_pay);
      document.getElementById('prHoliday').value = fmtMoneyInput(p.holiday_pay);
      document.getElementById('prOvertimeHrs').value = p.overtime_hours || 0;
      document.getElementById('prNightHrs').value = p.night_hours || 0;
      document.getElementById('prHolidayHrs').value = p.holiday_hours || 0;
      // 저장된 시간 값이 있으면 금액과 일치하는지 비교 후 모드 결정
      if ((p.overtime_pay > 0 || p.night_pay > 0 || p.holiday_pay > 0) && !(p.overtime_hours > 0 || p.night_hours > 0 || p.holiday_hours > 0)) {
        window.prOvertimeManualMode = true;
        document.getElementById('prOvertimeManual').classList.remove('hidden');
      }
      document.getElementById('prAnnualPay').value = fmtMoneyInput(p.annual_leave_pay);
      document.getElementById('prBonus').value = fmtMoneyInput(p.bonus);
      document.getElementById('prMeal').value = fmtMoneyInput(p.meal_allowance);
      document.getElementById('prTransport').value = fmtMoneyInput(p.transportation_allowance);
      document.getElementById('prOther').value = fmtMoneyInput(p.other_allowance);
      document.getElementById('prWorkDays').value = p.work_days || 0;
      document.getElementById('prAbsent').value = p.absent_days || 0;
      document.getElementById('prLate').value = p.late_count || 0;
      document.getElementById('prOtherDed').value = fmtMoneyInput(p.other_deduction);
      document.getElementById('prNotes').value = p.notes || '';
      window.payrollPreview();
    } catch (e) {
      showToast('급여 로드 실패: ' + e.message, 'error');
    }
  }
};

window.payrollCloseEditModal = function() {
  document.getElementById('prEditModal').classList.add('hidden');
};

window.payrollOnEmployeeChange = async function() {
  var sel = document.getElementById('prEmpSelect');
  var opt = sel.options[sel.selectedIndex];
  var base = opt && opt.getAttribute('data-base');
  if (base && !document.getElementById('prBase').value) {
    document.getElementById('prBase').value = fmtMoneyInput(base);
  }
  // 직원 고정수당/고정공제 기본값을 빈 칸에 자동 채움
  var empId = parseInt(sel.value || 0);
  if (empId > 0) {
    try {
      var res = await axios.get('/api/hr/employees/' + empId);
      var emp = (res.data && res.data.data) || {};
      function fillIfEmpty(elId, val) {
        var el = document.getElementById(elId);
        if (!el) return;
        var cur = readMoney(elId);
        if (!cur && val != null && Number(val) !== 0) el.value = fmtMoneyInput(val);
      }
      if (!document.getElementById('prBase').value && emp.base_salary) {
        document.getElementById('prBase').value = fmtMoneyInput(emp.base_salary);
      }
      // 기타수당 = 직책수당 + 차량유지비 + 기타수당_고정
      var otherAllowance =
        Number(emp.position_allowance || 0) +
        Number(emp.vehicle_allowance || 0) +
        Number(emp.other_allowance_fixed || 0);
      fillIfEmpty('prOther', otherAllowance);
      fillIfEmpty('prMeal', emp.meal_allowance_fixed);
      fillIfEmpty('prBonus', emp.special_bonus_fixed);
      // 기타공제 = 상조회비 + 기타공제_고정
      var otherDed = Number(emp.mutual_aid_fee || 0) + Number(emp.other_deduction_fixed || 0);
      fillIfEmpty('prOtherDed', otherDed);
      // 보험 토글 표시 (있을 경우)
      var badge = document.getElementById('prInsuranceBadge');
      if (badge) {
        var parts = [];
        if (Number(emp.insurance_apply_national_pension) === 0) parts.push('국민연금 제외');
        if (Number(emp.insurance_apply_health) === 0) parts.push('건강보험 제외');
        if (Number(emp.insurance_apply_long_term_care) === 0) parts.push('장기요양 제외');
        if (Number(emp.insurance_apply_employment) === 0) parts.push('고용보험 제외');
        if (Number(emp.insurance_apply_industrial_accident) === 0) parts.push('산재 제외');
        if (parts.length > 0) {
          badge.className = 'inline-block px-2 py-0.5 text-xs rounded bg-amber-50 text-amber-700 border border-amber-200 tabular-nums';
          badge.textContent = parts.join(' · ');
          badge.classList.remove('hidden');
        } else {
          badge.className = 'inline-block px-2 py-0.5 text-xs rounded bg-green-50 text-green-700 border border-green-200';
          badge.textContent = '4대보험 전체 적용';
          badge.classList.remove('hidden');
        }
      }
    } catch (e) { /* 정보 불러오기 실패 시 조용히 무시 */ }
  }
  window.payrollPreview();
};

// Phase 11: 선택한 직원의 기본값(기본급/고정수당/고정공제)으로 강제 덮어쓰기
// payrollOnEmployeeChange는 빈 칸만 채우지만, 이 함수는 현재 값을 덮어씀
window.payrollResetToEmployeeDefaults = async function() {
  var sel = document.getElementById('prEmpSelect');
  var empId = parseInt((sel && sel.value) || 0);
  if (!empId) {
    if (typeof showToast === 'function') {
      showToast('먼저 직원을 선택하세요', 'warning');
    }
    return;
  }
  if (!(await showConfirm('선택한 직원의 기본값으로 덮어쓰시겠습니까?\n\n기본급, 식대, 상여금, 기타수당, 기타공제가 모두 교체됩니다.\n(시간/근태/비고는 유지됩니다)'))) return;
  try {
    var res = await axios.get('/api/hr/employees/' + empId);
    var emp = (res.data && res.data.data) || {};
    // 강제 덮어쓰기 (0이어도 설정)
    document.getElementById('prBase').value = fmtMoneyInput(Number(emp.base_salary || 0));
    // 기타수당 = 직책수당 + 차량유지비 + 기타수당_고정
    var otherAllowance =
      Number(emp.position_allowance || 0) +
      Number(emp.vehicle_allowance || 0) +
      Number(emp.other_allowance_fixed || 0);
    document.getElementById('prOther').value = fmtMoneyInput(otherAllowance);
    document.getElementById('prMeal').value = fmtMoneyInput(Number(emp.meal_allowance_fixed || 0));
    document.getElementById('prBonus').value = fmtMoneyInput(Number(emp.special_bonus_fixed || 0));
    // 기타공제 = 상조회비 + 기타공제_고정
    var otherDed = Number(emp.mutual_aid_fee || 0) + Number(emp.other_deduction_fixed || 0);
    document.getElementById('prOtherDed').value = fmtMoneyInput(otherDed);
    // 보험 배지 재표시 (payrollOnEmployeeChange 와 동일 로직)
    var badge = document.getElementById('prInsuranceBadge');
    if (badge) {
      var parts = [];
      if (Number(emp.insurance_apply_national_pension) === 0) parts.push('국민연금 제외');
      if (Number(emp.insurance_apply_health) === 0) parts.push('건강보험 제외');
      if (Number(emp.insurance_apply_long_term_care) === 0) parts.push('장기요양 제외');
      if (Number(emp.insurance_apply_employment) === 0) parts.push('고용보험 제외');
      if (Number(emp.insurance_apply_industrial_accident) === 0) parts.push('산재 제외');
      if (parts.length > 0) {
        badge.className = 'inline-block px-2 py-0.5 text-xs rounded bg-amber-50 text-amber-700 border border-amber-200 tabular-nums';
        badge.textContent = parts.join(' · ');
      } else {
        badge.className = 'inline-block px-2 py-0.5 text-xs rounded bg-green-50 text-green-700 border border-green-200';
        badge.textContent = '4대보험 전체 적용';
      }
      badge.classList.remove('hidden');
    }
    if (typeof showToast === 'function') {
      showToast('직원 기본값으로 초기화되었습니다', 'success');
    }
    window.payrollPreview();
  } catch (e) {
    if (typeof showToast === 'function') {
      showToast('직원 정보 불러오기 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
    }
  }
};

function prGetFormPayload() {
  var payload = {
    employee_id: parseInt(document.getElementById('prEmpSelect').value || 0),
    pay_period: document.getElementById('prEditPeriod').value,
    pay_date: document.getElementById('prEditPayDate').value || '',
    base_salary: readMoney('prBase'),
    annual_leave_pay: readMoney('prAnnualPay'),
    bonus: readMoney('prBonus'),
    meal: readMoney('prMeal'),
    transport: readMoney('prTransport'),
    other_allowance: readMoney('prOther'),
    work_days: parseFloat(document.getElementById('prWorkDays').value || 0),
    overtime_hours: parseFloat(document.getElementById('prOvertimeHrs').value || 0),
    night_hours: parseFloat(document.getElementById('prNightHrs').value || 0),
    holiday_hours: parseFloat(document.getElementById('prHolidayHrs').value || 0),
    absent_days: parseFloat(document.getElementById('prAbsent').value || 0),
    late_count: parseInt(document.getElementById('prLate').value || 0),
    other_deduction: readMoney('prOtherDed'),
    notes: document.getElementById('prNotes').value,
  };
  // 수동 입력 모드일 때만 금액 직접 전달 (서버는 body.overtime_pay != null 로 판단)
  if (window.prOvertimeManualMode) {
    payload.overtime_pay = readMoney('prOvertime');
    payload.night_pay = readMoney('prNight');
    payload.holiday_pay = readMoney('prHoliday');
  }
  return payload;
}

window.payrollToggleOvertimeMode = function() {
  window.prOvertimeManualMode = !window.prOvertimeManualMode;
  var manual = document.getElementById('prOvertimeManual');
  if (manual) manual.classList.toggle('hidden', !window.prOvertimeManualMode);
  window.payrollPreview();
};

window.payrollPreview = function() {
  if (prPreviewTimer) clearTimeout(prPreviewTimer);
  prPreviewTimer = setTimeout(async function() {
    var p = prGetFormPayload();
    if (!p.employee_id || !p.pay_period) return;
    try {
      var res = await axios.post('/api/payroll/preview', p);
      var d = res.data.data;
      // 4대보험/세금
      document.getElementById('prCalcNP').textContent = fmtMoney(d.deductions.national_pension);
      document.getElementById('prCalcHI').textContent = fmtMoney(d.deductions.health_insurance);
      document.getElementById('prCalcLTC').textContent = fmtMoney(d.deductions.long_term_care_insurance);
      document.getElementById('prCalcEI').textContent = fmtMoney(d.deductions.employment_insurance);
      document.getElementById('prCalcTax').textContent = fmtMoney(d.deductions.income_tax);
      document.getElementById('prCalcLocal').textContent = fmtMoney(d.deductions.local_tax);
      // 추가근로 자동계산 결과
      if (d.overtime) {
        document.getElementById('prHourlyWage').textContent = fmtMoney(d.overtime.hourly_wage);
        document.getElementById('prWorkHoursStd').textContent = d.overtime.monthly_work_hours;
        document.getElementById('prOvertimeAmt').textContent = fmtMoney(d.overtime.auto_overtime_pay);
        document.getElementById('prNightAmt').textContent = fmtMoney(d.overtime.auto_night_pay);
        document.getElementById('prHolidayAmt').textContent = fmtMoney(d.overtime.auto_holiday_pay);
        // 자동 모드일 때 수동 입력칸도 동기화 (표시용)
        if (!window.prOvertimeManualMode) {
          document.getElementById('prOvertime').value = fmtMoneyInput(d.earnings.overtime_pay);
          document.getElementById('prNight').value = fmtMoneyInput(d.earnings.night_pay);
          document.getElementById('prHoliday').value = fmtMoneyInput(d.earnings.holiday_pay);
        }
      }
      var totalDeduct = d.deductions.total_deduction + (parseFloat(p.other_deduction) || 0);
      document.getElementById('prCalcGross').textContent = fmtMoney(d.earnings.total_salary);
      document.getElementById('prCalcDeduct').textContent = fmtMoney(totalDeduct);
      document.getElementById('prCalcNet').textContent = fmtMoney(d.earnings.total_salary - totalDeduct);
    } catch (e) {
      console.error('preview 실패', e);
    }
  }, 350);
};

window.payrollSave = async function() {
  var p = prGetFormPayload();
  if (!p.employee_id || !p.pay_period) {
    showToast('직원과 급여 월을 선택하세요', 'warning');
    return;
  }
  try {
    await axios.post('/api/payroll/save', p);
    window.payrollCloseEditModal();
    window.payrollLoad();
  } catch (e) {
    showToast('저장 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
};

window.payrollApprove = async function(id) {
  if (!(await showConfirm('이 급여를 승인하시겠습니까?'))) return;
  try {
    await axios.patch('/api/payroll/' + id + '/approve');
    window.payrollLoad();
  } catch (e) { showToast('승인 실패: ' + e.message, 'error'); }
};

window.payrollPay = async function(id) {
  if (!(await showConfirm('지급 처리하시겠습니까? (지급 후 수정 불가)'))) return;
  try {
    await axios.patch('/api/payroll/' + id + '/pay');
    window.payrollLoad();
  } catch (e) { showToast('지급 실패: ' + e.message, 'error'); }
};

window.payrollDelete = async function(id) {
  if (!(await showConfirm('삭제하시겠습니까?', { danger: true }))) return;
  try {
    await axios.delete('/api/payroll/' + id);
    window.payrollLoad();
  } catch (e) { showToast('삭제 실패: ' + e.message, 'error'); }
};

window.payrollOpenSlip = function(id) {
  window.open('/payslip/' + id, '_blank', 'width=900,height=1200');
};

window.payrollOpenYearEnd = function(employeeId, year) {
  if (!employeeId) { showToast('직원 정보가 없습니다', 'warning'); return; }
  var y = year || String(new Date().getFullYear());
  window.open('/year-end/' + employeeId + '?year=' + y, '_blank', 'width=900,height=1200');
};

window.payrollOpenBatchSlip = function() {
  var period = document.getElementById('prPeriod').value;
  if (!period) { showToast('급여 월을 먼저 선택하세요', 'warning'); return; }
  window.open('/payslip/batch?period=' + encodeURIComponent(period), '_blank', 'width=900,height=1200');
};

// 세무사 CSV 다운로드 드롭다운 토글
window.payrollToggleTaxMenu = function() {
  var menu = document.getElementById('prTaxMenu');
  if (!menu) return;
  menu.classList.toggle('hidden');
  // 바깥 클릭 시 닫기 (1회성 리스너)
  if (!menu.classList.contains('hidden')) {
    setTimeout(function() {
      var close = function(ev) {
        var btn = document.getElementById('prTaxBtn');
        if (menu.contains(ev.target) || (btn && btn.contains(ev.target))) return;
        menu.classList.add('hidden');
        document.removeEventListener('click', close);
      };
      document.addEventListener('click', close);
    }, 0);
  }
};

// CSV 다운로드 공통 헬퍼 — axios responseType blob + URL.createObjectURL
async function payrollDownloadCsv(url, fallbackFilename) {
  try {
    var res = await axios.get(url, { responseType: 'blob' });
    // Content-Disposition에서 파일명 추출 (UTF-8 RFC 5987 형식 지원)
    var filename = fallbackFilename;
    var cd = res.headers['content-disposition'] || res.headers['Content-Disposition'] || '';
    var m = cd.match(/filename\*=UTF-8''([^;]+)/);
    if (m) {
      try { filename = decodeURIComponent(m[1]); } catch (e) {}
    } else {
      var m2 = cd.match(/filename="?([^";]+)"?/);
      if (m2) filename = m2[1];
    }

    var blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    var href = URL.createObjectURL(blob);
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(href); }, 1000);

    if (window.showToast) showToast('다운로드 완료: ' + filename, 'success');
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) || e.message;
    if (window.showToast) showToast('다운로드 실패: ' + msg, 'error');
    else showToast('다운로드 실패: ' + msg, 'error');
  }
  // 메뉴 닫기
  var menu = document.getElementById('prTaxMenu');
  if (menu) menu.classList.add('hidden');
}

window.payrollDownloadTaxChanges = function() {
  var period = document.getElementById('prPeriod').value;
  if (!period) { showToast('급여 월을 먼저 선택하세요', 'warning'); return; }
  payrollDownloadCsv(
    '/api/payroll/tax-agent/changes?period=' + encodeURIComponent(period),
    '4대보험_변동사항_' + period + '.csv'
  );
};

window.payrollDownloadTaxPayroll = function() {
  var period = document.getElementById('prPeriod').value;
  if (!period) { showToast('급여 월을 먼저 선택하세요', 'warning'); return; }
  payrollDownloadCsv(
    '/api/payroll/tax-agent/payroll?period=' + encodeURIComponent(period),
    '급여내역_' + period + '.csv'
  );
};

window.payrollDownloadTaxRoster = function() {
  var today = new Date().toISOString().slice(0, 10);
  payrollDownloadCsv(
    '/api/payroll/tax-agent/roster?status=active',
    '직원명부_재직자_' + today + '.csv'
  );
};

window.payrollDownloadTaxAnnual = function() {
  var period = document.getElementById('prPeriod').value;
  // period=YYYY-MM에서 연도만 추출, 없으면 올해
  var year = (period && /^\d{4}-\d{2}$/.test(period))
    ? period.slice(0, 4)
    : String(new Date().getFullYear());
  var input = prompt('연간 급여대장을 생성할 연도를 입력하세요 (YYYY)', year);
  if (!input) return;
  if (!/^\d{4}$/.test(input)) { showToast('YYYY 형식으로 입력하세요', 'warning'); return; }
  payrollDownloadCsv(
    '/api/payroll/tax-agent/annual?year=' + encodeURIComponent(input),
    '연간급여대장_' + input + '.csv'
  );
};

window.payrollBatch = async function() {
  var period = document.getElementById('prPeriod').value;
  if (!period) { showToast('급여 월을 먼저 선택하세요', 'warning'); return; }
  if (!(await showConfirm(period + ' 전 직원 급여를 일괄 생성합니다 (기본급 기준, 이미 있으면 스킵). 계속할까요?'))) return;
  try {
    var res = await axios.post('/api/payroll/batch', { pay_period: period });
    var d = res.data.data;
    var msg = '완료: 생성 ' + d.created + '건 / 스킵 ' + d.skipped + '건 (총 ' + d.total + '명)';
    if (d.skipped > 0 && Array.isArray(d.skipped_names) && d.skipped_names.length > 0) {
      msg += '\n\n스킵된 직원: ' + d.skipped_names.join(', ');
    }
    showToast(msg, 'warning');
    window.payrollLoad();
  } catch (e) { showToast('일괄 생성 실패: ' + e.message, 'error'); }
};

window.payrollSyncAttendance = async function() {
  var period = document.getElementById('prPeriod').value;
  if (!period) { showToast('급여 월을 먼저 선택하세요', 'warning'); return; }
  if (!(await showConfirm(period + ' 전 직원 근태 데이터를 급여에 반영합니다. 계속할까요?'))) return;
  try {
    var res = await axios.post('/api/payroll/sync-attendance', { pay_period: period });
    var d = res.data.data || {};
    showToast('근태 동기화 완료: ' + (d.synced || 0) + '/' + (d.total_targets || 0) + '명', 'success');
    window.payrollLoad();
  } catch (e) {
    showToast('근태 동기화 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
};

window.payrollSyncOne = async function(id) {
  // 단일 payroll 행 → employee_id 알아내기 위해 현재 데이터 재조회보다 서버에 id 전달
  var period = document.getElementById('prPeriod').value;
  if (!period) { showToast('급여 월을 먼저 선택하세요', 'warning'); return; }
  try {
    // 해당 payroll의 employee_id를 먼저 조회
    var p = await axios.get('/api/payroll/' + id);
    var empId = p.data && p.data.data && p.data.data.employee_id;
    if (!empId) { showToast('직원 정보를 찾을 수 없습니다', 'warning'); return; }
    var res = await axios.post('/api/payroll/sync-attendance', { pay_period: period, employee_ids: [empId] });
    var d = res.data.data || {};
    if ((d.synced || 0) > 0) {
      if (window.showToast) showToast('근태 동기화 완료', 'success');
      window.payrollLoad();
    } else {
      showToast('동기화 대상이 없습니다', 'warning');
    }
  } catch (e) {
    showToast('동기화 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
};

window.payrollBulkApprove = async function() {
  var ids = prGetSelectedIds();
  if (ids.length === 0) { showToast('선택된 급여가 없습니다', 'warning'); return; }
  if (!(await showConfirm(ids.length + '건의 급여를 일괄 승인합니다. 계속할까요?'))) return;
  var ok = 0, fail = 0;
  for (var i = 0; i < ids.length; i++) {
    try { await axios.patch('/api/payroll/' + ids[i] + '/approve'); ok++; }
    catch (e) { fail++; }
  }
  showToast('완료: 승인 ' + ok + '건, 실패 ' + fail + '건', fail > 0 ? 'warning' : 'success');
  window.payrollLoad();
};

window.payrollBulkPay = async function() {
  var ids = prGetSelectedIds();
  if (ids.length === 0) { showToast('선택된 급여가 없습니다', 'warning'); return; }
  if (!(await showConfirm(ids.length + '건의 급여를 일괄 지급완료 처리합니다. (이후 수정 불가) 계속할까요?'))) return;
  var ok = 0, fail = 0;
  for (var i = 0; i < ids.length; i++) {
    try { await axios.patch('/api/payroll/' + ids[i] + '/pay'); ok++; }
    catch (e) { fail++; }
  }
  showToast('완료: 지급 ' + ok + '건, 실패 ' + fail + '건', fail > 0 ? 'warning' : 'success');
  window.payrollLoad();
};

window.payrollBulkSyncAttendance = async function() {
  var ids = prGetSelectedIds();
  if (ids.length === 0) { showToast('선택된 급여가 없습니다', 'warning'); return; }
  var period = document.getElementById('prPeriod').value;
  if (!period) { showToast('급여 월을 먼저 선택하세요', 'warning'); return; }
  if (!(await showConfirm('선택된 ' + ids.length + '건의 근태를 동기화합니다. 계속할까요?'))) return;
  try {
    // employee_id 목록 수집
    var empIds = [];
    for (var i = 0; i < ids.length; i++) {
      try {
        var p = await axios.get('/api/payroll/' + ids[i]);
        var eid = p.data && p.data.data && p.data.data.employee_id;
        if (eid) empIds.push(eid);
      } catch (e) {}
    }
    if (empIds.length === 0) { showToast('대상 직원이 없습니다', 'warning'); return; }
    var res = await axios.post('/api/payroll/sync-attendance', { pay_period: period, employee_ids: empIds });
    var d = res.data.data || {};
    showToast('근태 동기화 완료: ' + (d.synced || 0) + '/' + (d.total_targets || 0) + '명', 'success');
    window.payrollLoad();
  } catch (e) {
    showToast('동기화 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
};

window.payrollOpenRatesModal = function() {
  document.getElementById('prRatesModal').classList.remove('hidden');
  window.payrollLoadRates();
};
window.payrollCloseRatesModal = function() {
  document.getElementById('prRatesModal').classList.add('hidden');
};
window.payrollLoadRates = async function() {
  var year = document.getElementById('prRatesYear').value || 2026;
  var tbody = document.getElementById('prRatesBody');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-4">로드 중...</td></tr>';
  try {
    var res = await axios.get('/api/payroll/rates/' + year);
    var rows = res.data.data || [];
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-4">데이터 없음</td></tr>';
      return;
    }
    var labelMap = {
      NATIONAL_PENSION: '국민연금',
      HEALTH: '건강보험',
      LONG_TERM_CARE: '장기요양',
      EMPLOYMENT: '고용보험',
      INDUSTRIAL_ACCIDENT: '산재보험',
    };
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      html += '<tr class="border-b">' +
        '<td class="px-3 py-2">' + (labelMap[r.insurance_type] || r.insurance_type) + '</td>' +
        '<td class="px-3 py-2 text-right">' + r.total_rate + '%</td>' +
        '<td class="px-3 py-2 text-right">' + r.employee_rate + '%</td>' +
        '<td class="px-3 py-2 text-right">' + r.employer_rate + '%</td>' +
        '<td class="px-3 py-2 text-xs text-gray-500">' + (r.base === 'HEALTH_INSURANCE' ? '건강보험료' : '과세급여') + '</td>' +
        '</tr>';
    }
    tbody.innerHTML = html;
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500 py-4">로드 실패</td></tr>';
  }
};

// ─── 메시지 발송 ──────────────────────────────────────────────────────────────

function sendPayslipNotice(payrollId, employeeId, name, phone, period) {
  // 해당 행의 net_pay 조회 (currentPayrollData에서 찾기)
  var netPay = '';
  for (var i = 0; i < currentPayrollData.length; i++) {
    if (currentPayrollData[i].id === payrollId) {
      var n = parseInt(currentPayrollData[i].net_pay || 0);
      if (n > 0) netPay = '\n실지급액: ' + n.toLocaleString('ko-KR') + '원';
      break;
    }
  }
  if (typeof window.openSendMessage !== 'function') {
    showToast('메시지 발송 기능을 사용할 수 없습니다', 'error');
    return;
  }
  window.openSendMessage({
    receiver: { name: name, phone: phone },
    context: { type: 'payroll', id: payrollId },
    defaultChannel: 'sms',
    defaultContent: name + '님, 동산현수막입니다.\n\n' + period + ' 급여명세서를 안내드립니다.' + netPay + '\n\n명세서 확인은 아래 링크를 통해 가능합니다.\n\n문의: 042-523-1982',
  });
}

window.sendPayslipBulk = async function() {
  if (!currentPayrollData || !currentPayrollData.length) {
    showToast('발송할 급여 데이터가 없습니다', 'warning');
    return;
  }

  var targets = currentPayrollData.filter(function(r) { return r.employee_mobile; });
  if (targets.length === 0) {
    showToast('연락처가 등록된 직원이 없습니다', 'warning');
    return;
  }

  if (!(await showConfirm(targets.length + '명에게 급여명세서를 발송합니다.'))) return;

  try {
    var res = await axios.post('/api/messages/send-bulk', {
      channel: 'sms',
      target_type: 'custom',
      receivers: targets.map(function(r) {
        return { name: r.employee_name, phone: r.employee_mobile };
      }),
      content: {
        body: '동산현수막 급여명세서를 안내드립니다.\n\n급여 기간: ' + (targets[0].pay_period || '') + '\n\n명세서 확인은 담당자에게 문의하시기 바랍니다.\n\n문의: 042-523-1982'
      }
    });
    if (res.data.success) {
      showToast(targets.length + '명에게 발송 완료', 'success');
    } else {
      showToast(res.data.error || '발송 실패', 'error');
    }
  } catch (e) {
    showToast('발송 오류: ' + ((e.response && e.response.data ? e.response.data.error : null) || e.message), 'error');
  }
};

// IIFE — 파일 맨 아래 (호이스팅 방지)
(function prInit() {
  // 기본값: 이번 달
  var now = new Date();
  var ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  var p = document.getElementById('prPeriod');
  if (p && !p.value) p.value = ym;
  prLoadEmployeeOptions();
})();
