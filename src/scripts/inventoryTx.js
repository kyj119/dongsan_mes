// ===========================================================================
// 통합 증감내역 탭 (/inventory #tab=tx) — 전 품목 inventory_transactions
//
// ?raw concat 로 전역 스코프를 공유하므로 식별자는 전부 `invTx` 접두.
// 라벨은 window.INV_TX_LABELS(constants/inventoryTx.ts 주입) 단일 소스.
// ===========================================================================

var invTxPage = 1;
var invTxLimit = 50;
var invTxLoaded = false;

function invTxLabels() {
  return window.INV_TX_LABELS || { type: {}, ref: {}, reason: {}, style: {} };
}

/** base 단위 수량 표기 — 롤·시트류는 pack 환산을 안 하면 50배로 읽힌다 */
function invTxQty(qty, row) {
  if (window.uomFormatStock) return window.uomFormatStock(qty, row);
  return (Math.round((Number(qty) || 0) * 100) / 100) + ' ' + ((row && (row.base_unit || row.unit)) || '');
}

/** 유형 배지 */
function invTxTypeBadge(type) {
  var L = invTxLabels();
  var st = L.style[type] || { cls: 'bg-gray-100 text-gray-800', icon: 'fas fa-circle' };
  return '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded ' + st.cls + '">'
    + '<i class="' + st.icon + ' text-[7px] mr-1"></i>' + window.escapeHtml(L.type[type] || type) + '</span>';
}

/** 참조 문서 표기 — reference_type + #id */
function invTxRef(row) {
  if (!row.reference_type) return '-';
  var L = invTxLabels();
  var label = L.ref[row.reference_type] || row.reference_type;
  return window.escapeHtml(label) + (row.reference_id ? ' <span class="text-gray-400">#' + row.reference_id + '</span>' : '');
}

function invTxBuildParams() {
  var params = [];
  function push(id, key) {
    var el = document.getElementById(id);
    if (el && el.value) params.push(key + '=' + encodeURIComponent(el.value));
  }
  push('invTxDateFrom', 'date_from');
  push('invTxDateTo', 'date_to');
  push('invTxType', 'type');
  push('invTxCategory', 'category');
  push('invTxZone', 'zone_id');
  push('invTxRefType', 'reference_type');
  push('invTxSearch', 'search');
  push('invTxItemId', 'item_id');
  return params;
}

function invTxLoad() {
  var tbody = document.getElementById('invTxTableBody');
  if (!tbody) { console.warn('[inventoryTx] #invTxTableBody not found'); return; }
  var COLS = 10;
  tbody.innerHTML = '<tr><td colspan="' + COLS + '" class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>로딩 중...</td></tr>';

  var params = invTxBuildParams();
  params.push('page=' + invTxPage, 'limit=' + invTxLimit);

  axios.get('/api/inventory/transactions?' + params.join('&')).then(function(r) {
    var d = (r.data && r.data.data) || {};
    var rows = d.transactions || [];
    tbody.innerHTML = '';

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="' + COLS + '" class="text-center py-8 text-gray-400">해당 조건의 증감내역이 없습니다</td></tr>';
    }

    rows.forEach(function(row) {
      var signed = Number(row.signed_quantity) || 0;
      var qtyCls = signed > 0 ? 'text-blue-600' : (signed < 0 ? 'text-orange-600' : 'text-gray-500');
      var reasonTxt = invTxLabels().reason[row.reason] || row.reason || '';
      var memo = [reasonTxt, row.notes || ''].filter(Boolean).join(' · ');
      var tr = document.createElement('tr');
      tr.className = 'hover:bg-gray-50';
      tr.innerHTML = ''
        + '<td class="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">' + window.escapeHtml((row.transaction_date || '-').substring(0, 16).replace('T', ' ')) + '</td>'
        + '<td class="px-3 py-2 text-sm text-gray-900">'
          + '<div class="font-medium">' + window.escapeHtml(row.item_name || '(삭제된 품목)') + '</div>'
          + (row.item_code ? '<div class="text-xs text-gray-400">' + window.escapeHtml(row.item_code) + '</div>' : '')
        + '</td>'
        + '<td class="px-3 py-2 text-sm text-gray-600">' + window.escapeHtml(row.category || '-') + '</td>'
        + '<td class="px-3 py-2 text-sm">' + invTxTypeBadge(row.transaction_type) + '</td>'
        + '<td class="px-3 py-2 text-sm text-right font-medium tabular-nums ' + qtyCls + '" title="' + window.escapeHtml((signed > 0 ? '+' : '') + invTxQty(signed, row)) + '">'
          + (signed > 0 ? '+' : '') + window.escapeHtml(invTxQty(signed, row)) + '</td>'
        // 잔량 = 해당 「품목×사업자×창고」 행의 잔량이지 품목 총재고가 아니다 → 창고 열과 함께 읽어야 한다
        + '<td class="px-3 py-2 text-sm text-right text-gray-900 tabular-nums" title="해당 창고 기준 잔량: ' + window.escapeHtml(row.balance_after == null ? '-' : invTxQty(row.balance_after, row)) + '">'
          + (row.balance_after == null ? '-' : window.escapeHtml(invTxQty(row.balance_after, row))) + '</td>'
        + '<td class="px-3 py-2 text-sm text-gray-600">' + window.escapeHtml(row.zone_name || '기본창고') + '</td>'
        + '<td class="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">' + invTxRef(row) + '</td>'
        + '<td class="px-3 py-2 text-sm text-gray-600" title="' + window.escapeHtml(memo) + '">' + window.escapeHtml(memo || '-') + '</td>'
        + '<td class="px-3 py-2 text-sm text-gray-600">' + window.escapeHtml(row.handled_by_name || '-') + '</td>';
      tbody.appendChild(tr);
    });

    invTxRenderSummary(d.summary || {}, rows);
    invTxRenderPagination(d.pagination || {});
  }).catch(function(e) {
    console.error('[inventoryTx] load failed', e);
    tbody.innerHTML = '<tr><td colspan="' + COLS + '" class="text-center py-8 text-red-500">불러오기 실패</td></tr>';
  });
}

/**
 * 요약 칩 — 유형별 건수는 항상, **수량 합계는 단일 품목으로 좁혔을 때만** 보여준다.
 * 품목이 섞이면 장·m·통이 한 숫자로 더해져 의미가 없다.
 */
function invTxRenderSummary(summary, rows) {
  var box = document.getElementById('invTxSummary');
  if (!box) return;
  var byType = summary.by_type || [];
  var L = invTxLabels();
  var itemEl = document.getElementById('invTxItemId');
  var singleItem = !!(itemEl && itemEl.value);
  var unitRow = singleItem && rows.length ? rows[0] : null;

  if (!byType.length) { box.innerHTML = ''; return; }

  var html = '<span class="text-sm text-gray-500 mr-1">총 <strong class="text-gray-800">' + (summary.total || 0) + '</strong>건</span>';
  byType.forEach(function(t) {
    var st = L.style[t.type] || { cls: 'bg-gray-100 text-gray-800' };
    html += '<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded ' + st.cls + '">'
      + window.escapeHtml(L.type[t.type] || t.type) + ' ' + t.cnt + '건'
      + (unitRow ? ' <span class="tabular-nums">(' + window.escapeHtml(invTxQty(t.qty_sum, unitRow)) + ')</span>' : '')
      + '</span>';
  });
  if (!singleItem) {
    html += '<span class="text-xs text-gray-400">품목을 하나로 좁히면 수량 합계가 표시됩니다</span>';
  }
  box.innerHTML = html;
}

function invTxRenderPagination(p) {
  var total = document.getElementById('invTxTotalCount');
  var cur = document.getElementById('invTxCurrentPage');
  var tot = document.getElementById('invTxTotalPages');
  var prev = document.getElementById('invTxPrevPage');
  var next = document.getElementById('invTxNextPage');
  if (!total || !cur || !tot || !prev || !next) { console.warn('[inventoryTx] pagination nodes not found'); return; }
  invTxPage = p.page || 1;
  total.textContent = p.total || 0;
  cur.textContent = invTxPage;
  tot.textContent = p.total_pages || 1;
  prev.disabled = invTxPage <= 1;
  next.disabled = invTxPage >= (p.total_pages || 1);
}

window.invTxSearch = function() { invTxPage = 1; invTxLoad(); };

window.invTxReset = function() {
  ['invTxType', 'invTxCategory', 'invTxZone', 'invTxRefType', 'invTxSearch', 'invTxItemId'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var nameEl = document.getElementById('invTxItemName');
  if (nameEl) nameEl.textContent = '';
  invTxSetDefaultRange();
  invTxPage = 1;
  invTxLoad();
};

/** 날짜 입력 세팅 — .js-fp 는 flatpickr 가 붙어 있어 el.value 직접 대입만으론 달력과 어긋난다 */
function invTxSetDate(id, val) {
  var el = document.getElementById(id);
  if (!el) { console.warn('[inventoryTx] #' + id + ' not found'); return; }
  if (el._flatpickr) {
    if (val) el._flatpickr.setDate(val, false); else el._flatpickr.clear();
  }
  el.value = val || '';
}

/** 기본 기간 = 최근 30일 (전건 스캔 방지) */
function invTxSetDefaultRange() {
  var now = new Date();
  var past = new Date(now.getTime() - 30 * 86400000);
  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  invTxSetDate('invTxDateFrom', ymd(past));
  invTxSetDate('invTxDateTo', ymd(now));
}

/** 품목 단일 필터 적용(조회는 하지 않음) */
function invTxApplyItem(itemId, itemName) {
  var idEl = document.getElementById('invTxItemId');
  var nameEl = document.getElementById('invTxItemName');
  if (idEl) idEl.value = itemId || '';
  if (nameEl) nameEl.textContent = itemName ? ('품목: ' + itemName) : '';
}

/**
 * 「거래 이력」 모달 → 증감내역 탭. 품목 이력은 **기간 제한 없이 전건**을 본다 —
 * 기본 30일 창에 걸려 "이력 없음"으로 보이는 오해를 막는다.
 * 최초 진입이면 invTxInit 이 __invTxPending 을 집어삼켜 **한 번만** 조회한다.
 */
window.invTxOpenForItem = function() {
  var it = window.__invTxModalItem;
  if (!it) return;
  var modal = document.getElementById('transactionModal');
  if (modal) modal.classList.add('hidden');
  window.__invTxPending = it;
  if (typeof switchInvTab === 'function') switchInvTab('tx');
};

/** __invTxPending 소비 — 있으면 기간 해제 + 품목 고정 */
function invTxConsumePending() {
  var pend = window.__invTxPending;
  if (!pend) return false;
  window.__invTxPending = null;
  invTxSetDate('invTxDateFrom', '');
  invTxSetDate('invTxDateTo', '');
  invTxApplyItem(pend.id, pend.name);
  invTxPage = 1;
  return true;
}

// CSV — 인증이 헤더 전용이라 window.open/<a href> 는 401. axios blob 경유.
window.invTxExport = async function() {
  try {
    var params = invTxBuildParams();
    var res = await axios.get('/api/inventory/transactions/export' + (params.length ? '?' + params.join('&') : ''), { responseType: 'blob' });
    var blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
    var href = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = href;
    a.download = 'inventory_transactions_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(href);
  } catch (e) {
    console.error('[inventoryTx] export failed', e);
    if (window.showToast) showToast('내보내기 실패', 'error');
  }
};

/** 분류·창고 드롭다운 채우기 (재고 현황 탭과 같은 소스) */
function invTxLoadFilterOptions() {
  var cat = document.getElementById('invTxCategory');
  if (cat && cat.options.length <= 1) {
    axios.get('/api/inventory/meta/categories').then(function(r) {
      var list = ((r.data && r.data.data) || {}).categories || [];
      list.forEach(function(row) {
        if (!row.category) return;
        var o = document.createElement('option');
        o.value = row.category; o.textContent = row.category;
        cat.appendChild(o);
      });
    }).catch(function(e) { console.warn('[inventoryTx] categories load failed', e); });
  }

  var zone = document.getElementById('invTxZone');
  if (zone && zone.options.length <= 2) {
    axios.get('/api/storage-zones').then(function(r) {
      var list = (r.data && r.data.data) || [];
      list.forEach(function(z) {
        var o = document.createElement('option');
        o.value = z.id; o.textContent = z.zone_name;
        zone.appendChild(o);
      });
    }).catch(function(e) { console.warn('[inventoryTx] zones load failed', e); });
  }
}

/** 탭 진입 시 1회 초기화 (switchInvTab 에서 호출) */
window.invTxInit = function() {
  if (invTxLoaded) { invTxConsumePending(); invTxLoad(); return; }
  invTxLoaded = true;
  invTxSetDefaultRange();
  invTxConsumePending();   // 기본 30일 세팅 뒤에 덮어써야 기간 해제가 유지된다
  invTxLoadFilterOptions();

  var prev = document.getElementById('invTxPrevPage');
  var next = document.getElementById('invTxNextPage');
  if (prev) prev.addEventListener('click', function() { if (invTxPage > 1) { invTxPage--; invTxLoad(); } });
  if (next) next.addEventListener('click', function() { invTxPage++; invTxLoad(); });

  var searchInput = document.getElementById('invTxSearch');
  if (searchInput) {
    searchInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') window.invTxSearch(); });
  }

  invTxLoad();
};
