// A0 PoC — 일러 대지/아트보드 크기 한도 실측 (throwaway, prod 무관)
// spec Phase A0: 검토문서 타일이 대지 한도를 넘는 경계 실측 + 순차 폴백 근거
// ES3(ExtendScript) — 로그: Folder.userData/mes_a0_canvas.log + alert 요약
#target illustrator

(function () {
  var PT_PER_CM = 72 / 2.54;
  var log = [];
  function push(s) { log.push(s); }

  var doc = app.documents.add(DocumentColorSpace.CMYK, 100 * PT_PER_CM, 100 * PT_PER_CM);

  // ── 단일 아트보드 최대 폭 탐색 (cm) ──
  var sizes = [200, 400, 500, 550, 570, 577, 580, 600, 700, 800, 1000];
  var maxOk = 0;
  for (var i = 0; i < sizes.length; i++) {
    var wpt = sizes[i] * PT_PER_CM;
    var ok = true;
    try { doc.artboards[0].artboardRect = [0, 0, wpt, -wpt]; } catch (e) { ok = false; }
    if (ok) {
      var ab = doc.artboards[0].artboardRect;
      var gotW = Math.round((ab[2] - ab[0]) / PT_PER_CM);
      if (Math.abs(gotW - sizes[i]) > 2) ok = false;
    }
    push(sizes[i] + 'cm -> ' + (ok ? 'OK' : 'FAIL'));
    if (ok) maxOk = sizes[i];
  }
  push('single-artboard max ~= ' + maxOk + 'cm');

  // ── 타일 합산 경계 (designW cm 를 옆으로 N개) ──
  var designW = 300; // 3m 대형 예시
  var tileMax = 0;
  for (var n = 1; n <= 10; n++) {
    var totalW = designW * n;
    var okT = true;
    try { doc.artboards[0].artboardRect = [0, 0, totalW * PT_PER_CM, -designW * PT_PER_CM]; }
    catch (eT) { okT = false; }
    if (okT) {
      var ab2 = doc.artboards[0].artboardRect;
      var gotT = Math.round((ab2[2] - ab2[0]) / PT_PER_CM);
      if (Math.abs(gotT - totalW) > 2) okT = false;
    }
    push('tile ' + n + ' x ' + designW + 'cm = ' + totalW + 'cm -> ' + (okT ? 'OK' : 'FAIL'));
    if (okT) tileMax = n; else break;
  }
  push('=> ' + designW + 'cm design: max ' + tileMax + ' tiles (fallback=sequential beyond)');

  doc.close(SaveOptions.DONOTSAVECHANGES);

  var logFile = new File(Folder.userData.fsName + '/mes_a0_canvas.log');
  logFile.encoding = 'UTF-8';
  if (logFile.open('w')) { logFile.write(log.join('\n')); logFile.close(); }
  alert('A0 canvas probe done\n\n' + log.join('\n') + '\n\nlog: ' + logFile.fsName);
})();
