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
var iaeSettings = {};     // key 'fid:gidx' → {target_w,target_h,aspect_lock,rotate90,trim,scale_factor,fin_top,fin_bottom,fin_left,fin_right}

// ── 뷰 상태 ───────────────────────────────────────────
var iaeView = 'edit';     // 'edit' | 'canvas' (구 'nest' 탭은 통합 폐기 — 대지 편집 시트 네스팅이 대체)
// 규격 프리셋 (cm) — 롤폭 914~1520mm, 평판 900×1800·1200×2400 (spec §12). 대지 시트 네스팅 공용
// R2-2: 기본 프리셋. 사용자 추가 프리셋(localStorage iae_custom_presets)을 iaeAllRollPresets/iaeAllFlatPresets로 병합.
var IAE_ROLL_PRESETS = [
  { label: '914mm 롤', w: 91.4 }, { label: '1050mm 롤', w: 105 }, { label: '1270mm 롤', w: 127 },
  { label: '1370mm 롤', w: 137 }, { label: '1520mm 롤', w: 152 }
];
var IAE_FLAT_PRESETS = [{ label: '평판 900×1800', w: 90, h: 180 }, { label: '평판 1200×2400', w: 120, h: 240 }];
// R2-2: 사용자 커스텀 프리셋 (localStorage) — {roll:[{label,w}], flat:[{label,w,h}]}. 기본 프리셋 뒤에 append.
var IAE_CUSTOM_PRESETS_KEY = 'iae_custom_presets';
function iaeLoadCustomPresets() {
  try {
    var raw = localStorage.getItem(IAE_CUSTOM_PRESETS_KEY);
    var o = raw ? JSON.parse(raw) : {};
    return { roll: Array.isArray(o.roll) ? o.roll : [], flat: Array.isArray(o.flat) ? o.flat : [] };
  } catch (_e) { return { roll: [], flat: [] }; }
}
function iaeSaveCustomPresets(o) { try { localStorage.setItem(IAE_CUSTOM_PRESETS_KEY, JSON.stringify(o)); } catch (_e) {} }
// 기본 + 커스텀 병합(커스텀에 _custom:true 마커 → 삭제 UI 식별). mode='roll'|'flatbed'.
function iaeAllRollPresets() {
  var c = iaeLoadCustomPresets().roll.filter(function (p) { return p && Number(p.w) > 0; })
    .map(function (p) { return { label: p.label || (p.w + 'cm 롤'), w: Number(p.w), _custom: true }; });
  return IAE_ROLL_PRESETS.concat(c);
}
function iaeAllFlatPresets() {
  var c = iaeLoadCustomPresets().flat.filter(function (p) { return p && Number(p.w) > 0 && Number(p.h) > 0; })
    .map(function (p) { return { label: p.label || (p.w + '×' + p.h), w: Number(p.w), h: Number(p.h), _custom: true }; });
  return IAE_FLAT_PRESETS.concat(c);
}
function iaePresetsFor(mode) { return mode === 'flatbed' ? iaeAllFlatPresets() : iaeAllRollPresets(); }
// 커스텀 프리셋 추가. mode='roll'|'flatbed'. 중복 라벨 회피. 반환=추가된 프리셋 배열 길이 기준 인덱스(전체 프리셋 기준).
function iaeAddCustomPreset(mode, w, h) {
  w = Number(w) || 0; h = Number(h) || 0;
  if (w <= 0 || (mode === 'flatbed' && h <= 0)) return -1;
  var store = iaeLoadCustomPresets();
  if (mode === 'flatbed') {
    var label = w + '×' + h + ' 평판';
    if (store.flat.some(function (p) { return Number(p.w) === w && Number(p.h) === h; })) {
      return IAE_FLAT_PRESETS.length + store.flat.findIndex(function (p) { return Number(p.w) === w && Number(p.h) === h; });
    }
    store.flat.push({ label: label, w: w, h: h });
    iaeSaveCustomPresets(store);
    return IAE_FLAT_PRESETS.length + store.flat.length - 1;
  }
  var rl = Math.round(w * 10) + 'mm 롤';
  if (store.roll.some(function (p) { return Number(p.w) === w; })) {
    return IAE_ROLL_PRESETS.length + store.roll.findIndex(function (p) { return Number(p.w) === w; });
  }
  store.roll.push({ label: rl, w: w });
  iaeSaveCustomPresets(store);
  return IAE_ROLL_PRESETS.length + store.roll.length - 1;
}

function iaeEscape(s) {
  if (window.escapeHtml) return window.escapeHtml(s == null ? '' : String(s));
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}
function iaeToast(msg, type) { if (window.showToast) window.showToast(msg, type || 'info'); }
// ⑥ mm→cm 0.1cm 정밀도(인스펙터 step=0.1 정합). 기존 Math.round(/10)은 1cm 반올림 → 0.x cm 유실.
function iaeMmToCm1(mm) { return Math.round((Number(mm) || 0)) / 10; }
// ⑥ 비율 왜곡률: 목표(tw×th) vs 검출(dw×dh) 종횡비 차이(회전 종횡비 중 최소). 0~. >0.05면 잘림/늘어남 경고.
//    반환 0(왜곡 없음/입력 부족) ~ 양수. 프리플라이트 diff>0.05와 동일 식.
function iaeDistortRatio(tw, th, dw, dh) {
  tw = Number(tw) || 0; th = Number(th) || 0; dw = Number(dw) || 0; dh = Number(dh) || 0;
  if (tw <= 0 || th <= 0 || dw <= 0 || dh <= 0) return 0;
  var ta = tw / th, da = dw / dh, rota = dh / dw;
  return Math.min(Math.abs(ta - da), Math.abs(ta - rota)) / da;
}

// ── Export-first (가공 EPS 추출) — spec 2026-06-25 §3.3·§4.1·§5.5 ─────────────
// R2-3: 다운로드 파일명 = {yyyymmdd}_{사이즈cm}_{그룹명}.{kind} (거래처 미연결 → 사이즈+그룹+날짜).
//   KST 날짜(toKstDate/kstToday), iaeZipSafeName sanitize. when=생성시각(없으면 오늘).
function iaeKstYmd(when) {
  try {
    var d = (when && window.toKstDate) ? window.toKstDate(when) : null;
    if (d && !isNaN(d.getTime())) {
      // KST 기준 YYYYMMDD (ko-KR ISO 회피 — Asia/Seoul 로케일 파츠)
      var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      return p.replace(/-/g, '');
    }
  } catch (_e) {}
  return (window.kstToday ? window.kstToday() : new Date().toISOString().slice(0, 10)).replace(/-/g, '');
}
// 사이즈 토큰: w/h(cm) 있으면 'WxHcm', 없으면 ''
function iaeSizeTok(wCm, hCm) {
  return (wCm != null && hCm != null && Number(wCm) > 0 && Number(hCm) > 0)
    ? (Math.round(Number(wCm)) + 'x' + Math.round(Number(hCm)) + 'cm') : '';
}
// 다운로드 베이스명(확장자 제외) = {yyyymmdd}_{사이즈}_{그룹명}. 빈 토큰은 생략.
function iaeDownloadBase(opts) {
  opts = opts || {};
  var ymd = iaeKstYmd(opts.when);
  var size = iaeSizeTok(opts.w_cm, opts.h_cm);
  var name = iaeZipSafeName(opts.name || '출력');
  return [ymd, size, name].filter(Boolean).join('_');
}
// 인증=헤더 전용([[feedback-auth-header-only-download]]): <a href>/새창 금지. axios blob 경유.
function iaeDownloadBlob(url, filename) {
  axios.get(url, { responseType: 'blob' }).then(function (res) {
    var blob = new Blob([res.data]);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename || 'download';
    document.body.appendChild(a); a.click();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (_e) {} a.remove(); }, 1000);
  }).catch(function () { iaeToast('다운로드 실패', 'error'); });
}
// 렌더 잡 폴링: getStatus(폴마다 호출, {done,error,msg,result} 반환). cleanup 위해 토큰 1개만 유지.
var iaeRenderPollTimer = null;
function iaeStopRenderPoll() { if (iaeRenderPollTimer) { clearTimeout(iaeRenderPollTimer); iaeRenderPollTimer = null; } if (typeof iaeProcStopElapsed === 'function') iaeProcStopElapsed(); } // ② 경과시간 타이머 동반 정리
function iaePollRender(getStatus, onDone, onError, opts) {
  iaeStopRenderPoll();
  opts = opts || {};
  var interval = opts.interval || 1800;
  var deadline = Date.now() + (opts.timeout || 120000);
  var tick = function () {
    iaeRenderPollTimer = null;
    if (Date.now() > deadline) { onError('렌더 시간이 초과되었습니다 (약 2분)'); return; }
    getStatus().then(function (st) {
      if (!st) { iaeRenderPollTimer = setTimeout(tick, interval); return; }
      if (st.done) { onDone(st.result || {}); return; }
      if (st.error) { onError(st.msg || '렌더 실패'); return; }
      iaeRenderPollTimer = setTimeout(tick, interval);
    }).catch(function () { iaeRenderPollTimer = setTimeout(tick, interval); });
  };
  tick();
}
// done 결과 패널 HTML: JPG 미리보기 + [EPS][JPG][DXF] 다운로드 버튼. base는 다운로드 URL prefix.
// W2: jpg_base64(인라인) 또는 jpg_r2(R2 blob) 썸네일 로드. base64는 미리보기 잡만 보유, 일반 잡은 R2 blob 폴백.
function iaeWireBlobThumbs(host) {
  if (!host) return;
  Array.prototype.forEach.call(host.querySelectorAll('img[data-jpg-blob]'), function (img) {
    var url = img.getAttribute('data-jpg-blob'); if (!url) return;
    img.removeAttribute('data-jpg-blob');
    axios.get(url, { responseType: 'blob' }).then(function (res) {
      var u = URL.createObjectURL(res.data);
      img.onload = function () { setTimeout(function () { try { URL.revokeObjectURL(u); } catch (_e) {} }, 200); };
      img.src = u;
    }).catch(function () { /* 플레이스홀더 유지 */ });
  });
}
function iaeRenderResultHTML(result, base, namePrefix) {
  var jpg = result && result.jpg_base64;
  var hasJpgR2 = result && (result.jpg_r2 || result.jpg_path);
  var dims = (result && result.width_cm != null && result.height_cm != null)
    ? (Math.round(result.width_cm) + '×' + Math.round(result.height_cm) + 'cm') : '';
  var html = '<div class="border border-green-200 bg-green-50 rounded-lg p-2">';
  html += '<div class="text-xs font-semibold text-green-700 mb-2"><i class="fas fa-circle-check mr-1"></i>출력 완료'
    + (dims ? ' · <span class="font-normal text-green-600">' + iaeEscape(dims) + '</span>' : '') + '</div>';
  html += jpg
    ? '<img src="data:image/jpeg;base64,' + jpg + '" class="w-full max-h-48 object-contain bg-white border border-gray-200 rounded mb-2">'
    : (hasJpgR2
      ? '<img data-jpg-blob="' + iaeEscape(base) + '?kind=jpg" class="w-full max-h-48 object-contain bg-white border border-gray-200 rounded mb-2">'
      : '<div class="text-[11px] text-gray-400 mb-2">미리보기 없음</div>');
  // W7: DXF(재단기용)는 돔보(trim) 켤 때만 생성 → 결과에 dxf 있을 때만 버튼 노출. 시트 네스팅은 항상 dxf 보유.
  var hasDxf = !!(result && (result.dxf_r2 || result.dxf_path));
  html += '<div class="flex items-center gap-2">'
    + '<button class="iae-dl-btn px-2 py-1 rounded-md bg-gray-800 text-white text-xs hover:bg-black" data-kind="eps">EPS</button>'
    + '<button class="iae-dl-btn px-2 py-1 rounded-md border border-gray-300 text-gray-700 text-xs hover:bg-gray-50" data-kind="jpg">JPG</button>'
    + (hasDxf ? '<button class="iae-dl-btn px-2 py-1 rounded-md border border-gray-300 text-gray-700 text-xs hover:bg-gray-50" data-kind="dxf">DXF</button>' : '')
    + '</div></div>';
  return html;
}
// 결과 패널의 [EPS][JPG][DXF] 버튼 위임 바인딩. base=다운로드 URL(예 '/api/workbench/sheets/12/download'), name=파일명 prefix.
// R2-3: result(width_cm/height_cm) 있으면 파일명 {yyyymmdd}_{사이즈}_{prefix}.{kind}.
function iaeWireResultButtons(host, base, namePrefix, result) {
  if (!host) return;
  iaeWireBlobThumbs(host); // W2: jpg_r2 blob 썸네일 로드(base64 미보유 시)
  var dlBase = iaeDownloadBase({ w_cm: result && result.width_cm, h_cm: result && result.height_cm, name: namePrefix || '출력' });
  Array.prototype.forEach.call(host.querySelectorAll('.iae-dl-btn'), function (b) {
    b.addEventListener('click', function () {
      var kind = b.getAttribute('data-kind');
      iaeDownloadBlob(base + '?kind=' + kind, dlBase + '.' + kind);
    });
  });
}

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
      target_w: dw, target_h: dh, aspect_lock: true, rotate90: false,
      trim: false, scale_factor: 1, real_size: true,
      fin_top: '', fin_bottom: '', fin_left: '', fin_right: '',
      // R3a-2: 고급 후가공(접이식, 기본 빈값). 미입력 시 body 미전송 → 기존 동작 무영향.
      adv: { offset_method: '', offset_top: '', offset_bottom: '', offset_left: '', offset_right: '', punching: '', annotation: '' }
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
  // ① 일괄 가공 — 모든 그룹을 각 settings로 큐잉 → 진행(N/M) → ZIP
  var listHtml = '<div class="flex items-center justify-between mb-2 gap-1">'
    + '<span class="text-xs font-semibold text-gray-500 flex-shrink-0">그룹 (' + f.groups.length + ')</span>'
    + '<div class="flex items-center gap-1">'
    + '<button id="iaeApplyAllBtn" class="text-[11px] px-2 py-0.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50" title="현재 그룹의 마감·돔보·회전·파일배율을 모든 그룹에 적용(목표크기는 그룹별 유지)"><i class="fas fa-clone mr-1"></i>설정 전체적용</button>'
    + '<button id="iaeBatchBtn" class="text-[11px] px-2 py-0.5 rounded-md bg-gray-800 text-white hover:bg-black" title="모든 그룹을 각 설정으로 가공 → 완료 후 ZIP 자동 다운로드"><i class="fas fa-layer-group mr-1"></i>전체 가공</button>'
    + '</div>'
    + '</div>'
    + '<div id="iaeBatchResult" class="mb-2"></div>'
    + '<div class="space-y-2">';
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
  var batchBtn = document.getElementById('iaeBatchBtn'); // ① 전체 가공
  if (batchBtn) batchBtn.addEventListener('click', function () { iaeBatchProcess(f); });
  var applyAllBtn = document.getElementById('iaeApplyAllBtn'); // W4: 설정 전체적용
  if (applyAllBtn) applyAllBtn.addEventListener('click', function () { iaeApplyActiveToAll(f); });
  iaeRenderInspector(f);
}
// W4: 현재 활성 그룹의 공통 설정(마감 4면·돔보·회전·파일배율·고급후가공)을 모든 그룹에 복사.
//     목표크기(target_w/h)는 그룹별 검출크기 기준이라 유지 → 그룹마다 따로 설정하는 수고 제거.
function iaeApplyActiveToAll(f) {
  if (!f || !f.groups || !f.groups.length) return;
  var gis = f.groups.map(function (g, i) { return (g.index != null) ? g.index : i; });
  var actGroup = f.groups.filter(function (g, i) { return gis[i] === iaeActiveGroup; })[0];
  if (!actGroup) { iaeToast('기준 그룹을 먼저 선택하세요', 'error'); return; }
  var src = iaeGetSettings(f.id, actGroup, iaeActiveGroup);
  var keys = ['fin_top', 'fin_bottom', 'fin_left', 'fin_right', 'trim', 'rotate90', 'scale_factor', 'real_size', 'adv'];
  var n = 0;
  f.groups.forEach(function (g, i) {
    var gi = gis[i];
    if (gi === iaeActiveGroup) return;
    var d = iaeGetSettings(f.id, g, gi);
    keys.forEach(function (k) {
      if (src[k] === undefined) return;
      d[k] = (k === 'adv' && src.adv) ? JSON.parse(JSON.stringify(src.adv)) : src[k];
    });
    n++;
  });
  iaeSaveSettings();
  iaeRenderInspector(f);
  iaeToast('현재 설정을 ' + n + '개 그룹에 적용 (목표크기는 그룹별 유지)', 'success');
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
// W3: 파일배율 안내 — 소스가 용량 때문에 1/N 축소본으로 들어온 경우. 마감·돔보는 ÷N로 실물 비율 보정,
//     EPS는 소스(원본) 크기 그대로 저장(출력 RIP에서 ×N 확대). 실물 추정크기를 라이브로 병기.
function iaeScaleHint(w, h, n) {
  n = Math.max(1, parseInt(n, 10) || 1);
  if (n <= 1) return '원본 크기 (1/1 · 보정 없음)';
  return '1/' + n + ' 축소본 · 실물 ≈ ' + Math.round((w || 0) * n) + '×' + Math.round((h || 0) * n) + 'cm (마감·돔보 자동 보정 · EPS는 원본 크기 저장)';
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
    + '</div>'
    + '</div>'
    // 마감 프리셋
    + '<div><label class="block text-xs text-gray-500 mb-1">마감 프리셋</label><select id="iaePreset" class="' + selCls + '">' + presetOpts + '</select></div>'
    // 마감 상/하/좌/우
    + '<div class="grid grid-cols-2 gap-2">'
    + '<div><label class="block text-xs text-gray-500 mb-1">상</label><select id="iaeFinTop" class="' + selCls + '">' + iaeMethodOptions(s.fin_top) + '</select></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">하</label><select id="iaeFinBottom" class="' + selCls + '">' + iaeMethodOptions(s.fin_bottom) + '</select></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">좌</label><select id="iaeFinLeft" class="' + selCls + '">' + iaeMethodOptions(s.fin_left) + '</select></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">우</label><select id="iaeFinRight" class="' + selCls + '">' + iaeMethodOptions(s.fin_right) + '</select></div>'
    + '</div>'
    // 회전 / 돔보 / 파일배율 (복제수 제거 — 단일 가공은 1매 출력. 다매 면付은 대지편집 네스팅)
    + '<div class="flex items-center gap-4 flex-wrap">'
    + '<label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input id="iaeRot" type="checkbox"' + (s.rotate90 ? ' checked' : '') + '> 90° 회전</label>'
    + '<label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input id="iaeTrim" type="checkbox"' + (s.trim ? ' checked' : '') + '> 돔보</label>'
    + '<div class="flex items-center gap-2 flex-wrap"><label class="text-xs text-gray-500">파일배율 1/</label><input id="iaeScale" type="number" min="1" step="1" value="' + (s.scale_factor || 1) + '" class="w-16 ' + inputCls + '"><span id="iaeScaleReal" class="text-[11px] text-gray-400">' + iaeScaleHint(effW, effH, s.scale_factor || 1) + '</span></div>'
    + '<label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer" title="켜짐=축소본을 실물(×배율) 크기로 확대해 EPS 저장(RIP 100% 출력). 꺼짐=축소본 그대로 저장(RIP에서 ×배율 확대). 파일배율 1일 땐 효과 없음."><input id="iaeReal" type="checkbox"' + (s.real_size !== false ? ' checked' : '') + '> 실물 크기 저장</label>'
    + '</div>'
    // R3a-2: 고급 후가공 (접이식, 기본 접힘) — 도련 offset(method+4면)·펀칭·주석. 미입력 시 가공 body 미전송.
    + iaeAdvancedSectionHTML(iaeAdv(s), inputCls, selCls)
    + '<div class="text-[11px] text-gray-400"><i class="fas fa-circle-info mr-1"></i>단일 가공은 1매 출력입니다. 여러 매 면付(자동 배치)은 <span class="text-blue-500">대지 편집</span>의 시트 네스팅을 사용하세요.</div>'
    + '</div></div>'
    // 미리보기 + 프리플라이트
    + '<div>'
    + '<div class="text-sm font-semibold text-gray-700 mb-3">미리보기 <span class="text-xs font-normal text-gray-400">(웹 근사 · IA 실제 렌더는 연동 후)</span></div>'
    + '<div id="iaePreview" class="bg-gray-50 border border-gray-200 rounded-lg p-3 min-h-[200px] flex items-center justify-center"></div>'
    + '<div id="iaePreflight" class="mt-3"></div>'
    // (§5.5) 주문 없이 이 그룹을 가공 EPS/JPG/DXF로 출력·다운로드 + ③ 실제 렌더 미리보기
    + '<div class="border-t border-gray-100 pt-3 mt-3">'
    + '<div class="flex items-center gap-2">'
    + '<button id="iaePreviewBtn" class="px-3 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm whitespace-nowrap"><i class="fas fa-eye mr-1"></i>미리보기</button>'
    + '<button id="iaeProcBtn" class="flex-1 px-3 py-2 rounded-md bg-gray-800 text-white hover:bg-black text-sm"><i class="fas fa-file-export mr-1"></i>가공해서 받기</button>'
    + '</div>'
    + '<div class="text-[11px] text-gray-400 mt-1">미리보기 = 실제 IA 렌더 JPG 1장(마감·돔보·회전 확인, 다운로드/이력 없음). 가공 = EPS·JPG·DXF 출력.</div>'
    + '<div id="iaeProcResult" class="mt-2"></div>'
    + '</div>'
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
    s.trim = document.getElementById('iaeTrim').checked;
    s.scale_factor = Math.max(1, parseInt(document.getElementById('iaeScale').value, 10) || 1);
    var realEl = document.getElementById('iaeReal');
    if (realEl) s.real_size = realEl.checked;
    var srEl = document.getElementById('iaeScaleReal');
    if (srEl) srEl.textContent = iaeScaleHint(effW, effH, s.scale_factor);
    s.fin_top = document.getElementById('iaeFinTop').value;
    s.fin_bottom = document.getElementById('iaeFinBottom').value;
    s.fin_left = document.getElementById('iaeFinLeft').value;
    s.fin_right = document.getElementById('iaeFinRight').value;
    iaeSyncAdvanced(s); // R3a-2: 고급 후가공(접이식) 입력 → s.adv
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
  ['iaeAspect', 'iaeRot', 'iaeTrim', 'iaeReal', 'iaeScale', 'iaeFinTop', 'iaeFinBottom', 'iaeFinLeft', 'iaeFinRight'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', sync);
  });
  // R3a-2: 고급 후가공 입력(도련 4면 mm·method·펀칭·주석) change/input → sync
  ['iaeAdvOffMethod', 'iaeAdvOffTop', 'iaeAdvOffBottom', 'iaeAdvOffLeft', 'iaeAdvOffRight', 'iaeAdvPunching', 'iaeAdvAnnotation'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) { el.addEventListener('change', sync); el.addEventListener('input', sync); }
  });
  // ⑥ 비율잠금 해제 토스트 — 자유 변형 시 왜곡 위험 환기
  var aspEl = document.getElementById('iaeAspect');
  if (aspEl) aspEl.addEventListener('change', function () { if (!aspEl.checked) iaeToast('비율잠금 해제 — 원본 비율과 달라지면 잘림/늘어남이 발생할 수 있습니다', 'warning'); });
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

  // (§5.5) 가공해서 받기 — 현재 그룹 settings로 단일 가공 잡 제출·폴링·다운로드
  var procBtn = document.getElementById('iaeProcBtn');
  if (procBtn) procBtn.addEventListener('click', function () { iaeProcessGroup(f.id, group, iaeActiveGroup, s); });
  // ③ 미리보기 — preview_only 잡(실제 렌더 JPG 1장, 이력/다운로드 없음)
  var pvBtn = document.getElementById('iaePreviewBtn');
  if (pvBtn) pvBtn.addEventListener('click', function () { iaePreviewGroup(f.id, group, iaeActiveGroup, s); });

  updatePv();
}

// ── R3a-2: 고급 후가공 (도련 offset·펀칭·주석) ────────────────────
// 접이식 섹션(기본 접힘). settings.adv에 보관. body엔 입력 있을 때만 offset/punching/annotation 추가(미입력=무영향).
// 레거시 settings(adv 없음)도 안전하게 기본값 보강.
function iaeAdv(s) {
  if (!s.adv || typeof s.adv !== 'object') {
    s.adv = { offset_method: '', offset_top: '', offset_bottom: '', offset_left: '', offset_right: '', punching: '', annotation: '' };
  }
  return s.adv;
}
function iaeAdvancedSectionHTML(adv, inputCls, selCls) {
  var hasVals = !!(adv.offset_method || adv.offset_top || adv.offset_bottom || adv.offset_left || adv.offset_right || adv.punching || adv.annotation);
  var offCls = 'w-16 ' + inputCls;
  return ''
    + '<details class="border border-gray-200 rounded-lg" ' + (hasVals ? 'open' : '') + '>'
    + '<summary class="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"><i class="fas fa-sliders mr-1.5 text-gray-400"></i>고급 후가공 <span class="font-normal text-gray-400">(도련·펀칭·주석 · 선택)</span></summary>'
    + '<div class="px-3 pb-3 pt-1 space-y-3 border-t border-gray-100">'
    // 도련(offset)
    + '<div><label class="block text-xs text-gray-500 mb-1">도련 방식</label>'
    + '<select id="iaeAdvOffMethod" class="' + selCls + ' text-xs">'
    + '<option value="">없음</option>'
    + '<option value="scale"' + (adv.offset_method === 'scale' ? ' selected' : '') + '>scale (확대 도련)</option>'
    + '<option value="edge_strip"' + (adv.offset_method === 'edge_strip' ? ' selected' : '') + '>edge_strip (가장자리 복제)</option>'
    + '</select></div>'
    + '<div class="grid grid-cols-4 gap-2">'
    + '<div><label class="block text-[11px] text-gray-400 mb-0.5">상(mm)</label><input id="iaeAdvOffTop" type="number" min="0" step="1" value="' + iaeEscape(adv.offset_top) + '" class="' + offCls + '"></div>'
    + '<div><label class="block text-[11px] text-gray-400 mb-0.5">하(mm)</label><input id="iaeAdvOffBottom" type="number" min="0" step="1" value="' + iaeEscape(adv.offset_bottom) + '" class="' + offCls + '"></div>'
    + '<div><label class="block text-[11px] text-gray-400 mb-0.5">좌(mm)</label><input id="iaeAdvOffLeft" type="number" min="0" step="1" value="' + iaeEscape(adv.offset_left) + '" class="' + offCls + '"></div>'
    + '<div><label class="block text-[11px] text-gray-400 mb-0.5">우(mm)</label><input id="iaeAdvOffRight" type="number" min="0" step="1" value="' + iaeEscape(adv.offset_right) + '" class="' + offCls + '"></div>'
    + '</div>'
    // 펀칭 / 주석
    + '<div class="grid grid-cols-2 gap-2">'
    + '<div><label class="block text-xs text-gray-500 mb-1">펀칭</label><input id="iaeAdvPunching" type="text" value="' + iaeEscape(adv.punching) + '" placeholder="예: 상단 2개·중앙" class="w-full ' + inputCls + ' text-xs"></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">주석</label><input id="iaeAdvAnnotation" type="text" value="' + iaeEscape(adv.annotation) + '" placeholder="가공 메모(시안에 미인쇄)" class="w-full ' + inputCls + ' text-xs"></div>'
    + '</div>'
    + '<div class="text-[11px] text-gray-400"><i class="fas fa-circle-info mr-1"></i>입력한 항목만 가공 요청에 반영됩니다. 비우면 기존 동작과 동일.</div>'
    + '</div></details>';
}
// 고급 입력 → s.adv (null 가드). 빈값은 빈 문자열로.
function iaeSyncAdvanced(s) {
  var adv = iaeAdv(s);
  var v = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
  var m = document.getElementById('iaeAdvOffMethod');
  adv.offset_method = m ? m.value : adv.offset_method;
  adv.offset_top = v('iaeAdvOffTop'); adv.offset_bottom = v('iaeAdvOffBottom');
  adv.offset_left = v('iaeAdvOffLeft'); adv.offset_right = v('iaeAdvOffRight');
  adv.punching = v('iaeAdvPunching'); adv.annotation = v('iaeAdvAnnotation');
}
// s.adv → body 부분객체 {offset?,punching?,annotation?}. 빈값 키는 미포함(미전송=무영향).
function iaeAdvBody(s) {
  var adv = (s && s.adv) || {};
  var out = {};
  var num = function (x) { var n = Number(x); return (x !== '' && x != null && !isNaN(n)) ? n : null; };
  // 도련 offset: method 또는 4면 중 하나라도 있으면 전송
  var ot = num(adv.offset_top), ob = num(adv.offset_bottom), ol = num(adv.offset_left), or = num(adv.offset_right);
  if (adv.offset_method || ot != null || ob != null || ol != null || or != null) {
    var off = {};
    if (adv.offset_method) off.method = adv.offset_method;
    if (ot != null) off.top = ot; if (ob != null) off.bottom = ob;
    if (ol != null) off.left = ol; if (or != null) off.right = or;
    out.offset = off;
  }
  if (adv.punching) out.punching = adv.punching;
  if (adv.annotation) out.annotation = adv.annotation;
  return out;
}

// 단일 그룹 가공 EPS 출력 (파일처리 탭). settings → finishing(4면 method+margin_cm)·target·trim·rotate90.
function iaeProcessGroup(fid, group, gidx, s) {
  var tw = Number(s.target_w) || 0, th = Number(s.target_h) || 0;
  if (tw <= 0 || th <= 0) { iaeToast('목표 크기(W×H)를 입력하세요', 'error'); return; }
  // ⑥ 비율 왜곡 강한 경고: 목표가 검출 종횡비와 >5% 다르면 진행 전 확인
  var dr = iaeDistortRatio(tw, th, (group && group.width_mm) ? group.width_mm / 10 : 0, (group && group.height_mm) ? group.height_mm / 10 : 0);
  if (dr > 0.05 && window.showConfirm) {
    window.showConfirm('목표 크기가 원본 비율과 약 ' + Math.round(dr * 100) + '% 달라 잘림/늘어남이 발생할 수 있습니다.\n그대로 가공할까요?',
      { title: '비율 왜곡 경고', confirmText: '가공', danger: true }).then(function (ok) { if (ok) iaeProcessGroupProceed(fid, group, gidx, s); });
    return;
  }
  iaeProcessGroupProceed(fid, group, gidx, s);
}
function iaeProcessGroupProceed(fid, group, gidx, s) {
  var tw = Number(s.target_w) || 0, th = Number(s.target_h) || 0;
  var fin = {};
  [['top', s.fin_top], ['bottom', s.fin_bottom], ['left', s.fin_left], ['right', s.fin_right]].forEach(function (p) {
    if (p[1]) fin[p[0]] = { method: p[1], margin_cm: iaeMarginOf(p[1]) };
  });
  var body = {
    analysis_id: fid, group_index: gidx,
    target_w_cm: tw, target_h_cm: th,
    finishing: fin, trim: !!s.trim, rotate90: !!s.rotate90,
    rotation: (s.rotate90 ? 90 : 0),                       // ⑥ 워커가 rotation으로 정규화 (rotate90도 호환)
    scale_factor: Math.max(1, Number(s.scale_factor) || 1), // ⑤ 파일배율 1/N
    real_size: (s.real_size !== false)                      // 실물 크기 저장(기본 ON) — 축소본 ×N 확대 저장
  };
  Object.assign(body, iaeAdvBody(s)); // R3a-2: 고급 후가공(offset/punching/annotation) — 입력 있을 때만
  var resHost = document.getElementById('iaeProcResult');
  var btn = document.getElementById('iaeProcBtn');
  var namePrefix = '가공 ' + (group && group.name ? group.name : ('#' + gidx));
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>요청 중…'; }
  if (resHost) resHost.innerHTML = '<div class="text-xs text-blue-600"><i class="fas fa-spinner fa-spin mr-1"></i>가공 요청 중…</div>';

  iaeStopRenderPoll();
  axios.post('/api/workbench/process', body).then(function (res) {
    var d = res.data && res.data.data;
    if (!d || d.id == null) throw new Error('가공 요청 응답 오류');
    iaeProcPoll(d.id, resHost, btn, namePrefix);
  }).catch(function (err) {
    var msg = (err.response && err.response.data && err.response.data.error) || err.message || '가공 요청 실패';
    iaeToast(msg, 'error');
    if (resHost) resHost.innerHTML = '';
    iaeProcResetBtn(btn);
  });
}
function iaeProcResetBtn(btn) {
  btn = btn || document.getElementById('iaeProcBtn');
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-export mr-1"></i>가공해서 받기'; }
}
function iaePreviewResetBtn(btn) {
  btn = btn || document.getElementById('iaePreviewBtn');
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-eye mr-1"></i>미리보기'; }
}
// ③ 실제 렌더 미리보기 — preview_only 잡(EPS/DXF 스킵, JPG만). 결과 JPG를 #iaePreview 패널 + 라이트박스로.
function iaePreviewGroup(fid, group, gidx, s) {
  var tw = Number(s.target_w) || 0, th = Number(s.target_h) || 0;
  if (tw <= 0 || th <= 0) { iaeToast('목표 크기(W×H)를 입력하세요', 'error'); return; }
  var fin = {};
  [['top', s.fin_top], ['bottom', s.fin_bottom], ['left', s.fin_left], ['right', s.fin_right]].forEach(function (p) {
    if (p[1]) fin[p[0]] = { method: p[1], margin_cm: iaeMarginOf(p[1]) };
  });
  var body = {
    analysis_id: fid, group_index: gidx, preview_only: true,
    target_w_cm: tw, target_h_cm: th,
    finishing: fin, trim: !!s.trim, rotate90: !!s.rotate90,
    rotation: (s.rotate90 ? 90 : 0), scale_factor: Math.max(1, Number(s.scale_factor) || 1),
    real_size: (s.real_size !== false)                      // 실물 크기 저장(기본 ON) — 미리보기도 실렌더 반영
  };
  Object.assign(body, iaeAdvBody(s)); // R3a-2: 미리보기에도 고급 후가공 반영(실렌더 확인)
  var pv = document.getElementById('iaePreview');
  var btn = document.getElementById('iaePreviewBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>렌더 중…'; }
  if (pv) pv.innerHTML = '<div class="text-xs text-blue-600 text-center"><i class="fas fa-spinner fa-spin mr-1"></i>실제 렌더 미리보기 생성 중… (최대 2분)</div>';

  iaeStopRenderPoll();
  axios.post('/api/workbench/process', body).then(function (res) {
    var d = res.data && res.data.data;
    if (!d || d.id == null) throw new Error('미리보기 요청 응답 오류');
    iaePollRender(function () {
      return axios.get('/api/workbench/process/' + d.id).then(function (r2) {
        var dd = (r2.data && r2.data.data) || {};
        var rj = {};
        try { rj = dd.result_json ? (typeof dd.result_json === 'string' ? JSON.parse(dd.result_json) : dd.result_json) : {}; } catch (_e) { rj = {}; }
        if (dd.status === 'done') return { done: true, result: rj };
        if (dd.status === 'error') return { error: true, msg: dd.error_message || '미리보기 실패' };
        return null;
      });
    }, function (result) {
      iaePreviewResetBtn(btn);
      var jpg = result && result.jpg_base64;
      if (pv) {
        if (jpg) {
          pv.innerHTML = '<div class="w-full"><img id="iaePreviewRendered" src="data:image/jpeg;base64,' + jpg + '" class="w-full max-h-72 object-contain bg-white border border-gray-200 rounded cursor-zoom-in" title="클릭해 확대">'
            + '<div class="text-center text-[11px] text-green-600 mt-1"><i class="fas fa-circle-check mr-1"></i>실제 렌더(마감·돔보·회전 반영)</div></div>';
          var img = document.getElementById('iaePreviewRendered');
          if (img) img.addEventListener('click', function () { iaeLightbox('data:image/jpeg;base64,' + jpg); });
        } else { pv.innerHTML = '<div class="text-xs text-gray-400 text-center">미리보기 이미지를 받지 못했습니다</div>'; }
      }
      iaeToast('미리보기 완료', 'success');
    }, function (msg) {
      iaePreviewResetBtn(btn);
      if (pv) pv.innerHTML = '<div class="text-xs text-red-500 text-center"><i class="fas fa-triangle-exclamation mr-1"></i>' + iaeEscape(msg) + '</div>';
      iaeToast(msg, 'error');
    });
  }).catch(function (err) {
    var msg = (err.response && err.response.data && err.response.data.error) || err.message || '미리보기 요청 실패';
    iaeToast(msg, 'error');
    iaePreviewResetBtn(btn);
    if (pv) pv.innerHTML = '';
  });
}
// 간이 라이트박스 (미리보기 확대) — 인증 불필요 data URL
function iaeLightbox(src) {
  var prev = document.getElementById('iaeLightbox'); if (prev) prev.remove();
  var ov = document.createElement('div');
  ov.id = 'iaeLightbox';
  ov.className = 'fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6 cursor-zoom-out';
  ov.innerHTML = '<img src="' + src + '" class="max-w-full max-h-full object-contain rounded shadow-2xl">';
  ov.addEventListener('click', function () { ov.remove(); });
  document.body.appendChild(ov);
}
// ② 경과시간 표시 — 진행 메시지에 1초 간격 카운터. iaeStopRenderPoll 시 함께 정리되도록 토큰 공유.
var iaeProcElapsedTimer = null, iaeProcElapsedStart = 0;
function iaeProcStopElapsed() { if (iaeProcElapsedTimer) { clearInterval(iaeProcElapsedTimer); iaeProcElapsedTimer = null; } }
function iaeProcStartElapsed(resHost, label) {
  iaeProcStopElapsed();
  iaeProcElapsedStart = Date.now();
  var paint = function () {
    var el = resHost && resHost.querySelector('.iae-proc-elapsed');
    if (el) el.textContent = ' · ' + Math.round((Date.now() - iaeProcElapsedStart) / 1000) + '초 경과';
  };
  if (resHost) resHost.innerHTML = '<div class="text-xs text-blue-600"><i class="fas fa-spinner fa-spin mr-1"></i>' + label + ' (최대 2분)<span class="iae-proc-elapsed"></span></div>';
  paint();
  iaeProcElapsedTimer = setInterval(paint, 1000);
}
function iaeProcPoll(jobId, resHost, btn, namePrefix) {
  iaeProcStartElapsed(resHost, '가공 중…');
  iaePollRender(function () {
    return axios.get('/api/workbench/process/' + jobId).then(function (res) {
      var d = (res.data && res.data.data) || {};
      var rj = {};
      try { rj = d.result_json ? (typeof d.result_json === 'string' ? JSON.parse(d.result_json) : d.result_json) : {}; } catch (_e) { rj = {}; }
      if (d.status === 'done') return { done: true, result: rj };
      if (d.status === 'error') return { error: true, msg: d.error_message || '가공 실패' };
      return null; // queued | rendering
    });
  }, function (result) {
    iaeProcStopElapsed();
    if (resHost) {
      resHost.innerHTML = iaeRenderResultHTML(result, '/api/workbench/process/' + jobId + '/download', namePrefix);
      iaeWireResultButtons(resHost, '/api/workbench/process/' + jobId + '/download', namePrefix, result);
    }
    iaeProcResetBtn(btn);
    iaeToast('가공 EPS 출력 완료', 'success');
    iaeLoadHistory(); // ③ 완료 잡을 출력 이력 보드에 합류
  }, function (msg) {
    iaeProcStopElapsed();
    // ② 재시도 버튼 — error|timeout 시 /process/:id/retry → 재폴링
    if (resHost) {
      resHost.innerHTML = '<div class="border border-red-200 bg-red-50 rounded-md p-2">'
        + '<div class="text-xs text-red-600 mb-1.5"><i class="fas fa-triangle-exclamation mr-1"></i>' + iaeEscape(msg) + '</div>'
        + '<button class="iae-proc-retry px-2 py-1 rounded bg-gray-800 text-white text-xs hover:bg-black"><i class="fas fa-rotate-right mr-1"></i>재시도</button></div>';
      var rb = resHost.querySelector('.iae-proc-retry');
      if (rb) rb.addEventListener('click', function () { iaeProcRetry(jobId, resHost, btn, namePrefix); });
    }
    iaeToast(msg, 'error');
    iaeProcResetBtn(btn);
    iaeLoadHistory(); // 실패 잡도 이력에 (재시도 추적)
  });
}
// ② 가공 잡 재시도 — POST /process/:id/retry(error|rendering→queued) → 재폴링
function iaeProcRetry(jobId, resHost, btn, namePrefix) {
  if (resHost) resHost.innerHTML = '<div class="text-xs text-blue-600"><i class="fas fa-spinner fa-spin mr-1"></i>재시도 요청 중…</div>';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>재시도…'; }
  iaeStopRenderPoll();
  axios.post('/api/workbench/process/' + jobId + '/retry').then(function () {
    iaeProcPoll(jobId, resHost, btn, namePrefix);
  }).catch(function (err) {
    var msg = (err.response && err.response.data && err.response.data.error) || err.message || '재시도 실패';
    iaeToast(msg, 'error');
    iaeProcResetBtn(btn);
    if (resHost) resHost.innerHTML = '<div class="text-xs text-red-500">' + iaeEscape(msg) + '</div>';
  });
}

// ── ① 다중 그룹 일괄 가공 + ZIP ────────────────────────────────────
// 모든 그룹을 각 settings(iaeGetSettings)로 POST /process 다중 큐잉 → 잡 id 폴링(진행 N/M) → 완료 후 ZIP.
// 각 그룹 settings에 목표크기 없으면 검출 크기로 기본 설정(가공 전제). fflate zipSync(cardExpenses.js 패턴).
var iaeBatchState = null; // {jobs:[{gi,name,id,status,result}], host}
function iaeProcessBody(fid, gidx, s) {
  var fin = {};
  [['top', s.fin_top], ['bottom', s.fin_bottom], ['left', s.fin_left], ['right', s.fin_right]].forEach(function (p) {
    if (p[1]) fin[p[0]] = { method: p[1], margin_cm: iaeMarginOf(p[1]) };
  });
  var body = {
    analysis_id: fid, group_index: gidx,
    target_w_cm: Number(s.target_w) || 0, target_h_cm: Number(s.target_h) || 0,
    finishing: fin, trim: !!s.trim, rotate90: !!s.rotate90,
    rotation: (s.rotate90 ? 90 : 0), scale_factor: Math.max(1, Number(s.scale_factor) || 1),
    real_size: (s.real_size !== false)                      // 실물 크기 저장(기본 ON) — 일괄 가공도 반영
  };
  Object.assign(body, iaeAdvBody(s)); // R3a-2: 일괄 가공에도 고급 후가공 반영
  return body;
}
function iaeBatchProcess(f) {
  if (!f || !f.groups || !f.groups.length) { iaeToast('가공할 그룹이 없습니다', 'error'); return; }
  var host = document.getElementById('iaeBatchResult');
  var gis = f.groups.map(function (g, i) { return (g.index != null) ? g.index : i; });
  var jobs = [];
  // 각 그룹 settings 확보(목표크기 없으면 검출 크기로 기본). 크기 0이면 스킵(가공 불가).
  var skipped = 0;
  f.groups.forEach(function (g, i) {
    var gi = gis[i];
    var s = iaeGetSettings(f.id, g, gi);
    if (!(Number(s.target_w) > 0) && g.width_mm) s.target_w = Math.round(g.width_mm) / 10;
    if (!(Number(s.target_h) > 0) && g.height_mm) s.target_h = Math.round(g.height_mm) / 10;
    if (!(Number(s.target_w) > 0) || !(Number(s.target_h) > 0)) { skipped++; return; }
    jobs.push({ gi: gi, name: (g.name || ('#' + gi)), s: s, id: null, status: 'queued', result: null });
  });
  if (!jobs.length) { iaeToast('가공 가능한 그룹이 없습니다 (크기 미상)', 'error'); return; }
  iaeSaveSettings();
  iaeBatchState = { jobs: jobs, fid: f.id };
  var btn = document.getElementById('iaeBatchBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>가공 중'; }
  iaeBatchRender('submit');
  // 순차 제출(D1 부담·레이트리밋 회피) → 폴링은 병렬
  var chain = Promise.resolve();
  jobs.forEach(function (job) {
    chain = chain.then(function () {
      return axios.post('/api/workbench/process', iaeProcessBody(f.id, job.gi, job.s)).then(function (res) {
        var d = res.data && res.data.data;
        if (d && d.id != null) { job.id = d.id; job.status = 'rendering'; }
        else { job.status = 'error'; job.error = '요청 실패'; }
      }).catch(function (err) {
        job.status = 'error'; job.error = (err.response && err.response.data && err.response.data.error) || '요청 실패';
      });
    });
  });
  chain.then(function () { iaeBatchRender('poll'); iaeBatchPoll(); });
}
function iaeBatchPoll() {
  var st = iaeBatchState; if (!st) return;
  var pending = st.jobs.filter(function (j) { return j.id != null && (j.status === 'queued' || j.status === 'rendering'); });
  if (!pending.length) { iaeBatchFinish(); return; }
  Promise.all(pending.map(function (job) {
    return axios.get('/api/workbench/process/' + job.id).then(function (res) {
      var d = (res.data && res.data.data) || {};
      if (d.status === 'done') { job.status = 'done'; try { job.result = d.result_json ? (typeof d.result_json === 'string' ? JSON.parse(d.result_json) : d.result_json) : {}; } catch (_e) { job.result = {}; } }
      else if (d.status === 'error') { job.status = 'error'; job.error = d.error_message || '가공 실패'; }
    }).catch(function () { /* 일시 실패는 다음 폴에서 재시도 */ });
  })).then(function () {
    iaeBatchRender('poll');
    var stillPending = st.jobs.some(function (j) { return j.id != null && (j.status === 'queued' || j.status === 'rendering'); });
    if (stillPending) { st.timer = setTimeout(iaeBatchPoll, 2000); }
    else iaeBatchFinish();
  });
}
function iaeBatchFinish() {
  var st = iaeBatchState; if (!st) return;
  if (st.timer) { clearTimeout(st.timer); st.timer = null; }
  var btn = document.getElementById('iaeBatchBtn');
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-layer-group mr-1"></i>전체 가공'; }
  iaeBatchRender('done');
  var done = st.jobs.filter(function (j) { return j.status === 'done'; }).length;
  iaeToast('일괄 가공 완료: ' + done + '/' + st.jobs.length, done === st.jobs.length ? 'success' : 'warning');
  iaeLoadHistory();
  // W4: 완료 후 ZIP 자동 다운로드(한번에 받기). 결과 있으면 1회 자동 실행, ZIP 버튼은 폴백으로 유지.
  if (done > 0 && !st.zipped) { st.zipped = true; iaeBatchZip(); }
}
function iaeBatchRender(phase) {
  var host = document.getElementById('iaeBatchResult'); var st = iaeBatchState;
  if (!host || !st) return;
  var done = st.jobs.filter(function (j) { return j.status === 'done'; }).length;
  var errs = st.jobs.filter(function (j) { return j.status === 'error'; }).length;
  var total = st.jobs.length;
  var html = '<div class="border border-gray-200 rounded-md p-2 bg-gray-50">';
  if (phase !== 'done') {
    html += '<div class="text-[11px] text-blue-600"><i class="fas fa-spinner fa-spin mr-1"></i>일괄 가공 ' + done + '/' + total + ' 완료'
      + (errs ? ' · <span class="text-red-500">실패 ' + errs + '</span>' : '') + '</div>';
  } else {
    html += '<div class="text-[11px] font-semibold ' + (errs ? 'text-amber-600' : 'text-green-700') + ' mb-1.5">'
      + '<i class="fas fa-circle-check mr-1"></i>일괄 가공 ' + done + '/' + total + ' 완료'
      + (errs ? ' · 실패 ' + errs : '') + '</div>';
    if (done > 0) html += '<button id="iaeBatchZip" class="w-full px-2 py-1 rounded bg-gray-800 text-white text-[11px] hover:bg-black"><i class="fas fa-file-zipper mr-1"></i>ZIP 받기 (' + done + '건)</button>';
  }
  html += '</div>';
  host.innerHTML = html;
  var zb = document.getElementById('iaeBatchZip');
  if (zb) zb.addEventListener('click', iaeBatchZip);
}
// fflate 동적 로드(cardExpenses.js 동일 CDN). iae 스코프로 중복정의 회피.
function iaeLoadFflate() {
  return new Promise(function (resolve, reject) {
    if (window.fflate) return resolve(window.fflate);
    var sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js';
    sc.onload = function () { resolve(window.fflate); };
    sc.onerror = function () { reject(new Error('zip 라이브러리 로드 실패')); };
    document.head.appendChild(sc);
  });
}
function iaeZipSafeName(s) {
  return String(s == null ? '' : s).replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || '_';
}
// 완료 잡들의 EPS/JPG/DXF blob을 받아 zipSync로 묶어 다운로드. 파일명 {그룹명}_{사이즈cm}.{kind}.
function iaeBatchZip() {
  var st = iaeBatchState; if (!st) return;
  var doneJobs = st.jobs.filter(function (j) { return j.status === 'done' && j.id != null; });
  if (!doneJobs.length) { iaeToast('받을 결과가 없습니다', 'error'); return; }
  var zb = document.getElementById('iaeBatchZip');
  if (zb) { zb.disabled = true; zb.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>ZIP 생성 중…'; }
  var kinds = ['eps', 'jpg', 'dxf'];
  iaeLoadFflate().then(function (fflate) {
    var files = {};
    var tasks = [];
    doneJobs.forEach(function (job) {
      var r = job.result || {};
      // R2-3: {yyyymmdd}_{사이즈cm}_{그룹명} (zip 내 파일명 통일)
      var base = iaeDownloadBase({ w_cm: r.width_cm, h_cm: r.height_cm, name: job.name });
      kinds.forEach(function (kind) {
        // result_json 의 {eps_r2,jpg_r2,dxf_r2} 존재 여부로 거름 (워커 다운로드 키와 동일 소스)
        if (!r[kind + '_r2']) return;
        tasks.push(axios.get('/api/workbench/process/' + job.id + '/download?kind=' + kind, { responseType: 'arraybuffer' })
          .then(function (res) { files[base + '.' + kind] = new Uint8Array(res.data); })
          .catch(function () { /* 해당 kind 없음 — 스킵 */ }));
      });
    });
    return Promise.all(tasks).then(function () {
      var names = Object.keys(files);
      if (!names.length) { iaeToast('다운로드할 파일을 받지 못했습니다', 'error'); if (zb) { zb.disabled = false; zb.innerHTML = '<i class="fas fa-file-zipper mr-1"></i>ZIP 받기'; } return; }
      var zipped = fflate.zipSync(files, { level: 6 });
      var blob = new Blob([zipped], { type: 'application/zip' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'IA가공_' + iaeKstYmd() + '.zip';
      document.body.appendChild(a); a.click();
      setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (_e) {} a.remove(); }, 1000);
      iaeToast(names.length + '개 파일 ZIP 다운로드', 'success');
      if (zb) { zb.disabled = false; zb.innerHTML = '<i class="fas fa-file-zipper mr-1"></i>ZIP 받기 (' + doneJobs.length + '건)'; }
    });
  }).catch(function (err) {
    iaeToast(err.message || 'ZIP 생성 실패', 'error');
    if (zb) { zb.disabled = false; zb.innerHTML = '<i class="fas fa-file-zipper mr-1"></i>ZIP 받기'; }
  });
}

// ── ③ 가공 이력 보드 (영속 재다운로드) — GET /api/workbench/process?limit=12 ──
// ia_process_jobs 최근 N건(서버 entity 격리·created_at desc). 새로고침/탭전환에도 보존(서버 조회).
// 카드별: 상태 뱃지·생성시각·크기·jpg 썸네일 + [EPS][JPG][DXF] 재다운로드(기존 download 엔드포인트 재사용).
var iaeHistLoading = false;
function iaeHistHost() {
  // 파일처리 뷰에 이력 host 1회 주입(페이지 템플릿 무수정 — 팀A 스코프=iaEditor.js 단독)
  var host = document.getElementById('iaeHistory');
  if (host) return host;
  var view = document.getElementById('iaeEditView');
  if (!view) return null;
  host = document.createElement('div');
  host.id = 'iaeHistory';
  host.className = 'ds-card mt-4 p-4';
  view.appendChild(host);
  return host;
}
function iaeLoadHistory() {
  var host = iaeHistHost();
  if (!host) return;
  if (iaeHistLoading) return; // 중복 로드 방지
  iaeHistLoading = true;
  axios.get('/api/workbench/process', { params: { limit: 12 } }).then(function (res) {
    var rows = (res.data && res.data.data) || [];
    iaeRenderHistory(rows);
  }).catch(function (err) {
    console.warn('[ia-editor] 이력 로드 실패', err);
    iaeRenderHistory(null);
  }).finally(function () { iaeHistLoading = false; });
}
// W2: 완료·실패 가공 이력 일괄 삭제(R2 산출물 포함, 대기·진행 잡은 유지). 누적 방지·D1 비대 해소.
function iaeClearHistory() {
  if (!window.confirm('완료·실패한 가공 이력을 모두 삭제할까요? (R2 산출물 포함, 되돌릴 수 없음)')) return;
  var cb = document.getElementById('iaeHistClear');
  if (cb) { cb.disabled = true; cb.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>삭제 중…'; }
  axios.post('/api/workbench/process/clear').then(function (res) {
    var n = (res.data && res.data.data && res.data.data.deleted) || 0;
    iaeToast(n + '건 이력 삭제 완료', 'success');
    iaeLoadHistory();
  }).catch(function (err) {
    var msg = (err.response && err.response.data && err.response.data.error) || err.message || '이력 삭제 실패';
    iaeToast(msg, 'error');
    if (cb) { cb.disabled = false; cb.innerHTML = '<i class="fas fa-trash-can mr-1"></i>이력 비우기'; }
  });
}
function iaeRenderHistory(rows) {
  var host = document.getElementById('iaeHistory');
  if (!host) { console.warn('[ia-editor] #iaeHistory not found'); return; }
  var headHtml = '<div class="flex items-center justify-between mb-3">'
    + '<span class="text-sm font-semibold text-gray-700"><i class="fas fa-clock-rotate-left mr-1.5 text-blue-500"></i>내 출력 이력 <span class="text-xs font-normal text-gray-400">(최근 12건 · 새로고침·탭전환에도 보존)</span></span>'
    + '<div class="flex items-center gap-2">'
    + '<span id="iaeAgentBadge" class="text-[11px] rounded-full px-2 py-0.5 bg-gray-100 text-gray-500"><i class="fas fa-circle-notch fa-spin mr-1"></i>에이전트 확인 중</span>' // ② 에이전트 온라인/오프라인
    + '<button id="iaeHistRefresh" class="text-xs text-gray-500 hover:text-blue-600"><i class="fas fa-rotate-right mr-1"></i>새로고침</button>'
    + '<button id="iaeHistClear" class="text-xs text-gray-400 hover:text-red-600" title="완료·실패 이력 삭제(R2 산출물 포함). 대기·진행 중 잡은 유지"><i class="fas fa-trash-can mr-1"></i>이력 비우기</button>'
    + '</div>'
    + '</div>';
  var body;
  if (rows == null) {
    body = '<div class="text-xs text-gray-400 py-2">이력을 불러오지 못했습니다</div>';
  } else if (rows.length === 0) {
    body = '<div class="text-xs text-gray-400 py-2">아직 가공 출력 이력이 없습니다</div>';
  } else {
    body = '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">'
      + rows.map(iaeHistCardHTML).join('') + '</div>';
  }
  host.innerHTML = headHtml + body;
  iaeWireBlobThumbs(host); // W2: jpg_r2 blob 썸네일 로드(base64 미보유 신규 잡)
  var rb = document.getElementById('iaeHistRefresh');
  if (rb) rb.addEventListener('click', iaeLoadHistory);
  var cb = document.getElementById('iaeHistClear'); // W2: 이력 비우기
  if (cb) cb.addEventListener('click', iaeClearHistory);
  iaeRefreshAgentStatus(); // ② 배지 즉시 1회 갱신(이후 주기 폴러가 유지)
  // [EPS][JPG][DXF] 위임 바인딩 — R2-3 파일명 {yyyymmdd}_{사이즈}_{그룹명}.{kind}
  var byId = {}; (rows || []).forEach(function (r) { byId[r.id] = r; });
  Array.prototype.forEach.call(host.querySelectorAll('.iae-hist-dl'), function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-id'), kind = b.getAttribute('data-kind');
      var r = byId[id] || {}; var meta = r.result_meta || {};
      var base = iaeDownloadBase({
        when: r.created_at, w_cm: meta.width_cm, h_cm: meta.height_cm,
        name: '그룹' + (r.group_index != null ? r.group_index : '') + (r.analysis_id != null ? ('_분석' + r.analysis_id) : '')
      });
      iaeDownloadBlob('/api/workbench/process/' + id + '/download?kind=' + kind, base + '.' + kind);
    });
  });
  // R2-1: '주문 만들기' 위임 바인딩
  Array.prototype.forEach.call(host.querySelectorAll('.iae-hist-order'), function (b) {
    b.addEventListener('click', function () { iaeHistOrder(byId[b.getAttribute('data-id')]); });
  });
}
// R2-1: 가공 이력 잡 1건 → 주문 라인 1개 프리필 후 주문 모달 오픈(거래처/품목/수량/단가만 입력).
//   이력 응답(analysis_id·group_index·result_meta.width/height_cm)으로 목표크기,
//   finishing/trim/scale_factor는 localStorage 가공설정(iaeSettings[fid:gidx])에서 보강(없으면 빈값).
function iaeHistOrder(r) {
  if (!r) { iaeToast('이력 정보를 찾을 수 없습니다', 'error'); return; }
  var fid = r.analysis_id, gi = r.group_index;
  if (fid == null || gi == null) { iaeToast('이 이력은 주문 생성에 필요한 분석 정보가 없습니다', 'error'); return; }
  var meta = r.result_meta || {};
  var wCm = (meta.width_cm != null && Number(meta.width_cm) > 0) ? Number(meta.width_cm) : 0;
  var hCm = (meta.height_cm != null && Number(meta.height_cm) > 0) ? Number(meta.height_cm) : 0;
  // 보강: 같은 그룹의 마지막 가공설정(localStorage). 키 = fid:gidx.
  var saved = (iaeSettings && iaeSettings[iaeSettingsKey(fid, gi)]) || {};
  var fin = (saved.fin_top || saved.fin_bottom || saved.fin_left || saved.fin_right)
    ? { top: saved.fin_top || '', bottom: saved.fin_bottom || '', left: saved.fin_left || '', right: saved.fin_right || '' } : null;
  // 목표크기: 이력 result_meta 우선, 없으면 저장설정 target, 없으면 0(사용자 보정 유도)
  var w = wCm || Number(saved.target_w) || 0, h = hCm || Number(saved.target_h) || 0;
  var label = '가공 #' + gi + ' · 분석 ' + fid + (r.id != null ? (' (이력 ' + r.id + ')') : '');
  var ln = {
    kind: 'obj', fid: fid, gi: gi, label: label,
    w_cm: w, h_cm: h, qty: 1,
    fin: fin, trim: !!saved.trim, scale_factor: Math.max(1, Number(saved.scale_factor) || 1),
    det_w_cm: w, det_h_cm: h,  // 검출=목표(이력엔 검출원본 미보유 → 리사이즈 pp 미생성, 왜곡경고 회피)
    item_id: null, item_name: '', pricing_method: 'FIXED', unit_price: 0
  };
  iaeOpenOrderModalWithLines([ln]);
}
// ② 에이전트 상태 배지 — GET /agent-status {online, last_seen}. 폴링(폴=heartbeat)이라 last_seen<60s면 online.
var iaeAgentStatusTimer = null;
function iaeRefreshAgentStatus() {
  axios.get('/api/workbench/agent-status').then(function (res) {
    var d = (res.data && res.data.data) || {};
    iaeRenderAgentBadge(!!d.online, d.last_seen);
  }).catch(function () { iaeRenderAgentBadge(null, null); });
}
function iaeRenderAgentBadge(online, lastSeen) {
  var el = document.getElementById('iaeAgentBadge'); if (!el) return;
  if (online == null) { el.className = 'text-[11px] rounded-full px-2 py-0.5 bg-gray-100 text-gray-400'; el.innerHTML = '<i class="fas fa-question-circle mr-1"></i>에이전트 상태 불명'; return; }
  if (online) {
    el.className = 'text-[11px] rounded-full px-2 py-0.5 bg-green-50 text-green-700';
    el.innerHTML = '<i class="fas fa-circle text-green-500 mr-1" style="font-size:7px;vertical-align:middle"></i>에이전트 온라인';
  } else {
    var ago = '';
    if (lastSeen) { var sec = Math.max(0, Math.round((Date.now() - new Date((typeof lastSeen === 'string' && lastSeen.indexOf('Z') === -1) ? lastSeen.replace(' ', 'T') + 'Z' : lastSeen).getTime()) / 1000)); ago = sec < 3600 ? (Math.round(sec / 60) + '분 전') : (Math.round(sec / 3600) + '시간 전'); }
    el.className = 'text-[11px] rounded-full px-2 py-0.5 bg-red-50 text-red-600';
    el.innerHTML = '<i class="fas fa-circle text-red-400 mr-1" style="font-size:7px;vertical-align:middle"></i>에이전트 오프라인' + (ago ? ' (' + iaeEscape(ago) + ')' : '');
  }
}
// 에이전트 배지 주기 폴러 — 편집 뷰 활성 시에만(탭 전환 시 정지). init/탭복귀에서 시작.
function iaeStartAgentPoll() {
  if (iaeAgentStatusTimer) return;
  iaeRefreshAgentStatus();
  iaeAgentStatusTimer = setInterval(function () {
    if (iaeView !== 'edit') { iaeStopAgentPoll(); return; } // 편집 뷰 아니면 정지
    iaeRefreshAgentStatus();
  }, 20000);
}
function iaeStopAgentPoll() { if (iaeAgentStatusTimer) { clearInterval(iaeAgentStatusTimer); iaeAgentStatusTimer = null; } }
function iaeHistCardHTML(r) {
  var meta = r.result_meta || {};
  var done = r.status === 'done', err = r.status === 'error';
  var dims = (meta.width_cm != null && meta.height_cm != null)
    ? (Math.round(meta.width_cm) + '×' + Math.round(meta.height_cm) + 'cm') : '';
  var when = (typeof formatKST === 'function' && r.created_at) ? formatKST(r.created_at) : iaeEscape(r.created_at || '');
  var thumb = (done && meta.jpg_base64)
    ? '<img src="data:image/jpeg;base64,' + meta.jpg_base64 + '" class="w-full h-20 object-contain bg-white border border-gray-100 rounded">'
    : ((done && meta.has_jpg)
      ? '<img data-jpg-blob="/api/workbench/process/' + iaeEscape(r.id) + '/download?kind=jpg" class="w-full h-20 object-contain bg-white border border-gray-100 rounded">'
      : '<div class="w-full h-20 flex items-center justify-center bg-gray-50 text-gray-300 rounded border border-gray-100">'
        + (err ? '<i class="fas fa-triangle-exclamation text-red-300"></i>' : '<i class="fas ' + (done ? 'fa-image' : 'fa-spinner fa-spin') + '"></i>') + '</div>');
  var title = '#' + iaeEscape(r.group_index != null ? r.group_index : '-') + ' · 분석 ' + iaeEscape(r.analysis_id != null ? r.analysis_id : '-');
  var dlBtn = function (kind, has, primary) {
    if (!has) return '';
    var cls = primary ? 'bg-gray-800 text-white hover:bg-black' : 'border border-gray-300 text-gray-700 hover:bg-gray-50';
    return '<button class="iae-hist-dl px-2 py-0.5 rounded ' + cls + ' text-[11px]" data-id="' + iaeEscape(r.id) + '" data-kind="' + kind + '">' + kind.toUpperCase() + '</button>';
  };
  // R2-1: done 잡 → '주문 만들기'(이력 데이터로 주문 라인 프리필)
  var orderBtn = done
    ? '<button class="iae-hist-order w-full mt-1.5 px-2 py-0.5 rounded bg-green-600 text-white hover:bg-green-700 text-[11px]" data-id="' + iaeEscape(r.id) + '"><i class="fas fa-file-invoice mr-1"></i>주문 만들기</button>'
    : '';
  var btns = done
    ? '<div class="flex items-center gap-1 mt-1.5">' + dlBtn('eps', meta.has_eps, true) + dlBtn('jpg', meta.has_jpg, false) + dlBtn('dxf', meta.has_dxf, false) + '</div>' + orderBtn
    : (err ? '<div class="text-[11px] text-red-500 mt-1 truncate" title="' + iaeEscape(r.error_message || '') + '">' + iaeEscape(r.error_message || '실패') + '</div>' : '');
  return '<div class="border border-gray-200 rounded-lg p-2">'
    + thumb
    + '<div class="flex items-center justify-between mt-1.5"><span class="text-[11px] font-semibold text-gray-700 truncate" title="' + title + '">' + title + '</span>' + iaeStatusBadge(r.status) + '</div>'
    + '<div class="text-[10px] text-gray-400 mt-0.5">' + (dims ? iaeEscape(dims) + ' · ' : '') + when + '</div>'
    + btns
    + '</div>';
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
  var trimTxt = s.trim ? ' · 돔보' : '';
  html += '<div class="text-center text-xs text-gray-500 mt-2">출력 ' + dispW + '×' + dispH + 'cm' + (rot ? ' (90° 회전)' : '')
    + ' · 여백 상' + m.t + '/하' + m.b + '/좌' + m.l + '/우' + m.r + 'cm' + trimTxt + ' · 1매</div></div>';
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
  iaeStopRenderPoll(); // 탭 전환 시 진행 중 렌더 폴링 정리(결과 패널이 교체됨)
  iaeView = v;
  var ev = document.getElementById('iaeEditView'), cv = document.getElementById('iaeCanvasView');
  var be = document.getElementById('iaeViewEdit'), bc = document.getElementById('iaeViewCanvas');
  if (ev) ev.classList.toggle('hidden', v !== 'edit');
  if (cv) cv.classList.toggle('hidden', v !== 'canvas');
  var on = 'border-blue-500 bg-blue-50 text-blue-700', off = 'border-gray-200 text-gray-600 hover:bg-gray-50';
  var cls = function (sel) { return 'px-4 py-2 rounded-lg text-sm font-medium border ' + (v === sel ? on : off); };
  if (be) be.className = cls('edit');
  if (bc) bc.className = cls('canvas');
  if (v === 'canvas') { iaeRenderCanvas(); iaeStopAgentPoll(); } // ② 캔버스 뷰선 에이전트 폴 정지
  if (v === 'edit') { iaeLoadHistory(); iaeStartAgentPoll(); } // ③ 파일처리 탭 복귀 시 출력 이력 새로고침 + ② 에이전트 폴 시작
}

// shelfBinPack 포팅 (원본: src/scripts/orderForm/sheet.js:402) — 폭 고정·면적 내림차순 shelf 적재 + 회전
// (대지 편집 시트 네스팅 iaeCanNestPlace이 사용)
// R2-4: allowRotate(기본 true·기존 호출 호환) — false면 회전 후보 제외(방향성 소재 보호).
function iaeShelfBinPack(items, availableWidth, gap, allowRotate) {
  if (!items || !items.length) return { error: true, msg: '배치할 항목이 없습니다' };
  gap = gap || 0;
  if (allowRotate === undefined) allowRotate = true; // 기본 회전 허용(기존 동작 보존)
  // R2-4: 회전 후보 — 허용 시 [원본, 90°], 비허용 시 [원본]만
  var orient = function (it) {
    return allowRotate
      ? [{ w: it.w, h: it.h, rotated: false }, { w: it.h, h: it.w, rotated: true }]
      : [{ w: it.w, h: it.h, rotated: false }];
  };
  var sorted = items.slice().sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });
  var shelves = [], placements = [];
  for (var i = 0; i < sorted.length; i++) {
    var it = sorted[i], placed = false;
    for (var si = 0; si < shelves.length; si++) {
      var sh = shelves[si];
      var xGap = sh.itemCount > 0 ? gap : 0;
      var ors = orient(it);
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
      var ors2 = orient(it), chosen = null;
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

// ── R3b-1: MaxRects 패킹 (shelf와 별개·격리) ─────────────────────────
// 빈 자유공간(free rectangles)을 재활용해 선반보다 촘촘히 채움(Best Short Side Fit + Guillotine 분할).
// 반환 = iaeShelfBinPack과 동일 형태 {error, placements:[{id,x_cm,y_cm,width_cm,height_cm,rotated}], total_height_cm, shelves:[]}.
//   shelves는 평판 분할(iaeNestPackMetrics·iaeCanNestPlace의 byY 그룹핑)이 y_cm 기준이므로 미사용(빈 배열)이어도 호환.
//   ⚠️ iaeShelfBinPack은 일절 미변경 — 이 함수는 packer='maxrects'일 때만 호출됨(기본 shelf=회귀 0).
function iaeMaxRectsPack(items, availableWidth, gap, allowRotate) {
  if (!items || !items.length) return { error: true, msg: '배치할 항목이 없습니다' };
  gap = gap || 0;
  if (allowRotate === undefined) allowRotate = true;
  // gap은 각 조각을 (w+gap)×(h+gap) 외곽으로 부풀려 처리(인접 간격 확보). 폭 한도도 gap만큼 확장해 우측 끝 손실 보정.
  var BIG = 1e7; // 롤=세로 무한 가정(가변 높이). 평판 높이 초과는 상위(Metrics)가 검출.
  var free = [{ x: 0, y: 0, w: availableWidth + gap + 1e-6, h: BIG }];
  var sorted = items.slice().sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });
  var placements = [], maxBottom = 0;
  var orient = function (it) {
    return allowRotate
      ? [{ w: it.w, h: it.h, rotated: false }, { w: it.h, h: it.w, rotated: true }]
      : [{ w: it.w, h: it.h, rotated: false }];
  };
  for (var i = 0; i < sorted.length; i++) {
    var it = sorted[i], ors = orient(it);
    // 최적 자유사각 탐색: Best Short Side Fit(짧은 잔여변 최소), 동률이면 y 낮은 쪽
    var best = null;
    for (var fi = 0; fi < free.length; fi++) {
      var fr = free[fi];
      for (var oi = 0; oi < ors.length; oi++) {
        var ow = ors[oi].w + gap, oh = ors[oi].h + gap; // gap 포함 점유 크기
        if (ow <= fr.w + 1e-6 && oh <= fr.h + 1e-6) {
          var leftover = Math.min(fr.w - ow, fr.h - oh);
          var score = leftover * 1e6 + fr.y; // 잔여변 우선, 그다음 낮은 y
          if (!best || score < best.score) best = { score: score, fr: fr, fi: fi, o: ors[oi], ow: ow, oh: oh };
        }
      }
    }
    if (!best) {
      var minW = Infinity; ors.forEach(function (o) { if (o.w < minW) minW = o.w; });
      return { error: true, msg: '항목이 폭보다 큽니다: ' + it.w.toFixed(1) + '×' + it.h.toFixed(1) + 'cm' };
    }
    var px = best.fr.x, py = best.fr.y;
    placements.push({ id: it.id, x_cm: px, y_cm: py, width_cm: best.o.w, height_cm: best.o.h, rotated: best.o.rotated });
    if (py + best.o.h > maxBottom) maxBottom = py + best.o.h;
    // Guillotine 분할: 점유사각(px,py,ow,oh)으로 겹치는 자유사각을 우/하 잔여로 쪼갬
    var placed = { x: px, y: py, w: best.ow, h: best.oh };
    var next = [];
    for (var fj = 0; fj < free.length; fj++) {
      var f = free[fj];
      if (placed.x >= f.x + f.w - 1e-6 || placed.x + placed.w <= f.x + 1e-6 ||
          placed.y >= f.y + f.h - 1e-6 || placed.y + placed.h <= f.y + 1e-6) { next.push(f); continue; } // 비겹침=유지
      // 겹침: 좌/우/상/하 4방 잔여 생성(MaxRects 분할)
      if (placed.x > f.x + 1e-6) next.push({ x: f.x, y: f.y, w: placed.x - f.x, h: f.h });
      if (placed.x + placed.w < f.x + f.w - 1e-6) next.push({ x: placed.x + placed.w, y: f.y, w: f.x + f.w - (placed.x + placed.w), h: f.h });
      if (placed.y > f.y + 1e-6) next.push({ x: f.x, y: f.y, w: f.w, h: placed.y - f.y });
      if (placed.y + placed.h < f.y + f.h - 1e-6) next.push({ x: f.x, y: placed.y + placed.h, w: f.w, h: f.y + f.h - (placed.y + placed.h) });
    }
    // 포함되는 자유사각 제거(prune) — 비대 방지
    free = next.filter(function (a, ai) {
      for (var bi = 0; bi < next.length; bi++) {
        if (ai === bi) continue; var b = next[bi];
        if (a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.w <= b.x + b.w + 1e-6 && a.y + a.h <= b.y + b.h + 1e-6) return false;
      }
      return true;
    });
  }
  // total_height = 마지막 조각 하단 - gap(우/하 gap은 조각간 간격이므로 외곽 1개분 환원). shelf와 의미 정합.
  var totalHeight = Math.max(0, maxBottom - (placements.length ? gap : 0));
  return { error: false, placements: placements, total_height_cm: totalHeight, shelves: [] };
}


// ════════════════════════════════════════════════════════════════
// N1: 자유 대지 캔버스 (그룹=객체, 실제크기 비율, 드래그/리사이즈/회전, 핫키 골격)
//   spec §14.4 N1. 마감/여백/돔보 벡터근사=N2, 네스팅=N3, 주문연결=N4, 단일그룹돔보=N5.
//   객체 좌표는 mm(대지 원점 좌상단), Konva stage.scale/position으로 줌/팬. localStorage 영속.
// ════════════════════════════════════════════════════════════════
var IAE_CANVAS_KEY = 'iae_canvas_v1';
var iaeCanObjs = [];          // [{uid, fid, gi, key, label, w_mm, h_mm, x_mm, y_mm, rotation, fin:{top,bottom,left,right}, trim}]
var iaeCanStage = null, iaeCanLayer = null, iaeCanGrid = null, iaeCanOverlay = null, iaeCanTr = null;
var iaeCanGuide = null;        // R3a-1: 드래그 정렬 가이드 레이어(non-listening, dragend서 비움)
var iaeCanSnapThreshMm = 3;    // R3a-1: 스냅 임계(mm) — 이내면 보정, 밖이면 자유 드래그(nudge·자유배치 보존)
var iaeCanSnapTargets = null;  // R3a-1: 드래그 시작 시 캐시한 스냅 대상 {vert:[{mm,kind}], horz:[{mm,kind}], gap_mm}
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
var iaeCanNestOpts = { mode: 'roll', presetIdx: 0, qty: 10, gap: 0.3, margin: 1.0, key: '', ratio_lock: true, allow_rotate: true, packer: 'shelf' }; // R2-4 allow_rotate · R3b-1 packer(기본 shelf=현행)
// ── P2 멀티소스 임포지션(모아찍기) ─────────────────────────────────
//   여러 파일 아트보드를 골라 한 판에 모아 배치·출력. P1 배관(placement별 analysis_id 소스 라우팅) 위에 얹는 구성 UI.
//   대지편집 탭 서브모드: 'nest'(기존 단일그룹 네스팅, 회귀0 보존) | 'impose'(다중선택 임포지션). 좌 패널 상단 토글 전환.
//   결정(2026-07-08, 사용자 부재→권장안): ①별도 서브모드 신설 ②도련=재단여백만 확보(아트워크 원본크기 유지, 실제 재단선=DXF·P4).
var IAE_SUBMODE_KEY = 'iae_can_submode_v1';
var iaeCanSubMode = 'nest';   // 'nest' | 'impose'
var IAE_IMPOSE_KEY = 'iae_impose_v1';
var iaeImposeSel = [];        // [{key, fid, gi, filename, w_mm, h_mm, scale, qty, bleed}] — 선택 조각(조각별 배율×N·개수·도련cm)
var iaeImposeOpts = { mode: 'roll', presetIdx: 0, gap: 0.3, margin: 1.0, allow_rotate: true, packer: 'shelf', custom_w: '', custom_h: '' };

function iaeCanLoad() {
  try { var raw = localStorage.getItem(IAE_CANVAS_KEY); var a = raw ? JSON.parse(raw) : []; iaeCanObjs = Array.isArray(a) ? a : []; }
  catch (_e) { iaeCanObjs = []; }
  iaeCanObjs.forEach(function (o) { if (o.uid >= iaeCanUid) iaeCanUid = o.uid + 1; });
  try { var rawS = localStorage.getItem(IAE_SHEETS_KEY); var b = rawS ? JSON.parse(rawS) : []; iaeCanSheets = Array.isArray(b) ? b : []; }
  catch (_e) { iaeCanSheets = []; }
  iaeCanSheets.forEach(function (s) { if (s.uid >= iaeCanSheetUid) iaeCanSheetUid = s.uid + 1; });
  try { iaeCanSubMode = (localStorage.getItem(IAE_SUBMODE_KEY) === 'impose') ? 'impose' : 'nest'; } catch (_e) { iaeCanSubMode = 'nest'; }
  try { var rawI = localStorage.getItem(IAE_IMPOSE_KEY); var im = rawI ? JSON.parse(rawI) : null; if (im) { if (Array.isArray(im.sel)) iaeImposeSel = im.sel; if (im.opts) iaeImposeOpts = im.opts; } } catch (_e) {}
}
function iaeCanSave() {
  try { localStorage.setItem(IAE_CANVAS_KEY, JSON.stringify(iaeCanObjs)); } catch (_e) {}
  try { localStorage.setItem(IAE_SHEETS_KEY, JSON.stringify(iaeCanSheets)); } catch (_e) {}
  try { localStorage.setItem(IAE_SUBMODE_KEY, iaeCanSubMode); } catch (_e) {}
  iaeImposeSave();
}
function iaeImposeSave() { try { localStorage.setItem(IAE_IMPOSE_KEY, JSON.stringify({ sel: iaeImposeSel, opts: iaeImposeOpts })); } catch (_e) {} }

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
// 썸네일 base64(프리픽스 없이 저장) → 렌더용 data URI. 이미 data: 접두면 그대로(방어).
function iaeThumbSrc(t) { return t ? (String(t).indexOf('data:') === 0 ? t : ('data:image/png;base64,' + t)) : ''; }

// W5: 네스팅 뷰 = 좌 폼 + 우 정적 SVG 미리보기(iaeNestRenderPreview). 자유드래그 캔버스 폐기.
//   P2: 서브모드 'impose'면 임포지션 패널, 아니면 기존 단일그룹 네스팅 패널. 미리보기는 공용.
function iaeRenderCanvas() {
  if (iaeCanSubMode === 'impose') iaeImposeRenderPanel();
  else iaeCanRenderNestPanel();
  iaeNestRenderPreview();
}
// P2: 대지편집 서브모드 토글(네스팅|임포지션) — 두 패널 상단 공용.
function iaeCanSubModeTabsHTML() {
  var tab = function (m, label, icon) {
    var on = iaeCanSubMode === m;
    return '<button data-submode="' + m + '" type="button" class="iae-submode-tab flex-1 px-2 py-1.5 rounded-md text-xs font-medium border '
      + (on ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50')
      + '"><i class="fas ' + icon + ' mr-1"></i>' + label + '</button>';
  };
  return '<div class="flex gap-1.5 mb-3">' + tab('nest', '네스팅', 'fa-clone') + tab('impose', '모아찍기', 'fa-table-cells-large') + '</div>';
}
function iaeCanBindSubModeTabs(host) {
  var tabs = host.querySelectorAll('.iae-submode-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function () {
      var m = this.getAttribute('data-submode');
      if (m === iaeCanSubMode) return;
      iaeCanSubMode = m; iaeCanSave();
      iaeRenderCanvas();
    });
  }
}
// W5: 자동 배치 정적 미리보기 — 엔진 결과(iaeCanSheets/iaeCanObjs)를 SVG로 렌더(읽기전용). 드래그 없음.
function iaeNestRenderPreview() {
  var host = document.getElementById('iaeNestPreview'); if (!host) return;
  var sheets = iaeCanSheets || [];
  if (!sheets.length) {
    host.className = 'min-h-[480px] flex items-center justify-center text-gray-300 text-sm text-center';
    host.innerHTML = '왼쪽에서 그룹·수량·시트 규격을 설정하고 <b class="mx-1">자동 배치</b>를 누르면<br>시트 배치 미리보기가 표시됩니다.';
    return;
  }
  host.className = 'min-h-[480px]';
  var maxW = 560; // px 목표 폭
  // P3-a: 조각 썸네일 맵(analysis_id:group_index → thumb) — 각 조각을 실제 이미지로 채워 멀티소스 구성 확인.
  var thumbMap = {};
  iaeCanAllGroups().forEach(function (g) { if (g.thumb) thumbMap[g.fid + ':' + g.gi] = g.thumb; });
  var cards = sheets.map(function (sh) {
    var wCm = (sh.w_mm || 0) / 10, hCm = (sh.h_mm || 0) / 10;
    if (wCm <= 0 || hCm <= 0) return '';
    var scale = maxW / wCm; if (scale * hCm > 720) scale = 720 / hCm; // 너무 길면 높이 기준 축소
    var vbW = +(wCm * scale).toFixed(1), vbH = +(hCm * scale).toFixed(1);
    var pls = sh.placements || [];
    var rects = pls.map(function (p) {
      var r = ((p.rotation != null ? p.rotation : (p.rotated ? 90 : 0)) % 360 + 360) % 360;
      var rot = (r === 90 || r === 270);
      var x = (p.x_cm || 0) * scale, y = (p.y_cm || 0) * scale;
      var w = (p.width_cm || 0) * scale, h = (p.height_cm || 0) * scale;
      // P3-a: 조각 썸네일(회전 시 미회전 크기로 그린 뒤 bbox 중심 기준 회전 → bbox 채움)
      var thumb = thumbMap[(p.analysis_id != null ? p.analysis_id : sh.fid) + ':' + (p.group_index != null ? p.group_index : sh.gi)];
      var img = '';
      if (thumb) {
        var cx = x + w / 2, cy = y + h / 2;
        var uw = rot ? h : w, uh = rot ? w : h; // 회전 전 원본 배치 크기
        img = '<image href="' + iaeThumbSrc(thumb) + '" x="' + (cx - uw / 2).toFixed(1) + '" y="' + (cy - uh / 2).toFixed(1) + '" width="' + uw.toFixed(1) + '" height="' + uh.toFixed(1) + '" preserveAspectRatio="none"'
          + (r ? (' transform="rotate(' + r + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')"') : '') + ' opacity="0.92"/>';
      }
      return img
        + '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + (thumb ? 'none' : '#bfdbfe') + '" stroke="#2563eb" stroke-width="1"/>'
        + (rot ? '<text x="' + (x + 6).toFixed(1) + '" y="' + (y + 12).toFixed(1) + '" font-size="10" fill="#1e40af">&#8635;</text>' : '');
    }).join('');
    var effPct = Math.round((sh.eff || 0) * 100);
    return '<div class="bg-white border border-gray-200 rounded-lg p-3 inline-block align-top mr-4 mb-4">'
      + '<div class="text-xs font-semibold text-gray-700 mb-1.5">' + iaeEscape(sh.label || '시트') + ' <span class="font-normal text-gray-400">' + Math.round(wCm) + '×' + Math.round(hCm) + 'cm · 조각 ' + pls.length + ' · 효율 ' + effPct + '%' + (sh.trim ? ' · 돔보' : '') + '</span></div>'
      + '<svg width="' + Math.max(40, Math.round(vbW)) + '" height="' + Math.max(40, Math.round(vbH)) + '" viewBox="0 0 ' + vbW + ' ' + vbH + '" class="bg-gray-50 border border-gray-300">'
      + '<rect x="0" y="0" width="' + vbW + '" height="' + vbH + '" fill="none" stroke="#9ca3af" stroke-width="1"/>' + rects + '</svg></div>';
  }).join('');
  host.innerHTML = '<div class="flex flex-wrap">' + cards + '</div>';
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
    // 멀티소스 임포지션: 여러 파일 조각을 한 시트에 유지(축소 없음). sh.fid는 대표(최다 파일) 표기용.
    var cnt = {}; mem.forEach(function (o) { cnt[o.fid] = (cnt[o.fid] || 0) + 1; });
    var anchor = mem[0].fid, best = -1;
    Object.keys(cnt).forEach(function (f) { if (cnt[f] > best) { best = cnt[f]; anchor = mem.filter(function (m) { return String(m.fid) === f; })[0].fid; } });
    sh.fid = anchor;
  });
}
// 시트 placements·규격·효율을 라이브 조각 위치에서 재계산. 롤=길이 자동 단축. 반환 {warnings,members}.
function iaeCanSyncSheet(sh) {
  var mem = iaeCanObjs.filter(function (o) { return o.sheetUid === sh.uid; });
  var warns = [];
  if (!mem.length) { sh.placements = []; sh.eff = 0; return { warnings: warns, members: 0 }; }
  var margin = sh.margin_cm || 0;
  var placements = [], areaCm2 = 0, maxBottomCm = 0, overflow = false;
  var rollW = sh.roll_width_cm || (sh.w_mm || 0) / 10;
  mem.forEach(function (o) {
    var bb = iaeCanRotBBox(o);
    var xc = (bb.left - (sh.x_mm || 0)) / 10, yc = (bb.top - (sh.y_mm || 0)) / 10;
    var wc = bb.w / 10, hc = bb.h / 10;
    placements.push({ group_index: o.gi, analysis_id: o.fid, x_cm: Math.round(xc * 100) / 100, y_cm: Math.round(yc * 100) / 100, width_cm: Math.round(wc * 100) / 100, height_cm: Math.round(hc * 100) / 100, rotated: bb.rotated, rotation: bb.rot });
    areaCm2 += (o.w_mm || 0) * (o.h_mm || 0) / 100; // 조각 실면적(겹침과 무관)
    if (yc + hc > maxBottomCm) maxBottomCm = yc + hc;
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
  sh._warn = warns;
  return { warnings: warns, members: mem.length };
}
function iaeCanNestPlace(opts) {
  var src = iaeCanSrc(opts.key);
  if (!src) { iaeToast('대상 그룹을 선택하세요', 'error'); return; }
  // W5: 자동 배치는 매번 fresh — 단일 그룹 네스팅(누적/자유객체 없음). 기존 시트·조각 비움.
  iaeCanObjs = []; iaeCanSheets = [];
  var origW = src.w_mm || 0, origH = src.h_mm || 0;
  // 네스팅 스케일: 목표 크기(opts.target_w/h, cm) 지정 시 그 크기로 조각 배치, 없으면 검출 크기
  var dwCm = (Number(opts.target_w) > 0) ? Number(opts.target_w) : origW / 10;
  var dhCm = (Number(opts.target_h) > 0) ? Number(opts.target_h) : origH / 10;
  if (dwCm <= 0 || dhCm <= 0) { iaeToast('그룹 크기를 알 수 없습니다', 'error'); return; }
  var pwMm = Math.round(dwCm * 10), phMm = Math.round(dhCm * 10);  // 조각 출력 크기(mm)
  var fileScale = Math.max(1, Number(opts.file_scale) || 1);        // 파일 배율(소스가 실제의 1/N)
  var qty = Math.max(1, parseInt(opts.qty, 10) || 1);
  var presets = iaePresetsFor(opts.mode);
  var preset = presets[opts.presetIdx] || presets[0];
  var margin = Number(opts.margin) || 0, gap = Number(opts.gap) || 0;
  var availW = preset.w - margin * 2;
  if (availW <= 0) { iaeToast('돔보 여백이 시트 폭보다 큽니다', 'error'); return; }

  var items = [];
  for (var q = 0; q < qty; q++) items.push({ id: 'p' + q, w: dwCm, h: dhCm });
  // R2-4: 회전 허용 시 두 방향 시뮬 후 최적 방향으로 실제 배치. 비허용이면 방향 고정.
  var allowRotate = (opts.allow_rotate !== false);
  var best = iaeNestPackBest(opts.mode, preset, items, availW, gap, margin, allowRotate, opts.packer); // R3b-1 packer
  if (best.error) { iaeToast(best.msg, 'error'); return; }
  var packed = best.packed;
  if (allowRotate && !best.chosenAllowRotate) iaeToast('방향 고정 배치가 더 효율적 — 회전 없이 배치합니다', 'info');

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
    // ⑦ 좌표 일원화: 시트 placements는 인라인 계산하지 않고 조각(객체) 배치 후 iaeCanSyncSheet로 라이브 재계산.
    //    시트는 규격·메타만 보유 → 화면↔출력 단일 소스(객체 위치). 이형 인터록(드래그/회전) 후에도 동일 경로.
    var sh = { uid: sheetUid, x_mm: sx, y_mm: sy, w_mm: Math.round(s.width_cm * 10), h_mm: Math.round(s.height_cm * 10), mode: opts.mode, label: preset.label + (sheets.length > 1 ? (' #' + (si + 1)) : ''), eff: eff, trim: margin > 0,
      key: opts.key, fid: src.fid, gi: src.gi, roll_width_cm: s.width_cm, total_height_cm: s.height_cm, margin_cm: margin, gap_cm: gap, scale_factor: fileScale,
      placements: [] };
    iaeCanSheets.push(sh);
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
    iaeCanSyncSheet(sh); // ⑦ 객체 배치로부터 placements·효율·롤 길이 재계산(단일 소스)
    cursorY += Math.round(s.height_cm * 10) + 30;
  });
  iaeCanSave(); iaeNestRenderPreview(); // W5: Konva 대신 정적 SVG 미리보기
  iaeToast(sheets.length + '판 배치 · 효율 ' + Math.round(eff * 100) + '%', 'success');
  iaeCanRenderNestPanel(); // 패널 유지
}

// ── (§4.1) 네스팅 EPS 출력 — 주문 없이 현재 시트를 렌더·다운로드 ──────────────
// v1 제약: 단일 분석·단일 시트(SheetLayout.jsx). 위반 시 안내 토스트.
function iaeCanExportSheets() {
  iaeCanReassignSheets();                 // 멤버십 전수 확정(포함관계·앵커 fid)
  iaeCanSheets.forEach(iaeCanSyncSheet);  // placements·규격·효율 라이브 재계산
  var ready = iaeCanSheets.filter(function (sh) { return sh.placements && sh.placements.length; });
  if (ready.length === 0) { iaeToast('먼저 \'대지에 배치\'로 시트 네스팅을 만드세요', 'error'); return; }
  if (ready.length > 1) {
    // R3b-2: 평판 다중판 → 각 판을 별도 sheet 잡으로 분할 큐잉(판당 단일 시트, SheetLayout 단일 전제 보존).
    //   전부 평판일 때만 분할. 롤/혼합은 기존 단일 시트 가드 유지(회귀 0).
    var allFlat = ready.every(function (sh) { return (sh.mode || 'roll') === 'flatbed'; });
    if (allFlat) { iaeCanExportSheetsMulti(ready); return; }
    iaeToast('현재 단일 시트만 출력할 수 있습니다 — 시트가 ' + ready.length + '개입니다. 한 시트만 남겨주세요. (평판은 다중판 분할 출력 지원)', 'error');
    return;
  }
  var sh = ready[0];
  // 단일 시트(현행 경로) — 분할 페이로드 빌더(total=1)로 기존과 동일 body 생성(회귀 0).
  var body = iaeCanSheetExportBody(sh, 0, 1);

  var resHost = document.getElementById('iaeCanNestResult');
  var btn = document.getElementById('iaeCanExportBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>저장 중…'; }
  if (resHost) resHost.innerHTML = '<div class="text-xs text-blue-600"><i class="fas fa-spinner fa-spin mr-1"></i>시트 저장 중…</div>';

  iaeStopRenderPoll();
  axios.post('/api/workbench/sheets', body).then(function (res) {
    var d = res.data && res.data.data;
    if (!d || d.id == null) throw new Error('시트 저장 응답 오류');
    var sheetId = d.id;
    if (resHost) resHost.innerHTML = '<div class="text-xs text-blue-600"><i class="fas fa-spinner fa-spin mr-1"></i>렌더 요청 중…</div>';
    return axios.post('/api/workbench/sheets/' + sheetId + '/render').then(function () {
      iaeCanPollSheet(sheetId, resHost, btn, body.name);
    });
  }).catch(function (err) {
    var msg = (err.response && err.response.data && err.response.data.error) || err.message || '저장 실패';
    iaeToast(msg, 'error');
    if (resHost) resHost.innerHTML = '';
    iaeCanResetExportBtn(btn);
  });
}
function iaeCanResetExportBtn(btn) {
  btn = btn || document.getElementById('iaeCanExportBtn');
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-export mr-1"></i>EPS 출력'; }
}
function iaeCanPollSheet(sheetId, resHost, btn, namePrefix) {
  if (resHost) resHost.innerHTML = '<div class="text-xs text-blue-600"><i class="fas fa-spinner fa-spin mr-1"></i>렌더 중… (최대 2분)</div>';
  iaePollRender(function () {
    return axios.get('/api/workbench/sheets/' + sheetId).then(function (res) {
      var d = (res.data && res.data.data) || {};
      var rj = {};
      try { rj = d.render_result_json ? (typeof d.render_result_json === 'string' ? JSON.parse(d.render_result_json) : d.render_result_json) : {}; } catch (_e) { rj = {}; }
      if (d.render_status === 'done') return { done: true, result: rj };
      if (d.render_status === 'error') return { error: true, msg: d.render_error || '렌더 실패' };
      return null; // queued | rendering
    });
  }, function (result) {
    if (resHost) {
      resHost.innerHTML = iaeRenderResultHTML(result, '/api/workbench/sheets/' + sheetId + '/download', namePrefix);
      iaeWireResultButtons(resHost, '/api/workbench/sheets/' + sheetId + '/download', namePrefix, result);
    }
    iaeCanResetExportBtn(btn);
    iaeToast('네스팅 EPS 출력 완료', 'success');
  }, function (msg) {
    if (resHost) resHost.innerHTML = '';
    iaeToast(msg, 'error');
    iaeCanResetExportBtn(btn);
  });
}

// ── P3-b: 실제 렌더 미리보기 — 출력 전 실물 판 JPG 확인(EPS/DXF 미생성, 이력 TTL 정리) ──
//   첫 준비 시트를 SheetLayout preview_only로 렌더 → JPG-only 콜백을 인라인 표시(다운로드 버튼 없음).
//   신 에이전트=jpg_base64 인라인 / 구 에이전트=jpg_r2 blob 폴백(iaeWireBlobThumbs) 양쪽 처리.
function iaeCanPreviewRender() {
  iaeCanReassignSheets();
  iaeCanSheets.forEach(iaeCanSyncSheet);
  var ready = iaeCanSheets.filter(function (sh) { return sh.placements && sh.placements.length; });
  if (ready.length === 0) { iaeToast('먼저 \'자동 배치\'로 시트를 만드세요', 'error'); return; }
  var sh = ready[0];
  var body = iaeCanSheetExportBody(sh, 0, 1, true); // preview=true → canvas.preview_only
  var resHost = document.getElementById('iaeCanNestResult');
  var btn = document.getElementById('iaeCanPreviewBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>렌더 준비…'; }
  if (resHost) resHost.innerHTML = '<div class="text-xs text-blue-600"><i class="fas fa-spinner fa-spin mr-1"></i>실제 렌더 요청 중…' + (ready.length > 1 ? (' (' + ready.length + '판 중 1판)') : '') + '</div>';
  iaeStopRenderPoll();
  axios.post('/api/workbench/sheets', body).then(function (res) {
    var d = res.data && res.data.data;
    if (!d || d.id == null) throw new Error('시트 저장 응답 오류');
    return axios.post('/api/workbench/sheets/' + d.id + '/render').then(function () {
      iaeCanPollPreview(d.id, resHost, btn, ready.length);
    });
  }).catch(function (err) {
    var msg = (err.response && err.response.data && err.response.data.error) || err.message || '미리보기 실패';
    iaeToast(msg, 'error');
    if (resHost) resHost.innerHTML = '';
    iaeCanResetPreviewBtn(btn);
  });
}
function iaeCanResetPreviewBtn(btn) {
  btn = btn || document.getElementById('iaeCanPreviewBtn');
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-eye mr-1"></i>실제 렌더'; }
}
function iaeCanPreviewResultHTML(result, base, totalReady) {
  var jpg = result && result.jpg_base64;
  var hasJpgR2 = result && (result.jpg_r2 || result.jpg_path);
  var dims = (result && result.width_cm != null && result.height_cm != null) ? (Math.round(result.width_cm) + '×' + Math.round(result.height_cm) + 'cm') : '';
  var img = jpg
    ? '<img src="data:image/jpeg;base64,' + jpg + '" class="w-full object-contain bg-white border border-gray-200 rounded">'
    : (hasJpgR2 ? '<img data-jpg-blob="' + iaeEscape(base) + '?kind=jpg" class="w-full object-contain bg-white border border-gray-200 rounded">' : '<div class="text-[11px] text-gray-400">미리보기 JPG를 받지 못했습니다</div>');
  return '<div class="border border-blue-200 bg-blue-50 rounded-lg p-2">'
    + '<div class="text-xs font-semibold text-blue-700 mb-2"><i class="fas fa-eye mr-1"></i>실제 렌더 미리보기'
    + (totalReady > 1 ? ' <span class="font-normal text-blue-500">(1/' + totalReady + '판)</span>' : '')
    + (dims ? ' · <span class="font-normal text-blue-600">' + iaeEscape(dims) + '</span>' : '')
    + '</div>' + img + '</div>';
}
function iaeCanPollPreview(sheetId, resHost, btn, totalReady) {
  if (resHost) resHost.innerHTML = '<div class="text-xs text-blue-600"><i class="fas fa-spinner fa-spin mr-1"></i>실제 렌더 중… (최대 2분)</div>';
  iaePollRender(function () {
    return axios.get('/api/workbench/sheets/' + sheetId).then(function (res) {
      var d = (res.data && res.data.data) || {};
      var rj = {};
      try { rj = d.render_result_json ? (typeof d.render_result_json === 'string' ? JSON.parse(d.render_result_json) : d.render_result_json) : {}; } catch (_e) { rj = {}; }
      if (d.render_status === 'done') return { done: true, result: rj };
      if (d.render_status === 'error') return { error: true, msg: d.render_error || '렌더 실패' };
      return null;
    });
  }, function (result) {
    if (resHost) {
      resHost.innerHTML = iaeCanPreviewResultHTML(result, '/api/workbench/sheets/' + sheetId + '/download', totalReady);
      iaeWireBlobThumbs(resHost); // 구 에이전트(jpg_r2) blob 로드
    }
    iaeCanResetPreviewBtn(btn);
    iaeToast('실제 렌더 미리보기 완료', 'success');
  }, function (msg) {
    if (resHost) resHost.innerHTML = '';
    iaeToast(msg, 'error');
    iaeCanResetPreviewBtn(btn);
  });
}

// ── R3b-2: 시트 → /sheets 페이로드 빌더 (단일·다중판 공용) ─────────────
// 단일 시트 출력과 다중판 분할이 동일 페이로드 계약을 쓰도록 추출. total>1이면 이름에 (n/N) 부여.
// total=1이면 기존 단일 출력과 byte-identical(name·canvas·placements 동일) → 회귀 0.
function iaeCanSheetExportBody(sh, idx, total, preview) {
  var src = iaeCanSrc(sh.key) || {};
  var pls = sh.placements || [];
  // 멀티소스: placements의 distinct analysis_id(fid) 수집 → source_analysis_ids 배열(JSON).
  //   단일도 배열로 통일(기존 String(fid)="16" 비배열 저장 → render Array.isArray 실패 잠복버그 해소).
  var aidSet = {}, aidList = [];
  pls.forEach(function (p) {
    var a = (p.analysis_id != null) ? p.analysis_id : null;
    if (a != null && !aidSet[a]) { aidSet[a] = true; aidList.push(a); }
  });
  if (!aidList.length) { var f = (src.fid != null) ? src.fid : sh.fid; if (f != null) aidList.push(f); }
  // 주문보내기와 동일한 SHEET 캡처(placements·규격·scale) → 네스팅 렌더 페이로드
  var canvas = {
    mode: sh.mode || 'roll', scale_factor: sh.scale_factor || 1,
    roll_width_cm: sh.roll_width_cm || (sh.w_mm || 0) / 10,
    total_height_cm: sh.total_height_cm || (sh.h_mm || 0) / 10,
    margin_cm: sh.margin_cm || 0, gap_cm: sh.gap_cm || 0,
    source_file_path: iaeCanFileR2(src.fid != null ? src.fid : sh.fid),  // 하위호환(단일 폴백)
    group_index: sh.gi
  };
  if (preview) canvas.preview_only = true; // P3-b: 실제 렌더 미리보기(JPG-only, EPS/DXF·R2·이력 스킵). render-queue가 canvas_json 통과 → 에이전트.
  var multi = aidList.length > 1;
  var name = '네스팅 ' + (multi ? (aidList.length + '개 소스 ' + pls.length + '조각') : ((src.filename || '') + ' #' + sh.gi)) + ((total > 1) ? (' (' + (idx + 1) + '/' + total + ')') : '');
  return {
    name: name,
    mode: sh.mode || 'roll',
    canvas_json: JSON.stringify(canvas),
    placements_json: JSON.stringify(sh.placements),
    item_code: '', source_analysis_ids: JSON.stringify(aidList),
    sheet_count: 1, efficiency: Math.round((sh.eff || 0) * 1000) / 1000
  };
}

// ── R3b-2: 평판 다중판 EPS 분할 출력 ─────────────────────────────────
// 각 판(시트)을 별도 /sheets 잡으로 큐잉(판당 단일 시트=SheetLayout 단일 전제 보존) → 일괄 폴링 → ZIP.
//   ⚠️ 단일 시트 경로(iaeCanExportSheets 본체)·SheetLayout.jsx·주문 출력은 무변경. 다중판일 때만 이 경로.
var iaeCanMultiState = null; // {jobs:[{idx,name,sh,id,status,result,error}], total}
function iaeCanExportSheetsMulti(sheets) {
  var resHost = document.getElementById('iaeCanNestResult');
  var btn = document.getElementById('iaeCanExportBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>분할 저장 중…'; }
  var total = sheets.length;
  var jobs = sheets.map(function (sh, i) {
    return { idx: i, sh: sh, body: iaeCanSheetExportBody(sh, i, total), name: '', id: null, status: 'queued', result: null, error: null };
  });
  jobs.forEach(function (j) { j.name = j.body.name; });
  iaeCanMultiState = { jobs: jobs, total: total };
  iaeCanMultiRender('submit');
  iaeStopRenderPoll();
  // 순차 저장+렌더 요청(D1 부담·레이트리밋 회피). 폴링은 병렬.
  var chain = Promise.resolve();
  jobs.forEach(function (job) {
    chain = chain.then(function () {
      return axios.post('/api/workbench/sheets', job.body).then(function (res) {
        var d = res.data && res.data.data;
        if (!d || d.id == null) { job.status = 'error'; job.error = '저장 실패'; return; }
        job.id = d.id; job.status = 'rendering';
        return axios.post('/api/workbench/sheets/' + d.id + '/render').catch(function () { job.status = 'error'; job.error = '렌더 요청 실패'; });
      }).catch(function (err) {
        job.status = 'error'; job.error = (err.response && err.response.data && err.response.data.error) || '저장 실패';
      });
    });
  });
  chain.then(function () { iaeCanMultiRender('poll'); iaeCanMultiPoll(); });
}
function iaeCanMultiPoll() {
  var st = iaeCanMultiState; if (!st) return;
  var pending = st.jobs.filter(function (j) { return j.id != null && (j.status === 'queued' || j.status === 'rendering'); });
  if (!pending.length) { iaeCanMultiFinish(); return; }
  Promise.all(pending.map(function (job) {
    return axios.get('/api/workbench/sheets/' + job.id).then(function (res) {
      var d = (res.data && res.data.data) || {};
      if (d.render_status === 'done') { job.status = 'done'; try { job.result = d.render_result_json ? (typeof d.render_result_json === 'string' ? JSON.parse(d.render_result_json) : d.render_result_json) : {}; } catch (_e) { job.result = {}; } }
      else if (d.render_status === 'error') { job.status = 'error'; job.error = d.render_error || '렌더 실패'; }
    }).catch(function () { /* 일시 실패는 다음 폴에서 재시도 */ });
  })).then(function () {
    iaeCanMultiRender('poll');
    var still = st.jobs.some(function (j) { return j.id != null && (j.status === 'queued' || j.status === 'rendering'); });
    if (still) st.timer = setTimeout(iaeCanMultiPoll, 2000);
    else iaeCanMultiFinish();
  });
}
function iaeCanMultiFinish() {
  var st = iaeCanMultiState; if (!st) return;
  if (st.timer) { clearTimeout(st.timer); st.timer = null; }
  iaeCanResetExportBtn(document.getElementById('iaeCanExportBtn'));
  iaeCanMultiRender('done');
  var done = st.jobs.filter(function (j) { return j.status === 'done'; }).length;
  iaeToast('평판 다중판 출력: ' + done + '/' + st.total + ' 완료', done === st.total ? 'success' : 'warning');
}
function iaeCanMultiRender(phase) {
  var host = document.getElementById('iaeCanNestResult'); var st = iaeCanMultiState;
  if (!host || !st) return;
  var done = st.jobs.filter(function (j) { return j.status === 'done'; }).length;
  var errs = st.jobs.filter(function (j) { return j.status === 'error'; }).length;
  var html = '<div class="border border-gray-200 rounded-md p-2 bg-gray-50">';
  if (phase !== 'done') {
    html += '<div class="text-[11px] text-blue-600"><i class="fas fa-spinner fa-spin mr-1"></i>평판 다중판 ' + done + '/' + st.total + ' 출력'
      + (errs ? ' · <span class="text-red-500">실패 ' + errs + '</span>' : '') + '</div>';
  } else {
    html += '<div class="text-[11px] font-semibold ' + (errs ? 'text-amber-600' : 'text-green-700') + ' mb-1.5">'
      + '<i class="fas fa-circle-check mr-1"></i>평판 다중판 ' + done + '/' + st.total + ' 출력' + (errs ? ' · 실패 ' + errs : '') + '</div>';
    if (done > 0) html += '<button id="iaeCanMultiZip" class="w-full px-2 py-1 rounded bg-gray-800 text-white text-[11px] hover:bg-black"><i class="fas fa-file-zipper mr-1"></i>ZIP 받기 (' + done + '판)</button>';
  }
  html += '</div>';
  host.innerHTML = html;
  var zb = document.getElementById('iaeCanMultiZip');
  if (zb) zb.addEventListener('click', iaeCanMultiZip);
}
// 완료 판들의 EPS/JPG/DXF blob을 받아 zipSync로 묶어 다운로드(iaeBatchZip 패턴). 파일명 {yyyymmdd}_{사이즈}_{이름}_{n}.{kind}.
function iaeCanMultiZip() {
  var st = iaeCanMultiState; if (!st) return;
  var doneJobs = st.jobs.filter(function (j) { return j.status === 'done' && j.id != null; });
  if (!doneJobs.length) { iaeToast('받을 결과가 없습니다', 'error'); return; }
  var zb = document.getElementById('iaeCanMultiZip');
  if (zb) { zb.disabled = true; zb.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>ZIP 생성 중…'; }
  var kinds = ['eps', 'jpg', 'dxf'];
  iaeLoadFflate().then(function (fflate) {
    var files = {}, tasks = [];
    doneJobs.forEach(function (job) {
      var r = job.result || {};
      var base = iaeDownloadBase({ w_cm: r.width_cm, h_cm: r.height_cm, name: job.name }) + '_p' + (job.idx + 1);
      kinds.forEach(function (kind) {
        if (!r[kind + '_r2']) return;
        tasks.push(axios.get('/api/workbench/sheets/' + job.id + '/download?kind=' + kind, { responseType: 'arraybuffer' })
          .then(function (res) { files[base + '.' + kind] = new Uint8Array(res.data); })
          .catch(function () { /* 해당 kind 없음 — 스킵 */ }));
      });
    });
    return Promise.all(tasks).then(function () {
      var names = Object.keys(files);
      if (!names.length) { iaeToast('다운로드할 파일을 받지 못했습니다', 'error'); if (zb) { zb.disabled = false; zb.innerHTML = '<i class="fas fa-file-zipper mr-1"></i>ZIP 받기 (' + doneJobs.length + '판)'; } return; }
      var zipped = fflate.zipSync(files, { level: 6 });
      var blob = new Blob([zipped], { type: 'application/zip' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '네스팅평판_' + iaeKstYmd() + '.zip';
      document.body.appendChild(a); a.click();
      setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (_e) {} a.remove(); }, 1000);
      iaeToast(names.length + '개 파일 ZIP 다운로드', 'success');
      if (zb) { zb.disabled = false; zb.innerHTML = '<i class="fas fa-file-zipper mr-1"></i>ZIP 받기 (' + doneJobs.length + '판)'; }
    });
  }).catch(function (err) {
    iaeToast(err.message || 'ZIP 생성 실패', 'error');
    if (zb) { zb.disabled = false; zb.innerHTML = '<i class="fas fa-file-zipper mr-1"></i>ZIP 받기'; }
  });
}

// 패킹 결과 → 시트 메트릭(시트수·롤길이·시트면적) 계산. 부작용 없음. iaeNestEstimate/iaeNestPackBest 공용.
//   반환 {error?, msg?, packed, sheetCount, totalH, sheetArea}. 평판=다중판·롤=단일가변.
function iaeNestPackMetrics(mode, preset, items, availW, gap, margin, allowRotate, packer) {
  // R3b-1: packer 미지정/'shelf'=기존 iaeShelfBinPack(회귀 0). 'maxrects'일 때만 분기.
  var packed = (packer === 'maxrects')
    ? iaeMaxRectsPack(items, availW, gap, allowRotate)
    : iaeShelfBinPack(items, availW, gap, allowRotate);
  if (packed.error) return { error: true, msg: packed.msg };
  var sheetCount, totalH = 0, sheetArea = 0;
  if (mode === 'flatbed') {
    var availH = preset.h - margin * 2;
    if (availH <= 0) return { error: true, msg: '여백이 시트 높이보다 큽니다' };
    var byY = {};
    packed.placements.forEach(function (p) { (byY[p.y_cm] = byY[p.y_cm] || []).push(p); });
    var ys = Object.keys(byY).map(Number).sort(function (a, b) { return a - b; });
    var shelfH = function (arr) { var hh = 0; arr.forEach(function (p) { if (p.height_cm > hh) hh = p.height_cm; }); return hh; };
    for (var yi = 0; yi < ys.length; yi++) { if (shelfH(byY[ys[yi]]) > availH + 1e-6) return { error: true, msg: '조각이 시트 높이를 초과(' + Math.round(shelfH(byY[ys[yi]])) + 'cm)' }; }
    var nSheets = 1, curBottom = 0, first = true;
    ys.forEach(function (y) { var sh = shelfH(byY[y]); if (!first && (curBottom + gap + sh > availH + 1e-6)) { nSheets++; curBottom = 0; } var yLocal = first ? 0 : (curBottom === 0 ? 0 : curBottom + gap); curBottom = yLocal + sh; first = false; });
    sheetCount = nSheets;
    sheetArea = nSheets * preset.w * preset.h;
  } else {
    totalH = packed.total_height_cm + margin * 2;
    sheetCount = 1;
    sheetArea = preset.w * totalH;
  }
  return { error: false, packed: packed, sheetCount: sheetCount, totalH: totalH, sheetArea: sheetArea };
}
// R2-4: 회전 허용 시 두 방향(허용/방향고정) 시뮬 → 평판=판수 적은 쪽, 롤=총높이 짧은 쪽 자동 선택.
//   회전 비허용(allowRotate=false)이면 고정만. 반환=선택된 metrics + chosenAllowRotate.
function iaeNestPackBest(mode, preset, items, availW, gap, margin, allowRotate, packer) {
  var fixed = iaeNestPackMetrics(mode, preset, items, availW, gap, margin, false, packer);
  if (allowRotate === false) {
    if (fixed.error) return fixed;
    fixed.chosenAllowRotate = false; return fixed;
  }
  var rot = iaeNestPackMetrics(mode, preset, items, availW, gap, margin, true, packer);
  // 한쪽만 성공하면 그쪽. 둘 다 실패면 회전 결과(메시지) 반환.
  if (fixed.error && rot.error) return rot;
  if (fixed.error) { rot.chosenAllowRotate = true; return rot; }
  if (rot.error) { fixed.chosenAllowRotate = false; return fixed; }
  // 둘 다 성공: 평판=판수, 롤=총높이 비교(동률이면 회전 미사용 우선=단순).
  var rotBetter = (mode === 'flatbed')
    ? (rot.sheetCount < fixed.sheetCount)
    : (rot.totalH < fixed.totalH - 1e-6);
  var chosen = rotBetter ? rot : fixed;
  chosen.chosenAllowRotate = rotBetter;
  return chosen;
}
// ④ 배치 전 실시간 예상치 — iaeCanNestPlace 패킹 수학의 부작용 없는 드라이런(대지 미변경).
//    반환 {error?, msg?, eff, sheets, total_height_cm, waste_pct, allow_rotate}. 롤=가변높이 단일·평판=다중판.
//    R2-4: o.allow_rotate(기본 true)면 두 방향 시뮬 후 최적 방향 자동 선택.
function iaeNestEstimate(o) {
  var src = iaeCanSrc(o.key); if (!src) return { error: true, msg: '그룹을 선택하세요' };
  var origW = src.w_mm || 0, origH = src.h_mm || 0;
  var dwCm = (Number(o.target_w) > 0) ? Number(o.target_w) : origW / 10;
  var dhCm = (Number(o.target_h) > 0) ? Number(o.target_h) : origH / 10;
  if (dwCm <= 0 || dhCm <= 0) return { error: true, msg: '그룹 크기를 알 수 없습니다' };
  var qty = Math.max(1, parseInt(o.qty, 10) || 1);
  var presets = iaePresetsFor(o.mode);
  var preset = presets[o.presetIdx] || presets[0];
  var margin = Number(o.margin) || 0, gap = Number(o.gap) || 0;
  var availW = preset.w - margin * 2;
  if (availW <= 0) return { error: true, msg: '여백이 시트 폭보다 큽니다' };
  var items = [];
  for (var q = 0; q < qty; q++) items.push({ id: 'p' + q, w: dwCm, h: dhCm });
  var allowRotate = (o.allow_rotate !== false);
  var m = iaeNestPackBest(o.mode, preset, items, availW, gap, margin, allowRotate, o.packer); // R3b-1 packer
  if (m.error) return { error: true, msg: m.msg };
  var totalArea = dwCm * dhCm * qty;
  var eff = m.sheetArea > 0 ? totalArea / m.sheetArea : 0;
  return {
    error: false, eff: eff, sheets: m.sheetCount, total_height_cm: m.totalH,
    waste_pct: Math.max(0, 1 - eff), mode: o.mode,
    allow_rotate: allowRotate, chosen_rotate: !!m.chosenAllowRotate,
    packer: (o.packer === 'maxrects' ? 'maxrects' : 'shelf')
  };
}
// 패널 하단 예상치 호스트 갱신 (입력 change 시 라이브)
function iaeNestRenderEstimate() {
  var host = document.getElementById('iaeCanNestEst'); if (!host) return;
  var o = iaeCanNestOpts;
  var gEl = document.getElementById('iaeCanNestGroup'); if (gEl) o.key = gEl.value;
  var pkEl = document.getElementById('iaeCanNestPacker'); if (pkEl) o.packer = (pkEl.value === 'maxrects') ? 'maxrects' : 'shelf'; // R3b-1
  var est = iaeNestEstimate(o);
  if (est.error) { host.innerHTML = '<div class="text-[11px] text-amber-600"><i class="fas fa-triangle-exclamation mr-1"></i>' + iaeEscape(est.msg) + '</div>'; return; }
  var effPct = Math.round(est.eff * 100), wastePct = Math.round(est.waste_pct * 100);
  var sizeTxt = est.mode === 'flatbed' ? ('예상 <b>' + est.sheets + '판</b>') : ('예상 롤 길이 <b>' + est.total_height_cm.toFixed(1) + 'cm</b> (1롤)');
  var effCls = effPct >= 75 ? 'text-green-600' : (effPct >= 50 ? 'text-amber-600' : 'text-red-500');
  // R2-4: 회전 자동 선택 결과(허용 시 회전/방향고정 중 더 나은 쪽)
  var rotTxt = est.allow_rotate ? (est.chosen_rotate ? ' · <span class="text-blue-500">회전 배치</span>' : ' · <span class="text-gray-500">방향 고정</span>') : ' · <span class="text-gray-500">회전 잠금</span>';
  var pkTxt = (est.packer === 'maxrects') ? ' · <span class="text-blue-500">MaxRects</span>' : ''; // R3b-1: shelf(기본)는 미표기(현행 UI 유지)
  host.innerHTML = '<div class="text-[11px] text-gray-600"><i class="fas fa-chart-area mr-1 text-blue-500"></i>'
    + sizeTxt + ' · 효율 <b class="' + effCls + '">' + effPct + '%</b> · 자투리 ' + wastePct + '%' + rotTxt + pkTxt + '</div>';
}

function iaeCanRenderNestPanel() {
  var host = document.getElementById('iaeCanInspector'); if (!host) return;
  host.classList.remove('hidden');
  var o = iaeCanNestOpts;
  var groups = iaeCanAllGroups();
  var inputCls = 'border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  var selCls = 'w-full ' + inputCls;
  if (groups.length === 0) {
    host.innerHTML = iaeCanSubModeTabsHTML()
      + '<div class="flex items-center justify-between mb-2"><span class="text-sm font-semibold text-gray-700"><i class="fas fa-layer-group mr-1 text-blue-500"></i>시트 네스팅</span>'
      + '<button id="iaeCanNestClose" class="text-gray-400 hover:text-gray-600 text-xs"><i class="fas fa-xmark"></i></button></div>'
      + '<div class="text-xs text-gray-400">완료된 분석 그룹이 없습니다.</div>';
    iaeCanBindSubModeTabs(host);
    var ce = document.getElementById('iaeCanNestClose'); if (ce) ce.addEventListener('click', function () { host.classList.add('hidden'); host.innerHTML = ''; });
    return;
  }
  if (!o.key || !iaeCanSrc(o.key)) o.key = groups[0].key;
  var curSrc = iaeCanSrc(o.key) || {};
  var curW = Math.round((curSrc.w_mm || 0) / 10), curH = Math.round((curSrc.h_mm || 0) / 10);
  var presets = iaePresetsFor(o.mode); // R2-2 기본+커스텀
  if (o.presetIdx >= presets.length) o.presetIdx = 0;
  var groupOpts = groups.map(function (s) { return '<option value="' + s.key + '"' + (s.key === o.key ? ' selected' : '') + '>' + iaeEscape(s.filename) + ' #' + s.gi + ' (' + Math.round((s.w_mm || 0) / 10) + '×' + Math.round((s.h_mm || 0) / 10) + 'cm)</option>'; }).join('');
  // R2-2: 규격 옵션 = 기본+커스텀 프리셋 + '직접 입력'(value=__custom)
  var presetOpts = presets.map(function (p, i) { return '<option value="' + i + '"' + (i === o.presetIdx ? ' selected' : '') + '>' + iaeEscape(p.label) + (p._custom ? ' ★' : '') + '</option>'; }).join('')
    + '<option value="__custom"' + (o.presetIdx === '__custom' ? ' selected' : '') + '>직접 입력…</option>';
  host.innerHTML = iaeCanSubModeTabsHTML()
    + '<div class="mb-2"><span class="text-sm font-semibold text-gray-700"><i class="fas fa-layer-group mr-1 text-blue-500"></i>시트 네스팅</span></div>'
    + '<div class="text-[11px] text-gray-400 mb-3">동일 품목(그룹) 다수를 시트에 자동 배치</div>'
    + '<div class="space-y-3">'
    + '<div><label class="block text-xs text-gray-500 mb-1">대상 그룹 (동일 품목)</label><select id="iaeCanNestGroup" class="' + selCls + '">' + groupOpts + '</select></div>'
    + '<div class="grid grid-cols-2 gap-2">'
    + '<div><label class="block text-xs text-gray-500 mb-1">수량</label><input id="iaeCanNestQty" type="number" min="1" step="1" value="' + o.qty + '" class="w-full ' + inputCls + '"></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">모드</label><select id="iaeCanNestMode" class="' + selCls + '"><option value="roll"' + (o.mode === 'roll' ? ' selected' : '') + '>롤(폭고정)</option><option value="flatbed"' + (o.mode === 'flatbed' ? ' selected' : '') + '>평판(W×H)</option></select></div>'
    + '</div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">규격</label><select id="iaeCanNestPreset" class="' + selCls + '">' + presetOpts + '</select></div>'
    // R2-2: 직접 입력(규격 select=직접 입력 선택 시 노출). 롤=폭만, 평판=W×H. 저장 시 커스텀 프리셋에 추가.
    + '<div id="iaeCanNestCustom" class="' + (o.presetIdx === '__custom' ? '' : 'hidden') + ' bg-gray-50 border border-gray-200 rounded-md p-2">'
    + '<div class="text-[11px] text-gray-500 mb-1">' + (o.mode === 'flatbed' ? '평판 규격 직접 입력 (W×H cm)' : '롤 폭 직접 입력 (cm)') + '</div>'
    + '<div class="flex items-center gap-2">'
    + '<input id="iaeCanNestCustW" type="number" min="1" step="0.1" placeholder="폭" value="' + (o.custom_w || '') + '" class="w-20 ' + inputCls + '">'
    + (o.mode === 'flatbed' ? '<span class="text-gray-400">×</span><input id="iaeCanNestCustH" type="number" min="1" step="0.1" placeholder="높이" value="' + (o.custom_h || '') + '" class="w-20 ' + inputCls + '">' : '<span class="text-[11px] text-gray-400">cm 폭</span>')
    + '<button id="iaeCanNestCustSave" type="button" class="ml-auto text-[11px] px-2 py-1 rounded bg-gray-800 text-white hover:bg-black"><i class="fas fa-plus mr-1"></i>규격 저장</button>'
    + '</div></div>'
    + '<div class="grid grid-cols-2 gap-2">'
    + '<div><label class="block text-xs text-gray-500 mb-1">간격(cm)</label><input id="iaeCanNestGap" type="number" min="0" step="0.1" value="' + o.gap + '" class="w-full ' + inputCls + '"></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">돔보 여백(cm)</label><input id="iaeCanNestMargin" type="number" min="0" step="0.1" value="' + o.margin + '" class="w-full ' + inputCls + '"></div>'
    + '</div>'
    // R2-4: 회전 허용(방향성 소재 보호). on=두 방향 시뮬 후 자동 선택, off=원본 방향 고정.
    + '<label class="flex items-center gap-1 text-xs text-gray-600 cursor-pointer"><input id="iaeCanNestAllowRot" type="checkbox"' + (o.allow_rotate !== false ? ' checked' : '') + '>회전 허용 <span class="text-gray-400">(끄면 방향성 소재 보호 — 원본 방향 고정)</span></label>'
    // R3b-1: 패킹 알고리즘 — 선반(기본·현행)/MaxRects(빈공간 재활용·촘촘). 기본 shelf=기존 배치와 동일.
    + '<div><label class="block text-xs text-gray-500 mb-1">패킹 알고리즘</label><select id="iaeCanNestPacker" class="' + selCls + '">'
    + '<option value="shelf"' + (o.packer !== 'maxrects' ? ' selected' : '') + '>선반 (기본)</option>'
    + '<option value="maxrects"' + (o.packer === 'maxrects' ? ' selected' : '') + '>MaxRects (촘촘·빈공간 재활용)</option>'
    + '</select></div>'
    + '<div class="grid grid-cols-3 gap-2">'
    + '<div><label class="block text-xs text-gray-500 mb-1">조각 W(cm)</label><input id="iaeCanNestTW" type="number" min="0" step="0.1" value="' + (o.target_w || '') + '" placeholder="' + curW + '" class="w-full ' + inputCls + '"></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">조각 H(cm)</label><input id="iaeCanNestTH" type="number" min="0" step="0.1" value="' + (o.target_h || '') + '" placeholder="' + curH + '" class="w-full ' + inputCls + '"></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">파일 1/N</label><input id="iaeCanNestFS" type="number" min="1" step="1" value="' + (o.file_scale || 1) + '" class="w-full ' + inputCls + '"></div>'
    + '</div>'
    + '<label class="flex items-center gap-1 text-xs text-gray-600 cursor-pointer"><input id="iaeCanNestRatio" type="checkbox"' + (o.ratio_lock !== false ? ' checked' : '') + '>비율 잠금 (조각 W↔H 검출 종횡비 유지)</label>'
    + '<div class="text-[11px] text-gray-400">조각 크기 비우면 검출 크기로 배치(스케일). 파일 1/N = 소스가 실제의 1/N(현수막 축소본 등)</div>'
    + '<div id="iaeCanNestEst" class="bg-blue-50 border border-blue-100 rounded-md px-2 py-1.5"></div>' // ④ 배치 전 실시간 예상치
    + '<button id="iaeCanNestRun" class="w-full px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-sm"><i class="fas fa-table-cells mr-1"></i>자동 배치</button>'
    + '<div class="text-[11px] text-gray-400">설정(수량·규격·회전 등)을 바꾸고 다시 누르면 재배치됩니다. 조각 개별 드래그는 없습니다.</div>'
    // (§4.1) 출력(EPS, 주문 없이) / 주문 보내기 — 둘 다 자동 배치 결과 사용
    + '<div class="border-t border-gray-100 pt-2 mt-1 space-y-2">'
    + '<button id="iaeCanPreviewBtn" class="w-full px-3 py-2 rounded-md border border-blue-400 text-blue-700 hover:bg-blue-50 text-sm"><i class="fas fa-eye mr-1"></i>실제 렌더</button>'
    + '<button id="iaeCanExportBtn" class="w-full px-3 py-2 rounded-md bg-gray-800 text-white hover:bg-black text-sm"><i class="fas fa-file-export mr-1"></i>EPS 출력</button>'
    + '<button id="iaeNestOrderBtn" class="w-full px-3 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 text-sm"><i class="fas fa-file-invoice mr-1"></i>주문 보내기</button>'
    + '<div class="text-[11px] text-gray-400">실제 렌더 = 출력 전 실물 판 JPG 확인. EPS = 주문 없이 시트 받기(단일 시트, 평판 다중판 분할). 주문 보내기 = 거래처·품목 지정.</div>'
    + '<div id="iaeCanNestResult"></div>'
    + '</div>'
    + '</div>';
  var bindVal = function (id, prop, parse, estimate) { var el = document.getElementById(id); if (el) el.addEventListener('change', function () { o[prop] = parse ? parse(el.value) : el.value; if (estimate) iaeNestRenderEstimate(); }); };
  var modeEl = document.getElementById('iaeCanNestMode');
  if (modeEl) modeEl.addEventListener('change', function () { o.mode = modeEl.value; o.presetIdx = 0; iaeCanRenderNestPanel(); });
  bindVal('iaeCanNestGroup', 'key', null, true);
  bindVal('iaeCanNestQty', 'qty', function (v) { return parseInt(v, 10) || 1; }, true);
  // R2-2: 규격 select — '직접 입력' 선택 시 입력 row 노출(재렌더 없이 토글), 아니면 인덱스 적용.
  var presetEl = document.getElementById('iaeCanNestPreset');
  var customRow = document.getElementById('iaeCanNestCustom');
  if (presetEl) presetEl.addEventListener('change', function () {
    if (presetEl.value === '__custom') {
      o.presetIdx = '__custom';
      if (customRow) customRow.classList.remove('hidden');
    } else {
      o.presetIdx = parseInt(presetEl.value, 10) || 0;
      if (customRow) customRow.classList.add('hidden');
      iaeNestRenderEstimate();
    }
  });
  // R2-2: 커스텀 규격 저장 → 프리셋 목록에 append + 자동 선택 후 재렌더.
  var custSaveEl = document.getElementById('iaeCanNestCustSave');
  if (custSaveEl) custSaveEl.addEventListener('click', function () {
    var w = parseFloat((document.getElementById('iaeCanNestCustW') || {}).value) || 0;
    var h = (o.mode === 'flatbed') ? (parseFloat((document.getElementById('iaeCanNestCustH') || {}).value) || 0) : 0;
    if (w <= 0 || (o.mode === 'flatbed' && h <= 0)) { iaeToast('규격(' + (o.mode === 'flatbed' ? 'W×H' : '폭') + ')을 입력하세요', 'error'); return; }
    var idx = iaeAddCustomPreset(o.mode, w, h);
    if (idx < 0) { iaeToast('규격 추가 실패', 'error'); return; }
    o.presetIdx = idx; o.custom_w = ''; o.custom_h = '';
    iaeToast('규격 저장: ' + (o.mode === 'flatbed' ? (w + '×' + h) : (w + 'cm 롤')), 'success');
    iaeCanRenderNestPanel();
  });
  bindVal('iaeCanNestGap', 'gap', function (v) { return parseFloat(v) || 0; }, true);
  bindVal('iaeCanNestMargin', 'margin', function (v) { return parseFloat(v) || 0; }, true);
  // R2-4: 회전 허용 토글
  var allowRotEl = document.getElementById('iaeCanNestAllowRot');
  if (allowRotEl) allowRotEl.addEventListener('change', function () {
    o.allow_rotate = allowRotEl.checked;
    if (!allowRotEl.checked) iaeToast('회전 비허용 — 방향성 소재 보호(원본 방향 고정)', 'info');
    iaeNestRenderEstimate();
  });
  // R3b-1: 패킹 알고리즘 select → o.packer, 예상치 갱신
  var packerEl = document.getElementById('iaeCanNestPacker');
  if (packerEl) packerEl.addEventListener('change', function () {
    o.packer = (packerEl.value === 'maxrects') ? 'maxrects' : 'shelf';
    if (o.packer === 'maxrects') iaeToast('MaxRects — 빈 공간을 재활용해 더 촘촘히 배치합니다', 'info');
    iaeNestRenderEstimate();
  });
  // ② 비율 잠금: 조각 W↔H 검출 종횡비 유지 (인스펙터 applySize 패턴 포팅). 단순 parseFloat 독립저장이 왜곡 원인.
  var nestTW = document.getElementById('iaeCanNestTW'), nestTH = document.getElementById('iaeCanNestTH');
  var nestRatioEl = document.getElementById('iaeCanNestRatio');
  if (nestRatioEl) nestRatioEl.addEventListener('change', function () { o.ratio_lock = nestRatioEl.checked; if (!nestRatioEl.checked) iaeToast('비율잠금 해제 — 조각 W/H를 따로 지정하면 늘어남이 발생할 수 있습니다', 'warning'); }); // ⑥
  // 현재 선택 그룹의 검출 종횡비 (그룹 변경 시 패널 미재렌더 → 입력 시점 재조회)
  function nestDetAspect() { var src = iaeCanSrc(document.getElementById('iaeCanNestGroup').value) || curSrc; return (src && src.w_mm && src.h_mm) ? (src.w_mm / src.h_mm) : 0; }
  if (nestTW) nestTW.addEventListener('input', function () {
    o.target_w = parseFloat(nestTW.value) || 0;
    var a = nestDetAspect();
    if (nestRatioEl && nestRatioEl.checked && a > 0 && o.target_w > 0) { o.target_h = Math.round((o.target_w / a) * 10) / 10; if (nestTH) nestTH.value = o.target_h; }
    iaeNestRenderEstimate(); // ④
  });
  if (nestTH) nestTH.addEventListener('input', function () {
    o.target_h = parseFloat(nestTH.value) || 0;
    var a = nestDetAspect();
    if (nestRatioEl && nestRatioEl.checked && a > 0 && o.target_h > 0) { o.target_w = Math.round((o.target_h * a) * 10) / 10; if (nestTW) nestTW.value = o.target_w; }
    iaeNestRenderEstimate(); // ④
  });
  var runEl = document.getElementById('iaeCanNestRun');
  if (runEl) runEl.addEventListener('click', function () {
    o.key = document.getElementById('iaeCanNestGroup').value;
    o.qty = parseInt(document.getElementById('iaeCanNestQty').value, 10) || 1;
    o.mode = document.getElementById('iaeCanNestMode').value;
    // R2-2: '직접 입력' 상태로 배치 시도 시 규격 미확정 → 안내(저장 버튼 유도)
    var pv = document.getElementById('iaeCanNestPreset').value;
    if (pv === '__custom') { iaeToast('직접 입력 규격은 [규격 저장] 후 사용하세요', 'error'); return; }
    o.presetIdx = parseInt(pv, 10) || 0;
    o.gap = parseFloat(document.getElementById('iaeCanNestGap').value) || 0;
    o.margin = parseFloat(document.getElementById('iaeCanNestMargin').value) || 0;
    o.target_w = parseFloat(document.getElementById('iaeCanNestTW').value) || 0;
    o.target_h = parseFloat(document.getElementById('iaeCanNestTH').value) || 0;
    o.file_scale = parseFloat(document.getElementById('iaeCanNestFS').value) || 1;
    if (nestRatioEl) o.ratio_lock = nestRatioEl.checked;
    if (allowRotEl) o.allow_rotate = allowRotEl.checked; // R2-4
    if (packerEl) o.packer = (packerEl.value === 'maxrects') ? 'maxrects' : 'shelf'; // R3b-1
    iaeCanNestPlace(o);
  });
  var pvEl = document.getElementById('iaeCanPreviewBtn'); // P3-b: 실제 렌더 미리보기
  if (pvEl) pvEl.addEventListener('click', iaeCanPreviewRender);
  var exportEl = document.getElementById('iaeCanExportBtn');
  if (exportEl) exportEl.addEventListener('click', iaeCanExportSheets);
  var orderEl = document.getElementById('iaeNestOrderBtn'); // W5: 주문 보내기(자동배치 결과)
  if (orderEl) orderEl.addEventListener('click', iaeCanOpenOrderModal);
  iaeCanBindSubModeTabs(host); // P2: 네스팅↔모아찍기 전환
  iaeNestRenderEstimate(); // ④ 패널 열릴 때 초기 예상치
}

// ════════════════════════════════════════════════════════════════
// P2 임포지션(모아찍기) 패널 — 다중선택 팔레트 + 조각별 배율/개수/도련 + 자동 패킹
//   출력은 P1 배관 재사용(iaeCanExportSheets: placement별 analysis_id → 소스별 복제). Export-first(주문 미생성).
// ════════════════════════════════════════════════════════════════
// 선택 조각 크기·파일명을 현재 그룹에서 갱신(파일 재분석/재오픈 대비). 없어진 그룹은 저장값 유지.
function iaeImposeRefreshSel() {
  var g = iaeCanAllGroups(), byKey = {};
  g.forEach(function (x) { byKey[x.key] = x; });
  iaeImposeSel.forEach(function (s) {
    var m = byKey[s.key];
    if (m) { s.w_mm = m.w_mm; s.h_mm = m.h_mm; s.filename = m.filename; s.fid = m.fid; s.gi = m.gi; }
  });
}
// 패킹 아이템 배열 빌드 — 조각별 (원본×배율)+도련여백. id로 소스(fid/gi/artW/artH/bleed) 역매핑.
function iaeImposeBuildItems() {
  var items = [], meta = {}, err = null;
  iaeImposeSel.forEach(function (s) {
    var scale = Math.max(0.1, Number(s.scale) || 1);
    var qty = Math.max(1, parseInt(s.qty, 10) || 1);
    var bleed = Math.max(0, Number(s.bleed) || 0);
    var artW = (s.w_mm || 0) / 10 * scale, artH = (s.h_mm || 0) / 10 * scale; // 배치 아트워크 크기(cm)
    if (artW <= 0 || artH <= 0) { err = err || ('크기를 알 수 없는 조각: ' + s.filename + ' #' + s.gi); return; }
    for (var q = 0; q < qty; q++) {
      var id = 'i' + s.fid + '_' + s.gi + '_' + q;
      items.push({ id: id, w: artW + bleed * 2, h: artH + bleed * 2 }); // 도련=조각 사이 재단여백(패킹 footprint만 확장)
      meta[id] = { fid: s.fid, gi: s.gi, key: s.key, filename: s.filename, artW: artW, artH: artH, bleed: bleed };
    }
  });
  return { items: items, meta: meta, error: err };
}
// 배치 전 예상치(부작용 없는 드라이런) — iaeNestPackBest 재사용.
function iaeImposeEstimate() {
  if (!iaeImposeSel.length) return { error: true, msg: '아트보드를 선택하세요' };
  var built = iaeImposeBuildItems();
  if (built.error) return { error: true, msg: built.error };
  if (!built.items.length) return { error: true, msg: '배치할 조각이 없습니다' };
  var o = iaeImposeOpts;
  if (o.presetIdx === '__custom') return { error: true, msg: '규격을 저장 후 사용하세요' };
  var presets = iaePresetsFor(o.mode);
  var preset = presets[o.presetIdx] || presets[0];
  var margin = Number(o.margin) || 0, gap = Number(o.gap) || 0;
  var availW = preset.w - margin * 2;
  if (availW <= 0) return { error: true, msg: '여백이 시트 폭보다 큽니다' };
  var allowRotate = (o.allow_rotate !== false);
  var m = iaeNestPackBest(o.mode, preset, built.items, availW, gap, margin, allowRotate, o.packer);
  if (m.error) return { error: true, msg: m.msg };
  var footprint = 0; built.items.forEach(function (it) { footprint += it.w * it.h; });
  var eff = m.sheetArea > 0 ? footprint / m.sheetArea : 0;
  var srcs = {}; iaeImposeSel.forEach(function (s) { srcs[s.fid] = true; });
  return { error: false, eff: eff, sheets: m.sheetCount, total_height_cm: m.totalH, waste_pct: Math.max(0, 1 - eff),
    mode: o.mode, allow_rotate: allowRotate, chosen_rotate: !!m.chosenAllowRotate, packer: (o.packer === 'maxrects' ? 'maxrects' : 'shelf'),
    pieces: built.items.length, sources: Object.keys(srcs).length };
}
function iaeImposeRenderEstimate() {
  var host = document.getElementById('iaeImpEst'); if (!host) return;
  var est = iaeImposeEstimate();
  if (est.error) { host.innerHTML = '<div class="text-[11px] text-amber-600"><i class="fas fa-triangle-exclamation mr-1"></i>' + iaeEscape(est.msg) + '</div>'; return; }
  var effPct = Math.round(est.eff * 100), wastePct = Math.round(est.waste_pct * 100);
  var sizeTxt = est.mode === 'flatbed' ? ('예상 <b>' + est.sheets + '판</b>') : ('예상 롤 길이 <b>' + est.total_height_cm.toFixed(1) + 'cm</b>');
  var effCls = effPct >= 75 ? 'text-green-600' : (effPct >= 50 ? 'text-amber-600' : 'text-red-500');
  var rotTxt = est.allow_rotate ? (est.chosen_rotate ? ' · <span class="text-blue-500">회전 배치</span>' : ' · <span class="text-gray-500">방향 고정</span>') : ' · <span class="text-gray-500">회전 잠금</span>';
  var pkTxt = (est.packer === 'maxrects') ? ' · <span class="text-blue-500">MaxRects</span>' : '';
  var srcTxt = est.sources > 1 ? (' · ' + est.sources + '개 소스') : '';
  host.innerHTML = '<div class="text-[11px] text-gray-600"><i class="fas fa-chart-area mr-1 text-blue-500"></i>조각 ' + est.pieces + '개' + srcTxt + ' · ' + sizeTxt + ' · 효율 <b class="' + effCls + '">' + effPct + '%</b> · 자투리 ' + wastePct + '%' + rotTxt + pkTxt + '</div>';
}

function iaeImposeRenderPanel() {
  var host = document.getElementById('iaeCanInspector'); if (!host) return;
  host.classList.remove('hidden');
  iaeImposeRefreshSel();
  var o = iaeImposeOpts;
  var groups = iaeCanAllGroups();
  var inputCls = 'border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  var selCls = 'w-full ' + inputCls;
  var selKeys = {}; iaeImposeSel.forEach(function (s) { selKeys[s.key] = true; });

  // ── 팔레트: 모든 done 그룹 체크박스 다중선택 ──
  var paletteHTML;
  if (!groups.length) {
    paletteHTML = '<div class="text-xs text-gray-400">완료된 분석 그룹이 없습니다. <b>파일 처리</b> 탭에서 업로드·추출하세요.</div>';
  } else {
    paletteHTML = '<div class="space-y-1.5 max-h-56 overflow-y-auto pr-1 border border-gray-100 rounded-md p-1.5 bg-gray-50/40">' + groups.map(function (g) {
      var on = !!selKeys[g.key];
      var wc = Math.round((g.w_mm || 0) / 10), hc = Math.round((g.h_mm || 0) / 10);
      var thumb = g.thumb
        ? '<img src="' + iaeThumbSrc(g.thumb) + '" class="w-8 h-8 object-contain rounded border border-gray-200 bg-white flex-shrink-0" alt="">'
        : '<div class="w-8 h-8 rounded border border-gray-200 bg-white flex items-center justify-center flex-shrink-0"><i class="fas fa-image text-gray-300 text-xs"></i></div>';
      return '<label class="flex items-center gap-2 p-1 rounded-md cursor-pointer border ' + (on ? 'border-blue-300 bg-blue-50' : 'border-transparent hover:bg-white') + '">'
        + '<input type="checkbox" class="iae-imp-pick" data-key="' + g.key + '"' + (on ? ' checked' : '') + '>'
        + thumb
        + '<div class="min-w-0 flex-1"><div class="text-[11px] font-medium text-gray-700 truncate" title="' + iaeEscape(g.filename) + ' #' + g.gi + '">' + iaeEscape(g.filename) + ' #' + g.gi + '</div>'
        + '<div class="text-[10px] text-gray-400">' + wc + '×' + hc + 'cm</div></div>'
        + '</label>';
    }).join('') + '</div>';
  }

  // ── 선택 조각 인스펙터: 조각별 배율/개수/도련 ──
  var inspHTML;
  if (!iaeImposeSel.length) {
    inspHTML = '<div class="text-[11px] text-gray-400">위에서 아트보드를 선택하면 조각별 배율·개수·도련을 설정합니다.</div>';
  } else {
    inspHTML = '<div class="space-y-2">' + iaeImposeSel.map(function (s, i) {
      var wc = Math.round((s.w_mm || 0) / 10), hc = Math.round((s.h_mm || 0) / 10);
      var scale = Math.max(0.1, Number(s.scale) || 1);
      var placedW = Math.round(wc * scale * 10) / 10, placedH = Math.round(hc * scale * 10) / 10;
      return '<div class="border border-gray-200 rounded-md p-2 bg-white">'
        + '<div class="flex items-center gap-1 mb-1"><span class="text-[11px] font-medium text-gray-700 truncate flex-1" title="' + iaeEscape(s.filename) + ' #' + s.gi + '">' + iaeEscape(s.filename) + ' #' + s.gi + ' <span class="text-gray-400 font-normal">' + wc + '×' + hc + 'cm</span></span>'
        + '<button type="button" class="iae-imp-del text-gray-400 hover:text-red-500 text-xs" data-i="' + i + '"><i class="fas fa-xmark"></i></button></div>'
        + '<div class="grid grid-cols-3 gap-1">'
        + '<div><label class="block text-[10px] text-gray-400 mb-0.5">배율 ×</label><input type="number" min="0.1" step="0.1" value="' + scale + '" class="iae-imp-scale w-full ' + inputCls + '" data-i="' + i + '"></div>'
        + '<div><label class="block text-[10px] text-gray-400 mb-0.5">개수</label><input type="number" min="1" step="1" value="' + (Math.max(1, parseInt(s.qty, 10) || 1)) + '" class="iae-imp-qty w-full ' + inputCls + '" data-i="' + i + '"></div>'
        + '<div><label class="block text-[10px] text-gray-400 mb-0.5">도련cm</label><input type="number" min="0" step="0.1" value="' + (Math.max(0, Number(s.bleed) || 0)) + '" class="iae-imp-bleed w-full ' + inputCls + '" data-i="' + i + '"></div>'
        + '</div>'
        + '<div class="text-[10px] text-gray-400 mt-0.5">배치 ' + placedW + '×' + placedH + 'cm × ' + (Math.max(1, parseInt(s.qty, 10) || 1)) + '개</div>'
        + '</div>';
    }).join('') + '</div>';
  }

  // ── 판규격 옵션 (기존 프리셋 재사용) ──
  var presets = iaePresetsFor(o.mode);
  if (o.presetIdx !== '__custom' && o.presetIdx >= presets.length) o.presetIdx = 0;
  var presetOpts = presets.map(function (p, i) { return '<option value="' + i + '"' + (i === o.presetIdx ? ' selected' : '') + '>' + iaeEscape(p.label) + (p._custom ? ' ★' : '') + '</option>'; }).join('')
    + '<option value="__custom"' + (o.presetIdx === '__custom' ? ' selected' : '') + '>직접 입력…</option>';

  host.innerHTML = iaeCanSubModeTabsHTML()
    + '<div class="mb-1"><span class="text-sm font-semibold text-gray-700"><i class="fas fa-table-cells-large mr-1 text-blue-500"></i>모아찍기 (임포지션)</span></div>'
    + '<div class="text-[11px] text-gray-400 mb-2">여러 파일 아트보드를 골라 한 판에 모아 배치·출력</div>'
    + '<div class="text-xs text-gray-500 mb-1 font-medium">아트보드 선택 <span class="text-gray-400 font-normal">(선택 ' + iaeImposeSel.length + ')</span></div>'
    + paletteHTML
    + '<div class="text-xs text-gray-500 mt-3 mb-1 font-medium">조각별 설정</div>'
    + inspHTML
    + '<div class="border-t border-gray-100 pt-3 mt-3 space-y-2">'
    + '<div class="grid grid-cols-2 gap-2">'
    + '<div><label class="block text-xs text-gray-500 mb-1">모드</label><select id="iaeImpMode" class="' + selCls + '"><option value="roll"' + (o.mode === 'roll' ? ' selected' : '') + '>롤(폭고정)</option><option value="flatbed"' + (o.mode === 'flatbed' ? ' selected' : '') + '>평판(W×H)</option></select></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">규격</label><select id="iaeImpPreset" class="' + selCls + '">' + presetOpts + '</select></div>'
    + '</div>'
    + '<div id="iaeImpCustom" class="' + (o.presetIdx === '__custom' ? '' : 'hidden') + ' bg-gray-50 border border-gray-200 rounded-md p-2">'
    + '<div class="text-[11px] text-gray-500 mb-1">' + (o.mode === 'flatbed' ? '평판 규격 (W×H cm)' : '롤 폭 (cm)') + '</div>'
    + '<div class="flex items-center gap-2">'
    + '<input id="iaeImpCustW" type="number" min="1" step="0.1" placeholder="폭" value="' + (o.custom_w || '') + '" class="w-20 ' + inputCls + '">'
    + (o.mode === 'flatbed' ? '<span class="text-gray-400">×</span><input id="iaeImpCustH" type="number" min="1" step="0.1" placeholder="높이" value="' + (o.custom_h || '') + '" class="w-20 ' + inputCls + '">' : '<span class="text-[11px] text-gray-400">cm 폭</span>')
    + '<button id="iaeImpCustSave" type="button" class="ml-auto text-[11px] px-2 py-1 rounded bg-gray-800 text-white hover:bg-black"><i class="fas fa-plus mr-1"></i>규격 저장</button>'
    + '</div></div>'
    + '<div class="grid grid-cols-2 gap-2">'
    + '<div><label class="block text-xs text-gray-500 mb-1">간격(cm)</label><input id="iaeImpGap" type="number" min="0" step="0.1" value="' + o.gap + '" class="w-full ' + inputCls + '"></div>'
    + '<div><label class="block text-xs text-gray-500 mb-1">돔보 여백(cm)</label><input id="iaeImpMargin" type="number" min="0" step="0.1" value="' + o.margin + '" class="w-full ' + inputCls + '"></div>'
    + '</div>'
    + '<label class="flex items-center gap-1 text-xs text-gray-600 cursor-pointer"><input id="iaeImpAllowRot" type="checkbox"' + (o.allow_rotate !== false ? ' checked' : '') + '>회전 허용 <span class="text-gray-400">(끄면 방향 고정)</span></label>'
    + '<div><label class="block text-xs text-gray-500 mb-1">패킹 알고리즘</label><select id="iaeImpPacker" class="' + selCls + '">'
    + '<option value="shelf"' + (o.packer !== 'maxrects' ? ' selected' : '') + '>선반 (기본)</option>'
    + '<option value="maxrects"' + (o.packer === 'maxrects' ? ' selected' : '') + '>MaxRects (촘촘·빈공간 재활용)</option></select></div>'
    + '<div class="text-[11px] text-gray-400">도련 = 조각 사이 재단여백(아트워크 원본크기 유지). 재단선은 DXF 조각 외곽선으로 출력됩니다.</div>'
    + '<div id="iaeImpEst" class="bg-blue-50 border border-blue-100 rounded-md px-2 py-1.5"></div>'
    + '<button id="iaeImpRun" class="w-full px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-sm"><i class="fas fa-table-cells mr-1"></i>자동 배치</button>'
    + '<div class="border-t border-gray-100 pt-2 mt-1 space-y-2">'
    + '<button id="iaeCanPreviewBtn" class="w-full px-3 py-2 rounded-md border border-blue-400 text-blue-700 hover:bg-blue-50 text-sm"><i class="fas fa-eye mr-1"></i>실제 렌더</button>'
    + '<button id="iaeCanExportBtn" class="w-full px-3 py-2 rounded-md bg-gray-800 text-white hover:bg-black text-sm"><i class="fas fa-file-export mr-1"></i>EPS 출력</button>'
    + '<div class="text-[11px] text-gray-400">실제 렌더 = 출력 전 실물 판 JPG 확인 · EPS 출력 = EPS/JPG/DXF 받기(주문·카드 미생성). 이종 파일 혼합, 조각별 올바른 소스로 복제.</div>'
    + '<div id="iaeCanNestResult"></div>'
    + '</div>'
    + '</div>';

  iaeCanBindSubModeTabs(host);

  // 팔레트 선택 토글
  host.querySelectorAll('.iae-imp-pick').forEach(function (cb) {
    cb.addEventListener('change', function () {
      var key = cb.getAttribute('data-key');
      if (cb.checked) {
        if (!iaeImposeSel.some(function (s) { return s.key === key; })) {
          var g = iaeCanSrc(key);
          if (g) iaeImposeSel.push({ key: g.key, fid: g.fid, gi: g.gi, filename: g.filename, w_mm: g.w_mm, h_mm: g.h_mm, scale: 1, qty: 1, bleed: 0 });
        }
      } else {
        iaeImposeSel = iaeImposeSel.filter(function (s) { return s.key !== key; });
      }
      iaeImposeSave(); iaeImposeRenderPanel();
    });
  });
  // 조각 삭제
  host.querySelectorAll('.iae-imp-del').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = parseInt(b.getAttribute('data-i'), 10);
      if (i >= 0) { iaeImposeSel.splice(i, 1); iaeImposeSave(); iaeImposeRenderPanel(); }
    });
  });
  // 조각별 배율/개수/도련 (change=blur 시 갱신·재렌더로 힌트·예상치 반영)
  var bindPiece = function (cls, prop, parse) {
    host.querySelectorAll(cls).forEach(function (el) {
      el.addEventListener('change', function () {
        var i = parseInt(el.getAttribute('data-i'), 10);
        if (i < 0 || !iaeImposeSel[i]) return;
        iaeImposeSel[i][prop] = parse(el.value);
        iaeImposeSave(); iaeImposeRenderPanel();
      });
    });
  };
  bindPiece('.iae-imp-scale', 'scale', function (v) { return Math.max(0.1, parseFloat(v) || 1); });
  bindPiece('.iae-imp-qty', 'qty', function (v) { return Math.max(1, parseInt(v, 10) || 1); });
  bindPiece('.iae-imp-bleed', 'bleed', function (v) { return Math.max(0, parseFloat(v) || 0); });

  // 모드 변경 → 프리셋 초기화·재렌더
  var modeEl = document.getElementById('iaeImpMode');
  if (modeEl) modeEl.addEventListener('change', function () { o.mode = modeEl.value; o.presetIdx = 0; iaeImposeSave(); iaeImposeRenderPanel(); });
  // 규격 select — 직접 입력 토글 or 인덱스
  var presetEl = document.getElementById('iaeImpPreset'), customRow = document.getElementById('iaeImpCustom');
  if (presetEl) presetEl.addEventListener('change', function () {
    if (presetEl.value === '__custom') { o.presetIdx = '__custom'; if (customRow) customRow.classList.remove('hidden'); }
    else { o.presetIdx = parseInt(presetEl.value, 10) || 0; if (customRow) customRow.classList.add('hidden'); iaeImposeRenderEstimate(); }
    iaeImposeSave();
  });
  // 커스텀 규격 저장
  var custSaveEl = document.getElementById('iaeImpCustSave');
  if (custSaveEl) custSaveEl.addEventListener('click', function () {
    var w = parseFloat((document.getElementById('iaeImpCustW') || {}).value) || 0;
    var h = (o.mode === 'flatbed') ? (parseFloat((document.getElementById('iaeImpCustH') || {}).value) || 0) : 0;
    if (w <= 0 || (o.mode === 'flatbed' && h <= 0)) { iaeToast('규격(' + (o.mode === 'flatbed' ? 'W×H' : '폭') + ')을 입력하세요', 'error'); return; }
    var idx = iaeAddCustomPreset(o.mode, w, h);
    if (idx < 0) { iaeToast('규격 추가 실패', 'error'); return; }
    o.presetIdx = idx; o.custom_w = ''; o.custom_h = '';
    iaeToast('규격 저장: ' + (o.mode === 'flatbed' ? (w + '×' + h) : (w + 'cm 롤')), 'success');
    iaeImposeSave(); iaeImposeRenderPanel();
  });
  // gap/margin/회전/패커 → 예상치 갱신
  var bindOpt = function (id, prop, parse) { var el = document.getElementById(id); if (el) el.addEventListener('change', function () { o[prop] = parse(el.value); iaeImposeSave(); iaeImposeRenderEstimate(); }); };
  bindOpt('iaeImpGap', 'gap', function (v) { return parseFloat(v) || 0; });
  bindOpt('iaeImpMargin', 'margin', function (v) { return parseFloat(v) || 0; });
  var allowRotEl = document.getElementById('iaeImpAllowRot');
  if (allowRotEl) allowRotEl.addEventListener('change', function () { o.allow_rotate = allowRotEl.checked; if (!allowRotEl.checked) iaeToast('회전 비허용 — 방향성 소재 보호', 'info'); iaeImposeSave(); iaeImposeRenderEstimate(); });
  var packerEl = document.getElementById('iaeImpPacker');
  if (packerEl) packerEl.addEventListener('change', function () { o.packer = (packerEl.value === 'maxrects') ? 'maxrects' : 'shelf'; if (o.packer === 'maxrects') iaeToast('MaxRects — 빈 공간을 재활용해 촘촘히 배치', 'info'); iaeImposeSave(); iaeImposeRenderEstimate(); });
  // 자동 배치 / 실제 렌더 / EPS 출력
  var runEl = document.getElementById('iaeImpRun');
  if (runEl) runEl.addEventListener('click', iaeImposePlace);
  var pvEl = document.getElementById('iaeCanPreviewBtn');
  if (pvEl) pvEl.addEventListener('click', iaeCanPreviewRender);
  var exportEl = document.getElementById('iaeCanExportBtn');
  if (exportEl) exportEl.addEventListener('click', iaeCanExportSheets);

  iaeImposeRenderEstimate();
}

// 임포지션 자동 배치 — 이종 소스 조각을 한 판에. 대지 초기화 후 조각별 소스 오브젝트 생성 → iaeCanSyncSheet.
//   id로 소스 역매핑(멀티소스). 도련=아트워크를 패딩 셀 안에 배치(원본크기 유지). 롤=단일 가변높이 / 평판=다중판.
function iaeImposePlace() {
  if (!iaeImposeSel.length) { iaeToast('아트보드를 선택하세요', 'error'); return; }
  var built = iaeImposeBuildItems();
  if (built.error) { iaeToast(built.error, 'error'); return; }
  if (!built.items.length) { iaeToast('배치할 조각이 없습니다', 'error'); return; }
  var o = iaeImposeOpts;
  if (o.presetIdx === '__custom') { iaeToast('직접 입력 규격은 [규격 저장] 후 사용하세요', 'error'); return; }
  var presets = iaePresetsFor(o.mode);
  var preset = presets[o.presetIdx] || presets[0];
  var margin = Number(o.margin) || 0, gap = Number(o.gap) || 0;
  var availW = preset.w - margin * 2;
  if (availW <= 0) { iaeToast('돔보 여백이 시트 폭보다 큽니다', 'error'); return; }
  var allowRotate = (o.allow_rotate !== false);
  var best = iaeNestPackBest(o.mode, preset, built.items, availW, gap, margin, allowRotate, o.packer);
  if (best.error) { iaeToast(best.msg, 'error'); return; }
  var packed = best.packed;
  if (allowRotate && !best.chosenAllowRotate) iaeToast('방향 고정 배치가 더 효율적 — 회전 없이 배치합니다', 'info');

  iaeCanObjs = []; iaeCanSheets = []; // 임포지션은 fresh 배치

  // 시트 분할 — id 보존 필수(멀티소스 역매핑).
  var sheets = [];
  if (o.mode === 'flatbed') {
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
      arr.forEach(function (p) { cur.push({ id: p.id, x_cm: p.x_cm, y_cm: yLocal, width_cm: p.width_cm, height_cm: p.height_cm, rotated: p.rotated }); });
      curBottom = yLocal + sh;
    });
    if (cur.length) sheets.push(cur);
    sheets = sheets.map(function (pl) { return { width_cm: preset.w, height_cm: preset.h, placements: pl.map(function (p) { return iaeShiftP(p, margin); }) }; });
  } else {
    sheets = [{ width_cm: preset.w, height_cm: packed.total_height_cm + margin * 2, placements: packed.placements.map(function (p) { return iaeShiftP(p, margin); }) }];
  }

  var cursorY = iaeCanContentBottomMm() + 50, originX = 0;
  var srcSet = {}; iaeImposeSel.forEach(function (s) { srcSet[s.fid] = true; });
  var multiSrc = Object.keys(srcSet).length > 1;
  sheets.forEach(function (s, si) {
    var sheetUid = iaeCanSheetUid++;
    var sx = originX, sy = cursorY;
    var am = (s.placements[0] && built.meta[s.placements[0].id]) || iaeImposeSel[0] || {};
    var sh = {
      uid: sheetUid, x_mm: sx, y_mm: sy, w_mm: Math.round(s.width_cm * 10), h_mm: Math.round(s.height_cm * 10),
      mode: o.mode, label: '모아찍기 ' + preset.label + (sheets.length > 1 ? (' #' + (si + 1)) : ''),
      eff: 0, trim: margin > 0, key: am.key, fid: am.fid, gi: am.gi,
      roll_width_cm: s.width_cm, total_height_cm: s.height_cm, margin_cm: margin, gap_cm: gap, scale_factor: 1,
      placements: []
    };
    iaeCanSheets.push(sh);
    s.placements.forEach(function (p) {
      var m = built.meta[p.id]; if (!m) return;
      var artWmm = Math.round(m.artW * 10), artHmm = Math.round(m.artH * 10), bleedMm = Math.round(m.bleed * 10);
      var cellX = sx + p.x_cm * 10, cellY = sy + p.y_cm * 10;
      // 아트워크를 도련 패딩 셀 안(좌상+도련)에 배치. 회전 시 rotBBox 앵커 보정(bbox 좌상 = cell+도련).
      var px, py, rot = p.rotated ? 90 : 0;
      if (p.rotated) { px = cellX + bleedMm + artHmm; py = cellY + bleedMm; }
      else { px = cellX + bleedMm; py = cellY + bleedMm; }
      iaeCanObjs.push({
        uid: iaeCanUid++, fid: m.fid, gi: m.gi, key: m.key, label: m.filename + ' #' + m.gi,
        w_mm: artWmm, h_mm: artHmm, x_mm: Math.round(px), y_mm: Math.round(py), rotation: rot,
        fin: { top: '', bottom: '', left: '', right: '' }, trim: false, scale_factor: 1, sheetUid: sheetUid
      });
    });
    iaeCanSyncSheet(sh); // placements(analysis_id per 조각)·효율·롤 길이 재계산
    cursorY += Math.round(s.height_cm * 10) + 30;
  });
  iaeCanSave();
  iaeNestRenderPreview();
  iaeToast(sheets.length + '판 · ' + built.items.length + '조각' + (multiSrc ? (' · ' + Object.keys(srcSet).length + '개 소스') : '') + ' 배치 완료', 'success');
  iaeImposeRenderPanel();
}

// ── N4: 주문 연결 (품목 지정 모달 · 개별/네스팅 라인 · 새 주문 · 면적단가) ──
// 대지 객체/시트 → order_items. 개별 객체=라인1, 시트=라인1(수량=조각수). 새 주문 POST /api/orders.
// 마감 per-side → 대표 단일 finishing(에이전트 호환). 출력은 기존 에이전트(아트보드+finishing) 동작.
var iaeOmState = { client_id: null, client_name: '', lines: [] };
var iaeOmClientTimer = null, iaeOmItemTimer = null;  // 거래처/품목 검색 디바운스 분리 (공유 시 레이스)

function iaeCanFileR2(fid) {
  var f = iaeFiles.filter(function (x) { return x.id === fid; })[0];
  if (f) return 'r2://sources/' + fid + '/' + f.filename;
  // R2-1: 이력 잡(파일 미오픈) fallback — filename 미상이어도 analysis_id 경로 제공. 실제 추적은 ai_analysis_id.
  return (fid != null) ? ('r2://sources/' + fid + '/') : null;
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
// order_item.post_processing 배열: 돔보(TRIM) + 캔버스 리사이즈(RESIZE 목표크기) + 실물저장(REALSIZE). 없으면 null
function iaeOmPostProc(ln) {
  var pp = [];
  if (ln.trim) pp.push({ code: 'TRIM', params: {} });
  var resized = (ln.det_w_cm != null && ln.det_h_cm != null) && (ln.w_cm !== ln.det_w_cm || ln.h_cm !== ln.det_h_cm) && ln.w_cm > 0 && ln.h_cm > 0;
  if (resized) pp.push({ code: 'RESIZE', params: { w_cm: ln.w_cm, h_cm: ln.h_cm } });
  // 실물 저장: 파일배율 1/N(>1)일 때만 의미. 기본 ON(실물) → 에이전트가 아트워크 ×N 확대·마진 실물 cm.
  if ((ln.real_size !== false) && (Number(ln.scale_factor) || 1) > 1) pp.push({ code: 'REALSIZE', params: {} });
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
      w_cm: iaeMmToCm1(src ? src.w_mm : p0.w_mm), h_cm: iaeMmToCm1(src ? src.h_mm : p0.h_mm),
      qty: pieces.length, fin: p0.fin || null, trim: !!sh.trim,
      det_w_cm: iaeMmToCm1(src ? src.w_mm : p0.w_mm), det_h_cm: iaeMmToCm1(src ? src.h_mm : p0.h_mm),
      sheetRec: (sh.placements && sh.placements.length) ? sh : null,  // N4 네스팅 렌더용(placements 보유 시)
      item_id: null, item_name: '', pricing_method: 'FIXED', unit_price: 0
    });
  });
  iaeCanObjs.filter(function (o) { return !o.sheetUid; }).forEach(function (o) {
    var src = iaeCanSrc(o.key);
    lines.push({
      kind: 'obj', fid: o.fid, gi: o.gi, label: (src ? src.filename : '') + ' #' + o.gi,
      w_cm: iaeMmToCm1(o.w_mm), h_cm: iaeMmToCm1(o.h_mm),
      qty: 1, fin: o.fin || null, trim: !!o.trim, scale_factor: o.scale_factor || 1, real_size: (o.real_size !== false),
      det_w_cm: iaeMmToCm1((src ? src.w_mm : o.w_mm) || 0), det_h_cm: iaeMmToCm1((src ? src.h_mm : o.h_mm) || 0),
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
  iaeOpenOrderModalWithLines(lines);
}
// R2-1: 주문 모달을 임의 lines로 오픈(대지 객체용·이력용 공용). 거래처/품목 picker·submit 재사용.
function iaeOpenOrderModalWithLines(lines) {
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

  // ⑥ 비율 왜곡 강한 경고: 목표크기가 검출 종횡비와 >5% 다른 라인 → 진행 전 확인 모달
  var distorted = iaeOmState.lines.filter(function (ln) { return iaeDistortRatio(ln.w_cm, ln.h_cm, ln.det_w_cm, ln.det_h_cm) > 0.05; });
  if (distorted.length && window.showConfirm) {
    var worst = Math.max.apply(null, distorted.map(function (ln) { return iaeDistortRatio(ln.w_cm, ln.h_cm, ln.det_w_cm, ln.det_h_cm); }));
    window.showConfirm(distorted.length + '개 라인이 원본 비율과 약 ' + Math.round(worst * 100) + '% 달라 잘림/늘어남이 발생할 수 있습니다.\n그대로 진행할까요?',
      { title: '비율 왜곡 경고', confirmText: '진행', danger: true }).then(function (ok) { if (ok) iaeCanSubmitOrderProceed(); });
    return;
  }
  iaeCanSubmitOrderProceed();
}
function iaeCanSubmitOrderProceed() {
  var isAppend = iaeOmState.mode === 'append';
  var dateEl = document.getElementById('iaeOmDate');
  var delivery = dateEl ? dateEl.value : '';
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
  iaeCanLoad();          // 네스팅 시트 영속 복원

  var ids = iaeLoadIds();
  iaeActiveId = ids.length ? ids[0] : null;
  iaeLoadFinishing(); // 마감 데이터 로드 후 패널 렌더
  iaeRefresh();
  iaeLoadHistory(); // ③ 가공 이력 보드 초기 로드(서버 조회 — 새로고침에도 보존)
  iaeStartAgentPoll(); // ② 에이전트 상태 배지 주기 폴 시작(편집 뷰 기본)
})();
