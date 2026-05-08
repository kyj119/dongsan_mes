/*
 * TestClipExtract.jsx — 클리핑마스크 방식 디자인 추출 테스트 v3
 *
 * 방식: 원본 복사본을 열고, 클리핑마스크 사각형을 만들어서 영역 잘라내기
 *       복사/붙여넣기 없이 원본 위에서 직접 작업
 */

#target illustrator

app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

var PT_PER_MM = 2.834645669;

var SOURCE = "Z:/Designs/IllustratorAutomat/_test_clip/test_source.eps";
var OUTPUT_DIR = "Z:/Designs/IllustratorAutomat/_test_clip";
var PREFIX = "clip_test";

var REGIONS = [
    { left: 758.9, top: -552.7, right: 1238.9, bottom: -879.3 },
    { left: 758.9, top: -911.1, right: 1238.9, bottom: -1141.1 },
    { left: 758.9, top: -1173.0, right: 1238.9, bottom: -1403.0 }
];

function main() {
    var outFolder = new Folder(OUTPUT_DIR);
    if (!outFolder.exists) outFolder.create();

    var logFile = new File(OUTPUT_DIR + "/test_log.txt");
    logFile.encoding = "UTF-8";
    logFile.open("w");

    function log(msg) {
        logFile.writeln(msg);
        $.writeln(msg);
    }

    log("=== TestClipExtract v3 ===");
    log("원본: " + SOURCE);
    log("영역: " + REGIONS.length + "개");

    var sourceFile = new File(SOURCE);
    if (!sourceFile.exists) {
        log("ERROR: 원본 없음");
        logFile.close();
        alert("원본 파일 없음:\n" + SOURCE);
        return;
    }

    var results = [];

    for (var r = 0; r < REGIONS.length; r++) {
        var region = REGIONS[r];
        var rgn_w = region.right - region.left;
        var rgn_h = region.top - region.bottom;
        log("\n--- 영역 " + r + " (" + Math.round(rgn_w) + "x" + Math.round(rgn_h) + "mm) ---");

        try {
            // 매 영역마다 원본을 새로 열기 (원본 보호)
            var doc = app.open(sourceFile);
            log("  파일 열림: " + doc.pageItems.length + "개 아이템");

            // pt 변환
            var left_pt = region.left * PT_PER_MM;
            var top_pt = region.top * PT_PER_MM;
            var width_pt = rgn_w * PT_PER_MM;
            var height_pt = rgn_h * PT_PER_MM;
            var right_pt = region.right * PT_PER_MM;
            var bottom_pt = region.bottom * PT_PER_MM;

            // 1. 클리핑마스크 사각형 생성 (영역 좌표에 맞춰)
            var clipRect = doc.pathItems.rectangle(
                top_pt,     // top (Illustrator 좌표)
                left_pt,    // left
                width_pt,   // width
                height_pt   // height
            );
            clipRect.stroked = false;
            clipRect.filled = false;
            clipRect.name = "ClipMask";
            log("  클리핑 사각형 생성: " + Math.round(left_pt) + "," + Math.round(top_pt) + " " + Math.round(width_pt) + "x" + Math.round(height_pt) + "pt");

            // 2. 전체 선택 → 그룹
            app.activeDocument = doc;
            app.executeMenuCommand("selectall");
            app.executeMenuCommand("group");
            log("  전체 그룹화 완료");

            // 3. 클리핑마스크를 그룹 맨 앞으로
            var grp = doc.pageItems[0];
            if (grp.typename === "GroupItem") {
                // ClipMask 찾아서 맨 앞으로
                for (var gi = 0; gi < grp.pageItems.length; gi++) {
                    if (grp.pageItems[gi].name === "ClipMask") {
                        grp.pageItems[gi].move(grp, ElementPlacement.PLACEATBEGINNING);
                        break;
                    }
                }
                grp.pageItems[0].clipping = true;
                grp.clipped = true;
                log("  클리핑 적용");
            } else {
                log("  WARNING: 그룹화 실패 - " + grp.typename);
            }

            // 4. 아트보드를 영역 크기로 설정
            doc.artboards[0].artboardRect = [left_pt, top_pt, right_pt, bottom_pt];
            log("  아트보드 조정");

            // 5. EPS 저장
            var epsName = PREFIX + "_" + r + ".eps";
            var epsFile = new File(OUTPUT_DIR + "/" + epsName);
            var epsOpts = new EPSSaveOptions();
            epsOpts.compatibility = Compatibility.ILLUSTRATOR10;
            epsOpts.preview = EPSPreview.COLORTIFF;
            doc.saveAs(epsFile, epsOpts);
            log("  EPS 저장: " + epsName);

            // 6. PNG 미리보기
            var pngName = PREFIX + "_" + r + ".png";
            var pngFile = new File(OUTPUT_DIR + "/" + pngName);
            var pngOpts = new ExportOptionsPNG24();
            pngOpts.artBoardClipping = true;
            pngOpts.horizontalScale = 50;
            pngOpts.verticalScale = 50;
            doc.exportFile(pngFile, ExportType.PNG24, pngOpts);
            log("  PNG 저장: " + pngName);

            results.push({ index: r, status: "ok" });
            doc.close(SaveOptions.DONOTSAVECHANGES);

        } catch (e) {
            log("  ERROR: " + e.message + " (line " + e.line + ")");
            results.push({ index: r, status: "error", error: e.message });
            try { app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
        }
    }

    var ok = 0;
    for (var i = 0; i < results.length; i++) { if (results[i].status === "ok") ok++; }

    log("\n=== 완료: " + ok + "/" + REGIONS.length + " 성공 ===");
    logFile.close();
    alert("완료!\n" + ok + "/" + REGIONS.length + " 성공\n\n출력: " + OUTPUT_DIR);
}

main();
