import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware } from '../middleware/auth'
import { entityFilter, getEntityId } from '../utils/entityFilter'

const searchRouter = new Hono<HonoEnv>()
searchRouter.use('/*', authMiddleware)

// Global search across orders, clients, cards
searchRouter.get('/', async (c) => {
  try {
    const { q = '' } = c.req.query()
    if (!q || q.length < 2) {
      return c.json({ success: true, data: { orders: [], clients: [], cards: [], quotations: [] } })
    }

    const pattern = `%${q}%`
    const ef = entityFilter(c, 'o')
    const qEf = entityFilter(c, 'q') // G-7: 견적서 검색

    // Cards use requesting_entity_id
    const entityId = getEntityId(c)
    let cardClause = ''
    let cardParams: number[] = []
    if (entityId > 0) { cardClause = ' AND ca.requesting_entity_id = ?'; cardParams = [entityId] }

    const [orders, clients, cards, quotations] = await Promise.all([
      c.env.DB.prepare(`
        SELECT o.id, o.order_number, o.status, o.final_amount, c.client_name, o.delivery_date
        FROM orders o
        LEFT JOIN clients c ON o.client_id = c.id
        WHERE (o.order_number LIKE ? OR c.client_name LIKE ?)
          AND o.status != 'CANCELLED'
          ${ef.clause}
        ORDER BY o.created_at DESC
        LIMIT 20
      `).bind(pattern, pattern, ...ef.params).all(),

      c.env.DB.prepare(`
        -- X5: 폐기 clients.balance 캐시 제거(검색 힌트가 stale 0). 미수금 정본=거래처 상세/미수금(파생)
        SELECT id, client_code, client_name
        FROM clients
        WHERE (client_name LIKE ? OR client_code LIKE ?)
          AND is_active = 1
        ORDER BY client_name ASC
        LIMIT 20
      `).bind(pattern, pattern).all(),

      c.env.DB.prepare(`
        SELECT ca.id, ca.card_number, ca.status, c.client_name, ca.delivery_date
        FROM cards ca
        LEFT JOIN orders o ON ca.order_id = o.id
        LEFT JOIN clients c ON o.client_id = c.id
        WHERE (ca.card_number LIKE ? OR c.client_name LIKE ?)
          AND ca.status NOT IN ('CANCELLED')
          ${cardClause}
        ORDER BY ca.created_at DESC
        LIMIT 20
      `).bind(pattern, pattern, ...cardParams).all(),

      // G-7: 견적서 검색 (매입/품목 무관)
      c.env.DB.prepare(`
        SELECT q.id, q.quotation_number, q.status, c.client_name, q.valid_until
        FROM quotations q
        LEFT JOIN clients c ON q.client_id = c.id
        WHERE (q.quotation_number LIKE ? OR c.client_name LIKE ?)
          ${qEf.clause}
        ORDER BY q.created_at DESC
        LIMIT 20
      `).bind(pattern, pattern, ...qEf.params).all(),
    ])

    return c.json({
      success: true,
      data: {
        orders: orders.results || [],
        clients: clients.results || [],
        cards: cards.results || [],
        quotations: quotations.results || [],
      }
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

export default searchRouter
