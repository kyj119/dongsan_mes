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
 * ⚠️ ES3 다. const/let/화살표/**JSON**/Array.map 금지.
 *    → 패널은 JSON 대신 **줄 기반 페이로드**를 보낸다(`P:` `N:` `D:` `B:` `M:`).
 * ⚠️ 전역 접두사는 mesTr_* 고정 — A0(mesA0_*)·재단(mesCut_*)과 **같은 전역 스코프를 공유**한다.
 *    이름이 겹치면 나중에 로드된 쪽이 상대를 덮어써 그쪽이 깨진다.
 * ⚠️ 중첩 삼항 금지 — 이 엔진은 삼항을 **왼쪽 결합**으로 읽는다(`audit:jsx-ternary`).
 *    뒤쪽 삼항은 반드시 괄호로 감싼다.
 * ⚠️ 조기 return 은 반드시 사유를 문자열로 돌려준다. 빈값을 돌려주면 패널이 틀린 진단을 띄운다.
 * ⚠️ 반환은 ASCII 만 — 한글을 돌려주면 CEP 브릿지에서 깨진다.
 */

var MESTR_VERSION = 'TR-CEP-0.2.0';
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
  var out = { plate: null, panels: [], design: [], bands: [], mode: 'none', color: null };
  var recs = String(payload || '').split(';');
  var i, r, k, v, n;
  for (i = 0; i < recs.length; i++) {
    r = recs[i];
    if (!r) continue;
    k = r.substring(0, 1);
    v = r.substring(2);
    if (k === 'M') {
      // `M:solid,0,0,100,0` 또는 `M:repeat` / `M:skip` / `M:none`
      var mp = v.split(',');
      out.mode = mp[0];
      if (mp.length >= 5) {
        out.color = { c: parseFloat(mp[1]), m: parseFloat(mp[2]), y: parseFloat(mp[3]), k: parseFloat(mp[4]) };
      }
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

    // 선택 전체의 가시 경계
    var i, b, x0 = null, y0 = null, x1 = null, y1 = null;
    for (i = 0; i < sel.length; i++) {
      b = sel[i].visibleBounds;   // [left, top, right, bottom] (y 는 위가 큼)
      if (x0 === null || b[0] < x0) x0 = b[0];
      if (y0 === null || b[1] > y0) y0 = b[1];
      if (x1 === null || b[2] > x1) x1 = b[2];
      if (y1 === null || b[3] < y1) y1 = b[3];
    }
    var wMm = mesTr_mm(x1 - x0), hMm = mesTr_mm(y0 - y1);

    // 바탕 후보 = 선택 중 **맨 뒤**이면서 전체를 덮는 단색 채움 패스
    var bg = mesTr_findBackdrop(sel, x0, y0, x1, y1);
    if (!bg) return 'OK w=' + mesTr_r2(wMm) + ' h=' + mesTr_r2(hMm) + ' edge=unknown';
    var c = bg.fillColor;
    return 'OK w=' + mesTr_r2(wMm) + ' h=' + mesTr_r2(hMm) + ' edge=solid'
      + ' c=' + mesTr_r2(c.cyan) + ' m=' + mesTr_r2(c.magenta)
      + ' y=' + mesTr_r2(c.yellow) + ' k=' + mesTr_r2(c.black);
  } catch (e) {
    return 'ERROR measure ' + mesTr_ascii(e && e.message ? e.message : e);
  }
}

function mesTr_r2(v) { return Math.round(v * 100) / 100; }

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
  var placed = 0, bled = 0, clipped = 0;
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

    // ── ① 도련 — 바탕색 사각을 **벌 크기**로 깐다
    //    ★단색일 때만 한다. 아니면 **하지 않고 센다** — 전제가 안 서면 실행하지 않는다(§조용한 격하).
    var bgCol = null;
    if (p.mode === 'solid' && p.color) bgCol = cmyk(p.color.c, p.color.m, p.color.y, p.color.k);
    if (p.mode === 'solid' && !p.color) notes.push('bleedskip=nocolor');
    if (p.mode !== 'solid' && p.mode !== 'none') notes.push('bleedskip=' + mesTr_ascii(p.mode));

    // ── ② 벌마다: 도련 → 원본 배치 → 클리핑
    for (i = 0; i < p.panels.length; i++) {
      var pan = p.panels[i];
      var des = (i < p.design.length) ? p.design[i] : null;

      if (bgCol) { filled(lyArt, pan, bgCol); bled++; }

      if (srcSel && des) {
        var grp = lyArt.groupItems.add();
        var j, dup, any = false;
        for (j = 0; j < srcSel.length; j++) {
          dup = srcSel[j].duplicate(grp, ElementPlacement.PLACEATEND);
          if (dup) any = true;
        }
        if (!any) {
          grp.remove();
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

          // 클리핑 — 벌 경계로 자른다(도련이 옆 벌을 침범하지 않게)
          var holder = lyArt.groupItems.add();
          grp.move(holder, ElementPlacement.PLACEATEND);
          var cr = rect(holder, pan);
          cr.move(holder, ElementPlacement.PLACEATBEGINNING);
          cr.clipping = true;
          holder.clipped = true;
          clipped++;
        }
      }
    }

    // ── ③ 밴드 — 봉미싱 접힘부. 바탕색이 있으면 같은 색으로 이어 준다
    for (i = 0; i < p.bands.length; i++) {
      if (bgCol) filled(lyArt, p.bands[i], bgCol);
      stroked(lyGuide, p.bands[i], 0, 100, 100, 0, 0.5);
    }

    // ── ④ 자리 표시(비인쇄)
    for (i = 0; i < p.panels.length; i++) stroked(lyGuide, p.panels[i], 0, 0, 0, 100, 0.5);
    for (i = 0; i < p.design.length; i++) stroked(lyGuide, p.design[i], 100, 0, 0, 0, 0.5);

    app.userInteractionLevel = saveAlerts;
    return 'OK plate=' + p.plate.w + 'x' + p.plate.h
      + ' panels=' + p.panels.length + ' bands=' + p.bands.length
      + ' placed=' + placed + ' bleed=' + bled + ' clipped=' + clipped
      + ' bleedmode=' + mesTr_ascii(p.mode)
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
