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
  var SHELL_VERSION = '0.20.0';
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
  function cutScaleN() {
    var el = document.getElementById('cutScale');
    var n = el ? parseInt(el.value, 10) : 1;
    return (n > 0 && !isNaN(n)) ? n : 1;
  }
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
  function hostAtLeast(min) {
    var m = /CUT-CEP-(\d+)\.(\d+)\.(\d+)/.exec(hostVersion || '');
    if (!m) return false;   // 못 읽으면 못 받는 것으로 본다(안전한 쪽)
    for (var i = 0; i < 3; i++) {
      var a = parseInt(m[i + 1], 10), b = min[i];
      if (a !== b) return a > b;
    }
    return true;
  }
  function hostSupportsCurve() { return hostAtLeast(CURVE_MIN_HOST); }
  function hostSupportsVector() { return hostAtLeast(VEC_MIN_HOST); }
  function hostSupportsBakeAll() { return hostAtLeast(BAKEALL_MIN_HOST); }
  function hostSupportsBleedPng() { return hostAtLeast(BLEEDPNG_MIN_HOST); }

  // ── ★칼선 방식 (2026-08-01) ──────────────────────────────────────
  // 벡터 = 일러가 실루엣을 직접 오프셋한다. 래스터 왕복(굽기→임계→픽셀 계단→곡선 복원)이 없으므로
  // 근사 오차 자체가 생기지 않는다. 실측(같은 좌표계 점 단위 대조, 2026-08-01):
  //   래스터 칼선은 실루엣 안팎을 **100mm당 7.5~10.6회 · 진폭 ±0.4~0.5mm** 로 넘나든다.
  //   면적차는 0.2~0.7% 뿐이라 **면적·bbox 게이트로는 안 잡히고** 눈에만 보인다.
  // ⚠️ 벡터 결과를 단순화·재피팅으로 다듬지 않는다 — 실측에서 전부 악화됐다(spec §6.29).
  /** 반환 {vector, note} — 요청을 호스트 능력으로 깎는다 */
  function resolveLineMode() {
    var el = document.getElementById('lineMode');
    var want = el ? el.value : 'vector';
    if (want !== 'vector') return { vector: false, note: '' };
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
  var BUSY_IDS = ['btnRefresh', 'btnMakeCut', 'btnNest', 'btnWidth', 'btnRegister', 'btnExportPair', 'btnLockProbe', 'btnLockTest', 'btnUnlock'];

  function setBusy(on) {
    hostBusy = !!on;
    for (var i = 0; i < BUSY_IDS.length; i++) {
      var el = document.getElementById(BUSY_IDS[i]);
      if (el) el.disabled = !!on;
    }
    // 잠금 해제 후에는 각 버튼의 고유 게이트를 다시 적용한다(P1 에서 늘어난다).
    if (!on) applyGates();
  }

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
        ? '벡터 = 일러가 실루엣을 직접 오프셋합니다 (근사 오차 없음 · 물결 없음)'
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
      try {
        var d = ctx.getImageData(0, 0, cv.width, cv.height);
        cb(null, { W: cv.width, H: cv.height, ch: 4, data: d.data });
      } catch (eTaint) { cb('canvas 읽기 실패(보안): ' + eTaint, null); }
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
        host('mesCut_dxfPath()', function (dp) {
          host('mesCut_exportDxf("' + dp + '")', function (dx) {
            finish(msg + '\n' + (dx.indexOf('ok;') === 0 ? ('DXF: ' + dp) : ('DXF 실패: ' + dx)),
              dx.indexOf('ok;') === 0 ? 'ok' : 'err');
          });
        });
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
          // 저장 경로는 호스트가 정한다 — 작업 폴더 규칙이 확정되면 mesCut_dxfPath() 한 곳만 고치면 된다.
          host('mesCut_dxfPath()', function (dp) {
            host('mesCut_exportDxf("' + dp + '")', function (dx) {
              finish(msg + '\n' + (dx.indexOf('ok;') === 0 ? ('DXF: ' + dp) : ('DXF 실패: ' + dx)),
                dx.indexOf('ok;') === 0 ? 'ok' : 'err');
            });
          });
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

  // 롤 1장의 최대 길이. 배치 버퍼 크기와 해상도 예산이 **같은 값을 봐야** 한다.
  var NEST_ROLL_MAX_MM = 6000;
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
  var FINE_MM_PER_PX = 0.25;       // 굽기 격자 상한 — 이보다 곱게 구워도 이득이 없다(0.25 실측 오차 ≈ 0)
  var MAX_SUBPX = 4;               // 굽기 비용 상한(선형 4배 = 픽셀 16배)
  var DOWNSAMPLE_COVER = 0.5;      // 절반 이상 차면 잉크 — 안팎 편향이 없다
  var FINE_MASK_BUDGET_PX = 60e6;  // 조각 칼선용 미세 마스크 보관 상한(1바이트/px)

  /** 배치 격자 mmpp 에 대해 몇 배로 곱게 구울지 */
  function subPxFactor(mmpp) {
    return Math.max(1, Math.min(MAX_SUBPX, Math.round(mmpp / FINE_MM_PER_PX)));
  }

  /**
   * 굽힌 PNG → 배치 격자 마스크.
   * ⚠️ 임계를 올리면 **반투명 아트가 통째로 사라질** 수 있다 → 조각(연결요소) 수가 줄면
   *    낮은 임계로 되돌리고 그 사실을 호출자에게 알린다(조용히 잃는 것이 가장 나쁘다).
   * @returns {m, W, H, downgraded}
   */
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
    var ds = G.downsampleMask(use, img.W, img.H, factor, DOWNSAMPLE_COVER);
    // 축소 전 마스크도 돌려준다 — 조각 칼선은 이쪽에서 뽑아야 격자 한 칸만큼 뭉툭해지지 않는다
    return {
      m: ds.m, W: ds.W, H: ds.H, downgraded: downgraded,
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
    var s = G.snapResolution(base, 2 * half, sheetWmm, sheetHmm || toFileMm(NEST_ROLL_MAX_MM), NEST_MAX_PX);
    return { mmPerPx: s.mmPerPx, rPx: s.rPx, exact: s.exact, halfMm: half, safetyMm: safety };
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
    host('mesCut_nestBegin()', function (bg, bad) {
      if (bad || bg.indexOf('ok;') !== 0) { fail('대상 확정 실패: ' + bg); return; }
      var n = parseInt(kv(bg.substring(3)).n, 10) || 0;
      // ★1개도 받는다 — 실물 작업 파일 다수가 `-1장` 짜리다. 단품도 돔보가 있어야 자를 수 있으므로
      //   모아찍기(돔보·도련·EPS/DXF 포함)로 보내는 게 맞다(2026-08-03 용준님 판단).
      if (n < 1) { fail('조각이 없습니다 — 대상을 선택하세요.'); return; }
      // ★선 도안 판정은 **선택 전체에 대해 한 번** — 조각마다 다르게 굽으면 마스크 규칙이 섞인다
      host('mesCut_artKind()', function (kindStr) { prepareWith(resolveFill(kindStr, fillMode || 'auto')); });
      return;

      function prepareWith(fv) {
      // 여백이 팽창이면 그만큼 캔버스가 더 필요하다 — 부족하면 팽창분이 잘려 칼선이 조용히 틀린다
      var padMm = Math.max(offsetMm, 0) + gapMm + 1;
      // ★배치 격자보다 곱게 굽는다 — 거친 격자에서 바로 뜨면 경계가 최대 2mm 부푼다(실측).
      var sub = subPxFactor(rez.mmPerPx);
      var fineMmpp = rez.mmPerPx / sub;
      // ★칼선 반경(미세 px)은 **내림** — 칼선이 잉크 쪽으로 조금 더 붙어야 칼선끼리 간격이 부족해지지 않는다
      var cutFinePx = Math.floor(offsetMm / fineMmpp);
      var pieces = [], rawInkPx = 0, i = 0, softened = 0;
      // 굽기 경로가 바뀐 사유 — 조용히 느려지거나 조용히 달라지지 않게 결과에 싣는다.
      //   (makeCut 의 fallbackNote 는 **다른 함수의 지역 변수**다. 여기서 건드리면 안 된다)
      var bakeNote = '';
      // 미세 마스크 보관 예산 — 조각이 크고 많으면 메모리를 다 먹는다. 넘치면 그 조각만
      // 거친 마스크로 칼선을 뽑는다(정확도만 조금 떨어지고 결과는 나온다).
      var fineBudget = FINE_MASK_BUDGET_PX;
      /** 두 경로(순차·일괄)가 **같은 결과 묶음**을 넘긴다 — 갈라지면 한쪽만 조용히 달라진다. */
      function finishPrep() {
        cb({
          n: n, pieces: pieces, rawInkPx: rawInkPx, mmpp: rez.mmPerPx,
          rPx: rez.rPx, exact: rez.exact, sub: sub, fineMmpp: fineMmpp, softened: softened, safetyMm: rez.safetyMm,
          offsetMm: offsetMm, cutFinePx: cutFinePx, fillNote: fv.note, lineArt: fv.lineArt, fill: fv.fill,
          bakeNote: bakeNote,
        });
      }

      /** 구 호스트 폴백 — 조각마다 임시 문서를 만든다(조각당 4.07초, 2026-08-03 실측). */
      function next() {
        if (i >= n) { finishPrep(); return; }
        out('조각 굽는 중... ' + (i + 1) + '/' + n);
        host('mesCut_rasterizeItem(' + i + ',' + fineMmpp + ',' + padMm + ',' + (fv.fill ? 'true' : 'false') + ')', function (rz, bad2) {
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
        // ★효율%를 정직하게 내려면 **팽창 전** 잉크를 세 둬야 한다 —
        //   팽창된 마스크로 세면 조각이 작고 gap 이 클수록 크게 부풀려진다.
        for (var k = 0; k < em.m.length; k++) rawInkPx += em.m[k];
        // ★배치 마스크 = **여백 + 간격/2** 팽창 — 겹치지 않으면 칼선끼리 간격이 보장된다.
        //   반경은 **정수 px** 이어야 한다(소수부는 버려진다) → 스냅이 계산한 rPx 를 그대로 쓴다.
        var piece = {
          id: id, W: em.W, H: em.H, m: growMask(G, em.m, em.W, em.H, rez.rPx),
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
        host('mesCut_nestBakeAll(' + fineMmpp + ',' + padMm + ',' + (fv.fill ? 'true' : 'false') + ')', function (rz, badB) {
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

  // 조각 하나가 만드는 확장 캔버스 상한. 8SSEDT 는 Int32Array 2벌을 더 쓰므로 픽셀당 ~12바이트다
  // (12M px ≈ 144MB). 넘으면 그 조각만 건너뛰고 호스트가 단색으로 떨어진다 — **넘겼다고 알린다**.
  var BLEED_MAX_PX = 12e6;

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
    out('도련용 원색 굽는 중...');
    host('mesCut_nestBakeAll(' + mmpp + ',0,false,"ink")', function (rz, bad) {
      if (bad || String(rz).indexOf('ok;') !== 0) { cb({}, '원색 굽기 실패: ' + rz); return; }
      var rows = String(rz).split(/[\r\n]+/), list = [];
      for (var r = 1; r < rows.length; r++) {
        var t = rows[r].split(' ');
        if (t[0] !== 'P') continue;
        // P <idx> <w> <h> <ox> <oy> <path…> — 경로에 공백이 있을 수 있어 뒤를 전부 붙인다
        list.push({ id: parseInt(t[1], 10), path: t.slice(6).join(' ') });
      }
      if (!list.length) { cb({}, '구운 조각이 없습니다.'); return; }
      // temp 경로는 호스트만 안다 — 굽기 결과 경로에서 폴더를 떼어 쓴다(경로가 브릿지를 안 탄다)
      var dir = String(list[0].path).replace(/[^\/\\]+$/, '');
      var map = {}, skipped = 0, tooBig = 0, q = 0;
      (function step() {
        if (q >= list.length) {
          var note = '';
          if (tooBig) note = tooBig + '개 조각은 너무 커서 만들지 않았습니다(단색으로 대체).';
          else if (skipped) note = skipped + '개 조각을 만들지 못했습니다(단색으로 대체).';
          cb(map, note);
          return;
        }
        var it = list[q];
        out('도련 ' + (q + 1) + '/' + list.length);
        readPng(it.path, function (err, img) {
          if (err) { skipped++; q++; step(); return; }
          if ((img.W + 2 * padPx) * (img.H + 2 * padPx) > BLEED_MAX_PX) { tooBig++; q++; step(); return; }
          var res = null;
          try { res = B.repeatLastPixel(img, growPx); } catch (e) { res = null; }
          if (res && writeBleedPng(dir, it.id, res)) map[it.id] = { w: res.W * mmpp, h: res.H * mmpp };
          else skipped++;
          q++; step();
        });
      })();
    });
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
      rollMaxH: Math.floor(toFileMm(NEST_ROLL_MAX_MM) / prep.mmpp),
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
    var G = window.MesCutGeom, NST = window.MesCutNest;
    if (!G || !NST) { out('엔진 미로드(geometry.js·nesting.js) — 패널 설치본을 확인하세요', 'err'); return; }

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
    //   재단 오차가 나면 **옆 디자인 색이 넘어온다**. 재료보다 재단 사고가 비싸므로 간격을 올린다.
    //   (도련을 깎는 쪽은 택하지 않았다 — 도련 3mm 는 실물 규약이고 품질 쪽이다)
    var gapWanted = gapMm;
    // ★맞붙임(여백 0 · 간격 0)은 이 규칙에서 **뺀다**.
    //   간격을 올리는 이유는 "옆 조각 도련이 넘어와 남의 색이 보이는 것"인데, 맞붙임에서는
    //   도련이 넘어가도 **옆 조각 원본이 그 위를 덮는다**(도련은 SENDTOBACK 으로 조각 뒤에 깔린다).
    //   그래서 안쪽 경계에는 도련이 보이지 않고 **판 바깥 테두리에만** 남는다 — 명함 8up 이 하는 방식이다.
    //   여기서 간격을 올려 버리면 조각이 떨어져 칼선이 2줄이 되고 맞붙임 자체가 성립하지 않는다.
    var buttMode = (offsetMm <= 0 && gapMm <= 0);
    if (!buttMode && nestBleedMm > 0 && gapMm < nestBleedMm * 2) gapMm = nestBleedMm * 2;
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
        out('배치 계산 중...');
        var res = nestPlace(NST, prep, sheetWmm, sheetHmm, allowRot);
        if (!res.sheets.length) { done('배치 실패 — 조각이 시트보다 큽니다.', 'err'); return; }

        // ★시트 모드에서 판이 **가로로 길쭉해지는** 것을 막는다 (2026-08-05 실측: 판 면적 −22%).
        //   엔진 점수(nesting.js scoreOf)는 usedH(세로)만 본다. 그런데 아트보드는 배치 bbox 로
        //   줄어들므로 실제 재료·재단기 이동은 **가로×세로**다. 시트 폭이 남으면 세로가 안 늘어나는
        //   쪽이 늘 이겨서 조각을 옆으로만 늘어놓는다(실사용 8조각이 전부 같은 y 에 한 줄로 섰다).
        //   → 팽창 포함 잉크 면적에서 **정사각형에 가까운 폭**을 역산해 한 번 더 돌린다.
        //     점수 함수를 면적으로 바꾸는 것만으로는 안 된다(실측 −0.2%) — bottom-left 탐색이
        //     애초에 조밀한 후보를 만들지 못하므로, 폭을 좁혀 **탐색 공간 자체**를 바꿔야 한다.
        //   ⚠️ 롤은 폭이 곧 재료다. 세로만 줄이는 현행이 맞으므로 건드리지 않는다.
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
            var alt = nestPlace(NST, prep, guessW, sheetHmm, allowRot);
            var a0 = plateAreaMm2(res, prep), a1 = plateAreaMm2(alt, prep);
            // 조용히 나빠지지 않게 — 미배치가 늘거나 면적이 안 줄면 원래 배치를 그대로 쓴다
            if (alt.sheets.length && alt.unplaced.length <= res.unplaced.length && a1 < a0) {
              widthNote = '\n판 폭을 ' + Math.round(toRealMm(guessW)) + 'mm 로 좁혀 판 면적 ' + (100 * (1 - a1 / a0)).toFixed(0)
                + '% 절감 — 재단기가 도는 테두리도 그만큼 줄어듭니다.';
              res = alt;
            }
          }
        }

        var mmpp = prep.mmpp;
        // 조각 위치는 **실제 팽창분(rPx)을 되돌려** 원본 기준으로 준다.
        //   ⚠️ gap/2 를 그냥 쓰면 안 된다 — 팽창은 정수 px 이라 둘이 다를 수 있다.
        var half = prep.rPx * mmpp;
        // ★보장 간격은 **칼선끼리**다 — 디자인 사이(2×half)에서 양쪽 여백을 뺀 값.
        var cutOffMm = prep.cutFinePx * prep.fineMmpp;
        var guaranteedMm = 2 * half - 2 * cutOffMm;
        var lines = [];
        // ★배율을 호스트에 알린다 — 돔보 상수(6·17·60·500mm)가 호스트 안에 있어 거기서 ÷N 해야 한다.
        //   여백·간격·도련은 여기서 이미 환산했으므로 호스트가 또 나누면 두 번 줄어든다(호스트 주석 참조).
        if (scaleN > 1) lines.push('N ' + scaleN);
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
            if (wantPieceCut && !useVec) pieceCutLines(lines, res, prep, pl, mmpp, wantCurve);
          }
        }
        // ★도련 PNG 는 params 를 쓰기 **전에** 만든다 — 실제 크기(mm)를 `L` 줄로 실어야 하기 때문이다.
        //   호스트가 픽셀에서 mm 를 다시 계산하면 반올림만큼 어긋나고, 그 오차가 조각마다 다르게 나온다.
        var growMm = offsetMm + nestBleedMm;          // 인쇄는 칼선(=잉크+여백)보다 도련만큼 더 나가야 한다
        var wantBleedPng = useVec && nestBleedMm > 0 && growMm > 0;
        var bleedNote = '';
        if (wantBleedPng && !hostSupportsBleedPng()) {
          // ★조용히 옛 방식으로 떨어지지 않는다 — 링이 지저분해진 것을 인쇄 뒤에야 알게 된다.
          wantBleedPng = false;
          bleedNote = '\n※ 도련을 옛 방식(도형별 오프셋)으로 만들었습니다 — 호스트가 구버전입니다('
            + (hostVersion || '?') + '). Z: 의 mes-cut-host.jsx 를 갱신하세요.';
        }

        function afterBleed(bmap, note) {
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
          out('새 문서에 배치 중...');
          host('mesCut_nestApply(' + (useVec ? (offsetMm + ',' + (prep.fill ? 'true' : 'false') + ',' + nestBleedMm + ',"' + nestBleedMode + '"') : '') + ')', function (ap, bad3) {
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
              + (prep.fillNote || '') + (prep.bakeNote || '')
              + (prep.exact ? '' : ' ⚠ 해상도 한계로 올림 적용')
              + (allowRot ? ' · 회전 허용' : '')
              + '\n돔보 ' + (a.dombo || 0) + '판 — 별도 레이어(인쇄 ON) · 재단선 레이어는 인쇄 OFF'
              + (wantPieceCut ? (' · 조각별 칼선' + (useVec ? '(벡터)' : (wantCurve ? '(곡선)' : '(직선)'))) : '')
              + (useVec && nestBleedMm > 0 ? ('\n도련 ' + R(nestBleedMm) + 'mm (조각마다)'
                  // ★어느 방식으로 만들었는지 밝힌다 — 클립 확장·색 잇기·단색은 품질이 서로 다르다
                  + bleedHow(a)
                  // ★조용히 바꾸지 않는다 — 간격을 올렸으면 올렸다고 말한다
                  + (gapWanted < gapMm ? ' · 간격을 ' + R(gapWanted) + ' → ' + R(gapMm) + 'mm 로 올렸습니다(도련×2)' : '')
                  // ★도련이 조각별로 실패해도 판은 그려진다 — 조용히 넘기면 인쇄 뒤에야 안다(2026-08-04)
                  + (parseInt(a.bleedfail, 10) > 0
                    ? ('\n⚠ 도련 ' + a.bleedfail + '개 조각 실패 — ' + bleedFailWhy(a.bleedcode)) : '')
                  + bleedNote) : '')
              + widthNote
              + (res.unplaced.length ? ('\n⚠ 배치 못한 조각 ' + res.unplaced.length + '개 — 시트를 키우거나 간격을 줄이세요.') : '')
              + (useVec ? '' : cvN.note) + vecNote,
              (res.unplaced.length || parseInt(a.bleedfail, 10) > 0) ? 'err' : 'ok');
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
    var srcPiece = null;
    for (var pf = 0; pf < prep.pieces.length; pf++) if (prep.pieces[pf].id === pl.id) { srcPiece = prep.pieces[pf]; break; }
    if (!srcPiece) return;

    // ★칼선은 **미세 마스크**에서 뽑는다 — 배치 격자(거친)로 뽑으면 윤곽이 격자 한 칸(0.75mm)
    //   단위로 뭉툭해진다. 배치 좌표의 격자 오차는 **아트와 칼선이 함께 움직이므로 상쇄**된다
    //   → 아트가 놓이는 자리(`nestApply` 가 쓰는 값)를 기준으로 놓기만 하면 미세 격자 정확도가 된다.
    //   (거친 마스크 기준으로 놓으면 그 상쇄가 깨져 오히려 어긋난다)
    // ★칼선은 **여백**만큼만 벌린다 — 배치 팽창(여백 + 간격/2)과 다른 값이다.
    //   음수면 잉크 안쪽 = 도련이 이미 들어간 아트에서 칼선을 제자리에 놓는 경로.
    var useFine = !!(srcPiece.fine && prep.sub > 1);
    var src = useFine ? srcPiece.fine : srcPiece.base;
    if (!src) return;
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
    for (var ci = 0; ci < cps.length; ci++) {
      var parts = [], j;
      if (wantCurve) {
        var segs = G.fitCurves(cps[ci].poly, ctol);
        if (!segs.length) continue;
        var a0 = toMm(segs[0][0][0], segs[0][0][1]);
        parts.push(a0[0].toFixed(2) + ',' + a0[1].toFixed(2));
        for (j = 0; j < segs.length; j++) {
          for (var q = 1; q <= 3; q++) {
            var p = toMm(segs[j][q][0], segs[j][q][1]);
            parts.push(p[0].toFixed(2) + ',' + p[1].toFixed(2));
          }
        }
        lines.push('B ' + parts.join(' '));
      } else {
        var sp = G.simplify(cps[ci].poly, ctol);
        if (sp.length < 3) continue;
        for (j = 0; j < sp.length; j++) {
          var pt = toMm(sp[j][0], sp[j][1]);
          parts.push(pt[0].toFixed(2) + ',' + pt[1].toFixed(2));
        }
        lines.push('P ' + parts.join(' '));
      }
    }
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
        txt += best
          ? ('\n→ ' + best.w + 'mm 롤이 재료를 가장 적게 씁니다. 시트를 바꾼 뒤 [네스팅 실행]을 누르세요.')
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

  function clientIdOf(name) {
    var t = String(name || '').replace(/^\s+|\s+$/g, '');
    if (!t) return null;
    for (var i = 0; i < clientList.length; i++) if (clientList[i].client_name === t) return clientList[i].id;
    return null;   // 미일치 = free-text 폴백(서버가 이름으로 처리)
  }

  // ── ★작업 폴더 산출 — EPS + DXF 같은 이름 쌍 (2026-08-02 · spec §2.7) ──
  // 실물 작업 폴더는 판마다 `(자재+후가공)품목(<W>x<H>-<N>장)` 로 **EPS 와 DXF 가 확장자만 다른 쌍**이다.
  // 규격은 **판 전체 크기이고 단위는 cm**(파일명 `103x206` ↔ EPS 바운딩박스 1030×2060mm 로 확인).
  // 자재·후가공 후보는 6~7월 작업 폴더명에서 실제로 쓰인 값을 빈도순으로 뽑은 것이다(지어내지 않았다).
  var MATERIALS = ['솔벤시트', '솔벤현수막', 'UV후렉스-조', 'UV후렉스', 'UV그레이후렉스', 'UV시트',
    '포맥스3T', '포맥스5T', '포맥스2T', '솔벤그레이시트', '매쉬배너', '솔벤랩핑시트', '솔벤매쉬', '폼보드5T', 'UV현수막'];
  var FINISHES = ['자동바니쉬', '조', '돔보', '무광', '유광', '반컷팅', '바니쉬-양면'];
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

  /** 파일 이름에 못 쓰는 문자만 걷어낸다 — 한글은 그대로 둔다(경로는 파일 경유라 ASCII 제약이 없다). */
  function safeName(s) {
    return String(s == null ? '' : s).replace(/[\\/:*?"<>|]/g, '_').replace(/^\s+|\s+$/g, '');
  }

  /** `(자재+후가공)품목(WxH-N장)` — 빠진 값은 건너뛴다(부분 입력에서도 쓸 수 있게). */
  /** @param idx 판 번호(0부터). 생략하면 대표 이름(첫 판 규격·순번 없음) — 화면 미리보기용. */
  function pairBaseName(idx) {
    if (!lastNest) return '';
    var mat = safeName((document.getElementById('regMaterial') || {}).value);
    var fin = safeName((document.getElementById('regFinish') || {}).value);
    var item = safeName((document.getElementById('regItem') || {}).value);
    var head = '';
    if (mat || fin) head = '(' + mat + (mat && fin ? '+' : '') + fin + ')';
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
      var lines = [
        'CLIENT ' + name,
        'CLIENTID ' + (clientIdOf(name) == null ? '' : clientIdOf(name)),
        'QTY ' + Math.max(1, Math.round(qty)),
        'WORKER ' + workerName,
        'WORKERID ' + workerId,
        'KEYWORD ' + keyword,
      ];
      host('mesCut_regPath()', function (rp) {
        var w = window.cep.fs.writeFile(rp, lines.join('\n'), window.cep.encoding.UTF8);
        if (!w || w.err !== 0) { fin('등록정보 쓰기 실패: ' + rp, 'err'); return; }
        host('mesCut_nestRegister()', function (res, bad) {
          if (bad || res.indexOf('ok;') !== 0) { fin('등록 실패: ' + res, 'err'); return; }
          var n = kv(res.substring(3)).folders;
          fin('주문서 대기함으로 보냈습니다 — ' + n + '건\n'
            + '거래처 ' + name + ' · 수량 ' + Math.max(1, Math.round(qty))
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

  var btnPair = $('btnExportPair');
  if (btnPair) btnPair.addEventListener('click', exportPair);
  // 자재·후가공·품목을 고칠 때마다 파일명 미리보기를 갱신한다 — 저장 직전에야 이름을 알면 늦다
  var pairIds = ['regMaterial', 'regFinish', 'regItem'];
  for (var pi = 0; pi < pairIds.length; pi++) {
    var pel = document.getElementById(pairIds[pi]);
    if (pel) { pel.addEventListener('input', refreshPairName); pel.addEventListener('change', refreshPairName); }
  }

  var btnNest = $('btnNest');
  if (btnNest) btnNest.addEventListener('click', runNest);

  var btnWidth = $('btnWidth');
  if (btnWidth) btnWidth.addEventListener('click', recommendWidth);

  var btnMake = $('btnMakeCut');
  if (btnMake) btnMake.addEventListener('click', makeCut);

  var btnRefresh = $('btnRefresh');
  if (btnRefresh) btnRefresh.addEventListener('click', refresh);

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
  if (elPunch) elPunch.addEventListener('change', function () {
    var on = !!elPunch.checked;
    var c = document.getElementById('punchCount'), i = document.getElementById('punchInset');
    if (c) c.disabled = !on;
    if (i) i.disabled = !on;
  });

  // ── 초기화 ───────────────────────────────────────────────────────
  applyGates();
  loadConfig();
  fillDatalist('materialList', MATERIALS);
  fillDatalist('finishList', FINISHES);
  host('mesCut_ping()', function (res, bad) {
    if (elVer) elVer.textContent = 'shell ' + SHELL_VERSION + ' · host ' + res;
    if (bad) { out(res + '\nZ: 연결과 mes-cut-host.jsx 배포를 확인하세요.', 'err'); return; }
    setHostVersion(res);
    applyGates();   // ★버전을 안 뒤 다시 — 초기 applyGates() 는 ping 이전이라 항상 '구버전'으로 보인다
    out('준비됨 — P0 골격입니다. 칼선 생성은 P1 에서 켜집니다.'
      + (hostSupportsCurve() ? '' : '\n⚠ 호스트가 구버전(' + res + ')이라 곡선 칼선을 끕니다 — 직선으로 만듭니다.'));
    refresh();
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
    refresh();
  });

  // 재단 탭으로 처음 들어올 때 1회 갱신 — 패널을 열자마자 재단으로 가면 문서 정보가 비어 있다.
  // (부팅 시의 refresh() 는 그대로 두었다. 가공 탭에서 시작해도 첫 진입 때 최신값이 필요하다.)
  document.addEventListener('mes:mainTab', function (e) {
    if (!e || !e.detail || e.detail.tab !== 'cut') return;
    if (!hostBusy) refresh();
  });
})();
