import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import invoiceScript from '../scripts/invoice.js?raw'

export function invoicePage(c: Context<HonoEnv>) {
  const orderId = parseInt(c.req.param('orderId') || '', 10)
  if (isNaN(orderId)) return c.text('Invalid order ID', 400)
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>거래 명세서</title>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; background: #e5e7eb; }

            @page { size: A4; margin: 5mm 8mm; }
            @media print {
                .no-print, .email-modal-overlay { display: none !important; }
                body { background: #fff; }
                .page-wrapper { padding: 0; }
                .invoice-half { box-shadow: none; margin-bottom: 0; padding: 2mm 3mm; page-break-inside: auto; page-break-after: auto; }
                .invoice-full { page-break-after: auto; }
                .page-break-print { display: none !important; }
                .cut-line { margin: 1mm 0; height: 8px; }
                .cut-line::after { background: #fff; color: #666; font-size: 8px; }
                .inv-title { font-size: 15px; letter-spacing: 8px; margin-bottom: 0; }
                .inv-copy { font-size: 9px; margin-bottom: 1px; }
                .info-box .box-title { padding: 1px; font-size: 9.5px; }
                .info-row { font-size: 9px; }
                .info-row .info-label, .info-row .info-value { padding: 1px 3px; }
                .meta-row { font-size: 9.5px; padding: 1px 0; }
                .total-korean { font-size: 10px; padding: 2px; }
                .items-table th, .items-table td { padding: 1px 2px; font-size: 8.5px; }
                .items-table .empty-row td { height: 13px; }
                .footer-section { padding: 1.5px 4px; font-size: 8.5px; }
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
            .no-print .btn-tax { background: #10b981; color: #fff; }
            .no-print .btn-tax:hover { background: #059669; }
            .no-print .btn-tax-link { background: #6366f1; color: #fff; text-decoration: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
            .no-print .btn-tax-link:hover { background: #4f46e5; }
            .no-print .btn-email { background: var(--c-teal); color: #fff; }
            .no-print .btn-email:hover { background: #0f766e; }
            .no-print .btn-fax { background: #6366f1; color: #fff; }
            .no-print .btn-fax:hover { background: #4f46e5; }
            .no-print .title { font-size: 16px; font-weight: 700; flex: 1; }
            .no-print .warn { background: #fbbf24; color: #92400e; padding: 6px 14px; border-radius: 6px; font-size: 12px; display: none; }
            .toast-msg { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,.3); display: none; }
            .toast-error { background: #ef4444; color: #fff; }
            .toast-success { background: #10b981; color: #fff; }
            /* 이메일 모달 */
            .email-modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 9000; align-items: center; justify-content: center; }
            .email-modal-overlay.active { display: flex; }
            .email-modal { background: #fff; border-radius: 12px; padding: 28px; width: 400px; max-width: 90vw; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
            .email-modal h3 { font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #1f2937; }
            .email-modal input { width: 100%; padding: 10px 14px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; margin-bottom: 16px; }
            .email-modal input:focus { outline: none; border-color: #1e40af; box-shadow: 0 0 0 2px rgba(30,64,175,.2); }
            .email-modal .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
            .email-modal .modal-actions button { padding: 8px 20px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600; }
            .email-modal .btn-send { background: #1e40af; color: #fff; }
            .email-modal .btn-send:hover { background: #1d3a9b; }
            .email-modal .btn-cancel { background: #e5e7eb; color: #374151; }
            .email-modal .btn-cancel:hover { background: #d1d5db; }

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
        </style>
    </head>
    <body>
        <div class="no-print" id="invoiceToolbar">
            <span class="title"><i class="fas fa-file-invoice"></i> 거래 명세서</span>
            <span class="warn" id="settingsWarn"><i class="fas fa-exclamation-triangle"></i> 회사 정보가 미설정입니다. 설정 페이지에서 입력해주세요.</span>
            <span id="taxInvoiceAction"></span>
            <button class="btn-fax" onclick="sendFax()"><i class="fas fa-fax"></i> 팩스</button>
            <button class="btn-email" onclick="openEmailModal()"><i class="fas fa-envelope"></i> 이메일 발송</button>
            <button class="btn-print" onclick="window.print()"><i class="fas fa-print"></i> 인쇄 / PDF 저장</button>
            <button class="btn-close" onclick="if(window.opener||window.history.length<=1){window.close()}else{window.history.back()}"><i class="fas fa-times"></i> 닫기</button>
        </div>
        <script>if(window.self!==window.top){document.getElementById('invoiceToolbar').style.display='none';}</script>
        <div class="toast-msg toast-error" id="toastError"></div>
        <div class="toast-msg toast-success" id="toastSuccess"></div>

        <!-- 이메일 발송 모달 -->
        <div class="email-modal-overlay" id="emailModalOverlay" onclick="if(event.target===this)closeEmailModal()">
            <div class="email-modal">
                <h3><i class="fas fa-envelope mr-2" style="color:#1e40af"></i>이메일 발송</h3>
                <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">수신 이메일</label>
                <input type="email" id="emailTo" placeholder="example@company.com">
                <div class="modal-actions">
                    <button class="btn-cancel" onclick="closeEmailModal()">취소</button>
                    <button class="btn-send" onclick="sendEmail()" id="sendEmailBtn"><i class="fas fa-paper-plane mr-1"></i>발송</button>
                </div>
            </div>
        </div>

        <div class="page-wrapper">
            <div id="loadingMsg"><i class="fas fa-spinner fa-spin"></i> 거래 명세서를 불러오는 중...</div>
            <div id="errorMsg"></div>
            <div id="invoiceContent" style="display:none"></div>
        </div>

        <script>
            var ORDER_ID = ${orderId};
            ${invoiceScript}
        </script>
    </body>
    </html>
  `)
}
