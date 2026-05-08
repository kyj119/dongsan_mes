/*
 * PrepareArtboards.jsx - 디자이너 보조 스크립트
 *
 * 용도: 디자이너가 텍스트 메모를 삭제한 후 실행하면,
 *       남은 디자인 요소를 클러스터링하여 각 디자인별 아트보드를 자동 생성
 *
 * 워크플로우:
 *   1. 디자이너가 파일 열고 주문 메모 텍스트 삭제
 *   2. 이 스크립트 실행 (File > Scripts 또는 단축키)
 *   3. 아트보드 자동 생성됨 → 눈으로 확인, 필요시 수동 조정
 *   4. 저장 → IA Automat이 아트보드 기준으로 추출
 *
 * v1.0 (2026-03-26): 초기 버전
 *   - Union-Find 2D 근접 클러스터링 (ExtractGroups.jsx 로직 재활용)
 *   - 클리핑 마스크 감지: GroupItem.clipped → 마스크 PathItem의 geometricBounds 사용
 *   - 미세 클러스터 흡수, 얇은 strip 필터링
 *   - 기존 아트보드 전부 제거 후 디자인별 아트보드 새로 생성
 */

#target illustrator

app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

// ═══════════════════════════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════════════════════════
var PROXIMITY_PT = 10;        // 3.5mm — 이 거리 이내 아이템은 같은 디자인
var MIN_SIZE_PT = 141.732;    // 50mm — 이보다 작은 아이템/클러스터 필터
var THIN_PT = 22.677;         // 8mm — 얇은 strip 판별
var ARTBOARD_PADDING_PT = 0;  // 아트보드 여백 (0 = 디자인 경계에 딱 맞춤)

// ═══════════════════════════════════════════════════════════════════════
// 유틸: 두 바운딩박스 사이 최소 간격 (pt)
// ═══════════════════════════════════════════════════════════════════════
function rectGap(a, b) {
    var gx = Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]));
    var gy = Math.max(0, Math.max(a[3], b[3]) - Math.min(a[1], b[1]));
    return Math.max(gx, gy);
}

// ═══════════════════════════════════════════════════════════════════════
// 클리핑 마스크 처리: 실제 보이는 영역의 바운드 반환
//
// GroupItem.clipped == true인 경우:
//   그룹 전체의 visibleBounds가 아닌,
//   내부 clipping path의 geometricBounds를 반환
//   → 마스크 밖으로 삐져나온 오브젝트 무시
// ═══════════════════════════════════════════════════════════════════════
function getItemBounds(item) {
    try {
        // 클리핑 마스크 그룹 감지
        if (item.typename === "GroupItem" && item.clipped) {
            for (var i = 0; i < item.pageItems.length; i++) {
                var child = item.pageItems[i];

                // PathItem이 클리핑 마스크인 경우
                if (child.typename === "PathItem" && child.clipping) {
                    return child.geometricBounds;
                }

                // CompoundPathItem이 클리핑 마스크인 경우
                if (child.typename === "CompoundPathItem") {
                    try {
                        for (var j = 0; j < child.pathItems.length; j++) {
                            if (child.pathItems[j].clipping) {
                                return child.geometricBounds;
                            }
                        }
                    } catch(e) {}
                }
            }
            // 마스크 못 찾으면 fallback
            return item.visibleBounds;
        }
    } catch(e) {}

    // 일반 아이템
    return item.visibleBounds;
}

// ═══════════════════════════════════════════════════════════════════════
// 모든 visible 아이템 수집
// ═══════════════════════════════════════════════════════════════════════
function collectAllItems(doc) {
    var items = [];
    var skippedText = 0;
    var skippedSmall = 0;
    var skippedHidden = 0;

    for (var li = 0; li < doc.layers.length; li++) {
        var layer = doc.layers[li];
        if (!layer.visible) continue;

        for (var pi = 0; pi < layer.pageItems.length; pi++) {
            try {
                var item = layer.pageItems[pi];
                if (item.hidden) { skippedHidden++; continue; }

                // TextFrame 자동 스킵 (아웃라인 안 된 텍스트)
                if (item.typename === "TextFrame") { skippedText++; continue; }

                var vb = getItemBounds(item);
                var _w = Math.abs(vb[2] - vb[0]);
                var _h = Math.abs(vb[1] - vb[3]);

                // 실질 크기 없는 점 제거
                if (_w < 1 && _h < 1) continue;

                // 50mm 미만 소형 아이템 필터
                if (_w < MIN_SIZE_PT && _h < MIN_SIZE_PT) {
                    skippedSmall++;
                    continue;
                }

                items.push({
                    item: item,
                    vb: [vb[0], vb[1], vb[2], vb[3]],
                    typename: item.typename
                });
            } catch(e) {}
        }
    }

    $.writeln("PrepareArtboards: " + items.length + " items collected"
        + " (skipped: text=" + skippedText + ", small=" + skippedSmall
        + ", hidden=" + skippedHidden + ")");

    return items;
}

// ═══════════════════════════════════════════════════════════════════════
// Union-Find 2D 근접 클러스터링
// ═══════════════════════════════════════════════════════════════════════
function clusterByProximity(items, threshold) {
    var n = items.length;
    if (n === 0) return [];
    if (n === 1) {
        return [{
            items: [items[0]],
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
            map[r] = { items: [], bounds: [Infinity, -Infinity, -Infinity, Infinity] };
        }
        map[r].items.push(items[i]);
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
// 클러스터 후처리: 얇은 strip 제거, 미세 클러스터 흡수
// ═══════════════════════════════════════════════════════════════════════
function postProcessClusters(clusters) {
    var mmPerPt = 1.0 / 2.834645669;

    // ── 1. 얇은 strip item의 bounds 기여 제거 ──
    for (var i = 0; i < clusters.length; i++) {
        var cl = clusters[i];
        if (cl.items.length < 2) continue;

        var hasNonThin = false;
        for (var j = 0; j < cl.items.length; j++) {
            var v = cl.items[j].vb;
            if (Math.abs(v[2]-v[0]) >= THIN_PT && Math.abs(v[1]-v[3]) >= THIN_PT) {
                hasNonThin = true; break;
            }
        }
        if (!hasNonThin) continue;

        var newB = [Infinity, -Infinity, -Infinity, Infinity];
        for (var j = 0; j < cl.items.length; j++) {
            var v = cl.items[j].vb;
            if (Math.abs(v[2]-v[0]) < THIN_PT || Math.abs(v[1]-v[3]) < THIN_PT) continue;
            if (v[0] < newB[0]) newB[0] = v[0];
            if (v[1] > newB[1]) newB[1] = v[1];
            if (v[2] > newB[2]) newB[2] = v[2];
            if (v[3] < newB[3]) newB[3] = v[3];
        }
        cl.bounds = newB;
    }

    // ── 2. 미세 클러스터 흡수 (5% 미만 → 가장 가까운 대형 클러스터에 병합) ──
    if (clusters.length <= 1) return clusters;

    var maxArea = 0;
    for (var i = 0; i < clusters.length; i++) {
        var b = clusters[i].bounds;
        var area = Math.abs(b[2] - b[0]) * Math.abs(b[1] - b[3]);
        if (area > maxArea) maxArea = area;
    }

    var sizeThreshold = maxArea * 0.05;
    var big = [], tiny = [];

    for (var i = 0; i < clusters.length; i++) {
        var b = clusters[i].bounds;
        var w = Math.abs(b[2] - b[0]);
        var h = Math.abs(b[1] - b[3]);
        var area = w * h;
        var isThin = (w < THIN_PT || h < THIN_PT);

        if (area >= sizeThreshold && !isThin) {
            big.push(clusters[i]);
        } else {
            tiny.push(clusters[i]);
        }
    }

    if (big.length > 0 && tiny.length > 0) {
        for (var ti = 0; ti < tiny.length; ti++) {
            var minDist = Infinity, nearIdx = 0;
            for (var bi = 0; bi < big.length; bi++) {
                var d = rectGap(tiny[ti].bounds, big[bi].bounds);
                if (d < minDist) { minDist = d; nearIdx = bi; }
            }
            for (var mi = 0; mi < tiny[ti].items.length; mi++) {
                big[nearIdx].items.push(tiny[ti].items[mi]);
            }
            var tb = tiny[ti].bounds;
            var bb = big[nearIdx].bounds;
            if (tb[0] < bb[0]) bb[0] = tb[0];
            if (tb[1] > bb[1]) bb[1] = tb[1];
            if (tb[2] > bb[2]) bb[2] = tb[2];
            if (tb[3] < bb[3]) bb[3] = tb[3];
        }
        clusters = big;
    }

    // ── 3. 최소 크기 필터 (50mm 미만 클러스터 제거) ──
    var filtered = [];
    for (var i = 0; i < clusters.length; i++) {
        var b = clusters[i].bounds;
        var w = Math.abs(b[2] - b[0]);
        var h = Math.abs(b[1] - b[3]);
        if (w >= MIN_SIZE_PT || h >= MIN_SIZE_PT) {
            filtered.push(clusters[i]);
        } else {
            $.writeln("  FILTERED: " + Math.round(w * mmPerPt) + "x"
                + Math.round(h * mmPerPt) + "mm (< 50mm)");
        }
    }

    return filtered;
}

// ═══════════════════════════════════════════════════════════════════════
// 메인 실행
// ═══════════════════════════════════════════════════════════════════════
function main() {
    var doc = app.activeDocument;
    var mmPerPt = 1.0 / 2.834645669;

    $.writeln("\n========================================");
    $.writeln("PrepareArtboards v1.0");
    $.writeln("파일: " + doc.name);
    $.writeln("========================================");

    // ── 1. 아이템 수집 ──
    var items = collectAllItems(doc);
    if (items.length === 0) {
        alert("추출 가능한 디자인 요소가 없습니다.\n텍스트만 있거나 모든 요소가 숨김 상태입니다.");
        return;
    }

    // ── 2. 클러스터링 ──
    var clusters = clusterByProximity(items, PROXIMITY_PT);
    $.writeln("클러스터링: " + clusters.length + "개 raw clusters");

    // ── 3. 후처리 ──
    clusters = postProcessClusters(clusters);
    $.writeln("후처리 후: " + clusters.length + "개 디자인 감지");

    if (clusters.length === 0) {
        alert("디자인 클러스터를 찾지 못했습니다.\n50mm 미만 요소만 남아있을 수 있습니다.");
        return;
    }

    // ── 4. 기존 아트보드 제거 (1개는 남겨야 함 — AI 문서 제약) ──
    // 먼저 첫 번째 아트보드를 첫 번째 디자인 위치로 설정
    var b0 = clusters[0].bounds;
    var pad = ARTBOARD_PADDING_PT;
    doc.artboards[0].artboardRect = [
        b0[0] - pad, b0[1] + pad, b0[2] + pad, b0[3] - pad
    ];
    doc.artboards[0].name = "디자인 1";

    // 기존 나머지 아트보드 제거 (뒤에서부터)
    for (var ai = doc.artboards.length - 1; ai >= 1; ai--) {
        doc.artboards.remove(ai);
    }

    // ── 5. 나머지 디자인에 대한 아트보드 추가 ──
    for (var ci = 1; ci < clusters.length; ci++) {
        var b = clusters[ci].bounds;
        var rect = [b[0] - pad, b[1] + pad, b[2] + pad, b[3] - pad];
        doc.artboards.add(rect);
        doc.artboards[ci].name = "디자인 " + (ci + 1);
    }

    // ── 6. 결과 표시 ──
    var summary = clusters.length + "개 디자인 아트보드 생성 완료:\n\n";
    for (var ci = 0; ci < clusters.length; ci++) {
        var b = clusters[ci].bounds;
        var w = Math.round(Math.abs(b[2] - b[0]) * mmPerPt);
        var h = Math.round(Math.abs(b[1] - b[3]) * mmPerPt);
        summary += "  디자인 " + (ci + 1) + ": " + w + " × " + h + " mm"
            + " (" + clusters[ci].items.length + "개 요소)\n";
    }
    summary += "\n아트보드를 확인하고, 필요시 수동으로 조정한 뒤 저장하세요.";

    $.writeln(summary);
    alert(summary);
}

// 실행
try {
    main();
} catch(e) {
    alert("오류 발생: " + e.message + "\n라인: " + e.line);
    $.writeln("ERROR: " + e.message + " (line " + e.line + ")");
}
