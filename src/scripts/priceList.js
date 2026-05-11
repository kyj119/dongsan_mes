var priceData = { items: [], media: [], policyRules: [], policyName: '', policyId: null, clientName: '', categories: [] };
var priceMode = 'base';
var selectedClientId = null;
var typeFilterValue = '';
var categoryFilterValue = '';
var searchTimer = null;
var currentEditPolicyId = null;
var currentEditRules = [];
var entityId = 1; // 현재 법인

(function init() {
  // entityId from cookie/global
  if (window.__entityId) entityId = window.__entityId;
  loadPriceList();
  setupClientSearch();
})();

// ========== 탭 전환 ==========
function switchTab(tab) {
  // 'settings' 탭은 /settings 페이지로 이동됨 (Phase 후속 작업)
  ['priceTable', 'policies'].forEach(function(t) {
    var btn = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
    var panel = document.getElementById('panel' + t.charAt(0).toUpperCase() + t.slice(1));
    if (!btn || !panel) return;
    if (t === tab) {
      btn.classList.add('active');
      panel.classList.remove('hidden');
    } else {
      btn.classList.remove('active');
      panel.classList.add('hidden');
    }
  });
  if (tab === 'policies') loadPolicies();
}

// ========== 단가표 데이터 ==========
async function loadPriceList(clientId) {
  try {
    var url = '/api/price-list';
    if (clientId) url += '?client_id=' + clientId;
    var res = await axios.get(url);
    if (!res.data.success) { showToast('단가표 로드 실패', 'error'); return; }
    priceData = res.data.data;

    var sel = document.getElementById('categoryFilter');
    var cv = sel.value;
    sel.innerHTML = '<option value="">전체 카테고리</option>';
    priceData.categories.forEach(function(cat) {
      sel.innerHTML += '<option value="' + escapeHtml(cat) + '">' + escapeHtml(cat) + '</option>';
    });
    sel.value = cv;

    var banner = document.getElementById('clientBanner');
    if (clientId && priceData.clientName) {
      var info = priceData.policyName ? ' — 정책: ' + priceData.policyName : ' — 정책 미지정 (정가)';
      document.getElementById('clientBannerText').textContent = priceData.clientName + info;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
    renderPriceTable();
  } catch (e) {
    console.error('loadPriceList error:', e);
    showToast('데이터 로드 실패', 'error');
  }
}

// ========== 거래처 검색 ==========
function setupClientSearch() {
  var input = document.getElementById('clientSearch');
  var dd = document.getElementById('clientDropdown');
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      var q = input.value.trim();
      if (!q) return;
      clearTimeout(searchTimer);
      axios.get('/api/clients?search=' + encodeURIComponent(q) + '&limit=20').then(function(res) {
        var clients = (res.data && res.data.data && res.data.data.clients) ? res.data.data.clients : [];
        if (clients.length === 1) { pickClient(clients[0].id, clients[0].client_name); dd.classList.add('hidden'); }
        else showClientDropdown(clients);
      });
    }
  });
  input.addEventListener('input', function() {
    clearTimeout(searchTimer);
    var q = input.value.trim();
    if (q.length < 1) { dd.classList.add('hidden'); return; }
    searchTimer = setTimeout(function() {
      axios.get('/api/clients?search=' + encodeURIComponent(q) + '&limit=20').then(function(res) {
        showClientDropdown((res.data && res.data.data && res.data.data.clients) ? res.data.data.clients : []);
      });
    }, 300);
  });
  document.addEventListener('click', function(e) {
    if (!input.contains(e.target) && !dd.contains(e.target)) dd.classList.add('hidden');
  });
}

function showClientDropdown(clients) {
  var dd = document.getElementById('clientDropdown');
  if (!clients.length) { dd.innerHTML = '<div class="px-3 py-4 text-center text-gray-400 text-sm">검색 결과 없음</div>'; dd.classList.remove('hidden'); return; }
  dd.innerHTML = clients.map(function(cl) {
    return '<div class="client-dd-entry" data-id="' + cl.id + '" data-name="' + escapeHtml(cl.client_name) + '"><div class="font-medium">' + escapeHtml(cl.client_name) + '</div>' + (cl.phone ? '<div class="text-xs text-gray-400">' + cl.phone + '</div>' : '') + '</div>';
  }).join('');
  dd.querySelectorAll('.client-dd-entry').forEach(function(el) {
    el.addEventListener('click', function() { pickClient(el.dataset.id, el.dataset.name); dd.classList.add('hidden'); });
  });
  dd.classList.remove('hidden');
}

function pickClient(id, name) {
  selectedClientId = id;
  document.getElementById('clientId').value = id;
  document.getElementById('clientSearch').value = name;
  document.getElementById('clearClientBtn').classList.remove('hidden');
  loadPriceList(id);
}

function clearClient() {
  selectedClientId = null;
  document.getElementById('clientId').value = '';
  document.getElementById('clientSearch').value = '';
  document.getElementById('clearClientBtn').classList.add('hidden');
  loadPriceList();
}

// ========== 모드/필터 ==========
function setPriceMode(mode) {
  priceMode = mode;
  document.getElementById('modeBtnBase').className = mode === 'base' ? 'px-4 py-2 bg-blue-600 text-white font-medium' : 'px-4 py-2 bg-white text-gray-700 hover:bg-gray-50';
  document.getElementById('modeBtnSales').className = mode === 'sales' ? 'px-4 py-2 bg-blue-600 text-white font-medium' : 'px-4 py-2 bg-white text-gray-700 hover:bg-gray-50';
  renderPriceTable();
}

function applyFilter() {
  typeFilterValue = document.getElementById('typeFilter').value;
  categoryFilterValue = document.getElementById('categoryFilter').value;
  renderPriceTable();
}

// ========== 단가 계산 ==========
function calcPrice(item) {
  var basePrice = priceMode === 'sales' ? (item.sales_price || item.base_price || 0) : (item.base_price || 0);
  if (!priceData.policyRules || !priceData.policyRules.length) return { base: basePrice, applied: basePrice, source: 'base' };

  var rules = priceData.policyRules;
  // 우선순위: 품목 고정가 > 품목 할인 > 카테고리 > 전체 기본
  var itemFixed = rules.find(function(r) { return r.item_id == item.id && r.fixed_price != null; });
  if (itemFixed) return { base: basePrice, applied: itemFixed.fixed_price, source: 'fixed' };

  var itemRate = rules.find(function(r) { return r.item_id == item.id && r.fixed_price == null; });
  if (itemRate) return { base: basePrice, applied: Math.round(basePrice * (1 + itemRate.rate_percent / 100)), source: 'item' };

  var catRate = rules.find(function(r) { return !r.item_id && r.category === item.category; });
  if (catRate) return { base: basePrice, applied: Math.round(basePrice * (1 + catRate.rate_percent / 100)), source: 'category' };

  var defRate = rules.find(function(r) { return !r.item_id && !r.category; });
  if (defRate) return { base: basePrice, applied: Math.round(basePrice * (1 + defRate.rate_percent / 100)), source: 'default' };

  return { base: basePrice, applied: basePrice, source: 'base' };
}

var typeLabels = { PRODUCT: '제품', MATERIAL: '부자재', GOODS: '상품', ETC: '기타' };

function getFilteredGroups() {
  var items = priceData.items || [];
  var media = priceData.media || [];
  if (typeFilterValue) items = items.filter(function(i) { return i.item_type === typeFilterValue; });
  if (categoryFilterValue) { items = items.filter(function(i) { return i.category === categoryFilterValue; }); media = []; }

  var groups = {};
  items.forEach(function(item) {
    var type = item.item_type || 'ETC';
    var cat = item.category || '미분류';
    var key = type + '::' + cat;
    if (!groups[key]) groups[key] = { type: type, category: cat, items: [] };
    groups[key].items.push(item);
  });

  var mediaGroups = {};
  media.forEach(function(m) {
    var mg = m.media_group || '기타';
    if (!mediaGroups[mg]) mediaGroups[mg] = [];
    mediaGroups[mg].push(m);
  });
  return { groups: groups, mediaGroups: mediaGroups };
}

// ========== 단가표 렌더링 ==========
function renderPriceTable() {
  var area = document.getElementById('priceTableArea');
  var data = getFilteredGroups();
  var hasClient = !!selectedClientId;
  var html = '';

  Object.keys(data.groups).sort().forEach(function(key) {
    var grp = data.groups[key];
    var typeName = typeLabels[grp.type] || grp.type;
    html += '<div class="bg-white rounded-lg shadow overflow-hidden">'
      + '<div class="px-4 py-3 bg-gray-50 border-b flex items-center gap-2">'
      + '<span class="text-xs px-2 py-0.5 rounded-full font-medium ' + (grp.type === 'PRODUCT' ? 'bg-blue-100 text-blue-700' : grp.type === 'MATERIAL' ? 'bg-yellow-100 text-yellow-700' : 'bg-purple-100 text-purple-700') + '">' + typeName + '</span>'
      + '<h3 class="font-bold text-gray-800">' + escapeHtml(grp.category) + '</h3>'
      + '<span class="text-xs text-gray-400 ml-auto">' + grp.items.length + '건</span></div>'
      + '<table class="w-full"><thead><tr class="text-xs text-gray-500 border-b bg-gray-50/50">'
      + '<th class="text-left py-2 px-4 font-medium">품목코드</th>'
      + '<th class="text-left py-2 px-4 font-medium">품목명</th>'
      + '<th class="text-left py-2 px-4 font-medium">규격</th>'
      + '<th class="text-center py-2 px-4 font-medium">단위</th>'
      + '<th class="text-right py-2 px-4 font-medium">단가</th>'
      + (hasClient ? '<th class="text-right py-2 px-4 font-medium">적용 단가</th>' : '')
      + '</tr></thead><tbody>';

    grp.items.forEach(function(item, idx) {
      var p = calcPrice(item);
      html += '<tr class="border-b border-gray-50 hover:bg-blue-50/30' + (idx % 2 ? ' bg-gray-50/30' : '') + '">'
        + '<td class="py-2.5 px-4 text-sm text-gray-500 font-mono">' + escapeHtml(item.item_code || '') + '</td>'
        + '<td class="py-2.5 px-4 text-sm font-medium text-gray-800">' + escapeHtml(item.item_name) + '</td>'
        + '<td class="py-2.5 px-4 text-sm text-gray-600">' + escapeHtml(item.specification || '-') + '</td>'
        + '<td class="py-2.5 px-4 text-sm text-gray-500 text-center">' + escapeHtml(item.unit || 'EA') + '</td>'
        + '<td class="py-2.5 px-4 text-sm text-right font-medium">' + (p.base ? p.base.toLocaleString() + '원' : '-') + '</td>';
      if (hasClient) {
        var changed = p.applied !== p.base;
        html += '<td class="py-2.5 px-4 text-sm text-right font-bold ' + (changed ? 'text-blue-700' : '') + '">' + (p.applied ? p.applied.toLocaleString() + '원' : '-') + '</td>';
      }
      html += '</tr>';
    });
    html += '</tbody></table></div>';
  });

  Object.keys(data.mediaGroups).forEach(function(mg) {
    html += '<div class="bg-white rounded-lg shadow overflow-hidden">'
      + '<div class="px-4 py-3 bg-gray-50 border-b flex items-center gap-2">'
      + '<span class="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">출력 미디어</span>'
      + '<h3 class="font-bold text-gray-800">' + escapeHtml(mg) + '</h3></div>'
      + '<table class="w-full"><thead><tr class="text-xs text-gray-500 border-b bg-gray-50/50">'
      + '<th class="text-left py-2 px-4 font-medium">코드</th><th class="text-left py-2 px-4 font-medium">미디어명</th>'
      + '<th class="text-center py-2 px-4 font-medium">단위</th><th class="text-right py-2 px-4 font-medium">단가</th>'
      + '</tr></thead><tbody>';
    data.mediaGroups[mg].forEach(function(m, idx) {
      html += '<tr class="border-b border-gray-50' + (idx % 2 ? ' bg-gray-50/30' : '') + '">'
        + '<td class="py-2.5 px-4 text-sm text-gray-500 font-mono">' + escapeHtml(m.code || '') + '</td>'
        + '<td class="py-2.5 px-4 text-sm font-medium text-gray-800">' + escapeHtml(m.name) + '</td>'
        + '<td class="py-2.5 px-4 text-sm text-gray-500 text-center">' + escapeHtml(m.unit || '㎡') + '</td>'
        + '<td class="py-2.5 px-4 text-sm text-right font-medium">' + (m.price_per_unit ? m.price_per_unit.toLocaleString() + '원' : '-') + '</td></tr>';
    });
    html += '</tbody></table></div>';
  });

  if (!html) html = '<div class="bg-white rounded-lg shadow p-12 text-center text-gray-400"><i class="fas fa-inbox text-4xl mb-3"></i><p>등록된 품목이 없습니다.</p></div>';
  area.innerHTML = html;
}

// ========== 인쇄 (데이터 기반) ==========
async function printPriceList() {
  var printArea = document.getElementById('printArea');
  var title = '단가표';
  if (priceData.clientName) title = priceData.clientName + ' 단가표';
  var modeLabel = priceMode === 'sales' ? '판매 단가' : '기본 단가';
  var today = new Date().toISOString().split('T')[0];
  var hasClient = !!selectedClientId;
  var colCount = hasClient ? 6 : 5;
  var data = getFilteredGroups();

  // 로고/회사정보 로드
  var logo = '';
  var companyInfo = '';
  try {
    var lr = await axios.get('/api/price-list/logo/' + entityId);
    if (lr.data.success && lr.data.data) {
      var ent = lr.data.data;
      if (ent.logo_base64) logo = '<img src="' + ent.logo_base64 + '" style="max-height:50px;max-width:200px;">';
      companyInfo = '<div style="font-size:8pt;color:#666;">'
        + (ent.name ? escapeHtml(ent.name) : '') + '<br>'
        + (ent.address ? escapeHtml(ent.address) : '') + '<br>'
        + (ent.phone ? 'T. ' + escapeHtml(ent.phone) : '') + (ent.fax ? ' | F. ' + escapeHtml(ent.fax) : '')
        + (ent.email ? ' | ' + escapeHtml(ent.email) : '') + '</div>';
    }
  } catch (e) { /* ignore */ }

  var s = '<div style="font-family:Malgun Gothic,sans-serif;color:#000;padding:2mm;">'
    + '<table style="width:100%;border:none;margin-bottom:12px;"><tr>'
    + '<td style="border:none;padding:0;vertical-align:top;width:50%;">' + logo
    + '<div style="font-size:22pt;font-weight:bold;margin:4px 0 0;">' + escapeHtml(title) + '</div>'
    + '<div style="font-size:10pt;color:#666;">' + modeLabel + (priceData.policyName ? ' | 정책: ' + escapeHtml(priceData.policyName) : '') + '</div></td>'
    + '<td style="border:none;padding:0;text-align:right;vertical-align:top;">' + companyInfo
    + '<div style="font-size:9pt;color:#888;margin-top:6px;">발행일: ' + today + '</div></td>'
    + '</tr></table>'
    + '<hr style="border:none;border-top:3px solid #000;margin:0 0 10px 0;">';

  Object.keys(data.groups).sort().forEach(function(key) {
    var grp = data.groups[key];
    var typeName = typeLabels[grp.type] || grp.type;
    s += '<table style="width:100%;border-collapse:collapse;margin-bottom:12px;page-break-inside:avoid;">'
      + '<tr><td colspan="' + colCount + '" style="background:#eee;padding:5px 8px;font-size:10pt;font-weight:bold;border:1px solid #999;">[' + typeName + '] ' + escapeHtml(grp.category) + ' — ' + grp.items.length + '건</td></tr>'
      + '<tr style="background:#f5f5f5;">'
      + '<th style="border:1px solid #bbb;padding:4px 6px;font-size:8pt;text-align:left;">품목코드</th>'
      + '<th style="border:1px solid #bbb;padding:4px 6px;font-size:8pt;text-align:left;">품목명</th>'
      + '<th style="border:1px solid #bbb;padding:4px 6px;font-size:8pt;text-align:left;">규격</th>'
      + '<th style="border:1px solid #bbb;padding:4px 6px;font-size:8pt;text-align:center;">단위</th>'
      + '<th style="border:1px solid #bbb;padding:4px 6px;font-size:8pt;text-align:right;">단가</th>'
      + (hasClient ? '<th style="border:1px solid #bbb;padding:4px 6px;font-size:8pt;text-align:right;color:#1a56db;">적용단가</th>' : '')
      + '</tr>';
    grp.items.forEach(function(item, idx) {
      var p = calcPrice(item);
      var bg = idx % 2 ? '#f9f9f9' : '#fff';
      s += '<tr style="background:' + bg + ';">'
        + '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;font-family:Consolas,monospace;">' + escapeHtml(item.item_code || '') + '</td>'
        + '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;font-weight:600;">' + escapeHtml(item.item_name) + '</td>'
        + '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;">' + escapeHtml(item.specification || '-') + '</td>'
        + '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;text-align:center;">' + escapeHtml(item.unit || 'EA') + '</td>'
        + '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;text-align:right;">' + (p.base ? p.base.toLocaleString() + '원' : '-') + '</td>';
      if (hasClient) {
        var changed = p.applied !== p.base;
        s += '<td style="border:1px solid #ddd;padding:3px 6px;font-size:8pt;text-align:right;font-weight:bold;' + (changed ? 'color:#1a56db;' : '') + '">' + (p.applied ? p.applied.toLocaleString() + '원' : '-') + '</td>';
      }
      s += '</tr>';
    });
    s += '</table>';
  });

  s += '</div>';
  printArea.innerHTML = s;
  var ps = document.createElement('style');
  ps.id = 'pricePrintStyle';
  ps.textContent = '@page { size: A4 portrait; margin: 10mm; }';
  document.head.appendChild(ps);
  setTimeout(function() { window.print(); printArea.innerHTML = ''; var el = document.getElementById('pricePrintStyle'); if (el) el.remove(); }, 200);
}

// ========== 정책 관리 ==========
async function loadPolicies() {
  try {
    var res = await axios.get('/api/price-list/policies');
    if (!res.data.success) return;
    var policies = res.data.data || [];
    var el = document.getElementById('policiesList');
    if (!policies.length) { el.innerHTML = '<div class="text-center py-8 text-gray-400">등록된 정책이 없습니다.</div>'; return; }

    el.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">' + policies.map(function(p) {
      return '<div class="border rounded-lg p-4 hover:border-blue-300 cursor-pointer transition-colors" onclick="editPolicyRules(' + p.id + ')">'
        + '<div class="flex items-center justify-between mb-2">'
        + '<span class="font-bold text-gray-800">' + escapeHtml(p.name) + '</span>'
        + (p.is_default ? '<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">기본</span>' : '')
        + '</div>'
        + (p.description ? '<p class="text-xs text-gray-500 mb-2">' + escapeHtml(p.description) + '</p>' : '')
        + '<div class="flex items-center gap-3 text-xs text-gray-400">'
        + '<span><i class="fas fa-list mr-1"></i>' + (p.rule_count || 0) + '개 규칙</span>'
        + '<span><i class="fas fa-building mr-1"></i>' + (p.client_count || 0) + '개 거래처</span>'
        + '</div>'
        + '<div class="flex gap-2 mt-3 pt-2 border-t">'
        + '<button onclick="event.stopPropagation();openPolicyModal(' + p.id + ',\'' + escapeHtml(p.name).replace(/'/g, "\\'") + '\',\'' + escapeHtml(p.description || '').replace(/'/g, "\\'") + '\')" class="text-xs text-blue-600 hover:text-blue-800"><i class="fas fa-edit mr-1"></i>수정</button>'
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

// ========== 정책 규칙 편집 ==========
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
      label = '<span class="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded mr-1">품목</span>' + escapeHtml(r.item_name || '') + (r.specification ? ' <span class="text-gray-400">' + escapeHtml(r.specification) + '</span>' : '');
    } else if (r.category) {
      label = '<span class="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded mr-1">카테고리</span>' + escapeHtml(r.category);
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
  var cats = priceData.categories || [];
  if (!cats.length) { showToast('카테고리가 없습니다.', 'warning'); return; }
  // 전체 기본이 없으면 먼저 추가
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

// 로고 설정 기능은 /settings 페이지로 이동됨 (loadLogoSettings, onLogoFileSelected, saveLogo, deleteLogo)
