// ============================================================================
// 연말정산 관리 (Phase B4)
// ============================================================================

(function() {
  'use strict';
  var currentYear = new Date().getFullYear();
  var listData = [];

  // ── 초기화 ──
  function init() {
    var sel = document.getElementById('yeYear');
    if (!sel) return;
    for (var y = currentYear; y >= currentYear - 3; y--) {
      var opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y + '년';
      sel.appendChild(opt);
    }
    yeLoadList();
  }

  // ── 직원 목록 로드 ──
  window.yeLoadList = function() {
    var year = document.getElementById('yeYear').value || currentYear;
    axios.get('/api/payroll/year-end-list', { params: { year: year } })
      .then(function(res) {
        if (res.data && res.data.success === false) {
          listData = [];
          renderTable(listData);
          renderStats(listData);
          return;
        }
        listData = (res.data && res.data.data) || [];
        renderTable(listData);
        renderStats(listData);
      })
      .catch(function(e) {
        listData = [];
        renderTable(listData);
        renderStats(listData);
        showToast('목록 조회 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
      });
  };

  function fmt(n) {
    return Number(n || 0).toLocaleString('ko-KR');
  }

  function renderStats(data) {
    var total = data.length;
    var done = 0, refundAmt = 0, collectAmt = 0;
    data.forEach(function(r) {
      if (r.status === 'CALCULATED' || r.status === 'CONFIRMED' || r.status === 'LOCKED') done++;
      var ref = Number(r.refund_total || 0);
      if (ref > 0) refundAmt += ref;
      else if (ref < 0) collectAmt += Math.abs(ref);
    });
    document.getElementById('yeStatTotal').textContent = total;
    document.getElementById('yeStatDone').textContent = done;
    document.getElementById('yeStatRefund').textContent = fmt(refundAmt);
    document.getElementById('yeStatCollect').textContent = fmt(collectAmt);
    document.getElementById('yeSummaryBadge').textContent = '정산율 ' + (total ? Math.round(done / total * 100) : 0) + '%';
  }

  function statusBadge(status) {
    if (!status) return '<span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">미시작</span>';
    var map = {
      'DRAFT': ['bg-gray-100 text-gray-700', '초안'],
      'CALCULATED': ['bg-blue-50 text-blue-700', '계산완료'],
      'CONFIRMED': ['bg-green-50 text-green-700', '확정'],
      'LOCKED': ['bg-amber-50 text-amber-700', '잠금']
    };
    var m = map[status] || ['bg-gray-100 text-gray-700', status];
    return '<span class="px-2.5 py-0.5 rounded-full text-xs font-medium ' + m[0] + '">' + m[1] + '</span>';
  }

  function refundBadge(val) {
    var n = Number(val || 0);
    if (n === 0) return '<span class="text-gray-400">-</span>';
    if (n > 0) return '<span class="text-blue-600 font-medium tabular-nums">+' + fmt(n) + '</span>';
    return '<span class="text-red-600 font-medium tabular-nums">' + fmt(n) + '</span>';
  }

  function renderTable(data) {
    var tbody = document.getElementById('yeTableBody');
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400 py-10"><i class="fas fa-inbox text-2xl mb-2 block"></i>직원 데이터가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(function(r) {
      return '<tr class="hover:bg-gray-50 border-b border-gray-100">' +
        '<td class="px-4 py-3 text-sm"><div class="font-medium text-gray-900">' + (r.name || '-') + '</div><div class="text-xs text-gray-500">' + (r.employee_code || '') + '</div></td>' +
        '<td class="px-4 py-3 text-sm text-gray-600">' + (r.department || '-') + '</td>' +
        '<td class="px-4 py-3 text-sm text-right tabular-nums">' + (r.total_salary ? fmt(r.total_salary) : '<span class="text-gray-400">-</span>') + '</td>' +
        '<td class="px-4 py-3 text-sm text-right tabular-nums">' + (r.determined_tax ? fmt(r.determined_tax) : '<span class="text-gray-400">-</span>') + '</td>' +
        '<td class="px-4 py-3 text-sm text-right tabular-nums">' + (r.prepaid_income_tax ? fmt(r.prepaid_income_tax) : '<span class="text-gray-400">-</span>') + '</td>' +
        '<td class="px-4 py-3 text-sm text-right">' + refundBadge(r.refund_total) + '</td>' +
        '<td class="px-4 py-3 text-center">' + statusBadge(r.status) + '</td>' +
        '<td class="px-4 py-3 text-center">' +
          '<div class="flex items-center justify-center gap-1">' +
            '<button onclick="yeOpenModal(' + r.id + ')" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="정산"><i class="fas fa-calculator"></i></button>' +
            (r.settlement_id ? '<button onclick="yeConfirm(' + r.settlement_id + ')" class="p-1.5 text-green-600 hover:bg-green-50 rounded" title="확정"><i class="fas fa-check-circle"></i></button>' : '') +
            '<button onclick="yeOpenPrint(' + r.id + ')" class="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="인쇄용"><i class="fas fa-print"></i></button>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  // ── 모달: 열기 ──
  window.yeOpenModal = function(empId) {
    var year = document.getElementById('yeYear').value || currentYear;
    document.getElementById('yeEmpId').value = empId;

    // 직원 정보 + 급여 집계 로드
    Promise.all([
      axios.get('/api/payroll/year-end/' + empId, { params: { year: year } }),
      axios.get('/api/payroll/year-end-settlement/' + empId, { params: { year: year } })
    ]).then(function(results) {
      var info = results[0].data.data;
      var saved = results[1].data.data;

      document.getElementById('yeEmpName').textContent = info.employee.name;
      document.getElementById('yeEmpDept').textContent = info.employee.department || '-';
      document.getElementById('yeEmpCode').textContent = info.employee.employee_code || '-';

      var s = info.summary || {};
      document.getElementById('yeDispTotalSalary').textContent = fmt(s.total_salary);
      document.getElementById('yeDispNontax').textContent = fmt(s.total_nontax);
      document.getElementById('yeDispGross').textContent = fmt(Number(s.total_salary || 0) - Number(s.total_nontax || 0));
      // 국민연금 합계 저장 (미리보기 계산용)
      document.getElementById('yeDispGross').dataset.nationalPension = s.sum_national_pension || 0;

      // 저장된 정산 데이터가 있으면 폼에 채우기
      if (saved && saved.settlement) {
        var d = saved.settlement;
        document.getElementById('yeDependents').value = d.dependents_count || 1;
        document.getElementById('yeAged').value = d.additional_aged || 0;
        document.getElementById('yeDisabled').value = d.additional_disabled || 0;
        document.getElementById('yeSingleParent').value = d.additional_single_parent || 0;
        document.getElementById('yeInsurance').value = fmtMoneyInput(d.insurance_deduction || 0);
        document.getElementById('yeMedical').value = fmtMoneyInput(d.medical_deduction || 0);
        document.getElementById('yeEducation').value = fmtMoneyInput(d.education_deduction || 0);
        document.getElementById('yeHousing').value = fmtMoneyInput(d.housing_deduction || 0);
        document.getElementById('yeDonation').value = fmtMoneyInput(d.donation_deduction || 0);
        document.getElementById('yePension').value = fmtMoneyInput(d.pension_saving || 0);
        document.getElementById('yeCreditCard').value = fmtMoneyInput(d.credit_card_deduction || 0);
        document.getElementById('yeChildCredit').value = fmtMoneyInput(d.child_tax_credit || 0);
        document.getElementById('yeNotes').value = d.notes || '';
      } else {
        // 기본값 (직원 부양가족 수)
        document.getElementById('yeDependents').value = info.employee.dependents_count || 1;
        document.getElementById('yeAged').value = 0;
        document.getElementById('yeDisabled').value = 0;
        document.getElementById('yeSingleParent').value = 0;
        document.getElementById('yeInsurance').value = fmtMoneyInput(0);
        document.getElementById('yeMedical').value = fmtMoneyInput(0);
        document.getElementById('yeEducation').value = fmtMoneyInput(0);
        document.getElementById('yeHousing').value = fmtMoneyInput(0);
        document.getElementById('yeDonation').value = fmtMoneyInput(0);
        document.getElementById('yePension').value = fmtMoneyInput(0);
        document.getElementById('yeCreditCard').value = fmtMoneyInput(0);
        document.getElementById('yeChildCredit').value = fmtMoneyInput(0);
        document.getElementById('yeNotes').value = '';
      }

      document.getElementById('yePreviewArea').classList.add('hidden');
      document.getElementById('yeModal').classList.remove('hidden');
    }).catch(function(e) {
      showToast('데이터 조회 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
    });
  };

  // ── 모달: 닫기 ──
  window.yeCloseModal = function() {
    document.getElementById('yeModal').classList.add('hidden');
  };

  // ── 클라이언트 측 미리보기 계산 ──
  window.yePreviewCalc = function() {
    var grossStr = document.getElementById('yeDispGross').textContent.replace(/[,원]/g, '');
    var gross = Number(grossStr) || 0;
    if (!gross) return;

    var dep = Number(document.getElementById('yeDependents').value) || 1;
    var basicDed = dep * 1500000;
    var agedDed = (Number(document.getElementById('yeAged').value) || 0) * 1000000;
    var disabledDed = (Number(document.getElementById('yeDisabled').value) || 0) * 2000000;
    var singleDed = Number(document.getElementById('yeSingleParent').value) || 0;

    var insDed = Math.min(readMoney('yeInsurance'), 1000000);
    var medDed = Math.max(0, (readMoney('yeMedical')) - Math.floor(gross * 0.03));
    var eduDed = readMoney('yeEducation');
    var houDed = readMoney('yeHousing');
    var donDed = readMoney('yeDonation');
    var penDed = Math.min(readMoney('yePension'), 4000000);
    var ccDed = readMoney('yeCreditCard');
    var npDed = Number(document.getElementById('yeDispGross').dataset.nationalPension) || 0; // 국민연금 소득공제

    // 근로소득공제
    var eid = calcEarnedIncomeDeduction(gross);
    var earnedIncome = Math.max(0, gross - eid);

    var totalDed = basicDed + agedDed + disabledDed + singleDed + insDed + medDed + eduDed + houDed + donDed + npDed + penDed + ccDed;
    var taxableIncome = Math.max(0, earnedIncome - totalDed);
    var calcTax = calcIncomeTax(taxableIncome);

    // 세액공제 (간략)
    var earnedTC = calcEarnedTaxCredit(calcTax, gross);
    var childTC = readMoney('yeChildCredit');
    var insTC = Math.floor(insDed * 0.12);
    var medTC = Math.floor(medDed * 0.15);
    var eduTC = Math.floor(eduDed * 0.15);
    var donTC = Math.floor(donDed * 0.15);
    var npTC = Math.floor(npDed * 0.12); // 연금보험료 세액공제
    var hasSpecial = insDed + medDed + eduDed + houDed + donDed > 0;
    var stdTC = hasSpecial ? 0 : 130000;
    var totalTC = earnedTC + childTC + insTC + medTC + eduTC + donTC + npTC + stdTC;

    var determined = Math.max(0, calcTax - totalTC);
    var determinedLocal = Math.floor(determined * 0.1);

    var grid = document.getElementById('yePreviewGrid');
    grid.innerHTML =
      row('근로소득공제', fmt(eid)) +
      row('근로소득금액', fmt(earnedIncome)) +
      row('인적공제 합계', fmt(basicDed + agedDed + disabledDed + singleDed)) +
      row('특별소득공제 합계', fmt(insDed + medDed + eduDed + houDed + donDed)) +
      row('국민연금 소득공제', fmt(npDed)) +
      row('기타소득공제 합계', fmt(penDed + ccDed)) +
      '<div class="col-span-2 border-t my-1"></div>' +
      row('과세표준', fmt(taxableIncome), true) +
      row('산출세액', fmt(calcTax), true) +
      row('세액공제 합계', fmt(totalTC)) +
      '<div class="col-span-2 border-t my-1"></div>' +
      row('결정세액 (소득세)', fmt(determined), true) +
      row('결정세액 (지방세)', fmt(determinedLocal), true);

    document.getElementById('yePreviewArea').classList.remove('hidden');
  };

  function row(label, value, bold) {
    return '<div class="text-gray-600 text-xs py-0.5">' + label + '</div>' +
      '<div class="text-right text-xs py-0.5 tabular-nums' + (bold ? ' font-bold text-gray-900' : ' text-gray-700') + '">' + value + '</div>';
  }

  // ── 근로소득공제 계산 (클라이언트 측) ──
  function calcEarnedIncomeDeduction(gross) {
    if (gross <= 5000000) return Math.floor(gross * 0.7);
    if (gross <= 15000000) return 3500000 + Math.floor((gross - 5000000) * 0.4);
    if (gross <= 45000000) return 7500000 + Math.floor((gross - 15000000) * 0.15);
    if (gross <= 100000000) return 12000000 + Math.floor((gross - 45000000) * 0.05);
    return Math.min(14750000 + Math.floor((gross - 100000000) * 0.02), 20000000);
  }

  // ── 소득세 세율표 (클라이언트 측) ──
  function calcIncomeTax(ti) {
    if (ti <= 14000000) return Math.floor(ti * 0.06);
    if (ti <= 50000000) return 840000 + Math.floor((ti - 14000000) * 0.15);
    if (ti <= 88000000) return 6240000 + Math.floor((ti - 50000000) * 0.24);
    if (ti <= 150000000) return 15360000 + Math.floor((ti - 88000000) * 0.35);
    if (ti <= 300000000) return 37060000 + Math.floor((ti - 150000000) * 0.38);
    if (ti <= 500000000) return 94060000 + Math.floor((ti - 300000000) * 0.40);
    if (ti <= 1000000000) return 174060000 + Math.floor((ti - 500000000) * 0.42);
    return 384060000 + Math.floor((ti - 1000000000) * 0.45);
  }

  // ── 근로소득세액공제 (클라이언트 측) ──
  function calcEarnedTaxCredit(tax, gross) {
    var credit;
    if (tax <= 1300000) credit = Math.floor(tax * 0.55);
    else credit = 715000 + Math.floor((tax - 1300000) * 0.30);
    if (gross <= 33000000) return Math.min(credit, 740000);
    if (gross <= 70000000) return Math.min(credit, 660000);
    return Math.min(credit, 500000);
  }

  // ── 계산 및 저장 ──
  window.yeCalculateAndSave = function() {
    var empId = document.getElementById('yeEmpId').value;
    var year = document.getElementById('yeYear').value || currentYear;
    if (!empId) { showToast('직원 정보가 없습니다', 'warning'); return; }

    var body = {
      year: Number(year),
      dependents_count: Number(document.getElementById('yeDependents').value) || 1,
      additional_aged: Number(document.getElementById('yeAged').value) || 0,
      additional_disabled: Number(document.getElementById('yeDisabled').value) || 0,
      additional_single_parent: Number(document.getElementById('yeSingleParent').value) || 0,
      insurance_deduction: readMoney('yeInsurance'),
      medical_deduction: readMoney('yeMedical'),
      education_deduction: readMoney('yeEducation'),
      housing_deduction: readMoney('yeHousing'),
      donation_deduction: readMoney('yeDonation'),
      pension_saving: readMoney('yePension'),
      credit_card_deduction: readMoney('yeCreditCard'),
      child_tax_credit: readMoney('yeChildCredit'),
      notes: document.getElementById('yeNotes').value || ''
    };

    axios.post('/api/payroll/year-end-settlement/' + empId, body)
      .then(function(res) {
        if (!res.data.success) { showToast(res.data.error || '정산 실패', 'error'); return; }
        var s = res.data.data.summary;
        showToast('정산 완료 — 환급/추징: ' + fmt(s.refundTotal) + '원', s.refundTotal >= 0 ? 'success' : 'warning');
        yeCloseModal();
        yeLoadList();
      })
      .catch(function(e) {
        showToast('정산 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
      });
  };

  // ── 확정 ──
  window.yeConfirm = async function(settlementId) {
    if (!(await showConfirm('이 정산을 확정하시겠습니까?\n확정 후에도 재계산은 가능합니다.'))) return;
    axios.put('/api/payroll/year-end-settlement/' + settlementId + '/confirm')
      .then(function(res) {
        if (!res.data.success) { showToast(res.data.error || '확정 실패', 'error'); return; }
        showToast('정산이 확정되었습니다', 'success');
        yeLoadList();
      })
      .catch(function(e) {
        showToast('확정 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
      });
  };

  // ── 인쇄용 열기 ──
  window.yeOpenPrint = function(empId) {
    var year = document.getElementById('yeYear').value || currentYear;
    window.open('/year-end/' + empId + '?year=' + year, '_blank', 'width=900,height=1200');
  };

  // 초기 로드
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
