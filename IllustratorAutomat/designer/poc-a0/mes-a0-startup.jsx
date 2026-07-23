// A0 PoC — Startup Scripts 로더 스텁 (③ 상주 도킹 검증용, throwaway)
// 설치: 이 파일을 일러 설치 폴더의  Plug-ins\Startup Scripts\  에 복사 → 일러 완전 종료 후 재시작.
//   (기본 경로 예) C:\Program Files\Adobe\Adobe Illustrator 2026\Plug-ins\Startup Scripts\
// Pass: 재시작 시 팔레트가 자동으로 뜨고 다른 패널 옆에 도킹 가능 → ScriptUI 도킹 Go(A1 착수).
// Fail(플로팅만/미표시): CEP 승격 결정(spec §8).
// 정리(테스트 후): 이 스텁을 Startup Scripts 폴더에서 제거 + 일러 재시작(팔레트 미표시 확인).
// ★필수: #targetengine(영속 엔진) 없으면 evalFile로 띄운 palette가 startup 종료 시 파괴돼 안 보임.
//   이 스텁이 일러가 직접 컴파일하는 파일이므로 여기에 지시자가 있어야 evalFile된 팔레트도 영속 엔진에서 산다.
#target illustrator
#targetengine "MES_A0"

(function () {
  // ▼▼ 로컬 설치: 이 PoC 폴더의 절대경로 (환경에 맞게 1줄만 수정) ▼▼
  var jsxPath = 'C:/Users/user/dongsan_mes/IllustratorAutomat/designer/poc-a0/a0-dock-palette.jsx';
  // ▲▲ NAS 중앙배포 검증(§⑤) 시엔 아래로 교체:
  //   var jsxPath = 'Z:/DESIGNS/IA-등록/_scripts/a0-dock-palette.jsx';

  try {
    var f = new File(jsxPath);
    if (f.exists) {
      $.evalFile(f);
    } else {
      alert('[MES A0] 팔레트 파일 없음:\n' + jsxPath);   // PoC 디버그: 경로오류 표면화(무음 skip 방지)
    }
  } catch (e) {
    alert('[MES A0] startup 오류:\n' + e);              // PoC 디버그: 로드 오류 표면화
  }
  // ⚠️ 실배포 스텁은 위 alert 2개 제거(무음) — Z: 미마운트/오류가 일러 기동을 막지 않도록.
})();
