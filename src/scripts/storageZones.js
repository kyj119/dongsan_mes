// ── 창고 구역 관리 스크립트 ──
var storageZones = [];
var allUsers = [];
var allEntities = [];
var currentEntityFilter = 0; // 0 = 전체

function escapeAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function loadStorageZones() {
  var tbody = document.getElementById('storageZonesBody');
  if (tbody) {
    tbody.innerHTML = Array(5).fill(
      '<tr class="border-b border-gray-100">' +
        '<td class="px-3 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>'.repeat(8) +
      '</tr>'
    ).join('');
  }
  try {
    var [zonesRes, usersRes, entRes] = await Promise.all([
      axios.get('/api/storage-zones', { params: { include_inactive: '1', all_entities: '1' } }),
      axios.get('/api/users'),
      axios.get('/api/auth/entities')
    ]);
    storageZones = zonesRes.data.success ? zonesRes.data.data : [];
    allUsers = usersRes.data.success ? usersRes.data.data : [];
    allEntities = entRes.data.success ? entRes.data.data : [];

    // 법인 필터 드롭다운 초기화
    var filterEl = document.getElementById('entityFilter');
    if (filterEl && allEntities.length > 0) {
      filterEl.innerHTML = '<option value="0">전체 법인</option>'
        + allEntities.map(function(e) {
          return '<option value="' + e.id + '">' + escapeAttr(e.short_name || e.name) + '</option>';
        }).join('');
    }

    renderStorageZones();
  } catch (err) {
    console.error('Storage zones load failed:', err);
  }
}

function onEntityFilterChange() {
  currentEntityFilter = parseInt(document.getElementById('entityFilter').value) || 0;
  renderStorageZones();
  if (szCurrentTab === 'layout') szRenderLayout();
}

function renderStorageZones() {
  var tbody = document.getElementById('storageZonesBody');
  var noMsg = document.getElementById('noZonesMsg');
  if (!tbody) return;

  var filtered = currentEntityFilter > 0
    ? storageZones.filter(function(z) { return z.entity_id === currentEntityFilter; })
    : storageZones;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (noMsg) noMsg.classList.remove('hidden');
    return;
  }
  if (noMsg) noMsg.classList.add('hidden');

  tbody.innerHTML = filtered.map(function(z) {
    var statusBadge = z.is_active
      ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700"><i class="fas fa-check-circle text-[7px] mr-1"></i>활성</span>'
      : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"><i class="fas fa-power-off text-[7px] mr-1"></i>비활성</span>';

    var defaultBadge = z.is_default
      ? ' <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">기본</span>'
      : '';

    var entityName = z.entity_name || allEntities.find(function(e) { return e.id === z.entity_id; })?.short_name || '-';

    return '<tr class="border-b border-gray-100 hover:bg-gray-50">'
      + '<td class="px-3 py-3 text-sm text-gray-600">' + escapeAttr(entityName) + '</td>'
      + '<td class="px-3 py-3 text-sm font-medium text-gray-900" title="' + escapeAttr(z.zone_name || '') + '">' + escapeAttr(z.zone_name) + defaultBadge
      + (z.bounds ? '<div class="text-[10px] text-blue-500 font-normal mt-0.5"><i class="fas fa-map-marker-alt mr-0.5"></i>배치도 배치됨</div>' : '')
      + '</td>'
      + '<td class="px-3 py-3 text-sm text-gray-500">' + escapeAttr(z.zone_code || '-') + '</td>'
      + '<td class="px-3 py-3 text-sm text-gray-500" title="' + escapeAttr(z.description || '') + '">' + escapeAttr(z.description || '-') + '</td>'
      + '<td class="px-3 py-3 text-sm text-gray-900" title="' + escapeAttr(z.manager_name || '') + '">' + escapeAttr(z.manager_name || '미지정') + '</td>'
      + '<td class="px-3 py-3 text-sm text-center tabular-nums text-gray-900">' + (z.item_count || 0) + '</td>'
      + '<td class="px-3 py-3 text-center">' + statusBadge + '</td>'
      + '<td class="px-3 py-3 text-center">'
      + '<div class="flex items-center justify-center gap-1">'
      + '<button onclick="openEditZoneModal(' + z.id + ')" class="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="수정"><i class="fas fa-edit"></i></button>'
      + '<button onclick="deleteZone(' + z.id + ')" class="p-1.5 text-gray-400 hover:text-red-600 rounded" title="삭제"><i class="fas fa-trash-alt"></i></button>'
      + '</div>'
      + '</td>'
      + '</tr>';
  }).join('');
}

function populateEntitySelect(selectedId) {
  var sel = document.getElementById('zoneModalEntity');
  if (!sel) return;
  sel.innerHTML = allEntities.map(function(e) {
    return '<option value="' + e.id + '"' + (e.id === selectedId ? ' selected' : '') + '>'
      + escapeAttr(e.short_name || e.name) + '</option>';
  }).join('');
}

function populateManagerSelect(selectedId) {
  var sel = document.getElementById('zoneModalManager');
  if (!sel) return;
  sel.innerHTML = '<option value="">미지정</option>'
    + allUsers.filter(function(u) { return u.is_active; }).map(function(u) {
      return '<option value="' + u.id + '"' + (u.id === selectedId ? ' selected' : '') + '>'
        + escapeAttr(u.name) + ' (' + escapeAttr((window.ROLE_NAMES && window.ROLE_NAMES[u.role]) || u.role) + ')</option>';
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
  document.getElementById('zoneModalDefault').checked = false;
  document.getElementById('zoneModalColor').value = '#3B82F6';

  // 법인 기본값: 현재 필터 또는 첫 법인
  var defaultEntity = currentEntityFilter > 0 ? currentEntityFilter : (allEntities[0]?.id || 1);
  populateEntitySelect(defaultEntity);
  populateManagerSelect(null);

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
  document.getElementById('zoneModalDefault').checked = !!zone.is_default;
  document.getElementById('zoneModalColor').value = (zone.color && /^#[0-9a-fA-F]{3,6}$/.test(zone.color)) ? zone.color : '#3B82F6';

  populateEntitySelect(zone.entity_id || 1);
  populateManagerSelect(zone.manager_id);

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
    is_active: document.getElementById('zoneModalActive').checked ? 1 : 0,
    entity_id: parseInt(document.getElementById('zoneModalEntity').value) || 1,
    is_default: document.getElementById('zoneModalDefault').checked ? 1 : 0,
    color: document.getElementById('zoneModalColor').value || '#3B82F6'
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
      if (szCurrentTab === 'layout') szLoadLayout();
      showToast(id ? '구역이 수정되었습니다.' : '구역이 추가되었습니다.', 'success');
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
      if (szCurrentTab === 'layout') szLoadLayout();
      showToast('구역이 삭제되었습니다.', 'success');
    } else {
      showToast(res.data.error || '삭제 실패', 'error');
    }
  } catch (err) {
    showToast('삭제 실패: ' + (err.response?.data?.error || err.message), 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 배치도 탭 (0440: 창고 전용 도면 + storage_zones.bounds 직접 배치)
// 좌표계 = 캔버스 상대 % {x,y,width,height}. 함수/변수는 sz- prefix (전역 스코프 충돌 방지)
// ═══════════════════════════════════════════════════════════════════════════

var szCurrentTab = 'list';
var szLayoutZones = [];   // layout-data 응답 (bounds 파싱됨, null=미배치)
var szEditMode = false;
var szHasPlan = false;
var szPlanObjUrl = null;

function szSwitchTab(tab) {
  szCurrentTab = tab;
  var listPanel = document.getElementById('szPanelList');
  var layoutPanel = document.getElementById('szPanelLayout');
  var assignPanel = document.getElementById('szPanelAssign');
  if (listPanel) listPanel.classList.toggle('hidden', tab !== 'list');
  if (layoutPanel) layoutPanel.classList.toggle('hidden', tab !== 'layout');
  if (assignPanel) assignPanel.classList.toggle('hidden', tab !== 'assign');
  var active = 'px-4 py-2 text-sm font-semibold text-blue-600 border-b-2 border-blue-600 -mb-px';
  var idle = 'px-4 py-2 text-sm font-medium text-gray-500 border-b-2 border-transparent -mb-px hover:text-gray-700';
  var tabList = document.getElementById('szTabList');
  var tabLayout = document.getElementById('szTabLayout');
  var tabAssign = document.getElementById('szTabAssign');
  if (tabList) tabList.className = tab === 'list' ? active : idle;
  if (tabLayout) tabLayout.className = tab === 'layout' ? active : idle;
  if (tabAssign) tabAssign.className = tab === 'assign' ? active : idle;
  if (tab === 'layout') szLoadLayout();
  if (tab === 'assign') szAssignInit();
}

async function szLoadLayout() {
  try {
    var res = await axios.get('/api/storage-zones/layout-data');
    var d = res.data && res.data.data ? res.data.data : {};
    szLayoutZones = d.zones || [];
    szLoadPlan(!!d.background);
  } catch (e) {
    console.error('[storageZones] layout-data load failed:', e);
    szLayoutZones = [];
  }
  szRenderLayout();
}

function szParseBounds(b) {
  if (!b) return null;
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (e) { return null; } }
  return b;
}

function szHexToRgba(hex, alpha) {
  var h = (hex || '#3B82F6').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var r = parseInt(h.substring(0, 2), 16) || 0;
  var g = parseInt(h.substring(2, 4), 16) || 0;
  var bl = parseInt(h.substring(4, 6), 16) || 0;
  return 'rgba(' + r + ',' + g + ',' + bl + ',' + alpha + ')';
}

function szFilteredZones() {
  return currentEntityFilter > 0
    ? szLayoutZones.filter(function(z) { return z.entity_id === currentEntityFilter; })
    : szLayoutZones;
}

function szRenderLayout() {
  var container = document.getElementById('szLayoutZones');
  if (!container) { console.warn('[storageZones] #szLayoutZones not found'); return; }
  var filtered = szFilteredZones();
  var placed = filtered.filter(function(z) { return szParseBounds(z.bounds); });
  // inline style로 토글 (class hidden은 inline display:flex에 지므로 사용 금지)
  var emptyEl = document.getElementById('szLayoutEmpty');
  if (emptyEl) emptyEl.style.display = placed.length > 0 ? 'none' : 'flex';

  var fillAlpha = szHasPlan ? 0.03 : 0.08;
  var multiEntity = currentEntityFilter === 0 && allEntities.length > 1;
  container.innerHTML = placed.map(function(z) {
    var b = szParseBounds(z.bounds);
    var color = z.color || '#3B82F6';
    var topRight;
    if (szEditMode) {
      topRight = '<span style="position:absolute;right:3px;top:3px;display:flex;gap:2px;">'
        + '<button data-sz-btn onclick="event.stopPropagation();openEditZoneModal(' + z.id + ')" title="이름·색상 편집" style="font-size:9px;background:rgba(255,255,255,0.95);border:1px solid #e5e7eb;border-radius:3px;width:18px;height:18px;line-height:1;cursor:pointer;color:#475569;"><i class="fas fa-pen"></i></button>'
        + '<button data-sz-btn onclick="event.stopPropagation();szUnplaceZone(' + z.id + ')" title="도면에서 내리기 (창고는 유지)" style="font-size:9px;background:rgba(255,255,255,0.95);border:1px solid #fde68a;border-radius:3px;width:18px;height:18px;line-height:1;cursor:pointer;color:#d97706;"><i class="fas fa-arrow-down"></i></button>'
        + '</span>';
    } else {
      var invItems = z.inv_item_count || 0;
      var invShort = z.inv_shortage_count || 0;
      topRight = invItems > 0
        ? '<span style="position:absolute;right:4px;top:3px;font-size:10px;font-weight:600;background:rgba(255,255,255,0.92);padding:1px 6px;border-radius:3px;border:1px solid ' + (invShort > 0 ? '#fecaca' : '#bbf7d0') + ';color:' + (invShort > 0 ? '#dc2626' : '#16a34a') + ';"><i class="fas fa-boxes" style="margin-right:2px;"></i>' + invItems + (invShort > 0 ? ' · <i class="fas fa-exclamation-triangle" style="margin-right:2px;"></i>' + invShort : '') + '</span>'
        : '';
    }
    var resizeHandle = szEditMode
      ? '<div data-sz-resize style="position:absolute;right:-1px;bottom:-1px;width:14px;height:14px;background:' + color + ';border:2px solid #fff;border-radius:3px;cursor:se-resize;"></div>'
      : '';
    var label = escapeAttr(z.zone_name)
      + (multiEntity && z.entity_name ? ' <span style="font-weight:400;color:#94a3b8;">· ' + escapeAttr(z.entity_name) + '</span>' : '');
    return '<div data-sz-box style="position:absolute;'
      + 'left:' + b.x + '%;top:' + b.y + '%;width:' + b.width + '%;height:' + b.height + '%;'
      + 'border:2px solid ' + color + ';background:' + szHexToRgba(color, fillAlpha) + ';border-radius:6px;'
      + 'cursor:' + (szEditMode ? 'move' : 'pointer') + ';"'
      + (szEditMode ? '' : ' onclick="szShowZoneStock(' + z.id + ')" title="재고 상세 보기"') + '>'
      + '<span style="position:absolute;left:4px;top:3px;font-size:11px;font-weight:700;color:' + color + ';background:rgba(255,255,255,0.82);padding:1px 5px;border-radius:3px;white-space:nowrap;">' + label + '</span>'
      + topRight
      + resizeHandle
      + '</div>';
  }).join('');

  if (szEditMode) {
    Array.prototype.forEach.call(container.children, function(div, i) {
      if (placed[i]) szBindZoneEdit(div, placed[i]);
    });
  }
  szRenderUnplacedTray(filtered);
}

// 미배치 창고 트레이 (bounds=null). 편집모드에서 "배치" 클릭 → 캔버스 중앙 기본 영역
function szRenderUnplacedTray(filtered) {
  var tray = document.getElementById('szUnplacedTray');
  if (!tray) return;
  var unplaced = filtered.filter(function(z) { return !szParseBounds(z.bounds); });
  if (unplaced.length === 0) { tray.innerHTML = ''; return; }
  tray.innerHTML = '<div class="text-xs font-semibold text-gray-500 mb-1.5"><i class="fas fa-inbox mr-1"></i>미배치 창고 (' + unplaced.length + ')</div>'
    + '<div class="flex flex-wrap gap-1.5">'
    + unplaced.map(function(z) {
      return '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs" style="border-color:' + (z.color || '#3B82F6') + ';color:#475569;">'
        + '<span class="w-2 h-2 rounded-full inline-block" style="background:' + (z.color || '#3B82F6') + ';"></span>'
        + escapeAttr(z.zone_name)
        + (z.entity_name ? '<span class="text-gray-400">' + escapeAttr(z.entity_name) + '</span>' : '')
        + (szEditMode ? '<button onclick="szPlaceZone(' + z.id + ')" class="ml-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium">배치</button>' : '')
        + '</span>';
    }).join('')
    + '</div>';
}

// ── 편집 모드: 드래그(이동)·리사이즈 → PUT /:id/bounds ──────────────────────

var szZoneDrag = null; // { div, zoneId, b, mode:'move'|'resize', startX, startY, oX, oY, oW, oH, moved }

function szBindZoneEdit(div, zone) {
  div.addEventListener('mousedown', function(e) {
    if (e.target.closest('[data-sz-btn]')) return;
    var isResize = !!e.target.closest('[data-sz-resize]');
    e.preventDefault();
    var b = szParseBounds(zone.bounds) || { x: 38, y: 40, width: 24, height: 18 };
    szZoneDrag = {
      div: div, zoneId: zone.id, b: b, mode: isResize ? 'resize' : 'move',
      startX: e.clientX, startY: e.clientY,
      oX: b.x, oY: b.y, oW: b.width, oH: b.height, moved: false
    };
  });
}

document.addEventListener('mousemove', function(e) {
  if (!szZoneDrag) return;
  var canvas = document.getElementById('szLayoutCanvas');
  if (!canvas) return;
  var cr = canvas.getBoundingClientRect();
  var dx = ((e.clientX - szZoneDrag.startX) / cr.width) * 100;
  var dy = ((e.clientY - szZoneDrag.startY) / cr.height) * 100;
  var b = szZoneDrag.b;
  if (szZoneDrag.mode === 'move') {
    b.x = Math.max(0, Math.min(100 - b.width, szZoneDrag.oX + dx));
    b.y = Math.max(0, Math.min(100 - b.height, szZoneDrag.oY + dy));
    szZoneDrag.div.style.left = b.x + '%';
    szZoneDrag.div.style.top = b.y + '%';
  } else {
    b.width = Math.max(5, Math.min(100 - b.x, szZoneDrag.oW + dx));
    b.height = Math.max(5, Math.min(100 - b.y, szZoneDrag.oH + dy));
    szZoneDrag.div.style.width = b.width + '%';
    szZoneDrag.div.style.height = b.height + '%';
  }
  if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) szZoneDrag.moved = true;
});

document.addEventListener('mouseup', async function() {
  if (!szZoneDrag) return;
  var zd = szZoneDrag; szZoneDrag = null;
  if (!zd.moved) return;
  var boundsStr = JSON.stringify({
    x: Math.round(zd.b.x * 10) / 10, y: Math.round(zd.b.y * 10) / 10,
    width: Math.round(zd.b.width * 10) / 10, height: Math.round(zd.b.height * 10) / 10
  });
  var z = szLayoutZones.find(function(zz) { return zz.id === zd.zoneId; });
  if (z) z.bounds = JSON.parse(boundsStr);
  try {
    await axios.put('/api/storage-zones/' + zd.zoneId + '/bounds', { bounds: boundsStr });
  } catch (err) {
    console.error('[storageZones] bounds save error', err);
    showToast('구역 위치 저장 실패', 'error');
  }
});

// 목록 탭 데이터(storageZones)의 bounds도 동기화 — '배치도 배치됨' 마커 정합
function szSyncListBounds(id, bounds) {
  var lz = storageZones.find(function(zz) { return zz.id === id; });
  if (lz) { lz.bounds = bounds; renderStorageZones(); }
}

async function szPlaceZone(id) {
  var boundsStr = JSON.stringify({ x: 38, y: 40, width: 24, height: 18 });
  try {
    await axios.put('/api/storage-zones/' + id + '/bounds', { bounds: boundsStr });
    var z = szLayoutZones.find(function(zz) { return zz.id === id; });
    if (z) z.bounds = JSON.parse(boundsStr);
    szSyncListBounds(id, boundsStr);
    szRenderLayout();
  } catch (err) {
    showToast('배치 실패: ' + (err.response?.data?.error || err.message), 'error');
  }
}

async function szUnplaceZone(id) {
  var z = szLayoutZones.find(function(zz) { return zz.id === id; });
  if (!(await showConfirm('"' + (z ? z.zone_name : '구역') + '"를 도면에서 내리시겠습니까? (창고와 재고는 유지됩니다)'))) return;
  try {
    await axios.put('/api/storage-zones/' + id + '/bounds', { bounds: null });
    if (z) z.bounds = null;
    szSyncListBounds(id, null);
    szRenderLayout();
  } catch (err) {
    showToast('도면에서 내리기 실패: ' + (err.response?.data?.error || err.message), 'error');
  }
}

function szToggleEdit() {
  szEditMode = !szEditMode;
  var btn = document.getElementById('btnSzEditLayout');
  if (btn) {
    if (szEditMode) {
      btn.innerHTML = '<i class="fas fa-lock-open"></i><span>편집 중</span>';
      btn.className = 'px-3 py-1 text-xs rounded border border-blue-600 bg-blue-600 text-white flex items-center gap-1';
    } else {
      btn.innerHTML = '<i class="fas fa-lock"></i><span>배치 편집</span>';
      btn.className = 'px-3 py-1 text-xs rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 flex items-center gap-1';
    }
  }
  var upBtn = document.getElementById('btnSzUploadPlan');
  var delBtn = document.getElementById('btnSzDeletePlan');
  if (upBtn) { upBtn.classList.toggle('hidden', !szEditMode); upBtn.classList.toggle('flex', szEditMode); }
  if (delBtn) { delBtn.classList.toggle('hidden', !(szEditMode && szHasPlan)); delBtn.classList.toggle('flex', szEditMode && szHasPlan); }
  szRenderLayout();
}

// ── 구역 재고 상세 모달 (클릭) ───────────────────────────────────────────────

async function szShowZoneStock(zoneId) {
  var modal = document.getElementById('szZoneInvModal');
  var body = document.getElementById('szZoneInvBody');
  var titleEl = document.getElementById('szZoneInvTitle');
  if (!modal || !body) { console.warn('[storageZones] #szZoneInvModal not found'); return; }
  var zone = szLayoutZones.find(function(z) { return z.id === zoneId; });
  if (titleEl) titleEl.textContent = (zone ? zone.zone_name : '구역') + ' — 재고';
  body.innerHTML = '<div class="text-center py-6 text-gray-400"><i class="fas fa-spinner fa-spin"></i></div>';
  modal.classList.remove('hidden');
  try {
    var res = await axios.get('/api/storage-zones/' + zoneId + '/stock');
    var d = res.data.success ? res.data.data : null;
    var items = d && d.items ? d.items : [];
    var short = items.filter(function(it) { return it.safe_stock > 0 && it.quantity <= it.safe_stock; }).length;
    var head = '<div class="flex items-center gap-2 mb-2">'
      + (d && d.manager_name ? '<span class="text-xs text-gray-400"><i class="fas fa-user mr-0.5"></i>' + escapeAttr(d.manager_name) + '</span>' : '')
      + (short > 0 ? '<span class="text-xs text-red-600 font-medium"><i class="fas fa-exclamation-triangle mr-0.5"></i>부족 ' + short + '</span>' : '')
      + '<span class="text-xs text-gray-400 ml-auto">' + items.length + '개 품목</span>'
      + '<button onclick="szStartZoneCount(' + zoneId + ')" class="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium whitespace-nowrap" title="이 창고 구역을 대상으로 재고 실사를 시작합니다"><i class="fas fa-clipboard-check mr-1"></i>이 구역 실사</button>'
      + '</div>';
    if (!items.length) {
      body.innerHTML = head + '<div class="text-center py-8 text-gray-400 text-sm">이 창고에 귀속된 재고가 없습니다.</div>';
      return;
    }
    var rows = items.map(function(it) {
      var low = it.safe_stock > 0 && it.quantity <= it.safe_stock;
      return '<tr class="border-b border-gray-50"><td class="py-1" title="' + escapeAttr(it.item_name || '') + '">' + escapeAttr(it.item_name || '') + '</td>'
        // inventory.quantity 는 base 수량이다 — 관리단위 라벨을 그냥 붙이면 롤 원단이 "800 롤"로 읽힌다.
        // 형제 화면(inventory.js·inventoryTx.js·inventoryDashboard.js:146)과 같은 SSOT 헬퍼로 통일.
        // ⚠️ 아직 완전한 수정이 아니다 — ①라우트(routes/storageZones.ts:266 SELECT)가 base_unit·pack_size·
        //    stock_mode 를 안 실어 보내고 ②UOM_JS 가 pages/inventory.ts 에만 주입돼 이 페이지엔 헬퍼가 없다.
        //    둘 중 하나라도 빠지면 가드가 종전 표기로 폴백한다(= 회귀 없음). 둘 다 채우면 자동으로 올바르게 표시된다.
        + '<td class="py-1 text-right font-semibold ' + (low ? 'text-red-600' : 'text-gray-700') + '">'
        + escapeAttr(window.uomFormatStock ? window.uomFormatStock(it.quantity || 0, it) : ((it.quantity || 0) + ' ' + (it.unit || ''))) + '</td>'
        + '<td class="py-1 text-right text-gray-400">' + (it.safe_stock || 0) + '</td></tr>';
    }).join('');
    body.innerHTML = head
      + '<table class="w-full text-xs"><thead><tr class="text-gray-400 border-b"><th class="text-left py-1 font-medium">품목</th><th class="text-right py-1 font-medium">현재고</th><th class="text-right py-1 font-medium">안전</th></tr></thead><tbody>'
      + rows + '</tbody></table>';
  } catch (e) {
    body.innerHTML = '<div class="text-center py-6 text-red-500 text-sm">재고 로딩 실패</div>';
  }
}

function szCloseZoneInv() {
  var m = document.getElementById('szZoneInvModal');
  if (m) m.classList.add('hidden');
}

// 구역 기반 재고 실사 진입 (구 equipment 배치도 eqStartZoneCount 이관)
async function szStartZoneCount(storageZoneId) {
  try {
    var res = await axios.post('/api/inventory-counts', { storage_zone_id: storageZoneId });
    if (res.data && res.data.success && res.data.data) {
      var d = res.data.data;
      showToast('구역 실사 생성: ' + (d.storage_zone_name || d.count_number || '') + (d.item_count != null ? ' (' + d.item_count + '건)' : ''), 'success');
      window.location.href = '/inventory?openCount=' + d.id + '#tab=count';
    } else {
      showToast('구역 실사 생성 실패', 'error');
    }
  } catch (e) {
    var msg = e.response?.data?.error || e.message;
    if (e.response && e.response.status === 403) msg = '권한이 없습니다 (관리자/매니저 전용).';
    showToast('구역 실사 생성 실패: ' + msg, 'error');
  }
}

// ── 도면 배경 (R2 blob — 인증 헤더 경유라 <img src> 직접 불가) ────────────────

function szLoadPlan(hasKey) {
  var bg = document.getElementById('szLayoutBg');
  if (!bg) return;
  szHasPlan = !!hasKey;
  if (!szHasPlan) {
    bg.style.backgroundImage = '';
    if (szPlanObjUrl) { URL.revokeObjectURL(szPlanObjUrl); szPlanObjUrl = null; }
  } else {
    axios.get('/api/storage-zones/background-image', { responseType: 'blob' }).then(function(imgRes) {
      if (szPlanObjUrl) URL.revokeObjectURL(szPlanObjUrl);
      szPlanObjUrl = URL.createObjectURL(imgRes.data);
      bg.style.backgroundImage = 'url(' + szPlanObjUrl + ')';
    }).catch(function() { szHasPlan = false; });
  }
  var delBtn = document.getElementById('btnSzDeletePlan');
  if (delBtn) delBtn.classList.toggle('hidden', !(szEditMode && szHasPlan));
}

function szOnPlanSelected(input) {
  var file = input.files && input.files[0];
  if (file) szUploadPlan(file);
  input.value = '';
}

async function szUploadPlan(file) {
  var fd = new FormData();
  fd.append('file', file);
  try {
    await axios.post('/api/storage-zones/background', fd);
    showToast('도면을 업로드했습니다.', 'success');
    await szLoadLayout();
  } catch (e) {
    showToast('도면 업로드 실패: ' + (e.response?.data?.error || e.message), 'error');
  }
}

async function szDeletePlan() {
  if (!(await showConfirm('창고 도면 배경을 삭제하시겠습니까?', { danger: true }))) return;
  try {
    await axios.delete('/api/storage-zones/background');
    showToast('도면을 삭제했습니다.', 'success');
    await szLoadLayout();
  } catch (e) {
    showToast('삭제 실패', 'error');
  }
}

// 초기 로드 (?tab=layout 딥링크 지원)
loadStorageZones();
var _szUrlTab = new URLSearchParams(window.location.search).get('tab');
if (_szUrlTab === 'layout' || _szUrlTab === 'assign') szSwitchTab(_szUrlTab);

// ── 품목 배정 탭 (2026-09-04) ────────────────────────────────────────────────
// 「이 구역에 이 품목이 있다」의 정본 = `inventory` 행. 구역 실사가 그 행을 JOIN 하므로
// 여기서 넣고 뺀 것이 곧 실사표가 된다. `items.storage_zone_id` 는 「입고 기본 창고」로 의미를 좁혔고
// 이 화면은 그 칸을 건드리지 않는다.

var _szAssign = { zoneId: null, held: [], tree: [], items: [], nav: [], sel: {}, cat: '', grp: '', timer: null };

async function szAssignInit() {
  var sel = document.getElementById('szAssignZone');
  if (!sel) { console.warn('[storageZones] #szAssignZone not found'); return; }
  if (sel.options.length === 0) {
    try {
      var r = await axios.get('/api/storage-zones');
      var list = (r.data && r.data.data) || [];
      // 담당자를 같이 보여 준다 — 누구 구역인지 모르면 남의 구역을 고치게 된다.
      list.forEach(function (z) {
        var o = document.createElement('option');
        o.value = z.id;
        o.textContent = (z.zone_name || '') + (z.manager_name ? ' · ' + z.manager_name : ' · 담당 미지정');
        sel.appendChild(o);
      });
    } catch (e) { console.warn('[storageZones] 구역 목록 로드 실패', e); }
  }
  if (sel.options.length > 0) await szAssignLoad();
}

async function szAssignLoad() {
  var sel = document.getElementById('szAssignZone');
  if (!sel || !sel.value) return;
  _szAssign.zoneId = Number(sel.value);
  _szAssign.sel = {};
  _szAssign.cat = '';
  _szAssign.grp = '';
  await Promise.all([szAssignLoadHeld(), szAssignLoadCand()]);
}

async function szAssignLoadHeld() {
  var box = document.getElementById('szAssignHeld');
  if (!box) return;
  box.innerHTML = '<div class="py-6 text-center text-gray-400 text-sm"><i class="fas fa-spinner fa-spin"></i></div>';
  try {
    var r = await axios.get('/api/storage-zones/' + _szAssign.zoneId + '/stock');
    var d = (r.data && r.data.data) || {};
    _szAssign.held = d.items || [];
    var meta = document.getElementById('szAssignMeta');
    if (meta) meta.textContent = (d.manager_name ? '담당 ' + d.manager_name + ' · ' : '') + _szAssign.held.length + '품목';
    szAssignRenderHeld();
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    box.innerHTML = '<div class="py-6 text-center text-red-500 text-sm">' + escapeAttr(msg) + '</div>';
  }
}

function szAssignRenderHeld() {
  var box = document.getElementById('szAssignHeld');
  var cnt = document.getElementById('szAssignHeldCount');
  if (!box) return;
  var items = _szAssign.held;
  // 재고 0 인 것부터 보여 준다 — 뺄 수 있는 것이 그것뿐이고, 대개 그게 정리 대상이다.
  var zero = items.filter(function (it) { return Number(it.quantity) === 0; });
  if (cnt) cnt.textContent = items.length + '품목' + (zero.length ? ' · 재고 0 이 ' + zero.length + '개' : '');
  if (!items.length) {
    box.innerHTML = '<div class="py-8 text-center text-gray-400 text-sm">이 구역에 배정된 품목이 없습니다.</div>';
    return;
  }
  var sorted = items.slice().sort(function (a, b) {
    var az = Number(a.quantity) === 0 ? 0 : 1, bz = Number(b.quantity) === 0 ? 0 : 1;
    if (az !== bz) return az - bz;
    return String(a.item_name || '').localeCompare(String(b.item_name || ''));
  });
  box.innerHTML = sorted.map(function (it) {
    var q = Number(it.quantity) || 0;
    var canRemove = (q === 0);
    var qty = window.uomFormatStock ? window.uomFormatStock(q, it) : (q + ' ' + (it.unit || ''));
    return '<div class="flex items-center gap-2 py-1.5 border-b border-gray-50 text-xs">'
      + '<span class="flex-1 min-w-0 truncate" title="' + escapeAttr(it.item_name || '') + '">' + escapeAttr(it.item_name || '') + '</span>'
      + '<span class="' + (q === 0 ? 'text-gray-400' : (q < 0 ? 'text-red-600 font-semibold' : 'text-gray-700')) + ' tabular-nums whitespace-nowrap">' + escapeAttr(qty) + '</span>'
      + (canRemove
          ? '<button onclick="szAssignRemove(' + it.item_id + ')" class="text-gray-400 hover:text-red-600 px-1" title="이 구역에서 빼기">✕</button>'
          : '<span class="px-1 text-gray-300" title="재고가 남아 있어 뺄 수 없습니다 — 다른 구역으로 옮기거나 0으로 맞추세요">✕</span>')
      + '</div>';
  }).join('');
}

async function szAssignRemove(itemId) {
  try {
    await axios.delete('/api/storage-zones/' + _szAssign.zoneId + '/items/' + itemId);
    showToast('구역에서 뺐습니다', 'success');
    await Promise.all([szAssignLoadHeld(), szAssignLoadCand()]);
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    showToast(msg, 'error');
  }
}

function szAssignSearchInput() {
  if (_szAssign.timer) clearTimeout(_szAssign.timer);
  _szAssign.timer = setTimeout(szAssignLoadCand, 300);
}

async function szAssignLoadCand() {
  var box = document.getElementById('szAssignCand');
  if (!box) return;
  box.innerHTML = '<div class="py-6 text-center text-gray-400 text-sm"><i class="fas fa-spinner fa-spin"></i></div>';
  var qEl = document.getElementById('szAssignSearch');
  try {
    var r = await axios.get('/api/storage-zones/' + _szAssign.zoneId + '/candidates', {
      params: { q: qEl ? qEl.value.trim() : '', category: _szAssign.cat, group: _szAssign.grp }
    });
    var d = (r.data && r.data.data) || {};
    _szAssign.tree = d.tree || [];
    _szAssign.items = d.items || [];
    szAssignRenderCand(!!d.truncated);
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    box.innerHTML = '<div class="py-6 text-center text-red-500 text-sm">' + escapeAttr(msg) + '</div>';
  }
}

function szAssignRenderCand(truncated) {
  var box = document.getElementById('szAssignCand');
  if (!box) return;
  var byCat = {}, order = [];
  _szAssign.tree.forEach(function (t) {
    if (!byCat[t.category]) { byCat[t.category] = []; order.push(t.category); }
    byCat[t.category].push(t);
  });

  // onclick 에 한글 그룹명을 끼우면 따옴표가 깨진다 → **인덱스로** 부른다.
  _szAssign.nav = [];
  var html = order.map(function (cat) {
    var rows = byCat[cat];
    var total = rows.reduce(function (a, b) { return a + (Number(b.n) || 0); }, 0);
    var open = (_szAssign.cat === cat);
    var ci = _szAssign.nav.push({ cat: cat, grp: '' }) - 1;
    var head = '<button onclick="szAssignPick(' + ci + ')" class="w-full text-left px-2 py-1 rounded text-xs font-semibold '
      + (open ? 'bg-blue-50' : '') + '">' + (open ? '▾ ' : '▸ ') + escapeAttr(cat)
      + ' <span class="text-gray-400 font-normal">' + total + '</span></button>';
    if (!open) return head;
    var kids = rows.map(function (t) {
      var gi = _szAssign.nav.push({ cat: cat, grp: t.item_group }) - 1;
      var on = (_szAssign.grp === t.item_group);
      return '<button onclick="szAssignPick(' + gi + ')" class="w-full text-left pl-5 pr-2 py-1 rounded text-xs '
        + (on ? 'bg-blue-100' : '') + '">' + escapeAttr(t.item_group)
        + ' <span class="text-gray-400">' + t.n + '</span></button>';
    }).join('');
    // 그룹을 고른 상태면 그 자리에 품목 체크박스를 펼친다 — 트리와 목록이 떨어져 있으면 눈이 왔다갔다 한다.
    var picked = (open && _szAssign.grp) ? szAssignItemsHtml() : '';
    return head + kids + picked;
  }).join('');

  var selCount = 0;
  for (var k in _szAssign.sel) { if (_szAssign.sel[k]) selCount++; }
  var btn = document.getElementById('szAssignApply');
  if (btn) {
    btn.textContent = selCount > 0 ? (selCount + '개 추가') : '추가';
    btn.disabled = (selCount === 0);
    btn.style.opacity = selCount === 0 ? '0.5' : '1';
  }

  box.innerHTML = (html || '<div class="py-8 text-center text-gray-400 text-sm">추가할 후보가 없습니다.</div>')
    + (truncated ? '<div class="text-xs text-amber-700 mt-2">※ 결과가 잘렸습니다. 그룹으로 더 좁히거나 검색하세요.</div>' : '');
}

function szAssignItemsHtml() {
  if (!_szAssign.items.length) {
    return '<div class="pl-5 py-2 text-xs text-gray-400">이 그룹은 모두 배정돼 있습니다.</div>';
  }
  var all = '<div class="pl-5 py-1"><button onclick="szAssignSelectShown()" class="text-[11px] px-2 py-0.5 rounded border border-gray-300">'
    + '보이는 ' + _szAssign.items.length + '개 선택</button></div>';
  return all + _szAssign.items.map(function (it) {
    // 이미 다른 구역에 있으면 알려 준다 — 이 동작은 **옮기는 것이 아니라 양쪽에 만드는 것**이다.
    var where = it.current_zones
      ? '<span class="ml-1 px-1 rounded text-[10px] bg-amber-50 text-amber-700">' + escapeAttr(it.current_zones) + '</span>'
      : '';
    return '<label class="flex items-center gap-2 pl-5 pr-2 py-1 text-xs cursor-pointer hover:bg-gray-50">'
      + '<input type="checkbox" onchange="szAssignToggle(' + it.id + ', this.checked)"' + (_szAssign.sel[it.id] ? ' checked' : '') + '>'
      + '<span class="flex-1 min-w-0 truncate">' + escapeAttr(it.item_name || '') + where + '</span>'
      + '<span class="text-gray-400 text-[11px]">' + escapeAttr(it.item_code || '') + '</span></label>';
  }).join('');
}

function szAssignPick(idx) {
  var n = _szAssign.nav[idx];
  if (!n) return;
  if (!n.grp) {
    _szAssign.cat = (_szAssign.cat === n.cat) ? '' : n.cat;
    _szAssign.grp = '';
  } else {
    _szAssign.cat = n.cat;
    _szAssign.grp = (_szAssign.grp === n.grp) ? '' : n.grp;
  }
  szAssignLoadCand();
}

function szAssignToggle(id, on) { _szAssign.sel[id] = !!on; szAssignRenderCand(false); }

function szAssignSelectShown() {
  _szAssign.items.forEach(function (it) { _szAssign.sel[it.id] = true; });
  szAssignRenderCand(false);
}

async function szAssignApply() {
  var ids = [];
  for (var k in _szAssign.sel) { if (_szAssign.sel[k]) ids.push(Number(k)); }
  if (ids.length === 0) return;
  try {
    var r = await axios.post('/api/storage-zones/' + _szAssign.zoneId + '/items', { item_ids: ids });
    var added = (r.data && r.data.data && r.data.data.added) || 0;
    showToast(added + '개 품목을 배정했습니다', 'success');
    _szAssign.sel = {};
    await Promise.all([szAssignLoadHeld(), szAssignLoadCand()]);
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    showToast('배정 실패: ' + msg, 'error');
  }
}

function szAssignStartCount() {
  if (!_szAssign.zoneId) return;
  szStartZoneCount(_szAssign.zoneId);
}
