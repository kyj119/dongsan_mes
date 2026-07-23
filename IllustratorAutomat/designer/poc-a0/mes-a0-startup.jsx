// A0 PoC — Startup Scripts 로더 스텁 (③ 상주 도킹 검증용, throwaway)
// 설치: 이 파일을 일러 설치 폴더의  Plug-ins\Startup Scripts\  에 복사 → 일러 완전 종료 후 재시작.
//   (기본 경로 예) C:\Program Files\Adobe\Adobe Illustrator 2026\Plug-ins\Startup Scripts\
// Pass: 재시작 시 팔레트가 자동으로 뜨고 다른 패널 옆에 도킹 가능 → ScriptUI 도킹 Go(A1 착수).
// Fail(플로팅만/미표시): CEP 승격 결정(spec §8).
// 정리(테스트 후): 이 스텁을 Startup Scripts 폴더에서 제거 + 일러 재시작(팔레트 미표시 확인).
#target illustrator

(function () {
  // ▼▼ 로컬 설치: 이 PoC 폴더의 절대경로 (환경에 맞게 1줄만 수정) ▼▼
  var jsxPath = 'C:/Users/user/dongsan_mes/IllustratorAutomat/designer/poc-a0/a0-dock-palette.jsx';
  // ▲▲ NAS 중앙배포 검증(§⑤) 시엔 아래로 교체:
  //   var jsxPath = 'Z:/DESIGNS/IA-등록/_scripts/a0-dock-palette.jsx';

  try {
    var f = new File(jsxPath);
    if (f.exists) {            // Z: 미마운트/경로오류 시 조용히 skip (spec §6 리스크 J)
      $.evalFile(f);
    }
  } catch (e) { /* startup은 실패해도 일러 기동을 막지 않도록 무음 */ }
})();
