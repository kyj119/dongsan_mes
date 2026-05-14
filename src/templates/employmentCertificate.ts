// 재직증명서 HTML 템플릿 — 인쇄/PDF 출력용
// entity 파라미터로 법인별 회사명/대표자/주소 자동 치환

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${y}년 ${m}월 ${day}일`
}

export function renderEmploymentCertificateHTML(data: {
  entity: { name: string; representative: string; address: string; business_reg_no: string }
  employee: { name: string; birth_date: string; department: string; position: string; hire_date: string; employee_code: string }
  issue_date: string
  certificate_number: string
  purpose: string
}): string {
  const { entity, employee, issue_date, certificate_number, purpose } = data

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>재직증명서</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
      font-size: 14px;
      line-height: 1.8;
      color: #111;
      background: #e5e7eb;
    }

    @page { size: A4; margin: 20mm; }
    @media print {
      .no-print { display: none !important; }
      body { background: #fff; }
      .page-wrapper { padding: 0; max-width: none; }
      .certificate { box-shadow: none; border: none; margin: 0; }
    }

    .no-print {
      position: sticky; top: 0; z-index: 100;
      background: #1e40af; color: #fff;
      padding: 12px 24px; display: flex; gap: 12px; align-items: center;
      box-shadow: 0 2px 8px rgba(0,0,0,.2);
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
    .certificate {
      background: #fff;
      padding: 60px 56px;
      box-shadow: 0 2px 8px rgba(0,0,0,.08);
      border: 1px solid #e5e7eb;
      min-height: 900px;
      display: flex;
      flex-direction: column;
    }

    .cert-number {
      text-align: right;
      font-size: 12px;
      color: #666;
      margin-bottom: 24px;
    }

    .cert-title {
      text-align: center;
      font-size: 32px;
      font-weight: 700;
      letter-spacing: 12px;
      margin-bottom: 48px;
      padding-bottom: 16px;
      border-bottom: 3px double #111;
    }

    .info-table {
      width: 80%;
      margin: 0 auto 40px;
      border-collapse: collapse;
      font-size: 14px;
    }
    .info-table th,
    .info-table td {
      border: 1px solid #333;
      padding: 10px 16px;
      text-align: left;
    }
    .info-table th {
      background: #f3f4f6;
      font-weight: 600;
      width: 25%;
      text-align: center;
    }

    .cert-body {
      text-align: center;
      font-size: 16px;
      line-height: 2.2;
      margin: 40px 0;
      flex: 1;
    }

    .cert-purpose {
      width: 80%;
      margin: 0 auto 40px;
      border-collapse: collapse;
      font-size: 14px;
    }
    .cert-purpose th,
    .cert-purpose td {
      border: 1px solid #333;
      padding: 10px 16px;
    }
    .cert-purpose th {
      background: #f3f4f6;
      font-weight: 600;
      width: 25%;
      text-align: center;
    }

    .cert-footer {
      text-align: center;
      margin-top: auto;
      padding-top: 40px;
    }
    .cert-date {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 40px;
    }
    .cert-company {
      font-size: 16px;
      line-height: 2;
    }
    .cert-stamp {
      margin-top: 16px;
      font-size: 14px;
      color: #666;
    }
    .stamp-placeholder {
      display: inline-block;
      width: 70px;
      height: 70px;
      border: 2px dashed #999;
      border-radius: 50%;
      line-height: 70px;
      text-align: center;
      color: #999;
      font-size: 12px;
      vertical-align: middle;
      margin-left: 8px;
    }
  </style>
</head>
<body>
  <div class="no-print">
    <span class="title">재직증명서</span>
    <button class="btn-print" onclick="window.print()">인쇄</button>
    <button class="btn-close" onclick="window.close()">닫기</button>
  </div>

  <div class="page-wrapper">
    <div class="certificate">
      <div class="cert-number">증명번호: ${certificate_number}</div>

      <div class="cert-title">재 직 증 명 서</div>

      <table class="info-table">
        <tr>
          <th>성 명</th>
          <td>${employee.name}</td>
          <th>사원번호</th>
          <td>${employee.employee_code}</td>
        </tr>
        <tr>
          <th>생년월일</th>
          <td>${employee.birth_date}</td>
          <th>부 서</th>
          <td>${employee.department}</td>
        </tr>
        <tr>
          <th>직 위</th>
          <td>${employee.position}</td>
          <th>입사일자</th>
          <td>${formatDate(employee.hire_date)}</td>
        </tr>
      </table>

      <div class="cert-body">
        위 사람은 현재 당사에 재직하고 있음을 증명합니다.
      </div>

      <table class="cert-purpose">
        <tr>
          <th>용 도</th>
          <td>${purpose}</td>
        </tr>
      </table>

      <div class="cert-footer">
        <div class="cert-date">${formatDate(issue_date)}</div>
        <div class="cert-company">
          <div>${entity.name}</div>
          <div>사업자등록번호: ${entity.business_reg_no}</div>
          <div>주소: ${entity.address}</div>
          <div style="margin-top:8px;">대표이사 ${entity.representative} <span class="stamp-placeholder">직인</span></div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`
}
