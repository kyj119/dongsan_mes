/**
 * taxInvoices/queries.ts — 세금계산서 조회 라우트 GET (taxInvoices.ts에서 분리, 2026-06-11 대형파일 분할 2/5)
 *
 * test-connection / 목록 / 발행대상 주문 / 주문별 / 상세(:id 숫자) / 월합산 대상 / 인쇄URL.
 * 배럴(taxInvoices.ts)에서 동일 prefix 마운트. ⚠️ 이동만, 로직 수정 0.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware } from '../../middleware/auth'
import { requireAccessOrRole } from '../../middleware/permissions'
import { getEntityId, entityFilter } from '../../utils/entityFilter'
import { getTaxProvider, getCompanySettings } from './helpers'
import { kstYm } from '../../utils/kstDate'
import type { EligibleOrderRow } from './helpers'

const taxInvoicesQueriesRouter = new Hono<HonoEnv>()
taxInvoicesQueriesRouter.use('/*', authMiddleware, requireAccessOrRole('/tax-invoices', 'MANAGER'))

// GET /test-connection — 바로빌 연결 테스트 (잔여 포인트 조회)
taxInvoicesQueriesRouter.get('/test-connection', async (c) => {
  try {
    const db = c.env.DB

    const settings = await getCompanySettings(db, getEntityId(c))
    const brn = (settings.company_business_registration_number || '').replace(/-/g, '')
    if (!brn) {
      return c.json({ success: false, error: '사업자등록번호가 설정되지 않았습니다.' }, 400)
    }

    const provider = await getTaxProvider(db, c.env, brn)
    if (!provider) {
      return c.json({ success: false, error: '바로빌 Provider 설정 없음 (CERT_KEY 또는 사업자번호 누락)' }, 400)
    }

    const testModeRow = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'barobill_test_mode'`
    ).first<{ setting_value: string }>()
    const isTestMode = testModeRow?.setting_value !== '0'

    const balance = await provider.getBalance()
    return c.json({
      success: true,
      data: {
        connected: true,
        testMode: isTestMode,
        remainPoint: balance.remainPoint,
        partnerPoint: balance.partnerPoint,
        brn,
      }
    })
  } catch (err) {
    console.error('Barobill connection error:', err)
    return c.json({
      success: false,
      error: '바로빌 연결에 실패했습니다'
    }, 500)
  }
})

// GET / — List tax invoices (paginated)
taxInvoicesQueriesRouter.get('/', async (c) => {
  try {
    const { page = '1', limit = '50', status = '', search = '', date_from = '', date_to = '' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 50, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    let query = `
      SELECT
        ti.*,
        o.order_number,
        c.client_name as buyer_client_name,
        (SELECT COUNT(*) FROM tax_invoice_orders WHERE tax_invoice_id = ti.id) as order_count,
        (SELECT GROUP_CONCAT(o2.order_number, ', ') FROM tax_invoice_orders tio2 JOIN orders o2 ON tio2.order_id = o2.id WHERE tio2.tax_invoice_id = ti.id) as order_numbers
      FROM tax_invoices ti
      LEFT JOIN orders o ON ti.order_id = o.id
      LEFT JOIN clients c ON ti.buyer_client_id = c.id
    `
    const params: any[] = []
    const whereClauses: string[] = []
    const ef = entityFilter(c, 'ti')

    if (status) {
      whereClauses.push('ti.status = ?')
      params.push(status)
    }
    if (search) {
      whereClauses.push('(ti.invoice_number LIKE ? OR o.order_number LIKE ? OR ti.buyer_name LIKE ?)')
      const p = `%${search}%`
      params.push(p, p, p)
    }
    if (date_from) {
      whereClauses.push('ti.issue_date >= ?')
      params.push(date_from)
    }
    if (date_to) {
      whereClauses.push('ti.issue_date <= ?')
      params.push(date_to)
    }
    if (ef.clause) {
      whereClauses.push(ef.clause.replace(' AND ', ''))
      params.push(...ef.params)
    }

    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ')
    }
    query += ' ORDER BY ti.created_at DESC, ti.id DESC LIMIT ? OFFSET ?'  // 정렬 규약: 고유키 tie-break
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    let countQuery = `
      SELECT COUNT(*) as count
      FROM tax_invoices ti
      LEFT JOIN orders o ON ti.order_id = o.id
      LEFT JOIN clients c ON ti.buyer_client_id = c.id
    `
    const countParams: any[] = []
    const countWhereClauses: string[] = []

    if (status) {
      countWhereClauses.push('ti.status = ?')
      countParams.push(status)
    }
    if (search) {
      countWhereClauses.push('(ti.invoice_number LIKE ? OR o.order_number LIKE ? OR ti.buyer_name LIKE ?)')
      const p = `%${search}%`
      countParams.push(p, p, p)
    }
    if (date_from) {
      countWhereClauses.push('ti.issue_date >= ?')
      countParams.push(date_from)
    }
    if (date_to) {
      countWhereClauses.push('ti.issue_date <= ?')
      countParams.push(date_to)
    }
    if (ef.clause) {
      countWhereClauses.push(ef.clause.replace(' AND ', ''))
      countParams.push(...ef.params)
    }

    if (countWhereClauses.length > 0) {
      countQuery += ' WHERE ' + countWhereClauses.join(' AND ')
    }

    const countRow = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ count: number }>()
    const count = countRow?.count ?? 0

    return c.json({
      success: true,
      data: results,
      pagination: {
        page: parseInt(page),
        limit: safeLimit,
        total: count,
        total_pages: Math.ceil(count / safeLimit)
      }
    })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /billing-pending-summary — 회계반영 대기(SHIPPED·미청구) KPI 서버 집계
// 프론트(taxInvoices.js loadBillingPendingOrders / ledger.js loadBillingPending)의 limit=500 fetch 후
// 클라 합산(반영대기 건수·금액·법정기한 초과/임박·정산대기)을 서버로 이관 → 상한 초과 시 수치 조용히 축소 제거.
// 조건: /api/orders?status=SHIPPED&billing_status=NONE 와 동일(status SHIPPED + billing_status NULL/'') + entityFilter.
// 공급일=COALESCE(date(shipped_at), order_date)(orders에 shipment_date 컬럼 없음), 법정기한=공급월 익월 10일, KST 기준.
// ready=billable_after 미도래분 제외(청구 가능), waiting=billable_after 미도래.
taxInvoicesQueriesRouter.get('/billing-pending-summary', async (c) => {
  try {
    const ef = entityFilter(c, 'o')
    const row = await c.env.DB.prepare(`
      WITH pend AS (
        SELECT
          COALESCE(o.final_amount, 0) AS amount,
          (o.billable_after IS NULL OR o.billable_after = '' OR o.billable_after <= date('now','+9 hours')) AS is_ready,
          date(COALESCE(date(o.shipped_at), o.order_date), 'start of month', '+1 month', '+9 days') AS legal_due
        FROM orders o
        WHERE o.status = 'SHIPPED'
          AND (o.billing_status IS NULL OR o.billing_status = '')${ef.clause}
      )
      SELECT
        COUNT(*) AS total_count,
        COALESCE(SUM(amount), 0) AS total_amount,
        COALESCE(SUM(CASE WHEN is_ready THEN 1 ELSE 0 END), 0) AS ready_count,
        COALESCE(SUM(CASE WHEN is_ready THEN amount ELSE 0 END), 0) AS ready_amount,
        COALESCE(SUM(CASE WHEN NOT is_ready THEN 1 ELSE 0 END), 0) AS waiting_count,
        COALESCE(SUM(CASE WHEN is_ready AND legal_due IS NOT NULL AND legal_due < date('now','+9 hours') THEN 1 ELSE 0 END), 0) AS overdue_count,
        COALESCE(SUM(CASE WHEN is_ready AND legal_due IS NOT NULL AND legal_due >= date('now','+9 hours')
                           AND CAST(julianday(legal_due) - julianday(date('now','+9 hours')) AS INTEGER) <= 7
                          THEN 1 ELSE 0 END), 0) AS imminent_count
      FROM pend
    `).bind(...ef.params).first<{
      total_count: number; total_amount: number; ready_count: number; ready_amount: number;
      waiting_count: number; overdue_count: number; imminent_count: number
    }>()

    return c.json({
      success: true,
      data: {
        total_count: row?.total_count || 0,
        total_amount: row?.total_amount || 0,
        ready_count: row?.ready_count || 0,
        ready_amount: row?.ready_amount || 0,
        waiting_count: row?.waiting_count || 0,
        overdue_count: row?.overdue_count || 0,
        imminent_count: row?.imminent_count || 0,
      }
    })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts billing-pending-summary error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /eligible-orders — Orders eligible for tax invoice (not yet invoiced)
// client_id 있으면 해당 거래처만, 없으면 전체를 거래처별 그룹핑하여 반환
taxInvoicesQueriesRouter.get('/eligible-orders', async (c) => {
  try {
    const { client_id, from, to } = c.req.query()

    const params: any[] = []
    const whereClauses: string[] = [
      `o.status IN ('CONFIRMED', 'PRINTING', 'PRINT_DONE', 'SHIPPED')`,
      `o.id NOT IN (SELECT tio.order_id FROM tax_invoice_orders tio JOIN tax_invoices ti ON tio.tax_invoice_id = ti.id WHERE ti.status != 'CANCELLED')`,
      `COALESCE(c.invoice_method, 'PER_ORDER') NOT IN ('CARD', 'ISSUED_BY_OTHER')`
    ]

    // 멀티사업자 entity 필터
    const ef = entityFilter(c, 'o')
    if (ef.clause) {
      whereClauses.push(ef.clause.replace(/^\s*AND\s*/i, ''))
      if (ef.params) params.push(...ef.params)
    }

    if (client_id) {
      whereClauses.push('o.client_id = ?')
      params.push(parseInt(client_id))
    }
    if (from) {
      whereClauses.push('o.order_date >= ?')
      params.push(from)
    }
    if (to) {
      whereClauses.push('o.order_date <= ?')
      params.push(to)
    }

    const query = `
      SELECT o.id, o.order_number, o.order_date, o.total_amount, o.vat_amount,
             (o.total_amount + o.vat_amount) as final_amount,
             o.billing_status,
             c.id as client_id, c.client_name, c.business_registration_number,
             c.email as client_email, c.invoice_method
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY c.client_name ASC, o.order_date DESC, o.id DESC
    `

    const { results } = params.length > 0
      ? await c.env.DB.prepare(query).bind(...params).all()
      : await c.env.DB.prepare(query).all()

    // client_id가 지정된 경우 기존처럼 flat 배열 반환 (하위호환)
    if (client_id) {
      return c.json({ success: true, data: results })
    }

    // client_id 없으면 거래처별 그룹핑 (JS에서 수행)
    const clientMap = new Map<number, {
      client_id: number
      client_name: string
      business_registration_number: string | null
      client_email: string | null
      invoice_method: string | null
      brn_missing: boolean
      orders: any[]
    }>()

    for (const row of results as EligibleOrderRow[]) {
      const cid = row.client_id
      if (!clientMap.has(cid)) {
        clientMap.set(cid, {
          client_id: cid,
          client_name: row.client_name || '(거래처 없음)',
          business_registration_number: row.business_registration_number || null,
          client_email: row.client_email || null,
          invoice_method: row.invoice_method || null,
          brn_missing: !row.business_registration_number,
          orders: []
        })
      }
      clientMap.get(cid)!.orders.push({
        id: row.id,
        order_number: row.order_number,
        order_date: row.order_date,
        total_amount: parseFloat(row.total_amount) || 0,
        vat_amount: parseFloat(row.vat_amount) || 0,
        final_amount: parseFloat(row.final_amount) || 0
      })
    }

    const data = Array.from(clientMap.values()).map(group => {
      const supply_total = group.orders.reduce((s, o) => s + o.total_amount, 0)
      const tax_total = group.orders.reduce((s, o) => s + o.vat_amount, 0)
      return {
        ...group,
        summary: {
          count: group.orders.length,
          supply_total,
          tax_total,
          total: supply_total + tax_total
        }
      }
    })

    const grand_total = {
      count: data.reduce((s, g) => s + g.summary.count, 0),
      supply_total: data.reduce((s, g) => s + g.summary.supply_total, 0),
      tax_total: data.reduce((s, g) => s + g.summary.tax_total, 0),
      total: data.reduce((s, g) => s + g.summary.total, 0)
    }

    return c.json({ success: true, data, grand_total })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /order/:orderId — Get tax invoices for specific order (must be before /:id)
taxInvoicesQueriesRouter.get('/order/:orderId', async (c) => {
  try {
    const orderId = parseInt(c.req.param('orderId'))

    // junction 테이블도 함께 검색 (단건 order_id 컬럼 + junction 테이블)
    const ef = entityFilter(c, 'ti')
    const { results } = await c.env.DB.prepare(`
      SELECT ti.*, o.order_number
      FROM tax_invoices ti
      LEFT JOIN orders o ON ti.order_id = o.id
      WHERE ti.order_id = ?${ef.clause}
      UNION
      SELECT ti.*, o.order_number
      FROM tax_invoices ti
      JOIN tax_invoice_orders tio ON tio.tax_invoice_id = ti.id
      LEFT JOIN orders o ON ti.order_id = o.id
      WHERE tio.order_id = ?${ef.clause}
      ORDER BY created_at DESC, id DESC
      -- UNION(compound SELECT)의 ORDER BY는 출력 컬럼만 참조 가능 → 별칭(ti.id) 금지, id 사용
    `).bind(orderId, ...ef.params, orderId, ...ef.params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /:id — Single tax invoice detail
// '/:id{[0-9]+}': 숫자 ID만 매칭 → 뒤에 등록된 정적 라우트(GET /monthly-eligible 등)가 섀도잉되지 않도록.
taxInvoicesQueriesRouter.get('/:id{[0-9]+}', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))

    const ef = entityFilter(c, 'ti')
    const invoice = await c.env.DB.prepare(`
      SELECT ti.*, o.order_number
      FROM tax_invoices ti
      LEFT JOIN orders o ON ti.order_id = o.id
      WHERE ti.id = ?${ef.clause}
    `).bind(id, ...ef.params).first()

    if (!invoice) {
      return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
    }

    const { results: items } = await c.env.DB.prepare(
      'SELECT id, tax_invoice_id, item_date, item_name, specification, quantity, unit_price, supply_amount, tax_amount, notes, sort_order FROM tax_invoice_items WHERE tax_invoice_id = ? ORDER BY sort_order'
    ).bind(id).all()

    // 연결된 주문 목록 조회 (묶음 발행 지원)
    const { results: orders } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.order_date, o.total_amount, o.vat_amount
      FROM tax_invoice_orders tio
      JOIN orders o ON tio.order_id = o.id
      WHERE tio.tax_invoice_id = ?
      ORDER BY o.order_date ASC, o.id ASC
    `).bind(id).all()

    return c.json({ success: true, data: { ...invoice, items, orders } })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /monthly-eligible - 월합산 대상 거래처 + 미발행 주문
// ============================================================================
taxInvoicesQueriesRouter.get('/monthly-eligible', async (c) => {
  try {
    const { year, month } = c.req.query()
    const y = year || kstYm().slice(0, 4)
    const m = month || kstYm().slice(5, 7)
    const dateFrom = `${y}-${m}-01`
    const dateTo = `${y}-${m}-31`

    // #581 형제 완전성: 실발행(POST /monthly-create)에 entity 필터를 넣었으므로 미리보기도
    //   같은 집합을 보여야 한다(안 그러면 "미리보기 N건인데 발행은 M건" 불일치).
    const efMonthly = entityFilter(c, 'o')

    // 월합산 대상 거래처의 해당 월 미발행 BILLED 주문
    const { results } = await c.env.DB.prepare(`
      SELECT c.id as client_id, c.client_name, c.business_registration_number,
             c.email as client_email, c.invoice_method,
             o.id as order_id, o.order_number, o.order_date, o.total_amount, o.vat_amount,
             (o.total_amount + o.vat_amount) as final_amount
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE c.invoice_method = 'MONTHLY'
        AND o.order_date >= ? AND o.order_date <= ?
        AND o.status IN ('CONFIRMED', 'PRINTING', 'PRINT_DONE', 'SHIPPED')
        AND o.id NOT IN (
          SELECT tio.order_id FROM tax_invoice_orders tio
          JOIN tax_invoices ti ON tio.tax_invoice_id = ti.id
          WHERE ti.status != 'CANCELLED'
        )${efMonthly.clause}
      ORDER BY c.client_name ASC, o.order_date ASC
    `).bind(dateFrom, dateTo, ...efMonthly.params).all()

    // 거래처별 그룹핑
    type MonthlyEligibleGroup = {
      client_id: number; client_name: string; business_registration_number: string | null;
      client_email: string | null; orders: Array<Record<string, unknown>>;
      total_supply: number; total_tax: number; total_amount: number;
    }
    const grouped: Record<number, MonthlyEligibleGroup> = {}
    type MonthlyRow = EligibleOrderRow & { order_id: number; final_amount: string }
    for (const row of results as MonthlyRow[]) {
      if (!grouped[row.client_id]) {
        grouped[row.client_id] = {
          client_id: row.client_id,
          client_name: row.client_name,
          business_registration_number: row.business_registration_number,
          client_email: row.client_email,
          orders: [],
          total_supply: 0,
          total_tax: 0,
          total_amount: 0,
        }
      }
      grouped[row.client_id].orders.push({
        order_id: row.order_id,
        order_number: row.order_number,
        order_date: row.order_date,
        total_amount: parseFloat(row.total_amount) || 0,
        vat_amount: parseFloat(row.vat_amount) || 0,
        final_amount: parseFloat(row.final_amount) || 0,
      })
      grouped[row.client_id].total_supply += parseFloat(row.total_amount) || 0
      grouped[row.client_id].total_tax += parseFloat(row.vat_amount) || 0
      grouped[row.client_id].total_amount += parseFloat(row.final_amount) || 0
    }

    return c.json({
      success: true,
      data: Object.values(grouped),
      period: { year: y, month: m }
    })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /:id/print-url — 인쇄/PDF URL 조회
taxInvoicesQueriesRouter.get('/:id/print-url', async (c) => {
  const db = c.env.DB
  const env = c.env
  const id = parseInt(c.req.param('id'))

  try {
    const ef = entityFilter(c)
    const invoice = await db.prepare(
      `SELECT id, invoice_number, status, supplier_brn FROM tax_invoices WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; invoice_number: string; status: string; supplier_brn: string }>()

    if (!invoice) return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
    if (!['ISSUED', 'SENT', 'NTS_SUCCESS', 'NTS_FAILED'].includes(invoice.status)) {
      return c.json({ success: false, error: '발행된 세금계산서만 조회 가능합니다.' })
    }

    const provider = await getTaxProvider(db, env, invoice.supplier_brn.replace(/-/g, ''))
    if (!provider) return c.json({ success: false, error: 'Provider 설정이 없습니다.' })

    const result = await provider.getPrintURL(invoice.invoice_number)

    return c.json({
      success: true,
      data: { url: result.url }
    })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts print-url error:', error)
    return c.json({
      success: false,
      error: '인쇄 URL 조회에 실패했습니다'
    }, 500)
  }
})


export default taxInvoicesQueriesRouter
