#target illustrator
// MES A0 CEP panel — ExtendScript host bridge (A1 usable: mes-core 처리 포팅)
// ES3(ExtendScript)만: arrow/const/let/JSON 금지. 파일 인코딩 = UTF-8.
// spec: docs/superpowers/specs/2026-07-23-ia-palette-session-loop.md (CEP 승격)
// 한글은 params 파일(cep.fs UTF-8)로만 전달 — evalScript 인자/반환은 ASCII만.
// 처리 로직 정본 = IllustratorAutomat/designer/mes-core.jsx (동일 산출물·manifest 스키마 유지).

var MESA0_VERSION = 'A0-CEP-0.1.0';
var MESA0_REGISTER_ROOT = 'Z:/DESIGNS/IA-등록';
var MESA0_PT_PER_MM = 72 / 25.4;
var MESA0_SIDES = ['top', 'bottom', 'left', 'right'];

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

// 현재 선택 실측 (cm) — ASCII JSON
function mesA0_measure() {
  if (app.documents.length === 0) return '{"ok":false,"err":"nodoc"}';
  var d = app.activeDocument;
  if (!d.selection || d.selection.length === 0) return '{"ok":false,"err":"nosel"}';
  var sel = [];
  for (var i = 0; i < d.selection.length; i++) sel.push(d.selection[i]);
  var ub = mesA0_unionBounds(sel);
  if (!ub) return '{"ok":false,"err":"nobounds"}';
  var w = (ub[2] - ub[0]) / MESA0_PT_PER_MM / 10;
  var h = (ub[1] - ub[3]) / MESA0_PT_PER_MM / 10;
  return '{"ok":true,"w":' + (Math.round(w * 10) / 10) + ',"h":' + (Math.round(h * 10) / 10) + ',"n":' + sel.length + '}';
}

// 가공 실행 — params 파일(UTF-8) 읽어 mes-core 로직 수행. 반환=ASCII JSON.
function mesA0_process() {
  var raw = mesA0_readText(mesA0_paramsPath());
  if (!raw) return '{"ok":false,"err":"noparams"}';
  var P;
  try { P = eval('(' + raw + ')'); } catch (e) { return '{"ok":false,"err":"badparams"}'; }

  if (app.documents.length === 0) return '{"ok":false,"err":"nodoc"}';
  var srcDoc = app.activeDocument;
  if (!srcDoc.selection || srcDoc.selection.length === 0) return '{"ok":false,"err":"nosel"}';
  var sel = [];
  for (var si = 0; si < srcDoc.selection.length; si++) sel.push(srcDoc.selection[si]);
  var ub = mesA0_unionBounds(sel);
  if (!ub) return '{"ok":false,"err":"nobounds"}';
  var fileWCm = (ub[2] - ub[0]) / MESA0_PT_PER_MM / 10;
  var fileHCm = (ub[1] - ub[3]) / MESA0_PT_PER_MM / 10;

  // 파라미터
  var qty = parseInt(P.qty, 10); if (isNaN(qty) || qty < 1) qty = 1;
  var sN = parseInt(P.scale_n, 10); if (isNaN(sN) || sN < 1) sN = 1;
  var mode = (P.mode === 'impose') ? 'impose' : ((P.mode === 'both') ? 'both' : 'single');
  var trim = !!P.trim;
  var fin = P.finishing || {};
  var finJson = {}, finMargins = {}, hasFinishing = false;
  for (var fs = 0; fs < MESA0_SIDES.length; fs++) {
    var sd = MESA0_SIDES[fs];
    var mName = fin[sd] || '';
    var cmVal = parseFloat(fin[sd + '_cm']); if (isNaN(cmVal)) cmVal = 0;
    if (mName) { finJson[sd] = mName; finJson[sd + '_cm'] = cmVal; hasFinishing = true; }
    finMargins[sd] = (mName ? cmVal : 0) * 10 * MESA0_PT_PER_MM / sN;
  }
  var docBase = mesA0_sanitize(String(srcDoc.name).replace(/\.[^.]+$/, ''));
  var clientName = P.client_name ? mesA0_sanitize(P.client_name) : docBase;
  var orderItemId = (P.order_item_id != null) ? P.order_item_id : null;
  var realW = fileWCm * sN, realH = fileHCm * sN;

  var pfSourceRGB = false;
  try { pfSourceRGB = (srcDoc.documentColorSpace == DocumentColorSpace.RGB); } catch (ePf0) {}
  var pfRemainingText = 0, pfLinkedImages = 0;

  var now = new Date();
  var ymd = '' + now.getFullYear() + mesA0_pad2(now.getMonth() + 1) + mesA0_pad2(now.getDate());
  var hms = mesA0_pad2(now.getHours()) + mesA0_pad2(now.getMinutes()) + mesA0_pad2(now.getSeconds());
  var pcName = $.getenv('COMPUTERNAME') || 'PC';
  var userName = $.getenv('USERNAME') || '';
  var folderName = ymd + '_' + hms + '_' + mesA0_sanitize(pcName) + '_' + (now.getTime() % 1000);
  var jobFolder = new Folder(MESA0_REGISTER_ROOT + '/' + folderName);
  if (!jobFolder.exists && !jobFolder.create()) return '{"ok":false,"err":"nofolder"}';

  // 원본 선택을 클립보드로 복사(cross-doc duplicate가 CEP eval 컨텍스트서 0개 실패 → copy/paste 대체)
  // srcDoc 활성·선택 유효 상태에서 먼저 복사(참조 stale 방지). 원본 불가침(복사만·무변경).
  var copyErr = '';
  try { app.activeDocument = srcDoc; srcDoc.selection = sel; app.copy(); } catch (eCopy) { copyErr = '' + eCopy; }

  var newDoc = app.documents.add(DocumentColorSpace.CMYK, (ub[2] - ub[0]) || 100, (ub[1] - ub[3]) || 100);
  var okAll = false, outlineFailed = false, epsName = null, diagItems = 0, normed = 0;
  try {
    app.activeDocument = newDoc;
    app.paste(); // 신규문서 중앙에 붙음(절대위치는 이후 정규화로 원점 이동)

    try { for (var ti = newDoc.textFrames.length - 1; ti >= 0; ti--) newDoc.textFrames[ti].createOutline(); }
    catch (eOl) { outlineFailed = true; }
    try { pfRemainingText = newDoc.textFrames.length; } catch (ePf1) {}
    try { pfLinkedImages = newDoc.placedItems.length; } catch (ePf2) {}

    diagItems = newDoc.pageItems.length;
    // 위치 정규화: 복제 아트를 원점 근처로 이동(원본 절대좌표·신규문서 캔버스 범위 무관) — top-level만 이동(중첩 이중이동 방지)
    var pre = mesA0_docUnion(newDoc);
    if (pre) {
      var dx = -pre[0], dy = -pre[1];
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        for (var pn = 0; pn < newDoc.pageItems.length; pn++) {
          var itn = newDoc.pageItems[pn];
          try { if (itn.parent && itn.parent.typename === 'Layer') { itn.translate(dx, dy); normed++; } } catch (eTr) {}
        }
      }
    }
    var db = mesA0_docUnion(newDoc);
    if (!db) { // 복제 실패/측정 불가 — 쓰레기 산출 대신 진단 반환
      try { newDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eC0) {}
      return '{"ok":false,"err":"noart","items":' + diagItems + ',"sel":' + sel.length + ',"copyErr":"' + mesA0_jsonEsc(copyErr) + '"}';
    }
    newDoc.artboards[0].artboardRect = [db[0], db[1], db[2], db[3]];

    var workFile = new File(jobFolder.fsName + '/work.ai');
    newDoc.saveAs(workFile, new IllustratorSaveOptions());

    if (mode !== 'impose') {
      var oL = db[0], oT = db[1], oR = db[2], oB = db[3];
      newDoc.artboards[0].artboardRect = [oL - finMargins.left, oT + finMargins.top, oR + finMargins.right, oB - finMargins.bottom];

      if (hasFinishing) {
        var mCol = new CMYKColor(); mCol.cyan = 0; mCol.magenta = 100; mCol.yellow = 0; mCol.black = 0;
        function foldLine(x1, y1, x2, y2) {
          var ln = newDoc.pathItems.add();
          ln.setEntirePath([[x1, y1], [x2, y2]]);
          ln.stroked = true; ln.filled = false;
          ln.strokeColor = mCol; ln.strokeWidth = 0.6;
        }
        if (finMargins.top > 0) foldLine(oL, oT, oR, oT);
        if (finMargins.bottom > 0) foldLine(oL, oB, oR, oB);
        if (finMargins.left > 0) foldLine(oL, oT, oL, oB);
        if (finMargins.right > 0) foldLine(oR, oT, oR, oB);
      }

      // 여백 포함 바깥 테두리 백색 선 (도련 대신 — RIP가 여백까지 출력영역으로 포함하도록)
      var bL = oL - finMargins.left, bT = oT + finMargins.top, bR = oR + finMargins.right, bB = oB - finMargins.bottom;
      var wCol = new CMYKColor(); wCol.cyan = 0; wCol.magenta = 0; wCol.yellow = 0; wCol.black = 0;
      var borderRect = newDoc.pathItems.rectangle(bT, bL, bR - bL, bT - bB); // rectangle(top,left,width,height)
      borderRect.filled = false;
      borderRect.stroked = true;
      borderRect.strokeColor = wCol;
      borderRect.strokeWidth = 0.5;

      if (trim) {
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
        mkDombo(tL + DIR_OFFSET, tT + CORNER_DIST);
        interDombo(tL, tR, tT + CORNER_DIST, true);
        interDombo(tL, tR, tB - CORNER_DIST, true);
        interDombo(tB, tT, tL - CORNER_DIST, false);
        interDombo(tB, tT, tR + CORNER_DIST, false);
        var pad = CORNER_DIST + DOMBO_DIAM;
        newDoc.artboards[0].artboardRect = [tL - pad, tT + pad, tR + pad, tB - pad];
      }

      epsName = ymd + '-' + mesA0_sanitize(clientName) + '-' +
        Math.round(realW) + 'x' + Math.round(realH) + '-' + qty + 'EA' +
        (sN > 1 ? '_1-' + sN : '') + '.eps';
      var epsFile = new File(jobFolder.fsName + '/' + epsName);
      var epsOpts = new EPSSaveOptions();
      epsOpts.cmykPostScript = true;
      epsOpts.compatibility = Compatibility.ILLUSTRATOR10;
      epsOpts.preview = EPSPreview.COLORTIFF;
      epsOpts.embedAllFonts = true;
      newDoc.saveAs(epsFile, epsOpts);

      try {
        var outDir = new Folder(MESA0_REGISTER_ROOT + '/_출력/' + ymd);
        if (!outDir.exists) outDir.create();
        epsFile.copy(outDir.fsName + '/' + epsName);
      } catch (eCp) {}
    }

    var abNow = newDoc.artboards[0].artboardRect;
    var abW = abNow[2] - abNow[0], abH = abNow[1] - abNow[3];
    var maxPt = Math.max(abW, abH);
    var pct = maxPt > 0 ? Math.min(100, (400 / maxPt) * 100) : 100;
    var pngFile = new File(jobFolder.fsName + '/thumb.png');
    var pngOpts = new ExportOptionsPNG24();
    pngOpts.artBoardClipping = true;
    pngOpts.horizontalScale = pct;
    pngOpts.verticalScale = pct;
    newDoc.exportFile(pngFile, ExportType.PNG24, pngOpts);

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
    finishing: hasFinishing ? finJson : null,
    trim: trim,
    scale_pct: Math.round(100 / sN),
    measured_cm: { w: Math.round(realW * 10) / 10, h: Math.round(realH * 10) / 10 },
    mode: mode,
    order_item_id: orderItemId,
    files: { work_ai: 'work.ai', eps: epsName, thumb: 'thumb.png' },
    outline_failed: outlineFailed,
    preflight: { source_rgb: pfSourceRGB, remaining_text: pfRemainingText, linked_images: pfLinkedImages },
    created_at_kst: now.getFullYear() + '-' + mesA0_pad2(now.getMonth() + 1) + '-' + mesA0_pad2(now.getDate()) +
      ' ' + mesA0_pad2(now.getHours()) + ':' + mesA0_pad2(now.getMinutes()) + ':' + mesA0_pad2(now.getSeconds())
  };
  if (!mesA0_writeText(jobFolder.fsName + '/manifest.json', mesA0_toJson(manifest)))
    return '{"ok":false,"err":"manifest"}';

  var warn = (pfSourceRGB ? 'R' : '') + (pfRemainingText > 0 ? 'T' : '') + (pfLinkedImages > 0 ? 'L' : '') + (outlineFailed ? 'O' : '');
  return '{"ok":true,"folder":"' + mesA0_jsonEsc(folderName) + '","eps":' +
    (epsName ? ('"' + mesA0_jsonEsc(epsName) + '"') : 'null') +
    ',"w":' + (Math.round(realW * 10) / 10) + ',"h":' + (Math.round(realH * 10) / 10) +
    ',"items":' + diagItems + ',"normed":' + normed +
    ',"mode":"' + mode + '","warn":"' + warn + '"}';
}
