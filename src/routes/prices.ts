import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const pricesRouter = new Hono<HonoEnv>()

pricesRouter.use('/*', authMiddleware)

// GET / — 단가 조회 (price-lookup)
// 쿼리 파라미터: item_id, client_id, context (purchase|sales)
pricesRouter.get('/', async (c) => {
  try {
    const { item_id, client_id, context } = c.req.query()

    if (!item_id) {
      return c.json({ success: false, error: 'item_id is required' }, 400)
    }

    const details: {
      recent: { price: number; date: string; reference: string } | null
      matched: number | null
      base: number | null
    } = { recent: null, matched: null, base: null }

    // 1순위: 최근 거래 단가
    if (client_id && context) {
      if (context === 'purchase') {
        const recentPurchase = await c.env.DB.prepare(`
          SELECT poi.unit_price, po.order_date, po.po_number
          FROM purchase_order_items poi
          JOIN purchase_orders po ON poi.po_id = po.id
          WHERE poi.item_id = ? AND po.supplier_id = ? AND po.status != 'CANCELLED'
          ORDER BY po.order_date DESC, po.id DESC
          LIMIT 1
        `).bind(item_id, client_id).first() as any

        if (recentPurchase) {
          details.recent = {
            price: recentPurchase.unit_price,
            date: recentPurchase.order_date,
            reference: recentPurchase.po_number
          }
        }
      } else if (context === 'sales') {
        const recentSales = await c.env.DB.prepare(`
          SELECT oi.unit_price, o.order_date, o.order_number
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          WHERE oi.item_id = ? AND o.client_id = ? AND o.status != 'CANCELLED'
          ORDER BY o.order_date DESC, o.id DESC
          LIMIT 1
        `).bind(item_id, client_id).first() as any

        if (recentSales) {
          details.recent = {
            price: recentSales.unit_price,
            date: recentSales.order_date,
            reference: recentSales.order_number
          }
        }
      }
    }

    // 3순위 기반: 품목 기본 단가 (먼저 조회 — 단가표 계산에 필요)
    const baseItem = await c.env.DB.prepare(`
      SELECT base_price FROM items WHERE id = ?
    `).bind(item_id).first() as any

    if (baseItem) {
      details.base = baseItem.base_price
    }

    // 2순위: 거래처-품목 매칭 단가
    // - sales: 단가표(price_list) 기반 계산
    // - purchase: client_item_prices 테이블 직접 조회
    if (client_id) {
      if (context === 'sales') {
        const plData = await c.env.DB.prepare(`
          SELECT pl.adjustment_percent
          FROM clients c
          JOIN price_lists pl ON c.price_list_id = pl.id
          WHERE c.id = ?
        `).bind(client_id).first() as any

        if (plData && baseItem && baseItem.base_price != null) {
          const adjusted = baseItem.base_price * (1 + plData.adjustment_percent / 100)
          details.matched = Math.round(adjusted)
        }
      } else if (context === 'purchase') {
        const matched = await c.env.DB.prepare(`
          SELECT price FROM client_item_prices WHERE client_id = ? AND item_id = ?
        `).bind(client_id, item_id).first() as any

        if (matched) {
          details.matched = matched.price
        }
      } else {
        // context 없이 client_id만 있는 경우: client_item_prices 폴백
        const matched = await c.env.DB.prepare(`
          SELECT price FROM client_item_prices WHERE client_id = ? AND item_id = ?
        `).bind(client_id, item_id).first() as any

        if (matched) {
          details.matched = matched.price
        }
      }
    }

    // 최종 단가 결정 (우선순위: recent > matched > base)
    let suggested_price: number | null = null
    let price_source: string = 'none'

    if (details.recent !== null) {
      suggested_price = details.recent.price
      price_source = 'recent_transaction'
    } else if (details.matched !== null) {
      suggested_price = details.matched
      price_source = context === 'sales' ? 'price_list' : 'client_item_price'
    } else if (details.base !== null) {
      suggested_price = details.base
      price_source = 'base_price'
    }

    return c.json({
      suggested_price,
      price_source,
      details
    })
  } catch (error) {
    console.error('src/routes/prices.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /client-item-prices — 거래처별 매칭 단가 목록
// 쿼리 파라미터: client_id (필수), search (선택, 품목명 검색)
pricesRouter.get('/client-item-prices', async (c) => {
  try {
    const { client_id, search } = c.req.query()

    if (!client_id) {
      return c.json({ success: false, error: 'client_id is required' }, 400)
    }

    let query = `
      SELECT cip.id, cip.client_id, cip.item_id, cip.price, cip.notes,
             cip.created_at, cip.updated_at,
             i.item_name, i.item_code, i.unit, i.base_price
      FROM client_item_prices cip
      JOIN items i ON cip.item_id = i.id
      WHERE cip.client_id = ?
    `
    const params: (string | number)[] = [client_id]

    if (search) {
      query += ' AND i.item_name LIKE ?'
      params.push(`%${search}%`)
    }

    query += ' ORDER BY i.item_name'

    const { results } = await c.env.DB.prepare(query).bind(...params).all() as { results: any[] }

    // 각 품목에 대해 최근 거래 단가 조회 (구매/판매 모두 확인하여 더 최근 것 사용)
    const enriched = await Promise.all(
      results.map(async (row: any) => {
        let recent_price: number | null = null
        let recent_date: string | null = null

        // 매입 최근 거래
        const recentPurchase = await c.env.DB.prepare(`
          SELECT poi.unit_price, po.order_date
          FROM purchase_order_items poi
          JOIN purchase_orders po ON poi.po_id = po.id
          WHERE poi.item_id = ? AND po.supplier_id = ? AND po.status != 'CANCELLED'
          ORDER BY po.order_date DESC, po.id DESC
          LIMIT 1
        `).bind(row.item_id, client_id).first() as any

        // 매출 최근 거래
        const recentSales = await c.env.DB.prepare(`
          SELECT oi.unit_price, o.order_date
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          WHERE oi.item_id = ? AND o.client_id = ? AND o.status != 'CANCELLED'
          ORDER BY o.order_date DESC, o.id DESC
          LIMIT 1
        `).bind(row.item_id, client_id).first() as any

        // 더 최근 거래 선택
        if (recentPurchase && recentSales) {
          if (recentPurchase.order_date >= recentSales.order_date) {
            recent_price = recentPurchase.unit_price
            recent_date = recentPurchase.order_date
          } else {
            recent_price = recentSales.unit_price
            recent_date = recentSales.order_date
          }
        } else if (recentPurchase) {
          recent_price = recentPurchase.unit_price
          recent_date = recentPurchase.order_date
        } else if (recentSales) {
          recent_price = recentSales.unit_price
          recent_date = recentSales.order_date
        }

        return {
          ...row,
          recent_price,
          recent_date
        }
      })
    )

    return c.json({
      prices: enriched
    })
  } catch (error) {
    console.error('src/routes/prices.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /item-supplier-prices — 품목 기준 공급업체별 단가 목록
pricesRouter.get('/item-supplier-prices', async (c) => {
  try {
    const { item_id } = c.req.query()

    if (!item_id) {
      return c.json({ success: false, error: 'item_id is required' }, 400)
    }

    // Get item info
    const item = await c.env.DB.prepare(`
      SELECT id, item_code, item_name, unit, base_price FROM items WHERE id = ?
    `).bind(item_id).first() as any

    if (!item) {
      return c.json({ success: false, error: 'Item not found' }, 404)
    }

    // Get all supplier prices for this item
    const { results } = await c.env.DB.prepare(`
      SELECT cip.id, cip.client_id, cip.item_id, cip.price, cip.notes,
             cip.created_at, cip.updated_at,
             c.client_name, c.client_code
      FROM client_item_prices cip
      JOIN clients c ON cip.client_id = c.id
      WHERE cip.item_id = ?
      ORDER BY cip.price ASC
    `).bind(item_id).all() as { results: any[] }

    // Enrich with recent purchase prices
    const enriched = await Promise.all(
      results.map(async (row: any) => {
        const recentPurchase = await c.env.DB.prepare(`
          SELECT poi.unit_price, po.order_date
          FROM purchase_order_items poi
          JOIN purchase_orders po ON poi.po_id = po.id
          WHERE poi.item_id = ? AND po.supplier_id = ? AND po.status != 'CANCELLED'
          ORDER BY po.order_date DESC, po.id DESC
          LIMIT 1
        `).bind(item_id, row.client_id).first() as any

        return {
          ...row,
          recent_price: recentPurchase ? recentPurchase.unit_price : null,
          recent_date: recentPurchase ? recentPurchase.order_date : null
        }
      })
    )

    return c.json({
      item: {
        id: item.id,
        item_code: item.item_code,
        item_name: item.item_name,
        unit: item.unit,
        base_price: item.base_price
      },
      suppliers: enriched
    })
  } catch (error) {
    console.error('src/routes/prices.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /client-item-prices — 매칭 단가 설정 (upsert)
// Body: { client_id, item_id, price, notes? }
pricesRouter.post('/client-item-prices', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json()
    const { client_id, item_id, price, notes } = body

    if (!client_id || !item_id || price === undefined || price === null) {
      return c.json({
        success: false,
        error: 'client_id, item_id, price are required'
      }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO client_item_prices (client_id, item_id, price, notes)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(client_id, item_id) DO UPDATE SET
        price = excluded.price,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP
    `).bind(client_id, item_id, price, notes ?? null).run()

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id },
      message: '단가가 저장되었습니다.'
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// DELETE /client-item-prices/:id — 매칭 단가 삭제
pricesRouter.delete('/client-item-prices/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')

    const existing = await c.env.DB.prepare(
      'SELECT id FROM client_item_prices WHERE id = ?'
    ).bind(id).first()

    if (!existing) {
      return c.json({ success: false, error: 'Price entry not found' }, 404)
    }

    await c.env.DB.prepare(
      'DELETE FROM client_item_prices WHERE id = ?'
    ).bind(id).run()

    return c.json({
      success: true
    })
  } catch (error) {
    console.error('src/routes/prices.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

export default pricesRouter