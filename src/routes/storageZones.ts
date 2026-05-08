import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const storageZonesRouter = new Hono<HonoEnv>()
storageZonesRouter.use('/*', authMiddleware)

// GET /api/storage-zones - 전체 창고 구역 조회 (로그인 사용자)
storageZonesRouter.get('/', async (c) => {
  try {
    const includeInactive = c.req.query('include_inactive') === '1'
    const sql = `
      SELECT sz.*, u.name as manager_name,
        (SELECT COUNT(*) FROM items WHERE storage_zone_id = sz.id AND is_active = 1) as item_count
      FROM storage_zones sz
      LEFT JOIN users u ON sz.manager_id = u.id
      ${includeInactive ? '' : 'WHERE sz.is_active = 1'}
      ORDER BY sz.sort_order, sz.zone_name
    `
    const { results } = await c.env.DB.prepare(sql).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('storageZones GET error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/storage-zones/my - 내 담당 구역 조회
storageZonesRouter.get('/my', async (c) => {
  try {
    const user = c.get('user') as any
    const { results } = await c.env.DB.prepare(`
      SELECT sz.*,
        (SELECT COUNT(*) FROM items WHERE storage_zone_id = sz.id AND is_active = 1) as item_count
      FROM storage_zones sz
      WHERE sz.manager_id = ? AND sz.is_active = 1
      ORDER BY sz.sort_order, sz.zone_name
    `).bind(user.id).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('storageZones /my error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/storage-zones/:id - 구역 상세 (배정된 품목 포함)
storageZonesRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const zone = await c.env.DB.prepare(`
      SELECT sz.*, u.name as manager_name
      FROM storage_zones sz
      LEFT JOIN users u ON sz.manager_id = u.id
      WHERE sz.id = ?
    `).bind(id).first()

    if (!zone) return c.json({ success: false, error: '구역을 찾을 수 없습니다.' }, 404)

    const { results: items } = await c.env.DB.prepare(`
      SELECT i.id, i.item_code, i.item_name, i.category, i.sub_category, i.unit, i.item_type,
        inv.quantity as current_stock, inv.safe_stock, inv.reorder_point, inv.auto_pr_enabled
      FROM items i
      LEFT JOIN inventory inv ON inv.item_id = i.id
      WHERE i.storage_zone_id = ? AND i.is_active = 1
      ORDER BY i.item_name
    `).bind(id).all()

    return c.json({ success: true, data: { ...zone, items } })
  } catch (error) {
    console.error('storageZones GET :id error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/storage-zones - 구역 생성 (ADMIN)
storageZonesRouter.post('/', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json<{
      zone_name: string
      zone_code?: string
      description?: string
      manager_id?: number
      sort_order?: number
    }>()

    if (!body.zone_name?.trim()) {
      return c.json({ success: false, error: '구역명을 입력해주세요.' }, 400)
    }

    // 중복 체크
    const exists = await c.env.DB.prepare(
      'SELECT id FROM storage_zones WHERE zone_name = ?'
    ).bind(body.zone_name.trim()).first()
    if (exists) {
      return c.json({ success: false, error: '이미 존재하는 구역명입니다.' }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO storage_zones (zone_name, zone_code, description, manager_id, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      body.zone_name.trim(),
      body.zone_code?.trim() || null,
      body.description?.trim() || null,
      body.manager_id || null,
      body.sort_order ?? 0
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id }, message: '구역이 생성되었습니다.' })
  } catch (error) {
    console.error('storageZones POST error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PUT /api/storage-zones/:id - 구역 수정 (ADMIN)
storageZonesRouter.put('/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<{
      zone_name?: string
      zone_code?: string
      description?: string
      manager_id?: number | null
      sort_order?: number
      is_active?: number
    }>()

    const zone = await c.env.DB.prepare('SELECT id FROM storage_zones WHERE id = ?').bind(id).first()
    if (!zone) return c.json({ success: false, error: '구역을 찾을 수 없습니다.' }, 404)

    // 이름 중복 체크 (자기 자신 제외)
    if (body.zone_name) {
      const dup = await c.env.DB.prepare(
        'SELECT id FROM storage_zones WHERE zone_name = ? AND id != ?'
      ).bind(body.zone_name.trim(), id).first()
      if (dup) return c.json({ success: false, error: '이미 존재하는 구역명입니다.' }, 400)
    }

    await c.env.DB.prepare(`
      UPDATE storage_zones SET
        zone_name = COALESCE(?, zone_name),
        zone_code = ?,
        description = ?,
        manager_id = ?,
        sort_order = COALESCE(?, sort_order),
        is_active = COALESCE(?, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      body.zone_name?.trim() || null,
      body.zone_code?.trim() ?? null,
      body.description?.trim() ?? null,
      body.manager_id ?? null,
      body.sort_order ?? null,
      body.is_active ?? null,
      id
    ).run()

    return c.json({ success: true, message: '구역이 수정되었습니다.' })
  } catch (error) {
    console.error('storageZones PUT error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /api/storage-zones/:id - 구역 삭제 (ADMIN, 품목 없을 때만)
storageZonesRouter.delete('/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')

    const zone = await c.env.DB.prepare('SELECT id, zone_name FROM storage_zones WHERE id = ?').bind(id).first() as any
    if (!zone) return c.json({ success: false, error: '구역을 찾을 수 없습니다.' }, 404)

    // 배정된 품목 확인
    const itemCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM items WHERE storage_zone_id = ? AND is_active = 1'
    ).bind(id).first() as any

    if (itemCount?.cnt > 0) {
      return c.json({
        success: false,
        error: `${zone.zone_name} 구역에 ${itemCount.cnt}개 품목이 배정되어 있습니다. 품목을 다른 구역으로 이동한 후 삭제해주세요.`
      }, 400)
    }

    await c.env.DB.prepare('DELETE FROM storage_zones WHERE id = ?').bind(id).run()
    return c.json({ success: true, message: '구역이 삭제되었습니다.' })
  } catch (error) {
    console.error('storageZones DELETE error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /api/storage-zones/assign-items - 품목 일괄 구역 배정 (ADMIN)
storageZonesRouter.patch('/assign-items', requireRole('ADMIN'), async (c) => {
  try {
    const { item_ids, zone_id } = await c.req.json<{ item_ids: number[], zone_id: number | null }>()

    if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
      return c.json({ success: false, error: '품목을 선택해주세요.' }, 400)
    }

    // zone_id가 있으면 존재 확인
    if (zone_id !== null) {
      const zone = await c.env.DB.prepare('SELECT id FROM storage_zones WHERE id = ? AND is_active = 1').bind(zone_id).first()
      if (!zone) return c.json({ success: false, error: '구역을 찾을 수 없습니다.' }, 404)
    }

    const placeholders = item_ids.map(() => '?').join(',')
    await c.env.DB.prepare(
      `UPDATE items SET storage_zone_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`
    ).bind(zone_id, ...item_ids).run()

    return c.json({ success: true, message: `${item_ids.length}개 품목의 구역이 변경되었습니다.` })
  } catch (error) {
    console.error('storageZones assign-items error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default storageZonesRouter
