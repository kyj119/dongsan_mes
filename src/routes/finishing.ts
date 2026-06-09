import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const finishingRouter = new Hono<HonoEnv>()
finishingRouter.use('/*', authMiddleware)

// 멀티테넌시 (감사 2026-06-09): finishing_methods·finishing_presets는 entity_id 없음 = 전사 공용.
// 후가공 방법/프리셋 정의는 마스터·카탈로그 데이터로, BOM·품목·단가와 동일하게 법인 공유 정책.
// → entityFilter 미적용이 의도된 설계. (법인별 후가공 단가가 필요해지면 별도 entity 스코프 검토)

// GET /methods?group=output|transfer (optional filter)
finishingRouter.get('/methods', async (c) => {
  try {
    const group = c.req.query('group')
    let query = 'SELECT id, name, margin_cm, description, sort_order, method_group FROM finishing_methods WHERE is_active = 1'
    const params: string[] = []
    if (group) {
      query += ' AND method_group = ?'
      params.push(group)
    }
    query += ' ORDER BY sort_order ASC'
    const { results } = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, data: results })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /methods
finishingRouter.post('/methods', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { name, margin_cm, description, method_group } = await c.req.json()
    if (!name) return c.json({ success: false, error: '이름 필수' }, 400)
    const r = await c.env.DB.prepare(
      'INSERT INTO finishing_methods (name, margin_cm, description, method_group, sort_order) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM finishing_methods))'
    ).bind(name, margin_cm || 0, description || null, method_group || 'output').run()
    return c.json({ success: true, data: { id: r.meta.last_row_id } })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ success: false, error: '이미 존재' }, 409)
    console.error('finishing POST /methods error:', e)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// PUT /methods/:id
finishingRouter.put('/methods/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const { name, margin_cm, description, method_group } = await c.req.json()
    const sets: string[] = [], params: any[] = []
    if (name !== undefined) { sets.push('name = ?'); params.push(name) }
    if (margin_cm !== undefined) { sets.push('margin_cm = ?'); params.push(margin_cm) }
    if (description !== undefined) { sets.push('description = ?'); params.push(description) }
    if (method_group !== undefined) { sets.push('method_group = ?'); params.push(method_group) }
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

// GET /presets?group=output|transfer (optional filter)
finishingRouter.get('/presets', async (c) => {
  try {
    const group = c.req.query('group')
    let query = 'SELECT id, name, config, sort_order, method_group FROM finishing_presets WHERE is_active = 1'
    const params: string[] = []
    if (group) {
      query += ' AND method_group = ?'
      params.push(group)
    }
    query += ' ORDER BY sort_order ASC'
    const { results } = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, data: results })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /presets
finishingRouter.post('/presets', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { name, config, method_group } = await c.req.json()
    if (!name || !config) return c.json({ success: false, error: '이름과 설정 필수' }, 400)
    const configStr = typeof config === 'string' ? config : JSON.stringify(config)
    const r = await c.env.DB.prepare(
      'INSERT INTO finishing_presets (name, config, method_group, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM finishing_presets))'
    ).bind(name, configStr, method_group || 'output').run()
    return c.json({ success: true, data: { id: r.meta.last_row_id } })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// PUT /presets/:id
finishingRouter.put('/presets/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const { name, config, method_group } = await c.req.json()
    const sets: string[] = [], params: any[] = []
    if (name !== undefined) { sets.push('name = ?'); params.push(name) }
    if (config !== undefined) { sets.push('config = ?'); params.push(typeof config === 'string' ? config : JSON.stringify(config)) }
    if (method_group !== undefined) { sets.push('method_group = ?'); params.push(method_group) }
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
