import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const messageTemplatesRouter = new Hono<HonoEnv>()
messageTemplatesRouter.use('*', authMiddleware)
messageTemplatesRouter.use('*', requireRole('ADMIN', 'MANAGER'))

// GET / — 템플릿 목록 (channel 필터)
messageTemplatesRouter.get('/', async (c) => {
  try {
    const db = c.env.DB
    const channel = c.req.query('channel')

    let query = 'SELECT * FROM message_templates'
    const bindings: any[] = []

    if (channel) {
      query += ' WHERE channel = ?'
      bindings.push(channel)
    }
    query += ' ORDER BY created_at DESC'

    const { results } = await db.prepare(query).bind(...bindings).all() as any
    return c.json({ success: true, data: results || [] })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST / — 템플릿 생성
messageTemplatesRouter.post('/', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any
    const userId = c.get('user').id

    const { channel, name, subject, content } = body
    if (!channel || !name || !content) {
      return c.json({ success: false, error: '채널, 이름, 내용은 필수입니다.' }, 400)
    }
    if (!['sms', 'email', 'fax'].includes(channel)) {
      return c.json({ success: false, error: '유효하지 않은 채널입니다.' }, 400)
    }

    const result = await db.prepare(
      'INSERT INTO message_templates (channel, name, subject, content, created_by) VALUES (?, ?, ?, ?, ?)'
    ).bind(channel, name, subject || null, content, userId).run() as any

    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// PATCH /:id — 템플릿 수정
messageTemplatesRouter.patch('/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = parseInt(c.req.param('id'), 10)
    const body = await c.req.json() as any

    const existing = await db.prepare('SELECT id FROM message_templates WHERE id = ?').bind(id).first()
    if (!existing) {
      return c.json({ success: false, error: '템플릿을 찾을 수 없습니다.' }, 404)
    }

    const sets: string[] = []
    const bindings: any[] = []

    if (body.name !== undefined) { sets.push('name = ?'); bindings.push(body.name) }
    if (body.subject !== undefined) { sets.push('subject = ?'); bindings.push(body.subject) }
    if (body.content !== undefined) { sets.push('content = ?'); bindings.push(body.content) }
    sets.push("updated_at = datetime('now')")

    if (sets.length === 1) {
      return c.json({ success: false, error: '수정할 항목이 없습니다.' }, 400)
    }

    bindings.push(id)
    await db.prepare(`UPDATE message_templates SET ${sets.join(', ')} WHERE id = ?`).bind(...bindings).run()
    return c.json({ success: true })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// DELETE /:id — 템플릿 삭제
messageTemplatesRouter.delete('/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = parseInt(c.req.param('id'), 10)

    const existing = await db.prepare('SELECT id FROM message_templates WHERE id = ?').bind(id).first()
    if (!existing) {
      return c.json({ success: false, error: '템플릿을 찾을 수 없습니다.' }, 404)
    }

    await db.prepare('DELETE FROM message_templates WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

export default messageTemplatesRouter
