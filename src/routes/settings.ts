import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId } from '../utils/entityFilter'

const settingsRouter = new Hono<HonoEnv>()
settingsRouter.use('/*', authMiddleware)

// GET /api/settings - 전체 설정 조회 (MANAGER+)
settingsRouter.get('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT setting_key, setting_value FROM settings'
    ).all()

    const settingsMap: Record<string, string> = {}
    for (const row of results as any[]) {
      settingsMap[row.setting_key] = row.setting_value || ''
    }

    // 팝빌 비밀키 설정 여부 (실제 값은 노출하지 않음)
    settingsMap['tax_secret_key_configured'] = c.env.POPBILL_SECRET_KEY ? '1' : ''

    return c.json({ success: true, data: settingsMap })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// PATCH /api/settings - 설정 업데이트 (ADMIN)
settingsRouter.patch('/', requireRole('ADMIN'), async (c) => {
  try {
    const { settings } = await c.req.json<{ settings: Record<string, string> }>()

    const stmts = Object.entries(settings).map(([key, value]) =>
      c.env.DB.prepare(
        `INSERT INTO settings (setting_key, setting_value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP`
      ).bind(key, value)
    )
    await c.env.DB.batch(stmts)

    return c.json({ success: true, message: '설정이 저장되었습니다.' })
  } catch (error) {
    console.error('src/routes/settings.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ── 현재 법인 정보 조회 (entities 테이블) ──
settingsRouter.get('/entity', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const entityId = getEntityId(c)
    if (!entityId || entityId === 0) {
      return c.json({ success: false, error: '법인을 선택해주세요.' }, 400)
    }
    const entity = await c.env.DB.prepare(
      'SELECT id, name, short_name, business_reg_no, representative, business_type, business_item, address, phone, fax, email, tax_email, popbill_corp_num, bank_info, stamp_base64, logo_base64, email_from_address, email_from_name, is_active, sort_order, created_at FROM entities WHERE id = ?'
    ).bind(entityId).first()
    if (!entity) {
      return c.json({ success: false, error: '법인을 찾을 수 없습니다.' }, 404)
    }
    return c.json({ success: true, data: entity })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 현재 법인 정보 수정 ──
settingsRouter.patch('/entity', requireRole('ADMIN'), async (c) => {
  try {
    const entityId = getEntityId(c)
    if (!entityId || entityId === 0) {
      return c.json({ success: false, error: '법인을 선택해주세요.' }, 400)
    }
    const body = await c.req.json()
    // 인감 이미지 크기 제한 (~150KB)
    if (body.stamp_base64 && body.stamp_base64.length > 200000) {
      return c.json({ success: false, error: '인감 이미지가 너무 큽니다. 150KB 이하로 줄여주세요.' }, 400)
    }
    const ALLOWED = [
      'name', 'short_name', 'business_reg_no', 'representative',
      'business_type', 'business_item', 'address', 'phone', 'fax', 'email',
      'tax_email', 'popbill_corp_num', 'bank_info', 'stamp_base64',
      // Phase 1.2: entity별 이메일 발신 설정
      'email_from_address', 'email_from_name'
    ]
    const updates: string[] = []
    const params: any[] = []
    for (const key of ALLOWED) {
      if (key in body) {
        updates.push(`${key} = ?`)
        params.push(body[key] ?? null)
      }
    }
    if (updates.length === 0) {
      return c.json({ success: false, error: '수정할 항목이 없습니다.' }, 400)
    }
    params.push(entityId)
    await c.env.DB.prepare(
      `UPDATE entities SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run()

    const updated = await c.env.DB.prepare(
      'SELECT id, name, short_name, business_reg_no, representative, business_type, business_item, address, phone, fax, email, tax_email, popbill_corp_num, bank_info, stamp_base64, logo_base64, email_from_address, email_from_name, is_active, sort_order, created_at FROM entities WHERE id = ?'
    ).bind(entityId).first()
    return c.json({ success: true, data: updated })
  } catch (error) {
    console.error('PATCH /api/settings/entity error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 원가 기준 (cost_standards) CRUD ──

// GET /api/settings/cost-standards - 전체 원가 기준 조회
settingsRouter.get('/cost-standards', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, category_name, media_cost_per_sqm, ink_cost_per_sqm, description, updated_at FROM cost_standards ORDER BY category_name'
    ).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/settings.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PUT /api/settings/cost-standards - 원가 기준 일괄 저장 (upsert)
settingsRouter.put('/cost-standards', requireRole('ADMIN'), async (c) => {
  try {
    const { standards } = await c.req.json<{ standards: Array<{ category_name: string, media_cost_per_sqm: number, ink_cost_per_sqm: number, description?: string }> }>()

    if (!standards || !Array.isArray(standards)) {
      return c.json({ success: false, error: '잘못된 요청입니다.' }, 400)
    }

    const stmt = c.env.DB.prepare(`
      INSERT INTO cost_standards (category_name, media_cost_per_sqm, ink_cost_per_sqm, description, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(category_name) DO UPDATE SET
        media_cost_per_sqm = excluded.media_cost_per_sqm,
        ink_cost_per_sqm = excluded.ink_cost_per_sqm,
        description = excluded.description,
        updated_at = CURRENT_TIMESTAMP
    `)

    const batch = standards.map(s =>
      stmt.bind(s.category_name, s.media_cost_per_sqm || 0, s.ink_cost_per_sqm || 0, s.description || null)
    )
    await c.env.DB.batch(batch)

    return c.json({ success: true, message: '원가 기준이 저장되었습니다.' })
  } catch (error) {
    console.error('src/routes/settings.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /api/settings/cost-standards/:id - 원가 기준 삭제
settingsRouter.delete('/cost-standards/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM cost_standards WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/settings.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default settingsRouter