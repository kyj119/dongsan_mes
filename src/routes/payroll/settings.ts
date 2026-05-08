/**
 * payroll/settings.ts — 요율/세액표 설정 (C)
 * 2026-04-15 분할
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'

import { calcOfficialMonthlyTax } from './shared'

const settingsRouter = new Hono<HonoEnv>()
settingsRouter.use('/*', authMiddleware)

// 원본 라인 786-799 + 1014-1213 + 1597-1631
settingsRouter.get('/rates/:year', async (c) => {
  const year = Number(c.req.param('year'))
  const rows = await c.env.DB.prepare(
    `SELECT * FROM insurance_rates WHERE year = ? ORDER BY insurance_type`
  ).bind(year).all()
  return c.json({ success: true, data: rows.results || [] })
})

// ============================================================================
// API: 일괄 생성 (전 직원 해당 월 급여 PENDING 생성)
// POST /api/payroll/batch
// body: { pay_period: 'YYYY-MM' }
// 기본급/부양가족만 가지고 자동 계산. 수당은 추후 수정.
// ============================================================================
settingsRouter.put('/rates', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json<any>()
    const year = Number(body.year)
    const insurance_type = String(body.insurance_type || '')
    if (!year || !insurance_type) return c.json({ success: false, error: 'year, insurance_type 필요' }, 400)

    const total_rate = Number(body.total_rate || 0)
    const employee_rate = Number(body.employee_rate || 0)
    const employer_rate = Number(body.employer_rate || 0)
    const base = String(body.base || 'TAXABLE_PAY')
    const min_base = body.min_base != null && body.min_base !== '' ? Number(body.min_base) : null
    const max_base = body.max_base != null && body.max_base !== '' ? Number(body.max_base) : null
    const effective_from = String(body.effective_from || `${year}-01-01`)
    const effective_to = body.effective_to ? String(body.effective_to) : null

    // 기존 레코드 확인
    const existing = await c.env.DB.prepare(
      `SELECT id FROM insurance_rates WHERE year = ? AND insurance_type = ?`
    ).bind(year, insurance_type).first<{ id: number }>()

    if (existing) {
      await c.env.DB.prepare(
        `UPDATE insurance_rates SET
          total_rate = ?, employee_rate = ?, employer_rate = ?, base = ?,
          min_base = ?, max_base = ?, effective_from = ?, effective_to = ?
         WHERE id = ?`
      ).bind(total_rate, employee_rate, employer_rate, base, min_base, max_base, effective_from, effective_to, existing.id).run()
    } else {
      await c.env.DB.prepare(
        `INSERT INTO insurance_rates (year, insurance_type, total_rate, employee_rate, employer_rate, base, min_base, max_base, effective_from, effective_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(year, insurance_type, total_rate, employee_rate, employer_rate, base, min_base, max_base, effective_from, effective_to).run()
    }
    return c.json({ success: true })
  } catch (err: any) {
    console.error('Payroll insurance rates save error:', err)
    return c.json({ success: false, error: '저장 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// API: 4대보험 요율 삭제
// DELETE /api/payroll/rates/:year/:type
// ============================================================================
settingsRouter.delete('/rates/:year/:type', requireRole('ADMIN'), async (c) => {
  const year = Number(c.req.param('year'))
  const type = c.req.param('type')
  await c.env.DB.prepare(
    `DELETE FROM insurance_rates WHERE year = ? AND insurance_type = ?`
  ).bind(year, type).run()
  return c.json({ success: true })
})

// ============================================================================
// API: 연도 복사 (작년 요율을 올해로 복사)
// POST /api/payroll/rates/copy
// body: { from_year, to_year }
// ============================================================================
settingsRouter.post('/rates/copy', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json<any>()
    const from_year = Number(body.from_year)
    const to_year = Number(body.to_year)
    if (!from_year || !to_year) return c.json({ success: false, error: 'from_year, to_year 필요' }, 400)

    // 대상 연도에 이미 있으면 에러
    const existing = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM insurance_rates WHERE year = ?`
    ).bind(to_year).first<{ cnt: number }>()
    if ((existing?.cnt || 0) > 0) {
      return c.json({ success: false, error: `${to_year}년 요율이 이미 존재합니다. 먼저 삭제 후 재시도하세요.` }, 400)
    }

    await c.env.DB.prepare(
      `INSERT INTO insurance_rates (year, insurance_type, total_rate, employee_rate, employer_rate, base, min_base, max_base, effective_from, effective_to)
       SELECT ?, insurance_type, total_rate, employee_rate, employer_rate, base, min_base, max_base, ? || '-01-01', NULL
       FROM insurance_rates WHERE year = ?`
    ).bind(to_year, to_year, from_year).run()
    return c.json({ success: true })
  } catch (err: any) {
    console.error('Payroll copy insurance rates error:', err)
    return c.json({ success: false, error: '복사 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// API: 간이세액표 조회 (페이징)
// GET /api/payroll/tax-table/:year?offset=0&limit=100
// ============================================================================
settingsRouter.get('/tax-table/:year', async (c) => {
  const year = Number(c.req.param('year'))
  const offset = Number(c.req.query('offset') || 0)
  const limit = Math.min(Number(c.req.query('limit') || 100), 500)
  const rows = await c.env.DB.prepare(
    `SELECT * FROM income_tax_table WHERE year = ? ORDER BY monthly_pay_min LIMIT ? OFFSET ?`
  ).bind(year, limit, offset).all()
  const count = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM income_tax_table WHERE year = ?`
  ).bind(year).first<{ cnt: number }>()
  return c.json({ success: true, data: rows.results || [], total: count?.cnt || 0 })
})

// ============================================================================
// API: 간이세액표 수정/추가
// PUT /api/payroll/tax-table
// body: { year, monthly_pay_min, monthly_pay_max, dependents_1..dependents_11 }
// ============================================================================
settingsRouter.put('/tax-table', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json<any>()
    const year = Number(body.year)
    const min = Number(body.monthly_pay_min)
    const max = Number(body.monthly_pay_max)
    if (!year || min == null || max == null) return c.json({ success: false, error: 'year, min, max 필요' }, 400)

    const cols: string[] = []
    const vals: any[] = []
    for (let i = 1; i <= 11; i++) {
      cols.push(`dependents_${i}`)
      vals.push(Number(body[`dependents_${i}`] || 0))
    }

    const existing = await c.env.DB.prepare(
      `SELECT id FROM income_tax_table WHERE year = ? AND monthly_pay_min = ?`
    ).bind(year, min).first<{ id: number }>()

    if (existing) {
      const setClause = cols.map(c => `${c} = ?`).join(', ')
      await c.env.DB.prepare(
        `UPDATE income_tax_table SET monthly_pay_max = ?, ${setClause} WHERE id = ?`
      ).bind(max, ...vals, existing.id).run()
    } else {
      const colNames = cols.join(', ')
      const placeholders = cols.map(() => '?').join(', ')
      await c.env.DB.prepare(
        `INSERT INTO income_tax_table (year, monthly_pay_min, monthly_pay_max, ${colNames})
         VALUES (?, ?, ?, ${placeholders})`
      ).bind(year, min, max, ...vals).run()
    }
    return c.json({ success: true })
  } catch (err: any) {
    console.error('Payroll income tax table save error:', err)
    return c.json({ success: false, error: '저장 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// API: 간이세액표 삭제 (단일 행)
// DELETE /api/payroll/tax-table/:id
// ============================================================================
settingsRouter.delete('/tax-table/:id', requireRole('ADMIN'), async (c) => {
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare(`DELETE FROM income_tax_table WHERE id = ?`).bind(id).run()
  return c.json({ success: true })
})

// ============================================================================
// API: 간이세액표 CSV 일괄 임포트
// POST /api/payroll/tax-table/import
// body: { year, rows: [{ monthly_pay_min, monthly_pay_max, dependents_1..dependents_11 }] }
// ============================================================================
settingsRouter.post('/tax-table/import', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json<any>()
    const year = Number(body.year)
    const rows = Array.isArray(body.rows) ? body.rows : []
    if (!year || rows.length === 0) return c.json({ success: false, error: 'year, rows 필요' }, 400)

    const replace = !!body.replace
    if (replace) {
      await c.env.DB.prepare(`DELETE FROM income_tax_table WHERE year = ?`).bind(year).run()
    }

    let inserted = 0
    for (const r of rows) {
      const min = Number(r.monthly_pay_min)
      const max = Number(r.monthly_pay_max)
      if (min == null || max == null) continue
      const deps: any[] = []
      for (let i = 1; i <= 11; i++) deps.push(Number(r[`dependents_${i}`] || 0))
      await c.env.DB.prepare(
        `INSERT OR REPLACE INTO income_tax_table (year, monthly_pay_min, monthly_pay_max,
           dependents_1, dependents_2, dependents_3, dependents_4, dependents_5,
           dependents_6, dependents_7, dependents_8, dependents_9, dependents_10, dependents_11)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(year, min, max, ...deps).run()
      inserted++
    }
    return c.json({ success: true, data: { inserted } })
  } catch (err: any) {
    console.error('Payroll import tax data error:', err)
    return c.json({ success: false, error: '임포트 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// API: 연말정산 집계 (간편 원천징수영수증)
// GET /api/payroll/year-end/:employeeId?year=
// ============================================================================
settingsRouter.post('/tax-table/generate', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json<any>()
    const year = Number(body.year)
    const min = Number(body.min || 1000000)
    const max = Number(body.max || 10000000)
    const step = Number(body.step || 10000)
    if (!year) return c.json({ success: false, error: 'year 필요' }, 400)

    // 기존 삭제
    await c.env.DB.prepare(`DELETE FROM income_tax_table WHERE year = ?`).bind(year).run()

    let inserted = 0
    // 배치 INSERT (D1은 prepare + bind 개별 호출이 안전)
    for (let pay = min; pay < max; pay += step) {
      const payMid = pay + Math.floor(step / 2) // 구간 중앙값으로 계산 (보수적)
      const deps: number[] = []
      for (let d = 1; d <= 11; d++) {
        deps.push(calcOfficialMonthlyTax(payMid, d))
      }
      await c.env.DB.prepare(
        `INSERT INTO income_tax_table (year, monthly_pay_min, monthly_pay_max,
          dependents_1, dependents_2, dependents_3, dependents_4, dependents_5,
          dependents_6, dependents_7, dependents_8, dependents_9, dependents_10, dependents_11)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(year, pay, pay + step, ...deps).run()
      inserted++
    }

    return c.json({ success: true, data: { inserted, year, min, max, step } })
  } catch (err: any) {
    console.error('Payroll create tax data error:', err)
    return c.json({ success: false, error: '생성 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

export default settingsRouter
