import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const priceListRouter = new Hono<HonoEnv>()
priceListRouter.use('/*', authMiddleware)

// ============================================================================
// GET / — 단가표 데이터 (품목 + 미디어 + 거래처 정책 적용)
// ============================================================================
priceListRouter.get('/', async (c) => {
  try {
    const clientId = c.req.query('client_id')

    const { results: items } = await c.env.DB.prepare(`
      SELECT id, item_code, item_name, item_type, category,
             specification, unit, base_price, sales_price, is_sales_item
      FROM items WHERE is_active = 1
      ORDER BY item_type, category, item_name, specification
    `).all()

    const { results: media } = await c.env.DB.prepare(`
      SELECT id, name, code, media_type, price_per_unit, unit, media_group, sort_order
      FROM print_media WHERE is_active = 1
      ORDER BY media_group, sort_order, name
    `).all()

    let policyRules: Record<string, unknown>[] = []
    let policyName = ''
    let clientName = ''
    let policyId: number | null = null

    if (clientId) {
      const client = await c.env.DB.prepare(
        'SELECT client_name, price_policy_id FROM clients WHERE id = ?'
      ).bind(clientId).first<{ client_name: string; price_policy_id: number | null }>()
      clientName = client?.client_name || ''
      policyId = client?.price_policy_id || null

      if (policyId) {
        const policy = await c.env.DB.prepare(
          'SELECT name FROM price_policies WHERE id = ?'
        ).bind(policyId).first<{ name: string }>()
        policyName = policy?.name || ''

        const { results: rules } = await c.env.DB.prepare(`
          SELECT id, category, item_id, rate_percent, fixed_price
          FROM price_policy_rules WHERE policy_id = ?
          ORDER BY item_id NULLS LAST, category NULLS LAST
        `).bind(policyId).all()
        policyRules = rules
      }
    }

    const categories = [...new Set(items.map(i => (i as Record<string, unknown>).category).filter(Boolean))]

    return c.json({
      success: true,
      data: { items, media, policyRules, policyName, policyId, clientName, categories }
    })
  } catch (error) {
    console.error('priceList GET / error:', error)
    return c.json({ success: false, error: '단가표 조회 실패' }, 500)
  }
})

// ============================================================================
// 정책 CRUD
// ============================================================================

// GET /policies — 정책 목록
priceListRouter.get('/policies', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT p.*, COUNT(r.id) as rule_count,
             (SELECT COUNT(*) FROM clients WHERE price_policy_id = p.id) as client_count
      FROM price_policies p
      LEFT JOIN price_policy_rules r ON r.policy_id = p.id
      WHERE p.is_active = 1
      GROUP BY p.id
      ORDER BY p.is_default DESC, p.name
    `).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({ success: false, error: '정책 목록 조회 실패' }, 500)
  }
})

// POST /policies — 정책 생성
priceListRouter.post('/policies', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { name, description } = await c.req.json<{ name: string; description?: string }>()
    if (!name?.trim()) return c.json({ success: false, error: '정책명은 필수입니다.' }, 400)

    const result = await c.env.DB.prepare(
      'INSERT INTO price_policies (name, description) VALUES (?, ?)'
    ).bind(name.trim(), description || null).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error) {
    return c.json({ success: false, error: '정책 생성 실패' }, 500)
  }
})

// GET /policies/:id — 정책 상세 + 규칙
priceListRouter.get('/policies/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const policy = await c.env.DB.prepare(
      'SELECT * FROM price_policies WHERE id = ?'
    ).bind(id).first()
    if (!policy) return c.json({ success: false, error: '정책을 찾을 수 없습니다.' }, 404)

    const { results: rules } = await c.env.DB.prepare(`
      SELECT r.*, i.item_name, i.item_code, i.specification
      FROM price_policy_rules r
      LEFT JOIN items i ON r.item_id = i.id
      WHERE r.policy_id = ?
      ORDER BY r.item_id NULLS LAST, r.category NULLS LAST, r.sort_order
    `).bind(id).all()

    return c.json({ success: true, data: { ...policy, rules } })
  } catch (error) {
    return c.json({ success: false, error: '정책 조회 실패' }, 500)
  }
})

// PUT /policies/:id — 정책 수정
priceListRouter.put('/policies/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const { name, description } = await c.req.json<{ name: string; description?: string }>()
    if (!name?.trim()) return c.json({ success: false, error: '정책명은 필수입니다.' }, 400)

    await c.env.DB.prepare(
      'UPDATE price_policies SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(name.trim(), description || null, id).run()

    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: '정책 수정 실패' }, 500)
  }
})

// DELETE /policies/:id — 정책 삭제 (기본 정책 제외)
priceListRouter.delete('/policies/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const policy = await c.env.DB.prepare(
      'SELECT is_default FROM price_policies WHERE id = ?'
    ).bind(id).first<{ is_default: number }>()
    if (policy?.is_default) return c.json({ success: false, error: '기본 정책은 삭제할 수 없습니다.' }, 400)

    // 해당 정책 사용 중인 거래처 → NULL로 변경
    await c.env.DB.prepare(
      'UPDATE clients SET price_policy_id = NULL WHERE price_policy_id = ?'
    ).bind(id).run()
    await c.env.DB.prepare('DELETE FROM price_policy_rules WHERE policy_id = ?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM price_policies WHERE id = ?').bind(id).run()

    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: '정책 삭제 실패' }, 500)
  }
})

// ============================================================================
// 규칙 CRUD
// ============================================================================

// PUT /policies/:id/rules — 규칙 일괄 저장 (삭제 후 재삽입)
priceListRouter.put('/policies/:id/rules', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const policyId = c.req.param('id')
    const { rules } = await c.req.json<{ rules: { category?: string; item_id?: number; rate_percent?: number; fixed_price?: number }[] }>()

    if (!Array.isArray(rules)) return c.json({ success: false, error: 'rules 배열이 필요합니다.' }, 400)

    const stmts: any[] = [
      c.env.DB.prepare('DELETE FROM price_policy_rules WHERE policy_id = ?').bind(policyId)
    ]
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i]
      if (!r.rate_percent && !r.fixed_price) continue
      stmts.push(c.env.DB.prepare(`
        INSERT INTO price_policy_rules (policy_id, category, item_id, rate_percent, fixed_price, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(policyId, r.category || null, r.item_id || null, r.rate_percent || 0, r.fixed_price || null, i))
    }
    stmts.push(c.env.DB.prepare(
      'UPDATE price_policies SET updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(policyId))
    await c.env.DB.batch(stmts)

    return c.json({ success: true })
  } catch (error) {
    console.error('rules save error:', error)
    return c.json({ success: false, error: '규칙 저장 실패' }, 500)
  }
})

// ============================================================================
// 단가 계산 유틸 (주문서 등에서 사용)
// ============================================================================

// GET /calculate — 특정 거래처+품목의 적용 단가 계산
priceListRouter.get('/calculate', async (c) => {
  try {
    const clientId = c.req.query('client_id')
    const itemId = c.req.query('item_id')
    if (!clientId || !itemId) return c.json({ success: false, error: 'client_id, item_id 필수' }, 400)

    const item = await c.env.DB.prepare(
      'SELECT id, base_price, sales_price, category FROM items WHERE id = ?'
    ).bind(itemId).first<{ id: number; base_price: number; sales_price: number; category: string }>()
    if (!item) return c.json({ success: false, error: '품목을 찾을 수 없습니다.' }, 404)

    const client = await c.env.DB.prepare(
      'SELECT price_policy_id FROM clients WHERE id = ?'
    ).bind(clientId).first<{ price_policy_id: number | null }>()

    const basePrice = item.sales_price || item.base_price || 0
    if (!client?.price_policy_id) {
      return c.json({ success: true, data: { price: basePrice, source: 'base' } })
    }

    interface PriceRule { category: string | null; item_id: number | null; rate_percent: number; fixed_price: number | null }
    const { results: rules } = await c.env.DB.prepare(`
      SELECT category, item_id, rate_percent, fixed_price
      FROM price_policy_rules WHERE policy_id = ?
    `).bind(client.price_policy_id).all<PriceRule>()

    // 우선순위: 품목별 고정가 > 품목별 할인 > 카테고리별 > 전체 기본
    const numItemId = Number(itemId)
    const itemFixed = rules.find((r) => r.item_id === numItemId && r.fixed_price != null)
    if (itemFixed) return c.json({ success: true, data: { price: itemFixed.fixed_price, source: 'item_fixed' } })

    const itemRate = rules.find((r) => r.item_id === numItemId && !r.fixed_price)
    if (itemRate) return c.json({ success: true, data: { price: Math.round(basePrice * (1 + itemRate.rate_percent / 100)), source: 'item_rate' } })

    const catRate = rules.find((r) => !r.item_id && r.category === item.category)
    if (catRate) return c.json({ success: true, data: { price: Math.round(basePrice * (1 + catRate.rate_percent / 100)), source: 'category_rate' } })

    const defaultRate = rules.find((r) => !r.item_id && !r.category)
    if (defaultRate) return c.json({ success: true, data: { price: Math.round(basePrice * (1 + defaultRate.rate_percent / 100)), source: 'default_rate' } })

    return c.json({ success: true, data: { price: basePrice, source: 'base' } })
  } catch (error) {
    return c.json({ success: false, error: '단가 계산 실패' }, 500)
  }
})

// ============================================================================
// 로고 설정
// ============================================================================
priceListRouter.get('/logo/:entityId', async (c) => {
  try {
    const entityId = c.req.param('entityId')
    const entity = await c.env.DB.prepare(
      'SELECT name, logo_base64, phone, fax, address, email FROM entities WHERE id = ?'
    ).bind(entityId).first<{ name: string; logo_base64: string | null; phone: string | null; fax: string | null; address: string | null; email: string | null }>()
    return c.json({ success: true, data: entity || {} })
  } catch (error) {
    return c.json({ success: false, error: '로고 조회 실패' }, 500)
  }
})

priceListRouter.put('/logo/:entityId', requireRole('ADMIN'), async (c) => {
  try {
    const entityId = c.req.param('entityId')
    const { logo_base64 } = await c.req.json<{ logo_base64: string }>()
    await c.env.DB.prepare(
      'UPDATE entities SET logo_base64 = ? WHERE id = ?'
    ).bind(logo_base64 || null, entityId).run()
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: '로고 저장 실패' }, 500)
  }
})

export default priceListRouter
