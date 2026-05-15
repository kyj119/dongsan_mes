// Skeleton loading
(function() {
  var el = document.getElementById('txTableBody');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(8, 8);
})();

(function() {
  // State
  var clients = [];
  var transactions = [];
  var accounts = [];
  var currentTab = 'tx';
  var matchRules = {};

  // Tab switch
  window.switchBankTab = function(tab) {
    currentTab = tab;
    document.getElementById('tabContentTx').classList.toggle('active', tab === 'tx');
    document.getElementById('tabContentAccounts').classList.toggle('active', tab === 'accounts');
    document.getElementById('tabTx').classList.toggle('active', tab === 'tx');
    document.getElementById('tabTx').classList.toggle('border-blue-600', tab === 'tx');
    document.getElementById('tabTx').classList.toggle('text-blue-600', tab === 'tx');
    document.getElementById('tabTx').classList.toggle('border-transparent', tab !== 'tx');
    document.getElementById('tabTx').classList.toggle('text-gray-500', tab !== 'tx');
    document.getElementById('tabAccounts').classList.toggle('active', tab === 'accounts');
    document.getElementById('tabAccounts').classList.toggle('border-blue-600', tab === 'accounts');
    document.getElementById('tabAccounts').classList.toggle('text-blue-600', tab === 'accounts');
    document.getElementById('tabAccounts').classList.toggle('border-transparent', tab !== 'accounts');
    document.getElementById('tabAccounts').classList.toggle('text-gray-500', tab !== 'accounts');
    if (tab === 'accounts') loadAccounts();
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

  // Load stats
  function loadStats() {
    axios.get('/api/bank/stats').then(function(r) {
      var d = r.data.data || {};
      document.getElementById('kpiUnmatched').textContent = d.unmatched_count || 0;
      document.getElementById('kpiSuggested').textContent = d.suggested_count || 0;
      document.getElementById('kpiApplied').textContent = d.applied_count || 0;
    }).catch(function() {
      // stats endpoint may not exist yet; silently ignore
    });
  }

  // Load clients for dropdown
  function loadClients() {
    return axios.get('/api/clients?limit=500').then(function(r) {
      clients = (r.data.data && r.data.data.clients) ? r.data.data.clients : (r.data.clients || []);
    }).catch(function() { clients = []; });
  }

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
    var showW = document.getElementById('showWithdrawal').checked;

    var params = [];
    if (accountId) params.push('account_id=' + encodeURIComponent(accountId));
    if (dateStart) params.push('date_start=' + encodeURIComponent(dateStart));
    if (dateEnd) params.push('date_end=' + encodeURIComponent(dateEnd));
    if (status) params.push('match_status=' + encodeURIComponent(status));
    if (!showW) params.push('transaction_type=DEPOSIT');

    var url = '/api/bank/transactions' + (params.length ? '?' + params.join('&') : '');
    var tbody = document.getElementById('txTableBody');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>로딩 중...</td></tr>';

    axios.get(url).then(function(r) {
      transactions = r.data.data || r.data || [];
      renderTransactions();
      loadStats();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '거래내역 로딩 실패';
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-400"><i class="fas fa-exclamation-circle mr-1"></i>' + msg + '</td></tr>';
    });
  };

  function renderTransactions() {
    var tbody = document.getElementById('txTableBody');
    if (!transactions.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-12">'
        + '<i class="fas fa-exchange-alt text-3xl mb-3 block text-gray-300"></i>'
        + '<div class="text-sm text-gray-500 mb-1">거래내역이 없습니다</div>'
        + '</td></tr>';
      return;
    }
    var html = '';
    transactions.forEach(function(tx) {
      var amtClass = tx.amount < 0 ? 'text-red-600' : 'text-blue-700';
      var amtStr = (tx.amount < 0 ? '-' : '+') + Math.abs(parseFloat(tx.amount)).toLocaleString() + '원';
      var balStr = parseFloat(tx.balance_after || 0).toLocaleString() + '원';
      var badge = getStatusBadge(tx.match_status || 'UNMATCHED');
      var actionCell = buildActionCell(tx);
      var matchedClient = '';
      if (tx.match_status === 'APPLIED' && tx.matched_client_name) {
        matchedClient = '<span class="text-sm text-gray-700 font-medium">' + tx.matched_client_name + '</span>';
      } else if (tx.match_status === 'SUGGESTED' || tx.match_status === 'UNMATCHED' || tx.match_status === 'CONFIRMED') {
        matchedClient = buildClientSelect(tx);
      }
      html += '<tr class="tx-row">';
      html += '<td><input type="checkbox" class="tx-check" data-id="' + tx.id + '"></td>';
      html += '<td class="text-gray-600">' + (tx.transaction_date || '') + '</td>';
      html += '<td class="font-medium text-gray-800">' + escHtml(tx.counterpart_name || tx.description || '') + '</td>';
      html += '<td class="text-right font-semibold tabular-nums ' + amtClass + '">' + amtStr + '</td>';
      html += '<td class="text-right text-gray-500 tabular-nums">' + balStr + '</td>';
      html += '<td class="text-center">' + badge + '</td>';
      html += '<td>' + matchedClient + '</td>';
      html += '<td class="text-center">' + actionCell + '</td>';
      html += '</tr>';
    });
    tbody.innerHTML = html;
  }

  function buildClientSelect(tx) {
    // Check if there's a matching rule suggestion
    var suggestedClient = matchRules[tx.counterpart_name];

    var sel = '<select class="form-select text-sm" style="width:160px;" id="clientSel_' + tx.id + '"';
    if (suggestedClient) {
      sel += ' data-suggested="' + suggestedClient.client_id + '"';
    }
    sel += '>';
    sel += '<option value="">거래처 선택</option>';

    clients.forEach(function(cl) {
      var selected = '';
      if (tx.matched_client_id && tx.matched_client_id == cl.id) {
        selected = ' selected';
      } else if (!tx.matched_client_id && suggestedClient && suggestedClient.client_id == cl.id) {
        selected = ' selected';
      }
      sel += '<option value="' + cl.id + '"' + selected + '>' + escHtml(cl.client_name) + '</option>';
    });
    sel += '</select>';

    // Add rule indicator if suggested
    if (suggestedClient && !tx.matched_client_id) {
      sel += '<div class="text-xs text-blue-500 mt-0.5"><i class="fas fa-robot mr-1"></i>학습 추천</div>';
    }

    return sel;
  }

  function buildActionCell(tx) {
    var st = tx.match_status || 'UNMATCHED';
    if (st === 'APPLIED') {
      return '<span class="text-xs text-gray-400">완료</span>';
    }
    if (st === 'IGNORED') {
      return '<button class="btn-sm btn-unmatch" onclick="unmatchTx(' + tx.id + ')">매칭 해제</button>';
    }
    // UNMATCHED / SUGGESTED / CONFIRMED
    return '<button class="btn-sm btn-match mr-1" onclick="matchTx(' + tx.id + ')">매칭/확인</button>' +
           '<button class="btn-sm btn-ignore" onclick="ignoreTx(' + tx.id + ')">무시</button>';
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
  };

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

  // Batch apply
  window.batchApply = async function() {
    var ids = [];
    document.querySelectorAll('.tx-check:checked').forEach(function(el) {
      ids.push(parseInt(el.getAttribute('data-id'), 10));
    });
    if (!ids.length) { showToast('적용할 항목을 선택하세요.', 'warning'); return; }
    if (!(await showConfirm(ids.length + '건을 일괄 적용하시겠습니까?'))) return;
    axios.post('/api/bank/transactions/batch-apply', { transaction_ids: ids }).then(function() {
      showToast('일괄 적용 완료', 'success');
      loadTransactions();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '일괄 적용 실패';
      showToast(msg, 'error');
    });
  };

  // Match / confirm
  window.matchTx = function(txId) {
    var sel = document.getElementById('clientSel_' + txId);
    var clientId = sel ? sel.value : '';
    if (!clientId) {
      // open apply modal
      openApplyModal(txId, '');
      return;
    }
    // first match, then open apply modal to finalize
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

  // Apply modal
  function openApplyModal(txId, preClientId) {
    document.getElementById('applyTxId').value = txId;
    var sel = document.getElementById('applyClientId');
    sel.innerHTML = '<option value="">거래처 선택</option>';
    clients.forEach(function(cl) {
      var opt = document.createElement('option');
      opt.value = cl.id;
      opt.textContent = cl.client_name;
      if (preClientId && cl.id == preClientId) opt.selected = true;
      sel.appendChild(opt);
    });
    document.getElementById('applyNotes').value = '';
    document.getElementById('applyModal').classList.add('show');
  }

  window.closeApplyModal = function() {
    document.getElementById('applyModal').classList.remove('show');
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
      var connBadge = a.connected_id
        ? '<span class="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full ml-2"><i class="fas fa-link mr-1"></i>Connected</span>'
        : '<span class="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full ml-2"><i class="fas fa-unlink mr-1"></i>미연결</span>';
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
      html += '<button class="btn-sm btn-sync" onclick="syncAccount(' + a.id + ')"><i class="fas fa-sync-alt mr-1"></i>동기화</button>';
      html += '<button class="btn-sm" style="background:#e0e7ff;color:#3730a3;" onclick="editAccount(' + a.id + ')"><i class="fas fa-edit mr-1"></i>수정</button>';
      html += '<button class="btn-sm btn-delete" onclick="deleteAccount(' + a.id + ')"><i class="fas fa-trash mr-1"></i>삭제</button>';
      html += '</div>';
      html += '</div>';
    });
    list.innerHTML = html;
  }

  window.syncAccount = function(id) {
    axios.post('/api/bank/accounts/' + id + '/sync').then(function() {
      showToast('동기화 완료', 'success');
      loadAccounts();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '동기화 실패';
      showToast(msg, 'error');
    });
  };

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
    ['accBank','accNumber','accHolder','accConnectedId'].forEach(function(id) {
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
    document.getElementById('accConnectedId').value = acc.connected_id || '';
    document.getElementById('accountModal').classList.add('show');
  };

  window.closeAccountModal = function() {
    document.getElementById('accountModal').classList.remove('show');
    document.getElementById('connIdResult').classList.add('hidden');
  };

  window.issueConnectedId = function() {
    var bankCode = document.getElementById('accBank').value;
    if (!bankCode) { showToast('은행을 먼저 선택하세요.', 'warning'); return; }
    var loginId = document.getElementById('bankLoginId').value.trim();
    var loginPw = document.getElementById('bankLoginPw').value;
    if (!loginId || !loginPw) { showToast('은행 ID와 비밀번호를 입력하세요.', 'warning'); return; }
    var btn = document.getElementById('issueConnIdBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>발급 중...';
    var resultDiv = document.getElementById('connIdResult');
    resultDiv.classList.add('hidden');
    axios.post('/api/bank/connected-id', {
      organization: bankCode,
      loginType: '1',
      id: loginId,
      password: loginPw
    }).then(function(r) {
      var connId = r.data.data && r.data.data.connectedId;
      if (connId) {
        document.getElementById('accConnectedId').value = connId;
        resultDiv.innerHTML = '<i class="fas fa-check-circle mr-1"></i>Connected ID 발급 완료: <strong>' + escHtml(connId) + '</strong>';
        resultDiv.classList.remove('hidden');
        showToast('Connected ID 발급 완료', 'success');
      } else {
        showToast('Connected ID를 받지 못했습니다. 응답: ' + JSON.stringify(r.data), 'warning');
      }
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : 'Connected ID 발급 실패';
      showToast(msg, 'error');
      resultDiv.innerHTML = '<i class="fas fa-exclamation-triangle mr-1 text-red-500"></i><span class="text-red-600">' + escHtml(msg) + '</span>';
      resultDiv.className = 'mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm';
    }).finally(function() {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-key mr-1"></i>발급';
    });
  };

  window.saveAccount = function() {
    var editId = document.getElementById('accEditId').value;
    var bankSel = document.getElementById('accBank');
    var bankCode = bankSel.value;
    var bankName = bankSel.options[bankSel.selectedIndex].text;
    var number = document.getElementById('accNumber').value.trim();
    var holder = document.getElementById('accHolder').value.trim();
    var connectedId = document.getElementById('accConnectedId').value.trim();
    if (!bankCode) { showToast('은행을 선택하세요.', 'warning'); return; }
    if (!number) { showToast('계좌번호를 입력하세요.', 'warning'); return; }
    var body = {
      bank_code: bankCode,
      bank_name: bankName,
      account_number: number,
      account_holder: holder || null,
      connected_id: connectedId || null
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
        matchRules[rule.counterpart_name] = { client_id: rule.matched_client_id, client_name: rule.client_name, count: rule.match_count };
      });
    }).catch(function() { matchRules = {}; });
  }

  // CODEF settings
  function loadCodefSettings() {
    axios.get('/api/bank/settings').then(function(r) {
      var s = r.data.data || {};
      if (s.codef_client_id) document.getElementById('codefClientId').value = s.codef_client_id;
      if (s.codef_client_secret) document.getElementById('codefClientSecret').value = s.codef_client_secret;
      if (s.codef_service_type) document.getElementById('codefServiceType').value = s.codef_service_type;
    }).catch(function(err) { console.error('[bank] CODEF 설정 로드 실패', err); });
  }

  window.saveCodefSettings = function() {
    var body = {
      codef_client_id: document.getElementById('codefClientId').value.trim(),
      codef_client_secret: document.getElementById('codefClientSecret').value.trim(),
      codef_service_type: document.getElementById('codefServiceType').value
    };
    if (!body.codef_client_id || !body.codef_client_secret) {
      showToast('Client ID와 Secret을 입력하세요.', 'warning');
      return;
    }
    axios.put('/api/bank/settings', body).then(function() {
      showToast('CODEF 설정 저장 완료', 'success');
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '저장 실패';
      showToast(msg, 'error');
    });
  };

  // Init
  Promise.all([loadClients(), loadAccountFilter(), loadMatchRules()]).then(function() {
    loadTransactions();
    loadStats();
  });
  loadCodefSettings();

  // Close modals on overlay click
  document.getElementById('accountModal').addEventListener('click', function(e) {
    if (e.target === this) closeAccountModal();
  });
  document.getElementById('applyModal').addEventListener('click', function(e) {
    if (e.target === this) closeApplyModal();
  });
  document.getElementById('syncPreviewModal').addEventListener('click', function(e) {
    if (e.target === this) closeSyncPreview();
  });

})();
