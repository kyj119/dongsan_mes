import { Hono } from 'hono'
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, getEntityId } from '../utils/entityFilter'

const priceListRouter = new Hono<HonoEnv>()
priceListRouter.use('/*', authMiddleware)

/**
 * #501 IDOR 가드: 요청 법인이 URL `:entityId`의 소유자인지 검증.
 * 위반 시 403 Response, 통과 시 null. ADMIN 전체모드(entityId=0)만 전 법인 접근 허용.
 * 로고·직인·회사정보·부서연락처는 법인 귀속 자산 — 타법인 열람/변조 차단.
 */
function entityParamGuard(c: Context<HonoEnv>): Response | null {
  const acting = getEntityId(c)
  if (acting === 0) return null // ADMIN 전체모드 = 전 법인 관리
  const param = Number(c.req.param('entityId'))
  if (!Number.isFinite(param) || param !== acting) {
    return c.json({ success: false, error: '해당 법인 정보에 접근 권한이 없습니다.' }, 403)
  }
  return null
}

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
      ORDER BY item_type, category, item_name, specification, id
    `).all()

    const media: any[] = []  // 소재(print_media) 폐기 — 단가표 소재 export 제거

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
          ORDER BY item_id IS NULL, item_id, category IS NULL, category, id
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
    const ef = entityFilter(c, 'p')
    const { results } = await c.env.DB.prepare(`
      SELECT p.*, COUNT(r.id) as rule_count,
             (SELECT COUNT(*) FROM clients WHERE price_policy_id = p.id) as client_count
      FROM price_policies p
      LEFT JOIN price_policy_rules r ON r.policy_id = p.id
      WHERE p.is_active = 1${ef.clause}
      GROUP BY p.id
      ORDER BY p.is_default DESC, p.name
    `).bind(...ef.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('priceList GET /policies error:', error)
    return c.json({ success: false, error: '정책 목록 조회 실패' }, 500)
  }
})

// POST /policies — 정책 생성
priceListRouter.post('/policies', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { name, description } = await c.req.json<{ name: string; description?: string }>()
    if (!name?.trim()) return c.json({ success: false, error: '정책명은 필수입니다.' }, 400)

    const result = await c.env.DB.prepare(
      'INSERT INTO price_policies (name, description, entity_id) VALUES (?, ?, ?)'
    ).bind(name.trim(), description || null, getEntityId(c) || 1).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error) {
    console.error('priceList POST /policies error:', error)
    return c.json({ success: false, error: '정책 생성 실패' }, 500)
  }
})

// GET /policies/:id — 정책 상세 + 규칙
priceListRouter.get('/policies/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c, '')
    const policy = await c.env.DB.prepare(
      `SELECT id, name, description, is_default, is_active, created_at, updated_at FROM price_policies WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first()
    if (!policy) return c.json({ success: false, error: '정책을 찾을 수 없습니다.' }, 404)

    const { results: rules } = await c.env.DB.prepare(`
      SELECT r.*, i.item_name, i.item_code, i.specification
      FROM price_policy_rules r
      LEFT JOIN items i ON r.item_id = i.id
      WHERE r.policy_id = ?
      ORDER BY r.item_id IS NULL, r.item_id, r.category IS NULL, r.category, r.sort_order, r.id
    `).bind(id).all()

    return c.json({ success: true, data: { ...policy, rules } })
  } catch (error) {
    console.error('priceList GET /policies/:id error:', error)
    return c.json({ success: false, error: '정책 조회 실패' }, 500)
  }
})

// PUT /policies/:id — 정책 수정
priceListRouter.put('/policies/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const { name, description } = await c.req.json<{ name: string; description?: string }>()
    if (!name?.trim()) return c.json({ success: false, error: '정책명은 필수입니다.' }, 400)

    const efUpd = entityFilter(c, '')
    await c.env.DB.prepare(
      `UPDATE price_policies SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?${efUpd.clause}`
    ).bind(name.trim(), description || null, id, ...efUpd.params).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('priceList PUT /policies/:id error:', error)
    return c.json({ success: false, error: '정책 수정 실패' }, 500)
  }
})

// DELETE /policies/:id — 정책 삭제 (기본 정책 제외)
priceListRouter.delete('/policies/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const efDel = entityFilter(c, '')
    const policy = await c.env.DB.prepare(
      `SELECT is_default FROM price_policies WHERE id = ?${efDel.clause}`
    ).bind(id, ...efDel.params).first<{ is_default: number }>()
    // 소유 검증 실패(타법인·미존재)는 404 — 예전엔 그대로 진행해 규칙 전량 삭제 + 거래처 연결 해제가 실행됐다(2026-09-03)
    if (!policy) return c.json({ success: false, error: '가격 정책을 찾을 수 없습니다.' }, 404)
    if (policy.is_default) return c.json({ success: false, error: '기본 정책은 삭제할 수 없습니다.' }, 400)

    // 소유 확인 뒤에만 — 거래처 연결 해제 + 규칙 + 헤더를 한 batch 로
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE clients SET price_policy_id = NULL WHERE price_policy_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM price_policy_rules WHERE policy_id = ?').bind(id),
      c.env.DB.prepare(`DELETE FROM price_policies WHERE id = ?${efDel.clause}`).bind(id, ...efDel.params),
    ])

    return c.json({ success: true })
  } catch (error) {
    console.error('priceList DELETE /policies/:id error:', error)
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

    // #451: 부모 정책 소유 검증 — 형제 GET/PUT/DELETE는 ef 격리인데 규칙 일괄저장만 누락이었음(타법인 단가규칙 변조 차단)
    const ef = entityFilter(c)
    const owner = await c.env.DB.prepare(`SELECT id FROM price_policies WHERE id = ?${ef.clause}`).bind(policyId, ...ef.params).first()
    if (!owner) return c.json({ success: false, error: '가격 정책을 찾을 수 없습니다.' }, 404)

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
    console.error('priceList GET /calculate error:', error)
    return c.json({ success: false, error: '단가 계산 실패' }, 500)
  }
})

// ============================================================================
// 로고 설정
// ============================================================================
priceListRouter.get('/logo/:entityId', async (c) => {
  try {
    const g = entityParamGuard(c); if (g) return g
    const entityId = c.req.param('entityId')
    const entity = await c.env.DB.prepare(
      'SELECT name, logo_base64, phone, fax, address, email FROM entities WHERE id = ?'
    ).bind(entityId).first<{ name: string; logo_base64: string | null; phone: string | null; fax: string | null; address: string | null; email: string | null }>()
    return c.json({ success: true, data: entity || {} })
  } catch (error) {
    console.error('priceList GET /logo/:entityId error:', error)
    return c.json({ success: false, error: '로고 조회 실패' }, 500)
  }
})

priceListRouter.put('/logo/:entityId', requireRole('ADMIN'), async (c) => {
  try {
    const g = entityParamGuard(c); if (g) return g
    const entityId = c.req.param('entityId')
    const { logo_base64 } = await c.req.json<{ logo_base64: string }>()
    await c.env.DB.prepare(
      'UPDATE entities SET logo_base64 = ? WHERE id = ?'
    ).bind(logo_base64 || null, entityId).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('priceList PUT /logo/:entityId error:', error)
    return c.json({ success: false, error: '로고 저장 실패' }, 500)
  }
})

// PUT /stamp/:entityId — 직인 저장 (PUT /logo 미러링, entities.stamp_base64)
priceListRouter.put('/stamp/:entityId', requireRole('ADMIN'), async (c) => {
  try {
    const g = entityParamGuard(c); if (g) return g
    const entityId = c.req.param('entityId')
    const { stamp_base64 } = await c.req.json<{ stamp_base64: string | null }>()
    await c.env.DB.prepare(
      'UPDATE entities SET stamp_base64 = ? WHERE id = ?'
    ).bind(stamp_base64 || null, entityId).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('priceList PUT /stamp/:entityId error:', error)
    return c.json({ success: false, error: '직인 저장 실패' }, 500)
  }
})

// ============================================================================
// 회사 인쇄 정보 (인쇄 헤더 통합: 로고·직인·부서연락처·웹하드) — Phase 2/3
// entityId는 라우트 param(멀티법인 인쇄 지원). 기존 /logo/:entityId 패턴과 동일.
// ============================================================================

// GET /company/:entityId — 인쇄 헤더 통합 블록 (Phase 3 인쇄가 소비)
priceListRouter.get('/company/:entityId', async (c) => {
  try {
    const g = entityParamGuard(c); if (g) return g
    const entityId = c.req.param('entityId')
    const entity = await c.env.DB.prepare(
      'SELECT name, logo_base64, stamp_base64, address, email, phone, fax, webhard_url FROM entities WHERE id = ?'
    ).bind(entityId).first<Record<string, unknown>>()
    if (!entity) return c.json({ success: false, error: '법인을 찾을 수 없습니다.' }, 404)
    const { results: contacts } = await c.env.DB.prepare(
      'SELECT id, department, person_name, phone, fax FROM entity_contacts WHERE entity_id = ? ORDER BY sort_order, id'
    ).bind(entityId).all()
    return c.json({ success: true, data: { ...entity, contacts } })
  } catch (error) {
    console.error('priceList GET /company error:', error)
    return c.json({ success: false, error: '회사 정보 조회 실패' }, 500)
  }
})

// PUT /company/:entityId — 웹하드 주소 저장 (ADMIN)
priceListRouter.put('/company/:entityId', requireRole('ADMIN'), async (c) => {
  try {
    const g = entityParamGuard(c); if (g) return g
    const entityId = c.req.param('entityId')
    const { webhard_url } = await c.req.json<{ webhard_url?: string }>()
    await c.env.DB.prepare(
      'UPDATE entities SET webhard_url = ? WHERE id = ?'
    ).bind(webhard_url?.trim() || null, entityId).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('priceList PUT /company/:entityId error:', error)
    return c.json({ success: false, error: '웹하드 주소 저장 실패' }, 500)
  }
})

// GET /company/:entityId/contacts — 부서별 연락처 목록
priceListRouter.get('/company/:entityId/contacts', async (c) => {
  try {
    const g = entityParamGuard(c); if (g) return g
    const entityId = c.req.param('entityId')
    const { results } = await c.env.DB.prepare(
      'SELECT id, entity_id, department, person_name, phone, fax, sort_order FROM entity_contacts WHERE entity_id = ? ORDER BY sort_order, id'
    ).bind(entityId).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('priceList GET /company/:entityId/contacts error:', error)
    return c.json({ success: false, error: '부서 연락처 조회 실패' }, 500)
  }
})

// POST /company/:entityId/contacts — 추가 (ADMIN)
priceListRouter.post('/company/:entityId/contacts', requireRole('ADMIN'), async (c) => {
  try {
    const g = entityParamGuard(c); if (g) return g
    const entityId = c.req.param('entityId')
    const b = await c.req.json<{ department?: string; person_name?: string; phone?: string; fax?: string; sort_order?: number }>()
    if (!b.department?.trim()) return c.json({ success: false, error: '부서명은 필수입니다.' }, 400)
    const result = await c.env.DB.prepare(
      'INSERT INTO entity_contacts (entity_id, department, person_name, phone, fax, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(entityId, b.department.trim(), b.person_name?.trim() || null, b.phone?.trim() || null, b.fax?.trim() || null, b.sort_order || 0).run()
    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error) {
    console.error('priceList POST /company/:entityId/contacts error:', error)
    return c.json({ success: false, error: '부서 연락처 추가 실패' }, 500)
  }
})

// PUT /company/:entityId/contacts/:cid — 수정 (ADMIN)
priceListRouter.put('/company/:entityId/contacts/:cid', requireRole('ADMIN'), async (c) => {
  try {
    const g = entityParamGuard(c); if (g) return g
    const entityId = c.req.param('entityId')
    const cid = c.req.param('cid')
    const b = await c.req.json<{ department?: string; person_name?: string; phone?: string; fax?: string; sort_order?: number }>()
    if (!b.department?.trim()) return c.json({ success: false, error: '부서명은 필수입니다.' }, 400)
    await c.env.DB.prepare(
      'UPDATE entity_contacts SET department = ?, person_name = ?, phone = ?, fax = ?, sort_order = ? WHERE id = ? AND entity_id = ?'
    ).bind(b.department.trim(), b.person_name?.trim() || null, b.phone?.trim() || null, b.fax?.trim() || null, b.sort_order || 0, cid, entityId).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('priceList PUT /company/:entityId/contacts/:cid error:', error)
    return c.json({ success: false, error: '부서 연락처 수정 실패' }, 500)
  }
})

// DELETE /company/:entityId/contacts/:cid — 삭제 (ADMIN)
priceListRouter.delete('/company/:entityId/contacts/:cid', requireRole('ADMIN'), async (c) => {
  try {
    const g = entityParamGuard(c); if (g) return g
    const entityId = c.req.param('entityId')
    const cid = c.req.param('cid')
    await c.env.DB.prepare(
      'DELETE FROM entity_contacts WHERE id = ? AND entity_id = ?'
    ).bind(cid, entityId).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('priceList DELETE /company/:entityId/contacts/:cid error:', error)
    return c.json({ success: false, error: '부서 연락처 삭제 실패' }, 500)
  }
})

export default priceListRouter
