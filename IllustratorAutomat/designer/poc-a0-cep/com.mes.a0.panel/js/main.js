/**
 * MES A0 CEP panel — main.js (A1 usable: mes-core 처리 파이프라인 연결)
 * 한글: config는 cep.fs(UTF-8) 우선 + host 폴백, params는 cep.fs로 temp(ASCII경로)에 UTF-8 기록.
 * evalScript 인자/반환은 ASCII만 → 브릿지 한글 깨짐 회피.
 */
(function () {
  'use strict';

  var ROSTER = ['인호동', '김보연', '정소은', '김영주'];
  var STORE_WORKER = 'mes_a0_worker';
  var STORE_SETTINGS = 'mes_a0_settings';
  var CONFIG_PATH = 'Z:/DESIGNS/IA-등록/_config/config.json';
  var SIDES = ['top', 'bottom', 'left', 'right'];
  var UTF8 = (window.cep && window.cep.encoding && window.cep.encoding.UTF8) ? window.cep.encoding.UTF8 : 'UTF-8';

  var methods = [];   // [{name, margin_cm, method_group}]
  var presets = [];   // [{name, config(obj), group}]
  var workerDomains = {}; // worker_name → 도메인(output/transfer/sign)
  var workers = [];    // [{id, name}] — 가공자↔MES user id 매핑(spec §3.5)
  var clientList = []; // [{id, client_name}] — 거래처 자동완성(spec D5)
  var DOMAIN_LABEL = { output: '현수막', transfer: '전사', sign: '간판' };

  function workerIdOf(name) {
    for (var i = 0; i < workers.length; i++) if (workers[i].name === name) return workers[i].id;
    return null;
  }
  function clientIdOf(name) {
    var t = (name || '').replace(/^\s+|\s+$/g, '');
    if (!t) return null;
    for (var i = 0; i < clientList.length; i++) if (clientList[i].client_name === t) return clientList[i].id;
    return null; // 미일치 = free-text 폴백(client_id null)
  }

  function $(id) { return document.getElementById(id); }
  function warnMissing(id) { console.warn('[mes-a0-cep] #' + id + ' not found'); }
  function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  // 주석 조합: 키워드-식별번호-수량ea (키워드 있을 때만). 거래처명 제외. 식별번호=큐 배치 seqNo
  function composeAnnot(keyword, seqNo, qty) {
    if (!keyword) return '';
    var s = keyword;
    if (seqNo != null && seqNo !== '') s += '-' + seqNo;
    s += '-' + qty + 'ea';
    return s;
  }

  // 후가공 파일명 세그먼트 조립(한글=params UTF-8 전달). 예: 양옆접어미싱+사방펀칭
  function posWord(o) {
    var t = !!o.top, b = !!o.bottom, l = !!o.left, r = !!o.right;
    var n = (t ? 1 : 0) + (b ? 1 : 0) + (l ? 1 : 0) + (r ? 1 : 0);
    if (n === 4) return '사방';
    if (l && r && !t && !b) return '양옆';
    if (t && b && !l && !r) return '상하';
    var s = '';
    if (t) s += '상'; if (b) s += '하'; if (l) s += '좌'; if (r) s += '우';
    return s;
  }
  function finishDesc(finishing, punch) {
    var segs = [], order = [], mSides = {};
    for (var s = 0; s < SIDES.length; s++) {
      var sd = SIDES[s], m = finishing[sd];
      if (!m) continue;
      if (!mSides[m]) { mSides[m] = { top: false, bottom: false, left: false, right: false }; order.push(m); }
      mSides[m][sd] = true;
    }
    for (var o = 0; o < order.length; o++) segs.push(posWord(mSides[order[o]]) + order[o]);
    var pc = punch || {};
    var ps = { top: pc.top > 0, bottom: pc.bottom > 0, left: pc.left > 0, right: pc.right > 0 };
    if (ps.top || ps.bottom || ps.left || ps.right) segs.push(posWord(ps) + '펀칭');
    var cn = pc.corners || {}, cs = [];
    if (cn.tl) cs.push('좌상'); if (cn.tr) cs.push('우상'); if (cn.bl) cs.push('좌하'); if (cn.br) cs.push('우하');
    if (cs.length === 4) segs.push('꼭짓점펀칭');
    else if (cs.length) segs.push(cs.join('') + '펀칭');
    return segs.join('+');
  }

  // ── cep.fs helpers (guarded) ──
  function cepReadUtf8(path) {
    if (!(window.cep && window.cep.fs)) return null;
    try {
      var r = window.cep.fs.readFile(path, UTF8);
      if (r && r.err === 0 && r.data) return r.data;
    } catch (e) { console.warn('[mes-a0-cep] cep.fs.readFile fail', e); }
    return null;
  }
  function cepWriteUtf8(path, data) {
    if (!(window.cep && window.cep.fs)) return false;
    try {
      var r = window.cep.fs.writeFile(path, data, UTF8);
      return !!(r && r.err === 0);
    } catch (e) { console.warn('[mes-a0-cep] cep.fs.writeFile fail', e); return false; }
  }

  function marginOf(name) {
    for (var i = 0; i < methods.length; i++) if (methods[i].name === name) return methods[i].margin_cm || 0;
    return 0;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var csi = new CSInterface();

    // ── 탭 전환 ──
    var tabs = document.getElementsByClassName('tab');
    var pages = document.getElementsByClassName('tabpage');
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].addEventListener('click', function () {
        var name = this.getAttribute('data-tab');
        for (var a = 0; a < tabs.length; a++) tabs[a].className = (tabs[a].getAttribute('data-tab') === name) ? 'tab active' : 'tab';
        for (var b = 0; b < pages.length; b++) pages[b].className = (pages[b].getAttribute('data-page') === name) ? 'tabpage' : 'tabpage hidden';
      });
    }

    // 용도 라디오 변경 → 후가공 게이트·버튼 라벨 즉시 반영
    (function bindModeRadios() {
      var rs = document.getElementsByName('mode');
      for (var i = 0; i < rs.length; i++) rs[i].addEventListener('change', function () { applyModeUi(); });
    })();

    var elWorker = $('worker'), elSaved = $('saved'), elVer = $('ver');
    var elMeas = $('meas'), elBtnMeasure = $('btnMeasure');
    var elQty = $('qty'), elScale = $('scale'), elPreset = $('preset');
    var elTrim = $('trim'), elTrimInk = $('trimInk'), elClient = $('client');
    var elPTop = $('pTop'), elPBottom = $('pBottom'), elPLeft = $('pLeft'), elPRight = $('pRight');
    var elPcTL = $('pcTL'), elPcTR = $('pcTR'), elPcBL = $('pcBL'), elPcBR = $('pcBR');
    var elAnnot = $('annot');
    var elATop = $('aTop'), elABottom = $('aBottom'), elALeft = $('aLeft'), elARight = $('aRight');
    var elBtnProcess = $('btnProcess'), elOut = $('out'), elCfg = $('cfgStatus');
    if (!elWorker) { warnMissing('worker'); return; }

    var finM = document.getElementsByClassName('finM'); // method selects
    var finCm = document.getElementsByClassName('finCm');
    var finMark = document.getElementsByClassName('finMark'); // 변별 재단/접는선 마크

    // ── 주석 위치 게이트: 마감 여백 3cm 이상인 변만 주석 체크 허용 ──
    var annChkMap = { top: elATop, bottom: elABottom, left: elALeft, right: elARight };
    function updateAnnotGates() {
      for (var s = 0; s < SIDES.length; s++) {
        var side = SIDES[s];
        var cmEl = cmInput(side), sel = methodSelect(side);
        var cm = parseFloat(cmEl ? cmEl.value : '');
        var ok = !!(sel && sel.value) && !isNaN(cm) && cm >= 3;
        var chk = annChkMap[side];
        if (!chk) continue;
        chk.disabled = !ok;
        if (!ok && chk.checked) chk.checked = false;
        if (chk.parentNode) chk.parentNode.style.opacity = ok ? '' : '0.4';
      }
    }
    for (var fci = 0; fci < finCm.length; fci++) finCm[fci].addEventListener('input', updateAnnotGates);

    function out(t, cls) { if (elOut) { elOut.textContent = t; elOut.className = 'out' + (cls ? ' ' + cls : ''); } }
    function setCfg(t) { if (elCfg) elCfg.textContent = t; }

    // ── 버전 ──
    csi.evalScript('mesA0_ping()', function (v) { if (elVer) elVer.textContent = v ? ('· ' + v) : '· (host?)'; });

    // ── 가공자 roster + 영속 ──
    for (var i = 0; i < ROSTER.length; i++) {
      var o = document.createElement('option'); o.value = ROSTER[i]; o.textContent = ROSTER[i]; elWorker.appendChild(o);
    }
    var storedW = null;
    try { storedW = window.localStorage.getItem(STORE_WORKER); } catch (e) {}
    if (storedW && ROSTER.indexOf(storedW) !== -1) elWorker.value = storedW;
    function showSaved() {
      if (!elSaved) return;
      var dom = workerDomains[elWorker.value] || 'output';
      elSaved.textContent = '신원: ' + (elWorker.value || '(없음)') + ' · ' + (DOMAIN_LABEL[dom] || dom);
    }
    showSaved();
    elWorker.addEventListener('change', function () {
      try { window.localStorage.setItem(STORE_WORKER, elWorker.value); } catch (e) {}
      showSaved();
      fillMethodSelects(); fillPresets(); updateAnnotGates(); // 도메인 전환 → 방식·프리셋 재로드
    });

    // ── 거래처 자동완성(spec D5): config.clients에서 부분일치 제안, 정확일치 시 client_id 해소 표시 ──
    var elClientSug = $('clientSug'), elClientHit = $('clientHit');
    function updateClientHit() {
      if (!elClientHit) return;
      var v = elClient ? (elClient.value || '').replace(/^\s+|\s+$/g, '') : '';
      var id = clientIdOf(v);
      elClientHit.textContent = id ? '✓등록' : (v ? '자유입력' : '');
      elClientHit.className = 'achit' + (id ? ' ok' : '');
    }
    function hideClientSug() { if (elClientSug) { elClientSug.className = 'sug hidden'; elClientSug.innerHTML = ''; } }
    function renderClientSug() {
      if (!elClientSug || !elClient) return;
      var q = (elClient.value || '').replace(/^\s+|\s+$/g, '');
      if (!q || !clientList.length) { hideClientSug(); return; }
      var qq = q.toLowerCase(), hits = [];
      for (var i = 0; i < clientList.length && hits.length < 15; i++) {
        var nm = clientList[i].client_name || '';
        if (nm.toLowerCase().indexOf(qq) !== -1) hits.push(nm);
      }
      if (!hits.length || (hits.length === 1 && hits[0] === q)) { hideClientSug(); return; }
      var html = '';
      for (var h = 0; h < hits.length; h++) html += '<div class="sgi" data-name="' + escHtml(hits[h]) + '">' + escHtml(hits[h]) + '</div>';
      elClientSug.innerHTML = html;
      elClientSug.className = 'sug';
      var sgis = elClientSug.getElementsByClassName('sgi');
      for (var k = 0; k < sgis.length; k++) sgis[k].addEventListener('mousedown', function (ev) {
        ev.preventDefault(); // blur로 목록이 닫히기 전에 선택 확정
        if (elClient) {
          elClient.value = this.getAttribute('data-name');
          hideClientSug();
          updateClientHit();
          saveSettings();
          try { elClient.dispatchEvent(new Event('change', { bubbles: true })); } catch (eD) {} // 연동 행 반영
        }
      });
    }
    if (elClient) {
      elClient.addEventListener('input', function () { renderClientSug(); updateClientHit(); });
      elClient.addEventListener('focus', function () { renderClientSug(); });
      elClient.addEventListener('blur', function () { window.setTimeout(hideClientSug, 150); updateClientHit(); });
    }

    // ── 마감 method 셀렉트 채우기 ──
    function fillMethodSelects() {
      for (var s = 0; s < finM.length; s++) {
        var sel = finM[s];
        sel.innerHTML = '';
        var none = document.createElement('option'); none.value = ''; none.textContent = '없음'; sel.appendChild(none);
        var dom = currentDomain();
        for (var m = 0; m < methods.length; m++) {
          if ((methods[m].method_group || 'output') !== dom) continue; // 도메인(가공자) 필터
          var op = document.createElement('option'); op.value = methods[m].name; op.textContent = methods[m].name; sel.appendChild(op);
        }
        // method 선택 시 cm 자동채움(비어있을 때만)
        sel.onchange = (function (side) {
          return function () {
            var cmEl = cmInput(side);
            var mv = this.value;
            if (mv && cmEl && cmEl.value === '') cmEl.value = String(marginOf(mv));
            if (!mv && cmEl) cmEl.value = '';
            updateAnnotGates();
          };
        })(sel.getAttribute('data-side'));
      }
    }
    function cmInput(side) {
      for (var i = 0; i < finCm.length; i++) if (finCm[i].getAttribute('data-side') === side) return finCm[i];
      return null;
    }
    function methodSelect(side) {
      for (var i = 0; i < finM.length; i++) if (finM[i].getAttribute('data-side') === side) return finM[i];
      return null;
    }
    function markSelect(side) {
      for (var i = 0; i < finMark.length; i++) if (finMark[i].getAttribute('data-side') === side) return finMark[i];
      return null;
    }
    function currentDomain() { return workerDomains[elWorker.value] || 'output'; } // 가공자→도메인(기본 현수막)

    // ── 프리셋 채우기 + 적용 ──
    function fillPresets() {
      if (!elPreset) return;
      elPreset.innerHTML = '';
      var d = document.createElement('option'); d.value = ''; d.textContent = '(직접 지정)'; elPreset.appendChild(d);
      var pdom = currentDomain();
      for (var p = 0; p < presets.length; p++) {
        if ((presets[p].group || 'output') !== pdom) continue; // 도메인(가공자) 필터
        var op = document.createElement('option'); op.value = presets[p].name; op.textContent = presets[p].name; elPreset.appendChild(op);
      }
      elPreset.onchange = function () {
        var name = elPreset.value;
        if (!name) return;
        var pr = null;
        for (var i = 0; i < presets.length; i++) if (presets[i].name === name) { pr = presets[i]; break; }
        if (!pr || !pr.config) return;
        for (var s = 0; s < SIDES.length; s++) {
          var side = SIDES[s];
          var mName = pr.config[side] || '';
          var sel = methodSelect(side), cmEl = cmInput(side), mkEl = markSelect(side);
          if (sel) sel.value = mName;
          if (cmEl) cmEl.value = mName ? String(marginOf(mName)) : '';
          if (mkEl) mkEl.value = pr.config[side + '_mark'] || ''; // 프리셋별 마크 프리필
        }
        updateAnnotGates();
      };
    }

    // ── config 로드 (cep.fs 우선 → host 폴백) ──
    function applyConfig(text) {
      var ok = false;
      try {
        var root = JSON.parse(text);
        var data = (root && root.data) ? root.data : root;
        methods = (data && data.methods) ? data.methods : [];
        var rawPresets = (data && data.presets) ? data.presets : [];
        presets = [];
        for (var i = 0; i < rawPresets.length; i++) {
          var cfg = {};
          try { cfg = JSON.parse(rawPresets[i].config); } catch (e) { cfg = {}; }
          presets.push({ name: rawPresets[i].name, config: cfg, group: rawPresets[i].method_group || 'output' });
        }
        workerDomains = {};
        var wds = (data && data.worker_domains) ? data.worker_domains : [];
        for (var wi = 0; wi < wds.length; wi++) if (wds[wi] && wds[wi].worker_name) workerDomains[wds[wi].worker_name] = wds[wi].domain;
        workers = (data && data.workers) ? data.workers : [];       // 가공자↔user id
        clientList = (data && data.clients) ? data.clients : [];    // 거래처 자동완성
        ok = true;
      } catch (e) { console.warn('[mes-a0-cep] config parse fail', e); }
      fillMethodSelects();
      fillPresets();
      showSaved(); // 도메인 라벨 반영
      setCfg(ok ? ('config ✓ 마감 ' + methods.length + '종 · 프리셋 ' + presets.length +
        (clientList.length ? (' · 거래처 ' + clientList.length) : '') +
        (workers.length ? (' · 가공자 ' + workers.length) : '')) : 'config 파싱 실패 — 마감 수동 입력');
      restoreSettings();
      updateClientHit();
      updateAnnotGates();
      applyModeUi(); // 직전값에 mode가 없어도 라벨·게이트가 현재 선택과 맞도록 무조건 1회
    }
    (function loadConfig() {
      var text = cepReadUtf8(CONFIG_PATH);
      if (text) { applyConfig(text); return; }
      // 폴백: host(ExtendScript)로 한글경로 읽기
      csi.evalScript('mesA0_config()', function (res) {
        if (res && res.length) applyConfig(res);
        else { methods = []; presets = []; fillMethodSelects(); fillPresets(); setCfg('config 없음(Z: 미마운트?) — 마감 수동 입력'); }
      });
    })();

    // ── 실측 ──
    function refreshMeasure(cb) {
      var inkOn = elTrimInk && elTrimInk.checked ? 1 : 0;
      csi.evalScript('mesA0_measure(' + inkOn + ')', function (res) {
        var r = null; try { r = JSON.parse(res); } catch (e) {}
        if (r && r.ok) {
          var n = parseInt(elScale ? elScale.value : '1', 10) || 1;
          var txt = r.w + ' × ' + r.h + ' cm' + (r.n > 1 ? (' · ' + r.n + '개') : '');
          if (r.vw != null && (Math.abs(r.vw - r.w) > 0.2 || Math.abs(r.vh - r.h) > 0.2)) txt += ' (겉보기 ' + r.vw + '×' + r.vh + ')';
          if (n > 1) txt += '  → 실물 ' + (Math.round(r.w * n * 10) / 10) + ' × ' + (Math.round(r.h * n * 10) / 10);
          if (elMeas) elMeas.textContent = txt;
        } else {
          var err = r ? r.err : 'nohost';
          if (elMeas) elMeas.textContent = (err === 'nodoc') ? '열린 문서 없음' : (err === 'nosel') ? '객체를 선택하세요' : '측정 불가(' + err + ')';
        }
        if (typeof cb === 'function') cb();
      });
    }
    if (elBtnMeasure) elBtnMeasure.addEventListener('click', function () { refreshMeasure(); });
    if (elScale) elScale.addEventListener('change', function () { refreshMeasure(); });
    if (elTrimInk) elTrimInk.addEventListener('change', function () { refreshMeasure(); saveSettings(); });

    // ── 설정 영속(직전값 기억) ──
    function gatherSettings() {
      var fin = {};
      for (var s = 0; s < SIDES.length; s++) {
        var sel = methodSelect(SIDES[s]), cmEl = cmInput(SIDES[s]), mkEl = markSelect(SIDES[s]);
        fin[SIDES[s]] = { m: sel ? sel.value : '', cm: cmEl ? cmEl.value : '', mark: mkEl ? mkEl.value : '' };
      }
      return { qty: elQty ? elQty.value : '1', scale: elScale ? elScale.value : '1',
        mode: modeValue(), trim: elTrim ? !!elTrim.checked : false, trimInk: elTrimInk ? !!elTrimInk.checked : false, client: elClient ? elClient.value : '',
        punch: { t: elPTop ? elPTop.value : '0', b: elPBottom ? elPBottom.value : '0', l: elPLeft ? elPLeft.value : '0', r: elPRight ? elPRight.value : '0',
          ctl: elPcTL ? !!elPcTL.checked : false, ctr: elPcTR ? !!elPcTR.checked : false, cbl: elPcBL ? !!elPcBL.checked : false, cbr: elPcBR ? !!elPcBR.checked : false },
        annot: elAnnot ? elAnnot.value : '',
        annotPos: { t: elATop ? !!elATop.checked : false, b: elABottom ? !!elABottom.checked : false, l: elALeft ? !!elALeft.checked : false, r: elARight ? !!elARight.checked : false }, fin: fin };
    }
    function saveSettings() { try { window.localStorage.setItem(STORE_SETTINGS, JSON.stringify(gatherSettings())); } catch (e) {} }
    function restoreSettings() {
      var raw = null; try { raw = window.localStorage.getItem(STORE_SETTINGS); } catch (e) {}
      if (!raw) return;
      var st = null; try { st = JSON.parse(raw); } catch (e) { return; }
      if (!st) return;
      if (elQty && st.qty) elQty.value = st.qty;
      if (elScale && st.scale) elScale.value = st.scale;
      if (elTrim) elTrim.checked = !!st.trim;
      if (elTrimInk) elTrimInk.checked = !!st.trimInk;
      if (elClient && st.client) elClient.value = st.client;
      if (st.punch) {
        if (elPTop && st.punch.t != null) elPTop.value = st.punch.t;
        if (elPBottom && st.punch.b != null) elPBottom.value = st.punch.b;
        if (elPLeft && st.punch.l != null) elPLeft.value = st.punch.l;
        if (elPRight && st.punch.r != null) elPRight.value = st.punch.r;
        if (elPcTL) elPcTL.checked = !!st.punch.ctl;
        if (elPcTR) elPcTR.checked = !!st.punch.ctr;
        if (elPcBL) elPcBL.checked = !!st.punch.cbl;
        if (elPcBR) elPcBR.checked = !!st.punch.cbr;
      }
      if (elAnnot && st.annot != null) elAnnot.value = st.annot;
      if (st.annotPos) {
        if (elATop) elATop.checked = !!st.annotPos.t;
        if (elABottom) elABottom.checked = !!st.annotPos.b;
        if (elALeft) elALeft.checked = !!st.annotPos.l;
        if (elARight) elARight.checked = !!st.annotPos.r;
      }
      if (st.mode) setMode(st.mode);
      if (st.fin) {
        for (var s = 0; s < SIDES.length; s++) {
          var f = st.fin[SIDES[s]]; if (!f) continue;
          var sel = methodSelect(SIDES[s]), cmEl = cmInput(SIDES[s]), mkEl = markSelect(SIDES[s]);
          if (sel && f.m) sel.value = f.m;
          if (cmEl && f.cm != null) cmEl.value = f.cm;
          if (mkEl && f.mark != null) mkEl.value = f.mark;
        }
      }
      updateAnnotGates();
    }
    function modeValue() {
      var rs = document.getElementsByName('mode');
      for (var i = 0; i < rs.length; i++) if (rs[i].checked) return rs[i].value;
      return 'single';
    }
    function setMode(v) {
      var rs = document.getElementsByName('mode');
      var hit = false;
      for (var i = 0; i < rs.length; i++) { rs[i].checked = (rs[i].value === v); if (rs[i].checked) hit = true; }
      // 레거시 'both'(선택지 제거됨)는 단건으로 흡수 — 라디오가 전부 해제된 채 남지 않게.
      if (!hit) { for (var j = 0; j < rs.length; j++) if (rs[j].value === 'single') rs[j].checked = true; }
      applyModeUi();
    }

    // 용도에 따른 UI 게이트(2026-07-28): 모아찍기는 후가공이 없다.
    //   host.jsx:332 `if (mode !== 'impose')` — 모아찍기는 마감 여백·EPS를 아예 만들지 않고
    //   원본 크기 work.ai만 저장한다. 그런데 폼에서는 마감·펀칭 입력이 열려 있어
    //   "후가공을 넣었는데 안 먹었다"는 오해가 실제로 발생했다(2026-07-28). 입력 자체를 닫는다.
    function applyModeUi() {
      var impose = (modeValue() === 'impose');
      var finTab = null, finPage = null;
      for (var a = 0; a < tabs.length; a++) if (tabs[a].getAttribute('data-tab') === 'fin') finTab = tabs[a];
      for (var b = 0; b < pages.length; b++) if (pages[b].getAttribute('data-page') === 'fin') finPage = pages[b];
      if (finPage) {
        var ins = finPage.querySelectorAll('input, select, textarea, button');
        for (var i = 0; i < ins.length; i++) ins[i].disabled = impose;
        finPage.style.opacity = impose ? '0.45' : '';
      }
      if (finTab) {
        finTab.disabled = impose;
        finTab.title = impose ? '모아찍기 용도에는 후가공이 적용되지 않습니다 (판에서 처리)' : '';
        finTab.style.opacity = impose ? '0.45' : '';
        // 후가공 탭을 보고 있는 상태에서 모아찍기로 바꾸면 가공 탭으로 되돌린다(빈 화면 방지).
        if (impose && finTab.className.indexOf('active') >= 0) {
          for (var c2 = 0; c2 < tabs.length; c2++) tabs[c2].className = (tabs[c2].getAttribute('data-tab') === 'proc') ? 'tab active' : 'tab';
          for (var d = 0; d < pages.length; d++) pages[d].className = (pages[d].getAttribute('data-page') === 'proc') ? 'tabpage' : 'tabpage hidden';
        }
      }
      var hint = document.getElementById('modeHint');
      if (hint) hint.textContent = impose ? '후가공 없음 · work.ai만 추출 → ia-editor' : '';
      if (elBtnProcess) elBtnProcess.textContent = impose ? '모아찍기 추출' : '단건 가공';
    }

    // ── 가공 실행 ──
    function gatherParams() {
      var qty = parseInt(elQty ? elQty.value : '1', 10); if (isNaN(qty) || qty < 1) qty = 1;
      var scaleN = parseInt(elScale ? elScale.value : '1', 10); if (isNaN(scaleN) || scaleN < 1) scaleN = 1;
      var finishing = {};
      for (var s = 0; s < SIDES.length; s++) {
        var side = SIDES[s];
        var sel = methodSelect(side), cmEl = cmInput(side);
        var m = sel ? sel.value : '';
        if (m) {
          var cm = parseFloat(cmEl ? cmEl.value : '');
          if (isNaN(cm)) cm = marginOf(m);
          finishing[side] = m; finishing[side + '_cm'] = cm;
        }
        var mkEl = markSelect(side); // 변별 마크(fold/cut) — 방식·여백과 독립
        if (mkEl && mkEl.value) finishing[side + '_mark'] = mkEl.value;
      }
      var pInt = function (el) { var n = parseInt(el ? el.value : '0', 10); return (isNaN(n) || n < 0) ? 0 : n; };
      var keyword = elAnnot ? (elAnnot.value || '').replace(/^\s+|\s+$/g, '') : '';
      var punchObj = {
        top: pInt(elPTop), bottom: pInt(elPBottom), left: pInt(elPLeft), right: pInt(elPRight),
        corners: { tl: elPcTL ? !!elPcTL.checked : false, tr: elPcTR ? !!elPcTR.checked : false, bl: elPcBL ? !!elPcBL.checked : false, br: elPcBR ? !!elPcBR.checked : false }
      };
      return {
        worker_name: elWorker.value || null,
        registered_by_id: workerIdOf(elWorker.value), // config.workers 매핑 → manifest worker_id("내 작업" 상관)
        client_name: elClient ? (elClient.value || '') : '',
        client_id: clientIdOf(elClient ? elClient.value : ''), // 정확일치 시 해소, 미일치=null(free-text)
        qty: qty, scale_n: scaleN, mode: modeValue(),
        trim: elTrim ? !!elTrim.checked : false,
        trim_ink: elTrimInk ? !!elTrimInk.checked : false, // 보이는 잉크로 축소(클립∩콘텐츠)
        punch: punchObj,
        keyword: keyword, // 주석·파일명. 식별번호(seq_no)는 단건 null, 배치는 키워드별 순번
        post_desc: finishDesc(finishing, punchObj), // 후가공 파일명 세그먼트(예: 양옆접어미싱+사방펀칭)
        annot_pos: { top: elATop ? !!elATop.checked : false, bottom: elABottom ? !!elABottom.checked : false, left: elALeft ? !!elALeft.checked : false, right: elARight ? !!elARight.checked : false },
        finishing: finishing, order_item_id: null
      };
    }
    var warnKo = { R: '원본 RGB→CMYK 변환', T: '아웃라인 안 된 텍스트', L: '링크(미임베드) 이미지', O: '아웃라인 일부 실패' };
    function warnText(w) {
      if (!w) return '';
      var out = [];
      for (var i = 0; i < w.length; i++) if (warnKo[w[i]]) out.push('⚠ ' + warnKo[w[i]]);
      return out.length ? ('\n' + out.join('\n')) : '';
    }

    if (elBtnProcess) elBtnProcess.addEventListener('click', function () {
      var params = gatherParams();
      saveSettings();
      out('가공 중… (저장 프리즈 중 잠시 대기)');
      elBtnProcess.disabled = true;
      csi.evalScript('mesA0_paramsPath()', function (pp) {
        if (!pp) { out('호스트 연결 실패(패널을 일러 안에서 열었는지 확인)', 'err'); elBtnProcess.disabled = false; return; }
        var wrote = cepWriteUtf8(pp, JSON.stringify(params));
        if (!wrote) { out('params 파일 쓰기 실패(' + pp + ')', 'err'); elBtnProcess.disabled = false; return; }
        csi.evalScript('mesA0_process()', function (res) {
          elBtnProcess.disabled = false;
          var r = null; try { r = JSON.parse(res); } catch (e) {}
          if (!r) { out('응답 파싱 실패:\n' + res, 'err'); return; }
          if (!r.ok) {
            var em = { noparams: 'params 없음', badparams: 'params 손상', nodoc: '열린 문서 없음', nosel: '객체를 선택하세요', nobounds: '크기 측정 불가', nofolder: 'Z: 등록폴더 생성 실패', noart: '디자인 측정 실패(복제 아트 없음)' };
            var detail = (r.err === 'noart') ? ('\n(붙여넣기 아이템 ' + r.items + '개 · 선택 ' + r.sel + '개' + (r.copyErr ? (' · copy오류: ' + r.copyErr) : '') + ')') : '';
            out('가공 실패: ' + (em[r.err] || r.err) + detail, 'err');
            return;
          }
          var msg = '가공 완료 ✓\n등록: ' + (params.client_name || '(파일명)') + ' · 수량 ' + params.qty +
            '\n실물: ' + r.w + ' × ' + r.h + ' cm' + (params.scale_n > 1 ? (' (파일 1/' + params.scale_n + ')') : '') +
            '\n' + (r.eps ? ('EPS: ' + r.eps) : '(모아찍기용 — work.ai만)') +
            '\n폴더: ' + r.folder + warnText(r.warn) +
            '\n[diag] 아이템 ' + r.items + ' · 정규화 ' + r.normed +
            '\n→ 에이전트 ingest 후 대기함에 표시됩니다.';
          out(msg, 'okmsg');
        });
      });
    });

    // ── 반자동 큐 (A2) + 행↔폼 연동 (A안: 분해 → 행 선택 → 행별 후가공 세팅 → 검토문서 → 확정) ──
    var queue = []; // [{params, client, keyword, qty, w, h}]
    var bound = -1; // 폼과 연동 중인 행 인덱스(-1=없음). 연동 중 폼 변경=그 행에만 반영
    var elQueueBox = $('queueBox'), elBtnQAdd = $('btnQueueAdd'), elBtnQBatch = $('btnQueueBatch'), elBtnConfirm = $('btnConfirm'), elBtnQClear = $('btnQueueClear'), elBtnApplyAll = $('btnApplyAll');
    var elBtnReview = $('btnReview'), elBtnAutoDetect = $('btnAutoDetect');

    // 확정 게이트(D4): 검토문서를 만든 큐 상태(rev)에서만 확정 허용. 큐가 바뀌면 재검토 요구.
    var queueRev = 0;      // 큐 내용 변경마다 증가(행 추가·삭제·세팅·키워드)
    var reviewedRev = -1;  // 마지막 검토문서 생성 시점의 rev
    var reviewBusy = false;
    function updateGate() {
      var stale = reviewedRev !== queueRev;
      if (elBtnConfirm) {
        elBtnConfirm.disabled = queue.length === 0 || stale || reviewBusy;
        elBtnConfirm.title = (queue.length && stale) ? '검토문서로 확인한 뒤 확정할 수 있습니다' : '';
      }
      if (elBtnReview) {
        elBtnReview.disabled = queue.length === 0 || reviewBusy;
        elBtnReview.textContent = (queue.length && !stale) ? '검토문서 ✓' : '검토문서';
      }
    }
    function bumpRev() { queueRev++; updateGate(); }

    function renderQueue() {
      if (elQueueBox) {
        if (!queue.length) {
          elQueueBox.innerHTML = '<div class="qempty">큐 비어있음 — 디자인 선택 후 [＋ 큐에 추가]</div>';
        } else {
          var html = '';
          for (var i = 0; i < queue.length; i++) {
            var e = queue[i];
            var fx = (e.params && e.params.post_desc) ? (' · ' + e.params.post_desc) : '';
            var meta = e.w + '×' + e.h + 'cm ×' + e.qty + (e.client ? (' · ' + e.client) : '') + fx;
            html += '<div class="qrow' + (i === bound ? ' sel' : '') + '" data-i="' + i + '"><span class="qn">#' + (i + 1) + '</span>' +
              '<input class="qkw" data-i="' + i + '" type="text" value="' + escHtml(e.keyword || '') + '" placeholder="키워드" />' +
              '<span class="qmeta" title="' + escHtml(meta) + '">' + escHtml(meta) + '</span>' +
              '<button class="qdel" data-i="' + i + '">✕</button></div>';
          }
          elQueueBox.innerHTML = html;
          var rows = elQueueBox.getElementsByClassName('qrow');
          for (var r = 0; r < rows.length; r++) rows[r].addEventListener('click', function (ev) {
            var cls = (ev.target && ev.target.className) ? String(ev.target.className) : '';
            if (cls.indexOf('qkw') !== -1 || cls.indexOf('qdel') !== -1) return; // 인라인 편집·삭제 클릭은 행 선택 아님
            toggleBind(parseInt(this.getAttribute('data-i'), 10));
          });
          var dels = elQueueBox.getElementsByClassName('qdel');
          for (var d = 0; d < dels.length; d++) dels[d].addEventListener('click', function () { queueRemove(parseInt(this.getAttribute('data-i'), 10)); });
          var kws = elQueueBox.getElementsByClassName('qkw');
          for (var w2 = 0; w2 < kws.length; w2++) kws[w2].addEventListener('change', function () {
            var ix = parseInt(this.getAttribute('data-i'), 10);
            if (ix >= 0 && ix < queue.length) {
              var v = this.value.replace(/^\s+|\s+$/g, '');
              queue[ix].keyword = v;
              if (queue[ix].params) queue[ix].params.keyword = v; // 호스트 조합용 동기화
              if (ix === bound && elAnnot) elAnnot.value = v;     // 연동 행이면 폼(주석 키워드)도 정합
              bumpRev(); // 키워드=주석·식별번호에 반영 → 재검토 필요
            }
          });
        }
      }
      if (elBtnConfirm) elBtnConfirm.textContent = '일괄 확정 (' + queue.length + ')';
      if (elBtnApplyAll) elBtnApplyAll.disabled = queue.length === 0;
      updateGate();
    }

    // 행 클릭=폼 연동 토글: 행 params를 가공·후가공 탭에 로드, 이후 폼 변경은 그 행에만 반영
    function toggleBind(i) {
      if (isNaN(i) || i < 0 || i >= queue.length) return;
      if (bound === i) { bound = -1; renderQueue(); out('행 연동 해제 — 폼 설정은 이후 새 담기에 사용'); return; }
      bound = i;
      applyRowToForm(queue[i]);
      renderQueue();
      out('#' + (i + 1) + ' 행 연동 중 — 가공·후가공 탭 수정이 이 행에 반영됩니다 (행 다시 클릭=해제)');
    }

    function setSelectValue(sel, v) { if (!sel) return; sel.value = ''; if (v != null && v !== '') sel.value = v; }

    function applyRowToForm(e) {
      var p = e.params || {};
      if (elQty) elQty.value = String(e.qty || p.qty || 1);
      if (elScale && p.scale_n) elScale.value = String(p.scale_n);
      if (p.mode) setMode(p.mode);
      if (elTrim) elTrim.checked = !!p.trim;
      if (elTrimInk) elTrimInk.checked = !!p.trim_ink;
      if (elClient) elClient.value = e.client || p.client_name || '';
      var pc = p.punch || {}, cn = pc.corners || {};
      if (elPTop) elPTop.value = String(pc.top || 0);
      if (elPBottom) elPBottom.value = String(pc.bottom || 0);
      if (elPLeft) elPLeft.value = String(pc.left || 0);
      if (elPRight) elPRight.value = String(pc.right || 0);
      if (elPcTL) elPcTL.checked = !!cn.tl;
      if (elPcTR) elPcTR.checked = !!cn.tr;
      if (elPcBL) elPcBL.checked = !!cn.bl;
      if (elPcBR) elPcBR.checked = !!cn.br;
      if (elAnnot) elAnnot.value = e.keyword || p.keyword || '';
      var ap = p.annot_pos || {};
      if (elATop) elATop.checked = !!ap.top;
      if (elABottom) elABottom.checked = !!ap.bottom;
      if (elALeft) elALeft.checked = !!ap.left;
      if (elARight) elARight.checked = !!ap.right;
      var fin = p.finishing || {};
      for (var s = 0; s < SIDES.length; s++) {
        var side = SIDES[s];
        setSelectValue(methodSelect(side), fin[side] || '');
        var cmEl = cmInput(side);
        if (cmEl) cmEl.value = fin[side] ? String(fin[side + '_cm'] != null ? fin[side + '_cm'] : marginOf(fin[side])) : '';
        setSelectValue(markSelect(side), fin[side + '_mark'] || '');
      }
      if (elPreset) elPreset.value = ''; // 프리셋 표기는 (직접 지정)으로 — 실값은 위에서 로드됨
      updateClientHit();
      updateAnnotGates();
    }

    // 연동 행에 현재 폼 반영 — gatherParams 재사용으로 post_desc(파일명 세그먼트)·주석 게이트까지 행별 재계산
    function syncBoundRow() {
      if (bound < 0 || bound >= queue.length) return;
      var p = gatherParams();
      var e = queue[bound];
      e.params = p;
      e.qty = p.qty;
      e.client = p.client_name || '';
      e.keyword = p.keyword || '';
      bumpRev();
      renderQueue();
    }

    // 폼 변경 위임 감지(연동 시 자동 반영). 큐 내부(qkw)·가공자·분리간격은 제외
    document.addEventListener('change', function (ev) {
      if (bound < 0) return;
      var t = ev.target;
      if (!t) return;
      if (elQueueBox && elQueueBox.contains(t)) return;
      if (t.id === 'worker' || t.id === 'splitGap') return;
      syncBoundRow();
    });

    // 현재 폼 설정을 전체 행에 적용 — 행 고유값(수량·키워드·거래처)은 보존
    if (elBtnApplyAll) elBtnApplyAll.addEventListener('click', function () {
      if (!queue.length) return;
      var base = gatherParams();
      for (var i = 0; i < queue.length; i++) {
        var e = queue[i];
        var p = JSON.parse(JSON.stringify(base));
        p.qty = e.qty;
        p.keyword = e.keyword || '';
        p.client_name = e.client || '';
        p.client_id = clientIdOf(p.client_name); // 행 거래처 기준 재해소(폼 거래처 id가 남지 않게)
        e.params = p;
      }
      bumpRev();
      renderQueue();
      out('현재 가공·후가공 설정을 전체 ' + queue.length + '행에 적용 (수량·키워드·거래처는 행값 유지)');
    });

    function queueRemove(i) {
      if (i < 0 || i >= queue.length) return;
      csi.evalScript('mesA0_queueRemove(' + i + ')', function () {});
      queue.splice(i, 1);
      if (bound === i) bound = -1;
      else if (bound > i) bound--;
      bumpRev();
      renderQueue();
    }

    if (elBtnQAdd) elBtnQAdd.addEventListener('click', function () {
      csi.evalScript('mesA0_queueAdd()', function (res) {
        var r = null; try { r = JSON.parse(res); } catch (e) {}
        if (!r || !r.ok) {
          var em = { nodoc: '열린 문서 없음', nosel: '객체를 선택하세요', nobounds: '크기 측정 불가' };
          out('큐 추가 실패: ' + (r ? (em[r.err] || r.err) : '호스트 연결 안 됨'), 'err');
          return;
        }
        var qtyN = parseInt(elQty ? elQty.value : '1', 10); if (isNaN(qtyN) || qtyN < 1) qtyN = 1;
        var client = elClient ? (elClient.value || '').replace(/^\s+|\s+$/g, '') : '';
        var keyword = elAnnot ? (elAnnot.value || '').replace(/^\s+|\s+$/g, '') : '';
        queue.push({ params: gatherParams(), client: client, keyword: keyword, qty: qtyN, w: r.w, h: r.h });
        bumpRev();
        renderQueue();
        out('큐 추가됨: #' + queue.length + ' (' + r.w + '×' + r.h + 'cm)', 'okmsg');
      });
    });

    if (elBtnQBatch) elBtnQBatch.addEventListener('click', function () {
      var gapEl = $('splitGap');
      var gap = gapEl ? parseFloat(gapEl.value) : 0; if (isNaN(gap)) gap = 0;
      csi.evalScript('mesA0_queueAddBatch(' + gap + ')', function (res) { // 분리 간격(mm): 0=겹칠때만·음수=더 잘게
        var r = null; try { r = JSON.parse(res); } catch (e) {}
        if (!r || !r.ok) {
          var em = { nodoc: '열린 문서 없음', nosel: '객체를 선택하세요', nobounds: '크기 측정 불가', allnoise: '전부 50mm 미만(노이즈)' };
          out('묶음 분리 실패: ' + (r ? (em[r.err] || r.err) : '호스트 연결 안 됨'), 'err');
          return;
        }
        var qtyN = parseInt(elQty ? elQty.value : '1', 10); if (isNaN(qtyN) || qtyN < 1) qtyN = 1;
        var client = elClient ? (elClient.value || '').replace(/^\s+|\s+$/g, '') : '';
        var keyword = elAnnot ? (elAnnot.value || '').replace(/^\s+|\s+$/g, '') : '';
        var base = gatherParams();
        for (var s = 0; s < r.sizes.length; s++) {
          queue.push({ params: JSON.parse(JSON.stringify(base)), client: client, keyword: keyword, qty: qtyN, w: r.sizes[s].w, h: r.sizes[s].h });
        }
        bumpRev();
        renderQueue();
        out('묶음 분리: ' + r.added + '개로 나눔 (분리간격 ' + gap + 'mm·클립존중·50mm↓ 제외). 틀리면 [✕] 삭제 후 개별 추가로 교정', 'okmsg');
      });
    });

    if (elBtnQClear) elBtnQClear.addEventListener('click', function () {
      csi.evalScript('mesA0_queueClear()', function () {});
      csi.evalScript('mesA0_reviewDiscard()', function () {}); // 검토문서도 폐기
      queue = []; bound = -1; bumpRev(); renderQueue(); out('큐 비움');
    });

    // ── 자동감지 시드(A3): 선택 불필요 — 문서 전체에서 디자인 후보 감지 → 큐 제안 ──
    if (elBtnAutoDetect) elBtnAutoDetect.addEventListener('click', function () {
      var gapEl = $('splitGap');
      var gap = gapEl ? parseFloat(gapEl.value) : 0; if (isNaN(gap)) gap = 0;
      csi.evalScript('mesA0_autoDetect(' + gap + ')', function (res) {
        var r = null; try { r = JSON.parse(res); } catch (e) {}
        if (!r || !r.ok) {
          var em = { nodoc: '열린 문서 없음', noitems: '감지할 개체 없음(잠금·숨김 제외)', allnoise: '전부 50mm 미만(노이즈)', nobounds: '크기 측정 불가', scan: '문서 스캔 실패' };
          out('자동감지 실패: ' + (r ? (em[r.err] || r.err) : '호스트 연결 안 됨'), 'err');
          return;
        }
        var qtyN = parseInt(elQty ? elQty.value : '1', 10); if (isNaN(qtyN) || qtyN < 1) qtyN = 1;
        var client = elClient ? (elClient.value || '').replace(/^\s+|\s+$/g, '') : '';
        var keyword = elAnnot ? (elAnnot.value || '').replace(/^\s+|\s+$/g, '') : '';
        var base = gatherParams();
        for (var s = 0; s < r.sizes.length; s++) {
          queue.push({ params: JSON.parse(JSON.stringify(base)), client: client, keyword: keyword, qty: qtyN, w: r.sizes[s].w, h: r.sizes[s].h });
        }
        bumpRev();
        renderQueue();
        out('자동감지 시드: ' + r.added + '개 제안 (문서 전체·클립존중·50mm↓ 제외·분리간격 ' + gap + 'mm)\n틀리면 [✕] 삭제·선택 후 [＋ 개별]로 교정', 'okmsg');
      });
    });

    // ── 검토문서(D4): 큐 전체를 가공해 디자인당 아트보드로 생성(저장 없음) → 확정 게이트 해제 ──
    if (elBtnReview) elBtnReview.addEventListener('click', function () {
      if (!queue.length || reviewBusy) return;
      reviewBusy = true;
      if (elBtnQAdd) elBtnQAdd.disabled = true;
      if (elBtnProcess) elBtnProcess.disabled = true;
      updateGate();
      var revAtStart = queueRev;
      // 식별번호 미리보기 = 확정과 동일 규칙(키워드별 순번)
      var kwCount = {}, seqForRow = [];
      for (var qi = 0; qi < queue.length; qi++) {
        var K = queue[qi].keyword || '';
        if (K) { kwCount[K] = (kwCount[K] || 0) + 1; seqForRow[qi] = kwCount[K]; }
        else { seqForRow[qi] = qi + 1; }
      }
      var i = 0, fails = [];
      function finishReview() {
        csi.evalScript('mesA0_reviewEnd()', function (er) {
          reviewBusy = false;
          if (elBtnQAdd) elBtnQAdd.disabled = false;
          if (elBtnProcess) elBtnProcess.disabled = false;
          var r = null; try { r = JSON.parse(er); } catch (e) {}
          if (!fails.length && r && r.ok) {
            if (queueRev === revAtStart) reviewedRev = queueRev; // 생성 중 큐가 안 바뀐 경우만 해제
            out('검토문서 ✓ — 아트보드 ' + r.count + '개' + (r.docs > 1 ? (' · 문서 ' + r.docs + '개(대지 한도 분할)') : '') +
              '\n일러에서 확인(아트보드 이동/줌) 후 [일괄 확정]. 큐를 고치면 재검토 필요.', 'okmsg');
          } else {
            out('검토문서 실패: ' + (fails.length ? fails.join(', ') : (r ? r.err : '호스트 연결 안 됨')), 'err');
          }
          updateGate();
        });
      }
      function step() {
        if (i >= queue.length) { finishReview(); return; }
        out('검토 가공 중… (' + i + '/' + queue.length + ')');
        var p = JSON.parse(JSON.stringify(queue[i].params));
        p.review_only = 1;
        p.seq_no = seqForRow[i];
        csi.evalScript('mesA0_paramsPath()', function (pp) {
          if (!pp) { fails.push('#' + (i + 1) + ' nohost'); i++; step(); return; }
          cepWriteUtf8(pp, JSON.stringify(p));
          csi.evalScript('mesA0_queueSelect(' + i + ')', function (selRes) {
            var sr = null; try { sr = JSON.parse(selRes); } catch (e2) {}
            if (!sr || !sr.ok) { fails.push('#' + (i + 1) + ' sel:' + (sr ? sr.err : '?')); i++; step(); return; }
            csi.evalScript('mesA0_process()', function (res) {
              var r2 = null; try { r2 = JSON.parse(res); } catch (e3) {}
              if (!r2 || !r2.ok) fails.push('#' + (i + 1) + ' ' + (r2 ? r2.err : 'parse'));
              i++; step();
            });
          });
        });
      }
      csi.evalScript('mesA0_reviewBegin()', function () { step(); });
    });

    if (elBtnConfirm) elBtnConfirm.addEventListener('click', function () {
      if (!queue.length) return;
      if (reviewedRev !== queueRev) { out('검토문서로 확인한 뒤 확정하세요 — [검토문서] 버튼', 'err'); updateGate(); return; }
      if (elBtnQAdd) elBtnQAdd.disabled = true;
      if (elBtnProcess) elBtnProcess.disabled = true;
      if (elBtnReview) elBtnReview.disabled = true;
      elBtnConfirm.disabled = true;
      function reenable() {
        if (elBtnQAdd) elBtnQAdd.disabled = false;
        if (elBtnProcess) elBtnProcess.disabled = false;
        updateGate();
      }
      csi.evalScript('mesA0_batchBegin()', function (bres) {
        var bf = null; try { bf = JSON.parse(bres); } catch (e0) {}
        if (!bf || !bf.ok) { out('배치 폴더 생성 실패: ' + (bf ? bf.err : 'nohost'), 'err'); reenable(); elBtnConfirm.disabled = false; return; }
        var batchFolder = bf.folder, results = [], i = 0;
        // 식별번호 = 키워드별 순번(같은 키워드끼리 1,2,3). 키워드 없으면 전체순번(파일명 유니크)
        var kwCount = {}, seqForRow = [];
        for (var qi = 0; qi < queue.length; qi++) {
          var K = queue[qi].keyword || '';
          if (K) { kwCount[K] = (kwCount[K] || 0) + 1; seqForRow[qi] = kwCount[K]; }
          else { seqForRow[qi] = qi + 1; }
        }
        function finishBatch() {
          var okN = 0, failN = 0, lines = [];
          for (var k = 0; k < results.length; k++) {
            var r = results[k];
            if (r && r.ok) { okN++; lines.push('#' + (k + 1) + ' ✓ ' + (r.eps || '(work.ai)')); }
            else { failN++; lines.push('#' + (k + 1) + ' ✗ ' + (r ? r.err : '?')); }
          }
          out('일괄 확정 완료: 성공 ' + okN + ' / 실패 ' + failN + '\n폴더: ' + batchFolder + '\n' + lines.join('\n') + '\n→ 에이전트 ingest 후 대기함', failN ? 'err' : 'okmsg');
          csi.evalScript('mesA0_queueClear()', function () {});
          csi.evalScript('mesA0_reviewDiscard()', function () {}); // 검토문서 정리(저장물과 무관)
          queue = []; bound = -1; renderQueue(); reenable();
        }
        function step() {
          if (i >= queue.length) { finishBatch(); return; }
          out('일괄 가공 중… (' + i + '/' + queue.length + ') → ' + batchFolder);
          var e = queue[i];
          var p = e.params;
          p.seq_no = seqForRow[i]; // 키워드별 순번
          p.batch_folder = batchFolder;
          p.batch_index = i + 1;   // 폴더 내 파일 유니크(work_N/thumb_N/manifest_N)
          csi.evalScript('mesA0_paramsPath()', function (pp) {
            if (!pp) { results.push({ ok: false, err: 'nohost' }); i++; step(); return; }
            cepWriteUtf8(pp, JSON.stringify(p));
            csi.evalScript('mesA0_queueSelect(' + i + ')', function (selRes) {
              var sr = null; try { sr = JSON.parse(selRes); } catch (e2) {}
              if (!sr || !sr.ok) { results.push({ ok: false, err: 'sel:' + (sr ? sr.err : '?') }); i++; step(); return; }
              csi.evalScript('mesA0_process()', function (res) {
                var r = null; try { r = JSON.parse(res); } catch (e3) {}
                results.push(r || { ok: false, err: 'parse' });
                i++; step();
              });
            });
          });
        }
        step();
      });
    });

    renderQueue();

    // 초기 실측 시도
    refreshMeasure();
  });
})();
