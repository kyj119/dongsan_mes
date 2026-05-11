// ── 발주 등록/수정 폼 스크립트 ──

var editMode = false;
var editPoId = null;
var itemCount = 0;
var supplierTimer = null;
var itemSearchTimers = {};
var storageZones = [];
var groupItemsCache = [];

// ── SVG 아이콘 헬퍼 ──
var SVG = {
  x: '<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  trash: '<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
  inbox: '<svg class="w-8 h-8 text-gray-300 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
  chevronRight: '<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  file: '<svg class="w-4 h-4 text-blue-500 mr-2 inline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>',
  edit: '<svg class="w-5 h-5 text-blue-600 inline mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
  notepad: '<svg class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M12 2v4"/><path d="M16 2v4"/><rect width="16" height="18" x="4" y="4" rx="2"/><path d="M8 10h6"/><path d="M8 14h8"/><path d="M8 18h5"/></svg>'
};

// ── 유틸리티 ──
function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function formatAmount(n) {
  return (n || 0).toLocaleString() + '원';
}

function buildSpecStr(item) {
  // specification 우선, 없으면 width_mm → cm 변환
  if (item.specification) return item.specification;
  var parts = [];
  if (item.width_mm) {
    parts.push((item.width_mm / 10).toFixed(0) + 'cm');
  }
  if (item.sub_category) {
    parts.push(item.sub_category);
  } else if (item.category && !item.width_mm) {
    parts.push(item.category);
  }
  return parts.join(' / ');
}

// ── 초기화 ──
(function() {
  var params = new URLSearchParams(window.location.search);
  var editId = params.get('edit');
  if (editId) {
    editMode = true;
    editPoId = parseInt(editId);
    document.getElementById('formTitle').innerHTML = SVG.edit + '발주서 수정';
    loadPOData(editPoId);
  } else {
    document.getElementById('orderDate').value = new Date().toISOString().split('T')[0];
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('expectedDate').value = tomorrow.toISOString().split('T')[0];
    addItemRow();
    // 납품 장소 기본값
    axios.get('/api/settings').then(function(res) {
      if (res.data && res.data.data) {
        var locEl = document.getElementById('deliveryLocation');
        if (locEl && !locEl.value && res.data.data.company_address) locEl.value = res.data.data.company_address;
      }
    }).catch(function(err) { console.error('[purchaseOrderForm] 설정 로드 실패', err); });
  }
  loadStorageZonesFilter();
  updateEmptyState();
})();

// ── 창고 구역 필터 로드 ──
async function loadStorageZonesFilter() {
  try {
    var res = await axios.get('/api/storage-zones');
    if (res.data.success) {
      storageZones = res.data.data || [];
      var sel = document.getElementById('zoneFilter');
      if (!sel) return;
      sel.innerHTML = '<option value="">전체 구역</option>';
      storageZones.forEach(function(z) {
        sel.innerHTML += '<option value="' + z.id + '">' + escapeHtml(z.zone_name) + '</option>';
      });
    }
  } catch(e) { console.log('zone filter load skip:', e); }
}

function filterItemsByZone() {
  // 구역 필터: 품목 검색 시 해당 구역의 품목만 표시 (향후 확장)
  // 현재는 단순히 존 선택 값을 저장하여 searchItems에서 사용
}

// ── 품목 수/빈 상태 관리 ──
function updateItemCount() {
  var rows = document.querySelectorAll('#itemsBody tr[id^="item-row-"]');
  var badge = document.getElementById('itemCountBadge');
  if (badge) badge.textContent = rows.length + '개';
  updateEmptyState();
}

function updateEmptyState() {
  var rows = document.querySelectorAll('#itemsBody tr[id^="item-row-"]');
  var emptyMsg = document.getElementById('emptyItemsMsg');
  if (!emptyMsg) return;
  if (rows.length === 0) {
    emptyMsg.classList.remove('hidden');
  } else {
    emptyMsg.classList.add('hidden');
  }
}

// ══════════════════════════════════════════════════════
// 공급업체 검색 (실시간 드롭다운 + Enter 모달)
// ══════════════════════════════════════════════════════
function debounceSupplierSearch() {
  clearTimeout(supplierTimer);
  var q = document.getElementById('supplierSearch').value.trim();
  if (q.length < 2) {
    document.getElementById('supplierDropdown').classList.add('hidden');
    return;
  }
  supplierTimer = setTimeout(function() {
    axios.get('/api/clients?search=' + encodeURIComponent(q) + '&limit=10')
      .then(function(res) {
        var clients = (res.data && res.data.data && res.data.data.clients) ? res.data.data.clients : [];
        var dd = document.getElementById('supplierDropdown');
        if (!dd) return;
        if (clients.length === 0) {
          dd.innerHTML = '<div class="po-dropdown-item text-gray-400 cursor-default">검색 결과 없음</div>';
        } else {
          dd.innerHTML = clients.map(function(cl) {
            var safeName = escapeAttr(cl.client_name || '');
            var typeBadge = '';
            if (cl.client_type === 'PURCHASE') typeBadge = ' <span class="text-xs text-amber-600">(매입)</span>';
            else if (cl.client_type === 'BOTH') typeBadge = ' <span class="text-xs text-gray-500">(매출+매입)</span>';
            return '<div class="po-dropdown-item" onmousedown="event.preventDefault();selectSupplier(' + cl.id + ',\'' + safeName + '\')">'
              + '<div class="font-medium text-sm">' + escapeHtml(cl.client_name) + typeBadge + '</div>'
              + '<div class="text-xs text-gray-400">'
              + (cl.client_code || '')
              + (cl.business_registration_number ? ' | ' + cl.business_registration_number : '')
              + '</div></div>';
          }).join('');
        }
        dd.classList.remove('hidden');
      });
  }, 250);
}

function handleSupplierEnter(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  document.getElementById('supplierDropdown').classList.add('hidden');
  var q = document.getElementById('supplierSearch').value.trim();
  if (!q) return;
  axios.get('/api/clients?search=' + encodeURIComponent(q) + '&limit=50')
    .then(function(res) {
      var clients = (res.data && res.data.data && res.data.data.clients) ? res.data.data.clients : [];
      if (clients.length === 1) {
        selectSupplier(clients[0].id, clients[0].client_name);
        showToast(clients[0].client_name + ' 선택됨', 'success');
      } else {
        openSupplierModal(q, clients);
      }
    })
    .catch(function(err) { console.error('Supplier search error:', err); });
}

// 포커스 벗어나면 드롭다운 닫기
document.getElementById('supplierSearch').addEventListener('blur', function() {
  setTimeout(function() {
    var dd = document.getElementById('supplierDropdown');
    if (dd) dd.classList.add('hidden');
  }, 200);
});

function selectSupplier(id, name) {
  document.getElementById('supplierId').value = id;
  document.getElementById('supplierSearch').value = name;
  document.getElementById('supplierDropdown').classList.add('hidden');
  // 공급업체 뱃지 표시
  var badge = document.getElementById('supplierBadge');
  if (badge) {
    badge.innerHTML = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">'
      + escapeHtml(name)
      + ' <button onclick="clearSupplier()" class="ml-1 text-blue-400 hover:text-blue-600" title="해제">&times;</button>'
      + '</span>';
  }
  // 기존 품목 단가 재조회
  refreshPricesForSupplier(id);
  // 자주 품목 칩 로드
  loadFreqItems(id);
}

// ── 자주 품목 칩 로드 ──
async function loadFreqItems(supplierId) {
  var container = document.getElementById('poFreqItems');
  if (!container) return;
  try {
    var res = await axios.get('/api/purchase-orders?supplier_id=' + supplierId + '&limit=5&sort=created_at_desc');
    if (!res.data.success) { container.classList.add('hidden'); return; }
    var pos = res.data.data || [];
    // 최근 PO들에서 품목 집계 (TOP 5)
    var itemMap = {};
    pos.forEach(function(po) {
      var items = po.items || [];
      items.forEach(function(it) {
        if (!it.item_id) return;
        var key = it.item_id;
        if (!itemMap[key]) {
          itemMap[key] = { item_id: it.item_id, item_name: it.item_name, unit_price: it.unit_price, unit: it.unit || 'EA', count: 0 };
        }
        itemMap[key].count++;
      });
    });
    var sorted = Object.values(itemMap).sort(function(a, b) { return b.count - a.count; }).slice(0, 5);
    if (sorted.length === 0) { container.classList.add('hidden'); return; }
    // 칩 기존 내용 교체 (레이블 뒤에)
    var chips = sorted.map(function(it) {
      return '<button class="px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700 hover:bg-blue-100"'
        + ' onclick="addFreqItem(' + it.item_id + ',\'' + escapeAttr(it.item_name || '') + '\',' + (it.unit_price || 0) + ',\'' + escapeAttr(it.unit || 'EA') + '\')">'
        + escapeHtml(it.item_name) + '</button>';
    }).join('');
    // 레이블 유지하고 칩만 교체
    container.innerHTML = '<span class="text-xs text-gray-400 mr-1 self-center">자주 품목:</span>' + chips;
    container.classList.remove('hidden');
  } catch(e) {
    container.classList.add('hidden');
    console.log('loadFreqItems skip:', e);
  }
}

function addFreqItem(itemId, itemName, unitPrice, unit) {
  var idx = addItemRow({
    item_id: itemId,
    item_name: itemName,
    quantity: 1,
    unit: unit,
    unit_price: unitPrice,
    vat_included: true
  });
  calcTotals();
}

// ── 마지막 발주 복제 ──
async function cloneLastPO() {
  var supplierId = document.getElementById('supplierId').value;
  if (!supplierId) {
    showToast('먼저 공급업체를 선택하세요', 'warning');
    return;
  }
  try {
    var res = await axios.get('/api/purchase-orders?supplier_id=' + supplierId + '&limit=1&sort=created_at_desc');
    if (!res.data.success || !res.data.data || res.data.data.length === 0) {
      showToast('해당 공급업체의 이전 발주가 없습니다.', 'warning');
      return;
    }
    var lastPo = res.data.data[0];
    // 상세 조회
    var detailRes = await axios.get('/api/purchase-orders/' + lastPo.id);
    if (!detailRes.data.success) { showToast('발주 상세 조회 실패', 'error'); return; }
    var po = detailRes.data.data;
    var items = po.items || [];
    if (items.length === 0) { showToast('복제할 품목이 없습니다.', 'warning'); return; }
    // 기존 행 초기화
    document.getElementById('itemsBody').innerHTML = '';
    itemCount = 0;
    // 오늘 날짜로 리셋
    document.getElementById('orderDate').value = new Date().toISOString().split('T')[0];
    // 품목 복제 (수량/단가 유지)
    items.forEach(function(it) {
      addItemRow({
        item_id: it.item_id || '',
        item_name: it.item_name || '',
        specification: it.specification || '',
        quantity: it.quantity || 1,
        unit: it.unit || 'EA',
        unit_price: it.unit_price || 0,
        vat_included: it.vat_included,
        notes: it.notes || ''
      });
    });
    calcTotals();
    showToast('발주 ' + (po.po_number || '') + ' 에서 ' + items.length + '개 품목 복제 완료', 'success');
  } catch(e) {
    showToast('복제 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

function clearSupplier() {
  document.getElementById('supplierId').value = '';
  document.getElementById('supplierSearch').value = '';
  var badge = document.getElementById('supplierBadge');
  if (badge) badge.innerHTML = '';
  var freqItems = document.getElementById('poFreqItems');
  if (freqItems) freqItems.classList.add('hidden');
}

function refreshPricesForSupplier(supplierId) {
  var rows = document.querySelectorAll('#itemsBody tr[id^="item-row-"]');
  rows.forEach(function(row) {
    var idx = row.id.replace('item-row-', '');
    var itemId = document.getElementById('item_id_' + idx);
    if (itemId && itemId.value && supplierId) {
      lookupPrice(idx, itemId.value, supplierId);
    }
  });
}

// ── 공급업체 모달 (Enter 검색 시) ──
function openSupplierModal(query, clients) {
  var modal = document.getElementById('supplierModal');
  var listHtml = '';
  if (clients.length === 0) {
    listHtml = '<div class="text-center py-8 text-gray-400">' + SVG.inbox + '<p>검색 결과가 없습니다.</p></div>';
  } else {
    listHtml = clients.map(function(cl) {
      var safeName = escapeAttr(cl.client_name || '');
      var typeBadge = '';
      if (cl.client_type === 'PURCHASE') typeBadge = ' <span class="text-xs text-amber-600">(매입)</span>';
      else if (cl.client_type === 'BOTH') typeBadge = ' <span class="text-xs text-gray-500">(매출+매입)</span>';
      return '<div class="modal-list-item" onclick="selectSupplierFromModal(' + cl.id + ',\'' + safeName + '\')">'
        + '<div class="font-medium text-sm">' + escapeHtml(cl.client_name) + typeBadge + '</div>'
        + '<div class="text-xs text-gray-500">'
        + (cl.client_code || '')
        + (cl.business_registration_number ? ' | ' + cl.business_registration_number : '')
        + (cl.phone ? ' | ' + cl.phone : '')
        + '</div></div>';
    }).join('');
  }
  modal.innerHTML = '<div class="overlay-bg" onclick="closeSupplierModal(event)">'
    + '<div class="modal-box" onclick="event.stopPropagation()">'
    + '<div class="p-4 border-b flex items-center justify-between">'
    + '<h3 class="font-bold text-gray-800">공급업체 선택</h3>'
    + '<button onclick="closeSupplierModal()" class="text-gray-400 hover:text-gray-600 p-1">' + SVG.x + '</button>'
    + '</div>'
    + '<div class="p-4 border-b">'
    + '<input type="text" id="modalSupplierSearch" value="' + escapeHtml(query || '') + '"'
    + ' placeholder="공급업체명 검색 후 Enter" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"'
    + ' onkeydown="handleModalSupplierSearch(event)" autofocus>'
    + '<div class="text-xs text-gray-400 mt-1">' + (clients.length > 0 ? clients.length + '건 검색됨' : '검색 결과 없음') + '</div>'
    + '</div>'
    + '<div style="max-height:50vh; overflow-y:auto;">' + listHtml + '</div>'
    + '</div></div>';
  setTimeout(function() {
    var si = document.getElementById('modalSupplierSearch');
    if (si) { si.focus(); si.select(); }
  }, 100);
}

function handleModalSupplierSearch(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  var q = document.getElementById('modalSupplierSearch').value.trim();
  if (!q) return;
  axios.get('/api/clients?search=' + encodeURIComponent(q) + '&limit=50')
    .then(function(res) {
      var clients = (res.data && res.data.data && res.data.data.clients) ? res.data.data.clients : [];
      if (clients.length === 1) {
        selectSupplierFromModal(clients[0].id, clients[0].client_name);
      } else {
        openSupplierModal(q, clients);
      }
    });
}

function selectSupplierFromModal(id, name) {
  selectSupplier(id, name);
  closeSupplierModal();
  showToast(name + ' 선택됨', 'success');
}

function closeSupplierModal(e) {
  if (e && e.target && !e.target.classList.contains('overlay-bg')) return;
  document.getElementById('supplierModal').innerHTML = '';
}


// ══════════════════════════════════════════════════════
// 품목 행 (단일 함수로 통합)
// ══════════════════════════════════════════════════════
function createItemRowHtml(idx, data) {
  data = data || {};
  var itemId = data.item_id || '';
  var itemName = escapeHtml(data.item_name || '');
  var spec = escapeHtml(data.specification || '');
  var qty = data.quantity || 1;
  var unit = data.unit || 'EA';
  var price = data.unit_price || 0;
  var amount = data.amount || (qty * price);
  var vatChecked = (data.vat_included !== undefined) ? (data.vat_included ? ' checked' : '') : ' checked';
  var notes = escapeHtml(data.notes || '');

  return '<td style="position:relative">'
    + '<input type="text" id="item_name_' + idx + '" value="' + itemName + '" placeholder="품목 검색..." autocomplete="off"'
    + ' oninput="searchItems(' + idx + ')" onblur="onItemBlur(' + idx + ')">'
    + '<input type="hidden" id="item_id_' + idx + '" value="' + itemId + '">'
    + '<div id="item_dd_' + idx + '" class="po-dropdown hidden"></div>'
    + '<div id="price_source_' + idx + '" class="mt-0.5"></div>'
    + '</td>'
    + '<td>'
    + '<input type="text" id="item_spec_' + idx + '" value="' + spec + '" placeholder="-" class="text-gray-600"'
    + ' style="font-size:12px">'
    + '</td>'
    + '<td>'
    + '<input type="number" id="item_qty_' + idx + '" value="' + qty + '" min="1" class="text-center"'
    + ' oninput="calcRowAmount(' + idx + ')">'
    + '</td>'
    + '<td>'
    + '<input type="text" id="item_unit_' + idx + '" value="' + escapeHtml(unit) + '" class="text-center">'
    + '</td>'
    + '<td>'
    + '<input type="text" inputmode="numeric" data-money id="item_price_' + idx + '" value="' + (Number(price) || 0).toLocaleString('ko-KR') + '" class="text-right"'
    + ' oninput="calcRowAmount(' + idx + ')">'
    + '</td>'
    + '<td>'
    + '<input type="text" id="item_amount_' + idx + '" value="' + (Number(amount) || 0).toLocaleString('ko-KR') + '" readonly class="text-right">'
    + '</td>'
    + '<td class="text-center" style="padding:6px 4px">'
    + '<input type="checkbox" id="item_vat_' + idx + '"' + vatChecked
    + ' onchange="calcRowAmount(' + idx + ')" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" title="부가세 포함">'
    + '</td>'
    + '<td>'
    + '<input type="text" id="item_notes_' + idx + '" value="' + notes + '" placeholder="-" style="font-size:12px">'
    + '</td>'
    + '<td class="text-center" style="padding:6px 4px">'
    + '<button type="button" onclick="removeItemRow(' + idx + ')"'
    + ' class="p-1 text-gray-400 hover:text-red-600 rounded" title="삭제">' + SVG.x + '</button>'
    + '</td>';
}

function addItemRow(data) {
  itemCount++;
  var idx = itemCount;
  var tr = document.createElement('tr');
  tr.id = 'item-row-' + idx;
  tr.className = 'border-b border-gray-100 hover:bg-gray-50 item-row-animate';
  tr.innerHTML = createItemRowHtml(idx, data);
  document.getElementById('itemsBody').appendChild(tr);
  if (window.bindMoneyInputs) window.bindMoneyInputs(tr);

  var nameInput = document.getElementById('item_name_' + idx);
  if (nameInput) {
    // 한국어 IME 입력 완료 시 검색 트리거
    nameInput.addEventListener('compositionend', function() {
      searchItems(idx);
    });
    // blur 시 드롭다운 닫기
    nameInput.addEventListener('blur', function() {
      setTimeout(function() {
        var dd = document.getElementById('item_dd_' + idx);
        if (dd) dd.classList.add('hidden');
      }, 200);
    });
    if (!data) nameInput.focus();
  }
  updateItemCount();
  return idx;
}

function removeItemRow(idx) {
  var row = document.getElementById('item-row-' + idx);
  if (row) row.remove();
  calcTotals();
  updateItemCount();
}


// ══════════════════════════════════════════════════════
// 품목 검색 & 선택
// ══════════════════════════════════════════════════════
async function searchItems(idx) {
  clearTimeout(itemSearchTimers[idx]);
  var q = document.getElementById('item_name_' + idx).value.trim();
  if (q.length < 1) {
    document.getElementById('item_id_' + idx).value = '';
    return;
  }
  itemSearchTimers[idx] = setTimeout(async function() {
    try {
      var url = '/api/items?search=' + encodeURIComponent(q) + '&type=purchase&limit=50';
      var zoneId = document.getElementById('zoneFilter') ? document.getElementById('zoneFilter').value : '';
      if (zoneId) url += '&zone_id=' + zoneId;
      var res = await axios.get(url);
      var items = (res.data && res.data.data) ? res.data.data : [];
      if (items.length === 1) {
        var it = items[0];
        selectItem(idx, it.id, it.item_name || '', it.base_price || 0, it.unit || 'EA', buildSpecStr(it));
      } else if (items.length > 1) {
        window.openItemSearchModal({
          type: 'purchase', search: q,
          onSelect: function(item) {
            selectItem(idx, parseInt(item.id), item.name, parseFloat(item.price) || 0, item.unit, item.specification || '');
          }
        });
      }
    } catch(e) { console.error('searchItems error:', e); }
  }, 300);
}

function selectItem(idx, id, name, price, unit, spec) {
  document.getElementById('item_id_' + idx).value = id;
  document.getElementById('item_name_' + idx).value = name;
  document.getElementById('item_price_' + idx).value = fmtMoneyInput(price);
  document.getElementById('item_unit_' + idx).value = unit || 'EA';
  var specEl = document.getElementById('item_spec_' + idx);
  if (specEl && spec) specEl.value = spec;
  var dd = document.getElementById('item_dd_' + idx);
  if (dd) dd.classList.add('hidden');

  // 단가 자동 조회
  var supplierId = document.getElementById('supplierId').value;
  if (supplierId && id) {
    lookupPrice(idx, id, supplierId);
  }
  calcRowAmount(idx);
}

function lookupPrice(idx, itemId, supplierId) {
  axios.get('/api/prices?item_id=' + itemId + '&client_id=' + supplierId + '&context=purchase')
    .then(function(res) {
      if (res.data && res.data.suggested_price > 0) {
        document.getElementById('item_price_' + idx).value = fmtMoneyInput(res.data.suggested_price);
        calcRowAmount(idx);
        var badge = document.getElementById('price_source_' + idx);
        if (badge) {
          var src = res.data.price_source;
          var label, color;
          if (src === 'price_list') { label = '단가표'; color = 'bg-blue-50 text-blue-700'; }
          else if (src === 'recent_transaction') { label = '최근거래'; color = 'bg-blue-50 text-blue-700'; }
          else if (src === 'client_item_price') { label = '협의단가'; color = 'bg-green-50 text-green-700'; }
          else { label = '기본단가'; color = 'bg-gray-100 text-gray-600'; }
          badge.innerHTML = '<span class="text-xs px-1.5 py-0.5 rounded ' + color + '">' + label + '</span>';
        }
      }
    }).catch(function(e) { console.log('price lookup skip:', e); });
}

function onItemBlur(idx) {
  // 검색 API 응답 대기 후 판단 (비동기 selectItem이 먼저 완료되도록)
  setTimeout(function() {
    var iid = document.getElementById('item_id_' + idx);
    var inp = document.getElementById('item_name_' + idx);
    // 모달이 열려있으면 판단 보류
    if (document.getElementById('itemSearchModal')) return;
    if (iid && !iid.value && inp && inp.value.trim()) {
      inp.classList.add('border-amber-400');
      inp.classList.remove('border-gray-300');
      var badge = document.getElementById('price_source_' + idx);
      if (badge) badge.innerHTML = '<span class="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">미등록</span>';
    } else if (iid && iid.value) {
      inp.classList.remove('border-amber-400');
      inp.classList.add('border-gray-300');
      var badge = document.getElementById('price_source_' + idx);
      if (badge && badge.innerHTML.indexOf('미등록') >= 0) badge.innerHTML = '';
    }
  }, 500);
}


// ══════════════════════════════════════════════════════
// 금액 계산
// ══════════════════════════════════════════════════════
function calcRowAmount(idx) {
  var qty = parseFloat(document.getElementById('item_qty_' + idx).value) || 0;
  var price = parseMoney(document.getElementById('item_price_' + idx).value);
  var amount = qty * price;
  document.getElementById('item_amount_' + idx).value = fmtMoneyInput(amount);
  calcTotals();
}

function calcTotals() {
  var rows = document.querySelectorAll('#itemsBody tr[id^="item-row-"]');
  var total = 0;
  var vat = 0;
  rows.forEach(function(row) {
    var idx = row.id.replace('item-row-', '');
    var amountEl = document.getElementById('item_amount_' + idx);
    var vatEl = document.getElementById('item_vat_' + idx);
    var amount = amountEl ? parseMoney(amountEl.value) : 0;
    total += amount;
    if (vatEl && vatEl.checked) {
      vat += Math.round(amount * 0.1);
    }
  });
  document.getElementById('totalAmount').textContent = formatAmount(total);
  document.getElementById('vatAmount').textContent = formatAmount(vat);
  document.getElementById('finalAmount').textContent = formatAmount(total + vat);
}


// ══════════════════════════════════════════════════════
// 발주 데이터 로드 (수정 모드)
// ══════════════════════════════════════════════════════
async function loadPOData(id) {
  try {
    var res = await axios.get('/api/purchase-orders/' + id);
    if (!res.data.success) { showToast('발주 데이터 불러오기 실패', 'error'); return; }
    var po = res.data.data;

    if (po.supplier_id) {
      selectSupplier(po.supplier_id, po.supplier_name || '');
    }
    if (po.order_date) document.getElementById('orderDate').value = po.order_date;
    if (po.expected_date) document.getElementById('expectedDate').value = po.expected_date;
    else if (po.delivery_date) document.getElementById('expectedDate').value = po.delivery_date;
    if (po.delivery_location) document.getElementById('deliveryLocation').value = po.delivery_location;
    if (po.notes) document.getElementById('notes').value = po.notes;
    if (po.internal_notes) document.getElementById('internalNotes').value = po.internal_notes;

    var items = po.items || [];
    document.getElementById('itemsBody').innerHTML = '';
    itemCount = 0;
    if (items.length === 0) {
      addItemRow();
    } else {
      items.forEach(function(it) {
        addItemRow({
          item_id: it.item_id || '',
          item_name: it.item_name || '',
          quantity: it.quantity || 1,
          unit: it.unit || 'EA',
          unit_price: it.unit_price || 0,
          amount: it.amount || 0,
          vat_included: it.vat_included,
          notes: it.notes || ''
        });
      });
      calcTotals();
    }
  } catch(e) {
    showToast('발주 데이터 로드 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}


// ══════════════════════════════════════════════════════
// 저장
// ══════════════════════════════════════════════════════
async function savePO(status) {
  var supplierId = document.getElementById('supplierId').value;
  if (!supplierId) {
    showToast('공급업체를 선택하세요.', 'warning');
    document.getElementById('supplierSearch').focus();
    return;
  }

  var rows = document.querySelectorAll('#itemsBody tr[id^="item-row-"]');
  var items = [];
  rows.forEach(function(row) {
    var idx = row.id.replace('item-row-', '');
    var itemName = document.getElementById('item_name_' + idx).value.trim();
    var qty = parseFloat(document.getElementById('item_qty_' + idx).value) || 0;
    var price = parseMoney(document.getElementById('item_price_' + idx).value);
    if (itemName && qty > 0) {
      items.push({
        item_id: document.getElementById('item_id_' + idx).value || null,
        item_name: itemName,
        specification: document.getElementById('item_spec_' + idx) ? document.getElementById('item_spec_' + idx).value.trim() || null : null,
        quantity: qty,
        unit: document.getElementById('item_unit_' + idx).value || 'EA',
        unit_price: price,
        amount: qty * price,
        vat_included: document.getElementById('item_vat_' + idx).checked ? 1 : 0,
        notes: document.getElementById('item_notes_' + idx) ? document.getElementById('item_notes_' + idx).value.trim() || null : null
      });
    }
  });
  if (items.length === 0) { showToast('발주 품목을 1개 이상 입력하세요.', 'warning'); return; }

  var payload = {
    supplier_id: parseInt(supplierId),
    order_date: document.getElementById('orderDate').value || null,
    expected_date: document.getElementById('expectedDate').value || null,
    delivery_date: document.getElementById('expectedDate').value || null,
    delivery_location: document.getElementById('deliveryLocation').value.trim() || null,
    notes: document.getElementById('notes').value.trim() || null,
    internal_notes: document.getElementById('internalNotes').value.trim() || null,
    status: status,
    items: items
  };

  // 확정 버튼 로딩 상태
  var confirmBtn = document.getElementById('confirmBtn');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = '처리 중...'; }

  try {
    var res;
    if (editMode && editPoId) {
      res = await axios.put('/api/purchase-orders/' + editPoId, payload);
    } else {
      res = await axios.post('/api/purchase-orders', payload);
    }
    if (res.data.success) {
      showToast(editMode ? '발주가 수정되었습니다.' : '발주가 등록되었습니다.', 'success');
      setTimeout(function() { window.location.href = '/purchase-orders'; }, 800);
    } else {
      showToast('저장 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('저장 중 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  } finally {
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = '<svg class="w-4 h-4 inline -mt-0.5 mr-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>발주 확정'; }
  }
}


// ══════════════════════════════════════════════════════
// 템플릿 기능
// ══════════════════════════════════════════════════════
async function openTemplateModal() {
  try {
    var res = await axios.get('/api/purchase-orders/templates');
    var templates = (res.data && res.data.data) ? res.data.data : [];
    var modal = document.getElementById('templateModal');
    var listHtml = '';
    if (templates.length === 0) {
      listHtml = '<div class="text-center py-8 text-gray-400">' + SVG.inbox + '<p class="text-sm">저장된 템플릿이 없습니다.</p></div>';
    } else {
      listHtml = templates.map(function(t) {
        return '<div class="flex items-center justify-between p-3 border-b border-gray-100 hover:bg-blue-50 cursor-pointer group" onclick="loadTemplate(' + t.id + ')">'
          + '<div>'
          + '<div class="font-medium text-sm text-gray-800">' + escapeHtml(t.name) + '</div>'
          + '<div class="text-xs text-gray-500">'
          + (t.supplier_name ? t.supplier_name + ' · ' : '')
          + (t.item_count || 0) + '개 품목'
          + '</div>'
          + '</div>'
          + '<div class="flex items-center gap-2">'
          + '<button onclick="event.stopPropagation();deleteTemplate(' + t.id + ')" class="p-1 text-gray-300 hover:text-red-500" title="삭제">' + SVG.trash + '</button>'
          + '<span class="text-gray-300 group-hover:text-blue-500">' + SVG.chevronRight + '</span>'
          + '</div>'
          + '</div>';
      }).join('');
    }
    modal.innerHTML = '<div class="overlay-bg" onclick="closeTemplateModal(event)">'
      + '<div class="modal-box" onclick="event.stopPropagation()">'
      + '<div class="p-4 border-b flex items-center justify-between">'
      + '<h3 class="font-bold text-gray-800">' + SVG.file + '템플릿에서 불러오기</h3>'
      + '<button onclick="closeTemplateModal()" class="text-gray-400 hover:text-gray-600 p-1">' + SVG.x + '</button>'
      + '</div>'
      + '<div style="max-height:60vh; overflow-y:auto;">' + listHtml + '</div>'
      + '</div></div>';
  } catch(e) {
    showToast('템플릿 목록 로드 실패', 'error');
  }
}

function closeTemplateModal(e) {
  if (e && e.target && !e.target.classList.contains('overlay-bg')) return;
  document.getElementById('templateModal').innerHTML = '';
}

async function loadTemplate(templateId) {
  try {
    var res = await axios.get('/api/purchase-orders/templates/' + templateId);
    if (!res.data.success) { showToast('템플릿 로드 실패', 'error'); return; }
    var tmpl = res.data.data;

    if (tmpl.supplier_id) {
      selectSupplier(tmpl.supplier_id, tmpl.supplier_name || '');
    }

    document.getElementById('itemsBody').innerHTML = '';
    itemCount = 0;

    var items = tmpl.items || [];
    if (items.length === 0) {
      addItemRow();
    } else {
      items.forEach(function(it) {
        addItemRow({
          item_id: it.item_id || '',
          item_name: it.item_name || '',
          quantity: it.quantity || 1,
          unit: it.unit || 'EA',
          unit_price: it.unit_price || 0,
          vat_included: it.vat_included,
          notes: it.notes || ''
        });
      });
      calcTotals();
    }

    closeTemplateModal();
    showToast('템플릿 "' + tmpl.name + '" 불러오기 완료', 'success');
  } catch(e) {
    showToast('템플릿 로드 실패', 'error');
  }
}

async function deleteTemplate(templateId) {
  if (!(await showConfirm('이 템플릿을 삭제하시겠습니까?', { danger: true }))) return;
  try {
    await axios.delete('/api/purchase-orders/templates/' + templateId);
    showToast('템플릿 삭제됨', 'success');
    openTemplateModal();
  } catch(e) {
    showToast('삭제 실패', 'error');
  }
}

async function saveAsTemplate() {
  var rows = document.querySelectorAll('#itemsBody tr[id^="item-row-"]');
  var items = [];
  rows.forEach(function(row) {
    var idx = row.id.replace('item-row-', '');
    var itemName = document.getElementById('item_name_' + idx).value.trim();
    if (itemName) {
      items.push({
        item_id: document.getElementById('item_id_' + idx).value || null,
        item_name: itemName,
        quantity: parseFloat(document.getElementById('item_qty_' + idx).value) || 1,
        unit: document.getElementById('item_unit_' + idx).value || 'EA',
        unit_price: parseMoney(document.getElementById('item_price_' + idx).value),
        vat_included: document.getElementById('item_vat_' + idx).checked ? 1 : 0
      });
    }
  });

  if (items.length === 0) {
    showToast('저장할 품목이 없습니다.', 'warning');
    return;
  }

  var name = prompt('템플릿 이름을 입력하세요:');
  if (!name || !name.trim()) return;

  try {
    var res = await axios.post('/api/purchase-orders/templates', {
      name: name.trim(),
      supplier_id: document.getElementById('supplierId').value || null,
      items: items
    });
    if (res.data.success) {
      showToast('템플릿 "' + name.trim() + '" 저장 완료', 'success');
    } else {
      showToast('저장 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('템플릿 저장 실패', 'error');
  }
}


// ══════════════════════════════════════════════════════
// 그룹 품목 추가
// ══════════════════════════════════════════════════════
async function showGroupAddModal() {
  try {
    var res = await axios.get('/api/items/groups');
    if (res.data.success) {
      var sel = document.getElementById('groupAddSelect');
      sel.innerHTML = '<option value="">그룹을 선택하세요...</option>';
      res.data.data.forEach(function(g) {
        sel.innerHTML += '<option value="' + escapeHtml(g.item_group) + '">' + escapeHtml(g.item_group) + ' (' + g.variant_count + '개 규격)</option>';
      });
    }
  } catch(e) { console.error('그룹 목록 로드 실패:', e); }
  document.getElementById('groupAddItems').innerHTML = '<p class="text-sm text-gray-500 text-center py-4">그룹을 선택하면 폭별 품목이 표시됩니다.</p>';
  document.getElementById('groupAddModal').classList.remove('hidden');
}

function closeGroupAddModal() {
  document.getElementById('groupAddModal').classList.add('hidden');
}

async function loadGroupItems() {
  var groupName = document.getElementById('groupAddSelect').value;
  if (!groupName) {
    document.getElementById('groupAddItems').innerHTML = '<p class="text-sm text-gray-500 text-center py-4">그룹을 선택하면 폭별 품목이 표시됩니다.</p>';
    return;
  }
  try {
    var res = await axios.get('/api/items/groups/' + encodeURIComponent(groupName));
    if (res.data.success) {
      groupItemsCache = res.data.data;
      var html = '<div class="space-y-2 max-h-60 overflow-y-auto">';
      html += '<label class="flex items-center gap-2 p-2 bg-gray-50 rounded cursor-pointer">';
      html += '<input type="checkbox" id="groupCheckAll" onchange="toggleAllGroupItems(this.checked)" checked class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500">';
      html += '<span class="text-sm font-medium text-gray-700">전체 선택</span>';
      html += '</label>';
      groupItemsCache.forEach(function(item, i) {
        var widthDisplay = item.width_mm ? (item.width_mm / 10).toFixed(0) + 'cm' : '-';
        var price = (item.base_price || 0).toLocaleString();
        html += '<label class="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">';
        html += '<input type="checkbox" class="groupItemCheck h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" data-idx="' + i + '" checked>';
        html += '<span class="text-sm text-gray-900 flex-1">' + escapeHtml(item.item_name) + '</span>';
        html += '<span class="text-xs text-gray-500">' + widthDisplay + '</span>';
        html += '<span class="text-xs text-gray-400">' + price + '원</span>';
        html += '</label>';
      });
      html += '</div>';
      document.getElementById('groupAddItems').innerHTML = html;
    }
  } catch(e) {
    document.getElementById('groupAddItems').innerHTML = '<p class="text-sm text-red-500 text-center py-4">그룹 품목 로드 실패</p>';
  }
}

function toggleAllGroupItems(checked) {
  document.querySelectorAll('.groupItemCheck').forEach(function(cb) {
    cb.checked = checked;
  });
}

function addGroupItems() {
  var checks = document.querySelectorAll('.groupItemCheck:checked');
  if (checks.length === 0) {
    showToast('추가할 품목을 선택해주세요.', 'warning');
    return;
  }
  checks.forEach(function(cb) {
    var i = parseInt(cb.getAttribute('data-idx'));
    var item = groupItemsCache[i];
    if (!item) return;
    var rowIdx = addItemRow({
      item_id: item.id,
      item_name: item.item_name,
      specification: buildSpecStr(item),
      quantity: 1,
      unit: item.unit || 'EA',
      unit_price: item.base_price || 0,
      vat_included: true
    });
  });
  closeGroupAddModal();
  calcTotals();
  showToast(checks.length + '개 품목이 추가되었습니다.', 'success');
}
