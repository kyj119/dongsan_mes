// 급여명세서 (독립 HTML 페이지, 인쇄/PDF 출력용)
// URL: /payslip/:id 또는 /payslip/batch/:period
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'

export function payslipPage(c: Context<HonoEnv>) {
  const idParam = c.req.param('id')
  const periodParam = c.req.query('period')
  // id가 숫자면 단일, 'batch'이면 일괄
  const mode = idParam === 'batch' ? 'batch' : 'single'

  return c.html(`
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>급여명세서</title>
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
      .slip { box-shadow: none; margin: 0; page-break-after: always; }
      .slip:last-child { page-break-after: auto; }
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
    .no-print .btn-print:hover { background: #dbeafe; }
    .no-print .btn-close { background: #ef4444; color: #fff; }
    .no-print .btn-close:hover { background: #dc2626; }
    .no-print .btn-pdf { background: #10b981; color: #fff; }

    .page-wrapper { max-width: 800px; margin: 0 auto; padding: 24px 16px; }
    .slip {
      background: #fff;
      padding: 24px 32px;
      margin-bottom: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,.08);
      border: 1px solid #e5e7eb;
      border-radius: 4px;
    }
    .slip-header {
      text-align: center;
      padding-bottom: 16px;
      border-bottom: 2px solid #1f2937;
      margin-bottom: 20px;
    }
    .slip-title { font-size: 22px; font-weight: 700; letter-spacing: 8px; margin-bottom: 4px; }
    .slip-period { font-size: 13px; color: #6b7280; }
    .slip-company { font-size: 12px; color: #374151; margin-top: 6px; }

    .slip-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
      margin-bottom: 16px;
      border: 1px solid #d1d5db;
    }
    .meta-row { display: flex; border-bottom: 1px solid #e5e7eb; }
    .meta-row:last-child { border-bottom: none; }
    .meta-label {
      background: #f9fafb;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 600;
      color: #4b5563;
      width: 90px;
      border-right: 1px solid #e5e7eb;
    }
    .meta-value {
      padding: 6px 10px;
      font-size: 12px;
      flex: 1;
    }

    .slip-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }

    .sec-title {
      font-size: 13px;
      font-weight: 700;
      padding: 6px 10px;
      background: #f3f4f6;
      border-left: 3px solid #1e40af;
      margin-bottom: 0;
    }
    .sec-title.deduct { border-left-color: #dc2626; }

    .line-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .line-table td {
      padding: 5px 10px;
      border-bottom: 1px solid #f3f4f6;
    }
    .line-table td.label { color: #4b5563; width: 60%; }
    .line-table td.value { text-align: right; font-variant-numeric: tabular-nums; }
    .line-table tr.subtotal td {
      background: #f9fafb;
      font-weight: 600;
      border-top: 1px solid #d1d5db;
      border-bottom: 1px solid #d1d5db;
    }

    .net-pay-box {
      background: #eff6ff;
      border: 2px solid #1e40af;
      padding: 12px 16px;
      text-align: right;
      margin-top: 12px;
    }
    .net-pay-box .label { font-size: 13px; color: #1e3a8a; margin-bottom: 2px; }
    .net-pay-box .value { font-size: 24px; font-weight: 700; color: #1e40af; }

    .slip-footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      font-size: 11px;
      color: #6b7280;
      display: flex;
      justify-content: space-between;
    }
    .signature-box {
      margin-top: 20px;
      text-align: right;
      font-size: 12px;
    }
    .signature-box .company-name { font-size: 14px; font-weight: 600; margin-right: 12px; }

    .loading, .error {
      text-align: center;
      padding: 60px 20px;
      color: #6b7280;
    }
    .error { color: #dc2626; }

    @media print {
      .net-pay-box { background: #fff !important; border: 2px solid #000 !important; }
      .net-pay-box .value, .net-pay-box .label { color: #000 !important; }
      .sec-title { background: #f3f4f6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <div class="title"><i class="fas fa-file-invoice-dollar"></i> 급여명세서</div>
    <div style="display: flex; gap: 10px;">
      <button class="btn-print" onclick="window.print()"><i class="fas fa-print"></i> 인쇄</button>
      <button class="btn-close" onclick="window.close()"><i class="fas fa-times"></i> 닫기</button>
    </div>
  </div>

  <div class="page-wrapper" id="payWrap">
    <div class="loading"><i class="fas fa-spinner fa-spin"></i> 로드 중...</div>
  </div>

  <script>
    // URL 파라미터에서 토큰 세팅 (독립 페이지라 수동 설정 필요)
    (function() {
      var token = localStorage.getItem('token') || localStorage.getItem('auth_token');
      if (token) {
        axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;
      }
    })();

    var MODE = ${JSON.stringify(mode)};
    var ID_PARAM = ${JSON.stringify(idParam)};
    var PERIOD_PARAM = ${JSON.stringify(periodParam || '')};

    function fmt(n) {
      if (n == null) return '0';
      return (parseInt(n) || 0).toLocaleString('ko-KR');
    }

    function renderSlip(p) {
      var allowTotal = (parseInt(p.overtime_pay || 0) + parseInt(p.night_pay || 0) + parseInt(p.holiday_pay || 0) +
        parseInt(p.meal_allowance || 0) + parseInt(p.transportation_allowance || 0) + parseInt(p.other_allowance || 0) +
        parseInt(p.annual_leave_pay || 0) + parseInt(p.bonus || 0));
      var gross = parseInt(p.total_salary || (p.base_salary + allowTotal));

      var earningsRows = '';
      earningsRows += row('기본급', p.base_salary);
      if (p.overtime_pay) earningsRows += row('연장근로수당', p.overtime_pay);
      if (p.night_pay) earningsRows += row('야간근로수당', p.night_pay);
      if (p.holiday_pay) earningsRows += row('휴일근로수당', p.holiday_pay);
      if (p.annual_leave_pay) earningsRows += row('연차수당', p.annual_leave_pay);
      if (p.bonus) earningsRows += row('상여금', p.bonus);
      if (p.meal_allowance) earningsRows += row('식대', p.meal_allowance);
      if (p.transportation_allowance) earningsRows += row('자가운전', p.transportation_allowance);
      if (p.other_allowance) earningsRows += row('기타수당', p.other_allowance);
      earningsRows += '<tr class="subtotal"><td class="label">지급 합계</td><td class="value">' + fmt(gross) + '</td></tr>';

      // 공제 항목: 0 원은 숨김 (지급 항목과 동일한 규칙)
      // Phase 8 이후 insurance_apply_* = 0 직원은 4대보험이 0 으로 저장되므로 표시 생략
      var deductRows = '';
      if (p.national_pension) deductRows += row('국민연금', p.national_pension);
      if (p.health_insurance) deductRows += row('건강보험', p.health_insurance);
      if (p.long_term_care_insurance) deductRows += row('장기요양', p.long_term_care_insurance);
      if (p.employment_insurance) deductRows += row('고용보험', p.employment_insurance);
      if (p.income_tax) deductRows += row('소득세', p.income_tax);
      if (p.local_tax) deductRows += row('지방소득세', p.local_tax);
      if (p.other_deduction) deductRows += row('기타공제', p.other_deduction);
      if (!deductRows) deductRows += '<tr><td class="label" colspan="2" style="text-align:center;color:#9ca3af;">공제 항목 없음</td></tr>';
      deductRows += '<tr class="subtotal"><td class="label">공제 합계</td><td class="value">' + fmt(p.total_deduction) + '</td></tr>';

      var nontaxNote = '';
      if (p.nontax_meal || p.nontax_transport || p.nontax_childcare) {
        var parts = [];
        if (p.nontax_meal) parts.push('식대 ' + fmt(p.nontax_meal));
        if (p.nontax_transport) parts.push('자가운전 ' + fmt(p.nontax_transport));
        if (p.nontax_childcare) parts.push('육아 ' + fmt(p.nontax_childcare));
        nontaxNote = '<div style="margin-top: 6px; font-size: 10px; color: #6b7280;">※ 비과세: ' + parts.join(', ') + '</div>';
      }

      return '<div class="slip">' +
        '<div class="slip-header">' +
          '<div class="slip-title">급여명세서</div>' +
          '<div class="slip-period">' + (p.pay_period || '') + '월분 (지급일: ' + (p.pay_date || '-') + ')</div>' +
          '<div class="slip-company">동산기획</div>' +
        '</div>' +
        '<div class="slip-meta">' +
          '<div class="meta-row"><div class="meta-label">사번</div><div class="meta-value">' + (p.employee_code || '-') + '</div></div>' +
          '<div class="meta-row"><div class="meta-label">성명</div><div class="meta-value">' + (p.employee_name || '-') + '</div></div>' +
          '<div class="meta-row"><div class="meta-label">부서</div><div class="meta-value">' + (p.department || '-') + '</div></div>' +
          '<div class="meta-row"><div class="meta-label">직책</div><div class="meta-value">' + (p.position || '-') + '</div></div>' +
        '</div>' +
        '<div class="slip-grid">' +
          '<div>' +
            '<div class="sec-title">지급 내역</div>' +
            '<table class="line-table">' + earningsRows + '</table>' +
          '</div>' +
          '<div>' +
            '<div class="sec-title deduct">공제 내역</div>' +
            '<table class="line-table">' + deductRows + '</table>' +
          '</div>' +
        '</div>' +
        '<div class="net-pay-box">' +
          '<div class="label">실지급액 (차인지급액)</div>' +
          '<div class="value">₩ ' + fmt(p.net_pay) + '</div>' +
        '</div>' +
        nontaxNote +
        '<div class="signature-box">' +
          '<span class="company-name">동산기획 대표</span> (인)' +
        '</div>' +
        '<div class="slip-footer">' +
          '<div>근무일수 ' + (p.work_days || 0) + '일 / 결근 ' + (p.absent_days || 0) + '일 / 지각 ' + (p.late_count || 0) + '회</div>' +
          '<div>발행일: ' + new Date().toISOString().slice(0, 10) + '</div>' +
        '</div>' +
      '</div>';
    }

    function row(label, value) {
      return '<tr><td class="label">' + label + '</td><td class="value">' + fmt(value) + '</td></tr>';
    }

    async function loadSingle(id) {
      try {
        var res = await axios.get('/api/payroll/' + id);
        var wrap = document.getElementById('payWrap');
        wrap.innerHTML = renderSlip(res.data.data);
      } catch (e) {
        document.getElementById('payWrap').innerHTML = '<div class="error"><i class="fas fa-exclamation-circle"></i> 로드 실패: ' + (e.message || '') + '</div>';
      }
    }

    async function loadBatch(period) {
      try {
        var res = await axios.get('/api/payroll', { params: { period: period } });
        var rows = res.data.data || [];
        if (rows.length === 0) {
          document.getElementById('payWrap').innerHTML = '<div class="error">해당 월(' + period + ') 급여 내역이 없습니다.</div>';
          return;
        }
        var html = '';
        for (var i = 0; i < rows.length; i++) html += renderSlip(rows[i]);
        document.getElementById('payWrap').innerHTML = html;
      } catch (e) {
        document.getElementById('payWrap').innerHTML = '<div class="error"><i class="fas fa-exclamation-circle"></i> 로드 실패</div>';
      }
    }

    if (MODE === 'batch') {
      loadBatch(PERIOD_PARAM);
    } else {
      loadSingle(parseInt(ID_PARAM));
    }
  </script>
</body>
</html>
`)
}
