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
try {
(function() {

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

// result JSON 경로
var resultJson = _params.resultJson || "";
if (!resultJson && epsPath) {
    resultJson = epsPath.replace(/[^\\\/]*$/, "") + "sheet_layout_result.json";
}
_savedResultJson = resultJson;

if (!sourceFile) {
    $.writeln("SheetLayout ERROR: source 파라미터 필요");
    return;
}
if (!epsPath) {
    $.writeln("SheetLayout ERROR: outputs.eps 파라미터 필요");
    return;
}

var srcFile = new File(sourceFile);
if (!srcFile.exists) {
    $.writeln("SheetLayout ERROR: 파일 없음: " + sourceFile);
    try {
        var _errDir = resultJson ? resultJson.replace(/[^\\\/]*$/, "") : _scriptDir + "/";
        var _ef = new File(_errDir + "error.log");
        _ef.open("w"); _ef.write("JSError: 파일 없음: " + sourceFile); _ef.close();
    } catch(e_ef) {}
    return;
}

$.writeln("SheetLayout: source=" + sourceFile);
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
var CORNER_DIST = 10 * PT_PER_MM / scaleFactor;   // 꼭짓점에서 바깥 (실제 1cm)
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

// ── 3. 소스 파일 열기 ─────────────────────────────────────────────────────
var doc = app.open(srcFile);

// 자동 수정: CMYK 변환
try {
    if (doc.documentColorSpace !== DocumentColorSpace.CMYK) {
        $.writeln("AUTO-FIX: CMYK 변환 중...");
        app.executeMenuCommand('doc-color-cmyk');
    }
} catch(e_cmyk) {
    $.writeln("AUTO-FIX WARNING: CMYK 변환 실패 - " + e_cmyk.message);
}

// 자동 수정: 텍스트 아웃라인
try {
    for (var _ti = doc.textFrames.length - 1; _ti >= 0; _ti--) {
        try { doc.textFrames[_ti].createOutline(); } catch(e_tf) {}
    }
} catch(e_tf2) {}

// ── 4. 루트 레벨 그룹 수집 ────────────────────────────────────────────────
var allGroups = [];
for (var i = 0; i < doc.pageItems.length; i++) {
    var it = doc.pageItems[i];
    if (it.typename === "GroupItem" && (it.parent === doc || it.parent.typename === "Layer")) {
        allGroups.push(it);
    }
}
$.writeln("SheetLayout: 소스 그룹 수=" + allGroups.length);

if (allGroups.length === 0) {
    $.writeln("SheetLayout ERROR: 그룹이 없습니다");
    doc.close(SaveOptions.DONOTSAVECHANGES);
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

// ── 도련 v5: Design 그룹 자체��� 클립 마스크를 직접 확장 ──
// Bleed 별도 레이어 없이, Design 레이어의 그룹 내부 클립을 확장하여 도련 구현.
// CutLine은 원본 크기 유지. 배치 간���은 도련 포함 크기로 계산됨 (프론트엔드에서).

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
var newDoc = app.documents.add(DocumentColorSpace.CMYK, canvasWidthPt, canvasHeightPt);
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
    var srcGroup = allGroups[pl.group_index];
    if (!srcGroup) {
        $.writeln("SheetLayout WARNING: group_index=" + pl.group_index + " 없음");
        continue;
    }

    // 그룹 복사 → Layer A에 배치
    var copied = srcGroup.duplicate(layerA, ElementPlacement.PLACEATBEGINNING);

    // 회전 (rotated=true: 90도 시계방향, shelfBinPack 배치 회전)
    if (pl.rotated) {
        copied.rotate(-90);
    }

    // Illustrator 좌표 변환
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
    // 회전된 placement는 CutLine도 width↔height 교환
    var wPt2    = (pl2.rotated ? pl2.height_cm : pl2.width_cm)  * PT_PER_CM;
    var hPt2    = (pl2.rotated ? pl2.width_cm  : pl2.height_cm) * PT_PER_CM;

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
    var _cW = _cp.rotated ? _cp.height_cm : _cp.width_cm;
    var _cH = _cp.rotated ? _cp.width_cm  : _cp.height_cm;
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

// 꼭짓점 4개 (대각선 1cm 바깥)
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

// 10-1. EPS 저장 (A + B + C 전체, B는 print OFF 상태 유지)
var epsFile = new File(epsPath);
var epsOpts = new EPSSaveOptions();
epsOpts.compatibility = Compatibility.ILLUSTRATOR17;
epsOpts.preview = EPSPreview.COLORTIFF;
epsOpts.embedLinkedFiles = true;
newDoc.saveAs(epsFile, epsOpts);
$.writeln("SheetLayout: EPS → " + epsPath);

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
doc.close(SaveOptions.DONOTSAVECHANGES);

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
}
