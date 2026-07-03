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
      + '<button onclick="openEditZoneModal(' + z.id + ')" class="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="수정"><svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>'
      + '<button onclick="deleteZone(' + z.id + ')" class="p-1.5 text-gray-400 hover:text-red-600 rounded" title="삭제"><svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>'
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
        + escapeAttr(u.name) + ' (' + escapeAttr(u.role) + ')</option>';
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
  if (listPanel) listPanel.classList.toggle('hidden', tab !== 'list');
  if (layoutPanel) layoutPanel.classList.toggle('hidden', tab !== 'layout');
  var active = 'px-4 py-2 text-sm font-semibold text-blue-600 border-b-2 border-blue-600 -mb-px';
  var idle = 'px-4 py-2 text-sm font-medium text-gray-500 border-b-2 border-transparent -mb-px hover:text-gray-700';
  var tabList = document.getElementById('szTabList');
  var tabLayout = document.getElementById('szTabLayout');
  if (tabList) tabList.className = tab === 'list' ? active : idle;
  if (tabLayout) tabLayout.className = tab === 'layout' ? active : idle;
  if (tab === 'layout') szLoadLayout();
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
        ? '<span style="position:absolute;right:4px;top:3px;font-size:10px;font-weight:600;background:rgba(255,255,255,0.92);padding:1px 6px;border-radius:3px;border:1px solid ' + (invShort > 0 ? '#fecaca' : '#bbf7d0') + ';color:' + (invShort > 0 ? '#dc2626' : '#16a34a') + ';"><i class="fas fa-boxes" style="margin-right:2px;"></i>' + invItems + (invShort > 0 ? ' · ⚠' + invShort : '') + '</span>'
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
        + '<td class="py-1 text-right font-semibold ' + (low ? 'text-red-600' : 'text-gray-700') + '">' + (it.quantity || 0) + ' ' + escapeAttr(it.unit || '') + '</td>'
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
if (new URLSearchParams(window.location.search).get('tab') === 'layout') szSwitchTab('layout');
