// ===== 납기 분석 페이지 스크립트 =====
var deliveryData = [];
var dwellTimeData = [];
var delayedOrders = [];

// ===== 초기화 =====
function initDeliveryAnalytics() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const formatDate = (d) => d.toISOString().split('T')[0];
  document.getElementById('dateFrom').value = formatDate(thirtyDaysAgo);
  document.getElementById('dateTo').value = formatDate(today);

  loadDeliveryAnalytics();
}

// ===== 필터 초기화 =====
function resetFilters() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const formatDate = (d) => d.toISOString().split('T')[0];
  document.getElementById('dateFrom').value = formatDate(thirtyDaysAgo);
  document.getElementById('dateTo').value = formatDate(today);

  loadDeliveryAnalytics();
}

// ===== 주요 데이터 로드 =====
async function loadDeliveryAnalytics() {
  try {
    const from = document.getElementById('dateFrom').value;
    const to = document.getElementById('dateTo').value;

    if (!from || !to) {
      showToast('기간을 선택해주세요.', 'warning');
      return;
    }

    // 병렬 로드: 통계, 체류시간, 지연 주문
    await Promise.all([
      loadDeliveryStats(from, to),
      loadDwellTime(from, to),
      loadDelayedOrders(from, to),
      loadDueToday()
    ]);
  } catch (error) {
    console.error('Error loading delivery analytics:', error);
    showToast('데이터 로드 실패: ' + error.message, 'error');
  }
}

// ===== 통계 데이터 로드 =====
async function loadDeliveryStats(from, to) {
  try {
    const res = await authFetch(
      `/api/orders?status=SHIPPED&sort=created_at_desc&limit=1000&from=${from}&to=${to}`,
      { method: 'GET' }
    );
    const data = await res.json();
    deliveryData = data.data || [];

    // 납기 준수율 계산
    const onTimeCount = deliveryData.filter(order => {
      const dueDate = new Date(order.delivery_date);
      const shippedDate = new Date(order.shipped_at || new Date());
      return shippedDate <= dueDate;
    }).length;

    const onTimeRate = deliveryData.length > 0 ? Math.round((onTimeCount / deliveryData.length) * 100) : 0;
    document.getElementById('onTimeRate').innerHTML = onTimeRate + '<span class="unit">%</span>';

    // 평균 처리시간 계산 (created_at → shipped_at)
    const processTimes = deliveryData
      .filter(order => order.created_at && order.shipped_at)
      .map(order => {
        const created = new Date(order.created_at);
        const shipped = new Date(order.shipped_at);
        return (shipped - created) / (1000 * 60 * 60); // 시간 단위
      });

    const avgProcessTime = processTimes.length > 0
      ? Math.round(processTimes.reduce((a, b) => a + b, 0) / processTimes.length * 10) / 10
      : 0;
    document.getElementById('avgProcessTime').innerHTML = avgProcessTime + '<span class="unit">시간</span>';

  } catch (error) {
    console.error('Error loading delivery stats:', error);
  }
}

// ===== 오늘 출고 예정 건수 =====
async function loadDueToday() {
  try {
    const res = await authFetch('/api/dashboard/stats/today-due', { method: 'GET' });
    const data = await res.json();
    const count = data.data?.count || 0;
    document.getElementById('dueTodayCount').innerHTML = count + '<span class="unit">건</span>';
  } catch (error) {
    console.error('Error loading due today:', error);
  }
}

// ===== 체류시간 데이터 로드 =====
async function loadDwellTime(from, to) {
  try {
    const res = await authFetch(
      `/api/productionReports/card-dwell-time?from=${from}&to=${to}`,
      { method: 'GET' }
    );
    const data = await res.json();
    dwellTimeData = data.data || [];

    renderDwellChart();
  } catch (error) {
    console.error('Error loading dwell time:', error);
  }
}

// ===== 체류시간 차트 렌더 =====
function renderDwellChart() {
  const container = document.getElementById('dwellTimeContent');

  if (!dwellTimeData || dwellTimeData.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:32px;color:#9ca3af;font-size:13px;">데이터가 없습니다.</div>';
    return;
  }

  // 상태별 정렬 순서
  const statusOrder = ['CONFIRMED', 'PRINTING', 'PRINT_DONE', 'SHIPPED'];
  const statusLabel = {
    'CONFIRMED': '확정',
    'PRINTING': '인쇄 중',
    'PRINT_DONE': '인쇄완료',
    'SHIPPED': '출고'
  };
  const statusColor = {
    'CONFIRMED': '#3b82f6',
    'PRINTING': '#f59e0b',
    'PRINT_DONE': '#10b981',
    'SHIPPED': '#6366f1'
  };

  // 최대값 구하기
  const maxDwellHours = Math.max(...dwellTimeData.map(d => parseFloat(d.avg_dwell_hours) || 0));
  const maxValue = Math.ceil(maxDwellHours * 1.2);

  let html = '';
  dwellTimeData.forEach(item => {
    const status = item.status || 'UNKNOWN';
    const label = statusLabel[status] || status;
    const avgHours = parseFloat(item.avg_dwell_hours) || 0;
    const minHours = parseFloat(item.min_dwell_hours) || 0;
    const maxHours = parseFloat(item.max_dwell_hours) || 0;
    const barWidth = maxValue > 0 ? (avgHours / maxValue) * 100 : 0;
    const color = statusColor[status] || '#3b82f6';

    html += `
      <div class="dwell-bar-container">
        <div class="dwell-bar-label" style="color:${color};font-weight:600;">${label}</div>
        <div class="dwell-bar-track">
          <div class="dwell-bar-fill" style="width:${barWidth}%;background:${color};">
            ${barWidth > 15 ? Math.round(avgHours * 10) / 10 + 'h' : ''}
          </div>
        </div>
        <div class="dwell-bar-value">
          평균 ${Math.round(avgHours * 10) / 10}h
          <br/>
          <span style="color:#9ca3af;font-size:11px;">(${Math.round(minHours * 10) / 10}h ~ ${Math.round(maxHours * 10) / 10}h)</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ===== 지연 주문 로드 =====
async function loadDelayedOrders(from, to) {
  try {
    const res = await authFetch(
      `/api/orders?sort=created_at_desc&limit=500`,
      { method: 'GET' }
    );
    const allOrders = (await res.json()).data || [];

    // 필터: 납기일이 지났는데 아직 출고되지 않은 주문
    const today = new Date();
    delayedOrders = allOrders.filter(order => {
      if (order.status === 'SHIPPED' || order.status === 'CANCELLED') return false;
      const dueDate = new Date(order.delivery_date);
      return dueDate < today;
    }).sort((a, b) => {
      const dueDateA = new Date(a.delivery_date);
      const dueDateB = new Date(b.delivery_date);
      return dueDateA - dueDateB;
    });

    renderDelayedOrders();

    // 지연 건수 업데이트
    document.getElementById('delayedCount').innerHTML = delayedOrders.length + '<span class="unit">건</span>';
  } catch (error) {
    console.error('Error loading delayed orders:', error);
  }
}

// ===== 지연 주문 테이블 렌더 =====
function renderDelayedOrders() {
  const tbody = document.getElementById('delayedOrdersBody');
  const countEl = document.getElementById('delayedTableCount');

  if (!delayedOrders || delayedOrders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:#9ca3af;"><i class="fas fa-check-circle"></i> 지연 주문이 없습니다.</td></tr>';
    countEl.textContent = '0건';
    return;
  }

  let html = '';
  delayedOrders.forEach(order => {
    const dueDate = new Date(order.delivery_date);
    const today = new Date();
    const delayDays = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

    const statusBadge = getStatusBadge(order.status);
    const delayBadgeColor = delayDays > 7 ? '#ef4444' : delayDays > 3 ? '#f59e0b' : '#f97316';

    html += `
      <tr>
        <td style="font-weight:600;color:#3b82f6;"><a href="javascript:void(0)" onclick="openOrder('${order.id}')" style="text-decoration:none;color:inherit;">${order.number}</a></td>
        <td>${order.client_name || '-'}</td>
        <td>${order.item_name || '-'}</td>
        <td style="text-align:center;font-size:12px;">${order.size || '-'}</td>
        <td style="text-align:center;">${order.quantity || '-'}</td>
        <td style="text-align:center;font-size:12px;">${formatDate(dueDate)}</td>
        <td style="text-align:center;">
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:${delayBadgeColor}20;color:${delayBadgeColor};font-weight:600;">
            ${delayDays}일
          </span>
        </td>
        <td style="text-align:center;">${statusBadge}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  countEl.textContent = delayedOrders.length + '건';
}

// ===== 상태 배지 =====
function getStatusBadge(status) {
  const statusMap = {
    'CONFIRMED': { label: '확정', color: '#3b82f6' },
    'PRINTING': { label: '인쇄중', color: '#f59e0b' },
    'PRINT_DONE': { label: '인쇄완료', color: '#10b981' },
    'SHIPPED': { label: '출고', color: '#6366f1' },
    'CANCELLED': { label: '취소', color: '#9ca3af' }
  };

  const info = statusMap[status] || { label: status, color: '#9ca3af' };
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:${info.color}20;color:${info.color};font-weight:600;">${info.label}</span>`;
}

// ===== 날짜 포맷 =====
function formatDate(date) {
  if (!date) return '-';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ===== 주문 상세 열기 =====
function openOrder(orderId) {
  window.location.href = `/orders?id=${orderId}`;
}

// ===== CSV 내보내기 =====
async function exportDeliveryAnalyticsCsv() {
  try {
    var from = document.getElementById('dateFrom').value;
    var to = document.getElementById('dateTo').value;
    if (!from || !to) {
      showToast('기간을 선택해주세요.', 'warning');
      return;
    }
    var res = await authFetch('/api/delivery-analytics/export/csv?from=' + from + '&to=' + to);
    if (!res.ok) throw new Error('서버 오류');
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '납기분석_' + from + '_' + to + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    showToast('CSV 내보내기 실패: ' + e.message, 'error');
  }
}

// ===== 페이지 로드 시 초기화 =====
window.addEventListener('load', initDeliveryAnalytics);
