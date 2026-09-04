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
  params.push('page=' + invTxPage, 'limit=' + invTxLimitFor());

  axios.get('/api/inventory/transactions?' + params.join('&')).then(function(r) {
    var d = (r.data && r.data.data) || {};
    var rows = d.transactions || [];
    tbody.innerHTML = '';

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="' + COLS + '" class="text-center py-8 text-gray-400">해당 조건의 증감내역이 없습니다</td></tr>';
    }

    // 품목별로 묶기 — 한 줄씩 흐르는 원장은 「이 품목이 어떻게 됐나」를 못 읽는다.
    //   묶으면 품목 한 줄(순증감·출고합계)로 접히고, 눌러야 그 품목의 이력이 열린다.
    //   ⚠️묶음은 **이 페이지 안에서만** 성립한다 — 서버 페이징이라 같은 품목이 다음 장에 이어질 수 있다.
    //     그래서 묶기를 켜면 limit 을 키워 요청한다(invTxBuildParams 아래 invTxLimitFor).
    var groups = null;
    if (invTxGrouped()) {
      groups = [];
      var gmap = {};
      rows.forEach(function(row) {
        var key = (row.item_id != null ? row.item_id : ('n' + (row.item_name || ''))) + '|' + (row.zone_name || '');
        if (!gmap[key]) { gmap[key] = { key: key, rows: [], net: 0, out: 0, sample: row }; groups.push(gmap[key]); }
        var g = gmap[key];
        g.rows.push(row);
        var s = Number(row.signed_quantity) || 0;
        g.net += s;
        if (s < 0) g.out += -s;   // 출고 합계 = 음수 증감의 절대값 합(원장 기준)
      });
      groups.forEach(function(g, gi) {
        tbody.appendChild(invTxGroupTr(g, gi, COLS));
        g.rows.forEach(function(row) {
          var dtr = invTxRowTr(row);
          dtr.className += ' invtx-detail invtx-g' + gi;
          dtr.style.display = 'none';   // 접힌 채로 시작 — 펼쳐야 이력이 보인다
          tbody.appendChild(dtr);
        });
      });
    } else {
      rows.forEach(function(row) { tbody.appendChild(invTxRowTr(row)); });
    }

    invTxRenderSummary(d.summary || {}, rows);
    invTxRenderPagination(d.pagination || {});
  }).catch(function(e) {
    console.error('[inventoryTx] load failed', e);
    tbody.innerHTML = '<tr><td colspan="' + COLS + '" class="text-center py-8 text-red-500">불러오기 실패</td></tr>';
  });
}

/** 원장 한 줄 → <tr>. 묶기 모드와 평면 모드가 **같은 함수**를 써야 두 화면이 갈라지지 않는다. */
function invTxRowTr(row) {
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
  return tr;
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
      // ★옵션이 다 들어온 **뒤에** 역할 기본값을 건다 — 먼저 걸면 값이 없어 조용히 무시된다.
      //   목록을 이미 받았으므로 그대로 넘겨 재요청하지 않는다.
      invTxApplyRoleDefaults(list);
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

// ── 품목별 묶기 (2026-09-04) ────────────────────────────────────────────────
// 원장을 한 줄씩 흘려 보면 「이 품목이 어떻게 됐나」를 못 읽는다. 품목(×창고) 한 줄로 접고
// 순증감·출고합계를 먼저 보여 준 뒤, 눌러야 그 품목의 이력이 열린다.
//
// ⚠️ **소모 = 원장 기준**이다. 실사 탭의 소모량(`/inventory-counts/consumption`)은 회차 간 차이
//    (기초+매입−기말)라 **다른 숫자**다. 라벨에 「출고」라고 적어 두 축을 섞지 않는다.

function invTxGrouped() {
  var el = document.getElementById('invTxGroupToggle');
  return !el || el.checked;   // 요소가 없으면 묶기가 기본
}

// 묶기는 **받아 온 페이지 안에서만** 성립한다 — 서버 페이징이라 같은 품목이 다음 장에 이어질 수 있다.
// 그래서 묶기를 켜면 한 번에 더 받아 온다. 상한은 서버 쪽 limit 정책에 맡긴다.
function invTxLimitFor() { return invTxGrouped() ? 300 : invTxLimit; }

function invTxGroupTr(g, gi, cols) {
  var s = g.sample || {};
  var netCls = g.net > 0 ? 'text-blue-600' : (g.net < 0 ? 'text-orange-600' : 'text-gray-500');
  var tr = document.createElement('tr');
  tr.className = 'bg-gray-50 cursor-pointer hover:bg-gray-100';
  tr.setAttribute('onclick', 'invTxToggleGroup(' + gi + ')');
  tr.innerHTML =
      '<td class="px-3 py-2 text-sm text-gray-400" id="invTxCaret' + gi + '">▸</td>'
    + '<td class="px-3 py-2 text-sm">'
      + '<span class="font-semibold">' + window.escapeHtml(s.item_name || '(삭제된 품목)') + '</span>'
      + (s.item_code ? '<span class="text-xs text-gray-400 ml-1">' + window.escapeHtml(s.item_code) + '</span>' : '')
    + '</td>'
    + '<td class="px-3 py-2 text-sm text-gray-500">' + g.rows.length + '건</td>'
    + '<td class="px-3 py-2 text-sm text-gray-400 text-xs">순증감</td>'
    + '<td class="px-3 py-2 text-sm text-right font-semibold tabular-nums ' + netCls + '">'
      + (g.net > 0 ? '+' : '') + window.escapeHtml(invTxQty(g.net, s)) + '</td>'
    + '<td class="px-3 py-2 text-sm text-right tabular-nums text-gray-700" title="원장 기준 출고 합계 — 실사 기준 소모량과는 다른 숫자입니다">'
      + (g.out ? '출고 ' + window.escapeHtml(invTxQty(g.out, s)) : '') + '</td>'
    + '<td class="px-3 py-2 text-sm text-gray-600">' + window.escapeHtml(s.zone_name || '기본창고') + '</td>'
    + '<td class="px-3 py-2" colspan="3"></td>';
  return tr;
}

function invTxToggleGroup(gi) {
  var rows = document.querySelectorAll('.invtx-g' + gi);
  if (!rows.length) return;
  var open = rows[0].style.display !== 'none';
  for (var i = 0; i < rows.length; i++) rows[i].style.display = open ? 'none' : '';
  var caret = document.getElementById('invTxCaret' + gi);
  if (caret) caret.textContent = open ? '▸' : '▾';
}

// ── 역할별 기본값 — 담당자는 자기 구역이 기본, 관리자는 전체 (2026-09-04) ──────
// 한 화면을 쓰되 들어올 때의 기본값만 다르게 한다. 담당자에게 전 법인 원장을 첫 화면으로 주면
// 자기 것을 찾는 데만 시간이 든다.
function invTxApplyRoleDefaults(zones) {
  // `?raw` 전역 스코프 공유 — inventoryCount.js 가 이미 JWT 를 읽어 둔다. 없으면 조용히 넘어간다.
  var me = (typeof _icUser !== 'undefined' && _icUser) ? _icUser : null;
  if (!me || !me.id) return;
  if (me.role === 'ADMIN' || me.role === 'MANAGER') return;   // 관리자는 전체가 기본
  var mine = (zones || []).filter(function (z) { return z.manager_id === me.id; });
  if (mine.length !== 1) return;   // 담당 구역이 **하나일 때만** 자동으로 고른다(둘이면 고를 근거가 없다)
  var sel = document.getElementById('invTxZone');
  if (!sel || sel.value) return;   // 사람이 이미 고른 값은 덮지 않는다
  var has = Array.prototype.some.call(sel.options, function (o) { return String(o.value) === String(mine[0].id); });
  if (!has) return;
  sel.value = String(mine[0].id);
  invTxLoad();
}
