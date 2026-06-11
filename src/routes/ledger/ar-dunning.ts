/**
 * ledger/ar-dunning.ts — 미수금 독촉 라우트 (accounts-receivable.ts에서 분리, 2026-06-12 대형파일 분할 4/5)
 *
 * 독촉 이력(collection-logs: 거래처별·전체·단건 CRUD) · 독촉 메일 발송(send-email).
 * ⚠️ /collection-logs/:clientId 와 /collection-logs/:id 는 동일 패턴 → 등록 순서(:clientId 먼저) 보존 필수.
 * 배럴(accounts-receivable.ts)에서 마운트. ⚠️ 이동만, 로직 수정 0.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { logActivity } from '../../utils/activityLog'
import { getEntityId, entityFilter } from '../../utils/entityFilter'
import {
  deriveClientBalance,
  type ClientRow, type OrderRow, type PaymentRow, type AdjustmentRow, type UnpaidOrderRow,
} from './ar-helpers'

const arDunningRouter = new Hono<HonoEnv>()
arDunningRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

arDunningRouter.get('/collection-logs/:clientId', async (c) => {
  try {
    const clientId = c.req.param('clientId')
    const { results } = await c.env.DB.prepare(`
      SELECT cl.*, u.name as created_by_name
      FROM collection_logs cl
      LEFT JOIN users u ON cl.created_by = u.id
      WHERE cl.client_id = ?
      ORDER BY cl.contact_date DESC, cl.created_at DESC
    `).bind(clientId).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /collection-log - 독촉 이력 등록 (MANAGER+)
arDunningRouter.post('/collection-log', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json()

    if (!body.client_id || !body.contact_date || !body.contact_method) {
      return c.json({ success: false, error: 'client_id, contact_date, contact_method 필수' }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO collection_logs (client_id, contact_date, contact_method, contact_person, promised_date, promised_amount, notes, created_by, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.client_id,
      body.contact_date,
      body.contact_method,
      body.contact_person || null,
      body.promised_date || null,
      body.promised_amount || null,
      body.notes || null,
      user?.id || null,
      getEntityId(c)
    ).run()

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id },
      message: '독촉 이력이 등록되었습니다'
    })
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /collection-log/:id - 독촉 이력 삭제 (ADMIN)
arDunningRouter.delete('/collection-log/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const existing = await c.env.DB.prepare('SELECT id FROM collection_logs WHERE id = ?').bind(id).first()
    if (!existing) {
      return c.json({ success: false, error: '독촉 이력을 찾을 수 없습니다' }, 404)
    }
    await c.env.DB.prepare('DELETE FROM collection_logs WHERE id = ?').bind(id).run()
    return c.json({ success: true, message: '삭제되었습니다' })
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /collection-logs - 독촉 이력 조회
// ============================================================================
arDunningRouter.get('/collection-logs', async (c) => {
  try {
    const { client_id, page = '1', limit = '30' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 30, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    const whereClauses: string[] = []
    const params: any[] = []

    if (client_id) {
      whereClauses.push('cl.client_id = ?')
      params.push(parseInt(client_id))
    }

    const where = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''

    const { results } = await c.env.DB.prepare(`
      SELECT cl.*, c.client_name, u.name as created_by_name
      FROM collection_logs cl
      LEFT JOIN clients c ON cl.client_id = c.id
      LEFT JOIN users u ON cl.created_by = u.id
      ${where}
      ORDER BY cl.contact_date DESC, cl.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, safeLimit, offset).all()

    const countRow = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM collection_logs cl ${where}
    `).bind(...params).first<{ count: number }>()
    const count = countRow?.count || 0

    return c.json({
      success: true,
      data: results,
      pagination: { page: parseInt(page), limit: safeLimit, total: count, total_pages: Math.ceil(count / safeLimit) }
    })
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST /collection-logs - 독촉 기록 등록 (+ 이메일 발송 옵션)
// ============================================================================
arDunningRouter.post('/collection-logs', async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json() as {
      client_id: number
      contact_method: string
      contact_date: string
      amount_requested?: number
      promised_date?: string
      promised_amount?: number
      notes?: string
      result?: string
      send_email?: boolean
    }

    if (!body.client_id || !body.contact_method || !body.contact_date) {
      return c.json({ success: false, error: '거래처, 연락방법, 연락일을 입력하세요.' }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO collection_logs (client_id, contact_method, contact_date, amount_requested, promised_date, promised_amount, notes, result, created_by, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.client_id,
      body.contact_method,
      body.contact_date,
      body.amount_requested || null,
      body.promised_date || null,
      body.promised_amount || null,
      body.notes || null,
      body.result || null,
      user?.id || null,
      getEntityId(c)
    ).run()

    // 이메일 독촉 발송
    if (body.send_email && body.contact_method === 'EMAIL') {
      try {
        const { sendEmail } = await import('../../services/emailProvider')
        const { renderTemplate } = await import('../../services/emailTemplates')

        const client = await c.env.DB.prepare(
          'SELECT client_name, email, balance FROM clients WHERE id = ?'
        ).bind(body.client_id).first<{ client_name: string; email: string | null; balance: number }>()

        if (client?.email) {
          const { clause: emailOrdEf, params: emailOrdEfParams } = entityFilter(c)
          const { clause: emailPayEf, params: emailPayEfParams } = entityFilter(c)
          const { results: unpaidOrders } = await c.env.DB.prepare(`
            SELECT order_number, billed_amount, order_date
            FROM orders
            WHERE client_id = ? AND billing_status = 'BILLED'${emailOrdEf}
              AND id NOT IN (
                SELECT DISTINCT order_id FROM payments WHERE order_id IS NOT NULL${emailPayEf}
              )
            ORDER BY order_date ASC LIMIT 10
          `).bind(body.client_id, ...emailOrdEfParams, ...emailPayEfParams).all<UnpaidOrderRow>()

          const balance = (await deriveClientBalance(c, body.client_id)) || body.amount_requested || 0  // split billing P3: 파생
          const firstOrderDate = unpaidOrders[0]?.order_date
          const agingDays = firstOrderDate
            ? Math.floor((Date.now() - new Date(firstOrderDate).getTime()) / 86400000)
            : 0

          const { subject, html } = renderTemplate('PAYMENT_REMINDER', {
            clientName: client.client_name,
            totalBalance: balance,
            agingDays: Math.max(agingDays, 0),
            orders: unpaidOrders.map(o => ({
              orderNumber: o.order_number,
              amount: Number(o.billed_amount) || 0,
              orderDate: o.order_date,
            })),
            notes: body.notes,
          })

          await sendEmail(c.env, c.env.DB, { to: client.email, subject, html }, {
            template: 'PAYMENT_REMINDER',
            relatedType: 'collection',
            relatedId: result.meta.last_row_id as number,
            sentBy: user?.id,
          })
        }
      } catch (_emailErr) {
        // 이메일 실패해도 독촉 기록은 성공
      }
    }

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id },
      message: '독촉 기록이 등록되었습니다.'
    }, 201)
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /collection-logs/:id - 독촉 상세
// ============================================================================
arDunningRouter.get('/collection-logs/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const log = await c.env.DB.prepare(`
      SELECT cl.*, c.client_name, u.name as created_by_name
      FROM collection_logs cl
      LEFT JOIN clients c ON cl.client_id = c.id
      LEFT JOIN users u ON cl.created_by = u.id
      WHERE cl.id = ?
    `).bind(id).first()

    if (!log) return c.json({ success: false, error: '독촉 기록을 찾을 수 없습니다.' }, 404)
    return c.json({ success: true, data: log })
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// EMAIL SEND - 원장 이메일 발송
// ============================================================================

arDunningRouter.post('/send-email', async (c) => {
  try {
    const { sendEmail } = await import('../../services/emailProvider')
    const { generatePortalToken } = await import('../portal')

    const body = await c.req.json()
    const { client_id, to_email, period_start, period_end } = body

    if (!client_id || !to_email) {
      return c.json({ success: false, error: 'client_id와 to_email이 필요합니다.' }, 400)
    }

    // Get client info
    const client = await c.env.DB.prepare(
      `SELECT id, client_name, balance FROM clients WHERE id = ?`
    ).bind(client_id).first<ClientRow>()

    if (!client) {
      return c.json({ success: false, error: '거래처를 찾을 수 없습니다.' }, 404)
    }

    // Query transactions (reuse logic from GET /client/:clientId)
    const startDate = period_start || new Date(Date.now() - 180 * 86400000).toISOString().substring(0, 10)
    const endDate = period_end || new Date().toISOString().substring(0, 10)

    const { clause: ordersEf, params: ordersEfParams } = entityFilter(c)
    const { results: orders } = await c.env.DB.prepare(`
      SELECT id, order_number, order_date, final_amount, billed_amount, billing_status, status, created_at
      FROM orders WHERE client_id = ?${ordersEf} AND date(created_at) >= ? AND date(created_at) <= ?
      ORDER BY created_at ASC
    `).bind(client_id, ...ordersEfParams, startDate, endDate).all<OrderRow>()

    const { clause: paymentsEf, params: paymentsEfParams } = entityFilter(c)
    const { results: payments } = await c.env.DB.prepare(`
      SELECT id, payment_date, amount, payment_method, reference_number, notes, created_at
      FROM payments WHERE client_id = ?${paymentsEf} AND date(payment_date) >= ? AND date(payment_date) <= ?
      ORDER BY payment_date ASC
    `).bind(client_id, ...paymentsEfParams, startDate, endDate).all<PaymentRow>()

    const { clause: adjEf, params: adjEfParams } = entityFilter(c)
    const { results: adjustments } = await c.env.DB.prepare(`
      SELECT id, order_id, type, amount, reason, created_at
      FROM adjustments WHERE client_id = ?${adjEf} AND date(created_at) >= ? AND date(created_at) <= ?
      ORDER BY created_at ASC
    `).bind(client_id, ...adjEfParams, startDate, endDate).all<AdjustmentRow>()

    // Combine and sort
    const transactions = [
      ...orders.map(o => ({
        type: 'order' as const,
        date: o.created_at,
        description: `주문: ${o.order_number}`,
        debit: o.billing_status === 'BILLED' ? (Number(o.billed_amount) || Number(o.final_amount) || 0) : 0,
        credit: 0,
      })),
      ...payments.map(p => ({
        type: 'payment' as const,
        date: p.payment_date,
        description: `입금: ${p.payment_method || ''}`,
        debit: 0,
        credit: Number(p.amount) || 0,
      })),
      ...adjustments.map(a => ({
        type: 'adjustment' as const,
        date: a.created_at,
        description: `감액: ${a.reason || a.type}`,
        debit: 0,
        credit: Number(a.amount) || 0,
      }))
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Running balance
    let runningBalance = 0
    const txWithBalance = transactions.map(t => {
      runningBalance += t.debit - t.credit
      return { ...t, balance: runningBalance }
    })

    const totalOrders = txWithBalance.reduce((s, t) => s + t.debit, 0)
    const totalPayments_val = txWithBalance.reduce((s, t) => s + t.credit, 0)

    // Generate portal token for link
    let portalUrl = ''
    try {
      const user = c.get('user')
      const siteUrlSetting = await c.env.DB.prepare(
        `SELECT setting_value FROM settings WHERE setting_key = 'site_base_url'`
      ).first<{ setting_value: string }>()
      const baseUrl = siteUrlSetting?.setting_value || new URL(c.req.url).origin
      const portalResult = await generatePortalToken(c.env.DB, Number(client_id), user?.id || 0, baseUrl, 7,
        { type: 'ledger', period_start: startDate, period_end: endDate })
      portalUrl = `${baseUrl}/portal/document?t=${portalResult.token}`
    } catch (e) {
      console.warn('Portal token for email failed:', e)
    }

    // Build HTML email
    const formatNum = (n: number) => n.toLocaleString('ko-KR')
    const formatDate = (d: string) => d ? d.substring(0, 10) : '-'

    const rowsHtml = txWithBalance.map(t => {
      const typeName = t.type === 'order' ? '주문' : t.type === 'payment' ? '입금' : '할인/조정'
      const typeColor = t.type === 'order' ? '#dcfce7' : t.type === 'payment' ? '#dbeafe' : '#fef9c3'
      return `<tr style="background:${typeColor}">
        <td style="padding:8px;border:1px solid #e5e7eb">${formatDate(t.date)}</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${typeName}</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${t.description}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right">${t.debit > 0 ? formatNum(t.debit) : '-'}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right">${t.credit > 0 ? formatNum(t.credit) : '-'}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;font-weight:bold;color:${t.balance > 0 ? '#dc2626' : '#16a34a'}">${formatNum(t.balance)}</td>
      </tr>`
    }).join('')

    const portalSection = portalUrl
      ? `<p style="margin-top:20px"><a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold">잔액 확인 (포털 바로가기)</a></p>`
      : ''

    const html = `
    <div style="font-family:'Pretendard',sans-serif;max-width:700px;margin:0 auto;padding:20px">
      <h2 style="color:#1f2937;border-bottom:2px solid #2563eb;padding-bottom:12px">동산기획 거래 내역 안내</h2>
      <p style="color:#4b5563">거래처: <strong>${client.client_name}</strong></p>
      <p style="color:#4b5563">기간: ${startDate} ~ ${endDate}</p>

      <div style="display:flex;gap:16px;margin:16px 0;flex-wrap:wrap">
        <div style="background:#eff6ff;padding:12px 16px;border-radius:8px;flex:1;min-width:120px">
          <div style="font-size:12px;color:#6b7280">총 매출</div>
          <div style="font-size:18px;font-weight:bold;color:#1f2937">${formatNum(totalOrders)}원</div>
        </div>
        <div style="background:#f0fdf4;padding:12px 16px;border-radius:8px;flex:1;min-width:120px">
          <div style="font-size:12px;color:#6b7280">총 입금</div>
          <div style="font-size:18px;font-weight:bold;color:#1f2937">${formatNum(totalPayments_val)}원</div>
        </div>
        <div style="background:#fef2f2;padding:12px 16px;border-radius:8px;flex:1;min-width:120px">
          <div style="font-size:12px;color:#6b7280">현재 잔액</div>
          <div style="font-size:18px;font-weight:bold;color:#dc2626">${formatNum(runningBalance)}원</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">일자</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">구분</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">내용</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:right">차변(주문)</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:right">대변(입금)</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:right">잔액</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      ${portalSection}

      <p style="margin-top:24px;font-size:12px;color:#9ca3af">본 메일은 동산기획 ERP에서 자동 발송되었습니다. 문의: 042-523-1982</p>
    </div>`

    const user = c.get('user')
    const result = await sendEmail(c.env, c.env.DB, {
      to: to_email,
      subject: `[동산기획] ${client.client_name} 거래 내역 안내 (${startDate} ~ ${endDate})`,
      html: html
    }, {
      template: 'ledger_summary',
      relatedType: 'ledger',
      relatedId: Number(client_id),
      sentBy: user?.id || 0
    })

    if (result.success) {
      await logActivity({
        db: c.env.DB, userId: user?.id, userName: user?.username,
        action: 'LEDGER_EMAIL_SENT', entityType: 'CLIENT', entityId: Number(client_id),
        entityLabel: client.client_name,
        details: JSON.stringify({ to_email, period_start: startDate, period_end: endDate })
      })
      return c.json({ success: true, data: { email_id: result.id } })
    } else {
      return c.json({ success: false, error: result.error || '이메일 발송 실패' }, 500)
    }
  } catch (error) {
    console.error('Ledger send-email error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default arDunningRouter
