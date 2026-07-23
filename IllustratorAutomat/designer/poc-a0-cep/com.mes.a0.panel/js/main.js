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

  var methods = [];   // [{name, margin_cm}]
  var presets = [];   // [{name, config(obj)}]

  function $(id) { return document.getElementById(id); }
  function warnMissing(id) { console.warn('[mes-a0-cep] #' + id + ' not found'); }
  function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  // 주석 조합: 거래처-키워드-식별번호-수량ea (키워드 있을 때만). 식별번호=큐 배치 seqNo
  function composeAnnot(client, keyword, seqNo, qty) {
    if (!keyword) return '';
    var s = '';
    if (client) s += client + '-';
    s += keyword;
    if (seqNo != null && seqNo !== '') s += '-' + seqNo;
    s += '-' + qty + 'ea';
    return s;
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

    var elWorker = $('worker'), elSaved = $('saved'), elVer = $('ver');
    var elMeas = $('meas'), elBtnMeasure = $('btnMeasure');
    var elQty = $('qty'), elScale = $('scale'), elPreset = $('preset');
    var elTrim = $('trim'), elClient = $('client');
    var elPTop = $('pTop'), elPBottom = $('pBottom'), elPLeft = $('pLeft'), elPRight = $('pRight');
    var elPcTL = $('pcTL'), elPcTR = $('pcTR'), elPcBL = $('pcBL'), elPcBR = $('pcBR');
    var elAnnot = $('annot');
    var elATop = $('aTop'), elABottom = $('aBottom'), elALeft = $('aLeft'), elARight = $('aRight');
    var elBtnProcess = $('btnProcess'), elOut = $('out'), elCfg = $('cfgStatus');
    if (!elWorker) { warnMissing('worker'); return; }

    var finM = document.getElementsByClassName('finM'); // method selects
    var finCm = document.getElementsByClassName('finCm');

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
    function showSaved() { if (elSaved) elSaved.textContent = '신원: ' + (elWorker.value || '(없음)'); }
    showSaved();
    elWorker.addEventListener('change', function () {
      try { window.localStorage.setItem(STORE_WORKER, elWorker.value); } catch (e) {}
      showSaved();
    });

    // ── 마감 method 셀렉트 채우기 ──
    function fillMethodSelects() {
      for (var s = 0; s < finM.length; s++) {
        var sel = finM[s];
        sel.innerHTML = '';
        var none = document.createElement('option'); none.value = ''; none.textContent = '없음'; sel.appendChild(none);
        for (var m = 0; m < methods.length; m++) {
          var op = document.createElement('option'); op.value = methods[m].name; op.textContent = methods[m].name; sel.appendChild(op);
        }
        // method 선택 시 cm 자동채움(비어있을 때만)
        sel.onchange = (function (side) {
          return function () {
            var cmEl = cmInput(side);
            var mv = this.value;
            if (mv && cmEl && cmEl.value === '') cmEl.value = String(marginOf(mv));
            if (!mv && cmEl) cmEl.value = '';
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

    // ── 프리셋 채우기 + 적용 ──
    function fillPresets() {
      if (!elPreset) return;
      elPreset.innerHTML = '';
      var d = document.createElement('option'); d.value = ''; d.textContent = '(직접 지정)'; elPreset.appendChild(d);
      for (var p = 0; p < presets.length; p++) {
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
          var sel = methodSelect(side), cmEl = cmInput(side);
          if (sel) sel.value = mName;
          if (cmEl) cmEl.value = mName ? String(marginOf(mName)) : '';
        }
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
          presets.push({ name: rawPresets[i].name, config: cfg });
        }
        ok = true;
      } catch (e) { console.warn('[mes-a0-cep] config parse fail', e); }
      fillMethodSelects();
      fillPresets();
      setCfg(ok ? ('config ✓ 마감 ' + methods.length + '종 · 프리셋 ' + presets.length) : 'config 파싱 실패 — 마감 수동 입력');
      restoreSettings();
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
      csi.evalScript('mesA0_measure()', function (res) {
        var r = null; try { r = JSON.parse(res); } catch (e) {}
        if (r && r.ok) {
          var n = parseInt(elScale ? elScale.value : '1', 10) || 1;
          var txt = r.w + ' × ' + r.h + ' cm' + (r.n > 1 ? (' · ' + r.n + '개') : '');
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

    // ── 설정 영속(직전값 기억) ──
    function gatherSettings() {
      var fin = {};
      for (var s = 0; s < SIDES.length; s++) {
        var sel = methodSelect(SIDES[s]), cmEl = cmInput(SIDES[s]);
        fin[SIDES[s]] = { m: sel ? sel.value : '', cm: cmEl ? cmEl.value : '' };
      }
      return { qty: elQty ? elQty.value : '1', scale: elScale ? elScale.value : '1',
        mode: modeValue(), trim: elTrim ? !!elTrim.checked : false, client: elClient ? elClient.value : '',
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
          var sel = methodSelect(SIDES[s]), cmEl = cmInput(SIDES[s]);
          if (sel && f.m) sel.value = f.m;
          if (cmEl && f.cm != null) cmEl.value = f.cm;
        }
      }
    }
    function modeValue() {
      var rs = document.getElementsByName('mode');
      for (var i = 0; i < rs.length; i++) if (rs[i].checked) return rs[i].value;
      return 'single';
    }
    function setMode(v) {
      var rs = document.getElementsByName('mode');
      for (var i = 0; i < rs.length; i++) rs[i].checked = (rs[i].value === v);
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
      }
      var pInt = function (el) { var n = parseInt(el ? el.value : '0', 10); return (isNaN(n) || n < 0) ? 0 : n; };
      var keyword = elAnnot ? (elAnnot.value || '').replace(/^\s+|\s+$/g, '') : '';
      return {
        worker_name: elWorker.value || null,
        registered_by_id: null,   // MES user id 매핑은 B단계(§3.5 구현선행) — 현재 null
        client_name: elClient ? (elClient.value || '') : '',
        client_id: null,
        qty: qty, scale_n: scaleN, mode: modeValue(),
        trim: elTrim ? !!elTrim.checked : false,
        punch: {
          top: pInt(elPTop), bottom: pInt(elPBottom), left: pInt(elPLeft), right: pInt(elPRight),
          corners: { tl: elPcTL ? !!elPcTL.checked : false, tr: elPcTR ? !!elPcTR.checked : false, bl: elPcBL ? !!elPcBL.checked : false, br: elPcBR ? !!elPcBR.checked : false }
        },
        keyword: keyword, // 주석·파일명. 식별번호(seq_no)는 단건 null, 배치는 키워드별 순번
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

    // ── 반자동 큐 (A2) ──
    var queue = []; // [{params, client, keyword, qty, w, h}]
    var elQueueBox = $('queueBox'), elBtnQAdd = $('btnQueueAdd'), elBtnQBatch = $('btnQueueBatch'), elBtnConfirm = $('btnConfirm'), elBtnQClear = $('btnQueueClear');

    function renderQueue() {
      if (elQueueBox) {
        if (!queue.length) {
          elQueueBox.innerHTML = '<div class="qempty">큐 비어있음 — 디자인 선택 후 [＋ 큐에 추가]</div>';
        } else {
          var html = '';
          for (var i = 0; i < queue.length; i++) {
            var e = queue[i];
            var lbl = (e.client || '(파일명)') + (e.keyword ? (' · ' + e.keyword) : '') + ' · ' + e.w + '×' + e.h + 'cm ×' + e.qty;
            html += '<div class="qrow"><span class="qn">#' + (i + 1) + '</span><span class="qlbl">' + escHtml(lbl) + '</span><button class="qdel" data-i="' + i + '">✕</button></div>';
          }
          elQueueBox.innerHTML = html;
          var dels = elQueueBox.getElementsByClassName('qdel');
          for (var d = 0; d < dels.length; d++) dels[d].addEventListener('click', function () { queueRemove(parseInt(this.getAttribute('data-i'), 10)); });
        }
      }
      if (elBtnConfirm) { elBtnConfirm.textContent = '일괄 확정 (' + queue.length + ')'; elBtnConfirm.disabled = queue.length === 0; }
    }

    function queueRemove(i) {
      if (i < 0 || i >= queue.length) return;
      csi.evalScript('mesA0_queueRemove(' + i + ')', function () {});
      queue.splice(i, 1);
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
        renderQueue();
        out('큐 추가됨: #' + queue.length + ' (' + r.w + '×' + r.h + 'cm)', 'okmsg');
      });
    });

    if (elBtnQBatch) elBtnQBatch.addEventListener('click', function () {
      csi.evalScript('mesA0_queueAddBatch(0)', function (res) { // gap 0 = 겹침만(ExtractGroups)
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
        renderQueue();
        out('묶음 분리: ' + r.added + '개로 나눔 (겹침만 병합·50mm↓ 제외). 틀리면 [✕] 삭제 후 개별 추가로 교정', 'okmsg');
      });
    });

    if (elBtnQClear) elBtnQClear.addEventListener('click', function () {
      csi.evalScript('mesA0_queueClear()', function () {});
      queue = []; renderQueue(); out('큐 비움');
    });

    if (elBtnConfirm) elBtnConfirm.addEventListener('click', function () {
      if (!queue.length) return;
      if (elBtnQAdd) elBtnQAdd.disabled = true;
      if (elBtnProcess) elBtnProcess.disabled = true;
      elBtnConfirm.disabled = true;
      function reenable() {
        if (elBtnQAdd) elBtnQAdd.disabled = false;
        if (elBtnProcess) elBtnProcess.disabled = false;
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
          queue = []; renderQueue(); reenable();
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
