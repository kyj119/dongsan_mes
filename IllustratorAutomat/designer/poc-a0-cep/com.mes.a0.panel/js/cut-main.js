/**
 * MES 재단 — 병합 패널의 「재단」 탭 (구 com.mes.cut.panel/js/main.js)
 * spec = docs/superpowers/specs/2026-07-31-cut-file-panel.md
 *
 * ★2026-08-04 병합: 패널 2개(A0·재단)를 `com.mes.a0.panel` **하나**로 합쳤다.
 *   합친 이유 = 설치 2번이 아니라 **패널을 오가는 비용**이었다(용준님). 한 작업에서 가공↔재단을
 *   왔다갔다 하는데 창이 둘이면 매번 찾아 열어야 한다.
 *   합친 범위 = **껍데기만**. 호스트는 `mes-a0-host.jsx` · `mes-cut-host.jsx` **2파일 그대로**다
 *   (축2 = 자주 바뀌는 축 → Z: 파일 1개 교체로 독립 롤백이 유지된다).
 *
 *   이 파일이 지켜야 할 병합 제약 3가지:
 *     1. **IIFE 유지** — main.js 와 같은 전역을 공유한다. 벗기면 이름이 조용히 겹친다.
 *     2. **DOM id 는 재단 전용**이어야 한다. A0 와 겹친 `out`·`ver` 는 `cutOut`·`cutVer` 로 개명했다.
 *        새 id 를 만들 때 A0 index.html 에 같은 이름이 없는지 확인할 것.
 *     3. **호스트 호출은 mesCut_* 만** — mesA0_* 를 부르지 않는다(잠금은 양쪽 다 mesLock_* 로 수렴).
 *
 * P0(현재) = 골격 + **크로스 패널 잠금**. 문서·선택 조회와 잠금 API 만 실제로 동작한다.
 * P1        = 오프셋 엔진(bbox/실루엣) + 타공 + DXF. [칼선 만들기] 는 그때 켠다.
 *
 * A0 에서 얻은 관례를 처음부터 지킨다:
 *   · evalScript 인자/반환은 **ASCII 만** (브릿지 한글 깨짐 회피). 한글은 params 파일(UTF-8)로.
 *   · 잠금은 버튼별 disable 이 아니라 setBusy() **한 곳**에서 — 새 버튼은 BUSY_IDS 에 넣기만 한다.
 *     (A0 는 이걸 안 지켜서 "새 진입점이 계속 새어 나갔다")
 *   · getElementById 대상이 없으면 조용히 실패하지 말고 console.warn — HTML↔JS silent fail 방지.
 */
(function () {
  'use strict';

  // 껍데기(index.html · main.js · style.css) 버전. 축3/축4 배포 여부를 눈으로 확인하는 유일한 수단이다.
  //   ⚠️ 껍데기 3파일 중 하나라도 고치면 여기를 올린다. 호스트 버전(mesCut_ping)과 **별개**다.
  // ⚠️ 내용을 고치면 **반드시 이 번호를 올린다** — 수동 배포축이라 이 문자열이 "이 PC 가 어느 셸인가"의
  //    유일한 단서다. 0.57.0 하나가 세 상태를 가리키던 사고가 있었고(등록 파라미터·굽기 통합·[◎ 전체]),
  //    그래서 `ia:deploy` 가 번호가 그대로면 배포를 막는다.
  var SHELL_VERSION = '0.71.0';   // 0.71.0 = ★호스트 게이트 인자 형태 정정([◎ 전체]·도련 통합 굽기가 상시 잠겨 있었다) · 호스트 큐 제거 성공 판정 · 「조」 표기 가시성 게이트 · 분리 중복 호출에도 응답 · 0.70.0 = ★품목·거래처 id 해소가 공백을 무시한다(IME 확정 스페이스가 이름 안에 남는다) · 모호하면 안 고른다 · 0.69.0 = ★자재·후가공 목록을 소스 하드코딩에서 config 로(이제 MES 에서 고치면 배포 없이 따라온다) · 재단 후가공=코팅 계열만 · 「돔보」 중복 제거 · 0.68.0 = ★품목=제품(PRODUCT)만 + 품목→자재 후보 좁히기(매핑 없으면 자유 입력 유지) · 0.67.0 = ★굽기 격자 칸(#nestBakeMm — 큰 실물에서 메모리·시간 급증 완화) + 조합 중 datalist 분리 제거(복원이 비대칭이라 자동완성이 죽은 채 남았다) · 0.66.0 = ★품목 칸(regProduct→ITEMID) — 주문서가 품목·단가까지 자동으로 채운다([내용]=regItem 과 다른 칸) · 0.65.0 = 0.64.0 의 근거 정정(실측상 composition 이벤트가 안 와서 그 처리는 발동하지 않는다 — 대비책으로만 유지) · 0.64.0 = 목록 달린 칸에 IME 조합 중 datalist 분리 · 0.63.0 = 호스트 구버전 감지(Z: 배포본과 대조 → 시작·포커스 시 경고 · 판짜기 차단) · 0.62.0 = 폴백 문구에 회전 포함(배율 1배 회전도 PDF 경로) · 0.61.0 = 배율 확대 결과 보고(PDF 배치 / 예비 경로 폴백 경고) · 0.60.0 = 파일명 맨 앞 거래처 · 자재/후가공 행 분리(폭 맞춤) · 「품목」→「내용」 명칭 분리(MES 품목 마스터와 구분) · 0.59.0 = 재단 탭 [◎ 전체] · 0.58.0 = 굽기 통합(마스크+도련 1왕복)·등록 파라미터(자재·후가공·돔보·파일명) · 0.57.0 = 조각 속 메우기(그룹 하나=칼선 하나·맞붙임 복구) · 0.56.0 = 도련 겹침 분할(간격 존중·하한 1.5mm)

  // ── 도련 겹침 분할 (2026-08-25) ─────────────────────────────────────────
  // ★순수 함수로 뽑아 둔 이유 = **하네스가 이 함수를 직접 돌리기 때문**이다(`npm run cut:bleed` §9).
  //   분기가 넷(맞붙임·갇힘 여부·하한 미달·요청보다 큰 하한 금지)이라 소스 패턴 검사로는 못 지킨다.
  var BLEED_MIN_MM = 1.5;   // 업계 최소치(1/16″ = 1.6mm) 근처 · 재단 오차 ±0.5mm 를 흡수
  /**
   * 도련은 칼선 **바깥**으로 나간다 → 간격이 도련×2 보다 좁으면 옆 조각 도련과 겹치고,
   * 재단이 밀리면 **옆 디자인 색이 조각 가장자리에 남는다**.
   *
   * **예전에는 간격을 도련×2 로 올렸다**(사용자 입력을 덮었다). 대가가 실측으로 컸다 —
   * 이형 24조각·롤 1330 에서 간격/2 를 3px→6px 로 벌리면 효율 65% → 56~58%, **재료 12~13%** 손실.
   * (직사각만으로 재면 0.9~2.3% 라 작아 보인다. 간격은 조각 **둘레 전체**에 붙으므로 이형에서 비싸다.)
   *
   * ⇒ 2026-08-25 용준님 결정: **간격은 사용자 입력을 존중하고, 겹치는 도련을 경계에서 나눈다.**
   * 두 조각의 도련은 서로를 향해 자라므로 각자 `간격/2` 를 가지면 겹치지 않으면서 최대다.
   * 잘려 나갈 영역을 위해 재료를 더 쓸 이유가 없다. 업계 정본(tilia Phoenix)도 같은 방향이다
   * (`spacing-type: Bleed` + `split bleed overlaps`).
   *
   * ⚠️ 하한은 `min(1.5, 요청도련)` 이다. 사용자가 도련 1mm 를 원했는데 1.5mm 를 확보하겠다고
   *    간격을 벌리면, **원하지도 않은 품질을 위해 재료를 뺏는** 셈이 된다.
   *
   * @returns {gapMm, bleedMm, floorMm} — gapMm 은 하한 미달일 때만 커진다
   */
  function mesCutSplitBleed(gapMm, bleedMm, buttMode) {
    var floorMm = Math.min(BLEED_MIN_MM, bleedMm > 0 ? bleedMm : BLEED_MIN_MM);
    if (buttMode || !(bleedMm > 0)) return { gapMm: gapMm, bleedMm: bleedMm, floorMm: floorMm };
    var halfGap = gapMm / 2;
    if (halfGap >= bleedMm) return { gapMm: gapMm, bleedMm: bleedMm, floorMm: floorMm };  // 안 갇힌다
    if (halfGap < floorMm) {                       // 나눠도 하한 미달 → 이때만 간격을 올린다
      gapMm = Math.max(gapMm, floorMm * 2);
      halfGap = gapMm / 2;
    }
    return { gapMm: gapMm, bleedMm: Math.min(bleedMm, halfGap), floorMm: floorMm };
  }
  var PANEL_OWNER = 'cut';   // 크로스 패널 잠금의 소유자 식별자 (A0 는 'a0')

  // 이보다 작은 구멍은 재단선으로 만들지 않는다 — 칼날/비트가 들어갈 수 없는 크기이고,
  // 글자 사이 좁은 틈이 오프셋으로 막히며 생기는 노이즈가 대부분이다.
  // ⚠️ 2mm 는 잠정값이다(spec §9 미해결) — 플로터 칼날·CNC 비트 지름으로 확정할 것.
  var MIN_HOLE_MM = 2;

  // 돔보(레지스터 마크) 여백 — 호스트 `mesCut_domboMargin()` 과 **같은 값이어야 한다**.
  // 어긋나면 조각이 돔보를 덮거나 시트를 넘는다.
  //
  // ★코너 17mm + **반지름 3mm** = 20. 지름(6)을 더하면 아무것도 없는 3mm 를 매 변마다 버린다 —
  //   돔보 중심은 코너에서 17mm 이고 원은 반지름만큼만 더 뻗기 때문이다.
  //   실물 30쌍도 원 바깥끝이 판 가장자리에 정확히 접한다(2026-08-02 실측). 변당 3mm 절감·위험 0.
  var DOMBO_MARGIN_MM = 20;

  // ── ★배율 (2026-08-05) — 가공(A0) 탭과 **같은 규칙** ──────────────
  // 파일이 실물의 1/N 축소본일 때 쓴다. **아트를 확대하지 않는다.**
  // 파일 좌표에서 작업하되 실물 mm(여백·간격·도련·돔보·최소구멍·재료 폭)를 **÷N** 해서 그리면
  // 실물에서 정확한 치수가 나온다 — A0 호스트가 `DOMBO_DIAM = 6 * PT / sN` 로 하는 것과 같다.
  // 반대로 사람에게 보이는 크기(판 규격·파일명)는 **×N** 으로 되돌린다.
  //   ⚠️ 환산은 **입력을 받는 자리에서 한 번만** 한다. 중간 계산에서 또 나누면 두 번 줄어들고,
  //      그런 실수는 판을 뽑기 전까지 드러나지 않는다.
  // ★축척은 **두 개**다(2026-08-05 용준님).
  //   F = 파일 배율 : 지금 열려 있는 아트가 실물의 1/F
  //   S = 저장 배율 : 결과를 실물의 1/S 로 저장 (파일명은 언제나 **실물** 규격)
  //   배치·칼선·도련·돔보는 전부 **S 좌표계**에서 그린다(실물 ÷S). 조각만 F→S 로 리사이즈한다.
  //   F=S 면 리사이즈가 1배라 종전과 완전히 같다.
  //   ⚠️ 하나로 합치면 안 된다: 1:1 원본(F=1)에 배율 1/2 를 주면 종전 코드는 여백 3mm 를
  //      1.5mm 로 그렸다 — "파일이 이미 축소본"이라는 전제가 깨지기 때문이다.
  function selN(id) {
    var el = document.getElementById(id);
    var n = el ? parseInt(el.value, 10) : 1;
    return (n > 0 && !isNaN(n)) ? n : 1;
  }
  function cutScaleFile() { return selN('cutScaleFile'); }   // F
  function cutScaleN() { return selN('cutScale'); }          // S — 좌표계의 기준
  /** 파일 좌표 → 저장 좌표 배율(조각 리사이즈량). F=S 면 1. */
  function fileToSave() { return cutScaleN() / cutScaleFile(); }
  /** 실물 mm → 파일 좌표 mm */
  function toFileMm(mm) { return mm / cutScaleN(); }
  /** 파일 좌표 mm → 실물 mm (표시·파일명) */
  function toRealMm(mm) { return mm * cutScaleN(); }
  /** 돔보 여백(파일 좌표) — 호스트 `mesCut_domboMargin()` 과 **같은 값이어야 한다** */
  function domboMm() { return toFileMm(DOMBO_MARGIN_MM); }

  var cs = new CSInterface();
  var hostBusy = false;

  // ── ★호스트 버전 게이트 (배포 스큐 방어) ─────────────────────────
  // 축2(Z: 호스트)와 축3·축4(껍데기)는 **배포 시점이 다르다**. 특히 이 PC 만 껍데기를 올리거나
  // 일러를 재시작하면 **새 패널 + 구 호스트** 조합이 실제로 생긴다.
  //   그때 곡선 칼선의 `B` 줄을 구 호스트가 받으면 아는 접두사가 아니라 **조용히 무시** → 칼선이 통째로
  //   사라진다. 조용히 사라지는 실패가 가장 나쁘므로, 호스트가 못 받으면 **직선으로 낮추고 알린다**.
  var CURVE_MIN_HOST = [0, 5, 0];
  var VEC_MIN_HOST = [0, 7, 0];      // 벡터 칼선(mesCut_vecCut / nestApply(offset))
  var BAKEALL_MIN_HOST = [0, 8, 0]; // 일괄 굽기(mesCut_nestBakeAll)
  // 도련 PNG(Repeat Last Pixel) — 호스트에 `mesCut_bleedPlaceItem` + params `L` 줄 + 굽기 tag 인자가 있어야 한다.
  //   구 호스트는 `L` 줄을 **조용히 무시**하고 도련은 옛 도형별 오프셋으로 떨어진다(링이 지저분해진다).
  //   조용히 달라지는 것이 가장 나쁘므로 게이트를 두고, 못 받으면 만들지 않고 **알린다**.
  var BLEEDPNG_MIN_HOST = [0, 11, 0];
  var hostVersion = null;

  function setHostVersion(s) { hostVersion = String(s || ''); }

  // ── ★호스트 구버전 감지 (2026-08-31) ─────────────────────────────
  // 스텁은 **패널이 열릴 때 한 번만** Z: 호스트를 evalFile 한다. 그래서 호스트를 배포해도
  // 패널을 다시 열기 전까지는 옛 코드가 돈다 — 그동안 판은 조용히 옛 규칙으로 만들어진다.
  // 실제로 2026-08-31 에 이걸로 반나절을 썼다: 배포는 됐는데 판이 안 고쳐져서, 고친 코드를
  // 계속 의심했다. 배포본과 로드본이 다르면 **사람이 알 수 있어야 한다.**
  //
  // 새 호스트 함수를 만들지 않는 이유 = 그 함수는 **새 호스트에만** 있다. 구버전을 감지해야
  // 하는데 구버전에는 감지 함수가 없다(닭과 달걀). 그래서 스텁이 심어 둔 `MESCUT_CORE_PATH`
  // 만 쓰고 파일을 직접 읽는다 — 스텁은 갱신 불요 파일이라 어느 PC 에나 있다.
  // ⚠️ 식은 **ASCII 만** — Z: 경로에 한글이 들어 있어 문자열로 넘기면 인코딩에 걸린다.
  //    작은따옴표도 `[\x27]` 로 피한다(evalScript 문자열 안에서 중첩 인용은 깨지기 쉽다).
  var Z_VER_JS = '(function(){try{'
    + 'var p=(typeof MESCUT_CORE_PATH=="string")?MESCUT_CORE_PATH:"";'
    + 'if(!p) return "nopath";'
    + 'var f=new File(p); if(!f.exists) return "nofile";'
    + 'f.encoding="UTF-8"; f.open("r"); var s=f.read(8000); f.close();'
    // ★정규식을 쓰지 않는다 — 이 식은 문자열로 실려 가므로 역슬래시가 도중에 사라지면
    //   조용히 안 맞는 정규식이 된다(2026-08-31 실제로 겪음). indexOf 는 그 위험이 없다.
    + 'var k=s.indexOf("MESCUT_VERSION"); if(k<0) return "noversion";'
    + 'var q=String.fromCharCode(39);'
    + 'var a=s.indexOf(q,k); var b=(a<0)?-1:s.indexOf(q,a+1);'
    + 'return (a>0 && b>a) ? s.substring(a+1,b) : "noversion";'
    + '}catch(e){ return "err"; }})()';

  /** Z: 배포본이 지금 로드된 호스트보다 새 버전이면 그 값, 아니면 ''. 판정 못 하면 ''. */
  var hostStaleZ = '';

  /** Z: 배포본 버전을 읽어 로드본과 대조한다. ★확실히 다를 때만 경고한다 —
   *  Z: 가 끊겼거나 못 읽었으면 조용히 넘긴다(오탐이 잦으면 사람이 무시하게 된다). */
  function checkHostFresh(cb) {
    host(Z_VER_JS, function (zv) {
      var z = String(zv || '');
      var known = /^CUT-CEP-\d+\.\d+\.\d+$/.test(z);
      hostStaleZ = (known && hostVersion && z !== hostVersion) ? z : '';
      if (elVer) {
        elVer.textContent = 'shell ' + SHELL_VERSION + ' · host ' + (hostVersion || '?')
          + (hostStaleZ ? ('  ⚠ Z: ' + hostStaleZ) : '');
      }
      if (cb) cb(hostStaleZ);
    });
  }

  /** 구버전이면 사용자에게 보여줄 문구. 아니면 ''. */
  function staleNote() {
    if (!hostStaleZ) return '';
    return '⚠ 호스트가 갱신됐습니다 — 지금 패널은 ' + (hostVersion || '?')
      + ' 를 들고 있고 Z: 에는 ' + hostStaleZ + ' 가 있습니다.\n'
      + '패널을 닫았다 다시 여세요(또는 일러 재시작). 그 전에는 옛 규칙으로 판이 만들어집니다.';
  }

  // ★인자는 `[major, minor, patch]` 배열이다. 문자열('CUT-CEP-0.24.0')을 넘기면 `min[i]` 가
  //   글자라 비교가 **항상 false** 가 되고 그 기능이 영구히 잠긴다 — 실제로 두 자리에서 그랬다
  //   (SELALL·BAKE1, 2026-09-03 발견). 조용히 잠기는 것이 가장 나쁘므로 **형태를 받아 준다**.
  function normMinHost(min) {
    if (min && typeof min.length === 'number' && typeof min !== 'string') return min;
    var m = /(\d+)\.(\d+)\.(\d+)/.exec(String(min || ''));
    return m ? [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)] : null;
  }
  function hostAtLeast(minRaw) {
    var min = normMinHost(minRaw);
    if (!min) return false;  // 기준을 못 읽으면 못 받는 것으로 본다(안전한 쪽)
    var m = /CUT-CEP-(\d+)\.(\d+)\.(\d+)/.exec(hostVersion || '');
    if (!m) return false;   // 못 읽으면 못 받는 것으로 본다(안전한 쪽)
    for (var i = 0; i < 3; i++) {
      var a = parseInt(m[i + 1], 10), b = parseInt(min[i], 10);
      if (a !== b) return a > b;
    }
    return true;
  }
  function hostSupportsCurve() { return hostAtLeast(CURVE_MIN_HOST); }
  function hostSupportsVector() { return hostAtLeast(VEC_MIN_HOST); }
  // 맞붙임 — 호스트에 params `C`(열린 선분) 파서가 있어야 한다.
  //   구 호스트는 `C` 줄을 **조용히 무시**한다 → 조각별 닫힌 경로도 안 보냈으므로 **칼선이 통째로 없는 판**이 나온다.
  //   축2(호스트)는 Z: 1개 교체로 전 PC 에 퍼지지만 축3(화면)은 PC별 설치라 **역방향 스큐가 반드시 생긴다**.
  //   못 받으면 맞붙임을 쓰지 않고 기존 래스터 경로로 간다(도련 게이트와 같은 규칙).
  var BUTT_MIN_HOST = [0, 18, 0];
  function hostSupportsBakeAll() { return hostAtLeast(BAKEALL_MIN_HOST); }
  // 판짜기 조각별 칼선의 **구멍**(`H`/`HB` 줄 + compound path). 구 호스트는 그 줄을 **조용히 무시**해
  //   ㅇ·ㅁ·0·8 속이 안 뚫린 칼선이 나간다 — 조용히 틀리는 것이 가장 나쁘므로 보내지 않고 알린다.
  var HOLE_MIN_HOST = [0, 19, 0];
  function hostSupportsHoles() { return hostAtLeast(HOLE_MIN_HOST); }
  // DXF 경로를 **호스트가 정하고 내보내기까지** 한다(`mesCut_exportDxfAuto`). 구 호스트는 경로를
  //   돌려주고 다시 받는 왕복이라 한글이 `_` 로 죽고 %TEMP% 에 떨어진다 — 그 경로도 남겨 둔다.
  var DXFAUTO_MIN_HOST = [0, 20, 0];
  function hostSupportsDxfAuto() { return hostAtLeast(DXFAUTO_MIN_HOST); }

  /**
   * 단품 DXF 저장 — 새 호스트면 **경로 왕복 없이** 한 번에, 구 호스트면 종전 2단계.
   * @param cb(okBool, msgLine)
   */
  function exportDxfSmart(cb) {
    if (hostSupportsDxfAuto()) {
      host('mesCut_exportDxfAuto()', function (dx) {
        if (String(dx).indexOf('ok') !== 0) { cb(false, 'DXF 실패: ' + dx); return; }
        // ⚠️ 경로에 `:`·`\` 가 있어 kv() 로 못 자른다 — `path=` 뒤를 통째로 읽는다
        var at = String(dx).indexOf(';path=');
        var p = at >= 0 ? String(dx).substring(at + 6) : '(경로 미상)';
        var whereDoc = /;where=doc/.test(String(dx));
        cb(true, 'DXF: ' + p + (whereDoc ? '  (원본 .ai 옆)' : '  ⚠ 문서를 저장하면 .ai 옆에 만듭니다'));
      });
      return;
    }
    host('mesCut_dxfPath()', function (dp) {
      host('mesCut_exportDxf("' + dp + '")', function (dx) {
        var ok2 = String(dx).indexOf('ok;') === 0;
        cb(ok2, ok2
          ? ('DXF: ' + dp + '\n⚠ 호스트 구버전(' + (hostVersion || '?') + ' < CUT-CEP-0.20.0) — 파일명의 한글이 `_` 로 바뀌고 임시폴더에 저장됩니다. mes-cut-host.jsx 를 배포하세요.')
          : ('DXF 실패: ' + dx));
      });
    });
  }
  function hostSupportsButt() { return hostAtLeast(BUTT_MIN_HOST); }
  function hostSupportsBleedPng() { return hostAtLeast(BLEEDPNG_MIN_HOST); }
  // ★도련 원색을 마스크 굽기와 **같은 문서에서** 내보내는 호스트인가 (2026-08-27).
  //   못 받으면 옛 경로(도련만 따로 굽기)로 떨어진다 — 결과는 같고 느릴 뿐이다.
  var BAKE1_MIN_HOST = [0, 23, 0];
  function hostSupportsOneBake() { return hostAtLeast(BAKE1_MIN_HOST); }

  // ── ★칼선 방식 (2026-08-01) ──────────────────────────────────────
  // 벡터 = 일러가 실루엣을 직접 오프셋한다. 래스터 왕복(굽기→임계→픽셀 계단→곡선 복원)이 없으므로
  // 근사 오차 자체가 생기지 않는다. 실측(같은 좌표계 점 단위 대조, 2026-08-01):
  //   래스터 칼선은 실루엣 안팎을 **100mm당 7.5~10.6회 · 진폭 ±0.4~0.5mm** 로 넘나든다.
  //   면적차는 0.2~0.7% 뿐이라 **면적·bbox 게이트로는 안 잡히고** 눈에만 보인다.
  // ⚠️ 벡터 결과를 단순화·재피팅으로 다듬지 않는다 — 실측에서 전부 악화됐다(spec §6.29).
  /** 반환 {vector, note} — 요청을 호스트 능력으로 깎는다 */
  /**
   * ★칼선 방식은 **고르는 것이 아니라 맡기는 것**이다 (2026-08-07 용준님: "그냥 추천으로 할 수 없나").
   *   원래 벡터/래스터를 직접 고르게 했는데, 벡터는 이미 사진·임베드가 있으면 알아서 래스터로
   *   내려가므로 실질적인 선택지가 아니었다. 그러면서 **맞붙임을 막는 부작용**만 있었다
   *   (여백 0·간격 0 으로 붙여도 벡터가 조각마다 실루엣을 그려 칼선이 두 줄로 나갔다).
   *   → 기본은 `auto`. 남긴 선택지는 **래스터 고정**뿐이고, 그건 벡터가 말썽일 때의 우회로다.
   * ⚠️ 옛 값 `vector` 도 그대로 받는다 — 저장된 설정이나 구 화면에서 넘어와도 auto 와 같이 돈다.
   */
  function resolveLineMode() {
    var el = document.getElementById('lineMode');
    var want = el ? el.value : 'auto';
    if (want === 'raster') return { vector: false, note: '' };
    if (hostSupportsVector()) return { vector: true, note: '' };
    return { vector: false, note: '\n⚠ 호스트 구버전(' + (hostVersion || '?') + ') — 래스터로 만들었습니다. mes-cut-host.jsx 를 배포하세요.' };
  }
  // ── ★선 도안(이미 칼선인 파일) 판정 ──────────────────────────────
  // 시트컷 `.ai` 는 대개 컷 라인만 담고 면이 없다(spec §2.1). 그대로 구우면 마스크가 **획만**
  // 잡혀 실루엣이 아니라 가느다란 고리가 된다 — 실측(글자 18조각): 잉크 1.2%·효율 1.1%·
  // 섬 20(조각 18)·**글자 속 빈 공간에 다른 조각이 배치**. 래스터만으로는 "이 닫힌 선이 사실은 면"
  // 이라는 판단이 **원리적으로 불가능**하므로 좌표를 세어(mesCut_artKind) 결정한다.
  //   ⚠️ 마스크 정본은 계속 래스터다 — 좌표로 마스크를 직접 만들면 polarity·투명도·효과를
  //      우리가 재현해야 한다(2026-08-01 실측: polarity `++` 도넛은 일러가 구멍 없이 렌더).
  //      그래서 **임시 문서에서 채우기만 켜고** 굽는다(호스트 mesCut_fillClosedIn).
  /** kind 문자열 → {fill, note}. mode = 'auto' | 'on' | 'off' */
  function resolveFill(kindStr, mode) {
    // 구 호스트는 mesCut_artKind 가 없다 → **조용히 예전 동작으로 떨어지지 않게** 알린다
    if (!kindStr || String(kindStr).indexOf('ERROR') === 0) {
      return { fill: false, lineArt: false, note: '\n⚠ 호스트가 선 도안 판정을 못 합니다(구버전) — 그대로 구웠습니다.' };
    }
    var k = kv(kindStr || '');
    var paths = parseInt(k.paths, 10) || 0;
    var filled = parseInt(k.filled, 10) || 0;
    var stroked = parseInt(k.stroked, 10) || 0;
    var closed = parseInt(k.closed, 10) || 0;
    var lineArt = (paths > 0 && filled === 0 && stroked > 0 && closed > 0);
    if (mode === 'off') {
      return { fill: false, lineArt: lineArt, note: lineArt ? '\n⚠ 선 도안입니다(면 0·닫힌 선 ' + closed + ') — 그대로 두면 획만 칼선이 됩니다.' : '' };
    }
    if (mode === 'on') return { fill: true, lineArt: lineArt, note: '\n※ 닫힌 패스를 면으로 보고 구웠습니다(지정).' };
    if (lineArt) return { fill: true, lineArt: true, note: '\n※ 선 도안으로 판정 — 닫힌 패스를 면으로 보고 구웠습니다(자동). 원본은 그대로입니다.' };
    return { fill: false, lineArt: false, note: '' };
  }

  /** 곡선 요청을 호스트 능력으로 깎는다. 반환 {curve, note} */
  function resolveCurve() {
    var want = !!(document.getElementById('curveCut') && document.getElementById('curveCut').checked);
    if (!want) return { curve: false, note: '' };
    if (hostSupportsCurve()) return { curve: true, note: '' };
    return { curve: false, note: '\n⚠ 호스트 구버전(' + (hostVersion || '?') + ') — 곡선 대신 직선으로 만들었습니다. 호스트를 배포하세요.' };
  }

  function $(id) {
    var el = document.getElementById(id);
    if (!el) console.warn('[mes-cut-cep] #' + id + ' not found');
    return el;
  }

  // 도련 실패 사유 — 호스트는 **ASCII 코드만** 보낸다(evalScript 브릿지). 번역은 여기서 한다.
  //   "도련을 만들지 못했습니다"만 띄우면 사용자가 할 수 있는 일이 없다 → **다음 수를 함께** 말한다.
  function bleedFailWhy(code) {
    switch (code) {
      case 'dup': return '아트를 복제하지 못했습니다. 레이어가 잠겨 있거나 숨겨져 있는지 보세요.';
      case 'select': return '일러가 사본 선택을 거부했습니다(9063). 조각을 한 번 그룹 해제했다가 다시 묶어 보세요.';
      case 'group': return '사본을 묶지 못했습니다. 선택에 잠긴 개체가 섞여 있는지 보세요.';
      case 'effect': return '오프셋 효과가 먹지 않는 아트입니다(사진·임베드 이미지). 방식을 「사본 확대」로 바꾸세요.';
      case 'noexpand': return '오프셋이 아트에 먹지 않았습니다(크기가 그대로). 방식을 「사본 확대」로 바꾸세요.';
      case 'expand': return '오프셋을 확장하지 못했습니다. 방식을 「사본 확대」로 바꾸면 대개 됩니다.';
      case 'sil': case 'silsel': return '도련 경계를 만들지 못했습니다. 여백·도련 값을 줄여 보세요.';
      case 'mask': return '도련을 경계로 잘라내지 못했습니다. 잘리지 않은 도련은 칼선 밖으로 나가 옆 조각을 침범하므로 만들지 않았습니다.';
      case 'zero': return '도련 값이 0입니다.';
      case 'nopng': return '도련 그림을 만들지 못했습니다(조각이 너무 크거나 굽기 실패). 도련·여백을 줄이거나 조각을 나눠 보세요.';
      case 'throw': return '일러 내부 오류입니다. 같은 조각을 단품 칼선으로 시험해 보세요.';
      default: return '사유 미상(' + (code || '-') + ').';
    }
  }

  // ★`out`·`ver` 는 A0 와 겹치는 단 2개의 id 였다(2026-08-04 병합 실측: A0 55개 · 재단 50개 중 2개).
  //   같은 id 가 둘이면 getElementById 가 **먼저 나온 A0 쪽**을 집어 재단 결과가 가공 탭에 찍힌다.
  var elOut = $('cutOut');
  var elVer = $('cutVer');
  var elDoc = $('docInfo');
  var elSel = $('selInfo');
  var elLock = $('lockState');
  var elPunch = $('punch');

  // 잠금 시 막을 버튼. **새 버튼은 여기에 넣기만 하면 된다** — 개별 .disabled 조작 금지.
  var BUSY_IDS = ['btnRefresh', 'btnMakeCut', 'btnNest', 'btnWidth', 'btnRegister', 'btnExportPair', 'btnLockProbe', 'btnLockTest', 'btnUnlock', 'btnSelectAll',
  ];

  function setBusy(on) {
    hostBusy = !!on;
    for (var i = 0; i < BUSY_IDS.length; i++) {
      var el = document.getElementById(BUSY_IDS[i]);
      if (el) el.disabled = !!on;
    }
    // 잠금 해제 후에는 각 버튼의 고유 게이트를 다시 적용한다(P1 에서 늘어난다).
    if (!on) applyGates();
  }

  // ── ★예외 안전망 (2026-08-07) ────────────────────────────────────
  // 재단 파이프라인은 대부분 **`img.onload` 와 `evalScript` 콜백 안**에서 돈다. 거기서 난 예외는
  // 호출 스택이 이미 끊겨 있어 아무 데도 안 잡히고 **조용히 사라진다** — 화면에는 마지막 상태 문구가
  // 그대로 남고 버튼은 잠긴 채라, 증상이 "느리다 / 멈췄다" 로만 보인다.
  //   실제 사례 ①`T` 미선언 ReferenceError → '마스크 4/4' 에서 동결(성능 문제로 두 번 오진)
  //           ②콜백 안 예외가 "canvas 읽기 실패(보안)" 으로 둔갑
  // → **원인을 화면에 띄우고 잠금을 푼다.** 고장은 나더라도 고장난 줄은 알아야 한다.
  window.addEventListener('error', function (ev) {
    if (!hostBusy) return;                     // 이 모듈이 작업 중일 때만 관여한다
    var e = ev && ev.error;
    var where = (ev && ev.filename ? String(ev.filename).replace(/^.*\//, '') + ':' + ev.lineno : '?');
    out('내부 오류로 중단됐습니다 — ' + (ev && ev.message ? ev.message : '?') + ' (' + where + ')'
      + (e && e.stack ? '\n' + String(e.stack).split('\n').slice(0, 4).join('\n') : ''), 'err');
    try {
      host('mesCut_releaseLock("' + PANEL_OWNER + '")', function () { setBusy(false); refreshLock(); });
    } catch (e2) { setBusy(false); }
  });

  // 버튼별 고유 활성 조건. 기하 엔진(geometry.js)이 없으면 칼선을 만들 수 없다 —
  // 눌러도 아무 일이 없는 버튼을 열어 두면 "고장난 것"으로 읽히므로 이유를 title 에 남긴다.
  function applyGates() {
    // 곡선 칼선은 호스트가 받아야 성립한다 — 못 받으면 왜 직선인지 여기서도 보이게 한다
    var cc = document.getElementById('curveCut');
    if (cc) {
      cc.title = hostSupportsCurve()
        ? '컨투어를 베지어로 만듭니다 — 55° 이상 꺾이는 진짜 코너는 유지됩니다'
        : '호스트가 구버전이라 직선으로 만들어집니다 (mes-cut-host.jsx 배포 필요)';
    }
    // 벡터 칼선도 호스트가 받아야 성립한다 — 못 받으면 왜 래스터인지 여기서도 보이게 한다
    var lmSel = document.getElementById('lineMode');
    if (lmSel) {
      lmSel.title = hostSupportsVector()
        ? '자동 = 맞붙임(치수 산수) → 벡터 오프셋 → 래스터 순으로 되는 것을 씁니다. 무엇을 썼는지는 결과에 적힙니다'
        : '호스트가 구버전(' + (hostVersion || '?') + ')이라 래스터로 만들어집니다 (mes-cut-host.jsx 배포 필요)';
    }
    refreshPairName();
    var rb = document.getElementById('btnRegister');
    if (rb) { rb.disabled = !nestReady; rb.title = nestReady ? '네스팅 시트를 주문서 대기함으로 보냅니다' : '네스팅을 먼저 실행하세요'; }
    var mk = document.getElementById('btnMakeCut');
    if (!mk) return;
    if (!window.MesCutGeom) { mk.disabled = true; mk.title = 'geometry.js 미로드 — 패널 설치본을 확인하세요'; return; }
    mk.disabled = false;
    mk.title = '선택한 그림 바깥으로 오프셋만큼 벌린 칼선을 만듭니다';
  }

  function out(msg, kind) {
    if (!elOut) return;
    elOut.textContent = msg;
    elOut.className = 'out' + (kind ? ' ' + kind : '');
  }

  /** evalScript 래퍼. 반환은 ASCII 문자열이며 'ERROR ...' 를 실패로 본다. */
  function host(expr, cb) {
    cs.evalScript(expr, function (res) {
      var s = (res === null || res === undefined) ? '' : String(res);
      if (s === 'EvalScript error.') { cb('ERROR evalScript 실패: ' + expr, true); return; }
      cb(s, s.indexOf('ERROR') === 0);
    });
  }

  // ── 상태 조회 ────────────────────────────────────────────────────
  function refresh() {
    if (hostBusy) return;
    host('mesCut_docInfo()', function (doc, bad) {
      if (elDoc) elDoc.textContent = bad ? doc : (doc === 'nodoc' ? '— 열린 문서 없음' : fmtDoc(doc));
      host('mesCut_selectionInfo()', function (sel) {
        if (!elSel) return;
        if (sel === 'nodoc') elSel.textContent = '— 열린 문서 없음';
        else if (sel === 'none') elSel.textContent = '— 일러에서 대상을 고른 뒤 ↻';
        else elSel.textContent = fmtSel(sel);
      });
    });
    refreshLock();
  }

  function kv(s) {
    var o = {}, parts = String(s).split(';');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].split('=');
      if (p.length === 2) o[p[0]] = p[1];
    }
    return o;
  }
  function fmtDoc(s) { var o = kv(s); return (o.name || '?') + '  ' + (o.w || '?') + '×' + (o.h || '?') + 'mm · 레이어 ' + (o.layers || '?'); }
  function fmtSel(s) { var o = kv(s); return o.n + '개 · ' + o.w + '×' + o.h + 'mm'; }

  // ── 크로스 패널 잠금 (P0 의 본체 · spec §5.2-①) ──────────────────
  // A0 의 잠금은 패널 내부 JS 상태라 다른 패널을 모른다. 그래서 호스트가 **잠금 파일**(%TEMP%)로
  // 매개한다 — CEP 확장은 확장마다 ExtendScript 엔진이 따로라 전역 변수로는 서로를 볼 수 없다
  // (2026-07-31 양방향 실측 확정). [잠금 상태] 로 지금 누가 쥐고 있는지 확인할 수 있다.
  function refreshLock() {
    host('mesCut_lockProbe()', function (res) {
      if (!elLock) return;
      elLock.textContent = (res === 'none') ? '없음' : res;
    });
  }

  // ── P1: 칼선 만들기 ──────────────────────────────────────────────
  // 흐름 = 잠금 → 래스터화(호스트) → 마스크(canvas) → 오프셋·컨투어(geometry.js) → 좌표 → 그리기(호스트).
  // 계산이 일러 밖에 있는 이유(D5) = 하네스로 검증 가능하기 때문이다. ExtendScript 는 테스트가 사실상 불가능하다.

  /** PNG 파일 → {W,H,ch:4,data} (canvas ImageData). cep.fs Base64 경유 — file:// 로드는 taint 위험이 있다. */
  function readPng(path, cb) {
    var b64 = null;
    try {
      var enc = (window.cep && window.cep.encoding && window.cep.encoding.Base64) ? window.cep.encoding.Base64 : 'Base64';
      var r = window.cep.fs.readFile(path, enc);
      if (r && r.err === 0) b64 = r.data;
    } catch (e) { /* 아래 file:// 폴백 */ }
    var img = new Image();
    img.onload = function () {
      var cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      var ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0);
      // ★try 는 getImageData **만** 감싼다 (2026-08-06).
      //   전에는 cb(...) 까지 안에 있어서, 콜백 안에서 난 예외(실제 사례: ReferenceError)가
      //   "canvas 읽기 실패(보안)" 으로 둔갑했다. 원인과 전혀 다른 곳을 가리키는 오진이라
      //   찾는 데 시간이 걸린다 — 잡을 것만 잡는다.
      var d = null;
      try {
        d = ctx.getImageData(0, 0, cv.width, cv.height);
      } catch (eTaint) { cb('canvas 읽기 실패(보안): ' + eTaint, null); return; }
      cb(null, { W: cv.width, H: cv.height, ch: 4, data: d.data });
    };
    img.onerror = function () { cb('PNG 로드 실패: ' + path, null); };
    img.src = b64 ? ('data:image/png;base64,' + b64) : ('file:///' + String(path).replace(/\\/g, '/'));
  }

  function num(id, dflt) {
    var el = document.getElementById(id);
    var v = el ? parseFloat(el.value) : NaN;
    return isNaN(v) ? dflt : v;
  }
  function currentMode() {
    var r = document.querySelector('input[name="mode"]:checked');
    return r ? r.value : 'bbox';
  }

  function makeCut() {
    if (hostBusy) return;
    var G = window.MesCutGeom;
    if (!G) { out('geometry.js 미로드 — 패널 설치본을 확인하세요', 'err'); return; }

    // ★실물 mm → 파일 좌표(÷N). 네스팅과 **같은 규칙**이어야 단건과 판이 어긋나지 않는다.
    var offsetMm = toFileMm(num('offset', 3));
    var bleedMm = toFileMm(num('bleed', 3));   // 칼선 **바깥**으로 더 인쇄 — 실물 실측 3mm
    // auto = 클립 확장(무손실) → 안 되면 가장자리 색 · color = 색 강제 · scale = 사본 확대(옛 방식)
    var bleedModeEl = document.getElementById('bleedMode');
    var bleedMode = bleedModeEl ? bleedModeEl.value : 'auto';
    var mode = currentMode();
    var bgEl = document.getElementById('bg');
    var bg = bgEl ? bgEl.value : 'auto';
    var punchOn = !!(elPunch && elPunch.checked);
    var punchN = num('punchCount', 8);
    var punchInsetMm = num('punchInset', 10);
    var wantDxf = !!(document.getElementById('withDxf') && document.getElementById('withDxf').checked);
    var cv = resolveCurve();
    var wantCurve = cv.curve;
    var fallbackNote = '';   // 벡터→래스터로 내려간 사유. **조용히 달라지지 않게** 항상 결과에 붙인다.

    setBusy(true);
    out('잠금 확인 중...');
    host('mesCut_acquireLock("' + PANEL_OWNER + '","make-cut")', function (lk) {
      if (lk.indexOf('busy:') === 0) {
        setBusy(false);
        out('다른 쪽이 일러를 점유 중입니다: ' + lk.substring(5) + '\n끝난 뒤 다시 시도하세요.', 'err');
        return;
      }
      // ★벡터 우선 — 되면 래스터 왕복 자체를 하지 않는다. 안 되면 **사유를 달고** 래스터로 내려간다.
      var lm = resolveLineMode();
      if (lm.vector) {
        out('벡터 판정 중...');
        host('mesCut_vecProbe()', function (pb) {
          if (pb.indexOf('ok') === 0) { runVectorCut(); return; }
          if (pb.indexOf('fallback;') === 0) {
            fallbackNote = '\n※ 벡터로는 안 되는 요소가 있어 래스터로 만들었습니다 — ' + (kv(pb.substring(9)).reason || '?');
            runRasterCut();
            return;
          }
          finish('벡터 판정 실패: ' + pb, 'err');
        });
        return;
      }
      fallbackNote = lm.note;
      runRasterCut();
    });

    /** 벡터 칼선 — 호스트가 일러에게 직접 오프셋시킨다(우리 좌표계·피팅 미경유). */
    function runVectorCut() {
      // ★선 도안 판정은 벡터에도 필요하다 — 안 하면 `선 아웃라인`이 **획만** 면으로 바꿔
      //   실루엣이 아니라 가느다란 고리가 나온다(실측: 70×50 선도안 → 76.35 고리 + 63.65 구멍).
      var fillEl0 = document.getElementById('fillClosed');
      host('mesCut_artKind()', function (kindStr) {
        var fv0 = resolveFill(kindStr, fillEl0 ? fillEl0.value : 'auto');
        runVectorCutWith(fv0);
      });
    }
    function runVectorCutWith(fv0) {
      out('벡터 칼선 만드는 중...');
      host('mesCut_vecCut(' + offsetMm + ',' + (fv0.fill ? 'true' : 'false') + ',' + bleedMm + ',"' + bleedMode + '")', function (vc, badV) {
        if (!badV && vc.indexOf('fallback;') === 0) {
          fallbackNote = '\n※ 벡터로는 안 되는 요소가 있어 래스터로 만들었습니다 — ' + (kv(vc.substring(9)).reason || '?');
          runRasterCut();
          return;
        }
        if (badV || vc.indexOf('ok;') !== 0) { finish('벡터 칼선 실패: ' + vc, 'err'); return; }
        var d = kv(vc.substring(3));
        var msg = '칼선 ' + d.paths + '개 · 앵커 ' + d.anchors
          + '\n여백 ' + offsetMm + 'mm · 벡터(일러 오프셋 · 라운드 조인)'
          + '\n※ 실루엣 그대로입니다 — 굽기·임계·곡선 복원을 거치지 않아 근사 오차가 없습니다.'
          + (fv0.note || '');
        // ★도련을 어떤 방식으로 만들었는지 반드시 말한다 — 둘의 품질이 다르다(clip=무손실 / scale=근사)
        if (d.bleed === 'clip') msg += '\n도련 ' + bleedMm + 'mm — 클립을 넓혀 원본을 더 드러냈습니다(왜곡·빈 곳 없음).';
        else if (d.bleed === 'solid' || d.bleed === 'solid-fallback') msg += '\n⚠ 도련 ' + bleedMm + 'mm — 아트에서 색을 얻지 못해 지정색(기본 흰색)으로 채웠습니다. 재단이 밀리면 그 색이 보입니다.';
        else if (d.bleed === 'edge') msg += '\n도련 ' + bleedMm + 'mm — 가장자리 색을 위치별로 이어 붙였습니다.';
        else if (d.bleed === 'region') msg += '\n도련 ' + bleedMm + 'mm — 가장자리 도형을 제 색 그대로 밖으로 벌렸습니다. 링에 못 닿는 안쪽 도형은 미리 걸러 내부 선이 칼선 밖으로 나오지 않습니다.';
        else if (d.bleed === 'region-live') msg += '\n도련 ' + bleedMm + 'mm — 구역별로 벌렸습니다(라이브 효과 유지). 출력·RIP 는 정상이며, 일러에서 편집하면 값이 따라 변합니다.';
        else if (d.bleed === 'scale') msg += '\n도련 ' + bleedMm + 'mm — 사본을 늘려 채웠습니다. ⚠ 뾰족한 형상은 링 일부가 빌 수 있습니다.';
        else if (d.bleed === '0') msg += '\n⚠ 도련을 만들지 못했습니다 — ' + bleedFailWhy(d.bleedcode);
        if (mode === 'bbox') msg += '\n⚠ 벡터는 실루엣만 만듭니다 — 사각(bbox) 칼선이 필요하면 방식을 래스터로 바꾸세요.';
        if (punchOn) msg += '\n⚠ 타공은 래스터 방식에서만 만들어집니다.';
        if (!wantDxf) { finish(msg, 'ok'); return; }
        exportDxfSmart(function (okD, line) { finish(msg + '\n' + line, okD ? 'ok' : 'err'); });
      });
    }

    function runRasterCut() {
      // 해상도: 오프셋을 픽셀로 표현할 수 있어야 한다. 오프셋이 3mm 인데 1mm/px 면 3px 밖에 안 돼 거칠다.
      // 0.25mm/px 를 기본으로 하되 선택이 크면 픽셀 상한(12M)에 맞춰 자동으로 낮춘다(§4.3).
      out('래스터화 중...');
      host('mesCut_selectionInfo()', function (si) {
        if (si === 'none' || si === 'nodoc') { finish('선택된 그림이 없습니다. 일러에서 대상을 고르고 다시 누르세요.', 'err'); return; }
        var s = kv(si);
        // ★래스터 여백 = 오프셋 + 2mm. 여백이 부족하면 **팽창분이 캔버스 밖으로 잘려** 재단선이
        //   조용히 틀리게 나온다(2026-07-31 실측: 여백 0 일 때 잉크가 닿은 변만 오프셋 0mm 였다).
        var padMm = offsetMm + 2;
        var pick = G.pickResolution((parseFloat(s.w) || 100) + padMm * 2, (parseFloat(s.h) || 100) + padMm * 2)
        var mmpp = Math.min(pick.mmPerPx, 0.5);
        // ★작업 격자보다 곱게 굽는다 — 0.5mm/px 로 바로 뜨면 경계가 한 겹 부푼다(실측 §6.23)
        var sub = subPxFactor(mmpp);
        var fineMmpp = mmpp / sub;
        var fillEl = document.getElementById('fillClosed');
        host('mesCut_artKind()', function (kindStr) {
          var fv = resolveFill(kindStr, fillEl ? fillEl.value : 'auto');
          host('mesCut_rasterize(' + fineMmpp + ',' + padMm + ',' + (fv.fill ? 'true' : 'false') + ')', function (rz, bad) {
          if (bad || rz.indexOf('ok;') !== 0) { finish('래스터화 실패: ' + rz, 'err'); return; }
          var r = kv(rz.substring(3));
          out('마스크 생성 중...');
          readPng(r.path, function (err, img) {
            if (err) { finish(err, 'err'); return; }
            try {
              var res = buildCut(G, img, {
                // ★mmpp 는 **작업 격자**다 — 호스트가 돌려준 굽기 격자(r.mmpp)가 아니다.
                //   좌표 환산은 축소 후 격자 기준으로 해야 맞는다.
                mmpp: mmpp, sub: sub, ox: parseFloat(r.ox), oy: parseFloat(r.oy),
                offsetMm: offsetMm, mode: mode, bg: bg, curve: wantCurve,
                punchOn: punchOn, punchN: punchN, punchInsetMm: punchInsetMm,
              });
              if (res.err) { finish(res.err, 'err'); return; }
              res.fillNote = fv.note;
              writeParamsAndDraw(res, wantDxf);
            } catch (eCalc) { finish('계산 실패: ' + eCalc, 'err'); }
          });
          });
        });
      });
    }

    function finish(msg, kind) {
      host('mesCut_releaseLock("' + PANEL_OWNER + '")', function () {
        setBusy(false);
        refreshLock();
        out(msg + fallbackNote, kind);
      });
    }

    function writeParamsAndDraw(res, dxf) {
      out('칼선 그리는 중...');
      host('mesCut_paramsPath()', function (pp) {
        var w = window.cep.fs.writeFile(pp, res.text, window.cep.encoding.UTF8);
        if (!w || w.err !== 0) { finish('params 쓰기 실패: ' + pp, 'err'); return; }
        host('mesCut_drawCut()', function (dr, bad2) {
          if (bad2 || dr.indexOf('ok;') !== 0) { finish('그리기 실패: ' + dr, 'err'); return; }
          var d = kv(dr.substring(3));
          var msg = '칼선 ' + d.paths + '개' + (+d.holes ? (' (구멍 ' + d.holes + ')') : '')
            + (+d.circles ? (' · 타공 ' + d.circles + '개') : '')
            + '\n오프셋 ' + res.offsetMm + 'mm · 해상도 ' + res.mmpp + 'mm/px'
            + (res.curve ? ' · 곡선(베지어)' : ' · 직선(폴리라인)')
            // 어떤 배경 판정을 썼는지 반드시 보여준다 — '흰 배경 제거'는 흰색 그림도 지우므로
            // 사용자가 결과를 의심할 때 원인을 바로 알 수 있어야 한다.
            + (mode === 'silhouette'
              ? ('\n배경: ' + (res.bgMode === 'white' ? '흰 배경 제거' : '투명(alpha)') + (res.bgAuto ? ' (자동)' : ' (지정)')
                + (res.bgMode === 'white' ? ' — 흰색 그림이 있으면 함께 지워집니다' : ''))
              : '')
            + (res.merged ? '\n※ 조각들이 이어졌습니다(오프셋 ≥ 간격/2). 낱개로 떼려면 오프셋을 줄이세요.' : '')
            + (res.softened ? '\n※ 반투명 요소가 있어 경계를 느슨하게 잡았습니다 — 칼선이 조금 바깥으로 나올 수 있습니다.' : '')
            + (res.fillNote || '')
            + cv.note;
          if (!dxf) { finish(msg, 'ok'); return; }
          // ★경로는 **호스트가 정하고 내보내기까지** 한다 — 패널이 받아서 다시 인자로 넘기면
          //   evalScript 가 ASCII 라 한글 파일명이 `_` 로 죽는다(§6.29 실측).
          exportDxfSmart(function (okD, line) { finish(msg + '\n' + line, okD ? 'ok' : 'err'); });
        });
      });
    }
  }

  /**
   * 순수 계산부 — 일러·CEP 에 의존하지 않는다(그래서 스모크에서 그대로 검증할 수 있다).
   * @returns {text, paths, circles, merged, offsetMm, mmpp, dxfPath} 또는 {err}
   */
  /**
   * 배경 판정 — 마스크를 alpha 로 뜰지 흰 배경을 지울지 (P2).
   *
   * 벡터 아트는 투명 배경으로 구워지므로 alpha 로 충분하다. 그런데 **임베드 래스터(사진)는
   * 대개 불투명 사각형**이라 alpha 로 뜨면 실루엣이 아니라 사각형이 나온다
   * (2026-07-31 실측: 불투명 래스터 alpha 87.5% vs 흰배경 제거 14.7%).
   *
   * ⚠️ 흰 배경 제거는 **흰색 그림도 함께 지운다**. 그래서 기본을 alpha 로 두고,
   *    "흰 배경이 넓다"고 판단될 때만 자동 전환하며, 무엇을 썼는지 결과에 표시한다.
   */
  function pickMaskMode(G, img, requested, sub) {
    sub = sub || 1;
    var count = function (m) { var n = 0; for (var i = 0; i < m.length; i++) n += m[i]; return n; };
    var take = function (mode) {
      var em = edgeMask(G, img, mode, sub);
      return { mode: mode, mask: em.m, W: em.W, H: em.H, softened: em.downgraded };
    };
    if (requested === 'alpha' || requested === 'white') {
      var r = take(requested); r.auto = false; return r;
    }
    // 자동 판정은 **같은 임계·같은 격자**에서 비교해야 성립한다
    var a = take('alpha'), w = take('white');
    var aN = count(a.mask), wN = count(w.mask);
    // 흰 배경 제거로 잉크가 30% 이상 줄면 = 흰 배경이 넓다 → 그쪽이 실루엣이다.
    if (wN > 0 && wN < aN * 0.7) { w.auto = true; return w; }
    a.auto = true; return a;
  }

  function buildCut(G, img, o) {
    // ★굽기 격자(img)와 작업 격자(o.mmpp)는 다를 수 있다 — 경계 정확도를 위해 곱게 굽고 줄인다.
    var picked = pickMaskMode(G, img, o.bg || 'auto', o.sub || 1);
    var W = picked.W, H = picked.H;
    var mask = picked.mask;
    var base = G.traceAll(mask, W, H);
    if (!base.length) return { err: '잉크를 찾지 못했습니다(선택 영역이 비어 있나요?)' };

    var rPx = o.offsetMm / o.mmpp;
    var work = (o.mode === 'bbox') ? bboxMask(mask, W, H) : mask;
    var off = G.offsetMask(work, W, H, rPx);
    var polys = G.traceAll(off, W, H);
    if (!polys.length) return { err: '오프셋 결과가 비었습니다' };

    var tol = Math.max(1, 0.4 / o.mmpp); // 0.4mm 이내 오차로 단순화 — 플로터·CNC 가 읽기 좋은 점 수
    // ★구멍은 **오프셋 적용 뒤** 마스크에서 뽑는다 — 그래야 구멍도 함께 축소되고,
    //   오프셋이 구멍 반지름을 넘으면 사라진다(칼날이 못 들어가는 물리와 일치).
    // ⚠️ **최소 구멍 크기로 걸러야 한다** — 글자 사이 좁은 틈이 오프셋으로 막히면 갇힌 배경이
    //    미세 구멍으로 잡힌다(2026-07-31 실측: 한글 6줄에서 구멍 144개가 나왔다).
    //    칼날이 들어갈 수 없는 크기는 재단선이 아니라 노이즈다.
    var minHoleMm = toFileMm(MIN_HOLE_MM);
    var minHolePx = Math.max(4, Math.PI * Math.pow((minHoleMm / 2) / o.mmpp, 2));
    var holes = G.findHoles(off, W, H, minHolePx);
    var groups = G.assignHoles(polys, holes);

    var lines = [];
    var nHole = 0;
    // 곡선 모드면 접두사가 바뀐다(B=외곽 베지어 · HB=구멍 베지어). 호스트가 넷 다 처리한다.
    var tagOuter = o.curve ? 'B' : 'P';
    var tagHole = o.curve ? 'HB' : 'H';
    var fmt = function (poly) {
      var parts = [], j;
      if (o.curve) {
        // 컨투어 → 큐빅 베지어. 직선 구간은 직선 베지어로 나오므로 코너는 그대로 남는다.
        var segs = G.fitCurves(poly, tol);
        if (!segs.length) return null;
        var bm = G.bezToMm(segs, o.mmpp, o.ox, o.oy, true);
        parts.push(bm[0][0][0] + ',' + bm[0][0][1]);           // 시작 앵커
        for (j = 0; j < bm.length; j++) {
          parts.push(bm[j][1][0] + ',' + bm[j][1][1]);         // 앞 앵커의 오른쪽 핸들
          parts.push(bm[j][2][0] + ',' + bm[j][2][1]);         // 뒤 앵커의 왼쪽 핸들
          parts.push(bm[j][3][0] + ',' + bm[j][3][1]);         // 뒤 앵커
        }
        return parts.join(' ');
      }
      var mm = G.toMm(G.simplify(poly, tol), o.mmpp, o.ox, o.oy, true);
      if (mm.length < 3) return null;
      for (j = 0; j < mm.length; j++) parts.push(mm[j][0] + ',' + mm[j][1]);
      return parts.join(' ');
    };
    for (var i = 0; i < groups.length; i++) {
      var outer = fmt(groups[i].outer.poly);
      if (!outer) continue;
      lines.push(tagOuter + ' ' + outer);
      for (var h = 0; h < groups[i].holes.length; h++) {
        var hs = fmt(groups[i].holes[h].poly);
        if (!hs) continue;
        lines.push(tagHole + ' ' + hs);   // 직전 외곽의 구멍 — 호스트가 compound path 로 묶는다
        nHole++;
      }
    }

    var nC = 0;
    if (o.punchOn) {
      var ins = G.insetMask(off, W, H, o.punchInsetMm / o.mmpp);
      var ip = G.traceAll(ins, W, H);
      if (ip.length) {
        var pts = G.sampleEvenly(ip[0].poly, Math.max(2, Math.round(o.punchN)));
        var pmm = G.toMm(pts, o.mmpp, o.ox, o.oy, true);
        for (var k = 0; k < pmm.length; k++) { lines.push('C ' + pmm[k][0] + ',' + pmm[k][1] + ',6'); nC++; }
      }
    }

    return {
      text: lines.join('\n'),
      paths: lines.length - nC - nHole,
      holes: nHole,
      circles: nC,
      merged: (base.length > 1 && polys.length < base.length), // 오프셋으로 조각이 이어졌는가
      offsetMm: o.offsetMm,
      mmpp: o.mmpp,
      curve: !!o.curve,
      bgMode: picked.mode,
      bgAuto: picked.auto,
      softened: !!picked.softened,
    };
  }

  /** bbox 모드 = 잉크 전체를 감싸는 사각형을 마스크로 쓴다(오프셋을 주면 라운드사각이 된다). */
  function bboxMask(mask, W, H) {
    var L = W, T = H, R = -1, B = -1;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (!mask[y * W + x]) continue;
        if (x < L) L = x; if (x > R) R = x; if (y < T) T = y; if (y > B) B = y;
      }
    }
    var out = new Uint8Array(W * H);
    if (R < 0) return out;
    for (var yy = T; yy <= B; yy++) for (var xx = L; xx <= R; xx++) out[yy * W + xx] = 1;
    return out;
  }

  // 스모크에서 순수 계산부만 떼어 검증할 수 있게 노출(일러 없이 파이프라인 회귀를 잡는다)
  window.__mesCutBuild = function (img, o) { return buildCut(window.MesCutGeom, img, o); };

  // ── P3: 네스팅 ───────────────────────────────────────────────────
  // 흐름 = 잠금 → 대상 확정 → 조각별 래스터화 → gap 팽창 → 배치(nesting.js) → 새 문서 렌더.
  // 배치 계산은 하네스(cut:nest)가 검증하는 nesting.js 정본이 한다.

  // [폭 추천] 이 훑는 롤 후보. index.html 의 프리셋과 같은 값이어야 한다.
  var ROLL_WIDTHS_MM = [914, 1050, 1270, 1370, 1520];

  // 롤 1장의 최대 길이 — **파일 좌표** 기준이다(배치 버퍼·해상도 예산, 그리고 일러 아트보드 한계).
  //   일러는 16383pt = **5780mm** 를 넘는 아트보드를 못 만든다. 6000 은 그 한계를 넘어서,
  //   배치는 6000 까지 허용하는데 문서는 못 만드는 구간이 있었다 → 한계 안쪽으로 내린다.
  // ★여기에 toFileMm 을 씌우면 안 된다. 씌우면 실물 상한이 배율과 무관하게 고정돼
  //   "배율을 낮춰 한 대지에 담는다"가 성립하지 않는다(2026-08-05 용준님 제안).
  //   파일 좌표 상한을 고정해 두면 배율 1/2 = 실물 11200mm, 1/4 = 22400mm 가 한 대지에 들어간다.
  var NEST_ROLL_MAX_MM = 5600;
  // 배치 격자 후보(실물 mm/px). geometry.pickResolution 의 기본값과 같되, 배율에 따라 ÷N 해서 넘긴다.
  var NEST_MMPP_CANDS = [0.25, 0.5, 1.0, 2.0];
  // ★네스팅 시트 버퍼는 `Uint8Array`(1바이트/칸)다 — `pickResolution` 의 12M 상한은
  //   EDT(Float32 4바이트) 비용에서 나온 값이라 여기 그대로 쓰면 해상도가 필요 이상으로 거칠어진다
  //   (실측: 1370롤 3mm 가 0.75 대신 1.5mm/px 로 떨어져 칼선이 더 각져졌다).
  var NEST_MAX_PX = 24e6;

  // ── ★경계 정확도 (2026-07-31 실측) ────────────────────────────────
  // 일러 PNG 내보내기는 **해상도가 거칠수록 경계가 크게 번진다**. 100×60mm 사각 실측:
  //     0.25mm/px → 100.25×60.25mm (오차 0.25mm = 1px)
  //     0.75mm/px → **102.00×60.75mm (오차 2.0mm)**  ← 그대로 재단선 오차가 된다
  // 대책 두 가지를 함께 쓴다:
  //   ① **미세 격자로 굽고** 배치 격자로 줄인다(`downsampleMask`) — 번짐이 미세 격자 크기로 제한된다
  //   ② 알파 임계를 **50% 피복**으로 — 6% 임계는 살짝 스친 픽셀까지 잉크로 세어 한 겹 부풀린다
  var EDGE_ALPHA_THR = 128;        // 50% 피복 = 경계가 참값에 가장 가깝다
  var PRESENCE_ALPHA_THR = 16;     // "여기 아트가 있나" 판정용(반투명 보호)
  var FINE_MM_PER_PX = 0.25;       // 굽기 격자 **기본값** — 이보다 곱게 구워도 이득이 없다(0.25 실측 오차 ≈ 0)
  var MAX_SUBPX = 4;               // 굽기 비용 상한(선형 4배 = 픽셀 16배)
  var DOWNSAMPLE_COVER = 0.5;      // 절반 이상 차면 잉크 — 안팎 편향이 없다
  var FINE_MASK_BUDGET_PX = 60e6;  // 조각 칼선용 미세 마스크 보관 상한(1바이트/px)

  /**
   * 굽기 격자 목표(mm/px). 화면 칸(#nestBakeMm)이 있으면 그 값, 없으면 기본값.
   * ★크게 잡을수록 픽셀이 **제곱으로** 줄어 메모리·시간이 준다. 600×1800mm 조각 하나가
   *   0.25mm/px 면 17M px 이고 두 장이면 상한(BAKE_MAX_PX 32M)을 넘어 어차피 자동으로 성글어진다
   *   — 미리 크게 잡으면 그 왕복이 없다. 1.8m 짜리에서 0.5mm 오차는 무의미하다.
   * 상한 2mm 는 칼선이 눈에 띄게 뭉개지기 시작하는 선, 하한 0.05mm 는 이형 재단용이다.
   */
  function fineTargetMmpp() {
    var el = document.getElementById('nestBakeMm');
    var v = el ? parseFloat(el.value) : NaN;
    if (!isFinite(v) || v <= 0) return FINE_MM_PER_PX;
    return Math.max(0.05, Math.min(2, v));
  }

  /** 배치 격자 mmpp 에 대해 몇 배로 곱게 구울지 */
  function subPxFactor(mmpp) {
    return Math.max(1, Math.min(MAX_SUBPX, Math.round(mmpp / fineTargetMmpp())));
  }

  /**
   * 굽힌 PNG → 배치 격자 마스크.
   * ⚠️ 임계를 올리면 **반투명 아트가 통째로 사라질** 수 있다 → 조각(연결요소) 수가 줄면
   *    낮은 임계로 되돌리고 그 사실을 호출자에게 알린다(조용히 잃는 것이 가장 나쁘다).
   * @returns {m, W, H, downgraded}
   */
  /**
   * ★굽기 캔버스 **테두리에 닿은** 연결요소를 지운다 (2026-08-07 실사용 근본수정).
   *
   * 굽기는 항상 `padMm ≥ 1mm` 만큼 투명 여백을 두른다 → **진짜 아트는 테두리에 절대 안 닿는다.**
   * 그런데 실물 4조각 중 3조각의 PNG **맨 아래 1~4행**이 전폭으로 칠해져 나왔다
   * (#0 1046행 중 1042~1045 · #1 3405 중 3403~3404 · #2 7249 중 7248). 일러 문서에는 그런
   * 오브젝트가 없다 — 래스터화 가장자리 아티팩트다.
   * 그대로 두면 ① 마스크 bbox 가 ~1mm 부풀고 ② 조각이 "덩어리 2개"가 되어 맞붙임이 거절되고
   * ③ 래스터 칼선 경로에서 **그 선이 자기 칼선을 갖는다**(= 테두리가 하나 더 생긴다).
   * 세 증상이 전부 이것 하나에서 나왔다.
   *
   * ⚠️ 가장 큰 덩어리는 **절대 지우지 않는다** — 판정이 틀렸을 때 조각을 통째로 날리면 안 된다.
   * @returns {m, dropped} dropped = 지운 픽셀 수
   */
  function dropBorderTouching(G, m, W, H) {
    var c = G.components(m, W, H, 1);
    if (c.sizes.length < 2) return { m: m, dropped: 0 };
    var keep = 0, i;
    for (i = 1; i < c.sizes.length; i++) if (c.sizes[i] > c.sizes[keep]) keep = i;
    var bad = {}, x, y, id;
    for (x = 0; x < W; x++) {
      id = c.lab[x]; if (id >= 0 && id !== keep) bad[id] = 1;
      id = c.lab[(H - 1) * W + x]; if (id >= 0 && id !== keep) bad[id] = 1;
    }
    for (y = 0; y < H; y++) {
      id = c.lab[y * W]; if (id >= 0 && id !== keep) bad[id] = 1;
      id = c.lab[y * W + (W - 1)]; if (id >= 0 && id !== keep) bad[id] = 1;
    }
    var n = 0;
    for (i = 0; i < m.length; i++) {
      id = c.lab[i];
      if (id >= 0 && bad[id]) { m[i] = 0; n++; }
    }
    return { m: m, dropped: n };
  }

  function edgeMask(G, img, mode, factor) {
    var minPx = Math.max(16, Math.round(img.W * img.H * 0.0005));
    var cnt = function (m) {
      var c = G.components(m, img.W, img.H, 1), n = 0;
      for (var i = 0; i < c.sizes.length; i++) if (c.sizes[i] >= minPx) n++;
      return n;
    };
    var hi = G.inkMask(img, mode, EDGE_ALPHA_THR);
    var lo = G.inkMask(img, mode, PRESENCE_ALPHA_THR);
    var use = hi, downgraded = false;
    if (cnt(hi) < cnt(lo)) { use = lo; downgraded = true; }
    // ★테두리 아티팩트 제거는 **축소 전에** 한다 — 미세 격자에서는 pad 가 3px 이상이라
    //   "테두리에 닿았으면 아티팩트"라는 판정이 성립한다. 축소 후(1.16mm/px)엔 pad 가 1px 미만이라
    //   진짜 아트가 테두리에 닿아 보일 수 있어 같은 판정을 쓰면 위험하다.
    var cleaned = dropBorderTouching(G, use, img.W, img.H);
    var ds = G.downsampleMask(use, img.W, img.H, factor, DOWNSAMPLE_COVER);
    // 축소 전 마스크도 돌려준다 — 조각 칼선은 이쪽에서 뽑아야 격자 한 칸만큼 뭉툭해지지 않는다
    return {
      m: ds.m, W: ds.W, H: ds.H, downgraded: downgraded, edgeDropped: cleaned.dropped,
      fine: { m: use, W: img.W, H: img.H },
    };
  }

  /** 시트 프리셋 문자열 → {wMm, hMm, roll} */
  function parsePreset(preset) {
    if (String(preset).indexOf('roll:') === 0) return { wMm: parseFloat(preset.substring(5)), hMm: 0, roll: true };
    var wh = String(preset).substring(5).split('x');
    return { wMm: parseFloat(wh[0]), hMm: parseFloat(wh[1]), roll: false };
  }

  /**
   * ★네스팅 해상도 — gap/2 가 **픽셀 정수배**가 되도록 스냅한다.
   *
   * `offsetMask` 는 `dist <= r` 로 판정하는데 축방향 거리는 정수라 r 의 소수부가 버려진다.
   * 스냅 전에는 요청 3mm 가 **실보장 2mm** 로 나갔다(1370·1520 롤이 1.0mm/px 라 기본 조합이 최악).
   * 조용히 좁게 나오므로 재단해 보기 전에는 알 수 없다 — 그래서 해상도로 근본을 없앤다.
   * (2026-07-31 용준님 지적 → spec §6.20)
   */
  function nestResolution(G, offsetMm, gapMm, sheetWmm, sheetHmm) {
    // ★배치용 팽창량 = 여백 + 간격/2.
    //   재단선은 디자인에서 `여백` 만큼 떨어져 있고, 조각 사이는 **칼선끼리** `간격` 이어야 하므로
    //   디자인↔디자인 = 여백×2 + 간격 → 한쪽 팽창은 그 절반이다.
    // ★격자 후보·하한은 **실물 기준 정밀도**다 → 파일 좌표로 ÷N 해야 배율이 바뀌어도 품질이 같다.
    //   안 나누면 1/10 축소본에서 조각이 1/10 크기인데 격자는 그대로라 픽셀 수가 1/10 이 되고,
    //   실질 해상도가 0.5 → **5mm/px** 로 떨어진다. 컨투어가 계단이 되어 **직선 재단선이 휘어 보인다**
    //   (2026-08-05 용준님 지적). 조각과 격자가 같이 줄면 픽셀 수는 그대로라 비용도 안 는다.
    var cands = [];
    for (var ci = 0; ci < NEST_MMPP_CANDS.length; ci++) cands.push(toFileMm(NEST_MMPP_CANDS[ci]));
    // ⚠️ maxPx 는 **기본값(12e6)을 그대로 둔다**. NEST_MAX_PX(24e6)를 넘겼더니 더 고운 격자가 뽑혀
    //    base 가 1.0 → 0.5 로 바뀌고 안전 여유가 격자 반 칸 밑으로 떨어졌다(게이트 3f 가 잡았다).
    //    배율만 반영하는 변경이므로 배율 1 에서는 기존과 **완전히 같아야** 한다.
    var pick = G.pickResolution(sheetWmm, sheetHmm || toFileMm(3000), undefined, cands);
    var base = Math.max(pick.mmPerPx, toFileMm(0.5));   // 네스팅은 정밀도보다 속도 — 실물 0.5mm/px 이상
    // ★안전 여유 = **격자 반 칸**.
    //   배치는 거친 격자 마스크로 겹침을 막고, 칼선은 미세 격자 마스크에서 뽑는다 —
    //   두 마스크가 최대 mmpp/2 어긋나므로 그만큼이 칼선 간격에서 깎인다.
    //   (2026-08-01 실측: 여백3/간격5 요청에 칼선 간격 4.33mm = 5 − mmpp 0.92 와 일치)
    //   부족한 간격은 재단 사고, 남는 간격은 재료만 조금 더 씀 → **넉넉한 쪽**을 고른다.
    //   칼선 반경은 따로 내림하므로(cutFinePx) 미세 격자분은 이미 안전 방향이다.
    // ★여백·간격을 **둘 다 0** 으로 준 것은 "조각을 붙여 칼선을 포개겠다"는 의도다.
    //   재단선이 정확히 겹치면 재단기가 두 번 지나가도 **물리적으로는 한 번 자른 것과 같다**
    //   (2026-08-05 용준님). 이때 안전 여유를 넣으면 조각이 떨어져 칼선이 2줄이 되고 의도가 깨진다.
    //   여유의 목적은 "요청한 간격이 격자 양자화로 깎이는 것"을 메우는 것인데, 간격이 0이면 깎일 게 없다.
    //   ⚠️ 0 이 아닌 값에서는 그대로 둔다 — 그 경우엔 여유가 없으면 간격이 조용히 좁아진다
    //      (2026-08-01 실측: 요청 5mm 가 4.33mm 로 나갔다).
    var butt = (offsetMm <= 0 && gapMm <= 0);
    var safety = butt ? 0 : base / 2;
    var half = offsetMm + gapMm / 2 + safety;
    // 여백이 크게 음수(도련 적용분 안쪽)면 팽창이 0 이하가 된다 — 스냅할 대상이 없으니 그대로 쓴다.
    if (!(half > 0)) {
      return { mmPerPx: base, rPx: Math.round(half / base), exact: false, halfMm: half, safetyMm: safety };
    }
    var s = G.snapResolution(base, 2 * half, sheetWmm, sheetHmm || NEST_ROLL_MAX_MM, NEST_MAX_PX);
    return { mmPerPx: s.mmPerPx, rPx: s.rPx, exact: s.exact, halfMm: half, safetyMm: safety };
  }

  /**
   * ★직사각 판정은 **본체(가장 큰 연결요소)** 로 한다 (2026-08-07 실사용).
   *
   * 실물 파일 4조각 중 3조각에 본체와 떨어진 **전폭 1~4px 짜리 가는 선**이 붙어 있었다
   * (본체에서 2mm 아래). 마스크 전체로 판정하면 그 선 때문에 전부 "이형"이 되어 맞붙임이
   * 한 번도 안 켜졌다 — 그런데 **맞붙임은 윤곽을 따지 않는다.** 조각 bbox 의 변만 긋기 때문에
   * 여분이 안에 있어도 칼선을 만들지 않는다. 오히려 래스터·벡터 경로에서 나던
   * "여분 선이 자기 칼선을 갖는" 문제가 맞붙임에서는 사라진다.
   * → 여분을 이유로 **거절하지 않는다.** 본체로 판정하고, 여분이 있으면 **알린다**.
   *
   * @returns {mask, strays, mainPx, nextPx} — mask 는 본체만 남기고 bbox 로 자른 것
   */
  function mainPart(G, base) {
    var c = G.components(base.m, base.W, base.H, 1);
    if (!c.sizes.length) return { mask: base, strays: 0, mainPx: 0, nextPx: 0 };
    var best = 0, i;
    for (i = 1; i < c.sizes.length; i++) if (c.sizes[i] > c.sizes[best]) best = i;
    var sorted = c.sizes.slice(0).sort(function (a, b) { return b - a; });
    var strays = 0;
    for (i = 1; i < sorted.length; i++) if (sorted[i] >= 4) strays++;
    if (c.sizes.length === 1) return { mask: base, strays: 0, mainPx: sorted[0], nextPx: 0 };
    // 본체만 남긴 마스크 — isRectish 가 bbox 로 다시 자르므로 여기서는 걸러내기만 한다
    var m2 = new Uint8Array(base.W * base.H);
    for (i = 0; i < m2.length; i++) if (c.lab[i] === best) m2[i] = 1;
    return {
      mask: { W: base.W, H: base.H, m: m2 },
      strays: strays, mainPx: sorted[0], nextPx: sorted.length > 1 ? sorted[1] : 0,
    };
  }

  /**
   * ★조각을 **한 덩어리**로 만든다 — "그룹 하나 = 칼선 하나" (2026-08-27 용준님 결정).
   *
   * 1) 속을 메운다 → "테두리 사각 + 안쪽 글자" 가 한 덩어리가 된다(실물 sample1.ai).
   * 2) 그래도 덩어리가 여럿이면(= 테두리 없이 **글자만** 있는 그룹) **bbox 로 하나를 만든다.**
   *    메우기만으로는 안 붙는다 — 실측: 글자만 있는 조각은 메운 뒤에도 채움 11.3% 였다.
   *    떨어져 있는 것들을 하나로 자를 방법은 "다 감싸는 사각" 뿐이고, 그게 인쇄물 재단의
   *    실제 관행이기도 하다(맞붙임도 bbox 의 변만 긋는다).
   *
   * ⚠️ 덩어리가 **하나면 bbox 를 쓰지 않는다** — 로고·이형 실루엣을 사각으로 뭉개면 제품이 달라진다.
   * ⚠️ 낱개로 자르려면 [고급 · 단품 칼선] 을 쓴다. makeCut 은 손대지 않았다.
   * @returns {m, filledPx, boxed} boxed=true 면 bbox 로 대체한 것
   */
  function weldPiece(G, m, W, H) {
    var f = G.fillHoles(m, W, H), filledPx = 0, i;
    for (i = 0; i < f.length; i++) if (f[i] && !m[i]) filledPx++;
    var c = G.components(f, W, H, 1);
    var big = 0;
    for (i = 0; i < c.sizes.length; i++) if (c.sizes[i] >= 16) big++;
    if (big <= 1) return { m: f, filledPx: filledPx, boxed: false };
    // 잉크 bbox 를 통째로 채운다
    var x0 = W, y0 = H, x1 = -1, y1 = -1, x, y;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (f[y * W + x]) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < x0) return { m: f, filledPx: filledPx, boxed: false };
    var b = new Uint8Array(W * H);
    for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) b[y * W + x] = 1;
    return { m: b, filledPx: filledPx, boxed: true };
  }

  /** 부호 있는 팽창 — 양수=바깥(offsetMask) · 0=그대로 · 음수=안쪽(insetMask) */
  function growMask(G, m, W, H, rPx) {
    if (rPx > 0) return G.offsetMask(m, W, H, rPx);
    if (rPx < 0) return G.insetMask(m, W, H, -rPx);
    return m;
  }

  /**
   * 선택 조각을 전부 굽고 gap 팽창까지 마친다.
   * **조각 래스터는 시트 폭과 무관**하므로 [폭 추천] 은 이 결과를 재사용해 배치만 다시 돌린다.
   * @param fail(msg) 실패 콜백  @param cb({n, pieces, rawInkPx, mmpp, rPx, exact})
   */
  function nestPrepare(G, rez, gapMm, offsetMm, fillMode, fail, cb) {
    // ★수량 목록을 불러왔으면 그 스냅샷을 **재사용**한다 — 행을 눌러 조각을 확인하면
    //   선택이 하나로 바뀌는데, 여기서 선택을 다시 읽으면 수량이 통째로 날아간다.
    host('mesCut_nestBegin(' + (pieceQty ? '1' : '') + ')', function (bg, bad) {
      if (bad || bg.indexOf('ok;') !== 0) { fail('대상 확정 실패: ' + bg); return; }
      var n = parseInt(kv(bg.substring(3)).n, 10) || 0;
      // ★1개도 받는다 — 실물 작업 파일 다수가 `-1장` 짜리다. 단품도 돔보가 있어야 자를 수 있으므로
      //   모아찍기(돔보·도련·EPS/DXF 포함)로 보내는 게 맞다(2026-08-03 용준님 판단).
      if (n < 1) { fail('조각이 없습니다 — 대상을 선택하세요.'); return; }
      // ★선 도안 판정은 **선택 전체에 대해 한 번** — 조각마다 다르게 굽으면 마스크 규칙이 섞인다
      // 굽기 픽셀 예산에 쓸 **실제 조각 크기**를 먼저 받는다(호스트가 이미 아는 값이라 추가 비용 없음)
      host('mesCut_nestSizes()', function (szStr) {
        var areaMm2 = 0, sizeList = [];
        if (String(szStr).indexOf('ok;') === 0) {
          var parts = szStr.substring(3).split(',');
          for (var pz = 0; pz < parts.length; pz++) {
            var wh = parts[pz].split('x');
            var pw = parseFloat(wh[0]), ph = parseFloat(wh[1]);
            sizeList.push({ w: pw > 0 ? pw : 0, h: ph > 0 ? ph : 0 });
            if (pw > 0 && ph > 0) areaMm2 += pw * ph;
          }
        }
        host('mesCut_artKind()', function (kindStr) { prepareWith(resolveFill(kindStr, fillMode || 'auto'), areaMm2, sizeList); });
      });
      return;

      function prepareWith(fv, selAreaMm2, sizeList) {
      // 여백이 팽창이면 그만큼 캔버스가 더 필요하다 — 부족하면 팽창분이 잘려 칼선이 조용히 틀린다
      var padMm = Math.max(offsetMm, 0) + gapMm + 1;
      // ★배치 격자보다 곱게 굽는다 — 거친 격자에서 바로 뜨면 경계가 최대 2mm 부푼다(실측).
      var sub = subPxFactor(rez.mmPerPx);
      var fineMmpp = rez.mmPerPx / sub;
      // ★칼선 반경(미세 px)은 **내림** — 칼선이 잉크 쪽으로 조금 더 붙어야 칼선끼리 간격이 부족해지지 않는다
      var cutFinePx = Math.floor(offsetMm / fineMmpp);
      // ★굽기는 **파일 좌표(F)** 아트를 대상으로 하는데, 마스크는 **저장 좌표(S)** 픽셀 수여야 한다.
      //   그래서 굽기 해상도·패딩에 S/F 를 곱한다. F=S 면 1 이라 종전과 같다.
      //   (안 곱하면 F≠S 에서 마스크만 F 크기로 나와 배치가 통째로 어긋난다)
      var bakeK = fileToSave();
      var pieces = [], rawInkPx = 0, i = 0, softened = 0, edgeDropped = 0, filledPieces = 0, boxedPieces = 0;
      // 굽기 경로가 바뀐 사유 — 조용히 느려지거나 조용히 달라지지 않게 결과에 싣는다.
      //   (makeCut 의 fallbackNote 는 **다른 함수의 지역 변수**다. 여기서 건드리면 안 된다)
      var bakeNote = '';
      var inkList = [];   // 도련 원색 경로(호스트가 같은 문서에서 함께 내보낸 것)
      // ★★ 굽기 픽셀 상한 (2026-08-06 실사용 정지 — '마스크 n/n' 에서 수 분).
      //   위 예산(pickResolution·NEST_MAX_PX)은 **배치 격자** 기준이다. 그런데 실제로 굽는 해상도는
      //   `fineMmpp × bakeK` 라, 파일배율 10·저장배율 1 이면 격자보다 10배 곱다 → 픽셀은 **100배**.
      //   예산은 그대로 통과하고 마스크만 1억 픽셀대가 되어 몇 분씩 멈춘다
      //   (실측: 선택 392×212mm 파일 · 굽기 0.025mm/px).
      //   → **굽기 좌표에서 다시 재고** 넘으면 격자를 성글게 한다. 조용히 느려지지 않게 알린다.
      //   상한은 **실측으로** 정했다(Node, 이 PC). 마스크 처리(edgeMask = inkMask×2 + components×2
      //   + downsample)만 재면: 10M 0.68초 · 20M 1.08 · 40M 2.43 · 60M **4.87초**. components 가 지배적이고
      //   초선형이다. 여기에 일러의 굽기(호스트)가 더 붙는다.
      //   32M = 마스크 약 1.8초 → 굽기까지 합쳐 실사용에서 견딜 만한 선. 더 곱게 하려면 선택을 나누거나
      //   파일배율을 낮추면 된다(같은 실물 크기를 더 적은 픽셀로 표현하게 된다).
      var BAKE_MAX_PX = 32e6;
      if (selAreaMm2 > 0) {
        var bakeMmpp = fineMmpp * bakeK;
        var estPx = selAreaMm2 / (bakeMmpp * bakeMmpp);
        if (estPx > BAKE_MAX_PX) {
          var kUp = Math.sqrt(estPx / BAKE_MAX_PX);
          var oldFine = fineMmpp;
          fineMmpp *= kUp;
          rez.mmPerPx *= kUp;
          cutFinePx = Math.floor(offsetMm / fineMmpp);
          bakeNote += '\n※ 선택이 커서 격자를 ' + oldFine.toFixed(3) + ' → ' + fineMmpp.toFixed(3)
            + 'mm/px 로 성글게 잡았습니다(굽기 ' + Math.round(estPx / 1e6) + 'M px 예상 · 상한 '
            + (BAKE_MAX_PX / 1e6) + 'M).';
        }
      }
      // 미세 마스크 보관 예산 — 조각이 크고 많으면 메모리를 다 먹는다. 넘치면 그 조각만
      // 거친 마스크로 칼선을 뽑는다(정확도만 조금 떨어지고 결과는 나온다).
      var fineBudget = FINE_MASK_BUDGET_PX;
      /** 두 경로(순차·일괄)가 **같은 결과 묶음**을 넘긴다 — 갈라지면 한쪽만 조용히 달라진다. */
      function finishPrep() {
        cb({
          n: n, pieces: pieces, rawInkPx: rawInkPx, mmpp: rez.mmPerPx, sizes: sizeList || [],
          rPx: rez.rPx, exact: rez.exact, sub: sub, fineMmpp: fineMmpp, softened: softened, safetyMm: rez.safetyMm,
          // ★조용히 지우지 않는다 — 굽기 아티팩트를 걷어냈으면 걷어냈다고 말한다.
          edgeNote: edgeDropped ? ('\n※ 굽기 캔버스 테두리에 붙은 픽셀 ' + edgeDropped
            + '개를 걷어냈습니다(래스터화 아티팩트 — pad 덕에 진짜 아트는 테두리에 닿지 않습니다).') : '',
          offsetMm: offsetMm, cutFinePx: cutFinePx, fillNote: fv.note, lineArt: fv.lineArt, fill: fv.fill,
          bakeNote: bakeNote,
          // ★도련이 다시 구울 필요가 없게 경로를 넘긴다. 비면 옛 경로가 스스로 굽는다(하위호환).
          inkList: inkList,
          // ★조용히 바꾸지 않는다 — 속을 메운 조각이 있으면 몇 개인지 말한다.
          holeNote: (filledPieces || boxedPieces)
            ? ((filledPieces ? ('\n※ 조각 ' + filledPieces + '개는 **속을 메워** 외곽 하나로 잘랐습니다(테두리 안쪽 글자에는 칼선을 만들지 않습니다).') : '')
              + (boxedPieces ? ('\n※ 조각 ' + boxedPieces + '개는 떨어진 덩어리가 여럿이라 **바깥 사각(bbox)** 하나로 잘랐습니다.') : '')
              + '\n   낱개로 자르려면 [고급 · 단품 칼선]을 쓰세요.')
            : '',
        });
      }

      /** 구 호스트 폴백 — 조각마다 임시 문서를 만든다(조각당 4.07초, 2026-08-03 실측). */
      function next() {
        if (i >= n) { finishPrep(); return; }
        out('조각 굽는 중... ' + (i + 1) + '/' + n);
        host('mesCut_rasterizeItem(' + i + ',' + (fineMmpp * bakeK) + ',' + (padMm * bakeK) + ',' + (fv.fill ? 'true' : 'false') + ')', function (rz, bad2) {
          if (bad2 || rz.indexOf('ok;') !== 0) { fail('조각 ' + i + ' 실패: ' + rz); return; }
          readPng(kv(rz.substring(3)).path, function (err, img) {
            if (err) { fail(err); return; }
            addPiece(i, img);
            i++; next();
          });
        });
      }

      /** 마스크 처리 — 순차·일괄 두 경로가 **같은 코드**를 쓴다(갈라지면 한쪽만 조용히 달라진다). */
      function addPiece(id, img) {
        var em = edgeMask(G, img, 'alpha', sub);
        if (em.downgraded) softened++;
        if (em.edgeDropped) edgeDropped += em.edgeDropped;
        // ★효율%를 정직하게 내려면 **팽창 전** 잉크를 세 둬야 한다 —
        //   팽창된 마스크로 세면 조각이 작고 gap 이 클수록 크게 부풀려진다.
        //   ⚠️ 아래 구멍 메우기 **전에** 센다 — 효율%는 "실제 인쇄되는 잉크" 기준을 유지한다.
        var pInk = 0;
        for (var k = 0; k < em.m.length; k++) pInk += em.m[k];
        rawInkPx += pInk;

        // ★★조각 = 하나의 생산 단위 → **속을 메운다** (2026-08-27, 용준님 "그룹 하나 = 칼선 하나").
        //   실물 sample1.ai("테두리 사각 + 안쪽 글자") 실측이 근본을 가리켰다 —
        //   잉크가 링과 글자뿐이라 조각 bbox 의 **14.4% 만** 채워지고, 그 결과:
        //     ① 네스터가 테두리 안쪽을 빈 자리로 보고 **다른 조각을 밀어 넣는다**
        //        (조각 #1 이 #0 의 x범위 안으로 102mm 파고든 것을 실측)
        //     ② mainPart 가 얇은 링 대신 **글자**를 본체로 골라 isRectish 64% → **맞붙임 거절**
        //        → 맞닿은 변이 두 줄로 잘린다(용준님이 없애 달라고 한 그 중복)
        //     ③ traceAll·findHoles 가 글자마다·글자 속마다 칼선 — 실측 10줄
        //   메운 뒤: 채움 98.9% · isRectish true · 칼선 1줄 · 끼어들기 0 · **판 길이 동일**.
        //   ⚠️ 도련은 영향 없다 — buildBleedPngs 는 자기 원색 PNG(tag='ink')를 따로 굽는다(실측 확인).
        //   ⚠️ 낱개 재단(시트컷 글자·ㅇ 속 뚫기)이 필요하면 **[고급 · 단품 칼선]** 을 쓴다.
        //      거기는 손대지 않았다 — makeCut 은 지금도 구멍을 낸다.
        var wc = weldPiece(G, em.m, em.W, em.H);
        if (wc.filledPx) filledPieces++;
        if (wc.boxed) boxedPieces++;
        em.m = wc.m;
        if (em.fine) {
          var wf = weldPiece(G, em.fine.m, em.fine.W, em.fine.H);
          em.fine = { W: em.fine.W, H: em.fine.H, m: wf.m };
        }
        // ★배치 마스크 = **여백 + 간격/2** 팽창 — 겹치지 않으면 칼선끼리 간격이 보장된다.
        //   반경은 **정수 px** 이어야 한다(소수부는 버려진다) → 스냅이 계산한 rPx 를 그대로 쓴다.
        var piece = {
          id: id, ink: pInk, W: em.W, H: em.H, m: growMask(G, em.m, em.W, em.H, rez.rPx),
          base: { W: em.W, H: em.H, m: em.m },   // 팽창 전 — 칼선은 여기서 여백만큼만 벌린다
        };
        if (sub > 1 && em.fine) {
          var px = em.fine.W * em.fine.H;
          if (px <= fineBudget) { piece.fine = em.fine; fineBudget -= px; }
        }
        pieces.push(piece);
      }

      /**
       * ★일괄 굽기 — 호스트가 조각 전부를 한 번에 굽는다(문서 왕복 2회).
       * 순차 경로는 조각당 4.07초였고 그중 굽기는 78ms 뿐이었다(2026-08-03 실측).
       */
      function bakeAll() {
        out('조각 ' + n + '개 굽는 중...');
        // ★도련 원색을 **같은 호출**로 받는다 — 임시문서·복제 왕복이 한 번으로 준다(실측 굽기 5.7초 절약).
        //   ⚠️ 선 도안(fillClosed)이면 마스크가 닫힌 패스를 검게 칠하므로 **색이 파괴된다** →
        //      그때는 도련을 같이 뽑지 않고 옛 경로가 따로 굽게 둔다.
        var wantInk = hostSupportsOneBake() && !fv.fill;
        host('mesCut_nestBakeAll(' + (fineMmpp * bakeK) + ',' + (padMm * bakeK) + ',' + (fv.fill ? 'true' : 'false')
          + ',"nest"' + (wantInk ? ',"ink"' : '') + ')', function (rz, badB) {
          if (badB || rz.indexOf('ok;') !== 0) {
            // ★포기하지 않는다 — 조각당 임시 문서를 쓰는 구 경로가 있다(조각당 4초지만 동작한다).
            //   일괄 굽기는 조각을 한 문서에 모으므로 큰 조각·많은 조각에서 캔버스 한계에 걸릴 수 있다.
            //   여기서 중단하면 사용자는 원인도 대안도 없이 막힌다 → 느린 길로라도 끝까지 간다.
            out('일괄 굽기 실패 — 조각별로 다시 굽습니다(느립니다)...');
            bakeNote = '\n※ 일괄 굽기가 실패해 조각별로 구웠습니다(느린 경로): ' + String(rz).replace(/^ERROR\s*/, '');
            i = 0; next();
            return;
          }
          var rows = String(rz).split(/[\r\n]+/), list = [];
          for (var r = 1; r < rows.length; r++) {
            var t = rows[r].split(' ');
            // Q <idx> ... = 같은 문서에서 뽑은 **도련 원색**(pad 0 · AA OFF · 옛 'ink' 굽기와 같은 프레임)
            if (t[0] === 'Q') { inkList.push({ id: parseInt(t[1], 10), path: t.slice(6).join(' ') }); continue; }
            if (t[0] !== 'P') continue;
            // P <idx> <w> <h> <ox> <oy> <path…>  — 경로에 공백이 있을 수 있어 뒤를 전부 붙인다
            list.push({ id: parseInt(t[1], 10), path: t.slice(6).join(' ') });
          }
          if (!list.length) { fail('구운 조각이 없습니다: ' + rows[0]); return; }
          var q = 0;
          (function step() {
            if (q >= list.length) { finishPrep(); return; }
            out('마스크 ' + (q + 1) + '/' + list.length);
            readPng(list[q].path, function (err, img) {
              if (err) { fail(err); return; }
              addPiece(list[q].id, img);
              q++; step();
            });
          })();
        });
      }

      if (hostSupportsBakeAll()) bakeAll(); else next();
      }
    });
  }

  // ── ★도련 = Repeat Last Pixel (2026-08-05 배선) ──────────────────
  //
  // 계산이 일러 밖(여기)에 있는 이유 = **하네스로 검증되기 때문**이다(`npm run cut:bleed`,
  // geometry.js 와 같은 원칙). ExtendScript 는 픽셀에 접근할 수도, 테스트할 수도 없다.
  // 엔진과 왜 이 방식인지는 `js/bleed.js` 와 호스트 `mesCut_bleedPlaceItem` 주석에 있다.

  // 조각 하나가 만드는 확장 캔버스 상한. 8SSEDT 거리배열을 Int16 로 바꿔(2026-08-06)
  // 픽셀당 12바이트 → **8바이트**가 됐다: RGBA 4 + dx/dy 각 2. 같은 메모리(≈144MB)로 상한을 올린다.
  // 상한을 올리는 이유 = 넘으면 해상도를 낮춰 굽는데, 그게 **도련 외곽선 계단**의 원인이기 때문이다.
  var BLEED_MAX_PX = 18e6;

  /** RGBA 를 1/f 로 줄인다(도련 상한 초과 조각용). 실패하면 null — 호출부가 종전 경로로 간다. */
  function downscaleRgba(img, f) {
    try {
      var w = Math.max(1, Math.round(img.W / f)), h = Math.max(1, Math.round(img.H / f));
      var a = document.createElement('canvas'); a.width = img.W; a.height = img.H;
      var actx = a.getContext('2d');
      var id = actx.createImageData(img.W, img.H);
      id.data.set(img.data);
      actx.putImageData(id, 0, 0);
      var b = document.createElement('canvas'); b.width = w; b.height = h;
      var bctx = b.getContext('2d');
      // ★스무딩 금지 (2026-08-24 반백반흑 회색 오염) — 스무딩은 색 경계를 회색 밴드로 뭉개고
      //   그 회색이 도련 공급원으로 복사된다(하네스 실측: 3px 밴드 = 링 회색 120px, NN = 0px).
      //   도련은 가장자리 색을 늘리는 일이라 계단은 무해하지만 회색은 그대로 인쇄된다.
      bctx.imageSmoothingEnabled = false;
      bctx.drawImage(a, 0, 0, w, h);
      var out2 = bctx.getImageData(0, 0, w, h);
      return { W: w, H: h, ch: 4, data: out2.data };
    } catch (e) { return null; }
  }

  /** RGBA → temp 의 PNG 파일. canvas → dataURL → cep.fs(Base64). 호스트가 이 이름으로 찾는다. */
  function writeBleedPng(dir, id, r) {
    try {
      var cv = document.createElement('canvas');
      cv.width = r.W; cv.height = r.H;
      var ctx = cv.getContext('2d');
      var im = ctx.createImageData(r.W, r.H);
      im.data.set(r.data);
      ctx.putImageData(im, 0, 0);
      var b64 = cv.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
      var enc = (window.cep && window.cep.encoding && window.cep.encoding.Base64) ? window.cep.encoding.Base64 : 'Base64';
      var w = window.cep.fs.writeFile(dir + 'mes_cut_bleed_' + id + '.png', b64, enc);
      return !!(w && w.err === 0);
    } catch (e) { return false; }
  }

  /**
   * 조각마다 도련 PNG 를 만들어 temp 에 둔다.
   *
   * ★굽기를 **다시** 한다(`tag="ink"`). 이유 두 가지 — 둘 다 안 지키면 조용히 틀린다:
   *   ① 배치 마스크용 굽기는 선 도안이면 **검게 칠해져** 있다(`fillClosed`). 도련은 원색이 필요하다.
   *   ② `padMm=0` 으로 굽는다. 마스크 굽기의 pad 가 남아 있으면 도련 grow 와 **중복 패딩**돼
   *      PNG 중심과 조각 잉크 중심이 어긋나고, 호스트의 중심 정렬이 그만큼 밀린다.
   *
   * @param cb(map, note) map = { idx: {w,h} } **실제** PNG 크기(mm). 실패한 조각은 빠진다(호스트가 단색으로).
   */
  function buildBleedPngs(prep, growMm, cb) {
    var B = window.MesCutBleed;
    if (!B) { cb({}, '엔진(js/bleed.js) 미로드 — 패널 설치본을 확인하세요.'); return; }
    var mmpp = prep.fineMmpp;
    var growPx = growMm / mmpp;
    var padPx = Math.ceil(growPx);
    // ★굽기가 이미 도련 원색까지 내보냈으면 **다시 굽지 않는다** (2026-08-27).
    //   실측: 도련 굽기만 5,728ms(조각 4개) — 임시문서·복제 왕복이 통째로 중복이었다.
    //   프레임은 호스트가 옛 'ink' 굽기와 **같은 아트보드 산수**로 뽑으므로 결과가 같다.
    if (prep.inkList && prep.inkList.length) { withList(prep.inkList); return; }
    out('도련용 원색 굽는 중...');
    host('mesCut_nestBakeAll(' + (mmpp * fileToSave()) + ',0,false,"ink")', function (rz, bad) {
      if (bad || String(rz).indexOf('ok;') !== 0) { cb({}, '원색 굽기 실패: ' + rz); return; }
      var rows = String(rz).split(/[\r\n]+/), list = [];
      for (var r = 1; r < rows.length; r++) {
        var t = rows[r].split(' ');
        if (t[0] !== 'P') continue;
        // P <idx> <w> <h> <ox> <oy> <path…> — 경로에 공백이 있을 수 있어 뒤를 전부 붙인다
        list.push({ id: parseInt(t[1], 10), path: t.slice(6).join(' ') });
      }
      if (!list.length) { cb({}, '구운 조각이 없습니다.'); return; }
      withList(list);
    });

    /** 경로 목록을 받아 도련 PNG 를 만든다 — 재사용·재굽기 **두 경로가 같은 코드**를 쓴다. */
    function withList(list) {
      // temp 경로는 호스트만 안다 — 굽기 결과 경로에서 폴더를 떼어 쓴다(경로가 브릿지를 안 탄다)
      var dir = String(list[0].path).replace(/[^\/\\]+$/, '');
      var map = {}, skipped = 0, tooBig = 0, coarse = 0, q = 0;
      (function step() {
        if (q >= list.length) {
          var note = '';
          if (tooBig) note = tooBig + '개 조각은 너무 커서 만들지 않았습니다(단색으로 대체).';
          else if (skipped) note = skipped + '개 조각을 만들지 못했습니다(단색으로 대체).';
          // 낮춘 해상도로라도 **만들었다**는 사실은 알린다 — 조용히 품질만 달라지지 않게.
          if (coarse) note += (note ? ' ' : '') + coarse + '개 조각은 커서 도련만 거칠게 만들었습니다(단색 아님).';
          cb(map, note);
          return;
        }
        var it = list[q];
        out('도련 ' + (q + 1) + '/' + list.length);
        readPng(it.path, function (err, img) {
          if (err) { skipped++; q++; step(); return; }
          // ★상한을 넘으면 **건너뛰지 않고 해상도를 낮춘다** (2026-08-06 실사용).
          //   전에는 그 조각만 도련을 안 만들고 호스트가 단색 링으로 떨어뜨렸다. 실측 보고:
          //   조각 5장 중 2장이 "너무 커서" 단색이 됐다 — 아트 색이 아니라 지정색 테두리라
          //   재단이 밀리면 그 색이 그대로 보인다. **거친 도련이 단색보다 언제나 낫다.**
          //   도련은 가장자리 색을 3mm 늘리는 일이라 0.5~1mm/px 로도 눈에 차이가 없다.
          // ★필요한 만큼만 줄인다 — 정수 배(2,3,4…)로 줄이면 상한을 10%만 넘겨도 해상도가 절반이 돼
          //   외곽선 계단이 불필요하게 커진다. 연속 배율로 딱 상한에 맞춘다.
          var pxAt = function (k) { return ((img.W + 2 * padPx) / k) * ((img.H + 2 * padPx) / k); };
          var f = 1;
          if (pxAt(1) > BLEED_MAX_PX) f = Math.min(8, Math.sqrt(pxAt(1) / BLEED_MAX_PX) * 1.01);
          var src = img, gpx = growPx, mpp = mmpp;
          if (f > 1) {
            var ds = downscaleRgba(img, f);
            if (ds) { src = ds; gpx = Math.max(1, Math.round(growPx / f)); mpp = mmpp * f; coarse++; }
            else { tooBig++; q++; step(); return; }   // 축소마저 실패하면 종전대로
          }
          var res = null;
          try { res = B.repeatLastPixel(src, gpx); } catch (e) { res = null; }
          // ★크기(mm)는 **그 조각을 실제로 만든 해상도**로 환산해야 한다 — 원본 mmpp 를 쓰면
          //   축소한 조각만 배치가 f 배로 어긋난다(조용히 틀리는 자리).
          if (res && writeBleedPng(dir, it.id, res)) map[it.id] = { w: res.W * mpp, h: res.H * mpp };
          else skipped++;
          q++; step();
        });
      })();
    }
  }

  /** 도련을 **어느 방식으로** 만들었는지 — 품질이 다르므로 조각 수까지 밝힌다. */
  function bleedHow(a) {
    var clip = parseInt(a.bleedclip, 10) || 0;
    var px = parseInt(a.bleedpx, 10) || 0;
    var sol = parseInt(a.bleedsolid, 10) || 0;
    var leg = parseInt(a.bleedlegacy, 10) || 0;
    var parts = [];
    if (clip) parts.push('클립 확장 ' + clip + '개(무손실)');
    if (px) parts.push('가장자리 색 잇기 ' + px + '개');
    if (sol) parts.push('⚠ 단색 ' + sol + '개 — 아트에서 색을 못 얻었습니다. 재단이 밀리면 그 색이 보입니다');
    // ★새 호스트인데 옛 경로가 돌았다 = 이 패널이 도련 PNG 를 못 보냈다는 뜻이다(설치본이 낡음).
    if (leg) parts.push('옛 방식 ' + leg + '개 — 패널 설치본이 낡았습니다. install-a0-panel.ps1 을 다시 실행하세요');
    return parts.length ? (' — ' + parts.join(' · ')) : '';
  }

  /**
   * 맞붙임 배치 — mm 산수. 결과는 `nestPlace` 와 **같은 모양**으로 돌려준다.
   *
   * ★좌표를 **px 환산값**(mm / mmpp)으로 담는 이유: 아래 배선이 전부 `x * mmpp` 로 mm 를 되찾는다.
   *   같은 그릇에 담아야 효율%·판 크기·메시지 계산을 하나도 안 건드린다(회귀 0).
   *   되찾은 값의 부동소수 오차는 1e-13mm 수준이고, 내보낼 때 0.01mm 로 반올림되므로
   *   맞닿은 변은 **같은 값으로 반올림**된다 = 공유가 유지된다.
   * ★`segs` 에 공유 변을 한 번씩만 담아 보낸다 — 조각별 닫힌 경로를 만들지 않는다.
   */
  function buttPlace(BT, prep, sheetWmm, sheetHmm, allowRot) {
    var usableW = Math.max(1, sheetWmm - domboMm() * 2);
    // ★★단위 변환 (2026-08-07 실사용 — 이걸 빠뜨려 **조각이 전부 겹쳤다**).
    //   `mesCut_nestSizes()` 는 일러 문서에서 잰 값이라 **파일 좌표(F)** 다(예: 42×210mm).
    //   반면 배치·마스크는 **저장 좌표(S)** 다 — 마스크 px × mmpp = 저장 mm(예: 420×2100mm).
    //   파일배율 10 이면 10배 차이라, 변환을 안 하면 조각이 1/10 크기로 깔려 서로 포개진다.
    //   k = S/F = fileToSave() — 굽기 해상도에 곱하는 그 값과 **같은 상수**다(bakeK).
    var k = fileToSave() || 1;
    var rects = [];
    for (var i = 0; i < prep.pieces.length; i++) {
      var sz = prep.sizes[prep.pieces[i].id];
      if (!sz || !(sz.w > 0) || !(sz.h > 0)) return null;    // 크기를 모르면 산수를 못 한다
      rects.push({ id: prep.pieces[i].id, w: sz.w / k, h: sz.h / k });
    }
    // ★회전은 패커가 정한다 — 직사각은 돌려도 직사각이라 맞붙임 산수가 그대로 성립하고,
    //   폭에 맞추는 것뿐 아니라 **틈을 메우는 데도** 회전이 필요하다(실물 5장 3725 → 2585mm).
    var r = BT.packRects(rects, usableW, allowRot !== false);
    if (!r.placements.length || BT.anyOverlap(r.placements)) return null;
    // ★하나라도 못 넣었으면 **조용히 빠뜨리지 말고** 되돌린다 — 래스터 경로가 회전·탐색으로 넣을 수 있다.
    if (r.unplaced.length) return null;
    if (sheetHmm && r.usedH > Math.max(1, sheetHmm - domboMm() * 2)) return null;   // 평판 높이 초과
    var mmpp = prep.mmpp, inkPx = 0, pls = [];
    for (var q = 0; q < r.placements.length; q++) {
      var p = r.placements[q];
      inkPx += (p.w / mmpp) * (p.h / mmpp);
      pls.push({ id: p.id, x: p.x / mmpp, y: p.y / mmpp, rot: p.rot || 0, W: p.w / mmpp, H: p.h / mmpp });
    }
    // ★★검산 — 배치가 **실제 마스크와 같은 크기**인가 (2026-08-07).
    //   좌표계를 잘못 쓰면(파일↔저장) 조각이 1/10 로 깔려 **전부 겹친 판**이 그대로 나간다.
    //   `anyOverlap` 은 포장 공간 안에서만 보므로 이 사고를 못 잡는다 — 축척이 통째로 틀리면
    //   포장 공간에서는 아무 문제가 없기 때문이다. 그래서 **다른 출처**(굽은 마스크)와 대조한다.
    //   어긋나면 조용히 내보내지 말고 null → 호출부가 래스터로 되돌린다.
    for (var s = 0; s < pls.length; s++) {
      var pc = null;
      for (var t2 = 0; t2 < prep.pieces.length; t2++) if (prep.pieces[t2].id === pls[s].id) { pc = prep.pieces[t2]; break; }
      if (!pc || !pc.base) continue;
      var bb = BT.inkBBox(pc.base);
      if (!bb) continue;
      var expW = pls[s].rot === 90 ? bb.H : bb.W;
      var expH = pls[s].rot === 90 ? bb.W : bb.H;
      var tol = function (a, b) { return Math.abs(a - b) <= Math.max(4, b * 0.05); };
      if (!tol(pls[s].W, expW) || !tol(pls[s].H, expH)) return null;
    }
    return {
      sheets: [{ placements: pls, usedH: r.usedH / mmpp, inkPx: inkPx, segs: BT.cutSegments(r.placements) }],
      unplaced: r.unplaced, butt: true,
    };
  }

  /** 공통 배치 호출 — [네스팅 실행]과 [폭 추천]이 같은 규칙으로 돌아야 비교가 성립한다. */
  function nestPlace(NST, prep, sheetWmm, sheetHmm, allowRot, opts) {
    opts = opts || {};
    // ★돔보 여백을 빼고 배치한다 — 돔보는 디자인 영역 바깥 17mm 에 놓이므로
    //   그만큼 안쪽으로 줄이지 않으면 조각이 돔보를 덮거나 시트 규격을 넘는다.
    //   (A0 는 아트보드를 확장하지만 롤/평판은 폭이 고정이라 그 방법을 못 쓴다)
    var usableWmm = Math.max(10, sheetWmm - domboMm() * 2);
    return NST.nest(prep.pieces, {
      sheetW: Math.floor(usableWmm / prep.mmpp),
      sheetH: sheetHmm ? Math.floor(Math.max(10, sheetHmm - domboMm() * 2) / prep.mmpp) : 0,
      rollMaxH: Math.floor(NEST_ROLL_MAX_MM / prep.mmpp),
      step: opts.step || 4,
      tries: opts.tries,
      rotations: allowRot ? [0, 90, 180, 270] : [0],
      maxSheets: opts.maxSheets || 20,
    });
  }

  /**
   * 판(아트보드) 면적 — **재료 면적과 다르다**.
   * 호스트가 아트보드를 `배치 bbox + 돔보 여백`으로 줄이므로(mes-cut-host.jsx 의 nestApply),
   * 실제로 인쇄·재단되는 판은 시트 규격이 아니라 이 크기다. 재단기는 이 테두리를 따라 돈다.
   */
  function plateAreaMm2(res, prep) {
    if (!res || !res.sheets.length) return Infinity;
    var mm = prep.mmpp, tot = 0;
    for (var s = 0; s < res.sheets.length; s++) {
      var sh = res.sheets[s], w = 0;
      for (var k = 0; k < sh.placements.length; k++) {
        var e = sh.placements[k].x + sh.placements[k].W;
        if (e > w) w = e;
      }
      tot += (w * mm + domboMm() * 2) * (sh.usedH * mm + domboMm() * 2);
    }
    return tot;
  }

  /** 실제 소요 재료 면적(mm²) — 폭 전체 × (사용 길이 + 돔보 여백). 재료비 기준이라 여백을 뺄 수 없다. */
  function sheetAreaMm2(res, prep, sheetWmm, sheetHmm) {
    var tot = 0;
    for (var i = 0; i < res.sheets.length; i++) {
      tot += sheetWmm * (sheetHmm || (Math.ceil(res.sheets[i].usedH * prep.mmpp) + domboMm() * 2));
    }
    return tot;
  }

  // 일러 없이 회귀를 잡기 위한 노출 — 해상도 스냅·효율 산식·조각 칼선 인코딩은 순수 계산이다.
  window.__mesCutFill = resolveFill;   // 스모크에서 판정 규칙을 직접 검증
  window.__mesCutLineMode = resolveLineMode;
  // 스모크에서 파일명 규칙을 직접 검증 — 저장 직전에야 이름을 알면 회귀를 못 잡는다
  window.__mesCutPair = {
    name: function () { return pairBaseName(); },
    setNest: function (o) { lastNest = o; refreshPairName(); },
  };
  window.__mesCutNest = {
    resolution: function (offsetMm, gapMm, wMm, hMm) { return nestResolution(window.MesCutGeom, offsetMm, gapMm, wMm, hMm); },
    place: function (prep, wMm, hMm, rot, opts) { return nestPlace(window.MesCutNest, prep, wMm, hMm, rot, opts); },
    areaMm2: sheetAreaMm2,
    pieceCutLines: pieceCutLines,
    rollWidths: ROLL_WIDTHS_MM,
    dombo: domboMm(),
  };

  function runNest() {
    if (hostBusy) return;
    // ★구버전이면 **아예 시작하지 않는다** — 옛 규칙으로 만든 판은 조용히 틀리고,
    //   판 하나에 몇 분이 든다. 사람이 결과를 보고 알아채기까지가 너무 길다.
    if (hostStaleZ) { out(staleNote(), 'err'); return; }
    var G = window.MesCutGeom, NST = window.MesCutNest;
    if (!G || !NST) { out('엔진 미로드(geometry.js·nesting.js) — 패널 설치본을 확인하세요', 'err'); return; }

    // ★단계별 소요시간 — '오래 걸린다'를 추측이 아니라 사실로 가른다(2026-08-06).
    //   굽기·배치·도련·적용 중 어디인지 모르면 엉뚱한 곳을 최적화하게 된다(실제로 두 번 그랬다).
    // ⚠️ 이 선언이 **이 함수 안에** 있어야 한다. 2026-08-07 에 블록이 `exportPair()` 로 잘못 들어가
    //    `T.prep` 이 미선언 참조가 됐고, 굽기 직후 ReferenceError 로 파이프라인이 통째로 죽었다.
    //    예외가 `img.onload` 안에서 나 **아무 메시지 없이 '마스크 n/n' 에 얼어붙었다** — 느린 것으로 오진했다.
    var T = { t0: Date.now(), prep: 0, place: 0, bleed: 0, apply: 0 };
    var tms = function (a, b) { return Math.round((b - a) / 100) / 10; };

    var presetEl = document.getElementById('sheetPreset');
    var sp0 = parsePreset(presetEl ? presetEl.value : 'roll:1370');
    // ★여기가 실물↔파일 환산의 **유일한 입구**다. 아래 계산은 전부 파일 좌표로 돈다.
    //   재료(시트·롤 폭)도 실물이므로 같이 줄인다 — 안 줄이면 1/10 파일에서 시트가 10배로 보인다.
    var scaleN = cutScaleN();
    var sheetWmm = toFileMm(sp0.wMm), sheetHmm = sp0.hMm ? toFileMm(sp0.hMm) : 0, isRoll = sp0.roll;
    var gapMm = toFileMm(num('nestGap', 3));
    var offsetMm = toFileMm(num('nestOffset', 3));   // 디자인 → 칼선 (음수 = 잉크 안쪽 · 도련 적용분)
    var fillMode = (document.getElementById('fillClosed') || {}).value || 'auto';
    var allowRot = !!(document.getElementById('nestRotate') && document.getElementById('nestRotate').checked);
    var wantPieceCut = !!(document.getElementById('nestCut') && document.getElementById('nestCut').checked);
    var cvN = resolveCurve();
    var wantCurve = cvN.curve;
    var nestBleedMm = toFileMm(num('nestBleed', 3));   // 조각마다 칼선 바깥으로 더 인쇄
    // ★도련은 칼선 **바깥**으로 나간다 → 간격이 도련×2 보다 좁으면 옆 조각 도련과 겹치고,
    //   재단 오차가 나면 **옆 디자인 색이 넘어온다**.
    //
    //   **예전에는 간격을 도련×2 로 올렸다**(사용자 입력을 덮었다). 그 대가가 실측으로 컸다 —
    //   이형 24조각 롤 1330 기준 간격/2 를 3px→6px 로 벌리면 효율 65% → 56~58%,
    //   **재료 12~13%** 를 더 쓴다(직사각만으로 재면 0.9~2.3% 라 작아 보인다. 간격은 조각
    //   **둘레 전체**에 붙으므로 이형에서 비싸다).
    //
    //   ⇒ 2026-08-25 용준님 결정: **간격은 사용자 입력을 존중하고, 겹치는 도련을 경계에서 나눈다.**
    //   두 조각의 도련은 서로를 향해 자라므로 각자 `간격/2` 를 가지면 겹치지 않으면서 최대다.
    //   잘려 나갈 영역을 위해 재료를 더 쓸 이유가 없다. 업계 정본(tilia Phoenix)도 같은 방향이다
    //   (`spacing-type: Bleed` + `split bleed overlaps`).
    //
    //   하한만 지킨다 — 하한 미달일 때**만** 간격을 올린다(§2.2 설계).
    //   ⚠️ 하한은 `min(1.5, 요청도련)` 이다. 사용자가 도련 1mm 를 원했는데 우리가 1.5mm 를
    //      확보하겠다고 간격을 벌리면, 원하지도 않은 품질을 위해 재료를 뺏는 셈이 된다.
    //   ⚠️ 맞붙임(여백 0 · 간격 0)은 이 규칙에서 **뺀다**. 간격을 올리는 이유는 "옆 조각 도련이
    //      넘어와 남의 색이 보이는 것"인데, 맞붙임에서는 도련이 넘어가도 **옆 조각 원본이 그 위를
    //      덮는다**(도련은 SENDTOBACK 으로 조각 뒤에 깔린다). 안쪽 경계엔 도련이 안 보이고
    //      **판 바깥 테두리에만** 남는다 — 명함 8up 이 하는 방식이다. 분할도 하면 안 된다:
    //      간격이 0 이라 `간격/2 = 0` 이고, 그러면 도련이 통째로 사라진다.
    var buttMode = (offsetMm <= 0 && gapMm <= 0);
    var split = mesCutSplitBleed(gapMm, nestBleedMm, buttMode);
    var gapWanted = gapMm;
    gapMm = split.gapMm;
    // 실제로 조각마다 만들 도련(mm). 요청값과 다르면 결과창에 반드시 밝힌다.
    var effBleedMm = split.bleedMm;
    var nestBleedModeEl = document.getElementById('bleedMode');
    var nestBleedMode = nestBleedModeEl ? nestBleedModeEl.value : 'auto';
    var lmN = resolveLineMode();
    var useVec = false;                 // 판정 후 확정 — 배치 마스크는 어느 쪽이든 래스터다
    var vecNote = lmN.vector ? '' : lmN.note;

    setBusy(true);
    out('잠금 확인 중...');
    host('mesCut_acquireLock("' + PANEL_OWNER + '","nest")', function (lk) {
      if (lk.indexOf('busy:') === 0) { setBusy(false); out('다른 쪽이 일러를 점유 중입니다: ' + lk.substring(5), 'err'); return; }
      // ★벡터 판정은 **선택이 아직 그대로일 때** 한다(nestBegin 이후엔 선택이 바뀔 수 있다).
      if (lmN.vector && wantPieceCut) {
        host('mesCut_vecProbe()', function (pb) {
          if (pb.indexOf('ok') === 0) useVec = true;
          else if (pb.indexOf('fallback;') === 0) {
            vecNote = '\n※ 조각별 칼선은 래스터로 만들었습니다 — ' + (kv(pb.substring(9)).reason || '?');
          }
          go();
        });
        return;
      }
      go();
    });

    function go() {
      var rez = nestResolution(G, offsetMm, gapMm, sheetWmm, sheetHmm);
      nestPrepare(G, rez, gapMm, offsetMm, fillMode, function (m) { done(m, 'err'); }, function (prep) {
        T.prep = Date.now();
        // ★수량 확장은 **배치 전**이어야 한다 — 이 뒤의 grownPx·효율%·판 폭 추정이 전부 이 목록을 센다.
        var qtyNote = expandByQty(prep);
        // ★맞붙임 정확 배치 (2026-08-06 · spec 2026-08-06-butt-exact-and-cutline-weld)
        //   래스터 네스터는 좌표를 픽셀 격자로 양자화한다 → 최대 한 칸 어긋나고, 어긋나면 칼선이 두 줄이다.
        //   맞붙임은 탐색이 아니라 산수라서 **네스터를 안 거치면** 오차가 애초에 생기지 않는다.
        //   ⚠️ 조건을 좁게 잡는다 — 여백·간격이 **정확히 0** 이고 전 조각이 직사각일 때만.
        //     · 여백 > 0  → 칼선이 조각 바깥으로 나가 이웃 칼선과 **겹친다**(공유가 성립 안 함)
        //     · 여백 < 0  → 칼선이 안쪽으로 들어와 이웃과 **떨어진다**(공유할 변이 없다)
        //     · 간격 > 0  → 애초에 붙이지 않겠다는 뜻이다
        //     · 이형      → 붙여도 칼선이 안 맞는다
        //     넷 중 하나라도 걸리면 **기존 래스터 경로 그대로**(회귀 0).
        // ★★안 켜졌으면 **왜 안 켜졌는지 말한다** (2026-08-07 용준님: "여백 0·간격 0 인데 그대로다").
        //   조건이 5개라 조용히 폴백하면 사용자는 기능이 고장난 줄 안다 — 실제로 그렇게 한 번 헛돌았다.
        //   호스트 구버전이 가장 흔한 원인인데, 그건 **패널이 아니라 Z: 배포** 문제라 화면에 안 쓰면 알 수 없다.
        var BT = window.MesCutButt;
        var buttExact = false, buttWhy = '', buttStray = '';
        if (buttMode) {
          if (!BT) buttWhy = 'butt.js 미설치 — 패널 설치본을 갱신하세요';
          else if (!hostSupportsButt()) buttWhy = '호스트 구버전(' + (hostVersion || '?') + ' < CUT-CEP-0.18.0) — Z: 의 mes-cut-host.jsx 를 배포하세요';
          else if (offsetMm !== 0 || gapMm !== 0) buttWhy = '여백/간격이 0이 아님(' + offsetMm + '/' + gapMm + ')';
          else if (!prep.sizes.length) buttWhy = '조각 크기를 못 받았습니다';
          else {
            buttExact = true;
            for (var bi = 0; bi < prep.pieces.length; bi++) {
              var mp = mainPart(G, prep.pieces[bi].base);
              if (mp.strays) buttStray += (buttStray ? ', ' : '') + '#' + prep.pieces[bi].id + '(' + mp.strays + '개)';
              if (!BT.isRectish(mp.mask)) {
                buttExact = false;
                buttWhy = '조각 #' + prep.pieces[bi].id + ' 의 본체가 직사각이 아님(라운드·이형) — 맞붙임은 직각 사각만';
                break;
              }
            }
          }
        }
        // ★★맞붙임이 벡터보다 **우선한다** (2026-08-07 실사용 — 이것 때문에 계속 두 줄이 나왔다).
        //   벡터 칼선은 조각마다 실루엣을 따로 그린다 → 맞닿은 변은 **원리상 반드시 두 줄**이다.
        //   여백 0·간격 0 은 "붙여서 한 번만 자르겠다"는 뜻이므로 벡터로는 그 요청을 만족시킬 수 없다.
        //   직사각에서는 맞붙임 쪽이 벡터보다 오히려 정확하다 — 실루엣 추적이 아니라 **치수 산수**다.
        //   호스트는 cutMode='raster' 를 받으면 벡터 실루엣 대신 `C` 선분을 긋는다(배타적 분기).
        var buttOverVec = false;
        if (buttExact && useVec) { useVec = false; buttOverVec = true; }
        // ★mmpp 는 여기서 잡는다 — 아래 진단·좌표 변환이 전부 이 값을 쓴다.
        //   전에는 선언이 200줄쯤 아래에 있어서, 그 위에 붙인 진단 블록이 **호이스팅된 undefined**
        //   를 읽고 `.toFixed` 로 터졌다(2026-08-07). 쓰는 곳보다 위에 둬야 같은 사고가 안 난다.
        var mmpp = prep.mmpp;
        out('배치 계산 중...');
        var res = buttExact
          ? buttPlace(BT, prep, sheetWmm, sheetHmm, allowRot)
          : nestPlace(NST, prep, sheetWmm, sheetHmm, allowRot);
        if (buttExact && (!res || !res.sheets.length)) {   // 폭 초과 등 — 조용히 틀리지 말고 되돌린다
          buttExact = false;
          buttWhy = '맞붙임 배치가 시트 폭/높이에 안 들어가 래스터로 되돌렸습니다';
          res = nestPlace(NST, prep, sheetWmm, sheetHmm, allowRot);
        }
        T.place = Date.now();
        if (!res.sheets.length) { done('배치 실패 — 조각이 시트보다 큽니다.', 'err'); return; }

        // ★시트 모드에서 판이 **가로로 길쭉해지는** 것을 막는다 (2026-08-05 실측: 판 면적 −22%).
        //   엔진 점수(nesting.js scoreOf)는 usedH(세로)만 본다. 그런데 아트보드는 배치 bbox 로
        //   줄어들므로 실제 재료·재단기 이동은 **가로×세로**다. 시트 폭이 남으면 세로가 안 늘어나는
        //   쪽이 늘 이겨서 조각을 옆으로만 늘어놓는다(실사용 8조각이 전부 같은 y 에 한 줄로 섰다).
        //   → 팽창 포함 잉크 면적에서 **정사각형에 가까운 폭**을 역산해 한 번 더 돌린다.
        //     점수 함수를 면적으로 바꾸는 것만으로는 안 된다(실측 −0.2%) — bottom-left 탐색이
        //     애초에 조밀한 후보를 만들지 못하므로, 폭을 좁혀 **탐색 공간 자체**를 바꿔야 한다.
        //   ⚠️ 롤은 폭이 곧 재료다. 세로만 줄이는 현행이 맞으므로 건드리지 않는다.
        // ★맞붙임 진단 (2026-08-06) — "간격 0인데 조금 떨어진다"의 원인을 **사실로** 가른다.
        //   마스크 폭이 아트보다 넓으면 굽기·임계 문제이고, 같은데 자리가 벌어져 있으면 배치 문제다.
        //   추측으로 고치다 두 번 헛짚어서, 맞붙임일 때는 판정에 필요한 수치를 그대로 싣는다.
        var buttDiag = '';
        if (buttMode) {
          buttDiag += buttExact
            ? ('\n맞붙임 정확 배치 ON — 맞닿은 재단선은 **한 줄만** 나갑니다.'
               + (buttOverVec ? '\n  (칼선 방식은 벡터로 두셨지만 맞붙임을 씁니다 — 벡터는 조각마다 실루엣을 따로 그려 맞닿은 변이 반드시 두 줄이 됩니다)' : '')
               // ★여분은 **거절 사유가 아니라 알림**이다 — 맞붙임은 bbox 의 변만 그으므로 여분에
               //   칼선이 안 생긴다. 다만 인쇄에는 남으므로 파일을 볼지 말지는 사람이 정한다.
               // ⚠️ 문구를 조심한다 — 이전 판은 이걸 "파일에 여분 선이 있다"고 단정했는데
               //    실제로는 **우리 굽기의 테두리 아티팩트**였다(2026-08-07). 남의 파일을 잘못 지목했다.
               //    테두리분은 이제 굽기 단계에서 걷어내므로, 여기 남은 것은 진짜 떨어진 개체다.
               + (buttStray ? ('\n  · 본체와 떨어진 개체가 있는 조각: ' + buttStray
                   + ' — 맞붙임에서는 칼선이 안 생깁니다(인쇄에는 그대로 나갑니다)') : ''))
            : ('\n⚠ 맞붙임 정확 배치 OFF — ' + (buttWhy || '조건 미충족') + '. 조각마다 칼선이 따로 나가 겹치는 변은 두 번 잘립니다.');
        }
        if (buttMode && res.sheets.length) {
          var pls = res.sheets[0].placements.slice(0, 12);
          var lines2 = [];
          for (var di = 0; di < pls.length; di++) {
            var pd = pls[di];
            lines2.push('#' + pd.id + ' ' + pd.W + '×' + pd.H + 'px('
              + (pd.W * mmpp).toFixed(1) + '×' + (pd.H * mmpp).toFixed(1) + 'mm) @'
              + (pd.x * mmpp).toFixed(1) + ',' + (pd.y * mmpp).toFixed(1)
              + (pd.rot ? ('·' + pd.rot + '°') : ''));
          }
          // ⚠️ `+=` 다. `=` 로 두면 바로 위에서 만든 ON/OFF 사유 줄을 **덮어써서 사라진다** —
          //    실제로 그래서 "왜 안 켜졌는지"가 화면에 안 나왔고 원인을 한 번 더 헤맸다(2026-08-07).
          buttDiag += '\n진단(맞붙임) ' + mmpp.toFixed(3) + 'mm/px · ' + lines2.join(' | ');
        }
        var widthNote = '';
        if (!isRoll) {
          var grownPx = 0;
          for (var gi = 0; gi < prep.pieces.length; gi++) {
            var gm = prep.pieces[gi].m;
            for (var gj = 0; gj < gm.length; gj++) grownPx += gm[gj];
          }
          // 가정효율 55% — 실측에서 전체 폭 스윕(10회)의 최적과 1cm² 차이였다. 한 번이면 충분하다.
          var guessW = Math.round(Math.sqrt(grownPx * prep.mmpp * prep.mmpp / 0.55)) + domboMm() * 2;
          if (guessW > domboMm() * 2 + 10 && guessW < sheetWmm) {
            // ★★맞붙임이면 **맞붙임으로 다시 돌린다** (2026-08-07 검토에서 발견).
            //   여기서 래스터 배치로 갈아치우면 `res.butt` 와 `segs` 가 사라져 공유 변(`C` 줄)이
            //   안 나가고 조각별 칼선이 나간다 — 그런데 화면 문구·진단은 이미 만들어져 있어
            //   **"맞닿은 재단선은 한 줄만 나갑니다" 라고 써 놓고 두 줄을 내보낸다.**
            //   조용히 달라지는 것이 가장 나쁘다. 좁힌 폭에서 맞붙임이 안 되면 최적화를 포기한다.
            var alt = buttExact
              ? buttPlace(BT, prep, guessW, sheetHmm, allowRot)
              : nestPlace(NST, prep, guessW, sheetHmm, allowRot);
            if (!alt || !alt.sheets.length) alt = { sheets: [], unplaced: res.unplaced, placements: [] };
            var a0 = plateAreaMm2(res, prep), a1 = plateAreaMm2(alt, prep);
            // 조용히 나빠지지 않게 — 미배치가 늘거나 면적이 안 줄면 원래 배치를 그대로 쓴다
            if (alt.sheets.length && alt.unplaced.length <= res.unplaced.length && a1 < a0) {
              widthNote = '\n판 폭을 ' + Math.round(toRealMm(guessW)) + 'mm 로 좁혀 판 면적 ' + (100 * (1 - a1 / a0)).toFixed(0)
                + '% 절감 — 재단기가 도는 테두리도 그만큼 줄어듭니다.';
              res = alt;
            }
          }
        }

        // 조각 위치는 **실제 팽창분(rPx)을 되돌려** 원본 기준으로 준다.
        //   ⚠️ gap/2 를 그냥 쓰면 안 된다 — 팽창은 정수 px 이라 둘이 다를 수 있다.
        var half = prep.rPx * mmpp;
        // ★보장 간격은 **칼선끼리**다 — 디자인 사이(2×half)에서 양쪽 여백을 뺀 값.
        var cutOffMm = prep.cutFinePx * prep.fineMmpp;
        var guaranteedMm = 2 * half - 2 * cutOffMm;
        var lines = [];
        var holeOut = 0;      // 조각별 칼선에 실린 구멍 수(ㅇ·ㅁ·0·8 속) — 결과에 싣는다
        // ★배율을 호스트에 알린다 — 돔보 상수(6·17·60·500mm)가 호스트 안에 있어 거기서 ÷N 해야 한다.
        //   여백·간격·도련은 여기서 이미 환산했으므로 호스트가 또 나누면 두 번 줄어든다(호스트 주석 참조).
        if (scaleN > 1) lines.push('N ' + scaleN);
        // ★조각 리사이즈 % — 파일 좌표(F) 아트를 저장 좌표(S) 크기로 줄이거나 늘린다.
        //   호스트가 복제본에만 적용한다(원본 무손상). F=S 면 100 이라 아무 일도 일어나지 않는다.
        if (fileToSave() !== 1) lines.push('RS ' + (100 / fileToSave()).toFixed(4));
        for (var s = 0; s < res.sheets.length; s++) {
          var sh = res.sheets[s];
          // ★롤 길이에도 돔보 여백을 더한다 — 배치 좌표를 margin 만큼 밀었으므로
          //   시트 높이를 그대로 두면 조각이 아래로 삐져나간다(2026-07-31 실측: 하 -22.1mm).
          var hMm = sheetHmm || (Math.ceil(sh.usedH * mmpp) + domboMm() * 2);
          lines.push('S ' + s + ' ' + sheetWmm + ' ' + hMm);
          for (var k = 0; k < sh.placements.length; k++) {
            var pl = sh.placements[k];
            // 배치 좌표는 usable 영역 기준이므로 **돔보 여백만큼 밀어서** 시트 좌표로 바꾼다
            lines.push('I ' + pl.id + ' ' + (pl.x * mmpp + half + domboMm()).toFixed(2) + ' ' + (pl.y * mmpp + half + domboMm()).toFixed(2) + ' ' + pl.rot);
            // ★벡터 모드면 좌표를 보내지 않는다 — 호스트가 **배치가 끝난 사본**에서 직접 실루엣을 뽑는다.
            //   회전·이동이 이미 적용된 것을 쓰므로 정렬 수식(baseX·trim 오프셋)이 아예 필요 없다.
            // 맞붙임은 조각별 닫힌 경로를 만들지 않는다 — 공유 변을 아래에서 한 번씩만 내보낸다.
            if (wantPieceCut && !useVec && !res.butt) holeOut += (pieceCutLines(lines, res, prep, pl, mmpp, wantCurve) || 0);
          }
          // ★맞붙임 칼선 = `C` 줄(열린 선분). 맞닿은 변이 하나로 합쳐져 있어 재단기가 한 번만 지난다.
          if (res.butt && wantPieceCut && sh.segs) {
            for (var cs = 0; cs < sh.segs.length; cs++) {
              var sg = sh.segs[cs];
              lines.push('C ' + (sg.x1 + domboMm()).toFixed(2) + ' ' + (sg.y1 + domboMm()).toFixed(2)
                + ' ' + (sg.x2 + domboMm()).toFixed(2) + ' ' + (sg.y2 + domboMm()).toFixed(2));
            }
          }
        }
        // ★도련 PNG 는 params 를 쓰기 **전에** 만든다 — 실제 크기(mm)를 `L` 줄로 실어야 하기 때문이다.
        //   호스트가 픽셀에서 mm 를 다시 계산하면 반올림만큼 어긋나고, 그 오차가 조각마다 다르게 나온다.
        // ★`effBleedMm` 을 쓴다 — 요청값이 아니라 **실제로 만들 도련**이다(간격 분할 반영).
        //   요청값을 그대로 구우면 옆 조각 도련과 겹쳐 애초에 분할한 의미가 사라진다.
        var growMm = offsetMm + effBleedMm;          // 인쇄는 칼선(=잉크+여백)보다 도련만큼 더 나가야 한다
        // ★useVec 게이트 제거 (2026-08-06). 도련은 배치된 **사본**에 작용하므로 칼선을 무엇으로
        //   뽑았든 만들 수 있다. 묶어 뒀더니 벡터가 안 되는 아트(사진·중첩 클립)에서 래스터로
        //   폴백하는 순간 도련이 통째로 사라졌고, 아래 보고까지 같은 게이트라 화면도 침묵했다.
        var wantBleedPng = effBleedMm > 0 && growMm > 0;
        var bleedNote = '';
        if (wantBleedPng && !hostSupportsBleedPng()) {
          // ★조용히 옛 방식으로 떨어지지 않는다 — 링이 지저분해진 것을 인쇄 뒤에야 알게 된다.
          wantBleedPng = false;
          bleedNote = '\n※ 도련을 옛 방식(도형별 오프셋)으로 만들었습니다 — 호스트가 구버전입니다('
            + (hostVersion || '?') + '). Z: 의 mes-cut-host.jsx 를 갱신하세요.';
        }

        function afterBleed(bmap, note) {
          T.bleed = Date.now();
          if (note) bleedNote += '\n※ 도련 — ' + note;
          for (var bid in bmap) {
            if (!bmap.hasOwnProperty(bid)) continue;
            lines.push('L ' + bid + ' ' + bmap[bid].w.toFixed(3) + ' ' + bmap[bid].h.toFixed(3));
          }
          writeParamsAndApply();
        }

        function writeParamsAndApply() {
        host('mesCut_paramsPath()', function (pp) {
          var w = window.cep.fs.writeFile(pp, lines.join('\n'), window.cep.encoding.UTF8);
          if (!w || w.err !== 0) { done('params 쓰기 실패', 'err'); return; }
          T.apply = Date.now();
          out('새 문서에 배치 중...');
          // 기하는 **항상** 보낸다 — 도련이 필요하기 때문이다. 칼선을 래스터로 뽑았으면 cutMode='raster'
          //   를 덧붙여 호스트가 벡터 실루엣을 다시 만들지 않게 한다(구 호스트는 5번째 인자를 무시한다).
          host('mesCut_nestApply(' + offsetMm + ',' + (prep.fill ? 'true' : 'false') + ',' + effBleedMm + ',"' + nestBleedMode + '"' + (useVec ? '' : ',"raster"') + ')', function (ap, bad3) {
            if (bad3 || ap.indexOf('ok;') !== 0) { done('배치 적용 실패: ' + ap, 'err'); return; }
            var a = kv(ap.substring(3));
            // ★여기부터는 **사람이 보는 값**이라 실물로 되돌린다(×N). 배율 1이면 그대로다.
            //   내부 계산은 전부 파일 좌표였고, 화면에 파일 좌표를 그대로 띄우면
            //   1/10 파일에서 "여백 0.3mm"처럼 보여 사용자가 자기 입력을 못 알아본다.
            var R = toRealMm;
            var lenTxt = isRoll
              ? ('롤 길이 ' + Math.round(R(Math.ceil(res.sheets[0].usedH * mmpp) + domboMm() * 2)) + 'mm')
              : (res.sheets.length + '장');
            // ★효율% = 팽창 전 실면적 / 실제 소요 재료. 예전 값(팽창 잉크 / usable)은 1.7배 부풀려졌다.
            var areaMm2 = sheetAreaMm2(res, prep, sheetWmm, sheetHmm);
            var eff = areaMm2 ? (prep.rawInkPx * mmpp * mmpp / areaMm2) : 0;
            // ★파일명 규격의 출처 = **호스트가 돌려준 실제 아트보드 크기**다.
            //   시트 프리셋(예 1370)을 쓰면 안 된다 — `nestApply` 가 아트보드를 배치 bbox + 돔보
            //   여백으로 줄이므로 이름과 파일이 어긋난다(실물은 파일명 규격 = EPS 바운딩박스).
            var placed = 0;
            for (var ps = 0; ps < res.sheets.length; ps++) placed += res.sheets[ps].placements.length;
            var swMm = parseFloat(a.sheetw), shMm = parseFloat(a.sheeth);
            // 판 규격은 **실물 cm** 다 — 파일명 규약(`103x206`)이 실물 기준이고 EPS 바운딩박스와 맞아야 한다
            // 판별 실제 크기(호스트 `wh=W1xH1_W2xH2`) — 판마다 이름이 달라야 하므로 그대로 들고 간다
            var whList = [];
            if (a.wh) {
              var whRaw = String(a.wh).split('_');
              for (var wi = 0; wi < whRaw.length; wi++) {
                var wp = whRaw[wi].split('x');
                if (wp.length === 2) whList.push(Math.round(R(parseFloat(wp[0])) / 10) + 'x' + Math.round(R(parseFloat(wp[1])) / 10));
              }
            }
            lastNest = (swMm > 0 && shMm > 0)
              ? { wCm: Math.round(R(swMm) / 10), hCm: Math.round(R(shMm) / 10), n: placed, sheets: res.sheets.length, wh: whList }
              : null;
            refreshPairName();
            setNestReady(true);
            done('네스팅 완료 — 시트 ' + a.sheets + '개 · 조각 ' + a.items + '/' + prep.n
              + '\n' + lenTxt + ' · 효율 ' + (100 * eff).toFixed(1) + '% (재료 기준)'
              + '\n여백 ' + R(offsetMm) + 'mm (실제 ' + R(cutOffMm).toFixed(2) + 'mm) · 칼선 간격 ' + R(gapMm) + 'mm (실보장 ' + R(guaranteedMm).toFixed(2) + 'mm)'
              + '\n디자인 사이 ' + R(2 * half).toFixed(2) + 'mm (모델 ' + R(2 * offsetMm + gapMm).toFixed(2)
              + ' + 안전 ' + R(2 * (prep.safetyMm || 0)).toFixed(2) + ') · 배치 ' + mmpp.toFixed(3) + 'mm/px'
              + (prep.sub > 1 ? (' · 굽기 ' + prep.fineMmpp.toFixed(3) + 'mm/px') : '')
              + (scaleN > 1 ? ('\n배율 1/' + scaleN + ' — 위 치수는 **실물** 기준입니다(파일은 1/' + scaleN + ').') : '')
              // ★맞붙임 — 조각을 붙여 칼선을 포갠다. 안전 여유를 뺐다는 사실과 그 대가를 함께 말한다.
              + (buttMode
                ? ('\n맞붙임 모드 — 여백·간격 0 이라 안전 여유를 빼고 조각을 붙였습니다(칼선이 포개져 같은 자리를 두 번 자르지 않습니다).'
                  + (nestBleedMm > 0
                    ? ('\n도련 ' + R(nestBleedMm) + 'mm 는 **판 바깥 테두리에만** 남습니다 — 안쪽 경계는 옆 조각이 덮습니다(간격을 올리지 않았습니다).')
                    : '\n⚠ 도련이 0 입니다 — 재단이 밀리면 옆 디자인이 바로 들어옵니다.')
                  + (mmpp > 0.3 ? ('\n⚠ 배치 격자가 ' + mmpp.toFixed(2) + 'mm 라 조각이 최대 그만큼 어긋날 수 있습니다 — 더 붙이려면 시트를 작게 잡으세요.') : '')) : '')
              + (prep.softened ? ('\n※ 반투명 조각 ' + prep.softened + '개는 경계를 느슨하게 잡았습니다.') : '')
              + (prep.fillNote || '') + (prep.bakeNote || '') + (prep.edgeNote || '') + (prep.holeNote || '') + qtyNote
              + (prep.exact ? '' : ' ⚠ 해상도 한계로 올림 적용')
              + (allowRot ? ' · 회전 허용' : '')
              + '\n돔보 ' + (a.dombo || 0) + '판 — 별도 레이어(인쇄 ON) · 재단선 레이어는 인쇄 OFF'
              // ★무엇으로 만들었는지 **반드시** 적는다 — 방식을 자동으로 고르게 한 이상(2026-08-07),
              //   이 한 줄이 사용자가 결과를 신뢰할 수 있는 유일한 근거다. 맞붙임이면 조각별이 아니라
              //   **공유 변**이므로 이름부터 다르게 쓴다(그래야 "왜 조각 수보다 선이 적지?"가 안 생긴다).
              + (buttExact ? ' · 재단선=맞붙임 공유 변(치수 산수)'
                 : (wantPieceCut ? (' · 조각별 칼선' + (useVec ? '(벡터)' : (wantCurve ? '(곡선)' : '(직선)'))
                     // ★구멍은 **있으면 있다고 말한다** — ㅇ·ㅁ·0·8 속이 뚫렸는지는 눈으로 세기 어렵다.
                     //   구 호스트면 `H` 줄을 조용히 무시하므로 그 사실도 여기서만 알 수 있다.
                     + (holeOut ? (' · 구멍 ' + holeOut + '개') : '')
                     + ((!useVec && !hostSupportsHoles())
                        ? ('\n⚠ 호스트 구버전(' + (hostVersion || '?') + ' < CUT-CEP-0.19.0) — 조각별 칼선의 **구멍을 만들지 않았습니다**(ㅇ·ㅁ·0·8 속이 안 뚫립니다). mes-cut-host.jsx 를 배포하세요.') : '')) : ''))
              + (effBleedMm > 0 ? ('\n도련 ' + R(effBleedMm) + 'mm (조각마다)'
                  // ★어느 방식으로 만들었는지 밝힌다 — 클립 확장·색 잇기·단색은 품질이 서로 다르다
                  + bleedHow(a)
                  // ★요청보다 줄였으면 줄였다고, 왜 줄였는지까지 말한다. 이 한 줄이 없으면
                  //   "3mm 를 넣었는데 왜 1.5mm 로 나가지?"를 인쇄한 뒤에야 알게 된다.
                  + (effBleedMm < nestBleedMm
                     ? ('\n※ 요청 ' + R(nestBleedMm) + 'mm → 실제 ' + R(effBleedMm) + 'mm — 간격 '
                        + R(gapMm) + 'mm 를 옆 조각과 절반씩 나눠 가졌습니다(겹치면 재단 오차 때 옆 색이 남습니다).'
                        + ' 도련을 그대로 쓰려면 간격을 ' + R(nestBleedMm * 2) + 'mm 이상으로 올리세요.') : '')
                  // ★업계 통상 도련은 2~3mm 이고 재단 기계 공차가 0.5~1.5mm 다(2026-08-25 조사).
                  //   2mm 미만이면 **최악 공차와 여유가 거의 없다** — 재료를 아낀 대가를 작업자가
                  //   알고 고르게 한다. 동작은 막지 않는다(하한 1.5mm 는 용준님 확정).
                  + (effBleedMm > 0 && effBleedMm < 2
                     ? ('\n⚠ 도련 ' + R(effBleedMm) + 'mm 는 업계 통상(2~3mm)보다 얇습니다 — 재단이 '
                        + R(effBleedMm) + 'mm 이상 바깥으로 밀리면 옆 조각 색이 남습니다.'
                        + ' 여유를 두려면 간격을 ' + R(Math.max(4, gapMm + 1)) + 'mm 이상으로(도련 2mm↑).') : '')
                  // ★조용히 바꾸지 않는다 — 이제는 **하한 미달일 때만** 간격을 올린다
                  + (gapWanted < gapMm ? ('\n※ 간격을 ' + R(gapWanted) + ' → ' + R(gapMm)
                     + 'mm 로 올렸습니다 — 그 아래로는 도련이 ' + R(split.floorMm) + 'mm 하한을 못 지킵니다.') : '')
                  // ★도련이 조각별로 실패해도 판은 그려진다 — 조용히 넘기면 인쇄 뒤에야 안다(2026-08-04)
                  + (parseInt(a.bleedfail, 10) > 0
                    ? ('\n⚠ 도련 ' + a.bleedfail + '개 조각 실패 — ' + bleedFailWhy(a.bleedcode)) : '')
                  // ★배율·회전을 PDF 배치로 처리했는가 — 폴백했다면 **배경이 깨졌을 수 있다**.
                  //   resize 는 불투명도 마스크를 안 데려가 배경이 통째로 사라진다(2026-08-28 약국.ai 실측).
                  + (parseInt(a.placefail, 10) > 0
                    ? ('\n⚠ 배율·회전 ' + a.placefail + '개 조각이 예비 경로로 처리됐습니다 — '
                       + '배경이 사라졌을 수 있으니 판을 눈으로 확인하세요. '
                       + '조각이 지나치게 복잡하면 그 조각만 따로 짜 보세요.') : '')
                  + (parseInt(a.placed, 10) > 0
                    ? ('\n※ 배율·회전 ' + a.placed + '개 조각 — 아트를 직접 키우거나 돌리지 않고 PDF 로 굳혀 배치했습니다(마스크 보존).') : '')
                  + bleedNote) : '\n⚠ 도련 0mm — 만들지 않았습니다. 재단이 밀리면 흰 테두리가 남습니다.')
              + widthNote + buttDiag
              + ('\n소요 ' + tms(T.t0, Date.now()) + '초 — 굽기 ' + tms(T.t0, T.prep)
                 + ' · 배치 ' + tms(T.prep, T.place) + ' · 도련 ' + tms(T.place, T.bleed || T.place)
                 + ' · 적용 ' + tms(T.apply || T.place, Date.now()) + '초')
              + (res.unplaced.length ? ('\n⚠ 배치 못한 조각 ' + res.unplaced.length + '개 — 시트를 키우거나 간격을 줄이세요.') : '')
              + (useVec ? '' : cvN.note) + vecNote,
              (res.unplaced.length || parseInt(a.bleedfail, 10) > 0 || parseInt(a.placefail, 10) > 0) ? 'err' : 'ok');
          });
        });
        }

        if (wantBleedPng) buildBleedPngs(prep, growMm, afterBleed);
        else afterBleed({}, '');
      });
    }

    function done(msg, kind) {
      host('mesCut_releaseLock("' + PANEL_OWNER + '")', function () {
        setBusy(false); refreshLock(); out(msg, kind);
      });
    }
  }

  /**
   * 조각별 칼선 — 재단은 시트가 아니라 **조각 단위**로 이뤄진다. 시트 둘레만으로는 떼어낼 수 없다.
   * 배치된 모습 그대로(회전 포함) 컨투어를 뽑는다. 마스크는 이미 gap/2 만큼 팽창돼 있으므로
   * 그 외곽이 곧 "인접 조각 사이 중앙" = 칼선 위치가 된다(별도 오프셋 계산 불필요).
   */
  function pieceCutLines(lines, res, prep, pl, mmpp, wantCurve) {
    var G = window.MesCutGeom, NST = window.MesCutNest;
    var nHoleOut = 0;                       // 이 조각에서 내보낸 구멍 수 — 호출부가 합계를 화면에 싣는다
    var srcPiece = null;
    for (var pf = 0; pf < prep.pieces.length; pf++) if (prep.pieces[pf].id === pl.id) { srcPiece = prep.pieces[pf]; break; }
    if (!srcPiece) return 0;

    // ★칼선은 **미세 마스크**에서 뽑는다 — 배치 격자(거친)로 뽑으면 윤곽이 격자 한 칸(0.75mm)
    //   단위로 뭉툭해진다. 배치 좌표의 격자 오차는 **아트와 칼선이 함께 움직이므로 상쇄**된다
    //   → 아트가 놓이는 자리(`nestApply` 가 쓰는 값)를 기준으로 놓기만 하면 미세 격자 정확도가 된다.
    //   (거친 마스크 기준으로 놓으면 그 상쇄가 깨져 오히려 어긋난다)
    // ★칼선은 **여백**만큼만 벌린다 — 배치 팽창(여백 + 간격/2)과 다른 값이다.
    //   음수면 잉크 안쪽 = 도련이 이미 들어간 아트에서 칼선을 제자리에 놓는 경로.
    var useFine = !!(srcPiece.fine && prep.sub > 1);
    var src = useFine ? srcPiece.fine : srcPiece.base;
    if (!src) return 0;
    var stepMm = useFine ? prep.fineMmpp : mmpp;
    var rCut = useFine ? prep.cutFinePx : Math.floor(prep.offsetMm / mmpp);
    var grown = growMask(G, src.m, src.W, src.H, rCut);
    var placed = NST.trim(NST.rotate({ W: src.W, H: src.H, m: grown }, pl.rot));
    var art = NST.trim(NST.rotate(src, pl.rot));   // 아트 잉크의 원점(같은 회전 프레임)
    var ax = placed.offX - art.offX;
    var ay = placed.offY - art.offY;
    // 아트가 실제로 놓이는 좌표 = `I` 줄과 **같은 식**이어야 한다(격자 오차가 함께 움직여 상쇄된다)
    var baseX = pl.x * mmpp + prep.rPx * mmpp + domboMm();
    var baseY = pl.y * mmpp + prep.rPx * mmpp + domboMm();
    // ⚠️ 파편 제거 — 삼각형처럼 **얇은 꼭짓점**은 회전·trim 과정에서 픽셀이 끊겨 작은 조각으로
    //    갈라진다(실측: 조각 6개인데 칼선 11개). 그 부스러기를 내보내면 재단기가 허공을 자른다.
    var minCutPx = Math.max(16, Math.round(placed.W * placed.H * 0.01));
    var cps = G.traceAll(placed.m, placed.W, placed.H, minCutPx);
    var ctol = Math.max(1, 0.4 / stepMm);
    var toMm = function (px, py) {
      return [baseX + (ax + px) * stepMm, baseY + (ay + py) * stepMm];
    };
    // ★★직사각은 **추적하지 않는다** (2026-08-07 실사용 — "재단선이 삐뚤게 나온다").
    //   실측(500×350 조각): 변 위의 앵커는 전부 일직선인데 **모서리 앵커가 변에서 0.88·1.22·1.40·2.17mm
    //   안쪽**에 찍혔다. 래스터 추적의 계단을 곡선으로 피팅하면서 90° 모서리를 깎아 둥글린 것이고,
    //   깎인 양이 모서리마다 달라 사각이 비뚤어져 보인다. 네 변의 위치도 0.034~0.362mm 씩 제각각이었다.
    //   → 사각인 줄 아는 조각을 굳이 추적할 이유가 없다. **폴리곤의 축 정렬 bbox** 를 그대로 쓴다:
    //     좌표 규약(px→mm 사상)이 추적 경로와 완전히 같으므로 새로운 치우침이 생기지 않고,
    //     bbox 는 각 변의 **가장 바깥** 값이라 칼선이 잉크 쪽으로 파고들지도 않는다.
    //   ⚠️ 조각이 하나의 덩어리일 때만 — 여러 덩어리면 bbox 하나로 뭉뚱그릴 수 없다.
    // ⚠️⚠️ **여백이 있으면 쓰면 안 된다** (2026-08-07 배포 전 점검에서 발견).
    //   판정은 팽창 **전** 마스크(src)로 하는데 컨투어는 팽창 **후**(placed)에서 뽑는다.
    //   사각을 바깥으로 팽창하면 결과는 **라운드 사각**이다(반경 = 여백) — 실측 확인:
    //   여백 12px·30px 에서 모서리 픽셀이 비었다. 그 상태로 bbox 를 사각으로 내보내면
    //   **여백만큼의 라운드가 조용히 각지게** 되고 모서리 대각으로 r(√2−1) 만큼 더 나간다.
    //   여백 0(또는 음수=안쪽)일 때만 칼선이 실제로 사각이다.
    // ★★구멍 — 시트컷 글자(ㅇ·ㅁ·ㅂ·0·8)는 속이 뚫려야 한다 (2026-08-07 용준님).
    //   단품 칼선(makeCut)에만 있던 것을 판짜기로 옮긴다. 규칙은 **단품과 같아야** 한다:
    //     ① 구멍은 **팽창 후 마스크**(placed)에서 뽑는다 → 여백만큼 작아지고, 여백이 구멍 반지름을
    //        넘으면 사라진다(칼날이 못 들어가는 크기 = 재단선이 아니다 — 물리와 일치).
    //     ② 최소 구멍 크기로 거른다 — 안 하면 글자 사이 좁은 틈이 미세 구멍으로 잡힌다
    //        (2026-07-31 실측: 한글 6줄에서 구멍 144개).
    //   ⚠️ 도련은 손댈 게 없다 — 엔진이 구멍 **안쪽으로도** 채운다(실측: 도넛 구멍 경계에서 안으로 20px).
    //      그래서 구멍 칼선은 인쇄된 색 위를 지나간다.
    var minHolePx = Math.max(4, Math.PI * Math.pow((toFileMm(MIN_HOLE_MM) / 2) / stepMm, 2));
    var holesOk = hostSupportsHoles();
    var holes = holesOk ? G.findHoles(placed.m, placed.W, placed.H, minHolePx) : [];
    var groups = G.assignHoles(cps, holes);

    /** 폴리곤 → 좌표 문자열. 외곽·구멍이 **같은 코드**를 써야 스타일·닫힘이 어긋나지 않는다. */
    var fmtPoly = function (poly) {
      var parts = [], j, q;
      if (wantCurve) {
        var segs = G.fitCurves(poly, ctol);
        if (!segs.length) return null;
        var a0 = toMm(segs[0][0][0], segs[0][0][1]);
        parts.push(a0[0].toFixed(2) + ',' + a0[1].toFixed(2));
        for (j = 0; j < segs.length; j++) {
          for (q = 1; q <= 3; q++) {
            var p = toMm(segs[j][q][0], segs[j][q][1]);
            parts.push(p[0].toFixed(2) + ',' + p[1].toFixed(2));
          }
        }
        return parts.join(' ');
      }
      var sp = G.simplify(poly, ctol);
      if (sp.length < 3) return null;
      for (j = 0; j < sp.length; j++) {
        var pt = toMm(sp[j][0], sp[j][1]);
        parts.push(pt[0].toFixed(2) + ',' + pt[1].toFixed(2));
      }
      return parts.join(' ');
    };

    var BTr = window.MesCutButt;
    // 구멍이 있으면 사각 단축을 쓸 수 없다 — bbox 하나로는 속을 못 뚫는다
    var rectOnly = !!(BTr && cps.length === 1 && !holes.length && rCut <= 0 && BTr.isRectish(src));
    for (var ci = 0; ci < groups.length; ci++) {
      if (rectOnly) {
        var poly = groups[ci].outer.poly, parts = [], j;
        var rx0 = Infinity, ry0 = Infinity, rx1 = -Infinity, ry1 = -Infinity;
        for (j = 0; j < poly.length; j++) {
          if (poly[j][0] < rx0) rx0 = poly[j][0];
          if (poly[j][0] > rx1) rx1 = poly[j][0];
          if (poly[j][1] < ry0) ry0 = poly[j][1];
          if (poly[j][1] > ry1) ry1 = poly[j][1];
        }
        var corners = [[rx0, ry0], [rx1, ry0], [rx1, ry1], [rx0, ry1]];
        for (j = 0; j < 4; j++) {
          var cpt = toMm(corners[j][0], corners[j][1]);
          parts.push(cpt[0].toFixed(2) + ',' + cpt[1].toFixed(2));
        }
        lines.push('P ' + parts.join(' '));
        continue;
      }
      var outerStr = fmtPoly(groups[ci].outer.poly);
      if (!outerStr) continue;
      lines.push((wantCurve ? 'B ' : 'P ') + outerStr);
      // ★구멍은 **바로 뒤에** 붙인다 — 호스트가 직전 외곽에 매다는 규약이다(단품과 동일)
      for (var hh = 0; hh < groups[ci].holes.length; hh++) {
        var hStr = fmtPoly(groups[ci].holes[hh].poly);
        if (!hStr) continue;
        lines.push((wantCurve ? 'HB ' : 'H ') + hStr);
        nHoleOut++;
      }
    }
    return nHoleOut;
  }

  // ── P3: 폭 추천 ──────────────────────────────────────────────────
  // 조각 래스터는 폭과 무관하므로 **한 번만 굽고 배치만 5번** 돌린다(성근 스캔).
  // ★비교 지표는 효율%가 아니라 **사용 면적(폭 × 소요길이)** 이다 —
  //   좁은 롤이 효율은 높은데 길이를 더 먹는 경우가 갈린다.
  function recommendWidth() {
    if (hostBusy) return;
    var G = window.MesCutGeom, NST = window.MesCutNest;
    if (!G || !NST) { out('엔진 미로드(geometry.js·nesting.js) — 패널 설치본을 확인하세요', 'err'); return; }

    // ★배율 환산은 [네스팅 실행]과 **같은 규칙**이어야 한다 — 여기만 빠지면 추천 폭이 실제 배치와
    //   다른 조건으로 계산돼, 추천대로 골라도 결과가 안 맞는다(2026-08-05 용준님 지적).
    //   롤 폭(재료)도 실물이므로 배치에는 ÷N 한 값을 쓰고, 화면에는 실물 그대로 보여준다.
    var scaleN = cutScaleN();
    var gapMm = toFileMm(num('nestGap', 3));
    var offsetMm = toFileMm(num('nestOffset', 3));
    // ★도련 하한 상향을 여기서도 **똑같이** 적용한다 (2026-08-25).
    //   [네스팅 실행]이 간격을 올리는 경우가 있는데 여기서 안 올리면, 추천대로 폭을 골라도
    //   실제 배치가 더 넓은 간격으로 돌아 결과가 안 맞는다. 위 주석("같은 규칙이어야 한다")이
    //   가리키는 어긋남이 도련 축에서 그대로 있었다(배율·수량은 이미 맞춰 뒀는데 이것만 빠져 있었다).
    gapMm = mesCutSplitBleed(gapMm, toFileMm(num('nestBleed', 3)), (offsetMm <= 0 && gapMm <= 0)).gapMm;
    var offsetShow = num('nestOffset', 3), gapShow = num('nestGap', 3);   // 표시는 사용자가 넣은 실물 값
    var fillMode = (document.getElementById('fillClosed') || {}).value || 'auto';
    var allowRot = !!(document.getElementById('nestRotate') && document.getElementById('nestRotate').checked);

    setBusy(true);
    out('잠금 확인 중...');
    host('mesCut_acquireLock("' + PANEL_OWNER + '","nest-scan")', function (lk) {
      if (lk.indexOf('busy:') === 0) { setBusy(false); out('다른 쪽이 일러를 점유 중입니다: ' + lk.substring(5), 'err'); return; }
      // 해상도는 **가장 넓은 후보 기준으로 한 번** 정한다 — 폭마다 다르면 비교가 성립하지 않는다.
      var widest = toFileMm(ROLL_WIDTHS_MM[ROLL_WIDTHS_MM.length - 1]);
      var rez = nestResolution(G, offsetMm, gapMm, widest, 0);
      nestPrepare(G, rez, gapMm, offsetMm, fillMode, function (m) { done(m, 'err'); }, function (prep) {
        // ★수량을 [네스팅 실행]과 **똑같이** 반영한다 (2026-08-06).
        //   빠뜨리면 1장씩 기준으로 폭을 추천하고 실제로는 N장을 깔게 돼, 추천대로 골라도
        //   결과가 안 맞는다 — 배율을 빠뜨렸던 2026-08-05 건과 같은 종류의 어긋남이다.
        var qtyNote = expandByQty(prep);
        var rows = [], best = null;
        for (var i = 0; i < ROLL_WIDTHS_MM.length; i++) {
          var wReal = ROLL_WIDTHS_MM[i];           // 재료 폭 = 실물(화면·재료비용)
          var wFile = toFileMm(wReal);             // 배치는 파일 좌표에서
          out('폭 비교 중... ' + (i + 1) + '/' + ROLL_WIDTHS_MM.length + ' (' + wReal + 'mm)');
          // 성근 스캔 — 순서 후보를 줄여 폭당 비용을 낮춘다(정밀 재실행은 [네스팅 실행]이 한다)
          var r = nestPlace(NST, prep, wFile, 0, allowRot, { tries: 2, maxSheets: 1 });
          var okAll = r.sheets.length && !r.unplaced.length;
          var lenFile = r.sheets.length ? (Math.ceil(r.sheets[0].usedH * prep.mmpp) + domboMm() * 2) : 0;
          var lenMm = Math.round(toRealMm(lenFile));   // 소요 길이도 실물로 — 재료비 기준이다
          var areaCm2 = okAll ? (wReal * lenMm / 100) : Infinity;
          rows.push({ w: wReal, len: lenMm, area: areaCm2, ok: okAll, unplaced: r.unplaced.length });
          if (okAll && (!best || areaCm2 < best.area)) best = rows[rows.length - 1];
        }
        var txt = '폭 추천 (조각 ' + prep.n + '개 · 여백 ' + offsetShow + 'mm · 간격 ' + gapShow + 'mm'
          + (scaleN > 1 ? (' · 배율 1/' + scaleN + ' 반영') : '')
          + (allowRot ? ' · 회전 허용' : '') + ' · ' + prep.mmpp + 'mm/px)\n';
        for (var j = 0; j < rows.length; j++) {
          var rw = rows[j];
          txt += (best && rw.w === best.w ? '★ ' : '  ') + String(rw.w) + 'mm  ';
          txt += rw.ok
            ? ('길이 ' + rw.len + 'mm · 면적 ' + Math.round(rw.area).toLocaleString() + 'cm²'
              + (best && rw.w !== best.w ? ('  (+' + (100 * (rw.area / best.area - 1)).toFixed(1) + '%)') : ''))
            : ('배치 실패 — 못 놓은 조각 ' + rw.unplaced + '개');
          txt += '\n';
        }
        // ★추천했으면 **바로 적용한다** (2026-08-06 용준님). 전에는 사람이 시트 드롭다운을
        //   다시 찾아 고쳐야 했는데, 추천을 받고 안 바꾸면 추천이 무의미하고 잘못 고르면
        //   추천과 다른 조건으로 배치된다 — 손으로 옮겨 적는 단계는 사고만 만든다.
        //   되돌리기는 시트 드롭다운을 다시 고르면 되므로 확인을 묻지 않는다.
        var applied = false;
        if (best) {
          var selSheet = document.getElementById('sheetPreset');
          if (selSheet) {
            var want = 'roll:' + best.w;
            for (var si = 0; si < selSheet.options.length; si++) {
              if (selSheet.options[si].value === want) { selSheet.selectedIndex = si; applied = true; break; }
            }
            // change 리스너(폭 표시·프리셋 연동)가 붙어 있을 수 있어 알린다
            if (applied) { try { selSheet.dispatchEvent(new Event('change')); } catch (eEv) {} }
          }
        }
        txt += qtyNote;
        txt += best
          ? ('\n→ ' + best.w + 'mm 롤이 재료를 가장 적게 씁니다.'
            + (applied ? ' **시트를 이 폭으로 바꿔 놨습니다** — [네스팅 실행]만 누르세요.'
                       : ' 시트 목록에 없는 폭이라 직접 골라야 합니다.'))
          : '\n⚠ 어느 폭에도 전부 배치하지 못했습니다 — 간격을 줄이거나 조각을 나누세요.';
        done(txt, best ? 'ok' : 'err');
      });
    });

    function done(msg, kind) {
      host('mesCut_releaseLock("' + PANEL_OWNER + '")', function () {
        setBusy(false); refreshLock(); out(msg, kind);
      });
    }
  }

  // ── P3-N1/N2: 주문 등록 ──────────────────────────────────────────
  // 새 API 를 만들지 않는다 — A0 와 같은 **파일 경유 ingest**(Z: IA-등록 manifest)를 탄다.
  // 그래서 ia-editor 를 거치지 않고 여기서 바로 주문서 대기함으로 넘어간다.
  var CONFIG_PATH = 'Z:/DESIGNS/IA-등록/_config/config.json';
  var clientList = [];   // [{id, client_name}]
  var workerList = [];   // [{id, name}]
  var productList = [];  // [{id, item_name, sub_category}] — 품목(2026-09-01)
  var productMats = {};  // 제품 id → [자재명] (config.product_materials)

  function loadConfig() {
    try {
      var UTF8 = (window.cep && window.cep.encoding && window.cep.encoding.UTF8) ? window.cep.encoding.UTF8 : 'UTF-8';
      var r = window.cep.fs.readFile(CONFIG_PATH, UTF8);
      if (!r || r.err !== 0 || !r.data) return;
      var root = JSON.parse(r.data);
      // ⚠️ config 는 API 응답을 그대로 중계한 것이라 **{success, data:{...}} 로 감싸져 있다**.
      //    A0 도 같은 언랩을 한다(main.js:394). 이걸 빠뜨리면 목록이 조용히 비어 나온다.
      var cfg = (root && root.data) ? root.data : root;
      // ⚠️ 거래처 이름 필드는 `client_name` 이다(`name` 아님) — A0 스모크가 이걸로 한 번 새었다.
      clientList = cfg.clients || [];
      workerList = cfg.workers || [];
      productList = cfg.items || [];
      fillDatalist('productList', productList.map(function (it) { return it.item_name || ''; }));
      // 자재 = MES 정본. 없으면 빈 목록으로 두고 **자유 입력을 막지 않는다**(datalist 는 제안일 뿐).
      MATERIALS = (cfg.materials || []).map(function (m) { return m.item_name || ''; });
      // 재단이 파일명에 남길 표식 = 코팅 계열만(용준님 2026-09-01: 재단·네스팅은 유·무광이면 충분).
      //   부족하면 MES post_processing_options 에 추가하면 된다 — 패널 배포 없이 따라온다.
      FINISHES = (cfg.post_processing || [])
        .filter(function (o) { return o.pp_category === 'coating'; })
        .map(function (o) { return o.option_name || ''; });
      fillDatalist('materialList', MATERIALS);
      fillDatalist('finishList', FINISHES);
      productMats = {};
      var pms = cfg.product_materials || [];
      for (var mi = 0; mi < pms.length; mi++) {
        var pk = String(pms[mi].p);
        if (!productMats[pk]) productMats[pk] = [];
        productMats[pk].push(pms[mi].m);
      }
      var dl = document.getElementById('clientList');
      if (dl) {
        dl.innerHTML = '';
        for (var i = 0; i < clientList.length; i++) {
          var o = document.createElement('option');
          o.value = clientList[i].client_name || '';
          dl.appendChild(o);
        }
      }
      var sel = document.getElementById('regWorker');
      if (sel) {
        for (var w = 0; w < workerList.length; w++) {
          var op = document.createElement('option');
          op.value = String(workerList[w].id);
          op.textContent = workerList[w].name;
          sel.appendChild(op);
        }
      }
    } catch (e) { console.warn('[mes-cut-cep] config 로드 실패: ' + e); }
  }

  // 품목은 **정확일치만** id 로 본다 — 이름만 맞춘 가짜 품목이 실리면 주문서가 그 단가로 계산한다.
  //   미해소는 null 로 보내고 사람이 주문서에서 고른다(자동 확정 금지).
  /**
   * 품목이 정해지면 [자재] 후보를 **그 제품에 연결된 것만**으로 좁힌다(product_materials).
   * ★매핑이 없으면 전체 목록으로 되돌린다 — 실사용 라인의 27%가 매핑이 없고, 거기엔 포맥스·폼보드처럼
   *   **품목과 애초에 별개 축인 판재**가 들어 있다. 그건 누락이 아니라 정상이므로 자유 입력을 막지 않는다.
   * ★후보가 하나면 채워 주되 **사람이 쓴 값은 덮지 않는다**(자동 확정 금지와 같은 결).
   */
  function narrowMaterials() {
    var id = productIdOf((document.getElementById('regProduct') || {}).value);
    var list = (id != null && productMats[String(id)]) ? productMats[String(id)] : null;
    fillDatalist('materialList', list || MATERIALS);
    var el = document.getElementById('regMaterial');
    if (!el) return;
    if (list && list.length === 1 && !String(el.value || '').replace(/^\s+|\s+$/g, '')) {
      el.value = list[0];
      refreshPairName();
    }
  }

  // ★공백을 지운 비교축 — 일러 CEP 는 **IME 조합을 웹뷰에 넘기지 않는다**(2026-09-02 실측:
  //   composition 이벤트 0건 · `isComposing` 항상 false). 마지막 글자를 스페이스로 확정해야
  //   들어오므로 그 스페이스가 이름 안에 남고, 「가로등 배너」가 「가로등배너」로 들어온다.
  //   ⚠️ 원문 정확일치가 **먼저**다. 공백만 다른 이름이 실제로 있어(거래처 1쌍) 완화 매칭은
  //      후보가 **하나일 때만** 채택한다 — 둘 이상이면 못 고른 것으로 둔다(넘겨짚지 않는다).
  function cutSquash(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }

  function cutIdOf(list, field, name) {
    var t = String(name || '').replace(/^\s+|\s+$/g, ''), i;
    if (!t) return null;
    for (i = 0; i < list.length; i++) if (list[i][field] === t) return list[i].id;
    var q = cutSquash(t), hit = null;
    for (i = 0; i < list.length; i++) {
      if (cutSquash(list[i][field]) !== q) continue;
      if (hit !== null) return null;
      hit = list[i].id;
    }
    return hit;
  }

  function productIdOf(name) { return cutIdOf(productList, 'item_name', name); }

  function clientIdOf(name) { return cutIdOf(clientList, 'client_name', name); }   // 미일치 = free-text 폴백

  // ── ★작업 폴더 산출 — EPS + DXF 같은 이름 쌍 (2026-08-02 · spec §2.7) ──
  // 실물 작업 폴더는 판마다 `(자재+후가공)품목(<W>x<H>-<N>장)` 로 **EPS 와 DXF 가 확장자만 다른 쌍**이다.
  // 규격은 **판 전체 크기이고 단위는 cm**(파일명 `103x206` ↔ EPS 바운딩박스 1030×2060mm 로 확인).
  // 자재·후가공 후보는 6~7월 작업 폴더명에서 실제로 쓰인 값을 빈도순으로 뽑은 것이다(지어내지 않았다).
  // ★자재·후가공 목록은 **config 에서 온다**(2026-09-01). 전엔 여기 15개·7개가 박혀 있었고,
  //   그러면 MES 에서 뭘 바꿔도 패널 5축을 다시 배포해야 반영됐다 — 목록 하나 고치자고 전 PC 를 도는 구조.
  //   ⚠️ 박혀 있던 7개는 **근거가 없었다**(용준님 확인: 사람이 정한 게 아니라 나열된 것). prod 실측으로도
  //      order_items 23,162행 중 마감·후가공이 기록된 행이 **0** 이라 데이터로 고를 수도 없었다.
  //      → 내용을 지금 확정하지 않는다. 자리만 옮겨 두면 이후로는 MES 에서 고치고 패널은 따라온다.
  //   ⚠️ 「돔보」는 목록에 두지 않는다 — 이미 [돔보] 체크박스가 있고 `TRIM` 으로 나간다(같은 사실 두 곳 금지).
  var MATERIALS = [];   // config.materials (item_type='MATERIAL') — 품목 매핑이 없을 때의 폴백
  var FINISHES = [];    // config.post_processing 중 코팅 계열 — 재단이 파일명에 남길 표식
  var lastNest = null;     // {wCm, hCm, n} — 파일명 규격의 출처

  function fillDatalist(id, arr) {
    var dl = document.getElementById(id);
    if (!dl) return;
    dl.innerHTML = '';
    for (var i = 0; i < arr.length; i++) {
      var o = document.createElement('option');
      o.value = arr[i];
      dl.appendChild(o);
    }
  }

  /**
   * ★목록 달린 칸의 한글 입력 대비책 (2026-08-31) — **원인으로 확인된 것이 아니다.**
   *
   * "거래처 칸에 한글이 안 들어간다" 는 보고를 받고 `<input list=...>` 의 자동완성 팝업이
   * IME 조합을 가로챈다고 보아 넣었다. 그런데 그 뒤 실측이 이 가설을 **뒷받침하지 않았다**:
   *   · CDP 로 조합을 주입하면 **목록이 붙은 채로도** 한글이 정상 확정된다(수정 없는 0.62.0 에서 확인).
   *   · ★실제 타이핑 기록에 **composition 이벤트가 하나도 없다** — CEF 가 자모를 곧장
   *     `beforeinput`/`input` 으로 준다(`keydown` 의 key 는 `Process`). 그래서 이 함수는 **발동하지 않는다.**
   * 증상은 패널을 닫았다 여니 사라졌다 → 실제 원인은 **패널 창이 OS 키보드/IME 포커스를 잃은 것**에
   * 가깝다. 그쪽은 DOM 밖이라 자동으로 재현·관찰할 수단이 없다.
   *
   * 남겨 두는 이유 = composition 이벤트가 오는 환경(다른 IME·다른 CEF)에서는 여전히 옳은 처리이고,
   * 속성을 뗐다 붙이는 것뿐이라 무해하다.
   * ⚠️ **이 코드를 "그 버그를 고친 것"으로 인용하지 말 것.** 한글이 안 들어가면 먼저 패널을 다시 연다.
   */


  /** 파일 이름에 못 쓰는 문자만 걷어낸다 — 한글은 그대로 둔다(경로는 파일 경유라 ASCII 제약이 없다). */
  function safeName(s) {
    return String(s == null ? '' : s).replace(/[\\/:*?"<>|]/g, '_').replace(/^\s+|\s+$/g, '');
  }

  /** `거래처-(자재+후가공)내용(WxH-N장)` — 빠진 값은 건너뛴다(부분 입력에서도 쓸 수 있게). */
  /** @param idx 판 번호(0부터). 생략하면 대표 이름(첫 판 규격·순번 없음) — 화면 미리보기용. */
  function pairBaseName(idx) {
    if (!lastNest) return '';
    // ★거래처를 맨 앞에 둔다(2026-08-28 용준님). A0 규약 `[거래처]-[규격]-[내용]-…` 과 같은 자리다.
    //   폴더에 파일이 쌓였을 때 **먼저 눈에 들어와야 하는 축이 거래처**이고, 정렬도 거래처로 묶인다.
    //   ⚠️ 매칭은 안 깨진다 — `resolveCard` 2차는 **이름 전체 일치**이고, 그 이름은 흡수 시점에
    //      이 함수가 만든 값을 그대로 배운다(workbench.ts). 1차(주문번호-순번)는 비anchored라 접두 무관.
    var client = safeName((document.getElementById('regClient') || {}).value);
    var mat = safeName((document.getElementById('regMaterial') || {}).value);
    var fin = safeName((document.getElementById('regFinish') || {}).value);
    var item = safeName((document.getElementById('regItem') || {}).value);
    var head = client ? (client + '-') : '';
    if (mat || fin) head += '(' + mat + (mat && fin ? '+' : '') + fin + ')';
    // ★규격은 **실물 cm**(lastNest 가 이미 실물). 축소본이면 A0 와 같은 `_1-N` 접미를 붙인다
    //   (mes-a0-host.jsx: `epsName = ... + (sN > 1 ? '_1-' + sN : '')`) — 파일만 보고 축소본임을 알아야 한다.
    var sN = cutScaleN();
    // ★판이 여러 개면 **판마다 크기가 다르다** — 첫 판 규격을 돌려쓰면 파일명이 실물과 어긋난다.
    //   idx 를 주면 그 판의 실제 아트보드 크기로 규격을 만든다(호스트가 판별로 돌려준 값).
    var spec;
    if (idx != null && lastNest.wh && lastNest.wh[idx]) spec = lastNest.wh[idx];
    else spec = lastNest.wCm + 'x' + lastNest.hCm;
    var seq = (lastNest.sheets > 1 && idx != null) ? ('-' + (idx + 1) + 'p') : '';
    return head + item + '(' + spec + '-' + lastNest.n + '장)' + seq + (sN > 1 ? ('_1-' + sN) : '');
  }

  function refreshPairName() {
    var el = document.getElementById('pairName');
    var btn = document.getElementById('btnExportPair');
    var base = pairBaseName();
    if (el) {
      el.textContent = base || '— 네스팅 후 자동으로 만들어집니다';
      // 실물은 판마다 파일이 따로다 — 판이 여러 개면 이름 뒤에 -1p·-2p 가 붙고 규격도 판마다 다르다
      if (base && lastNest && lastNest.sheets > 1) el.textContent = base + '  (판 ' + lastNest.sheets + '개 · -1p/-2p)';
    }
    if (btn) {
      btn.disabled = !base || hostBusy;
      btn.title = base ? ('작업 폴더를 고르면 ' + base + '.eps / .dxf 로 저장합니다') : '네스팅을 먼저 실행하세요';
    }
  }

  function exportPair() {
    if (hostBusy) return;
    var base = pairBaseName();
    if (!base) { out('네스팅을 먼저 실행하세요.', 'err'); return; }
    setBusy(true);
    out('잠금 확인 중...');
    host('mesCut_acquireLock("' + PANEL_OWNER + '","export-pair")', function (lk) {
      if (lk.indexOf('busy:') === 0) { setBusy(false); out('다른 쪽이 일러를 점유 중입니다: ' + lk.substring(5), 'err'); return; }
      // ★이름·경로가 한글이라 evalScript 인자로 못 넘긴다 → params 파일(UTF-8) 경유(등록과 같은 방식)
      host('mesCut_paramsPath()', function (pp) {
        // ★판 수만큼 이름을 보낸다 — 판마다 크기가 달라 이름이 다르고, 같으면 뒤 판이 앞 판을 덮어쓴다
        var nSheets = (lastNest && lastNest.sheets > 1) ? lastNest.sheets : 1;
        var nameLines = [];
        for (var pi = 0; pi < nSheets; pi++) nameLines.push('NAME ' + pairBaseName(nSheets > 1 ? pi : null));
        var w = window.cep.fs.writeFile(pp, nameLines.join('\n'), window.cep.encoding.UTF8);
        if (!w || w.err !== 0) { fin2('params 쓰기 실패', 'err'); return; }
        out(nSheets > 1 ? ('작업 폴더를 고르세요 (판 ' + nSheets + '개 저장)...') : '작업 폴더를 고르세요...');
        host('mesCut_exportPair()', function (r, bad) {
          if (!bad && r.indexOf('cancel') === 0) { fin2('취소했습니다.', null); return; }
          if (bad || r.indexOf('ok;') !== 0) { fin2('내보내기 실패: ' + r, 'err'); return; }
          var d = kv(r.substring(3));
          var plates = parseInt(d.plates, 10) || 1;
          var nEps = parseInt(d.eps, 10) || 0, nDxf = parseInt(d.dxf, 10) || 0;
          var allOk = (nEps >= plates && nDxf >= plates);
          fin2('작업 폴더에 저장했습니다 — ' + (plates > 1 ? ('판 ' + plates + '개') : base)
            + '\nEPS ' + nEps + '/' + plates + ' · DXF ' + nDxf + '/' + plates
            + (d.dxfitems ? (' (칼선 ' + d.dxfitems + '개)') : '')
            + (plates > 1 ? ('\n판마다 이름 뒤에 -1p·-2p 가 붙습니다(크기가 서로 달라 규격도 각각입니다).') : '')
            + (allOk ? '' : '\n⚠ 일부 판이 저장되지 않았습니다 — 폴더 권한·이름 중복을 확인하세요.')
            + '\n※ 폴더 경로는 패널이 읽지 못합니다(한글) — 고른 폴더를 확인하세요.',
            allOk ? 'ok' : 'err');
        });
      });
    });
    function fin2(msg, kind) {
      host('mesCut_releaseLock("' + PANEL_OWNER + '")', function () {
        setBusy(false); refreshLock(); if (msg) out(msg, kind);
      });
    }
  }

  var nestReady = false;   // 네스팅을 돌린 뒤에만 등록할 수 있다
  function setNestReady(on) {
    nestReady = !!on;
    var b = document.getElementById('btnRegister');
    if (b) {
      b.disabled = !on;
      b.title = on ? '네스팅 시트를 주문서 대기함으로 보냅니다' : '네스팅을 먼저 실행하세요';
    }
  }

  function registerNest() {
    if (hostBusy || !nestReady) return;
    var name = (document.getElementById('regClient') || {}).value || '';
    name = String(name).replace(/^\s+|\s+$/g, '');
    if (!name) { out('거래처를 입력하세요.', 'err'); return; }
    var qty = num('regQty', 1);
    var wsel = document.getElementById('regWorker');
    var workerId = wsel && wsel.value ? wsel.value : '';
    var workerName = '';
    if (workerId) for (var i = 0; i < workerList.length; i++) if (String(workerList[i].id) === workerId) workerName = workerList[i].name;

    setBusy(true);
    out('등록 중...');
    host('mesCut_acquireLock("' + PANEL_OWNER + '","register")', function (lk) {
      if (lk.indexOf('busy:') === 0) { setBusy(false); out('다른 쪽이 일러를 점유 중입니다: ' + lk.substring(5), 'err'); return; }
      // 등록 정보는 한글이라 evalScript 인자로 못 넘긴다 → params 파일(UTF-8) 경유(A0 와 같은 방식)
      // ★KEYWORD = [품목] 입력(2026-08-05). 여태 안 보내서 대기물 keyword 가 **항상 비어 있었고**,
      //   주문서 라인의 '내용'도 비어 카드·출력 파일명에 식별 정보가 하나도 안 실렸다
      //   (파일명 규약에서 이미 품목이 내용 자리를 쓴다 — [거래처]-[규격]-[내용]-…).
      //   host 는 예전부터 R.KEYWORD 를 읽고 있었다(mes-cut-host.jsx manifest keyword) — 보내는 쪽만 없었다.
      var keyword = (document.getElementById('regItem') || {}).value || '';
      keyword = String(keyword).replace(/^\s+|\s+$/g, '');
      // ★★등록 이름 = **작업 폴더에 나갈 이름 그대로** (2026-08-27).
      //   여태 등록 EPS 는 `거래처-WxH-NEA-nest.eps` 였고, 실제 작업 파일은
      //   `(자재+후가공)품목(WxH-N장)` 이라 **두 갈래**였다. 그래서 RIP 가 보는 이름을
      //   시스템이 전혀 몰랐고, 출력완료 매칭이 **0%** 였다
      //   (실측 2026-08-26: 8월 print_events 5,554건 중 카드 매칭 0 · 작업파일 962건에 주문코드 0).
      //   패널은 그 이름을 이미 계산해 화면에 띄우고 있었다(pairBaseName) — 보내지 않았을 뿐이다.
      //   ⇒ 등록 파일명을 실물 규약으로 통일하면 나중에 **흡수 시점에** 그 이름을 배울 수 있다.
      //   (파싱하는 곳이 없음을 확인하고 바꿨다 — 'EA-nest' 를 읽는 코드는 호스트 자신뿐이었다)
      var nSheetsR = (lastNest && lastNest.sheets > 1) ? lastNest.sheets : 1;
      var lines = [
        'CLIENT ' + name,
        'CLIENTID ' + (clientIdOf(name) == null ? '' : clientIdOf(name)),
        'QTY ' + Math.max(1, Math.round(qty)),
        'WORKER ' + workerName,
        'WORKERID ' + workerId,
        'KEYWORD ' + keyword,
        // 품목 id — 대기함→주문서가 품목과 **단가까지** 채우는 열쇠(미해소면 빈 값)
        'ITEMID ' + (productIdOf((document.getElementById('regProduct') || {}).value) || ''),
        // ★자재·후가공 — 화면에 이미 받아 두고 manifest 에는 안 보내던 값
        'MATERIAL ' + String((document.getElementById('regMaterial') || {}).value || '').replace(/^\s+|\s+$/g, ''),
        'FINISH ' + String((document.getElementById('regFinish') || {}).value || '').replace(/^\s+|\s+$/g, ''),
        // ★돔보 — 판에는 **항상** 들어간다(index.html "돔보·시트 재단선은 항상 포함").
        //   호스트는 여태 manifest 에 `trim:false` 를 **하드코딩**해 사실과 다른 값을 보냈다.
        'TRIM 1',
      ];
      for (var pn = 0; pn < nSheetsR; pn++) lines.push('NAME ' + pairBaseName(nSheetsR > 1 ? pn : null));
      host('mesCut_regPath()', function (rp) {
        var w = window.cep.fs.writeFile(rp, lines.join('\n'), window.cep.encoding.UTF8);
        if (!w || w.err !== 0) { fin('등록정보 쓰기 실패: ' + rp, 'err'); return; }
        host('mesCut_nestRegister()', function (res, bad) {
          if (bad || res.indexOf('ok;') !== 0) { fin('등록 실패: ' + res, 'err'); return; }
          var n = kv(res.substring(3)).folders;
          fin('주문서 대기함으로 보냈습니다 — ' + n + '건\n'
            + '거래처 ' + name + ' · 수량 ' + Math.max(1, Math.round(qty))
            + '\n파일명 ' + pairBaseName(nSheetsR > 1 ? 0 : null) + (nSheetsR > 1 ? (' 외 ' + (nSheetsR - 1) + '판') : '')
            + '\n에이전트가 자동으로 올립니다. 주문서에서 불러 쓰세요.', 'ok');
        });
      });
    });

    function fin(msg, kind) {
      host('mesCut_releaseLock("' + PANEL_OWNER + '")', function () {
        setBusy(false); refreshLock(); out(msg, kind);
      });
    }
  }

  // ★[◎ 전체] — 문서 최상위 개체를 전부 고른다(문서 변경 없음). 호스트 구버전이면 사유를 말한다.
  var SELALL_MIN_HOST = [0, 24, 0];
  function selectAllTop() {
    if (hostBusy) return;
    if (!hostAtLeast(SELALL_MIN_HOST)) {
      out('호스트가 구버전(' + (hostVersion || '?') + ')이라 [◎ 전체]를 쓸 수 없습니다 — Z: 의 mes-cut-host.jsx 를 배포하세요.', 'err');
      return;
    }
    out('문서 전체를 고르는 중...');
    host('mesCut_selectAllTop()', function (r, bad) {
      if (bad || r.indexOf('ok;') !== 0) { out(String(r).replace(/^ERROR\s*/, ''), 'err'); return; }
      var n = kv(r.substring(3)).n;
      refresh();
      out('최상위 개체 ' + n + '개를 골랐습니다.'
        + '\n※ 한 개체 안에 여러 디자인이 뭉쳐 있으면 이걸로는 안 나뉩니다 — 그때는 일러에서 직접 고르세요.'
        + '\n(잠긴·숨은 것은 제외했습니다)', 'ok');
    });
  }
  var btnSelAll = $('btnSelectAll');
  if (btnSelAll) btnSelAll.addEventListener('click', selectAllTop);

  // ── 이벤트 ───────────────────────────────────────────────────────
  var btnReg = $('btnRegister');
  if (btnReg) btnReg.addEventListener('click', registerNest);

  // ── ★설명 접기 (2026-08-03 용준님: "실사용시에는 설명이 너무 많다") ──────
  // 지우지 않고 접는다 — 함정 설명이 사라지면 같은 질문이 반복된다. 기본은 **접힘**이고
  // 선택은 기억한다(패널을 다시 열 때마다 다시 접는 건 그것대로 성가시다).
  var HINT_KEY = 'mesCutHints';
  function applyHints(show) {
    var root = document.querySelector('.panel');
    if (root) root.className = show ? 'panel' : 'panel no-hints';
    var b = document.getElementById('btnHelp');
    if (b) b.title = show ? '설명 숨기기' : '설명 보기';
  }
  function hintsOn() {
    try { return window.localStorage.getItem(HINT_KEY) === '1'; } catch (e) { return false; }
  }
  applyHints(hintsOn());
  var btnHelp = $('btnHelp');
  if (btnHelp) btnHelp.addEventListener('click', function () {
    var next = !hintsOn();
    try { window.localStorage.setItem(HINT_KEY, next ? '1' : '0'); } catch (e) {}
    applyHints(next);
  });

  // ── 조각 수량 (2026-08-06) ────────────────────────────────────────────
  // 같은 그림 N장을 파일에서 손으로 복사하는 대신 수량으로 지시한다.
  //   ★핵심 = 배치에 **같은 조각 객체를 N번 넣는다**. nesting.js 의 회전·팩 캐시가 객체 참조를
  //     키로 쓰므로(getCand: cache.get(src)) 굽기도 캐시도 1회분이다. 복사는 N회 굽는다.
  //   ★params 의 `I` 줄은 조각 id 를 싣고 호스트는 그 원본을 배치마다 duplicate 한다 —
  //     같은 id 가 여러 번 나와도 이미 성립한다(구조 변경 불요).
  //   ⚠️ 목록은 **불러온 시점의 선택**이다. 네스팅 실행은 nestBegin 을 다시 부르므로 그 사이
  //      선택이 바뀌면 개수가 어긋난다 → 그때는 수량을 버리고 전부 1개로 가고 **알린다**.
  var pieceQty = null;   // { sizes:[], qty:[] } · null = 안 불러옴(전부 1개)
  function renderPieceQty() {
    var box = $('pieceQtyBox');
    if (!box) return;
    if (!pieceQty) { box.className = 'queuebox hidden'; box.innerHTML = ''; return; }
    box.className = 'queuebox';
    box.innerHTML = '';
    for (var i = 0; i < pieceQty.sizes.length; i++) {
      var row = document.createElement('div');
      row.className = 'qrow';
      var n = document.createElement('span'); n.className = 'qn'; n.textContent = '#' + (i + 1);
      var meta = document.createElement('span'); meta.className = 'qmeta';
      meta.textContent = String(pieceQty.sizes[i]).replace('x', ' × ') + ' mm';
      var q = document.createElement('input');
      q.className = 'qqty'; q.type = 'text'; q.value = String(pieceQty.qty[i]);
      q.setAttribute('data-i', String(i));
      q.addEventListener('input', function () {
        var k = parseInt(this.getAttribute('data-i'), 10);
        var v = parseInt(this.value, 10);
        pieceQty.qty[k] = (isNaN(v) || v < 1) ? 1 : Math.min(999, v);
      });
      row.setAttribute('data-i', String(i));
      row.addEventListener('click', function (ev) {
        if (ev.target && ev.target.className === 'qqty') return;   // 수량 칸 클릭은 편집이다
        var k = parseInt(this.getAttribute('data-i'), 10);
        var rows = this.parentNode.getElementsByClassName('qrow');
        for (var z = 0; z < rows.length; z++) rows[z].className = 'qrow';
        this.className = 'qrow sel';
        // ★목록은 그대로 두고 **보여주기만** 한다. 선택이 1개로 바뀌지만 실행 때
        //   nestBegin(1) 로 잡아 둔 목록을 재사용하므로 수량이 날아가지 않는다.
        host('mesCut_nestSelect(' + k + ')', function () {});
      });
      row.appendChild(n); row.appendChild(meta); row.appendChild(q);
      box.appendChild(row);
    }
  }
  function loadPieceQty() {
    if (hostBusy) return;
    setBusy(true);
    out('조각 확인 중...');
    host('mesCut_nestBegin()', function (bg, bad) {
      if (bad || bg.indexOf('ok;') !== 0) { setBusy(false); out('조각 확인 실패: ' + bg, 'err'); return; }
      host('mesCut_nestSizes()', function (sz, bad2) {
        setBusy(false);
        if (bad2 || sz.indexOf('ok;') !== 0) { out('조각 크기 조회 실패: ' + sz, 'err'); return; }
        var list = sz.substring(3).split(',');
        var prev = pieceQty && pieceQty.qty;
        pieceQty = { sizes: list, qty: [] };
        for (var i = 0; i < list.length; i++) {
          // 같은 개수면 이전 수량을 지킨다 — 크기만 다시 재려고 눌렀을 때 입력이 날아가면 성가시다
          pieceQty.qty.push((prev && prev.length === list.length) ? prev[i] : 1);
        }
        renderPieceQty();
        out('조각 ' + list.length + '개 — 수량을 넣고 [네스팅 실행]을 누르세요.', 'ok');
      });
    });
  }
  // ★버튼을 따로 두지 않는다 (2026-08-06 용준님 지적) — [문서 ↻] 가 '지금 고른 것을 다시
  //   읽는다'는 같은 일을 이미 한다. ↻ 가 두 개면 무엇이 다른지 알 수 없다. refresh 가 목록까지 만든다.

  /** prep.pieces 를 수량만큼 늘린다. 반환 = 사용자에게 알릴 메모(빈 문자열이면 알릴 것 없음). */
  function expandByQty(prep) {
    if (!pieceQty) return '';
    if (pieceQty.qty.length !== prep.pieces.length) {
      // 조용히 1개로 떨어지면 "수량을 넣었는데 1장만 나왔다"가 된다 — 반드시 말한다.
      var msg = '\n⚠ 조각 수량 목록(' + pieceQty.qty.length + '개)이 지금 선택(' + prep.pieces.length
        + '개)과 달라 **전부 1개**로 배치했습니다 — [↻ 불러오기]를 다시 누르세요.';
      pieceQty = null; renderPieceQty();
      return msg;
    }
    var total = 0, expanded = [], ink = 0;
    for (var i = 0; i < prep.pieces.length; i++) {
      var q = pieceQty.qty[i] || 1;
      total += q;
      for (var k = 0; k < q; k++) { expanded.push(prep.pieces[i]); ink += (prep.pieces[i].ink || 0); }
    }
    // ★목록을 불러온 상태면 **전부 1장이어도 그 사실을 말한다.** 불러온 뒤에는 일러에서 선택을
    //   바꿔도 이 목록이 쓰이므로(nestBegin(1)), 조용히 두면 "선택을 바꿨는데 왜 그대로냐"가 된다.
    if (total === prep.pieces.length) {
      return '\n조각 수량 목록 사용 — ' + total + '종 각 1장 (선택을 바꿨다면 [↻ 불러오기])';
    }
    prep.pieces = expanded;
    prep.rawInkPx = ink;                            // 효율%는 늘어난 잉크 기준이어야 한다
    return '\n조각 수량 반영 — 원본 ' + pieceQty.qty.length + '종 → 배치 ' + total + '장'
      + ' (선택을 바꿨다면 [↻ 불러오기])';
  }

  var btnPair = $('btnExportPair');
  if (btnPair) btnPair.addEventListener('click', exportPair);
  // 거래처·자재·후가공·내용을 고칠 때마다 파일명 미리보기를 갱신한다 — 저장 직전에야 이름을 알면 늦다
  // ★regClient 를 빠뜨리면 거래처가 파일명 맨 앞에 오는데 **미리보기만 옛 이름**으로 남는다.
  var pairIds = ['regClient', 'regMaterial', 'regFinish', 'regItem'];
  for (var pi = 0; pi < pairIds.length; pi++) {
    var pel = document.getElementById(pairIds[pi]);
    if (pel) { pel.addEventListener('input', refreshPairName); pel.addEventListener('change', refreshPairName); }
  }
  // 품목 → 자재 좁히기. input 까지 거는 이유 = 자동완성 선택이 change 를 안 낼 수 있다(datalist).
  var pEl = document.getElementById('regProduct');
  if (pEl) { pEl.addEventListener('input', narrowMaterials); pEl.addEventListener('change', narrowMaterials); }

  var btnNest = $('btnNest');
  if (btnNest) btnNest.addEventListener('click', runNest);

  var btnWidth = $('btnWidth');
  if (btnWidth) btnWidth.addEventListener('click', recommendWidth);

  var btnMake = $('btnMakeCut');
  if (btnMake) btnMake.addEventListener('click', makeCut);

  var btnRefresh = $('btnRefresh');
  if (btnRefresh) btnRefresh.addEventListener('click', function () {
    refresh();
    // 선택이 있으면 조각 목록까지 만든다. 없으면 조용히 넘어간다 — 문서 정보만 보려고 누를 때가 많다.
    host('mesCut_selectionInfo()', function (si) {
      if (si && si !== 'none' && si !== 'nodoc') loadPieceQty();
    });
  });

  var btnProbe = $('btnLockProbe');
  if (btnProbe) btnProbe.addEventListener('click', function () {
    host('mesCut_lockProbe()', function (res) {
      if (elLock) elLock.textContent = (res === 'none') ? '없음' : res;
      if (res !== 'none') { out('점유 중: ' + res, 'ok'); return; }
      host('mesCut_lockPath()', function (p) {
        out('잠금 없음 — 지금 작업해도 됩니다.\n잠금 파일: ' + p, 'ok');
      });
    });
  });

  var btnLock = $('btnLockTest');
  if (btnLock) btnLock.addEventListener('click', function () {
    host('mesCut_acquireLock("' + PANEL_OWNER + '","probe")', function (res) {
      refreshLock();
      if (res.indexOf('busy:') === 0) { out('다른 쪽이 점유 중: ' + res.substring(5), 'err'); return; }
      out('잠금 획득 (TTL 10분 · 죽어도 자동 회수됩니다)', 'ok');
    });
  });

  var btnUnlock = $('btnUnlock');
  if (btnUnlock) btnUnlock.addEventListener('click', function () {
    host('mesCut_releaseLock("' + PANEL_OWNER + '")', function (res) {
      refreshLock();
      out(res.indexOf('notowner:') === 0 ? ('남의 잠금이라 풀지 않았습니다: ' + res) : '해제됨', res.indexOf('notowner:') === 0 ? 'err' : 'ok');
    });
  });

  var btnForce = $('btnForceUnlock');
  if (btnForce) btnForce.addEventListener('click', function () {
    if (!window.confirm('다른 패널이 작업 중이어도 잠금을 강제로 풉니다.\n정말 진행할까요?')) return;
    host('mesCut_forceUnlock()', function () { refreshLock(); out('강제 해제됨', 'ok'); });
  });

  // 타공 입력은 체크했을 때만 — 꺼진 값이 조용히 반영되는 경로를 만들지 않는다(A0 '숨은 키워드' 교훈).
  //   2026-08-06: 잠그는 데 더해 **숨긴다**. 꺼져 있을 때 못 쓰는 칸 2개와 단위 2개가 계속 자리를
  //   차지했다. 잠금(disabled)은 그대로 유지한다 — 숨김만으로는 값이 그대로 실려 나간다.
  function punchUi() {
    var on = !!(elPunch && elPunch.checked);
    var c = document.getElementById('punchCount'), i = document.getElementById('punchInset');
    if (c) { c.disabled = !on; c.style.display = on ? '' : 'none'; }
    if (i) { i.disabled = !on; i.style.display = on ? '' : 'none'; }
    // 단위 라벨(개·mm 안쪽)도 같이 — 입력만 숨기면 단위만 떠서 더 이상해진다.
    var row = elPunch && elPunch.closest ? elPunch.closest('.row') : null;
    if (row) {
      var units = row.getElementsByClassName('unit');
      for (var u = 0; u < units.length; u++) units[u].style.display = on ? '' : 'none';
    }
  }
  if (elPunch) elPunch.addEventListener('change', punchUi);
  punchUi();

  // ── 초기화 ───────────────────────────────────────────────────────
  applyGates();
  loadConfig();
  // 초기 1회 — config 로드 전에는 빈 목록이다(loadConfig 가 채운다). 비어 있어도 자유 입력은 된다.
  fillDatalist('materialList', MATERIALS);
  fillDatalist('finishList', FINISHES);
  host('mesCut_ping()', function (res, bad) {
    if (elVer) elVer.textContent = 'shell ' + SHELL_VERSION + ' · host ' + res;
    if (bad) { out(res + '\nZ: 연결과 mes-cut-host.jsx 배포를 확인하세요.', 'err'); return; }
    setHostVersion(res);
    applyGates();   // ★버전을 안 뒤 다시 — 초기 applyGates() 는 ping 이전이라 항상 '구버전'으로 보인다
    // ★Z: 배포본과 대조 — 배포했는데 패널을 안 다시 연 상태를 여기서 잡는다(2026-08-31)
    checkHostFresh(function () {
      var note = staleNote();
      out('준비됨 — P0 골격입니다. 칼선 생성은 P1 에서 켜집니다.'
        + (hostSupportsCurve() ? '' : '\n⚠ 호스트가 구버전(' + res + ')이라 곡선 칼선을 끕니다 — 직선으로 만듭니다.')
        + (note ? ('\n\n' + note) : ''), note ? 'err' : '');
      refresh();
    });
  });

  // 패널로 포커스가 돌아올 때 1회 갱신. 폴링하지 않는다 —
  // 무거운 문서에서 COM wedge 를 되살릴 수 있다(A0 2026-07-30 판단).
  //
  // ★병합 후 추가 조건 = **재단 탭이 보일 때만**(2026-08-04). 합치기 전에는 창이 뜨면 곧 재단 작업이었지만
  //   이제는 가공 탭을 쓰는 동안에도 이 핸들러가 돈다. 그러면 포커스가 돌아올 때마다 A0 와 재단이
  //   **동시에** 호스트를 찔러 무거운 문서에서 COM 이 밀린다. 안 보이는 탭은 갱신할 이유도 없다.
  window.addEventListener('focus', function () {
    if (hostBusy) return;
    if (document.body.getAttribute('data-main') !== 'cut') return;
    checkHostFresh();   // ★배포는 패널을 열어 둔 채 일어난다 — 포커스가 돌아올 때 한 번 대조한다
    refresh();
  });

  // 재단 탭으로 처음 들어올 때 1회 갱신 — 패널을 열자마자 재단으로 가면 문서 정보가 비어 있다.
  // (부팅 시의 refresh() 는 그대로 두었다. 가공 탭에서 시작해도 첫 진입 때 최신값이 필요하다.)
  document.addEventListener('mes:mainTab', function (e) {
    if (!e || !e.detail || e.detail.tab !== 'cut') return;
    if (!hostBusy) refresh();
  });
})();
