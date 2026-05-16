import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter } from '../utils/entityFilter'

const budgets = new Hono<HonoEnv>()
budgets.use('*', authMiddleware)

// ─── 예산 목록 (연도별) ──────────────────────────────────────────────────────
budgets.get('/', async (c) => {
  const year = Number(c.req.query('year') || new Date().getFullYear())
  const eFilter = entityFilter(c)

  const { results } = await c.env.DB.prepare(`
    SELECT * FROM budgets b
    WHERE b.fiscal_year = ? ${eFilter.clause}
    ORDER BY department, category
  `).bind(year, ...eFilter.params).all()

  return c.json({ success: true, data: results })
})

// ─── 예산 생성/수정 (Upsert) ─────────────────────────────────────────────────
budgets.post('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const body = await c.req.json()
  const userId = c.get('user')?.id
  const { fiscal_year, department, category, budget_type, months, notes } = body
  // months: { jan, feb, ..., dec }

  if (!fiscal_year || !category) {
    return c.json({ success: false, error: 'fiscal_year, category 필수' }, 400)
  }

  const m = months || {}
  const annual = Object.values(m).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0)

  await c.env.DB.prepare(`
    INSERT INTO budgets (fiscal_year, department, category, budget_type, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec, annual_total, notes, entity_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fiscal_year, department, category, budget_type, entity_id) DO UPDATE SET
      jan=excluded.jan, feb=excluded.feb, mar=excluded.mar, apr=excluded.apr,
      may=excluded.may, jun=excluded.jun, jul=excluded.jul, aug=excluded.aug,
      sep=excluded.sep, oct=excluded.oct, nov=excluded.nov, dec=excluded.dec,
      annual_total=excluded.annual_total, notes=excluded.notes, updated_at=CURRENT_TIMESTAMP
  `).bind(
    fiscal_year, department || 'ALL', category, budget_type || 'EXPENSE',
    m.jan || 0, m.feb || 0, m.mar || 0, m.apr || 0, m.may || 0, m.jun || 0,
    m.jul || 0, m.aug || 0, m.sep || 0, m.oct || 0, m.nov || 0, m.dec || 0,
    annual, notes || null, getEntityId(c), userId
  ).run()

  return c.json({ success: true })
})

// ─── Budget vs Actual 비교 보고서 ────────────────────────────────────────────
budgets.get('/vs-actual', async (c) => {
  const year = Number(c.req.query('year') || new Date().getFullYear())
  const eFilter = entityFilter(c)

  // 예산
  const { results: budgetRows } = await c.env.DB.prepare(`
    SELECT * FROM budgets b WHERE fiscal_year = ? ${eFilter.clause}
  `).bind(year, ...eFilter.params).all<any>()

  // 실적 집계: 카테고리별 실제 지출
  // MATERIAL: purchase_payments
  const materialActual = await c.env.DB.prepare(`
    SELECT strftime('%m', payment_date) as month, SUM(amount) as total
    FROM purchase_payments
    WHERE strftime('%Y', payment_date) = ? ${eFilter.clause.replace(/\bb\./g, '')}
    GROUP BY month
  `).bind(String(year), ...eFilter.params).all<{ month: string; total: number }>()

  // LABOR: payroll
  const laborActual = await c.env.DB.prepare(`
    SELECT strftime('%m', pay_date) as month, SUM(net_pay) as total
    FROM payroll
    WHERE strftime('%Y', pay_date) = ?
    GROUP BY month
  `).bind(String(year)).all<{ month: string; total: number }>()

  // MAINTENANCE: maintenance_logs cost
  const maintenanceActual = await c.env.DB.prepare(`
    SELECT strftime('%m', performed_at) as month, SUM(cost) as total
    FROM maintenance_logs
    WHERE strftime('%Y', performed_at) = ?
    GROUP BY month
  `).bind(String(year)).all<{ month: string; total: number }>()

  // 월별 매핑
  const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']

  function buildActualMap(rows: any[]) {
    const map: Record<string, number> = {}
    for (const r of rows || []) {
      const idx = parseInt(r.month) - 1
      if (idx >= 0 && idx < 12) map[monthNames[idx]] = r.total || 0
    }
    return map
  }

  const actuals: Record<string, Record<string, number>> = {
    MATERIAL: buildActualMap(materialActual.results as any[]),
    LABOR: buildActualMap(laborActual.results as any[]),
    MAINTENANCE: buildActualMap(maintenanceActual.results as any[])
  }

  // 예산 vs 실적 결합
  const comparison = budgetRows.map((b: any) => {
    const actualMap = actuals[b.category] || {}
    const budgetTotal = b.annual_total || 0
    const actualTotal = Object.values(actualMap).reduce((s: number, v: any) => s + (v || 0), 0)
    const variance = budgetTotal - actualTotal
    const usageRate = budgetTotal > 0 ? Math.round((actualTotal / budgetTotal) * 1000) / 10 : 0

    return {
      ...b,
      actual_by_month: actualMap,
      actual_total: actualTotal,
      variance,
      usage_rate_pct: usageRate
    }
  })

  return c.json({ success: true, data: comparison })
})

// ─── 예산 삭제 ──────────────────────────────────────────────────────────────
budgets.delete('/:id', requireRole('ADMIN'), async (c) => {
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare(`DELETE FROM budgets WHERE id = ?`).bind(id).run()
  return c.json({ success: true })
})

export default budgets
