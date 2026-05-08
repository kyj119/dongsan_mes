/*
 * PackGroups.jsx — 그룹 묶음 배치 + 돔보(타공) 마크 + 재단선 파일 생성
 *
 * 환경변수 (C#에서 ProcessStartInfo.EnvironmentVariables로 설정):
 *   IA_SOURCE         소스 AI/EPS 파일 전체 경로
 *   IA_MODE           'combined' | 'individual'
 *   IA_GROUP_INDICES  JSON 배열 (예: "[0,1,2]") — 처리할 그룹 인덱스
 *   IA_WIDTHS_CM      JSON 배열 (예: "[105,127,152]") — 시도할 너비 옵션
 *   IA_OUTPUT_1       1번 파일(레이아웃+돔보) 저장 경로
 *   IA_OUTPUT_2       2번 파일(재단선) 저장 경로
 *   IA_OUTPUT_THUMB   PNG 썸네일 저장 경로
 *   IA_RESULT_JSON    결과 JSON 저장 경로 (width_cm, height_cm 포함)
 *   IA_THUMB          썸네일 최대 px (기본: 300)
 *
 * 돔보(타공) 배치 규칙:
 *   - 꼭짓점 4개: 각 꼭짓점에서 대각선 1cm 위치 (바깥쪽)
 *   - 방향 마크: 좌상단 꼭짓점에서 가로 10cm 위치 (위쪽)
 *   - 간격 보정: 인접 원 간격 > 50cm 이면 균등 분할하여 추가
 *   - 돔보 원: 지름 6mm, 검정, 내부 채움 없음(윤곽선만)
 */

#target illustrator

// 다이얼로그 억제: EPS 포맷 경고, 스크립트 오류 팝업 등 차단
app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

var _savedResultJson = ""; // catch 블록에서 접근할 수 있도록 IIFE 외부에 선언
try {
(function() {

// ── 1. 파라미터 읽기 (ia_params.json) ──────────────────────────────────────
// COM 자동화 시 _ia_params_override_path 변수로 경로가 주입됨
var _scriptDir = new File($.fileName).parent.fsName;
var _cfgPathPG = (typeof _ia_params_override_path !== "undefined" && _ia_params_override_path)
    ? _ia_params_override_path
    : (_scriptDir + "/ia_params.json");
var _configFile = new File(_cfgPathPG);
_configFile.open("r");
var _params = eval("(" + _configFile.read() + ")");
_configFile.close();

var sourceFile   = _params.source      || "";
var mode         = _params.mode        || "combined";
var indicesStr   = _params.groupIndices || "[-1]";
var widthsStr    = _params.widths      || "[105,127,152]";
var output1      = _params.output1     || "";
var output2      = _params.output2     || "";
var outputThumb  = _params.outputThumb || "";
var resultJson   = _params.resultJson  || "";
var thumbSize    = _params.thumbSize   || 300;
_savedResultJson = resultJson; // catch 블록에서 사용할 수 있도록 저장

if (!sourceFile || !output1 || !output2 || !resultJson) {
    $.writeln("PackGroups ERROR: source, output1, output2, resultJson 파라미터 필요");
    return;
}

var srcFile = new File(sourceFile);
if (!srcFile.exists) {
    var _missingMsg = "파일 없음: " + sourceFile;
    $.writeln("PackGroups ERROR: " + _missingMsg);
    try {
        var _errDir = resultJson.replace(/[^\\\/]*$/, "");
        var _ef = new File(_errDir + "error.log");
        _ef.open("w");
        _ef.write("JSError: " + _missingMsg);
        _ef.close();
    } catch(e) {}
    return;
}

// ── 2. JSON 간이 파싱 (ExtendScript에는 JSON이 없음) ─────────────────────
function parseIntArray(str) {
    str = str.replace(/[\[\]\s]/g, '');
    if (!str) return [];
    var parts = str.split(',');
    var result = [];
    for (var i = 0; i < parts.length; i++) {
        var n = parseInt(parts[i]);
        if (!isNaN(n)) result.push(n);
    }
    return result;
}

var groupIndices = parseIntArray(indicesStr);
var widthsCm = parseIntArray(widthsStr);
if (widthsCm.length === 0) widthsCm = [105, 127, 152];

$.writeln("PackGroups: mode=" + mode + " groups=" + indicesStr + " widths=" + widthsStr);

// ── 3. 단위 변환 상수 ─────────────────────────────────────────────────────
var PT_PER_MM   = 2.834645669;
var PT_PER_CM   = PT_PER_MM * 10.0;
var DOMBO_DIAM  = 6 * PT_PER_MM;   // 6mm 지름
var CORNER_DIST = 10 * PT_PER_MM;  // 꼭짓점에서 1cm
var DIR_OFFSET  = 100 * PT_PER_MM; // 방향 마크: 10cm
var MAX_GAP     = 500 * PT_PER_MM; // 50cm 간격 초과 시 추가

// ── 4. 소스 파일 열기 ─────────────────────────────────────────────────────
var doc = app.open(srcFile);

// ── 자동 수정: CMYK 변환 + 텍스트 아웃라인 ─────────────────────────────
// CMYK 아닌 경우 자동 변환 (RGB → CMYK)
try {
    if (doc.documentColorSpace !== DocumentColorSpace.CMYK) {
        $.writeln("AUTO-FIX: CMYK 변환 중...");
        app.executeMenuCommand('doc-color-cmyk');
        $.writeln("AUTO-FIX: CMYK 변환 완료");
    }
} catch(e_cmyk) {
    $.writeln("AUTO-FIX WARNING: CMYK 변환 실패 - " + e_cmyk.message);
}
// 미아웃라인 텍스트프레임 → 아웃라인 처리 (역순: createOutline이 TextFrame 제거함)
try {
    if (doc.textFrames.length > 0) {
        $.writeln("AUTO-FIX: " + doc.textFrames.length + "개 텍스트 아웃라인 처리 중...");
        for (var _ti = doc.textFrames.length - 1; _ti >= 0; _ti--) {
            try { doc.textFrames[_ti].createOutline(); } catch(e_tf) {}
        }
        $.writeln("AUTO-FIX: 아웃라인 처리 완료");
    }
} catch(e_tf2) {
    $.writeln("AUTO-FIX WARNING: 아웃라인 처리 실패 - " + e_tf2.message);
}
// ─────────────────────────────────────────────────────────────────────

// 루트 레벨 GroupItem 목록 수집
var allGroups = [];
for (var i = 0; i < doc.pageItems.length; i++) {
    var it = doc.pageItems[i];
    if (it.typename === "GroupItem" && (it.parent === doc || it.parent.typename === "Layer")) {
        allGroups.push(it);
    }
}

// 처리할 그룹 필터링
var targetGroups = [];
if (groupIndices.length === 0 || groupIndices[0] === -1 || groupIndices[0] === -2) {
    // 전체 그룹
    targetGroups = allGroups;
} else {
    for (var gi = 0; gi < groupIndices.length; gi++) {
        var idx = groupIndices[gi];
        if (idx >= 0 && idx < allGroups.length) {
            targetGroups.push(allGroups[idx]);
        }
    }
}

if (targetGroups.length === 0) {
    // 그룹 없으면 전체 문서를 하나로 처리
    $.writeln("PackGroups: 그룹 없음 → 전체 문서 사용");
    targetGroups = [null];
}

// ── 5. 그룹 크기 수집 ────────────────────────────────────────────────────
// Illustrator 좌표: bounds = [left, top, right, bottom]
// width = right - left, height = top - bottom (top > bottom)
function getGroupSize(group) {
    if (group === null) {
        var ab = doc.artboards[0].artboardRect; // [left, top, right, bottom]
        return { w: Math.abs(ab[2] - ab[0]), h: Math.abs(ab[1] - ab[3]) };
    }
    var b = group.visibleBounds; // [left, top, right, bottom]
    return { w: Math.abs(b[2] - b[0]), h: Math.abs(b[1] - b[3]) };
}

var groupSizes = [];
for (var g = 0; g < targetGroups.length; g++) {
    groupSizes.push(getGroupSize(targetGroups[g]));
}

// ── 6. 레이아웃 계산 ─────────────────────────────────────────────────────
// combined: 여러 그룹을 지정 너비 안에 최적 배치 (Shelf First Fit Decreasing)
// individual: 각 그룹 개별 처리 (묶음 없음)

function shelfLayout(sizes, shelfWidthPt) {
    // 높이 기준 내림차순 정렬 (가장 큰 것부터 배치)
    var order = [];
    for (var i = 0; i < sizes.length; i++) order.push(i);
    order.sort(function(a, b) { return sizes[b].h - sizes[a].h; });

    var shelves = []; // {y_top, currentX, shelfHeight}
    var placements = []; // {idx, x, y_top}
    var totalHeight = 0;

    for (var oi = 0; oi < order.length; oi++) {
        var idx = order[oi];
        var sz = sizes[idx];
        var placed = false;

        for (var si = 0; si < shelves.length; si++) {
            var shelf = shelves[si];
            if (shelf.currentX + sz.w <= shelfWidthPt) {
                placements.push({ idx: idx, x: shelf.currentX, y_top: shelf.y_top });
                shelf.currentX += sz.w;
                placed = true;
                break;
            }
        }

        if (!placed) {
            var newY = totalHeight;
            shelves.push({ y_top: newY, currentX: sz.w, shelfHeight: sz.h });
            totalHeight += sz.h;
            placements.push({ idx: idx, x: 0, y_top: newY });
        }
    }

    return { placements: placements, totalHeight: totalHeight };
}

// ── 7. 최적 너비 선택 (combined 모드) ─────────────────────────────────────
var bestWidth = widthsCm[0] * PT_PER_CM;
var bestLayout = null;
var bestHeight = Infinity;

if (mode === "combined") {
    for (var wi = 0; wi < widthsCm.length; wi++) {
        var trialWidth = widthsCm[wi] * PT_PER_CM;
        var layout = shelfLayout(groupSizes, trialWidth);
        if (layout.totalHeight < bestHeight) {
            bestHeight = layout.totalHeight;
            bestWidth = trialWidth;
            bestLayout = layout;
        }
    }
    $.writeln("PackGroups: 최적 너비=" + Math.round(bestWidth / PT_PER_CM) + "cm, 높이=" + Math.round(bestHeight / PT_PER_CM) + "cm");
}

// ── 8. 1번 파일 생성 (레이아웃 + 돔보) ───────────────────────────────────
function createDomboMark(targetDoc, cx, cy) {
    // 검정색 원 (채움 없음, 윤곽선만)
    var ellipse = targetDoc.pathItems.ellipse(
        cy + DOMBO_DIAM / 2,  // top (Illustrator: y축 위쪽이 큰 값)
        cx - DOMBO_DIAM / 2,  // left
        DOMBO_DIAM,           // width
        DOMBO_DIAM            // height
    );
    ellipse.filled = false;
    ellipse.stroked = true;
    ellipse.strokeColor = makeBlack(targetDoc);
    ellipse.strokeWidth = 0.5;
    return ellipse;
}

function makeBlack(targetDoc) {
    var c = new CMYKColor();
    c.cyan = 0; c.magenta = 0; c.yellow = 0; c.black = 100;
    return c;
}

// 돔보 원 배치: 꼭짓점 + 방향 + 50cm 간격 추가
// artboardRect: [left, top, right, bottom] (Illustrator 좌표: top > bottom)
function addDomboMarks(targetDoc, artLeft, artTop, artRight, artBottom) {
    var W = artRight - artLeft;
    var H = artTop - artBottom;

    $.writeln("PackGroups: 돔보 배치 W=" + Math.round(W/PT_PER_CM) + "cm H=" + Math.round(H/PT_PER_CM) + "cm");

    // 꼭짓점 4개 (대각선 1cm 위치 — 아트보드 바깥쪽)
    // 좌상단
    createDomboMark(targetDoc, artLeft - CORNER_DIST, artTop + CORNER_DIST);
    // 우상단
    createDomboMark(targetDoc, artRight + CORNER_DIST, artTop + CORNER_DIST);
    // 좌하단
    createDomboMark(targetDoc, artLeft - CORNER_DIST, artBottom - CORNER_DIST);
    // 우하단
    createDomboMark(targetDoc, artRight + CORNER_DIST, artBottom - CORNER_DIST);

    // 방향 마크: 좌상단에서 가로 10cm (위쪽, 아트보드 바깥)
    createDomboMark(targetDoc, artLeft + DIR_OFFSET, artTop + CORNER_DIST);

    // 가로 방향: 상단 변 (좌상→우상) 사이 추가 원
    addIntermediate(targetDoc, artLeft - CORNER_DIST, artRight + CORNER_DIST,
        artTop + CORNER_DIST, true);

    // 가로 방향: 하단 변 (좌하→우하) 사이 추가 원
    addIntermediate(targetDoc, artLeft - CORNER_DIST, artRight + CORNER_DIST,
        artBottom - CORNER_DIST, true);

    // 세로 방향: 좌측 변 (좌상→좌하) 사이 추가 원
    addIntermediate(targetDoc, artTop + CORNER_DIST, artBottom - CORNER_DIST,
        artLeft - CORNER_DIST, false);

    // 세로 방향: 우측 변 (우상→우하) 사이 추가 원
    addIntermediate(targetDoc, artTop + CORNER_DIST, artBottom - CORNER_DIST,
        artRight + CORNER_DIST, false);
}

// from ~ to 사이 원 간격 확인, 50cm 초과 시 균등 분할 추가
// isHorizontal: true → 가로방향(x 변함), false → 세로방향(y 변함)
function addIntermediate(targetDoc, from, to, fixedCoord, isHorizontal) {
    var span = Math.abs(to - from);
    if (span <= MAX_GAP) return; // 50cm 이하: 추가 불필요

    // 균등 분할: 간격이 50cm 이하가 될 때까지 분할
    var divisions = Math.ceil(span / MAX_GAP);
    var step = span / divisions;

    var minCoord = Math.min(from, to);
    for (var d = 1; d < divisions; d++) {
        var pos = minCoord + step * d;
        if (isHorizontal) {
            createDomboMark(targetDoc, pos, fixedCoord);
        } else {
            createDomboMark(targetDoc, fixedCoord, pos);
        }
    }
}

var resultWidthCm = 0;
var resultHeightCm = 0;

// ── 9. combined 모드: 한 시트에 배치 ────────────────────────────────────
if (mode === "combined") {

    var canvasW = bestWidth;
    var canvasH = bestHeight;
    resultWidthCm = canvasW / PT_PER_CM;
    resultHeightCm = canvasH / PT_PER_CM;

    // 새 문서 생성 (1번 파일용)
    var doc1 = app.documents.add(DocumentColorSpace.CMYK, canvasW, canvasH);
    doc1.artboards[0].artboardRect = [0, canvasH, canvasW, 0];

    // Illustrator 좌표: 좌측하단 = (0,0), 좌측상단 = (0, canvasH)
    // 그룹 position = [x_left, y_top]
    for (var pi = 0; pi < bestLayout.placements.length; pi++) {
        var pl = bestLayout.placements[pi];
        var srcGroup = targetGroups[pl.idx];
        if (srcGroup === null) continue;

        var copied = srcGroup.duplicate(doc1, ElementPlacement.PLACEATBEGINNING);
        // y_top 좌표: canvasH에서 해당 shelf의 y_top을 빼서 Illustrator 좌표로 변환
        copied.position = [pl.x, canvasH - pl.y_top];
    }

    // 돔보 마크 추가 (아트보드 기준)
    addDomboMarks(doc1, 0, canvasH, canvasW, 0);

    // 썸네일 저장
    if (outputThumb) {
        var thumbFile = new File(outputThumb);
        var pngOpts = new ExportOptionsPNG24();
        pngOpts.antiAliasing = true;
        pngOpts.artBoardClipping = true;
        pngOpts.transparency = false;
        var scaleT = (canvasW >= canvasH) ? (thumbSize / canvasW) : (thumbSize / canvasH);
        if (scaleT > 1) scaleT = 1;
        pngOpts.horizontalScale = scaleT * 100;
        pngOpts.verticalScale   = scaleT * 100;
        doc1.exportFile(thumbFile, ExportType.PNG24, pngOpts);
        $.writeln("PackGroups: 썸네일 → " + outputThumb);
    }

    // EPS 저장 (1번 파일)
    var eps1File = new File(output1);
    var epsOpts1 = new EPSSaveOptions();
    epsOpts1.compatibility = Compatibility.ILLUSTRATOR17;
    epsOpts1.preview = EPSPreview.COLORTIFF;
    epsOpts1.embedLinkedFiles = true;
    doc1.saveAs(eps1File, epsOpts1);
    $.writeln("PackGroups: 1번 파일 → " + output1);

    // ── 2번 파일: 재단선(외곽 Path Outline만) ──────────────────────────
    var doc2 = app.documents.add(DocumentColorSpace.CMYK, canvasW, canvasH);
    doc2.artboards[0].artboardRect = [0, canvasH, canvasW, 0];

    for (var pi2 = 0; pi2 < bestLayout.placements.length; pi2++) {
        var pl2 = bestLayout.placements[pi2];
        var srcGroup2 = targetGroups[pl2.idx];
        if (srcGroup2 === null) continue;

        var copied2 = srcGroup2.duplicate(doc2, ElementPlacement.PLACEATBEGINNING);
        copied2.position = [pl2.x, canvasH - pl2.y_top];

        // 외곽선만 남기기: 내부 채움 제거, 윤곽선 검정으로
        applyOutlineOnly(copied2, doc2);
    }

    var eps2File = new File(output2);
    var epsOpts2 = new EPSSaveOptions();
    epsOpts2.compatibility = Compatibility.ILLUSTRATOR17;
    epsOpts2.preview = EPSPreview.COLORTIFF;
    epsOpts2.embedLinkedFiles = true;
    doc2.saveAs(eps2File, epsOpts2);
    $.writeln("PackGroups: 2번 파일 → " + output2);

    doc1.close(SaveOptions.DONOTSAVECHANGES);
    doc2.close(SaveOptions.DONOTSAVECHANGES);

} else {
    // ── individual 모드: 각 그룹별 개별 파일 ───────────────────────────
    var individualResults = [];

    for (var gi2 = 0; gi2 < targetGroups.length; gi2++) {
        var grp = targetGroups[gi2];
        var sz2 = groupSizes[gi2];

        resultWidthCm  = sz2.w / PT_PER_CM;
        resultHeightCm = sz2.h / PT_PER_CM;

        // 출력 경로에 그룹 번호 삽입
        var ext1 = output1.lastIndexOf('.');
        var out1i = (ext1 >= 0)
            ? output1.substring(0, ext1) + '_g' + gi2 + output1.substring(ext1)
            : output1 + '_g' + gi2;
        var ext2 = output2.lastIndexOf('.');
        var out2i = (ext2 >= 0)
            ? output2.substring(0, ext2) + '_g' + gi2 + output2.substring(ext2)
            : output2 + '_g' + gi2;
        var extT = outputThumb.lastIndexOf('.');
        var outTi = (extT >= 0)
            ? outputThumb.substring(0, extT) + '_g' + gi2 + outputThumb.substring(extT)
            : outputThumb + '_g' + gi2;

        // 1번 파일
        var docI = app.documents.add(DocumentColorSpace.CMYK, sz2.w, sz2.h);
        docI.artboards[0].artboardRect = [0, sz2.h, sz2.w, 0];

        if (grp !== null) {
            var copiedI = grp.duplicate(docI, ElementPlacement.PLACEATBEGINNING);
            copiedI.position = [0, sz2.h];
        }
        addDomboMarks(docI, 0, sz2.h, sz2.w, 0);

        // 썸네일
        var thumbBase64 = "";
        if (outTi) {
            var thumbFileI = new File(outTi);
            var pngOptsI = new ExportOptionsPNG24();
            pngOptsI.antiAliasing = true;
            pngOptsI.artBoardClipping = true;
            pngOptsI.transparency = false;
            var scaleTI = (sz2.w >= sz2.h) ? (thumbSize / sz2.w) : (thumbSize / sz2.h);
            if (scaleTI > 1) scaleTI = 1;
            pngOptsI.horizontalScale = scaleTI * 100;
            pngOptsI.verticalScale   = scaleTI * 100;
            docI.exportFile(thumbFileI, ExportType.PNG24, pngOptsI);
        }

        var eps1iFile = new File(out1i);
        var epsOptsI1 = new EPSSaveOptions();
        epsOptsI1.compatibility = Compatibility.ILLUSTRATOR17;
        epsOptsI1.preview = EPSPreview.COLORTIFF;
        epsOptsI1.embedLinkedFiles = true;
        docI.saveAs(eps1iFile, epsOptsI1);

        // 2번 파일
        var docI2 = app.documents.add(DocumentColorSpace.CMYK, sz2.w, sz2.h);
        docI2.artboards[0].artboardRect = [0, sz2.h, sz2.w, 0];
        if (grp !== null) {
            var copiedI2 = grp.duplicate(docI2, ElementPlacement.PLACEATBEGINNING);
            copiedI2.position = [0, sz2.h];
            applyOutlineOnly(copiedI2, docI2);
        }
        var eps2iFile = new File(out2i);
        var epsOptsI2 = new EPSSaveOptions();
        epsOptsI2.compatibility = Compatibility.ILLUSTRATOR17;
        epsOptsI2.preview = EPSPreview.COLORTIFF;
        epsOptsI2.embedLinkedFiles = true;
        docI2.saveAs(eps2iFile, epsOptsI2);

        docI.close(SaveOptions.DONOTSAVECHANGES);
        docI2.close(SaveOptions.DONOTSAVECHANGES);

        individualResults.push({
            group_index: gi2,
            width_cm:  sz2.w / PT_PER_CM,
            height_cm: sz2.h / PT_PER_CM,
            output_1: out1i,
            output_2: out2i,
            thumbnail_path: outTi
        });

        $.writeln("PackGroups: 그룹 " + gi2 + " 완료");
    }

    // 개별 결과는 resultWidthCm, resultHeightCm에 마지막 그룹 기준 저장
    // (C#에서 individual_results 배열로 파싱)
}

// ── 10. 소스 파일 닫기 ─────────────────────────────────────────────────
doc.close(SaveOptions.DONOTSAVECHANGES);

// ── 11. 결과 JSON 저장 ─────────────────────────────────────────────────
var resultObj;
if (mode === "combined") {
    resultObj = '{"width_cm":' + resultWidthCm.toFixed(2)
        + ',"height_cm":' + resultHeightCm.toFixed(2)
        + ',"mode":"combined"}';
} else {
    // individual_results 배열 포함
    var irParts = [];
    for (var ir = 0; ir < individualResults.length; ir++) {
        var irItem = individualResults[ir];
        irParts.push('{"group_index":' + irItem.group_index
            + ',"width_cm":' + irItem.width_cm.toFixed(2)
            + ',"height_cm":' + irItem.height_cm.toFixed(2)
            + ',"output_1":"' + irItem.output_1.replace(/\\/g, "\\\\") + '"'
            + ',"output_2":"' + irItem.output_2.replace(/\\/g, "\\\\") + '"'
            + ',"thumbnail_path":"' + irItem.thumbnail_path.replace(/\\/g, "\\\\") + '"'
            + '}');
    }
    resultObj = '{"width_cm":' + resultWidthCm.toFixed(2)
        + ',"height_cm":' + resultHeightCm.toFixed(2)
        + ',"mode":"individual"'
        + ',"individual_results":[' + irParts.join(',') + ']}';
}

var jsonFile = new File(resultJson);
jsonFile.encoding = "UTF-8";
jsonFile.open("w");
jsonFile.write(resultObj);
jsonFile.close();
$.writeln("PackGroups: 결과 JSON → " + resultJson);
$.writeln("PackGroups 완료");

// ── 외곽선만 남기기 헬퍼 ─────────────────────────────────────────────
function applyOutlineOnly(item, targetDoc) {
    var black = makeBlack(targetDoc);
    applyOutlineRecursive(item, black);
}

function applyOutlineRecursive(item, black) {
    if (item.typename === "PathItem") {
        item.filled = false;
        item.stroked = true;
        item.strokeColor = black;
        item.strokeWidth = 0.25;
    } else if (item.typename === "CompoundPathItem") {
        item.pathItems[0].filled = false;
        item.pathItems[0].stroked = true;
        item.pathItems[0].strokeColor = black;
        item.pathItems[0].strokeWidth = 0.25;
    } else if (item.typename === "GroupItem") {
        for (var ci = 0; ci < item.pageItems.length; ci++) {
            applyOutlineRecursive(item.pageItems[ci], black);
        }
    }
    // TextFrame, PlacedItem 등은 건너뜀
}

})();
} catch(e) {
    // $.getenv("IA_RESULT_JSON") 대신 IIFE 외부 변수 사용 ($.getenv()는 커스텀 환경변수 미작동)
    if (_savedResultJson) {
        var _errDir  = _savedResultJson.replace(/[^\\\/]*$/, "");
        var _logFile = new File(_errDir + "error.log");
        _logFile.open("w");
        _logFile.write("JSError: " + e.message + " (line " + e.line + ")");
        _logFile.close();
    } else {
        // resultJson 파라미터를 못 읽은 경우 스크립트 폴더에 저장
        var _scriptDirForErr = new File($.fileName).parent.fsName;
        var _logFile2 = new File(_scriptDirForErr + "/ia_error.log");
        _logFile2.open("w");
        _logFile2.write("JSError: " + e.message + " (line " + e.line + ")");
        _logFile2.close();
    }
    $.writeln("PackGroups EXCEPTION: " + e.message + " (line " + e.line + ")");
}
// app.quit() 제거 — COM 자동화 시 Illustrator가 계속 실행되어야 함
// (직접 실행 시에도 문서는 doc.close()로 이미 닫힘)
