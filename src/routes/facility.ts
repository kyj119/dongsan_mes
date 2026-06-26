import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, cardEntityFilter } from '../utils/entityFilter'
import { validateUpload } from '../utils/uploadValidation'

// 멀티테넌시 모델 (감사 2026-06-09):
// - equipment(entity_id, 0302 #342 "법인별 설비 분리")·cards(requesting_entity_id, 0150) = 법인 격리
//   → entityFilter(e)/cardEntityFilter(c) 적용. ADMIN 전체모드(entityId=0)는 필터 생략(현행 동작 유지).
// - facility_zones·inventory_locations·facility_settings·agent_heartbeats = entity_id 없음 = 전사 공용
//   (물리 구역/보관위치/시설설정/모니터링은 법인 무관 단일 시설 데이터).
const facilityRouter = new Hono<HonoEnv>()
facilityRouter.use('/*', authMiddleware)

// ============================================================================
// 구역 CRUD
// ============================================================================

facilityRouter.get('/zones', async (c) => {
  try {
    const ef = entityFilter(c, 'e')  // equipment 격리 (구역별 설비 수). inventory_locations는 전사 공용
    const { results } = await c.env.DB.prepare(`
      SELECT fz.*,
        (SELECT COUNT(*) FROM equipment e WHERE e.zone_id = fz.id${ef.clause}) as equipment_count,
        (SELECT COUNT(*) FROM inventory_locations il WHERE il.zone_id = fz.id AND il.is_active = 1) as location_count
      FROM facility_zones fz
      WHERE fz.is_active = 1
      ORDER BY fz.sort_order
    `).bind(...ef.params).all()
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
    const equipEf = entityFilter(c, 'e')       // equipment 격리 (entity_id)
    const cardEf = cardEntityFilter(c, 'c')    // cards 격리 (requesting_entity_id)
    const [zonesRes, equipRes, locsRes, cardsRes, invRes] = await Promise.all([
      // facility_zones: entity_id 없음 = 전사 공용(물리 구역)
      c.env.DB.prepare(`
        SELECT id, name, description, color, sort_order, bounds, is_active, created_at, updated_at FROM facility_zones WHERE is_active = 1 ORDER BY sort_order
      `).all(),
      // 바인드 순서: cards 서브쿼리(SELECT절)가 equipment WHERE보다 앞 → cardEf, equipEf 순
      c.env.DB.prepare(`
        SELECT e.id, e.name, e.printer_name, e.equipment_status, e.location_x, e.location_y,
          e.location_zone, e.zone_id, e.status,
          (SELECT COUNT(*) FROM cards c WHERE c.equipment_id = e.id AND c.status IN ('PRINT_PENDING','PRINTING')${cardEf.clause}) as active_cards,
          ah.last_heartbeat, ah.is_printing
        FROM equipment e
        LEFT JOIN (
          SELECT equipment_id, MAX(last_seen_at) as last_heartbeat, is_printing
          FROM agent_heartbeats GROUP BY equipment_id
        ) ah ON ah.equipment_id = e.id
        WHERE e.status = 'ACTIVE'${equipEf.clause}
      `).bind(...cardEf.params, ...equipEf.params).all(),
      // inventory_locations: entity_id 없음 = 전사 공용(물리 보관위치)
      c.env.DB.prepare(`
        SELECT id, zone_id, name, location_x, location_y, location_type, description, is_active, created_at FROM inventory_locations WHERE is_active = 1
      `).all(),
      // 구역별 오늘 작업 수 (cards 격리)
      c.env.DB.prepare(`
        SELECT e.zone_id, COUNT(c.id) as card_count
        FROM cards c
        JOIN equipment e ON c.equipment_id = e.id
        WHERE c.status IN ('PRINT_PENDING','PRINTING') AND e.zone_id IS NOT NULL${cardEf.clause}
        GROUP BY e.zone_id
      `).bind(...cardEf.params).all(),
      // P2: facility_zone별 재고 집계 (storage_zone 경유). 부족 = 안전재고 설정된 품목 중 현재고 ≤ 안전재고.
      c.env.DB.prepare(`
        SELECT sz.facility_zone_id as zone_id,
          COUNT(DISTINCT i.id) as inv_item_count,
          SUM(CASE WHEN COALESCE(inv.safe_stock,0) > 0 AND COALESCE(inv.quantity,0) <= inv.safe_stock THEN 1 ELSE 0 END) as inv_shortage_count
        FROM storage_zones sz
        JOIN items i ON i.storage_zone_id = sz.id AND i.is_active = 1
        LEFT JOIN inventory inv ON inv.item_id = i.id AND inv.entity_id = sz.entity_id
        WHERE sz.facility_zone_id IS NOT NULL AND sz.is_active = 1
        GROUP BY sz.facility_zone_id
      `).all(),
    ])

    const zoneCards: Record<number, number> = {}
    for (const r of cardsRes.results as Array<{ zone_id: number; card_count: number }>) {
      zoneCards[r.zone_id] = r.card_count
    }

    // P2: facility_zone별 재고 집계 병합
    const zoneInv: Record<number, { item_count: number; shortage_count: number }> = {}
    for (const r of invRes.results as Array<{ zone_id: number | null; inv_item_count: number; inv_shortage_count: number }>) {
      if (r.zone_id != null) zoneInv[r.zone_id] = { item_count: r.inv_item_count || 0, shortage_count: r.inv_shortage_count || 0 }
    }

    const zones = (zonesRes.results as Array<{ id: number; bounds?: string; [key: string]: unknown }>).map(z => ({
      ...z,
      bounds: z.bounds ? JSON.parse(z.bounds) : { x: 10, y: 10, width: 200, height: 150 },
      active_cards: zoneCards[z.id] || 0,
      inv_item_count: zoneInv[z.id]?.item_count || 0,
      inv_shortage_count: zoneInv[z.id]?.shortage_count || 0,
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

// GET /zones/:id/inventory - 배치도 영역의 재고 상세 (매핑된 storage_zone별 품목, P2 클릭 패널)
facilityRouter.get('/zones/:id/inventory', async (c) => {
  try {
    const zoneId = c.req.param('id')
    const { results } = await c.env.DB.prepare(`
      SELECT sz.id as storage_zone_id, sz.zone_name, u.name as manager_name,
        i.id as item_id, i.item_code, i.item_name, i.category, i.unit,
        COALESCE(inv.quantity, 0) as quantity, COALESCE(inv.safe_stock, 0) as safe_stock
      FROM storage_zones sz
      JOIN items i ON i.storage_zone_id = sz.id AND i.is_active = 1
      LEFT JOIN inventory inv ON inv.item_id = i.id AND inv.entity_id = sz.entity_id
      LEFT JOIN users u ON sz.manager_id = u.id
      WHERE sz.facility_zone_id = ? AND sz.is_active = 1
      ORDER BY sz.zone_name, i.item_name
    `).bind(zoneId).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('facility zones/:id/inventory error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// 배경 이미지
// ============================================================================

// 배경(도면) 존재 여부/키 반환. 실제 바이트는 /background-image 가 R2에서 서빙.
facilityRouter.get('/background', async (c) => {
  try {
    const row = await c.env.DB.prepare(
      "SELECT setting_value FROM facility_settings WHERE setting_key = 'background_image'"
    ).first<{ setting_value: string }>()
    return c.json({ success: true, data: row?.setting_value || null })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 도면 이미지 바이트 서빙 (R2). 인증 헤더 경유 → 프론트는 axios blob 으로 로드.
// (<img src> 직접 불가 — authMiddleware 가 Bearer 헤더만 허용)
facilityRouter.get('/background-image', async (c) => {
  try {
    const row = await c.env.DB.prepare(
      "SELECT setting_value FROM facility_settings WHERE setting_key = 'background_image'"
    ).first<{ setting_value: string }>()
    const key = row?.setting_value
    if (!key) return c.json({ success: false, error: '등록된 도면이 없습니다.' }, 404)
    if (key.includes('..') || key.includes('\\')) return c.json({ success: false, error: 'Invalid path' }, 400)

    const object = await c.env.R2_BUCKET.get(key)
    if (!object) return c.json({ success: false, error: '도면 파일을 찾을 수 없습니다.' }, 404)

    const headers = new Headers()
    headers.set('Content-Type', object.httpMetadata?.contentType || 'image/png')
    headers.set('Cache-Control', 'private, max-age=300')
    return new Response(object.body, { headers })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 도면 업로드 (multipart → R2). base64 직접저장(D1 비대) 대신 R2 키만 보관.
facilityRouter.post('/background', requireRole('ADMIN'), async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ success: false, error: '파일이 없습니다.' }, 400)

    const v = validateUpload(file, {
      maxBytes: 10 * 1024 * 1024,
      allowedMimePrefixes: ['image/'],
      allowedExts: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
    })
    if (!v.ok) return c.json({ success: false, error: v.error }, 400)

    const key = `facility/floor-plan/${Date.now()}.${v.ext}`
    await c.env.R2_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'image/png' },
    })

    // 이전 도면 키 조회(스토리지 정리용)
    const prev = await c.env.DB.prepare(
      "SELECT setting_value FROM facility_settings WHERE setting_key = 'background_image'"
    ).first<{ setting_value: string }>()

    await c.env.DB.prepare(`
      INSERT INTO facility_settings (setting_key, setting_value) VALUES ('background_image', ?)
      ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP
    `).bind(key).run()

    // 이전 도면 R2 정리 (실패 무시)
    if (prev?.setting_value && prev.setting_value !== key && prev.setting_value.startsWith('facility/')) {
      try { await c.env.R2_BUCKET.delete(prev.setting_value) } catch { /* ignore */ }
    }

    return c.json({ success: true, data: { key } })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 도면 삭제
facilityRouter.delete('/background', requireRole('ADMIN'), async (c) => {
  try {
    const row = await c.env.DB.prepare(
      "SELECT setting_value FROM facility_settings WHERE setting_key = 'background_image'"
    ).first<{ setting_value: string }>()
    if (row?.setting_value && row.setting_value.startsWith('facility/')) {
      try { await c.env.R2_BUCKET.delete(row.setting_value) } catch { /* ignore */ }
    }
    await c.env.DB.prepare("DELETE FROM facility_settings WHERE setting_key = 'background_image'").run()
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
    const ef = entityFilter(c)  // 타법인 설비 이동 차단 (ADMIN 전체모드는 생략)
    await c.env.DB.prepare(`UPDATE equipment SET zone_id = ? WHERE id = ?${ef.clause}`).bind(zone_id, id, ...ef.params).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default facilityRouter
