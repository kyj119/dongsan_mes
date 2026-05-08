import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const facilityRouter = new Hono<HonoEnv>()
facilityRouter.use('/*', authMiddleware)

// ============================================================================
// 구역 CRUD
// ============================================================================

facilityRouter.get('/zones', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT fz.*,
        (SELECT COUNT(*) FROM equipment e WHERE e.zone_id = fz.id) as equipment_count,
        (SELECT COUNT(*) FROM inventory_locations il WHERE il.zone_id = fz.id AND il.is_active = 1) as location_count
      FROM facility_zones fz
      WHERE fz.is_active = 1
      ORDER BY fz.sort_order
    `).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

facilityRouter.post('/zones', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json<{ name: string; description?: string; color?: string; sort_order?: number; bounds?: string }>()
    if (!body.name) return c.json({ success: false, error: '구역 이름을 입력해주세요.' }, 400)

    const result = await c.env.DB.prepare(`
      INSERT INTO facility_zones (name, description, color, sort_order, bounds)
      VALUES (?, ?, ?, ?, ?)
    `).bind(body.name, body.description || null, body.color || '#3B82F6', body.sort_order || 0, body.bounds || '{"x":10,"y":10,"width":200,"height":150}').run()

    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

facilityRouter.put('/zones/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<Record<string, any>>()
    const allowed = ['name', 'description', 'color', 'sort_order', 'bounds']
    const fields: string[] = []
    const params: any[] = []

    for (const key of allowed) {
      if (body[key] !== undefined) { fields.push(`${key} = ?`); params.push(body[key]); }
    }
    if (fields.length === 0) return c.json({ success: false, error: '변경할 항목이 없습니다.' }, 400)
    fields.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    await c.env.DB.prepare(`UPDATE facility_zones SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

facilityRouter.put('/zones/:id/bounds', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const { bounds } = await c.req.json<{ bounds: string }>()
    await c.env.DB.prepare(
      'UPDATE facility_zones SET bounds = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(bounds, id).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

facilityRouter.delete('/zones/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('UPDATE facility_zones SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// 전체 배치도 데이터
// ============================================================================

facilityRouter.get('/layout-data', async (c) => {
  try {
    const [zonesRes, equipRes, locsRes, cardsRes] = await Promise.all([
      c.env.DB.prepare(`
        SELECT * FROM facility_zones WHERE is_active = 1 ORDER BY sort_order
      `).all(),
      c.env.DB.prepare(`
        SELECT e.id, e.name, e.printer_name, e.equipment_status, e.location_x, e.location_y,
          e.location_zone, e.zone_id, e.status,
          (SELECT COUNT(*) FROM cards c WHERE c.equipment_id = e.id AND c.status IN ('PRINT_PENDING','PRINTING')) as active_cards,
          ah.last_heartbeat, ah.is_printing
        FROM equipment e
        LEFT JOIN (
          SELECT equipment_id, MAX(last_seen_at) as last_heartbeat, is_printing
          FROM agent_heartbeats GROUP BY equipment_id
        ) ah ON ah.equipment_id = e.id
        WHERE e.status = 'ACTIVE'
      `).all(),
      c.env.DB.prepare(`
        SELECT * FROM inventory_locations WHERE is_active = 1
      `).all(),
      // 구역별 오늘 작업 수
      c.env.DB.prepare(`
        SELECT e.zone_id, COUNT(c.id) as card_count
        FROM cards c
        JOIN equipment e ON c.equipment_id = e.id
        WHERE c.status IN ('PRINT_PENDING','PRINTING') AND e.zone_id IS NOT NULL
        GROUP BY e.zone_id
      `).all(),
    ])

    const zoneCards: Record<number, number> = {}
    for (const r of cardsRes.results as any[]) {
      zoneCards[r.zone_id] = r.card_count
    }

    const zones = (zonesRes.results as any[]).map(z => ({
      ...z,
      bounds: z.bounds ? JSON.parse(z.bounds) : { x: 10, y: 10, width: 200, height: 150 },
      active_cards: zoneCards[z.id] || 0,
    }))

    return c.json({
      success: true,
      data: { zones, equipment: equipRes.results, locations: locsRes.results }
    })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// 배경 이미지
// ============================================================================

facilityRouter.get('/background', async (c) => {
  try {
    const row = await c.env.DB.prepare(
      "SELECT setting_value FROM facility_settings WHERE setting_key = 'background_image'"
    ).first() as any
    return c.json({ success: true, data: row?.setting_value || null })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

facilityRouter.post('/background', requireRole('ADMIN'), async (c) => {
  try {
    const { image } = await c.req.json<{ image: string }>()
    await c.env.DB.prepare(`
      INSERT INTO facility_settings (setting_key, setting_value) VALUES ('background_image', ?)
      ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP
    `).bind(image).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// 자재 보관 위치 CRUD
// ============================================================================

facilityRouter.get('/locations', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT il.*, fz.name as zone_name
      FROM inventory_locations il
      LEFT JOIN facility_zones fz ON il.zone_id = fz.id
      WHERE il.is_active = 1 ORDER BY il.name
    `).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

facilityRouter.post('/locations', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json<{ name: string; zone_id?: number; location_x?: number; location_y?: number; location_type?: string; description?: string }>()
    if (!body.name) return c.json({ success: false, error: '이름을 입력해주세요.' }, 400)

    const result = await c.env.DB.prepare(`
      INSERT INTO inventory_locations (name, zone_id, location_x, location_y, location_type, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(body.name, body.zone_id || null, body.location_x || 50, body.location_y || 50, body.location_type || 'STORAGE', body.description || null).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

facilityRouter.put('/locations/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<Record<string, any>>()
    const allowed = ['name', 'zone_id', 'location_x', 'location_y', 'location_type', 'description']
    const fields: string[] = []
    const params: any[] = []
    for (const key of allowed) {
      if (body[key] !== undefined) { fields.push(`${key} = ?`); params.push(body[key]); }
    }
    if (fields.length === 0) return c.json({ success: false, error: '변경할 항목이 없습니다.' }, 400)
    params.push(id)
    await c.env.DB.prepare(`UPDATE inventory_locations SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

facilityRouter.delete('/locations/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('UPDATE inventory_locations SET is_active = 0 WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 장비 구역 변경
facilityRouter.patch('/equipment/:id/zone', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const { zone_id } = await c.req.json<{ zone_id: number | null }>()
    await c.env.DB.prepare('UPDATE equipment SET zone_id = ? WHERE id = ?').bind(zone_id, id).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default facilityRouter
