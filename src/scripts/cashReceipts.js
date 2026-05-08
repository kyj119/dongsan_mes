var currentPage = 1;

var statusLabels = {
  'DRAFT': '작성중',
  'ISSUED': '발행완료',
  'FAILED': '전송실패',
  'CANCELLED': '취소',
  'NTS_SUCCESS': '국세청 전송성공',
  'NTS_FAILED': '국세청 전송실패'
};

var statusColors = {
  'DRAFT': 'bg-gray-100 text-gray-600',
  'ISSUED': 'bg-blue-50 text-blue-700',
  'FAILED': 'bg-red-50 text-red-700',
  'CANCELLED': 'bg-gray-100 text-gray-400 line-through',
  'NTS_SUCCESS': 'bg-green-50 text-green-700',
  'NTS_FAILED': 'bg-orange-50 text-orange-700'
};

// Wrapper for inline delete confirmation
async function confirmDeleteReceipt(id) {
  if (!(await showConfirm('정말 삭제하시겠습니까?', { danger: true }))) return;
  deleteReceipt(id);
}

var identityLabels = {
  'PHONE': '휴대폰',
  'CARD': '카드번호',
  'BRN': '사업자번호',
  'RESIDENT': '주민번호'
};

var transactionTypeLabels = {
  'EXPENSE': '지출',
  'INCOME': '수입'
};

function fmt(n) {
  return (parseFloat(n) || 0).toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  var date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR');
}

function loadReceipts(page) {
  currentPage = page || 1;

  var status = document.getElementById('statusFilter').value;
  var dateFrom = document.getElementById('dateFrom').value;
  var dateTo = document.getElementById('dateTo').value;
  var search = document.getElementById('searchInput').value;

  var params = new URLSearchParams();
  params.append('page', currentPage);
  params.append('limit', 20);
  if (status) params.append('status', status);
  if (dateFrom) params.append('dateFrom', dateFrom);
  if (dateTo) params.append('dateTo', dateTo);
  if (search) params.append('search', search);

  axios.get('/api/cash-receipts?' + params.toString())
    .then(function(response) {
      displayReceipts(response.data.data || []);
      renderPagination(response.data.pagination || {});
    })
    .catch(function(error) {
      console.error('Error loading receipts:', error);
      showToast('현금영수증 목록을 불러오는 중 오류가 발생했습니다.', 'error');
      document.getElementById('receiptsTable').innerHTML = '<tr><td colspan="9" class="px-4 py-12 text-center"><div class="flex flex-col items-center"><i class="fas fa-exclamation-circle text-4xl text-red-300 mb-3"></i><p class="text-red-500 text-sm">오류가 발생했습니다</p></div></td></tr>';
    });
}

function displayReceipts(items) {
  if (!items || items.length === 0) {
    document.getElementById('receiptsTable').innerHTML = '<tr><td colspan="9" class="px-4 py-12 text-center"><div class="flex flex-col items-center"><i class="fas fa-receipt text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 text-sm">데이터가 없습니다</p></div></td></tr>';
    return;
  }

  var html = '';
  items.forEach(function(item) {
    var statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ' + statusColors[item.status] + '">' + (statusLabels[item.status] || item.status) + '</span>';

    var actionHtml = '';
    if (item.status === 'DRAFT') {
      actionHtml = '<button onclick="issueReceipt(\'' + escapeHtml(item.id) + '\')" class="text-blue-600 hover:text-blue-900 text-xs font-medium mr-2">발행</button>' +
                   '<button onclick="confirmDeleteReceipt(\'' + escapeHtml(item.id) + '\')" class="text-red-600 hover:text-red-900 text-xs font-medium">삭제</button>';
    } else if (item.status === 'ISSUED' || item.status === 'NTS_SUCCESS') {
      actionHtml = '<button onclick="cancelReceipt(\'' + escapeHtml(item.id) + '\')" class="text-red-600 hover:text-red-900 text-xs font-medium mr-2">취소</button>' +
                   '<button onclick="openPrintURL(\'' + escapeHtml(item.id) + '\')" class="text-gray-600 hover:text-gray-900 text-xs font-medium">인쇄</button>';
    } else if (item.status === 'FAILED') {
      actionHtml = '<span class="text-gray-500 text-xs">재시도 불가</span>';
    } else if (item.status === 'SENT' || item.status === 'NTS_FAILED') {
      actionHtml = '<button onclick="refreshStatus(\'' + escapeHtml(item.id) + '\')" class="text-gray-600 hover:text-gray-900 text-xs font-medium">상태새로고침</button>';
    }

    html += '<tr class="hover:bg-blue-50/30 border-b border-gray-100">' +
            '<td class="px-4 py-3 text-sm text-gray-900"><button onclick="viewReceiptDetail(\'' + escapeHtml(item.id) + '\')" class="text-blue-600 hover:text-blue-900 underline">' + escapeHtml(item.id) + '</button></td>' +
            '<td class="px-4 py-3 text-sm text-gray-700">' + escapeHtml(item.clientName || '-') + '</td>' +
            '<td class="px-4 py-3 text-sm text-gray-700">' + formatDate(item.transactionDate) + '</td>' +
            '<td class="px-4 py-3 text-sm text-gray-700">' + (identityLabels[item.identityType] || item.identityType || '-') + '</td>' +
            '<td class="px-4 py-3 text-sm text-gray-900 text-right">' + fmt(item.supplyAmount) + '</td>' +
            '<td class="px-4 py-3 text-sm text-gray-900 text-right">' + fmt(item.taxAmount) + '</td>' +
            '<td class="px-4 py-3 text-sm text-gray-900 text-right font-medium">' + fmt(item.totalAmount) + '</td>' +
            '<td class="px-4 py-3 text-sm text-center">' + statusBadge + '</td>' +
            '<td class="px-4 py-3 text-sm text-center">' + actionHtml + '</td>' +
            '</tr>';
  });

  document.getElementById('receiptsTable').innerHTML = html;
}

function renderPagination(pagination) {
  var pageCount = pagination.pageCount || 1;
  var currentPage_ = pagination.page || 1;

  if (pageCount <= 1) {
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  var html = '';
  var startPage = Math.max(1, currentPage_ - 2);
  var endPage = Math.min(pageCount, currentPage_ + 2);

  if (currentPage_ > 1) {
    html += '<button onclick="loadReceipts(1)" class="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"><i class="fas fa-chevron-left"></i></button>';
    html += '<button onclick="loadReceipts(' + (currentPage_ - 1) + ')" class="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50">이전</button>';
  }

  for (var i = startPage; i <= endPage; i++) {
    if (i === currentPage_) {
      html += '<button class="px-3 py-1 bg-blue-600 text-white rounded text-sm font-medium">' + i + '</button>';
    } else {
      html += '<button onclick="loadReceipts(' + i + ')" class="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50">' + i + '</button>';
    }
  }

  if (currentPage_ < pageCount) {
    html += '<button onclick="loadReceipts(' + (currentPage_ + 1) + ')" class="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50">다음</button>';
    html += '<button onclick="loadReceipts(' + pageCount + ')" class="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"><i class="fas fa-chevron-right"></i></button>';
  }

  document.getElementById('pagination').innerHTML = html;
}

function openCreateModal() {
  // Reset form
  document.getElementById('transactionDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('transactionType').value = '';
  document.getElementById('identityType').value = '';
  document.getElementById('identityNumber').value = '';
  document.getElementById('supplyAmount').value = '';
  document.getElementById('taxAmount').value = '';
  document.getElementById('totalAmount').value = '';
  document.getElementById('serviceCharge').value = fmtMoneyInput(0);
  document.getElementById('itemName').value = '';
  document.getElementById('memo').value = '';
  document.getElementById('clientSelect').value = '';

  // Load clients dropdown
  axios.get('/api/clients?limit=1000')
    .then(function(response) {
      var clients = response.data.data || [];
      var options = '<option value="">거래처를 선택하세요</option>';
      clients.forEach(function(client) {
        options += '<option value="' + escapeHtml(client.id) + '">' + escapeHtml(client.name) + '</option>';
      });
      document.getElementById('clientSelect').innerHTML = options;
    })
    .catch(function(error) {
      console.error('Error loading clients:', error);
    });

  document.getElementById('createModal').classList.remove('hidden');
}

function createReceipt() {
  var transactionDate = document.getElementById('transactionDate').value;
  var transactionType = document.getElementById('transactionType').value;
  var identityType = document.getElementById('identityType').value;
  var identityNumber = document.getElementById('identityNumber').value;
  var supplyAmount = parseMoney(document.getElementById('supplyAmount').value);
  var taxAmount = parseMoney(document.getElementById('taxAmount').value);
  var totalAmount = parseMoney(document.getElementById('totalAmount').value);
  var serviceCharge = parseMoney(document.getElementById('serviceCharge').value);
  var itemName = document.getElementById('itemName').value;
  var memo = document.getElementById('memo').value;
  var clientId = document.getElementById('clientSelect').value;

  if (!transactionDate || !transactionType || !identityType || !identityNumber || supplyAmount <= 0) {
    showToast('필수 항목을 모두 입력해주세요.', 'warning');
    return;
  }

  var data = {
    transactionDate: transactionDate,
    transactionType: transactionType,
    identityType: identityType,
    identityNumber: identityNumber,
    supplyAmount: supplyAmount,
    taxAmount: taxAmount,
    totalAmount: totalAmount,
    serviceCharge: serviceCharge,
    itemName: itemName,
    memo: memo
  };

  if (clientId) {
    data.clientId = clientId;
  }

  axios.post('/api/cash-receipts', data)
    .then(function(response) {
      showToast('현금영수증이 작성되었습니다.', 'success');
      document.getElementById('createModal').classList.add('hidden');
      loadReceipts(1);
    })
    .catch(function(error) {
      console.error('Error creating receipt:', error);
      showToast('현금영수증 작성 중 오류가 발생했습니다: ' + (error.response?.data?.message || error.message), 'error');
    });
}

function viewReceiptDetail(id) {
  axios.get('/api/cash-receipts/' + encodeURIComponent(id))
    .then(function(response) {
      var receipt = response.data.data;

      var statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ' + statusColors[receipt.status] + '">' + (statusLabels[receipt.status] || receipt.status) + '</span>';

      var contentHtml = '<div class="space-y-4">' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div><label class="text-xs font-medium text-gray-500">관리번호</label><p class="text-sm font-medium text-gray-900">' + escapeHtml(receipt.id) + '</p></div>' +
          '<div><label class="text-xs font-medium text-gray-500">상태</label><p class="text-sm">' + statusBadge + '</p></div>' +
          '<div><label class="text-xs font-medium text-gray-500">거래일</label><p class="text-sm text-gray-900">' + formatDate(receipt.transactionDate) + '</p></div>' +
          '<div><label class="text-xs font-medium text-gray-500">거래유형</label><p class="text-sm text-gray-900">' + (transactionTypeLabels[receipt.transactionType] || receipt.transactionType) + '</p></div>' +
          '<div><label class="text-xs font-medium text-gray-500">식별유형</label><p class="text-sm text-gray-900">' + (identityLabels[receipt.identityType] || receipt.identityType) + '</p></div>' +
          '<div><label class="text-xs font-medium text-gray-500">식별번호</label><p class="text-sm text-gray-900">' + escapeHtml(receipt.identityNumber) + '</p></div>' +
        '</div>' +
        '<div class="border-t border-gray-200 pt-4">' +
          '<h3 class="text-sm font-medium text-gray-900 mb-3">금액 정보</h3>' +
          '<div class="grid grid-cols-2 gap-4">' +
            '<div><label class="text-xs font-medium text-gray-500">공급가액</label><p class="text-sm font-medium text-gray-900">' + fmt(receipt.supplyAmount) + '원</p></div>' +
            '<div><label class="text-xs font-medium text-gray-500">세액</label><p class="text-sm font-medium text-gray-900">' + fmt(receipt.taxAmount) + '원</p></div>' +
            '<div><label class="text-xs font-medium text-gray-500">합계</label><p class="text-sm font-bold text-gray-900">' + fmt(receipt.totalAmount) + '원</p></div>' +
            '<div><label class="text-xs font-medium text-gray-500">봉사료</label><p class="text-sm text-gray-900">' + fmt(receipt.serviceCharge) + '원</p></div>' +
          '</div>' +
        '</div>';

      if (receipt.clientName) {
        contentHtml += '<div class="border-t border-gray-200 pt-4">' +
          '<label class="text-xs font-medium text-gray-500">거래처</label>' +
          '<p class="text-sm text-gray-900">' + escapeHtml(receipt.clientName) + '</p>' +
          '</div>';
      }

      if (receipt.itemName) {
        contentHtml += '<div class="border-t border-gray-200 pt-4">' +
          '<label class="text-xs font-medium text-gray-500">품목명</label>' +
          '<p class="text-sm text-gray-900">' + escapeHtml(receipt.itemName) + '</p>' +
          '</div>';
      }

      if (receipt.memo) {
        contentHtml += '<div class="border-t border-gray-200 pt-4">' +
          '<label class="text-xs font-medium text-gray-500">메모</label>' +
          '<p class="text-sm text-gray-900 whitespace-pre-wrap">' + escapeHtml(receipt.memo) + '</p>' +
          '</div>';
      }

      contentHtml += '<div class="border-t border-gray-200 pt-4 text-xs text-gray-500">' +
        '<p>작성일: ' + formatDate(receipt.createdAt) + '</p>';

      if (receipt.issuedAt) {
        contentHtml += '<p>발행일: ' + formatDate(receipt.issuedAt) + '</p>';
      }

      if (receipt.ntsTransmittedAt) {
        contentHtml += '<p>국세청 전송일: ' + formatDate(receipt.ntsTransmittedAt) + '</p>';
      }

      contentHtml += '</div></div>';

      document.getElementById('detailContent').innerHTML = contentHtml;

      // Action buttons
      var actionHtml = '';
      if (receipt.status === 'DRAFT') {
        actionHtml = '<button onclick="issueReceipt(\'' + escapeHtml(receipt.id) + '\')" class="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700">' +
                     '<i class="fas fa-paper-plane mr-2"></i>발행</button>' +
                     '<button onclick="confirmDeleteReceipt(\'' + escapeHtml(receipt.id) + '\')" class="bg-red-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-red-700">' +
                     '<i class="fas fa-trash mr-2"></i>삭제</button>';
      } else if (receipt.status === 'ISSUED' || receipt.status === 'NTS_SUCCESS') {
        actionHtml = '<button onclick="cancelReceipt(\'' + escapeHtml(receipt.id) + '\')" class="bg-red-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-red-700">' +
                     '<i class="fas fa-ban mr-2"></i>취소</button>' +
                     '<button onclick="openPrintURL(\'' + escapeHtml(receipt.id) + '\')" class="border border-gray-300 text-gray-700 bg-white rounded px-4 py-2 text-sm font-medium hover:bg-gray-50">' +
                     '<i class="fas fa-print mr-2"></i>인쇄</button>';
      } else if (receipt.status === 'SENT' || receipt.status === 'NTS_FAILED') {
        actionHtml = '<button onclick="refreshStatus(\'' + escapeHtml(receipt.id) + '\')" class="border border-gray-300 text-gray-700 bg-white rounded px-4 py-2 text-sm font-medium hover:bg-gray-50">' +
                     '<i class="fas fa-sync-alt mr-2"></i>상태새로고침</button>';
      }

      actionHtml += '<button onclick="document.getElementById(\'detailModal\').classList.add(\'hidden\')" class="border border-gray-300 text-gray-700 bg-white rounded px-4 py-2 text-sm font-medium hover:bg-gray-50">' +
                    '닫기</button>';

      document.getElementById('detailActions').innerHTML = actionHtml;
      document.getElementById('detailModal').classList.remove('hidden');
    })
    .catch(function(error) {
      console.error('Error loading receipt detail:', error);
      showToast('현금영수증 정보를 불러오는 중 오류가 발생했습니다.', 'error');
    });
}

async function issueReceipt(id) {
  if (!(await showConfirm('현금영수증을 발행하시겠습니까?'))) return;

  axios.post('/api/cash-receipts/' + encodeURIComponent(id) + '/issue')
    .then(function(response) {
      showToast('현금영수증이 발행되었습니다.', 'success');
      document.getElementById('detailModal').classList.add('hidden');
      loadReceipts(currentPage);
    })
    .catch(function(error) {
      console.error('Error issuing receipt:', error);
      showToast('현금영수증 발행 중 오류가 발생했습니다: ' + (error.response?.data?.message || error.message), 'error');
    });
}

async function cancelReceipt(id) {
  if (!(await showConfirm('현금영수증을 취소하시겠습니까? 이 작업은 되돌릴 수 없습니다.', { danger: true }))) return;

  axios.post('/api/cash-receipts/' + encodeURIComponent(id) + '/cancel')
    .then(function(response) {
      showToast('현금영수증이 취소되었습니다.', 'success');
      document.getElementById('detailModal').classList.add('hidden');
      loadReceipts(currentPage);
    })
    .catch(function(error) {
      console.error('Error cancelling receipt:', error);
      showToast('현금영수증 취소 중 오류가 발생했습니다: ' + (error.response?.data?.message || error.message), 'error');
    });
}

function refreshStatus(id) {
  axios.post('/api/cash-receipts/' + encodeURIComponent(id) + '/refresh-status')
    .then(function(response) {
      showToast('상태가 업데이트되었습니다.', 'success');
      document.getElementById('detailModal').classList.add('hidden');
      loadReceipts(currentPage);
    })
    .catch(function(error) {
      console.error('Error refreshing status:', error);
      showToast('상태 업데이트 중 오류가 발생했습니다: ' + (error.response?.data?.message || error.message), 'error');
    });
}

function openPrintURL(id) {
  axios.get('/api/cash-receipts/' + encodeURIComponent(id) + '/print-url')
    .then(function(response) {
      var printUrl = response.data.data?.printUrl;
      if (printUrl) {
        window.open(printUrl, '_blank');
      } else {
        showToast('인쇄 URL을 가져올 수 없습니다.', 'error');
      }
    })
    .catch(function(error) {
      console.error('Error getting print URL:', error);
      showToast('인쇄 URL 조회 중 오류가 발생했습니다.', 'error');
    });
}

async function deleteReceipt(id) {
  axios.delete('/api/cash-receipts/' + encodeURIComponent(id))
    .then(function(response) {
      showToast('현금영수증이 삭제되었습니다.', 'success');
      loadReceipts(currentPage);
    })
    .catch(function(error) {
      console.error('Error deleting receipt:', error);
      showToast('현금영수증 삭제 중 오류가 발생했습니다: ' + (error.response?.data?.message || error.message), 'error');
    });
}

function calcTax() {
  var supplyAmount = parseMoney(document.getElementById('supplyAmount').value);
  var serviceCharge = parseMoney(document.getElementById('serviceCharge').value);

  var taxAmount = Math.round(supplyAmount * 0.1);
  var totalAmount = supplyAmount + taxAmount + serviceCharge;

  document.getElementById('taxAmount').value = fmtMoneyInput(taxAmount);
  document.getElementById('totalAmount').value = fmtMoneyInput(totalAmount);
}

document.addEventListener('DOMContentLoaded', function() {
  loadReceipts(1);
});
