// mes-core.jsx — MES 가공 (디자이너 세션 루프 P0) v0.1.0
// 정본 위치: Z:\DESIGNS\IA-등록\_scripts\mes-core.jsx (부트스트랩 스텁이 $.evalFile로 로드)
// spec: docs/superpowers/specs/2026-07-16-ia-designer-session-loop.md
// 흐름: 선택 객체 = 디자인(D2) → 미니창 → 복제 문서 가공(D3, 원본 불가침)
//        → work.ai(가공 전 정제본) + EPS(마감·돔보) + thumb.png 저장
//        → manifest.json (커밋 마커: 반드시 '마지막'에 기록) → 에이전트 ingest
// ES3(ExtendScript) — JSON/indexOf/map 등 최신 문법 사용 금지. 파일 인코딩 = UTF-8 BOM.
#target illustrator

(function () {
  var SCRIPT_VERSION = '0.1.0';
  var REGISTER_ROOT = 'Z:/DESIGNS/IA-등록';
  var PT_PER_MM = 72 / 25.4;

  /**
   * mm 단위 문서를 만든다 — `app.documents.add()` 를 이걸로 대체한다.
   * ★`documents.add()` 가 만드는 문서는 눈금이 **point** 다. `doc.rulerUnits` 대입은 읽기 전용이라
   *   아무 일도 하지 않고, `preferences rulerType` 도 안 통한다 — **DocumentPreset 이 유일한 경로다**
   *   ([[feedback-illustrator-doc-units]], AI 30.7 실측 2026-08-25). 기하는 불변이고 눈금만 바뀐다.
   * ⚠️ `mes-a0-host.jsx` `mesA0_newDocMM` 과 같은 내용의 사본.
   */
  function mesCore_newDocMM(wPt, hPt) {
    try {
      var dp = new DocumentPreset();
      dp.units = RulerUnits.Millimeters;
      dp.colorMode = DocumentColorSpace.CMYK;
      dp.width = wPt;
      dp.height = hPt;
      return app.documents.addDocument('[Default] Print', dp);
    } catch (eU) {
      return app.documents.add(DocumentColorSpace.CMYK, wPt, hPt);
    }
  }

  // ══ 가드 ══
  if (app.documents.length === 0) { alert('열린 문서가 없습니다.'); return; }
  var srcDoc = app.activeDocument;
  if (!srcDoc.selection || srcDoc.selection.length === 0) {
    alert('디자인 객체를 먼저 선택해 주세요.\n(선택한 객체 전체가 하나의 디자인으로 등록됩니다)');
    return;
  }
  var sel = [];
  for (var si = 0; si < srcDoc.selection.length; si++) sel.push(srcDoc.selection[si]);

  // ══ 유틸 ══
  function readTextFile(path) {
    var f = new File(path);
    if (!f.exists) return null;
    f.encoding = 'UTF-8';
    if (!f.open('r')) return null;
    var s = f.read();
    f.close();
    return s;
  }
  function writeTextFile(path, s) {
    var f = new File(path);
    f.encoding = 'UTF-8';
    if (!f.open('w')) return false;
    f.write(s);
    f.close();
    return true;
  }
  function jsonEsc(s) {
    s = String(s);
    s = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    s = s.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
    return s;
  }
  // ES3 수제 JSON 직렬화 (ExtractGroups buildJSON 관례 — 신규 필드 누락 함정 없음: 객체 순회)
  function toJson(v) {
    if (v === null || v === undefined) return 'null';
    var t = typeof v;
    if (t === 'number') return isFinite(v) ? String(v) : 'null';
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'string') return '"' + jsonEsc(v) + '"';
    if (v instanceof Array) {
      var a = [];
      for (var i = 0; i < v.length; i++) a.push(toJson(v[i]));
      return '[' + a.join(',') + ']';
    }
    var o = [];
    for (var k in v) {
      if (v.hasOwnProperty && !v.hasOwnProperty(k)) continue;
      o.push('"' + jsonEsc(k) + '":' + toJson(v[k]));
    }
    return '{' + o.join(',') + '}';
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function sanitizeName(s) {
    s = String(s || '');
    s = s.replace(/[\\\/:\*\?"<>\|]/g, '');
    s = s.replace(/^\s+|\s+$/g, '');
    return s || '무명';
  }
  function unionBounds(items) {
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
  function findByName(arr, name) {
    for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].name === name) return arr[i];
    return null;
  }

  // ══ 설정 로드 (_config/config.json — 에이전트 브로드캐스트, 없어도 동작) ══
  var config = null;
  try {
    var cs = readTextFile(REGISTER_ROOT + '/_config/config.json');
    if (cs) {
      var parsed = eval('(' + cs + ')'); // 서버 생성 = 신뢰 소스 (ES3 JSON 부재 관례)
      config = (parsed && parsed.data) ? parsed.data : parsed;
    }
  } catch (eCfg) { config = null; }
  var methods = (config && config.methods) ? config.methods : [];
  var presets = (config && config.presets) ? config.presets : [];
  var openLines = (config && config.open_lines) ? config.open_lines : [];
  function marginOfMethod(name) {
    var m = findByName(methods, name);
    return m ? (m.margin_cm || 0) : 0;
  }

  // ══ 실측 (선택 union, pt → cm) ══
  var ub = unionBounds(sel);
  if (!ub) { alert('선택 객체의 크기를 측정할 수 없습니다.'); return; }
  var fileWCm = (ub[2] - ub[0]) / PT_PER_MM / 10;
  var fileHCm = (ub[1] - ub[3]) / PT_PER_MM / 10;

  // ══ 미니창 (spec §3 목업) ══
  var SIDES = ['top', 'bottom', 'left', 'right'];
  var SIDE_KO = { top: '상', bottom: '하', left: '좌', right: '우' };
  var SCALE_OPTS = [
    { label: '1/1 (원본)', n: 1 }, { label: '1/2', n: 2 }, { label: '1/4', n: 4 },
    { label: '1/5', n: 5 }, { label: '1/10', n: 10 }
  ];

  var dlg = new Window('dialog', 'MES 가공 v' + SCRIPT_VERSION);
  dlg.orientation = 'column';
  dlg.alignChildren = 'fill';
  dlg.spacing = 8;

  // ── 경로①: 미가공 주문 라인 ──
  var pOrder = dlg.add('panel', undefined, '미가공 주문 라인 (선택 시 해당 라인에 연결)');
  pOrder.alignChildren = 'fill';
  pOrder.margins = 12;
  var lineLabels = ['(연결 안 함 — 새 접수로 가공)'];
  for (var li = 0; li < openLines.length; li++) {
    var ol = openLines[li];
    lineLabels.push(
      (ol.order_number || '') + ' · ' + (ol.client_name || '?') + ' · ' + (ol.item_name || '') +
      ' ' + (ol.width || '?') + 'x' + (ol.height || '?') + 'cm ×' + (ol.quantity || 1)
    );
  }
  var lineDrop = pOrder.add('dropdownlist', undefined, lineLabels);
  lineDrop.selection = 0;
  lineDrop.preferredSize.width = 460;

  // ── 경로②: 새 접수 ──
  var pNew = dlg.add('panel', undefined, '접수 정보');
  pNew.alignChildren = 'left';
  pNew.margins = 12;
  // 거래처 입력 제거(2026-07-17): 주문서도 디자이너 본인이 입력 = 이중 입력. 대기물 식별=썸네일.
  var rowClient = pNew.add('group');
  rowClient.add('statictext', undefined, '수량:');
  var qtyEt = rowClient.add('edittext', undefined, '1');
  qtyEt.characters = 5;

  // ── 가공 설정 ──
  var pFin = dlg.add('panel', undefined, '가공 설정');
  pFin.alignChildren = 'left';
  pFin.margins = 12;

  var methodNames = ['없음'];
  for (var mi = 0; mi < methods.length; mi++) methodNames.push(methods[mi].name);

  var rowPreset = pFin.add('group');
  rowPreset.add('statictext', undefined, '마감 프리셋:');
  var presetNames = ['(직접 지정)'];
  for (var pi = 0; pi < presets.length; pi++) presetNames.push(presets[pi].name);
  var presetDrop = rowPreset.add('dropdownlist', undefined, presetNames);
  presetDrop.selection = 0;
  presetDrop.preferredSize.width = 200;

  // [상세] 4면 개별 지정 + cm 직접 입력 (spec §3.4 계층2)
  var sideCtl = {};
  var rowS1 = pFin.add('group');
  var rowS2 = pFin.add('group');
  function addSide(row, side) {
    row.add('statictext', undefined, SIDE_KO[side] + ':');
    var dd = row.add('dropdownlist', undefined, methodNames);
    dd.selection = 0;
    dd.preferredSize.width = 120;
    var cm = row.add('edittext', undefined, '');
    cm.characters = 4;
    row.add('statictext', undefined, 'cm');
    sideCtl[side] = { dd: dd, cm: cm };
    dd.onChange = function () {
      if (dd.selection && dd.selection.index > 0 && cm.text === '') {
        cm.text = String(marginOfMethod(dd.selection.text));
      }
    };
  }
  addSide(rowS1, 'top'); addSide(rowS1, 'bottom');
  addSide(rowS2, 'left'); addSide(rowS2, 'right');

  presetDrop.onChange = function () {
    if (!presetDrop.selection || presetDrop.selection.index === 0) return;
    var pr = findByName(presets, presetDrop.selection.text);
    if (!pr || !pr.config) return;
    var cfg;
    try { cfg = eval('(' + pr.config + ')'); } catch (ePr) { return; }
    for (var s = 0; s < SIDES.length; s++) {
      var side = SIDES[s];
      var mName = cfg[side] || '';
      var ctl = sideCtl[side];
      var idx = 0;
      for (var mn = 0; mn < methodNames.length; mn++) if (methodNames[mn] === mName) { idx = mn; break; }
      ctl.dd.selection = idx;
      ctl.cm.text = idx > 0 ? String(marginOfMethod(mName)) : '';
    }
  };

  var rowOpt = pFin.add('group');
  var trimCb = rowOpt.add('checkbox', undefined, '돔보(재단마크)');
  trimCb.value = false;
  rowOpt.add('statictext', undefined, '  파일 배율:');
  var scaleLabels = [];
  for (var sc = 0; sc < SCALE_OPTS.length; sc++) scaleLabels.push(SCALE_OPTS[sc].label);
  var scaleDrop = rowOpt.add('dropdownlist', undefined, scaleLabels);
  scaleDrop.selection = 0;

  var rowMode = pFin.add('group');
  rowMode.add('statictext', undefined, '용도:');
  var modeSingle = rowMode.add('radiobutton', undefined, '단건 출력');
  var modeImpose = rowMode.add('radiobutton', undefined, '모아찍기용');
  var modeBoth = rowMode.add('radiobutton', undefined, '둘 다');
  modeSingle.value = true;

  // ── 실측 표시 (배율 연동) ──
  var measTx = dlg.add('statictext', undefined, '');
  function scaleN() {
    var idx = scaleDrop.selection ? scaleDrop.selection.index : 0;
    return SCALE_OPTS[idx].n;
  }
  function refreshMeas() {
    var n = scaleN();
    var rw = fileWCm * n, rh = fileHCm * n;
    measTx.text = '실측(파일): ' + fileWCm.toFixed(1) + ' × ' + fileHCm.toFixed(1) + ' cm' +
      (n > 1 ? ('  →  실물(×' + n + '): ' + rw.toFixed(1) + ' × ' + rh.toFixed(1) + ' cm') : '');
  }
  scaleDrop.onChange = refreshMeas;
  refreshMeas();

  // 주문 라인 선택 → 마감·수량 프리필 (라인 스펙 pull)
  lineDrop.onChange = function () {
    var idx = lineDrop.selection ? lineDrop.selection.index : 0;
    if (idx <= 0) return;
    var ol = openLines[idx - 1];
    qtyEt.text = String(ol.quantity || 1);
    if (ol.finishing) {
      var fin;
      try { fin = eval('(' + ol.finishing + ')'); } catch (eF) { fin = null; }
      if (fin) {
        for (var s2 = 0; s2 < SIDES.length; s2++) {
          var sd = SIDES[s2];
          var ctl2 = sideCtl[sd];
          var mName2 = fin[sd] || '';
          var idx2 = 0;
          for (var mn2 = 0; mn2 < methodNames.length; mn2++) if (methodNames[mn2] === mName2) { idx2 = mn2; break; }
          ctl2.dd.selection = idx2;
          var cmOv = fin[sd + '_cm'];
          ctl2.cm.text = idx2 > 0 ? String((cmOv != null && cmOv !== '') ? cmOv : marginOfMethod(mName2)) : '';
        }
      }
    }
  };

  var rowBtn = dlg.add('group');
  rowBtn.alignment = 'right';
  var okBtn = rowBtn.add('button', undefined, '가공 실행', { name: 'ok' });
  rowBtn.add('button', undefined, '취소', { name: 'cancel' });

  okBtn.onClick = function () { dlg.close(1); };
  if (dlg.show() !== 1) return;

  // ══ 파라미터 수집 ══
  var lineSel = lineDrop.selection ? lineDrop.selection.index : 0;
  var orderItemId = lineSel > 0 ? (openLines[lineSel - 1].order_item_id || null) : null;
  // 표시명 = 주문라인 거래처(경로①) 또는 원본 문서명(경로②) — 파일명·피커 식별용
  var docBase = sanitizeName(String(srcDoc.name).replace(/\.[^.]+$/, ''));
  var clientName = lineSel > 0 ? (openLines[lineSel - 1].client_name || docBase) : docBase;
  var qty = parseInt(qtyEt.text, 10); if (isNaN(qty) || qty < 1) qty = 1;
  var sN = scaleN();
  var mode = modeImpose.value ? 'impose' : (modeBoth.value ? 'both' : 'single');
  var realW = fileWCm * sN, realH = fileHCm * sN;

  // 마감: 웹 orderForm 라인 스키마와 동일 {top: 방식명, top_cm: 실물cm} (calc.js 직렬화 정합)
  var finJson = {};
  var finMargins = {}; // 파일 내 적용 pt (실물 cm ÷ N)
  var hasFinishing = false;
  for (var fs = 0; fs < SIDES.length; fs++) {
    var sdName = SIDES[fs];
    var ctl3 = sideCtl[sdName];
    var mSel = ctl3.dd.selection && ctl3.dd.selection.index > 0 ? ctl3.dd.selection.text : '';
    var cmVal = parseFloat(ctl3.cm.text);
    if (isNaN(cmVal)) cmVal = mSel ? marginOfMethod(mSel) : 0;
    if (mSel) {
      finJson[sdName] = mSel;
      finJson[sdName + '_cm'] = cmVal;
      hasFinishing = true;
    }
    finMargins[sdName] = (mSel ? cmVal : 0) * 10 * PT_PER_MM / sN;
  }
  var trim = trimCb.value;

  // ── 프리플라이트(경고 전용 — 출력 불변) ──
  var pfSourceRGB = false;
  try { pfSourceRGB = (srcDoc.documentColorSpace == DocumentColorSpace.RGB); } catch (ePf0) { }
  var pfRemainingText = 0, pfLinkedImages = 0;

  // ══ 건별 폴더 ══
  var now = new Date();
  var ymd = '' + now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate());
  var hms = pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds());
  var pcName = $.getenv('COMPUTERNAME') || 'PC';
  var userName = $.getenv('USERNAME') || '';
  var folderName = ymd + '_' + hms + '_' + sanitizeName(pcName) + '_' + (now.getTime() % 1000);
  var jobFolder = new Folder(REGISTER_ROOT + '/' + folderName);
  if (!jobFolder.exists && !jobFolder.create()) {
    alert('등록 폴더를 만들 수 없습니다.\n' + jobFolder.fsName + '\nZ: 드라이브 연결을 확인해 주세요.');
    return;
  }

  // ══ 복제 문서 생성 (원본 불가침 — 열린 고객 파일은 무변경) ══
  var newDoc = mesCore_newDocMM((ub[2] - ub[0]) || 100, (ub[1] - ub[3]) || 100);
  var okAll = false;
  var outlineFailed = false;
  var epsName = null;
  try {
    for (var di = 0; di < sel.length; di++) {
      sel[di].duplicate(newDoc.layers[0], ElementPlacement.PLACEATEND);
    }
    app.activeDocument = newDoc;

    // ① 아웃라인 (우아 강등: 실패해도 진행, 플래그만)
    try {
      for (var ti = newDoc.textFrames.length - 1; ti >= 0; ti--) newDoc.textFrames[ti].createOutline();
    } catch (eOl) { outlineFailed = true; }
    try { pfRemainingText = newDoc.textFrames.length; } catch (ePf1) { }
    try { pfLinkedImages = newDoc.placedItems.length; } catch (ePf2) { }

    // ② 아트보드 = 디자인 경계 (work.ai: 아트보드 기반 소비자 — ExtractGroups/SheetLayout 호환)
    function docUnion() {
      var L2 = null, T2 = null, R2 = null, B2 = null;
      for (var qi = 0; qi < newDoc.pageItems.length; qi++) {
        var it = newDoc.pageItems[qi];
        if (it.locked || it.hidden) continue;
        var b2;
        try { b2 = it.visibleBounds; } catch (eB) { continue; }
        if (L2 === null || b2[0] < L2) L2 = b2[0];
        if (T2 === null || b2[1] > T2) T2 = b2[1];
        if (R2 === null || b2[2] > R2) R2 = b2[2];
        if (B2 === null || b2[3] < B2) B2 = b2[3];
      }
      return (L2 === null) ? [0, 100, 100, 0] : [L2, T2, R2, B2];
    }
    var db = docUnion();
    newDoc.artboards[0].artboardRect = [db[0], db[1], db[2], db[3]];

    // ③ work.ai 저장 — 가공 '전' 정제본(D6). 마감·돔보 없음(돔보는 판 단위).
    // ⚠️이 경로(MES가공 스텁)는 2026-07-28 은퇴 — 등록은 패널 하나다. Z: 에 남아 있어 실행은 가능하므로
    // pdfCompatible 만 패널과 동일하게 맞춘다(계측·경고는 패널 전용, 여기 추가하지 않음).
    var workFile = new File(jobFolder.fsName + '/work.ai');
    var workOpts = new IllustratorSaveOptions();
    workOpts.pdfCompatible = false;
    newDoc.saveAs(workFile, workOpts);

    // ④ 가공 적용 + EPS (mode=impose면 스킵 — 모아찍기는 work.ai가 정본)
    if (mode !== 'impose') {
      var oL = db[0], oT = db[1], oR = db[2], oB = db[3];
      var fT2 = finMargins.top, fB2 = finMargins.bottom, fL2 = finMargins.left, fR2 = finMargins.right;
      newDoc.artboards[0].artboardRect = [oL - fL2, oT + fT2, oR + fR2, oB - fB2];

      // 마감 접는선(M100 0.6pt, 디자인 경계 = 접는 위치) — ProcessOrderItem foldlines 포팅
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

      // 돔보 — ProcessOrderItem L800~833 포팅 (상수 ÷N: 실물 mm 기준 유지)
      if (trim) {
        var ar = newDoc.artboards[0].artboardRect;
        var tL = ar[0], tT = ar[1], tR = ar[2], tB = ar[3];
        var DOMBO_DIAM = 6 * PT_PER_MM / sN;
        var CORNER_DIST = 17 * PT_PER_MM / sN; // 돔보 바깥끝 = 20mm (중심17 + 반지름3)
        var DIR_OFFSET = 60 * PT_PER_MM / sN;
        var MAX_GAP = 500 * PT_PER_MM / sN;
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
        mkDombo(tL + DIR_OFFSET, tT + CORNER_DIST); // 방향마크(상단)
        interDombo(tL, tR, tT + CORNER_DIST, true);
        interDombo(tL, tR, tB - CORNER_DIST, true);
        interDombo(tB, tT, tL - CORNER_DIST, false);
        interDombo(tB, tT, tR + CORNER_DIST, false);
        var pad = CORNER_DIST + DOMBO_DIAM;
        newDoc.artboards[0].artboardRect = [tL - pad, tT + pad, tR + pad, tB - pad];
      }

      // EPS 저장 — 규약 파일명 {날짜}-{거래처}-{WxH실물}-{수량}EA(_1-N).eps (§9-1 확정)
      epsName = ymd + '-' + sanitizeName(clientName) + '-' +
        Math.round(realW) + 'x' + Math.round(realH) + '-' + qty + 'EA' +
        (sN > 1 ? '_1-' + sN : '') + '.eps';
      var epsFile = new File(jobFolder.fsName + '/' + epsName);
      var epsOpts = new EPSSaveOptions();
      epsOpts.cmykPostScript = true;
      epsOpts.compatibility = Compatibility.ILLUSTRATOR10;
      epsOpts.preview = EPSPreview.COLORTIFF;
      epsOpts.embedAllFonts = true;
      newDoc.saveAs(epsFile, epsOpts);

      // 픽업 편의: _출력\{날짜}\ 에도 복사 (RIP 픽업 지점 — PoC에서 위치 확정)
      try {
        var outDir = new Folder(REGISTER_ROOT + '/_출력/' + ymd);
        if (!outDir.exists) outDir.create();
        epsFile.copy(outDir.fsName + '/' + epsName);
      } catch (eCp) { /* 복사 실패는 치명 아님 — 건별 폴더에 원본 존재 */ }
    }

    // ⑤ 썸네일 PNG (최대 ~400px)
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
    alert('가공 중 오류가 발생했습니다:\n' + eProc);
  }
  try { newDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eCl) { }

  if (!okAll) return;

  // ══ manifest.json — 커밋 마커: 모든 파일 저장 완료 후 '마지막' 기록 (§4.2) ══
  var manifest = {
    manifest_version: 1,
    script_version: SCRIPT_VERSION,
    registered_by: pcName + '\\' + userName,
    pc_name: pcName,
    entity_id: 1,
    client_name: clientName,
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
    created_at_kst: now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()) +
      ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds())
  };
  if (!writeTextFile(jobFolder.fsName + '/manifest.json', toJson(manifest))) {
    alert('manifest 기록에 실패했습니다. (파일은 저장됨)\n' + jobFolder.fsName);
    return;
  }

  var pfWarn = '';
  if (pfSourceRGB) pfWarn += '⚠ 원본이 RGB 문서 — CMYK 변환됨, 색상 확인\n';
  if (pfRemainingText > 0) pfWarn += '⚠ 아웃라인 안 된 텍스트 ' + pfRemainingText + '개 — 폰트 확인\n';
  if (pfLinkedImages > 0) pfWarn += '⚠ 링크(미임베드) 이미지 ' + pfLinkedImages + '개 — 임베드 권장\n';
  alert('MES 가공 완료 ✓\n\n' +
    '등록: ' + clientName + '  수량: ' + qty + '\n' +
    '실물: ' + realW.toFixed(1) + ' × ' + realH.toFixed(1) + ' cm' + (sN > 1 ? ' (파일 1/' + sN + ')' : '') + '\n' +
    (epsName ? ('EPS: ' + epsName + '\n') : '(모아찍기용 — work.ai만 저장)\n') +
    (outlineFailed ? '⚠ 텍스트 아웃라인 일부 실패 — 확인 필요\n' : '') +
    pfWarn +
    (orderItemId ? '주문 라인에 자동 연결됩니다.' : '주문서에서 "가공 대기물"로 불러올 수 있습니다.'));
})();
