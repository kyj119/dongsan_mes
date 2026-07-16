// MES 판짜기 — 부트스트랩 스텁 (디자이너 PC 1회 설치용)
// 정본 스크립트 = Z:\DESIGNS\IA-등록\_scripts\mes-sheet.jsx (중앙 1곳 수정 → 전 PC 즉시 반영)
// 설치: 이 파일을 Illustrator Scripts 폴더에 "MES판짜기.jsx"로 복사
// 사용: ① 빈 상태에서 실행=판 구성(대기물 선택→자동 배치) ② 조정 후 MES판_* 문서에서 재실행=판 확정
// spec: docs/superpowers/specs/2026-07-16-ia-designer-session-loop.md §11
(function () {
  var CORE = 'Z:\\DESIGNS\\IA-등록\\_scripts\\mes-sheet.jsx';
  var f = new File(CORE);
  if (!f.exists) {
    alert('MES 판짜기 정본 스크립트를 찾을 수 없습니다.\n' + CORE + '\nZ: 드라이브 연결을 확인해 주세요.');
    return;
  }
  try {
    $.evalFile(f);
  } catch (e) {
    alert('MES 판짜기 스크립트 오류: ' + e + (e.line ? ' (line ' + e.line + ')' : ''));
  }
})();
