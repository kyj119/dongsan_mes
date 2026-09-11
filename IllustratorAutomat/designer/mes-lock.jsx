/**
 * MES 호스트 잠금 — CEP 패널 간 공용 모듈 (Z: 배포 = 축2)
 *
 * 정본 위치 = Z:\DESIGNS\IA-등록\_scripts\mes-lock.jsx
 *   A0 호스트(mes-a0-host.jsx)와 재단 호스트(mes-cut-host.jsx)가 **둘 다 이 파일을 $.evalFile** 한다.
 *   각자 복제하면 파일 형식이 어긋나는 순간 조용히 깨지므로(둘 다 "잠금 없음"으로 보게 된다) 정본을 하나로 둔다.
 *
 * ★왜 파일인가 (2026-07-31 실측):
 *   CEP 는 **확장마다 별도 ExtendScript 엔진**을 쓴다. A0 패널에서 심은 `$.global.mesHostLock` 이
 *   재단 패널에서 `undefined` 로 보였고(양방향 확인), 함수도 서로 안 보인다.
 *   ⇒ 확장 간 상태 공유는 전역으로 불가능하다. 파일로 매개한다.
 *
 * 범위 = **PC 로컬(%TEMP%)**. Z: 에 두면 다른 PC 의 일러까지 잠긴다 —
 *   잠글 대상은 "이 PC 의 일러 1개" 이지 회사 전체가 아니다.
 *
 * ⚠️ ES3 다. const/let/화살표/JSON 금지.
 * ⚠️ 전역 접두사 mesLock_* — 두 호스트가 같은 엔진에 함께 로드돼도 같은 정의라 무해하다.
 */

var MESLOCK_VERSION = 'LOCK-1.1.0'; // 1.1.0 = ★해제가 **실패해도 'ok'** 를 돌려주던 것 정정.
//   File.remove() 는 예외가 아니라 **false** 를 돌려주므로 try/catch 는 아무것도 못 잡았다.
//   2026-09-09 실기: 일러 프로세스의 파일 자원이 고갈돼 잠금 파일이 안 지워졌는데 'ok' 가 나갔고,
//   재단 탭이 TTL 10분 동안 `busy:a0:single` 로 막혔다 — 아무것도 붙잡고 있지 않은데도.
//   못 지우면 **시각을 0 으로 밀어** 다음 읽기가 만료로 회수하게 한다(삭제는 안 되는데
//   덮어쓰기는 되는 상태가 실재한다). 그리고 `busy:` 에 경과 시간을 실어 사람이 판단하게 한다.
var MESLOCK_TTL_MS = 10 * 60 * 1000; // 배치 가공이 수 분 걸릴 수 있어 넉넉히

function mesLock_now() { return (new Date()).getTime(); }

/** 잠금 파일. 패널 중립 이름 — A0·재단이 같은 파일을 본다. */
function mesLock_file() {
    return new File(Folder.temp.fsName.replace(/\\/g, '/') + '/mes_host_lock.txt');
}

function mesLock_path() { return mesLock_file().fsName; }

/** 현재 잠금 또는 null. TTL 초과분은 여기서 회수한다(패널이 잠금을 쥔 채 죽는 실패 모드 대비). */
function mesLock_read() {
    var f = mesLock_file();
    if (!f.exists) return null;
    var s = '';
    try { f.open('r'); s = f.read(); f.close(); } catch (e) { try { f.close(); } catch (e2) { /* ignore: 오류 경로의 파일 닫기 — 잠금은 null(없음)로 처리된다 */ } return null; }
    var p = String(s).replace(/[\r\n]/g, '').split('|'); // owner|label|epochMs
    if (p.length < 3) return null;
    var at = parseInt(p[2], 10);
    if (isNaN(at)) return null;
    if (mesLock_now() - at > MESLOCK_TTL_MS) { try { f.remove(); } catch (e3) { /* ignore: 만료 잠금 파일 정리 — 못 지워도 만료로 판정해 null 을 돌려준다 */ } return null; }
    return { owner: p[0], label: p[1], at: at };
}

function mesLock_write(owner, label) {
    var f = mesLock_file();
    try {
        f.open('w');
        f.write(owner + '|' + (label || '') + '|' + mesLock_now());
        f.close();
        return true;
    } catch (e) { try { f.close(); } catch (e2) { /* ignore: 오류 경로의 파일 닫기 — false 반환이 실패를 알린다 */ } return false; }
}

/**
 * 획득. 'ok' | 'busy:<owner>:<label>'.
 * ⚠️ read→write 사이 경쟁은 파일로 완전히 막지 못한다(ExtendScript 에 파일 잠금 API 가 없다).
 *    쓰고 **다시 읽어 소유자를 확인**해 동시 진입을 잡는다. 사람이 버튼 누르는 속도에서는 충분하다.
 */
function mesLock_acquire(owner, label) {
    var L = mesLock_read();
    if (L && L.owner !== owner) return 'busy:' + L.owner + ':' + (L.label || '') + ':age=' + (mesLock_now() - L.at) + 'ms';
    if (!mesLock_write(owner, label)) return 'busy:io:write-failed';
    var chk = mesLock_read();
    if (!chk || chk.owner !== owner) return 'busy:' + (chk ? chk.owner : 'io') + ':' + (chk ? (chk.label || '') : 'verify-failed');
    return 'ok';
}

/** 긴 작업 중 TTL 갱신(하트비트). 소유자가 아니면 무시. */
function mesLock_touch(owner) {
    var L = mesLock_read();
    if (L && L.owner === owner) { mesLock_write(owner, L.label); return 'ok'; }
    return 'nolock';
}

/** 해제. 소유자가 아니면 건드리지 않는다(남의 잠금을 푸는 사고 방지). */
function mesLock_release(owner) {
    var L = mesLock_read();
    if (!L) return 'ok';
    if (L.owner !== owner) return 'notowner:' + L.owner;
    // ★삭제 실패를 성공으로 세지 않는다 (2026-09-09). remove() 는 **false** 를 돌려준다.
    var gone = false;
    try { gone = !!mesLock_file().remove(); } catch (e) { /* ignore: 삭제 실패는 gone=false 로 남아 아래 exists 재확인·released 표기로 이어진다 */ }
    if (!gone) { try { gone = !mesLock_file().exists; } catch (e2) { /* ignore: 존재 확인 실패는 gone=false 유지 — 아래 released 표기가 최후 수단 */ } }  // 이미 없으면 성공이다
    if (gone) return 'ok';
    // ★못 지웠어도 **놓아준다** — 시각을 0 으로 밀면 다음 읽기가 만료로 회수한다(위 TTL 분기).
    //   실기에서 일러가 파일을 못 만들고 못 지우는데 **덮어쓰기는 됐다**(잠금 파일은 이미 있다).
    //   여기서 손을 놓으면 남의 탭이 10분간 이유 없이 막힌다.
    var f = mesLock_file();
    try { f.open('w'); f.write(owner + '|released|0'); f.close(); } catch (e3) { /* ignore: 해제 표기(최후 수단)마저 실패하면 TTL(10분)이 풀어 준다 */ }
    return mesLock_read() ? 'stale' : 'ok;forced';
}

/** 관리자 탈출구 — 영구 잠김일 때만. UI 에서는 확인 후에만 노출할 것. */
function mesLock_force() {
    try { var f = mesLock_file(); if (f.exists) f.remove(); } catch (e) { /* ignore: 관리자 강제 해제 — 파일이 없으면 이미 풀린 것 */ }
    return 'ok';
}

/** 조회. 'none' | 'seen:<owner>:<label>:age=<ms>ms' */
function mesLock_probe() {
    var L = mesLock_read();
    if (!L) return 'none';
    return 'seen:' + L.owner + ':' + (L.label || '') + ':age=' + (mesLock_now() - L.at) + 'ms';
}
