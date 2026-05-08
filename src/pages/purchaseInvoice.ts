import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import purchaseInvoiceScript from '../scripts/purchaseInvoice.js?raw'

export function purchaseInvoicePage(c: Context<HonoEnv>) {
  var poId = c.req.param('poId')
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>발주서</title>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; background: #e5e7eb; }

            @page { size: A4; margin: 10mm 12mm; }
            @media print {
                .no-print { display: none !important; }
                body { background: #fff; }
                .page-wrapper { padding: 0; }
                .po-sheet { box-shadow: none; }
            }

            .no-print {
                position: sticky; top: 0; z-index: 100;
                background: #1e40af; color: #fff;
                padding: 12px 24px; display: flex; gap: 12px; align-items: center;
                box-shadow: 0 2px 8px rgba(0,0,0,.2);
            }
            .no-print button {
                padding: 8px 20px; border: none; border-radius: 6px;
                font-size: 14px; cursor: pointer; font-weight: 600;
            }
            .no-print .btn-print { background: #fff; color: #1e40af; }
            .no-print .btn-print:hover { background: #dbeafe; }
            .no-print .btn-close { background: #ef4444; color: #fff; }
            .no-print .btn-close:hover { background: #dc2626; }
            .no-print .title { font-size: 16px; font-weight: 700; flex: 1; }

            .page-wrapper { max-width: 210mm; margin: 0 auto; padding: 16px; }

            .po-sheet {
                width: 100%; background: #fff;
                border: 2px solid #000; padding: 6mm 8mm;
                box-shadow: 0 1px 4px rgba(0,0,0,.1);
            }

            .po-header { display: flex; align-items: center; justify-content: center; position: relative; margin-bottom: 8px; }
            .po-logo { position: absolute; left: 0; max-height: 42px; max-width: 120px; }
            .po-title { text-align: center; font-size: 24px; font-weight: 900; letter-spacing: 16px; }
            .po-subtitle { text-align: center; font-size: 11px; color: #555; margin-bottom: 8px; }

            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #000; margin-bottom: 6px; }
            .info-box { }
            .info-box .box-title { text-align: center; font-weight: 700; font-size: 11px; background: #f3f4f6; padding: 3px; border-bottom: 1px solid #000; }
            .info-box:first-child { border-right: 1px solid #000; }
            .info-row { display: grid; grid-template-columns: 72px 1fr; font-size: 10.5px; border-bottom: 1px solid #ddd; }
            .info-row:last-child { border-bottom: none; }
            .info-label { background: #f9fafb; padding: 3px 5px; font-weight: 600; border-right: 1px solid #ddd; white-space: nowrap; }
            .info-value { padding: 3px 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

            .meta-row { display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; border-bottom: 1px solid #000; margin-bottom: 0; }
            .total-korean { text-align: center; font-size: 13px; font-weight: 700; padding: 5px; border-bottom: 1px solid #000; background: #f9fafb; }

            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
            .items-table th, .items-table td { border: 1px solid #000; padding: 3px 4px; text-align: center; font-size: 10.5px; }
            .items-table th { background: #f3f4f6; font-weight: 700; }
            .items-table td.left { text-align: left; }
            .items-table td.right { text-align: right; }
            .items-table .empty-row td { height: 18px; }
            .items-table .total-row td { font-weight: 700; background: #f9fafb; }

            .footer-section { border: 1px solid #000; border-top: none; padding: 4px 6px; font-size: 10.5px; }
            .footer-section span.label { font-weight: 600; margin-right: 6px; }

            .sign-section {
                display: grid; grid-template-columns: 1fr 1fr;
                border: 1px solid #000; border-top: none;
            }
            .sign-box { padding: 10px 12px; min-height: 60px; position: relative; }
            .sign-box:first-child { border-right: 1px solid #000; }
            .sign-box .sign-label { font-size: 11px; font-weight: 700; margin-bottom: 6px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
            .sign-box .sign-info { font-size: 10.5px; line-height: 1.6; }

            .rep-row { display: flex; justify-content: space-between; align-items: center; }
            .rep-name { font-weight: 600; white-space: nowrap; }
            .rep-stamp { max-height: 28px; max-width: 28px; vertical-align: middle; margin-left: 2px; opacity: 0.85; }
            .stamp-placeholder { color: #999; font-size: 10px; margin-left: 2px; }

            #loadingMsg { text-align: center; padding: 40px; font-size: 16px; color: #666; }
            #errorMsg { text-align: center; padding: 40px; color: #ef4444; display: none; }
        </style>
    </head>
    <body>
        <div class="no-print">
            <span class="title"><i class="fas fa-file-invoice"></i> 발주서</span>
            <button class="btn-fax" style="padding:6px 16px;background:#6366f1;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;" onclick="openFaxModal()"><i class="fas fa-fax"></i> 팩스 발송</button>
            <button class="btn-print" onclick="window.print()"><i class="fas fa-print"></i> 인쇄 / PDF 저장</button>
            <button class="btn-close" onclick="if(window.opener||window.history.length<=1){window.close()}else{window.history.back()}"><i class="fas fa-times"></i> 닫기</button>
        </div>

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

        <div class="page-wrapper">
            <div id="loadingMsg"><i class="fas fa-spinner fa-spin"></i> 발주서를 불러오는 중...</div>
            <div id="errorMsg"></div>
            <div id="invoiceContent" style="display:none"></div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
            var PO_ID = ${poId};

            // 팩스 모달
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
                    // html2pdf로 invoiceContent를 PDF로 변환
                    var element = document.getElementById('invoiceContent');
                    var pdfBlob = await html2pdf().set({
                        margin: [10, 12, 10, 12],
                        filename: 'purchase-order.pdf',
                        image: { type: 'jpeg', quality: 0.95 },
                        html2canvas: { scale: 2, useCORS: true },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                    }).from(element).outputPdf('blob');

                    statusEl.textContent = '팩스 발송 중...';

                    // blob → base64
                    var reader = new FileReader();
                    reader.onloadend = async function() {
                        var base64 = reader.result.split(',')[1];

                        try {
                            // JWT 토큰
                            var token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
                            var res = await axios.post('/api/fax/send', {
                                receiver_num: receiverNum,
                                receiver_name: receiverName,
                                file_name: 'purchase-order-' + PO_ID + '.pdf',
                                file_data: base64,
                                related_type: 'purchase_orders',
                                related_id: PO_ID
                            }, {
                                headers: { 'Authorization': 'Bearer ' + token }
                            });

                            if (res.data.success) {
                                statusEl.textContent = '팩스 발송 완료! (접수번호: ' + (res.data.data.receipt_num || '-') + ')';
                                statusEl.style.color = '#16a34a';
                            } else {
                                statusEl.textContent = '발송 실패: ' + (res.data.error || '알 수 없는 오류');
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

            ${purchaseInvoiceScript}
        </script>
    </body>
    </html>
  `)
}
