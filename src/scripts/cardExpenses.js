// ===== State =====
var allCards = [];
var allCategories = [];
var selectedTxIds = new Set();
var currentPage = 1;

// ===== Tab Switch =====
function switchCardTab(tab) {
  var tabs = ['transactions', 'cards', 'schedule', 'report', 'categories', 'cardfee'];
  var activeClass = 'px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600';
  var inactiveClass = 'px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700';
  tabs.forEach(function(t) {
    var btn = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
    var content = document.getElementById(t + 'Content');
    if (!btn || !content) return;
    if (t === tab) { btn.className = activeClass; content.style.display = ''; }
    else { btn.className = inactiveClass; content.style.display = 'none'; }
  });
  if (tab === 'cards') loadCards();
  if (tab === 'categories') loadCategories();
  if (tab === 'schedule') loadSchedule();
  if (tab === 'report') { initReport(); ensureTaxRange(); }
  if (tab === 'cardfee' && window.initCardFeeTab) window.initCardFeeTab();
}

// ===== Init =====
async function init() {
  // 이번달 기본값
  var now = new Date();
  var y = now.getFullYear(), m = now.getMonth();
  document.getElementById('filterStartDate').value = new Date(y, m, 1).toISOString().split('T')[0];
  document.getElementById('filterEndDate').value = new Date(y, m + 1, 0).toISOString().split('T')[0];

  await Promise.all([loadCardOptions(), loadCategoryOptions()]);
  switchCardStatus('UNCLASSIFIED');
  loadSummary();
}

async function loadCardOptions() {
  try {
    var res = await axios.get('/api/card-expenses/cards');
    allCards = res.data.data || [];
    var opts = '<option value="">전체 카드</option>';
    var txOpts = '';
    var importOpts = '';
    allCards.forEach(function(c) {
      var label = c.card_name + ' (' + c.card_company + (c.card_number_last4 ? ' ' + c.card_number_last4 : '') + ')';
      opts += '<option value="' + c.id + '">' + label + '</option>';
      txOpts += '<option value="' + c.id + '">' + label + '</option>';
      importOpts += '<option value="' + c.id + '">' + label + '</option>';
    });
    document.getElementById('filterCard').innerHTML = opts;
    var txSel = document.getElementById('txCardId');
    if (txSel) txSel.innerHTML = '<option value="">선택</option>' + txOpts;
    var impSel = document.getElementById('importCardId');
    if (impSel) impSel.innerHTML = '<option value="">선택</option>' + importOpts;
  } catch (e) { console.error('Cards load error:', e); }
}

async function loadCategoryOptions() {
  try {
    var res = await axios.get('/api/card-expenses/categories');
    allCategories = res.data.data || [];
    var opts = '<option value="">전체 분류</option>';
    var selOpts = '<option value="">분류 선택</option>';
    var bulkOpts = '<option value="">분류 선택...</option>';
    allCategories.forEach(function(c) {
      opts += '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>';
      selOpts += '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>';
      bulkOpts += '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>';
    });
    document.getElementById('filterCategory').innerHTML = opts;
    var txCat = document.getElementById('txCategory');
    if (txCat) txCat.innerHTML = selOpts;
    document.getElementById('bulkCategory').innerHTML = bulkOpts;
  } catch (e) { console.error('Categories load error:', e); }
}

// ===== Card Status Tab =====
function switchCardStatus(status) {
  document.getElementById('filterStatus').value = status;
  var tabs = [
    { key: '', id: 'csTabAll' },
    { key: 'UNCLASSIFIED', id: 'csTabUnclassified' },
    { key: 'CLASSIFIED', id: 'csTabClassified' },
    { key: 'REQUESTED', id: 'csTabRequested' },
    { key: 'APPROVED', id: 'csTabApproved' }
  ];
  tabs.forEach(function(t) {
    var btn = document.getElementById(t.id);
    if (!btn) return;
    btn.className = t.key === status
      ? 'px-3 py-1 text-xs font-medium rounded-full bg-blue-600 text-white'
      : 'px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200';
  });
  currentPage = 1;
  loadTransactions();
}

// ===== KPI Summary =====
function setKpiText(id, val) {
  var el = document.getElementById(id);
  if (!el) { console.warn('[cardExpenses] #' + id + ' not found'); return; }
  el.textContent = val;
}

async function loadSummary() {
  try {
    var res = await axios.get('/api/card-expenses/transactions/summary');
    var s = res.data.data.summary || {};
    setKpiText('kpiUnclassified', (s.unclassified_count || 0));
    setKpiText('kpiClassified', (s.classified_count || 0));
    setKpiText('kpiApproved', (s.approved_count || 0));
  } catch (e) { console.error('Summary error:', e); }
  // 결제 예정 총액(결제일/마감 사이클 기준으로 일원화) — 사용내역 상단 KPI에도 노출
  try {
    var pr = await axios.get('/api/card-expenses/payment-schedule');
    var due = (pr.data.data && pr.data.data.total_payment) || 0;
    setKpiText('kpiPaymentDue', due.toLocaleString());
  } catch (e) { /* ignore */ }
}

// ===== Transactions =====
async function loadTransactions() {
  try {
    var params = new URLSearchParams();
    var cardId = document.getElementById('filterCard').value;
    var status = document.getElementById('filterStatus').value;
    var catId = document.getElementById('filterCategory').value;
    var sd = document.getElementById('filterStartDate').value;
    var ed = document.getElementById('filterEndDate').value;
    var search = document.getElementById('filterSearch').value.trim();

    if (cardId) params.set('card_id', cardId);
    if (status) params.set('status', status);
    if (catId) params.set('category_id', catId);
    if (sd) params.set('start_date', sd);
    if (ed) params.set('end_date', ed);
    if (search) params.set('search', search);
    params.set('page', currentPage);
    params.set('limit', '50');

    // #421: 로딩 표시(일관 포맷)
    var _txTb = document.getElementById('txTableBody');
    if (_txTb && window.dsSkeleton) _txTb.innerHTML = window.dsSkeleton.loadingRow(10);

    var res = await axios.get('/api/card-expenses/transactions?' + params.toString());
    var data = res.data.data || [];
    var pag = res.data.pagination || {};

    var tbody = document.getElementById('txTableBody');
    tbody.innerHTML = '';

    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center py-10 text-gray-400"><i class="fas fa-credit-card text-3xl mb-2 block text-gray-300"></i>카드 사용 내역이 없습니다</td></tr>';
      document.getElementById('txPagination').innerHTML = '';
      return;
    }

    // 분류 옵션 HTML 미리 생성
    var catOptionsHtml = '<option value="">-</option>';
    allCategories.forEach(function(c) {
      catOptionsHtml += '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>';
    });

    data.forEach(function(tx) {
      var isOffset = tx.is_offset == 1;        // 승인↔취소 자동 상계됨
      var isCancel = tx.approval_type === 'CANCEL';
      var row = document.createElement('tr');
      row.className = 'tx-row' + (selectedTxIds.has(tx.id) ? ' selected' : '') + (isOffset ? ' offset-row' : '');
      var statusColors = {
        UNCLASSIFIED: 'background:#fef3c7;color:#92400e',
        CLASSIFIED: 'background:#dbeafe;color:#1e40af',
        REQUESTED: 'background:#ede9fe;color:#5b21b6',
        APPROVED: 'background:#dcfce7;color:#166534'
      };
      var statusLabels = { UNCLASSIFIED: '미분류', CLASSIFIED: '분류', REQUESTED: '결의', APPROVED: '승인' };

      // 날짜 포맷: 20260521 → 05-21
      var d = tx.transaction_date || '';
      var dateStr = d.length === 8 ? d.slice(4,6) + '-' + d.slice(6,8) : d;

      // 카드 뒤 4자리
      var cardLast4 = tx.card_number_last4 || '-';
      var cardTitle = escapeHtml((tx.card_name || '') + (tx.card_company ? ' (' + tx.card_company + ')' : ''));

      // 담당자
      var assignee = tx.assigned_user_name || tx.holder_name || '';

      // 영수증 아이콘
      var hasReceipt = !!(tx.receipt_image_url || tx.receipt_data);
      var receiptIcon = hasReceipt ? ' <i class="fas fa-check-circle text-green-500" style="font-size:9px" title="영수증 첨부됨"></i>' : '';

      // 금액: 취소건은 음수·빨강
      var amtStr = (isCancel ? '-' : '') + (tx.amount || 0).toLocaleString();
      var amtCls = isCancel ? 'text-red-500' : (isOffset ? 'text-gray-400' : '');

      // 상태 뱃지: 상계>취소>일반 상태
      var statusHtml;
      if (isOffset) {
        statusHtml = '<span class="status-pill" style="background:#e5e7eb;color:#6b7280;font-size:10px" title="승인↔취소 자동 상계됨">상계</span>';
      } else if (isCancel) {
        statusHtml = '<span class="status-pill" style="background:#fee2e2;color:#b91c1c;font-size:10px">취소</span>';
      } else {
        statusHtml = '<span class="status-pill" style="' + (statusColors[tx.status] || '') + ';font-size:10px">' + (statusLabels[tx.status] || tx.status) + '</span>';
      }

      // 상계건은 분류/적요/선택 비활성 (결의·분류 대상 아님)
      var lockAttr = isOffset ? ' disabled' : '';

      row.innerHTML =
        '<td class="px-1 py-1.5 text-center"><input type="checkbox" class="tx-check" data-id="' + tx.id + '" ' + (selectedTxIds.has(tx.id) ? 'checked' : '') + lockAttr + ' onchange="toggleTxSelect(' + tx.id + ', this.checked)"></td>' +
        '<td class="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap">' + dateStr + '</td>' +
        '<td class="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap" title="' + cardTitle + '">' + escapeHtml(cardLast4) + '</td>' +
        '<td class="px-2 py-1.5 text-xs text-gray-600">' + escapeHtml(assignee) + '</td>' +
        '<td class="px-2 py-1.5 text-xs font-medium text-gray-800 truncate" style="max-width:220px" title="' + escapeHtml(tx.merchant_name || '') + '">' + escapeHtml(tx.merchant_name || '-') + receiptIcon + '</td>' +
        '<td class="px-2 py-1.5 text-right text-xs tabular-nums font-semibold ' + amtCls + '">' + amtStr + '</td>' +
        '<td class="px-1 py-1"><select class="w-full border border-gray-200 rounded px-1 py-0.5 text-xs bg-white" onchange="quickClassify(' + tx.id + ', this.value)" data-cat-select="' + tx.id + '"' + lockAttr + '>' + catOptionsHtml.replace('value="' + (tx.category_id || '') + '"', 'value="' + (tx.category_id || '') + '" selected') + '</select></td>' +
        '<td class="px-1 py-1"><input type="text" class="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs" value="' + escapeHtml(tx.memo || '') + '" placeholder="적요..." onblur="quickMemo(' + tx.id + ', this.value)" data-memo-input="' + tx.id + '"' + lockAttr + '></td>' +
        '<td class="px-1 py-1.5 text-center">' + statusHtml + '</td>' +
        '<td class="px-1 py-1.5 text-center whitespace-nowrap">' +
          (hasReceipt ? '<button onclick="viewReceipt(\'' + (tx.receipt_image_url || '') + '\')" class="text-blue-500 hover:text-blue-700 mr-1" title="영수증 보기"><i class="fas fa-magnifying-glass text-xs"></i></button>' : '') +
          '<label class="' + (hasReceipt ? 'text-green-500' : 'text-gray-400') + ' hover:text-green-600 cursor-pointer mr-1" title="' + (hasReceipt ? '영수증 교체' : '영수증 첨부') + '">' +
            '<i class="fas ' + (hasReceipt ? 'fa-check-circle' : 'fa-camera') + ' text-xs"></i>' +
            '<input type="file" accept="image/*,.pdf" class="hidden" onchange="quickReceipt(' + tx.id + ', this)">' +
          '</label>' +
          '<button onclick="openEditTx(' + tx.id + ')" class="text-gray-400 hover:text-blue-600" title="상세"><i class="fas fa-ellipsis-v text-xs"></i></button>' +
        '</td>';
      tbody.appendChild(row);
    });

    // 페이지네이션
    var totalPages = Math.ceil((pag.total || 0) / (pag.limit || 50));
    document.getElementById('txPagination').innerHTML =
      '<span>' + (pag.total || 0) + '건 중 ' + ((currentPage - 1) * 50 + 1) + '-' + Math.min(currentPage * 50, pag.total || 0) + '</span>' +
      '<div class="flex gap-1">' +
      (currentPage > 1 ? '<button onclick="goPage(' + (currentPage - 1) + ')" class="px-2 py-1 border rounded text-xs hover:bg-gray-50">이전</button>' : '') +
      '<span class="px-2 py-1 text-xs">' + currentPage + ' / ' + totalPages + '</span>' +
      (currentPage < totalPages ? '<button onclick="goPage(' + (currentPage + 1) + ')" class="px-2 py-1 border rounded text-xs hover:bg-gray-50">다음</button>' : '') +
      '</div>';
  } catch (e) {
    console.error('Transactions error:', e);
    showToast('내역 로드 실패', 'error');
  }
}

function goPage(p) { currentPage = p; loadTransactions(); }

// ===== Selection =====
function toggleTxSelect(id, checked) {
  if (checked) selectedTxIds.add(id); else selectedTxIds.delete(id);
  updateBulkBar();
}
function toggleSelectAll() {
  var checked = document.getElementById('selectAll').checked;
  document.querySelectorAll('.tx-check').forEach(function(cb) {
    cb.checked = checked;
    var id = parseInt(cb.dataset.id);
    if (checked) selectedTxIds.add(id); else selectedTxIds.delete(id);
  });
  updateBulkBar();
}
function clearSelection() {
  selectedTxIds.clear();
  document.getElementById('selectAll').checked = false;
  document.querySelectorAll('.tx-check').forEach(function(cb) { cb.checked = false; });
  updateBulkBar();
}
function updateBulkBar() {
  var bar = document.getElementById('cardBulkBar');
  if (!bar) return;
  if (selectedTxIds.size > 0) {
    bar.classList.remove('hidden');
    document.getElementById('selectedCount').textContent = selectedTxIds.size;
  } else {
    bar.classList.add('hidden');
  }
}

// ===== Bulk Actions =====
async function bulkClassify() {
  var catId = document.getElementById('bulkCategory').value;
  if (!catId) { showToast('분류를 선택하세요', 'warning'); return; }
  if (!selectedTxIds.size) return;
  try {
    await axios.post('/api/card-expenses/transactions/bulk-classify', {
      ids: Array.from(selectedTxIds), category_id: parseInt(catId)
    });
    showToast(selectedTxIds.size + '건 분류 완료', 'success');
    clearSelection();
    loadTransactions();
    loadSummary();
  } catch (e) { showToast('일괄 분류 실패', 'error'); }
}

async function bulkCreateRequests() {
  if (!selectedTxIds.size) return;
  if (!(await showConfirm(selectedTxIds.size + '건에 대해 지출결의서를 생성합니다.'))) return;
  try {
    var res = await axios.post('/api/card-expenses/transactions/create-requests', {
      ids: Array.from(selectedTxIds)
    });
    showToast(res.data.data.created + '건 지출결의 생성 완료', 'success');
    clearSelection();
    loadTransactions();
    loadSummary();
  } catch (e) { showToast(e.response?.data?.error || '결의 생성 실패', 'error'); }
}

// ===== Cards CRUD =====
async function loadCards() {
  try {
    var res = await axios.get('/api/card-expenses/cards');
    var cards = res.data.data || [];
    var container = document.getElementById('cardsList');
    if (!cards.length) {
      container.innerHTML = '<div class="col-span-3 text-center py-10 text-gray-400"><i class="fas fa-credit-card text-4xl mb-3 block"></i>등록된 카드가 없습니다.</div>';
      return;
    }
    container.innerHTML = cards.map(function(c) {
      var usageRate = c.monthly_limit > 0 ? Math.round((c.month_total || 0) / c.monthly_limit * 100) : 0;
      var barColor = usageRate > 90 ? '#ef4444' : usageRate > 70 ? '#f59e0b' : '#22c55e';
      return '<div class="ds-card">' +
        '<div class="flex items-center justify-between mb-3">' +
        '<div><div class="font-bold text-gray-800">' + escapeHtml(c.card_name) +
        (c.barobill_registered ? ' <span class="ml-1 inline-block px-1.5 py-0.5 rounded text-xs font-medium" style="background:#d1fae5;color:#065f46;"><i class="fas fa-link mr-0.5"></i>바로빌</span>' : '') + '</div>' +
        '<div class="text-xs text-gray-500">' + escapeHtml(c.card_company) + (c.card_number_last4 ? ' •••• ' + c.card_number_last4 : '') + '</div></div>' +
        '<div class="flex gap-1">' +
        (c.barobill_registered ? '<button onclick="refreshCard(' + c.id + ')" title="바로빌 즉시조회" class="text-gray-400 hover:text-emerald-600 p-1"><i class="fas fa-sync-alt text-xs"></i></button>' : '') +
        '<button onclick="editCard(' + c.id + ')" class="text-gray-400 hover:text-blue-600 p-1"><i class="fas fa-pen text-xs"></i></button>' +
        '<button onclick="deleteCard(' + c.id + ')" class="text-gray-400 hover:text-red-600 p-1"><i class="fas fa-trash text-xs"></i></button></div></div>' +
        (c.holder_name ? '<div class="text-xs text-gray-500 mb-2"><i class="fas fa-user mr-1"></i>' + escapeHtml(c.holder_name) + '</div>' : '') +
        '<div class="text-sm mb-1"><span class="text-gray-500">이번달:</span> <span class="font-bold">' + (c.month_total || 0).toLocaleString() + '원</span>' +
        (c.monthly_limit > 0 ? ' <span class="text-gray-400">/ ' + c.monthly_limit.toLocaleString() + '원</span>' : '') + '</div>' +
        (c.monthly_limit > 0 ? '<div class="w-full bg-gray-100 rounded-full h-2 mt-1"><div class="rounded-full h-2" style="width:' + Math.min(usageRate, 100) + '%;background:' + barColor + '"></div></div>' : '') +
        '<div class="text-xs text-gray-400 mt-2">' + (c.tx_count || 0) + '건 사용</div></div>';
    }).join('');
  } catch (e) { console.error('Cards load error:', e); }
}

// 바로빌 연동 인증정보 입력란 토글
function toggleCardBarobill() {
  var sync = document.getElementById('cardBarobillSync');
  var fields = document.getElementById('cardBarobillFields');
  if (fields) fields.classList.toggle('hidden', !(sync && sync.checked));
}
function resetCardBarobill() {
  var sync = document.getElementById('cardBarobillSync');
  if (sync) sync.checked = false;
  var fields = document.getElementById('cardBarobillFields');
  if (fields) fields.classList.add('hidden');
  ['cardFullNum','cardWebId','cardWebPwd'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function openAddCardModal() {
  document.getElementById('editCardId').value = '';
  document.getElementById('cardName').value = '';
  document.getElementById('cardCompany').value = '';
  document.getElementById('cardLast4').value = '';
  document.getElementById('cardLimit').value = '';
  document.getElementById('cardHolder').value = '';
  resetCardBarobill();
  var sec = document.getElementById('cardBarobillSection');
  if (sec) sec.classList.remove('hidden'); // 신규 등록 시에만 바로빌 연동 노출
  document.getElementById('cardModalTitle').innerHTML = '<i class="fas fa-credit-card text-blue-500 mr-2"></i>카드 등록';
  document.getElementById('cardModal').classList.remove('hidden');
}
function closeCardModal() { document.getElementById('cardModal').classList.add('hidden'); }

async function editCard(id) {
  var card = allCards.find(function(c) { return c.id === id; });
  if (!card) return;
  document.getElementById('editCardId').value = id;
  document.getElementById('cardName').value = card.card_name || '';
  document.getElementById('cardCompany').value = card.card_company || '';
  document.getElementById('cardLast4').value = card.card_number_last4 || '';
  document.getElementById('cardLimit').value = card.monthly_limit ? fmtMoneyInput(card.monthly_limit) : '';
  document.getElementById('cardHolder').value = card.holder_name || '';
  document.getElementById('cardCutoffDay').value = card.cutoff_day || 15;
  document.getElementById('cardPayDay').value = card.payment_day || 15;
  var assignSel = document.getElementById('cardAssignedUser');
  if (assignSel) assignSel.value = card.assigned_user_id || '';
  resetCardBarobill();
  var sec = document.getElementById('cardBarobillSection');
  if (sec) sec.classList.add('hidden'); // 수정 시 바로빌 재등록 미지원
  document.getElementById('cardModalTitle').innerHTML = '<i class="fas fa-credit-card text-blue-500 mr-2"></i>카드 수정';
  document.getElementById('cardModal').classList.remove('hidden');
}

async function saveCard() {
  var id = document.getElementById('editCardId').value;
  var data = {
    card_name: document.getElementById('cardName').value.trim(),
    card_company: document.getElementById('cardCompany').value,
    card_number_last4: document.getElementById('cardLast4').value.trim(),
    holder_name: document.getElementById('cardHolder').value.trim(),
    monthly_limit: parseMoney(document.getElementById('cardLimit').value) || 0,
    cutoff_day: parseInt(document.getElementById('cardCutoffDay').value) || 15,
    payment_day: parseInt(document.getElementById('cardPayDay').value) || 15,
    assigned_user_id: parseInt(document.getElementById('cardAssignedUser').value) || null
  };
  if (!data.card_name || !data.card_company) { showToast('카드명과 카드사는 필수입니다', 'warning'); return; }
  // 바로빌 자동 연동 (신규 등록 시에만)
  var syncEl = document.getElementById('cardBarobillSync');
  if (!id && syncEl && syncEl.checked) {
    var fullNum = document.getElementById('cardFullNum').value.replace(/[^0-9]/g, '');
    var webId = document.getElementById('cardWebId').value.trim();
    var webPwd = document.getElementById('cardWebPwd').value;
    if (!fullNum || !webId || !webPwd) { showToast('바로빌 연동에 필요한 카드번호·ID/PW를 입력하세요.', 'warning'); return; }
    data.barobill_sync = true;
    data.card_number = fullNum;
    data.web_id = webId;
    data.web_pwd = webPwd;
    var typeEl = document.getElementById('cardTypeSel');
    data.card_type = typeEl ? typeEl.value : 'C';
  }
  try {
    var resp = id
      ? await axios.put('/api/card-expenses/cards/' + id, data)
      : await axios.post('/api/card-expenses/cards', data);
    showToast((resp && resp.data && resp.data.message) || (id ? '카드 수정 완료' : '카드 등록 완료'), 'success');
    closeCardModal();
    // 바로빌 신규 연동 시 과거 3개월 카드내역 자동 수집
    if (!id && data.barobill_sync) {
      showToast('바로빌 카드내역을 수집하는 중...', 'info');
      try {
        var ced = new Date(), csd = new Date(); csd.setMonth(csd.getMonth() - 3);
        var cfmt = function(d){ return d.toISOString().slice(0,10); };
        var sres = await axios.post('/api/card-expenses/sync', { date_start: cfmt(csd), date_end: cfmt(ced) });
        showToast((sres.data && sres.data.message) || '내역 수집 완료', 'success');
      } catch (se) {
        var smsg = (se.response && se.response.data && se.response.data.error) ? se.response.data.error : '수집 실패';
        showToast('내역 수집 실패: ' + smsg, 'warning');
      }
    }
    loadCards();
    loadCardOptions();
    loadTransactions();
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '저장 실패';
    showToast(msg, 'error');
  }
}

// 바로빌 즉시조회 요청
async function refreshCard(id) {
  try {
    var resp = await axios.post('/api/card-expenses/cards/' + id + '/refresh');
    showToast((resp && resp.data && resp.data.message) || '즉시조회 요청 완료', 'success');
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '즉시조회 실패';
    showToast(msg, 'error');
  }
}

async function deleteCard(id) {
  if (!(await showConfirm('이 카드를 삭제하시겠습니까?', { danger: true }))) return;
  try {
    await axios.delete('/api/card-expenses/cards/' + id);
    showToast('카드 삭제 완료', 'success');
    loadCards();
    loadCardOptions();
  } catch (e) { showToast('삭제 실패', 'error'); }
}

// ===== Categories CRUD =====
async function loadCategories() {
  try {
    var res = await axios.get('/api/card-expenses/categories');
    var cats = res.data.data || [];
    var tbody = document.getElementById('categoryTableBody');
    tbody.innerHTML = cats.map(function(c) {
      return '<tr>' +
        '<td class="px-3 py-2 text-center"><i class="fas ' + (c.icon || 'fa-tag') + '" style="color:' + (c.color || '#6b7280') + '"></i></td>' +
        '<td class="px-3 py-2 font-medium" title="' + escapeHtml(c.name || '') + '">' + escapeHtml(c.name) + '</td>' +
        '<td class="px-3 py-2 text-center"><div style="width:20px;height:20px;border-radius:4px;background:' + (c.color || '#6b7280') + ';margin:0 auto"></div></td>' +
        '<td class="px-3 py-2 text-center text-gray-500">' + (c.sort_order || 0) + '</td>' +
        '<td class="px-3 py-2 text-center">' +
        '<button onclick="editCategory(' + c.id + ',\'' + escapeHtml(c.name).replace(/'/g, "\\'") + '\',\'' + (c.icon || 'fa-tag') + '\',\'' + (c.color || '#6b7280') + '\')" class="text-gray-400 hover:text-blue-600 p-1"><i class="fas fa-pen text-xs"></i></button>' +
        '<button onclick="deleteCategory(' + c.id + ')" class="text-gray-400 hover:text-red-600 p-1"><i class="fas fa-trash text-xs"></i></button></td></tr>';
    }).join('');
  } catch (e) { console.error('Categories error:', e); }
}

function openAddCategoryModal() {
  document.getElementById('editCategoryId').value = '';
  document.getElementById('catName').value = '';
  document.getElementById('catIcon').value = 'fa-tag';
  document.getElementById('catColor').value = '#6b7280';
  document.getElementById('categoryModal').classList.remove('hidden');
}
function closeCategoryModal() { document.getElementById('categoryModal').classList.add('hidden'); }

function editCategory(id, name, icon, color) {
  document.getElementById('editCategoryId').value = id;
  document.getElementById('catName').value = name;
  document.getElementById('catIcon').value = icon;
  document.getElementById('catColor').value = color;
  document.getElementById('categoryModal').classList.remove('hidden');
}

async function saveCategory() {
  var id = document.getElementById('editCategoryId').value;
  var data = {
    name: document.getElementById('catName').value.trim(),
    icon: document.getElementById('catIcon').value.trim() || 'fa-tag',
    color: document.getElementById('catColor').value
  };
  if (!data.name) { showToast('분류명을 입력하세요', 'warning'); return; }
  try {
    if (id) await axios.put('/api/card-expenses/categories/' + id, data);
    else await axios.post('/api/card-expenses/categories', data);
    showToast(id ? '분류 수정 완료' : '분류 추가 완료', 'success');
    closeCategoryModal();
    loadCategories();
    loadCategoryOptions();
  } catch (e) { showToast('저장 실패', 'error'); }
}

async function deleteCategory(id) {
  if (!(await showConfirm('이 분류를 삭제하시겠습니까?'))) return;
  try {
    await axios.delete('/api/card-expenses/categories/' + id);
    showToast('분류 삭제 완료', 'success');
    loadCategories();
    loadCategoryOptions();
  } catch (e) { showToast('삭제 실패', 'error'); }
}

// ===== Transaction CRUD =====
function openAddTxModal() {
  document.getElementById('txCardId').value = '';
  document.getElementById('txDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('txMerchant').value = '';
  document.getElementById('txAmount').value = '';
  document.getElementById('txCategory').value = '';
  document.getElementById('txMemo').value = '';
  document.getElementById('addTxModal').classList.remove('hidden');
}
function closeAddTxModal() { document.getElementById('addTxModal').classList.add('hidden'); }

async function saveTransaction() {
  var data = {
    card_id: parseInt(document.getElementById('txCardId').value),
    transaction_date: document.getElementById('txDate').value,
    merchant_name: document.getElementById('txMerchant').value.trim(),
    amount: parseMoney(document.getElementById('txAmount').value),
    category_id: parseInt(document.getElementById('txCategory').value) || null,
    memo: document.getElementById('txMemo').value.trim()
  };
  if (!data.card_id || !data.transaction_date || !data.amount) {
    showToast('카드, 날짜, 금액은 필수입니다', 'warning'); return;
  }
  try {
    await axios.post('/api/card-expenses/transactions', data);
    showToast('내역 등록 완료', 'success');
    closeAddTxModal();
    loadTransactions();
    loadSummary();
  } catch (e) { showToast('등록 실패', 'error'); }
}

// ===== Edit Transaction Modal =====
var editTxData = null;

async function openEditTx(id) {
  // 거래 데이터 가져오기
  try {
    var res = await axios.get('/api/card-expenses/transactions?id=' + id);
    editTxData = (res.data.data || [])[0];
  } catch(e) { /* fallback */ }

  if (!editTxData) {
    // API에서 못 찾으면 테이블에서 추출
    editTxData = { id: id };
  }

  document.getElementById('editTxId').value = id;
  document.getElementById('editTxDate').textContent = editTxData.transaction_date || '-';
  document.getElementById('editTxMerchant').textContent = editTxData.merchant_name || '-';
  document.getElementById('editTxAmount').textContent = (editTxData.amount || 0).toLocaleString() + '원';
  document.getElementById('editTxCard').textContent = (editTxData.card_name || '') + ' ' + (editTxData.card_number_last4 || '');

  // 카테고리 드롭다운
  var catSel = document.getElementById('editTxCategory');
  catSel.innerHTML = '<option value="">미분류</option>';
  allCategories.forEach(function(c) {
    catSel.innerHTML += '<option value="' + c.id + '"' + (editTxData.category_id == c.id ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>';
  });

  document.getElementById('editTxMemo').value = editTxData.memo || '';
  document.getElementById('editTxStatus').value = editTxData.status || 'UNCLASSIFIED';
  document.getElementById('editTxReceiptFile').value = '';

  // 기존 영수증 미리보기 — img src 직접 사용 불가(인증 헤더), axios blob 경유
  var preview = document.getElementById('editTxReceiptPreview');
  if (editTxData.receipt_image_url) {
    var rUrl = editTxData.receipt_image_url;
    preview.innerHTML = '<span class="text-xs text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>영수증 불러오는 중...</span>';
    loadReceiptBlob(rUrl).then(function(blobUrl) {
      preview.innerHTML = '<img src="' + blobUrl + '" class="receipt-preview mb-2 cursor-pointer" alt="영수증" onclick="viewReceipt(\'' + rUrl + '\')"><br><span class="text-xs text-green-600"><i class="fas fa-check-circle mr-1"></i>영수증 첨부됨 (클릭 시 확대)</span>';
    }).catch(function() {
      preview.innerHTML = '<span class="text-xs text-red-400">영수증을 불러오지 못했습니다</span>';
    });
  } else {
    preview.innerHTML = '<span class="text-xs text-gray-400">첨부된 영수증 없음</span>';
  }

  document.getElementById('editTxModal').classList.remove('hidden');
}

function closeEditTxModal() {
  document.getElementById('editTxModal').classList.add('hidden');
  editTxData = null;
}

async function saveEditTx() {
  var id = document.getElementById('editTxId').value;
  var categoryId = document.getElementById('editTxCategory').value;
  var memo = document.getElementById('editTxMemo').value.trim();
  var status = document.getElementById('editTxStatus').value;

  try {
    // 1. 분류/메모/상태 저장
    await axios.put('/api/card-expenses/transactions/' + id, {
      category_id: categoryId ? parseInt(categoryId) : null,
      memo: memo || null,
      status: status
    });

    // 2. 영수증 파일이 있으면 업로드 (이미지면 JPG 압축)
    var fileInput = document.getElementById('editTxReceiptFile');
    if (fileInput.files && fileInput.files[0]) {
      await uploadReceiptFile(id, fileInput.files[0]);
    }

    showToast('저장 완료', 'success');
    closeEditTxModal();
    loadTransactions();
    loadSummary();
  } catch (e) {
    showToast(e.response?.data?.error || '저장 실패', 'error');
  }
}

// ===== Inline Quick Actions =====
async function quickClassify(txId, catId) {
  try {
    await axios.put('/api/card-expenses/transactions/' + txId, {
      category_id: catId ? parseInt(catId) : null
    });
    // 전체 새로고침 대신 해당 행 상태 뱃지만 인라인 갱신 (스크롤·포커스 유지)
    var sel = document.querySelector('[data-cat-select="' + txId + '"]');
    var pill = sel ? sel.closest('tr').querySelector('.status-pill') : null;
    if (pill) {
      if (catId) { pill.textContent = '분류'; pill.setAttribute('style', 'background:#dbeafe;color:#1e40af;font-size:10px'); }
      else { pill.textContent = '미분류'; pill.setAttribute('style', 'background:#fef3c7;color:#92400e;font-size:10px'); }
    }
    loadSummary();
  } catch (e) { showToast('분류 실패', 'error'); }
}

async function quickMemo(txId, memo) {
  try {
    await axios.put('/api/card-expenses/transactions/' + txId, { memo: memo || null });
  } catch (e) { showToast('메모 저장 실패', 'error'); }
}

// ===== 영수증 이미지 압축 (업로드 전 클라이언트 리사이즈 + JPG) =====
// 이미지가 아니면(PDF 등) 원본 그대로. 압축본이 원본보다 크면 원본 사용.
function compressImage(file, maxDim, quality) {
  maxDim = maxDim || 1600; quality = quality || 0.82;
  return new Promise(function(resolve) {
    if (!file.type || file.type.indexOf('image/') !== 0) { resolve(file); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function() {
      var w = img.naturalWidth, h = img.naturalHeight;
      var scale = Math.min(1, maxDim / Math.max(w, h));
      var resized = scale < 1;  // 리사이즈가 필요한(큰) 이미지
      var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
      var canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
      URL.revokeObjectURL(url);
      canvas.toBlob(function(blob) {
        // 리사이즈했으면 항상 JPG 사용(원본이 더 큰 치수). 아니면 더 작은 쪽 선택.
        resolve(blob && (resized || blob.size < file.size) ? blob : file);
      }, 'image/jpeg', quality);
    };
    img.onerror = function() { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// 압축본/원본을 FormData로 업로드 (파일명: 압축 시 receipt.jpg, 원본 시 원래명)
async function uploadReceiptFile(txId, file) {
  var out = await compressImage(file);
  var fname = (out !== file) ? 'receipt.jpg' : (file.name || 'receipt');
  var formData = new FormData();
  formData.append('file', out, fname);
  return axios.post('/api/card-expenses/transactions/' + txId + '/receipt', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
}

// ===== Quick Receipt Upload =====
async function quickReceipt(txId, input) {
  if (!input.files || !input.files[0]) return;
  try {
    await uploadReceiptFile(txId, input.files[0]);
    showToast('영수증 첨부 완료', 'success');
    loadTransactions();
  } catch (e) {
    showToast('영수증 업로드 실패', 'error');
  }
  input.value = '';
}

// ===== Receipt Viewer (라이트박스) — img src 직접 불가(인증 헤더), axios blob 경유 =====
var _receiptObjUrl = null;
async function loadReceiptBlob(url) {
  var res = await axios.get(url, { responseType: 'blob' });
  return URL.createObjectURL(res.data);
}
async function viewReceipt(url) {
  if (!url) return;
  var lb = document.getElementById('receiptLightbox');
  var body = document.getElementById('receiptLightboxBody');
  if (!lb || !body) return;
  body.innerHTML = '<div class="p-10 text-center text-gray-400"><i class="fas fa-spinner fa-spin"></i></div>';
  lb.classList.remove('hidden');
  try {
    if (_receiptObjUrl) { URL.revokeObjectURL(_receiptObjUrl); _receiptObjUrl = null; }
    var blobUrl = await loadReceiptBlob(url);
    _receiptObjUrl = blobUrl;
    var isPdf = /\.pdf(\?|$)/i.test(url);
    body.innerHTML = isPdf
      ? '<iframe src="' + blobUrl + '" style="width:80vw;height:80vh;border:0"></iframe>'
      : '<img src="' + blobUrl + '" style="max-width:80vw;max-height:85vh;object-fit:contain" alt="영수증">';
  } catch (e) {
    body.innerHTML = '<div class="p-10 text-center text-red-400">영수증을 불러오지 못했습니다</div>';
  }
}
function closeReceiptLightbox() {
  var lb = document.getElementById('receiptLightbox');
  if (lb) lb.classList.add('hidden');
  if (_receiptObjUrl) { URL.revokeObjectURL(_receiptObjUrl); _receiptObjUrl = null; }
}

// ===== 세무사 전달: 내역 CSV + 영수증 인쇄 =====
function ensureTaxRange() {
  var s = document.getElementById('taxExportStart');
  var e = document.getElementById('taxExportEnd');
  if (s && !s.value) { var now = new Date(); s.value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]; }
  if (e && !e.value) { var n2 = new Date(); e.value = new Date(n2.getFullYear(), n2.getMonth() + 1, 0).toISOString().split('T')[0]; }
}

async function downloadTaxCsv() {
  var s = document.getElementById('taxExportStart').value;
  var e = document.getElementById('taxExportEnd').value;
  if (!s || !e) { showToast('기간을 선택하세요', 'warning'); return; }
  try {
    var res = await axios.get('/api/card-expenses/export-csv?start=' + s + '&end=' + e, { responseType: 'blob' });
    var blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
    var href = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = href; a.download = '카드내역_' + s + '_' + e + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(href); }, 1000);
    showToast('CSV 다운로드 완료', 'success');
  } catch (err) {
    showToast('CSV 다운로드 실패', 'error');
  }
}

// 파일명 안전화 (ZIP 경로용 금지문자 제거)
function sanitizeFileName(s) {
  return String(s == null ? '' : s).replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || '_';
}
// fflate(경량 zip) 동적 로드
function loadFflate() {
  return new Promise(function(resolve, reject) {
    if (window.fflate) return resolve(window.fflate);
    var sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js';
    sc.onload = function() { resolve(window.fflate); };
    sc.onerror = function() { reject(new Error('zip 라이브러리 로드 실패')); };
    document.head.appendChild(sc);
  });
}

// 세무사 제공: 기간 내 영수증을 ZIP으로 (날짜폴더/카드_가맹점_금액.jpg)
async function downloadReceiptsZip() {
  var s = document.getElementById('taxExportStart').value;
  var e = document.getElementById('taxExportEnd').value;
  if (!s || !e) { showToast('기간을 선택하세요', 'warning'); return; }
  var statusEl = document.getElementById('taxExportStatus');
  if (statusEl) statusEl.textContent = '영수증 수집 중...';
  try {
    var fflate = await loadFflate();
    var res = await axios.get('/api/card-expenses/transactions?start_date=' + s + '&end_date=' + e + '&limit=200');
    var list = (res.data.data || []).filter(function(t) { return t.receipt_image_url; });
    if (!list.length) { if (statusEl) statusEl.textContent = ''; showToast('해당 기간에 첨부된 영수증이 없습니다', 'warning'); return; }

    var files = {};
    var used = {};
    var added = 0;
    for (var i = 0; i < list.length; i++) {
      var tx = list[i];
      if (statusEl) statusEl.textContent = '영수증 ' + (i + 1) + '/' + list.length + '...';
      try {
        var ab = await axios.get(tx.receipt_image_url, { responseType: 'arraybuffer' });
        var d = String(tx.transaction_date || '');
        var folder = d.length === 8 ? d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8) : (d || 'unknown');
        var ext = /\.pdf(\?|$)/i.test(tx.receipt_image_url) ? 'pdf' : 'jpg';
        var base = folder + '/' + sanitizeFileName((tx.card_number_last4 || '카드') + '_' + (tx.merchant_name || '가맹점') + '_' + (tx.amount || 0));
        var path = base + '.' + ext, n = 1;
        while (used[path]) { path = base + '_' + (++n) + '.' + ext; }
        used[path] = true;
        files[path] = new Uint8Array(ab.data);
        added++;
      } catch (e2) { /* skip */ }
    }
    if (!added) { if (statusEl) statusEl.textContent = ''; showToast('영수증을 불러오지 못했습니다', 'error'); return; }

    var zipped = fflate.zipSync(files, { level: 6 });
    var blob = new Blob([zipped], { type: 'application/zip' });
    var href = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = href; a.download = '카드영수증_' + s + '_' + e + '.zip';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(href); }, 1000);
    if (statusEl) statusEl.textContent = added + '건 ZIP 다운로드 완료' + (list.length >= 200 ? ' (200건 제한 — 기간을 좁히세요)' : '');
    setTimeout(function() { if (statusEl) statusEl.textContent = ''; }, 4000);
  } catch (err) {
    if (statusEl) statusEl.textContent = '';
    showToast('영수증 ZIP 생성 실패: ' + (err.message || ''), 'error');
  }
}

// ===== CSV Import =====
function openImportModal() {
  document.getElementById('importCardId').value = '';
  document.getElementById('importFile').value = '';
  document.getElementById('importPreview').classList.add('hidden');
  document.getElementById('importStatus').textContent = '';
  document.getElementById('importModal').classList.remove('hidden');
}
function closeImportModal() { document.getElementById('importModal').classList.add('hidden'); }

async function executeImport() {
  var cardId = parseInt(document.getElementById('importCardId').value);
  if (!cardId) { showToast('카드를 선택하세요', 'warning'); return; }
  var file = document.getElementById('importFile').files[0];
  if (!file) { showToast('파일을 선택하세요', 'warning'); return; }

  var statusEl = document.getElementById('importStatus');
  statusEl.textContent = '파일 읽는 중...';
  statusEl.style.color = '#6b7280';

  try {
    var text = await file.text();
    var lines = text.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l; });
    if (lines.length < 2) { statusEl.textContent = '데이터가 없습니다.'; statusEl.style.color = '#ef4444'; return; }

    // 헤더 파싱 (일반적인 카드사 CSV: 이용일, 이용시간, 가맹점, 이용금액, 할부)
    var header = lines[0].split(',').map(function(h) { return h.replace(/"/g, '').trim(); });
    var dateIdx = header.findIndex(function(h) { return h.includes('일') || h.includes('date'); });
    var timeIdx = header.findIndex(function(h) { return h.includes('시간') || h.includes('time'); });
    var merchantIdx = header.findIndex(function(h) { return h.includes('가맹점') || h.includes('상호') || h.includes('이용처'); });
    var amountIdx = header.findIndex(function(h) { return h.includes('금액') || h.includes('amount'); });
    var installIdx = header.findIndex(function(h) { return h.includes('할부') || h.includes('개월'); });

    if (dateIdx < 0 || amountIdx < 0) {
      statusEl.textContent = '날짜/금액 컬럼을 찾을 수 없습니다. CSV 형식을 확인하세요.';
      statusEl.style.color = '#ef4444';
      return;
    }

    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var cols = lines[i].split(',').map(function(c) { return c.replace(/"/g, '').trim(); });
      var dateVal = cols[dateIdx] || '';
      // 날짜 형식 정규화 (YYYYMMDD → YYYY-MM-DD)
      dateVal = dateVal.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) continue;
      var amt = (cols[amountIdx] || '0').replace(/[^0-9.-]/g, '');
      if (!parseFloat(amt)) continue;
      rows.push({
        date: dateVal,
        time: timeIdx >= 0 ? cols[timeIdx] : '',
        merchant: merchantIdx >= 0 ? cols[merchantIdx] : '',
        amount: amt,
        installments: installIdx >= 0 ? cols[installIdx] : '1'
      });
    }

    if (!rows.length) { statusEl.textContent = '가져올 수 있는 내역이 없습니다.'; statusEl.style.color = '#ef4444'; return; }

    statusEl.textContent = rows.length + '건 가져오는 중...';
    var res = await axios.post('/api/card-expenses/transactions/import-csv', { card_id: cardId, rows: rows });
    statusEl.textContent = res.data.data.imported + '건 가져오기 완료 (전체 ' + res.data.data.total + '건 중)';
    statusEl.style.color = '#16a34a';
    loadTransactions();
    loadSummary();
  } catch (e) {
    statusEl.textContent = '가져오기 실패: ' + (e.message || '알 수 없는 오류');
    statusEl.style.color = '#ef4444';
  }
}

// ===== Barobill Sync =====
async function syncBarobillCards() {
  var btn = document.getElementById('syncCardBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>동기화 중...'; }
  var sd = document.getElementById('filterStartDate').value;
  var ed = document.getElementById('filterEndDate').value;
  try {
    var res = await axios.post('/api/card-expenses/sync', { date_start: sd, date_end: ed });
    showToast(res.data.message || '동기화 완료', 'success');
    loadTransactions();
    loadSummary();
  } catch (e) {
    showToast(e.response?.data?.error || '동기화 실패', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt mr-1"></i>바로빌 동기화'; }
  }
}

// ===== Payment Schedule (Phase 4) =====
// YYYYMMDD → MM/DD
function fmtMmDd(s) {
  s = String(s || '');
  return s.length === 8 ? s.slice(4, 6) + '/' + s.slice(6, 8) : s;
}

async function loadSchedule() {
  var tbody = document.getElementById('scheduleTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>로딩 중...</td></tr>';
  try {
    var res = await axios.get('/api/card-expenses/payment-schedule');
    var data = res.data.data || {};
    var cards = data.cards || [];

    setKpiText('scheduleTotal', (data.total_payment || 0).toLocaleString() + '원');
    setKpiText('scheduleCardCount', cards.length + '개');
    setKpiText('scheduleNextDate', data.next_payment_date || '-');

    if (!cards.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">등록된 카드가 없습니다</td></tr>';
      return;
    }

    tbody.innerHTML = cards.map(function(c) {
      var pct = c.limit_usage_pct;
      var pctColor = pct > 90 ? 'text-red-600' : pct > 70 ? 'text-yellow-600' : 'text-green-600';
      var pctBar = c.monthly_limit > 0
        ? '<div class="w-16 bg-gray-100 rounded-full h-1.5 inline-block ml-1"><div class="rounded-full h-1.5" style="width:' + Math.min(pct, 100) + '%;background:' + (pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e') + '"></div></div>'
        : '';
      return '<tr>' +
        '<td class="px-3 py-2 font-medium" title="' + escapeHtml(c.card_name || '') + '">' + escapeHtml(c.card_name) + (c.card_number_last4 ? ' <span class="text-gray-400">' + c.card_number_last4 + '</span>' : '') + '</td>' +
        '<td class="px-3 py-2 text-sm text-gray-600">' + escapeHtml(c.card_company || '') + '</td>' +
        '<td class="px-3 py-2 text-center text-sm text-gray-500 whitespace-nowrap">' + fmtMmDd(c.cycle_start) + ' ~ ' + fmtMmDd(c.cycle_end) + '</td>' +
        '<td class="px-3 py-2 text-center text-sm font-medium whitespace-nowrap">' + (c.payment_date || '-') + '</td>' +
        '<td class="px-3 py-2 text-right tabular-nums font-bold">' + (c.net_amount || 0).toLocaleString() + '원</td>' +
        '<td class="px-3 py-2 text-center"><span class="text-xs font-medium ' + pctColor + '">' + (pct != null ? pct + '%' : '-') + '</span>' + pctBar + '</td>' +
        '<td class="px-3 py-2 text-center text-sm text-gray-500">' + (c.tx_count || 0) + '</td></tr>';
    }).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-400">로딩 실패</td></tr>';
  }
}

// ===== Report (Phase 5) =====
var reportInitialized = false;
function initReport() {
  if (reportInitialized) return;
  reportInitialized = true;
  var sel = document.getElementById('reportMonth');
  if (!sel) return;
  var now = new Date();
  for (var i = 0; i < 12; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var val = d.getFullYear() + '' + String(d.getMonth() + 1).padStart(2, '0');
    var label = d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월';
    sel.innerHTML += '<option value="' + val + '"' + (i === 0 ? ' selected' : '') + '>' + label + '</option>';
  }
  loadReport();
}

async function loadReport() {
  var month = document.getElementById('reportMonth').value;
  if (!month) return;
  try {
    var res = await axios.get('/api/card-expenses/report?month=' + month);
    var data = res.data.data || {};
    var byCat = data.by_category || [];
    var byCard = data.by_card || [];
    var grand = data.grand_total || 0;

    document.getElementById('reportGrandTotal').textContent = '총 ' + grand.toLocaleString() + '원';

    // 카테고리별 바
    var catHtml = '';
    byCat.forEach(function(c) {
      var pct = grand > 0 ? Math.round(c.total / grand * 100) : 0;
      catHtml += '<div class="flex items-center gap-2">' +
        '<span class="w-24 text-xs font-medium truncate" style="color:' + (c.color || '#6b7280') + '"><i class="fas ' + (c.icon || 'fa-tag') + ' mr-1"></i>' + escapeHtml(c.category_name || '미분류') + '</span>' +
        '<div class="flex-1 bg-gray-100 rounded-full h-4"><div class="rounded-full h-4 flex items-center justify-end px-1" style="width:' + Math.max(pct, 2) + '%;background:' + (c.color || '#6b7280') + '20;border:1px solid ' + (c.color || '#6b7280') + '40"><span class="text-[10px] font-bold" style="color:' + (c.color || '#6b7280') + '">' + pct + '%</span></div></div>' +
        '<span class="w-20 text-xs text-right tabular-nums font-medium">' + c.total.toLocaleString() + '</span>' +
        '<span class="w-10 text-xs text-gray-400 text-right">' + c.count + '건</span></div>';
    });
    document.getElementById('reportCategoryBars').innerHTML = catHtml || '<div class="text-center text-gray-400 py-4">데이터 없음</div>';

    // 카드별 바
    var cardHtml = '';
    byCard.forEach(function(c) {
      var pct = grand > 0 ? Math.round(c.total / grand * 100) : 0;
      cardHtml += '<div class="flex items-center gap-2">' +
        '<span class="w-28 text-xs font-medium truncate">' + escapeHtml(c.card_name || '알 수 없음') + '</span>' +
        '<div class="flex-1 bg-gray-100 rounded-full h-4"><div class="rounded-full h-4 flex items-center justify-end px-1" style="width:' + Math.max(pct, 2) + '%;background:#3b82f620;border:1px solid #3b82f640"><span class="text-[10px] font-bold text-blue-600">' + pct + '%</span></div></div>' +
        '<span class="w-20 text-xs text-right tabular-nums font-medium">' + c.total.toLocaleString() + '</span>' +
        '<span class="w-10 text-xs text-gray-400 text-right">' + c.count + '건</span></div>';
    });
    document.getElementById('reportCardBars').innerHTML = cardHtml || '<div class="text-center text-gray-400 py-4">데이터 없음</div>';
  } catch (e) {
    console.error('Report error:', e);
  }
}

// ===== Load Users for assignment =====
async function loadUsers() {
  try {
    var res = await axios.get('/api/users');
    var users = res.data.data || res.data.users || [];
    var sel = document.getElementById('cardAssignedUser');
    if (!sel) return;
    sel.innerHTML = '<option value="">미지정</option>';
    users.forEach(function(u) {
      sel.innerHTML += '<option value="' + u.id + '">' + escapeHtml(u.name || u.username) + '</option>';
    });
  } catch (e) { /* ignore */ }
}

// ===== Utility =====
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function parseMoney(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace(/[,\s원]/g, '')) || 0;
}
function fmtMoneyInput(n) {
  return n ? Number(n).toLocaleString() : '';
}

// ===== Init =====
loadUsers();
init();
