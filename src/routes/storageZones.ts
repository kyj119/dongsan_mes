import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter } from '../utils/entityFilter'
import { validateUpload } from '../utils/uploadValidation'

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

    // 0440: facility_zones 매핑(facility_zone_name) 표시 제거 — 창고 배치도 독립(자체 bounds)
    const sql = `
      SELECT sz.*, u.name as manager_name, e.short_name as entity_name,
        (SELECT COUNT(*) FROM items WHERE storage_zone_id = sz.id AND is_active = 1) as item_count
      FROM storage_zones sz
      LEFT JOIN users u ON sz.manager_id = u.id
      LEFT JOIN entities e ON sz.entity_id = e.id
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

// ============================================================================
// 창고 배치도 (0440: 창고 전용 도면 + 자체 bounds — facility_zones 매핑 대체)
// ============================================================================

// GET /api/storage-zones/layout-data - 배치도용 창고 목록 + 재고 집계 + 도면 키
storageZonesRouter.get('/layout-data', async (c) => {
  try {
    // 접근 규칙 = 목록(GET /)과 동일: ADMIN/MANAGER는 전 법인, 그 외 세션 법인
    const user = c.get('user')
    const allEntities = user?.role === 'ADMIN' || user?.role === 'MANAGER'
    const entityId = getEntityId(c)
    let where = 'WHERE sz.is_active = 1'
    const params: any[] = []
    if (!allEntities && entityId > 0) {
      where += ' AND sz.entity_id = ?'
      params.push(entityId)
    }

    const [zonesRes, bgRow] = await Promise.all([
      // 재고 집계 = inventory 다중행(0396) 기준: zone에 실제 귀속된 품목 수 + 안전재고 미달 수
      c.env.DB.prepare(`
        SELECT sz.id, sz.zone_name, sz.zone_code, sz.entity_id, sz.bounds, sz.color,
          sz.sort_order, sz.is_default, e.short_name as entity_name, u.name as manager_name,
          (SELECT COUNT(DISTINCT inv.item_id) FROM inventory inv
             JOIN items i ON i.id = inv.item_id AND i.is_active = 1
             WHERE inv.storage_zone_id = sz.id AND inv.entity_id = sz.entity_id) as inv_item_count,
          (SELECT COUNT(*) FROM inventory inv
             JOIN items i ON i.id = inv.item_id AND i.is_active = 1
             WHERE inv.storage_zone_id = sz.id AND inv.entity_id = sz.entity_id
               AND COALESCE(inv.safe_stock, 0) > 0 AND COALESCE(inv.quantity, 0) <= inv.safe_stock) as inv_shortage_count
        FROM storage_zones sz
        LEFT JOIN entities e ON sz.entity_id = e.id
        LEFT JOIN users u ON sz.manager_id = u.id
        ${where}
        ORDER BY sz.sort_order, sz.zone_name
      `).bind(...params).all(),
      c.env.DB.prepare(
        "SELECT setting_value FROM facility_settings WHERE setting_key = 'storage_background_image'"
      ).first<{ setting_value: string }>(),
    ])

    const zones = (zonesRes.results as Array<{ bounds?: string | null; [key: string]: unknown }>).map(z => ({
      ...z,
      bounds: z.bounds ? JSON.parse(z.bounds as string) : null, // null = 도면 미배치
    }))

    return c.json({ success: true, data: { zones, background: bgRow?.setting_value || null } })
  } catch (error) {
    console.error('storageZones layout-data error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 도면 배경 (facility 배치도와 동일 패턴: R2 키만 D1 보관, 바이트는 blob 서빙)
storageZonesRouter.get('/background', async (c) => {
  try {
    const row = await c.env.DB.prepare(
      "SELECT setting_value FROM facility_settings WHERE setting_key = 'storage_background_image'"
    ).first<{ setting_value: string }>()
    return c.json({ success: true, data: row?.setting_value || null })
  } catch (error) {
    console.error('storageZones background error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 도면 이미지 바이트 서빙 (인증 헤더 경유 → 프론트는 axios blob 로드, <img src> 직접 불가)
storageZonesRouter.get('/background-image', async (c) => {
  try {
    const row = await c.env.DB.prepare(
      "SELECT setting_value FROM facility_settings WHERE setting_key = 'storage_background_image'"
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
    console.error('storageZones background-image error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 도면 업로드 (multipart → R2)
storageZonesRouter.post('/background', requireRole('ADMIN'), async (c) => {
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

    const key = `storage/floor-plan/${Date.now()}.${v.ext}`
    await c.env.R2_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'image/png' },
    })

    const prev = await c.env.DB.prepare(
      "SELECT setting_value FROM facility_settings WHERE setting_key = 'storage_background_image'"
    ).first<{ setting_value: string }>()

    await c.env.DB.prepare(`
      INSERT INTO facility_settings (setting_key, setting_value) VALUES ('storage_background_image', ?)
      ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP
    `).bind(key).run()

    if (prev?.setting_value && prev.setting_value !== key && prev.setting_value.startsWith('storage/')) {
      try { await c.env.R2_BUCKET.delete(prev.setting_value) } catch { /* ignore */ }
    }

    return c.json({ success: true, data: { key } })
  } catch (error) {
    console.error('storageZones background upload error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 도면 삭제
storageZonesRouter.delete('/background', requireRole('ADMIN'), async (c) => {
  try {
    const row = await c.env.DB.prepare(
      "SELECT setting_value FROM facility_settings WHERE setting_key = 'storage_background_image'"
    ).first<{ setting_value: string }>()
    if (row?.setting_value && row.setting_value.startsWith('storage/')) {
      try { await c.env.R2_BUCKET.delete(row.setting_value) } catch { /* ignore */ }
    }
    await c.env.DB.prepare("DELETE FROM facility_settings WHERE setting_key = 'storage_background_image'").run()
    return c.json({ success: true })
  } catch (error) {
    console.error('storageZones background delete error:', error)
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

// GET /api/storage-zones/:id/stock - 구역 실재고 (배치도 클릭 상세: inventory 다중행 기준)
storageZonesRouter.get('/:id/stock', async (c) => {
  try {
    const id = c.req.param('id')
    // 접근 규칙 = layout-data와 동일: ADMIN/MANAGER 전 법인, 그 외 세션 법인
    const user = c.get('user')
    const allEntities = user?.role === 'ADMIN' || user?.role === 'MANAGER'
    const entityId = getEntityId(c)
    let extra = ''
    const params: any[] = [id]
    if (!allEntities && entityId > 0) {
      extra = ' AND sz.entity_id = ?'
      params.push(entityId)
    }
    const zone = await c.env.DB.prepare(`
      SELECT sz.id, sz.zone_name, sz.entity_id, u.name as manager_name
      FROM storage_zones sz LEFT JOIN users u ON sz.manager_id = u.id
      WHERE sz.id = ?${extra}
    `).bind(...params).first<{ id: number; zone_name: string; entity_id: number; manager_name: string | null }>()
    if (!zone) return c.json({ success: false, error: '구역을 찾을 수 없습니다.' }, 404)

    const { results: items } = await c.env.DB.prepare(`
      SELECT i.id as item_id, i.item_code, i.item_name, i.category, i.unit,
        COALESCE(inv.quantity, 0) as quantity, COALESCE(inv.safe_stock, 0) as safe_stock
      FROM inventory inv
      JOIN items i ON i.id = inv.item_id AND i.is_active = 1
      WHERE inv.storage_zone_id = ? AND inv.entity_id = ?
      ORDER BY i.item_name
    `).bind(zone.id, zone.entity_id).all()

    return c.json({ success: true, data: { ...zone, items } })
  } catch (error) {
    console.error('storageZones :id/stock error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PUT /api/storage-zones/:id/bounds - 배치도 좌표 저장 (ADMIN). bounds=null → 도면에서 내리기
storageZonesRouter.put('/:id/bounds', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const { bounds } = await c.req.json<{ bounds: string | null }>()
    if (bounds != null) {
      try {
        const b = JSON.parse(bounds)
        if (typeof b.x !== 'number' || typeof b.y !== 'number' || typeof b.width !== 'number' || typeof b.height !== 'number') {
          return c.json({ success: false, error: 'bounds 형식이 올바르지 않습니다.' }, 400)
        }
      } catch {
        return c.json({ success: false, error: 'bounds 형식이 올바르지 않습니다.' }, 400)
      }
    }
    const result = await c.env.DB.prepare(
      'UPDATE storage_zones SET bounds = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(bounds ?? null, id).run()
    if (!result.meta.changes) return c.json({ success: false, error: '구역을 찾을 수 없습니다.' }, 404)
    return c.json({ success: true })
  } catch (error) {
    console.error('storageZones bounds error:', error)
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
      color?: string
    }>()

    if (!body.zone_name?.trim()) {
      return c.json({ success: false, error: '구역명을 입력해주세요.' }, 400)
    }

    // #417 대칭 완화: 본 라우트는 requireRole('ADMIN') 게이트 — 목록 all_entities·PUT/DELETE와 동일 신뢰로
    // 모달 법인 드롭다운의 entity_id를 존중(비전체모드에서 타법인 선택 시 자기 법인에 잘못 생성되던 문제 해소).
    const entityId = body.entity_id != null ? body.entity_id : (getEntityId(c) || 1)

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
      INSERT INTO storage_zones (zone_name, zone_code, description, manager_id, sort_order, entity_id, is_default, color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.zone_name.trim(),
      body.zone_code?.trim() || null,
      body.description?.trim() || null,
      body.manager_id || null,
      body.sort_order ?? 0,
      entityId,
      body.is_default ?? 0,
      body.color || '#3B82F6'
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id }, message: '구역이 생성되었습니다.' })
  } catch (error: any) {
    // #482: (entity_id, zone_name)·(entity_id, zone_code) 복합 UNIQUE(0448) 위반 시 명확한 409
    // (zone_code 는 앱 사전검사가 없어 여기서만 걸림)
    if (error?.message && /UNIQUE constraint failed/i.test(error.message)) {
      return c.json({ success: false, error: '같은 구역명 또는 코드가 이미 사용 중입니다.' }, 409)
    }
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
      color?: string
    }>()

    // #368 대칭 완화: 목록(GET all_entities=1)이 ADMIN에 전 법인을 노출하는데 수정만 세션 법인 필터를
    // 타면 타법인 창고 수정이 404. 본 라우트는 requireRole('ADMIN') 게이트라 동일 신뢰로 필터 생략.
    const zone = await c.env.DB.prepare('SELECT id, entity_id FROM storage_zones WHERE id = ?').bind(id).first<{ id: number; entity_id: number }>()
    if (!zone) return c.json({ success: false, error: '구역을 찾을 수 없습니다.' }, 404)

    // entity_id 재배정도 ADMIN 신뢰 (수정 모달 법인 드롭다운과 정합)
    const entityId = body.entity_id != null ? body.entity_id : zone.entity_id

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
        color = COALESCE(?, color),
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
      body.color ?? null,
      id
    ).run()

    return c.json({ success: true, message: '구역이 수정되었습니다.' })
  } catch (error: any) {
    // #482: 복합 UNIQUE(0448) 위반 시 명확한 409 (zone_code 는 앱 사전검사 없음)
    if (error?.message && /UNIQUE constraint failed/i.test(error.message)) {
      return c.json({ success: false, error: '같은 구역명 또는 코드가 이미 사용 중입니다.' }, 409)
    }
    console.error('storageZones PUT error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /api/storage-zones/:id - 구역 삭제 (ADMIN, 품목 없을 때만)
storageZonesRouter.delete('/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')

    // #368 대칭 완화: PUT과 동일 — requireRole('ADMIN') 게이트, 목록 all_entities 신뢰와 대칭으로 필터 생략.
    const zone = await c.env.DB.prepare('SELECT id, zone_name FROM storage_zones WHERE id = ?').bind(id).first<{ id: number; zone_name: string }>()
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

    // #460: 다중행 재설계(0396) — items.storage_zone_id뿐 아니라 inventory 실재고 zone도 검사.
    //   실재고(quantity≠0)가 있으면 차단(zone귀속 소실 방지). 빈 재고행(quantity=0)은 삭제와 함께 정리(dangling/UNIQUE 충돌 방지).
    const stockCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM inventory WHERE storage_zone_id = ? AND quantity != 0'
    ).bind(id).first<{ cnt: number }>()
    if ((stockCount?.cnt ?? 0) > 0) {
      return c.json({
        success: false,
        error: `${zone.zone_name} 구역에 실재고가 있는 품목이 있습니다. 재고를 다른 구역으로 이동한 후 삭제해주세요.`
      }, 400)
    }

    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM inventory WHERE storage_zone_id = ? AND quantity = 0').bind(id),
      c.env.DB.prepare('DELETE FROM storage_zones WHERE id = ?').bind(id),
    ])
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
