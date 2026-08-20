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
//
// 재고 수량의 정본은 **`inventory` 테이블**이다 (2026-08-20 수정).
//   기존 구현은 `inventory_transactions` 를 누적해 재고를 만들었다. 두 가지가 동시에 틀렸다.
//   ① 그 테이블은 완결된 수불 원장이 아니다 — prod 전체 65행뿐이고, 이관·실사로 들어온 재고엔
//      대응 거래가 아예 없다. 그래서 이 화면은 재고가 있는데도 **1품목만** 보여주고 있었다.
//   ② `CASE WHEN type='IN' THEN q ELSE -q END` 가 **ADJUST 를 출고로 뒤집었다**.
//      실사 보정은 `quantity = counted − system` 인 **부호 있는 증감**이다(inventoryCount.ts:547).
//      재고를 늘리는 보정이 평가액을 깎았다.
//   다른 경로(`financialReports.ts:267`·`inventoryCount` 승인·`inventory.ts`)는 전부 `inventory` 를
//   본다. 여기만 달랐다.
//
// 함께 바로잡은 것
//   · 창고(zone)별로 행이 나뉘므로 품목 단위로 **SUM** 한다. 예전엔 그럴 필요가 없어 보였을 뿐이다.
//   · `is_purchase_item = 1` 필터 제거 — 재고 행이 있으면 평가 대상이다. 매입품목 플래그는 발주용 축이다.
//   · `quantity > 0` → `<> 0`. 음수 재고(수불 부정합)를 숨기면 총계가 과대해진다.
//     선명 이관분에 음수가 실재한다 — 보이게 두고 `negative_stock_items` 로 센다.
//   · 정렬 tie-break 에 `i.id` 추가 (평가액 동값 구간에서 순서 미정의 → 페이징 시 중복·누락)
inventoryValuation.get('/report', async (c) => {
  const methodRow = await c.env.DB.prepare(
    `SELECT setting_value FROM settings WHERE setting_key = 'inventory_valuation_method'`
  ).first<{ setting_value: string }>()
  const method = methodRow?.setting_value || 'WEIGHTED_AVG'

  let results: any[] = []
  let note: string | null = null

  // 창고별 행을 품목 단위로 접는다. entityId=0(전체 모드)이면 절이 비어 전 법인 합산.
  const ef = entityFilter(c)
  const stockSub = `
    SELECT item_id, SUM(quantity) AS quantity
      FROM inventory
     WHERE 1 = 1${ef.clause}
     GROUP BY item_id
    HAVING SUM(quantity) <> 0`

  if (method === 'WEIGHTED_AVG') {
    // 이동평균 — 단가는 base_unit 당이다(2026-08-19 단위 정합화). 수량도 base 라 짝이 맞는다.
    const { results: rows } = await c.env.DB.prepare(`
      SELECT i.id, i.item_code, i.item_name, i.unit, i.base_unit, i.avg_unit_cost,
        inv.quantity AS current_stock,
        ROUND(inv.quantity * COALESCE(i.avg_unit_cost, 0), 0) AS valuation
      FROM items i
      JOIN (${stockSub}) inv ON inv.item_id = i.id
      ORDER BY valuation DESC, i.id ASC
    `).bind(...ef.params).all()
    results = rows
  } else if (method === 'FIFO') {
    // FIFO: 레이어별 잔여수량 × 레이어 단가
    const fifoEf = entityFilter(c, 'fl')
    const { results: rows } = await c.env.DB.prepare(`
      SELECT i.id, i.item_code, i.item_name, i.unit,
        SUM(fl.remaining_quantity) AS current_stock,
        ROUND(SUM(fl.remaining_quantity * fl.unit_cost), 0) AS valuation,
        ROUND(SUM(fl.remaining_quantity * fl.unit_cost) / NULLIF(SUM(fl.remaining_quantity), 0), 2) AS avg_cost
      FROM inventory_fifo_layers fl
      JOIN items i ON fl.item_id = i.id
      WHERE fl.remaining_quantity > 0 ${fifoEf.clause}
      GROUP BY fl.item_id
      ORDER BY valuation DESC, fl.item_id ASC
    `).bind(...fifoEf.params).all()
    results = rows
    // 빈 결과를 「재고 없음」으로 읽으면 안 된다 — 레이어를 쌓는 경로가 안 돌고 있을 뿐이다.
    if (!rows || rows.length === 0) {
      note = 'FIFO 레이어(inventory_fifo_layers)가 비어 있습니다. 입고 시 레이어 등록이 동작하지 않으면 평가액이 0으로 나옵니다 — 이동평균으로 전환하거나 레이어 적재를 먼저 확인하세요.'
    }
  } else {
    // 표준원가: cost_standards 기반
    const { results: rows } = await c.env.DB.prepare(`
      SELECT i.id, i.item_code, i.item_name, i.unit,
        cs.media_cost_per_sqm AS standard_cost,
        inv.quantity AS current_stock,
        ROUND(inv.quantity * COALESCE(cs.media_cost_per_sqm, 0), 0) AS valuation
      FROM items i
      LEFT JOIN cost_standards cs ON i.category = cs.category_name
      JOIN (${stockSub}) inv ON inv.item_id = i.id
      ORDER BY valuation DESC, i.id ASC
    `).bind(...ef.params).all()
    results = rows
  }

  const totalValuation = results.reduce((sum: number, r: any) => sum + (r.valuation || 0), 0)
  const negativeStock = results.filter((r: any) => Number(r.current_stock) < 0).length
  const noCost = results.filter((r: any) => !Number(r.valuation)).length

  return c.json({
    success: true,
    data: {
      method,
      items: results,
      total_valuation: totalValuation,
      item_count: results.length,
      // 총계를 어디까지 믿을지 판단할 근거. 숨기면 「깔끔한 오답」이 된다.
      negative_stock_items: negativeStock,
      zero_valuation_items: noCost,
      note,
    },
  })
})

// ─── FIFO 레이어 입고 등록 (입고 시 자동 호출) ────────────────────────────────
inventoryValuation.post('/fifo-layer', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const { item_id, receipt_id, quantity, unit_cost } = await c.req.json()
  if (!item_id || !quantity || !unit_cost) {
    return c.json({ success: false, error: 'item_id, quantity, unit_cost 필수' }, 400)
  }

  await c.env.DB.prepare(`
    INSERT INTO inventory_fifo_layers (item_id, receipt_date, receipt_id, original_quantity, remaining_quantity, unit_cost, entity_id)
    VALUES (?, date('now', '+9 hours'), ?, ?, ?, ?, ?)
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
