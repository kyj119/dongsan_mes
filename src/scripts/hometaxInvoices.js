(function() {
  // State
  var currentTab = 'collect';
  var currentPage = 1;
  var pageSize = 20;
  var jobsPage = 1; // 수집 작업 로그 페이지 (invoices 탭의 currentPage와 분리)
  var jobs = [];
  var invoices = [];
  var matchingInvoiceId = null;

  // Constants
  var jobStateLabels = { 0: '접수', 1: '대기', 2: '진행중', 3: '완료' };
  var jobStateColors = {
    0: 'bg-gray-100 text-gray-600',
    1: 'bg-amber-50 text-amber-700',
    2: 'bg-blue-50 text-blue-700',
    3: 'bg-green-50 text-green-700'
  };
  var matchLabels = { 'UNMATCHED': '미매칭', 'MATCHED': '매칭', 'MISMATCH': '불일치' };
  var matchColors = {
    'UNMATCHED': 'bg-gray-100 text-gray-600',
    'MATCHED': 'bg-green-50 text-green-700',
    'MISMATCH': 'bg-red-50 text-red-700'
  };

  // Helpers
  function fmt(n) {
    return (parseFloat(n) || 0).toLocaleString();
  }
  function getStateColor(state, result) {
    if (state === 3 && result !== 100) {
      return 'bg-red-50 text-red-700';
    }
    return jobStateColors[state] || 'bg-gray-100 text-gray-600';
  }

  // 페이지바 렌더 (orders 페이지 스타일 재사용). goFn = onclick에서 호출할 전역 함수명 문자열.
  function renderPagebar(containerId, pagination, goFn) {
    var container = document.getElementById(containerId);
    if (!container) { console.warn('[hometaxInvoices] #' + containerId + ' not found'); return; }
    var total = pagination ? (pagination.total || 0) : 0;
    var page = pagination ? (pagination.page || 1) : 1;
    var totalPages = pagination ? (pagination.total_pages || Math.ceil(total / (pagination.limit || 1)) || 1) : 1;
    if (totalPages <= 1) { container.innerHTML = pagination ? '<span style="font-size:13px;color:#6b7280;">총 ' + total + '건</span>' : ''; return; }
    var btnStyle = 'padding:6px 14px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;background:#fff;';
    var btnDisabled = 'padding:6px 14px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;cursor:not-allowed;background:#f9fafb;color:#9ca3af;';
    var buttons = '';
    var startPage = Math.max(1, page - 2);
    var endPage = Math.min(totalPages, startPage + 4);
    for (var p = startPage; p <= endPage; p++) {
      var active = p === page ? 'padding:6px 12px;border:1px solid #2563eb;border-radius:6px;font-size:13px;cursor:pointer;background:#2563eb;color:#fff;font-weight:600;' : btnStyle;
      buttons += '<button onclick="' + goFn + '(' + p + ')" style="' + active + '">' + p + '</button>';
    }
    container.innerHTML =
      '<button onclick="' + goFn + '(' + (page - 1) + ')" ' + (page <= 1 ? 'disabled' : '') + ' style="' + (page <= 1 ? btnDisabled : btnStyle) + '">이전</button>' +
      buttons +
      '<button onclick="' + goFn + '(' + (page + 1) + ')" ' + (page >= totalPages ? 'disabled' : '') + ' style="' + (page >= totalPages ? btnDisabled : btnStyle) + '">다음</button>' +
      '<span style="font-size:13px;color:#6b7280;margin-left:8px;">' + page + ' / ' + totalPages + ' 페이지 (총 ' + total + '건)</span>';
  }

  // Tab Switching
  window.switchTab = function(tab) {
    currentTab = tab;
    var tabs = ['collect', 'invoices', 'compare'];
    tabs.forEach(function(t) {
      var btn = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
      var panel = document.getElementById('panel' + t.charAt(0).toUpperCase() + t.slice(1));
      if (btn) {
        btn.className = 'tab-btn px-6 py-3 text-sm font-medium border-b-2 ' +
          (t === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700');
      }
      if (panel) {
        panel.classList.toggle('hidden', t !== tab);
        panel.classList.toggle('active', t === tab);
      }
    });

    // Load data for active tab
    if (tab === 'collect') loadJobs();
    if (tab === 'invoices') loadInvoices(1);
    if (tab === 'compare') loadComparison();
  };

  // Initialize date pickers
  (function initDates() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');

    var firstDay = y + '-' + m + '-01';
    var lastDay = new Date(y, now.getMonth() + 1, 0);
    var lastStr = y + '-' + m + '-' + String(lastDay.getDate()).padStart(2, '0');

    document.getElementById('collectStartDate').value = firstDay;
    document.getElementById('collectEndDate').value = lastStr;
    document.getElementById('invoiceFilterStartDate').value = firstDay;
    document.getElementById('invoiceFilterEndDate').value = lastStr;
    document.getElementById('compareMonth').value = y + '-' + m;
  })();

  // ============= 수집 관리 Functions =============

  window.requestCollection = function() {
    var type = document.getElementById('collectType').value;
    var startDate = document.getElementById('collectStartDate').value;
    var endDate = document.getElementById('collectEndDate').value;

    if (!startDate || !endDate) {
      showToast('시작일과 종료일을 입력해주세요.', 'warning');
      return;
    }

    axios.post('/api/hometax-invoices/collect', {
      type: type,
      start_date: startDate,
      end_date: endDate
    }).then(function(r) {
      showToast('수집 요청이 접수되었습니다.', 'warning');
      loadJobs();
    }).catch(function(e) {
      var msg = (e.response && e.response.data && e.response.data.error) || e.message;
      showToast('오류: ' + msg, 'error');
    });
  };

  // hometaxLoadJobs로 노출(전역 loadJobs 오염 회피, hometaxLoadInvoices와 동일 방식). 페이지바 onclick은 hometaxLoadJobs 참조.
  var loadJobs = window.loadJobs = window.hometaxLoadJobs = function(page) {
    jobsPage = page || 1;
    if (jobsPage < 1) jobsPage = 1;
    var _jtb = document.getElementById('jobsTableBody'); // #498: 로딩 인디케이터 컨벤션 통일
    if (_jtb && window.dsSkeleton) _jtb.innerHTML = dsSkeleton.table(9, 6);
    axios.get('/api/hometax-invoices/jobs', { params: { page: jobsPage, limit: pageSize } }).then(function(r) {
      var resp = r.data || {};
      jobs = resp.data || [];
      displayJobs();
      renderPagebar('jobsPagination', resp.pagination, 'window.hometaxLoadJobs');
    }).catch(function(e) {
      console.error('loadJobs error:', e);
      var tb = document.getElementById('jobsTableBody');
      if (tb) tb.innerHTML = '<tr class="table-row"><td colspan="9" class="text-center text-red-500 py-4">데이터 로드 실패</td></tr>';
    });
  };

  function displayJobs() {
    var tbody = document.getElementById('jobsTableBody');
    if (jobs.length === 0) {
      tbody.innerHTML = '<tr class="table-row"><td colspan="9" class="text-center text-gray-500 py-8">수집 작업이 없습니다.</td></tr>';
      return;
    }

    var html = '';
    jobs.forEach(function(job) {
      var state = job.state || 0;
      var stateLabel = jobStateLabels[state] || '불명';
      var stateColor = getStateColor(state, job.result);
      var result = job.result || 0;

      var stateBadge = '<span class="status-badge ' + stateColor + '">';
      if (state === 2) {
        stateBadge += '<i class="spinner"></i>';
      }
      stateBadge += escapeHtml(stateLabel) + '</span>';

      var period = (job.start_date || '') + ' ~ ' + (job.end_date || '');
      var typeLabel = job.type === 'SALES' ? '매출' : job.type === 'PURCHASE' ? '매입' : job.type;
      var createdAt = formatKST(job.created_at, 'date');

      var actionHtml = '';
      if (state !== 0 && state !== 1) {
        actionHtml += '<button onclick="checkJobStatus(' + job.id + ')" class="btn-action btn-sm mr-1">상태 확인</button>';
      }
      if (state === 3 && result === 100) {
        actionHtml += '<button onclick="fetchJobResults(' + job.id + ')" class="btn-action btn-sm">결과 가져오기</button>';
      }

      html += '<tr class="table-row">' +
        '<td>' + escapeHtml(String(job.id)) + '</td>' +
        '<td>' + escapeHtml(typeLabel) + '</td>' +
        '<td>' + escapeHtml(period) + '</td>' +
        '<td class="text-center">' + stateBadge + '</td>' +
        '<td class="text-right">' + escapeHtml(String(result)) + '%</td>' +
        '<td class="text-right">' + escapeHtml(String(job.collected_count || 0)) + '</td>' +
        '<td>' + escapeHtml(job.requested_by || '-') + '</td>' +
        '<td>' + escapeHtml(createdAt) + '</td>' +
        '<td class="text-center">' + actionHtml + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  window.checkJobStatus = function(jobId) {
    axios.get('/api/hometax-invoices/jobs/' + jobId + '/status').then(function(r) {
      var data = r.data.data || r.data;
      var job = jobs.find(function(j) { return j.id === jobId; });
      if (job) {
        job.state = data.state || 0;
        job.result = data.result || 0;
        job.collected_count = data.collected_count || 0;
        displayJobs();
      }
      showToast('상태 업데이트됨: ' + jobStateLabels[data.state || 0], 'warning');
    }).catch(function(e) {
      showToast('상태 확인 실패: ' + (e.response && e.response.data && e.response.data.error || e.message), 'error');
    });
  };

  window.fetchJobResults = async function(jobId) {
    if (!(await showConfirm('이 작업의 결과를 가져와서 시스템에 저장하시겠습니까?'))) return;

    axios.post('/api/hometax-invoices/jobs/' + jobId + '/fetch').then(function(r) {
      showToast('결과 가져오기 완료: ' + (r.data.message || ''), 'success');
      loadJobs();
    }).catch(function(e) {
      showToast('결과 가져오기 실패: ' + (e.response && e.response.data && e.response.data.error || e.message), 'error');
    });
  };

  window.openCertPopup = function() {
    axios.get('/api/hometax-invoices/cert-popup').then(function(r) {
      var url = r.data.url || r.data;
      if (url) {
        window.open(url, 'hometax_cert', 'width=800,height=600,scrollbars=yes');
      }
    }).catch(function(e) {
      showToast('인증 관리 페이지 열기 실패: ' + (e.response && e.response.data && e.response.data.error || e.message), 'error');
    });
  };

  // ============= 수집 내역 Functions =============

  // #tax-cash-scope: 전역 loadInvoices를 점유하면 taxInvoices.js(발행목록 탭)의 loadInvoices를 덮어써
  // 세금계산서 발행목록 탭이 깨짐. IIFE 로컬 함수로 두고 hometaxLoadInvoices로만 노출(전역 미점유).
  var loadInvoices = window.hometaxLoadInvoices = function(page) {
    currentPage = page || 1;
    if (currentPage < 1) currentPage = 1;
    window.htCurrentPage = currentPage; // 페이지 onclick(이전/다음)이 참조할 hometax 전용 페이지 상태(tax의 전역 currentPage와 분리)

    var type = document.getElementById('invoiceFilterType').value;
    var startDate = document.getElementById('invoiceFilterStartDate').value;
    var endDate = document.getElementById('invoiceFilterEndDate').value;
    var matchStatus = document.getElementById('invoiceFilterMatchStatus').value;
    var search = document.getElementById('invoiceFilterSearch').value;

    var params = {
      page: currentPage,
      limit: pageSize
    };
    if (type) params.type = type;
    if (startDate) params.date_from = startDate;
    if (endDate) params.date_to = endDate;
    if (matchStatus) params.match_status = matchStatus;
    if (search) params.search = search;

    axios.get('/api/hometax-invoices', { params: params }).then(function(r) {
      var resp = r.data || {};
      invoices = resp.data || [];
      var pag = resp.pagination || {};
      var total = pag.total || 0;
      var totalPages = pag.total_pages || Math.ceil(total / pageSize) || 1;

      displayInvoices(invoices);

      document.getElementById('paginationInfo').textContent = '총 ' + total + '건 / ' + currentPage + '/' + totalPages + ' 페이지';
      document.getElementById('pageDisplay').textContent = currentPage + ' / ' + totalPages;
    }).catch(function(e) {
      console.error('loadInvoices error:', e);
      document.getElementById('invoicesTableBody').innerHTML = '<tr class="table-row"><td colspan="10" class="text-center text-red-500 py-4">데이터 로드 실패</td></tr>';
    });
  };

  function displayInvoices(items) {
    var tbody = document.getElementById('invoicesTableBody');
    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr class="table-row"><td colspan="10" class="text-center text-gray-500 py-8">수집된 세금계산서가 없습니다.</td></tr>';
      return;
    }

    var html = '';
    items.forEach(function(inv) {
      var typeLabel = inv.type === 'SALES' ? '매출' : inv.type === 'PURCHASE' ? '매입' : inv.type;
      var matchStatus = inv.match_status || 'UNMATCHED';
      var matchLabel = matchLabels[matchStatus] || matchStatus;
      var matchColor = matchColors[matchStatus] || 'bg-gray-100 text-gray-600';
      var date = formatKST(inv.issue_date, 'date');

      var actionHtml = '';
      if (matchStatus === 'UNMATCHED' || matchStatus === 'MISMATCH') {
        actionHtml = '<button onclick="openMatchModal(' + inv.id + ')" class="btn-action btn-sm">매칭</button>';
      } else if (matchStatus === 'MATCHED') {
        actionHtml = '<button onclick="unmatchInvoice(' + inv.id + ')" class="btn-sm" style="background:#f3f4f6; color:#374151;">취소</button>';
      }

      html += '<tr class="table-row">' +
        '<td>' + escapeHtml(inv.authorization_number || '-') + '</td>' +
        '<td>' + escapeHtml(typeLabel) + '</td>' +
        '<td>' + escapeHtml(date) + '</td>' +
        '<td>' + escapeHtml(inv.supplier_name || '-') + '</td>' +
        '<td>' + escapeHtml(inv.recipient_name || '-') + '</td>' +
        '<td class="text-right">' + fmt(inv.supply_amount || 0) + '</td>' +
        '<td class="text-right">' + fmt(inv.tax_amount || 0) + '</td>' +
        '<td class="text-right">' + fmt((parseFloat(inv.supply_amount || 0) + parseFloat(inv.tax_amount || 0))) + '</td>' +
        '<td class="text-center"><span class="match-status-badge ' + matchColor + '">' + escapeHtml(matchLabel) + '</span></td>' +
        '<td class="text-center">' + actionHtml + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  // ============= 대조 비교 Functions =============

  window.loadComparison = function() {
    var month = document.getElementById('compareMonth').value;
    var type = document.getElementById('compareType').value;

    if (!month) {
      showToast('월을 선택해주세요.', 'warning');
      return;
    }

    var params = { month: month };
    if (type) params.type = type;

    axios.get('/api/hometax-invoices/compare', { params: params }).then(function(r) {
      var data = r.data.data || r.data || {};
      displayComparison(data);
    }).catch(function(e) {
      console.error('loadComparison error:', e);
      showToast('비교 데이터 로드 실패: ' + (e.response && e.response.data && e.response.data.error || e.message), 'error');
    });
  };

  function displayComparison(data) {
    var summary = data.summary || {};
    document.getElementById('hometaxCount').textContent = fmt(summary.hometax_count || 0);
    document.getElementById('systemCount').textContent = fmt(summary.system_count || 0);
    document.getElementById('matchedCount').textContent = fmt(summary.matched_count || 0);
    document.getElementById('mismatchCount').textContent = fmt(summary.mismatch_count || 0);

    // Matched
    var matched = data.matched || [];
    var matchedHtml = '';
    if (matched.length === 0) {
      matchedHtml = '<tr class="table-row"><td colspan="4" class="text-center text-gray-500 py-6">데이터 없음</td></tr>';
    } else {
      matched.forEach(function(m) {
        matchedHtml += '<tr class="table-row">' +
          '<td>' + escapeHtml(m.hometax_auth_number || '-') + '</td>' +
          '<td>' + escapeHtml(m.system_invoice_id || '-') + '</td>' +
          '<td class="text-right">' + fmt(m.amount || 0) + '</td>' +
          '<td>' + escapeHtml(m.supplier_name || '-') + '</td>' +
          '</tr>';
      });
    }
    document.getElementById('matchedTableBody').innerHTML = matchedHtml;

    // Hometax Only
    var hometaxOnly = data.hometax_only || [];
    var hometaxOnlyHtml = '';
    if (hometaxOnly.length === 0) {
      hometaxOnlyHtml = '<tr class="table-row"><td colspan="4" class="text-center text-gray-500 py-6">데이터 없음</td></tr>';
    } else {
      hometaxOnly.forEach(function(h) {
        var date = formatKST(h.issue_date, 'date');
        hometaxOnlyHtml += '<tr class="table-row">' +
          '<td>' + escapeHtml(h.authorization_number || '-') + '</td>' +
          '<td>' + escapeHtml(h.supplier_name || '-') + '</td>' +
          '<td class="text-right">' + fmt(h.amount || 0) + '</td>' +
          '<td>' + escapeHtml(date) + '</td>' +
          '</tr>';
      });
    }
    document.getElementById('hometaxOnlyTableBody').innerHTML = hometaxOnlyHtml;

    // System Only
    var systemOnly = data.system_only || [];
    var systemOnlyHtml = '';
    if (systemOnly.length === 0) {
      systemOnlyHtml = '<tr class="table-row"><td colspan="4" class="text-center text-gray-500 py-6">데이터 없음</td></tr>';
    } else {
      systemOnly.forEach(function(s) {
        var date = formatKST(s.issue_date, 'date');
        systemOnlyHtml += '<tr class="table-row">' +
          '<td>' + escapeHtml(s.invoice_id || '-') + '</td>' +
          '<td>' + escapeHtml(s.supplier_name || '-') + '</td>' +
          '<td class="text-right">' + fmt(s.amount || 0) + '</td>' +
          '<td>' + escapeHtml(date) + '</td>' +
          '</tr>';
      });
    }
    document.getElementById('systemOnlyTableBody').innerHTML = systemOnlyHtml;
  }

  // ============= 매칭 Functions =============

  window.openMatchModal = function(invoiceId) {
    matchingInvoiceId = invoiceId;
    document.getElementById('matchTaxInvoiceId').value = '';
    document.getElementById('matchModal').classList.add('show');
  };

  window.closeMatchModal = function() {
    document.getElementById('matchModal').classList.remove('show');
    matchingInvoiceId = null;
  };

  window.confirmMatch = function() {
    if (!matchingInvoiceId) return;
    var taxInvoiceId = document.getElementById('matchTaxInvoiceId').value.trim();

    if (!taxInvoiceId) {
      showToast('세금계산서 관리번호를 입력해주세요.', 'warning');
      return;
    }

    axios.post('/api/hometax-invoices/' + matchingInvoiceId + '/match', {
      action: 'match',
      tax_invoice_id: taxInvoiceId
    }).then(function(r) {
      showToast('매칭이 완료되었습니다.', 'success');
      closeMatchModal();
      loadInvoices(currentPage);
    }).catch(function(e) {
      showToast('매칭 실패: ' + (e.response && e.response.data && e.response.data.error || e.message), 'error');
    });
  };

  window.unmatchInvoice = async function(invoiceId) {
    if (!(await showConfirm('매칭을 취소하시겠습니까?'))) return;

    axios.post('/api/hometax-invoices/' + invoiceId + '/match', {
      action: 'unmatch'
    }).then(function(r) {
      showToast('매칭이 취소되었습니다.', 'success');
      loadInvoices(currentPage);
    }).catch(function(e) {
      showToast('취소 실패: ' + (e.response && e.response.data && e.response.data.error || e.message), 'error');
    });
  };

  // ESC 모달 닫기는 layout.ts 글로벌 핸들러가 처리

  // Modal background click closes modal
  document.addEventListener('click', function(e) {
    var modal = document.getElementById('matchModal');
    if (e.target === modal) {
      closeMatchModal();
    }
  });

  // Initialize
  document.addEventListener('DOMContentLoaded', function() {
    loadJobs();
  });
})();
