// A0 PoC — MES 팔레트 상주 도킹 검증 (throwaway, prod 무관)
// spec: docs/superpowers/specs/2026-07-23-ia-palette-session-loop.md Phase A0
// 검증: ① ScriptUI palette 도킹 ② $.evalFile NAS 업데이트 모델 ③ 가공자 드롭다운+로컬 영속
// ES3(ExtendScript) — UTF-8. 한글 리터럴 없음(roster는 a0-roster.json UTF-8에서 로드).
#target illustrator

(function () {
  var VERSION = 'A0-0.1';

  function scriptDir() {
    try { return new File($.fileName).parent; } catch (e) { return Folder.current; }
  }
  function readUtf8(path) {
    var f = new File(path);
    if (!f.exists) return null;
    f.encoding = 'UTF-8';
    if (!f.open('r')) return null;
    var s = f.read(); f.close(); return s;
  }

  // ── 가공자 roster 로드 (a0-roster.json, 없으면 폴백) ──
  var roster = ['designer1', 'designer2'];
  try {
    var rj = readUtf8(scriptDir().fsName + '/a0-roster.json');
    if (rj) {
      var parsed = eval('(' + rj + ')');
      if (parsed && parsed.designers && parsed.designers.length) roster = parsed.designers;
    }
  } catch (eR) {}

  // ── 선택 가공자 로컬 영속 (재시작 유지 검증) ──
  var settingsFile = new File(Folder.userData.fsName + '/mes_a0_palette.txt');
  function loadSel() {
    try {
      if (settingsFile.exists) {
        settingsFile.encoding = 'UTF-8';
        if (settingsFile.open('r')) { var v = settingsFile.read(); settingsFile.close(); return v; }
      }
    } catch (e) {}
    return '';
  }
  function saveSel(name) {
    try {
      settingsFile.encoding = 'UTF-8';
      if (settingsFile.open('w')) { settingsFile.write(name); settingsFile.close(); }
    } catch (e) {}
  }

  // ── 팔레트 (도킹 검증 핵심) ──
  var pal = new Window('palette', 'MES ' + VERSION, undefined, { resizeable: true });
  pal.orientation = 'column';
  pal.alignChildren = ['fill', 'top'];
  pal.margins = 10;

  var row1 = pal.add('group'); row1.orientation = 'row';
  row1.add('statictext', undefined, 'worker:');
  var ddl = row1.add('dropdownlist', undefined, roster);
  ddl.preferredSize.width = 150;

  var saved = loadSel();
  var initIdx = 0;
  for (var i = 0; i < roster.length; i++) { if (roster[i] === saved) { initIdx = i; break; } }
  ddl.selection = initIdx;
  ddl.onChange = function () { if (ddl.selection) saveSel(ddl.selection.text); };

  pal.add('statictext', undefined, 'persisted: ' + (saved || '(none)'));

  var btns = pal.add('group'); btns.orientation = 'row';
  var bProc = btns.add('button', undefined, 'process (test)');
  var bSheet = btns.add('button', undefined, 'sheet (test)');
  bProc.onClick = function () {
    alert('process OK\nworker=' + (ddl.selection ? ddl.selection.text : '?') +
      '\ndoc=' + (app.documents.length ? app.activeDocument.name : '(none)'));
  };
  bSheet.onClick = function () { alert('sheet OK'); };

  pal.add('statictext', undefined, 'roster:' + roster.length + ' | update:re-run stub');

  pal.layout.layout(true);
  pal.show();
})();
