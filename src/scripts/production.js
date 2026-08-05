// ════════════════════════════════════════
// 생산 현황 통합 스크립트
// 탭 1: 현황 (KPI, 장비, 출력이력+페이지네이션, 7일 차트)
// 탭 2: 스케줄 (미배정 카드, 장비별 큐, 드래그&드롭)
// ════════════════════════════════════════

// ── 스케줄 탭 드래그&드롭 스타일 ──
(function() {
  var style = document.createElement('style');
  style.textContent = `
    .drag-over {
      background-color: #dbeafe !important;
      border: 2px dashed #3b82f6;
      border-radius: 0.375rem;
    }
    .schedule-card {
      transition: transform 0.1s, box-shadow 0.1s;
    }
    .schedule-card:hover {
      transform: translateY(-1px);
    }
  `;
  document.head.appendChild(style);
})();

// ════════════════
// 공통 유틸
// ════════════════

function fmtDur(sec) {
  if (!sec || sec <= 0) return '-';
  sec = Math.round(sec);
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  if (sec >= 3600) {
    var h = Math.floor(sec / 3600);
    m = Math.floor((sec % 3600) / 60);
    return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  return m + ':' + String(s).padStart(2, '0');
}

function fmtTime(iso) {
  if (!iso) return '-';
  var d = (window.toKstDate ? window.toKstDate(iso) : new Date(iso));
  if (!d || isNaN(d.getTime())) return '-';
  var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).reduce(function (a, x) { a[x.type] = x.value; return a; }, {});
  return p.month + '/' + p.day + ' ' + p.hour + ':' + p.minute;
}

function statusBadge(status) {
  if (status === 'OK') {
    return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">'
      + '<i class="fas fa-check-circle text-[7px] mr-1"></i>정상</span>';
  }
  if (status === 'ERROR') {
    return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">'
      + '<i class="fas fa-exclamation-triangle text-[7px] mr-1"></i>에러</span>';
  }
  if (status === 'CANCEL') {
    return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">'
      + '<i class="fas fa-ban text-[7px] mr-1"></i>취소</span>';
  }
  return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">'
    + '<i class="far fa-clock text-[7px] mr-1"></i>' + escapeHtml(status) + '</span>';
}

// ════════════════
// 탭 전환
// ════════════════

function switchProdTab(tab) {
  // N-탭 일반화 (현황/스케줄/작업실적). 패널·버튼 매핑 한 곳에서 관리.
  var TABS = {
    status:   { panel: 'tabStatus',   btn: 'tabBtnStatus' },
    schedule: { panel: 'tabSchedule', btn: 'tabBtnSchedule' },
    work:     { panel: 'tabWork',     btn: 'tabBtnWork' },
    link:     { panel: 'tabLink',     btn: 'tabBtnLink' }
  };

  Object.keys(TABS).forEach(function(key) {
    var t = TABS[key];
    var on = key === tab;
    var panel = document.getElementById(t.panel);
    if (panel) panel.classList.toggle('hidden', !on);
    var btn = document.getElementById(t.btn);
    if (!btn) return;
    btn.classList.toggle('border-blue-500', on);
    btn.classList.toggle('text-blue-600', on);
    btn.classList.toggle('border-transparent', !on);
    btn.classList.toggle('text-gray-500', !on);
  });

  if (tab === 'status') {
    // 현황 탭 데이터 로드
    loadStats();
    loadPrintingCards();
    loadAgents();
    loadRecentEvents();
  } else if (tab === 'schedule') {
    // 스케줄 탭 데이터 로드
    loadSchedule();
  } else if (tab === 'work') {
    // 작업실적 탭 (지연 초기화 — window.wrInit 는 하단 IIFE 에서 노출)
    if (window.wrInit) window.wrInit();
  } else if (tab === 'link') {
    loadUnmatchedFiles();
  }
}

window.switchProdTab = switchProdTab;

// ════════════════════════
// 탭 1: 현황
// ════════════════════════

// ── KPI 카드 + 일별 차트: /api/print-events/stats ──
async function loadStats() {
  try {
    var res = await axios.get('/api/print-events/stats?days=7');
    if (!res.data.success) return;
    var d = res.data.data;

    // 오늘 KPI
    var today = d.today || {};
    var okCount = today.ok_count || 0;
    var errCount = (today.error_count || 0) + (today.cancel_count || 0);
    document.getElementById('kpiOk').textContent = okCount.toLocaleString();
    document.getElementById('kpiError').textContent = errCount.toLocaleString();

    // 에러 카드 강조
    var errCard = document.getElementById('kpiErrorCard');
    if (errCount > 0) {
      errCard.classList.add('border-red-200');
      document.getElementById('kpiError').classList.add('text-red-600');
    }

    // 평균 인쇄시간: recent 이벤트에서 계산
    var recent = d.recent || [];
    var durations = recent
      .filter(function(e) { return e.print_duration_sec && e.print_duration_sec > 0 && e.print_status === 'OK'; })
      .map(function(e) { return e.print_duration_sec; });
    var avgDur = durations.length > 0
      ? durations.reduce(function(a, b) { return a + b; }, 0) / durations.length
      : 0;
    document.getElementById('kpiAvgDur').textContent = avgDur > 0 ? fmtDur(avgDur) : '-';

    // 일별 차트
    renderDailyChart(d.daily || []);
  } catch (e) {
    console.error('loadStats error:', e);
    document.getElementById('kpiOk').textContent = '-';
    document.getElementById('kpiError').textContent = '-';
    document.getElementById('kpiAvgDur').textContent = '-';
    document.getElementById('dailyChart').innerHTML =
      '<div class="text-center text-gray-400 text-sm py-4"><i class="fas fa-exclamation-circle mr-1"></i>데이터를 불러올 수 없습니다.</div>';
  }
}

// ── 진행중 카드: /api/cards?status=PRINTING ──
async function loadPrintingCards() {
  try {
    var res = await axios.get('/api/cards?status=PRINTING&limit=100');
    var cards = (res.data && res.data.data) || [];
    document.getElementById('kpiPrinting').textContent = cards.length.toLocaleString();
  } catch (e) {
    console.error('loadPrintingCards error:', e);
    document.getElementById('kpiPrinting').textContent = '-';
  }
}

// ── 장비 그룹화 헬퍼 (장비목록·필터 드롭다운 공유) ──
// 그룹 키 = location_zone 있으면 그것, 없으면 id의 '-' 앞 접두사
var productionEqList = [];        // 마지막 로드 장비 원본
var productionEqCollapsed = {};   // { groupKey: true } = 접힘 상태 유지
var productionAgentSelected = {}; // { equipmentId: true } = 다중장비 필터 선택

function productionEqGroupKey(eq) {
  var zone = (eq && eq.location_zone ? String(eq.location_zone).trim() : '');
  if (zone) return zone;
  var id = (eq && eq.id ? String(eq.id) : '');
  var dash = id.indexOf('-');
  return dash > 0 ? id.substring(0, dash) : (id || '기타');
}

// 장비 배열 → [{ key, items: [eq,...] }] (그룹명 오름차순, 그룹 내 name 오름차순)
function productionGroupEquipment(list) {
  var map = {};
  (list || []).forEach(function(eq) {
    if (!eq || !eq.id) return;
    var k = productionEqGroupKey(eq);
    if (!map[k]) map[k] = [];
    map[k].push(eq);
  });
  return Object.keys(map).sort(function(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }).map(function(k) {
    var items = map[k].slice().sort(function(a, b) {
      var na = (a.name || a.id || '').toLowerCase();
      var nb = (b.name || b.id || '').toLowerCase();
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
    return { key: k, items: items };
  });
}

// ── 장비 상태: /api/dashboard/equipment-load ──
async function loadAgents() {
  try {
    // 장비 중심: equipment 테이블 기반(PC 단위 agent_heartbeats 대신 장비 단위)
    var res = await axios.get('/api/dashboard/equipment-load');
    var agents = (res.data && res.data.data) || [];
    productionEqList = agents;
    var online = agents.filter(function(e){ return e.agent_status === 'ONLINE'; }).length;
    var offline = agents.length - online;

    // 요약
    var summaryEl = document.getElementById('agentSummary');
    if (summaryEl) {
      summaryEl.innerHTML =
        '<span class="inline-flex items-center gap-1 mr-2">'
        + '<i class="fas fa-circle text-green-500" style="font-size:6px;"></i>'
        + '<span>온라인 ' + online + '</span></span>'
        + '<span class="inline-flex items-center gap-1">'
        + '<i class="fas fa-circle text-red-400" style="font-size:6px;"></i>'
        + '<span>오프라인 ' + offline + '</span></span>';
    }

    // #343: 출력이력 장비 필터 옵션 채우기 (그룹화 체크박스)
    populateAgentFilter(agents);

    // 장비 목록: 공정·구역 그룹 아코디언 렌더
    productionRenderEquipment();
  } catch (e) {
    console.error('loadAgents error:', e);
    var el = document.getElementById('agentList');
    if (el) {
      el.innerHTML =
        '<div class="text-center py-4 text-gray-400 text-sm">'
        + '<i class="fas fa-exclamation-circle mr-1"></i>장비 미등록 또는 데이터 없음</div>';
    }
  }
}

function productionAgentCard(agent) {
  var isOnline = agent.agent_status === 'ONLINE';
  var borderCls = isOnline ? 'border-green-200' : 'border-gray-200';
  var dotCls = isOnline ? 'text-green-500' : 'text-gray-300';
  var statusLabel = isOnline ? '온라인' : '오프라인';
  var statusTextCls = isOnline ? 'text-green-600' : 'text-gray-400';
  var lastSeen = agent.last_seen_at ? fmtTime(agent.last_seen_at) : '미확인';
  var name = agent.name || agent.id || '장비';

  return '<div class="rounded-lg border ' + borderCls + ' p-2.5 text-center hover:shadow-sm transition-shadow">'
    + '<div class="text-[10px] font-semibold text-gray-700 truncate mb-1" title="' + escapeHtml(name) + '">' + escapeHtml(name) + '</div>'
    + '<div class="text-[10px] ' + statusTextCls + ' font-medium mb-0.5">'
    + '<i class="fas fa-circle ' + dotCls + ' mr-0.5" style="font-size:5px;"></i>' + statusLabel + '</div>'
    + '<div class="text-[9px] text-gray-300">' + lastSeen + '</div>'
    + '</div>';
}

// 장비 목록 아코디언 렌더 (즉시검색 필터 q 반영)
function productionRenderEquipment() {
  var listEl = document.getElementById('agentList');
  if (!listEl) { console.warn('[production] #agentList not found'); return; }

  if (!productionEqList || productionEqList.length === 0) {
    listEl.innerHTML =
      '<div class="text-center py-6 text-gray-400 text-sm">'
      + '<i class="fas fa-server text-2xl block mb-2 text-gray-200"></i>'
      + '등록된 장비가 없습니다.</div>';
    return;
  }

  var qEl = document.getElementById('eqQuickSearch');
  var q = qEl && qEl.value ? qEl.value.trim().toLowerCase() : '';

  var groups = productionGroupEquipment(productionEqList);
  var anyShown = false;

  var html = groups.map(function(g) {
    var matched = q
      ? g.items.filter(function(eq) {
          var name = (eq.name || '').toLowerCase();
          var id = (eq.id || '').toLowerCase();
          return name.indexOf(q) >= 0 || id.indexOf(q) >= 0;
        })
      : g.items;
    if (matched.length === 0) return ''; // 일치 없는 그룹 숨김
    anyShown = true;
    // 검색 중에는 강제 펼침, 아니면 저장된 접힘 상태
    var collapsed = !q && productionEqCollapsed[g.key];
    var cardsHtml = matched.map(function(eq) { return productionAgentCard(eq); }).join('');

    return '<div class="border border-gray-100 rounded-lg overflow-hidden">'
      + '<button type="button" onclick="productionToggleEqGroup(\'' + encodeURIComponent(g.key) + '\')" '
      + 'class="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left">'
      + '<span class="text-xs font-semibold text-gray-700">'
      + '<i class="fas fa-chevron-' + (collapsed ? 'right' : 'down') + ' text-gray-400 text-[9px] mr-1.5"></i>'
      + escapeHtml(g.key)
      + '<span class="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 text-[9px] font-medium">' + matched.length + '</span>'
      + '</span></button>'
      + '<div class="' + (collapsed ? 'hidden' : '') + ' grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 p-2">'
      + cardsHtml + '</div></div>';
  }).join('');

  if (!anyShown) {
    html = '<div class="text-center py-6 text-gray-400 text-sm">'
      + '<i class="fas fa-search text-2xl block mb-2 text-gray-200"></i>'
      + '검색 결과가 없습니다.</div>';
  }
  listEl.innerHTML = html;
}

function productionToggleEqGroup(encKey) {
  var key = decodeURIComponent(encKey);
  productionEqCollapsed[key] = !productionEqCollapsed[key];
  productionRenderEquipment();
}

function productionFilterEquipment() {
  productionRenderEquipment();
}

window.productionToggleEqGroup = productionToggleEqGroup;
window.productionFilterEquipment = productionFilterEquipment;

// ── 최근 출력 이벤트 (페이지네이션) ──
var eventsPage = 1;

async function loadRecentEvents() {
  var tbody = document.getElementById('recentEventsBody');
  tbody.innerHTML = '<tr><td colspan="7" class="px-3 py-4 text-center text-gray-400 text-sm">'
    + '<i class="fas fa-spinner fa-spin mr-1"></i>불러오는 중...</td></tr>';

  try {
    var url = '/api/print-events?page=' + eventsPage + '&limit=50';
    // #343: 출력이력 필터 (키워드/다중장비/상태/기간) — 라우트 기구현
    var kwEl = document.getElementById('evFilterKeyword');
    var sfEl = document.getElementById('evFilterStatus');
    var fromEl = document.getElementById('evFilterFrom');
    var toEl = document.getElementById('evFilterTo');
    // 다중 장비: 선택된 id들 콤마조인
    var eqIds = Object.keys(productionAgentSelected).filter(function(id) { return productionAgentSelected[id]; });
    if (kwEl && kwEl.value.trim()) url += '&q=' + encodeURIComponent(kwEl.value.trim());
    if (eqIds.length > 0) url += '&equipment_ids=' + encodeURIComponent(eqIds.join(','));
    if (sfEl && sfEl.value) url += '&status=' + encodeURIComponent(sfEl.value);
    if (fromEl && fromEl.value) url += '&from=' + encodeURIComponent(fromEl.value);
    if (toEl && toEl.value) url += '&to=' + encodeURIComponent(toEl.value);
    var res = await axios.get(url);
    if (!res.data.success) throw new Error('API 오류');

    var events = res.data.data || [];
    var pg = res.data.pagination || {};
    var total = pg.total || events.length;
    var totalPages = pg.total_pages || 1;
    var currentPage = pg.page || eventsPage;

    // 페이지네이션 UI 업데이트
    document.getElementById('eventsTotalCount').textContent = total.toLocaleString();
    document.getElementById('eventsCurrentPage').textContent = currentPage;
    document.getElementById('eventsTotalPages').textContent = totalPages;
    document.getElementById('eventsPrevBtn').disabled = currentPage <= 1;
    document.getElementById('eventsNextBtn').disabled = currentPage >= totalPages;

    if (events.length === 0) {
      // 필터(기본 7일 포함) 활성 시 안내 + 기간 해제 탈출버튼 — 이력이 사라진 걸로 오인 방지
      var hasFilter = (kwEl && kwEl.value.trim()) || eqIds.length > 0
        || (sfEl && sfEl.value) || (fromEl && fromEl.value) || (toEl && toEl.value);
      tbody.innerHTML =
        '<tr><td colspan="7" class="px-3 py-10 text-center">'
        + '<i class="fas fa-inbox text-3xl block mb-2 text-gray-200"></i>'
        + '<div class="text-sm text-gray-400">' + (hasFilter ? '조건에 맞는 출력 이력이 없습니다.' : '출력 이력이 없습니다.') + '</div>'
        + (hasFilter ? '<button onclick="productionShowAllEvents()" class="mt-2 px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50 border border-blue-200 rounded">전체 기간 보기</button>' : '')
        + '</td></tr>';
      return;
    }

    tbody.innerHTML = events.map(function(ev) {
      var timeStr = fmtTime(ev.print_completed_at || ev.created_at);
      var printerName = escapeHtml(ev.printer_name || ev.agent_id || '-');
      var fileName = escapeHtml(ev.file_name || '-');
      var shortFile = fileName.length > 28 ? fileName.substring(0, 28) + '…' : fileName;
      var rawW = ev.output_width ? parseFloat(ev.output_width) : 0;
      var rawH = ev.output_height ? parseFloat(ev.output_height) : 0;
      // mm → cm 변환 (100 이상이면 mm 단위로 판단)
      var cmW = rawW > 100 ? (rawW / 10).toFixed(1) : rawW > 0 ? rawW.toFixed(1) : '-';
      var cmH = rawH > 100 ? (rawH / 10).toFixed(1) : rawH > 0 ? rawH.toFixed(1) : '-';
      var sizeStr = (cmW !== '-' && cmH !== '-') ? cmW + '×' + cmH : '-';
      var durStr = fmtDur(ev.print_duration_sec);

      // 네스팅 멤버 (Flexi 자체 RIP 네스팅) — nest_members JSON 배열
      var nestMembers = [];
      try { if (ev.nest_members) nestMembers = JSON.parse(ev.nest_members) || []; } catch (e) { nestMembers = []; }
      var isNest = nestMembers.length > 0;

      // 출력정보 (타일/복수매/취소 실제매수)
      var layoutInfo = '';
      if (ev.tile_count > 0) {
        layoutInfo = '<span class="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">'
          + ev.tile_index + '/' + ev.tile_count + ' 타일</span>';
      } else if (ev.copy_total > 1) {
        layoutInfo = '<span class="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">'
          + ev.copy_columns + '×' + ev.copy_rows + ' (' + ev.copy_total + '매)</span>';
        if (ev.print_status === 'CANCEL') {
          if (ev.actual_printed !== null && ev.actual_printed !== undefined) {
            layoutInfo += '<br><span class="text-[10px] text-orange-600">'
              + '<i class="fas fa-check mr-0.5"></i>실제 ' + ev.actual_printed + '매 (' + escapeHtml(ev.actual_printed_by) + ')</span>';
          } else {
            layoutInfo += '<br><button onclick="showActualPrintedInput(' + ev.id + ', ' + ev.copy_total + ')" '
              + 'class="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded hover:bg-orange-200 mt-1">'
              + '<i class="fas fa-edit mr-1"></i>매수 입력</button>';
          }
        }
      } else if (isNest) {
        var nestQtyTotal = nestMembers.reduce(function (s, m) {
          return s + ((m && typeof m === 'object' && m.qty) ? m.qty : 1);
        }, 0);
        layoutInfo = '<span class="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">'
          + '<i class="fas fa-layer-group mr-0.5"></i>네스팅 ' + nestMembers.length + '종'
          + (nestQtyTotal !== nestMembers.length ? ' (총 ' + nestQtyTotal + '장)' : '') + '</span>';
      } else {
        layoutInfo = '<span class="text-[10px] text-gray-400">1매</span>';
      }

      // 파일 셀: 네스트면 멤버 목록 펼치기(<details>), 아니면 파일명
      var fileTd;
      if (isNest) {
        var memberLis = nestMembers.map(function (m) {
          var isObj = m && typeof m === 'object';
          var full = isObj ? String(m.file || '') : String(m);
          var base = full.split(/[\\\/]/).pop();
          var meta = '';
          if (isObj) {
            var dim = (m.w && m.h) ? ' <span class="text-gray-400">' + (m.w / 10).toFixed(1) + '×' + (m.h / 10).toFixed(1) + 'cm</span>' : '';
            var q = (m.qty && m.qty > 1) ? ' <span class="text-purple-600 font-medium">×' + m.qty + '</span>' : '';
            // 멤버별 카드 귀속 — 합판은 판 1개에 주문 N건이라 어느 멤버가 안 붙었는지 보여야
            // '출력파일 연결' 탭에서 회수할 수 있다 (card_number 는 이벤트 수신 시점 기록)
            var link = m.card_number
              ? ' <span class="text-[10px] bg-green-50 text-green-700 px-1 py-0.5 rounded">' + escapeHtml(m.card_number) + '</span>'
              : ' <span class="text-[10px] bg-orange-50 text-orange-700 px-1 py-0.5 rounded">미연결</span>';
            meta = dim + q + link;
          }
          return '<li class="truncate" title="' + escapeHtml(full) + '">' + escapeHtml(base) + meta + '</li>';
        }).join('');
        fileTd = '<td class="px-3 py-2.5 text-xs text-gray-600" style="max-width:320px">'
          + '<details class="cursor-pointer">'
          + '<summary class="text-purple-700 font-medium select-none">'
          + '<i class="fas fa-layer-group mr-1"></i>' + fileName + '</summary>'
          + '<ol class="mt-1 ml-4 list-decimal text-[11px] text-gray-600 space-y-0.5 max-h-56 overflow-auto">'
          + memberLis + '</ol></details></td>';
      } else {
        fileTd = '<td class="px-3 py-2.5 text-xs text-gray-600 truncate" style="max-width:240px" title="' + fileName + '">' + fileName + '</td>';
      }

      return '<tr class="hover:bg-blue-50/30 border-b border-gray-100 transition-colors align-middle">'
        + '<td class="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">' + timeStr + '</td>'
        + '<td class="px-3 py-2.5 text-xs font-medium text-gray-700 whitespace-nowrap">' + printerName + '</td>'
        + fileTd
        + '<td class="px-3 py-2.5 text-xs tabular-nums text-gray-600 whitespace-nowrap">' + sizeStr + '</td>'
        + '<td class="px-3 py-2.5 text-xs tabular-nums text-gray-500 whitespace-nowrap">' + durStr + '</td>'
        + '<td class="px-3 py-2.5">' + layoutInfo + '</td>'
        + '<td class="px-3 py-2.5">' + statusBadge(ev.print_status) + '</td>'
        + '</tr>';
    }).join('');
  } catch (e) {
    console.error('loadRecentEvents error:', e);
    tbody.innerHTML =
      '<tr><td colspan="7" class="px-3 py-6 text-center text-red-400 text-sm">'
      + '<i class="fas fa-exclamation-circle mr-1"></i>이력을 불러올 수 없습니다.</td></tr>';
  }
}

function changeEventsPage(delta) {
  eventsPage += delta;
  if (eventsPage < 1) eventsPage = 1;
  loadRecentEvents();
}

window.changeEventsPage = changeEventsPage;

// ── #343: 출력이력 필터 (키워드/다중장비/상태/기간) ──
// 다중 장비 체크박스 패널 채우기 (그룹화 — 장비목록과 동일 헬퍼 공유)
function populateAgentFilter(agents) {
  var box = document.getElementById('evAgentCheckboxes');
  if (!box) { console.warn('[production] #evAgentCheckboxes not found'); return; }

  // 더 이상 존재하지 않는 장비의 선택상태 정리
  var validIds = {};
  (agents || []).forEach(function(a) { if (a && a.id) validIds[a.id] = true; });
  Object.keys(productionAgentSelected).forEach(function(id) {
    if (!validIds[id]) delete productionAgentSelected[id];
  });

  var groups = productionGroupEquipment(agents);
  box.innerHTML = groups.map(function(g) {
    var items = g.items.map(function(eq) {
      var checked = productionAgentSelected[eq.id] ? ' checked' : '';
      var name = eq.name || eq.id;
      return '<label class="flex items-center gap-1.5 py-0.5 pl-3 cursor-pointer hover:bg-gray-50 rounded" title="' + escapeHtml(name) + ' (' + escapeHtml(eq.id) + ')">'
        + '<input type="checkbox" class="ev-agent-cb" value="' + escapeHtml(eq.id) + '"' + checked
        + ' onchange="productionOnAgentCheck(this.value, this.checked)">'
        + '<span class="truncate">' + escapeHtml(name) + '</span></label>';
    }).join('');
    return '<div class="mb-1">'
      + '<div class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-1 mt-1">' + escapeHtml(g.key) + '</div>'
      + items + '</div>';
  }).join('');

  productionSyncAgentLabel();
}

// 개별 체크박스 토글
function productionOnAgentCheck(id, checked) {
  if (checked) productionAgentSelected[id] = true;
  else delete productionAgentSelected[id];
  productionSyncAgentLabel();
  applyEventFilters();
}

// '전체' 토글
function productionToggleAllAgents(checked) {
  if (checked) {
    (productionEqList || []).forEach(function(eq) { if (eq && eq.id) productionAgentSelected[eq.id] = true; });
  } else {
    productionAgentSelected = {};
  }
  // 체크박스 UI 동기화
  document.querySelectorAll('.ev-agent-cb').forEach(function(cb) { cb.checked = checked; });
  productionSyncAgentLabel();
  applyEventFilters();
}

// 버튼 라벨 + '전체' 체크박스 상태 동기화
function productionSyncAgentLabel() {
  var n = Object.keys(productionAgentSelected).filter(function(id) { return productionAgentSelected[id]; }).length;
  var labelEl = document.getElementById('evAgentDropdownLabel');
  if (labelEl) labelEl.textContent = n === 0 ? '전체 장비' : '장비 ' + n;
  var allEl = document.getElementById('evAgentSelectAll');
  var total = (productionEqList || []).length;
  if (allEl) allEl.checked = total > 0 && n === total;
}

function productionToggleAgentDropdown() {
  var panel = document.getElementById('evAgentDropdownPanel');
  if (!panel) { console.warn('[production] #evAgentDropdownPanel not found'); return; }
  panel.classList.toggle('hidden');
}

// 패널 바깥 클릭 시 닫기
document.addEventListener('click', function(e) {
  var wrap = document.getElementById('evAgentDropdownWrap');
  var panel = document.getElementById('evAgentDropdownPanel');
  if (!wrap || !panel || panel.classList.contains('hidden')) return;
  if (!wrap.contains(e.target)) panel.classList.add('hidden');
});

function applyEventFilters() {
  eventsPage = 1;
  loadRecentEvents();
}

// 키워드 입력 디바운스 (300ms) + Enter 즉시
var productionKeywordTimer = null;
function productionBindKeyword() {
  var kwEl = document.getElementById('evFilterKeyword');
  if (!kwEl) { console.warn('[production] #evFilterKeyword not found'); return; }
  if (kwEl.dataset.bound) return; // 중복 바인딩 방지
  kwEl.dataset.bound = '1';
  kwEl.addEventListener('input', function() {
    if (productionKeywordTimer) clearTimeout(productionKeywordTimer);
    productionKeywordTimer = setTimeout(applyEventFilters, 300);
  });
  kwEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      if (productionKeywordTimer) clearTimeout(productionKeywordTimer);
      applyEventFilters();
    }
  });
}

// 기간 필터 기본값: 최근 7일(오늘 포함, KST) — 이력 누적 시 초기 전체조회 방지
function productionApplyDefaultEventDates() {
  var fromEl = document.getElementById('evFilterFrom');
  if (!fromEl) { console.warn('[production] #evFilterFrom not found'); return; }
  var d = new Date(Date.now() - 6 * 86400000);
  fromEl.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  var toEl = document.getElementById('evFilterTo');
  if (!toEl) { console.warn('[production] #evFilterTo not found'); return; }
  var today = new Date();
  toEl.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today);
}

function resetEventFilters() {
  ['evFilterKeyword', 'evFilterStatus', 'evFilterTo'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  productionApplyDefaultEventDates();
  productionAgentSelected = {};
  document.querySelectorAll('.ev-agent-cb').forEach(function(cb) { cb.checked = false; });
  var allEl = document.getElementById('evAgentSelectAll');
  if (allEl) allEl.checked = false;
  productionSyncAgentLabel();
  applyEventFilters();
}

// 빈 결과 탈출버튼: 기간 필터만 해제(키워드·장비·상태는 사용자가 의도 설정한 것이라 유지)
function productionShowAllEvents() {
  ['evFilterFrom', 'evFilterTo'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  applyEventFilters();
}

window.applyEventFilters = applyEventFilters;
window.resetEventFilters = resetEventFilters;
window.productionShowAllEvents = productionShowAllEvents;
window.productionOnAgentCheck = productionOnAgentCheck;
window.productionToggleAllAgents = productionToggleAllAgents;
window.productionToggleAgentDropdown = productionToggleAgentDropdown;

// ── 실제 출력매수 입력 ──
async function showActualPrintedInput(eventId, copyTotal) {
  var input = prompt('실제 출력된 매수를 입력하세요 (전체 ' + copyTotal + '매 중):', '');
  if (input === null) return;
  var num = parseInt(input);
  if (isNaN(num) || num < 0 || num > copyTotal) {
    showToast('0 ~ ' + copyTotal + ' 사이의 숫자를 입력하세요.', 'warning');
    return;
  }
  try {
    var resp = await axios.patch('/api/print-events/' + eventId + '/actual-printed', {
      actual_printed: num
    });
    if (resp.data.success) {
      showToast('저장되었습니다: ' + num + '매', 'success');
      loadRecentEvents();
    }
  } catch (err) {
    showToast('저장 실패: ' + (err.response ? err.response.data.error : err.message), 'error');
  }
}

window.showActualPrintedInput = showActualPrintedInput;

// ── 일별 차트 렌더링 ──
function renderDailyChart(daily) {
  var chartEl = document.getElementById('dailyChart');

  if (!daily || daily.length === 0) {
    chartEl.innerHTML =
      '<div class="text-center text-gray-400 text-sm py-6">'
      + '<i class="fas fa-chart-bar text-3xl block mb-2 text-gray-200"></i>'
      + '7일 이내 출력 데이터가 없습니다.</div>';
    return;
  }

  var sorted = daily.slice().sort(function(a, b) {
    return a.date < b.date ? -1 : 1;
  });
  var maxTotal = Math.max.apply(null, sorted.map(function(d) {
    return (d.ok_count || 0) + (d.error_count || 0) + (d.cancel_count || 0);
  }));
  if (maxTotal === 0) maxTotal = 1;

  chartEl.innerHTML = sorted.map(function(d) {
    var ok = d.ok_count || 0;
    var bad = (d.error_count || 0) + (d.cancel_count || 0);
    var total = ok + bad;
    var okPct = Math.round(ok / maxTotal * 100);
    var badPct = Math.round(bad / maxTotal * 100);
    var dateLabel = d.date ? d.date.substring(5) : '';

    return '<div class="flex items-center gap-2 text-[11px]">'
      + '<span class="w-12 text-gray-500 text-right flex-shrink-0">' + dateLabel + '</span>'
      + '<div class="flex-1 flex rounded-sm overflow-hidden h-5 bg-gray-100">'
      + (okPct > 0
          ? '<div class="bg-green-500 h-5 flex items-center justify-end pr-1 text-[9px] text-white font-medium" style="width:' + okPct + '%">'
            + (okPct >= 12 ? ok : '') + '</div>'
          : '')
      + (badPct > 0
          ? '<div class="bg-red-400 h-5 flex items-center justify-end pr-1 text-[9px] text-white font-medium" style="width:' + badPct + '%">'
            + (badPct >= 12 ? bad : '') + '</div>'
          : '')
      + '</div>'
      + '<span class="w-8 text-right text-gray-400 flex-shrink-0">' + total + '</span>'
      + '</div>';
  }).join('');
}

// ════════════════════════
// 탭 2: 스케줄
// ════════════════════════

var draggedCard = null;
var draggedFromEquipment = null;

function getUrgencyInfo(deliveryDate) {
  if (!deliveryDate) return { class: '', label: '', badge: 'bg-gray-200 text-gray-700' };
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var due = new Date(deliveryDate);
  due.setHours(0, 0, 0, 0);
  var diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

  if (diff < 0) return { class: 'border-l-4 border-red-500 bg-red-50', label: 'D+' + Math.abs(diff), badge: 'bg-red-600 text-white' };
  if (diff === 0) return { class: 'border-l-4 border-red-400 bg-red-50', label: 'D-Day', badge: 'bg-red-500 text-white' };
  if (diff === 1) return { class: 'border-l-4 border-orange-400 bg-orange-50', label: 'D-1', badge: 'bg-orange-500 text-white' };
  if (diff <= 3) return { class: 'border-l-4 border-amber-400', label: 'D-' + diff, badge: 'bg-amber-500 text-white' };
  return { class: '', label: 'D-' + diff, badge: 'bg-gray-200 text-gray-700' };
}

function schedFormatDate(d) {
  if (!d) return '-';
  return d.substring(5, 10);
}

function renderCard(card) {
  var urgency = getUrgencyInfo(card.delivery_date);
  var ripBadge = card.rip_status === 'QUEUED'
    ? '<span class="text-[10px] bg-blue-50 text-blue-700 px-1 rounded">QUEUED</span>'
    : card.rip_status === 'SENT'
    ? '<span class="text-[10px] bg-green-50 text-green-700 px-1 rounded">SENT</span>'
    : '';

  return '<div class="schedule-card bg-white rounded shadow-sm p-2 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ' + urgency.class + '"'
    + ' draggable="true" data-card-id="' + card.id + '" data-priority="' + (card.priority || 0) + '">'
    + '<div class="flex items-center justify-between mb-1">'
    + '<span class="text-[11px] font-mono text-gray-500">' + escapeHtml(card.card_number) + '</span>'
    + '<span class="text-[10px] px-1.5 py-0.5 rounded ' + urgency.badge + '">' + urgency.label + '</span>'
    + '</div>'
    + '<div class="text-xs font-medium text-gray-800 truncate" title="' + escapeHtml(card.client_name) + '">' + escapeHtml(card.client_name) + '</div>'
    + '<div class="text-[11px] text-gray-500 truncate" title="' + escapeHtml(card.item_name) + '">' + escapeHtml(card.item_name) + '</div>'
    + '<div class="flex items-center justify-between mt-1">'
    + '<span class="text-[10px] text-gray-400">' + escapeHtml(card.category_name || '') + '</span>'
    + '<div class="flex items-center gap-1">' + ripBadge
    + '<span class="text-[10px] text-gray-400">' + schedFormatDate(card.delivery_date) + '</span>'
    + '</div></div>'
    + '<div class="flex items-center justify-between mt-1">'
    + '<span class="text-[10px] text-gray-400">P:' + (card.priority || 0) + '</span>'
    + '<div class="flex gap-1">'
    + '<button onclick="event.stopPropagation(); changePriority(' + card.id + ', 1)" class="text-[10px] text-gray-400 hover:text-blue-600 px-1" title="우선순위 올리기"><i class="fas fa-arrow-up"></i></button>'
    + '<button onclick="event.stopPropagation(); changePriority(' + card.id + ', -1)" class="text-[10px] text-gray-400 hover:text-blue-600 px-1" title="우선순위 내리기"><i class="fas fa-arrow-down"></i></button>'
    + '</div></div></div>';
}

function renderEquipmentColumn(eq) {
  // 장비상태 라벨·색 = MES_STATUS 'equip' SSOT (utils/statusLabels.ts)
  var statusClass = window.MES_STATUS.chipClass('equip', eq.equipment_status);
  var statusLabel = window.MES_STATUS.equipLabel(eq.equipment_status || 'IDLE');

  var capacity = eq.daily_capacity || 0;
  var count = eq.queue_count || 0;
  var isOverloaded = capacity > 0 && count > capacity;

  var loadBar = capacity > 0
    ? '<div class="mt-2">'
      + '<div class="flex justify-between text-[10px] text-gray-500 mb-0.5">'
      + '<span>' + count + ' / ' + capacity + '</span>'
      + '<span>' + Math.round((count / capacity) * 100) + '%</span></div>'
      + '<div class="w-full bg-gray-200 rounded-full h-1.5">'
      + '<div class="h-1.5 rounded-full ' + (isOverloaded ? 'bg-red-500' : count / capacity > 0.7 ? 'bg-amber-500' : 'bg-green-500') + '"'
      + ' style="width:' + Math.min(100, Math.round((count / capacity) * 100)) + '%"></div></div></div>'
    : '<div class="text-[10px] text-gray-400 mt-1">' + count + '건 대기 (용량 미설정)</div>';

  var onlineIcon = eq.agent_status === 'ONLINE'
    ? '<span class="w-2 h-2 bg-green-500 rounded-full inline-block" title="온라인"></span>'
    : '<span class="w-2 h-2 bg-gray-300 rounded-full inline-block" title="오프라인"></span>';

  var cardsHtml = (eq.cards || []).map(function(c) { return renderCard(c); }).join('');

  return '<div class="flex-shrink-0 w-72 bg-white rounded-lg shadow">'
    + '<div class="p-3 border-b ' + (isOverloaded ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200') + ' rounded-t-lg">'
    + '<div class="flex items-center justify-between mb-1">'
    + '<div class="flex items-center gap-1.5">' + onlineIcon
    + '<h3 class="font-bold text-sm text-gray-800">' + escapeHtml(eq.name) + '</h3></div>'
    + '<span class="text-[10px] px-1.5 py-0.5 rounded ' + statusClass + '">' + statusLabel + '</span>'
    + '</div>'
    + '<div class="flex items-center justify-between">'
    + '<span class="text-[10px] text-gray-400">' + escapeHtml(eq.location_zone || '') + '</span>'
    + '<button onclick="editCapacity(\'' + escapeHtml(eq.id) + '\', ' + capacity + ')" class="text-[10px] text-blue-500 hover:text-blue-700" title="용량 설정">'
    + '<i class="fas fa-cog"></i> 용량</button>'
    + '</div>' + loadBar + '</div>'
    + '<div class="schedule-drop-zone p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-300px)] overflow-y-auto"'
    + ' data-equipment-id="' + escapeHtml(eq.id) + '">'
    + (cardsHtml || '<div class="text-center text-gray-300 py-4 text-xs">카드 없음</div>')
    + '</div></div>';
}

async function loadSchedule() {
  try {
    var results = await Promise.all([
      axios.get('/api/cards/schedule/queues'),
      axios.get('/api/cards/schedule/unassigned')
    ]);
    var queues = results[0].data.data || [];
    var unassigned = results[1].data.data || [];

    // 통계 업데이트
    var totalQueue = queues.reduce(function(s, eq) { return s + (eq.queue_count || 0); }, 0);
    var overloaded = queues.filter(function(eq) { return eq.daily_capacity > 0 && eq.queue_count > eq.daily_capacity; }).length;
    var allCards = unassigned.concat(queues.reduce(function(acc, eq) { return acc.concat(eq.cards || []); }, []));
    // KST 기준 오늘 — toISOString()은 UTC라 KST 00~09시 사이 전날로 어긋남(#366 정책). kstToday 헬퍼 사용.
    var todayStr = (window.kstToday ? window.kstToday() : new Date().toISOString().substring(0, 10));
    var todayDue = allCards.filter(function(c) {
      return c.delivery_date && c.delivery_date.substring(0, 10) <= todayStr;
    }).length;

    document.getElementById('statTotalQueue').textContent = totalQueue;
    document.getElementById('statUnassigned').textContent = unassigned.length;
    document.getElementById('statTodayDue').textContent = todayDue;
    document.getElementById('statOverloaded').textContent = overloaded;

    // 미배정 카드
    var unassignedEl = document.getElementById('unassignedCards');
    document.getElementById('unassignedCount').textContent = '(' + unassigned.length + ')';
    if (unassigned.length === 0) {
      unassignedEl.innerHTML = '<div class="text-center text-gray-400 py-4 text-xs">미배정 카드 없음</div>';
    } else {
      unassignedEl.innerHTML = unassigned.map(function(c) { return renderCard(c); }).join('');
    }

    // 장비 칼럼
    var columnsEl = document.getElementById('equipmentColumns');
    if (queues.length === 0) {
      columnsEl.innerHTML = '<div class="text-center text-gray-400 py-8 text-sm">등록된 장비가 없습니다</div>';
    } else {
      columnsEl.innerHTML = queues.map(function(eq) { return renderEquipmentColumn(eq); }).join('');
    }

    // 드래그&드롭: 스케줄 탭이 보일 때만
    if (!document.getElementById('tabSchedule').classList.contains('hidden')) {
      setupDragDrop();
    }
  } catch (error) {
    console.error('Schedule load error:', error);
  }
}

function setupDragDrop() {
  document.querySelectorAll('.schedule-card').forEach(function(card) {
    card.addEventListener('dragstart', function(e) {
      draggedCard = e.target.closest('.schedule-card');
      draggedFromEquipment = (draggedCard.closest('[data-equipment-id]') || {}).dataset
        ? draggedCard.closest('[data-equipment-id]').dataset.equipmentId
        : '';
      draggedCard.classList.add('opacity-50');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedCard.dataset.cardId);
    });

    card.addEventListener('dragend', function() {
      if (draggedCard) draggedCard.classList.remove('opacity-50');
      draggedCard = null;
      draggedFromEquipment = null;
      document.querySelectorAll('.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
    });
  });

  document.querySelectorAll('.schedule-drop-zone, #unassignedCards').forEach(function(zone) {
    zone.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', function(e) {
      if (!zone.contains(e.relatedTarget)) {
        zone.classList.remove('drag-over');
      }
    });

    zone.addEventListener('drop', async function(e) {
      e.preventDefault();
      zone.classList.remove('drag-over');
      var cardId = e.dataTransfer.getData('text/plain');
      var targetEquipment = zone.dataset.equipmentId;
      if (!cardId) return;
      if (targetEquipment === draggedFromEquipment) return;
      try {
        await axios.put('/api/cards/schedule/assign/' + cardId, {
          equipment_id: targetEquipment || null
        });
        await loadSchedule();
      } catch (error) {
        showToast('장비 배정 실패: ' + (error.response && error.response.data ? error.response.data.error : error.message), 'error');
      }
    });
  });
}

// ── 우선순위 변경 ──
window.changePriority = async function(cardId, delta) {
  var card = document.querySelector('[data-card-id="' + cardId + '"]');
  if (!card) return;
  var currentPriority = parseInt(card.dataset.priority) || 0;
  var newPriority = Math.max(0, Math.min(99, currentPriority + delta * 10));
  if (newPriority === currentPriority) return;
  try {
    await axios.put('/api/cards/schedule/priority/' + cardId, { priority: newPriority });
    await loadSchedule();
  } catch (error) {
    showToast('우선순위 변경 실패: ' + (error.response && error.response.data ? error.response.data.error : error.message), 'error');
  }
};

// ── 용량 설정 ──
window.editCapacity = async function(equipmentId, currentCapacity) {
  var input = prompt('일일 처리 용량 설정 (0 = 무제한)\n현재: ' + currentCapacity, currentCapacity);
  if (input === null) return;
  var capacity = parseInt(input);
  if (isNaN(capacity) || capacity < 0) {
    showToast('0 이상의 숫자를 입력해주세요.', 'warning');
    return;
  }
  try {
    await axios.put('/api/rip/equipment/' + equipmentId + '/capacity', { daily_capacity: capacity });
    await loadSchedule();
  } catch (error) {
    showToast('용량 설정 실패: ' + (error.response && error.response.data ? error.response.data.error : error.message), 'error');
  }
};

// ════════════════
// 초기 로드
// ════════════════
// 배치도 팝오버 등에서 ?equipment_ids=ID 로 진입 시 해당 장비로 출력이력 사전 필터.
// (loadAgents 가 populateAgentFilter 에서 productionAgentSelected 로 checked 판단 → 미리 세팅)
(function productionInitEquipmentDeepLink() {
  try {
    var ids = new URLSearchParams(window.location.search).get('equipment_ids');
    if (ids) ids.split(',').forEach(function(id) { id = id.trim(); if (id) productionAgentSelected[id] = true; });
  } catch (e) { /* ignore */ }
})();
productionBindKeyword();
productionApplyDefaultEventDates(); // 출력이력 기간 기본값(최근 7일) — loadRecentEvents 전 적용
loadStats();
loadPrintingCards();
loadAgents();
loadRecentEvents();

// ════════════════════════════════════════
// 탭 3: 작업 실적 입력 (work_records — 비프린터 공정 작업자 실적)
// 백엔드 routes/production.ts (production_logs·work_records) 활성화 UI
// ?raw 전역 스코프 충돌 방지: 전부 IIFE 로컬 + window.wr* 만 노출
// ════════════════════════════════════════
(function () {
  var wrEsc = window.escapeHtml || function (s) { return s == null ? '' : String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  var wrToast = function (m, t) { if (window.showToast) window.showToast(m, t); else console.log('[production/work]', m); };
  var wrApiErr = function (e, m) { if (window.handleApiError) window.handleApiError(e, m); else { console.error(m, e); wrToast(m, 'error'); } };
  var wrFmtDate = function (s) { return s ? String(s).slice(0, 10) : ''; };

  var WORK_TYPE = { PRINT: '인쇄', POST_PROCESS: '후가공', SEWING: '봉제', PACKING: '포장', QC: '검사', OTHER: '기타' };
  var STATUS_LABEL = { IN_PROGRESS: '진행중', COMPLETED: '완료', PAUSED: '일시중지' };

  var wrInited = false;
  var wrPicked = { id: null, label: '' };   // 선택된 카드
  var wrSearchResults = [];                 // 카드 검색결과(인덱스 참조로 onclick 이스케이프 회피)

  function wrVal(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function wrNum(id, dflt) { var el = document.getElementById(id); if (!el || el.value === '') return dflt; var n = Number(el.value); return isNaN(n) ? dflt : n; }
  function wrSet(id, v) { var el = document.getElementById(id); if (el) el.value = v; }

  function wrBadge(text, cls) { return '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ' + cls + '">' + wrEsc(text) + '</span>'; }
  function wrStatusBadge(s) {
    var cls = s === 'COMPLETED' ? 'bg-green-50 text-green-700' : s === 'PAUSED' ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-700';
    return wrBadge(STATUS_LABEL[s] || s || '-', cls);
  }

  // ── 직원 드롭다운 (ACTIVE만) ──
  function wrLoadEmployees() {
    var sel = document.getElementById('wrEmployee');
    if (!sel) { console.warn('[production/work] #wrEmployee not found'); return Promise.resolve(); }
    return axios.get('/api/hr/employees', { params: { limit: 200, status: 'ACTIVE' } }).then(function (res) {
      var d = (res.data && res.data.data) || {};
      var emps = d.employees || (Array.isArray(d) ? d : []);
      sel.innerHTML = '<option value="">작업자 선택</option>' + emps.map(function (e) {
        var label = (e.name || '') + (e.employee_code ? ' (' + e.employee_code + ')' : '');
        return '<option value="' + e.id + '">' + wrEsc(label) + '</option>';
      }).join('');
    }).catch(function (e) {
      wrApiErr(e, '작업자 목록 로드 실패');
      sel.innerHTML = '<option value="">로드 실패</option>';
    });
  }

  // ── 카드 검색/선택 (/api/search 재사용) ──
  window.wrSearchCard = function () {
    var q = document.getElementById('wrCardSearch');
    var box = document.getElementById('wrCardResults');
    if (!q || !box || !q.value.trim()) return;
    axios.get('/api/search?q=' + encodeURIComponent(q.value.trim())).then(function (res) {
      wrSearchResults = (res.data && res.data.data && res.data.data.cards) || [];
      if (!wrSearchResults.length) { box.innerHTML = '<div class="text-gray-400 py-1 text-xs">검색 결과 없음</div>'; return; }
      box.innerHTML = wrSearchResults.map(function (ca, i) {
        return '<div class="py-1 px-1 hover:bg-blue-50 cursor-pointer rounded text-xs" onclick="window.wrPickCard(' + i + ')">' +
          '<span class="font-mono">' + wrEsc(ca.card_number) + '</span> · ' + wrEsc(ca.client_name || '') + '</div>';
      }).join('');
    }).catch(function (e) { wrApiErr(e, '카드 검색 실패'); });
  };

  window.wrPickCard = function (i) {
    var ca = wrSearchResults[i];
    if (!ca) return;
    wrPicked = { id: ca.id, label: ca.card_number };
    var pk = document.getElementById('wrCardPicked');
    if (pk) pk.innerHTML = '<i class="fas fa-check mr-1"></i>선택: ' + wrEsc(ca.card_number) + (ca.client_name ? ' (' + wrEsc(ca.client_name) + ')' : '');
    var box = document.getElementById('wrCardResults'); if (box) box.innerHTML = '';
  };

  // ── 생산일지 find-or-create (날짜+근무조, 기존 엔드포인트만 사용) ──
  function wrEnsureLog(date, shift) {
    return axios.get('/api/production/logs', { params: { start_date: date, end_date: date, shift: shift, limit: 10 } }).then(function (res) {
      var logs = (res.data && res.data.data && res.data.data.logs) || [];
      for (var i = 0; i < logs.length; i++) {
        if (String(logs[i].log_date).slice(0, 10) === date && logs[i].shift === shift) return logs[i].id;
      }
      return axios.post('/api/production/logs', { log_date: date, shift: shift }).then(function (cr) {
        return cr.data && cr.data.data && cr.data.data.id;
      });
    });
  }

  // ── 실적 등록 ──
  window.wrSubmit = function () {
    var date = wrVal('wrDate');
    var shift = wrVal('wrShift') || 'DAY';
    var empId = wrVal('wrEmployee');
    var workType = wrVal('wrType') || 'POST_PROCESS';
    if (!date) { wrToast('날짜를 선택하세요', 'error'); return; }
    if (!empId) { wrToast('작업자를 선택하세요', 'error'); return; }
    if (!wrPicked.id) { wrToast('카드를 선택하세요', 'error'); return; }

    var startT = wrVal('wrStart');
    var endT = wrVal('wrEnd');
    var start_time = date + 'T' + (startT || '09:00') + ':00';
    var end_time = endT ? (date + 'T' + endT + ':00') : null;

    var payload = {
      card_id: wrPicked.id,
      employee_id: Number(empId),
      work_type: workType,
      start_time: start_time,
      end_time: end_time,
      quantity_target: wrNum('wrTarget', null),
      quantity_completed: wrNum('wrCompleted', 0),
      status: wrVal('wrStatus') || 'COMPLETED',
      notes: wrVal('wrNotes') || null
    };

    var btn = document.getElementById('wrSubmitBtn');
    if (btn) btn.disabled = true;

    wrEnsureLog(date, shift).then(function (logId) {
      if (!logId) throw new Error('생산일지 생성 실패');
      payload.production_log_id = logId;
      return axios.post('/api/production/work-records', payload);
    }).then(function () {
      wrToast('작업 실적이 등록되었습니다', 'success');
      wrResetForm();
      window.wrLoadRecords();
    }).catch(function (e) {
      wrApiErr(e, '작업 실적 등록 실패');
    }).then(function () {
      if (btn) btn.disabled = false;
    });
  };

  function wrResetForm() {
    wrPicked = { id: null, label: '' };
    wrSearchResults = [];
    ['wrCardSearch', 'wrNotes', 'wrTarget', 'wrStart', 'wrEnd'].forEach(function (id) { wrSet(id, ''); });
    wrSet('wrCompleted', '0');
    var box = document.getElementById('wrCardResults'); if (box) box.innerHTML = '';
    var pk = document.getElementById('wrCardPicked'); if (pk) pk.innerHTML = '';
  }

  // ── 최근 실적 목록 ──
  window.wrLoadRecords = function () {
    var body = document.getElementById('wrRecordsBody');
    if (!body) { console.warn('[production/work] #wrRecordsBody not found'); return; }
    var stEl = document.getElementById('wrFilterStatus');
    var params = { limit: 50 };
    if (stEl && stEl.value) params.status = stEl.value;
    axios.get('/api/production/work-records', { params: params }).then(function (res) {
      var rows = (res.data && res.data.data && res.data.data.work_records) || [];
      if (!rows.length) { body.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">작업 실적이 없습니다.</td></tr>'; return; }
      body.innerHTML = rows.map(function (r) {
        var emp = (r.employee_name || '-') + (r.employee_code ? ' (' + r.employee_code + ')' : '');
        return '<tr>' +
          '<td class="col-date text-[11px]">' + wrFmtDate(r.log_date) + '</td>' +
          '<td>' + wrEsc(emp) + '</td>' +
          '<td>' + wrEsc(WORK_TYPE[r.work_type] || r.work_type || '-') + '</td>' +
          '<td class="col-code font-mono text-[11px]">' + wrEsc(r.card_number || '-') + '</td>' +
          '<td class="text-right tabular-nums">' + (r.quantity_target != null ? r.quantity_target : '-') + '</td>' +
          '<td class="text-right tabular-nums">' + (r.quantity_completed != null ? r.quantity_completed : 0) + '</td>' +
          '<td>' + wrStatusBadge(r.status) + '</td>' +
          '<td class="max-w-[220px] truncate" title="' + wrEsc(r.notes || '') + '">' + wrEsc(r.notes || '') + '</td></tr>';
      }).join('');
    }).catch(function (e) {
      wrApiErr(e, '작업 실적 로드 실패');
      body.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-400">로드 실패</td></tr>';
    });
  };

  // ── 탭 최초 진입 시 초기화 (switchProdTab('work') 에서 호출) ──
  window.wrInit = function () {
    if (wrInited) { window.wrLoadRecords(); return; }
    wrInited = true;
    var dateEl = document.getElementById('wrDate');
    if (dateEl && !dateEl.value) dateEl.value = (window.kstToday ? window.kstToday() : new Date().toISOString().slice(0, 10));
    wrLoadEmployees();
    window.wrLoadRecords();
  };
})();

// ════════════════════════════════════════════════════════════════
// 탭 4: 출력파일 연결
//
// 디자이너가 자유 명명한 도안(주문번호 없음)은 resolveCard 가 못 잡는다.
// 파일명 규칙을 강제하는 대신, RIP 로그에 실제로 뜬 파일명을 모아
// 규격·수량·거래처를 파싱해 카드 후보를 추천하고 1클릭으로 확정한다.
// 확정분은 print_file_map 에 학습되어 같은 파일명 재출력부터 자동 매칭된다.
// ?raw 전역 스코프 충돌 회피 위해 헬퍼는 pl* 접두.
// ════════════════════════════════════════════════════════════════
(function () {
  var plEsc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };
  var plToast = function (m, t) { if (window.showToast) window.showToast(m, t); else console.log('[production/link]', m); };

  window.loadUnmatchedFiles = async function () {
    var body = document.getElementById('unmatchedBody');
    if (!body) { console.warn('[production/link] #unmatchedBody not found'); return; }
    var daysEl = document.getElementById('linkDays');
    var days = daysEl ? daysEl.value : '90';
    body.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-6">불러오는 중…</td></tr>';
    try {
      var res = await axios.get('/api/print-events/unmatched?days=' + encodeURIComponent(days));
      if (!res.data.success) throw new Error(res.data.error || '조회 실패');
      var rows = res.data.data || [];

      var badge = document.getElementById('linkBadge');
      if (badge) {
        badge.textContent = rows.length;
        badge.classList.toggle('hidden', rows.length === 0);
      }

      if (rows.length === 0) {
        body.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-8">'
          + '<i class="fas fa-circle-check text-green-500 mr-1"></i>연결되지 않은 출력파일이 없습니다.</td></tr>';
        return;
      }

      body.innerHTML = rows.map(function (r, i) {
        var p = r.parsed || {};
        var size = (p.width && p.height) ? (p.width + '×' + p.height + 'cm') : '-';
        var qty = p.qty != null ? p.qty : '-';
        var nestTag = r.is_nest
          ? ' <span class="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded"><i class="fas fa-layer-group mr-0.5"></i>합판</span>'
          : '';
        // DB는 UTC naive 저장 → 페이지 공용 fmtTime(KST 변환)을 그대로 쓴다
        var last = fmtTime(r.last_at);
        return '<tr id="plRow' + i + '">'
          + '<td class="max-w-[420px] truncate" title="' + plEsc(r.file_name) + '">'
          + plEsc(r.file_name) + nestTag + '</td>'
          + '<td class="text-right tabular-nums">' + plEsc(size) + '</td>'
          + '<td class="text-right tabular-nums">' + plEsc(qty) + '</td>'
          + '<td class="text-right tabular-nums">' + (r.cnt || 0) + '</td>'
          + '<td class="text-xs text-gray-500">' + plEsc(last) + '</td>'
          + '<td class="text-center">'
          + '<button class="ds-btn ds-btn-sm" onclick="plToggleCandidates(' + i + ')">'
          + '<i class="fas fa-magnifying-glass mr-1"></i>후보</button></td>'
          + '</tr>'
          + '<tr id="plCand' + i + '" class="hidden" data-file="' + plEsc(r.file_name) + '">'
          + '<td colspan="6" class="bg-gray-50 p-0"></td></tr>';
      }).join('');
    } catch (e) {
      console.error('[production/link] loadUnmatchedFiles', e);
      body.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-red-400">로드 실패</td></tr>';
    }
  };

  window.plToggleCandidates = async function (idx) {
    var tr = document.getElementById('plCand' + idx);
    if (!tr) { console.warn('[production/link] #plCand' + idx + ' not found'); return; }
    if (!tr.classList.contains('hidden')) { tr.classList.add('hidden'); return; }
    tr.classList.remove('hidden');

    var cell = tr.querySelector('td');
    var fileName = tr.getAttribute('data-file') || '';
    cell.innerHTML = '<div class="p-3 text-xs text-gray-400">후보 조회 중…</div>';

    try {
      var res = await axios.get('/api/print-events/link-candidates?file_name=' + encodeURIComponent(fileName));
      if (!res.data.success) throw new Error(res.data.error || '조회 실패');
      var list = res.data.data.candidates || [];
      if (list.length === 0) {
        cell.innerHTML = '<div class="p-3 text-xs text-gray-500">'
          + '일치하는 대기 카드가 없습니다. 카드가 아직 생성되지 않았거나 이미 출력완료 상태일 수 있습니다.</div>';
        return;
      }
      cell.innerHTML = '<div class="p-3">'
        + '<div class="text-[11px] text-gray-500 mb-2">규격·수량·거래처 일치도 순입니다. 확정하면 이후 같은 파일명은 자동 연결됩니다.</div>'
        + '<table class="w-full text-xs"><tbody>'
        + list.map(function (x) {
            return '<tr class="border-t border-gray-200">'
              + '<td class="py-1.5 font-medium">' + plEsc(x.card_number || '') + '</td>'
              + '<td class="py-1.5">' + plEsc(x.client_name || '-') + '</td>'
              + '<td class="py-1.5">' + plEsc(x.item_name || '-') + '</td>'
              + '<td class="py-1.5 text-right tabular-nums">'
              + (x.width != null && x.height != null ? x.width + '×' + x.height : '-') + '</td>'
              + '<td class="py-1.5 text-right tabular-nums">' + (x.quantity != null ? x.quantity : '-') + '</td>'
              + '<td class="py-1.5"><span class="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">'
              + plEsc((x.reasons || []).join(' · ') || '기타') + '</span></td>'
              + '<td class="py-1.5 text-right">'
              + '<button class="ds-btn ds-btn-sm ds-btn-primary" onclick="plLinkFile(' + idx + ', ' + x.id + ')">'
              + '연결</button></td></tr>';
          }).join('')
        + '</tbody></table></div>';
    } catch (e) {
      console.error('[production/link] plToggleCandidates', e);
      cell.innerHTML = '<div class="p-3 text-xs text-red-400">후보 조회 실패</div>';
    }
  };

  window.plLinkFile = async function (idx, cardId) {
    var tr = document.getElementById('plCand' + idx);
    if (!tr) { console.warn('[production/link] #plCand' + idx + ' not found'); return; }
    var fileName = tr.getAttribute('data-file') || '';
    if (!confirm('이 파일명을 선택한 카드에 연결할까요?\n\n' + fileName)) return;
    try {
      var res = await axios.post('/api/print-events/link', { file_name: fileName, card_id: cardId });
      if (!res.data.success) throw new Error(res.data.error || '연결 실패');
      var d = res.data.data;
      plToast('연결 완료 · ' + d.card_number
        + (d.backfilled_events ? ' (과거 이벤트 ' + d.backfilled_events + '건 소급)' : ''), 'success');
      window.loadUnmatchedFiles();
    } catch (e) {
      console.error('[production/link] plLinkFile', e);
      plToast((e.response && e.response.data && e.response.data.error) || '연결 실패', 'error');
    }
  };
})();
