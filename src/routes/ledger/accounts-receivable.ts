import { Hono } from 'hono'
import type { Context } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { createPayment } from '../../lib/payments'
import { logActivity } from '../../utils/activityLog'
import { notifyRoles } from '../../utils/notify'
import { getEntityId, entityFilter } from '../../utils/entityFilter'
import {
  deriveClientBalance,
  buildIntegrityQuery,
  getAgingCategory,
  type ClientRow, type OrderRow, type PaymentRow, type AdjustmentRow, type IntegrityRow,
  type OrderAggRow, type PaymentAggRow, type MonthlyOrderRow, type MonthlyPaymentRow,
  type OverdueClientRow, type NotifLinkRow, type CollectionLogRow, type ReceivableClientRow,
  type ReceivableOrderRow, type OverdueAlertRow, type UnpaidOrderRow,
} from './ar-helpers'
import arPaymentsRouter from './ar-payments'
import arReceivablesRouter from './ar-receivables'
import arDunningRouter from './ar-dunning'

const arRouter = new Hono<HonoEnv>()
arRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// 서브 라우터 마운트 (대형파일 분할): payments=입금/감액, receivables=미수금/정합성, dunning=독촉. 경로 비충돌이라 순서 무관.
arRouter.route('/', arPaymentsRouter)
arRouter.route('/', arReceivablesRouter)
arRouter.route('/', arDunningRouter)

arRouter.get('/client/:clientId', async (c) => {
  try {
    const clientId = c.req.param('clientId')
    const { endDate } = c.req.query()
    // startDate 미지정 = 전체 기간(하한 없음). 프론트는 항상 페이지 기간을 전달하고, '전체' 버튼만 빈 값 전송.
    // 전기이월(opening) 계산이 잔액 정확성을 보장하므로 6개월 강제 제한 불필요.
    const startDate = c.req.query('startDate') || ''

    // Get client info
    const client = await c.env.DB.prepare(
      `SELECT id, client_code, client_name, representative, business_registration_number,
              business_type, business_item, phone, mobile, fax, email, address, postal_code,
              transfer_info, is_active, balance, client_type, delivery_method, auto_billing,
              price_policy_id, notes, invoice_method, created_at, updated_at
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

    // Get order items (주문 품목 라인) for all orders
    interface OrderItemLine {
      order_id: number; item_name: string | null; width: number | null; height: number | null
      quantity: number; unit: string | null; unit_price: number | null; amount: number | null
      vat_included: number | null; content: string | null; specification: string | null
    }
    const orderIds = orders.map(o => o.id)
    let orderItemsMap = new Map<number, OrderItemLine[]>()
    if (orderIds.length > 0) {
      // D1 batch로 품목 조회 (최대 50개씩)
      const chunks: number[][] = []
      for (let i = 0; i < orderIds.length; i += 50) chunks.push(orderIds.slice(i, i + 50))
      for (const chunk of chunks) {
        const ph = chunk.map(() => '?').join(',')
        const { results: items } = await c.env.DB.prepare(`
          SELECT order_id, item_name, width, height, quantity, unit, unit_price, amount, vat_included, content, specification
          FROM order_items WHERE order_id IN (${ph}) AND parent_item_id IS NULL
          ORDER BY sort_order ASC
        `).bind(...chunk).all<OrderItemLine>()
        for (const item of items) {
          if (!orderItemsMap.has(item.order_id)) orderItemsMap.set(item.order_id, [])
          orderItemsMap.get(item.order_id)!.push(item)
        }
      }
    }

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

    // ===== 전기이월(opening, 조회 시작일 이전 잔액) + 전체 정합성(all-time) 계산 =====
    // 어느 기간을 조회해도 잔액이 정확하도록: opening = 시작일 이전 전체 거래 잔액. startDate='' 이면 opening=0(전체).
    // split billing P3: 청구 정본 = order_billing_groups(청구 법인별). entity 필터도 g.entity_id 기준.
    const { clause: gOrdEf, params: gOrdEfP } = entityFilter(c, 'g')
    const ordSums = await c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN g.billing_status = 'BILLED' THEN COALESCE(g.billed_amount, 0) ELSE 0 END), 0) AS all_debit,
        COALESCE(SUM(CASE WHEN g.billing_status = 'BILLED' AND date(o.created_at) < ? THEN COALESCE(g.billed_amount, 0) ELSE 0 END), 0) AS open_debit
      FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
      WHERE o.client_id = ? AND o.status != 'CANCELLED'${gOrdEf}
    `).bind(startDate, clientId, ...gOrdEfP).first<{ all_debit: number; open_debit: number }>()

    const { clause: oPayEf, params: oPayEfP } = entityFilter(c)
    const paySums = await c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(amount), 0) AS all_credit,
        COALESCE(SUM(CASE WHEN date(payment_date) < ? THEN amount ELSE 0 END), 0) AS open_credit
      FROM payments WHERE client_id = ?${oPayEf}
    `).bind(startDate, clientId, ...oPayEfP).first<{ all_credit: number; open_credit: number }>()

    const { clause: oAdjEf, params: oAdjEfP } = entityFilter(c)
    const adjSums = await c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(amount), 0) AS all_adj,
        COALESCE(SUM(CASE WHEN date(created_at) < ? THEN amount ELSE 0 END), 0) AS open_adj
      FROM adjustments WHERE client_id = ?${oAdjEf}
    `).bind(startDate, clientId, ...oAdjEfP).first<{ all_adj: number; open_adj: number }>()

    const opening_balance = (Number(ordSums?.open_debit) || 0) - (Number(paySums?.open_credit) || 0) - (Number(adjSums?.open_adj) || 0)
    const all_time_balance = (Number(ordSums?.all_debit) || 0) - (Number(paySums?.all_credit) || 0) - (Number(adjSums?.all_adj) || 0)

    const totalPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const totalAdjustments = adjustments.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)

    // BILLED 주문의 billed_amount 합계만 매출로 집계
    const totalBilled = orders.reduce((sum, o) => {
      return o.billing_status === 'BILLED' ? sum + (Number(o.billed_amount) || Number(o.final_amount) || 0) : sum
    }, 0)
    const period_net = totalBilled - totalPayments - totalAdjustments
    const ending_balance = opening_balance + period_net  // 기말 잔액 = 전기이월 + 기간 증감
    // split billing P3: clients.balance 캐시 폐기 → 파생값(all_time_balance) 사용. 불일치 개념 없음.
    const cached_balance = all_time_balance
    const has_discrepancy = false

    // Find last payment date
    const lastPayment = payments.length > 0 ? payments[payments.length - 1] : null

    // Combine and sort by date ASC for running balance
    // 미회계반영(BILLED 아닌) 주문은 원장에서 제외
    const billedOrders = orders.filter(o => o.billing_status === 'BILLED')
    const transactions = [
      ...billedOrders.map(o => ({
        type: 'order' as const,
        order_id: o.id,
        date: o.created_at,
        description: `주문: ${o.order_number}`,
        debit: Number(o.billed_amount) || Number(o.final_amount) || 0,
        credit: 0,
        reference: o.order_number,
        status: o.status,
        billing_status: o.billing_status,
        billed_amount: o.billed_amount,
        final_amount: o.final_amount,
        items: (orderItemsMap.get(o.id) || []).map(item => ({
          item_name: item.item_name || '-',
          spec: item.specification || (item.width && item.height ? `${item.width}×${item.height}` : ''),
          content: item.content || '',
          quantity: item.quantity || 0,
          unit: item.unit || 'EA',
          unit_price: Number(item.unit_price) || 0,
          amount: Number(item.amount) || 0,
          vat_included: item.vat_included ? true : false,
        }))
      })),
      ...payments.map(p => ({
        type: 'payment' as const,
        id: p.id,
        date: p.payment_date,
        description: `입금: ${p.payment_method || ''}`,
        debit: 0,
        credit: Number(p.amount) || 0,
        reference: p.reference_number,
        notes: p.notes,
        payment_method: p.payment_method || '기타',
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

    // Calculate running balance (ascending order) — 전기이월에서 시작
    let runningBalance = opening_balance
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
          opening_balance,
          balance: ending_balance,
          period_net,
          calculated_balance: all_time_balance,
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

// Get settlement report (정산 리포트)
arRouter.get('/settlement', async (c) => {
  try {
    const { startDate, endDate } = c.req.query()

    // Build order date filter — split billing P3: 미수금/매출은 청구 법인(order_billing_groups.entity_id) 기준
    const { clause: settlOrderEf, params: settlOrderEfParams } = entityFilter(c, 'g')
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
      SELECT o.client_id, COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(CASE WHEN g.billing_status = 'BILLED' THEN g.billed_amount ELSE 0 END), 0) as total_sales
      FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
      WHERE o.status != 'CANCELLED' ${orderFilter}
      GROUP BY o.client_id
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

    // Step 2.5: 전체기간 실 미수 집계 (entity 필터) — 캐시 clients.balance가 stale(0)이어도 미수 거래처 누락 방지
    const { clause: allOrdEf, params: allOrdEfP } = entityFilter(c, 'g')
    const { results: allOrderResults } = await c.env.DB.prepare(`
      SELECT o.client_id, COALESCE(SUM(CASE WHEN g.billing_status = 'BILLED' THEN COALESCE(g.billed_amount, 0) ELSE 0 END), 0) as billed
      FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
      WHERE o.status != 'CANCELLED'${allOrdEf}
      GROUP BY o.client_id
    `).bind(...allOrdEfP).all<{ client_id: number; billed: number }>()

    const { clause: allPayEf, params: allPayEfP } = entityFilter(c, 'p')
    const { results: allPaymentResults } = await c.env.DB.prepare(`
      SELECT client_id, COALESCE(SUM(amount), 0) as paid
      FROM payments p WHERE 1=1${allPayEf}
      GROUP BY client_id
    `).bind(...allPayEfP).all<{ client_id: number; paid: number }>()

    const { clause: allAdjEf, params: allAdjEfP } = entityFilter(c, 'a')
    const { results: allAdjResults } = await c.env.DB.prepare(`
      SELECT client_id, COALESCE(SUM(amount), 0) as adj
      FROM adjustments a WHERE 1=1${allAdjEf}
      GROUP BY client_id
    `).bind(...allAdjEfP).all<{ client_id: number; adj: number }>()

    const billedMap = new Map(allOrderResults.map(r => [r.client_id, Number(r.billed) || 0]))
    const paidMap = new Map(allPaymentResults.map(r => [r.client_id, Number(r.paid) || 0]))
    const adjMap = new Map(allAdjResults.map(r => [r.client_id, Number(r.adj) || 0]))

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
        // 실 미수 잔액(전체기간 청구-입금-감액) — 상세(all_time)와 동일 기준, entity-aware
        const realBalance = (billedMap.get(cl.id) || 0) - (paidMap.get(cl.id) || 0) - (adjMap.get(cl.id) || 0)
        // split billing P3: clients.balance 캐시 폐기 → realBalance(order_billing_groups 파생)만 사용
        if (!o && !p && Math.round(realBalance) === 0) return null
        return {
          id: cl.id,
          client_code: cl.client_code,
          client_name: cl.client_name,
          balance: realBalance,
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

// ============================================================================
// 분석 기능 (월말 마감 / 손익 요약 / 평균 회수 기간)
// ============================================================================

// GET /closing-summary - 월말 마감 대시보드
arRouter.get('/closing-summary', async (c) => {
  try {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() // 0-based
    const monthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const monthEnd = new Date(y, m + 1, 0).toISOString().substring(0, 10)

    const ef = entityFilter(c)
    const efO = entityFilter(c, 'o')
    const efP = entityFilter(c, 'p')

    // 이번달 매출 (BILLED 기준)
    const salesRes = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(CASE WHEN billing_status='BILLED' THEN billed_amount ELSE 0 END),0) as month_sales,
             COUNT(*) as month_order_count
      FROM orders o
      WHERE status != 'CANCELLED' AND date(o.created_at) >= ? AND date(o.created_at) <= ?${efO.clause}
    `).bind(monthStart, monthEnd, ...efO.params).first<{ month_sales: number; month_order_count: number }>()

    // 이번달 입금
    const payRes = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount),0) as month_payments, COUNT(*) as month_payment_count
      FROM payments p WHERE date(payment_date) >= ? AND date(payment_date) <= ?${efP.clause}
    `).bind(monthStart, monthEnd, ...efP.params).first<{ month_payments: number; month_payment_count: number }>()

    // 총 미수금 (전체)
    const balRes = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(balance),0) as total_receivables, COUNT(*) as receivable_clients
       FROM clients WHERE is_active=1 AND balance > 0`
    ).first<{ total_receivables: number; receivable_clients: number }>()

    // 미발행 세금계산서 (SHIPPED but not BILLED)
    const unbilledRes = await c.env.DB.prepare(`
      SELECT COUNT(*) as unbilled_count, COALESCE(SUM(final_amount),0) as unbilled_amount
      FROM orders o
      WHERE status IN ('SHIPPED','DELIVERED') AND (billing_status IS NULL OR billing_status != 'BILLED')${efO.clause}
    `).bind(...efO.params).first<{ unbilled_count: number; unbilled_amount: number }>()

    // 미처리 조정 건수 (이번달)
    const adjRes = await c.env.DB.prepare(`
      SELECT COUNT(*) as adj_count, COALESCE(SUM(amount),0) as adj_amount
      FROM adjustments WHERE date(created_at) >= ? AND date(created_at) <= ?${ef.clause}
    `).bind(monthStart, monthEnd, ...ef.params).first<{ adj_count: number; adj_amount: number }>()

    // 지난달 매출 (전월 대비용)
    const prevStart = `${m === 0 ? y - 1 : y}-${String(m === 0 ? 12 : m).padStart(2, '0')}-01`
    const prevEnd = new Date(y, m, 0).toISOString().substring(0, 10)
    const prevSalesRes = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(CASE WHEN billing_status='BILLED' THEN billed_amount ELSE 0 END),0) as prev_sales
      FROM orders o
      WHERE status != 'CANCELLED' AND date(o.created_at) >= ? AND date(o.created_at) <= ?${efO.clause}
    `).bind(prevStart, prevEnd, ...efO.params).first<{ prev_sales: number }>()

    const prevPayRes = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount),0) as prev_payments
      FROM payments p WHERE date(payment_date) >= ? AND date(payment_date) <= ?${efP.clause}
    `).bind(prevStart, prevEnd, ...efP.params).first<{ prev_payments: number }>()

    return c.json({
      success: true,
      data: {
        period: { start: monthStart, end: monthEnd },
        month_sales: salesRes?.month_sales || 0,
        month_order_count: salesRes?.month_order_count || 0,
        month_payments: payRes?.month_payments || 0,
        month_payment_count: payRes?.month_payment_count || 0,
        total_receivables: balRes?.total_receivables || 0,
        receivable_clients: balRes?.receivable_clients || 0,
        unbilled_count: unbilledRes?.unbilled_count || 0,
        unbilled_amount: unbilledRes?.unbilled_amount || 0,
        adj_count: adjRes?.adj_count || 0,
        adj_amount: adjRes?.adj_amount || 0,
        prev_month_sales: prevSalesRes?.prev_sales || 0,
        prev_month_payments: prevPayRes?.prev_payments || 0,
      }
    })
  } catch (error) {
    console.error('Closing summary error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /profit-summary - 매출-매입 손익 요약
arRouter.get('/profit-summary', async (c) => {
  try {
    const { months = '6' } = c.req.query()
    const monthCount = parseInt(months)
    const efO = entityFilter(c, 'o')
    const efP = entityFilter(c, 'p')
    const efPo = entityFilter(c, 'po')

    // 월별 매출 (BILLED 기준)
    const { results: monthlySales } = await c.env.DB.prepare(`
      SELECT strftime('%Y-%m', o.created_at) as month,
             COALESCE(SUM(CASE WHEN billing_status='BILLED' THEN billed_amount ELSE final_amount END),0) as sales
      FROM orders o
      WHERE status != 'CANCELLED'${efO.clause}
      GROUP BY month ORDER BY month DESC LIMIT ?
    `).bind(...efO.params, monthCount).all<{ month: string; sales: number }>()

    // 월별 매입
    const { results: monthlyPurchases } = await c.env.DB.prepare(`
      SELECT strftime('%Y-%m', po.created_at) as month,
             COALESCE(SUM(po.final_amount),0) as purchases
      FROM purchase_orders po
      WHERE po.status != 'CANCELLED'${efPo.clause}
      GROUP BY month ORDER BY month DESC LIMIT ?
    `).bind(...efPo.params, monthCount).all<{ month: string; purchases: number }>()

    // 월별 입금
    const { results: monthlyPayments } = await c.env.DB.prepare(`
      SELECT strftime('%Y-%m', p.payment_date) as month,
             COALESCE(SUM(p.amount),0) as payments
      FROM payments p WHERE 1=1${efP.clause}
      GROUP BY month ORDER BY month DESC LIMIT ?
    `).bind(...efP.params, monthCount).all<{ month: string; payments: number }>()

    // 월별 지급
    const { results: monthlyPurchPayments } = await c.env.DB.prepare(`
      SELECT strftime('%Y-%m', pp.payment_date) as month,
             COALESCE(SUM(pp.amount),0) as purch_payments
      FROM purchase_payments pp WHERE 1=1${efP.clause.replace(/\bp\./g, 'pp.')}
      GROUP BY month ORDER BY month DESC LIMIT ?
    `).bind(...efP.params, monthCount).all<{ month: string; purch_payments: number }>()

    // 월별 데이터 병합
    interface MonthlyProfit { month: string; sales: number; purchases: number; profit: number; payments: number; purch_payments: number }
    const monthMap = new Map<string, MonthlyProfit>()
    monthlySales.forEach(s => {
      monthMap.set(s.month, { month: s.month, sales: s.sales, purchases: 0, profit: s.sales, payments: 0, purch_payments: 0 })
    })
    monthlyPurchases.forEach(p => {
      const e = monthMap.get(p.month)
      if (e) { e.purchases = p.purchases; e.profit = e.sales - p.purchases }
      else monthMap.set(p.month, { month: p.month, sales: 0, purchases: p.purchases, profit: -p.purchases, payments: 0, purch_payments: 0 })
    })
    monthlyPayments.forEach(p => {
      const e = monthMap.get(p.month)
      if (e) e.payments = p.payments
    })
    monthlyPurchPayments.forEach(p => {
      const e = monthMap.get(p.month)
      if (e) e.purch_payments = p.purch_payments
    })
    const monthly = Array.from(monthMap.values()).sort((a, b) => b.month.localeCompare(a.month))

    // 거래처별 손익 (매출+매입 양쪽 거래가 있는 거래처)
    const { results: clientProfit } = await c.env.DB.prepare(`
      SELECT c.id, c.client_name,
        COALESCE(s.total_sales,0) as sales,
        COALESCE(p.total_purchases,0) as purchases,
        COALESCE(s.total_sales,0) - COALESCE(p.total_purchases,0) as profit
      FROM clients c
      LEFT JOIN (
        SELECT client_id, SUM(CASE WHEN billing_status='BILLED' THEN billed_amount ELSE final_amount END) as total_sales
        FROM orders WHERE status != 'CANCELLED' GROUP BY client_id
      ) s ON s.client_id = c.id
      LEFT JOIN (
        SELECT supplier_id, SUM(final_amount) as total_purchases
        FROM purchase_orders WHERE status != 'CANCELLED' GROUP BY supplier_id
      ) p ON p.supplier_id = c.id
      WHERE c.is_active = 1 AND (s.total_sales > 0 OR p.total_purchases > 0)
      ORDER BY profit DESC
    `).all<{ id: number; client_name: string; sales: number; purchases: number; profit: number }>()

    return c.json({
      success: true,
      data: { monthly, clients: clientProfit }
    })
  } catch (error) {
    console.error('Profit summary error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default arRouter
