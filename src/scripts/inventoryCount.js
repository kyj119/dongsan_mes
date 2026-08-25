// ===== 재고실사 페이지 스크립트 =====
var countsList = [];
var countsTotal = 0;
var _detailCountId = null;
var _icDetailData = null;               // 상세 캐시 (다③: 입력마다 상세 재조회 제거)
var _icFilter = { q: '', mode: 'all' }; // 다①: 패널 검색·필터 상태

// 현재 로그인 사용자 — JWT payload 디코딩(verify 없음, 표시·필터 용도). receiving.js:865-877 과 같은 방식.
// ?raw 전역 스코프 공유라 이름은 _ic 접두로 격리한다.
var _icUser = { id: null, role: null };
(function readIcUser() {
  try {
    var tok = localStorage.getItem('token');
    if (!tok) return;
    var parts = tok.split('.');
    if (parts.length < 2) return;
    var p = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    _icUser.id = p.id;
    _icUser.role = p.role;
  } catch (e) { /* silent */ }
})();
function _icIsSupervisor() { return _icUser.role === 'ADMIN' || _icUser.role === 'MANAGER'; }

// ===== 상태 뱃지 =====
function getStatusBadge(status) {
  if (status === 'DRAFT') return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:#e0e7ff;color:#4f46e5;">작성중</span>';
  if (status === 'SUBMITTED') return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:#fef9c3;color:#a16207;">제출됨</span>';
  if (status === 'APPROVED') return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:#dcfce7;color:#15803d;">승인됨</span>';
  return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:#f3f4f6;color:#666;">기타</span>';
}

// ===== 요약 업데이트 =====
function updateSummary() {
  var total = countsTotal || countsList.length; // API total (limit 100 페이지 밖 포함)
  var inProgress = countsList.filter(function(c) { return c.status === 'DRAFT' || c.status === 'SUBMITTED'; }).length;
  var lastCount = countsList.length > 0 ? countsList[0].count_date : '-';

  // #508: lastCountDate id가 재고현황 탭(:92)과 중복 → getElementById가 첫 매치(재고현황 카드)를
  //        덮어써 재고실사 카드는 영구 "-"였다. 실사 탭 전용 id(countTabLastCountDate)로 분리.
  var totalEl = document.getElementById('totalCounts');
  if (totalEl) totalEl.textContent = total;
  var inProgEl = document.getElementById('inProgressCounts');
  if (inProgEl) inProgEl.textContent = inProgress;
  var lastEl = document.getElementById('countTabLastCountDate');
  if (lastEl) lastEl.textContent = lastCount;
}

// ===== 테이블 렌더 =====
function renderTable(list) {
  var tbody = document.getElementById('countBody');
  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#9ca3af;font-size:14px;">실사 기록이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(function(c) {
    var badge = getStatusBadge(c.status);
    var submittedBy = c.submitted_by || '-';
    var typeLabel = c.count_type === 'FULL' ? '전수' : (c.count_type === 'ZONE' ? '구역' : '정기');
    // P3: 구역 실사면 구역명 뱃지 병기 (storage_zone_name은 null 가능)
    var zoneMgr = c.zone_manager_name ? ' · ' + escapeHtml(c.zone_manager_name) : '';
    var zoneBadge = c.storage_zone_name
      ? '<div style="margin-top:3px;"><span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;background:#ecfdf5;color:#047857;" title="' + escapeHtml(c.storage_zone_name) + (c.zone_manager_name ? ' — 담당 ' + escapeHtml(c.zone_manager_name) : ' — 담당 미지정') + '"><i class="fas fa-map-marker-alt" style="margin-right:2px;"></i>' + escapeHtml(c.storage_zone_name) + zoneMgr + '</span></div>'
      : '';
    return '<tr style="cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'\'" onclick="openDetail(' + c.id + ')">'
      + '<td style="padding:10px 12px;font-family:monospace;font-weight:600;" title="' + escapeHtml(c.count_number || '') + '">' + escapeHtml(c.count_number) + '</td>'
      + '<td style="padding:10px 12px;text-align:center;font-size:13px;">' + (c.count_date || '') + '</td>'
      + '<td style="padding:10px 12px;text-align:center;font-size:13px;">' + typeLabel + zoneBadge + '</td>'
      + '<td style="padding:10px 12px;text-align:center;">' + badge + '</td>'
      + '<td style="padding:10px 12px;text-align:center;color:#666;font-size:13px;">' + (c.item_count != null ? c.item_count : '-') + '</td>'
      + '<td style="padding:10px 12px;text-align:center;font-size:12px;color:#666;" title="' + escapeHtml(submittedBy) + '">' + escapeHtml(submittedBy) + '</td>'
      + '<td style="padding:10px 12px;text-align:center;"><a href="javascript:" onclick="event.stopPropagation(); openDetail(' + c.id + ')" style="color:#3b82f6;font-size:13px;text-decoration:none;">열기</a></td>'
      + '</tr>';
  }).join('');
}

// ===== 데이터 로드 =====
async function loadCounts() {
  document.getElementById('countBody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#9ca3af;"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</td></tr>';

  try {
    var statusVal = document.getElementById('fStatus').value;
    var params = new URLSearchParams({ limit: '100' });
    if (statusVal) params.append('status', statusVal);
    // 「내 담당만」 — 미지정 구역·전수 실사는 ADMIN·MANAGER 에게만 남는다(서버가 같은 규칙으로 거른다)
    var mineEl = document.getElementById('fMineOnly');
    if (mineEl && mineEl.checked) params.append('scope', 'mine');

    var res = await axios.get('/api/inventory-counts?' + params.toString());
    countsList = (res.data.data || []);
    countsTotal = res.data.total || countsList.length;

    renderTable(countsList);
    updateSummary();
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    document.getElementById('countBody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#ef4444;">오류: ' + escapeHtml(msg) + '</td></tr>';
  }
}

// ===== 새 실사 생성 (전체/카테고리별) =====
async function createNewCount() {
  // 카테고리 선택 다이얼로그
  var categories = [];
  try {
    var catRes = await axios.get('/api/inventory/meta/categories');
    if (catRes.data.success) categories = catRes.data.data.categories || [];
  } catch(e) {}

  // 구역(창고) 목록 — 주간 실사는 구역 단위가 기본이다(분류 실사는 원자재 790품목이 통째로 뜬다).
  var zones = [];
  try {
    var zRes = await axios.get('/api/inventory/dashboard/zones');
    if (zRes.data.success) zones = zRes.data.data.zones || [];
  } catch(e) {}

  var opts = '<option value="">전체 실사 (모든 품목)</option>';
  categories.forEach(function(c) {
    opts += '<option value="' + c.category + '">' + c.category + ' (' + c.item_count + '건)</option>';
  });

  // 담당자 병기 + 내 담당 구역을 위로 — 담당이 정해진 구역을 매주 그 사람이 고르게 된다(2026-08-25)
  var myId = _icUser.id;
  var mine = zones.filter(function(z) { return myId && z.manager_id === myId; });
  var others = zones.filter(function(z) { return !(myId && z.manager_id === myId); });
  var zoneOpts = '<option value="">(구역 지정 안 함 — 아래 분류로 실사)</option>';
  function zoneOption(z, isMine) {
    var mgr = z.manager_name ? ' · ' + escapeHtml(z.manager_name) : ' · 담당 미지정';
    return '<option value="' + z.id + '">' + (isMine ? '★ ' : '') + escapeHtml(z.zone_name || '')
      + (z.zone_code ? ' (' + escapeHtml(z.zone_code) + ')' : '') + mgr + '</option>';
  }
  mine.forEach(function(z) { zoneOpts += zoneOption(z, true); });
  others.forEach(function(z) { zoneOpts += zoneOption(z, false); });

  var modalHtml = '<div id="countCreateModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9999">'
    + '<div style="background:#fff;border-radius:12px;padding:24px;width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.2)">'
    + '<h3 style="font-size:16px;font-weight:700;margin-bottom:16px">새 재고 실사</h3>'
    + '<label style="font-size:12px;color:#6b7280;margin-bottom:4px;display:block">구역 (주간 실사는 여기서 고릅니다)</label>'
    + '<select id="countZone" onchange="onCountZoneChange()" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:4px">' + zoneOpts + '</select>'
    + '<div id="countZoneHint" style="font-size:11px;color:#9ca3af;margin-bottom:12px">구역을 고르면 그 구역에 배정된 품목만 뜹니다.</div>'
    + '<label style="font-size:12px;color:#6b7280;margin-bottom:4px;display:block">실사 범위 (구역 미지정 시)</label>'
    + '<select id="countCategory" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:12px">' + opts + '</select>'
    + '<label style="font-size:12px;color:#6b7280;margin-bottom:4px;display:block">메모 (선택)</label>'
    + '<input id="countNotes" type="text" placeholder="예: 월말 정기 실사" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:16px">'
    + '<div style="display:flex;gap:8px;justify-content:flex-end">'
    + '<button onclick="document.getElementById(\'countCreateModal\').remove()" style="padding:8px 16px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer">취소</button>'
    + '<button onclick="submitNewCount()" style="padding:8px 16px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer">생성</button>'
    + '</div></div></div>';

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// 구역을 고르면 분류 선택은 의미가 없다(서버가 구역을 우선한다) — 비활성화해 오해를 막는다.
function onCountZoneChange() {
  var zoneEl = document.getElementById('countZone');
  var catEl = document.getElementById('countCategory');
  var hintEl = document.getElementById('countZoneHint');
  if (!zoneEl || !catEl) { console.warn('[inventoryCount] #countZone/#countCategory not found'); return; }
  var picked = !!zoneEl.value;
  catEl.disabled = picked;
  catEl.style.background = picked ? '#f3f4f6' : '';
  if (hintEl) {
    hintEl.textContent = picked
      ? '이 구역에 배정된 품목만 실사표에 뜹니다. 분류 선택은 무시됩니다.'
      : '구역을 고르면 그 구역에 배정된 품목만 뜹니다.';
  }
}

async function submitNewCount() {
  var zoneEl = document.getElementById('countZone');
  var zoneId = zoneEl ? zoneEl.value : '';
  var category = zoneId ? '' : document.getElementById('countCategory').value;
  var notes = document.getElementById('countNotes').value;
  var modal = document.getElementById('countCreateModal');

  try {
    var res = await axios.post('/api/inventory-counts', {
      count_type: zoneId ? 'ZONE' : (category ? 'PERIODIC' : 'FULL'),
      storage_zone_id: zoneId || '',
      category: category || '',
      notes: notes
    });

    if (res.data.success) {
      if (modal) modal.remove();
      var label = res.data.data.storage_zone_name
        ? '[' + res.data.data.storage_zone_name + '] '
        : (category ? '[' + category + '] ' : '[전체] ');
      showToast(label + '실사 생성됨: ' + res.data.data.count_number + ' (' + (res.data.data.item_count || '?') + '건)', 'success');
      _detailCountId = res.data.data.id;
      loadDetailCount(_detailCountId);
      loadCounts();
    }
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    showToast('생성 실패: ' + msg, 'error');
  }
}

// ===== 상세 패널 로드 =====
async function loadDetailCount(countId) {
  _detailCountId = countId;
  var panel = document.getElementById('detailPanel');
  panel.classList.remove('hidden');
  panel.style.display = 'flex';

  var count = countsList.find(function(c) { return c.id === countId; });
  if (count) {
    document.getElementById('panelCountNumber').textContent = count.count_number;
    document.getElementById('panelCountDate').textContent = count.count_date;
    document.getElementById('panelStatusBadge').innerHTML = getStatusBadge(count.status);
  }

  document.getElementById('panelItems').innerHTML = '<div style="text-align:center;padding:16px;color:#9ca3af;"><i class="fas fa-spinner fa-spin"></i></div>';

  try {
    var res = await axios.get('/api/inventory-counts/' + countId);
    var data = res.data.data || {};

    // P3: 구역 실사 — 구역명 표시 + 미배정 품목 섹션 (storage_zone_name/unassigned_items는 ZONE 실사일 때만)
    var zoneInfoEl = document.getElementById('panelZoneInfo');
    if (zoneInfoEl) {
      zoneInfoEl.innerHTML = data.storage_zone_name
        ? '<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;background:#ecfdf5;color:#047857;font-size:12px;font-weight:600;"><i class="fas fa-map-marker-alt"></i>구역: ' + escapeHtml(data.storage_zone_name) + '</span>'
        : '';
    } else { console.warn('[inventoryCount] #panelZoneInfo not found'); }
    icRenderUnassigned(data);

    // 입력 완료율 표시
    var totalCount = (data.items || []).length;
    var filledCount = (data.items || []).filter(function(it) { return it.counted_quantity !== null && it.counted_quantity !== undefined; }).length;
    var progressEl = document.getElementById('panelProgress');
    if (progressEl) {
      if (totalCount > 0) {
        progressEl.innerHTML = '<span style="font-size:12px;color:#6b7280">입력: </span><span style="font-size:12px;font-weight:700;color:' + (filledCount === totalCount ? '#16a34a' : '#2563eb') + '">' + filledCount + '/' + totalCount + '</span>';
      } else {
        progressEl.innerHTML = '';
      }
    }

    _icDetailData = data;
    // 필터 초기화 (다른 실사 전환 시 잔존 방지)
    var icSearchEl = document.getElementById('panelItemSearch');
    if (icSearchEl) icSearchEl.value = '';
    var icFilterSel = document.getElementById('panelItemFilter');
    if (icFilterSel) icFilterSel.value = 'all';
    _icFilter = { q: '', mode: 'all' };
    icRenderItems();

    // 액션 버튼 렌더
    renderDetailActions(data.status);

  } catch (e) {
    var errMsg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    document.getElementById('panelItems').innerHTML = '<div style="color:#ef4444;font-size:13px;">로드 실패: ' + escapeHtml(errMsg) + '</div>';
  }
}

// ===== 실사 UX 다①②⑤: 검색·필터, 차이 요약, 재고변동 감지 =====
function icItemChanged(item) {
  // 라⑤: 실사 생성 후 입출고 발생 여부 (current_quantity=지금 재고 vs system_quantity=스냅샷)
  return item.current_quantity !== null && item.current_quantity !== undefined
    && Number(item.current_quantity) !== Number(item.system_quantity);
}

function icApplyFilter() {
  var qEl = document.getElementById('panelItemSearch');
  var mEl = document.getElementById('panelItemFilter');
  _icFilter.q = qEl ? qEl.value.trim().toLowerCase() : '';
  _icFilter.mode = mEl ? mEl.value : 'all';
  icRenderItems();
}

function icRenderSummary() {
  var el = document.getElementById('panelDiffSummary');
  if (!el || !_icDetailData) { if (el) el.innerHTML = ''; return; }
  var items = _icDetailData.items || [];
  if (items.length === 0) { el.innerHTML = ''; return; }
  var filled = 0, plus = 0, minus = 0, changed = 0;
  items.forEach(function(it) {
    var counted = (it.counted_quantity !== null && it.counted_quantity !== undefined);
    if (counted) {
      filled++;
      var d = Number(it.difference) || 0;
      if (d > 0) plus++;
      else if (d < 0) minus++;
    }
    if (icItemChanged(it)) changed++;
  });
  var chip = function(text, bg, color) {
    return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:' + bg + ';color:' + color + ';margin-right:4px;">' + text + '</span>';
  };
  el.innerHTML = chip('입력 ' + filled + '/' + items.length, '#eff6ff', '#1d4ed8')
    + chip('차이 +' + plus + ' / −' + minus, (plus + minus) > 0 ? '#fef3c7' : '#f3f4f6', (plus + minus) > 0 ? '#92400e' : '#6b7280')
    + (changed > 0 ? chip('⚠ 재고변동 ' + changed + '건', '#fee2e2', '#dc2626') : '');
}

function icRenderItems() {
  var container = document.getElementById('panelItems');
  if (!container) return;
  var data = _icDetailData;
  icRenderSummary();
  if (!data || !data.items || data.items.length === 0) {
    container.innerHTML = '<div style="color:#9ca3af;font-size:13px;padding:8px 0;">품목 없음</div>';
    return;
  }
  var isEditable = (data.status === 'DRAFT' || data.status === 'SUBMITTED'); // 승인 후 변조 방지 (백엔드 가드와 쌍)

  var filtered = data.items.filter(function(item) {
    if (_icFilter.q) {
      var hay = ((item.item_name || '') + ' ' + (item.item_code || '')).toLowerCase();
      if (hay.indexOf(_icFilter.q) < 0) return false;
    }
    var notCounted = (item.counted_quantity === null || item.counted_quantity === undefined);
    if (_icFilter.mode === 'unfilled') return notCounted;
    if (_icFilter.mode === 'diff') return !notCounted && (Number(item.difference) || 0) !== 0;
    if (_icFilter.mode === 'changed') return icItemChanged(item);
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div style="color:#9ca3af;font-size:13px;padding:8px 0;">조건에 맞는 품목 없음 (' + data.items.length + '건 중 0건)</div>';
    return;
  }

  var itemsHtml = filtered.map(function(item) {
    var systemQty = parseFloat(item.system_quantity) || 0;
    // 미입력(NULL)은 "0으로 실사"와 구분 — 빈칸 렌더, 승인 시 보정 제외 대상
    var notCounted = (item.counted_quantity === null || item.counted_quantity === undefined);
    var countedQty = notCounted ? 0 : (parseFloat(item.counted_quantity) || 0);
    var diffPct = item.difference_pct || 0;

    var varClass = '';
    if (!notCounted) {
      if (Math.abs(diffPct) >= 20) varClass = 'variance-danger';
      else if (Math.abs(diffPct) >= 10) varClass = 'variance-warning';
    }

    // 라④: 창고별 라인 전개 — 같은 품목이 여러 줄일 수 있어 창고명 병기
    var zoneTag = item.storage_zone_name
      ? ' <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:#ecfdf5;color:#047857;">' + escapeHtml(item.storage_zone_name) + '</span>'
      : '';
    // 라⑤: 실사 중 입출고 발생 경고
    var changedTag = icItemChanged(item)
      ? ' <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:#fee2e2;color:#dc2626;" title="실사 중 입출고 발생 — 현재고 ' + escapeHtml(window.uomFormatStock(Number(item.current_quantity) || 0, item)) + ' (스냅샷 ' + escapeHtml(window.uomFormatStock(systemQty, item)) + ')">⚠ 재고변동</span>'
      : '';

    // 0540 두 칸 입력 — [포장 수] × [포장당]. 포장당은 품목 기본값(pack_size)이 채워져 있고,
    //   롤마다 다른 자재(현수막 원단 112~135yd)만 그 줄에서 고친다. 곱셈은 서버가 한다.
    var perPack = (item.per_pack_qty && item.per_pack_qty > 0) ? item.per_pack_qty
                : ((item.pack_size && item.pack_size > 0) ? item.pack_size : 1);
    var usePack = perPack > 1;   // 환산이 있는 자재만 두 칸. 나머지는 종전대로 한 칸.
    var packVal = notCounted ? '' : (item.pack_count != null ? item.pack_count : (countedQty / perPack));
    var inS = 'padding:4px;border:1px solid #ddd;border-radius:3px;font-size:12px;';

    var countedCell;
    if (isEditable && usePack) {
      countedCell = '<input type="number" step="any" value="' + packVal + '" placeholder="포장수" title="롤·통 수"'
        + ' style="width:56px;' + inS + '" onchange="updateItemPack(' + item.id + ', this.value, null, ' + item.count_id + ')" />'
        + ' <span style="color:#9ca3af;">×</span> '
        + '<input type="number" step="any" value="' + perPack + '" title="포장당 수량 — 이 줄에만 적용"'
        + ' style="width:56px;' + inS + 'background:#f8fafc;" onchange="updateItemPack(' + item.id + ', null, this.value, ' + item.count_id + ')" />'
        + ' <span style="font-size:11px;color:#6b7280;">' + escapeHtml(item.base_unit || item.unit || '') + '</span>'
        + '<div id="icCalc' + item.id + '" style="font-size:11px;color:#6b7280;margin-top:2px;">' + (notCounted ? '' : '= ' + countedQty + ' ' + escapeHtml(item.base_unit || item.unit || '')) + '</div>';
    } else if (isEditable) {
      countedCell = '<input type="number" step="any" value="' + (notCounted ? '' : window.uomFromBase(countedQty, item)) + '" placeholder="미입력" style="width:60px;' + inS + '" onchange="updateItemCount(' + item.id + ', this.value, ' + item.count_id + ', ' + ((item.pack_size && item.pack_size > 0) ? item.pack_size : 1) + ')" /> ' + escapeHtml(item.unit || '');
    } else {
      countedCell = notCounted
        ? '<span style="color:#9ca3af;">미실사 (보정 제외)</span>'
        : '<strong>' + window.uomFormatStock(countedQty, item) + '</strong>'
          + (item.pack_count != null ? ' <span style="font-size:11px;color:#9ca3af;">(' + item.pack_count + ' × ' + (item.per_pack_qty || 1) + ')</span>' : '');
    }

    return '<div style="padding:10px;border:1px solid #f1f5f9;border-radius:4px;margin-bottom:8px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
        + '<div style="font-weight:500;font-size:13px;min-width:0;">' + escapeHtml(item.item_name || item.item_code || '') + zoneTag + changedTag + '</div>'
        + (varClass ? '<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:#fee2e2;color:#dc2626;flex-shrink:0;" class="' + varClass + '">' + diffPct.toFixed(1) + '%</span>' : '')
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;color:#666;">'
        + '<div>시스템: <strong>' + window.uomFormatStock(systemQty, item) + '</strong></div>'
        + '<div>실사: ' + countedCell + '</div>'
      + '</div>'
      + (item.notes ? '<div style="font-size:11px;color:#9ca3af;margin-top:6px;padding-top:6px;border-top:1px solid #f1f5f9;"><strong>메모:</strong> ' + escapeHtml(item.notes) + '</div>' : '')
    + '</div>';
  }).join('');

  container.innerHTML = itemsHtml;
}

// ===== P3: 구역 실사 — 미배정 품목 배정 =====
function icRenderUnassigned(data) {
  var el = document.getElementById('panelUnassigned');
  if (!el) { console.warn('[inventoryCount] #panelUnassigned not found'); return; }
  var items = (data && data.unassigned_items) || [];
  // ZONE+DRAFT 실사에서만 채워짐. 없으면 섹션 비움(다른 실사로 전환 시 잔존 방지).
  if (!data || !data.storage_zone_id || items.length === 0) { el.innerHTML = ''; return; }

  var rows = items.map(function(it) {
    return '<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid #fde68a;border-radius:4px;margin-bottom:4px;cursor:pointer;background:#fff;">'
      + '<input type="checkbox" class="ic-unassigned-chk" value="' + it.item_id + '" style="width:15px;height:15px;flex-shrink:0;">'
      + '<span style="flex:1;min-width:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml((it.item_code || '') + ' ' + (it.item_name || '')) + '">'
        + '<span style="font-family:monospace;color:#6b7280;">' + escapeHtml(it.item_code || '') + '</span> ' + escapeHtml(it.item_name || '')
      + '</span>'
      + '<span style="font-size:11px;color:#9ca3af;white-space:nowrap;flex-shrink:0;">' + window.uomFormatStock((it.quantity != null ? it.quantity : 0), it) + '</span>'
      + '</label>';
  }).join('');

  el.innerHTML = ''
    + '<div style="border:1px dashed #fcd34d;background:#fffbeb;border-radius:8px;padding:12px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
        + '<span style="font-size:13px;font-weight:600;color:#92400e;"><i class="fas fa-inbox" style="margin-right:6px;"></i>미배정 품목 ' + items.length + '건</span>'
        + '<label style="font-size:11px;color:#92400e;cursor:pointer;display:inline-flex;align-items:center;gap:4px;"><input type="checkbox" onchange="icToggleAllUnassigned(this)" style="width:13px;height:13px;">전체 선택</label>'
      + '</div>'
      + '<div style="max-height:200px;overflow-y:auto;margin-bottom:10px;">' + rows + '</div>'
      + '<button onclick="icAssignUnassigned(' + _detailCountId + ')" class="ds-btn ds-btn-primary ds-btn-sm" style="width:100%;background:#d97706;">'
        + '<i class="fas fa-arrow-right" style="margin-right:4px;"></i>선택 품목을 이 구역에 배정 후 실사 추가'
      + '</button>'
    + '</div>';
}

function icToggleAllUnassigned(master) {
  document.querySelectorAll('.ic-unassigned-chk').forEach(function(chk) { chk.checked = master.checked; });
}

async function icAssignUnassigned(countId) {
  var ids = [];
  document.querySelectorAll('.ic-unassigned-chk:checked').forEach(function(chk) { ids.push(parseInt(chk.value, 10)); });
  if (ids.length === 0) { showToast('배정할 품목을 선택하세요.', 'info'); return; }
  try {
    var res = await axios.post('/api/inventory-counts/' + countId + '/add-items', { item_ids: ids, assign_zone: true });
    if (res.data && res.data.success) {
      showToast((res.data.added != null ? res.data.added : ids.length) + '건을 이 구역에 배정했습니다.', 'success');
      loadDetailCount(countId); // 실사 항목 + 미배정 목록 갱신
    } else {
      showToast('배정 실패', 'error');
    }
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    showToast('배정 실패: ' + msg, 'error');
  }
}

function renderDetailActions(status) {
  var actionsEl = document.getElementById('panelActions');

  if (status === 'DRAFT') {
    actionsEl.innerHTML = ''
      + '<button onclick="submitCount(' + _detailCountId + ')" class="ds-btn ds-btn-primary" style="background:#3b82f6;">'
        + '<i class="fas fa-check" style="margin-right:4px"></i>제출'
      + '</button>'
      + '<button onclick="deleteCount(' + _detailCountId + ')" class="ds-btn ds-btn-secondary" style="color:#dc2626;">'
        + '<i class="fas fa-trash" style="margin-right:4px"></i>삭제'
      + '</button>'
      + '<button onclick="closeDetailPanel()" class="ds-btn ds-btn-secondary" style="grid-column:1/-1;">'
        + '<i class="fas fa-times" style="margin-right:4px"></i>닫기'
      + '</button>';
  } else if (status === 'SUBMITTED') {
    actionsEl.innerHTML = ''
      + '<button onclick="approveCount(' + _detailCountId + ')" class="ds-btn ds-btn-primary" style="background:#16a34a;">'
        + '<i class="fas fa-check-double" style="margin-right:4px"></i>승인'
      + '</button>'
      + '<button onclick="rejectCount(' + _detailCountId + ')" class="ds-btn ds-btn-secondary" style="color:#d97706;">'
        + '<i class="fas fa-rotate-left" style="margin-right:4px"></i>반려'
      + '</button>'
      + '<button onclick="closeDetailPanel()" class="ds-btn ds-btn-secondary" style="grid-column:1/-1;">'
        + '<i class="fas fa-times" style="margin-right:4px"></i>닫기'
      + '</button>';
  } else {
    actionsEl.innerHTML = '<button onclick="closeDetailPanel()" class="ds-btn ds-btn-secondary" style="grid-column:1/-1;">'
      + '<i class="fas fa-times" style="margin-right:4px"></i>닫기'
    + '</button>';
  }
}

// 0540: 두 칸 입력 — 둘 중 바뀐 쪽만 넘기고 나머지는 캐시에서 채운다. 곱셈은 서버가 한다
//   (클라에서 곱해 보내면 반올림·단위 판단이 두 곳으로 갈린다).
async function updateItemPack(itemId, packCount, perPackQty, countId) {
  try {
    var cached = ((_icDetailData && _icDetailData.items) || []).find(function(i) { return i.id === itemId; });
    if (!cached) { console.warn('[inventoryCount] item ' + itemId + ' not in cache'); return; }

    var curPer = (cached.per_pack_qty && cached.per_pack_qty > 0) ? cached.per_pack_qty
               : ((cached.pack_size && cached.pack_size > 0) ? cached.pack_size : 1);
    var curPack = cached.pack_count != null ? cached.pack_count
                : (cached.counted_quantity != null ? (Number(cached.counted_quantity) || 0) / curPer : null);

    var pack = packCount === null ? curPack : (String(packCount).trim() === '' ? null : parseFloat(packCount));
    var per  = perPackQty === null ? curPer  : (String(perPackQty).trim() === '' ? 1 : parseFloat(perPackQty));
    if (!(per > 0)) per = 1;

    var sysQty = Number(cached.system_quantity) || 0;
    await axios.put('/api/inventory-counts/' + countId + '/items', {
      items: [{ id: itemId, pack_count: pack, per_pack_qty: per, counted_quantity: null, system_quantity: sysQty }]
    });

    var base = pack === null || isNaN(pack) ? null : pack * per;
    cached.pack_count = pack; cached.per_pack_qty = per; cached.counted_quantity = base;
    cached.difference = base === null ? null : (base - sysQty);
    cached.difference_pct = base === null ? null : (sysQty !== 0 ? ((base - sysQty) / sysQty) * 100 : 0);

    var calc = document.getElementById('icCalc' + itemId);
    if (calc) calc.textContent = base === null ? '' : ('= ' + Math.round(base * 100) / 100 + ' ' + (cached.base_unit || cached.item_unit || ''));
    icRenderSummary();
  } catch (e) {
    console.error('[inventoryCount] updateItemPack', e);
    alert('저장에 실패했습니다.');
  }
}

async function updateItemCount(itemId, countedQty, countId, packSize) {
  try {
    // #463: 입력은 관리단위(통/롤) → base_unit 저장(× pack_size). system_quantity·confirm 과 단위 일치(붕괴 방지).
    // 빈칸 = 미입력(NULL) 되돌림 (승인 시 보정 제외)
    var raw = String(countedQty == null ? '' : countedQty).trim();
    var countedBase = null;
    if (raw !== '') {
      var ps = (packSize && packSize > 0) ? packSize : 1;
      countedBase = (parseFloat(raw) || 0) * ps;
    }
    // 다③: 캐시(_icDetailData)에서 system_quantity 참조 — 입력마다 상세 재조회(N+1) 제거
    var cached = ((_icDetailData && _icDetailData.items) || []).find(function(i) { return i.id === itemId; });
    var sysQty = 0;
    if (cached) {
      sysQty = Number(cached.system_quantity) || 0;
    } else {
      var res0 = await axios.get('/api/inventory-counts/' + countId); // 캐시 미스 폴백 (드묾)
      var existingItem = (res0.data.data.items || []).find(function(i) { return i.id === itemId; });
      if (existingItem) sysQty = Number(existingItem.system_quantity) || 0;
    }

    await axios.put('/api/inventory-counts/' + countId + '/items', { items: [{ id: itemId, counted_quantity: countedBase, system_quantity: sysQty }] });

    // 캐시 동기화 + 요약 갱신 (전체 리렌더는 입력 포커스 유지 위해 생략)
    if (cached) {
      cached.counted_quantity = countedBase;
      cached.difference = countedBase === null ? null : (countedBase - sysQty);
      cached.difference_pct = countedBase === null ? null : (sysQty !== 0 ? ((countedBase - sysQty) / sysQty) * 100 : 0);
      icRenderSummary();
    }
  } catch (e) {
    showToast('업데이트 실패', 'error');
  }
}

async function icPrecheck(countId) {
  // 제출/승인 confirm 경고용: 미입력 건수 + 재고변동 건수 (최신 서버 상태 기준)
  try {
    var res = await axios.get('/api/inventory-counts/' + countId);
    var items = res.data.data.items || [];
    return {
      unfilled: items.filter(function(i) { return i.counted_quantity === null || i.counted_quantity === undefined; }).length,
      changed: items.filter(icItemChanged).length
    };
  } catch (e) { return { unfilled: 0, changed: 0 }; }
}

async function submitCount(countId) {
  var pre = await icPrecheck(countId);
  var msg = '이 실사를 제출하시겠습니까?';
  if (pre.unfilled > 0) msg = '미입력 ' + pre.unfilled + '건이 있습니다(승인 시 보정 제외). ' + msg;
  if (!(await showConfirm(msg))) return;
  try {
    var res = await axios.patch('/api/inventory-counts/' + countId + '/submit');
    if (res.data.success) {
      showToast('제출됨', 'success');
      loadCounts();
      loadDetailCount(countId);
    }
  } catch (e) {
    var msg2 = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    showToast('제출 실패: ' + msg2, 'error');
  }
}

async function approveCount(countId) {
  var pre = await icPrecheck(countId);
  var msg = '이 실사를 승인하시겠습니까? 재고가 실사 수량으로 보정됩니다.';
  if (pre.unfilled > 0) msg = '미입력 ' + pre.unfilled + '건은 보정에서 제외됩니다. ' + msg;
  if (pre.changed > 0) msg = '⚠ 실사 중 입출고가 발생한 품목 ' + pre.changed + '건이 있습니다(스냅샷 기준 보정 시 중간 변동 소실 — 해당 품목은 재실사 권장). ' + msg;
  if (!(await showConfirm(msg, { danger: true }))) return;
  try {
    var res = await axios.patch('/api/inventory-counts/' + countId + '/approve');
    if (res.data.success) {
      var skipped = res.data.skipped || 0;
      showToast(skipped > 0 ? '승인됨 (미입력 ' + skipped + '건 보정 제외)' : '승인됨', 'success');
      loadCounts();
      loadDetailCount(countId);
    }
  } catch (e) {
    var msg2 = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    showToast('승인 실패: ' + msg2, 'error');
  }
}

// ===== 실사 UX 라⑥: 반려·삭제 =====
async function rejectCount(countId) {
  if (!(await showConfirm('이 실사를 반려하시겠습니까? 작성중 상태로 되돌아가며 실사 수량은 유지됩니다.'))) return;
  try {
    var res = await axios.patch('/api/inventory-counts/' + countId + '/reject');
    if (res.data.success) {
      showToast('반려됨 — 작성중으로 전환', 'success');
      loadCounts();
      loadDetailCount(countId);
    }
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    showToast('반려 실패: ' + msg, 'error');
  }
}

async function deleteCount(countId) {
  if (!(await showConfirm('이 실사를 삭제하시겠습니까? 입력한 실사 수량도 함께 삭제됩니다.', { danger: true }))) return;
  try {
    var res = await axios.delete('/api/inventory-counts/' + countId);
    if (res.data.success) {
      showToast('삭제됨', 'success');
      closeDetailPanel();
      loadCounts();
    }
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    showToast('삭제 실패: ' + msg, 'error');
  }
}

function openDetail(countId) {
  loadDetailCount(countId);
}

function closeDetailPanel() {
  var panel = document.getElementById('detailPanel');
  panel.classList.add('hidden');
  panel.style.display = 'none';
  _detailCountId = null;
}

document.addEventListener('click', function(e) {
  if (_detailCountId !== null && !e.target.closest('#detailPanel') && !e.target.closest('#countBody')) {
    closeDetailPanel();
  }
});

// ===== 필터 이벤트 바인딩 =====
document.getElementById('fStatus').addEventListener('change', loadCounts);

// ===== 초기 로드 (+ 배치도 '이 구역 실사' 진입 시 해당 실사 자동 오픈) =====
var _icOpenCountId = (new URLSearchParams(window.location.search)).get('openCount');
loadCounts().then(function() {
  if (_icOpenCountId) {
    if (typeof switchInvTab === 'function') switchInvTab('count'); // 재고실사 탭으로 전환
    openDetail(parseInt(_icOpenCountId, 10));
  }
});
