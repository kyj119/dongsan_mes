import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId } from '../utils/entityFilter'

const activityLogsRouter = new Hono<HonoEnv>()
activityLogsRouter.use('/*', authMiddleware)

// Get activity logs (ADMIN/MANAGER only)
activityLogsRouter.get('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { page = '1', limit = '50', entity_type = '', user_id = '', search = '', date_from = '', date_to = '' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 50, 100)
    const offset = (parseInt(page) - 1) * safeLimit

    let query = 'SELECT id, user_id, user_name, action, entity_type, entity_id, entity_label, details, ip_address, created_at FROM activity_logs'
    const params: any[] = []
    const where: string[] = []

    // #515: 법인 격리 — ADMIN 전체모드(entityId=0)만 전 법인 열람. 그 외(MANAGER/법인선택 ADMIN)는
    //       자기 법인 로그로 한정. actor_entity_id NULL(도출불가 시스템 기록)은 전체모드에서만 노출.
    const actingEntity = getEntityId(c)
    if (actingEntity !== 0) { where.push('actor_entity_id = ?'); params.push(actingEntity) }

    if (entity_type) { where.push('entity_type = ?'); params.push(entity_type) }
    if (user_id) { where.push('user_id = ?'); params.push(parseInt(user_id)) }
    if (search) { where.push('(entity_label LIKE ? OR details LIKE ? OR user_name LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`) }
    if (date_from) { where.push('date(created_at) >= ?'); params.push(date_from) }
    if (date_to) { where.push('date(created_at) <= ?'); params.push(date_to) }

    if (where.length > 0) query += ' WHERE ' + where.join(' AND ')

    // Count
    const countQuery = `SELECT COUNT(*) as count FROM (${query})`
    const total = await c.env.DB.prepare(countQuery).bind(...params).first() as any

    query += ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?'  // 정렬 규약: 고유키 tie-break
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    return c.json({
      success: true,
      data: results,
      pagination: {
        page: parseInt(page),
        limit: safeLimit,
        total: total?.count || 0,
        total_pages: Math.ceil((total?.count || 0) / safeLimit)
      }
    })
  } catch (error) {
    console.error('ActivityLogs error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default activityLogsRouter
