// mes-sheet.jsx — MES 판짜기 (세션 임포지션) v0.1.0
// 정본 위치: Z:\DESIGNS\IA-등록\_scripts\mes-sheet.jsx (스텁 MES판짜기.jsx가 $.evalFile로 로드)
// spec: docs/superpowers/specs/2026-07-16-ia-designer-session-loop.md §11
// 흐름(2-패스):
//   1패스(빈 문서/일반 문서에서 실행) = 판 구성: 모아찍기 대기물 선택 → 자동 배치(shelf)
//     → 디자이너가 자유 조정(이동·회전·복제 — 복제해도 이름 태그 유지됨)
//   2패스(MES판_* 문서에서 재실행) = 판 확정: 조각 현재 위치 그대로 재단선·돔보
//     → EPS+DXF(재단선 전용)+썸네일+manifest(consumed_intake_ids) → 에이전트 ingest
// 이형 커버: 배치 후 일러에서 직접 끼워맞춤 + 재단선 레이어에 다이라인 직접 작성 가능(자동생성 OFF).
// ES3(ExtendScript) — 최신 문법 금지. 인코딩 = UTF-8 BOM.
// ⚠️ 유틸·돔보 블록은 mes-core.jsx와 중복(자기완결 v1) — 상수 변경 시 양쪽 동기 필수.
#target illustrator

(function () {
  var SCRIPT_VERSION = '0.1.0';
  var REGISTER_ROOT = 'Z:/DESIGNS/IA-등록';
  var PT_PER_MM = 72 / 25.4;
  var PIECE_PREFIX = 'MES_PIECE:';
  var SHEET_DOC_PREFIX = 'MES판_';
  var CUT_LAYER = '재단선';

  /**
   * mm 단위 문서를 만든다 — `app.documents.add()` 를 이걸로 대체한다.
   * ★`documents.add()` 가 만드는 문서는 눈금이 **point** 다. `doc.rulerUnits` 대입은 읽기 전용이라
   *   아무 일도 하지 않고(예외도 안 던진다), `preferences rulerType` 도 안 통한다 —
   *   **DocumentPreset 이 유일한 경로다**([[feedback-illustrator-doc-units]], AI 30.7 실측 2026-08-25).
   *   이 축은 **디자이너가 다시 여는 `.ai`** 를 만들므로 눈금이 pt 면 매번 손으로 바꿔야 한다.
   * 좌표는 point 그대로 넘긴다 — 눈금 단위만 바뀌고 기하는 불변이다.
   * ⚠️ `SheetLayout.jsx` `_iaNewDocMM` · `mes-cut-host.jsx` `mesCut_newDocMM` 과 같은 내용의 사본.
   */
  function mesSheet_newDocMM(wPt, hPt) {
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

  // ══ 유틸 (mes-core.jsx 동일 — 중복 주의) ══
  function readTextFile(path) {
    var f = new File(path);
    if (!f.exists) return null;
    f.encoding = 'UTF-8';
    if (!f.open('r')) return null;
    var s = f.read(); f.close(); return s;
  }
  function writeTextFile(path, s) {
    var f = new File(path);
    f.encoding = 'UTF-8';
    if (!f.open('w')) return false;
    f.write(s); f.close(); return true;
  }
  function jsonEsc(s) {
    s = String(s);
    s = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    s = s.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
    return s;
  }
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
  function groupBounds(it) {
    try { return it.visibleBounds; } catch (e) { try { return it.geometricBounds; } catch (e2) { return null; } }
  }
  function collectPieces(doc) {
    var out = [];
    for (var g = 0; g < doc.groupItems.length; g++) {
      var gi = doc.groupItems[g];
      try {
        if (gi.name && gi.name.indexOf(PIECE_PREFIX) === 0 && !gi.locked && !gi.hidden) out.push(gi);
      } catch (eG) { }
    }
    return out;
  }
  function nowStamp() {
    var d = new Date();
    return {
      ymd: '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()),
      hms: pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()),
      hm: pad2(d.getHours()) + pad2(d.getMinutes()),
      kst: d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()),
      ms: d.getTime() % 1000
    };
  }

  // ══ 자동 배치 (shelf bin-pack) — iaeShelfBinPack(src/scripts/iaEditor.js:1602) 이식 ══
  //   면적 내림차순 → 기존 shelf 전부 순회 적재(회전 양방향) → 안 되면 새 shelf.
  //   폭 초과(회전해도) 조각은 skip(수동 배치용)하고 나머지 최적 배치. 단위 무관(호출자가 pt로 넘김).
  //   반환 = { placements:[{id,x,y,w,h,rotated}], total_height, skipped:[id...] } (좌상단 기준, 넣은 단위 그대로).
  function sheetShelfBinPack(items, availableWidth, gap) {
    if (!items || !items.length) return { placements: [], total_height: 0, skipped: [] };
    gap = gap || 0;
    var orient = function (it) {
      return [{ w: it.w, h: it.h, rotated: false }, { w: it.h, h: it.w, rotated: true }];
    };
    var sorted = items.slice().sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });
    var shelves = [], placements = [], skipped = [];
    for (var i = 0; i < sorted.length; i++) {
      var it = sorted[i], placed = false;
      for (var si = 0; si < shelves.length; si++) {
        var sh = shelves[si];
        var xGap = sh.itemCount > 0 ? gap : 0;
        var ors = orient(it);
        for (var oi = 0; oi < ors.length; oi++) {
          var o = ors[oi];
          // 마지막 shelf만 높이 성장 허용 — 중간 shelf가 자라면 이미 그 아래 y로 생성된 다음 shelf와 겹침
          // (L1 하네스 R4 실증, 정답 원본 = iaEditor.js:1623). 면적 내림차순이라 뒤 조각이 더 높을 수 있다.
          if (si < shelves.length - 1 && o.h > sh.height + 1e-6) continue;
          if (sh.usedWidth + xGap + o.w <= availableWidth + 1e-6) {
            placements.push({ id: it.id, x: sh.usedWidth + xGap, y: sh.y, w: o.w, h: o.h, rotated: o.rotated });
            sh.usedWidth += xGap + o.w; sh.itemCount++; if (o.h > sh.height) sh.height = o.h; placed = true; break;
          }
        }
        if (placed) break;
      }
      if (!placed) {
        var ors2 = orient(it), chosen = null;
        for (var oi2 = 0; oi2 < ors2.length; oi2++) { if (ors2[oi2].w <= availableWidth + 1e-6) { chosen = ors2[oi2]; break; } }
        if (!chosen) { skipped.push(it.id); continue; } // 폭 초과 — 수동 배치로 넘김
        var prev = shelves[shelves.length - 1];
        var yGap = prev ? gap : 0;
        var newY = prev ? prev.y + prev.height + yGap : 0;
        shelves.push({ y: newY, height: chosen.h, usedWidth: chosen.w, itemCount: 1 });
        placements.push({ id: it.id, x: 0, y: newY, w: chosen.w, h: chosen.h, rotated: chosen.rotated });
      }
    }
    var last = shelves[shelves.length - 1];
    var totalHeight = last ? last.y + last.height : 0;
    return { placements: placements, total_height: totalHeight, skipped: skipped };
  }

  // ══ 분기: MES판 문서면 확정, 아니면 구성 ══
  var isSheetDoc = false;
  try { isSheetDoc = app.documents.length > 0 && String(app.activeDocument.name).indexOf(SHEET_DOC_PREFIX) === 0; } catch (eB) { }
  if (isSheetDoc) { confirmSheet(); } else { composeSheet(); }

  // ────────────────────────────────────────────────────────────────
  // 1패스: 판 구성
  // ────────────────────────────────────────────────────────────────
  function composeSheet() {
    // 설정 로드 (모아찍기 대기물 목록 — 에이전트 브로드캐스트)
    var config = null;
    try {
      var cs = readTextFile(REGISTER_ROOT + '/_config/config.json');
      if (cs) { var parsed = eval('(' + cs + ')'); config = (parsed && parsed.data) ? parsed.data : parsed; }
    } catch (eCfg) { }
    var intakes = (config && config.intakes) ? config.intakes : [];
    if (!intakes.length) {
      alert('모아찍기 대기물이 없습니다.\n\n일러에서 조각을 선택해 "MES가공"으로 용도=모아찍기용(또는 둘 다)으로 먼저 등록하세요.\n(등록 후 ~1분 내 목록에 반영됩니다)');
      return;
    }

    // ── 다이얼로그 ──
    var ROLL_W = [914, 1050, 1270, 1370, 1520];
    var FLAT = [{ label: '900 × 1800 mm', w: 900, h: 1800 }, { label: '1200 × 2400 mm', w: 1200, h: 2400 }];

    var dlg = new Window('dialog', 'MES 판짜기 v' + SCRIPT_VERSION + ' — 판 구성');
    dlg.orientation = 'column'; dlg.alignChildren = 'fill'; dlg.spacing = 8;

    var pList = dlg.add('panel', undefined, '모아찍기 대기물 (다중 선택 = Ctrl/Shift)');
    pList.alignChildren = 'fill'; pList.margins = 12;
    var labels = [];
    for (var i = 0; i < intakes.length; i++) {
      var it = intakes[i];
      labels.push('#' + it.id + ' · ' + (it.client_name || '') + ' · ' + (it.width_cm || '?') + '×' + (it.height_cm || '?') + 'cm × ' + (it.qty || 1) + '개');
    }
    var lb = pList.add('listbox', undefined, labels, { multiselect: true });
    lb.preferredSize = [480, Math.min(200, 20 * labels.length + 24)];

    var pSheet = dlg.add('panel', undefined, '판 규격');
    pSheet.alignChildren = 'left'; pSheet.margins = 12;
    var rowMode = pSheet.add('group');
    var rbRoll = rowMode.add('radiobutton', undefined, '롤(폭 고정·길이 가변)');
    var rbFlat = rowMode.add('radiobutton', undefined, '평판');
    rbFlat.value = true; // 자작나무 등 평판이 이형 주 사용처
    var rowSize = pSheet.add('group');
    rowSize.add('statictext', undefined, '롤 폭:');
    var rollLabels = [];
    for (var rw = 0; rw < ROLL_W.length; rw++) rollLabels.push(ROLL_W[rw] + 'mm');
    var rollDrop = rowSize.add('dropdownlist', undefined, rollLabels);
    rollDrop.selection = 4; // 1520
    rowSize.add('statictext', undefined, '  평판:');
    var flatLabels = [];
    for (var fw = 0; fw < FLAT.length; fw++) flatLabels.push(FLAT[fw].label);
    var flatDrop = rowSize.add('dropdownlist', undefined, flatLabels);
    flatDrop.selection = 1; // 1200×2400
    var rowOpt = pSheet.add('group');
    rowOpt.add('statictext', undefined, '조각 간격(mm):');
    var gapEt = rowOpt.add('edittext', undefined, '5'); gapEt.characters = 4;
    rowOpt.add('statictext', undefined, '  판 여백(mm):');
    var marginEt = rowOpt.add('edittext', undefined, '10'); marginEt.characters = 4;

    dlg.add('statictext', undefined, '자동 배치 후 일러에서 자유롭게 조정하세요 (이동·회전·복제 가능).');
    var rowBtn = dlg.add('group'); rowBtn.alignment = 'right';
    var okBtn = rowBtn.add('button', undefined, '판 구성', { name: 'ok' });
    rowBtn.add('button', undefined, '취소', { name: 'cancel' });
    okBtn.onClick = function () {
      if (!lb.selection || lb.selection.length === 0) { alert('대기물을 1개 이상 선택하세요.'); return; }
      dlg.close(1);
    };
    if (dlg.show() !== 1) return;

    var chosen = [];
    for (var s = 0; s < lb.selection.length; s++) chosen.push(intakes[lb.selection[s].index]);
    var isRoll = rbRoll.value;
    var sheetWmm = isRoll ? ROLL_W[rollDrop.selection.index] : FLAT[flatDrop.selection.index].w;
    var sheetHmm = isRoll ? 0 : FLAT[flatDrop.selection.index].h; // 0=길이 가변
    var gapPt = (parseFloat(gapEt.text) || 5) * PT_PER_MM;
    var marginPt = (parseFloat(marginEt.text) || 10) * PT_PER_MM;
    var sheetWpt = sheetWmm * PT_PER_MM;

    // ── 건별 폴더 + 판 문서 ──
    var st = nowStamp();
    var pcName = $.getenv('COMPUTERNAME') || 'PC';
    var folderName = st.ymd + '_' + st.hms + '_' + sanitizeName(pcName) + '_판' + st.ms;
    var jobFolder = new Folder(REGISTER_ROOT + '/' + folderName);
    if (!jobFolder.exists && !jobFolder.create()) { alert('등록 폴더 생성 실패:\n' + jobFolder.fsName); return; }

    var sheetDoc = mesSheet_newDocMM(sheetWpt, (sheetHmm || 1000) * PT_PER_MM);
    sheetDoc.artboards[0].artboardRect = [0, 0, sheetWpt, -((sheetHmm || 1000) * PT_PER_MM)];

    // ── 조각 로드: work.ai 열기 → 그룹으로 복제 → 실물 크기 보정 → 수량만큼 복제 ──
    var skipped = [];
    var usedIds = [];
    var loadedPieces = []; // 조각 그룹 명시 수집 (grp.duplicate 후 collectPieces 컬렉션 stale 우회)
    for (var ci = 0; ci < chosen.length; ci++) {
      var itk = chosen[ci];
      var srcFile = new File(String(itk.work_ai_path || '').replace(/\\/g, '/'));
      if (!srcFile.exists) { skipped.push('#' + itk.id + ' (work.ai 없음)'); continue; }
      var src = null;
      try {
        src = app.open(srcFile); // 정제 work.ai(아웃라인 완료) — 열기 모달 위험 없음
        var grp = sheetDoc.groupItems.add();
        grp.name = PIECE_PREFIX + itk.id;
        for (var L = 0; L < src.layers.length; L++) {
          var lay = src.layers[L];
          for (var pi = lay.pageItems.length - 1; pi >= 0; pi--) {
            // cross-doc(열린 work.ai→sheetDoc)에서 pageItem을 '그룹'으로 직접 복제는 PARM 실패 →
            // 대상 문서의 layer로 복제 후 같은 문서 내에서 그룹으로 move (검증: dup→group ok=0, dup→layer ok=2)
            try { var _ni = lay.pageItems[pi].duplicate(sheetDoc.layers[0], ElementPlacement.PLACEATEND); _ni.move(grp, ElementPlacement.PLACEATBEGINNING); } catch (eDup) { }
          }
        }
        src.close(SaveOptions.DONOTSAVECHANGES); src = null;
        app.activeDocument = sheetDoc;
        // 실물 크기 보정 (work.ai=파일 스케일 1/N → 실물 cm로 확대)
        var gb = groupBounds(grp);
        if (gb && itk.width_cm) {
          var curW = gb[2] - gb[0];
          var tgtW = itk.width_cm * 10 * PT_PER_MM;
          if (curW > 0) {
            var pct = (tgtW / curW) * 100;
            if (pct < 99.5 || pct > 100.5) grp.resize(pct, pct);
          }
        }
        usedIds.push(itk.id);
        loadedPieces.push(grp);
        // 수량만큼 복제 (duplicate는 이름 태그 유지)
        var copies = Math.max(1, parseInt(itk.qty, 10) || 1);
        for (var cp = 2; cp <= copies; cp++) { var _dup = grp.duplicate(); loadedPieces.push(_dup); }
      } catch (eLoad) {
        skipped.push('#' + itk.id + ' (' + eLoad + ')');
        try { if (src) src.close(SaveOptions.DONOTSAVECHANGES); } catch (eCl) { }
        app.activeDocument = sheetDoc;
      }
    }

    var pieces = loadedPieces.length ? loadedPieces : collectPieces(sheetDoc);
    if (!pieces.length) {
      alert('조각을 하나도 불러오지 못했습니다.\n' + skipped.join('\n'));
      try { sheetDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eC2) { }
      return;
    }

    // ── 자동 배치 (shelf bin-pack — 기존 shelf 재활용·회전 양방향·면적 내림차순) ──
    var usableW = sheetWpt - 2 * marginPt;
    var packItems = [];
    for (var p = 0; p < pieces.length; p++) {
      var b = groupBounds(pieces[p]);
      if (!b) continue;
      packItems.push({ id: p, w: b[2] - b[0], h: b[1] - b[3] });
    }
    var packed = sheetShelfBinPack(packItems, usableW, gapPt);
    var totalArea = 0;
    for (var pl = 0; pl < packed.placements.length; pl++) {
      var pc = packed.placements[pl];
      var grp = pieces[pc.id];
      if (pc.rotated) grp.rotate(90); // packer가 회전 선택 — 회전 후 좌상단 재배치(bounds w↔h swap)
      grp.position = [marginPt + pc.x, -(marginPt + pc.y)];
      totalArea += pc.w * pc.h;
    }
    var usedH = packed.total_height;
    var placedCount = packed.placements.length;
    var effPct = (usedH > 0 && usableW > 0) ? Math.round((totalArea / (usableW * usedH)) * 100) : 0;

    // ── 아트보드 확정 (롤=길이 맞춤 / 평판=고정, 초과 시 경고) ──
    var overflow = '';
    if (isRoll) {
      sheetDoc.artboards[0].artboardRect = [0, 0, sheetWpt, -(usedH + 2 * marginPt)];
    } else {
      sheetDoc.artboards[0].artboardRect = [0, 0, sheetWpt, -(sheetHmm * PT_PER_MM)];
      if (usedH + 2 * marginPt > sheetHmm * PT_PER_MM) overflow = '\n⚠ 조각이 판 높이를 초과했습니다 — 판 밖 조각을 조정(회전·제거)하세요.';
    }

    // ── 저장 + 메타 ──
    var sheetFile = new File(jobFolder.fsName + '/' + SHEET_DOC_PREFIX + st.ymd + '_' + st.hms + '.ai');
    // PDF 합성부 제외(mes-a0-host.jsx 와 동일 근거) — 판 .ai 는 조각 work.ai 들을 실물크기로 실은 문서라
    // 조각 수만큼 용량이 곱해진다. 소비자는 일러(재편집)·RIP 픽업은 별도 EPS(:444) 라 PDF 스트림 불요.
    var sheetOpts = new IllustratorSaveOptions();
    sheetOpts.pdfCompatible = false;
    sheetDoc.saveAs(sheetFile, sheetOpts);
    writeTextFile(jobFolder.fsName + '/sheet-meta.json', toJson({
      intake_ids: usedIds, is_roll: isRoll, sheet_w_mm: sheetWmm, sheet_h_mm: sheetHmm,
      margin_mm: (parseFloat(marginEt.text) || 10), gap_mm: (parseFloat(gapEt.text) || 5), created: st.kst
    }));

    alert('판 구성 완료 ✓  (조각 ' + placedCount + '개 · 자재효율 ' + effPct + '%)' + overflow
      + (packed.skipped.length ? ('\n⚠ 판 폭 초과 ' + packed.skipped.length + '개 — 판 규격을 키우거나 수동 배치하세요') : '') + '\n\n'
      + '이제 자유롭게 조정하세요 — 이동·회전·복제 모두 가능합니다.\n'
      + '(복제한 조각도 그대로 출력에 포함됩니다)\n\n'
      + '조정이 끝나면 이 스크립트를 다시 실행 → "판 확정"이 진행됩니다.'
      + (skipped.length ? ('\n\n건너뜀: ' + skipped.join(', ')) : ''));
  }

  // ────────────────────────────────────────────────────────────────
  // 2패스: 판 확정 (현재 배치 그대로 재단선·돔보 → EPS/DXF/썸네일/manifest)
  // ────────────────────────────────────────────────────────────────
  function confirmSheet() {
    var doc = app.activeDocument;
    var jobFolder = doc.fullName ? doc.fullName.parent : null;
    if (!jobFolder || !jobFolder.exists) { alert('판 문서의 폴더를 찾을 수 없습니다.'); return; }
    if (new File(jobFolder.fsName + '/manifest.json').exists) {
      alert('이미 확정된 판입니다.\n재확정하려면 폴더의 manifest.json을 삭제 후 다시 실행하세요.\n' + jobFolder.fsName);
      return;
    }
    var meta = null;
    try {
      var ms = readTextFile(jobFolder.fsName + '/sheet-meta.json');
      if (ms) meta = eval('(' + ms + ')');
    } catch (eM) { }
    var pieces = collectPieces(doc);
    if (!pieces.length) { alert('MES 조각(MES_PIECE:*)을 찾을 수 없습니다.'); return; }

    // ── 확정 다이얼로그 ──
    var dlg = new Window('dialog', 'MES 판짜기 — 판 확정 (조각 ' + pieces.length + '개)');
    dlg.orientation = 'column'; dlg.alignChildren = 'left'; dlg.spacing = 8; dlg.margins = 14;
    var trimCb = dlg.add('checkbox', undefined, '돔보(재단마크) — 판 둘레');
    trimCb.value = true;
    var cutCb = dlg.add('checkbox', undefined, '재단선 자동 생성 (조각 외곽 사각 → DXF)');
    cutCb.value = true;
    dlg.add('statictext', undefined, '이형(비사각)은 자동 생성을 끄고 "' + CUT_LAYER + '" 레이어에 직접 그리세요.');
    var rowBtn = dlg.add('group'); rowBtn.alignment = 'right';
    rowBtn.add('button', undefined, '판 확정', { name: 'ok' });
    rowBtn.add('button', undefined, '취소', { name: 'cancel' });
    if (dlg.show() !== 1) return;
    var trim = trimCb.value;

    var marginPt = ((meta && meta.margin_mm) || 10) * PT_PER_MM;

    // ── 조각 union → 아트보드 맞춤 ──
    var U = null;
    for (var i = 0; i < pieces.length; i++) {
      var b = groupBounds(pieces[i]);
      if (!b) continue;
      if (!U) U = [b[0], b[1], b[2], b[3]];
      else {
        if (b[0] < U[0]) U[0] = b[0];
        if (b[1] > U[1]) U[1] = b[1];
        if (b[2] > U[2]) U[2] = b[2];
        if (b[3] < U[3]) U[3] = b[3];
      }
    }
    // 롤=내용 맞춤(폭·길이 모두 여백 포함), 평판=기존 아트보드 유지
    if (meta && meta.is_roll) {
      doc.artboards[0].artboardRect = [U[0] - marginPt, U[1] + marginPt, U[2] + marginPt, U[3] - marginPt];
    }

    // ── 재단선 레이어 ──
    var cutLayer = null;
    for (var ly = 0; ly < doc.layers.length; ly++) if (doc.layers[ly].name === CUT_LAYER) { cutLayer = doc.layers[ly]; break; }
    if (!cutLayer) { cutLayer = doc.layers.add(); cutLayer.name = CUT_LAYER; }
    if (cutCb.value && cutLayer.pageItems.length === 0) {
      var mCol = new CMYKColor(); mCol.cyan = 0; mCol.magenta = 100; mCol.yellow = 0; mCol.black = 0;
      for (var cp = 0; cp < pieces.length; cp++) {
        var cb = groupBounds(pieces[cp]);
        if (!cb) continue;
        var rect = cutLayer.pathItems.rectangle(cb[1], cb[0], cb[2] - cb[0], cb[1] - cb[3]);
        rect.stroked = true; rect.filled = false; rect.strokeColor = mCol; rect.strokeWidth = 0.6;
      }
    }

    // ── 돔보 (mes-core.jsx 블록 동일, sN=1 — 상수 동기 주의) ──
    if (trim) {
      var ar = doc.artboards[0].artboardRect;
      var tL = ar[0], tT = ar[1], tR = ar[2], tB = ar[3];
      var DOMBO_DIAM = 6 * PT_PER_MM;
      var CORNER_DIST = 17 * PT_PER_MM; // 바깥끝 20mm
      var DIR_OFFSET = 60 * PT_PER_MM;
      var MAX_GAP = 500 * PT_PER_MM;
      var kCol = new CMYKColor(); kCol.cyan = 0; kCol.magenta = 0; kCol.yellow = 0; kCol.black = 100;
      function mkDombo(cx, cy) {
        var r = DOMBO_DIAM / 2;
        var el = doc.pathItems.ellipse(cy + r, cx - r, DOMBO_DIAM, DOMBO_DIAM);
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
      doc.artboards[0].artboardRect = [tL - pad, tT + pad, tR + pad, tB - pad];
    }

    // ── 크기·파일명 ──
    var fr = doc.artboards[0].artboardRect;
    var wCm = Math.round((fr[2] - fr[0]) / PT_PER_MM / 10);
    var hCm = Math.round((fr[1] - fr[3]) / PT_PER_MM / 10);
    var st = nowStamp();
    var baseName = st.ymd + '-판짜기' + st.hm + '-' + wCm + 'x' + hCm + 'cm-1EA';

    // ── .ai 저장(조정 상태 보존) → EPS ──
    doc.save();
    var epsFile = new File(jobFolder.fsName + '/' + baseName + '.eps');
    var epsOpts = new EPSSaveOptions();
    epsOpts.cmykPostScript = true;
    epsOpts.compatibility = Compatibility.ILLUSTRATOR10;
    epsOpts.preview = EPSPreview.COLORTIFF;
    epsOpts.embedAllFonts = true;
    doc.saveAs(epsFile, epsOpts);

    // ── DXF (재단선 레이어만 — 다른 레이어 임시 숨김) ──
    var dxfOk = false;
    try {
      var visBack = [];
      for (var lv = 0; lv < doc.layers.length; lv++) {
        visBack.push(doc.layers[lv].visible);
        doc.layers[lv].visible = (doc.layers[lv].name === CUT_LAYER);
      }
      var dxfFile = new File(jobFolder.fsName + '/' + baseName + '.dxf');
      var dxfOpts = new ExportOptionsAutoCAD();
      dxfOpts.exportFileFormat = AutoCADExportFileFormat.DXF;
      dxfOpts.version = AutoCADCompatibility.AutoCADRelease21;
      dxfOpts.unit = AutoCADUnit.Millimeters;
      dxfOpts.scaleLineweights = false;
      try { dxfOpts.exportOption = AutoCADExportOption.MaximumEditability; } catch (eOpt) { }
      doc.exportFile(dxfFile, ExportType.AUTOCAD, dxfOpts);
      for (var lr = 0; lr < doc.layers.length; lr++) doc.layers[lr].visible = visBack[lr];
      dxfOk = true;
    } catch (eDxf) { alert('DXF 내보내기 경고: ' + eDxf + '\n(EPS는 정상 저장됨)'); }

    // ── 썸네일 ──
    var abW = fr[2] - fr[0], abH = fr[1] - fr[3];
    var maxPt2 = Math.max(abW, abH);
    var pct2 = maxPt2 > 0 ? Math.min(100, (400 / maxPt2) * 100) : 100;
    var pngFile = new File(jobFolder.fsName + '/thumb.png');
    var pngOpts = new ExportOptionsPNG24();
    pngOpts.artBoardClipping = true;
    pngOpts.horizontalScale = pct2; pngOpts.verticalScale = pct2;
    doc.exportFile(pngFile, ExportType.PNG24, pngOpts);

    // ── _출력 복사 (RIP·재단 픽업) ──
    try {
      var outDir = new Folder(REGISTER_ROOT + '/_출력/' + st.ymd);
      if (!outDir.exists) outDir.create();
      epsFile.copy(outDir.fsName + '/' + baseName + '.eps');
      if (dxfOk) new File(jobFolder.fsName + '/' + baseName + '.dxf').copy(outDir.fsName + '/' + baseName + '.dxf');
    } catch (eCp) { }

    // ── manifest (커밋 마커 — 마지막 기록) ──
    var pcName = $.getenv('COMPUTERNAME') || 'PC';
    var userName = $.getenv('USERNAME') || '';
    var manifest = {
      manifest_version: 1,
      script_version: SCRIPT_VERSION,
      type: 'sheet',
      registered_by: pcName + '\\' + userName,
      pc_name: pcName,
      entity_id: 1,
      client_name: '판짜기 ' + st.ymd + '-' + st.hm + ' (' + pieces.length + '조각)',
      qty: 1,
      finishing: null,
      trim: trim,
      scale_pct: 100,
      measured_cm: { w: wCm, h: hCm },
      mode: 'single',
      order_item_id: null,
      files: { work_ai: String(doc.name), eps: baseName + '.eps', thumb: 'thumb.png' },
      consumed_intake_ids: (meta && meta.intake_ids) ? meta.intake_ids : [],
      outline_failed: false,
      created_at_kst: st.kst
    };
    if (!writeTextFile(jobFolder.fsName + '/manifest.json', toJson(manifest))) {
      alert('manifest 기록 실패 (출력물은 저장됨)\n' + jobFolder.fsName);
      return;
    }

    alert('판 확정 완료 ✓\n\n'
      + '판: ' + wCm + ' × ' + hCm + ' cm · 조각 ' + pieces.length + '개\n'
      + 'EPS: ' + baseName + '.eps' + (dxfOk ? '\nDXF: ' + baseName + '.dxf (재단선 전용)' : '') + '\n'
      + '_출력\\' + st.ymd + '\\ 에 복사됨 · MES 등록은 ~30초 내 반영\n\n'
      + '※ 문서 연결이 EPS로 바뀌었습니다 — 추가 조정하려면 폴더의 .ai를 다시 여세요.');
  }
})();
