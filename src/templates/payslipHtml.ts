// 급여명세서 서버측 HTML 렌더러 (직원 셀프교부용)
// payslip.ts(admin 클라이언트 렌더)와 동일 마크업/CSS. 셀프는 Bearer 토큰이라 서버 렌더+fetch/write 패턴 사용.
// ⚠️ 슬립 레이아웃 변경 시 payslip.ts renderSlip과 동기화 필요.
import { DEPARTMENT_LABELS, POSITION_LABELS } from '../constants/hr'

function fmt(n: unknown): string {
  const v = parseInt(String(n ?? 0), 10)
  return (Number.isFinite(v) ? v : 0).toLocaleString('ko-KR')
}
function esc(s: unknown): string {
  if (s == null) return ''
  return String(s).replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;')
}
function row(label: string, value: unknown): string {
  return `<tr><td class="label">${label}</td><td class="value">${fmt(value)}</td></tr>`
}

export interface PayslipRow {
  base_salary?: number; overtime_pay?: number; night_pay?: number; holiday_pay?: number
  annual_leave_pay?: number; bonus?: number; meal_allowance?: number
  transportation_allowance?: number; other_allowance?: number; total_salary?: number
  national_pension?: number; health_insurance?: number; long_term_care_insurance?: number
  employment_insurance?: number; income_tax?: number; local_tax?: number; other_deduction?: number
  total_deduction?: number; net_pay?: number
  nontax_meal?: number; nontax_transport?: number; nontax_childcare?: number
  pay_period?: string; pay_date?: string; entity_name?: string
  employee_code?: string; employee_name?: string; department?: string; position?: string
  work_days?: number; absent_days?: number; late_count?: number
  [k: string]: unknown
}

/** 단일 급여명세서 전체 HTML 문서 (인쇄/PDF용). issueDate는 KST YYYY-MM-DD 문자열. */
export function renderPayslipHTML(p: PayslipRow, issueDate: string): string {
  const allowTotal =
    (Number(p.overtime_pay || 0) + Number(p.night_pay || 0) + Number(p.holiday_pay || 0) +
     Number(p.meal_allowance || 0) + Number(p.transportation_allowance || 0) + Number(p.other_allowance || 0) +
     Number(p.annual_leave_pay || 0) + Number(p.bonus || 0))
  const gross = Number(p.total_salary || (Number(p.base_salary || 0) + allowTotal))

  let earningsRows = ''
  earningsRows += row('기본급', p.base_salary)
  if (p.overtime_pay) earningsRows += row('연장근로수당', p.overtime_pay)
  if (p.night_pay) earningsRows += row('야간근로수당', p.night_pay)
  if (p.holiday_pay) earningsRows += row('휴일근로수당', p.holiday_pay)
  if (p.annual_leave_pay) earningsRows += row('연차수당', p.annual_leave_pay)
  if (p.bonus) earningsRows += row('상여금', p.bonus)
  if (p.meal_allowance) earningsRows += row('식대', p.meal_allowance)
  if (p.transportation_allowance) earningsRows += row('자가운전', p.transportation_allowance)
  if (p.other_allowance) earningsRows += row('기타수당', p.other_allowance)
  earningsRows += `<tr class="subtotal"><td class="label">지급 합계</td><td class="value">${fmt(gross)}</td></tr>`

  let deductRows = ''
  if (p.national_pension) deductRows += row('국민연금', p.national_pension)
  if (p.health_insurance) deductRows += row('건강보험', p.health_insurance)
  if (p.long_term_care_insurance) deductRows += row('장기요양', p.long_term_care_insurance)
  if (p.employment_insurance) deductRows += row('고용보험', p.employment_insurance)
  if (p.income_tax) deductRows += row('소득세', p.income_tax)
  if (p.local_tax) deductRows += row('지방소득세', p.local_tax)
  if (p.other_deduction) deductRows += row('기타공제', p.other_deduction)
  if (!deductRows) deductRows += '<tr><td class="label" colspan="2" style="text-align:center;color:#9ca3af;">공제 항목 없음</td></tr>'
  deductRows += `<tr class="subtotal"><td class="label">공제 합계</td><td class="value">${fmt(p.total_deduction)}</td></tr>`

  let nontaxNote = ''
  if (p.nontax_meal || p.nontax_transport || p.nontax_childcare) {
    const parts: string[] = []
    if (p.nontax_meal) parts.push('식대 ' + fmt(p.nontax_meal))
    if (p.nontax_transport) parts.push('자가운전 ' + fmt(p.nontax_transport))
    if (p.nontax_childcare) parts.push('육아 ' + fmt(p.nontax_childcare))
    nontaxNote = `<div style="margin-top:6px;font-size:10px;color:#6b7280;">※ 비과세: ${parts.join(', ')}</div>`
  }

  const deptLabel = (DEPARTMENT_LABELS as Record<string, string>)[String(p.department || '')] || p.department || '-'
  const posLabel = (POSITION_LABELS as Record<string, string>)[String(p.position || '')] || p.position || '-'
  const company = esc(p.entity_name || '동산기획')

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>급여명세서 ${esc(p.pay_period || '')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; background: #e5e7eb; color: #111827; }
    @page { size: A4; margin: 10mm 12mm; }
    @media print {
      .no-print { display: none !important; }
      body { background: #fff; }
      .page-wrapper { padding: 0; }
      .slip { box-shadow: none; margin: 0; }
    }
    .no-print {
      position: sticky; top: 0; z-index: 100; background: #1e40af; color: #fff;
      padding: 12px 24px; display: flex; gap: 12px; align-items: center; justify-content: space-between;
    }
    .no-print .title { font-size: 16px; font-weight: 600; }
    .no-print button { padding: 8px 18px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600; }
    .no-print .btn-print { background: #fff; color: #1e40af; }
    .page-wrapper { max-width: 800px; margin: 0 auto; padding: 24px 16px; }
    .slip { background: #fff; padding: 24px 32px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,.08); border: 1px solid #e5e7eb; border-radius: 4px; }
    .slip-header { text-align: center; padding-bottom: 16px; border-bottom: 2px solid #1f2937; margin-bottom: 20px; }
    .slip-title { font-size: 22px; font-weight: 700; letter-spacing: 8px; margin-bottom: 4px; }
    .slip-period { font-size: 13px; color: #6b7280; }
    .slip-company { font-size: 12px; color: #374151; margin-top: 6px; }
    .slip-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-bottom: 16px; border: 1px solid #d1d5db; }
    .meta-row { display: flex; border-bottom: 1px solid #e5e7eb; }
    .meta-row:last-child { border-bottom: none; }
    .meta-label { background: #f9fafb; padding: 6px 10px; font-size: 11px; font-weight: 600; color: #4b5563; width: 90px; border-right: 1px solid #e5e7eb; }
    .meta-value { padding: 6px 10px; font-size: 12px; flex: 1; }
    .slip-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .sec-title { font-size: 13px; font-weight: 700; padding: 6px 10px; background: #f3f4f6; border-left: 3px solid #1e40af; }
    .sec-title.deduct { border-left-color: #dc2626; }
    .line-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .line-table td { padding: 5px 10px; border-bottom: 1px solid #f3f4f6; }
    .line-table td.label { color: #4b5563; width: 60%; }
    .line-table td.value { text-align: right; font-variant-numeric: tabular-nums; }
    .line-table tr.subtotal td { background: #f9fafb; font-weight: 600; border-top: 1px solid #d1d5db; border-bottom: 1px solid #d1d5db; }
    .net-pay-box { background: #eff6ff; border: 2px solid #1e40af; padding: 12px 16px; text-align: right; margin-top: 12px; }
    .net-pay-box .label { font-size: 13px; color: #1e3a8a; margin-bottom: 2px; }
    .net-pay-box .value { font-size: 24px; font-weight: 700; color: #1e40af; }
    .slip-footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280; display: flex; justify-content: space-between; }
    .signature-box { margin-top: 20px; text-align: right; font-size: 12px; }
    .signature-box .company-name { font-size: 14px; font-weight: 600; margin-right: 12px; }
    @media print {
      .net-pay-box { background: #fff !important; border: 2px solid #000 !important; }
      .net-pay-box .value, .net-pay-box .label { color: #000 !important; }
      .sec-title { background: #f3f4f6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <div class="title">급여명세서</div>
    <button class="btn-print" onclick="window.print()">인쇄 / PDF 저장</button>
  </div>
  <div class="page-wrapper">
    <div class="slip">
      <div class="slip-header">
        <div class="slip-title">급여명세서</div>
        <div class="slip-period">${esc(p.pay_period || '')}월분 (지급일: ${esc(p.pay_date || '-')})</div>
        <div class="slip-company">${company}</div>
      </div>
      <div class="slip-meta">
        <div class="meta-row"><div class="meta-label">사번</div><div class="meta-value">${esc(p.employee_code || '-')}</div></div>
        <div class="meta-row"><div class="meta-label">성명</div><div class="meta-value">${esc(p.employee_name || '-')}</div></div>
        <div class="meta-row"><div class="meta-label">부서</div><div class="meta-value">${esc(deptLabel)}</div></div>
        <div class="meta-row"><div class="meta-label">직책</div><div class="meta-value">${esc(posLabel)}</div></div>
      </div>
      <div class="slip-grid">
        <div>
          <div class="sec-title">지급 내역</div>
          <table class="line-table">${earningsRows}</table>
        </div>
        <div>
          <div class="sec-title deduct">공제 내역</div>
          <table class="line-table">${deductRows}</table>
        </div>
      </div>
      <div class="net-pay-box">
        <div class="label">실지급액 (차인지급액)</div>
        <div class="value">₩ ${fmt(p.net_pay)}</div>
      </div>
      ${nontaxNote}
      <div class="signature-box"><span class="company-name">${company} 대표</span> (인)</div>
      <div class="slip-footer">
        <div>근무일수 ${Number(p.work_days || 0)}일 / 결근 ${Number(p.absent_days || 0)}일 / 지각 ${Number(p.late_count || 0)}회</div>
        <div>발행일: ${esc(issueDate)}</div>
      </div>
    </div>
  </div>
</body>
</html>`
}
