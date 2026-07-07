// ============================================================================
// priceManagement.js — 단가 관리 (매입단가 + 매출단가표)
// ============================================================================

var pmExpandedId = null;
var pmItems = [];
var salesData = { items: [], media: [], policyRules: [], policyName: '', categories: [] };
var salesClientId = null;
var salesClientName = '';
var entityId = window.__entityId || 1;

// 단가표 세트 (Phase 1) — 전역 var는 pm prefix (?raw concat 전역스코프 충돌 방지)
var pmSheets = [];
var pmCurrentSheetId = null;   // 선택된 세트 id (null = 미선택 → 기존 전체품목 동작)
var pmSheetDetail = null;      // 선택 세트 상세(렌더용)
var pmSheetItemIds = [];       // 모달 편집 중 담긴 품목 id (정렬순)
var pmSheetClientId = null;    // 모달 거래처 id
var pmSheetClientName = '';

// ===================== Init =====================
document.addEventListener('DOMContentLoaded', function() {
  loadPurchaseView();
  var el = document.getElementById('pmSearch');
  if (el) {
    var t = null;
    el.addEventListener('input', function() { clearTimeout(t); t = setTimeout(loadPurchaseView, 300); });
    el.addEventListener('keydown', function(e) { if (e.key === 'Enter') { clearTimeout(t); loadPurchaseView(); } });
  }
  setupSalesClientSearch();
  setupPmSheetClientSearch();
});

// ===================== Tab =====================
function switchPmTab(tab) {
  ['purchase','sales','policies'].forEach(function(t) {
    var btn = document.getElementById('pmTab_' + t);
    var panel = document.getElementById('pmPanel_' + t);
    if (!btn || !panel) return;
    if (t === tab) { btn.classList.add('active'); panel.classList.remove('hidden'); }
    else { btn.classList.remove('active'); panel.classList.add('hidden'); }
  });
  if (tab === 'purchase') loadPurchaseView();
  if (tab === 'sales') { loadSalesData(); loadPmSheets(); }
  if (tab === 'policies') { if (!salesData.categories || !salesData.categories.length) loadSalesData(); loadPolicies(); }
}

// ╔═══════════════════════════════════════════════════════════════╗
// ║  매입단가 탭                                                   ║
// ╚═══════════════════════════════════════════════════════════════╝

function loadPurchaseView() {
  var search = (document.getElementById('pmSearch') || {}).value || '';
  var url = '/api/prices/price-overview';
  if (search) url += '?search=' + encodeURIComponent(search);
  axios.get(url).then(function(res) {
    pmItems = res.data.items || [];
    renderPurchaseView();
  }).catch(function() {
    var a = document.getElementById('pmPurchaseArea');
    if (a) a.innerHTML = '<div class="ds-card p-8 text-center text-red-500">데이터 로딩 실패</div>';
  });
}

function renderPurchaseView() {
  var area = document.getElementById('pmPurchaseArea');
  if (!area) return;
  if (!pmItems.length) {
    var s = (document.getElementById('pmSearch') || {}).value;
    area.innerHTML = '<div class="ds-card p-8 text-center text-gray-400"><i class="fas fa-inbox text-3xl mb-2"></i><p>' + (s ? '"' + esc(s) + '" 검색 결과 없음' : '품목 없음') + '</p></div>';
    return;
  }

  // item_group별 그룹핑
  var groups = {};
  var noGroup = [];
  pmItems.forEach(function(item) {
    if (item.item_group) {
      if (!groups[item.item_group]) groups[item.item_group] = { items: [], linked: item.price_linked };
      groups[item.item_group].items.push(item);
    } else {
      noGroup.push(item);
    }
  });

  var html = '<div class="text-sm text-gray-500 mb-2">' + pmItems.length + '개 품목</div>';

  // 그룹이 있는 품목
  var groupNames = Object.keys(groups).sort();
  groupNames.forEach(function(gn) {
    var g = groups[gn];
    var linked = g.linked;
    html += '<div class="ds-card mb-3">';
    html += '<div class="px-4 py-2.5 bg-gray-50 border-b flex items-center justify-between">';
    html += '<div class="flex items-center gap-2">';
    html += '<i class="fas fa-layer-group text-blue-500 text-xs"></i>';
    html += '<span class="font-semibold text-sm">' + esc(gn) + '</span>';
    html += '<span class="text-xs text-gray-400">' + g.items.length + '개</span>';
    html += '</div>';
    // 단가 연동 토글
    html += '<label class="flex items-center gap-1.5 cursor-pointer" onclick="event.stopPropagation()">';
    html += '<input type="checkbox" ' + (linked ? 'checked' : '') + ' onchange="togglePriceLinked(\'' + escAttr(gn) + '\', this.checked)" class="h-3.5 w-3.5">';
    html += '<span class="text-xs ' + (linked ? 'text-blue-600 font-medium' : 'text-gray-400') + '"><i class="fas fa-link mr-0.5"></i>단가연동</span>';
    html += '</label>';
    html += '</div>';
    html += buildItemTable(g.items, linked);
    html += '</div>';
  });

  // 그룹 없는 품목
  if (noGroup.length) {
    html += '<div class="ds-card mb-3">';
    if (groupNames.length) {
      html += '<div class="px-4 py-2.5 bg-gray-50 border-b"><span class="text-sm text-gray-500">그룹 미지정</span> <span class="text-xs text-gray-400">' + noGroup.length + '개</span></div>';
    }
    html += buildItemTable(noGroup, false);
    html += '</div>';
  }

  area.innerHTML = html;
}

function buildItemTable(items, linked) {
  var html = '<table class="w-full text-sm ds-table"><thead class="bg-gray-50"><tr>';
  html += '<th class="col-code px-4 py-2 text-left text-xs font-medium text-gray-500">코드</th>';
  html += '<th class="col-name px-4 py-2 text-left text-xs font-medium text-gray-500">품목명</th>';
  html += '<th class="col-amount px-4 py-2 text-right text-xs font-medium text-gray-500">매입단가</th>';
  html += '<th class="col-amount px-4 py-2 text-right text-xs font-medium text-gray-500">판매단가</th>';
  html += '<th class="col-qty px-4 py-2 text-right text-xs font-medium text-gray-500">마진</th>';
  html += '</tr></thead><tbody>';
  items.forEach(function(item) {
    var base = item.base_price || 0;
    var sales = item.sales_price || 0;
    var margin = (base > 0 && sales > 0) ? Math.round((sales - base) / sales * 100) : null;
    var mc = margin !== null ? (margin >= 30 ? 'text-green-600' : margin >= 15 ? 'text-yellow-600' : 'text-red-600') : 'text-gray-300';
    var exp = pmExpandedId === item.id;
    html += '<tr class="border-t hover:bg-gray-50 cursor-pointer' + (exp ? ' bg-blue-50' : '') + '" onclick="expandPurchaseItem(' + item.id + ')">';
    html += '<td class="px-4 py-2 font-mono text-xs text-gray-500">' + esc(item.item_code) + '</td>';
    html += '<td class="px-4 py-2 font-medium" title="' + esc(item.item_name || '') + '">' + esc(item.item_name) + '</td>';
    html += '<td class="px-4 py-2 text-right font-mono">' + fmt(base) + '</td>';
    html += '<td class="px-4 py-2 text-right font-mono">' + (sales ? fmt(sales) : '<span class="text-gray-300">-</span>') + '</td>';
    html += '<td class="px-4 py-2 text-right font-semibold ' + mc + '">' + (margin !== null ? margin + '%' : '-') + '</td>';
    html += '</tr>';
    if (exp) {
      html += '<tr><td colspan="5" class="p-0"><div id="pmDetail_' + item.id + '" class="px-6 py-4 bg-blue-50 border-t border-blue-100">';
      html += '<div class="text-center text-gray-400 py-3"><i class="fas fa-spinner fa-spin"></i></div></div></td></tr>';
    }
  });
  html += '</tbody></table>';
  return html;
}

function expandPurchaseItem(id) {
  pmExpandedId = pmExpandedId === id ? null : id;
  renderPurchaseView();
  if (pmExpandedId) loadItemDetail(id);
}

function loadItemDetail(itemId) {
  axios.get('/api/prices/item-detail/' + itemId).then(function(res) {
    var el = document.getElementById('pmDetail_' + itemId);
    if (!el) return;
    var d = res.data;
    var html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
    // 매입처별 단가
    html += '<div><h4 class="text-sm font-bold text-gray-700 mb-2"><i class="fas fa-truck mr-1 text-orange-500"></i>매입처별 단가</h4>';
    if (d.supplierPrices && d.supplierPrices.length) {
      html += '<table class="w-full text-xs"><thead class="bg-white"><tr><th class="px-3 py-1.5 text-left text-gray-500">매입처</th><th class="px-3 py-1.5 text-right text-gray-500">단가</th><th class="px-3 py-1.5 text-center text-gray-500">갱신일</th></tr></thead><tbody>';
      d.supplierPrices.forEach(function(sp) {
        html += '<tr class="border-t"><td class="px-3 py-1.5">' + esc(sp.client_name) + '</td><td class="px-3 py-1.5 text-right font-mono">' + fmt(sp.price) + '</td><td class="px-3 py-1.5 text-center text-gray-400">' + (sp.updated_at||'').substring(0,10) + '</td></tr>';
      });
      html += '</tbody></table>';
    } else html += '<p class="text-xs text-gray-400 py-2">등록된 매입처 단가 없음</p>';
    if (d.recentPurchases && d.recentPurchases.length) {
      html += '<h4 class="text-sm font-bold text-gray-700 mt-3 mb-2"><i class="fas fa-file-invoice mr-1 text-blue-500"></i>최근 매입</h4>';
      html += '<table class="w-full text-xs"><thead class="bg-white"><tr><th class="px-3 py-1.5 text-left text-gray-500">발주</th><th class="px-3 py-1.5 text-left text-gray-500">매입처</th><th class="px-3 py-1.5 text-right text-gray-500">단가</th><th class="px-3 py-1.5 text-center text-gray-500">일자</th></tr></thead><tbody>';
      d.recentPurchases.forEach(function(rp) {
        html += '<tr class="border-t"><td class="px-3 py-1.5 font-mono">' + esc(rp.po_number||'') + '</td><td class="px-3 py-1.5">' + esc(rp.supplier_name||'') + '</td><td class="px-3 py-1.5 text-right font-mono">' + fmt(rp.unit_price) + '</td><td class="px-3 py-1.5 text-center text-gray-400">' + (rp.order_date||'').substring(0,10) + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';
    // 이력
    html += '<div><h4 class="text-sm font-bold text-gray-700 mb-2"><i class="fas fa-history mr-1 text-gray-500"></i>변경 이력</h4>';
    if (d.history && d.history.length) {
      html += '<table class="w-full text-xs"><thead class="bg-white"><tr><th class="px-3 py-1.5 text-right text-gray-500">이전</th><th class="px-3 py-1.5 text-center"></th><th class="px-3 py-1.5 text-right text-gray-500">변경</th><th class="px-3 py-1.5 text-left text-gray-500">변경자</th><th class="px-3 py-1.5 text-center text-gray-500">일시</th></tr></thead><tbody>';
      d.history.forEach(function(h) {
        var ov = h.old_value != null ? h.old_value : h.old_price;
        var nv = h.new_value != null ? h.new_value : h.new_price;
        html += '<tr class="border-t"><td class="px-3 py-1.5 text-right font-mono text-red-400 line-through">' + fmt(ov) + '</td><td class="px-3 py-1.5 text-center text-gray-300"><i class="fas fa-arrow-right"></i></td><td class="px-3 py-1.5 text-right font-mono font-semibold text-blue-600">' + fmt(nv) + '</td><td class="px-3 py-1.5 text-gray-500">' + esc(String(h.changed_by||'')) + '</td><td class="px-3 py-1.5 text-center text-gray-400">' + (h.changed_at||'').substring(0,16).replace('T',' ') + '</td></tr>';
      });
      html += '</tbody></table>';
    } else html += '<p class="text-xs text-gray-400 py-2">변경 이력 없음</p>';
    html += '</div></div>';
    el.innerHTML = html;
  }).catch(function() {
    var el = document.getElementById('pmDetail_' + itemId);
    if (el) el.innerHTML = '<p class="text-red-500 text-sm">로딩 실패</p>';
  });
}

// 단가 연동 토글
function togglePriceLinked(groupName, checked) {
  axios.put('/api/items/group-settings/' + encodeURIComponent(groupName), { price_linked: checked ? 1 : 0 })
    .then(function() { showToast('"' + groupName + '" 단가연동 ' + (checked ? 'ON' : 'OFF'), 'success'); })
    .catch(function() { showToast('설정 저장 실패', 'error'); loadPurchaseView(); });
}

// ╔═══════════════════════════════════════════════════════════════╗
// ║  매출단가표 탭 (기존 priceList.js 기능 통합)                    ║
// ╚═══════════════════════════════════════════════════════════════╝

function loadSalesData(clientId) {
  var url = '/api/price-list';
  if (clientId) url += '?client_id=' + clientId;
  axios.get(url).then(function(res) {
    if (!res.data.success) return;
    salesData = res.data.data;
    var sel = document.getElementById('salesCategoryFilter');
    var cv = sel ? sel.value : '';
    if (sel) {
      sel.innerHTML = '<option value="">전체 카테고리</option>';
      (salesData.categories || []).forEach(function(cat) { sel.innerHTML += '<option value="' + esc(cat) + '">' + esc(cat) + '</option>'; });
      sel.value = cv;
    }
    var banner = document.getElementById('salesClientBanner');
    if (clientId && salesData.clientName) {
      var info = salesData.policyName ? ' — 정책: ' + salesData.policyName : ' — 정책 미지정 (정가)';
      document.getElementById('salesClientBannerText').textContent = salesData.clientName + info;
      banner.classList.remove('hidden');
    } else { banner.classList.add('hidden'); }
    renderSalesTable();
  }).catch(function() { showToast('단가표 로드 실패', 'error'); });
}

// 거래처 검색
function setupSalesClientSearch() {
  var input = document.getElementById('salesClientSearch');
  var dd = document.getElementById('salesClientDropdown');
  if (!input || !dd) return;
  var timer = null;
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      var q = input.value.trim();
      if (!q) return;
      clearTimeout(timer);
      axios.get('/api/clients?search=' + encodeURIComponent(q) + '&limit=20').then(function(res) {
        var clients = (res.data && res.data.data && res.data.data.clients) ? res.data.data.clients : [];
        if (clients.length === 1) { pickSalesClient(clients[0].id, clients[0].client_name); dd.classList.add('hidden'); }
        else showSalesClientDD(clients);
      });
    }
  });
  input.addEventListener('input', function() {
    clearTimeout(timer);
    var q = input.value.trim();
    if (q.length < 1) { dd.classList.add('hidden'); return; }
    timer = setTimeout(function() {
      axios.get('/api/clients?search=' + encodeURIComponent(q) + '&limit=20').then(function(res) {
        showSalesClientDD((res.data && res.data.data && res.data.data.clients) ? res.data.data.clients : []);
      });
    }, 300);
  });
  document.addEventListener('click', function(e) {
    if (!input.contains(e.target) && !dd.contains(e.target)) dd.classList.add('hidden');
  });
}

function showSalesClientDD(clients) {
  var dd = document.getElementById('salesClientDropdown');
  if (!clients.length) { dd.innerHTML = '<div class="px-3 py-4 text-center text-gray-400 text-sm">검색 결과 없음</div>'; dd.classList.remove('hidden'); return; }
  dd.innerHTML = clients.map(function(cl) {
    return '<div class="client-dd-entry" data-id="' + cl.id + '" data-name="' + esc(cl.client_name) + '"><div class="font-medium">' + esc(cl.client_name) + '</div>' + (cl.phone ? '<div class="text-xs text-gray-400">' + cl.phone + '</div>' : '') + '</div>';
  }).join('');
  dd.querySelectorAll('.client-dd-entry').forEach(function(el) {
    el.addEventListener('click', function() { pickSalesClient(el.dataset.id, el.dataset.name); dd.classList.add('hidden'); });
  });
  dd.classList.remove('hidden');
}

function pickSalesClient(id, name) {
  salesClientId = id;
  salesClientName = name;
  document.getElementById('salesClientId').value = id;
  document.getElementById('salesClientSearch').value = name;
  document.getElementById('salesClearBtn').classList.remove('hidden');
  loadSalesData(id);
}

function clearSalesClient() {
  salesClientId = null;
  salesClientName = '';
  document.getElementById('salesClientId').value = '';
  document.getElementById('salesClientSearch').value = '';
  document.getElementById('salesClearBtn').classList.add('hidden');
  loadSalesData();
}

// 단가 계산 (정책 적용)
function calcSalesPrice(item) {
  var basePrice = item.sales_price || item.base_price || 0;
  if (!salesData.policyRules || !salesData.policyRules.length) return { base: basePrice, applied: basePrice, source: 'base' };
  var rules = salesData.policyRules;
  var f1 = rules.find(function(r) { return r.item_id == item.id && r.fixed_price != null; });
  if (f1) return { base: basePrice, applied: f1.fixed_price, source: 'fixed' };
  var f2 = rules.find(function(r) { return r.item_id == item.id && r.fixed_price == null; });
  if (f2) return { base: basePrice, applied: Math.round(basePrice * (1 + f2.rate_percent / 100)), source: 'item' };
  var f3 = rules.find(function(r) { return !r.item_id && r.category === item.category; });
  if (f3) return { base: basePrice, applied: Math.round(basePrice * (1 + f3.rate_percent / 100)), source: 'category' };
  var f4 = rules.find(function(r) { return !r.item_id && !r.category; });
  if (f4) return { base: basePrice, applied: Math.round(basePrice * (1 + f4.rate_percent / 100)), source: 'default' };
  return { base: basePrice, applied: basePrice, source: 'base' };
}

var typeLabels = { PRODUCT: '제품', MATERIAL: '부자재', GOODS: '상품', ETC: '기타' };

function getSalesFilteredGroups() {
  var items = salesData.items || [];
  var media = salesData.media || [];
  var tf = (document.getElementById('salesTypeFilter') || {}).value || '';
  var cf = (document.getElementById('salesCategoryFilter') || {}).value || '';
  if (tf) items = items.filter(function(i) { return i.item_type === tf; });
  if (cf) { items = items.filter(function(i) { return i.category === cf; }); media = []; }
  var groups = {};
  items.forEach(function(item) {
    var key = (item.item_type || 'ETC') + '::' + (item.category || '미분류');
    if (!groups[key]) groups[key] = { type: item.item_type || 'ETC', category: item.category || '미분류', items: [] };
    groups[key].items.push(item);
  });
  var mediaGroups = {};
  media.forEach(function(m) { var mg = m.media_group || '기타'; if (!mediaGroups[mg]) mediaGroups[mg] = []; mediaGroups[mg].push(m); });
  return { groups: groups, mediaGroups: mediaGroups };
}

function renderSalesTable() {
  var area = document.getElementById('salesTableArea');
  if (!area) return;
  // 세트 선택 시 담긴 품목만(적용가) 렌더. 미선택 시 기존 전체품목 동작 유지.
  if (pmCurrentSheetId) { renderPmSheetTable(); return; }
  var data = getSalesFilteredGroups();
  var hasClient = !!salesClientId;
  var html = '';

  Object.keys(data.groups).sort().forEach(function(key) {
    var grp = data.groups[key];
    var tn = typeLabels[grp.type] || grp.type;
    var badge = grp.type === 'PRODUCT' ? 'bg-blue-100 text-blue-700' : grp.type === 'MATERIAL' ? 'bg-yellow-100 text-yellow-700' : 'bg-purple-100 text-purple-700';
    html += '<div class="bg-white rounded-lg shadow overflow-hidden"><div class="px-4 py-3 bg-gray-50 border-b flex items-center gap-2">';
    html += '<span class="text-xs px-2 py-0.5 rounded-full font-medium ' + badge + '">' + tn + '</span>';
    html += '<h3 class="font-bold text-gray-800">' + esc(grp.category) + '</h3>';
    html += '<span class="text-xs text-gray-400 ml-auto">' + grp.items.length + '건</span></div>';
    html += '<table class="w-full ds-table"><thead><tr class="text-xs text-gray-500 border-b bg-gray-50/50">';
    html += '<th class="col-code text-left py-2 px-4 font-medium">품목코드</th><th class="col-name text-left py-2 px-4 font-medium">품목명</th>';
    html += '<th class="col-flex text-left py-2 px-4 font-medium">규격</th><th class="col-qty text-center py-2 px-4 font-medium">단위</th>';
    html += '<th class="col-amount text-right py-2 px-4 font-medium">단가</th>';
    if (hasClient) html += '<th class="col-amount text-right py-2 px-4 font-medium text-blue-600">적용 단가</th>';
    html += '</tr></thead><tbody>';
    grp.items.forEach(function(item, idx) {
      var p = calcSalesPrice(item);
      html += '<tr class="border-b border-gray-50 hover:bg-blue-50/30' + (idx % 2 ? ' bg-gray-50/30' : '') + '">';
      html += '<td class="py-2.5 px-4 text-sm text-gray-500 font-mono">' + esc(item.item_code || '') + '</td>';
      html += '<td class="py-2.5 px-4 text-sm font-medium text-gray-800" title="' + esc(item.item_name || '') + '">' + esc(item.item_name) + '</td>';
      html += '<td class="py-2.5 px-4 text-sm text-gray-600" title="' + esc(item.specification || '') + '">' + esc(item.specification || '-') + '</td>';
      html += '<td class="py-2.5 px-4 text-sm text-gray-500 text-center">' + esc(item.unit || 'EA') + '</td>';
      html += '<td class="py-2.5 px-4 text-sm text-right font-medium">' + (p.base ? p.base.toLocaleString() + '원' : '-') + '</td>';
      if (hasClient) {
        var changed = p.applied !== p.base;
        html += '<td class="py-2.5 px-4 text-sm text-right font-bold ' + (changed ? 'text-blue-700' : '') + '">' + (p.applied ? p.applied.toLocaleString() + '원' : '-') + '</td>';
      }
      html += '</tr>';
    });
    html += '</tbody></table></div>';
  });

  Object.keys(data.mediaGroups).forEach(function(mg) {
    html += '<div class="bg-white rounded-lg shadow overflow-hidden"><div class="px-4 py-3 bg-gray-50 border-b flex items-center gap-2">';
    html += '<span class="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">출력 미디어</span>';
    html += '<h3 class="font-bold text-gray-800">' + esc(mg) + '</h3></div>';
    html += '<table class="w-full ds-table"><thead><tr class="text-xs text-gray-500 border-b bg-gray-50/50"><th class="col-code text-left py-2 px-4 font-medium">코드</th><th class="col-name text-left py-2 px-4 font-medium">미디어명</th><th class="col-qty text-center py-2 px-4 font-medium">단위</th><th class="col-amount text-right py-2 px-4 font-medium">단가</th></tr></thead><tbody>';
    data.mediaGroups[mg].forEach(function(m, idx) {
      html += '<tr class="border-b border-gray-50' + (idx % 2 ? ' bg-gray-50/30' : '') + '"><td class="py-2.5 px-4 text-sm text-gray-500 font-mono">' + esc(m.code || '') + '</td><td class="py-2.5 px-4 text-sm font-medium text-gray-800" title="' + esc(m.name || '') + '">' + esc(m.name) + '</td><td class="py-2.5 px-4 text-sm text-gray-500 text-center">' + esc(m.unit || '㎡') + '</td><td class="py-2.5 px-4 text-sm text-right font-medium">' + (m.price_per_unit ? m.price_per_unit.toLocaleString() + '원' : '-') + '</td></tr>';
    });
    html += '</tbody></table></div>';
  });

  if (!html) html = '<div class="bg-white rounded-lg shadow p-12 text-center text-gray-400"><i class="fas fa-inbox text-4xl mb-3"></i><p>등록된 품목이 없습니다.</p></div>';
  area.innerHTML = html;
}

// ===================== 인쇄 =====================
async function printSalesList() {
  var printArea = document.getElementById('printArea');
  await renderPrintHTML(printArea);
  var ps = document.createElement('style');
  ps.id = 'pricePrintStyle';
  ps.textContent = '@page { size: A4 portrait; margin: 10mm; }';
  document.head.appendChild(ps);
  setTimeout(function() { window.print(); printArea.innerHTML = ''; var el = document.getElementById('pricePrintStyle'); if (el) el.remove(); }, 200);
}

async function renderPrintHTML(target) {
  var title = salesClientName ? salesClientName + ' 단가표' : '단가표';
  var today = new Date().toISOString().split('T')[0];
  var hasClient = !!salesClientId;
  var colCount = hasClient ? 6 : 5;
  var data = getSalesFilteredGroups();
  var logo = '', companyInfo = '';
  try {
    var lr = await axios.get('/api/price-list/logo/' + entityId);
    if (lr.data.success && lr.data.data) {
      var ent = lr.data.data;
      if (ent.logo_base64) logo = '<img src="' + ent.logo_base64 + '" style="max-height:50px;max-width:200px;">';
      companyInfo = '<div style="font-size:8pt;color:#666;">' + (ent.name || '') + '<br>' + (ent.address || '') + '<br>' + (ent.phone ? 'T. ' + ent.phone : '') + (ent.fax ? ' | F. ' + ent.fax : '') + (ent.email ? ' | ' + ent.email : '') + '</div>';
    }
  } catch (e) {}

  var s = '<div style="font-family:Malgun Gothic,sans-serif;color:#000;padding:2mm;width:780px;">'
    + '<table style="width:100%;border:none;margin-bottom:12px;"><tr>'
    + '<td style="border:none;padding:0;vertical-align:top;width:50%;">' + logo + '<div style="font-size:22pt;font-weight:bold;margin:4px 0 0;">' + esc(title) + '</div>'
    + '<div style="font-size:10pt;color:#666;">판매 단가' + (salesData.policyName ? ' | 정책: ' + esc(salesData.policyName) : '') + '</div></td>'
    + '<td style="border:none;padding:0;text-align:right;vertical-align:top;">' + companyInfo + '<div style="font-size:9pt;color:#888;margin-top:6px;">발행일: ' + today + '</div></td></tr></table>'
    + '<hr style="border:none;border-top:3px solid #000;margin:0 0 10px 0;">';

  Object.keys(data.groups).sort().forEach(function(key) {
    var grp = data.groups[key];
    var tn = typeLabels[grp.type] || grp.type;
    s += '<table style="width:100%;border-collapse:collapse;margin-bottom:12px;page-break-inside:avoid;">'
      + '<tr><td colspan="' + colCount + '" style="background:#eee;padding:5px 8px;font-size:10pt;font-weight:bold;border:1px solid #999;">[' + tn + '] ' + esc(grp.category) + ' — ' + grp.items.length + '건</td></tr>'
      + '<tr style="background:#f5f5f5;"><th style="border:1px solid #bbb;padding:4px 6px;font-size:8pt;text-align:left;">품목코드</th><th style="border:1px solid #bbb;padding:4px 6px;font-size:8pt;text-align:left;">품목명</th><th style="border:1px solid #bbb;padding:4px 6px;font-size:8pt;text-align:left;">규격</th><th style="border:1px solid #bbb;padding:4px 6px;font-size:8pt;text-align:center;">단위</th><th style="border:1px solid #bbb;padding:4px 6px;font-size:8pt;text-align:right;">단가</th>'
      + (hasClient ? '<th style="border:1px solid #bbb;padding:4px 6px;font-size:8pt;text-align:right;color:#1a56db;">적용단가</th>' : '') + '</tr>';
    grp.items.forEach(function(item, idx) {
      var p = calcSalesPrice(item);
      var bg = idx % 2 ? '#f9f9f9' : '#fff';
      s += '<tr style="background:' + bg + ';"><td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;font-family:Consolas,monospace;">' + esc(item.item_code || '') + '</td><td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;font-weight:600;">' + esc(item.item_name) + '</td><td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;">' + esc(item.specification || '-') + '</td><td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;text-align:center;">' + esc(item.unit || 'EA') + '</td><td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;text-align:right;">' + (p.base ? p.base.toLocaleString() + '원' : '-') + '</td>';
      if (hasClient) { var ch = p.applied !== p.base; s += '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;text-align:right;font-weight:bold;' + (ch ? 'color:#1a56db;' : '') + '">' + (p.applied ? p.applied.toLocaleString() + '원' : '-') + '</td>'; }
      s += '</tr>';
    });
    s += '</table>';
  });
  s += '</div>';
  target.innerHTML = s;
}

// ===================== 팩스 =====================
function openFaxModal() { document.getElementById('faxModal').classList.remove('hidden'); document.getElementById('faxStatus').textContent = ''; document.getElementById('faxSendBtn').disabled = false; }
function closeFaxModal() { document.getElementById('faxModal').classList.add('hidden'); }

function loadHtml2Canvas() {
  return new Promise(function(resolve, reject) {
    if (window.html2canvas) return resolve(window.html2canvas);
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    s.onload = function() { resolve(window.html2canvas); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function sendFax() {
  var faxNum = document.getElementById('faxNum').value.trim().replace(/[^0-9\-]/g, '');
  var faxName = document.getElementById('faxName').value.trim();
  if (!faxNum) { document.getElementById('faxStatus').textContent = '팩스번호를 입력해주세요.'; document.getElementById('faxStatus').style.color = '#ef4444'; return; }
  var statusEl = document.getElementById('faxStatus');
  var sendBtn = document.getElementById('faxSendBtn');
  sendBtn.disabled = true;
  statusEl.textContent = '단가표 PDF 생성 중...'; statusEl.style.color = '#6b7280';
  var printArea = document.getElementById('printArea');
  try {
    printArea.style.display = 'block'; printArea.style.position = 'absolute'; printArea.style.left = '-9999px';
    await renderPrintHTML(printArea);
    var title = salesClientName ? salesClientName + '_단가표' : '단가표';
    // PDF 생성 → 서버가 FTP 업로드+발송 (동기)
    var r = await window.faxSend(printArea, {
      receiver_num: faxNum, receiver_name: faxName, file_name: title + '.pdf', related_type: 'PRICE_LIST'
    }, function(msg) { statusEl.textContent = msg; statusEl.style.color = '#6b7280'; });
    if (r.ok) { statusEl.textContent = '팩스 발송 완료! (접수번호: ' + (r.receipt || '-') + ')'; statusEl.style.color = '#16a34a'; }
    else { statusEl.textContent = '전송 실패: ' + r.error; statusEl.style.color = '#ef4444'; }
  } catch (err) {
    statusEl.textContent = '전송 실패: ' + (err.message || '오류'); statusEl.style.color = '#ef4444';
  } finally {
    printArea.innerHTML = ''; printArea.style.display = ''; printArea.style.position = ''; printArea.style.left = '';
    sendBtn.disabled = false;
  }
}

// ===================== 이력 모달 =====================
function openHistoryModal() { document.getElementById('pmHistoryModal').classList.remove('hidden'); loadHistory(); }
function closeHistoryModal() { document.getElementById('pmHistoryModal').classList.add('hidden'); }

function loadHistory() {
  var limit = (document.getElementById('pmHistoryLimit') || {}).value || 50;
  axios.get('/api/prices/price-history?limit=' + limit).then(function(res) {
    var items = res.data.history || [];
    var area = document.getElementById('pmHistoryArea');
    if (!items.length) { area.innerHTML = '<div class="text-center py-8 text-gray-400"><i class="fas fa-history text-3xl mb-2"></i><p>변경 이력이 없습니다.</p></div>'; return; }
    var html = '<table class="w-full text-sm ds-table"><thead class="bg-gray-50"><tr><th class="col-name px-4 py-2 text-left text-xs text-gray-500">품목</th><th class="col-amount px-4 py-2 text-right text-xs text-gray-500">이전</th><th class="col-no px-4 py-2 text-center text-xs text-gray-500"></th><th class="col-amount px-4 py-2 text-right text-xs text-gray-500">변경</th><th class="col-tag px-4 py-2 text-left text-xs text-gray-500">변경자</th><th class="col-datetime px-4 py-2 text-center text-xs text-gray-500">일시</th></tr></thead><tbody>';
    items.forEach(function(h) {
      var ov = h.old_value != null ? h.old_value : h.old_price;
      var nv = h.new_value != null ? h.new_value : h.new_price;
      var diff = nv - ov; var dc = diff > 0 ? 'text-red-500' : 'text-blue-500'; var ds = diff > 0 ? '+' : '';
      html += '<tr class="border-t hover:bg-gray-50"><td class="px-4 py-2.5" title="' + esc(h.item_name || '') + '"><div class="font-medium">' + esc(h.item_name || '') + '</div><div class="text-xs text-gray-400">' + esc(h.item_code || '') + '</div></td><td class="px-4 py-2.5 text-right font-mono text-gray-400 line-through">' + fmt(ov) + '</td><td class="px-4 py-2.5 text-center text-gray-300"><i class="fas fa-arrow-right text-xs"></i></td><td class="px-4 py-2.5 text-right"><span class="font-mono font-semibold">' + fmt(nv) + '</span> <span class="text-xs ' + dc + '">(' + ds + fmt(diff) + ')</span></td><td class="px-4 py-2.5 text-gray-500 text-xs">' + esc(String(h.changed_by || '')) + '</td><td class="px-4 py-2.5 text-center text-xs text-gray-400">' + (h.changed_at || '').substring(0,16).replace('T',' ') + '</td></tr>';
    });
    html += '</tbody></table>';
    area.innerHTML = html;
  });
}

// ╔═══════════════════════════════════════════════════════════════╗
// ║  가격 정책 탭 (priceList.js에서 이관, 2026-06-26)                ║
// ╚═══════════════════════════════════════════════════════════════╝
var currentEditPolicyId = null;
var currentEditRules = [];

async function loadPolicies() {
  try {
    var res = await axios.get('/api/price-list/policies');
    if (!res.data.success) return;
    var policies = res.data.data || [];
    var el = document.getElementById('policiesList');
    if (!el) { console.warn('[priceManagement] #policiesList not found'); return; }
    if (!policies.length) { el.innerHTML = '<div class="text-center py-8 text-gray-400">등록된 정책이 없습니다.</div>'; return; }
    el.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">' + policies.map(function(p) {
      return '<div class="border rounded-lg p-4 hover:border-blue-300 cursor-pointer transition-colors" onclick="editPolicyRules(' + p.id + ')">'
        + '<div class="flex items-center justify-between mb-2">'
        + '<span class="font-bold text-gray-800">' + esc(p.name) + '</span>'
        + (p.is_default ? '<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">기본</span>' : '')
        + '</div>'
        + (p.description ? '<p class="text-xs text-gray-500 mb-2">' + esc(p.description) + '</p>' : '')
        + '<div class="flex items-center gap-3 text-xs text-gray-400">'
        + '<span><i class="fas fa-list mr-1"></i>' + (p.rule_count || 0) + '개 규칙</span>'
        + '<span><i class="fas fa-building mr-1"></i>' + (p.client_count || 0) + '개 거래처</span>'
        + '</div>'
        + '<div class="flex gap-2 mt-3 pt-2 border-t">'
        + '<button onclick="event.stopPropagation();openPolicyModal(' + p.id + ',\'' + esc(p.name).replace(/'/g, "\\'") + '\',\'' + esc(p.description || '').replace(/'/g, "\\'") + '\')" class="text-xs text-blue-600 hover:text-blue-800"><i class="fas fa-edit mr-1"></i>수정</button>'
        + (p.is_default ? '' : '<button onclick="event.stopPropagation();deletePolicy(' + p.id + ')" class="text-xs text-red-500 hover:text-red-700"><i class="fas fa-trash mr-1"></i>삭제</button>')
        + '</div></div>';
    }).join('') + '</div>';
  } catch (e) { showToast('정책 목록 실패', 'error'); }
}

function openPolicyModal(id, name, desc) {
  document.getElementById('policyEditId').value = id || '';
  document.getElementById('policyName').value = name || '';
  document.getElementById('policyDesc').value = desc || '';
  document.getElementById('policyModalTitle').textContent = id ? '정책 수정' : '새 가격 정책';
  document.getElementById('policyModal').classList.remove('hidden');
}

function closePolicyModal() { document.getElementById('policyModal').classList.add('hidden'); }

async function savePolicyModal() {
  var id = document.getElementById('policyEditId').value;
  var name = document.getElementById('policyName').value.trim();
  if (!name) { showToast('정책명을 입력하세요.', 'warning'); return; }
  var desc = document.getElementById('policyDesc').value.trim();
  try {
    if (id) {
      await axios.put('/api/price-list/policies/' + id, { name: name, description: desc });
    } else {
      await axios.post('/api/price-list/policies', { name: name, description: desc });
    }
    showToast('저장 완료', 'success');
    closePolicyModal();
    loadPolicies();
  } catch (e) { showToast('저장 실패', 'error'); }
}

async function deletePolicy(id) {
  if (!confirm('이 정책을 삭제하시겠습니까? 해당 정책을 사용 중인 거래처는 정책 미지정으로 변경됩니다.')) return;
  try {
    await axios.delete('/api/price-list/policies/' + id);
    showToast('삭제 완료', 'success');
    loadPolicies();
    document.getElementById('policyRulesArea').classList.add('hidden');
  } catch (e) { showToast('삭제 실패', 'error'); }
}

async function editPolicyRules(policyId) {
  currentEditPolicyId = policyId;
  try {
    var res = await axios.get('/api/price-list/policies/' + policyId);
    if (!res.data.success) return;
    var pol = res.data.data;
    currentEditRules = (pol.rules || []).map(function(r) {
      return { category: r.category, item_id: r.item_id, rate_percent: r.rate_percent || 0, fixed_price: r.fixed_price, item_name: r.item_name || '', item_code: r.item_code || '', specification: r.specification || '' };
    });
    document.getElementById('rulesTitle').textContent = pol.name;
    document.getElementById('policyRulesArea').classList.remove('hidden');
    renderRules();
  } catch (e) { showToast('규칙 로드 실패', 'error'); }
}

function renderRules() {
  var el = document.getElementById('rulesBody');
  if (!el) { console.warn('[priceManagement] #rulesBody not found'); return; }
  if (!currentEditRules.length) {
    el.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm">규칙이 없습니다. 위 버튼으로 추가하세요.</div>';
    return;
  }
  var html = '<table class="w-full text-sm"><thead><tr class="border-b bg-gray-50">'
    + '<th class="text-left py-2 px-3">대상</th>'
    + '<th class="text-right py-2 px-3" style="width:120px">할인율 (%)</th>'
    + '<th class="text-right py-2 px-3" style="width:120px">고정가 (원)</th>'
    + '<th class="text-center py-2 px-3" style="width:60px"></th>'
    + '</tr></thead><tbody>';
  currentEditRules.forEach(function(r, idx) {
    var label = '';
    if (r.item_id) {
      label = '<span class="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded mr-1">품목</span>' + esc(r.item_name || '') + (r.specification ? ' <span class="text-gray-400">' + esc(r.specification) + '</span>' : '');
    } else if (r.category) {
      label = '<span class="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded mr-1">카테고리</span>' + esc(r.category);
    } else {
      label = '<span class="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded mr-1">전체 기본</span>';
    }
    html += '<tr class="border-b border-gray-100">'
      + '<td class="py-2 px-3">' + label + '</td>'
      + '<td class="py-2 px-3"><input type="number" step="1" value="' + (r.rate_percent || 0) + '" onchange="currentEditRules[' + idx + '].rate_percent=parseFloat(this.value)||0" class="w-full px-2 py-1 border rounded text-right text-sm"></td>'
      + '<td class="py-2 px-3"><input type="text" inputmode="numeric" data-money value="' + (r.fixed_price != null ? r.fixed_price : '') + '" placeholder="-" onchange="var v=parseMoney(this.value);currentEditRules[' + idx + '].fixed_price=v||null;if(v)this.value=fmtMoneyInput(v)" class="w-full px-2 py-1 border rounded text-right text-sm"></td>'
      + '<td class="py-2 px-3 text-center"><button onclick="currentEditRules.splice(' + idx + ',1);renderRules()" class="text-red-400 hover:text-red-600"><i class="fas fa-trash"></i></button></td>'
      + '</tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

function addCategoryRule() {
  var cats = salesData.categories || [];
  if (!cats.length) { showToast('카테고리가 없습니다. 매출단가표 탭을 먼저 열어주세요.', 'warning'); return; }
  if (!currentEditRules.find(function(r) { return !r.item_id && !r.category; })) {
    currentEditRules.unshift({ category: null, item_id: null, rate_percent: 0, fixed_price: null });
  }
  cats.forEach(function(cat) {
    if (!currentEditRules.find(function(r) { return !r.item_id && r.category === cat; })) {
      currentEditRules.push({ category: cat, item_id: null, rate_percent: 0, fixed_price: null });
    }
  });
  renderRules();
}

function openItemRuleModal() {
  var q = prompt('품목명을 입력하세요:');
  if (!q) return;
  axios.get('/api/items?search=' + encodeURIComponent(q) + '&limit=20').then(function(res) {
    var items = res.data.data || [];
    if (!items.length) { showToast('검색 결과 없음', 'warning'); return; }
    if (items.length === 1) {
      addItemRule(items[0]);
    } else {
      var pick = prompt(items.map(function(it, i) { return (i + 1) + '. ' + it.item_name + (it.specification ? ' (' + it.specification + ')' : ''); }).join('\n') + '\n\n번호를 입력하세요:');
      var idx = parseInt(pick) - 1;
      if (idx >= 0 && idx < items.length) addItemRule(items[idx]);
    }
  });
}

function addItemRule(item) {
  if (currentEditRules.find(function(r) { return r.item_id == item.id; })) { showToast('이미 추가된 품목입니다.', 'warning'); return; }
  currentEditRules.push({ category: null, item_id: item.id, rate_percent: 0, fixed_price: null, item_name: item.item_name, item_code: item.item_code, specification: item.specification || '' });
  renderRules();
}

async function saveCurrentRules() {
  if (!currentEditPolicyId) return;
  try {
    await axios.put('/api/price-list/policies/' + currentEditPolicyId + '/rules', { rules: currentEditRules });
    showToast('규칙 저장 완료', 'success');
    loadPolicies();
  } catch (e) { showToast('저장 실패', 'error'); }
}

// ╔═══════════════════════════════════════════════════════════════╗
// ║  단가표 세트 (Phase 1)                                          ║
// ╚═══════════════════════════════════════════════════════════════╝

function loadPmSheets() {
  axios.get('/api/price-sheets').then(function(res) {
    if (!res.data || !res.data.success) return;
    pmSheets = res.data.data || [];
    var sel = document.getElementById('pmSheetSelect');
    if (!sel) { console.warn('[priceManagement] #pmSheetSelect not found'); return; }
    var html = '<option value="">세트 미선택 (전체 품목)</option>';
    pmSheets.forEach(function(s) {
      var label = esc(s.name) + ' (' + (s.item_count || 0) + '개' + (s.client_name ? ' · ' + esc(s.client_name) : '') + ')';
      html += '<option value="' + s.id + '">' + label + '</option>';
    });
    sel.innerHTML = html;
    sel.value = pmCurrentSheetId ? String(pmCurrentSheetId) : '';
    updatePmSheetButtons();
  }).catch(function() { /* 세트 목록 로드 실패는 무시(기존 화면 유지) */ });
}

function updatePmSheetButtons() {
  var has = !!pmCurrentSheetId;
  var e = document.getElementById('pmSheetEditBtn');
  var d = document.getElementById('pmSheetDeleteBtn');
  if (e) e.disabled = !has;
  if (d) d.disabled = !has;
}

function onPmSheetChange() {
  var sel = document.getElementById('pmSheetSelect');
  if (!sel) return;
  var v = sel.value;
  if (!v) {
    pmCurrentSheetId = null;
    pmSheetDetail = null;
    updatePmSheetButtons();
    renderSalesTable();
    return;
  }
  pmCurrentSheetId = v;
  updatePmSheetButtons();
  axios.get('/api/price-sheets/' + v).then(function(res) {
    if (!res.data || !res.data.success) { showToast('세트 로드 실패', 'error'); return; }
    pmSheetDetail = res.data.data;
    renderSalesTable();
  }).catch(function() { showToast('세트 로드 실패', 'error'); });
}

function renderPmSheetTable() {
  var area = document.getElementById('salesTableArea');
  if (!area) return;
  var d = pmSheetDetail;
  if (!d) { area.innerHTML = '<div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>'; return; }
  var items = d.items || [];
  var meta = '<div class="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">';
  meta += '<span class="font-bold text-blue-800"><i class="fas fa-layer-group mr-1"></i>' + esc(d.name) + '</span>';
  if (d.client_name) meta += '<span class="text-blue-700"><i class="fas fa-user mr-1"></i>' + esc(d.client_name) + ' 적용가</span>';
  else meta += '<span class="text-gray-500">표준 판매가</span>';
  if (d.valid_until) meta += '<span class="text-gray-500"><i class="far fa-calendar mr-1"></i>유효 ~' + esc(d.valid_until) + '</span>';
  meta += '<span class="text-gray-400 ml-auto">' + items.length + '개 품목</span></div>';

  if (!items.length) {
    area.innerHTML = meta + '<div class="bg-white rounded-lg shadow p-12 text-center text-gray-400"><i class="fas fa-inbox text-4xl mb-3"></i><p>담긴 품목이 없습니다. [수정]에서 품목을 담아주세요.</p></div>';
    return;
  }

  var html = meta + '<div class="bg-white rounded-lg shadow overflow-hidden"><table class="w-full ds-table"><thead><tr class="text-xs text-gray-500 border-b bg-gray-50/50">';
  html += '<th class="col-code text-left py-2 px-4 font-medium">품목코드</th><th class="col-name text-left py-2 px-4 font-medium">품목명</th>';
  html += '<th class="col-flex text-left py-2 px-4 font-medium">규격</th><th class="col-qty text-center py-2 px-4 font-medium">단위</th>';
  html += '<th class="col-amount text-right py-2 px-4 font-medium text-blue-600">단가</th></tr></thead><tbody>';
  items.forEach(function(it, idx) {
    html += '<tr class="border-b border-gray-50 hover:bg-blue-50/30' + (idx % 2 ? ' bg-gray-50/30' : '') + '">';
    html += '<td class="py-2.5 px-4 text-sm text-gray-500 font-mono">' + esc(it.item_code || '') + '</td>';
    html += '<td class="py-2.5 px-4 text-sm font-medium text-gray-800" title="' + esc(it.item_name || '') + '">' + esc(it.item_name) + '</td>';
    html += '<td class="py-2.5 px-4 text-sm text-gray-600" title="' + esc(it.specification || '') + '">' + esc(it.specification || '-') + '</td>';
    html += '<td class="py-2.5 px-4 text-sm text-gray-500 text-center">' + esc(it.unit || 'EA') + '</td>';
    html += '<td class="py-2.5 px-4 text-sm text-right font-bold text-blue-700">' + (it.price ? Number(it.price).toLocaleString() + '원' : '-') + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  area.innerHTML = html;
}

// ---- 세트 편집 모달 ----
function openPmSheetModal(id) {
  var modal = document.getElementById('pmSheetModal');
  if (!modal) { console.warn('[priceManagement] #pmSheetModal not found'); return; }
  // 초기화
  setVal('pmSheetEditId', id || '');
  setVal('pmSheetName', '');
  setVal('pmSheetValidUntil', '');
  setVal('pmSheetContactPerson', '');
  setVal('pmSheetContactPhone', '');
  setVal('pmSheetNotes', '');
  setVal('pmSheetItemSearch', '');
  var typeSel = document.getElementById('pmSheetItemType'); if (typeSel) typeSel.value = '';
  var stampCb = document.getElementById('pmSheetShowStamp'); if (stampCb) stampCb.checked = true;
  pmSheetItemIds = [];
  clearPmSheetClient();
  var title = document.getElementById('pmSheetModalTitle');
  if (title) title.innerHTML = '<i class="fas fa-layer-group text-blue-600 mr-2"></i>' + (id ? '단가표 세트 수정' : '새 단가표 세트');

  function open() { modal.classList.remove('hidden'); renderPmSheetItemPicker(); }

  if (id) {
    axios.get('/api/price-sheets/' + id).then(function(res) {
      if (!res.data || !res.data.success) { showToast('세트 로드 실패', 'error'); return; }
      var d = res.data.data;
      setVal('pmSheetName', d.name || '');
      setVal('pmSheetValidUntil', d.valid_until || '');
      setVal('pmSheetContactPerson', d.contact_person || '');
      setVal('pmSheetContactPhone', d.contact_phone || '');
      setVal('pmSheetNotes', d.notes || '');
      if (stampCb) stampCb.checked = d.show_stamp !== 0;
      if (d.client_id) {
        pmSheetClientId = d.client_id;
        pmSheetClientName = d.client_name || '';
        setVal('pmSheetClientId', d.client_id);
        setVal('pmSheetClientSearch', d.client_name || '');
        var cb = document.getElementById('pmSheetClientClear'); if (cb) cb.classList.remove('hidden');
      }
      pmSheetItemIds = (d.items || []).map(function(it) { return Number(it.item_id); });
      open();
    }).catch(function() { showToast('세트 로드 실패', 'error'); });
  } else {
    open();
  }
}

function closePmSheetModal() { var m = document.getElementById('pmSheetModal'); if (m) m.classList.add('hidden'); }

function renderPmSheetItemPicker() {
  var avail = document.getElementById('pmSheetAvailList');
  var selList = document.getElementById('pmSheetSelList');
  var cnt = document.getElementById('pmSheetSelCount');
  if (!avail || !selList) return;
  var q = ((document.getElementById('pmSheetItemSearch') || {}).value || '').trim().toLowerCase();
  var tf = (document.getElementById('pmSheetItemType') || {}).value || '';
  var all = salesData.items || [];
  var selSet = {}; pmSheetItemIds.forEach(function(id) { selSet[id] = true; });

  var list = all.filter(function(i) {
    if (tf && i.item_type !== tf) return false;
    if (q) {
      var hay = ((i.item_name || '') + ' ' + (i.item_code || '') + ' ' + (i.specification || '')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }).slice(0, 200);

  if (!all.length) {
    avail.innerHTML = '<div class="p-4 text-center text-xs text-gray-400">품목 로딩 중… 매출단가표 탭이 먼저 로드되어야 합니다.</div>';
  } else if (!list.length) {
    avail.innerHTML = '<div class="p-4 text-center text-xs text-gray-400">검색 결과 없음</div>';
  } else {
    avail.innerHTML = list.map(function(i) {
      var checked = selSet[i.id] ? 'checked' : '';
      return '<label class="flex items-center gap-2 px-3 py-1.5 border-b border-gray-50 hover:bg-blue-50/40 cursor-pointer text-sm">'
        + '<input type="checkbox" ' + checked + ' onchange="togglePmSheetItem(' + i.id + ', this.checked)" class="h-4 w-4 flex-shrink-0">'
        + '<span class="font-mono text-xs text-gray-400 flex-shrink-0">' + esc(i.item_code || '') + '</span>'
        + '<span class="font-medium text-gray-700 truncate">' + esc(i.item_name || '') + '</span>'
        + (i.specification ? '<span class="text-xs text-gray-400 truncate">' + esc(i.specification) + '</span>' : '')
        + '</label>';
    }).join('');
  }

  var byId = {}; all.forEach(function(i) { byId[i.id] = i; });
  if (!pmSheetItemIds.length) {
    selList.innerHTML = '<div class="p-4 text-center text-xs text-gray-400">담긴 품목 없음</div>';
  } else {
    selList.innerHTML = pmSheetItemIds.map(function(id, idx) {
      var i = byId[id] || {};
      return '<div class="flex items-center gap-2 px-3 py-1.5 border-b border-gray-50 text-sm">'
        + '<span class="text-xs text-gray-300 w-5 text-right flex-shrink-0">' + (idx + 1) + '</span>'
        + '<span class="font-mono text-xs text-gray-400 flex-shrink-0">' + esc(i.item_code || ('#' + id)) + '</span>'
        + '<span class="font-medium text-gray-700 truncate flex-1">' + esc(i.item_name || '') + '</span>'
        + '<button type="button" onclick="togglePmSheetItem(' + id + ', false)" class="text-red-400 hover:text-red-600 flex-shrink-0"><i class="fas fa-times"></i></button>'
        + '</div>';
    }).join('');
  }
  if (cnt) cnt.textContent = pmSheetItemIds.length;
}

function togglePmSheetItem(id, checked) {
  id = Number(id);
  var pos = pmSheetItemIds.indexOf(id);
  if (checked) { if (pos === -1) pmSheetItemIds.push(id); }
  else { if (pos !== -1) pmSheetItemIds.splice(pos, 1); }
  renderPmSheetItemPicker();
}

function savePmSheet() {
  var name = ((document.getElementById('pmSheetName') || {}).value || '').trim();
  if (!name) { showToast('세트 이름을 입력하세요.', 'warning'); return; }
  var stampCb = document.getElementById('pmSheetShowStamp');
  var payload = {
    name: name,
    client_id: pmSheetClientId ? Number(pmSheetClientId) : null,
    valid_until: ((document.getElementById('pmSheetValidUntil') || {}).value || '') || null,
    notes: ((document.getElementById('pmSheetNotes') || {}).value || '').trim() || null,
    contact_person: ((document.getElementById('pmSheetContactPerson') || {}).value || '').trim() || null,
    contact_phone: ((document.getElementById('pmSheetContactPhone') || {}).value || '').trim() || null,
    show_stamp: (stampCb && !stampCb.checked) ? 0 : 1,
    item_ids: pmSheetItemIds.slice()
  };
  var id = (document.getElementById('pmSheetEditId') || {}).value || '';
  var saveBtn = document.getElementById('pmSheetSaveBtn');
  if (saveBtn) saveBtn.disabled = true;
  var req = id ? axios.put('/api/price-sheets/' + id, payload) : axios.post('/api/price-sheets', payload);
  req.then(function(res) {
    showToast('세트 저장 완료', 'success');
    closePmSheetModal();
    var newId = id || (res.data && res.data.data && res.data.data.id);
    pmCurrentSheetId = newId ? String(newId) : pmCurrentSheetId;
    loadPmSheets();
    if (pmCurrentSheetId) {
      axios.get('/api/price-sheets/' + pmCurrentSheetId).then(function(r) {
        if (r.data && r.data.success) { pmSheetDetail = r.data.data; updatePmSheetButtons(); renderSalesTable(); }
      });
    }
  }).catch(function(e) {
    var msg = (e && e.response && e.response.data && e.response.data.error) || '저장 실패';
    showToast(msg, 'error');
  }).finally(function() { if (saveBtn) saveBtn.disabled = false; });
}

function deletePmSheet() {
  if (!pmCurrentSheetId) return;
  if (!confirm('이 단가표 세트를 삭제하시겠습니까?')) return;
  axios.delete('/api/price-sheets/' + pmCurrentSheetId).then(function() {
    showToast('세트 삭제 완료', 'success');
    pmCurrentSheetId = null;
    pmSheetDetail = null;
    loadPmSheets();
    updatePmSheetButtons();
    renderSalesTable();
  }).catch(function() { showToast('삭제 실패', 'error'); });
}

// ---- 세트 모달 거래처 검색(기존 매출탭 거래처 검색 미러링) ----
function setupPmSheetClientSearch() {
  var input = document.getElementById('pmSheetClientSearch');
  var dd = document.getElementById('pmSheetClientDropdown');
  if (!input || !dd) return;
  var timer = null;
  function doSearch(q, oneAuto) {
    axios.get('/api/clients?search=' + encodeURIComponent(q) + '&limit=20').then(function(res) {
      var clients = (res.data && res.data.data && res.data.data.clients) ? res.data.data.clients : [];
      if (oneAuto && clients.length === 1) { pickPmSheetClient(clients[0].id, clients[0].client_name); dd.classList.add('hidden'); return; }
      showPmSheetClientDD(clients);
    });
  }
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); var q = input.value.trim(); if (!q) return; clearTimeout(timer); doSearch(q, true); }
  });
  input.addEventListener('input', function() {
    clearTimeout(timer);
    var q = input.value.trim();
    if (q.length < 1) { dd.classList.add('hidden'); return; }
    timer = setTimeout(function() { doSearch(q, false); }, 300);
  });
  document.addEventListener('click', function(e) {
    if (!input.contains(e.target) && !dd.contains(e.target)) dd.classList.add('hidden');
  });
}

function showPmSheetClientDD(clients) {
  var dd = document.getElementById('pmSheetClientDropdown');
  if (!dd) return;
  if (!clients.length) { dd.innerHTML = '<div class="px-3 py-4 text-center text-gray-400 text-sm">검색 결과 없음</div>'; dd.classList.remove('hidden'); return; }
  dd.innerHTML = clients.map(function(cl) {
    return '<div class="client-dd-entry" data-id="' + cl.id + '" data-name="' + esc(cl.client_name) + '"><div class="font-medium">' + esc(cl.client_name) + '</div>' + (cl.phone ? '<div class="text-xs text-gray-400">' + cl.phone + '</div>' : '') + '</div>';
  }).join('');
  dd.querySelectorAll('.client-dd-entry').forEach(function(el) {
    el.addEventListener('click', function() { pickPmSheetClient(el.dataset.id, el.dataset.name); dd.classList.add('hidden'); });
  });
  dd.classList.remove('hidden');
}

function pickPmSheetClient(id, name) {
  pmSheetClientId = id;
  pmSheetClientName = name;
  setVal('pmSheetClientId', id);
  setVal('pmSheetClientSearch', name);
  var cb = document.getElementById('pmSheetClientClear'); if (cb) cb.classList.remove('hidden');
}

function clearPmSheetClient() {
  pmSheetClientId = null;
  pmSheetClientName = '';
  setVal('pmSheetClientId', '');
  setVal('pmSheetClientSearch', '');
  var cb = document.getElementById('pmSheetClientClear'); if (cb) cb.classList.add('hidden');
}

// ===================== Utilities =====================
function setVal(id, v) { var el = document.getElementById(id); if (el) el.value = v; }
function fmt(n) { if (n == null || isNaN(n)) return '-'; return Number(n).toLocaleString('ko-KR'); }
function esc(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return esc(s).replace(/'/g,'&#39;'); }
