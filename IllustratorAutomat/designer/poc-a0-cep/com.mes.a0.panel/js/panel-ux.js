/**
 * 패널 공용 사용감 부품 (2026-09-27 용준님 ③⑤⑥⑦) — 가공·재단 탭이 **같은 규칙**으로
 *   ① 긴 결과를 요약하고 ② 오래 걸리는 작업의 경과 초를 세고 ③ 등록 뒤 대기함 수신을 확인한다.
 * ★두 탭에 사본을 두면 한쪽만 고쳐진다(형제 스윕 · A0 embedAllFonts 가 재단에 한 달 넘게 안 온 전례) → 이 파일 하나.
 *   게이트 = cut:smoke 9q (⚠ 줄을 접지 않는다 · 원문 보존 · 수신 확인은 읽기 전용).
 * ES5 — CEP 12(Chromium 99)면 더 써도 되지만 두 탭 파일이 ES5 라 맞춘다.
 */
(function (root) {
  'use strict';

  /**
   * 긴 결과 요약 — 6줄 이상이면 **첫 줄(+소요 초) + ⚠ 줄 전부**를 위에, 원문은 [자세히]로 접는다.
   *   ⚠ 줄 = 격하·실패·누락 알림이라 절대 접지 않는다(조용한 격하 금지). 원문은 한 글자도 안 버린다.
   * @param el    결과 상자(.out) · kind = 'err' | 'ok' | 'okmsg' | ''
   * @param state {open:boolean} — 펼침 여부를 탭마다 기억한다(호출부가 객체를 들고 있다)
   * @param keep  (선택) 이 정규식에 맞는 줄도 위에 남긴다 — 탭마다 「한눈에 봐야 하는 줄」이 다르다
   *              (가공 탭 = 실물 크기·EPS·DXF·산출물 용량: 0MB 로 깨진 산출물을 사람이 눈으로 잡은 전례)
   */
  function renderSummary(el, msg, kind, state, keep) {
    if (!el) return;
    msg = String(msg == null ? '' : msg);
    el.className = 'out' + (kind ? ' ' + kind : '');
    var lines = msg.split('\n');
    if (lines.length < 6) { el.textContent = msg; return; }
    var secs = '';
    for (var i = 0; i < lines.length; i++) { var m = /^소요 ([0-9.]+)초/.exec(lines[i]); if (m) { secs = m[1]; break; } }
    var warns = [];
    var kept = [];
    for (var j = 1; j < lines.length; j++) {
      if (/^\s*⚠/.test(lines[j])) warns.push(lines[j].replace(/^\s+/, ''));
      else if (keep && keep.test(lines[j])) kept.push(lines[j]);
    }
    el.textContent = '';
    var head = document.createElement('div');
    head.className = 'osum';
    var icon = kind === 'err' ? '⚠ ' : ((kind === 'ok' || kind === 'okmsg') ? '✅ ' : '');
    head.textContent = icon + lines[0] + (secs ? ' · ' + secs + '초' : '');
    el.appendChild(head);
    for (var q = 0; q < kept.length; q++) {
      var kd = document.createElement('div'); kd.className = 'okeep'; kd.textContent = kept[q]; el.appendChild(kd);
    }
    for (var k = 0; k < warns.length; k++) {
      var w = document.createElement('div'); w.className = 'owarn'; w.textContent = warns[k]; el.appendChild(w);
    }
    var det = document.createElement('details');
    det.className = 'odet';
    if ((state && state.open) || kind === 'err') det.open = true;   // 실패는 원인 줄이 곧 할 일이라 펼쳐 둔다
    var sm = document.createElement('summary'); sm.textContent = '자세히 (' + lines.length + '줄)';
    var pre = document.createElement('div'); pre.className = 'opre'; pre.textContent = msg;
    det.appendChild(sm); det.appendChild(pre);
    det.addEventListener('toggle', function () { if (state) state.open = det.open; });
    el.appendChild(det);
  }

  /**
   * 경과 초 — 일러가 한 호출에 묶여 있어도 패널(별도 프로세스)은 초를 센다. 「멈춤」과 「진행 중」을 가른다.
   * @returns {stop()} — 여러 번 불러도 안전하다
   */
  function ticker(el, label) {
    if (!el) return { stop: function () {} };
    var t0 = Date.now();
    function draw() { el.textContent = (label || '진행 중') + ' · ' + Math.round((Date.now() - t0) / 1000) + '초'; }
    el.className = 'nestprog';
    draw();
    var h = setInterval(draw, 1000);
    return { stop: function () { if (h) { clearInterval(h); h = null; } el.className = 'nestprog hidden'; el.textContent = ''; } };
  }

  /**
   * 등록 뒤 대기함 수신 확인 — 에이전트가 가져가면 등록 폴더에 `.ingested`, 거절하면 `.rejected*` 가 생긴다.
   *   2026-09-26 실기: 에이전트가 꺼져 등록 9건이 대기함에 안 들어갔는데 패널은 「보냈습니다」로 끝났다.
   *   호스트 `mesCut_ingestState`(읽기 전용 · 재단 호스트 0.59.0+)를 5초마다 3분까지 부른다.
   * @param o {hostCall(expr, cb(res,bad)), names:'a|b', lineEl, isBusy():bool, state:{timer}}
   *   이름이 형식(영숫자·_·-·|)이 아니면 조용히 안 한다 — evalScript 식에 그대로 들어가기 때문이다.
   */
  function watchIngest(o) {
    var st = o.state || {};
    if (st.timer) { clearInterval(st.timer); st.timer = null; }
    line(o.lineEl, '');
    if (!o.names || !/^[A-Za-z0-9_|\-]+$/.test(o.names)) return;
    var t0 = Date.now(), total = o.names.split('|').length;
    line(o.lineEl, '대기함 수신 확인 중… 0/' + total);
    st.timer = setInterval(function () {
      var sec = Math.round((Date.now() - t0) / 1000);
      if (o.isBusy && o.isBusy()) return;   // 다른 작업 중이면 이 회차는 건너뛴다(호스트 호출 경합 금지)
      o.hostCall('mesCut_ingestState("' + o.names + '")', function (r, bad) {
        if (!st.timer) return;
        if (bad || String(r).indexOf('ok;') !== 0) {
          if (sec >= 180) { stop(); line(o.lineEl, '⚠ 수신 확인을 못 했습니다(호스트 응답 없음) — 주문서 대기함에서 직접 확인하세요', 'err'); }
          return;                             // 한 번 못 읽어도 다음 회차에 다시 본다
        }
        var k = kv(String(r).substring(3)), n = parseInt(k.n, 10) || total;
        var ing = parseInt(k.ing, 10) || 0, rej = parseInt(k.rej, 10) || 0;
        if (rej > 0) { stop(); line(o.lineEl, '⚠ 에이전트가 ' + rej + '건을 거절했습니다 — 등록 폴더의 .rejected 파일을 확인하세요(수신 ' + ing + '/' + n + ')', 'err'); }
        else if (ing >= n) { stop(); line(o.lineEl, '✅ 대기함 수신 완료 ' + ing + '/' + n + ' — 주문서 [가공 대기함]에서 불러오세요', 'ok'); }
        else if (sec >= 180) { stop(); line(o.lineEl, '⚠ 3분이 지나도 대기함에 안 들어갔습니다(수신 ' + ing + '/' + n + ') — 에이전트(IllustratorAutomat)가 켜져 있는지 확인하세요', 'err'); }
        else line(o.lineEl, '대기함 수신 확인 중… ' + ing + '/' + n + ' (' + sec + '초)');
      });
    }, 5000);
    function stop() { if (st.timer) { clearInterval(st.timer); st.timer = null; } }
  }

  function line(el, txt, kind) {
    if (!el) return;
    el.textContent = txt;
    el.className = 'regwatch' + (kind ? ' ' + kind : '') + (txt ? '' : ' hidden');
  }
  function kv(s) {
    var o = {}, parts = String(s).split(';');
    for (var i = 0; i < parts.length; i++) { var p = parts[i].split('='); if (p.length === 2) o[p[0]] = p[1]; }
    return o;
  }

  var api = { renderSummary: renderSummary, ticker: ticker, watchIngest: watchIngest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // Node 하네스
  root.MesPanelUx = api;
})(typeof window !== 'undefined' ? window : globalThis);
