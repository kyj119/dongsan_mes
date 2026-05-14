import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const finishingRouter = new Hono<HonoEnv>()
finishingRouter.use('/*', authMiddleware)

// GET /methods
finishingRouter.get('/methods', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM finishing_methods WHERE is_active = 1 ORDER BY sort_order ASC'
    ).all()
    return c.json({ success: true, data: results })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /methods
finishingRouter.post('/methods', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const { name, margin_cm, description } = await c.req.json()
  if (!name) return c.json({ success: false, error: '이름 필수' }, 400)
  try {
    const r = await c.env.DB.prepare(
      'INSERT INTO finishing_methods (name, margin_cm, description, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM finishing_methods))'
    ).bind(name, margin_cm || 0, description || null).run()
    return c.json({ success: true, data: { id: r.meta.last_row_id } })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ success: false, error: '이미 존재' }, 409)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// PUT /methods/:id
finishingRouter.put('/methods/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const { name, margin_cm, description } = await c.req.json()
    const sets: string[] = [], params: any[] = []
    if (name !== undefined) { sets.push('name = ?'); params.push(name) }
    if (margin_cm !== undefined) { sets.push('margin_cm = ?'); params.push(margin_cm) }
    if (description !== undefined) { sets.push('description = ?'); params.push(description) }
    if (!sets.length) return c.json({ success: false, error: '변경 없음' }, 400)
    params.push(parseInt(id))
    await c.env.DB.prepare(`UPDATE finishing_methods SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()
    return c.json({ success: true })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// DELETE /methods/:id
finishingRouter.delete('/methods/:id', requireRole('ADMIN'), async (c) => {
  try {
    await c.env.DB.prepare('UPDATE finishing_methods SET is_active = 0 WHERE id = ?').bind(parseInt(c.req.param('id'))).run()
    return c.json({ success: true })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// GET /presets
finishingRouter.get('/presets', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM finishing_presets WHERE is_active = 1 ORDER BY sort_order ASC'
    ).all()
    return c.json({ success: true, data: results })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /presets
finishingRouter.post('/presets', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { name, config } = await c.req.json()
    if (!name || !config) return c.json({ success: false, error: '이름과 설정 필수' }, 400)
    const configStr = typeof config === 'string' ? config : JSON.stringify(config)
    const r = await c.env.DB.prepare(
      'INSERT INTO finishing_presets (name, config, sort_order) VALUES (?, ?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM finishing_presets))'
    ).bind(name, configStr).run()
    return c.json({ success: true, data: { id: r.meta.last_row_id } })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// PUT /presets/:id
finishingRouter.put('/presets/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const { name, config } = await c.req.json()
    const sets: string[] = [], params: any[] = []
    if (name !== undefined) { sets.push('name = ?'); params.push(name) }
    if (config !== undefined) { sets.push('config = ?'); params.push(typeof config === 'string' ? config : JSON.stringify(config)) }
    if (!sets.length) return c.json({ success: false, error: '변경 없음' }, 400)
    params.push(parseInt(id))
    await c.env.DB.prepare(`UPDATE finishing_presets SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()
    return c.json({ success: true })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// DELETE /presets/:id
finishingRouter.delete('/presets/:id', requireRole('ADMIN'), async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM finishing_presets WHERE id = ?').bind(parseInt(c.req.param('id'))).run()
    return c.json({ success: true })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

export default finishingRouter
