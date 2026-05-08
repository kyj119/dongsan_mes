/*
 * ProcessOrderItem.jsx - 주문 품목별 인쇄용 EPS + PNG 썸네일 생성
 *
 * v1: groupIdx + getFullBounds 4-case 방식
 * v2 (2026-03-30): 아트보드 기반으로 전면 재설계
 *   - ExtractGroups v5가 생성한 아트보드 바운드를 직접 사용
 *   - getFullBounds 4-case 제거 (아트보드가 이미 정확한 디자인 영역)
 *   - 여백/재단선: 용준님 스크립트 2 (파일정렬+저장.jsx) 패턴 적용
 *     - _tmp_bg_ 레이어 (맨 아래): 여백 포함 흰색 배경
 *     - _tmp_border_ 레이어 (맨 위): 재단선 (setEntirePath, 세그먼트 분리)
 *     - 여백 0인 변은 재단선 생략
 *   - EPS 저장: saveMultipleArtboards + artboardRange
 *   - 펀칭/주석 기존 로직 유지
 *
 * 파라미터 (ia_params.json):
 *   source       소스 AI/EPS 파일 전체 경로 (ExtractGroups가 아트보드 생성 후 저장한 파일)
 *   artboardIndex 아트보드 인덱스 (ExtractGroups v5에서 생성한 아트보드, 0-based)
 *   groupIdx     (하위호환) artboardIndex 없으면 groupIdx 사용
 *   marginL/R/T/B 블리드 (cm)
 *   epsOutput    출력 EPS 전체 경로
 *   pngOutput    출력 PNG 전체 경로 (선택)
 *   thumbSize    PNG 단변 최대 px (기본: 300)
 *   scaleFactor  축소비율 (기본: 1)
 *   punching     펀칭 설정 (선택)
 *   annotation   주석 설정 (선택)
 *   offset       오프셋 설정 (선택, BLEED 통합)
 *                { offset_top/bottom/left/right: mm,
 *                  method: "scale"|"edge_strip", cut_line: true|false }
 *                method "scale": 기존 다이컷 (전체 비례 확대 복제 + M100 재단선)
 *                method "edge_strip": 도련 (가장자리 1mm 클리핑 → 스트레칭, 원본 무변경)
 */

#target illustrator

app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

function main() {
    var _scriptDir = (typeof _ia_params_override_path !== "undefined" && _ia_params_override_path)
        ? new File(_ia_params_override_path).parent.fsName
        : new File($.fileName).parent.fsName;
    var _cfgPath = (typeof _ia_params_override_path !== "undefined" && _ia_params_override_path)
        ? _ia_params_override_path
        : (_scriptDir + "/ia_params.json");
    var _cfgFile = new File(_cfgPath);
    _cfgFile.open("r");
    var _p = eval("(" + _cfgFile.read() + ")");
    _cfgFile.close();

    var sourceFile  = _p.source      || "";
    var abIndex     = (_p.artboardIndex !== undefined) ? _p.artboardIndex
                    : ((_p.groupIdx !== undefined) ? _p.groupIdx : 0);
    var marginL     = _p.marginL     || 0;
    var marginR     = _p.marginR     || 0;
    var marginT     = _p.marginT     || 0;
    var marginB     = _p.marginB     || 0;
    var outputEps   = _p.epsOutput   || "";
    var outputPng   = _p.pngOutput   || "";
    var thumbSize   = _p.thumbSize   || 300;
    var punching    = _p.punching    || null;
    var annotation  = _p.annotation  || null;
    var scaleFactor = _p.scaleFactor || 1;
    var offsetCfg   = _p.offset      || null;
    var finishingCfg = _p.finishing   || null;

    if (!sourceFile || !outputEps) {
        $.writeln("ProcessOrderItem ERROR: source, epsOutput 필요");
        return;
    }

    var file = new File(sourceFile);
    if (!file.exists) {
        $.writeln("ProcessOrderItem ERROR: 파일 없음 - " + sourceFile);
        return;
    }

    var ptPerMm = 2.834645669;
    var mmPerPt = 1.0 / ptPerMm;

    $.writeln("ProcessOrderItem v2: abIndex=" + abIndex
        + " margin=" + marginL + "/" + marginR + "/" + marginT + "/" + marginB + "cm");

    // ── 1. 소스 파일 열기 ──
    var doc = app.open(file);

    // AUTO-FIX
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

    // ── 2. 아트보드에서 디자인 바운드 읽기 ──
    if (abIndex < 0 || abIndex >= doc.artboards.length) {
        $.writeln("ProcessOrderItem WARNING: artboard " + abIndex + " 없음 (count="
            + doc.artboards.length + ") -> artboard 0 사용");
        abIndex = 0;
    }

    var ab = doc.artboards[abIndex];
    var oRect = ab.artboardRect;
    var oL = oRect[0], oT = oRect[1], oR = oRect[2], oB = oRect[3];
    var designW = Math.abs(oR - oL);
    var designH = Math.abs(oT - oB);

    $.writeln("ProcessOrderItem: design bounds="
        + Math.round(designW * mmPerPt) + "x" + Math.round(designH * mmPerPt) + "mm");

    // ── 2a. 다른 아트보드 아이템 숨기기 ──
    // (용준님 스크립트 2: selectObjectsOnActiveArtboard + getTopParent 패턴)
    // 아트보드별 아이템 매핑 → 현재 아트보드 외 아이템 hidden
    var artboardTopItems = [];
    var allMappedItems = [];

    for (var abk = 0; abk < doc.artboards.length; abk++) {
        doc.artboards.setActiveArtboardIndex(abk);
        doc.selection = null;
        doc.selectObjectsOnActiveArtboard();

        var topItems = [];
        for (var sj = 0; sj < doc.selection.length; sj++) {
            var top = doc.selection[sj];
            // getTopParent: Layer/Document 직속까지 올라감
            while (top.parent && top.parent.typename !== "Layer" && top.parent.typename !== "Document") {
                top = top.parent;
            }
            // 중복 방지
            var already = false;
            for (var ti = 0; ti < topItems.length; ti++) {
                if (topItems[ti] === top) { already = true; break; }
            }
            if (!already) topItems.push(top);

            var mapped = false;
            for (var mi = 0; mi < allMappedItems.length; mi++) {
                if (allMappedItems[mi] === top) { mapped = true; break; }
            }
            if (!mapped) allMappedItems.push(top);
        }
        artboardTopItems[abk] = topItems;
    }
    doc.selection = null;

    // 현재 아트보드 아이템만 표시, 나머지 숨기기
    for (var hi = 0; hi < allMappedItems.length; hi++) {
        try { allMappedItems[hi].hidden = true; } catch(e) {}
    }
    for (var si = 0; si < artboardTopItems[abIndex].length; si++) {
        try { artboardTopItems[abIndex][si].hidden = false; } catch(e) {}
    }

    $.writeln("ProcessOrderItem: " + allMappedItems.length + " total items, "
        + artboardTopItems[abIndex].length + " items for artboard " + abIndex);

    // ── 2b. 오프셋 값 사전 계산 (step 5b에서 실제 적용) ──
    var offT = 0, offB = 0, offL = 0, offR = 0;
    var offsetMethod = 'scale';
    var offsetCutLine = true;
    if (offsetCfg) {
        offsetMethod = offsetCfg.method || 'scale';
        offsetCutLine = (offsetCfg.cut_line !== undefined) ? !!offsetCfg.cut_line : true;
        if (offsetCfg.offset_top !== undefined) {
            offT = (offsetCfg.offset_top || 0) / scaleFactor * ptPerMm;
            offB = (offsetCfg.offset_bottom || 0) / scaleFactor * ptPerMm;
            offL = (offsetCfg.offset_left || 0) / scaleFactor * ptPerMm;
            offR = (offsetCfg.offset_right || 0) / scaleFactor * ptPerMm;
        } else if (offsetCfg.offset_distance) {
            var d = offsetCfg.offset_distance / scaleFactor * ptPerMm;
            offT = offB = offL = offR = d;
        }
    }
    var hasOffset = (offT > 0 || offB > 0 || offL > 0 || offR > 0);
    // edge_strip 방식일 때 아트보드/PNG 크기에 반영
    var bT = (hasOffset && offsetMethod === 'edge_strip') ? offT : 0;
    var bB = (hasOffset && offsetMethod === 'edge_strip') ? offB : 0;
    var bL = (hasOffset && offsetMethod === 'edge_strip') ? offL : 0;
    var bR = (hasOffset && offsetMethod === 'edge_strip') ? offR : 0;

    // ── 3. 여백 계산 (cm → pt) ──
    var mL = marginL * 10.0 * ptPerMm;
    var mR = marginR * 10.0 * ptPerMm;
    var mT = marginT * 10.0 * ptPerMm;
    var mB = marginB * 10.0 * ptPerMm;

    // ── 3b. 마감방식(finishing) 여백 계산 (cm → pt) ──
    // 마감 여백 = 빈 공간 확장 (bleed와 다름: 디자인 확장 아님)
    var fT = 0, fB = 0, fL = 0, fR = 0;
    var hasFinishing = false;
    if (finishingCfg) {
        fT = (finishingCfg.top && finishingCfg.top.margin_cm) ? finishingCfg.top.margin_cm * 10.0 * ptPerMm : 0;
        fB = (finishingCfg.bottom && finishingCfg.bottom.margin_cm) ? finishingCfg.bottom.margin_cm * 10.0 * ptPerMm : 0;
        fL = (finishingCfg.left && finishingCfg.left.margin_cm) ? finishingCfg.left.margin_cm * 10.0 * ptPerMm : 0;
        fR = (finishingCfg.right && finishingCfg.right.margin_cm) ? finishingCfg.right.margin_cm * 10.0 * ptPerMm : 0;
        var hasTop = finishingCfg.top && finishingCfg.top.method && finishingCfg.top.method !== '';
        var hasBot = finishingCfg.bottom && finishingCfg.bottom.method && finishingCfg.bottom.method !== '';
        var hasLeft = finishingCfg.left && finishingCfg.left.method && finishingCfg.left.method !== '';
        var hasRight = finishingCfg.right && finishingCfg.right.method && finishingCfg.right.method !== '';
        hasFinishing = hasTop || hasBot || hasLeft || hasRight;
        if (hasFinishing) {
            $.writeln("ProcessOrderItem: finishing T=" + Math.round(fT) + " B=" + Math.round(fB)
                + " L=" + Math.round(fL) + " R=" + Math.round(fR) + "pt");
        }
    }

    // ── 4. 아트보드 여백 확장 (임시) — 도련(bleed) + 여백(margin) + 마감(finishing) ──
    // (용준님 스크립트 2 패턴)
    ab.artboardRect = [oL - bL - mL - fL, oT + bT + mT + fT, oR + bR + mR + fR, oB - bB - mB - fB];
    var eRect = ab.artboardRect;
    var eL = eRect[0], eT = eRect[1], eR = eRect[2], eB = eRect[3];

    // ── 5. 임시 레이어: 흰배경 (맨 아래) + 재단선 (맨 위) ──
    // (용준님 스크립트 2 패턴: setEntirePath + z-order 관리)
    var tmpBotLayer = doc.layers.add();
    tmpBotLayer.name = "_tmp_bg_";
    tmpBotLayer.zOrder(ZOrderMethod.SENDTOBACK);

    var tmpTopLayer = doc.layers.add();
    tmpTopLayer.name = "_tmp_border_";
    // layers.add()는 맨 위에 생성됨

    // 흰배경
    var whiteColor = new CMYKColor();
    whiteColor.cyan = 0; whiteColor.magenta = 0;
    whiteColor.yellow = 0; whiteColor.black = 0;

    var bg = tmpBotLayer.pathItems.add();
    bg.setEntirePath([[eL, eT], [eR, eT], [eR, eB], [eL, eB]]);
    bg.closed = true;
    bg.filled = true;
    bg.fillColor = whiteColor;
    bg.stroked = false;

    // 재단선 (여백 0인 변 생략, 세그먼트 연결)
    var markColor = new CMYKColor();
    markColor.cyan = 0; markColor.magenta = 100;
    markColor.yellow = 0; markColor.black = 0;

    var sides = [
        {has: mT > 0, p1: [eL, oT], p2: [eR, oT]},  // 상단 (디자인 원래 top)
        {has: mR > 0, p1: [oR, oT], p2: [oR, oB]},   // 우측
        {has: mB > 0, p1: [eR, oB], p2: [eL, oB]},   // 하단
        {has: mL > 0, p1: [oL, oB], p2: [oL, oT]}    // 좌측
    ];

    var startIdx = -1;
    for (var s = 0; s < 4; s++) {
        if (!sides[s].has) { startIdx = s; break; }
    }

    var segments = [];
    if (startIdx === -1) {
        // 4면 모두 여백 → 닫힌 사각형
        segments.push({pts: [[oL, oT], [oR, oT], [oR, oB], [oL, oB]], closed: true});
    } else {
        var pts = [];
        for (var si = 1; si <= 4; si++) {
            var idx = (startIdx + si) % 4;
            if (sides[idx].has) {
                if (pts.length === 0) pts.push(sides[idx].p1);
                pts.push(sides[idx].p2);
            } else {
                if (pts.length > 0) {
                    segments.push({pts: pts, closed: false});
                    pts = [];
                }
            }
        }
        if (pts.length > 0) segments.push({pts: pts, closed: false});
    }

    var borderGroup = tmpTopLayer.groupItems.add();
    borderGroup.name = "cutlines";
    var sw = 0.08;

    for (var seg = 0; seg < segments.length; seg++) {
        var bp = borderGroup.pathItems.add();
        bp.setEntirePath(segments[seg].pts);
        bp.closed = segments[seg].closed;
        bp.filled = false;
        bp.stroked = true;
        bp.strokeColor = markColor;
        bp.strokeWidth = sw;
        bp.strokeJoin = StrokeJoin.MITERENDJOIN;
        bp.strokeCap = StrokeCap.BUTTENDCAP;
    }

    // ── 5a-2. 마감 접는/재단선 (M100 0.6pt) ──
    // 마감방식이 설정된 변에 디자인+bleed+margin 경계에 선 추가
    // finishing 여백은 이 선 바깥의 빈 공간
    if (hasFinishing) {
        var finGroup = tmpTopLayer.groupItems.add();
        finGroup.name = "foldlines";
        var finColor = new CMYKColor();
        finColor.cyan = 0; finColor.magenta = 100;
        finColor.yellow = 0; finColor.black = 0;
        var finSW = 0.6;

        // 접는 선 위치 = 원본 디자인 경계에서 bleed+margin만큼 확장된 위치
        // (finishing 여백 바로 안쪽 경계)
        var fLineL = oL - bL - mL;  // bleed+margin 포함한 좌측 경계
        var fLineR = oR + bR + mR;
        var fLineT = oT + bT + mT;
        var fLineB = oB - bB - mB;

        // 상단 접는선: 마감 여백이 있는 변만 그림
        var finSides = [
            {has: finishingCfg.top && finishingCfg.top.method && finishingCfg.top.method !== '',
             p1: [fLineL - fL, fLineT], p2: [fLineR + fR, fLineT]},
            {has: finishingCfg.right && finishingCfg.right.method && finishingCfg.right.method !== '',
             p1: [fLineR, fLineT + fT], p2: [fLineR, fLineB - fB]},
            {has: finishingCfg.bottom && finishingCfg.bottom.method && finishingCfg.bottom.method !== '',
             p1: [fLineR + fR, fLineB], p2: [fLineL - fL, fLineB]},
            {has: finishingCfg.left && finishingCfg.left.method && finishingCfg.left.method !== '',
             p1: [fLineL, fLineB - fB], p2: [fLineL, fLineT + fT]}
        ];

        for (var fi = 0; fi < finSides.length; fi++) {
            if (finSides[fi].has) {
                var fp = finGroup.pathItems.add();
                fp.setEntirePath([finSides[fi].p1, finSides[fi].p2]);
                fp.closed = false;
                fp.filled = false;
                fp.stroked = true;
                fp.strokeColor = finColor;
                fp.strokeWidth = finSW;
                fp.strokeCap = StrokeCap.BUTTENDCAP;
            }
        }
        $.writeln("ProcessOrderItem: finishing fold/cut lines added");
    }

    app.redraw();

    // ── 5b. 오프셋 — method에 따라 edge_strip(도련) 또는 scale(다이컷) ──
    var tmpOffsetLayer = null;

    if (hasOffset) {
        $.writeln("ProcessOrderItem: 오프셋 method=" + offsetMethod + " cut_line=" + offsetCutLine
            + " T=" + Math.round(offT/ptPerMm) + " B=" + Math.round(offB/ptPerMm)
            + " L=" + Math.round(offL/ptPerMm) + " R=" + Math.round(offR/ptPerMm) + "mm");

        if (offsetMethod === 'edge_strip') {
            // ── edge_strip: 가장자리 1mm 클리핑 → 스트레칭 (원본 무변경) ──
            tmpOffsetLayer = doc.layers.add();
            tmpOffsetLayer.name = "_tmp_offset_bleed_";
            tmpOffsetLayer.zOrder(ZOrderMethod.SENDTOBACK);

            var edgeItems = artboardTopItems[abIndex];
            var stripPt = 1.0 * ptPerMm;

            function createEdgeStrip(targetLayer, items, bndL, bndT, bndR, bndB, direction, edgeBleedPt) {
                if (edgeBleedPt <= 0) return;
                var sL, sT, sR, sB;
                if (direction === 'top')    { sL = bndL; sT = bndT;            sR = bndR; sB = bndT - stripPt; }
                if (direction === 'bottom') { sL = bndL; sT = bndB + stripPt;  sR = bndR; sB = bndB; }
                if (direction === 'left')   { sL = bndL; sT = bndT;            sR = bndL + stripPt; sB = bndB; }
                if (direction === 'right')  { sL = bndR - stripPt; sT = bndT;  sR = bndR;           sB = bndB; }

                var grp = targetLayer.groupItems.add();
                grp.name = "_bleed_" + direction;
                var cr = grp.pathItems.add();
                cr.setEntirePath([[sL, sT], [sR, sT], [sR, sB], [sL, sB]]);
                cr.closed = true; cr.clipping = true;
                cr.filled = false; cr.stroked = false;
                for (var di = items.length - 1; di >= 0; di--) {
                    try { items[di].duplicate(grp, ElementPlacement.PLACEATEND); } catch(e) {}
                }
                grp.clipped = true;

                var scX2 = 100, scY2 = 100;
                if (direction === 'top' || direction === 'bottom') scY2 = (edgeBleedPt / stripPt) * 100;
                else scX2 = (edgeBleedPt / stripPt) * 100;
                grp.resize(scX2, scY2, true, true, true, true, scX2);

                if (direction === 'top')    { grp.top = bndT + edgeBleedPt; grp.left = bndL; }
                if (direction === 'bottom') { grp.top = bndB;               grp.left = bndL; }
                if (direction === 'left')   { grp.left = bndL - edgeBleedPt; grp.top = bndT; }
                if (direction === 'right')  { grp.left = bndR;               grp.top = bndT; }

                $.writeln("ProcessOrderItem: edge_strip " + direction + " (" + Math.round(edgeBleedPt * mmPerPt) + "mm)");
            }

            createEdgeStrip(tmpOffsetLayer, edgeItems, oL, oT, oR, oB, 'top',    offT);
            createEdgeStrip(tmpOffsetLayer, edgeItems, oL, oT, oR, oB, 'bottom', offB);
            createEdgeStrip(tmpOffsetLayer, edgeItems, oL, oT, oR, oB, 'left',   offL);
            createEdgeStrip(tmpOffsetLayer, edgeItems, oL, oT, oR, oB, 'right',  offR);

            // 아트보드 오프셋만큼 확장
            var curRect = ab.artboardRect;
            ab.artboardRect = [curRect[0] - offL, curRect[1] + offT, curRect[2] + offR, curRect[3] - offB];

        } else {
            // ── scale: 기존 복제 + 비대칭 확대 (다이컷 하위호환) ──
            doc.artboards.setActiveArtboardIndex(abIndex);
            doc.selection = null;
            doc.selectObjectsOnActiveArtboard();

            var sel = doc.selection;
            if (sel && sel.length > 0) {
                var scX = (designW + offL + offR) / designW * 100;
                var scY = (designH + offT + offB) / designH * 100;
                var shiftX = (offR - offL) / 2;
                var shiftY = (offT - offB) / 2;

                for (var oi = 0; oi < sel.length; oi++) {
                    try {
                        var parentName = '';
                        try { parentName = sel[oi].parent.name || ''; } catch(e) {}
                        if (parentName.indexOf('_tmp_') === 0) continue;
                        var dup = sel[oi].duplicate();
                        dup.zOrder(ZOrderMethod.SENDBACKWARD);
                        dup.resize(scX, scY, true, true, true, true, scX);
                        dup.translate(shiftX, shiftY);
                    } catch(e) {}
                }
            }
            doc.selection = null;
        }

        // 재단선: cut_line=true 시에만 추가 (M100)
        if (offsetCutLine) {
            var cutLayer = tmpOffsetLayer || doc.layers.add();
            if (!tmpOffsetLayer) { cutLayer.name = "_tmp_offset_cut_"; tmpOffsetLayer = cutLayer; }

            var cutColor = new CMYKColor();
            cutColor.cyan = 0; cutColor.magenta = 100;
            cutColor.yellow = 0; cutColor.black = 0;

            var cutRect = cutLayer.pathItems.add();
            cutRect.setEntirePath([[oL, oT], [oR, oT], [oR, oB], [oL, oB]]);
            cutRect.closed = true;
            cutRect.filled = false;
            cutRect.stroked = true;
            cutRect.strokeColor = cutColor;
            cutRect.strokeWidth = 0.08;
        }

        app.redraw();
    }

    // ── 6. 펀칭 마크 ──
    if (punching) {
        var markDiaMm = 5 / scaleFactor;
        var markOffMm = 10 / scaleFactor;
        var markDiaPt = markDiaMm * ptPerMm;
        var markOffPt = markOffMm * ptPerMm;
        var markRadius = markDiaPt / 2;

        var marks = [];
        // 코너: 디자인 안쪽 대각선 방향으로 offset
        if (punching.corner_tl) marks.push([oL + markOffPt, oT - markOffPt]);
        if (punching.corner_tr) marks.push([oR - markOffPt, oT - markOffPt]);
        if (punching.corner_bl) marks.push([oL + markOffPt, oB + markOffPt]);
        if (punching.corner_br) marks.push([oR - markOffPt, oB + markOffPt]);

        // 변: 디자인 안쪽으로 offset
        var sideTop = punching.side_top || 0;
        for (var ti = 0; ti < sideTop; ti++) {
            marks.push([oL + designW * (ti+1) / (sideTop+1), oT - markOffPt]);
        }
        var sideBot = punching.side_bottom || 0;
        for (var bi = 0; bi < sideBot; bi++) {
            marks.push([oL + designW * (bi+1) / (sideBot+1), oB + markOffPt]);
        }
        var sideLeft = punching.side_left || 0;
        for (var li = 0; li < sideLeft; li++) {
            marks.push([oL + markOffPt, oT - designH * (li+1) / (sideLeft+1)]);
        }
        var sideRight = punching.side_right || 0;
        for (var ri = 0; ri < sideRight; ri++) {
            marks.push([oR - markOffPt, oT - designH * (ri+1) / (sideRight+1)]);
        }

        var blackColor = new CMYKColor();
        blackColor.cyan = 0; blackColor.magenta = 0;
        blackColor.yellow = 0; blackColor.black = 100;

        for (var mi = 0; mi < marks.length; mi++) {
            var ellipse = doc.pathItems.ellipse(
                marks[mi][1] + markRadius, marks[mi][0] - markRadius,
                markDiaPt, markDiaPt
            );
            ellipse.fillColor = blackColor;
            ellipse.filled = true;
            ellipse.stroked = false;
        }
        $.writeln("ProcessOrderItem: 펀칭 " + marks.length + "개");
    }

    // ── 7. 주석 텍스트 ──
    // annotation 구조 (C#): { positions: ["하","좌"], text: "...", customText: "..." }
    // positions의 한국어 문자열을 charCodeAt으로 매칭 (인코딩 안전)
    var _annoLog = "anno: ";
    if (annotation) {
        _annoLog += "exists, text=" + (annotation.text || "null")
            + ", positions=" + (annotation.positions ? annotation.positions.length + "개" : "null");

        var annoText = annotation.customText || annotation.text;
        if (annoText) {
            var positions = annotation.positions || [];
            var annoPad = 2 * ptPerMm;

            for (var ai = 0; ai < positions.length; ai++) {
                var posStr = positions[ai];
                // 한국어 매칭: charCodeAt 사용 (인코딩 안전)
                // 상=49345, 하=54616, 좌=51340, 우=50864
                var posCode = posStr.charCodeAt(0);
                var annoMarginPt = 0;
                if (posCode === 49345) annoMarginPt = mT;       // 상
                else if (posCode === 54616) annoMarginPt = mB;  // 하
                else if (posCode === 51340) annoMarginPt = mL;  // 좌
                else if (posCode === 50864) annoMarginPt = mR;  // 우

                _annoLog += " | pos[" + ai + "]=\"" + posStr + "\"(code=" + posCode
                    + ") margin=" + Math.round(annoMarginPt) + "pt";

                if (annoMarginPt > annoPad * 2) {
                    var tf = doc.textFrames.add();
                    tf.contents = annoText;
                    var fontSize = Math.min(14, Math.max(4, (annoMarginPt - annoPad * 2) * 0.7));

                    // 스타일 먼저 설정
                    var blackTextColor = new CMYKColor();
                    blackTextColor.cyan = 0; blackTextColor.magenta = 0;
                    blackTextColor.yellow = 0; blackTextColor.black = 100;
                    tf.textRange.characterAttributes.fillColor = blackTextColor;
                    tf.textRange.characterAttributes.size = fontSize;

                    // 회전 먼저 (회전 후 바운딩 박스 기준으로 위치 설정)
                    var gap = annoPad;
                    if (posCode === 54616) tf.rotate(180);       // 하
                    else if (posCode === 51340) tf.rotate(90);   // 좌
                    else if (posCode === 50864) tf.rotate(-90);  // 우

                    // 위치 설정 (회전된 상태에서 바운딩 박스 기준)
                    // 시계방향 배치: 상=좌측, 우=상단, 하=우측, 좌=하단
                    // 디자인 가장자리에 가깝게
                    if (posCode === 49345) {
                        // 상: 0° — 좌측 시작, 디자인 바로 위
                        tf.left = oL;
                        tf.top = oT + gap + fontSize;
                    } else if (posCode === 54616) {
                        // 하: 180° — 우측 끝, 디자인 바로 아래
                        tf.left = oR - tf.width;
                        tf.top = oB - gap;
                    } else if (posCode === 51340) {
                        // 좌: 90° — 하단 시작, 디자인 바로 왼쪽
                        tf.left = oL - gap - tf.width;
                        tf.top = oB + tf.height;
                    } else if (posCode === 50864) {
                        // 우: -90° — 상단 시작, 디자인 바로 오른쪽
                        tf.left = oR + gap;
                        tf.top = oT;
                    }

                    try { tf.createOutline(); } catch(e) {}
                    _annoLog += " -> OK";
                } else {
                    _annoLog += " -> SKIP(margin<" + Math.round(annoPad*2) + ")";
                }
            }
        } else {
            _annoLog += ", NO TEXT";
        }
    } else {
        _annoLog += "null";
    }

    // ── 8. 진단 로그 (파일 기록) ──
    try {
        var _dbgFile = new File(_scriptDir + "/ia_debug.log");
        _dbgFile.open("a");
        _dbgFile.write("abIndex=" + abIndex
            + " design=" + Math.round(designW*mmPerPt) + "x" + Math.round(designH*mmPerPt) + "mm"
            + " margin=" + marginL + "/" + marginR + "/" + marginT + "/" + marginB
            + " offset=" + (hasOffset ? offsetMethod + " " + Math.round(offT/ptPerMm) + "mm" : "none")
            + " " + _annoLog
            + " eps=" + outputEps + "\n");
        _dbgFile.close();
    } catch(e) {}

    // ── 9. PNG 썸네일 ──
    if (outputPng) {
        doc.artboards.setActiveArtboardIndex(abIndex);
        app.redraw();
        var pngFile = new File(outputPng);
        var pngOpts = new ExportOptionsPNG24();
        pngOpts.antiAliasing = true;
        pngOpts.artBoardClipping = true;
        pngOpts.transparency = false;
        var totalW = designW + bL + bR + mL + mR + fL + fR;
        var totalH = designH + bT + bB + mT + mB + fT + fB;
        var sc = (totalW >= totalH) ? (thumbSize / totalW) : (thumbSize / totalH);
        if (sc > 1) sc = 1;
        pngOpts.horizontalScale = sc * 100;
        pngOpts.verticalScale = sc * 100;
        doc.exportFile(pngFile, ExportType.PNG24, pngOpts);
        $.writeln("ProcessOrderItem: PNG -> " + outputPng);
    }

    // ── 10. EPS 저장 (아트보드별 개별 저장) ──
    // (용준님 스크립트 2 패턴: saveMultipleArtboards + artboardRange)
    var epsFile = new File(outputEps);
    var epsOpts = new EPSSaveOptions();
    epsOpts.cmykPostScript = true;
    epsOpts.compatibility = Compatibility.ILLUSTRATOR10;
    epsOpts.preview = EPSPreview.COLORTIFF;
    epsOpts.embedAllFonts = true;
    epsOpts.saveMultipleArtboards = true;
    epsOpts.artboardRange = String(abIndex + 1);  // 1-based
    doc.saveAs(epsFile, epsOpts);
    $.writeln("ProcessOrderItem: EPS -> " + outputEps);

    // ── 11. 정리: 임시 레이어 삭제 + 아트보드 원복 + 아이템 가시성 복원 ──
    tmpTopLayer.remove();
    tmpBotLayer.remove();
    if (tmpOffsetLayer) { try { tmpOffsetLayer.remove(); } catch(e) {} }
    ab.artboardRect = [oL, oT, oR, oB];

    // 아이템 가시성 복원
    for (var ri = 0; ri < allMappedItems.length; ri++) {
        try { allMappedItems[ri].hidden = false; } catch(e) {}
    }

    doc.close(SaveOptions.DONOTSAVECHANGES);
    $.writeln("ProcessOrderItem v2 완료");
}

// 실행
var _scriptDirForLog = (typeof _ia_params_override_path !== "undefined" && _ia_params_override_path)
    ? new File(_ia_params_override_path).parent.fsName
    : new File($.fileName).parent.fsName;
try {
    main();
} catch(e) {
    var _logFile = new File(_scriptDirForLog + "/ia_error.log");
    _logFile.open("w");
    _logFile.write("JSError: " + e.message + " (line " + e.line + ")");
    _logFile.close();
    $.writeln("ProcessOrderItem EXCEPTION: " + e.message + " (line " + e.line + ")");
}
