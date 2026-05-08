import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import quotationScript from '../scripts/quotation.js?raw'

export function quotationPage(c: Context<HonoEnv>) {
  const orderId = parseInt(c.req.param('orderId') || '', 10)
  if (isNaN(orderId)) return c.text('Invalid order ID', 400)
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>견 적 서</title>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; background: #e5e7eb; }

            @page { size: A4; margin: 5mm 8mm; }
            @media print {
                .no-print { display: none !important; }
                body { background: #fff; }
                .page-wrapper { padding: 0; }
                .invoice-half { box-shadow: none; margin-bottom: 0; }
                .cut-line::after { background: #fff; color: #666; }
            }

            .no-print {
                position: sticky; top: 0; z-index: 100;
                background: #0d9488; color: #fff;
                padding: 12px 24px; display: flex; gap: 12px; align-items: center;
                box-shadow: 0 2px 8px rgba(0,0,0,.2);
            }
            .no-print button {
                padding: 8px 20px; border: none; border-radius: 6px;
                font-size: 14px; cursor: pointer; font-weight: 600;
            }
            .no-print .btn-print { background: #fff; color: #0d9488; }
            .no-print .btn-print:hover { background: #ccfbf1; }
            .no-print .btn-close { background: #ef4444; color: #fff; }
            .no-print .btn-close:hover { background: #dc2626; }
            .no-print .btn-email { background: #6366f1; color: #fff; }
            .no-print .btn-email:hover { background: #4f46e5; }
            .no-print .btn-convert { background: #f59e0b; color: #fff; }
            .no-print .btn-convert:hover { background: #d97706; }
            .no-print .title { font-size: 16px; font-weight: 700; flex: 1; }
            .no-print .warn { background: #fbbf24; color: #92400e; padding: 6px 14px; border-radius: 6px; font-size: 12px; display: none; }
            .no-print .expired-badge { background: #ef4444; color: #fff; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 700; display: none; }
            .toast-msg { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,.3); display: none; }
            .toast-error { background: #ef4444; color: #fff; }
            .toast-success { background: #10b981; color: #fff; }

            .page-wrapper { max-width: 210mm; margin: 0 auto; padding: 16px; }

            .invoice-half {
                width: 100%; background: #fff;
                border: 2px solid #000; padding: 3mm 4mm;
                margin-bottom: 4mm; box-shadow: 0 1px 4px rgba(0,0,0,.1);
                page-break-inside: avoid;
            }
            .invoice-full {
                page-break-after: always;
            }

            .inv-title { text-align: center; font-size: 18px; font-weight: 900; letter-spacing: 12px; margin-bottom: 1px; }
            .inv-copy { text-align: center; font-size: 11px; color: #555; margin-bottom: 3px; }

            .cut-line {
                border: none; border-top: 1px dashed #999;
                margin: 2mm 0; position: relative; height: 16px;
            }
            .cut-line::after {
                content: '\\2702  절취선'; position: absolute;
                top: -7px; left: 50%; transform: translateX(-50%);
                background: #e5e7eb; padding: 0 8px; font-size: 9px; color: #999;
            }

            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #000; margin-bottom: 4px; }
            .info-box { }
            .info-box .box-title { text-align: center; font-weight: 700; font-size: 11px; background: #f3f4f6; padding: 2px; border-bottom: 1px solid #000; }
            .info-box:first-child { border-right: 1px solid #000; }
            .info-row { display: grid; grid-template-columns: 68px 1fr; font-size: 10.5px; border-bottom: 1px solid #ddd; }
            .info-row:last-child { border-bottom: none; }
            .info-row-split { grid-template-columns: 68px 1fr 48px auto; }
            .info-row-split .info-label-sub { background: #f9fafb; padding: 2px 4px; font-weight: 600; border-right: 1px solid #ddd; border-left: 1px solid #ddd; white-space: nowrap; text-align: center; }
            .stamp-cell { position: relative; overflow: visible !important; }
            .info-label { background: #f9fafb; padding: 2px 4px; font-weight: 600; border-right: 1px solid #ddd; white-space: nowrap; }
            .info-value { padding: 2px 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

            .meta-row { display: flex; justify-content: space-between; font-size: 11px; padding: 3px 0; border-bottom: 1px solid #000; }
            .total-korean { text-align: center; font-size: 12px; font-weight: 700; padding: 4px; border-bottom: 1px solid #000; background: #f9fafb; }

            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
            .items-table th, .items-table td { border: 1px solid #000; padding: 2px 3px; text-align: center; font-size: 10px; }
            .items-table th { background: #f3f4f6; font-weight: 700; font-size: 10px; }
            .items-table td.left { text-align: left; }
            .items-table td.right { text-align: right; }
            .items-table .empty-row td { height: 16px; }
            .invoice-half .items-table td { max-height: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .invoice-full .items-table td { white-space: normal; }
            .items-table .total-row td { font-weight: 700; background: #f9fafb; }

            .footer-section { border: 1px solid #000; border-top: none; padding: 3px 5px; font-size: 10px; }
            .footer-section span.label { font-weight: 600; margin-right: 6px; }

            #loadingMsg { text-align: center; padding: 40px; font-size: 16px; color: #666; }
            #errorMsg { text-align: center; padding: 40px; color: #ef4444; display: none; }

            /* 이메일 모달 */
            .email-modal-overlay {
                display: none; position: fixed; inset: 0;
                background: rgba(0,0,0,.5); z-index: 9000;
                align-items: center; justify-content: center;
            }
            .email-modal-overlay.active { display: flex; }
            .email-modal {
                background: #fff; border-radius: 12px; padding: 28px;
                width: 400px; max-width: 90vw; box-shadow: 0 20px 60px rgba(0,0,0,.3);
            }
            .email-modal h3 { font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #1f2937; }
            .email-modal input {
                width: 100%; padding: 10px 14px; border: 1px solid #d1d5db;
                border-radius: 8px; font-size: 14px; margin-bottom: 16px;
            }
            .email-modal input:focus { outline: none; border-color: #0d9488; box-shadow: 0 0 0 2px rgba(13,148,136,.2); }
            .email-modal .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
            .email-modal .modal-actions button { padding: 8px 20px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600; }
            .email-modal .btn-send { background: #0d9488; color: #fff; }
            .email-modal .btn-send:hover { background: #0f766e; }
            .email-modal .btn-cancel { background: #e5e7eb; color: #374151; }
            .email-modal .btn-cancel:hover { background: #d1d5db; }
        </style>
    </head>
    <body>
        <div class="no-print" id="quotToolbar">
            <span class="title"><i class="fas fa-file-alt"></i> 견 적 서</span>
            <span class="warn" id="settingsWarn"><i class="fas fa-exclamation-triangle"></i> 회사 정보가 미설정입니다. 설정 페이지에서 입력해주세요.</span>
            <span class="expired-badge" id="expiredBadge"><i class="fas fa-times-circle"></i> 만료됨</span>
            <button class="btn-convert" id="convertBtn" onclick="convertToOrder()" style="display:none"><i class="fas fa-exchange-alt"></i> 주문으로 전환</button>
            <button class="btn-email" onclick="openEmailModal()"><i class="fas fa-envelope"></i> 이메일 발송</button>
            <button class="btn-fax" style="padding:6px 16px;background:#6366f1;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;" onclick="openFaxModal()"><i class="fas fa-fax"></i> 팩스 발송</button>
            <button class="btn-print" onclick="window.print()"><i class="fas fa-print"></i> 인쇄 / PDF 저장</button>
            <button class="btn-close" onclick="if(window.opener||window.history.length<=1){window.close()}else{window.history.back()}"><i class="fas fa-times"></i> 닫기</button>
        </div>
        <script>if(window.self!==window.top){document.getElementById('quotToolbar').style.display='none';}</script>
        <div class="toast-msg toast-error" id="toastError"></div>
        <div class="toast-msg toast-success" id="toastSuccess"></div>

        <!-- 팩스 발송 모달 -->
        <div id="faxModal" class="no-print" style="display:none;position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;">
            <div style="background:#fff;border-radius:12px;padding:24px;width:400px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h3 style="font-size:18px;font-weight:700;margin:0;"><i class="fas fa-fax" style="color:#6366f1;margin-right:8px;"></i>팩스 발송</h3>
                    <button onclick="closeFaxModal()" style="background:none;border:none;font-size:18px;cursor:pointer;color:#999;">&times;</button>
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">수신 팩스번호 <span style="color:#ef4444;">*</span></label>
                    <input type="text" id="faxReceiverNum" placeholder="042-000-0000" style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:14px;box-sizing:border-box;">
                </div>
                <div style="margin-bottom:16px;">
                    <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">수신자명</label>
                    <input type="text" id="faxReceiverName" placeholder="수신자명" style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:14px;box-sizing:border-box;">
                </div>
                <div id="faxStatus" style="font-size:12px;color:#6b7280;margin-bottom:12px;"></div>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                    <button onclick="closeFaxModal()" style="padding:8px 16px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;">취소</button>
                    <button onclick="sendFax()" id="faxSendBtn" style="padding:8px 16px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;"><i class="fas fa-paper-plane" style="margin-right:4px;"></i>발송</button>
                </div>
            </div>
        </div>

        <!-- 이메일 발송 모달 -->
        <div class="email-modal-overlay" id="emailModalOverlay" onclick="if(event.target===this)closeEmailModal()">
            <div class="email-modal">
                <h3><i class="fas fa-envelope mr-2" style="color:#0d9488"></i>이메일 발송</h3>
                <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">수신 이메일</label>
                <input type="email" id="emailTo" placeholder="example@company.com">
                <div class="modal-actions">
                    <button class="btn-cancel" onclick="closeEmailModal()">취소</button>
                    <button class="btn-send" onclick="sendEmail()" id="sendEmailBtn"><i class="fas fa-paper-plane mr-1"></i>발송</button>
                </div>
            </div>
        </div>

        <div class="page-wrapper">
            <div id="loadingMsg"><i class="fas fa-spinner fa-spin"></i> 견적서를 불러오는 중...</div>
            <div id="errorMsg"></div>
            <div id="invoiceContent" style="display:none"></div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js"></script>
        <script>
            var ORDER_ID = ${orderId};

            function openFaxModal() {
                document.getElementById('faxModal').style.display = 'flex';
                document.getElementById('faxStatus').textContent = '';
                document.getElementById('faxSendBtn').disabled = false;
            }
            function closeFaxModal() {
                document.getElementById('faxModal').style.display = 'none';
            }
            async function sendFax() {
                var receiverNum = document.getElementById('faxReceiverNum').value.trim();
                var receiverName = document.getElementById('faxReceiverName').value.trim();
                if (!receiverNum) { document.getElementById('faxStatus').textContent = '팩스번호를 입력해주세요.'; document.getElementById('faxStatus').style.color = '#ef4444'; return; }
                var statusEl = document.getElementById('faxStatus');
                statusEl.textContent = 'PDF 생성 중...';
                statusEl.style.color = '#6b7280';
                document.getElementById('faxSendBtn').disabled = true;
                try {
                    var element = document.getElementById('invoiceContent');
                    var pdfBlob = await html2pdf().set({
                        margin: [10, 12, 10, 12],
                        filename: 'quotation.pdf',
                        image: { type: 'jpeg', quality: 0.95 },
                        html2canvas: { scale: 2, useCORS: true },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                    }).from(element).outputPdf('blob');
                    statusEl.textContent = '팩스 발송 중...';
                    var reader = new FileReader();
                    reader.onloadend = async function() {
                        var base64 = reader.result.split(',')[1];
                        try {
                            var token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
                            var res = await axios.post('/api/fax/send', {
                                receiver_num: receiverNum,
                                receiver_name: receiverName,
                                file_name: 'quotation-' + ORDER_ID + '.pdf',
                                file_data: base64,
                                related_type: 'quotations',
                                related_id: ORDER_ID
                            }, { headers: { 'Authorization': 'Bearer ' + token } });
                            if (res.data.success) {
                                statusEl.textContent = '팩스 발송 완료!';
                                statusEl.style.color = '#16a34a';
                            } else {
                                statusEl.textContent = '발송 실패: ' + (res.data.error || '');
                                statusEl.style.color = '#ef4444';
                            }
                        } catch(e) {
                            statusEl.textContent = '발송 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message);
                            statusEl.style.color = '#ef4444';
                        }
                        document.getElementById('faxSendBtn').disabled = false;
                    };
                    reader.readAsDataURL(pdfBlob);
                } catch(e) {
                    statusEl.textContent = 'PDF 생성 실패: ' + e.message;
                    statusEl.style.color = '#ef4444';
                    document.getElementById('faxSendBtn').disabled = false;
                }
            }

            ${quotationScript}
        </script>
    </body>
    </html>
  `)
}
