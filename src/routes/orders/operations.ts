import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { Order, OrderItem, ApiResponse, PaginatedResponse } from '../../types/models'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { requireAnyPagePermission } from '../../middleware/permissions'
import { logActivity } from '../../utils/activityLog'
import { notifyRoles } from '../../utils/notify'
import { recalculateOrderCosts } from '../../utils/costCalculator'
import { sendEmail } from '../../services/emailProvider'
import { getEntityId } from '../../utils/entityFilter'

// ---------- D1 row shapes ----------
interface OrderCopyRow {
  id: number; client_id: number; order_number: string; status: string
  order_year: number; order_month: number
  reception_location: string | null; delivery_info: string | null; delivery_date: string | null
  total_amount: number; vat_amount: number; discount_amount: number; final_amount: number
  notes: string | null; internal_notes: string | null
  priority: string | null; delivery_method: string | null; delivery_time: string | null
  contact_phone: string | null; contact_mobile: string | null; shipping_payment: string | null
}
interface OrderItemCopyRow {
  id: number; order_id: number; item_id: number | null
  item_name: string; category_name: string | null
  width: number | null; height: number | null; quantity: number; unit: string
  unit_price: number; amount: number; vat_included: number
  post_processing: string | null; content: string | null; sort_order: number
  scale_factor: number; ai_group_index: number | null; parent_item_id: number | null
}
interface MaxSeqRow { max_seq: number }
interface QuotationRow {
  id: number; order_number: string; status: string
  valid_until: string | null; client_id: number; final_amount: number
}
interface OrderEmailRow {
  id: number; order_number: string; order_date: string; delivery_date: string | null
  client_name: string; representative: string | null; client_email: string | null; client_balance: number
  total_amount: number; vat_amount: number; discount_amount: number; final_amount: number
  notes: string | null; valid_until: string | null
  client_id: number; status: string
}
interface EmailItemRow {
  item_name: string; width: number | null; height: number | null
  quantity: number; unit: string; unit_price: number; amount: number; vat_included: number
}
interface SettingRow { setting_key: string; setting_value: string | null }
interface SettingValueRow { setting_value: string | null }

const ordersOpsRouter = new Hono<HonoEnv>()
ordersOpsRouter.use('/*', authMiddleware, requireAnyPagePermission('/orders', '/cards'))

ordersOpsRouter.post('/:id/copy', requireRole('ADMIN', 'MANAGER', 'DESIGNER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')

    // Get original order
    const original = await c.env.DB.prepare(`
      SELECT id, client_id, order_number, status,
             order_year, order_month, reception_location, delivery_info, delivery_date,
             total_amount, vat_amount, discount_amount, final_amount,
             notes, internal_notes,
             priority, delivery_method, delivery_time,
             contact_phone, contact_mobile, shipping_payment
      FROM orders WHERE id = ?
    `).bind(id).first<OrderCopyRow>()

    if (!original) {
      return c.json({ success: false, error: 'Order not found' }, 404)
    }

    // Get original order items
    const { results: originalItems } = await c.env.DB.prepare(`
      SELECT id, order_id, item_id, item_name, category_name,
             width, height, quantity, unit, unit_price, amount, vat_included,
             post_processing, content, sort_order, parent_item_id,
             scale_factor, ai_group_index
      FROM order_items WHERE order_id = ? ORDER BY sort_order ASC
    `).bind(id).all<OrderItemCopyRow>()

    // Generate new order number
    const today = new Date()
    const dateStr = today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0')

    // MAX 기반: 삭제된 주문이 있어도 시퀀스가 겹치지 않음
    const seqRow = await c.env.DB.prepare(`
      SELECT COALESCE(MAX(CAST(SUBSTR(order_number, 10) AS INTEGER)), 0) as max_seq
      FROM orders WHERE order_number LIKE ?
    `).bind(`${dateStr}-%`).first<MaxSeqRow>()

    const newOrderNumber = `${dateStr}-${String((seqRow?.max_seq || 0) + 1).padStart(3, '0')}`

    // Insert new order
    const orderResult = await c.env.DB.prepare(`
      INSERT INTO orders (
        order_number, client_id, status,
        order_year, order_month, reception_location, delivery_info,
        delivery_date, order_date,
        total_amount, vat_amount, discount_amount, final_amount,
        notes, internal_notes, created_by,
        priority, delivery_method, delivery_time,
        contact_phone, contact_mobile, shipping_payment, entity_id
      ) VALUES (?, ?, 'CONFIRMED', ?, ?, ?, ?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newOrderNumber,
      original.client_id,
      today.getFullYear(),
      today.getMonth() + 1,
      original.reception_location || null,
      original.delivery_info || null,
      original.delivery_date || null,
      original.total_amount || 0,
      original.vat_amount || 0,
      original.discount_amount || 0,
      original.final_amount || 0,
      (original.notes ? original.notes + ' (복사본)' : '복사본'),
      original.internal_notes || null,
      user.id,
      original.priority || 'NORMAL',
      original.delivery_method || null,
      original.delivery_time || null,
      original.contact_phone || null,
      original.contact_mobile || null,
      original.shipping_payment || null,
      getEntityId(c)
    ).run()

    const newOrderId = orderResult.meta.last_row_id

    // Copy order items — two-pass to preserve parent_item_id bundle structure
    // Pass 1: rows with no parent (parent or standalone) → collect old id → new id mapping
    const copyIdMap = new Map<number, number>() // oldId → newId

    for (const item of originalItems) {
      if (item.parent_item_id !== null && item.parent_item_id !== undefined) continue

      const insertResult = await c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_id, item_name, category_name,
          width, height, quantity, unit,
          unit_price, amount, vat_included,
          post_processing, content, sort_order,
          scale_factor, ai_group_index, parent_item_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).bind(
        newOrderId,
        item.item_id || null,
        item.item_name,
        item.category_name || null,
        item.width || null,
        item.height || null,
        item.quantity,
        item.unit || 'EA',
        item.unit_price,
        item.amount,
        item.vat_included,
        item.post_processing || null,
        item.content || null,
        item.sort_order,
        item.scale_factor || 1,
        item.ai_group_index !== undefined ? item.ai_group_index : null
      ).run()

      copyIdMap.set(item.id as number, insertResult.meta.last_row_id as number)
    }

    // Pass 2: child rows → resolve parent_item_id via mapping
    for (const item of originalItems) {
      if (item.parent_item_id === null || item.parent_item_id === undefined) continue

      const newParentId = copyIdMap.get(item.parent_item_id as number) ?? null

      await c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_id, item_name, category_name,
          width, height, quantity, unit,
          unit_price, amount, vat_included,
          post_processing, content, sort_order,
          scale_factor, ai_group_index, parent_item_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        newOrderId,
        item.item_id || null,
        item.item_name,
        item.category_name || null,
        item.width || null,
        item.height || null,
        item.quantity,
        item.unit || 'EA',
        item.unit_price,
        item.amount,
        item.vat_included,
        item.post_processing || null,
        item.content || null,
        item.sort_order,
        item.scale_factor || 1,
        item.ai_group_index !== undefined ? item.ai_group_index : null,
        newParentId
      ).run()
    }

    return c.json({
      success: true,
      data: { id: newOrderId, order_number: newOrderNumber },
      message: `Order copied as ${newOrderNumber}`
    })
  } catch (error) {
    console.error('Order copy error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /:id/convert-to-order - 견적서 → 주문 전환 (MANAGER+)
ordersOpsRouter.post('/:id/convert-to-order', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const body = await c.req.json().catch(() => ({})) as { force?: boolean }
    const force = body.force === true

    const order = await c.env.DB.prepare(`
      SELECT id, order_number, status, valid_until, client_id, final_amount
      FROM orders WHERE id = ?
    `).bind(id).first<QuotationRow>()

    if (!order) {
      return c.json({ success: false, error: 'Order not found' }, 404)
    }

    if (order.status !== 'QUOTATION') {
      return c.json({
        success: false,
        error: `견적서 상태가 아닙니다. 현재 상태: ${order.status}`
      }, 400)
    }

    // 유효기한 만료 확인
    const today = new Date().toISOString().split('T')[0]
    const isExpired = order.valid_until && order.valid_until < today

    if (isExpired && !force) {
      return c.json({
        success: false,
        error: `견적 유효기한이 만료되었습니다 (${order.valid_until}). force=true 로 강제 전환하거나 유효기한을 연장하세요.`,
        data: { expired: true, valid_until: order.valid_until }
      }, 400)
    }

    // QUOTATION → CONFIRMED 전환
    await c.env.DB.prepare(`
      UPDATE orders SET status = 'CONFIRMED', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(id).run()

    // balance는 경리 확인(BILLED) 시점에만 반영 — 견적서→주문 전환 시 미반영

    await c.env.DB.prepare(`
      INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, 'QUOTATION', 'CONFIRMED', ?, ?)
    `).bind(id, user?.id || null, force && isExpired ? '만료 견적 강제 전환' : '견적서 → 주문 전환').run()

    return c.json({
      success: true,
      message: `견적서 ${order.order_number}이(가) 주문으로 전환되었습니다.`,
      data: { id: order.id, order_number: order.order_number, status: 'CONFIRMED' },
      ...(isExpired && { warning: `유효기한이 만료된 견적서입니다 (${order.valid_until}).` })
    })
  } catch (error) {
    console.error('src/routes/orders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /:id/send-email - 거래명세서 또는 견적서 이메일 발송 (MANAGER+)
ordersOpsRouter.post('/:id/send-email', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const { type, to_email } = await c.req.json() as { type: 'invoice' | 'quotation'; to_email: string }

    if (!type || !to_email) {
      return c.json({ success: false, error: 'type과 to_email은 필수입니다.' }, 400)
    }
    if (!['invoice', 'quotation'].includes(type)) {
      return c.json({ success: false, error: "type은 'invoice' 또는 'quotation'이어야 합니다." }, 400)
    }

    // 이메일 형식 기본 검증
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to_email)) {
      return c.json({ success: false, error: '올바른 이메일 주소를 입력하세요.' }, 400)
    }

    // 주문 + 거래처 정보 조회
    const order = await c.env.DB.prepare(`
      SELECT o.*, c.client_name, c.representative, c.email as client_email, c.balance as client_balance
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.id = ?
    `).bind(id).first<OrderEmailRow>()

    if (!order) {
      return c.json({ success: false, error: 'Order not found' }, 404)
    }

    // 주문 품목 조회 (부모/단독 행만)
    const { results: items } = await c.env.DB.prepare(`
      SELECT item_name, width, height, quantity, unit, unit_price, amount, vat_included
      FROM order_items
      WHERE order_id = ? AND parent_item_id IS NULL
      ORDER BY sort_order ASC
    `).bind(id).all<EmailItemRow>()

    // 회사 settings 조회
    const { results: settingsRows } = await c.env.DB.prepare(
      'SELECT setting_key, setting_value FROM settings'
    ).all<SettingRow>()
    const company: Record<string, string> = {}
    for (const row of settingsRows) {
      company[row.setting_key] = row.setting_value || ''
    }

    const companyName = company.company_name || '동산기획'
    const fromEmail = company.email_from_address || company.company_email
    const fromName = company.email_from_name || companyName

    // 거래처 미수금 계산 (거래명세서용)
    const currentBalance = order.client_balance || 0
    const previousBalance = currentBalance - (order.final_amount || 0)

    // 문서 유형별 제목 및 본문 구성
    const isQuotation = type === 'quotation'
    const docTitle = isQuotation ? '견적서' : '거래명세서'
    const subject = `[${companyName}] ${docTitle} - ${order.order_number} (${order.client_name})`

    // 금액 포맷 (한국식 콤마 구분)
    const formatAmount = (v: number) => Math.round(v).toLocaleString('ko-KR')

    // 품목 테이블 행 생성
    const itemRows = items.map((item) => {
      const sizeStr = item.width && item.height
        ? `${item.width}x${item.height}cm`
        : ''
      return `
        <tr>
          <td style="padding:6px 10px;border:1px solid #ddd;">${item.item_name}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;">${sizeStr}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;">${item.quantity}${item.unit}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;">${formatAmount(item.unit_price)}원</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;">${formatAmount(item.amount)}원</td>
        </tr>`
    }).join('')

    // 문서별 추가 정보 블록
    const extraInfoBlock = isQuotation
      ? `<p style="margin:4px 0;color:#e67e22;"><strong>견적 유효기한:</strong> ${order.valid_until || '미지정'}</p>`
      : `
        <p style="margin:4px 0;"><strong>이전 미수금:</strong> ${formatAmount(previousBalance)}원</p>
        <p style="margin:4px 0;"><strong>현재 미수금:</strong> ${formatAmount(currentBalance)}원</p>`

    const htmlBody = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:'Malgun Gothic',Arial,sans-serif;color:#333;max-width:700px;margin:0 auto;padding:20px;">
  <div style="background:#1a56db;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:22px;">${companyName}</h1>
    <p style="color:#c7d9ff;margin:6px 0 0;font-size:14px;">${docTitle}</p>
  </div>
  <div style="background:#f8f9fa;padding:16px 24px;border:1px solid #e2e8f0;border-top:none;">
    <p style="margin:4px 0;"><strong>주문번호:</strong> ${order.order_number}</p>
    <p style="margin:4px 0;"><strong>거래처:</strong> ${order.client_name}</p>
    <p style="margin:4px 0;"><strong>주문일:</strong> ${order.order_date}</p>
    ${order.delivery_date ? `<p style="margin:4px 0;"><strong>납기일:</strong> ${order.delivery_date}</p>` : ''}
    ${extraInfoBlock}
  </div>
  <div style="padding:16px 24px;border:1px solid #e2e8f0;border-top:none;">
    <h3 style="margin:0 0 10px;font-size:15px;">품목 내역</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">품목명</th>
          <th style="padding:8px 10px;border:1px solid #ddd;">규격</th>
          <th style="padding:8px 10px;border:1px solid #ddd;">수량</th>
          <th style="padding:8px 10px;border:1px solid #ddd;">단가</th>
          <th style="padding:8px 10px;border:1px solid #ddd;">금액</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
  </div>
  <div style="background:#f8f9fa;padding:12px 24px;border:1px solid #e2e8f0;border-top:none;text-align:right;">
    <p style="margin:4px 0;font-size:14px;"><strong>공급가액:</strong> ${formatAmount(order.total_amount)}원</p>
    <p style="margin:4px 0;font-size:14px;"><strong>부가세:</strong> ${formatAmount(order.vat_amount)}원</p>
    ${order.discount_amount > 0 ? `<p style="margin:4px 0;font-size:14px;"><strong>할인:</strong> -${formatAmount(order.discount_amount)}원</p>` : ''}
    <p style="margin:8px 0 0;font-size:16px;color:#1a56db;"><strong>합계금액: ${formatAmount(order.final_amount)}원</strong></p>
  </div>
  <div style="padding:12px 24px;border:1px solid #e2e8f0;border-top:none;font-size:12px;color:#888;text-align:center;">
    본 메일은 ${companyName} ERP 시스템에서 자동 발송되었습니다.
  </div>
</body>
</html>`

    // 포털 안전 확인 링크 생성
    const user = c.get('user')
    let portalLink = ''
    try {
      const { generatePortalToken } = await import('../portal')
      const siteUrlSetting = await c.env.DB.prepare(
        `SELECT setting_value FROM settings WHERE setting_key = 'site_base_url'`
      ).first<SettingValueRow>()
      const baseUrl = siteUrlSetting?.setting_value || new URL(c.req.url).origin
      const portalResult = await generatePortalToken(c.env.DB, order.client_id, user?.id || 0, baseUrl, 7,
        { type: 'invoice', order_id: Number(id) })
      portalLink = `${baseUrl}/portal/document?t=${portalResult.token}`
    } catch (_) { /* 포털 링크 생성 실패는 무시 */ }

    // 포털 링크가 있으면 이메일 본문에 안전 확인 버튼 추가
    const finalHtml = portalLink
      ? htmlBody.replace(
          '본 메일은 ' + companyName + ' ERP 시스템에서 자동 발송되었습니다.',
          `<a href="${portalLink}" style="display:inline-block;padding:12px 28px;background:#1a56db;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;margin-bottom:12px;">문서 안전 확인 (사업자등록번호 인증)</a><br>본 메일은 ${companyName} ERP 시스템에서 자동 발송되었습니다.`
        )
      : htmlBody

    const emailResult = await sendEmail(c.env, c.env.DB, {
      to: to_email,
      subject: subject,
      html: finalHtml,
      from: fromEmail ? `${fromName} <${fromEmail}>` : undefined
    }, {
      template: isQuotation ? 'QUOTATION' : 'INVOICE',
      relatedType: 'ORDER',
      relatedId: Number(id),
      sentBy: user?.id
    })

    if (emailResult.success) {
      return c.json({
        success: true,
        message: `${docTitle}가 ${to_email}(으)로 발송되었습니다.`,
        data: {
          order_number: order.order_number,
          to_email: to_email,
          type: type,
          subject: subject
        }
      })
    } else {
      return c.json({
        success: false,
        error: emailResult.error
      }, 500)
    }
  } catch (error) {
    console.error('src/routes/orders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})


export default ordersOpsRouter
