// ============================================================================
// 고객 포털 대시보드 스크립트
// ============================================================================

var STATUS_MAP = {
  PENDING: { label: '접수', cls: 'bg-amber-50 text-amber-700' },
  CONFIRMED: { label: '확정', cls: 'bg-blue-50 text-blue-700' },
  IN_PRODUCTION: { label: '생산중', cls: 'bg-blue-50 text-blue-700' },
  COMPLETED: { label: '완료', cls: 'bg-green-50 text-green-700' },
  SHIPPED: { label: '출고', cls: 'bg-green-50 text-green-700' },
  CANCELLED: { label: '취소', cls: 'bg-red-50 text-red-700' },
};

async function initPortalDashboard() {
  try {
    const res = await axios.get('/api/portal/dashboard');
    const data = res.data.data;
    renderDashboard(data);
  } catch (e) {
    console.error(e);
  }
}

function renderDashboard(data) {
  // KPI 카드
  document.getElementById('total-orders').textContent = (data.totalOrders || 0).toLocaleString();
  document.getElementById('outstanding-balance').textContent = (data.outstandingBalance || 0).toLocaleString() + '원';

  // 최근 주문
  const tbody = document.getElementById('recent-orders-tbody');
  if (!tbody) return;

  if (!data.recentOrders || data.recentOrders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">주문 내역이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = data.recentOrders.map(o => {
    const s = STATUS_MAP[o.status] || { label: o.status, cls: 'bg-gray-100' };
    return `<tr class="hover:bg-blue-50 border-b cursor-pointer" onclick="location.href='/portal/orders?highlight=${o.id}'">
      <td class="px-3 py-2 text-sm font-mono">${o.order_number}</td>
      <td class="px-3 py-2 text-sm">${o.order_date || '-'}</td>
      <td class="px-3 py-2 text-sm"><span class="px-2 py-0.5 rounded text-xs ${s.cls}">${s.label}</span></td>
      <td class="px-3 py-2 text-sm text-right">${o.total_amount ? Number(o.total_amount).toLocaleString() + '원' : '-'}</td>
    </tr>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', initPortalDashboard);
