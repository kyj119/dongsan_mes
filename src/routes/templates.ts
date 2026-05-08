import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware } from '../middleware/auth'

const templatesRouter = new Hono<HonoEnv>()

// All template operations require login. Any authenticated user may CRUD
// templates (see migration 0015 for the RBAC rationale).
templatesRouter.use('/*', authMiddleware)

// List active templates
templatesRouter.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT t.id, t.name, t.description, t.items_json,
             t.created_by, u.name AS created_by_name,
             t.created_at, t.updated_at
      FROM order_templates t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.is_active = 1
      ORDER BY t.updated_at DESC, t.name ASC
    `).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get single template
templatesRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const row = await c.env.DB.prepare(`
      SELECT id, name, description, items_json, created_by, created_at, updated_at
      FROM order_templates WHERE id = ? AND is_active = 1
    `).bind(id).first()

    if (!row) {
      return c.json({ success: false, error: 'Template not found' }, 404)
    }
    return c.json({ success: true, data: row })
  } catch (error) {
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Create template
templatesRouter.post('/', async (c) => {
  try {
    const user = c.get('user')
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401)
    }
    const body = await c.req.json<{
      name?: string
      description?: string
      items?: any[]
    }>()

    const name = (body.name || '').trim()
    if (!name) {
      return c.json({ success: false, error: 'name is required' }, 400)
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return c.json({ success: false, error: 'items must be a non-empty array' }, 400)
    }

    const itemsJson = JSON.stringify(body.items)
    const result = await c.env.DB.prepare(`
      INSERT INTO order_templates (name, description, items_json, created_by)
      VALUES (?, ?, ?, ?)
    `).bind(name, body.description || null, itemsJson, user.id).run()

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id, name },
      message: 'Template created'
    })
  } catch (error) {
    console.error('Template create error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Update template
templatesRouter.put('/:id', async (c) => {
  try {
    const user = c.get('user')
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401)
    }
    const id = c.req.param('id')
    const body = await c.req.json<{
      name?: string
      description?: string
      items?: any[]
    }>()

    const existing = await c.env.DB.prepare(
      `SELECT id FROM order_templates WHERE id = ? AND is_active = 1`
    ).bind(id).first()
    if (!existing) {
      return c.json({ success: false, error: 'Template not found' }, 404)
    }

    const name = body.name !== undefined ? (body.name || '').trim() : null
    if (body.name !== undefined && !name) {
      return c.json({ success: false, error: 'name cannot be empty' }, 400)
    }
    if (body.items !== undefined && (!Array.isArray(body.items) || body.items.length === 0)) {
      return c.json({ success: false, error: 'items must be a non-empty array' }, 400)
    }

    // COALESCE-based partial update: pass null to leave a column unchanged.
    // Intentional limitation: description cannot be cleared back to NULL once
    // set — callers should pass a space or empty-like marker if they need that.
    await c.env.DB.prepare(`
      UPDATE order_templates
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          items_json = COALESCE(?, items_json),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      name,
      body.description === undefined ? null : (body.description || null),
      body.items !== undefined ? JSON.stringify(body.items) : null,
      id
    ).run()

    return c.json({ success: true, message: 'Template updated' })
  } catch (error) {
    console.error('Template update error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Soft delete (is_active = 0) so any future references stay resolvable
templatesRouter.delete('/:id', async (c) => {
  try {
    const user = c.get('user')
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401)
    }
    const id = c.req.param('id')

    const existing = await c.env.DB.prepare(
      `SELECT id FROM order_templates WHERE id = ? AND is_active = 1`
    ).bind(id).first()
    if (!existing) {
      return c.json({ success: false, error: 'Template not found' }, 404)
    }

    await c.env.DB.prepare(
      `UPDATE order_templates SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(id).run()

    return c.json({ success: true, message: 'Template deleted' })
  } catch (error) {
    console.error('Template delete error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

export default templatesRouter
