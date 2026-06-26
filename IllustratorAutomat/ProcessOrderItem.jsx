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
    var passthroughThumb = _p.passthroughThumb || false;  // 완성본 직접연결: 가공 없이 PNG 썸네일만 생성
    var trim         = _p.trim       || false;  // N5: 단일 그룹 돔보 마크 (출력 둘레)
    var rotation     = _p.rotation   || 0;       // ⑥ 디자인 아트워크 회전 (0/90/180/270, 0=무동작)
    var targetW      = _p.targetW    || 0;       // N4 fidelity: 목표 너비(cm, 캔버스 리사이즈). 0=스케일 안 함
    var targetH      = _p.targetH    || 0;       // N4 fidelity: 목표 높이(cm)
    var outputDxf    = _p.dxfOutput  || "";      // Export: 재단선 DXF (선택, 주문 가공은 미지정 → 스킵)
    var outputJpg    = _p.jpgOutput  || "";      // Export: 미리보기 JPG (선택, 주문 가공은 미지정 → 스킵)
    var preview      = _p.preview    || false;   // ③ 미리보기 모드: 가공 전부 수행하되 EPS/DXF saveAs만 스킵, JPG만 export

    if (!sourceFile || (!outputEps && !passthroughThumb && !preview)) {
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

    // ── 완성본 passthrough: 가공 전부 스킵, PNG 썸네일만 export (EPS는 C#이 원본 그대로 복사) ──
    if (passthroughThumb) {
        try {
            doc.artboards.setActiveArtboardIndex(abIndex);
            app.redraw();
            if (outputPng) {
                var _ptR = doc.artboards[abIndex].artboardRect;
                var _ptLong = Math.max(Math.abs(_ptR[2] - _ptR[0]), Math.abs(_ptR[1] - _ptR[3]));
                var _ptSc = (_ptLong > 0) ? (thumbSize / _ptLong) : 1;
                var _ptOpts = new ExportOptionsPNG24();
                _ptOpts.antiAliasing = true;
                _ptOpts.artBoardClipping = true;
                _ptOpts.horizontalScale = _ptSc * 100;
                _ptOpts.verticalScale = _ptSc * 100;
                doc.exportFile(new File(outputPng), ExportType.PNG24, _ptOpts);
                $.writeln("ProcessOrderItem passthroughThumb: PNG -> " + outputPng);
            }
        } catch (ePt) { $.writeln("passthroughThumb 오류: " + ePt); }
        try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {}
        return;
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

    // ── 2b-rot. 디자인 아트워크 회전 (⑥, 목표 스케일·마감 이전) ──
    // SheetLayout.jsx rotate(-pl.rotation) 패턴 포팅: 프론트/Konva는 화면 CW, Illustrator rotate는 CCW → -rotation.
    // 현재 아트보드 top items를 그룹화 → 그룹 중심 기준 회전 → ungroup 후 회전 결과로 bbox(oL/oT/oR/oB·designW/H) 재계산.
    // 90/270이면 회전된 geometricBounds가 곧 가로↔세로 swap된 결과 → 아트보드 rect 재설정으로 자연 반영.
    // rotation 0이면 완전 무동작(기존 경로·주문 가공 회귀 0).
    var _rotNorm = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;  // 0/90/180/270로 정규화
    if (_rotNorm !== 0) {
        try {
            doc.selection = null;
            doc.artboards.setActiveArtboardIndex(abIndex);
            doc.selectObjectsOnActiveArtboard();
            if (doc.selection && doc.selection.length > 0) {
                var _rgrp = false;
                if (doc.selection.length > 1) { app.executeMenuCommand('group'); _rgrp = true; }
                var rg = doc.selection[0];
                rg.rotate(-_rotNorm);   // 아이템 중심 기준 (AI 기본 앵커=중심) — CW 의도 → -각도
                if (_rgrp) app.executeMenuCommand('ungroup');
                doc.selection = null;
                // 회전 결과로 아트보드 바운드 재계산 (좌상단 앵커 유지)
                doc.artboards.setActiveArtboardIndex(abIndex);
                doc.selectObjectsOnActiveArtboard();
                var rbL = null, rbT = null, rbR = null, rbB = null;
                for (var rbi = 0; rbi < doc.selection.length; rbi++) {
                    var gb = doc.selection[rbi].geometricBounds; // [left, top, right, bottom]
                    if (rbL === null) { rbL = gb[0]; rbT = gb[1]; rbR = gb[2]; rbB = gb[3]; }
                    else {
                        if (gb[0] < rbL) rbL = gb[0];
                        if (gb[1] > rbT) rbT = gb[1];
                        if (gb[2] > rbR) rbR = gb[2];
                        if (gb[3] < rbB) rbB = gb[3];
                    }
                }
                doc.selection = null;
                if (rbL !== null) {
                    // 좌상단(oL,oT) 고정 → 회전 후 폭/높이를 그 자리에서 재배치
                    var newW = Math.abs(rbR - rbL);
                    var newH = Math.abs(rbT - rbB);
                    oR = oL + newW; oB = oT - newH;
                    designW = newW; designH = newH;
                    ab.artboardRect = [oL, oT, oR, oB];
                    // 회전된 아트워크를 좌상단 앵커로 이동 (그룹 중심 회전으로 위치가 틀어졌을 수 있음)
                    var _dx = oL - rbL, _dy = oT - rbT;
                    if (Math.abs(_dx) > 0.01 || Math.abs(_dy) > 0.01) {
                        doc.artboards.setActiveArtboardIndex(abIndex);
                        doc.selectObjectsOnActiveArtboard();
                        for (var rmi = 0; rmi < doc.selection.length; rmi++) {
                            try { doc.selection[rmi].translate(_dx, _dy); } catch (eT) {}
                        }
                        doc.selection = null;
                    }
                    // 90/270이면 targetW/H swap(목표가 검출 종횡비 기준이므로 가로↔세로 매핑)
                    if (_rotNorm === 90 || _rotNorm === 270) {
                        var _sw = targetW; targetW = targetH; targetH = _sw;
                    }
                    $.writeln("ProcessOrderItem: 회전 " + _rotNorm + "° -> design "
                        + Math.round(designW * mmPerPt) + "x" + Math.round(designH * mmPerPt) + "mm");
                }
            }
        } catch (eRot) { $.writeln("ProcessOrderItem: 회전 실패 - " + eRot); }
    }

    // ── 2c. 목표 크기 스케일 (N4 fidelity: 캔버스 리사이즈 반영) ──
    // 검출 크기와 다른 목표가 오면 아트보드 아트워크를 그룹으로 묶어 목표 W×H로 비균등 스케일(좌상단 앵커).
    // 목표가 0이거나 검출과 같으면 스킵(기존 동작 보존 = 비-캔버스 주문 무영향).
    if (targetW > 0 && targetH > 0) {
        var tW_pt = targetW * 10.0 * ptPerMm / scaleFactor;
        var tH_pt = targetH * 10.0 * ptPerMm / scaleFactor;
        if (Math.abs(tW_pt - designW) > 1 || Math.abs(tH_pt - designH) > 1) {
            try {
                doc.selection = null;
                doc.artboards.setActiveArtboardIndex(abIndex);
                doc.selectObjectsOnActiveArtboard();
                if (doc.selection && doc.selection.length > 0) {
                    var _grp = false;
                    if (doc.selection.length > 1) { app.executeMenuCommand('group'); _grp = true; }
                    var tg = doc.selection[0];
                    var aL = tg.left, aT = tg.top;
                    tg.width = tW_pt;
                    tg.height = tH_pt;
                    tg.left = aL; tg.top = aT;   // 좌상단 앵커 유지
                    if (_grp) app.executeMenuCommand('ungroup');
                    doc.selection = null;
                    // 아트보드/디자인 바운드 갱신 (좌상단 고정)
                    ab.artboardRect = [oL, oT, oL + tW_pt, oT - tH_pt];
                    oR = oL + tW_pt; oB = oT - tH_pt;
                    designW = tW_pt; designH = tH_pt;
                    $.writeln("ProcessOrderItem: 목표 크기 스케일 -> " + targetW + "x" + targetH + "cm");
                }
            } catch (eScale) { $.writeln("ProcessOrderItem: 목표 스케일 실패 - " + eScale); }
        }
    }

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
    // 소스가 실물의 1/N 축소본이면 여백(블리드)도 ÷scaleFactor로 보정(target·offset·돔보와 일관). scale=1=무변화.
    var mL = marginL * 10.0 * ptPerMm / scaleFactor;
    var mR = marginR * 10.0 * ptPerMm / scaleFactor;
    var mT = marginT * 10.0 * ptPerMm / scaleFactor;
    var mB = marginB * 10.0 * ptPerMm / scaleFactor;

    // ── 3b. 마감방식(finishing) 여백 계산 (cm → pt) ──
    // 마감 여백 = 빈 공간 확장 (bleed와 다름: 디자인 확장 아님)
    // 소스가 실물의 1/N 축소본이면 마감 여백도 ÷scaleFactor로 보정(실물 마감 cm을 축소본 좌표로 환산). scale=1=무변화.
    var fT = 0, fB = 0, fL = 0, fR = 0;
    var hasFinishing = false;
    if (finishingCfg) {
        fT = (finishingCfg.top && finishingCfg.top.margin_cm) ? finishingCfg.top.margin_cm * 10.0 * ptPerMm / scaleFactor : 0;
        fB = (finishingCfg.bottom && finishingCfg.bottom.margin_cm) ? finishingCfg.bottom.margin_cm * 10.0 * ptPerMm / scaleFactor : 0;
        fL = (finishingCfg.left && finishingCfg.left.margin_cm) ? finishingCfg.left.margin_cm * 10.0 * ptPerMm / scaleFactor : 0;
        fR = (finishingCfg.right && finishingCfg.right.margin_cm) ? finishingCfg.right.margin_cm * 10.0 * ptPerMm / scaleFactor : 0;
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

    // 재단선 (여백 0인 변 생략, 세그먼트 연결) — W7: 둘레 재단선은 돔보(trim) 켤 때만 생성.
    // 마감 접는선(§5a-2 foldlines)은 마감 설정 따라 별개 유지(돔보 무관).
    if (trim) {
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
    } // end if(trim) — 둘레 재단선(cutlines)

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

    // ── 9.5 돔보 마크 (단일 그룹 출력 둘레, K100 채움 원) — SheetLayout.jsx 포팅 ──
    // 출력 바운드(여백·도련 포함 = 현재 artboardRect)의 1cm 바깥 꼭짓점 + 방향마크 + 50cm 중간마크.
    // PNG(썸네일) 이후·EPS 이전에 그려 썸네일엔 빠지고 EPS엔 포함. 아트보드를 마크 포함해 확장.
    if (trim) {
        var DOMBO_DIAM  = 6 * ptPerMm / scaleFactor;    // 6mm
        var CORNER_DIST = 10 * ptPerMm / scaleFactor;   // 꼭짓점 대각 1cm 바깥
        var DIR_OFFSET  = 60 * ptPerMm / scaleFactor;   // 방향마크 6cm
        var MAX_GAP     = 500 * ptPerMm / scaleFactor;  // 50cm 간격 보정
        var _dCol = new CMYKColor(); _dCol.cyan = 0; _dCol.magenta = 0; _dCol.yellow = 0; _dCol.black = 100;
        function _mkDombo(cx, cy) {
            var el = doc.pathItems.ellipse(cy + DOMBO_DIAM / 2, cx - DOMBO_DIAM / 2, DOMBO_DIAM, DOMBO_DIAM);
            el.filled = true; el.fillColor = _dCol; el.stroked = false; return el;
        }
        function _interDombo(from, to, fixed, horiz) {
            var span = Math.abs(to - from); if (span <= MAX_GAP) return;
            var divs = Math.ceil(span / MAX_GAP), step = span / divs, mn = Math.min(from, to);
            for (var d = 1; d < divs; d++) { var pos = mn + step * d; if (horiz) _mkDombo(pos, fixed); else _mkDombo(fixed, pos); }
        }
        var _tr = ab.artboardRect;  // 여백·도련 확장 반영된 출력 바운드
        var tL = _tr[0], tT = _tr[1], tR = _tr[2], tB = _tr[3];
        _mkDombo(tL - CORNER_DIST, tT + CORNER_DIST); // 좌상
        _mkDombo(tR + CORNER_DIST, tT + CORNER_DIST); // 우상
        _mkDombo(tL - CORNER_DIST, tB - CORNER_DIST); // 좌하
        _mkDombo(tR + CORNER_DIST, tB - CORNER_DIST); // 우하
        _mkDombo(tL + DIR_OFFSET, tT + CORNER_DIST);  // 방향 마크(상단)
        _interDombo(tL - CORNER_DIST, tR + CORNER_DIST, tT + CORNER_DIST, true);  // 상
        _interDombo(tL - CORNER_DIST, tR + CORNER_DIST, tB - CORNER_DIST, true);  // 하
        _interDombo(tT + CORNER_DIST, tB - CORNER_DIST, tL - CORNER_DIST, false); // 좌
        _interDombo(tT + CORNER_DIST, tB - CORNER_DIST, tR + CORNER_DIST, false); // 우
        var _pad = CORNER_DIST + DOMBO_DIAM;
        ab.artboardRect = [tL - CORNER_DIST - _pad, tT + CORNER_DIST + _pad, tR + CORNER_DIST + _pad, tB - CORNER_DIST - _pad];
        app.redraw();
        $.writeln("ProcessOrderItem: 돔보 마크 배치 + 아트보드 확장");
    }

    // ── 10. EPS 저장 (아트보드별 개별 저장) ──
    // (용준님 스크립트 2 패턴: saveMultipleArtboards + artboardRange)
    // ③ preview 모드면 EPS saveAs 스킵(가공·돔보·회전·스케일은 전부 수행, JPG만 export).
    if (!preview && outputEps) {
        var epsFile = new File(outputEps);
        var epsOpts = new EPSSaveOptions();
        epsOpts.cmykPostScript = true;
        epsOpts.compatibility = Compatibility.ILLUSTRATOR10;
        epsOpts.preview = EPSPreview.COLORTIFF;
        epsOpts.embedAllFonts = true;
        // 단일 아트보드만 클리핑 저장하기 위함(doc은 다중 아트보드). ⚠️ Illustrator가 파일명에 아트보드
        // suffix(_design_N / 아트보드명 없으면 -01)를 강제로 붙임 → Program.cs NormalizeArtboardEpsName이 정규명으로 보정.
        // false로 끄지 말 것: 전체 문서가 EPS로 나가 오작동.
        epsOpts.saveMultipleArtboards = true;
        epsOpts.artboardRange = String(abIndex + 1);  // 1-based
        doc.saveAs(epsFile, epsOpts);
        $.writeln("ProcessOrderItem: EPS -> " + outputEps);
    }

    // ── 10-1. JPG 미리보기 (Export 경로 전용, SheetLayout.jsx 패턴 이식) ──
    // outputJpg 미지정(주문 가공) → 스킵. saveAs(EPS) 직후 doc는 닫히지 않음 → 그대로 export 가능.
    if (outputJpg) {
        try {
            doc.artboards.setActiveArtboardIndex(abIndex);
            app.redraw();
            var jpgFile = new File(outputJpg);
            var jpgOpts = new ExportOptionsJPEG();
            jpgOpts.qualitySetting = 80;
            jpgOpts.resolution = 150;
            jpgOpts.antiAliasing = true;
            jpgOpts.artBoardClipping = true;
            jpgOpts.horizontalScale = 100;
            jpgOpts.verticalScale = 100;
            doc.exportFile(jpgFile, ExportType.JPEG, jpgOpts);
            $.writeln("ProcessOrderItem: JPG -> " + outputJpg);
        } catch (eJpg) { $.writeln("ProcessOrderItem JPG WARNING: " + eJpg); }
    }

    // ── 10-2. DXF 재단선 (Export 경로 전용, SheetLayout.jsx 패턴 이식) ──
    // outputDxf 미지정(주문 가공)·preview 모드 → 스킵. 임시 재단선/돔보 레이어가 아직 살아있는 시점(정리 전)에 export.
    // W7: DXF(재단기용)는 돔보(trim) 켤 때만 생성 — 돔보 없으면 둘레 재단선·DXF 불필요.
    if (outputDxf && !preview && trim) {
        try {
            doc.artboards.setActiveArtboardIndex(abIndex);
            var dxfFile = new File(outputDxf);
            var dxfOpts = new ExportOptionsAutoCAD();
            dxfOpts.exportFileFormat = AutoCADExportFileFormat.DXF;
            dxfOpts.version = AutoCADCompatibility.AutoCADRelease21;
            dxfOpts.unit = AutoCADUnit.Millimeters;
            dxfOpts.scaleLineweights = false; // 선 두께 스케일링 비활성화 (0으로 축소 방지)
            try { dxfOpts.exportOption = AutoCADExportOption.MaximumEditability; } catch (eDxfOpt) {}
            doc.exportFile(dxfFile, ExportType.AUTOCAD, dxfOpts);
            $.writeln("ProcessOrderItem: DXF -> " + outputDxf);
        } catch (eDxf) { $.writeln("ProcessOrderItem DXF WARNING: " + eDxf); }
    }

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
