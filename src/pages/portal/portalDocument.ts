import type { Context } from 'hono'

export const portalDocumentPage = (c: Context) => {
  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>동산현수막 - 거래 문서 확인</title>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Malgun Gothic', sans-serif; background: #f3f4f6; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,.1); width: 100%; max-width: 440px; padding: 40px; margin: 20px; }
    .logo { text-align: center; margin-bottom: 24px; }
    .logo h1 { font-size: 22px; color: #1e40af; font-weight: 800; }
    .logo p { font-size: 13px; color: #6b7280; margin-top: 4px; }
    .field { margin-bottom: 20px; }
    .field label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
    .field input { width: 100%; padding: 12px 16px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 15px; letter-spacing: 2px; text-align: center; transition: border-color .2s; }
    .field input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.15); }
    .field .hint { font-size: 11px; color: #9ca3af; margin-top: 4px; text-align: center; }
    .btn { width: 100%; padding: 14px; background: #2563eb; color: #fff; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; transition: background .2s; }
    .btn:hover { background: #1d4ed8; }
    .btn:disabled { background: #93c5fd; cursor: not-allowed; }
    .error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; display: none; text-align: center; }
    .expired { text-align: center; padding: 40px 20px; }
    .expired i { font-size: 48px; color: #d1d5db; margin-bottom: 16px; }
    .expired h2 { font-size: 18px; color: #6b7280; margin-bottom: 8px; }
    .expired p { font-size: 13px; color: #9ca3af; }
    /* 문서 뷰 */
    .doc-view { display: none; }
    .doc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .doc-header h2 { font-size: 18px; font-weight: 700; color: #1f2937; }
    .doc-content { background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.08); overflow: hidden; }
    .doc-content table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .doc-content th { background: #f9fafb; padding: 10px 14px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; }
    .doc-content td { padding: 10px 14px; border-bottom: 1px solid #f3f4f6; color: #4b5563; }
    .doc-content .row-order { background: #f0fdf4; }
    .doc-content .row-payment { background: #eff6ff; }
    .doc-content .row-adjustment { background: #fefce8; }
    .doc-content .right { text-align: right; }
    .summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
    .summary-card { background: #f9fafb; border-radius: 10px; padding: 14px; text-align: center; }
    .summary-card .label { font-size: 11px; color: #6b7280; }
    .summary-card .value { font-size: 20px; font-weight: 700; margin-top: 4px; }
    @media print { body { background: #fff; } .no-print { display: none !important; } .card { box-shadow: none; max-width: 100%; } }
    @media (max-width: 480px) { .summary-cards { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="card" id="authCard">
    <div class="logo">
      <h1><i class="fas fa-shield-alt"></i> 동산현수막</h1>
      <p>거래 문서 안전 확인</p>
    </div>
    <div id="expiredView" class="expired" style="display:none">
      <i class="fas fa-clock"></i>
      <h2>링크가 만료되었습니다</h2>
      <p>담당자에게 새 링크를 요청해 주세요.</p>
    </div>
    <div id="authForm">
      <div id="errorMsg" class="error"></div>
      <div class="field">
        <label>사업자등록번호</label>
        <input type="text" id="brnInput" placeholder="000-00-00000" maxlength="12" autofocus
               oninput="formatBrn(this)" onkeydown="if(event.key==='Enter')verify()">
        <div class="hint">거래처로 등록된 사업자등록번호를 입력하세요</div>
      </div>
      <button class="btn" id="verifyBtn" onclick="verify()">
        <i class="fas fa-lock mr-1"></i> 확인
      </button>
    </div>
  </div>

  <div class="card doc-view" id="docView" style="max-width:800px">
    <div class="doc-header no-print">
      <h2 id="docTitle"></h2>
      <button onclick="window.print()" class="btn" style="width:auto;padding:8px 20px;font-size:13px">
        <i class="fas fa-print mr-1"></i> 인쇄
      </button>
    </div>
    <div id="docClientInfo" style="margin-bottom:16px;font-size:14px;color:#4b5563"></div>
    <div class="summary-cards" id="docSummary"></div>
    <div class="doc-content" id="docContent"></div>
  </div>

<script>
var token = new URLSearchParams(window.location.search).get('t') || '';
var docType = 'ledger'; // API 응답에서 결정됨

function formatBrn(el) {
  var v = el.value.replace(/[^0-9]/g, '');
  if (v.length > 3 && v.length <= 5) v = v.slice(0,3) + '-' + v.slice(3);
  else if (v.length > 5) v = v.slice(0,3) + '-' + v.slice(3,5) + '-' + v.slice(5,10);
  el.value = v;
}

async function verify() {
  var brn = document.getElementById('brnInput').value.replace(/[^0-9]/g, '');
  if (brn.length !== 10) {
    showError('사업자등록번호 10자리를 입력하세요.');
    return;
  }
  var btn = document.getElementById('verifyBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 확인 중...';

  try {
    var res = await axios.post('/api/portal/verify-document', { token: token, brn: brn });
    if (res.data.success) {
      document.getElementById('authCard').style.display = 'none';
      document.getElementById('docView').style.display = 'block';
      renderDocument(res.data.data);
    } else {
      showError(res.data.error || '인증에 실패했습니다.');
    }
  } catch(e) {
    var msg = (e.response && e.response.data) ? e.response.data.error : '서버 오류';
    if (e.response && e.response.status === 410) {
      document.getElementById('authForm').style.display = 'none';
      document.getElementById('expiredView').style.display = 'block';
    } else {
      showError(msg);
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-lock mr-1"></i> 확인';
  }
}

function showError(msg) {
  var el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(function() { el.style.display = 'none'; }, 5000);
}

function fmt(n) { return (n || 0).toLocaleString(); }

function renderDocument(data) {
  docType = data.doc_type || 'ledger';
  var title = docType === 'invoice' ? '거래명세서' : '거래 내역';
  document.getElementById('docTitle').textContent = data.client_name + ' ' + title;
  document.getElementById('docClientInfo').innerHTML =
    '<strong>' + esc(data.client_name) + '</strong>' +
    (data.period ? ' | 기간: ' + esc(data.period) : '') +
    (data.order_number ? ' | 주문번호: ' + esc(data.order_number) : '');

  // 요약 카드
  var sumHtml = '';
  if (data.summary) {
    sumHtml += '<div class="summary-card"><div class="label">총 매출</div><div class="value" style="color:#1f2937">' + fmt(data.summary.total_debit) + '원</div></div>';
    sumHtml += '<div class="summary-card"><div class="label">총 입금</div><div class="value" style="color:#16a34a">' + fmt(data.summary.total_credit) + '원</div></div>';
    sumHtml += '<div class="summary-card"><div class="label">현재 잔액</div><div class="value" style="color:#dc2626">' + fmt(data.summary.balance) + '원</div></div>';
  }
  document.getElementById('docSummary').innerHTML = sumHtml;

  // 거래 내역 테이블
  var rows = data.transactions || data.items || [];
  var html = '<table><thead><tr>';
  if (docType === 'invoice') {
    html += '<th>품목명</th><th>규격</th><th class="right">수량</th><th class="right">단가</th><th class="right">금액</th>';
  } else {
    html += '<th>일자</th><th>구분</th><th>내용</th><th class="right">차변</th><th class="right">대변</th><th class="right">잔액</th>';
  }
  html += '</tr></thead><tbody>';

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (docType === 'invoice') {
      html += '<tr><td>' + esc(r.item_name || '') + '</td><td>' + esc(r.spec || '') + '</td>'
        + '<td class="right">' + (r.quantity || 0) + '</td><td class="right">' + fmt(r.unit_price) + '</td>'
        + '<td class="right">' + fmt(r.amount) + '</td></tr>';
    } else {
      var cls = r.type === 'order' ? 'row-order' : r.type === 'payment' ? 'row-payment' : 'row-adjustment';
      var typeName = r.type === 'order' ? '주문' : r.type === 'payment' ? '입금' : '할인';
      html += '<tr class="' + cls + '"><td>' + esc(r.date || '') + '</td><td>' + typeName + '</td>'
        + '<td>' + esc(r.description || '') + '</td>'
        + '<td class="right">' + (r.debit > 0 ? fmt(r.debit) : '-') + '</td>'
        + '<td class="right">' + (r.credit > 0 ? fmt(r.credit) : '-') + '</td>'
        + '<td class="right" style="font-weight:bold;color:' + (r.balance > 0 ? '#dc2626' : '#16a34a') + '">' + fmt(r.balance) + '</td></tr>';
    }
  }
  html += '</tbody></table>';

  if (data.total_amount !== undefined) {
    html += '<div style="text-align:right;padding:14px;font-size:15px;font-weight:700;border-top:2px solid #e5e7eb">'
      + '합계: ' + fmt(data.total_amount) + '원'
      + (data.vat_amount ? ' (부가세 ' + fmt(data.vat_amount) + '원 포함)' : '')
      + '</div>';
  }

  document.getElementById('docContent').innerHTML = html;
}

function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// 토큰 없으면 만료 표시
if (!token) {
  document.getElementById('authForm').style.display = 'none';
  document.getElementById('expiredView').style.display = 'block';
}
</script>
</body>
</html>`)
}
