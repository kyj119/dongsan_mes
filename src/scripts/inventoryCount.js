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
    opts += '<option value="' + escapeHtml(c.category) + '">' + escapeHtml(c.category) + ' (' + c.item_count + '건)</option>';
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
  panel.style.display = 'block';   // 전체 화면 인플로우 — 종전 우측 fixed 슬라이드의 flex 가 아니다
  icShowList(false);

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

    // 상태 배지는 서버 응답 기준으로 다시 그린다 — 위에서 목록 캐시(countsList)로만 그리면
    //   제출 직후 배지는 '작성중'인데 버튼은 '승인/반려'로 바뀌어 한 화면에서 모순됐다(2026-08-26).
    var badgeEl = document.getElementById('panelStatusBadge');
    if (badgeEl && data.status) badgeEl.innerHTML = getStatusBadge(data.status);

    // 입력 완료율 표시 (입력할 때마다 icRenderSummary 가 같은 값으로 갱신 — 두 곳이 어긋나지 않게)
    icUpdateProgress(data.items || []);

    _icDetailData = data;
    // 필터 초기화 (다른 실사 전환 시 잔존 방지)
    // ★기본값 = **재고 있는 것만**. 구역 실사는 0 인 줄이 절반을 넘는다(UV실 16줄 중 15줄·전사출력실
    //   20줄 중 12줄·선명2 228줄 중 79줄, 2026-09-04 실측). 전부 보여 주면 의미 있는 줄이 묻힌다.
    //   ⚠️단 이미 입력한 줄은 0 이어도 남긴다 — 눈앞에서 사라지면 「지워졌나」가 된다(icZeroHidden).
    var icSearchEl = document.getElementById('panelItemSearch');
    if (icSearchEl) icSearchEl.value = '';
    var icFilterSel = document.getElementById('panelItemFilter');
    if (icFilterSel) icFilterSel.value = 'nonzero';
    _icFilter = { q: '', mode: 'nonzero' };
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

// 패널 헤더 진행률 — 상세 로드와 입력 갱신이 같은 함수를 쓴다(사본을 두면 두 숫자가 어긋난다)
function icUpdateProgress(items) {
  var progressEl = document.getElementById('panelProgress');
  if (!progressEl) { console.warn('[inventoryCount] #panelProgress not found'); return; }
  var total = (items || []).length;
  if (total === 0) { progressEl.innerHTML = ''; return; }
  var filled = (items || []).filter(function(it) { return it.counted_quantity !== null && it.counted_quantity !== undefined; }).length;
  progressEl.innerHTML = '<span style="font-size:12px;color:#6b7280">입력: </span>'
    + '<span style="font-size:12px;font-weight:700;color:' + (filled === total ? '#16a34a' : '#2563eb') + '">' + filled + '/' + total + '</span>';
}

function icRenderSummary() {
  var el = document.getElementById('panelDiffSummary');
  if (!el || !_icDetailData) { if (el) el.innerHTML = ''; return; }
  var items = _icDetailData.items || [];
  icUpdateProgress(items);
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
    // '건' 을 붙인다 — 종전 '차이 +1 / −2' 는 수량 증감으로 읽혔다(실제는 품목 건수)
    + chip('차이 +' + plus + '건 / −' + minus + '건', (plus + minus) > 0 ? '#fef3c7' : '#f3f4f6', (plus + minus) > 0 ? '#92400e' : '#6b7280')
    + (changed > 0 ? chip('⚠ 재고변동 ' + changed + '건', '#fee2e2', '#dc2626') : '');
}


// 실사 라인의 `unit` 은 **스냅샷된 재고 단위**(base, 예 'm')다. 그대로 uomFormatStock 에 넘기면
//   관리단위 자리에 base 단위가 들어가 「520M (10.4m)」처럼 괄호가 무의미해진다.
//   표시용으로 품목의 관리단위(item_unit = items.unit, 예 '롤')를 끼워 넣는다.
function icUomItem(item) {
  return {
    unit: item.item_unit || item.unit || '',
    base_unit: item.base_unit,
    pack_size: item.pack_size,
    stock_mode: item.stock_mode
  };
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
    // 재고 있는 것만 — 장부가 0 이라도 **이미 입력한 줄은 남긴다**. 방금 적은 줄이 사라지면
    //   「내가 지웠나」가 되고, 0 을 적어 「없음」을 확정하는 것이 실사의 정상 동작이다.
    if (_icFilter.mode === 'nonzero') return (Number(item.system_quantity) || 0) !== 0 || !notCounted;
    return true;
  });

  // 접힌 0 줄이 몇 개인지 **반드시 보여 준다** — 안 보이면 「그 품목은 없다」로 읽힌다.
  var zeroHint = document.getElementById('panelZeroHint');
  if (zeroHint) {
    var hidden = data.items.length - filtered.length;
    zeroHint.innerHTML = (_icFilter.mode === 'nonzero' && hidden > 0)
      ? '<button onclick="icShowAllRows()" style="width:100%;padding:6px;border:1px dashed #d1d5db;border-radius:6px;background:transparent;color:#6b7280;font-size:12px;cursor:pointer;">'
        + '＋ 재고 0인 품목 ' + hidden + '개 보기</button>'
      : '';
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div style="color:#9ca3af;font-size:13px;padding:8px 0;">조건에 맞는 품목 없음 (' + data.items.length + '건 중 0건)</div>';
    return;
  }

  // 그룹으로 묶고 **규격을 앞세운다** — 원단 계열은 23줄이 전부 같은 이름이라
  //   품목명만 보이면 어느 줄이 어느 폭인지 구분이 안 된다(2026-09-04 용준님 지적).
  //   규격이 없는 품목(간판자재 66/69)은 품목명이 곧 규격이므로 그대로 쓴다.
  var icGroups = [], icGmap = {};
  filtered.forEach(function(it) {
    var key = it.item_group || it.item_name || it.item_code || '(기타)';
    if (!icGmap[key]) { icGmap[key] = { name: key, rows: [] }; icGroups.push(icGmap[key]); }
    icGmap[key].rows.push(it);
  });
  var itemsHtml = icGroups.map(function(g) {
    var gf = g.rows.filter(function(r) { return r.counted_quantity !== null && r.counted_quantity !== undefined; }).length;
    var gdone = (gf === g.rows.length);
    return '<div style="margin-bottom:14px;">'
      // 그룹 헤더는 sticky — 71줄을 내리는 동안 「지금 어느 계열인지」가 사라지면 안 된다.
      + '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:#f1f5f9;'
        + 'border-left:3px solid ' + (gdone ? '#16a34a' : '#94a3b8') + ';border-radius:3px;'
        + 'position:sticky;top:42px;z-index:3;">'
        + '<span style="font-size:13px;font-weight:700;">' + escapeHtml(g.name) + '</span>'
        + '<span style="font-size:11px;font-weight:600;color:' + (gdone ? '#16a34a' : '#64748b') + ';">'
          + gf + '/' + g.rows.length + '</span>'
      + '</div>'
      + g.rows.map(function (r, ri) { return icItemRowHtml(r, ri); }).join('')
    + '</div>';
  }).join('');

  container.innerHTML = itemsHtml;

  function icItemRowHtml(item, rowIdx) {
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
      ? ' <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:#fee2e2;color:#dc2626;" title="실사 중 입출고 발생 — 현재고 ' + escapeHtml(window.uomFormatStock(Number(item.current_quantity) || 0, icUomItem(item))) + ' (스냅샷 ' + escapeHtml(window.uomFormatStock(systemQty, icUomItem(item))) + ')">⚠ 재고변동</span>'
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
      // 표시(uomFromBase)와 저장(× factor)이 같은 계수를 써야 한다 — 종전엔 저장만 pack_size 로
      // 무조건 곱해, 다단위가 아닌데 pack_size 가 있는 품목에서 입력값이 pack_size 배로 부풀었다.
      var icFactor = window.uomPackFactor(icUomItem(item));
      countedCell = '<input type="number" step="any" value="' + (notCounted ? '' : window.uomFromBase(countedQty, icUomItem(item))) + '" placeholder="미입력" style="width:60px;' + inS + '" onchange="updateItemCount(' + item.id + ', this.value, ' + item.count_id + ', ' + icFactor + ')" /> ' + escapeHtml(item.unit || '');
    } else {
      countedCell = notCounted
        ? '<span style="color:#9ca3af;">미실사 (보정 제외)</span>'
        : '<strong>' + window.uomFormatStock(countedQty, icUomItem(item)) + '</strong>'
          + (item.pack_count != null ? ' <span style="font-size:11px;color:#9ca3af;">(' + item.pack_count + ' × ' + (item.per_pack_qty || 1) + ')</span>' : '');
    }

    // ★장부는 **입력 전에는 감춘다**(용준님 2026-09-04). 먼저 보여주면 그 숫자를 베끼게 되고
    //   「장부가 맞나」를 확인하는 실사의 목적이 사라진다(전사출력실은 20줄 중 4줄만 채운 회차를
    //   네 번 반복했다). 입력하는 순간 장부와 차이를 함께 펼친다.
    //   ⚠️승인 후(비편집)에는 기록이므로 항상 보여준다.
    var bookCell;
    if (isEditable && notCounted) {
      bookCell = '<span style="color:#cbd5e1;">장부 —</span>';
    } else {
      var diffQty = countedQty - systemQty;
      var dTxt = (diffQty === 0)
        ? '<span style="color:#16a34a;">일치</span>'
        : '<span style="color:' + (diffQty > 0 ? '#2563eb' : '#ea580c') + ';font-weight:600;">'
            + (diffQty > 0 ? '+' : '') + window.uomFormatStock(diffQty, icUomItem(item)) + '</span>';
      bookCell = '장부 <strong>' + window.uomFormatStock(systemQty, icUomItem(item)) + '</strong> · ' + dTxt;
    }

    // ★한 줄 표 형태 — 전체 폭에서 「카드 + 1fr 1fr 그리드」는 규격과 입력칸이 화면 양끝으로
    //   벌어져 눈이 왕복한다. 열 폭을 고정해 세로로 정렬을 맞춘다.
    //   테두리는 #f1f5f9(거의 흰색)이라 줄 구분이 안 보였다 → 아래 실선 + 줄무늬 배경.
    var zebra = (rowIdx % 2 === 1) ? '#fafbfc' : 'transparent';
    var bookTitle = (isEditable && notCounted)
      ? '입력하면 장부 수량과 차이가 표시됩니다'
      : '실사를 만든 시점의 재고입니다. 지금 재고가 아니며, 그 뒤 입출고가 있으면 ⚠️재고변동으로 표시됩니다.';
    // hover 는 CSS 클래스로 — 인라인 onmouseover 에 따옴표를 넣으면 이스케이프가 깨진다(알려진 함정).
    return '<div class="ic-row" style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:7px 8px;'
        + 'border-bottom:1px solid #e5e7eb;background:' + zebra + ';">'
      // 규격 — 이 줄이 무엇인지 정하는 축이다. 없으면 품목명이 그 자리에 온다.
      + '<div style="flex:0 0 110px;font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"'
        + ' title="' + escapeHtml(item.item_name || '') + '">'
        + escapeHtml(item.specification || item.item_name || item.item_code || '') + '</div>'
      + '<div style="flex:0 0 128px;font-size:11px;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
        + escapeHtml(item.item_code || '') + '</div>'
      + '<div style="flex:1 1 160px;min-width:0;font-size:12px;color:#6b7280;" title="' + bookTitle + '">' + bookCell + '</div>'
      + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:6px;">' + countedCell + '</div>'
      + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:4px;">' + zoneTag + changedTag
        + (varClass ? '<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:#fee2e2;color:#dc2626;" class="' + varClass + '">' + diffPct.toFixed(1) + '%</span>' : '')
      + '</div>'
      + (item.notes ? '<div style="flex:1 1 100%;font-size:11px;color:#9ca3af;padding-left:110px;"><strong>메모:</strong> ' + escapeHtml(item.notes) + '</div>' : '')
    + '</div>';
  }
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

    // 포장당 칸을 비우면 품목 기본값(pack_size)으로 되돌린다. 종전엔 1 로 저장돼 다음 렌더가
    // 한 칸 모드로 바뀌고(usePack = perPack > 1), 그 칸에서 수량을 고치면 pack_size 배로 부풀었다.
    var defPer = (cached.pack_size && cached.pack_size > 0) ? cached.pack_size : 1;
    var pack = packCount === null ? curPack : (String(packCount).trim() === '' ? null : parseFloat(packCount));
    var per  = perPackQty === null ? curPer  : (String(perPackQty).trim() === '' ? defPer : parseFloat(perPackQty));
    if (!(per > 0)) per = defPer;
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

async function updateItemCount(itemId, countedQty, countId, packFactor) {
  try {
    // #463: 입력은 관리단위(통/롤) → base_unit 저장(× 환산계수). system_quantity·confirm 과 단위 일치(붕괴 방지).
    // packFactor = 렌더가 넘긴 window.uomPackFactor(...) — 표시(uomFromBase)와 반드시 같은 계수여야 한다.
    // 빈칸 = 미입력(NULL) 되돌림 (승인 시 보정 제외)
    var raw = String(countedQty == null ? '' : countedQty).trim();
    var countedBase = null;
    if (raw !== '') {
      var ps = (packFactor && packFactor > 0) ? packFactor : 1;
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

/** 상세를 열면 목록을 감춘다 — 전체 화면이라 둘이 같이 떠 있으면 안 된다. */
function icShowList(show) {
  var list = document.getElementById('countTabContent');
  if (list) list.classList.toggle('hidden', !show);
}

function closeDetailPanel() {
  var panel = document.getElementById('detailPanel');
  if (panel) { panel.classList.add('hidden'); panel.style.display = 'none'; }
  icShowList(true);
  _detailCountId = null;
}

document.addEventListener('click', function(e) {
  if (_detailCountId === null) return;
  if (e.target.closest('#detailPanel') || e.target.closest('#countBody')) return;
  // body 에 붙는 오버레이(새 실사 모달·showConfirm)를 클릭하면 패널이 닫히던 문제 —
  // 모달/오버레이/토스트 안의 클릭은 "바깥 클릭"이 아니다.
  if (e.target.closest('#countCreateModal, .ds-modal-overlay, .ds-modal, #toast-container')) return;
  closeDetailPanel();
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

// ===== 소모량 (#618) — /api/inventory-counts/consumption =====
//
// 실사는 「그날 얼마 남았나」만 답한다. 두 회차 사이에 매입이 끼면 단순 차감(기초−기말)이
// 소모를 과소평가해, 많이 사서 많이 남은 주를 「덜 썼다」고 읽게 만든다.
//
// ★flags 를 반드시 같이 띄운다. 이 수치는 실측이 아니라 추정이고(발주일 기준·구역 귀속은
//   품목 마스터), 그 한계를 안 보여주면 사람은 실측으로 읽는다. API 가 flags 를 돌려주는
//   이유가 그것이다 — 화면이 그걸 버리면 API 쪽 배려가 통째로 사라진다.
async function loadConsumption() {
  var body = document.getElementById('consBody');
  var flagBox = document.getElementById('consFlags');
  if (!body || !flagBox) { console.warn('[inventoryCount] #consBody / #consFlags not found'); return; }
  var zone = document.getElementById('consZone');
  var from = document.getElementById('consFrom');
  var to = document.getElementById('consTo');

  var q = [];
  if (zone && zone.value) q.push('zone_id=' + encodeURIComponent(zone.value));
  if (from && from.value) q.push('from=' + encodeURIComponent(from.value));
  if (to && to.value) q.push('to=' + encodeURIComponent(to.value));

  body.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-gray-400">계산 중...</td></tr>';
  try {
    var res = await axios.get('/api/inventory-counts/consumption' + (q.length ? '?' + q.join('&') : ''));
    if (!res.data || !res.data.success) throw new Error('bad response');
    var d = res.data.data || {};
    var items = d.items || [];
    var f = d.flags || {};

    // 회차가 2개 미만이면 API 가 reason 만 돌려준다 — 빈 표로 끝내지 않고 이유를 보여준다
    var notes = [];
    if (f.reason) notes.push(f.reason);
    if (f.date_basis) notes.push('기준: ' + f.date_basis);
    if (f.zone_attribution) notes.push('구역 귀속: ' + f.zone_attribution);
    if (f.spanned_segments) notes.push('중간 회차를 건너뛴 구간 ' + f.spanned_segments + '건');
    if (f.items_counted_once) notes.push('회차가 1번뿐이라 제외된 품목 ' + f.items_counted_once + '개');
    if (f.negative_consumption_items) notes.push('음수 소모 ' + f.negative_consumption_items + '품목 — 미귀속 매입부터 확인');
    if (f.unattributed_purchase_lines) {
      notes.push('어느 품목에도 안 붙은 매입 ' + f.unattributed_purchase_lines + '줄 ('
        + Math.round(f.unattributed_purchase_amount || 0).toLocaleString() + '원)');
    }
    if (notes.length) { flagBox.innerHTML = notes.map(escapeHtml).join('<br>'); flagBox.classList.remove('hidden'); }
    else { flagBox.classList.add('hidden'); }

    if (!items.length) {
      body.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-gray-400">산출할 구간이 없습니다</td></tr>';
      return;
    }
    body.innerHTML = items.map(function (r) {
      var neg = Number(r.total_used) < 0;
      return '<tr>'
        + '<td class="px-4 py-2 text-gray-500">' + escapeHtml(r.item_code || '') + '</td>'
        + '<td class="px-4 py-2">' + escapeHtml(r.item_name || '') + '</td>'
        + '<td class="px-3 py-2 text-right tabular-nums ' + (neg ? 'text-red-600 font-medium' : '') + '">'
        + Number(r.total_used || 0).toLocaleString() + ' <span class="text-gray-400">' + escapeHtml(r.unit || '') + '</span></td>'
        + '<td class="px-3 py-2 text-right tabular-nums text-gray-600">' + Number(r.total_purchased || 0).toLocaleString() + '</td>'
        + '<td class="px-4 py-2 text-right tabular-nums font-medium">' + Number(r.used_amount || 0).toLocaleString() + '</td>'
        + '</tr>';
    }).join('');
  } catch (e) {
    console.warn('[inventoryCount] 소모량 로드 실패', e);
    body.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-gray-400">불러오지 못했습니다</td></tr>';
  }
}

// 구역 드롭다운 — 실사 탭이 처음 열릴 때 1회 채운다 (inventoryTx.js 와 같은 방식)
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var zone = document.getElementById('consZone');
    if (!zone) { console.warn('[inventoryCount] #consZone not found'); return; }
    axios.get('/api/storage-zones').then(function (r) {
      var list = (r.data && r.data.data) || [];
      list.forEach(function (z) {
        var o = document.createElement('option');
        o.value = z.id; o.textContent = z.zone_name;
        zone.appendChild(o);
      });
    }).catch(function (e) { console.warn('[inventoryCount] storage-zones 로드 실패', e); });
  });
})();

// ===== 구역 실사: 0 줄 펼치기 · 품목 추가 (2026-09-04) =====

function icShowAllRows() {
  var sel = document.getElementById('panelItemFilter');
  if (sel) sel.value = 'all';
  _icFilter.mode = 'all';
  icRenderItems();
}

// 품목 선택은 **`scripts/zonePicker.js` 공용 컴포넌트**가 그린다(창고 페이지 배정 탭과 같은 화면).
// 여기 두면 두 화면이 갈라져 한쪽만 고쳐지는 날이 온다.

function icOpenCandidates() {
  var zoneId = (_icDetailData && _icDetailData.storage_zone_id) ? Number(_icDetailData.storage_zone_id) : null;
  if (!zoneId) { showToast('구역 실사에서만 품목을 추가할 수 있습니다', 'error'); return; }
  if (_icDetailData.status !== 'DRAFT') { showToast('작성중 실사에만 품목을 추가할 수 있습니다', 'error'); return; }
  var m = document.getElementById('icCandModal');
  if (!m) { console.warn('[inventoryCount] #icCandModal not found'); return; }
  m.classList.remove('hidden');
  zpOpen(zoneId, 'icCandMount', function (n) {
    var btn = document.getElementById('icCandApply');
    if (!btn) return;
    btn.textContent = n > 0 ? (n + '개 추가') : '추가';
    btn.disabled = (n === 0);
    btn.style.opacity = n === 0 ? '0.5' : '1';
  });
}

function icCloseCandidates() {
  var m = document.getElementById('icCandModal');
  if (m) m.classList.add('hidden');
}

async function icCandApply() {
  var ids = zpSelectedIds();
  if (!ids.length) return;
  var zoneId = (_icDetailData && _icDetailData.storage_zone_id) ? Number(_icDetailData.storage_zone_id) : null;
  if (!zoneId) return;
  try {
    // ①구역에 편입(재고 0 행 생성) → ②열린 실사에도 라인 추가. **둘 다** 해야 지금 화면에서 셀 수 있다.
    //   ①만 하면 다음 실사부터 뜨고, ②만 하면 이번 실사에만 있고 구역에는 안 남는다.
    await axios.post('/api/storage-zones/' + zoneId + '/items', { item_ids: ids });
    await axios.post('/api/inventory-counts/' + _icDetailData.id + '/add-items', { item_ids: ids });
    showToast(ids.length + '개 품목을 구역에 추가했습니다', 'success');
    zpClearSelection();
    icCloseCandidates();
    await loadDetailCount(_icDetailData.id);
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    showToast('추가 실패: ' + msg, 'error');
  }
}
