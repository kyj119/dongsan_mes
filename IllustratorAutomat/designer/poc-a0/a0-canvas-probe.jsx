// A0 PoC — 일러 대지/문서 크기 한도 실측 (throwaway, prod 무관)
// spec Phase A0: 검토문서 타일이 대지 한도를 넘는 경계 실측 + 순차 폴백 근거
// ES3(ExtendScript) — 로그: Folder.userData/mes_a0_canvas.log + alert 요약
//
// ★실측 확정(2026-07-23, Illustrator 2026 / 30.3.0, Claude MCP): single 문서 max = 577cm (578cm FAIL).
//   → spec §6 리스크 "~577cm/227in" 확증. 16383pt ≈ 577.6cm.
// ⚠️ 원본 v1 결함 정정: artboardRect=[0,0,w,-w] 모서리 고정 확장은 '아트보드 크기 한도'가 아니라
//   '기본문서(100cm) 캔버스 좌표 범위'에 먼저 걸려 ~200cm를 오보고했다(초기 문서크기 의존).
//   실제 임포지션/검토문서는 목표크기로 문서를 '생성'하므로 documents.add 경로로 측정해야 정확.
//   교훈: 검토문서 생성기는 작은 기본문서를 리사이즈하지 말고 documents.add(목표크기)로 생성할 것.
// ⚠️ 이 스크립트는 alert()로 끝나 MCP/COM 실행 시 모달 블록→행. 디자이너 수동 실행(Ctrl+F12) 전용.
#target illustrator

(function () {
  var PT_PER_CM = 72 / 2.54;
  var log = [];
  function push(s) { log.push(s); }

  // ── (A) 단일 문서 최대 크기 (cm) — documents.add 목표크기 생성 경로 ──
  push('== A: documents.add single max ==');
  var sizes = [200, 400, 500, 550, 570, 575, 576, 577, 578, 580, 600, 700];
  var maxOk = 0;
  for (var i = 0; i < sizes.length; i++) {
    var ok = true, d = null;
    try { d = app.documents.add(DocumentColorSpace.CMYK, sizes[i] * PT_PER_CM, sizes[i] * PT_PER_CM); }
    catch (e) { ok = false; }
    if (ok && d) {
      var gotW = Math.round(d.width / PT_PER_CM);
      if (Math.abs(gotW - sizes[i]) > 2) ok = false;
      d.close(SaveOptions.DONOTSAVECHANGES);
    }
    push(sizes[i] + 'cm -> ' + (ok ? 'OK' : 'FAIL'));
    if (ok) maxOk = sizes[i]; else break; // 한도 초과 후는 전부 FAIL
  }
  push('single-doc max ~= ' + maxOk + 'cm');

  // ── (B) 타일 합산 경계 (designW cm 를 옆으로 N개, 단일 문서 폭 제약) ──
  var designW = 300; // 3m 대형 예시
  var tileMax = 0;
  push('== B: ' + designW + 'cm design, N tiles side-by-side (single doc width) ==');
  for (var n = 1; n <= 10; n++) {
    var totalW = designW * n, okT = true, dt = null;
    try { dt = app.documents.add(DocumentColorSpace.CMYK, totalW * PT_PER_CM, designW * PT_PER_CM); }
    catch (eT) { okT = false; }
    if (okT && dt) {
      var gotT = Math.round(dt.width / PT_PER_CM);
      if (Math.abs(gotT - totalW) > 2) okT = false;
      dt.close(SaveOptions.DONOTSAVECHANGES);
    }
    push('tile ' + n + ' x ' + designW + 'cm = ' + totalW + 'cm -> ' + (okT ? 'OK' : 'FAIL'));
    if (okT) tileMax = n; else break;
  }
  push('=> ' + designW + 'cm design: max ' + tileMax + ' tile(s) per doc (fallback=sequential beyond)');

  var logFile = new File(Folder.userData.fsName + '/mes_a0_canvas.log');
  logFile.encoding = 'UTF-8';
  if (logFile.open('w')) { logFile.write(log.join('\n')); logFile.close(); }
  alert('A0 canvas probe done\n\n' + log.join('\n') + '\n\nlog: ' + logFile.fsName);
})();
