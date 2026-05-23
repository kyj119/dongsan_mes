(function() {
  var initialized = false;
  var cards = [];
  var bankAccounts = [];
  var allCardLogs = [];  // 전체 카드 내역 (모든 카드)
  var allBankLogs = [];  // 전체 통장 내역 (모든 계좌)
  var cardFilterSet = new Set();  // 선택된 카드 필터
  var bankFilterSet = new Set();  // 선택된 계좌 필터

  window.initBarobillTab = function() {
    if (initialized) return;
    initialized = true;
    loadStatus();
    loadCards();
    loadBankAccounts();
    var now = new Date();
    var y = now.getFullYear(); var m = String(now.getMonth() + 1).padStart(2, '0');
    document.getElementById('bbCardDateStart').value = y + '-' + m + '-01';
    document.getElementById('bbCardDateEnd').value = now.toISOString().slice(0, 10);
    document.getElementById('bbBankDateEnd').value = now.toISOString().slice(0, 10);
    document.getElementById('bbBankDateStart').value = now.toISOString().slice(0, 10);
  };

  window.switchBBSub = function(tab) {
    document.getElementById('bbCardPanel').classList.toggle('hidden', tab !== 'card');
    document.getElementById('bbBankPanel').classList.toggle('hidden', tab !== 'bank');
    ['bbSubCard', 'bbSubBank'].forEach(function(id) {
      var el = document.getElementById(id);
      var active = (id === 'bbSubCard' && tab === 'card') || (id === 'bbSubBank' && tab === 'bank');
      el.classList.toggle('border-blue-600', active);
      el.classList.toggle('text-blue-600', active);
      el.classList.toggle('border-transparent', !active);
      el.classList.toggle('text-gray-500', !active);
    });
  };

  function loadStatus() {
    axios.get('/api/barobill/status').then(function(r) {
      var d = r.data.data || {};
      var area = document.getElementById('bbStatusArea');
      var mode = d.isTest ? '<span class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">테스트</span>' : '<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">운영</span>';
      area.innerHTML = '<div class="flex items-center justify-between">'
        + '<div class="flex items-center gap-3"><i class="fas fa-check-circle text-green-500"></i><span class="text-sm font-medium text-gray-700">바로빌 연결됨</span>' + mode + '</div>'
        + '<div class="text-sm text-gray-500">잔액: <span class="font-bold text-blue-600">' + (d.balance || 0).toLocaleString() + '원</span></div>'
        + '</div>';
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) || '연결 실패';
      document.getElementById('bbStatusArea').innerHTML = '<div class="flex items-center gap-2"><i class="fas fa-exclamation-circle text-red-500"></i><span class="text-sm text-red-600">' + msg + '</span></div>';
    });
  }

  function loadCards() {
    axios.get('/api/barobill/cards').then(function(r) {
      cards = r.data.data || [];
    }).catch(function() { cards = []; });
  }

  function loadBankAccounts() {
    axios.get('/api/barobill/bank-accounts').then(function(r) {
      bankAccounts = r.data.data || [];
    }).catch(function() { bankAccounts = []; });
  }

  // 카드 별칭 찾기
  function getCardLabel(cardNum) {
    var c = cards.find(function(x) { return x.CardNum === cardNum; });
    return c ? (c.Alias || c.CardCompanyName || cardNum.slice(-4)) : cardNum.slice(-4);
  }

  function getBankLabel(accountNum) {
    var a = bankAccounts.find(function(x) { return x.BankAccountNum === accountNum; });
    return a ? (a.Alias || a.BankName || accountNum.slice(-4)) : accountNum.slice(-4);
  }

  // ====== 카드 전체 조회 ======
  window.loadBBCardLogs = function() {
    var startDate = document.getElementById('bbCardDateStart').value;
    var endDate = document.getElementById('bbCardDateEnd').value;
    if (!startDate || !endDate) { showToast('시작일/종료일을 선택하세요', 'warning'); return; }
    if (startDate > endDate) { showToast('시작일이 종료일보다 뒤입니다', 'warning'); return; }
    if (!cards.length) { showToast('등록된 카드가 없습니다', 'warning'); return; }

    // 월 목록 추출 (기간이 여러 달에 걸칠 수 있음)
    var months = [];
    var cur = new Date(startDate + 'T00:00:00');
    var end = new Date(endDate + 'T00:00:00');
    while (cur <= end) {
      var ym = cur.getFullYear() + String(cur.getMonth() + 1).padStart(2, '0');
      if (months.indexOf(ym) === -1) months.push(ym);
      cur.setMonth(cur.getMonth() + 1);
    }

    var startNum = startDate.replace(/-/g, '');
    var endNum = endDate.replace(/-/g, '');

    var tbody = document.getElementById('bbCardBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>전체 카드 조회 중... (' + cards.length + '개 카드 × ' + months.length + '개월)</td></tr>';

    var promises = [];
    cards.forEach(function(c) {
      months.forEach(function(m) {
        promises.push(
          axios.get('/api/barobill/cards/logs?card_num=' + c.CardNum + '&month=' + m)
            .then(function(r) {
              var items = (r.data.data && r.data.data.items) || [];
              // 기간 필터 (월 단위 조회이므로 시작일/종료일 바깥 제거)
              items = items.filter(function(item) {
                var dt = (item.UseDT || '').slice(0, 8);
                return dt >= startNum && dt <= endNum;
              });
              items.forEach(function(item) { item._cardNum = c.CardNum; });
              return items;
            })
            .catch(function() { return []; })
        );
      });
    });

    Promise.all(promises).then(function(results) {
      allCardLogs = [];
      results.forEach(function(items) { allCardLogs = allCardLogs.concat(items); });
      allCardLogs.sort(function(a, b) { return (b.UseDT || '').localeCompare(a.UseDT || ''); });

      cardFilterSet = new Set(cards.map(function(c) { return c.CardNum; }));
      renderCardFilters();
      renderCardTable();
    });
  };

  function renderCardFilters() {
    var area = document.getElementById('bbCardFilters');
    var html = '';
    cards.forEach(function(c) {
      var active = cardFilterSet.has(c.CardNum);
      var label = c.Alias || c.CardCompanyName || c.CardNum.slice(-4);
      html += '<button onclick="toggleCardFilter(\'' + c.CardNum + '\')" class="text-xs px-2.5 py-1 rounded-full border cursor-pointer transition '
        + (active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-300')
        + '">' + esc(label) + '</button>';
    });
    area.innerHTML = html;
  }

  window.toggleCardFilter = function(cardNum) {
    if (cardFilterSet.has(cardNum)) cardFilterSet.delete(cardNum);
    else cardFilterSet.add(cardNum);
    renderCardFilters();
    renderCardTable();
  };

  function renderCardTable() {
    var filtered = allCardLogs.filter(function(item) { return cardFilterSet.has(item._cardNum); });
    var tbody = document.getElementById('bbCardBody');

    // 합계
    var totalAmt = 0;
    filtered.forEach(function(item) {
      var amt = parseInt(item.ApprovalAmount || '0');
      var isCancel = (item.ApprovalType || '').includes('취소');
      totalAmt += isCancel ? -amt : amt;
    });
    document.getElementById('bbCardTotal').innerHTML = filtered.length + '건 / 합계 <span class="font-bold text-gray-800">' + totalAmt.toLocaleString() + '원</span>';

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">내역이 없습니다</td></tr>';
      return;
    }

    var html = '';
    filtered.forEach(function(item) {
      var dt = item.UseDT || '';
      var dateStr = dt.length >= 8 ? dt.slice(0,4)+'-'+dt.slice(4,6)+'-'+dt.slice(6,8) : '';
      var timeStr = dt.length >= 12 ? ' ' + dt.slice(8,10)+':'+dt.slice(10,12) : '';
      var amt = parseInt(item.ApprovalAmount || '0');
      var isCancel = (item.ApprovalType || '').includes('취소');
      var cardLabel = getCardLabel(item._cardNum);

      html += '<tr class="border-b border-gray-50">';
      html += '<td class="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">' + dateStr + timeStr + '</td>';
      html += '<td class="px-3 py-2"><span class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">' + esc(cardLabel) + '</span></td>';
      html += '<td class="px-3 py-2 font-medium">' + esc(item.UseStoreName || '') + '</td>';
      html += '<td class="px-3 py-2 text-right font-semibold ' + (isCancel ? 'text-red-600' : 'text-gray-800') + '">' + (isCancel ? '-' : '') + amt.toLocaleString() + '</td>';
      html += '<td class="px-3 py-2 text-center"><span class="text-xs px-1.5 py-0.5 rounded ' + (isCancel ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700') + '">' + (item.ApprovalType || '') + '</span></td>';
      html += '<td class="px-3 py-2 text-gray-500 text-xs">' + esc(item.UseStoreBizType || '') + '</td>';
      html += '</tr>';
    });
    tbody.innerHTML = html;
  }

  // ====== 통장 전체 조회 ======
  // 날짜 범위 → 일별 배열 생성
  function getDateRange(startStr, endStr) {
    var dates = [];
    var cur = new Date(startStr + 'T00:00:00');
    var end = new Date(endStr + 'T00:00:00');
    while (cur <= end) {
      var y = cur.getFullYear();
      var m = String(cur.getMonth() + 1).padStart(2, '0');
      var d = String(cur.getDate()).padStart(2, '0');
      dates.push(y + m + d);
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  window.loadBBBankLogs = function() {
    var startDate = document.getElementById('bbBankDateStart').value;
    var endDate = document.getElementById('bbBankDateEnd').value;
    var dir = document.getElementById('bbBankDir').value;
    if (!startDate || !endDate) { showToast('시작일/종료일을 선택하세요', 'warning'); return; }
    if (startDate > endDate) { showToast('시작일이 종료일보다 뒤입니다', 'warning'); return; }
    if (!bankAccounts.length) { showToast('등록된 계좌가 없습니다', 'warning'); return; }

    var dates = getDateRange(startDate, endDate);
    if (dates.length > 31) { showToast('최대 31일까지 조회 가능합니다', 'warning'); return; }

    var tbody = document.getElementById('bbBankBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>전체 계좌 조회 중... (' + bankAccounts.length + '개 계좌 × ' + dates.length + '일)</td></tr>';

    // 계좌 × 날짜 조합으로 병렬 호출
    var promises = [];
    bankAccounts.forEach(function(a) {
      dates.forEach(function(dateStr) {
        promises.push(
          axios.get('/api/barobill/bank-accounts/logs?account_num=' + a.BankAccountNum + '&date=' + dateStr + '&direction=' + dir)
            .then(function(r) {
              var items = (r.data.data && r.data.data.items) || [];
              items.forEach(function(item) { item._accountNum = a.BankAccountNum; });
              return items;
            })
            .catch(function() { return []; })
        );
      });
    });

    Promise.all(promises).then(function(results) {
      allBankLogs = [];
      results.forEach(function(items) { allBankLogs = allBankLogs.concat(items); });
      allBankLogs.sort(function(a, b) { return (b.TransDT || '').localeCompare(a.TransDT || ''); });

      bankFilterSet = new Set(bankAccounts.map(function(a) { return a.BankAccountNum; }));
      renderBankFilters();
      renderBankTable();
    });
  };

  function renderBankFilters() {
    var area = document.getElementById('bbBankFilters');
    var html = '';
    bankAccounts.forEach(function(a) {
      var active = bankFilterSet.has(a.BankAccountNum);
      var label = a.Alias || a.BankName || a.BankAccountNum.slice(-4);
      html += '<button onclick="toggleBankFilter(\'' + a.BankAccountNum + '\')" class="text-xs px-2.5 py-1 rounded-full border cursor-pointer transition '
        + (active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-300')
        + '">' + esc(label) + '</button>';
    });
    area.innerHTML = html;
  }

  window.toggleBankFilter = function(accountNum) {
    if (bankFilterSet.has(accountNum)) bankFilterSet.delete(accountNum);
    else bankFilterSet.add(accountNum);
    renderBankFilters();
    renderBankTable();
  };

  function renderBankTable() {
    var filtered = allBankLogs.filter(function(item) { return bankFilterSet.has(item._accountNum); });
    var tbody = document.getElementById('bbBankBody');

    var totalIn = 0, totalOut = 0;
    filtered.forEach(function(item) {
      totalIn += parseInt(item.Deposit || '0');
      totalOut += parseInt(item.Withdraw || '0');
    });
    document.getElementById('bbBankTotal').innerHTML = filtered.length + '건 / 입금 <span class="text-blue-600 font-bold">' + totalIn.toLocaleString() + '</span> 출금 <span class="text-red-600 font-bold">' + totalOut.toLocaleString() + '</span>';

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">내역이 없습니다</td></tr>';
      return;
    }

    var html = '';
    filtered.forEach(function(item) {
      var dt = item.TransDT || '';
      var timeStr = dt.length >= 12 ? dt.slice(8,10)+':'+dt.slice(10,12) : '';
      var deposit = parseInt(item.Deposit || '0');
      var withdraw = parseInt(item.Withdraw || '0');
      var balance = parseInt(item.Balance || '0');
      var remark = item.TransRemark1 || item.TransRemark2 || '';
      var accountLabel = getBankLabel(item._accountNum);

      html += '<tr class="border-b border-gray-50">';
      var dateStr = dt.length >= 8 ? dt.slice(4,6)+'/'+dt.slice(6,8) : '';
      html += '<td class="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">' + dateStr + ' ' + timeStr + '</td>';
      html += '<td class="px-3 py-2"><span class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">' + esc(accountLabel) + '</span></td>';
      html += '<td class="px-3 py-2 font-medium">' + esc(remark) + '</td>';
      html += '<td class="px-3 py-2 text-right ' + (deposit > 0 ? 'text-blue-600 font-semibold' : '') + '">' + (deposit > 0 ? '+' + deposit.toLocaleString() : '') + '</td>';
      html += '<td class="px-3 py-2 text-right ' + (withdraw > 0 ? 'text-red-600' : '') + '">' + (withdraw > 0 ? '-' + withdraw.toLocaleString() : '') + '</td>';
      html += '<td class="px-3 py-2 text-right text-gray-500 text-xs">' + balance.toLocaleString() + '</td>';
      html += '</tr>';
    });
    tbody.innerHTML = html;
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
