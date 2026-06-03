// 매입확정 페이지 — 확정 대기(단가 미정) + 매입 인보이스 목록
(function() {
  var _confirmPoId = null;

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
      ti.className = on; tp.className = off; loadInvoices();
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
          + '<td class="px-4 py-3">' + escapeHtml(r.supplier_name || '-') + '</td>'
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
      var stmtHtml = (d.receipts || []).filter(function(rc) { return rc.statement_file_key; }).map(function(rc) {
        return '<a href="/api/purchase-orders/receipts/' + rc.id + '/statement" target="_blank" class="text-blue-600 hover:underline text-xs mr-3"><i class="fas fa-file-invoice"></i> ' + escapeHtml(rc.receipt_number || '명세서') + '</a>';
      }).join('');
      document.getElementById('confirmStatements').innerHTML = stmtHtml || '<span class="text-gray-400 text-xs">첨부된 거래명세서 없음 (입고 관리에서 첨부 권장)</span>';
      var itemsHtml = (d.items || []).map(function(it) {
        return '<tr class="border-t">'
          + '<td class="px-3 py-2">' + escapeHtml(it.item_name || '-') + '</td>'
          + '<td class="px-3 py-2 text-center">' + fmt(it.received_quantity) + ' ' + escapeHtml(it.unit || '') + '</td>'
          + '<td class="px-3 py-2 text-right text-gray-400 text-xs">' + (it.base_price ? '직전 ' + fmt(it.base_price) : '') + '</td>'
          + '<td class="px-3 py-2"><input type="number" min="0" data-poitem="' + it.po_item_id + '" class="confirm-price w-28 text-right border rounded px-2 py-1" placeholder="실단가" value="' + (it.base_price || '') + '" oninput="recalcConfirmTotal()"></td>'
          + '</tr>';
      }).join('');
      document.getElementById('confirmItemsBody').innerHTML = itemsHtml;
      document.getElementById('confirmInvoiceDate').value = new Date().toISOString().slice(0, 10);
      recalcConfirmTotal();
      document.getElementById('confirmModal').classList.remove('hidden');
    } catch (e) { showToast('상세 조회 오류', 'error'); }
  }
  window.openConfirmModal = openConfirmModal;

  window.recalcConfirmTotal = function() {
    var total = 0;
    document.querySelectorAll('.confirm-price').forEach(function(inp) {
      var tr = inp.closest('tr');
      if (!tr) return;
      var qty = parseFloat((tr.children[1].textContent || '').replace(/[^0-9.]/g, '')) || 0;
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

  async function loadInvoices() {
    var tb = document.getElementById('invoicesBody');
    if (tb) tb.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">로딩 중...</td></tr>';
    try {
      var res = await axios.get('/api/purchase-invoices');
      var rows = res.data.data || [];
      if (!tb) return;
      if (rows.length === 0) { tb.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">매입 인보이스가 없습니다.</td></tr>'; return; }
      tb.innerHTML = rows.map(function(r) {
        return '<tr class="border-t hover:bg-gray-50">'
          + '<td class="px-4 py-3 font-medium">' + escapeHtml(r.invoice_number || '-') + '</td>'
          + '<td class="px-4 py-3">' + escapeHtml(r.supplier_name || '-') + '</td>'
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

  loadPending();
})();
