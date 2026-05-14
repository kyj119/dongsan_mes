import { Hono } from 'hono'
import type { Context } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { createPayment } from '../../lib/payments'
import { logActivity } from '../../utils/activityLog'
import { notifyRoles } from '../../utils/notify'
import { getEntityId, entityFilter } from '../../utils/entityFilter'

// ── Row types for D1 .first<T>() / .all<T>() ──

interface ClientRow {
  id: number
  client_code: string
  client_name: string
  balance: number
  is_active: number
  email?: string | null
  overdue_alert_days?: number | null
}

interface OrderRow {
  id: number
  order_number: string
  order_date: string
  delivery_date: string | null
  final_amount: number
  billed_amount: number | null
  billing_status: string | null
  billed_at: string | null
  status: string
  created_at: string
}

interface PaymentRow {
  id: number
  client_id: number
  payment_date: string
  amount: number
  payment_method: string | null
  reference_number: string | null
  notes: string | null
  created_at: string
  client_name?: string
  created_by_name?: string
}

interface AdjustmentRow {
  id: number
  client_id: number
  order_id: number | null
  type: string
  amount: number
  reason: string | null
  created_at: string
  created_by_name?: string
}

interface IntegrityRow {
  id: number
  client_code: string
  client_name: string
  balance: number
  total_billed: number
  total_paid: number
  total_adj: number
}

interface OrderAggRow { client_id: number; order_count: number; total_sales: number }
interface PaymentAggRow { client_id: number; total_payments: number }

interface MonthlyOrderRow { month: string; order_count: number; total_sales: number }
interface MonthlyPaymentRow { month: string; payment_count: number; total_payments: number }

interface OverdueClientRow {
  id: number
  client_name: string
  balance: number
  oldest_billed_at: string | null
  overdue_days: number
}

interface NotifLinkRow { link: string }

interface CollectionLogRow {
  id: number
  client_id: number
  contact_date: string
  contact_method: string
  contact_person: string | null
  promised_date: string | null
  promised_amount: number | null
  notes: string | null
  result: string | null
  created_by: number | null
  created_at: string
  client_name?: string
  created_by_name?: string
}

interface ReceivableClientRow {
  id: number
  client_code: string
  client_name: string
  balance: number
  last_payment_date: string | null
  billed_order_count: number
  oldest_unpaid_date: string | null
}

interface ReceivableOrderRow {
  id: number
  order_number: string
  order_date: string
  delivery_date: string | null
  final_amount: number
  billed_amount: number
  billing_status: string
  billed_at: string | null
  days_since_billed: number | null
}

interface OverdueAlertRow {
  client_id: number
  client_name: string
  overdue_count: number
  overdue_amount: number
  oldest_billed_at: string | null
  overdue_alert_days: number | null
}

interface UnpaidOrderRow {
  order_number: string
  billed_amount: number
  order_date: string
}

const arRouter = new Hono<HonoEnv>()
arRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

arRouter.get('/client/:clientId', async (c) => {
  try {
    const clientId = c.req.param('clientId')
    const { endDate } = c.req.query()
    // 기본 6개월 제한 (startDate 미지정 시) — 무제한 쿼리로 인한 성능 저하 방지
    const startDate = c.req.query('startDate') || new Date(Date.now() - 180 * 86400000).toISOString().substring(0, 10)

    // Get client info
    const client = await c.env.DB.prepare(
      `SELECT id, client_code, client_name, representative, business_registration_number,
              business_type, business_item, phone, mobile, fax, email, address, postal_code,
              bank_info, is_active, balance, client_type, delivery_method, auto_billing,
              price_policy_id, notes, invoice_method, entity_id, created_at, updated_at
       FROM clients WHERE id = ?`
    ).bind(clientId).first<ClientRow>()

    if (!client) {
      return c.json({
        success: false,
        error: 'Client not found'
      }, 404)
    }

    // Get orders (매출) - billing_status 포함
    const { clause: ordersEf, params: ordersEfParams } = entityFilter(c)
    let ordersQuery = `
      SELECT
        id, order_number, order_date, delivery_date,
        final_amount, billed_amount, billing_status, billed_at, status, created_at
      FROM orders
      WHERE client_id = ?${ordersEf}
    `
    const ordersParams: any[] = [clientId, ...ordersEfParams]

    if (startDate) {
      ordersQuery += ' AND date(created_at) >= ?'
      ordersParams.push(startDate)
    }
    if (endDate) {
      ordersQuery += ' AND date(created_at) <= ?'
      ordersParams.push(endDate)
    }

    ordersQuery += ' ORDER BY created_at ASC'
    const { results: orders } = await c.env.DB.prepare(ordersQuery).bind(...ordersParams).all<OrderRow>()

    // Get payments (입금)
    const { clause: paymentsEf, params: paymentsEfParams } = entityFilter(c)
    let paymentsQuery = `
      SELECT
        id, payment_date, amount, payment_method,
        reference_number, notes, created_at
      FROM payments
      WHERE client_id = ?${paymentsEf}
    `
    const paymentsParams: any[] = [clientId, ...paymentsEfParams]

    if (startDate) {
      paymentsQuery += ' AND date(payment_date) >= ?'
      paymentsParams.push(startDate)
    }
    if (endDate) {
      paymentsQuery += ' AND date(payment_date) <= ?'
      paymentsParams.push(endDate)
    }

    paymentsQuery += ' ORDER BY payment_date ASC'
    const { results: payments } = await c.env.DB.prepare(paymentsQuery).bind(...paymentsParams).all<PaymentRow>()

    // Get adjustments (감액)
    const { clause: adjEf, params: adjEfParams } = entityFilter(c)
    let adjQuery = `
      SELECT
        id, order_id, type, amount, reason, created_at
      FROM adjustments
      WHERE client_id = ?${adjEf}
    `
    const adjParams: any[] = [clientId, ...adjEfParams]

    if (startDate) {
      adjQuery += ' AND date(created_at) >= ?'
      adjParams.push(startDate)
    }
    if (endDate) {
      adjQuery += ' AND date(created_at) <= ?'
      adjParams.push(endDate)
    }

    adjQuery += ' ORDER BY created_at ASC'
    const { results: adjustments } = await c.env.DB.prepare(adjQuery).bind(...adjParams).all<AdjustmentRow>()

    const totalPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const totalAdjustments = adjustments.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)

    // BILLED 주문의 billed_amount 합계만 매출로 집계
    const totalBilled = orders.reduce((sum, o) => {
      return o.billing_status === 'BILLED' ? sum + (Number(o.billed_amount) || Number(o.final_amount) || 0) : sum
    }, 0)
    const calculated_balance = totalBilled - totalPayments - totalAdjustments
    const cached_balance = client.balance || 0
    const has_discrepancy = Math.abs(calculated_balance - cached_balance) > 0.01

    // Find last payment date
    const lastPayment = payments.length > 0 ? payments[payments.length - 1] : null

    // Combine and sort by date ASC for running balance
    const transactions = [
      ...orders.map(o => ({
        type: 'order' as const,
        date: o.created_at,
        description: `주문: ${o.order_number}`,
        debit: o.billing_status === 'BILLED' ? (Number(o.billed_amount) || Number(o.final_amount) || 0) : 0,
        credit: 0,
        reference: o.order_number,
        status: o.status,
        billing_status: o.billing_status,
        billed_amount: o.billed_amount
      })),
      ...payments.map(p => ({
        type: 'payment' as const,
        id: p.id,
        date: p.payment_date,
        description: `입금: ${p.payment_method || ''}`,
        debit: 0,
        credit: Number(p.amount) || 0,
        reference: p.reference_number,
        notes: p.notes
      })),
      ...adjustments.map(a => ({
        type: 'adjustment' as const,
        id: a.id,
        date: a.created_at,
        description: `감액: ${a.reason || a.type}`,
        debit: 0,
        credit: Number(a.amount) || 0,
        reference: a.order_id ? `주문 #${a.order_id}` : null,
        adj_type: a.type
      }))
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Calculate running balance (ascending order)
    let runningBalance = 0
    const transactionsWithBalance = transactions.map(t => {
      runningBalance += t.debit - t.credit
      return {
        ...t,
        balance: runningBalance
      }
    })

    return c.json({
      success: true,
      data: {
        client,
        summary: {
          total_orders: totalBilled,
          total_payments: totalPayments,
          total_adjustments: totalAdjustments,
          balance: calculated_balance,
          calculated_balance,
          cached_balance,
          has_discrepancy,
          last_payment_date: lastPayment ? lastPayment.payment_date : null
        },
        transactions: transactionsWithBalance.reverse(), // newest first for display
        orders_count: orders.length,
        payments_count: payments.length,
        adjustments_count: adjustments.length
      }
    })
  } catch (error) {
    console.error('Get ledger error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /api/ledger/client/:clientId/export/csv - 원장 CSV 다운로드
arRouter.get('/client/:clientId/export/csv', async (c) => {
  try {
    const clientId = c.req.param('clientId')
    const { startDate, endDate } = c.req.query()

    const client = await c.env.DB.prepare('SELECT client_name FROM clients WHERE id = ?').bind(clientId).first<{ client_name: string }>()
    if (!client) return c.json({ success: false, error: 'Client not found' }, 404)

    // Orders (매출)
    const { clause: csvOrdersEf, params: csvOrdersEfParams } = entityFilter(c)
    let ordersQuery = `
      SELECT id, order_number, order_date, final_amount, billed_amount, billing_status, status, created_at
      FROM orders
      WHERE client_id = ?${csvOrdersEf}
    `
    const ordersParams: any[] = [clientId, ...csvOrdersEfParams]
    if (startDate) { ordersQuery += ' AND date(created_at) >= ?'; ordersParams.push(startDate) }
    if (endDate) { ordersQuery += ' AND date(created_at) <= ?'; ordersParams.push(endDate) }
    const { results: orders } = await c.env.DB.prepare(ordersQuery + ' ORDER BY created_at ASC').bind(...ordersParams).all<OrderRow>()

    // Payments (입금)
    const { clause: csvPaymentsEf, params: csvPaymentsEfParams } = entityFilter(c)
    let paymentsQuery = `
      SELECT id, payment_date, amount, payment_method, notes, created_at
      FROM payments
      WHERE client_id = ?${csvPaymentsEf}
    `
    const paymentsParams: any[] = [clientId, ...csvPaymentsEfParams]
    if (startDate) { paymentsQuery += ' AND date(payment_date) >= ?'; paymentsParams.push(startDate) }
    if (endDate) { paymentsQuery += ' AND date(payment_date) <= ?'; paymentsParams.push(endDate) }
    const { results: payments } = await c.env.DB.prepare(paymentsQuery + ' ORDER BY payment_date ASC').bind(...paymentsParams).all<PaymentRow>()

    // Adjustments (감액)
    const { clause: csvAdjEf, params: csvAdjEfParams } = entityFilter(c)
    let adjQuery = `
      SELECT id, order_id, type, amount, reason, created_at
      FROM adjustments
      WHERE client_id = ?${csvAdjEf}
    `
    const adjParams: any[] = [clientId, ...csvAdjEfParams]
    if (startDate) { adjQuery += ' AND date(created_at) >= ?'; adjParams.push(startDate) }
    if (endDate) { adjQuery += ' AND date(created_at) <= ?'; adjParams.push(endDate) }
    const { results: adjustments } = await c.env.DB.prepare(adjQuery + ' ORDER BY created_at ASC').bind(...adjParams).all<AdjustmentRow>()

    const methodLabels: Record<string, string> = { CASH: '현금', CARD: '카드', BANK_TRANSFER: '계좌이체', CHECK: '수표', OTHER: '기타' }

    // Build unified entry list
    interface CsvEntry { date: string; type: string; ref: string; debit: number; credit: number; note: string; balance: number }
    const entries: CsvEntry[] = [
      ...orders.map(o => ({
        date: o.order_date || (o.created_at ? o.created_at.slice(0, 10) : ''),
        type: '매출' as const,
        ref: o.order_number,
        debit: o.billing_status === 'BILLED' ? (Number(o.billed_amount) || Number(o.final_amount) || 0) : (Number(o.final_amount) || 0),
        credit: 0,
        note: '',
        balance: 0
      })),
      ...payments.map(p => ({
        date: p.payment_date,
        type: '입금' as const,
        ref: methodLabels[p.payment_method || ''] || p.payment_method || '',
        debit: 0,
        credit: Number(p.amount) || 0,
        note: p.notes || '',
        balance: 0
      })),
      ...adjustments.map(a => ({
        date: a.created_at ? a.created_at.slice(0, 10) : '',
        type: '감액' as const,
        ref: a.order_id ? `주문 #${a.order_id}` : (a.type || ''),
        debit: 0,
        credit: Number(a.amount) || 0,
        note: a.reason || '',
        balance: 0
      }))
    ]

    // Sort chronologically
    entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

    // Recalculate running balance after sort
    let runBal = 0
    for (const e of entries) {
      runBal += e.debit - e.credit
      e.balance = runBal
    }

    const headers = ['일자', '구분', '참조', '매출(차변)', '입금(대변)', '잔액', '비고']
    const rows = entries.map(e => [e.date, e.type, e.ref, e.debit || '', e.credit || '', e.balance, e.note])

    const { generateCsv, csvResponse } = await import('../../utils/csv')
    const today = new Date().toISOString().slice(0, 10)
    return csvResponse(c, `원장_${client.client_name}_${today}.csv`, generateCsv(headers, rows))
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Record payment (입금 등록 - MANAGER+)
arRouter.post('/payment', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const paymentData = await c.req.json()

    // Validate required fields
    if (!paymentData.client_id || !paymentData.amount || !paymentData.payment_date) {
      return c.json({
        success: false,
        error: 'client_id, amount, payment_date 필수'
      }, 400)
    }

    if (paymentData.amount <= 0) {
      return c.json({
        success: false,
        error: '입금액은 0보다 커야 합니다'
      }, 400)
    }

    // createPayment 공유 함수 사용 (client 존재 확인 + INSERT + balance 차감 포함)
    let result: { payment_id: number; new_balance: number }
    try {
      result = await createPayment(c.env.DB, {
        client_id: paymentData.client_id,
        payment_date: paymentData.payment_date,
        amount: parseFloat(paymentData.amount),
        payment_method: paymentData.payment_method,
        reference_number: paymentData.reference_number,
        notes: paymentData.notes,
        created_by: user?.id || 1,
        entity_id: getEntityId(c),
      })
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Client not found')) {
        return c.json({ success: false, error: 'Client not found' }, 404)
      }
      throw err
    }

    const clientRow = await c.env.DB.prepare('SELECT client_name FROM clients WHERE id = ?').bind(paymentData.client_id).first<{ client_name: string }>()

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'CREATE', entityType: 'PAYMENT', entityId: result.payment_id,
      entityLabel: clientRow?.client_name || String(paymentData.client_id),
      details: JSON.stringify({ amount: parseFloat(paymentData.amount), method: paymentData.payment_method || null })
    })

    await notifyRoles(c.env.DB, ['ADMIN', 'MANAGER'], '입금 등록', `${clientRow?.client_name || ''} - ${Number(paymentData.amount).toLocaleString()}원 입금`, '/ledger')

    return c.json({
      success: true,
      data: {
        id: result.payment_id,
        new_balance: result.new_balance
      },
      message: '입금이 등록되었습니다'
    })
  } catch (error) {
    console.error('Record payment error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get single payment (단일 입금 조회)
arRouter.get('/payment/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const payment = await c.env.DB.prepare(`
      SELECT p.*, c.client_name, u.name as created_by_name
      FROM payments p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ?
    `).bind(id).first()

    if (!payment) {
      return c.json({ success: false, error: '입금 내역을 찾을 수 없습니다' }, 404)
    }

    return c.json({ success: true, data: payment })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Update payment (입금 수정 - MANAGER+)
arRouter.put('/payment/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()

    // Get existing payment
    const existing = await c.env.DB.prepare(
      'SELECT id, client_id, payment_date, amount, payment_method, reference_number, notes, created_at FROM payments WHERE id = ?'
    ).bind(id).first<PaymentRow>()

    if (!existing) {
      return c.json({ success: false, error: '입금 내역을 찾을 수 없습니다' }, 404)
    }

    const newAmount = body.amount !== undefined ? body.amount : existing.amount
    if (newAmount <= 0) {
      return c.json({ success: false, error: '입금액은 0보다 커야 합니다' }, 400)
    }

    // Calculate balance adjustment: old payment restored, new payment applied
    const amountDiff = newAmount - existing.amount

    // D1 batch: 결제 수정 + 잔액 조정을 원자적으로 처리
    const batchStmts = [
      c.env.DB.prepare(`
        UPDATE payments SET
          payment_date = ?,
          amount = ?,
          payment_method = ?,
          reference_number = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        body.payment_date || existing.payment_date,
        newAmount,
        body.payment_method !== undefined ? body.payment_method : existing.payment_method,
        body.reference_number !== undefined ? body.reference_number : existing.reference_number,
        body.notes !== undefined ? body.notes : existing.notes,
        id
      )
    ]
    if (amountDiff !== 0) {
      batchStmts.push(
        c.env.DB.prepare(
          'UPDATE clients SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(amountDiff, existing.client_id)
      )
    }
    await c.env.DB.batch(batchStmts)

    // Get updated balance
    const client = await c.env.DB.prepare(
      'SELECT balance FROM clients WHERE id = ?'
    ).bind(existing.client_id).first<{ balance: number }>()

    return c.json({
      success: true,
      data: { new_balance: client?.balance || 0 },
      message: '입금 내역이 수정되었습니다'
    })
  } catch (error) {
    console.error('Update payment error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Delete payment (입금 삭제 - ADMIN)
arRouter.delete('/payment/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')

    // Get existing payment
    const existing = await c.env.DB.prepare(
      'SELECT id, client_id, payment_date, amount, payment_method, reference_number, notes, created_at FROM payments WHERE id = ?'
    ).bind(id).first<PaymentRow>()

    if (!existing) {
      return c.json({ success: false, error: '입금 내역을 찾을 수 없습니다' }, 404)
    }

    // D1 batch: 결제 삭제 + 잔액 복구를 원자적으로 처리
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM payments WHERE id = ?').bind(id),
      c.env.DB.prepare(
        'UPDATE clients SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(existing.amount, existing.client_id)
    ])

    // Get updated balance
    const client = await c.env.DB.prepare(
      'SELECT balance FROM clients WHERE id = ?'
    ).bind(existing.client_id).first<{ balance: number }>()

    return c.json({
      success: true,
      data: { new_balance: client?.balance || 0 },
      message: '입금 내역이 삭제되었습니다'
    })
  } catch (error) {
    console.error('Delete payment error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get settlement report (정산 리포트)
arRouter.get('/settlement', async (c) => {
  try {
    const { startDate, endDate } = c.req.query()

    // Build order date filter
    const { clause: settlOrderEf, params: settlOrderEfParams } = entityFilter(c, 'o')
    let orderFilter = settlOrderEf
    const orderParams: any[] = [...settlOrderEfParams]
    if (startDate) { orderFilter += ' AND date(o.created_at) >= ?'; orderParams.push(startDate) }
    if (endDate) { orderFilter += ' AND date(o.created_at) <= ?'; orderParams.push(endDate) }

    // Build payment date filter
    const { clause: settlPaymentEf, params: settlPaymentEfParams } = entityFilter(c, 'p')
    let paymentFilter = settlPaymentEf
    const paymentParams: any[] = [...settlPaymentEfParams]
    if (startDate) { paymentFilter += ' AND date(p.payment_date) >= ?'; paymentParams.push(startDate) }
    if (endDate) { paymentFilter += ' AND date(p.payment_date) <= ?'; paymentParams.push(endDate) }

    // Step 1: Get per-client order totals
    const orderQuery = `
      SELECT client_id, COUNT(*) as order_count,
        COALESCE(SUM(CASE WHEN billing_status = 'BILLED' THEN billed_amount ELSE 0 END), 0) as total_sales
      FROM orders o WHERE status != 'CANCELLED' ${orderFilter}
      GROUP BY client_id
    `
    const { results: orderResults } = orderParams.length > 0
      ? await c.env.DB.prepare(orderQuery).bind(...orderParams).all<OrderAggRow>()
      : await c.env.DB.prepare(orderQuery).all<OrderAggRow>()

    // Step 2: Get per-client payment totals
    const paymentQuery = `
      SELECT client_id, COALESCE(SUM(amount), 0) as total_payments
      FROM payments p WHERE 1=1 ${paymentFilter}
      GROUP BY client_id
    `
    const { results: paymentResults } = paymentParams.length > 0
      ? await c.env.DB.prepare(paymentQuery).bind(...paymentParams).all<PaymentAggRow>()
      : await c.env.DB.prepare(paymentQuery).all<PaymentAggRow>()

    // Step 3: Get active clients
    const { results: clients } = await c.env.DB.prepare(
      'SELECT id, client_code, client_name, balance FROM clients WHERE is_active = 1'
    ).all<{ id: number; client_code: string; client_name: string; balance: number }>()

    // Merge
    const orderMap = new Map(orderResults.map(o => [o.client_id, o]))
    const paymentMap = new Map(paymentResults.map(p => [p.client_id, p]))

    const clientRows = clients
      .map(cl => {
        const o = orderMap.get(cl.id)
        const p = paymentMap.get(cl.id)
        if (!o && !p) return null
        return {
          id: cl.id,
          client_code: cl.client_code,
          client_name: cl.client_name,
          balance: cl.balance || 0,
          order_count: o?.order_count || 0,
          total_sales: o?.total_sales || 0,
          total_payments: p?.total_payments || 0
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.balance - a.balance)

    const summary = clientRows.reduce((acc, cl) => ({
      total_clients: acc.total_clients + 1,
      total_sales: acc.total_sales + cl.total_sales,
      total_payments: acc.total_payments + cl.total_payments,
      total_balance: acc.total_balance + cl.balance
    }), { total_clients: 0, total_sales: 0, total_payments: 0, total_balance: 0 })

    return c.json({
      success: true,
      data: { summary, clients: clientRows }
    })
  } catch (error) {
    console.error('Get settlement report error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get monthly summary (월별 요약)
arRouter.get('/monthly-summary', async (c) => {
  try {
    const { year, months = '12' } = c.req.query()
    const targetYear = year || new Date().getFullYear().toString()
    const monthCount = parseInt(months)

    // Monthly order totals
    const { clause: monthlyOrderEf, params: monthlyOrderEfParams } = entityFilter(c)
    const { results: ordersByMonth } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as order_count,
        COALESCE(SUM(final_amount), 0) as total_sales
      FROM orders
      WHERE strftime('%Y', created_at) >= ?${monthlyOrderEf}
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
      LIMIT ?
    `).bind(String(parseInt(targetYear) - 1), ...monthlyOrderEfParams, monthCount).all<MonthlyOrderRow>()

    // Monthly payment totals
    const { clause: monthlyPaymentEf, params: monthlyPaymentEfParams } = entityFilter(c)
    const { results: paymentsByMonth } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', payment_date) as month,
        COUNT(*) as payment_count,
        COALESCE(SUM(amount), 0) as total_payments
      FROM payments
      WHERE strftime('%Y', payment_date) >= ?${monthlyPaymentEf}
      GROUP BY strftime('%Y-%m', payment_date)
      ORDER BY month DESC
      LIMIT ?
    `).bind(String(parseInt(targetYear) - 1), ...monthlyPaymentEfParams, monthCount).all<MonthlyPaymentRow>()

    // Merge into one array
    interface MonthlySummaryEntry { month: string; order_count: number; total_sales: number; payment_count: number; total_payments: number }
    const monthMap = new Map<string, MonthlySummaryEntry>()

    ;ordersByMonth.forEach(o => {
      monthMap.set(o.month, {
        month: o.month,
        order_count: o.order_count,
        total_sales: o.total_sales,
        payment_count: 0,
        total_payments: 0
      })
    })

    ;paymentsByMonth.forEach(p => {
      const existing = monthMap.get(p.month)
      if (existing) {
        existing.payment_count = p.payment_count
        existing.total_payments = p.total_payments
      } else {
        monthMap.set(p.month, {
          month: p.month,
          order_count: 0,
          total_sales: 0,
          payment_count: p.payment_count,
          total_payments: p.total_payments
        })
      }
    })

    const monthlySummary = Array.from(monthMap.values())
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, monthCount)

    return c.json({
      success: true,
      data: monthlySummary
    })
  } catch (error) {
    console.error('Get monthly summary error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get payments list (입금 내역)
arRouter.get('/payments', async (c) => {
  try {
    const { clientId, startDate, endDate } = c.req.query()

    const { clause: listPaymentsEf, params: listPaymentsEfParams } = entityFilter(c, 'p')
    let query = `
      SELECT
        p.*,
        c.client_name,
        u.name as created_by_name
      FROM payments p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE 1=1${listPaymentsEf}
    `
    const params: any[] = [...listPaymentsEfParams]

    if (clientId) {
      query += ' AND p.client_id = ?'
      params.push(clientId)
    }
    if (startDate) {
      query += ' AND date(p.payment_date) >= ?'
      params.push(startDate)
    }
    if (endDate) {
      query += ' AND date(p.payment_date) <= ?'
      params.push(endDate)
    }

    query += ' ORDER BY p.payment_date DESC, p.created_at DESC'

    const { results } = params.length > 0
      ? await c.env.DB.prepare(query).bind(...params).all()
      : await c.env.DB.prepare(query).all()

    return c.json({
      success: true,
      data: results
    })
  } catch (error) {
    console.error('Get payments error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// =============================================================================
// 잔액 재계산 / 미수금 경고 / 감액 관리
// =============================================================================

// 잔액 정합성 집계 쿼리 빌더 (단일 JOIN — N+1 방지)
function buildIntegrityQuery(c: Context<HonoEnv>): { query: string; params: number[] } {
  const { clause: oEf, params: oParams } = entityFilter(c)
  const { clause: pEf, params: pParams } = entityFilter(c)
  const { clause: aEf, params: aParams } = entityFilter(c)
  const query = `
  SELECT c.id, c.client_code, c.client_name, c.balance,
    COALESCE(o.v, 0) as total_billed,
    COALESCE(p.v, 0) as total_paid,
    COALESCE(a.v, 0) as total_adj
  FROM clients c
  LEFT JOIN (
    SELECT client_id, SUM(CASE WHEN billing_status = 'BILLED' THEN billed_amount ELSE 0 END) as v
    FROM orders WHERE 1=1${oEf} GROUP BY client_id
  ) o ON o.client_id = c.id
  LEFT JOIN (
    SELECT client_id, SUM(amount) as v FROM payments WHERE 1=1${pEf} GROUP BY client_id
  ) p ON p.client_id = c.id
  LEFT JOIN (
    SELECT client_id, SUM(amount) as v FROM adjustments WHERE 1=1${aEf} GROUP BY client_id
  ) a ON a.client_id = c.id
  WHERE c.is_active = 1
`
  return { query, params: [...oParams, ...pParams, ...aParams] }
}

// GET /integrity-check - 전체 거래처 잔액 정합성 검사
arRouter.get('/integrity-check', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { query: integrityQuery, params: integrityParams } = buildIntegrityQuery(c)
    const { results: rows } = integrityParams.length > 0
      ? await c.env.DB.prepare(integrityQuery).bind(...integrityParams).all<IntegrityRow>()
      : await c.env.DB.prepare(integrityQuery).all<IntegrityRow>()

    interface DiscrepancyRow { client_id: number; client_code: string; client_name: string; cached_balance: number; calculated_balance: number; difference: number }
    const discrepancies: DiscrepancyRow[] = []
    for (const row of rows) {
      const calculated = Number(row.total_billed) - Number(row.total_paid) - Number(row.total_adj)
      const cached = Number(row.balance) || 0
      if (Math.abs(calculated - cached) > 0.01) {
        discrepancies.push({
          client_id: row.id,
          client_code: row.client_code,
          client_name: row.client_name,
          cached_balance: cached,
          calculated_balance: +(calculated.toFixed(2)),
          difference: +(calculated - cached).toFixed(2)
        })
      }
    }

    return c.json({
      success: true,
      data: {
        total_checked: rows.length,
        discrepancy_count: discrepancies.length,
        discrepancies
      }
    })
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /integrity-fix - 불일치 거래처 일괄 재계산
arRouter.post('/integrity-fix', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { client_ids } = await c.req.json() as { client_ids?: number[] }

    const { query: integrityQuery, params: integrityParams } = buildIntegrityQuery(c)
    const { results: rows } = integrityParams.length > 0
      ? await c.env.DB.prepare(integrityQuery).bind(...integrityParams).all<IntegrityRow>()
      : await c.env.DB.prepare(integrityQuery).all<IntegrityRow>()

    let fixed = 0
    interface FixResult { client_id: number; client_name: string; old: number; new: number }
    const fixResults: FixResult[] = []

    for (const row of rows) {
      if (client_ids && client_ids.length > 0 && !client_ids.includes(row.id)) continue

      const calculated = Number(row.total_billed) - Number(row.total_paid) - Number(row.total_adj)
      const cached = Number(row.balance) || 0

      if (Math.abs(calculated - cached) > 0.01) {
        await c.env.DB.prepare(
          'UPDATE clients SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(+(calculated.toFixed(2)), row.id).run()
        fixResults.push({ client_id: row.id, client_name: row.client_name, old: cached, new: +(calculated.toFixed(2)) })
        fixed++
      }
    }

    return c.json({
      success: true,
      data: { fixed, results: fixResults },
      message: `${fixed}건 잔액 수정 완료`
    })
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /recalculate/:clientId - 잔액 재계산 (MANAGER+)
arRouter.post('/recalculate/:clientId', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const clientId = c.req.param('clientId')

    const client = await c.env.DB.prepare(
      'SELECT id, balance FROM clients WHERE id = ?'
    ).bind(clientId).first<{ id: number; balance: number }>()

    if (!client) {
      return c.json({ success: false, error: 'Client not found' }, 404)
    }

    // 실계산: BILLED 주문 합계
    const { clause: recalcOrderEf, params: recalcOrderEfParams } = entityFilter(c)
    const billedRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(CASE WHEN billing_status = 'BILLED' THEN billed_amount ELSE 0 END), 0) as total_billed
      FROM orders WHERE client_id = ?${recalcOrderEf}
    `).bind(clientId, ...recalcOrderEfParams).first<{ total_billed: number }>()

    // 입금 합계
    const { clause: recalcPaymentEf, params: recalcPaymentEfParams } = entityFilter(c)
    const paymentRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_payments FROM payments WHERE client_id = ?${recalcPaymentEf}
    `).bind(clientId, ...recalcPaymentEfParams).first<{ total_payments: number }>()

    // 감액 합계
    const { clause: recalcAdjEf, params: recalcAdjEfParams } = entityFilter(c)
    const adjRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_adjustments FROM adjustments WHERE client_id = ?${recalcAdjEf}
    `).bind(clientId, ...recalcAdjEfParams).first<{ total_adjustments: number }>()

    const newBalance = Number(billedRow!.total_billed) - Number(paymentRow!.total_payments) - Number(adjRow!.total_adjustments)
    const oldBalance = Number(client.balance) || 0

    await c.env.DB.prepare(
      'UPDATE clients SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(newBalance, clientId).run()

    return c.json({
      success: true,
      data: {
        old_balance: oldBalance,
        new_balance: newBalance,
        difference: newBalance - oldBalance
      }
    })
  } catch (error) {
    console.error('Recalculate balance error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /overdue - 미수금 경고 목록
arRouter.get('/overdue', async (c) => {
  try {
    const { clause: overdueEf, params: overdueEfParams } = entityFilter(c, 'o')
    const { results } = await c.env.DB.prepare(`
      SELECT
        c.id as client_id,
        c.client_name,
        c.overdue_alert_days,
        COUNT(o.id) as overdue_count,
        COALESCE(SUM(o.billed_amount), 0) as overdue_amount,
        MIN(o.billed_at) as oldest_billed_at
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.billing_status = 'BILLED'
        AND (o.billing_status != 'PAID' OR o.billing_status IS NULL)
        AND date(o.billed_at, '+' || COALESCE(c.overdue_alert_days, 30) || ' days') < date('now')
        ${overdueEf}
      GROUP BY c.id, c.client_name, c.overdue_alert_days
      ORDER BY overdue_amount DESC
    `).bind(...overdueEfParams).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Get overdue error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /adjustment - 감액 등록 (MANAGER+)
arRouter.post('/adjustment', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json()

    if (!body.client_id || !body.type || body.amount === undefined || !body.reason) {
      return c.json({
        success: false,
        error: 'client_id, type, amount, reason 필수'
      }, 400)
    }

    const validTypes = ['DISCOUNT', 'CLAIM', 'RETURN', 'OTHER']
    if (!validTypes.includes(body.type)) {
      return c.json({
        success: false,
        error: `type은 ${validTypes.join('|')} 중 하나여야 합니다`
      }, 400)
    }

    const amount = parseFloat(String(body.amount))
    if (amount <= 0) {
      return c.json({ success: false, error: '금액은 0보다 커야 합니다' }, 400)
    }

    const client = await c.env.DB.prepare(
      'SELECT id, balance FROM clients WHERE id = ?'
    ).bind(body.client_id).first<{ id: number; balance: number }>()

    if (!client) {
      return c.json({ success: false, error: 'Client not found' }, 404)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO adjustments (client_id, order_id, type, amount, reason, created_by, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.client_id,
      body.order_id || null,
      body.type,
      amount,
      body.reason,
      user?.id || null,
      getEntityId(c)
    ).run()

    // 미수금 감소 (감액 → balance 차감)
    await c.env.DB.prepare(
      'UPDATE clients SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(amount, body.client_id).run()

    const updatedClient = await c.env.DB.prepare(
      'SELECT balance FROM clients WHERE id = ?'
    ).bind(body.client_id).first<{ balance: number }>()

    return c.json({
      success: true,
      data: {
        id: result.meta.last_row_id,
        new_balance: updatedClient?.balance || 0
      }
    })
  } catch (error) {
    console.error('Create adjustment error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /adjustments/:clientId - 감액 이력
arRouter.get('/adjustments/:clientId', async (c) => {
  try {
    const clientId = c.req.param('clientId')

    const { results } = await c.env.DB.prepare(`
      SELECT
        a.*,
        u.name as created_by_name
      FROM adjustments a
      LEFT JOIN users u ON a.created_by = u.id
      WHERE a.client_id = ?
      ORDER BY a.created_at DESC
    `).bind(clientId).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Get adjustments error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// DELETE /adjustment/:id - 감액 삭제 (ADMIN)
arRouter.delete('/adjustment/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')

    const existing = await c.env.DB.prepare(
      'SELECT id, client_id, order_id, type, amount, reason, created_at FROM adjustments WHERE id = ?'
    ).bind(id).first<AdjustmentRow>()

    if (!existing) {
      return c.json({ success: false, error: '감액 내역을 찾을 수 없습니다' }, 404)
    }

    await c.env.DB.prepare('DELETE FROM adjustments WHERE id = ?').bind(id).run()

    // 감액 복원 (balance 증가)
    await c.env.DB.prepare(
      'UPDATE clients SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(existing.amount, existing.client_id).run()

    const updatedClient = await c.env.DB.prepare(
      'SELECT balance FROM clients WHERE id = ?'
    ).bind(existing.client_id).first<{ balance: number }>()

    return c.json({
      success: true,
      data: { new_balance: updatedClient?.balance || 0 }
    })
  } catch (error) {
    console.error('Delete adjustment error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// =============================================================================
// 매입 원장 (Purchase Ledger)
// =============================================================================

// GET /purchase-client/:clientId - 매입처 원장
arRouter.get('/collection-logs/:clientId', async (c) => {
  try {
    const clientId = c.req.param('clientId')
    const { results } = await c.env.DB.prepare(`
      SELECT cl.*, u.name as created_by_name
      FROM collection_logs cl
      LEFT JOIN users u ON cl.created_by = u.id
      WHERE cl.client_id = ?
      ORDER BY cl.contact_date DESC, cl.created_at DESC
    `).bind(clientId).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /collection-log - 독촉 이력 등록 (MANAGER+)
arRouter.post('/collection-log', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json()

    if (!body.client_id || !body.contact_date || !body.contact_method) {
      return c.json({ success: false, error: 'client_id, contact_date, contact_method 필수' }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO collection_logs (client_id, contact_date, contact_method, contact_person, promised_date, promised_amount, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.client_id,
      body.contact_date,
      body.contact_method,
      body.contact_person || null,
      body.promised_date || null,
      body.promised_amount || null,
      body.notes || null,
      user?.id || null
    ).run()

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id },
      message: '독촉 이력이 등록되었습니다'
    })
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /collection-log/:id - 독촉 이력 삭제 (ADMIN)
arRouter.delete('/collection-log/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const existing = await c.env.DB.prepare('SELECT id FROM collection_logs WHERE id = ?').bind(id).first()
    if (!existing) {
      return c.json({ success: false, error: '독촉 이력을 찾을 수 없습니다' }, 404)
    }
    await c.env.DB.prepare('DELETE FROM collection_logs WHERE id = ?').bind(id).run()
    return c.json({ success: true, message: '삭제되었습니다' })
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// =============================================================================
// 미수금 Aging 상세 분석
// =============================================================================

// Aging 카테고리 분류 헬퍼
function getAgingCategory(days: number | null): string {
  if (days === null || days < 0) return 'normal'
  if (days <= 30) return 'normal'
  if (days <= 60) return 'warning'
  if (days <= 90) return 'danger'
  return 'critical'
}

// GET /receivables - 미수금 거래처 전체 목록
arRouter.get('/receivables', async (c) => {
  try {
    const { sort = 'balance_desc', min_balance = '0', overdue_only = '' } = c.req.query()
    const minBalance = parseFloat(min_balance)

    const { clause: recvPayEf, params: recvPayEfParams } = entityFilter(c, 'p')
    const { clause: recvOrdEf1, params: recvOrdEf1Params } = entityFilter(c, 'o')
    const { clause: recvOrdEf2, params: recvOrdEf2Params } = entityFilter(c, 'o')
    const { clause: recvPayEf2, params: recvPayEf2Params } = entityFilter(c, 'p')
    const { results: clients } = await c.env.DB.prepare(`
      SELECT
        c.id,
        c.client_code,
        c.client_name,
        c.balance,
        (SELECT MAX(p.payment_date) FROM payments p WHERE p.client_id = c.id${recvPayEf}) as last_payment_date,
        (SELECT COUNT(*) FROM orders o WHERE o.client_id = c.id AND o.billing_status = 'BILLED'${recvOrdEf1}) as billed_order_count,
        (SELECT MIN(o.billed_at) FROM orders o
         WHERE o.client_id = c.id AND o.billing_status = 'BILLED'${recvOrdEf2}
           AND NOT EXISTS (
             SELECT 1 FROM payments p
             WHERE p.client_id = c.id${recvPayEf2}
               AND p.amount >= o.billed_amount
               AND p.payment_date >= o.billed_at
           )
        ) as oldest_unpaid_date
      FROM clients c
      WHERE c.is_active = 1 AND c.balance > ?
    `).bind(...recvPayEfParams, ...recvOrdEf1Params, ...recvOrdEf2Params, ...recvPayEf2Params, minBalance).all<ReceivableClientRow>()

    // aging_days, aging_category 계산 (JS에서)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let rows = clients.map(client => {
      let agingDays: number | null = null
      if (client.oldest_unpaid_date) {
        const oldest = new Date(client.oldest_unpaid_date)
        oldest.setHours(0, 0, 0, 0)
        agingDays = Math.floor((today.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24))
      }
      return {
        ...client,
        balance: Number(client.balance) || 0,
        aging_days: agingDays,
        aging_category: getAgingCategory(agingDays)
      }
    })

    // overdue_only 필터 (30일 초과)
    if (overdue_only === '1') {
      rows = rows.filter(r => r.aging_days !== null && r.aging_days > 30)
    }

    // 정렬
    if (sort === 'balance_asc') {
      rows.sort((a, b) => a.balance - b.balance)
    } else if (sort === 'oldest_first') {
      rows.sort((a, b) => {
        if (a.oldest_unpaid_date === null) return 1
        if (b.oldest_unpaid_date === null) return -1
        return a.oldest_unpaid_date.localeCompare(b.oldest_unpaid_date)
      })
    } else {
      // balance_desc (기본)
      rows.sort((a, b) => b.balance - a.balance)
    }

    return c.json({ success: true, data: rows })
  } catch (error) {
    console.error('Get receivables error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /receivables/:clientId/orders - 특정 거래처의 미입금 주문 목록
arRouter.get('/receivables/:clientId/orders', async (c) => {
  try {
    const clientId = c.req.param('clientId')

    // 거래처 존재 확인
    const client = await c.env.DB.prepare(
      'SELECT id, client_name, balance FROM clients WHERE id = ? AND is_active = 1'
    ).bind(clientId).first<{ id: number; client_name: string; balance: number }>()

    if (!client) {
      return c.json({ success: false, error: 'Client not found' }, 404)
    }

    // 미입금 주문 (billing_status = BILLED)
    const { clause: recvOrdDetailEf, params: recvOrdDetailEfParams } = entityFilter(c, 'o')
    const { results: orders } = await c.env.DB.prepare(`
      SELECT
        o.id,
        o.order_number,
        o.order_date,
        o.delivery_date,
        o.final_amount,
        o.billed_amount,
        o.billing_status,
        o.billed_at,
        CAST(julianday('now') - julianday(o.billed_at) AS INTEGER) as days_since_billed
      FROM orders o
      WHERE o.client_id = ? AND o.billing_status = 'BILLED'${recvOrdDetailEf}
      ORDER BY o.billed_at ASC
    `).bind(clientId, ...recvOrdDetailEfParams).all<ReceivableOrderRow>()

    // 입금 내역
    const { clause: recvPayDetailEf, params: recvPayDetailEfParams } = entityFilter(c)
    const { results: payments } = await c.env.DB.prepare(`
      SELECT
        id,
        payment_date,
        amount,
        payment_method,
        notes
      FROM payments
      WHERE client_id = ?${recvPayDetailEf}
      ORDER BY payment_date DESC
      LIMIT 50
    `).bind(clientId, ...recvPayDetailEfParams).all<PaymentRow>()

    // 미입금 잔액 계산
    const totalBilled = orders.reduce((sum, o) => sum + (Number(o.billed_amount) || 0), 0)
    const totalPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const unpaidBalance = totalBilled - totalPayments

    return c.json({
      success: true,
      data: {
        client: {
          id: client.id,
          client_name: client.client_name,
          balance: Number(client.balance) || 0
        },
        orders: orders.map(o => ({
          ...o,
          final_amount: Number(o.final_amount) || 0,
          billed_amount: Number(o.billed_amount) || 0
        })),
        payments: payments.map(p => ({
          ...p,
          amount: Number(p.amount) || 0
        })),
        summary: {
          total_billed: totalBilled,
          total_payments: totalPayments,
          unpaid_balance: unpaidBalance
        }
      }
    })
  } catch (error) {
    console.error('Get receivables orders error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /receivables/check-overdue - 연체 자동 알림 생성 (ADMIN/MANAGER)
arRouter.post('/receivables/check-overdue', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    // 30일 초과 연체 거래처 조회
    const { clause: checkOverdueEf, params: checkOverdueEfParams } = entityFilter(c, 'o')
    const { results: overdueClients } = await c.env.DB.prepare(`
      SELECT
        c.id,
        c.client_name,
        c.balance,
        MIN(o.billed_at) as oldest_billed_at,
        CAST(julianday('now') - julianday(MIN(o.billed_at)) AS INTEGER) as overdue_days
      FROM clients c
      JOIN orders o ON o.client_id = c.id
      WHERE c.is_active = 1
        AND c.balance > 0
        AND o.billing_status = 'BILLED'${checkOverdueEf}
      GROUP BY c.id, c.client_name, c.balance
      HAVING overdue_days > 30
      ORDER BY overdue_days DESC
    `).bind(...checkOverdueEfParams).all<OverdueClientRow>()

    let alertsCreated = 0
    const checked = overdueClients.length

    // 24시간 내 이미 발송된 연체 알림 link를 한 번에 로드 (N+1 방지)
    const { results: recentNotifs } = await c.env.DB.prepare(`
      SELECT DISTINCT link FROM notifications
      WHERE title LIKE '연체 경고:%'
        AND created_at > datetime('now', '-24 hours')
    `).all<NotifLinkRow>()
    const recentLinks = new Set((recentNotifs || []).map(n => n.link))

    for (const client of overdueClients) {
      const link = `/ledger?client=${client.id}`
      if (recentLinks.has(link)) continue

      const balanceFormatted = Number(client.balance).toLocaleString()
      const days = client.overdue_days

      await notifyRoles(
        c.env.DB,
        ['ADMIN', 'MANAGER'],
        `연체 경고: ${client.client_name}`,
        `미수금 ${balanceFormatted}원, 최장 연체 ${days}일`,
        link
      )

      alertsCreated++
    }

    return c.json({
      success: true,
      data: {
        checked,
        alerts_created: alertsCreated
      }
    })
  } catch (error) {
    console.error('Check overdue error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// GET /collection-logs - 독촉 이력 조회
// ============================================================================
arRouter.get('/collection-logs', async (c) => {
  try {
    const { client_id, page = '1', limit = '30' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 30, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    const whereClauses: string[] = []
    const params: any[] = []

    if (client_id) {
      whereClauses.push('cl.client_id = ?')
      params.push(parseInt(client_id))
    }

    const where = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''

    const { results } = await c.env.DB.prepare(`
      SELECT cl.*, c.client_name, u.name as created_by_name
      FROM collection_logs cl
      LEFT JOIN clients c ON cl.client_id = c.id
      LEFT JOIN users u ON cl.created_by = u.id
      ${where}
      ORDER BY cl.contact_date DESC, cl.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, safeLimit, offset).all()

    const countRow = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM collection_logs cl ${where}
    `).bind(...params).first<{ count: number }>()
    const count = countRow?.count || 0

    return c.json({
      success: true,
      data: results,
      pagination: { page: parseInt(page), limit: safeLimit, total: count, total_pages: Math.ceil(count / safeLimit) }
    })
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST /collection-logs - 독촉 기록 등록 (+ 이메일 발송 옵션)
// ============================================================================
arRouter.post('/collection-logs', async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json() as {
      client_id: number
      contact_method: string
      contact_date: string
      amount_requested?: number
      promised_date?: string
      promised_amount?: number
      notes?: string
      result?: string
      send_email?: boolean
    }

    if (!body.client_id || !body.contact_method || !body.contact_date) {
      return c.json({ success: false, error: '거래처, 연락방법, 연락일을 입력하세요.' }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO collection_logs (client_id, contact_method, contact_date, amount_requested, promised_date, promised_amount, notes, result, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.client_id,
      body.contact_method,
      body.contact_date,
      body.amount_requested || null,
      body.promised_date || null,
      body.promised_amount || null,
      body.notes || null,
      body.result || null,
      user?.id || null
    ).run()

    // 이메일 독촉 발송
    if (body.send_email && body.contact_method === 'EMAIL') {
      try {
        const { sendEmail } = await import('../../services/emailProvider')
        const { renderTemplate } = await import('../../services/emailTemplates')

        const client = await c.env.DB.prepare(
          'SELECT client_name, email, balance FROM clients WHERE id = ?'
        ).bind(body.client_id).first<{ client_name: string; email: string | null; balance: number }>()

        if (client?.email) {
          const { clause: emailOrdEf, params: emailOrdEfParams } = entityFilter(c)
          const { clause: emailPayEf, params: emailPayEfParams } = entityFilter(c)
          const { results: unpaidOrders } = await c.env.DB.prepare(`
            SELECT order_number, billed_amount, order_date
            FROM orders
            WHERE client_id = ? AND billing_status = 'BILLED'${emailOrdEf}
              AND id NOT IN (
                SELECT DISTINCT order_id FROM payments WHERE order_id IS NOT NULL${emailPayEf}
              )
            ORDER BY order_date ASC LIMIT 10
          `).bind(body.client_id, ...emailOrdEfParams, ...emailPayEfParams).all<UnpaidOrderRow>()

          const balance = Number(client.balance) || body.amount_requested || 0
          const firstOrderDate = unpaidOrders[0]?.order_date
          const agingDays = firstOrderDate
            ? Math.floor((Date.now() - new Date(firstOrderDate).getTime()) / 86400000)
            : 0

          const { subject, html } = renderTemplate('PAYMENT_REMINDER', {
            clientName: client.client_name,
            totalBalance: balance,
            agingDays: Math.max(agingDays, 0),
            orders: unpaidOrders.map(o => ({
              orderNumber: o.order_number,
              amount: Number(o.billed_amount) || 0,
              orderDate: o.order_date,
            })),
            notes: body.notes,
          })

          await sendEmail(c.env, c.env.DB, { to: client.email, subject, html }, {
            template: 'PAYMENT_REMINDER',
            relatedType: 'collection',
            relatedId: result.meta.last_row_id as number,
            sentBy: user?.id,
          })
        }
      } catch (_emailErr) {
        // 이메일 실패해도 독촉 기록은 성공
      }
    }

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id },
      message: '독촉 기록이 등록되었습니다.'
    }, 201)
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /collection-logs/:id - 독촉 상세
// ============================================================================
arRouter.get('/collection-logs/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const log = await c.env.DB.prepare(`
      SELECT cl.*, c.client_name, u.name as created_by_name
      FROM collection_logs cl
      LEFT JOIN clients c ON cl.client_id = c.id
      LEFT JOIN users u ON cl.created_by = u.id
      WHERE cl.id = ?
    `).bind(id).first()

    if (!log) return c.json({ success: false, error: '독촉 기록을 찾을 수 없습니다.' }, 404)
    return c.json({ success: true, data: log })
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// EMAIL SEND - 원장 이메일 발송
// ============================================================================

arRouter.post('/send-email', async (c) => {
  try {
    const { sendEmail } = await import('../../services/emailProvider')
    const { generatePortalToken } = await import('../portal')

    const body = await c.req.json()
    const { client_id, to_email, period_start, period_end } = body

    if (!client_id || !to_email) {
      return c.json({ success: false, error: 'client_id와 to_email이 필요합니다.' }, 400)
    }

    // Get client info
    const client = await c.env.DB.prepare(
      `SELECT id, client_name, balance FROM clients WHERE id = ?`
    ).bind(client_id).first<ClientRow>()

    if (!client) {
      return c.json({ success: false, error: '거래처를 찾을 수 없습니다.' }, 404)
    }

    // Query transactions (reuse logic from GET /client/:clientId)
    const startDate = period_start || new Date(Date.now() - 180 * 86400000).toISOString().substring(0, 10)
    const endDate = period_end || new Date().toISOString().substring(0, 10)

    const { clause: ordersEf, params: ordersEfParams } = entityFilter(c)
    const { results: orders } = await c.env.DB.prepare(`
      SELECT id, order_number, order_date, final_amount, billed_amount, billing_status, status, created_at
      FROM orders WHERE client_id = ?${ordersEf} AND date(created_at) >= ? AND date(created_at) <= ?
      ORDER BY created_at ASC
    `).bind(client_id, ...ordersEfParams, startDate, endDate).all<OrderRow>()

    const { clause: paymentsEf, params: paymentsEfParams } = entityFilter(c)
    const { results: payments } = await c.env.DB.prepare(`
      SELECT id, payment_date, amount, payment_method, reference_number, notes, created_at
      FROM payments WHERE client_id = ?${paymentsEf} AND date(payment_date) >= ? AND date(payment_date) <= ?
      ORDER BY payment_date ASC
    `).bind(client_id, ...paymentsEfParams, startDate, endDate).all<PaymentRow>()

    const { clause: adjEf, params: adjEfParams } = entityFilter(c)
    const { results: adjustments } = await c.env.DB.prepare(`
      SELECT id, order_id, type, amount, reason, created_at
      FROM adjustments WHERE client_id = ?${adjEf} AND date(created_at) >= ? AND date(created_at) <= ?
      ORDER BY created_at ASC
    `).bind(client_id, ...adjEfParams, startDate, endDate).all<AdjustmentRow>()

    // Combine and sort
    const transactions = [
      ...orders.map(o => ({
        type: 'order' as const,
        date: o.created_at,
        description: `주문: ${o.order_number}`,
        debit: o.billing_status === 'BILLED' ? (Number(o.billed_amount) || Number(o.final_amount) || 0) : 0,
        credit: 0,
      })),
      ...payments.map(p => ({
        type: 'payment' as const,
        date: p.payment_date,
        description: `입금: ${p.payment_method || ''}`,
        debit: 0,
        credit: Number(p.amount) || 0,
      })),
      ...adjustments.map(a => ({
        type: 'adjustment' as const,
        date: a.created_at,
        description: `감액: ${a.reason || a.type}`,
        debit: 0,
        credit: Number(a.amount) || 0,
      }))
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Running balance
    let runningBalance = 0
    const txWithBalance = transactions.map(t => {
      runningBalance += t.debit - t.credit
      return { ...t, balance: runningBalance }
    })

    const totalOrders = txWithBalance.reduce((s, t) => s + t.debit, 0)
    const totalPayments_val = txWithBalance.reduce((s, t) => s + t.credit, 0)

    // Generate portal token for link
    let portalUrl = ''
    try {
      const user = c.get('user')
      const siteUrlSetting = await c.env.DB.prepare(
        `SELECT setting_value FROM settings WHERE setting_key = 'site_base_url'`
      ).first<{ setting_value: string }>()
      const baseUrl = siteUrlSetting?.setting_value || new URL(c.req.url).origin
      const portalResult = await generatePortalToken(c.env.DB, Number(client_id), user?.id || 0, baseUrl, 7,
        { type: 'ledger', period_start: startDate, period_end: endDate })
      portalUrl = `${baseUrl}/portal/document?t=${portalResult.token}`
    } catch (e) {
      console.warn('Portal token for email failed:', e)
    }

    // Build HTML email
    const formatNum = (n: number) => n.toLocaleString('ko-KR')
    const formatDate = (d: string) => d ? d.substring(0, 10) : '-'

    const rowsHtml = txWithBalance.map(t => {
      const typeName = t.type === 'order' ? '주문' : t.type === 'payment' ? '입금' : '할인/조정'
      const typeColor = t.type === 'order' ? '#dcfce7' : t.type === 'payment' ? '#dbeafe' : '#fef9c3'
      return `<tr style="background:${typeColor}">
        <td style="padding:8px;border:1px solid #e5e7eb">${formatDate(t.date)}</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${typeName}</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${t.description}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right">${t.debit > 0 ? formatNum(t.debit) : '-'}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right">${t.credit > 0 ? formatNum(t.credit) : '-'}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;font-weight:bold;color:${t.balance > 0 ? '#dc2626' : '#16a34a'}">${formatNum(t.balance)}</td>
      </tr>`
    }).join('')

    const portalSection = portalUrl
      ? `<p style="margin-top:20px"><a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold">잔액 확인 (포털 바로가기)</a></p>`
      : ''

    const html = `
    <div style="font-family:'Pretendard',sans-serif;max-width:700px;margin:0 auto;padding:20px">
      <h2 style="color:#1f2937;border-bottom:2px solid #2563eb;padding-bottom:12px">동산기획 거래 내역 안내</h2>
      <p style="color:#4b5563">거래처: <strong>${client.client_name}</strong></p>
      <p style="color:#4b5563">기간: ${startDate} ~ ${endDate}</p>

      <div style="display:flex;gap:16px;margin:16px 0;flex-wrap:wrap">
        <div style="background:#eff6ff;padding:12px 16px;border-radius:8px;flex:1;min-width:120px">
          <div style="font-size:12px;color:#6b7280">총 매출</div>
          <div style="font-size:18px;font-weight:bold;color:#1f2937">${formatNum(totalOrders)}원</div>
        </div>
        <div style="background:#f0fdf4;padding:12px 16px;border-radius:8px;flex:1;min-width:120px">
          <div style="font-size:12px;color:#6b7280">총 입금</div>
          <div style="font-size:18px;font-weight:bold;color:#1f2937">${formatNum(totalPayments_val)}원</div>
        </div>
        <div style="background:#fef2f2;padding:12px 16px;border-radius:8px;flex:1;min-width:120px">
          <div style="font-size:12px;color:#6b7280">현재 잔액</div>
          <div style="font-size:18px;font-weight:bold;color:#dc2626">${formatNum(runningBalance)}원</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">일자</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">구분</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">내용</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:right">차변(주문)</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:right">대변(입금)</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:right">잔액</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      ${portalSection}

      <p style="margin-top:24px;font-size:12px;color:#9ca3af">본 메일은 동산기획 ERP에서 자동 발송되었습니다. 문의: 042-523-1982</p>
    </div>`

    const user = c.get('user')
    const result = await sendEmail(c.env, c.env.DB, {
      to: to_email,
      subject: `[동산기획] ${client.client_name} 거래 내역 안내 (${startDate} ~ ${endDate})`,
      html: html
    }, {
      template: 'ledger_summary',
      relatedType: 'ledger',
      relatedId: Number(client_id),
      sentBy: user?.id || 0
    })

    if (result.success) {
      await logActivity({
        db: c.env.DB, userId: user?.id, userName: user?.username,
        action: 'LEDGER_EMAIL_SENT', entityType: 'CLIENT', entityId: Number(client_id),
        entityLabel: client.client_name,
        details: JSON.stringify({ to_email, period_start: startDate, period_end: endDate })
      })
      return c.json({ success: true, data: { email_id: result.id } })
    } else {
      return c.json({ success: false, error: result.error || '이메일 발송 실패' }, 500)
    }
  } catch (error) {
    console.error('Ledger send-email error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// PURCHASE LEDGER IMPROVEMENTS
// ============================================================================

// POST /purchase-adjustment - 매입 감액/조정 등록 (MANAGER+)

export default arRouter
