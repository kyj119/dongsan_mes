var prEditMode = false;
var prEditId = null;
var prItemCount = 0;
var prItemSearchTimers = {};
var prSupplierSearchTimer = null;

// URL 파라미터 확인
(function() {
  var params = new URLSearchParams(window.location.search);
  var editId = params.get('edit');
  if (editId) {
    prEditMode = true;
    prEditId = parseInt(editId);
    document.getElementById('prFormTitle').innerHTML = '<i class="fas fa-clipboard-list text-blue-600 mr-2"></i>발주 요청 수정';
    document.getElementById('prSubmitBtn').innerHTML = '<i class="fas fa-save mr-1"></i>수정 저장';
    loadPREditData(prEditId);
  } else {
    prAddItemRow();
  }
})();

async function loadPREditData(id) {
  try {
    var res = await axios.get('/api/purchase-requests/' + id);
    if (!res.data.success) { showToast('데이터 불러오기 실패', 'error'); return; }
    var pr = res.data.request;
    if (pr.status !== 'PENDING') {
      showToast('PENDING 상태의 요청만 수정 가능합니다.', 'warning');
      window.location.href = '/purchase-requests';
      return;
    }
    if (pr.supplier_id) {
      document.getElementById('prSupplierId').value = pr.supplier_id;
      document.getElementById('prSupplierSearch').value = pr.supplier_name || '';
    }
    document.getElementById('prUrgency').value = pr.urgency || 'NORMAL';
    document.getElementById('prReason').value = pr.reason || '';
    document.getElementById('prNotes').value = pr.notes || '';
    var items = pr.items || [];
    items.forEach(function(it) {
      prAddItemRow();
      var idx = prItemCount;
      document.getElementById('pri_name_' + idx).value = it.item_name || '';
      if (it.item_id) document.getElementById('pri_id_' + idx).value = it.item_id;
      document.getElementById('pri_qty_' + idx).value = it.quantity || 1;
      document.getElementById('pri_unit_' + idx).value = it.unit || 'EA';
      document.getElementById('pri_price_' + idx).value = it.estimated_unit_price || 0;
      document.getElementById('pri_note_' + idx).value = it.notes || '';
      prCalcRowAmount(idx);
    });
  } catch(e) {
    showToast('데이터 불러오기 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

function prAddItemRow() {
  prItemCount++;
  var idx = prItemCount;
  // 빈 상태 행 숨기기
  var emptyRow = document.getElementById('prItemsEmptyRow');
  if (emptyRow) emptyRow.style.display = 'none';
  var tr = document.createElement('tr');
  tr.id = 'pri-row-' + idx;
  tr.className = 'border-t';
  tr.innerHTML =
    '<td class="px-2 py-1" style="position:relative;">'
    + '<input type="text" id="pri_name_' + idx + '" placeholder="품목 검색..." autocomplete="off"'
    + ' class="w-full border rounded px-2 py-1 text-sm" oninput="prSearchItems(' + idx + ')" onblur="hidePRItemDd(' + idx + ')">'
    + '<input type="hidden" id="pri_id_' + idx + '">'
    + '<div id="pri_dd_' + idx + '" class="pr-item-dd hidden"></div>'
    + '</td>'
    + '<td class="px-2 py-1">'
    + '<input type="text" inputmode="numeric" id="pri_qty_' + idx + '" value="1"'
    + ' class="w-full border rounded px-2 py-1 text-sm text-right tabular-nums" oninput="prCalcRowAmount(' + idx + ')">'
    + '</td>'
    + '<td class="px-2 py-1">'
    + '<select id="pri_unit_' + idx + '" class="w-full border rounded px-2 py-1 text-sm text-center">'
    + '<option value="EA">EA</option>'
    + '<option value="M">M</option>'
    + '<option value="KG">KG</option>'
    + '<option value="L">L</option>'
    + '<option value="BOX">BOX</option>'
    + '<option value="ROL">ROL</option>'
    + '<option value="SET">SET</option>'
    + '</select>'
    + '</td>'
    + '<td class="px-2 py-1">'
    + '<input type="text" inputmode="numeric" data-money id="pri_price_' + idx + '" value="0"'
    + ' class="w-full border rounded px-2 py-1 text-sm text-right tabular-nums" oninput="prCalcRowAmount(' + idx + ')">'
    + '</td>'
    + '<td class="px-2 py-1">'
    + '<input type="text" id="pri_amount_' + idx + '" value="0" readonly'
    + ' class="w-full border rounded px-2 py-1 text-sm text-right tabular-nums bg-gray-50">'
    + '</td>'
    + '<td class="px-2 py-1">'
    + '<input type="text" id="pri_note_' + idx + '" placeholder="비고"'
    + ' class="w-full border rounded px-2 py-1 text-sm">'
    + '</td>'
    + '<td class="px-2 py-1 text-center">'
    + '<button type="button" onclick="prRemoveItemRow(' + idx + ')"'
    + ' class="text-red-400 hover:text-red-600"><i class="fas fa-times"></i></button>'
    + '</td>';
  document.getElementById('prItemsBody').appendChild(tr);
  document.getElementById('pri_name_' + idx).focus();
}

function prRemoveItemRow(idx) {
  var row = document.getElementById('pri-row-' + idx);
  if (row) row.remove();
  prCalcTotalAmount();
  // 모든 품목 행이 없으면 빈 상태 표시
  var body = document.getElementById('prItemsBody');
  var hasRows = body && body.querySelectorAll('tr[id^="pri-row-"]').length > 0;
  var emptyRow = document.getElementById('prItemsEmptyRow');
  if (emptyRow) emptyRow.style.display = hasRows ? 'none' : '';
}

function hidePRItemDd(idx) {
  setTimeout(function() {
    var dd = document.getElementById('pri_dd_' + idx);
    if (dd) dd.classList.add('hidden');
  }, 200);
}

function hidePRSupplierDd() {
  setTimeout(function() {
    var dd = document.getElementById('prSupplierDd');
    if (dd) dd.classList.add('hidden');
  }, 200);
}

async function prSearchItems(idx) {
  clearTimeout(prItemSearchTimers[idx]);
  var q = document.getElementById('pri_name_' + idx).value.trim();
  if (q.length < 1) {
    document.getElementById('pri_dd_' + idx).classList.add('hidden');
    return;
  }
  prItemSearchTimers[idx] = setTimeout(async function() {
    try {
      var res = await axios.get('/api/items?type=purchase&search=' + encodeURIComponent(q) + '&limit=20');
      var items = (res.data && res.data.data) ? res.data.data : [];
      var dd = document.getElementById('pri_dd_' + idx);
      if (!dd) return;
      if (items.length === 0) {
        dd.innerHTML = '<div class="pr-item-dd-entry text-gray-400 cursor-default">검색 결과 없음 (직접 입력 가능)</div>';
      } else {
        dd.innerHTML = items.map(function(it) {
          var price = it.base_price || 0;
          return '<div class="pr-item-dd-entry" onmousedown="event.preventDefault();prSelectItem(' + idx + ',' + it.id + ',\''
            + (it.item_name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\','
            + price + ',\''
            + (it.unit || 'EA').replace(/'/g, "\\'") + '\')">'
            + (it.item_name || '')
            + (it.item_code ? ' <span class="text-gray-400 text-xs">[' + it.item_code + ']</span>' : '')
            + (price ? ' <span class="text-blue-500 text-xs ml-1">' + price.toLocaleString() + '원</span>' : '')
            + '</div>';
        }).join('');
      }
      dd.classList.remove('hidden');
    } catch(e) { console.error('prSearchItems error:', e); }
  }, 200);
}

function prSelectItem(idx, id, name, price, unit) {
  document.getElementById('pri_id_' + idx).value = id;
  document.getElementById('pri_name_' + idx).value = name;
  document.getElementById('pri_price_' + idx).value = price;
  var unitEl = document.getElementById('pri_unit_' + idx);
  if (unitEl) unitEl.value = unit || 'EA';
  var dd = document.getElementById('pri_dd_' + idx);
  if (dd) dd.classList.add('hidden');
  prCalcRowAmount(idx);
}

function onPRSupplierInput() {
  clearTimeout(prSupplierSearchTimer);
  var q = document.getElementById('prSupplierSearch').value.trim();
  document.getElementById('prSupplierId').value = '';
  if (q.length < 1) {
    document.getElementById('prSupplierDd').classList.add('hidden');
    return;
  }
  prSupplierSearchTimer = setTimeout(async function() {
    try {
      var res = await axios.get('/api/clients?type=PURCHASE&search=' + encodeURIComponent(q) + '&limit=20');
      var clients = (res.data && res.data.data && res.data.data.clients) ? res.data.data.clients : [];
      var dd = document.getElementById('prSupplierDd');
      if (clients.length === 0) {
        dd.innerHTML = '<div class="pr-supplier-dd-entry text-gray-400 cursor-default">검색 결과 없음</div>';
      } else {
        dd.innerHTML = clients.map(function(cl) {
          var safeName = (cl.client_name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          return '<div class="pr-supplier-dd-entry" onmousedown="event.preventDefault();prSelectSupplier(' + cl.id + ',\'' + safeName + '\')">'
            + (cl.client_name || '') + '</div>';
        }).join('');
      }
      dd.classList.remove('hidden');
    } catch(e) { console.error('supplier search error:', e); }
  }, 200);
}

function prSelectSupplier(id, name) {
  document.getElementById('prSupplierId').value = id;
  document.getElementById('prSupplierSearch').value = name;
  document.getElementById('prSupplierDd').classList.add('hidden');
}

function prCalcRowAmount(idx) {
  var qty = parseFloat((document.getElementById('pri_qty_' + idx).value || '').replace(/,/g, '')) || 0;
  var price = parseFloat((document.getElementById('pri_price_' + idx).value || '').replace(/,/g, '')) || 0;
  var amount = qty * price;
  document.getElementById('pri_amount_' + idx).value = amount.toLocaleString('ko-KR');
  prCalcTotalAmount();
}

function prCalcTotalAmount() {
  var total = 0;
  var body = document.getElementById('prItemsBody');
  if (!body) return;
  for (var i = 1; i <= prItemCount; i++) {
    var el = document.getElementById('pri_amount_' + i);
    if (el && el.closest('tr') && el.closest('tr').parentNode) {
      total += parseFloat((el.value || '').replace(/,/g, '')) || 0;
    }
  }
  document.getElementById('prTotalAmount').textContent = total.toLocaleString() + '원';
}

function buildPRPayload() {
  var supplierId = document.getElementById('prSupplierId').value;
  var items = [];
  for (var i = 1; i <= prItemCount; i++) {
    var rowEl = document.getElementById('pri-row-' + i);
    if (!rowEl || !rowEl.parentNode) continue;
    var nameEl = document.getElementById('pri_name_' + i);
    var idEl = document.getElementById('pri_id_' + i);
    var qtyEl = document.getElementById('pri_qty_' + i);
    var unitEl = document.getElementById('pri_unit_' + i);
    var priceEl = document.getElementById('pri_price_' + i);
    var noteEl = document.getElementById('pri_note_' + i);
    if (!nameEl || !nameEl.value.trim()) continue;
    items.push({
      item_id: idEl && idEl.value ? parseInt(idEl.value) : null,
      item_name: nameEl.value.trim(),
      quantity: parseFloat((qtyEl ? qtyEl.value : '1').replace(/,/g, '')) || 1,
      unit: unitEl ? unitEl.value : 'EA',
      estimated_unit_price: parseFloat((priceEl ? priceEl.value : '0').replace(/,/g, '')) || 0,
      notes: noteEl ? noteEl.value.trim() : ''
    });
  }
  return {
    supplier_id: supplierId ? parseInt(supplierId) : null,
    urgency: document.getElementById('prUrgency').value,
    reason: document.getElementById('prReason').value.trim() || null,
    notes: document.getElementById('prNotes').value.trim() || null,
    items: items
  };
}

async function submitPRRequest() {
  var payload = buildPRPayload();
  if (payload.items.length === 0) {
    showToast('품목을 1개 이상 입력해주세요.', 'warning');
    return;
  }
  try {
    var res;
    if (prEditMode && prEditId) {
      res = await axios.put('/api/purchase-requests/' + prEditId, payload);
    } else {
      res = await axios.post('/api/purchase-requests', payload);
    }
    if (res.data.success) {
      showToast(prEditMode ? '수정되었습니다.' : '발주 요청이 제출되었습니다.', 'success');
      setTimeout(function() { window.location.href = '/purchase-requests'; }, 800);
    } else {
      showToast('저장 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('저장 중 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}
