#target illustrator
// MES 가공·재단·전사 패널 — ExtendScript 부트스트랩 스텁 (PC 로컬)
//
// 정본 = Z:\DESIGNS\IA-등록\_scripts\mes-*-host.jsx
//   → 로직은 중앙에서만 고치면 전 PC가 다음 패널 로드부터 반영된다.
//     (이 스텁을 두지 않으면 로직 수정마다 전 PC %APPDATA%를 다시 돌아야 함)
//   → 반영 시점 = 패널 재열기 또는 일러 재시작. 개발 중 즉시 반영은 CDP 핫스왑 참조.
//
// ★2026-08-04 패널 병합 — 껍데기는 하나가 됐지만 **호스트는 파일별로 그대로**다.
//   합치지 않은 이유 = 로직이 자주 바뀌는 축이라, 파일이 나뉘어 있어야
//   한 탭의 로직만 되돌리는 롤백이 Z: 파일 1개 교체로 끝난다(다른 탭은 손대지 않는다).
//   전부 같은 전역 스코프를 공유하므로 접두사(mesA0_* / mesCut_* / mesTr_*)가 겹치면 안 된다.
//
// ★2026-09-18 **손목록을 없앴다** — 이 스텁이 a0·cut **둘만** 이름으로 읽고 있어서,
//   Z: 에 배포까지 끝난 `mes-tr-host.jsx` 를 아무도 읽지 않았다. 그러면 mesTr_* 가 전역에
//   안 생기고 패널은 그걸 「Z: 를 못 읽었습니다」로 표시한다 — Z: 는 멀쩡한데 사람은
//   드라이브 연결을 확인하러 간다. `ia:deploy` 가 손목록 때문에 같은 사고를 세 번 낸 뒤
//   열거로 바꾼 것과 **같은 형태이자 네 번째**다. 그래서 여기도 폴더를 열거한다.
//   → 새 호스트를 Z: 에 배포하면 이 파일을 고치지 않아도 실린다.
//   → 게이트 = `npm run panel:smoke` §15(축2 의 mes-*-host.jsx 는 전부 스텁이 읽는가).
//
// ⚠️ IIFE 금지 — $.evalFile은 반드시 **전역 스코프**에서 호출해야 mesA0_*·mesCut_*·mesTr_* 가
//    전역에 선언된다. (function(){ $.evalFile(...) })() 로 감싸면 함수가 지역에 갇혀 evalScript에서
//    "함수가 아닙니다"가 난다(2026-07-27 실제 발생). 검증 = typeof mesA0_process · typeof mesCut_ping.
//    for/try 블록은 스코프를 만들지 않으므로 아래 반복문은 안전하다.
// ⚠️ 한쪽 로드 실패가 다른 쪽을 막으면 안 된다 — 각각 try 로 감싸고 각자 폴백 ping 을 세운다.
//    (Z: 에 재단 호스트만 없는 중간 상태가 실제로 생긴다. 그때 가공 탭까지 죽으면 안 된다.)
//
// repo 정본 = IllustratorAutomat/designer/mes-*-host.jsx (Z: 동기화 대상)

var MESA0_STUB_VERSION = 'stub-3.0.0';   // 3.0.0 = 손목록 → 폴더 열거(전사 호스트 누락 근본수정) · 2.0.0 = a0+cut 2개 고정
var MESPANEL_CORE_DIR = 'Z:/DESIGNS/IA-등록/_scripts/';

// 하위 호환 — **이름으로 읽는 쪽이 있다.** cut-main.js 는 구 호스트 감지에 MESCUT_CORE_PATH 를,
// 환경 점검(mesA0_envCheck)은 *_LOAD_ERROR 를 읽는다. 열거로 바꿔도 이 이름들은 그대로 둔다.
var MESA0_CORE_PATH = MESPANEL_CORE_DIR + 'mes-a0-host.jsx';
var MESCUT_CORE_PATH = MESPANEL_CORE_DIR + 'mes-cut-host.jsx';
var MESTR_CORE_PATH = MESPANEL_CORE_DIR + 'mes-tr-host.jsx';
var MESA0_LOAD_ERROR = '';
var MESCUT_LOAD_ERROR = '';
var MESTR_LOAD_ERROR = '';

var MESPANEL_HOSTS_LOADED = '';   // 실제로 읽은 파일 이름 — 환경 점검이 그대로 보여 준다
var _mesHostNames = [];
var _mesHostErr = {};

var _mesCoreDir = new Folder(MESPANEL_CORE_DIR);
if (_mesCoreDir.exists) {
    // ⚠️ getFiles 의 마스크에 RegExp 를 주면 안 된다(이 엔진은 문자열 마스크 또는 함수만 받는다).
    //    `.bak-*` · `mes-lock.jsx` 같은 이웃 파일이 걸리지 않도록 이름을 정확히 본다.
    var _mesFound = _mesCoreDir.getFiles(function (f) {
        return (f instanceof File) && /^mes-.+-host\.jsx$/i.test(decodeURI(f.name));
    });
    for (var _mesI = 0; _mesI < _mesFound.length; _mesI++) {
        _mesHostNames.push(decodeURI(_mesFound[_mesI].name));
    }
    _mesHostNames.sort();   // a0 → cut → tr. 서로 의존하지 않지만 순서가 매번 같아야 진단이 재현된다.
}

for (var _mesJ = 0; _mesJ < _mesHostNames.length; _mesJ++) {
    var _mesCore = new File(MESPANEL_CORE_DIR + _mesHostNames[_mesJ]);
    try {
        $.evalFile(_mesCore); // 전역 — 감싸지 말 것
        MESPANEL_HOSTS_LOADED += (MESPANEL_HOSTS_LOADED ? ',' : '') + _mesHostNames[_mesJ];
    } catch (_mesE) {
        _mesHostErr[_mesHostNames[_mesJ]] = 'evalFile 실패: ' + _mesE;
    }
}

/** 그 호스트가 왜 없는가 — 「파일이 없다」와 「읽다 죽었다」는 조치가 다르다. */
function _mesStubLoadError(name, fullPath) {
    if (_mesHostErr[name]) return _mesHostErr[name];
    for (var i = 0; i < _mesHostNames.length; i++) {
        if (_mesHostNames[i] === name) return '';
    }
    return '정본 없음 (Z: 연결 확인): ' + fullPath;
}

MESA0_LOAD_ERROR = _mesStubLoadError('mes-a0-host.jsx', MESA0_CORE_PATH);
MESCUT_LOAD_ERROR = _mesStubLoadError('mes-cut-host.jsx', MESCUT_CORE_PATH);
MESTR_LOAD_ERROR = _mesStubLoadError('mes-tr-host.jsx', MESTR_CORE_PATH);

// 정본 로드 실패 시 패널이 원인을 표시할 수 있게 폴백. 정상 로드면 정본 ping이 이미 있으므로 건너뛴다.
// (function 선언이 아닌 대입 — 선언은 호이스팅돼 정본 함수를 덮어쓴다)
if (typeof mesA0_ping !== 'function') {
    mesA0_ping = function () { return 'ERROR ' + (MESA0_LOAD_ERROR || 'host 미로드'); };
}
if (typeof mesCut_ping !== 'function') {
    mesCut_ping = function () { return 'ERROR ' + (MESCUT_LOAD_ERROR || 'host 미로드'); };
}
if (typeof mesTr_ping !== 'function') {
    mesTr_ping = function () { return 'ERROR ' + (MESTR_LOAD_ERROR || 'host 미로드'); };
}
