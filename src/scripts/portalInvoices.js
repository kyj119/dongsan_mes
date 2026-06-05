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
  SENT: { label: '발송', cls: 'bg-green-50 text-green-700' },
  NTS_SUCCESS: { label: '국세청전송', cls: 'bg-blue-50 text-blue-700' },
  NTS_FAILED: { label: '전송실패', cls: 'bg-orange-50 text-orange-700' },
  PENDING: { label: '대기', cls: 'bg-amber-50 text-amber-700' },
  CANCELLED: { label: '취소', cls: 'bg-red-50 text-red-700' },
};
// #344: 발행 완료 상태만 다운로드 가능
var INV_DOWNLOADABLE = ['ISSUED', 'SENT', 'NTS_SUCCESS', 'NTS_FAILED'];
var invPage = 1;

function populateYearFilter() {
  var sel = document.getElementById('inv-year-filter');
  if (!sel || sel.options.length > 1) return;
  var y = new Date().getFullYear();
  var opts = '<option value="">전체 연도</option>';
  for (var i = 0; i < 6; i++) opts += '<option value="' + (y - i) + '">' + (y - i) + '년</option>';
  sel.innerHTML = opts;
}

function onInvYearChange() { loadInvoices(1); }

async function loadInvoices(page) {
  invPage = page || invPage || 1;
  populateYearFilter();
  try {
    var params = ['page=' + invPage, 'limit=20'];
    var yearEl = document.getElementById('inv-year-filter');
    if (yearEl && yearEl.value) params.push('year=' + encodeURIComponent(yearEl.value));
    const res = await axios.get('/api/portal/invoices?' + params.join('&'));
    renderInvoices(res.data.data || []);
    renderInvPagination(res.data.pagination);
  } catch (e) { console.error(e); }
}

function renderInvoices(invoices) {
  const tbody = document.getElementById('invoices-tbody');
  if (!tbody) return;

  if (invoices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">세금계산서 내역이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = invoices.map(i => {
    const s = INV_STATUS[i.status] || { label: i.status, cls: 'bg-gray-100' };
    const dl = INV_DOWNLOADABLE.indexOf(i.status) !== -1
      ? `<button onclick="openInvoicePrint(${i.id})" class="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100" title="인쇄/PDF"><i class="fas fa-download mr-1"></i>받기</button>`
      : '<span class="text-xs text-gray-300">-</span>';
    return `<tr class="border-b hover:bg-blue-50">
      <td class="px-3 py-2 text-sm font-mono">${i.invoice_number || '-'}</td>
      <td class="px-3 py-2 text-sm">${i.issue_date || '-'}</td>
      <td class="px-3 py-2 text-sm text-right">${Number(i.supply_amount || 0).toLocaleString()}원</td>
      <td class="px-3 py-2 text-sm text-right">${Number(i.tax_amount || 0).toLocaleString()}원</td>
      <td class="px-3 py-2 text-sm text-right font-semibold">${Number(i.total_amount || 0).toLocaleString()}원</td>
      <td class="px-3 py-2 text-sm"><span class="px-2 py-0.5 rounded text-xs ${s.cls}">${s.label}</span></td>
      <td class="px-3 py-2 text-sm text-center">${dl}</td>
    </tr>`;
  }).join('');
}

function renderInvPagination(pg) {
  const el = document.getElementById('invoices-pagination');
  if (!el) return;
  if (!pg || pg.total_pages <= 1) {
    el.innerHTML = pg ? '<span class="text-xs text-gray-400">총 ' + pg.total + '건</span>' : '';
    return;
  }
  el.innerHTML =
    '<button onclick="loadInvoices(' + (pg.page - 1) + ')" class="px-2 py-1 text-xs border rounded disabled:opacity-40"' + (pg.page <= 1 ? ' disabled' : '') + '><i class="fas fa-chevron-left"></i></button>'
    + '<span class="text-xs text-gray-500">' + pg.page + ' / ' + pg.total_pages + ' (총 ' + pg.total + '건)</span>'
    + '<button onclick="loadInvoices(' + (pg.page + 1) + ')" class="px-2 py-1 text-xs border rounded disabled:opacity-40"' + (pg.page >= pg.total_pages ? ' disabled' : '') + '><i class="fas fa-chevron-right"></i></button>';
}

async function openInvoicePrint(id) {
  try {
    const res = await axios.get('/api/portal/invoices/' + id + '/print-url');
    if (res.data.success && res.data.data && res.data.data.url) {
      window.open(res.data.data.url, '_blank');
    } else {
      showToast((res.data && res.data.error) || '다운로드 URL을 가져올 수 없습니다.', 'error');
    }
  } catch (e) {
    showToast((e.response && e.response.data && e.response.data.error) || '다운로드 실패', 'error');
  }
}

document.addEventListener('DOMContentLoaded', function() { loadInvoices(1); });
