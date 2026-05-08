// {RESOURCE_KR} 관리 라우트
//
// 치환 필요:
//   {RESOURCE}          예: employee
//   {RESOURCE_PLURAL}   예: employees
//   {RESOURCE_KR}       예: 직원
//   {TABLE_NAME}        예: employees
//
// 등록 (src/index.tsx):
//   import {RESOURCE}Router from './routes/{RESOURCE}'
//   app.route('/api/{RESOURCE_PLURAL}', {RESOURCE}Router)

import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const {RESOURCE}Router = new Hono<HonoEnv>()
{RESOURCE}Router.use('/*', authMiddleware)

// ============================================================================
// 목록 조회
// GET /api/{RESOURCE_PLURAL}?limit=50&offset=0&q=검색어
// ============================================================================
{RESOURCE}Router.get('/', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 500)
    const offset = parseInt(c.req.query('offset') || '0')
    const q = (c.req.query('q') || '').trim()

    const clauses: string[] = []
    const params: any[] = []
    if (q) {
      clauses.push('(t.name LIKE ? OR t.code LIKE ?)')
      params.push(`%${q}%`, `%${q}%`)
    }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''

    // 총 개수
    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM {TABLE_NAME} t ${where}`
    ).bind(...params).first<{ total: number }>()

    // 페이지 데이터 (모든 컬럼은 alias 명시 필수 — ambiguous 방지)
    const { results } = await c.env.DB.prepare(
      `SELECT t.*
       FROM {TABLE_NAME} t
       ${where}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all()

    return c.json({
      success: true,
      data: results,
      pagination: { total: countRow?.total || 0, limit, offset },
    })
  } catch (error: any) {
    console.error('{RESOURCE} list error:', error)
    return c.json(
      { success: false, error: '{RESOURCE_KR} 목록 조회 실패', detail: String(error?.message || error) },
      500
    )
  }
})

// ============================================================================
// 단건 조회
// GET /api/{RESOURCE_PLURAL}/:id
// ============================================================================
{RESOURCE}Router.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (!Number.isFinite(id)) {
      return c.json({ success: false, error: '잘못된 ID' }, 400)
    }

    const row = await c.env.DB.prepare(
      `SELECT t.* FROM {TABLE_NAME} t WHERE t.id = ?`
    ).bind(id).first()

    if (!row) {
      return c.json({ success: false, error: '{RESOURCE_KR}를 찾을 수 없습니다' }, 404)
    }

    return c.json({ success: true, data: row })
  } catch (error: any) {
    console.error('{RESOURCE} get error:', error)
    return c.json(
      { success: false, error: '{RESOURCE_KR} 조회 실패', detail: String(error?.message || error) },
      500
    )
  }
})

// ============================================================================
// 생성
// POST /api/{RESOURCE_PLURAL}
// ============================================================================
{RESOURCE}Router.post('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json()
    const user = c.get('user') as any

    // 필수 필드 검증
    if (!body.name) {
      return c.json({ success: false, error: '이름은 필수입니다' }, 400)
    }

    const result = await c.env.DB.prepare(
      `INSERT INTO {TABLE_NAME} (name, created_by, created_at, updated_at)
       VALUES (?, ?, datetime('now'), datetime('now'))`
    ).bind(body.name, user?.id || null).run()

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id },
      message: '{RESOURCE_KR}가 생성되었습니다',
    })
  } catch (error: any) {
    console.error('{RESOURCE} create error:', error)
    return c.json(
      { success: false, error: '{RESOURCE_KR} 생성 실패', detail: String(error?.message || error) },
      500
    )
  }
})

// ============================================================================
// 수정
// PUT /api/{RESOURCE_PLURAL}/:id
// ============================================================================
{RESOURCE}Router.put('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const body = await c.req.json()
    const user = c.get('user') as any

    // 존재 확인
    const existing = await c.env.DB.prepare(
      `SELECT id FROM {TABLE_NAME} WHERE id = ?`
    ).bind(id).first()
    if (!existing) {
      return c.json({ success: false, error: '{RESOURCE_KR}를 찾을 수 없습니다' }, 404)
    }

    await c.env.DB.prepare(
      `UPDATE {TABLE_NAME}
       SET name = ?, updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).bind(body.name, user?.id || null, id).run()

    return c.json({ success: true, message: '{RESOURCE_KR}가 수정되었습니다' })
  } catch (error: any) {
    console.error('{RESOURCE} update error:', error)
    return c.json(
      { success: false, error: '{RESOURCE_KR} 수정 실패', detail: String(error?.message || error) },
      500
    )
  }
})

// ============================================================================
// 삭제 (ADMIN only)
// DELETE /api/{RESOURCE_PLURAL}/:id
// ============================================================================
{RESOURCE}Router.delete('/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))

    const existing = await c.env.DB.prepare(
      `SELECT id FROM {TABLE_NAME} WHERE id = ?`
    ).bind(id).first()
    if (!existing) {
      return c.json({ success: false, error: '{RESOURCE_KR}를 찾을 수 없습니다' }, 404)
    }

    await c.env.DB.prepare(`DELETE FROM {TABLE_NAME} WHERE id = ?`).bind(id).run()

    return c.json({ success: true, message: '{RESOURCE_KR}가 삭제되었습니다' })
  } catch (error: any) {
    console.error('{RESOURCE} delete error:', error)
    return c.json(
      { success: false, error: '{RESOURCE_KR} 삭제 실패', detail: String(error?.message || error) },
      500
    )
  }
})

export default {RESOURCE}Router
