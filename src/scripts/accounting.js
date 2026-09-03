// 회계 허브 (/accounting) — Phase 1: 요약 KPI + 입금 탭 / Phase 2: 세금계산서·현금영수증 탭(조회)
// ?raw 전역스코프 공유 → 모든 식별자 acc* prefix (feedback-raw-concat-global-scope)
// 공용 헬퍼: axios · showToast · escapeHtml · parseMoney · bindMoneyInputs · dsSkeleton

var accState = { tab: 'payments', pPage: 1, tPage: 1, cPage: 1, cardPage: 1, purPage: 1, tlPage: 1, ietPage: 1, limit: 50, loaded: { payments: false, tax: false, cash: false, card: false, purchase: false, timeline: false, inter: false } };

function accWon(n) { return window.fmtNum(n) + '원'; }

// 세금계산서·현금영수증 공통 상태 라벨/색상 (taxInvoices.js 미러, acc-prefix 격리)
var ACC_STATUS_LABEL = { DRAFT: '작성중', ISSUING: '발행중', ISSUED: '발행완료', SENT: '전송완료', FAILED: '전송실패', CANCELLED: '취소', NTS_SUCCESS: '국세청성공', NTS_FAILED: '국세청실패' };
var ACC_STATUS_COLOR = { DRAFT: 'bg-gray-100 text-gray-600', ISSUING: 'bg-amber-50 text-amber-700', ISSUED: 'bg-blue-50 text-blue-700', SENT: 'bg-green-50 text-green-700', FAILED: 'bg-red-50 text-red-700', CANCELLED: 'bg-gray-100 text-gray-400 line-through', NTS_SUCCESS: 'bg-green-50 text-green-700', NTS_FAILED: 'bg-amber-50 text-amber-700' };
function accBadge(status) {
  var cls = ACC_STATUS_COLOR[status] || 'bg-gray-100 text-gray-600';
  return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ' + cls + '">' + (ACC_STATUS_LABEL[status] || status || '-') + '</span>';
}

// 탭 구성
var ACC_TABS = {
  payments: { btn: 'accTabPayments', content: 'accPaymentsTab', load: function () { accLoadPayments(); } },
  tax: { btn: 'accTabTax', content: 'accTaxTab', load: function () { accLoadTax(); } },
  cash: { btn: 'accTabCash', content: 'accCashTab', load: function () { accLoadCash(); } },
  card: { btn: 'accTabCard', content: 'accCardTab', load: function () { accLoadCard(); } },
  purchase: { btn: 'accTabPurchase', content: 'accPurchaseTab', load: function () { accLoadPurchase(); } },
  timeline: { btn: 'accTabTimeline', content: 'accTimelineTab', load: function () { accLoadTimeline(); } },
  inter: { btn: 'accTabInter', content: 'accInterTab', load: function () { accLoadInter(); } },
  asset: { btn: 'accTabAsset', content: 'accAssetTab', load: function () { faLoad(); } },
};
function accSwitchTab(tab) {
  if (!ACC_TABS[tab]) return;
  accState.tab = tab;
  Object.keys(ACC_TABS).forEach(function (t) {
    var cfg = ACC_TABS[t];
    var btn = document.getElementById(cfg.btn);
    var content = document.getElementById(cfg.content);
    if (!btn || !content) return;
    if (t === tab) { btn.classList.add('active'); content.style.display = ''; }
    else { btn.classList.remove('active'); content.style.display = 'none'; }
  });
  if (!accState.loaded[tab]) ACC_TABS[tab].load();
}

// 공용 페이지네이션 렌더 (gotoFn = 전역 함수명)
function accPaginate(elId, pag, gotoFn) {
  var el = document.getElementById(elId);
  if (!el) return;
  var total = pag.total || 0, page = pag.page || 1, limit = pag.limit || accState.limit;
  var pages = Math.max(1, pag.total_pages || Math.ceil(total / limit));
  var info = '총 ' + total.toLocaleString() + '건 · ' + page + '/' + pages + ' 페이지';
  var btns = '';
  if (page > 1) btns += '<button onclick="' + gotoFn + '(' + (page - 1) + ')" class="px-3 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 mr-1"><i class="fas fa-chevron-left"></i> 이전</button>';
  if (page < pages) btns += '<button onclick="' + gotoFn + '(' + (page + 1) + ')" class="px-3 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50">다음 <i class="fas fa-chevron-right"></i></button>';
  el.innerHTML = '<span>' + info + '</span><span>' + btns + '</span>';
}

function accPmBadge(method) {
  // 시맨틱 5색 내 매핑 (보라/에메랄드/로즈=차트 전용 금지) — ledger 입금방법 뱃지와 동일 체계
  var m = method || '기타';
  var cls = 'bg-gray-100 text-gray-600';
  if (m === '카드') cls = 'bg-gray-100 text-gray-700';
  else if (m === '현금') cls = 'bg-green-50 text-green-700';
  else if (m === '계좌이체') cls = 'bg-blue-50 text-blue-700';
  else if (m === '수표') cls = 'bg-amber-50 text-amber-700';
  else if (m === '어음') cls = 'bg-red-50 text-red-700';
  return '<span class="pm-badge ' + cls + '">' + escapeHtml(m) + '</span>';
}

// ===== 기간 =====
function accSetPeriod(preset) {
  var now = new Date();
  var y = now.getFullYear(), m = now.getMonth();
  var s, e;
  if (preset === 'thisMonth') { s = new Date(y, m, 1); e = new Date(y, m + 1, 0); }
  else if (preset === 'lastMonth') { s = new Date(y, m - 1, 1); e = new Date(y, m, 0); }
  else if (preset === 'thisYear') { s = new Date(y, 0, 1); e = new Date(y, 11, 31); }
  else return;
  document.getElementById('accStart').value = accFmtDate(s);
  document.getElementById('accEnd').value = accFmtDate(e);
  accReload();
}

function accFmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 기간 변경 → KPI + 활성 탭 갱신 (페이지 리셋, 비활성 탭은 stale 처리 → 전환 시 재로드)
function accReload() {
  accState.pPage = 1; accState.tPage = 1; accState.cPage = 1; accState.cardPage = 1; accState.purPage = 1; accState.tlPage = 1; accState.ietPage = 1;
  accState.loaded = { payments: false, tax: false, cash: false, card: false, purchase: false, timeline: false, inter: false };
  accLoadSummary();
  ACC_TABS[accState.tab].load();
}

// 입금 필터(검색·금액)만 변경 → 입금목록만 갱신
function accSearchNow() { accState.pPage = 1; accLoadPayments(); }

function accResetFilters() {
  document.getElementById('accSearch').value = '';
  document.getElementById('accAmtMin').value = '';
  document.getElementById('accAmtMax').value = '';
  accState.pPage = 1;
  accLoadPayments();
}

// ===== 요약 KPI =====
async function accLoadSummary() {
  var start = document.getElementById('accStart').value;
  var end = document.getElementById('accEnd').value;
  try {
    var res = await axios.get('/api/accounting/summary?start=' + start + '&end=' + end);
    var d = res.data.data || {};
    document.getElementById('accKpiRevenue').textContent = accWon(d.revenue);
    document.getElementById('accKpiExpense').textContent = accWon(d.expense_total);
    document.getElementById('accKpiExpenseBreak').textContent =
      '카드 ' + accWon(d.expense_card) + ' · 매입 ' + accWon(d.expense_purchase);
    document.getElementById('accKpiReceivable').textContent = accWon(d.receivable);
    // 선수금 = 잔액이 음수인 거래처 합(회계상 부채). 종전엔 매출채권과 상계돼 미수금이 과소 표시됐다.
    var adv = document.getElementById('accKpiAdvance');
    if (!adv) { console.warn('[accounting] #accKpiAdvance not found'); }
    else if (d.advance_received > 0) {
      adv.innerHTML = '<span class="text-blue-600">선수금 ' + accWon(d.advance_received) +
        '</span> <span class="text-gray-400">(' + (d.advance_clients || 0) + '곳) · 순액 ' + accWon(d.receivable_net) + '</span>';
    } else { adv.textContent = ''; }
  } catch (e) {
    console.error('[accounting] summary error', e);
    showToast('요약 로드 실패', 'error');
  }
}

// ===== 입금 목록 =====
async function accLoadPayments() {
  var body = document.getElementById('accPaymentsBody');
  if (!body) { console.warn('[accounting] #accPaymentsBody not found'); return; }
  if (window.dsSkeleton) body.innerHTML = window.dsSkeleton.loadingRow(8);

  var params = new URLSearchParams();
  var start = document.getElementById('accStart').value;
  var end = document.getElementById('accEnd').value;
  var search = document.getElementById('accSearch').value.trim();
  var amtMin = window.parseMoney(document.getElementById('accAmtMin').value);
  var amtMax = window.parseMoney(document.getElementById('accAmtMax').value);
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  if (search) params.set('search', search);
  if (amtMin != null) params.set('amountMin', amtMin);
  if (amtMax != null) params.set('amountMax', amtMax);
  params.set('page', accState.pPage);
  params.set('limit', accState.limit);

  try {
    var res = await axios.get('/api/accounting/payments?' + params.toString());
    var data = res.data.data || [];
    var sum = res.data.summary || {};
    var pag = res.data.pagination || {};
    accState.loaded.payments = true;

    document.getElementById('accResultCount').textContent = (sum.total_count || 0).toLocaleString();
    document.getElementById('accResultSum').textContent = accWon(sum.total_amount);

    if (!data.length) {
      body.innerHTML = '<tr><td colspan="8" class="text-center py-10 text-gray-400"><i class="fas fa-money-bill-wave text-3xl mb-2 block text-gray-300"></i>입금 내역이 없습니다</td></tr>';
      document.getElementById('accPagination').innerHTML = '';
      return;
    }

    body.innerHTML = data.map(accRenderRow).join('');
    accPaginate('accPagination', pag, 'accPaymentsGoto');
  } catch (e) {
    console.error('[accounting] payments error', e);
    body.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-400">입금 목록 로드 실패</td></tr>';
    showToast('입금 목록 로드 실패', 'error');
  }
}

function accRenderRow(p) {
  var dateStr = (p.payment_date || '').slice(0, 10);
  return '<tr class="acc-row border-b">' +
    '<td class="px-3 py-2 text-left text-gray-700">' + escapeHtml(dateStr) + '</td>' +
    '<td class="px-3 py-2 text-left font-medium text-gray-800">' + escapeHtml(p.client_name || '-') + '</td>' +
    '<td class="px-3 py-2 text-right tabular-nums font-semibold text-blue-700">' + (Number(p.amount) || 0).toLocaleString() + '</td>' +
    '<td class="px-2 py-2 text-center">' + accPmBadge(p.payment_method) + '</td>' +
    '<td class="px-3 py-2 text-left text-gray-500 text-xs">' + escapeHtml(p.reference_number || '') + '</td>' +
    '<td class="px-3 py-2 text-left text-gray-500 text-xs">' + escapeHtml(p.notes || '') + '</td>' +
    '<td class="px-3 py-2 text-left text-gray-500 text-xs">' + escapeHtml(p.created_by_name || '') + '</td>' +
    '<td class="px-2 py-2 text-center whitespace-nowrap">' +
      '<button onclick="accEditPayment(' + p.id + ')" class="text-blue-500 hover:text-blue-700 px-1" title="수정"><i class="fas fa-pen"></i></button>' +
      '<button onclick="accDeletePayment(' + p.id + ',\'' + escapeJsAttr(p.client_name || '') + '\')" class="text-red-400 hover:text-red-600 px-1" title="삭제"><i class="fas fa-trash"></i></button>' +
    '</td>' +
  '</tr>';
}

function accPaymentsGoto(p) { accState.pPage = p; accLoadPayments(); }

// ===== 세금계산서 (조회) =====
async function accLoadTax() {
  var body = document.getElementById('accTaxBody');
  if (!body) { console.warn('[accounting] #accTaxBody not found'); return; }
  if (window.dsSkeleton) body.innerHTML = window.dsSkeleton.loadingRow(7);
  var params = new URLSearchParams();
  var start = document.getElementById('accStart').value;
  var end = document.getElementById('accEnd').value;
  var status = document.getElementById('accTaxStatus').value;
  var search = document.getElementById('accTaxSearch').value.trim();
  if (start) params.set('date_from', start);
  if (end) params.set('date_to', end);
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  params.set('page', accState.tPage);
  params.set('limit', accState.limit);
  try {
    var res = await axios.get('/api/tax-invoices?' + params.toString());
    var data = res.data.data || [];
    var pag = res.data.pagination || {};
    accState.loaded.tax = true;
    if (!data.length) {
      body.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-gray-400"><i class="fas fa-file-invoice text-3xl mb-2 block text-gray-300"></i>세금계산서가 없습니다</td></tr>';
      document.getElementById('accTaxPagination').innerHTML = '';
      return;
    }
    body.innerHTML = data.map(accRenderTaxRow).join('');
    accPaginate('accTaxPagination', pag, 'accTaxGoto');
  } catch (e) {
    console.error('[accounting] tax error', e);
    body.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-400">세금계산서 로드 실패</td></tr>';
    showToast('세금계산서 로드 실패', 'error');
  }
}
function accTaxGoto(p) { accState.tPage = p; accLoadTax(); }
function accRenderTaxRow(inv) {
  var d = (inv.issue_date || '').slice(0, 10);
  var name = inv.buyer_name || inv.buyer_client_name || '-';
  return '<tr class="acc-row border-b">' +
    '<td class="px-3 py-2 text-left text-gray-700">' + escapeHtml(d) + '</td>' +
    '<td class="px-3 py-2 text-left text-gray-700 text-xs">' + escapeHtml(inv.invoice_number || '-') + '</td>' +
    '<td class="px-3 py-2 text-left font-medium text-gray-800">' + escapeHtml(name) + '</td>' +
    '<td class="px-3 py-2 text-right tabular-nums">' + (Number(inv.supply_amount) || 0).toLocaleString() + '</td>' +
    '<td class="px-3 py-2 text-right tabular-nums text-gray-500">' + (Number(inv.tax_amount) || 0).toLocaleString() + '</td>' +
    '<td class="px-3 py-2 text-right tabular-nums font-semibold text-gray-800">' + (Number(inv.total_amount) || 0).toLocaleString() + '</td>' +
    '<td class="px-2 py-2 text-center">' + accBadge(inv.status) + '</td>' +
  '</tr>';
}

// ===== 현금영수증 (조회) =====
async function accLoadCash() {
  var body = document.getElementById('accCashBody');
  if (!body) { console.warn('[accounting] #accCashBody not found'); return; }
  if (window.dsSkeleton) body.innerHTML = window.dsSkeleton.loadingRow(6);
  var params = new URLSearchParams();
  var start = document.getElementById('accStart').value;
  var end = document.getElementById('accEnd').value;
  var status = document.getElementById('accCashStatus').value;
  var search = document.getElementById('accCashSearch').value.trim();
  if (start) params.set('date_from', start);
  if (end) params.set('date_to', end);
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  params.set('page', accState.cPage);
  params.set('limit', accState.limit);
  try {
    var res = await axios.get('/api/cash-receipts?' + params.toString());
    var data = res.data.data || [];
    var pag = res.data.pagination || {};
    accState.loaded.cash = true;
    if (!data.length) {
      body.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-gray-400"><i class="fas fa-receipt text-3xl mb-2 block text-gray-300"></i>현금영수증이 없습니다</td></tr>';
      document.getElementById('accCashPagination').innerHTML = '';
      return;
    }
    body.innerHTML = data.map(accRenderCashRow).join('');
    accPaginate('accCashPagination', pag, 'accCashGoto');
  } catch (e) {
    console.error('[accounting] cash error', e);
    body.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-red-400">현금영수증 로드 실패</td></tr>';
    showToast('현금영수증 로드 실패', 'error');
  }
}
function accCashGoto(p) { accState.cPage = p; accLoadCash(); }
function accRenderCashRow(r) {
  var d = (r.trade_date || '').slice(0, 10);
  return '<tr class="acc-row border-b">' +
    '<td class="px-3 py-2 text-left text-gray-700">' + escapeHtml(d) + '</td>' +
    '<td class="px-3 py-2 text-left text-gray-700 text-xs">' + escapeHtml(r.receipt_number || '-') + '</td>' +
    '<td class="px-3 py-2 text-left font-medium text-gray-800">' + escapeHtml(r.client_name || '-') + '</td>' +
    '<td class="px-3 py-2 text-left text-gray-500 text-xs">' + escapeHtml(r.identity_number || '') + '</td>' +
    '<td class="px-3 py-2 text-right tabular-nums font-semibold text-gray-800">' + (Number(r.total_amount) || 0).toLocaleString() + '</td>' +
    '<td class="px-2 py-2 text-center">' + accBadge(r.status) + '</td>' +
  '</tr>';
}

// ===== 카드 (조회 — 분류/정정은 /card-expenses) =====
function accFmtCompact(d) {
  var s = String(d || '');
  return s.length === 8 ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) : s;
}
async function accLoadCard() {
  var body = document.getElementById('accCardBody');
  if (!body) { console.warn('[accounting] #accCardBody not found'); return; }
  if (window.dsSkeleton) body.innerHTML = window.dsSkeleton.loadingRow(6);
  var params = new URLSearchParams();
  var start = document.getElementById('accStart').value;
  var end = document.getElementById('accEnd').value;
  var search = document.getElementById('accCardSearch').value.trim();
  if (start) params.set('start_date', start);
  if (end) params.set('end_date', end);
  if (search) params.set('search', search);
  params.set('page', accState.cardPage);
  params.set('limit', accState.limit);
  try {
    var res = await axios.get('/api/card-expenses/transactions?' + params.toString());
    var data = res.data.data || [];
    var pag = res.data.pagination || {};
    accState.loaded.card = true;
    var pageSum = data.reduce(function (a, t) { return a + (t.approval_type === 'CANCEL' ? -(Number(t.amount) || 0) : (Number(t.amount) || 0)); }, 0);
    document.getElementById('accCardSum').textContent = accWon(pageSum);
    if (!data.length) {
      body.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-gray-400"><i class="fas fa-credit-card text-3xl mb-2 block text-gray-300"></i>카드 사용내역이 없습니다</td></tr>';
      document.getElementById('accCardPagination').innerHTML = '';
      return;
    }
    body.innerHTML = data.map(accRenderCardRow).join('');
    accPaginate('accCardPagination', pag, 'accCardGoto');
  } catch (e) {
    console.error('[accounting] card error', e);
    body.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-red-400">카드 내역 로드 실패</td></tr>';
    showToast('카드 내역 로드 실패', 'error');
  }
}
function accCardGoto(p) { accState.cardPage = p; accLoadCard(); }
function accCardStatusBadge(s) {
  var map = { UNCLASSIFIED: ['미분류', 'bg-gray-100 text-gray-500'], CLASSIFIED: ['분류완료', 'bg-blue-50 text-blue-700'], REQUESTED: ['상신', 'bg-amber-50 text-amber-700'], APPROVED: ['승인', 'bg-green-50 text-green-700'] };
  var m = map[s] || [s || '-', 'bg-gray-100 text-gray-600'];
  return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ' + m[1] + '">' + m[0] + '</span>';
}
function accRenderCardRow(t) {
  var d = accFmtCompact(t.transaction_date);
  var isCancel = t.approval_type === 'CANCEL';
  var cardLabel = (t.card_company || t.card_name || '카드') + (t.card_number_last4 ? ' ' + t.card_number_last4 : '');
  var amt = Number(t.amount) || 0;
  var cat = t.category_name
    ? '<span class="pm-badge bg-indigo-50 text-indigo-700">' + escapeHtml(t.category_name) + '</span>'
    : '<span class="text-gray-300 text-xs">미분류</span>';
  return '<tr class="acc-row border-b">' +
    '<td class="px-3 py-2 text-left text-gray-700">' + escapeHtml(d) + '</td>' +
    '<td class="px-3 py-2 text-left text-gray-600 text-xs">' + escapeHtml(cardLabel) + '</td>' +
    '<td class="px-3 py-2 text-left font-medium text-gray-800">' + escapeHtml(t.merchant_name || '-') + (isCancel ? ' <span class="text-rose-500 text-xs">(취소)</span>' : '') + '</td>' +
    '<td class="px-3 py-2 text-right tabular-nums font-semibold ' + (isCancel ? 'text-rose-500' : 'text-red-600') + '">' + (isCancel ? '-' : '') + amt.toLocaleString() + '</td>' +
    '<td class="px-3 py-2 text-left">' + cat + '</td>' +
    '<td class="px-2 py-2 text-center">' + accCardStatusBadge(t.status) + '</td>' +
  '</tr>';
}

// ===== 매입 (조회 — 매입확정/정정은 /purchase-invoices) =====
async function accLoadPurchase() {
  var body = document.getElementById('accPurchaseBody');
  if (!body) { console.warn('[accounting] #accPurchaseBody not found'); return; }
  if (window.dsSkeleton) body.innerHTML = window.dsSkeleton.loadingRow(7);
  var params = new URLSearchParams();
  var start = document.getElementById('accStart').value;
  var end = document.getElementById('accEnd').value;
  var status = document.getElementById('accPurStatus').value;
  var search = document.getElementById('accPurSearch').value.trim();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  if (status) params.set('paymentStatus', status);
  if (search) params.set('search', search);
  params.set('page', accState.purPage);
  params.set('limit', accState.limit);
  try {
    var res = await axios.get('/api/accounting/purchases?' + params.toString());
    var data = res.data.data || [];
    var sum = res.data.summary || {};
    var pag = res.data.pagination || {};
    accState.loaded.purchase = true;
    document.getElementById('accPurSum').textContent = accWon(sum.total_amount);
    if (!data.length) {
      body.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-gray-400"><i class="fas fa-file-invoice-dollar text-3xl mb-2 block text-gray-300"></i>매입 내역이 없습니다</td></tr>';
      document.getElementById('accPurchasePagination').innerHTML = '';
      return;
    }
    body.innerHTML = data.map(accRenderPurchaseRow).join('');
    accPaginate('accPurchasePagination', pag, 'accPurchaseGoto');
  } catch (e) {
    console.error('[accounting] purchase error', e);
    body.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-400">매입 내역 로드 실패</td></tr>';
    showToast('매입 내역 로드 실패', 'error');
  }
}
function accPurchaseGoto(p) { accState.purPage = p; accLoadPurchase(); }
function accPayStatusBadge(s) {
  var map = { UNPAID: ['미지급', 'bg-red-50 text-red-600'], PARTIAL: ['부분지급', 'bg-amber-50 text-amber-700'], PAID: ['지급완료', 'bg-green-50 text-green-700'] };
  var m = map[s] || [s || '-', 'bg-gray-100 text-gray-600'];
  return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ' + m[1] + '">' + m[0] + '</span>';
}
function accRenderPurchaseRow(pi) {
  var d = (pi.invoice_date || '').slice(0, 10);
  return '<tr class="acc-row border-b">' +
    '<td class="px-3 py-2 text-left text-gray-700">' + escapeHtml(d) + '</td>' +
    '<td class="px-3 py-2 text-left text-gray-700 text-xs">' + escapeHtml(pi.invoice_number || '-') + '</td>' +
    '<td class="px-3 py-2 text-left font-medium text-gray-800">' + escapeHtml(pi.supplier_name || '-') + '</td>' +
    '<td class="px-3 py-2 text-right tabular-nums text-gray-600">' + (Number(pi.subtotal) || 0).toLocaleString() + '</td>' +
    '<td class="px-3 py-2 text-right tabular-nums text-gray-500">' + (Number(pi.vat_amount) || 0).toLocaleString() + '</td>' +
    '<td class="px-3 py-2 text-right tabular-nums font-semibold text-red-600">' + (Number(pi.total_amount) || 0).toLocaleString() + '</td>' +
    '<td class="px-2 py-2 text-center">' + accPayStatusBadge(pi.payment_status) + '</td>' +
  '</tr>';
}

// ===== CSV 내보내기 (현재 탭 · 필터 반영 · 페이지 루프 최대 5000건) =====
var ACC_CSV_CAP = 5000;
var ACC_CSV_TABS = {
  payments: {
    name: '입금', url: '/api/accounting/payments',
    params: function () {
      var p = new URLSearchParams();
      var start = document.getElementById('accStart').value;
      var end = document.getElementById('accEnd').value;
      var search = document.getElementById('accSearch').value.trim();
      var amtMin = window.parseMoney(document.getElementById('accAmtMin').value);
      var amtMax = window.parseMoney(document.getElementById('accAmtMax').value);
      if (start) p.set('start', start);
      if (end) p.set('end', end);
      if (search) p.set('search', search);
      if (amtMin != null) p.set('amountMin', amtMin);
      if (amtMax != null) p.set('amountMax', amtMax);
      return p;
    },
    headers: ['입금일', '거래처', '금액', '결제수단', '참조번호', '비고', '등록자'],
    row: function (p) { return [(p.payment_date || '').slice(0, 10), p.client_name || '', Number(p.amount) || 0, p.payment_method || '', p.reference_number || '', p.notes || '', p.created_by_name || '']; }
  },
  tax: {
    name: '세금계산서', url: '/api/tax-invoices',
    params: function () {
      var p = new URLSearchParams();
      var start = document.getElementById('accStart').value;
      var end = document.getElementById('accEnd').value;
      var status = document.getElementById('accTaxStatus').value;
      var search = document.getElementById('accTaxSearch').value.trim();
      if (start) p.set('date_from', start);
      if (end) p.set('date_to', end);
      if (status) p.set('status', status);
      if (search) p.set('search', search);
      return p;
    },
    headers: ['발행일', '계산서번호', '거래처', '공급가액', '세액', '합계', '상태'],
    row: function (inv) { return [(inv.issue_date || '').slice(0, 10), inv.invoice_number || '', inv.buyer_name || inv.buyer_client_name || '', Number(inv.supply_amount) || 0, Number(inv.tax_amount) || 0, Number(inv.total_amount) || 0, ACC_STATUS_LABEL[inv.status] || inv.status || '']; }
  },
  cash: {
    name: '현금영수증', url: '/api/cash-receipts',
    params: function () {
      var p = new URLSearchParams();
      var start = document.getElementById('accStart').value;
      var end = document.getElementById('accEnd').value;
      var status = document.getElementById('accCashStatus').value;
      var search = document.getElementById('accCashSearch').value.trim();
      if (start) p.set('date_from', start);
      if (end) p.set('date_to', end);
      if (status) p.set('status', status);
      if (search) p.set('search', search);
      return p;
    },
    headers: ['거래일', '승인번호', '거래처', '신분확인', '금액', '상태'],
    row: function (r) { return [(r.trade_date || '').slice(0, 10), r.receipt_number || '', r.client_name || '', r.identity_number || '', Number(r.total_amount) || 0, ACC_STATUS_LABEL[r.status] || r.status || '']; }
  },
  card: {
    name: '카드', url: '/api/card-expenses/transactions',
    params: function () {
      var p = new URLSearchParams();
      var start = document.getElementById('accStart').value;
      var end = document.getElementById('accEnd').value;
      var search = document.getElementById('accCardSearch').value.trim();
      if (start) p.set('start_date', start);
      if (end) p.set('end_date', end);
      if (search) p.set('search', search);
      return p;
    },
    headers: ['승인일', '카드', '가맹점', '금액', '분류', '상태'],
    row: function (t) {
      var isCancel = t.approval_type === 'CANCEL';
      var cardLabel = (t.card_company || t.card_name || '카드') + (t.card_number_last4 ? ' ' + t.card_number_last4 : '');
      var stMap = { UNCLASSIFIED: '미분류', CLASSIFIED: '분류완료', REQUESTED: '상신', APPROVED: '승인' };
      return [accFmtCompact(t.transaction_date), cardLabel, (t.merchant_name || '') + (isCancel ? ' (취소)' : ''), (isCancel ? -1 : 1) * (Number(t.amount) || 0), t.category_name || '미분류', stMap[t.status] || t.status || ''];
    }
  },
  purchase: {
    name: '매입', url: '/api/accounting/purchases',
    params: function () {
      var p = new URLSearchParams();
      var start = document.getElementById('accStart').value;
      var end = document.getElementById('accEnd').value;
      var status = document.getElementById('accPurStatus').value;
      var search = document.getElementById('accPurSearch').value.trim();
      if (start) p.set('start', start);
      if (end) p.set('end', end);
      if (status) p.set('paymentStatus', status);
      if (search) p.set('search', search);
      return p;
    },
    headers: ['매입일', '전표번호', '공급처', '공급가액', '부가세', '합계', '지급상태'],
    row: function (pi) {
      var stMap = { UNPAID: '미지급', PARTIAL: '부분지급', PAID: '지급완료' };
      return [(pi.invoice_date || '').slice(0, 10), pi.invoice_number || '', pi.supplier_name || '', Number(pi.subtotal) || 0, Number(pi.vat_amount) || 0, Number(pi.total_amount) || 0, stMap[pi.payment_status] || pi.payment_status || ''];
    }
  }
};

async function accExportCsv() {
  var cfg = ACC_CSV_TABS[accState.tab];
  if (!cfg) { showToast('이 탭은 CSV 내보내기를 지원하지 않습니다', 'warning'); return; }
  var btn = document.getElementById('accCsvBtn');
  if (btn) btn.disabled = true;
  try {
    var params = cfg.params();
    var rows = [];
    var page = 1;
    for (;;) {
      params.set('page', page);
      params.set('limit', 200);
      var res = await axios.get(cfg.url + '?' + params.toString());
      var data = res.data.data || [];
      rows = rows.concat(data);
      var pag = res.data.pagination || {};
      var totalPages = Math.max(1, pag.total_pages || Math.ceil((pag.total || 0) / (pag.limit || 200)));
      if (!data.length || page >= totalPages || rows.length > ACC_CSV_CAP) break;
      page++;
    }
    var truncated = rows.length > ACC_CSV_CAP;
    rows = rows.slice(0, ACC_CSV_CAP);
    if (!rows.length) { showToast('내보낼 데이터가 없습니다', 'warning'); return; }
    var esc = window.dsCsvCell;
    var lines = [cfg.headers.map(esc).join(',')];
    rows.forEach(function (r) { lines.push(cfg.row(r).map(esc).join(',')); });
    if (truncated) lines.push(esc('※ 결과가 ' + ACC_CSV_CAP + '건을 초과하여 일부만 내보냈습니다. 기간/필터를 좁혀 다시 받으세요.'));
    var start = document.getElementById('accStart').value;
    var end = document.getElementById('accEnd').value;
    var fname = '회계_' + cfg.name + '_' + (start || '전체') + '_' + (end || '전체') + '.csv';
    var BOM = String.fromCharCode(0xFEFF);
    window.dsDownloadCsv(fname, BOM + lines.join('\r\n'));
    showToast(rows.length.toLocaleString() + '건 CSV 다운로드 완료', 'success');
  } catch (e) {
    console.error('[accounting] csv export error', e);
    showToast('CSV 내보내기 실패', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ===== 통합 타임라인 (수입/지출 단일 목록) =====
async function accLoadTimeline() {
  var body = document.getElementById('accTimelineBody');
  if (!body) { console.warn('[accounting] #accTimelineBody not found'); return; }
  if (window.dsSkeleton) body.innerHTML = window.dsSkeleton.loadingRow(5);
  var params = new URLSearchParams();
  var start = document.getElementById('accStart').value;
  var end = document.getElementById('accEnd').value;
  var kind = document.getElementById('accTlKind').value;
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  if (kind) params.set('kind', kind);
  params.set('page', accState.tlPage);
  params.set('limit', accState.limit);
  try {
    var res = await axios.get('/api/accounting/timeline?' + params.toString());
    var data = res.data.data || [];
    var sum = res.data.summary || {};
    var pag = res.data.pagination || {};
    accState.loaded.timeline = true;
    document.getElementById('accTlIncome').textContent = accWon(sum.income_total);
    document.getElementById('accTlExpense').textContent = accWon(sum.expense_total);
    var net = Number(sum.net) || 0;
    var netEl = document.getElementById('accTlNet');
    netEl.textContent = (net >= 0 ? '+' : '-') + accWon(Math.abs(net));
    netEl.className = 'font-bold ' + (net >= 0 ? 'text-blue-700' : 'text-red-600');
    if (!data.length) {
      body.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-gray-400"><i class="fas fa-stream text-3xl mb-2 block text-gray-300"></i>해당 기간 내역이 없습니다</td></tr>';
      document.getElementById('accTimelinePagination').innerHTML = '';
      return;
    }
    body.innerHTML = data.map(accRenderTimelineRow).join('');
    accPaginate('accTimelinePagination', pag, 'accTimelineGoto');
  } catch (e) {
    console.error('[accounting] timeline error', e);
    body.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-400">타임라인 로드 실패</td></tr>';
    showToast('타임라인 로드 실패', 'error');
  }
}
function accTimelineGoto(p) { accState.tlPage = p; accLoadTimeline(); }
function accTlFlowBadge(label) {
  var cls = label === '입금' ? 'bg-blue-100 text-blue-800' : label === '카드' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800';
  return '<span class="pm-badge ' + cls + '">' + escapeHtml(label || '-') + '</span>';
}
function accRenderTimelineRow(r) {
  var d = (r.evt_date || '').slice(0, 10);
  var amt = Number(r.signed_amount) || 0;
  var pos = amt >= 0;
  return '<tr class="acc-row border-b">' +
    '<td class="px-3 py-2 text-left text-gray-700">' + escapeHtml(d) + '</td>' +
    '<td class="px-2 py-2 text-center">' + accTlFlowBadge(r.label) + '</td>' +
    '<td class="px-3 py-2 text-left font-medium text-gray-800">' + escapeHtml(r.party || '-') + '</td>' +
    '<td class="px-3 py-2 text-left text-gray-500 text-xs">' + escapeHtml(r.detail || '') + '</td>' +
    '<td class="px-3 py-2 text-right tabular-nums font-semibold ' + (pos ? 'text-blue-700' : 'text-red-600') + '">' + (pos ? '+' : '-') + Math.abs(amt).toLocaleString() + '</td>' +
  '</tr>';
}

// ===== 법인간 거래 탭 =====
var ACC_IET_TYPE = {
  SUBROGATION: ['대납', 'bg-amber-50 text-amber-700'],
  LOAN: ['자금대여', 'bg-blue-50 text-blue-700'],
  REPAYMENT: ['상환', 'bg-green-50 text-green-700'],
  INTERNAL_TRADE: ['내부거래', 'bg-indigo-50 text-indigo-700'],
  INVOICE_TRANSFER: ['계산서이전', 'bg-gray-100 text-gray-600'],
  OTHER: ['기타', 'bg-gray-100 text-gray-600'],
};
function accIetTypeBadge(t) {
  var m = ACC_IET_TYPE[t] || [t || '-', 'bg-gray-100 text-gray-600'];
  return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ' + m[1] + '">' + m[0] + '</span>';
}

var accIetEntities = null; // [{id, name, short_name}] 캐시
async function accIetLoadEntities() {
  if (accIetEntities) return accIetEntities;
  var res = await axios.get('/api/auth/entities');
  accIetEntities = res.data.data || [];
  return accIetEntities;
}

function accIetSearchNow() { accState.ietPage = 1; accLoadInter(); }
function accIetGoto(p) { accState.ietPage = p; accLoadInter(); }

async function accLoadInter() {
  var body = document.getElementById('accIetBody');
  if (!body) { console.warn('[accounting] #accIetBody not found'); return; }
  if (window.dsSkeleton) body.innerHTML = window.dsSkeleton.loadingRow(9);
  accLoadIetSummary();
  accLoadIetDerived();

  var params = new URLSearchParams();
  var start = document.getElementById('accStart').value;
  var end = document.getElementById('accEnd').value;
  var type = document.getElementById('accIetType').value;
  var search = document.getElementById('accIetSearch').value.trim();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  if (type) params.set('type', type);
  if (search) params.set('search', search);
  params.set('page', accState.ietPage);
  params.set('limit', accState.limit);

  try {
    var res = await axios.get('/api/accounting/inter-entity?' + params.toString());
    var data = res.data.data || [];
    var sum = res.data.summary || {};
    var pag = res.data.pagination || {};
    accState.loaded.inter = true;
    document.getElementById('accIetCount').textContent = (sum.total_count || 0).toLocaleString();
    document.getElementById('accIetSum').textContent = accWon(sum.total_amount);
    if (!data.length) {
      body.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-gray-400"><i class="fas fa-exchange-alt text-3xl mb-2 block text-gray-300"></i>법인간 거래 기록이 없습니다</td></tr>';
      document.getElementById('accIetPagination').innerHTML = '';
      return;
    }
    body.innerHTML = data.map(accIetRenderRow).join('');
    accPaginate('accIetPagination', pag, 'accIetGoto');
  } catch (e) {
    console.error('[accounting] inter-entity error', e);
    body.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-red-400">법인간 거래 로드 실패</td></tr>';
    showToast('법인간 거래 로드 실패', 'error');
  }
}

async function accLoadIetSummary() {
  var el = document.getElementById('accIetSummary');
  if (!el) return;
  try {
    var res = await axios.get('/api/accounting/inter-entity/summary');
    var pairs = res.data.data || [];
    if (!pairs.length) {
      el.innerHTML = '<span class="text-xs text-gray-400">잔액 없음 (기록이 없거나 전부 상계됨)</span>';
      return;
    }
    el.innerHTML = pairs.map(function (p) {
      if (!p.amount) {
        return '<span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-500">' +
          escapeHtml(p.creditor_name) + ' ⇄ ' + escapeHtml(p.debtor_name) + ' <b class="text-gray-600">정산 완료</b></span>';
      }
      return '<span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 text-xs text-indigo-800">' +
        '<b>' + escapeHtml(p.creditor_name) + '</b>이(가) <b>' + escapeHtml(p.debtor_name) + '</b>에 받을 돈 ' +
        '<b class="tabular-nums">' + (Number(p.amount) || 0).toLocaleString() + '원</b></span>';
    }).join('');
  } catch (e) {
    console.error('[accounting] inter-entity summary error', e);
    el.innerHTML = '<span class="text-xs text-red-400">잔액 로드 실패</span>';
  }
}

// ----- 주문·매입 기반 내부거래 채권·채무 (파생, 거래처원장에서 이관) -----
async function accLoadIetDerived() {
  var el = document.getElementById('accIetDerived');
  if (!el) return;
  try {
    var res = await axios.get('/api/accounting/inter-entity/derived');
    var rows = res.data.data || [];
    if (!rows.length) {
      el.innerHTML = '<div class="text-xs text-gray-400 py-1">주문·매입 기반 내부거래가 없습니다</div>';
      return;
    }
    el.innerHTML = '<div class="overflow-x-auto"><table class="ds-table ds-table-compact" style="width:100%">'
      + '<thead><tr class="text-[10px] text-gray-500 uppercase border-b">'
      + '<th class="px-3 py-2 text-left">방향 (매출법인 → 매입법인)</th>'
      + '<th class="px-3 py-2 text-right">매출채권(AR)</th>'
      + '<th class="px-3 py-2 text-right">상대 매입채무(AP)</th>'
      + '<th class="px-2 py-2 text-center">대사</th>'
      + '<th class="px-2 py-2 text-center">주문</th>'
      + '</tr></thead><tbody>'
      + rows.map(accIetDerivedRow).join('')
      + '</tbody></table></div>';
  } catch (e) {
    console.error('[accounting] inter-entity derived error', e);
    el.innerHTML = '<div class="text-xs text-red-400 py-1">내부거래 파생 로드 실패</div>';
  }
}

function accIetDerivedRow(p) {
  var recon = p.reconciled
    ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-50 text-green-700"><i class="fas fa-check mr-1"></i>일치</span>'
    : '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-red-50 text-red-700" title="매출채권↔상대 매입채무 차이 — 대사 필요">차이 ' + Math.round(p.diff).toLocaleString() + '원</span>';
  var oid = 'accIetDrill_' + p.from_entity_id + '_' + p.to_client_id;
  return '<tr class="acc-row border-b">'
    + '<td class="px-3 py-2 text-left font-medium text-gray-800">' + escapeHtml(p.from_name) + ' <i class="fas fa-arrow-right text-gray-300 text-[10px] mx-0.5"></i> ' + escapeHtml(p.to_name) + '</td>'
    + '<td class="px-3 py-2 text-right tabular-nums font-semibold text-indigo-700">' + Math.round(p.ar).toLocaleString() + '원</td>'
    + '<td class="px-3 py-2 text-right tabular-nums text-gray-600">' + Math.round(p.ap).toLocaleString() + '원</td>'
    + '<td class="px-2 py-2 text-center">' + recon + '</td>'
    + '<td class="px-2 py-2 text-center"><button onclick="accIetToggleDrill(' + p.from_entity_id + ',' + p.to_client_id + ')" class="text-blue-500 hover:text-blue-700 text-xs"><i class="fas fa-list mr-0.5"></i>보기</button></td>'
    + '</tr>'
    + '<tr id="' + oid + '" style="display:none"><td colspan="5" class="px-3 py-2 bg-gray-50"><div class="acc-drill-body text-xs text-gray-400">불러오는 중...</div></td></tr>';
}

async function accIetToggleDrill(fromEntityId, toClientId) {
  var row = document.getElementById('accIetDrill_' + fromEntityId + '_' + toClientId);
  if (!row) return;
  if (row.style.display !== 'none') { row.style.display = 'none'; return; }
  row.style.display = '';
  var cell = row.querySelector('.acc-drill-body');
  if (!cell) return;
  try {
    var res = await axios.get('/api/accounting/inter-entity/derived/orders?from=' + fromEntityId + '&client=' + toClientId);
    var orders = res.data.data || [];
    if (!orders.length) { cell.innerHTML = '<div class="text-gray-400">청구 주문이 없습니다</div>'; return; }
    cell.innerHTML = '<table style="width:100%" class="text-xs">'
      + '<thead><tr class="text-gray-400 border-b"><th class="text-left py-1">주문번호</th><th class="text-left">청구일</th><th class="text-right">청구액</th><th class="text-left pl-2">상태</th></tr></thead><tbody>'
      + orders.map(function (o) {
          return '<tr class="border-b border-gray-100"><td class="py-1 text-gray-700">' + escapeHtml(o.order_number || '') + '</td>'
            + '<td class="text-gray-500">' + escapeHtml((o.billed_at || '').slice(0, 10)) + '</td>'
            + '<td class="text-right tabular-nums text-gray-700">' + (Number(o.billed_amount) || 0).toLocaleString() + '</td>'
            + '<td class="pl-2 text-gray-500">' + escapeHtml(o.status || '') + '</td></tr>';
        }).join('')
      + '</tbody></table>'
      + '<div class="text-[10px] text-gray-400 mt-1">※ 입금·감액은 거래처 단위로 상계되어 위 청구액 합계에서 차감됩니다(순 채권 = 상단 표기).</div>';
  } catch (e) {
    console.error('[accounting] derived orders error', e);
    cell.innerHTML = '<div class="text-red-400">주문 로드 실패</div>';
  }
}

function accIetRenderRow(r) {
  accIetRows[r.id] = r; // 수정 모달 하이드레이션용 캐시 (accIetOpenModal에서 조회)
  var linked = (r.from_bank_transaction_id || r.to_bank_transaction_id)
    ? ' <i class="fas fa-link text-blue-400 text-[10px]" title="은행거래 연결됨"></i>' : '';
  return '<tr class="acc-row border-b">' +
    '<td class="px-3 py-2 text-left text-gray-700">' + escapeHtml(r.transaction_date || '') + '</td>' +
    '<td class="px-3 py-2 text-left font-medium text-gray-800">' + escapeHtml(r.from_entity_name || '-') +
      ' <i class="fas fa-arrow-right text-gray-300 text-[10px] mx-0.5"></i> ' + escapeHtml(r.to_entity_name || '-') + linked + '</td>' +
    '<td class="px-2 py-2 text-center">' + accIetTypeBadge(r.transaction_type) + '</td>' +
    '<td class="px-3 py-2 text-right tabular-nums font-semibold text-indigo-700">' + (Number(r.amount) || 0).toLocaleString() + '</td>' +
    '<td class="px-2 py-2 text-center">' + (r.affects_balance ? '<i class="fas fa-check text-green-500"></i>' : '<span class="text-gray-300 text-xs">기록만</span>') + '</td>' +
    '<td class="px-3 py-2 text-left text-gray-600 text-xs">' + escapeHtml(r.client_name || '') + '</td>' +
    '<td class="px-3 py-2 text-left text-gray-500 text-xs" title="' + escapeHtml(r.description || '') + '">' + escapeHtml(r.description || '') + '</td>' +
    '<td class="px-3 py-2 text-left text-gray-500 text-xs">' + escapeHtml(r.created_by_name || '') + '</td>' +
    '<td class="px-2 py-2 text-center whitespace-nowrap">' +
      '<button onclick="accIetOpenModal(' + r.id + ')" class="text-blue-500 hover:text-blue-700 px-1" title="수정"><i class="fas fa-pen"></i></button>' +
      '<button onclick="accIetDelete(' + r.id + ')" class="text-red-400 hover:text-red-600 px-1" title="삭제"><i class="fas fa-trash"></i></button>' +
    '</td>' +
  '</tr>';
}

// ----- 등록/수정 모달 -----
var accIetRows = {}; // 목록 응답 캐시 대신 수정 시 개별 조회 대체용 — 목록 렌더 시 채움
async function accIetOpenModal(id) {
  try {
    var ents = await accIetLoadEntities();
    var optHtml = ents.map(function (e) {
      return '<option value="' + e.id + '">' + escapeHtml(e.short_name || e.name) + '</option>';
    }).join('');
    document.getElementById('accIetFrom').innerHTML = optHtml;
    document.getElementById('accIetTo').innerHTML = optHtml;
  } catch (e) {
    console.error('[accounting] entities load error', e);
    showToast('법인 목록 로드 실패', 'error');
    return;
  }

  document.getElementById('accIetId').value = '';
  document.getElementById('accIetDate').value = (typeof window.kstToday === 'function') ? window.kstToday() : new Date().toISOString().slice(0, 10);
  document.getElementById('accIetAmount').value = '';
  document.getElementById('accIetTypeSel').value = 'SUBROGATION';
  document.getElementById('accIetAffects').checked = true;
  document.getElementById('accIetClientSearch').value = '';
  document.getElementById('accIetClientId').value = '';
  document.getElementById('accIetDesc').value = '';
  document.getElementById('accIetModalTitle').textContent = '법인간 거래 등록';

  if (id) {
    var r = accIetRows[id];
    if (r) {
      document.getElementById('accIetId').value = r.id;
      document.getElementById('accIetDate').value = r.transaction_date || '';
      document.getElementById('accIetAmount').value = (Number(r.amount) || 0).toLocaleString();
      document.getElementById('accIetFrom').value = String(r.from_entity_id);
      document.getElementById('accIetTo').value = String(r.to_entity_id);
      document.getElementById('accIetTypeSel').value = r.transaction_type || 'SUBROGATION';
      document.getElementById('accIetAffects').checked = !!r.affects_balance;
      document.getElementById('accIetClientId').value = r.client_id || '';
      document.getElementById('accIetClientSearch').value = r.client_name || '';
      document.getElementById('accIetDesc').value = r.description || '';
      document.getElementById('accIetModalTitle').textContent = '법인간 거래 수정';
    }
  }
  document.getElementById('accIetModal').classList.remove('hidden');
}

function accIetCloseModal() {
  document.getElementById('accIetModal').classList.add('hidden');
  document.getElementById('accIetClientDrop').classList.add('hidden');
}

// 계산서이전 선택 → 잔액반영 자동 해제 (기록용), 그 외 → 자동 체크
function accIetTypeChanged() {
  var t = document.getElementById('accIetTypeSel').value;
  document.getElementById('accIetAffects').checked = (t !== 'INVOICE_TRANSFER');
}

// ----- 거래처 경량 검색 드롭다운 -----
var accIetClientTimer = null;
function accIetClientInput() {
  document.getElementById('accIetClientId').value = ''; // 직접 타이핑 = 기존 선택 해제
  if (accIetClientTimer) clearTimeout(accIetClientTimer);
  accIetClientTimer = setTimeout(accIetClientFetch, 300);
}
async function accIetClientFetch() {
  var drop = document.getElementById('accIetClientDrop');
  var q = document.getElementById('accIetClientSearch').value.trim();
  if (!q) { drop.classList.add('hidden'); return; }
  try {
    var res = await axios.get('/api/clients?search=' + encodeURIComponent(q) + '&limit=8&active=1');
    var list = res.data.data || [];
    if (!list.length) {
      drop.innerHTML = '<div class="px-3 py-2 text-xs text-gray-400">검색 결과 없음</div>';
      drop.classList.remove('hidden');
      return;
    }
    drop.innerHTML = list.map(function (cl) {
      return '<button type="button" class="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 border-b border-gray-50" ' +
        'onclick="accIetClientPick(' + cl.id + ', this.dataset.name)" data-name="' + escapeHtml(cl.client_name || '') + '">' +
        escapeHtml(cl.client_name || '') + ' <span class="text-[11px] text-gray-400">' + escapeHtml(cl.client_code || '') + '</span></button>';
    }).join('');
    drop.classList.remove('hidden');
  } catch (e) {
    console.error('[accounting] client search error', e);
  }
}
function accIetClientPick(id, name) {
  document.getElementById('accIetClientId').value = id;
  document.getElementById('accIetClientSearch').value = name || '';
  document.getElementById('accIetClientDrop').classList.add('hidden');
}

async function accIetSave() {
  var id = document.getElementById('accIetId').value;
  var amount = window.parseMoney(document.getElementById('accIetAmount').value);
  var from = Number(document.getElementById('accIetFrom').value);
  var to = Number(document.getElementById('accIetTo').value);
  if (!document.getElementById('accIetDate').value) { showToast('거래일을 선택하세요', 'warning'); return; }
  if (!amount || amount <= 0) { showToast('유효한 금액을 입력하세요', 'warning'); return; }
  if (from === to) { showToast('지급 법인과 수혜 법인이 같을 수 없습니다', 'warning'); return; }
  var payload = {
    transaction_date: document.getElementById('accIetDate').value,
    from_entity_id: from,
    to_entity_id: to,
    transaction_type: document.getElementById('accIetTypeSel').value,
    amount: amount,
    affects_balance: document.getElementById('accIetAffects').checked ? 1 : 0,
    client_id: Number(document.getElementById('accIetClientId').value) || null,
    description: document.getElementById('accIetDesc').value.trim() || null,
  };
  try {
    var res = id
      ? await axios.put('/api/accounting/inter-entity/' + id, payload)
      : await axios.post('/api/accounting/inter-entity', payload);
    if (res.data.success) {
      showToast(id ? '수정되었습니다' : '법인간 거래가 등록되었습니다', 'success');
      accIetCloseModal();
      accLoadInter();
    } else {
      showToast(res.data.error || '저장 실패', 'error');
    }
  } catch (e) {
    console.error('[accounting] inter-entity save error', e);
    showToast(e.response?.data?.error || '저장 실패', 'error');
  }
}

async function accIetDelete(id) {
  if (!confirm('이 법인간 거래 기록을 삭제하시겠습니까?\n법인간 잔액에서도 제외됩니다.')) return;
  try {
    var res = await axios.delete('/api/accounting/inter-entity/' + id);
    if (res.data.success) {
      showToast('삭제되었습니다', 'success');
      accLoadInter();
    } else {
      showToast(res.data.error || '삭제 실패', 'error');
    }
  } catch (e) {
    console.error('[accounting] inter-entity delete error', e);
    showToast(e.response?.data?.error || '삭제 실패', 'error');
  }
}

// ===== 수정 (기존 ar-payments PUT 재사용) =====
async function accEditPayment(id) {
  try {
    var res = await axios.get('/api/ledger/payment/' + id);
    if (!res.data.success) { showToast(res.data.error || '조회 실패', 'error'); return; }
    var p = res.data.data;
    document.getElementById('accEditId').value = p.id;
    document.getElementById('accEditClient').textContent = p.client_name || '-';
    document.getElementById('accEditDate').value = (p.payment_date || '').slice(0, 10);
    document.getElementById('accEditAmount').value = (Number(p.amount) || 0).toLocaleString();
    document.getElementById('accEditMethod').value = p.payment_method || '';
    document.getElementById('accEditRef').value = p.reference_number || '';
    document.getElementById('accEditNotes').value = p.notes || '';
    document.getElementById('accEditModal').classList.remove('hidden');
  } catch (e) {
    console.error('[accounting] edit load error', e);
    showToast('입금 조회 실패', 'error');
  }
}

function accCloseEdit() { document.getElementById('accEditModal').classList.add('hidden'); }

async function accSaveEdit() {
  var id = document.getElementById('accEditId').value;
  var amount = window.parseMoney(document.getElementById('accEditAmount').value);
  var date = document.getElementById('accEditDate').value;
  if (!amount || amount <= 0) { showToast('유효한 금액을 입력하세요', 'warning'); return; }
  if (!date) { showToast('입금일을 선택하세요', 'warning'); return; }
  try {
    var res = await axios.put('/api/ledger/payment/' + id, {
      payment_date: date,
      amount: amount,
      payment_method: document.getElementById('accEditMethod').value || null,
      reference_number: document.getElementById('accEditRef').value || null,
      notes: document.getElementById('accEditNotes').value || null,
    });
    if (res.data.success) {
      showToast('입금 내역이 수정되었습니다', 'success');
      accCloseEdit();
      accLoadSummary();
      accLoadPayments();
    } else {
      showToast(res.data.error || '수정 실패', 'error');
    }
  } catch (e) {
    console.error('[accounting] save edit error', e);
    showToast(e.response?.data?.error || '수정 실패', 'error');
  }
}

// ===== 삭제 (기존 ar-payments DELETE 재사용 — 은행 매칭 해제·미수금 파생 정합 포함) =====
async function accDeletePayment(id, clientName) {
  if (!confirm((clientName || '') + ' 입금 내역을 삭제하시겠습니까?\n연결된 은행거래 매칭도 해제됩니다.')) return;
  try {
    var res = await axios.delete('/api/ledger/payment/' + id);
    if (res.data.success) {
      showToast('입금 내역이 삭제되었습니다', 'success');
      accLoadSummary();
      accLoadPayments();
    } else {
      showToast(res.data.error || '삭제 실패', 'error');
    }
  } catch (e) {
    console.error('[accounting] delete error', e);
    showToast(e.response?.data?.error || '삭제 실패 (삭제는 관리자 권한 필요)', 'error');
  }
}

// ===== 고정자산 (fixed_assets) =====
// 백엔드는 이미 완비(routes/fixedAssets.ts) — 등록·감가상각·처분·요약. 화면만 없던 것을 붙인다.
// 세무장부 계정과목과 1:1 — STRUCTURE=204 구축물, FACILITY=221 시설장치.
//   OTHER 로 뭉치면 둘을 구분 못 해 세무장부 대사가 안 된다.
var FA_CAT_LABEL = { EQUIPMENT: '기계장치', VEHICLE: '차량운반구', STRUCTURE: '구축물', FACILITY: '시설장치', FURNITURE: '비품', IT: '전산장비', OTHER: '기타' };
var FA_ST = {
  IN_USE: { t: '사용중', c: 'bg-green-50 text-green-700' },
  IDLE: { t: '유휴', c: 'bg-gray-100 text-gray-600' },
  DISPOSED: { t: '처분', c: 'bg-red-50 text-red-700' },
  SOLD: { t: '매각', c: 'bg-blue-50 text-blue-700' },
};
function faBadge(s) {
  var m = FA_ST[s] || { t: s || '-', c: 'bg-gray-100 text-gray-600' };
  return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ' + m.c + '">' + m.t + '</span>';
}
function faNum(v) { return (Number(v) || 0).toLocaleString(); }

// G1 — 자산에 붙일 부채(대출·리스) 목록. 행마다 부르면 N+1 이라 1회만 받아 캐시한다.
var faLoansCache = null;
function faEnsureLoans() {
  if (faLoansCache) return Promise.resolve(faLoansCache);
  return axios.get('/api/cash-flow/loans?active=1').then(function (r) {
    faLoansCache = (r.data && r.data.data) || [];
    return faLoansCache;
  }).catch(function (e) {
    console.warn('[accounting] 대출 목록 로드 실패 — 연결 UI 비활성', e);
    faLoansCache = [];
    return faLoansCache;
  });
}

function faLoanCell(a) {
  // 처분·매각 자산은 이력이므로 읽기 전용
  if (a.status === 'DISPOSED' || a.status === 'SOLD') return a.loan_creditor ? escapeHtml(a.loan_creditor) : '-';
  var list = faLoansCache || [];
  var opts = '<option value="">(없음)</option>';
  var found = false;
  list.forEach(function (l) {
    var on = Number(a.loan_id) === Number(l.id);
    if (on) found = true;
    opts += '<option value="' + l.id + '"' + (on ? ' selected' : '') + '>'
      + escapeHtml(l.creditor + (l.loan_number ? ' / ' + l.loan_number : '')) + '</option>';
  });
  // 연결된 부채가 비활성(is_active=0)이면 active=1 목록에 없다. 선택지를 보강하지 않으면
  //   select 가 '(없음)'으로 렌더돼 사용자가 만지는 순간 조용히 연결이 끊긴다.
  if (a.loan_id && !found) {
    opts += '<option value="' + a.loan_id + '" selected>' + escapeHtml((a.loan_creditor || ('대출 #' + a.loan_id)) + ' (비활성)') + '</option>';
  }
  var sel = '<select class="ds-input" style="font-size:11px;width:100%;max-width:190px" onchange="faLinkLoan(' + a.id + ', this.value)">' + opts + '</select>';
  var sub = a.loan_id
    ? '<div class="text-xs text-gray-400 mt-0.5">잔액 ' + faNum(a.loan_balance) + (a.loan_maturity ? ' · 만기 ' + escapeHtml(a.loan_maturity) : '') + '</div>'
    : '';
  return sel + sub;
}

// G3 배부 기준 — 자산에 부문을 직접 붙인다(장비 경유 불가: 세무장부 자산명이 묶음 단위)
var faDeptsCache = null;
function faEnsureDepts() {
  if (faDeptsCache) return Promise.resolve(faDeptsCache);
  return axios.get('/api/departments').then(function (r) {
    var d = (r.data && r.data.data) || [];
    faDeptsCache = Array.isArray(d) ? d : (d.rows || []);
    return faDeptsCache;
  }).catch(function (e) {
    console.warn('[accounting] 부문 목록 로드 실패 — 부문 지정 UI 비활성', e);
    faDeptsCache = [];
    return faDeptsCache;
  });
}

function faDeptCell(a) {
  if (a.status === 'DISPOSED' || a.status === 'SOLD') return a.department_name ? escapeHtml(a.department_name) : '-';
  var opts = '<option value="">(공통배부)</option>';
  (faDeptsCache || []).forEach(function (d) {
    opts += '<option value="' + d.id + '"' + (Number(a.department_id) === Number(d.id) ? ' selected' : '') + '>'
      + escapeHtml(d.name) + '</option>';
  });
  return '<select class="ds-input" style="font-size:11px;width:100%;max-width:130px" onchange="faSetDept(' + a.id + ', this.value)">' + opts + '</select>';
}

function faSetDept(id, deptId) {
  axios.patch('/api/fixed-assets/' + id + '/department', { department_id: deptId || null })
    .then(function () { faLoad(); })
    .catch(function (e) {
      alert('부문 지정 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message));
      faLoad();
    });
}

function faLinkLoan(id, loanId) {
  axios.patch('/api/fixed-assets/' + id + '/loan', { loan_id: loanId || null })
    .then(function () { faLoad(); })
    .catch(function (e) {
      alert('부채 연결 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message));
      faLoad();
    });
}

function faLoad() {
  var tb = document.getElementById('faTbody');
  if (!tb) { console.warn('[accounting] #faTbody not found'); return; }
  var cat = (document.getElementById('faCategory') || {}).value || '';
  var st = (document.getElementById('faStatus') || {}).value || '';
  var dep = document.getElementById('faDepreciating');
  var qs = [];
  if (cat) qs.push('category=' + encodeURIComponent(cat));
  if (st) qs.push('status=' + encodeURIComponent(st));
  if (!dep || dep.checked) qs.push('depreciating=1');
  tb.innerHTML = '<tr><td colspan="12" class="text-center text-gray-400 py-6">불러오는 중...</td></tr>';

  // 대출·부문 목록이 먼저 있어야 각 셀의 select 가 현재값을 선택된 상태로 그린다
  Promise.all([faEnsureLoans(), faEnsureDepts()]).then(function () {
  axios.get('/api/fixed-assets' + (qs.length ? '?' + qs.join('&') : '')).then(function (r) {
    var rows = (r.data && r.data.data) || [];
    accState.loaded.asset = true;
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="12" class="text-center text-gray-400 py-6">등록된 고정자산이 없습니다.</td></tr>';
    } else {
      tb.innerHTML = rows.map(function (a) {
        var acq = Number(a.acquisition_cost) || 0;
        var bv = a.current_book_value == null ? acq : Number(a.current_book_value);
        var accum = acq - bv;
        var years = Math.round((Number(a.useful_life_months) || 0) / 12 * 10) / 10;
        var canDispose = a.status === 'IN_USE' || a.status === 'IDLE';
        return '<tr>'
          + '<td class="font-mono text-xs">' + escapeHtml(a.asset_code || '') + '</td>'
          + '<td>' + escapeHtml(a.name || '') + (a.equipment_name ? '<div class="text-xs text-gray-400">' + escapeHtml(a.equipment_name) + '</div>' : '') + '</td>'
          + '<td>' + (FA_CAT_LABEL[a.category] || a.category || '-') + '</td>'
          + '<td class="text-xs">' + escapeHtml(a.acquisition_date || '') + '</td>'
          + '<td class="text-right tabular-nums">' + faNum(acq) + '</td>'
          + '<td class="text-right tabular-nums font-semibold">' + faNum(bv) + '</td>'
          + '<td class="text-right tabular-nums text-gray-500">' + faNum(accum) + '</td>'
          + '<td class="text-right tabular-nums text-xs">' + (Number(a.last_depreciation) ? faNum(a.last_depreciation) : '<span class="text-gray-300">-</span>')
            + '<div class="text-xs text-gray-400">' + years + '년'
            + (a.depreciation_method === 'DECLINING_BALANCE' ? ' 정률' + (a.depreciation_rate ? ' ' + a.depreciation_rate : '') : ' 정액') + '</div></td>'
          + '<td class="text-xs">' + faDeptCell(a) + '</td>'
          + '<td class="text-xs">' + faLoanCell(a) + '</td>'
          + '<td>' + faBadge(a.status) + '</td>'
          + '<td>' + (canDispose ? '<button onclick="faDispose(' + a.id + ')" class="text-xs text-red-600 hover:underline">처분</button>' : '-') + '</td>'
          + '</tr>';
      }).join('');
    }
  }).catch(function (e) {
    console.error('[accounting] faLoad', e);
    tb.innerHTML = '<tr><td colspan="12" class="text-center text-red-500 py-6">불러오지 못했습니다.</td></tr>';
  });
  });

  axios.get('/api/fixed-assets/report/summary').then(function (r) {
    var el = document.getElementById('faSummary');
    if (!el) return;
    var rows = (r.data && r.data.data) || [];
    var tAcq = 0, tBv = 0;
    rows.forEach(function (x) { tAcq += Number(x.total_acquisition) || 0; tBv += Number(x.total_book_value) || 0; });
    var card = function (label, val, cls) {
      return '<div class="ds-card ds-card-compact"><div class="text-xs text-gray-500 mb-1">' + label + '</div>'
        + '<div class="text-2xl font-bold tabular-nums text-right ' + cls + '">' + faNum(val) + '</div></div>';
    };
    el.innerHTML = card('취득가액 합계', tAcq, 'text-gray-800') + card('장부가액 합계', tBv, 'text-blue-700') + card('누적 감가상각', tAcq - tBv, 'text-red-600');
  }).catch(function (e) { console.error('[accounting] faSummary', e); });
}

function faOpenForm() {
  var m = document.getElementById('faModal');
  if (!m) { console.warn('[accounting] #faModal not found'); return; }
  ['faFCode', 'faFName', 'faFCost', 'faFSalvage', 'faFLocation', 'faFSerial', 'faFNotes'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  var d = document.getElementById('faFDate');
  if (d) d.value = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  var life = document.getElementById('faFLife'); if (life) life.value = 60;
  var eq = document.getElementById('faFEquipment');
  if (eq && eq.options.length <= 1) {
    // 장비 목록 전용 API 가 없다 — 가동 장비를 주는 workload 를 재사용(ACTIVE 만 나옴)
    axios.get('/api/equipment-queue/workload').then(function (r) {
      var list = (r.data && r.data.data) || [];
      list.forEach(function (e) {
        var o = document.createElement('option');
        o.value = e.id; o.textContent = e.name || e.id;
        eq.appendChild(o);
      });
    }).catch(function () { /* 장비 목록 실패해도 등록은 가능 */ });
  }
  var ln = document.getElementById('faFLoan');
  if (ln) {
    ln.value = '';
    if (ln.options.length <= 1) {
      faEnsureLoans().then(function (list) {
        list.forEach(function (l) {
          var o = document.createElement('option');
          o.value = l.id;
          o.textContent = l.creditor + (l.loan_number ? ' / ' + l.loan_number : '') + ' — 잔액 ' + faNum(l.current_balance);
          ln.appendChild(o);
        });
      });
    }
  }
  m.classList.remove('hidden'); m.classList.add('flex');
}
function faCloseForm() {
  var m = document.getElementById('faModal');
  if (!m) return;
  m.classList.add('hidden'); m.classList.remove('flex');
}

function faSave() {
  var val = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
  var money = function (id) { return Number(val(id).replace(/,/g, '')) || 0; };
  var body = {
    asset_code: val('faFCode'), name: val('faFName'), category: val('faFCategory'),
    equipment_id: val('faFEquipment') || null,
    loan_id: val('faFLoan') || null,
    acquisition_date: val('faFDate'), acquisition_cost: money('faFCost'),
    useful_life_months: Number(val('faFLife')) || 0,
    depreciation_method: val('faFMethod'), salvage_value: money('faFSalvage'),
    location: val('faFLocation') || null, serial_number: val('faFSerial') || null,
    notes: val('faFNotes') || null,
  };
  if (!body.asset_code || !body.name || !body.acquisition_date || !body.acquisition_cost || !body.useful_life_months) {
    alert('자산코드·자산명·취득일·취득가액·내용연수는 필수입니다.');
    return;
  }
  axios.post('/api/fixed-assets', body).then(function () {
    faCloseForm();
    faLoad();
  }).catch(function (e) {
    alert('등록 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message));
  });
}

function faRunDepreciation() {
  var p = (document.getElementById('faPeriod') || {}).value || '';
  if (!/^\d{4}-\d{2}$/.test(p)) { alert('감가상각을 실행할 월을 선택하세요.'); return; }
  if (!confirm(p + ' 감가상각을 실행합니다.\n사용중(IN_USE) 자산이 대상이며, 이미 처리된 자산은 건너뜁니다.')) return;
  axios.post('/api/fixed-assets/depreciate', { period: p }).then(function (r) {
    var n = (r.data && r.data.data && r.data.data.processed) || 0;
    alert(p + ' 감가상각 완료 — ' + n + '건 처리');
    faLoad();
  }).catch(function (e) {
    alert('실행 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message));
  });
}

function faDispose(id) {
  var amt = prompt('처분 금액을 입력하세요 (매각대금이 없으면 0)');
  if (amt === null) return;
  var reason = prompt('처분 사유');
  if (reason === null) return;
  axios.patch('/api/fixed-assets/' + id + '/dispose', {
    disposal_amount: Number(String(amt).replace(/,/g, '')) || 0,
    disposal_reason: reason || null,
  }).then(function () { faLoad(); })
    .catch(function (e) { alert('처분 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message)); });
}

// ===== Init =====
function accInit() {
  accSetPeriod('thisMonth'); // 기본 기간 + 첫 로드 (accReload 트리거)
  if (typeof window.bindMoneyInputs === 'function') window.bindMoneyInputs();
  // 딥링크 ?tab=inter (원장 내부법인 안내 → 법인간거래 탭 진입)
  var _tab = new URLSearchParams(window.location.search).get('tab');
  if (_tab && ACC_TABS[_tab]) accSwitchTab(_tab);
}

accInit();
