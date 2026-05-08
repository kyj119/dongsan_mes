/*
 * AnalyzeStructure.jsx — AI/EPS 파일 내부 구조 추출 (IA 학습용 JSX 데이터)
 *
 * 원본 파일과 출력 파일 모두에 사용.
 * 파일의 내부 구조(아트보드, 레이어, 아이템, 클리핑마스크, 텍스트 등)를
 * JSON으로 추출하여 학습 데이터 생성에 활용한다.
 *
 * 파라미터 (ia_params.json):
 *   source       : AI/EPS 파일 전체 경로
 *   resultJson   : 결과 JSON 저장 경로
 *   fileType     : "original" | "output" (파일 유형 태깅)
 *   pairId       : 매칭용 식별자 (pairs.csv의 pair_id)
 *
 * 출력 JSON 구조:
 *   {
 *     meta: { fileType, pairId, filePath, fileName, fileSize },
 *     document: { colorSpace, width_mm, height_mm, rulerUnits },
 *     artboards: [ { index, name, x, y, width_mm, height_mm } ],
 *     layers: [ { index, name, visible, locked, itemCount } ],
 *     items: [ { index, type, name, layer, bounds_mm, width_mm, height_mm,
 *                isClipMask, clipMaskBounds_mm, hasClipMask, children_count } ],
 *     clusters: [ { index, itemIndices, bounds_mm, width_mm, height_mm, itemCount } ],
 *     textFrames: [ { index, content, bounds_mm, fontSize } ],
 *     summary: { totalItems, totalGroups, totalClipMasks, totalTextFrames,
 *                clusterCount, artboardCount, layerCount }
 *   }
 *
 * v1.0 (2026-03-23): 초기 버전
 *   - ExtractGroups.jsx의 클러스터링 로직 재활용
 *   - 원본/출력 파일 공통 구조 추출
 */

#target illustrator

app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

// ═══════════════════════════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════════════════════════
var PT_PER_MM = 2.834645669;
var PROXIMITY_PT = 15 * PT_PER_MM; // 15mm 이내 → 같은 디자인 (ExtractGroups.jsx와 동일)
var MICRO_RATIO = 0.05;            // 전체의 5% 미만 → 미세 클러스터 흡수

// ═══════════════════════════════════════════════════════════════════════
// ExtendScript JSON 직렬화 (ES3 호환)
// ═══════════════════════════════════════════════════════════════════════
function jsonStringify(obj) {
    if (obj === null || obj === undefined) return "null";
    if (typeof obj === "number") {
        if (isNaN(obj)) return "null";
        return String(Math.round(obj * 100) / 100); // 소수점 2자리
    }
    if (typeof obj === "boolean") return obj ? "true" : "false";
    if (typeof obj === "string") {
        return '"' + obj.replace(/\\/g, '\\\\')
                        .replace(/"/g, '\\"')
                        .replace(/\n/g, '\\n')
                        .replace(/\r/g, '\\r')
                        .replace(/\t/g, '\\t') + '"';
    }
    if (obj instanceof Array) {
        var arrParts = [];
        for (var i = 0; i < obj.length; i++) {
            arrParts.push(jsonStringify(obj[i]));
        }
        return '[' + arrParts.join(',') + ']';
    }
    if (typeof obj === "object") {
        var objParts = [];
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                objParts.push('"' + key + '":' + jsonStringify(obj[key]));
            }
        }
        return '{' + objParts.join(',') + '}';
    }
    return "null";
}

// ═══════════════════════════════════════════════════════════════════════
// 단위 변환 헬퍼
// ═══════════════════════════════════════════════════════════════════════
function ptToMm(pt) {
    return pt / PT_PER_MM;
}

function boundsToMm(bounds) {
    // bounds: [left, top, right, bottom] (Illustrator 좌표: top > bottom)
    return {
        left:   Math.round(ptToMm(bounds[0]) * 100) / 100,
        top:    Math.round(ptToMm(bounds[1]) * 100) / 100,
        right:  Math.round(ptToMm(bounds[2]) * 100) / 100,
        bottom: Math.round(ptToMm(bounds[3]) * 100) / 100
    };
}

function boundsSize(bounds) {
    return {
        width_mm:  Math.round(ptToMm(Math.abs(bounds[2] - bounds[0])) * 100) / 100,
        height_mm: Math.round(ptToMm(Math.abs(bounds[1] - bounds[3])) * 100) / 100
    };
}

// ═══════════════════════════════════════════════════════════════════════
// 두 바운딩박스 사이 최소 간격 (pt)
// ═══════════════════════════════════════════════════════════════════════
function rectGap(a, b) {
    var gx = Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]));
    var gy = Math.max(0, Math.max(a[3], b[3]) - Math.min(a[1], b[1]));
    return Math.max(gx, gy);
}

// ═══════════════════════════════════════════════════════════════════════
// Union-Find 기반 2D 근접 클러스터링 (ExtractGroups.jsx에서 이식)
// ═══════════════════════════════════════════════════════════════════════
function clusterByProximity(items, threshold) {
    var n = items.length;
    if (n === 0) return [];
    if (n === 1) {
        return [{
            itemIndices: [0],
            bounds: [items[0].vb[0], items[0].vb[1], items[0].vb[2], items[0].vb[3]]
        }];
    }

    var parent = [];
    for (var i = 0; i < n; i++) parent[i] = i;

    function find(x) {
        while (parent[x] !== x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }
    function unite(a, b) {
        var ra = find(a), rb = find(b);
        if (ra !== rb) parent[ra] = rb;
    }

    for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
            if (rectGap(items[i].vb, items[j].vb) <= threshold) {
                unite(i, j);
            }
        }
    }

    var map = {};
    for (var i = 0; i < n; i++) {
        var r = find(i);
        if (!map[r]) {
            map[r] = {
                itemIndices: [],
                bounds: [Infinity, -Infinity, -Infinity, Infinity]
            };
        }
        map[r].itemIndices.push(i);
        var bnd = map[r].bounds;
        var v = items[i].vb;
        if (v[0] < bnd[0]) bnd[0] = v[0];
        if (v[1] > bnd[1]) bnd[1] = v[1];
        if (v[2] > bnd[2]) bnd[2] = v[2];
        if (v[3] < bnd[3]) bnd[3] = v[3];
    }

    var result = [];
    for (var k in map) {
        if (map.hasOwnProperty(k)) result.push(map[k]);
    }
    return result;
}

// ═══════════════════════════════════════════════════════════════════════
// 미세 클러스터 흡수
// ═══════════════════════════════════════════════════════════════════════
function absorbMicroClusters(clusters, items) {
    if (clusters.length <= 1) return clusters;

    // 전체 면적 계산
    var totalArea = 0;
    for (var ci = 0; ci < clusters.length; ci++) {
        var b = clusters[ci].bounds;
        totalArea += Math.abs(b[2] - b[0]) * Math.abs(b[1] - b[3]);
    }

    var major = [];
    var micro = [];
    for (var ci = 0; ci < clusters.length; ci++) {
        var b = clusters[ci].bounds;
        var area = Math.abs(b[2] - b[0]) * Math.abs(b[1] - b[3]);
        if (area / totalArea < MICRO_RATIO) {
            micro.push(clusters[ci]);
        } else {
            major.push(clusters[ci]);
        }
    }

    if (major.length === 0 || micro.length === 0) return clusters;

    // 각 미세 클러스터를 가장 가까운 주요 클러스터에 흡수
    for (var mi = 0; mi < micro.length; mi++) {
        var minDist = Infinity;
        var bestIdx = 0;
        for (var mj = 0; mj < major.length; mj++) {
            var d = rectGap(micro[mi].bounds, major[mj].bounds);
            if (d < minDist) {
                minDist = d;
                bestIdx = mj;
            }
        }
        // 흡수: 아이템 인덱스 병합 + 바운드 확장
        for (var ii = 0; ii < micro[mi].itemIndices.length; ii++) {
            major[bestIdx].itemIndices.push(micro[mi].itemIndices[ii]);
        }
        var mb = micro[mi].bounds;
        var tb = major[bestIdx].bounds;
        if (mb[0] < tb[0]) tb[0] = mb[0];
        if (mb[1] > tb[1]) tb[1] = mb[1];
        if (mb[2] > tb[2]) tb[2] = mb[2];
        if (mb[3] < tb[3]) tb[3] = mb[3];
    }

    return major;
}

// ═══════════════════════════════════════════════════════════════════════
// 클리핑마스크 감지
// ═══════════════════════════════════════════════════════════════════════
function getClipMaskInfo(item) {
    var result = { isClipMask: false, hasClipMask: false, clipMaskBounds_mm: null };

    try {
        // PathItem이 직접 클리핑마스크인 경우
        if (item.typename === "PathItem" && item.clipping) {
            result.isClipMask = true;
            result.clipMaskBounds_mm = boundsToMm(item.geometricBounds);
        }

        // GroupItem 안에 클리핑마스크가 있는 경우
        if (item.typename === "GroupItem" && item.clipped) {
            result.hasClipMask = true;
            // 그룹 내 클리핑 PathItem 찾기
            for (var ci = 0; ci < item.pageItems.length; ci++) {
                try {
                    var child = item.pageItems[ci];
                    if (child.typename === "PathItem" && child.clipping) {
                        result.clipMaskBounds_mm = boundsToMm(child.geometricBounds);
                        break;
                    }
                } catch(e) {}
            }
        }
    } catch(e) {}

    return result;
}

// ═══════════════════════════════════════════════════════════════════════
// 아이템 하위 구조 요약 (재귀 깊이 제한)
// ═══════════════════════════════════════════════════════════════════════
function countChildren(item, maxDepth) {
    if (maxDepth <= 0) return { groups: 0, paths: 0, rasters: 0, texts: 0, others: 0, total: 0 };

    var counts = { groups: 0, paths: 0, rasters: 0, texts: 0, others: 0, total: 0 };

    try {
        if (item.typename !== "GroupItem") return counts;

        for (var i = 0; i < item.pageItems.length; i++) {
            try {
                var child = item.pageItems[i];
                counts.total++;
                if (child.typename === "GroupItem") {
                    counts.groups++;
                    var sub = countChildren(child, maxDepth - 1);
                    counts.groups += sub.groups;
                    counts.paths += sub.paths;
                    counts.rasters += sub.rasters;
                    counts.texts += sub.texts;
                    counts.others += sub.others;
                    counts.total += sub.total;
                } else if (child.typename === "PathItem" || child.typename === "CompoundPathItem") {
                    counts.paths++;
                } else if (child.typename === "RasterItem" || child.typename === "PlacedItem") {
                    counts.rasters++;
                } else if (child.typename === "TextFrame") {
                    counts.texts++;
                } else {
                    counts.others++;
                }
            } catch(e) {}
        }
    } catch(e) {}

    return counts;
}

// ═══════════════════════════════════════════════════════════════════════
// 메인 실행
// ═══════════════════════════════════════════════════════════════════════
var _savedResultJson = "";

try {
(function() {

// ── 1. 파라미터 읽기 ──────────────────────────────────────────────────
var _scriptDir = new File($.fileName).parent.fsName;
var _cfgPath = (typeof _ia_params_override_path !== "undefined" && _ia_params_override_path)
    ? _ia_params_override_path
    : (_scriptDir + "/ia_params.json");

// ia_params.json 읽기 (UTF-8 인코딩 명시)
var _configFile = new File(_cfgPath);
_configFile.encoding = "UTF-8";
if (!_configFile.open("r")) {
    $.writeln("AnalyzeStructure ERROR: ia_params.json 열기 실패 - " + _cfgPath);
    return;
}
var _rawConfig = _configFile.read();
_configFile.close();
var _params = eval("(" + _rawConfig + ")");

var sourceFile = _params.source     || "";
var resultJson = _params.resultJson || "";
var fileType   = _params.fileType   || "unknown";
var pairId     = _params.pairId     || "";

_savedResultJson = resultJson;

if (!sourceFile || !resultJson) {
    $.writeln("AnalyzeStructure ERROR: source, resultJson 파라미터 필요");
    return;
}

// 한글 경로 처리: fsName(OS 경로) → File 객체
// File()에 경로를 넣을 때 /로 통일하고 URI 인코딩 사용
var srcFile = new File(sourceFile);
if (!srcFile.exists) {
    // fsName으로 재시도 (Windows 경로 직접 사용)
    var altPath = sourceFile.replace(/\//g, '\\');
    srcFile = new File(altPath);
}
if (!srcFile.exists) {
    $.writeln("AnalyzeStructure ERROR: 파일 없음 - " + sourceFile);
    var errResult = {
        error: "FILE_NOT_FOUND",
        meta: { fileType: fileType, pairId: pairId, filePath: sourceFile }
    };
    var errFile = new File(resultJson);
    errFile.encoding = "UTF-8";
    errFile.open("w");
    errFile.write(jsonStringify(errResult));
    errFile.close();
    return;
}

$.writeln("AnalyzeStructure: 분석 시작 - " + srcFile.fsName);

// ── 2. 파일 열기 ──────────────────────────────────────────────────────
var doc;
try {
    doc = app.open(srcFile);
} catch(e_open) {
    $.writeln("AnalyzeStructure ERROR: 파일 열기 실패 - " + e_open.message);
    var errResult2 = {
        error: "FILE_OPEN_FAILED",
        errorMessage: e_open.message,
        meta: { fileType: fileType, pairId: pairId, filePath: srcFile.fsName }
    };
    var errFile2 = new File(resultJson);
    errFile2.encoding = "UTF-8";
    errFile2.open("w");
    errFile2.write(jsonStringify(errResult2));
    errFile2.close();
    return;
}

// ── 3. 문서 기본 정보 ─────────────────────────────────────────────────
var docInfo = {
    colorSpace: (doc.documentColorSpace === DocumentColorSpace.CMYK) ? "CMYK" : "RGB",
    width_mm:  Math.round(ptToMm(doc.width) * 100) / 100,
    height_mm: Math.round(ptToMm(doc.height) * 100) / 100,
    rulerUnits: String(doc.rulerUnits)
};

// ── 4. 아트보드 정보 ──────────────────────────────────────────────────
var artboards = [];
for (var ai = 0; ai < doc.artboards.length; ai++) {
    var ab = doc.artboards[ai];
    var rect = ab.artboardRect; // [left, top, right, bottom]
    var abSize = boundsSize(rect);
    artboards.push({
        index: ai,
        name: ab.name,
        x: Math.round(ptToMm(rect[0]) * 100) / 100,
        y: Math.round(ptToMm(rect[1]) * 100) / 100,
        width_mm: abSize.width_mm,
        height_mm: abSize.height_mm
    });
}

// ── 5. 레이어 정보 ────────────────────────────────────────────────────
var layers = [];
for (var li = 0; li < doc.layers.length; li++) {
    var layer = doc.layers[li];
    var itemCount = 0;
    try { itemCount = layer.pageItems.length; } catch(e) {}
    layers.push({
        index: li,
        name: layer.name,
        visible: layer.visible,
        locked: layer.locked,
        itemCount: itemCount
    });
}

// ── 6. Top-level 아이템 수집 ──────────────────────────────────────────
var allItems = [];    // { item, vb, typename, name } — 클러스터링용
var itemsData = [];   // JSON 출력용 데이터

var totalGroups = 0;
var totalClipMasks = 0;

for (var li2 = 0; li2 < doc.layers.length; li2++) {
    var layer2 = doc.layers[li2];
    if (!layer2.visible) continue;

    for (var pi = 0; pi < layer2.pageItems.length; pi++) {
        try {
            var item = layer2.pageItems[pi];
            if (item.hidden) continue;

            var vb = item.visibleBounds;
            var w = Math.abs(vb[2] - vb[0]);
            var h = Math.abs(vb[1] - vb[3]);

            // 크기 없는 아이템 제외
            if (w < 1 && h < 1) continue;

            var clipInfo = getClipMaskInfo(item);
            var children = countChildren(item, 3); // 최대 3단계 깊이

            var itemIdx = allItems.length;
            allItems.push({
                item: item,
                vb: vb,
                typename: item.typename,
                name: item.name || ""
            });

            if (item.typename === "GroupItem") totalGroups++;
            if (clipInfo.isClipMask || clipInfo.hasClipMask) totalClipMasks++;

            var sz = boundsSize(vb);
            var itemData = {
                index: itemIdx,
                type: item.typename,
                name: item.name || "",
                layer: layer2.name,
                bounds_mm: boundsToMm(vb),
                width_mm: sz.width_mm,
                height_mm: sz.height_mm,
                isClipMask: clipInfo.isClipMask,
                hasClipMask: clipInfo.hasClipMask,
                clipMaskBounds_mm: clipInfo.clipMaskBounds_mm,
                children: children
            };

            itemsData.push(itemData);
        } catch(e) {
            $.writeln("AnalyzeStructure: 아이템 수집 오류 - " + e.message);
        }
    }
}

// ── 7. 아트보드 내 아이템 필터링 (클러스터링용) ─────────────────────
var abRect = doc.artboards[0].artboardRect;
var filteredItems = [];
var filteredMap = []; // filteredItems[i] → allItems 인덱스

for (var fi = 0; fi < allItems.length; fi++) {
    var fvb = allItems[fi].vb;
    // 아트보드와 겹치는 아이템만
    if (fvb[2] > abRect[0] && fvb[0] < abRect[2] &&
        fvb[1] > abRect[3] && fvb[3] < abRect[1]) {
        filteredMap.push(fi);
        filteredItems.push(allItems[fi]);
    }
}

// 모든 아이템이 밖이면 필터 해제
if (filteredItems.length === 0 && allItems.length > 0) {
    filteredItems = allItems;
    filteredMap = [];
    for (var ri = 0; ri < allItems.length; ri++) filteredMap.push(ri);
}

// ── 8. 클러스터링 ─────────────────────────────────────────────────────
var rawClusters = clusterByProximity(filteredItems, PROXIMITY_PT);
var clusters = absorbMicroClusters(rawClusters, filteredItems);

// 클러스터 결과를 원본 인덱스로 매핑
var clustersData = [];
for (var ci = 0; ci < clusters.length; ci++) {
    var cl = clusters[ci];
    var origIndices = [];
    for (var ii = 0; ii < cl.itemIndices.length; ii++) {
        origIndices.push(filteredMap[cl.itemIndices[ii]]);
    }
    var clSize = boundsSize(cl.bounds);
    clustersData.push({
        index: ci,
        itemIndices: origIndices,
        bounds_mm: boundsToMm(cl.bounds),
        width_mm: clSize.width_mm,
        height_mm: clSize.height_mm,
        itemCount: origIndices.length
    });
}

// ── 9. 텍스트 프레임 수집 ─────────────────────────────────────────────
var textFrames = [];
try {
    for (var ti = 0; ti < doc.textFrames.length; ti++) {
        try {
            var tf = doc.textFrames[ti];
            if (tf.hidden) continue;

            var tfContent = "";
            try { tfContent = tf.contents; } catch(e) {}

            // 빈 텍스트 건너뛰기
            if (!tfContent || tfContent.replace(/\s/g, '').length === 0) continue;

            // 텍스트 200자 제한 (너무 긴 텍스트 방지)
            if (tfContent.length > 200) {
                tfContent = tfContent.substring(0, 200) + "...";
            }

            var fontSize = null;
            try {
                if (tf.textRange && tf.textRange.characterAttributes) {
                    fontSize = tf.textRange.characterAttributes.size;
                    fontSize = Math.round(ptToMm(fontSize) * 100) / 100;
                }
            } catch(e) {}

            textFrames.push({
                index: textFrames.length,
                content: tfContent,
                bounds_mm: boundsToMm(tf.visibleBounds),
                fontSize_mm: fontSize
            });
        } catch(e) {}
    }
} catch(e) {}

// ── 10. 메타 정보 ─────────────────────────────────────────────────────
var fileSize = 0;
try { fileSize = srcFile.length; } catch(e) {}

var meta = {
    fileType: fileType,
    pairId: pairId,
    filePath: sourceFile.replace(/\\/g, '/'),
    fileName: srcFile.name,
    fileSize: fileSize
};

// ── 11. 요약 통계 ─────────────────────────────────────────────────────
var summary = {
    totalItems: allItems.length,
    totalGroups: totalGroups,
    totalClipMasks: totalClipMasks,
    totalTextFrames: textFrames.length,
    clusterCount: clustersData.length,
    artboardCount: artboards.length,
    layerCount: layers.length
};

// ── 12. 파일 닫기 ─────────────────────────────────────────────────────
doc.close(SaveOptions.DONOTSAVECHANGES);

// ── 13. JSON 저장 ─────────────────────────────────────────────────────
var output = {
    meta: meta,
    document: docInfo,
    artboards: artboards,
    layers: layers,
    items: itemsData,
    clusters: clustersData,
    textFrames: textFrames,
    summary: summary
};

var jsonFile = new File(resultJson);
jsonFile.encoding = "UTF-8";
jsonFile.open("w");
jsonFile.write(jsonStringify(output));
jsonFile.close();

$.writeln("AnalyzeStructure: 완료 - " + allItems.length + " items, "
    + clustersData.length + " clusters, "
    + textFrames.length + " texts → " + resultJson);

})();
} catch(e) {
    // 예외 시 에러 JSON 저장
    if (_savedResultJson) {
        var _errResult = {
            error: "JSX_EXCEPTION",
            errorMessage: e.message,
            errorLine: e.line
        };
        try {
            var _ef = new File(_savedResultJson);
            _ef.encoding = "UTF-8";
            _ef.open("w");
            _ef.write(jsonStringify(_errResult));
            _ef.close();
        } catch(e2) {}
    }
    $.writeln("AnalyzeStructure EXCEPTION: " + e.message + " (line " + e.line + ")");
}
