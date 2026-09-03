// 매입확정 페이지 — 확정 대기(단가 미정) + 매입 인보이스 목록
(function() {
  var _confirmPoId = null;
  var pinvToolbarMounted = false;

  function fmt(n) { return (Number(n) || 0).toLocaleString('ko-KR'); }

  function switchInvTab(tab) {
    var pending = document.getElementById('panelPending');
    var invoices = document.getElementById('panelInvoices');
    var tp = document.getElementById('tabPending');
    var ti = document.getElementById('tabInvoices');
    if (!pending || !invoices || !tp || !ti) { console.warn('[purchaseInvoices] panel/tab not found'); return; }
    var on = 'px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600';
    var off = 'px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700';
    if (tab === 'invoices') {
      pending.classList.add('hidden'); invoices.classList.remove('hidden');
      ti.className = on; tp.className = off;
      // 인보이스 탭은 여기서 처음 보인다 — 도구모음도 이때 한 번만 붙인다
      if (!pinvToolbarMounted && window.dsListToolbar) {
        pinvToolbarMounted = true;
        var m = window.dsListToolbar.mount({
          pageKey: 'purchase-invoices',
          container: 'pinvListToolbar',
          tableSelector: '.pinv-tbl',
          defaultPageSize: 50,
          getFilters: function() { return pinvReadFilters(); },
          applyFilters: function(f) { pinvApplyFilters(f); },
          onChange: function() { loadInvoices(1); }
        });
        if (m && m.then) { m.then(function() { if (!pinvPresetApplied) loadInvoices(); }); return; }
      }
      loadInvoices();
    } else {
      invoices.classList.add('hidden'); pending.classList.remove('hidden');
      tp.className = on; ti.className = off; loadPending();
    }
  }
  window.switchInvTab = switchInvTab;

  async function loadPending() {
    var tb = document.getElementById('pendingBody');
    if (tb) tb.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">로딩 중...</td></tr>';
    try {
      var res = await axios.get('/api/purchase-invoices/pending');
      var rows = res.data.data || [];
      if (!tb) return;
      if (rows.length === 0) { tb.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">매입확정 대기 건이 없습니다.</td></tr>'; return; }
      tb.innerHTML = rows.map(function(r) {
        return '<tr class="border-t hover:bg-gray-50">'
          + '<td class="px-4 py-3 text-blue-700 font-medium">' + escapeHtml(r.po_number || '-') + '</td>'
          + '<td class="px-4 py-3" title="' + escapeHtml(r.supplier_name || '') + '">' + escapeHtml(r.supplier_name || '-') + '</td>'
          + '<td class="px-4 py-3 text-center">' + (r.order_date ? r.order_date.substring(0, 10) : '-') + '</td>'
          + '<td class="px-4 py-3 text-center">' + (r.pending_count || 0) + '</td>'
          + '<td class="px-4 py-3 text-center">' + fmt(r.pending_qty) + '</td>'
          + '<td class="px-4 py-3 text-center"><button onclick="openConfirmModal(' + r.po_id + ')" class="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">매입확정</button></td>'
          + '</tr>';
      }).join('');
    } catch (e) {
      if (tb) tb.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-red-500">조회 실패</td></tr>';
    }
  }

  async function openConfirmModal(poId) {
    _confirmPoId = poId;
    try {
      var res = await axios.get('/api/purchase-invoices/pending/' + poId);
      if (!res.data.success) { showToast('상세 조회 실패', 'error'); return; }
      var d = res.data.data;
      document.getElementById('confirmPoNumber').textContent = d.po.po_number || '';
      document.getElementById('confirmSupplier').textContent = d.po.supplier_name || '';
      // 라우트가 authMiddleware(Authorization 헤더 전용) — 직링크는 401 빈 탭이라 blob 경유로 연다
      var stmtHtml = (d.receipts || []).filter(function(rc) { return rc.statement_file_key; }).map(function(rc) {
        return '<button type="button" onclick="pinvOpenStatement(' + rc.id + ')" class="text-blue-600 hover:underline text-xs mr-3"><i class="fas fa-file-invoice"></i> ' + escapeHtml(rc.receipt_number || '명세서') + '</button>';
      }).join('');
      document.getElementById('confirmStatements').innerHTML = stmtHtml || '<span class="text-gray-400 text-xs">첨부된 거래명세서 없음 (입고 관리에서 첨부 권장)</span>';
      var itemsHtml = (d.items || []).map(function(it) {
        return '<tr class="border-t">'
          + '<td class="px-3 py-2">' + escapeHtml(it.item_name || '-') + '</td>'
          + '<td class="px-3 py-2 text-center">' + fmt(it.received_quantity) + ' ' + escapeHtml(it.unit || '') + '</td>'
          + '<td class="px-3 py-2 text-right text-gray-400 text-xs">' + (it.base_price ? '직전 ' + fmt(it.base_price) : '') + '</td>'
          // data-qty = 합계 미리보기의 수량 정본. DOM 텍스트(fmt 반올림·단위 문자열 혼입)를 역파싱하지 않는다.
          + '<td class="px-3 py-2"><input type="number" min="0" data-poitem="' + it.po_item_id + '" data-qty="' + (Number(it.received_quantity) || 0) + '" class="confirm-price w-28 text-right border rounded px-2 py-1" placeholder="실단가" value="' + (it.base_price || '') + '" oninput="recalcConfirmTotal()"></td>'
          + '</tr>';
      }).join('');
      document.getElementById('confirmItemsBody').innerHTML = itemsHtml;
      document.getElementById('confirmInvoiceDate').value = window.kstToday ? window.kstToday() : new Date().toISOString().slice(0, 10);
      recalcConfirmTotal();
      document.getElementById('confirmModal').classList.remove('hidden');
    } catch (e) { showToast('상세 조회 오류', 'error'); }
  }
  window.openConfirmModal = openConfirmModal;

  window.pinvOpenStatement = function(receiptId) {
    window.dsOpenAuthFile('/api/purchase-orders/receipts/' + receiptId + '/statement', '거래명세서_' + receiptId);
  };

  window.recalcConfirmTotal = function() {
    var total = 0;
    document.querySelectorAll('.confirm-price').forEach(function(inp) {
      var qty = parseFloat(inp.dataset.qty) || 0;
      var price = parseFloat(inp.value) || 0;
      total += qty * price;
    });
    var vat = Math.round(total * 0.1);
    var el = document.getElementById('confirmTotal');
    if (el) el.textContent = fmt(total + vat) + ' (VAT 포함)';
  };

  window.closeConfirmModal = function() {
    var m = document.getElementById('confirmModal');
    if (m) m.classList.add('hidden');
  };

  window.submitConfirm = async function() {
    var items = [];
    var bad = false;
    document.querySelectorAll('.confirm-price').forEach(function(inp) {
      var price = parseFloat(inp.value) || 0;
      var poItem = parseInt(inp.getAttribute('data-poitem'));
      if (!(price > 0)) bad = true;
      items.push({ po_item_id: poItem, unit_price: price });
    });
    if (items.length === 0) { showToast('확정할 품목이 없습니다.', 'warning'); return; }
    if (bad) { showToast('모든 품목의 실단가(0 초과)를 입력하세요.', 'warning'); return; }
    var invDate = document.getElementById('confirmInvoiceDate').value;
    try {
      var res = await axios.post('/api/purchase-invoices/confirm', { po_id: _confirmPoId, invoice_date: invDate, items: items });
      if (res.data.success) {
        var variance = res.data.data.match_status === 'PRICE_VARIANCE';
        showToast('매입확정 완료' + (variance ? ' — 발주 대비 단가 차이 감지' : ''), variance ? 'warning' : 'success');
        window.closeConfirmModal();
        loadPending();
      } else { showToast('확정 실패: ' + (res.data.error || ''), 'error'); }
    } catch (e) { showToast('확정 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error'); }
  };

  var invPage = 1;
  // 조회조건 SSOT (클라) — 서버는 match_status 하나만 받는다
  function pinvReadFilters() {
    var mf = document.getElementById('invMatchFilter');
    return { matchStatus: mf ? mf.value : '' };
  }
  function pinvRenderChips(f) {
    var items = [];
    if (f.matchStatus) {
      var sel = document.getElementById('invMatchFilter');
      var label = f.matchStatus;
      if (sel) for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === f.matchStatus) label = sel.options[i].textContent;
      items.push({ label: '매칭 ' + label, onClear: function() { sel.value = ''; loadInvoices(1); } });
    } else {
      items.push({ label: '전체 매칭상태', tone: 'static' });
    }
    window.dsListUx.renderChips('pinvFilterChips', items);
  }
  function pinvRenderSummary(summary, pagination) {
    if (!summary) { window.dsListUx.renderSummary('pinvSummaryBar', null); return; }
    window.dsListUx.renderSummary('pinvSummaryBar', [
      { label: '건수', value: summary.count },
      { label: '금액', value: summary.amount, format: 'won', strong: true }
    ], { multiPage: !!(pagination && pagination.total_pages > 1) });
  }
  var pinvPresetApplied = false;
  function pinvApplyFilters(f) {
    if (!f) return;
    var mf = document.getElementById('invMatchFilter');
    if (mf) mf.value = f.matchStatus || '';
    pinvPresetApplied = true;
    loadInvoices(1);
  }

  async function loadInvoices(page) {
    invPage = page || invPage || 1;
    var tb = document.getElementById('invoicesBody');
    if (tb) tb.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">로딩 중...</td></tr>';
    var f = pinvReadFilters();
    pinvRenderChips(f);   // 조건 표시는 응답을 기다리지 않는다
    try {
      // #353: 매칭상태 필터 + 페이지네이션 (라우트 match_status/page/limit 기구현)
      var params = { page: invPage, limit: (window.dsListToolbar ? window.dsListToolbar.pageSize('purchase-invoices', 50) : 50) };
      if (f.matchStatus) params.match_status = f.matchStatus;
      var res = await axios.get('/api/purchase-invoices', { params: params });
      var rows = res.data.data || [];
      renderInvoicesPagination(res.data.pagination);
      pinvRenderSummary(res.data.summary, res.data.pagination);
      if (!tb) return;
      if (rows.length === 0) { tb.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">매입 인보이스가 없습니다.</td></tr>'; return; }
      tb.innerHTML = rows.map(function(r) {
        return '<tr class="border-t hover:bg-gray-50">'
          + '<td class="px-4 py-3 font-medium">' + escapeHtml(r.invoice_number || '-') + '</td>'
          + '<td class="px-4 py-3" title="' + escapeHtml(r.supplier_name || '') + '">' + escapeHtml(r.supplier_name || '-') + '</td>'
          + '<td class="px-4 py-3 text-blue-700">' + escapeHtml(r.po_number || '-') + '</td>'
          + '<td class="px-4 py-3 text-center">' + (r.invoice_date ? r.invoice_date.substring(0, 10) : '-') + '</td>'
          + '<td class="px-4 py-3 text-right font-medium">' + fmt(r.total_amount) + '</td>'
          + '<td class="px-4 py-3 text-center">' + matchBadge(r.match_status) + '</td>'
          + '<td class="px-4 py-3 text-center">' + payBadge(r.payment_status) + '</td>'
          + '</tr>';
      }).join('');
    } catch (e) {
      if (tb) tb.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-red-500">조회 실패</td></tr>';
    }
  }

  function badge(map, s) {
    var v = (map[s] || ('bg-gray-100 text-gray-600|' + (s || '-'))).split('|');
    return '<span class="px-2 py-0.5 rounded text-xs ' + v[0] + '">' + v[1] + '</span>';
  }
  function matchBadge(s) {
    return badge({ MATCHED: 'bg-green-100 text-green-700|정상', PRICE_VARIANCE: 'bg-red-100 text-red-700|단가차이', QUANTITY_VARIANCE: 'bg-amber-100 text-amber-700|수량차이', UNMATCHED: 'bg-gray-100 text-gray-600|미매칭', DISPUTED: 'bg-red-100 text-red-700|분쟁' }, s);
  }
  function payBadge(s) {
    return badge({ UNPAID: 'bg-amber-100 text-amber-700|미지급', PARTIAL: 'bg-blue-100 text-blue-700|부분지급', PAID: 'bg-green-100 text-green-700|지급완료' }, s);
  }

  // #353: 매입 인보이스 페이지네이션
  function renderInvoicesPagination(pg) {
    var el = document.getElementById('invoicesPagination');
    if (!el) return;
    if (!pg || pg.total_pages <= 1) {
      el.innerHTML = pg ? '<span class="text-xs text-gray-500">총 ' + pg.total + '건</span>' : '';
      return;
    }
    el.innerHTML =
      '<button onclick="loadInvoices(' + (pg.page - 1) + ')" class="px-2 py-1 text-xs border rounded disabled:opacity-40"' + (pg.page <= 1 ? ' disabled' : '') + '><i class="fas fa-chevron-left"></i></button>'
      + '<span class="text-xs text-gray-500">' + pg.page + ' / ' + pg.total_pages + ' (총 ' + pg.total + '건)</span>'
      + '<button onclick="loadInvoices(' + (pg.page + 1) + ')" class="px-2 py-1 text-xs border rounded disabled:opacity-40"' + (pg.page >= pg.total_pages ? ' disabled' : '') + '><i class="fas fa-chevron-right"></i></button>';
  }
  window.loadInvoices = loadInvoices;

  loadPending();
})();
