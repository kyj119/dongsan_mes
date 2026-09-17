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
  // onclick 안의 JS 문자열 — HTML 속성 엔티티 디코딩이 JS 파싱보다 먼저라 escapeJsAttr 가 필요하다.
  var prEscName = escapeJsAttr(r.employee_name || '');
  var prEscPhone = escapeJsAttr(r.employee_mobile || '');
  var prEscPeriod = escapeJsAttr(r.pay_period || '');
  var actions = r.published_at
    ? '<span class="text-indigo-600 mx-0.5" title="직원 교부됨 (' + escapeHtml(String(r.published_at)) + ')"><i class="fas fa-share-square"></i></span>'
    : '';
  actions += '<button onclick="payrollSyncOne(' + r.id + ')" class="text-amber-600 hover:text-amber-800 mx-0.5" title="이 직원 근태 동기화"><i class="fas fa-sync-alt"></i></button>';
  // 0618: 공제 고정값이 걸린 행만 해제 버튼을 보여 준다(없으면 누를 일도 없다)
  if (r.deduction_overrides && r.status === 'PENDING') {
    actions += '<button onclick="payrollClearOverrides(' + r.id + ')" class="text-rose-600 hover:text-rose-800 mx-0.5" title="공제 고정값 해제 — 계산값으로 되돌립니다"><i class="fas fa-thumbtack"></i></button>';
  }
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
  // #509 일할근거 배지 초기화(직전 편집의 잔상 방지) — 이후 preview가 대상 직원 기준으로 재표시
  var prPb = document.getElementById('prProrationBadge');
  if (prPb) prPb.classList.add('hidden');

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

// #509 일할근거: 월중 입퇴사(isPartial) 직원의 기본급 일할 안내 배지.
//   preview 응답 prorationContext 기반. 배지 엘리먼트는 페이지 HTML에 없어 prBase 옆에 동적 주입(1회 생성 후 토글).
function prRenderProrationBadge(prc) {
  var baseInput = document.getElementById('prBase');
  if (!baseInput) { console.warn('[payroll] #prBase not found'); return; }
  var host = baseInput.parentNode;
  if (!host) { console.warn('[payroll] #prBase parent not found'); return; }
  var badge = document.getElementById('prProrationBadge');
  if (prc && prc.isPartial) {
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'prProrationBadge';
      badge.className = 'mt-1 px-1.5 py-0.5 text-[11px] rounded bg-amber-50 text-amber-700 border border-amber-200';
      host.appendChild(badge);
    }
    badge.textContent = '중도입퇴사 · 근무일 ' + prc.workedWeekdays + '/' + prc.monthWeekdays + '일 기준 일할 적용';
    badge.classList.remove('hidden');
  } else if (badge) {
    badge.classList.add('hidden');
  }
}

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
      // #509 일할근거 배지 갱신 (월중 입퇴사 직원만 표시)
      prRenderProrationBadge(d.prorationContext);
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

// ── 근태 수정 ─────────────────────────────────────────────────────────────
//   왜: 「근태 불러오기」가 attendance 에서 값을 끌어오는데, 틀린 값을 고치려면
//   직원을 하나씩 수정 모달로 열어야 했다. 한 화면에서 표로 고치고 한 번에 저장한다.
//   지급액은 이 값들로 다시 계산되고, 공제를 고정(📌)해 둔 직원은 그 항목이 유지된다.
var PR_ATTEND_FIELDS = [
  { key: 'work_days',       type: 'float', step: '0.5', min: '0' },
  { key: 'overtime_hours',  type: 'float', step: '0.5', min: '0' },
  // 0622: 야간·휴일은 금액만 저장돼 화면에서 편집할 방법이 없었다(시간 컬럼 신설로 왕복 가능)
  { key: 'night_hours',     type: 'float', step: '0.5', min: '0' },
  { key: 'holiday_hours',   type: 'float', step: '0.5', min: '0' },
  { key: 'absent_days',     type: 'float', step: '0.5', min: '0' },
  { key: 'late_count',      type: 'int',   step: '1',   min: '0' },
  { key: 'leave_used_days', type: 'float', step: '0.5', min: '0' },
];

window.payrollOpenAttendModal = function() {
  if (!currentPayrollData || !currentPayrollData.length) {
    showToast('먼저 급여 목록을 조회하세요', 'warning'); return;
  }
  var m = document.getElementById('prAttendModal');
  if (!m) { console.warn('[payroll] #prAttendModal not found'); return; }
  m.classList.remove('hidden'); m.classList.add('flex');
  var per = document.getElementById('prAttendPeriod');
  if (per) per.textContent = (currentPayrollData[0].pay_period || '') + ' · ' + currentPayrollData.length + '명';
  payrollAttendRender();
};
window.payrollCloseAttend = function() {
  var m = document.getElementById('prAttendModal');
  if (!m) return;
  m.classList.add('hidden'); m.classList.remove('flex');
};

function payrollAttendRender() {
  var body = document.getElementById('prAttendBody');
  if (!body) { console.warn('[payroll] #prAttendBody not found'); return; }
  var html = '';
  for (var i = 0; i < currentPayrollData.length; i++) {
    var r = currentPayrollData[i];
    var locked = r.status !== 'PENDING';
    var pinned = !!r.deduction_overrides;
    html += '<tr data-pid="' + r.id + '"' + (locked ? ' class="bg-gray-50 text-gray-400"' : '') + '>'
      + '<td>' + prEsc(r.employee_code || '') + '</td>'
      + '<td class="whitespace-nowrap">' + prEsc(r.employee_name || '')
        + (pinned ? ' <i class="fas fa-thumbtack text-rose-500" title="공제 고정 있음 — 유지됩니다" style="font-size:9px"></i>' : '')
        + (locked ? ' <span class="text-[10px]">(잠금)</span>' : '') + '</td>'
      + '<td class="whitespace-nowrap">' + prEsc(r.department || '') + '</td>';
    for (var f = 0; f < PR_ATTEND_FIELDS.length; f++) {
      var def = PR_ATTEND_FIELDS[f];
      var v = def.type === 'int' ? (parseInt(r[def.key]) || 0) : (parseFloat(r[def.key]) || 0);
      html += '<td class="text-right"><input type="number" step="' + def.step + '" min="' + def.min + '"'
        + ' data-af="' + def.key + '" data-orig="' + v + '" value="' + v + '"' + (locked ? ' disabled' : '')
        + ' class="w-full border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums"'
        + ' oninput="payrollAttendTouch(this)"></td>';
    }
    html += '<td class="text-right tabular-nums text-gray-500">' + (Number(r.total_salary) || 0).toLocaleString() + '</td>'
      + '</tr>';
  }
  body.innerHTML = html;
  payrollAttendTouch(null);
}

/** 변경된 셀을 표시하고 저장 버튼 활성화 */
/**
 * 근태에서 불러오기 (dry-run) — 집계 결과를 표에 채운다. **저장하지 않는다.**
 *   바뀐 셀은 강조되므로 무엇이 달라지는지 보고 고친 뒤 [변경분 저장]으로 확정한다.
 */
/** 표를 저장된 급여값으로 되돌린다(불러온 값 폐기) */
window.payrollAttendReset = function() {
  payrollAttendRender();
  var msg = document.getElementById('prAttendMsg');
  if (msg) msg.textContent = '저장된 값으로 되돌렸습니다.';
};

window.payrollAttendLoad = async function() {
  var period = document.getElementById('prPeriod').value;
  var btn = document.getElementById('prAttendLoadBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 불러오는 중...'; }
  try {
    var res = await axios.post('/api/payroll/sync-attendance', { pay_period: period, dry_run: true });
    var list = (res.data.data && res.data.data.details) || [];
    var byEmp = {};
    for (var i = 0; i < list.length; i++) byEmp[list[i].employee_id] = list[i];
    var filled = 0, skipped = 0;
    var trs = document.querySelectorAll('#prAttendBody tr');
    for (var t = 0; t < trs.length; t++) {
      var pid = Number(trs[t].getAttribute('data-pid'));
      var row = (currentPayrollData || []).find(function(x) { return x.id === pid; });
      if (!row) continue;
      var a = byEmp[row.employee_id];
      if (!a) { skipped++; continue; }
      var ins = trs[t].querySelectorAll('input[data-af]');
      for (var k = 0; k < ins.length; k++) {
        var key = ins[k].getAttribute('data-af');
        if (a[key] == null) continue;
        ins[k].value = a[key];
        payrollAttendTouch(ins[k]);
      }
      filled++;
    }
    var msg = document.getElementById('prAttendMsg');
    if (msg) msg.textContent = '근태 집계 ' + filled + '명 불러옴'
      + (skipped ? ' · 근태기록 없음 ' + skipped + '명(기존값 유지)' : '')
      + ' — 확인·수정 후 [변경분 저장]을 누르세요. 저장 전에는 급여가 바뀌지 않습니다.';
    payrollAttendTouch(null);
  } catch (e) {
    showToast('근태 불러오기 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download mr-1"></i>근태에서 불러오기'; }
  }
};

window.payrollAttendTouch = function(el) {
  if (el) {
    var changed = String(el.value) !== String(el.getAttribute('data-orig'));
    el.classList.toggle('border-amber-400', changed);
    el.classList.toggle('bg-amber-50', changed);
    el.classList.toggle('font-semibold', changed);
  }
  var n = payrollAttendCollect().length;
  var btn = document.getElementById('prAttendApplyBtn');
  if (btn) btn.disabled = n === 0;
  var msg = document.getElementById('prAttendMsg');
  if (msg) msg.textContent = n ? (n + '명 변경됨 — 저장하면 지급액·공제가 다시 계산됩니다') : '';
};

/** 바뀐 행만 추려 낸다 */
function payrollAttendCollect() {
  var out = [];
  var trs = document.querySelectorAll('#prAttendBody tr');
  for (var i = 0; i < trs.length; i++) {
    var tr = trs[i];
    var pid = Number(tr.getAttribute('data-pid'));
    var row = (currentPayrollData || []).find(function(x) { return x.id === pid; });
    if (!row || row.status !== 'PENDING') continue;
    var vals = {}, changed = false;
    var ins = tr.querySelectorAll('input[data-af]');
    for (var k = 0; k < ins.length; k++) {
      var key = ins[k].getAttribute('data-af');
      var num = parseFloat(ins[k].value);
      if (!isFinite(num) || num < 0) num = 0;
      vals[key] = key === 'late_count' ? Math.round(num) : num;
      if (String(vals[key]) !== String(ins[k].getAttribute('data-orig'))) changed = true;
    }
    if (changed) out.push({ row: row, vals: vals });
  }
  return out;
}

window.payrollAttendApply = async function() {
  var list = payrollAttendCollect();
  if (!list.length) return;
  var btn = document.getElementById('prAttendApplyBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 저장 중...'; }
  var done = 0, failed = 0;
  for (var i = 0; i < list.length; i++) {
    var r = list[i].row, v = list[i].vals;
    try {
      // 지급 항목은 그대로 두고 근태 수치만 바꿔 재계산시킨다.
      //   base_salary 는 넘기지 않는다 — 포괄임금 직원은 서버가 emp.base_salary 원본으로 다시 분해하므로
      //   저장된 분해값을 되돌려주면 이중분해된다(core.ts save 주석 참조).
      await axios.post('/api/payroll/save', {
        employee_id: r.employee_id,
        pay_period: r.pay_period,
        pay_date: r.pay_date || '',
        overtime_hours: v.overtime_hours,
        night_hours: v.night_hours,       // 금액(night_pay)은 시간에서 파생되므로 보내지 않는다
        holiday_hours: v.holiday_hours,
        annual_leave_pay: Number(r.annual_leave_pay) || 0,
        bonus: Number(r.bonus) || 0,
        other_allowance: Number(r.other_allowance) || 0,
        meal: Number(r.meal_allowance) || 0,
        transport: Number(r.transportation_allowance) || 0,
        childcare: Number(r.nontax_childcare) || 0,
        work_days: v.work_days,
        absent_days: v.absent_days,
        late_count: v.late_count,
        leave_used_days: v.leave_used_days,
        other_deduction: Number(r.other_deduction) || 0,
        notes: r.notes || '',
      });
      done++;
    } catch (e) {
      failed++;
      console.error('[payroll] 근태 수정 저장 실패', r.employee_name, e);
    }
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check mr-1"></i>변경분 저장'; }
  payrollCloseAttend();
  showToast('근태 수정: ' + done + '명 저장' + (failed ? ' · 실패 ' + failed + '명' : ''), failed ? 'warning' : 'success');
  payrollLoad();
};

// ── 엑셀 입력 (0618 · T2) ─────────────────────────────────────────────────
//   왜: 공제액은 계산 결과만 저장되고 수동 입력 경로가 없었다(other_deduction 만 예외).
//   공단 고지·이카운트 대장과 값이 다를 때 맞출 방법이 아예 없었다.
//   기존 "선택 일괄수정"은 전원에게 **같은 값**만 넣을 수 있어 직원별로 다른 값을 못 넣는다.
//
//   입력 경로 2개 — ①엑셀에서 셀 복사 → 붙여넣기(클립보드 TSV, 기본) ②파일(.csv/.tsv)
//   붙여넣기 → 파싱 → 현재값과 대조(미리보기) → 확인 후 행마다 /api/payroll/save 호출.
//   미리보기는 이미 화면에 있는 currentPayrollData 로 하므로 서버 왕복이 없다.

// 머리글 → 내부 키. 공백·괄호·단위는 떼고 비교한다(엑셀 머리글이 제각각이라).
var PR_PASTE_COLS = [
  { key: 'employee_code', names: ['사번', '사원번호', '직원코드', 'employeecode', 'code'] },
  { key: 'name',          names: ['성명', '이름', '직원명', 'name'] },
  // 지급
  { key: 'base_salary',   names: ['기본급', '급여'], pay: true },
  { key: 'overtime_pay',  names: ['연장수당', '연장근로수당', '추가근무수당', '연장'], pay: true },
  { key: 'night_pay',     names: ['야간수당', '야간근로수당', '야간'], pay: true },
  { key: 'holiday_pay',   names: ['휴일수당', '휴일근로수당', '휴일'], pay: true },
  { key: 'bonus',         names: ['상여금', '상여', '특별상여'], pay: true },
  { key: 'meal',          names: ['식대'], pay: true },
  { key: 'transport',     names: ['자가운전', '차량유지비', '교통비'], pay: true },
  { key: 'other_allowance', names: ['기타수당', '직책수당'], pay: true },
  { key: 'annual_leave_pay', names: ['연차수당'], pay: true },
  { key: 'other_deduction',  names: ['기타공제'], pay: true },
  // 공제(오버라이드)
  { key: 'np',  names: ['국민연금'], ded: true },
  { key: 'hi',  names: ['건강보험'], ded: true },
  { key: 'ltc', names: ['장기요양', '장기요양보험'], ded: true },
  { key: 'ei',  names: ['고용보험'], ded: true },
  { key: 'it',  names: ['소득세'], ded: true },
  { key: 'lt',  names: ['지방소득세', '지방세'], ded: true },
];
var PR_PASTE_LABEL = {
  base_salary: '기본급', overtime_pay: '연장수당', night_pay: '야간수당', holiday_pay: '휴일수당',
  bonus: '상여금', meal: '식대', transport: '자가운전', other_allowance: '기타수당',
  annual_leave_pay: '연차수당', other_deduction: '기타공제',
  np: '국민연금', hi: '건강보험', ltc: '장기요양', ei: '고용보험', it: '소득세', lt: '지방소득세',
};
// payroll 행에서 현재값을 읽는 필드명 (지급 항목은 저장 컬럼명이 입력 키와 다른 것이 있다)
var PR_PASTE_CURRENT_FIELD = {
  meal: 'meal_allowance', transport: 'transportation_allowance',
  np: 'national_pension', hi: 'health_insurance', ltc: 'long_term_care_insurance',
  ei: 'employment_insurance', it: 'income_tax', lt: 'local_tax',
};
var prPasteRows = [];   // [{row, emp, changes:{key:{from,to}}, ded:{...}}]

function prPasteNorm(s) {
  return String(s == null ? '' : s).replace(/[\s()（）[\]]/g, '').replace(/[·.]/g, '').toLowerCase();
}
function prPasteNum(s) {
  var t = String(s == null ? '' : s).replace(/[^\d.-]/g, '');
  if (t === '' || t === '-') return null;
  var n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

window.payrollOpenPasteModal = function() {
  if (!currentPayrollData || !currentPayrollData.length) {
    showToast('먼저 급여 목록을 조회하세요', 'warning'); return;
  }
  document.getElementById('prPasteModal').classList.remove('hidden');
  document.getElementById('prPasteModal').classList.add('flex');
  payrollPasteClear();
  var ub = document.getElementById('prPasteUndoBtn');
  if (ub) {
    ub.classList.toggle('hidden', !PR_UNDO);
    if (PR_UNDO) ub.title = PR_UNDO.period + ' · ' + PR_UNDO.rows.length + '명 (' + PR_UNDO.at.toLocaleTimeString() + ' 적용)';
  }
};
window.payrollClosePaste = function() {
  var m = document.getElementById('prPasteModal');
  if (!m) return;
  m.classList.add('hidden'); m.classList.remove('flex');
};
window.payrollPasteClear = function() {
  var ta = document.getElementById('prPasteArea');
  if (ta) ta.value = '';
  prPasteRows = [];
  payrollPasteRenderPreview();
};
window.payrollPasteFile = function(input) {
  var f = input && input.files && input.files[0];
  if (!f) return;
  var rd = new FileReader();
  rd.onload = function() {
    document.getElementById('prPasteArea').value = String(rd.result || '');
    payrollPasteParse();
  };
  rd.readAsText(f, 'utf-8');
  input.value = '';
};
window.payrollPasteCopyTemplate = function() {
  var head = ['사번', '성명', '기본급', '연장수당', '상여금', '식대', '국민연금', '건강보험', '장기요양', '고용보험', '소득세', '지방소득세'];
  var lines = [head.join('\t')];
  for (var i = 0; i < (currentPayrollData || []).length; i++) {
    var r = currentPayrollData[i];
    lines.push([r.employee_code || '', r.employee_name || '', '', '', '', '', '', '', '', '', '', ''].join('\t'));
  }
  var text = lines.join('\r\n');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() { showToast('양식을 클립보드에 복사했습니다 — 엑셀에 붙여넣어 채운 뒤 다시 복사해 오세요', 'success'); },
      function() { document.getElementById('prPasteArea').value = text; });
  } else {
    document.getElementById('prPasteArea').value = text;
  }
};

window.payrollPasteParse = function() {
  var raw = (document.getElementById('prPasteArea') || {}).value || '';
  prPasteRows = [];
  var errors = [];
  var lines = raw.replace(/\r\n/g, '\n').split('\n').filter(function(l) { return l.trim() !== ''; });
  if (!lines.length) { payrollPasteRenderPreview(errors); return; }

  var split = function(l) { return l.indexOf('\t') >= 0 ? l.split('\t') : l.split(','); };
  var head = split(lines[0]).map(prPasteNorm);
  // 머리글 → 열 인덱스
  var colOf = {};
  for (var c = 0; c < head.length; c++) {
    for (var d = 0; d < PR_PASTE_COLS.length; d++) {
      var def = PR_PASTE_COLS[d];
      for (var n = 0; n < def.names.length; n++) {
        if (head[c] === prPasteNorm(def.names[n])) { if (colOf[def.key] == null) colOf[def.key] = c; }
      }
    }
  }
  if (colOf.employee_code == null && colOf.name == null) {
    errors.push('첫 행에서 "사번" 또는 "성명" 열을 찾지 못했습니다. 엑셀의 머리글 행까지 포함해 복사했는지 확인하세요.');
    payrollPasteRenderPreview(errors); return;
  }

  for (var i = 1; i < lines.length; i++) {
    var cells = split(lines[i]);
    var code = colOf.employee_code != null ? String(cells[colOf.employee_code] || '').trim() : '';
    var nm = colOf.name != null ? String(cells[colOf.name] || '').trim() : '';
    if (!code && !nm) continue;
    var emp = null;
    for (var k = 0; k < currentPayrollData.length; k++) {
      var r = currentPayrollData[k];
      if (code && String(r.employee_code || '').trim() === code) { emp = r; break; }
    }
    if (!emp && nm) {
      // 0622: MES 성명 → 없으면 external_name(이카운트 이름)으로 매칭.
      //   두 시스템 표기가 다르면 그 직원만 조용히 빠진다(꾸웅 ↔ NGUYEN THUY CUONG 실측).
      var hits = currentPayrollData.filter(function(r) { return String(r.employee_name || '').trim() === nm; });
      if (!hits.length) hits = currentPayrollData.filter(function(r) { return String(r.external_name || '').trim() === nm; });
      if (hits.length === 1) emp = hits[0];
      else if (hits.length > 1) { errors.push((i + 1) + '행: 성명 "' + nm + '" 이 여러 명입니다 — 사번 열을 넣어 주세요.'); continue; }
    }
    if (!emp) { errors.push((i + 1) + '행: ' + (code || nm) + ' — 이 달 급여 목록에 없습니다.'); continue; }
    if (emp.status !== 'PENDING') { errors.push((i + 1) + '행: ' + (emp.employee_name || '') + ' — 작성중(PENDING)이 아니라 건너뜁니다.'); continue; }

    var changes = {};
    for (var key in colOf) {
      if (key === 'employee_code' || key === 'name') continue;
      var v = prPasteNum(cells[colOf[key]]);
      if (v == null) continue;                       // 빈칸 = 변경 없음
      var field = PR_PASTE_CURRENT_FIELD[key] || key;
      var cur = Number(emp[field] || 0);
      if (cur === v) continue;                       // 같으면 변경 아님
      changes[key] = { from: cur, to: v };
    }
    if (Object.keys(changes).length) prPasteRows.push({ emp: emp, changes: changes });
  }
  payrollPasteRenderPreview(errors);
};

function payrollPasteRenderPreview(errors) {
  var wrap = document.getElementById('prPastePreviewWrap');
  var head = document.getElementById('prPastePreviewHead');
  var body = document.getElementById('prPastePreviewBody');
  var errBox = document.getElementById('prPasteErrors');
  var btn = document.getElementById('prPasteApplyBtn');
  var sum = document.getElementById('prPasteSummary');
  if (!wrap || !head || !body) { console.warn('[payroll] paste preview 요소 없음'); return; }

  errors = errors || [];
  if (errors.length) { errBox.classList.remove('hidden'); errBox.innerHTML = errors.map(prEsc).join('<br>'); }
  else { errBox.classList.add('hidden'); errBox.innerHTML = ''; }

  if (!prPasteRows.length) {
    wrap.classList.add('hidden'); body.innerHTML = '';
    if (btn) btn.disabled = true;
    if (sum) sum.textContent = '';
    return;
  }
  // 등장한 항목만 열로 세운다
  var keys = [];
  prPasteRows.forEach(function(r) { for (var k in r.changes) if (keys.indexOf(k) < 0) keys.push(k); });
  keys.sort(function(a, b) {
    var order = Object.keys(PR_PASTE_LABEL);
    return order.indexOf(a) - order.indexOf(b);
  });
  head.innerHTML = '<th class="text-left">사번</th><th class="text-left">성명</th>'
    + keys.map(function(k) {
        var isDed = ['np','hi','ltc','ei','it','lt'].indexOf(k) >= 0;
        return '<th class="text-right' + (isDed ? ' text-rose-700' : '') + '">' + prEsc(PR_PASTE_LABEL[k] || k) + (isDed ? ' <i class="fas fa-thumbtack" title="고정(오버라이드)"></i>' : '') + '</th>';
      }).join('');
  body.innerHTML = prPasteRows.map(function(r) {
    return '<tr>'
      + '<td>' + prEsc(r.emp.employee_code || '') + '</td>'
      + '<td>' + prEsc(r.emp.employee_name || '') + '</td>'
      + keys.map(function(k) {
          var ch = r.changes[k];
          if (!ch) return '<td class="text-right text-gray-300">·</td>';
          return '<td class="text-right whitespace-nowrap"><span class="text-gray-400 line-through">' + ch.from.toLocaleString() + '</span> '
            + '<span class="font-semibold">' + ch.to.toLocaleString() + '</span></td>';
        }).join('')
      + '</tr>';
  }).join('');
  wrap.classList.remove('hidden');
  if (btn) btn.disabled = false;
  if (sum) sum.textContent = prPasteRows.length + '명 변경 예정';
}

function prEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}

window.payrollPasteApply = async function() {
  if (!prPasteRows.length) return;
  var btn = document.getElementById('prPasteApplyBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 적용 중...'; }
  var DED = ['np','hi','ltc','ei','it','lt'];
  var done = 0, failed = 0;
  // 0622: 적용 **전** 상태를 통째로 담아 둔다 — 잘못 붙여넣었을 때 되돌릴 유일한 근거.
  //   세션 메모리라 새로고침하면 사라진다(실수 직후 복구가 목적, 영구 이력이 아니다).
  PR_UNDO = { at: new Date(), period: prPasteRows[0].emp.pay_period, rows: prPasteRows.map(function(r) {
    return JSON.parse(JSON.stringify(r.emp));
  }) };
  for (var i = 0; i < prPasteRows.length; i++) {
    var r = prPasteRows[i], emp = r.emp, ch = r.changes;
    var pick = function(key, cur) { return ch[key] != null ? ch[key].to : cur; };
    // 공제 오버라이드: 기존 것 + 이번에 들어온 것 (빈칸은 기존 유지)
    var ov = {};
    try { ov = emp.deduction_overrides ? JSON.parse(emp.deduction_overrides) : {}; } catch (e) { ov = {}; }
    var touched = false;
    for (var d = 0; d < DED.length; d++) {
      if (ch[DED[d]] != null) { ov[DED[d]] = ch[DED[d]].to; touched = true; }
    }
    var body = {
      employee_id: emp.employee_id,
      pay_period: emp.pay_period,
      pay_date: emp.pay_date || '',
      base_salary: pick('base_salary', Number(emp.base_salary) || 0),
      overtime_hours: parseFloat(emp.overtime_hours) || 0,
      overtime_pay: pick('overtime_pay', Number(emp.overtime_pay) || 0),
      night_pay: pick('night_pay', Number(emp.night_pay) || 0),
      holiday_pay: pick('holiday_pay', Number(emp.holiday_pay) || 0),
      annual_leave_pay: pick('annual_leave_pay', Number(emp.annual_leave_pay) || 0),
      bonus: pick('bonus', Number(emp.bonus) || 0),
      other_allowance: pick('other_allowance', Number(emp.other_allowance) || 0),
      meal: pick('meal', Number(emp.meal_allowance) || 0),
      transport: pick('transport', Number(emp.transportation_allowance) || 0),
      childcare: Number(emp.nontax_childcare) || 0,
      work_days: parseFloat(emp.work_days) || 0,
      absent_days: parseFloat(emp.absent_days) || 0,
      late_count: parseInt(emp.late_count) || 0,
      leave_used_days: parseFloat(emp.leave_used_days) || 0,
      other_deduction: pick('other_deduction', Number(emp.other_deduction) || 0),
      notes: emp.notes || '',
    };
    if (touched) body.deduction_overrides = ov;   // 키가 없으면 서버가 기존 값을 유지한다
    try { await axios.post('/api/payroll/save', body); done++; }
    catch (e) { failed++; console.error('[payroll] paste save 실패', emp.employee_name, e); }
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check mr-1"></i>적용'; }
  payrollClosePaste();
  showToast('엑셀 입력: ' + done + '명 적용' + (failed ? ' · 실패 ' + failed + '명' : '')
    + (done ? ' — 되돌리려면 [엑셀 입력] 안의 「직전 적용 취소」' : ''), failed ? 'warning' : 'success');
  payrollLoad();
};

// ── 직전 적용 취소 (0622) ────────────────────────────────────────────────
var PR_UNDO = null;

window.payrollPasteUndo = async function() {
  if (!PR_UNDO || !PR_UNDO.rows.length) { showToast('되돌릴 적용 내역이 없습니다', 'warning'); return; }
  var when = PR_UNDO.at.toLocaleTimeString();
  if (!(await showConfirm(PR_UNDO.period + ' · ' + PR_UNDO.rows.length + '명을 ' + when + ' 적용 **이전** 값으로 되돌립니다. 계속할까요?'))) return;
  var btn = document.getElementById('prPasteUndoBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 되돌리는 중...'; }
  var done = 0, failed = 0;
  for (var i = 0; i < PR_UNDO.rows.length; i++) {
    var r = PR_UNDO.rows[i];
    var ov = null;
    try { ov = r.deduction_overrides ? JSON.parse(r.deduction_overrides) : null; } catch (e) { ov = null; }
    try {
      await axios.post('/api/payroll/save', {
        employee_id: r.employee_id, pay_period: r.pay_period, pay_date: r.pay_date || '',
        base_salary: Number(r.base_salary) || 0,
        overtime_hours: parseFloat(r.overtime_hours) || 0,
        overtime_pay: Number(r.overtime_pay) || 0,
        night_pay: Number(r.night_pay) || 0, holiday_pay: Number(r.holiday_pay) || 0,
        annual_leave_pay: Number(r.annual_leave_pay) || 0, bonus: Number(r.bonus) || 0,
        other_allowance: Number(r.other_allowance) || 0,
        meal: Number(r.meal_allowance) || 0, transport: Number(r.transportation_allowance) || 0,
        childcare: Number(r.nontax_childcare) || 0,
        work_days: parseFloat(r.work_days) || 0, absent_days: parseFloat(r.absent_days) || 0,
        late_count: parseInt(r.late_count) || 0, leave_used_days: parseFloat(r.leave_used_days) || 0,
        other_deduction: Number(r.other_deduction) || 0, notes: r.notes || '',
        deduction_overrides: ov,   // 적용 전 고정값 그대로 복원(없었으면 null = 해제)
      });
      done++;
    } catch (e) { failed++; console.error('[payroll] undo 실패', r.employee_name, e); }
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-rotate-left mr-1"></i>직전 적용 취소'; }
  PR_UNDO = null;
  payrollClosePaste();
  showToast('되돌리기: ' + done + '명' + (failed ? ' · 실패 ' + failed + '명' : ''), failed ? 'warning' : 'success');
  payrollLoad();
};

/** 공제 고정값 해제 → 계산값으로 되돌린다 (0618) */
window.payrollClearOverrides = async function(id) {
  var row = (currentPayrollData || []).find(function(x) { return x.id === id; });
  if (!row) { showToast('급여 행을 찾을 수 없습니다', 'error'); return; }
  var names = [];
  try {
    var ov = JSON.parse(row.deduction_overrides || '{}');
    for (var k in ov) names.push(PR_PASTE_LABEL[k] || k);
  } catch (e) { /* ignore: 깨진 JSON은 어차피 해제 대상 */ }
  if (!(await showConfirm((row.employee_name || '') + ' — 고정된 공제(' + (names.join('·') || '전체') + ')를 해제하고 계산값으로 되돌립니다. 계속할까요?'))) return;
  try {
    await axios.post('/api/payroll/save', {
      employee_id: row.employee_id,
      pay_period: row.pay_period,
      pay_date: row.pay_date || '',
      base_salary: Number(row.base_salary) || 0,
      overtime_hours: parseFloat(row.overtime_hours) || 0,
      overtime_pay: Number(row.overtime_pay) || 0,
      night_pay: Number(row.night_pay) || 0,
      holiday_pay: Number(row.holiday_pay) || 0,
      annual_leave_pay: Number(row.annual_leave_pay) || 0,
      bonus: Number(row.bonus) || 0,
      other_allowance: Number(row.other_allowance) || 0,
      meal: Number(row.meal_allowance) || 0,
      transport: Number(row.transportation_allowance) || 0,
      childcare: Number(row.nontax_childcare) || 0,
      work_days: parseFloat(row.work_days) || 0,
      absent_days: parseFloat(row.absent_days) || 0,
      late_count: parseInt(row.late_count) || 0,
      leave_used_days: parseFloat(row.leave_used_days) || 0,
      other_deduction: Number(row.other_deduction) || 0,
      notes: row.notes || '',
      deduction_overrides: null,   // 명시적 null = 해제 (키를 안 보내면 유지된다)
    });
    showToast('공제 고정값을 해제했습니다', 'success');
    payrollLoad();
  } catch (e) {
    showToast('해제 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
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

// 직원 교부(공개) 드롭다운 토글
window.payrollTogglePublishMenu = function() {
  var menu = document.getElementById('prPublishMenu');
  if (!menu) return;
  menu.classList.toggle('hidden');
  if (!menu.classList.contains('hidden')) {
    setTimeout(function() {
      var close = function(ev) {
        var btn = document.getElementById('prPublishBtn');
        if (menu.contains(ev.target) || (btn && btn.contains(ev.target))) return;
        menu.classList.add('hidden');
        document.removeEventListener('click', close);
      };
      document.addEventListener('click', close);
    }, 0);
  }
};

// 이 달 급여명세서 직원 교부(공개) → 셀프서비스 노출
window.payrollPublishPeriod = async function() {
  var menu = document.getElementById('prPublishMenu'); if (menu) menu.classList.add('hidden');
  var period = document.getElementById('prPeriod').value;
  if (!period) { showToast('급여 월을 먼저 선택하세요', 'warning'); return; }
  if (!(await showConfirm(period + ' 급여명세서를 직원에게 교부(공개)합니다. 직원 셀프서비스(사원번호+생년월일)에서 열람 가능해집니다. 계속할까요?'))) return;
  try {
    var res = await axios.post('/api/payroll/publish', { pay_period: period });
    var n = (res.data && res.data.data && res.data.data.published) || 0;
    showToast('교부 완료: ' + n + '명 공개', 'success');
    window.payrollLoad();
  } catch (e) {
    showToast('교부 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
};

// 이 달 급여명세서 교부 취소(비공개) — 증빙 로그는 보존
window.payrollUnpublishPeriod = async function() {
  var menu = document.getElementById('prPublishMenu'); if (menu) menu.classList.add('hidden');
  var period = document.getElementById('prPeriod').value;
  if (!period) { showToast('급여 월을 먼저 선택하세요', 'warning'); return; }
  if (!(await showConfirm(period + ' 급여명세서 교부를 취소합니다(직원 열람 차단). 교부/열람 증빙 기록은 보존됩니다. 계속할까요?'))) return;
  try {
    await axios.post('/api/payroll/unpublish', { pay_period: period });
    showToast('교부 취소 완료', 'success');
    window.payrollLoad();
  } catch (e) {
    showToast('교부 취소 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
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

/**
 * 0622: 「근태 불러오기」는 이제 **바로 반영하지 않는다**.
 *   근태를 집계해 표에 채워 주고, 사람이 보고 고친 뒤 확정한다.
 *   왜: 2026-09-17 대조에서 CAPS 집계가 결근을 과다(킨뚜자소 22일)로, 휴일근로를
 *   전부 0으로 잡고 있었다. 바로 덮어쓰면 틀린 값이 급여가 되고 되돌릴 근거도 안 남는다.
 */
window.payrollSyncAttendance = async function() {
  var period = document.getElementById('prPeriod').value;
  if (!period) { showToast('급여 월을 먼저 선택하세요', 'warning'); return; }
  if (!currentPayrollData || !currentPayrollData.length) { showToast('먼저 급여 목록을 조회하세요', 'warning'); return; }
  window.payrollOpenAttendModal();
  await window.payrollAttendLoad();
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

// 4대보험 요율 모달 제거 (2026-07-18 사이드바 통합): /payroll '요율 관리' 탭(payrollRates)이 대체.
// payrollOpenRatesModal/payrollCloseRatesModal/payrollLoadRates + #prRatesModal DOM 삭제됨.

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
// 0618: 공제 오버라이드(사람이 고정한 값)는 계산값이 아니므로 화면에서 구분되어야 한다.
//   구분이 없으면 "왜 재계산해도 안 바뀌지?"를 영원히 못 찾는다.
var PR_OV_FIELD_KEY = {
  national_pension: 'np', health_insurance: 'hi', long_term_care_insurance: 'ltc',
  employment_insurance: 'ei', income_tax: 'it', local_tax: 'lt',
};
function prOverrides(src) {
  if (!src || !src.deduction_overrides) return {};
  try { return JSON.parse(src.deduction_overrides) || {}; } catch (e) { return {}; }
}
function prBandLvCell(item, src, tint){
  if (!item) return '<td class="lv '+tint+' z"></td>';
  var v = Math.round(prNum(src, item.key)) || 0;
  var ovKey = PR_OV_FIELD_KEY[item.key];
  var pinned = ovKey && prOverrides(src)[ovKey] != null;
  return '<td class="lv '+tint+(v===0?' z':'')+(pinned?' pr-ov':'')+'"'
    + (pinned ? ' title="수동 고정값 — 근태 불러오기를 해도 바뀌지 않습니다"' : '')
    + '><span class="lv-l">'+item.label+(pinned?' <i class="fas fa-thumbtack" style="font-size:9px;opacity:.75"></i>':'')+'</span><span class="lv-v">'+prLC(v)+'</span></td>';
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
  window.dsDownloadCsv(name + '.csv', csv);
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

// ============================================================================
// 이카운트 대조 (0623) — 붙여넣기 → 사람별 차이 + 원인 판정. 읽기 전용.
//   차이의 원인이 셋(적용비율·부양가족·지급액)인데 화면이 구분해 주지 않아 매달 사람이
//   스크립트로 풀어야 했다. 4대보험처럼 규칙 경고를 달 수 없는 이유는 「100%인지 120%인지」가
//   MES 데이터만으로는 판정 불가라서다 — 그래서 경고가 아니라 대조를 화면에 올린다.
// ============================================================================
var PR_REC_COLS = [
  { key: 'employee_code', names: ['사번', '사원번호', '직원코드', 'code'] },
  { key: 'name',  names: ['성명', '이름', '직원명', 'name'] },
  { key: 'total', names: ['지급총액', '지급액계', '총지급액', '지급계', '급여총액'] },
  { key: 'np',    names: ['국민연금'] },
  { key: 'hi',    names: ['건강보험'] },
  { key: 'ltc',   names: ['장기요양', '장기요양보험'] },
  { key: 'ei',    names: ['고용보험'] },
  { key: 'it',    names: ['소득세'] },
  { key: 'lt',    names: ['지방소득세', '지방세'] },
];
var prRecRows = [];      // 파싱된 EC 행
var prRecResult = null;  // 서버 응답

window.payrollOpenReconcileModal = function() {
  var periodEl = document.getElementById('prPeriod');
  var period = periodEl ? periodEl.value : '';
  if (!period) { showToast('먼저 급여 기간을 선택하세요', 'warning'); return; }
  var m = document.getElementById('prReconcileModal');
  if (!m) { console.warn('[payroll] #prReconcileModal not found'); return; }
  var lbl = document.getElementById('prRecPeriod');
  if (lbl) lbl.textContent = period;
  m.classList.remove('hidden'); m.classList.add('flex');
  payrollReconcileClear();
};

window.payrollCloseReconcile = function() {
  var m = document.getElementById('prReconcileModal');
  if (!m) return;
  m.classList.add('hidden'); m.classList.remove('flex');
};

window.payrollReconcileClear = function() {
  prRecRows = []; prRecResult = null;
  var a = document.getElementById('prRecArea'); if (a) a.value = '';
  ['prRecWrap', 'prRecSummary', 'prRecErrors'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.classList.add('hidden');
  });
  var b = document.getElementById('prRecRunBtn'); if (b) b.disabled = true;
};

window.payrollReconcileFile = function(input) {
  var f = input && input.files && input.files[0]; if (!f) return;
  var rd = new FileReader();
  rd.onload = function(e) {
    var a = document.getElementById('prRecArea');
    if (a) { a.value = e.target.result; payrollReconcileParse(); }
  };
  rd.readAsText(f, 'utf-8');
  input.value = '';
};

window.payrollReconcileParse = function() {
  var a = document.getElementById('prRecArea');
  var errEl = document.getElementById('prRecErrors');
  var btn = document.getElementById('prRecRunBtn');
  if (!a || !btn) { console.warn('[payroll] #prRecArea/#prRecRunBtn not found'); return; }
  var text = String(a.value || '').trim();
  prRecRows = [];
  if (!text) { btn.disabled = true; if (errEl) errEl.classList.add('hidden'); return; }

  var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
  // 구분자 자동 판별 — 엑셀 복사는 탭, 파일은 쉼표
  var sep = (lines[0].indexOf('\t') >= 0) ? '\t' : ',';
  var head = lines[0].split(sep).map(prPasteNorm);
  var colOf = {};
  for (var c = 0; c < head.length; c++) {
    for (var d = 0; d < PR_REC_COLS.length; d++) {
      var def = PR_REC_COLS[d];
      for (var n = 0; n < def.names.length; n++) {
        if (head[c] === prPasteNorm(def.names[n]) && colOf[def.key] == null) colOf[def.key] = c;
      }
    }
  }
  var errs = [];
  if (colOf.name == null && colOf.employee_code == null) errs.push('머리글에 「성명」 또는 「사번」이 없습니다.');
  if (colOf.it == null) errs.push('머리글에 「소득세」가 없습니다 — 원인 판정에 반드시 필요합니다.');

  if (!errs.length) {
    for (var i = 1; i < lines.length; i++) {
      var cells = lines[i].split(sep);
      var row = {};
      for (var k in colOf) if (Object.prototype.hasOwnProperty.call(colOf, k)) {
        var raw = cells[colOf[k]];
        row[k] = (k === 'name' || k === 'employee_code') ? String(raw == null ? '' : raw).trim() : prPasteNum(raw);
      }
      if (!row.name && !row.employee_code) continue;   // 합계행·빈 줄
      prRecRows.push(row);
    }
    if (!prRecRows.length) errs.push('읽을 수 있는 데이터 행이 없습니다.');
  }

  if (errEl) {
    errEl.classList.toggle('hidden', !errs.length);
    errEl.innerHTML = errs.map(function(e) { return '<div>• ' + escapeHtml(e) + '</div>'; }).join('');
  }
  btn.disabled = !!errs.length || !prRecRows.length;
  if (!errs.length) showToast(prRecRows.length + '명 읽었습니다 — 「대조 실행」을 누르세요', 'info');
};

window.payrollReconcileRun = async function() {
  var periodEl = document.getElementById('prPeriod');
  var period = periodEl ? periodEl.value : '';
  if (!period || !prRecRows.length) return;
  var btn = document.getElementById('prRecRunBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>대조 중...'; }
  try {
    var res = await axios.post('/api/payroll/reconcile', { pay_period: period, rows: prRecRows });
    prRecResult = res.data.data;
    payrollReconcileRender();
  } catch (e) {
    showToast('대조 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-play mr-1"></i>대조 실행'; }
  }
};

function prRecMoney(v) {
  if (v == null) return '<span class="text-gray-300">-</span>';
  if (v === 0) return '<span class="text-gray-400">0</span>';
  var cls = v > 0 ? 'text-rose-600' : 'text-blue-600';
  return '<span class="' + cls + ' tabular-nums">' + (v > 0 ? '+' : '') + v.toLocaleString() + '</span>';
}

window.payrollReconcileRender = function() {
  if (!prRecResult) return;
  var onlyDiff = document.getElementById('prRecOnlyDiff');
  var body = document.getElementById('prRecBody');
  var wrap = document.getElementById('prRecWrap');
  var sum = document.getElementById('prRecSummary');
  if (!body || !wrap || !sum) { console.warn('[payroll] reconcile 표 요소 없음'); return; }

  var s = prRecResult.summary;
  var parts = [
    '<span class="px-2 py-1 rounded bg-gray-100">대조 <b>' + prRecResult.matched_count + '</b>명</span>',
    '<span class="px-2 py-1 rounded bg-emerald-50 text-emerald-700">소득세 일치 <b>' + s.tax_exact + '</b></span>',
    '<span class="px-2 py-1 rounded bg-amber-50 text-amber-700">설정으로 해결 <b>' + s.tax_setting + '</b></span>',
    '<span class="px-2 py-1 rounded bg-slate-100 text-slate-700">지급액 차이 <b>' + s.tax_pay + '</b></span>',
    '<span class="px-2 py-1 rounded bg-gray-100">실지급 절대차 합계 <b>' + s.net_abs_sum.toLocaleString() + '</b>원</span>',
  ];
  if (prRecResult.unmatched && prRecResult.unmatched.length) {
    parts.push('<span class="px-2 py-1 rounded bg-red-50 text-red-700" title="이카운트 이름이 MES와 다르면 직원 상세의 「이카운트 이름」에 넣어 두세요">매칭 실패 <b>'
      + prRecResult.unmatched.length + '</b> — ' + escapeHtml(prRecResult.unmatched.join(', ')) + '</span>');
  }
  sum.innerHTML = '<div class="flex flex-wrap gap-2 items-center">' + parts.join('') + '</div>';
  sum.classList.remove('hidden');

  var rows = prRecResult.rows.slice();
  if (onlyDiff && onlyDiff.checked) rows = rows.filter(function(r) { return r.diff.net !== 0 || r.diff.it !== 0; });
  rows.sort(function(a, b) { return Math.abs(b.diff.net || 0) - Math.abs(a.diff.net || 0); });

  body.innerHTML = rows.map(function(r) {
    var ins = ['np', 'hi', 'ltc', 'ei'].reduce(function(t, k) { return t + (r.diff[k] == null ? 0 : r.diff[k]); }, 0);
    var cause = '', act = '';
    if (r.diff.it === 0) {
      cause = '<span class="text-emerald-600">소득세 일치</span>';
    } else if (r.diagnosis && r.diagnosis.kind === 'setting') {
      cause = '<span class="text-amber-700">' + escapeHtml(r.diagnosis.label) + '</span>';
      act = '<a href="/hr/' + r.employee_id + '" target="_blank" class="text-indigo-600 hover:underline whitespace-nowrap">직원 설정</a>';
    } else if (r.diagnosis && r.diagnosis.kind === 'pay') {
      cause = '<span class="text-gray-500" title="같은 과세급여에서 적용비율·부양가족·자녀를 전부 풀어도 이 값이 안 나옵니다. 소득세가 아니라 지급 항목(수당 산정)을 보세요.">' + escapeHtml(r.diagnosis.label) + '</span>';
    } else if (r.diagnosis) {
      cause = '<span class="text-gray-400">' + escapeHtml(r.diagnosis.label) + '</span>';
    }
    var pin = r.current.pinned ? ' <span title="공제 오버라이드가 걸려 있습니다">📌</span>' : '';
    var cur = r.current.taxOption + '%' + (r.current.dependents > 1 ? ' · ' + r.current.dependents + '인' : '');
    return '<tr>'
      + '<td class="whitespace-nowrap">' + escapeHtml(r.name) + pin
        + '<div class="text-[10px] text-gray-400">현재 ' + escapeHtml(cur) + '</div></td>'
      + '<td class="text-right">' + prRecMoney(r.diff.total) + '</td>'
      + '<td class="text-right">' + prRecMoney(ins) + '</td>'
      + '<td class="text-right tabular-nums">' + r.mes.it.toLocaleString()
        + ' <span class="text-gray-400">→</span> ' + (r.ec.it == null ? '-' : r.ec.it.toLocaleString())
        + '<div class="text-[10px]">' + prRecMoney(r.diff.it) + '</div></td>'
      + '<td class="text-right">' + prRecMoney(r.diff.net) + '</td>'
      + '<td>' + cause + '</td>'
      + '<td class="text-right">' + act + '</td>'
      + '</tr>';
  }).join('') || '<tr><td colspan="7" class="text-center text-gray-400 py-6">차이 없음</td></tr>';
  wrap.classList.remove('hidden');
};
