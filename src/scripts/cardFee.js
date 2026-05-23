(function() {
  var feeRates = [];
  var initialized = false;

  window.initCardFeeTab = function() {
    if (initialized) return;
    initialized = true;
    loadFeeRates();
    initFeeDates();
  };

  function initFeeDates() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    document.getElementById('feeDateStart').value = y + '-' + m + '-01';
    var last = new Date(y, now.getMonth() + 1, 0);
    document.getElementById('feeDateEnd').value = y + '-' + m + '-' + String(last.getDate()).padStart(2, '0');
  }

  // --- 수수료율 CRUD ---
  function loadFeeRates() {
    axios.get('/api/bank/card-fee-rates').then(function(r) {
      feeRates = r.data.data || [];
      renderFeeRateTable();
      renderCalcDropdown();
    }).catch(function() {
      document.getElementById('feeRateTableBody').innerHTML =
        '<tr><td colspan="4" class="text-center py-6 text-red-400">로딩 실패</td></tr>';
    });
  }

  function renderFeeRateTable() {
    var tbody = document.getElementById('feeRateTableBody');
    if (!feeRates.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-gray-400">등록된 카드사가 없습니다</td></tr>';
      return;
    }
    var html = '';
    feeRates.forEach(function(r) {
      html += '<tr class="border-b border-gray-100">';
      html += '<td class="px-3 py-2 font-medium text-gray-800">' + escH(r.card_company) + '</td>';
      html += '<td class="px-3 py-2 text-center"><span class="inline-block px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs font-semibold">' + r.fee_rate + '%</span></td>';
      html += '<td class="px-3 py-2 text-gray-500 text-xs">' + escH(r.keywords || '') + '</td>';
      html += '<td class="px-3 py-2 text-center">';
      html += '<button class="btn-sm" style="background:#e0e7ff;color:#3730a3;" onclick="editFeeRate(' + r.id + ')"><i class="fas fa-edit"></i></button> ';
      html += '<button class="btn-sm btn-delete" onclick="deleteFeeRate(' + r.id + ')"><i class="fas fa-trash"></i></button>';
      html += '</td></tr>';
    });
    tbody.innerHTML = html;
  }

  function renderCalcDropdown() {
    var sel = document.getElementById('calcCardCompany');
    sel.innerHTML = '<option value="">카드사 선택</option>';
    feeRates.forEach(function(r) {
      sel.innerHTML += '<option value="' + escH(r.card_company) + '" data-rate="' + r.fee_rate + '">' + escH(r.card_company) + ' (' + r.fee_rate + '%)</option>';
    });
  }

  // --- 수수료 계산기 ---
  window.calculateCardFee = function() {
    var company = document.getElementById('calcCardCompany').value;
    var amount = parseFloat(document.getElementById('calcDepositAmount').value);
    if (!company) { showToast('카드사를 선택하세요', 'warning'); return; }
    if (!amount || amount <= 0) { showToast('입금액을 입력하세요', 'warning'); return; }

    var rate = feeRates.find(function(r) { return r.card_company === company; });
    if (!rate) { showToast('수수료율 정보 없음', 'error'); return; }

    var feePercent = rate.fee_rate / 100;
    var original = Math.round(amount / (1 - feePercent));
    var fee = original - amount;

    document.getElementById('calcOriginal').textContent = original.toLocaleString() + '원';
    document.getElementById('calcFee').textContent = '-' + fee.toLocaleString() + '원';
    document.getElementById('calcDeposit').textContent = amount.toLocaleString() + '원';
    document.getElementById('calcRateDisplay').textContent = rate.fee_rate;
    document.getElementById('calcResult').classList.remove('hidden');
  };

  // --- 기간별 요약 ---
  window.loadFeeSummary = function() {
    var start = document.getElementById('feeDateStart').value;
    var end = document.getElementById('feeDateEnd').value;
    var area = document.getElementById('feeSummaryArea');
    if (!start || !end) { showToast('기간을 선택하세요', 'warning'); return; }

    area.innerHTML = '<div class="text-center py-6 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>조회 중...</div>';

    axios.get('/api/bank/card-fee-summary?date_start=' + start + '&date_end=' + end).then(function(r) {
      var data = r.data.data;
      if (!data || !data.by_company || data.by_company.length === 0) {
        area.innerHTML = '<div class="text-center py-8 text-gray-400">해당 기간에 카드사 입금 내역이 없습니다</div>';
        return;
      }
      var html = '';
      // 총합 카드
      html += '<div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">';
      html += '<div class="p-4 bg-gray-50 rounded-lg"><div class="text-xs text-gray-500">카드 입금 건수</div><div class="text-xl font-bold">' + data.totals.count + '건</div></div>';
      html += '<div class="p-4 bg-blue-50 rounded-lg"><div class="text-xs text-gray-500">원래 결제금액</div><div class="text-xl font-bold text-blue-700">' + data.totals.total_original.toLocaleString() + '원</div></div>';
      html += '<div class="p-4 bg-red-50 rounded-lg"><div class="text-xs text-gray-500">총 수수료</div><div class="text-xl font-bold text-red-600">' + data.totals.total_fee.toLocaleString() + '원</div></div>';
      html += '<div class="p-4 bg-green-50 rounded-lg"><div class="text-xs text-gray-500">실제 입금액</div><div class="text-xl font-bold text-green-700">' + data.totals.total_deposit.toLocaleString() + '원</div></div>';
      html += '</div>';

      // 카드사별 테이블
      html += '<table class="w-full text-sm ds-table-striped">';
      html += '<thead><tr class="bg-gray-50 border-b"><th class="px-3 py-2 text-left">카드사</th><th class="px-3 py-2 text-center">수수료율</th><th class="px-3 py-2 text-right">건수</th><th class="px-3 py-2 text-right">결제금액</th><th class="px-3 py-2 text-right">수수료</th><th class="px-3 py-2 text-right">입금액</th></tr></thead>';
      html += '<tbody>';
      data.by_company.forEach(function(s) {
        html += '<tr class="border-b border-gray-100">';
        html += '<td class="px-3 py-2 font-medium">' + escH(s.card_company) + '</td>';
        html += '<td class="px-3 py-2 text-center"><span class="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded">' + s.fee_rate + '%</span></td>';
        html += '<td class="px-3 py-2 text-right">' + s.count + '</td>';
        html += '<td class="px-3 py-2 text-right">' + s.total_original.toLocaleString() + '</td>';
        html += '<td class="px-3 py-2 text-right text-red-600 font-medium">' + s.total_fee.toLocaleString() + '</td>';
        html += '<td class="px-3 py-2 text-right text-blue-600">' + s.total_deposit.toLocaleString() + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      area.innerHTML = html;
    }).catch(function() {
      area.innerHTML = '<div class="text-center py-6 text-red-400">조회 실패</div>';
    });
  };

  // --- 수수료율 모달 ---
  window.openAddFeeRateModal = function() {
    document.getElementById('feeRateEditId').value = '';
    document.getElementById('feeRateModalTitle').innerHTML = '<i class="fas fa-credit-card text-blue-500 mr-2"></i>카드사 수수료율 등록';
    document.getElementById('feeRateCompany').value = '';
    document.getElementById('feeRatePercent').value = '';
    document.getElementById('feeRateKeywords').value = '';
    document.getElementById('feeRateModal').classList.add('show');
  };

  window.editFeeRate = function(id) {
    var rate = feeRates.find(function(r) { return r.id === id; });
    if (!rate) return;
    document.getElementById('feeRateEditId').value = id;
    document.getElementById('feeRateModalTitle').innerHTML = '<i class="fas fa-edit text-blue-500 mr-2"></i>수수료율 수정';
    document.getElementById('feeRateCompany').value = rate.card_company;
    document.getElementById('feeRatePercent').value = rate.fee_rate;
    document.getElementById('feeRateKeywords').value = rate.keywords || '';
    document.getElementById('feeRateModal').classList.add('show');
  };

  window.closeFeeRateModal = function() {
    document.getElementById('feeRateModal').classList.remove('show');
  };

  window.saveFeeRate = function() {
    var editId = document.getElementById('feeRateEditId').value;
    var company = document.getElementById('feeRateCompany').value.trim();
    var rate = parseFloat(document.getElementById('feeRatePercent').value);
    var keywords = document.getElementById('feeRateKeywords').value.trim();
    if (!company) { showToast('카드사명을 입력하세요', 'warning'); return; }
    if (isNaN(rate) || rate < 0 || rate > 100) { showToast('수수료율을 올바르게 입력하세요 (0~100)', 'warning'); return; }

    var body = { card_company: company, fee_rate: rate, keywords: keywords || null };
    var promise = editId
      ? axios.put('/api/bank/card-fee-rates/' + editId, body)
      : axios.post('/api/bank/card-fee-rates', body);

    promise.then(function() {
      showToast(editId ? '수정 완료' : '등록 완료', 'success');
      closeFeeRateModal();
      loadFeeRates();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) || '저장 실패';
      showToast(msg, 'error');
    });
  };

  window.deleteFeeRate = async function(id) {
    if (!(await showConfirm('삭제하시겠습니까?', { danger: true }))) return;
    axios.delete('/api/bank/card-fee-rates/' + id).then(function() {
      showToast('삭제 완료', 'success');
      loadFeeRates();
    }).catch(function() {
      showToast('삭제 실패', 'error');
    });
  };

  function escH(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
