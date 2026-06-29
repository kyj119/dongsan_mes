import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter } from '../utils/entityFilter'

const storageZonesRouter = new Hono<HonoEnv>()
storageZonesRouter.use('/*', authMiddleware)

// GET /api/storage-zones - 창고 구역 조회 (entity_id 필터)
storageZonesRouter.get('/', async (c) => {
  try {
    const includeInactive = c.req.query('include_inactive') === '1'
    // #368: all_entities(전 법인 열람)는 ADMIN/MANAGER만 신뢰 — 일반 사용자가 파라미터로 격리 우회 차단
    const user = c.get('user')
    const allEntities = c.req.query('all_entities') === '1' && (user?.role === 'ADMIN' || user?.role === 'MANAGER')
    const entityId = getEntityId(c)
    const params: any[] = []
    let where = ''

    if (!includeInactive) {
      where = 'WHERE sz.is_active = 1'
    }
    // all_entities=1 (관리 페이지) 또는 entity_id=0 (전체 모드)이면 entity 필터 생략
    if (!allEntities && entityId > 0) {
      where += (where ? ' AND' : 'WHERE') + ' sz.entity_id = ?'
      params.push(entityId)
    }

    const sql = `
      SELECT sz.*, u.name as manager_name, e.short_name as entity_name,
        fz.name as facility_zone_name,
        (SELECT COUNT(*) FROM items WHERE storage_zone_id = sz.id AND is_active = 1) as item_count
      FROM storage_zones sz
      LEFT JOIN users u ON sz.manager_id = u.id
      LEFT JOIN entities e ON sz.entity_id = e.id
      LEFT JOIN facility_zones fz ON sz.facility_zone_id = fz.id
      ${where}
      ORDER BY sz.entity_id, sz.sort_order, sz.zone_name
    `
    const { results } = await c.env.DB.prepare(sql).bind(...params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('storageZones GET error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/storage-zones/my - 내 담당 구역 조회
storageZonesRouter.get('/my', async (c) => {
  try {
    const user = c.get('user')
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
    const ef = entityFilter(c, 'sz')  // #368: 단건 조회 법인 격리 (list로 id 수집 후 직접 호출 차단)
    const zone = await c.env.DB.prepare(`
      SELECT sz.*, u.name as manager_name
      FROM storage_zones sz
      LEFT JOIN users u ON sz.manager_id = u.id
      WHERE sz.id = ?${ef.clause}
    `).bind(id, ...ef.params).first()

    if (!zone) return c.json({ success: false, error: '구역을 찾을 수 없습니다.' }, 404)

    const zoneEntityId = (zone as any).entity_id || 1
    // UP4 백로그: 창고별 다중행 → 품목당 SUM/MAX 집계(행 중복 제거).
    const { results: items } = await c.env.DB.prepare(`
      SELECT i.id, i.item_code, i.item_name, i.category, i.sub_category, i.unit, i.item_type,
        COALESCE(SUM(inv.quantity), 0) as current_stock, MAX(inv.safe_stock) as safe_stock,
        MAX(inv.reorder_point) as reorder_point, MAX(inv.auto_pr_enabled) as auto_pr_enabled
      FROM items i
      LEFT JOIN inventory inv ON inv.item_id = i.id AND inv.entity_id = ?
      WHERE i.storage_zone_id = ? AND i.is_active = 1
      GROUP BY i.id
      ORDER BY i.item_name
    `).bind(zoneEntityId, id).all()

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
      entity_id?: number
      is_default?: number
      facility_zone_id?: number | null
    }>()

    if (!body.zone_name?.trim()) {
      return c.json({ success: false, error: '구역명을 입력해주세요.' }, 400)
    }

    // #417: body.entity_id 무가드 신뢰 차단 — 같은 파일 PUT(#368)과 대칭. entity_id 지정은 전체모드(0)에서만 허용.
    // 비전체모드 ADMIN은 자기 법인에만 생성(create로 #368 이관차단 우회 방지).
    const entityId = (getEntityId(c) === 0 && body.entity_id != null) ? body.entity_id : (getEntityId(c) || 1)

    // 중복 체크 (같은 법인 내)
    const exists = await c.env.DB.prepare(
      'SELECT id FROM storage_zones WHERE zone_name = ? AND entity_id = ?'
    ).bind(body.zone_name.trim(), entityId).first()
    if (exists) {
      return c.json({ success: false, error: '이미 존재하는 구역명입니다.' }, 400)
    }

    // is_default=1 설정 시 같은 법인의 다른 기본 창고 해제
    if (body.is_default) {
      await c.env.DB.prepare(
        'UPDATE storage_zones SET is_default = 0 WHERE entity_id = ? AND is_default = 1'
      ).bind(entityId).run()
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO storage_zones (zone_name, zone_code, description, manager_id, sort_order, entity_id, is_default, facility_zone_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.zone_name.trim(),
      body.zone_code?.trim() || null,
      body.description?.trim() || null,
      body.manager_id || null,
      body.sort_order ?? 0,
      entityId,
      body.is_default ?? 0,
      body.facility_zone_id || null
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
      entity_id?: number
      is_default?: number
      facility_zone_id?: number | null
    }>()

    const ef = entityFilter(c)  // #368: 타법인 구역 수정 차단
    const zone = await c.env.DB.prepare('SELECT id, entity_id FROM storage_zones WHERE id = ?' + ef.clause).bind(id, ...ef.params).first<{ id: number; entity_id: number }>()
    if (!zone) return c.json({ success: false, error: '구역을 찾을 수 없습니다.' }, 404)

    // #368: entity_id 재배정은 전체모드(0)에서만 허용 — 비전체모드 ADMIN은 타법인 이관 불가
    const entityId = (getEntityId(c) === 0 && body.entity_id != null) ? body.entity_id : zone.entity_id

    // 이름 중복 체크 (같은 법인 내, 자기 자신 제외)
    if (body.zone_name) {
      const dup = await c.env.DB.prepare(
        'SELECT id FROM storage_zones WHERE zone_name = ? AND entity_id = ? AND id != ?'
      ).bind(body.zone_name.trim(), entityId, id).first()
      if (dup) return c.json({ success: false, error: '이미 존재하는 구역명입니다.' }, 400)
    }

    // is_default=1 설정 시 같은 법인의 다른 기본 창고 해제
    if (body.is_default) {
      await c.env.DB.prepare(
        'UPDATE storage_zones SET is_default = 0 WHERE entity_id = ? AND is_default = 1 AND id != ?'
      ).bind(entityId, id).run()
    }

    await c.env.DB.prepare(`
      UPDATE storage_zones SET
        zone_name = COALESCE(?, zone_name),
        zone_code = ?,
        description = ?,
        manager_id = ?,
        sort_order = COALESCE(?, sort_order),
        is_active = COALESCE(?, is_active),
        entity_id = ?,
        is_default = COALESCE(?, is_default),
        facility_zone_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      body.zone_name?.trim() || null,
      body.zone_code?.trim() ?? null,
      body.description?.trim() ?? null,
      body.manager_id ?? null,
      body.sort_order ?? null,
      body.is_active ?? null,
      entityId,
      body.is_default ?? null,
      body.facility_zone_id ?? null,
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

    const ef = entityFilter(c)  // #368: 타법인 구역 삭제 차단
    const zone = await c.env.DB.prepare('SELECT id, zone_name FROM storage_zones WHERE id = ?' + ef.clause).bind(id, ...ef.params).first<{ id: number; zone_name: string }>()
    if (!zone) return c.json({ success: false, error: '구역을 찾을 수 없습니다.' }, 404)

    // 배정된 품목 확인
    const itemCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM items WHERE storage_zone_id = ? AND is_active = 1'
    ).bind(id).first<{ cnt: number }>()

    if ((itemCount?.cnt ?? 0) > 0) {
      return c.json({
        success: false,
        error: `${zone.zone_name} 구역에 ${itemCount!.cnt}개 품목이 배정되어 있습니다. 품목을 다른 구역으로 이동한 후 삭제해주세요.`
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
