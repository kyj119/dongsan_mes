#target illustrator
/**
 * MES 전사 패널 — ExtendScript 호스트 정본 (Z: 배포 = 축2)
 *
 * 정본 위치 = Z:\DESIGNS\IA-등록\_scripts\mes-tr-host.jsx
 *   패널의 jsx/host.jsx 는 스텁이고 이 파일을 $.evalFile 한다 → **Z: 1곳 교체 = 전 PC 반영**.
 *
 * ★이 호스트는 **계산하지 않는다.** 판·벌·밴드·시접·수축보정은 전부 패널(js/plate.js)이 정하고,
 *   여기는 받은 좌표로 **그리기만** 한다. 계산을 일러 안에 두면 하네스로 검증할 수 없고,
 *   판짜기는 틀려도 판이 나오는 축이라(§조용한 격하) 검증 못 하는 계산은 조용히 어긋난다.
 *
 * ⚠️ ES3 다. const · let · 화살표 · **JSON** · Array.map 금지.
 *    ⚠️구분자를 슬래시로 쓰지 말 것 — 별표 강조 바로 뒤에 슬래시가 붙으면 그 두 글자가
 *    **이 블록 주석을 닫아 버린다**. 그러면 뒤 문장이 코드로 파싱돼 파일 전체가 안 실린다
 *    (2026-09-21 실기: ExtendScript 「구문 오류: 필요 항목: ;」 — 이 파일이 한 번도 안 실렸다).
 *    ⚠️이 경고문을 쓰다가 같은 자리에서 또 당했다. 예시를 리터럴로 적지 말 것.
 *    → 패널은 JSON 대신 **줄 기반 페이로드**를 보낸다(`P:` `N:` `D:` `B:` `M:`).
 * ⚠️ 전역 접두사는 mesTr_* 고정 — A0(mesA0_*)·재단(mesCut_*)과 **같은 전역 스코프를 공유**한다.
 *    이름이 겹치면 나중에 로드된 쪽이 상대를 덮어써 그쪽이 깨진다.
 * ⚠️ 중첩 삼항 금지 — 이 엔진은 삼항을 **왼쪽 결합**으로 읽는다(`audit:jsx-ternary`).
 *    뒤쪽 삼항은 반드시 괄호로 감싼다.
 * ⚠️ 조기 return 은 반드시 사유를 문자열로 돌려준다. 빈값을 돌려주면 패널이 틀린 진단을 띄운다.
 * ⚠️ 반환은 ASCII 만 — 한글을 돌려주면 CEP 브릿지에서 깨진다.
 */

var MESTR_VERSION = 'TR-CEP-0.7.0';   // 0.7.0 = ★**끈고리·하도매 표시**(용준님 2026-09-22 확정 규칙). payload `L:idx,x,y,len,color`(2.5cm 가로선 4pt) · `H:idx,cx,cy,r,color`(Ø5mm 원)를 받아 원본 **위에** 인쇄되는 표시로 그린다. 위치는 패널(`plate.js`, 정본 `plate-rules.marks`)이 계산한다 — 여기엔 산식이 없다. 색 k|w 는 패널이 표시 자리의 굽기 픽셀로 판정하고, 못 정하면 x = 흑선+백테두리(추측하지 않는다). `marks=loop:N,hole:N,key:N` 으로 **센다**. 구 패널은 L/H 를 안 보내므로 아무것도 안 그린다(무해). 잃는 것: 없음. · 0.6.2 = ★**extend 가 38~41분 걸리던 진짜 원인** — 판 문서를 만든 **뒤에** 비활성 원본의 개체 속성을 읽었다(잉크 상자 재기 = 수천 번 읽기 × 수십 ms). 단계별 시각 기록으로 잡았다(480초 동안 첫 줄에서 다음 줄로 못 넘어감). 같은 루프가 원본 활성일 때는 몇 초(pick·bake). → 바탕 정보(`mesTr_backdropInfo`: 종류·CMYK 스탑·램프·각도)를 **`documents.add` 전에** 읽어 숫자로 넘기고, extend 는 원본 개체를 한 번도 안 만진다. ⚠️0.6.1 이 적은 「별색 문서 간 참조」 원인은 **틀렸다**(0.6.1 로도 41분). 그라디언트 재구성은 무해해서 남긴다. 잃는 것: 없음. · 0.6.1 = ★**extend 가 다른 문서의 색 객체를 일절 만지지 않는다(P0)** — 0.6.0 은 원본의 `Gradient` 를 새 사각에 직접 할당했고, PANTONE 별색 스톱이 든 실파일(고양 소노)에서 일러가 CPU 0 으로 멈춰 COM 이 끊겼다(실기 2회, 예외·대화상자 없음). CMYK 스톱 합성 문서는 같은 코드가 8초 — 공통인자는 별색이다. → 판 문서 안에 그라디언트를 새로 만들고 스톱마다 새 CMYKColor 로 옮긴다(`mesTr_toCmyk`, tint 반영). 단일 별색·회색 바탕도 같은 길. 잃는 것: 도련 **띄**의 별색이 CMYK 환산값이 된다(그림은 복제본이라 별색 그대로 · 띄는 재단에서 잘린다). ⚠️실파일 실기 확인은 일러 재시작 뒤 — 배포 전 필수. · 0.6.0 = ★**도련이 3단이 됐다** — 재단은 「무손실 → 자연 → 단색」인데 전사는 ③만 갖고 있었다(형제 스윕 미완). 엔진(`js/bleed.js` Repeat Last Pixel)은 2026-09-18 에 **전사 축 때문에** 변마다 다른 도련(`{t,r,b,l}`)까지 확장돼 게이트(`cut:bleed` §9)까지 붙어 있었는데 **전사 탭이 한 번도 부르지 않았다**. ①**바탕 판정을 바로잡았다(P0)** — `mesTr_findBackdrop` 이 「단색 CMYK 인 패스」만 후보로 보고 **그게 보이는 것인지는 한 번도 안 물었다**. 실기 실측(2026-09-22 · 고양 소노): 벌 전체를 덮는 개체가 위에서부터 [클립패스(칠 없음)] → [**그라디언트** PANTONE 7453 C(57/30/1/0) → 78/81/83/66] → [단색 99/94/59/41] 인데, 가려져 있는 맨 아래 단색을 골라 도련을 깔았다. 아래쪽 실제 그림은 K66 인데 도련은 K41 이라 **연한 띠**가 보였다(용준님 신고). 이제 **맨 위에서 전체를 덮는 불투명한 칠**을 찾고, 그것이 단색이 아니면 `solid` 라고 말하지 않는다(`edge=solid|grad|img|other`). ②**extend** — 바탕이 한 개체면 그것만 벌 크기로 늘린다(`mesTr_bleedExtend`). 벡터라 **무손실**이고 즉시다 — 재단의 「클립 확장」에 해당하는 등급이고, 전사는 클립 밖에 그림이 없는 대신 바탕이 한 개체인 경우가 많아 같은 값을 여기서 얻는다. 늘어나는 비율이 세로 1.7%라 이음매 색차는 램프의 1.7%(실측 그라디언트에서 채널당 0.3 미만)다. ⚠️사진 바탕은 거절하고 ③으로 보낸다 — 늘리면 흐려진다. ③**repeat** — 패널이 `mesTr_bakeSlot` 으로 구운 PNG 의 가장자리 색을 바깥으로 반복해 `Folder.temp/mes_tr_bleed_<i>.png` 에 써 두면 `mesTr_bleedPlacePng` 가 벌 자리에 앉힌다(재단과 **같은 규약** — 경로를 payload 로 주고받지 않는다). ★방식별로 **센다**(`bleedhow=solid:N,ext:N,px:N`) — 합계만 보면 격하가 안 보인다. 잃는 것: `repeat` 는 굽기 왕복이 붙어 벌당 수 초가 든다(단색·늘리기는 즉시). · 0.5.0 = ★**클립을 존중하는 잉크 경계**(`mesTr_inkBounds`) — 용준님이 신고한 두 증상이 **한 원인**이었다(2026-09-21 실기, 일러 30.7, 「260918_고양 소노 가로등배너 20조 발주」). `visibleBounds` 는 **클립이 잘라 낸 부분까지 합쳐서** 답한다: 그룹 clipped=true · 클립 60x180mm · 안의 배치이미지 214.74x163.93mm → **214.74x242.83mm**. ⓐ「자동 분석이 제대로 안 된다」 = 폭이 3.58배로 부풀어 이웃과 겹치니 가로 간격이 사라져 군집이 **10 → 1**(문서 전체가 한 덩어리). ⓑ「만들기 하면 보이지 않는 공백이 많이 나온다」 = 배율·위치를 그 부푼 상자로 잡아 그림이 28%로 줄고 나머지가 빈자리. → 잰다: 클립된 그룹 = **클립 ∩ 콘텐츠**, 아니면 자식 합집합. A0(`mesA0_itemBounds`)·재단(`mesCut_inkBounds`)은 이미 이렇게 하고 있었다 — **전사만 안 따라온 형제 스윕**이다. ★겸해서 **안 그리는 개체를 안 센다**(채움·획 둘 다 없는 패스 · 안내선): 같은 문서에 2점짜리 **5,779mm** 패스가 있어 혼자 문서 전체를 가로질렀다 — 눈에는 안 보이는데 경계에는 들어가 **어떤 군집도 갈라지지 않았다**. 거절은 `blind=` 로 **센다**. ★`position` 은 개체 상자를 보므로 안 쓴다 — 키운 **뒤에** 잉크를 다시 재서 그 차이만큼 `translate` 한다. ⚠️판정이 안 서면 **남긴다**(잘못 버리면 그림이 잘리고, 잘못 남기면 여백이 는다 — 잘리는 쪽이 나쁘다). 잃는 것: 그룹에 **그룹 단위로 건 효과**(그림자 등)가 있으면 자식 합집합이 그만큼 작게 잡힌다(클립·안 그리는 개체가 없는 아트는 종전과 동일). · 0.4.0 = ★둘. ①**자동 분석**(`mesTr_autoPick`) — 문서의 맨 위 개체를 가로 간격으로 갈라 벌에 대응시킨다. 판정 잣대는 가공의 `mesA0_seedCands(d,'auto')` 와 **같게** 뒀다(두 탭이 같은 파일을 다르게 읽으면 디자이너가 「가공은 2개인데 전사는 3개」를 만난다). 덩어리 수가 벌 수와 다르면 **아무것도 지정하지 않고** 개수만 돌려준다. ②**자르는 게 없는 클립은 만들지 않는다** — 실기 보고 「클리핑이 추출된다」. 실측(2026-09-21): 벌 646x1859mm 안에 원본 600x1829mm 이 통째로 들어가 **클립 2개 중 2개가 무의미**했고, 레이어 패널에 `<Clipping Path>` 만 남겼다. 재단이 CUT-CEP-0.49.0 에서 배운 것과 **같은 자리**다(형제 스윕). 전제를 하기 **전에** 재고, 안 서면 하지 않는다 — 거절은 `clipskip=` 으로 **센다**. ⚠️진짜로 삐져나오면 반드시 자른다(안 자르면 도련이 옆 벌을 덮는다). 잃는 것: 없음(그리는 그림·도련·산식 불변, 레이어 구조만 깔끔해진다) · 0.3.0 = ★**1조의 두 벌은 서로 다른 그림이다.** 2026-08 완성판 22건 실측(60-180·60-150 조 단위): 완전 동일 복제 **0건** · 명백히 다른 그림 16건 · 틀만 같고 내용이 다른 것 6건 · **거울상 0건**(거울 겹침 0~7%). 주니그래픽 미래엔1 은 좌반 바탕이 별색 MiraeN Purple_New, 우반이 백색이다. 그런데 0.2.x 까지는 **선택 하나를 두 벌에 복제**했다 — 측정된 22건 전부에서 틀린 판이 나온다. → 벌마다 원본을 따로 받는다(mesTr_pick/picks/swapPicks/clearPicks). 좌우 순서는 **디자이너가 정한다**(용준님 2026-09-21). 슬롯은 패널이 열려 있는 동안만 살고, 쓰기 전에 살아 있는지 확인한다(지운 개체·닫은 문서). 딸려 오는 것 둘 — ①**도련이 벌마다 갈린다**(payload `M:idx,mode[,cmyk]` · 옛 `M:mode` 는 판 전체로 계속 먹는다) ②**밴드 색도 벌마다** 이어야 한다(한 색이면 종전처럼 통째로, 다르면 벌 구간으로 나눠 깐다). 슬롯을 하나도 안 쓰면 현재 선택을 **벌①에만** 넣고 `slot=none` 을 남긴다 — 두 벌 복제로 되돌아가지 않는다. 잃는 것: 지정 없이 [판 만들기] 를 누르면 벌②가 빈다(그 사실을 `empty=2` 와 확인 목록 must 로 알린다) · 0.2.2 = ★[판 만들기] 가 `PARM` 으로 죽던 것. **문서를 넘나드는 `duplicate` 은 그룹을 받으면 안 된다** — 일러 30.7 최소 재현(2026-09-21): 다른 문서의 groupItem 으로 복제 → `1346458189 ('PARM')` · 다른 문서의 **layer** 로 복제 → ok · copy/paste → ok. 원본은 srcDoc 에 있고 그룹은 `documents.add` 로 막 만든 새 문서에 있어 매번 걸렸다. 오류 문구가 코드번호 하나뿐이라 무엇이 틀렸는지 안 알려 준다. → 레이어로 복제한 뒤 **같은 문서 안에서** 그룹으로 모은다(이동은 동일 문서라 안전). 잃는 것: 없음(배치·클리핑·산식 불변) · 0.2.1 = ★이 파일이 **한 번도 안 실렸다**. 머리말 주석의 `const/let/화살표/**JSON**/Array.map` 에서 `**/` 가 블록 주석을 닫아, 뒤 문장이 코드로 파싱되며 파일 전체가 구문 오류였다(ExtendScript: 「구문 오류: 필요 항목: ;」). 0.1.0·0.2.0 둘 다 Z: 에 나갔지만 스텁이 애초에 이 파일을 안 읽어(손목록) **증상이 가려져 있었고**, 스텁을 열거로 고치자(stub-3.0.0) 비로소 드러났다. 고친 것은 주석 한 줄뿐 — 로직·산식·payload 전부 불변. 게이트 = `npm run audit:jsx-syntax`(IA 의 .jsx·패널 js 를 실제로 파싱한다 — 여태 **아무 게이트도 파싱하지 않았다**). 잃는 것: 없음 · 0.2.0 = 
//   0.2.0 = ★원본 배치 + 도련 + 클리핑(2026-09-18). 0.1.0 은 자리 표시 선만 그렸다.
//           · `mesTr_measure` — 고른 원본의 크기와 **바탕이 단색인가**를 잰다.
//             ExtendScript 는 픽셀을 못 읽으므로 **맨 뒤 도형이 전체를 덮는 단색 채움인가**로 본다
//             — 완성본 실측이 정확히 그 모양이었다(소울·솜씨·제주 전부 n=5 단색 사각 + 클리핑).
//           · 배치는 원본을 **세로만 늘린다**(수축보정). 가로는 1.00000 — 실측 4건이 그렇다.
//           · 도련은 바탕색 사각을 **벌 크기**로 깔아서 낸다. 단색이 아니면 **하지 않고 알린다**
//             (§조용한 격하 — 전제가 안 서면 실행하지 않는다).
//   0.1.0 = 신설(2026-09-18). 가로등배너 판 그리기 + 윈드배너 틀 열기.
//           패널이 계산한 좌표를 그대로 그린다 — 여기에는 산식이 없다.
//           단위는 전부 mm 이고, 문서 좌표로 바꿀 때만 pt 로 환산한다.

var MESTR_MM = 2.834645669291339;   // 1mm = 72/25.4 pt

function mesTr_version() { return MESTR_VERSION; }
function mesTr_ping() { return MESTR_VERSION; }

/** mm → pt */
function mesTr_pt(mm) { return mm * MESTR_MM; }

/** 반환에서 한글·제어문자를 걷어낸다 — 브릿지는 ASCII 만 안전하다. */
function mesTr_ascii(s) {
  var out = '', i, c;
  s = String(s === null || s === undefined ? '' : s);
  for (i = 0; i < s.length; i++) {
    c = s.charCodeAt(i);
    if (c >= 0x20 && c < 0x7f) out += s.charAt(i);
    else out += '?';
  }
  return out;
}

/**
 * 줄 기반 페이로드 파서.
 *   `P:w,h;N:x,y,w,h;D:...;B:...;M:mode`
 * 좌표계 = **좌상단 원점 · y 아래로**(패널과 같다). 일러 문서 좌표로는 y 를 뒤집어 쓴다.
 */
function mesTr_parse(payload) {
  var out = { plate: null, panels: [], design: [], bands: [], mode: 'none', color: null, modes: [], loops: [], holes: [] };
  var recs = String(payload || '').split(';');
  var i, r, k, v, n;
  for (i = 0; i < recs.length; i++) {
    r = recs[i];
    if (!r) continue;
    k = r.substring(0, 1);
    v = r.substring(2);
    if (k === 'M') {
      // 벌마다:  `M:0,solid,0,0,100,0` · `M:1,repeat`
      // 옛 형식: `M:solid,0,0,100,0`   (첫 칸이 숫자가 아니면 판 전체에 적용 — 구 패널 호환)
      var mp = v.split(',');
      var idx = -1, off = 0;
      if (/^[0-9]+$/.test(mp[0])) { idx = parseInt(mp[0], 10); off = 1; }
      var one = { mode: mp[off], color: null };
      if (mp.length >= off + 5) {
        one.color = {
          c: parseFloat(mp[off + 1]), m: parseFloat(mp[off + 2]),
          y: parseFloat(mp[off + 3]), k: parseFloat(mp[off + 4])
        };
      }
      if (idx >= 0) out.modes[idx] = one;
      else { out.mode = one.mode; out.color = one.color; }
      continue;
    }
    n = v.split(',');
    if (k === 'P') { out.plate = { w: parseFloat(n[0]), h: parseFloat(n[1]) }; continue; }
    // 끈고리 `L:idx,x,y,len,color` · 하도매 `H:idx,cx,cy,r,color` — 색은 k(검정)|w(백)|x(흑선+백테두리)
    if (k === 'L') { out.loops.push({ i: parseInt(n[0], 10), x: parseFloat(n[1]), y: parseFloat(n[2]), len: parseFloat(n[3]), color: n[4] || 'x' }); continue; }
    if (k === 'H') { out.holes.push({ i: parseInt(n[0], 10), cx: parseFloat(n[1]), cy: parseFloat(n[2]), r: parseFloat(n[3]), color: n[4] || 'x' }); continue; }
    var rect = { x: parseFloat(n[0]), y: parseFloat(n[1]), w: parseFloat(n[2]), h: parseFloat(n[3]) };
    if (k === 'N') out.panels.push(rect);
    else if (k === 'D') out.design.push(rect);
    else if (k === 'B') out.bands.push(rect);
  }
  return out;
}

/** 유한한 숫자인가 — NaN 이 그대로 들어가면 일러가 PARM 으로 죽고 사유가 안 남는다. */
function mesTr_num(v) { return (typeof v === 'number') && !isNaN(v) && isFinite(v); }

function mesTr_rectOk(r) {
  return r && mesTr_num(r.x) && mesTr_num(r.y) && mesTr_num(r.w) && mesTr_num(r.h) && r.w > 0 && r.h > 0;
}

/** pt → mm */
function mesTr_mm(pt) { return pt / MESTR_MM; }

// ── ★클립을 존중하는 「보이는 잉크」 경계 ───────────────────────────────
//
// **`visibleBounds` 는 클립이 잘라 낸 부분까지 합쳐서 답한다.**
// 실기 실측(2026-09-21 · 일러 30.7 · 「260918_고양 소노 가로등배너 20조 발주」):
//     그룹 clipped=true · 클립 패스 60x180mm · 안의 배치이미지 214.74x163.93mm
//     → visibleBounds = **214.74x242.83mm**(둘의 합집합). 화면에 보이는 것은 60x180 뿐이다.
// 이 거짓말 하나가 용준님이 신고한 두 증상 **둘 다**였다:
//   ⓐ 「자동 분석이 제대로 안 된다」 — 폭이 3.58배로 부풀어 이웃과 겹치니 가로 간격이 사라진다.
//      실측: 같은 문서에서 군집이 **10 → 1**(문서 전체가 한 덩어리)이 됐다.
//   ⓑ 「만들기 하면 보이지 않는 공백이 많이 나온다」 — 배치 배율·위치를 이 부푼 상자로 잡으니
//      그림은 28%로 줄어 한쪽에 몰리고 나머지가 전부 빈자리가 된다.
//
// ★A0(`mesA0_itemBounds`)·재단(`mesCut_inkBounds`)은 **이미** 클립 ∩ 콘텐츠로 통일했는데
//   전사만 안 따라왔다(§형제 스윕 — 호스트가 셋이면 같은 결정도 셋이다).
//
// ★여기에 하나 더 있다 — **아무것도 그리지 않는 개체**. 같은 문서에 채움도 획도 없는 2점짜리
//   **5,779mm** 패스가 하나 있어 혼자서 문서 전체를 가로질렀다. 눈에는 안 보이는데 경계에는
//   들어가므로 **어떤 군집도 갈라지지 않는다.** 안 그리는 것은 세지 않는다(안내선도 같다).
//
// ⚠️판정이 안 서면 **남긴다.** 잘못 버리면 그림이 잘리고, 잘못 남기면 여백이 는다 — 잘리는 쪽이 나쁘다.

function mesTr_rectIntersect(a, b) {
  if (!a) return b; if (!b) return a;
  var iL = Math.max(a[0], b[0]), iR = Math.min(a[2], b[2]);
  var iT = Math.min(a[1], b[1]), iB = Math.max(a[3], b[3]);
  return (iL < iR && iB < iT) ? [iL, iT, iR, iB] : null;
}

/** 클립 패스의 경계 — 중첩 그룹까지 내려가며 찾는다 */
function mesTr_findClipPath(item) {
  try {
    if (item.clipping) return item.geometricBounds;
    if (item.typename === 'GroupItem') {
      for (var j = 0; j < item.pageItems.length; j++) {
        var r = mesTr_findClipPath(item.pageItems[j]);
        if (r) return r;
      }
    }
  } catch (e) { /* ignore: 탐색 중 참조 무효 개체는 건너뛴다 — 경계는 남은 개체로 계산한다 */ }
  return null;
}

function mesTr_clipBounds(group) {
  for (var j = 0; j < group.pageItems.length; j++) {
    try { if (group.pageItems[j].clipping) return group.pageItems[j].geometricBounds; } catch (e) { /* ignore: 개체 종류·상태에 따라 없는 속성 — 기본값으로 건너뛴다 */ }
  }
  var r = mesTr_findClipPath(group);
  return r ? r : group.geometricBounds;
}

/** 이 개체가 **무언가를 그리는가**. 판정이 안 서면 true(남긴다). */
function mesTr_draws(item) {
  try {
    if (item.guides) return false;                 // 안내선은 인쇄되지 않는다
    if (item.typename === 'PathItem') return !!(item.filled || item.stroked);
    if (item.typename === 'CompoundPathItem') {
      var ps = item.pathItems;
      if (!ps || !ps.length) return true;          // 못 세면 남긴다
      for (var j = 0; j < ps.length; j++) {
        if (ps[j].filled || ps[j].stroked) return true;
      }
      return false;
    }
  } catch (e) { return true; }                     // 못 물어보면 남긴다
  return true;
}

/** 클립 패스를 뺀 실제 콘텐츠 경계 */
function mesTr_contentUnion(group) {
  var L = null, T = null, R = null, B = null;
  try {
    for (var j = 0; j < group.pageItems.length; j++) {
      var c = group.pageItems[j];
      if (c.clipping || c.hidden) continue;
      var cb = mesTr_inkBounds(c);
      if (!cb) continue;
      if (L === null || cb[0] < L) L = cb[0];
      if (T === null || cb[1] > T) T = cb[1];
      if (R === null || cb[2] > R) R = cb[2];
      if (B === null || cb[3] < B) B = cb[3];
    }
  } catch (e) { /* ignore: 탐색 중 참조 무효 개체는 건너뛴다 — 경계는 남은 개체로 계산한다 */ }
  return (L === null) ? null : [L, T, R, B];
}

/**
 * ★개체의 **보이는 잉크** 경계 — 클립된 그룹이면 클립 ∩ 콘텐츠, 아니면 자식들의 합집합.
 * 클립도 안 그리는 개체도 없는 보통 아트는 `visibleBounds` 그대로다(회귀 0).
 * @return [l, t, r, b] 또는 **null**(= 아무것도 안 그린다). null 은 세되 경계에는 넣지 않는다.
 */
function mesTr_inkBounds(item) {
  var t;
  try { t = item.typename; } catch (e) { return null; }
  try { if (item.hidden) return null; } catch (e0) { /* ignore: 개체 종류·상태에 따라 없는 속성 — 기본값으로 건너뛴다 */ }
  if (t === 'GroupItem') {
    var clipped = false;
    try { clipped = !!item.clipped; } catch (e1) { /* ignore: 개체 종류·상태에 따라 없는 속성 — 기본값으로 건너뛴다 */ }
    if (clipped) {
      var inter = mesTr_rectIntersect(mesTr_clipBounds(item), mesTr_contentUnion(item));
      return inter ? inter : mesTr_clipBounds(item);
    }
    // ★그리는 자식이 하나도 없으면 **null** 이다 — 재단은 여기서 visibleBounds 로 떨어지는데,
    //   그러면 방금 걷어낸 부푼 상자가 되살아난다.
    return mesTr_contentUnion(item);
  }
  if (!mesTr_draws(item)) return null;
  try { return item.visibleBounds; } catch (e2) { return null; }
}

/**
 * 고른 원본을 잰다 — 크기와 **바탕이 단색인가**.
 *
 * ★ExtendScript 는 픽셀을 못 읽는다. 그래서 「가장자리가 단색인가」를 직접 볼 수 없다.
 *   대신 **맨 뒤 도형이 전체를 덮는 단색 채움인가**를 본다 — 2026-09 완성본 실측에서
 *   소울·솜씨·제주 전부 그 모양이었다(n=5 단색 사각을 깔고 그 위에 디자인, 클리핑으로 마감).
 *   그 모양이 아니면 **모른다고 답한다**(edge=unknown) — 추측해서 solid 라고 하지 않는다.
 *
 * @return 'OK w=.. h=.. edge=solid|unknown [c=..m=..y=..k=..]' 또는 'ERROR ..'
 */
function mesTr_measure() {
  try {
    if (app.documents.length === 0) return 'ERROR no document';
    var doc = app.activeDocument;
    var sel = doc.selection;
    if (!sel || sel.length === 0) return 'ERROR nothing selected';

    // 판정은 mesTr_measureItems 한 곳에서 한다 — 슬롯과 **같은 잣대**여야 한다.
    var mm = mesTr_measureItems(sel);
    if (!mm.ok) return 'ERROR ' + mm.err;
    return 'OK w=' + mm.w + ' h=' + mm.h + ' edge=' + mm.edge
      + (mm.edge === 'solid' ? (' c=' + mm.c + ' m=' + mm.m + ' y=' + mm.y + ' k=' + mm.k) : '');
  } catch (e) {
    return 'ERROR measure ' + mesTr_ascii(e && e.message ? e.message : e);
  }
}

function mesTr_r2(v) { return Math.round(v * 100) / 100; }

// ── 원본 슬롯 — 벌마다 다른 그림 ────────────────────────────────────
/**
 * ★**가로등 1조의 두 벌은 서로 다른 그림이다.**
 *   2026-08 완성판 22건 실측(60-180·60-150, 조 단위):
 *     완전 동일 복제 **0건** · 명백히 다른 그림 16건 · 틀만 같고 내용이 다른 것 6건 · 거울상 0건.
 *   (주니그래픽 미래엔1 은 좌반 바탕이 별색 MiraeN Purple_New, 우반은 백색이다.)
 *   그래서 **선택 하나를 두 벌에 복제하면 측정된 22건 전부에서 틀린 판이 나온다** —
 *   0.2.x 까지가 정확히 그랬다. 벌마다 원본을 따로 받는다.
 *
 * ★바탕색이 벌마다 다르므로 **도련도 벌마다 따로** 정해야 한다(payload 의 `M:idx,...`).
 *
 * ★슬롯은 **패널이 열려 있는 동안만** 산다 — 스텁이 이 파일을 다시 읽으면 비워진다.
 *   그게 맞다. 다른 작업으로 넘어갔는데 지난 선택이 남아 있으면 그게 더 위험하다.
 * ★참조를 들고 있으므로 **쓰기 전에 살아 있는지 확인한다**(지워졌거나 문서가 닫혔을 수 있다).
 */
var MESTR_PICK = [];

function mesTr_pickAlive(p) {
  try {
    if (!p || !p.items || !p.items.length) return false;
    var i;
    for (i = 0; i < p.items.length; i++) { if (!p.items[i].typename) return false; }
    return true;
  } catch (e) { return false; }
}

/** 고른 개체들의 크기와 「바탕이 단색인가」. 선택이든 슬롯이든 **같은 잣대**를 쓴다. */
function mesTr_measureItems(items) {
  var i, b, x0 = null, y0 = null, x1 = null, y1 = null;
  for (i = 0; i < items.length; i++) {
    b = mesTr_inkBounds(items[i]);   // [left, top, right, bottom] (y 는 위가 큼) — ★클립을 존중한다
    if (!b) continue;                // 아무것도 안 그리는 개체는 크기에 넣지 않는다
    if (x0 === null || b[0] < x0) x0 = b[0];
    if (y0 === null || b[1] > y0) y0 = b[1];
    if (x1 === null || b[2] > x1) x1 = b[2];
    if (y1 === null || b[3] < y1) y1 = b[3];
  }
  if (x0 === null) return { ok: false, err: 'no bounds' };
  var o = { ok: true, w: mesTr_r2(mesTr_mm(x1 - x0)), h: mesTr_r2(mesTr_mm(y0 - y1)), edge: 'unknown' };
  // ★**보이는** 바탕이 무엇인가를 그대로 전한다 — `solid` 하나로 뭉개면 패널이 도련 방식을 못 고른다.
  //   solid = 단색(그 색으로 깐다) · grad = 그라디언트(개체를 늘린다) · img/other = 픽셀로 잇는다
  var bg = mesTr_findBackdrop(items, x0, y0, x1, y1);
  if (bg && bg.kind === 'solid') {
    var col = bg.it.fillColor;
    o.edge = 'solid';
    o.c = mesTr_r2(col.cyan); o.m = mesTr_r2(col.magenta);
    o.y = mesTr_r2(col.yellow); o.k = mesTr_r2(col.black);
  } else if (bg) {
    o.edge = bg.kind;
  }
  return o;
}

/** 슬롯 한 칸의 상태를 **접두사 붙은 키**로 — 패널이 공백으로 쪼개 읽는다(키가 겹치면 안 된다). */
function mesTr_pickLine(i) {
  var t = 's' + (i + 1), p = MESTR_PICK[i];
  if (!p) return t + '=none';
  if (!mesTr_pickAlive(p)) return t + '=lost';
  var m = p.m, out = t + '=ok ' + t + 'n=' + p.items.length
    + ' ' + t + 'w=' + m.w + ' ' + t + 'h=' + m.h + ' ' + t + 'edge=' + m.edge;
  if (m.edge === 'solid') {
    out += ' ' + t + 'c=' + m.c + ' ' + t + 'm=' + m.m + ' ' + t + 'y=' + m.y + ' ' + t + 'k=' + m.k;
  }
  return out;
}

/** 지금 고른 것을 슬롯에 넣는다. slot = 1(좌) | 2(우) — 좌우는 **디자이너가 정한다**. */
function mesTr_pick(slot) {
  try {
    var n = parseInt(slot, 10);
    if (!(n === 1 || n === 2)) return 'ERROR slot must be 1 or 2';
    if (app.documents.length === 0) return 'ERROR no document';
    var sel = app.activeDocument.selection;
    if (!sel || sel.length === 0) return 'ERROR nothing selected';
    var items = [], i;
    for (i = 0; i < sel.length; i++) items.push(sel[i]);
    var m = mesTr_measureItems(items);
    if (!m.ok) return 'ERROR ' + m.err;
    MESTR_PICK[n - 1] = { items: items, m: m };
    return 'OK ' + mesTr_pickLine(0) + ' ' + mesTr_pickLine(1);
  } catch (e) { return 'ERROR pick ' + mesTr_ascii(e && e.message ? e.message : e); }
}

function mesTr_picks() { return 'OK ' + mesTr_pickLine(0) + ' ' + mesTr_pickLine(1); }

/**
 * 문서의 **맨 위 개체**를 모은다 — 잠기거나 숨은 것은 뺀다.
 * ★가공의 `mesA0_seedCands(d, 'auto')` 와 **같은 잣대**다. 두 탭이 같은 파일을 다르게 읽으면
 *   디자이너가 「가공에서는 2개로 보이는데 전사에서는 3개」를 만나게 된다.
 * ⚠️블록 안 함수 '선언' 은 ES3 규격 밖이라 var 표현식으로 못박는다(가공 쪽 주석과 같은 이유).
 */
function mesTr_topItems(d) {
  var tops = [];
  var collect = function (ly) {
    try {
      if (ly.locked || !ly.visible) return;
      for (var i = 0; i < ly.pageItems.length; i++) {
        var it = ly.pageItems[i];
        try { if (!it.locked && !it.hidden) tops.push(it); } catch (eIt) { /* ignore: 개체 종류·상태에 따라 없는 속성 — 기본값으로 건너뛴다 */ }
      }
      for (var s2 = 0; s2 < ly.layers.length; s2++) collect(ly.layers[s2]);
    } catch (eLy) { /* ignore: 탐색 중 참조 무효 개체는 건너뛴다 — 경계는 남은 개체로 계산한다 */ }
  };
  try { for (var l = 0; l < d.layers.length; l++) collect(d.layers[l]); }
  catch (eScan) { return []; }
  return tops;
}

/**
 * 파일을 보고 **좌·우를 스스로 가른다.** 사람은 순서만 바꾸면 된다(용준님 2026-09-21).
 *
 * ★가로 간격으로 덩어리를 나눈다 — 한 디자인 안의 요소들은 붙어 있고, 두 디자인 사이는 떨어져 있다.
 * ★**덩어리 수가 벌 수와 다르면 아무것도 지정하지 않는다.** 억지로 가르면 반쪽짜리 판이 조용히
 *   나간다(§조용한 격하). 몇 덩어리로 보이는지만 돌려주고 사람이 [벌① 지정] 으로 직접 고른다.
 * ★왼쪽이 벌① 이다 — 좌우 순서는 디자이너가 [⇄] 로 바꾼다.
 *
 * @param vup   벌 수(1|2)
 * @param gapMm 이만큼 떨어지면 다른 덩어리로 본다
 */
function mesTr_autoPick(vup, gapMm) {
  try {
    var want = parseInt(vup, 10) || 2;
    var gap = parseFloat(gapMm);
    if (!(gap >= 0)) gap = 5;
    if (app.documents.length === 0) return 'ERROR no document';
    var tops = mesTr_topItems(app.activeDocument);
    if (!tops.length) return 'ERROR no art';

    // ★겉보기가 아니라 **보이는 잉크**로 가른다. 실측(2026-09-21): 같은 문서에서 군집 1 → 10.
    //   안 그리는 개체는 군집에 넣지 않되 **센다**(`blind=`) — 조용히 빼면 그게 다음 사각지대다.
    var rows = [], i, b, blind = 0;
    for (i = 0; i < tops.length; i++) {
      b = mesTr_inkBounds(tops[i]);
      if (!b) { blind++; continue; }
      rows.push({ it: tops[i], l: b[0], r: b[2], cx: (b[0] + b[2]) / 2 });
    }
    if (!rows.length) return 'ERROR no art';
    rows.sort(function (a, c) { return a.l - c.l; });

    // ★**아트보드를 먼저 본다.** 간격으로만 가르면 두 그림이 **딱 붙어 있을 때 한 덩어리**가 된다
    //   (2026-09-21 실측에서 실제로 그랬다 — 600mm 짜리 둘이 경계에서 맞닿으면 간격이 0이다).
    //   아트보드가 벌 수와 같으면 그게 사람이 이미 그어 둔 경계다 — 추측할 것이 없다.
    var abs = null;
    try { abs = app.activeDocument.artboards; } catch (eA) { abs = null; }
    if (abs && abs.length === want) {
      var box = [], q;
      for (q = 0; q < abs.length; q++) box.push({ i: q, r: abs[q].artboardRect });   // [l, t, r, b]
      box.sort(function (a, c) { return a.r[0] - c.r[0]; });                          // 왼쪽이 벌①
      var bag = [], ok2 = true;
      for (q = 0; q < box.length; q++) bag.push([]);
      for (i = 0; i < rows.length; i++) {
        var hit = -1;
        for (q = 0; q < box.length; q++) {
          if (rows[i].cx >= box[q].r[0] && rows[i].cx <= box[q].r[2]) { hit = q; break; }
        }
        if (hit < 0) { ok2 = false; break; }      // 어느 아트보드에도 안 들어가는 개체가 있다 → 간격으로 간다
        bag[hit].push(rows[i].it);
      }
      for (q = 0; ok2 && q < bag.length; q++) if (!bag[q].length) ok2 = false;   // 빈 아트보드가 있으면 못 믿는다
      if (ok2) {
        var pa = [];
        for (q = 0; q < bag.length && q < 2; q++) {
          var ma = mesTr_measureItems(bag[q]);
          if (!ma.ok) { ok2 = false; break; }
          pa[q] = { items: bag[q], m: ma };
        }
        if (ok2) {
          MESTR_PICK = pa;
          return 'OK auto=yes by=artboard found=' + bag.length + ' blind=' + blind
            + ' ' + mesTr_pickLine(0) + ' ' + mesTr_pickLine(1);
        }
      }
    }

    var gpt = mesTr_pt(gap);
    var cl = [], cur = { r: rows[0].r, items: [rows[0].it] };
    for (i = 1; i < rows.length; i++) {
      if (rows[i].l <= cur.r + gpt) {
        cur.items.push(rows[i].it);
        if (rows[i].r > cur.r) cur.r = rows[i].r;
      } else {
        cl.push(cur);
        cur = { r: rows[i].r, items: [rows[i].it] };
      }
    }
    cl.push(cur);

    if (cl.length !== want) {
      return 'OK auto=no by=gap found=' + cl.length + ' want=' + want + ' blind=' + blind
        + ' ' + mesTr_pickLine(0) + ' ' + mesTr_pickLine(1);
    }
    var next = [];
    for (i = 0; i < cl.length && i < 2; i++) {
      var m = mesTr_measureItems(cl[i].items);
      if (!m.ok) return 'ERROR measure cluster ' + (i + 1);
      next[i] = { items: cl[i].items, m: m };
    }
    MESTR_PICK = next;   // ★전부 잰 뒤에 갈아끼운다 — 도중에 실패하면 옛 지정이 살아 있어야 한다
    return 'OK auto=yes by=gap found=' + cl.length + ' blind=' + blind
      + ' ' + mesTr_pickLine(0) + ' ' + mesTr_pickLine(1);
  } catch (e) { return 'ERROR autoPick ' + mesTr_ascii(e && e.message ? e.message : e); }
}

function mesTr_swapPicks() {
  var t = MESTR_PICK[0]; MESTR_PICK[0] = MESTR_PICK[1]; MESTR_PICK[1] = t;
  return mesTr_picks();
}

function mesTr_clearPicks() { MESTR_PICK = []; return mesTr_picks(); }

/**
 * 전체를 덮는 단색 CMYK 채움 패스를 찾는다. 없으면 null.
 * ⚠️ 「거의 덮는」 것도 인정하지 않는다 — 1mm 라도 모자라면 그 변의 도련이 비게 된다.
 */
function mesTr_findBackdrop(sel, x0, y0, x1, y1) {
  var TOL = MESTR_MM * 0.5;   // 0.5mm
  var found = null;

  // **페인트 순서로 위에서부터** 훑는다 — `pageItems[0]` 이 맨 위다.
  // 전체를 덮는 불투명한 칠을 처음 만나면 거기서 멈춘다. 그 아래는 보이지 않기 때문이다.
  var look = function (it) {
    if (found) return;
    var kids = null;
    try { kids = it.pageItems; } catch (eK) { kids = null; }
    if (kids && kids.length) {
      for (var j = 0; j < kids.length; j++) { look(kids[j]); if (found) return; }
      return;
    }
    var tn;
    try { tn = it.typename; } catch (eT) { return; }
    try { if (it.hidden) return; } catch (eH) { /* ignore: 개체 종류에 따라 없는 속성 — 보이는 것으로 본다 */ }
    var b;
    try { b = it.geometricBounds; } catch (eB) { return; }
    if (b[0] > x0 + TOL || b[1] < y0 - TOL || b[2] < x1 - TOL || b[3] > y1 + TOL) return;   // 전체를 안 덮는다

    // 반투명하면 아래가 비친다 — 무엇이 보이는지 우리가 말할 수 없다.
    var op = 100;
    try { op = it.opacity; } catch (eO) { /* ignore: 없는 속성 — 불투명으로 본다 */ }
    if (op < 99.5) { found = { it: it, kind: 'other' }; return; }

    if (tn === 'RasterItem' || tn === 'PlacedItem') { found = { it: it, kind: 'img' }; return; }
    var fil = false;
    try { fil = !!it.filled; } catch (eF) { /* ignore: 없는 속성 — 칠이 없는 것으로 본다 */ }
    if (!fil) return;                       // 클립 패스처럼 칠이 없는 것은 아무것도 가리지 않는다
    var ct = 'other';
    try { ct = it.fillColor.typename; } catch (eC) { /* ignore: 못 읽으면 모르는 것으로 둔다 */ }
    if (ct === 'CMYKColor') { found = { it: it, kind: 'solid' }; return; }
    if (ct === 'GradientColor') { found = { it: it, kind: 'grad' }; return; }
    found = { it: it, kind: 'other' };      // 별색·무늬·회색 — 단색이라고 말하지 않는다
  };

  for (var i = 0; i < sel.length; i++) { look(sel[i]); if (found) break; }
  return found;
}

/**
 * 판 문서를 만들고 벌·밴드 자리를 그린다.
 *
 * ★그리는 것은 **자리 표시**다(원본 배치·도련·클리핑은 다음 단계).
 *   지금 단계에서 사람이 확인해야 하는 것은 「판·벌·밴드 치수가 맞는가」 하나다.
 * @param payload  mesTr_parse 가 읽는 줄 기반 문자열
 * @return ASCII 결과 문자열. 실패는 'ERROR ' 로 시작한다.
 */
// ── 도련 3단 ─────────────────────────────────────────────────────────
//
// 재단이 「무손실 → 자연 → 단색」 3단인데(CUT-CEP-0.45.0) **전사는 ③만 갖고 있었다.**
// 엔진(`js/bleed.js` Repeat Last Pixel)은 2026-09-18 에 **전사 축 때문에** 변마다 다른 도련
// (`{t,r,b,l}`)까지 확장됐는데, 정작 전사 탭이 한 번도 부르지 않았다(형제 스윕 미완).
//
//   ① extend — 바탕이 **한 개체**면 그것만 벌 크기로 늘린다. 벡터라 **무손실**이고 즉시다.
//               재단의 「클립 확장」에 해당하는 등급이다. 전사는 클립 밖에 그림이 없는 대신
//               바탕이 한 개체인 경우가 많아, 같은 값을 여기서 얻는다.
//   ② repeat — 가장자리 색을 바깥으로 반복한다(패널이 픽셀로 만들어 PNG 로 넘긴다).
//   ③ solid  — 가장자리가 **진짜로** 단색일 때만. 2026-09-22 까지 이것 하나였고,
//               바탕 판정이 **가려진 개체**를 골라 실기에서 틀린 색이 나갔다.

/** 진단 훅 — 프로브가 `$.global.MESTR_TRACE_ON = true` 를 켜면 단계별 시각을 temp 파일에 흘린다. 평소에는 무비용. */
function mesTr_trace(msg) {
  try {
    if (!$.global.MESTR_TRACE_ON) return;
    var f = new File(Folder.temp.fsName.replace(/\\/g, '/') + '/mes_tr_trace.txt');
    f.encoding = 'UTF-8'; f.open('a'); f.write(new Date().getTime() + ' ' + msg + '\n'); f.close();
  } catch (e) { /* ignore: 진단 훅 실패는 동작에 영향 없음 */ }
}

/** 어떤 색이든 **새 CMYKColor** 로 — 별색은 그 환산값(tint 반영), 회색은 K, 못 읽으면 검정. 다른 문서의 객체를 들고 가지 않기 위해서다. */
function mesTr_toCmyk(col) {
  var o = new CMYKColor();
  try {
    var t = col.typename;
    if (t === 'CMYKColor') { o.cyan = col.cyan; o.magenta = col.magenta; o.yellow = col.yellow; o.black = col.black; return o; }
    if (t === 'SpotColor') {
      var k = col.spot.color, tint = (typeof col.tint === 'number') ? col.tint / 100 : 1;
      if (k && k.typename === 'CMYKColor') { o.cyan = k.cyan * tint; o.magenta = k.magenta * tint; o.yellow = k.yellow * tint; o.black = k.black * tint; return o; }
      if (k && k.typename === 'GrayColor') { o.black = k.gray * tint; return o; }
    }
    if (t === 'GrayColor') { o.black = col.gray; return o; }
    if (t === 'RGBColor') { o.cyan = 100 - col.red / 2.55; o.magenta = 100 - col.green / 2.55; o.yellow = 100 - col.blue / 2.55; return o; }
  } catch (e) { /* ignore: 색을 못 읽으면 검정 — 도련 띄는 재단에서 잘린다 */ }
  o.black = 100;
  return o;
}

/**
 * 바탕 개체를 **늘려서** 도련을 만든다 — 그라디언트·별색이 그대로 이어진다(무손실).
 * ⚠️늘리는 것은 **바탕 하나뿐**이다. 그림·글자는 원본 그대로 위에 놓인다.
 * ⚠️사진 바탕은 여기로 보내지 않는다 — 늘리면 흐려진다. 그건 ②가 받는다.
 * @return true = 깔았다
 */
/**
 * 원본의 바탕을 **미리 읽어 둔 숫자**로 벌 크기 사각을 그린다 — 원본 개체는 여기서 한 번도 만지지 않는다.
 *
 * ★2026-09-22 실측(고양 소노 · 일러 30.7): 판 문서를 `documents.add` 로 만든 **뒤에** 원본(비활성 문서)의
 *   개체 속성을 읽으면 한 번에 수십 ms 가 든다 — 잉크 상자 재기(수천 번 읽기)가 **38~41분**이었다.
 *   같은 루프가 원본이 활성일 때(pick·bake)는 몇 초다. 그래서 읽기는 전부 `mesTr_backdropInfo` 로
 *   **판을 만들기 전에** 끝내고, 여기는 숫자만 받는다. (별색 가설은 틀렸다 — 0.6.1 의 그라디언트
 *   재구성은 그대로 두되, 느렸던 이유는 이것이다.)
 * @param info  mesTr_backdropInfo() 결과 · null 이면 만들지 않는다
 * @return true = 깔았다
 */
function mesTr_bleedExtend(lyArt, info, pan, place) {
  var cp = null;
  try {
    if (!info || info.kind === 'img' || info.kind === 'none') return false;
    var g = place(pan);
    cp = lyArt.pathItems.rectangle(g[1], g[0], g[2], g[3]);
    cp.stroked = false;
    cp.filled = true;
    if (info.kind === 'grad') {
      var g2 = lyArt.parent.gradients.add();
      try { g2.type = (info.radial ? GradientType.RADIAL : GradientType.LINEAR); } catch (eT) { /* ignore: 형을 못 놓으면 기본(선형) */ }
      while (g2.gradientStops.length < info.stops.length) g2.gradientStops.add();
      for (var si = 0; si < info.stops.length; si++) {
        var st = info.stops[si], dst = g2.gradientStops[si];
        var col = new CMYKColor(); col.cyan = st.c; col.magenta = st.m; col.yellow = st.y; col.black = st.k;
        dst.color = col;
        try { dst.rampPoint = st.ramp; } catch (eR) { /* ignore: 램프 위치를 못 놓으면 기본 */ }
        try { dst.midPoint = st.mid; } catch (eM) { /* ignore: 중간점을 못 놓으면 기본 */ }
      }
      var gc = new GradientColor();
      gc.gradient = g2;
      cp.fillColor = gc;
      // 각도는 매트릭스에서 읽어 둔 값 — 칠만 회전한다(`.angle` 은 못 믿는다, CLAUDE.md §ExtendScript)
      if (Math.abs(info.ang) > 0.01) cp.rotate(info.ang, false, false, true, false, Transformation.CENTER);
    } else {
      var one = new CMYKColor(); one.cyan = info.c; one.magenta = info.m; one.yellow = info.y; one.black = info.k;
      cp.fillColor = one;
    }
    return true;
  } catch (e) {
    try { if (cp) cp.remove(); } catch (e2) { /* ignore: 임시 개체 정리 — 이미 지워졌거나 참조 무효 */ }
    return false;
  }
}

/**
 * 원본의 바탕을 **원본 문서가 활성일 때** 읽어 숫자로 돌려준다 — 판 문서를 만들기 전에 부른다.
 * @return { kind:'solid'|'grad'|'img'|'other'|'none', c,m,y,k | stops:[{c,m,y,k,ramp,mid}], ang, radial }
 */
function mesTr_backdropInfo(srcItems) {
  var out = { kind: 'none' };
  try {
    var L = null, T = null, R = null, B = null, i, b;
    for (i = 0; i < srcItems.length; i++) {
      b = mesTr_inkBounds(srcItems[i]);
      if (!b) continue;
      if (L === null || b[0] < L) L = b[0];
      if (T === null || b[1] > T) T = b[1];
      if (R === null || b[2] > R) R = b[2];
      if (B === null || b[3] < B) B = b[3];
    }
    if (L === null) return out;
    var bg = mesTr_findBackdrop(srcItems, L, T, R, B);
    if (!bg) return out;
    out.kind = bg.kind;
    if (bg.kind === 'img') return out;
    var sc = bg.it.fillColor;
    if (bg.kind === 'grad') {
      var srcG = sc.gradient;
      out.stops = [];
      try { out.radial = (srcG.type === GradientType.RADIAL); } catch (eT) { out.radial = false; }
      for (var si = 0; si < srcG.gradientStops.length; si++) {
        var st = srcG.gradientStops[si], cc = mesTr_toCmyk(st.color);
        var ramp = 0, mid = 50;
        try { ramp = st.rampPoint; } catch (eR) { /* ignore: 못 읽으면 0 */ }
        try { mid = st.midPoint; } catch (eM) { /* ignore: 못 읽으면 50 */ }
        out.stops.push({ c: cc.cyan, m: cc.magenta, y: cc.yellow, k: cc.black, ramp: ramp, mid: mid });
      }
      var ang = 0, mx = null;
      try { mx = sc.matrix; } catch (eX) { mx = null; }
      if (mx && typeof mx.mValueA === 'number') ang = Math.atan2(mx.mValueB, mx.mValueA) * 180 / Math.PI;
      else { try { ang = sc.angle || 0; } catch (eA) { ang = 0; } }
      out.ang = ang;
    } else {
      var one = mesTr_toCmyk(sc);
      out.c = one.cyan; out.m = one.magenta; out.y = one.yellow; out.k = one.black;
    }
  } catch (e) { out.kind = 'none'; }
  return out;
}

/**
 * 패널이 만든 도련 PNG 를 벌 자리에 앉힌다.
 * ★경로를 payload 로 주고받지 않는다 — 임시 폴더에 한글이 섞이면 ASCII 브릿지에서 깨진다.
 *   재단과 **같은 규약**: 이름 고정(`mes_tr_bleed_<i>.png`) · 폴더는 `Folder.temp`.
 * ★크기는 **벌에 딱 맞춘다** — 패널이 pad 를 올림하므로 실제 PNG 는 1px 만큼 클 수 있다.
 *   그대로 놓으면 옆 벌을 0.2mm 침범한다. 여기서 맞추면 어긋남이 0 이다.
 */
function mesTr_bleedPlacePng(layer, idx, pan, place) {
  var pi = null;
  try {
    var f = new File(Folder.temp.fsName.replace(/\\/g, '/') + '/mes_tr_bleed_' + idx + '.png');
    if (!f.exists) return false;
    pi = layer.placedItems.add();
    pi.file = f;
    var g = place(pan);                       // [left, top, w, h] (pt)
    pi.width = g[2];
    pi.height = g[3];
    var pb = pi.visibleBounds;
    pi.translate(g[0] - pb[0], g[1] - pb[1]);
    pi.zOrder(ZOrderMethod.SENDTOBACK);       // 도련은 원본에 가려야 한다
  } catch (e) {
    try { if (pi) pi.remove(); } catch (e2) { /* ignore: 임시 개체 정리 — 이미 지워졌거나 참조 무효 */ }
    return false;
  }
  // ★링크를 끊는다 — temp 의 PNG 는 지워진다. embed 는 참조를 무효화하므로 **여기가 마지막**이다.
  try { pi.embed(); } catch (e3) { /* ignore: 임베드 실패해도 배치는 성공 — EPS 저장이 링크를 품는 경로가 있다 */ }
  return true;
}

/**
 * 슬롯의 원본을 PNG 로 굽는다 — 패널이 가장자리 색을 읽어 도련을 만든다(②).
 * ★투명을 켠다. `repeatLastPixel` 은 **알파로 잉크를 가른다** — 흰 배경으로 굳히면
 *   그림이 없는 자리까지 잉크로 읽혀 가장자리 색이 흰색이 된다.
 * @param mmPerPx  굽는 해상도. 패널이 예산에서 정해 보낸다.
 * @return 'ok;w=..;h=..;path=..' | 'ERROR ..'
 */
function mesTr_bakeSlot(idx, mmPerPx) {
  var tmp = null, saveAlerts = null;
  try {
    if (!(mmPerPx > 0)) return 'ERROR bake mmpp';
    var slot = MESTR_PICK[idx];
    if (!slot || !mesTr_pickAlive(slot)) return 'ERROR bake noslot';
    var items = slot.items, i, b;
    var L = null, T = null, R = null, B = null;
    for (i = 0; i < items.length; i++) {
      b = mesTr_inkBounds(items[i]);
      if (!b) continue;
      if (L === null || b[0] < L) L = b[0];
      if (T === null || b[1] > T) T = b[1];
      if (R === null || b[2] > R) R = b[2];
      if (B === null || b[3] < B) B = b[3];
    }
    if (L === null) return 'ERROR bake nobounds';
    var wPt = R - L, hPt = T - B;
    if (!(wPt > 0 && hPt > 0)) return 'ERROR bake size';

    saveAlerts = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    tmp = app.documents.add(DocumentColorSpace.CMYK, wPt, hPt);
    var ly = tmp.layers[0], dups = [], d;
    for (i = 0; i < items.length; i++) {
      d = items[i].duplicate(ly, ElementPlacement.PLACEATEND);   // ★레이어로
      if (d) dups.push(d);
    }
    if (!dups.length) return 'ERROR bake nodup';
    var grp = ly.groupItems.add();
    for (i = 0; i < dups.length; i++) dups[i].move(grp, ElementPlacement.PLACEATEND);
    var gb = mesTr_inkBounds(grp);
    if (!gb) gb = grp.visibleBounds;
    // 새 문서의 아트보드는 [0, h, w, 0] 이다 — 잉크의 좌상단을 (0, h) 로 보낸다
    grp.translate(0 - gb[0], hPt - gb[1]);
    tmp.artboards[0].artboardRect = [0, hPt, wPt, 0];

    var out = Folder.temp.fsName.replace(/\\/g, '/') + '/mes_tr_bake_' + idx + '.png';
    var opt = new ExportOptionsPNG24();
    opt.antiAliasing = true;
    opt.transparency = true;
    opt.artBoardClipping = true;
    // 100% = 1pt 당 1px. 원하는 mm/px 로 가려면 그만큼 키운다.
    var pct = 100 / (mmPerPx * MESTR_MM);
    opt.horizontalScale = pct;
    opt.verticalScale = pct;
    tmp.exportFile(new File(out), ExportType.PNG24, opt);
    tmp.close(SaveOptions.DONOTSAVECHANGES);
    tmp = null;
    app.userInteractionLevel = saveAlerts;
    saveAlerts = null;
    var fo = new File(out);
    if (!fo.exists) return 'ERROR bake nofile';
    return 'ok;w=' + mesTr_r2(mesTr_mm(wPt)) + ';h=' + mesTr_r2(mesTr_mm(hPt)) + ';path=' + out;
  } catch (e) {
    try { if (tmp) tmp.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) { /* ignore: 임시 문서 정리 — 이미 닫혔을 수 있다 */ }
    try { if (saveAlerts !== null) app.userInteractionLevel = saveAlerts; } catch (e3) { /* ignore: 대화상자 수준 복구 — 못 되돌려도 굽기 결과에는 영향이 없다 */ }
    return 'ERROR bake ' + mesTr_ascii(e && e.message ? e.message : e);
  }
}

/** 벌별 도련 모드를 한 줄로 — `solid|repeat` 처럼 벌 순서대로 찍는다(뭉개지 않는다). */
function mesTr_modeSummary(p) {
  var out = [], i;
  for (i = 0; i < p.panels.length; i++) out.push(p.modes[i] ? p.modes[i].mode : p.mode);
  return out.length ? out.join('|') : p.mode;
}

function mesTr_makePlate(payload) {
  var p = mesTr_parse(payload);
  if (!p.plate || !mesTr_num(p.plate.w) || !mesTr_num(p.plate.h)) {
    return 'ERROR plate size missing';                       // ← 조기 return 에도 사유를 남긴다
  }
  if (!p.panels.length) return 'ERROR no panel';
  var i;
  for (i = 0; i < p.panels.length; i++) {
    if (!mesTr_rectOk(p.panels[i])) return 'ERROR bad panel rect at ' + i;
  }
  for (i = 0; i < p.bands.length; i++) {
    if (!mesTr_rectOk(p.bands[i])) return 'ERROR bad band rect at ' + i;
  }

  // 일러 문서 한계 — 넘으면 documents.add 가 PARM 으로 죽고, 그 코드는 무엇이 틀렸는지 말하지 않는다.
  var LIMIT_MM = 5644;
  if (p.plate.w > LIMIT_MM || p.plate.h > LIMIT_MM) {
    return 'ERROR plate ' + p.plate.w + 'x' + p.plate.h + 'mm over limit ' + LIMIT_MM;
  }

  // ★원본은 **문서를 만들기 전에** 잡아 둔다 — documents.add 가 activeDocument 를 바꾼다.
  var srcDoc = null, srcSel = null;
  if (app.documents.length > 0) {
    srcDoc = app.activeDocument;
    if (srcDoc.selection && srcDoc.selection.length) srcSel = srcDoc.selection;
  }

  // ★판 문서를 만들기 **전에** 벌마다 바탕 정보를 읽어 둔다 — 그 뒤엔 원본이 비활성이라 읽기가 수십 분이 된다.
  //   슬롯 해소 규칙은 아래 배치 루프와 같다(슬롯 → 없으면 벌①에만 현재 선택).
  var preBd = [];
  for (i = 0; i < p.panels.length; i++) {
    var pm = p.modes[i] ? p.modes[i].mode : p.mode;
    if (pm !== 'extend') { preBd[i] = null; continue; }
    var sItems = null;
    if (MESTR_PICK[i]) { if (mesTr_pickAlive(MESTR_PICK[i])) sItems = MESTR_PICK[i].items; }
    else if (!MESTR_PICK.length && i === 0 && srcSel) sItems = srcSel;
    preBd[i] = sItems ? mesTr_backdropInfo(sItems) : null;
  }

  var saveAlerts = null;
  var doc = null;
  var placed = 0, bled = 0, clipped = 0, clipskip = 0;
  // ★어느 방식으로 몇 개를 만들었는지 **따로 센다** — 품질이 다르므로 합계만 보면 격하가 안 보인다.
  var bleedSolid = 0, bleedExt = 0, bleedPx = 0;
  var notes = [];
  try {
    saveAlerts = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    var W = mesTr_pt(p.plate.w), H = mesTr_pt(p.plate.h);
    doc = app.documents.add(DocumentColorSpace.CMYK, W, H);

    // 레이어 셋 — 「자리」는 인쇄에서 빠져야 한다(출력파일에 보조선을 남기지 않는 규칙).
    var lyArt = doc.layers[0];
    lyArt.name = 'ART';
    var lyGuide = doc.layers.add();
    lyGuide.name = 'GUIDE';
    lyGuide.printable = false;

    // 좌상단 원점(y 아래로) → 일러 문서 좌표(y 위로). 반환 = [left, top, w, h] (pt)
    function place(r) {
      return [mesTr_pt(r.x), H - mesTr_pt(r.y), mesTr_pt(r.w), mesTr_pt(r.h)];
    }
    function cmyk(c, m, y, k) {
      var col = new CMYKColor();
      col.cyan = c; col.magenta = m; col.yellow = y; col.black = k;
      return col;
    }
    function rect(layer, r) {
      var g = place(r);
      return layer.pathItems.rectangle(g[1], g[0], g[2], g[3]);
    }
    function stroked(layer, r, c, m, y, k, wpt) {
      var it = rect(layer, r);
      it.filled = false;
      it.stroked = true;
      it.strokeColor = cmyk(c, m, y, k);
      it.strokeWidth = wpt;
      return it;
    }
    function filled(layer, r, col) {
      var it = rect(layer, r);
      it.stroked = false;
      it.filled = true;
      it.fillColor = col;
      return it;
    }

    // ── ① 도련 — 바탕색 사각을 **벌 크기**로 깐다. ★벌마다 따로 정한다.
    //    실측(2026-08, 22건)에서 두 벌의 바탕색이 다른 판이 흔하다 — 미래엔1 은 좌반 별색·우반 백색.
    //    ★단색일 때만 한다. 아니면 **하지 않고 센다** — 전제가 안 서면 실행하지 않는다(§조용한 격하).
    var panelCol = [], panelMode = [];
    for (i = 0; i < p.panels.length; i++) {
      var md = p.modes[i] ? p.modes[i] : { mode: p.mode, color: p.color };
      panelMode[i] = md.mode;
      if (md.mode === 'solid' && md.color) {
        panelCol[i] = cmyk(md.color.c, md.color.m, md.color.y, md.color.k);
      } else {
        panelCol[i] = null;
        // ★`extend`·`repeat` 은 **이제 할 수 있다** — 여기서 거절하지 않는다(아래 루프가 만든다).
        if (md.mode === 'solid') notes.push('bleedskip=' + (i + 1) + ':nocolor');
        else if (md.mode !== 'none' && md.mode !== 'extend' && md.mode !== 'repeat') {
          notes.push('bleedskip=' + (i + 1) + ':' + mesTr_ascii(md.mode));
        }
      }
    }

    // ── ② 벌마다: 도련 → 원본 배치 → 클리핑
    for (i = 0; i < p.panels.length; i++) {
      var pan = p.panels[i];
      var des = (i < p.design.length) ? p.design[i] : null;
      var bgCol = panelCol[i];

      // ★벌마다 원본이 다르다 — 슬롯에서 가져온다(mesTr_pick). 슬롯을 하나도 안 썼으면
      //   옛 방식대로 **현재 선택**을 쓰되 **벌①에만** 넣는다. 종전처럼 두 벌에 같은 것을
      //   복제하지 않는다 — 실측 22건 중 그게 맞는 경우가 **0건**이었다.
      var slot = MESTR_PICK[i];
      var srcItems = null;
      if (slot) {
        if (mesTr_pickAlive(slot)) srcItems = slot.items;
        else notes.push('slotlost=' + (i + 1));
      } else if (!MESTR_PICK.length && i === 0 && srcSel) {
        srcItems = srcSel;
        notes.push('slot=none');
      }
      if (!srcItems && des) notes.push('empty=' + (i + 1));

      // ── 도련 — 원본보다 **먼저** 만든다. 원본 그룹은 `groupItems.add()` 로 레이어 맨 위에
      //   생기므로, 여기서 만든 것은 자동으로 그 아래에 깔린다(0.2.0 이래의 순서 그대로).
      mesTr_trace('panel' + i + ':bleed-start mode=' + panelMode[i]);
      if (bgCol) { filled(lyArt, pan, bgCol); bled++; bleedSolid++; }
      else if (panelMode[i] === 'extend') {
        if (mesTr_bleedExtend(lyArt, preBd[i], pan, place)) { bled++; bleedExt++; }
        else notes.push('bleedskip=' + (i + 1) + ':noextend');
      } else if (panelMode[i] === 'repeat') {
        if (mesTr_bleedPlacePng(lyArt, i, pan, place)) { bled++; bleedPx++; }
        else notes.push('bleedskip=' + (i + 1) + ':nopng');
      }

      mesTr_trace('panel' + i + ':bleed-end');
      if (srcItems && des) {
        // ★**문서를 넘나드는 duplicate 은 그룹을 받으면 PARM 으로 죽는다.**
        //   일러 30.7 실측(2026-09-21): 같은 원본을
        //     · 다른 문서의 **groupItem** 으로 → ERR 1346458189 ('PARM')
        //     · 다른 문서의 **layer** 로      → ok
        //   증상은 「ERROR makePlate an Illustrator error occurred: 1346458189 ('PARM')」 하나뿐이라
        //   무엇이 틀렸는지 말해 주지 않는다. → **레이어로 복제한 뒤 같은 문서 안에서 그룹으로 모은다.**
        var j, dup, dups = [];
        for (j = 0; j < srcItems.length; j++) {
          dup = srcItems[j].duplicate(lyArt, ElementPlacement.PLACEATEND);
          if (dup) dups.push(dup);
        }
        mesTr_trace('panel' + i + ':dup-done n=' + dups.length);
        var grp = null;
        if (dups.length) {
          grp = lyArt.groupItems.add();                       // 그룹 생성·이동은 **같은 문서 안**이라 안전하다
          for (j = 0; j < dups.length; j++) dups[j].move(grp, ElementPlacement.PLACEATEND);
        }
        if (!grp) {
          notes.push('dupfail=' + i);
        } else {
          // 원본을 자리에 맞춘다 — ★가로는 그대로, 세로만 늘어난다(수축보정은 des.h 에 이미 들어 있다)
          // ★배율·위치의 기준은 **보이는 잉크**다. `visibleBounds` 로 재면 클립이 잘라 낸 부분까지
          //   상자에 들어가 그림이 작게 줄고 나머지가 **보이지 않는 여백**이 된다(2026-09-21 실기).
          var vb = mesTr_inkBounds(grp);
          if (!vb) vb = grp.visibleBounds;             // 못 재면 여태 하던 대로 — 판은 나와야 한다
          var curW = vb[2] - vb[0], curH = vb[1] - vb[3];
          var g2 = place(des);
          if (curW > 0 && curH > 0) {
            grp.resize((g2[2] / curW) * 100, (g2[3] / curH) * 100,
              true, true, true, true, 100, Transformation.TOPLEFT);
          }
          // ★키운 뒤에 **다시 재서 한 번 더 맞춘다.** 획 두께는 배율을 안 따라가므로
          //   한 번의 resize 로는 정확히 안 떨어진다(실측 2026-09-21: 1829mm 자리에 **1829.6mm**).
          //   그 0.6mm 때문에 잉크가 벌 경계를 샐져나가 **쓸데없는 클립이 생긴다**.
          var ib = mesTr_inkBounds(grp);
          if (!ib) ib = grp.visibleBounds;
          var w2 = ib[2] - ib[0], h2 = ib[1] - ib[3];
          if (w2 > 0 && h2 > 0) {
            var fx = (g2[2] / w2) * 100, fy = (g2[3] / h2) * 100;
            if (Math.abs(fx - 100) > 0.01 || Math.abs(fy - 100) > 0.01) {   // 0.01% ≈ 클립 판정 여유(0.5pt)
              grp.resize(fx, fy, true, true, true, true, 100, Transformation.TOPLEFT);
              ib = mesTr_inkBounds(grp);
              if (!ib) ib = grp.visibleBounds;
            }
          }
          // ★`position` 은 **개체 상자**(클립 밖까지)를 보므로 쓰지 않는다 — 잉크를 재서 그만큼 민다.
          grp.translate(g2[0] - ib[0], g2[1] - ib[1]);
          placed++;

          // 클리핑 — 벌 경계로 자른다(도련이 옆 벌을 침범하지 않게).
          // ★**자르는 게 없으면 만들지 않는다.** 재단이 같은 자리에서 배운 것이다(CUT-CEP-0.49.0):
          //   아무것도 안 자르는 클립은 레이어 패널에 `<Clipping Path>` 만 남기고 하는 일이 없다.
          //   실측(2026-09-21): 벌 646x1859mm 안에 원본 600x1829mm 이 통째로 들어가
          //   **2개 중 2개가 무의미**했다. 전제를 **하기 전에** 재고, 안 서면 하지 않는다.
          // ⚠️진짜로 삐져나올 때는 반드시 자른다 — 안 자르면 도련이 옆 벌을 덮는다.
          var vb2 = mesTr_inkBounds(grp);           // [l, t, r, b] — ★잉크 기준(클립 밖 여분은 안 보인다)
          if (!vb2) vb2 = grp.visibleBounds;
          var pg = place(pan);                      // [left, top, w, h]
          var ctol = 0.5;                           // pt — 반올림·헤어라인 여유
          var needClip = (vb2[0] < pg[0] - ctol) || (vb2[1] > pg[1] + ctol)
            || (vb2[2] > pg[0] + pg[2] + ctol) || (vb2[3] < pg[1] - pg[3] - ctol);
          if (needClip) {
            var holder = lyArt.groupItems.add();
            grp.move(holder, ElementPlacement.PLACEATEND);
            var cr = rect(holder, pan);
            cr.move(holder, ElementPlacement.PLACEATBEGINNING);
            cr.clipping = true;
            holder.clipped = true;
            clipped++;
          } else {
            clipskip++;                             // 거절을 **센다** — 실행 횟수로 성공을 말하지 않는다
          }
        }
      }
    }

    // ── ③ 밴드 — 봉미싱 접힘부. 바탕색이 있으면 같은 색으로 이어 준다
    // ★두 벌의 바탕색이 다르면 밴드도 **벌마다 그 색으로** 이어야 한다 — 한 색으로 깔면
    //   한쪽 벌의 접힘부가 남의 색이 된다. 색이 하나뿐이면 종전처럼 통째로 깐다(벌 사이 1mm 간격까지).
    var uni = null, allSame = true;
    for (i = 0; i < panelCol.length; i++) {
      if (!panelCol[i]) { allSame = false; break; }
      if (uni === null) uni = panelCol[i];
      else if (uni.cyan !== panelCol[i].cyan || uni.magenta !== panelCol[i].magenta
        || uni.yellow !== panelCol[i].yellow || uni.black !== panelCol[i].black) { allSame = false; break; }
    }
    for (i = 0; i < p.bands.length; i++) {
      var bd = p.bands[i];
      if (allSame && uni) {
        filled(lyArt, bd, uni);
      } else {
        for (var q = 0; q < p.panels.length; q++) {
          if (!panelCol[q]) continue;
          var pq = p.panels[q];
          var bx0 = Math.max(bd.x, pq.x), bx1 = Math.min(bd.x + bd.w, pq.x + pq.w);
          if (bx1 - bx0 > 0.01) filled(lyArt, { x: bx0, y: bd.y, w: bx1 - bx0, h: bd.h }, panelCol[q]);
        }
      }
      stroked(lyGuide, bd, 0, 100, 100, 0, 0.5);
    }

    // ── ③-b 끈고리·하도매 — **원본 위에 인쇄되는 표시**. 좌표는 패널이 plate.js 로 계산해 보낸다(정본 = plate-rules.marks).
    //   색은 패널이 표시 자리의 굽기 픽셀로 판정해 보낸다(k|w). 판정이 안 서면 x = 흑선 + 백테두리 — 어디서나 보인다.
    //   `pathItems` 는 레이어 맨 위에 생기므로 여기서 그리면 원본 그룹 위에 온다(도련·원본 다음).
    var mkLoop = 0, mkHole = 0, mkKey = 0;
    function markCol(code) { return (code === 'w') ? cmyk(0, 0, 0, 0) : cmyk(0, 0, 0, 100); }
    for (i = 0; i < p.loops.length; i++) {
      var lp = p.loops[i];
      if (!mesTr_num(lp.x) || !mesTr_num(lp.y) || !(lp.len > 0)) { notes.push('markbad=L' + i); continue; }
      var y0 = H - mesTr_pt(lp.y), x0 = mesTr_pt(lp.x), x1 = mesTr_pt(lp.x + lp.len);
      if (lp.color === 'x') {
        var under = lyArt.pathItems.add();
        under.setEntirePath([[x0, y0], [x1, y0]]);
        under.filled = false; under.stroked = true; under.strokeColor = cmyk(0, 0, 0, 0); under.strokeWidth = 4 + 2;
        mkKey++;
      }
      var ln = lyArt.pathItems.add();
      ln.setEntirePath([[x0, y0], [x1, y0]]);
      ln.filled = false; ln.stroked = true; ln.strokeColor = (lp.color === 'x') ? cmyk(0, 0, 0, 100) : markCol(lp.color); ln.strokeWidth = 4;
      mkLoop++;
    }
    for (i = 0; i < p.holes.length; i++) {
      var hl = p.holes[i];
      if (!mesTr_num(hl.cx) || !mesTr_num(hl.cy) || !(hl.r > 0)) { notes.push('markbad=H' + i); continue; }
      var rr = mesTr_pt(hl.r), cy = H - mesTr_pt(hl.cy), cx = mesTr_pt(hl.cx);
      var el = lyArt.pathItems.ellipse(cy + rr, cx - rr, rr * 2, rr * 2);   // (top, left, w, h)
      el.filled = true; el.fillColor = (hl.color === 'x') ? cmyk(0, 0, 0, 100) : markCol(hl.color);
      if (hl.color === 'x') { el.stroked = true; el.strokeColor = cmyk(0, 0, 0, 0); el.strokeWidth = 1.5; mkKey++; }
      else el.stroked = false;
      mkHole++;
    }

    // ── ④ 자리 표시(비인쇄)
    for (i = 0; i < p.panels.length; i++) stroked(lyGuide, p.panels[i], 0, 0, 0, 100, 0.5);
    for (i = 0; i < p.design.length; i++) stroked(lyGuide, p.design[i], 100, 0, 0, 0, 0.5);

    app.userInteractionLevel = saveAlerts;
    return 'OK plate=' + p.plate.w + 'x' + p.plate.h
      + ' panels=' + p.panels.length + ' bands=' + p.bands.length
      + ' placed=' + placed + ' bleed=' + bled
      + ' bleedhow=solid:' + bleedSolid + ',ext:' + bleedExt + ',px:' + bleedPx
      + ' clipped=' + clipped + ' clipskip=' + clipskip
      + ' marks=loop:' + mkLoop + ',hole:' + mkHole + ',key:' + mkKey
      + ' bleedmode=' + mesTr_ascii(mesTr_modeSummary(p))
      + (srcSel ? '' : ' src=none')
      + (notes.length ? ' ' + notes.join(' ') : '')
      + ' ver=' + MESTR_VERSION;
  } catch (e) {
    if (saveAlerts !== null) {
      try { app.userInteractionLevel = saveAlerts; } catch (e2) { /* ignore: 복원 실패해도 아래 사유 보고가 우선이다 */ }
    }
    return 'ERROR makePlate ' + mesTr_ascii(e && e.message ? e.message : e);
  }
}

/**
 * 윈드배너 틀을 연다. **앉히지 않는다** — F형은 실루엣이 규격과 달라 패널이 추정하면 안 된다.
 * @param pathStr  틀 EPS 절대경로(패널이 \uXXXX 로 이스케이프해 보낸다)
 */
function mesTr_openFrame(pathStr) {
  var s = String(pathStr || '');
  if (!s) return 'ERROR frame path missing';
  try {
    var f = new File(s);
    if (!f.exists) return 'ERROR frame not found';           // 경로는 한글이라 되돌려 보내지 않는다
    app.open(f);
    return 'OK frame opened ver=' + MESTR_VERSION;
  } catch (e) {
    return 'ERROR openFrame ' + mesTr_ascii(e && e.message ? e.message : e);
  }
}
