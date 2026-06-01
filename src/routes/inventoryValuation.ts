import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, getEntityId } from '../utils/entityFilter'

const inventoryValuation = new Hono<HonoEnv>()
inventoryValuation.use('*', authMiddleware)

// ─── 현재 평가 방법 조회 ─────────────────────────────────────────────────────
inventoryValuation.get('/method', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT setting_value FROM settings WHERE setting_key = 'inventory_valuation_method'`
  ).first<{ setting_value: string }>()
  return c.json({ success: true, data: { method: row?.setting_value || 'WEIGHTED_AVG' } })
})

// ─── 평가 방법 변경 ──────────────────────────────────────────────────────────
inventoryValuation.put('/method', requireRole('ADMIN'), async (c) => {
  const { method } = await c.req.json()
  if (!['FIFO', 'WEIGHTED_AVG', 'STANDARD'].includes(method)) {
    return c.json({ success: false, error: '유효한 방법: FIFO, WEIGHTED_AVG, STANDARD' }, 400)
  }
  await c.env.DB.prepare(
    `UPDATE settings SET setting_value = ? WHERE setting_key = 'inventory_valuation_method'`
  ).bind(method).run()
  return c.json({ success: true })
})

// ─── 재고 평가 보고서 ────────────────────────────────────────────────────────
inventoryValuation.get('/report', async (c) => {
  const methodRow = await c.env.DB.prepare(
    `SELECT setting_value FROM settings WHERE setting_key = 'inventory_valuation_method'`
  ).first<{ setting_value: string }>()
  const method = methodRow?.setting_value || 'WEIGHTED_AVG'

  let results: any[] = []

  const entityId = getEntityId(c)
  const entityClause = entityId > 0 ? 'WHERE entity_id = ?' : ''
  const entityParams = entityId > 0 ? [entityId] : []

  if (method === 'WEIGHTED_AVG') {
    // #158: 이동평균 — entity 필터 적용
    const { results: rows } = await c.env.DB.prepare(`
      SELECT i.id, i.item_code, i.item_name, i.unit, i.avg_unit_cost,
        COALESCE(inv.quantity, 0) as current_stock,
        ROUND(COALESCE(inv.quantity, 0) * COALESCE(i.avg_unit_cost, 0), 0) as valuation
      FROM items i
      LEFT JOIN (
        SELECT item_id, SUM(CASE WHEN transaction_type='IN' THEN quantity ELSE -quantity END) as quantity
        FROM inventory_transactions ${entityClause} GROUP BY item_id
      ) inv ON inv.item_id = i.id
      WHERE i.is_purchase_item = 1 AND COALESCE(inv.quantity, 0) > 0
      ORDER BY valuation DESC
    `).bind(...entityParams).all()
    results = rows
  } else if (method === 'FIFO') {
    // FIFO: 레이어별 잔여수량 * 레이어 단가 합산
    const fifoEf = entityFilter(c, 'fl')
    const { results: rows } = await c.env.DB.prepare(`
      SELECT i.id, i.item_code, i.item_name, i.unit,
        SUM(fl.remaining_quantity) as current_stock,
        ROUND(SUM(fl.remaining_quantity * fl.unit_cost), 0) as valuation,
        ROUND(SUM(fl.remaining_quantity * fl.unit_cost) / NULLIF(SUM(fl.remaining_quantity), 0), 2) as avg_cost
      FROM inventory_fifo_layers fl
      JOIN items i ON fl.item_id = i.id
      WHERE fl.remaining_quantity > 0 ${fifoEf.clause}
      GROUP BY fl.item_id
      ORDER BY valuation DESC
    `).bind(...fifoEf.params).all()
    results = rows
  } else {
    // 표준원가: cost_standards 기반
    const { results: rows } = await c.env.DB.prepare(`
      SELECT i.id, i.item_code, i.item_name, i.unit,
        cs.media_cost_per_sqm as standard_cost,
        COALESCE(inv.quantity, 0) as current_stock,
        ROUND(COALESCE(inv.quantity, 0) * COALESCE(cs.media_cost_per_sqm, 0), 0) as valuation
      FROM items i
      LEFT JOIN cost_standards cs ON i.category = cs.category_name
      LEFT JOIN (
        SELECT item_id, SUM(CASE WHEN transaction_type='IN' THEN quantity ELSE -quantity END) as quantity
        FROM inventory_transactions ${entityClause} GROUP BY item_id
      ) inv ON inv.item_id = i.id
      WHERE i.is_purchase_item = 1 AND COALESCE(inv.quantity, 0) > 0
      ORDER BY valuation DESC
    `).bind(...entityParams).all()
    results = rows
  }

  const totalValuation = results.reduce((sum: number, r: any) => sum + (r.valuation || 0), 0)

  return c.json({ success: true, data: { method, items: results, total_valuation: totalValuation } })
})

// ─── FIFO 레이어 입고 등록 (입고 시 자동 호출) ────────────────────────────────
inventoryValuation.post('/fifo-layer', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const { item_id, receipt_id, quantity, unit_cost } = await c.req.json()
  if (!item_id || !quantity || !unit_cost) {
    return c.json({ success: false, error: 'item_id, quantity, unit_cost 필수' }, 400)
  }

  await c.env.DB.prepare(`
    INSERT INTO inventory_fifo_layers (item_id, receipt_date, receipt_id, original_quantity, remaining_quantity, unit_cost, entity_id)
    VALUES (?, date('now'), ?, ?, ?, ?, ?)
  `).bind(item_id, receipt_id || null, quantity, quantity, unit_cost, getEntityId(c) || 1).run()

  return c.json({ success: true })
})

// ─── 이동평균 단가 재계산 ────────────────────────────────────────────────────
inventoryValuation.post('/recalculate-avg', requireRole('ADMIN', 'MANAGER'), async (c) => {
  // #158: 현재 법인의 이동평균 단가를 재계산
  const entityId = getEntityId(c)
  const entityClause = entityId > 0 ? 'AND entity_id = ?' : ''
  const entityParams = entityId > 0 ? [entityId] : []
  const { results: items } = await c.env.DB.prepare(`
    SELECT item_id,
      SUM(CASE WHEN transaction_type='IN' THEN quantity ELSE 0 END) as total_in,
      SUM(CASE WHEN transaction_type='IN' THEN total_amount ELSE 0 END) as total_cost
    FROM inventory_transactions
    WHERE transaction_type = 'IN' AND unit_price > 0 ${entityClause}
    GROUP BY item_id
    HAVING total_in > 0
  `).bind(...entityParams).all<{ item_id: number; total_in: number; total_cost: number }>()

  const stmts = items.map(item => {
    const avgCost = Math.round((item.total_cost / item.total_in) * 100) / 100
    return c.env.DB.prepare(`UPDATE items SET avg_unit_cost = ? WHERE id = ?`).bind(avgCost, item.item_id)
  })

  if (stmts.length > 0) await c.env.DB.batch(stmts)

  return c.json({ success: true, data: { updated: stmts.length } })
})

// ─── #158 Option C: 법인 간 동일 품목 단가 차이 경고 ─────────────────────────
inventoryValuation.get('/price-alerts', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const thresholdPct = parseFloat(c.req.query('threshold') || '20')

  // 법인별 가중평균 입고 단가 계산
  const { results: entityAvgs } = await c.env.DB.prepare(`
    SELECT it.item_id, i.item_code, i.item_name, it.entity_id, e.name as entity_name,
      ROUND(SUM(it.total_amount) / NULLIF(SUM(it.quantity), 0), 2) as avg_price,
      SUM(it.quantity) as total_qty
    FROM inventory_transactions it
    JOIN items i ON it.item_id = i.id
    JOIN entities e ON it.entity_id = e.id
    WHERE it.transaction_type = 'IN' AND it.unit_price > 0
    GROUP BY it.item_id, it.entity_id
    HAVING total_qty > 0
  `).all<{
    item_id: number; item_code: string; item_name: string;
    entity_id: number; entity_name: string;
    avg_price: number; total_qty: number
  }>()

  // 품목별 그룹핑 → 법인 간 비교
  const byItem = new Map<number, typeof entityAvgs>()
  for (const row of entityAvgs) {
    const arr = byItem.get(row.item_id) || []
    arr.push(row)
    byItem.set(row.item_id, arr)
  }

  const alerts: {
    item_id: number; item_code: string; item_name: string;
    entities: { entity_id: number; entity_name: string; avg_price: number; total_qty: number }[];
    max_diff_pct: number
  }[] = []

  for (const [itemId, rows] of byItem) {
    if (rows.length < 2) continue
    const prices = rows.map(r => r.avg_price)
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    if (minPrice <= 0) continue
    const diffPct = Math.round(((maxPrice - minPrice) / minPrice) * 100)
    if (diffPct >= thresholdPct) {
      alerts.push({
        item_id: itemId,
        item_code: rows[0].item_code,
        item_name: rows[0].item_name,
        entities: rows.map(r => ({
          entity_id: r.entity_id, entity_name: r.entity_name,
          avg_price: r.avg_price, total_qty: r.total_qty
        })),
        max_diff_pct: diffPct
      })
    }
  }

  alerts.sort((a, b) => b.max_diff_pct - a.max_diff_pct)

  return c.json({
    success: true,
    data: {
      threshold_pct: thresholdPct,
      alert_count: alerts.length,
      alerts
    }
  })
})

export default inventoryValuation
