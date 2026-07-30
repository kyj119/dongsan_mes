#target illustrator
// MES A0 CEP panel — ExtendScript host bridge (A1 usable: mes-core 처리 포팅)
// ES3(ExtendScript)만: arrow/const/let/JSON 금지. 파일 인코딩 = UTF-8.
// spec: docs/superpowers/specs/2026-07-23-ia-palette-session-loop.md (CEP 승격)
// 한글은 params 파일(cep.fs UTF-8)로만 전달 — evalScript 인자/반환은 ASCII만.
// 처리 로직 정본 = IllustratorAutomat/designer/mes-core.jsx (동일 산출물·manifest 스키마 유지).

// 버전은 패널 우상단 표시(mesA0_ping)와 manifest script_version 에 실린다.
//   ⚠️ 이 파일은 패널 **로드 시점에만** $.evalFile 된다(jsx/host.jsx 스텁) — 고쳐도 패널을
//   다시 열기 전에는 구버전이 계속 돈다. 그 사실을 눈으로 확인할 수 있게 수정 시 버전을 올린다.
//   0.1.1 = 등록 크기 기준을 클립 마스크 존중으로 통일(measured_cm 겉보기 버그 수정, 2026-07-29)
//   0.1.2 = 출력 경계선(백색 테두리) on/off — 원본 테두리와 겹쳐 두 줄로 보이던 건 (2026-07-29)
//   0.1.3 = 수량 3분화 — 단건=최종값 · 묶음=새 행 기본값 · 모아찍기=수량 안 받음 (2026-07-29)
//   0.1.4 = work.ai PDF 합성부 제외(용량 −52%) + 임베드 래스터 계측·경고 (2026-07-30)
//   0.1.5 = 돔보 선택 시 재단선 사각(레이어 '재단선') + DXF 내보내기·_출력 복사 (2026-07-30)
//   0.1.6 = 묶음분리·자동감지 결과를 공간 정렬(위→아래·좌→우) — 행 번호를 눈에 맞춤 (2026-07-30)
var MESA0_VERSION = 'A0-CEP-0.1.6';
var MESA0_REGISTER_ROOT = 'Z:/DESIGNS/IA-등록';
var MESA0_PT_PER_MM = 72 / 25.4;
var MESA0_SIDES = ['top', 'bottom', 'left', 'right'];
// 임베드 래스터가 디자인 경계 밖으로 이 비율(%) 이상 삐져나오면 '원본 정리 권장' 경고(warn 'E').
// 실측 근거(2026-07-30): 107MB work.ai = 임베드 49개 54.1MB 중 10개가 각 면적의 67%가 밖.
// 안 완전포함 39개는 0% → 30 은 정상 디자인을 오탐하지 않는 하한.
var MESA0_RASTER_OUT_PCT = 30;
// 재단선 레이어명 — mes-sheet.jsx 의 CUT_LAYER 와 **같은 이름·같은 규약**(M100 실선 0.6)이어야 한다.
// DXF 는 이 레이어만 남기고 나머지를 숨겨 내보내므로, 이름이 갈리면 빈 DXF 가 나간다.
var MESA0_CUT_LAYER = '재단선';

// ── 유틸 (mes-core 포팅) ──
function mesA0_readText(path) {
  var f = new File(path);
  if (!f.exists) return null;
  f.encoding = 'UTF-8';
  if (!f.open('r')) return null;
  var s = f.read(); f.close(); return s;
}
function mesA0_writeText(path, s) {
  var f = new File(path);
  f.encoding = 'UTF-8';
  if (!f.open('w')) return false;
  f.write(s); f.close(); return true;
}
function mesA0_jsonEsc(s) {
  s = String(s);
  s = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  s = s.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  return s;
}
function mesA0_toJson(v) {
  if (v === null || v === undefined) return 'null';
  var t = typeof v;
  if (t === 'number') return isFinite(v) ? String(v) : 'null';
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'string') return '"' + mesA0_jsonEsc(v) + '"';
  if (v instanceof Array) {
    var a = [];
    for (var i = 0; i < v.length; i++) a.push(mesA0_toJson(v[i]));
    return '[' + a.join(',') + ']';
  }
  var o = [];
  for (var k in v) {
    if (v.hasOwnProperty && !v.hasOwnProperty(k)) continue;
    o.push('"' + mesA0_jsonEsc(k) + '":' + mesA0_toJson(v[k]));
  }
  return '{' + o.join(',') + '}';
}
function mesA0_pad2(n) { return (n < 10 ? '0' : '') + n; }
function mesA0_sanitize(s) {
  s = String(s || '');
  s = s.replace(/[\\\/:\*\?"<>\|]/g, '');
  s = s.replace(/^\s+|\s+$/g, '');
  return s || '무명';
}
// 주석 조합: 키워드-식별번호-수량ea (키워드 있을 때만). 거래처명 제외. 식별번호=키워드별 순번(큐 배치)
function mesA0_annotText(keyword, seqNo, qty) {
  if (!keyword) return '';
  var s = keyword;
  if (seqNo != null && seqNo !== '') s += '-' + seqNo;
  s += '-' + qty + 'ea';
  return s;
}
function mesA0_unionBounds(items) {
  var L = null, T = null, R = null, B = null;
  for (var i = 0; i < items.length; i++) {
    var b;
    try { b = items[i].visibleBounds; } catch (e) { try { b = items[i].geometricBounds; } catch (e2) { continue; } }
    if (!b) continue;
    if (L === null || b[0] < L) L = b[0];
    if (T === null || b[1] > T) T = b[1];
    if (R === null || b[2] > R) R = b[2];
    if (B === null || b[3] < B) B = b[3];
  }
  return (L === null) ? null : [L, T, R, B];
}
function mesA0_docUnion(doc) {
  var L2 = null, T2 = null, R2 = null, B2 = null;
  for (var qi = 0; qi < doc.pageItems.length; qi++) {
    var it = doc.pageItems[qi];
    if (it.locked || it.hidden) continue;
    var b2;
    try { b2 = it.visibleBounds; } catch (eB) { continue; }
    if (L2 === null || b2[0] < L2) L2 = b2[0];
    if (T2 === null || b2[1] > T2) T2 = b2[1];
    if (R2 === null || b2[2] > R2) R2 = b2[2];
    if (B2 === null || b2[3] < B2) B2 = b2[3];
  }
  return (L2 === null) ? null : [L2, T2, R2, B2]; // null = 측정할 아이템 없음(폴백 100pt 산출 방지)
}

// ── 클리핑 마스크 존중 경계 (ExtractGroups getClipBounds/getClipRespectingBounds 포팅) ──
// 클립 그룹은 겉보기/기하 경계가 '클립 밖 원본 콘텐츠'까지 잡아 커짐 → 클립 마스크(경로) 경계를 써야 정확
function mesA0_findClipPath(item) {
  try {
    if (item.clipping) return item.geometricBounds;
    if (item.typename === 'GroupItem') {
      for (var j = 0; j < item.pageItems.length; j++) {
        var r = mesA0_findClipPath(item.pageItems[j]);
        if (r) return r;
      }
    }
  } catch (e) {}
  return null;
}
function mesA0_getClipBounds(group) {
  for (var j = 0; j < group.pageItems.length; j++) {
    try { if (group.pageItems[j].clipping) return group.pageItems[j].geometricBounds; } catch (e) {}
  }
  var r = mesA0_findClipPath(group);
  return r ? r : group.geometricBounds;
}
// ── 보이는 잉크 축소(옵션) — 클립 마스크가 실제 콘텐츠보다 클 때 클립∩콘텐츠 교집합으로 실측 ──
// $.global.mesA0_inkMode=true 일 때만 적용. 기본(false)=클립 경계(ExtractGroups 관례).
function mesA0_rectIntersect(a, b) {
  if (!a) return b; if (!b) return a;
  var iL = Math.max(a[0], b[0]), iR = Math.min(a[2], b[2]);
  var iT = Math.min(a[1], b[1]), iB = Math.max(a[3], b[3]);
  return (iL < iR && iB < iT) ? [iL, iT, iR, iB] : null;
}
function mesA0_getContentUnion(group) { // 클립 패스 제외한 실제 아트워크 경계(중첩 클립 존중)
  var uL = null, uT = null, uR = null, uB = null;
  try {
    for (var j = 0; j < group.pageItems.length; j++) {
      var c = group.pageItems[j];
      if (c.clipping || c.hidden || c.typename === 'TextFrame') continue;
      var cb = mesA0_itemBounds(c);
      if (!cb) { try { cb = c.geometricBounds; } catch (e) { cb = null; } }
      if (cb) {
        if (uL === null || cb[0] < uL) uL = cb[0];
        if (uT === null || cb[1] > uT) uT = cb[1];
        if (uR === null || cb[2] > uR) uR = cb[2];
        if (uB === null || cb[3] < uB) uB = cb[3];
      }
    }
  } catch (e) {}
  return (uL === null) ? null : [uL, uT, uR, uB];
}
function mesA0_getVisibleInk(group) { // 클립 ∩ 콘텐츠 = 실제 보이는 잉크. 교집합 없으면 클립.
  var inter = mesA0_rectIntersect(mesA0_getClipBounds(group), mesA0_getContentUnion(group));
  return inter ? inter : mesA0_getClipBounds(group);
}
function mesA0_clipBoundsMode(group) { // 잉크모드=교집합, 아니면 클립 경계
  return $.global.mesA0_inkMode ? mesA0_getVisibleInk(group) : mesA0_getClipBounds(group);
}
function mesA0_getClipRespecting(group) {
  var uL = null, uT = null, uR = null, uB = null;
  try {
    for (var j = 0; j < group.pageItems.length; j++) {
      var c = group.pageItems[j];
      if (c.typename === 'TextFrame' || c.hidden) continue;
      var cb;
      if (c.typename === 'GroupItem' && c.clipped) cb = mesA0_clipBoundsMode(c);
      else if (c.typename === 'GroupItem' && !c.clipped) cb = mesA0_getClipRespecting(c);
      else cb = c.geometricBounds;
      if (cb) {
        if (uL === null || cb[0] < uL) uL = cb[0];
        if (uT === null || cb[1] > uT) uT = cb[1];
        if (uR === null || cb[2] > uR) uR = cb[2];
        if (uB === null || cb[3] < uB) uB = cb[3];
      }
    }
  } catch (e) {}
  return (uL === null) ? group.geometricBounds : [uL, uT, uR, uB];
}
function mesA0_itemBounds(item) {
  try {
    if (item.typename === 'GroupItem') return item.clipped ? mesA0_clipBoundsMode(item) : mesA0_getClipRespecting(item);
    if (item.typename === 'TextFrame') return null;
    return item.geometricBounds;
  } catch (e) { return null; }
}
function mesA0_clipUnion(items) {
  var L = null, T = null, R = null, B = null;
  for (var i = 0; i < items.length; i++) {
    var b = mesA0_itemBounds(items[i]);
    if (!b) { try { b = items[i].geometricBounds; } catch (e) { b = null; } } // top-level 텍스트 등 폴백
    if (!b) continue;
    if (L === null || b[0] < L) L = b[0];
    if (T === null || b[1] > T) T = b[1];
    if (R === null || b[2] > R) R = b[2];
    if (B === null || b[3] < B) B = b[3];
  }
  return (L === null) ? null : [L, T, R, B];
}

// ── 브릿지 API (ASCII in/out) ──
function mesA0_ping() { return MESA0_VERSION; }

// _config/config.json 원문 반환 (한글경로 Z: = ExtendScript File이 안전 처리 — cep.fs 폴백용)
function mesA0_config() {
  var s = mesA0_readText(MESA0_REGISTER_ROOT + '/_config/config.json');
  return s ? s : '';
}

// params 파일 경로(패널이 여기에 UTF-8로 쓰고 → mesA0_process가 읽음). ASCII 경로.
function mesA0_paramsPath() {
  return String(Folder.temp.fsName).replace(/\\/g, '/') + '/mes_a0_cep_params.json';
}

// 현재 선택 실측 (cm) — ASCII JSON. ink=1 이면 보이는 잉크(클립∩콘텐츠)로 축소.
function mesA0_measure(ink) {
  $.global.mesA0_inkMode = (ink == 1 || ink === '1' || ink === true);
  if (app.documents.length === 0) return '{"ok":false,"err":"nodoc"}';
  var d = app.activeDocument;
  if (!d.selection || d.selection.length === 0) return '{"ok":false,"err":"nosel"}';
  var sel = [];
  for (var i = 0; i < d.selection.length; i++) sel.push(d.selection[i]);
  var cr = mesA0_clipUnion(sel);   // 클립 마스크 존중(정확한 디자인 크기)
  var vb = mesA0_unionBounds(sel); // 겉보기(선·효과·클립밖 포함, 진단)
  if (!cr) cr = vb;
  if (!cr) return '{"ok":false,"err":"nobounds"}';
  var w = (cr[2] - cr[0]) / MESA0_PT_PER_MM / 10;
  var h = (cr[1] - cr[3]) / MESA0_PT_PER_MM / 10;
  var vw = vb ? ((vb[2] - vb[0]) / MESA0_PT_PER_MM / 10) : w;
  var vh = vb ? ((vb[1] - vb[3]) / MESA0_PT_PER_MM / 10) : h;
  return '{"ok":true,"w":' + (Math.round(w * 10) / 10) + ',"h":' + (Math.round(h * 10) / 10) +
    ',"vw":' + (Math.round(vw * 10) / 10) + ',"vh":' + (Math.round(vh * 10) / 10) + ',"n":' + sel.length + '}';
}

// 가공 실행 — params 파일(UTF-8) 읽어 mes-core 로직 수행. 반환=ASCII JSON.
function mesA0_process() {
  var raw = mesA0_readText(mesA0_paramsPath());
  if (!raw) return '{"ok":false,"err":"noparams"}';
  var P;
  try { P = eval('(' + raw + ')'); } catch (e) { return '{"ok":false,"err":"badparams"}'; }
  var review = !!P.review_only; // 검토문서 모드(D4): 가공만 하고 저장 없이 검토문서 아트보드로 이관

  if (app.documents.length === 0) return '{"ok":false,"err":"nodoc"}';
  var srcDoc = app.activeDocument;
  if (!srcDoc.selection || srcDoc.selection.length === 0) return '{"ok":false,"err":"nosel"}';
  var sel = [];
  for (var si = 0; si < srcDoc.selection.length; si++) sel.push(srcDoc.selection[si]);
  // ★ 등록 크기의 기준 = **클립 마스크 존중**(2026-07-29 수정).
  //   여기만 겉보기(visibleBounds)를 쓰고 있었다 — 실측(mesA0_measure:211)·개별추가(:576)·
  //   분리/자동감지(:643)는 전부 이미 mesA0_clipUnion(클립 존중)이었는데 **등록 경로만 누락**.
  //   그래서 클립으로 8.7×19.7cm 로 잘린 디자인이 겉보기 53.9×24.3 으로 잡혀,
  //   배율 10 에서 539×243.3cm 로 등록됐다(실측 표시와 등록값이 서로 다른 함수를 쓰던 것).
  //   realW/realH 를 통해 manifest measured_cm · 파일명 sizeStr · 패널 완료 메시지가 한꺼번에 교정된다.
  var vbAll = mesA0_unionBounds(sel);            // 겉보기 — 임시 문서 캔버스 크기용(기존 동작 보존)
  var ub = mesA0_clipUnion(sel) || vbAll;        // 클립 존중 — 크기 메타의 기준
  if (!ub) return '{"ok":false,"err":"nobounds"}';
  var fileWCm = (ub[2] - ub[0]) / MESA0_PT_PER_MM / 10;
  var fileHCm = (ub[1] - ub[3]) / MESA0_PT_PER_MM / 10;

  // 파라미터
  var qty = parseInt(P.qty, 10); if (isNaN(qty) || qty < 1) qty = 1;
  var sN = parseInt(P.scale_n, 10); if (isNaN(sN) || sN < 1) sN = 1;
  var mode = (P.mode === 'impose') ? 'impose' : ((P.mode === 'both') ? 'both' : 'single');
  var trim = !!P.trim;
  $.global.mesA0_inkMode = !!P.trim_ink; // 보이는 잉크 축소(클립∩콘텐츠) — 실측·가공 동일 기준
  var punch = P.punch || {}; // {top,bottom,left,right(개수), corners:{tl,tr,bl,br}}
  var kwRaw = P.keyword ? String(P.keyword) : ''; // 키워드(주석·파일명)
  var postDesc = P.post_desc ? String(P.post_desc) : ''; // 후가공 파일명 세그먼트(main.js 조립·UTF-8 전달)
  var annotPos = P.annot_pos || {}; // {top,bottom,left,right} bool (다중)
  var seqNo = (P.seq_no != null && P.seq_no !== '') ? P.seq_no : null; // 식별번호(키워드별 순번)
  var fin = P.finishing || {};
  var finJson = {}, finMargins = {}, finRealCm = {}, finMark = {}, hasFinishing = false, hasMark = false;
  for (var fs = 0; fs < MESA0_SIDES.length; fs++) {
    var sd = MESA0_SIDES[fs];
    var mName = fin[sd] || '';
    var cmVal = parseFloat(fin[sd + '_cm']); if (isNaN(cmVal)) cmVal = 0;
    if (mName) { finJson[sd] = mName; finJson[sd + '_cm'] = cmVal; hasFinishing = true; }
    var mk = fin[sd + '_mark']; // 변별 마크: 'fold'(접는선) | 'cut'(재단선)
    if (mk === 'fold' || mk === 'cut') { finMark[sd] = mk; finJson[sd + '_mark'] = mk; hasMark = true; }
    finMargins[sd] = (mName ? cmVal : 0) * 10 * MESA0_PT_PER_MM / sN;
    finRealCm[sd] = mName ? cmVal : 0; // 실측 여백 cm(주석 3cm 게이트용)
  }
  var docBase = mesA0_sanitize(String(srcDoc.name).replace(/\.[^.]+$/, ''));
  var clientName = P.client_name ? mesA0_sanitize(P.client_name) : docBase;
  var annotation = mesA0_annotText(kwRaw, seqNo, qty); // 주석(호스트 조합, 거래처명 제외)
  var orderItemId = (P.order_item_id != null) ? P.order_item_id : null;
  var realW = fileWCm * sN, realH = fileHCm * sN;

  var pfSourceRGB = false;
  try { pfSourceRGB = (srcDoc.documentColorSpace == DocumentColorSpace.RGB); } catch (ePf0) {}
  var pfRemainingText = 0, pfLinkedImages = 0;
  var pfRasters = 0, pfOversize = 0, pfOversizeMax = 0, workBytes = 0;

  var now = new Date();
  var ymd = '' + now.getFullYear() + mesA0_pad2(now.getMonth() + 1) + mesA0_pad2(now.getDate());
  var hms = mesA0_pad2(now.getHours()) + mesA0_pad2(now.getMinutes()) + mesA0_pad2(now.getSeconds());
  var pcName = $.getenv('COMPUTERNAME') || 'PC';
  var userName = $.getenv('USERNAME') || '';
  // 배치(묶음): 공유 폴더에 평면 저장 + 파일명 _식별번호 접미. 단건: 자체 건별폴더
  var batchFolder = P.batch_folder ? String(P.batch_folder) : '';
  var folderName = batchFolder || (ymd + '_' + hms + '_' + mesA0_sanitize(pcName) + '_' + (now.getTime() % 1000));
  var jobFolder = new Folder(MESA0_REGISTER_ROOT + '/' + folderName);
  if (!review && !jobFolder.exists && !jobFolder.create()) return '{"ok":false,"err":"nofolder"}'; // 검토=저장 없음(폴더 미생성)
  var sfx = (P.batch_index != null && P.batch_index !== '') ? ('_' + mesA0_sanitize('' + P.batch_index)) : '';

  // 원본 선택을 클립보드로 복사(cross-doc duplicate가 CEP eval 컨텍스트서 0개 실패 → copy/paste 대체)
  // srcDoc 활성·선택 유효 상태에서 먼저 복사(참조 stale 방지). 원본 불가침(복사만·무변경).
  var copyErr = '';
  try { app.activeDocument = srcDoc; srcDoc.selection = sel; app.copy(); } catch (eCopy) { copyErr = '' + eCopy; }

  // 캔버스는 겉보기 기준을 유지한다 — 클립 밖 아트까지 담을 자리를 두려는 원래 의도(아트보드는
  //   아래에서 db(클립 존중)로 다시 잡는다). ub 를 클립 기준으로 바꾼 것과 무관하게 기존 동작 보존.
  var cvB = vbAll || ub;
  var newDoc = app.documents.add(DocumentColorSpace.CMYK, (cvB[2] - cvB[0]) || 100, (cvB[1] - cvB[3]) || 100);
  var okAll = false, outlineFailed = false, epsName = null, dxfName = null, diagItems = 0, normed = 0;
  try {
    app.activeDocument = newDoc;
    app.paste(); // 신규문서 중앙에 붙음(절대위치는 이후 정규화로 원점 이동)
    // 붙여넣은 top-level 디자인 캡처(outline 전 — 클립 존중 경계용)
    var pasted = [];
    for (var ps = 0; ps < newDoc.selection.length; ps++) pasted.push(newDoc.selection[ps]);

    try { for (var ti = newDoc.textFrames.length - 1; ti >= 0; ti--) newDoc.textFrames[ti].createOutline(); }
    catch (eOl) { outlineFailed = true; }
    try { pfRemainingText = newDoc.textFrames.length; } catch (ePf1) {}
    try { pfLinkedImages = newDoc.placedItems.length; } catch (ePf2) {}

    if (pasted.length === 0) { // 폴백: 레이어 top-level 수집
      for (var pl = 0; pl < newDoc.pageItems.length; pl++) {
        try { var itp = newDoc.pageItems[pl]; if (itp.parent && itp.parent.typename === 'Layer') pasted.push(itp); } catch (ePl) {}
      }
    }
    diagItems = pasted.length;
    // 위치 정규화: 겉보기 union 기준 원점 근처 이동(top-level만)
    var pre = mesA0_unionBounds(pasted);
    if (pre) {
      var dx = -pre[0], dy = -pre[1];
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        for (var pn = 0; pn < pasted.length; pn++) { try { pasted[pn].translate(dx, dy); normed++; } catch (eTr) {} }
      }
    }
    var db = mesA0_clipUnion(pasted); // 클립 마스크 존중(아트보드=정확한 디자인 크기)
    if (!db) db = mesA0_unionBounds(pasted);
    if (!db) { // 복제 실패/측정 불가 — 쓰레기 산출 대신 진단 반환
      try { newDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eC0) {}
      return '{"ok":false,"err":"noart","items":' + diagItems + ',"sel":' + sel.length + ',"copyErr":"' + mesA0_jsonEsc(copyErr) + '"}';
    }
    newDoc.artboards[0].artboardRect = [db[0], db[1], db[2], db[3]];

    // ── 임베드 래스터 계측 (용량의 근본 원인 추적) ──
    // 실측(2026-07-30): 107MB work.ai 의 내용물은 벡터가 아니라 임베드 래스터 49개 54.1MB 이고,
    // 그 중 10개가 아트보드 경계에 걸쳐 각 면적의 67%가 밖에 있다. 이건 지울 수 있는 '밖 오브젝트'가
    // 아니라 대형 래스터의 잘려나간 부분이라 스크립트로 줄일 수 없다(크롭 API 없음·재래스터화는 화질 고정).
    // → 유일한 실효 수단은 디자이너 원본을 고치도록 되돌리는 것이라 여기서 계측해 경고로 노출한다.
    try {
      var abM = newDoc.artboards[0].artboardRect; // [L,T,R,B] = 디자인 경계(마감 여백 확장 전)
      var rsM = newDoc.rasterItems;
      pfRasters = rsM.length;
      for (var rmi = 0; rmi < rsM.length; rmi++) {
        var gbM = rsM[rmi].geometricBounds; // 클립돼도 원본 이미지 전체 범위를 보고한다 = 여분이 보인다
        var rwM = gbM[2] - gbM[0], rhM = gbM[1] - gbM[3];
        if (rwM <= 0 || rhM <= 0) continue;
        var ixM = Math.max(0, Math.min(gbM[2], abM[2]) - Math.max(gbM[0], abM[0]));
        var iyM = Math.max(0, Math.min(gbM[1], abM[1]) - Math.max(gbM[3], abM[3]));
        var outPctM = Math.round(100 * (1 - (ixM * iyM) / (rwM * rhM)));
        if (outPctM >= MESA0_RASTER_OUT_PCT) {
          pfOversize++;
          if (outPctM > pfOversizeMax) pfOversizeMax = outPctM;
        }
      }
    } catch (ePf3) {}

    if (!review) {
      var workFile = new File(jobFolder.fsName + '/work' + sfx + '.ai');
      // PDF 합성부 제외 — 기본값(pdfCompatible=true)은 같은 그림을 AI 편집부와 PDF 복사본으로 2벌 쓴다
      // (실측 107MB = PDF 55.7MB + AI 51.3MB). work.ai 소비자는 전수 확인 결과 전부 일러 app.open
      // (mes-sheet.jsx:237 · SheetLayout.jsx:150 · 에이전트 Program.cs:1547 은 경로/바이트만)이고
      // place(링크) 배치가 0건이라 PDF 스트림이 불필요하다. 잃는 것 = 탐색기 미리보기·Bridge 썸네일
      // (같은 폴더 thumb.png 로 대체). ⚠️work.ai 를 링크 배치·InDesign·Acrobat 로 여는 소비자가 생기면 재검토.
      var workOpts = new IllustratorSaveOptions();
      workOpts.pdfCompatible = false;
      newDoc.saveAs(workFile, workOpts);
      try { workBytes = new File(workFile.fsName).length; } catch (eWb) {}
    }

    if (mode !== 'impose') {
      var oL = db[0], oT = db[1], oR = db[2], oB = db[3];
      newDoc.artboards[0].artboardRect = [oL - finMargins.left, oT + finMargins.top, oR + finMargins.right, oB - finMargins.bottom];

      // 재단/접는선: 변별 마크(fold=접는선 검정실선, cut=재단선 검정점선). 위치=디자인 경계선.
      // 마감 방식·여백과 독립 — 재단 필요한 변에만 그림(줄미싱 등은 '없음'으로 미선택).
      if (hasMark) {
        var mCol = new CMYKColor(); mCol.cyan = 0; mCol.magenta = 0; mCol.yellow = 0; mCol.black = 100; // K100
        var MDASH = 3 * MESA0_PT_PER_MM / sN; // 점선 3mm
        function markLine(x1, y1, x2, y2, dashed) {
          var ln = newDoc.pathItems.add();
          ln.setEntirePath([[x1, y1], [x2, y2]]);
          ln.stroked = true; ln.filled = false;
          ln.strokeColor = mCol; ln.strokeWidth = 0.6;
          if (dashed) ln.strokeDashes = [MDASH, MDASH]; // 재단선=점선
        }
        // 돔보를 켜면 아래에서 디자인 테두리 사방에 재단선 사각(레이어 '재단선')을 그린다 →
        // 변별 'cut' 마크는 같은 자리에 겹쳐 색만 다른 선이 두 겹으로 남으므로 생략한다.
        // 'fold'(접는선)는 목적이 달라(마감) 그대로 그린다.
        function wantMark(side) { var m = finMark[side]; return m && !(trim && m === 'cut'); }
        if (wantMark('top')) markLine(oL, oT, oR, oT, finMark.top === 'cut');
        if (wantMark('bottom')) markLine(oL, oB, oR, oB, finMark.bottom === 'cut');
        if (wantMark('left')) markLine(oL, oT, oL, oB, finMark.left === 'cut');
        if (wantMark('right')) markLine(oR, oT, oR, oB, finMark.right === 'cut');
      }

      // 여백 포함 바깥 테두리 백색 선 (도련 대신 — RIP가 여백까지 출력영역으로 포함하도록)
      //   ⚠️ 원본에 이미 테두리가 있는 디자인에서는 이 선이 그 바깥(여백만큼 떨어진 곳)에 겹쳐
      //   "사각형 두 줄"로 보인다(2026-07-29 실사용 확인). 패널에서 끌 수 있게 했다.
      //   `!== false` 로 읽는 이유 = 구 패널이 보낸 params 에는 이 키가 없다(기존 동작 = ON 유지).
      if (P.border_line !== false) {
      var bL = oL - finMargins.left, bT = oT + finMargins.top, bR = oR + finMargins.right, bB = oB - finMargins.bottom;
      var wCol = new CMYKColor(); wCol.cyan = 0; wCol.magenta = 0; wCol.yellow = 0; wCol.black = 0;
      var borderRect = newDoc.pathItems.rectangle(bT, bL, bR - bL, bT - bB); // rectangle(top,left,width,height)
      borderRect.filled = false;
      borderRect.stroked = true;
      borderRect.strokeColor = wCol;
      borderRect.strokeWidth = 0.5;
      }

      // 펀칭: 원본 디자인 기준(여백 무관) 상/하/좌/우 비율분배 + 꼭짓점 개별. 지름1cm·중심 디자인edge서 2cm·검정 꽉찬 원
      var iTop = parseInt(punch.top, 10) || 0, iBot = parseInt(punch.bottom, 10) || 0;
      var iLeft = parseInt(punch.left, 10) || 0, iRight = parseInt(punch.right, 10) || 0;
      var pcn = punch.corners || {};
      if (iTop || iBot || iLeft || iRight || pcn.tl || pcn.tr || pcn.bl || pcn.br) {
        var kColP = new CMYKColor(); kColP.cyan = 0; kColP.magenta = 0; kColP.yellow = 0; kColP.black = 100;
        var PDIA = 10 * MESA0_PT_PER_MM / sN;   // 1cm
        var PIN = 20 * MESA0_PT_PER_MM / sN;    // 2cm(중심 이격)
        var pr = PDIA / 2;
        var hx0 = oL + PIN, hx1 = oR - PIN, hy0 = oB + PIN, hy1 = oT - PIN; // 원본 디자인 경계 기준
        var holes = [], hi, ht;
        for (hi = 0; hi < iTop; hi++) { ht = (iTop === 1) ? ((hx0 + hx1) / 2) : (hx0 + (hx1 - hx0) * hi / (iTop - 1)); holes.push([ht, oT - PIN]); }
        for (hi = 0; hi < iBot; hi++) { ht = (iBot === 1) ? ((hx0 + hx1) / 2) : (hx0 + (hx1 - hx0) * hi / (iBot - 1)); holes.push([ht, oB + PIN]); }
        for (hi = 0; hi < iLeft; hi++) { ht = (iLeft === 1) ? ((hy0 + hy1) / 2) : (hy0 + (hy1 - hy0) * hi / (iLeft - 1)); holes.push([oL + PIN, ht]); }
        for (hi = 0; hi < iRight; hi++) { ht = (iRight === 1) ? ((hy0 + hy1) / 2) : (hy0 + (hy1 - hy0) * hi / (iRight - 1)); holes.push([oR - PIN, ht]); }
        if (pcn.tl) holes.push([oL + PIN, oT - PIN]);
        if (pcn.tr) holes.push([oR - PIN, oT - PIN]);
        if (pcn.bl) holes.push([oL + PIN, oB + PIN]);
        if (pcn.br) holes.push([oR - PIN, oB + PIN]);
        for (hi = 0; hi < holes.length; hi++) {
          var pel = newDoc.pathItems.ellipse(holes[hi][1] + pr, holes[hi][0] - pr, PDIA, PDIA);
          pel.stroked = false; pel.filled = true; pel.fillColor = kColP; // 검정 꽉찬 원
        }
      }

      // 주석: 선택된 각 위치(상/하/좌/우 다중) 여백 밴드에 검정텍스트. 상/하=가로, 좌/우=90도 회전. 첫글자 코너서 5cm
      // 게이트: 해당 변 마감 여백 3cm 이상일 때만 입력(여백 부족 변은 생략)
      if (annotation) {
        var off5 = 50 * MESA0_PT_PER_MM / sN;
        var apList = ['top', 'bottom', 'left', 'right'];
        for (var api = 0; api < apList.length; api++) {
          var apos = apList[api];
          if (!annotPos[apos]) continue;
          if (finRealCm[apos] < 3) continue; // 여백 3cm 미만 변은 주석 생략
          var annBand = (apos === 'top') ? finMargins.top : (apos === 'bottom') ? finMargins.bottom :
            (apos === 'left') ? finMargins.left : finMargins.right;
          if (annBand <= 0.5) continue; // 스케일 후 밴드 0 방지
          try {
            var kColA = new CMYKColor(); kColA.cyan = 0; kColA.magenta = 0; kColA.yellow = 0; kColA.black = 100;
            var fsz = annBand * 0.5; if (fsz < 6) fsz = 6; if (fsz > 300) fsz = 300;
            var atf = newDoc.textFrames.add();
            atf.contents = annotation;
            atf.textRange.characterAttributes.size = fsz;
            atf.textRange.characterAttributes.fillColor = kColA;
            try { atf.textRange.characterAttributes.textFont = app.textFonts.getByName('MalgunGothic'); } catch (eFn) {} // 한글 폰트
            if (apos === 'top') atf.position = [bL + off5, (oT + bT) / 2 + fsz * 0.4];
            else if (apos === 'bottom') atf.position = [bL + off5, (bB + oB) / 2 + fsz * 0.4];
            else { // left/right — 세로 밴드 회전(밴드 중앙 정렬)
              var cx = (apos === 'left') ? ((bL + oL) / 2) : ((oR + bR) / 2);
              if (apos === 'left') { // 좌측: 90도(아래→위 읽기), 하단 코너서 5cm
                atf.rotate(90);
                var gbl = atf.geometricBounds, gwl = gbl[2] - gbl[0], ghl = gbl[1] - gbl[3];
                atf.position = [cx - gwl / 2, bB + off5 + ghl];
              } else { // 우측: 180도 기준(= -90도, 위→아래 읽기), 상단 코너서 5cm
                atf.rotate(-90);
                var gbr = atf.geometricBounds, gwr = gbr[2] - gbr[0];
                atf.position = [cx - gwr / 2, bT - off5];
              }
            }
            try { atf.createOutline(); } catch (eAo) {} // RIP 안전: 아웃라인
          } catch (eAnn) {}
        }
      }

      if (trim) {
        // ── 재단선(디자인 테두리 사방) = 돔보와 한 쌍 ──
        // 돔보는 재단 기준 마크이므로 재단선 없이는 반쪽이다(2026-07-30 실사용 지시).
        // 규약은 mes-sheet.jsx:386~393 과 동일 — 레이어 '재단선' · M100 실선 0.6 · 조각 외곽 사각.
        // 위치 = 디자인 경계(마감 여백 제외) = 기존 변별 마크와 같은 기준.
        // work.ai 는 이 블록 앞에서 이미 저장됐으므로 영향 없다(정제본 유지).
        var cutLayer = null;
        for (var cly = 0; cly < newDoc.layers.length; cly++) {
          if (newDoc.layers[cly].name === MESA0_CUT_LAYER) { cutLayer = newDoc.layers[cly]; break; }
        }
        if (!cutLayer) { cutLayer = newDoc.layers.add(); cutLayer.name = MESA0_CUT_LAYER; }
        try {
          var cCol = new CMYKColor(); cCol.cyan = 0; cCol.magenta = 100; cCol.yellow = 0; cCol.black = 0;
          var cRect = cutLayer.pathItems.rectangle(oT, oL, oR - oL, oT - oB); // rectangle(top,left,width,height)
          cRect.stroked = true; cRect.filled = false; cRect.strokeColor = cCol; cRect.strokeWidth = 0.6;
        } catch (eCut) {}

        var ar = newDoc.artboards[0].artboardRect;
        var tL = ar[0], tT = ar[1], tR = ar[2], tB = ar[3];
        var DOMBO_DIAM = 6 * MESA0_PT_PER_MM / sN;
        var CORNER_DIST = 17 * MESA0_PT_PER_MM / sN;
        var DIR_OFFSET = 60 * MESA0_PT_PER_MM / sN;
        var MAX_GAP = 500 * MESA0_PT_PER_MM / sN;
        var kCol = new CMYKColor(); kCol.cyan = 0; kCol.magenta = 0; kCol.yellow = 0; kCol.black = 100;
        function mkDombo(cx, cy) {
          var r = DOMBO_DIAM / 2;
          var el = newDoc.pathItems.ellipse(cy + r, cx - r, DOMBO_DIAM, DOMBO_DIAM);
          el.filled = true; el.stroked = false; el.fillColor = kCol;
        }
        function interDombo(from, to, fixed, horiz) {
          var span = to - from;
          if (span <= MAX_GAP) return;
          var n = Math.floor(span / MAX_GAP);
          var step = span / (n + 1);
          for (var ii = 1; ii <= n; ii++) {
            var pos = from + step * ii;
            if (horiz) mkDombo(pos, fixed); else mkDombo(fixed, pos);
          }
        }
        mkDombo(tL - CORNER_DIST, tT + CORNER_DIST);
        mkDombo(tR + CORNER_DIST, tT + CORNER_DIST);
        mkDombo(tL - CORNER_DIST, tB - CORNER_DIST);
        mkDombo(tR + CORNER_DIST, tB - CORNER_DIST);
        // 방향 돔보 = 짧은 변에. 가로>세로면 좌변(하단 모서리서 60mm 위), 아니면 상변(좌측서 60mm)
        if ((tR - tL) > (tT - tB)) mkDombo(tL - CORNER_DIST, tB - CORNER_DIST + DIR_OFFSET);
        else mkDombo(tL + DIR_OFFSET, tT + CORNER_DIST);
        interDombo(tL, tR, tT + CORNER_DIST, true);
        interDombo(tL, tR, tB - CORNER_DIST, true);
        interDombo(tB, tT, tL - CORNER_DIST, false);
        interDombo(tB, tT, tR + CORNER_DIST, false);
        var pad = CORNER_DIST + DOMBO_DIAM;
        newDoc.artboards[0].artboardRect = [tL - pad, tT + pad, tR + pad, tB - pad];
      }

      // 파일명: 거래처-키워드(사이즈)-후가공-개수EA[-식별번호][_1-N]
      // 원단종류는 여기서 생략(품목=주문서 저장 단계에서 부여). 후가공=main.js 조립(post_desc).
      if (!review) {
      var sizeStr = Math.round(realW) + 'x' + Math.round(realH);
      var kwSize = kwRaw ? (mesA0_sanitize(kwRaw) + '(' + sizeStr + ')') : sizeStr;
      var nameParts = [mesA0_sanitize(clientName), kwSize];
      if (postDesc) nameParts.push(mesA0_sanitize(postDesc));
      nameParts.push(qty + 'EA');
      if (seqNo != null && seqNo !== '') nameParts.push(mesA0_sanitize('' + seqNo));
      epsName = nameParts.join('-') + (sN > 1 ? '_1-' + sN : '') + '.eps';
      var epsFile = new File(jobFolder.fsName + '/' + epsName);
      var epsOpts = new EPSSaveOptions();
      epsOpts.cmykPostScript = true;
      epsOpts.compatibility = Compatibility.ILLUSTRATOR10;
      epsOpts.preview = EPSPreview.COLORTIFF;
      epsOpts.embedAllFonts = true;
      newDoc.saveAs(epsFile, epsOpts);

      // ── DXF (돔보 선택 시만 · 재단선 레이어만) ──
      // 트리거를 돔보로 둔 이유 = 돔보를 쓰는 건이 곧 재단하는 건이다(2026-07-30 지시).
      // 규약·옵션은 mes-sheet.jsx:450~468 과 동일(R21·mm·MaximumEditability).
      // ⚠️ 레이어 가시성을 되돌리지 않으면 이어지는 검토문서 이관·썸네일이 재단선만 남은 문서를 본다 →
      //    복원은 finally 성격으로 반드시 실행한다.
      if (trim) {
        var visSaved = [];
        try {
          for (var lv = 0; lv < newDoc.layers.length; lv++) {
            visSaved.push(newDoc.layers[lv].visible);
            newDoc.layers[lv].visible = (newDoc.layers[lv].name === MESA0_CUT_LAYER);
          }
          var dxfCand = epsName.replace(/\.eps$/i, '.dxf');
          var dxfFile = new File(jobFolder.fsName + '/' + dxfCand);
          var dxfOpts = new ExportOptionsAutoCAD();
          dxfOpts.exportFileFormat = AutoCADExportFileFormat.DXF;
          dxfOpts.version = AutoCADCompatibility.AutoCADRelease21;
          dxfOpts.unit = AutoCADUnit.Millimeters;
          dxfOpts.scaleLineweights = false;
          try { dxfOpts.exportOption = AutoCADExportOption.MaximumEditability; } catch (eDOpt) {}
          newDoc.exportFile(dxfFile, ExportType.AUTOCAD, dxfOpts);
          dxfName = dxfCand; // 성공했을 때만 채운다 = manifest·반환값이 없는 파일을 가리키지 않게
        } catch (eDxf) {}
        for (var lr = 0; lr < newDoc.layers.length && lr < visSaved.length; lr++) {
          try { newDoc.layers[lr].visible = visSaved[lr]; } catch (eVs) {}
        }
      }

      try {
        var outDir = new Folder(MESA0_REGISTER_ROOT + '/_출력/' + ymd);
        if (!outDir.exists) outDir.create();
        epsFile.copy(outDir.fsName + '/' + epsName);
        // 재단기 픽업 지점 — EPS와 같은 폴더에 둔다(판짜기 mes-sheet.jsx:485 와 동일 규칙)
        if (dxfName) new File(jobFolder.fsName + '/' + dxfName).copy(outDir.fsName + '/' + dxfName);
      } catch (eCp) {}
      } // !review
    }

    if (!review) {
      var abNow = newDoc.artboards[0].artboardRect;
      var abW = abNow[2] - abNow[0], abH = abNow[1] - abNow[3];
      var maxPt = Math.max(abW, abH);
      var pct = maxPt > 0 ? Math.min(100, (400 / maxPt) * 100) : 100;
      var pngFile = new File(jobFolder.fsName + '/thumb' + sfx + '.png');
      var pngOpts = new ExportOptionsPNG24();
      pngOpts.artBoardClipping = true;
      pngOpts.horizontalScale = pct;
      pngOpts.verticalScale = pct;
      newDoc.exportFile(pngFile, ExportType.PNG24, pngOpts);
    }

    if (review) {
      // 검토문서 이관(D4): 가공 결과(마감·돔보 포함)를 검토문서 타일 아트보드로 옮기고 복제문서를 닫는다.
      var rres = mesA0_reviewPlace(newDoc);
      if (rres !== 'ok') {
        try { newDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eRc) {}
        return '{"ok":false,"err":"review:' + mesA0_jsonEsc(rres) + '"}';
      }
      return '{"ok":true,"review":1,"w":' + (Math.round(realW * 10) / 10) + ',"h":' + (Math.round(realH * 10) / 10) + ',"mode":"' + mode + '"}';
    }

    okAll = true;
  } catch (eProc) {
    try { newDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eCl0) {}
    return '{"ok":false,"err":"proc:' + mesA0_jsonEsc('' + eProc) + '"}';
  }
  try { newDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eCl) {}
  if (!okAll) return '{"ok":false,"err":"proc"}';

  // manifest — mes-core 스키마 유지 + worker/source 필드 추가(ingest 계약 불변)
  var manifest = {
    manifest_version: 1,
    script_version: MESA0_VERSION,
    registered_by: pcName + '\\' + userName,
    worker_name: P.worker_name || null,
    worker_id: (P.registered_by_id != null) ? P.registered_by_id : null,
    source: 'cep',
    pc_name: pcName,
    entity_id: 1,
    client_name: clientName,
    client_id: (P.client_id != null) ? P.client_id : null,
    qty: qty,
    finishing: (hasFinishing || hasMark) ? finJson : null,
    trim: trim,
    border_line: (P.border_line !== false), // 출력 경계선 적용 여부(추적용 — 산출물 차이의 근거)
    punch: punch,
    keyword: kwRaw || null,
    post_desc: postDesc || null,
    annotation: annotation || null,
    annot_pos: annotation ? annotPos : null,
    identifier: seqNo,
    scale_pct: Math.round(100 / sN),
    measured_cm: { w: Math.round(realW * 10) / 10, h: Math.round(realH * 10) / 10 },
    mode: mode,
    order_item_id: orderItemId,
    // dxf = 돔보 선택 시 재단선 레이어만 담은 재단 데이터(없으면 null). ingest 는 무시 — 추적용
    files: { work_ai: 'work' + sfx + '.ai', eps: epsName, dxf: dxfName, thumb: 'thumb' + sfx + '.png', work_bytes: workBytes },
    batch_folder: batchFolder || null,
    batch_index: (P.batch_index != null && P.batch_index !== '') ? P.batch_index : null,
    outline_failed: outlineFailed,
    // embedded_rasters·oversize_* = 용량 근본원인 추적(ingest 는 무시 — border_line 과 같은 추적용 필드)
    preflight: { source_rgb: pfSourceRGB, remaining_text: pfRemainingText, linked_images: pfLinkedImages,
      embedded_rasters: pfRasters, oversize_rasters: pfOversize, oversize_max_pct: pfOversizeMax },
    created_at_kst: now.getFullYear() + '-' + mesA0_pad2(now.getMonth() + 1) + '-' + mesA0_pad2(now.getDate()) +
      ' ' + mesA0_pad2(now.getHours()) + ':' + mesA0_pad2(now.getMinutes()) + ':' + mesA0_pad2(now.getSeconds())
  };
  if (!mesA0_writeText(jobFolder.fsName + '/manifest' + sfx + '.json', mesA0_toJson(manifest)))
    return '{"ok":false,"err":"manifest"}';

  var warn = (pfSourceRGB ? 'R' : '') + (pfRemainingText > 0 ? 'T' : '') + (pfLinkedImages > 0 ? 'L' : '') + (outlineFailed ? 'O' : '') +
    (pfOversize > 0 ? 'E' : '');
  return '{"ok":true,"folder":"' + mesA0_jsonEsc(folderName) + '","eps":' +
    (epsName ? ('"' + mesA0_jsonEsc(epsName) + '"') : 'null') +
    ',"dxf":' + (dxfName ? ('"' + mesA0_jsonEsc(dxfName) + '"') : 'null') +
    ',"w":' + (Math.round(realW * 10) / 10) + ',"h":' + (Math.round(realH * 10) / 10) +
    ',"items":' + diagItems + ',"normed":' + normed +
    ',"bytes":' + workBytes + ',"oversize":' + pfOversize +
    ',"mode":"' + mode + '","warn":"' + warn + '"}';
}

// ── 반자동 큐 (A2) — 선택 보관 = 호스트 전역(같은 파일 열려있는 동안 참조 유효) ──
// 확정 배치 = 패널이 각 행 세팅을 params로 쓰고 → queueSelect(i) → mesA0_process() 반복(검증된 가공 재사용)
function mesA0_queueEnsure() { if (!$.global.mesA0Q) $.global.mesA0Q = []; return $.global.mesA0Q; }

function mesA0_queueAdd() {
  if (app.documents.length === 0) return '{"ok":false,"err":"nodoc"}';
  var d = app.activeDocument;
  if (!d.selection || d.selection.length === 0) return '{"ok":false,"err":"nosel"}';
  var items = [];
  for (var i = 0; i < d.selection.length; i++) items.push(d.selection[i]);
  var ub = mesA0_clipUnion(items) || mesA0_unionBounds(items); // 클립 존중(메타 표시 정확)
  if (!ub) return '{"ok":false,"err":"nobounds"}';
  var q = mesA0_queueEnsure();
  q.push({ doc: d, items: items });
  var w = (ub[2] - ub[0]) / MESA0_PT_PER_MM / 10, h = (ub[1] - ub[3]) / MESA0_PT_PER_MM / 10;
  return '{"ok":true,"n":' + q.length + ',"w":' + (Math.round(w * 10) / 10) + ',"h":' + (Math.round(h * 10) / 10) + ',"items":' + items.length + '}';
}

// 선택 다중 개체를 공간 근접/겹침으로 클러스터(각 클러스터=1디자인). gapPt 이내면 병합.
// 경계=클립 존중(mesA0_itemBounds) — 클립 밖 블리드로 부풀린 visibleBounds가 이웃과 거짓 겹침 →
// 나열된 디자인이 거짓 병합되던 문제 방지(실측과 동일 기준).
function mesA0_cluster(items, gapPt) {
  var rects = [];
  for (var i = 0; i < items.length; i++) {
    var b = null;
    try { b = mesA0_itemBounds(items[i]); } catch (e) {}
    if (!b) { try { b = items[i].visibleBounds; } catch (e2) {} }
    if (b) rects.push({ item: items[i], L: b[0], T: b[1], R: b[2], B: b[3], cid: i });
  }
  var g = gapPt / 2;
  function ov(a, bb) { // 확장 rect(y-up: T>B) 겹침
    return (a.L - g) <= (bb.R + g) && (bb.L - g) <= (a.R + g) && (a.B - g) <= (bb.T + g) && (bb.B - g) <= (a.T + g);
  }
  var changed = true;
  while (changed) {
    changed = false;
    for (var x = 0; x < rects.length; x++) {
      for (var y = x + 1; y < rects.length; y++) {
        if (rects[x].cid === rects[y].cid) continue;
        if (ov(rects[x], rects[y])) {
          var from = rects[y].cid, to = rects[x].cid;
          for (var z = 0; z < rects.length; z++) if (rects[z].cid === from) rects[z].cid = to;
          changed = true;
        }
      }
    }
  }
  var groups = {}, order = [];
  for (var w = 0; w < rects.length; w++) {
    var c = rects[w].cid;
    if (!groups[c]) { groups[c] = []; order.push(c); }
    groups[c].push(rects[w].item);
  }
  var out = [];
  for (var o = 0; o < order.length; o++) out.push(groups[order[o]]);
  return out;
}

// 공용 시드(묶음분리·자동감지): 후보를 노이즈 제거→클러스터→큐 행 추가. 응답 계약 동일(added/total/sizes).
function mesA0_seedQueueJson(d, cands, gapMm) {
  // 50mm 노이즈 제외 — 클립 존중 경계 기준(블리드로 부풀린 겉보기 대신 실제 디자인 크기)
  var MIN = 50 * MESA0_PT_PER_MM;
  var kept = [];
  for (var i = 0; i < cands.length; i++) {
    var it = cands[i], b = null;
    try { b = mesA0_itemBounds(it); } catch (eB) {}
    if (!b) { try { b = it.visibleBounds; } catch (eB2) {} }
    if (!b) continue;
    if (Math.abs(b[2] - b[0]) >= MIN || Math.abs(b[1] - b[3]) >= MIN) kept.push(it);
  }
  if (!kept.length) return '{"ok":false,"err":"allnoise"}';
  var gap = parseFloat(gapMm); if (isNaN(gap)) gap = 0; // 0=겹칠때만 · 음수=더 잘게 분리(겹침 깊이 요구)
  var clusters = mesA0_cluster(kept, gap * MESA0_PT_PER_MM);
  if (!clusters.length) return '{"ok":false,"err":"nobounds"}';
  // ── 공간 정렬: 위→아래, 같은 줄에서는 좌→우 (2026-07-30 지시) ──
  // 클러스터 순서는 선택·순회 순서(사실상 z-order)라 화면에 보이는 순서와 무관했다.
  // 행 번호가 눈에 보이는 순서와 어긋나면 행 다중선택이 헷갈려 쓸 수 없다.
  // ⚠️ 정렬은 **반드시 여기서** 한다. 패널이 표시만 바꾸면 mesA0_queueSelect(i)·확정 루프의
  //    인덱스가 어긋나 "고른 것과 다른 조각이 등록되는" 사고가 된다(인덱스 단일 소스 = 이 배열).
  var entries = [];
  for (var c = 0; c < clusters.length; c++) {
    var ub0 = mesA0_clipUnion(clusters[c]) || mesA0_unionBounds(clusters[c]);
    if (!ub0) continue;
    entries.push({ items: clusters[c], b: ub0 });
  }
  if (!entries.length) return '{"ok":false,"err":"nobounds"}';
  // BAND = 같은 줄 판정 허용오차. 조금 어긋나게 놓인 조각이 다른 줄로 튀는 것을 막는다.
  var BAND = 20 * MESA0_PT_PER_MM;
  entries.sort(function (p1, p2) {
    var dt = p2.b[1] - p1.b[1];              // top 이 큰(위에 있는) 것이 먼저
    if (Math.abs(dt) > BAND) return dt;
    return p1.b[0] - p2.b[0];                // 같은 줄 → left 작은(왼쪽) 것이 먼저
  });

  var q = mesA0_queueEnsure();
  var sizes = [];
  for (var e2 = 0; e2 < entries.length; e2++) {
    var ub = entries[e2].b;
    q.push({ doc: d, items: entries[e2].items });
    sizes.push('{"w":' + (Math.round((ub[2] - ub[0]) / MESA0_PT_PER_MM / 10 * 10) / 10) +
      ',"h":' + (Math.round((ub[1] - ub[3]) / MESA0_PT_PER_MM / 10 * 10) / 10) + ',"items":' + entries[e2].items.length + '}');
  }
  return '{"ok":true,"added":' + sizes.length + ',"total":' + q.length + ',"sizes":[' + sizes.join(',') + ']}';
}

// 묶음 추가 — 선택 전체를 클러스터로 분리해 각각 큐 행으로. gapMm 이내는 한 디자인.
function mesA0_queueAddBatch(gapMm) {
  if (app.documents.length === 0) return '{"ok":false,"err":"nodoc"}';
  var d = app.activeDocument;
  if (!d.selection || d.selection.length === 0) return '{"ok":false,"err":"nosel"}';
  var cands = [];
  for (var i = 0; i < d.selection.length; i++) cands.push(d.selection[i]);
  return mesA0_seedQueueJson(d, cands, gapMm);
}

// 자동감지 시드(A3, spec D2) — 선택 불필요: 라이브 문서 top-level 아이템(잠금·숨김 레이어 제외) 전체에서
// 디자인 후보 감지. read-only(원본 불가침 — 변형은 확정 시 복제문서에서만). 시드 오류는 큐에서 삭제·개별추가로 교정.
function mesA0_autoDetect(gapMm) {
  if (app.documents.length === 0) return '{"ok":false,"err":"nodoc"}';
  var d = app.activeDocument;
  var tops = [];
  function collectLayer(ly) {
    try {
      if (ly.locked || !ly.visible) return;
      for (var i = 0; i < ly.pageItems.length; i++) {
        var it = ly.pageItems[i];
        try { if (!it.locked && !it.hidden) tops.push(it); } catch (eIt) {}
      }
      for (var s = 0; s < ly.layers.length; s++) collectLayer(ly.layers[s]);
    } catch (eLy) {}
  }
  try { for (var l = 0; l < d.layers.length; l++) collectLayer(d.layers[l]); }
  catch (eScan) { return '{"ok":false,"err":"scan"}'; }
  if (!tops.length) return '{"ok":false,"err":"noitems"}';
  return mesA0_seedQueueJson(d, tops, gapMm);
}

function mesA0_queueCount() { return '' + mesA0_queueEnsure().length; }
function mesA0_queueClear() { $.global.mesA0Q = []; return 'ok'; }

function mesA0_queueRemove(idx) {
  var q = mesA0_queueEnsure();
  var i = parseInt(idx, 10);
  if (!isNaN(i) && i >= 0 && i < q.length) q.splice(i, 1);
  return '' + q.length;
}

// 큐 i번을 현재 선택으로 복원(확정 배치의 각 스텝 — 이후 mesA0_process 호출)
function mesA0_queueSelect(idx) {
  var q = mesA0_queueEnsure();
  var i = parseInt(idx, 10);
  if (isNaN(i) || i < 0 || i >= q.length) return '{"ok":false,"err":"range"}';
  var e = q[i];
  try {
    app.activeDocument = e.doc;      // 원본 파일이 닫혔으면 예외
    e.doc.selection = null;
    e.doc.selection = e.items;       // 참조 무효면 예외/빈선택
    if (!e.doc.selection || e.doc.selection.length === 0) return '{"ok":false,"err":"stale"}';
    return '{"ok":true,"n":' + e.doc.selection.length + '}';
  } catch (err) { return '{"ok":false,"err":"docgone"}'; }
}

// ── 검토문서(D4): 큐 N디자인을 디자인당 아트보드 타일로 가공 미리보기 — 저장 없음, 확정 게이트의 근거 ──
// 캔버스/아트보드 한도 577cm(A0 실측) → 5500mm 안전값. 목표크기로 문서 생성(작은 문서 리사이즈 금지 — spec §6).
// 초과 시 검토문서 분할(순차 폴백). 상태=$.global.mesA0Rev {docs[], x,y(타일 커서·아래로+), rowH, count, ox,oy(원점), first}
var MESA0_REVIEW_LIMIT_MM = 5500;
var MESA0_REVIEW_GAP_MM = 50;

function mesA0_reviewEnsure() {
  if (!$.global.mesA0Rev) $.global.mesA0Rev = { docs: [], x: 0, y: 0, rowH: 0, count: 0, ox: 0, oy: 0, first: true };
  return $.global.mesA0Rev;
}

function mesA0_reviewDiscard() {
  var R = $.global.mesA0Rev;
  if (R && R.docs) for (var i = 0; i < R.docs.length; i++) { try { R.docs[i].close(SaveOptions.DONOTSAVECHANGES); } catch (e) {} }
  $.global.mesA0Rev = null;
  return 'ok';
}

function mesA0_reviewBegin() { mesA0_reviewDiscard(); mesA0_reviewEnsure(); return '{"ok":true}'; }

function mesA0_reviewNewDoc(R) {
  var lim = MESA0_REVIEW_LIMIT_MM * MESA0_PT_PER_MM;
  var rd = app.documents.add(DocumentColorSpace.CMYK, lim, lim);
  R.docs.push(rd);
  var ab = rd.artboards[0].artboardRect;
  R.ox = ab[0]; R.oy = ab[1]; // 좌상 원점 — 타일 좌표는 이 기준 오프셋
  R.x = 0; R.y = 0; R.rowH = 0; R.first = true;
  return rd;
}

// 가공 완료된 복제문서(newDoc)를 검토문서 타일 아트보드로 이관 후 닫는다. 성공='ok', 실패=사유.
// cross-doc duplicate가 CEP eval 컨텍스트서 실패하는 전례(process 주석) → copy/paste로 이관.
function mesA0_reviewPlace(newDoc) {
  var R = mesA0_reviewEnsure();
  var lim = MESA0_REVIEW_LIMIT_MM * MESA0_PT_PER_MM;
  var gap = MESA0_REVIEW_GAP_MM * MESA0_PT_PER_MM;
  var AB = newDoc.artboards[0].artboardRect; // 타일 크기 = 가공 아트보드(여백·돔보 패드 포함)
  var wPt = AB[2] - AB[0], hPt = AB[1] - AB[3];
  if (wPt > lim || hPt > lim) return 'toobig'; // 이론상 저장스케일 1/N이 선차단 — 방어
  var tops = [];
  for (var i = 0; i < newDoc.pageItems.length; i++) {
    try { var it = newDoc.pageItems[i]; if (it.parent && it.parent.typename === 'Layer') tops.push(it); } catch (e0) {}
  }
  if (!tops.length) return 'empty';
  var ub = mesA0_unionBounds(tops);
  if (!ub) return 'nobounds';
  var relDx = ub[0] - AB[0], relDy = ub[1] - AB[1]; // 아이템 union의 아트보드 대비 상대 오프셋 보존
  try {
    app.activeDocument = newDoc;
    newDoc.selection = null;
    newDoc.selection = tops;
    app.copy();
  } catch (eCp) { return 'copy:' + eCp; }
  try { newDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eCl) {}
  var rd = R.docs.length ? R.docs[R.docs.length - 1] : mesA0_reviewNewDoc(R);
  if (R.x > 0 && R.x + wPt > lim) { R.x = 0; R.y += R.rowH + gap; R.rowH = 0; } // 줄바꿈
  if (R.y + hPt > lim) rd = mesA0_reviewNewDoc(R);                              // 문서 분할(순차 폴백)
  try {
    app.activeDocument = rd;
    app.paste();
    var pasted = [];
    for (var p = 0; p < rd.selection.length; p++) pasted.push(rd.selection[p]);
    if (!pasted.length) return 'paste0';
    var pb = mesA0_unionBounds(pasted);
    if (!pb) return 'pastebounds';
    var tileL = R.ox + R.x, tileT = R.oy - R.y;
    var dx = (tileL + relDx) - pb[0], dy = (tileT + relDy) - pb[1];
    for (var t = 0; t < pasted.length; t++) { try { pasted[t].translate(dx, dy); } catch (eT) {} }
    var abRect = [tileL, tileT, tileL + wPt, tileT - hPt];
    if (R.first) { rd.artboards[0].artboardRect = abRect; R.first = false; }
    else rd.artboards.add(abRect);
    rd.selection = null;
    R.x += wPt + gap;
    if (hPt > R.rowH) R.rowH = hPt;
    R.count++;
    return 'ok';
  } catch (ePl) { return 'place:' + ePl; }
}

function mesA0_reviewEnd() {
  var R = $.global.mesA0Rev;
  if (!R || !R.docs.length || !R.count) return '{"ok":false,"err":"noreview"}';
  try {
    app.activeDocument = R.docs[R.docs.length - 1];
    app.executeMenuCommand('fitall'); // 전체 보기 — 아트보드 이동/줌으로 검토
  } catch (e) {}
  return '{"ok":true,"docs":' + R.docs.length + ',"count":' + R.count + '}';
}

// 배치 시작 — 묶음 공유 폴더 1개 생성, 폴더명 반환(각 디자인은 이 폴더에 _식별번호 접미로 평면 저장)
function mesA0_batchBegin() {
  var now = new Date();
  var ymd = '' + now.getFullYear() + mesA0_pad2(now.getMonth() + 1) + mesA0_pad2(now.getDate());
  var hms = mesA0_pad2(now.getHours()) + mesA0_pad2(now.getMinutes()) + mesA0_pad2(now.getSeconds());
  var pcName = $.getenv('COMPUTERNAME') || 'PC';
  var folderName = ymd + '_' + hms + '_' + mesA0_sanitize(pcName) + '_batch' + (now.getTime() % 1000);
  var f = new Folder(MESA0_REGISTER_ROOT + '/' + folderName);
  if (!f.exists && !f.create()) return '{"ok":false,"err":"nofolder"}';
  return '{"ok":true,"folder":"' + mesA0_jsonEsc(folderName) + '"}';
}
