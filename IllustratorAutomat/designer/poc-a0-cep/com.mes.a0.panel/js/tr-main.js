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

  var TR_SHELL_VERSION = '0.4.0';   // 0.4.0 = ★**자동 분석이 주 경로**가 됐다(용준님 2026-09-21 「재단 기능처럼, 순서만 바꿀 수 있게」). [자동 분석] 이 문서의 맨 위 개체를 가로 간격으로 갈라 왼쪽을 벌① 로 두고, 사람은 [⇄ 좌우] 로 순서만 바꾼다. 수동 지정은 **자동이 못 가를 때**의 길로 내렸다. [계산] 은 지정이 하나도 없을 때만 자동을 먼저 돌린다 — 사람이 고른 것을 덮지 않는다. ⚠️그 자동 호출을 **await 없이 던지면 안 된다** — 호스트 왕복이라 늦게 온 응답이 방금 읽은 상태를 덮는다(CLAUDE.md §늦게 온 응답이 덮는다). 콜백으로 이어 붙였다. ⚠️덩어리 수가 벌 수와 다르면 **아무것도 지정하지 않고** 몇 덩어리인지 말한다 — 억지로 가르면 반쪽짜리 판이 조용히 나간다. 잃는 것: 없음(수동 경로 그대로) · 0.3.0 = ★벌마다 원본을 지정한다([벌① 좌 지정]·[벌② 우 지정]·[⇄]·[비우기]). 1조의 두 벌은 서로 다른 그림이라(2026-08 완성판 22건 실측, 동일 복제 0건) 종전처럼 하나를 두 벌에 복제하면 **전부 틀린 판**이 나왔다. 좌우는 디자이너가 정한다. 도련도 **벌마다** 계산해 `M:idx,...` 로 보낸다 — 두 벌의 바탕색이 다른 판이 흔하다. 지정이 비면 확인 목록에 **must** 로 올린다(조용히 빈 자리로 내보내지 않는다). ⚠️최악 도련을 고르는 비교에 `RANK[m] || 9` 를 쓰면 안 된다 — **skip 이 0 이라 falsy** 다(review.js 의 `ORDER[level] || 9` 와 같은 함정, 여기서도 한 번 걸렸다). 잃는 것: [계산] 전에 지정이 필요하다(안 하면 벌①에만 현재 선택이 들어간다) · 0.2.2 = ★안쪽 탭이 **전환되지 않고 있었다**. `.trpage`(style.css L199)가 `.hidden`(L21)보다 뒤에 있어 특정도가 같으면 이겼고, 숨겨야 할 페이지가 계속 보였다 — 가로등·윈드 입력이 동시에 렌더돼 실기에서 「입력창이 동일하다」로 보고됐다. `.trpage.hidden` 로 못박았다(`.mainpage.hidden` 과 같은 방식). 겸해서 **탭마다 쓰는 버튼만** 남긴다 — 가로등의 「틀 열기」·윈드의 「판 만들기」는 눌러도 거절 문구만 나오는 선택지였다. 게이트 = `panel:smoke` §16(브라우저에서 실제 가시성을 잰다 — 텍스트 게이트로는 영원히 못 잡는 종류다). 잃는 것: 없음(산식·payload 불변) · 0.2.1 = ★호스트 미로드를 **부팅 때** 알린다. 종전엔 `none` 을 조용히 넘겨 `host ?` 만 떴고 사람은 [판 만들기] 를 누르고서야 알았다. 그리고 그때 뜨는 문구가 **Z: 를 범인으로 단정**했는데(2026-09-18 실기) 진짜 원인은 이 PC 의 스텁이 전사 호스트를 목록에 안 넣은 것이었다 — Z: 는 멀쩡했고 사람은 드라이브를 보러 갔다. → 사유를 스텁에게 되묻고(oldstub·loaderr·notloaded) **조치가 다른 세 갈래**로 나눠 말한다. 잃는 것: 없음(산식·판·payload 불변) · 0.2.0 = 원본 측정(mesTr_measure) → 도련 경로 결정 → 배치·클리핑까지 · 0.1.0 = 신설
  // ★호스트 최소 버전 — 자동 분석(`mesTr_autoPick`)·벌별 슬롯·벌별 도련은 **0.3.0 부터**다.
  //   구 호스트는 그 함수가 없어 「함수가 아닙니다」로 떨어지거나(0.2.x), `M:idx,..` 를 조용히
  //   무시해 도련이 없는 판을 낸다(0.1.0). 조용한 격하라서 버전을 못박는다.
  var TR_MIN_HOST = [0, 3, 0];

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

    // ★도련은 **벌마다** 정한다 — 두 벌의 바탕색이 다른 판이 흔하다(2026-08 실측).
    //   안 재었으면 **모른다고 둔다**(추측해서 solid 로 만들지 않는다).
    var bleeds = [], worst = null, i;
    var RANK = { skip: 0, repeat: 1, clip: 2, solid: 3, none: 4 };
    function rank(m) { return (typeof RANK[m] === 'number') ? RANK[m] : 9; }
    for (i = 0; i < r.panels.length; i++) {
      var e = lastEdges[i] || {};
      var b = RV.planBleed({ design: r.design[i], panel: r.panels[i], edge: e });
      bleeds.push(b);
      // ⚠️`RANK[x] || 9` 로 쓰면 안 된다 — **skip 이 0 이라 falsy** 라 가장 나쁜 것이 9로 밀린다.
      //   review.js 의 `ORDER[level] || 9` 에서 같은 함정에 이미 한 번 걸렸다.
      if (worst === null || rank(b.mode) < rank(bleeds[worst].mode)) worst = i;
    }
    var wEdge = lastEdges[worst] || {};
    var review = RV.build({
      mode: 'plate', bleed: bleeds[worst], edge: wEdge, trace: r.trace,
      nonwoven: !!(el.nonwoven && el.nonwoven.checked)
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
    var e;
    if (kv[t + 'edge'] === 'solid') {
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
