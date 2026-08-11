import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, cardEntityFilter } from '../utils/entityFilter'
import { validateUpload } from '../utils/uploadValidation'

// 멀티테넌시 모델 (감사 2026-06-09):
// - equipment(entity_id, 0302 #342 "법인별 설비 분리")·cards(requesting_entity_id, 0150) = 법인 격리
//   → entityFilter(e)/cardEntityFilter(c) 적용. ADMIN 전체모드(entityId=0)는 필터 생략(현행 동작 유지).
// - facility_zones·facility_settings·agent_heartbeats = entity_id 없음 = 전사 공용
//   (물리 구역/시설설정/모니터링은 법인 무관 단일 시설 데이터).
// 0440: 창고 배치도 독립 — 재고 오버레이(storage_zones 매핑 경유)·inventory_locations 레거시 제거.
//   창고 배치도 = /storage-zones 배치도 탭 (storage_zones.bounds + 창고 전용 도면).
const facilityRouter = new Hono<HonoEnv>()
facilityRouter.use('/*', authMiddleware)

// ============================================================================
// 구역 CRUD
// ============================================================================

facilityRouter.get('/zones', async (c) => {
  try {
    // 장비 조회 = 전 법인 공유 (2026-08-11: 전 장비가 동산(1) 소유라 격리 시 타법인 세션은 빈 화면 — 쓰기 경로만 #342 유지)
    const { results } = await c.env.DB.prepare(`
      SELECT fz.*,
        (SELECT COUNT(*) FROM equipment e WHERE e.zone_id = fz.id) as equipment_count
      FROM facility_zones fz
      WHERE fz.is_active = 1
      ORDER BY fz.sort_order, fz.id
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
    // 장비 조회 = 전 법인 공유, 카드 수치만 법인 격리 유지 (2026-08-11 — 쓰기 경로만 #342)
    const cardEf = cardEntityFilter(c, 'c')    // cards 격리 (requesting_entity_id)
    const [zonesRes, equipRes, cardsRes] = await Promise.all([
      // facility_zones: entity_id 없음 = 전사 공용(물리 구역)
      c.env.DB.prepare(`
        SELECT id, name, description, color, sort_order, bounds, is_active, created_at, updated_at FROM facility_zones WHERE is_active = 1 ORDER BY sort_order, id
      `).all(),
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
        WHERE e.status = 'ACTIVE'
      `).bind(...cardEf.params).all(),
      // 구역별 오늘 작업 수 (cards 격리)
      c.env.DB.prepare(`
        SELECT e.zone_id, COUNT(c.id) as card_count
        FROM cards c
        JOIN equipment e ON c.equipment_id = e.id
        WHERE c.status IN ('PRINT_PENDING','PRINTING') AND e.zone_id IS NOT NULL${cardEf.clause}
        GROUP BY e.zone_id
      `).bind(...cardEf.params).all(),
    ])

    const zoneCards: Record<number, number> = {}
    for (const r of cardsRes.results as Array<{ zone_id: number; card_count: number }>) {
      zoneCards[r.zone_id] = r.card_count
    }

    const zones = (zonesRes.results as Array<{ id: number; bounds?: string; [key: string]: unknown }>).map(z => ({
      ...z,
      bounds: z.bounds ? JSON.parse(z.bounds) : { x: 10, y: 10, width: 200, height: 150 },
      active_cards: zoneCards[z.id] || 0,
    }))

    return c.json({
      success: true,
      data: { zones, equipment: equipRes.results }
    })
  } catch (error) {
    console.error('src/routes/facility.ts error:', error)
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

// (inventory_locations 자재 보관위치 CRUD 제거 — 0072 레거시, UI 소비자 0. 창고 위치 정본 = storage_zones)

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
