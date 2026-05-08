/*
 * ExtractGroups.jsx - AI/EPS 파일 디자인 추출 및 PNG 썸네일 생성
 *
 * v3 (2026-03-18): Union-Find 연결 요소 방식
 * v4 (2026-03-30): 클리핑 마스크 재귀 탐색
 * v5 (2026-03-30): 아트보드 기반 추출로 재설계
 *   - 용준님 스크립트 1 (클리핑 마스크 아트보드 생성) 패턴 적용
 *   - collectBounds → intersects/mergeRects 겹침 병합 → 아트보드 생성
 *   - Union-Find 클러스터링 제거, postProcessClusters 제거
 *   - 아트보드별 PNG 썸네일 내보내기
 *   - 결과 JSON 포맷 완전 호환 (C#, MES 무변경)
 *   - OpenCV 검증용 캔버스 PNG 유지
 *
 * 인수 전달: ia_params.json 파일
 *   source, output, reqId, thumbSize, eps_width_mm, eps_height_mm
 */

#target illustrator

app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

// ═══════════════════════════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════════════════════════
var MIN_DESIGN_PT = 141.732;  // 50mm — 디자인 최소 크기
var MERGE_TOL = 0.1;          // 겹침 병합 허용치 (pt)

// ES3 JSON 직렬화
function buildJSON(arr) {
    var result = '[';
    for (var i = 0; i < arr.length; i++) {
        var o = arr[i];
        if (i > 0) result += ',';
        result += '{';
        result += '"index":'      + o.index      + ',';
        result += '"name":"'      + o.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '",';
        result += '"width_mm":'   + o.width_mm   + ',';
        result += '"height_mm":'  + o.height_mm  + ',';
        result += '"thumbnail_file":"' + o.thumbnail_file + '"';
        result += '}';
    }
    return result + ']';
}

// 진단 로그 헬퍼
var _diagOutputDir = "";
var _diagLog = function(msg) {
    try {
        var _logDir = _diagOutputDir;
        if (!_logDir) {
            _logDir = (typeof _ia_params_override_path !== "undefined" && _ia_params_override_path)
                ? new File(_ia_params_override_path).parent.fsName
                : new File($.fileName).parent.fsName;
        }
        var _lf = new File(_logDir + "/ia_diag.log");
        _lf.open("a");
        _lf.writeln(msg);
        _lf.close();
    } catch(e) {
        $.writeln("_diagLog WRITE FAIL: " + e.message + " path=" + _logDir);
    }
};

// ═══════════════════════════════════════════════════════════════════════
// 재귀적으로 clipping=true인 경로의 geometricBounds를 찾는 함수
// (용준님 스크립트 1 기반 — 깊이 제한 없는 재귀 탐색)
// ═══════════════════════════════════════════════════════════════════════
function findClippingPathBounds(item) {
    try {
        if (item.clipping) return item.geometricBounds;
        if (item.typename === "GroupItem") {
            for (var j = 0; j < item.pageItems.length; j++) {
                var result = findClippingPathBounds(item.pageItems[j]);
                if (result) return result;
            }
        }
    } catch(e) {}
    return null;
}

// ═══════════════════════════════════════════════════════════════════════
// 클리핑 그룹에서 마스크 경로의 바운드를 찾는 함수
// ═══════════════════════════════════════════════════════════════════════
function getClipBounds(group) {
    for (var j = 0; j < group.pageItems.length; j++) {
        try {
            if (group.pageItems[j].clipping) {
                return group.pageItems[j].geometricBounds;
            }
        } catch(e) {}
    }
    var recursiveResult = findClippingPathBounds(group);
    if (recursiveResult) return recursiveResult;
    return group.geometricBounds;
}

// ═══════════════════════════════════════════════════════════════════════
// non-clipped 그룹의 자식들의 "클립 존중" 바운드 union을 구하는 함수
// clipped 서브그룹 → 클립 바운드 (이미지 전체가 아닌 클립된 크기)
// non-clipped 서브그룹 → 재귀
// 그 외 → geometricBounds
// ═══════════════════════════════════════════════════════════════════════
function getClipRespectingBounds(group) {
    var uL = Infinity, uT = -Infinity, uR = -Infinity, uB = Infinity;
    var found = false;
    try {
        for (var j = 0; j < group.pageItems.length; j++) {
            var child = group.pageItems[j];
            if (child.typename === "TextFrame") continue;
            if (child.hidden) continue;

            var cb;
            if (child.typename === "GroupItem" && child.clipped) {
                cb = getClipBounds(child);
            } else if (child.typename === "GroupItem" && !child.clipped) {
                cb = getClipRespectingBounds(child);
            } else {
                cb = child.geometricBounds;
            }

            if (cb) {
                found = true;
                if (cb[0] < uL) uL = cb[0];
                if (cb[1] > uT) uT = cb[1];
                if (cb[2] > uR) uR = cb[2];
                if (cb[3] < uB) uB = cb[3];
            }
        }
    } catch(e) {}
    return found ? [uL, uT, uR, uB] : group.geometricBounds;
}

// ═══════════════════════════════════════════════════════════════════════
// 아이템의 바운드를 수집
//
// GroupItem + clipped → getClipBounds() (클립 마스크의 geometricBounds)
// GroupItem + !clipped → getClipRespectingBounds() (자식 클립 존중 union)
// TextFrame → 스킵
// 그 외 → geometricBounds
// ═══════════════════════════════════════════════════════════════════════
function collectBounds(item, boundsList) {
    try {
        if (item.typename === "GroupItem") {
            if (item.clipped) {
                boundsList.push(getClipBounds(item));
            } else {
                boundsList.push(getClipRespectingBounds(item));
            }
        } else if (item.typename === "TextFrame") {
            // 아웃라인 실패한 텍스트 — 스킵
        } else {
            boundsList.push(item.geometricBounds);
        }
    } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════════════
// 두 바운드가 겹치는지 확인 (용준님 스크립트 1의 intersects)
// ═══════════════════════════════════════════════════════════════════════
function intersects(r1, r2, tol) {
    return !(r1[2] < r2[0] - tol || r1[0] > r2[2] + tol ||
             r1[1] < r2[3] - tol || r1[3] > r2[1] + tol);
}

// ═══════════════════════════════════════════════════════════════════════
// 두 바운드 병합 (용준님 스크립트 1의 mergeRects)
// ═══════════════════════════════════════════════════════════════════════
function mergeRects(r1, r2) {
    return [
        Math.min(r1[0], r2[0]), Math.max(r1[1], r2[1]),
        Math.max(r1[2], r2[2]), Math.min(r1[3], r2[3])
    ];
}

// ═══════════════════════════════════════════════════════════════════════
// 메인 함수
// ═══════════════════════════════════════════════════════════════════════
function main(sourceFile, outputFolder, requestId, thumbSize, epsWidthMm, epsHeightMm) {
    if (!sourceFile || !outputFolder || !requestId) {
        $.writeln("ExtractGroups ERROR: 인수 부족");
        return;
    }

    _diagOutputDir = outputFolder;
    _diagLog("=== ExtractGroups v5 DIAG ===");
    _diagLog("source=" + sourceFile);
    _diagLog("output=" + outputFolder);
    _diagLog("reqId=" + requestId);
    if (epsWidthMm) _diagLog("eps_bb=" + Math.round(epsWidthMm) + "x" + Math.round(epsHeightMm) + "mm");

    var file = new File(sourceFile);
    if (!file.exists) {
        var _missingMsg = "파일 없음: " + sourceFile;
        $.writeln("ExtractGroups ERROR: " + _missingMsg);
        _diagLog("ERROR: " + _missingMsg);
        try {
            var _ef = new File(outputFolder + "\\error.log");
            _ef.open("w"); _ef.write("JSError: " + _missingMsg); _ef.close();
        } catch(e) {}
        return;
    }

    var doc = app.open(file);
    var mmPerPt = 1.0 / 2.834645669;

    // ── AUTO-FIX: CMYK + 텍스트 아웃라인 ──
    try {
        if (doc.documentColorSpace !== DocumentColorSpace.CMYK) {
            app.executeMenuCommand('doc-color-cmyk');
        }
    } catch(e) {}
    try {
        if (doc.textFrames.length > 0) {
            for (var _ti = doc.textFrames.length - 1; _ti >= 0; _ti--) {
                try { doc.textFrames[_ti].createOutline(); } catch(e) {}
            }
        }
    } catch(e) {}

    var origRect = doc.artboards[0].artboardRect;
    var artboardRect = doc.artboards[0].artboardRect;
    _diagLog("artboard=" + Math.round(Math.abs(artboardRect[2]-artboardRect[0]) * mmPerPt) + "x"
        + Math.round(Math.abs(artboardRect[1]-artboardRect[3]) * mmPerPt) + "mm");

    var folder = new Folder(outputFolder);
    if (!folder.exists) folder.create();

    // ══════════════════════════════════════════════════════════════════════
    // Step 1: 바운드 수집 (collectBounds — 클리핑 마스크 재귀 탐색)
    // ══════════════════════════════════════════════════════════════════════
    var rawBounds = [];
    for (var li = 0; li < doc.layers.length; li++) {
        var layer = doc.layers[li];
        if (!layer.visible) continue;
        for (var pi = 0; pi < layer.pageItems.length; pi++) {
            try {
                var item = layer.pageItems[pi];
                if (item.hidden) continue;
                if (item.typename === "TextFrame") continue;
                collectBounds(item, rawBounds);
            } catch(e) {}
        }
    }
    _diagLog("Step1: " + rawBounds.length + " raw bounds collected");

    // ══════════════════════════════════════════════════════════════════════
    // Step 2: 50mm 미만 제거 (점/노이즈 + 소형 아이템)
    // 겹침 병합 없음 — 각 top-level 아이템 = 하나의 디자인
    // ══════════════════════════════════════════════════════════════════════
    var designs = [];
    for (var i = 0; i < rawBounds.length; i++) {
        var r = rawBounds[i];
        var w = Math.abs(r[2] - r[0]);
        var h = Math.abs(r[1] - r[3]);
        if (w >= MIN_DESIGN_PT || h >= MIN_DESIGN_PT) {
            designs.push([r[0], r[1], r[2], r[3]]);
        } else if (w >= 1 && h >= 1) {
            _diagLog("  filtered: " + Math.round(w * mmPerPt) + "x"
                + Math.round(h * mmPerPt) + "mm (< 50mm)");
        }
    }

    if (designs.length === 0) {
        _diagLog("No designs found -> fallback to full artboard");
        designs = [[artboardRect[0], artboardRect[1], artboardRect[2], artboardRect[3]]];
    }

    _diagLog("Step2: " + designs.length + " designs after size filter");

    // ══════════════════════════════════════════════════════════════════════
    // Step 2a: 아트보드 경계 클램핑
    // 클리핑 마스크 밖 오버플로우 콘텐츠로 인해 바운드가 아트보드 밖으로
    // 확장되는 경우를 방지. 각 바운드를 아트보드와 교차(intersection)시킴.
    // ══════════════════════════════════════════════════════════════════════
    var abL = artboardRect[0], abT = artboardRect[1], abR = artboardRect[2], abB = artboardRect[3];
    for (var ci2 = 0; ci2 < designs.length; ci2++) {
        var d = designs[ci2];
        var origW = Math.round(Math.abs(d[2] - d[0]) * mmPerPt);
        var origH = Math.round(Math.abs(d[1] - d[3]) * mmPerPt);
        // 아트보드와 교차
        var cL = Math.max(d[0], abL);
        var cT = Math.min(d[1], abT);
        var cR = Math.min(d[2], abR);
        var cB = Math.max(d[3], abB);
        if (cR > cL && cT > cB) {
            var clampedW = Math.round(Math.abs(cR - cL) * mmPerPt);
            var clampedH = Math.round(Math.abs(cT - cB) * mmPerPt);
            if (origW !== clampedW || origH !== clampedH) {
                _diagLog("  clamped: design[" + ci2 + "] " + origW + "x" + origH
                    + "mm -> " + clampedW + "x" + clampedH + "mm (artboard clamp)");
            }
            designs[ci2] = [cL, cT, cR, cB];
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // Step 2b: 포함 흡수 — 큰 디자인 안에 완전히 들어가는 작은 바운드 제거
    // (그룹 밖에 풀려있는 개별 아이템이 디자인 영역 안에 있는 경우)
    // ══════════════════════════════════════════════════════════════════════
    if (designs.length > 1) {
        var absorbed = [];
        for (var i = 0; i < designs.length; i++) absorbed[i] = false;

        for (var i = 0; i < designs.length; i++) {
            if (absorbed[i]) continue;
            for (var j = 0; j < designs.length; j++) {
                if (i === j || absorbed[j]) continue;
                // designs[j]가 designs[i] 안에 완전히 포함되는지
                if (designs[j][0] >= designs[i][0] && designs[j][2] <= designs[i][2] &&
                    designs[j][1] <= designs[i][1] && designs[j][3] >= designs[i][3]) {
                    absorbed[j] = true;
                    _diagLog("  absorbed: design "
                        + Math.round(Math.abs(designs[j][2]-designs[j][0]) * mmPerPt) + "x"
                        + Math.round(Math.abs(designs[j][1]-designs[j][3]) * mmPerPt) + "mm"
                        + " into "
                        + Math.round(Math.abs(designs[i][2]-designs[i][0]) * mmPerPt) + "x"
                        + Math.round(Math.abs(designs[i][1]-designs[i][3]) * mmPerPt) + "mm");
                }
            }
        }

        var filtered = [];
        for (var i = 0; i < designs.length; i++) {
            if (!absorbed[i]) filtered.push(designs[i]);
        }
        designs = filtered;
    }

    _diagLog("Step2b: " + designs.length + " designs after containment absorption");
    for (var i = 0; i < designs.length; i++) {
        _diagLog("  design[" + i + "]: "
            + Math.round(Math.abs(designs[i][2]-designs[i][0]) * mmPerPt) + "x"
            + Math.round(Math.abs(designs[i][1]-designs[i][3]) * mmPerPt) + "mm");
    }

    // ── 단일 디자인 + 커버리지 ≥ 70% → 아트보드 bounds 사용 ──
    if (designs.length === 1) {
        var abW = artboardRect[2] - artboardRect[0];
        var abH = artboardRect[1] - artboardRect[3];
        var abArea = abW * abH;
        var db = designs[0];
        var intL = Math.max(db[0], artboardRect[0]);
        var intT = Math.min(db[1], artboardRect[1]);
        var intR = Math.min(db[2], artboardRect[2]);
        var intB = Math.max(db[3], artboardRect[3]);
        var intArea = 0;
        if (intR > intL && intT > intB) intArea = (intR - intL) * (intT - intB);
        var coverage = (abArea > 0) ? (intArea / abArea) : 0;
        _diagLog("  single design coverage=" + (coverage * 100).toFixed(1) + "%");
        if (coverage >= 0.70) {
            designs[0] = [artboardRect[0], artboardRect[1], artboardRect[2], artboardRect[3]];
            _diagLog("  -> use artboard bounds");
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // Step 5: EPS BoundingBox 교차 검증
    // ══════════════════════════════════════════════════════════════════════
    if (epsWidthMm && epsHeightMm && designs.length === 1) {
        var b = designs[0];
        var wMm = Math.round(Math.abs(b[2] - b[0]) * mmPerPt);
        var hMm = Math.round(Math.abs(b[1] - b[3]) * mmPerPt);
        var wDiff = Math.abs(wMm - epsWidthMm) / epsWidthMm;
        var hDiff = Math.abs(hMm - epsHeightMm) / epsHeightMm;
        _diagLog("Step5: EPS BB " + wMm + "x" + hMm + "mm vs " + Math.round(epsWidthMm) + "x" + Math.round(epsHeightMm) + "mm");
        if (wDiff > 0.10 || hDiff > 0.10) {
            var ptPerMm = 2.834645669;
            designs[0] = [
                artboardRect[0], artboardRect[3] + epsHeightMm * ptPerMm,
                artboardRect[0] + epsWidthMm * ptPerMm, artboardRect[3]
            ];
            _diagLog("  -> EPS BB override");
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // Step 6: OpenCV 검증용 캔버스 PNG
    // ══════════════════════════════════════════════════════════════════════
    var canvasFile = requestId + "-canvas.png";
    var canvasBoundsLeft = 0, canvasBoundsTop = 0, canvasBoundsRight = 0, canvasBoundsBottom = 0;
    try {
        var uLeft = designs[0][0], uTop = designs[0][1];
        var uRight = designs[0][2], uBottom = designs[0][3];
        for (var di = 1; di < designs.length; di++) {
            if (designs[di][0] < uLeft)   uLeft   = designs[di][0];
            if (designs[di][1] > uTop)    uTop    = designs[di][1];
            if (designs[di][2] > uRight)  uRight  = designs[di][2];
            if (designs[di][3] < uBottom) uBottom = designs[di][3];
        }
        canvasBoundsLeft = uLeft; canvasBoundsTop = uTop;
        canvasBoundsRight = uRight; canvasBoundsBottom = uBottom;

        doc.artboards[0].artboardRect = [uLeft, uTop, uRight, uBottom];
        app.redraw();

        var canvasLong = Math.max(Math.abs(uRight-uLeft), Math.abs(uTop-uBottom));
        var canvasScale = canvasLong > 0 ? Math.min(thumbSize / canvasLong, 1.0) : 1.0;
        var canvasPng = new File(outputFolder + "\\" + canvasFile);
        var canvasOpts = new ExportOptionsPNG24();
        canvasOpts.antiAliasing = true;
        canvasOpts.artBoardClipping = true;
        canvasOpts.transparency = true;
        canvasOpts.horizontalScale = canvasScale * 100;
        canvasOpts.verticalScale = canvasScale * 100;
        doc.exportFile(canvasPng, ExportType.PNG24, canvasOpts);
        _diagLog("Step6: canvas PNG -> " + canvasFile);
        doc.artboards[0].artboardRect = origRect;
    } catch(canvasEx) {
        _diagLog("Step6 canvas PNG fail: " + canvasEx.message);
        canvasFile = "";
    }

    // ══════════════════════════════════════════════════════════════════════
    // Step 7: 아트보드 생성 + PNG 내보내기 + JSON
    // (용준님 스크립트 1의 아트보드 생성 패턴)
    // ══════════════════════════════════════════════════════════════════════
    var groupData = [];

    // 첫 번째 아트보드를 첫 디자인으로 설정
    doc.artboards[0].artboardRect = designs[0];
    doc.artboards[0].name = "design_0";

    // 기존 나머지 아트보드 제거 (뒤에서부터)
    for (var ai = doc.artboards.length - 1; ai >= 1; ai--) {
        doc.artboards.remove(ai);
    }

    // 나머지 디자인 아트보드 추가
    for (var ci = 1; ci < designs.length; ci++) {
        doc.artboards.add(designs[ci]);
        doc.artboards[ci].name = "design_" + ci;
    }

    // 아트보드별 PNG 내보내기
    for (var g = 0; g < designs.length; g++) {
        var wPt = Math.abs(designs[g][2] - designs[g][0]);
        var hPt = Math.abs(designs[g][1] - designs[g][3]);
        var groupName = "디자인 " + (g + 1);

        _diagLog("Step7: export design[" + g + "] " + Math.round(wPt * mmPerPt) + "x"
            + Math.round(hPt * mmPerPt) + "mm");

        doc.artboards.setActiveArtboardIndex(g);
        app.redraw();

        var pngFile = new File(outputFolder + "\\" + requestId + "-" + g + ".png");
        var pngOpts = new ExportOptionsPNG24();
        pngOpts.antiAliasing = true;
        pngOpts.artBoardClipping = true;
        pngOpts.transparency = true;
        var scale = (wPt >= hPt) ? (thumbSize / wPt) : (thumbSize / hPt);
        if (scale > 1) scale = 1;
        pngOpts.horizontalScale = scale * 100;
        pngOpts.verticalScale = scale * 100;
        doc.exportFile(pngFile, ExportType.PNG24, pngOpts);

        groupData.push({
            index: g, name: groupName,
            width_mm: Math.round(wPt * mmPerPt),
            height_mm: Math.round(hPt * mmPerPt),
            thumbnail_file: requestId + "-" + g + ".png"
        });

        $.writeln("ExtractGroups: " + (g+1) + "/" + designs.length + " " + groupName
            + " (" + Math.round(wPt*mmPerPt) + "x" + Math.round(hPt*mmPerPt) + "mm)");
    }

    // 아트보드 유지한 채 저장 (ProcessOrderItem에서 참조)
    doc.close(SaveOptions.SAVECHANGES);

    // groups.json (C# 호환)
    var jsonFile = new File(outputFolder + "\\" + requestId + "-groups.json");
    jsonFile.encoding = "UTF-8";
    jsonFile.open("w");
    jsonFile.write(buildJSON(groupData));
    jsonFile.close();

    // canvas.json (OpenCV용)
    if (canvasFile) {
        var canvasJson = '{"canvas_file":"' + canvasFile + '"'
            + ',"left_pt":' + canvasBoundsLeft + ',"top_pt":' + canvasBoundsTop
            + ',"right_pt":' + canvasBoundsRight + ',"bottom_pt":' + canvasBoundsBottom + '}';
        var cjf = new File(outputFolder + "\\" + requestId + "-canvas.json");
        cjf.encoding = "UTF-8"; cjf.open("w"); cjf.write(canvasJson); cjf.close();
    }

    _diagLog("=== DONE: " + designs.length + " designs ===");
}

// ═══════════════════════════════════════════════════════════════════════
// 실행
// ═══════════════════════════════════════════════════════════════════════
var _scriptDir = (typeof _ia_params_override_path !== "undefined" && _ia_params_override_path)
    ? new File(_ia_params_override_path).parent.fsName
    : new File($.fileName).parent.fsName;
var _outputForLog = "";
try {
    var _cfgPathEG = (typeof _ia_params_override_path !== "undefined" && _ia_params_override_path)
        ? _ia_params_override_path
        : (_scriptDir + "/ia_params.json");
    var _configFile = new File(_cfgPathEG);
    _configFile.open("r");
    var _paramsText = _configFile.read();
    _configFile.close();
    var _params = eval("(" + _paramsText + ")");
    _outputForLog = _params.output || "";
    main(
        _params.source, _params.output, String(_params.reqId),
        _params.thumbSize || 150,
        _params.eps_width_mm || null, _params.eps_height_mm || null
    );
} catch(e) {
    var _errPath = _outputForLog ? (_outputForLog + "\\error.log") : (_scriptDir + "/ia_error.log");
    var _logFile = new File(_errPath);
    _logFile.open("w");
    _logFile.write("JSError: " + e.message + " (line " + e.line + ")");
    _logFile.close();
    $.writeln("ExtractGroups EXCEPTION: " + e.message + " (line " + e.line + ")");
}
