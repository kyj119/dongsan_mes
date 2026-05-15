// ============================================================================
// 고객 포털 세금계산서 스크립트
// ============================================================================

// Skeleton loading
(function() {
  var el = document.getElementById('invoices-tbody');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(5, 6);
})();

var INV_STATUS = {
  ISSUED: { label: '발행', cls: 'bg-green-50 text-green-700' },
  PENDING: { label: '대기', cls: 'bg-amber-50 text-amber-700' },
  CANCELLED: { label: '취소', cls: 'bg-red-50 text-red-700' },
};

async function loadInvoices() {
  try {
    const res = await axios.get('/api/portal/invoices');
    renderInvoices(res.data.data || []);
  } catch (e) { console.error(e); }
}

function renderInvoices(invoices) {
  const tbody = document.getElementById('invoices-tbody');
  if (!tbody) return;

  if (invoices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">세금계산서 내역이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = invoices.map(i => {
    const s = INV_STATUS[i.status] || { label: i.status, cls: 'bg-gray-100' };
    return `<tr class="border-b hover:bg-blue-50">
      <td class="px-3 py-2 text-sm font-mono">${i.invoice_number || '-'}</td>
      <td class="px-3 py-2 text-sm">${i.issue_date || '-'}</td>
      <td class="px-3 py-2 text-sm text-right">${Number(i.supply_amount || 0).toLocaleString()}원</td>
      <td class="px-3 py-2 text-sm text-right">${Number(i.tax_amount || 0).toLocaleString()}원</td>
      <td class="px-3 py-2 text-sm text-right font-semibold">${Number(i.total_amount || 0).toLocaleString()}원</td>
      <td class="px-3 py-2 text-sm"><span class="px-2 py-0.5 rounded text-xs ${s.cls}">${s.label}</span></td>
    </tr>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', loadInvoices);
