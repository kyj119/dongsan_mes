// ============================================================================
// 이메일 템플릿
// ============================================================================

export type TemplateName = 'SHIPMENT_NOTICE' | 'INVOICE_ISSUED' | 'PAYMENT_REMINDER'

interface TemplateResult {
  subject: string
  html: string
}

// ── 출고/배송 알림 ──────────────────────────────────────────────────────────

interface ShipmentData {
  clientName: string
  orderNumber: string
  shipmentNumber: string
  shippedAt: string
  deliveryType: string       // 택배, 화물, 직접배송
  courierName?: string       // 택배사명
  trackingNumber?: string    // 운송장번호
  items: Array<{ itemName: string; quantity: number; width?: number; height?: number }>
  notes?: string
}

function renderShipmentNotice(data: ShipmentData): TemplateResult {
  const subject = `[동산현수막] 출고 알림 - ${data.orderNumber}`

  const itemRows = data.items.map(item => {
    const size = item.width && item.height ? `${item.width}×${item.height}mm` : '-'
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${item.itemName}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${size}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
    </tr>`
  }).join('')

  let deliveryInfo = ''
  if (data.deliveryType === '택배' || data.deliveryType === 'PARCEL') {
    deliveryInfo = `
      <tr><td style="padding:6px 0;color:#666;">배송방법</td><td style="padding:6px 0;font-weight:600;">택배</td></tr>
      ${data.courierName ? `<tr><td style="padding:6px 0;color:#666;">택배사</td><td style="padding:6px 0;font-weight:600;">${data.courierName}</td></tr>` : ''}
      ${data.trackingNumber ? `<tr><td style="padding:6px 0;color:#666;">운송장번호</td><td style="padding:6px 0;font-weight:600;">${data.trackingNumber}</td></tr>` : ''}
    `
  } else if (data.deliveryType === '화물' || data.deliveryType === 'FREIGHT') {
    deliveryInfo = `
      <tr><td style="padding:6px 0;color:#666;">배송방법</td><td style="padding:6px 0;font-weight:600;">화물</td></tr>
      ${data.courierName ? `<tr><td style="padding:6px 0;color:#666;">화물사</td><td style="padding:6px 0;font-weight:600;">${data.courierName}</td></tr>` : ''}
      ${data.trackingNumber ? `<tr><td style="padding:6px 0;color:#666;">화물번호</td><td style="padding:6px 0;font-weight:600;">${data.trackingNumber}</td></tr>` : ''}
    `
  } else {
    deliveryInfo = `<tr><td style="padding:6px 0;color:#666;">배송방법</td><td style="padding:6px 0;font-weight:600;">${data.deliveryType || '직접배송'}</td></tr>`
  }

  const html = baseLayout(`
    <h2 style="color:#1a56db;margin:0 0 8px;">출고 안내</h2>
    <p style="color:#666;margin:0 0 24px;">${data.clientName}님, 주문하신 제품이 출고되었습니다.</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:6px 0;color:#666;">주문번호</td><td style="padding:6px 0;font-weight:600;">${data.orderNumber}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">출고번호</td><td style="padding:6px 0;font-weight:600;">${data.shipmentNumber}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">출고일</td><td style="padding:6px 0;font-weight:600;">${data.shippedAt}</td></tr>
      ${deliveryInfo}
    </table>

    <h3 style="color:#333;margin:0 0 12px;font-size:15px;">출고 품목</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <thead>
        <tr style="background:#f8f9fa;">
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #dee2e6;">품목</th>
          <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #dee2e6;">규격</th>
          <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #dee2e6;">수량</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    ${data.notes ? `<p style="color:#666;font-size:13px;margin:16px 0 0;">비고: ${data.notes}</p>` : ''}
  `)

  return { subject, html }
}

// ── 세금계산서 발행 알림 ────────────────────────────────────────────────────

interface InvoiceIssuedData {
  buyerName: string
  invoiceNumber: string
  issueDate: string
  supplyAmount: number
  taxAmount: number
  totalAmount: number
  ntsApprovalNumber?: string
  orderNumbers?: string
}

function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원'
}

function renderInvoiceIssued(data: InvoiceIssuedData): TemplateResult {
  const subject = `[동산현수막] 세금계산서 발행 안내 - ${data.invoiceNumber}`

  const html = baseLayout(`
    <h2 style="color:#1a56db;margin:0 0 8px;">세금계산서 발행 안내</h2>
    <p style="color:#666;margin:0 0 24px;">${data.buyerName}님, 세금계산서가 발행되었습니다.</p>

    <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#666;">계산서번호</td><td style="padding:6px 0;font-weight:600;">${data.invoiceNumber}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">발행일</td><td style="padding:6px 0;font-weight:600;">${data.issueDate}</td></tr>
        ${data.orderNumbers ? `<tr><td style="padding:6px 0;color:#666;">주문번호</td><td style="padding:6px 0;font-weight:600;">${data.orderNumbers}</td></tr>` : ''}
        ${data.ntsApprovalNumber ? `<tr><td style="padding:6px 0;color:#666;">국세청 승인번호</td><td style="padding:6px 0;font-weight:600;">${data.ntsApprovalNumber}</td></tr>` : ''}
      </table>
    </div>

    <div style="background:#fff;border:1px solid #dee2e6;border-radius:8px;padding:20px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;color:#666;">공급가액</td>
          <td style="padding:8px 0;text-align:right;font-size:16px;">${formatKRW(data.supplyAmount)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666;">세액</td>
          <td style="padding:8px 0;text-align:right;font-size:16px;">${formatKRW(data.taxAmount)}</td>
        </tr>
        <tr style="border-top:2px solid #1a56db;">
          <td style="padding:12px 0;color:#1a56db;font-weight:700;">합계</td>
          <td style="padding:12px 0;text-align:right;font-size:20px;font-weight:700;color:#1a56db;">${formatKRW(data.totalAmount)}</td>
        </tr>
      </table>
    </div>
  `)

  return { subject, html }
}

// ── 미수금 독촉 ────────────────────────────────────────────────────────────

interface PaymentReminderData {
  clientName: string
  totalBalance: number
  agingDays: number
  orders: Array<{ orderNumber: string; amount: number; orderDate: string }>
  notes?: string
}

function renderPaymentReminder(data: PaymentReminderData): TemplateResult {
  const subject = `[동산현수막] 미수금 안내 - ${data.clientName}`

  const orderRows = data.orders.map(o => `<tr>
    <td style="padding:6px 12px;border-bottom:1px solid #eee;">${o.orderNumber}</td>
    <td style="padding:6px 12px;border-bottom:1px solid #eee;">${o.orderDate}</td>
    <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;">${formatKRW(o.amount)}</td>
  </tr>`).join('')

  const html = baseLayout(`
    <h2 style="color:#dc2626;margin:0 0 8px;">미수금 안내</h2>
    <p style="color:#666;margin:0 0 24px;">${data.clientName}님, 아래 미결제 건에 대해 안내드립니다.</p>

    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;margin-bottom:24px;text-align:center;">
      <div style="color:#666;font-size:13px;">총 미수금</div>
      <div style="color:#dc2626;font-size:28px;font-weight:700;margin:8px 0;">${formatKRW(data.totalBalance)}</div>
      <div style="color:#999;font-size:12px;">연체 ${data.agingDays}일</div>
    </div>

    ${data.orders.length > 0 ? `
    <h3 style="color:#333;margin:0 0 12px;font-size:15px;">미결제 주문</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <thead>
        <tr style="background:#f8f9fa;">
          <th style="padding:6px 12px;text-align:left;border-bottom:2px solid #dee2e6;">주문번호</th>
          <th style="padding:6px 12px;text-align:left;border-bottom:2px solid #dee2e6;">주문일</th>
          <th style="padding:6px 12px;text-align:right;border-bottom:2px solid #dee2e6;">금액</th>
        </tr>
      </thead>
      <tbody>${orderRows}</tbody>
    </table>` : ''}

    <p style="color:#666;font-size:13px;">빠른 시일 내 결제 부탁드립니다. 문의사항이 있으시면 연락 주시기 바랍니다.</p>
    ${data.notes ? `<p style="color:#999;font-size:12px;margin-top:16px;">참고: ${data.notes}</p>` : ''}
  `)

  return { subject, html }
}

// ── 공통 레이아웃 ───────────────────────────────────────────────────────────

export function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <!-- Header -->
    <div style="background:#1a56db;border-radius:8px 8px 0 0;padding:20px 24px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:18px;letter-spacing:1px;">동산현수막</h1>
    </div>
    <!-- Content -->
    <div style="background:#fff;padding:32px 24px;border-radius:0 0 8px 8px;">
      ${content}
    </div>
    <!-- Footer -->
    <div style="text-align:center;padding:16px;color:#999;font-size:12px;">
      <p style="margin:4px 0;">본 메일은 발신 전용입니다.</p>
      <p style="margin:4px 0;">동산현수막 | 문의: 042-523-1982</p>
    </div>
  </div>
</body>
</html>`
}

// ── 템플릿 렌더러 ───────────────────────────────────────────────────────────

export function renderTemplate(template: TemplateName, data: Record<string, any>): TemplateResult {
  switch (template) {
    case 'SHIPMENT_NOTICE':
      return renderShipmentNotice(data as unknown as ShipmentData)
    case 'INVOICE_ISSUED':
      return renderInvoiceIssued(data as unknown as InvoiceIssuedData)
    case 'PAYMENT_REMINDER':
      return renderPaymentReminder(data as unknown as PaymentReminderData)
    default:
      throw new Error(`Unknown template: ${template}`)
  }
}
