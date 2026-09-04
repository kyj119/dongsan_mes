#target illustrator
/**
 * MES 재단 패널 — ExtendScript 호스트 정본 (Z: 배포 = 축2)
 *
 * 정본 위치 = Z:\DESIGNS\IA-등록\_scripts\mes-cut-host.jsx
 *   패널의 jsx/host.jsx 는 스텁이고 이 파일을 $.evalFile 한다 → **Z: 1곳 교체 = 전 PC 반영**.
 *
 * spec = docs/superpowers/specs/2026-07-31-cut-file-panel.md
 *   P0(이 파일 시점) = 골격 + 크로스 패널 잠금. 칼선 생성 로직은 P1.
 *
 * ⚠️ ES3 다. const/let/화살표/JSON/Array.map 금지.
 * ⚠️ 전역 접두사는 mesCut_* 고정 — A0(mesA0_*)와 **같은 전역 스코프를 공유**한다.
 *    이름이 겹치면 나중에 로드된 쪽이 상대를 덮어써 A0 가 깨진다(spec §5.3).
 */

//   0.4.2 = 조각별 칼선 + 아트/재단선 레이어 분리 버그 수정 (2026-07-31)
//   0.4.3 = 테두리·돔보를 **실제 배치 bbox** 기준으로(시트 크기 아님) · DXF 를 등록 폴더에 저장
//           · 복제 시 활성문서 왕복을 조각당 2회 → 시트당 2회 (2026-07-31)
//   0.7.0 = ★벡터 칼선 — 래스터 왕복을 건너뛰고 일러가 직접 오프셋한다 (2026-08-01)
//   0.8.0 = 도련(클립확장·가장자리색) · 레이어 분리(재단선 print OFF·돔보) · 시트 테두리 제거
//           · ★일괄 굽기 nestBakeAll — 조각당 4.07초 → 문서 왕복 2회로 (2026-08-03)
//   0.8.1 = ★모달 대화상자로 배치가 멈추던 결함 수정 (2026-08-04 실사용 보고)
//           "다른 그룹에 속해있는 오브젝트들을 그룹으로 만들 수 없습니다" + 도련 미생성.
//           ①대화상자 억제(DONTDISPLAYALERTS) ②부모가 갈린 선택은 DOM 그룹으로 ③도련 실패를 보고
//   0.8.2 = ★도련 무음 실패 3종 — 무제-2 문서 실측으로 확인 (2026-08-04)
//           ④`selected=true` 가 9063 으로 거부돼도 삼키던 것 → 전용 사유로 보고
//           ⑤확장 실패 시 **라이브 효과를 남겨 도련을 살린다**(EPS·RIP 는 정상 출력)
//           ⑥진짜 커졌는지 visibleBounds 로 검산 · ⑦실패한 사본을 제거(인쇄 레이어 그림 2벌 방지)
//   0.8.3 = ★★구역별 도련에 **경계 클리핑**을 넣었다 (2026-08-04 실사용 3건)
//           오프셋만 걸면 아트의 **모든 도형이** 굵어진다 — 내부 선 뭉갬(분홍 여자) · 열린 선 끝
//           반원(파란 남자아이) · 내부 검정선이 윤곽 밖으로 삐져나옴(토끼). 셋 다 같은 원인.
//           도련 경계(실루엣+여백+도련)로 잘라내 **링만 남긴다** — 링은 제 색, 내부는 원본이 가린다.
//   0.8.4 = ★잉크 0 패스(0x0 점 패스 등) 제거 — 하나만 섞여도 실루엣이 0개가 됐다(A/B 재현)
//   0.8.5 = ★★사본 정규화 — **잠긴 하위 개체**가 실루엣을 조용히 틀리게 하던 근본 원인.
//           실사용 조각(125.78x113.52)에 locked 패스 4개(49.00x73.82 등 최대 도형) → 그룹 선택이
//           9063 으로 거부되고 일러가 선택 가능한 25개만 골라 실루엣이 114.75x89.89 로 나왔다.
//           사본에서 잠금 해제 + 숨김 제거 + 잉크 0 제거 후 처리한다(원본 무손상)
//   0.9.0 = ★★도련 재설계 — 도형별 오프셋은 **원리상** 내부 선을 링 밖으로 내보낸다
//           (가장자리에서 d 안쪽 선이 (여백+도련)-d 만큼 튀어나온다. 클리핑은 바깥만 막는다).
//           여백>0 = 링 전체 단색(기본 흰색) · 여백<=0 = 가장자리 띠에서 색 추출해 연장
//   0.9.1 = 띠 방식(edge)을 기본에서 제외 — 실사용 조각에서 Pathfinder 가 3분+ 멎었다.
//           멈추는 것이 색이 덜 맞는 것보다 나쁘다. 여백<=0 은 solid-nomargin 으로 알린다
//   0.9.2 = 단색 링이 **검정으로 나오던 것** 수정 — 경계가 group/compound 면 겉면 filled 가
//           안 먹어 실루엣 원래 색이 남았다. 깊이 칠하고, 못 칠하면 도형을 지운다
//   0.9.3 = 여백<=0 이면 단색이 아니라 **사본 확대로 색을 이어붙인다**. 아트가 칼선까지 차 있는데
//           흰 링을 깔면 재단이 밀렸을 때 흰 테두리가 보인다 = 도련이 막아야 할 바로 그 현상
//   0.9.5 = ★★정정 — 도련에 **흰색 하드코딩 제거**. 여백 값과 무관하게 항상 아트 테두리 색을
//           바깥으로 잇는다(사본 확대). 단색은 아트에서 색을 못 얻을 때의 마지막 안전망만.
//           + 사본 확대의 makeMask 를 검증(거부돼도 선택이 남아 성공으로 오판했다)
//   0.9.6 = ★도형별 오프셋 복귀 + **안쪽 도형 제거**(pruneInterior). 오프셋만 쓰면 내부 선이
//           링 밖으로 나오던 것이 근본 원인이었고, grow 만큼 안쪽에 완전히 든 도형을 미리
//           지우면 그 원인이 사라진다. 링 색은 아트에서 나온다 — 흰색 하드코딩 없음
//   0.9.7 = 가장자리에 **닿는 열린 획**의 끝이 반원으로 부풀던 것 수정 — 획을 먼저 면으로
//           바꾸고(Outline Stroke) 도련 오프셋만 **마이터 조인**을 쓴다(칼선은 라운드 유지).
//           실측 면적 676.0 = 이론 사각과 일치(라운드 552.0/604.0 은 곡면)
//   0.9.8 = 프루닝 척도를 bbox → **실루엣 윤곽까지의 실제 거리**로. bbox 기준은 오목부에서
//           가장자리 도형까지 지워 링에 구멍을 냈고(도련 없는 부분), 동시에 bbox 근처지만
//           윤곽에서 먼 도형은 살려 내부 선 침입을 못 막았다 — 한 원인, 두 증상
//   0.9.9 = 판정을 '링에 닿을 수 있나' → '**윤곽을 만드나**'로. grow(=여백+도련) 안이면
//           남기는 규칙은 가장자리 근처 내부 선까지 전부 살려 도련이 지저분했다.
//           허용 거리 1mm + 윤곽 촘촘 샘플링(긴 변 한가운데가 비어 구멍 나는 것 방지)
//  0.10.0 = ★도형별 오프셋을 기본에서 내림. 도형들이 서로 안 겹치면 각자가 제 윤곽을 가져
//           어떤 거리 기준으로도 '윤곽 도형 vs 내부 선'이 안 갈린다(링에 30/35/14개 잔존).
//           기본 = 사본을 통째로 경계까지 늘려 클리핑 → 개별 오프셋 자국이 원천적으로 없다.
//           옛 동작은 방식=region 으로 명시해야 나온다
//  0.10.1 = 사본 확대 되돌림 — bbox 는 사방 6.00mm 로 맞지만 아트를 1.14x/1.09x **늘려서**
//           안쪽 그림이 전부 밀린다(실측). 도련은 원본과 겹쳐 보여야 한다.
//           정본은 픽셀 방식(js/bleed.js), 배선 전까지는 위치가 맞는 도형별 오프셋을 기본으로
//   0.9.4 = 사본 확대 경로의 makeMask 를 **검증**한다. 거부돼도 선택이 남아 성공으로 오판했고
//           클리핑 안 된 사본 + 경계 도형이 아트 레이어에 잔류했다(실측)
var MESCUT_VERSION = 'CUT-CEP-0.35.0';  // 0.35.0 = ★굽기 export 는 **호출당 고정비가 지배**한다 — 조각마다 exportFile 하던 것을 아트보드 N개 + `exportForScreens` 1회로 (실물 23조각 8,263ms ×2 → 4,841 + 695ms). 경로 규약은 그대로 — 파일을 `Folder.temp` 의 옛 이름으로 옮겨 둔다(안 그러면 도련이 조용히 사라진다) · 0.34.0 = ★칼선에서 **자를 수 없는 부스러기**를 걷어낸다(실물 판 131개 중 15개가 0.01x0mm 3점 조각 — 컬파운드 안쪽이라 안 보였다) · 글자는 글자대로 남긴다(감싸기 안 함) · 0.33.0 = ★회전한 조각의 칼선이 **바깥 사각**으로 나가던 것 정정 — PDF 굳히기 임베드가 만든 사각 클립이 실루에을 덮었다(자르는 게 없는 클립만 걷어낸다) · 0.32.0 = ★굳혀서 배치하는 새 법 — **한 판에 1회**(조각 전부를 계자 PDF 로 한 번 굳힌 뒤 회전 값마다 마스턼 하나 → 배치는 duplicate) — 회전만 걸려도 조각당 3.05초가 붙던 것이 조각 수와 무관해진다 · 0.31.0 = ★등록 manifest 가 저장 배율을 반영한다(measured_cm=실물 · scale_pct=100/N) — 여태 1/2 로 짜면 주문 라인 규격이 1/S · 청구면적이 1/S² 였다 · 0.30.0 = ★품목(item_id) 전달 — 주문서가 품목·단가까지 자동으로 채운다 · 0.29.0 = PDF 아트보드 기준을 잉크 경계로(visibleBounds 로 잡으면 마스크로 가린 여분이 되살아나 조각이 커지고 재단선을 넘는다) · 0.28.0 = 회전도 임베드 앞으로 + **회전만 있어도 PDF 경로**(1:1 회전도 마스크가 안 따라와 배경 절반이 회색) + 검산 기대폭에 회전 반영 · 0.27.0 = 배율 기준을 PDF 아트보드로(배치 직후 보고값은 잘려 있어 +23%) · 확대는 임베드 **전**(뒤로 옮기면 마스크가 안 따라와 배경이 죽는다) · 0.26.0 = 배율 확대 크기 계산을 임베드 **후**로(배치 직후 값은 그림 있는 데까지로 잘려 있어 클립 밖 삐짐 조각이 +23% 크게 나왔다) · 0.25.0 = 배율 확대를 PDF 배치로(아트를 직접 키우면 불투명도 마스크가 안 따라와 배경이 사라진다) · 0.24.0 = 문서 전체 개체 선택(mesCut_selectAllTop) · 0.23.0 = 도련을 같은 문서에서 내보냄(굽기 왕복 1회) + 이전 판 문서 닫기 · 0.22.0 = 등록 파일명=실물 규약 + trim 실제값
var MESCUT_PT_PER_MM = 72 / 25.4;
// ★일러 문서·아트보드 한계 = 16383pt(227인치 ≈ 5779mm). 넘는 자리로 아트보드를 옮기면
//   `an Illustrator error occurred: 1095724867 ('AOoC')` 로 죽는다 — 아트보드가 캔버스 밖이라는 뜻이다.
//   굽기용 임시 문서에서 조각을 **가로 한 줄로만** 벌리다가 1:1(원본 크기) 조각에서 실제로 터졌다(2026-08-05).
var MESCUT_CANVAS_MAX_PT = 16000;   // 여유를 둔 실사용 상한

/**
 * mm 단위 문서를 만든다 — `app.documents.add()` 를 이걸로 대체한다.
 *
 * ★왜 필요한가 (AI 30.7 실측, 2026-08-25):
 *   `doc.rulerUnits = RulerUnits.Millimeters` 는 **예외도 안 던지고 값도 안 바뀐다**(읽기 전용).
 *   `SheetLayout.jsx` 가 정확히 그렇게 쓰고 있었고, 그래서 "저장 파일 기본 단위 = mm" 라는 의도가
 *   6개월+ 조용히 실패했다. `preferences rulerType` 도 안 통한다 — 이미 1(mm)인데
 *   `documents.add()` 는 여전히 pt 문서를 만든다. **DocumentPreset 이 유일한 경로다.**
 *
 *   EPS 는 문서 단위를 보존하므로(실측: mm 문서 저장 → 재오픈 시 mm) 여기 하나로
 *   EPS·재오픈 .ai·화면 눈금이 전부 mm 가 된다. DXF `$INSUNITS` 는 `ExportOptionsAutoCAD.unit`
 *   이 정하므로 이미 mm 이고 영향받지 않는다.
 *
 * ⚠️ 좌표는 **point 그대로** 넘긴다 — 눈금 단위만 바뀌고 기하는 불변이다(회귀 0의 근거).
 * ⚠️ 프로파일명은 로케일 종속이 아니다(실측: "[Default] Print"·"[기본] 인쇄"·없는 이름 전부 성공).
 *    그래도 폴백을 둔다 — 조용한 실패보다 단위만 잃고 도는 편이 낫다.
 * ⚠️ `mes-a0-host.jsx` 의 `mesA0_newDocMM` 과 **같은 내용의 사본**이다(호스트 접두사 분리 규칙).
 */
function mesCut_newDocMM(wPt, hPt) {
    try {
        var dp = new DocumentPreset();
        dp.units = RulerUnits.Millimeters;
        dp.colorMode = DocumentColorSpace.CMYK;
        dp.width = wPt;
        dp.height = hPt;
        return app.documents.addDocument('[Default] Print', dp);
    } catch (eU) {
        return app.documents.add(DocumentColorSpace.CMYK, wPt, hPt);
    }
}

// ── 크로스 패널 잠금 (spec §5.2-① · P0 핵심) ────────────────────────
// 왜: A0 의 잠금(setHostBusy)은 **패널 내부 JS 상태**라 다른 패널을 모른다. 패널이 둘이 되면
//     두 패널이 일러 하나를 동시에 때릴 수 있고, 그때 A0 의 잠금은 아무 소용이 없다.
//
// ★구현은 **공용 모듈 mes-lock.jsx** 에 있다 — A0 호스트도 같은 파일을 로드한다.
//   각자 복제하면 파일 형식이 어긋나는 순간 둘 다 "잠금 없음" 으로 보게 되므로 정본을 하나로 둔다.
//   매개가 전역이 아니라 **파일**인 이유는 실측 때문이다(CEP 는 확장마다 엔진이 따로다) — mes-lock.jsx 주석 참조.
//
// 아래 mesCut_* 는 패널 API 호환용 **얇은 위임**이다. 로직을 여기에 다시 쓰지 말 것.
var MESCUT_LOCK_PATH = 'Z:/DESIGNS/IA-등록/_scripts/mes-lock.jsx';
var MESCUT_LOCK_ERROR = '';
try {
    var _mesLockFile = new File(MESCUT_LOCK_PATH);
    if (_mesLockFile.exists) $.evalFile(_mesLockFile); // 전역 — 감싸지 말 것
    else MESCUT_LOCK_ERROR = 'lock 모듈 없음: ' + MESCUT_LOCK_PATH;
} catch (_eLock) { MESCUT_LOCK_ERROR = 'lock 로드 실패: ' + _eLock; }

// 모듈이 없어도 패널이 죽지는 않게 한다 — 잠금은 없지만 조회/해제가 예외를 던지지 않도록.
// (잠금 없이 도는 것은 위험하므로 상태 문자열로 드러낸다)
function mesCut_lockReady() { return (typeof mesLock_acquire === 'function'); }

function mesCut_acquireLock(owner, label) {
    if (!mesCut_lockReady()) return 'busy:io:' + (MESCUT_LOCK_ERROR || 'lock 모듈 미로드');
    return mesLock_acquire(owner, label);
}
function mesCut_touchLock(owner) { return mesCut_lockReady() ? mesLock_touch(owner) : 'nolock'; }
function mesCut_releaseLock(owner) { return mesCut_lockReady() ? mesLock_release(owner) : 'ok'; }
function mesCut_forceUnlock() { return mesCut_lockReady() ? mesLock_force() : 'ok'; }
function mesCut_lockProbe() { return mesCut_lockReady() ? mesLock_probe() : ('ERROR ' + (MESCUT_LOCK_ERROR || 'lock 미로드')); }
function mesCut_lockPath() { return mesCut_lockReady() ? mesLock_path() : ('(미로드) ' + MESCUT_LOCK_PATH); }

// ── 브릿지 API (ASCII in/out) ───────────────────────────────────────
function mesCut_ping() { return MESCUT_VERSION; }

/**
 * 선택 아트 요약 — P1 오프셋의 입력이 될 대상. 지금은 치수만 보고한다.
 * 반환 = 'none' | 'n=<개수>;w=<mm>;h=<mm>;x=<mm>;y=<mm>'
 * ⚠️ 문서 좌표는 pt·y-up 이다. mm 환산만 하고 좌표계는 바꾸지 않는다(변환 지점을 한 곳으로 모으기 위함).
 */
function mesCut_selectionInfo() {
    if (app.documents.length === 0) return 'nodoc';
    var doc = app.activeDocument;
    var sel = doc.selection;
    if (!sel || sel.length === 0) return 'none';
    // 재단선은 세지도 재지도 않는다 — 이 값이 패널의 해상도 선택 입력이라
    // 이전 칼선이 섞이면 화면 표시와 실제 처리 대상이 어긋난다(mesCut_rasterize 와 같은 기준).
    var n = 0;
    var bb = mesCut_selBounds();
    for (var i = 0; i < sel.length; i++) if (!mesCut_isCutItem(sel[i])) n++;
    if (!bb || n === 0) return 'none';
    var f = function (pt) { return Math.round((pt / MESCUT_PT_PER_MM) * 10) / 10; };
    return 'n=' + n + ';w=' + f(bb[2] - bb[0]) + ';h=' + f(bb[1] - bb[3]) + ';x=' + f(bb[0]) + ';y=' + f(bb[1]);
}

// ── P1: 칼선 파이프라인 ─────────────────────────────────────────────
// 역할 분담(D5) = **일러는 픽셀을 주고 좌표를 받아 그리기만** 한다.
//   ① mesCut_rasterize  선택 아트 → 임시 PNG (패널이 canvas 로 마스크를 만든다)
//   ② (패널) 마스크 → EDT → 오프셋 → 컨투어 → 단순화 → mm 좌표   ← geometry.js 정본
//   ③ mesCut_drawCut     mm 좌표 → '재단선' 레이어에 M100 실선
// 계산을 일러 밖에 두는 이유 = 하네스로 검증할 수 있어서다(ExtendScript 는 테스트가 사실상 불가능).

var MESCUT_CUT_LAYER = '재단선';   // A0·판짜기와 **같은 규약**(M100 실선 0.6) — mes-a0-host.jsx:31 참조

/** 패널↔호스트 대용량 인자 통로. evalScript 는 ASCII·길이 제약이 있어 좌표는 파일로 넘긴다(A0 와 같은 방식). */
function mesCut_paramsPath() {
    return Folder.temp.fsName.replace(/\\/g, '/') + '/mes_cut_params.txt';
}

/**
 * **단품 칼선**([칼선 만들기])의 DXF 저장 경로 — 등록 절차가 없는 즉석 작업이라 temp 다.
 * 네스팅 등록분은 여기를 쓰지 않는다: mesCut_saveOneSheet 가 **등록 폴더(Z: IA-등록/<건별>)에
 * EPS 와 같은 이름으로** 굽고 manifest.files.dxf 에 싣는다(2026-07-31, spec §9-7 해소).
 */
function mesCut_dxfPath() {
    var base = 'cut';
    try { if (app.documents.length) base = app.activeDocument.name.replace(/\.[^.]+$/, ''); } catch (e) {}
    base = base.replace(/[^A-Za-z0-9_\-]/g, '_');   // ASCII 브릿지 안전
    if (!base) base = 'cut';
    return Folder.temp.fsName.replace(/\\/g, '/') + '/' + base + '_cut.dxf';
}

/**
 * ★★단품 DXF — **경로를 호스트가 정하고 내보내기까지 한다** (2026-08-08, spec §6.29·§9-7 해소).
 *
 * 종전에는 패널이 `mesCut_dxfPath()` 로 경로를 **받아서 다시 인자로 넘겼다.** evalScript 인자는
 * ASCII 라 한글이 `_` 로 죽었고, 실제 산출물이 이랬다:
 *     `___260723_________________________cut.dxf`  ← 어느 작업인지 식별 불가
 * 게다가 저장 위치가 `%TEMP%` 라 작업 폴더에도 없었다. **왕복을 없애면 두 제약이 같이 사라진다** —
 * 인자로 안 받으니 ASCII 제약이 없고, 위치도 여기서 정할 수 있다.
 * ⚠️ 반환 방향은 한글이 살아남는다(레이어명 실측 확인) → 표시용 경로는 그대로 돌려준다.
 *    단, `path=` 를 **맨 뒤**에 둔다 — 경로에 `;` 는 없지만 `:`·`\` 는 있으므로 뒤를 통째로 읽게 한다.
 *
 * 저장 위치 = **`.ai` 옆**(EPS 와 쌍이 되는 자리, §2.1). 저장 안 된 문서(무제-N)면 temp 로 떨어진다.
 * @returns 'ok;items=<n>;where=<doc|temp>;path=<전체 경로>' | 'ERROR ...'
 */
function mesCut_exportDxfAuto() {
    if (app.documents.length === 0) return 'ERROR 문서 없음';
    var doc = app.activeDocument;
    var base = 'cut', dir = null, where = 'temp';
    try {
        var nm = String(doc.name).replace(/\.[^.]+$/, '');
        if (nm) base = nm;
    } catch (eN) {}
    try { if (doc.path && doc.path.fsName) { dir = doc.path.fsName; where = 'doc'; } } catch (eP) {}
    if (!dir) dir = Folder.temp.fsName;
    // 파일명에 쓸 수 없는 문자만 막는다 — **한글은 그대로 둔다**(그게 이 함수의 목적이다)
    base = base.replace(/[\\\/:*?"<>|]/g, '_');
    if (!base) base = 'cut';
    var out = dir.replace(/\\/g, '/') + '/' + base + '_cut.dxf';
    var r = mesCut_exportDxf(out);
    if (String(r).indexOf('ok') !== 0) return r;
    var items = '';
    var mI = String(r).match(/items=(\d+)/);
    if (mI) items = mI[1];
    return 'ok;items=' + items + ';where=' + where + ';path=' + out;
}

function mesCut_readParams() {
    var f = new File(mesCut_paramsPath());
    if (!f.exists) return null;
    var s = '';
    try { f.encoding = 'UTF-8'; f.open('r'); s = f.read(); f.close(); }
    catch (e) { try { f.close(); } catch (e2) {} return null; }
    return s;
}

/** 재단선 레이어에 속하는가 — 입력에서 걸러야 할 대상(이전 칼선). */
function mesCut_isCutItem(it) {
    // ★돔보 레이어도 제외한다 — 레이어를 나눈 뒤 이걸 빠뜨리면 돔보가 **아트로 잡혀**
    //   네스팅 조각이 되거나 실루엣에 섞인다.
    try { return !!(it.layer && (it.layer.name === MESCUT_CUT_LAYER || it.layer.name === MESCUT_MARK_LAYER)); } catch (e) { return false; }
}

// ── ★클리핑 마스크 존중 경계 (A0 `mesA0_getClipRespecting` 계열 이식 · 2026-08-01) ────
//
// `visibleBounds` 는 **클립 패스가 실제 콘텐츠보다 클 때 그 클립 크기를 돌려준다.**
// 재단 패널은 이 값을 두 곳에 쓰는데 **둘의 의미가 어긋나 있었다**:
//   ⓐ 굽기 캔버스 크기 → 과대하면 `pickResolution` 이 필요 이상 거친 격자를 고른다(정밀도 손해)
//   ⓑ `nestApply` 의 배치 기준 → 패널이 계산하는 아트 원점은 **잉크 기준**(마스크를 trim 하므로)인데
//      배치는 visibleBounds 기준이라, 클립이 잉크보다 크면 **그 차이만큼 조각이 밀린다**.
// ⇒ 둘 다 **잉크 경계**(클립 ∩ 콘텐츠)로 통일한다. 클립 없는 보통 아트는 visibleBounds 와 같다.

/** 클립 패스의 경계 — 중첩 그룹까지 내려가며 찾는다 */
function mesCut_findClipPath(item) {
    try {
        if (item.clipping) return item.geometricBounds;
        if (item.typename === 'GroupItem') {
            for (var j = 0; j < item.pageItems.length; j++) {
                var r = mesCut_findClipPath(item.pageItems[j]);
                if (r) return r;
            }
        }
    } catch (e) {}
    return null;
}
function mesCut_clipBounds(group) {
    for (var j = 0; j < group.pageItems.length; j++) {
        try { if (group.pageItems[j].clipping) return group.pageItems[j].geometricBounds; } catch (e) {}
    }
    var r = mesCut_findClipPath(group);
    return r ? r : group.geometricBounds;
}
function mesCut_rectIntersect(a, b) {
    if (!a) return b; if (!b) return a;
    var iL = Math.max(a[0], b[0]), iR = Math.min(a[2], b[2]);
    var iT = Math.min(a[1], b[1]), iB = Math.max(a[3], b[3]);
    return (iL < iR && iB < iT) ? [iL, iT, iR, iB] : null;
}
/** 클립 패스를 뺀 실제 콘텐츠 경계 */
function mesCut_contentUnion(group) {
    var L = null, T = null, R = null, B = null;
    try {
        for (var j = 0; j < group.pageItems.length; j++) {
            var c = group.pageItems[j];
            if (c.clipping || c.hidden) continue;
            var cb = mesCut_inkBounds(c);
            if (!cb) continue;
            if (L === null || cb[0] < L) L = cb[0];
            if (T === null || cb[1] > T) T = cb[1];
            if (R === null || cb[2] > R) R = cb[2];
            if (B === null || cb[3] < B) B = cb[3];
        }
    } catch (e) {}
    return (L === null) ? null : [L, T, R, B];
}
/**
 * ★아이템의 **잉크 경계** — 클립된 그룹이면 클립 ∩ 콘텐츠, 아니면 자식들의 합집합.
 * 클립 없는 보통 아이템은 `visibleBounds` 그대로다(회귀 0).
 */
function mesCut_inkBounds(item) {
    var t;
    try { t = item.typename; } catch (e) { return null; }
    try { if (item.hidden) return null; } catch (e0) {}
    if (t === 'GroupItem') {
        var clipped = false;
        try { clipped = !!item.clipped; } catch (e1) {}
        if (clipped) {
            var inter = mesCut_rectIntersect(mesCut_clipBounds(item), mesCut_contentUnion(item));
            return inter ? inter : mesCut_clipBounds(item);
        }
        var u = mesCut_contentUnion(item);
        if (u) return u;
    }
    try { return item.visibleBounds; } catch (e2) { return null; }
}

/**
 * ★문서의 **최상위** 아이템만 — `doc.pageItems` 는 **중첩 자식까지 평평하게** 돌려준다.
 *
 * 그래서 클립된 그룹을 그대로 넘기면 **클립 패스 자신**(잉크보다 큰 사각)이 합집합에 섞여
 * 캔버스가 과대해진다. 예전에는 origin 도 `visibleBounds`(=클립 크기) 였어서 **우연히 아귀가 맞았고**,
 * origin 만 잉크 기준으로 바꾸자 그 차이만큼 칼선이 통째로 밀렸다
 * (2026-08-01 실측: 클립 200×150 · 잉크 40×30 → 칼선이 +9.7/−59.8mm 이동).
 */
function mesCut_topItems(doc) {
    var out = [];
    try {
        for (var i = 0; i < doc.layers.length; i++) {
            var L = doc.layers[i];
            try { if (!L.visible) continue; } catch (eV) {}
            for (var j = 0; j < L.pageItems.length; j++) out.push(L.pageItems[j]);
        }
    } catch (e) {}
    return out;
}

/** 선택 아트의 잉크 경계 합집합 [L,T,R,B] (pt, y-up). 재단선은 제외. 없으면 null. */
function mesCut_selBounds() {
    if (app.documents.length === 0) return null;
    var sel = app.activeDocument.selection;
    if (!sel || sel.length === 0) return null;
    var L = null, T = null, R = null, B = null;
    for (var i = 0; i < sel.length; i++) {
        if (mesCut_isCutItem(sel[i])) continue;   // 이전 칼선이 bbox 를 부풀리지 않게
        var b;
        b = mesCut_inkBounds(sel[i]);
        if (!b) continue;
        if (L === null || b[0] < L) L = b[0];
        if (T === null || b[1] > T) T = b[1];
        if (R === null || b[2] > R) R = b[2];
        if (B === null || b[3] < B) B = b[3];
    }
    return (L === null) ? null : [L, T, R, B];
}

/**
 * ① 선택 아트를 PNG 로 굽는다. 반환 = 'ok;path=<file>;w=<px>;h=<px>;ox=<mm>;oy=<mm>;mmpp=<mm/px>'
 *   ox/oy = 마스크 (0,0) 픽셀이 문서에서 갖는 mm 좌표(원점, y-up 기준 상단).
 *   ⚠️ 임시 문서에 복제해서 굽는다 — 현재 문서의 아트보드를 건드리면 사용자 작업이 오염된다.
 *   ⚠️ 배경은 흰색이 아니라 **투명**으로 두고, 패널은 alpha 로 마스크를 만든다.
 *      (흰 배경으로 구우면 '흰색 잉크'와 배경을 구분할 수 없다 — 실측에서 확인된 함정)
 */
function mesCut_rasterize(mmPerPx, padMm, fillClosed) {
    var bb = mesCut_selBounds();
    if (!bb) return 'ERROR 선택 없음';
    if (!mmPerPx || mmPerPx <= 0) mmPerPx = 0.5;
    // ★여백 필수 — 아트 크기에 딱 맞춰 구우면 **오프셋 팽창분이 캔버스 밖으로 잘린다**.
    //   2026-07-31 실측: 여백 0 일 때 오프셋 3mm 를 줬는데 좌 3.00·하 2.90 은 맞고
    //   상 0.00·우 -0.35 로 잘렸다(잉크가 이미지 가장자리에 닿은 변). 재단선이 조용히 틀리게 나온다.
    //   패널이 offsetMm + 여유를 넘긴다.
    if (!padMm || padMm < 0) padMm = 0;

    var srcDoc = app.activeDocument;
    // ⚠️ selection 은 live 다 — documents.add() 로 활성 문서가 바뀌면 참조가 무효해진다.
    //    **문서를 만들기 전에** 실제 배열로 고정해 둔다(2026-07-31: 이걸 안 해서 복제가 0건이었다).
    // ★★ '재단선' 레이어의 아이템은 **제외**한다 — 전체선택(selectall)은 재단선도 잡으므로,
    //    칼선이 이미 있는 상태에서 다시 실행하면 **이전 칼선이 입력 잉크로 섞인다**.
    //    (2026-07-31 실측: 그 상태로 재실행하니 조각 255개가 전부 이어져 외곽 1개가 됐다.
    //     오프셋을 바꿔 다시 뽑는 것은 실사용에서 흔한 조작이라 반드시 걸러야 한다.)
    var items = [];
    for (var si = 0; si < srcDoc.selection.length; si++) {
        var it = srcDoc.selection[si];
        if (!mesCut_isCutItem(it)) items.push(it);
    }
    if (!items.length) return 'ERROR 선택이 재단선뿐입니다 — 그림을 선택하세요';
    var wPt = bb[2] - bb[0], hPt = bb[1] - bb[3];
    if (wPt <= 0 || hPt <= 0) return 'ERROR 선택 영역이 0';

    var outPath = Folder.temp.fsName.replace(/\\/g, '/') + '/mes_cut_raster.png';
    var tmp = null;
    var dupErr = '';
    try {
        tmp = mesCut_newDocMM(wPt, hPt);
        var lay = tmp.layers[0];
        // ★★ 문서 간 duplicate 는 **원본 문서가 active 일 때만** 동작한다.
        //    documents.add() 가 새 문서를 active 로 만들어 버리므로 여기서 되돌린다.
        //    2026-07-31 실측(같은 아이템·같은 호출):
        //        duplicate(Document)                 → 0개 (예외도 없이 조용히 실패)
        //        duplicate(Layer)                    → 0개 (마찬가지)
        //        activeDocument = 원본 후 duplicate  → 99개 ✅
        //    예외를 던지지 않기 때문에 try/catch 로는 절대 못 잡는다 — 결과 개수로 검증할 것.
        app.activeDocument = srcDoc;
        for (var i = 0; i < items.length; i++) {
            try { items[i].duplicate(lay, ElementPlacement.PLACEATBEGINNING); }
            catch (eDup) { if (!dupErr) dupErr = String(eDup); }
        }
        app.activeDocument = tmp;
        // 사본에서만 채운다 — 원본은 무손상
        var nFill = fillClosed ? mesCut_fillClosedIn(tmp) : 0;
        // ★조각의 position 을 옮기지 않는다 — 대신 **아트보드를 아트에 맞춘다**.
        //   좌표 보정(position 재계산)은 group/clip 기준이 visibleBounds 와 어긋나 빈 PNG 를 만든 전례가 있다
        //   (2026-07-31: 100% 투명 PNG). 아트보드를 맞추면 보정식이 아예 필요 없다.
        //   패널에 돌려주는 origin 은 **원본 문서의 bb** 다 — 조각의 상대 배치는 복제해도 그대로이므로
        //   픽셀→mm 매핑(origin + px*mmpp)이 원본 문서 좌표로 정확히 떨어진다.
        var u = mesCut_unionOf(mesCut_topItems(tmp));
        if (!u) {
            var n = tmp.pageItems.length;
            tmp.close(SaveOptions.DONOTSAVECHANGES);
            return 'ERROR 복제 실패 (선택 ' + items.length + '개 → 복제 ' + n + '개' + (dupErr ? ('; ' + dupErr) : '') + ')';
        }
        var padPt = padMm * MESCUT_PT_PER_MM;
        tmp.artboards[0].artboardRect = [u[0] - padPt, u[1] + padPt, u[2] + padPt, u[3] - padPt];
        wPt = (u[2] - u[0]) + padPt * 2;
        hPt = (u[1] - u[3]) + padPt * 2;

        var opts = new ExportOptionsPNG24();
        opts.antiAliasing = true;
        opts.transparency = true;          // ★배경 투명 — 흰 잉크와 배경을 구분하기 위해
        opts.artBoardClipping = true;
        var scalePct = (1 / mmPerPx) * (25.4 / 72) * 100;  // 1pt = 25.4/72 mm
        opts.horizontalScale = scalePct;
        opts.verticalScale = scalePct;
        tmp.exportFile(new File(outPath), ExportType.PNG24, opts);

        var wPx = Math.round(wPt * scalePct / 100);
        var hPx = Math.round(hPt * scalePct / 100);
        var f = function (pt) { return Math.round((pt / MESCUT_PT_PER_MM) * 100) / 100; };
        // origin = 마스크 (0,0) 픽셀의 **원본 문서 mm 좌표**. 여백만큼 바깥으로 밀려 있다.
        var res = 'ok;path=' + outPath + ';w=' + wPx + ';h=' + hPx
            + ';ox=' + f(bb[0] - padPt) + ';oy=' + f(bb[1] + padPt) + ';mmpp=' + mmPerPx + ';pad=' + padMm
            + ';filled=' + nFill;
        tmp.close(SaveOptions.DONOTSAVECHANGES); tmp = null;
        return res;
    } catch (e) {
        if (tmp) { try { tmp.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {} }
        return 'ERROR rasterize: ' + e;
    }
}

function mesCut_unionOf(items) {
    var L = null, T = null, R = null, B = null;
    for (var i = 0; i < items.length; i++) {
        var b;
        b = mesCut_inkBounds(items[i]);
        if (!b) continue;
        if (L === null || b[0] < L) L = b[0];
        if (T === null || b[1] > T) T = b[1];
        if (R === null || b[2] > R) R = b[2];
        if (B === null || b[3] < B) B = b[3];
    }
    return (L === null) ? null : [L, T, R, B];
}

/**
 * ★선택 아트의 성격 판정 — **"이미 칼선인 파일"**(면 없는 닫힌 선)을 가려낸다.
 *
 * 시트컷 `.ai` 는 대개 **컷 라인만** 담고 면이 없다(spec §2.1). 그런 파일을 그대로 구우면
 * 마스크가 **획(0.35mm 선)만** 잡혀 실루엣이 아니라 가느다란 고리가 된다 —
 * 실측(글자 18조각): 잉크 1.2% · 효율 1.1% · 섬 20(조각은 18) · **글자 속 빈 공간에 다른 글자가 배치**됨.
 * 래스터만으로는 "이 닫힌 선이 사실은 면"이라는 판단이 **원리적으로 불가능**하다 → 좌표를 세어 알려준다.
 *
 * 반환 'paths=..;filled=..;stroked=..;closed=..;raster=..;text=..'
 *   filled=0 && stroked>0 && closed>0  →  이미 칼선인 파일
 */
function mesCut_artKind() {
    if (app.documents.length === 0) return 'ERROR 문서 없음';
    var sel = app.activeDocument.selection;
    if (!sel || !sel.length) return 'ERROR 선택 없음';
    var nP = 0, nF = 0, nS = 0, nC = 0, nR = 0, nT = 0;
    function walk(it) {
        var t;
        try { t = it.typename; } catch (e) { return; }
        try { if (it.hidden) return; } catch (e0) {}
        if (mesCut_isCutItem(it)) return;
        if (t === 'PathItem') {
            try { if (it.guides) return; } catch (e1) {}
            nP++;
            try { if (it.filled) nF++; } catch (e2) {}
            try { if (it.stroked) nS++; } catch (e3) {}
            try { if (it.closed) nC++; } catch (e4) {}
        } else if (t === 'CompoundPathItem') {
            try { for (var c = 0; c < it.pathItems.length; c++) walk(it.pathItems[c]); } catch (e5) {}
        } else if (t === 'GroupItem') {
            try { for (var g = 0; g < it.pageItems.length; g++) walk(it.pageItems[g]); } catch (e6) {}
        } else if (t === 'RasterItem' || t === 'PlacedItem' || t === 'MeshItem') { nR++; }
        else if (t === 'TextFrame') { nT++; }
    }
    for (var i = 0; i < sel.length; i++) walk(sel[i]);
    return 'paths=' + nP + ';filled=' + nF + ';stroked=' + nS + ';closed=' + nC
        + ';raster=' + nR + ';text=' + nT;
}

/**
 * ★임시 문서에서만 **닫힌 패스를 면으로** 채운다 (원본은 절대 건드리지 않는다).
 *
 * 마스크의 정본은 계속 "일러가 렌더한 결과"다 — 좌표로 마스크를 직접 만들면
 * polarity·투명도·효과를 우리가 재현해야 하는 부담이 생긴다(2026-08-01 실측: `compoundPathItems.add()`
 * 로 만든 도넛은 polarity 가 `++` 라 일러가 **구멍 없이** 렌더했고, even-odd 를 가정한 계산과 33.8% 어긋났다).
 * 그래서 **렌더 전에 채우기만 켜고** 굽는다 — 채우기 규칙은 일러가 알아서 적용한다.
 */
/** 아이템 1개(하위 포함)에 적용. ★규칙 정본은 여기 하나다 — 래스터·벡터 경로가 같은 걸 쓴다. */
function mesCut_fillClosedItem(it, k) {
    var n = 0, t;
    try { t = it.typename; } catch (e) { return 0; }
    if (t === 'PathItem') {
        try {
            if (it.guides || !it.closed) return 0;
            it.filled = true; it.fillColor = k; n++;
        } catch (e1) {}
    } else if (t === 'CompoundPathItem') {
        // compound 는 **자신**의 채우기가 렌더를 정한다. 자식까지 맞춰야 일부 버전에서 반영된다.
        try { it.filled = true; it.fillColor = k; n++; } catch (e2) {}
        try {
            for (var c = 0; c < it.pathItems.length; c++) {
                it.pathItems[c].filled = true; it.pathItems[c].fillColor = k;
            }
        } catch (e3) {}
    } else if (t === 'GroupItem') {
        try { for (var g = 0; g < it.pageItems.length; g++) n += mesCut_fillClosedItem(it.pageItems[g], k); } catch (e4) {}
    }
    return n;
}
function mesCut_blackFill() {
    var k = new CMYKColor(); k.cyan = 0; k.magenta = 0; k.yellow = 0; k.black = 100; return k;
}
/** 여백 링 기본색. `C,M,Y,K`(0~100) 문자열을 주면 그 색 — 패널이 고르게 한다. */
function mesCut_ringFill(spec) {
    var k = new CMYKColor();
    k.cyan = 0; k.magenta = 0; k.yellow = 0; k.black = 0;   // 기본 = 흰색
    if (!spec) return k;
    var p = String(spec).split(',');
    if (p.length !== 4) return k;
    k.cyan = parseFloat(p[0]) || 0; k.magenta = parseFloat(p[1]) || 0;
    k.yellow = parseFloat(p[2]) || 0; k.black = parseFloat(p[3]) || 0;
    return k;
}
function mesCut_fillClosedIn(doc) {
    var k = mesCut_blackFill();
    var n = 0;
    try { for (var i = 0; i < doc.pageItems.length; i++) n += mesCut_fillClosedItem(doc.pageItems[i], k); } catch (e5) {}
    return n;
}

/**
 * ★선택 아트의 **벡터 좌표**를 텍스트로 내보낸다 (계측용 · spec §6.26).
 *
 * 왜: 실루엣은 이미 파일 안에 정확한 벡터로 있는데, 지금 파이프라인은 그걸 렌더 → 임계 →
 *     픽셀 계단 → 다시 곡선 피팅으로 **복원**한다. 왕복하며 오차를 만들고 그걸 다시 줄인다.
 *     좌표를 그대로 읽으면 그 왕복이 통째로 없어지는지 재보려는 것이다.
 *     (실측 근거: 시트컷 실도안 18조각 = 서브패스 20·앵커 1117·곡선핸들 91%·래스터/텍스트 0)
 *
 * 형식 (mm · **문서 좌표 · y-up** · ASCII):
 *   I <idx> <filled> <stroked> <strokeWidthMm> <type>
 *   S <closed> ax,ay,lx,ly,rx,ry ax,ay,lx,ly,rx,ry ...
 *   ⚠️ `I` 하나 = **even-odd 채우기를 공유하는 단위**(compound path 는 서브패스 여럿을 묶는다).
 * 반환 'ok;items=..;subs=..;pts=..;skipped=..;raster=..;text=..'
 *   skipped/raster/text 가 0 이 아니면 **벡터만으로는 실루엣이 안 나온다** → 래스터 경로 폴백.
 */
function mesCut_selectionPaths(outPath) {
    if (app.documents.length === 0) return 'ERROR 문서 없음';
    if (!outPath) return 'ERROR 경로 없음';
    var d = app.activeDocument;
    var sel = d.selection;
    if (!sel || !sel.length) return 'ERROR 선택 없음';
    var PT = MESCUT_PT_PER_MM;
    var lines = [], nI = 0, nS = 0, nP = 0, skipped = 0, nRaster = 0, nText = 0;
    function mm(v) { return Math.round((v / PT) * 1000) / 1000; }
    function emitSub(p) {
        try {
            var parts = ['S ' + (p.closed ? 1 : 0)];
            for (var k = 0; k < p.pathPoints.length; k++) {
                var q = p.pathPoints[k];
                parts.push(mm(q.anchor[0]) + ',' + mm(q.anchor[1]) + ','
                    + mm(q.leftDirection[0]) + ',' + mm(q.leftDirection[1]) + ','
                    + mm(q.rightDirection[0]) + ',' + mm(q.rightDirection[1]));
                nP++;
            }
            lines.push(parts.join(' '));
            nS++;
        } catch (e) { skipped++; }
    }
    function head(it, type) {
        var f = 0, s = 0, w = 0;
        try { f = it.filled ? 1 : 0; } catch (e1) {}
        try { s = it.stroked ? 1 : 0; if (s) w = mm(it.strokeWidth); } catch (e2) {}
        lines.push('I ' + nI + ' ' + f + ' ' + s + ' ' + w + ' ' + type);
        nI++;
    }
    function walk(it) {
        var t;
        try { t = it.typename; } catch (e) { skipped++; return; }
        try { if (it.hidden) return; } catch (e3) {}
        if (mesCut_isCutItem(it)) return;
        if (t === 'PathItem') {
            try { if (it.guides) return; } catch (e4) {}
            head(it, 'path'); emitSub(it);
        } else if (t === 'CompoundPathItem') {
            var first = null;
            try { first = it.pathItems.length ? it.pathItems[0] : null; } catch (e5) {}
            head(first || it, 'compound');
            try { for (var c = 0; c < it.pathItems.length; c++) emitSub(it.pathItems[c]); } catch (e6) { skipped++; }
        } else if (t === 'GroupItem') {
            try { for (var g = 0; g < it.pageItems.length; g++) walk(it.pageItems[g]); } catch (e7) { skipped++; }
        } else if (t === 'RasterItem' || t === 'PlacedItem' || t === 'MeshItem') {
            nRaster++;   // 좌표가 없다 = 벡터 경로로는 못 만든다
        } else if (t === 'TextFrame') {
            nText++;     // 아웃라인 전이면 좌표가 없다
        } else { skipped++; }
    }
    for (var i = 0; i < sel.length; i++) walk(sel[i]);
    if (!nS) return 'ERROR 벡터 경로 없음 (래스터/텍스트만 선택됨)';
    try {
        var f2 = new File(outPath);
        f2.encoding = 'UTF-8';
        if (!f2.open('w')) return 'ERROR 파일 열기 실패: ' + outPath;
        f2.write(lines.join('\n'));
        f2.close();
    } catch (eW) { return 'ERROR 쓰기 실패: ' + eW; }
    return 'ok;items=' + nI + ';subs=' + nS + ';pts=' + nP
        + ';skipped=' + skipped + ';raster=' + nRaster + ';text=' + nText + ';path=' + outPath;
}

/**
 * 베지어 좌표열 → 경로. pts = [a0, c1,c2,a1, c1,c2,a2, ...] (pt 단위)
 *   = 시작 앵커 하나 + 세그먼트마다 (앞 앵커의 오른쪽 핸들 · 뒤 앵커의 왼쪽 핸들 · 뒤 앵커) 3개.
 *
 * ★왜 베지어인가: 컨투어 추적은 픽셀 계단을 낳고 폴리라인은 그걸 직선으로만 잇는다.
 *   네스팅 조각 칼선(1mm/px)에서 원 둘레가 18각형으로 나와 재단물에 보였다(2026-07-31 지적).
 *
 * ⚠️ `pointType` 은 건드리지 않는다 — SMOOTH 로 두면 일러가 핸들을 강제로 일직선에 맞춰
 *    **진짜 코너까지 둥글게** 만든다. 기본값(CORNER)에서 핸들만 넣으면 곡선은 곡선대로,
 *    코너는 코너대로 나온다(직선 구간은 피팅이 직선 베지어로 준다).
 */
function mesCut_bezPath(container, pts) {
    var n = Math.floor((pts.length - 1) / 3);
    if (n < 1) return null;
    var anchors = [pts[0]], outH = [], inH = [];
    for (var i = 0; i < n; i++) {
        outH.push(pts[1 + i * 3]);
        inH.push(pts[2 + i * 3]);
        anchors.push(pts[3 + i * 3]);
    }
    // 닫힘 — 마지막 앵커가 첫 앵커와 같으면 중복 점을 없앤다(두면 길이 0 세그먼트가 남는다)
    var a0 = anchors[0], aL = anchors[anchors.length - 1];
    if (anchors.length > 2 && Math.abs(a0[0] - aL[0]) < 0.001 && Math.abs(a0[1] - aL[1]) < 0.001) anchors.pop();
    var m = anchors.length;
    if (m < 2) return null;
    // ★앵커로 경로를 먼저 만들고 핸들을 얹는다 — pathPoints.add() 만으로 만들면 버전에 따라
    //   첫 점이 비어 예외가 난다. setEntirePath 는 항상 통한다.
    var pi = container.pathItems.add();
    pi.setEntirePath(anchors);
    pi.closed = true;
    for (var k = 0; k < m; k++) {
        var pp = pi.pathPoints[k];
        // 세그먼트 k = 앵커 k → k+1. 그러므로 앵커 k 의 **왼쪽** 핸들은 직전 세그먼트(k-1)의 것이다.
        pp.rightDirection = outH[k] ? outH[k] : anchors[k];
        pp.leftDirection = inH[(k - 1 + m) % m] ? inH[(k - 1 + m) % m] : anchors[k];
    }
    return pi;
}

/**
 * ③ 좌표 → '재단선' 레이어. params 파일 형식(UTF-8, 줄 단위):
 *     P x,y x,y x,y ...      폴리곤 1개 (mm, y-up 문서 좌표)
 *     B x,y x,y x,y ...      베지어 1개 (시작 앵커 + 3개씩 — mesCut_bezPath 참조)
 *     H / HB                 직전 외곽의 구멍 (각각 폴리곤 / 베지어)
 *     C cx,cy,d              원 1개 (타공 — 중심 mm + 지름 mm)
 *   반환 'ok;paths=<n>;circles=<n>' 또는 'ERROR ...'
 *   ⚠️ 기존 '재단선' 레이어 내용은 지우지 않는다 — 사용자가 손으로 넣은 선이 있을 수 있다.
 */
function mesCut_drawCut() {
    if (app.documents.length === 0) return 'ERROR 문서 없음';
    var raw = mesCut_readParams();
    if (!raw) return 'ERROR params 없음: ' + mesCut_paramsPath();
    var doc = app.activeDocument;

    var layer = null;
    for (var li = 0; li < doc.layers.length; li++) {
        if (doc.layers[li].name === MESCUT_CUT_LAYER) { layer = doc.layers[li]; break; }
    }
    if (!layer) { layer = doc.layers.add(); layer.name = MESCUT_CUT_LAYER; }
    if (layer.locked) layer.locked = false;
    if (!layer.visible) layer.visible = true;

    var mag = new CMYKColor(); mag.cyan = 0; mag.magenta = 100; mag.yellow = 0; mag.black = 0;
    var lines = String(raw).split(/[\r\n]+/);
    var nP = 0, nC = 0, nH = 0;

    /** 'x,y x,y ...' (mm) → [[xPt,yPt], ...] */
    function parsePts(body) {
        var pts = body.replace(/^\s+|\s+$/g, '').split(/\s+/);
        var arr = [];
        for (var j = 0; j < pts.length; j++) {
            var xy = pts[j].split(',');
            if (xy.length !== 2) continue;
            arr.push([parseFloat(xy[0]) * MESCUT_PT_PER_MM, parseFloat(xy[1]) * MESCUT_PT_PER_MM]);
        }
        return arr;
    }
    function styleIt(o) { o.filled = false; o.stroked = true; o.strokeColor = mag; o.strokeWidth = 0.6; }

    // 외곽 1개 + 구멍 0~N 개를 한 덩어리로 마감한다.
    //   구멍이 있으면 **compound path** 로 묶어야 일러에서 속이 뚫린 것으로 보인다.
    //   (재단 자체는 개별 닫힌 경로여도 되지만, 작업자가 화면에서 구멍을 확인할 수 있어야 한다)
    var pendOuter = null, pendHoles = [];   // {bez:bool, pts:[[x,y],...]}
    /** 폴리라인이든 베지어든 여기 한 곳에서 만든다 — 두 갈래로 나누면 스타일·닫힘이 어긋난다. */
    function mkPath(container, spec) {
        var pi;
        if (spec.bez) {
            pi = mesCut_bezPath(container, spec.pts);
        } else {
            pi = container.pathItems.add();
            pi.setEntirePath(spec.pts);
            pi.closed = true;
        }
        if (pi) styleIt(pi);
        return pi;
    }
    function flush() {
        if (!pendOuter) return;
        try {
            if (pendHoles.length === 0) {
                if (mkPath(layer, pendOuter)) nP++;
            } else {
                var cp = layer.compoundPathItems.add();
                mkPath(cp, pendOuter);
                for (var q = 0; q < pendHoles.length; q++) { if (mkPath(cp, pendHoles[q])) nH++; }
                nP++;
            }
        } catch (eF) {
            // compound 실패 시 개별 경로로라도 남긴다 — 재단은 닫힌 경로만 있으면 된다.
            try {
                if (mkPath(layer, pendOuter)) nP++;
                for (var w = 0; w < pendHoles.length; w++) { if (mkPath(layer, pendHoles[w])) nH++; }
            } catch (eF2) {}
        }
        pendOuter = null; pendHoles = [];
    }

    for (var i = 0; i < lines.length; i++) {
        var ln = lines[i];
        if (!ln || ln.length < 2) continue;
        // ★접두사는 **첫 공백까지**로 읽는다 — 'HB' 처럼 두 글자짜리가 생겼다(charAt(0) 이면 'H' 로 오인).
        var sp0 = ln.indexOf(' ');
        var kind = sp0 < 0 ? ln : ln.substring(0, sp0);
        var body = sp0 < 0 ? '' : ln.substring(sp0 + 1);
        if (kind === 'P' || kind === 'B') {
            flush();                       // 직전 덩어리 마감
            var arr = parsePts(body);
            if (arr.length >= 3) pendOuter = { bez: kind === 'B', pts: arr };
        } else if (kind === 'H' || kind === 'HB') {
            var ha = parsePts(body);
            if (pendOuter && ha.length >= 3) pendHoles.push({ bez: kind === 'HB', pts: ha });
        } else if (kind === 'C') {
            var c = body.replace(/^\s+|\s+$/g, '').split(',');
            if (c.length !== 3) continue;
            var cx = parseFloat(c[0]) * MESCUT_PT_PER_MM;
            var cy = parseFloat(c[1]) * MESCUT_PT_PER_MM;
            var d = parseFloat(c[2]) * MESCUT_PT_PER_MM;
            try {
                var el = layer.pathItems.ellipse(cy + d / 2, cx - d / 2, d, d);
                el.filled = false;
                el.stroked = true;
                el.strokeColor = mag;
                el.strokeWidth = 0.6;
                nC++;
            } catch (eC) {}
        }
    }
    flush();   // 마지막 덩어리
    return 'ok;paths=' + nP + ';holes=' + nH + ';circles=' + nC;
}

// ── ★벡터 칼선 — 래스터 왕복을 건너뛴다 (2026-08-01, 용준님 지시) ──────
//
// **왜**: 래스터 경로(굽기 → 임계 → 픽셀 계단 → 곡선 복원)는 칼선을 실루엣 **안팎으로 물결치게** 만든다.
//   같은 좌표계에서 점 단위로 대조한 실측(2026-08-01):
//       실루엣 이탈 평균 0.11~0.14mm · 최대 0.50mm
//       **안팎 교차 100mm당 7.5~10.6회 · 진폭 ±0.4~0.5mm**  (단순한 사각 배너는 0.7회)
//   치수 오차가 0.5mm 를 안 넘어 **면적·bbox 게이트로는 절대 안 잡힌다**(면적차 0.2~0.7%).
//   눈에는 "선이 미세하게 꺾이고 구불거린다"로 보이며 복잡한 실루엣일수록 심하다.
//   실루엣은 파일 안에 이미 정확한 벡터로 있으므로, 렌더-복원을 그만두고 일러에게 직접 오프셋시킨다.
//
// ★**결과를 손대지 않는다.** 더 깔끔하게 만들려는 후처리는 실측으로 전부 **악화**를 확인했다:
//       미세앵커 병합 0.2mm → **최대편차 2.117mm** (앵커를 지우면 핸들 때문에 곡선이 크게 튄다)
//       재피팅 tol 0.05mm → 배너 앵커 8→40 · 물결 0→3 (매끈한 곡선을 다시 근사하며 잡음을 더한다)
//   일러가 낸 오프셋 결과 그대로가 가장 정확하고 가장 깔끔하다. 단순화·재피팅을 넣지 말 것.
//
// 파이프라인 = 사본 → (텍스트 아웃라인 · 클립 Crop) → 선 아웃라인 → 합집합 → 오프셋 → **재합집합**
//   ⚠️ 오프셋은 **효과**(Adobe Offset Path)로 건다 — 메뉴 `Object > Path > Offset Path` 는
//      대화상자를 띄워 자동화가 그대로 멈춘다. 효과 + `expandStyle` 은 대화상자가 없다.
//   ⚠️ 재합집합이 필수 — Offset Path 는 자기교차 고리를 남긴다(그게 곧 벡터판 '선 중복'이다).
//   ⚠️ `applyEffect` 뒤에는 선택을 **다시 지정**해야 `expandStyle` 이 먹는다
//      (실측: 안 하면 조용히 미적용 — bbox 가 원본 그대로라 성공처럼 보인다).
//   ⚠️ 클립 그룹에 그냥 합집합을 걸면 **클립이 무시된다**(실측: 클립 60×60 인데 실루엣 200×100).
//      `Live Pathfinder Crop` 은 맨 위 오브젝트를 잘라내기 모양으로 쓰므로 **클립 그룹에만** 부른다.

// ★조인 타입은 **실측으로 정했다** — UI 순서(마이터·라운드·베벨)를 믿으면 틀린다.
//   별(뾰족 끝 반각 19.2°)에 3mm 오프셋을 걸어 폭 증가를 재보면:
//       jntp=0 → **+6.000mm (정확히 오프셋의 2배 = 라운드)** ✅ 채택
//       jntp=1 → +3.447mm (팁이 잘린다 — 조각이 실제로 깎여 나간다)
//       jntp=2 → +16.529mm (마이터 — 뾰족 끝이 길게 튀어나온다)
//   ⚠️ 사각·원으로는 셋을 구별할 수 없다(90° 코너는 어느 조인이든 bbox 가 같다) — **뾰족한 도형으로만** 잡힌다.
//   재단에서 라운드가 정상이다(뾰족 끝은 찢어지고, 거리변환 오프셋도 항상 라운드였다 §4.6).
var MESCUT_VEC_JOIN = 0;
// ★도련 전용 조인 = **마이터**. 칼선(라운드)과 다르다.
//   칼선은 물리적 칼날/비트가 둥글게 도는 것을 그대로 반영해야 하지만, 도련은 "가장자리 색을
//   바깥으로 잇는" 것이라 **끝이 볼록해지면 안 된다**(라운드는 반원 캡을 만든다).
//   mlim 2 = 90° 코너까지는 뾰족하게, 그보다 예각이면 베벨로 떨어져 긴 창이 생기지 않는다.
//   실측 근거는 mesCut_vecBleedRegions 안의 주석(면적 676.0 = 이론 사각과 일치) 참조.
var MESCUT_BLEED_JOIN = 2;
var MESCUT_BLEED_MLIM = 2;
// ★도련 링에 색을 줄 자격 = **윤곽에 닿아 있는 도형**. 이 거리 안이면 윤곽을 만든다고 본다.
//   너무 크면(예전 = 여백+도련) 가장자리 근처 **내부 선까지** 살아나 저마다 오프셋되어 도련이
//   지저분해지고, 너무 작으면 윤곽 도형을 놓쳐 링에 구멍이 난다. 윤곽 샘플 간격도 이 값을 쓴다.
var MESCUT_BLEED_TOUCH_MM = 1.0;

/** 벡터로 실루엣을 낼 수 있는가. '' = 가능, 아니면 사유(패널이 래스터로 폴백하고 **사유를 표시**한다). */
function mesCut_vecReason(items) {
    var nRaster = 0, nOther = 0, nClipDeep = 0, nPath = 0;
    function walk(it, depth) {
        var t;
        try { t = it.typename; } catch (e) { return; }
        try { if (it.hidden) return; } catch (e0) {}
        if (t === 'RasterItem' || t === 'PlacedItem') { nRaster++; return; }
        if (t === 'MeshItem' || t === 'GraphItem' || t === 'SymbolItem') { nOther++; return; }
        if (t === 'PathItem' || t === 'CompoundPathItem') { nPath++; return; }
        if (t === 'TextFrame') { nPath++; return; }          // 사본에서 아웃라인 처리한다
        if (t === 'GroupItem') {
            // 최상위 클립은 Crop 으로 처리한다. **중첩** 클립은 Crop 순서를 보장하기 어려워 폴백한다.
            try { if (it.clipped && depth > 0) nClipDeep++; } catch (e1) {}
            try { for (var i = 0; i < it.pageItems.length; i++) walk(it.pageItems[i], depth + 1); } catch (e2) {}
        }
    }
    for (var k = 0; k < items.length; k++) walk(items[k], 0);
    if (nRaster) return '사진/임베드 이미지 ' + nRaster + '개 (좌표가 없어 벡터로는 실루엣을 못 만듭니다)';
    if (nOther) return '메시/심볼/그래프 ' + nOther + '개';
    if (nClipDeep) return '중첩 클리핑 마스크 ' + nClipDeep + '개';
    if (!nPath) return '벡터 경로 없음';
    return '';
}

/** 사본의 텍스트를 아웃라인으로. ⚠️ **사본에만** 부를 것 — 원본 텍스트를 없애면 안 된다. */
function mesCut_vecOutlineText(item) {
    var n = 0, t;
    try { t = item.typename; } catch (e) { return 0; }
    try {
        if (t === 'TextFrame') { item.createOutline(); return 1; }
        // ★역순 — createOutline 은 원래 TextFrame 을 제거하므로 정순이면 인덱스가 밀린다
        if (t === 'GroupItem') for (var i = item.pageItems.length - 1; i >= 0; i--) n += mesCut_vecOutlineText(item.pageItems[i]);
    } catch (e2) {}
    return n;
}

/** 클립된 그룹 → Crop 으로 클립을 **실제로 반영**. 클립이 아니면 그대로 돌려준다. */
/**
 * ★대화상자 억제 — 긴 작업(칼선·네스팅)을 감싼다.
 *
 * 왜 필요한가(2026-08-04 실사용 보고): 네스팅 중 일러가
 *   "다른 그룹에 속해있는 오브젝트들을 그룹으로 만들 수 없습니다"
 * **모달**을 띄웠다. 모달은 ExtendScript 를 그 자리에서 멈추므로
 *   · 남은 조각의 칼선·도련이 통째로 안 만들어지고
 *   · 패널은 응답이 없어 "왜 멈췄는지"조차 알 수 없다(evalScript 콜백이 안 온다).
 * `executeMenuCommand` 는 실패해도 **예외를 던지지 않는다** — try/catch 로는 막을 수 없고
 * 오직 userInteractionLevel 만이 모달을 막는다.
 *
 * ⚠️ 반드시 짝으로 되돌린다. 안 되돌리면 이후 **사용자가 직접 하는 작업의 경고까지 사라진다**
 *    (덮어쓰기 확인 등). 호출부는 예외 경로에서도 mesCut_silentEnd 를 타야 한다.
 */
function mesCut_silentBegin() {
    var prev = null;
    try {
        prev = app.userInteractionLevel;
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    } catch (e) { prev = null; }
    return prev;
}
function mesCut_silentEnd(prev) {
    if (prev === null || prev === undefined) return;
    try { app.userInteractionLevel = prev; } catch (e) {}
}

/**
 * ★선택을 하나로 묶는다 — 메뉴 `group` 이 실패하는 경우를 우회한다.
 *
 * 메뉴 group 은 **선택이 서로 다른 부모(그룹)에 걸쳐 있으면 거부**한다. 파이프라인 중간의
 * `expandStyle` 은 결과를 원래 그룹 **안쪽에** 남길 수 있어서, 중첩 그룹이 있는 아트에서
 * 선택이 여러 부모로 갈린다 — 사내 실사용 아트에서 실제로 발생했다.
 *   그때 group 이 막히면 뒤따르는 `Live Pathfinder Add` 가 합집합을 못 만들어
 *   **칼선이 한 겹이 아니라 조각마다 여러 겹**으로 남는다.
 *
 * DOM 의 `groupItems.add()` + `move()` 는 부모가 달라도 된다 → 갈렸을 때만 그 경로를 쓴다.
 * 1개짜리 선택은 애초에 묶을 필요가 없다(메뉴도 무의미하게 실패한다).
 * @returns 묶은 개수(0 = 아무것도 안 함)
 */
function mesCut_groupSel(doc) {
    var sel = doc.selection, arr = [], i;
    for (i = 0; sel && i < sel.length; i++) arr.push(sel[i]);
    if (arr.length < 2) return arr.length;
    var same = true, p0 = null;
    try { p0 = arr[0].parent; } catch (e0) { same = false; }
    for (i = 1; i < arr.length && same; i++) {
        try { same = (arr[i].parent === p0); } catch (e1) { same = false; }
    }
    if (same) { app.executeMenuCommand('group'); return arr.length; }
    // 부모가 갈렸다 — DOM 으로 새 그룹을 만들어 옮긴다.
    //   ⚠️ 새 그룹은 **첫 항목의 부모**에 만든다. doc/activeLayer 에 만들면 클립 그룹 안에 있던
    //      조각이 밖으로 나와 잘려 있던 부분까지 드러난다(실루엣이 커진다).
    var g = null;
    try { g = p0 ? p0.groupItems.add() : doc.activeLayer.groupItems.add(); }
    catch (e2) { try { g = doc.activeLayer.groupItems.add(); } catch (e3) { return arr.length; } }
    for (i = arr.length - 1; i >= 0; i--) { try { arr[i].move(g, ElementPlacement.PLACEATEND); } catch (e4) {} }
    doc.selection = null;
    try { g.selected = true; } catch (e5) {}
    return arr.length;
}

function mesCut_vecCropClip(doc, item) {
    var clipped = false;
    try { clipped = (item.typename === 'GroupItem' && item.clipped); } catch (e) { return item; }
    if (!clipped) return item;
    try {
        doc.selection = null;
        item.selected = true;
        app.executeMenuCommand('Live Pathfinder Crop');
        app.executeMenuCommand('expandStyle');
        var s = doc.selection;
        return (s && s.length) ? s[0] : item;
    } catch (e2) { return item; }
}

/**
 * 아트 → **벡터 실루엣 칼선**을 cutLayer 에 만든다. 원본은 사본으로만 다루므로 무손상.
 * @param items 대상 아이템 배열 · @param offsetMm 여백(음수면 잉크 안쪽 = 도련이 이미 든 아트)
 * @param fillClosed 선 도안(면 0·닫힌 선)이면 true — **사본에만** 채우기를 켠다
 * @returns {n, anchors, err}
 */
/**
 * ★잘라 내는 게 **없는** 클리핑 마스크를 걷어낸다 (2026-09-04 실측 발견).
 *
 * 증상: 회전한 조각만 칼선이 **바깥 사각**으로 나왔다(곡선 도형 → 4점 정사각). 회전 안 한 조각은
 *   멀쩡했다 — "어떤 건 제대로, 어떤 건 사각"이 정확히 **회전 여부**로 갈렸다.
 * 원인: 회전·배율 조각은 PDF 로 굳혀 배치하는데(0.28.0 `mesCut_scaleAsPlaced`), 그 **임베드가
 *   사각 클립을 2겹 만든다**(원본에는 클립이 하나도 없다 — 실측). `mesCut_vecCropClip` 은
 *   **최상위 클립만** 처리하므로 안쪽 클립이 남고, 그 사각 패스가 OffsetPath+Pathfinder Add 에
 *   섞여 실루엣이 통째로 바깥 상자가 된다.
 *   실측(원본 60.8x61.23 곡선 마름모): 굳히기 없이 → 4점 shape · 굳힌 뒤 → 4점 **RECT**.
 *
 * ⚠️ 아무 클립이나 지우면 안 된다 — **진짜로 잘라 내던** 클립을 지우면 숨어 있던 아트가 드러나
 *    실루엣이 커지고 재단선이 그림 밖으로 나간다. 그래서 **내용이 이미 클립 안에 다 들어가는**
 *    (= 자르는 게 없는) 클립만 지운다. PDF 굳히기의 클립은 아트보드=잉크 경계라 항상 여기 걸린다
 *    (실측: 지운 뒤 잉크 경계 61.23x60.8 그대로 · 결과 4점 shape).
 * ⚠️ 안쪽부터 푼다 — 바깥 판정이 **실제 내용**으로 이뤄져야 한다.
 * @returns 지운 클립 패스 수
 */
function mesCut_dropNoopClips(it) {
    var n = 0, t;
    try { t = it.typename; } catch (e) { return 0; }
    if (t !== 'GroupItem') { return 0; }
    var kids = [];
    try { for (var i = 0; i < it.pageItems.length; i++) { kids.push(it.pageItems[i]); } } catch (e1) { return 0; }
    for (var k = 0; k < kids.length; k++) { n += mesCut_dropNoopClips(kids[k]); }
    var clipped = false;
    try { clipped = !!it.clipped; } catch (e2) {}
    if (!clipped) { return n; }
    var cb = mesCut_clipBounds(it), content = mesCut_contentUnion(it);
    if (!cb || !content) { return n; }
    var tol = 0.5;   // pt — 반올림·헤어라인 여유
    if (content[0] < cb[0] - tol || content[1] > cb[1] + tol
        || content[2] > cb[2] + tol || content[3] < cb[3] - tol) { return n; }   // 진짜로 자르고 있다 → 둔다
    var again = [];
    try { for (var j = 0; j < it.pageItems.length; j++) { again.push(it.pageItems[j]); } } catch (e3) { return n; }
    var gone = 0;
    for (var q = 0; q < again.length; q++) {
        var isClip = false;
        try { isClip = !!again[q].clipping; } catch (e4) {}
        if (isClip) { try { again[q].remove(); gone++; n++; } catch (e5) {} }
    }
    // ⚠️ `clipped = false` 는 **실제로 지웠을 때만** 한다. 클립 패스를 못 찾았는데 플래그만 내리면
    //    그 사각 패스가 **일반 패스로 풀려** OffsetPath+Pathfinder 에 섞인다 = 고치려던 결함이 그대로
    //    재발한다(`clipBounds` 는 클립을 못 찾으면 geometricBounds 를 돌려주므로 이 분기에 들어올 수 있다).
    if (gone) { try { it.clipped = false; } catch (e6) {} }
    return n;
}

/**
 * ★재단할 수 없는 **축퇴 조각**을 칼선에서 걷어낸다 (2026-09-04 실물 발견).
 *
 * 실물 판 실측: 칼선 131개 중 **15개가 `0.01 x 0 mm` 짜리 3점 조각**이었다. 전부 컴파운드 패스
 * 안쪽 서브패스라 눈에도 안 띄고 `closed=true` 라 "닫혀 있는가" 검사도 통과한다.
 * 재단기는 이걸 만나면 **제자리에서 칼을 내렸다 올린다** — 용준님이 걱정한 "쪼개지면 재단 중 문제"가 이것이다.
 *
 * 래스터 경로에는 이미 파편 제거가 있다(`minCutPx` = 조각 넓이의 1%). **벡터 경로에만 없었다.**
 * 여기서 같은 일을 한다 — 다만 기준은 넓이 비율이 아니라 **물리 치수**다(칼날이 못 들어가는 크기).
 *
 * ⚠️ 임계는 **양쪽 여유**로 정했다. 아래가 손으로 쟰 값이 아니라는 근거다:
 *      위 — 관찰된 축퇴 조각이 **0.01mm** (10배 여유)
 *      아래 — 0.5pt 헤어라인을 면으로 바꾸면 **0.176mm** 로 이것은 **살아남아야** 한다
 *    그래서 0.2mm 가 아니라 **0.1mm** 다 — 0.2 로 잡으면 선 도안의 가는 획이 통째로 날아간다.
 * ⚠️ 글자를 합치지 않는다 — 조각마다 칼선이 따로 나오는 것은 **정상**이다(2026-09-04 용준님 정정).
 *    없애야 하는 것은 "떨어진 요소"가 아니라 "자를 수 없는 부스러기"다.
 */
var MESCUT_MIN_CUT_MM = 0.1;

function mesCut_dropCutSlivers(flat) {
    var PT = MESCUT_PT_PER_MM, lim = MESCUT_MIN_CUT_MM * PT, dropped = 0;
    function degenerate(p) {
        var b;
        try { b = p.geometricBounds; } catch (e) { return false; }
        if (!b) return false;
        return (Math.min(b[2] - b[0], b[1] - b[3]) < lim);
    }
    var keep = [];
    for (var i = 0; i < flat.length; i++) {
        var it = flat[i], t;
        try { t = it.typename; } catch (e0) { continue; }
        if (t === 'CompoundPathItem') {
            var subs = [];
            try { for (var q = 0; q < it.pathItems.length; q++) subs.push(it.pathItems[q]); } catch (e1) {}
            for (var k = 0; k < subs.length; k++) {
                if (!degenerate(subs[k])) continue;
                try { subs[k].remove(); dropped++; } catch (e2) {}
            }
            var left = 0;
            try { left = it.pathItems.length; } catch (e3) { left = 0; }
            if (!left) { try { it.remove(); } catch (e4) {} continue; }
            keep.push(it);
        } else if (t === 'PathItem') {
            if (degenerate(it)) { try { it.remove(); dropped++; } catch (e5) {} continue; }
            keep.push(it);
        } else if (t === 'GroupItem') {
            // unwrap 은 깊이 8 에서 멈춘다 → 그룹이 그대로 남을 수 있다. 그 안도 본다.
            var inner = [];
            try { for (var g = 0; g < it.pageItems.length; g++) { inner.push(it.pageItems[g]); } } catch (e6) {}
            var sub = mesCut_dropCutSlivers(inner);
            dropped += sub.dropped;
            var rest = 0;
            try { rest = it.pageItems.length; } catch (e7) { rest = 1; }
            if (!rest) { try { it.remove(); } catch (e8) {} continue; }   // 부스러기만 있던 껍데기
            keep.push(it);
        } else {
            keep.push(it);
        }
    }
    return { flat: keep, dropped: dropped };
}

function mesCut_vecSilhouette(doc, items, cutLayer, offsetMm, fillClosed, styleMode) {
    var i, s;
    var dups = [];
    for (i = 0; i < items.length; i++) {
        try { dups.push(items[i].duplicate(cutLayer, ElementPlacement.PLACEATEND)); } catch (eD) {}
    }
    if (!dups.length) return { n: 0, anchors: 0, err: '복제 실패' };
    // ★선 도안은 채우기부터 켠다 — 안 켜면 `OffsetPath v22` 가 **획만** 면으로 바꿔
    //   실루엣이 아니라 **가느다란 고리**가 나온다(실측: 70×50 사각 선도안 → 76.35 고리 + 63.65 구멍).
    if (fillClosed) {
        var kf = mesCut_blackFill();
        for (i = 0; i < dups.length; i++) mesCut_fillClosedItem(dups[i], kf);
    }
    for (i = 0; i < dups.length; i++) {
        mesCut_vecOutlineText(dups[i]);
        dups[i] = mesCut_vecCropClip(doc, dups[i]);
        // ★중첩 클립 정리 — Crop 이 못 푼 **아무것도 안 자르는** 클립을 걷어낸다.
        //   안 하면 굳힌(PDF) 조각의 사각 클립이 실루엣이 되어 칼선이 바깥 상자로 나간다.
        try { mesCut_dropNoopClips(dups[i]); } catch (eNC) {}
        mesCut_normalizeCopy(dups[i]);   // ★잠금 해제·숨김 제거·잉크 0 제거 — 안 하면 실루엣이 조용히 틀린다
    }
    doc.selection = null;
    for (i = 0; i < dups.length; i++) { try { dups[i].selected = true; } catch (eS) {} }
    // 선 → 면. 획만 있는 도안(시트컷 실도안)도 이 한 단계로 실루엣이 된다.
    app.executeMenuCommand('OffsetPath v22');
    mesCut_groupSel(doc);
    app.executeMenuCommand('Live Pathfinder Add');
    app.executeMenuCommand('expandStyle');
    if (offsetMm) {
        var sel = doc.selection, keep = [];
        var xml = '<LiveEffect name="Adobe Offset Path"><Dict data="R mlim 4 R ofst '
            + (offsetMm * MESCUT_PT_PER_MM) + ' I jntp ' + MESCUT_VEC_JOIN + ' "/></LiveEffect>';
        for (s = 0; sel && s < sel.length; s++) { try { sel[s].applyEffect(xml); keep.push(sel[s]); } catch (eA) {} }
        doc.selection = null;                                  // ★재지정 없이는 expandStyle 이 조용히 안 먹는다
        for (s = 0; s < keep.length; s++) { try { keep[s].selected = true; } catch (eK) {} }
        app.executeMenuCommand('expandStyle');
        mesCut_groupSel(doc);                                  // ★자기교차 정리
        app.executeMenuCommand('Live Pathfinder Add');
        app.executeMenuCommand('expandStyle');
    }
    // ★그룹을 풀어 레이어 직속으로 옮긴다 — **DXF 때문이다.**
    //   그룹인 채로 내보내면 일러가 `BLOCK` + `INSERT` 로 감싸고 `ENTITIES` 섹션이 사실상 빈다
    //   (실측 2026-08-02: 벡터 칼선 9개 → ENTITIES 22줄 · SPLINE 은 전부 BLOCKS 안.
    //    같은 파일을 래스터로 뽑았을 땐 SPLINE 이 ENTITIES 에 직접 있었다 = 2082줄).
    //   블록을 못 읽는 재단기에서는 **칼선이 하나도 없는 파일**로 보인다.
    //   compound path 는 풀지 않는다(구멍이 사라진다) — 그룹만 벗긴다.
    function unwrap(it, depth) {
        var t;
        try { t = it.typename; } catch (e) { return; }
        if (t !== 'GroupItem' || depth > 8) { flat.push(it); return; }
        var kids = [];
        try { for (var c = 0; c < it.pageItems.length; c++) kids.push(it.pageItems[c]); } catch (e1) {}
        for (var q = kids.length - 1; q >= 0; q--) {
            try { kids[q].move(cutLayer, ElementPlacement.PLACEATEND); } catch (e2) {}
            unwrap(kids[q], depth + 1);
        }
        try { it.remove(); } catch (e3) {}
    }
    var flat = [];
    var sel2 = doc.selection;
    for (i = 0; sel2 && i < sel2.length; i++) unwrap(sel2[i], 0);

    // ★자를 수 없는 부스러기를 걷어낸다 — **모든 경로에서** 한다(판짜기·단품·도련 다 나쁘다).
    var sv = mesCut_dropCutSlivers(flat);
    flat = sv.flat;


    var mag = mesCut_magenta();
    var out = { n: 0, anchors: 0, err: null, dropped: sv.dropped };
    function style(it) {
        var t;
        try { t = it.typename; } catch (e) { return; }
        if (t === 'PathItem') {
            try { it.filled = false; it.stroked = true; it.strokeColor = mag; it.strokeWidth = 0.6; } catch (e1) {}
            out.n++;
            try { out.anchors += it.pathPoints.length; } catch (e2) {}
        } else if (t === 'CompoundPathItem') {
            try { for (var c = 0; c < it.pathItems.length; c++) style(it.pathItems[c]); } catch (e3) {}
        } else if (t === 'GroupItem') {
            try { for (var g = 0; g < it.pageItems.length; g++) style(it.pageItems[g]); } catch (e4) {}
        }
    }
    if (styleMode !== 'none') for (i = 0; i < flat.length; i++) style(flat[i]);
    out.items = flat;
    if (!flat.length) out.err = '실루엣 생성 실패';
    return out;
}

/**
 * ★도련 — 칼선 **바깥**까지 그림이 차게 만든다 (2026-08-02 실측 기반).
 *
 * **왜 이 방식인가**: 사내 기존 도련 자산 둘 다 **색을 고르지 않는다**. 그림을 늘려서 채운다.
 *     `SheetLayout` 도련 v5      = Design 그룹의 **클립 사각을 밖으로 밀어** 원본이 더 드러나게
 *     `ProcessOrderItem` edge_strip = 가장자리 **1mm 띠를 복제해 늘려** 바깥에 붙임
 *   둘 다 **사각 전용**이라 이형 실루엣에는 못 쓴다. 여기서는 같은 원리를 이형으로 옮긴다 —
 *   **아트 사본을 도련 경계까지 늘리고 그 경계로 클리핑해 원본 뒤에 깐다.**
 *   (SheetLayout 도 클립을 못 찾으면 스케일 확대로 폴백한다 = 같은 수단)
 *
 * **수치**: 실물 3건 실측에서 인쇄 − 칼선 = **3mm/변**(806−800, 1066−1060, ~3.4).
 *   ⚠️ 인쇄물이 칼선보다 **10mm** 크다는 값은 **돔보 자리**다(중심 7 + 반지름 3). 도련이 아니다.
 *
 * @param bleedMm 칼선 바깥으로 더 채울 거리 · @param offsetMm 칼선 위치(디자인→칼선)
 * @returns {ok:bool, err}
 */
/**
 * 클립된 그룹의 **사각 클립을 바깥으로 밀어** 원본이 더 드러나게 한다(도련).
 * `SheetLayout.jsx:259~` `expandClipInGroup` 과 같은 방식 — 사내에서 검증된 수단이다.
 * ⚠️ **사각 4점 클립만** 다룬다. 임의 형상 클립에 효과를 걸면 clipping 플래그가 깨질 수 있어
 *    건드리지 않고 호출자가 확대 폴백으로 내려간다.
 * @returns 넓힌 클립 개수
 */
function mesCut_vecGrowClips(items, bleedMm) {
    var n = 0, PT = MESCUT_PT_PER_MM, b = bleedMm * PT;
    function walk(it) {
        var t;
        try { t = it.typename; } catch (e) { return; }
        if (t !== 'GroupItem') return;
        var clipped = false;
        try { clipped = !!it.clipped; } catch (e0) {}
        if (clipped) {
            for (var c = 0; c < it.pageItems.length; c++) {
                var ch = it.pageItems[c], isC = false;
                try { isC = ch.clipping; } catch (e1) {}
                if (!isC || ch.typename !== 'PathItem') continue;
                try {
                    if (!ch.closed || ch.pathPoints.length !== 4) continue;   // 사각만
                    var g = ch.geometricBounds;   // [L,T,R,B]
                    ch.setEntirePath([[g[0] - b, g[1] + b], [g[2] + b, g[1] + b],
                        [g[2] + b, g[3] - b], [g[0] - b, g[3] - b]]);
                    n++;
                } catch (e2) {}
            }
        }
        try { for (var k = 0; k < it.pageItems.length; k++) walk(it.pageItems[k]); } catch (e3) {}
    }
    for (var i = 0; i < items.length; i++) walk(items[i]);
    return n;
}

/**
 * ★도련 — **구역별**. 아트 사본의 **각 도형을 자기 색 그대로 벌린다**.
 *
 * 왜 이 방식인가(2026-08-03 용준님 지적): 이전 구현은 링 전체를 **한 색**으로 칠했다.
 *   "전체 외곽을 분석해 가장 많은 색을 넣는" 꼴이라 **구역이 여러 색이면 구조적으로 틀린다.**
 *   그룹에 Offset Path 효과를 걸면 **자식 각각이 벌어지고 색이 유지된다**(실측: 3구역 60×80 →
 *   각자 72×92, 색 3종 그대로). 그러면 링의 각 부분이 **그 자리 도형의 색**을 갖는다 —
 *   색을 고르는 판단 자체가 사라진다.
 *
 * 겹치는 부분은 **원본과 같은 순서**라 위아래 관계도 원본을 따른다.
 * 도형 수와 무관하게 효과 1회 + expand 1회다(도형마다 부르지 않는다).
 *
 * ⚠️ 래스터(사진)에는 Offset Path 가 안 먹는다 — 그 경우 사용자가 `scale`(사본 확대)을 골라야 한다.
 */
/**
 * ★사본을 "실루엣을 뜰 수 있는 상태"로 정규화한다. **이게 없으면 실루엣이 조용히 틀린다.**
 *
 * 실측 3건(2026-08-04) 전부 여기서 났다:
 *
 * ① **잠긴 하위 개체** — 실사용 조각(125.78×113.52) 안에 `locked` PathItem 이 4개 있었다
 *    (49.00×73.82 등 **가장 큰 도형들**). 그러면 `dup.selected = true` 가
 *    `Error 9063: Trying to select locked or hidden art` 로 거부되고, 일러는 대신
 *    **선택 가능한 자식 25개만** 고른다 → 잠긴 도형이 빠진 채로 실루엣이 떠서
 *    125.78×113.52 여야 할 것이 **114.75×89.89** 로 작게 나왔다.
 *    예외를 던지지도, 0개를 내지도 않고 **그럴듯한 오답**을 낸다 — 가장 나쁜 실패 방식이다.
 *
 * ② **숨긴 개체** — 같은 이유로 선택을 막는다. 안 보이는 것은 인쇄되지 않으므로
 *    실루엣에도 들어가면 안 된다 → **지운다**(잠금은 풀고, 숨김은 뺀다. 반대로 하면 틀린다).
 *
 * ③ **잉크 0 패스** — `PathItem 0.0x0.0`(점 패스) 하나만 섞여도
 *    `OffsetPath v22 → Live Pathfinder Add` 가 아무 결과도 못 내고 실루엣이 **0개**가 된다
 *    (A/B 재현 확인). 무제-2 실물에도 있었다.
 *
 * ⚠️ `clipping` 패스는 절대 지우지 않는다 — 클립이 풀려 **잘려 있던 그림이 드러난다**.
 * ⚠️ CompoundPathItem 안으로는 안 들어간다 — 자식이 하나의 도형(구멍)이라 빼면 모양이 바뀐다.
 * ⚠️ 잠금 해제는 **위에서 아래로** — 잠긴 부모 안의 자식은 손댈 수 없다.
 * 사본에만 적용한다(원본 무손상).
 * @returns 지운 개수
 */
function mesCut_normalizeCopy(it) {
    var t;
    try { t = it.typename; } catch (e) { return 0; }
    try { if (it.locked) it.locked = false; } catch (e1) {}
    var hid = false;
    try { hid = it.hidden; } catch (e2) {}
    if (hid) { try { it.remove(); return 1; } catch (e3) { return 0; } }
    if (t === 'GroupItem') {
        var kids = [], c, removed = 0;
        try { for (c = 0; c < it.pageItems.length; c++) kids.push(it.pageItems[c]); } catch (e4) {}
        for (c = kids.length - 1; c >= 0; c--) removed += mesCut_normalizeCopy(kids[c]);
        return removed;
    }
    if (t !== 'PathItem') return 0;
    try { if (it.clipping) return 0; } catch (e5) {}
    var drop = false;
    try { drop = (!it.filled && !it.stroked); } catch (e6) {}
    if (!drop) {
        try {
            var b = it.geometricBounds;
            drop = ((b[2] - b[0]) < 0.01 && (b[1] - b[3]) < 0.01);
        } catch (e7) {}
    }
    if (drop) { try { it.remove(); return 1; } catch (e8) {} }
    return 0;
}

/** 도련 경계 = 실루엣 + growMm. 칼선과 **같은 엔진**이라 모양이 정확히 겹친다(동심). */
function mesCut_vecBleedBoundary(doc, items, layer, growMm, fillClosed) {
    var sil = mesCut_vecSilhouette(doc, items, layer, growMm, fillClosed, 'none');
    if (!sil || !sil.items || !sil.items.length) return null;
    doc.selection = null;
    for (var i = 0; i < sil.items.length; i++) { try { sil.items[i].selected = true; } catch (e) {} }
    // 경계가 여러 개면 하나의 compound 로 — 클리핑 마스크는 **한 개체**만 쓸 수 있다
    if (sil.items.length > 1) app.executeMenuCommand('compoundPath');
    var shp = null;
    try { shp = doc.selection[0]; } catch (e2) {}
    return shp;
}

/** clipShape 를 마스크로 targets 를 클리핑한다. 마스크는 **맨 위** 개체여야 한다. */
function mesCut_maskWith(doc, clipShape, targets) {
    doc.selection = null;
    for (var i = 0; i < targets.length; i++) { try { targets[i].selected = true; } catch (e) {} }
    try { clipShape.selected = true; } catch (e1) {}
    try { clipShape.zOrder(ZOrderMethod.BRINGTOFRONT); } catch (e2) {}
    app.executeMenuCommand('makeMask');
    var g = null;
    try { g = doc.selection[0]; } catch (e3) {}
    // ★"선택이 남아 있다" 를 성공으로 보면 안 된다 — makeMask 가 거부되면 **선택이 그대로** 남는다.
    //   진짜 성공의 증거는 결과가 **clipped 그룹**이라는 것뿐이다. 아니면 실패로 본다.
    try { if (!(g && g.typename === 'GroupItem' && g.clipped)) return null; } catch (e4) { return null; }
    return g;
}

/**
 * ★도련 ①: **여백 구간 단색** — 여백이 있으면 링 전체를 고른 한 색으로 채운다.
 *
 * 왜(2026-08-04 용준님 결정): 여백은 칼선을 잉크보다 바깥에 두는 **의도된 테두리**다.
 * 그 자리에 아트는 아무것도 없으므로 무엇을 넣든 합성이고, 스티커 테두리는 실무상 균일한 색이다.
 * 도형별 오프셋을 아예 안 쓰므로 **내부 선이 밖으로 나오는 문제가 원천적으로 없다**.
 * @returns 성공 시 도련 도형
 */
function mesCut_vecBleedSolid(doc, items, layer, growMm, fillClosed, ringColor) {
    var shp = mesCut_vecBleedBoundary(doc, items, layer, growMm, fillClosed);
    if (!shp) return null;
    // ★색은 **깊이 들어가 칠한다**. 경계가 GroupItem·CompoundPathItem 이면 겉면에 `filled` 를
    //   세워도 안 먹거나 예외가 난다 — 그러면 실루엣 파이프라인이 만든 **원래 색(대개 검정)**이
    //   그대로 남는다. 2026-08-04 실사용에서 "도련이 검정 단색으로 나온다"가 정확히 이것이었다.
    var n = mesCut_setFillDeep(shp, ringColor || mesCut_ringFill(null));
    if (!n) { try { shp.remove(); } catch (e) {} return null; }   // 못 칠했으면 **반드시 지운다**
    try { shp.zOrder(ZOrderMethod.SENDTOBACK); } catch (e1) {}
    return shp;
}

/** 도형(그룹·compound 포함) 전체를 한 색 면으로 만든다. @returns 칠한 패스 수 */
function mesCut_setFillDeep(it, color) {
    var t;
    try { t = it.typename; } catch (e) { return 0; }
    if (t === 'PathItem') {
        try { it.filled = true; it.fillColor = color; it.stroked = false; return 1; } catch (e1) { return 0; }
    }
    if (t === 'CompoundPathItem') {
        // compound 는 **자식 전부**를 같은 색으로 — 하나만 다르면 구멍이 색으로 메워진다
        var m = 0;
        try { for (var c = 0; c < it.pathItems.length; c++) m += mesCut_setFillDeep(it.pathItems[c], color); } catch (e2) {}
        return m;
    }
    if (t === 'GroupItem') {
        var g = 0;
        try { for (var k = 0; k < it.pageItems.length; k++) g += mesCut_setFillDeep(it.pageItems[k], color); } catch (e3) {}
        return g;
    }
    return 0;
}

/**
 * ★도련 ②: **가장자리 띠에서 색을 뽑아 바깥으로 연장** (여백 ≤ 0 · 아트가 칼선까지 차는 경우)
 *
 * 왜 도형별 오프셋을 못 쓰는가(2026-08-04 용준님 지적): 사본의 **모든 도형**이 커지므로
 * 가장자리에서 d 만큼 안쪽에 있던 선이 (여백+도련) − d 만큼 실루엣 밖으로 튀어나온다.
 * 클리핑은 바깥 경계만 막을 뿐 **링 안으로 들어오는 것은 못 막는다**. 원리상 한계다.
 *
 * 그래서 색을 **가장자리에서만** 뽑는다:
 *   S      = 실루엣(오프셋 0)
 *   Sin    = S 를 안쪽으로 bandMm
 *   band   = S − Sin                 ← 가장자리 bandMm 폭의 띠
 *   edge   = 아트 ∩ band             ← 그 자리에 **실제로 보이는 색**만, 위치별로
 *   결과   = edge 를 (grow + bandMm) 만큼 바깥으로 오프셋 → Sout 으로 클리핑
 * 내부 선은 띠에 안 들어오므로 밖으로 못 나간다. 가장자리 키라인은 띠에 들어와 정상적으로 이어진다.
 */
function mesCut_vecBleedEdge(doc, items, layer, growMm, fillClosed) {
    var i, bandMm = 0.5, PT = MESCUT_PT_PER_MM;
    var trash = [];
    function junk(x) { if (x) trash.push(x); }
    function cleanup() { for (var t = 0; t < trash.length; t++) { try { trash[t].remove(); } catch (e) {} } }
    function selArr() {
        var a = [];
        try { for (var s = 0; s < doc.selection.length; s++) a.push(doc.selection[s]); } catch (e) {}
        return a;
    }
    function pick(arr) { doc.selection = null; for (var s = 0; s < arr.length; s++) { try { arr[s].selected = true; } catch (e) {} } }

    var Sout = mesCut_vecBleedBoundary(doc, items, layer, growMm, fillClosed);
    if (!Sout) return null;
    junk(Sout);
    var S = mesCut_vecBleedBoundary(doc, items, layer, 0, fillClosed);
    if (!S) { cleanup(); return null; }
    junk(S);
    // Sin = S 안쪽 bandMm
    var Sin = null;
    try { Sin = S.duplicate(layer, ElementPlacement.PLACEATEND); } catch (e0) {}
    if (!Sin) { cleanup(); return null; }
    var inXml = '<LiveEffect name="Adobe Offset Path"><Dict data="R mlim 4 R ofst '
        + (-bandMm * PT) + ' I jntp ' + MESCUT_VEC_JOIN + ' "/></LiveEffect>';
    try { Sin.applyEffect(inXml); } catch (e1) { junk(Sin); cleanup(); return null; }
    pick([Sin]); app.executeMenuCommand('expandStyle');
    var sinArr = selArr();
    // band = S − Sin  (Minus Front → 빼는 쪽이 **앞**에 있어야 한다)
    var sDup = null;
    try { sDup = S.duplicate(layer, ElementPlacement.PLACEATEND); } catch (e2) {}
    if (!sDup) { for (i = 0; i < sinArr.length; i++) junk(sinArr[i]); cleanup(); return null; }
    pick(sinArr.concat([sDup]));
    for (i = 0; i < sinArr.length; i++) { try { sinArr[i].zOrder(ZOrderMethod.BRINGTOFRONT); } catch (e3) {} }
    app.executeMenuCommand('Live Pathfinder Subtract');
    app.executeMenuCommand('expandStyle');
    var band = selArr();
    if (!band.length) { cleanup(); return null; }
    // edge = 아트 ∩ band  (Crop → 남길 범위가 **맨 위**)
    var dups = [];
    for (i = 0; i < items.length; i++) {
        try { dups.push(items[i].duplicate(layer, ElementPlacement.PLACEATEND)); } catch (e4) {}
    }
    if (!dups.length) { for (i = 0; i < band.length; i++) junk(band[i]); cleanup(); return null; }
    for (i = 0; i < dups.length; i++) mesCut_normalizeCopy(dups[i]);
    if (fillClosed) { var kf = mesCut_blackFill(); for (i = 0; i < dups.length; i++) mesCut_fillClosedItem(dups[i], kf); }
    pick(dups.concat(band));
    for (i = 0; i < band.length; i++) { try { band[i].zOrder(ZOrderMethod.BRINGTOFRONT); } catch (e5) {} }
    app.executeMenuCommand('Live Pathfinder Crop');
    app.executeMenuCommand('expandStyle');
    var edge = selArr();
    if (!edge.length) { cleanup(); return null; }
    // 띠를 바깥으로 — 띠 자체 폭(bandMm)까지 더해야 링 끝까지 찬다
    var outXml = '<LiveEffect name="Adobe Offset Path"><Dict data="R mlim 4 R ofst '
        + ((growMm + bandMm) * PT) + ' I jntp ' + MESCUT_VEC_JOIN + ' "/></LiveEffect>';
    for (i = 0; i < edge.length; i++) { try { edge[i].applyEffect(outXml); } catch (e6) {} }
    pick(edge);
    app.executeMenuCommand('expandStyle');
    var grown = selArr();
    if (!grown.length) grown = edge;
    // Sout 으로 클리핑 — 여기서 trash 에서 Sout 을 뺀다(마스크로 소비된다)
    for (i = 0; i < trash.length; i++) { if (trash[i] === Sout) { trash.splice(i, 1); break; } }
    var masked = mesCut_maskWith(doc, Sout, grown);
    cleanup();
    if (!masked) return null;
    try { masked.zOrder(ZOrderMethod.SENDTOBACK); } catch (e7) {}
    return masked;
}

/**
 * ★링에 닿을 수 없는 **안쪽 도형**을 사본에서 버린다. 도련의 핵심 장치다.
 *
 * 문제(2026-08-04 실사용 3건): 도형별 오프셋은 아트의 **모든 도형**을 키운다.
 *   가장자리에서 d 안쪽에 있던 선이 (여백+도련) − d 만큼 실루엣 밖으로 나와
 *   내부 선이 뭉치고(분홍 여자) · 열린 선 끝이 반원이 되고(파란 남자아이) ·
 *   검정 선이 윤곽 밖으로 삐져나왔다(토끼). 클리핑은 바깥만 막을 뿐 링 **안으로**
 *   들어오는 것은 못 막는다.
 *
 * 해법: 오프셋 **전에** "아무리 커져도 링에 못 닿는" 도형을 지운다.
 *   기준 = 아트 bbox 를 grow 만큼 안쪽으로 줄인 사각(keepRect). 여기 **완전히** 들어간
 *   리프 패스는 grow 만큼 커져도 바깥 경계에 닿지 못한다.
 *
 * ⚠️ 오목한 부분에서는 이 판정이 헐거워, 실제로 가장자리를 만드는 도형이 지워질 수 있다.
 *    그때 링의 그 자리 색은 **구멍이 나는 게 아니라** 더 바깥에 있는 도형(대개 배경)의 색이 된다.
 *    색이 조금 덜 맞는 것이지 없어지는 것이 아니라서 감수한다 — 반대(내부 선이 튀어나옴)는 못 쓴다.
 * ⚠️ 클리핑 패스는 건드리지 않는다(지우면 잘린 그림이 드러난다).
 * @param keepRect [L,T,R,B] pt · y-up
 * @returns 지운 개수
 */
/**
 * 윤곽선을 **촘촘한 점열**로 만든다 — 앵커만 쓰면 긴 직선 구간의 한가운데가 비어
 * 거기 닿아 있는 도형이 "멀다"고 오판된다(윤곽 도형이 지워져 링에 구멍).
 * 세그먼트를 stepPt 간격으로 쪼갠다. 베지어는 직선 근사로 충분하다(판정용 거리라 오차가 안전 방향).
 */
function mesCut_densifyOutline(it, out, stepPt, cap) {
    var t;
    try { t = it.typename; } catch (e) { return; }
    if (t === 'CompoundPathItem') {
        try { for (var c = 0; c < it.pathItems.length; c++) mesCut_densifyOutline(it.pathItems[c], out, stepPt, cap); } catch (e1) {}
        return;
    }
    if (t === 'GroupItem') {
        try { for (var g = 0; g < it.pageItems.length; g++) mesCut_densifyOutline(it.pageItems[g], out, stepPt, cap); } catch (e2) {}
        return;
    }
    if (t !== 'PathItem') return;
    try {
        var pp = it.pathPoints, n = pp.length;
        for (var i = 0; i < n && out.length < cap; i++) {
            var a = pp[i].anchor, b = pp[(i + 1) % n].anchor;
            out.push(a);
            var dx = b[0] - a[0], dy = b[1] - a[1];
            var len = Math.sqrt(dx * dx + dy * dy);
            var k = Math.floor(len / stepPt);
            if (k > 200) k = 200;                       // 병적으로 긴 변 방어
            for (var s = 1; s < k && out.length < cap; s++) {
                out.push([a[0] + dx * (s / k), a[1] + dy * (s / k)]);
            }
        }
    } catch (e3) {}
}

/** 도형(트리)의 앵커 좌표를 모은다. stride 로 솎아 개수를 제한한다. */
function mesCut_collectAnchors(it, out, stride) {
    var t;
    try { t = it.typename; } catch (e) { return; }
    if (t === 'PathItem') {
        try {
            var pp = it.pathPoints;
            for (var i = 0; i < pp.length; i += stride) out.push(pp[i].anchor);
        } catch (e1) {}
        return;
    }
    if (t === 'CompoundPathItem') {
        try { for (var c = 0; c < it.pathItems.length; c++) mesCut_collectAnchors(it.pathItems[c], out, stride); } catch (e2) {}
        return;
    }
    if (t === 'GroupItem') {
        try { for (var g = 0; g < it.pageItems.length; g++) mesCut_collectAnchors(it.pageItems[g], out, stride); } catch (e3) {}
    }
}

/**
 * ★실루엣 윤곽에서 **멀리 떨어진** 도형을 버린다 — 도련 링을 오염시키는 것은 그것들뿐이다.
 *
 * bbox 기준(옛 mesCut_pruneInterior)의 실패(2026-08-04 실사용): 아트 bbox 를 줄인 사각으로
 * 판정하면 **오목한 부분**에서 실제로 가장자리를 만드는 도형까지 지워져 **링에 구멍이 뚫렸고**,
 * 반대로 bbox 가장자리 근처지만 실루엣에서는 먼 도형은 살아남아 **내부 선이 계속 링을 방해했다**.
 * 두 증상이 같은 원인(잘못된 거리 척도)에서 나왔다.
 *
 * 이제 실루엣 윤곽의 **앵커까지의 실제 거리**로 잰다:
 *   · 윤곽에서 maxDist(=여백+도련) 안에 있으면 → 링에 닿을 수 있다 → 남긴다(구멍 방지)
 *   · 그보다 멀면 아무리 커져도 링에 못 닿는다 → 버린다(내부 선 침입 방지)
 * 오목·볼록에 무관하게 성립한다. 판정은 bbox↔점 거리라 도형이 커도 **남기는 쪽**으로 기운다.
 * @param pts 실루엣 앵커 배열 · @param maxDistPt 허용 거리(pt)
 */
function mesCut_pruneFarFrom(it, pts, maxDistPt) {
    var t;
    try { t = it.typename; } catch (e) { return 0; }
    if (t === 'GroupItem') {
        var kids = [], c, n = 0;
        try { for (c = 0; c < it.pageItems.length; c++) kids.push(it.pageItems[c]); } catch (e1) {}
        for (c = kids.length - 1; c >= 0; c--) n += mesCut_pruneFarFrom(kids[c], pts, maxDistPt);
        try { if (it.pageItems.length === 0) it.remove(); } catch (e2) {}
        return n;
    }
    if (t !== 'PathItem' && t !== 'CompoundPathItem') return 0;
    try { if (t === 'PathItem' && it.clipping) return 0; } catch (e3) {}
    var b;
    try { b = it.visibleBounds; } catch (e4) { return 0; }   // [L,T,R,B] y-up
    var lim2 = maxDistPt * maxDistPt;
    for (var i = 0; i < pts.length; i++) {
        var px = pts[i][0], py = pts[i][1];
        var dx = (b[0] - px > 0) ? (b[0] - px) : ((px - b[2] > 0) ? (px - b[2]) : 0);
        var dy = (b[3] - py > 0) ? (b[3] - py) : ((py - b[1] > 0) ? (py - b[1]) : 0);
        if (dx * dx + dy * dy <= lim2) return 0;   // 윤곽 근처 → 남긴다
    }
    try { it.remove(); return 1; } catch (e5) {}
    return 0;
}

function mesCut_pruneInterior(it, keepRect) {
    var t;
    try { t = it.typename; } catch (e) { return 0; }
    if (t === 'GroupItem') {
        var kids = [], c, n = 0;
        try { for (c = 0; c < it.pageItems.length; c++) kids.push(it.pageItems[c]); } catch (e1) {}
        for (c = kids.length - 1; c >= 0; c--) n += mesCut_pruneInterior(kids[c], keepRect);
        // 자식이 다 비면 빈 그룹도 치운다(빈 그룹은 오프셋·확장에서 잡음이 된다)
        try { if (it.pageItems.length === 0) it.remove(); } catch (e2) {}
        return n;
    }
    if (t !== 'PathItem' && t !== 'CompoundPathItem') return 0;
    try { if (t === 'PathItem' && it.clipping) return 0; } catch (e3) {}
    var b;
    try { b = it.visibleBounds; } catch (e4) { return 0; }   // [L,T,R,B] y-up
    if (b[0] >= keepRect[0] && b[2] <= keepRect[2] && b[1] <= keepRect[1] && b[3] >= keepRect[3]) {
        try { it.remove(); return 1; } catch (e5) {}
    }
    return 0;
}

function mesCut_vecBleedRegions(doc, items, offsetMm, bleedMm, fillClosed) {
    var i, layer = null;
    try { layer = items[0].layer; } catch (e0) {}
    if (!layer) layer = doc.activeLayer;
    var dups = [];
    for (i = 0; i < items.length; i++) {
        try { dups.push(items[i].duplicate(layer, ElementPlacement.PLACEATEND)); } catch (e1) {}
    }
    if (!dups.length) return { ok: false, code: 'dup', err: '아트 복제 실패' };
    // ★칼선과 **같은 정규화**를 거쳐야 한다 — 잠긴 도형이 남으면 선택이 거부(9063)돼
    //   도련도 실루엣과 같은 방식으로 조용히 틀린다(2026-08-04 실측).
    for (i = 0; i < dups.length; i++) mesCut_normalizeCopy(dups[i]);
    // ★★안쪽 도형 제거 — 이게 없으면 내부 선이 링 밖으로 튀어나온다(실사용 3건의 원인).
    //   grow = 여백 + 도련. 아트 bbox 를 그만큼 줄인 사각 안에 완전히 든 도형은 링에 못 닿는다.
    var growPt = (offsetMm + bleedMm) * MESCUT_PT_PER_MM;
    var ab0 = null;
    for (i = 0; i < dups.length; i++) {
        var vb = null;
        try { vb = dups[i].visibleBounds; } catch (eB) {}
        if (!vb) continue;
        if (!ab0) ab0 = [vb[0], vb[1], vb[2], vb[3]];
        else {
            if (vb[0] < ab0[0]) ab0[0] = vb[0];
            if (vb[1] > ab0[1]) ab0[1] = vb[1];
            if (vb[2] > ab0[2]) ab0[2] = vb[2];
            if (vb[3] < ab0[3]) ab0[3] = vb[3];
        }
    }
    // ★기준 = **실루엣 윤곽까지의 실제 거리**. bbox 로 재던 옛 방식은 오목부에서 링에 구멍을 냈고
    //   동시에 내부 선 침입도 못 막았다(2026-08-04 실사용). 실루엣을 한 번 더 뜨는 비용(~2초)을 낸다.
    // ★★기준 = "링에 **닿을 수 있나**"가 아니라 "실제로 **윤곽을 만드나**"다 (2026-08-04 3차 수정).
    //   `grow` 안이면 남기는 규칙은 가장자리 근처의 **내부 선까지 전부** 살려서, 그것들이 저마다
    //   오프셋되어 도련이 지저분해졌다. 링에 색을 줄 자격이 있는 것은 **윤곽에 닿아 있는 도형**뿐이다.
    //   → 허용 거리를 윤곽 접촉 수준(MESCUT_BLEED_TOUCH_MM)으로 좁힌다.
    //   구멍이 안 나려면 윤곽을 **촘촘히 샘플링**해야 한다(앵커만 쓰면 긴 변 한가운데가 비어
    //   거기 닿은 도형이 지워진다) → densify.
    var pruned = 0;
    var silRef = mesCut_vecBleedBoundary(doc, items, layer, 0, fillClosed);
    if (silRef) {
        var pts = [];
        var stepPt = MESCUT_BLEED_TOUCH_MM * MESCUT_PT_PER_MM;
        mesCut_densifyOutline(silRef, pts, stepPt, 6000);
        if (!pts.length) mesCut_collectAnchors(silRef, pts, 1);
        if (pts.length) {
            var touchPt = MESCUT_BLEED_TOUCH_MM * MESCUT_PT_PER_MM;
            for (i = 0; i < dups.length; i++) pruned += mesCut_pruneFarFrom(dups[i], pts, touchPt);
        }
        try { silRef.remove(); } catch (eSR) {}
    }
    // 남은 것이 하나도 없으면 도련을 만들 수 없다 — 조용히 빈 링을 두지 않는다
    var alive = 0;
    for (i = 0; i < dups.length; i++) { try { if (dups[i].typename) alive++; } catch (eA) {} }
    if (!alive) return { ok: false, code: 'noedge', err: '윤곽에 닿는 도형이 없습니다' };
    // ★★열린 획을 **먼저 면으로** 바꾼다 — 안 하면 끝이 볼록한 **반원**이 되어 링에 튀어나온다.
    //   가장자리에 닿는 선은 프루닝에서 살아남으므로(닿으니까) 이 처리가 없으면 그 선만 남아
    //   여전히 반원이 보인다(2026-08-04 용준님 지적 · 파란 남자아이에서 실제로 나왔던 증상).
    //   열린 패스에 Offset Path 를 바로 걸면 조인 종류와 무관하게 **캡**이 생긴다 —
    //   닫힌 면으로 바꿔야 조인 규칙이 적용된다.
    //   실측(길이40·획1·오프셋6 · 면적 mm²): 이론 사각 676.0
    //     획 그대로+라운드 552.0(곡면) · 아웃라인+라운드 604.0 · 아웃라인+베벨 604.0
    //     **아웃라인+마이터(mlim2) 676.0 = 이론값과 정확히 일치(평평)**
    doc.selection = null;
    for (i = 0; i < dups.length; i++) { try { dups[i].selected = true; } catch (eS0) {} }
    app.executeMenuCommand('OffsetPath v22');   // = Object > Path > Outline Stroke
    dups = [];
    try { for (i = 0; i < doc.selection.length; i++) dups.push(doc.selection[i]); } catch (eS1) {}
    if (!dups.length) return { ok: false, code: 'outline', err: '획 아웃라인 실패' };
    if (fillClosed) {
        var kf = mesCut_blackFill();
        for (i = 0; i < dups.length; i++) mesCut_fillClosedItem(dups[i], kf);
    }
    // 실패하면 사본을 반드시 지운다 — 안 지우면 **원본과 똑같은 그림이 인쇄 레이어에 한 벌 더** 남는다.
    //   실측(2026-08-04 무제-2): art 레이어에 125.78×113.52 그룹이 2개였고 둘 다 같은 크기였다.
    //   눈에 안 보여서(정확히 겹침) 아무도 모르고, 파일만 두 배가 되며 RIP 에서 겹침 인쇄가 된다.
    //   `extra` = 확장으로 새로 생긴 것들(원래 사본 참조는 그때 죽는다). 둘 다 치운다.
    function bail(code, err, extra) {
        var b;
        for (b = 0; extra && b < extra.length; b++) { try { extra[b].remove(); } catch (eX0) {} }
        for (b = 0; b < dups.length; b++) { try { dups[b].remove(); } catch (eX) {} }
        return { ok: false, code: code, err: err };
    }
    doc.selection = null;
    for (i = 0; i < dups.length; i++) { try { dups[i].selected = true; } catch (e2) {} }
    // ★선택이 **실제로 됐는지** 본다. `selected = true` 는 잠금·숨김이 아니어도 실패한다 —
    //   실측(2026-08-04 무제-2): 중첩 그룹 아트에서 `Error 9063: Trying to select locked or hidden art`.
    //   여태 이 줄이 try/catch 로 삼켜져서 선택이 빈 채로 진행됐고, 뒤에서 '사본 그룹 실패'라는
    //   **엉뚱한 사유**가 나왔다. 진짜 사유를 따로 알린다.
    var selN = 0;
    try { selN = doc.selection ? doc.selection.length : 0; } catch (e2b) {}
    if (!selN) return bail('select', '사본 선택 실패(잠금·숨김 아님 — 일러 9063)');
    mesCut_groupSel(doc);
    var copy = null;
    try { copy = doc.selection[0]; } catch (e3) {}
    if (!copy) return bail('group', '사본 그룹 실패');
    // ★visibleBounds 로 잰다 — geometricBounds 는 **라이브 효과를 안 센다**.
    //   확장에 실패해 효과가 라이브로 남는 정상 경로를 geometricBounds 로 재면 "안 커졌다"고 오판한다.
    var pre = null;
    try { pre = copy.visibleBounds; } catch (e3b) {}
    // 벌리는 양 = 여백 + 도련 (인쇄가 칼선보다 도련만큼 더 나가야 한다)
    var xml = '<LiveEffect name="Adobe Offset Path"><Dict data="R mlim ' + MESCUT_BLEED_MLIM + ' R ofst '
        + ((offsetMm + bleedMm) * MESCUT_PT_PER_MM) + ' I jntp ' + MESCUT_BLEED_JOIN + ' "/></LiveEffect>';
    try { copy.applyEffect(xml); } catch (e4) { return bail('effect', '오프셋 효과 실패: ' + e4); }
    // ★여기서부터 도련은 **이미 존재한다**(라이브 효과). expand 는 굳히기일 뿐이다.
    //   그래서 expand 가 실패해도 **되돌리지 않는다** — 라이브 효과인 채로도 EPS·PDF·RIP 는
    //   정확히 출력한다. 예전엔 expand 실패를 곧 도련 실패로 보고 아무것도 안 남겼다.
    doc.selection = null;
    var expanded = false;
    try { copy.selected = true; expanded = !!(doc.selection && doc.selection.length); } catch (e5) {}
    if (expanded) app.executeMenuCommand('expandStyle');
    // ★확장 결과는 **여기서 뒤로 보내지 않는다**. 하나씩 SENDTOBACK 하면 서로의 순서가 뒤집혀
    //   겹친 구역의 위아래가 원본과 달라진다. 클리핑까지 끝낸 **그룹 하나**를 마지막에 보낸다.
    var res = null;
    if (expanded) { res = []; try { for (i = 0; i < doc.selection.length; i++) res.push(doc.selection[i]); } catch (e6) { res = null; } }
    var n = (res && res.length) ? res.length : 1;
    // ★진짜로 커졌는지 **재본다**. 효과만 걸리고 아무 일도 안 일어나면 폭은 그대로다 —
    //   그걸 성공으로 보고하면 "도련 있다"는 말만 남고 실물엔 없다(2026-08-04 무제-2 가 그 상태였다).
    //   확장하면 `copy` 참조가 죽으므로 확장 결과(res)에서 재고, 그게 없을 때만 copy 를 본다.
    var post = null;
    if (res && res.length) {
        var x0 = null, x1 = null;
        for (i = 0; i < res.length; i++) {
            try {
                var rb = res[i].visibleBounds;
                if (x0 === null || rb[0] < x0) x0 = rb[0];
                if (x1 === null || rb[2] > x1) x1 = rb[2];
            } catch (e8) {}
        }
        if (x0 !== null) post = [x0, 0, x1, 0];
    }
    if (!post) { try { post = copy.visibleBounds; } catch (e9) {} }
    var want = (offsetMm + bleedMm) * 2;
    if (pre && post && want > 0) {
        var grew = ((post[2] - post[0]) - (pre[2] - pre[0])) / MESCUT_PT_PER_MM;
        if (grew < want * 0.5) return bail('noexpand', '오프셋이 먹지 않았습니다(커진 폭 ' + grew.toFixed(2) + 'mm)', res);
    }

    // ────────────────────────────────────────────────────────────────
    // ★★ 도련 경계로 **반드시 잘라낸다** (2026-08-04 실사용 3건으로 확인)
    //
    // 오프셋만 걸고 끝내면 아트의 **모든 도형이** 커진다 — 바깥 윤곽만 커지는 게 아니다.
    // 실사용에서 나온 증상이 전부 이 한 가지 원인이었다:
    //   · 분홍 여자  = 내부 선들이 (여백+도련)만큼 굵어져 서로 먹으며 그림이 뭉갬
    //   · 파란 남자아이 = 열린 선의 끝이 라운드 조인으로 **반원**이 되어 튀어나옴
    //   · 토끼       = 내부 검정 선이 굵어져 **바깥 윤곽을 넘어** 삐져나옴
    // 도련은 "바깥으로 3mm 더 인쇄"지 "그림을 굵게"가 아니다. 경계 밖은 존재하면 안 된다.
    //
    // 경계 = 실루엣 + (여백+도련) — 칼선과 같은 엔진이라 **정확히 동심**이다.
    // 잘라내고 나면:
    //   · 링에는 그 자리 도형의 **제 색**이 그대로 온다(구역별의 목적은 유지)
    //   · 내부의 뭉갠 부분·반원은 **원본 뒤에 가려** 보이지 않는다
    //   · 경계 밖으로는 아무것도 안 나간다
    // ⚠️ 비용 = 조각당 실루엣 1회 추가. 정확성이 우선이라 감수한다(spec §6.31).
    var bnd = mesCut_vecBleedBoundary(doc, items, layer, offsetMm + bleedMm, fillClosed);
    if (!bnd) return bail('sil', '도련 경계 생성 실패', res);
    var targets = (res && res.length) ? res : [copy];
    var masked = mesCut_maskWith(doc, bnd, targets);
    // 클리핑에 실패하면 **지운다**. 안 지우고 두면 굵어진 도형이 칼선 밖으로 나가
    // 옆 조각을 침범한다 — 그게 이번에 보고된 증상 그대로다. 없는 편이 낫고, 사유를 알린다.
    if (!masked) { try { bnd.remove(); } catch (eM) {} return bail('mask', '도련 클리핑 실패', res); }
    // 원본 **뒤**로 — 도련은 원본에 가려야 한다(원본이 위)
    try { masked.zOrder(ZOrderMethod.SENDTOBACK); } catch (e10) {}
    return { ok: true, mode: expanded ? 'region' : 'region-live', n: n, code: null, err: null };
}

/**
 * ⚠️ **레거시 — 네스팅(`mesCut_nestApply`)은 더 이상 이 함수를 쓰지 않는다**(2026-08-05 배선).
 *    정본은 `mesCut_bleedPlaceItem`(Repeat Last Pixel PNG)이고, 계층은 클립 확장 → 픽셀 → 단색이다.
 *    여기 남은 `region`/`scale`/`edge` 분기는 **전부 실패로 판명된 방식**이며, P1(`mesCut_vecCut`)
 *    단일 경로가 아직 이 함수를 부르기 때문에만 살아 있다. P1 을 전환하면 통째로 지운다.
 *    되살리려는 사람은 `mesCut_bleedPlaceItem` 의 주석(1차 출처 4건)을 먼저 반박할 것.
 */
function mesCut_vecBleed(doc, items, offsetMm, bleedMm, fillClosed, bleedMode, ringSpec) {
    if (!(bleedMm > 0)) return { ok: false, code: 'zero', err: '도련 0' };
    var i;
    // ★①먼저 **클립 확장**을 시도한다 — 실물이 하는 방식이다.
    //   실측(음악사랑 82x132): 클립 806×1306 안에 3134×2056 짜리 원본이 들어 있었다.
    //   즉 도련은 **합성한 것이 아니라 원래 있던 그림을 3mm 더 드러낸 것**이다.
    //   클립을 넓히면 왜곡도 빈 곳도 없다(SheetLayout 도련 v5 와 같은 수단).
    // ★넓히는 양은 **여백 + 도련**이다 — 인쇄는 칼선(=잉크+여백)보다 도련만큼 더 나가야 한다.
    //   여기서 bleedMm 만 쓰면 인쇄 끝이 칼선과 겹쳐 **도련이 0** 이 된다(2026-08-02 실측에서 걸림).
    bleedMode = bleedMode || 'auto';
    // 방식 — 품질이 다르므로 호출자가 **어느 것을 썼는지 반드시 알린다**:
    //   auto   = ①클립 확장(무손실) → 안 되면 ②아래 규칙                ← 기본
    //   region = ①을 건너뛰고 곧장 ② (클립이 있어도)
    //     ② 여백 > 0 → `solid`  : 링 전체를 단색으로(기본 흰색 · ringSpec 으로 지정)
    //        여백 ≤ 0 → 사본 확대로 **색을 이어붙인다**(아래) → 실패해야 solid
    //   scale  = 사본 확대(옛 방식) — 래스터(사진)처럼 오프셋이 안 먹는 아트용.
    //            ⚠️ 이형에서 링이 빈다(별 19.8% 실측)
    // ⚠️ 옛 `vecBleedRegions`(도형별 오프셋)는 **더 쓰지 않는다** — 원리상 내부 선이 밖으로 나온다.
    //    함수는 남겨 뒀다(비교·회귀 확인용). 되살리려면 왜 안 되는지부터 다시 읽을 것.
    if (bleedMode === 'auto') {
        var grown = mesCut_vecGrowClips(items, offsetMm + bleedMm);
        if (grown > 0) return { ok: true, mode: 'clip', grown: grown, err: null };
    }
    // ① 도련 경계 = 실루엣 + (여백 + 도련). 칼선과 **같은 엔진**이라 모양이 정확히 겹친다.
    var layer = null;
    try { layer = items[0].layer; } catch (e0) {}
    if (!layer) layer = doc.activeLayer;
    if (bleedMode !== 'scale') {
        // ★★2026-08-04 정정 — **도련에 흰색을 넣으면 안 된다.**
        //
        //   앞서 "여백 구간은 아트가 없는 합성 자리니 단색이 맞다"는 결정을 **도련까지** 확대 적용해
        //   링 전체를 흰색으로 칠했다. 그건 도련이 아니다 — 재단이 밀리면 **흰 줄이 그대로 보인다**.
        //   도련의 존재 이유가 그 흰 줄을 없애는 것이므로 정확히 반대로 동작한 셈이다.
        //   (용준님: "흰색 도련이 어디있냐 · 도련 = 테두리 색상에 맞춰서")
        //
        //   규칙은 하나다: **칼선 자리에 있는 색을 바깥으로 잇는다.**
        //     · 아트 테두리가 흰색이면 결과가 흰색인 것은 맞다 — 그건 **아트에서 나온** 흰색이다.
        //     · 하드코딩한 흰색은 테두리가 무슨 색이든 흰색이라 틀린다. 그래서 없앴다.
        //   단색(mesCut_vecBleedSolid)은 **아트에서 색을 못 얻을 때의 마지막 안전망**으로만 남긴다.
        var grow = offsetMm + bleedMm;
        // ⚠️ 띠 방식(`edge`)이 원리상 가장 정확하지만 기본에서 뺐다(2026-08-04 실측): 실사용 조각에서
        //    `Live Pathfinder Subtract`/`Crop` 이 3분을 넘겨도 안 끝나고 일러가 통째로 멎었다.
        //    **멈추는 것이 색이 덜 맞는 것보다 나쁘다** → 부르려면 방식을 명시(`edge`)해야 한다.
        if (bleedMode === 'edge') {
            var edge = mesCut_vecBleedEdge(doc, items, layer, grow, fillClosed);
            if (edge) return { ok: true, mode: 'edge', err: null };
        }
        // ★★2026-08-04 4차 — **도형별 오프셋을 기본에서 내린다.**
        //
        //   도형마다 따로 벌리는 방식은 원리상 "각 도형이 저마다 부푼 자국"을 링에 남긴다.
        //   그걸 걸러내려고 세 번 시도했고(bbox 거리 → 윤곽 거리 → 윤곽 접촉) 전부 실패했다.
        //   마지막 실측이 이유를 보여 준다: 아트의 도형들이 서로 겹치지 않으면 **각자가 제 윤곽을
        //   가지므로** 어떤 거리 기준으로도 "윤곽 도형"과 "내부 선"이 구분되지 않는다
        //   (조각당 링에 30/35/14 개가 남았다 = 사실상 안 걸러진다).
        //   → 걸러내는 문제가 아니라 **방식의 문제**다.
        //
        //   사본 확대는 아트를 **통째로** 도련 경계까지 늘려 클리핑한다. 개별 오프셋이 아예 없으니
        //   부푼 자국이 생길 수 없고, 색은 아트에서 그대로 따라온다.
        //   ⚠️ 대신 뾰족한 형상에서 링 일부가 빌 수 있다(별 19.8% 실측). 지저분한 것보다 낫다는
        //      판단이고, 필요하면 방식을 `region` 으로 명시해 옛 동작을 쓸 수 있다.
        //   ★그런데 사본 확대는 **위치가 안 맞는다**(2026-08-04 실측). bbox 는 사방 6.00mm 로 정확하지만
        //     아트를 가로 1.14배·세로 1.09배로 **늘리기** 때문에 bbox 가장자리만 맞고 안쪽 그림은 전부
        //     밀린다. 도련은 원본과 **겹쳐 보여야** 하므로 이건 쓸 수 없다.
        //   → 정본 해법은 픽셀 방식(`js/bleed.js` Repeat Last Pixel, 하네스 `npm run cut:bleed` 통과)이고
        //     배선 전까지는 **위치가 맞는** 도형별 오프셋을 기본으로 둔다(링이 지저분한 건 남는 문제).
        //     지저분한 것 < 위치가 틀린 것. 배선이 끝나면 이 분기는 통째로 사라진다.
        var rg = mesCut_vecBleedRegions(doc, items, offsetMm, bleedMm, fillClosed);
        if (rg && rg.ok) return rg;
    }
    var sil = mesCut_vecSilhouette(doc, items, layer, offsetMm + bleedMm, fillClosed, 'none');
    if (!sil || !sil.items || !sil.items.length) return { ok: false, code: 'sil', err: '도련 경계 생성 실패' };

    // ② 경계가 여러 개면 **하나의 compound** 로 묶는다 — 클리핑 마스크는 한 개체만 쓸 수 있다
    doc.selection = null;
    for (i = 0; i < sil.items.length; i++) { try { sil.items[i].selected = true; } catch (e1) {} }
    if (sil.items.length > 1) app.executeMenuCommand('compoundPath');
    var clipShape = null;
    try { clipShape = doc.selection[0]; } catch (e2) {}
    if (!clipShape) return { ok: false, code: 'silsel', err: '도련 경계 선택 실패' };
    var cb = clipShape.geometricBounds;

    // ③ 아트 사본을 도련 경계까지 늘린다(비균일) — 링 바깥만 보이므로 왜곡은 그 안에서만 생긴다
    var dups = [];
    for (i = 0; i < items.length; i++) {
        try { dups.push(items[i].duplicate(layer, ElementPlacement.PLACEATEND)); } catch (e3) {}
    }
    if (!dups.length) { try { clipShape.remove(); } catch (e4) {} return { ok: false, code: 'dup', err: '아트 복제 실패' }; }
    doc.selection = null;
    for (i = 0; i < dups.length; i++) { try { dups[i].selected = true; } catch (e5) {} }
    mesCut_groupSel(doc);
    var artCopy = null;
    try { artCopy = doc.selection[0]; } catch (e6) {}
    if (!artCopy) return { ok: false, code: 'group', err: '사본 그룹 실패' };
    var ab = artCopy.geometricBounds;
    var aw = ab[2] - ab[0], ah = ab[1] - ab[3];
    if (aw > 0 && ah > 0) {
        var sx = ((cb[2] - cb[0]) / aw) * 100, sy = ((cb[1] - cb[3]) / ah) * 100;
        // 중심을 맞춘 뒤 늘린다 — 안 맞추면 한쪽으로 쏠려 반대쪽 링이 빈다
        try { artCopy.resize(sx, sy, true, true, true, true, 100, Transformation.CENTER); } catch (e7) {}
        var nb = artCopy.geometricBounds;
        try {
            artCopy.translate(((cb[0] + cb[2]) / 2) - ((nb[0] + nb[2]) / 2),
                ((cb[1] + cb[3]) / 2) - ((nb[1] + nb[3]) / 2));
        } catch (e8) {}
    }
    // ④ 경계로 클리핑 — 마스크는 **맨 위** 개체가 된다.
    //   ★검증하는 helper 를 쓴다. 예전엔 `doc.selection[0]` 이 비었는지만 봤는데, makeMask 가 거부되면
    //     **선택이 그대로 남아** 성공으로 오판했다(2026-08-04 실측: 클리핑 안 된 사본 + 경계 도형이
    //     둘 다 아트 레이어에 남았다). 진짜 증거는 결과가 clipped 그룹이라는 것뿐이다.
    var bleedGroup = mesCut_maskWith(doc, clipShape, [artCopy]);
    if (!bleedGroup) {
        // 잔여물을 남기지 않는다 — 경계 도형은 실루엣 색(대개 검정)이라 그대로 두면 도련처럼 보인다
        try { clipShape.remove(); } catch (e9) {}
        try { artCopy.remove(); } catch (e10) {}
    }
    // ⑤ 원본 **뒤**로 — 도련은 원본에 가려야 한다(원본이 위)
    try { if (bleedGroup) bleedGroup.zOrder(ZOrderMethod.SENDTOBACK); } catch (e12) {}
    if (bleedGroup) return { ok: true, mode: 'scale', err: null };
    // 마지막 안전망 — 아트에서 색을 못 얻은 경우다. 인쇄 영역만이라도 넓혀 두되 **반드시 알린다**
    // (이 링은 아트 색이 아니라 지정색이므로 재단이 밀리면 그 색이 보인다).
    var lastFb = mesCut_vecBleedSolid(doc, items, layer, offsetMm + bleedMm, fillClosed, mesCut_ringFill(ringSpec));
    if (lastFb) return { ok: true, mode: 'solid-fallback', err: null };
    return { ok: false, code: 'mask', err: '클리핑 실패' };
}

/**
 * ★도련 정본 — 패널 `js/bleed.js`(Repeat Last Pixel)가 만든 PNG 를 조각 **뒤**에 배치한다.
 *
 * 왜 픽셀인가 (2026-08-05 업계 조사로 확정 · 근거는 추정이 아니라 1차 문서다):
 *   전문 도구는 도련을 **두 가지로만** 만든다 — 가장자리 픽셀 복제(래스터) / 라인아트 패스 연장(벡터).
 *     · callas pdfToolbox `Repeat Last Pixel` = 얇은 띠를 **렌더**해 그 색을 바깥으로 문지른다.
 *       업계도 이 지점에서 벡터를 포기하고 래스터로 간다 — 우리 `edge` 모드가 Live Pathfinder 에서
 *       3분 넘게 멎은 것은 구현 실수가 아니라 **방식 선택 오류**였다.
 *     · Esko i-cut `Create Bleed` = contone 은 **Clone**(가장자리 색 복제). Mirror 는 직사각 컷패스 전용.
 *     · Enfocus PitStop 만 벡터 연장에 성공하는데, 아트가 **컷 윤곽으로 클립돼 있다**는 전제가 붙는다.
 *       클립이 있으면 아래 ①(클립 확장)이 이미 그 역할을 한다. 클립이 없으면 "윤곽 도형 vs 내부 선"이
 *       원리상 구분되지 않는다 — 우리가 세 번 실패한 이유가 정확히 이것이다.
 *   공개된 유일한 일러 스크립트(Mars Premedia `Cut and Bleed`)도 bbox 접촉 프루닝을 쓰는데, 저자가
 *   **"구멍이 있는 디자인 · 트림 경계에서 다른 색이 인접"** 하면 실패한다고 명시했다. 우리 증상 그대로다.
 *   → 도형별 오프셋으로 되돌아가려는 사람은 위 네 줄을 먼저 반박해야 한다.
 *
 * 계약:
 *   PNG = 조각 **잉크 경계**를 사방 grow 만큼 넓힌 것. 패널이 `padMm=0` 으로 구워 만든다(패딩 중복 금지).
 *   따라서 PNG 중심 = 조각 잉크 중심이고, 회전해도 중심은 보존된다 → 정렬은 **중심 맞추기 하나**면 끝난다.
 *   크기(mm)는 패널이 params `L` 줄로 준다. 여기서 px→mm 을 다시 계산하면 반올림만큼 어긋난다.
 *
 * @param sizeMm {w,h} 회전 **전** 기준 도련 PNG 실제 크기(mm)
 * @param rotDeg  조각에 적용된 회전(Konva CW) — 조각과 **같은 방향**으로 돌린다
 * @returns true = 배치 성공
 */
function mesCut_bleedPlaceItem(doc, layer, copy, idx, sizeMm, rotDeg) {
    if (!copy || !sizeMm || !(sizeMm.w > 0) || !(sizeMm.h > 0)) return false;
    var f = new File(Folder.temp.fsName.replace(/\\/g, '/') + '/mes_cut_bleed_' + idx + '.png');
    if (!f.exists) return false;
    // ★기준은 **잉크 경계** — 조각 배치가 잉크 기준이라 여기서만 visibleBounds 를 쓰면 밀린다(0.4.3 에서 겪음)
    var bb = mesCut_inkBounds(copy);
    if (!bb) { try { bb = copy.visibleBounds; } catch (eB) { return false; } }
    var pi = null;
    try {
        pi = layer.placedItems.add();
        pi.file = f;
    } catch (e1) { try { if (pi) pi.remove(); } catch (e2) {} return false; }
    try {
        // ★크기는 **회전 전**에 정한다 — 회전 후 bbox 는 외접 사각이라 거기 맞춰 늘리면 찌그러진다
        pi.width = sizeMm.w * MESCUT_PT_PER_MM;
        pi.height = sizeMm.h * MESCUT_PT_PER_MM;
        if (rotDeg) pi.rotate(-rotDeg);            // Konva CW → 일러 CCW (조각과 같은 규칙)
        var pb = pi.visibleBounds;
        pi.translate(((bb[0] + bb[2]) / 2) - ((pb[0] + pb[2]) / 2),
                     ((bb[1] + bb[3]) / 2) - ((pb[1] + pb[3]) / 2));
        pi.zOrder(ZOrderMethod.SENDTOBACK);        // 도련은 원본에 가려야 한다
    } catch (e3) { try { pi.remove(); } catch (e4) {} return false; }
    // ★링크를 끊는다 — temp 의 PNG 는 지워진다. embed 는 참조를 무효화하므로 **여기가 마지막**이다.
    //   실패해도 배치 자체는 성공으로 본다(EPS 저장이 링크를 품는 경로가 있다).
    try { pi.embed(); } catch (e5) {}
    return true;
}

/** 선택이 벡터 칼선으로 갈 수 있는가 — 'ok' | 'fallback;reason=..' | 'ERROR ..' */
function mesCut_vecProbe() {
    if (app.documents.length === 0) return 'ERROR 문서 없음';
    var sel = app.activeDocument.selection;
    if (!sel || !sel.length) return 'ERROR 선택 없음';
    var items = [];
    for (var i = 0; i < sel.length; i++) if (!mesCut_isCutItem(sel[i])) items.push(sel[i]);
    if (!items.length) return 'ERROR 선택이 재단선뿐입니다';
    var reason = mesCut_vecReason(items);
    return reason ? ('fallback;reason=' + reason) : 'ok';
}

/**
 * P1(벡터) — 선택 아트에서 칼선을 만든다.
 * 반환 'ok;paths=<n>;anchors=<n>' | 'fallback;reason=<사유>' | 'ERROR ..'
 * ⚠️ 기존 '재단선' 레이어 내용은 지우지 않는다(수동 선 보호) — 재실행 누적은 패널이 알린다.
 */
function mesCut_vecCut(offsetMm, fillClosed, bleedMm, bleedMode) {
    if (app.documents.length === 0) return 'ERROR 문서 없음';
    var doc = app.activeDocument;
    var sel = doc.selection;
    if (!sel || !sel.length) return 'ERROR 선택 없음';
    var items = [], i;
    for (i = 0; i < sel.length; i++) if (!mesCut_isCutItem(sel[i])) items.push(sel[i]);
    if (!items.length) return 'ERROR 선택이 재단선뿐입니다';
    var reason = mesCut_vecReason(items);
    if (reason) return 'fallback;reason=' + reason;
    // ★활성 레이어를 기억한다 — 메뉴 명령(group·expandStyle)이 **선택이 있는 레이어를 활성화**하므로
    //   ensureCutLayer 에서 되돌려 놔도 다시 재단선으로 넘어간다. 끝에서 한 번 더 되돌린다.
    //   안 되돌리면 칼선을 만든 뒤 사용자가 그리는 그림이 전부 재단선 레이어로 들어간다(실측).
    var prevLayer = null;
    try { prevLayer = doc.activeLayer; } catch (eP) {}
    var cutLayer = mesCut_ensureCutLayer(doc);
    try { if (cutLayer.locked) cutLayer.locked = false; } catch (eL) {}
    try { if (!cutLayer.visible) cutLayer.visible = true; } catch (eV) {}
    // ★메뉴 명령이 모달을 띄우면 여기서 멈춘다 — 억제하고 **끝에서 반드시 되돌린다**(0.8.1)
    var silent = mesCut_silentBegin();
    var r;
    try { r = mesCut_vecSilhouette(doc, items, cutLayer, offsetMm, fillClosed); }
    catch (e) { mesCut_silentEnd(silent); return 'ERROR vecCut: ' + e; }
    if (r.err) { mesCut_silentEnd(silent); return 'ERROR ' + r.err; }
    // ★도련 — 칼선을 만든 **뒤**에 한다(칼선 레이어가 이미 정리된 상태여야 실루엣이 안 섞인다)
    var bl = null;
    if (bleedMm > 0) {
        try { doc.selection = null; for (i = 0; i < items.length; i++) items[i].selected = true; } catch (eB0) {}
        try { bl = mesCut_vecBleed(doc, items, offsetMm, bleedMm, fillClosed, bleedMode); } catch (eB) { bl = { ok: false, err: '' + eB }; }
    }
    // 원래 선택을 되돌린다 — 연속 실행이 자연스럽도록
    try { doc.selection = null; for (i = 0; i < items.length; i++) items[i].selected = true; } catch (eR) {}
    try { if (prevLayer && prevLayer !== cutLayer) doc.activeLayer = prevLayer; } catch (eR2) {}
    mesCut_silentEnd(silent);
    // 도련 실패는 **사유 코드까지** 실어 보낸다 — '0' 만 보내면 패널이 "왜 안 됐는지"를 말할 수 없다.
    //   ⚠️ 한글은 못 싣는다(evalScript 브릿지 = ASCII). 코드로 보내고 **패널이 번역**한다.
    //   ⚠️ `bleed=0` 은 **그대로 두고** 코드는 별도 키로 붙인다 — 축2(호스트)는 축3·축4(껍데기)보다
    //      먼저 배포되므로, 형식을 바꾸면 구 껍데기가 실패를 아예 못 알아본다(조용히 사라진다).
    var blTxt = '-';
    if (bl) blTxt = bl.ok ? (bl.mode || '1') : '0';
    return 'ok;paths=' + r.n + ';anchors=' + r.anchors + ';bleed=' + blTxt
        + (bl && !bl.ok ? (';bleedcode=' + (bl.code || 'fail')) : '');
}

/**
 * DXF 내보내기 — CNC 재단용. `ProcessOrderItem.jsx:876~888` 과 같은 옵션(mm·AC 최대 편집성).
 * path 는 ASCII 여야 한다(evalScript 브릿지) → 패널이 temp 경로를 넘긴다.
 */
function mesCut_exportDxf(outPath) {
    if (app.documents.length === 0) return 'ERROR 문서 없음';
    if (!outPath) return 'ERROR 경로 없음';
    var doc = app.activeDocument;
    // ★재단 DXF 에는 **칼선만** 담는다. 문서를 통째로 내보내면 그림까지 들어간다 —
    //   실제 CNC 파일 실측(유구 수국축제 3건)은 외곽 SPLINE + 돔보 CIRCLE 뿐이었고,
    //   재단기는 그림을 읽을 필요가 없다(있으면 경로가 섞인다).
    //   ⚠️ 레이어를 숨기는 방법은 **안 통한다** — 일러 DXF export 는 숨긴 레이어도 내보낸다
    //      (2026-07-31 실측: 숨겨도 INSERT 6개가 그대로 남았다). 임시 문서로 옮겨서 굽는다.
    // ★칼선 레이어와 **돔보 레이어를 함께** 모은다 — 문서에서 둘을 나눈 뒤(2026-08-03)
    //   칼선 레이어만 보면 **DXF 에 돔보가 빠져 재단기가 위치를 못 잡는다.**
    var cutLayer = null, markLayer = null, restore = [];
    for (var i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].name === MESCUT_CUT_LAYER) cutLayer = doc.layers[i];
        else if (doc.layers[i].name === MESCUT_MARK_LAYER) markLayer = doc.layers[i];
    }
    if (!cutLayer) return 'ERROR 재단선 레이어 없음 — 칼선을 먼저 만드세요';
    var items = [], srcLayerOf = [];
    var k;
    for (k = 0; k < cutLayer.pageItems.length; k++) { items.push(cutLayer.pageItems[k]); srcLayerOf.push('cut'); }
    if (markLayer) for (k = 0; k < markLayer.pageItems.length; k++) { items.push(markLayer.pageItems[k]); srcLayerOf.push('mark'); }
    if (!items.length) return 'ERROR 재단선이 비어 있음';
    // ⚠️ **비인쇄 레이어는 DXF 내보내기에서 누락·변형된다** — 사내에서 이미 겪은 함정이라
    //    내보내는 동안만 print 를 켜고 끝나면 되돌린다(`SheetLayout.jsx:541~542` 와 같은 조치).
    try { if (cutLayer.printable === false) { cutLayer.printable = true; restore.push(cutLayer); } } catch (ePr) {}

    var tmp = null;
    try {
        var u0 = mesCut_unionOf(items);
        if (!u0) return 'ERROR 재단선 범위 계산 실패';
        tmp = mesCut_newDocMM(u0[2] - u0[0], u0[1] - u0[3]);
        var lay = tmp.layers[0];
        lay.name = MESCUT_DXF_CUT_LAYER;
        // ★칼선과 마크(돔보)를 **다른 레이어**로 나눈다 — 실물 생산 DXF 12/12 가 그렇다(§2.5):
        //   `Layer 2`/`Layer 3` · `재단파일`/`재단마크` · `cut`/`레이어 3`.
        //   이름 규약은 없고(색·선종·선폭도 전부 동일) **분리 자체가 규약**이다.
        //   문서 안에서도 2026-08-03 부터 `재단선`(print OFF) / `돔보`(print ON) 로 나뉜다.
        var markLay = tmp.layers.add();
        markLay.name = MESCUT_DXF_MARK_LAYER;
        app.activeDocument = doc;                  // ★복제는 원본이 active 일 때만 동작한다(rasterize 와 같은 함정)
        for (var d2 = 0; d2 < items.length; d2++) {
            // 분류는 **원본 레이어**가 1순위다(문서에서 이미 나뉘어 있다). 레이어가 없던 옛 문서는 채움으로 가른다.
            var toMark = (srcLayerOf[d2] === 'mark') || (srcLayerOf[d2] !== 'cut' && mesCut_isMarkItem(items[d2]));
            try { items[d2].duplicate(toMark ? markLay : lay, ElementPlacement.PLACEATBEGINNING); } catch (eD) {}
        }
        app.activeDocument = tmp;
        var u1 = mesCut_unionOf(mesCut_topItems(tmp));
        if (!u1) { tmp.close(SaveOptions.DONOTSAVECHANGES); app.activeDocument = doc; return 'ERROR 복제 실패(재단선 0개)'; }
        tmp.artboards[0].artboardRect = [u1[0], u1[1], u1[2], u1[3]];

        var opts = new ExportOptionsAutoCAD();
        opts.exportFileFormat = AutoCADExportFileFormat.DXF;
        // ★AC1015(AutoCAD 2000) — 실물 생산 DXF **12/12 가 전부 AC1015** 다(2026-08-02 전수 실측).
        //   Release21 은 AC1021 로 나가 사내 파일 중 유일하게 다른 버전이 된다. 재단 소프트웨어가
        //   구형이면 못 읽을 수 있고, 낮춰서 잃는 것은 없다(13/14/15 셋 다 AC1015·내용 동일 확인).
        opts.version = AutoCADCompatibility.AutoCADRelease15;
        opts.unit = AutoCADUnit.Millimeters;
        opts.scaleLineweights = false;
        try { opts.exportOption = AutoCADExportOption.MaximumEditability; } catch (eOpt) {}
        tmp.exportFile(new File(outPath), ExportType.AUTOCAD, opts);
        var n = tmp.pageItems.length;
        tmp.close(SaveOptions.DONOTSAVECHANGES); tmp = null;
        app.activeDocument = doc;
        for (var rr = 0; rr < restore.length; rr++) { try { restore[rr].printable = false; } catch (eR1) {} }
        return 'ok;path=' + outPath + ';items=' + n;
    } catch (e) {
        if (tmp) { try { tmp.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {} }
        try { app.activeDocument = doc; } catch (e3) {}
        for (var rr2 = 0; rr2 < restore.length; rr2++) { try { restore[rr2].printable = false; } catch (eR2) {} }
        return 'ERROR dxf: ' + e;
    }
}

// ── P3: 네스팅 ──────────────────────────────────────────────────────
// 조각 = 선택된 **top-level 아이템 하나**. 패널이 조각별 마스크를 만들어 배치를 계산하고,
// 그 결과를 여기로 돌려주면 **새 문서**에 복제 배치한다(원본 문서는 건드리지 않는다).

var MESCUT_NEST_ITEMS = null;   // rasterizeItem 이 쓰는 대상 목록(선택 시점에 고정)

/** 네스팅 대상 확정 — 재단선 제외한 선택 아이템 수를 반환하고 목록을 고정한다. */
/**
 * @param keep 1 이면 이미 잡아 둔 목록을 **그대로 쓴다**(선택을 다시 읽지 않는다).
 *   패널의 '조각 수량' 목록은 불러온 시점의 순서·개수에 수량을 매단다. 그런데 행을 눌러
 *   조각을 확인하면 선택이 그 하나로 바뀌고, 그 상태로 실행하면 여기서 1개만 다시 잡혀
 *   **수량이 통째로 날아간다**. keep 은 그 경로를 막는다.
 */
/**
 * ★문서의 **최상위 개체를 전부 선택**한다 (2026-08-27).
 *
 * 재단 탭은 여태 "일러에서 손으로 고른 뒤 ↻" 로만 시작할 수 있었다. 가공(A0) 탭에는
 * 문서 전체를 스캔하는 [◎ 자동감지] 가 있는데 재단 탭에는 없었다 — 같은 기하 엔진을 쓰면서도.
 *
 * ⚠️ A0 의 자동감지와 **같지 않다.** 저쪽은 잉크 실루엣으로 덩어리를 나누고 개체를 묶는다
 *    (mesA0_seedBegin → seedSplit → mesA0_seedApply → 문서에 그룹 생성). 여기서는 **문서를
 *    바꾸지 않는다** — 이미 나뉘어 있는 최상위 개체를 고를 뿐이다.
 *    실물 작업 파일은 대개 "최상위 개체 1개 = 조각 1개" 라 이것으로 충분하다(sample1.ai 13개 확인).
 *    한 개체 안에 여러 디자인이 뭉쳐 있으면 이 버튼으로는 못 나눈다 — 그때는 손으로 고른다.
 * ⚠️ 잠긴·숨은 레이어와 개체는 건너뛴다. 사용자가 일부러 빼 둔 것을 다시 끌어오면 안 된다.
 *
 * 반환 'ok;n=<개수>' · 'ERROR ..'
 */
function mesCut_selectAllTop() {
    if (app.documents.length === 0) return 'ERROR 문서 없음';
    var doc = app.activeDocument;
    try { doc.selection = null; } catch (eS) {}
    var n = 0;
    for (var L = 0; L < doc.layers.length; L++) {
        var lay = doc.layers[L];
        try { if (lay.locked || !lay.visible) continue; } catch (eL) { continue; }
        var items = lay.pageItems;
        for (var i = 0; i < items.length; i++) {
            try {
                if (items[i].locked || items[i].hidden) continue;
                items[i].selected = true;
                n++;
            } catch (eI) {}
        }
    }
    if (!n) return 'ERROR 고를 개체가 없습니다(잠김·숨김만 있거나 빈 문서)';
    return 'ok;n=' + n;
}

function mesCut_nestBegin(keep) {
    if (app.documents.length === 0) return 'ERROR 문서 없음';
    if (String(keep) === '1' && MESCUT_NEST_ITEMS && MESCUT_NEST_ITEMS.length) {
        // 지워진 개체가 섞였는지만 확인한다 — 남아 있으면 그대로 재사용.
        var alive = [];
        for (var k = 0; k < MESCUT_NEST_ITEMS.length; k++) {
            try { var t = MESCUT_NEST_ITEMS[k].typename; if (t) alive.push(MESCUT_NEST_ITEMS[k]); } catch (eK) {}
        }
        if (alive.length === MESCUT_NEST_ITEMS.length) return 'ok;n=' + MESCUT_NEST_ITEMS.length + ';kept=1';
        // 하나라도 사라졌으면 낡은 목록이다 — 아래로 내려가 선택에서 다시 잡는다.
    }
    var sel = app.activeDocument.selection;
    if (!sel || !sel.length) return 'ERROR 선택 없음';
    MESCUT_NEST_ITEMS = [];
    for (var i = 0; i < sel.length; i++) if (!mesCut_isCutItem(sel[i])) MESCUT_NEST_ITEMS.push(sel[i]);
    if (!MESCUT_NEST_ITEMS.length) return 'ERROR 선택이 재단선뿐입니다';
    // ★공간 정렬: 위→아래, 같은 줄에서는 좌→우 (A0 묶음분리와 같은 규칙·같은 이유).
    //   선택 순서는 사실상 z-order 라 눈에 보이는 순서와 무관하다. 목록 번호가 화면과 어긋나면
    //   "몇 번이 어느 조각인지"를 알 수 없어 수량을 제대로 넣을 수 없다.
    //   ⚠️ 정렬은 **반드시 여기서** 한다 — 배치·도련·params 가 전부 이 배열의 인덱스를 쓴다.
    //      패널이 표시만 바꾸면 인덱스가 어긋나 "고른 것과 다른 조각의 수량"이 된다.
    var BAND = 20 * MESCUT_PT_PER_MM;   // 같은 줄 허용오차
    var withBB = [];
    for (var b = 0; b < MESCUT_NEST_ITEMS.length; b++) {
        var bb = null;
        try { bb = mesCut_inkBounds(MESCUT_NEST_ITEMS[b]); } catch (eB) {}
        withBB.push({ it: MESCUT_NEST_ITEMS[b], t: bb ? bb[1] : 0, l: bb ? bb[0] : 0 });
    }
    withBB.sort(function (p, q) {
        var dt = q.t - p.t;                    // top 이 큰(위) 것이 먼저
        if (Math.abs(dt) > BAND) return dt;
        return p.l - q.l;                      // 같은 줄 → 왼쪽 먼저
    });
    MESCUT_NEST_ITEMS = [];
    for (var s2 = 0; s2 < withBB.length; s2++) MESCUT_NEST_ITEMS.push(withBB[s2].it);
    return 'ok;n=' + MESCUT_NEST_ITEMS.length;
}

/** 목록 i번 조각을 일러에서 선택해 보여준다(어느 디자인인지 확인용). 목록 자체는 안 바꾼다. */
function mesCut_nestSelect(idx) {
    var i = parseInt(idx, 10);
    if (!MESCUT_NEST_ITEMS || isNaN(i) || i < 0 || i >= MESCUT_NEST_ITEMS.length) return 'ERROR 범위';
    try {
        app.activeDocument.selection = null;
        MESCUT_NEST_ITEMS[i].selected = true;
    } catch (e) { return 'ERROR ' + e; }
    return 'ok';
}

/**
 * 조각별 실측 크기(mm) — 패널의 '조각 수량' 목록 라벨용. **nestBegin 다음에** 부른다.
 *   같은 그림을 여러 장 뽑을 때 파일에서 손으로 복사하는 대신 수량으로 지시하기 위한 것이고,
 *   목록에서 어느 행이 어느 조각인지 알아보려면 크기가 필요하다.
 *   ⚠️ 선택을 바꾸지 않는다 — 여기서 선택을 건드리면 이어지는 nestBegin 이 그 하나만 잡는다.
 * 반환 = 'ok;<W>x<H>,<W>x<H>,...' (소수 1자리 mm)
 */
function mesCut_nestSizes() {
    if (!MESCUT_NEST_ITEMS || !MESCUT_NEST_ITEMS.length) return 'ERROR 대상 없음 (nestBegin 먼저)';
    var out = [];
    for (var i = 0; i < MESCUT_NEST_ITEMS.length; i++) {
        var b = null;
        try { b = mesCut_inkBounds(MESCUT_NEST_ITEMS[i]); } catch (eB) {}
        if (!b) { out.push('0x0'); continue; }
        var w = (b[2] - b[0]) / MESCUT_PT_PER_MM, h = (b[1] - b[3]) / MESCUT_PT_PER_MM;
        out.push((Math.round(w * 10) / 10) + 'x' + (Math.round(h * 10) / 10));
    }
    return 'ok;' + out.join(',');
}

/**
 * ★조각 **전부를 한 번에** 굽는다 — 문서 왕복을 조각 수에 비례하지 않게 만든다 (2026-08-03).
 *
 * **왜**: `mesCut_rasterizeItem` 은 조각마다 임시 문서를 만들고 닫는다. 실측(2026-08-03)해 보면
 * 조각당 4.07초인데 그중 **실제 굽기는 78ms** 뿐이고 나머지가 전부 문서 관리다:
 *     문서 생성+닫기 **2,000ms** · 활성 전환 338ms ×3 · 복제 183ms · 굽기 78ms
 * 8조각이면 32.5초가 걸렸다(측정값).
 *
 * 여기서는 임시 문서를 **하나만** 만들고 활성 전환도 **총 2회**로 끝낸다:
 *   ① 원본 active 상태에서 조각을 **전부** 복제(전환 1회 — 문서 간 복제는 원본이 active 여야 한다)
 *   ② 임시 문서로 한 번 전환한 뒤, 조각마다 **아트보드만 옮기며** 굽는다(굽기 78ms 만 남는다)
 * ⚠️ 복제본은 원본 좌표를 유지하므로 원본에서 조각이 겹치면 서로가 캔버스에 들어온다 →
 *    복제 직후 **가로로 벌려 놓는다**. 반환하는 ox/oy 는 **원본 잉크 경계** 기준이라 배치 계산은 그대로다.
 *
 * 반환(여러 줄):
 *   ok;n=<개수>;mmpp=<..>;filled=<..>
 *   P <idx> <w>px <h>px <oxMm> <oyMm> <path>
 * 실패한 조각은 그 줄이 빠진다 — 호출자가 idx 로 대조한다.
 */
/** 내보내기 폴더를 비운다 — ★안 비우면 이번에 실패한 조각이 **지난번 그림**으로 조용히 채워진다. */
function mesCut_efsPurge(fold) {
    try {
        var fs = fold.getFiles();
        for (var i = 0; i < fs.length; i++) {
            if (fs[i] instanceof Folder) { mesCut_efsPurge(fs[i]); try { fs[i].remove(); } catch (e1) {} }
            else { try { fs[i].remove(); } catch (e2) {} }
        }
    } catch (e) {}
}

/**
 * 조각마다 아트보드를 만들고 **한 번의 `exportForScreens`** 로 전부 내보낸다.
 *
 * ★왜 — export 는 **호출당 고정비가 지배한다**(2026-09-04 실측, 실물 23조각):
 *   개별 `exportFile` x23 = 8,263ms(개당 359ms) 인데 픽셀은 11Mpx 뿐이고,
 *   격자 전체를 한 번에 뽑으면 20Mpx 를 2,145ms 에 끝낸다. 즉 **픽셀이 아니라 왕복이 비싸다.**
 *   `exportForScreens` 는 아트보드 N개를 한 호출로 처리한다 → 마스크 4,841ms · 원색 695ms
 *   (원색이 훨씬 싼 이유는 AA 를 끄기 때문이다).
 *
 * ⚠️ **`antiAliasing` 은 불리언이 아니라 enum 이다.** `true` 를 넣으면 대입은 통과하고
 *    **호출이 통째로** "Enumerated value expected" 로 죽는다 — 옵션 한 줄 때문에 기능 전체가
 *    없는 것처럼 보인다(2026-09-04 에 이걸로 헤맸다). `AntiAliasingMethod.ARTOPTIMIZED` / `.None`.
 *
 * ⚠️ 결과 파일은 **`<폴더>/<배율>x/<아트보드이름>.png`** 로 떨어진다. 배율 폴더 이름("1.411x")을
 *    **만들어서 찾지 않는다** — 형식이 배율 값에 따라 달라 재현이 취약하다. 폴더를 뒤져서 찾는다.
 *
 * ⚠️ 그리고 **파일을 `Folder.temp` 의 옛 이름으로 옮긴다.** 경로 규약을 바꾸면 패널이 도련 PNG 를
 *    "마스크와 같은 폴더"에 쓰는데 호스트는 `Folder.temp` 에서 읽어 **도련이 조용히 사라진다.**
 *    굽는 방법만 바꾸고 **주고받는 약속은 그대로 둔다.**
 *
 * @returns {Array<string>} 조각 순서대로 최종 경로, 실패 시 null
 */
function mesCut_efsRound(doc, rects, names, mmPerPx, aaOn, tag, idx) {
    var i;
    if (typeof ExportForScreensType === 'undefined') return null;
    while (doc.artboards.length > rects.length) {
        try { doc.artboards.remove(doc.artboards.length - 1); } catch (eR) { return null; }
    }
    for (i = 0; i < rects.length; i++) {
        try {
            if (i < doc.artboards.length) { doc.artboards[i].artboardRect = rects[i]; doc.artboards[i].name = names[i]; }
            else { doc.artboards.add(rects[i]).name = names[i]; }
        } catch (eA) { return null; }
    }
    var tmpDir = Folder.temp.fsName.replace(/\\/g, '/');
    var fold = new Folder(tmpDir + '/mes_cut_efs_' + tag);
    if (fold.exists) mesCut_efsPurge(fold);
    else { try { if (!fold.create()) return null; } catch (eC) { return null; } }
    var o, it;
    try {
        o = new ExportForScreensOptionsPNG24();
        o.transparency = true;
        o.antiAliasing = aaOn ? AntiAliasingMethod.ARTOPTIMIZED : AntiAliasingMethod.None;
        o.scaleType = ExportForScreensScaleType.SCALEBYFACTOR;
        o.scaleTypeValue = (1 / mmPerPx) * (25.4 / 72);
        it = new ExportForScreensItemToExport();
        it.document = false;
        it.artboards = '1-' + rects.length;
    } catch (eO) { return null; }
    try { doc.exportForScreens(fold, ExportForScreensType.SE_PNG24, o, it, ''); } catch (eE) { return null; }
    var src = null;
    try {
        var subs = fold.getFiles(function (x) { return x instanceof Folder; });
        for (i = 0; i < subs.length; i++) {
            var ff = subs[i].getFiles('*.png');
            if (ff && ff.length) { src = subs[i]; break; }
        }
        if (!src) { var flat = fold.getFiles('*.png'); if (flat && flat.length) src = fold; }
    } catch (eF) { return null; }
    if (!src) return null;
    var base = src.fsName.replace(/\\/g, '/'), out = [];
    for (i = 0; i < rects.length; i++) {
        var from = new File(base + '/' + names[i] + '.png');
        if (!from.exists) return null;
        var to = tmpDir + '/mes_cut_' + tag + '_' + idx[i] + '.png';
        try { var tf = new File(to); if (tf.exists) tf.remove(); } catch (eD) {}
        if (!from.copy(to)) return null;
        out.push(to);
    }
    return out;
}

/** 마스크(+도련 원색)를 `exportForScreens` 로 굽고 P/Q 줄을 채운다. 하나라도 어긋나면 false. */
function mesCut_bakeScreens(doc, boxes, srcBB, padPt, mmPerPx, tag, bleedTag, lines, f) {
    var n = boxes.length, i, sc = (1 / mmPerPx) * (25.4 / 72) * 100;
    var idx = [], names = [], mRect = [], iRect = [];
    for (i = 0; i < n; i++) {
        if (!boxes[i] || !srcBB[i]) continue;
        var bx = boxes[i];
        idx.push(i); names.push('p' + i);
        mRect.push([bx[0] - padPt, bx[1] + padPt, bx[2] + padPt, bx[3] - padPt]);
        iRect.push([bx[0], bx[1], bx[2], bx[3]]);
    }
    if (!idx.length || idx.length > MESCUT_EFS_MAX_AB) return false;
    var got = mesCut_efsRound(doc, mRect, names, mmPerPx, true, tag, idx);
    if (!got) return false;
    for (i = 0; i < idx.length; i++) {
        var k = idx[i], b2 = boxes[k];
        lines.push('P ' + k + ' ' + Math.round(((b2[2] - b2[0]) + padPt * 2) * sc / 100)
            + ' ' + Math.round(((b2[1] - b2[3]) + padPt * 2) * sc / 100)
            + ' ' + f(srcBB[k][0] - padPt) + ' ' + f(srcBB[k][1] + padPt) + ' ' + got[i]);
    }
    // 도련만 실패하면 마스크는 살린다 — 패널이 옛 경로로 원색을 따로 굽는다.
    if (bleedTag) {
        var gotB = mesCut_efsRound(doc, iRect, names, mmPerPx, false, bleedTag, idx);
        if (gotB) {
            for (i = 0; i < idx.length; i++) {
                var k2 = idx[i], b3 = boxes[k2];
                lines.push('Q ' + k2 + ' ' + Math.round((b3[2] - b3[0]) * sc / 100)
                    + ' ' + Math.round((b3[1] - b3[3]) * sc / 100)
                    + ' ' + f(srcBB[k2][0]) + ' ' + f(srcBB[k2][1]) + ' ' + gotB[i]);
            }
        }
    }
    return true;
}

function mesCut_nestBakeAll(mmPerPx, padMm, fillClosed, tag, bleedTag) {
    if (!MESCUT_NEST_ITEMS || !MESCUT_NEST_ITEMS.length) return 'ERROR 대상 없음 (nestBegin 먼저)';
    if (!mmPerPx || mmPerPx <= 0) mmPerPx = 0.5;
    if (!padMm || padMm < 0) padMm = 0;
    // ★파일 이름표 — 같은 조각을 **용도가 다르게** 두 번 구울 수 있어야 한다(2026-08-05).
    //   배치 마스크는 선 도안이면 검게 칠하고(`fillClosed`), 도련은 **원색**이 필요하다.
    //   같은 이름으로 구우면 뒤에 구운 쪽이 앞의 것을 덮어써 마스크나 도련 한쪽이 조용히 틀린다.
    //   ASCII 로 강제한다 — 경로가 evalScript 브릿지를 타지는 않지만 파일명이 깨지면 못 찾는다.
    tag = String(tag == null ? 'nest' : tag).replace(/[^A-Za-z0-9_]/g, '');
    if (!tag) tag = 'nest';
    var srcDoc = app.activeDocument;
    var PT = MESCUT_PT_PER_MM;
    var padPt = padMm * PT;
    var n = MESCUT_NEST_ITEMS.length;
    var i;

    // ① 원본 기준 잉크 경계를 먼저 모은다 — ox/oy 는 **원본** 기준이어야 배치 수식이 안 바뀐다
    var srcBB = [];
    for (i = 0; i < n; i++) srcBB.push(mesCut_inkBounds(MESCUT_NEST_ITEMS[i]));

    var tmp = null, nFill = 0, fastBake = 0;
    var lines = [];
    try {
        // ★조각을 **격자**로 벌린다. 가로 한 줄로만 늘어놓으면 1:1(원본 크기) 조각에서 총 폭이
        //   일러 캔버스 한계를 넘어 아트보드 이동이 'AOoC' 로 죽는다(2026-08-05 실사용).
        //   행 폭이 한계에 닿으면 다음 줄로 내린다 — 굽기는 아트보드를 옮겨 다니므로 줄이 나뉘어도 무관하다.
        var cellW = [], cellH = [];
        for (i = 0; i < n; i++) {
            if (!srcBB[i]) { cellW.push(0); cellH.push(0); continue; }
            cellW.push((srcBB[i][2] - srcBB[i][0]) + padPt * 2 + 20 * PT);
            cellH.push((srcBB[i][1] - srcBB[i][3]) + padPt * 2 + 20 * PT);
            // 조각 하나가 혼자 한계를 넘으면 어떻게 배치해도 못 굽는다 → 원인을 정확히 알린다
            if (cellW[i] > MESCUT_CANVAS_MAX_PT || cellH[i] > MESCUT_CANVAS_MAX_PT) {
                return 'ERROR 조각 ' + i + ' 가 일러 캔버스 한계('
                    + Math.round(MESCUT_CANVAS_MAX_PT / PT) + 'mm)를 넘습니다 — 배율을 줄이거나 조각을 나누세요';
            }
        }
        var totW = 0, totH = 0, rowW = 0, rowH = 0;
        for (i = 0; i < n; i++) {
            if (!cellW[i]) continue;
            if (rowW > 0 && rowW + cellW[i] > MESCUT_CANVAS_MAX_PT) {
                if (rowW > totW) totW = rowW;
                totH += rowH; rowW = 0; rowH = 0;
            }
            rowW += cellW[i];
            if (cellH[i] > rowH) rowH = cellH[i];
        }
        if (rowW > totW) totW = rowW;
        totH += rowH;
        if (totW <= 0 || totH <= 0) return 'ERROR 크기 0';
        if (totH > MESCUT_CANVAS_MAX_PT) {
            return 'ERROR 조각이 너무 많거나 커서 한 문서에 못 담습니다(필요 '
                + Math.round(totH / PT) + 'mm > 한계 ' + Math.round(MESCUT_CANVAS_MAX_PT / PT) + 'mm)';
        }
        tmp = mesCut_newDocMM(totW, totH);
        var lay = tmp.layers[0];

        app.activeDocument = srcDoc;                 // ★전환 1 — 복제는 원본이 active 일 때만 동작한다
        var copies = [];
        for (i = 0; i < n; i++) {
            var cp = null;
            try { cp = MESCUT_NEST_ITEMS[i].duplicate(lay, ElementPlacement.PLACEATEND); } catch (eD) {}
            copies.push(cp);
        }
        app.activeDocument = tmp;                    // ★전환 2 — 이후로는 임시 문서 안에서만 논다
        if (fillClosed) nFill = mesCut_fillClosedIn(tmp);

        // ② 격자로 벌려 놓는다 — 서로 캔버스에 들어오지 않게 하되, 한 줄이 한계에 닿으면 다음 줄로.
        //    y 는 아래로 내려가므로 감소시킨다(일러는 y-up).
        var curX = 0, curY = 0, rowMax = 0;
        var boxes = [];
        for (i = 0; i < n; i++) {
            if (!copies[i]) { boxes.push(null); continue; }
            var b = mesCut_inkBounds(copies[i]);
            if (!b) { boxes.push(null); continue; }
            var cw = (b[2] - b[0]) + padPt * 2 + 20 * PT;
            var ch = (b[1] - b[3]) + padPt * 2 + 20 * PT;
            if (curX > 0 && curX + cw > MESCUT_CANVAS_MAX_PT) { curX = 0; curY -= rowMax; rowMax = 0; }
            var dx = curX - b[0], dy = curY - b[1];
            try { copies[i].translate(dx, dy); } catch (eT) {}
            var nb = mesCut_inkBounds(copies[i]) || [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy];
            boxes.push(nb);
            curX += cw;
            if (ch > rowMax) rowMax = ch;
        }

        // ③ 아트보드만 옮기며 굽는다 — 남는 비용은 export 뿐이다
        var opts = new ExportOptionsPNG24();
        // ★도련용 원색(tag="ink")은 AA 를 끈다 (2026-08-24 반백반흑 회색 오염 대응).
        //   AA 가 색 경계에 만드는 불투명 회색 블렌드가 Repeat Last Pixel 공급원으로 복사될 수 있다.
        //   ⚠️ 단 AI 30.7 실기기 실측에서는 이 플래그가 **무효**였다(on/off 픽셀 완전 동일 —
        //   회전 경계 회색 133px 둘 다). 실효 방어선은 패널 쪽 2겹이다: ①도련 축소 NN
        //   (cut-main.js downscaleRgba) ②공급원 안쪽 샘플링(bleed.js srcInsetPx).
        //   플래그는 버전에 따라 유효할 수 있고 비용이 없어 의도 표명으로 유지한다.
        //   마스크 굽기(다른 tag)는 실루엣 품질을 위해 AA 를 유지한다.
        opts.antiAliasing = (tag === 'ink') ? false : true;
        opts.transparency = true; opts.artBoardClipping = true;
        var sc = (1 / mmPerPx) * (25.4 / 72) * 100;
        opts.horizontalScale = sc; opts.verticalScale = sc;
        // ★★도련 원색을 **같은 문서에서** 한 번 더 내보낸다 (2026-08-27).
        //   여태 도련은 nestBakeAll 을 **통째로 다시** 호출했다 — 임시문서 생성 + 조각 전량 duplicate
        //   + translate 를 두 번 치른 것이다. 실측(조각 4개·12.0M px, AI 30.7):
        //     마스크 굽기 5,624ms · 도련 굽기 5,728ms · 패널 JS 전체 1,258ms
        //   그런데 픽셀을 16배 줄여도(0.25→1.0mm/px) 40% 밖에 안 빨라진다 = **고정비가 지배**한다.
        //   ⇒ 아낄 것은 픽셀이 아니라 **왕복**이다. 조각은 이미 여기 다 복제돼 있다.
        //
        //   ⚠️ "마스크 PNG 를 도련에도 재사용" 은 **기각**했다(2026-08-27 픽셀 대조):
        //      pad 가 달라 프레이밍이 1~2px 어긋나고 도련 결과가 최대 2.6% 달라졌다.
        //      그래서 재사용이 아니라 **같은 아트보드 산수로 한 번 더 내보낸다** — 오늘과 같은 값이 나온다.
        //   ⚠️ 도련은 pad 0 · AA OFF 다(옛 'ink' 굽기와 동일). 여기서 그 조건을 그대로 재현한다.
        var bOpts = null;
        if (bleedTag) {
            bOpts = new ExportOptionsPNG24();
            bOpts.antiAliasing = false;
            bOpts.transparency = true; bOpts.artBoardClipping = true;
            bOpts.horizontalScale = sc; bOpts.verticalScale = sc;
        }
        var f = function (pt) { return Math.round((pt / PT) * 100) / 100; };
        // ★ export 는 **호출당 고정비가 지배**한다 — 조각마다 부르지 말고 아트보드 N개를 한 번에.
        //   실물 23조각 실측: 개별 8,263ms ×2(마스크·원색) → 4,841 + 695ms.
        //   실패하면 아래 옛 경로가 그대로 받는다(구 일러·상한 초과·API 거부).
        if (!MESCUT_EFS_OFF) {
            try { fastBake = mesCut_bakeScreens(tmp, boxes, srcBB, padPt, mmPerPx, tag, bleedTag, lines, f) ? 1 : 0; }
            catch (eFS) { fastBake = 0; }
        }
        if (!fastBake) {
            lines = [];   // 부분 성공 잔재를 남기지 않는다
            // ★fast 경로가 아트보드를 여러 개 남겼을 수 있다 — 옛 경로는 **활성 아트보드**를 내보내므로
            //   1개로 되돌리지 않으면 같은 그림을 n 번 뷄는다(2026-09-04 하네스에서 실제로 겪었다).
            try { while (tmp.artboards.length > 1) tmp.artboards.remove(tmp.artboards.length - 1); } catch (eAB) {}
            try { tmp.artboards.setActiveArtboardIndex(0); } catch (eAI) {}
        }
        for (i = 0; i < n && !fastBake; i++) {
            if (!boxes[i] || !srcBB[i]) continue;
            var bx = boxes[i];
            tmp.artboards[0].artboardRect = [bx[0] - padPt, bx[1] + padPt, bx[2] + padPt, bx[3] - padPt];
            var outPath = Folder.temp.fsName.replace(/\\/g, '/') + '/mes_cut_' + tag + '_' + i + '.png';
            try { tmp.exportFile(new File(outPath), ExportType.PNG24, opts); } catch (eE) { continue; }
            var wPx = Math.round(((bx[2] - bx[0]) + padPt * 2) * sc / 100);
            var hPx = Math.round(((bx[1] - bx[3]) + padPt * 2) * sc / 100);
            lines.push('P ' + i + ' ' + wPx + ' ' + hPx
                + ' ' + f(srcBB[i][0] - padPt) + ' ' + f(srcBB[i][1] + padPt) + ' ' + outPath);
            if (bOpts) {
                // 도련 프레임 = **pad 없는 잉크 bbox** (옛 'ink' 굽기와 같은 아트보드)
                tmp.artboards[0].artboardRect = [bx[0], bx[1], bx[2], bx[3]];
                var bPath = Folder.temp.fsName.replace(/\\/g, '/') + '/mes_cut_' + bleedTag + '_' + i + '.png';
                try {
                    tmp.exportFile(new File(bPath), ExportType.PNG24, bOpts);
                    lines.push('Q ' + i + ' ' + Math.round((bx[2] - bx[0]) * sc / 100)
                        + ' ' + Math.round((bx[1] - bx[3]) * sc / 100)
                        + ' ' + f(srcBB[i][0]) + ' ' + f(srcBB[i][1]) + ' ' + bPath);
                } catch (eB) { /* 도련만 실패하면 패널이 옛 경로로 다시 굽는다 */ }
            }
        }
        tmp.close(SaveOptions.DONOTSAVECHANGES); tmp = null;
        app.activeDocument = srcDoc;
    } catch (e) {
        if (tmp) { try { tmp.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {} }
        try { app.activeDocument = srcDoc; } catch (e3) {}
        return 'ERROR nestBakeAll: ' + e;
    }
    if (!lines.length) return 'ERROR 구운 조각 0개';
    return 'ok;n=' + lines.length + ';mmpp=' + mmPerPx + ';filled=' + nFill + ';fastbake=' + fastBake
        + '\n' + lines.join('\n');
}

/**
 * i 번째 조각만 PNG 로 굽는다(칼선의 rasterize 와 같은 방식·같은 함정 회피).
 * ⚠️ 구 경로다 — 조각마다 임시 문서를 만들어 **조각당 4초**가 든다(2026-08-03 실측).
 *    새 경로는 `mesCut_nestBakeAll`. 이건 구 패널 호환용으로 남긴다.
 * 반환 'ok;path=..;w=..;h=..;ox=..;oy=..;mmpp=..'
 */
function mesCut_rasterizeItem(idx, mmPerPx, padMm, fillClosed) {
    if (!MESCUT_NEST_ITEMS || idx < 0 || idx >= MESCUT_NEST_ITEMS.length) return 'ERROR 대상 없음 (nestBegin 먼저)';
    if (!mmPerPx || mmPerPx <= 0) mmPerPx = 0.5;
    if (!padMm || padMm < 0) padMm = 0;
    var srcDoc = app.activeDocument;
    var it = MESCUT_NEST_ITEMS[idx];
    var bb;
    bb = mesCut_inkBounds(it);
    if (!bb) return 'ERROR bounds 실패';
    var wPt = bb[2] - bb[0], hPt = bb[1] - bb[3];
    if (wPt <= 0 || hPt <= 0) return 'ERROR 크기 0';

    var outPath = Folder.temp.fsName.replace(/\\/g, '/') + '/mes_cut_nest_' + idx + '.png';
    var tmp = null;
    try {
        tmp = mesCut_newDocMM(wPt, hPt);
        var lay = tmp.layers[0];
        app.activeDocument = srcDoc;                 // ★복제는 원본이 active 일 때만
        try { it.duplicate(lay, ElementPlacement.PLACEATBEGINNING); } catch (eD) {}
        app.activeDocument = tmp;
        var nFill = fillClosed ? mesCut_fillClosedIn(tmp) : 0;   // 사본에서만 — 원본 무손상
        var u = mesCut_unionOf(mesCut_topItems(tmp));
        if (!u) { tmp.close(SaveOptions.DONOTSAVECHANGES); app.activeDocument = srcDoc; return 'ERROR 복제 실패'; }
        var padPt = padMm * MESCUT_PT_PER_MM;
        tmp.artboards[0].artboardRect = [u[0] - padPt, u[1] + padPt, u[2] + padPt, u[3] - padPt];
        var opts = new ExportOptionsPNG24();
        opts.antiAliasing = true; opts.transparency = true; opts.artBoardClipping = true;
        var sc = (1 / mmPerPx) * (25.4 / 72) * 100;
        opts.horizontalScale = sc; opts.verticalScale = sc;
        tmp.exportFile(new File(outPath), ExportType.PNG24, opts);
        var wPx = Math.round(((u[2] - u[0]) + padPt * 2) * sc / 100);
        var hPx = Math.round(((u[1] - u[3]) + padPt * 2) * sc / 100);
        var f = function (pt) { return Math.round((pt / MESCUT_PT_PER_MM) * 100) / 100; };
        tmp.close(SaveOptions.DONOTSAVECHANGES); tmp = null;
        app.activeDocument = srcDoc;
        return 'ok;path=' + outPath + ';w=' + wPx + ';h=' + hPx
            + ';ox=' + f(bb[0] - padPt) + ';oy=' + f(bb[1] + padPt) + ';mmpp=' + mmPerPx
            + ';filled=' + nFill;
    } catch (e) {
        if (tmp) { try { tmp.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {} }
        try { app.activeDocument = srcDoc; } catch (e3) {}
        return 'ERROR rasterizeItem: ' + e;
    }
}

// ── 돔보(레지스터 마크) ─────────────────────────────────────────────
// 재단기는 돔보로 위치를 잡는다 — **재단 산출물에 돔보가 없으면 자를 수 없다**(2026-07-31 지시).
// 규약은 A0 와 동일: 지름 6mm · 코너에서 17mm 바깥 · 50cm 초과 구간엔 중간 돔보 · 짧은 변에 방향마크 60mm.
//   (mes-a0-host.jsx:576~605 — 같은 상수를 쓰지 않으면 재단기가 다른 판을 다르게 읽는다)
//
// ⚠️ A0 는 돔보를 넣으며 **아트보드를 23mm 확장**한다. 네스팅은 그러면 안 된다 —
//    롤/평판은 폭이 고정이라 확장하는 순간 규격을 넘는다. 대신 **조각 배치 영역을 안쪽으로 줄인다**
//    (패널이 usable 폭으로 배치하고 좌표에 margin 을 더해 보낸다).
/**
 * DXF 에서 **마크(돔보) 레이어**로 보낼 것인가.
 *
 * ★판정은 **채움**으로 한다 — 크기로 하면 안 된다.
 *   실물 파일에서 **타공도 원**이고 칼선 레이어에 있다(2026-08-02 실측, 경고판 2건:
 *   CIRCLE ⌀10mm · 칼선 레이어 · 색 230 / 돔보 CIRCLE ⌀6mm · 마크 레이어 · BYLAYER).
 *   크기로 가르면 6mm 이하 타공이 마크로 새어 나가 **재단기가 안 자른다**.
 *   우리 산출물에서 둘은 스타일이 정반대다:
 *       돔보 = 채움(K100) · 획 없음     ← mesCut_addDombo
 *       타공·칼선 = 획(M100 0.6) · 채움 없음
 *   크기 조건은 보조 가드로만 남긴다(채워진 큰 도형이 섞여 들어오는 경우).
 */
function mesCut_isMarkItem(it) {
    try {
        if (it.typename !== 'PathItem') return false;
        if (!it.filled || it.stroked) return false;
        var b = it.geometricBounds;
        var w = (b[2] - b[0]) / MESCUT_PT_PER_MM, h = (b[1] - b[3]) / MESCUT_PT_PER_MM;
        var lim = MESCUT_DOMBO_DIAM_MM + 2;
        return (w <= lim && h <= lim && Math.abs(w - h) < 1);
    } catch (e) { return false; }
}

// ★DXF 안에서만 쓰는 레이어명. **ASCII 로 둔다** — 일러 문서는 사내 규약대로 `재단선` 그대로다.
//   실물 생산 DXF 12건 중 9건이 순수 ASCII(`Layer 2`/`Layer 3`)고, 한글 이름이 든 3건은 `_U+XXXX`
//   이스케이프로 들어 있었다(우리 export 는 `$DWGCODEPAGE=ANSI_949` 로 원시 바이트를 쓴다).
//   이름 자체엔 규약이 없으므로(§2.5) 인코딩 변수를 아예 없애는 쪽을 고른다.
// 문서 안의 레이어 규약 — `SheetLayout.jsx:19~22` 와 같다:
//   재단선(CutLine) = **print OFF** · 돔보(Dombo) = print ON
//   칼선은 인쇄물에 나오면 안 되고, 돔보는 인쇄돼야 재단기가 읽는다.
var MESCUT_MARK_LAYER = '돔보';
var MESCUT_DXF_CUT_LAYER = 'CUT';
var MESCUT_DXF_MARK_LAYER = 'MARK';
var MESCUT_DOMBO_DIAM_MM = 6;
var MESCUT_DOMBO_CORNER_MM = 17;
var MESCUT_DOMBO_DIR_MM = 60;
var MESCUT_DOMBO_MAXGAP_MM = 500;

/** 조각이 피해야 할 사방 여백(mm) — 패널이 이 값만큼 배치 영역을 줄인다. */
/**
 * 조각이 피해야 할 사방 여백(mm) = 돔보 **원이 실제로 차지하는 만큼**.
 *
 * ★`코너 + 지름`(23mm)이 아니라 `코너 + 반지름`(20mm)이다 — 돔보 중심은 코너에서 17mm 바깥이고
 *   원은 거기서 **반지름 3mm** 만 더 뻗는다. 지름을 더하면 아무것도 없는 **3mm 를 매 변마다 버린다**.
 *   실물 생산 파일도 원 바깥끝이 판 가장자리에 **정확히 접한다**(2026-08-02 실측 30쌍:
 *   돔보 중심 = 칼선 + 7 · 판 = 칼선 + 10 = 중심 + 반지름).
 *   변당 3mm · 양변 6mm 절감이고 돔보는 그대로 판 안에 완전히 들어간다(위험 0).
 *
 * ⚠️ 패널 `DOMBO_MARGIN_MM` 과 **같은 값이어야 한다** — 어긋나면 조각이 돔보를 덮거나 시트를 넘는다.
 */
/**
 * ★배율(1/N 축소본) — A0(`mes-a0-host.jsx` 의 `sN`)와 **같은 규칙**이다.
 *   아트를 확대하지 않는다. 파일 좌표에서 작업하되 **실물 mm 상수를 ÷N 로 그려서**
 *   실물에서 정확한 치수가 나오게 한다(A0: `DOMBO_DIAM = 6 * PT / sN`).
 *   여백·간격·도련은 패널이 이미 환산해 넘기므로 여기서 또 나누면 **두 번 줄어든다** — 하지 말 것.
 *   돔보만 호스트 안에 상수가 있어서 여기서 환산한다.
 */
var MESCUT_SCALE_N = 1;
function mesCut_sc(mm) { return mm / (MESCUT_SCALE_N > 0 ? MESCUT_SCALE_N : 1); }

function mesCut_domboMargin() { return mesCut_sc(MESCUT_DOMBO_CORNER_MM + MESCUT_DOMBO_DIAM_MM / 2); }

/**
 * 시트 문서에 재단선(둘레) + 돔보를 그린다. 디자인 영역 = 아트보드에서 margin 만큼 안쪽.
 * 돔보는 디자인 영역 **바깥** 17mm 에 놓이므로 아트보드 안에 정확히 들어간다.
 */
/**
 * '재단선' 레이어를 얻는다(없으면 만든다).
 * ★`layers.add()` 는 **새 레이어를 활성 레이어로 만든다** — 그대로 두면 칼선을 한 번 만든 뒤
 *   사용자가 그리는 그림이 전부 재단선 레이어로 들어간다(2026-08-01 실측에서 걸렸다).
 *   만들기 전 활성 레이어를 기억했다가 되돌린다. 칼선은 이 함수가 돌려준 레이어에 **명시적으로** 넣으므로
 *   활성 레이어를 되돌려도 들어가는 자리는 바뀌지 않는다.
 */
function mesCut_ensureCutLayer(doc) {
    for (var i = 0; i < doc.layers.length; i++) if (doc.layers[i].name === MESCUT_CUT_LAYER) return doc.layers[i];
    var prev = null;
    try { prev = doc.activeLayer; } catch (e0) {}
    var l = doc.layers.add(); l.name = MESCUT_CUT_LAYER;
    // ★칼선은 **인쇄에서 뺀다**(규약: CutLine = print OFF). 인쇄물에 칼선이 찍히면 안 된다.
    try { l.printable = false; } catch (eP) {}
    try { if (prev) doc.activeLayer = prev; } catch (e1) {}
    return l;
}

/** 돔보 레이어 — 칼선과 **분리**하고 **인쇄는 켠다**(재단기가 읽어야 한다). */
function mesCut_ensureMarkLayer(doc) {
    for (var i = 0; i < doc.layers.length; i++) if (doc.layers[i].name === MESCUT_MARK_LAYER) return doc.layers[i];
    var prev = null;
    try { prev = doc.activeLayer; } catch (e0) {}
    var l = doc.layers.add(); l.name = MESCUT_MARK_LAYER;
    try { l.printable = true; } catch (eP) {}
    try { if (prev) doc.activeLayer = prev; } catch (e1) {}
    return l;
}
function mesCut_magenta() { var c = new CMYKColor(); c.cyan = 0; c.magenta = 100; c.yellow = 0; c.black = 0; return c; }

function mesCut_addDombo(doc) {
    var PT = MESCUT_PT_PER_MM;
    var ar = doc.artboards[0].artboardRect;   // [L,T,R,B] pt, y-up
    var m = mesCut_domboMargin() * PT;
    var oL = ar[0] + m, oT = ar[1] - m, oR = ar[2] - m, oB = ar[3] + m;   // 디자인 영역
    if (oR - oL <= 0 || oT - oB <= 0) return 'skip:too-small';

    // ★돔보는 **칼선과 다른 레이어**에 둔다(2026-08-03 지시 · 규약 = SheetLayout.jsx:19~22).
    //   칼선 레이어는 print OFF 라 돔보를 같이 두면 **돔보가 인쇄에서 빠져 재단기가 못 읽는다.**
    var layer = mesCut_ensureMarkLayer(doc);

    // ⚠️ 시트 전체를 두르는 사각 재단선은 **만들지 않는다**(2026-08-03 지시).
    //   조각별 칼선이 이미 있어 어디를 자를지 정해지고, 판 둘레를 도는 경로는 재료·시간만 쓴다.

    // ★실물 mm → 파일 좌표(÷N). 배율이 1이면 그대로다(A0 와 같은 규칙).
    var D = mesCut_sc(MESCUT_DOMBO_DIAM_MM) * PT;
    var C = mesCut_sc(MESCUT_DOMBO_CORNER_MM) * PT;
    var DIR = mesCut_sc(MESCUT_DOMBO_DIR_MM) * PT;
    var MAXG = mesCut_sc(MESCUT_DOMBO_MAXGAP_MM) * PT;
    var kCol = new CMYKColor(); kCol.cyan = 0; kCol.magenta = 0; kCol.yellow = 0; kCol.black = 100;
    var n = 0;
    function mk(cx, cy) {
        try {
            var el = layer.pathItems.ellipse(cy + D / 2, cx - D / 2, D, D);
            el.filled = true; el.stroked = false; el.fillColor = kCol;
            n++;
        } catch (e) {}
    }
    function inter(from, to, fixed, horiz) {
        var span = to - from;
        if (span <= MAXG) return;
        var cnt = Math.floor(span / MAXG);
        var step = span / (cnt + 1);
        for (var i2 = 1; i2 <= cnt; i2++) {
            var pos = from + step * i2;
            if (horiz) mk(pos, fixed); else mk(fixed, pos);
        }
    }
    mk(oL - C, oT + C); mk(oR + C, oT + C); mk(oL - C, oB - C); mk(oR + C, oB - C);
    // 방향 돔보 = 짧은 변에(A0 와 같은 규칙)
    if ((oR - oL) > (oT - oB)) mk(oL - C, oB - C + DIR);
    else mk(oL + DIR, oT + C);
    inter(oL, oR, oT + C, true);
    inter(oL, oR, oB - C, true);
    inter(oB, oT, oL - C, false);
    inter(oB, oT, oR + C, false);
    return 'ok:' + n;
}

/* ══ 배율 확대 — 아트를 직접 키우지 않는다 (2026-08-28) ═══════════════════════
 * ★증상: 1/10 축소본을 10배로 키워 판을 짜면 **배경이 통째로 사라진다**.
 *   실측(약국.ai): 배경이 3겹(빈 사각형 / 그라디언트 / 회색 판)이고 그라디언트에
 *   **불투명도 마스크**가 걸려 있다. 회색 판을 굳이 아래 깐 이유가 그것이다.
 *   `resize()` 는 개체는 키우지만 **마스크는 제자리에 둔다** → 1/10 크기 창문만 남고
 *   나머지가 투명해져 밑의 회색이 드러난다. 판에 작은 초록 조각 하나만 남은 게 그 증거다.
 *
 * ★일러에는 「마스크를 데리고 확대하는」 스크립트 경로가 없다. 2026-08-28 전수 시험:
 *     resize(플래그 전부 켬) ✖ · resize(그라디언트 끔) ✖ · transform 행렬 ✖
 *     원본 래스터화 후 확대 ✖(60초·결과 빈 이미지) · expandStyle 후 확대 ✖
 *
 * ★그래서 **아트를 키우지 않는다.** 조각을 PDF 로 굳혀 배치(PlacedItem)한 뒤 **껍데기만** 키운다.
 *   마스크는 PDF 안쪽에 있어 바깥 확대와 무관하고, 일러가 커진 크기로 다시 렌더한다.
 *   실측: PDF 1,026ms + 배치·확대 877ms + 임베드 1,148ms · **링크/임베드/EPS 되열기 전부 정상**.
 *
 * ⚠️ `preserveEditability = false` 가 핵심이다 — 편집성을 버리고 **겉모습**을 굳힌다.
 *    true 로 두면 마스크가 그대로 살아 나와 같은 문제가 재발한다.
 * ⚠️ 임베드는 필수다. 링크로 두면 임시 PDF 를 지우는 순간 판이 깨진다.
 * @return 새 개체(성공) · null(실패 — 호출부가 종전 resize 로 폴백한다)
 */
function mesCut_scaleAsPlaced(doc, artLayer, srcItem, srcDoc, pct, tagIdx, rotDeg) {
    var bb = null;
    // ★기준은 **잉크 경계**다 — 파이프라인 전체(굽기·배치·칼선)가 잉크 기준이라 여기만 visibleBounds 를
    //   쓰면 마스크로 가려진 여분이 PDF 아트보드에 들어가고, 배치 후 그 여분이 되살아나 조각이 커진다
    //   (2026-08-31 실측: 원본 잉크 124x80 인데 판에 810x1240 으로 놓여 재단선 800x1240 을 양옆 5mm 초과).
    try { bb = mesCut_inkBounds(srcItem) || srcItem.visibleBounds; } catch (e0) { return null; }
    if (!bb) return null;
    var w0 = bb[2] - bb[0], h0 = bb[1] - bb[3];
    if (!(w0 > 0) || !(h0 > 0)) return null;

    var pdfPath = Folder.temp.fsName.replace(/\\/g, '/') + '/mes_cut_place_' + tagIdx + '.pdf';
    var pdfFile = new File(pdfPath);
    var tmp = null;
    try {
        // ★굳힐 원본은 **원본 문서의 조각**이다. 판에 이미 복제해 둔 사본을 쓰면 안 된다 —
        //   임시 문서를 만드는 순간 그 사본 참조가 무효가 된다(실측: "duplicate 이 함수가 아닙니다").
        //   원본 문서의 조각 참조는 굽기 경로가 이미 같은 방식으로 쓰고 있어 안전하다.
        tmp = mesCut_newDocMM(w0, h0);
        app.activeDocument = srcDoc;                 // ★문서 간 복제는 원본이 active 일 때만 동작한다
        var cp = srcItem.duplicate(tmp.layers[0], ElementPlacement.PLACEATEND);
        app.activeDocument = tmp;
        var nb = mesCut_inkBounds(cp) || cp.visibleBounds;   // ★원점도 같은 기준이어야 아트가 안 밀린다
        cp.translate(-nb[0], h0 - nb[1]);
        tmp.artboards[0].artboardRect = [0, h0, w0, 0];
        var po = new PDFSaveOptions();
        po.compatibility = PDFCompatibility.ACROBAT5;
        po.preserveEditability = false;
        po.generateThumbnails = false;
        tmp.saveAs(pdfFile, po);
        tmp.close(SaveOptions.DONOTSAVECHANGES); tmp = null;
    } catch (e1) {
        if (tmp) { try { tmp.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {} }
        try { app.activeDocument = doc; } catch (e3) {}
        return null;
    }

    // ★임베드는 PlacedItem 참조를 무효로 만든다 — 새 개체를 **위치로** 찾으면 안 된다.
    //   판에는 이미 앞 조각들과 이 조각의 원본 사본이 올라와 있어 `pageItems[0]` 은 남의 것을 집는다
    //   (첫 시험이 그래서 null 로 떨어졌다). 그래서 **빈 임시 레이어**에서 작업한다 —
    //   거기엔 개체가 하나뿐이라 누구인지 헷갈릴 여지가 없다.
    var stage = null;
    try {
        app.activeDocument = doc;
        stage = doc.layers.add();
        stage.name = '__mes_place_stage';
        doc.activeLayer = stage;
        var pl = doc.placedItems.add();
        pl.file = pdfFile;
        var pb = pl.visibleBounds;
        if (!((pb[2] - pb[0]) > 0)) throw new Error('배치 크기 0');
        // ★배율의 기준은 **우리가 만든 PDF 아트보드(w0)** 다 — 배치 직후 `visibleBounds` 는 아트보드가
        //   아니라 **그림이 있는 데까지**로 잘린 값이라, 그 값으로 나누면 차이만큼 크게 나온다
        //   (약국.ai 1.13 실측: 아트보드 12.83 vs 배치 보고 10.43 → 결과 +23% → 검산 탈락 → 폴백).
        //   `embed()` 가 아트보드 상자를 되살리므로 **그냥 pct 배**면 맞는다. 나눗셈이 필요 없다.
        // ★resize 는 반드시 `embed()` **앞**이어야 한다 — 임베드하면 native 아트가 되어 그때 확대하는 건
        //   아트를 직접 키우는 것과 같고, 불투명도 마스크가 안 따라와 **배경이 사라진다**.
        //   (이 함수가 존재하는 이유 자체다. 순서를 뒤집었다가 배경이 회색으로 죽는 걸 실측했다.)
        var wantW = w0 * (pct / 100), wantH = h0 * (pct / 100);
        pl.resize(pct, pct, true, true, true, true, pct);
        // ★회전도 `embed()` **앞**이다 — 확대와 완전히 같은 이유다. 임베드 뒤에 돌리면 native 아트를
        //   직접 돌리는 것이라 불투명도 마스크가 제자리에 남고 **배경이 깨진다**(실측: 판 위아래가 회색).
        //   배치 상태에서는 개체가 통짜라 회전·확대 둘 다 안전하다.
        if (rotDeg) { pl.rotate(-rotDeg); }        // Konva CW → 일러 CCW (호출부와 같은 규칙)
        pl.embed();
        if (stage.pageItems.length !== 1) throw new Error('임시 레이어 개체 ' + stage.pageItems.length);
        var got = stage.pageItems[0];
        // ★크기 검증 — 어긋나면 폴백한다(조용히 틀린 크기로 배치하지 않는다)
        // ★검산도 **잉크 경계**로 — `embed()` 는 마스크로 가린 여분을 `visibleBounds` 에 되살린다
        //   (실측: ink 800x1240 인데 vis 876x1240). 그 값으로 재면 정상 배치를 9.6% 불일치로 탈락시켜
        //   배경 깨는 폴백으로 보낸다. 배치·칼선이 실제로 쓰는 값은 잉크 경계다.
        var gb2 = mesCut_inkBounds(got) || got.visibleBounds;
        // ★기대 폭은 **회전 후** 값이다 — 90도 돌면 폭과 높이가 바뀐다. 안 고치면 정상 회전을
        //   "크기 불일치" 로 잡아 배경 깨는 폴백으로 보낸다.
        var _rad = (rotDeg || 0) * Math.PI / 180;
        var _expW = Math.abs(wantW * Math.cos(_rad)) + Math.abs(wantH * Math.sin(_rad));
        if (Math.abs((gb2[2] - gb2[0]) - _expW) > _expW * 0.02) throw new Error('크기 불일치');
        got.move(artLayer, ElementPlacement.PLACEATBEGINNING);
        stage.remove(); stage = null;
        return got;
    } catch (e4) {
        if (stage) { try { stage.remove(); } catch (e5) {} }
        return null;
    }
}

/** 임시 PDF 정리 — 임베드가 끝났으므로 판은 이 파일에 의존하지 않는다. */
function mesCut_cleanPlaced(n) {
    for (var i = 0; i < n; i++) {
        try {
            var f = new File(Folder.temp.fsName.replace(/\\/g, '/') + '/mes_cut_place_' + i + '.pdf');
            if (f.exists) f.remove();
        } catch (e) {}
    }
}

/* == 굳히기를 **판당 1회**로 (2026-09-03) ==================================
 * ★증상: 회전만 걸린 판짜기가 실사용 불가로 느려졌다. 0.28.0 이 「회전만 있어도 PDF 경로」로
 *   바꾼 뒤 조각당 3.05초가 붙어, 20조각이면 적용 단계만 1분이다.
 *
 * ★원인은 PDF 가 아니라 **조각마다 임시 문서를 만드는 것**이다. `nestBakeAll` 이 굽기에서
 *   이미 실측해 둔 분해와 그대로 맞아떨어진다:
 *       문서 생성+닫기 2,000ms · 활성 전환 338ms x3 · 문서 간 복제 183ms  = 약 3,200ms
 *       (scaleAsPlaced 실측 = PDF 1,026 + 배치·확대 877 + 임베드 1,148 = 3,051ms)
 *   즉 굳히기 자체가 비싼 게 아니라 **조각 수에 비례하는 문서 관리**가 비싸다.
 *
 * ★굳히기는 없앨 수 없다 — 일러에는 마스크를 데리고 변형하는 스크립트 경로가 아예 없고
 *   (mesCut_scaleAsPlaced 주석의 전수 시험), 마스크 유무는 DOM 으로 알 수 없다(그래서 픽스처가
 *   크기가 아니라 **색**으로 판정한다). 그리고 회전은 **임베드 앞**에서만 안전하다 —
 *   임베드 뒤 native 아트를 돌리면 마스크가 제자리에 남아 다시 깨진다.
 *
 * => 그래서 **조각 수와 무관하게** 만든다. 회전 값은 {0,90,180,270} 네 가지뿐이므로:
 *     (1) 조각 전부를 임시 문서 **하나**에 격자로 모아 PDF 를 **한 번** 굳힌다(문서 왕복 1회)
 *     (2) 판에서 그 PDF 를 **회전 값마다 한 번** 배치→확대→회전→임베드 한다(최대 4회)
 *     (3) 임베드된 격자를 조각별로 **나눠** 두고, 배치마다 그것을 `duplicate` 한다(ms)
 *   비용 = 1x PDF + (쓰인 회전 수) x (배치+임베드). 조각 수에 안 붙는다.
 *
 * ⚠️ 결과물은 오늘과 **같은 것**이다 — 같은 `preserveEditability=false` 평탄화를 거치고,
 *    회전도 같은 자리(임베드 앞)에서 걸린다. 새 판정·휴리스틱을 넣지 않았다.
 * ⚠️ 나누기가 실패하면(평탄화가 페이지를 통째로 뭉갠 경우 등) **조각별 옛 경로로 되돌린다.**
 *    조용히 틀린 자리에 놓는 것이 가장 나쁘므로 배정은 **개수·위치·크기 셋 다** 확인한다.
 */

/** 격자 셀 사이 여백 — 평탄화가 이웃 조각을 한 덩어리로 물지 않게 띄운다 */
var MESCUT_HARDEN_GAP_MM = 20;

/**
 * ★게이트 전용 스위치 — true 면 격자 마스터를 안 만들고 **조각별 옛 경로**로만 돈다.
 * 왜 있나: ① 폴백 경로가 살아 있는지 게이트가 실제로 확인해야 한다(안 쓰이는 코드는 썩는다)
 *          ② 개선폭을 추정이 아니라 **A/B 실측**으로 말할 수 있어야 한다.
 * ⚠️ 패널은 이 값을 절대 건드리지 않는다. `cut:e2e` 만 쓴다.
 */
var MESCUT_HARDEN_OFF = false;

// ★게이트 전용 — 켜면 굽기가 조각마다 exportFile 하는 옛 경로로 돈다(동등성 시험용).
//   `MESCUT_HARDEN_OFF` 와 같은 성질이라 **하네스가 반드시 되돌려야** 한다.
var MESCUT_EFS_OFF = false;
// 아트보드 상한(일러 1000). 넘으면 옛 경로로 간다 — 쪼개서 여러 번 부르는 복잡도를 살 만한 자리가 아니다.
var MESCUT_EFS_MAX_AB = 900;

/**
 * (1) 조각 전부를 임시 문서 하나에 격자로 모아 **PDF 한 번** 굳힌다.
 * @returns {pdf, w, h, cells:{idx:{cx,cy,w,h}}} — 좌표는 격자 좌하단 원점 pt. 실패 시 null.
 */
function mesCut_hardenGrid(srcDoc, idxList) {
    var PT = MESCUT_PT_PER_MM;
    var GAP = MESCUT_HARDEN_GAP_MM * PT;
    var n = idxList.length, i;
    if (!n) return null;
    var cw = [], ch = [];
    for (i = 0; i < n; i++) {
        var b = null;
        try { b = mesCut_inkBounds(MESCUT_NEST_ITEMS[idxList[i]]); } catch (e0) {}
        if (!b) return null;
        cw.push((b[2] - b[0]) + GAP);
        ch.push((b[1] - b[3]) + GAP);
        if (cw[i] > MESCUT_CANVAS_MAX_PT || ch[i] > MESCUT_CANVAS_MAX_PT) return null;
    }
    // 행 줄바꿈 = `nestBakeAll` 과 **같은 규칙**(한 줄이 캔버스 한계에 닿으면 다음 줄).
    // ⚠️ 재는 패스와 놓는 패스가 **같은 조건**을 써야 한다 — 다르면 조각이 아트보드 밖으로 나간다.
    var totW = 0, totH = 0, rowW = 0, rowH = 0;
    for (i = 0; i < n; i++) {
        if (rowW > 0 && rowW + cw[i] > MESCUT_CANVAS_MAX_PT) {
            if (rowW > totW) totW = rowW;
            totH += rowH; rowW = 0; rowH = 0;
        }
        rowW += cw[i];
        if (ch[i] > rowH) rowH = ch[i];
    }
    if (rowW > totW) totW = rowW;
    totH += rowH;
    if (!(totW > 0) || !(totH > 0) || totH > MESCUT_CANVAS_MAX_PT) return null;

    var pdfPath = Folder.temp.fsName.replace(/\\/g, '/') + '/mes_cut_harden.pdf';
    var tmp = null, cells = {};
    try {
        tmp = mesCut_newDocMM(totW, totH);
        var lay = tmp.layers[0];
        app.activeDocument = srcDoc;                 // ★전환 1 — 문서 간 복제는 원본이 active 여야 한다
        var cps = [];
        for (i = 0; i < n; i++) {
            var cp = null;
            try { cp = MESCUT_NEST_ITEMS[idxList[i]].duplicate(lay, ElementPlacement.PLACEATEND); } catch (eD) {}
            cps.push(cp);
        }
        app.activeDocument = tmp;                    // ★전환 2 — 이후로는 임시 문서 안에서만 논다
        var curX = 0, curY = totH, rowMax = 0;
        for (i = 0; i < n; i++) {
            if (!cps[i]) throw new Error('복제 실패 ' + idxList[i]);
            if (curX > 0 && curX + cw[i] > MESCUT_CANVAS_MAX_PT) { curX = 0; curY -= rowMax; rowMax = 0; }
            var b2 = mesCut_inkBounds(cps[i]);
            if (!b2) throw new Error('경계 없음 ' + idxList[i]);
            var w2 = b2[2] - b2[0], h2 = b2[1] - b2[3];
            // 셀 **중앙**에 놓는다 — 나눌 때 중심으로 배정하므로 여백이 대칭이어야 한다
            var tx = curX + (cw[i] - w2) / 2, ty = curY - (ch[i] - h2) / 2;
            try { cps[i].translate(tx - b2[0], ty - b2[1]); } catch (eT) {}
            cells[String(idxList[i])] = { cx: tx + w2 / 2, cy: ty - h2 / 2, w: w2, h: h2 };
            curX += cw[i];
            if (ch[i] > rowMax) rowMax = ch[i];
        }
        tmp.artboards[0].artboardRect = [0, totH, totW, 0];
        var po = new PDFSaveOptions();
        po.compatibility = PDFCompatibility.ACROBAT5;
        po.preserveEditability = false;              // ★핵심 — 편집성을 버리고 **겉모습**을 굳힌다
        po.generateThumbnails = false;
        tmp.saveAs(new File(pdfPath), po);
        tmp.close(SaveOptions.DONOTSAVECHANGES); tmp = null;
    } catch (e) {
        if (tmp) { try { tmp.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {} }
        try { app.activeDocument = srcDoc; } catch (e3) {}
        return null;
    }
    try { app.activeDocument = srcDoc; } catch (e4) {}
    return { pdf: pdfPath, w: totW, h: totH, cells: cells };
}

/**
 * 굳힌 격자에서 조각 후보 자식을 꺼낸다 — 페이지 상자 클립 래퍼를 벗긴다.
 * ⚠️ `need` 를 받아 **필요 이상 내려가지 않게** 한다. 조각이 하나뿐일 때 계속 내려가면
 *    그 조각의 내부 그룹까지 풀어 버려 한 조각이 여러 개로 보인다.
 */
function mesCut_hardenKids(item, need) {
    var t;
    try { t = item.typename; } catch (e) { return []; }
    if (t !== 'GroupItem') return [item];
    var kids = [];
    try {
        for (var i = 0; i < item.pageItems.length; i++) {
            var c = item.pageItems[i];
            try { if (c.clipping || c.hidden) continue; } catch (e1) {}
            kids.push(c);
        }
    } catch (e2) { return []; }
    if (kids.length === 1 && kids.length < need) {
        var inner = mesCut_hardenKids(kids[0], need);
        if (inner.length > 1) return inner;
    }
    return kids;
}

/**
 * (3) 임베드된 격자 마스터를 조각별 그룹으로 나눈다.
 *
 * 좌표 사상 = 격자 중심 기준 -> x배율 -> 회전 -> 마스터 상자 중심.
 *   `embed()` 가 아트보드 상자를 되살리므로 마스터 상자의 **중심**이 격자 중심에 대응한다.
 *   회전은 90도 배수뿐이라 cos/sin 이 정수여서 부동소수 오차가 없다.
 *
 * ⚠️ 배정을 **세 번** 확인한다 — 개수(자식이 조각 수 이상) · 위치(최근접 셀) · 크기(묶은 뒤 셀 크기).
 *    하나라도 어긋나면 null 을 돌려 조각별 옛 경로로 보낸다. 틀린 자리에 조용히 놓는 것보다
 *    느린 편이 낫다.
 * @returns {idx: GroupItem} 또는 null
 */
function mesCut_hardenSplit(destLayer, master, grid, rot, pct) {
    var gb = null;
    try { gb = master.visibleBounds; } catch (e) { return null; }
    if (!gb) return null;
    var k = pct / 100;
    var swap = (Math.abs((rot || 0) % 180) === 90);
    var expW = (swap ? grid.h : grid.w) * k, expH = (swap ? grid.w : grid.h) * k;
    // 상자가 기대와 다르면 사상 전제가 깨진 것이다
    if (Math.abs((gb[2] - gb[0]) - expW) > expW * 0.02 + 1) return null;
    if (Math.abs((gb[1] - gb[3]) - expH) > expH * 0.02 + 1) return null;
    var gcx = (gb[0] + gb[2]) / 2, gcy = (gb[1] + gb[3]) / 2;
    var th = -(rot || 0) * Math.PI / 180;            // 일러는 CCW 양수 · 호출부와 같은 규칙
    var cs = Math.cos(th), sn = Math.sin(th);
    var idxs = [], want = [], size = [], key, i, j;
    for (key in grid.cells) {
        if (!grid.cells.hasOwnProperty(key)) continue;
        var c = grid.cells[key];
        var ax = (c.cx - grid.w / 2) * k, ay = (c.cy - grid.h / 2) * k;
        idxs.push(key);
        want.push([gcx + (ax * cs - ay * sn), gcy + (ax * sn + ay * cs)]);
        size.push([(swap ? c.h : c.w) * k, (swap ? c.w : c.h) * k]);
    }
    if (!idxs.length) return null;
    var kids = mesCut_hardenKids(master, idxs.length);
    if (kids.length < idxs.length) return null;      // 평탄화가 페이지를 통째로 뭉갰다
    var buckets = [];
    for (i = 0; i < idxs.length; i++) buckets.push([]);
    for (i = 0; i < kids.length; i++) {
        var kb = mesCut_inkBounds(kids[i]);
        if (!kb) continue;
        var kx = (kb[0] + kb[2]) / 2, ky = (kb[1] + kb[3]) / 2;
        var best = -1, bd = 0;
        for (j = 0; j < idxs.length; j++) {
            var dx = kx - want[j][0], dy = ky - want[j][1];
            var d = dx * dx + dy * dy;
            if (best < 0 || d < bd) { best = j; bd = d; }
        }
        buckets[best].push(kids[i]);
    }
    var made = [], map = {};
    try {
        for (i = 0; i < idxs.length; i++) {
            if (!buckets[i].length) throw new Error('빈 조각 ' + idxs[i]);
            var g = destLayer.groupItems.add();
            made.push(g);
            for (j = 0; j < buckets[i].length; j++) buckets[i][j].move(g, ElementPlacement.PLACEATEND);
            var gib = mesCut_inkBounds(g);
            if (!gib) throw new Error('묶음 경계 없음 ' + idxs[i]);
            // 크기 확인 — 옆 조각이 섞여 들어오면 여기서 걸린다
            var tol = Math.max(size[i][0], size[i][1]) * 0.05 + 1;
            if (Math.abs((gib[2] - gib[0]) - size[i][0]) > tol) throw new Error('폭 불일치 ' + idxs[i]);
            if (Math.abs((gib[1] - gib[3]) - size[i][1]) > tol) throw new Error('높이 불일치 ' + idxs[i]);
            map[idxs[i]] = g;
        }
    } catch (eS) {
        for (i = 0; i < made.length; i++) { try { made[i].remove(); } catch (eR) {} }
        return null;
    }
    return map;
}

/**
 * (2) 판 문서에서 굳힌 격자를 **회전 값마다 한 번** 배치·확대·회전·임베드하고 조각별로 나눈다.
 * ⚠️ 순서는 배치 -> 확대 -> 회전 -> 임베드 다. 확대·회전은 반드시 `embed()` **앞**이어야 한다 —
 *    뒤에서 하면 native 아트를 직접 변형하는 것이라 불투명도 마스크가 제자리에 남는다.
 * ⚠️ 빈 임시 레이어에서 작업한다 — 판에는 이미 다른 개체가 있어 `pageItems[0]` 이 남의 것을 집는다.
 * @returns {layer, byRot:{rot:{idx:GroupItem}}, n} — 하나도 못 만들면 null
 */
function mesCut_hardenMasters(doc, grid, rots, pct) {
    var lay = null;
    try { lay = doc.layers.add(); lay.name = '__mes_harden'; } catch (eL) { return null; }
    var byRot = {}, n = 0;
    for (var r = 0; r < rots.length; r++) {
        var rot = rots[r] || 0;
        var stage = null, got = null;
        try {
            stage = doc.layers.add();
            stage.name = '__mes_harden_stage';
            doc.activeLayer = stage;
            var pl = doc.placedItems.add();
            pl.file = new File(grid.pdf);
            if (pct !== 100) pl.resize(pct, pct, true, true, true, true, pct);
            if (rot) pl.rotate(-rot);                // Konva CW -> 일러 CCW (조각별 경로와 같은 규칙)
            pl.embed();
            if (stage.pageItems.length !== 1) throw new Error('임시 레이어 개체 ' + stage.pageItems.length);
            got = stage.pageItems[0];
        } catch (eP) { got = null; }
        var map = got ? mesCut_hardenSplit(lay, got, grid, rot, pct) : null;
        if (map) { byRot[String(rot)] = map; n++; }
        // 임시 레이어를 통째로 치운다 — 나눈 그룹은 이미 `lay` 로 옮겨졌고 남은 것은 클립 패스뿐이다
        if (stage) { try { stage.remove(); } catch (eR) {} }
    }
    if (!n) { try { lay.remove(); } catch (eR2) {} return null; }
    return { layer: lay, byRot: byRot, n: n };
}

/**
 * 배치 결과를 **새 문서**에 렌더링. params 파일 형식(UTF-8):
 *   S <sheetIdx> <Wmm> <Hmm>            시트 시작
 *   I <itemIdx> <xmm> <ymm> <rot>       조각 배치(좌상단 기준, y-down mm)
 *   P / B ...                           조각별 칼선(래스터 모드에서만 — 벡터 모드는 안 보낸다)
 * 반환 'ok;sheets=<n>;items=<n>'
 * ⚠️ 원본 문서는 건드리지 않는다 — 네스팅은 "새 판을 짜는" 작업이지 원본 편집이 아니다.
 *
 * @param vecOffsetMm 주면 **벡터 칼선 모드** — 배치된 사본에서 직접 실루엣을 뽑는다.
 *   ★이 모드에선 좌표 정렬 문제가 원리적으로 없다 — 이미 회전·이동이 끝난 사본을 그대로 쓰므로
 *     패널의 `baseX`/trim 오프셋 수식도, 미세·거친 두 마스크를 함께 들고 다니는 것도 필요 없다.
 */
function mesCut_nestApply(vecOffsetMm, vecFillClosed, vecBleedMm, vecBleedMode, cutMode) {
    if (!MESCUT_NEST_ITEMS || !MESCUT_NEST_ITEMS.length) return 'ERROR 대상 없음 (nestBegin 먼저)';
    var raw = mesCut_readParams();
    if (!raw) return 'ERROR params 없음';
    var srcDoc = app.activeDocument;
    var lines = String(raw).split(/[\r\n]+/);

    // ── 1단계: 전부 파싱해 시트별로 모은다 ────────────────────────────
    // 파싱과 문서 조작을 섞지 않는 이유 = **조각마다 activeDocument 를 왕복하지 않기 위해서**다.
    // 문서 활성화는 화면 갱신을 동반해 조각 수에 비례해 눈에 띄게 느려진다.
    //   이전: 조각당 2회(원본↔시트) → 20조각이면 40회 · 지금: **시트당 2회** (2026-07-31)
    // ★배율은 **매 호출 초기화**한다. 지난 실행 값이 남으면 다음 판의 돔보가 조용히 작아진다.
    MESCUT_SCALE_N = 1;
    var resizePct = 100;   // 파일 좌표(F) → 저장 좌표(S) 조각 리사이즈. 100 = 그대로
    var sheets = [], cur = null, bleedSz = {};
    for (var i = 0; i < lines.length; i++) {
        var ln = lines[i].replace(/^\s+|\s+$/g, '');
        if (!ln) continue;
        var p = ln.split(/\s+/);
        // ★L = 도련 PNG 실제 크기(mm). 조각 단위라 시트와 무관하므로 `S` 보다 **앞에서** 처리한다
        //   (그래야 params 안에서 줄 위치에 매이지 않는다). 패널이 만든 픽셀 크기에서 나온 값이라
        //   호스트가 px→mm 을 다시 계산하면 반올림만큼 어긋난다 — 받은 값을 그대로 쓴다.
        // ★N = 배율(파일이 실물의 1/N). 돔보 상수를 파일 좌표로 줄이는 데만 쓴다 —
        //   여백·간격·도련은 패널이 이미 환산해 보내므로 여기서 또 나누면 두 번 줄어든다.
        if (p[0] === 'N') { var sn = parseInt(p[1], 10); MESCUT_SCALE_N = (sn > 0) ? sn : 1; continue; }
        // ★RS = 조각 리사이즈 %(파일 좌표 → 저장 좌표). 아트는 **복제본만** 줄인다 — 원본은 손대지 않는다.
        if (p[0] === 'RS') { var rs = parseFloat(p[1]); if (rs > 0) resizePct = rs; continue; }
        if (p[0] === 'L') { bleedSz[parseInt(p[1], 10)] = { w: parseFloat(p[2]), h: parseFloat(p[3]) }; continue; }
        if (p[0] === 'S') { cur = { w: parseFloat(p[2]), h: parseFloat(p[3]), items: [], cuts: [], segs: [] }; sheets.push(cur); continue; }
        if (!cur) continue;
        if (p[0] === 'I') {
            cur.items.push({ idx: parseInt(p[1], 10), x: parseFloat(p[2]), y: parseFloat(p[3]), rot: parseFloat(p[4]) || 0 });
        } else if (p[0] === 'C') {
            // ★맞붙임 칼선 = **열린 선분**(mm). 맞닿은 변이 패널에서 이미 하나로 합쳐져 있어
            //   같은 자리를 두 번 긋지 않는다 → DXF 에 선이 한 줄만 남고 재단기가 한 번만 지난다.
            //   (조각별 닫힌 경로와 배타적이다 — 맞붙임이면 패널이 그것을 안 보낸다)
            cur.segs.push([parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3]), parseFloat(p[4])]);
        } else if (p[0] === 'P' || p[0] === 'B' || p[0] === 'H' || p[0] === 'HB') {
            var arr = [];
            for (var pi = 1; pi < p.length; pi++) {
                var xy = p[pi].split(',');
                if (xy.length === 2) arr.push([parseFloat(xy[0]), parseFloat(xy[1])]);
            }
            if (arr.length < 3) continue;
            // ★구멍은 **직전 외곽에 붙인다** — 단품 칼선의 pendOuter/pendHoles 와 같은 규약이다.
            //   외곽 없이 구멍만 온 줄은 버린다(붙일 데가 없으면 재단기가 허공을 자른다).
            if (p[0] === 'H' || p[0] === 'HB') {
                if (!cur.cuts.length) continue;
                var own = cur.cuts[cur.cuts.length - 1];
                if (!own.holes) own.holes = [];
                own.holes.push({ bez: p[0] === 'HB', pts: arr });
            } else {
                cur.cuts.push({ bez: p[0] === 'B', pts: arr, holes: [] });
            }
        }
    }
    if (!sheets.length) return 'ERROR 배치 결과 없음';

    var made = 0, items = 0, dombo = 0;
    // ★배율 확대를 PDF 배치로 처리한 수 / 그게 안 돼 resize 로 폴백한 수.
    //   폴백은 **배경이 깨졌을 수 있다는 뜻**이라 패널이 그걸 알아야 한다 — 조용히 넘기지 않는다.
    var nPlaced = 0, nPlaceFail = 0;
    var sheetWH = [];   // 판별 실제 아트보드 크기 'WxH'(mm) — 판마다 다르므로 전부 모은다
    // 도련 실패 집계 — 조각마다 도는 자리라 **조용히 넘기면 판이 다 깔린 뒤에야** 없는 걸 안다.
    var blFail = 0, blCode = '', blClip = 0, blPix = 0, blSolid = 0, blLegacy = 0;
    // ★도련 PNG 를 하나라도 받았는가 = **새 패널인가**. 구 패널이면 옛 경로를 그대로 태운다(아래 참조).
    var hasBleedPng = false;
    for (var bk in bleedSz) { if (bleedSz.hasOwnProperty(bk)) { hasBleedPng = true; break; } }
    // ★★이전 판 문서를 닫는다 (2026-08-27).
    //   여태 목록만 비우고 **문서는 열어 뒀다** — 간격을 다섯 번 조정하면 판 문서가 다섯 개 쌓인다.
    //   판짜기는 한 번에 안 끝나는 작업이라(조정이 본질) 그만큼 어수선해지고,
    //   어느 것이 최신인지 사람이 헷갈린다.
    //   ⚠️ 저장한 적 없는 **우리가 만든 판**만 닫는다. 사용자가 손댔으면(saved=false 여도) 저장 여부를
    //      물으면 안 되므로 DONOTSAVECHANGES 로 조용히 닫는다 — 원본은 애초에 이 목록에 없다.
    try {
        for (var oc = 0; oc < MESCUT_NEST_DOCS.length; oc++) {
            try { MESCUT_NEST_DOCS[oc].close(SaveOptions.DONOTSAVECHANGES); } catch (eOc) {}
        }
    } catch (eOl) {}
    MESCUT_NEST_DOCS = [];
    MESCUT_LAST_SHEET_W = 0; MESCUT_LAST_SHEET_H = 0;
    // ★대화상자 억제(0.8.1) — 조각 하나에서 메뉴 명령이 모달을 띄우면 **남은 조각 전부**가 멈춘다.
    //   2026-08-04 실사용: "다른 그룹에 속해있는 오브젝트들을 그룹으로 만들 수 없습니다" 모달로
    //   배치가 중단되고 도련이 안 만들어졌다. finally 에서 반드시 되돌린다.
    var silent = mesCut_silentBegin();
    try {
        // ★굳히기 준비 — **판당 1회**(위 mesCut_hardenGrid 주석). 조각마다 임시 문서를 만드는 게
        //   조각당 3초의 정체였다. 회전·배율이 걸린 조각이 하나도 없으면 아예 만들지 않는다
        //   = 종전 경로와 완전히 같다(회귀 0).
        var hardenGrid = null, nFast = 0, nMasters = 0, hardenWhy = '';
        // ★자를 수 없는 부스러기를 걷어낸 조각 **번호** — 화면이 어느 조각인지 말할 수 있어야 한다
        var vecDrop = [];
        var needIdx = [], seenIdx = {}, si, sj;
        for (si = 0; si < sheets.length; si++) {
            for (sj = 0; sj < sheets[si].items.length; sj++) {
                var itN = sheets[si].items[sj];
                if (!(resizePct !== 100 || itN.rot)) continue;
                if (seenIdx[String(itN.idx)]) continue;
                seenIdx[String(itN.idx)] = 1; needIdx.push(itN.idx);
            }
        }
        if (needIdx.length && MESCUT_HARDEN_OFF) hardenWhy = 'off';
        else if (needIdx.length) {
            hardenGrid = mesCut_hardenGrid(srcDoc, needIdx);
            if (!hardenGrid) hardenWhy = 'grid';
            else if (hardenGrid.w * (resizePct / 100) > MESCUT_CANVAS_MAX_PT
                || hardenGrid.h * (resizePct / 100) > MESCUT_CANVAS_MAX_PT) {
                // 확대한 격자가 일러 캔버스에 안 들어간다 → 조각별 옛 경로로(배율이 클 때만 생긴다)
                hardenGrid = null; hardenWhy = 'canvas';
            }
        }
        for (var s = 0; s < sheets.length; s++) {
            var sh = sheets[s];
            var doc = mesCut_newDocMM(sh.w * MESCUT_PT_PER_MM, sh.h * MESCUT_PT_PER_MM);
            doc.artboards[0].artboardRect = [0, sh.h * MESCUT_PT_PER_MM, sh.w * MESCUT_PT_PER_MM, 0];
            var sheetH = sh.h * MESCUT_PT_PER_MM;
            // ★아트 레이어를 명시적으로 들고 간다. `doc.layers[0]` 을 그때그때 읽으면 안 된다 —
            //   재단선 레이어를 만드는 순간 `layers.add()` 가 그것을 맨 위(index 0)로 넣어
            //   이후 조각들이 재단선 레이어로 들어간다(2026-07-31 실측: 6개 중 5개가 그리로 갔다).
            var artLayer = doc.layers[0];
            MESCUT_NEST_DOCS.push(doc);
            made++;

            // ★회전 값마다 마스터 하나 — 배치·임베드가 **조각 수와 무관하게** 최대 4회로 끝난다.
            //   여기(문서 생성 직후)에서 만드는 이유 = `doc` 가 이미 active 라 전환이 안 붙는다.
            var masters = null;
            if (hardenGrid) {
                var rotSeen = {}, rotList = [], ra;
                for (ra = 0; ra < sh.items.length; ra++) {
                    var itR = sh.items[ra];
                    if (!(resizePct !== 100 || itR.rot)) continue;
                    var rk = String(itR.rot || 0);
                    if (rotSeen[rk]) continue;
                    rotSeen[rk] = 1; rotList.push(itR.rot || 0);
                }
                if (rotList.length) {
                    masters = mesCut_hardenMasters(doc, hardenGrid, rotList, resizePct);
                    if (masters) nMasters += masters.n;
                    else if (!hardenWhy) hardenWhy = 'split';
                }
            }

            // ★★ 문서 간 duplicate 는 **원본이 active 일 때만** 동작한다(예외 없이 조용히 실패).
            //     그래서 원본을 **한 번만** 켜고 이 시트의 조각을 전부 복제한다.
            app.activeDocument = srcDoc;
            var copies = [], fromMaster = [];
            for (var a = 0; a < sh.items.length; a++) {
                var itA = sh.items[a];
                var mmap = masters ? masters.byRot[String(itA.rot || 0)] : null;
                if (mmap && mmap[String(itA.idx)]) {
                    // ★마스터가 대신한다 — 여기서 복제하지 않는다(문서 간 복제 183ms/조각을 안 낸다)
                    copies.push(null); fromMaster.push(true); continue;
                }
                fromMaster.push(false);
                var src = MESCUT_NEST_ITEMS[itA.idx], cp = null;
                if (src) { try { cp = src.duplicate(artLayer, ElementPlacement.PLACEATBEGINNING); } catch (eC) {} }
                copies.push(cp);
            }
            // 변형은 대상 문서에서 — 여기서도 한 번만 켠다.
            app.activeDocument = doc;
            for (var b = 0; b < copies.length; b++) {
                var copy = copies[b];
                var it2 = sh.items[b], rotDone = false;
                // ★굳힌 격자에서 조각을 꺼내 온다 — 확대·회전이 이미 걸려 있어 이동만 남는다(ms).
                if (fromMaster[b]) {
                    var mi = masters.byRot[String(it2.rot || 0)][String(it2.idx)];
                    try { copy = mi.duplicate(artLayer, ElementPlacement.PLACEATBEGINNING); } catch (eMD) { copy = null; }
                    if (copy) { copies[b] = copy; nPlaced++; nFast++; rotDone = true; }
                    else {
                        // 마스터 복제 실패 — 원본에서 다시 복제해 **조각별 옛 경로**로 되돌린다
                        app.activeDocument = srcDoc;
                        try { copy = MESCUT_NEST_ITEMS[it2.idx].duplicate(artLayer, ElementPlacement.PLACEATBEGINNING); }
                        catch (eMR) { copy = null; }
                        app.activeDocument = doc;
                        copies[b] = copy; fromMaster[b] = false;
                    }
                }
                if (!copy) continue;
                // ★파일 좌표(F) 아트를 저장 좌표(S) 크기로 — **회전·이동보다 먼저** 해야 한다.
                //   나중에 하면 이미 잡아 둔 잉크 경계가 어긋나 배치가 밀린다.
                // ★확대는 `resize` 가 아니라 **PDF 배치**로 한다 — resize 는 불투명도 마스크를
                //   제자리에 두고 개체만 키워 배경을 통째로 날린다(2026-08-28 실측).
                //   실패하면 종전 resize 로 폴백한다 — 배율이 안 먹는 것보다는 낫다.
                // ★회전만 걸려도(배율 1배) 이 경로를 탄다 — `rotate` 도 `resize` 와 똑같이 마스크를
                //   제자리에 두고 개체만 돌린다(2026-08-31 실측: 1:1 90도 회전에 배경 절반이 회색).
                //   그래서 **변형이 있으면 무조건** PDF 로 굳혀서 한다. 대가는 조각당 수 초.
                // ★이 경로는 이제 **폴백**이다 — 정상 경로는 위의 격자 마스터(조각 수와 무관)이고,
                //   여기 오는 것은 격자·나누기가 실패한 경우뿐이다(`hardenwhy` 로 사유를 돌려준다).
                if (!rotDone && (resizePct !== 100 || it2.rot)) {
                    // ★사본을 **먼저** 치운다. 임시 문서를 만드는 순간 이 참조가 무효가 되므로
                    //   나중에 지우려 하면 실패하고, 확대 안 된 사본이 판에 그대로 남아 겹친다.
                    try { copy.remove(); } catch (eRm) {}
                    copy = null; copies[b] = null;
                    var placed = mesCut_scaleAsPlaced(doc, artLayer, MESCUT_NEST_ITEMS[it2.idx], srcDoc, resizePct, b, it2.rot);
                    if (placed) { copy = placed; copies[b] = placed; nPlaced++; rotDone = true; }
                    else {
                        // 폴백 — 원본에서 다시 복제해 종전 방식으로 키운다.
                        // 배경이 깨질 수 있고, 그건 패널이 `placefail` 로 사용자에게 알린다.
                        app.activeDocument = srcDoc;
                        var re = null;
                        try { re = MESCUT_NEST_ITEMS[it2.idx].duplicate(artLayer, ElementPlacement.PLACEATBEGINNING); } catch (eD2) {}
                        app.activeDocument = doc;
                        nPlaceFail++;
                        if (!re) continue;
                        try { re.resize(resizePct, resizePct); } catch (eRS) {}
                        copy = re; copies[b] = re;
                    }
                }
                // ★배치 경로는 임베드 **앞**에서 이미 돌렸다(마스크 보존). 폴백·배율 1배만 여기서 돈다.
                if (it2.rot && !rotDone) { try { copy.rotate(-it2.rot); } catch (eR) {} }   // Konva CW → 일러 CCW
                // ★배치 기준도 **잉크 경계** — 패널이 계산한 아트 원점이 잉크 기준이라 여기서만 visibleBounds 를
                //    쓰면 클립이 잉크보다 큰 아트에서 그 차이만큼 조각이 밀린다.
                var bb2 = mesCut_inkBounds(copy) || copy.visibleBounds;
                copy.translate(it2.x * MESCUT_PT_PER_MM - bb2[0],
                    (sheetH - it2.y * MESCUT_PT_PER_MM) - bb2[1]);              // y-down(mm) → y-up(pt)
                items++;
            }

            // ★마스터를 치운다 — 아트보드 맞추기(`unionOf(topItems)`)가 이걸 세면 판이 커진다.
            //   여기서 치우는 이유 = 이 아래(칼선·도련·아트보드·돔보)는 전부 `copies` 만 보므로
            //   가장 이른 안전 지점이다.
            if (masters) { try { masters.layer.remove(); } catch (eML) {} masters = null; }

            // 조각별 칼선 — 재단은 시트가 아니라 **조각 단위**라 이게 없으면 떼어낼 수 없다.
            // ★칼선 방식과 도련은 **독립**이다 (2026-08-06 근본수정).
            //   전에는 도련 전체가 `if (useVec)` 안에 있었다. 그래서 벡터가 안 되는 아트
            //   (사진·중첩 클립 등)에서 래스터로 폴백하는 순간 **도련이 통째로 사라졌고**,
            //   패널의 도련 보고도 같은 게이트에 묶여 있어 화면에 아무 말도 안 나왔다.
            //   실사용에서 "도련이 안 생긴다"로 드러났다(2026-08-06 용준님, 중첩 클립 1개).
            //   도련 3단 계층은 배치된 **사본**에만 작용하므로 칼선을 무엇으로 뽑았든 그대로 된다.
            var hasGeom = (typeof vecOffsetMm === 'number' && !isNaN(vecOffsetMm));
            //   구 패널 하위호환 = "인자를 줬다"가 곧 벡터 모드였다. 신 패널은 래스터일 때도
            //   기하를 보내되 cutMode='raster' 를 함께 준다. 인자가 없으면 종전대로 판단한다.
            var useVec = hasGeom && (String(cutMode) !== 'raster');
            if (useVec) {
                var vcl = mesCut_ensureCutLayer(doc);
                for (var vi = 0; vi < copies.length; vi++) {
                    if (!copies[vi]) continue;
                    // 조각마다 따로 부른다 — 한꺼번에 합집합하면 **조각끼리 이어질 수 있다**(오프셋 ≥ 간격/2).
                    // ★마지막 인자 = 「조각 하나 = 칼선 하나」. 판짜기에서만 켠다(단품·도련은 낱개가 목적).
                    try {
                        var vres = mesCut_vecSilhouette(doc, [copies[vi]], vcl, vecOffsetMm, vecFillClosed);
                        // ★부스러기를 걷어낸 조각은 **번호로** 알린다 — 조용히 지우지 않는다.
                        if (vres && vres.dropped) {
                            // 같은 조각이 여러 장 배치되면 번호가 중복으로 찍힌다(#3·#3) → 한 번만
                            var vdn = sh.items[vi].idx + 1, vdSeen = false;
                            for (var vdi = 0; vdi < vecDrop.length; vdi++) { if (vecDrop[vdi] === vdn) { vdSeen = true; break; } }
                            if (!vdSeen) vecDrop.push(vdn);
                        }
                    } catch (eVS) {}
                }
                try { doc.selection = null; } catch (eSel) {}
            } else if (sh.segs && sh.segs.length) {
                // ★맞붙임 — 열린 선분을 그대로 긋는다. 맞닿은 변은 패널에서 이미 하나로 합쳐졌다.
                var scl = mesCut_ensureCutLayer(doc);
                for (var sgi = 0; sgi < sh.segs.length; sgi++) {
                    var sg = sh.segs[sgi];
                    try {
                        var sp = scl.pathItems.add();
                        sp.setEntirePath([
                            [sg[0] * MESCUT_PT_PER_MM, sheetH - sg[1] * MESCUT_PT_PER_MM],
                            [sg[2] * MESCUT_PT_PER_MM, sheetH - sg[3] * MESCUT_PT_PER_MM],
                        ]);
                        sp.closed = false;
                        sp.filled = false; sp.stroked = true;
                        sp.strokeColor = mesCut_magenta(); sp.strokeWidth = 0.6;
                    } catch (eSg) {}
                }
            } else if (sh.cuts.length) {
                var cl = mesCut_ensureCutLayer(doc);
                // ★구멍(`H`/`HB`)이 있으면 **compound path** 로 묶는다 — 단품 칼선(mesCut_drawCut)과
                //   같은 규칙이다. 재단 자체는 닫힌 경로만 있으면 되지만, 작업자가 화면에서
                //   "속이 뚫렸다"를 확인할 수 있어야 한다(ㅇ·ㅁ·0·8 은 안 뚫리면 그냥 틀린 칼선이다).
                var mkCutPath = function (container, spec) {
                    var pl2 = [];
                    for (var q2 = 0; q2 < spec.pts.length; q2++) {
                        pl2.push([spec.pts[q2][0] * MESCUT_PT_PER_MM, sheetH - spec.pts[q2][1] * MESCUT_PT_PER_MM]);
                    }
                    var pi2 = null;
                    if (spec.bez) { pi2 = mesCut_bezPath(container, pl2); }
                    else { pi2 = container.pathItems.add(); pi2.setEntirePath(pl2); pi2.closed = true; }
                    if (pi2) {
                        pi2.filled = false; pi2.stroked = true;
                        pi2.strokeColor = mesCut_magenta(); pi2.strokeWidth = 0.6;
                    }
                    return pi2;
                };
                for (var c = 0; c < sh.cuts.length; c++) {
                    var src2 = sh.cuts[c];
                    var hn = (src2.holes && src2.holes.length) ? src2.holes.length : 0;
                    try {
                        if (hn === 0) { mkCutPath(cl, src2); continue; }
                        var cpn = cl.compoundPathItems.add();
                        mkCutPath(cpn, src2);
                        for (var hq = 0; hq < hn; hq++) mkCutPath(cpn, src2.holes[hq]);
                    } catch (ePp) {
                        // compound 실패 시 개별 경로로라도 남긴다 — 재단은 닫힌 경로만 있으면 된다
                        try {
                            mkCutPath(cl, src2);
                            for (var hw = 0; hw < hn; hw++) mkCutPath(cl, src2.holes[hw]);
                        } catch (ePp2) {}
                    }
                }
            }

            // ── 도련 — 칼선 방식과 무관하게 조각마다 ──────────────────────────
            //   ⚠️ 간격 < 도련×2 면 인접 조각의 도련이 겹친다(패널이 경고한다). 겹쳐도 각자
            //      제 경계로 클리핑돼 있고 잘라내는 자리라 치명적이지 않지만, 위에 놓인 쪽 색이 이긴다.
            if (hasGeom) {
                for (var vi = 0; vi < copies.length; vi++) {
                    if (!copies[vi]) continue;
                    if (vecBleedMm > 0) {
                        // ★넓히는 양은 **여백 + 도련**이다. bleedMm 만 쓰면 인쇄 끝이 칼선과 겹쳐
                        //   도련이 0 이 된다(2026-08-02 실측에서 걸림). 여백이 음수(잉크 안쪽)면 그만큼 준다.
                        var grow = vecOffsetMm + vecBleedMm;
                        var bMode = '';
                        if (!hasBleedPng) {
                            // ★★구 패널 하위호환 — 도련 PNG 를 **아예 안 보냈다** = 구 패널이다.
                            //   축2(이 파일)는 Z: 교체 즉시 **전 PC** 에 먹지만 패널(축3·축4)은 PC 별 수동 설치다.
                            //   그래서 "새 호스트 + 구 패널" 조합이 배포 사이에 **반드시** 생긴다.
                            //   그 PC 를 새 계층에 태우면 ②가 없으니 곧장 ③단색으로 떨어진다 = 명백한 회귀다.
                            //   → 구 패널은 옛 경로를 **그대로** 태운다. 품질은 종전과 같고 나빠지지 않는다.
                            var lg = null;
                            try { lg = mesCut_vecBleed(doc, [copies[vi]], vecOffsetMm, vecBleedMm, vecFillClosed, vecBleedMode); }
                            catch (eLG) { lg = null; }
                            if (lg && lg.ok) bMode = 'legacy';
                            else if (!blCode) blCode = (lg && lg.code) || 'fail';
                        } else {
                            // ① 클립 확장 — **무손실**이라 언제나 최선이다. 원본에 클립 밖 데이터가 있으면
                            //    도련은 합성이 아니라 원래 있던 그림을 더 드러내는 것이 된다(PitStop 과 같은 전제).
                            if (grow > 0 && vecBleedMode === 'auto') {
                                var gr = 0;
                                try { gr = mesCut_vecGrowClips([copies[vi]], grow); } catch (eGC) {}
                                if (gr > 0) bMode = 'clip';
                            }
                            // ② Repeat Last Pixel — 패널이 미리 구운 도련 PNG. **정본 경로**다.
                            if (!bMode && grow > 0) {
                                try {
                                    if (mesCut_bleedPlaceItem(doc, artLayer, copies[vi], sh.items[vi].idx,
                                            bleedSz[sh.items[vi].idx], sh.items[vi].rot)) bMode = 'pixel';
                                } catch (eBP) {}
                            }
                            // ③ 최후 안전망 — 아트에서 색을 못 얻었다. 아트 색이 아닌 **지정색**이라
                            //    재단이 밀리면 그 색이 보인다 → 조용히 넘기지 않고 반드시 집계해 알린다.
                            if (!bMode && grow > 0) {
                                try {
                                    if (mesCut_vecBleedSolid(doc, [copies[vi]], artLayer, grow, vecFillClosed, mesCut_ringFill(null))) bMode = 'solid';
                                } catch (eBS) {}
                            }
                        }
                        if (bMode === 'clip') blClip++;
                        else if (bMode === 'pixel') blPix++;
                        else if (bMode === 'solid') blSolid++;
                        else if (bMode === 'legacy') blLegacy++;
                        else { blFail++; if (!blCode) blCode = (grow > 0 ? 'nopng' : 'zero'); }
                    }
                }
                try { doc.selection = null; } catch (eSel) {}
            }

            // ★아트보드를 **실제 배치 결과**에 맞춘다 (2026-07-31 용준님 지시).
            //   여태 설정한 시트 크기를 그대로 둬서, 조각이 몇 개든 테두리·돔보가 판 끝에 그려졌다.
            //   재단기는 이 테두리를 따라 도므로 빈 여백까지 돌게 되고 롤도 그만큼 낭비된다.
            //   기준 = **조각 + 조각별 칼선 전체를 감싼 사각**. 그 바깥 17mm 가 돔보 자리다.
            //   (조각만으로 잡으면 gap/2 만큼 바깥에 있는 조각 칼선이 테두리를 삐져나온다)
            //   배치 영역이 이미 margin 만큼 안쪽이라 확장해도 시트 규격을 넘지 않는다.
            var u = mesCut_unionOf(mesCut_topItems(doc));
            if (u) {
                var m = mesCut_domboMargin() * MESCUT_PT_PER_MM;
                doc.artboards[0].artboardRect = [u[0] - m, u[1] + m, u[2] + m, u[3] - m];
            }
            // ★판 크기는 **여기서** 읽는다 — 이 시트가 활성일 때다.
            //   ⚠️ 비활성 문서의 `artboards[0].artboardRect` 는 **활성 문서 값**을 돌려준다
            //      (2026-08-02 실측: 시트 312×273 인데 원본 크기 600×400 이 나왔다).
            //   ★판마다 크기가 **다르다** — 첫 판 규격으로 2판 이름을 지으면 파일명이 실물과 어긋난다.
            //     그래서 전부 모아 돌려준다(패널이 판별 이름을 만든다).
            try {
                var arS = doc.artboards[0].artboardRect;
                sheetWH.push(Math.round((arS[2] - arS[0]) / MESCUT_PT_PER_MM)
                    + 'x' + Math.round((arS[1] - arS[3]) / MESCUT_PT_PER_MM));
            } catch (eWH) { sheetWH.push('0x0'); }
            if (s === 0) {
                try {
                    var ar1 = doc.artboards[0].artboardRect;
                    MESCUT_LAST_SHEET_W = Math.round((ar1[2] - ar1[0]) / MESCUT_PT_PER_MM);
                    MESCUT_LAST_SHEET_H = Math.round((ar1[1] - ar1[3]) / MESCUT_PT_PER_MM);
                } catch (eAB0) {}
            }
            if (mesCut_addDombo(doc).indexOf('ok:') === 0) dombo++;
        }
        app.activeDocument = srcDoc;
        // ★실제 아트보드 크기를 돌려준다 — 파일명 규격(`103x206`)은 **판 전체 크기**이고
        //   실물은 EPS 바운딩박스와 정확히 일치한다(1030×2060mm). 우리 아트보드는 배치 bbox +
        //   돔보 여백으로 줄어들므로 시트 프리셋(예 1370)을 쓰면 이름과 파일이 어긋난다.
        mesCut_cleanPlaced(MESCUT_NEST_ITEMS.length);
        // ★fast = 격자 마스터로 처리한 배치 수 · masters = 만든 마스터 수(= 쓰인 회전 값 수)
        //   hardenwhy = 격자·나누기가 실패해 조각별 옛 경로로 떨어진 사유. 조용히 느려지지 않게 싣는다.
        return 'ok;sheets=' + made + ';items=' + items + ';dombo=' + dombo
            + ';placed=' + nPlaced + ';placefail=' + nPlaceFail
            + ';fast=' + nFast + ';masters=' + nMasters + (hardenWhy ? (';hardenwhy=' + hardenWhy) : '')
            + (vecDrop.length ? (';vecdrop=' + vecDrop.join(',')) : '')
            + ';sheetw=' + MESCUT_LAST_SHEET_W + ';sheeth=' + MESCUT_LAST_SHEET_H
            + ';bleedfail=' + blFail + ';bleedclip=' + blClip + ';bleedpx=' + blPix + ';bleedsolid=' + blSolid
            + ';bleedlegacy=' + blLegacy + (blFail ? (';bleedcode=' + blCode) : '')
            // 판별 크기 — 구분자는 `_` 다(`;` 는 이 반환 문자열의 구분자라 못 쓴다)
            + ';wh=' + sheetWH.join('_');
    } catch (e) {
        try { app.activeDocument = srcDoc; } catch (e2) {}
        return 'ERROR nestApply: ' + e;
    } finally {
        mesCut_silentEnd(silent);   // ★반드시 되돌린다 — 안 되돌리면 사용자 작업의 경고까지 사라진다
        // ★뒷정리는 **여기서** 한다 — 정상 반환 자리에 두면 중간에 예외가 났을 때
        //   임시 PDF 가 남고, 더 나쁘게는 **마스터 레이어가 판에 남아** 아트보드 맞추기에 끼어든다.
        try { if (masters && masters.layer) { masters.layer.remove(); masters = null; } } catch (eFM) {}
        try {
            if (hardenGrid) { var hf = new File(hardenGrid.pdf); if (hf.exists) { hf.remove(); } }
        } catch (eHF) {}
    }
}

// ── ★작업 폴더 산출 — EPS + DXF 같은 이름 쌍 (2026-08-02 · spec §2.7) ─────
//
// 실물 작업 폴더(`Z:\★UV솔벤★\<월>\<일>\<배송>\<순번>-(자재+후가공)<거래처>-<납기>\`)는
// 판마다 **EPS(인쇄) 와 DXF(재단) 를 확장자만 다른 같은 이름**으로 둔다. `.ai` 는 두지 않는다.
//   (포맥스5T+자동바니쉬)쓰레기불법투기(103x206-6장).eps / .dxf   ← 규격은 판 전체 크기·**cm**
//
// ⚠️ 폴더와 파일 이름이 한글이라 evalScript 인자로는 못 받는다 → **params 파일(UTF-8)** 로 이름을 받고,
//    폴더는 여기서 다이얼로그로 고른다. 반환은 ASCII 만 담는다(경로를 돌려주면 브릿지가 깨뜨린다).
// ⚠️ EPS 옵션은 A0(`mes-a0-host.jsx:623~628`)와 **같은 값**을 쓴다 — 실물 EPS 가 전부 그 형식이다
//    (DOS 바이너리 EPS + TIFF 미리보기 = 파일 첫 바이트 `C5 D0 D3 C6`).

var MESCUT_LASTDIR_PATH = null;
function mesCut_lastDirFile() {
    return Folder.temp.fsName.replace(/\\/g, '/') + '/mes_cut_lastdir.txt';
}
function mesCut_readLastDir() {
    try {
        var f = new File(mesCut_lastDirFile());
        if (!f.exists) return null;
        f.encoding = 'UTF-8'; f.open('r');
        var s = f.read(); f.close();
        var d = new Folder(String(s).replace(/^\s+|\s+$/g, ''));
        return d.exists ? d : null;
    } catch (e) { return null; }
}
function mesCut_writeLastDir(path) {
    try { mesCut_writeTextUtf8(mesCut_lastDirFile(), String(path)); } catch (e) {}
}

/**
 * 네스팅 시트를 작업 폴더에 **EPS + DXF 한 쌍**으로 저장한다.
 * params 파일에서 `NAME <basename>` 을 읽고, 폴더는 다이얼로그로 고른다.
 * 반환 'ok;eps=<0|1>;dxf=<0|1>;dxfitems=<n>' · 'cancel' · 'ERROR ..'
 */
function mesCut_exportPair() {
    if (app.documents.length === 0) return 'ERROR 문서 없음';
    var raw = mesCut_readParams();
    if (!raw) return 'ERROR params 없음';
    // ★`NAME` 은 **판 수만큼** 온다(판마다 크기가 달라 이름도 다르다). 순서 = 판 순서.
    var names = [];
    var lines = String(raw).split(/[\r\n]+/);
    for (var i = 0; i < lines.length; i++) {
        var sp = lines[i].indexOf(' ');
        if (sp > 0 && lines[i].substring(0, sp) === 'NAME') {
            var nm = lines[i].substring(sp + 1).replace(/^\s+|\s+$/g, '');
            if (nm) names.push(nm);
        }
    }
    if (!names.length) return 'ERROR 파일명 없음';

    // 대상 = 네스팅이 만든 시트 문서 **전부**(없으면 활성 문서 하나).
    //   ★여태 첫 판만 저장했다 — 판이 2개면 둘째 판이 조용히 빠져 실물이 모자란다(2026-08-05).
    var docs = [];
    if (MESCUT_NEST_DOCS && MESCUT_NEST_DOCS.length) {
        for (var dq = 0; dq < MESCUT_NEST_DOCS.length; dq++) {
            try { if (MESCUT_NEST_DOCS[dq].name) docs.push(MESCUT_NEST_DOCS[dq]); } catch (eD) {}
        }
    }
    if (!docs.length) docs.push(app.activeDocument);

    // ★ExtendScript 의 폴더 고르기는 **정적/인스턴스가 다른 이름**이다(2026-08-05 실사용에서 걸림).
    //     · `Folder.selectDialog(prompt)`  = 정적 — 시작 위치를 못 정한다
    //     · `folder.selectDlg(prompt)`     = 인스턴스 — **그 폴더에서 시작**한다
    //   `selectDlg` 를 Folder 에서 **정적으로** 부르면 "함수가 아닙니다" 로 죽는다. 도입(2026-08-02)
    //   이래 이 경로는 한 번도 성공한 적이 없다 — 타입 검사로는 안 잡히는 종류다.
    //   지난 폴더가 살아 있으면 거기서 시작하고, 없으면 정적 다이얼로그로 떨어진다.
    var dir = null;
    var PROMPT = '작업 폴더를 고르세요 — EPS + DXF 를 같은 이름으로 저장합니다';
    try {
        var lastDir = mesCut_readLastDir();
        var preset = lastDir ? new Folder(lastDir) : null;
        dir = (preset && preset.exists) ? preset.selectDlg(PROMPT) : Folder.selectDialog(PROMPT);
    }
    catch (eS) { return 'ERROR 폴더 선택 실패: ' + eS; }
    if (!dir) return 'cancel';
    mesCut_writeLastDir(dir.fsName);

    var prev = app.activeDocument;
    var okEps = 0, okDxf = 0, nDxf = 0;
    try {
        // ★판마다 저장한다. 이름은 판별로 오고(names), 모자라면 마지막 이름에 순번을 붙인다 —
        //   이름이 겹치면 뒤 판이 앞 판을 **덮어써** 조용히 한 판이 사라진다.
        var epsOpts = new EPSSaveOptions();
        epsOpts.cmykPostScript = true;
        epsOpts.compatibility = Compatibility.ILLUSTRATOR10;
        epsOpts.preview = EPSPreview.COLORTIFF;
        epsOpts.embedAllFonts = true;
        for (var dz = 0; dz < docs.length; dz++) {
            var doc = docs[dz];
            app.activeDocument = doc;
            var nmZ = (dz < names.length) ? names[dz] : (names[names.length - 1] + '-' + (dz + 1));
            var stem = dir.fsName.replace(/\\/g, '/') + '/' + nmZ;
            // ① DXF 먼저 — 칼선이 없으면 못 만든다
            var dr = mesCut_exportDxf(stem + '.dxf');
            if (dr.indexOf('ok;') === 0) { okDxf++; nDxf += parseInt(mesCut_kvGet(dr, 'items'), 10) || 0; }
            // ② EPS — A0 와 같은 옵션(실물 EPS 와 같은 형식)
            doc.saveAs(new File(stem + '.eps'), epsOpts);
            okEps++;
        }
    } catch (e) {
        try { app.activeDocument = prev; } catch (e2) {}
        return 'ERROR exportPair: ' + e + ';eps=' + okEps + ';dxf=' + okDxf;
    }
    try { app.activeDocument = prev; } catch (e3) {}
    // eps/dxf 는 이제 **저장한 판 수**다(과거엔 0|1). plates 로 기대치를 함께 준다.
    return 'ok;eps=' + okEps + ';dxf=' + okDxf + ';dxfitems=' + nDxf + ';plates=' + docs.length;
}

/** 'ok;a=1;b=2' 에서 값 하나 — 반환 문자열을 파싱할 곳이 늘어 공용으로 뺀다. */
function mesCut_kvGet(s, key) {
    var parts = String(s).split(';');
    for (var i = 0; i < parts.length; i++) {
        var eq = parts[i].indexOf('=');
        if (eq > 0 && parts[i].substring(0, eq) === key) return parts[i].substring(eq + 1);
    }
    return '';
}

// ── P3-N1/N2: 네스팅 결과 등록 (주문서 연동) ─────────────────────────
// ★새 API 를 만들지 않는다 — A0 가 쓰는 **파일 경유 ingest 경로**를 그대로 탄다:
//     Z:\DESIGNS\IA-등록\<건별폴더>\ 에 work.ai/EPS/thumb + manifest.json(마지막=커밋 신호)
//   → 에이전트가 주워 POST /intakes → designer_intakes(waiting) → 주문서 프리필 흡수 → order_item
//   JSX 는 HTTPS 를 못 부르므로 이 구조가 정본이다(Program.cs:1005~ PollDesignerIntakesAsync).
//   ⇒ 서버·에이전트·스키마 변경 0. `mode:'impose'` 는 이미 지원된다(workbench.ts:1197).

var MESCUT_REGISTER_ROOT = 'Z:/DESIGNS/IA-등록';
var MESCUT_NEST_DOCS = [];   // nestApply 가 만든 시트 문서(등록 대상)
var MESCUT_LAST_SHEET_W = 0, MESCUT_LAST_SHEET_H = 0;   // 첫 판의 실제 아트보드 크기(mm) — 파일명 규격

function mesCut_regPath() {
    return Folder.temp.fsName.replace(/\\/g, '/') + '/mes_cut_reg.txt';
}

function mesCut_readReg() {
    var f = new File(mesCut_regPath());
    if (!f.exists) return null;
    var s = '';
    try { f.encoding = 'UTF-8'; f.open('r'); s = f.read(); f.close(); }
    catch (e) { try { f.close(); } catch (e2) {} return null; }
    var o = { NAMES: [] };
    var lines = String(s).split(/[\r\n]+/);
    for (var i = 0; i < lines.length; i++) {
        var ln = lines[i];
        var sp = ln.indexOf(' ');
        if (sp <= 0) continue;
        var k = ln.substring(0, sp), v = ln.substring(sp + 1);
        // ★NAME 은 **판 수만큼** 온다 — 단일 맵에 넣으면 마지막 판 이름만 남는다(내보내기와 같은 규약).
        if (k === 'NAME') { if (v) o.NAMES.push(v); continue; }
        o[k] = v;
    }
    return o;
}

function mesCut_pad2(n) { return (n < 10 ? '0' : '') + n; }
function mesCut_sanitize(s) {
    return String(s == null ? '' : s).replace(/[\\\/:*?"<>|]/g, '_').replace(/^\s+|\s+$/g, '');
}
function mesCut_jsonEsc(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ');
}
function mesCut_writeTextUtf8(path, s) {
    var f = new File(path);
    try { f.encoding = 'UTF-8'; f.open('w'); f.write(s); f.close(); return true; }
    catch (e) { try { f.close(); } catch (e2) {} return false; }
}

/**
 * 네스팅 시트를 등록 폴더에 저장하고 manifest 를 쓴다. **시트 1장 = intake 1건**.
 * 등록 정보는 mesCut_regPath() 파일(UTF-8, `KEY value` 줄)에서 읽는다 — 한글 때문에 evalScript 인자를 못 쓴다.
 *   CLIENT / CLIENTID / QTY / WORKER / WORKERID / KEYWORD / ITEMID / ENTITY
 * 반환 'ok;folders=<n>' 또는 'ERROR ...'
 */
function mesCut_nestRegister() {
    if (!MESCUT_NEST_DOCS || !MESCUT_NEST_DOCS.length) return 'ERROR 등록할 시트가 없습니다 (네스팅 먼저)';
    var R = mesCut_readReg();
    if (!R) return 'ERROR 등록정보 없음: ' + mesCut_regPath();
    var clientName = R.CLIENT || '';
    if (!clientName) return 'ERROR 거래처가 비어 있습니다';

    var root = new Folder(MESCUT_REGISTER_ROOT);
    if (!root.exists) return 'ERROR 등록 폴더 없음(Z: 연결 확인): ' + MESCUT_REGISTER_ROOT;

    var pcName = '';
    try { pcName = $.getenv('COMPUTERNAME') || ''; } catch (eP) {}
    var userName = '';
    try { userName = $.getenv('USERNAME') || ''; } catch (eU) {}

    var srcDoc = app.activeDocument;
    var made = 0, folders = [];
    for (var s = 0; s < MESCUT_NEST_DOCS.length; s++) {
        var doc = MESCUT_NEST_DOCS[s];
        var r = mesCut_saveOneSheet(doc, s, R, clientName, pcName, userName);
        if (r.indexOf('ERROR') === 0) { try { app.activeDocument = srcDoc; } catch (e0) {} return r; }
        folders.push(r);
        made++;
    }
    try { app.activeDocument = srcDoc; } catch (e1) {}
    return 'ok;folders=' + made;
}

function mesCut_saveOneSheet(doc, idx, R, clientName, pcName, userName) {
    var now = new Date();
    var ymd = now.getFullYear() + mesCut_pad2(now.getMonth() + 1) + mesCut_pad2(now.getDate());
    var hms = mesCut_pad2(now.getHours()) + mesCut_pad2(now.getMinutes()) + mesCut_pad2(now.getSeconds());
    var folderName = ymd + '_' + hms + '_' + mesCut_sanitize(pcName) + '_cut' + (now.getTime() % 1000) + (idx ? ('_' + (idx + 1)) : '');
    var jobFolder = new Folder(MESCUT_REGISTER_ROOT + '/' + folderName);
    if (!jobFolder.exists && !jobFolder.create()) return 'ERROR 폴더 생성 실패: ' + folderName;

    try { app.activeDocument = doc; } catch (eA) { return 'ERROR 시트 문서 활성화 실패' }

    var ab = doc.artboards[0].artboardRect;
    // ★★저장 배율을 되돌려 **실물** 규격으로 적는다 (2026-09-03 정정).
    //   판 문서는 `mesCut_sc` 로 **실물/N** 에 저장된다(N = MESCUT_SCALE_N, nestApply 의 `N` 줄).
    //   여태 아트보드를 그대로 cm 로 적고 scale_pct 를 100 으로 하드코딩해서, 1/2 로 짠 판은
    //   대기물 가로·세로가 **절반**으로 올라가고 배율칸은 1 이 됐다 → 주문 라인 규격 1/S ·
    //   청구면적 1/S². 주문서는 `width_cm` 을 **실물**로 보고 `100/scale_pct` 를 배율칸에 넣는다
    //   (orderForm/intake.js:620·:801·:845). A0 와 같은 규약으로 맞춘다(mes-a0-host.jsx:982~983).
    var sN = (MESCUT_SCALE_N > 0) ? MESCUT_SCALE_N : 1;
    var wCm = Math.round(((ab[2] - ab[0]) / MESCUT_PT_PER_MM) * sN) / 10;
    var hCm = Math.round(((ab[1] - ab[3]) / MESCUT_PT_PER_MM) * sN) / 10;
    var qty = parseInt(R.QTY, 10);
    if (isNaN(qty) || qty < 1) qty = 1;

    var workBytes = 0;
    try {
        // ★pdfCompatible=false — 기본값은 같은 그림을 AI 편집부 + PDF 복사본 2벌로 쓴다(용량 2배).
        //   소비자는 전부 일러 app.open 이라 PDF 스트림이 불필요하다([[design-ai-save-pdfcompatible]]).
        var workFile = new File(jobFolder.fsName + '/work.ai');
        var wo = new IllustratorSaveOptions();
        wo.pdfCompatible = false;
        doc.saveAs(workFile, wo);
        try { workBytes = new File(workFile.fsName).length; } catch (eB) {}
    } catch (eW) { return 'ERROR work.ai 저장 실패: ' + eW }

    // ★★EPS 이름 = **작업 폴더에 나갈 이름 그대로** (2026-08-27).
    //   여태 `거래처-WxH-NEA-nest.eps` 였는데, 실제 작업 파일은 `(자재+후가공)품목(WxH-N장)` 이라
    //   **두 갈래**였다. RIP 가 보는 이름을 시스템이 몰라 출력완료 매칭이 0% 였다
    //   (실측: 8월 print_events 5,554건 중 카드 매칭 0). 패널이 그 이름을 이미 만들고 있었다.
    //   ⚠️ 이 이름을 파싱하는 코드는 없다(2026-08-27 전수 확인) — 바꿔도 깨지는 소비자가 없다.
    //   ⚠️ 패널이 안 보내면(구 셸) 옛 규약으로 떨어진다 — 하위호환.
    var ripName = (R.NAMES && R.NAMES.length) ? R.NAMES[Math.min(idx, R.NAMES.length - 1)] : '';
    var epsName = ripName
        ? (mesCut_sanitize(ripName) + '.eps')
        : (mesCut_sanitize(clientName) + '-' + wCm + 'x' + hCm + '-' + qty + 'EA-nest.eps');
    try {
        var eo = new EPSSaveOptions();
        eo.cmykPostScript = true;
        eo.compatibility = Compatibility.ILLUSTRATOR10;
        eo.preview = EPSPreview.COLORTIFF;
        eo.embedAllFonts = true;
        doc.saveAs(new File(jobFolder.fsName + '/' + epsName), eo);
    } catch (eE) { return 'ERROR EPS 저장 실패: ' + eE }

    // ★DXF — 재단 패널의 **본 산출물**이다. EPS 와 같은 이름으로 나란히 둔다(A0 규약과 동일).
    //   여태 %TEMP% 에만 떨어져 등록 폴더에 안 실렸다(spec §9-7 미해결 항목) → 여기서 해소.
    //   문서를 통째로 내보내지 않는다 — mesCut_exportDxf 가 임시문서로 **재단선 레이어만** 굽는다
    //   (일러 DXF export 는 숨긴 레이어도 내보내므로 숨기기로는 안 된다. 2026-07-31 실측).
    var dxfName = null;
    try {
        app.activeDocument = doc;                       // EPS saveAs 뒤 활성 문서를 확정하고 굽는다
        var dxfCand = epsName.replace(/\.eps$/i, '.dxf');
        var dr = mesCut_exportDxf(jobFolder.fsName + '/' + dxfCand);
        if (String(dr).indexOf('ok;') === 0) dxfName = dxfCand;   // 성공했을 때만 = manifest 가 없는 파일을 가리키지 않게
    } catch (eDx) { /* DXF 실패가 등록을 막지는 않는다 — EPS·work.ai 는 이미 저장됐다 */ }

    // thumb — 장변 400px
    try {
        var abN = doc.artboards[0].artboardRect;
        var maxPt = Math.max(abN[2] - abN[0], abN[1] - abN[3]);
        var pct = maxPt > 0 ? Math.min(100, (400 / maxPt) * 100) : 100;
        var po = new ExportOptionsPNG24();
        po.artBoardClipping = true;
        po.horizontalScale = pct;
        po.verticalScale = pct;
        doc.exportFile(new File(jobFolder.fsName + '/thumb.png'), ExportType.PNG24, po);
    } catch (eT) { /* 썸네일 실패는 등록을 막지 않는다 */ }

    // ★manifest 는 **마지막**에 쓴다 — 에이전트가 이 파일을 커밋 신호로 본다(Program.cs:1005~).
    var mf = '{'
        + '"manifest_version":1'
        + ',"script_version":"' + mesCut_jsonEsc(MESCUT_VERSION) + '"'
        + ',"registered_by":"' + mesCut_jsonEsc(pcName + '\\' + userName) + '"'
        + ',"worker_name":' + (R.WORKER ? ('"' + mesCut_jsonEsc(R.WORKER) + '"') : 'null')
        + ',"worker_id":' + (R.WORKERID ? R.WORKERID : 'null')
        + ',"source":"cut-panel"'
        + ',"pc_name":"' + mesCut_jsonEsc(pcName) + '"'
        + ',"entity_id":' + (R.ENTITY ? R.ENTITY : 1)
        + ',"client_name":"' + mesCut_jsonEsc(clientName) + '"'
        + ',"client_id":' + (R.CLIENTID ? R.CLIENTID : 'null')
        + ',"qty":' + qty
        // ★★여태 셋 다 **하드코딩 null/false** 였다 (2026-08-27 정정).
        //   특히 `trim:false` 는 **사실과 다르다** — 판에는 돔보가 **항상** 들어간다
        //   (index.html "돔보·시트 재단선은 항상 포함", 결과창도 "돔보 N판"). 주문서가 이 값을
        //   프리필로 쓰면 틀린 값이 들어간다. 서버는 이미 trim·punch_json·finishing_json 을 받고 있었다
        //   (workbench.ts POST /intakes) — 보내는 쪽만 없었다.
        //   후가공은 자유 텍스트라 per-side JSON 이 아니다 → post_desc 로 보낸다(A0 의 변별 마감과 구분).
        + ',"finishing":null'
        + ',"trim":' + ((R.TRIM === '1' || R.TRIM === 'true') ? 'true' : 'false')
        + ',"punch":null'
        + ',"keyword":' + (R.KEYWORD ? ('"' + mesCut_jsonEsc(R.KEYWORD) + '"') : 'null')
        + ',"post_desc":' + ((R.MATERIAL || R.FINISH)
            ? ('"' + mesCut_jsonEsc([R.MATERIAL || '', R.FINISH || ''].join(R.MATERIAL && R.FINISH ? '+' : '')) + '"')
            : 'null')
        + ',"annotation":null,"annot_pos":null,"identifier":null'
        + ',"scale_pct":' + Math.round(100 / sN)
        + ',"measured_cm":{"w":' + wCm + ',"h":' + hCm + '}'
        // ★mode='single' 이다. 'impose' 가 아니다.
        //   `impose` 는 **ia-editor 전용 용도**다 — "대지로 가져와 다시 배치할 조각"을 뜻하고,
        //   주문서 트레이는 그것을 일부러 거른다(orderForm/intake.js:81 `mode:'single,both'`,
        //   "모아찍기용은 ia-editor 담당이라 여기 뜨면 주문 라인으로 불러올 수 없는 노이즈").
        //   재단 패널이 만드는 네스팅 시트는 **이미 배치가 끝난 완성 1건**이라 재배치 대상이 아니고,
        //   곧바로 주문 라인이 되어야 한다 → single. (2026-07-31: impose 로 보냈다가 주문서에
        //   안 뜨고 ia-editor 로만 가는 것을 확인하고 정정)
        + ',"mode":"single"'
        + ',"item_id":' + (R.ITEMID ? R.ITEMID : 'null')
        + ',"order_item_id":null'
        + ',"files":{"work_ai":"work.ai","eps":"' + mesCut_jsonEsc(epsName) + '"'
        + ',"dxf":' + (dxfName ? ('"' + mesCut_jsonEsc(dxfName) + '"') : 'null')
        + ',"thumb":"thumb.png","work_bytes":' + workBytes + '}'
        + ',"batch_folder":null,"batch_index":' + (MESCUT_NEST_DOCS.length > 1 ? (idx + 1) : 'null')
        + ',"outline_failed":false'
        + ',"registered_at":"' + now.getFullYear() + '-' + mesCut_pad2(now.getMonth() + 1) + '-' + mesCut_pad2(now.getDate())
        + ' ' + mesCut_pad2(now.getHours()) + ':' + mesCut_pad2(now.getMinutes()) + ':' + mesCut_pad2(now.getSeconds()) + '"'
        + '}';
    if (!mesCut_writeTextUtf8(jobFolder.fsName + '/manifest.json', mf)) return 'ERROR manifest 쓰기 실패';
    return folderName;
}

/** 문서 요약 — 패널 상단 상태 표시용. */
function mesCut_docInfo() {
    if (app.documents.length === 0) return 'nodoc';
    var doc = app.activeDocument;
    var ab = doc.artboards[0].artboardRect;
    var f = function (pt) { return Math.round((pt / MESCUT_PT_PER_MM) * 10) / 10; };
    return 'name=' + doc.name + ';w=' + f(ab[2] - ab[0]) + ';h=' + f(ab[1] - ab[3]) + ';layers=' + doc.layers.length;
}
