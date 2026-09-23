// 출고 예정·실적 (구 「준비상태」 · /shipments 탭 + 독립 /shipments-dashboard 공용) — 2026-09-23 재설계
// 용도: ①전날 저녁·당일 아침 = 그날 나갈 주문 정리(인쇄) ②점심 = 어느 건이 나갔고 안 나갔는지 판단.
// 판정(출고완료/준비완료/준비중/이월)은 **서버**(`routes/shipments.ts` loadShipPlan)가 하고 여기선 그리기만 한다.
(function() {
  var today = (window.kstToday ? window.kstToday() : new Date().toISOString().split('T')[0]);
  var dateEl = document.getElementById('dashDate');
  if (dateEl) dateEl.value = today;
  var lastData = null;

  var BUCKET = {
    PREPARING: { label: '준비중', bg: '#fef3c7', fg: '#92400e' },
    READY:     { label: '준비완료·미출고', bg: '#dbeafe', fg: '#1e40af' },
    SHIPPED:   { label: '출고완료', bg: '#dcfce7', fg: '#166534' }
  };
  // 섹션 순서 = 점심 판단 순서: 아직 안 나간 것(준비중→준비완료)이 위, 나간 것이 아래
  var SECTIONS = [
    { key: 'PREPARING', title: '미출고 — 준비중', hint: '라인 준비가 덜 끝난 주문' },
    { key: 'READY', title: '미출고 — 준비완료', hint: '준비는 끝났는데 아직 출고 처리가 안 된 주문' },
    { key: 'SHIPPED', title: '출고완료', hint: '' }
  ];

  function esc(s) { return window.escapeHtml(s == null ? '' : String(s)); }

  function shiftDate(ymd, days) {
    var d = new Date(ymd + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function loadDashboard() {
    var dEl = document.getElementById('dashDate');
    var content = document.getElementById('dashContent');
    if (!dEl || !content) { console.warn('[shipPlan] #dashDate/#dashContent not found'); return; }
    var date = dEl.value || today;
    var method = (document.getElementById('dashMethod') || {}).value || '';
    var status = (document.getElementById('dashStatus') || {}).value || 'all';

    var url = '/api/shipments/dashboard?date=' + encodeURIComponent(date);
    if (method) url += '&delivery_method=' + encodeURIComponent(method);
    if (status) url += '&status=' + encodeURIComponent(status);

    axios.get(url).then(function(res) {
      lastData = res.data.data || { counts: {}, orders: [] };
      renderCounts(lastData.counts || {});
      fillMethodOptions(lastData.methods || [], method);
      renderOrders(lastData.orders || [], date);
    }).catch(function(err) {
      window.handleApiError(err, '데이터 로드 실패');
      content.innerHTML = '<div class="text-center py-12 text-gray-400"><i class="fas fa-exclamation-triangle text-3xl mb-3 block"></i>'
        + '<p class="text-sm">데이터를 불러오지 못했습니다.</p></div>';
    });
  }

  // 배송방법 선택지 = 서버가 준 「그날 실제로 있는 값」. 고른 값은 그날 없어도 유지한다(날짜만 바꿨을 때).
  function fillMethodOptions(methods, selected) {
    var sel = document.getElementById('dashMethod');
    if (!sel) return;
    var list = methods.slice();
    if (selected && list.indexOf(selected) < 0) list.push(selected);
    sel.innerHTML = '<option value="">전체</option>' + list.map(function(m) {
      return '<option value="' + esc(m) + '"' + (m === selected ? ' selected' : '') + '>' + esc(m) + '</option>';
    }).join('');
  }

  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  function renderCounts(c) {
    var planned = c.planned || 0, shipped = c.shipped || 0;
    setText('dashPlanned', window.fmtMoney(planned));
    setText('dashShipped', window.fmtMoney(shipped));
    setText('dashReady', window.fmtMoney(c.ready || 0));
    setText('dashPreparing', window.fmtMoney(c.preparing || 0));
    setText('dashCarried', window.fmtMoney(c.carried || 0));
    setText('dashCarriedShipped', c.carried_shipped ? ('이월분 ' + c.carried_shipped + '건 이날 출고') : '');
    var bar = document.getElementById('dashShipBar');
    if (bar) bar.style.width = (planned > 0 ? Math.round(shipped / planned * 100) : 0) + '%';
    setText('dashShipPct', planned > 0 ? Math.round(shipped / planned * 100) + '%' : '-');
  }

  function itemLine(item) {
    var spec = item.specification || ((item.width && item.height) ? (item.width + 'x' + item.height) : '');
    var qty = (item.quantity != null ? item.quantity : 1);
    return { spec: spec, qty: qty };
  }

  function orderCard(o) {
    var b = BUCKET[o.bucket] || BUCKET.PREPARING;
    var html = '<div class="bg-white rounded-lg border p-3 mb-2">';
    html += '<div class="flex items-center justify-between gap-2 flex-wrap">';
    html += '<div class="flex items-center gap-2 flex-wrap min-w-0">';
    html += '<span class="font-semibold" style="color:#212529">' + esc(o.client_name || '-') + '</span>';
    html += '<span class="text-xs text-gray-400">' + esc(o.order_number) + '</span>';
    html += '<span style="font-size:11px;padding:1px 7px;border-radius:8px;background:' + b.bg + ';color:' + b.fg + '">'
      + b.label + (o.bucket === 'PREPARING' ? ' ' + o.ready_count + '/' + o.total_count : '') + '</span>';
    if (o.carried) {
      html += '<span style="font-size:11px;padding:1px 7px;border-radius:8px;background:#fee2e2;color:#991b1b" title="납기가 지났는데 선택일까지 안 나간 건">'
        + '이월 · 납기 ' + esc(String(o.delivery_date || '').slice(5, 10)) + '</span>';
    }
    html += '</div>';
    html += '<div class="flex items-center gap-3 text-xs text-gray-500">';
    html += '<span><i class="fas fa-truck mr-1"></i>' + esc(o.delivery_method || '미정') + '</span>';
    var slot = window.MES_SLOT ? window.MES_SLOT.resolveSlot(o.delivery_method, o.delivery_slot) : null;
    if (slot) html += '<span><i class="far fa-clock mr-1"></i>' + window.MES_SLOT.LABELS[slot] + '</span>';
    else if (o.delivery_time) html += '<span><i class="far fa-clock mr-1"></i>' + esc(o.delivery_time) + '</span>';
    if (o.bucket === 'SHIPPED' && o.shipped_at) {
      html += '<span class="text-green-700">출고 ' + esc(window.formatKST ? window.formatKST(o.shipped_at) : o.shipped_at) + '</span>';
    }
    if (o.bucket === 'READY') {
      html += '<button onclick="window.shipOrder(' + o.order_id + ')" class="px-2.5 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">'
        + '<i class="fas fa-shipping-fast mr-1"></i>출고 처리</button>';
    }
    html += '</div></div>';

    // 출고완료는 품목을 접는다 — 점심 판단에서 볼 것은 「안 나간 것」이다
    if (o.bucket === 'SHIPPED') {
      html += '<div class="text-xs text-gray-400 mt-1">' + o.total_count + '개 라인 · '
        + esc(o.items.slice(0, 3).map(function(i) { return i.item_name; }).join(', ')) + (o.items.length > 3 ? ' 외' : '') + '</div>';
    } else {
      html += '<div class="space-y-0.5 mt-2">';
      o.items.forEach(function(item) {
        var ready = Number(item.shipment_ready) === 1;
        var L = itemLine(item);
        html += '<div class="flex items-center justify-between text-sm py-1 px-2 rounded ' + (ready ? 'bg-green-50/50' : 'bg-amber-50/50') + '">';
        html += '<span class="truncate min-w-0">'
          + (ready ? '<i class="fas fa-check-circle text-green-600 mr-1.5"></i>' : '<i class="far fa-clock text-amber-500 mr-1.5"></i>')
          + esc(item.item_name)
          + (L.spec ? ' <span class="text-gray-500 text-xs">' + esc(L.spec) + '</span>' : '')
          + ' <span class="text-gray-400">' + L.qty + '건</span>'
          + (item.content ? ' <span class="text-[10px] text-gray-400">· ' + esc(item.content) + '</span>' : '')
          + '</span>';
        html += item.card_number
          ? '<span class="text-gray-400 text-xs whitespace-nowrap">' + esc(item.card_number) + ' ' + esc(cardStatusLabel(item.card_status)) + '</span>'
          : '<span class="text-gray-400 text-xs whitespace-nowrap">재고출고</span>';
        html += '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderOrders(orders, date) {
    var container = document.getElementById('dashContent');
    if (!orders.length) {
      container.innerHTML = '<div class="text-center py-12 text-gray-400"><i class="fas fa-truck text-3xl mb-3 block"></i>'
        + '<p class="text-sm">' + esc(date) + ' 에 해당하는 출고 건이 없습니다.</p></div>';
      return;
    }
    var html = '';
    SECTIONS.forEach(function(s) {
      // 섹션 안에서는 이 날 납기분이 먼저, 이월분은 뒤 — 이월이 많으면 오늘 것이 밀려 안 보인다
      var list = orders.filter(function(o) { return o.bucket === s.key; })
        .sort(function(a, b) { return (a.carried ? 1 : 0) - (b.carried ? 1 : 0); });
      if (!list.length) return;
      html += '<div class="mb-4">';
      html += '<div class="flex items-baseline gap-2 mb-2"><h4 class="text-sm font-semibold text-gray-700">' + s.title
        + ' <span class="text-gray-400 font-normal">' + list.length + '건</span></h4>'
        + (s.hint ? '<span class="text-xs text-gray-400">' + s.hint + '</span>' : '') + '</div>';
      html += list.map(orderCard).join('');
      html += '</div>';
    });
    container.innerHTML = html;
  }

  function cardStatusLabel(status) {
    // 표준 카드 상태 = 단일 소스(window.MES_STATUS), 이 화면 전용 보조 상태만 로컬
    var extra = { POST_PROCESSING: '후가공중', DONE: '완료' };
    return (window.MES_STATUS && window.MES_STATUS.cardLabels[status]) || extra[status] || status || '';
  }

  // 출고 예정표 인쇄 — 아침에 종이로 들고 체크한다. 지금 화면의 필터 그대로(= 보이는 것만) 찍는다.
  window.printShipPlan = function() {
    if (!lastData || !(lastData.orders || []).length) { window.showToast('인쇄할 출고 건이 없습니다', 'warning'); return; }
    var date = (document.getElementById('dashDate') || {}).value || today;
    var orders = lastData.orders.slice().sort(function(a, b) {
      // 화면과 같은 순서: 이 날 납기 미출고 → 이월 미출고 → 출고완료
      var ka = (a.bucket === 'SHIPPED' ? 2 : a.carried ? 1 : 0), kb = (b.bucket === 'SHIPPED' ? 2 : b.carried ? 1 : 0);
      if (ka !== kb) return ka - kb;
      var m = String(a.delivery_method || '').localeCompare(String(b.delivery_method || ''));
      if (m) return m;
      var cn = String(a.client_name || '').localeCompare(String(b.client_name || ''));
      return cn || (a.order_id - b.order_id);
    });
    var rows = orders.map(function(o, i) {
      var b = BUCKET[o.bucket] || BUCKET.PREPARING;
      var items = o.items.map(function(it) {
        var L = itemLine(it);
        return esc(it.item_name) + (L.spec ? ' ' + esc(L.spec) : '') + ' ×' + L.qty;
      }).join('<br>');
      return '<tr><td class="c">' + (i + 1) + '</td><td><b>' + esc(o.client_name || '-') + '</b><div class="sub">' + esc(o.order_number) + '</div></td>'
        + '<td>' + esc(o.delivery_method || '-') + '</td><td class="items">' + items + '</td>'
        + '<td>' + b.label + (o.bucket === 'PREPARING' ? ' ' + o.ready_count + '/' + o.total_count : '')
        + (o.carried ? '<div class="sub red">이월(납기 ' + esc(String(o.delivery_date || '').slice(5, 10)) + ')</div>' : '') + '</td>'
        + '<td class="c">' + (o.bucket === 'SHIPPED' ? '✓' : '<span class="box"></span>') + '</td></tr>';
    }).join('');
    var c = lastData.counts || {};
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>출고 예정표 ' + esc(date) + '</title><style>'
      + 'body{font-family:"Malgun Gothic",sans-serif;font-size:12px;padding:12px;color:#111}'
      + 'h1{font-size:18px;margin:0 0 4px}.sum{color:#555;margin-bottom:8px}'
      + 'table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:4px 6px;vertical-align:top;text-align:left}'
      + 'th{background:#f3f4f6}.c{text-align:center;width:36px}.items{font-size:11px}.sub{font-size:10px;color:#666}.red{color:#b91c1c}'
      + '.box{display:inline-block;width:14px;height:14px;border:1.5px solid #111}'
      + 'tr{page-break-inside:avoid}@media print{@page{size:A4;margin:10mm}body{padding:0}}'
      + '</style></head><body>'
      + '<h1>출고 예정표 ' + esc(date) + '</h1>'
      + '<div class="sum">납기 ' + (c.planned || 0) + '건 · 출고완료 ' + (c.shipped || 0) + ' · 준비완료 ' + (c.ready || 0)
      + ' · 준비중 ' + (c.preparing || 0) + ' · 이월 ' + (c.carried || 0) + '  (인쇄 ' + esc(new Date().toLocaleString('ko-KR')) + ')</div>'
      + '<table><thead><tr><th class="c">#</th><th>거래처 / 주문</th><th style="width:70px">배송</th><th>품목</th><th style="width:90px">상태</th><th class="c">출고</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></body></html>';
    var win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) { window.showToast('팝업이 차단되었습니다', 'error'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(function() { win.print(); }, 300);
  };

  window.shipOrder = async function(orderId) {
    var confirmed = await window.showConfirm('이 주문을 출고 처리하시겠습니까?');
    if (!confirmed) return;
    try {
      var res = await axios.patch('/api/shipments/' + orderId + '/ship');
      if (res.data.success) {
        window.showToast('출고 처리되었습니다 — 「출고완료」로 옮겨졌습니다', 'success');
        loadDashboard();
      }
    } catch(err) {
      window.handleApiError(err, '출고 처리 실패');
    }
  };

  window.loadDashboard = loadDashboard;

  // 'prev'/'next' = 보고 있는 날 기준 하루 이동 · 'today'/'tomorrow' = 오늘 기준(전날 저녁 정리는 「내일」)
  window.setDashDate = function(which) {
    var el = document.getElementById('dashDate');
    if (!el) return;
    var cur = el.value || today;
    el.value = which === 'today' ? today : which === 'tomorrow' ? shiftDate(today, 1)
      : shiftDate(cur, which === 'prev' ? -1 : 1);
    if (el._flatpickr) el._flatpickr.setDate(el.value, false);
    loadDashboard();
  };

  window.resetDashFilters = function() {
    var el = document.getElementById('dashDate');
    if (el) { el.value = today; if (el._flatpickr) el._flatpickr.setDate(today, false); }
    var m = document.getElementById('dashMethod'); if (m) m.value = '';
    var s = document.getElementById('dashStatus'); if (s) s.value = 'all';
    loadDashboard();
  };

  // 초기 로드: 독립 페이지(/shipments-dashboard)에서만 자동.
  // shipments 탭(#shipExecTab 존재)은 탭 최초 진입 시 switchShipTab이 window.loadDashboard 호출(이중 로드 방지).
  var __isShipTabHost = !!document.getElementById('shipExecTab');
  if (document.getElementById('dashDate') && !__isShipTabHost) {
    loadDashboard();
  }

  // 필터 변경 시 자동 로드 (양쪽 호스트 공통)
  ['dashDate', 'dashMethod', 'dashStatus'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', loadDashboard);
  });
})();
