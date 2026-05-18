import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter } from '../utils/entityFilter'

const fixedAssets = new Hono<HonoEnv>()
fixedAssets.use('*', authMiddleware)

// ─── 고정자산 목록 ──────────────────────────────────────────────────────────
fixedAssets.get('/', async (c) => {
  const category = c.req.query('category')
  const status = c.req.query('status')
  const eFilter = entityFilter(c)
  let where = `WHERE 1=1 ${eFilter.clause}`
  const binds: any[] = [...eFilter.params]
  if (category) { where += ' AND fa.category = ?'; binds.push(category) }
  if (status) { where += ' AND fa.status = ?'; binds.push(status) }

  const { results } = await c.env.DB.prepare(`
    SELECT fa.*, e.name as equipment_name
    FROM fixed_assets fa
    LEFT JOIN equipment e ON fa.equipment_id = e.id
    ${where}
    ORDER BY fa.acquisition_date DESC
  `).bind(...binds).all()

  return c.json({ success: true, data: results })
})

// ─── 고정자산 생성 ──────────────────────────────────────────────────────────
fixedAssets.post('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const body = await c.req.json()
  const userId = c.get('user')?.id
  const { asset_code, name, category, equipment_id, acquisition_date, acquisition_cost,
    useful_life_months, depreciation_method, salvage_value, location, serial_number, notes } = body

  if (!asset_code || !name || !category || !acquisition_date || !acquisition_cost || !useful_life_months) {
    return c.json({ success: false, error: 'asset_code, name, category, acquisition_date, acquisition_cost, useful_life_months 필수' }, 400)
  }

  const result = await c.env.DB.prepare(`
    INSERT INTO fixed_assets (asset_code, name, category, equipment_id, acquisition_date, acquisition_cost,
      useful_life_months, depreciation_method, salvage_value, current_book_value, location, serial_number, notes, entity_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    asset_code, name, category, equipment_id || null, acquisition_date, acquisition_cost,
    useful_life_months, depreciation_method || 'STRAIGHT_LINE', salvage_value || 0,
    acquisition_cost, location || null, serial_number || null, notes || null, getEntityId(c), userId
  ).run()

  return c.json({ success: true, data: { id: result.meta.last_row_id } })
})

// ─── 고정자산 상세 ──────────────────────────────────────────────────────────
fixedAssets.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const asset = await c.env.DB.prepare(`
    SELECT fa.*, e.name as equipment_name
    FROM fixed_assets fa LEFT JOIN equipment e ON fa.equipment_id = e.id
    WHERE fa.id = ?
  `).bind(id).first()

  const { results: depreciations } = await c.env.DB.prepare(`
    SELECT * FROM depreciation_records WHERE asset_id = ? ORDER BY period DESC LIMIT 24
  `).bind(id).all()

  return c.json({ success: true, data: { ...asset, depreciations } })
})

// ─── 감가상각 계산 (월별 일괄) ──────────────────────────────────────────────
fixedAssets.post('/depreciate', requireRole('ADMIN'), async (c) => {
  const { period } = await c.req.json() // YYYY-MM
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return c.json({ success: false, error: 'period (YYYY-MM) 필수' }, 400)
  }

  const { results: assets } = await c.env.DB.prepare(`
    SELECT * FROM fixed_assets WHERE status = 'IN_USE'
  `).all<any>()

  // N+1 해소: 이미 처리된 기간 + 최신 누적감가상각을 일괄 조회
  const { results: existingPeriods } = await c.env.DB.prepare(
    `SELECT asset_id FROM depreciation_records WHERE period = ?`
  ).bind(period).all<{ asset_id: number }>()
  const alreadyProcessed = new Set(existingPeriods.map(r => r.asset_id))

  const { results: latestRecords } = await c.env.DB.prepare(`
    SELECT dr.asset_id, dr.accumulated_depreciation, dr.book_value
    FROM depreciation_records dr
    INNER JOIN (
      SELECT asset_id, MAX(period) as max_period FROM depreciation_records GROUP BY asset_id
    ) latest ON dr.asset_id = latest.asset_id AND dr.period = latest.max_period
  `).all<{ asset_id: number; accumulated_depreciation: number; book_value: number }>()
  const latestMap = new Map(latestRecords.map(r => [r.asset_id, r]))

  const stmts: any[] = []

  for (const asset of assets) {
    if (alreadyProcessed.has(asset.id)) continue

    const lastRecord = latestMap.get(asset.id)
    const accumulated = lastRecord?.accumulated_depreciation || 0
    const bookValue = lastRecord?.book_value || asset.current_book_value || asset.acquisition_cost

    // 잔존가치 도달 시 스킵
    if (bookValue <= (asset.salvage_value || 0)) continue

    // 월별 감가상각액 계산
    let monthlyDepreciation: number
    if (asset.depreciation_method === 'DECLINING_BALANCE') {
      // 정률법: 장부가 * (2 / 내용연수)
      const rate = 2 / asset.useful_life_months
      monthlyDepreciation = Math.round(bookValue * rate)
    } else {
      // 정액법: (취득가 - 잔존) / 내용연수
      monthlyDepreciation = Math.round((asset.acquisition_cost - (asset.salvage_value || 0)) / asset.useful_life_months)
    }

    // 잔존가치 이하로 내려가지 않도록
    monthlyDepreciation = Math.min(monthlyDepreciation, bookValue - (asset.salvage_value || 0))
    if (monthlyDepreciation <= 0) continue

    const newAccumulated = accumulated + monthlyDepreciation
    const newBookValue = asset.acquisition_cost - newAccumulated

    stmts.push(
      c.env.DB.prepare(`
        INSERT INTO depreciation_records (asset_id, period, depreciation_amount, accumulated_depreciation, book_value)
        VALUES (?, ?, ?, ?, ?)
      `).bind(asset.id, period, monthlyDepreciation, newAccumulated, newBookValue)
    )
    stmts.push(
      c.env.DB.prepare(`UPDATE fixed_assets SET current_book_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(newBookValue, asset.id)
    )
  }

  if (stmts.length > 0) await c.env.DB.batch(stmts)

  return c.json({ success: true, data: { processed: Math.floor(stmts.length / 2), period } })
})

// ─── 자산 처분 ──────────────────────────────────────────────────────────────
fixedAssets.patch('/:id/dispose', requireRole('ADMIN'), async (c) => {
  const id = Number(c.req.param('id'))
  const { disposal_amount, disposal_reason } = await c.req.json()

  await c.env.DB.prepare(`
    UPDATE fixed_assets SET status = 'DISPOSED', disposed_at = date('now'),
      disposal_amount = ?, disposal_reason = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(disposal_amount || 0, disposal_reason || null, id).run()

  return c.json({ success: true })
})

// ─── 자산 요약 보고서 ────────────────────────────────────────────────────────
fixedAssets.get('/report/summary', async (c) => {
  const eFilter = entityFilter(c)
  const { results } = await c.env.DB.prepare(`
    SELECT category,
      COUNT(*) as count,
      ROUND(SUM(acquisition_cost), 0) as total_acquisition,
      ROUND(SUM(current_book_value), 0) as total_book_value,
      ROUND(SUM(acquisition_cost) - SUM(current_book_value), 0) as total_depreciation
    FROM fixed_assets fa
    WHERE fa.status = 'IN_USE' ${eFilter.clause}
    GROUP BY category
    ORDER BY total_acquisition DESC
  `).bind(...eFilter.params).all()

  return c.json({ success: true, data: results })
})

export default fixedAssets
