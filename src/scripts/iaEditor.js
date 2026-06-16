// iaEditor.js — IA 편집·접수 워크벤치
// spec: docs/superpowers/specs/2026-06-16-ia-editor-nesting-intake.md §5.1·5.2·5.3·5.6
// P1a: 업로드→탭→ExtractGroups 폴링→그룹 썸네일.
// P2 (web 근사): 그룹 선택 → 처리설정 인스펙터(목표크기→배율·마감 상/하/좌/우→여백·회전90°·복제수)
//     + CSS 근사 미리보기 + 프리플라이트 경고. "편집 = 그림 수정 ❌, 처리 설정 ⭕".
//     IA 실제 렌더 미리보기는 에이전트 preview 잡 연동 후(별도 세션). 네스팅·주문 라인은 P3·P4.

var IAE_STORE_KEY = 'iae_session_ids';
var IAE_SETTINGS_KEY = 'iae_settings_v1';
var iaeFiles = [];        // [{id, filename, status, error_message, group_count, groups:[]}]
var iaeActiveId = null;
var iaeActiveGroup = null; // 활성 파일 내 선택 그룹 index
var iaePollTimer = null;
var iaeFinMethods = [];   // [{name, margin_cm}]
var iaeFinPresets = [];   // [{name, config}]
var iaeSettings = {};     // key 'fid:gidx' → {target_w,target_h,aspect_lock,rotate90,dup_count,fin_top,fin_bottom,fin_left,fin_right}

function iaeEscape(s) {
  if (window.escapeHtml) return window.escapeHtml(s == null ? '' : String(s));
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}
function iaeToast(msg, type) { if (window.showToast) window.showToast(msg, type || 'info'); }

// ── 세션 id 영속 (localStorage) ───────────────────────────────────
function iaeLoadIds() {
  try {
    var raw = localStorage.getItem(IAE_STORE_KEY);
    var arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(function (n) { return typeof n === 'number'; }) : [];
  } catch (_e) { return []; }
}
function iaeSaveIds(ids) { try { localStorage.setItem(IAE_STORE_KEY, JSON.stringify(ids)); } catch (_e) {} }
function iaeAddId(id) { var ids = iaeLoadIds(); if (ids.indexOf(id) === -1) ids.push(id); iaeSaveIds(ids); }
function iaeRemoveId(id) { iaeSaveIds(iaeLoadIds().filter(function (n) { return n !== id; })); }

// ── 처리설정 영속 (그룹별) ────────────────────────────────────────
function iaeLoadSettings() {
  try { var raw = localStorage.getItem(IAE_SETTINGS_KEY); iaeSettings = raw ? (JSON.parse(raw) || {}) : {}; }
  catch (_e) { iaeSettings = {}; }
}
function iaeSaveSettings() { try { localStorage.setItem(IAE_SETTINGS_KEY, JSON.stringify(iaeSettings)); } catch (_e) {} }
function iaeSettingsKey(fid, gidx) { return fid + ':' + gidx; }
function iaeGetSettings(fid, group, gidx) {
  var key = iaeSettingsKey(fid, gidx);
  if (!iaeSettings[key]) {
    var dw = (group && group.width_mm != null) ? Math.round(group.width_mm / 10) : 0;
    var dh = (group && group.height_mm != null) ? Math.round(group.height_mm / 10) : 0;
    iaeSettings[key] = {
      target_w: dw, target_h: dh, aspect_lock: true, rotate90: false, dup_count: 1,
      fin_top: '', fin_bottom: '', fin_left: '', fin_right: ''
    };
  }
  return iaeSettings[key];
}

// ── 마감방식 데이터 로드 ──────────────────────────────────────────
function iaeLoadFinishing() {
  axios.get('/api/finishing/methods').then(function (res) {
    iaeFinMethods = (res.data && res.data.data) || [];
  }).catch(function (_e) { /* 마감 데이터 실패는 무시 — 셀렉트만 비게 됨 */ })
    .finally(function () {
      axios.get('/api/finishing/presets').then(function (res) {
        iaeFinPresets = (res.data && res.data.data) || [];
      }).catch(function (_e) {}).finally(function () { iaeRenderPanel(); });
    });
}
function iaeMarginOf(name) {
  if (!name) return 0;
  var m = iaeFinMethods.filter(function (x) { return x.name === name; })[0];
  return m ? (Number(m.margin_cm) || 0) : 0;
}
function iaeComputeMargins(s) {
  return { t: iaeMarginOf(s.fin_top), b: iaeMarginOf(s.fin_bottom), l: iaeMarginOf(s.fin_left), r: iaeMarginOf(s.fin_right) };
}

// ── 업로드 ────────────────────────────────────────────────────────
function iaeUpload(fileList) {
  var files = Array.prototype.slice.call(fileList || []);
  if (files.length === 0) return;
  iaeToast(files.length + '개 파일 업로드 중...', 'info');
  var chain = Promise.resolve();
  var okCount = 0;
  files.forEach(function (f) {
    chain = chain.then(function () {
      var fd = new FormData();
      fd.append('file', f);
      return axios.post('/api/workbench/files/analyze', fd)
        .then(function (res) {
          var d = res.data && res.data.data;
          if (d && d.id) { iaeAddId(d.id); okCount++; if (iaeActiveId == null) iaeActiveId = d.id; }
        })
        .catch(function (err) {
          console.error('[ia-editor] upload fail', f.name, err);
          var msg = (err.response && err.response.data && err.response.data.error) || (f.name + ' 업로드 실패');
          iaeToast(msg, 'error');
        });
    });
  });
  chain.then(function () {
    if (okCount > 0) iaeToast(okCount + '개 분석 요청 완료', 'success');
    iaeRefresh();
  });
}

// ── 데이터 새로고침 + 폴링 ────────────────────────────────────────
function iaeRefresh() {
  var ids = iaeLoadIds();
  if (ids.length === 0) { iaeFiles = []; iaeRenderTabs(); iaeRenderPanel(); return; }
  axios.get('/api/workbench/files', { params: { ids: ids.join(',') } })
    .then(function (res) {
      iaeFiles = (res.data && res.data.data) || [];
      var present = iaeFiles.map(function (f) { return f.id; });
      var cleaned = ids.filter(function (n) { return present.indexOf(n) !== -1; });
      if (cleaned.length !== ids.length) iaeSaveIds(cleaned);
      if (iaeActiveId == null || present.indexOf(iaeActiveId) === -1) {
        iaeActiveId = present.length ? present[0] : null;
        iaeActiveGroup = null;
      }
      iaeRenderTabs();
      iaeRenderPanel();
      iaeSchedulePoll();
    })
    .catch(function (err) { console.error('[ia-editor] files load fail', err); });
}
function iaeSchedulePoll() {
  if (iaePollTimer) { clearTimeout(iaePollTimer); iaePollTimer = null; }
  var pending = iaeFiles.some(function (f) {
    return f.status === 'uploading' || f.status === 'pending' || f.status === 'processing';
  });
  if (pending) iaePollTimer = setTimeout(iaeRefresh, 3000);
}

// ── 탭 ────────────────────────────────────────────────────────────
function iaeStatusBadge(status) {
  var map = {
    uploading: ['bg-gray-100 text-gray-600', '업로드 중'],
    pending: ['bg-amber-50 text-amber-700', '분석 대기'],
    processing: ['bg-blue-50 text-blue-700', '분석 중'],
    done: ['bg-green-50 text-green-700', '완료'],
    error: ['bg-red-50 text-red-700', '실패']
  };
  var m = map[status] || ['bg-gray-100 text-gray-600', status || '-'];
  return '<span class="rounded-full px-2 py-0.5 text-xs font-medium ' + m[0] + '">' + iaeEscape(m[1]) + '</span>';
}
function iaeRenderTabs() {
  var el = document.getElementById('iaeTabs');
  if (!el) { console.warn('[ia-editor] #iaeTabs not found'); return; }
  if (iaeFiles.length === 0) { el.innerHTML = ''; return; }
  var html = '';
  iaeFiles.forEach(function (f) {
    var active = (f.id === iaeActiveId);
    var cls = active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-transparent text-gray-600 hover:bg-gray-50';
    html += '<div class="iae-tab flex items-center gap-2 px-3 py-2 border-b-2 cursor-pointer whitespace-nowrap ' + cls + '" data-id="' + f.id + '">'
      + '<i class="fas fa-file-image text-gray-400"></i>'
      + '<span class="text-sm font-medium truncate" style="max-width:160px;">' + iaeEscape(f.filename) + '</span>'
      + iaeStatusBadge(f.status)
      + '<button class="iae-tab-close text-gray-300 hover:text-red-500 ml-1" data-close="' + f.id + '" title="닫기"><i class="fas fa-times"></i></button>'
      + '</div>';
  });
  el.innerHTML = html;
  Array.prototype.forEach.call(el.querySelectorAll('.iae-tab'), function (t) {
    t.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.iae-tab-close')) return;
      iaeActiveId = parseInt(t.getAttribute('data-id'), 10);
      iaeActiveGroup = null;
      iaeRenderTabs(); iaeRenderPanel();
    });
  });
  Array.prototype.forEach.call(el.querySelectorAll('.iae-tab-close'), function (b) {
    b.addEventListener('click', function (e) { e.stopPropagation(); iaeCloseTab(parseInt(b.getAttribute('data-close'), 10)); });
  });
}
function iaeCloseTab(id) {
  iaeRemoveId(id);
  iaeFiles = iaeFiles.filter(function (f) { return f.id !== id; });
  if (iaeActiveId === id) { iaeActiveId = iaeFiles.length ? iaeFiles[0].id : null; iaeActiveGroup = null; }
  iaeRenderTabs(); iaeRenderPanel();
}

// ── 패널 (활성 파일: 그룹 리스트 + 인스펙터) ──────────────────────
function iaeRenderPanel() {
  var panel = document.getElementById('iaePanel');
  var empty = document.getElementById('iaeEmpty');
  if (!panel) { console.warn('[ia-editor] #iaePanel not found'); return; }
  var f = iaeFiles.filter(function (x) { return x.id === iaeActiveId; })[0];
  if (!f) { panel.innerHTML = ''; if (empty) empty.classList.remove('hidden'); return; }
  if (empty) empty.classList.add('hidden');

  var head = '<div class="flex items-center justify-between mb-4">'
    + '<div class="flex items-center gap-2"><span class="text-base font-bold text-gray-900">' + iaeEscape(f.filename) + '</span>' + iaeStatusBadge(f.status) + '</div>'
    + '<button id="iaeRefreshBtn" class="text-sm text-gray-500 hover:text-blue-600"><i class="fas fa-rotate-right mr-1"></i>새로고침</button>'
    + '</div>';

  // 비완료 상태
  if (f.status === 'error') {
    panel.innerHTML = head + '<div class="border border-dashed border-red-200 rounded-lg p-8 text-center text-sm text-red-500">분석 실패'
      + (f.error_message ? '<br><span class="text-xs text-red-400">' + iaeEscape(f.error_message) + '</span>' : '') + '</div>';
    iaeWireRefresh();
    return;
  }
  if (f.status !== 'done') {
    panel.innerHTML = head + '<div class="border border-dashed border-gray-200 rounded-lg p-10 text-center text-gray-400">'
      + '<i class="fas fa-spinner fa-spin text-2xl mb-2"></i><div class="text-sm">ExtractGroups 분석 중입니다…</div></div>';
    iaeWireRefresh();
    return;
  }
  if (!f.groups || f.groups.length === 0) {
    panel.innerHTML = head + '<div class="border border-dashed border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">추출된 그룹이 없습니다</div>';
    iaeWireRefresh();
    return;
  }

  // 완료: 활성 그룹 기본값
  var gis = f.groups.map(function (g, i) { return (g.index != null) ? g.index : i; });
  if (iaeActiveGroup == null || gis.indexOf(iaeActiveGroup) === -1) iaeActiveGroup = gis[0];

  // 좌: 그룹 리스트
  var listHtml = '<div class="text-xs font-semibold text-gray-500 mb-2">그룹 (' + f.groups.length + ')</div><div class="space-y-2">';
  f.groups.forEach(function (g, i) {
    var gi = gis[i];
    var sel = (gi === iaeActiveGroup);
    var thumb = g.thumbnail_base64
      ? '<img src="data:image/png;base64,' + g.thumbnail_base64 + '" class="w-full h-16 object-contain bg-gray-50">'
      : '<div class="w-full h-16 flex items-center justify-center bg-gray-50 text-gray-300"><i class="fas fa-image"></i></div>';
    var dims = (g.width_mm != null && g.height_mm != null) ? (Math.round(g.width_mm / 10) + '×' + Math.round(g.height_mm / 10) + 'cm') : '-';
    listHtml += '<div class="iae-group cursor-pointer rounded-lg border ' + (sel ? 'border-blue-500 ring-1 ring-blue-300' : 'border-gray-200 hover:border-gray-300') + ' overflow-hidden" data-gi="' + gi + '">'
      + thumb
      + '<div class="px-2 py-1 border-t border-gray-100"><div class="text-xs font-semibold text-gray-700 truncate">#' + gi + ' ' + iaeEscape(g.name || '') + '</div><div class="text-[11px] text-gray-400">' + dims + '</div></div>'
      + '</div>';
  });
  listHtml += '</div>';

  panel.innerHTML = head
    + '<div class="flex gap-5 items-start">'
    + '<div class="w-40 flex-shrink-0 overflow-y-auto" style="max-height:560px;">' + listHtml + '</div>'
    + '<div class="flex-1 min-w-0" id="iaeInspector"></div>'
    + '</div>';

  iaeWireRefresh();
  Array.prototype.forEach.call(panel.querySelectorAll('.iae-group'), function (el) {
    el.addEventListener('click', function () { iaeActiveGroup = parseInt(el.getAttribute('data-gi'), 10); iaeRenderPanel(); });
  });
  iaeRenderInspector(f);
}
function iaeWireRefresh() {
  var rb = document.getElementById('iaeRefreshBtn');
  if (rb) rb.addEventListener('click', iaeRefresh);
}

// ── 인스펙터 (처리 설정 + 근사 미리보기 + 프리플라이트) ───────────
function iaeMethodOptions(selected) {
  var html = '<option value="">없음</option>';
  iaeFinMethods.forEach(function (m) {
    html += '<option value="' + iaeEscape(m.name) + '"' + (m.name === selected ? ' selected' : '') + '>'
      + iaeEscape(m.name) + ' (' + (Number(m.margin_cm) || 0) + 'cm)</option>';
  });
  return html;
}
function iaeRenderInspector(f) {
  var host = document.getElementById('iaeInspector');
  if (!host) return;
  var group = f.groups.filter(function (g, i) { return ((g.index != null) ? g.index : i) === iaeActiveGroup; })[0];
  if (!group) { host.innerHTML = '<div class="text-sm text-gray-400 p-6">그룹을 선택하세요</div>'; return; }
  var s = iaeGetSettings(f.id, group, iaeActiveGroup);

  var presetOpts = '<option value="">마감 프리셋…</option>';
  iaeFinPresets.forEach(function (p) { presetOpts += '<option value="' + iaeEscape(p.name) + '">' + iaeEscape(p.name) + '</option>'; });

  var inputCls = 'border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  var selCls = 'w-full ' + inputCls;

  var html = ''
    + '<div class="grid grid-cols-1 lg:grid-cols-2 gap-5">'
    // 설정 폼
    + '<div>'
    + '<div class="text-sm font-semibold text-gray-700 mb-3">처리 설정 — #' + iaeActiveGroup + ' ' + iaeEscape(group.name || '') + '</div>'
    + '<div class="space-y-3">'
    // 목표 크기
    + '<div><label class="block text-xs text-gray-500 mb-1">목표 크기 (cm)</label>'
    + '<div class="flex items-center gap-2">'
    + '<input id="iaeTW" type="number" min="0" step="0.1" value="' + s.target_w + '" class="w-24 ' + inputCls + '" placeholder="W">'
    + '<span class="text-gray-400">×</span>'
    + '<input id="iaeTH" type="number" min="0" step="0.1" value="' + s.target_h + '" class="w-24 ' + inputCls + '" placeholder="H">'
    + '<label class="flex items-center gap-1 text-xs text-gray-600 ml-1 cursor-pointer"><input id="iaeAspect" type="checkbox"' + (s.aspect_lock ? ' checked' : '') + '> 비율잠금</label>'
    + '</div></div>'
    // 마감 프리셋
    + '<div><label class="block text-xs text-gray-500 mb-1">마감 프리셋</label><select id="iaePreset" class="' + selCls + '">' + presetOpts + '</select></div>'
    // 마감 상/하/좌/우
    + '<div class="grid grid-cols-2 gap-2">'
    + '<div><label class="block text-xs text-gray-500 mb-1">상</label><select id="iaeFinTop" class="' + selCls + '">' + iaeMethodOptions(s.fin_top) + '</select></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">하</label><select id="iaeFinBottom" class="' + selCls + '">' + iaeMethodOptions(s.fin_bottom) + '</select></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">좌</label><select id="iaeFinLeft" class="' + selCls + '">' + iaeMethodOptions(s.fin_left) + '</select></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">우</label><select id="iaeFinRight" class="' + selCls + '">' + iaeMethodOptions(s.fin_right) + '</select></div>'
    + '</div>'
    // 회전 / 복제
    + '<div class="flex items-center gap-4">'
    + '<label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input id="iaeRot" type="checkbox"' + (s.rotate90 ? ' checked' : '') + '> 90° 회전</label>'
    + '<div class="flex items-center gap-2"><label class="text-xs text-gray-500">복제수</label><input id="iaeDup" type="number" min="1" step="1" value="' + (s.dup_count || 1) + '" class="w-20 ' + inputCls + '"></div>'
    + '</div>'
    + '</div></div>'
    // 미리보기 + 프리플라이트
    + '<div>'
    + '<div class="text-sm font-semibold text-gray-700 mb-3">미리보기 <span class="text-xs font-normal text-gray-400">(웹 근사 · IA 실제 렌더는 연동 후)</span></div>'
    + '<div id="iaePreview" class="bg-gray-50 border border-gray-200 rounded-lg p-3 min-h-[200px] flex items-center justify-center"></div>'
    + '<div id="iaePreflight" class="mt-3"></div>'
    + '</div>'
    + '</div>';

  host.innerHTML = html;

  // 입력 변경 → 설정 갱신 + 미리보기/프리플라이트 즉시 반영 (폼 재렌더 없이 포커스 유지)
  function sync() {
    var tw = parseFloat(document.getElementById('iaeTW').value) || 0;
    var th = parseFloat(document.getElementById('iaeTH').value) || 0;
    s.target_w = tw; s.target_h = th;
    s.aspect_lock = document.getElementById('iaeAspect').checked;
    s.rotate90 = document.getElementById('iaeRot').checked;
    s.dup_count = parseInt(document.getElementById('iaeDup').value, 10) || 1;
    s.fin_top = document.getElementById('iaeFinTop').value;
    s.fin_bottom = document.getElementById('iaeFinBottom').value;
    s.fin_left = document.getElementById('iaeFinLeft').value;
    s.fin_right = document.getElementById('iaeFinRight').value;
    iaeSaveSettings();
    iaeUpdatePreview(group, s);
  }
  var detAspect = (group.width_mm && group.height_mm) ? (group.width_mm / group.height_mm) : 0;
  var twEl = document.getElementById('iaeTW'), thEl = document.getElementById('iaeTH');
  twEl.addEventListener('input', function () {
    if (document.getElementById('iaeAspect').checked && detAspect > 0) {
      var w = parseFloat(twEl.value) || 0; if (w > 0) thEl.value = Math.round((w / detAspect) * 10) / 10;
    }
    sync();
  });
  thEl.addEventListener('input', function () {
    if (document.getElementById('iaeAspect').checked && detAspect > 0) {
      var h = parseFloat(thEl.value) || 0; if (h > 0) twEl.value = Math.round((h * detAspect) * 10) / 10;
    }
    sync();
  });
  ['iaeAspect', 'iaeRot', 'iaeDup', 'iaeFinTop', 'iaeFinBottom', 'iaeFinLeft', 'iaeFinRight'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', sync);
  });
  // 프리셋 적용 → 4면 채우고 폼 재렌더
  var preEl = document.getElementById('iaePreset');
  if (preEl) preEl.addEventListener('change', function () {
    var p = iaeFinPresets.filter(function (x) { return x.name === preEl.value; })[0];
    if (!p) return;
    var cfg = {};
    try { cfg = (typeof p.config === 'string') ? JSON.parse(p.config) : (p.config || {}); } catch (_e) { cfg = {}; }
    s.fin_top = cfg.top || ''; s.fin_bottom = cfg.bottom || ''; s.fin_left = cfg.left || ''; s.fin_right = cfg.right || '';
    iaeSaveSettings();
    iaeRenderInspector(f); // 셀렉트 반영 위해 재렌더
  });

  iaeUpdatePreview(group, s);
}

function iaeUpdatePreview(group, s) {
  var pv = document.getElementById('iaePreview');
  var pf = document.getElementById('iaePreflight');
  if (pv) pv.innerHTML = iaeBuildPreviewHTML(group, s);
  if (pf) pf.innerHTML = iaeBuildPreflightHTML(group, s);
}
function iaeBuildPreviewHTML(group, s) {
  var tw = Number(s.target_w) || 0, th = Number(s.target_h) || 0;
  if (tw <= 0 || th <= 0) return '<div class="text-sm text-gray-400 text-center">목표 크기를 입력하면 미리보기가 표시됩니다</div>';
  var rot = !!s.rotate90;
  var dispW = rot ? th : tw, dispH = rot ? tw : th;
  var maxPx = 300, ratio = dispW / dispH, boxW, boxH;
  if (ratio >= 1) { boxW = maxPx; boxH = Math.max(40, Math.round(maxPx / ratio)); }
  else { boxH = maxPx; boxW = Math.max(40, Math.round(maxPx * ratio)); }
  var ppcW = boxW / dispW, ppcH = boxH / dispH;
  var m = iaeComputeMargins(s);
  var mt = Math.round(m.t * ppcH), mb = Math.round(m.b * ppcH), ml = Math.round(m.l * ppcW), mr = Math.round(m.r * ppcW);
  var thumb = group.thumbnail_base64 ? ('data:image/png;base64,' + group.thumbnail_base64) : '';
  var ov = 'position:absolute;background:rgba(245,158,11,0.20);';
  var html = '<div><div class="relative mx-auto bg-white border border-gray-300" style="width:' + boxW + 'px;height:' + boxH + 'px;">';
  html += '<div class="absolute" style="top:' + mt + 'px;bottom:' + mb + 'px;left:' + ml + 'px;right:' + mr + 'px;background:#fff;overflow:hidden;">';
  html += thumb ? '<img src="' + thumb + '" style="width:100%;height:100%;object-fit:contain;">'
    : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#cbd5e1;"><i class="fas fa-image text-2xl"></i></div>';
  html += '</div>';
  if (mt > 0) html += '<div style="' + ov + 'top:0;left:0;right:0;height:' + mt + 'px;"></div>';
  if (mb > 0) html += '<div style="' + ov + 'bottom:0;left:0;right:0;height:' + mb + 'px;"></div>';
  if (ml > 0) html += '<div style="' + ov + 'top:0;bottom:0;left:0;width:' + ml + 'px;"></div>';
  if (mr > 0) html += '<div style="' + ov + 'top:0;bottom:0;right:0;width:' + mr + 'px;"></div>';
  html += '</div>';
  var dupTxt = (Number(s.dup_count) || 1) > 1 ? (' · ×' + (Number(s.dup_count) || 1) + '매') : '';
  html += '<div class="text-center text-xs text-gray-500 mt-2">출력 ' + dispW + '×' + dispH + 'cm' + (rot ? ' (90° 회전)' : '')
    + ' · 여백 상' + m.t + '/하' + m.b + '/좌' + m.l + '/우' + m.r + 'cm' + dupTxt + '</div></div>';
  return html;
}
function iaeBuildPreflightHTML(group, s) {
  var warns = [];
  var tw = Number(s.target_w) || 0, th = Number(s.target_h) || 0;
  if (tw <= 0 || th <= 0) warns.push(['err', '목표 크기(W×H)를 입력하세요']);
  var dw = (group.width_mm != null) ? group.width_mm / 10 : 0;
  var dh = (group.height_mm != null) ? group.height_mm / 10 : 0;
  if (tw > 0 && th > 0 && dw > 0 && dh > 0) {
    var ta = tw / th, da = dw / dh, rota = dh / dw;
    var diff = Math.min(Math.abs(ta - da), Math.abs(ta - rota)) / da;
    if (diff > 0.05) warns.push(['warn', '원본 비율(' + Math.round(dw) + '×' + Math.round(dh) + 'cm)과 목표 비율이 다릅니다 — 잘림/여백 발생 가능']);
    var sc = tw / dw;
    if (sc > 1.5) warns.push(['info', '목표가 검출 크기의 ' + sc.toFixed(1) + '배 — 확대 출력(해상도 확인)']);
  }
  if ((Number(s.dup_count) || 1) < 1) warns.push(['err', '복제수는 1 이상이어야 합니다']);
  if (warns.length === 0) return '<div class="text-xs text-green-600"><i class="fas fa-circle-check mr-1"></i>프리플라이트 이상 없음</div>';
  var color = { err: 'text-red-600', warn: 'text-amber-600', info: 'text-blue-600' };
  var icon = { err: 'fa-circle-exclamation', warn: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  return '<div class="space-y-1">' + warns.map(function (w) {
    return '<div class="text-xs ' + color[w[0]] + '"><i class="fas ' + icon[w[0]] + ' mr-1"></i>' + iaeEscape(w[1]) + '</div>';
  }).join('') + '</div>';
}

// ── 초기화 (모든 함수 정의 이후, 파일 맨 아래) ────────────────────
(function initIaEditor() {
  iaeLoadSettings();
  var drop = document.getElementById('iaeDrop');
  var input = document.getElementById('iaeFileInput');
  if (drop && input) {
    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('border-blue-400', 'bg-blue-50'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('border-blue-400', 'bg-blue-50'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      drop.classList.remove('border-blue-400', 'bg-blue-50');
      if (e.dataTransfer && e.dataTransfer.files) iaeUpload(e.dataTransfer.files);
    });
    input.addEventListener('change', function () { if (input.files) iaeUpload(input.files); input.value = ''; });
  } else {
    console.warn('[ia-editor] #iaeDrop / #iaeFileInput not found');
  }
  var ids = iaeLoadIds();
  iaeActiveId = ids.length ? ids[0] : null;
  iaeLoadFinishing(); // 마감 데이터 로드 후 패널 렌더
  iaeRefresh();
})();
