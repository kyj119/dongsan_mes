/**
 * 전사 탭 — 가로등배너(산식) · 윈드배너(틀)
 *
 * ★main.js·cut-main.js 와 마찬가지로 **IIFE 로 닫고 서로를 모른다.** 공유하는 것은
 *   전역 엔진(MesPlate·MesFrame·MesReview)뿐이고, 상태는 `document.body[data-main]` 을 **읽기만** 한다.
 *
 * ★값을 여기에 적지 않는다. 규칙은 `plate-rules.js`, 틀은 `frame-catalog.js` 가 정본이다
 *   — 드롭다운도 그 파일에서 만든다. 한 줄이라도 복사하면 두 곳이 갈리고, 갈린 걸 아무도 못 본다.
 *
 * ★안쪽 탭은 `.trtab` · `[data-trtab]` 이다. `.tab` · `[data-tab]` 을 쓰면 안 된다 —
 *   main.js 가 `getElementsByClassName('tab')` 으로 **전역 수집**해서 가공 탭 핸들러가
 *   전사 페이지까지 집어 뒤바꾼다(tabs.js 주석이 경고하는 바로 그 함정, 2026-09-18 확인).
 *
 * ★evalScript 인자는 **ASCII 만** 보낸다(브릿지 한글 깨짐). 한글은 `\uXXXX` 로 이스케이프해
 *   식 자체를 ASCII 로 유지한다 — 틀 경로에 「메인1」·「★가이드」가 들어 있어서 필요하다.
 */
(function () {
  'use strict';

  var TR_SHELL_VERSION = '0.10.0';   // 0.10.0 = ★둘(용준님 2026-09-23). ①**표시 색 고정 2겹** — 배경 보고 흑/백을 고르던 판정(굽기 창 → 도련 래스터)을 전부 걷어냈다. 픽셀 반복 띠는 정의상 가장자리 색과 같아 배경 맞춤 단색선은 늘 묻힐 수 있다(판-1 실기). 모든 표시 = 검정 심 3pt + 백 테두리 1pt(총 5pt≈1.8mm, 종전 백선 4pt≈1.4mm 와 비슷 — 값은 plate-rules.marks). 두께를 L/H 레코드에 실어 보내므로 호스트 0.8.0 필요(TR_MIN_HOST). ②**롤 폭 칸 제거** — 「60폭」은 인수인계 표기고 값은 130폭 롤 상한이며 롤은 현장이 고른다. 산식은 규칙의 2벌 상한만 쓴다. 잃는 것: 배경이 밝든 어둡든 표시가 늘 검정+백이라 「배경에 맞춘 단색」은 더 못 고른다(원하지 않는 것으로 확정). · 0.9.0 = ★셋(용준님 2026-09-23 실기). ①**표시 색을 도련 래스터에서 정한다** — 판-1 벌②의 가운데 끈고리가 안 보였다: 사진 가장자리 1~3mm 밝은 기둥을 픽셀 반복이 시접 폭으로 늘려 띠가 흰데, 굽기 가장자리 창 평균은 「어둡다 → 백선」이었다. 이제 도련 그림이 손에 있는 순간(buildBleedPngs) 선 길이 5점을 직접 보고, 한 점이라도 다르면 x(흑선+백테두리). 굽기 추정은 도련 그림이 없는 벌(단색·늘리기·실패)의 폴백으로만. ②**원본 비율 ≠ 규격 비율이면 must** — 호스트가 두 배율로 그대로 늘려 조용히 찌그러진다(검사 0곳이었다). 2% 초과면 어느 축이 몇 % 더 늘어나는지 말한다. 막지는 않는다. ③**끈고리 자리별 선택** 상·중·하 체크(하는 상하단에만 노출), 기본 전부 켜짐. 잃는 것: 없음(호스트 불변). · 0.8.0 = ★**표시 규칙 정정 + 마감 통합**(용준님 2026-09-23 실기). ①선(접는선·끈고리)은 원본 안이 아니라 **시접 띠 위** — 벌 바깥 끝선에서 안쪽으로 시접 폭. 시접은 접혀 넘어가므로 완성면에 안 남는다. ②맨 위 줄은 끈고리가 아니라 **접는선**이었다 — 밴드가 접히는 자리 양쪽, 봉미싱일 때만·항상. 상하단이면 아래에도 접는선 2 + 끈고리 1(= 벌당 7). ③끈고리(안쪽 ①밴드 높이 아래 ②중간 ③아래 밴드 위)는 체크로 끈다(기본 켜짐) — 끄면 접는선은 남는다. ④마감 목록 = 상단 봉미싱·상하단 봉미싱·부직포 7cm·부직포 10cm(정본 plate-rules.FINISH). 부직포 = 위 여백·접는선 없음, 끈고리는 위 끝선에서 폭+1cm(7→8cm) + 중간, 봉미싱 cm 칸은 숨긴다. 5cm·레자는 제외. ⑤색 판정은 시접 자리가 굽기 밖이라 가장 가까운 가장자리 픽셀로 본다(도련이 그 픽셀을 반복한다). 호스트는 그대로(L 레코드 6번째 f|l 은 0.7.x 가 무시한다 — TR_MIN_HOST 불변). 잃는 것: 선이 시접 위라 접기 전에만 보인다(그게 의도다). · 0.7.3 = ★픽셀 도련의 **모서리를 채운다**(용준님 2026-09-23 「모서리가 채워지지 않아 아쉽다」) — 엔진 기본(타원 한계)은 실루엣용이라 사각 벌의 네 모서리가 비었다. `corner:'square'` 로 부른다. 잃는 것: 없음. · 0.7.2 = ★**도련 기본이 픽셀 반복(repeat)** — 2026-09-22 실기(고양 소노): 가장자리에 실제로 있는 것은 사진+줄무늬(좌·우·하)이고 그라디언트는 위 변 하나뿐이었는데 `extend` 가 그라디언트를 늘려 깔았다 — 「전체를 덮는 맨 위 칠」은 가장자리에 보이는 것이 아니다. 벡터로는 혼합 가장자리를 표현할 수 없어 업계 도구 전부가 픽셀 방식을 쓴다(bleed.js). 실측: 벌마다 굽기 9초 · 네 변 띄 끝 색 = 원본 가장자리 픽셀(바이트 일치). `solid`·`extend` 는 픽셀을 못 만들 때의 폴백으로만 남는다(review.js planBleed). 잃는 것: 판 만들기에 벌당 굽기 ~10초가 붙는다(종전 단색·늘리기는 즉시). · 0.7.1 = ★도련 계획의 「벌」= plate.js `outer`(벌 ∪ 밴드) — grow.t 에 밴드가 들어가 픽셀 도련도 밴드까지 늘어난다. 라벨 3면=좌·우·하단. 호스트 0.7.1 과 짝(`TR_MIN_HOST` 는 [0,7,0] 그대로 — 0.7.0 도 outer 를 받으면 그대로 그린다). 잃는 것: 없음. · 0.7.0 = ★**끈고리·하도매를 그린다**(용준님 2026-09-22 확정 규칙 — 정본 `plate-rules.marks`, 산식 `plate.js`, 게이트 `cut:plate` ㊘㊙). 입력 = 하도매 「상단 N · 측면 N」(구 수는 겹침을 빼고 자동) + 끈고리 체크(기본 켜짐). 위치는 원본 끝선 안쪽, 「안쪽」= 두 벌이 마주 보는 쪽. ★색은 표시마다 **그 자리 배경**으로 흰/검(`sampleMarkColors` — 벌마다 1mm/px 굽기 한 번, 픽셀 도련이 구웠으면 그것을 재사용). 판정이 안 서면(밝기 0.4~0.6 · 투명 · 굽기 실패) 흑선+백테두리로 보내고 **센다**. 호스트 0.7.0 이 받는다(`TR_MIN_HOST` [0,7,0] — 구 호스트는 L/H 를 조용히 버리므로 막는다). 잃는 것: 판 만들기에 벌당 굽기 한 번(수 초). · 0.6.0 = ★도련 3단 배선 — 호스트 0.6.0 과 짝이다(`TR_MIN_HOST` [0,6,0]). 가장자리가 `grad` 면 **바탕을 늘리고**(무손실), 그것도 안 되면 **가장자리 색을 바깥으로 반복**한다. 반복은 재단과 **같은 엔진**(`js/bleed.js` `repeatLastPixel`)을 쓰고, 입출구(`readPng`·`writePng`)도 **사본을 만들지 않고** `js/png-io.js` 로 빼서 재단과 공유한다 — 엔진이 공유인데 입출구가 사본이면 한쪽에서 고친 것이 다른 쪽에 안 온다(이 저장소가 형제 스윕으로 여러 번 겪은 형태). ★굽기 해상도는 `TR_BLEED_MAX_PX`(12M) 예산에서 정하고, **실제로 구운 해상도로 되환산**해 도련 폭을 잡는다(요청값을 그대로 쓰면 반올림이 도련 폭에 실린다). 도련 PNG 는 원본 **뒤에** 깔리고 원본은 벡터 그대로라 안쪽 화질은 결과에 영향이 없다. ★못 만든 벌은 **센다** — 그 벌은 도련 없이 나가므로 조용히 넘기지 않는다. 잃는 것: 반복 경로는 벌당 굽기 왕복(수 초)이 붙는다. · 0.5.0 = ★호스트 0.5.0(클립 존중 잉크 경계) 없이는 **틀린 판이 조용히 나가므로** `TR_MIN_HOST` 를 [0,5,0] 으로 올렸다. 구 호스트는 클립이 잘라 낸 부분까지 크기에 넣어 자동 분석이 문서 전체를 한 덩어리로 보고(실측 10→1), 판에는 보이지 않는 여백이 그림보다 크게 깔린다 — 예외도 경고도 없이 **결과만 틀리다**(§조용한 격하). 잃는 것: Z: 호스트가 아직 0.4.0 인 PC 는 전사 탭이 「호스트가 낡았다」로 막힌다(갱신하면 풀린다). · 0.4.0 = ★**자동 분석이 주 경로**가 됐다(용준님 2026-09-21 「재단 기능처럼, 순서만 바꿀 수 있게」). [자동 분석] 이 문서의 맨 위 개체를 가로 간격으로 갈라 왼쪽을 벌① 로 두고, 사람은 [⇄ 좌우] 로 순서만 바꾼다. 수동 지정은 **자동이 못 가를 때**의 길로 내렸다. [계산] 은 지정이 하나도 없을 때만 자동을 먼저 돌린다 — 사람이 고른 것을 덮지 않는다. ⚠️그 자동 호출을 **await 없이 던지면 안 된다** — 호스트 왕복이라 늦게 온 응답이 방금 읽은 상태를 덮는다(CLAUDE.md §늦게 온 응답이 덮는다). 콜백으로 이어 붙였다. ⚠️덩어리 수가 벌 수와 다르면 **아무것도 지정하지 않고** 몇 덩어리인지 말한다 — 억지로 가르면 반쪽짜리 판이 조용히 나간다. 잃는 것: 없음(수동 경로 그대로) · 0.3.0 = ★벌마다 원본을 지정한다([벌① 좌 지정]·[벌② 우 지정]·[⇄]·[비우기]). 1조의 두 벌은 서로 다른 그림이라(2026-08 완성판 22건 실측, 동일 복제 0건) 종전처럼 하나를 두 벌에 복제하면 **전부 틀린 판**이 나왔다. 좌우는 디자이너가 정한다. 도련도 **벌마다** 계산해 `M:idx,...` 로 보낸다 — 두 벌의 바탕색이 다른 판이 흔하다. 지정이 비면 확인 목록에 **must** 로 올린다(조용히 빈 자리로 내보내지 않는다). ⚠️최악 도련을 고르는 비교에 `RANK[m] || 9` 를 쓰면 안 된다 — **skip 이 0 이라 falsy** 다(review.js 의 `ORDER[level] || 9` 와 같은 함정, 여기서도 한 번 걸렸다). 잃는 것: [계산] 전에 지정이 필요하다(안 하면 벌①에만 현재 선택이 들어간다) · 0.2.2 = ★안쪽 탭이 **전환되지 않고 있었다**. `.trpage`(style.css L199)가 `.hidden`(L21)보다 뒤에 있어 특정도가 같으면 이겼고, 숨겨야 할 페이지가 계속 보였다 — 가로등·윈드 입력이 동시에 렌더돼 실기에서 「입력창이 동일하다」로 보고됐다. `.trpage.hidden` 로 못박았다(`.mainpage.hidden` 과 같은 방식). 겸해서 **탭마다 쓰는 버튼만** 남긴다 — 가로등의 「틀 열기」·윈드의 「판 만들기」는 눌러도 거절 문구만 나오는 선택지였다. 게이트 = `panel:smoke` §16(브라우저에서 실제 가시성을 잰다 — 텍스트 게이트로는 영원히 못 잡는 종류다). 잃는 것: 없음(산식·payload 불변) · 0.2.1 = ★호스트 미로드를 **부팅 때** 알린다. 종전엔 `none` 을 조용히 넘겨 `host ?` 만 떴고 사람은 [판 만들기] 를 누르고서야 알았다. 그리고 그때 뜨는 문구가 **Z: 를 범인으로 단정**했는데(2026-09-18 실기) 진짜 원인은 이 PC 의 스텁이 전사 호스트를 목록에 안 넣은 것이었다 — Z: 는 멀쩡했고 사람은 드라이브를 보러 갔다. → 사유를 스텁에게 되묻고(oldstub·loaderr·notloaded) **조치가 다른 세 갈래**로 나눠 말한다. 잃는 것: 없음(산식·판·payload 불변) · 0.2.0 = 원본 측정(mesTr_measure) → 도련 경로 결정 → 배치·클리핑까지 · 0.1.0 = 신설
  // ★호스트 최소 버전 — 자동 분석(`mesTr_autoPick`)·벌별 슬롯·벌별 도련은 **0.3.0 부터**다.
  //   구 호스트는 그 함수가 없어 「함수가 아닙니다」로 떨어지거나(0.2.x), `M:idx,..` 를 조용히
  //   무시해 도련이 없는 판을 낸다(0.1.0). 조용한 격하라서 버전을 못박는다.
  var TR_MIN_HOST = [0, 8, 0];   // 0.8.0 = 표시 두께(심·테두리)를 레코드에서 읽는다 — 구 호스트는 4pt+1pt 고정으로 그려 두께 결정이 무시된다

  var cs = null;
  try { cs = new CSInterface(); } catch (e) { /* ignore: 브라우저에서 열어 본 경우 — 계산까지는 동작해야 한다 */ }

  var el = {};
  var lastPlan = null;              // 마지막 계산 결과 — [판 만들기] 가 쓴다
  var lastEdges = [];               // 벌별 원본 측정 — 도련 경로가 **벌마다** 갈린다
  var lastPickRaw = '';             // 마지막 슬롯 상태 원문(화면 표시용)
  var booted = false;

  /**
   * 바탕이 「연한색」인가 — 재단선(M50 Y100)이 필요한지 판정한다.
   * 인수인계의 문장은 「흰색(백색)·연한색일 경우」다. 잉크 총량으로 가른다.
   * ⚠️ 경계값은 규칙이 아니라 **눈금**이다 — 애매하면 확인 목록으로 넘어가고 사람이 정한다.
   */
  function isLight(c) {
    if (!c) return false;
    return (c.c + c.m + c.y + c.k) < 30;
  }

  /** `OK w=600 h=1828.8 edge=solid c=0 m=0 y=100 k=0` → {w,h,edge,c,m,y,k} */
  function parseKv(s) {
    var o = {}, parts = String(s || '').split(/\s+/), i, kv;
    for (i = 0; i < parts.length; i++) {
      kv = parts[i].split('=');
      if (kv.length === 2) o[kv[0]] = kv[1];
    }
    return o;
  }

  function $(id) { return document.getElementById(id); }
  function rectStr(r) { return r.x + ',' + r.y + ',' + r.w + ',' + r.h; }

  /** 하도매 구 수 — 상단 N + 측면 N 에서 겹치는 위 안쪽 모서리 1개를 뺀다(plate.js 가 같은 규칙으로 배치한다). */
  function holesTotal() {
    var t = parseInt(el.hwTop ? el.hwTop.value : '0', 10) || 0, sd = parseInt(el.hwSide ? el.hwSide.value : '0', 10) || 0;
    var overlap = (t >= 2 && sd >= 2) ? 1 : 0;
    return Math.max(0, t + sd - overlap);
  }
  /** 마감별 UI — 부직포는 봉미싱 cm 칸을 숨긴다(FINISH.bands 가 비면). 규칙이 정본이라 여기엔 마감 이름을 적지 않는다. */
  function syncFinishUi() {
    var R = window.MesPlateRules;
    var F = (R && R.FINISH && el.band) ? R.FINISH[el.band.value] : null;
    show(el.sewRow, !F || F.bands.length > 0);
    // 「하」 끈고리는 아래 밴드가 있는 마감(상하단)에만 뜻이 있다
    show(el.loopBottomWrap, !!(F && F.bands.indexOf('bottom') >= 0));
  }
  function refreshHwTotal() {
    if (el.hwTotal) el.hwTotal.textContent = holesTotal();
    if (el.hwHoles) el.hwHoles.value = holesTotal();
  }

  function show(node, on) { if (node) node.className = node.className.replace(/\s*hidden/g, '') + (on ? '' : ' hidden'); }

  // ── 호스트 브릿지 ────────────────────────────────────────────────
  /** 한글이 든 문자열을 ASCII 전용 JS 리터럴로. 식 전체가 ASCII 라야 브릿지에서 안 깨진다. */
  function asciiStr(s) {
    var out = '', i, c;
    s = String(s == null ? '' : s);
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c === 0x5c) out += '\\\\';
      else if (c === 0x27) out += '\\x27';
      else if (c >= 0x20 && c < 0x7f) out += s.charAt(i);
      else out += '\\u' + ('0000' + c.toString(16)).slice(-4);
    }
    return "'" + out + "'";
  }

  function host(expr, cb) {
    if (!cs) { cb('ERROR CEP 브릿지가 없습니다(패널 밖에서 열렸습니다)', true); return; }
    cs.evalScript(expr, function (res) {
      var s = (res === null || res === undefined) ? '' : String(res);
      if (s === 'EvalScript error.') { cb('ERROR evalScript 실패', true); return; }
      // 호스트가 아예 안 실린 경우 — 「함수가 아닙니다」만으로는 원인도 조치도 알 수 없다(cut-main.js 전례)
      if (/is not a function|함수가 아닙니다/.test(s) && /mesTr_/.test(s)) {
        // ★원인을 단정하지 않는다 — 2026-09-18 실기에서 이 문구가 **Z: 를 지목했는데 Z: 는 멀쩡했고**
        //   진짜 원인은 이 PC 의 스텁이 전사 호스트를 목록에 안 넣은 것이었다. 사람이 엉뚱한 곳을 고친다.
        cb('ERROR 전사 호스트(mesTr_*)가 안 실렸습니다.\n'
          + '· 일러스트레이터를 **완전히 종료**했다 다시 켜 주세요(패널만 닫았다 여는 것으로는 안 바뀝니다).\n'
          + '· 그래도 같으면 가공 탭 [⚙ 환경 점검] 의 hosts · loadErr 두 줄을 보내 주세요 —\n'
          + '  Z: 연결인지 이 PC 의 스텁인지는 그 두 줄이 가릅니다.', true);
        return;
      }
      cb(s, s.indexOf('ERROR') === 0);
    });
  }

  /**
   * 호스트가 안 실린 사유를 **조치가 다른 세 갈래**로 옮긴다.
   * ★「Z: 연결을 확인하세요」로 뭉치지 않는다 — 2026-09-18 에 그 문구가 멀쩡한 Z: 를 지목했다.
   */
  function hostMissingWhy(v) {
    if (/reason=oldstub/.test(v)) {
      return '⚠ 이 PC 의 패널 스텁이 낡아 전사 호스트를 아예 안 읽습니다.\n'
        + '· 일러스트레이터를 완전히 종료했다 다시 켜면 패널이 스스로 갱신됩니다(Z: 연결 필요).\n'
        + '· 두 번 해도 같으면 자동 갱신이 멈춘 PC 입니다 — 관리자에게 알려 주세요.';
    }
    if (/reason=loaderr/.test(v)) {
      return '⚠ Z: 에서 전사 호스트를 못 읽었습니다 — Z: 연결을 확인하세요.\n'
        + '· 자세한 사유는 가공 탭 [⚙ 환경 점검] 의 loadErr 줄에 있습니다.';
    }
    return '⚠ 전사 호스트가 안 실렸습니다(' + v + ').\n'
      + '· 일러스트레이터를 완전히 종료했다 다시 켜 주세요.';
  }

  function verGE(v, min) {
    var a = String(v || '').replace(/^TR-CEP-/, '').split('.');
    var i, x, y;
    for (i = 0; i < 3; i++) {
      x = parseInt(a[i], 10) || 0; y = min[i] || 0;
      if (x > y) return true;
      if (x < y) return false;
    }
    return true;
  }

  // ── 드롭다운 — 값은 전부 규칙 파일에서 온다 ──────────────────────
  function fillSelect(node, values, labelOf) {
    if (!node) return;
    node.innerHTML = '';
    for (var i = 0; i < values.length; i++) {
      var o = document.createElement('option');
      o.value = values[i];
      o.textContent = labelOf ? labelOf(values[i]) : values[i];
      node.appendChild(o);
    }
  }

  function populate() {
    var R = window.MesPlateRules;
    if (R) {
      fillSelect(el.fabric, Object.keys(R.RULES.fabric));
      fillSelect(el.seam, Object.keys(R.RULES.seamMm), function (k) {
        return k + ' (' + R.RULES.seamMm[k] + 'mm)';
      });
      // 면 수는 큰 값이 먼저 — 가로등 표준이 3면이라 기본값이 위에 온다
      var sides = Object.keys(R.RULES.sewSides).sort(function (a, b) { return b - a; });
      fillSelect(el.sides, sides, function (k) { return k + '면'; });
      // ★마감은 규칙 파일(FINISH)이 정본 — 넷뿐이다(용준님 2026-09-23 통합). 부직포는 봉미싱 cm 을 안 쓰므로 그 칸을 숨긴다.
      if (R.FINISH && el.band) {
        fillSelect(el.band, Object.keys(R.FINISH), function (k) { return R.FINISH[k].label; });
        el.band.value = 'top';
      }
      fillSelect(el.hwSize, R.RULES.hardware.sizes, function (v) { return v + '호'; });
      if (el.seam) el.seam.value = '쌍침';
    }
    var F = window.MesFrame;
    if (F && el.frame) {
      var list = F.list();
      el.frame.innerHTML = '';
      for (var i = 0; i < list.length; i++) {
        var f = list[i], o = document.createElement('option');
        o.value = f.id;
        o.textContent = f.type + '형 ' + (f.spec.w / 10) + '×' + (f.spec.h / 10)
          + ' · ' + f.vup + '벌' + (f.placement === 'manual' ? ' · 틀만' : '')
          + (f.client ? ' · ' + f.client : '');
        el.frame.appendChild(o);
      }
    }
  }

  // ── 안쪽 탭 ──────────────────────────────────────────────────────
  function trTab(name) {
    var t = document.querySelectorAll('.trtab'), p = document.querySelectorAll('[data-trpage]'), i;
    for (i = 0; i < t.length; i++) t[i].className = (t[i].getAttribute('data-trtab') === name) ? 'trtab active' : 'trtab';
    for (i = 0; i < p.length; i++) p[i].className = (p[i].getAttribute('data-trpage') === name) ? 'trpage' : 'trpage hidden';
    // ★고를 수 없는 선택지를 남겨 두지 않는다 — 가로등에 「틀 열기」, 윈드에 「판 만들기」는 눌러도
    //   거절 문구만 나온다(실기 보고 2026-09-21). 탭이 곧 용도다.
    show(el.btnMake, name === 'plate');
    show(el.btnFrame, name === 'frame');
    lastPlan = null;
    if (el.btnMake) el.btnMake.disabled = true;
  }
  function activeTrTab() {
    var t = document.querySelectorAll('.trtab.active');
    return t.length ? t[0].getAttribute('data-trtab') : 'plate';
  }

  // ── 계산 ─────────────────────────────────────────────────────────
  function P_RULES() { return (window.MesPlateRules && window.MesPlateRules.RULES) || { media: { '60폭': {} } }; }
  function calcPlate() {
    var P = window.MesPlate, RV = window.MesReview;
    if (!P || !RV) return { err: '엔진이 로드되지 않았습니다(plate.js·review.js)' };
    var r = P.computePlate({
      specW: (parseFloat(el.specW.value) || 0) * 10,
      specH: (parseFloat(el.specH.value) || 0) * 10,
      vup: parseInt(el.vup.value, 10) || 1,
      seam: el.seam.value,
      sewCm: parseFloat(el.sew.value),
      band: el.band.value,
      // 롤 폭 칸은 뺐다(용준님 2026-09-23 「현장이 알아서」) — 규칙의 첫 항목(2벌 판 폭 상한)만 산식에 쓴다
      media: Object.keys(P_RULES().media)[0],
      sewSides: parseInt(el.sides.value, 10),
      fabric: el.fabric.value,
      hardware: (holesTotal() > 0)
        ? { size: parseInt(el.hwSize.value, 10), holes: holesTotal() } : null,
      // ★끈고리·하도매 — 정본 plate-rules.marks · 산식 plate.js. 여기서는 입력만 넘긴다.
      // ★끈고리는 자리마다 따로 켜고 끈다(용준님 2026-09-23) — 상(접는선+밴드 / 부직포 폭+1cm) · 중 · 하(상하단만). 기본 전부 켜짐.
      loops: { top: !el.loopTop || el.loopTop.checked, mid: !el.loopMid || el.loopMid.checked, bottom: !el.loopBottom || el.loopBottom.checked },
      holesTop: parseInt(el.hwTop ? el.hwTop.value : '0', 10) || 0,
      holesSide: parseInt(el.hwSide ? el.hwSide.value : '0', 10) || 0
    });
    if (!r.ok) return { err: '만들지 않습니다 — ' + r.reason, code: r.code };

    // ★도련은 **벌마다** 정한다 — 두 벌의 바탕색이 다른 판이 흔하다(2026-08 실측).
    //   안 재었으면 **모른다고 둔다**(추측해서 solid 로 만들지 않는다).
    var bleeds = [], worst = null, i;
    // 나쁜 것이 낮다. `extend` 는 무손실이지만 늘리는 만큼(≤1.7%) 색이 밀리므로 `solid` 아래다.
    var RANK = { skip: 0, repeat: 1, clip: 2, extend: 3, solid: 4, none: 5 };
    function rank(m) { return (typeof RANK[m] === 'number') ? RANK[m] : 9; }
    for (i = 0; i < r.panels.length; i++) {
      var e = lastEdges[i] || {};
      // ★도련이 덮을 사각은 벌이 아니라 **벌 ∪ 밴드**(plate.js outer) — 밴드에도 비슷한 색이 있어야 한다.
      var b = RV.planBleed({ design: r.design[i], panel: (r.outer && r.outer[i]) ? r.outer[i] : r.panels[i], edge: e });
      bleeds.push(b);
      // ⚠️`RANK[x] || 9` 로 쓰면 안 된다 — **skip 이 0 이라 falsy** 라 가장 나쁜 것이 9로 밀린다.
      //   review.js 의 `ORDER[level] || 9` 에서 같은 함정에 이미 한 번 걸렸다.
      if (worst === null || rank(b.mode) < rank(bleeds[worst].mode)) worst = i;
    }
    var wEdge = lastEdges[worst] || {};
    // ★원본 비율 ≠ 규격 비율 — 호스트는 가로·세로를 따로 맞춰 **그대로 늘린다**(mes-tr-host resize 두 배율). 조용히 찌그러지므로
    //   must 로 올린다(용준님 2026-09-23 「경고만」 — 막지는 않는다). 더 늘어나는 축과 배율을 말한다.
    var ratioNotes = [], sw = (parseFloat(el.specW.value) || 0) * 10, sh = (parseFloat(el.specH.value) || 0) * 10;
    for (i = 0; i < r.panels.length; i++) {
      var ee = lastEdges[i];
      if (!ee || !(ee.w > 0) || !(ee.h > 0) || !(sw > 0) || !(sh > 0)) continue;
      var qr = (ee.w / ee.h) / (sw / sh);
      if (Math.abs(qr - 1) > TR_RATIO_TOL) {
        ratioNotes.push({ panel: i, orig: ee.w / ee.h, spec: sw / sh, axis: (qr >= 1) ? '세로' : '가로', pct: (qr >= 1) ? (qr - 1) : (1 / qr - 1) });
      }
    }
    var review = RV.build({
      mode: 'plate', bleed: bleeds[worst], edge: wEdge, trace: r.trace, ratio: ratioNotes,
      nonwoven: (r.trace.nonwovenCm !== null && r.trace.nonwovenCm !== undefined)
    });
    // ★비어 있는 벌을 조용히 넘기지 않는다 — 그 자리는 **빈 채로** 나간다.
    for (i = 0; i < r.panels.length; i++) {
      if (!lastEdges[i]) {
        review.unshift({
          code: 'slot-empty-' + (i + 1), level: 'must',
          msg: '벌' + (i + 1) + ' 에 앉힐 원본이 지정되지 않았습니다 — 그 자리는 비워 둡니다'
        });
      }
    }
    return { plate: r, bleed: bleeds[worst], bleeds: bleeds, review: review, mode: 'plate', edge: wEdge };
  }

  function calcFrame() {
    var F = window.MesFrame, RV = window.MesReview, C = window.MesFrameCatalog;
    if (!F || !RV || !C) return { err: '엔진이 로드되지 않았습니다(frame.js·review.js)' };
    var id = el.frame && el.frame.value;
    var f = null, i;
    for (i = 0; i < C.FRAMES.length; i++) if (C.FRAMES[i].id === id) f = C.FRAMES[i];
    if (!f) return { err: '틀을 고르세요' };
    // 목록에서 골랐어도 **조회 규칙을 한 번 태운다** — 거래처 전용 틀 방어가 여기서만 돈다
    var look = F.lookup({ type: f.type, specW: f.spec.w, specH: f.spec.h, client: (el.client && el.client.value) || null });
    if (!look.ok) return { err: '만들지 않습니다 — ' + look.reason, code: look.code };
    var fp = F.plan({ frame: look.frame });
    var review = RV.build({ mode: 'frame', framePlan: fp });
    return { framePlan: fp, review: review, mode: 'frame' };
  }

  /** 일러에서 고른 원본을 잰다 — 크기와 바탕색. 못 재면 그 벌을 비워 **모르는 상태**로 둔다. */
  /** 슬롯 한 칸(`s1=ok s1w=.. s1edge=solid s1c=..`)을 review.js 가 먹는 edge 로 옮긴다. */
  function edgeOf(kv, t) {
    if (kv[t] !== 'ok') return null;
    var e, ek = kv[t + 'edge'];
    if (ek === 'grad') {
      // ★바탕이 **한 개체**다 — 늘리면 그대로 이어진다(무손실). 단색이라고는 말하지 않는다.
      e = { extend: true, outside: false };
    } else if (ek === 'solid') {
      var col = {
        c: parseFloat(kv[t + 'c']), m: parseFloat(kv[t + 'm']),
        y: parseFloat(kv[t + 'y']), k: parseFloat(kv[t + 'k'])
      };
      e = { solid: true, color: [col.c, col.m, col.y, col.k], light: isLight(col), outside: false };
    } else {
      // ★「단색이 아니다」가 아니라 **「모르겠다」**이다 — solid=false 로 단정하면
      //   review.js 가 edge-multicolor 로 확정해 버린다. 판정은 사람에게 남긴다.
      e = { outside: false };
    }
    e.w = parseFloat(kv[t + 'w']);
    e.h = parseFloat(kv[t + 'h']);
    e.n = parseInt(kv[t + 'n'], 10) || 0;
    return e;
  }

  /** 슬롯 상태를 받아 벌별 측정을 채운다. 종전의 단일 measure 를 대신한다. */
  function measure(done) {
    if (!cs || activeTrTab() === 'frame') { done(); return; }
    host('mesTr_picks()', function (res, bad) {
      if (bad || String(res).indexOf('OK') !== 0) { lastEdges = []; done(String(res)); return; }
      lastPickRaw = String(res);
      var kv = parseKv(res);
      lastEdges = [edgeOf(kv, 's1'), edgeOf(kv, 's2')];
      renderPicks(kv);
      done();
    });
  }

  /** 지정 상태를 사람 말로. 「비어 있다」를 조용히 넘기지 않는다. */
  function renderPicks(kv) {
    if (!el.pickState) return;
    var vup = parseInt(el.vup ? el.vup.value : '1', 10) || 1;
    var txt = [], i, t, e;
    for (i = 0; i < vup; i++) {
      t = 's' + (i + 1);
      e = lastEdges[i];
      if (kv[t] === 'lost') txt.push('벌' + (i + 1) + ' ✕ 지정이 사라졌습니다(지웠거나 문서를 닫았습니다) — 다시 지정하세요');
      else if (!e) txt.push('벌' + (i + 1) + ' — 지정 안 됨');
      else {
        txt.push('벌' + (i + 1) + ' ✓ ' + e.n + '개 · ' + e.w + '×' + e.h + 'mm · 바탕 '
          + (e.solid ? ('단색 ' + e.color.join('/')) : '모름'));
      }
    }
    show(el.pick2, vup > 1);
    show(el.pickSwap, vup > 1);
    el.pickState.textContent = txt.join('   |   ');
  }

  function pick(slot) {
    host('mesTr_pick(' + slot + ')', function (res, bad) {
      if (bad) { el.out.textContent = res; return; }
      lastPickRaw = String(res);
      var kv = parseKv(res);
      lastEdges = [edgeOf(kv, 's1'), edgeOf(kv, 's2')];
      renderPicks(kv);
      lastPlan = null;
      if (el.btnMake) el.btnMake.disabled = true;
      el.out.textContent = '지정했습니다 — [계산] 을 다시 누르세요';
    });
  }

  /**
   * 파일을 보고 좌·우를 가른다. 못 가르면 **아무것도 지정하지 않고** 몇 덩어리인지 알린다
   * — 억지로 가르면 반쪽짜리 판이 조용히 나간다(§조용한 격하).
   */
  function autoPick(quiet, done) {
    var vup = parseInt(el.vup ? el.vup.value : '2', 10) || 2;
    host('mesTr_autoPick(' + vup + ',5)', function (res, bad) {
      if (bad) { if (!quiet) el.out.textContent = res; if (done) done(); return; }
      lastPickRaw = String(res);
      var kv = parseKv(res);
      lastEdges = [edgeOf(kv, 's1'), edgeOf(kv, 's2')];
      renderPicks(kv);
      lastPlan = null;
      if (el.btnMake) el.btnMake.disabled = true;
      if (kv.auto === 'no') {
        el.out.textContent = '자동으로 못 갈랐습니다 — 문서에서 ' + kv.found + '덩어리가 보이는데 '
          + kv.want + '벌이 필요합니다.\n· 벌마다 [벌① 좌 지정] · [벌② 우 지정] 으로 직접 골라 주세요.';
      } else if (!quiet) {
        el.out.textContent = '자동 분석 완료 — 왼쪽이 벌①입니다. 순서가 반대면 [⇄ 좌우] 를 누르세요.';
      }
      if (done) done();
    });
  }

  function pickCmd(expr) {
    host(expr, function (res, bad) {
      if (bad) { el.out.textContent = res; return; }
      lastPickRaw = String(res);
      var kv = parseKv(res);
      lastEdges = [edgeOf(kv, 's1'), edgeOf(kv, 's2')];
      renderPicks(kv);
      lastPlan = null;
      if (el.btnMake) el.btnMake.disabled = true;
    });
  }

  function calc() {
    // ★지정이 하나도 없으면 **먼저 자동으로 갈라 본다** — 주 경로가 자동이다.
    //   이미 지정이 있으면 건드리지 않는다(사람이 고른 것을 덮으면 안 된다).
    // ⚠️**await 없이 던지지 않는다** — 자동 분석은 호스트 왕복이라, 그냥 부르고 바로 measure 로
    //   넘어가면 늦게 온 응답이 방금 읽은 상태를 덮는다(CLAUDE.md §늦게 온 응답이 덮는다).
    //   그래서 자동이 끝난 **뒤에** 이어 간다.
    if (activeTrTab() !== 'frame' && !lastEdges[0] && !lastEdges[1]) { autoPick(true, calcGo); }
    else calcGo();
  }

  function calcGo() {
    measure(function (note) {
      var r = (activeTrTab() === 'frame') ? calcFrame() : calcPlate();
      lastPlan = r.err ? null : r;
      if (el.btnMake) el.btnMake.disabled = !!r.err || (r.mode === 'frame' && r.framePlan.mode !== 'auto');
      render(r, note);
    });
  }

  // ── 출력 ─────────────────────────────────────────────────────────
  function render(r, note) {
    var lines = [];
    if (note) lines.push('※ ' + note);
    if (r.err) {
      lines.push('✖ ' + r.err + (r.code ? '  [' + r.code + ']' : ''));
      el.out.textContent = lines.join('\n');
      show(el.review, false);
      return;
    }
    if (r.mode === 'plate') {
      var p = r.plate, t = p.trace;
      lines.push('판  ' + p.plate.w + ' × ' + p.plate.h + ' mm   (' + t.vup + '벌 · 간격 ' + t.gap + ')');
      lines.push('벌  ' + p.panels[0].w + ' × ' + p.panels[0].h + '   밴드 ' + p.bands[0].h);
      lines.push('원본 ' + p.design[0].w + ' × ' + p.design[0].h + '   시접 ' + t.seamActual
        + (t.shrunkByW ? ' (공칭 ' + t.seamNominal + ' → 전체폭 ' + t.shrunkByW + 'mm 줄임)' : ''));
      lines.push('1단계 ' + t.panelH0 + ' + ' + t.bandH0 + '×' + t.bandCount + ' = ' + t.plateH0
        + '  → 세로 ×' + t.shrink);
      lines.push(window.MesReview.tally([r.bleed]) + (r.bleed.grow
        ? '  grow t' + r.bleed.grow.t + ' r' + r.bleed.grow.r + ' b' + r.bleed.grow.b + ' l' + r.bleed.grow.l : ''));
      if (r.edge && r.edge.w) {
        // ★잰 원본이 규격과 다르면 **말해 준다** — 세로는 보정 전 값(1800)과 비교해야 한다
        var want = p.design[0], gapW = r.edge.w - want.w, gapH = r.edge.h - want.h;
        lines.push('원본 실측 ' + r.edge.w + ' × ' + r.edge.h
          + (Math.abs(gapW) > 1 || Math.abs(gapH) > 1
            ? '  ⚠ 자리와 ' + gapW.toFixed(1) + ' / ' + gapH.toFixed(1) + ' 차이 (배치 때 맞춰집니다)'
            : '  (자리와 일치)'));
      }
    } else {
      var fp = r.framePlan;
      lines.push('틀  ' + fp.frameId + '   판 ' + fp.plate.w + ' × ' + fp.plate.h + '   ' + fp.vup + '벌');
      lines.push('앉히기  ' + (fp.mode === 'auto' ? '자동' : '틀만 연다 (' + fp.why + ')'));
      if (fp.seamMm) lines.push('시접  ' + fp.seamMm + 'mm');
    }
    el.out.textContent = lines.join('\n');
    renderReview(r.review);
  }

  function renderReview(list) {
    if (!el.review) return;
    if (!list || !list.length) { show(el.review, false); return; }
    var must = window.MesReview.mustCount(list);
    var s = '디자이너 확인 ' + list.length + '건' + (must ? ' (필수 ' + must + ')' : '') + '\n';
    for (var i = 0; i < list.length; i++) {
      s += (list[i].level === 'must' ? '● ' : '· ') + list[i].msg + '\n';
    }
    el.review.textContent = s;
    show(el.review, true);
  }

  // ── 호스트 실행 ──────────────────────────────────────────────────
  // ★굽기 예산 — 벌 하나를 이 픽셀 수 안에서 굽는다.
  //   `repeatLastPixel` 은 결과 픽셀당 8바이트를 쓴다(Int16 2개 + RGBA). 12M 이면 약 100MB 로,
  //   CEP 패널이 감당하는 선이다(재단 도련 상한 18M 보다 낮게 잡았다 — 전사는 벌이 크다).
  //   ⚠️해상도가 낮아도 괜찮은 이유가 있다 — **도련 PNG 는 원본 뒤에 깔리고 원본은 벡터 그대로**다.
  //     화면에 남는 것은 가장자리 밖으로 반복된 띠뿐이고, 그 띠는 어차피 잘려 나간다.
  var TR_BLEED_MAX_PX = 12e6;

  /**
   * 가장자리 색을 바깥으로 반복해 도련 PNG 를 만든다 — **재단과 같은 엔진**(`js/bleed.js`).
   * 호스트가 원본을 굽고(`mesTr_bakeSlot`), 여기서 늘린 뒤, 약속된 자리에 PNG 로 써 둔다.
   * 판을 만들 때 호스트가 `Folder.temp/mes_tr_bleed_<i>.png` 를 집어 간다(재단과 같은 규약).
   * @param idxs 픽셀 도련이 필요한 벌 번호들
   */
  /** 원본 비율 ≠ 규격 비율 허용 오차(상대). 2% 미만은 눈에 안 띈다. 수축보정(세로 배율)은 규격 쪽에 이미 들어 있어 비교 대상이 아니다. */
  var TR_RATIO_TOL = 0.02;
  function buildBleedPngs(idxs, bls, cb) {
    var B = window.MesCutBleed, IO = window.MesPngIo;
    if (!B || !IO) { cb('도련 엔진(js/bleed.js·js/png-io.js)이 안 실렸습니다 — 패널 설치본을 확인하세요.'); return; }
    var made = 0, fail = 0, q = 0;
    (function step() {
      if (q >= idxs.length) {
        // ★못 만든 것은 **센다** — 그 벌은 도련 없이 나가므로 조용히 넘기면 안 된다.
        cb(fail ? ('※ 벌 ' + fail + '개는 도련 그림을 못 만들었습니다(그 벌은 도련 없이 나갑니다).') : '');
        return;
      }
      var i = idxs[q], bl = bls[i], d = lastPlan.plate.design[i];
      if (!d || !bl || !bl.grow) { fail++; q++; step(); return; }
      var mmpp = Math.sqrt((d.w * d.h) / TR_BLEED_MAX_PX);
      if (!(mmpp > 0)) mmpp = 0.3;
      // ★굽기 해상도는 **원본 단위**로 준다. 원본이 1/10 배율로 그려져 있으면(고양 소노 파일이 그렇다 — 60x180mm 원본 → 600x1829 벌)
      //   벌 크기로 재서 맞춘 mm/px 를 그대로 보내면 굽기가 **10배 거칠어진다**(실측: 1984px 예산이 198px 로). 크기 환산은 아래 되환산이 맞춰 주지만 해상도는 되돌릴 수 없다.
      var srcW = (lastEdges[i] && lastEdges[i].w > 0) ? lastEdges[i].w : d.w;
      var mmppSrc = mmpp * (srcW / d.w);
      el.out.textContent = '도련 ' + (q + 1) + '/' + idxs.length + ' — 원본 굽는 중…';
      host('mesTr_bakeSlot(' + i + ',' + mmppSrc.toFixed(5) + ')', function (rz, bad) {
        var txt = String(rz);
        if (bad || txt.indexOf('ok;') !== 0) { fail++; q++; step(); return; }
        var m = txt.match(/path=(.+)$/);
        if (!m) { fail++; q++; step(); return; }
        var path = m[1], dir = path.replace(/[^\/\\]+$/, '');
        IO.readPng(path, function (err, img) {
          if (err || !img || !(img.W > 0)) { fail++; q++; step(); return; }
          // ★**실제로 구운 해상도**로 환산한다 — 요청한 mmpp 와 반올림만큼 다르다.
          //   요청값을 그대로 쓰면 그 차이가 도련 폭에 그대로 실린다.
          var mpp = d.w / img.W, g = bl.grow;
          var gpx = {
            t: Math.round(g.t / mpp), r: Math.round(g.r / mpp),
            b: Math.round(g.b / mpp), l: Math.round(g.l / mpp)
          };
          var res = null;
          // ★벌은 사각형이다 — 모서리까지 각지게(corner:'square'). 둥근 한계로는 가로등배너 네 모서리가 빈다(2026-09-23 실기).
          try { res = B.repeatLastPixel(img, gpx, { corner: 'square' }); } catch (e) { res = null; }
          if (res && IO.writePng(dir + 'mes_tr_bleed_' + i + '.png', res)) made++;
          else fail++;
          q++; step();
        });
      });
    })();
  }

  function make() {
    if (!lastPlan || lastPlan.err) { el.out.textContent = '먼저 [계산] 을 누르세요'; return; }
    if (lastPlan.mode !== 'plate') { el.out.textContent = '윈드배너는 [틀 열기] 로 틀을 연 뒤 디자이너가 앉힙니다'; return; }
    var p = lastPlan.plate;
    // ★JSON 을 보내지 않는다 — 호스트는 ES3 라 `JSON` 이 없다(`eval` 로 푸는 건 규약 밖).
    //   재단 params 와 같은 **줄 기반**으로 보낸다. 전부 숫자라 ASCII 가 보장된다.
    //     P:판w,판h · N:벌 x,y,w,h · D:원본 x,y,w,h · B:밴드 x,y,w,h · M:도련모드
    var rec = ['P:' + p.plate.w + ',' + p.plate.h], i;
    for (i = 0; i < p.panels.length; i++) rec.push('N:' + rectStr(p.panels[i]));
    for (i = 0; i < p.design.length; i++) rec.push('D:' + rectStr(p.design[i]));
    for (i = 0; i < p.bands.length; i++) rec.push('B:' + rectStr(p.bands[i]));
    // 도련 모드 — **벌마다** 보낸다(`M:idx,mode[,c,m,y,k]`). 두 벌의 바탕색이 다를 수 있다.
    var bls = lastPlan.bleeds || [lastPlan.bleed];
    for (i = 0; i < bls.length; i++) {
      var bl = bls[i];
      var mrec = 'M:' + i + ',' + (bl ? bl.mode : 'none');
      if (bl && bl.mode === 'solid' && bl.color) mrec += ',' + bl.color.join(',');
      rec.push(mrec);
    }
    var expr = 'mesTr_makePlate(' + asciiStr(rec.join(';')) + ')';

    // ★`repeat` 이 하나라도 있으면 **판을 만들기 전에** 도련 PNG 를 만들어 둔다.
    //   호스트는 약속된 자리에서 집어 가므로 경로가 브릿지를 타지 않는다(한글 temp 경로 대비).
    var need = [];
    for (i = 0; i < bls.length; i++) if (bls[i] && bls[i].mode === 'repeat') need.push(i);
    if (!need.length) { afterBleed(''); }
    else buildBleedPngs(need, bls, afterBleed);

    // ★접는선·끈고리·하도매 — 도련 PNG 다음, 판 만들기 전. 색은 **고정 2겹**(검정 심 + 백 테두리, 정본 plate-rules.marks)이라 판정이 없다.
    //   픽셀 반복 띠는 정의상 가장자리 색과 같아 배경 맞춤 단색선은 늘 묻힐 수 있었다(용준님 2026-09-23 「가」 — 판-1 실기).
    //   L:idx,x,y,len,color,kind,corePt,haloPt · H:idx,cx,cy,r,color,haloPt — color 는 항상 x(호스트 0.7.x 의 「흑선+백테두리」 값과 같다).
    function afterBleed(note) {
      var lines = (p.folds || []).concat(p.loops || []), holes = p.holes || [], j;
      for (j = 0; j < lines.length; j++) rec.push('L:' + lines[j].panel + ',' + lines[j].x + ',' + lines[j].y + ',' + lines[j].len + ',x,' + (lines[j].kind === 'fold' ? 'f' : 'l') + ',' + lines[j].weightPt + ',' + lines[j].haloPt);
      for (j = 0; j < holes.length; j++) rec.push('H:' + holes[j].panel + ',' + holes[j].cx + ',' + holes[j].cy + ',' + holes[j].r + ',x,' + holes[j].haloPt);
      expr = 'mesTr_makePlate(' + asciiStr(rec.join(';')) + ')';
      go(note);
    }

    function go(note) {
      el.out.textContent = '판 만드는 중…';
      host(expr, function (res, bad) {
        el.out.textContent = res + (note ? ('\n' + note) : '');
        if (!bad) renderReview(lastPlan.review);
      });
    }
  }

  function openFrame() {
    var C = window.MesFrameCatalog;
    var id = el.frame && el.frame.value, f = null, i;
    if (!C) return;
    for (i = 0; i < C.FRAMES.length; i++) if (C.FRAMES[i].id === id) f = C.FRAMES[i];
    if (!f) { el.out.textContent = '틀을 고르세요'; return; }
    host('mesTr_openFrame(' + asciiStr(f.file) + ')', function (res) { el.out.textContent = res; });
  }

  // ── 부팅 ─────────────────────────────────────────────────────────
  function boot() {
    if (booted) return;
    booted = true;
    el = {
      specW: $('trSpecW'), specH: $('trSpecH'), fabric: $('trFabric'), vup: $('trVup'),
      seam: $('trSeam'), sides: $('trSides'), band: $('trBand'), sew: $('trSew'),
      sewRow: $('trSewRow'), hwSize: $('trHwSize'), hwHoles: $('trHwHoles'),
      hwTop: $('trHwTop'), hwSide: $('trHwSide'), hwTotal: $('trHwTotal'),
      loopTop: $('trLoopTop'), loopMid: $('trLoopMid'), loopBottom: $('trLoopBottom'), loopBottomWrap: $('trLoopBottomWrap'),
      frame: $('trFrame'), client: $('trClient'),
      btnCalc: $('trBtnCalc'), btnMake: $('trBtnMake'), btnFrame: $('trBtnFrame'),
      auto: $('trAuto'), pick1: $('trPick1'), pick2: $('trPick2'), pickSwap: $('trPickSwap'),
      pickClear: $('trPickClear'), pickState: $('trPickState'),
      out: $('trOut'), review: $('trReview'), ver: $('trVer')
    };
    if (!el.out) { return; }   // 전사 페이지가 없는 빌드 — 조용히 물러난다
    populate();

    var tabs = document.querySelectorAll('.trtab'), i;
    for (i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () { trTab(this.getAttribute('data-trtab')); });
    }
    if (el.btnCalc) el.btnCalc.addEventListener('click', calc);
    if (el.btnMake) el.btnMake.addEventListener('click', make);
    if (el.btnFrame) el.btnFrame.addEventListener('click', openFrame);
    if (el.auto) el.auto.addEventListener('click', function () { autoPick(false); });
    // 마감이 부직포면 봉미싱 cm 칸을 숨긴다(산식이 안 쓴다 — 보이면 사람이 뜻을 찾는다)
    if (el.band) el.band.addEventListener('change', syncFinishUi);
    syncFinishUi();
    if (el.hwTop) el.hwTop.addEventListener('input', refreshHwTotal);
    if (el.hwSide) el.hwSide.addEventListener('input', refreshHwTotal);
    refreshHwTotal();
    if (el.pick1) el.pick1.addEventListener('click', function () { pick(1); });
    if (el.pick2) el.pick2.addEventListener('click', function () { pick(2); });
    if (el.pickSwap) el.pickSwap.addEventListener('click', function () { pickCmd('mesTr_swapPicks()'); });
    if (el.pickClear) el.pickClear.addEventListener('click', function () { pickCmd('mesTr_clearPicks()'); });
    // 벌 수를 바꾸면 벌② 칸의 노출이 달라진다
    if (el.vup) el.vup.addEventListener('change', function () { renderPicks(parseKv(lastPickRaw)); });
    renderPicks(parseKv(lastPickRaw));

    if (el.ver) el.ver.textContent = 'shell ' + TR_SHELL_VERSION;
    // ★미로드를 **부팅 때** 말한다. 종전에는 `none` 을 조용히 넘겨 `host ?` 만 떴고,
    //   사람은 [판 만들기] 를 누르고 나서야 알았다(§조용한 격하).
    // ★사유를 스텁에게 되묻는다 — 「Z: 에 없다」와 「이 PC 스텁이 안 읽는다」는 조치가 완전히 다르다.
    //   ⚠️중첩 삼항은 **ExtendScript 가 왼쪽 결합으로 파싱**하므로 전부 괄호를 친다(audit:jsx-ternary
    //   는 .jsx 만 훑어 이 문자열은 못 본다). ⚠️반환도 ASCII 로 — 사유 원문에 한글 경로가 섞인다.
    host('(typeof mesTr_version === "function") ? mesTr_version()'
      + ' : ((typeof MESPANEL_HOSTS_LOADED !== "string") ? "none reason=oldstub"'
      + ' : ((typeof MESTR_LOAD_ERROR === "string" && MESTR_LOAD_ERROR) ? "none reason=loaderr"'
      + ' : ("none reason=notloaded hosts=" + MESPANEL_HOSTS_LOADED)))', function (v, bad) {
      var miss = String(v).indexOf('none') === 0;
      if (el.ver) el.ver.textContent = 'shell ' + TR_SHELL_VERSION + ' · host ' + ((bad || miss) ? '?' : v);
      if (bad) return;                         // host() 가 이미 사유와 조치를 띄웠다
      if (miss) { el.out.textContent = hostMissingWhy(v); return; }
      if (!verGE(v, TR_MIN_HOST)) {
        el.out.textContent = '⚠ 전사 호스트가 낮습니다(' + v + ') — 판 만들기가 동작하지 않을 수 있습니다';
      }
    });
  }

  // 안 보이는 탭은 호스트를 안 찌른다 — cut-main.js 와 같은 규칙
  document.addEventListener('mes:mainTab', function (e) {
    if (e && e.detail && e.detail.tab === 'tr') boot();
  });
  if (document.body && document.body.getAttribute('data-main') === 'tr') boot();

  window.MesTr = { boot: boot, version: TR_SHELL_VERSION };
})();
