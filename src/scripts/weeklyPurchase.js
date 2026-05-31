// 주간 일괄 발주 대시보드 (Phase 4)
(function() {
  var allSuggestions = [];
  var filteredSuggestions = [];
  var lastSummary = null;

  window.runAnalysis = function() {
    var weeksBack = document.getElementById('weeksBack').value;
    var resultEl = document.getElementById('analysisResult');
    resultEl.innerHTML = '<div class="text-center py-12 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i><p class="mt-2">분석 중...</p></div>';
    document.getElementById('summaryCards').style.display = 'none';
    document.getElementById('filterBar').style.display = 'none';
    document.getElementById('actionBar').style.display = 'none';

    axios.get('/api/weekly-purchase/analyze?weeks_back=' + weeksBack)
      .then(function(res) {
        if (!res.data.success) throw new Error(res.data.error);
        allSuggestions = res.data.data.suggestions;
        lastSummary = res.data.data.summary;
        renderSummary(res.data.data.summary);
        populateSupplierFilter();
        applyFilter();
      })
      .catch(function(err) {
        resultEl.innerHTML = '<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700"><i class="fas fa-exclamation-circle mr-1"></i>' + (err.response?.data?.error || err.message) + '</div>';
      });
  };

  function renderSummary(s) {
    var el = document.getElementById('summaryCards');
    el.innerHTML = [
      card('전체 품목', s.total_items, 'fa-boxes', 'blue'),
      card('발주 필요', s.needs_order, 'fa-exclamation-triangle', s.needs_order > 0 ? 'red' : 'green'),
      card('긴급/높음', s.urgent + s.high, 'fa-bolt', s.urgent > 0 ? 'red' : 'amber'),
      card('공급처', s.supplier_count + '곳', 'fa-truck', 'indigo'),
    ].join('');
    el.style.display = 'grid';
    // 발주 필요 품목이 있으면 알림 버튼 표시
    var notifyBtn = document.getElementById('notifyBtn');
    if (notifyBtn) notifyBtn.style.display = s.needs_order > 0 ? 'inline-flex' : 'none';
  }

  function card(label, value, icon, color) {
    return '<div class="bg-white border border-gray-200 rounded-lg p-4">' +
      '<div class="flex items-center gap-3">' +
      '<div class="w-10 h-10 bg-' + color + '-100 rounded-lg flex items-center justify-center">' +
      '<i class="fas ' + icon + ' text-' + color + '-600"></i></div>' +
      '<div><p class="text-2xl font-bold text-gray-900">' + value + '</p>' +
      '<p class="text-xs text-gray-500">' + label + '</p></div></div></div>';
  }

  function populateSupplierFilter() {
    var select = document.getElementById('filterSupplier');
    select.innerHTML = '<option value="">전체 공급처</option>';
    var seen = {};
    allSuggestions.forEach(function(s) {
      if (s.supplier_id && !seen[s.supplier_id]) {
        seen[s.supplier_id] = true;
        select.innerHTML += '<option value="' + s.supplier_id + '">' + escHtml(s.supplier_name || '공급처 ' + s.supplier_id) + '</option>';
      }
    });
  }

  window.applyFilter = function() {
    var needsOnly = document.getElementById('filterNeedsOrder').checked;
    var urgency = document.getElementById('filterUrgency').value;
    var supplier = document.getElementById('filterSupplier').value;

    filteredSuggestions = allSuggestions.filter(function(s) {
      if (needsOnly && !s.needs_order) return false;
      if (urgency && s.urgency !== urgency) return false;
      if (supplier && String(s.supplier_id) !== supplier) return false;
      return true;
    });

    document.getElementById('filterBar').style.display = 'flex';
    document.getElementById('resultCount').textContent = filteredSuggestions.length + '건 표시';
    renderTable(filteredSuggestions);
    updateActionBar();
  };

  function renderTable(items) {
    var el = document.getElementById('analysisResult');
    if (items.length === 0) {
      el.innerHTML = '<div class="bg-green-50 border border-green-200 rounded-lg p-6 text-center text-green-700"><i class="fas fa-check-circle text-2xl mb-2"></i><p class="font-medium">발주 필요 품목이 없습니다</p></div>';
      document.getElementById('actionBar').style.display = 'none';
      return;
    }

    var html = '<div class="bg-white border border-gray-200 rounded-lg overflow-x-auto">' +
      '<table class="min-w-full text-sm">' +
      '<thead class="bg-gray-50 text-gray-600 text-xs uppercase"><tr>' +
      '<th class="px-3 py-2 text-left"><input type="checkbox" id="selectAllTop" onchange="toggleSelectAll()"></th>' +
      '<th class="px-3 py-2 text-left">긴급</th>' +
      '<th class="px-3 py-2 text-left">품목</th>' +
      '<th class="px-3 py-2 text-left">분류</th>' +
      '<th class="px-3 py-2 text-right">현재고</th>' +
      '<th class="px-3 py-2 text-right">안전재고</th>' +
      '<th class="px-3 py-2 text-right">주간소모</th>' +
      '<th class="px-3 py-2 text-right">MRP 소요</th>' +
      '<th class="px-3 py-2 text-right">발주중</th>' +
      '<th class="px-3 py-2 text-right">권장 수량</th>' +
      '<th class="px-3 py-2 text-left">공급처</th>' +
      '</tr></thead><tbody>';

    items.forEach(function(s, idx) {
      var urgBadge = urgencyBadge(s.urgency);
      var stockClass = s.current_stock <= 0 ? 'text-red-600 font-bold' :
                       s.current_stock <= s.safe_stock ? 'text-amber-600 font-semibold' : 'text-gray-900';

      html += '<tr class="border-t border-gray-100 hover:bg-gray-50" data-idx="' + idx + '">' +
        '<td class="px-3 py-2"><input type="checkbox" class="item-check" data-item-id="' + s.item_id + '" ' + (s.needs_order ? 'checked' : '') + ' onchange="updateActionBar()"></td>' +
        '<td class="px-3 py-2">' + urgBadge + '</td>' +
        '<td class="px-3 py-2 font-medium text-gray-900">' + escHtml(s.item_name) + '</td>' +
        '<td class="px-3 py-2 text-gray-500">' + escHtml(s.category || '-') + '</td>' +
        '<td class="px-3 py-2 text-right ' + stockClass + '">' + fmt(s.current_stock) + '</td>' +
        '<td class="px-3 py-2 text-right text-gray-600">' + fmt(s.safe_stock) + '</td>' +
        '<td class="px-3 py-2 text-right text-blue-600">' + fmt(s.weekly_avg) + '/w</td>' +
        '<td class="px-3 py-2 text-right text-purple-600">' + fmt(s.mrp_demand) + '</td>' +
        '<td class="px-3 py-2 text-right text-gray-500">' + fmt(s.on_order) + '</td>' +
        '<td class="px-3 py-2 text-right">' +
          '<input type="number" class="qty-input w-20 border border-gray-300 rounded px-2 py-1 text-right text-sm" ' +
          'data-item-id="' + s.item_id + '" value="' + s.recommended_qty + '" min="0">' +
        '</td>' +
        '<td class="px-3 py-2 text-gray-600 text-xs">' + escHtml(s.supplier_name || '미지정') + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    el.innerHTML = html;
    document.getElementById('actionBar').style.display = 'flex';
  }

  function urgencyBadge(u) {
    var map = {
      URGENT: ['bg-red-100 text-red-700', '긴급'],
      HIGH:   ['bg-amber-100 text-amber-700', '높음'],
      NORMAL: ['bg-blue-100 text-blue-700', '보통'],
      LOW:    ['bg-gray-100 text-gray-500', '낮음'],
    };
    var m = map[u] || map.LOW;
    return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + m[0] + '">' + m[1] + '</span>';
  }

  window.toggleSelectAll = function() {
    var checks = document.querySelectorAll('.item-check');
    var allChecked = Array.from(checks).every(function(c) { return c.checked; });
    checks.forEach(function(c) { c.checked = !allChecked; });
    var topCheck = document.getElementById('selectAllTop');
    var bottomCheck = document.getElementById('selectAll');
    if (topCheck) topCheck.checked = !allChecked;
    if (bottomCheck) bottomCheck.checked = !allChecked;
    updateActionBar();
  };

  window.updateActionBar = function() {
    var checks = document.querySelectorAll('.item-check:checked');
    var count = checks.length;
    var el = document.getElementById('selectedCount');
    if (el) el.textContent = count + '건 선택됨';
  };

  window.createPRs = function() {
    var checks = document.querySelectorAll('.item-check:checked');
    if (checks.length === 0) {
      alert('발주할 품목을 선택해주세요.');
      return;
    }

    var items = [];
    checks.forEach(function(cb) {
      var itemId = Number(cb.dataset.itemId);
      var s = filteredSuggestions.find(function(x) { return x.item_id === itemId; });
      if (!s) return;

      var qtyInput = document.querySelector('.qty-input[data-item-id="' + itemId + '"]');
      var qty = qtyInput ? Number(qtyInput.value) : s.recommended_qty;
      if (qty <= 0) return;

      items.push({
        item_id: s.item_id,
        item_name: s.item_name,
        quantity: qty,
        unit: s.unit,
        supplier_id: s.supplier_id,
        supplier_name: s.supplier_name,
        urgency: s.urgency,
      });
    });

    if (items.length === 0) {
      alert('수량이 0인 품목만 선택되었습니다.');
      return;
    }

    // 공급처별 그룹 미리보기
    var groups = {};
    items.forEach(function(it) {
      var key = it.supplier_name || '미지정';
      if (!groups[key]) groups[key] = [];
      groups[key].push(it.item_name);
    });
    var preview = Object.keys(groups).map(function(k) { return k + ': ' + groups[k].length + '건'; }).join('\n');

    if (!confirm('발주 요청(PR)을 생성합니다.\n\n' + preview + '\n\n총 ' + items.length + '건, 진행하시겠습니까?')) return;

    axios.post('/api/weekly-purchase/create-prs', { items: items })
      .then(function(res) {
        if (!res.data.success) throw new Error(res.data.error);
        var prs = res.data.data.prs;
        var msg = res.data.message + '\n\n';
        prs.forEach(function(pr) {
          msg += pr.request_number + ' (' + pr.supplier_name + ', ' + pr.item_count + '건)\n';
        });
        alert(msg);
        // 발주 요청 페이지로 이동
        if (confirm('발주 요청 목록으로 이동하시겠습니까?')) {
          window.navigateTo('/purchase-requests');
        }
      })
      .catch(function(err) {
        alert('오류: ' + (err.response?.data?.error || err.message));
      });
  };

  window.sendNotify = function() {
    if (!lastSummary) { alert('먼저 발주 분석을 실행해주세요.'); return; }
    if (!confirm('분석 결과를 담당자(ADMIN/MANAGER)에게 SMS로 발송합니다.\n진행하시겠습니까?')) return;
    axios.post('/api/weekly-purchase/notify', { summary: lastSummary, channel: 'sms' })
      .then(function(res) {
        if (!res.data.success) throw new Error(res.data.error);
        var msgs = res.data.data.results.map(function(r) { return r.type + ': ' + r.status + (r.detail ? ' (' + r.detail + ')' : ''); });
        alert('알림 발송 완료\n\n' + msgs.join('\n'));
      })
      .catch(function(err) { alert('알림 발송 실패: ' + (err.response?.data?.error || err.message)); });
  };

  function fmt(n) {
    if (n === null || n === undefined) return '-';
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
  function escHtml(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
})();
