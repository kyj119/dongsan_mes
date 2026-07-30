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

    // ── 탭 전환 = 용도 선택(2026-07-29 리모델) ──
    //   **탭이 곧 용도다.** 이전 `용도` 라디오는 제거했다 — 라디오 하나가 다른 탭을 원격으로 잠그고
    //   실행 버튼의 의미까지 바꾸던 구조가 "모아찍기인데 전체가 1건으로 등록"의 뿌리였다.
    //   single=단건 · impose=모아찍기 · bundle=묶음(단건 여러 건).
    var tabs = document.getElementsByClassName('tab');
    var pages = document.getElementsByClassName('tabpage');
    function activeTab() {
      for (var a = 0; a < tabs.length; a++) {
        if (tabs[a].className.indexOf('active') >= 0) return tabs[a].getAttribute('data-tab');
      }
      return 'single';
    }
    function activateTab(name) {
      for (var a = 0; a < tabs.length; a++) tabs[a].className = (tabs[a].getAttribute('data-tab') === name) ? 'tab active' : 'tab';
      for (var b = 0; b < pages.length; b++) pages[b].className = (pages[b].getAttribute('data-page') === name) ? 'tabpage' : 'tabpage hidden';
      applyTabUi();
    }
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].addEventListener('click', function () { activateTab(this.getAttribute('data-tab')); });
    }

    var elWorker = $('worker'), elSaved = $('saved'), elVer = $('ver');
    var elMeas = $('meas'), elBtnMeasure = $('btnMeasure');
    var elQty = $('qty'), elScale = $('scale'), elPreset = $('preset');
    var elTrim = $('trim'), elTrimInk = $('trimInk'), elClient = $('client');
    var elBorderLine = $('borderLine'); // 출력 경계선(백색 테두리) on/off — 기본 ON(기존 동작)
    var elPTop = $('pTop'), elPBottom = $('pBottom'), elPLeft = $('pLeft'), elPRight = $('pRight');
    var elPcTL = $('pcTL'), elPcTR = $('pcTR'), elPcBL = $('pcBL'), elPcBR = $('pcBR');
    var elAnnot = $('annot');
    var elATop = $('aTop'), elABottom = $('aBottom'), elALeft = $('aLeft'), elARight = $('aRight');
    var elBtnProcess = $('btnProcess'), elOut = $('out'), elCfg = $('cfgStatus');
    // 후가공 접이식(단건 탭 안) — 최상위 탭에서 강등. 모아찍기엔 아예 존재하지 않는 개념이라
    //   "잠긴 채 자리만 차지하는 탭"이 사라진다.
    var elFinToggle = $('finToggle'), elFinBody = $('finBody');
    // 후가공은 단건·묶음 공용 1벌 — 탭 전환 때 폼 자체를 옮긴다(2026-07-30).
    //   묶음도 후가공이 필요한데 폼이 단건 탭 안에만 있어 "묶음엔 후가공이 없다"로 보였다.
    //   기능은 원래 있었다(행 연동 → syncBoundRow 가 그 행에만 반영) — 없던 것은 접근 경로다.
    //   복제 대신 이동인 이유 = id 중복 금지 + 두 벌이면 값이 갈려 등록된 쪽을 특정할 수 없다.
    var elFinToggleRow = $('finToggleRow'), elFinHostSingle = $('finHostSingle'), elFinHostBundle = $('finHostBundle');
    function moveFinishingTo(host) {
      if (!host || !elFinToggleRow || !elFinBody) return;
      if (elFinToggleRow.parentNode === host) return; // 이미 그 자리 = 재부착 금지(포커스·접힘 유실 방지)
      host.appendChild(elFinToggleRow);
      host.appendChild(elFinBody);
    }
    // 모아찍기 탭 전용
    var elImposeBox = $('imposeBox'), elImposeGap = $('imposeGap');
    var elBtnImposeSplit = $('btnImposeSplit'), elBtnImposeDetect = $('btnImposeDetect');
    var elBtnImposeRegister = $('btnImposeRegister'), elBtnImposeClear = $('btnImposeClear');
    if (!elWorker) { warnMissing('worker'); return; }
    if (!elImposeBox) warnMissing('imposeBox');
    if (!elFinBody) warnMissing('finBody');

    if (elFinToggle && elFinBody) {
      elFinToggle.addEventListener('click', function () {
        var open = elFinBody.className.indexOf('hidden') >= 0;
        elFinBody.className = open ? '' : 'hidden';
        elFinToggle.innerHTML = (open ? '▾' : '▸') + ' 후가공 <span class="cfg">마감·돔보·펀칭·주석</span>';
      });
    }

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
      applyTabUi(); // 직전값에 mode가 없어도 게이트·버튼이 현재 탭과 맞도록 무조건 1회
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
    // ⚠️ 후가공(마감·펀칭·주석위치)은 **영속 대상이 아니다**(2026-07-29).
    //   등록 1건이 끝날 때마다 초기화하는 정책([[clearFinishing]])인데 localStorage 로 되살리면
    //   패널을 다시 열 때 앞 건 설정이 그대로 상속돼 정책이 무의미해진다.
    //   계속 기억하는 것 = 수량·배율·용도·돔보·거래처·키워드(작업 연속성 축).
    function gatherSettings() {
      return { qty: elQty ? elQty.value : '1', scale: elScale ? elScale.value : '1',
        mode: modeValue(), trim: elTrim ? !!elTrim.checked : false, trimInk: elTrimInk ? !!elTrimInk.checked : false, client: elClient ? elClient.value : '',
        annot: elAnnot ? elAnnot.value : '' };
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
      if (elAnnot && st.annot != null) elAnnot.value = st.annot;
      if (st.mode) setMode(st.mode);
      // st.punch·st.annotPos·st.fin(구버전 저장분)은 의도적으로 무시 — 위 gatherSettings 주석 참조.
      updateAnnotGates();
    }
    // 용도 = 활성 탭에서 파생(2026-07-29). 묶음 탭은 '단건 여러 건'이라 single.
    //   레거시 'both'는 single 로 흡수한다(선택지 자체가 없어진 지 오래).
    function modeValue() { return activeTab() === 'impose' ? 'impose' : 'single'; }
    function setMode(v) {
      var want = (v === 'impose') ? 'impose' : 'single';
      // 이미 같은 용도면 탭을 옮기지 않는다 — 묶음 탭에서 행을 클릭할 때마다
      //   단건 탭으로 튕겨 나가는 것을 막는다(행 mode 는 전부 single).
      if (modeValue() !== want) activateTab(want);
    }

    // 후가공 초기화(2026-07-29) — ⓐ모아찍기 전환 시 즉시 ⓑ등록 1건이 끝날 때마다.
    //   ⚠️ disabled 입력도 `.value` 는 그대로 읽힌다 → 화면만 잠가서는 manifest 에 실리는 걸 못 막는다.
    //   실증: intake #28 은 mode=impose 인데 finishing.left=접어미싱 4cm · post_desc=접쫑접어미싱 이 기록됐다.
    //   키워드(주석)는 파일명·식별번호 축이라 지우지 않는다.
    function clearFinishing() {
      for (var ci = 0; ci < SIDES.length; ci++) {
        var cside = SIDES[ci];
        var cms = methodSelect(cside); if (cms) cms.value = '';
        var ccm = cmInput(cside); if (ccm) ccm.value = '';
        var cmk = markSelect(cside); if (cmk) cmk.value = '';
      }
      if (elPTop) elPTop.value = '0';
      if (elPBottom) elPBottom.value = '0';
      if (elPLeft) elPLeft.value = '0';
      if (elPRight) elPRight.value = '0';
      if (elPcTL) elPcTL.checked = false;
      if (elPcTR) elPcTR.checked = false;
      if (elPcBL) elPcBL.checked = false;
      if (elPcBR) elPcBR.checked = false;
      if (elATop) elATop.checked = false;
      if (elABottom) elABottom.checked = false;
      if (elALeft) elALeft.checked = false;
      if (elARight) elARight.checked = false;
      if (elPreset) elPreset.value = '';
      if (elBorderLine) elBorderLine.checked = true; // 기본 ON 으로 복귀(끈 상태가 다음 건에 상속되지 않게)
      updateAnnotGates();
    }

    // 탭 전환 후 UI 정합(2026-07-29). 후가공은 이제 단건 탭 안 접이식이라 잠글 대상이 없다 —
    //   모아찍기 탭에서는 화면에 보이지도 않는다. 다만 **값은 반드시 비운다**:
    //   host.jsx 는 `mode !== 'impose'` 에서만 후가공을 쓰므로, 값이 남아 있으면 manifest 에만
    //   실려 "기록됐는데 안 먹는" 상태가 된다(intake #28 실증).
    function applyTabUi() {
      var mv = modeValue();
      if (mv === 'impose') clearFinishing();
      // ⚠️ 폼 위치는 modeValue() 로 판단하면 안 된다 — 묶음 탭도 modeValue()='single' 이다(:407,
      //    행 mode 가 전부 single 이라 그렇게 설계됨). 위치는 '어느 탭을 보고 있나'라서 activeTab().
      else moveFinishingTo(activeTab() === 'bundle' ? elFinHostBundle : elFinHostSingle);
      // config 로드(restoreSettings→setMode)가 큐 초기화보다 먼저 도는 경로가 있다 —
      //   그때 queue 는 아직 undefined 다. 여기서 막지 않으면 패널이 통째로 죽는다.
      //   이후 DOMContentLoaded 끝의 renderQueue() 가 게이트·버튼을 정리한다.
      if (!queue) return;
      updateGate();
      updateImposeBar();
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
      var annotPos = {
        top: elATop ? !!elATop.checked : false, bottom: elABottom ? !!elABottom.checked : false,
        left: elALeft ? !!elALeft.checked : false, right: elARight ? !!elARight.checked : false
      };
      // 모아찍기는 후가공이 없다(host.jsx `mode !== 'impose'` 게이트). UI 초기화(clearFinishing)와
      // **별개로 전송 단계에서도 잘라낸다** — 화면 경로가 하나라도 새면 manifest 에 그대로 실린다.
      // post_desc(파일명 세그먼트)도 아래에서 빈 finishing 기준으로 재계산되어 ''가 된다.
      if (modeValue() === 'impose') {
        finishing = {};
        punchObj = { top: 0, bottom: 0, left: 0, right: 0, corners: { tl: false, tr: false, bl: false, br: false } };
        annotPos = { top: false, bottom: false, left: false, right: false };
      }
      return {
        worker_name: elWorker.value || null,
        registered_by_id: workerIdOf(elWorker.value), // config.workers 매핑 → manifest worker_id("내 작업" 상관)
        client_name: elClient ? (elClient.value || '') : '',
        client_id: clientIdOf(elClient ? elClient.value : ''), // 정확일치 시 해소, 미일치=null(free-text)
        qty: qty, scale_n: scaleN, mode: modeValue(),
        trim: elTrim ? !!elTrim.checked : false,
        // 출력 경계선(백색 테두리). host 는 `!== false` 로 읽으므로 구 패널(키 없음)은 기존대로 ON.
        border_line: elBorderLine ? !!elBorderLine.checked : true,
        trim_ink: elTrimInk ? !!elTrimInk.checked : false, // 보이는 잉크로 축소(클립∩콘텐츠)
        punch: punchObj,
        keyword: keyword, // 주석·파일명. 식별번호(seq_no)는 단건 null, 배치는 키워드별 순번
        post_desc: finishDesc(finishing, punchObj), // 후가공 파일명 세그먼트(예: 양옆접어미싱+사방펀칭)
        annot_pos: annotPos,
        finishing: finishing, order_item_id: null
      };
    }
    // E = 임베드 이미지가 디자인 밖까지 큰 상태(host 계측 warn 'E'). 잘려 안 보이는 부분까지 파일에 저장돼
    //     용량이 급증하는데 스크립트로는 줄일 수 없다 → 디자이너가 원본에서 정리해야 한다(유일한 근본 수단).
    var warnKo = { R: '원본 RGB→CMYK 변환', T: '아웃라인 안 된 텍스트', L: '링크(미임베드) 이미지', O: '아웃라인 일부 실패',
      E: '임베드 이미지가 디자인 밖까지 큼 — 원본에서 잘라내면 파일이 크게 줄어듭니다' };
    function mbText(bytes) { // 용량을 눈에 보이게 = 커지는 걸 알아채는 유일한 지점
      if (!bytes) return '';
      return ' · work.ai ' + (Math.round(bytes / 1048576 * 10) / 10) + 'MB';
    }
    function warnText(w) {
      if (!w) return '';
      var out = [];
      for (var i = 0; i < w.length; i++) if (warnKo[w[i]]) out.push('⚠ ' + warnKo[w[i]]);
      return out.length ? ('\n' + out.join('\n')) : '';
    }

    // 단건 탭 전용 버튼 — 이제 의미가 하나다(모아찍기는 자기 탭에서 분리→등록).
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
            (r.dxf ? ('\nDXF: ' + r.dxf + ' (재단선 — 돔보 선택분)') : '') +
            '\n폴더: ' + r.folder + warnText(r.warn) +
            '\n[diag] 아이템 ' + r.items + ' · 정규화 ' + r.normed + mbText(r.bytes) +
            '\n→ 에이전트 ingest 후 대기함에 표시됩니다.';
          out(msg + '\n(후가공 설정은 초기화됨 — 다음 건에 상속되지 않습니다)', 'okmsg');
          clearFinishing();  // 등록 완료 = 후가공 리셋. 연속 작업에서 앞 건 마감이 뒤 건에 새는 사고 차단.
          saveSettings();
        });
      });
    });

    // ── 반자동 큐 (A2) + 행↔폼 연동 (A안: 분해 → 행 선택 → 행별 후가공 세팅 → 검토문서 → 확정) ──
    var queue = []; // [{params, client, keyword, qty, w, h}]
    var bound = -1; // 폼과 연동 중인 행 인덱스(-1=없음). 연동 중 폼 변경=그 행에만 반영
    // 큐를 그리는 컨테이너들 — 묶음 탭과 모아찍기 탭이 **같은 큐를 각자 화면에서** 본다.
    //   자료구조를 둘로 쪼개면 host($.global.mesA0Q)까지 갈라야 해서 Z: 축을 건드리게 된다.
    //   대신 "다른 용도의 행이 섞이면 거부"하는 가드로 혼선을 막는다(아래 imposeGuard).
    var queueBoxes = [];
    var elQueueBox = $('queueBox'), elBtnQAdd = $('btnQueueAdd'), elBtnQBatch = $('btnQueueBatch'), elBtnConfirm = $('btnConfirm'), elBtnQClear = $('btnQueueClear'), elBtnApplyAll = $('btnApplyAll');
    // 수량 3분화(2026-07-29) — 한 칸이 탭마다 다른 의미를 갖던 구조를 끊는다.
    //   #qty(단건 탭)   = 그 건의 **최종 수량**(주문서 라인으로 프리필)
    //   #seedQty(묶음)  = 담을 때 채우는 **기본값**뿐. 확정 수량은 각 행(qqty)이 정본
    //   모아찍기        = **수량을 받지 않는다**. ia-editor 가 intake.qty 를 안 쓰고
    //                     판짜기 인스펙터에서 조각별 개수를 다시 받기 때문(iaEditor.js:1892 qty:1 고정).
    var elSeedQty = $('seedQty');
    function seedQtyValue() {
      var n = parseInt(elSeedQty ? elSeedQty.value : '1', 10);
      return (isNaN(n) || n < 1) ? 1 : n;
    }
    var elBtnReview = $('btnReview'), elBtnAutoDetect = $('btnAutoDetect');

    // 확정 게이트(D4): 검토문서를 만든 큐 상태(rev)에서만 확정 허용. 큐가 바뀌면 재검토 요구.
    var queueRev = 0;      // 큐 내용 변경마다 증가(행 추가·삭제·세팅·키워드)
    var reviewedRev = -1;  // 마지막 검토문서 생성 시점의 rev
    var reviewBusy = false;
    // 큐 전 행이 모아찍기인가 — 검토문서 게이트 면제 판정(P2). 빈 큐는 false.
    function queueAllImpose() {
      if (!queue.length) return false;
      for (var qi = 0; qi < queue.length; qi++) {
        if (!queue[qi].params || queue[qi].params.mode !== 'impose') return false;
      }
      return true;
    }
    function updateGate() {
      var stale = (reviewedRev !== queueRev) && !queueAllImpose();
      if (elBtnConfirm) {
        elBtnConfirm.disabled = queue.length === 0 || stale || reviewBusy;
        elBtnConfirm.title = (queue.length && stale) ? '검토문서로 확인한 뒤 확정할 수 있습니다' : '';
      }
      if (elBtnReview) {
        elBtnReview.disabled = queue.length === 0 || reviewBusy;
        // ✓ 는 "실제로 검토했는가"만 표시한다 — stale 로 판정하면 게이트가 면제된 모아찍기 큐가
        //   검토한 적 없는데도 ✓ 로 보인다(2026-07-29).
        elBtnReview.textContent = (queue.length && reviewedRev === queueRev) ? '검토문서 ✓' : '검토문서';
      }
    }
    function bumpRev() { queueRev++; updateGate(); }

    // 큐 1개를 여러 컨테이너에 그린다(묶음 탭·모아찍기 탭). 컨테이너별로 이벤트를 다시 붙인다.
    //   showQty=false 면 행 수량칸을 아예 그리지 않는다(모아찍기 — 수량을 받지 않는 경로).
    function renderQueueInto(box, emptyMsg, showQty) {
      if (box) {
        if (!queue.length) {
          box.innerHTML = '<div class="qempty">' + emptyMsg + '</div>';
        } else {
          var html = '';
          for (var i = 0; i < queue.length; i++) {
            var e = queue[i];
            var fx = (e.params && e.params.post_desc) ? (' · ' + e.params.post_desc) : '';
            // 수량은 메타 문자열에서 뺀다 — 아래 인라인 입력칸이 정본(2026-07-29 P4).
            var meta = e.w + '×' + e.h + 'cm' + (e.client ? (' · ' + e.client) : '') + fx;
            html += '<div class="qrow' + (i === bound ? ' sel' : '') + '" data-i="' + i + '"><span class="qn">#' + (i + 1) + '</span>' +
              '<input class="qkw" data-i="' + i + '" type="text" value="' + escHtml(e.keyword || '') + '" placeholder="키워드" />' +
              (showQty ? ('<input class="qqty" data-i="' + i + '" type="text" value="' + escHtml(String(e.qty || 1)) + '" title="확정 수량(이 행의 정본)" />') : '') +
              '<span class="qmeta" title="' + escHtml(meta) + '">' + escHtml(meta) + '</span>' +
              '<button class="qdel" data-i="' + i + '">✕</button></div>';
          }
          box.innerHTML = html;
          var rows = box.getElementsByClassName('qrow');
          for (var r = 0; r < rows.length; r++) rows[r].addEventListener('click', function (ev) {
            var cls = (ev.target && ev.target.className) ? String(ev.target.className) : '';
            if (cls.indexOf('qkw') !== -1 || cls.indexOf('qqty') !== -1 || cls.indexOf('qdel') !== -1) return; // 인라인 편집·삭제 클릭은 행 선택 아님
            toggleBind(parseInt(this.getAttribute('data-i'), 10));
          });
          var dels = box.getElementsByClassName('qdel');
          for (var d = 0; d < dels.length; d++) dels[d].addEventListener('click', function () { queueRemove(parseInt(this.getAttribute('data-i'), 10)); });
          var kws = box.getElementsByClassName('qkw');
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
          // 행별 수량(2026-07-29 P4) — 전엔 큐 추가 시점의 폼 수량이 전 행에 복사돼,
          //   행마다 다른 수량을 넣으려면 행을 하나씩 연동해 폼을 고치는 수밖에 없었다.
          //   ⚠️ 여기서 renderQueue() 를 부르지 않는다 — DOM 재생성으로 입력 포커스가 날아간다.
          //   (수량을 메타 문자열에서 뺀 이유 = 재렌더 없이도 표시가 어긋나지 않게)
          var qts = box.getElementsByClassName('qqty');
          for (var q2 = 0; q2 < qts.length; q2++) qts[q2].addEventListener('change', function () {
            var ix = parseInt(this.getAttribute('data-i'), 10);
            if (isNaN(ix) || ix < 0 || ix >= queue.length) return;
            var n = parseInt(this.value, 10); if (isNaN(n) || n < 1) n = 1;
            this.value = String(n); // 잘못 입력한 값 즉시 교정 표시
            queue[ix].qty = n;
            if (queue[ix].params) queue[ix].params.qty = n; // 호스트 전송값 동기화
            // 폼(#qty)으로 되쓰지 않는다 — #qty 는 단건 탭 전용값이고, 행 수량의 정본은 이 칸이다.
            bumpRev(); // 수량=주석 문구에 반영 → 재검토 필요
          });
        }
      }
    }

    // 큐 상태 → 모아찍기 탭 등록 버튼. 단건 행이 섞이면 비활성(용도가 다른 걸 같이 등록하지 않는다).
    function updateImposeBar() {
      if (!elBtnImposeRegister) return;
      var n = queue.length, allImpose = queueAllImpose();
      elBtnImposeRegister.textContent = '등록 (' + n + ')';
      elBtnImposeRegister.disabled = (n === 0) || !allImpose;
      elBtnImposeRegister.title = (n && !allImpose)
        ? '단건 용도 행이 섞여 있습니다 — [묶음] 탭에서 확정하거나 비우고 다시 분리하세요'
        : '';
    }

    function renderQueue() {
      renderQueueInto(elQueueBox, '큐 비어있음 — 디자인 선택 후 [＋ 개별] 또는 [＋ 묶음분리]', true);
      renderQueueInto(elImposeBox, '조각 없음 — 디자인 선택 후 [선택분 분리] 또는 [◎ 자동감지]', false);
      if (elBtnConfirm) elBtnConfirm.textContent = '일괄 확정 (' + queue.length + ')';
      if (elBtnApplyAll) elBtnApplyAll.disabled = queue.length === 0;
      updateGate();
      updateImposeBar();
    }

    // 행 클릭=폼 연동 토글: 행 params를 가공·후가공 탭에 로드, 이후 폼 변경은 그 행에만 반영
    function toggleBind(i) {
      if (isNaN(i) || i < 0 || i >= queue.length) return;
      if (bound === i) { bound = -1; renderQueue(); out('행 연동 해제 — 폼 설정은 이후 새 담기에 사용'); return; }
      bound = i;
      applyRowToForm(queue[i]);
      renderQueue();
      var baseMsg = '#' + (i + 1) + ' 행 연동 중 — [단건] 탭의 설정·후가공 수정이 이 행에 반영됩니다 (행 다시 클릭=해제)';
      out(baseMsg);
      // P3(2026-07-29): 이 행이 **어느 그룹인지** 일러에서 보여준다 — 원본 조각을 선택.
      //   mesA0_queueSelect 는 검토·확정 루프가 이미 쓰던 함수를 그대로 재사용(재구현 금지).
      //   실패(문서 닫힘·참조 무효)해도 연동은 유지한다 — 폼 편집까지 막을 이유가 없다.
      csi.evalScript('mesA0_queueSelect(' + i + ')', function (sres) {
        var sr = null; try { sr = JSON.parse(sres); } catch (e) {}
        if (sr && sr.ok) { out(baseMsg + '\n· 일러에서 이 행의 조각 ' + sr.n + '개를 선택했습니다'); return; }
        var em = { range: '행 범위 오류', stale: '원본 객체 참조 무효(문서가 수정됨)', docgone: '원본 문서가 닫힘' };
        out(baseMsg + '\n· 일러 선택 실패: ' + (sr ? (em[sr.err] || sr.err) : '호스트 연결 안 됨'));
      });
    }

    function setSelectValue(sel, v) { if (!sel) return; sel.value = ''; if (v != null && v !== '') sel.value = v; }

    function applyRowToForm(e) {
      var p = e.params || {};
      // 행 수량은 폼(#qty)으로 끌어오지 않는다 — 정본이 행이므로 왕복시키면 다시 두 곳이 된다.
      if (elScale && p.scale_n) elScale.value = String(p.scale_n);
      if (p.mode) setMode(p.mode);
      if (elTrim) elTrim.checked = !!p.trim;
      if (elBorderLine) elBorderLine.checked = (p.border_line !== false); // 구 행(키 없음)=ON
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
      p.qty = e.qty;   // 행 수량 보존 — 폼(#qty)은 단건 전용이라 행을 덮어쓰면 안 된다
      e.params = p;
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
      if (elImposeBox && elImposeBox.contains(t)) return; // 모아찍기 탭 목록의 인라인 편집도 제외
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
        var qtyN = seedQtyValue(); // 묶음: 새 행 기본수량(#seedQty). 확정 수량은 각 행에서.
        var client = elClient ? (elClient.value || '').replace(/^\s+|\s+$/g, '') : '';
        var keyword = elAnnot ? (elAnnot.value || '').replace(/^\s+|\s+$/g, '') : '';
        var pAdd = gatherParams(); pAdd.qty = qtyN; // #qty(단건 최종값)가 아니라 seedQty 가 기본값이다
        queue.push({ params: pAdd, client: client, keyword: keyword, qty: qtyN, w: r.w, h: r.h });
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
        var qtyN = seedQtyValue(); // 묶음: 새 행 기본수량(#seedQty). 확정 수량은 각 행에서.
        var client = elClient ? (elClient.value || '').replace(/^\s+|\s+$/g, '') : '';
        var keyword = elAnnot ? (elAnnot.value || '').replace(/^\s+|\s+$/g, '') : '';
        var base = gatherParams();
        for (var s = 0; s < r.sizes.length; s++) {
          var pRow = JSON.parse(JSON.stringify(base)); pRow.qty = qtyN;
          queue.push({ params: pRow, client: client, keyword: keyword, qty: qtyN, w: r.sizes[s].w, h: r.sizes[s].h });
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
        var qtyN = seedQtyValue(); // 묶음: 새 행 기본수량(#seedQty). 확정 수량은 각 행에서.
        var client = elClient ? (elClient.value || '').replace(/^\s+|\s+$/g, '') : '';
        var keyword = elAnnot ? (elAnnot.value || '').replace(/^\s+|\s+$/g, '') : '';
        var base = gatherParams();
        for (var s = 0; s < r.sizes.length; s++) {
          var pRow = JSON.parse(JSON.stringify(base)); pRow.qty = qtyN;
          queue.push({ params: pRow, client: client, keyword: keyword, qty: qtyN, w: r.sizes[s].w, h: r.sizes[s].h });
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

    // 큐 일괄 등록 루프 — [일괄 확정] 과 [모아찍기 추출](P2 자동분리) 이 **공유**한다. 재구현 금지.
    //   batch 폴더 1개에 work_N·thumb_N·manifest_N 을 만든다(= batch734 산출 구조).
    //   onDone(okN, failN) = 완료 콜백(선택).
    function runBatchConfirm(onDone) {
      if (!queue.length) return;
      if (elBtnQAdd) elBtnQAdd.disabled = true;
      if (elBtnProcess) elBtnProcess.disabled = true;
      if (elBtnReview) elBtnReview.disabled = true;
      if (elBtnConfirm) elBtnConfirm.disabled = true;
      function reenable() {
        if (elBtnQAdd) elBtnQAdd.disabled = false;
        if (elBtnProcess) elBtnProcess.disabled = false;
        updateGate();
      }
      csi.evalScript('mesA0_batchBegin()', function (bres) {
        var bf = null; try { bf = JSON.parse(bres); } catch (e0) {}
        if (!bf || !bf.ok) { out('배치 폴더 생성 실패: ' + (bf ? bf.err : 'nohost'), 'err'); reenable(); if (elBtnConfirm) elBtnConfirm.disabled = false; return; }
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
            // 모아찍기 = 100MB급 work.ai 가 실제로 나온 경로 → 행별로 용량·경고를 반드시 노출한다.
            if (r && r.ok) { okN++; lines.push('#' + (k + 1) + ' ✓ ' + (r.eps || '(work.ai)') + (r.dxf ? ' +DXF' : '') + mbText(r.bytes) + warnText(r.warn).replace(/\n/g, ' ')); }
            else { failN++; lines.push('#' + (k + 1) + ' ✗ ' + (r ? r.err : '?')); }
          }
          out('일괄 확정 완료: 성공 ' + okN + ' / 실패 ' + failN + '\n폴더: ' + batchFolder + '\n' + lines.join('\n') + '\n→ 에이전트 ingest 후 대기함', failN ? 'err' : 'okmsg');
          csi.evalScript('mesA0_queueClear()', function () {});
          csi.evalScript('mesA0_reviewDiscard()', function () {}); // 검토문서 정리(저장물과 무관)
          queue = []; bound = -1; renderQueue(); reenable();
          clearFinishing(); // 일괄 등록 완료 = 후가공 리셋(단건 경로와 동일 규칙)
          saveSettings();
          if (typeof onDone === 'function') onDone(okN, failN);
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
    }

    // ── 모아찍기 탭 — 분리 → 목록 → 등록(자체 완결) ──────────────────────────
    //   분리는 `mesA0_queueAddBatch`/`mesA0_autoDetect`(호스트), 등록은 `runBatchConfirm`
    //   (= [일괄 확정])을 **그대로 재사용**한다. 산출 구조가 묶음 확정과 동일하다.
    //   결과는 항상 목록으로 보인 뒤 별도 버튼으로 등록한다 — 1덩어리로 뭉쳐도 눈에 먼저 띈다.
    function imposeSeed(hostCall, gap) {
      if (queue.length) { // 남은 큐를 휩쓸어 등록하는 사고 차단
        out('목록에 ' + queue.length + '건이 남아 있습니다 — [등록]하거나 [비우기] 후 다시 분리하세요.', 'err');
        return;
      }
      if (elBtnImposeSplit) elBtnImposeSplit.disabled = true;
      if (elBtnImposeDetect) elBtnImposeDetect.disabled = true;
      csi.evalScript(hostCall + '(' + gap + ')', function (res) {
        if (elBtnImposeSplit) elBtnImposeSplit.disabled = false;
        if (elBtnImposeDetect) elBtnImposeDetect.disabled = false;
        var r = null; try { r = JSON.parse(res); } catch (e) {}
        if (!r || !r.ok) {
          var em = { nodoc: '열린 문서 없음', nosel: '객체를 선택하세요', noitems: '감지할 개체 없음(잠금·숨김 제외)',
            nobounds: '크기 측정 불가', allnoise: '전부 50mm 미만(노이즈)', scan: '문서 스캔 실패' };
          out('분리 실패: ' + (r ? (em[r.err] || r.err) : '호스트 연결 안 됨'), 'err');
          return;
        }
        // 모아찍기는 수량을 받지 않는다 — 판에 몇 개 앉힐지는 ia-editor 판짜기가 조각별로 정한다
        //   (iaEditor.js:1892 는 intake.qty 를 쓰지 않고 qty:1 로 담는다). 여기서 받아봐야 표시용 메모다.
        var qtyN = 1;
        var client = elClient ? (elClient.value || '').replace(/^\s+|\s+$/g, '') : '';
        var keyword = elAnnot ? (elAnnot.value || '').replace(/^\s+|\s+$/g, '') : '';
        var base = gatherParams(); // impose 탭이라 finishing·punch·annot_pos는 이미 비어 있다
        base.qty = qtyN;
        var lines = [];
        for (var s = 0; s < r.sizes.length; s++) {
          var pRow = JSON.parse(JSON.stringify(base)); pRow.qty = qtyN;
          queue.push({ params: pRow, client: client, keyword: keyword, qty: qtyN, w: r.sizes[s].w, h: r.sizes[s].h });
          lines.push('#' + (s + 1) + ' ' + r.sizes[s].w + '×' + r.sizes[s].h + 'cm');
        }
        bumpRev();
        renderQueue();
        // ★ 1덩어리 경고 — 여러 디자인인데 하나로 뭉치는 전형적 원인이 "선택이 그룹 1개"다.
        //   이 경고가 없어서 전체(539×243.3cm·work.ai 110MB)가 조각 1건으로 등록된 적이 있다.
        if (r.added === 1) {
          out('⚠ 1개로만 인식됐습니다 — ' + lines[0] +
            '\n여러 디자인이라면: ①선택이 그룹 하나로 묶여 있는지 확인(Ctrl+Shift+G로 풀기)' +
            '\n②분리 간격을 음수로 낮춰 더 잘게 나누기 ③[◎ 자동감지]로 문서 전체 스캔' +
            '\n진짜 1개 디자인이면 그대로 [등록]하세요.', 'err');
          return;
        }
        out('분리됨: ' + r.added + '개 (분리간격 ' + gap + 'mm · 클립존중 · 50mm↓ 제외)\n' + lines.join(' · ') +
          '\n→ 행 클릭 = 일러에서 그 조각 선택 · 수량은 행에서 직접 수정 · [등록]으로 조각별 등록', 'okmsg');
      });
    }
    function imposeGapValue() {
      var g = elImposeGap ? parseFloat(elImposeGap.value) : 0;
      return isNaN(g) ? 0 : g;
    }
    if (elBtnImposeSplit) elBtnImposeSplit.addEventListener('click', function () { imposeSeed('mesA0_queueAddBatch', imposeGapValue()); });
    if (elBtnImposeDetect) elBtnImposeDetect.addEventListener('click', function () { imposeSeed('mesA0_autoDetect', imposeGapValue()); });
    if (elBtnImposeClear) elBtnImposeClear.addEventListener('click', function () {
      csi.evalScript('mesA0_queueClear()', function () {});
      queue = []; bound = -1; bumpRev(); renderQueue(); out('목록 비움');
    });
    if (elBtnImposeRegister) elBtnImposeRegister.addEventListener('click', function () {
      if (!queue.length || !queueAllImpose()) return;
      out('모아찍기 등록 중… ' + queue.length + '건');
      runBatchConfirm();
    });

    if (elBtnConfirm) elBtnConfirm.addEventListener('click', function () {
      if (!queue.length) return;
      // 모아찍기 전용 큐는 검토문서 게이트 면제(2026-07-29) — 검토문서는 마감·돔보·주석 배치를
      //   눈으로 보는 장치인데 모아찍기는 그 셋이 전부 없다(work.ai 원본 그대로 저장).
      //   단건이 하나라도 섞여 있으면 기존대로 검토를 요구한다.
      if (reviewedRev !== queueRev && !queueAllImpose()) {
        out('검토문서로 확인한 뒤 확정하세요 — [검토문서] 버튼', 'err'); updateGate(); return;
      }
      runBatchConfirm();
    });

    renderQueue();

    // 초기 실측 시도
    refreshMeasure();
  });
})();
