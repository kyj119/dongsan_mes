// ============================================================================
// 캐시플로 관리 스크립트 — 자금계획(/cash-schedule) 페이지에 통합
// IIFE로 전역 격리 (fmt/esc/내부 var가 cashSchedule.js와 충돌하지 않도록).
// 탭 전환은 cashSchedule.js의 switchScheduleTab이 담당 → 로더만 window에 노출.
// ============================================================================
(function () {
  var selectedLoanId = null;

  var CATEGORY_MAP = {
    RENT: '임대료', INSURANCE: '보험료', UTILITY: '공과금',
    LEASE: '리스', SALARY: '급여', TAX: '세금', OTHER: '기타'
  };
  var FREQUENCY_MAP = { MONTHLY: '매월', QUARTERLY: '분기', YEARLY: '연간' };
  var REPAY_MAP = {
    EQUAL_PRINCIPAL: '원금균등', EQUAL_INSTALLMENT: '원리금균등',
    BULLET: '만기일시', INTEREST_ONLY: '이자만'
  };

  function fmt(n) { return (n || 0).toLocaleString(); }
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  // ── 월별 요약 탭 (구 캐시플로 현황) — summary KPI + monthly 표/차트 ──
  async function loadMonthly() {
    var chartEl = document.getElementById('monthlyChart');
    if (chartEl) chartEl.innerHTML = '<div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><p>로딩 중...</p></div>';
    var tableEl = document.getElementById('monthlyTable');
    if (tableEl) tableEl.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400">로딩 중...</td></tr>';
    try {
      var results = await Promise.all([
        axios.get('/api/cash-flow/summary'),
        axios.get('/api/cash-flow/schedule/monthly?months=6')
      ]);
      var sumRes = results[0], monRes = results[1];
      if (sumRes.data.success) {
        var s = sumRes.data.data;
        setText('kpiIncome', fmt(s.income) + '원');
        setText('kpiExpense', fmt(s.fixed_expenses + s.loan_payments) + '원');
        var net = s.income - s.fixed_expenses - s.loan_payments;
        var netEl = document.getElementById('kpiNet');
        if (netEl) {
          netEl.textContent = (net >= 0 ? '+' : '') + fmt(net) + '원';
          netEl.className = 'text-2xl font-bold mt-1 ' + (net >= 0 ? 'text-green-600' : 'text-red-600');
        }
        setText('kpiLoanBalance', fmt(s.total_loan_balance) + '원');
      }
      if (monRes.data.success) renderMonthly(monRes.data.data);
    } catch (err) { console.error('Monthly load failed:', err); }
  }
  window.loadMonthly = loadMonthly;

  function renderMonthly(data) {
    var maxVal = 1;
    data.forEach(function (d) { maxVal = Math.max(maxVal, d.in, d.out); });

    var chartEl = document.getElementById('monthlyChart');
    if (chartEl) chartEl.innerHTML = data.map(function (d) {
      var inPct = Math.round((d.in / maxVal) * 100);
      var outPct = Math.round((d.out / maxVal) * 100);
      return '<div class="flex items-center gap-2 text-xs">'
        + '<span class="w-16 text-gray-600">' + d.month + '</span>'
        + '<div class="flex-1">'
        + '<div class="flex items-center gap-1 mb-0.5"><span class="w-8 text-green-600">수입</span><div class="flex-1 h-3 bg-gray-100 rounded-full"><div class="h-full bg-green-500 rounded-full" style="width:' + inPct + '%"></div></div><span class="w-24 text-right">' + fmt(d.in) + '</span></div>'
        + '<div class="flex items-center gap-1"><span class="w-8 text-red-600">지출</span><div class="flex-1 h-3 bg-gray-100 rounded-full"><div class="h-full bg-red-400 rounded-full" style="width:' + outPct + '%"></div></div><span class="w-24 text-right">' + fmt(d.out) + '</span></div>'
        + '</div></div>';
    }).join('');

    var tableEl = document.getElementById('monthlyTable');
    if (tableEl) tableEl.innerHTML = data.map(function (d) {
      var netClass = d.net >= 0 ? 'text-green-600' : 'text-red-600';
      var cumClass = d.cumulative >= 0 ? 'text-green-600' : 'text-red-600';
      return '<tr class="border-b hover:bg-gray-50">'
        + '<td class="px-3 py-2 font-medium">' + d.month + '</td>'
        + '<td class="px-3 py-2 text-right text-green-600">' + fmt(d.in) + '</td>'
        + '<td class="px-3 py-2 text-right text-red-600">' + fmt(d.out) + '</td>'
        + '<td class="px-3 py-2 text-right font-bold ' + netClass + '">' + fmt(d.net) + '</td>'
        + '<td class="px-3 py-2 text-right ' + cumClass + '">' + fmt(d.cumulative) + '</td>'
        + '</tr>';
    }).join('');
  }

  // ── 고정비 탭 ──
  async function loadFixedExpenses() {
    try {
      var res = await axios.get('/api/cash-flow/fixed-expenses');
      if (!res.data.success) return;
      var items = res.data.data;
      var tbody = document.getElementById('fixedExpenseTable');
      var noMsg = document.getElementById('noFixedMsg');
      if (!tbody) return;
      if (items.length === 0) { tbody.innerHTML = ''; if (noMsg) noMsg.classList.remove('hidden'); return; }
      if (noMsg) noMsg.classList.add('hidden');
      tbody.innerHTML = items.map(function (fe) {
        return '<tr class="border-b hover:bg-gray-50">'
          + '<td class="px-3 py-2 font-medium" title="' + esc(fe.name) + '">' + esc(fe.name) + '</td>'
          + '<td class="px-3 py-2"><span class="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">' + (CATEGORY_MAP[fe.category] || fe.category) + '</span></td>'
          + '<td class="px-3 py-2 text-right font-medium">' + fmt(fe.amount) + '원</td>'
          + '<td class="px-3 py-2 text-center">' + (FREQUENCY_MAP[fe.frequency] || fe.frequency) + '</td>'
          + '<td class="px-3 py-2 text-center">' + (fe.payment_day || 1) + '일</td>'
          + '<td class="px-3 py-2 text-xs">' + fe.start_date + (fe.end_date ? ' ~ ' + fe.end_date : ' ~') + '</td>'
          + '<td class="px-3 py-2 text-center">' + (fe.is_active ? '<span class="text-green-600">활성</span>' : '<span class="text-gray-400">비활성</span>') + '</td>'
          + '<td class="px-3 py-2 text-center">'
          + '<button onclick="editFixedExpense(' + fe.id + ')" class="text-blue-500 hover:text-blue-700 mr-2"><i class="fas fa-edit"></i></button>'
          + '<button onclick="deleteFixedExpense(' + fe.id + ')" class="text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>'
          + '</td></tr>';
      }).join('');
    } catch (err) { console.error('Fixed expenses load failed:', err); }
  }
  window.loadFixedExpenses = loadFixedExpenses;

  window.openFixedExpenseModal = function (data) {
    var isEdit = !!data;
    var html = '<div id="feModalOverlay" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">'
      + '<div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">'
      + '<h3 class="font-bold text-lg mb-4">' + (isEdit ? '고정비 수정' : '고정비 등록') + '</h3>'
      + '<div class="space-y-3">'
      + '<div class="grid grid-cols-2 gap-3">'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">이름</label><input id="fe_name" class="w-full px-3 py-2 border rounded-lg text-sm" value="' + esc((data && data.name) || '') + '"></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">분류</label><select id="fe_category" class="w-full px-3 py-2 border rounded-lg text-sm">'
      + Object.keys(CATEGORY_MAP).map(function (k) { return '<option value="' + k + '"' + ((data && data.category === k) ? ' selected' : '') + '>' + CATEGORY_MAP[k] + '</option>'; }).join('')
      + '</select></div></div>'
      + '<div class="grid grid-cols-3 gap-3">'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">금액</label><input id="fe_amount" type="text" inputmode="numeric" data-money class="w-full px-3 py-2 border rounded-lg text-sm" value="' + window.fmtMoneyInput((data && data.amount) || '') + '"></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">주기</label><select id="fe_frequency" class="w-full px-3 py-2 border rounded-lg text-sm">'
      + Object.keys(FREQUENCY_MAP).map(function (k) { return '<option value="' + k + '"' + ((data && data.frequency === k) ? ' selected' : '') + '>' + FREQUENCY_MAP[k] + '</option>'; }).join('')
      + '</select></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">납부일</label><input id="fe_payment_day" type="number" min="1" max="31" class="w-full px-3 py-2 border rounded-lg text-sm" value="' + ((data && data.payment_day) || 1) + '"></div>'
      + '</div>'
      + '<div class="grid grid-cols-2 gap-3">'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">시작일</label><input id="fe_start" type="date" class="w-full px-3 py-2 border rounded-lg text-sm" value="' + ((data && data.start_date) || (window.kstToday ? window.kstToday() : new Date().toISOString().slice(0, 10))) + '"></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">종료일</label><input id="fe_end" type="date" class="w-full px-3 py-2 border rounded-lg text-sm" value="' + ((data && data.end_date) || '') + '"></div>'
      + '</div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">은행 거래 상대명 (매칭용)</label><input id="fe_counterpart" class="w-full px-3 py-2 border rounded-lg text-sm" value="' + esc((data && data.counterpart_name) || '') + '" placeholder="예: (주)한화손해보험"></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">비고</label><input id="fe_notes" class="w-full px-3 py-2 border rounded-lg text-sm" value="' + esc((data && data.notes) || '') + '"></div>'
      + '</div>'
      + '<div class="mt-4 flex justify-end gap-2">'
      + '<button onclick="closeModal(\'feModalOverlay\')" class="px-4 py-2 bg-gray-200 rounded-lg text-sm">취소</button>'
      + '<button onclick="saveFixedExpense(' + ((data && data.id) || 'null') + ')" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">저장</button>'
      + '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    if (window.bindMoneyInputs) window.bindMoneyInputs(document.getElementById('feModalOverlay'));
  };

  window.saveFixedExpense = async function (id) {
    var payload = {
      name: document.getElementById('fe_name').value.trim(),
      category: document.getElementById('fe_category').value,
      amount: window.readMoney('fe_amount'),
      frequency: document.getElementById('fe_frequency').value,
      payment_day: parseInt(document.getElementById('fe_payment_day').value) || 1,
      start_date: document.getElementById('fe_start').value,
      end_date: document.getElementById('fe_end').value || null,
      counterpart_name: document.getElementById('fe_counterpart').value.trim() || null,
      notes: document.getElementById('fe_notes').value.trim() || null
    };
    if (!payload.name || !payload.amount) { showToast('이름과 금액을 입력해주세요.', 'warning'); return; }
    try {
      if (id) await axios.put('/api/cash-flow/fixed-expenses/' + id, payload);
      else await axios.post('/api/cash-flow/fixed-expenses', payload);
      closeModal('feModalOverlay');
      loadFixedExpenses();
    } catch (err) { showToast('저장 실패: ' + (err.response?.data?.error || err.message), 'error'); }
  };

  window.editFixedExpense = async function (id) {
    try {
      var res = await axios.get('/api/cash-flow/fixed-expenses');
      var item = res.data.data.find(function (f) { return f.id === id; });
      if (item) window.openFixedExpenseModal(item);
    } catch (err) { console.error(err); }
  };

  window.deleteFixedExpense = async function (id) {
    if (!(await showConfirm('이 고정비를 비활성화하시겠습니까?'))) return;
    try {
      await axios.delete('/api/cash-flow/fixed-expenses/' + id);
      loadFixedExpenses();
    } catch (err) { showToast('삭제 실패', 'error'); }
  };

  // ── 대출 탭 ──
  async function loadLoans() {
    try {
      var res = await axios.get('/api/cash-flow/loans');
      if (!res.data.success) return;
      var items = res.data.data;
      var tbody = document.getElementById('loanTable');
      var noMsg = document.getElementById('noLoanMsg');
      if (!tbody) return;
      if (items.length === 0) { tbody.innerHTML = ''; if (noMsg) noMsg.classList.remove('hidden'); return; }
      if (noMsg) noMsg.classList.add('hidden');
      tbody.innerHTML = items.map(function (l) {
        var progress = l.original_amount > 0 ? Math.round((1 - l.current_balance / l.original_amount) * 100) : 0;
        return '<tr class="border-b hover:bg-gray-50 cursor-pointer" onclick="selectLoan(' + l.id + ')">'
          + '<td class="px-3 py-2 font-medium" title="' + esc(l.creditor) + '">' + esc(l.creditor) + '</td>'
          + '<td class="px-3 py-2 text-gray-500" title="' + esc(l.loan_number || '') + '">' + esc(l.loan_number || '-') + '</td>'
          + '<td class="px-3 py-2 text-right">' + fmt(l.original_amount) + '</td>'
          + '<td class="px-3 py-2 text-right font-medium">' + fmt(l.current_balance)
          + '<div class="w-full h-1.5 bg-gray-200 rounded-full mt-1"><div class="h-full bg-purple-500 rounded-full" style="width:' + progress + '%"></div></div></td>'
          + '<td class="px-3 py-2 text-center">' + l.current_rate + '%' + (l.rate_type === 'VARIABLE' ? ' <span class="text-xs text-orange-500">변동</span>' : '') + '</td>'
          + '<td class="px-3 py-2 text-center text-xs">' + (REPAY_MAP[l.repayment_type] || l.repayment_type) + '</td>'
          + '<td class="px-3 py-2">' + l.maturity_date + '</td>'
          + '<td class="px-3 py-2 text-center">'
          + '<button onclick="event.stopPropagation();editLoan(' + l.id + ')" class="text-blue-500 hover:text-blue-700 mr-1"><i class="fas fa-edit"></i></button>'
          + (l.overdue_payments > 0 ? '<span class="text-xs text-red-600 font-bold">연체 ' + l.overdue_payments + '</span>' : '')
          + '</td></tr>';
      }).join('');
    } catch (err) { console.error('Loans load failed:', err); }
  }
  window.loadLoans = loadLoans;

  window.selectLoan = async function (id) {
    selectedLoanId = id;
    var panel = document.getElementById('loanDetailPanel');
    if (panel) panel.classList.remove('hidden');
    await Promise.all([loadRateHistory(id), loadLoanSchedule(id)]);
  };

  async function loadRateHistory(loanId) {
    try {
      var res = await axios.get('/api/cash-flow/loans/' + loanId + '/rate-history');
      var el = document.getElementById('rateHistoryTable');
      if (!el) return;
      if (!res.data.success || res.data.data.length === 0) {
        el.innerHTML = '<p class="text-gray-400 text-sm">금리 변동 이력이 없습니다.</p>';
        return;
      }
      el.innerHTML = '<table class="w-full text-sm"><thead><tr class="bg-gray-50"><th class="px-2 py-1 text-left">적용일</th><th class="px-2 py-1 text-right">금리(%)</th><th class="px-2 py-1 text-left">비고</th></tr></thead><tbody>'
        + res.data.data.map(function (r) {
          return '<tr class="border-b"><td class="px-2 py-1">' + r.effective_date + '</td><td class="px-2 py-1 text-right font-bold">' + r.rate + '%</td><td class="px-2 py-1 text-gray-500 text-xs">' + esc(r.notes || '') + '</td></tr>';
        }).join('') + '</tbody></table>';
    } catch (err) { console.error(err); }
  }

  async function loadLoanSchedule(loanId) {
    try {
      var res = await axios.get('/api/cash-flow/loans/' + loanId + '/schedule');
      var el = document.getElementById('scheduleTable');
      if (!el || !res.data.success) return;
      var payments = res.data.data.payments;
      if (payments.length === 0) {
        el.innerHTML = '<p class="text-gray-400 text-sm">상환 스케줄이 없습니다. "스케줄 생성" 버튼을 클릭하세요.</p>';
        return;
      }
      el.innerHTML = '<table class="w-full text-xs" style="table-layout:fixed"><colgroup><col style="width:40px"><col style="width:84px"><col><col><col><col style="width:48px"><col style="width:36px"></colgroup><thead><tr class="bg-gray-50"><th class="px-2 py-1">회차</th><th class="px-2 py-1">날짜</th><th class="px-2 py-1 text-right">원금</th><th class="px-2 py-1 text-right">이자</th><th class="px-2 py-1 text-right">합계</th><th class="px-2 py-1 text-center">상태</th><th class="px-2 py-1"></th></tr></thead><tbody>'
        + payments.map(function (p) {
          var statusBadge = p.status === 'PAID' ? '<span class="text-green-600">납부</span>'
            : p.status === 'OVERDUE' ? '<span class="text-red-600 font-bold">연체</span>'
            : p.status === 'PARTIAL' ? '<span class="text-orange-600">일부</span>'
            : '<span class="text-gray-500">예정</span>';
          var payBtn = p.status !== 'PAID' ? '<button onclick="event.stopPropagation();payLoan(' + loanId + ',' + p.id + ',' + p.total_amount + ')" class="text-green-600 hover:text-green-700"><i class="fas fa-check-circle"></i></button>' : '';
          return '<tr class="border-b hover:bg-gray-50"><td class="px-2 py-1 text-center tabular-nums">' + p.payment_number + '</td><td class="px-2 py-1 tabular-nums">' + p.scheduled_date + '</td><td class="px-2 py-1 text-right tabular-nums">' + fmt(p.principal_amount) + '</td><td class="px-2 py-1 text-right tabular-nums">' + fmt(p.interest_amount) + '</td><td class="px-2 py-1 text-right font-medium tabular-nums">' + fmt(p.total_amount) + '</td><td class="px-2 py-1 text-center">' + statusBadge + '</td><td class="px-2 py-1 text-center">' + payBtn + '</td></tr>';
        }).join('') + '</tbody></table>';
    } catch (err) { console.error(err); }
  }

  window.generateSchedule = async function () {
    if (!selectedLoanId) return;
    try {
      var res = await axios.post('/api/cash-flow/loans/' + selectedLoanId + '/generate-schedule');
      if (res.data.success) {
        showToast(res.data.data.generated + '개 스케줄이 생성되었습니다.', 'success');
        loadLoanSchedule(selectedLoanId);
      }
    } catch (err) { showToast('스케줄 생성 실패: ' + (err.response?.data?.error || err.message), 'error'); }
  };

  window.payLoan = async function (loanId, paymentId, amount) {
    if (!(await showConfirm(fmt(amount) + '원을 납부 처리하시겠습니까?'))) return;
    try {
      await axios.post('/api/cash-flow/loans/' + loanId + '/payments/' + paymentId + '/pay', {
        actual_paid_amount: amount,
        actual_paid_date: (window.kstToday ? window.kstToday() : new Date().toISOString().slice(0, 10))
      });
      loadLoanSchedule(loanId);
      loadLoans();
    } catch (err) { showToast('납부 처리 실패', 'error'); }
  };

  window.openLoanModal = function (data) {
    var isEdit = !!data;
    var html = '<div id="loanModalOverlay" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">'
      + '<div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">'
      + '<h3 class="font-bold text-lg mb-4">' + (isEdit ? '대출 수정' : '대출 등록') + '</h3>'
      + '<div class="space-y-3">'
      + '<div class="grid grid-cols-2 gap-3">'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">대출기관</label><input id="ln_creditor" class="w-full px-3 py-2 border rounded-lg text-sm" value="' + esc((data && data.creditor) || '') + '"></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">대출번호</label><input id="ln_number" class="w-full px-3 py-2 border rounded-lg text-sm" value="' + esc((data && data.loan_number) || '') + '"></div>'
      + '</div>'
      + '<div class="grid grid-cols-2 gap-3">'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">원금</label><input id="ln_original" type="text" inputmode="numeric" data-money class="w-full px-3 py-2 border rounded-lg text-sm" value="' + window.fmtMoneyInput((data && data.original_amount) || '') + '"></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">현재 잔액</label><input id="ln_balance" type="text" inputmode="numeric" data-money class="w-full px-3 py-2 border rounded-lg text-sm" value="' + window.fmtMoneyInput((data && data.current_balance) || '') + '"></div>'
      + '</div>'
      + '<div class="grid grid-cols-3 gap-3">'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">금리(%)</label><input id="ln_rate" type="number" step="0.01" class="w-full px-3 py-2 border rounded-lg text-sm" value="' + ((data && data.current_rate) || '') + '"></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">금리유형</label><select id="ln_rate_type" class="w-full px-3 py-2 border rounded-lg text-sm"><option value="FIXED"' + ((data && data.rate_type === 'FIXED') ? ' selected' : '') + '>고정</option><option value="VARIABLE"' + ((data && data.rate_type === 'VARIABLE') ? ' selected' : '') + '>변동</option></select></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">상환방식</label><select id="ln_repay" class="w-full px-3 py-2 border rounded-lg text-sm">'
      + Object.keys(REPAY_MAP).map(function (k) { return '<option value="' + k + '"' + ((data && data.repayment_type === k) ? ' selected' : '') + '>' + REPAY_MAP[k] + '</option>'; }).join('')
      + '</select></div></div>'
      + '<div class="grid grid-cols-3 gap-3">'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">시작일</label><input id="ln_start" type="date" class="w-full px-3 py-2 border rounded-lg text-sm" value="' + ((data && data.start_date) || '') + '"></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">만기일</label><input id="ln_maturity" type="date" class="w-full px-3 py-2 border rounded-lg text-sm" value="' + ((data && data.maturity_date) || '') + '"></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">상환일</label><input id="ln_payday" type="number" min="1" max="31" class="w-full px-3 py-2 border rounded-lg text-sm" value="' + ((data && data.monthly_payment_day) || 1) + '"></div>'
      + '</div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">비고</label><input id="ln_notes" class="w-full px-3 py-2 border rounded-lg text-sm" value="' + esc((data && data.notes) || '') + '"></div>'
      + '</div>'
      + '<div class="mt-4 flex justify-end gap-2">'
      + '<button onclick="closeModal(\'loanModalOverlay\')" class="px-4 py-2 bg-gray-200 rounded-lg text-sm">취소</button>'
      + '<button onclick="saveLoan(' + ((data && data.id) || 'null') + ')" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">저장</button>'
      + '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    if (window.bindMoneyInputs) window.bindMoneyInputs(document.getElementById('loanModalOverlay'));
  };

  window.saveLoan = async function (id) {
    var payload = {
      creditor: document.getElementById('ln_creditor').value.trim(),
      loan_number: document.getElementById('ln_number').value.trim() || null,
      original_amount: window.readMoney('ln_original'),
      current_balance: window.readMoney('ln_balance'),
      current_rate: parseFloat(document.getElementById('ln_rate').value) || 0,
      rate_type: document.getElementById('ln_rate_type').value,
      repayment_type: document.getElementById('ln_repay').value,
      start_date: document.getElementById('ln_start').value,
      maturity_date: document.getElementById('ln_maturity').value,
      monthly_payment_day: parseInt(document.getElementById('ln_payday').value) || 1,
      notes: document.getElementById('ln_notes').value.trim() || null
    };
    if (!payload.creditor || !payload.original_amount) { showToast('대출기관과 원금을 입력해주세요.', 'warning'); return; }
    try {
      if (id) await axios.put('/api/cash-flow/loans/' + id, payload);
      else await axios.post('/api/cash-flow/loans', payload);
      closeModal('loanModalOverlay');
      loadLoans();
    } catch (err) { showToast('저장 실패: ' + (err.response?.data?.error || err.message), 'error'); }
  };

  window.editLoan = async function (id) {
    try {
      var res = await axios.get('/api/cash-flow/loans');
      var item = res.data.data.find(function (l) { return l.id === id; });
      if (item) window.openLoanModal(item);
    } catch (err) { console.error(err); }
  };

  window.openRateChangeModal = function () {
    if (!selectedLoanId) return;
    var html = '<div id="rateModalOverlay" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">'
      + '<div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">'
      + '<h3 class="font-bold text-lg mb-4">금리 변경</h3>'
      + '<div class="space-y-3">'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">적용일</label><input id="rc_date" type="date" class="w-full px-3 py-2 border rounded-lg text-sm" value="' + (window.kstToday ? window.kstToday() : new Date().toISOString().slice(0, 10)) + '"></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">새 금리 (%)</label><input id="rc_rate" type="number" step="0.01" class="w-full px-3 py-2 border rounded-lg text-sm"></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">비고</label><input id="rc_notes" class="w-full px-3 py-2 border rounded-lg text-sm"></div>'
      + '</div>'
      + '<div class="mt-4 flex justify-end gap-2">'
      + '<button onclick="closeModal(\'rateModalOverlay\')" class="px-4 py-2 bg-gray-200 rounded-lg text-sm">취소</button>'
      + '<button onclick="saveRateChange()" class="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm">저장</button>'
      + '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  };

  window.saveRateChange = async function () {
    try {
      await axios.post('/api/cash-flow/loans/' + selectedLoanId + '/rate-change', {
        effective_date: document.getElementById('rc_date').value,
        rate: parseFloat(document.getElementById('rc_rate').value) || 0,
        notes: document.getElementById('rc_notes').value.trim() || null
      });
      closeModal('rateModalOverlay');
      loadRateHistory(selectedLoanId);
      loadLoans();
    } catch (err) { showToast('금리 변경 실패', 'error'); }
  };

  // ── 공용 모달 닫기 ──
  window.closeModal = function (id) {
    var el = document.getElementById(id);
    if (el) el.remove();
  };
})();
