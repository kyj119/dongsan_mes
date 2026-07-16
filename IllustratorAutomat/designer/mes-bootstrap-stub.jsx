// MES 가공 — 부트스트랩 스텁 (디자이너 PC 1회 설치용)
// 정본 스크립트 = Z:\DESIGNS\IA-등록\_scripts\mes-core.jsx (중앙 1곳 수정 → 전 PC 즉시 반영)
// 설치: 이 파일을 Illustrator Scripts 폴더에 "MES가공.jsx"로 복사
//   예) C:\Program Files\Adobe\Adobe Illustrator <버전>\Presets\ko_KR\Scripts\
//   실행: File > Scripts > MES가공  (핫키는 액션 Insert Menu Item 또는 헬퍼로 연결)
// spec: docs/superpowers/specs/2026-07-16-ia-designer-session-loop.md §4.1
(function () {
  var CORE = 'Z:\\DESIGNS\\IA-등록\\_scripts\\mes-core.jsx'; // Z:\DESIGNS\IA-등록\_scripts\mes-core.jsx
  var f = new File(CORE);
  if (!f.exists) {
    alert('MES 가공 정본 스크립트를 찾을 수 없습니다.\n' + CORE + '\nZ: 드라이브 연결을 확인해 주세요.');
    // "MES 가공 정본 스크립트를 찾을 수 없습니다. … Z: 드라이브 연결을 확인해 주세요."
    return;
  }
  try {
    $.evalFile(f);
  } catch (e) {
    alert('MES 가공 스크립트 오류: ' + e + (e.line ? ' (line ' + e.line + ')' : ''));
  }
})();
