// ============================================================================
// CAPS 근태 연동 설정 탭 스크립트 — 멀티사이트 지원
// - /settings 페이지 내 capsTabContent 영역 로직
// - caps_sites 테이블 기반 사이트별 설정/매핑/로그 관리
// ============================================================================

var capsSitesCache = [];
var capsCurrentSiteId = null;
var capsEmployeesCache = [];

// ───────── 초기화 ─────────
async function initCapsTab() {
  await loadCapsSites();
  await loadCapsEmployeesList();
}

// ───────── 0) 사이트 목록 ─────────
async function loadCapsSites() {
  try {
    var res = await axios.get('/api/caps/sites');
    if (!res.data.success) return;
    capsSitesCache = res.data.data || [];
    renderCapsSiteCards();
    // 첫 번째 사이트 자동 선택
    if (capsSitesCache.length > 0 && !capsCurrentSiteId) {
      selectCapsSite(capsSitesCache[0].id);
    }
  } catch (err) {
    if (err.response && err.response.status === 403) {
      if (typeof showToast === 'function') showToast('관리자 권한이 필요합니다', 'error');
    } else {
      console.error('CAPS 사이트 로드 실패', err);
    }
  }
}

function renderCapsSiteCards() {
  var container = document.getElementById('capsSiteCards');
  if (!container) return;
  var html = capsSitesCache.map(function(s) {
    var isActive = s.id === capsCurrentSiteId;
    var syncOk = s.last_sync_ok_at ? timeAgo(s.last_sync_ok_at) : '없음';
    var statusDot = s.sync_enabled ? 'bg-green-500' : 'bg-gray-400';
    return '<button onclick="selectCapsSite(\'' + s.id + '\')" class="text-left p-3 rounded-lg border-2 transition-all ' +
      (isActive ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 bg-white hover:border-blue-300') + '">' +
      '<div class="flex items-center gap-2 mb-1">' +
        '<span class="w-2 h-2 rounded-full ' + statusDot + '"></span>' +
        '<span class="font-bold text-sm">' + escapeHtml(s.name) + '</span>' +
        '<span class="text-xs text-gray-400">(' + escapeHtml(s.id) + ')</span>' +
      '</div>' +
      '<div class="text-xs text-gray-500">마지막 동기화: ' + escapeHtml(syncOk) + '</div>' +
    '</button>';
  }).join('');
  // 사이트 추가 버튼
  html += '<button onclick="showAddCapsSiteModal()" class="p-3 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50 transition-all text-center">' +
    '<i class="fas fa-plus text-gray-400 text-lg block mb-1"></i>' +
    '<span class="text-xs text-gray-500">사이트 추가</span>' +
  '</button>';
  container.innerHTML = html;
}

function selectCapsSite(siteId) {
  capsCurrentSiteId = siteId;
  renderCapsSiteCards();
  loadCapsSiteSettings(siteId);
  loadCapsEmployeeMap();
  loadCapsSyncLog();
}

function timeAgo(dateStr) {
  if (!dateStr) return '없음';
  try {
    var d = Date.parse(dateStr.replace(' ', 'T') + (dateStr.includes('Z') ? '' : 'Z'));
    if (isNaN(d)) return dateStr;
    var diff = Math.floor((Date.now() - d) / 1000);
    if (diff < 60) return diff + '초 전';
    if (diff < 3600) return Math.floor(diff / 60) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    return Math.floor(diff / 86400) + '일 전';
  } catch (e) { return dateStr; }
}

// ───────── 사이트 추가 모달 ─────────
function showAddCapsSiteModal() {
  document.getElementById('capsAddSiteModal').classList.remove('hidden');
  document.getElementById('capsNewSiteId').value = '';
  document.getElementById('capsNewSiteName').value = '';
  document.getElementById('capsNewSiteId').focus();
}

function closeAddCapsSiteModal() {
  document.getElementById('capsAddSiteModal').classList.add('hidden');
}

async function addCapsSite() {
  var id = document.getElementById('capsNewSiteId').value.trim().toUpperCase();
  var name = document.getElementById('capsNewSiteName').value.trim();
  if (!id || !name) {
    if (typeof showToast === 'function') showToast('사이트 코드와 이름을 입력하세요', 'warning');
    return;
  }
  try {
    var res = await axios.post('/api/caps/sites', { id: id, name: name });
    if (res.data.success) {
      closeAddCapsSiteModal();
      if (typeof showToast === 'function') showToast(name + ' 사이트가 추가되었습니다', 'success');
      // API 키 표시
      if (res.data.data && res.data.data.worker_api_key) {
        var keyMsg = '워커 설치 시 아래 API 키를 사용하세요:\n\n' + res.data.data.worker_api_key;
        alert(keyMsg);
      }
      capsCurrentSiteId = id;
      await loadCapsSites();
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast('추가 실패: ' + (err.response && err.response.data && err.response.data.error || err.message), 'error');
  }
}

// ───────── 1) 사이트별 설정 로드/저장 ─────────
function loadCapsSiteSettings(siteId) {
  var site = capsSitesCache.find(function(s) { return s.id === siteId; });
  if (!site) return;

  var fields = {
    'caps_site_relay_db_engine': site.relay_db_engine || 'access',
    'caps_site_relay_db_host': site.relay_db_host || '',
    'caps_site_relay_db_port': site.relay_db_port || '3306',
    'caps_site_relay_db_name': site.relay_db_name || '',
    'caps_site_relay_db_user': site.relay_db_user || '',
    'caps_site_relay_table': site.relay_table || 'nOutput',
    'caps_site_sync_interval_min': site.sync_interval_min || '30',
    'caps_site_sync_lookback_days': site.sync_lookback_days || '3',
    'caps_site_worker_endpoint': site.worker_endpoint || '',
  };
  Object.keys(fields).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = fields[id];
  });
  var chk = document.getElementById('caps_site_sync_enabled');
  if (chk) chk.checked = site.sync_enabled === 1 || site.sync_enabled === '1';

  // 비밀번호/키 필드 초기화
  var pwEl = document.getElementById('caps_site_relay_db_password');
  if (pwEl) pwEl.value = '';
  var keyEl = document.getElementById('caps_site_worker_api_key');
  if (keyEl) keyEl.value = '';

  // 마지막 성공 시각
  var lastOkEl = document.getElementById('capsLastOk');
  if (lastOkEl) lastOkEl.textContent = site.last_sync_ok_at || '—';

  // 미매핑 배너
  renderCapsUnmappedBanner(site.last_unmapped);

  // 사이트 이름 표시
  var nameEl = document.getElementById('capsCurrentSiteName');
  if (nameEl) nameEl.textContent = site.name + ' (' + site.id + ')';
}

async function saveCapsSiteSettings() {
  if (!capsCurrentSiteId) return;
  var btn = document.getElementById('saveCapsSettingsBtn');
  var msg = document.getElementById('capsSettingsMsg');
  if (btn) btn.disabled = true;
  try {
    var body = {};
    ['relay_db_engine', 'relay_db_host', 'relay_db_port', 'relay_db_name',
     'relay_db_user', 'relay_table', 'sync_interval_min', 'sync_lookback_days',
     'worker_endpoint'].forEach(function(key) {
      var el = document.getElementById('caps_site_' + key);
      if (el) body[key] = el.value;
    });
    body.sync_enabled = document.getElementById('caps_site_sync_enabled').checked ? 1 : 0;
    // 시크릿
    var pw = document.getElementById('caps_site_relay_db_password');
    if (pw && pw.value) body.relay_db_password = pw.value;
    var ak = document.getElementById('caps_site_worker_api_key');
    if (ak && ak.value) body.worker_api_key = ak.value;

    var res = await axios.put('/api/caps/sites/' + capsCurrentSiteId, body);
    if (res.data.success) {
      if (msg) { msg.textContent = '저장되었습니다.'; msg.className = 'mt-3 text-center text-sm text-green-600'; }
      if (pw) pw.value = '';
      if (ak) ak.value = '';
      await loadCapsSites();
    } else {
      throw new Error(res.data.error || '저장 실패');
    }
  } catch (err) {
    if (msg) {
      msg.textContent = '저장 실패: ' + (err.response && err.response.data && err.response.data.error || err.message);
      msg.className = 'mt-3 text-center text-sm text-red-600';
    }
  } finally {
    if (btn) btn.disabled = false;
    setTimeout(function() { if (msg) msg.className = 'mt-3 text-center text-sm hidden'; }, 4000);
  }
}

async function regenerateCapsSiteKey() {
  if (!capsCurrentSiteId) return;
  if (!(await showConfirm('API 키를 재생성하시겠습니까?\n기존 워커에서 새 키로 교체해야 합니다.', { danger: true }))) return;
  try {
    var res = await axios.post('/api/caps/sites/' + capsCurrentSiteId + '/regenerate-key');
    if (res.data.success && res.data.data) {
      alert('새 API 키:\n\n' + res.data.data.worker_api_key + '\n\n워커 설정에서 교체하세요.');
      if (typeof showToast === 'function') showToast('API 키가 재생성되었습니다', 'success');
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast('재생성 실패: ' + err.message, 'error');
  }
}

// ───────── 2) 사원 매핑 ─────────
async function loadCapsEmployeesList() {
  try {
    var res = await axios.get('/api/hr/employees', { params: { status: 'ACTIVE', limit: 200 } });
    if (!res.data.success) return;
    var d = res.data.data || {};
    capsEmployeesCache = d.employees || d || [];
    var sel = document.getElementById('capsMapEmployee');
    if (!sel) return;
    var html = '<option value="">— 선택 —</option>';
    capsEmployeesCache.forEach(function(emp) {
      var label = (emp.employee_code || '-') + ' ' + (emp.name || '') +
                  (emp.department ? ' (' + emp.department + ')' : '');
      html += '<option value="' + emp.id + '">' + escapeHtml(label) + '</option>';
    });
    sel.innerHTML = html;
  } catch (err) {
    console.error('직원 목록 로드 실패', err);
  }
}

async function loadCapsEmployeeMap() {
  try {
    var params = {};
    if (capsCurrentSiteId) params.site_id = capsCurrentSiteId;
    var res = await axios.get('/api/caps/employee-map', { params: params });
    if (!res.data.success) return;
    var rows = res.data.data || [];
    var body = document.getElementById('capsMapBody');
    var empty = document.getElementById('capsMapEmpty');
    if (!body) return;
    if (rows.length === 0) {
      body.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    body.innerHTML = rows.map(function(r) {
      var mappedAt = r.mapped_at ? String(r.mapped_at).slice(0, 10) : '-';
      var dept = r.caps_c_dept || '';
      var capsLabel = escapeHtml(r.caps_e_name || '-') + (dept ? ' <span class="text-gray-400">(' + escapeHtml(dept) + ')</span>' : '');
      return '<tr class="border-b border-gray-100 hover:bg-blue-50/30">' +
        '<td class="px-3 py-2 tabular-nums font-medium">' + escapeHtml(r.caps_e_idno) + '</td>' +
        '<td class="px-3 py-2 text-gray-700">' + capsLabel + '</td>' +
        '<td class="px-3 py-2 text-gray-400"><i class="fas fa-arrow-right"></i></td>' +
        '<td class="px-3 py-2">' +
          escapeHtml(r.employee_code || '-') + ' ' + escapeHtml(r.employee_name || '-') +
          (r.department ? ' <span class="text-gray-400">(' + escapeHtml(r.department) + ')</span>' : '') +
        '</td>' +
        '<td class="px-3 py-2 text-gray-600 text-xs">' + escapeHtml(r.notes || '') + '</td>' +
        '<td class="px-3 py-2 text-xs text-gray-400 tabular-nums">' + mappedAt + '</td>' +
        '<td class="px-3 py-2 text-center">' +
          '<button onclick="removeCapsEmployeeMap(' + r.id + ')" class="text-gray-400 hover:text-red-600" title="삭제">' +
            '<i class="fas fa-trash text-xs"></i>' +
          '</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  } catch (err) {
    console.error('CAPS 매핑 로드 실패', err);
  }
}

async function addCapsEmployeeMap() {
  var idno = document.getElementById('capsMapIdno').value.trim();
  var name = document.getElementById('capsMapName').value.trim();
  var dept = document.getElementById('capsMapDept').value.trim();
  var empId = document.getElementById('capsMapEmployee').value;
  var notes = document.getElementById('capsMapNotes').value.trim();
  if (!idno) { if (typeof showToast === 'function') showToast('CAPS 사원번호를 입력하세요', 'warning'); return; }
  if (!empId) { if (typeof showToast === 'function') showToast('MES 직원을 선택하세요', 'warning'); return; }
  try {
    var res = await axios.post('/api/caps/employee-map', {
      site_id: capsCurrentSiteId || 'DJ',
      caps_e_idno: idno,
      caps_e_name: name || null,
      caps_c_dept: dept || null,
      employee_id: parseInt(empId),
      notes: notes || null
    });
    if (res.data.success) {
      if (typeof showToast === 'function') showToast('매핑이 추가되었습니다', 'success');
      document.getElementById('capsMapIdno').value = '';
      document.getElementById('capsMapName').value = '';
      document.getElementById('capsMapDept').value = '';
      document.getElementById('capsMapEmployee').value = '';
      document.getElementById('capsMapNotes').value = '';
      await loadCapsEmployeeMap();
      await loadCapsSites();
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast('추가 실패: ' + (err.response && err.response.data && err.response.data.error || err.message), 'error');
  }
}

async function removeCapsEmployeeMap(id) {
  if (!(await showConfirm('이 매핑을 삭제하시겠습니까?', { danger: true }))) return;
  try {
    var res = await axios.delete('/api/caps/employee-map/' + id);
    if (res.data.success) {
      if (typeof showToast === 'function') showToast('삭제되었습니다', 'success');
      await loadCapsEmployeeMap();
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast('삭제 실패: ' + err.message, 'error');
  }
}

// ───────── 미매핑 배너 ─────────
function renderCapsUnmappedBanner(rawJson) {
  var banner = document.getElementById('capsUnmappedBanner');
  var list = document.getElementById('capsUnmappedList');
  var count = document.getElementById('capsUnmappedCount');
  if (!banner || !list || !count) return;
  var samples = [];
  try {
    if (rawJson) samples = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
    if (!samples) samples = [];
  } catch (e) { samples = []; }
  if (!Array.isArray(samples) || samples.length === 0) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  count.textContent = samples.length;
  list.innerHTML = samples.map(function(s, idx) {
    var label = s.e_idno + (s.e_name ? ' · ' + s.e_name : '') + (s.c_dept ? ' (' + s.c_dept + ')' : '');
    return '<button type="button" onclick="fillCapsMapFromUnmapped(' + idx + ')" ' +
           'class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white border border-amber-300 text-amber-800 hover:bg-amber-100">' +
           '<i class="fas fa-plus text-[9px] mr-1"></i>' + escapeHtml(label) +
           '</button>';
  }).join('');
  window.__capsUnmappedSamples = samples;
}

function fillCapsMapFromUnmapped(idx) {
  var samples = window.__capsUnmappedSamples || [];
  var s = samples[idx];
  if (!s) return;
  document.getElementById('capsMapIdno').value = s.e_idno || '';
  document.getElementById('capsMapName').value = s.e_name || '';
  document.getElementById('capsMapDept').value = s.c_dept || '';
  document.getElementById('capsMapEmployee').focus();
}

// ───────── 3) 동기화 이력 ─────────
async function loadCapsSyncLog() {
  try {
    var params = { limit: 50 };
    if (capsCurrentSiteId) params.site_id = capsCurrentSiteId;
    var res = await axios.get('/api/caps/sync-log', { params: params });
    if (!res.data.success) return;
    var rows = res.data.data || [];
    window.__capsSyncLogCache = rows;
    var body = document.getElementById('capsSyncLogBody');
    var empty = document.getElementById('capsSyncLogEmpty');
    if (!body) return;

    // 최근 7일 요약
    var now = Date.now();
    var weekAgo = now - 7 * 24 * 3600 * 1000;
    var cnt = { SUCCESS: 0, PARTIAL: 0, FAILED: 0 };
    rows.forEach(function(r) {
      var t = r.started_at ? Date.parse(r.started_at.replace(' ', 'T') + 'Z') : NaN;
      if (!isNaN(t) && t >= weekAgo && cnt[r.status] != null) cnt[r.status]++;
    });
    setBadgeCount('capsBadgeSuccess', cnt.SUCCESS);
    setBadgeCount('capsBadgePartial', cnt.PARTIAL);
    setBadgeCount('capsBadgeFailed', cnt.FAILED);

    if (rows.length === 0) {
      body.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    body.innerHTML = rows.map(function(r) {
      var range = (r.from_date || '—') + ' ~ ' + (r.to_date || '—');
      return '<tr class="border-b border-gray-100 hover:bg-blue-50/30 cursor-pointer" onclick="showCapsSyncLogDetail(' + r.id + ')">' +
        '<td class="px-3 py-2 text-xs text-gray-600 tabular-nums">' + escapeHtml(r.started_at || '-') + '</td>' +
        '<td class="px-3 py-2">' + renderCapsStatusBadge(r.status) + '</td>' +
        '<td class="px-3 py-2 text-right tabular-nums">' + (r.fetched_count || 0) + '</td>' +
        '<td class="px-3 py-2 text-right tabular-nums text-blue-600">' + (r.inserted_count || 0) + '</td>' +
        '<td class="px-3 py-2 text-right tabular-nums text-gray-700">' + (r.updated_count || 0) + '</td>' +
        '<td class="px-3 py-2 text-right tabular-nums text-gray-500">' + (r.skipped_count || 0) + '</td>' +
        '<td class="px-3 py-2 text-right tabular-nums ' + ((r.error_count || 0) > 0 ? 'text-red-600 font-semibold' : 'text-gray-400') + '">' + (r.error_count || 0) + '</td>' +
        '<td class="px-3 py-2 text-xs text-gray-500">' + escapeHtml(r.trigger_type || '-') + '</td>' +
        '<td class="px-3 py-2 text-xs text-gray-500 tabular-nums">' + escapeHtml(range) + '</td>' +
      '</tr>';
    }).join('');
  } catch (err) {
    console.error('CAPS 동기화 이력 로드 실패', err);
  }
}

function setBadgeCount(badgeId, count) {
  var el = document.getElementById(badgeId);
  if (!el) return;
  var numSpan = el.querySelector('.tabular-nums');
  if (numSpan) numSpan.textContent = count;
}

function renderCapsStatusBadge(status) {
  var map = {
    SUCCESS: { cls: 'bg-green-50 text-green-700', icon: 'fa-check-circle', label: '성공' },
    PARTIAL: { cls: 'bg-amber-50 text-amber-700', icon: 'fa-exclamation-circle', label: '부분' },
    FAILED: { cls: 'bg-red-50 text-red-700', icon: 'fa-times-circle', label: '실패' },
    RUNNING: { cls: 'bg-blue-50 text-blue-700', icon: 'fa-spinner', label: '진행중' }
  };
  var s = map[status] || { cls: 'bg-gray-100 text-gray-600', icon: 'fa-question', label: status || '-' };
  return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ' + s.cls + '">' +
         '<i class="fas ' + s.icon + ' text-[9px] mr-1"></i>' + s.label + '</span>';
}

function showCapsSyncLogDetail(logId) {
  var rows = window.__capsSyncLogCache || [];
  var r = rows.find(function(x) { return x.id === logId; });
  if (!r) return;
  var body = document.getElementById('capsSyncLogModalBody');
  if (!body) return;
  var range = (r.from_date || '—') + ' ~ ' + (r.to_date || '—');
  var duration = '—';
  if (r.started_at && r.finished_at) {
    try {
      var ms = Date.parse(r.finished_at.replace(' ', 'T') + 'Z') - Date.parse(r.started_at.replace(' ', 'T') + 'Z');
      if (!isNaN(ms)) duration = (ms / 1000).toFixed(1) + '초';
    } catch (e) {}
  }
  body.innerHTML =
    '<div class="grid grid-cols-2 gap-3 text-sm">' +
      '<div><span class="text-gray-500">상태</span><div class="mt-1">' + renderCapsStatusBadge(r.status) + '</div></div>' +
      '<div><span class="text-gray-500">소요 시간</span><div class="mt-1 tabular-nums">' + duration + '</div></div>' +
      '<div><span class="text-gray-500">시작</span><div class="mt-1 tabular-nums text-xs">' + escapeHtml(r.started_at || '-') + '</div></div>' +
      '<div><span class="text-gray-500">종료</span><div class="mt-1 tabular-nums text-xs">' + escapeHtml(r.finished_at || '-') + '</div></div>' +
      '<div><span class="text-gray-500">트리거</span><div class="mt-1">' + escapeHtml(r.trigger_type || '-') + '</div></div>' +
      '<div><span class="text-gray-500">범위</span><div class="mt-1 tabular-nums text-xs">' + escapeHtml(range) + '</div></div>' +
    '</div>' +
    '<div class="mt-4 border-t border-gray-200 pt-4">' +
      '<div class="grid grid-cols-5 gap-2 text-center">' +
        '<div><div class="text-xs text-gray-500">수집</div><div class="text-lg font-bold tabular-nums">' + (r.fetched_count || 0) + '</div></div>' +
        '<div><div class="text-xs text-gray-500">신규</div><div class="text-lg font-bold tabular-nums text-blue-600">' + (r.inserted_count || 0) + '</div></div>' +
        '<div><div class="text-xs text-gray-500">갱신</div><div class="text-lg font-bold tabular-nums">' + (r.updated_count || 0) + '</div></div>' +
        '<div><div class="text-xs text-gray-500">건너뜀</div><div class="text-lg font-bold tabular-nums text-gray-600">' + (r.skipped_count || 0) + '</div></div>' +
        '<div><div class="text-xs text-gray-500">오류</div><div class="text-lg font-bold tabular-nums ' + ((r.error_count || 0) > 0 ? 'text-red-600' : 'text-gray-400') + '">' + (r.error_count || 0) + '</div></div>' +
      '</div>' +
    '</div>' +
    (r.error_message ? (
      '<div class="mt-4 border-t border-gray-200 pt-4">' +
        '<div class="text-sm font-semibold text-gray-700 mb-2">오류 메시지</div>' +
        '<pre class="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-800 whitespace-pre-wrap break-all max-h-60 overflow-y-auto">' + escapeHtml(r.error_message) + '</pre>' +
      '</div>'
    ) : '');
  document.getElementById('capsSyncLogModal').classList.remove('hidden');
}

function closeCapsSyncLogModal() {
  var m = document.getElementById('capsSyncLogModal');
  if (m) m.classList.add('hidden');
}

// ───────── 4) 수동 동기화 트리거 ─────────
async function triggerCapsSync() {
  var btn = document.getElementById('capsSyncBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>요청 중...'; }
  try {
    var res = await axios.post('/api/caps/sync/trigger', { site_id: capsCurrentSiteId || 'DJ' });
    if (res.data.success) {
      if (typeof showToast === 'function') showToast('동기화 요청 완료 — 워커가 30초 내 실행합니다', 'success');
      setTimeout(async function() {
        await loadCapsSyncLog();
        await loadCapsSites();
      }, 35000);
    } else {
      if (typeof showToast === 'function') showToast('요청 실패: ' + (res.data.error || '알 수 없는 오류'), 'error');
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast('요청 실패: ' + (err.response && err.response.data && err.response.data.error || err.message), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt mr-1"></i>지금 동기화'; }
  }
}
