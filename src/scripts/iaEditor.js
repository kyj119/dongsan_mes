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

// ── 뷰 상태 ───────────────────────────────────────────
var iaeView = 'edit';     // 'edit' | 'canvas' (구 'nest' 탭은 통합 폐기 — 대지 편집 시트 네스팅이 대체)
// 규격 프리셋 (cm) — 롤폭 914~1520mm, 평판 900×1800·1200×2400 (spec §12). 대지 시트 네스팅 공용
var IAE_ROLL_PRESETS = [
  { label: '914mm 롤', w: 91.4 }, { label: '1050mm 롤', w: 105 }, { label: '1270mm 롤', w: 127 },
  { label: '1370mm 롤', w: 137 }, { label: '1520mm 롤', w: 152 }
];
var IAE_FLAT_PRESETS = [{ label: '평판 900×1800', w: 90, h: 180 }, { label: '평판 1200×2400', w: 120, h: 240 }];

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

  // 좌: 그룹 리스트 + 인스펙터 (검출보정 캔버스는 §14.5 폐기 — '대지 편집' 뷰가 시안 편집 담당)
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

// ── Konva 동적 로드 (대지 편집 캔버스 N1~ 공용) ──
// 검출보정 캔버스/좌표보정(iae_corrections_v1)은 §14.5 폐기 — '대지 편집' 뷰로 대체.
var iaeKonvaLoading = false, iaeKonvaCbs = [];

function iaeLoadKonva(cb) {
  if (window.Konva) { cb(); return; }
  iaeKonvaCbs.push(cb);
  if (iaeKonvaLoading) return;
  iaeKonvaLoading = true;
  var sc = document.createElement('script');
  sc.src = 'https://cdn.jsdelivr.net/npm/konva@9.3.6/konva.min.js';
  sc.onload = function () { iaeKonvaLoading = false; var cbs = iaeKonvaCbs.slice(); iaeKonvaCbs = []; cbs.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); };
  sc.onerror = function () { iaeKonvaLoading = false; iaeKonvaCbs = []; console.warn('[ia-editor] Konva 로드 실패'); iaeToast('캔버스 라이브러리 로드 실패', 'error'); };
  document.head.appendChild(sc);
}

// 그룹 유효 크기(mm) — 인스펙터 표시용 (검출보정 폐기로 단순화: 검출 원본 크기)
function iaeEffMm(fid, group, gi) {
  return { w_mm: (group && group.width_mm != null) ? group.width_mm : 0, h_mm: (group && group.height_mm != null) ? group.height_mm : 0 };
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
  var eff = iaeEffMm(f.id, group, iaeActiveGroup);
  var effW = Math.round((eff.w_mm || 0) / 10), effH = Math.round((eff.h_mm || 0) / 10);

  var presetOpts = '<option value="">마감 프리셋…</option>';
  iaeFinPresets.forEach(function (p) { presetOpts += '<option value="' + iaeEscape(p.name) + '">' + iaeEscape(p.name) + '</option>'; });

  var inputCls = 'border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  var selCls = 'w-full ' + inputCls;

  var html = ''
    + '<div class="grid grid-cols-1 lg:grid-cols-2 gap-5">'
    // 설정 폼
    + '<div>'
    + '<div class="flex items-center justify-between mb-3">'
    + '<span class="text-sm font-semibold text-gray-700">#' + iaeActiveGroup + ' ' + iaeEscape(group.name || '') + ' <span class="text-xs font-normal text-gray-400">검출 ' + effW + '×' + effH + 'cm · <span class="text-blue-500">대지 편집에서 네스팅</span></span></span>'
    + '</div>'
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
  function updatePv() {
    iaeUpdatePreview(group, s);
  }

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
    updatePv();
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

  updatePv();
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
  html += thumb ? '<img id="iaePreviewImg" src="' + thumb + '" style="width:100%;height:100%;object-fit:contain;">'
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

// ── P3 시트 네스팅 ────────────────────────────────────────────────
// 뷰 토글 (파일 처리 / 대지 편집) — 구 '네스팅' 탭은 §통합으로 폐기(대지 편집 시트 네스팅이 대체)
function iaeSetView(v) {
  iaeView = v;
  var ev = document.getElementById('iaeEditView'), cv = document.getElementById('iaeCanvasView');
  var be = document.getElementById('iaeViewEdit'), bc = document.getElementById('iaeViewCanvas');
  if (ev) ev.classList.toggle('hidden', v !== 'edit');
  if (cv) cv.classList.toggle('hidden', v !== 'canvas');
  var on = 'border-blue-500 bg-blue-50 text-blue-700', off = 'border-gray-200 text-gray-600 hover:bg-gray-50';
  var cls = function (sel) { return 'px-4 py-2 rounded-lg text-sm font-medium border ' + (v === sel ? on : off); };
  if (be) be.className = cls('edit');
  if (bc) bc.className = cls('canvas');
  if (v === 'canvas') iaeRenderCanvas();
}

// shelfBinPack 포팅 (원본: src/scripts/orderForm/sheet.js:402) — 폭 고정·면적 내림차순 shelf 적재 + 회전
// (대지 편집 시트 네스팅 iaeCanNestPlace이 사용)
function iaeShelfBinPack(items, availableWidth, gap) {
  if (!items || !items.length) return { error: true, msg: '배치할 항목이 없습니다' };
  gap = gap || 0;
  var sorted = items.slice().sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });
  var shelves = [], placements = [];
  for (var i = 0; i < sorted.length; i++) {
    var it = sorted[i], placed = false;
    for (var si = 0; si < shelves.length; si++) {
      var sh = shelves[si];
      var xGap = sh.itemCount > 0 ? gap : 0;
      var ors = [{ w: it.w, h: it.h, rotated: false }, { w: it.h, h: it.w, rotated: true }];
      for (var oi = 0; oi < ors.length; oi++) {
        var o = ors[oi];
        if (sh.usedWidth + xGap + o.w <= availableWidth + 1e-6) {
          placements.push({ id: it.id, x_cm: sh.usedWidth + xGap, y_cm: sh.y, width_cm: o.w, height_cm: o.h, rotated: o.rotated });
          sh.usedWidth += xGap + o.w; sh.itemCount++; if (o.h > sh.height) sh.height = o.h; placed = true; break;
        }
      }
      if (placed) break;
    }
    if (!placed) {
      var ors2 = [{ w: it.w, h: it.h, rotated: false }, { w: it.h, h: it.w, rotated: true }], chosen = null;
      for (var oi2 = 0; oi2 < ors2.length; oi2++) { if (ors2[oi2].w <= availableWidth + 1e-6) { chosen = ors2[oi2]; break; } }
      if (!chosen) return { error: true, msg: '항목이 폭보다 큽니다: ' + it.w.toFixed(1) + '×' + it.h.toFixed(1) + 'cm' };
      var prev = shelves[shelves.length - 1];
      var yGap = prev ? gap : 0;
      var newY = prev ? prev.y + prev.height + yGap : 0;
      shelves.push({ y: newY, height: chosen.h, usedWidth: chosen.w, itemCount: 1 });
      placements.push({ id: it.id, x_cm: 0, y_cm: newY, width_cm: chosen.w, height_cm: chosen.h, rotated: chosen.rotated });
    }
  }
  var last = shelves[shelves.length - 1];
  var totalHeight = last ? last.y + last.height : 0;
  return { error: false, placements: placements, total_height_cm: totalHeight, shelves: shelves };
}
function iaeShiftP(p, m) { return { id: p.id, x_cm: p.x_cm + m, y_cm: p.y_cm + m, width_cm: p.width_cm, height_cm: p.height_cm, rotated: p.rotated }; }


// ════════════════════════════════════════════════════════════════
// N1: 자유 대지 캔버스 (그룹=객체, 실제크기 비율, 드래그/리사이즈/회전, 핫키 골격)
//   spec §14.4 N1. 마감/여백/돔보 벡터근사=N2, 네스팅=N3, 주문연결=N4, 단일그룹돔보=N5.
//   객체 좌표는 mm(대지 원점 좌상단), Konva stage.scale/position으로 줌/팬. localStorage 영속.
// ════════════════════════════════════════════════════════════════
var IAE_CANVAS_KEY = 'iae_canvas_v1';
var iaeCanObjs = [];          // [{uid, fid, gi, key, label, w_mm, h_mm, x_mm, y_mm, rotation, fin:{top,bottom,left,right}, trim}]
var iaeCanStage = null, iaeCanLayer = null, iaeCanGrid = null, iaeCanOverlay = null, iaeCanTr = null;
var iaeCanSel = null;         // 선택 객체 uid
var iaeCanPxPerMm = 0.3;      // mm→px 기준 배율 (줌은 stage.scale)
var iaeCanThumbCache = {};    // 'fid:gi' → Image
var iaeCanRatioLock = true;
var iaeCanUid = 1;
var iaeCanHotkeysBound = false;
// N3: 시트 네스팅
var IAE_SHEETS_KEY = 'iae_can_sheets_v1';
var iaeCanSheets = [];        // [{uid, x_mm, y_mm, w_mm, h_mm, mode, label, eff, trim}]
var iaeCanSheetUid = 1;
var iaeCanNestOpts = { mode: 'roll', presetIdx: 0, qty: 10, gap: 0.3, margin: 1.0, key: '' };

function iaeCanLoad() {
  try { var raw = localStorage.getItem(IAE_CANVAS_KEY); var a = raw ? JSON.parse(raw) : []; iaeCanObjs = Array.isArray(a) ? a : []; }
  catch (_e) { iaeCanObjs = []; }
  iaeCanObjs.forEach(function (o) { if (o.uid >= iaeCanUid) iaeCanUid = o.uid + 1; });
  try { var rawS = localStorage.getItem(IAE_SHEETS_KEY); var b = rawS ? JSON.parse(rawS) : []; iaeCanSheets = Array.isArray(b) ? b : []; }
  catch (_e) { iaeCanSheets = []; }
  iaeCanSheets.forEach(function (s) { if (s.uid >= iaeCanSheetUid) iaeCanSheetUid = s.uid + 1; });
}
function iaeCanSave() {
  try { localStorage.setItem(IAE_CANVAS_KEY, JSON.stringify(iaeCanObjs)); } catch (_e) {}
  try { localStorage.setItem(IAE_SHEETS_KEY, JSON.stringify(iaeCanSheets)); } catch (_e) {}
}
function iaeCanObj(uid) { return iaeCanObjs.filter(function (x) { return x.uid === uid; })[0]; }

// 모든 done 파일 그룹 수집 → 팔레트/소스 (§14.1 "여러 파일 그룹 통합")
function iaeCanAllGroups() {
  var out = [];
  iaeFiles.forEach(function (f) {
    if (f.status !== 'done' || !f.groups) return;
    f.groups.forEach(function (g, i) {
      var gi = (g.index != null) ? g.index : i;
      out.push({
        fid: f.id, gi: gi, key: f.id + ':' + gi, name: (g.name || ''), filename: f.filename,
        thumb: g.thumbnail_base64 || null,
        w_mm: (g.width_mm != null) ? g.width_mm : 0, h_mm: (g.height_mm != null) ? g.height_mm : 0
      });
    });
  });
  return out;
}
function iaeCanSrc(key) { return iaeCanAllGroups().filter(function (s) { return s.key === key; })[0]; }

function iaeRenderCanvas() {
  iaeCanRenderPalette();
  iaeCanInitStage();
}

function iaeCanRenderPalette() {
  var host = document.getElementById('iaeCanPalette'); if (!host) return;
  var groups = iaeCanAllGroups();
  if (groups.length === 0) {
    host.innerHTML = '<div class="text-[11px] text-gray-400 text-center p-3">완료된 분석 그룹이<br>없습니다.<br>먼저 \'파일 처리\'에서<br>업로드하세요.</div>';
    return;
  }
  var html = '<div class="text-[11px] font-semibold text-gray-500 mb-2 px-1">그룹 팔레트 (' + groups.length + ')</div>';
  groups.forEach(function (s) {
    var dims = (s.w_mm && s.h_mm) ? (Math.round(s.w_mm / 10) + '×' + Math.round(s.h_mm / 10) + 'cm') : '-';
    var thumb = s.thumb
      ? '<img src="data:image/png;base64,' + s.thumb + '" class="w-full h-14 object-contain bg-gray-50">'
      : '<div class="w-full h-14 flex items-center justify-center bg-gray-50 text-gray-300"><i class="fas fa-image"></i></div>';
    html += '<div class="iae-can-pal cursor-pointer rounded-md border border-gray-200 hover:border-blue-400 overflow-hidden mb-2" data-key="' + s.key + '" title="클릭해 대지에 추가">'
      + thumb
      + '<div class="px-1 py-0.5 border-t border-gray-100"><div class="text-[11px] font-semibold text-gray-700 truncate">' + iaeEscape(s.filename) + ' #' + s.gi + '</div><div class="text-[10px] text-gray-400">' + dims + '</div></div>'
      + '</div>';
  });
  host.innerHTML = html;
  Array.prototype.forEach.call(host.querySelectorAll('.iae-can-pal'), function (el) {
    el.addEventListener('click', function () { iaeCanAdd(el.getAttribute('data-key')); });
  });
}

// 객체 push (재빌드 없음) — placeAll 배치용
function iaeCanPush(key, opts) {
  var s = iaeCanSrc(key); if (!s) return null;
  opts = opts || {};
  var n = iaeCanObjs.length;
  var obj = {
    uid: iaeCanUid++, fid: s.fid, gi: s.gi, key: key, label: s.filename + ' #' + s.gi,
    w_mm: s.w_mm || 100, h_mm: s.h_mm || 100,
    x_mm: (opts.x_mm != null) ? opts.x_mm : (20 + (n % 8) * 40),
    y_mm: (opts.y_mm != null) ? opts.y_mm : (20 + Math.floor(n / 8) * 40),
    rotation: opts.rotation || 0,
    fin: opts.fin ? { top: opts.fin.top || '', bottom: opts.fin.bottom || '', left: opts.fin.left || '', right: opts.fin.right || '' } : { top: '', bottom: '', left: '', right: '' },
    trim: opts.trim || false
  };
  iaeCanObjs.push(obj);
  return obj;
}
function iaeCanAdd(key, opts) {
  var obj = iaeCanPush(key, opts); if (!obj) return;
  iaeCanSave();
  iaeCanInitStage();
  iaeCanSelect(obj.uid);
  if (!opts || !opts.silent) iaeToast('대지에 추가: ' + obj.label, 'success');
}
function iaeCanPlaceAll() {
  var groups = iaeCanAllGroups();
  if (groups.length === 0) { iaeToast('배치할 그룹이 없습니다', 'error'); return; }
  var existing = {}; iaeCanObjs.forEach(function (o) { existing[o.key] = true; });
  // 흐름 그리드 배치 (간격 20mm)
  var cx = 20, cy = 20, rowH = 0, maxW = 1400, gap = 20, added = 0;
  groups.forEach(function (s) {
    if (existing[s.key]) return;
    var w = s.w_mm || 100, h = s.h_mm || 100;
    if (cx + w > maxW && cx > 20) { cx = 20; cy += rowH + gap; rowH = 0; }
    iaeCanPush(s.key, { x_mm: cx, y_mm: cy });
    cx += w + gap; if (h > rowH) rowH = h; added++;
  });
  if (added === 0) { iaeToast('이미 모든 그룹이 배치됨', 'info'); return; }
  iaeCanSave(); iaeCanInitStage();
  iaeToast(added + '개 그룹 배치', 'success');
}
function iaeCanClear() {
  if (iaeCanObjs.length === 0 && iaeCanSheets.length === 0) return;
  iaeCanObjs = []; iaeCanSheets = []; iaeCanSel = null; iaeCanSave(); iaeCanInitStage();
}

function iaeCanInitStage() {
  var host = document.getElementById('iaeCanHost'); if (!host) return;
  iaeLoadKonva(function () {
    host = document.getElementById('iaeCanHost'); if (!host) return; // 뷰 교체됨
    var w = host.clientWidth || 600, h = host.clientHeight || 520;
    if (w < 1) w = 600; if (h < 1) h = 520;
    var prevScale = iaeCanStage ? iaeCanStage.scaleX() : 1;
    var prevPos = iaeCanStage ? iaeCanStage.position() : { x: 0, y: 0 };
    host.innerHTML = '';
    iaeCanStage = new Konva.Stage({ container: host, width: w, height: h, draggable: false });
    iaeCanGrid = new Konva.Layer({ listening: false });
    iaeCanLayer = new Konva.Layer();
    iaeCanOverlay = new Konva.Layer({ listening: false }); // N2: 마감/여백/돔보 벡터 근사
    iaeCanStage.add(iaeCanGrid); iaeCanStage.add(iaeCanLayer); iaeCanStage.add(iaeCanOverlay);
    iaeCanStage.scale({ x: prevScale, y: prevScale }); iaeCanStage.position(prevPos);
    iaeCanDrawGrid();
    iaeCanTr = new Konva.Transformer({
      rotateEnabled: true, keepRatio: iaeCanRatioLock, borderStroke: '#2563eb',
      anchorStroke: '#2563eb', anchorFill: '#fff', anchorSize: 8, rotationSnaps: [0, 90, 180, 270]
    });
    iaeCanLayer.add(iaeCanTr);
    iaeCanObjs.forEach(function (o) { iaeCanBuildNode(o); });
    iaeCanLayer.draw();
    iaeCanDrawOverlays();
    if (iaeCanSel != null && iaeCanObj(iaeCanSel)) iaeCanSelect(iaeCanSel); else iaeCanSelect(null);
    iaeCanWire(host);
    iaeCanUpdateStatus();
  });
}

function iaeCanDrawGrid() {
  if (!iaeCanGrid) return;
  iaeCanGrid.destroyChildren();
  var ppm = iaeCanPxPerMm, step = 100 * ppm; // 100mm 격자
  var W = 3000 * ppm, H = 2000 * ppm;
  for (var x = 0; x <= W + 0.5; x += step) iaeCanGrid.add(new Konva.Line({ points: [x, 0, x, H], stroke: '#e5e7eb', strokeWidth: 1 }));
  for (var y = 0; y <= H + 0.5; y += step) iaeCanGrid.add(new Konva.Line({ points: [0, y, W, y], stroke: '#e5e7eb', strokeWidth: 1 }));
  iaeCanGrid.add(new Konva.Rect({ x: 0, y: 0, width: W, height: H, stroke: '#cbd5e1', strokeWidth: 1.5 }));
  iaeCanGrid.draw();
}

function iaeCanBuildNode(o) {
  var ppm = iaeCanPxPerMm;
  var wpx = Math.max(4, (o.w_mm || 10) * ppm), hpx = Math.max(4, (o.h_mm || 10) * ppm);
  var grp = new Konva.Group({ x: (o.x_mm || 0) * ppm, y: (o.y_mm || 0) * ppm, rotation: o.rotation || 0, draggable: true, name: 'iae-can-obj' });
  grp.setAttr('uid', o.uid);
  var rect = new Konva.Rect({ width: wpx, height: hpx, fill: '#ffffff', stroke: '#9ca3af', strokeWidth: 1, name: 'iae-can-rect' });
  grp.add(rect);
  var txt = new Konva.Text({ x: 3, y: 3, text: '#' + o.gi, fontSize: 11, fontStyle: 'bold', fill: '#1e40af', listening: false, name: 'iae-can-lbl' });
  grp.add(txt);
  // 썸네일 (비동기 로드)
  var s = iaeCanSrc(o.key);
  if (s && s.thumb) {
    var draw = function (img) {
      if (!iaeCanLayer || !grp.getStage()) return;
      var ki = new Konva.Image({ image: img, width: rect.width(), height: rect.height(), listening: false, name: 'iae-can-img' });
      grp.add(ki); ki.moveToTop(); txt.moveToTop();
      iaeCanLayer.batchDraw();
    };
    var cached = iaeCanThumbCache[o.key];
    if (cached && cached.complete && cached.naturalWidth) draw(cached);
    else {
      var img = cached || new Image();
      iaeCanThumbCache[o.key] = img;
      img.onload = function () { draw(img); };
      if (!img.src) img.src = 'data:image/png;base64,' + s.thumb;
    }
  }
  grp.on('mousedown touchstart', function () { iaeCanSelect(o.uid); });
  grp.on('dragend', function () { iaeCanCommitPos(o.uid, grp); });
  grp.on('transformend', function () { iaeCanCommitTransform(o.uid, grp); });
  iaeCanLayer.add(grp);
  return grp;
}

function iaeCanFindNode(uid) {
  if (!iaeCanLayer) return null;
  var found = null;
  iaeCanLayer.find('.iae-can-obj').forEach(function (n) { if (n.getAttr('uid') === uid) found = n; });
  return found;
}
function iaeCanSelect(uid) {
  iaeCanSel = uid;
  var node = (uid != null) ? iaeCanFindNode(uid) : null;
  if (iaeCanTr) iaeCanTr.nodes(node ? [node] : []);
  if (iaeCanLayer) iaeCanLayer.batchDraw();
  iaeCanUpdateStatus();
  iaeCanRenderInspector();
}

function iaeCanCommitPos(uid, node) {
  var o = iaeCanObj(uid); if (!o) return;
  o.x_mm = Math.round(node.x() / iaeCanPxPerMm);
  o.y_mm = Math.round(node.y() / iaeCanPxPerMm);
  iaeCanUpdateMembership(o); // 이형 인터록: 시트 포함관계 갱신 + 영향 시트 재동기화(길이/효율)
  iaeCanSave(); iaeCanDrawOverlays(); iaeCanUpdateStatus();
}
function iaeCanCommitTransform(uid, node) {
  var o = iaeCanObj(uid); if (!o) return;
  var rect = node.findOne('.iae-can-rect'); if (!rect) return;
  var newW = Math.abs(rect.width() * node.scaleX());
  var newH = Math.abs(rect.height() * node.scaleY());
  node.scaleX(1); node.scaleY(1);
  iaeCanResizeNode(node, newW, newH);
  o.w_mm = Math.max(1, Math.round(newW / iaeCanPxPerMm));
  o.h_mm = Math.max(1, Math.round(newH / iaeCanPxPerMm));
  o.rotation = ((Math.round(node.rotation() / 90) * 90) % 360 + 360) % 360; // 90° 스냅 정규화
  o.x_mm = Math.round(node.x() / iaeCanPxPerMm);
  o.y_mm = Math.round(node.y() / iaeCanPxPerMm);
  iaeCanUpdateMembership(o);
  iaeCanSave(); iaeCanLayer.batchDraw(); iaeCanDrawOverlays(); iaeCanUpdateStatus();
  iaeCanRenderInspectorSoft(o);
}
function iaeCanResizeNode(node, wpx, hpx) {
  node.find('.iae-can-rect').forEach(function (r) { r.width(wpx); r.height(hpx); });
  node.find('.iae-can-img').forEach(function (im) { im.width(wpx); im.height(hpx); });
}

function iaeCanRotate(uid, deg) {
  var o = iaeCanObj(uid); if (!o) return;
  o.rotation = (((o.rotation || 0) + deg) % 360 + 360) % 360;
  var node = iaeCanFindNode(uid);
  if (node) { node.rotation(o.rotation); iaeCanLayer.batchDraw(); }
  if (o.sheetUid != null) { var sh = iaeCanSheetByUid(o.sheetUid); if (sh) iaeCanSyncSheet(sh); } // 회전 → placements 재계산
  iaeCanSave(); iaeCanDrawOverlays(); iaeCanUpdateStatus();
}
function iaeCanDup(uid) {
  var o = iaeCanObj(uid); if (!o) return;
  iaeCanAdd(o.key, { x_mm: (o.x_mm || 0) + 20, y_mm: (o.y_mm || 0) + 20, rotation: o.rotation, silent: true });
}
function iaeCanRemove(uid) {
  iaeCanObjs = iaeCanObjs.filter(function (x) { return x.uid !== uid; });
  if (iaeCanSel === uid) iaeCanSel = null;
  iaeCanSave(); iaeCanInitStage();
}
function iaeCanNudge(uid, dx, dy) {
  var o = iaeCanObj(uid); if (!o) return;
  o.x_mm = (o.x_mm || 0) + dx; o.y_mm = (o.y_mm || 0) + dy;
  var node = iaeCanFindNode(uid);
  if (node) { node.x(o.x_mm * iaeCanPxPerMm); node.y(o.y_mm * iaeCanPxPerMm); iaeCanLayer.batchDraw(); }
  iaeCanSave(); iaeCanDrawOverlays(); iaeCanUpdateStatus();
}

function iaeCanZoom(factor, center) {
  if (!iaeCanStage) return;
  var old = iaeCanStage.scaleX();
  var ns = Math.max(0.1, Math.min(8, old * factor));
  var c = center || iaeCanStage.getPointerPosition() || { x: iaeCanStage.width() / 2, y: iaeCanStage.height() / 2 };
  var mp = { x: (c.x - iaeCanStage.x()) / old, y: (c.y - iaeCanStage.y()) / old };
  iaeCanStage.scale({ x: ns, y: ns });
  iaeCanStage.position({ x: c.x - mp.x * ns, y: c.y - mp.y * ns });
  iaeCanStage.batchDraw();
  iaeCanUpdateStatus();
}
function iaeCanFit() {
  if (!iaeCanStage) return;
  iaeCanStage.scale({ x: 1, y: 1 }); iaeCanStage.position({ x: 0, y: 0 });
  iaeCanStage.batchDraw(); iaeCanUpdateStatus();
}

function iaeCanUpdateStatus() {
  var z = document.getElementById('iaeCanZoom');
  if (z && iaeCanStage) z.textContent = Math.round(iaeCanStage.scaleX() * 100) + '%';
  var el = document.getElementById('iaeCanStatus'); if (!el) return;
  var zoom = iaeCanStage ? Math.round(iaeCanStage.scaleX() * 100) : 100;
  var o = iaeCanObj(iaeCanSel);
  if (o) {
    el.innerHTML = '선택: <b>' + iaeEscape(o.label) + '</b> · ' + (o.w_mm / 10).toFixed(1) + '×' + (o.h_mm / 10).toFixed(1) + 'cm · 회전 ' + (o.rotation || 0) + '° · 위치 (' + Math.round(o.x_mm / 10) + ',' + Math.round(o.y_mm / 10) + ')cm · 객체 ' + iaeCanObjs.length + '개 · 줌 ' + zoom + '%';
  } else {
    el.innerHTML = '객체 ' + iaeCanObjs.length + '개 · 줌 ' + zoom + '% · 팔레트에서 그룹을 클릭해 대지에 추가';
  }
}

function iaeCanWire(host) {
  if (!iaeCanStage) return;
  iaeCanStage.on('mousedown touchstart', function (e) { if (e.target === iaeCanStage) iaeCanSelect(null); });
  iaeCanStage.on('wheel', function (e) { e.evt.preventDefault(); iaeCanZoom(e.evt.deltaY < 0 ? 1.1 : 0.9); });
}

// 핫키 (대지 뷰 활성 시에만) — init에서 1회 바인딩
function iaeCanKeydown(e) {
  if (iaeView !== 'canvas') return;
  var tag = (e.target && e.target.tagName) || '';
  if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
  var k = e.key;
  if (k === ' ') { if (iaeCanStage && !iaeCanStage.draggable()) iaeCanStage.draggable(true); e.preventDefault(); return; }
  if (k === 'Escape') { iaeCanSelect(null); return; }
  if (k === '+' || k === '=') { iaeCanZoom(1.1, { x: iaeCanStage.width() / 2, y: iaeCanStage.height() / 2 }); e.preventDefault(); return; }
  if (k === '-' || k === '_') { iaeCanZoom(0.9, { x: iaeCanStage.width() / 2, y: iaeCanStage.height() / 2 }); e.preventDefault(); return; }
  var o = iaeCanObj(iaeCanSel);
  if (!o) return;
  if (k === 'Delete' || k === 'Backspace') { iaeCanRemove(o.uid); e.preventDefault(); return; }
  if (k === 'r' || k === 'R') { iaeCanRotate(o.uid, 90); e.preventDefault(); return; }
  if ((k === 'd' || k === 'D') && !e.ctrlKey && !e.metaKey) { iaeCanDup(o.uid); e.preventDefault(); return; }
  if (k === 't' || k === 'T') { o.trim = !o.trim; iaeCanSave(); iaeCanDrawOverlays(); iaeCanRenderInspector(); e.preventDefault(); return; }
  if (/^[1-9]$/.test(k)) { var pi = parseInt(k, 10) - 1; if (iaeFinPresets[pi]) { iaeCanApplyPreset(o, iaeFinPresets[pi].name); iaeCanRenderInspector(); } e.preventDefault(); return; }
  if (k.indexOf('Arrow') === 0) {
    var d = e.shiftKey ? 10 : 1;
    if (k === 'ArrowLeft') iaeCanNudge(o.uid, -d, 0);
    else if (k === 'ArrowRight') iaeCanNudge(o.uid, d, 0);
    else if (k === 'ArrowUp') iaeCanNudge(o.uid, 0, -d);
    else if (k === 'ArrowDown') iaeCanNudge(o.uid, 0, d);
    e.preventDefault();
  }
}
function iaeCanKeyup(e) {
  if (e.key === ' ' && iaeCanStage && iaeCanStage.draggable()) iaeCanStage.draggable(false);
}

function iaeCanWireToolbar() {
  var bind = function (id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  bind('iaeCanFit', iaeCanFit);
  bind('iaeCanZoomIn', function () { iaeCanZoom(1.2, { x: iaeCanStage.width() / 2, y: iaeCanStage.height() / 2 }); });
  bind('iaeCanZoomOut', function () { iaeCanZoom(0.8, { x: iaeCanStage.width() / 2, y: iaeCanStage.height() / 2 }); });
  bind('iaeCanPlaceAll', iaeCanPlaceAll);
  bind('iaeCanNestBtn', iaeCanShowNestPanel);
  bind('iaeCanOrderBtn', iaeCanOpenOrderModal);
  bind('iaeCanClear', iaeCanClear);
  var ratio = document.getElementById('iaeCanRatio');
  if (ratio) ratio.addEventListener('change', function () {
    iaeCanRatioLock = ratio.checked;
    if (iaeCanTr) { iaeCanTr.keepRatio(iaeCanRatioLock); iaeCanLayer.batchDraw(); }
  });
  if (!iaeCanHotkeysBound) {
    document.addEventListener('keydown', iaeCanKeydown);
    document.addEventListener('keyup', iaeCanKeyup);
    iaeCanHotkeysBound = true;
  }
}

// ── N2: 마감·여백·돔보 (벡터 근사 오버레이 + 인스펙터 + 핫키) ──────
// 마감 = 4면 finishing method → 여백 cm(iaeMarginOf), 출력 = 디자인 + 여백(바깥 확장).
// 돔보 = 출력 바운드 꼭짓점 트림마크(웹 근사). 실제 마크는 출력(ProcessOrderItem) 시점.
function iaeCanMargins(o) {
  var f = (o && o.fin) || {};
  return { t: iaeMarginOf(f.top), b: iaeMarginOf(f.bottom), l: iaeMarginOf(f.left), r: iaeMarginOf(f.right) };
}
function iaeCanDrawOverlays() {
  if (!iaeCanOverlay) return;
  iaeCanOverlay.destroyChildren();
  var ppm = iaeCanPxPerMm;
  iaeCanObjs.forEach(function (o) {
    var m = iaeCanMargins(o);
    var hasM = (m.t || m.b || m.l || m.r);
    if (!hasM && !o.trim) return;
    var og = new Konva.Group({ x: (o.x_mm || 0) * ppm, y: (o.y_mm || 0) * ppm, rotation: o.rotation || 0, listening: false });
    var dl = m.l * 10 * ppm, dt = m.t * 10 * ppm, dr = m.r * 10 * ppm, db = m.b * 10 * ppm; // cm→mm→px
    var wpx = (o.w_mm || 0) * ppm, hpx = (o.h_mm || 0) * ppm;
    var ox = -dl, oy = -dt, ow = wpx + dl + dr, oh = hpx + dt + db; // 출력 바운드(로컬좌표)
    if (hasM) {
      var fill = 'rgba(245,158,11,0.18)';
      if (dt > 0) og.add(new Konva.Rect({ x: ox, y: oy, width: ow, height: dt, fill: fill }));
      if (db > 0) og.add(new Konva.Rect({ x: ox, y: hpx, width: ow, height: db, fill: fill }));
      if (dl > 0) og.add(new Konva.Rect({ x: ox, y: 0, width: dl, height: hpx, fill: fill }));
      if (dr > 0) og.add(new Konva.Rect({ x: wpx, y: 0, width: dr, height: hpx, fill: fill }));
      og.add(new Konva.Rect({ x: ox, y: oy, width: ow, height: oh, stroke: '#f59e0b', strokeWidth: 1, dash: [4, 3] }));
    }
    if (o.trim) {
      var L = 10 * ppm, gap = 3 * ppm, col = '#111827', sw = 1; // 1cm 트림마크 + 3mm 갭
      var corners = [[ox, oy, 1, 1], [ox + ow, oy, -1, 1], [ox, oy + oh, 1, -1], [ox + ow, oy + oh, -1, -1]];
      corners.forEach(function (c) {
        var cx = c[0], cy = c[1], sx = c[2], sy = c[3];
        og.add(new Konva.Line({ points: [cx, cy + sy * gap, cx, cy + sy * (gap + L)], stroke: col, strokeWidth: sw }));
        og.add(new Konva.Line({ points: [cx + sx * gap, cy, cx + sx * (gap + L), cy], stroke: col, strokeWidth: sw }));
      });
    }
    iaeCanOverlay.add(og);
  });
  // N3: 시트 경계 + 라벨 + 효율 + 돔보(둘레)
  iaeCanSheets.forEach(function (sh) {
    var sx = (sh.x_mm || 0) * ppm, sy = (sh.y_mm || 0) * ppm, sw = (sh.w_mm || 0) * ppm, shh = (sh.h_mm || 0) * ppm;
    var g = new Konva.Group({ listening: false });
    g.add(new Konva.Rect({ x: sx, y: sy, width: sw, height: shh, stroke: '#2563eb', strokeWidth: 1.5, dash: [6, 4] }));
    var effPct = Math.round((sh.eff || 0) * 100);
    var lbl = (sh.label || '시트') + ' · ' + (effPct > 100 ? '인터록 ' : '효율 ') + effPct + '%';
    g.add(new Konva.Text({ x: sx + 3, y: sy - 14, text: lbl, fontSize: 11, fontStyle: 'bold', fill: '#1e3a8a' }));
    if (sh._warn && sh._warn.length) g.add(new Konva.Text({ x: sx + 3, y: sy + 2, text: '⚠ ' + sh._warn[0], fontSize: 10, fill: '#dc2626' }));
    if (sh.trim) {
      var L = 10 * ppm, gap = 3 * ppm, col = '#111827';
      var cs = [[sx, sy, 1, 1], [sx + sw, sy, -1, 1], [sx, sy + shh, 1, -1], [sx + sw, sy + shh, -1, -1]];
      cs.forEach(function (c) {
        g.add(new Konva.Line({ points: [c[0], c[1] + c[3] * gap, c[0], c[1] + c[3] * (gap + L)], stroke: col, strokeWidth: 1 }));
        g.add(new Konva.Line({ points: [c[0] + c[2] * gap, c[1], c[0] + c[2] * (gap + L), c[1]], stroke: col, strokeWidth: 1 }));
      });
    }
    iaeCanOverlay.add(g);
  });
  iaeCanOverlay.batchDraw();
}
function iaeCanApplyPreset(o, name) {
  var p = iaeFinPresets.filter(function (x) { return x.name === name; })[0]; if (!p) return;
  var cfg = {}; try { cfg = (typeof p.config === 'string') ? JSON.parse(p.config) : (p.config || {}); } catch (_e) { cfg = {}; }
  o.fin = { top: cfg.top || '', bottom: cfg.bottom || '', left: cfg.left || '', right: cfg.right || '' };
  iaeCanSave(); iaeCanDrawOverlays();
  iaeToast('마감 적용: ' + name, 'info');
}

function iaeCanRenderInspector() {
  var host = document.getElementById('iaeCanInspector'); if (!host) return;
  var o = iaeCanObj(iaeCanSel);
  if (!o) { host.classList.add('hidden'); host.innerHTML = ''; return; }
  host.classList.remove('hidden');
  var src = iaeCanSrc(o.key);
  var f = o.fin || {};
  var presetOpts = '<option value="">마감 프리셋…</option>';
  iaeFinPresets.forEach(function (p) { presetOpts += '<option value="' + iaeEscape(p.name) + '">' + iaeEscape(p.name) + '</option>'; });
  var inputCls = 'border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  var selCls = 'w-full ' + inputCls;
  var detTxt = src ? (Math.round((src.w_mm || 0) / 10) + '×' + Math.round((src.h_mm || 0) / 10) + 'cm') : '-';
  var html = ''
    + '<div class="flex items-center justify-between mb-1"><span class="text-sm font-semibold text-gray-700 truncate">' + iaeEscape(o.label) + '</span>'
    + '<button id="iaeCanInsClose" class="text-gray-400 hover:text-gray-600 text-xs ml-2"><i class="fas fa-xmark"></i></button></div>'
    + '<div class="text-[11px] text-gray-400 mb-3">검출 ' + detTxt + '</div>'
    + '<div class="space-y-3">'
    + '<div><label class="block text-xs text-gray-500 mb-1">크기 (cm)</label><div class="flex items-center gap-1">'
    + '<input id="iaeCanW" type="number" min="0.1" step="0.1" value="' + (o.w_mm / 10) + '" class="w-20 ' + inputCls + '">'
    + '<span class="text-gray-400">×</span>'
    + '<input id="iaeCanH" type="number" min="0.1" step="0.1" value="' + (o.h_mm / 10) + '" class="w-20 ' + inputCls + '">'
    + '<label class="flex items-center gap-1 text-xs text-gray-600 ml-1 cursor-pointer"><input id="iaeCanAspect" type="checkbox" checked>비율</label>'
    + '</div></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">마감 프리셋 <span class="text-gray-300">(숫자 1~9)</span></label><select id="iaeCanPreset" class="' + selCls + '">' + presetOpts + '</select></div>'
    + '<div class="grid grid-cols-2 gap-2">'
    + '<div><label class="block text-xs text-gray-500 mb-1">상</label><select id="iaeCanFinTop" class="' + selCls + '">' + iaeMethodOptions(f.top) + '</select></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">하</label><select id="iaeCanFinBottom" class="' + selCls + '">' + iaeMethodOptions(f.bottom) + '</select></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">좌</label><select id="iaeCanFinLeft" class="' + selCls + '">' + iaeMethodOptions(f.left) + '</select></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">우</label><select id="iaeCanFinRight" class="' + selCls + '">' + iaeMethodOptions(f.right) + '</select></div>'
    + '</div>'
    + '<div class="flex items-center gap-3">'
    + '<button id="iaeCanRotBtn" class="text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-50"><i class="fas fa-rotate-right mr-1"></i>90° (R)</button>'
    + '<label class="flex items-center gap-1 text-sm text-gray-700 cursor-pointer"><input id="iaeCanTrim" type="checkbox"' + (o.trim ? ' checked' : '') + '>돔보 (T)</label>'
    + '</div>'
    + '<div class="flex items-center gap-2"><label class="text-xs text-gray-500">파일 배율 1/</label><input id="iaeCanScale" type="number" min="1" step="1" value="' + (o.scale_factor || 1) + '" class="w-16 ' + inputCls + '"><span class="text-[11px] text-gray-400">소스가 실제의 1/N(축소본)</span></div>'
    + '<div id="iaeCanOut" class="text-xs text-gray-500 border-t border-gray-100 pt-2"></div>'
    + '<div id="iaeCanPreflight"></div>'
    + '</div>';
  host.innerHTML = html;
  iaeCanWireInspector(o);
  iaeCanRenderInspectorSoft(o);
}
function iaeCanWireInspector(o) {
  var node = iaeCanFindNode(o.uid);
  var wEl = document.getElementById('iaeCanW'), hEl = document.getElementById('iaeCanH'), aEl = document.getElementById('iaeCanAspect');
  var src = iaeCanSrc(o.key);
  var detAspect = (src && src.w_mm && src.h_mm) ? (src.w_mm / src.h_mm) : ((o.w_mm && o.h_mm) ? o.w_mm / o.h_mm : 0);
  function applySize() {
    var w = parseFloat(wEl.value) || 0, h = parseFloat(hEl.value) || 0;
    if (w > 0) o.w_mm = Math.round(w * 10);
    if (h > 0) o.h_mm = Math.round(h * 10);
    node = iaeCanFindNode(o.uid);
    if (node) { iaeCanResizeNode(node, o.w_mm * iaeCanPxPerMm, o.h_mm * iaeCanPxPerMm); iaeCanLayer.batchDraw(); }
    iaeCanSave(); iaeCanDrawOverlays(); iaeCanUpdateStatus(); iaeCanRenderInspectorSoft(o);
  }
  if (wEl) wEl.addEventListener('input', function () {
    if (aEl.checked && detAspect > 0) { var w = parseFloat(wEl.value) || 0; if (w > 0) hEl.value = Math.round((w / detAspect) * 10) / 10; }
    applySize();
  });
  if (hEl) hEl.addEventListener('input', function () {
    if (aEl.checked && detAspect > 0) { var h = parseFloat(hEl.value) || 0; if (h > 0) wEl.value = Math.round((h * detAspect) * 10) / 10; }
    applySize();
  });
  ['Top', 'Bottom', 'Left', 'Right'].forEach(function (side) {
    var el = document.getElementById('iaeCanFin' + side); if (!el) return;
    el.addEventListener('change', function () { o.fin = o.fin || {}; o.fin[side.toLowerCase()] = el.value; iaeCanSave(); iaeCanDrawOverlays(); iaeCanRenderInspectorSoft(o); });
  });
  var preEl = document.getElementById('iaeCanPreset');
  if (preEl) preEl.addEventListener('change', function () { if (!preEl.value) return; iaeCanApplyPreset(o, preEl.value); iaeCanRenderInspector(); });
  var trimEl = document.getElementById('iaeCanTrim');
  if (trimEl) trimEl.addEventListener('change', function () { o.trim = trimEl.checked; iaeCanSave(); iaeCanDrawOverlays(); });
  var scEl = document.getElementById('iaeCanScale');
  if (scEl) scEl.addEventListener('change', function () { o.scale_factor = Math.max(1, parseFloat(scEl.value) || 1); iaeCanSave(); });
  var rotBtn = document.getElementById('iaeCanRotBtn');
  if (rotBtn) rotBtn.addEventListener('click', function () { iaeCanRotate(o.uid, 90); });
  var closeBtn = document.getElementById('iaeCanInsClose');
  if (closeBtn) closeBtn.addEventListener('click', function () { iaeCanSelect(null); });
}
// 출력 크기 + 프리플라이트만 갱신 (입력 포커스 유지)
function iaeCanRenderInspectorSoft(o) {
  var m = iaeCanMargins(o);
  var outW = (o.w_mm / 10) + m.l + m.r, outH = (o.h_mm / 10) + m.t + m.b;
  var outEl = document.getElementById('iaeCanOut');
  if (outEl) outEl.innerHTML = '출력 <b>' + outW.toFixed(1) + '×' + outH.toFixed(1) + 'cm</b> · 여백 상' + m.t + '/하' + m.b + '/좌' + m.l + '/우' + m.r + 'cm' + (o.trim ? ' · 돔보' : '');
  iaeCanRenderPreflight(o);
}
function iaeCanRenderPreflight(o) {
  var host = document.getElementById('iaeCanPreflight'); if (!host) return;
  var warns = [];
  var src = iaeCanSrc(o.key);
  var dw = src ? (src.w_mm / 10) : 0, dh = src ? (src.h_mm / 10) : 0;
  var tw = o.w_mm / 10, th = o.h_mm / 10;
  if (dw > 0 && dh > 0 && tw > 0 && th > 0) {
    var ta = tw / th, da = dw / dh, rota = dh / dw;
    var diff = Math.min(Math.abs(ta - da), Math.abs(ta - rota)) / da;
    if (diff > 0.05) warns.push(['warn', '원본 비율(' + Math.round(dw) + '×' + Math.round(dh) + 'cm)과 달라 잘림/여백 가능']);
    var sc = tw / dw;
    if (sc > 1.5) warns.push(['info', '검출의 ' + sc.toFixed(1) + '배 확대 — 해상도 확인']);
  }
  if (warns.length === 0) { host.innerHTML = '<div class="text-xs text-green-600"><i class="fas fa-circle-check mr-1"></i>프리플라이트 이상 없음</div>'; return; }
  var color = { err: 'text-red-600', warn: 'text-amber-600', info: 'text-blue-600' };
  var icon = { err: 'fa-circle-exclamation', warn: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  host.innerHTML = '<div class="space-y-1">' + warns.map(function (w) {
    return '<div class="text-xs ' + color[w[0]] + '"><i class="fas ' + icon[w[0]] + ' mr-1"></i>' + iaeEscape(w[1]) + '</div>';
  }).join('') + '</div>';
}

// ── N3: 대지 내 시트 네스팅 (shelfBinPack 재활용, 동일품목 가드, 다중판) ──
// 그룹 N부를 시트(롤 폭고정/평판 W×H)에 자동 배치 → 시트 경계 오버레이 + 조각=대지 객체.
function iaeCanContentBottomMm() {
  var b = 0;
  iaeCanObjs.forEach(function (o) { var bb = (o.y_mm || 0) + Math.max(o.w_mm || 0, o.h_mm || 0); if (bb > b) b = bb; });
  iaeCanSheets.forEach(function (s) { var bb = (s.y_mm || 0) + (s.h_mm || 0); if (bb > b) b = bb; });
  return b;
}

// ── 이형(true-shape) 수동 인터록 ───────────────────────────────────
// 자동 bbox 네스팅(iaeCanNestPlace)이 시작점. 사용자가 조각을 드래그·회전(겹침 허용=이형 절감)해
// 끼워맞추면 주문 시 라이브 조각 위치에서 placements 재계산(시트상대 bbox + 회전), 롤은 길이 자동 단축.
// 시트 멤버십 = 조각 bbox 중심의 시트 포함관계(드래그 인/아웃·복제 대응). 출력 = SHEET pp → SheetLayout.jsx.
// 조각 회전 0/90 = 현 에이전트 즉시 동작, 180/270 = placement.rotation + 에이전트 패스스루 필요.
function iaeCanRotBBox(o) {
  var W = o.w_mm || 0, H = o.h_mm || 0, px = o.x_mm || 0, py = o.y_mm || 0;
  var rot = ((Math.round((o.rotation || 0) / 90) * 90) % 360 + 360) % 360; // 90° 스냅·정규화
  var rad = rot * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  [[0, 0], [W, 0], [W, H], [0, H]].forEach(function (c) {
    var x = px + c[0] * cs - c[1] * sn, y = py + c[0] * sn + c[1] * cs; // Konva CW(y-down) 회전행렬
    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  });
  return { left: minX, top: minY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, rot: rot, rotated: (rot % 180 !== 0) };
}
function iaeCanSheetByUid(uid) { return iaeCanSheets.filter(function (s) { return s.uid === uid; })[0]; }
function iaeCanSheetForPoint(xmm, ymm) {
  for (var i = iaeCanSheets.length - 1; i >= 0; i--) {
    var s = iaeCanSheets[i];
    if (xmm >= (s.x_mm || 0) && xmm <= (s.x_mm || 0) + (s.w_mm || 0) && ymm >= (s.y_mm || 0) && ymm <= (s.y_mm || 0) + (s.h_mm || 0)) return s;
  }
  return null;
}
// 객체 sheetUid를 bbox 중심 포함관계로 (재)배정 — 드래그/회전/복제 후 호출. 영향 시트 재동기화.
function iaeCanUpdateMembership(o) {
  var prev = o.sheetUid;
  var bb = iaeCanRotBBox(o);
  var s = iaeCanSheetForPoint(bb.cx, bb.cy);
  o.sheetUid = s ? s.uid : null;
  iaeCanSheets.forEach(function (sh) { if (sh.uid === prev || sh.uid === o.sheetUid) iaeCanSyncSheet(sh); });
}
// 빌드 시 멤버십 전수 확정 + 시트 앵커 fid 정합(SheetLayout 단일 소스 → 다른 파일 조각은 개별 라인으로).
function iaeCanReassignSheets() {
  iaeCanObjs.forEach(function (o) { var bb = iaeCanRotBBox(o); var s = iaeCanSheetForPoint(bb.cx, bb.cy); o.sheetUid = s ? s.uid : null; });
  iaeCanSheets.forEach(function (sh) {
    var mem = iaeCanObjs.filter(function (o) { return o.sheetUid === sh.uid; });
    if (!mem.length) return;
    var cnt = {}; mem.forEach(function (o) { cnt[o.fid] = (cnt[o.fid] || 0) + 1; });
    var anchor = mem[0].fid, best = -1;
    Object.keys(cnt).forEach(function (f) { if (cnt[f] > best) { best = cnt[f]; anchor = mem.filter(function (m) { return String(m.fid) === f; })[0].fid; } });
    mem.forEach(function (o) { if (o.fid !== anchor) o.sheetUid = null; });
    sh.fid = anchor;
  });
}
// 시트 placements·규격·효율을 라이브 조각 위치에서 재계산. 롤=길이 자동 단축. 반환 {warnings,members}.
function iaeCanSyncSheet(sh) {
  var mem = iaeCanObjs.filter(function (o) { return o.sheetUid === sh.uid; });
  var warns = [];
  if (!mem.length) { sh.placements = []; sh.eff = 0; return { warnings: warns, members: 0 }; }
  var margin = sh.margin_cm || 0;
  var placements = [], areaCm2 = 0, maxBottomCm = 0, rotOff = 0, overflow = false;
  var rollW = sh.roll_width_cm || (sh.w_mm || 0) / 10;
  mem.forEach(function (o) {
    var bb = iaeCanRotBBox(o);
    var xc = (bb.left - (sh.x_mm || 0)) / 10, yc = (bb.top - (sh.y_mm || 0)) / 10;
    var wc = bb.w / 10, hc = bb.h / 10;
    placements.push({ group_index: o.gi, x_cm: Math.round(xc * 100) / 100, y_cm: Math.round(yc * 100) / 100, width_cm: Math.round(wc * 100) / 100, height_cm: Math.round(hc * 100) / 100, rotated: bb.rotated, rotation: bb.rot });
    areaCm2 += (o.w_mm || 0) * (o.h_mm || 0) / 100; // 조각 실면적(겹침과 무관)
    if (yc + hc > maxBottomCm) maxBottomCm = yc + hc;
    if (bb.rot === 180 || bb.rot === 270) rotOff++;
    if (xc < -0.1 || xc + wc > rollW + 0.1) overflow = true;
  });
  if (sh.mode !== 'flatbed') {
    sh.total_height_cm = Math.round((maxBottomCm + margin) * 10) / 10;
    sh.h_mm = Math.round(sh.total_height_cm * 10);
  } else if (maxBottomCm + margin > (sh.total_height_cm || (sh.h_mm || 0) / 10) + 0.1) {
    overflow = true;
  }
  var sheetH = sh.total_height_cm || (sh.h_mm || 0) / 10;
  sh.placements = placements;
  sh.eff = (rollW * sheetH > 0) ? areaCm2 / (rollW * sheetH) : 0;
  if (overflow) warns.push('조각이 시트 경계를 벗어남 (출력 시 잘릴 수 있음)');
  if (rotOff) warns.push(rotOff + '개 조각 180°/270° — 에이전트 최신 빌드 후 정확 출력(현재 0°/90°로 출력)');
  sh._warn = warns;
  return { warnings: warns, members: mem.length };
}
function iaeCanNestPlace(opts) {
  var src = iaeCanSrc(opts.key);
  if (!src) { iaeToast('대상 그룹을 선택하세요', 'error'); return; }
  var origW = src.w_mm || 0, origH = src.h_mm || 0;
  // 네스팅 스케일: 목표 크기(opts.target_w/h, cm) 지정 시 그 크기로 조각 배치, 없으면 검출 크기
  var dwCm = (Number(opts.target_w) > 0) ? Number(opts.target_w) : origW / 10;
  var dhCm = (Number(opts.target_h) > 0) ? Number(opts.target_h) : origH / 10;
  if (dwCm <= 0 || dhCm <= 0) { iaeToast('그룹 크기를 알 수 없습니다', 'error'); return; }
  var pwMm = Math.round(dwCm * 10), phMm = Math.round(dhCm * 10);  // 조각 출력 크기(mm)
  var fileScale = Math.max(1, Number(opts.file_scale) || 1);        // 파일 배율(소스가 실제의 1/N)
  var qty = Math.max(1, parseInt(opts.qty, 10) || 1);
  var presets = opts.mode === 'flatbed' ? IAE_FLAT_PRESETS : IAE_ROLL_PRESETS;
  var preset = presets[opts.presetIdx] || presets[0];
  var margin = Number(opts.margin) || 0, gap = Number(opts.gap) || 0;
  var availW = preset.w - margin * 2;
  if (availW <= 0) { iaeToast('돔보 여백이 시트 폭보다 큽니다', 'error'); return; }

  var items = [];
  for (var q = 0; q < qty; q++) items.push({ id: 'p' + q, w: dwCm, h: dhCm });
  var packed = iaeShelfBinPack(items, availW, gap);
  if (packed.error) { iaeToast(packed.msg, 'error'); return; }

  // 시트 분할 (롤=단일·가변높이 / 평판=고정 W×H·다중판, shelfBinPack 결과 기반)
  var sheets = [];
  if (opts.mode === 'flatbed') {
    var availH = preset.h - margin * 2;
    if (availH <= 0) { iaeToast('돔보 여백이 시트 높이보다 큽니다', 'error'); return; }
    var byY = {};
    packed.placements.forEach(function (p) { (byY[p.y_cm] = byY[p.y_cm] || []).push(p); });
    var ys = Object.keys(byY).map(Number).sort(function (a, b) { return a - b; });
    var shelfH = function (arr) { var hh = 0; arr.forEach(function (p) { if (p.height_cm > hh) hh = p.height_cm; }); return hh; };
    for (var yi = 0; yi < ys.length; yi++) {
      if (shelfH(byY[ys[yi]]) > availH + 1e-6) { iaeToast('조각이 시트 높이를 초과합니다 (' + Math.round(shelfH(byY[ys[yi]])) + 'cm)', 'error'); return; }
    }
    var cur = [], curBottom = 0;
    ys.forEach(function (y) {
      var arr = byY[y], sh = shelfH(arr);
      if (cur.length && (curBottom + gap + sh > availH + 1e-6)) { sheets.push(cur); cur = []; curBottom = 0; }
      var yLocal = cur.length ? curBottom + gap : 0;
      arr.forEach(function (p) { cur.push({ x_cm: p.x_cm, y_cm: yLocal, width_cm: p.width_cm, height_cm: p.height_cm, rotated: p.rotated }); });
      curBottom = yLocal + sh;
    });
    if (cur.length) sheets.push(cur);
    sheets = sheets.map(function (pl) { return { width_cm: preset.w, height_cm: preset.h, placements: pl.map(function (p) { return iaeShiftP(p, margin); }) }; });
  } else {
    sheets = [{ width_cm: preset.w, height_cm: packed.total_height_cm + margin * 2, placements: packed.placements.map(function (p) { return iaeShiftP(p, margin); }) }];
  }

  var totalArea = dwCm * dhCm * qty, sheetArea = 0;
  sheets.forEach(function (s) { sheetArea += s.width_cm * s.height_cm; });
  var eff = sheetArea > 0 ? totalArea / sheetArea : 0;

  // 대지 빈 곳(기존 콘텐츠 아래)에 시트 세로 적층
  var cursorY = iaeCanContentBottomMm() + 50, originX = 0;
  sheets.forEach(function (s, si) {
    var sheetUid = iaeCanSheetUid++;
    var sx = originX, sy = cursorY;
    iaeCanSheets.push({ uid: sheetUid, x_mm: sx, y_mm: sy, w_mm: Math.round(s.width_cm * 10), h_mm: Math.round(s.height_cm * 10), mode: opts.mode, label: preset.label + (sheets.length > 1 ? (' #' + (si + 1)) : ''), eff: eff, trim: margin > 0,
      // N4 네스팅 fidelity: 주문 시 SheetLayout 렌더용 자기기술(placements·규격, cm 시트상대). scale_factor=파일 배율
      key: opts.key, fid: src.fid, gi: src.gi, roll_width_cm: s.width_cm, total_height_cm: s.height_cm, margin_cm: margin, gap_cm: gap, scale_factor: fileScale,
      placements: s.placements.map(function (p) { return { group_index: src.gi, x_cm: p.x_cm, y_cm: p.y_cm, width_cm: p.width_cm, height_cm: p.height_cm, rotated: !!p.rotated }; }) });
    s.placements.forEach(function (p) {
      var cellX = sx + p.x_cm * 10, cellY = sy + p.y_cm * 10;
      // 회전 조각: 조각 크기 유지 + 90° + bbox가 셀에 맞도록 x 보정 (phMm = 조각 높이)
      var ox = p.rotated ? Math.round(cellX + phMm) : Math.round(cellX);
      iaeCanObjs.push({
        uid: iaeCanUid++, fid: src.fid, gi: src.gi, key: opts.key, label: src.filename + ' #' + src.gi,
        w_mm: pwMm, h_mm: phMm, x_mm: ox, y_mm: Math.round(cellY), rotation: p.rotated ? 90 : 0,
        fin: { top: '', bottom: '', left: '', right: '' }, trim: false, scale_factor: fileScale, sheetUid: sheetUid
      });
    });
    cursorY += Math.round(s.height_cm * 10) + 30;
  });
  iaeCanSave(); iaeCanInitStage();
  iaeToast(sheets.length + '판 배치 · 효율 ' + Math.round(eff * 100) + '%', 'success');
  iaeCanRenderNestPanel(); // 패널 유지
}

function iaeCanShowNestPanel() {
  iaeCanSel = null;
  if (iaeCanTr) { iaeCanTr.nodes([]); if (iaeCanLayer) iaeCanLayer.batchDraw(); }
  iaeCanUpdateStatus();
  iaeCanRenderNestPanel();
}
function iaeCanRenderNestPanel() {
  var host = document.getElementById('iaeCanInspector'); if (!host) return;
  host.classList.remove('hidden');
  var o = iaeCanNestOpts;
  var groups = iaeCanAllGroups();
  var inputCls = 'border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  var selCls = 'w-full ' + inputCls;
  if (groups.length === 0) {
    host.innerHTML = '<div class="flex items-center justify-between mb-2"><span class="text-sm font-semibold text-gray-700"><i class="fas fa-layer-group mr-1 text-blue-500"></i>시트 네스팅</span>'
      + '<button id="iaeCanNestClose" class="text-gray-400 hover:text-gray-600 text-xs"><i class="fas fa-xmark"></i></button></div>'
      + '<div class="text-xs text-gray-400">완료된 분석 그룹이 없습니다.</div>';
    var ce = document.getElementById('iaeCanNestClose'); if (ce) ce.addEventListener('click', function () { host.classList.add('hidden'); host.innerHTML = ''; });
    return;
  }
  if (!o.key || !iaeCanSrc(o.key)) o.key = groups[0].key;
  var curSrc = iaeCanSrc(o.key) || {};
  var curW = Math.round((curSrc.w_mm || 0) / 10), curH = Math.round((curSrc.h_mm || 0) / 10);
  var presets = o.mode === 'flatbed' ? IAE_FLAT_PRESETS : IAE_ROLL_PRESETS;
  var groupOpts = groups.map(function (s) { return '<option value="' + s.key + '"' + (s.key === o.key ? ' selected' : '') + '>' + iaeEscape(s.filename) + ' #' + s.gi + ' (' + Math.round((s.w_mm || 0) / 10) + '×' + Math.round((s.h_mm || 0) / 10) + 'cm)</option>'; }).join('');
  var presetOpts = presets.map(function (p, i) { return '<option value="' + i + '"' + (i === o.presetIdx ? ' selected' : '') + '>' + iaeEscape(p.label) + '</option>'; }).join('');
  host.innerHTML = ''
    + '<div class="flex items-center justify-between mb-2"><span class="text-sm font-semibold text-gray-700"><i class="fas fa-layer-group mr-1 text-blue-500"></i>시트 네스팅</span>'
    + '<button id="iaeCanNestClose" class="text-gray-400 hover:text-gray-600 text-xs"><i class="fas fa-xmark"></i></button></div>'
    + '<div class="text-[11px] text-gray-400 mb-3">동일 품목(그룹) 다수를 시트에 자동 배치</div>'
    + '<div class="space-y-3">'
    + '<div><label class="block text-xs text-gray-500 mb-1">대상 그룹 (동일 품목)</label><select id="iaeCanNestGroup" class="' + selCls + '">' + groupOpts + '</select></div>'
    + '<div class="grid grid-cols-2 gap-2">'
    + '<div><label class="block text-xs text-gray-500 mb-1">수량</label><input id="iaeCanNestQty" type="number" min="1" step="1" value="' + o.qty + '" class="w-full ' + inputCls + '"></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">모드</label><select id="iaeCanNestMode" class="' + selCls + '"><option value="roll"' + (o.mode === 'roll' ? ' selected' : '') + '>롤(폭고정)</option><option value="flatbed"' + (o.mode === 'flatbed' ? ' selected' : '') + '>평판(W×H)</option></select></div>'
    + '</div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">규격</label><select id="iaeCanNestPreset" class="' + selCls + '">' + presetOpts + '</select></div>'
    + '<div class="grid grid-cols-2 gap-2">'
    + '<div><label class="block text-xs text-gray-500 mb-1">간격(cm)</label><input id="iaeCanNestGap" type="number" min="0" step="0.1" value="' + o.gap + '" class="w-full ' + inputCls + '"></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">돔보 여백(cm)</label><input id="iaeCanNestMargin" type="number" min="0" step="0.1" value="' + o.margin + '" class="w-full ' + inputCls + '"></div>'
    + '</div>'
    + '<div class="grid grid-cols-3 gap-2">'
    + '<div><label class="block text-xs text-gray-500 mb-1">조각 W(cm)</label><input id="iaeCanNestTW" type="number" min="0" step="0.1" value="' + (o.target_w || '') + '" placeholder="' + curW + '" class="w-full ' + inputCls + '"></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">조각 H(cm)</label><input id="iaeCanNestTH" type="number" min="0" step="0.1" value="' + (o.target_h || '') + '" placeholder="' + curH + '" class="w-full ' + inputCls + '"></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">파일 1/N</label><input id="iaeCanNestFS" type="number" min="1" step="1" value="' + (o.file_scale || 1) + '" class="w-full ' + inputCls + '"></div>'
    + '</div>'
    + '<div class="text-[11px] text-gray-400">조각 크기 비우면 검출 크기로 배치(스케일). 파일 1/N = 소스가 실제의 1/N(현수막 축소본 등)</div>'
    + '<button id="iaeCanNestRun" class="w-full px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-sm"><i class="fas fa-table-cells mr-1"></i>대지에 배치</button>'
    + '<div class="text-[11px] text-gray-400">배치 조각은 대지 객체가 되어 개별 편집·주문 연결(N4)에 사용</div>'
    + '<div class="text-[11px] text-amber-600 border-t border-amber-100 pt-2 mt-1"><i class="fas fa-arrows-up-down-left-right mr-1"></i><b>이형 인터록</b>: 배치 후 조각을 드래그·회전(R)해 겹쳐 끼워맞추면 주문 시 <b>현재 배치 그대로</b> 출력(롤 길이 자동 단축). 시트 안에 넣은 조각만 그 시트에 포함.</div>'
    + '</div>';
  var bindVal = function (id, prop, parse) { var el = document.getElementById(id); if (el) el.addEventListener('change', function () { o[prop] = parse ? parse(el.value) : el.value; }); };
  var modeEl = document.getElementById('iaeCanNestMode');
  if (modeEl) modeEl.addEventListener('change', function () { o.mode = modeEl.value; o.presetIdx = 0; iaeCanRenderNestPanel(); });
  bindVal('iaeCanNestGroup', 'key');
  bindVal('iaeCanNestQty', 'qty', function (v) { return parseInt(v, 10) || 1; });
  bindVal('iaeCanNestPreset', 'presetIdx', function (v) { return parseInt(v, 10) || 0; });
  bindVal('iaeCanNestGap', 'gap', function (v) { return parseFloat(v) || 0; });
  bindVal('iaeCanNestMargin', 'margin', function (v) { return parseFloat(v) || 0; });
  var runEl = document.getElementById('iaeCanNestRun');
  if (runEl) runEl.addEventListener('click', function () {
    o.key = document.getElementById('iaeCanNestGroup').value;
    o.qty = parseInt(document.getElementById('iaeCanNestQty').value, 10) || 1;
    o.mode = document.getElementById('iaeCanNestMode').value;
    o.presetIdx = parseInt(document.getElementById('iaeCanNestPreset').value, 10) || 0;
    o.gap = parseFloat(document.getElementById('iaeCanNestGap').value) || 0;
    o.margin = parseFloat(document.getElementById('iaeCanNestMargin').value) || 0;
    o.target_w = parseFloat(document.getElementById('iaeCanNestTW').value) || 0;
    o.target_h = parseFloat(document.getElementById('iaeCanNestTH').value) || 0;
    o.file_scale = parseFloat(document.getElementById('iaeCanNestFS').value) || 1;
    iaeCanNestPlace(o);
  });
  var closeEl = document.getElementById('iaeCanNestClose');
  if (closeEl) closeEl.addEventListener('click', function () { host.classList.add('hidden'); host.innerHTML = ''; });
}

// ── N4: 주문 연결 (품목 지정 모달 · 개별/네스팅 라인 · 새 주문 · 면적단가) ──
// 대지 객체/시트 → order_items. 개별 객체=라인1, 시트=라인1(수량=조각수). 새 주문 POST /api/orders.
// 마감 per-side → 대표 단일 finishing(에이전트 호환). 출력은 기존 에이전트(아트보드+finishing) 동작.
var iaeOmState = { client_id: null, client_name: '', lines: [] };
var iaeOmClientTimer = null, iaeOmItemTimer = null;  // 거래처/품목 검색 디바운스 분리 (공유 시 레이스)

function iaeCanFileR2(fid) {
  var f = iaeFiles.filter(function (x) { return x.id === fid; })[0];
  return f ? ('r2://sources/' + fid + '/' + f.filename) : null;
}
// 마감 per-side 요약(표시용): 중복 제거 method 나열
function iaeFinSummary(fin) {
  if (!fin) return '';
  var arr = [fin.top, fin.bottom, fin.left, fin.right].filter(Boolean), uniq = [];
  arr.forEach(function (m) { if (uniq.indexOf(m) === -1) uniq.push(m); });
  return uniq.join('+');
}
// 마감 per-side → 에이전트 finishing JSON (orderForm과 동일 포맷; 에이전트가 4면 개별 적용). 전부 비면 null
function iaeFinJson(fin) {
  if (!fin || (!fin.top && !fin.bottom && !fin.left && !fin.right)) return null;
  return JSON.stringify({ top: fin.top || '', bottom: fin.bottom || '', left: fin.left || '', right: fin.right || '' });
}
// order_item.post_processing 배열: 돔보(TRIM) + 캔버스 리사이즈(RESIZE 목표크기). 둘 다 없으면 null
function iaeOmPostProc(ln) {
  var pp = [];
  if (ln.trim) pp.push({ code: 'TRIM', params: {} });
  var resized = (ln.det_w_cm != null && ln.det_h_cm != null) && (ln.w_cm !== ln.det_w_cm || ln.h_cm !== ln.det_h_cm) && ln.w_cm > 0 && ln.h_cm > 0;
  if (resized) pp.push({ code: 'RESIZE', params: { w_cm: ln.w_cm, h_cm: ln.h_cm } });
  return pp.length ? JSON.stringify(pp) : null;
}
function iaeCanBuildOrderLines() {
  var lines = [];
  iaeCanReassignSheets();                    // 이형 인터록: 멤버십 전수 확정(포함관계·앵커 fid)
  iaeCanSheets.forEach(iaeCanSyncSheet);     // placements·규격·효율을 라이브 조각 위치에서 재계산
  iaeCanSheets.forEach(function (sh) {
    var pieces = iaeCanObjs.filter(function (o) { return o.sheetUid === sh.uid; });
    if (!pieces.length || !sh.placements || !sh.placements.length) return;
    var p0 = pieces[0], src = iaeCanSrc(p0.key);
    lines.push({
      kind: 'sheet', fid: p0.fid, gi: p0.gi, label: (src ? src.filename : '') + ' #' + p0.gi + ' [시트 ' + pieces.length + '조각]',
      w_cm: Math.round((src ? src.w_mm : p0.w_mm) / 10), h_cm: Math.round((src ? src.h_mm : p0.h_mm) / 10),
      qty: pieces.length, fin: p0.fin || null, trim: !!sh.trim,
      det_w_cm: Math.round((src ? src.w_mm : p0.w_mm) / 10), det_h_cm: Math.round((src ? src.h_mm : p0.h_mm) / 10),
      sheetRec: (sh.placements && sh.placements.length) ? sh : null,  // N4 네스팅 렌더용(placements 보유 시)
      item_id: null, item_name: '', pricing_method: 'FIXED', unit_price: 0
    });
  });
  iaeCanObjs.filter(function (o) { return !o.sheetUid; }).forEach(function (o) {
    var src = iaeCanSrc(o.key);
    lines.push({
      kind: 'obj', fid: o.fid, gi: o.gi, label: (src ? src.filename : '') + ' #' + o.gi,
      w_cm: Math.round(o.w_mm / 10), h_cm: Math.round(o.h_mm / 10),
      qty: 1, fin: o.fin || null, trim: !!o.trim, scale_factor: o.scale_factor || 1,
      det_w_cm: Math.round(((src ? src.w_mm : o.w_mm) || 0) / 10), det_h_cm: Math.round(((src ? src.h_mm : o.h_mm) || 0) / 10),
      item_id: null, item_name: '', pricing_method: 'FIXED', unit_price: 0
    });
  });
  return lines;
}
function iaeOmLineAmount(ln) {
  var up = Number(ln.unit_price) || 0, qty = Math.max(1, Number(ln.qty) || 1);
  var amt;
  if (ln.pricing_method === 'AREA' && ln.w_cm > 0 && ln.h_cm > 0) {
    var wR = Math.ceil((ln.w_cm * 10) / 10) * 10, hR = Math.ceil((ln.h_cm * 10) / 10) * 10; // mm 올림(=cm)
    amt = up * (wR / 100) * (hR / 100) * qty;
  } else { amt = up * qty; }
  return Math.round(amt / 100) * 100;
}

function iaeCanOpenOrderModal() {
  var lines = iaeCanBuildOrderLines();
  if (lines.length === 0) { iaeToast('대지에 객체가 없습니다', 'error'); return; }
  iaeOmState = { mode: 'new', client_id: null, client_name: '', target_order_id: null, target_order_label: '', lines: lines };
  var prev = document.getElementById('iaeOrderModal'); if (prev) prev.remove();
  var modal = document.createElement('div');
  modal.id = 'iaeOrderModal';
  modal.className = 'fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4';
  modal.innerHTML = ''
    + '<div class="bg-white rounded-xl shadow-xl w-full max-w-3xl flex flex-col" style="max-height:88vh;">'
    + '<div class="flex items-center justify-between px-5 py-3 border-b border-gray-200"><h3 class="font-bold text-gray-900"><i class="fas fa-file-invoice mr-2 text-green-600"></i>주문으로 보내기</h3>'
    + '<button id="iaeOmClose" class="text-gray-400 hover:text-gray-700 text-xl leading-none">&times;</button></div>'
    + '<div class="p-5 overflow-y-auto space-y-4">'
    // 모드 토글: 신규 주문 생성 / 기존 주문에 추가
    + '<div class="inline-flex rounded-lg border border-gray-200 p-0.5 text-sm">'
    + '<button id="iaeOmModeNew" type="button" class="px-3 py-1.5 rounded-md font-medium">신규 주문 생성</button>'
    + '<button id="iaeOmModeAppend" type="button" class="px-3 py-1.5 rounded-md font-medium">기존 주문에 추가</button>'
    + '</div>'
    // 신규 모드: 거래처 + 납품일
    + '<div id="iaeOmNewFields" class="grid grid-cols-2 gap-3">'
    + '<div class="relative"><label class="block text-xs text-gray-500 mb-1">거래처 *</label>'
    + '<input id="iaeOmClient" autocomplete="off" placeholder="거래처명/코드 검색…" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">'
    + '<div id="iaeOmClientList" class="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto hidden"></div></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">납품일 *</label><input id="iaeOmDate" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"></div>'
    + '</div>'
    // 기존 모드: 대상 주문 검색
    + '<div id="iaeOmAppendFields" class="hidden">'
    + '<label class="block text-xs text-gray-500 mb-1">대상 주문 * <span class="text-gray-400">— 출력완료까지의 주문에만 추가 가능</span></label>'
    + '<div class="relative"><input id="iaeOmOrder" autocomplete="off" placeholder="주문번호/거래처 검색…" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">'
    + '<div id="iaeOmOrderList" class="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto hidden"></div></div>'
    + '<div id="iaeOmOrderSel" class="hidden mt-2 text-sm text-gray-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2"></div>'
    + '</div>'
    + '<div><div class="text-xs font-semibold text-gray-500 mb-2">주문 라인 (' + lines.length + ') <span class="font-normal text-gray-400">— 개별 객체=라인, 시트=1라인(수량=조각수). 품목을 지정하세요.</span></div>'
    + '<div id="iaeOmLines" class="space-y-2"></div></div>'
    + '<div id="iaeOmSummary" class="text-right text-sm text-gray-600 border-t border-gray-100 pt-2"></div>'
    + '</div>'
    + '<div class="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">'
    + '<button id="iaeOmCancel" class="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm">취소</button>'
    + '<button id="iaeOmSubmit" class="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 text-sm font-medium"><i class="fas fa-check mr-1"></i>주문 생성</button>'
    + '</div></div>';
  document.body.appendChild(modal);
  // 기본 납품일 = 오늘+3
  try { var dd = new Date(); dd.setDate(dd.getDate() + 3); document.getElementById('iaeOmDate').value = dd.toISOString().split('T')[0]; } catch (_e) {}

  document.getElementById('iaeOmClose').addEventListener('click', iaeCanCloseOrderModal);
  document.getElementById('iaeOmCancel').addEventListener('click', iaeCanCloseOrderModal);
  modal.addEventListener('mousedown', function (e) { if (e.target === modal) iaeCanCloseOrderModal(); });
  document.getElementById('iaeOmSubmit').addEventListener('click', iaeCanSubmitOrder);
  var bN = document.getElementById('iaeOmModeNew'), bA = document.getElementById('iaeOmModeAppend');
  if (bN) bN.addEventListener('click', function () { iaeOmSetMode('new'); });
  if (bA) bA.addEventListener('click', function () { iaeOmSetMode('append'); });
  iaeOmWireClientSearch();
  iaeOmWireOrderSearch();
  iaeOmSetMode('new');
  iaeOmRenderLines();
}
function iaeCanCloseOrderModal() { var m = document.getElementById('iaeOrderModal'); if (m) m.remove(); }

// 모드 전환: 신규 주문 생성 / 기존 주문에 추가
function iaeOmSetMode(mode) {
  iaeOmState.mode = mode;
  var nf = document.getElementById('iaeOmNewFields'), af = document.getElementById('iaeOmAppendFields');
  if (nf) nf.classList.toggle('hidden', mode !== 'new');
  if (af) af.classList.toggle('hidden', mode !== 'append');
  function setBtn(btn, active) {
    if (!btn) return;
    btn.classList.toggle('bg-blue-600', active); btn.classList.toggle('text-white', active);
    btn.classList.toggle('text-gray-600', !active);
  }
  setBtn(document.getElementById('iaeOmModeNew'), mode === 'new');
  setBtn(document.getElementById('iaeOmModeAppend'), mode === 'append');
  var sub = document.getElementById('iaeOmSubmit');
  if (sub) sub.innerHTML = mode === 'append' ? '<i class="fas fa-plus mr-1"></i>라인 추가' : '<i class="fas fa-check mr-1"></i>주문 생성';
}

// 대상 주문 검색 (append). orderVisibilityFilter로 서버가 법인 격리. 출력완료까지만 선택 가능.
var iaeOmOrderTimer = null;
function iaeOmWireOrderSearch() {
  var inp = document.getElementById('iaeOmOrder'), list = document.getElementById('iaeOmOrderList'), sel = document.getElementById('iaeOmOrderSel');
  if (!inp || !list) return;
  var APPENDABLE = { CONFIRMED: 1, PRINTING: 1, PRINT_DONE: 1, HOLD: 1 };
  inp.addEventListener('input', function () {
    iaeOmState.target_order_id = null; iaeOmState.target_order_label = '';
    if (sel) sel.classList.add('hidden');
    var q = inp.value.trim();
    if (iaeOmOrderTimer) clearTimeout(iaeOmOrderTimer);
    if (q.length < 1) { list.classList.add('hidden'); return; }
    iaeOmOrderTimer = setTimeout(function () {
      axios.get('/api/orders', { params: { search: q, limit: 12 } }).then(function (res) {
        var rows = (res.data && (res.data.data || res.data.orders)) || [];
        if (!Array.isArray(rows)) rows = [];
        if (!rows.length) { list.innerHTML = '<div class="px-3 py-2 text-xs text-gray-400">검색 결과 없음</div>'; list.classList.remove('hidden'); return; }
        list.innerHTML = rows.map(function (r) {
          var st = r.status || '';
          var label = window.MES_STATUS ? window.MES_STATUS.orderLabel(st) : st;
          var ok = !!APPENDABLE[st];
          return '<div class="iae-om-ord px-3 py-2 text-sm border-b border-gray-50 ' + (ok ? 'hover:bg-blue-50 cursor-pointer' : 'opacity-40 cursor-not-allowed') + '"'
            + ' data-id="' + r.id + '" data-ok="' + (ok ? 1 : 0) + '" data-label="' + iaeEscape((r.order_number || ('#' + r.id)) + ' / ' + (r.client_name || '')) + '">'
            + '<span class="font-medium text-gray-800">' + iaeEscape(r.order_number || ('#' + r.id)) + '</span> '
            + '<span class="text-gray-500">' + iaeEscape(r.client_name || '') + '</span> '
            + '<span class="text-[10px] ' + (ok ? 'text-green-600' : 'text-gray-400') + '">' + iaeEscape(label) + '</span>'
            + (ok ? '' : ' <span class="text-[10px] text-red-400">추가 불가</span>') + '</div>';
        }).join('');
        list.classList.remove('hidden');
        Array.prototype.forEach.call(list.querySelectorAll('.iae-om-ord'), function (el) {
          el.addEventListener('click', function () {
            if (el.getAttribute('data-ok') !== '1') { iaeToast('출력완료까지의 주문에만 추가할 수 있습니다', 'error'); return; }
            iaeOmState.target_order_id = parseInt(el.getAttribute('data-id'), 10);
            iaeOmState.target_order_label = el.getAttribute('data-label');
            inp.value = iaeOmState.target_order_label; list.classList.add('hidden');
            if (sel) { sel.classList.remove('hidden'); sel.innerHTML = '<i class="fas fa-check-circle text-green-600 mr-1"></i>대상: <b>' + iaeEscape(iaeOmState.target_order_label) + '</b>'; }
          });
        });
      }).catch(function () { list.classList.add('hidden'); });
    }, 250);
  });
}

function iaeOmWireClientSearch() {
  var inp = document.getElementById('iaeOmClient'), list = document.getElementById('iaeOmClientList');
  if (!inp || !list) return;
  inp.addEventListener('input', function () {
    iaeOmState.client_id = null;
    var q = inp.value.trim();
    if (iaeOmClientTimer) clearTimeout(iaeOmClientTimer);
    if (q.length < 1) { list.classList.add('hidden'); return; }
    iaeOmClientTimer = setTimeout(function () {
      axios.get('/api/clients', { params: { search: q, limit: 12, active: '1' } }).then(function (res) {
        var rows = (res.data && res.data.data && res.data.data.clients) || [];
        if (!rows.length) { list.innerHTML = '<div class="px-3 py-2 text-xs text-gray-400">검색 결과 없음</div>'; list.classList.remove('hidden'); return; }
        list.innerHTML = rows.map(function (r) { return '<div class="iae-om-cli px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer" data-id="' + r.id + '" data-name="' + iaeEscape(r.client_name) + '">' + iaeEscape(r.client_name) + (r.client_code ? ' <span class="text-xs text-gray-400">' + iaeEscape(r.client_code) + '</span>' : '') + '</div>'; }).join('');
        list.classList.remove('hidden');
        Array.prototype.forEach.call(list.querySelectorAll('.iae-om-cli'), function (el) {
          el.addEventListener('click', function () {
            iaeOmState.client_id = parseInt(el.getAttribute('data-id'), 10);
            iaeOmState.client_name = el.getAttribute('data-name');
            inp.value = iaeOmState.client_name; list.classList.add('hidden');
          });
        });
      }).catch(function () { list.classList.add('hidden'); });
    }, 250);
  });
}

function iaeOmRenderLines() {
  var host = document.getElementById('iaeOmLines'); if (!host) return;
  var inputCls = 'border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500';
  host.innerHTML = iaeOmState.lines.map(function (ln, i) {
    return '<div class="border border-gray-200 rounded-lg p-2" data-idx="' + i + '">'
      + '<div class="flex items-center gap-2 mb-1"><span class="text-xs font-semibold text-gray-700 truncate flex-1">' + iaeEscape(ln.label) + '</span>'
      + '<span class="text-[11px] text-gray-400">' + ln.w_cm + '×' + ln.h_cm + 'cm' + (iaeFinSummary(ln.fin) ? ' · ' + iaeEscape(iaeFinSummary(ln.fin)) : '') + (ln.trim ? ' · 돔보' : '') + ((ln.w_cm !== ln.det_w_cm || ln.h_cm !== ln.det_h_cm) ? ' · 리사이즈' : '') + '</span></div>'
      + '<div class="flex items-center gap-2">'
      + '<div class="relative flex-1"><input class="iae-om-item w-full ' + inputCls + '" data-idx="' + i + '" autocomplete="off" placeholder="품목 검색(PM-…)" value="' + iaeEscape(ln.item_name) + '">'
      + '<div class="iae-om-itemlist absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto hidden" data-idx="' + i + '"></div></div>'
      + '<input class="iae-om-qty w-16 ' + inputCls + '" data-idx="' + i + '" type="number" min="1" step="1" value="' + ln.qty + '" title="수량">'
      + '<input class="iae-om-price w-24 ' + inputCls + '" data-idx="' + i + '" type="number" min="0" step="100" value="' + ln.unit_price + '" title="단가' + (ln.pricing_method === 'AREA' ? '(면적/㎡)' : '') + '">'
      + '<span class="iae-om-amt text-xs text-gray-500 w-24 text-right" data-idx="' + i + '"></span>'
      + '</div></div>';
  }).join('');
  // wire per-line
  iaeOmState.lines.forEach(function (ln, i) {
    var qtyEl = host.querySelector('.iae-om-qty[data-idx="' + i + '"]');
    var priceEl = host.querySelector('.iae-om-price[data-idx="' + i + '"]');
    var itemEl = host.querySelector('.iae-om-item[data-idx="' + i + '"]');
    var itemList = host.querySelector('.iae-om-itemlist[data-idx="' + i + '"]');
    if (qtyEl) qtyEl.addEventListener('input', function () { ln.qty = Math.max(1, parseInt(qtyEl.value, 10) || 1); iaeOmUpdateAmount(i); });
    if (priceEl) priceEl.addEventListener('input', function () { ln.unit_price = parseFloat(priceEl.value) || 0; iaeOmUpdateAmount(i); });
    if (itemEl) itemEl.addEventListener('input', function () {
      ln.item_id = null;
      var q = itemEl.value.trim();
      if (iaeOmItemTimer) clearTimeout(iaeOmItemTimer);
      if (q.length < 1) { itemList.classList.add('hidden'); return; }
      iaeOmItemTimer = setTimeout(function () {
        axios.get('/api/items', { params: { search: q, limit: 12 } }).then(function (res) {
          var rows = (res.data && res.data.data) || [];
          if (!rows.length) { itemList.innerHTML = '<div class="px-3 py-2 text-xs text-gray-400">결과 없음</div>'; itemList.classList.remove('hidden'); return; }
          itemList.innerHTML = rows.map(function (r) {
            return '<div class="iae-om-itemopt px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer" data-id="' + r.id + '" data-name="' + iaeEscape(r.item_name || '') + '" data-pm="' + (r.pricing_method || 'FIXED') + '" data-price="' + (r.base_price || 0) + '">'
              + iaeEscape(r.item_name || '') + (r.item_code ? ' <span class="text-xs text-gray-400">' + iaeEscape(r.item_code) + '</span>' : '') + (r.pricing_method === 'AREA' ? ' <span class="text-[10px] text-blue-500">면적</span>' : '') + '</div>';
          }).join('');
          itemList.classList.remove('hidden');
          Array.prototype.forEach.call(itemList.querySelectorAll('.iae-om-itemopt'), function (el) {
            el.addEventListener('click', function () {
              ln.item_id = parseInt(el.getAttribute('data-id'), 10);
              ln.item_name = el.getAttribute('data-name');
              ln.pricing_method = el.getAttribute('data-pm') || 'FIXED';
              var dp = parseFloat(el.getAttribute('data-price')) || 0;
              if (dp > 0 && (!ln.unit_price || ln.unit_price === 0)) { ln.unit_price = dp; if (priceEl) priceEl.value = dp; }
              itemEl.value = ln.item_name; itemList.classList.add('hidden');
              iaeOmUpdateAmount(i);
            });
          });
        }).catch(function () { itemList.classList.add('hidden'); });
      }, 250);
    });
    iaeOmUpdateAmount(i);
  });
  iaeOmUpdateSummary();
}
function iaeOmUpdateAmount(i) {
  var ln = iaeOmState.lines[i]; if (!ln) return;
  var el = document.querySelector('#iaeOmLines .iae-om-amt[data-idx="' + i + '"]');
  if (el) el.textContent = iaeOmLineAmount(ln).toLocaleString() + '원';
  iaeOmUpdateSummary();
}
function iaeOmUpdateSummary() {
  var el = document.getElementById('iaeOmSummary'); if (!el) return;
  var total = 0; iaeOmState.lines.forEach(function (ln) { total += iaeOmLineAmount(ln); });
  el.innerHTML = '합계(VAT 별도) <b class="text-gray-900">' + total.toLocaleString() + '원</b>';
}

function iaeCanSubmitOrder() {
  var isAppend = iaeOmState.mode === 'append';
  var dateEl = document.getElementById('iaeOmDate');
  var delivery = dateEl ? dateEl.value : '';
  if (isAppend) {
    if (!iaeOmState.target_order_id) { iaeToast('추가할 대상 주문을 선택하세요', 'error'); return; }
  } else {
    if (!iaeOmState.client_id) { iaeToast('거래처를 선택하세요', 'error'); return; }
    if (!delivery) { iaeToast('납품일을 입력하세요', 'error'); return; }
  }
  var missing = iaeOmState.lines.filter(function (ln) { return !ln.item_id; });
  if (missing.length) { iaeToast(missing.length + '개 라인의 품목을 지정하세요', 'error'); return; }

  // 네스팅 실제배치(다중 시트): placements 보유 시트는 per-item SHEET pp로 → 에이전트가 시트별 SheetLayout 렌더
  var primaryFid = iaeOmState.lines[0].fid;
  var aiPath = iaeCanFileR2(primaryFid);
  var seenAi = {}, aiFiles = [];
  iaeOmState.lines.forEach(function (ln) {
    if (ln.fid && !seenAi[ln.fid]) { seenAi[ln.fid] = 1; var fp = iaeCanFileR2(ln.fid); if (fp) aiFiles.push({ file_path: fp, analysis_id: ln.fid }); }
  });

  var items = iaeOmState.lines.map(function (ln) {
    var isSheet = ln.kind === 'sheet' && ln.sheetRec && ln.sheetRec.placements && ln.sheetRec.placements.length;
    if (isSheet) {
      var sh = ln.sheetRec;
      // 각 시트 = 독립 order_item + SHEET pp → 에이전트 ProcessItemAsync SHEET 분기에서 SheetLayout 렌더(다중 시트 지원)
      var sheetPP = JSON.stringify([{ code: 'SHEET', params: {
        scale_factor: sh.scale_factor || 1, roll_width_cm: sh.roll_width_cm, total_height_cm: sh.total_height_cm,
        margin_cm: sh.margin_cm || 0, placements: sh.placements
      } }]);
      return {
        item_id: ln.item_id, item_name: ln.item_name,
        width_mm: Math.round((sh.roll_width_cm || 0) * 10), height_mm: Math.round((sh.total_height_cm || 0) * 10),
        quantity: ln.qty, unit: 'EA', unit_price: Number(ln.unit_price) || 0, vat_included: 1,
        ai_group_index: ln.gi, ai_analysis_id: ln.fid, content: ln.label, post_processing: sheetPP
      };
    }
    return {
      item_id: ln.item_id, item_name: ln.item_name,
      width_mm: ln.w_cm * 10, height_mm: ln.h_cm * 10,
      quantity: ln.qty, unit: 'EA', unit_price: Number(ln.unit_price) || 0, vat_included: 1,
      ai_group_index: ln.gi, ai_analysis_id: ln.fid, scale_factor: ln.scale_factor || 1,
      finishing: iaeFinJson(ln.fin), content: ln.label, post_processing: iaeOmPostProc(ln)
    };
  });

  var btn = document.getElementById('iaeOmSubmit');
  var nLines = iaeOmState.lines.length;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>' + (isAppend ? '추가 중…' : '생성 중…'); }

  if (isAppend) {
    // 기존 주문에 라인 추가 (거래처/납품일은 대상 주문 상속)
    var appendBody = { ai_file_path: aiPath, ai_analysis_id: primaryFid, ai_files: aiFiles, items: items };
    axios.post('/api/orders/' + iaeOmState.target_order_id + '/items', appendBody).then(function (res) {
      var d = res.data && res.data.data;
      iaeToast((d ? d.order_number : '주문') + '에 ' + (d ? d.added : nLines) + '개 라인 추가 완료', 'success');
      if (res.data && res.data.warning) iaeToast(res.data.warning, 'info');
      iaeCanCloseOrderModal();
    }).catch(function (err) {
      var msg = (err.response && err.response.data && err.response.data.error) || err.message || '라인 추가 실패';
      iaeToast(msg, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus mr-1"></i>라인 추가'; }
    });
    return;
  }

  var body = {
    client_id: iaeOmState.client_id, delivery_date: delivery,
    ai_file_path: aiPath, ai_analysis_id: primaryFid, ai_files: aiFiles, items: items
  };
  axios.post('/api/orders', body).then(function (res) {
    var d = res.data && res.data.data;
    iaeToast('주문 생성 완료: ' + (d ? d.order_number : '') + ' (' + nLines + '라인)', 'success');
    iaeCanCloseOrderModal();
  }).catch(function (err) {
    var msg = (err.response && err.response.data && err.response.data.error) || err.message || '주문 생성 실패';
    iaeToast(msg, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check mr-1"></i>주문 생성'; }
  });
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
  // 뷰 토글 (파일 처리 / 대지 편집 / 네스팅)
  var vEdit = document.getElementById('iaeViewEdit'), vCanvas = document.getElementById('iaeViewCanvas');
  if (vEdit) vEdit.addEventListener('click', function () { iaeSetView('edit'); });
  if (vCanvas) vCanvas.addEventListener('click', function () { iaeSetView('canvas'); });
  iaeCanLoad();          // N1: 대지 객체 영속 복원
  iaeCanWireToolbar();   // N1: 대지 툴바 + 핫키 1회 바인딩

  var ids = iaeLoadIds();
  iaeActiveId = ids.length ? ids[0] : null;
  iaeLoadFinishing(); // 마감 데이터 로드 후 패널 렌더
  iaeRefresh();
})();
