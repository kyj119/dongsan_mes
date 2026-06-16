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

// ── P3 시트 네스팅 상태 ───────────────────────────────────────────
var IAE_NEST_KEY = 'iae_nest_v1';
var iaeNestSet = [];      // [{key, analysis_id, group_index, label, thumbnail_base64, w, h, qty}]
var iaeView = 'edit';     // 'edit' | 'nest'
var iaeNestResult = null; // 마지막 자동배치 결과
var iaeLastSheetId = null; // 마지막 저장된 sheet_layout id (P5 출력용)
var iaeRenderPollTimer = null;
// 규격 프리셋 (cm) — 롤폭 914~1520mm, 평판 900×1800·1200×2400 (spec §12)
var IAE_ROLL_PRESETS = [
  { label: '914mm 롤', w: 91.4 }, { label: '1050mm 롤', w: 105 }, { label: '1270mm 롤', w: 127 },
  { label: '1370mm 롤', w: 137 }, { label: '1520mm 롤', w: 152 }
];
var IAE_FLAT_PRESETS = [{ label: '평판 900×1800', w: 90, h: 180 }, { label: '평판 1200×2400', w: 120, h: 240 }];
var iaeNestOpts = { mode: 'roll', presetIdx: 0, gap: 0.3, margin: 1.0, item_code: '' }; // margin=돔보 외곽 1cm

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

  // 캔버스 검수: 전체 렌더 + 그룹 박스 (canvas 데이터 있을 때)
  var hasCanvas = !!(f.canvas && f.canvas.render_base64);
  if (hasCanvas) {
    panel.innerHTML = head
      + '<div class="flex gap-5 items-start">'
      + '<div class="flex-1 min-w-0">'
      + '<div class="flex items-center justify-between mb-2">'
      + '<span class="text-xs font-semibold text-gray-500"><i class="fas fa-vector-square mr-1 text-blue-500"></i>검수 캔버스 — 그룹 박스를 드래그·리사이즈해 검출 영역 보정</span>'
      + '<button id="iaeResetBox" class="text-xs text-gray-400 hover:text-red-500"><i class="fas fa-rotate-left mr-1"></i>선택 보정 초기화</button>'
      + '</div>'
      + '<div id="iaeCanvasHost" class="border border-gray-200 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center text-gray-300" style="min-height:300px;"><i class="fas fa-spinner fa-spin text-2xl"></i></div>'
      + '<div class="text-[11px] text-gray-400 mt-1">전체 ' + (f.canvas.w_mm || 0) + '×' + (f.canvas.h_mm || 0) + 'mm · 그룹 ' + f.groups.length + '개 · 박스를 옮기면 즉시 보정 저장(로컬)</div>'
      + '</div>'
      + '<div class="w-96 flex-shrink-0" id="iaeInspector"></div>'
      + '</div>';
    iaeWireRefresh();
    var rbx = document.getElementById('iaeResetBox');
    if (rbx) rbx.addEventListener('click', function () { iaeResetCorrection(f); });
    iaeInitCanvas(f);
    iaeRenderInspector(f);
    return;
  }

  // 좌: 그룹 리스트 (canvas 없는 구버전/렌더실패 폴백)
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

// ── Phase 2/3: Konva 검수 캔버스 (전체 렌더 + 그룹 박스 드래그/리사이즈 보정) ──
//   f.canvas = {render_base64, w_pt, h_pt, w_mm, h_mm} (ExtractGroups 전체 렌더)
//   f.groups[i].canvas_x/y/w/h_pt = 캔버스 내 그룹 절대좌표. 보정은 localStorage(좌표저장) + 클라 크롭(v1).
//   서버 영속 + IL 재추출은 출력 단계(다음). "편집=그림수정❌, 검출/바운드 보정⭕".
var IAE_CORR_KEY = 'iae_corrections_v1';
var iaeCorrections = {};        // 'fid:gi' → {x_pt,y_pt,w_pt,h_pt} (캔버스 좌표 보정값)
var iaeStage = null, iaeLayer = null, iaeTr = null;
var iaeKonvaLoading = false, iaeKonvaCbs = [];
var iaeRenderCache = {};        // fid → {img, loaded}
var IAE_PT_MM = 25.4 / 72;

function iaeLoadCorr() {
  try { var raw = localStorage.getItem(IAE_CORR_KEY); iaeCorrections = raw ? (JSON.parse(raw) || {}) : {}; } catch (_e) { iaeCorrections = {}; }
}
function iaeSaveCorr() { try { localStorage.setItem(IAE_CORR_KEY, JSON.stringify(iaeCorrections)); } catch (_e) {} }
function iaeCorrKey(fid, gi) { return fid + ':' + gi; }

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

// 그룹 유효 박스(보정 우선) — 캔버스 좌표(pt, 좌상단 원점)
function iaeGroupBox(fid, group, gi) {
  var c = iaeCorrections[iaeCorrKey(fid, gi)];
  if (c) return { x: c.x_pt, y: c.y_pt, w: c.w_pt, h: c.h_pt };
  if (group && group.canvas_x_pt != null) return { x: group.canvas_x_pt, y: group.canvas_y_pt, w: group.canvas_w_pt, h: group.canvas_h_pt };
  return null;
}
// 그룹 유효 크기(mm) — 보정 반영
function iaeEffMm(fid, group, gi) {
  var box = iaeGroupBox(fid, group, gi);
  if (box) return { w_mm: Math.round(box.w * IAE_PT_MM), h_mm: Math.round(box.h * IAE_PT_MM) };
  return { w_mm: (group && group.width_mm != null) ? group.width_mm : 0, h_mm: (group && group.height_mm != null) ? group.height_mm : 0 };
}
function iaeIsCorrected(fid, gi) { return !!iaeCorrections[iaeCorrKey(fid, gi)]; }

function iaeInitCanvas(f) {
  var host = document.getElementById('iaeCanvasHost');
  if (!host || !f.canvas || !f.canvas.render_base64) return;
  var cw = f.canvas.w_pt || 1, ch = f.canvas.h_pt || 1;
  iaeLoadKonva(function () {
    host = document.getElementById('iaeCanvasHost');
    if (!host) return; // 그 사이 패널이 교체됨
    var hostW = host.clientWidth || 600;
    var stageW = hostW, stageH = Math.round(stageW * ch / cw);
    var maxH = 600;
    if (stageH > maxH) { stageH = maxH; stageW = Math.round(stageH * cw / ch); }
    if (stageW < 1) stageW = 1;
    if (stageH < 1) stageH = 1;
    host.innerHTML = '';
    iaeStage = new Konva.Stage({ container: host, width: stageW, height: stageH });
    iaeLayer = new Konva.Layer();
    iaeStage.add(iaeLayer);
    iaeGetRenderImg(f, function (img) {
      if (!img || !iaeStage) return;
      iaeLayer.add(new Konva.Image({ image: img, x: 0, y: 0, width: stageW, height: stageH, listening: false }));
      iaeBuildBoxes(f, stageW, stageH, cw, ch);
      iaeLayer.draw();
    });
  });
}

function iaeBuildBoxes(f, stageW, stageH, cw, ch) {
  iaeTr = new Konva.Transformer({ rotateEnabled: false, keepRatio: false, borderStroke: '#2563eb', anchorStroke: '#2563eb', anchorFill: '#fff', anchorSize: 9, ignoreStroke: true });
  iaeLayer.add(iaeTr);
  var gis = f.groups.map(function (g, i) { return (g.index != null) ? g.index : i; });
  var selRect = null;
  f.groups.forEach(function (g, i) {
    var gi = gis[i];
    var box = iaeGroupBox(f.id, g, gi);
    if (!box) return;
    var rect = new Konva.Rect({
      x: box.x / cw * stageW, y: box.y / ch * stageH,
      width: box.w / cw * stageW, height: box.h / ch * stageH,
      stroke: (gi === iaeActiveGroup) ? '#2563eb' : '#3b82f6', strokeWidth: 2,
      fill: 'rgba(37,99,235,0.08)', draggable: true, name: 'iae-box', gi: gi
    });
    rect.on('mousedown touchstart', function () { iaeSelectBox(f, gi, rect); });
    rect.on('dragend transformend', function () { iaeCommitBox(f, gi, rect, stageW, stageH, cw, ch); });
    var label = new Konva.Text({ x: rect.x() + 4, y: rect.y() + 4, text: '#' + gi, fontSize: 13, fontStyle: 'bold', fill: '#1e3a8a', listening: false, name: 'iae-lbl', gi: gi });
    iaeLayer.add(rect);
    iaeLayer.add(label);
    if (gi === iaeActiveGroup) selRect = rect;
  });
  if (selRect && iaeTr) iaeTr.nodes([selRect]);
}

function iaeSelectBox(f, gi, rect) {
  iaeActiveGroup = gi;
  if (iaeTr) iaeTr.nodes([rect]);
  if (iaeLayer) {
    iaeLayer.find('.iae-box').forEach(function (n) { n.stroke(n.getAttr('gi') === gi ? '#2563eb' : '#3b82f6'); });
    iaeLayer.draw();
  }
  iaeRenderInspector(f);
}

function iaeCommitBox(f, gi, rect, stageW, stageH, cw, ch) {
  var nw = Math.abs(rect.width() * rect.scaleX()), nh = Math.abs(rect.height() * rect.scaleY());
  rect.width(nw); rect.height(nh); rect.scaleX(1); rect.scaleY(1);
  var x = Math.max(0, Math.min(rect.x(), stageW));
  var y = Math.max(0, Math.min(rect.y(), stageH));
  iaeCorrections[iaeCorrKey(f.id, gi)] = {
    x_pt: x / stageW * cw, y_pt: y / stageH * ch, w_pt: nw / stageW * cw, h_pt: nh / stageH * ch
  };
  iaeSaveCorr();
  iaeLayer.find('.iae-lbl').forEach(function (n) { if (n.getAttr('gi') === gi) { n.x(rect.x() + 4); n.y(rect.y() + 4); } });
  iaeLayer.draw();
  iaeRenderInspector(f);
}

function iaeResetCorrection(f) {
  if (iaeActiveGroup == null) return;
  delete iaeCorrections[iaeCorrKey(f.id, iaeActiveGroup)];
  iaeSaveCorr();
  iaeRenderPanel();
}

function iaeGetRenderImg(f, cb) {
  var c = iaeRenderCache[f.id];
  if (c && c.loaded) { cb(c.img); return; }
  if (!f.canvas || !f.canvas.render_base64) { cb(null); return; }
  var img = new Image();
  iaeRenderCache[f.id] = { img: img, loaded: false };
  img.onload = function () { iaeRenderCache[f.id].loaded = true; cb(img); };
  img.onerror = function () { cb(null); };
  img.src = 'data:image/png;base64,' + f.canvas.render_base64;
}

// 선택 그룹의 (보정) 크롭을 <img> 요소에 그려넣기 — 없으면 무변경(원본 썸네일 유지)
function iaeCropInto(f, gi, imgEl) {
  if (!imgEl || !f.canvas) return;
  var group = f.groups.filter(function (g, i) { return ((g.index != null) ? g.index : i) === gi; })[0];
  if (!group) return;
  var box = iaeGroupBox(f.id, group, gi);
  if (!box) return;
  iaeGetRenderImg(f, function (img) {
    if (!img) return;
    var iw = img.naturalWidth, ih = img.naturalHeight, cw = f.canvas.w_pt || 1, ch = f.canvas.h_pt || 1;
    var sx = box.x / cw * iw, sy = box.y / ch * ih, sw = box.w / cw * iw, sh = box.h / ch * ih;
    if (sw <= 1 || sh <= 1) return;
    try {
      var cv = document.createElement('canvas');
      cv.width = Math.round(sw); cv.height = Math.round(sh);
      cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
      imgEl.src = cv.toDataURL('image/png');
    } catch (_e) { /* CORS-free data URL이므로 보통 안전 */ }
  });
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
  var corrected = iaeIsCorrected(f.id, iaeActiveGroup);

  var presetOpts = '<option value="">마감 프리셋…</option>';
  iaeFinPresets.forEach(function (p) { presetOpts += '<option value="' + iaeEscape(p.name) + '">' + iaeEscape(p.name) + '</option>'; });

  var inputCls = 'border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  var selCls = 'w-full ' + inputCls;

  var html = ''
    + '<div class="grid grid-cols-1 lg:grid-cols-2 gap-5">'
    // 설정 폼
    + '<div>'
    + '<div class="flex items-center justify-between mb-3">'
    + '<span class="text-sm font-semibold text-gray-700">#' + iaeActiveGroup + ' ' + iaeEscape(group.name || '') + ' <span class="text-xs font-normal ' + (corrected ? 'text-blue-600' : 'text-gray-400') + '">검출 ' + effW + '×' + effH + 'cm' + (corrected ? ' · 보정됨' : '') + '</span></span>'
    + '<button id="iaeAddNest" class="text-xs px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"><i class="fas fa-plus mr-1"></i>네스팅에 추가</button>'
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
    var pim = document.getElementById('iaePreviewImg');
    if (pim && f.canvas) iaeCropInto(f, iaeActiveGroup, pim);
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

  var addBtn = document.getElementById('iaeAddNest');
  if (addBtn) addBtn.addEventListener('click', function () { iaeAddToNest(f, group, s); });

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
function iaeLoadNest() {
  try { var raw = localStorage.getItem(IAE_NEST_KEY); iaeNestSet = raw ? (JSON.parse(raw) || []) : []; if (!Array.isArray(iaeNestSet)) iaeNestSet = []; }
  catch (_e) { iaeNestSet = []; }
}
function iaeSaveNest() { try { localStorage.setItem(IAE_NEST_KEY, JSON.stringify(iaeNestSet)); } catch (_e) {} }
function iaeUpdateNestCount() { var el = document.getElementById('iaeNestCount'); if (el) el.textContent = iaeNestSet.length; }

function iaeSetView(v) {
  iaeView = v;
  var ev = document.getElementById('iaeEditView'), nv = document.getElementById('iaeNestView');
  var be = document.getElementById('iaeViewEdit'), bn = document.getElementById('iaeViewNest');
  if (ev) ev.classList.toggle('hidden', v !== 'edit');
  if (nv) nv.classList.toggle('hidden', v !== 'nest');
  var on = 'border-blue-500 bg-blue-50 text-blue-700', off = 'border-gray-200 text-gray-600 hover:bg-gray-50';
  if (be) be.className = 'px-4 py-2 rounded-lg text-sm font-medium border ' + (v === 'edit' ? on : off);
  if (bn) bn.className = 'px-4 py-2 rounded-lg text-sm font-medium border ' + (v === 'nest' ? on : off);
  if (v === 'nest') iaeRenderNest();
}

function iaeAddToNest(f, group, s) {
  var w = Number(s.target_w) || 0, h = Number(s.target_h) || 0;
  if (w <= 0 || h <= 0) { iaeToast('목표 크기를 먼저 입력하세요', 'error'); return; }
  var gi = iaeActiveGroup;
  var key = f.id + ':' + gi;
  var entry = {
    key: key, analysis_id: f.id, group_index: gi, label: (f.filename + ' #' + gi),
    thumbnail_base64: group.thumbnail_base64 || null, w: w, h: h, qty: Math.max(1, Number(s.dup_count) || 1)
  };
  var existing = -1;
  for (var i = 0; i < iaeNestSet.length; i++) { if (iaeNestSet[i].key === key) { existing = i; break; } }
  if (existing >= 0) { iaeNestSet[existing] = entry; iaeToast('네스팅 항목 갱신', 'info'); }
  else { iaeNestSet.push(entry); iaeToast('네스팅에 추가됨', 'success'); }
  iaeSaveNest(); iaeUpdateNestCount();
  if (iaeView === 'nest') iaeRenderNest();
}
function iaeRemoveFromNest(i) { iaeNestSet.splice(i, 1); iaeSaveNest(); iaeUpdateNestCount(); iaeNestResult = null; iaeRenderNest(); }

// shelfBinPack 포팅 (원본: src/scripts/orderForm/sheet.js:402) — 폭 고정·면적 내림차순 shelf 적재 + 회전
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

function iaeNestAutoPlace() {
  var items = [], meta = {};
  iaeNestSet.forEach(function (e, ei) {
    var w = Number(e.w) || 0, h = Number(e.h) || 0, qty = Math.max(1, Number(e.qty) || 1);
    for (var q = 0; q < qty; q++) {
      var id = ei + '_' + q;
      items.push({ id: id, w: w, h: h });
      meta[id] = { label: e.label, thumb: e.thumbnail_base64, analysis_id: e.analysis_id, group_index: e.group_index };
    }
  });
  if (!items.length) { iaeToast('네스팅 항목이 없습니다', 'error'); return; }

  var o = iaeNestOpts;
  var presets = o.mode === 'flatbed' ? IAE_FLAT_PRESETS : IAE_ROLL_PRESETS;
  var preset = presets[o.presetIdx] || presets[0];
  var margin = Number(o.margin) || 0, gap = Number(o.gap) || 0;
  var availW = preset.w - margin * 2;
  if (availW <= 0) { iaeNestResult = { error: '여백이 시트 폭보다 큽니다' }; iaeRenderNest(); return; }

  var packed = iaeShelfBinPack(items, availW, gap);
  if (packed.error) { iaeNestResult = { error: packed.msg }; iaeRenderNest(); return; }

  var sheets = [];
  if (o.mode === 'flatbed') {
    var availH = preset.h - margin * 2;
    if (availH <= 0) { iaeNestResult = { error: '여백이 시트 높이보다 큽니다' }; iaeRenderNest(); return; }
    // 선반(같은 y)별로 묶어 시트 높이 cap으로 페이지네이션
    var byY = {};
    packed.placements.forEach(function (p) { (byY[p.y_cm] = byY[p.y_cm] || []).push(p); });
    var ys = Object.keys(byY).map(Number).sort(function (a, b) { return a - b; });
    function shelfH(arr) { var hh = 0; arr.forEach(function (p) { if (p.height_cm > hh) hh = p.height_cm; }); return hh; }
    for (var yi = 0; yi < ys.length; yi++) { if (shelfH(byY[ys[yi]]) > availH + 1e-6) { iaeNestResult = { error: '조각이 시트 높이를 초과합니다 (' + Math.round(shelfH(byY[ys[yi]])) + 'cm)' }; iaeRenderNest(); return; } }
    var cur = [], curBottom = 0;
    ys.forEach(function (y) {
      var arr = byY[y], sh = shelfH(arr);
      if (cur.length && (curBottom + gap + sh > availH + 1e-6)) { sheets.push(cur); cur = []; curBottom = 0; }
      var yLocal = cur.length ? curBottom + gap : 0;
      arr.forEach(function (p) { cur.push({ id: p.id, x_cm: p.x_cm, y_cm: yLocal, width_cm: p.width_cm, height_cm: p.height_cm, rotated: p.rotated }); });
      curBottom = yLocal + sh;
    });
    if (cur.length) sheets.push(cur);
    sheets = sheets.map(function (pl) { return { width_cm: preset.w, height_cm: preset.h, placements: pl.map(function (p) { return iaeShiftP(p, margin); }) }; });
  } else {
    sheets = [{ width_cm: preset.w, height_cm: packed.total_height_cm + margin * 2, placements: packed.placements.map(function (p) { return iaeShiftP(p, margin); }) }];
  }

  var totalArea = 0, sheetArea = 0;
  iaeNestSet.forEach(function (e) { var qty = Math.max(1, Number(e.qty) || 1); totalArea += (Number(e.w) || 0) * (Number(e.h) || 0) * qty; });
  sheets.forEach(function (s) { sheetArea += s.width_cm * s.height_cm; });
  iaeNestResult = {
    mode: o.mode, preset: preset, margin: margin, gap: gap, meta: meta,
    sheets: sheets, sheet_count: sheets.length, efficiency: sheetArea > 0 ? totalArea / sheetArea : 0
  };
  iaeRenderNest();
}

function iaeRenderNest() {
  var host = document.getElementById('iaeNestBody');
  if (!host) return;
  var o = iaeNestOpts;
  var presets = o.mode === 'flatbed' ? IAE_FLAT_PRESETS : IAE_ROLL_PRESETS;
  if (o.presetIdx >= presets.length) o.presetIdx = 0;
  var presetOpts = presets.map(function (p, i) { return '<option value="' + i + '"' + (i === o.presetIdx ? ' selected' : '') + '>' + iaeEscape(p.label) + '</option>'; }).join('');
  var inputCls = 'border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500';

  var html = '<div class="text-base font-bold text-gray-900 mb-3"><i class="fas fa-layer-group mr-1 text-gray-400"></i>시트 네스팅 <span class="text-xs font-normal text-gray-400">(동일 품목·한 거래처 — 품목/주문 연결은 다음 단계)</span></div>';
  html += '<div class="flex flex-wrap items-end gap-3 mb-4 pb-4 border-b border-gray-100">';
  html += '<div><label class="block text-xs text-gray-500 mb-1">모드</label><select id="iaeNestMode" class="' + inputCls + '"><option value="roll"' + (o.mode === 'roll' ? ' selected' : '') + '>롤(폭고정·길이가변)</option><option value="flatbed"' + (o.mode === 'flatbed' ? ' selected' : '') + '>평판(고정 W×H)</option></select></div>';
  html += '<div><label class="block text-xs text-gray-500 mb-1">규격</label><select id="iaeNestPreset" class="' + inputCls + '">' + presetOpts + '</select></div>';
  html += '<div><label class="block text-xs text-gray-500 mb-1">조각 간격(cm)</label><input id="iaeNestGap" type="number" min="0" step="0.1" value="' + o.gap + '" class="w-24 ' + inputCls + '"></div>';
  html += '<div><label class="block text-xs text-gray-500 mb-1">돔보/여백(cm)</label><input id="iaeNestMargin" type="number" min="0" step="0.1" value="' + o.margin + '" class="w-24 ' + inputCls + '"></div>';
  html += '<div><label class="block text-xs text-gray-500 mb-1">공통 품목코드</label><input id="iaeNestItem" type="text" value="' + iaeEscape(o.item_code) + '" placeholder="(선택)" class="w-32 ' + inputCls + '"></div>';
  html += '<button id="iaeNestRun" class="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"><i class="fas fa-wand-magic-sparkles mr-1"></i>자동 배치</button>';
  html += '<button id="iaeNestSave" class="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"><i class="fas fa-floppy-disk mr-1"></i>저장</button>';
  html += '</div>';

  html += '<div class="flex gap-5 items-start">';
  html += '<div class="w-64 flex-shrink-0"><div class="text-xs font-semibold text-gray-500 mb-2">수집 항목 (' + iaeNestSet.length + ')</div>';
  if (iaeNestSet.length === 0) {
    html += '<div class="text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg p-4 text-center">파일 처리 탭에서 그룹을 선택해<br>"네스팅에 추가" 하세요</div>';
  } else {
    html += '<div class="space-y-2">';
    iaeNestSet.forEach(function (e, i) {
      html += '<div class="flex items-center gap-2 border border-gray-200 rounded-lg p-2">';
      html += e.thumbnail_base64 ? '<img src="data:image/png;base64,' + e.thumbnail_base64 + '" class="w-10 h-10 object-contain bg-gray-50 rounded">' : '<div class="w-10 h-10 bg-gray-50 rounded flex items-center justify-center text-gray-300"><i class="fas fa-image"></i></div>';
      html += '<div class="flex-1 min-w-0"><div class="text-xs font-semibold text-gray-700 truncate">' + iaeEscape(e.label) + '</div><div class="text-[11px] text-gray-400">' + (Math.round(e.w * 10) / 10) + '×' + (Math.round(e.h * 10) / 10) + 'cm ×' + (e.qty || 1) + '</div></div>';
      html += '<button class="iae-nest-rm text-gray-300 hover:text-red-500" data-i="' + i + '"><i class="fas fa-times"></i></button>';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  html += '<div class="flex-1 min-w-0" id="iaeNestResult"></div>';
  html += '</div>';

  host.innerHTML = html;

  var modeEl = document.getElementById('iaeNestMode');
  if (modeEl) modeEl.addEventListener('change', function () { o.mode = modeEl.value; o.presetIdx = 0; iaeRenderNest(); });
  var preEl = document.getElementById('iaeNestPreset');
  if (preEl) preEl.addEventListener('change', function () { o.presetIdx = parseInt(preEl.value, 10) || 0; });
  var gapEl = document.getElementById('iaeNestGap');
  if (gapEl) gapEl.addEventListener('input', function () { o.gap = parseFloat(gapEl.value) || 0; });
  var marEl = document.getElementById('iaeNestMargin');
  if (marEl) marEl.addEventListener('input', function () { o.margin = parseFloat(marEl.value) || 0; });
  var itemEl = document.getElementById('iaeNestItem');
  if (itemEl) itemEl.addEventListener('input', function () { o.item_code = itemEl.value; });
  var runEl = document.getElementById('iaeNestRun');
  if (runEl) runEl.addEventListener('click', iaeNestAutoPlace);
  var saveEl = document.getElementById('iaeNestSave');
  if (saveEl) saveEl.addEventListener('click', iaeSaveNestToServer);
  Array.prototype.forEach.call(host.querySelectorAll('.iae-nest-rm'), function (b) {
    b.addEventListener('click', function () { iaeRemoveFromNest(parseInt(b.getAttribute('data-i'), 10)); });
  });

  iaeRenderNestResult();
}

function iaeRenderNestResult() {
  var host = document.getElementById('iaeNestResult');
  if (!host) return;
  var r = iaeNestResult;
  if (!r) { host.innerHTML = '<div class="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg p-10 text-center">"자동 배치"를 누르면 시트 배치 결과가 표시됩니다</div>'; return; }
  if (r.error) { host.innerHTML = '<div class="text-sm text-red-500 border border-dashed border-red-200 rounded-lg p-6 text-center"><i class="fas fa-triangle-exclamation mr-1"></i>' + iaeEscape(r.error) + '</div>'; return; }
  var effCls = r.efficiency >= 0.7 ? 'text-green-600' : (r.efficiency >= 0.5 ? 'text-amber-600' : 'text-red-600');
  var html = '<div class="flex items-center gap-4 mb-3 text-sm">';
  html += '<span class="font-semibold text-gray-700">시트 ' + r.sheet_count + '장</span>';
  html += '<span class="text-gray-500">자재 효율 <span class="font-semibold ' + effCls + '">' + (r.efficiency * 100).toFixed(1) + '%</span></span>';
  html += '<span class="text-gray-400 text-xs">' + (r.mode === 'flatbed' ? '평판' : '롤') + ' ' + iaeEscape(r.preset.label) + ' · 여백 ' + r.margin + 'cm · 간격 ' + r.gap + 'cm</span>';
  html += '</div><div class="flex flex-wrap gap-4">';
  r.sheets.forEach(function (s, si) { html += iaeSheetSvg(s, si, r); });
  html += '</div>';
  // 출력(렌더) — 저장된 네스팅이 있을 때 (P5)
  if (iaeLastSheetId) {
    html += '<div class="mt-4 pt-4 border-t border-gray-100">';
    html += '<button id="iaeRenderBtn" class="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"><i class="fas fa-print mr-1"></i>출력 (EPS/DXF 렌더 · 저장 #' + iaeLastSheetId + ')</button>';
    html += '<span class="text-xs text-gray-400 ml-2">에이전트가 SheetLayout.jsx로 렌더 (v1: 단일 분석·단일 시트)</span>';
    html += '<div id="iaeRenderResult" class="mt-3"></div>';
    html += '</div>';
  }
  host.innerHTML = html;
  var iaeRbtn = document.getElementById('iaeRenderBtn');
  if (iaeRbtn) iaeRbtn.addEventListener('click', iaeTriggerRender);
}
function iaeSheetSvg(sheet, idx, r) {
  var maxW = 260, maxH = 360, w = sheet.width_cm, h = sheet.height_cm;
  var scale = Math.min(maxW / w, maxH / h);
  var pw = Math.max(20, Math.round(w * scale)), ph = Math.max(20, Math.round(h * scale));
  var m = r.margin;
  var svg = '<svg width="' + pw + '" height="' + ph + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet" style="background:#fff;border:1px solid #cbd5e1;">';
  if (m > 0) svg += '<rect x="' + m + '" y="' + m + '" width="' + (w - 2 * m) + '" height="' + (h - 2 * m) + '" fill="none" stroke="#f59e0b" stroke-width="' + (0.5 / scale) + '" stroke-dasharray="' + (1.5 / scale) + '"/>';
  sheet.placements.forEach(function (p) {
    svg += '<rect x="' + p.x_cm + '" y="' + p.y_cm + '" width="' + p.width_cm + '" height="' + p.height_cm + '" fill="rgba(59,130,246,0.18)" stroke="#3b82f6" stroke-width="' + (0.4 / scale) + '"/>';
    var meta = r.meta[p.id] || {};
    var fs = Math.min(p.width_cm, p.height_cm) * 0.3; if (fs < 1.5) fs = 1.5; if (fs > 6) fs = 6;
    var lbl = (p.rotated ? '↻ ' : '') + (meta.group_index != null ? ('#' + meta.group_index) : '');
    svg += '<text x="' + (p.x_cm + p.width_cm / 2) + '" y="' + (p.y_cm + p.height_cm / 2) + '" font-size="' + fs + '" fill="#1e40af" text-anchor="middle" dominant-baseline="central">' + lbl + '</text>';
  });
  svg += '</svg>';
  return '<div><div class="text-xs text-gray-500 mb-1">시트 ' + (idx + 1) + ' · ' + Math.round(w) + '×' + Math.round(h) + 'cm</div>' + svg + '</div>';
}

function iaeSaveNestToServer() {
  var r = iaeNestResult;
  if (!r || r.error) { iaeToast('먼저 자동 배치를 실행하세요', 'error'); return; }
  var o = iaeNestOpts, placements = [];
  r.sheets.forEach(function (s, si) {
    s.placements.forEach(function (p) {
      var meta = r.meta[p.id] || {};
      placements.push({ sheet: si, group_index: meta.group_index, analysis_id: meta.analysis_id, label: meta.label, x_cm: p.x_cm, y_cm: p.y_cm, width_cm: p.width_cm, height_cm: p.height_cm, rotated: p.rotated });
    });
  });
  var analysisIds = [];
  iaeNestSet.forEach(function (e) { if (analysisIds.indexOf(e.analysis_id) === -1) analysisIds.push(e.analysis_id); });
  var canvas = { mode: r.mode, preset_w_cm: r.preset.w, preset_h_cm: (r.preset.h || null), margin_cm: r.margin, gap_cm: r.gap, sheet_count: r.sheet_count };
  axios.post('/api/workbench/sheets', {
    name: '', mode: r.mode, canvas_json: canvas, placements_json: placements,
    item_code: o.item_code || null, source_analysis_ids: analysisIds, sheet_count: r.sheet_count, efficiency: r.efficiency
  }).then(function (res) {
    var id = res.data && res.data.data && res.data.data.id;
    iaeLastSheetId = id;
    iaeToast('네스팅 저장 완료 (#' + id + ')', 'success');
    iaeRenderNestResult(); // 출력 버튼 노출 위해 재렌더
  }).catch(function (err) {
    console.error('[ia-editor] nest save fail', err);
    iaeToast((err.response && err.response.data && err.response.data.error) || '저장 실패', 'error');
  });
}

// ── P5 출력: 렌더잡 트리거 + 폴링 ─────────────────────────────────
function iaeTriggerRender() {
  if (!iaeLastSheetId) { iaeToast('먼저 네스팅을 저장하세요', 'error'); return; }
  var area = document.getElementById('iaeRenderResult');
  if (area) area.innerHTML = '<div class="text-sm text-blue-600"><i class="fas fa-spinner fa-spin mr-1"></i>출력 요청 중…</div>';
  axios.post('/api/workbench/sheets/' + iaeLastSheetId + '/render').then(function () {
    iaeToast('출력 요청됨 — 에이전트 렌더 대기', 'info');
    iaePollRender();
  }).catch(function (err) {
    var msg = (err.response && err.response.data && err.response.data.error) || '출력 요청 실패';
    if (area) area.innerHTML = '<div class="text-sm text-red-500"><i class="fas fa-triangle-exclamation mr-1"></i>' + iaeEscape(msg) + '</div>';
  });
}
function iaePollRender() {
  if (iaeRenderPollTimer) { clearTimeout(iaeRenderPollTimer); iaeRenderPollTimer = null; }
  if (!iaeLastSheetId) return;
  axios.get('/api/workbench/sheets/' + iaeLastSheetId).then(function (res) {
    var d = res.data && res.data.data; if (!d) return;
    var area = document.getElementById('iaeRenderResult'); if (!area) return;
    var st = d.render_status || 'none';
    if (st === 'queued' || st === 'rendering') {
      area.innerHTML = '<div class="text-sm text-blue-600"><i class="fas fa-spinner fa-spin mr-1"></i>' + (st === 'queued' ? '렌더 대기 (에이전트 폴링)…' : 'Illustrator 렌더 중…') + '</div>';
      iaeRenderPollTimer = setTimeout(iaePollRender, 3000);
    } else if (st === 'done') {
      var r = {}; try { r = JSON.parse(d.render_result_json || '{}'); } catch (_e) {}
      var html = '<div class="text-sm text-green-600 mb-2"><i class="fas fa-circle-check mr-1"></i>렌더 완료 ' + (r.width_cm || '?') + '×' + (r.height_cm || '?') + 'cm</div>';
      if (r.jpg_base64) html += '<img src="data:image/jpeg;base64,' + r.jpg_base64 + '" class="max-w-full border border-gray-200 rounded mb-2" style="max-height:360px;">';
      html += '<div class="text-[11px] text-gray-500 space-y-0.5 break-all">';
      if (r.eps_path) html += '<div><i class="fas fa-file mr-1 text-gray-400"></i>EPS: ' + iaeEscape(r.eps_path) + '</div>';
      if (r.dxf_path) html += '<div><i class="fas fa-scissors mr-1 text-gray-400"></i>DXF: ' + iaeEscape(r.dxf_path) + '</div>';
      html += '</div>';
      area.innerHTML = html;
    } else if (st === 'error') {
      area.innerHTML = '<div class="text-sm text-red-500"><i class="fas fa-triangle-exclamation mr-1"></i>렌더 실패: ' + iaeEscape(d.render_error || '') + '</div>';
    } else {
      area.innerHTML = '';
    }
  }).catch(function () {});
}

// ── 초기화 (모든 함수 정의 이후, 파일 맨 아래) ────────────────────
(function initIaEditor() {
  iaeLoadSettings();
  iaeLoadCorr();
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
  // 뷰 토글 (파일 처리 / 네스팅)
  var vEdit = document.getElementById('iaeViewEdit'), vNest = document.getElementById('iaeViewNest');
  if (vEdit) vEdit.addEventListener('click', function () { iaeSetView('edit'); });
  if (vNest) vNest.addEventListener('click', function () { iaeSetView('nest'); });
  iaeLoadNest();
  iaeUpdateNestCount();

  var ids = iaeLoadIds();
  iaeActiveId = ids.length ? ids[0] : null;
  iaeLoadFinishing(); // 마감 데이터 로드 후 패널 렌더
  iaeRefresh();
})();
