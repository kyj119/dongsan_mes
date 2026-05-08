(function() {
  var currentDate = new Date().toISOString().split('T')[0];
  var dateEl = document.getElementById('dashDate');
  if (dateEl) dateEl.value = currentDate;

  function loadDashboard() {
    var date = document.getElementById('dashDate').value || currentDate;
    var method = document.getElementById('dashMethod').value;
    var status = document.getElementById('dashStatus').value;

    var url = '/api/shipments/dashboard?date=' + date;
    if (method) url += '&delivery_method=' + encodeURIComponent(method);
    if (status) url += '&status=' + status;

    axios.get(url).then(function(res) {
      renderDashboard(res.data.data);
    }).catch(function(err) {
      window.handleApiError(err, '데이터 로드 실패');
      document.getElementById('dashContent').innerHTML =
        '<div class="text-center py-12 text-gray-400">' +
        '<i class="fas fa-exclamation-triangle text-3xl mb-3 block"></i>' +
        '<p class="text-sm">데이터를 불러오지 못했습니다.</p></div>';
    });

    // 카운트 로드
    axios.get('/api/shipments/dashboard/counts?date=' + date).then(function(res) {
      var d = res.data.data;
      document.getElementById('dashTotal').textContent = window.fmtMoney(d.total);
      document.getElementById('dashReady').textContent = window.fmtMoney(d.ready);
      document.getElementById('dashPending').textContent = window.fmtMoney(d.pending);
    }).catch(function() {
      document.getElementById('dashTotal').textContent = '-';
      document.getElementById('dashReady').textContent = '-';
      document.getElementById('dashPending').textContent = '-';
    });
  }

  function renderDashboard(clients) {
    var container = document.getElementById('dashContent');
    if (!clients || clients.length === 0) {
      container.innerHTML =
        '<div class="text-center py-12 text-gray-400">' +
        '<i class="fas fa-truck text-3xl mb-3 block"></i>' +
        '<p class="text-sm">오늘 출고 예정 건이 없습니다.</p></div>';
      return;
    }

    var html = '';
    clients.forEach(function(client) {
      client.orders.forEach(function(order) {
        var isReady = order.all_ready;
        var statusBadge = isReady
          ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">' +
            '<i class="fas fa-check-circle text-[7px] mr-1"></i>출고 가능</span>'
          : '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">' +
            '<i class="far fa-clock text-[7px] mr-1"></i>' + order.ready_count + '/' + order.total_count + ' 준비</span>';

        html += '<div class="bg-white rounded-lg shadow-sm border p-4 mb-3 hover:shadow-md transition-shadow">';
        // 헤더
        html += '<div class="flex items-center justify-between mb-3">';
        html += '<div class="flex items-center gap-3 flex-wrap">';
        html += '<span class="font-semibold" style="color:#212529;">' + window.escapeHtml(client.client_name) + '</span>';
        html += '<span class="text-xs text-gray-400">' + window.escapeHtml(order.order_number) + '</span>';
        html += statusBadge;
        html += '</div>';
        html += '<div class="flex items-center gap-3 text-sm text-gray-500">';
        html += '<span><i class="fas fa-truck mr-1"></i>' + window.escapeHtml(order.delivery_method || '미정') + '</span>';
        if (order.delivery_time) {
          html += '<span><i class="far fa-clock mr-1"></i>' + window.escapeHtml(order.delivery_time) + '</span>';
        }
        if (isReady) {
          html += '<button onclick="window.shipOrder(' + order.order_id + ')" ' +
            'class="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-all">' +
            '<i class="fas fa-shipping-fast mr-1"></i>출고 처리</button>';
        }
        html += '</div></div>';

        // 품목 목록
        html += '<div class="space-y-1">';
        order.items.forEach(function(item) {
          var ready = item.shipment_ready;
          var icon = ready
            ? '<i class="fas fa-check-circle text-green-600 mr-1.5"></i>'
            : '<i class="far fa-clock text-amber-500 mr-1.5"></i>';
          var cardInfo = item.card_number
            ? '<span class="text-gray-400 text-xs">' + window.escapeHtml(item.card_number) + ' ' + getCardStatusLabel(item.card_status) + '</span>'
            : '<span class="text-gray-400 text-xs">재고출고</span>';
          var rowBg = ready ? 'bg-green-50/50' : 'bg-amber-50/50';

          html += '<div class="flex items-center justify-between text-sm py-1.5 px-2 rounded ' + rowBg + '">';
          html += '<span>' + icon + window.escapeHtml(item.item_name) + ' <span class="text-gray-400">' + (item.quantity || 1) + '건</span></span>';
          html += cardInfo;
          html += '</div>';
        });
        html += '</div></div>';
      });
    });

    container.innerHTML = html;
  }

  function getCardStatusLabel(status) {
    var labels = {
      'PRINTING': '인쇄중',
      'PRINT_DONE': '출력완료',
      'POST_PROCESSING': '후가공중',
      'DONE': '완료',
      'HOLD': '보류',
      'SHIPPED': '출고됨'
    };
    return labels[status] || status || '';
  }

  window.shipOrder = async function(orderId) {
    var confirmed = await window.showConfirm('이 주문을 출고 처리하시겠습니까?');
    if (!confirmed) return;
    try {
      var res = await axios.patch('/api/shipments/' + orderId + '/ship');
      if (res.data.success) {
        window.showToast('출고 처리되었습니다.', 'success');
        loadDashboard();
      }
    } catch(err) {
      window.handleApiError(err, '출고 처리 실패');
    }
  };

  window.loadDashboard = loadDashboard;

  window.resetDashFilters = function() {
    document.getElementById('dashDate').value = currentDate;
    document.getElementById('dashMethod').value = '';
    document.getElementById('dashStatus').value = 'all';
    loadDashboard();
  };

  // 초기 로드
  loadDashboard();

  // 필터 변경 시 자동 로드
  ['dashDate', 'dashMethod', 'dashStatus'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', loadDashboard);
  });
})();
