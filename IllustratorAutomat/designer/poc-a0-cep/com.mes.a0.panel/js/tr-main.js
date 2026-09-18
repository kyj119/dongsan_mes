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

  var TR_SHELL_VERSION = '0.2.0';   // 0.2.0 = 원본 측정(mesTr_measure) → 도련 경로 결정 → 배치·클리핑까지 · 0.1.0 = 신설
  // ★호스트 최소 버전 — `mesTr_measure` 와 도련 색 전달은 **0.2.0 부터**다.
  //   구 호스트(0.1.0)는 `M:solid,c,m,y,k` 의 색을 조용히 무시하고 자리 표시 선만 그린다
  //   → 판은 나오는데 도련이 없다. 조용한 격하라서 버전을 못박는다.
  var TR_MIN_HOST = [0, 2, 0];

  var cs = null;
  try { cs = new CSInterface(); } catch (e) { /* ignore: 브라우저에서 열어 본 경우 — 계산까지는 동작해야 한다 */ }

  var el = {};
  var lastPlan = null;              // 마지막 계산 결과 — [판 만들기] 가 쓴다
  var lastEdge = null;              // 마지막 원본 측정 — 도련 경로가 여기서 갈린다
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
        cb('ERROR Z: 의 전사 호스트를 못 읽었습니다.\n'
          + '· 일러스트레이터를 **완전히 종료**했다 다시 켜 주세요(패널만 닫았다 여는 것으로는 안 바뀝니다).\n'
          + '· 그래도 같으면 Z: 연결을 확인하세요.', true);
        return;
      }
      cb(s, s.indexOf('ERROR') === 0);
    });
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
      fillSelect(el.media, Object.keys(R.RULES.media));
      fillSelect(el.fabric, Object.keys(R.RULES.fabric));
      fillSelect(el.seam, Object.keys(R.RULES.seamMm), function (k) {
        return k + ' (' + R.RULES.seamMm[k] + 'mm)';
      });
      // 면 수는 큰 값이 먼저 — 가로등 표준이 3면이라 기본값이 위에 온다
      var sides = Object.keys(R.RULES.sewSides).sort(function (a, b) { return b - a; });
      fillSelect(el.sides, sides, function (k) { return k + '면'; });
      fillSelect(el.nonwovenCm, R.RULES.nonwovenCm, function (v) {
        return (typeof v === 'number') ? (v + 'cm') : String(v);
      });
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
    lastPlan = null;
    if (el.btnMake) el.btnMake.disabled = true;
  }
  function activeTrTab() {
    var t = document.querySelectorAll('.trtab.active');
    return t.length ? t[0].getAttribute('data-trtab') : 'plate';
  }

  // ── 계산 ─────────────────────────────────────────────────────────
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
      media: el.media.value,
      sewSides: parseInt(el.sides.value, 10),
      fabric: el.fabric.value,
      nonwovenCm: (el.nonwoven && el.nonwoven.checked) ? el.nonwovenCm.value : null,
      hardware: (parseInt(el.hwHoles.value, 10) > 0)
        ? { size: parseInt(el.hwSize.value, 10), holes: parseInt(el.hwHoles.value, 10) } : null
    });
    if (!r.ok) return { err: '만들지 않습니다 — ' + r.reason, code: r.code };

    // 도련은 바탕색을 알아야 정한다 — 안 재었으면 **모른다고 둔다**(추측해서 solid 로 만들지 않는다).
    var edge = lastEdge || {};
    var bleed = RV.planBleed({ design: r.design[0], panel: r.panels[0], edge: edge });
    var review = RV.build({
      mode: 'plate', bleed: bleed, edge: edge, trace: r.trace,
      nonwoven: !!(el.nonwoven && el.nonwoven.checked)
    });
    return { plate: r, bleed: bleed, review: review, mode: 'plate', edge: edge };
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

  /** 일러에서 고른 원본을 잰다 — 크기와 바탕색. 못 재면 lastEdge 를 비워 **모르는 상태**로 둔다. */
  function measure(done) {
    if (!cs || activeTrTab() === 'frame') { done(); return; }
    host('mesTr_measure()', function (res, bad) {
      if (bad || String(res).indexOf('OK') !== 0) { lastEdge = null; done(String(res)); return; }
      var kv = parseKv(res);
      if (kv.edge === 'solid') {
        var col = { c: parseFloat(kv.c), m: parseFloat(kv.m), y: parseFloat(kv.y), k: parseFloat(kv.k) };
        lastEdge = { solid: true, color: [col.c, col.m, col.y, col.k], light: isLight(col), outside: false };
      } else {
        // ★「단색이 아니다」가 아니라 **「모르겠다」**이다 — solid=false 로 단정하면
        //   review.js 가 edge-multicolor 로 확정해 버린다. 판정은 사람에게 남긴다.
        lastEdge = { outside: false };
      }
      lastEdge.w = parseFloat(kv.w);
      lastEdge.h = parseFloat(kv.h);
      done();
    });
  }

  function calc() {
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
    // 도련 모드 — solid 면 바탕색까지 실어 보낸다(호스트가 그 색으로 벌 크기 사각을 깐다)
    var bl = lastPlan.bleed;
    var mrec = 'M:' + (bl ? bl.mode : 'none');
    if (bl && bl.mode === 'solid' && bl.color) mrec += ',' + bl.color.join(',');
    rec.push(mrec);
    var expr = 'mesTr_makePlate(' + asciiStr(rec.join(';')) + ')';
    el.out.textContent = '판 만드는 중…';
    host(expr, function (res, bad) {
      el.out.textContent = res;
      if (!bad) renderReview(lastPlan.review);
    });
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
      specW: $('trSpecW'), specH: $('trSpecH'), media: $('trMedia'), fabric: $('trFabric'), vup: $('trVup'),
      seam: $('trSeam'), sides: $('trSides'), band: $('trBand'), sew: $('trSew'),
      nonwoven: $('trNonwoven'), nonwovenCm: $('trNonwovenCm'), hwSize: $('trHwSize'), hwHoles: $('trHwHoles'),
      frame: $('trFrame'), client: $('trClient'),
      btnCalc: $('trBtnCalc'), btnMake: $('trBtnMake'), btnFrame: $('trBtnFrame'),
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

    if (el.ver) el.ver.textContent = 'shell ' + TR_SHELL_VERSION;
    host('(typeof mesTr_version === "function") ? mesTr_version() : "none"', function (v, bad) {
      if (el.ver) el.ver.textContent = 'shell ' + TR_SHELL_VERSION + ' · host ' + (bad ? '?' : v);
      if (!bad && v !== 'none' && !verGE(v, TR_MIN_HOST)) {
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
