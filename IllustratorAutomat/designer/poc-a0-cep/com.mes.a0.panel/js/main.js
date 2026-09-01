/**
 * MES A0 CEP panel — main.js (A1 usable: mes-core 처리 파이프라인 연결)
 * 한글: config는 cep.fs(UTF-8) 우선 + host 폴백, params는 cep.fs로 temp(ASCII경로)에 UTF-8 기록.
 * evalScript 인자/반환은 ASCII만 → 브릿지 한글 깨짐 회피.
 */
(function () {
  'use strict';

  // 껍데기(index.html · main.js · style.css) 버전 — 축3/축4 배포 여부를 사람이 눈으로 확인하는 유일한 수단.
  //   우상단 표시는 여태 host(mesA0_ping = MESA0_VERSION, 축2 = Z: 1곳)만 보여줬다. 껍데기는 PC 별
  //   복사 설치라서 재설치를 안 한 PC 도 최신 번호로 보였다(2026-07-30 점검에서 확인).
  //   ⚠️ 껍데기 3파일 중 하나라도 고치면 여기를 올린다.
  var SHELL_VERSION = '0.7.0';   // 0.7.0 = ★품목 자동완성(item_id) — 주문서가 품목·단가까지 자동으로 채운다 · 0.6.0 = ★자동감지 캡처 경로 수용(임시문서 없음 표기) + 마스크 픽셀 수를 실제 PNG 에 맞춤(라벨 밀림 방지) · 0.5.3 =「키워드」→「내용」 명칭 통일(MES 품목 마스터와 구분) · 0.5.2 = 재단 탭 [◎ 전체] · 0.5.1 = 도련 방식 칸을 판짜기로 이동(라벨 거짓 정정) · 0.5.0 = 셸 자동 갱신 결과 수신·재시작 안내 · 0.4.1 = 설명 다이어트(cfg 압축·툴팁 이동) + 세로나열 CSS
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
  var itemList = [];   // [{id, item_name, sub_category}] — 품목 자동완성(2026-09-01)
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
  // 품목은 **정확일치만** id 로 본다. 부분일치로 넘겨짚으면 단가까지 틀린 채 주문서에 실린다
  //   (거래처와 달리 품목은 free-text 폴백이 없다 — 못 고르면 그냥 안 보내고 사람이 주문서에서 고른다).
  function itemIdOf(name) {
    var t = (name || '').replace(/^\s+|\s+$/g, '');
    if (!t) return null;
    for (var i = 0; i < itemList.length; i++) if (itemList[i].item_name === t) return itemList[i].id;
    return null;
  }

  function $(id) { return document.getElementById(id); }
  function warnMissing(id) { console.warn('[mes-a0-cep] #' + id + ' not found'); }
  function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  // (2026-07-30 P3 제거) composeAnnot — **호출처 0**인데다 `키워드-식별번호-수량ea` 라는
  //   **낡은 주석 규칙**을 담고 있어 읽는 사람을 오도했다. 현행 주석 문구의 정본은 호스트
  //   `mes-a0-host.jsx` 의 mesA0_annotText(keyword, seqNo, postDesc, qty) 이고 구조는
  //   `키워드-식별번호-후가공-수량` 이다(후가공 세그먼트가 2026-07-30 에 추가됐다).
  //   패널이 만드는 것은 post_desc(파일명 세그먼트)까지이고 주석 조합은 호스트가 한다.

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
      tabs[t].addEventListener('click', function () {
        var target = this.getAttribute('data-tab');
        // ★사용자가 탭을 옮기면 행 연동을 끊는다(2026-07-30 점검). 연동이 탭을 넘어 살아 있으면
        //   다른 탭의 폼 상태가 그 행으로 흘러들어간다 — 재현 확인된 사고 2건:
        //     H1) 모아찍기 행 연동 → 단건 탭 → 입력 하나 → 그 행이 single 로 변질돼 [등록]이
        //         잠기고 "단건 용도 행이 섞여 있습니다"가 뜬다. 비우고 재분리 외엔 복구 불가.
        //     H2) 묶음 행 연동 → 모아찍기 탭(clearFinishing) → 입력 하나 → 그 행의 마감이 소실.
        //   ⚠️ activateTab() 안에 두면 안 된다 — toggleBind → applyRowToForm → setMode 가
        //      activateTab 을 부르므로 방금 맺은 연동이 즉시 끊긴다.
        if (target !== activeTab()) unbindRow();
        activateTab(target);
      });
    }
    // 연동 해제(행 선택만 풀고 폼 값은 건드리지 않는다 — 다음 담기에 그대로 쓰인다)
    function unbindRow() {
      if (bound < 0) return;
      bound = -1;
      if (queue) renderQueue(); // config 로드가 큐 초기화보다 먼저 도는 경로가 있다(:463 주석과 동일)
    }

    var elWorker = $('worker'), elSaved = $('saved'), elVer = $('ver');
    var elMeas = $('meas'), elBtnMeasure = $('btnMeasure');
    var elQty = $('qty'), elScale = $('scale'), elPreset = $('preset');
    var elTrim = $('trim'), elTrimInk = $('trimInk'), elClient = $('client'), elItem = $('item');
    var elBorderLine = $('borderLine'); // 출력 경계선(백색 테두리) on/off — 기본 OFF(2026-08-06 용준님)
    var elPTop = $('pTop'), elPBottom = $('pBottom'), elPLeft = $('pLeft'), elPRight = $('pRight');
    var elPcTL = $('pcTL'), elPcTR = $('pcTR'), elPcBL = $('pcBL'), elPcBR = $('pcBR');
    var elAnnot = $('annot'), elAnnotKwRow = $('annotKwRow'), elAnnotHint = $('annotHint');
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

    // ── 버전 = 로직(축2) + 화면(축3/축4) 두 축을 함께 보여준다 ──
    //   하나만 보여주면 "Z: 로직은 최신인데 껍데기는 구버전"인 PC 를 구분할 수 없다.
    csi.evalScript('mesA0_ping()', function (v) {
      if (elVer) elVer.textContent = '· ' + (v || '(host?)') + ' / 화면 ' + SHELL_VERSION;
      // ★셸 자동 갱신 결과 (2026-08-26) — 갱신 자체는 위 ping 이 이미 끝냈다(호스트 mesPanel_syncShell).
      //   여기서는 **결과만** 읽는다. 다시 부르면 두 번 도는 게 아니라 캐시된 값이 온다.
      //   갱신은 파일만 바꾸고 **이미 로드된 화면은 옛 파일이다** → 재시작을 반드시 알린다.
      //   (구 셸이 깔린 PC 는 이 코드가 없어 메시지가 안 뜬다. 그래도 갱신은 된다 — 다음 실행부터 뜬다)
      csi.evalScript('typeof mesPanel_syncStatus === "function" ? mesPanel_syncStatus() : "na"', function (sy) {
        var r = String(sy || '');
        if (r.indexOf('updated;') === 0) {
          out('패널이 갱신됐습니다 — 일러스트레이터를 다시 켜 주세요.\n지금 화면은 아직 옛 버전입니다 (' + r + ')', 'okmsg');
        } else if (r.indexOf('ERROR') === 0) {
          out('패널 자동 갱신 실패 — 관리자에게 알려 주세요.\n' + r, 'err');
        }
      });
    });

    // ── 가공자 명단 = config 정본(하드코딩 제거, 2026-07-30) ──
    //   1순위 = 도메인 매핑(designer_worker_domains)이 있는 사람. → '가공자 담당 도메인' 화면이
    //           곧 명단 관리 화면이 된다. 매핑 없는 테스트·레거시 DESIGNER 계정이 목록에 뜨는 것을
    //           구조적으로 막고, 사람이 바뀌어도 PC 재설치가 필요 없다.
    //   2순위(폴백) = config.workers 전량 + 경고. 매핑이 0건인 동안 패널이 죽지 않게.
    //   ⚠️ 이전 하드코딩 배열(ROSTER 4명)은 config.workers 와 정본이 둘이라, 이름이 어긋나면
    //      registered_by_id 가 null 이 되어 "내 작업" 필터에서 조용히 누락됐다.
    function fillWorkerSelect() {
      if (!elWorker) return;
      var prev = elWorker.value;
      var stored = null;
      try { stored = window.localStorage.getItem(STORE_WORKER); } catch (e) {}
      var mapped = [];
      for (var i = 0; i < workers.length; i++) if (workerDomains[workers[i].name]) mapped.push(workers[i]);
      var list = mapped.length ? mapped : workers;
      elWorker.innerHTML = '';
      if (!list.length) {
        var none = document.createElement('option');
        none.value = ''; none.textContent = '(config 없음)';
        elWorker.appendChild(none);
        return;
      }
      // ★첫 사용에는 **아무도 선택되지 않은 상태**로 둔다(2026-07-30 배포 전 점검).
      //   실측: prod 매핑이 0건이라 전량 폴백이고, 정렬상 맨 위가 테스트 계정 `123`(id 13) 이다.
      //   드롭다운의 첫 항목이 곧 기본값이므로, 가공자를 고르지 않고 등록하면 **남의(그것도 테스트
      //   계정) worker_id 로 기록**되어 "내 작업" 필터에서 사라진다. 빈 항목을 앞에 두고
      //   등록 시점에 선택을 요구한다(requireWorker) — 매핑을 나중에 채워도 이 안전망은 유지된다.
      var want = prev || stored || '';
      var hit = false;
      for (var m = 0; m < list.length; m++) if (list[m].name === want) { hit = true; break; }
      if (!hit) {
        var ph = document.createElement('option');
        ph.value = ''; ph.textContent = '(가공자 선택)';
        elWorker.appendChild(ph);
      }
      for (var k = 0; k < list.length; k++) {
        var o = document.createElement('option'); o.value = list[k].name; o.textContent = list[k].name;
        elWorker.appendChild(o);
      }
      // 직전 선택은 목록에 남아 있을 때만 복원한다 — 명단에서 빠진 사람이 선택돼 있으면
      //   조용히 다른 사람 이름으로 등록되는 것보다 빈 항목으로 두는 편이 안전하다.
      elWorker.value = hit ? want : '';
    }
    // 등록 직전 가공자 확인 — 비어 있으면 진행하지 않는다(worker_id null = "내 작업" 누락).
    function requireWorker() {
      if (elWorker && elWorker.value) return true;
      out('가공자를 먼저 고르세요 — 등록물이 "내 작업"에서 빠지지 않도록 필요합니다.', 'err');
      if (elWorker) { try { elWorker.focus(); } catch (e) {} }
      return false;
    }
    function showSaved() {
      if (!elSaved) return;
      var w = elWorker.value || '';
      if (!w) { elSaved.textContent = '신원: (없음)'; elSaved.className = 'saved'; return; }
      var dom = workerDomains[w];
      if (!dom) {
        // ★조용한 폴백이 사고다 — 매핑이 없으면 currentDomain() 이 'output' 으로 떨어져
        //   전사(봉제) 방식·프리셋이 드롭다운에서 통째로 사라지는데 화면엔 아무 표시가 없었다.
        //   실측(2026-07-30): config worker_domains 0건 = 전원이 현수막으로 고정된 상태였다.
        elSaved.textContent = '신원: ' + w + ' · ⚠도메인 미지정(현수막만 보임)';
        elSaved.className = 'saved warn';
        return;
      }
      elSaved.textContent = '신원: ' + w + ' · ' + (DOMAIN_LABEL[dom] || dom);
      elSaved.className = 'saved';
    }
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

    // ── 품목 자동완성(2026-09-01) — config.items 부분일치 제안, 정확일치 시 item_id 해소 ──
    //   거래처와 같은 UI 를 쓰되 폴백 정책이 다르다: 거래처는 미일치도 free-text 로 실어 보내지만
    //   품목은 **안 보낸다**. 이름만 맞춘 가짜 품목이 실리면 주문서가 그 단가로 계산한다.
    var elItemSug = $('itemSug'), elItemHit = $('itemHit');
    function updateItemHit() {
      if (!elItemHit) return;
      var v = elItem ? (elItem.value || '').replace(/^\s+|\s+$/g, '') : '';
      var id = itemIdOf(v);
      elItemHit.textContent = id ? '✓등록' : (v ? '미등록' : '');
      elItemHit.className = 'achit' + (id ? ' ok' : '');
    }
    function hideItemSug() { if (elItemSug) { elItemSug.className = 'sug hidden'; elItemSug.innerHTML = ''; } }
    function renderItemSug() {
      if (!elItemSug || !elItem) return;
      var q = (elItem.value || '').replace(/^\s+|\s+$/g, '');
      if (!q || !itemList.length) { hideItemSug(); return; }
      var qq = q.toLowerCase(), hits = [];
      for (var i = 0; i < itemList.length && hits.length < 15; i++) {
        var nm = itemList[i].item_name || '';
        if (nm.toLowerCase().indexOf(qq) !== -1) hits.push(nm);
      }
      if (!hits.length || (hits.length === 1 && hits[0] === q)) { hideItemSug(); return; }
      var html = '';
      for (var h = 0; h < hits.length; h++) html += '<div class="sgi" data-name="' + escHtml(hits[h]) + '">' + escHtml(hits[h]) + '</div>';
      elItemSug.innerHTML = html;
      elItemSug.className = 'sug';
      var sgis = elItemSug.getElementsByClassName('sgi');
      for (var k = 0; k < sgis.length; k++) sgis[k].addEventListener('mousedown', function (ev) {
        ev.preventDefault(); // blur 로 목록이 닫히기 전에 선택 확정
        if (elItem) {
          elItem.value = this.getAttribute('data-name');
          hideItemSug();
          updateItemHit();
          saveSettings();
        }
      });
    }
    if (elItem) {
      elItem.addEventListener('input', function () { renderItemSug(); updateItemHit(); });
      elItem.addEventListener('focus', function () { renderItemSug(); });
      elItem.addEventListener('blur', function () { window.setTimeout(hideItemSug, 150); updateItemHit(); });
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
          if (mkEl) mkEl.checked = !!pr.config[side + '_mark']; // 프리셋별 재단선 프리필(값의 종류가 아니라 유무)
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
        itemList = (data && data.items) ? data.items : [];          // 품목 자동완성(단가 자동 반영의 열쇠)
        ok = true;
      } catch (e) { console.warn('[mes-a0-cep] config parse fail', e); }
      fillWorkerSelect(); // 명단 = config 정본(매핑 우선 → 없으면 전량). showSaved 보다 먼저.
      fillMethodSelects();
      fillPresets();
      showSaved(); // 도메인 라벨·미지정 경고 반영
      setCfg(ok ? ('config ✓ 마감 ' + methods.length + '종 · 프리셋 ' + presets.length +
        (clientList.length ? (' · 거래처 ' + clientList.length) : '') +
        (workers.length ? (' · 가공자 ' + workers.length) : '')) : 'config 파싱 실패 — 마감 수동 입력');
      restoreSettings();
      updateClientHit();
      updateItemHit();
      updateAnnotGates();
      applyTabUi(); // 직전값에 mode가 없어도 게이트·버튼이 현재 탭과 맞도록 무조건 1회
    }
    (function loadConfig() {
      var text = cepReadUtf8(CONFIG_PATH);
      if (text) { applyConfig(text); return; }
      // 폴백: host(ExtendScript)로 한글경로 읽기
      csi.evalScript('mesA0_config()', function (res) {
        if (res && res.length) applyConfig(res);
        else {
          methods = []; presets = []; workers = [];
          fillWorkerSelect(); // 가공자 칸이 빈 채로 남지 않게 — '(config 없음)'을 명시한다
          fillMethodSelects(); fillPresets();
          setCfg('config 없음(Z: 미마운트?) — 가공자·마감 목록을 불러올 수 없습니다');
        }
      });
    })();

    // ── 실측 ──
    function refreshMeasure(cb) {
      // ★잠금 판정을 **여기 한 곳**에서 한다(2026-07-30 배포 전 점검).
      //   setHostBusy 는 버튼만 잠그는데 `#scale`·`#trimInk` 는 select/checkbox 라 잠기지 않아,
      //   **배치가 도는 중에 배율을 바꾸면 mesA0_measure 호출이 끼어들었다**. 호출자마다 가드를
      //   붙이면 새 호출자에서 또 새므로 진입점에서 막는다(호출자 4곳 + 앞으로 추가될 것들).
      if (hostBusy) return;
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
    // ★실측이 선택 변경을 따라가지 않던 문제(2026-07-30 P2) — 일러에서 다른 객체를 골라도 패널의
    //   숫자는 그대로여서 **화면값과 실행 기준이 달랐다**(결과는 맞다: 가공은 호스트가 다시 잰다.
    //   틀리는 것은 사람이 보고 판단하는 숫자다).
    //   3초 폴링은 안 쓴다 — 무거운 문서에서 호스트를 계속 찔러 COM wedge 전례를 되살릴 수 있다.
    //   대신 **패널이 포커스를 되찾을 때** 1회 갱신한다(일러에서 선택을 바꾸고 패널로 오는 실제 동선).
    //   진행 중(hostBusy)에는 호출하지 않는다 — params 파일·호스트 경쟁을 만들지 않기 위함.
    window.addEventListener('focus', function () {
      if (!hostBusy) refreshMeasure();
    });

    // ── 설정 영속(직전값 기억) ──
    // ⚠️ 후가공(마감·펀칭·주석위치)은 **영속 대상이 아니다**(2026-07-29).
    //   등록 1건이 끝날 때마다 초기화하는 정책([[clearFinishing]])인데 localStorage 로 되살리면
    //   패널을 다시 열 때 앞 건 설정이 그대로 상속돼 정책이 무의미해진다.
    //   계속 기억하는 것 = 수량·배율·용도·돔보·거래처·키워드(작업 연속성 축).
    function gatherSettings() {
      return { qty: elQty ? elQty.value : '1', scale: elScale ? elScale.value : '1',
        mode: modeValue(), trim: elTrim ? !!elTrim.checked : false, trimInk: elTrimInk ? !!elTrimInk.checked : false, client: elClient ? elClient.value : '',
        item: elItem ? elItem.value : '',
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
      if (elItem && st.item) elItem.value = st.item; // 가공자는 보통 같은 품목을 연달아 친다 — 직전값 유지
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
        var cmk = markSelect(cside); if (cmk) cmk.checked = false;
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
      if (elBorderLine) elBorderLine.checked = false; // 기본 OFF 로 복귀(켠 상태가 다음 건에 상속되지 않게)
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
      // 주석 키워드 칸: 묶음에선 행별 키워드가 정본이라 중복 → 숨긴다. 단건은 유일한 입력 경로라 유지.
      // ⚠️ class 'hidden' 을 쓰지 않는다 — `.row`(display:flex)와 `.hidden` 이 같은 명시도라
      //    stylesheet 순서에 따라 .row 가 이겨 안 숨는다(#finBody 때와 같은 함정, 스모크가 잡았다).
      if (elAnnotKwRow) elAnnotKwRow.style.display = (activeTab() === 'bundle') ? 'none' : '';
      // 상세(자동결합 구성)는 HTML title 툴팁에 있다 — 화면 문구는 짧게(2026-08-20 설명 다이어트)
      if (elAnnotHint) elAnnotHint.textContent = (activeTab() === 'bundle')
        ? '키워드는 각 행에서 입력 · 여백 3cm 이상인 변만'
        : '여백 3cm 이상인 변만 선택 가능';
      // config 로드(restoreSettings→setMode)가 큐 초기화보다 먼저 도는 경로가 있다 —
      //   그때 queue 는 아직 undefined 다. 여기서 막지 않으면 패널이 통째로 죽는다.
      //   이후 DOMContentLoaded 끝의 renderQueue() 가 게이트·버튼을 정리한다.
      if (!queue) return;
      updateGate();
      updateImposeBar();
      // 적용 버튼은 '어느 탭인가'에 따라 잠긴다(묶음 전용) → 탭이 바뀌면 반드시 다시 계산해야 한다.
      //   스모크가 이 누락을 잡았다: updateApplyBar 를 고쳐도 탭 전환 경로에서 호출되지 않아
      //   단건 탭에서 여전히 활성인 채였다.
      updateApplyBar();
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
        // 변별 재단선 on/off. ★전달 포맷은 'cut' 고정 — host 는 'fold'|'cut' 만 마크로 인정하고,
        //   옛 행·프리셋·manifest 에도 그 값이 들어 있다. 바뀐 것은 UI 뿐이다.
        var mkEl = markSelect(side);
        if (mkEl && mkEl.checked) finishing[side + '_mark'] = 'cut';
      }
      var pInt = function (el) { var n = parseInt(el ? el.value : '0', 10); return (isNaN(n) || n < 0) ? 0 : n; };
      // ⚠️ 여기서는 가시성을 따지지 않고 칸 값을 그대로 읽는다 — gatherParams 는 단건 전송에도 쓰이고,
      //    숨김 판정을 넣으면 묶음 탭에서 syncBoundRow 가 **연동 행의 키워드를 ''로 지운다**.
      //    '숨은 칸이 행에 쓰지 못하게' 하는 것은 행 반영 지점(syncBoundRow·applyFormToRows)의 책임이다.
      var keyword = elAnnot ? (elAnnot.value || '').replace(/^\s+|\s+$/g, '') : '';
      var punchObj = {
        top: pInt(elPTop), bottom: pInt(elPBottom), left: pInt(elPLeft), right: pInt(elPRight),
        corners: { tl: elPcTL ? !!elPcTL.checked : false, tr: elPcTR ? !!elPcTR.checked : false, bl: elPcBL ? !!elPcBL.checked : false, br: elPcBR ? !!elPcBR.checked : false }
      };
      var annotPos = {
        top: elATop ? !!elATop.checked : false, bottom: elABottom ? !!elABottom.checked : false,
        left: elALeft ? !!elALeft.checked : false, right: elARight ? !!elARight.checked : false
      };
      var ret = {
        worker_name: elWorker.value || null,
        registered_by_id: workerIdOf(elWorker.value), // config.workers 매핑 → manifest worker_id("내 작업" 상관)
        client_name: elClient ? (elClient.value || '') : '',
        client_id: clientIdOf(elClient ? elClient.value : ''), // 정확일치 시 해소, 미일치=null(free-text)
        item_id: itemIdOf(elItem ? elItem.value : ''),         // 정확일치만 — 대기함→주문서가 단가까지 채운다
        qty: qty, scale_n: scaleN, mode: modeValue(),
        trim: elTrim ? !!elTrim.checked : false,
        // 출력 경계선(백색 테두리). host 는 `!== false` 로 읽으므로 구 패널(키 없음)은 기존대로 ON.
        border_line: elBorderLine ? !!elBorderLine.checked : false,
        trim_ink: elTrimInk ? !!elTrimInk.checked : false, // 보이는 잉크로 축소(클립∩콘텐츠)
        punch: punchObj,
        keyword: keyword, // 주석·파일명. 식별번호(seq_no)는 단건 null, 배치는 키워드별 순번
        post_desc: finishDesc(finishing, punchObj), // 후가공 파일명 세그먼트(예: 양옆접어미싱+사방펀칭)
        annot_pos: annotPos,
        finishing: finishing, order_item_id: null
      };
      // 모아찍기는 후가공이 없다(host.jsx `mode !== 'impose'` 게이트). UI 초기화(clearFinishing)와
      // **별개로 전송 단계에서도 잘라낸다** — 화면 경로가 하나라도 새면 manifest 에 그대로 실린다.
      if (ret.mode === 'impose') stripFinishing(ret);
      return ret;
    }
    // 후가공 제거 = 한 규칙(2026-07-30). 전엔 gatherParams 안에만 있어서, 행에 적용하는 경로들이
    //   각자 판단해야 했다. 규칙이 둘이면 갈린다(services/messageBulkLimit 선례와 같은 정리).
    function stripFinishing(p) {
      p.finishing = {};
      p.punch = { top: 0, bottom: 0, left: 0, right: 0, corners: { tl: false, tr: false, bl: false, br: false } };
      p.annot_pos = { top: false, bottom: false, left: false, right: false };
      p.post_desc = ''; // 파일명 세그먼트도 빈 finishing 기준으로 되돌린다
      return p;
    }
    // ★행의 용도(mode)는 '담을 때' 확정된 값이 정본이다 — 폼(=현재 탭)이 행의 용도를 바꿔선 안 된다.
    //   modeValue() 가 활성 탭에서 파생되므로(:407) 이 고정이 없으면 탭을 옮긴 뒤의 어떤 반영도
    //   행 용도를 뒤집는다. 연동 해제(탭 클릭)와 **둘 다** 있어야 경로가 닫힌다.
    function keepRowMode(p, e) {
      var rowMode = (e && e.params && e.params.mode) ? e.params.mode : null;
      if (!rowMode) return p;
      p.mode = rowMode;
      if (rowMode === 'impose') stripFinishing(p);
      return p;
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
      if (hostBusy) return; // 배치·검토가 도는 중이면 진입 금지(params 파일 1개를 공유한다)
      if (!requireWorker()) return;
      var params = gatherParams();
      saveSettings();
      out('가공 중… (저장 프리즈 중 잠시 대기)');
      setHostBusy(true, '단건 가공');
      csi.evalScript('mesA0_paramsPath()', function (pp) {
        if (!pp) { out('호스트 연결 실패(패널을 일러 안에서 열었는지 확인)', 'err'); setHostBusy(false); return; }
        var wrote = cepWriteUtf8(pp, JSON.stringify(params));
        if (!wrote) { out('params 파일 쓰기 실패(' + pp + ')', 'err'); setHostBusy(false); return; }
        csi.evalScript('mesA0_process()', function (res) {
          setHostBusy(false);
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
    var elQueueBox = $('queueBox'), elBtnQAdd = $('btnQueueAdd'), elBtnQBatch = $('btnQueueBatch'), elBtnConfirm = $('btnConfirm'), elBtnQClear = $('btnQueueClear'), elBtnApplyAll = $('btnApplyAll'), elBtnApplySel = $('btnApplySel');
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
    // 새 행에 채울 키워드 — **화면에 보이는 칸의 값만** 시드로 쓴다(2026-07-30 P2).
    //   ★사고: 묶음·모아찍기 탭에선 주석 키워드 칸이 숨겨져 있는데(applyTabUi), 시드 로직이 그 값을
    //     계속 읽었다. localStorage 로 복원되기까지 해서 **지난번에 단건 탭에서 넣은 키워드가
    //     새로 담는 행에 조용히 들어갔다**(재현 확인). 사용자는 칸이 안 보이니 이유를 알 수 없다.
    //   → 가시성으로 판정한다(offsetParent). 탭 구조가 또 바뀌어도 자동으로 맞는다.
    //     묶음에선 **행별 키워드가 정본**이므로 빈 값으로 시드하는 것이 사용자 지시와도 일치한다.
    function annotVisible() {
      return !!(elAnnot && elAnnot.offsetParent !== null);
    }
    function seedKeyword() {
      if (!annotVisible()) return '';
      return (elAnnot.value || '').replace(/^\s+|\s+$/g, '');
    }
    var elBtnReview = $('btnReview'), elBtnAutoDetect = $('btnAutoDetect');

    // 확정 게이트(D4): 검토문서를 만든 큐 상태(rev)에서만 확정 허용. 큐가 바뀌면 재검토 요구.
    var queueRev = 0;      // 큐 내용 변경마다 증가(행 추가·삭제·세팅·키워드)
    var reviewedRev = -1;  // 마지막 검토문서 생성 시점의 rev
    var reviewBusy = false;

    // ── 호스트 작업 잠금 = 단일 개념(2026-07-30 P2) ─────────────────────────
    //   ★사고의 뿌리: 잠금이 버튼별 임시 disable 이라 **새 진입점이 계속 새어 나갔다**.
    //     재현 확인 — 배치 진행 중 [＋묶음분리]·[비우기]·[◎자동감지]·[선택분 분리]가 안 잠기고,
    //     단건 가공 중 [일괄 확정]·[검토문서]가 눌렸다. 진행 중 [비우기]는 큐를 비워 루프를 끊고,
    //     두 파이프라인은 `mesA0_paramsPath()` **파일 1개를 공유**하므로 설정이 섞일 수 있다.
    //   → 호스트를 건드리는 모든 버튼을 한 곳에 모아 busy 하나로 잠근다. 새 버튼을 추가할 때
    //     이 배열에 넣기만 하면 되므로 다음 사람이 같은 사고를 반복하지 않는다.
    var hostBusy = false;
    var cancelRequested = false;
    var BUSY_BTN_IDS = [
      'btnProcess',                                    // 단건 가공
      'btnReview', 'btnConfirm', 'btnQueueClear',      // 묶음: 검토·확정·비우기
      'btnQueueAdd', 'btnQueueBatch', 'btnAutoDetect', // 묶음: 담기·분리·자동감지
      'btnImposeSplit', 'btnImposeDetect',             // 모아찍기: 분리·자동감지
      'btnImposeRegister', 'btnImposeClear',           // 모아찍기: 등록·비우기
      'btnMeasure'                                     // 실측(호스트 호출)
    ];
    var elBtnCancel = $('btnCancel');
    // 잠금 라벨 = 다른 패널 사용자가 "지금 A0 가 뭘 하는 중인지" 읽는 문자열. ASCII 고정.
    var LOCK_LABELS = { '단건 가공': 'single', '검토문서': 'review', '분리': 'split', '진행 중': 'batch' };
    function lockLabel(label) {
      var s = LOCK_LABELS[label];
      if (s) return s;
      s = String(label || 'work').replace(/[^\x20-\x7e]/g, '').replace(/^\s+|\s+$/g, '');
      return s || 'work';
    }
    function setHostBusy(on, label) {
      hostBusy = !!on;
      if (!on) cancelRequested = false;
      for (var i = 0; i < BUSY_BTN_IDS.length; i++) {
        var el = $(BUSY_BTN_IDS[i]);
        if (el) el.disabled = !!on;
      }
      // 취소는 진행 중에만 쓸 수 있다(호스트 호출 사이에서 멈춘다 — 실행 중인 JSX 는 중단 불가)
      if (elBtnCancel) {
        elBtnCancel.style.display = on ? '' : 'none';
        elBtnCancel.disabled = false; // 취소는 진행 중에도 항상 눌려야 한다(잠금 탈출구를 겸한다)
        elBtnCancel.textContent = '취소' + (label ? (' (' + label + ')') : '');
      }
      // 끝난 뒤에는 각 버튼의 고유 게이트(큐 비었는지·용도 섞였는지)를 다시 적용해야 한다
      if (!on && queue) { updateGate(); updateImposeBar(); updateApplyBar(); }

      // ── 크로스 패널 잠금 (2026-07-31 신설) ──
      // 이 잠금은 **패널 밖**을 향한다. 위의 disabled 처리는 이 패널 버튼만 막을 뿐,
      // 재단 패널(com.mes.cut.panel)이 같은 일러를 동시에 때리는 것은 못 막는다.
      // 그래서 작업 시작·종료를 파일(%TEMP%\mes_host_lock.txt)로 알린다 — 정본 = mes-lock.jsx.
      //   ⚠️ 전역($.global)으로는 불가능하다. CEP 는 확장마다 ExtendScript 엔진이 따로다(실측).
      //   ⚠️ 잠금 실패로 A0 를 멈추지 않는다 — 잠금은 부가 기능이고, Z: 미연결로 A0 가 서면 그게 더 큰 사고다.
      //
      //   ★지금은 **publish 만** 한다(작업 중임을 알리기). 재단 패널이 이것을 보고 물러난다.
      //     반대 방향(A0 가 재단 잠금을 보고 경고/차단)은 **P1 에서 UI 와 함께** 붙인다:
      //     여기서 out() 으로 경고를 띄워 봐야 곧이어 도착하는 작업 결과 메시지가 덮어써서 사용자가 못 본다.
      //     경고를 제대로 보여주려면 전용 표시 자리가 필요하고, 그건 재단 패널이 실제로 일러를 조작하기
      //     시작하는 P1 의 일이다(현재 재단 패널은 골격이라 일러를 건드리지 않는다).
      try {
        if (on) {
          // evalScript 인자는 ASCII 만 안전하다(브릿지 한글 깨짐). label 은 한글이므로 코드로 바꾼다 —
          // 그냥 non-ASCII 를 지우면 '단건 가공' 이 공백만 남아 "누가 뭘 하는 중인지" 를 잃는다.
          csi.evalScript('mesA0_lockAcquire("' + lockLabel(label) + '")', function (r) {
            if (r && String(r).indexOf('busy:') === 0) console.warn('[mes-a0] host lock busy: ' + r);
          });
        } else {
          csi.evalScript('mesA0_lockRelease()', function () {});
        }
      } catch (eLock) { /* 잠금은 부가 기능 — 실패해도 A0 진행을 막지 않는다 */ }
    }

    // ══════════════════════════════════════════════════════════════
    // 실루엣 시드 (2026-07-31, shell 0.1.12) — 묶음분리·자동감지의 **정본**
    //   호스트(mesA0_seedBegin)가 구운 PNG 1장을 받아 **잉크 연결성분**으로 디자인을 나눈다.
    //   옛 사각 겹침(mesA0_cluster)은 도형을 몰라 비스듬히 놓인 디자인을 거짓 병합했다 → 완전 대체.
    //   계산이 여기(JS)에 있는 이유 = 헤드리스로 검증 가능하기 때문이다(재단 패널과 같은 구조).
    //   geometry.js 는 재단 패널과 **바이트 동일한 사본** — audit:ia-jsx 가 일치를 강제한다.
    // ══════════════════════════════════════════════════════════════
    var SEED_ERR = {
      nodoc: '열린 문서 없음', nosel: '객체를 선택하세요', noitems: '감지할 개체 없음(잠금·숨김 제외)',
      nobounds: '크기 측정 불가', allnoise: '전부 50mm 미만(노이즈)', scan: '문서 스캔 실패',
      noseed: '분리 후보가 사라졌습니다 — 다시 실행하세요',
    };

    /** PNG 파일 → {W,H,ch:4,data}. cep.fs Base64 경유 — file:// 직접 로드는 canvas taint 위험. */
    function seedReadPng(path, cb) {
      var b64 = null;
      try {
        var enc = (window.cep && window.cep.encoding && window.cep.encoding.Base64) ? window.cep.encoding.Base64 : 'Base64';
        var rf = window.cep.fs.readFile(path, enc);
        if (rf && rf.err === 0) b64 = rf.data;
      } catch (e) { /* 아래 file:// 폴백 */ }
      var img = new Image();
      img.onload = function () {
        var cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        cv.getContext('2d').drawImage(img, 0, 0);
        // ★try 는 getImageData **만** 감싼다 — cb 까지 넣으면 콜백 안의 예외가
        //   "canvas 읽기 실패(보안)" 으로 둔갑해 엉뚱한 곳을 가리킨다(재단 쪽 실제 사례).
        var d = null;
        try {
          d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
        } catch (eTaint) { cb('canvas 읽기 실패(보안): ' + eTaint, null); return; }
        cb(null, { W: cv.width, H: cv.height, ch: 4, data: d.data });
      };
      img.onerror = function () { cb('PNG 로드 실패: ' + path, null); };
      img.src = b64 ? ('data:image/png;base64,' + b64) : ('file:///' + String(path).replace(/\\/g, '/'));
    }

    /** 아이템 bbox 안에서 잉크가 가장 많은 성분 id(최다중첩 배정). 잉크 0이면 -1. */
    function seedArgmaxLabel(lab, r, bb) {
      // bb=[L,T,R,B] mm(원본 문서 좌표·y-up) · 마스크는 (ox,oy) 좌상단 기준 y-down
      var x0 = Math.floor((bb[0] - r.ox) / r.mmpp), x1 = Math.ceil((bb[2] - r.ox) / r.mmpp);
      var y0 = Math.floor((r.oy - bb[1]) / r.mmpp), y1 = Math.ceil((r.oy - bb[3]) / r.mmpp);
      if (x0 < 0) x0 = 0;
      if (y0 < 0) y0 = 0;
      if (x1 > r.w) x1 = r.w;
      if (y1 > r.h) y1 = r.h;
      var cnt = {}, bestId = -1, bestN = 0;
      for (var y = y0; y < y1; y++) {
        var row = y * r.w;
        for (var x = x0; x < x1; x++) {
          var L = lab[row + x];
          if (L < 0) continue;
          var n = (cnt[L] || 0) + 1;
          cnt[L] = n;
          if (n > bestN) { bestN = n; bestId = L; }
        }
      }
      return bestId;
    }

    /** 마스크 → 성분 → 아이템 배정. 순수 계산부(부작용 없음) — 스모크가 이 경로를 그대로 탄다. */
    function seedSplit(G, r, img, gap) {
      // ★ 'alpha' 이지 'white' 가 아니다 (2026-07-31 용준님 지적).
      //   재단 패널은 'white'(흰 픽셀=배경) 를 쓴다 — 흰 바탕 위 그림의 **외곽을 따는** 용도라 맞다.
      //   여기는 "디자인이 어디에 있나" 를 보는 것이므로 **흰색도 그림**이다. 'white' 로 두면
      //   흰 글씨·흰 바탕 배너가 배경으로 사라져, 한 디자인이 여러 덩어리로 쪼개지고
      //   흰 요소로만 된 개체는 잉크 0(noink)이 되어 제 디자인과 못 합쳐진다.
      //   임시문서는 배경이 투명(transparency=true)이라 alpha>0 = 아트가 있다 = 정확한 판정.
      //   ⚠️ 대신 **전면을 덮는 배경 판**(흰 판 등)이 선택에 섞이면 전부 그것을 통해 이어져
      //      1건으로 뭉친다 — 조용히 틀리지 않도록 아래에서 경고한다.
      //   ★임계 = **50% 피복**(2026-08-01, 재단 패널에서 이식 · spec §6.23).
      //     기본 임계(alpha≥16 = 6% 피복)는 안티에일리어싱 **테두리 한 겹까지 잉크로 센다**.
      //     분리에서는 그게 곧 **가짜 다리**다 — 1mm/px 에서 사방 1px 이면 두 디자인 사이에
      //     최대 2mm 의 없는 잉크가 생겨 **실제보다 쉽게 한 덩어리로 붙는다**.
      //   ⚠️ 임계를 올리면 **반투명 아트가 통째로 사라질** 수 있다(흰 불투명 요소는 alpha 255 라 안전).
      //     성분 수가 줄면 반투명이 있다는 뜻이므로 **낮은 임계로 되돌리고 알린다** — 조용히 잃는 게 최악.
      var mHi = G.inkMask(img, 'alpha', 128);
      var mLo = G.inkMask(img, 'alpha', 16);
      var minPx = Math.max(16, Math.round(r.w * r.h * 0.0005));
      var bigOf = function (mm) {
        var c = G.components(mm, r.w, r.h, 1), n = 0;
        for (var z = 0; z < c.sizes.length; z++) if (c.sizes[z] >= minPx) n++;
        return n;
      };
      var m = mHi, softened = false;
      if (bigOf(mHi) < bigOf(mLo)) { m = mLo; softened = true; }
      var rpx = Math.round(Math.abs(gap) / 2 / r.mmpp);
      // gap 의미는 옛 방식 그대로: 양수=이 거리 이내면 한 디자인(팽창) · 0=닿을 때만 · 음수=더 잘게(침식)
      if (rpx > 0) m = (gap > 0) ? G.offsetMask(m, r.w, r.h, rpx) : G.insetMask(m, r.w, r.h, rpx);
      var cc = G.components(m, r.w, r.h, 1);
      var byLab = {}, order = [], noink = 0;
      for (var i = 0; i < r.bounds.length; i++) {
        var lab = r.bounds[i] ? seedArgmaxLabel(cc.lab, r, r.bounds[i]) : -1;
        // 잉크 0 = 배정 불가. 조용히 버리면 조각이 통째로 누락되므로 **단독 행**으로 남긴다.
        var key = (lab < 0) ? ('x' + i) : ('c' + lab);
        if (lab < 0) noink++;
        if (!byLab[key]) { byLab[key] = []; order.push(key); }
        byLab[key].push(i);
      }
      var parts = [];
      for (var o = 0; o < order.length; o++) parts.push(byLab[order[o]].join(','));
      var note = '';
      if (softened) note += '※ 반투명 요소가 있어 잉크 기준을 느슨하게 잡았습니다 — 디자인이 실제보다 쉽게 붙을 수 있습니다.\n';
      if (r.mmpp > 1) note += '⚠ 분리 해상도 ' + r.mmpp + 'mm/px — 이보다 가깝게 붙은 디자인은 한 덩어리가 됩니다.\n';
      if (noink) note += '⚠ 잉크를 못 찾은 조각 ' + noink + '건은 단독 행으로 넣었습니다.\n';
      if (r.dup !== r.n) note += '⚠ 마스크 복제 ' + r.dup + '/' + r.n + ' — 일부 조각이 빠졌습니다.\n';
      return { spec: parts.join(';'), note: note, comps: cc.sizes.length, noink: noink };
    }

    /** source='sel'|'auto'. done(errMsg) 또는 done(null, r, note) — r = {added,total,sizes}. */
    function seedSilhouette(source, gap, done) {
      var G = window.MesCutGeom;
      if (!G) { done('geometry.js 미로드 — 이 PC 에 패널을 다시 설치하세요(install-a0-panel.ps1)'); return; }
      if (hostBusy) return;
      setHostBusy(true, '분리');
      var src = (source === 'auto') ? 'auto' : 'sel';
      csi.evalScript('mesA0_seedBegin("' + src + '",' + gap + ')', function (res) {
        var r = null; try { r = JSON.parse(res); } catch (e) {}
        if (!r || !r.ok) {
          setHostBusy(false);
          done('분리 실패: ' + (r ? (SEED_ERR[r.err] || r.err) : '호스트 연결 안 됨'));
          return;
        }
        if (r.mode !== 'mask') {
          // 굽기 실패 → 호스트가 옛 사각 방식으로 **이미 큐를 채웠다**. 조용히 넘어가면 안 된다.
          setHostBusy(false);
          done(null, r, '⚠ 실루엣 굽기 실패 — 사각(bbox) 방식으로 나눴습니다. 비스듬한 배치는 뭉칠 수 있습니다.\n');
          return;
        }
        seedReadPng(r.path, function (err, img) {
          if (err) { setHostBusy(false); done('마스크 읽기 실패: ' + err); return; }
          // ★호스트가 **계산한** 픽셀 수와 실제 PNG 가 다르면 라벨 인덱싱이 통째로 밀린다 —
          //   seedArgmaxLabel 은 r.w 로 행을 잡는데 마스크는 img 로 만들어지므로, 1px 만 어긋나도
          //   엉뚱한 조각에 라벨이 붙는다(조용히 틀린다 · 예외도 안 난다).
          //   굽기는 export 배율 반올림, 캡처는 dpi 반올림이라 양쪽 다 1px 어긋날 수 있다.
          //   영역(mm)은 ox/oy 와 w*mmpp 로 확정돼 있으므로 **실제 이미지 쪽에 맞춘다**.
          if (img && (img.W !== r.w || img.H !== r.h)) {
            if (r.w > 0 && img.W > 0) r.mmpp = (r.w * r.mmpp) / img.W;
            r.w = img.W; r.h = img.H;
          }
          var sp = null;
          try { sp = seedSplit(G, r, img, gap); }
          catch (eG) { setHostBusy(false); done('성분 분리 실패: ' + eG); return; }
          csi.evalScript('mesA0_seedApply("' + sp.spec + '")', function (res2) {
            setHostBusy(false);
            var r2 = null; try { r2 = JSON.parse(res2); } catch (e2) {}
            if (!r2 || !r2.ok) { done('큐 적재 실패: ' + (r2 ? (SEED_ERR[r2.err] || r2.err) : '호스트 연결 안 됨')); return; }
            r2.mmpp = r.mmpp;
            r2.via = r.via;        // 'capture'=임시 문서 없이 구움 · 'bake'=임시 문서 복제(오늘까지의 유일한 경로)
            r2.comps = sp.comps;   // 잉크 덩어리 수 — 참고용(흰 요소·간격 때문에 과대계상될 수 있다)
            r2.cands = r.n;        // 후보 개체 수
            r2.grp = r.grp;        // 그 중 그룹 개수 ← "그룹을 푸세요" 진단의 **사실 근거**
            done(null, r2, sp.note);
          });
        });
      });
    }
    if (elBtnCancel) elBtnCancel.addEventListener('click', function () {
      // ★2단 동작 = 정상 취소 + **영구 잠김 탈출구**(2026-07-30 배포 전 점검).
      //   호스트 콜백이 끝내 안 돌아오는 경우가 실재한다(JSX 모달 대기·COM wedge 전례) →
      //   그때 setHostBusy(false) 가 영영 실행되지 않아 **패널이 못 쓰는 상태로 굳는다**.
      //   취소는 플래그만 세우므로 그것만으로는 풀리지 않는다 → 두 번째 클릭에 강제 해제.
      //   ⚠️강제 해제는 호스트가 아직 작업 중일 수 있다는 뜻이므로 경고를 함께 남긴다.
      if (!cancelRequested) {
        cancelRequested = true;
        elBtnCancel.textContent = '강제 해제 (호스트 무응답일 때)';
        out('취소 요청 — 진행 중인 1건을 마치고 멈춥니다(실행 중인 작업은 중단할 수 없습니다).' +
          '\n응답이 없으면 [강제 해제]를 눌러 패널 잠금만 풀 수 있습니다.');
        return;
      }
      setHostBusy(false);
      out('⚠ 패널 잠금을 강제로 풀었습니다. 호스트(일러)가 아직 작업 중일 수 있으니 ' +
        '일러 화면에 모달/진행이 없는지 확인한 뒤 다시 실행하세요.\n' +
        'Z: 등록 폴더에 중간 산출물이 남았을 수 있습니다.', 'err');
    });
    // 큐 전 행이 모아찍기인가 — 검토문서 게이트 면제 판정(P2). 빈 큐는 false.
    function queueAllImpose() {
      if (!queue.length) return false;
      for (var qi = 0; qi < queue.length; qi++) {
        if (!queue[qi].params || queue[qi].params.mode !== 'impose') return false;
      }
      return true;
    }
    function updateGate() {
      // 검토는 **선택 사항**이다(2026-07-30 지시). 이전엔 검토 없이는 확정이 불가능해
      //   N행이면 검토 N회 + 확정 N회 = 2N회 가공을 강제했다(10건이면 20회).
      // ⚠️ 안전망을 없앤 것이므로 대신 상태를 눈에 남긴다:
      //   버튼 라벨에 '· 미검토'(renderQueue) + 확정 완료 메시지에 미검토 명기.
      var stale = (reviewedRev !== queueRev) && !queueAllImpose();
      if (elBtnConfirm) {
        elBtnConfirm.disabled = queue.length === 0 || reviewBusy;
        elBtnConfirm.title = (queue.length && stale)
          ? '미검토 상태로 확정합니다 — [검토문서]로 마감·돔보·크기를 먼저 볼 수 있습니다'
          : '';
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
    function renderQueueInto(box, emptyMsg, showQty, showSel) {
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
            html += '<div class="qrow' + (i === bound ? ' sel' : '') + '" data-i="' + i + '">' +
              // 체크 상태는 queue[i].sel 이 정본 — innerHTML 재작성으로 DOM 이 날아가도 유지된다.
              (showSel ? ('<input class="qsel" data-i="' + i + '" type="checkbox" title="적용 대상 체크"' + (e.sel ? ' checked' : '') + ' />') : '') +
              '<span class="qn">#' + (i + 1) + '</span>' +
              '<input class="qkw" data-i="' + i + '" type="text" value="' + escHtml(e.keyword || '') + '" placeholder="내용" />' +
              (showQty ? ('<input class="qqty" data-i="' + i + '" type="text" value="' + escHtml(String(e.qty || 1)) + '" title="확정 수량(이 행의 정본)" />') : '') +
              '<span class="qmeta" title="' + escHtml(meta) + '">' + escHtml(meta) + '</span>' +
              '<button class="qdel" data-i="' + i + '">✕</button></div>';
          }
          box.innerHTML = html;
          var rows = box.getElementsByClassName('qrow');
          for (var r = 0; r < rows.length; r++) rows[r].addEventListener('click', function (ev) {
            var cls = (ev.target && ev.target.className) ? String(ev.target.className) : '';
            if (cls.indexOf('qkw') !== -1 || cls.indexOf('qqty') !== -1 || cls.indexOf('qdel') !== -1 || cls.indexOf('qsel') !== -1) return; // 인라인 편집·삭제·체크 클릭은 행 선택(연동) 아님
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
          // 선택 적용 대상 체크 — 정본은 queue[i].sel. 재렌더 없이 버튼 라벨만 갱신한다
          //   (renderQueue 를 부르면 체크하는 순간 DOM 이 재생성돼 연속 체크가 끊긴다)
          var sels = box.getElementsByClassName('qsel');
          for (var s2 = 0; s2 < sels.length; s2++) sels[s2].addEventListener('change', function () {
            var ix = parseInt(this.getAttribute('data-i'), 10);
            if (isNaN(ix) || ix < 0 || ix >= queue.length) return;
            queue[ix].sel = !!this.checked;
            updateApplyBar();
          });
        }
      }
    }

    // 선택 적용 대상 = queue[i].sel 인 행. 체크가 0개면 버튼을 잠근다(대상 없는 적용 방지)
    function selectedRows() {
      var idx = [];
      for (var i = 0; i < queue.length; i++) if (queue[i].sel) idx.push(i);
      return idx;
    }
    function updateApplyBar() {
      // ★[선택 적용]·[전체 적용]의 대상은 **큐 행**이다 → 묶음 탭에서만 의미가 있다(2026-07-30 P2).
      //   전엔 `queue.length` 만 봐서 **단건 탭에 있으면서 묶음 큐 3행을 전부 바꿀 수 있었다**
      //   (재현 확인). "탭이 곧 용도"라는 이 패널의 원칙에 정면으로 어긋난다.
      //   폼이 탭 사이를 이동하므로 버튼도 함께 따라가는데, 단건 탭에서는 잠그고 이유를 남긴다.
      var onBundle = (activeTab() === 'bundle');
      var n = selectedRows().length;
      // ★단건 탭에서는 **숨긴다** (2026-08-06 단순화). 잠긴 채로 남겨 두면 영원히 누를 수 없는
      //   버튼 2개가 폼 머리에 상주해 자리만 먹는다. DOM 에는 남기므로(display 만 조작)
      //   잠금·title 계약과 스모크의 isDisabled 판정은 그대로 성립한다.
      //   ⚠️ class 'hidden' 을 쓰지 않는 이유는 :548 주석 참조(명시도 충돌).
      if (elBtnApplySel) elBtnApplySel.style.display = onBundle ? '' : 'none';
      if (elBtnApplyAll) elBtnApplyAll.style.display = onBundle ? '' : 'none';
      if (elBtnApplySel) {
        elBtnApplySel.textContent = n ? ('체크한 행 적용 (' + n + ')') : '체크한 행 적용';
        elBtnApplySel.disabled = !onBundle || n === 0;
        elBtnApplySel.title = onBundle
          ? '체크한 행에만 현재 후가공·가공 설정 적용 (수량·키워드·거래처는 행값 유지)'
          : '[묶음] 탭에서만 사용합니다 — 적용 대상이 큐 행입니다';
      }
      if (elBtnApplyAll) {
        elBtnApplyAll.disabled = !onBundle || queue.length === 0;
        elBtnApplyAll.title = onBundle
          ? '현재 가공·후가공 설정을 모든 행에 적용 (수량·키워드·거래처는 행값 유지)'
          : '[묶음] 탭에서만 사용합니다 — 적용 대상이 큐 행입니다';
      }
    }
    // 현재 폼 설정을 지정 행들에 적용 — 행 고유값(수량·키워드·거래처)은 보존.
    //   [선택 적용]·[전체 적용]이 **이 함수를 공유**한다(규칙이 둘이면 갈린다).
    function applyFormToRows(idx) {
      if (!idx.length) return 0;
      var base = gatherParams();
      // 주석 문구 = mesA0_annotText(keyword, seq, qty) 이고 **keyword 가 비면 주석을 아예 안 그린다**.
      //   행 키워드는 '담을 때' #annot 값으로 시드되므로, 담은 뒤에 주석 키워드를 입력하면 행에는
      //   반영되지 않아 "묶음에선 주석이 안 생긴다"로 보였다(2026-07-30 지적).
      //   → 빈 행만 폼 값으로 채운다. 값이 있는 행은 보존한다(식별번호·파일명 구분이 키워드에 걸려 있다).
      //   ⚠️ 단, 칸이 **숨어 있으면 폴백하지 않는다**(2026-07-30 P2) — 묶음 탭에선 보이지도 않는
      //      지난번 값이 전 행에 퍼지는 사고가 된다(재현 확인). 그 탭에선 행 키워드가 정본이다.
      var formKw = annotVisible() ? (base.keyword || '') : '';
      for (var k = 0; k < idx.length; k++) {
        var e = queue[idx[k]];
        if (!e) continue;
        var p = JSON.parse(JSON.stringify(base));
        keepRowMode(p, e); // 행 용도 보존 — 모아찍기 행에 후가공이 실리지 않게
        p.qty = e.qty;
        if (!e.keyword && formKw) e.keyword = formKw; // 행 표시(qkw)도 같이 정합
        p.keyword = e.keyword || '';
        p.client_name = e.client || '';
        p.client_id = clientIdOf(p.client_name); // 행 거래처 기준 재해소(폼 거래처 id가 남지 않게)
        e.params = p;
      }
      bumpRev();
      renderQueue();
      return idx.length;
    }
    // 주석 위치는 켜져 있는데 키워드가 빈 행 = 주석이 조용히 안 나오는 조합 → 적용 결과에 알린다.
    //   (여백 3cm 미만 변은 host 가 그 변만 생략한다 — updateAnnotGates 가 체크 자체를 막는다)
    function annotGapNote(idx) {
      var n = 0;
      for (var k = 0; k < idx.length; k++) {
        var e = queue[idx[k]];
        if (!e || !e.params) continue;
        var ap = e.params.annot_pos || {};
        if ((ap.top || ap.bottom || ap.left || ap.right) && !(e.keyword || '')) n++;
      }
      return n ? ('\n⚠ ' + n + '행은 주석 위치가 켜졌지만 키워드가 비어 주석이 안 나옵니다 — 행 키워드를 입력하세요') : '';
    }

    // 큐 상태 → 모아찍기 탭 등록 버튼. 단건 행이 섞이면 비활성(용도가 다른 걸 같이 등록하지 않는다).
    function updateImposeBar() {
      if (!elBtnImposeRegister) return;
      var n = queue.length, allImpose = queueAllImpose();
      elBtnImposeRegister.textContent = '조각 ' + n + '건 등록'; // 라벨 어간 '등록' 통일(P3)
      elBtnImposeRegister.disabled = (n === 0) || !allImpose;
      elBtnImposeRegister.title = (n && !allImpose)
        ? '단건 용도 행이 섞여 있습니다 — [묶음] 탭에서 확정하거나 비우고 다시 분리하세요'
        : '';
    }

    function renderQueue() {
      // 체크박스는 묶음 탭에만 — 모아찍기는 후가공이 없어 '체크한 행 적용'의 대상이 될 게 없다
      renderQueueInto(elQueueBox, '목록 비어있음 — 일러에서 디자인을 고른 뒤 [＋ 개별] 또는 [＋ 묶음분리]', true, true);
      renderQueueInto(elImposeBox, '조각 없음 — 일러에서 디자인을 고른 뒤 [선택분 분리] 또는 [◎ 자동감지]', false, false);
      if (elBtnConfirm) elBtnConfirm.textContent = queue.length + '건 등록' +
        (((reviewedRev !== queueRev) && !queueAllImpose() && queue.length) ? ' · 미검토' : '');
      updateApplyBar();
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
      // 문구를 행 용도에 맞춘다 — 모아찍기 행에 "후가공 수정이 반영됩니다"는 거짓이고(후가공 없음),
      //   후가공 폼은 이제 묶음 탭에도 있으므로 "[단건] 탭의"도 사실과 다르다.
      //   탭을 옮기면 연동이 끊기므로(위 탭 클릭 핸들러) 그 사실도 함께 알린다.
      var baseMsg = (queue[i].params && queue[i].params.mode === 'impose')
        ? '#' + (i + 1) + ' 행 — 일러에 이 조각을 표시했습니다 (모아찍기는 후가공이 없습니다 · 다시 클릭=해제)'
        : '#' + (i + 1) + ' 행 연동 중 — 후가공 폼의 수정이 이 행에 반영됩니다 (다시 클릭=해제 · 탭을 옮기면 자동 해제)';
      out(baseMsg);
      // P3(2026-07-29): 이 행이 **어느 그룹인지** 일러에서 보여준다 — 원본 조각을 선택.
      //   mesA0_queueSelect 는 검토·확정 루프가 이미 쓰던 함수를 그대로 재사용(재구현 금지).
      //   실패(문서 닫힘·참조 무효)해도 연동은 유지한다 — 폼 편집까지 막을 이유가 없다.
      csi.evalScript('mesA0_queueSelect(' + i + ')', function (sres) {
        var sr = null; try { sr = JSON.parse(sres); } catch (e) {}
        if (sr && sr.ok) { out(baseMsg + '\n· 일러에서 이 행의 조각 ' + sr.n + '개를 표시했습니다'); return; }
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
        { var mkR = markSelect(side); if (mkR) mkR.checked = !!fin[side + '_mark']; }  // 옛 행의 'fold' 도 켜짐
      }
      if (elPreset) elPreset.value = ''; // 프리셋 표기는 (직접 지정)으로 — 실값은 위에서 로드됨
      updateClientHit();
      updateAnnotGates();
    }

    // 연동 행에 현재 폼 반영 — gatherParams 재사용으로 post_desc(파일명 세그먼트)·주석 게이트까지 행별 재계산
    function syncBoundRow() {
      if (bound < 0 || bound >= queue.length) return;
      var e = queue[bound];
      var p = keepRowMode(gatherParams(), e); // 행 용도는 폼이 바꾸지 않는다
      p.qty = e.qty;   // 행 수량 보존 — 폼(#qty)은 단건 전용이라 행을 덮어쓰면 안 된다
      // 주석 키워드 칸이 **숨어 있으면 행에 쓰지 않는다**(2026-07-30 P2). 묶음 탭에선 행별 키워드가
      //   정본이고, 숨은 칸엔 지난번 값이 남아 있어(localStorage 복원) 그대로 쓰면 조용히 덮인다.
      if (!annotVisible()) p.keyword = e.keyword || '';
      e.params = p;
      e.client = p.client_name || '';
      e.keyword = p.keyword || '';
      bumpRev();
      renderQueue();
    }

    // 폼 변경 위임 감지(연동 시 자동 반영).
    //   ★제외목록 → **허용목록으로 뒤집었다**(2026-07-30 P2). 전엔 `worker`·`splitGap` 만 제외해서
    //     `#seedQty`·`#imposeGap` 처럼 **행과 무관한 칸을 건드려도 연동 행이 폼 기준으로 덮어써졌다**
    //     (재현 확인). 제외목록은 칸이 하나 늘 때마다 새는 구조라, 무엇이 행에 반영돼야 하는지를
    //     명시하는 편이 안전하다 — 새 칸을 추가해도 기본이 '반영 안 함'이 된다.
    //   행에 반영되어야 하는 것 = 후가공 폼 전체(finBody·finToggleRow) + 행별로 의미가 있는 공통 칸.
    var ROW_SYNC_IDS = ['client', 'scale', 'trim', 'trimInk', 'borderLine', 'annot', 'preset'];
    function isRowSyncTarget(t) {
      if (!t) return false;
      if (elQueueBox && elQueueBox.contains(t)) return false;   // 큐 내부 인라인 편집은 자기 경로가 있다
      if (elImposeBox && elImposeBox.contains(t)) return false;
      if (elFinBody && elFinBody.contains(t)) return true;      // 마감·펀칭·주석위치 전체
      if (elFinToggleRow && elFinToggleRow.contains(t)) return true;
      if (t.id && ROW_SYNC_IDS.indexOf(t.id) !== -1) return true;
      return false;
    }
    document.addEventListener('change', function (ev) {
      if (bound < 0) return;
      if (!isRowSyncTarget(ev.target)) return;
      syncBoundRow();
    });

    if (elBtnApplyAll) elBtnApplyAll.addEventListener('click', function () {
      if (!queue.length) return;
      var all = [];
      for (var i = 0; i < queue.length; i++) all.push(i);
      out('현재 가공·후가공 설정을 전체 ' + applyFormToRows(all) + '행에 적용 (수량·거래처는 행값 유지)' + annotGapNote(all));
    });
    // 선택 적용 — 5+5 처럼 설정이 갈리는 묶음에서 행을 하나씩 연동하지 않게 하는 핵심 경로
    if (elBtnApplySel) elBtnApplySel.addEventListener('click', function () {
      var idx = selectedRows();
      if (!idx.length) { out('적용할 행을 체크하세요', 'err'); return; }
      var rowNos = [];
      for (var k = 0; k < idx.length; k++) rowNos.push('#' + (idx[k] + 1));
      out('현재 가공·후가공 설정을 ' + applyFormToRows(idx) + '행에 적용 — ' + rowNos.join(' ') +
        ' (수량·거래처는 행값 유지)' + annotGapNote(idx));
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
        var keyword = seedKeyword(); // 보이는 칸만 시드(숨은 값 주입 차단)
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
      seedSilhouette('sel', gap, function (errMsg, r, note) { // 분리 간격(mm): 0=닿을때만·음수=더 잘게
        if (errMsg) { out(errMsg, 'err'); return; }
        var qtyN = seedQtyValue(); // 묶음: 새 행 기본수량(#seedQty). 확정 수량은 각 행에서.
        var client = elClient ? (elClient.value || '').replace(/^\s+|\s+$/g, '') : '';
        var keyword = seedKeyword(); // 보이는 칸만 시드(숨은 값 주입 차단)
        var base = gatherParams();
        for (var s = 0; s < r.sizes.length; s++) {
          var pRow = JSON.parse(JSON.stringify(base)); pRow.qty = qtyN;
          queue.push({ params: pRow, client: client, keyword: keyword, qty: qtyN, w: r.sizes[s].w, h: r.sizes[s].h });
        }
        bumpRev();
        renderQueue();
        // ★1덩어리 경고 — 모아찍기 탭 폐기(S2, 2026-08-05)로 그 경로에만 있던 진단을 여기로 옮겼다.
        //   없으면 **여러 디자인이 1건으로 등록되는 사고**를 아무도 못 잡는다
        //   (실제: 539×243.3cm·work.ai 110MB 가 조각 1건으로 등록됐다).
        //   원인은 **개체 사실**(cands·grp)로 판정한다 — 잉크 덩어리 수로 추정하면 흰 요소·투명 간격
        //   때문에 틀린다(2026-07-31 용준님 지적).
        if (r.added === 1) {
          var whyB;
          if (r.cands === 1 && r.grp === 1) {
            whyB = '\n원인 = **선택이 그룹 1개**입니다. Ctrl+Shift+G 로 푼 뒤 다시 분리하세요.';
          } else if (r.cands > 1) {
            whyB = '\n개체는 ' + r.cands + '개인데 잉크가 전부 이어져 1건이 됐습니다.'
              + '\n→ 전체를 덮는 **배경 판**(흰 판·테두리 등)이 선택에 섞였는지 확인하고 빼주세요.';
          } else {
            whyB = '\n여러 디자인이라면: ①분리 간격을 음수로 낮춰 더 잘게 나누기 ②[◎ 자동감지]로 문서 전체 스캔';
          }
          out((note || '') + '⚠ 1개로만 인식됐습니다 — 묶음 분리' + whyB
            + '\n진짜 1개 디자인이면 그대로 두고 진행하세요.', 'err');
          return;
        }
        out((note || '') + '묶음 분리: ' + r.added + '개로 나눔 (잉크 실루엣 · 분리간격 ' + gap + 'mm · 50mm↓ 제외'
          + (r.mmpp ? ' · 해상도 ' + r.mmpp + 'mm/px' : '') + ')\n틀리면 [✕] 삭제 후 개별 추가로 교정',
          note ? 'err' : 'okmsg');
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
      seedSilhouette('auto', gap, function (errMsg, r, note) {
        if (errMsg) { out(errMsg, 'err'); return; }
        var qtyN = seedQtyValue(); // 묶음: 새 행 기본수량(#seedQty). 확정 수량은 각 행에서.
        var client = elClient ? (elClient.value || '').replace(/^\s+|\s+$/g, '') : '';
        var keyword = seedKeyword(); // 보이는 칸만 시드(숨은 값 주입 차단)
        var base = gatherParams();
        for (var s = 0; s < r.sizes.length; s++) {
          var pRow = JSON.parse(JSON.stringify(base)); pRow.qty = qtyN;
          queue.push({ params: pRow, client: client, keyword: keyword, qty: qtyN, w: r.sizes[s].w, h: r.sizes[s].h });
        }
        bumpRev();
        renderQueue();
        out((note || '') + '자동감지 시드: ' + r.added + '개 제안 (문서 전체 · 잉크 실루엣 · 50mm↓ 제외 · 분리간격 ' + gap + 'mm'
          + (r.mmpp ? ' · 해상도 ' + (Math.round(r.mmpp * 1000) / 1000) + 'mm/px' : '')
          + (r.via === 'capture' ? ' · 임시문서 없음' : '') + ')\n틀리면 [✕] 삭제·선택 후 [＋ 개별]로 교정',
          note ? 'err' : 'okmsg');
      });
    });

    // ── 검토문서(D4): 큐 전체를 가공해 디자인당 아트보드로 생성(저장 없음) → 확정 게이트 해제 ──
    if (elBtnReview) elBtnReview.addEventListener('click', function () {
      if (!queue.length || reviewBusy) return;
      if (hostBusy) return; // 다른 파이프라인 진행 중이면 진입 금지(params 파일 공유)
      reviewBusy = true;
      setHostBusy(true, '검토문서');
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
          setHostBusy(false);
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
        // 취소 지점 — 검토문서는 저장물이 없으므로 만든 아트보드까지만 두고 정상 마감한다
        if (cancelRequested) {
          out('검토 취소됨 — ' + i + '/' + queue.length + '건까지 배치했습니다.');
          finishReview();
          return;
        }
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
      if (!queue.length || hostBusy) return; // hostBusy = 다른 파이프라인 진행 중(params 파일 공유)
      setHostBusy(true, '진행 중');
      function reenable() { setHostBusy(false); }
      csi.evalScript('mesA0_batchBegin()', function (bres) {
        var bf = null; try { bf = JSON.parse(bres); } catch (e0) {}
        if (!bf || !bf.ok) { out('배치 폴더 생성 실패: ' + (bf ? bf.err : 'nohost'), 'err'); reenable(); return; }
        var batchFolder = bf.folder, results = [], i = 0;
        var cancelledAt = -1; // 취소로 멈춘 지점(-1 = 취소 없음). 완료 메시지에 함께 남긴다.
        // 식별번호 = 키워드별 순번(같은 키워드끼리 1,2,3). 키워드 없으면 전체순번(파일명 유니크)
        var kwCount = {}, seqForRow = [];
        for (var qi = 0; qi < queue.length; qi++) {
          var K = queue[qi].keyword || '';
          if (K) { kwCount[K] = (kwCount[K] || 0) + 1; seqForRow[qi] = kwCount[K]; }
          else { seqForRow[qi] = qi + 1; }
        }
        function finishBatch() {
          var okN = 0, failN = 0, lines = [], okIdx = [];
          for (var k = 0; k < results.length; k++) {
            var r = results[k];
            // 모아찍기 = 100MB급 work.ai 가 실제로 나온 경로 → 행별로 용량·경고를 반드시 노출한다.
            if (r && r.ok) { okN++; okIdx.push(k); lines.push('#' + (k + 1) + ' ✓ ' + (r.eps || '(work.ai)') + (r.dxf ? ' +DXF' : '') + mbText(r.bytes) + warnText(r.warn).replace(/\n/g, ' ')); }
            else { failN++; lines.push('#' + (k + 1) + ' ✗ ' + (r ? r.err : '?')); }
          }
          // 검토가 선택 사항이 된 뒤로는 '검토 없이 확정했다'는 사실을 결과에 남긴다(추적 수단)
          var unrev = (reviewedRev !== queueRev) && !queueAllImpose();
          // ★성공분만 큐에서 뺀다(2026-07-30 점검). 전엔 실패해도 큐를 통째로 비워
          //   조각 참조(host $.global.mesA0Q)까지 사라져 **재시도 수단이 없었다** — 3건 실패 시
          //   처음부터 다시 선택·분리해야 했다(#574 '실패자만 재선택'과 같은 클래스).
          //   내림차순 + 콜백 체이닝으로 제거해 패널 큐와 host 큐의 인덱스 정합을 보장한다
          //   (한꺼번에 evalScript 를 뿌리면 순서가 보장되지 않아 엉뚱한 행이 지워질 수 있다).
          function removeOk(list, done) {
            if (!list.length) { done(); return; }
            var ix = list.pop();
            csi.evalScript('mesA0_queueRemove(' + ix + ')', function () {
              queue.splice(ix, 1);
              removeOk(list, done);
            });
          }
          removeOk(okIdx.slice(), function () {
            bound = -1;
            bumpRev(); // 큐가 바뀌었다 → 재검토 표시가 다시 붙는다
            csi.evalScript('mesA0_reviewDiscard()', function () {}); // 검토문서 정리(저장물과 무관)
            renderQueue(); reenable();
            if (!queue.length) {
              clearFinishing(); // 전건 성공 = 후가공 리셋(단건 경로와 동일 규칙)
              saveSettings();
            }
            out((cancelledAt >= 0 ? '취소됨 — ' + cancelledAt + '건 처리 후 중단. ' : '') +
              '일괄 확정 완료: 성공 ' + okN + ' / 실패 ' + failN + (unrev ? ' (미검토 확정)' : '') +
              '\n폴더: ' + batchFolder + '\n' + lines.join('\n') +
              (failN
                ? '\n⚠ 실패 ' + failN + '건은 목록에 남겨 뒀습니다 — 원인을 고친 뒤 [일괄 확정]으로 재시도하세요 (성공분은 제거됨)'
                : (cancelledAt >= 0
                    ? '\n남은 건은 목록에 있습니다 — [일괄 확정]으로 이어서 진행하세요 (성공분은 제거됨)'
                    : '\n→ 에이전트 ingest 후 대기함')), (failN || cancelledAt >= 0) ? 'err' : 'okmsg');
            if (typeof onDone === 'function') onDone(okN, failN);
          });
        }
        function step() {
          if (i >= queue.length) { finishBatch(); return; }
          // ★취소 지점 — 실행 중인 JSX 는 중단할 수 없으므로 **다음 건으로 넘어가기 직전**에 멈춘다.
          //   여기까지 처리된 건은 이미 Z: 에 저장됐으므로 finishBatch 로 정상 마감한다
          //   (성공분은 큐에서 빠지고 미처리분은 남아 재시도 가능 = 실패분 보존과 같은 규칙).
          if (cancelRequested) {
            cancelledAt = i; // finishBatch 의 완료 메시지에 실어야 한다 — 여기서 out() 하면 덮인다
            finishBatch();
            return;
          }
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
    //   분리는 `seedSilhouette`(잉크 실루엣), 등록은 `runBatchConfirm`
    //   (= [일괄 확정])을 **그대로 재사용**한다. 산출 구조가 묶음 확정과 동일하다.
    //   결과는 항상 목록으로 보인 뒤 별도 버튼으로 등록한다 — 1덩어리로 뭉쳐도 눈에 먼저 띈다.
    function imposeSeed(source, gap) {
      if (queue.length) { // 남은 큐를 휩쓸어 등록하는 사고 차단
        out('목록에 ' + queue.length + '건이 남아 있습니다 — [등록]하거나 [비우기] 후 다시 분리하세요.', 'err');
        return;
      }
      seedSilhouette(source, gap, function (errMsg, r, note) {
        if (errMsg) { out(errMsg, 'err'); return; }
        // 모아찍기는 수량을 받지 않는다 — 판에 몇 개 앉힐지는 ia-editor 판짜기가 조각별로 정한다
        //   (iaEditor.js:1892 는 intake.qty 를 쓰지 않고 qty:1 로 담는다). 여기서 받아봐야 표시용 메모다.
        var qtyN = 1;
        var client = elClient ? (elClient.value || '').replace(/^\s+|\s+$/g, '') : '';
        var keyword = seedKeyword(); // 보이는 칸만 시드(숨은 값 주입 차단)
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
        //   ⚠️ 실루엣으로 바꿔도 이 경고는 그대로 필요하다 — 배정 단위가 **개체**이기 때문이다.
        //      원인 판정은 **개체 사실**로 한다. 잉크 덩어리 수(comps)로 추정하면 틀린다 —
        //      흰 요소·투명 간격 때문에 한 디자인도 여러 덩어리로 보이기 때문(2026-07-31 용준님 지적).
        if (r.added === 1) {
          var why;
          if (r.cands === 1 && r.grp === 1) {
            why = '\n원인 = **선택이 그룹 1개**입니다. Ctrl+Shift+G 로 푼 뒤 다시 분리하세요.';
          } else if (r.cands > 1) {
            // 개체는 여럿인데 1건 = 잉크가 전부 이어졌다. 전면을 덮는 배경 판이 섞인 것이 전형적이다.
            why = '\n개체는 ' + r.cands + '개인데 잉크가 전부 이어져 1건이 됐습니다.'
              + '\n→ 전체를 덮는 **배경 판**(흰 판·테두리 등)이 선택에 섞였는지 확인하고 빼주세요.';
          } else {
            why = '\n여러 디자인이라면: ①분리 간격을 음수로 낮춰 더 잘게 나누기 ②[◎ 자동감지]로 문서 전체 스캔';
          }
          out((note || '') + '⚠ 1개로만 인식됐습니다 — ' + lines[0] + why +
            '\n진짜 1개 디자인이면 그대로 [등록]하세요.', 'err');
          return;
        }
        out((note || '') + '분리됨: ' + r.added + '개 (잉크 실루엣 · 분리간격 ' + gap + 'mm · 50mm↓ 제외'
          + (r.mmpp ? ' · 해상도 ' + r.mmpp + 'mm/px' : '') + ')\n' + lines.join(' · ') +
          '\n→ 행 클릭 = 일러에서 그 조각 선택 · 수량은 행에서 직접 수정 · [등록]으로 조각별 등록',
          note ? 'err' : 'okmsg');
      });
    }
    function imposeGapValue() {
      var g = elImposeGap ? parseFloat(elImposeGap.value) : 0;
      return isNaN(g) ? 0 : g;
    }
    if (elBtnImposeSplit) elBtnImposeSplit.addEventListener('click', function () { imposeSeed('sel', imposeGapValue()); });
    if (elBtnImposeDetect) elBtnImposeDetect.addEventListener('click', function () { imposeSeed('auto', imposeGapValue()); });
    if (elBtnImposeClear) elBtnImposeClear.addEventListener('click', function () {
      csi.evalScript('mesA0_queueClear()', function () {});
      queue = []; bound = -1; bumpRev(); renderQueue(); out('목록 비움');
    });
    if (elBtnImposeRegister) elBtnImposeRegister.addEventListener('click', function () {
      if (!queue.length || !queueAllImpose()) return;
      if (!requireWorker()) return;
      out('모아찍기 등록 중… ' + queue.length + '건');
      runBatchConfirm();
    });

    if (elBtnConfirm) elBtnConfirm.addEventListener('click', function () {
      if (!queue.length) return;
      if (!requireWorker()) return;
      // ⚠️ 검토 게이트는 **여기에도** 있었다(2026-07-30 실사용 지적) — updateGate() 의 버튼 잠금만
      //    풀었더니 클릭 핸들러의 이 가드가 그대로 막아서 "미검토로는 확정이 안 된다"가 유지됐다.
      //    검토는 선택 사항이므로 두 곳 모두 게이트를 두지 않는다. 상태 표시는
      //    확정 버튼 라벨('· 미검토')과 완료 메시지('(미검토 확정)')로만 한다.
      runBatchConfirm();
    });

    renderQueue();

    // 초기 실측 시도
    refreshMeasure();
  });
})();
