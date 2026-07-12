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
        opts += '<option value="' + e.id + '" data-base="' + (e.base_salary || 0) + '">' + escapeHtml(e.employee_code || '') + ' ' + escapeHtml(e.name || '') + ' ' + escapeHtml(prDeptLabel(e.department)) + '</option>';
      }
      sel.innerHTML = opts;
    }
  } catch (e) {
    console.error('직원 로드 실패', e);
  }
}

// 급여대장 행 액션 버튼 (근태동기화/수정/명세서/연말정산/발송 + 상태별 승인/삭제/지급)
function prActionsHtml(r) {
  var year = (r.pay_period || '').substring(0, 4);
  var prEscName = (r.employee_name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var prEscPhone = (r.employee_mobile || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var prEscPeriod = (r.pay_period || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var actions = '<button onclick="payrollSyncOne(' + r.id + ')" class="text-amber-600 hover:text-amber-800 mx-0.5" title="이 직원 근태 동기화"><i class="fas fa-sync-alt"></i></button>';
  actions += '<button onclick="payrollOpenEditModal(' + r.id + ')" class="text-blue-600 hover:text-blue-800 mx-0.5" title="수정"><i class="fas fa-edit"></i></button>';
  actions += '<button onclick="payrollOpenSlip(' + r.id + ')" class="text-gray-600 hover:text-gray-800 mx-0.5" title="명세서"><i class="fas fa-file-invoice-dollar"></i></button>';
  actions += '<button onclick="payrollOpenYearEnd(' + r.employee_id + ',\'' + year + '\')" class="text-blue-600 hover:text-blue-800 mx-0.5" title="연말정산"><i class="fas fa-file-contract"></i></button>';
  actions += '<button onclick="sendPayslipNotice(' + r.id + ',' + r.employee_id + ',\'' + prEscName + '\',\'' + prEscPhone + '\',\'' + prEscPeriod + '\')" class="text-green-600 hover:text-green-800 mx-0.5" title="명세서 발송"><i class="fas fa-paper-plane"></i></button>';
  if (r.status === 'PENDING') {
    actions += '<button onclick="payrollApprove(' + r.id + ')" class="text-green-600 hover:text-green-800 mx-0.5" title="승인"><i class="fas fa-check"></i></button>';
    actions += '<button onclick="payrollDelete(' + r.id + ')" class="text-red-600 hover:text-red-800 mx-0.5" title="삭제"><i class="fas fa-trash"></i></button>';
  } else if (r.status === 'APPROVED') {
    actions += '<button onclick="payrollPay(' + r.id + ')" class="text-blue-600 hover:text-blue-800 mx-0.5" title="지급처리"><i class="fas fa-money-bill-wave"></i></button>';
  }
  return actions;
}

window.payrollLoad = async function() {
  var period = document.getElementById('prPeriod').value;
  var status = document.getElementById('prStatus').value;
  var table = document.getElementById('prLedgerTable');
  if (table) {
    table.style.width = '100%';
    table.innerHTML = '<tbody><tr><td style="padding:24px;text-align:center;color:#9ca3af;border:none"><i class="fas fa-spinner fa-spin mr-1"></i>로딩 중...</td></tr></tbody>';
  }

  // 이전 선택 초기화
  prSelected = {};
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

    var sumGross = 0, sumDeduct = 0, sumNet = 0;
    for (var i = 0; i < rows.length; i++) {
      sumGross += parseFloat(rows[i].total_salary || 0);
      sumDeduct += parseFloat(rows[i].total_deduction || 0);
      sumNet += parseFloat(rows[i].net_pay || 0);
    }
    document.getElementById('prSumCount').textContent = rows.length ? rows.length + '명' : '0';
    document.getElementById('prSumGross').textContent = rows.length ? prFmtMoneyShort(sumGross) : '0';
    document.getElementById('prSumDeduct').textContent = rows.length ? prFmtMoneyShort(sumDeduct) : '0';
    document.getElementById('prSumNet').textContent = rows.length ? prFmtMoneyShort(sumNet) : '0';
    payrollRenderLedger();
  } catch (err) {
    if (table) table.innerHTML = '<tbody><tr><td style="padding:24px;text-align:center;color:#ef4444;border:none">로드 실패: ' + (err.message || '') + '</td></tr></tbody>';
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
  var boxes = document.querySelectorAll('#prLedgerTable input.pr-row-check');
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
        // 연장 분해 표기: 고정연장(포괄임금 내재) + 추가연장(근태 실측=연장+조기출근)
        var bdEl = document.getElementById('prOvertimeBreakdown');
        if (bdEl) {
          var fx = parseFloat(d.overtime.fixed_overtime_hours) || 0;
          var ex = parseFloat(d.overtime.extra_overtime_hours) || 0;
          bdEl.innerHTML = fx > 0
            ? ('<span class="text-gray-600">고정연장 ' + fx.toFixed(1) + 'h</span> + <span class="text-red-600 font-medium">추가연장 ' + ex.toFixed(1) + 'h</span>')
            : (ex > 0 ? '<span class="text-red-600 font-medium">추가연장 ' + ex.toFixed(1) + 'h</span>' : '');
        }
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

// ── 선택 일괄수정 ─────────────────────────────────────────────────────────
// 선택된 PENDING 행에 공통 필드를 덮어써 /save로 round-trip → 서버가 공제(4대보험·소득세) 전액 재계산.
// 빈칸=변경 없음. 승인/지급완료(잠금)는 스킵. 나머지 필드는 기존값 유지(명시 전달 — /save 직원기본값 폴백 방지).
window.payrollOpenBulkEdit = function() {
  var ids = prGetSelectedIds();
  if (!ids.length) { showToast('수정할 급여를 먼저 선택하세요', 'warning'); return; }
  ['prBulkPayDate','prBulkMeal','prBulkTransport','prBulkBonus','prBulkOther','prBulkOtherDed'].forEach(function(k){
    var el = document.getElementById(k); if (el) el.value = '';
  });
  var pending = 0;
  ids.forEach(function(id){
    var r = (currentPayrollData || []).find(function(x){ return x.id === id; });
    if (r && r.status === 'PENDING') pending++;
  });
  var cnt = document.getElementById('prBulkCount');
  if (cnt) cnt.textContent = '선택 ' + ids.length + '명 · 수정 가능(작성중) ' + pending + '명';
  document.getElementById('prBulkModal').classList.remove('hidden');
};

window.payrollCloseBulkEdit = function() {
  document.getElementById('prBulkModal').classList.add('hidden');
};

window.payrollBulkEditApply = async function() {
  var ids = prGetSelectedIds();
  if (!ids.length) { showToast('선택된 급여가 없습니다', 'warning'); return; }
  var readOv = function(elId) {
    var el = document.getElementById(elId);
    var s = ((el && el.value) || '').trim();
    if (!s) return null;   // 빈칸 = 변경 없음 ('0'은 0으로 설정)
    return window.parseMoney ? window.parseMoney(s) : (parseInt(s.replace(/[^\d.-]/g, ''), 10) || 0);
  };
  var ov = {
    pay_date: (document.getElementById('prBulkPayDate').value || null),
    meal: readOv('prBulkMeal'),
    transport: readOv('prBulkTransport'),
    bonus: readOv('prBulkBonus'),
    other_allowance: readOv('prBulkOther'),
    other_deduction: readOv('prBulkOtherDed')
  };
  if (!Object.keys(ov).some(function(k){ return ov[k] != null; })) {
    showToast('변경할 항목을 입력하세요 (빈칸=유지)', 'warning');
    return;
  }
  var done = 0, skipped = 0, failed = 0;
  for (var i = 0; i < ids.length; i++) {
    var row = (currentPayrollData || []).find(function(x){ return x.id === ids[i]; });
    if (!row) continue;
    if (row.status !== 'PENDING') { skipped++; continue; }
    var body = {
      employee_id: row.employee_id,
      pay_period: row.pay_period,
      pay_date: ov.pay_date != null ? ov.pay_date : (row.pay_date || ''),
      base_salary: Number(row.base_salary) || 0,
      overtime_hours: parseFloat(row.overtime_hours) || 0,
      overtime_pay: Number(row.overtime_pay) || 0,
      night_pay: Number(row.night_pay) || 0,
      holiday_pay: Number(row.holiday_pay) || 0,
      annual_leave_pay: Number(row.annual_leave_pay) || 0,
      bonus: ov.bonus != null ? ov.bonus : (Number(row.bonus) || 0),
      other_allowance: ov.other_allowance != null ? ov.other_allowance : (Number(row.other_allowance) || 0),
      meal: ov.meal != null ? ov.meal : (Number(row.meal_allowance) || 0),
      transport: ov.transport != null ? ov.transport : (Number(row.transportation_allowance) || 0),
      childcare: Number(row.nontax_childcare) || 0,
      work_days: parseFloat(row.work_days) || 0,
      absent_days: parseFloat(row.absent_days) || 0,
      late_count: parseInt(row.late_count) || 0,
      leave_used_days: parseFloat(row.leave_used_days) || 0,
      other_deduction: ov.other_deduction != null ? ov.other_deduction : (Number(row.other_deduction) || 0),
      notes: row.notes || ''
    };
    try {
      await axios.post('/api/payroll/save', body);
      done++;
    } catch (e) {
      failed++;
    }
  }
  payrollCloseBulkEdit();
  showToast('일괄수정: ' + done + '명 적용'
    + (skipped ? ' · 잠금 스킵 ' + skipped + '명' : '')
    + (failed ? ' · 실패 ' + failed + '명' : ''), failed ? 'warning' : 'success');
  payrollLoad();
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
  var today = (window.kstToday ? window.kstToday() : new Date().toISOString().slice(0, 10));
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
    defaultContent: name + '님, 동산기획입니다.\n\n' + period + ' 급여명세서를 안내드립니다.' + netPay + '\n\n명세서 확인은 아래 링크를 통해 가능합니다.\n\n문의: 042-523-1982',
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
        body: '동산기획 급여명세서를 안내드립니다.\n\n급여 기간: ' + (targets[0].pay_period || '') + '\n\n명세서 확인은 담당자에게 문의하시기 바랍니다.\n\n문의: 042-523-1982'
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

// ============================================================================
// 급여대장 (확장 뷰) — 고정형(table-layout:fixed) + 탭(급여대장 / 회사부담금)
//   기존 /payroll 목록(currentPayrollData) 재사용. API 변경 없음.
//   컬럼은 descriptor 배열로 정의 → 고정 너비 colgroup·헤더·본문·합계·CSV 공통 생성.
// ============================================================================
window.payrollLedgerTab = 'main';   // 'main'=급여대장(지급/공제 2단) | 'emp'=회사부담금

// CSV 내보내기용 평면 컬럼 (전체 항목 — 화면은 2단 밴드 구조로 별도 렌더)
// descriptor: {key,label,w,group,kind,sticky?,bold?,calc?}   group: id|pay|ded|net|emp|sum
var LEDGER_MAIN_COLS = [
  {key:'employee_code', label:'사번', w:60, group:'id', kind:'text', sticky:0},
  {key:'employee_name', label:'성명', w:78, group:'id', kind:'text', sticky:60},
  {key:'department', label:'부서', w:64, group:'id', kind:'dept'},
  {key:'position', label:'직급', w:56, group:'id', kind:'pos'},
  {key:'base_salary', label:'기본급', w:94, group:'pay', kind:'num'},
  {key:'overtime_pay', label:'연장', w:84, group:'pay', kind:'num'},
  {key:'night_pay', label:'야간', w:72, group:'pay', kind:'num'},
  {key:'holiday_pay', label:'휴일', w:72, group:'pay', kind:'num'},
  {key:'meal_allowance', label:'식대', w:74, group:'pay', kind:'num'},
  {key:'transportation_allowance', label:'교통', w:72, group:'pay', kind:'num'},
  {key:'other_allowance', label:'기타', w:80, group:'pay', kind:'num'},
  {key:'bonus', label:'상여', w:80, group:'pay', kind:'num'},
  {key:'annual_leave_pay', label:'연차', w:72, group:'pay', kind:'num'},
  {key:'total_salary', label:'지급계', w:102, group:'pay', kind:'num', bold:true},
  {key:'national_pension', label:'국민연금', w:84, group:'ded', kind:'num'},
  {key:'health_insurance', label:'건강', w:78, group:'ded', kind:'num'},
  {key:'long_term_care_insurance', label:'장기요양', w:82, group:'ded', kind:'num'},
  {key:'employment_insurance', label:'고용', w:72, group:'ded', kind:'num'},
  {key:'income_tax', label:'소득세', w:86, group:'ded', kind:'num'},
  {key:'local_tax', label:'지방세', w:74, group:'ded', kind:'num'},
  {key:'other_deduction', label:'기타', w:74, group:'ded', kind:'num'},
  {key:'total_deduction', label:'공제계', w:102, group:'ded', kind:'num', bold:true},
  {key:'net_pay', label:'실지급', w:110, group:'net', kind:'num', bold:true}
];

// 급여대장 화면 좌우 분리 구조: 지급 블록(좌, 5칸×2단) | 공제 블록(우, 4칸×2단).
// 급여대장 4단 좌우 분리 (용준님 요청 2026-07-02: "4단 구조 + 지급계/공제계 병합셀"):
//   좌=지급 블록 3칸(고정지급|시간외|변동수당)×3단 + 4단째 근태 메타행
//   우=공제 블록 2칸(4대보험|세금·기타)×4단
//   셀 = 라벨+금액(in-cell label — 세로 스크롤 중에도 헤더 없이 읽힘, 헤더는 1행으로 단순화)
//   지급계·공제계·실지급 = rowspan=4 병합셀 클러스터(나란히 배치 — 한눈에)
var BAND_PAY_ROWS = [
  [{key:'base_salary', label:'기본급'}, {key:'overtime_pay', label:'연장'}, {key:'other_allowance', label:'기타수당'}],
  [{key:'meal_allowance', label:'식대'}, {key:'night_pay', label:'야간'}, {key:'bonus', label:'상여'}],
  [{key:'transportation_allowance', label:'자가운전'}, {key:'holiday_pay', label:'휴일'}, {key:'annual_leave_pay', label:'연차'}]
];
var BAND_DED_ROWS = [
  [{key:'national_pension', label:'국민연금'}, {key:'income_tax', label:'소득세'}],
  [{key:'health_insurance', label:'건강보험'}, {key:'local_tax', label:'지방세'}],
  [{key:'long_term_care_insurance', label:'장기요양'}, {key:'other_deduction', label:'기타공제'}],
  [{key:'employment_insurance', label:'고용보험'}, null]
];
var BAND_ID_COLS = [
  {key:'employee_code', label:'사번', w:60},
  {key:'employee_name', label:'성명', w:78},
  {key:'department', label:'부서', w:64},
  {key:'position', label:'직급', w:56}
];
var BAND_W = {check:32, slot:118, sum:104, net:110, status:74, act:158};
var LEDGER_EMP_COLS = [
  {key:'employee_code', label:'사번', w:60, group:'id', kind:'text', sticky:0},
  {key:'employee_name', label:'성명', w:78, group:'id', kind:'text', sticky:60},
  {key:'department', label:'부서', w:64, group:'id', kind:'dept'},
  {key:'position', label:'직급', w:56, group:'id', kind:'pos'},
  {key:'employer_national_pension', label:'국민연금', w:92, group:'emp', kind:'num'},
  {key:'employer_health_insurance', label:'건강', w:86, group:'emp', kind:'num'},
  {key:'employer_long_term_care', label:'장기요양', w:88, group:'emp', kind:'num'},
  {key:'employer_employment_insurance', label:'고용', w:80, group:'emp', kind:'num'},
  {key:'employer_industrial_accident', label:'산재', w:80, group:'emp', kind:'num'},
  {key:'__emp_total', label:'부담계', w:104, group:'emp', kind:'calc', calc:'emp', bold:true},
  {key:'total_salary', label:'지급총액', w:108, group:'sum', kind:'num'},
  {key:'__labor', label:'총인건비', w:118, group:'sum', kind:'calc', calc:'labor', bold:true}
];
var LEDGER_GROUP = {
  id:{label:'',cls:''}, pay:{label:'지 급',cls:'grp-pay'}, ded:{label:'공 제',cls:'grp-ded'},
  net:{label:'',cls:''}, emp:{label:'회사부담 (사업주)',cls:'grp-emp'}, sum:{label:'인건비',cls:'grp-sum'}
};

function prNum(r, k){ return parseFloat(r[k] || 0) || 0; }
function prLC(n){ return (Math.round(n) || 0).toLocaleString('ko-KR'); }
function prDeptLabel(d){ return (window.DEPT_NAMES && window.DEPT_NAMES[d]) || d || '(미지정)'; }
function prPosLabel(p){ return (window.POSITION_NAMES && window.POSITION_NAMES[p]) || p || ''; }
function prEmpTotal(r){ return prNum(r,'employer_national_pension')+prNum(r,'employer_health_insurance')+prNum(r,'employer_long_term_care')+prNum(r,'employer_employment_insurance')+prNum(r,'employer_industrial_accident'); }
function prLedgerCols(){ return window.payrollLedgerTab === 'emp' ? LEDGER_EMP_COLS : LEDGER_MAIN_COLS; }
function prColVal(c, r){
  if (c.kind === 'num') return prNum(r, c.key);
  if (c.kind === 'calc') return c.calc === 'emp' ? prEmpTotal(r) : (prNum(r,'total_salary') + prEmpTotal(r));
  return 0;
}
function prColCls(c){ return (c.kind==='num'||c.kind==='calc'?'num':'lft') + (LEDGER_GROUP[c.group].cls?(' '+LEDGER_GROUP[c.group].cls):'') + (c.bold?' b':'') + (c.sticky!=null?' stick':''); }
function prColStyle(c){ return c.sticky!=null ? ' style="left:'+c.sticky+'px"' : ''; }

window.payrollSwitchLedgerTab = function(tab){
  window.payrollLedgerTab = tab;
  var m = document.getElementById('prLedgerTabMain'), e = document.getElementById('prLedgerTabEmp');
  var on = 'border-blue-600 text-blue-700', off = 'border-transparent text-gray-500 hover:text-gray-700';
  if (m) m.className = 'px-3 py-1.5 text-xs font-semibold border-b-2 ' + (tab==='main'?on:off);
  if (e) e.className = 'px-3 py-1.5 text-xs font-semibold border-b-2 ' + (tab==='emp'?on:off);
  payrollRenderLedger();
};

function prLedgerEmptyTotals(cols){ var t={_count:0}; cols.forEach(function(c){ if(c.kind==='num'||c.kind==='calc') t[c.key]=0; }); return t; }
function prLedgerAccum(t, cols, r){ t._count++; cols.forEach(function(c){ if(c.kind==='num'||c.kind==='calc') t[c.key]+=prColVal(c,r); }); }

function prLedgerHead(cols){
  var cg = '<colgroup>' + cols.map(function(c){ return '<col style="width:'+c.w+'px">'; }).join('') + '</colgroup>';
  var r1='', r2='', i=0;
  while (i < cols.length){
    var c = cols[i];
    if (c.group==='id' || c.group==='net'){
      r1 += '<th rowspan="2" class="'+prColCls(c)+'"'+prColStyle(c)+'>'+c.label+'</th>';
      i++;
    } else {
      var g=c.group, j=i, span=0;
      while (j<cols.length && cols[j].group===g){ span++; j++; }
      r1 += '<th colspan="'+span+'" class="'+(LEDGER_GROUP[g].cls||'')+'" style="text-align:center">'+LEDGER_GROUP[g].label+'</th>';
      for (var k=i;k<j;k++){ r2 += '<th class="num '+(LEDGER_GROUP[cols[k].group].cls||'')+(cols[k].bold?' b':'')+'">'+cols[k].label+'</th>'; }
      i = j;
    }
  }
  return cg + '<thead><tr>'+r1+'</tr><tr>'+r2+'</tr></thead>';
}
function prLedgerDataRow(cols, r){
  var html = '<tr>';
  cols.forEach(function(c){
    var v;
    if (c.kind==='text') v = escapeHtml(r[c.key]||'');
    else if (c.kind==='dept') v = escapeHtml(prDeptLabel(r.department));
    else if (c.kind==='pos') v = escapeHtml(prPosLabel(r.position));
    else v = prLC(prColVal(c, r));
    html += '<td class="'+prColCls(c)+'"'+prColStyle(c)+'>'+v+'</td>';
  });
  return html + '</tr>';
}
function prLedgerTotalRow(cols, label, t, cls){
  var html = '<tr class="'+cls+'">';
  cols.forEach(function(c){
    var v = '';
    if (c.key==='employee_name') v = escapeHtml(label);
    else if (c.key==='position') v = t._count + '명';
    else if (c.kind==='num'||c.kind==='calc') v = prLC(t[c.key]||0);
    html += '<td class="'+prColCls(c)+'"'+prColStyle(c)+'>'+v+'</td>';
  });
  return html + '</tr>';
}

// ── 급여대장 4단 좌우 분리 렌더 (main 탭) ──────────────────────────────────
// 직원당 4행. 좌=지급 3칸×3단+근태 메타, 우=공제 2칸×4단. 셀=라벨+금액.
// 신원/지급계/공제계/실지급/상태/액션은 rowspan=4 병합셀.
function prBandWidth(withUi){
  var w = BAND_ID_COLS.reduce(function(s,c){ return s+c.w; }, 0)
    + (BAND_PAY_ROWS[0].length + BAND_DED_ROWS[0].length) * BAND_W.slot
    + BAND_W.sum * 2 + BAND_W.net;
  if (withUi) w += BAND_W.check + BAND_W.status + BAND_W.act;
  return w;
}
// 라벨+금액 셀. item=null → 빈 자리(공제 4단째 우측)
function prBandLvCell(item, src, tint){
  if (!item) return '<td class="lv '+tint+' z"></td>';
  var v = Math.round(prNum(src, item.key)) || 0;
  return '<td class="lv '+tint+(v===0?' z':'')+'"><span class="lv-l">'+item.label+'</span><span class="lv-v">'+prLC(v)+'</span></td>';
}
function prBandItemCells(src, rowIdx, tintPay, tintDed){
  var html = '';
  BAND_PAY_ROWS[rowIdx].forEach(function(s){ html += prBandLvCell(s, src, tintPay); });
  BAND_DED_ROWS[rowIdx].forEach(function(s){ html += prBandLvCell(s, src, tintDed); });
  return html;
}
function prBandHeadHtml(withUi){
  var colw = [];
  if (withUi) colw.push(BAND_W.check);
  BAND_ID_COLS.forEach(function(c){ colw.push(c.w); });
  for (var k = 0; k < BAND_PAY_ROWS[0].length; k++) colw.push(BAND_W.slot);
  colw.push(BAND_W.sum);   // 지급계 — 지급 블록 바로 뒤
  for (var k2 = 0; k2 < BAND_DED_ROWS[0].length; k2++) colw.push(BAND_W.slot);
  colw.push(BAND_W.sum);   // 공제계
  colw.push(BAND_W.net);
  if (withUi){ colw.push(BAND_W.status); colw.push(BAND_W.act); }
  var html = '<colgroup>' + colw.map(function(w){ return '<col style="width:'+w+'px">'; }).join('') + '</colgroup>';

  // 단일 헤더 행 — 항목 라벨은 셀 안에 있으므로 그룹 밴드만 표시
  var r = '';
  var left = 0;
  if (withUi){ r += '<th class="ctr stick" style="left:0px"><input type="checkbox" id="prSelectAll" onchange="payrollToggleAll(this.checked)"></th>'; left = BAND_W.check; }
  BAND_ID_COLS.forEach(function(c, i){
    var sticky = i < 2;   // 사번·성명 고정
    r += '<th class="lft'+(sticky?' stick':'')+'"'+(sticky?' style="left:'+left+'px"':'')+'>'+c.label+'</th>';
    if (sticky) left += c.w;
  });
  r += '<th colspan="'+BAND_PAY_ROWS[0].length+'" class="ctr grp-pay">지 급</th>';
  r += '<th class="num grp-pay b">지급계</th>';
  r += '<th colspan="'+BAND_DED_ROWS[0].length+'" class="ctr grp-ded">공 제</th>';
  r += '<th class="num grp-ded b">공제계</th>';
  r += '<th class="num b">실지급</th>';
  if (withUi){ r += '<th class="ctr">상태</th><th class="ctr">액션</th>'; }
  return html + '<thead><tr>'+r+'</tr></thead>';
}
function prBandBlock(r, withUi){
  var syncedMark = r.attendance_synced_at
    ? '<i class="fas fa-check-circle text-green-500 ml-1" title="근태 동기화: ' + escapeHtml(r.attendance_synced_at) + '"></i>' : '';
  var left = 0;
  var h = '<tr>';
  if (withUi){
    h += '<td rowspan="4" class="ctr stick" style="left:0px"><input type="checkbox" class="pr-row-check" onchange="payrollToggleRow(' + r.id + ', this.checked)"' + (prSelected[r.id] ? ' checked' : '') + '></td>';
    left = BAND_W.check;
  }
  h += '<td rowspan="4" class="lft stick" style="left:'+left+'px">'+escapeHtml(r.employee_code||'')+'</td>';
  h += '<td rowspan="4" class="lft stick" style="left:'+(left+BAND_ID_COLS[0].w)+'px">'+escapeHtml(r.employee_name||'')+syncedMark+'</td>';
  h += '<td rowspan="4" class="lft">'+escapeHtml(prDeptLabel(r.department))+'</td>';
  h += '<td rowspan="4" class="lft">'+escapeHtml(prPosLabel(r.position))+'</td>';
  BAND_PAY_ROWS[0].forEach(function(s){ h += prBandLvCell(s, r, 'grp-pay'); });
  h += '<td rowspan="4" class="sumcell grp-pay">'+prLC(prNum(r,'total_salary'))+'</td>';   // 지급계 — 지급 블록 바로 뒤
  BAND_DED_ROWS[0].forEach(function(s){ h += prBandLvCell(s, r, 'grp-ded'); });
  h += '<td rowspan="4" class="sumcell grp-ded">'+prLC(prNum(r,'total_deduction'))+'</td>';
  h += '<td rowspan="4" class="sumcell">'+prLC(prNum(r,'net_pay'))+'</td>';
  if (withUi){
    h += '<td rowspan="4" class="ctr">'+prStatusBadge(r.status)+'</td>';
    h += '<td rowspan="4" class="ctr">'+prActionsHtml(r)+'</td>';
  }
  h += '</tr>';
  h += '<tr>' + prBandItemCells(r, 1, 'grp-pay', 'grp-ded') + '</tr>';
  h += '<tr>' + prBandItemCells(r, 2, 'grp-pay', 'grp-ded') + '</tr>';
  // 4단째: 근태 메타(지급 3칸 병합) + 공제 4단째(고용보험)
  // 연장 분해 표기: 고정연장(포괄임금 내재) + 추가연장(근태 실측=연장+조기출근). extra 없으면 합산만.
  var otTotal = parseFloat(r.overtime_hours) || 0;
  var otExtra = parseFloat(r.extra_overtime_hours) || 0;
  var otFixed = Math.max(0, Math.round((otTotal - otExtra) * 10) / 10);
  var otText = otFixed > 0
    ? ('연장 고정' + otFixed.toFixed(1) + '+추가' + otExtra.toFixed(1) + 'h')
    : ('연장 ' + otTotal.toFixed(1) + 'h');
  var meta = '근무 ' + (parseFloat(r.work_days) || 0) + '일 · ' + otText
    + ' · 결근 ' + (parseFloat(r.absent_days) || 0) + ' · 지각 ' + (parseInt(r.late_count) || 0);
  h += '<tr class="band-b"><td colspan="'+BAND_PAY_ROWS[0].length+'" class="lft meta grp-pay">'+meta+'</td>';
  BAND_DED_ROWS[3].forEach(function(s){ h += prBandLvCell(s, r, 'grp-ded'); });
  h += '</tr>';
  return h;
}
function prBandTotals(list){
  var t = {_count:0, total_salary:0, total_deduction:0, net_pay:0};
  [BAND_PAY_ROWS, BAND_DED_ROWS].forEach(function(grid){
    grid.forEach(function(row){ row.forEach(function(s){ if (s) t[s.key] = 0; }); });
  });
  list.forEach(function(r){
    t._count++;
    t.total_salary += prNum(r,'total_salary'); t.total_deduction += prNum(r,'total_deduction'); t.net_pay += prNum(r,'net_pay');
    [BAND_PAY_ROWS, BAND_DED_ROWS].forEach(function(grid){
      grid.forEach(function(row){ row.forEach(function(s){ if (s) t[s.key] += prNum(r, s.key); }); });
    });
  });
  return t;
}
function prBandTotalBlock(label, t, cls, withUi){
  var idSpan = (withUi ? 1 : 0) + BAND_ID_COLS.length;
  var h = '<tr class="'+cls+'"><td rowspan="4" colspan="'+idSpan+'" class="lft b">'+escapeHtml(label)+' · '+t._count+'명</td>';
  BAND_PAY_ROWS[0].forEach(function(s){ h += prBandLvCell(s, t, ''); });
  h += '<td rowspan="4" class="sumcell">'+prLC(t.total_salary)+'</td>';   // 지급계 — 지급 블록 바로 뒤
  BAND_DED_ROWS[0].forEach(function(s){ h += prBandLvCell(s, t, ''); });
  h += '<td rowspan="4" class="sumcell">'+prLC(t.total_deduction)+'</td>';
  h += '<td rowspan="4" class="sumcell">'+prLC(t.net_pay)+'</td>';
  if (withUi) h += '<td rowspan="4" colspan="2"></td>';
  h += '</tr>';
  h += '<tr class="'+cls+'">' + prBandItemCells(t, 1, '', '') + '</tr>';
  h += '<tr class="'+cls+'">' + prBandItemCells(t, 2, '', '') + '</tr>';
  h += '<tr class="'+cls+' band-b"><td colspan="'+BAND_PAY_ROWS[0].length+'" class="meta"></td>';
  BAND_DED_ROWS[3].forEach(function(s){ h += prBandLvCell(s, t, ''); });
  h += '</tr>';
  return h;
}
function prBandHtml(rows, withUi){
  var byDept = {}, order = [];
  rows.forEach(function(r){ var d=r.department||''; if(!byDept[d]){byDept[d]=[];order.push(d);} byDept[d].push(r); });
  var multiDept = order.length > 1;
  var body = '<tbody>';
  order.forEach(function(dept){
    byDept[dept].forEach(function(r){ body += prBandBlock(r, withUi); });
    if (multiDept) body += prBandTotalBlock(prDeptLabel(dept)+' 소계', prBandTotals(byDept[dept]), 'subtotal', withUi);
  });
  body += prBandTotalBlock('전체 합계', prBandTotals(rows), 'grandtotal', withUi);
  body += '</tbody>';
  return prBandHeadHtml(withUi) + body;
}

function prLedgerBodyHtml(cols, rows){
  var byDept = {}, order = [];
  rows.forEach(function(r){ var d=r.department||''; if(!byDept[d]){byDept[d]=[];order.push(d);} byDept[d].push(r); });
  var multiDept = order.length > 1;
  var grand = prLedgerEmptyTotals(cols);
  var body = '<tbody>';
  order.forEach(function(dept){
    var sub = prLedgerEmptyTotals(cols);
    byDept[dept].forEach(function(r){ body += prLedgerDataRow(cols, r); prLedgerAccum(sub, cols, r); prLedgerAccum(grand, cols, r); });
    if (multiDept) body += prLedgerTotalRow(cols, prDeptLabel(dept)+' 소계', sub, 'subtotal');
  });
  body += prLedgerTotalRow(cols, '전체 합계', grand, 'grandtotal');
  return body + '</tbody>';
}

window.payrollRenderLedger = function(){
  var table = document.getElementById('prLedgerTable');
  if (!table) return;
  var rows = currentPayrollData || [];
  var periodEl = document.getElementById('prLedgerPeriod');
  if (periodEl) periodEl.textContent = rows.length ? ('· ' + (rows[0].pay_period || '') + ' · ' + rows.length + '명') : '';
  if (!rows.length){
    table.style.width = '100%';
    table.innerHTML = '<tbody><tr><td style="padding:32px;text-align:center;color:#9ca3af;border:none"><i class="fas fa-file-invoice-dollar" style="font-size:24px;display:block;margin-bottom:8px;color:#d1d5db"></i>해당 월 급여 내역이 없습니다<div style="margin-top:8px"><button onclick="payrollBatch()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded">+ 일괄 생성</button></div></td></tr></tbody>';
    return;
  }
  if (window.payrollLedgerTab === 'emp'){
    var cols = LEDGER_EMP_COLS;
    table.style.width = cols.reduce(function(s,c){ return s+c.w; }, 0) + 'px';
    table.innerHTML = prLedgerHead(cols) + prLedgerBodyHtml(cols, rows);
  } else {
    table.style.width = prBandWidth(true) + 'px';
    table.innerHTML = prBandHtml(rows, true);
  }
};

function prCsvCell(s){
  // #504 형제누락: 수식(=+-@) 인젝션 가드 포함 공용 SSOT(window.dsCsvCell, layout.ts 주입)에 위임.
  if (window.dsCsvCell) return window.dsCsvCell(s);
  s=String(s); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
window.payrollLedgerExportCsv = function(){
  var rows = currentPayrollData || [];
  if (!rows.length){ if (typeof showToast==='function') showToast('내보낼 급여 내역이 없습니다','warning'); return; }
  var cols = prLedgerCols();   // CSV=평면 전체 컬럼 (엑셀 가공 용이 — 화면 2단 구조와 별개)
  var lines = [cols.map(function(c){ return c.label; }).join(',')];
  var grand = prLedgerEmptyTotals(cols);
  rows.forEach(function(r){
    var v = cols.map(function(c){
      if (c.kind==='text') return prCsvCell(r[c.key]||'');
      if (c.kind==='dept') return prCsvCell(prDeptLabel(r.department));
      if (c.kind==='pos') return prCsvCell(prPosLabel(r.position));
      return Math.round(prColVal(c, r));
    });
    lines.push(v.join(','));
    prLedgerAccum(grand, cols, r);
  });
  var tv = cols.map(function(c){
    if (c.key==='employee_name') return '전체 합계';
    if (c.key==='position') return grand._count + '명';
    if (c.kind==='num'||c.kind==='calc') return Math.round(grand[c.key]||0);
    return '';
  });
  lines.push(tv.join(','));
  var csv = '﻿' + lines.join('\r\n');
  var period = (rows[0] && rows[0].pay_period) || '';
  var name = (window.payrollLedgerTab==='emp' ? '회사부담금' : '급여대장') + '_' + period;
  var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
};

window.payrollLedgerPrint = function(){
  var rows = currentPayrollData || [];
  if (!rows.length){ if (typeof showToast==='function') showToast('인쇄할 급여 내역이 없습니다','warning'); return; }
  var period = (rows[0] && rows[0].pay_period) || '';
  var title = (window.payrollLedgerTab==='emp' ? '회사부담금 명세' : '급여대장') + ' — ' + period;
  // 화면 전용 컬럼(체크/상태/액션) 제외하고 재생성 + colgroup 제거(인쇄는 페이지폭 auto)
  var inner;
  if (window.payrollLedgerTab === 'emp'){
    inner = prLedgerHead(LEDGER_EMP_COLS) + prLedgerBodyHtml(LEDGER_EMP_COLS, rows);
  } else {
    inner = prBandHtml(rows, false);
  }
  inner = inner.replace(/<colgroup[\s\S]*?<\/colgroup>/, '');
  var w = window.open('', '_blank');
  if (!w){ if (typeof showToast==='function') showToast('팝업이 차단되었습니다','error'); return; }
  var style = '<style>'
    + '@page { size: A4 landscape; margin: 7mm; }'
    + 'body { font-family: "Malgun Gothic", sans-serif; margin:0; }'
    + 'h2 { font-size: 13px; margin: 0 0 6px; }'
    + 'table { border-collapse: collapse; table-layout: auto; width: 100%; font-size: 8px; font-variant-numeric: tabular-nums; }'
    + 'th, td { border: 1px solid #999; padding: 2px 3px; white-space: nowrap; text-align: right; }'
    + 'th.lft, td.lft { text-align: left; }'
    + 'th.ctr, td.ctr { text-align: center; }'
    + 'th { background: #eee; }'
    + '.subtotal td, .grandtotal td { background: #eee; font-weight: bold; } .b { font-weight: bold; }'
    + '</style>';
  w.document.write('<html><head><title>'+title+'</title><meta charset="utf-8">'+style+'</head><body>');
  w.document.write('<h2>'+title+'</h2>');
  w.document.write('<table>'+inner+'</table>');
  w.document.write('</body></html>');
  w.document.close();
  setTimeout(function(){ w.focus(); w.print(); }, 350);
};

// IIFE — 파일 맨 아래 (호이스팅 방지)
(function prInit() {
  // 기본값: 이번 달
  var now = new Date();
  var ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  var p = document.getElementById('prPeriod');
  if (p && !p.value) p.value = ym;
  prLoadEmployeeOptions();
  // 급여대장이 기본 뷰 → 로드 시 이번 달 자동 조회(데이터 즉시 표시, 빈 화면 방지)
  if (typeof window.payrollLoad === 'function') window.payrollLoad();
})();
