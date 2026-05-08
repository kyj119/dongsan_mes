// 연말정산 간편 원천징수영수증 (독립 HTML 페이지, 인쇄/PDF 출력용)
// URL: /year-end/:employeeId?year=YYYY
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'

export function yearEndPage(c: Context<HonoEnv>) {
  const employeeId = parseInt(c.req.param('employeeId') || '', 10)
  const year = parseInt(c.req.query('year') || String(new Date().getFullYear()), 10)
  if (isNaN(employeeId)) return c.text('Invalid employee ID', 400)

  return c.html(`
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${year}년 간편 원천징수영수증</title>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; background: #e5e7eb; color: #111827; }

    @page { size: A4; margin: 10mm 12mm; }
    @media print {
      .no-print { display: none !important; }
      body { background: #fff; }
      .page-wrapper { padding: 0; }
      .doc { box-shadow: none; margin: 0; }
      .sec-title { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }

    .no-print {
      position: sticky; top: 0; z-index: 100;
      background: #1e40af; color: #fff;
      padding: 12px 24px; display: flex; gap: 12px; align-items: center; justify-content: space-between;
      box-shadow: 0 2px 8px rgba(0,0,0,.2);
    }
    .no-print .title { font-size: 16px; font-weight: 600; }
    .no-print button {
      padding: 8px 18px; border: none; border-radius: 6px;
      font-size: 14px; cursor: pointer; font-weight: 600;
    }
    .no-print .btn-print { background: #fff; color: #1e40af; }
    .no-print .btn-close { background: #dc2626; color: #fff; }

    .page-wrapper { max-width: 820px; margin: 0 auto; padding: 24px 16px; }
    .doc {
      background: #fff;
      padding: 28px 36px;
      box-shadow: 0 2px 8px rgba(0,0,0,.08);
      border: 1px solid #e5e7eb;
    }
    .doc-header {
      text-align: center;
      border-bottom: 3px double #1f2937;
      padding-bottom: 14px;
      margin-bottom: 20px;
    }
    .doc-title { font-size: 20px; font-weight: 700; letter-spacing: 6px; }
    .doc-subtitle { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .doc-note { font-size: 10px; color: #9ca3af; margin-top: 2px; }

    .sec-title {
      background: #1f2937;
      color: #fff;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 1px;
      margin-top: 16px;
      margin-bottom: 0;
    }

    table.info { width: 100%; border-collapse: collapse; font-size: 11px; border: 1px solid #d1d5db; }
    table.info td { padding: 6px 10px; border: 1px solid #e5e7eb; }
    table.info td.label { background: #f9fafb; font-weight: 600; color: #4b5563; width: 120px; }
    table.info td.value { background: #fff; }

    table.amount { width: 100%; border-collapse: collapse; font-size: 11px; border: 1px solid #d1d5db; margin-top: 0; }
    table.amount th, table.amount td {
      padding: 6px 10px;
      border: 1px solid #e5e7eb;
    }
    table.amount th {
      background: #f3f4f6;
      font-size: 11px;
      font-weight: 600;
      color: #374151;
    }
    table.amount td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    table.amount tr.total td {
      background: #eff6ff;
      font-weight: 700;
      color: #1e40af;
    }

    table.monthly { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 0; }
    table.monthly th, table.monthly td {
      padding: 4px 6px;
      border: 1px solid #e5e7eb;
      text-align: right;
    }
    table.monthly th {
      background: #f3f4f6;
      font-weight: 600;
      font-size: 10px;
      text-align: center;
    }
    table.monthly td.month { text-align: center; font-weight: 500; }
    table.monthly tr.total td {
      background: #f9fafb;
      font-weight: 700;
      border-top: 2px solid #4b5563;
    }

    .sign-area {
      margin-top: 28px;
      text-align: right;
      font-size: 12px;
    }
    .sign-area .date { margin-bottom: 16px; color: #4b5563; }
    .sign-area .company { font-size: 14px; font-weight: 600; }

    .footer-note {
      margin-top: 20px;
      padding: 10px 12px;
      background: #fef3c7;
      border-left: 3px solid #f59e0b;
      font-size: 10px;
      color: #92400e;
    }

    .loading, .error {
      text-align: center;
      padding: 60px 20px;
      color: #6b7280;
    }
    .error { color: #dc2626; }
  </style>
</head>
<body>
  <div class="no-print">
    <div class="title"><i class="fas fa-file-invoice"></i> ${year}년 간편 원천징수영수증</div>
    <div style="display: flex; gap: 10px;">
      <button class="btn-print" onclick="window.print()"><i class="fas fa-print"></i> 인쇄 / PDF</button>
      <button class="btn-close" onclick="window.close()"><i class="fas fa-times"></i> 닫기</button>
    </div>
  </div>

  <div class="page-wrapper" id="docWrap">
    <div class="loading"><i class="fas fa-spinner fa-spin"></i> 로드 중...</div>
  </div>

  <script>
    (function() {
      var token = localStorage.getItem('token') || localStorage.getItem('auth_token');
      if (token) axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;
    })();

    var EMPLOYEE_ID = ${employeeId};
    var YEAR = ${year};

    function fmt(n) {
      if (n == null) return '0';
      return (parseInt(n) || 0).toLocaleString('ko-KR');
    }
    function maskRrn(rrn) {
      if (!rrn) return '-';
      var parts = String(rrn).split('-');
      if (parts.length !== 2) return rrn;
      return parts[0] + '-' + parts[1].charAt(0) + '******';
    }

    function render(data) {
      var emp = data.employee;
      var s = data.summary || {};
      var monthly = data.monthly || [];

      var monthRows = '';
      for (var m = 1; m <= 12; m++) {
        var period = YEAR + '-' + String(m).padStart(2, '0');
        var found = monthly.find(function(r) { return r.pay_period === period; });
        if (found) {
          var fourIns = (found.national_pension || 0) + (found.health_insurance || 0) + (found.long_term_care_insurance || 0) + (found.employment_insurance || 0);
          monthRows += '<tr>' +
            '<td class="month">' + m + '월</td>' +
            '<td>' + fmt(found.total_salary) + '</td>' +
            '<td>' + fmt(found.taxable_pay) + '</td>' +
            '<td>' + fmt(fourIns) + '</td>' +
            '<td>' + fmt(found.income_tax) + '</td>' +
            '<td>' + fmt(found.local_tax) + '</td>' +
            '<td>' + fmt(found.total_deduction) + '</td>' +
            '<td>' + fmt(found.net_pay) + '</td>' +
          '</tr>';
        } else {
          monthRows += '<tr>' +
            '<td class="month">' + m + '월</td>' +
            '<td colspan="7" style="text-align:center; color:#d1d5db;">-</td>' +
          '</tr>';
        }
      }
      var totalFourIns = (s.sum_national_pension || 0) + (s.sum_health_insurance || 0) + (s.sum_long_term_care || 0) + (s.sum_employment_insurance || 0);
      monthRows += '<tr class="total">' +
        '<td class="month">합계</td>' +
        '<td>' + fmt(s.total_salary) + '</td>' +
        '<td>' + fmt(s.taxable_pay) + '</td>' +
        '<td>' + fmt(totalFourIns) + '</td>' +
        '<td>' + fmt(s.sum_income_tax) + '</td>' +
        '<td>' + fmt(s.sum_local_tax) + '</td>' +
        '<td>' + fmt(s.sum_total_deduction) + '</td>' +
        '<td>' + fmt(s.sum_net_pay) + '</td>' +
      '</tr>';

      var html = '<div class="doc">' +
        '<div class="doc-header">' +
          '<div class="doc-title">근로소득 원천징수영수증 (간편)</div>' +
          '<div class="doc-subtitle">' + YEAR + '년 귀속</div>' +
          '<div class="doc-note">※ 본 문서는 MES 내부 집계 자료이며, 세무사 제출용 참고 자료입니다.</div>' +
        '</div>' +

        '<div class="sec-title">Ⅰ. 소득자 인적사항</div>' +
        '<table class="info">' +
          '<tr>' +
            '<td class="label">사번</td><td class="value">' + (emp.employee_code || '-') + '</td>' +
            '<td class="label">성명</td><td class="value">' + (emp.name || '-') + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td class="label">주민등록번호</td><td class="value">' + maskRrn(emp.rrn) + '</td>' +
            '<td class="label">연락처</td><td class="value">' + (emp.phone || '-') + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td class="label">부서</td><td class="value">' + (emp.department || '-') + '</td>' +
            '<td class="label">직책</td><td class="value">' + (emp.position || '-') + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td class="label">입사일</td><td class="value">' + (emp.hire_date || '-') + '</td>' +
            '<td class="label">부양가족수</td><td class="value">' + (emp.dependents_count || 1) + '명 (20세 이하 ' + (emp.children_under_20_count || 0) + '명)</td>' +
          '</tr>' +
        '</table>' +

        '<div class="sec-title">Ⅱ. 연간 급여 집계</div>' +
        '<table class="amount">' +
          '<tr>' +
            '<th style="width:30%">항목</th>' +
            '<th>금액 (원)</th>' +
          '</tr>' +
          '<tr><td>기본급 합계</td><td class="num">' + fmt(s.total_base) + '</td></tr>' +
          '<tr><td>연장/야간/휴일근로수당 합계</td><td class="num">' + fmt(s.total_overtime) + '</td></tr>' +
          '<tr><td>상여금 합계</td><td class="num">' + fmt(s.total_bonus) + '</td></tr>' +
          '<tr><td>연차수당 합계</td><td class="num">' + fmt(s.total_annual_leave) + '</td></tr>' +
          '<tr><td>기타 수당 합계</td><td class="num">' + fmt(s.total_allowances) + '</td></tr>' +
          '<tr><td>비과세 소득 합계</td><td class="num">' + fmt(s.total_nontax) + '</td></tr>' +
          '<tr class="total"><td>총급여액</td><td class="num">' + fmt(s.total_salary) + '</td></tr>' +
          '<tr class="total"><td>과세 대상 급여</td><td class="num">' + fmt(s.taxable_pay) + '</td></tr>' +
        '</table>' +

        '<div class="sec-title">Ⅲ. 연간 공제 집계</div>' +
        '<table class="amount">' +
          '<tr>' +
            '<th style="width:30%">항목</th>' +
            '<th>금액 (원)</th>' +
          '</tr>' +
          '<tr><td>국민연금</td><td class="num">' + fmt(s.sum_national_pension) + '</td></tr>' +
          '<tr><td>건강보험</td><td class="num">' + fmt(s.sum_health_insurance) + '</td></tr>' +
          '<tr><td>장기요양보험</td><td class="num">' + fmt(s.sum_long_term_care) + '</td></tr>' +
          '<tr><td>고용보험</td><td class="num">' + fmt(s.sum_employment_insurance) + '</td></tr>' +
          '<tr><td>소득세 (원천징수)</td><td class="num">' + fmt(s.sum_income_tax) + '</td></tr>' +
          '<tr><td>지방소득세</td><td class="num">' + fmt(s.sum_local_tax) + '</td></tr>' +
          '<tr class="total"><td>공제 합계</td><td class="num">' + fmt(s.sum_total_deduction) + '</td></tr>' +
          '<tr class="total"><td>실지급액 합계</td><td class="num">' + fmt(s.sum_net_pay) + '</td></tr>' +
        '</table>' +

        '<div class="sec-title">Ⅳ. 월별 상세 내역</div>' +
        '<table class="monthly">' +
          '<thead><tr>' +
            '<th>월</th>' +
            '<th>총급여</th>' +
            '<th>과세급여</th>' +
            '<th>4대보험</th>' +
            '<th>소득세</th>' +
            '<th>지방세</th>' +
            '<th>공제합계</th>' +
            '<th>실지급</th>' +
          '</tr></thead>' +
          '<tbody>' + monthRows + '</tbody>' +
        '</table>' +

        '<div class="sign-area">' +
          '<div class="date">' + YEAR + '년 ' + (new Date().getMonth() + 1) + '월 ' + new Date().getDate() + '일 발행</div>' +
          '<div><span class="company">동산현수막</span> (인)</div>' +
        '</div>' +

        '<div class="footer-note">' +
          '※ 본 문서는 MES에 기록된 급여 데이터를 집계한 간편 자료입니다. 국세청 연말정산 최종 결과는 세무사/홈택스의 정식 원천징수영수증(근로소득)으로 확인하시기 바랍니다.' +
          '<br>※ 소득공제(인적/신용카드/의료비/보험료 등) 및 세액공제는 본 문서에 포함되지 않으며, 실제 결정세액은 정산 시 산출됩니다.' +
        '</div>' +
      '</div>';

      document.getElementById('docWrap').innerHTML = html;
    }

    async function load() {
      try {
        var res = await axios.get('/api/payroll/year-end/' + EMPLOYEE_ID, { params: { year: YEAR } });
        if (!res.data.success) {
          document.getElementById('docWrap').innerHTML = '<div class="error">' + (res.data.error || '로드 실패') + '</div>';
          return;
        }
        render(res.data.data);
      } catch (e) {
        document.getElementById('docWrap').innerHTML = '<div class="error"><i class="fas fa-exclamation-circle"></i> 로드 실패: ' + (e.message || '') + '</div>';
      }
    }

    load();
  </script>
</body>
</html>
`)
}
