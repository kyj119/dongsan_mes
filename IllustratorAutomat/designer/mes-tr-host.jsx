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

var MESTR_VERSION = 'TR-CEP-0.4.0';   // 0.4.0 = ★둘. ①**자동 분석**(`mesTr_autoPick`) — 문서의 맨 위 개체를 가로 간격으로 갈라 벌에 대응시킨다. 판정 잣대는 가공의 `mesA0_seedCands(d,'auto')` 와 **같게** 뒀다(두 탭이 같은 파일을 다르게 읽으면 디자이너가 「가공은 2개인데 전사는 3개」를 만난다). 덩어리 수가 벌 수와 다르면 **아무것도 지정하지 않고** 개수만 돌려준다. ②**자르는 게 없는 클립은 만들지 않는다** — 실기 보고 「클리핑이 추출된다」. 실측(2026-09-21): 벌 646x1859mm 안에 원본 600x1829mm 이 통째로 들어가 **클립 2개 중 2개가 무의미**했고, 레이어 패널에 `<Clipping Path>` 만 남겼다. 재단이 CUT-CEP-0.49.0 에서 배운 것과 **같은 자리**다(형제 스윕). 전제를 하기 **전에** 재고, 안 서면 하지 않는다 — 거절은 `clipskip=` 으로 **센다**. ⚠️진짜로 삐져나오면 반드시 자른다(안 자르면 도련이 옆 벌을 덮는다). 잃는 것: 없음(그리는 그림·도련·산식 불변, 레이어 구조만 깔끔해진다) · 0.3.0 = ★**1조의 두 벌은 서로 다른 그림이다.** 2026-08 완성판 22건 실측(60-180·60-150 조 단위): 완전 동일 복제 **0건** · 명백히 다른 그림 16건 · 틀만 같고 내용이 다른 것 6건 · **거울상 0건**(거울 겹침 0~7%). 주니그래픽 미래엔1 은 좌반 바탕이 별색 MiraeN Purple_New, 우반이 백색이다. 그런데 0.2.x 까지는 **선택 하나를 두 벌에 복제**했다 — 측정된 22건 전부에서 틀린 판이 나온다. → 벌마다 원본을 따로 받는다(mesTr_pick/picks/swapPicks/clearPicks). 좌우 순서는 **디자이너가 정한다**(용준님 2026-09-21). 슬롯은 패널이 열려 있는 동안만 살고, 쓰기 전에 살아 있는지 확인한다(지운 개체·닫은 문서). 딸려 오는 것 둘 — ①**도련이 벌마다 갈린다**(payload `M:idx,mode[,cmyk]` · 옛 `M:mode` 는 판 전체로 계속 먹는다) ②**밴드 색도 벌마다** 이어야 한다(한 색이면 종전처럼 통째로, 다르면 벌 구간으로 나눠 깐다). 슬롯을 하나도 안 쓰면 현재 선택을 **벌①에만** 넣고 `slot=none` 을 남긴다 — 두 벌 복제로 되돌아가지 않는다. 잃는 것: 지정 없이 [판 만들기] 를 누르면 벌②가 빈다(그 사실을 `empty=2` 와 확인 목록 must 로 알린다) · 0.2.2 = ★[판 만들기] 가 `PARM` 으로 죽던 것. **문서를 넘나드는 `duplicate` 은 그룹을 받으면 안 된다** — 일러 30.7 최소 재현(2026-09-21): 다른 문서의 groupItem 으로 복제 → `1346458189 ('PARM')` · 다른 문서의 **layer** 로 복제 → ok · copy/paste → ok. 원본은 srcDoc 에 있고 그룹은 `documents.add` 로 막 만든 새 문서에 있어 매번 걸렸다. 오류 문구가 코드번호 하나뿐이라 무엇이 틀렸는지 안 알려 준다. → 레이어로 복제한 뒤 **같은 문서 안에서** 그룹으로 모은다(이동은 동일 문서라 안전). 잃는 것: 없음(배치·클리핑·산식 불변) · 0.2.1 = ★이 파일이 **한 번도 안 실렸다**. 머리말 주석의 `const/let/화살표/**JSON**/Array.map` 에서 `**/` 가 블록 주석을 닫아, 뒤 문장이 코드로 파싱되며 파일 전체가 구문 오류였다(ExtendScript: 「구문 오류: 필요 항목: ;」). 0.1.0·0.2.0 둘 다 Z: 에 나갔지만 스텁이 애초에 이 파일을 안 읽어(손목록) **증상이 가려져 있었고**, 스텁을 열거로 고치자(stub-3.0.0) 비로소 드러났다. 고친 것은 주석 한 줄뿐 — 로직·산식·payload 전부 불변. 게이트 = `npm run audit:jsx-syntax`(IA 의 .jsx·패널 js 를 실제로 파싱한다 — 여태 **아무 게이트도 파싱하지 않았다**). 잃는 것: 없음 · 0.2.0 = 
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
  var out = { plate: null, panels: [], design: [], bands: [], mode: 'none', color: null, modes: [] };
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
    b = items[i].visibleBounds;   // [left, top, right, bottom] (y 는 위가 큼)
    if (x0 === null || b[0] < x0) x0 = b[0];
    if (y0 === null || b[1] > y0) y0 = b[1];
    if (x1 === null || b[2] > x1) x1 = b[2];
    if (y1 === null || b[3] < y1) y1 = b[3];
  }
  if (x0 === null) return { ok: false, err: 'no bounds' };
  var o = { ok: true, w: mesTr_r2(mesTr_mm(x1 - x0)), h: mesTr_r2(mesTr_mm(y0 - y1)), edge: 'unknown' };
  var bg = mesTr_findBackdrop(items, x0, y0, x1, y1);
  if (bg) {
    var col = bg.fillColor;
    o.edge = 'solid';
    o.c = mesTr_r2(col.cyan); o.m = mesTr_r2(col.magenta);
    o.y = mesTr_r2(col.yellow); o.k = mesTr_r2(col.black);
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

    var rows = [], i, b;
    for (i = 0; i < tops.length; i++) {
      try { b = tops[i].visibleBounds; } catch (eB) { continue; }
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
          return 'OK auto=yes by=artboard found=' + bag.length
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
      return 'OK auto=no by=gap found=' + cl.length + ' want=' + want
        + ' ' + mesTr_pickLine(0) + ' ' + mesTr_pickLine(1);
    }
    var next = [];
    for (i = 0; i < cl.length && i < 2; i++) {
      var m = mesTr_measureItems(cl[i].items);
      if (!m.ok) return 'ERROR measure cluster ' + (i + 1);
      next[i] = { items: cl[i].items, m: m };
    }
    MESTR_PICK = next;   // ★전부 잰 뒤에 갈아끼운다 — 도중에 실패하면 옛 지정이 살아 있어야 한다
    return 'OK auto=yes by=gap found=' + cl.length
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
  var stack = [], i, it;
  for (i = 0; i < sel.length; i++) stack.push(sel[i]);
  var best = null;
  while (stack.length) {
    it = stack.pop();
    if (!it) continue;
    if (it.typename === 'GroupItem') {
      for (i = 0; i < it.pageItems.length; i++) stack.push(it.pageItems[i]);
      continue;
    }
    if (it.typename !== 'PathItem') continue;
    if (!it.filled) continue;
    if (!it.fillColor || it.fillColor.typename !== 'CMYKColor') continue;
    var b = it.geometricBounds;
    if (b[0] > x0 + TOL || b[1] < y0 - TOL || b[2] < x1 - TOL || b[3] > y1 + TOL) continue;
    best = it;   // 더 뒤에 있는 것이 나중에 나오지만, 전체를 덮는 단색이면 어느 쪽이든 바탕색은 같다
  }
  return best;
}

/**
 * 판 문서를 만들고 벌·밴드 자리를 그린다.
 *
 * ★그리는 것은 **자리 표시**다(원본 배치·도련·클리핑은 다음 단계).
 *   지금 단계에서 사람이 확인해야 하는 것은 「판·벌·밴드 치수가 맞는가」 하나다.
 * @param payload  mesTr_parse 가 읽는 줄 기반 문자열
 * @return ASCII 결과 문자열. 실패는 'ERROR ' 로 시작한다.
 */
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

  var saveAlerts = null;
  var doc = null;
  var placed = 0, bled = 0, clipped = 0, clipskip = 0;
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
    var panelCol = [];
    for (i = 0; i < p.panels.length; i++) {
      var md = p.modes[i] ? p.modes[i] : { mode: p.mode, color: p.color };
      if (md.mode === 'solid' && md.color) {
        panelCol[i] = cmyk(md.color.c, md.color.m, md.color.y, md.color.k);
      } else {
        panelCol[i] = null;
        if (md.mode === 'solid') notes.push('bleedskip=' + (i + 1) + ':nocolor');
        else if (md.mode !== 'none') notes.push('bleedskip=' + (i + 1) + ':' + mesTr_ascii(md.mode));
      }
    }

    // ── ② 벌마다: 도련 → 원본 배치 → 클리핑
    for (i = 0; i < p.panels.length; i++) {
      var pan = p.panels[i];
      var des = (i < p.design.length) ? p.design[i] : null;
      var bgCol = panelCol[i];

      if (bgCol) { filled(lyArt, pan, bgCol); bled++; }

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
        var grp = null;
        if (dups.length) {
          grp = lyArt.groupItems.add();                       // 그룹 생성·이동은 **같은 문서 안**이라 안전하다
          for (j = 0; j < dups.length; j++) dups[j].move(grp, ElementPlacement.PLACEATEND);
        }
        if (!grp) {
          notes.push('dupfail=' + i);
        } else {
          // 원본을 자리에 맞춘다 — ★가로는 그대로, 세로만 늘어난다(수축보정은 des.h 에 이미 들어 있다)
          var vb = grp.visibleBounds;                 // [l, t, r, b]
          var curW = vb[2] - vb[0], curH = vb[1] - vb[3];
          var g2 = place(des);
          if (curW > 0 && curH > 0) {
            grp.resize((g2[2] / curW) * 100, (g2[3] / curH) * 100,
              true, true, true, true, 100, Transformation.TOPLEFT);
          }
          grp.position = [g2[0], g2[1]];
          placed++;

          // 클리핑 — 벌 경계로 자른다(도련이 옆 벌을 침범하지 않게).
          // ★**자르는 게 없으면 만들지 않는다.** 재단이 같은 자리에서 배운 것이다(CUT-CEP-0.49.0):
          //   아무것도 안 자르는 클립은 레이어 패널에 `<Clipping Path>` 만 남기고 하는 일이 없다.
          //   실측(2026-09-21): 벌 646x1859mm 안에 원본 600x1829mm 이 통째로 들어가
          //   **2개 중 2개가 무의미**했다. 전제를 **하기 전에** 재고, 안 서면 하지 않는다.
          // ⚠️진짜로 삐져나올 때는 반드시 자른다 — 안 자르면 도련이 옆 벌을 덮는다.
          var vb2 = grp.visibleBounds;              // [l, t, r, b]
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

    // ── ④ 자리 표시(비인쇄)
    for (i = 0; i < p.panels.length; i++) stroked(lyGuide, p.panels[i], 0, 0, 0, 100, 0.5);
    for (i = 0; i < p.design.length; i++) stroked(lyGuide, p.design[i], 100, 0, 0, 0, 0.5);

    app.userInteractionLevel = saveAlerts;
    return 'OK plate=' + p.plate.w + 'x' + p.plate.h
      + ' panels=' + p.panels.length + ' bands=' + p.bands.length
      + ' placed=' + placed + ' bleed=' + bled + ' clipped=' + clipped + ' clipskip=' + clipskip
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
