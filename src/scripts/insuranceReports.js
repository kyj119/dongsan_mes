// ============================================================================
// 4대보험 신고서 관리 (Phase B5)
// ============================================================================

(function() {
  'use strict';

  var currentYear = new Date().getFullYear();
  var currentDetailId = null;

  function init() {
    // 연도 셀렉트
    ['irYear', 'irGenYear'].forEach(function(id) {
      var sel = document.getElementById(id);
      if (!sel) return;
      for (var y = currentYear; y >= currentYear - 3; y--) {
        var opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y + '년';
        sel.appendChild(opt);
      }
    });
    // 월 셀렉트
    ['irMonth', 'irGenMonth'].forEach(function(id) {
      var sel = document.getElementById(id);
      if (!sel) return;
      var hasAll = id === 'irMonth';
      for (var m = 1; m <= 12; m++) {
        var opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m + '월';
        sel.appendChild(opt);
      }
      if (hasAll) {
        // 전체 옵션은 이미 HTML에 있음
      } else {
        sel.value = new Date().getMonth() + 1;
      }
    });
    irLoadList();
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString('ko-KR');
  }

  // ── 목록 조회 ──
  window.irLoadList = function() {
    var year = document.getElementById('irYear').value || currentYear;
    var month = document.getElementById('irMonth').value || '';
    axios.get('/api/insurance-reports', { params: { year: year, month: month || undefined } })
      .then(function(res) {
        var data = (res.data && res.data.data) || [];
        renderTable(data);
        renderStats(data);
      })
      .catch(function(e) {
        showToast('조회 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
      });
  };

  function renderStats(data) {
    var empTotal = 0, employerTotal = 0, grandTotal = 0;
    data.forEach(function(r) {
      empTotal += Number(r.grand_total_employee || 0);
      employerTotal += Number(r.grand_total_employer || 0);
      grandTotal += Number(r.grand_total || 0);
    });
    document.getElementById('irStatCount').textContent = data.length;
    document.getElementById('irStatEmployee').textContent = fmt(empTotal);
    document.getElementById('irStatEmployer').textContent = fmt(employerTotal);
    document.getElementById('irStatTotal').textContent = fmt(grandTotal);
  }

  function statusBadge(s) {
    var map = {
      'DRAFT': ['bg-gray-100 text-gray-700', '초안'],
      'SUBMITTED': ['bg-blue-50 text-blue-700', '제출'],
      'CONFIRMED': ['bg-green-50 text-green-700', '확정']
    };
    var m = map[s] || ['bg-gray-100 text-gray-700', s || '-'];
    return '<span class="px-2.5 py-0.5 rounded-full text-xs font-medium ' + m[0] + '">' + m[1] + '</span>';
  }

  function typeBadge(t) {
    var map = {
      'MONTHLY': ['bg-blue-50 text-blue-700', '정기'],
      'ACQUISITION': ['bg-green-50 text-green-700', '취득'],
      'LOSS': ['bg-red-50 text-red-700', '상실']
    };
    var m = map[t] || ['bg-gray-100 text-gray-700', t];
    return '<span class="px-2.5 py-0.5 rounded-full text-xs font-medium ' + m[0] + '">' + m[1] + '</span>';
  }

  function renderTable(data) {
    var tbody = document.getElementById('irTableBody');
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center text-gray-400 py-10"><i class="fas fa-inbox text-2xl mb-2 block"></i>신고서가 없습니다. "신고서 생성"을 클릭하세요.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(function(r) {
      var npTotal = Number(r.total_national_pension || 0) + Number(r.employer_national_pension || 0);
      var hiTotal = Number(r.total_health_insurance || 0) + Number(r.employer_health_insurance || 0);
      var ltcTotal = Number(r.total_long_term_care || 0) + Number(r.employer_long_term_care || 0);
      var eiTotal = Number(r.total_employment_insurance || 0) + Number(r.employer_employment_insurance || 0);
      return '<tr class="hover:bg-gray-50 border-b border-gray-100">' +
        '<td class="px-4 py-3 text-center font-medium">' + r.month + '월</td>' +
        '<td class="px-4 py-3 text-center">' + typeBadge(r.report_type) + '</td>' +
        '<td class="px-4 py-3 text-right tabular-nums">' + (r.employee_count || 0) + '명</td>' +
        '<td class="px-4 py-3 text-right tabular-nums text-sm">' + fmt(npTotal) + '</td>' +
        '<td class="px-4 py-3 text-right tabular-nums text-sm">' + fmt(hiTotal) + '</td>' +
        '<td class="px-4 py-3 text-right tabular-nums text-sm">' + fmt(ltcTotal) + '</td>' +
        '<td class="px-4 py-3 text-right tabular-nums text-sm">' + fmt(eiTotal) + '</td>' +
        '<td class="px-4 py-3 text-right tabular-nums font-medium">' + fmt(r.grand_total) + '</td>' +
        '<td class="px-4 py-3 text-center">' + statusBadge(r.status) + '</td>' +
        '<td class="px-4 py-3 text-center">' +
          '<button onclick="irOpenDetail(' + r.id + ')" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="상세"><i class="fas fa-eye"></i></button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  // ── 생성 모달 ──
  window.irOpenGenerateModal = function() {
    document.getElementById('irGenModal').classList.remove('hidden');
  };
  window.irCloseGenModal = function() {
    document.getElementById('irGenModal').classList.add('hidden');
  };

  window.irGenerate = function() {
    var year = document.getElementById('irGenYear').value;
    var month = document.getElementById('irGenMonth').value;
    if (!year || !month) { showToast('연도와 월을 선택하세요', 'warning'); return; }

    axios.post('/api/insurance-reports/generate', { year: Number(year), month: Number(month) })
      .then(function(res) {
        if (!res.data.success) { showToast(res.data.error || '생성 실패', 'error'); return; }
        var d = res.data.data;
        showToast(year + '년 ' + month + '월 신고서 생성 완료 (' + d.employee_count + '명, 합계 ' + fmt(d.grand_total) + '원)', 'success');
        irCloseGenModal();
        irLoadList();
      })
      .catch(function(e) {
        showToast('생성 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
      });
  };

  // ── 상세 모달 ──
  window.irOpenDetail = function(reportId) {
    currentDetailId = reportId;
    axios.get('/api/insurance-reports/' + reportId)
      .then(function(res) {
        if (!res.data.success) { showToast(res.data.error || '조회 실패', 'error'); return; }
        var rpt = res.data.data.report;
        var details = res.data.data.details;

        // 요약
        document.getElementById('irDetailSummary').innerHTML =
          '<div class="bg-blue-50 rounded-lg p-3 border border-blue-100"><div class="text-xs text-blue-600 font-medium">근로자 부담</div><div class="text-xl font-bold text-blue-800 tabular-nums mt-1">' + fmt(rpt.grand_total_employee) + '</div></div>' +
          '<div class="bg-amber-50 rounded-lg p-3 border border-amber-100"><div class="text-xs text-amber-600 font-medium">회사 부담</div><div class="text-xl font-bold text-amber-800 tabular-nums mt-1">' + fmt(rpt.grand_total_employer) + '</div></div>' +
          '<div class="bg-gray-50 rounded-lg p-3 border border-gray-200"><div class="text-xs text-gray-500 font-medium">전체 합계</div><div class="text-xl font-bold text-gray-900 tabular-nums mt-1">' + fmt(rpt.grand_total) + '</div></div>';

        // 직원별 테이블
        var tbody = document.getElementById('irDetailTable');
        tbody.innerHTML = details.map(function(d) {
          var empSub = Number(d.national_pension||0) + Number(d.health_insurance||0) + Number(d.long_term_care||0) + Number(d.employment_insurance||0);
          var corpSub = Number(d.employer_national_pension||0) + Number(d.employer_health_insurance||0) + Number(d.employer_long_term_care||0) + Number(d.employer_employment_insurance||0) + Number(d.employer_industrial_accident||0);
          return '<tr class="hover:bg-gray-50 border-b border-gray-100">' +
            '<td class="px-3 py-2"><div class="font-medium">' + (d.employee_name||'-') + '</div></td>' +
            '<td class="px-3 py-2 text-right tabular-nums">' + fmt(d.base_salary) + '</td>' +
            '<td class="px-3 py-2 text-right tabular-nums">' + fmt(d.national_pension) + '</td>' +
            '<td class="px-3 py-2 text-right tabular-nums">' + fmt(d.health_insurance) + '</td>' +
            '<td class="px-3 py-2 text-right tabular-nums">' + fmt(d.long_term_care) + '</td>' +
            '<td class="px-3 py-2 text-right tabular-nums">' + fmt(d.employment_insurance) + '</td>' +
            '<td class="px-3 py-2 text-right tabular-nums font-medium text-blue-700">' + fmt(empSub) + '</td>' +
            '<td class="px-3 py-2 text-right tabular-nums font-medium text-amber-700">' + fmt(corpSub) + '</td>' +
          '</tr>';
        }).join('');

        // 버튼 표시
        document.getElementById('irSubmitBtn').classList.toggle('hidden', rpt.status !== 'DRAFT');
        document.getElementById('irConfirmBtn').classList.toggle('hidden', rpt.status !== 'SUBMITTED');

        document.getElementById('irDetailModal').classList.remove('hidden');
      })
      .catch(function(e) {
        showToast('조회 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
      });
  };

  window.irCloseDetail = function() {
    document.getElementById('irDetailModal').classList.add('hidden');
    currentDetailId = null;
  };

  window.irSubmit = async function() {
    if (!currentDetailId) return;
    if (!(await showConfirm('이 신고서를 제출 완료 처리하시겠습니까?'))) return;
    axios.put('/api/insurance-reports/' + currentDetailId + '/submit')
      .then(function(res) {
        if (!res.data.success) { showToast(res.data.error || '실패', 'error'); return; }
        showToast('제출 완료 처리되었습니다', 'success');
        irCloseDetail();
        irLoadList();
      })
      .catch(function(e) {
        showToast('실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
      });
  };

  window.irConfirmReport = async function() {
    if (!currentDetailId) return;
    if (!(await showConfirm('이 신고서를 최종 확정하시겠습니까?', { danger: true }))) return;
    axios.put('/api/insurance-reports/' + currentDetailId + '/confirm')
      .then(function(res) {
        if (!res.data.success) { showToast(res.data.error || '실패', 'error'); return; }
        showToast('확정되었습니다', 'success');
        irCloseDetail();
        irLoadList();
      })
      .catch(function(e) {
        showToast('실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
      });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
