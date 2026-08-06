/**
 * 최상위 탭 (가공 ↔ 재단) — 2026-08-04 패널 병합.
 *
 * 왜 파일을 따로 두는가: main.js(A0)·cut-main.js(재단)는 각각 IIFE 로 닫혀 있고 서로를 모른다.
 * 둘 다 건드리는 유일한 상태(어느 페이지가 보이는가)를 어느 한쪽에 넣으면 그쪽이 상대의 주인이 된다.
 * 여기 한 곳만 `document.body[data-main]` 을 쓰고, 나머지는 **읽거나 이벤트를 듣기만** 한다.
 *
 * ⚠️ 클래스·속성 이름이 A0 안쪽 탭(`.tab` · `[data-tab]`)과 **달라야 한다**(`.mtab` · `[data-main-tab]`).
 *    같으면 main.js 의 탭 위임 핸들러가 최상위 탭까지 집어 안쪽 페이지를 뒤바꾼다.
 * ⚠️ 상태는 `.panel` 의 **class 가 아니라 body 의 attribute** 에 둔다 — 재단 탭의 설명 토글이
 *    `root.className = 'panel'` 로 클래스를 통째로 덮어쓰기 때문이다(cut-main.js).
 */
(function () {
  'use strict';

  var KEY = 'mes_main_tab';

  function pages() { return document.querySelectorAll('[data-main-page]'); }
  function tabs() { return document.querySelectorAll('.mtab'); }

  function apply(name, fire) {
    var want = (name === 'cut') ? 'cut' : 'a0';
    var i, el;
    var ps = pages();
    for (i = 0; i < ps.length; i++) {
      el = ps[i];
      if (el.getAttribute('data-main-page') === want) el.className = 'mainpage';
      else el.className = 'mainpage hidden';
    }
    var ts = tabs();
    for (i = 0; i < ts.length; i++) {
      el = ts[i];
      el.className = (el.getAttribute('data-main-tab') === want) ? 'mtab active' : 'mtab';
    }
    document.body.setAttribute('data-main', want);
    // 버전 표시는 보고 있는 쪽만 — 둘 다 띄우면 좁은 패널에서 제목이 두 줄이 된다
    var v = document.getElementById('ver'), cv = document.getElementById('cutVer');
    if (v) v.className = (want === 'a0') ? 'ver' : 'ver hidden';
    if (cv) cv.className = (want === 'cut') ? 'ver' : 'ver hidden';
    // 설명 토글(?)은 **두 탭 공용**이다 (2026-08-06).
    //   CSS 가 `.panel.no-hints .hint` 로 패널 전체에 걸리므로 접힘 상태는 원래 공용이었는데,
    //   버튼만 재단 쪽에 있어서 **가공 탭에서는 설명을 켤 수단이 없었다** — 접힌 줄도 모른 채
    //   "설명이 어디 갔냐"가 되는 구조다. 버튼을 항상 띄운다.
    var help = document.getElementById('btnHelp');
    if (help) help.className = 'mini title-btn';
    try { window.localStorage.setItem(KEY, want); } catch (e) {}
    if (fire) {
      // cut-main.js 가 이걸 듣고 첫 진입 때만 문서 정보를 갱신한다(안 보이는 탭은 호스트를 안 찌른다)
      var ev;
      try {
        ev = new CustomEvent('mes:mainTab', { detail: { tab: want } });
      } catch (e2) {                       // CEP 구 엔진 폴백
        ev = document.createEvent('CustomEvent');
        ev.initCustomEvent('mes:mainTab', false, false, { tab: want });
      }
      document.dispatchEvent(ev);
    }
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== document.body) {
      if (t.className && String(t.className).indexOf('mtab') === 0) {
        apply(t.getAttribute('data-main-tab'), true);
        return;
      }
      t = t.parentNode;
    }
  });

  var saved = null;
  try { saved = window.localStorage.getItem(KEY); } catch (e3) {}
  apply(saved || 'a0', false);   // 첫 적용은 이벤트를 쏘지 않는다 — 각 main.js 가 아직 초기화 전이다

  window.MesMainTab = { get: function () { return document.body.getAttribute('data-main'); }, set: function (n) { apply(n, true); } };
})();
