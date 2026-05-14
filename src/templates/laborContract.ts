// 근로계약서(시급직) HTML 템플릿 — 인쇄/PDF 출력용
// entity 파라미터로 법인별 회사명/대표자/주소 자동 치환

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${y}년 ${m}월 ${day}일`
}

function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR')
}

export function renderLaborContractHTML(data: {
  entity: { name: string; representative: string; address: string }
  employee: { name: string; birth_date: string; phone: string; address: string }
  contract: {
    contract_type?: string
    contract_date: string
    contract_start_date: string
    contract_end_date: string | null
    wage_start_date: string
    wage_end_date: string
    hourly_rate: number
    base_salary?: number
    overtime_daily_hours?: number
    overtime_work_days?: number
    base_hours_monthly?: number
    monthly_salary?: number
    work_type: string
    job_description: string
    probation_months: number
    signature_employee_base64?: string
    signature_employer_base64?: string
  }
}): string {
  const { entity, employee, contract } = data

  const contractPeriod = contract.contract_end_date
    ? `${formatDate(contract.contract_start_date)} ~ ${formatDate(contract.contract_end_date)}`
    : `${formatDate(contract.contract_start_date)} ~ 기간의 정함이 없음`

  const wagePeriod = `${formatDate(contract.wage_start_date)} ~ ${formatDate(contract.wage_end_date)}`

  const workTypeText = contract.work_type === 'SHIFT'
    ? '교대제 (별도 근무일정표에 따름)'
    : '통상근무 (09:00 ~ 18:00, 휴게시간 12:00 ~ 13:00)'

  // 급여 계산 — base_salary 기준 (시급은 참고값)
  const isMonthly = contract.contract_type === 'MONTHLY'
  const contractTypeLabel = isMonthly ? '월급제' : '시급제'
  const baseH = contract.base_hours_monthly || 209
  const otDaily = contract.overtime_daily_hours || 0
  const otDays = contract.overtime_work_days || 22
  const otHours = otDaily * otDays
  // 총액 기준: base_salary(직원 기본급)가 최우선, monthly_salary는 fallback
  const totalWage = contract.base_salary || contract.monthly_salary || contract.hourly_rate * baseH
  let hourlyDisplay: number, basePay: number, otPay: number

  if (isMonthly || otHours === 0) {
    // 고정급 or 연장 없음: 총액 = 기본급
    hourlyDisplay = Math.round(totalWage / baseH)
    basePay = totalWage
    otPay = 0
  } else {
    // 연장 있음: 총액 ÷ 225.5 = 시급, 기본급 = 시급 × 209, 연장 = 총액 - 기본급
    hourlyDisplay = Math.round(totalWage / (baseH + otHours * 1.5))
    basePay = hourlyDisplay * baseH
    otPay = totalWage - basePay
  }
  const totalPay = basePay + otPay

  const employerSig = contract.signature_employer_base64
    ? `<img src="${contract.signature_employer_base64}" style="height:50px;" alt="사용자 인감">`
    : '<span style="display:inline-block;width:50px;height:50px;border:1px dashed #999;"></span>'

  const employeeSig = contract.signature_employee_base64
    ? `<img src="${contract.signature_employee_base64}" style="height:50px;" alt="근로자 서명">`
    : '<span style="display:inline-block;width:50px;height:50px;border:1px dashed #999;"></span>'

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>근로계약서(${contractTypeLabel})</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Nanum Myeongjo', 'Malgun Gothic', serif;
      font-size: 14px;
      line-height: 1.8;
      color: #111;
      background: #e5e7eb;
    }

    @page { size: A4; margin: 20mm 18mm; }
    @media print {
      .no-print { display: none !important; }
      body { background: #fff; }
      .page-wrapper { padding: 0; max-width: none; }
      .contract { box-shadow: none; border: none; margin: 0; padding: 0; }
    }

    .no-print {
      position: sticky; top: 0; z-index: 100;
      background: #1e40af; color: #fff;
      padding: 12px 24px; display: flex; gap: 12px; align-items: center;
      box-shadow: 0 2px 8px rgba(0,0,0,.2);
      font-family: 'Malgun Gothic', sans-serif;
    }
    .no-print .title { font-size: 16px; font-weight: 600; flex: 1; }
    .no-print button {
      padding: 8px 18px; border: none; border-radius: 6px;
      font-size: 14px; cursor: pointer; font-weight: 600;
    }
    .no-print .btn-print { background: #fff; color: #1e40af; }
    .no-print .btn-print:hover { background: #dbeafe; }
    .no-print .btn-close { background: #ef4444; color: #fff; }
    .no-print .btn-close:hover { background: #dc2626; }

    .page-wrapper { max-width: 800px; margin: 0 auto; padding: 24px 16px; }
    .contract {
      background: #fff;
      padding: 50px 56px;
      box-shadow: 0 2px 12px rgba(0,0,0,.1);
      border: 1px solid #d1d5db;
    }

    /* --- 제목 --- */
    .contract-title {
      text-align: center;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 12px;
      margin-bottom: 32px;
      padding-bottom: 10px;
      border-bottom: 3px double #111;
    }

    /* --- 전문 --- */
    .preamble {
      margin-bottom: 24px;
      text-indent: 1em;
      font-size: 14px;
      line-height: 2;
    }

    /* --- 조항 --- */
    .article {
      margin-bottom: 18px;
      page-break-inside: avoid;
    }
    .article-title {
      font-weight: 700;
      font-size: 15px;
      margin-top: 20px;
      margin-bottom: 6px;
      padding-left: 2px;
      border-left: 3px solid #333;
      padding-left: 8px;
    }
    .article-body {
      padding-left: 1.2em;
    }
    .article-body p {
      margin-bottom: 3px;
    }
    .article-body .note {
      padding-left: 1.5em;
      font-size: 12.5px;
      color: #444;
    }

    /* --- 양당사자 테이블 --- */
    .party-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0 20px;
      font-size: 13.5px;
      table-layout: fixed;
    }
    .party-table th,
    .party-table td {
      border: 1px solid #333;
      padding: 7px 12px;
      text-align: left;
      word-break: keep-all;
      overflow: hidden;
    }
    .party-table th {
      background: #f5f5f5;
      font-weight: 600;
      width: 15%;
      text-align: center;
      color: #222;
    }
    .party-table td { width: 35%; }
    .party-table .header-cell {
      background: #e8e8e8;
      font-weight: 700;
      font-size: 14px;
      text-align: center;
      letter-spacing: 6px;
      padding: 8px;
      border-top: 2px solid #333;
    }

    .sub-items {
      padding-left: 1.5em;
      list-style: none;
    }
    .sub-items li { margin-bottom: 2px; }
    .sub-items li::before { content: "- "; }

    /* --- 서명 영역 --- */
    .signature-section {
      margin-top: 40px;
      page-break-inside: avoid;
    }
    .sig-preamble {
      text-align: center;
      font-size: 14px;
      line-height: 2;
      margin-bottom: 12px;
    }
    .sig-date {
      text-align: center;
      font-size: 17px;
      font-weight: 700;
      margin-bottom: 28px;
      letter-spacing: 2px;
    }
    .sig-block {
      display: flex;
      justify-content: space-between;
      gap: 32px;
    }
    .sig-party {
      flex: 1;
      padding: 0;
    }
    .sig-party-label {
      font-weight: 700;
      font-size: 15px;
      margin-bottom: 10px;
      text-align: center;
      letter-spacing: 4px;
    }
    .sig-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13.5px;
    }
    .sig-table th,
    .sig-table td {
      border: 1px solid #333;
      padding: 6px 10px;
      text-align: left;
    }
    .sig-table th {
      background: #f5f5f5;
      font-weight: 600;
      width: 35%;
      text-align: center;
    }
    .sig-stamp-row td {
      text-align: right;
      padding: 10px 12px;
      height: 60px;
      vertical-align: middle;
    }
    .sig-stamp-row img {
      height: 50px;
      vertical-align: middle;
    }
    .sig-stamp-placeholder {
      display: inline-block;
      width: 50px;
      height: 50px;
      border: 1px dashed #999;
      vertical-align: middle;
    }

    /* --- 유틸리티 --- */
    .text-center { text-align: center; }
    .mt-8 { margin-top: 8px; }
    .separator {
      border: none;
      border-top: 1px solid #ccc;
      margin: 28px 0;
    }
  </style>
</head>
<body>
  <div class="no-print">
    <span class="title">근로계약서(${contractTypeLabel})</span>
    <button class="btn-print" onclick="window.print()">인쇄</button>
    <button class="btn-close" onclick="window.close()">닫기</button>
  </div>

  <div class="page-wrapper">
    <div class="contract">
      <div class="contract-title">근 로 계 약 서</div>

      <p class="preamble">
        ${entity.name} (이하 "사용자"라 한다)와(과) ${employee.name} (이하 "근로자"라 한다)는
        다음과 같이 근로계약을 체결하고 이를 성실히 이행할 것을 약정한다.
      </p>

      <hr class="separator">

      <!-- 제1조 -->
      <div class="article">
        <div class="article-title">제1조 (양당사자)</div>
        <table class="party-table">
          <tr>
            <td class="header-cell" colspan="4">사 용 자</td>
          </tr>
          <tr>
            <th>상호(법인명)</th>
            <td>${entity.name}</td>
            <th>대표자</th>
            <td>${entity.representative}</td>
          </tr>
          <tr>
            <th>소재지</th>
            <td colspan="3">${entity.address}</td>
          </tr>
          <tr>
            <td class="header-cell" colspan="4">근 로 자</td>
          </tr>
          <tr>
            <th>성 명</th>
            <td colspan="3">${employee.name}</td>
          </tr>
          <tr>
            <th>생년월일</th>
            <td>${employee.birth_date}</td>
            <th>연락처</th>
            <td>${employee.phone}</td>
          </tr>
          <tr>
            <th>주 소</th>
            <td colspan="3">${employee.address}</td>
          </tr>
        </table>
      </div>

      <!-- 제2조 -->
      <div class="article">
        <div class="article-title">제2조 (담당업무 및 취업장소)</div>
        <div class="article-body">
          <p>1) 담당업무: ${contract.job_description}</p>
          <p>2) 취업장소: ${entity.address}</p>
        </div>
      </div>

      <!-- 제3조 -->
      <div class="article">
        <div class="article-title">제3조 (근로계약기간 및 수습기간)</div>
        <div class="article-body">
          <p>1) 근로계약기간: ${contractPeriod}</p>
          <p>2) 임금적용기간: ${wagePeriod}</p>
          <p>3) 수습기간: 입사일로부터 ${contract.probation_months}개월</p>
          <p class="note">
            (수습기간 중에는 해당 임금의 90%를 지급하며, 최저임금 미만이 되지 않도록 한다)
          </p>
        </div>
      </div>

      <!-- 제4조 -->
      <div class="article">
        <div class="article-title">제4조 (근로시간 및 휴게시간)</div>
        <div class="article-body">
          <p>1) 근무형태: ${workTypeText}</p>
          <p>2) 연장, 야간, 휴일근로는 근로기준법에 따라 사용자와 근로자가 합의하여 실시하며, 가산수당을 지급한다.</p>
        </div>
      </div>

      <!-- 제5조 -->
      <div class="article">
        <div class="article-title">제5조 (휴일 및 휴가)</div>
        <div class="article-body">
          <p>1) 유급휴일: 1주간 소정근로일을 개근한 자에게 1일의 유급주휴일을 부여한다.</p>
          <p>2) 연차유급휴가: 근로기준법 제60조에 따라 부여한다.</p>
        </div>
      </div>

      <!-- 제6조 -->
      <div class="article">
        <div class="article-title">제6조 (임금)</div>
        <div class="article-body">
          ${isMonthly ? `
          <p>1) 월 급여: <strong>${formatNumber(contract.hourly_rate)}원</strong></p>
          ` : `
          <p>1) 통상시급: <strong>${formatNumber(hourlyDisplay)}원</strong> <span style="font-size:12px;color:#555">(기본급 ${formatNumber(basePay)}원 ÷ ${baseH}시간)</span></p>
          <table class="party-table" style="margin:8px 0 12px">
            <tr>
              <th style="width:25%">구분</th>
              <th style="width:45%">산출 근거</th>
              <th style="width:30%;text-align:right">금액</th>
            </tr>
            <tr>
              <td style="text-align:center">기본급</td>
              <td>월 ${baseH}시간 (통상시급 ${formatNumber(hourlyDisplay)}원)</td>
              <td style="text-align:right">${formatNumber(basePay)}원</td>
            </tr>
            ${otDaily > 0 ? `<tr>
              <td style="text-align:center">고정연장수당</td>
              <td>${formatNumber(hourlyDisplay)}원 × ${otHours}h (일 ${otDaily}h × ${otDays}일) × 1.5</td>
              <td style="text-align:right">${formatNumber(otPay)}원</td>
            </tr>` : ''}
            <tr style="border-top:2px solid #333;font-weight:700">
              <td style="text-align:center">월 합계</td>
              <td></td>
              <td style="text-align:right">${formatNumber(totalPay)}원</td>
            </tr>
          </table>
          ${otDaily > 0 ? `<p style="font-size:12px;color:#555">※ 매일 ${otDaily}시간 조기출근에 따른 월 ${otHours}시간 고정 연장근로 포함</p>` : ''}
          `}
          <p>2) 임금 지급일: 매월 10일 (해당일이 휴일인 경우 전일 지급)</p>
          <p>3) 지급방법: 근로자 명의 예금통장에 입금</p>
          <p>4) 초과근로수당: ${isMonthly ? '연장근로 시 근로기준법에 따라 가산하여 지급' : '상기 고정연장 외 추가 연장근로 시 통상시급의 150%, 야간근로(22:00~06:00) 통상시급의 50% 가산, 휴일근로 통상시급의 150%'}</p>
        </div>
      </div>

      <!-- 제7조 -->
      <div class="article">
        <div class="article-title">제7조 (연차유급휴가)</div>
        <div class="article-body">
          <p>연차유급휴가는 근로기준법 제60조에 따라 부여하며, 미사용 연차에 대해서는 연차유급휴가 미사용수당을 지급한다.</p>
        </div>
      </div>

      <!-- 제8조 -->
      <div class="article">
        <div class="article-title">제8조 (퇴직금)</div>
        <div class="article-body">
          <p>1년 이상 근속한 근로자에 대하여 퇴직급여보장법에 따라 퇴직금을 지급한다.</p>
        </div>
      </div>

      <!-- 제9조 -->
      <div class="article">
        <div class="article-title">제9조 (건강검진)</div>
        <div class="article-body">
          <p>사용자는 산업안전보건법에 따라 근로자에 대한 건강검진을 실시한다.</p>
        </div>
      </div>

      <!-- 제10조 -->
      <div class="article">
        <div class="article-title">제10조 (근로관계 종료)</div>
        <div class="article-body">
          <p>1) 근로자가 퇴직하고자 할 때에는 30일 전에 사용자에게 통보하여야 한다.</p>
          <p>2) 근로계약기간 만료 시 별도의 조치가 없으면 근로계약은 종료된다.</p>
        </div>
      </div>

      <!-- 제11조 -->
      <div class="article">
        <div class="article-title">제11조 (해고 사유)</div>
        <div class="article-body">
          <p>사용자는 근로기준법 제23조에 따른 정당한 이유 없이 근로자를 해고하지 아니한다.</p>
        </div>
      </div>

      <!-- 제12조 -->
      <div class="article">
        <div class="article-title">제12조 (근로자 동의)</div>
        <div class="article-body">
          <p>근로자는 사용자의 취업규칙 및 제 규정을 준수하고, 사용자의 정당한 업무지시에 따를 것을 동의한다.</p>
        </div>
      </div>

      <!-- 제13조 -->
      <div class="article">
        <div class="article-title">제13조 (기타)</div>
        <div class="article-body">
          <p>1) 본 계약에 명시되지 아니한 사항은 근로기준법 및 관계 법령에 따른다.</p>
          <p>2) 본 계약서는 2통을 작성하여 사용자와 근로자가 각각 1통씩 보관한다.</p>
        </div>
      </div>

      <hr class="separator">

      <!-- 서명 영역 -->
      <div class="signature-section">
        <p class="sig-preamble">
          위 계약의 성립을 증명하기 위하여 본 계약서 2통을 작성하고,<br>
          사용자와 근로자가 서명 날인 후 각각 1통씩 보관한다.
        </p>
        <div class="sig-date">${formatDate(contract.contract_date)}</div>
        <div class="sig-block">
          <div class="sig-party">
            <div class="sig-party-label">[ 사 용 자 ]</div>
            <table class="sig-table">
              <tr>
                <th>상 호</th>
                <td>${entity.name}</td>
              </tr>
              <tr>
                <th>대 표 자</th>
                <td>${entity.representative}</td>
              </tr>
              <tr>
                <th>소 재 지</th>
                <td>${entity.address}</td>
              </tr>
              <tr class="sig-stamp-row">
                <th>인</th>
                <td>${employerSig}</td>
              </tr>
            </table>
          </div>
          <div class="sig-party">
            <div class="sig-party-label">[ 근 로 자 ]</div>
            <table class="sig-table">
              <tr>
                <th>성 명</th>
                <td>${employee.name}</td>
              </tr>
              <tr>
                <th>생년월일</th>
                <td>${employee.birth_date}</td>
              </tr>
              <tr>
                <th>주 소</th>
                <td>${employee.address}</td>
              </tr>
              <tr class="sig-stamp-row">
                <th>서명</th>
                <td>${employeeSig}</td>
              </tr>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`
}
