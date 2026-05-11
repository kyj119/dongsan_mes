var selectedPriceListId = null;
var assignClientIds = [];

function loadPriceLists() {
  axios.get('/api/price-lists').then(function(res) {
    var lists = res.data.price_lists || [];
    var html = '';
    for (var i = 0; i < lists.length; i++) {
      var pl = lists[i];
      var isDefault = pl.is_default ? ' <span class="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded">기본</span>' : '';
      var percentText = pl.adjustment_percent > 0 ? '+' + pl.adjustment_percent + '%' : pl.adjustment_percent + '%';
      var percentColor = pl.adjustment_percent > 0 ? 'text-red-600' : (pl.adjustment_percent < 0 ? 'text-blue-600' : 'text-gray-600');
      var selected = selectedPriceListId == pl.id ? 'ring-2 ring-purple-500' : '';

      html += '<div class="border rounded-lg p-4 cursor-pointer hover:shadow-md transition ' + selected + '" onclick="selectPriceList(' + pl.id + ')">'
        + '<div class="flex justify-between items-start mb-2">'
        + '<div><h4 class="font-bold text-lg">' + pl.name + isDefault + '</h4>'
        + '<p class="text-sm text-gray-500">' + (pl.description || '') + '</p></div>'
        + '<div class="flex gap-1">'
        + '<button onclick="event.stopPropagation(); editPriceList(' + pl.id + ', \'' + pl.name.replace(/'/g, "\\'") + '\', ' + pl.adjustment_percent + ', \'' + (pl.description || '').replace(/'/g, "\\'") + '\')" class="text-blue-500 hover:text-blue-700 p-1"><i class="fas fa-edit"></i></button>';
      if (!pl.is_default) {
        html += '<button onclick="event.stopPropagation(); deletePriceList(' + pl.id + ', \'' + pl.name.replace(/'/g, "\\'") + '\')" class="text-red-500 hover:text-red-700 p-1"><i class="fas fa-trash"></i></button>';
      }
      html += '</div></div>'
        + '<div class="flex justify-between items-center">'
        + '<span class="text-2xl font-bold ' + percentColor + '">' + percentText + '</span>'
        + '<span class="text-sm text-gray-500"><i class="fas fa-building mr-1"></i>' + (pl.client_count || 0) + '개 거래처</span>'
        + '</div></div>';
    }
    document.getElementById('priceListCards').innerHTML = html || '<p class="text-gray-400 col-span-3 text-center py-8">등록된 단가표가 없습니다.</p>';
  }).catch(function(e) { console.error('loadPriceLists error:', e); });
}

function selectPriceList(id) {
  selectedPriceListId = id;
  loadPriceLists();
  document.getElementById('priceListDetail').classList.remove('hidden');
  switchTab('clients');
  loadAssignedClients(id);
  loadPreview(id);
}

function switchTab(tab) {
  var tabClients = document.getElementById('tabClients');
  var tabPreview = document.getElementById('tabPreview');
  var contentClients = document.getElementById('tabContentClients');
  var contentPreview = document.getElementById('tabContentPreview');

  if (tab === 'clients') {
    tabClients.className = 'px-4 py-2 text-sm font-medium border-b-2 border-purple-600 text-purple-600';
    tabPreview.className = 'px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700';
    contentClients.classList.remove('hidden');
    contentPreview.classList.add('hidden');
  } else {
    tabPreview.className = 'px-4 py-2 text-sm font-medium border-b-2 border-purple-600 text-purple-600';
    tabClients.className = 'px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700';
    contentPreview.classList.remove('hidden');
    contentClients.classList.add('hidden');
  }
}

function loadAssignedClients(plId) {
  axios.get('/api/clients?limit=500').then(function(res) {
    var clients = (res.data.data && res.data.data.clients) ? res.data.data.clients : [];
    var html = '';
    var count = 0;
    for (var i = 0; i < clients.length; i++) {
      if (clients[i].price_list_id == plId) {
        count++;
        html += '<div class="flex justify-between items-center p-2 bg-gray-50 rounded">'
          + '<span>' + clients[i].client_name + '</span>'
          + '<button onclick="removeClientFromPriceList(' + clients[i].id + ', \'' + clients[i].client_name.replace(/'/g, "\\'") + '\')" class="text-red-400 hover:text-red-600 text-sm"><i class="fas fa-times"></i></button>'
          + '</div>';
      }
    }
    document.getElementById('assignedCount').textContent = count;
    document.getElementById('assignedClientsList').innerHTML = html || '<p class="text-gray-400 text-center py-4">배정된 거래처가 없습니다.</p>';
  }).catch(function(e) { console.error(e); });
}

function loadPreview(plId) {
  axios.get('/api/price-lists/' + plId + '/preview').then(function(res) {
    var items = res.data.items || [];
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var diff = item.adjusted_price - item.base_price;
      var diffColor = diff > 0 ? 'text-red-600' : (diff < 0 ? 'text-blue-600' : 'text-gray-400');
      var diffText = diff > 0 ? '+' + diff.toLocaleString() : diff.toLocaleString();
      html += '<tr class="border-b">'
        + '<td class="px-4 py-2">' + (item.item_code || '') + '</td>'
        + '<td class="px-4 py-2">' + item.item_name + '</td>'
        + '<td class="px-4 py-2">' + (item.unit || 'EA') + '</td>'
        + '<td class="px-4 py-2 text-right">' + (item.base_price || 0).toLocaleString() + '</td>'
        + '<td class="px-4 py-2 text-right font-bold">' + (item.adjusted_price || 0).toLocaleString() + '</td>'
        + '<td class="px-4 py-2 text-right ' + diffColor + '">' + diffText + '</td>'
        + '</tr>';
    }
    document.getElementById('previewTableBody').innerHTML = html || '<tr><td colspan="6" class="text-center py-4 text-gray-400">기본단가가 설정된 품목이 없습니다.</td></tr>';

    var pl = res.data.price_list;
    if (pl) {
      var pct = pl.adjustment_percent > 0 ? '+' + pl.adjustment_percent + '%' : pl.adjustment_percent + '%';
      document.getElementById('detailTitle').innerHTML = escapeHtml(pl.name) + ' <span class="text-base font-normal text-gray-500">(' + pct + ')</span>';
    }
  }).catch(function(e) { console.error(e); });
}

function showAddPriceListModal() {
  document.getElementById('plModalId').value = '';
  document.getElementById('plModalName').value = '';
  document.getElementById('plModalPercent').value = '0';
  document.getElementById('plModalDesc').value = '';
  document.getElementById('priceListModalTitle').textContent = '단가표 추가';
  document.getElementById('priceListModal').classList.remove('hidden');
}

function editPriceList(id, name, pct, desc) {
  document.getElementById('plModalId').value = id;
  document.getElementById('plModalName').value = name;
  document.getElementById('plModalPercent').value = pct;
  document.getElementById('plModalDesc').value = desc || '';
  document.getElementById('priceListModalTitle').textContent = '단가표 수정';
  document.getElementById('priceListModal').classList.remove('hidden');
}

function savePriceList() {
  var id = document.getElementById('plModalId').value;
  var name = document.getElementById('plModalName').value.trim();
  var pct = parseFloat(document.getElementById('plModalPercent').value);
  var desc = document.getElementById('plModalDesc').value.trim();

  if (!name) { showToast('단가표명을 입력해주세요.', 'warning'); return; }
  if (isNaN(pct)) { showToast('조정 비율을 입력해주세요.', 'warning'); return; }

  var data = { name: name, adjustment_percent: pct, description: desc || null };
  var promise;
  if (id) {
    promise = axios.patch('/api/price-lists/' + id, data);
  } else {
    promise = axios.post('/api/price-lists', data);
  }

  promise.then(function() {
    document.getElementById('priceListModal').classList.add('hidden');
    loadPriceLists();
    if (selectedPriceListId) { loadPreview(selectedPriceListId); }
    showToast(id ? '단가표가 수정되었습니다.' : '단가표가 추가되었습니다.', 'success');
  }).catch(function(e) {
    showToast('저장 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  });
}

async function deletePriceList(id, name) {
  if (!(await showConfirm('단가표 "' + name + '"을(를) 삭제하시겠습니까?', { danger: true }))) return;

  axios.delete('/api/price-lists/' + id).then(function() {
    if (selectedPriceListId == id) {
      selectedPriceListId = null;
      document.getElementById('priceListDetail').classList.add('hidden');
    }
    loadPriceLists();
    showToast('단가표가 삭제되었습니다.', 'success');
  }).catch(function(e) {
    showToast('삭제 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  });
}

async function removeClientFromPriceList(clientId, clientName) {
  if (!(await showConfirm(clientName + ' 거래처를 이 단가표에서 제외하시겠습니까?\n기본 단가표로 변경됩니다.'))) return;

  axios.patch('/api/clients/' + clientId, { price_list_id: null }).then(function() {
    loadAssignedClients(selectedPriceListId);
    loadPriceLists();
  }).catch(function(e) { showToast('실패: ' + e.message, 'error'); });
}

function showAssignClientModal() {
  assignClientIds = [];
  document.getElementById('assignClientSearch').value = '';
  document.getElementById('assignClientResults').classList.add('hidden');
  document.getElementById('selectedAssignClients').innerHTML = '';
  document.getElementById('assignClientModal').classList.remove('hidden');
}

var assignSearchTimer = null;
function searchClientsToAssign() {
  clearTimeout(assignSearchTimer);
  var q = document.getElementById('assignClientSearch').value.trim();
  if (q.length < 1) {
    document.getElementById('assignClientResults').classList.add('hidden');
    return;
  }
  assignSearchTimer = setTimeout(function() {
    axios.get('/api/clients?search=' + encodeURIComponent(q) + '&limit=20').then(function(res) {
      var clients = (res.data.data && res.data.data.clients) ? res.data.data.clients : [];
      var html = '';
      for (var i = 0; i < clients.length; i++) {
        var c = clients[i];
        if (assignClientIds.indexOf(c.id) >= 0) continue;
        var plName = c.price_list_name || '미배정';
        html += '<div class="p-2 hover:bg-gray-100 cursor-pointer border-b" onclick="addAssignClient(' + c.id + ', \'' + c.client_name.replace(/'/g, "\\'") + '\')">'
          + '<span class="font-medium">' + c.client_name + '</span>'
          + '<span class="text-xs text-gray-400 ml-2">현재: ' + plName + '</span>'
          + '</div>';
      }
      var el = document.getElementById('assignClientResults');
      el.innerHTML = html || '<p class="p-2 text-gray-400">검색 결과 없음</p>';
      el.classList.remove('hidden');
    }).catch(function(e) { console.error(e); });
  }, 300);
}

function addAssignClient(id, name) {
  if (assignClientIds.indexOf(id) >= 0) return;
  assignClientIds.push(id);
  var el = document.getElementById('selectedAssignClients');
  el.innerHTML += '<span class="inline-flex items-center px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm" data-id="' + id + '">'
    + name + ' <button onclick="removeAssignClient(' + id + ', this.parentElement)" class="ml-1 text-blue-400 hover:text-blue-600">&times;</button></span>';
  document.getElementById('assignClientResults').classList.add('hidden');
  document.getElementById('assignClientSearch').value = '';
}

function removeAssignClient(id, el) {
  var idx = assignClientIds.indexOf(id);
  if (idx >= 0) assignClientIds.splice(idx, 1);
  if (el) el.remove();
}

function confirmAssignClients() {
  if (assignClientIds.length === 0) { showToast('배정할 거래처를 선택해주세요.', 'warning'); return; }
  if (!selectedPriceListId) return;

  axios.post('/api/price-lists/bulk-assign', {
    client_ids: assignClientIds,
    price_list_id: selectedPriceListId
  }).then(function(res) {
    document.getElementById('assignClientModal').classList.add('hidden');
    loadAssignedClients(selectedPriceListId);
    loadPriceLists();
    showToast(assignClientIds.length + '개 거래처가 배정되었습니다.', 'warning');
  }).catch(function(e) {
    showToast('배정 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  });
}

loadPriceLists();
