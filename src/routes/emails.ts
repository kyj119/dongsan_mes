import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { sendEmail } from '../services/emailProvider'
import { renderTemplate, type TemplateName } from '../services/emailTemplates'

const emailsRouter = new Hono<HonoEnv>()
emailsRouter.use('/*', authMiddleware)

// ============================================================================
// GET /logs - 발송 이력 목록
// ============================================================================
emailsRouter.get('/logs', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { page = '1', limit = '30', template = '', status = '', date_from = '', date_to = '', search = '' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 30, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    const whereClauses: string[] = []
    const params: any[] = []

    if (template) {
      whereClauses.push('el.template = ?')
      params.push(template)
    }
    if (status) {
      whereClauses.push('el.status = ?')
      params.push(status)
    }
    if (search) {
      whereClauses.push('(el.recipient_email LIKE ? OR el.subject LIKE ? OR el.recipient_name LIKE ?)')
      const p = `%${search}%`
      params.push(p, p, p)
    }
    if (date_from) {
      whereClauses.push('DATE(el.created_at) >= ?')
      params.push(date_from)
    }
    if (date_to) {
      whereClauses.push('DATE(el.created_at) <= ?')
      params.push(date_to)
    }

    const where = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''

    const { results } = await c.env.DB.prepare(`
      SELECT el.*, u.name as sent_by_name
      FROM email_logs el
      LEFT JOIN users u ON el.sent_by = u.id
      ${where}
      ORDER BY el.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, safeLimit, offset).all()

    const { count } = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM email_logs el ${where}
    `).bind(...params).first() as any

    return c.json({
      success: true,
      data: results,
      pagination: { page: parseInt(page), limit: safeLimit, total: count, total_pages: Math.ceil(count / safeLimit) }
    })
  } catch (error) {
    console.error('src/routes/emails.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /logs/:id - 발송 상세
// ============================================================================
emailsRouter.get('/logs/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const log = await c.env.DB.prepare(`
      SELECT el.*, u.name as sent_by_name
      FROM email_logs el
      LEFT JOIN users u ON el.sent_by = u.id
      WHERE el.id = ?
    `).bind(id).first()

    if (!log) return c.json({ success: false, error: '이메일 로그를 찾을 수 없습니다.' }, 404)
    return c.json({ success: true, data: log })
  } catch (error) {
    console.error('src/routes/emails.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST /send - 수동 이메일 발송 (템플릿 기반)
// ============================================================================
emailsRouter.post('/send', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json() as {
      template: TemplateName
      to: string
      data: Record<string, any>
      recipientName?: string
      relatedType?: string
      relatedId?: number
    }

    if (!body.template || !body.to || !body.data) {
      return c.json({ success: false, error: 'template, to, data 필드가 필요합니다.' }, 400)
    }

    const { subject, html } = renderTemplate(body.template, body.data)

    const result = await sendEmail(c.env, c.env.DB, { to: body.to, subject, html }, {
      template: body.template,
      relatedType: body.relatedType,
      relatedId: body.relatedId,
      sentBy: user?.id,
    })

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 500)
    }

    return c.json({ success: true, data: { emailId: result.id }, message: '이메일 발송 완료' })
  } catch (error) {
    console.error('src/routes/emails.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST /test - 테스트 이메일 발송 (ADMIN 전용)
// ============================================================================
emailsRouter.post('/test', requireRole('ADMIN'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json() as { to: string }

    if (!body.to) return c.json({ success: false, error: '수신 이메일 주소가 필요합니다.' }, 400)

    const result = await sendEmail(c.env, c.env.DB, {
      to: body.to,
      subject: '[동산기획] 이메일 테스트',
      html: `<div style="font-family:sans-serif;padding:20px;">
        <h2>이메일 발송 테스트</h2>
        <p>이 메일은 동산기획 ERP 시스템에서 발송된 테스트 메일입니다.</p>
        <p>발송 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
      </div>`,
    }, {
      template: 'TEST',
      sentBy: user?.id,
    })

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 500)
    }

    return c.json({ success: true, message: '테스트 이메일 발송 완료' })
  } catch (error) {
    console.error('src/routes/emails.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default emailsRouter
