// Skeleton loading
(function() {
  var el = document.getElementById('txTableBody');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(8, 10);
})();

(function() {
  // State
  var transactions = [];
  var accounts = [];
  var currentTab = 'tx';
  var matchRules = {};
  var expenseCategories = [];

  // Tab switch
  var bankTabs = ['tx', 'receivables', 'rules', 'accounts'];
  window.switchBankTab = function(tab) {
    currentTab = tab;
    bankTabs.forEach(function(t) {
      var content = document.getElementById('tabContent' + t.charAt(0).toUpperCase() + t.slice(1));
      var btn = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
      if (content) content.classList.toggle('active', t === tab);
      if (btn) {
        btn.classList.toggle('active', t === tab);
        btn.classList.toggle('border-blue-600', t === tab);
        btn.classList.toggle('text-blue-600', t === tab);
        btn.classList.toggle('border-transparent', t !== tab);
        btn.classList.toggle('text-gray-500', t !== tab);
      }
    });
    if (tab === 'accounts') loadAccounts();
    if (tab === 'receivables') loadReceivables();
    if (tab === 'rules') loadRulesTable();
  };

  // Status helpers
  function getStatusBadge(status) {
    var map = {
      'UNMATCHED': ['bg-gray-100 text-gray-600', 'far fa-clock', '미매칭'],
      'SUGGESTED': ['bg-amber-50 text-amber-700', 'fas fa-pause', '제안'],
      'CONFIRMED': ['bg-blue-50 text-blue-700', 'fas fa-check', '확인됨'],
      'APPLIED':   ['bg-green-50 text-green-700', 'fas fa-check-circle', '적용'],
      'IGNORED':   ['bg-gray-100 text-gray-400', 'fas fa-ban', '무시']
    };
    var info = map[status] || ['bg-gray-100 text-gray-600', 'far fa-clock', status];
    return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ' + info[0] + '">'
      + '<i class="' + info[1] + ' text-[7px] mr-1"></i>' + info[2] + '</span>';
  }

  // Date init
  (function initDates() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var firstDay = y + '-' + m + '-01';
    var lastDay = new Date(y, now.getMonth() + 1, 0);
    var lastStr = y + '-' + m + '-' + String(lastDay.getDate()).padStart(2, '0');
    document.getElementById('filterDateStart').value = firstDay;
    document.getElementById('filterDateEnd').value = lastStr;
  })();

  // Status tab switch
  var currentStatusTab = '';
  window.switchStatusTab = function(tab) {
    currentStatusTab = tab;
    document.getElementById('filterStatus').value = tab === 'PENDING' ? 'PENDING' : tab;

    var tabs = [
      { key: '', btnId: 'statusTabAll' },
      { key: 'PENDING', btnId: 'statusTabPending' },
      { key: 'APPLIED', btnId: 'statusTabApplied' },
      { key: 'IGNORED', btnId: 'statusTabIgnored' }
    ];
    tabs.forEach(function(t) {
      var btn = document.getElementById(t.btnId);
      if (!btn) return;
      if (t.key === tab) {
        btn.className = 'px-3 py-1 text-xs font-medium rounded-full bg-blue-600 text-white';
      } else {
        btn.className = 'px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200';
      }
    });
    loadTransactions();
  };

  // Load stats
  var autoSyncTriggered = false;
  function loadStats() {
    axios.get('/api/bank/stats').then(function(r) {
      var d = r.data.data || {};
      document.getElementById('kpiUnmatched').textContent = d.unmatched_count || 0;
      document.getElementById('kpiSuggested').textContent = d.suggested_count || 0;
      document.getElementById('kpiApplied').textContent = d.applied_count || 0;

      // Update tab counts
      var pending = (d.unmatched_count || 0) + (d.suggested_count || 0) + (d.confirmed_count || 0);
      var el;
      el = document.getElementById('statusCountAll');
      if (el) el.textContent = d.total_count ? '(' + d.total_count + ')' : '';
      el = document.getElementById('statusCountPending');
      if (el) el.textContent = pending ? '(' + pending + ')' : '';
      el = document.getElementById('statusCountApplied');
      if (el) el.textContent = d.applied_count ? '(' + d.applied_count + ')' : '';
      el = document.getElementById('statusCountIgnored');
      if (el) el.textContent = d.ignored_count ? '(' + d.ignored_count + ')' : '';

      // 자동 동기화: 마지막 동기화가 1시간 이상 지났으면 백그라운드 실행
      if (!autoSyncTriggered && d.last_sync) {
        var lastSyncTime = new Date(d.last_sync).getTime();
        var elapsed = Date.now() - lastSyncTime;
        if (elapsed > 60 * 60 * 1000) { // 1시간
          autoSyncTriggered = true;
          triggerAutoSync();
        }
      } else if (!autoSyncTriggered && !d.last_sync) {
        // 한번도 동기화 안 된 경우에도 실행
        autoSyncTriggered = true;
        triggerAutoSync();
      }
    }).catch(function() {
      // stats endpoint may not exist yet; silently ignore
    });
  }

  // 1시간 간격 자동 동기화 (페이지 열려있는 동안 반복)
  function triggerAutoSync() {
    console.log('[bank] 자동 동기화 시작');
    axios.post('/api/bank/auto-sync').then(function(r) {
      var d = r.data.data || {};
      if (d.inserted > 0) {
        showToast('자동 동기화: ' + d.inserted + '건 신규, ' + (d.matched || 0) + '건 자동매칭', 'success');
        loadTransactions();
      }
      loadStats();
    }).catch(function() {
      // 자동 동기화 실패는 조용히 무시
      console.warn('[bank] 자동 동기화 실패');
    });
  }

  // 1시간마다 반복 체크
  setInterval(function() {
    autoSyncTriggered = false;
    loadStats();
  }, 60 * 60 * 1000);

  // loadClients 제거 — openApplyModal에서 검색형 사용

  // Load accounts for filter dropdown
  function loadAccountFilter() {
    return axios.get('/api/bank/accounts').then(function(r) {
      accounts = r.data.data || r.data || [];
      var sel = document.getElementById('filterAccount');
      // preserve selection
      var prev = sel.value;
      sel.innerHTML = '<option value="">전체 계좌</option>';
      accounts.forEach(function(a) {
        var opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.bank_name + ' ' + a.account_number + ' (' + (a.account_holder || '') + ')';
        sel.appendChild(opt);
      });
      if (prev) sel.value = prev;
    }).catch(function() { accounts = []; });
  }

  // Load transactions
  window.loadTransactions = function() {
    var accountId = document.getElementById('filterAccount').value;
    var dateStart = document.getElementById('filterDateStart').value;
    var dateEnd = document.getElementById('filterDateEnd').value;
    var status = document.getElementById('filterStatus').value;
    var txType = document.getElementById('filterTxType').value;

    var params = [];
    if (accountId) params.push('account_id=' + encodeURIComponent(accountId));
    if (dateStart) params.push('date_start=' + encodeURIComponent(dateStart));
    if (dateEnd) params.push('date_end=' + encodeURIComponent(dateEnd));
    // PENDING = UNMATCHED + SUGGESTED + CONFIRMED (미반영)
    if (status === 'PENDING') {
      params.push('match_status=UNMATCHED');
      params.push('match_status=SUGGESTED');
      params.push('match_status=CONFIRMED');
    } else if (status) {
      params.push('match_status=' + encodeURIComponent(status));
    }
    if (txType) params.push('transaction_type=' + encodeURIComponent(txType));

    var url = '/api/bank/transactions' + (params.length ? '?' + params.join('&') : '');
    var tbody = document.getElementById('txTableBody');
    tbody.innerHTML = '<tr><td colspan="10" class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>로딩 중...</td></tr>';

    axios.get(url).then(function(r) {
      transactions = r.data.data || r.data || [];
      renderTransactions();
      loadStats();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '거래내역 로딩 실패';
      tbody.innerHTML = '<tr><td colspan="10" class="text-center py-8 text-red-400"><i class="fas fa-exclamation-circle mr-1"></i>' + msg + '</td></tr>';
    });
  };

  function renderTransactions() {
    var tbody = document.getElementById('txTableBody');
    if (!transactions.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center py-12">'
        + '<i class="fas fa-exchange-alt text-3xl mb-3 block text-gray-300"></i>'
        + '<div class="text-sm text-gray-500 mb-1">거래내역이 없습니다</div>'
        + '</td></tr>';
      return;
    }
    var html = '';
    transactions.forEach(function(tx) {
      var amt = Math.abs(parseFloat(tx.amount || 0));
      var isDeposit = tx.transaction_type === 'DEPOSIT';
      var badge = getStatusBadge(tx.match_status || 'UNMATCHED');
      var actionCell = buildActionCell(tx);
      var accountLabel = tx.account_holder || tx.bank_name || '';
      var dateStr = tx.transaction_date || '';
      if (dateStr.length === 8) dateStr = dateStr.slice(0,4) + '-' + dateStr.slice(4,6) + '-' + dateStr.slice(6,8);

      // 거래처/비용분류 매칭 영역
      var matchedClient = '';
      if (tx.match_status === 'APPLIED' && tx.matched_category_id && tx.matched_category_name) {
        var catColor = tx.matched_category_color || '#6d28d9';
        matchedClient = '<span class="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded" style="background:' + catColor + '20;color:' + catColor + '"><i class="fas fa-tag mr-1 text-[8px]"></i>' + escHtml(tx.matched_category_name) + '</span>';
      } else if (tx.match_status === 'APPLIED' && tx.matched_client_name) {
        matchedClient = '<span class="text-sm text-gray-700 font-medium">' + escHtml(tx.matched_client_name) + '</span>';
      } else if (['SUGGESTED', 'UNMATCHED', 'CONFIRMED'].indexOf(tx.match_status) >= 0) {
        matchedClient = buildMatchSearch(tx);
      }

      html += '<tr class="tx-row">';
      html += '<td><input type="checkbox" class="tx-check" data-id="' + tx.id + '"></td>';
      html += '<td class="text-gray-600 text-xs whitespace-nowrap">' + dateStr + '</td>';
      html += '<td><span class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">' + escHtml(accountLabel) + '</span></td>';
      html += '<td class="font-medium text-gray-800">' + escHtml(tx.counterpart_name || tx.description || '') + '</td>';
      html += '<td class="text-right font-semibold tabular-nums ' + (isDeposit ? 'text-blue-600' : '') + '">' + (isDeposit ? '+' + amt.toLocaleString() : '') + '</td>';
      html += '<td class="text-right tabular-nums ' + (!isDeposit ? 'text-red-600' : '') + '">' + (!isDeposit ? '-' + amt.toLocaleString() : '') + '</td>';
      var bal = tx.balance_after != null ? Number(tx.balance_after).toLocaleString() : '';
      html += '<td class="text-right text-xs text-gray-500 tabular-nums">' + bal + '</td>';
      html += '<td class="text-center">' + badge + '</td>';
      html += '<td>' + matchedClient + '</td>';
      html += '<td class="text-center">' + actionCell + '</td>';
      html += '</tr>';
    });
    tbody.innerHTML = html;
    // 카테고리 추천값은 buildCategorySelect에서 이미 value 설정됨
    bindCheckboxEvents();
    updateSelectionBar();
  }

  // 카테고리 목록 로드
  function loadExpenseCategories() {
    return axios.get('/api/bank/expense-categories').then(function(r) {
      expenseCategories = r.data.data || [];
    }).catch(function() { expenseCategories = []; });
  }

  // 거래처 OR 비용분류 통합 매칭 UI
  function buildMatchSearch(tx) {
    var suggestedRule = matchRules[tx.counterpart_name];

    // 이미 카테고리 규칙이 있으면 카테고리 모드로 시작
    var startWithCategory = !!(suggestedRule && suggestedRule.category_id && !suggestedRule.client_id);

    var html = '<div class="flex items-center gap-1" style="min-width:160px;">';

    // 토글 버튼
    html += '<button class="text-gray-400 hover:text-blue-500" style="font-size:10px;padding:2px;" '
      + 'title="거래처/비용분류 전환" '
      + 'onclick="toggleMatchType(' + tx.id + ')">'
      + '<i class="fas fa-exchange-alt"></i></button>';

    // 거래처 검색 (기본)
    html += '<div id="clientMode_' + tx.id + '"' + (startWithCategory ? ' class="hidden"' : '') + '>';
    html += buildClientSearch(tx);
    html += '</div>';

    // 카테고리 선택
    html += '<div id="categoryMode_' + tx.id + '"' + (!startWithCategory ? ' class="hidden"' : '') + '>';
    html += buildCategorySelect(tx, suggestedRule);
    html += '</div>';

    html += '</div>';
    return html;
  }

  function buildCategorySelect(tx, suggestedRule) {
    var presetId = '';
    var presetName = '';
    if (suggestedRule && suggestedRule.category_id) {
      presetId = suggestedRule.category_id;
      presetName = suggestedRule.category_name || '';
    }

    var html = '<div class="relative" style="width:140px;">';
    html += '<input type="text" class="form-input text-xs" style="width:100%;padding:4px 8px;" placeholder="비용분류..."';
    html += ' id="categorySearch_' + tx.id + '" value="' + escHtml(presetName) + '"';
    html += ' oninput="searchCategory(' + tx.id + ', this.value)"';
    html += ' onfocus="searchCategory(' + tx.id + ', this.value)"';
    html += '>';
    html += '<input type="hidden" id="categoryId_' + tx.id + '" value="' + presetId + '">';
    html += '<div id="categoryDropdown_' + tx.id + '" class="hidden absolute z-50 left-0 right-0 top-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"></div>';
    html += '</div>';

    if (presetId) {
      html += '<div class="text-xs text-purple-500 mt-0.5"><i class="fas fa-robot mr-1"></i>추천</div>';
    }
    return html;
  }

  // 비용분류 검색 (로컬 필터링, API 불필요)
  window.searchCategory = function(txId, query) {
    var dropdown = document.getElementById('categoryDropdown_' + txId);
    if (!dropdown) return;
    var q = (query || '').trim().toLowerCase();
    var filtered = q ? expenseCategories.filter(function(cat) {
      return cat.name.toLowerCase().indexOf(q) >= 0;
    }) : expenseCategories;

    if (!filtered.length) {
      dropdown.innerHTML = '<div class="px-3 py-2 text-xs text-gray-400">검색 결과 없음</div>';
      dropdown.classList.remove('hidden');
      return;
    }
    var html = '';
    filtered.forEach(function(cat) {
      var color = cat.color || '#6d28d9';
      html += '<div class="px-3 py-2 hover:bg-purple-50 cursor-pointer text-sm border-b border-gray-50" '
        + 'onclick="selectCategory(' + txId + ',' + cat.id + ',\'' + escHtml(cat.name).replace(/'/g, "\\'") + '\')">';
      html += '<span class="inline-block w-2 h-2 rounded-full mr-1.5" style="background:' + color + '"></span>';
      html += '<span class="font-medium">' + escHtml(cat.name) + '</span>';
      html += '</div>';
    });
    dropdown.innerHTML = html;
    dropdown.classList.remove('hidden');
  };

  window.selectCategory = function(txId, catId, catName) {
    document.getElementById('categorySearch_' + txId).value = catName;
    document.getElementById('categoryId_' + txId).value = catId;
    document.getElementById('categoryDropdown_' + txId).classList.add('hidden');
  };

  window.toggleMatchType = function(txId) {
    var clientMode = document.getElementById('clientMode_' + txId);
    var categoryMode = document.getElementById('categoryMode_' + txId);
    if (!clientMode || !categoryMode) return;
    clientMode.classList.toggle('hidden');
    categoryMode.classList.toggle('hidden');
  };

  // 거래처 검색 입력 방식
  function buildClientSearch(tx) {
    var suggestedClient = matchRules[tx.counterpart_name];
    var presetName = '';
    var presetId = '';

    if (tx.matched_client_id && tx.matched_client_name) {
      presetName = tx.matched_client_name;
      presetId = tx.matched_client_id;
    } else if (suggestedClient) {
      presetName = suggestedClient.client_name || '';
      presetId = suggestedClient.client_id || '';
    }

    var html = '<div class="relative" style="width:140px;">';
    html += '<input type="text" class="form-input text-xs" style="width:100%;padding:4px 8px;" placeholder="거래처..."';
    html += ' id="clientSearch_' + tx.id + '" value="' + escHtml(presetName) + '"';
    html += ' oninput="searchClient(' + tx.id + ', this.value)"';
    html += ' onfocus="searchClient(' + tx.id + ', this.value)"';
    html += '>';
    html += '<input type="hidden" id="clientId_' + tx.id + '" value="' + presetId + '">';
    html += '<div id="clientDropdown_' + tx.id + '" class="hidden absolute z-50 left-0 right-0 top-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"></div>';
    html += '</div>';

    if (suggestedClient && !tx.matched_client_id) {
      html += '<div class="text-xs text-blue-500 mt-0.5"><i class="fas fa-robot mr-1"></i>추천</div>';
    }

    return html;
  }

  // 거래처 검색 (디바운스)
  var searchTimers = {};
  window.searchClient = function(txId, query) {
    if (searchTimers[txId]) clearTimeout(searchTimers[txId]);
    var dropdown = document.getElementById('clientDropdown_' + txId);
    if (!query || query.length < 1) { dropdown.classList.add('hidden'); return; }

    searchTimers[txId] = setTimeout(function() {
      axios.get('/api/bank/client-search?q=' + encodeURIComponent(query)).then(function(r) {
        var items = r.data.data || [];
        if (!items.length) {
          dropdown.innerHTML = '<div class="px-3 py-2 text-xs text-gray-400">검색 결과 없음</div>';
          dropdown.classList.remove('hidden');
          return;
        }
        var html = '';
        items.forEach(function(cl) {
          var rep = cl.representative ? ' (' + escHtml(cl.representative) + ')' : '';
          var bal = cl.balance > 0 ? '<span class="text-red-500 text-xs ml-1">' + Number(cl.balance).toLocaleString() + '</span>' : '';
          html += '<div class="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-50" onclick="selectClient(' + txId + ',' + cl.id + ',\'' + escHtml(cl.client_name).replace(/'/g, "\\'") + '\')">';
          html += '<span class="font-medium">' + escHtml(cl.client_name) + '</span>' + rep + bal;
          html += '</div>';
        });
        dropdown.innerHTML = html;
        dropdown.classList.remove('hidden');
      }).catch(function() { dropdown.classList.add('hidden'); });
    }, 200);
  };

  window.selectClient = function(txId, clientId, clientName) {
    document.getElementById('clientSearch_' + txId).value = clientName;
    document.getElementById('clientId_' + txId).value = clientId;
    document.getElementById('clientDropdown_' + txId).classList.add('hidden');
  };

  // 드롭다운 외부 클릭 시 닫기
  document.addEventListener('click', function(e) {
    var t = e.target;
    if (!t.closest('[id^="clientSearch_"]') && !t.closest('[id^="clientDropdown_"]')) {
      document.querySelectorAll('[id^="clientDropdown_"]:not(.hidden)').forEach(function(el) { el.classList.add('hidden'); });
    }
    if (!t.closest('[id^="categorySearch_"]') && !t.closest('[id^="categoryDropdown_"]')) {
      document.querySelectorAll('[id^="categoryDropdown_"]:not(.hidden)').forEach(function(el) { el.classList.add('hidden'); });
    }
  });

  function buildActionCell(tx) {
    var st = tx.match_status || 'UNMATCHED';
    if (st === 'APPLIED') {
      return '<button class="btn-sm" style="background:#fef3c7;color:#92400e;font-size:11px;" onclick="unapplyTx(' + tx.id + ')"><i class="fas fa-undo text-[8px]"></i></button>';
    }
    if (st === 'IGNORED') {
      return '<button class="btn-sm btn-unmatch" style="font-size:11px;" onclick="unmatchTx(' + tx.id + ')">해제</button>';
    }
    // UNMATCHED / SUGGESTED / CONFIRMED
    return '<div class="flex gap-1"><button class="btn-sm btn-match" style="font-size:11px;padding:2px 6px;" onclick="matchTx(' + tx.id + ')"><i class="fas fa-check text-[8px]"></i></button>' +
           '<button class="btn-sm btn-ignore" style="font-size:11px;padding:2px 6px;" onclick="ignoreTx(' + tx.id + ')"><i class="fas fa-ban text-[8px]"></i></button></div>';
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Checkbox all
  window.toggleCheckAll = function(cb) {
    document.querySelectorAll('.tx-check').forEach(function(el) { el.checked = cb.checked; });
    updateSelectionBar();
  };

  // Floating selection bar
  function updateSelectionBar() {
    var checked = document.querySelectorAll('.tx-check:checked');
    var bar = document.getElementById('floatingSelectionBar');
    var countEl = document.getElementById('selectedCount');
    if (!bar) return;
    if (checked.length > 0) {
      bar.classList.remove('hidden');
      if (countEl) countEl.textContent = checked.length;
    } else {
      bar.classList.add('hidden');
    }
  }

  // 테이블 렌더 후 체크박스 이벤트 바인딩
  function bindCheckboxEvents() {
    document.querySelectorAll('.tx-check').forEach(function(el) {
      el.addEventListener('change', updateSelectionBar);
    });
  }

  window.clearSelection = function() {
    document.querySelectorAll('.tx-check').forEach(function(el) { el.checked = false; });
    var checkAll = document.getElementById('checkAll');
    if (checkAll) checkAll.checked = false;
    updateSelectionBar();
  };

  // More actions dropdown
  window.toggleMoreActions = function() {
    var menu = document.getElementById('moreActionsMenu');
    if (menu) menu.classList.toggle('hidden');
  };
  document.addEventListener('click', function(e) {
    var wrap = document.getElementById('moreActionsWrap');
    var menu = document.getElementById('moreActionsMenu');
    if (wrap && menu && !wrap.contains(e.target)) menu.classList.add('hidden');
  });

  // Sync all accounts
  window.syncAll = function() {
    if (!accounts.length) { showToast('등록된 계좌가 없습니다.', 'warning'); return; }

    var btn = document.querySelector('[onclick="syncAll()"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>미리보기 로딩...'; }

    // Call preview API for all accounts
    var promises = accounts.map(function(a) {
      return axios.post('/api/bank/accounts/' + a.id + '/sync-preview')
        .then(function(r) { return { account: a, preview: r.data.data }; })
        .catch(function(err) { return { account: a, error: err.message }; });
    });

    Promise.all(promises).then(function(results) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt mr-1"></i>동기화'; }
      showSyncPreview(results);
    });
  };

  function showSyncPreview(results) {
    var totalNew = 0, totalDup = 0;
    var previewHtml = '';

    results.forEach(function(r) {
      if (r.error) {
        previewHtml += '<div class="p-3 bg-red-50 rounded mb-2"><i class="fas fa-exclamation-circle text-red-500 mr-1"></i>' + r.account.bank_name + ' ' + r.account.account_number + ': 조회 실패</div>';
        return;
      }
      var p = r.preview;
      totalNew += p.new_count;
      totalDup += p.duplicate_count;

      previewHtml += '<div class="p-3 bg-white border rounded-lg mb-2">';
      previewHtml += '<div class="flex justify-between items-center mb-2">';
      previewHtml += '<span class="font-medium text-gray-800"><i class="fas fa-university text-blue-500 mr-1"></i>' + r.account.bank_name + ' ' + r.account.account_number + '</span>';
      previewHtml += '<span class="text-sm text-gray-500">' + (p.date_range ? p.date_range.start + ' ~ ' + p.date_range.end : '') + '</span>';
      previewHtml += '</div>';
      previewHtml += '<div class="flex gap-4 text-sm">';
      previewHtml += '<span class="text-blue-600 font-medium"><i class="fas fa-plus-circle mr-1"></i>신규 ' + p.new_count + '건</span>';
      previewHtml += '<span class="text-gray-400"><i class="fas fa-copy mr-1"></i>중복 ' + p.duplicate_count + '건</span>';
      previewHtml += '</div>';

      // Show first 5 new transactions as preview
      if (p.new_transactions && p.new_transactions.length > 0) {
        previewHtml += '<div class="mt-2 max-h-40 overflow-y-auto">';
        previewHtml += '<table class="w-full text-xs"><thead><tr class="bg-gray-50 text-gray-600"><th class="p-1 text-left">날짜</th><th class="p-1 text-left">입금자명</th><th class="p-1 text-right">금액</th></tr></thead><tbody>';
        p.new_transactions.slice(0, 10).forEach(function(tx) {
          var amt = tx.type === 'DEPOSIT' ? '+' + Number(tx.amount).toLocaleString() : '-' + Number(tx.amount).toLocaleString();
          var amtClass = tx.type === 'DEPOSIT' ? 'text-blue-600' : 'text-red-600';
          previewHtml += '<tr class="border-b border-gray-50"><td class="p-1 text-gray-500">' + tx.date + '</td><td class="p-1">' + (tx.counterpart || '') + '</td><td class="p-1 text-right ' + amtClass + '">' + amt + '원</td></tr>';
        });
        if (p.new_transactions.length > 10) {
          previewHtml += '<tr><td colspan="3" class="p-1 text-center text-gray-400">... 외 ' + (p.new_transactions.length - 10) + '건</td></tr>';
        }
        previewHtml += '</tbody></table></div>';
      }
      previewHtml += '</div>';
    });

    // Fill the preview modal
    document.getElementById('syncPreviewContent').innerHTML = previewHtml;
    document.getElementById('syncPreviewSummary').innerHTML =
      '<span class="text-blue-600 font-semibold">신규 ' + totalNew + '건</span> / ' +
      '<span class="text-gray-500">중복 ' + totalDup + '건</span>';

    // Show/hide confirm button
    var confirmBtn = document.getElementById('syncConfirmBtn');
    if (totalNew > 0) {
      confirmBtn.style.display = '';
      confirmBtn.onclick = function() { confirmSync(); };
    } else {
      confirmBtn.style.display = 'none';
    }

    document.getElementById('syncPreviewModal').classList.add('show');
  }

  function confirmSync() {
    document.getElementById('syncPreviewModal').classList.remove('show');

    // Now do the actual sync
    var promises = accounts.map(function(a) {
      return axios.post('/api/bank/accounts/' + a.id + '/sync')
        .catch(function(err) { console.error('[bank] sync fail id=' + a.id, err); });
    });
    Promise.all(promises).then(function() {
      showToast('동기화 완료', 'success');
      loadTransactions();
      loadStats();
    });
  }

  window.closeSyncPreview = function() {
    document.getElementById('syncPreviewModal').classList.remove('show');
  };

  // Auto match
  window.runAutoMatch = function() {
    axios.post('/api/bank/transactions/auto-match').then(function(r) {
      var cnt = (r.data.data && r.data.data.matched) ? r.data.data.matched : 0;
      showToast('자동매칭 완료: ' + cnt + '건 매칭됨', 'success');
      loadTransactions();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '자동매칭 실패';
      showToast(msg, 'error');
    });
  };

  // Batch match — 선택한 거래들을 각 행에서 지정한 거래처로 한번에 CONFIRMED
  window.batchMatch = async function() {
    var matches = [];
    document.querySelectorAll('.tx-check:checked').forEach(function(el) {
      var txId = parseInt(el.getAttribute('data-id'), 10);
      var clientInput = document.getElementById('clientId_' + txId);
      var clientId = clientInput ? parseInt(clientInput.value, 10) : 0;
      if (clientId) {
        matches.push({ transaction_id: txId, client_id: clientId });
      }
    });
    if (!matches.length) {
      showToast('매칭할 항목을 선택하고 거래처를 지정하세요.', 'warning');
      return;
    }
    if (!(await showConfirm(matches.length + '건을 일괄 매칭하시겠습니까?'))) return;
    axios.post('/api/bank/transactions/batch-match', { matches: matches }).then(function(r) {
      var d = r.data.data || {};
      showToast((d.succeeded || matches.length) + '건 매칭 완료', 'success');
      loadTransactions();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '일괄 매칭 실패';
      showToast(msg, 'error');
    });
  };

  // Batch apply — 선택한 거래들을 일괄 적용 (UI에서 선택한 거래처 매핑 포함)
  window.batchApply = async function() {
    var ids = [];
    var clientMap = {};
    document.querySelectorAll('.tx-check:checked').forEach(function(el) {
      var txId = parseInt(el.getAttribute('data-id'), 10);
      ids.push(txId);
      // UI에서 거래처를 선택한 경우 매핑 전송
      var clientInput = document.getElementById('clientId_' + txId);
      var clientId = clientInput ? parseInt(clientInput.value, 10) : 0;
      if (clientId) clientMap[String(txId)] = clientId;
    });
    if (!ids.length) { showToast('적용할 항목을 선택하세요.', 'warning'); return; }
    if (!(await showConfirm(ids.length + '건을 일괄 적용하시겠습니까?'))) return;
    axios.post('/api/bank/transactions/batch-apply', {
      transaction_ids: ids,
      client_map: Object.keys(clientMap).length ? clientMap : undefined
    }).then(function(r) {
      var d = r.data.data || {};
      var msg = (d.succeeded || 0) + '건 적용 완료';
      if (d.failed > 0) msg += ', ' + d.failed + '건 실패';
      showToast(msg, d.failed > 0 ? 'warning' : 'success');
      loadTransactions();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '일괄 적용 실패';
      showToast(msg, 'error');
    });
  };

  // Match / confirm
  window.matchTx = function(txId) {
    // 카테고리 모드 체크
    var categoryInput = document.getElementById('categoryId_' + txId);
    var categoryMode = document.getElementById('categoryMode_' + txId);
    var isCategoryMode = categoryMode && !categoryMode.classList.contains('hidden');
    var catId = categoryInput ? categoryInput.value : '';

    if (isCategoryMode && catId) {
      // 비용분류 → match (서버에서 바로 APPLIED 처리)
      axios.post('/api/bank/transactions/' + txId + '/match', { category_id: parseInt(catId, 10) }).then(function() {
        showToast('비용 분류 적용 완료', 'success');
        loadTransactions();
        loadStats();
      }).catch(function(e) {
        var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '처리 실패';
        showToast(msg, 'error');
      });
      return;
    }

    // 거래처 모드
    var hiddenInput = document.getElementById('clientId_' + txId);
    var clientId = hiddenInput ? hiddenInput.value : '';
    if (!clientId) {
      openApplyModal(txId, '');
      return;
    }
    axios.post('/api/bank/transactions/' + txId + '/match', { client_id: parseInt(clientId, 10) }).then(function() {
      openApplyModal(txId, clientId);
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '매칭 실패';
      showToast(msg, 'error');
    });
  };

  // Ignore
  window.ignoreTx = async function(txId) {
    if (!(await showConfirm('이 거래를 무시하시겠습니까?'))) return;
    axios.post('/api/bank/transactions/' + txId + '/ignore').then(function() {
      showToast('무시 처리됨', 'success');
      loadTransactions();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '처리 실패';
      showToast(msg, 'error');
    });
  };

  // Unmatch
  window.unmatchTx = async function(txId) {
    if (!(await showConfirm('매칭을 해제하고 미매칭 상태로 되돌리시겠습니까?'))) return;
    axios.post('/api/bank/transactions/' + txId + '/unmatch').then(function() {
      showToast('매칭 해제됨', 'success');
      loadTransactions();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '처리 실패';
      showToast(msg, 'error');
    });
  };

  // Apply modal — 검색형 거래처 선택
  function openApplyModal(txId, preClientId) {
    document.getElementById('applyTxId').value = txId;
    document.getElementById('applyClientId').value = preClientId || '';
    document.getElementById('applyNotes').value = '';

    // 기존 거래처명 가져오기
    var preClientName = '';
    if (preClientId) {
      var searchInput = document.getElementById('clientSearch_' + txId);
      if (searchInput) preClientName = searchInput.value;
    }
    var applySearch = document.getElementById('applyClientSearch');
    if (applySearch) applySearch.value = preClientName;

    document.getElementById('applyModal').classList.add('show');
  }

  // 적용 모달 거래처 검색
  var applySearchTimer = null;
  window.searchApplyClient = function(query) {
    if (applySearchTimer) clearTimeout(applySearchTimer);
    var dropdown = document.getElementById('applyClientDropdown');
    if (!query || query.length < 1) { dropdown.classList.add('hidden'); return; }

    applySearchTimer = setTimeout(function() {
      axios.get('/api/bank/client-search?q=' + encodeURIComponent(query)).then(function(r) {
        var items = r.data.data || [];
        if (!items.length) {
          dropdown.innerHTML = '<div class="px-3 py-2 text-xs text-gray-400">검색 결과 없음</div>';
          dropdown.classList.remove('hidden');
          return;
        }
        var html = '';
        items.forEach(function(cl) {
          var rep = cl.representative ? ' (' + escHtml(cl.representative) + ')' : '';
          html += '<div class="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-50" onclick="selectApplyClient(' + cl.id + ',\'' + escHtml(cl.client_name).replace(/'/g, "\\'") + '\')">';
          html += '<span class="font-medium">' + escHtml(cl.client_name) + '</span>' + rep;
          html += '</div>';
        });
        dropdown.innerHTML = html;
        dropdown.classList.remove('hidden');
      }).catch(function() { dropdown.classList.add('hidden'); });
    }, 200);
  };

  window.selectApplyClient = function(clientId, clientName) {
    document.getElementById('applyClientSearch').value = clientName;
    document.getElementById('applyClientId').value = clientId;
    document.getElementById('applyClientDropdown').classList.add('hidden');
  };

  window.closeApplyModal = function() {
    document.getElementById('applyModal').classList.remove('show');
    var dd = document.getElementById('applyClientDropdown');
    if (dd) dd.classList.add('hidden');
  };

  window.confirmApply = function() {
    var txId = document.getElementById('applyTxId').value;
    var clientId = document.getElementById('applyClientId').value;
    var paymentMethod = document.getElementById('applyPaymentMethod').value;
    var notes = document.getElementById('applyNotes').value;
    if (!clientId) { showToast('거래처를 선택하세요.', 'warning'); return; }
    axios.post('/api/bank/transactions/' + txId + '/apply', {
      client_id: parseInt(clientId, 10),
      payment_method: paymentMethod,
      notes: notes
    }).then(function() {
      showToast('입금 적용 완료', 'success');
      closeApplyModal();
      loadTransactions();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '적용 실패';
      showToast(msg, 'error');
    });
  };

  // === Accounts Tab ===
  function loadAccounts() {
    var list = document.getElementById('accountsList');
    list.innerHTML = '<div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>로딩 중...</div>';
    axios.get('/api/bank/accounts').then(function(r) {
      accounts = r.data.data || r.data || [];
      renderAccounts();
    }).catch(function() {
      list.innerHTML = '<div class="text-center py-8 text-red-400">계좌 목록 로딩 실패</div>';
    });
  }

  function renderAccounts() {
    var list = document.getElementById('accountsList');
    if (!accounts.length) {
      list.innerHTML = '<div class="text-center py-10 text-gray-400"><i class="fas fa-university text-4xl mb-3 block"></i>등록된 계좌가 없습니다.</div>';
      return;
    }
    var html = '';
    accounts.forEach(function(a) {
      var syncTime = a.last_synced_at ? new Date(a.last_synced_at).toLocaleString('ko-KR') : '동기화 안됨';
      var connBadge = '';
      html += '<div class="account-card">';
      html += '<div class="flex items-center gap-4">';
      html += '<div class="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center"><i class="fas fa-university text-blue-600"></i></div>';
      html += '<div>';
      html += '<div class="font-semibold text-gray-800">' + escHtml(a.bank_name) + connBadge + '</div>';
      html += '<div class="text-sm text-gray-500">' + escHtml(a.account_number) + (a.account_holder ? ' · ' + escHtml(a.account_holder) : '') + '</div>';
      html += '<div class="text-xs text-gray-400 mt-1"><i class="fas fa-clock mr-1"></i>마지막 동기화: ' + syncTime + '</div>';
      html += '</div>';
      html += '</div>';
      html += '<div class="flex gap-2">';
      html += '<button class="btn-sm" style="background:#e0e7ff;color:#3730a3;" onclick="editAccount(' + a.id + ')"><i class="fas fa-edit mr-1"></i>수정</button>';
      html += '<button class="btn-sm btn-delete" onclick="deleteAccount(' + a.id + ')"><i class="fas fa-trash mr-1"></i>삭제</button>';
      html += '</div>';
      html += '</div>';
    });
    list.innerHTML = html;
  }

  window.deleteAccount = async function(id) {
    if (!(await showConfirm('계좌를 비활성화하시겠습니까?', { danger: true }))) return;
    axios.delete('/api/bank/accounts/' + id).then(function() {
      showToast('계좌 삭제됨', 'success');
      loadAccounts();
      loadAccountFilter();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '삭제 실패';
      showToast(msg, 'error');
    });
  };

  // Account modal (add/edit)
  window.openAddAccountModal = function() {
    document.getElementById('accEditId').value = '';
    document.getElementById('accountModalTitle').innerHTML = '<i class="fas fa-university text-blue-500 mr-2"></i>새 계좌 등록';
    document.getElementById('accSaveBtn').textContent = '등록';
    ['accBank','accNumber','accHolder'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('accountModal').classList.add('show');
  };

  window.editAccount = function(id) {
    var acc = accounts.find(function(a) { return a.id === id; });
    if (!acc) return;
    document.getElementById('accEditId').value = id;
    document.getElementById('accountModalTitle').innerHTML = '<i class="fas fa-edit text-blue-500 mr-2"></i>계좌 수정';
    document.getElementById('accSaveBtn').textContent = '저장';
    document.getElementById('accBank').value = acc.bank_code || '';
    document.getElementById('accNumber').value = acc.account_number || '';
    document.getElementById('accHolder').value = acc.account_holder || '';
    document.getElementById('accountModal').classList.add('show');
  };

  window.closeAccountModal = function() {
    document.getElementById('accountModal').classList.remove('show');
  };

  window.saveAccount = function() {
    var editId = document.getElementById('accEditId').value;
    var bankSel = document.getElementById('accBank');
    var bankCode = bankSel.value;
    var bankName = bankSel.options[bankSel.selectedIndex].text;
    var number = document.getElementById('accNumber').value.trim();
    var holder = document.getElementById('accHolder').value.trim();
    if (!bankCode) { showToast('은행을 선택하세요.', 'warning'); return; }
    if (!number) { showToast('계좌번호를 입력하세요.', 'warning'); return; }
    var body = {
      bank_code: bankCode,
      bank_name: bankName,
      account_number: number,
      account_holder: holder || null
    };
    var promise = editId
      ? axios.put('/api/bank/accounts/' + editId, body)
      : axios.post('/api/bank/accounts', body);
    promise.then(function() {
      showToast(editId ? '계좌 수정 완료' : '계좌 등록 완료', 'success');
      closeAccountModal();
      loadAccounts();
      loadAccountFilter();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '저장 실패';
      showToast(msg, 'error');
    });
  };

  // Load match rules
  function loadMatchRules() {
    return axios.get('/api/bank/match-rules').then(function(r) {
      var rules = r.data.data || [];
      matchRules = {};
      rules.forEach(function(rule) {
        matchRules[rule.counterpart_name] = {
          client_id: rule.matched_client_id,
          client_name: rule.client_name,
          category_id: rule.matched_category_id,
          category_name: rule.category_name,
          count: rule.match_count
        };
      });
    }).catch(function() { matchRules = {}; });
  }

  // 바로빌 통장 동기화
  window.syncBarobillBank = function() {
    var startDate = document.getElementById('filterDateStart').value;
    var endDate = document.getElementById('filterDateEnd').value;
    if (!startDate || !endDate) { showToast('기간을 선택하세요', 'warning'); return; }

    var btn = document.getElementById('syncBarobillBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>동기화 중...'; }

    axios.post('/api/bank/sync-barobill', { date_start: startDate, date_end: endDate }).then(function(r) {
      showToast(r.data.message || '동기화 완료', 'success');
      loadTransactions();
      loadStats();
      loadAccountFilter();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) || '동기화 실패';
      showToast(msg, 'error');
    }).finally(function() {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt mr-1"></i>바로빌 동기화'; }
    });
  };

  // === Unapply (APPLIED 해제) ===
  window.unapplyTx = async function(txId) {
    if (!(await showConfirm('이 거래의 적용을 취소하시겠습니까?\n입금 기록이 삭제되고 거래처 잔액이 복원됩니다.', { danger: true }))) return;
    axios.post('/api/bank/transactions/' + txId + '/unapply').then(function() {
      showToast('적용 취소 완료 — 잔액 복원됨', 'success');
      loadTransactions();
      loadStats();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '취소 실패';
      showToast(msg, 'error');
    });
  };

  // === CSV 내보내기 ===
  window.exportCsv = function() {
    var accountId = document.getElementById('filterAccount').value;
    var dateStart = document.getElementById('filterDateStart').value;
    var dateEnd = document.getElementById('filterDateEnd').value;
    var status = document.getElementById('filterStatus').value;
    var txType = document.getElementById('filterTxType').value;

    var params = [];
    if (accountId) params.push('account_id=' + encodeURIComponent(accountId));
    if (dateStart) params.push('date_start=' + encodeURIComponent(dateStart));
    if (dateEnd) params.push('date_end=' + encodeURIComponent(dateEnd));
    if (status === 'PENDING') {
      params.push('match_status=UNMATCHED');
      params.push('match_status=SUGGESTED');
      params.push('match_status=CONFIRMED');
    } else if (status) {
      params.push('match_status=' + encodeURIComponent(status));
    }
    if (txType) params.push('transaction_type=' + encodeURIComponent(txType));

    var url = '/api/bank/transactions/export' + (params.length ? '?' + params.join('&') : '');
    window.open(url, '_blank');
  };

  // === 미수금 대시보드 ===
  function loadReceivables() {
    var tbody = document.getElementById('receivablesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>로딩 중...</td></tr>';

    axios.get('/api/bank/receivables').then(function(r) {
      var data = r.data.data || {};
      var summary = data.summary || {};
      var clientList = data.clients || [];

      // KPI
      document.getElementById('rcvTotal').textContent = (summary.total_receivable || 0).toLocaleString() + '원';
      document.getElementById('rcvNormal').textContent = (summary.aging_30 || 0) + '개사';
      document.getElementById('rcvWarning').textContent = (summary.aging_60 || 0) + '개사';
      document.getElementById('rcvDanger').textContent = (summary.aging_90 || 0) + '개사';
      document.getElementById('rcvCritical').textContent = ((summary.aging_over || 0) + (summary.no_payment || 0)) + '개사';

      if (!clientList.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-gray-400">미수금이 있는 거래처가 없습니다</td></tr>';
        return;
      }

      var html = '';
      clientList.forEach(function(cl) {
        var agingBadge = '';
        switch (cl.aging_category) {
          case 'normal':  agingBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">정상</span>'; break;
          case 'warning': agingBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700">주의</span>'; break;
          case 'danger':  agingBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700">위험</span>'; break;
          case 'critical': agingBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">장기미입금</span>'; break;
          case 'no_payment': agingBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">입금없음</span>'; break;
        }

        html += '<tr class="tx-row">';
        html += '<td class="px-3 py-2 font-medium text-gray-800">' + escHtml(cl.client_name) + '</td>';
        html += '<td class="px-3 py-2 text-sm text-gray-500">' + escHtml(cl.representative || '') + '</td>';
        html += '<td class="px-3 py-2 text-right font-semibold text-red-600 tabular-nums">' + Number(cl.balance).toLocaleString() + '원</td>';
        html += '<td class="px-3 py-2 text-center text-sm text-gray-600">' + (cl.last_payment_date || '-') + '</td>';
        html += '<td class="px-3 py-2 text-center text-sm text-gray-600">' + (cl.total_payments || 0) + '회</td>';
        html += '<td class="px-3 py-2 text-right text-sm tabular-nums">' + (cl.recent_90d_payments ? Number(cl.recent_90d_payments).toLocaleString() + '원' : '-') + '</td>';
        html += '<td class="px-3 py-2 text-center">' + agingBadge + '</td>';
        html += '</tr>';
      });
      tbody.innerHTML = html;
    }).catch(function() {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-400">미수금 현황 로딩 실패</td></tr>';
    });
  }

  // === 매칭 규칙 관리 ===
  var allRules = [];

  function loadRulesTable() {
    var tbody = document.getElementById('rulesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>로딩 중...</td></tr>';

    axios.get('/api/bank/match-rules').then(function(r) {
      allRules = r.data.data || [];
      renderRulesTable();
    }).catch(function() {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-400">규칙 로딩 실패</td></tr>';
    });
  }

  function renderRulesTable() {
    var tbody = document.getElementById('rulesTableBody');
    if (!allRules.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-gray-400">학습된 매칭 규칙이 없습니다</td></tr>';
      return;
    }
    var html = '';
    allRules.forEach(function(rule) {
      var lastUsed = rule.last_used_at ? new Date(rule.last_used_at).toLocaleDateString('ko-KR') : '-';
      html += '<tr class="tx-row">';
      html += '<td class="px-3 py-2 font-medium text-gray-800"><i class="fas fa-tag text-blue-400 mr-1 text-xs"></i>' + escHtml(rule.counterpart_name) + '</td>';
      var matchTarget = '';
      if (rule.matched_client_id && rule.client_name) {
        matchTarget = '<i class="fas fa-user text-blue-400 mr-1 text-xs"></i>' + escHtml(rule.client_name);
      } else if (rule.matched_category_id && rule.category_name) {
        matchTarget = '<i class="fas fa-tag text-purple-400 mr-1 text-xs"></i>' + escHtml(rule.category_name);
      } else {
        matchTarget = '<span class="text-gray-400">(삭제됨)</span>';
      }
      html += '<td class="px-3 py-2 text-sm text-gray-700">' + matchTarget + '</td>';
      html += '<td class="px-3 py-2 text-center"><span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">' + (rule.match_count || 0) + '회</span></td>';
      html += '<td class="px-3 py-2 text-center text-xs text-gray-500">' + lastUsed + '</td>';
      html += '<td class="px-3 py-2 text-center">';
      html += '<button class="btn-sm" style="background:#e0e7ff;color:#3730a3;" onclick="editRule(' + rule.id + ')"><i class="fas fa-edit"></i></button> ';
      html += '<button class="btn-sm btn-delete" onclick="deleteRule(' + rule.id + ')"><i class="fas fa-trash"></i></button>';
      html += '</td>';
      html += '</tr>';
    });
    tbody.innerHTML = html;
  }

  window.editRule = function(ruleId) {
    var rule = allRules.find(function(r) { return r.id === ruleId; });
    if (!rule) return;
    document.getElementById('ruleEditId').value = ruleId;
    document.getElementById('ruleEditName').value = rule.counterpart_name;
    document.getElementById('ruleEditClientSearch').value = rule.client_name || '';
    document.getElementById('ruleEditClientId').value = rule.matched_client_id || '';
    document.getElementById('ruleEditModal').classList.add('show');
  };

  window.closeRuleEditModal = function() {
    document.getElementById('ruleEditModal').classList.remove('show');
    document.getElementById('ruleEditClientDropdown').classList.add('hidden');
  };

  var ruleSearchTimer = null;
  window.searchRuleClient = function(query) {
    if (ruleSearchTimer) clearTimeout(ruleSearchTimer);
    var dropdown = document.getElementById('ruleEditClientDropdown');
    if (!query || query.length < 1) { dropdown.classList.add('hidden'); return; }

    ruleSearchTimer = setTimeout(function() {
      axios.get('/api/bank/client-search?q=' + encodeURIComponent(query)).then(function(r) {
        var items = r.data.data || [];
        if (!items.length) {
          dropdown.innerHTML = '<div class="px-3 py-2 text-xs text-gray-400">검색 결과 없음</div>';
          dropdown.classList.remove('hidden');
          return;
        }
        var html = '';
        items.forEach(function(cl) {
          html += '<div class="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-50" onclick="selectRuleClient(' + cl.id + ',\'' + escHtml(cl.client_name).replace(/'/g, "\\'") + '\')">';
          html += '<span class="font-medium">' + escHtml(cl.client_name) + '</span>';
          if (cl.representative) html += ' <span class="text-gray-400">(' + escHtml(cl.representative) + ')</span>';
          html += '</div>';
        });
        dropdown.innerHTML = html;
        dropdown.classList.remove('hidden');
      }).catch(function() { dropdown.classList.add('hidden'); });
    }, 200);
  };

  window.selectRuleClient = function(clientId, clientName) {
    document.getElementById('ruleEditClientSearch').value = clientName;
    document.getElementById('ruleEditClientId').value = clientId;
    document.getElementById('ruleEditClientDropdown').classList.add('hidden');
  };

  window.saveRuleEdit = function() {
    var ruleId = document.getElementById('ruleEditId').value;
    var clientId = document.getElementById('ruleEditClientId').value;
    if (!clientId) { showToast('거래처를 선택하세요', 'warning'); return; }

    axios.put('/api/bank/match-rules/' + ruleId, { matched_client_id: parseInt(clientId, 10) }).then(function() {
      showToast('규칙 수정 완료', 'success');
      closeRuleEditModal();
      loadRulesTable();
      loadMatchRules(); // 캐시도 갱신
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '수정 실패';
      showToast(msg, 'error');
    });
  };

  window.deleteRule = async function(ruleId) {
    if (!(await showConfirm('이 매칭 규칙을 삭제하시겠습니까?', { danger: true }))) return;
    axios.delete('/api/bank/match-rules/' + ruleId).then(function() {
      showToast('규칙 삭제됨', 'success');
      loadRulesTable();
      loadMatchRules();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '삭제 실패';
      showToast(msg, 'error');
    });
  };

  // 규칙 충돌 검사 — 같은 거래처에 여러 키워드 / 다른 거래처에 유사 키워드
  window.checkRuleConflicts = function() {
    var resultDiv = document.getElementById('ruleConflictResult');
    if (!allRules.length) {
      resultDiv.innerHTML = '<div class="p-4 bg-green-50 text-green-700 rounded-lg text-sm">학습된 규칙이 없습니다.</div>';
      resultDiv.classList.remove('hidden');
      return;
    }

    var conflicts = [];
    // 같은 counterpart_name이 다른 client를 가리키는 경우 (DB UNIQUE로 불가능하지만 방어)
    // 유사한 입금자명 감지 (2자 이하 차이)
    for (var i = 0; i < allRules.length; i++) {
      for (var j = i + 1; j < allRules.length; j++) {
        var a = allRules[i], b = allRules[j];
        var nameA = a.counterpart_name, nameB = b.counterpart_name;
        // 포함 관계 체크
        if (nameA.includes(nameB) || nameB.includes(nameA)) {
          if (a.matched_client_id !== b.matched_client_id) {
            conflicts.push({
              type: 'overlap',
              ruleA: a,
              ruleB: b,
              msg: '"' + nameA + '" ↔ "' + nameB + '": 유사한 키워드가 다른 거래처를 가리킵니다'
            });
          }
        }
      }
      // 삭제된 거래처 참조
      if (!allRules[i].client_name) {
        conflicts.push({
          type: 'orphan',
          ruleA: allRules[i],
          msg: '"' + allRules[i].counterpart_name + '": 삭제된 거래처를 참조합니다 (ID: ' + allRules[i].matched_client_id + ')'
        });
      }
    }

    if (!conflicts.length) {
      resultDiv.innerHTML = '<div class="p-4 bg-green-50 text-green-700 rounded-lg text-sm"><i class="fas fa-check-circle mr-1"></i>충돌 없음 — ' + allRules.length + '개 규칙 모두 정상</div>';
    } else {
      var html = '<div class="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">';
      html += '<div class="font-medium text-yellow-800 mb-2"><i class="fas fa-exclamation-triangle mr-1"></i>' + conflicts.length + '건의 잠재적 문제 발견</div>';
      html += '<ul class="space-y-1 text-sm text-yellow-700">';
      conflicts.forEach(function(c) {
        html += '<li><i class="fas fa-' + (c.type === 'orphan' ? 'unlink' : 'code-branch') + ' mr-1 text-xs"></i>' + escHtml(c.msg) + '</li>';
      });
      html += '</ul></div>';
      resultDiv.innerHTML = html;
    }
    resultDiv.classList.remove('hidden');
  };

  // 바로빌 연결 상태 표시
  function loadBarobillStatus() {
    var bar = document.getElementById('barobillStatusBar');
    if (!bar) return;
    axios.get('/api/barobill/status').then(function(r) {
      var d = r.data.data || {};
      var mode = d.isTest
        ? '<span class="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">테스트</span>'
        : '<span class="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">운영</span>';
      bar.className = 'flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-2 mb-4 text-sm';
      bar.innerHTML = '<div class="flex items-center gap-2"><i class="fas fa-check-circle text-green-500"></i><span class="font-medium text-gray-700">바로빌 연결됨</span>' + mode + '</div>'
        + '<span class="text-gray-500">포인트 잔액: <b class="text-blue-600">' + (d.balance || 0).toLocaleString() + '원</b></span>';
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) || '바로빌 미연결';
      bar.className = 'flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 mb-4 text-sm';
      bar.innerHTML = '<i class="fas fa-exclamation-circle text-gray-400"></i><span class="text-gray-500">' + escHtml(msg) + '</span>';
    });
  }

  // Init
  Promise.all([loadAccountFilter(), loadMatchRules(), loadExpenseCategories()]).then(function() {
    // 기본값: 미반영 탭
    switchStatusTab('PENDING');
  });
  loadBarobillStatus();

  // Close modals on overlay click
  document.getElementById('accountModal').addEventListener('click', function(e) {
    if (e.target === this) closeAccountModal();
  });
  document.getElementById('applyModal').addEventListener('click', function(e) {
    if (e.target === this) closeApplyModal();
  });
  document.getElementById('csvImportModal').addEventListener('click', function(e) {
    if (e.target === this) closeCsvImport();
  });
  var ruleModal = document.getElementById('ruleEditModal');
  if (ruleModal) ruleModal.addEventListener('click', function(e) {
    if (e.target === this) closeRuleEditModal();
  });

  // ===== CSV Import =====
  var csvParsedRows = [];
  var csvHeaders = [];
  var csvRawRows = [];

  window.openCsvImport = function() {
    // 계좌 드롭다운 채우기
    var sel = document.getElementById('csvAccountId');
    sel.innerHTML = '<option value="">계좌 선택</option>';
    accounts.forEach(function(a) {
      sel.innerHTML += '<option value="' + a.id + '">' + a.bank_name + ' ' + a.account_number + '</option>';
    });
    document.getElementById('csvStep1').classList.remove('hidden');
    document.getElementById('csvStep2').classList.add('hidden');
    document.getElementById('csvColumnMapping').classList.add('hidden');
    document.getElementById('csvFileInput').value = '';
    csvParsedRows = [];
    document.getElementById('csvImportModal').classList.add('show');
  };

  window.closeCsvImport = function() {
    document.getElementById('csvImportModal').classList.remove('show');
  };

  window.backToCsvStep1 = function() {
    document.getElementById('csvStep1').classList.remove('hidden');
    document.getElementById('csvStep2').classList.add('hidden');
  };

  window.parseCsvFile = function() {
    var file = document.getElementById('csvFileInput').files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(e) {
      var text = e.target.result;
      // BOM 제거
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      // 줄 분리
      var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
      if (lines.length < 2) { showToast('데이터가 없습니다', 'warning'); return; }

      // 헤더 찾기: 숫자가 아닌 첫 번째 줄을 헤더로
      var headerIdx = 0;
      for (var i = 0; i < Math.min(5, lines.length); i++) {
        var cols = splitCsvLine(lines[i]);
        // 날짜/거래/입금 같은 키워드가 있으면 헤더
        var joined = cols.join('');
        if (/날짜|거래일|일자|Date/i.test(joined)) { headerIdx = i; break; }
      }

      csvHeaders = splitCsvLine(lines[headerIdx]).map(function(h) { return h.trim(); });
      csvRawRows = [];
      for (var j = headerIdx + 1; j < lines.length; j++) {
        var cols = splitCsvLine(lines[j]);
        if (cols.length >= 2) csvRawRows.push(cols);
      }

      if (csvRawRows.length === 0) { showToast('파싱 가능한 데이터가 없습니다', 'warning'); return; }

      // 컬럼 매핑 UI
      populateMapping();
      document.getElementById('csvColumnMapping').classList.remove('hidden');

      // 자동매핑 시도 후 바로 미리보기
      autoDetectMapping();
      applyMapping();
    };
    // EUC-KR 시도 -> UTF-8 fallback
    reader.readAsText(file, 'EUC-KR');
  };

  function splitCsvLine(line) {
    // 간단한 CSV 파서 (큰따옴표 지원)
    var result = [];
    var current = '';
    var inQuote = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if ((ch === ',' || ch === '\t') && !inQuote) { result.push(current); current = ''; continue; }
      current += ch;
    }
    result.push(current);
    return result;
  }

  function populateMapping() {
    var selIds = ['mapDate', 'mapTime', 'mapDeposit', 'mapWithdrawal', 'mapBalance', 'mapCounterpart', 'mapDesc'];
    selIds.forEach(function(id) {
      var sel = document.getElementById(id);
      var hasEmpty = (id !== 'mapDate' && id !== 'mapDeposit');
      sel.innerHTML = hasEmpty ? '<option value="">없음</option>' : '<option value="">선택</option>';
      csvHeaders.forEach(function(h, idx) {
        sel.innerHTML += '<option value="' + idx + '">' + escHtml(h) + '</option>';
      });
    });
  }

  function autoDetectMapping() {
    var datePatterns = /날짜|거래일|일자|date/i;
    var timePatterns = /시간|시각|time/i;
    var depositPatterns = /입금|받은|입금액|credit/i;
    var withdrawalPatterns = /출금|보낸|출금액|debit|지급/i;
    var balancePatterns = /잔액|잔고|balance|거래후/i;
    var counterPatterns = /입금자|보낸이|상대|적요|거래처|이름|counterpart|memo|비고/i;
    var descPatterns = /내용|적요|메모|description|기재|의뢰/i;

    csvHeaders.forEach(function(h, idx) {
      if (datePatterns.test(h)) document.getElementById('mapDate').value = idx;
      else if (timePatterns.test(h)) document.getElementById('mapTime').value = idx;
      else if (depositPatterns.test(h) && !/출금/.test(h)) document.getElementById('mapDeposit').value = idx;
      else if (withdrawalPatterns.test(h)) document.getElementById('mapWithdrawal').value = idx;
      else if (balancePatterns.test(h)) document.getElementById('mapBalance').value = idx;
      else if (counterPatterns.test(h) && !descPatterns.test(h)) document.getElementById('mapCounterpart').value = idx;
      else if (descPatterns.test(h) && document.getElementById('mapCounterpart').value) document.getElementById('mapDesc').value = idx;
    });

    // 적요가 counterpart에도 desc에도 안 잡혔으면 적요를 counterpart로
    if (!document.getElementById('mapCounterpart').value) {
      csvHeaders.forEach(function(h, idx) {
        if (descPatterns.test(h)) document.getElementById('mapCounterpart').value = idx;
      });
    }
  }

  window.applyMapping = function() {
    var dateIdx = parseInt(document.getElementById('mapDate').value);
    var timeIdx = document.getElementById('mapTime').value ? parseInt(document.getElementById('mapTime').value) : -1;
    var depositIdx = parseInt(document.getElementById('mapDeposit').value);
    var withdrawalIdx = document.getElementById('mapWithdrawal').value ? parseInt(document.getElementById('mapWithdrawal').value) : -1;
    var balanceIdx = document.getElementById('mapBalance').value ? parseInt(document.getElementById('mapBalance').value) : -1;
    var counterIdx = document.getElementById('mapCounterpart').value ? parseInt(document.getElementById('mapCounterpart').value) : -1;
    var descIdx = document.getElementById('mapDesc').value ? parseInt(document.getElementById('mapDesc').value) : -1;

    if (isNaN(dateIdx) || isNaN(depositIdx)) {
      showToast('날짜와 입금 컬럼은 필수입니다', 'warning');
      return;
    }

    csvParsedRows = [];
    csvRawRows.forEach(function(cols) {
      var dateRaw = (cols[dateIdx] || '').trim();
      var date = parseDate(dateRaw);
      if (!date) return;

      var depositAmt = parseAmount(cols[depositIdx]);
      var withdrawalAmt = withdrawalIdx >= 0 ? parseAmount(cols[withdrawalIdx]) : 0;
      var amount = depositAmt || withdrawalAmt;
      if (!amount) return;

      var type = depositAmt > 0 ? 'DEPOSIT' : 'WITHDRAWAL';
      var time = timeIdx >= 0 ? (cols[timeIdx] || '').trim() : '';
      var balance = balanceIdx >= 0 ? parseAmount(cols[balanceIdx]) : null;
      var counterpart = counterIdx >= 0 ? (cols[counterIdx] || '').trim() : '';
      var desc = descIdx >= 0 ? (cols[descIdx] || '').trim() : '';

      csvParsedRows.push({
        transaction_date: date,
        transaction_time: time || null,
        transaction_type: type,
        amount: amount,
        balance_after: balance,
        counterpart_name: counterpart,
        description: desc
      });
    });

    // 미리보기
    renderCsvPreview();
    document.getElementById('csvStep1').classList.add('hidden');
    document.getElementById('csvStep2').classList.remove('hidden');
  };

  function parseDate(s) {
    // YYYY-MM-DD, YYYY.MM.DD, YYYYMMDD, YYYY/MM/DD
    var cleaned = s.replace(/[.\-\/]/g, '');
    if (/^\d{8}$/.test(cleaned)) return cleaned;
    // 20260522 형태로 변환 시도
    var m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
    if (m) return m[1] + m[2].padStart(2, '0') + m[3].padStart(2, '0');
    return null;
  }

  function parseAmount(s) {
    if (!s) return 0;
    // 콤마, 원, 공백 제거
    var n = String(s).replace(/[,\s원￦₩]/g, '').trim();
    var v = parseFloat(n);
    return isNaN(v) ? 0 : Math.abs(v);
  }

  function renderCsvPreview() {
    document.getElementById('csvPreviewCount').textContent = csvParsedRows.length;
    var tbody = document.getElementById('csvPreviewBody');
    var html = '';
    var show = csvParsedRows.slice(0, 50);
    show.forEach(function(r) {
      var d = r.transaction_date;
      var dateStr = d.slice(0,4) + '-' + d.slice(4,6) + '-' + d.slice(6,8);
      var isD = r.transaction_type === 'DEPOSIT';
      html += '<tr class="border-b border-gray-50">';
      html += '<td class="px-2 py-1 text-gray-600">' + dateStr + '</td>';
      html += '<td class="px-2 py-1">' + escHtml(r.counterpart_name || r.description || '') + '</td>';
      html += '<td class="px-2 py-1 text-right ' + (isD ? 'text-blue-600 font-medium' : '') + '">' + (isD ? '+' + r.amount.toLocaleString() : '') + '</td>';
      html += '<td class="px-2 py-1 text-right ' + (!isD ? 'text-red-600' : '') + '">' + (!isD ? '-' + r.amount.toLocaleString() : '') + '</td>';
      html += '<td class="px-2 py-1 text-right text-gray-500">' + (r.balance_after ? r.balance_after.toLocaleString() : '') + '</td>';
      html += '</tr>';
    });
    if (csvParsedRows.length > 50) {
      html += '<tr><td colspan="5" class="px-2 py-2 text-center text-gray-400 text-xs">... 외 ' + (csvParsedRows.length - 50) + '건</td></tr>';
    }
    tbody.innerHTML = html;
  }

  window.confirmCsvImport = function() {
    var accountId = document.getElementById('csvAccountId').value;
    if (!accountId) { showToast('계좌를 선택하세요', 'warning'); return; }
    if (!csvParsedRows.length) { showToast('가져올 데이터가 없습니다', 'warning'); return; }

    var btn = document.querySelector('[onclick="confirmCsvImport()"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>처리 중...'; }

    axios.post('/api/bank/transactions/import', {
      account_id: parseInt(accountId, 10),
      rows: csvParsedRows
    }).then(function(r) {
      var d = r.data.data || {};
      showToast(r.data.message || (d.inserted + '건 등록'), 'success');
      closeCsvImport();
      loadTransactions();
      loadStats();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) || 'CSV 가져오기 실패';
      showToast(msg, 'error');
    }).finally(function() {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload mr-1"></i>가져오기 실행'; }
    });
  };

})();
