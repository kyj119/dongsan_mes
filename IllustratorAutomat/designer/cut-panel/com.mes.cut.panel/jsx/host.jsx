#target illustrator
// MES 재단 패널 — ExtendScript 부트스트랩 스텁 (PC 로컬, 이 파일은 갱신 불요)
//
// 정본 = Z:\DESIGNS\IA-등록\_scripts\mes-cut-host.jsx
//   → 로직은 중앙 1곳만 고치면 전 PC가 다음 패널 로드부터 반영된다.
//   → 반영 시점 = 패널 재열기 또는 일러 재시작. 개발 중 즉시 반영은 CDP 핫스왑 참조.
//
// ⚠️ IIFE 금지 — $.evalFile은 반드시 **전역 스코프**에서 호출해야 mesCut_* 가 전역에 선언된다.
//    (function(){ $.evalFile(...) })() 로 감싸면 함수가 지역에 갇혀 evalScript에서
//    "함수가 아닙니다"가 난다(A0 에서 2026-07-27 실제 발생). 검증 = typeof mesCut_ping.
//
// ⚠️ 함수 접두사는 반드시 mesCut_* — A0 의 mesA0_* 와 **같은 전역 스코프를 공유**하므로
//    이름이 겹치면 나중에 로드된 쪽이 상대를 덮어써 A0 가 깨진다(병합 보존 제약, spec §5.3).
//
// repo 정본 = IllustratorAutomat/designer/mes-cut-host.jsx (Z: 동기화 대상)

var MESCUT_STUB_VERSION = 'stub-1.0.0';
var MESCUT_CORE_PATH = 'Z:/DESIGNS/IA-등록/_scripts/mes-cut-host.jsx';
var MESCUT_LOAD_ERROR = '';

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
if (typeof mesCut_ping !== 'function') {
    mesCut_ping = function () { return 'ERROR ' + (MESCUT_LOAD_ERROR || 'host 미로드'); };
}
