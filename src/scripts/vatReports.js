// 부가세 신고서 자동집계
var vatData = null;

function fmt(n) { return (n || 0).toLocaleString(); }
// 초기화는 파일 맨 아래에서 실행 (window.* 함수 정의 이후)

window.loadVatSummary = async function() {
  var elYear = document.getElementById('vatYear'); if (!elYear) { console.warn('[vatReports] #vatYear not found'); return; }
  var elQuarter = document.getElementById('vatQuarter'); if (!elQuarter) { console.warn('[vatReports] #vatQuarter not found'); return; }
  var year = elYear.value;
  var quarter = elQuarter.value;
  var salesPanel = document.getElementById('vatSalesPanel');
  if (salesPanel) salesPanel.innerHTML = '<div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><p>로딩 중...</p></div>';
  var purPanel = document.getElementById('vatPurchasePanel');
  if (purPanel) purPanel.innerHTML = '<div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><p>로딩 중...</p></div>';
  try {
    var res = await axios.get('/api/vat/summary?year=' + year + '&quarter=' + quarter);
    if (!res.data.success) return;
    vatData = res.data.data;
    renderVatSummary(vatData);
  } catch (e) {
    console.error('vat summary error:', e);
    showToast('집계 실패: ' + (e.response?.data?.error || e.message), 'error');
  }
};

function renderVatSummary(d) {
  var elSalesCount = document.getElementById('vatSalesCount'); if (!elSalesCount) { console.warn('[vatReports] #vatSalesCount not found'); return; }
  elSalesCount.textContent = d.sales.count;
  var elSalesSupply = document.getElementById('vatSalesSupply'); if (!elSalesSupply) { console.warn('[vatReports] #vatSalesSupply not found'); return; }
  elSalesSupply.textContent = fmt(d.sales.supply_amount);
  var elSalesTax = document.getElementById('vatSalesTax'); if (!elSalesTax) { console.warn('[vatReports] #vatSalesTax not found'); return; }
  elSalesTax.textContent = '세액 ' + fmt(d.sales.tax_amount);
  var elPurSupply = document.getElementById('vatPurchaseSupply'); if (!elPurSupply) { console.warn('[vatReports] #vatPurchaseSupply not found'); return; }
  elPurSupply.textContent = fmt(d.purchase.supply_amount);
  var elPurTax = document.getElementById('vatPurchaseTax'); if (!elPurTax) { console.warn('[vatReports] #vatPurchaseTax not found'); return; }
  elPurTax.textContent = '세액 ' + fmt(d.purchase.tax_amount);
  var elPayable = document.getElementById('vatPayable'); if (!elPayable) { console.warn('[vatReports] #vatPayable not found'); return; }
  elPayable.textContent = fmt(d.payable_tax);

  // 매출 목록
  var salesHtml = '';
  if (d.sales.list && d.sales.list.length > 0) {
    salesHtml = '<table class="w-full text-xs"><thead><tr class="bg-gray-50">'
      + '<th class="px-2 py-1.5 text-left text-gray-600">발행일</th>'
      + '<th class="px-2 py-1.5 text-left text-gray-600">계산서번호</th>'
      + '<th class="px-2 py-1.5 text-left text-gray-600">거래처</th>'
      + '<th class="px-2 py-1.5 text-left text-gray-600">사업자번호</th>'
      + '<th class="px-2 py-1.5 text-right text-gray-600">공급가액</th>'
      + '<th class="px-2 py-1.5 text-right text-gray-600">세액</th>'
      + '<th class="px-2 py-1.5 text-right text-gray-600">합계</th>'
      + '</tr></thead><tbody>';
    d.sales.list.forEach(function(it) {
      salesHtml += '<tr class="border-b border-gray-100 hover:bg-blue-50/30">'
        + '<td class="px-2 py-1">' + (it.issue_date || '') + '</td>'
        + '<td class="px-2 py-1">' + (it.invoice_number || '') + '</td>'
        + '<td class="px-2 py-1">' + (it.buyer_name || '') + '</td>'
        + '<td class="px-2 py-1 text-gray-500">' + (it.buyer_brn || '') + '</td>'
        + '<td class="px-2 py-1 text-right" style="font-variant-numeric:tabular-nums;">' + fmt(it.supply_amount) + '</td>'
        + '<td class="px-2 py-1 text-right" style="font-variant-numeric:tabular-nums;">' + fmt(it.tax_amount) + '</td>'
        + '<td class="px-2 py-1 text-right font-medium" style="font-variant-numeric:tabular-nums;">' + fmt(it.total_amount) + '</td>'
        + '</tr>';
    });
    salesHtml += '</tbody></table>';
  } else {
    salesHtml = '<p class="text-sm text-gray-400 text-center py-6">해당 기간 매출 세금계산서가 없습니다.</p>';
  }
  var elSalesPanel = document.getElementById('vatSalesPanel'); if (!elSalesPanel) { console.warn('[vatReports] #vatSalesPanel not found'); return; }
  elSalesPanel.innerHTML = salesHtml;

  // 매입 목록
  var purHtml = '';
  if (d.purchase.list && d.purchase.list.length > 0) {
    purHtml = '<table class="w-full text-xs"><thead><tr class="bg-gray-50">'
      + '<th class="px-2 py-1.5 text-left text-gray-600">발행일</th>'
      + '<th class="px-2 py-1.5 text-left text-gray-600">승인번호</th>'
      + '<th class="px-2 py-1.5 text-left text-gray-600">공급자</th>'
      + '<th class="px-2 py-1.5 text-left text-gray-600">사업자번호</th>'
      + '<th class="px-2 py-1.5 text-right text-gray-600">공급가액</th>'
      + '<th class="px-2 py-1.5 text-right text-gray-600">세액</th>'
      + '<th class="px-2 py-1.5 text-right text-gray-600">합계</th>'
      + '</tr></thead><tbody>';
    d.purchase.list.forEach(function(it) {
      purHtml += '<tr class="border-b border-gray-100 hover:bg-blue-50/30">'
        + '<td class="px-2 py-1">' + (it.issue_date || '') + '</td>'
        + '<td class="px-2 py-1 text-gray-500">' + (it.nts_confirm_number || '') + '</td>'
        + '<td class="px-2 py-1">' + (it.supplier_name || '') + '</td>'
        + '<td class="px-2 py-1 text-gray-500">' + (it.supplier_brn || '') + '</td>'
        + '<td class="px-2 py-1 text-right" style="font-variant-numeric:tabular-nums;">' + fmt(it.supply_amount) + '</td>'
        + '<td class="px-2 py-1 text-right" style="font-variant-numeric:tabular-nums;">' + fmt(it.tax_amount) + '</td>'
        + '<td class="px-2 py-1 text-right font-medium" style="font-variant-numeric:tabular-nums;">' + fmt(it.total_amount) + '</td>'
        + '</tr>';
    });
    purHtml += '</tbody></table>';
  } else {
    purHtml = '<p class="text-sm text-gray-400 text-center py-6">해당 기간 매입 세금계산서가 없습니다. (홈택스 수집 후 표시됨)</p>';
  }
  var elPurPanel = document.getElementById('vatPurchasePanel'); if (!elPurPanel) { console.warn('[vatReports] #vatPurchasePanel not found'); return; }
  elPurPanel.innerHTML = purHtml;
}

window.switchVatTab = function(tab) {
  ['sales', 'purchase', 'history'].forEach(function(t) {
    var btn = document.getElementById('tabVat' + t.charAt(0).toUpperCase() + t.slice(1));
    var panel = document.getElementById('vat' + t.charAt(0).toUpperCase() + t.slice(1) + 'Panel');
    if (!btn || !panel) { console.warn('[vatReports] tab elements not found: ' + t); return; }
    if (t === tab) {
      btn.className = 'px-4 py-2 text-sm font-medium border-b-2 border-blue-600 text-blue-600';
      panel.classList.remove('hidden');
    } else {
      btn.className = 'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700';
      panel.classList.add('hidden');
    }
  });
  if (tab === 'history') loadVatHistory();
};

async function loadVatHistory() {
  try {
    var res = await axios.get('/api/vat/reports');
    if (!res.data.success) return;
    var list = res.data.data || [];
    if (!list.length) {
      var elHistEmpty = document.getElementById('vatHistoryPanel'); if (!elHistEmpty) { console.warn('[vatReports] #vatHistoryPanel not found'); return; }
      elHistEmpty.innerHTML = '<p class="text-sm text-gray-400 text-center py-6">신고 이력이 없습니다.</p>';
      return;
    }
    var html = '<table class="w-full text-xs"><thead><tr class="bg-gray-50">'
      + '<th class="px-2 py-1.5 text-left text-gray-600">기수</th>'
      + '<th class="px-2 py-1.5 text-left text-gray-600">기간</th>'
      + '<th class="px-2 py-1.5 text-right text-gray-600">매출 공급가</th>'
      + '<th class="px-2 py-1.5 text-right text-gray-600">매출 세액</th>'
      + '<th class="px-2 py-1.5 text-right text-gray-600">매입 공급가</th>'
      + '<th class="px-2 py-1.5 text-right text-gray-600">매입 세액</th>'
      + '<th class="px-2 py-1.5 text-right text-gray-600">납부세액</th>'
      + '<th class="px-2 py-1.5 text-center text-gray-600">상태</th>'
      + '<th class="px-2 py-1.5 text-center text-gray-600">조치</th>'
      + '</tr></thead><tbody>';
    list.forEach(function(r) {
      var statusBadge = r.status === 'SUBMITTED'
        ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700"><i class="fas fa-check-circle text-[7px] mr-0.5"></i>신고완료</span>'
        : '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700"><i class="far fa-clock text-[7px] mr-0.5"></i>임시저장</span>';
      html += '<tr class="border-b border-gray-100 hover:bg-blue-50/30">'
        + '<td class="px-2 py-1.5">' + r.report_year + '년 ' + r.report_quarter + '기</td>'
        + '<td class="px-2 py-1.5 text-gray-500">' + r.period_start + ' ~ ' + r.period_end + '</td>'
        + '<td class="px-2 py-1.5 text-right" style="font-variant-numeric:tabular-nums;">' + fmt(r.sales_supply_amount) + '</td>'
        + '<td class="px-2 py-1.5 text-right" style="font-variant-numeric:tabular-nums;">' + fmt(r.sales_tax_amount) + '</td>'
        + '<td class="px-2 py-1.5 text-right" style="font-variant-numeric:tabular-nums;">' + fmt(r.purchase_supply_amount) + '</td>'
        + '<td class="px-2 py-1.5 text-right" style="font-variant-numeric:tabular-nums;">' + fmt(r.purchase_tax_amount) + '</td>'
        + '<td class="px-2 py-1.5 text-right font-bold text-red-600" style="font-variant-numeric:tabular-nums;">' + fmt(r.payable_tax) + '</td>'
        + '<td class="px-2 py-1.5 text-center">' + statusBadge + '</td>'
        + '<td class="px-2 py-1.5 text-center">'
        + (r.status !== 'SUBMITTED' ? '<button onclick="submitVat(' + r.id + ')" class="text-[10px] text-green-600 hover:underline">신고완료</button>' : '-')
        + '</td>'
        + '</tr>';
    });
    html += '</tbody></table>';
    var elHist = document.getElementById('vatHistoryPanel'); if (!elHist) { console.warn('[vatReports] #vatHistoryPanel not found'); return; }
    elHist.innerHTML = html;
  } catch (e) {
    console.error('vat history error:', e);
  }
}

window.saveVatReport = async function() {
  if (!vatData) { showToast('먼저 집계를 실행하세요.', 'error'); return; }
  try {
    await axios.post('/api/vat/reports', {
      report_year: vatData.report_year,
      report_quarter: vatData.report_quarter,
      period_start: vatData.period_start,
      period_end: vatData.period_end,
      sales_count: vatData.sales.count,
      sales_supply_amount: vatData.sales.supply_amount,
      sales_tax_amount: vatData.sales.tax_amount,
      purchase_count: vatData.purchase.count,
      purchase_supply_amount: vatData.purchase.supply_amount,
      purchase_tax_amount: vatData.purchase.tax_amount,
      payable_tax: vatData.payable_tax,
    });
    showToast('신고 이력이 저장되었습니다.', 'success');
    loadVatHistory();
  } catch (e) {
    showToast('저장 실패: ' + (e.response?.data?.error || e.message), 'error');
  }
};

window.submitVat = async function(id) {
  if (!(await showConfirm('신고 완료 처리하시겠습니까?'))) return;
  try {
    await axios.patch('/api/vat/reports/' + id + '/submit');
    loadVatHistory();
  } catch (e) {
    showToast('실패: ' + (e.response?.data?.error || e.message), 'error');
  }
};

window.exportVatExcel = function() {
  if (!vatData) { showToast('먼저 집계를 실행하세요.', 'error'); return; }
  // CSV 형식으로 다운로드 (Excel 호환)
  var BOM = '\uFEFF';
  var lines = [];
  lines.push('부가세 신고 자료 - ' + vatData.report_year + '년 ' + vatData.report_quarter + '기');
  lines.push('기간: ' + vatData.period_start + ' ~ ' + vatData.period_end);
  lines.push('');
  lines.push('[매출 세금계산서]');
  lines.push('발행일,계산서번호,거래처,사업자번호,공급가액,세액,합계');
  vatData.sales.list.forEach(function(it) {
    lines.push([it.issue_date, it.invoice_number, it.buyer_name, it.buyer_brn, it.supply_amount, it.tax_amount, it.total_amount].join(','));
  });
  lines.push('');
  lines.push('매출 합계,,,,' + vatData.sales.supply_amount + ',' + vatData.sales.tax_amount + ',' + (vatData.sales.supply_amount + vatData.sales.tax_amount));
  lines.push('');
  lines.push('[매입 세금계산서]');
  lines.push('발행일,승인번호,공급자,사업자번호,공급가액,세액,합계');
  (vatData.purchase.list || []).forEach(function(it) {
    lines.push([it.issue_date, it.nts_confirm_number, it.supplier_name, it.supplier_brn, it.supply_amount, it.tax_amount, it.total_amount].join(','));
  });
  lines.push('');
  lines.push('매입 합계,,,,' + vatData.purchase.supply_amount + ',' + vatData.purchase.tax_amount + ',' + (vatData.purchase.supply_amount + vatData.purchase.tax_amount));
  lines.push('');
  lines.push('납부세액,,,,,' + vatData.payable_tax);

  var blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'vat_' + vatData.report_year + '_Q' + vatData.report_quarter + '.csv';
  a.click();
  URL.revokeObjectURL(url);
};

// ============================================================
// 초기화 (모든 window.* 함수 정의 이후 실행)
// ============================================================
(function init() {
  var year = new Date().getFullYear();
  var sel = document.getElementById('vatYear');
  if (!sel) { console.warn('[vatReports] #vatYear not found'); return; }
  for (var y = year - 2; y <= year + 1; y++) {
    var opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + '년';
    if (y === year) opt.selected = true;
    sel.appendChild(opt);
  }
  var month = new Date().getMonth() + 1;
  var quarter = Math.ceil(month / 3);
  var elQ = document.getElementById('vatQuarter'); if (!elQ) { console.warn('[vatReports] #vatQuarter not found'); return; }
  elQ.value = quarter;
  window.loadVatSummary();
  window.loadVatHistory();
})();
