// Skeleton loading
(function() {
  var el = document.getElementById('txTableBody');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(8, 10);
})();

(function() {
  // State
  var transactions = [];
  var accounts = [];
  var currentTab = 'fund';
  var matchRules = {};
  var expenseCategories = [];

  // Tab switch
  var bankTabs = ['fund', 'tx', 'receivables', 'rules', 'accounts'];
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
    if (tab === 'fund') loadFundSummary();
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
        opt.textContent = a.account_alias
          ? a.account_alias + ' (' + a.bank_name + ' ' + a.account_number + ')'
          : a.bank_name + ' ' + a.account_number + ' (' + (a.account_holder || '') + ')';
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
      // 계좌 라벨: 별칭이 있으면 '별칭 · 은행명', 없으면 은행명(폴백 예금주)
      var accountLabel = tx.account_alias
        ? tx.account_alias + (tx.bank_name ? ' · ' + tx.bank_name : '')
        : (tx.bank_name || tx.account_holder || '');
      var dateStr = tx.transaction_date || '';
      if (dateStr.length === 8) dateStr = dateStr.slice(0,4) + '-' + dateStr.slice(4,6) + '-' + dateStr.slice(6,8);

      // 거래처/비용분류/고정비 매칭 영역
      var matchedClient = '';
      var hasCatOrFixed = tx.matched_category_id || tx.matched_fixed_expense_id;
      if (tx.transfer_pair_id) {
        matchedClient = '<span class="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded" style="background:#e0e7ff;color:#3730a3"><i class="fas fa-right-left mr-1 text-[8px]"></i>계좌이체</span>';
      } else if (tx.match_status === 'APPLIED' && hasCatOrFixed) {
        var catColor = tx.matched_category_color || '#6d28d9';
        var appliedLabel = (tx.matched_fixed_expense_id && tx.matched_fixed_expense_name)
          ? '고정비: ' + tx.matched_fixed_expense_name
          : (tx.matched_category_name || '비용분류');
        var appliedIcon = tx.matched_fixed_expense_id ? 'repeat' : 'tag';
        matchedClient = '<span class="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded" style="background:' + catColor + '20;color:' + catColor + '"><i class="fas fa-' + appliedIcon + ' mr-1 text-[8px]"></i>' + escHtml(appliedLabel) + '</span>';
      } else if (tx.match_status === 'APPLIED' && tx.matched_client_name) {
        matchedClient = '<span class="text-sm text-gray-700 font-medium">' + escHtml(tx.matched_client_name) + '</span>';
      } else if (['SUGGESTED', 'CONFIRMED'].indexOf(tx.match_status) >= 0 && hasCatOrFixed) {
        matchedClient = buildFixedSuggestion(tx);
      } else if (['SUGGESTED', 'UNMATCHED', 'CONFIRMED'].indexOf(tx.match_status) >= 0) {
        matchedClient = buildMatchSearch(tx);
      }

      html += '<tr class="tx-row">';
      html += '<td><input type="checkbox" class="tx-check" data-id="' + tx.id + '"></td>';
      html += '<td class="text-gray-600 text-xs whitespace-nowrap">' + dateStr + '</td>';
      html += '<td><span class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">' + escHtml(accountLabel) + '</span></td>';
      html += '<td class="font-medium text-gray-800" title="' + escHtml(tx.counterpart_name || tx.description || '') + '">' + escHtml(tx.counterpart_name || tx.description || '') + '</td>';
      html += '<td class="text-right font-semibold tabular-nums ' + (isDeposit ? 'text-blue-600' : '') + '">' + (isDeposit ? '+' + amt.toLocaleString() : '') + '</td>';
      html += '<td class="text-right tabular-nums ' + (!isDeposit ? 'text-red-600' : '') + '">' + (!isDeposit ? '-' + amt.toLocaleString() : '') + '</td>';
      var bal = tx.balance_after != null ? Number(tx.balance_after).toLocaleString() : '';
      html += '<td class="text-right text-xs text-gray-500 tabular-nums">' + bal + '</td>';
      html += '<td class="text-center">' + badge + '</td>';
      // ds-wrap: td 기본 overflow:hidden이 셀 내 절대배치 드롭다운(거래처/비용분류)을 잘라버림 → 해제
      html += '<td class="ds-wrap">' + matchedClient + '</td>';
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
      html += '<div class="text-xs text-gray-500 mt-0.5"><i class="fas fa-robot mr-1"></i>추천</div>';
    }
    return html;
  }

  // 드롭다운 위치 보정: 스크롤 영역 하단이라 아래 공간이 부족하면 입력 위로 플립
  // (인라인 스타일 사용 — Tailwind CDN 동적 클래스 생성 타이밍에 비의존)
  function positionTxDropdown(dd) {
    if (!dd) return;
    dd.style.top = '100%';
    dd.style.bottom = 'auto';
    dd.style.marginBottom = '0';
    var anchor = dd.parentElement; // .relative 래퍼
    if (!anchor) return;
    var scroller = anchor.closest('.overflow-x-auto');
    var ar = anchor.getBoundingClientRect();
    var limitBottom = scroller ? Math.min(scroller.getBoundingClientRect().bottom, window.innerHeight) : window.innerHeight;
    var limitTop = scroller ? Math.max(scroller.getBoundingClientRect().top, 0) : 0;
    var ddH = Math.min(dd.scrollHeight, 192) + 8; // max-h-48 = 192px
    var spaceBelow = limitBottom - ar.bottom;
    var spaceAbove = ar.top - limitTop;
    if (spaceBelow < ddH && spaceAbove > spaceBelow) {
      dd.style.top = 'auto';
      dd.style.bottom = '100%';
      dd.style.marginBottom = '4px';
    }
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
      positionTxDropdown(dropdown);
      return;
    }
    var html = '';
    filtered.forEach(function(cat) {
      var color = cat.color || '#6d28d9';
      html += '<div class="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-50" '
        + 'onclick="selectCategory(' + txId + ',' + cat.id + ',\'' + escHtml(cat.name).replace(/'/g, "\\'") + '\')">';
      html += '<span class="inline-block w-2 h-2 rounded-full mr-1.5" style="background:' + color + '"></span>';
      html += '<span class="font-medium">' + escHtml(cat.name) + '</span>';
      html += '</div>';
    });
    dropdown.innerHTML = html;
    dropdown.classList.remove('hidden');
    positionTxDropdown(dropdown);
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

    // 거래처 선택 = 모달(clientPicker). 좁은 인라인 드롭다운 대신 전체목록 브라우즈.
    var html = '<div style="width:140px;">';
    html += '<input type="text" class="form-input text-xs" style="width:100%;padding:4px 8px;cursor:pointer;background:#fff;" placeholder="거래처 선택..." readonly';
    html += ' id="clientSearch_' + tx.id + '" value="' + escHtml(presetName) + '"';
    html += ' onclick="openRowClientPicker(' + tx.id + ')">';
    html += '<input type="hidden" id="clientId_' + tx.id + '" value="' + presetId + '">';
    html += '</div>';

    if (suggestedClient && !tx.matched_client_id) {
      html += '<div class="text-xs text-blue-500 mt-0.5"><i class="fas fa-robot mr-1"></i>추천</div>';
    }

    return html;
  }

  // in-row 거래처 선택 → 재사용 모달 열기, 선택 시 행의 hidden clientId 채움
  window.openRowClientPicker = function(txId) {
    var cur = document.getElementById('clientSearch_' + txId);
    openClientPicker(function(id, name) {
      var s = document.getElementById('clientSearch_' + txId);
      var h = document.getElementById('clientId_' + txId);
      if (s) s.value = name;
      if (h) h.value = id;
    }, cur ? cur.value : '');
  };

  // 비용분류/고정비 자동 제안 렌더 (확정=사람이 클릭)
  function buildFixedSuggestion(tx) {
    var isFixed = !!tx.matched_fixed_expense_id;
    var color = tx.matched_category_color || (isFixed ? '#0f766e' : '#6d28d9');
    var label = isFixed
      ? (tx.matched_fixed_expense_name ? '고정비: ' + tx.matched_fixed_expense_name : '고정비')
      : (tx.matched_category_name || '비용분류');
    var catId = tx.matched_category_id || 'null';
    var feId = tx.matched_fixed_expense_id || 'null';
    var html = '<div class="flex items-center gap-1" style="min-width:150px;">';
    html += '<span class="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded" style="background:' + color + '20;color:' + color + '" title="' + escHtml(tx.match_reason || '자동 제안') + '"><i class="fas fa-' + (isFixed ? 'repeat' : 'tag') + ' mr-1 text-[8px]"></i>' + escHtml(label) + '</span>';
    html += '<button class="btn-sm btn-match" style="font-size:11px;padding:2px 6px;" title="확정" onclick="confirmSuggestedCategory(' + tx.id + ',' + catId + ',' + feId + ')"><i class="fas fa-check text-[8px]"></i></button>';
    html += '<button class="btn-sm btn-unmatch" style="font-size:11px;padding:2px 6px;" title="다르게 매칭" onclick="rejectSuggestion(' + tx.id + ')"><i class="fas fa-pen text-[8px]"></i></button>';
    html += '</div>';
    return html;
  }

  // 제안 확정 → APPLIED (+고정비면 당월 실적 기록)
  window.confirmSuggestedCategory = function(txId, catId, feId) {
    var body = {};
    if (catId) body.category_id = catId;
    if (feId) body.fixed_expense_id = feId;
    axios.post('/api/bank/transactions/' + txId + '/match', body).then(function(r) {
      showToast((r.data && r.data.message) || '확정 완료', 'success');
      loadTransactions();
      loadStats();
      if (feId) loadFixedExpenseStatus();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '확정 실패';
      showToast(msg, 'error');
    });
  };

  // 제안 거절 → UNMATCHED로 되돌려 직접 매칭
  window.rejectSuggestion = function(txId) {
    axios.post('/api/bank/transactions/' + txId + '/unmatch').then(function() {
      loadTransactions();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '처리 실패';
      showToast(msg, 'error');
    });
  };

  // 비용분류 드롭다운 외부 클릭 시 닫기 (거래처는 모달로 전환됨)
  document.addEventListener('click', function(e) {
    var t = e.target;
    if (!t.closest('[id^="categorySearch_"]') && !t.closest('[id^="categoryDropdown_"]')) {
      document.querySelectorAll('[id^="categoryDropdown_"]:not(.hidden)').forEach(function(el) { el.classList.add('hidden'); });
    }
  });

  function buildActionCell(tx) {
    if (tx.transfer_pair_id) {
      return '<button class="btn-sm btn-unmatch" style="font-size:11px;" title="계좌이체 해제" onclick="unlinkTransfer(' + tx.id + ')">이체해제</button>';
    }
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

  // (⋯ 더보기 메뉴 제거: CSV 가져오기/내보내기는 액션바 인라인 버튼으로 노출)

  // #328: 구 sync-preview 블록(syncAll/showSyncPreview/confirmSync/closeSyncPreview) 제거
  //   — syncPreviewModal 마크업 부재 + 실제 진입점은 syncBarobillBank (dead code였음)

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

  // === 계좌간 이체 감지 → 확인 ===
  var transferPairs = [];
  window.detectTransfers = function() {
    var list = document.getElementById('transferList');
    document.getElementById('transferModal').classList.add('show');
    if (list) list.innerHTML = '<div class="px-3 py-8 text-center text-sm text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>감지 중...</div>';
    axios.post('/api/bank/transactions/detect-transfers').then(function(r) {
      transferPairs = (r.data.data && r.data.data.pairs) || [];
      renderTransferCandidates();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '이체 감지 실패';
      if (list) list.innerHTML = '<div class="px-3 py-8 text-center text-sm text-red-400">' + escHtml(msg) + '</div>';
    });
  };

  function renderTransferCandidates() {
    var list = document.getElementById('transferList');
    var allBtn = document.getElementById('transferConfirmAllBtn');
    if (!list) return;
    if (!transferPairs.filter(Boolean).length) {
      list.innerHTML = '<div class="px-3 py-8 text-center text-sm text-gray-400"><i class="fas fa-check-circle text-2xl mb-2 block text-gray-300"></i>감지된 이체 후보가 없습니다.</div>';
      if (allBtn) allBtn.style.display = 'none';
      return;
    }
    if (allBtn) allBtn.style.display = '';
    var html = '';
    transferPairs.forEach(function(p, i) {
      if (!p) return; // 이미 확정된 쌍은 건너뜀 (원 index 유지)
      var w = p.withdrawal, d = p.deposit;
      html += '<div class="px-4 py-3 border-b border-gray-50" id="transferRow_' + i + '">';
      html += '<div class="flex items-center justify-between gap-2">';
      html += '<div class="text-sm">';
      html += '<span class="inline-flex items-center gap-1"><span class="text-red-600 font-medium">' + escHtml(w.account_label || '') + '</span> <i class="fas fa-arrow-right text-gray-300 text-[10px]"></i> <span class="text-blue-600 font-medium">' + escHtml(d.account_label || '') + '</span></span>';
      html += '<div class="text-xs text-gray-400 mt-0.5">' + fmtDate8(w.transaction_date) + ' 출금 · ' + fmtDate8(d.transaction_date) + ' 입금 · ' + escHtml(w.counterpart_name || '') + '</div>';
      html += '</div>';
      html += '<div class="flex items-center gap-2">';
      html += '<span class="font-semibold tabular-nums text-gray-800">' + Number(p.amount).toLocaleString() + '원</span>';
      html += '<button class="btn-sm btn-match" style="font-size:11px;padding:3px 8px;" onclick="confirmTransfer(' + i + ')">확정</button>';
      html += '</div>';
      html += '</div></div>';
    });
    list.innerHTML = html;
  }

  window.confirmTransfer = function(i) {
    var p = transferPairs[i];
    if (!p) return;
    axios.post('/api/bank/transactions/confirm-transfer', { withdrawal_id: p.withdrawal.id, deposit_id: p.deposit.id }).then(function() {
      var row = document.getElementById('transferRow_' + i);
      if (row) row.innerHTML = '<div class="px-1 py-2 text-sm text-green-600"><i class="fas fa-check mr-1"></i>계좌이체로 확정됨</div>';
      transferPairs[i] = null;
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '이체 확정 실패';
      showToast(msg, 'error');
    });
  };

  window.confirmAllTransfers = function() {
    var tasks = [];
    transferPairs.forEach(function(p, i) {
      if (!p) return;
      tasks.push(
        axios.post('/api/bank/transactions/confirm-transfer', { withdrawal_id: p.withdrawal.id, deposit_id: p.deposit.id })
          .then(function() { transferPairs[i] = null; return true; })
          .catch(function() { return false; }) // 실패분은 transferPairs에 남겨 재시도 가능
      );
    });
    if (!tasks.length) { showToast('확정할 후보가 없습니다', 'warning'); return; }
    Promise.all(tasks).then(function(results) {
      var ok = results.filter(Boolean).length;
      var fail = results.length - ok;
      if (fail === 0) {
        showToast(ok + '건 계좌이체 처리됨', 'success');
        closeTransferModal(); // loadTransactions 포함
      } else {
        // 부분/전체 실패를 정직하게 보고 + 실패분만 목록 유지
        showToast(ok + '건 처리, ' + fail + '건 실패', ok > 0 ? 'warning' : 'error');
        loadTransactions();
        renderTransferCandidates();
      }
    });
  };

  window.closeTransferModal = function() {
    document.getElementById('transferModal').classList.remove('show');
    loadTransactions();
  };

  window.unlinkTransfer = async function(txId) {
    if (!(await showConfirm('계좌이체를 해제하고 두 거래를 미매칭으로 되돌리시겠습니까?'))) return;
    axios.post('/api/bank/transactions/' + txId + '/unlink-transfer').then(function() {
      showToast('계좌이체 해제됨', 'success');
      loadTransactions();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '해제 실패';
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

  window.closeApplyModal = function() {
    document.getElementById('applyModal').classList.remove('show');
  };

  // === 거래처 선택 모달 (재사용: in-row 매칭·입금적용·규칙수정 공용) ===
  var _clientPickerCb = null;
  var _clientPickerTimer = null;
  window.openClientPicker = function(onSelect, initialQuery) {
    _clientPickerCb = (typeof onSelect === 'function') ? onSelect : null;
    var modal = document.getElementById('clientPickerModal');
    var input = document.getElementById('clientPickerSearch');
    if (input) input.value = initialQuery || '';
    if (modal) modal.classList.add('show');
    clientPickerSearch(initialQuery || '');
    setTimeout(function() { if (input) input.focus(); }, 40);
  };
  window.closeClientPicker = function() {
    var modal = document.getElementById('clientPickerModal');
    if (modal) modal.classList.remove('show');
    _clientPickerCb = null;
  };
  window.clientPickerSearch = function(query) {
    if (_clientPickerTimer) clearTimeout(_clientPickerTimer);
    var list = document.getElementById('clientPickerList');
    if (!list) return;
    _clientPickerTimer = setTimeout(function() {
      axios.get('/api/bank/client-search?q=' + encodeURIComponent(query || '')).then(function(r) {
        var items = r.data.data || [];
        if (!items.length) {
          list.innerHTML = '<div class="px-3 py-8 text-center text-sm text-gray-400">검색 결과 없음</div>';
          return;
        }
        var html = '';
        items.forEach(function(cl) {
          var rep = cl.representative ? '<span class="text-xs text-gray-400 ml-2">' + escHtml(cl.representative) + '</span>' : '';
          var biz = cl.business_registration_number ? '<span class="text-[11px] text-gray-300 ml-2">' + escHtml(cl.business_registration_number) + '</span>' : '';
          var bal = (cl.balance && cl.balance > 0) ? '<span class="text-xs text-red-500 whitespace-nowrap">미수 ' + Number(cl.balance).toLocaleString() + '</span>' : '';
          html += '<div class="px-4 py-2.5 hover:bg-blue-50 cursor-pointer flex items-center justify-between gap-2 border-b border-gray-50" '
            + 'onclick="pickClient(' + cl.id + ',\'' + escHtml(cl.client_name).replace(/'/g, "\\'") + '\')">';
          html += '<span class="text-sm font-medium text-gray-800">' + escHtml(cl.client_name) + rep + biz + '</span>' + bal;
          html += '</div>';
        });
        list.innerHTML = html;
      }).catch(function() {
        list.innerHTML = '<div class="px-3 py-8 text-center text-sm text-red-400">검색 실패</div>';
      });
    }, 200);
  };
  window.pickClient = function(id, name) {
    if (_clientPickerCb) _clientPickerCb(id, name);
    closeClientPicker();
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

  // === 자금 현황 Tab ===
  function fmtWon(n) { return Number(n || 0).toLocaleString() + '원'; }
  function fmtDate8(s) {
    s = String(s || '');
    if (s.length === 8) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
    return s;
  }

  window.loadFundSummary = function() {
    var body = document.getElementById('fundAccountsBody');
    if (body) body.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>로딩 중...</td></tr>';
    axios.get('/api/bank/fund-summary').then(function(r) {
      renderFundSummary((r.data && r.data.data) || {});
    }).catch(function() {
      if (body) body.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-400">자금현황 로딩 실패</td></tr>';
    });
    loadFixedExpenseStatus();
  };

  function renderFundSummary(d) {
    var tb = document.getElementById('fundTotalBalance');
    var nf = document.getElementById('fundNetFunds');
    var lt = document.getElementById('fundLoanTotal');
    if (tb) tb.textContent = fmtWon(d.total_balance);
    if (nf) nf.textContent = fmtWon(d.net_funds);
    if (lt) lt.textContent = fmtWon(d.loan_total);
    var ac = document.getElementById('fundAccountCount');
    if (ac) ac.textContent = (d.accounts ? d.accounts.length : 0) + '개 계좌';
    var ln = document.getElementById('fundLoanNote');
    if (ln) ln.textContent = (d.loan_count || 0) + '건 · 자금예측에서 관리';

    var body = document.getElementById('fundAccountsBody');
    if (!body) return;
    var accts = d.accounts || [];
    if (!accts.length) {
      body.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400">등록된 계좌가 없습니다.</td></tr>';
      return;
    }
    var html = '';
    accts.forEach(function(a) {
      var label = a.account_alias
        ? escHtml(a.account_alias) + (a.bank_name ? ' · ' + escHtml(a.bank_name) : '')
        : escHtml(a.bank_name || '');
      var bal = a.current_balance != null ? fmtWon(a.current_balance) : '<span class="text-gray-400">미동기화</span>';
      var lastTx = a.last_tx_date ? fmtDate8(a.last_tx_date) : '-';
      var conn = a.barobill_registered
        ? '<span class="text-xs px-2 py-0.5 rounded" style="background:#d1fae5;color:#065f46;">바로빌</span>'
        : '<span class="text-xs text-gray-400">-</span>';
      html += '<tr class="border-b border-gray-50">';
      html += '<td class="px-3 py-2 font-medium text-gray-800">' + label + '</td>';
      html += '<td class="px-3 py-2 text-xs text-gray-500">' + escHtml(a.account_number || '') + (a.account_holder ? ' · ' + escHtml(a.account_holder) : '') + '</td>';
      html += '<td class="px-3 py-2 text-right font-semibold tabular-nums text-gray-800">' + bal + '</td>';
      html += '<td class="px-3 py-2 text-center text-xs text-gray-500">' + lastTx + '</td>';
      html += '<td class="px-3 py-2 text-center">' + conn + '</td>';
      html += '</tr>';
    });
    body.innerHTML = html;
  }

  function loadFixedExpenseStatus() {
    var body = document.getElementById('fundFixedBody');
    if (body) body.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>로딩 중...</td></tr>';
    axios.get('/api/bank/fixed-expense-status').then(function(r) {
      var d = (r.data && r.data.data) || {};
      var per = document.getElementById('fundFixedPeriod');
      if (per) per.textContent = d.period ? '(' + d.period + ')' : '';
      renderFixedStatus(d.items || []);
    }).catch(function() {
      if (body) body.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-red-400">고정비 현황 로딩 실패</td></tr>';
    });
  }

  function renderFixedStatus(items) {
    var body = document.getElementById('fundFixedBody');
    if (!body) return;
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-gray-400">등록된 월 고정비가 없습니다.</td></tr>';
      return;
    }
    var stMap = {
      PAID: '<span class="status-badge badge-applied">✓ 출금완료</span>',
      OVERDUE: '<span class="status-badge badge-ignored">⚠ 미출금</span>',
      PENDING: '<span class="status-badge badge-suggested">⏳ 예정</span>'
    };
    var html = '';
    items.forEach(function(it) {
      html += '<tr class="border-b border-gray-50">';
      html += '<td class="px-3 py-2 font-medium text-gray-800">' + escHtml(it.name || '') + '</td>';
      html += '<td class="px-3 py-2 text-xs text-gray-500">' + escHtml(it.category_label || it.category || '') + '</td>';
      html += '<td class="px-3 py-2 text-right tabular-nums text-gray-500">' + (it.estimated_amount != null ? fmtWon(it.estimated_amount) : '-') + '</td>';
      html += '<td class="px-3 py-2 text-right tabular-nums font-semibold ' + (it.actual_amount != null ? 'text-gray-800' : 'text-gray-300') + '">' + (it.actual_amount != null ? fmtWon(it.actual_amount) : '-') + '</td>';
      html += '<td class="px-3 py-2 text-center text-xs text-gray-500">' + (it.payment_day ? it.payment_day + '일' : '-') + '</td>';
      html += '<td class="px-3 py-2 text-center">' + (stMap[it.status] || '') + '</td>';
      html += '</tr>';
    });
    body.innerHTML = html;
  }

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
      var syncTime = a.last_synced_at ? formatKST(a.last_synced_at) : '동기화 안됨';
      var connBadge = a.barobill_registered
        ? ' <span class="ml-1 inline-block px-2 py-0.5 rounded text-xs font-medium" style="background:#d1fae5;color:#065f46;"><i class="fas fa-link mr-1"></i>바로빌 연동</span>'
        : '';
      html += '<div class="account-card">';
      html += '<div class="flex items-center gap-4">';
      html += '<div class="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center"><i class="fas fa-university text-blue-600"></i></div>';
      html += '<div>';
      var titleText = a.account_alias ? escHtml(a.account_alias) : escHtml(a.bank_name);
      var subBank = a.account_alias ? escHtml(a.bank_name) + ' · ' : '';
      html += '<div class="font-semibold text-gray-800">' + titleText + connBadge + '</div>';
      html += '<div class="text-sm text-gray-500">' + subBank + escHtml(a.account_number) + (a.account_holder ? ' · ' + escHtml(a.account_holder) : '') + '</div>';
      html += '<div class="text-xs text-gray-400 mt-1"><i class="fas fa-clock mr-1"></i>마지막 동기화: ' + syncTime + '</div>';
      html += '</div>';
      html += '</div>';
      html += '<div class="flex gap-2">';
      if (a.barobill_registered) {
        html += '<button class="btn-sm" style="background:#d1fae5;color:#065f46;" onclick="refreshAccount(' + a.id + ')"><i class="fas fa-sync-alt mr-1"></i>즉시조회</button>';
      }
      html += '<button class="btn-sm" style="background:#e0e7ff;color:#3730a3;" onclick="editAccount(' + a.id + ')"><i class="fas fa-edit mr-1"></i>수정</button>';
      html += '<button class="btn-sm btn-delete" onclick="deleteAccount(' + a.id + ')"><i class="fas fa-trash mr-1"></i>삭제</button>';
      html += '</div>';
      html += '</div>';
    });
    list.innerHTML = html;
  }

  window.deleteAccount = async function(id) {
    var acc = accounts.find(function(a) { return a.id === id; });
    var msg = (acc && acc.barobill_registered)
      ? '계좌를 비활성화하시겠습니까? 바로빌 수집도 함께 해지됩니다.'
      : '계좌를 비활성화하시겠습니까?';
    if (!(await showConfirm(msg, { danger: true }))) return;
    axios.delete('/api/bank/accounts/' + id).then(function() {
      showToast('계좌 삭제됨', 'success');
      loadAccounts();
      loadAccountFilter();
    }).catch(function(e) {
      var m = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '삭제 실패';
      showToast(m, 'error');
    });
  };

  // 바로빌 즉시조회 요청
  window.refreshAccount = function(id) {
    axios.post('/api/bank/accounts/' + id + '/refresh').then(function(r) {
      showToast((r && r.data && r.data.message) || '즉시조회 요청 완료', 'success');
    }).catch(function(e) {
      var m = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '즉시조회 실패';
      showToast(m, 'error');
    });
  };

  // Account modal (add/edit)
  // 바로빌 연동 인증정보 입력란 토글
  window.toggleAccBarobill = function() {
    var sync = document.getElementById('accBarobillSync');
    var fields = document.getElementById('accBarobillFields');
    if (fields) fields.classList.toggle('hidden', !(sync && sync.checked));
    if (sync && sync.checked) window.onAccBankChange();
  };

  // 은행별 계좌조회 등록 필수 인증항목 (백엔드 barobillCodes.getBankAuthRequirement와 동일 소스)
  var BANK_AUTH_REQ = {
    '0004': { pwd: true, webId: true, webPwd: false, hint: '국민은행: 계좌비밀번호 + 인터넷뱅킹 로그인 ID (조회 PW는 비움)' },
    '0088': { pwd: true, webId: true, webPwd: true, hint: '신한은행: 계좌비밀번호 + 조회전용(빠른조회) ID/PW' },
    '0031': { pwd: true, webId: true, webPwd: true, hint: '대구(아이엠)은행: 계좌비밀번호 + 조회전용 ID/PW' },
    '0048': { pwd: true, webId: true, webPwd: true, hint: '신협: 계좌비밀번호 + 조회전용 ID/PW' }
  };
  var BANK_AUTH_DEFAULT = { pwd: true, webId: false, webPwd: false, hint: '계좌비밀번호만 입력 (조회 ID/PW는 비움)' };

  // 은행 선택 시 필요항목 안내 + 필드 placeholder 갱신 (스무고개 방지)
  window.onAccBankChange = function() {
    var bankEl = document.getElementById('accBank');
    var hintBox = document.getElementById('accBankAuthHint');
    var hintText = document.getElementById('accBankAuthHintText');
    if (!bankEl) return;
    var code = bankEl.value;
    var req = BANK_AUTH_REQ[code] || BANK_AUTH_DEFAULT;
    if (hintBox && hintText) {
      if (!code) { hintBox.classList.add('hidden'); }
      else { hintText.textContent = '이 은행 필요항목 → ' + req.hint; hintBox.classList.remove('hidden'); }
    }
    var pwd = document.getElementById('accPassword');
    var webId = document.getElementById('accWebId');
    var webPwd = document.getElementById('accWebPwd');
    if (pwd) pwd.placeholder = req.pwd ? '필요: 계좌 비밀번호' : '이 은행은 비움';
    if (webId) webId.placeholder = req.webId ? (req.webPwd ? '필요: 조회전용 ID' : '필요: 인터넷뱅킹 ID') : '이 은행은 비움';
    if (webPwd) webPwd.placeholder = req.webPwd ? '필요: 조회전용 PW' : '이 은행은 비움';
  };

  // 경로 B — 바로빌 호스팅 등록/관리 화면 열기 (은행이 직접 검증, 필드 추측 불필요)
  window.openBarobillManageUrl = function(btn) {
    // 팝업 차단 방지: 클릭 즉시 빈 탭 확보 후 URL 주입
    var w = window.open('', '_blank');
    if (btn) { btn.disabled = true; }
    axios.get('/api/bank/barobill-manage-url').then(function(r) {
      var url = r && r.data && r.data.data && r.data.data.url;
      if (!url) throw new Error('URL 없음');
      if (w) { w.location = url; } else { window.location.href = url; }
      showToast('바로빌 등록 화면을 열었습니다. 등록 후 이 목록에서 동기화하세요.', 'info', 8000);
    }).catch(function(e) {
      if (w) { try { w.close(); } catch (x) {} }
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '바로빌 화면 URL을 가져오지 못했습니다.';
      showToast(msg, 'error', 10000);
    }).then(function() { if (btn) btn.disabled = false; });
  };

  function resetAccBarobill() {
    var sync = document.getElementById('accBarobillSync');
    if (sync) sync.checked = false;
    var fields = document.getElementById('accBarobillFields');
    if (fields) fields.classList.add('hidden');
    ['accIdentityNum','accPassword','accWebId','accWebPwd'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  window.openAddAccountModal = function() {
    document.getElementById('accEditId').value = '';
    document.getElementById('accountModalTitle').innerHTML = '<i class="fas fa-university text-blue-500 mr-2"></i>새 계좌 등록';
    document.getElementById('accSaveBtn').textContent = '등록';
    ['accBank','accNumber','accHolder','accAlias'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    resetAccBarobill();
    var sec = document.getElementById('accBarobillSection');
    if (sec) sec.classList.remove('hidden'); // 신규 등록 시에만 바로빌 연동 노출
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
    var aliasEl = document.getElementById('accAlias');
    if (aliasEl) aliasEl.value = acc.account_alias || '';
    resetAccBarobill();
    var sec = document.getElementById('accBarobillSection');
    if (sec) sec.classList.add('hidden'); // 수정 시 바로빌 재등록 미지원
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
    var aliasInput = document.getElementById('accAlias');
    var alias = aliasInput ? aliasInput.value.trim() : '';
    if (!bankCode) { showToast('은행을 선택하세요.', 'warning'); return; }
    if (!number) { showToast('계좌번호를 입력하세요.', 'warning'); return; }
    var body = {
      bank_code: bankCode,
      bank_name: bankName,
      account_number: number,
      account_holder: holder || null,
      account_alias: alias  // 빈 문자열 전송 = 별칭 해제
    };
    // 바로빌 자동 연동 (신규 등록 시에만)
    var syncEl = document.getElementById('accBarobillSync');
    if (!editId && syncEl && syncEl.checked) {
      var identity = document.getElementById('accIdentityNum').value.trim();
      var pwd = document.getElementById('accPassword').value;
      var webId = document.getElementById('accWebId').value.trim();
      var webPwd = document.getElementById('accWebPwd').value;
      var typeEl = document.getElementById('accType');
      var accType = typeEl ? typeEl.value : 'C';
      // 은행별 필수 인증항목 검증 (백엔드와 동일 소스). 뭘 채워야 하는지 명시.
      var req = BANK_AUTH_REQ[bankCode] || BANK_AUTH_DEFAULT;
      var missing = [];
      if (!identity) missing.push(accType === 'P' ? '예금주 생년월일 6자리' : '예금주 사업자번호');
      if (req.pwd && !pwd) missing.push('계좌비밀번호');
      if (req.webId && !webId) missing.push(req.webPwd ? '조회전용 ID' : '인터넷뱅킹 ID');
      if (req.webPwd && !webPwd) missing.push('조회전용 PW');
      if (missing.length) {
        showToast(bankName + ' 필요항목이 비었습니다: ' + missing.join(', ') + '. (' + req.hint + ')', 'warning'); return;
      }
      body.barobill_sync = true;
      body.identity_num = identity;
      body.account_password = pwd;
      body.web_id = webId;
      body.web_pwd = webPwd;
      body.account_type = accType;
      var cycleEl = document.getElementById('accCollectCycle');
      body.collect_cycle = cycleEl ? cycleEl.value : 'HOUR1';
    }
    var promise = editId
      ? axios.put('/api/bank/accounts/' + editId, body)
      : axios.post('/api/bank/accounts', body);
    promise.then(function(r) {
      showToast((r && r.data && r.data.message) || (editId ? '계좌 수정 완료' : '계좌 등록 완료'), 'success');
      closeAccountModal();
      loadAccountFilter();
      // 바로빌 신규 연동 시 이번 달 계좌내역 자동 수집 (일별 조회 부하 제한)
      if (!editId && body.barobill_sync) {
        showToast('바로빌 계좌내역을 수집하는 중...', 'info');
        var aed = new Date();
        var first = new Date(aed.getFullYear(), aed.getMonth(), 1);
        // KST(로컬) 컴포넌트로 포맷 — toISOString은 UTC 변환이라 월초(00:00 KST)가 전월 말일로 9h 밀림
        var afmt = function(d){ var mm = ('0' + (d.getMonth() + 1)).slice(-2); var dd = ('0' + d.getDate()).slice(-2); return d.getFullYear() + '-' + mm + '-' + dd; };
        axios.post('/api/bank/sync-barobill', { date_start: afmt(first), date_end: afmt(aed) }).then(function(sr) {
          showToast((sr.data && sr.data.message) || '계좌내역 수집 완료', 'success');
          loadAccounts();
        }).catch(function(se) {
          var smsg = (se.response && se.response.data && se.response.data.error) ? se.response.data.error : '수집 실패';
          showToast('계좌내역 수집 실패: ' + smsg, 'warning');
          loadAccounts();
        });
      } else {
        loadAccounts();
      }
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '저장 실패';
      // 바로빌 실패 메시지는 여러 줄(필요항목/입력현황) — 줄바꿈 렌더링 + 오래 표시.
      showToast(String(msg).replace(/\n/g, '<br>'), 'error', 15000);
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
      var errs = (r.data && r.data.data && r.data.data.errors) || [];
      if (errs.length) {
        console.warn('[bank] 동기화 경고:', errs);
        showToast('⚠ 미수집 경고 ' + errs.length + '건: ' + errs.slice(0, 3).map(escHtml).join(' / '), 'warning');
      }
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
    tbody.innerHTML = '<tr><td colspan="10" class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>로딩 중...</td></tr>';

    axios.get('/api/bank/receivables').then(function(r) {
      var data = r.data.data || {};
      var summary = data.summary || {};
      var clientList = data.clients || [];

      // KPI
      document.getElementById('rcvTotal').textContent = (summary.total_receivable || 0).toLocaleString() + '원';
      var rcvExp = document.getElementById('rcvExpected');
      if (rcvExp) {
        rcvExp.textContent = (summary.total_expected_collection || 0).toLocaleString() + '원';
        rcvExp.title = '예상 손실(충당): ' + (summary.total_expected_loss || 0).toLocaleString() + '원';
      }
      document.getElementById('rcvNormal').textContent = (summary.aging_30 || 0) + '개사';
      document.getElementById('rcvWarning').textContent = (summary.aging_60 || 0) + '개사';
      document.getElementById('rcvDanger').textContent = (summary.aging_90 || 0) + '개사';
      document.getElementById('rcvCritical').textContent = ((summary.aging_over || 0) + (summary.no_payment || 0)) + '개사';

      if (!clientList.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-10 text-gray-400">미수금이 있는 거래처가 없습니다</td></tr>';
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
        html += '<td class="px-3 py-2 font-medium text-gray-800" title="' + escHtml(cl.client_name) + '">' + escHtml(cl.client_name) + '</td>';
        html += '<td class="px-3 py-2 text-sm text-gray-500" title="' + escHtml(cl.representative || '') + '">' + escHtml(cl.representative || '') + '</td>';
        html += '<td class="px-3 py-2 text-right font-semibold text-red-600 tabular-nums">' + Number(cl.balance).toLocaleString() + '원</td>';
        html += '<td class="px-3 py-2 text-center text-sm text-gray-600 tabular-nums">' + (cl.expected_payment_date || '-') + '</td>';
        html += '<td class="px-3 py-2 text-center text-sm tabular-nums text-gray-700">' + Math.round((cl.collection_rate != null ? cl.collection_rate : 1) * 100) + '%</td>';
        html += '<td class="px-3 py-2 text-right text-sm font-medium text-blue-600 tabular-nums">' + (cl.expected_collection != null ? Number(cl.expected_collection).toLocaleString() + '원' : '-') + '</td>';
        html += '<td class="px-3 py-2 text-center text-sm text-gray-600">' + (cl.last_payment_date || '-') + '</td>';
        html += '<td class="px-3 py-2 text-center text-sm text-gray-600">' + (cl.total_payments || 0) + '회</td>';
        html += '<td class="px-3 py-2 text-right text-sm tabular-nums">' + (cl.recent_90d_payments ? Number(cl.recent_90d_payments).toLocaleString() + '원' : '-') + '</td>';
        html += '<td class="px-3 py-2 text-center">' + agingBadge + '</td>';
        html += '</tr>';
      });
      tbody.innerHTML = html;
    }).catch(function() {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center py-8 text-red-400">미수금 현황 로딩 실패</td></tr>';
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

  // 규칙 모달 상태(방식/대상 토글)
  var ruleTargetType = 'client';
  var ruleMatchTypeVal = 'EXACT';

  function renderRulesTable() {
    var tbody = document.getElementById('rulesTableBody');
    if (!allRules.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-gray-400">등록된 매칭 규칙이 없습니다. 우측 상단 [규칙 추가]로 만들 수 있습니다.</td></tr>';
      return;
    }
    var html = '';
    allRules.forEach(function(rule) {
      var lastUsed = formatKST(rule.last_used_at, 'date');
      var isContains = (rule.match_type === 'CONTAINS');
      var mtBadge = isContains
        ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">부분일치</span>'
        : '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">완전일치</span>';
      html += '<tr class="tx-row">';
      html += '<td class="px-3 py-2 font-medium text-gray-800" title="' + escHtml(rule.counterpart_name) + '"><i class="fas fa-' + (isContains ? 'quote-right' : 'tag') + ' text-blue-400 mr-1 text-xs"></i>' + escHtml(rule.counterpart_name) + '</td>';
      html += '<td class="px-3 py-2 text-center">' + mtBadge + '</td>';
      var matchTarget = '';
      var matchTargetTitle = '';
      if (rule.matched_client_id && rule.client_name) {
        matchTarget = '<i class="fas fa-user text-blue-400 mr-1 text-xs"></i>' + escHtml(rule.client_name);
        matchTargetTitle = rule.client_name;
      } else if (rule.matched_category_id && rule.category_name) {
        matchTarget = '<i class="fas fa-tag text-gray-400 mr-1 text-xs"></i>' + escHtml(rule.category_name) + ' <span class="text-gray-400 text-xs">(비용분류)</span>';
        matchTargetTitle = rule.category_name;
      } else {
        matchTarget = '<span class="text-gray-400">(삭제됨)</span>';
      }
      html += '<td class="px-3 py-2 text-sm text-gray-700" title="' + escHtml(matchTargetTitle) + '">' + matchTarget + '</td>';
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

  function populateRuleCategoryDropdown(selectedId) {
    var sel = document.getElementById('ruleEditCategoryId');
    if (!sel) return;
    var html = '<option value="">비용분류 선택...</option>';
    (expenseCategories || []).forEach(function(cat) {
      html += '<option value="' + cat.id + '"' + (String(cat.id) === String(selectedId) ? ' selected' : '') + '>' + escHtml(cat.name) + '</option>';
    });
    sel.innerHTML = html;
  }

  window.setRuleMatchType = function(mt) {
    ruleMatchTypeVal = mt;
    var on = 'flex-1 px-3 py-2 text-sm rounded-lg border font-medium bg-blue-600 text-white border-blue-600';
    var off = 'flex-1 px-3 py-2 text-sm rounded-lg border font-medium bg-white text-gray-600 border-gray-300';
    var ex = document.getElementById('ruleMtExact');
    var co = document.getElementById('ruleMtContains');
    if (ex) ex.className = (mt === 'EXACT') ? on : off;
    if (co) co.className = (mt === 'CONTAINS') ? on : off;
    var hint = document.getElementById('ruleMatchTypeHint');
    if (hint) hint.textContent = (mt === 'CONTAINS')
      ? '부분일치: 적요에 이 키워드가 포함되면 매칭(매달 적요가 달라도 대응). 예: "전기요금"'
      : '완전일치: 적요가 키워드와 정확히 같을 때만 매칭.';
  };

  window.setRuleTarget = function(type) {
    ruleTargetType = type;
    var on = 'flex-1 px-3 py-2 text-sm rounded-lg border font-medium bg-blue-600 text-white border-blue-600';
    var off = 'flex-1 px-3 py-2 text-sm rounded-lg border font-medium bg-white text-gray-600 border-gray-300';
    var cb = document.getElementById('ruleTgtClient');
    var kb = document.getElementById('ruleTgtCategory');
    if (cb) cb.className = (type === 'client') ? on : off;
    if (kb) kb.className = (type === 'category') ? on : off;
    var clientBlock = document.getElementById('ruleClientBlock');
    var catBlock = document.getElementById('ruleCategoryBlock');
    if (clientBlock) clientBlock.classList.toggle('hidden', type !== 'client');
    if (catBlock) catBlock.classList.toggle('hidden', type !== 'category');
  };

  window.openAddRuleModal = function() {
    document.getElementById('ruleEditId').value = '';
    document.getElementById('ruleModalTitle').innerHTML = '<i class="fas fa-plus text-blue-500 mr-2"></i>매칭 규칙 추가';
    var nameEl = document.getElementById('ruleEditName');
    nameEl.value = '';
    nameEl.readOnly = false;
    nameEl.classList.remove('bg-gray-50');
    document.getElementById('ruleEditClientSearch').value = '';
    document.getElementById('ruleEditClientId').value = '';
    populateRuleCategoryDropdown('');
    setRuleMatchType('EXACT');
    setRuleTarget('client');
    document.getElementById('ruleEditModal').classList.add('show');
  };

  window.editRule = function(ruleId) {
    var rule = allRules.find(function(r) { return r.id === ruleId; });
    if (!rule) return;
    document.getElementById('ruleEditId').value = ruleId;
    document.getElementById('ruleModalTitle').innerHTML = '<i class="fas fa-edit text-blue-500 mr-2"></i>매칭 규칙 수정';
    var nameEl = document.getElementById('ruleEditName');
    nameEl.value = rule.counterpart_name;
    nameEl.readOnly = true; // 기존 규칙 키워드는 식별자라 변경 불가
    nameEl.classList.add('bg-gray-50');
    document.getElementById('ruleEditClientSearch').value = rule.client_name || '';
    document.getElementById('ruleEditClientId').value = rule.matched_client_id || '';
    populateRuleCategoryDropdown(rule.matched_category_id || '');
    setRuleMatchType(rule.match_type === 'CONTAINS' ? 'CONTAINS' : 'EXACT');
    setRuleTarget(rule.matched_category_id ? 'category' : 'client');
    document.getElementById('ruleEditModal').classList.add('show');
  };

  window.closeRuleEditModal = function() {
    document.getElementById('ruleEditModal').classList.remove('show');
  };

  window.saveRuleEdit = function() {
    var ruleId = document.getElementById('ruleEditId').value;
    var keyword = document.getElementById('ruleEditName').value.trim();
    var payload = { match_type: ruleMatchTypeVal };
    if (ruleTargetType === 'client') {
      var clientId = document.getElementById('ruleEditClientId').value;
      if (!clientId) { showToast('거래처를 선택하세요', 'warning'); return; }
      payload.matched_client_id = parseInt(clientId, 10);
    } else {
      var catId = document.getElementById('ruleEditCategoryId').value;
      if (!catId) { showToast('비용분류를 선택하세요', 'warning'); return; }
      payload.matched_category_id = parseInt(catId, 10);
    }

    var req;
    if (ruleId) {
      req = axios.put('/api/bank/match-rules/' + ruleId, payload);
    } else {
      if (!keyword) { showToast('키워드를 입력하세요', 'warning'); return; }
      payload.counterpart_name = keyword;
      req = axios.post('/api/bank/match-rules', payload);
    }
    req.then(function() {
      showToast(ruleId ? '규칙 수정 완료' : '규칙 추가 완료', 'success');
      closeRuleEditModal();
      loadRulesTable();
      loadMatchRules(); // 캐시도 갱신
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '저장 실패';
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
  // 기본 랜딩 탭 = 자금 현황
  loadFundSummary();

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
