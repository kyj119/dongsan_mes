#target illustrator
// MES 가공·재단 패널 — ExtendScript 부트스트랩 스텁 (PC 로컬, 이 파일은 갱신 불요)
//
// 정본 2개 = Z:\DESIGNS\IA-등록\_scripts\mes-a0-host.jsx  ·  mes-cut-host.jsx
//   → 로직은 중앙 2곳만 고치면 전 PC가 다음 패널 로드부터 반영된다.
//     (이 스텁을 두지 않으면 로직 수정마다 전 PC %APPDATA%를 다시 돌아야 함)
//   → 반영 시점 = 패널 재열기 또는 일러 재시작. 개발 중 즉시 반영은 CDP 핫스왑 참조.
//
// ★2026-08-04 패널 병합 — 껍데기는 하나가 됐지만 **호스트는 2파일 그대로**다.
//   합치지 않은 이유 = 로직이 자주 바뀌는 축이라, 파일이 나뉘어 있어야
//   재단 로직만 되돌리는 롤백이 Z: 파일 1개 교체로 끝난다(가공은 손대지 않는다).
//   둘은 같은 전역 스코프를 공유하므로 접두사(mesA0_* / mesCut_*)가 겹치면 안 된다.
//
// ⚠️ IIFE 금지 — $.evalFile은 반드시 **전역 스코프**에서 호출해야 mesA0_*·mesCut_* 가 전역에 선언된다.
//    (function(){ $.evalFile(...) })() 로 감싸면 함수가 지역에 갇혀 evalScript에서
//    "함수가 아닙니다"가 난다(2026-07-27 실제 발생). 검증 = typeof mesA0_process · typeof mesCut_ping.
// ⚠️ 한쪽 로드 실패가 다른 쪽을 막으면 안 된다 — 각각 try 로 감싸고 각자 폴백 ping 을 세운다.
//    (Z: 에 재단 호스트만 없는 중간 상태가 실제로 생긴다. 그때 가공 탭까지 죽으면 안 된다.)
//
// repo 정본 = IllustratorAutomat/designer/mes-a0-host.jsx · mes-cut-host.jsx (Z: 동기화 대상)

var MESA0_STUB_VERSION = 'stub-2.0.0';
var MESA0_CORE_PATH = 'Z:/DESIGNS/IA-등록/_scripts/mes-a0-host.jsx';
var MESA0_LOAD_ERROR = '';
var MESCUT_CORE_PATH = 'Z:/DESIGNS/IA-등록/_scripts/mes-cut-host.jsx';
var MESCUT_LOAD_ERROR = '';

var _mesA0Core = new File(MESA0_CORE_PATH);
if (_mesA0Core.exists) {
    try {
        $.evalFile(_mesA0Core); // 전역 — 감싸지 말 것
    } catch (_eMesA0) {
        MESA0_LOAD_ERROR = 'evalFile 실패: ' + _eMesA0;
    }
} else {
    MESA0_LOAD_ERROR = '정본 없음 (Z: 연결 확인): ' + MESA0_CORE_PATH;
}

var _mesCutCore = new File(MESCUT_CORE_PATH);
if (_mesCutCore.exists) {
    try {
        $.evalFile(_mesCutCore); // 전역 — 감싸지 말 것
    } catch (_eMesCut) {
        MESCUT_LOAD_ERROR = 'evalFile 실패: ' + _eMesCut;
    }
} else {
    MESCUT_LOAD_ERROR = '정본 없음 (Z: 연결 확인): ' + MESCUT_CORE_PATH;
}

// 정본 로드 실패 시 패널이 원인을 표시할 수 있게 폴백. 정상 로드면 정본 ping이 이미 있으므로 건너뛴다.
// (function 선언이 아닌 대입 — 선언은 호이스팅돼 정본 함수를 덮어쓴다)
if (typeof mesA0_ping !== 'function') {
    mesA0_ping = function () { return 'ERROR ' + (MESA0_LOAD_ERROR || 'host 미로드'); };
}
if (typeof mesCut_ping !== 'function') {
    mesCut_ping = function () { return 'ERROR ' + (MESCUT_LOAD_ERROR || 'host 미로드'); };
}
