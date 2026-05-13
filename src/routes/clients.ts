import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import type { Client, ApiResponse, PaginatedResponse } from '../types/models'
import { authMiddleware, requireRole } from '../middleware/auth'
import { hashPassword } from '../utils/crypto'

const clientsRouter = new Hono<HonoEnv>()

// Apply authentication middleware to all routes
clientsRouter.use('/*', authMiddleware)

// RBAC: Only ADMIN and MANAGER can create/import clients
clientsRouter.use('/import', requireRole('ADMIN', 'MANAGER'))

// GET /check-brn/:brn — 사업자등록상태조회 (팝빌)
clientsRouter.get('/check-brn/:brn', async (c) => {
  const brn = c.req.param('brn').replace(/-/g, '')
  if (brn.length !== 10) {
    return c.json({ success: false, error: '사업자등록번호는 10자리여야 합니다.' }, 400)
  }

  const db = c.env.DB
  const env = c.env

  // 팝빌 연동 설정 확인
  const linkedIdSetting = await db.prepare(
    `SELECT setting_value FROM settings WHERE setting_key = 'tax_provider_linked_id'`
  ).first<{ setting_value: string }>()
  const secretKey = env.POPBILL_SECRET_KEY
  const linkedId = linkedIdSetting?.setting_value

  if (!linkedId || !secretKey) {
    return c.json({ success: false, error: '팝빌 연동 설정이 없습니다.' }, 400)
  }

  // 공급자 사업자번호 조회
  const supplierBrn = await db.prepare(
    `SELECT setting_value FROM settings WHERE setting_key = 'company_business_registration_number'`
  ).first<{ setting_value: string }>()
  const corpNum = supplierBrn?.setting_value?.replace(/-/g, '') || ''
  if (!corpNum) {
    return c.json({ success: false, error: '공급자 사업자번호 설정이 없습니다.' }, 400)
  }

  try {
    const { createPopbillProvider } = await import('../services/popbillProvider')
    const testModeSetting = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_test_mode'`
    ).first<{ setting_value: string }>()
    const isTestMode = testModeSetting?.setting_value === '1'
    const provider = createPopbillProvider(linkedId, secretKey, corpNum, isTestMode)
    const result = await provider.checkCorpNum(brn)
    return c.json({ success: true, data: result })
  } catch (error) {
    console.error('src/routes/clients.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get all clients
clientsRouter.get('/', async (c) => {
  try {
    const { page = '1', limit = '50', search = '', client_type = '', active = '', invoice_method = '', delivery_method = '', sort = 'name', dormant = '', has_balance = '', credit_hold = '' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 50, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    // WHERE 절 + params를 한 번만 빌드 (alias c. 사용, 카운트 쿼리도 FROM clients c로 통일)
    function buildClientFilters(q: { active: string; search: string; client_type: string; invoice_method: string; delivery_method: string; has_balance: string; credit_hold: string }) {
      let where = ' WHERE 1=1'
      const fp: any[] = []

      // 활성/비활성 필터 (기본: 활성만)
      if (q.active === 'all') {
        // 전체
      } else if (q.active === '0') {
        where += ' AND c.is_active = 0'
      } else {
        where += ' AND c.is_active = 1'
      }

      if (q.search) {
        where += ' AND (c.client_name LIKE ? OR c.client_code LIKE ? OR c.search_keywords LIKE ? OR c.business_registration_number LIKE ? OR c.phone LIKE ? OR c.mobile LIKE ?)'
        const searchPattern = `%${q.search}%`
        fp.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern)
      }

      // client_type 필터: SALES → SALES+BOTH, PURCHASE → PURCHASE+BOTH, BOTH → BOTH만
      if (q.client_type === 'SALES') {
        where += " AND (c.client_type = 'SALES' OR c.client_type = 'BOTH')"
      } else if (q.client_type === 'PURCHASE') {
        where += " AND (c.client_type = 'PURCHASE' OR c.client_type = 'BOTH')"
      } else if (q.client_type === 'BOTH') {
        where += " AND c.client_type = 'BOTH'"
      }

      // invoice_method 필터
      if (q.invoice_method) {
        where += ' AND c.invoice_method = ?'
        fp.push(q.invoice_method)
      }

      // delivery_method 필터
      if (q.delivery_method) {
        where += ' AND c.delivery_method = ?'
        fp.push(q.delivery_method)
      }

      // balance 필터
      if (q.has_balance === '1') {
        where += ' AND c.balance > 0'
      }

      // credit_hold 필터
      if (q.credit_hold === '1') {
        where += ' AND c.credit_hold = 1'
      }

      return { where, params: fp }
    }

    const { where: filterWhere, params: filterParams } = buildClientFilters({ active, search, client_type, invoice_method, delivery_method, has_balance, credit_hold })

    // Sort option
    let orderByClause = ' ORDER BY c.client_name ASC'
    if (sort === 'last_order') orderByClause = ' ORDER BY last_order_date DESC NULLS LAST, c.client_name ASC'
    else if (sort === 'created') orderByClause = ' ORDER BY c.created_at DESC'

    // Dormant filter (needs last_order_date subquery)
    let dormantWhere = ''
    const dormantParams: any[] = []
    if (dormant && ['30', '60', '90', '180'].includes(dormant)) {
      dormantWhere = ` AND (last_order_date IS NULL OR last_order_date < date('now', '-' || ? || ' days'))`
      dormantParams.push(dormant)
    }

    const query = `SELECT *, last_order_date FROM (SELECT c.*, pl.name as price_list_name, (SELECT MAX(order_date) FROM orders WHERE client_id = c.id) as last_order_date FROM clients c LEFT JOIN price_lists pl ON c.price_list_id = pl.id` + filterWhere + `) c WHERE 1=1` + dormantWhere + orderByClause + ' LIMIT ? OFFSET ?'
    const params = [...filterParams, ...dormantParams, safeLimit, offset]

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // Get total count (same filters, FROM clients c로 alias 통일)
    let countQuery: string
    let countParams: any[]
    if (dormantWhere) {
      countQuery = `SELECT COUNT(*) as count FROM (SELECT c.*, (SELECT MAX(order_date) FROM orders WHERE client_id = c.id) as last_order_date FROM clients c` + filterWhere + `) c WHERE 1=1` + dormantWhere
      countParams = [...filterParams, ...dormantParams]
    } else {
      countQuery = 'SELECT COUNT(*) as count FROM clients c' + filterWhere
      countParams = [...filterParams]
    }
    const { count } = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ count: number }>() as { count: number }

    return c.json({
      success: true,
      data: {
        clients: results as unknown as Client[],
        pagination: {
          page: parseInt(page),
          limit: safeLimit,
          total: count,
          total_pages: Math.ceil(count / safeLimit)
        }
      }
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// 거래처 여신 체크
clientsRouter.get('/:id/credit-check', async (c) => {
  try {
    const id = c.req.param('id')
    const client = await c.env.DB.prepare(
      'SELECT id, client_name, credit_limit, credit_hold FROM clients WHERE id = ?'
    ).bind(id).first<{ id: number; client_name: string; credit_limit: number | null; credit_hold: number }>()
    if (!client) return c.json({ success: false, error: '거래처를 찾을 수 없습니다.' }, 404)

    // 차단 상태
    if (client.credit_hold) {
      return c.json({ success: true, data: { status: 'BLOCKED', message: '관리자에 의해 주문이 차단되었습니다.' } })
    }

    // 여신한도 미설정
    if (!client.credit_limit || client.credit_limit <= 0) {
      return c.json({ success: true, data: { status: 'OK', message: '' } })
    }

    // 미수금 합계 조회
    const ar = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(CASE WHEN o.final_amount > 0 THEN o.final_amount ELSE 0 END), 0)
           - COALESCE(SUM(CASE WHEN o.paid_amount > 0 THEN o.paid_amount ELSE 0 END), 0) as balance
      FROM orders o
      WHERE o.client_id = ? AND o.status NOT IN ('CANCELLED','DELETED','QUOTATION')
    `).bind(id).first<{ balance: number }>()
    const balance = ar?.balance || 0

    if (balance >= client.credit_limit) {
      return c.json({ success: true, data: {
        status: 'EXCEEDED',
        message: `미수금 ${balance.toLocaleString()}원 / 한도 ${client.credit_limit.toLocaleString()}원`
      }})
    }
    if (balance >= client.credit_limit * 0.8) {
      return c.json({ success: true, data: {
        status: 'WARNING',
        message: `미수금 ${balance.toLocaleString()}원 / 한도 ${client.credit_limit.toLocaleString()}원 (${Math.round(balance / client.credit_limit * 100)}%)`
      }})
    }

    return c.json({ success: true, data: { status: 'OK', message: '' } })
  } catch (error) {
    console.error('credit-check error:', error)
    return c.json({ success: true, data: { status: 'OK', message: '' } })
  }
})

// Get client by ID
clientsRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const client = await c.env.DB.prepare(
      'SELECT * FROM clients WHERE id = ?'
    ).bind(id).first()

    if (!client) {
      return c.json({
        success: false,
        error: 'Client not found'
      }, 404)
    }

    const response: ApiResponse<Client> = {
      success: true,
      data: client as unknown as Client
    }

    return c.json(response)
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /:id/detail - 거래처 통합 뷰 (주문, 미수금, 견적, 단가, 메모)
clientsRouter.get('/:id/detail', async (c) => {
  try {
    const id = c.req.param('id')

    // Client info
    const client = await c.env.DB.prepare(
      'SELECT * FROM clients WHERE id = ?'
    ).bind(id).first()

    if (!client) {
      return c.json({ success: false, error: 'Client not found' }, 404)
    }

    // Recent orders (last 20)
    const { results: orders } = await c.env.DB.prepare(`
      SELECT id, order_number, order_date, delivery_date, final_amount, status, billing_status, created_at
      FROM orders
      WHERE client_id = ? AND status != 'QUOTATION'
      ORDER BY created_at DESC
      LIMIT 20
    `).bind(id).all()

    // Active quotations
    const { results: quotations } = await c.env.DB.prepare(`
      SELECT id, order_number, final_amount, status, valid_until, created_at
      FROM orders
      WHERE client_id = ? AND status = 'QUOTATION'
      ORDER BY created_at DESC
      LIMIT 10
    `).bind(id).all()

    // Receivables summary
    const receivables = await c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN billing_status = 'BILLED' THEN billed_amount ELSE 0 END), 0) as total_billed,
        COUNT(CASE WHEN billing_status = 'BILLED' THEN 1 END) as billed_count
      FROM orders WHERE client_id = ?
    `).bind(id).first<{ total_billed: number; billed_count: number }>()

    const payments = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_payments,
        MAX(payment_date) as last_payment_date
      FROM payments WHERE client_id = ?
    `).bind(id).first<{ total_payments: number; last_payment_date: string | null }>()

    // Client-specific prices
    const { results: prices } = await c.env.DB.prepare(`
      SELECT cp.*, i.item_name, i.category
      FROM client_item_prices cp
      JOIN items i ON cp.item_id = i.id
      WHERE cp.client_id = ?
      ORDER BY i.item_name
      LIMIT 30
    `).bind(id).all()

    // Client notes
    const { results: notes } = await c.env.DB.prepare(`
      SELECT cn.*, u.name as created_by_name
      FROM client_notes cn
      LEFT JOIN users u ON cn.created_by = u.id
      WHERE cn.client_id = ?
      ORDER BY cn.created_at DESC
      LIMIT 20
    `).bind(id).all()

    // Collection logs
    const { results: collectionLogs } = await c.env.DB.prepare(`
      SELECT cl.*, u.name as created_by_name
      FROM collection_logs cl
      LEFT JOIN users u ON cl.created_by = u.id
      WHERE cl.client_id = ?
      ORDER BY cl.contact_date DESC
      LIMIT 10
    `).bind(id).all()

    // Monthly revenue trend (last 6 months)
    const { results: monthlyTrend } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as order_count,
        COALESCE(SUM(final_amount), 0) as revenue
      FROM orders
      WHERE client_id = ? AND status != 'CANCELLED'
        AND created_at >= date('now', '-6 months')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
    `).bind(id).all()

    return c.json({
      success: true,
      data: {
        client,
        orders,
        quotations,
        receivables: {
          total_billed: receivables?.total_billed || 0,
          total_payments: payments?.total_payments || 0,
          balance: (client as Record<string, unknown>).balance as number || 0,
          billed_count: receivables?.billed_count || 0,
          last_payment_date: payments?.last_payment_date || null
        },
        prices,
        notes,
        collection_logs: collectionLogs,
        monthly_trend: monthlyTrend
      }
    })
  } catch (error) {
    console.error('src/routes/clients.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /:id/intelligence - 거래처 인텔리전스 (수익성, 신용, 성장, 위험)
clientsRouter.get('/:id/intelligence', async (c) => {
  try {
    const id = c.req.param('id')

    const client = await c.env.DB.prepare(
      'SELECT id, balance FROM clients WHERE id = ?'
    ).bind(id).first<{ id: number; balance: number }>()
    if (!client) return c.json({ success: false, error: 'Client not found' }, 404)

    // 1. 수익성: 최근 6개월 매출/원가/마진
    const profitability = await c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(oi.unit_price * oi.quantity), 0) as total_revenue,
        COALESCE(SUM(oi.total_cost), 0) as total_cost
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.client_id = ? AND o.status != 'CANCELLED'
        AND oi.parent_item_id IS NULL
        AND o.created_at >= date('now', '-6 months')
    `).bind(id).first<{ total_revenue: number; total_cost: number }>()

    const revenue = Number(profitability?.total_revenue || 0)
    const cost = Number(profitability?.total_cost || 0)
    const marginRate = revenue > 0 ? Math.round((revenue - cost) / revenue * 1000) / 10 : 0
    let profitGrade = 'D'
    if (marginRate >= 50) profitGrade = 'A'
    else if (marginRate >= 35) profitGrade = 'B'
    else if (marginRate >= 20) profitGrade = 'C'

    // 2. 결제 성향: 미수금 비율, 최근 입금
    const paymentStats = await c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(amount), 0) as total_payments,
        MAX(payment_date) as last_payment_date,
        COUNT(*) as payment_count
      FROM payments WHERE client_id = ?
    `).bind(id).first<{ total_payments: number; last_payment_date: string | null; payment_count: number }>()

    const totalBilled = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(billed_amount), 0) as total
      FROM orders WHERE client_id = ? AND billing_status = 'BILLED'
    `).bind(id).first<{ total: number }>()

    const billedAmt = Number(totalBilled?.total || 0)
    const paidAmt = Number(paymentStats?.total_payments || 0)
    const balance = Number(client.balance || 0)
    const arRatio = billedAmt > 0 ? Math.round(balance / billedAmt * 1000) / 10 : 0

    // 3. 성장성: 최근 3개월 vs 이전 3개월
    const recent3 = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(final_amount), 0) as rev
      FROM orders WHERE client_id = ? AND status != 'CANCELLED'
        AND created_at >= date('now', '-3 months')
    `).bind(id).first<{ cnt: number; rev: number }>()

    const prev3 = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(final_amount), 0) as rev
      FROM orders WHERE client_id = ? AND status != 'CANCELLED'
        AND created_at >= date('now', '-6 months') AND created_at < date('now', '-3 months')
    `).bind(id).first<{ cnt: number; rev: number }>()

    const recentRev = Number(recent3?.rev || 0)
    const prevRev = Number(prev3?.rev || 0)
    const growthRate = prevRev > 0
      ? Math.round((recentRev - prevRev) / prevRev * 1000) / 10
      : (recentRev > 0 ? 100 : 0)

    // 4. 거래 빈도 (최근 6개월)
    const recentOrderCount = Number(recent3?.cnt || 0) + Number(prev3?.cnt || 0)

    // 5. 최근 주문일
    const lastOrder = await c.env.DB.prepare(`
      SELECT MAX(created_at) as last_order_date
      FROM orders WHERE client_id = ? AND status != 'CANCELLED'
    `).bind(id).first<{ last_order_date: string | null }>()

    const lastOrderDate = lastOrder?.last_order_date || null
    const daysSinceLastOrder = lastOrderDate
      ? Math.floor((Date.now() - new Date(lastOrderDate).getTime()) / 86400000)
      : 999

    // 6. 독촉 빈도 (최근 6개월)
    const collectionCount = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM collection_logs
      WHERE client_id = ? AND contact_date >= date('now', '-6 months')
    `).bind(id).first<{ cnt: number }>()

    // 7. 위험 신호
    const risks: string[] = []
    if (daysSinceLastOrder >= 90) risks.push('CHURN_RISK')
    if (balance > 0 && billedAmt > 0 && arRatio > 50) risks.push('HIGH_AR')
    if (marginRate < 15 && cost > 0) risks.push('LOW_MARGIN')
    if (growthRate < -30 && prevRev > 0) risks.push('DECLINING')
    if ((collectionCount?.cnt || 0) >= 3) risks.push('FREQUENT_COLLECTION')

    // 8. 종합 신용 점수 (0~100)
    const paymentScore = Math.max(0, Math.min(100, 100 - arRatio * 2))
    const profitScore = Math.min(100, Math.max(0, marginRate * 2))
    const growthScore = Math.min(100, Math.max(0, 50 + growthRate))
    const freqScore = Math.min(100, recentOrderCount * 10)

    const creditScore = Math.round(
      paymentScore * 0.4 + profitScore * 0.3 + growthScore * 0.2 + freqScore * 0.1
    )

    let creditGrade = 'D'
    if (creditScore >= 80) creditGrade = 'A'
    else if (creditScore >= 60) creditGrade = 'B'
    else if (creditScore >= 40) creditGrade = 'C'

    return c.json({
      success: true,
      data: {
        profitability: { revenue, cost, margin_rate: marginRate, grade: profitGrade },
        payment: {
          total_billed: billedAmt, total_paid: paidAmt, balance,
          ar_ratio: arRatio,
          last_payment_date: paymentStats?.last_payment_date || null,
          payment_count: paymentStats?.payment_count || 0
        },
        growth: {
          recent_3m_revenue: recentRev, prev_3m_revenue: prevRev,
          growth_rate: growthRate,
          recent_3m_orders: Number(recent3?.cnt || 0),
          prev_3m_orders: Number(prev3?.cnt || 0)
        },
        activity: {
          last_order_date: lastOrderDate,
          days_since_last_order: daysSinceLastOrder,
          order_count_6m: recentOrderCount,
          collection_count_6m: collectionCount?.cnt || 0
        },
        credit: {
          score: creditScore, grade: creditGrade,
          breakdown: { payment: Math.round(paymentScore), profit: Math.round(profitScore), growth: Math.round(growthScore), frequency: Math.round(freqScore) }
        },
        risks
      }
    })
  } catch (error) {
    console.error('src/routes/clients.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /:id/notes - 메모 등록
clientsRouter.post('/:id/notes', requireRole('ADMIN', 'MANAGER', 'DESIGNER'), async (c) => {
  try {
    const clientId = c.req.param('id')
    const user = c.get('user')
    const body = await c.req.json()

    if (!body.content) {
      return c.json({ success: false, error: '내용을 입력하세요' }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO client_notes (client_id, note_type, content, created_by)
      VALUES (?, ?, ?, ?)
    `).bind(
      clientId,
      body.note_type || 'GENERAL',
      body.content,
      user?.id || null
    ).run()

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id },
      message: '메모가 등록되었습니다'
    })
  } catch (error) {
    console.error('src/routes/clients.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /:id/notes/:noteId - 메모 삭제
clientsRouter.delete('/:id/notes/:noteId', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const noteId = c.req.param('noteId')
    const existing = await c.env.DB.prepare('SELECT id FROM client_notes WHERE id = ?').bind(noteId).first()
    if (!existing) {
      return c.json({ success: false, error: '메모를 찾을 수 없습니다' }, 404)
    }
    await c.env.DB.prepare('DELETE FROM client_notes WHERE id = ?').bind(noteId).run()
    return c.json({ success: true, message: '삭제되었습니다' })
  } catch (error) {
    console.error('src/routes/clients.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Bulk import clients
clientsRouter.post('/import', async (c) => {
  try {
    const { clients } = await c.req.json() as { clients: any[] }

    if (!Array.isArray(clients) || clients.length === 0) {
      return c.json({
        success: false,
        error: 'Invalid data: clients array is required'
      }, 400)
    }

    const results = {
      total: clients.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[]
    }

    // Process each client
    for (const clientData of clients) {
      try {
        // Validate required fields
        if (!clientData.client_code || !clientData.client_name) {
          results.skipped++
          results.errors.push(`Skipped: Missing client_code or client_name`)
          continue
        }

        // Check if client exists (by client_code OR business_registration_number)
        const existing = await c.env.DB.prepare(
          'SELECT id FROM clients WHERE client_code = ? OR (business_registration_number = ? AND business_registration_number IS NOT NULL AND business_registration_number != ?)'
        ).bind(clientData.client_code, clientData.business_registration_number || '', '').first<{ id: number }>()

        if (existing) {
          // Update existing client
          await c.env.DB.prepare(`
            UPDATE clients SET
              client_code = ?,
              client_name = ?,
              representative = ?,
              business_type = ?,
              business_item = ?,
              phone = ?,
              mobile = ?,
              fax = ?,
              email = ?,
              address = ?,
              address_detail = ?,
              search_keywords = ?,
              transfer_info = ?,
              is_active = ?,
              business_registration_number = ?,
              delivery_method = ?,
              delivery_address = ?,
              invoice_method = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
            clientData.client_code,
            clientData.client_name || '',
            clientData.representative || null,
            clientData.business_type || null,
            clientData.business_item || null,
            clientData.phone || null,
            clientData.mobile || null,
            clientData.fax || null,
            clientData.email || null,
            clientData.address || null,
            clientData.address_detail || null,
            clientData.search_keywords || null,
            clientData.transfer_info || null,
            clientData.is_active !== undefined ? clientData.is_active : 1,
            clientData.business_registration_number || null,
            clientData.delivery_method || 'SAME',
            clientData.delivery_address || null,
            clientData.invoice_method || clientData.invoice_type || 'PER_ORDER',
            existing.id
          ).run()

          results.updated++
        } else {
          // Insert new client
          await c.env.DB.prepare(`
            INSERT INTO clients (
              client_code, client_name, representative, business_type, business_item,
              phone, mobile, fax, email, address, address_detail, search_keywords, transfer_info, is_active,
              business_registration_number, delivery_method, delivery_address, invoice_method
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            clientData.client_code,
            clientData.client_name,
            clientData.representative || null,
            clientData.business_type || null,
            clientData.business_item || null,
            clientData.phone || null,
            clientData.mobile || null,
            clientData.fax || null,
            clientData.email || null,
            clientData.address || null,
            clientData.address_detail || null,
            clientData.search_keywords || null,
            clientData.transfer_info || null,
            clientData.is_active !== undefined ? clientData.is_active : 1,
            clientData.business_registration_number || null,
            clientData.delivery_method || 'SAME',
            clientData.delivery_address || null,
            clientData.invoice_method || clientData.invoice_type || 'PER_ORDER'
          ).run()

          results.inserted++
        }
      } catch (error) {
        results.skipped++
        console.error('src/routes/clients.ts error:', error)
        results.errors.push(
          `Error processing ${clientData.client_code}: 서버 오류가 발생했습니다.`
        )
      }
    }

    return c.json({
      success: true,
      data: results,
      message: `Imported ${results.inserted} new clients, updated ${results.updated} existing clients`
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Create new client (MANAGER+ only)
clientsRouter.post('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const clientData = await c.req.json()

    // Validate required fields
    if (!clientData.client_name) {
      return c.json({
        success: false,
        error: 'client_name is required'
      }, 400)
    }

    // client_code 자동 채번 (미입력 시)
    if (!clientData.client_code) {
      const clientType = clientData.client_type || 'SALES'
      const prefix = clientType === 'PURCHASE' ? 'P' : clientType === 'BOTH' ? 'B' : 'S'
      const lastCode = await c.env.DB.prepare(
        `SELECT client_code FROM clients WHERE client_code LIKE ? ORDER BY client_code DESC LIMIT 1`
      ).bind(prefix + '-%').first<{ client_code: string }>()
      const nextNum = lastCode ? (parseInt(lastCode.client_code.split('-')[1]) || 0) + 1 : 1
      clientData.client_code = prefix + '-' + String(nextNum).padStart(4, '0')
    }

    // Check if client_code already exists
    const existing = await c.env.DB.prepare(
      'SELECT id FROM clients WHERE client_code = ?'
    ).bind(clientData.client_code).first()

    if (existing) {
      return c.json({
        success: false,
        error: 'Client code already exists'
      }, 400)
    }

    // Insert new client
    const clientType = ['SALES', 'PURCHASE', 'BOTH'].includes(clientData.client_type)
      ? clientData.client_type
      : 'SALES'

    let priceListId: number | null = clientData.price_list_id || null
    if (!priceListId) {
      const defaultPl = await c.env.DB.prepare(
        'SELECT id FROM price_lists WHERE is_default = 1 LIMIT 1'
      ).first<{ id: number }>()
      priceListId = defaultPl ? defaultPl.id : null
    }

    let pricePolicyId: number | null = clientData.price_policy_id || null
    if (!pricePolicyId) {
      const defaultPolicy = await c.env.DB.prepare(
        'SELECT id FROM price_policies WHERE is_default = 1 AND is_active = 1 LIMIT 1'
      ).first<{ id: number }>()
      pricePolicyId = defaultPolicy ? defaultPolicy.id : null
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO clients (
        client_code, client_name, representative, business_type, business_item,
        phone, mobile, fax, email, address, search_keywords, transfer_info, is_active,
        business_registration_number, client_type, price_list_id, auto_billing,
        price_policy_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      clientData.client_code,
      clientData.client_name,
      clientData.representative || null,
      clientData.business_type || null,
      clientData.business_item || null,
      clientData.phone || null,
      clientData.mobile || null,
      clientData.fax || null,
      clientData.email || null,
      clientData.address || null,
      clientData.search_keywords || null,
      clientData.transfer_info || null,
      clientData.is_active !== undefined ? clientData.is_active : 1,
      clientData.business_registration_number || null,
      clientType,
      priceListId,
      clientData.auto_billing ? 1 : 0,
      pricePolicyId
    ).run()

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id },
      message: 'Client created successfully'
    })
  } catch (error) {
    console.error('src/routes/clients.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Update client (MANAGER+ only)
clientsRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const clientData = await c.req.json()

    // Check if client exists
    const existing = await c.env.DB.prepare(
      'SELECT id FROM clients WHERE id = ?'
    ).bind(id).first()

    if (!existing) {
      return c.json({
        success: false,
        error: 'Client not found'
      }, 404)
    }

    // Build update query dynamically
    const updates: string[] = []
    const params: any[] = []

    if (clientData.client_name) {
      updates.push('client_name = ?')
      params.push(clientData.client_name)
    }
    if (clientData.representative !== undefined) {
      updates.push('representative = ?')
      params.push(clientData.representative)
    }
    if (clientData.business_type !== undefined) {
      updates.push('business_type = ?')
      params.push(clientData.business_type)
    }
    if (clientData.business_item !== undefined) {
      updates.push('business_item = ?')
      params.push(clientData.business_item)
    }
    if (clientData.phone !== undefined) {
      updates.push('phone = ?')
      params.push(clientData.phone)
    }
    if (clientData.mobile !== undefined) {
      updates.push('mobile = ?')
      params.push(clientData.mobile)
    }
    if (clientData.fax !== undefined) {
      updates.push('fax = ?')
      params.push(clientData.fax)
    }
    if (clientData.email !== undefined) {
      updates.push('email = ?')
      params.push(clientData.email)
    }
    if (clientData.address !== undefined) {
      updates.push('address = ?')
      params.push(clientData.address)
    }
    if (clientData.business_registration_number !== undefined) {
      updates.push('business_registration_number = ?')
      params.push(clientData.business_registration_number)
    }
    if (clientData.client_type !== undefined) {
      if (!['SALES', 'PURCHASE', 'BOTH'].includes(clientData.client_type)) {
        return c.json({
          success: false,
          error: 'client_type must be one of: SALES, PURCHASE, BOTH'
        }, 400)
      }
      updates.push('client_type = ?')
      params.push(clientData.client_type)
    }
    if (clientData.price_list_id !== undefined) {
      updates.push('price_list_id = ?')
      params.push(clientData.price_list_id)
    }
    if (clientData.search_keywords !== undefined) {
      updates.push('search_keywords = ?')
      params.push(clientData.search_keywords)
    }
    if (clientData.transfer_info !== undefined) {
      updates.push('transfer_info = ?')
      params.push(clientData.transfer_info)
    }
    if (clientData.notes !== undefined) {
      updates.push('notes = ?')
      params.push(clientData.notes)
    }
    if (clientData.is_active !== undefined) {
      updates.push('is_active = ?')
      params.push(clientData.is_active)
    }
    if (clientData.delivery_method !== undefined) {
      if (!['SAME', 'FREIGHT', 'DIRECT', 'PICKUP'].includes(clientData.delivery_method)) {
        return c.json({ success: false, error: 'delivery_method must be SAME, FREIGHT, DIRECT, or PICKUP' }, 400)
      }
      updates.push('delivery_method = ?')
      params.push(clientData.delivery_method)
    }
    if (clientData.delivery_address !== undefined) {
      updates.push('delivery_address = ?')
      params.push(clientData.delivery_address)
    }
    // invoice_type 또는 invoice_method 모두 수용 (프론트엔드 호환)
    const invoiceVal = clientData.invoice_type ?? clientData.invoice_method
    if (invoiceVal !== undefined) {
      if (!['PER_ORDER', 'MONTHLY', 'UNDECIDED', 'CARD', 'ISSUED_BY_OTHER'].includes(invoiceVal)) {
        return c.json({ success: false, error: 'invoice_method must be PER_ORDER, MONTHLY, UNDECIDED, CARD, or ISSUED_BY_OTHER' }, 400)
      }
      updates.push('invoice_method = ?')
      params.push(invoiceVal)
    }
    if (clientData.auto_billing !== undefined) {
      updates.push('auto_billing = ?')
      params.push(clientData.auto_billing ? 1 : 0)
    }
    if (clientData.price_policy_id !== undefined) {
      updates.push('price_policy_id = ?')
      params.push(clientData.price_policy_id || null)
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    await c.env.DB.prepare(`
      UPDATE clients SET ${updates.join(', ')} WHERE id = ?
    `).bind(...params).run()

    return c.json({
      success: true,
      message: 'Client updated successfully'
    })
  } catch (error) {
    console.error('src/routes/clients.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Delete client (ADMIN only)
clientsRouter.delete('/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')

    // Check if client exists
    const existing = await c.env.DB.prepare(
      'SELECT id FROM clients WHERE id = ?'
    ).bind(id).first()

    if (!existing) {
      return c.json({
        success: false,
        error: 'Client not found'
      }, 404)
    }

    // Check if client has orders
    const { count } = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM orders WHERE client_id = ?'
    ).bind(id).first<{ count: number }>() as { count: number }

    if (count > 0) {
      return c.json({
        success: false,
        error: '주문이 있는 거래처는 삭제할 수 없습니다. 먼저 주문들을 처리하세요.'
      }, 400)
    }

    // Soft delete (비활성화)
    await c.env.DB.prepare(
      `UPDATE clients SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(id).run()

    return c.json({
      success: true,
      message: '거래처가 비활성화되었습니다.'
    })
  } catch (error) {
    console.error('src/routes/clients.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// 포털 계정 CRUD
// ============================================================================

// GET /:id/portal-account — 포털 계정 조회 (ADMIN/MANAGER)
clientsRouter.get('/:id/portal-account', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const clientId = c.req.param('id')
    const account = await c.env.DB.prepare(`
      SELECT id, login_id, contact_name, contact_phone, contact_email,
             is_active, last_login_at, created_at
      FROM client_accounts
      WHERE client_id = ?
    `).bind(clientId).first<{ id: number; login_id: string; contact_name: string | null; contact_phone: string | null; contact_email: string | null; is_active: number; last_login_at: string | null; created_at: string }>()

    return c.json({ success: true, data: { account: account || null } })
  } catch (error) {
    console.error('src/routes/clients.ts portal-account GET error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /:id/portal-account — 포털 계정 생성 (ADMIN)
clientsRouter.post('/:id/portal-account', requireRole('ADMIN'), async (c) => {
  try {
    const clientId = c.req.param('id')
    const body = await c.req.json()
    const { login_id, password, contact_name, contact_phone, contact_email } = body

    if (!login_id || !password) {
      return c.json({ success: false, error: 'login_id와 password는 필수입니다.' }, 400)
    }

    // 이 거래처에 이미 계정이 있는지 확인
    const existingForClient = await c.env.DB.prepare(
      'SELECT id FROM client_accounts WHERE client_id = ?'
    ).bind(clientId).first()
    if (existingForClient) {
      return c.json({ success: false, error: '이미 포털 계정이 존재합니다.' }, 409)
    }

    // login_id 중복 체크 (전체)
    const existingLoginId = await c.env.DB.prepare(
      'SELECT id FROM client_accounts WHERE login_id = ?'
    ).bind(login_id).first()
    if (existingLoginId) {
      return c.json({ success: false, error: '이미 사용 중인 로그인 ID입니다.' }, 409)
    }

    // PBKDF2 해시
    const passwordHash = await hashPassword(password)

    const result = await c.env.DB.prepare(`
      INSERT INTO client_accounts (client_id, login_id, password_hash, contact_name, contact_phone, contact_email, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).bind(
      clientId,
      login_id,
      passwordHash,
      contact_name || null,
      contact_phone || null,
      contact_email || null
    ).run()

    return c.json({ success: true, data: { account_id: result.meta.last_row_id, login_id } })
  } catch (error) {
    console.error('src/routes/clients.ts portal-account POST error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /:id/portal-account — 포털 계정 수정 (ADMIN)
clientsRouter.patch('/:id/portal-account', requireRole('ADMIN'), async (c) => {
  try {
    const clientId = c.req.param('id')
    const body = await c.req.json()

    const existing = await c.env.DB.prepare(
      'SELECT id FROM client_accounts WHERE client_id = ?'
    ).bind(clientId).first<{ id: number }>()
    if (!existing) {
      return c.json({ success: false, error: '포털 계정이 없습니다.' }, 404)
    }

    const updates: string[] = []
    const params: any[] = []

    if (body.contact_name !== undefined) { updates.push('contact_name = ?'); params.push(body.contact_name || null) }
    if (body.contact_phone !== undefined) { updates.push('contact_phone = ?'); params.push(body.contact_phone || null) }
    if (body.contact_email !== undefined) { updates.push('contact_email = ?'); params.push(body.contact_email || null) }
    if (body.is_active !== undefined) { updates.push('is_active = ?'); params.push(body.is_active ? 1 : 0) }
    if (body.password) {
      const passwordHash = await hashPassword(body.password)
      updates.push('password_hash = ?')
      params.push(passwordHash)
    }

    if (updates.length === 0) {
      return c.json({ success: false, error: '변경할 항목이 없습니다.' }, 400)
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(clientId)

    await c.env.DB.prepare(
      `UPDATE client_accounts SET ${updates.join(', ')} WHERE client_id = ?`
    ).bind(...params).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/clients.ts portal-account PATCH error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /:id/portal-account — 포털 계정 삭제 (ADMIN)
clientsRouter.delete('/:id/portal-account', requireRole('ADMIN'), async (c) => {
  try {
    const clientId = c.req.param('id')

    const existing = await c.env.DB.prepare(
      'SELECT id FROM client_accounts WHERE client_id = ?'
    ).bind(clientId).first()
    if (!existing) {
      return c.json({ success: false, error: '포털 계정이 없습니다.' }, 404)
    }

    await c.env.DB.prepare(
      'DELETE FROM client_accounts WHERE client_id = ?'
    ).bind(clientId).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/clients.ts portal-account DELETE error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 청구 그룹 (Billing Groups) ────────────────────────────────────────────

// GET /billing-groups — 전체 그룹 목록
clientsRouter.get('/billing-groups', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT bg.*, COUNT(cl.id) as member_count
       FROM billing_groups bg
       LEFT JOIN clients cl ON cl.billing_group_id = bg.id
       GROUP BY bg.id
       ORDER BY bg.group_name`
    ).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/clients.ts billing-groups GET error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /billing-groups — 새 그룹 생성
clientsRouter.post('/billing-groups', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { group_name, notes } = await c.req.json()
    if (!group_name?.trim()) {
      return c.json({ success: false, error: '그룹명을 입력하세요.' }, 400)
    }
    const result = await c.env.DB.prepare(
      `INSERT INTO billing_groups (group_name, notes) VALUES (?, ?)`
    ).bind(group_name.trim(), notes || null).run()
    return c.json({ success: true, data: { id: result.meta.last_row_id, group_name: group_name.trim() } })
  } catch (error) {
    console.error('src/routes/clients.ts billing-groups POST error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /:id/billing-group-members — 같은 그룹 멤버 조회
clientsRouter.get('/:id/billing-group-members', async (c) => {
  try {
    const clientId = parseInt(c.req.param('id'))
    const client = await c.env.DB.prepare(
      'SELECT billing_group_id FROM clients WHERE id = ?'
    ).bind(clientId).first<{ billing_group_id: number | null }>()

    if (!client?.billing_group_id) {
      return c.json({ success: true, data: [] })
    }

    const { results } = await c.env.DB.prepare(
      `SELECT id, client_name, business_registration_number
       FROM clients WHERE billing_group_id = ? AND id != ?
       ORDER BY client_name`
    ).bind(client.billing_group_id, clientId).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/clients.ts billing-group-members GET error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /:id/billing-group — 거래처 그룹 변경
clientsRouter.patch('/:id/billing-group', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const clientId = parseInt(c.req.param('id'))
    const { billing_group_id } = await c.req.json()
    await c.env.DB.prepare(
      'UPDATE clients SET billing_group_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(billing_group_id || null, clientId).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/clients.ts billing-group PATCH error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default clientsRouter
     