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
    const { item_id, client_id, context, width, height } = c.req.query()

    if (!item_id) {
      return c.json({ success: false, error: 'item_id is required' }, 400)
    }

    // ★제안을 아예 하지 않는 품목이 있다 — 주문제작이라 예측이 성립하지 않는 계열.
    //   채널간판은 287라인 60거래처에 장당 12,000~9,400,000원(783배)이고 규격이 적힌 라인이 14% 뿐이다.
    //   직전가 중앙오차 59% · **2배 이상 빗나감 23%** — 규격을 맞춰도 57.7% 로 안 나아진다.
    //   틀린 값을 채워 두면 「검토했다」는 착시를 주므로 빈칸이 낫다(`items.price_suggest = 0`).
    const suggestRow = await c.env.DB.prepare(
      'SELECT COALESCE(price_suggest, 1) AS ok FROM items WHERE id = ?'
    ).bind(item_id).first<{ ok: number }>()
    if (suggestRow && !suggestRow.ok) {
      return c.json({
        suggested_price: null,
        price_source: 'suppressed',
        details: { recent: null, matched: null, base: null },
      })
    }

    const details: {
      recent: { price: number; date: string; reference: string } | null
      matched: number | null
      base: number | null
    } = { recent: null, matched: null, base: null }

    // 1순위: 최근 거래 단가
    if (client_id && context) {
      if (context === 'purchase') {
        const efPurchase = entityFilter(c, 'po')
        const recentPurchase = await c.env.DB.prepare(`
          SELECT poi.unit_price, po.order_date, po.po_number
          FROM purchase_order_items poi
          JOIN purchase_orders po ON poi.po_id = po.id
          WHERE poi.item_id = ? AND po.supplier_id = ? AND po.status != 'CANCELLED'${efPurchase.clause}
          ORDER BY po.order_date DESC, po.id DESC
          LIMIT 1
        `).bind(item_id, client_id, ...efPurchase.params).first<RecentPurchaseRow>()

        if (recentPurchase) {
          details.recent = {
            price: recentPurchase.unit_price,
            date: recentPurchase.order_date,
            reference: recentPurchase.po_number
          }
        }
      } else if (context === 'sales') {
        const efSales = entityFilter(c, 'o')
        // ★AREA 품목의 최근 단가는 `unit_price` 를 그대로 믿으면 안 된다 (2026-08-11 실측).
        //   이카운트 이관분 13,461건 중 **13,452건(99.9%)이 `amount = unit_price × quantity`**,
        //   즉 unit_price 에 ㎡ 단가가 아니라 **장당 금액**이 들어 있다(items 는 AREA 인데도).
        //   그대로 제안하면 화면이 그 값을 ㎡ 단가로 곱해 600×90 짜리가 8,000 → 48,000원이 된다(6배).
        //   ⇒ 금액에서 되나눈다: amount ÷ (청구면적 × 수량).
        //      이관분은 올바른 ㎡ 단가로 환산되고, 신규분은 amount 자체가 단가×면적×수량이라 원값이 복원된다.
        //      청구면적 = 10cm 올림 + 최소 1m — utils/orderLineAmount.ts billingSide() 와 같은 규칙.
        const AREA_UNIT_PRICE_SQL = `
          CASE WHEN i.pricing_method = 'AREA'
                    AND COALESCE(oi.width, 0)  > 0
                    AND COALESCE(oi.height, 0) > 0
                    AND COALESCE(oi.quantity, 0) > 0
                    AND oi.amount <> 0
               THEN oi.amount / (
                      (MAX(CAST((oi.width  + 9) / 10 AS INT) * 10, 100) / 100.0)
                    * (MAX(CAST((oi.height + 9) / 10 AS INT) * 10, 100) / 100.0)
                    * oi.quantity )
               ELSE oi.unit_price END`
        // ★AREA 품목인데 **규격이 없는 라인은 아예 빼야 한다**(2026-09-04 실측).
        //   위 CASE 는 규격이 없으면 `ELSE oi.unit_price` 로 떨어지는데, 그 값은 ㎡단가가 아니라
        //   **장당금액**이다(이관분은 `unit_price = amount ÷ quantity` 로 들어온다).
        //   그대로 최근가로 내보내면 화면이 ㎡단가로 받아 곱한다 —
        //   실측 피해: (주)애니룩스 수성 현수막 제안가 **18,000원/㎡**(근거 E1-20260831-I002, 규격 없는 라인).
        //   같은 품목 두용기획 1,556 · 선명커뮤니케이션 1,700 이 정상값이다. 3개월 평균도 8,408 로 부풀어 있었다.
        //   원천(이카운트 판매현황)에도 규격이 비어 있어 복구가 불가하므로 **제외가 유일한 처리**다.
        //   규모 = AREA 라인 15,949건 중 331건(2.1%) — `python scripts/price-table.py --audit` 로 상시 확인.
        // ⚠️ 3x6·4x8 은 cm 가 아니라 **자(尺)** 판재 규격이 잘못 저장된 것이다(포맥스 계열 18건).
        //    cm 로 보면 청구면적이 최소 1㎡ 로 뭉개져 역시 장당금액이 된다 → 같이 뺀다.
        // ⚠️ 20m 초과 대형은 **정상이다**(42m×24m 건물 랩핑·113m 매쉬). 이상치로 걸러내지 말 것 —
        //    ㎡단가가 3,040~3,563원으로 오히려 일관된다.
        const AREA_USABLE_SQL = `(
             i.pricing_method <> 'AREA'
          OR (COALESCE(oi.width, 0) > 0 AND COALESCE(oi.height, 0) > 0
              AND NOT (oi.width <= 10 AND oi.height <= 10))
        )`
        // ★규격이 같은 직전가를 **먼저** 찾는다 (2026-09-05 백테스트).
        //   2026년 전 라인을 날짜순으로 재생해 실제로 제안했을 값을 채점한 결과:
        //     거래처+품목       → 중앙오차 4.6% · ±10% 57%
        //     거래처+품목+규격  → **중앙오차 0.0%** · ±10% 73% (전체의 56% 에서 성립)
        //     폴백 포함 실효    → 4.6% → **2.1%**, ±10% 57% → 62%
        //   같은 거래처가 같은 품목을 **같은 크기**로 다시 시키면 값이 그냥 같기 때문이다.
        //   수량대를 조건에 넣는 것은 이득이 거의 없었다(4.6% → 4.2%) — 축은 수량이 아니라 규격이다.
        //   효과는 지금 나쁜 품목에 정확히 몰린다:
        //     전사 깃발 폰지 17.1% → 0.0% · 수성 패트 6.7% → 0.0% · 수성 현수막 20.0% → 11.1%
        //   ⚠️ 폴백은 반드시 남긴다 — 규격 일치 이력이 없는 44% 는 기존 동작이 최선이다.
        //   재측정 = `python scripts/price-match-audit.py`
        const wNum = Number(width) || 0
        const hNum = Number(height) || 0
        const RECENT_SQL = (specMatch: boolean) => `
          SELECT ROUND(${AREA_UNIT_PRICE_SQL}) AS unit_price, o.order_date, o.order_number
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          JOIN items i  ON i.id = oi.item_id
          WHERE oi.item_id = ? AND o.client_id = ? AND o.status != 'CANCELLED'
            AND ${AREA_USABLE_SQL}${specMatch ? ' AND oi.width = ? AND oi.height = ?' : ''}${efSales.clause}
          ORDER BY o.order_date DESC, o.id DESC
          LIMIT 1`

        let recentSales: RecentSalesRow | null = null
        let recentBySpec = false
        if (wNum > 0 && hNum > 0) {
          recentSales = await c.env.DB.prepare(RECENT_SQL(true))
            .bind(item_id, client_id, wNum, hNum, ...efSales.params).first<RecentSalesRow>()
          recentBySpec = !!recentSales
        }
        if (!recentSales) {
          recentSales = await c.env.DB.prepare(RECENT_SQL(false))
            .bind(item_id, client_id, ...efSales.params).first<RecentSalesRow>()
        }

        if (recentSales) {
          details.recent = {
            price: recentSales.unit_price,
            date: recentSales.order_date,
            reference: recentSales.order_number
          }
          ;(details as any).recent_by_spec = recentBySpec
        }

        // #75: 3개월 평균 판매단가 (전체 거래처 대상, 원가 미노출)
        //   AREA 환산은 위 recent 와 같은 이유로 필수 — 안 하면 평균이 장당금액과 ㎡단가의 뒤섞임이 된다.
        const avg3m = await c.env.DB.prepare(`
          SELECT ROUND(AVG(${AREA_UNIT_PRICE_SQL})) as avg_price, COUNT(*) as tx_count
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          JOIN items i  ON i.id = oi.item_id
          WHERE oi.item_id = ? AND o.status NOT IN ('CANCELLED','DRAFT')
            AND o.order_date >= date('now', '-3 months')
            AND ${AREA_USABLE_SQL}${efSales.clause}
        `).bind(item_id, ...efSales.params).first<{ avg_price: number | null; tx_count: number }>()

        if (avg3m && avg3m.avg_price && avg3m.tx_count > 0) {
          ;(details as any).avg_3month = {
            price: avg3m.avg_price,
            count: avg3m.tx_count,
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
        // ★특약가를 **쓰기만 하고 읽지 않고 있었다**(2026-09-05 발견).
        //   주문서의 「이 거래처 기본 단가로 저장할까요?」(`orderForm/parent.js` onUnitPriceManualChange)가
        //   `POST /api/prices/client-item-prices` 로 `client_item_prices` 에 쓰는데,
        //   판매 조회는 `price_lists`(조정률)만 봐서 그 값이 되돌아오지 않았다.
        //   → 특약가 우선, 없으면 기존 단가표 조정률. 고리를 끊지 말고 잇는다.
        //   ⚠️두 테이블 다 현재 prod 0건이다(`price_lists` 도 UI 가 있으나 미사용).
        //     그래도 지우지 않는 이유 = 쓰기 경로가 살아 있고, 전환 후 채워질 자리이기 때문.
        const cip = await c.env.DB.prepare(
          'SELECT price FROM client_item_prices WHERE client_id = ? AND item_id = ?'
        ).bind(client_id, item_id).first<PriceRow>()

        if (cip && cip.price > 0) {
          details.matched = cip.price
        } else {
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
      // 규격까지 맞은 직전가는 실측 중앙오차 0.0% 라 화면에서 구분해 보여 준다.
      price_source = (details as any).recent_by_spec ? 'recent_same_spec' : 'recent_transaction'
    } else if (details.matched !== null) {
      suggested_price = details.matched
      price_source = 'client_item_price'
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
      query += ' AND (i.item_name LIKE ? OR i.search_keywords LIKE ?)'
      params.push(`%${search}%`, `%${search}%`)
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
      // ★MAX 서브쿼리에도 같은 법인 필터 — 바깥만 걸면 최신 거래가 타법인 것일 때 만나는 행이 0 이 되어
      //   최근 단가가 조용히 빈칸이 된다(2026-09-03). 바인드 순서 = SQL 텍스트의 ? 순서(바깥 → 서브쿼리).
      const efPo = entityFilter(c, 'po')
      const efPo2 = entityFilter(c, 'po2')
      const { results: purchaseRows } = await c.env.DB.prepare(`
        SELECT poi.item_id, poi.unit_price, po.order_date
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.po_id = po.id
        WHERE poi.item_id IN (${ph}) AND po.supplier_id = ? AND po.status != 'CANCELLED'${efPo.clause}
          AND po.order_date = (
            SELECT MAX(po2.order_date) FROM purchase_orders po2
            JOIN purchase_order_items poi2 ON poi2.po_id = po2.id
            WHERE poi2.item_id = poi.item_id AND po2.supplier_id = po.supplier_id AND po2.status != 'CANCELLED'${efPo2.clause}
          )
        GROUP BY poi.item_id
      `).bind(...itemIds, client_id, ...efPo.params, ...efPo2.params).all<RecentTransactionRow>()
      for (const r of purchaseRows) {
        purchaseMap[r.item_id] = { unit_price: r.unit_price, order_date: r.order_date }
      }

      // 매출 최근 거래 (품목별 최신 1건)
      const efO = entityFilter(c, 'o')
      const efO2 = entityFilter(c, 'o2')
      const { results: salesRows } = await c.env.DB.prepare(`
        SELECT oi.item_id, oi.unit_price, o.order_date
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE oi.item_id IN (${ph}) AND o.client_id = ? AND o.status != 'CANCELLED'${efO.clause}
          AND o.order_date = (
            SELECT MAX(o2.order_date) FROM orders o2
            JOIN order_items oi2 ON oi2.order_id = o2.id
            WHERE oi2.item_id = oi.item_id AND o2.client_id = o.client_id AND o2.status != 'CANCELLED'${efO2.clause}
          )
        GROUP BY oi.item_id
      `).bind(...itemIds, client_id, ...efO.params, ...efO2.params).all<RecentTransactionRow>()
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
      ORDER BY cip.price ASC, cip.id ASC
    `).bind(item_id).all<SupplierPriceRow>()

    // Enrich with recent purchase prices
    const efPo = entityFilter(c, 'po')  // #449: 타법인 매입단가 cross-tenant read 차단
    const enriched = await Promise.all(
      results.map(async (row) => {
        const recentPurchase = await c.env.DB.prepare(`
          SELECT poi.unit_price, po.order_date
          FROM purchase_order_items poi
          JOIN purchase_orders po ON poi.po_id = po.id
          WHERE poi.item_id = ? AND po.supplier_id = ? AND po.status != 'CANCELLED'${efPo.clause}
          ORDER BY po.order_date DESC, po.id DESC
          LIMIT 1
        `).bind(item_id, row.client_id, ...efPo.params).first<RecentPriceRow>()

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
    console.error('prices POST /client-item-prices error:', error)
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

// ==================== Price Overview (통합 단가 뷰) ====================

// GET /price-overview — 전체 품목 단가 + item_group 정보
pricesRouter.get('/price-overview', async (c) => {
  try {
    const { search } = c.req.query()

    let sql = `
      SELECT i.id, i.item_code, i.item_name, i.base_price, i.sales_price, i.unit,
             i.category, i.item_type, i.item_group,
             igs.price_linked
      FROM items i
      LEFT JOIN item_group_settings igs ON i.item_group = igs.group_name
      WHERE i.is_active = 1
    `
    const binds: any[] = []

    if (search) {
      sql += ' AND (i.item_name LIKE ? OR i.item_code LIKE ? OR i.item_group LIKE ? OR i.search_keywords LIKE ?)'
      binds.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
    }

    sql += ' ORDER BY i.item_code'

    const stmt = binds.length
      ? c.env.DB.prepare(sql).bind(...binds)
      : c.env.DB.prepare(sql)
    const { results: items } = await stmt.all()

    return c.json({ success: true, items })
  } catch (error) {
    console.error('price-overview GET error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// GET /item-detail/:id — 품목 상세 (매입처별 단가 + 이력)
pricesRouter.get('/item-detail/:id', async (c) => {
  try {
    const itemId = parseInt(c.req.param('id'))

    // 매입처별 단가
    const { results: supplierPrices } = await c.env.DB.prepare(`
      SELECT cip.id, cip.client_id, cip.price, cip.notes, cip.updated_at,
             cl.client_name, cl.client_code
      FROM client_item_prices cip
      JOIN clients cl ON cip.client_id = cl.id
      WHERE cip.item_id = ?
      ORDER BY cip.updated_at DESC, cip.id DESC
    `).bind(itemId).all()

    // 최근 변경 이력
    const efHistory = entityFilter(c)
    const { results: history } = await c.env.DB.prepare(`
      SELECT id, field_name, old_value, new_value, old_price, new_price, changed_by,
             changed_at
      FROM price_change_history
      WHERE target_type = 'ITEM' AND target_id = ?${efHistory.clause}
      ORDER BY id DESC LIMIT 20
    `).bind(itemId, ...efHistory.params).all()

    // 최근 매입 거래
    const efPo2 = entityFilter(c, 'po')  // #449: 타법인 매입 거래 cross-tenant read 차단
    const { results: recentPurchases } = await c.env.DB.prepare(`
      SELECT poi.unit_price, po.order_date, po.po_number,
             cl.client_name as supplier_name
      FROM purchase_order_items poi
      JOIN purchase_orders po ON poi.po_id = po.id
      LEFT JOIN clients cl ON po.supplier_id = cl.id
      WHERE poi.item_id = ? AND po.status IN ('CONFIRMED','PARTIAL_RECEIVED','RECEIVED')${efPo2.clause}
      ORDER BY po.order_date DESC, po.id DESC LIMIT 10
    `).bind(itemId, ...efPo2.params).all()

    return c.json({ success: true, supplierPrices, history, recentPurchases })
  } catch (error) {
    console.error('item-detail GET error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ==================== Price Groups (단가 그룹) ====================

interface PriceGroupRow {
  id: number; name: string; description: string | null
  created_at: string; updated_at: string
  item_count: number
}

// GET /price-groups — 단가 그룹 목록
pricesRouter.get('/price-groups', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT pg.*, COUNT(i.id) as item_count
      FROM price_groups pg
      LEFT JOIN items i ON i.price_group_id = pg.id
      GROUP BY pg.id
      ORDER BY pg.name
    `).all<PriceGroupRow>()

    return c.json({ success: true, groups: results })
  } catch (error) {
    console.error('price-groups GET error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// GET /price-groups/:id — 단가 그룹 상세 (소속 품목 포함)
pricesRouter.get('/price-groups/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const group = await c.env.DB.prepare(
      'SELECT * FROM price_groups WHERE id = ?'
    ).bind(id).first()

    if (!group) return c.json({ success: false, error: '그룹 없음' }, 404)

    const { results: items } = await c.env.DB.prepare(`
      SELECT id, item_code, item_name, base_price, sales_price, unit, category, item_type
      FROM items WHERE price_group_id = ? AND is_active = 1
      ORDER BY item_code
    `).bind(id).all()

    return c.json({ success: true, group, items })
  } catch (error) {
    console.error('price-groups/:id GET error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /price-groups — 단가 그룹 생성
pricesRouter.post('/price-groups', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { name, description, item_ids } = await c.req.json<{
      name: string; description?: string; item_ids?: number[]
    }>()

    if (!name?.trim()) return c.json({ success: false, error: '그룹명 필수' }, 400)

    const result = await c.env.DB.prepare(
      'INSERT INTO price_groups (name, description) VALUES (?, ?)'
    ).bind(name.trim(), description || null).run()

    const groupId = result.meta.last_row_id

    // 품목 배정
    if (item_ids?.length) {
      const stmts = item_ids.map(itemId =>
        c.env.DB.prepare('UPDATE items SET price_group_id = ? WHERE id = ?').bind(groupId, itemId)
      )
      await c.env.DB.batch(stmts)
    }

    return c.json({ success: true, id: groupId })
  } catch (error: any) {
    if (error?.message?.includes('UNIQUE')) {
      return c.json({ success: false, error: '동일한 이름의 그룹이 존재합니다' }, 409)
    }
    console.error('price-groups POST error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// PATCH /price-groups/:id — 단가 그룹 수정
pricesRouter.patch('/price-groups/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const { name, description } = await c.req.json<{
      name?: string; description?: string
    }>()

    const sets: string[] = []
    const vals: any[] = []
    if (name !== undefined) { sets.push('name = ?'); vals.push(name.trim()) }
    if (description !== undefined) { sets.push('description = ?'); vals.push(description) }
    if (!sets.length) return c.json({ success: false, error: '변경 항목 없음' }, 400)

    sets.push('updated_at = CURRENT_TIMESTAMP')
    vals.push(parseInt(id))

    await c.env.DB.prepare(
      `UPDATE price_groups SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...vals).run()

    return c.json({ success: true })
  } catch (error: any) {
    if (error?.message?.includes('UNIQUE')) {
      return c.json({ success: false, error: '동일한 이름의 그룹이 존재합니다' }, 409)
    }
    console.error('price-groups PATCH error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// DELETE /price-groups/:id — 단가 그룹 삭제 (품목은 그룹 해제)
pricesRouter.delete('/price-groups/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')

    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE items SET price_group_id = NULL WHERE price_group_id = ?').bind(parseInt(id)),
      c.env.DB.prepare('DELETE FROM price_groups WHERE id = ?').bind(parseInt(id))
    ])

    return c.json({ success: true })
  } catch (error) {
    console.error('price-groups DELETE error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /price-groups/:id/assign — 품목 배정
pricesRouter.post('/price-groups/:id/assign', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const groupId = parseInt(c.req.param('id'))
    const { item_ids } = await c.req.json<{ item_ids: number[] }>()

    if (!item_ids?.length) return c.json({ success: false, error: 'item_ids 필수' }, 400)

    const existing = await c.env.DB.prepare(
      'SELECT id FROM price_groups WHERE id = ?'
    ).bind(groupId).first()
    if (!existing) return c.json({ success: false, error: '그룹 없음' }, 404)

    const stmts = item_ids.map(itemId =>
      c.env.DB.prepare('UPDATE items SET price_group_id = ? WHERE id = ?').bind(groupId, itemId)
    )
    for (let i = 0; i < stmts.length; i += 80) await c.env.DB.batch(stmts.slice(i, i + 80))  // 80 청크 규약

    return c.json({ success: true, assigned: item_ids.length })
  } catch (error) {
    console.error('price-groups assign error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /price-groups/:id/unassign — 품목 그룹 해제
pricesRouter.post('/price-groups/:id/unassign', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const groupId = parseInt(c.req.param('id'))
    const { item_ids } = await c.req.json<{ item_ids: number[] }>()

    if (!item_ids?.length) return c.json({ success: false, error: 'item_ids 필수' }, 400)

    const stmts = item_ids.map(itemId =>
      c.env.DB.prepare(
        'UPDATE items SET price_group_id = NULL WHERE id = ? AND price_group_id = ?'
      ).bind(itemId, groupId)
    )
    for (let i = 0; i < stmts.length; i += 80) await c.env.DB.batch(stmts.slice(i, i + 80))  // 80 청크 규약

    return c.json({ success: true, unassigned: item_ids.length })
  } catch (error) {
    console.error('price-groups unassign error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// GET /price-history — 단가 변경 이력 조회
pricesRouter.get('/price-history', async (c) => {
  try {
    const { item_id, target_type, limit: limitStr } = c.req.query()
    const limit = parseInt(limitStr || '50')

    const ef = entityFilter(c, 'pch')
    let sql = `
      SELECT pch.*, i.item_name, i.item_code
      FROM price_change_history pch
      LEFT JOIN items i ON pch.target_type = 'ITEM' AND pch.target_id = i.id
      WHERE 1=1${ef.clause}
    `
    const binds: any[] = [...ef.params]

    if (item_id) { sql += ' AND pch.target_id = ? AND pch.target_type = ?'; binds.push(parseInt(item_id), 'ITEM') }
    else if (target_type) { sql += ' AND pch.target_type = ?'; binds.push(target_type) }

    sql += ' ORDER BY pch.id DESC LIMIT ?'
    binds.push(limit)

    const stmt = c.env.DB.prepare(sql).bind(...binds)
    const { results } = await stmt.all()

    return c.json({ success: true, history: results })
  } catch (error) {
    console.error('price-history GET error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

export default pricesRouter