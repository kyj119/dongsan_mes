// ============================================================================
// CAPS 근태 연동 설정 탭 스크립트 — 멀티사이트 지원
// - /settings 페이지 내 capsTabContent 영역 로직
// - caps_sites 테이블 기반 사이트별 설정/매핑/로그 관리
// ============================================================================

var capsSitesCache = [];
var capsCurrentSiteId = null;
var capsTriggerLabel = { SCHEDULED: '예약', MANUAL: '수동', STARTUP: '기동' };

// ───────── 초기화 ─────────
async function initCapsTab() {
  await loadCapsSites();
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
    var syncOk = s.last_sync_ok_at ? capsTimeAgo(s.last_sync_ok_at) : '없음';
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
  loadCapsSyncLog();
  if (typeof loadCapsEmployeeMap === 'function') loadCapsEmployeeMap();
}

// ?raw 전역 스코프 — 종전 이름이 `timeAgo` 라 셸 전역(shell.js:1440)을 덮어써
// /settings 의 알림 목록이 "412일 전"처럼 표시되고 빈값이 '없음'이 되던 문제. 이름 격리.
function capsTimeAgo(dateStr) {
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
  list.innerHTML = samples.map(function(s) {
    var label = (s.fpid || s.e_idno) + (s.e_name ? ' · ' + s.e_name : '') + (s.c_dept ? ' (' + s.c_dept + ')' : '');
    return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white border border-amber-300 text-amber-800">' +
           escapeHtml(label) + '</span>';
  }).join('');
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
        '<td class="px-3 py-2 text-xs text-gray-500">' + escapeHtml(capsTriggerLabel[r.trigger_type] || r.trigger_type || '-') + '</td>' +
        '<td class="px-3 py-2 text-xs text-gray-500 tabular-nums" title="' + escapeHtml(range) + '">' + escapeHtml(range) + '</td>' +
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
      '<div><span class="text-gray-500">트리거</span><div class="mt-1">' + escapeHtml(capsTriggerLabel[r.trigger_type] || r.trigger_type || '-') + '</div></div>' +
      '<div><span class="text-gray-500">범위</span><div class="mt-1 tabular-nums text-xs">' + escapeHtml(range) + '</div></div>' +
      // notes = 워커가 보고한 버전. 비어 있으면 기간 지정/자동 갭 복구 미지원 구버전.
      '<div><span class="text-gray-500">워커 버전</span><div class="mt-1 text-xs">' +
        (r.notes ? escapeHtml(r.notes) : '<span class="text-amber-600">미보고(구버전)</span>') + '</div></div>' +
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

/** 'YYYY-MM-DD' → 'YYYYMMDD' (빈 값이면 빈 문자열) */
function capsYmdCompact(v) {
  var s = String(v || '').replace(/[^0-9]/g, '');
  return s.length === 8 ? s : '';
}

function clearCapsSyncRange() {
  var f = document.getElementById('capsSyncFrom');
  var t = document.getElementById('capsSyncTo');
  if (!f || !t) { console.warn('[capsSettings] #capsSyncFrom/#capsSyncTo not found'); return; }
  f.value = '';
  t.value = '';
}

async function triggerCapsSync() {
  var btn = document.getElementById('capsSyncBtn');
  var fromEl = document.getElementById('capsSyncFrom');
  var toEl = document.getElementById('capsSyncTo');
  if (!fromEl || !toEl) console.warn('[capsSettings] #capsSyncFrom/#capsSyncTo not found — 기간 없이 요청');

  var from = capsYmdCompact(fromEl && fromEl.value);
  var to = capsYmdCompact(toEl && toEl.value);

  // 한쪽만 입력된 경우는 서버에서도 막지만, 왕복 전에 즉시 안내
  if ((from && !to) || (!from && to)) {
    if (typeof showToast === 'function') showToast('기간은 시작일과 종료일을 모두 입력해 주세요', 'error');
    return;
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>요청 중...'; }
  try {
    var payload = { site_id: capsCurrentSiteId || 'DJ' };
    if (from && to) { payload.from_date = from; payload.to_date = to; }
    var res = await axios.post('/api/caps/sync/trigger', payload);
    if (res.data.success) {
      if (typeof showToast === 'function') {
        showToast(from && to
          ? from + ' ~ ' + to + ' 기간 동기화 요청 완료 — 워커가 30초 내 실행합니다'
          : '동기화 요청 완료 — 워커가 30초 내 실행합니다', 'success');
      }
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

// ============================================================================
// 사원 매핑 관리 (0624)
//   API(`/caps/employee-map`, `/caps/ignore-fpids`)는 처음부터 있었는데 **화면이 없었다.**
//   그래서 미매핑을 손댈 방법이 없었고, 미매핑 펀치는 ingest 가 조용히 skip 해서
//   그 직원은 그날 출근 기록이 없는 사람이 된다 → 결근으로 계산 → 급여 공제.
//   2026-09-18 실측: SM 사이트 미매핑 6명(김경수 포함)·DJ 사이트에 선명 직원 다수.
// ============================================================================
var capsEmpCache = [];      // MES 직원 목록
var capsMapCache = [];      // 현재 매핑

async function capsLoadEmployeeOptions() {
  if (capsEmpCache.length) return capsEmpCache;
  try {
    var res = await axios.get('/api/hr/employees', { params: { limit: 500, status: 'ACTIVE' } });
    var d = res.data && res.data.data;
    capsEmpCache = (d && (d.items || d)) || [];
    if (!Array.isArray(capsEmpCache)) capsEmpCache = [];
  } catch (e) { capsEmpCache = []; }
  return capsEmpCache;
}

function capsEmpSelectHtml(id) {
  var opts = ['<option value="">— 직원 선택 —</option>'].concat(capsEmpCache.map(function(e) {
    return '<option value="' + e.id + '">' + escapeHtml(e.name + (e.employee_code ? ' (' + e.employee_code + ')' : '')) + '</option>';
  }));
  return '<select id="' + id + '" class="px-2 py-1 border border-gray-300 rounded text-xs">' + opts.join('') + '</select>';
}

window.loadCapsEmployeeMap = async function() {
  if (!capsCurrentSiteId) return;
  await capsLoadEmployeeOptions();

  // 1) 현재 매핑
  try {
    var res = await axios.get('/api/caps/employee-map', { params: { site_id: capsCurrentSiteId } });
    capsMapCache = ((res.data && res.data.data) || []).filter(function(m) { return m.is_active === 1 || m.is_active === '1'; });
  } catch (e) { capsMapCache = []; }
  renderCapsMapped();

  // 2) 미매핑 + 무시목록은 사이트 레코드에서 (동기화가 남긴 값)
  var site = null;
  for (var i = 0; i < capsSitesCache.length; i++) if (capsSitesCache[i].id === capsCurrentSiteId) site = capsSitesCache[i];
  renderCapsUnmappedRows(site && site.last_unmapped);
  renderCapsIgnored(site && site.ignored_fpids);
};

function capsParseJson(raw) {
  try {
    var v = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

// ───────── 미매핑 행 (매핑 / 무시) ─────────
function renderCapsUnmappedRows(rawJson) {
  var wrap = document.getElementById('capsMapUnmappedList');
  var empty = document.getElementById('capsMapUnmappedEmpty');
  var cnt = document.getElementById('capsMapUnmappedCount');
  if (!wrap || !empty || !cnt) { console.warn('[capsSettings] 미매핑 요소 없음'); return; }
  var rows = capsParseJson(rawJson);
  // 이미 매핑된 지문번호는 목록에서 뺀다(동기화 이후 매핑했을 수 있다)
  var mapped = {};
  capsMapCache.forEach(function(m) { mapped[String(m.caps_e_idno)] = true; });
  rows = rows.filter(function(r) { return !mapped[String(r.fpid || r.e_idno)]; });

  cnt.textContent = rows.length;
  empty.classList.toggle('hidden', rows.length > 0);
  wrap.innerHTML = rows.map(function(r, i) {
    var fp = String(r.fpid || r.e_idno || '');
    var nm = r.e_name || '';
    var dept = r.c_dept || '';
    return '<div class="flex items-center gap-2 flex-wrap bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">'
      + '<span class="font-mono text-xs text-amber-900">' + escapeHtml(fp) + '</span>'
      + '<span class="text-xs text-gray-700">' + escapeHtml(nm || '(이름 없음)') + '</span>'
      + (dept ? '<span class="text-[10px] text-gray-400">' + escapeHtml(dept) + '</span>' : '')
      + '<div class="flex-1"></div>'
      + capsEmpSelectHtml('capsMapSel' + i)
      + '<button onclick="capsMapAssign(\'' + escapeJsAttr(fp) + '\',\'' + escapeJsAttr(nm) + '\',\'' + escapeJsAttr(dept) + '\',' + i + ')" '
      + 'class="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">매핑</button>'
      + '<button onclick="capsMapIgnore(\'' + escapeJsAttr(fp) + '\')" '
      + 'class="px-2 py-1 text-xs border border-gray-300 text-gray-600 bg-white rounded hover:bg-gray-50" '
      + 'title="관리자·테스트 지문 등 직원이 아닌 번호">무시</button>'
      + '</div>';
  }).join('');
}

window.capsMapAssign = async function(fpid, name, dept, idx) {
  var sel = document.getElementById('capsMapSel' + idx);
  var empId = sel && sel.value;
  if (!empId) { showToast('직원을 먼저 고르세요', 'warning'); return; }
  var emp = capsEmpCache.filter(function(e) { return String(e.id) === String(empId); })[0];
  var msg = '지문번호 ' + fpid + (name ? ' (' + name + ')' : '') + ' → ' + (emp ? emp.name : empId) + ' 로 매핑합니다.\n'
    + '⚠️ 이 직원이 다른 사이트에 매핑돼 있으면 그 매핑은 해제됩니다.';
  if (!(await showConfirm(msg))) return;
  try {
    await axios.post('/api/caps/employee-map', {
      site_id: capsCurrentSiteId, caps_e_idno: fpid, caps_e_name: name || null, caps_c_dept: dept || null,
      employee_id: Number(empId),
    });
    showToast('매핑했습니다 — 다음 동기화부터 근태가 들어옵니다', 'success');
    await loadCapsSites();
    loadCapsEmployeeMap();
  } catch (e) {
    showToast('매핑 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
};

window.capsMapIgnore = async function(fpid) {
  if (!(await showConfirm('지문번호 ' + fpid + ' 를 무시 목록에 넣습니다.\n앞으로 이 번호의 펀치는 미매핑으로 뜨지 않습니다.'))) return;
  try {
    await axios.post('/api/caps/ignore-fpids', { site_id: capsCurrentSiteId, fpids: [fpid] });
    showToast('무시 목록에 넣었습니다', 'success');
    await loadCapsSites();
    loadCapsEmployeeMap();
  } catch (e) {
    showToast('실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
};

// ───────── 무시 목록 ─────────
function renderCapsIgnored(rawJson) {
  var wrap = document.getElementById('capsIgnoredList');
  var empty = document.getElementById('capsIgnoredEmpty');
  var cnt = document.getElementById('capsIgnoredCount');
  if (!wrap || !empty || !cnt) return;
  var list = capsParseJson(rawJson);
  cnt.textContent = list.length;
  empty.classList.toggle('hidden', list.length > 0);
  wrap.innerHTML = list.map(function(f) {
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-100 border border-gray-200 text-gray-700">'
      + '<span class="font-mono">' + escapeHtml(String(f)) + '</span>'
      + '<button onclick="capsMapUnignore(\'' + escapeJsAttr(String(f)) + '\')" class="text-gray-400 hover:text-red-600" title="무시 해제">&times;</button>'
      + '</span>';
  }).join('');
}

window.capsMapUnignore = async function(fpid) {
  try {
    await axios.delete('/api/caps/ignore-fpids', { data: { site_id: capsCurrentSiteId, fpids: [fpid] } });
    showToast('무시 해제했습니다', 'success');
    await loadCapsSites();
    loadCapsEmployeeMap();
  } catch (e) {
    showToast('실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
};

// ───────── 매핑됨 ─────────
function renderCapsMapped() {
  var body = document.getElementById('capsMappedBody');
  var empty = document.getElementById('capsMappedEmpty');
  var cnt = document.getElementById('capsMappedCount');
  if (!body || !empty || !cnt) return;
  cnt.textContent = capsMapCache.length;
  empty.classList.toggle('hidden', capsMapCache.length > 0);
  body.innerHTML = capsMapCache.map(function(m) {
    var recent = Number(m.recent_attendance || 0);
    // ★매핑돼 있어도 근태가 0이면 실제로는 안 붙는 것이다 — 그 사람은 결근으로 잡힌다
    var recentCell = recent > 0
      ? '<span class="text-gray-700 tabular-nums">' + recent + '건</span>'
      : '<span class="text-rose-600 font-semibold" title="매핑은 살아 있지만 최근 30일 근태가 없습니다. 단말을 안 쓰거나 다른 사이트에서 찍고 있을 수 있습니다.">0건 ⚠</span>';
    return '<tr>'
      + '<td class="font-mono text-gray-500">' + escapeHtml(m.site_id || '') + '</td>'
      + '<td class="font-mono">' + escapeHtml(String(m.caps_e_idno || '')) + '</td>'
      + '<td class="text-gray-600">' + escapeHtml(m.caps_e_name || '-') + '</td>'
      + '<td>' + escapeHtml(m.employee_name || '(삭제된 직원)') + (m.employee_code ? ' <span class="text-[10px] text-gray-400">' + escapeHtml(m.employee_code) + '</span>' : '') + '</td>'
      + '<td class="text-right">' + recentCell + '</td>'
      + '<td class="text-right"><button onclick="capsMapRemove(' + m.id + ')" class="text-gray-400 hover:text-red-600" title="매핑 해제"><i class="fas fa-unlink"></i></button></td>'
      + '</tr>';
  }).join('');
}

window.capsMapRemove = async function(id) {
  if (!(await showConfirm('이 매핑을 해제합니다.\n해제하면 그 지문번호의 펀치는 버려지고, 해당 직원은 결근으로 잡힙니다.', { danger: true }))) return;
  try {
    await axios.delete('/api/caps/employee-map/' + id);
    showToast('매핑을 해제했습니다', 'success');
    loadCapsEmployeeMap();
  } catch (e) {
    showToast('실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
};
