// /equipment 큐/부하 탭 — 백엔드 routes/equipmentQueue.ts (/api/equipment-queue/*) 활성화 UI
// ?raw 전역 스코프 충돌 방지: 전부 IIFE 로컬 + window.eqq* 만 노출 (page-prefix: eqq)
(function () {
  var esc = window.escapeHtml || function (s) { return s == null ? '' : String(s).replace(/[&<>"]/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]; }); };
  var toast = function (m, t) { if (window.showToast) window.showToast(m, t); else console.log('[eqQueue]', m); };
  var apiErr = function (e, m) { if (window.handleApiError) window.handleApiError(e, m); else { console.error(m, e); toast(m, 'error'); } };

  var eqqWorkload = [];     // 장비 부하 목록 (workload API)
  var eqqSelectedId = null; // 선택된 장비 id
  var eqqSelectedName = '';
  var eqqQueue = [];        // 선택 장비의 큐 카드(현재 표시 순서)

  function fmtHm(mins) {
    var m = Math.round(Number(mins) || 0);
    if (m <= 0) return '0분';
    var h = Math.floor(m / 60);
    var mm = m % 60;
    return (h > 0 ? h + '시간 ' : '') + mm + '분';
  }
  function fmtDate(s) { return s ? String(s).slice(0, 10) : '-'; }
  function fmtTime(s) {
    if (!s) return '-';
    if (window.formatKST) { try { return window.formatKST(s, 'time', { hour: '2-digit', minute: '2-digit', hour12: false }); } catch (e) {} }
    var d = new Date(s);
    if (isNaN(d.getTime())) return '-';
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  // 근무시간(HH:MM) → 하루 가용 분. 파싱 불가 시 기본 8시간(480).
  function parseHm(t) {
    if (!t) return null;
    var m = String(t).match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }
  function availableMinutes(w) {
    var s = parseHm(w.working_hours_start);
    var e = parseHm(w.working_hours_end);
    if (s == null || e == null || e <= s) return 480;
    return e - s;
  }

  // ─── 부하 그리드 로드 ─────────────────────────────────────────────────────
  window.eqqLoad = function () {
    var grid = document.getElementById('eqqWorkloadGrid');
    if (!grid) { console.warn('[eqQueue] #eqqWorkloadGrid not found'); return; }
    grid.innerHTML = '<div class="col-span-full text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>';
    axios.get('/api/equipment-queue/workload').then(function (res) {
      eqqWorkload = (res.data && res.data.data) || [];
      renderWorkload();
      // 이전 선택이 여전히 유효하면 큐 갱신
      if (eqqSelectedId && eqqWorkload.some(function (w) { return String(w.id) === String(eqqSelectedId); })) {
        loadQueue();
      }
    }).catch(function (e) {
      apiErr(e, '장비 부하 로드 실패');
      grid.innerHTML = '<div class="col-span-full text-center py-8 text-red-400">로드 실패</div>';
    });
  };

  function renderWorkload() {
    var grid = document.getElementById('eqqWorkloadGrid');
    if (!grid) return;
    if (!eqqWorkload.length) {
      grid.innerHTML = '<div class="col-span-full text-center py-10 text-gray-400"><i class="fas fa-inbox text-2xl mb-2 block"></i>가동 중인(ACTIVE) 장비가 없습니다.</div>';
      return;
    }
    grid.innerHTML = eqqWorkload.map(function (w) {
      var avail = availableMinutes(w);
      var load = Math.round((Number(w.total_estimated_minutes || 0) / avail) * 100);
      var barColor = load >= 100 ? '#dc2626' : load >= 70 ? '#f59e0b' : '#10b981';
      var barW = Math.min(100, Math.max(0, load));
      var qc = Number(w.queue_count || 0);
      var sel = String(w.id) === String(eqqSelectedId);
      var speed = (w.avg_print_minutes_per_sqm != null && w.avg_print_minutes_per_sqm > 0)
        ? (Math.round(w.avg_print_minutes_per_sqm * 10) / 10) + '분/㎡' : '미측정';
      return '<div onclick="window.eqqSelect(\'' + esc(String(w.id)) + '\')" class="ds-card ds-card-compact cursor-pointer transition-shadow hover:shadow-md" '
        + 'style="border:1px solid ' + (sel ? '#3b82f6' : 'var(--c-border)') + ';' + (sel ? 'box-shadow:0 0 0 2px rgba(59,130,246,0.15);' : '') + '">'
        + '<div class="flex items-center justify-between mb-1 gap-2">'
        + '<span class="font-semibold text-sm text-gray-800 truncate" title="' + esc(w.name) + '">' + esc(w.name) + '</span>'
        + '<span class="text-[11px] px-1.5 py-0.5 rounded-full flex-shrink-0 ' + (qc > 0 ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400') + '">' + qc + '건 대기</span>'
        + '</div>'
        + '<div class="flex items-center gap-2 mb-1.5">'
        + '<div class="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden"><div class="h-3 rounded-full" style="width:' + barW + '%;background:' + barColor + '"></div></div>'
        + '<span class="text-[11px] font-semibold" style="color:' + barColor + ';min-width:34px;text-align:right;">' + load + '%</span>'
        + '</div>'
        + '<div class="flex justify-between text-[11px] text-gray-500">'
        + '<span>예상 ' + fmtHm(w.total_estimated_minutes) + '</span>'
        + '<span>최근납기 ' + fmtDate(w.earliest_deadline) + '</span>'
        + '</div>'
        + '<div class="text-[10px] text-gray-400 mt-0.5">속도 ' + speed + ' · 가용 ' + fmtHm(avail) + '/일</div>'
        + '</div>';
    }).join('');
  }

  // ─── 장비 큐 상세 ─────────────────────────────────────────────────────────
  window.eqqSelect = function (id) {
    eqqSelectedId = id;
    var w = eqqWorkload.filter(function (x) { return String(x.id) === String(id); })[0];
    eqqSelectedName = w ? w.name : String(id);
    renderWorkload(); // 선택 하이라이트 갱신
    var title = document.getElementById('eqqQueueTitle');
    if (title) title.textContent = eqqSelectedName + ' — 인쇄 큐';
    var rb = document.getElementById('eqqRecalcBtn');
    if (rb) rb.classList.remove('hidden');
    loadQueue();
  };

  function loadQueue() {
    var body = document.getElementById('eqqQueueBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</td></tr>';
    axios.get('/api/equipment-queue/' + encodeURIComponent(eqqSelectedId) + '/queue').then(function (res) {
      eqqQueue = (res.data && res.data.data) || [];
      renderQueue();
    }).catch(function (e) {
      apiErr(e, '큐 로드 실패');
      body.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-400">로드 실패</td></tr>';
    });
  }

  function renderQueue() {
    var body = document.getElementById('eqqQueueBody');
    if (!body) return;
    if (!eqqQueue.length) {
      body.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">인쇄 대기 중인(PRINTING) 카드가 없습니다.</td></tr>';
      return;
    }
    body.innerHTML = eqqQueue.map(function (c, i) {
      var spec = (c.width && c.height) ? (c.width + '×' + c.height) : '-';
      var qty = c.quantity ? ' · ' + c.quantity + '매' : '';
      var upDis = i === 0 ? ' disabled style="opacity:0.3;cursor:not-allowed;"' : '';
      var downDis = i === eqqQueue.length - 1 ? ' disabled style="opacity:0.3;cursor:not-allowed;"' : '';
      var estMin = (c.estimated_minutes != null && c.estimated_minutes !== '') ? c.estimated_minutes : '-';
      return '<tr>'
        + '<td style="text-align:center;" class="font-semibold text-gray-500">' + (i + 1) + '</td>'
        + '<td class="col-code font-mono text-[11px]">' + esc(c.card_number || ('#' + c.id)) + '</td>'
        + '<td class="col-name"><div class="truncate" title="' + esc((c.client_name || '') + ' · ' + (c.item_name || '')) + '">' + esc(c.client_name || '-') + '<span class="text-gray-400"> · </span>' + esc(c.item_name || '-') + '</div></td>'
        + '<td class="col-qty" style="text-align:center;">' + esc(spec) + qty + '</td>'
        + '<td class="col-amount tabular-nums" style="text-align:right;">' + estMin + '</td>'
        + '<td style="text-align:center;" class="text-[11px] text-gray-500">' + fmtTime(c.estimated_start_at) + ' ~ ' + fmtTime(c.estimated_end_at) + '</td>'
        + '<td class="col-date" style="text-align:center;">' + fmtDate(c.delivery_date) + '</td>'
        + '<td style="text-align:center;white-space:nowrap;">'
        + '<button onclick="window.eqqMove(' + i + ',-1)"' + upDis + ' class="px-1.5 py-0.5 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-200" title="위로"><i class="fas fa-arrow-up"></i></button> '
        + '<button onclick="window.eqqMove(' + i + ',1)"' + downDis + ' class="px-1.5 py-0.5 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-200" title="아래로"><i class="fas fa-arrow-down"></i></button>'
        + '</td>'
        + '</tr>';
    }).join('');
  }

  // 위/아래 이동 → 로컬 재배열 후 서버 저장(reorder). 배열 앞쪽 = 높은 우선순위.
  window.eqqMove = function (idx, dir) {
    var to = idx + dir;
    if (to < 0 || to >= eqqQueue.length) return;
    var tmp = eqqQueue[idx];
    eqqQueue[idx] = eqqQueue[to];
    eqqQueue[to] = tmp;
    renderQueue();
    saveOrder();
  };

  function saveOrder() {
    var ids = eqqQueue.map(function (c) { return c.id; });
    axios.patch('/api/equipment-queue/' + encodeURIComponent(eqqSelectedId) + '/queue/reorder', { card_ids: ids })
      .then(function () { toast('큐 순서를 저장했습니다.', 'success'); })
      .catch(function (e) { apiErr(e, '순서 저장 실패'); loadQueue(); });
  }

  // 예상시간 재계산 (큐 순서 기준 시작/종료 시각 재산정)
  window.eqqRecalc = function () {
    if (!eqqSelectedId) return;
    axios.post('/api/equipment-queue/' + encodeURIComponent(eqqSelectedId) + '/recalculate', {})
      .then(function (res) {
        var n = (res.data && res.data.data && res.data.data.updated) || 0;
        toast('예상시간 재계산 완료 (' + n + '건)', 'success');
        loadQueue();
        window.eqqLoad(); // 부하 그리드 총 예상시간 갱신
      })
      .catch(function (e) { apiErr(e, '예상시간 재계산 실패'); });
  };

  // 평균속도 갱신 (최근 30일 print_events → 장비별 분/㎡ 재계산)
  window.eqqUpdateAvgSpeed = function () {
    axios.post('/api/equipment-queue/update-avg-speed', {})
      .then(function (res) {
        var n = (res.data && res.data.data && res.data.data.updated) || 0;
        toast('평균 인쇄속도 갱신 완료 (' + n + '대)', 'success');
        window.eqqLoad();
      })
      .catch(function (e) { apiErr(e, '평균속도 갱신 실패'); });
  };

  // 딥링크(?tab=queue) 진입 대응: 이 스크립트가 파싱될 때 큐 탭이 이미 활성이면 자동 로드.
  // (equipment.js의 init이 먼저 파싱·실행되어 switchTab('queue')로 패널을 열지만,
  //  그 시점엔 window.eqqLoad가 아직 정의 전이라 여기서 한 번 더 확인)
  var eqqPanel0 = document.getElementById('panelQueue');
  if (eqqPanel0 && !eqqPanel0.classList.contains('hidden')) {
    window.eqqLoad();
  }
})();
