/*
 * SheetLayout.jsx — 시트 배치: 3레이어 구조 + 3종 파일 생성
 *
 * ia_params.json 구조:
 * {
 *   "mode": "sheet_layout",
 *   "source": "Z:\\...\\source.ai",
 *   "canvas": { "width_cm": 127, "height_cm": 55, "margin_cm": 1.5 },
 *   "placements": [
 *     { "group_index": 0, "x_cm": 1.5, "y_cm": 0, "width_cm": 30, "height_cm": 20, "rotated": false }
 *   ],
 *   "outputs": {
 *     "eps": "Z:\\...\\파일_sheet.eps",
 *     "dxf": "Z:\\...\\파일_sheet.dxf",
 *     "jpg": "Z:\\...\\파일_sheet.jpg"
 *   }
 * }
 *
 * 레이어 구조:
 *   A (Design): 배치된 시트 데이터 — print ON
 *   B (CutLine): 외곽선 사각형 — 마젠타 100%, 0.06pt, print OFF
 *   C (Dombo): 돔보 마크 — K100, 채움 있음, 0.5pt, print ON
 *
 * 생성 파일:
 *   1. EPS: A + B(print OFF) + C — 출력용 (인쇄 시 A+C만 출력)
 *   2. DXF: B + C — 재단용 (커팅 플로터)
 *   3. JPG: A + B — 미리보기 (돔보 제외)
 */

#target illustrator

app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

var _savedResultJson = "";
// 진단(2026-07-28): 이 스크립트의 최종 상태를 호출자(에이전트 DoJavaScript)에게 반환한다.
//   기존에는 최상위가 try/catch 라 반환값이 없어, 실패 시 에이전트가 남길 수 있는 말이
//   "EPS 생성 실패 (결과 없음)" 뿐이었다 — 원인이 어디에도 기록되지 않았다(sheet #19).
//   ""(빈값) = 스크립트가 아예 실행되지 않았거나 조기 return, "done" = 완주, "ERR: …" = 예외.
var _ia_status = "";
try {
(function() {

// ── 0. 실행 추적(2026-07-28 진단) ─────────────────────────────────────────
// "JSX 반환 빈값" 의 정체를 가리기 위한 체크포인트 로그. 스크립트 폴더(ASCII 경로)에
// 항상 append 하므로 Z:·한글 경로 문제와 무관하게 남는다. 원인 확정 후 제거 가능.
// 경로는 에이전트가 preamble 로 주입한다(_ia_trace_path). $.fileName 에 의존하면
// DoJavaScript(문자열) 실행 시 파일을 가리키지 않아 첫 줄부터 죽는다.
var _traceFile = (typeof _ia_trace_path !== "undefined" && _ia_trace_path) ? _ia_trace_path : "";
function _tr(msg) {
    if (!_traceFile) return;
    try {
        var f = new File(_traceFile);
        f.open("a"); f.writeln("" + msg); f.close();
    } catch (e_tr) {}
}
_tr("--- SheetLayout start ---");

// ── 1. 파라미터 읽기 ──────────────────────────────────────────────────────
var _scriptDir = new File($.fileName).parent.fsName;
var _cfgPathSL = (typeof _ia_params_override_path !== "undefined" && _ia_params_override_path)
    ? _ia_params_override_path
    : (_scriptDir + "/ia_params.json");
var _configFile = new File(_cfgPathSL);
_configFile.open("r");
var _rawJson = _configFile.read();
_configFile.close();
var _params = eval("(" + _rawJson + ")");

var sourceFile  = _params.source  || "";
var sourcesArr  = _params.sources || [];   // 멀티소스 임포지션: [{analysis_id, path}] (없으면 단일 source 폴백)
var canvas      = _params.canvas  || {};
var placements  = _params.placements || [];
var outputs     = _params.outputs || {};
var bleedMm    = _params.bleed_mm || 3;
var gaps       = _params.gaps || [];

var canvasWidthCm  = canvas.width_cm  || 127;
var canvasHeightCm = canvas.height_cm || 55;
var marginCm       = canvas.margin_cm || 1.5;

var epsPath = outputs.eps || outputs.print_eps || "";
var dxfPath = outputs.dxf || outputs.cut_eps || "";
var jpgPath = outputs.jpg || "";
// P3-b: 실제 렌더 미리보기 — EPS/DXF saveAs·사후검증 스킵, JPG만 생성. (에이전트가 outputs.eps/dxf를 ""로 넘김)
var previewOnly = (_params.preview_only === true) || (canvas && canvas.preview_only === true);

// result JSON 경로
var resultJson = _params.resultJson || "";
if (!resultJson && epsPath) {
    resultJson = epsPath.replace(/[^\\\/]*$/, "") + "sheet_layout_result.json";
}
_savedResultJson = resultJson;

// ★ 조기 return 은 반드시 _ia_status 를 설정한다(2026-07-29). 미설정이면 반환값이 ""(빈값)이라
//   에이전트가 "JSX 반환 빈값(미실행/조기종료 의심 — 일러 모달 확인)" 이라는 **틀린** 진단을 UI에 띄운다.
//   실제 사유(파라미터 누락·소스 없음·조각 0개)가 모두 같은 문구로 뭉개졌던 원인. sheet #20·#21 오진.
if (!sourceFile && (!sourcesArr || !sourcesArr.length)) {
    $.writeln("SheetLayout ERROR: source 또는 sources 파라미터 필요");
    _ia_status = "ERR: 파라미터 누락 — source/sources 없음";
    _tr(_ia_status);
    return;
}
if (!previewOnly && !epsPath) {
    $.writeln("SheetLayout ERROR: outputs.eps 파라미터 필요");
    _ia_status = "ERR: 파라미터 누락 — outputs.eps 없음";
    _tr(_ia_status);
    return;
}
if (previewOnly && !jpgPath) {
    $.writeln("SheetLayout ERROR: preview_only는 outputs.jpg 필요");
    _ia_status = "ERR: 파라미터 누락 — preview_only 인데 outputs.jpg 없음";
    _tr(_ia_status);
    return;
}

$.writeln("SheetLayout: source=" + (sourceFile || (sourcesArr.length + "개 멀티소스")));
$.writeln("SheetLayout: canvas=" + canvasWidthCm + "x" + canvasHeightCm + "cm margin=" + marginCm + "cm");
$.writeln("SheetLayout: placements=" + placements.length + "개");

// ── 2. 단위 변환 상수 ─────────────────────────────────────────────────────
var PT_PER_MM   = 2.834645669;
var PT_PER_CM   = PT_PER_MM * 10.0;
var scaleFactor = _params.scale_factor || 1;
if (scaleFactor < 1) scaleFactor = 1;
var bleedPt    = bleedMm * PT_PER_MM / scaleFactor;

// 돔보 상수: 실제 크기를 스케일로 나눔 (출력 시 확대되므로)
var DOMBO_DIAM  = 6 * PT_PER_MM / scaleFactor;    // 돔보 원 지름 (실제 6mm)
var CORNER_DIST = 17 * PT_PER_MM / scaleFactor;   // 돔보 중심↔디자인 모서리 17mm → 돔보 바깥끝까지 17+3(반지름)=20mm
var DIR_OFFSET  = 60 * PT_PER_MM / scaleFactor;   // 방향 마크 (실제 6cm)
var MAX_GAP     = 500 * PT_PER_MM / scaleFactor;  // 간격 보정 (실제 50cm)
$.writeln("SheetLayout: scaleFactor=" + scaleFactor);

var canvasWidthPt  = canvasWidthCm  * PT_PER_CM;
// 캔버스 높이: placements에서 실제 최대 높이 계산 (회전 반영)
var maxBottomCm = canvasHeightCm;
for (var _pi = 0; _pi < placements.length; _pi++) {
    var _pH = placements[_pi].rotated ? placements[_pi].width_cm : placements[_pi].height_cm;
    var _b = placements[_pi].y_cm + _pH;
    if (_b > maxBottomCm) maxBottomCm = _b;
}
var canvasHeightPt = maxBottomCm * PT_PER_CM;

// ── 3. 소스 파일 열기 (멀티소스: sources[] 우선, 없으면 단일 source) ────────
// 각 소스 .ai를 열어 CMYK 변환·텍스트 아웃라인·루트 그룹 수집 → groupsByAid.
// 배치 루프(step 7)는 placement.analysis_id로 해당 소스 그룹에서 복제(크로스-도큐먼트).
function _slOpenPrep(path) {
    var f = new File(path);
    if (!f.exists) { $.writeln("SheetLayout: 소스 파일 없음: " + path); return null; }
    var d = app.open(f);
    try {
        if (d.documentColorSpace !== DocumentColorSpace.CMYK) app.executeMenuCommand('doc-color-cmyk');
    } catch(e_cmyk) { $.writeln("AUTO-FIX WARNING: CMYK 변환 실패 - " + e_cmyk); }
    try {
        for (var _ti = d.textFrames.length - 1; _ti >= 0; _ti--) { try { d.textFrames[_ti].createOutline(); } catch(e_tf) {} }
    } catch(e_tf2) {}
    var gs = [];
    for (var _gpi = 0; _gpi < d.pageItems.length; _gpi++) {
        var it = d.pageItems[_gpi];
        if (it.typename === "GroupItem" && (it.parent === d || it.parent.typename === "Layer")) gs.push(it);
    }
    // ★ 폴백(2026-07-28 원인 수정): 최상위 GroupItem 이 없는 소스 = 조각 0개로 인식돼
    //   판이 빈 채로 나가고 EPS 가 생기지 않았다(sheet #19 및 과거 실패 전건).
    //   디자이너 패널(mes-a0-host)이 만든 work.ai 는 아트워크를 그룹으로 묶지 않는다
    //   — IA 파이프라인 산출물(req_N-work.ai)만 그룹을 갖고 있어 그동안 가려져 있었다.
    //   이런 문서는 "문서 전체 = 조각 1개"가 맞으므로 최상위 아이템을 하나로 묶어 준다.
    if (gs.length === 0) {
        try {
            var _tops = [];
            for (var _li = 0; _li < d.layers.length; _li++) {
                var _lay = d.layers[_li];
                for (var _pi2 = 0; _pi2 < _lay.pageItems.length; _pi2++) _tops.push(_lay.pageItems[_pi2]);
            }
            if (_tops.length > 0) {
                var _wrap = d.layers[0].groupItems.add();
                // 역순 이동 — 컬렉션이 변하므로 앞에서부터 돌면 항목을 건너뛴다.
                for (var _mi = _tops.length - 1; _mi >= 0; _mi--) {
                    if (_tops[_mi] === _wrap) continue;
                    try { _tops[_mi].move(_wrap, ElementPlacement.PLACEATBEGINNING); } catch (e_mv) {}
                }
                if (_wrap.pageItems.length > 0) { gs.push(_wrap); _tr("  [폴백] 최상위 아트 " + _wrap.pageItems.length + "개를 1그룹으로 묶음: " + path); }
                else { try { _wrap.remove(); } catch (e_rm) {} }
            }
        } catch (e_wrap) { _tr("  [폴백] 그룹화 실패: " + e_wrap); }
    }
    return { doc: d, groups: gs };
}

var srcDocs = [];           // 열린 소스 문서(마지막에 전부 close)
var groupsByAid = {};       // String(analysis_id) → 루트 그룹 배열
var defaultGroups = null;   // 단일 소스 / analysis_id 없는 placement 폴백

_tr("params ok · sources=" + (sourcesArr ? sourcesArr.length : 0) + " placements=" + placements.length + " eps=" + (epsPath ? "set" : "EMPTY"));
if (sourcesArr && sourcesArr.length) {
    for (var _si = 0; _si < sourcesArr.length; _si++) {
        var _s = sourcesArr[_si];
        // ★ 멀티소스는 열기 실패를 조용히 건너뛰고 있었다(로그·return 없음) → 원인 추적 불가의
        //   한 축. 실패를 명시 기록한다(2026-07-28).
        var _exists = false;
        try { _exists = new File(_s.path).exists; } catch (e_ex) {}
        var _prep = _slOpenPrep(_s.path);
        if (_prep) {
            srcDocs.push(_prep.doc);
            groupsByAid[String(_s.analysis_id)] = _prep.groups;
            if (!defaultGroups) defaultGroups = _prep.groups;
            $.writeln("SheetLayout: 소스 aid=" + _s.analysis_id + " 그룹=" + _prep.groups.length);
            _tr("  source OK aid=" + _s.analysis_id + " groups=" + _prep.groups.length + " path=" + _s.path);
        } else {
            $.writeln("SheetLayout ERROR: 소스 열기 실패 aid=" + _s.analysis_id + " path=" + _s.path);
            _tr("  source FAIL aid=" + _s.analysis_id + " exists=" + _exists + " path=" + _s.path);
        }
    }
    _tr("sources loaded: srcDocs=" + srcDocs.length + " defaultGroups=" + (defaultGroups ? defaultGroups.length : "null"));
} else {
    var _prep0 = _slOpenPrep(sourceFile);
    if (!_prep0) {
        $.writeln("SheetLayout ERROR: 파일 없음: " + sourceFile);
        try {
            var _errDir = resultJson ? resultJson.replace(/[^\\\/]*$/, "") : _scriptDir + "/";
            var _ef = new File(_errDir + "error.log");
            _ef.open("w"); _ef.write("JSError: 파일 없음: " + sourceFile); _ef.close();
        } catch(e_ef) {}
        _ia_status = "ERR: 소스 파일 없음 — " + sourceFile;
        _tr(_ia_status);
        return;
    }
    srcDocs.push(_prep0.doc);
    defaultGroups = _prep0.groups;
    $.writeln("SheetLayout: 소스 그룹 수=" + _prep0.groups.length);
}

if (!defaultGroups || defaultGroups.length === 0) {
    $.writeln("SheetLayout ERROR: 그룹이 없습니다");
    // 위 _slOpenPrep 폴백(최상위 아트 자동 그룹화)까지 실패 = 소스 문서에 아트 자체가 없음.
    _ia_status = "ERR: 소스에 조각 0개 — 소스 .ai 에 아트워크가 없거나 열기 실패(경로/권한 확인)";
    _tr(_ia_status);
    for (var _ci = 0; _ci < srcDocs.length; _ci++) { try { srcDocs[_ci].close(SaveOptions.DONOTSAVECHANGES); } catch(e_c){} }
    return;
}

// ── 5. 색상 헬퍼 ──────────────────────────────────────────────────────────
function makeBlack() {
    var c = new CMYKColor();
    c.cyan = 0; c.magenta = 0; c.yellow = 0; c.black = 100;
    return c;
}

function makeMagenta() {
    var c = new CMYKColor();
    c.cyan = 0; c.magenta = 100; c.yellow = 0; c.black = 0;
    return c;
}

// ── 도련 v5: Design 그룹 자체의 클립 마스크를 직접 확장 ──
// Bleed 별도 레이어 없이, Design 레이어의 그룹 내부 클립을 확장하여 도련 구현.
// CutLine은 원본 크기 유지. 배치 간격은 도련 포함 크기로 계산됨 (프론트엔드에서).

// 그룹 내부의 클리핑 마스크 경로를 찾아서 확장
function expandClipInGroup(grp, dirs, bleedPt) {
    try {
        for (var ci = 0; ci < grp.pageItems.length; ci++) {
            var child = grp.pageItems[ci];

            // 클리핑 경로 발견
            if (child.clipping && child.typename === "PathItem" && child.closed) {
                var pts = child.pathPoints;
                // 사각형 클립 (4점)만 직접 확장
                if (pts.length === 4) {
                    var cb = child.geometricBounds; // [L, T, R, B]
                    var newL = cb[0] - (dirs.left   ? bleedPt : 0);
                    var newT = cb[1] + (dirs.top    ? bleedPt : 0);
                    var newR = cb[2] + (dirs.right  ? bleedPt : 0);
                    var newB = cb[3] - (dirs.bottom ? bleedPt : 0);
                    child.setEntirePath([
                        [newL, newT], [newR, newT],
                        [newR, newB], [newL, newB]
                    ]);
                    $.writeln("SheetLayout: clip expanded " +
                        Math.round((cb[2]-cb[0])/PT_PER_MM) + "x" + Math.round((cb[1]-cb[3])/PT_PER_MM) +
                        " -> " + Math.round((newR-newL)/PT_PER_MM) + "x" + Math.round((newT-newB)/PT_PER_MM) + "mm");
                    return true;
                }
            }

            // clipped 서브그룹 → 재귀
            if (child.typename === "GroupItem" && child.clipped) {
                if (expandClipInGroup(child, dirs, bleedPt)) return true;
            }
        }
    } catch(e) {}
    return false;
}

// ── 6. 새 문서 생성 + 3개 레이어 설정 ──────────────────────────────────────
/**
 * mm 단위 문서를 만든다.
 *
 * ★여기 있던 `newDoc.rulerUnits = RulerUnits.Millimeters` 는 **아무 일도 하지 않았다**
 *   (AI 30.7 실측 2026-08-25: 읽기 전용이라 예외도 안 던지고 값도 안 바뀐다).
 *   의도("저장 파일 기본 단위 = mm")는 맞았고 수단이 틀렸다 — DocumentPreset 이 유일한 경로다.
 *   `preferences rulerType` 도 안 통한다(이미 1(mm)인데 `documents.add()` 는 pt 문서를 만든다).
 *   EPS 는 문서 단위를 보존하므로 이 한 줄로 저장된 EPS 도 mm 로 열린다.
 *   DXF `$INSUNITS` 는 `ExportOptionsAutoCAD.unit` 이 정하므로 이미 mm 이고 영향 없다.
 *
 * 좌표는 point 그대로 넘긴다 — 눈금 단위만 바뀌고 기하는 불변이다.
 * ⚠️ `mes-cut-host.jsx` `mesCut_newDocMM` · `mes-a0-host.jsx` `mesA0_newDocMM` 과 같은 내용의 사본.
 */
function _iaNewDocMM(wPt, hPt) {
    try {
        var dp = new DocumentPreset();
        dp.units = RulerUnits.Millimeters;
        dp.colorMode = DocumentColorSpace.CMYK;
        dp.width = wPt;
        dp.height = hPt;
        return app.documents.addDocument("[Default] Print", dp);
    } catch (eU) {
        return app.documents.add(DocumentColorSpace.CMYK, wPt, hPt);
    }
}
var newDoc = _iaNewDocMM(canvasWidthPt, canvasHeightPt);
newDoc.artboards[0].artboardRect = [0, canvasHeightPt, canvasWidthPt, 0];

// 레이어 생성 (아래→위 순서: A가 맨 아래, C가 맨 위)
// 기본 레이어를 A로 사용
var layerA = newDoc.layers[0];
layerA.name = "Design";

var layerB = newDoc.layers.add();
layerB.name = "CutLine";
layerB.printable = false; // 인쇄 OFF

var layerC = newDoc.layers.add();
layerC.name = "Dombo";

$.writeln("SheetLayout: 레이어 생성 완료 (Design, CutLine[print OFF], Dombo)");

// ── 7. Layer A: 디자인 배치 + 도련 직접 적용 (v5) ──────────────────────────
newDoc.activeLayer = layerA;

for (var pi = 0; pi < placements.length; pi++) {
    var pl = placements[pi];
    var _plGroups = (pl.analysis_id != null && groupsByAid[String(pl.analysis_id)]) ? groupsByAid[String(pl.analysis_id)] : defaultGroups;
    var srcGroup = _plGroups[pl.group_index];
    if (!srcGroup) {
        $.writeln("SheetLayout WARNING: aid=" + pl.analysis_id + " group_index=" + pl.group_index + " 없음");
        continue;
    }

    // 그룹 복사 → Layer A에 배치
    var copied = srcGroup.duplicate(layerA, ElementPlacement.PLACEATBEGINNING);

    // 조각을 목표(placement) 크기로 스케일 — 임포지션 배율(×N)·목표크기 반영. 미회전 기준(회전 시 W↔H swap).
    //   배율=1이면 native=placement라 무동작(스케일 100% 스킵) → 기존 렌더 회귀 0.
    var _tgtW = (pl.rotated ? pl.height_cm : pl.width_cm) * PT_PER_CM;
    var _tgtH = (pl.rotated ? pl.width_cm  : pl.height_cm) * PT_PER_CM;
    try {
        var _cgb = copied.geometricBounds; // [L,T,R,B]
        var _cW = _cgb[2] - _cgb[0], _cH = _cgb[1] - _cgb[3];
        if (_cW > 0.01 && _cH > 0.01 && _tgtW > 0.01 && _tgtH > 0.01) {
            var _sclX = _tgtW / _cW * 100, _sclY = _tgtH / _cH * 100;
            if (Math.abs(_sclX - 100) > 0.5 || Math.abs(_sclY - 100) > 0.5) {
                copied.resize(_sclX, _sclY, true, true, true, true, _sclX);
                $.writeln("SheetLayout: [A] resize placement[" + pi + "] " + Math.round(_cW/PT_PER_MM) + "x" + Math.round(_cH/PT_PER_MM) + " -> " + Math.round(_tgtW/PT_PER_MM) + "x" + Math.round(_tgtH/PT_PER_MM) + "mm");
            }
        }
    } catch (e_scl) { $.writeln("SheetLayout: [A] resize skip[" + pi + "] " + e_scl); }

    // 회전: rotation(각도 0/90/180/270) 우선, 없으면 rotated bool(=90). 이형 수동 인터록 지원.
    // Konva CW(화면) → Illustrator rotate(-각도). position이 회전 후 bbox 좌상단을 배치하므로 각도 무관 정확.
    var _rot = (pl.rotation != null) ? Number(pl.rotation) : (pl.rotated ? 90 : 0);
    if (_rot) {
        copied.rotate(-_rot);
    }

    // Illustrator 좌표 변환 — 회전 후 bbox 좌상단을 배치(검증된 원본 방식).
    // ⚠️ visibleBounds 접근 금지: 복잡/래스터 아트에서 렌더경계 강제계산 → 조각마다 hang(중간멈춤 원인, 2026-07-15).
    var xPt    = pl.x_cm * PT_PER_CM;
    var yTopPt = canvasHeightPt - (pl.y_cm * PT_PER_CM);
    copied.position = [xPt, yTopPt];

    // ── 도련 v5: Design 그룹의 클립 마스크를 직접 확장 ──
    var blInfo = pl.bleed || {};
    var bTop    = (blInfo.top    || 0) * PT_PER_CM;
    var bBottom = (blInfo.bottom || 0) * PT_PER_CM;
    var bLeft   = (blInfo.left   || 0) * PT_PER_CM;
    var bRight  = (blInfo.right  || 0) * PT_PER_CM;

    if (bTop > 0 || bBottom > 0 || bLeft > 0 || bRight > 0) {
        var blDirs = {
            top:    bTop > 0,
            bottom: bBottom > 0,
            left:   bLeft > 0,
            right:  bRight > 0
        };
        // 최대 bleed 값 (방향별로 다를 수 있지만 클립은 균일 확장)
        var maxBleed = Math.max(bTop, bBottom, bLeft, bRight);
        if (copied.typename === "GroupItem") {
            var expanded = expandClipInGroup(copied, blDirs, maxBleed);
            if (!expanded) {
                // 폴백: 스케일 확대
                var gb = copied.geometricBounds;
                var gW = gb[2] - gb[0], gH = gb[1] - gb[3];
                if (gW > 0 && gH > 0) {
                    var scX = (gW + bLeft + bRight) / gW * 100;
                    var scY = (gH + bTop + bBottom) / gH * 100;
                    copied.resize(scX, scY, true, true, true, true, scX);
                    copied.left = gb[0] - bLeft;
                    copied.top = gb[1] + bTop;
                }
                $.writeln("SheetLayout: [A] bleed fallback (scale) placement[" + pi + "]");
            }
        }
        $.writeln("SheetLayout: [A] bleed applied [" + pi + "] T:" + Math.round(bTop/PT_PER_MM)
            + " B:" + Math.round(bBottom/PT_PER_MM) + " L:" + Math.round(bLeft/PT_PER_MM)
            + " R:" + Math.round(bRight/PT_PER_MM) + "mm");
    }

    $.writeln("SheetLayout: [A] placement[" + pi + "] group=" + pl.group_index
        + " " + pl.width_cm + "x" + pl.height_cm + "cm"
        + (pl.rotated ? " (회전)" : ""));
}

// ── 8. Layer B: 외곽선 사각형 (마젠타 100%, 0.06pt, print OFF) ──────────────
newDoc.activeLayer = layerB;
var magenta = makeMagenta();

for (var pi2 = 0; pi2 < placements.length; pi2++) {
    var pl2 = placements[pi2];
    var xPt2    = pl2.x_cm * PT_PER_CM;
    var yTopPt2 = canvasHeightPt - (pl2.y_cm * PT_PER_CM);
    // width_cm/height_cm = 회전 후 최종 bbox(iaeCanRotBBox 정본). 회전 좌표에 직접 그리므로 스왑 금지
    // (스왑 시 재단선이 전치(transpose)돼 회전 조각에서 아트보드와 불일치 — Layer A는 회전 전 스케일이라 스왑이 맞음).
    var wPt2    = pl2.width_cm  * PT_PER_CM;
    var hPt2    = pl2.height_cm * PT_PER_CM;

    var rect = layerB.pathItems.rectangle(yTopPt2, xPt2, wPt2, hPt2);
    rect.filled = false;
    rect.stroked = true;
    rect.strokeColor = magenta;
    rect.strokeWidth = Math.max(0.1, 0.06 / scaleFactor); // DXF 내보내기 시 0 방지
}
$.writeln("SheetLayout: [B] 외곽선 " + placements.length + "개 (M100, 0.06pt, print OFF)");

// ── 9. Layer C: 돔보 마크 (K100, 채움 있음, 0.5pt) ──────────────────────────
newDoc.activeLayer = layerC;
var black = makeBlack();

// 돔보 원 생성 함수 (채움 있음)
function createDombo(cx, cy) {
    var ellipse = newDoc.pathItems.ellipse(
        cy + DOMBO_DIAM / 2,  // top
        cx - DOMBO_DIAM / 2,  // left
        DOMBO_DIAM,
        DOMBO_DIAM
    );
    // 단순 채움 원형 (K100, stroke 없음)
    ellipse.filled = true;
    ellipse.fillColor = black;
    ellipse.stroked = false;
    return ellipse;
}

// 50cm 간격 보정
function addIntermediate(from, to, fixedCoord, isHorizontal) {
    var span = Math.abs(to - from);
    if (span <= MAX_GAP) return;
    var divisions = Math.ceil(span / MAX_GAP);
    var step = span / divisions;
    var minCoord = Math.min(from, to);
    for (var d = 1; d < divisions; d++) {
        var pos = minCoord + step * d;
        if (isHorizontal) { createDombo(pos, fixedCoord); }
        else { createDombo(fixedCoord, pos); }
    }
}

// 실제 콘텐츠 바운드 계산 (placements 기준 — 회전 반영)
var artL = Infinity, artT = -Infinity, artR = -Infinity, artB = Infinity;
for (var _ci = 0; _ci < placements.length; _ci++) {
    var _cp = placements[_ci];
    var _cW = _cp.width_cm;   // 회전 후 최종 bbox — 스왑 불필요(Layer B와 동일 정본)
    var _cH = _cp.height_cm;
    var _cxL = _cp.x_cm * PT_PER_CM;
    var _cxR = (_cp.x_cm + _cW) * PT_PER_CM;
    var _cyT = canvasHeightPt - _cp.y_cm * PT_PER_CM;
    var _cyB = canvasHeightPt - (_cp.y_cm + _cH) * PT_PER_CM;
    if (_cxL < artL) artL = _cxL;
    if (_cxR > artR) artR = _cxR;
    if (_cyT > artT) artT = _cyT;
    if (_cyB < artB) artB = _cyB;
}
// fallback: placements 비어있으면 캔버스 전체
if (!isFinite(artL)) { artL = 0; artT = canvasHeightPt; artR = canvasWidthPt; artB = 0; }

// 꼭짓점 4개 — 조각 전체 바운드에서 대각 바깥으로 CORNER_DIST(17mm).
//   원 지름 6mm 이므로 바깥 끝까지 17+3=20mm. (주석이 "1cm"로 남아 있어 실제 값과 어긋났다 — 2026-07-29 정정)
createDombo(artL - CORNER_DIST, artT + CORNER_DIST); // 좌상단
createDombo(artR + CORNER_DIST, artT + CORNER_DIST); // 우상단
createDombo(artL - CORNER_DIST, artB - CORNER_DIST); // 좌하단
createDombo(artR + CORNER_DIST, artB - CORNER_DIST); // 우하단

// 방향 마크: 좌상단에서 가로 6cm (위쪽)
createDombo(artL + DIR_OFFSET, artT + CORNER_DIST);

// 간격 보정: 상하좌우 변
addIntermediate(artL - CORNER_DIST, artR + CORNER_DIST, artT + CORNER_DIST, true);  // 상단
addIntermediate(artL - CORNER_DIST, artR + CORNER_DIST, artB - CORNER_DIST, true);  // 하단
addIntermediate(artT + CORNER_DIST, artB - CORNER_DIST, artL - CORNER_DIST, false); // 좌측
addIntermediate(artT + CORNER_DIST, artB - CORNER_DIST, artR + CORNER_DIST, false); // 우측

$.writeln("SheetLayout: [C] 돔보 마크 배치 완료");

// ── 9.5 아트보드 확장: 돔보 마크 포함 ──────────────────────────────────────
// 돔보 마크가 CORNER_DIST만큼 콘텐츠 바깥에 위치하므로 아트보드를 확장.
// DXF 내보내기 시 아트보드 경계의 요소가 잘리지 않도록 여유 추가.
var pad = CORNER_DIST + DOMBO_DIAM; // 돔보 원 지름까지 포함
var abLeft   = (artL - CORNER_DIST) - pad;
var abTop    = (artT + CORNER_DIST) + pad;
var abRight  = (artR + CORNER_DIST) + pad;
var abBottom = (artB - CORNER_DIST) - pad;
newDoc.artboards[0].artboardRect = [abLeft, abTop, abRight, abBottom];
$.writeln("SheetLayout: 아트보드 확장 — 돔보 마크 포함 (pad=" + Math.round(pad/PT_PER_MM) + "mm)");

// ── 10. 파일 저장 ─────────────────────────────────────────────────────────

// 10-1. EPS 저장 (A + B + C 전체, B는 print OFF 상태 유지) — preview_only면 스킵
if (!previewOnly) {
    var epsFile = new File(epsPath);
    var epsOpts = new EPSSaveOptions();
    epsOpts.compatibility = Compatibility.ILLUSTRATOR17;
    epsOpts.preview = EPSPreview.COLORTIFF;
    epsOpts.embedLinkedFiles = true;
    newDoc.saveAs(epsFile, epsOpts);
    $.writeln("SheetLayout: EPS → " + epsPath);
}

// 10-2. JPG 저장 (A + B만, C 숨기기)
layerC.visible = false;
if (jpgPath) {
    var jpgFile = new File(jpgPath);
    var jpgOpts = new ExportOptionsJPEG();
    jpgOpts.qualitySetting = 80;
    jpgOpts.resolution = 150;
    jpgOpts.antiAliasing = true;
    jpgOpts.horizontalScale = 100;
    jpgOpts.verticalScale = 100;
    newDoc.exportFile(jpgFile, ExportType.JPEG, jpgOpts);
    $.writeln("SheetLayout: JPG → " + jpgPath);
}
layerC.visible = true;

// P3-b: preview_only — DXF·사후검증 스킵, 문서 정리 후 종료(에이전트가 JPG만 읽음).
if (previewOnly) {
    $.writeln("SheetLayout: preview_only → JPG만 생성(EPS/DXF·검증 스킵)");
    newDoc.close(SaveOptions.DONOTSAVECHANGES);
    for (var _pvc = 0; _pvc < srcDocs.length; _pvc++) { try { srcDocs[_pvc].close(SaveOptions.DONOTSAVECHANGES); } catch (e_pvc) {} }
    _ia_status = "done(preview)";   // 정상 종료인데도 ""(빈값)이라 실패로 오독되던 경로
    _tr(_ia_status);
    return;
}

// 10-3. DXF 저장 (B + C만, A 삭제)
layerA.remove(); // EPS/JPG 이미 저장됨, 문서는 close(DONOTSAVE)이므로 안전

// CutLine(B) printable 복원 — DXF 내보내기 시 비인쇄 레이어가 누락/변형되는 문제 방지
layerB.printable = true;

if (dxfPath) {
    var dxfFile = new File(dxfPath);
    var dxfOpts = new ExportOptionsAutoCAD();
    dxfOpts.exportFileFormat = AutoCADExportFileFormat.DXF;
    dxfOpts.version = AutoCADCompatibility.AutoCADRelease21;
    dxfOpts.unit = AutoCADUnit.Millimeters;
    dxfOpts.scaleLineweights = false; // 선 두께 스케일링 비활성화 (0으로 축소 방지)
    try { dxfOpts.exportOption = AutoCADExportOption.MaximumEditability; } catch(e_dxf) {}
    newDoc.exportFile(dxfFile, ExportType.AUTOCAD, dxfOpts);
    $.writeln("SheetLayout: DXF → " + dxfPath);
    $.writeln("SheetLayout: DXF layers - CutLine(printable=" + layerB.printable + "), Dombo");
}

// ── 11. 정리 ──────────────────────────────────────────────────────────────
newDoc.close(SaveOptions.DONOTSAVECHANGES);
for (var _sdc = 0; _sdc < srcDocs.length; _sdc++) { try { srcDocs[_sdc].close(SaveOptions.DONOTSAVECHANGES); } catch(e_sdc){} }

// ── 12. 사후 검증 + 결과 JSON ──────────────────────────────────────────────
var verifyErrors = [];

// 검증 1: 레이어 구조 확인 (저장 전이므로 newDoc 기준 — DXF 전에는 모든 레이어 존재)
try {
    var expectedLayers = ["Design", "CutLine", "Dombo"];
    for (var vli = 0; vli < expectedLayers.length; vli++) {
        var found = false;
        for (var vl2 = 0; vl2 < newDoc.layers.length; vl2++) {
            if (newDoc.layers[vl2].name === expectedLayers[vli]) { found = true; break; }
        }
        if (!found) verifyErrors.push("missing_layer:" + expectedLayers[vli]);
    }
} catch(e_v1) {}

// 검증 2: CutLine 아이템 수 = placements 수
try {
    var cutLineLayer = null;
    for (var vl3 = 0; vl3 < newDoc.layers.length; vl3++) {
        if (newDoc.layers[vl3].name === "CutLine") { cutLineLayer = newDoc.layers[vl3]; break; }
    }
    if (cutLineLayer && cutLineLayer.pathItems.length !== placements.length) {
        verifyErrors.push("cutline_count:" + cutLineLayer.pathItems.length + "/" + placements.length);
    }
} catch(e_v2) {}

// 검증 3: 아트보드 크기 (도련 포함)
try {
    var abRect = newDoc.artboards[0].artboardRect;
    var abW = Math.round(Math.abs(abRect[2] - abRect[0]) / PT_PER_MM);
    var abH = Math.round(Math.abs(abRect[1] - abRect[3]) / PT_PER_MM);
    var expectedW = Math.round(canvasWidthCm * 10 + (bleedPt > 0 ? bleedMm * 2 : 0));
    var expectedH = Math.round(maxBottomCm * 10 + (bleedPt > 0 ? bleedMm * 2 : 0));
    if (Math.abs(abW - expectedW) > 2) verifyErrors.push("artboard_w:" + abW + "/" + expectedW);
    if (Math.abs(abH - expectedH) > 2) verifyErrors.push("artboard_h:" + abH + "/" + expectedH);
} catch(e_v3) {}

if (verifyErrors.length > 0) {
    $.writeln("SheetLayout VERIFY WARN: " + verifyErrors.join(", "));
} else {
    $.writeln("SheetLayout VERIFY: 모든 검증 통과");
}

var epsEsc = epsPath.replace(/\\/g, "\\\\");
var dxfEsc = (dxfPath || "").replace(/\\/g, "\\\\");
var jpgEsc = (jpgPath || "").replace(/\\/g, "\\\\");
var verifyEsc = verifyErrors.length > 0 ? verifyErrors.join(",") : "";

var resultObj = '{"success":true'
    + ',"width_cm":' + canvasWidthCm.toFixed(2)
    + ',"height_cm":' + canvasHeightCm.toFixed(2)
    + ',"eps":"' + epsEsc + '"'
    + ',"dxf":"' + dxfEsc + '"'
    + ',"jpg":"' + jpgEsc + '"'
    + (verifyEsc ? ',"verify_warnings":"' + verifyEsc + '"' : '')
    + '}';

if (resultJson) {
    var jf = new File(resultJson);
    jf.encoding = "UTF-8";
    jf.open("w"); jf.write(resultObj); jf.close();
    $.writeln("SheetLayout: 결과 JSON → " + resultJson);
}

$.writeln("SheetLayout 완료");
_ia_status = "done";

})();
} catch(e) {
    if (_savedResultJson) {
        var _errDir2 = _savedResultJson.replace(/[^\\\/]*$/, "");
        var _logF = new File(_errDir2 + "error.log");
        _logF.open("w"); _logF.write("JSError: " + e.message + " (line " + e.line + ")"); _logF.close();
    } else {
        var _sd = new File($.fileName).parent.fsName;
        var _logF2 = new File(_sd + "/ia_error.log");
        _logF2.open("w"); _logF2.write("JSError: " + e.message + " (line " + e.line + ")"); _logF2.close();
    }
    $.writeln("SheetLayout EXCEPTION: " + e.message + " (line " + e.line + ")");
    _ia_status = "ERR: " + e.message + " (line " + e.line + ")";
}
// ★ 마지막 표현식 = DoJavaScript 반환값. 에이전트가 이 문자열을 render_error 에 실어
//   "왜 산출물이 없는지"를 남긴다. 문자열이 아니면 COM 이 빈값으로 넘기므로 String() 고정.
String(_ia_status);
