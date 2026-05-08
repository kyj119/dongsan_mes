// ── 창고 구역 관리 스크립트 ──
var storageZones = [];
var allUsers = [];

function escapeAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function loadStorageZones() {
  // 스켈레톤 로딩 표시
  var tbody = document.getElementById('storageZonesBody');
  if (tbody) {
    tbody.innerHTML = Array(5).fill(
      '<tr class="border-b border-gray-100">' +
        '<td class="px-3 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
        '<td class="px-3 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
        '<td class="px-3 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
        '<td class="px-3 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
        '<td class="px-3 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
        '<td class="px-3 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
        '<td class="px-3 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
      '</tr>'
    ).join('');
  }
  try {
    var [zonesRes, usersRes] = await Promise.all([
      axios.get('/api/storage-zones', { params: { include_inactive: '1' } }),
      axios.get('/api/users')
    ]);
    storageZones = zonesRes.data.success ? zonesRes.data.data : [];
    allUsers = usersRes.data.success ? usersRes.data.data : [];
    renderStorageZones();
  } catch (err) {
    console.error('Storage zones load failed:', err);
  }
}

function renderStorageZones() {
  var tbody = document.getElementById('storageZonesBody');
  var noMsg = document.getElementById('noZonesMsg');
  if (!tbody) return;

  if (storageZones.length === 0) {
    tbody.innerHTML = '';
    if (noMsg) noMsg.classList.remove('hidden');
    return;
  }
  if (noMsg) noMsg.classList.add('hidden');

  tbody.innerHTML = storageZones.map(function(z) {
    var statusBadge = z.is_active
      ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700"><i class="fas fa-check-circle text-[7px] mr-1"></i>활성</span>'
      : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"><i class="fas fa-power-off text-[7px] mr-1"></i>비활성</span>';

    return '<tr class="border-b border-gray-100 hover:bg-gray-50">'
      + '<td class="px-3 py-3 text-sm font-medium text-gray-900">' + escapeAttr(z.zone_name) + '</td>'
      + '<td class="px-3 py-3 text-sm text-gray-500">' + escapeAttr(z.zone_code || '-') + '</td>'
      + '<td class="px-3 py-3 text-sm text-gray-500">' + escapeAttr(z.description || '-') + '</td>'
      + '<td class="px-3 py-3 text-sm text-gray-900">' + escapeAttr(z.manager_name || '미지정') + '</td>'
      + '<td class="px-3 py-3 text-sm text-center tabular-nums text-gray-900">' + (z.item_count || 0) + '</td>'
      + '<td class="px-3 py-3 text-center">' + statusBadge + '</td>'
      + '<td class="px-3 py-3 text-center">'
      + '<div class="flex items-center justify-center gap-1">'
      + '<button onclick="openEditZoneModal(' + z.id + ')" class="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="수정"><svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>'
      + '<button onclick="deleteZone(' + z.id + ')" class="p-1.5 text-gray-400 hover:text-red-600 rounded" title="삭제"><svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>'
      + '</div>'
      + '</td>'
      + '</tr>';
  }).join('');
}

function openAddZoneModal() {
  document.getElementById('zoneModalTitle').textContent = '창고 구역 추가';
  document.getElementById('zoneModalId').value = '';
  document.getElementById('zoneModalName').value = '';
  document.getElementById('zoneModalCode').value = '';
  document.getElementById('zoneModalDesc').value = '';
  document.getElementById('zoneModalSort').value = '0';
  document.getElementById('zoneModalActive').checked = true;

  var managerSelect = document.getElementById('zoneModalManager');
  managerSelect.innerHTML = '<option value="">미지정</option>'
    + allUsers.filter(function(u) { return u.is_active; }).map(function(u) {
      return '<option value="' + u.id + '">' + escapeAttr(u.name) + ' (' + escapeAttr(u.role) + ')</option>';
    }).join('');

  document.getElementById('zoneModal').classList.remove('hidden');
  document.getElementById('zoneModalName').focus();
}

function openEditZoneModal(id) {
  var zone = storageZones.find(function(z) { return z.id === id; });
  if (!zone) return;

  document.getElementById('zoneModalTitle').textContent = '창고 구역 수정';
  document.getElementById('zoneModalId').value = zone.id;
  document.getElementById('zoneModalName').value = zone.zone_name;
  document.getElementById('zoneModalCode').value = zone.zone_code || '';
  document.getElementById('zoneModalDesc').value = zone.description || '';
  document.getElementById('zoneModalSort').value = zone.sort_order || 0;
  document.getElementById('zoneModalActive').checked = !!zone.is_active;

  var managerSelect = document.getElementById('zoneModalManager');
  managerSelect.innerHTML = '<option value="">미지정</option>'
    + allUsers.filter(function(u) { return u.is_active; }).map(function(u) {
      return '<option value="' + u.id + '"' + (u.id === zone.manager_id ? ' selected' : '') + '>'
        + escapeAttr(u.name) + ' (' + escapeAttr(u.role) + ')</option>';
    }).join('');

  document.getElementById('zoneModal').classList.remove('hidden');
  document.getElementById('zoneModalName').focus();
}

function closeZoneModal() {
  document.getElementById('zoneModal').classList.add('hidden');
}

async function saveZone() {
  var id = document.getElementById('zoneModalId').value;
  var payload = {
    zone_name: document.getElementById('zoneModalName').value.trim(),
    zone_code: document.getElementById('zoneModalCode').value.trim() || null,
    description: document.getElementById('zoneModalDesc').value.trim() || null,
    manager_id: parseInt(document.getElementById('zoneModalManager').value) || null,
    sort_order: parseInt(document.getElementById('zoneModalSort').value) || 0,
    is_active: document.getElementById('zoneModalActive').checked ? 1 : 0
  };

  if (!payload.zone_name) {
    showToast('구역명을 입력해주세요.', 'warning');
    return;
  }

  var btn = document.getElementById('zoneModalSaveBtn');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try {
    var res;
    if (id) {
      res = await axios.put('/api/storage-zones/' + id, payload);
    } else {
      res = await axios.post('/api/storage-zones', payload);
    }
    if (res.data.success) {
      closeZoneModal();
      await loadStorageZones();
    } else {
      showToast(res.data.error || '저장 실패', 'error');
    }
  } catch (err) {
    showToast('저장 실패: ' + (err.response?.data?.error || err.message), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '저장';
  }
}

async function deleteZone(id) {
  var zone = storageZones.find(function(z) { return z.id === id; });
  if (!zone) return;
  if (!(await showConfirm('"' + zone.zone_name + '" 구역을 삭제하시겠습니까?', { danger: true }))) return;

  try {
    var res = await axios.delete('/api/storage-zones/' + id);
    if (res.data.success) {
      await loadStorageZones();
    } else {
      showToast(res.data.error || '삭제 실패', 'error');
    }
  } catch (err) {
    showToast('삭제 실패: ' + (err.response?.data?.error || err.message), 'error');
  }
}

// 초기 로드
loadStorageZones();
