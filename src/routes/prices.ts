import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter } from '../utils/entityFilter'

// ---------- D1 row shapes ----------
interface RecentPurchaseRow {
  unit_price: number
  order_date: string
  po_number: string
}
interface RecentSalesRow {
  unit_price: number
  order_date: string
  order_number: string
}
interface BasePriceRow { base_price: number }
interface AdjustmentRow { adjustment_percent: number }
interface PriceRow { price: number }
interface ClientItemPriceRow {
  id: number; client_id: number; item_id: number; price: number; notes: string | null
  created_at: string; updated_at: string
  item_name: string; item_code: string; unit: string; base_price: number
}
interface RecentTransactionRow {
  item_id: number; unit_price: number; order_date: string
}
interface ItemRow {
  id: number; item_code: string; item_name: string; unit: string; base_price: number
}
interface SupplierPriceRow {
  id: number; client_id: number; item_id: number; price: number; notes: string | null
  created_at: string; updated_at: string
  client_name: string; client_code: string
}
interface RecentPriceRow { unit_price: number; order_date: string }

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
        `).bind(item_id, client_id).first<RecentPurchaseRow>()

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
        `).bind(item_id, client_id).first<RecentSalesRow>()

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
    `).bind(item_id).first<BasePriceRow>()

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
        `).bind(client_id).first<AdjustmentRow>()

        if (plData && baseItem && baseItem.base_price != null) {
          const adjusted = baseItem.base_price * (1 + plData.adjustment_percent / 100)
          details.matched = Math.round(adjusted)
        }
      } else if (context === 'purchase') {
        const matched = await c.env.DB.prepare(`
          SELECT price FROM client_item_prices WHERE client_id = ? AND item_id = ?
        `).bind(client_id, item_id).first<PriceRow>()

        if (matched) {
          details.matched = matched.price
        }
      } else {
        // context 없이 client_id만 있는 경우: client_item_prices 폴백
        const matched = await c.env.DB.prepare(`
          SELECT price FROM client_item_prices WHERE client_id = ? AND item_id = ?
        `).bind(client_id, item_id).first<PriceRow>()

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

    const { results } = await c.env.DB.prepare(query).bind(...params).all<ClientItemPriceRow>()

    // 최근 거래 단가 일괄 조회 (N+1 → 2쿼리)
    const itemIds = results.map((r) => r.item_id)
    const purchaseMap: Record<number, { unit_price: number; order_date: string }> = {}
    const salesMap: Record<number, { unit_price: number; order_date: string }> = {}

    if (itemIds.length > 0) {
      const ph = itemIds.map(() => '?').join(',')

      // 매입 최근 거래 (품목별 최신 1건)
      const efPo = entityFilter(c, 'po')
      const { results: purchaseRows } = await c.env.DB.prepare(`
        SELECT poi.item_id, poi.unit_price, po.order_date
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.po_id = po.id
        WHERE poi.item_id IN (${ph}) AND po.supplier_id = ? AND po.status != 'CANCELLED'${efPo.clause}
          AND po.order_date = (
            SELECT MAX(po2.order_date) FROM purchase_orders po2
            JOIN purchase_order_items poi2 ON poi2.po_id = po2.id
            WHERE poi2.item_id = poi.item_id AND po2.supplier_id = po.supplier_id AND po2.status != 'CANCELLED'
          )
        GROUP BY poi.item_id
      `).bind(...itemIds, client_id, ...efPo.params).all<RecentTransactionRow>()
      for (const r of purchaseRows) {
        purchaseMap[r.item_id] = { unit_price: r.unit_price, order_date: r.order_date }
      }

      // 매출 최근 거래 (품목별 최신 1건)
      const efO = entityFilter(c, 'o')
      const { results: salesRows } = await c.env.DB.prepare(`
        SELECT oi.item_id, oi.unit_price, o.order_date
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE oi.item_id IN (${ph}) AND o.client_id = ? AND o.status != 'CANCELLED'${efO.clause}
          AND o.order_date = (
            SELECT MAX(o2.order_date) FROM orders o2
            JOIN order_items oi2 ON oi2.order_id = o2.id
            WHERE oi2.item_id = oi.item_id AND o2.client_id = o.client_id AND o2.status != 'CANCELLED'
          )
        GROUP BY oi.item_id
      `).bind(...itemIds, client_id, ...efO.params).all<RecentTransactionRow>()
      for (const r of salesRows) {
        salesMap[r.item_id] = { unit_price: r.unit_price, order_date: r.order_date }
      }
    }

    const enriched = results.map((row) => {
      const purchase = purchaseMap[row.item_id]
      const sales = salesMap[row.item_id]
      let recent_price: number | null = null
      let recent_date: string | null = null

      if (purchase && sales) {
        if (purchase.order_date >= sales.order_date) {
          recent_price = purchase.unit_price; recent_date = purchase.order_date
        } else {
          recent_price = sales.unit_price; recent_date = sales.order_date
        }
      } else if (purchase) {
        recent_price = purchase.unit_price; recent_date = purchase.order_date
      } else if (sales) {
        recent_price = sales.unit_price; recent_date = sales.order_date
      }
      return { ...row, recent_price, recent_date }
    })

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
    `).bind(item_id).first<ItemRow>()

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
    `).bind(item_id).all<SupplierPriceRow>()

    // Enrich with recent purchase prices
    const enriched = await Promise.all(
      results.map(async (row) => {
        const recentPurchase = await c.env.DB.prepare(`
          SELECT poi.unit_price, po.order_date
          FROM purchase_order_items poi
          JOIN purchase_orders po ON poi.po_id = po.id
          WHERE poi.item_id = ? AND po.supplier_id = ? AND po.status != 'CANCELLED'
          ORDER BY po.order_date DESC, po.id DESC
          LIMIT 1
        `).bind(item_id, row.client_id).first<RecentPriceRow>()

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