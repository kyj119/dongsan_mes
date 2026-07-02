// workbench.js — 시안 검수 (AI 그룹 ↔ 품목 매칭)
// spec: docs/archive/superpowers/specs/2026-06-11-web-canvas-ia-workbench.md P1 (ia-editor 마스터에 흡수)

var wbOrders = [];
var wbCurrentOrderId = null;
var wbCurrentGroups = [];

function wbEscape(s) {
  if (window.escapeHtml) return window.escapeHtml(s == null ? '' : String(s));
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

// ── 주문 목록 ─────────────────────────────────────────────────────
function wbLoadOrders() {
  var listEl = document.getElementById('wbOrderList');
  if (!listEl) { console.warn('[workbench] #wbOrderList not found'); return; }
  var qEl = document.getElementById('wbSearch');
  var q = qEl ? qEl.value.trim() : '';

  axios.get('/api/workbench/orders', { params: { q: q } })
    .then(function (res) {
      wbOrders = (res.data && res.data.data) || [];
      wbRenderStats();
      wbRenderOrderList();
    })
    .catch(function (err) {
      console.error('[workbench] orders load fail', err);
      listEl.innerHTML = '<div class="text-center text-red-500 py-8 text-sm">목록을 불러오지 못했습니다<br><button class="mt-2 text-blue-600 underline" onclick="wbLoadOrders()">다시 시도</button></div>';
    });
}

function wbRenderStats() {
  var total = wbOrders.length;
  var matched = 0, unmatched = 0, failed = 0;
  wbOrders.forEach(function (o) {
    if (o.analysis_status === 'error') failed++;
    if (o.item_count > 0 && o.matched_count >= o.item_count) matched++;
    else if (o.matched_count < o.item_count) unmatched++;
  });
  var elT = document.getElementById('statTotal');
  var elM = document.getElementById('statMatched');
  var elU = document.getElementById('statUnmatched');
  var elF = document.getElementById('statFailed');
  if (elT) elT.textContent = total;
  if (elM) elM.textContent = matched;
  if (elU) elU.textContent = unmatched;
  if (elF) elF.textContent = failed;
}

function wbRenderOrderList() {
  var listEl = document.getElementById('wbOrderList');
  if (!listEl) return;
  if (wbOrders.length === 0) {
    listEl.innerHTML = '<div class="flex flex-col items-center py-10 text-gray-300"><i class="fas fa-inbox text-4xl mb-2"></i><div class="text-gray-400 text-sm">AI 분석이 있는 주문이 없습니다</div></div>';
    return;
  }
  var html = '';
  wbOrders.forEach(function (o) {
    var done = o.item_count > 0 && o.matched_count >= o.item_count;
    var badge;
    if (o.analysis_status === 'error') {
      badge = '<span class="rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-50 text-red-700">분석실패</span>';
    } else if (done) {
      badge = '<span class="rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-50 text-green-700">완료</span>';
    } else {
      badge = '<span class="rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-700">' + o.matched_count + '/' + o.item_count + '</span>';
    }
    var active = (o.id === wbCurrentOrderId) ? ' bg-blue-50' : '';
    html += '<div class="p-3 cursor-pointer hover:bg-gray-50' + active + '" data-order-id="' + o.id + '">'
      + '<div class="flex items-center justify-between mb-1">'
      + '<span class="text-sm font-semibold text-gray-900">' + wbEscape(o.order_number) + '</span>' + badge
      + '</div>'
      + '<div class="text-xs text-gray-500">' + wbEscape(o.client_name || '-') + ' · 품목 ' + o.item_count + '개</div>'
      + '</div>';
  });
  listEl.innerHTML = html;
  Array.prototype.forEach.call(listEl.querySelectorAll('[data-order-id]'), function (el) {
    el.addEventListener('click', function () {
      wbSelectOrder(parseInt(el.getAttribute('data-order-id'), 10));
    });
  });
}

// ── 검수 패널 ─────────────────────────────────────────────────────
function wbSelectOrder(orderId) {
  wbCurrentOrderId = orderId;
  wbRenderOrderList();
  var bodyEl = document.getElementById('wbDetailBody');
  var headEl = document.getElementById('wbDetailHeader');
  if (!bodyEl || !headEl) { console.warn('[workbench] detail panel not found'); return; }
  bodyEl.innerHTML = '<div class="text-center text-gray-400 py-10 text-sm">불러오는 중...</div>';

  axios.get('/api/workbench/analyses/' + orderId)
    .then(function (res) {
      var d = res.data && res.data.data;
      if (!d) throw new Error('empty');
      wbCurrentGroups = d.groups || [];
      wbRenderDetail(d);
    })
    .catch(function (err) {
      console.error('[workbench] detail load fail', err);
      var msg = (err.response && err.response.data && err.response.data.error) || '상세를 불러오지 못했습니다';
      bodyEl.innerHTML = '<div class="text-center text-red-500 py-10 text-sm">' + wbEscape(msg) + '</div>';
    });
}

function wbRenderDetail(d) {
  var headEl = document.getElementById('wbDetailHeader');
  var bodyEl = document.getElementById('wbDetailBody');
  if (!headEl || !bodyEl) return;

  headEl.innerHTML = '<div class="flex items-center justify-between">'
    + '<div><span class="text-base font-bold text-gray-900">' + wbEscape(d.order.order_number) + '</span>'
    + '<span class="text-sm text-gray-500 ml-2">' + wbEscape(d.order.client_name || '-') + '</span></div>'
    + '<div class="text-xs text-gray-400">' + wbEscape(d.order.ai_file_path || '') + '</div>'
    + '</div>';

  var html = '';

  // 그룹 썸네일 그리드
  html += '<div class="mb-5"><div class="text-sm font-semibold text-gray-700 mb-2"><i class="fas fa-object-group mr-1 text-gray-400"></i>AI 그룹 (' + wbCurrentGroups.length + ')</div>';
  if (wbCurrentGroups.length === 0) {
    html += '<div class="text-sm text-gray-400 border border-dashed border-gray-300 rounded-lg p-6 text-center">분석된 그룹이 없습니다' + (d.analysis && d.analysis.error_message ? '<br><span class="text-red-500 text-xs">' + wbEscape(d.analysis.error_message) + '</span>' : '') + '</div>';
  } else {
    html += '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">';
    wbCurrentGroups.forEach(function (g, idx) {
      var gi = (g.index != null) ? g.index : idx;
      var thumb = g.thumbnail_base64
        ? '<img src="data:image/png;base64,' + g.thumbnail_base64 + '" class="w-full h-24 object-contain bg-gray-50" alt="group">'
        : '<div class="w-full h-24 flex items-center justify-center bg-gray-50 text-gray-300"><i class="fas fa-image text-2xl"></i></div>';
      html += '<div class="border border-gray-200 rounded-lg overflow-hidden">'
        + thumb
        + '<div class="px-2 py-1.5 border-t border-gray-100">'
        + '<div class="text-xs font-semibold text-gray-700">#' + gi + ' ' + wbEscape(g.name || '') + '</div>'
        + '<div class="text-[11px] text-gray-400">' + (g.width_mm != null ? (Math.round(g.width_mm / 10) + '×' + Math.round(g.height_mm / 10) + 'cm') : '-') + '</div>'
        + '</div></div>';
    });
    html += '</div>';
  }
  html += '</div>';

  // 품목 매칭 테이블
  html += '<div><div class="text-sm font-semibold text-gray-700 mb-2"><i class="fas fa-tags mr-1 text-gray-400"></i>품목 매칭 (' + d.items.length + ')</div>';
  html += '<table class="w-full text-sm"><thead><tr class="bg-gray-50 text-gray-600 text-xs font-semibold uppercase tracking-wider">'
    + '<th class="text-left px-3 py-2">품목</th><th class="text-left px-3 py-2">규격</th><th class="text-left px-3 py-2">수량</th><th class="text-left px-3 py-2 w-44">매칭 그룹</th></tr></thead><tbody>';
  d.items.forEach(function (it) {
    var opts = '<option value="">미매칭</option>';
    wbCurrentGroups.forEach(function (g, idx) {
      var gi = (g.index != null) ? g.index : idx;
      var sel = (it.ai_group_index === gi) ? ' selected' : '';
      opts += '<option value="' + gi + '"' + sel + '>#' + gi + ' ' + wbEscape(g.name || '') + '</option>';
    });
    var rowCls = (it.ai_group_index == null) ? ' bg-amber-50/40' : '';
    html += '<tr class="bg-white hover:bg-gray-50 border-b border-gray-100' + rowCls + '">'
      + '<td class="px-3 py-2 text-gray-900">' + wbEscape(it.item_name) + (it.category_name ? '<span class="text-xs text-gray-400 ml-1">' + wbEscape(it.category_name) + '</span>' : '') + '</td>'
      + '<td class="px-3 py-2 text-gray-500">' + (it.width != null && it.height != null ? it.width + '×' + it.height + 'cm' : '-') + '</td>'
      + '<td class="px-3 py-2 text-gray-500">' + (it.quantity != null ? it.quantity : '-') + '</td>'
      + '<td class="px-3 py-2"><select class="wb-match-select w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500" data-item-id="' + it.id + '">' + opts + '</select></td>'
      + '</tr>';
  });
  html += '</tbody></table></div>';

  bodyEl.innerHTML = html;

  Array.prototype.forEach.call(bodyEl.querySelectorAll('.wb-match-select'), function (sel) {
    sel.addEventListener('change', function () {
      var itemId = parseInt(sel.getAttribute('data-item-id'), 10);
      var val = sel.value === '' ? null : parseInt(sel.value, 10);
      wbUpdateMatch(itemId, val, sel);
    });
  });
}

function wbUpdateMatch(itemId, groupIndex, selEl) {
  selEl.disabled = true;
  axios.put('/api/workbench/match', { order_item_id: itemId, ai_group_index: groupIndex })
    .then(function () {
      if (window.showToast) window.showToast('매칭이 저장되었습니다', 'success');
      // 목록 카운트 갱신 (선택 유지)
      wbRefreshCounts();
    })
    .catch(function (err) {
      console.error('[workbench] match fail', err);
      var msg = (err.response && err.response.data && err.response.data.error) || '매칭 저장 실패';
      if (window.showToast) window.showToast(msg, 'error');
    })
    .finally(function () { selEl.disabled = false; });
}

function wbRefreshCounts() {
  axios.get('/api/workbench/orders')
    .then(function (res) {
      wbOrders = (res.data && res.data.data) || [];
      wbRenderStats();
      wbRenderOrderList();
    })
    .catch(function (_e) { /* 카운트 갱신 실패는 무시 */ });
}

// ── 초기화 (모든 함수 정의 이후, 파일 맨 아래) ──────────────────────
(function initWorkbench() {
  var searchBtn = document.getElementById('wbSearchBtn');
  var searchInput = document.getElementById('wbSearch');
  if (searchBtn) searchBtn.addEventListener('click', wbLoadOrders);
  if (searchInput) searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') wbLoadOrders(); });
  wbLoadOrders();
})();
