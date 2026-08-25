// ── 창고별 재고 대시보드 스크립트 ──
var dashData = null;
var allEntities = [];
var selectedZoneId = '';

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadDashboard() {
  var content = document.getElementById('dashContent');
  if (content) content.innerHTML = '<div class="text-center py-12 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl mb-3"></i><p>로딩 중...</p></div>';

  try {
    var [dashRes, entRes] = await Promise.all([
      axios.get('/api/inventory/dashboard/zones', { params: { zone_id: selectedZoneId || undefined } }),
      axios.get('/api/auth/entities')
    ]);
    dashData = dashRes.data.success ? dashRes.data.data : null;
    allEntities = entRes.data.success ? entRes.data.data : [];
    renderDashboard();
  } catch (err) {
    console.error('Dashboard load failed:', err);
    if (content) content.innerHTML = '<div class="text-center py-12 text-red-500">로드 실패</div>';
  }
}

function selectZoneFilter(zoneId) {
  selectedZoneId = zoneId ? String(zoneId) : '';
  loadDashboard();
}

function renderDashboard() {
  var content = document.getElementById('dashContent');
  if (!content || !dashData) return;

  var s = dashData.summary;
  var html = '';

  // 요약 카드
  html += '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">';
  html += summaryCard('fas fa-boxes', '전체 품목', s.total_items + '개', 'blue');
  html += summaryCard('fas fa-exclamation-triangle', '긴급 (재고 0)', s.critical + '개', s.critical > 0 ? 'red' : 'gray');
  html += summaryCard('fas fa-arrow-down', '부족 (안전재고 미달)', s.low + '개', s.low > 0 ? 'amber' : 'gray');
  html += summaryCard('fas fa-coins', '재고 금액', s.total_value.toLocaleString() + '원', 'green');
  html += '</div>';

  // 창고 필터 탭
  html += '<div class="flex items-center gap-2 mb-4 flex-wrap">';
  html += '<button class="px-3 py-1.5 rounded-lg text-sm font-medium '
    + (!selectedZoneId ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
    + '" onclick="selectZoneFilter(null)">전체</button>';
  (dashData.zones || []).forEach(function(z) {
    var isActive = String(z.id) === String(selectedZoneId);
    var badge = z.is_default ? ' <span class="text-[10px] text-amber-600">기본</span>' : '';
    html += '<button class="px-3 py-1.5 rounded-lg text-sm font-medium '
      + (isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
      + '" onclick="selectZoneFilter(' + z.id + ')">'
      + escHtml(z.zone_name) + badge + '</button>';
  });
  html += '</div>';

  // 창고별 그룹
  var groups = dashData.zone_groups || [];
  if (groups.length === 0) {
    html += '<div class="text-center py-12 text-gray-400"><i class="fas fa-inbox text-3xl mb-3 block"></i>품목이 없습니다.</div>';
  } else {
    groups.forEach(function(g) {
      var alertBadge = '';
      if (g.critical > 0) alertBadge += ' <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">' + g.critical + '개 긴급</span>';
      if (g.low > 0) alertBadge += ' <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">' + g.low + '개 부족</span>';

      html += '<div class="bg-white rounded-lg border shadow-sm mb-4">';
      html += '<div class="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">';
      html += '<div class="flex items-center gap-2"><i class="fas fa-warehouse text-gray-400"></i>'
        + '<span class="font-bold text-gray-800">' + escHtml(g.zone_name) + '</span>'
        + '<span class="text-xs text-gray-500">' + g.total + '개 품목</span>' + alertBadge + '</div>';
      if (g.critical > 0 || g.low > 0) {
        html += '<button onclick="createPRForZone(' + (g.zone_id || 'null') + ')" class="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">'
          + '<i class="fas fa-cart-plus mr-1"></i>부족 품목 발주요청</button>';
      }
      html += '</div>';

      // 테이블
      html += '<div class="overflow-x-auto"><table class="w-full text-sm ds-table">';
      html += '<thead><tr class="text-xs text-gray-500 border-b">'
        + '<th class="col-code px-3 py-2 text-left">코드</th>'
        + '<th class="col-name px-3 py-2 text-left">품목명</th>'
        + '<th class="col-flex px-3 py-2 text-left">분류</th>'
        + '<th class="col-qty px-3 py-2 text-right">현재고</th>'
        + '<th class="col-qty px-3 py-2 text-right">안전재고</th>'
        + '<th class="col-qty px-3 py-2 text-right">부족량</th>'
        + '<th class="col-status px-3 py-2 text-center">상태</th>'
        + '</tr></thead><tbody id="zoneBody_' + zoneKey(g) + '">';

      g.items.forEach(function(item) { html += zoneRowHtml(item); });

      html += '</tbody></table></div>';
      html += zoneFootHtml(g);
      html += '</div>';
    });
  }

  content.innerHTML = html;
}

// 구역 식별자 — 미배정은 zone_id 가 null 이라 별도 키가 필요하다(서버 group_items 값과 동일)
function zoneKey(g) {
  return g.zone_id == null ? 'unassigned' : String(g.zone_id);
}

// 표 행 1개 — 최초 렌더와 「더 보기」 append 가 같은 함수를 쓴다(사본 신설 금지)
function zoneRowHtml(item) {
  var shortage = Math.max(0, (item.safe_stock || 0) - (item.current_stock || 0));
  var statusHtml = '';
  if (item.stock_status === 'CRITICAL') {
    statusHtml = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700"><i class="fas fa-exclamation-circle mr-1 text-[9px]"></i>긴급</span>';
  } else if (item.stock_status === 'LOW') {
    statusHtml = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700"><i class="fas fa-arrow-down mr-1 text-[9px]"></i>부족</span>';
  } else {
    statusHtml = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">정상</span>';
  }
  var rowClass = item.stock_status === 'CRITICAL' ? 'bg-red-50/50' : (item.stock_status === 'LOW' ? 'bg-amber-50/30' : '');
  var cat = escHtml(item.category || '') + (item.sub_category ? ' &gt; ' + escHtml(item.sub_category) : '');
  return '<tr class="border-b border-gray-50 hover:bg-gray-50 ' + rowClass + '">'
    + '<td class="px-3 py-2 font-mono text-xs text-blue-600" title="' + escHtml(item.item_code) + '">' + escHtml(item.item_code) + '</td>'
    + '<td class="px-3 py-2 font-medium text-gray-900" title="' + escHtml(item.item_name) + '">' + escHtml(item.item_name) + '</td>'
    + '<td class="px-3 py-2 text-xs text-gray-500" title="' + cat + '">' + cat + '</td>'
    + '<td class="px-3 py-2 text-right tabular-nums font-medium ' + (item.current_stock <= 0 ? 'text-red-600' : 'text-gray-900') + '">'
    + (item.current_stock || 0).toLocaleString() + ' ' + escHtml(item.unit || '') + '</td>'
    + '<td class="px-3 py-2 text-right tabular-nums text-gray-500">' + (item.safe_stock || '-') + '</td>'
    + '<td class="px-3 py-2 text-right tabular-nums ' + (shortage > 0 ? 'text-red-600 font-medium' : 'text-gray-400') + '">'
    + (shortage > 0 ? shortage.toLocaleString() : '-') + '</td>'
    + '<td class="px-3 py-2 text-center">' + statusHtml + '</td>'
    + '</tr>';
}

// 구역 표 아래 「N / 전체 M개 · 더 보기」 — 종전엔 표기가 없어 미배정 980행이 통째로 그려졌다
function zoneFootHtml(g) {
  var k = zoneKey(g);
  var shown = (g.items || []).length;
  var more = Math.max((g.total || 0) - shown, 0);
  return '<div class="flex items-center justify-center gap-3 px-4 py-2.5 border-t border-gray-100" id="zoneFoot_' + k + '">'
    + '<span class="text-xs text-gray-500 tabular-nums" id="zoneNote_' + k + '">' + shown.toLocaleString() + ' / 전체 ' + (g.total || 0).toLocaleString() + '개'
    + (more ? ' · ' + more.toLocaleString() + '개 남음' : '') + '</span>'
    + (more
      ? '<button id="zoneMore_' + k + '" onclick="loadMoreZoneItems(\'' + k + '\')" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">'
        + '<i class="fas fa-angle-down mr-1"></i>' + zoneItemPage() + '개 더 보기</button>'
      : '')
    + '</div>';
}

function zoneItemPage() {
  return (dashData && dashData.item_page) || 50;
}

// 「더 보기」 = 해당 구역 품목만 이어 받아 그 표에만 append (다른 구역·요약은 건드리지 않는다)
var zoneMoreBusy = {};
async function loadMoreZoneItems(key) {
  if (!dashData || zoneMoreBusy[key]) return;
  var g = (dashData.zone_groups || []).filter(function(x) { return zoneKey(x) === String(key); })[0];
  if (!g) { console.warn('[inventoryDashboard] zone group not found: ' + key); return; }

  var btn = document.getElementById('zoneMore_' + key);
  var tbody = document.getElementById('zoneBody_' + key);
  if (!tbody) { console.warn('[inventoryDashboard] #zoneBody_' + key + ' not found'); return; }

  zoneMoreBusy[key] = true;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>불러오는 중'; }
  try {
    var res = await axios.get('/api/inventory/dashboard/zones', {
      params: { group_items: key, offset: g.items.length, limit: zoneItemPage(), zone_id: selectedZoneId || undefined }
    });
    var d = (res.data && res.data.data) || {};
    var rows = d.items || [];
    g.items = g.items.concat(rows);
    if (d.total != null) g.total = d.total;
    tbody.insertAdjacentHTML('beforeend', rows.map(zoneRowHtml).join(''));
    var foot = document.getElementById('zoneFoot_' + key);
    if (foot) foot.outerHTML = zoneFootHtml(g);
  } catch (err) {
    console.error('zone items load failed:', err);
    showToast('품목 추가 로드 실패', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-angle-down mr-1"></i>' + zoneItemPage() + '개 더 보기'; }
  } finally {
    zoneMoreBusy[key] = false;
  }
}

function summaryCard(icon, label, value, color) {
  var colors = {
    blue: 'text-blue-600 bg-blue-50',
    red: 'text-red-600 bg-red-50',
    amber: 'text-amber-600 bg-amber-50',
    green: 'text-green-600 bg-green-50',
    gray: 'text-gray-500 bg-gray-50'
  };
  var c = colors[color] || colors.gray;
  return '<div class="bg-white rounded-lg border p-4 flex items-center gap-3">'
    + '<div class="w-10 h-10 rounded-lg flex items-center justify-center ' + c + '">'
    + '<i class="' + icon + '"></i></div>'
    + '<div><div class="text-xs text-gray-500">' + label + '</div>'
    + '<div class="text-lg font-bold text-gray-900">' + value + '</div></div></div>';
}

async function createPRForZone(zoneId) {
  if (!dashData) return;
  var group = dashData.zone_groups.find(function(g) { return g.zone_id === zoneId; });
  if (!group) return;

  // ★부족 품목은 **화면에 그려진 분이 아니라 서버에서 전건**을 받는다.
  //   표가 50개로 잘려 있으므로 group.items 를 거르면 51번째부터의 부족 품목이 조용히 빠진다.
  var shortageItems;
  try {
    var sres = await axios.get('/api/inventory/dashboard/zones', {
      params: { group_items: zoneKey(group), shortage_only: 1, limit: 500, zone_id: selectedZoneId || undefined }
    });
    var sd = (sres.data && sres.data.data) || {};
    shortageItems = sd.items || [];
    if (sd.total != null && sd.total > shortageItems.length) {
      showToast('부족 품목이 ' + sd.total + '건이라 상위 ' + shortageItems.length + '건만 담습니다.', 'warning');
    }
  } catch (err) {
    console.error('shortage items load failed:', err);
    showToast('부족 품목 조회 실패', 'error');
    return;
  }

  if (shortageItems.length === 0) {
    showToast('부족 품목이 없습니다.', 'info');
    return;
  }

  var msg = escHtml(group.zone_name) + '의 부족 품목 ' + shortageItems.length + '건에 대해 발주요청을 생성하시겠습니까?';
  if (!(await showConfirm(msg))) return;

  try {
    var prItems = shortageItems.map(function(item, idx) {
      var shortage = Math.max(1, Math.ceil((item.safe_stock || 0) - (item.current_stock || 0)));
      return {
        item_id: item.item_id,
        item_name: item.item_name,
        category_name: item.category || '',
        quantity: shortage,
        unit: item.unit || 'EA',
        estimated_unit_price: item.base_price || 0,
        sort_order: idx + 1
      };
    });

    var res = await axios.post('/api/purchase-requests', {
      urgency: 'NORMAL',
      reason: (group.zone_name || '창고') + ' 안전재고 미달 자동 발주요청',
      items: prItems
    });

    if (res.data.success) {
      showToast('발주요청 ' + (res.data.data?.request_number || '') + ' 생성 완료', 'success');
    } else {
      showToast(res.data.error || '발주요청 생성 실패', 'error');
    }
  } catch (err) {
    showToast('발주요청 생성 실패: ' + (err.response?.data?.error || err.message), 'error');
  }
}

// 초기 로드: 독립 페이지(/inventory-dashboard)에서만 자동 실행.
// 재고관리 '창고별' 탭(#tabZone 존재)에선 탭 최초 진입 시 switchInvTab이 lazy-load (이중 로드 방지).
if (document.getElementById('dashContent') && !document.getElementById('tabZone')) {
  loadDashboard();
}
