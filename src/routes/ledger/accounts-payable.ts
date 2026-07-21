import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { requireEditOrRole } from '../../middleware/permissions'
import { createPayment } from '../../lib/payments'
import { logActivity } from '../../utils/activityLog'
import { notifyRoles } from '../../utils/notify'
import { getEntityId, entityFilter } from '../../utils/entityFilter'
import { kstYmd, kstYear } from '../../utils/kstDate'
import { excludeInternalClientsSql, isInternalEntityClient } from '../../constants/intercompany'

// ── Row interfaces ──────────────────────────────────────────────────────────
interface PurchaseOrderRow {
  id: number; po_number: string; date: string; final_amount: number
  status: string; created_at: string
}
interface PurchasePaymentRow {
  id: number; date: string; amount: number; payment_method: string | null
  reference_number: string | null; po_id: number | null; notes: string | null
  created_at: string; supplier_id: number; payment_date: string
}
interface PurchaseAdjustmentRow {
  id: number; supplier_id: number; po_id: number | null; type: string
  amount: number; reason: string | null; adjustment_date: string
  created_at: string
}
interface SupplierRow {
  id: number; client_code: string; client_name: string
  purchase_balance: number
}
interface PoAggRow { supplier_id: number; po_count: number; total_purchases: number }
interface PpAggRow { supplier_id: number; total_payments: number }
interface MonthlyPoRow { month: string; po_count: number; total_purchases: number }
interface MonthlyPpRow { month: string; payment_count: number; total_payments: number }
interface OverdueRow {
  id: number; client_code: string; client_name: string; purchase_balance: number
  overdue_alert_days: number | null; last_order_date: string | null
  last_payment_date: string | null
}
interface IntegrityRow {
  id: number; client_code: string; client_name: string; purchase_balance: number
  total_orders: number; total_paid: number; total_adj: number
}
interface BalanceRow { purchase_balance: number }
interface ClientNameRow { client_name: string }
interface CsvPoRow {
  id: number; po_number: string; order_date: string; final_amount: number
  status: string; created_at: string
}
interface CsvPpRow {
  id: number; payment_date: string; amount: number; payment_method: string | null
  notes: string | null; created_at: string
}
interface CsvPaRow {
  id: number; po_id: number | null; type: string; amount: number
  reason: string | null; adjustment_date: string; created_at: string
}

const apRouter = new Hono<HonoEnv>()
apRouter.use('/*', authMiddleware, requireEditOrRole('/ledger', 'MANAGER'))

apRouter.get('/purchase-client/:clientId', async (c) => {
  try {
    const clientId = c.req.param('clientId')
    const { startDate, endDate } = c.req.query()

    // Get supplier info
    const client = await c.env.DB.prepare(
      `SELECT id, client_code, client_name, representative, business_registration_number,
              business_type, business_item, phone, mobile, fax, email, address, postal_code,
              transfer_info, is_active, balance, client_type, delivery_method, auto_billing,
              price_policy_id, notes, invoice_method, created_at, updated_at
       FROM clients WHERE id = ?`
    ).bind(clientId).first()

    if (!client) {
      return c.json({ success: false, error: '거래처를 찾을 수 없습니다' }, 404)
    }

    // Get purchase orders (발주 - debit)
    const { clause: poEf, params: poEfParams } = entityFilter(c)
    let poQuery = `
      SELECT
        id, po_number, order_date as date, final_amount, status, created_at
      FROM purchase_orders
      WHERE supplier_id = ? AND status NOT IN ('DRAFT', 'CANCELLED')${poEf}
    `
    const poParams: any[] = [clientId, ...poEfParams]

    if (startDate) {
      poQuery += ' AND date(order_date) >= ?'
      poParams.push(startDate)
    }
    if (endDate) {
      poQuery += ' AND date(order_date) <= ?'
      poParams.push(endDate)
    }

    poQuery += ' ORDER BY order_date ASC, created_at ASC'
    poQuery += ' LIMIT 500'  // 확장성: 거래처별 발주 무제한 스캔 방지(방어적 cap)
    const { results: purchaseOrders } = await c.env.DB.prepare(poQuery).bind(...poParams).all<PurchaseOrderRow>()

    // Get purchase payments (지급 - credit)
    const { clause: ppEf, params: ppEfParams } = entityFilter(c)
    let ppQuery = `
      SELECT
        id, payment_date as date, amount, payment_method,
        reference_number, po_id, notes, created_at
      FROM purchase_payments
      WHERE supplier_id = ?${ppEf}
    `
    const ppParams: any[] = [clientId, ...ppEfParams]

    if (startDate) {
      ppQuery += ' AND date(payment_date) >= ?'
      ppParams.push(startDate)
    }
    if (endDate) {
      ppQuery += ' AND date(payment_date) <= ?'
      ppParams.push(endDate)
    }

    ppQuery += ' ORDER BY payment_date ASC, created_at ASC'
    ppQuery += ' LIMIT 500'  // 확장성: 거래처별 지급 무제한 스캔 방지(방어적 cap)
    const { results: purchasePayments } = await c.env.DB.prepare(ppQuery).bind(...ppParams).all<PurchasePaymentRow>()

    // Get purchase adjustments (감액 - credit) — 파생 잔액(POs − payments − adjustments)을 정산 리포트와 동일 기준으로 맞춤
    const { clause: paEf, params: paEfParams } = entityFilter(c)
    let clientPaQuery = `
      SELECT id, adjustment_date as date, amount, type, reason, po_id, created_at
      FROM purchase_adjustments
      WHERE supplier_id = ?${paEf}
    `
    const clientPaParams: any[] = [clientId, ...paEfParams]
    if (startDate) { clientPaQuery += ' AND date(adjustment_date) >= ?'; clientPaParams.push(startDate) }
    if (endDate) { clientPaQuery += ' AND date(adjustment_date) <= ?'; clientPaParams.push(endDate) }
    clientPaQuery += ' ORDER BY adjustment_date ASC, created_at ASC LIMIT 500'
    const { results: purchaseAdjustments } = await c.env.DB.prepare(clientPaQuery).bind(...clientPaParams)
      .all<{ id: number; date: string; amount: number; type: string; reason: string | null; po_id: number | null; created_at: string }>()

    // Calculate totals
    const totalPurchases = purchaseOrders.reduce((sum, o) => sum + (o.final_amount || 0), 0)
    const totalPayments = purchasePayments.reduce((sum, p) => sum + (p.amount || 0), 0)
    const totalAdjustments = purchaseAdjustments.reduce((sum, a) => sum + (a.amount || 0), 0)

    // 전기이월(조회 시작일 이전 순잔액) — 기간필터 시 러닝밸런스 기준점 (매출 원장과 동일 구조)
    let opening_balance = 0
    if (startDate) {
      const obEf = entityFilter(c)
      const obRow = await c.env.DB.prepare(
        `SELECT (SELECT COALESCE(SUM(final_amount),0) FROM purchase_orders WHERE supplier_id = ? AND status NOT IN ('DRAFT','CANCELLED') AND date(order_date) < ?${obEf.clause})`
        + ` - (SELECT COALESCE(SUM(amount),0) FROM purchase_payments WHERE supplier_id = ? AND date(payment_date) < ?${obEf.clause})`
        + ` - (SELECT COALESCE(SUM(amount),0) FROM purchase_adjustments WHERE supplier_id = ? AND date(adjustment_date) < ?${obEf.clause}) AS ob`
      ).bind(
        clientId, startDate, ...obEf.params,
        clientId, startDate, ...obEf.params,
        clientId, startDate, ...obEf.params
      ).first<{ ob: number }>()
      opening_balance = Number(obRow?.ob) || 0
    }

    // 잔액 = 전기이월 + 기간 순증감 (기간필터 없으면 opening_balance=0 → 전체 잔액)
    const balance = opening_balance + totalPurchases - totalPayments - totalAdjustments

    // Find last payment date
    const lastPayment = purchasePayments.length > 0 ? purchasePayments[purchasePayments.length - 1] : null

    // Combine and sort by date ASC for running balance
    const transactions = [
      ...purchaseOrders.map(o => ({
        type: 'purchase',
        date: o.date,
        description: `발주: ${o.po_number}`,
        debit: o.final_amount || 0,
        credit: 0,
        reference: o.po_number,
        status: o.status
      })),
      ...purchasePayments.map(p => ({
        type: 'payment',
        id: p.id,
        date: p.date,
        description: `지급: ${p.payment_method || ''}`,
        debit: 0,
        credit: p.amount || 0,
        amount: p.amount || 0,
        payment_method: p.payment_method || '',
        reference: p.reference_number,
        po_id: p.po_id,
        notes: p.notes
      })),
      ...purchaseAdjustments.map(a => ({
        type: 'adjustment',
        id: a.id,
        date: a.date,
        description: `감액: ${a.type || ''}${a.reason ? ' - ' + a.reason : ''}`,
        debit: 0,
        credit: a.amount || 0,
        reference: a.po_id ? `발주 #${a.po_id}` : (a.type || ''),
        po_id: a.po_id
      }))
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Calculate running balance (ascending order) — 전기이월부터 누적
    let runningBalance = opening_balance
    const transactionsWithBalance = transactions.map(t => {
      runningBalance += t.debit - t.credit
      return { ...t, balance: runningBalance }
    })

    return c.json({
      success: true,
      data: {
        // 내부법인(그룹 3사)이면 프론트가 "회계허브 법인간거래 탭" 안내로 전환 (매입원장 노출 안 함)
        is_internal_entity: isInternalEntityClient(clientId),
        client,
        summary: {
          total_purchases: totalPurchases,
          total_payments: totalPayments,
          total_adjustments: totalAdjustments,
          opening_balance,
          balance,
          last_payment_date: lastPayment ? lastPayment.date : null
        },
        transactions: transactionsWithBalance.reverse(), // newest first for display
        purchase_count: purchaseOrders.length,
        payments_count: purchasePayments.length,
        adjustments_count: purchaseAdjustments.length
      }
    })
  } catch (error) {
    console.error('Get purchase ledger error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /purchase-settlement - 매입 정산 리포트
apRouter.get('/purchase-settlement', async (c) => {
  try {
    const { startDate, endDate } = c.req.query()

    // Build purchase order date filter
    const { clause: settlPoEf, params: settlPoEfParams } = entityFilter(c, 'po')
    let poFilter = settlPoEf
    const poParams: any[] = [...settlPoEfParams]
    if (startDate) { poFilter += ' AND date(po.order_date) >= ?'; poParams.push(startDate) }
    if (endDate) { poFilter += ' AND date(po.order_date) <= ?'; poParams.push(endDate) }

    // Build payment date filter
    const { clause: settlPpEf, params: settlPpEfParams } = entityFilter(c, 'pp')
    let ppFilter = settlPpEf
    const ppParams: any[] = [...settlPpEfParams]
    if (startDate) { ppFilter += ' AND date(pp.payment_date) >= ?'; ppParams.push(startDate) }
    if (endDate) { ppFilter += ' AND date(pp.payment_date) <= ?'; ppParams.push(endDate) }

    // Step 1: Get per-supplier purchase order totals
    const poQuery = `
      SELECT supplier_id, COUNT(*) as po_count, COALESCE(SUM(final_amount), 0) as total_purchases
      FROM purchase_orders po WHERE status NOT IN ('DRAFT', 'CANCELLED') ${poFilter}
      GROUP BY supplier_id
    `
    const { results: poResults } = poParams.length > 0
      ? await c.env.DB.prepare(poQuery).bind(...poParams).all<PoAggRow>()
      : await c.env.DB.prepare(poQuery).all<PoAggRow>()

    // Step 2: Get per-supplier payment totals
    const ppQuery = `
      SELECT supplier_id, COALESCE(SUM(amount), 0) as total_payments
      FROM purchase_payments pp WHERE 1=1 ${ppFilter}
      GROUP BY supplier_id
    `
    const { results: ppResults } = ppParams.length > 0
      ? await c.env.DB.prepare(ppQuery).bind(...ppParams).all<PpAggRow>()
      : await c.env.DB.prepare(ppQuery).all<PpAggRow>()

    // Step 3: Get active suppliers with 법인별 파생 AP 잔액 (purchase_balance 캐시 폐기 — clients 공유 테이블이라 법인 구분 불가)
    //   파생 = SUM(po.final_amount, status NOT IN DRAFT/CANCELLED) − SUM(payments) − SUM(adjustments), 전부 entity 필터(전체모드=0이면 생략).
    //   AR(receivables) 사전집계 LEFT JOIN 전례와 동일 1-pass. 캐시 UPDATE writer는 레거시로 유지.
    const balEf = entityFilter(c)
    const { results: suppliers } = await c.env.DB.prepare(`
      SELECT c.id, c.client_code, c.client_name,
        (COALESCE(bpo.v, 0) - COALESCE(bpp.v, 0) - COALESCE(bpa.v, 0)) as purchase_balance
      FROM clients c
      LEFT JOIN (
        SELECT supplier_id, SUM(final_amount) AS v FROM purchase_orders
        WHERE status NOT IN ('DRAFT', 'CANCELLED')${balEf.clause} GROUP BY supplier_id
      ) bpo ON bpo.supplier_id = c.id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) AS v FROM purchase_payments WHERE 1=1${balEf.clause} GROUP BY supplier_id
      ) bpp ON bpp.supplier_id = c.id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) AS v FROM purchase_adjustments WHERE 1=1${balEf.clause} GROUP BY supplier_id
      ) bpa ON bpa.supplier_id = c.id
      WHERE c.is_active = 1${excludeInternalClientsSql('c.id')}
    `).bind(...balEf.params, ...balEf.params, ...balEf.params).all<SupplierRow>()

    // Merge
    const poMap = new Map(poResults.map(o => [o.supplier_id, o]))
    const ppMap = new Map(ppResults.map(p => [p.supplier_id, p]))

    const supplierRows = suppliers
      .map(s => {
        const po = poMap.get(s.id)
        const pp = ppMap.get(s.id)
        if (!po && !pp) return null
        return {
          id: s.id,
          client_code: s.client_code,
          client_name: s.client_name,
          purchase_balance: s.purchase_balance || 0,
          po_count: po?.po_count || 0,
          total_purchases: po?.total_purchases || 0,
          total_payments: pp?.total_payments || 0
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.purchase_balance - a.purchase_balance)

    const summary = supplierRows.reduce((acc, s) => ({
      total_suppliers: acc.total_suppliers + 1,
      total_purchases: acc.total_purchases + s.total_purchases,
      total_payments: acc.total_payments + s.total_payments,
      total_balance: acc.total_balance + s.purchase_balance
    }), { total_suppliers: 0, total_purchases: 0, total_payments: 0, total_balance: 0 })

    return c.json({
      success: true,
      data: { summary, suppliers: supplierRows }
    })
  } catch (error) {
    console.error('Get purchase settlement error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /purchase-monthly-summary - 매입 월별 요약
apRouter.get('/purchase-monthly-summary', async (c) => {
  try {
    const { year, months = '12' } = c.req.query()
    const targetYear = year || String(kstYear())
    const monthCount = Number(months)

    // Monthly purchase order totals
    const { clause: monthlyPoEf, params: monthlyPoEfParams } = entityFilter(c)
    const { results: poByMonth } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', order_date) as month,
        COUNT(*) as po_count,
        COALESCE(SUM(final_amount), 0) as total_purchases
      FROM purchase_orders
      WHERE strftime('%Y', order_date) >= ?
        AND status NOT IN ('DRAFT', 'CANCELLED')${monthlyPoEf}
      GROUP BY strftime('%Y-%m', order_date)
      ORDER BY month DESC
      LIMIT ?
    `).bind(String(Number(targetYear) - 1), ...monthlyPoEfParams, monthCount).all<MonthlyPoRow>()

    // Monthly payment totals
    const { clause: monthlyPpEf, params: monthlyPpEfParams } = entityFilter(c)
    const { results: ppByMonth } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', payment_date) as month,
        COUNT(*) as payment_count,
        COALESCE(SUM(amount), 0) as total_payments
      FROM purchase_payments
      WHERE strftime('%Y', payment_date) >= ?${monthlyPpEf}
      GROUP BY strftime('%Y-%m', payment_date)
      ORDER BY month DESC
      LIMIT ?
    `).bind(String(Number(targetYear) - 1), ...monthlyPpEfParams, monthCount).all<MonthlyPpRow>()

    // Merge into one array
    const monthMap = new Map<string, { month: string; po_count: number; total_purchases: number; payment_count: number; total_payments: number }>()

    ;poByMonth.forEach(o => {
      monthMap.set(o.month, {
        month: o.month,
        po_count: o.po_count,
        total_purchases: o.total_purchases,
        payment_count: 0,
        total_payments: 0
      })
    })

    ;ppByMonth.forEach(p => {
      const existing = monthMap.get(p.month)
      if (existing) {
        existing.payment_count = p.payment_count
        existing.total_payments = p.total_payments
      } else {
        monthMap.set(p.month, {
          month: p.month,
          po_count: 0,
          total_purchases: 0,
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
    console.error('Get purchase monthly summary error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /purchase-payment - 지급 등록 (MANAGER+)
apRouter.post('/purchase-payment', requireEditOrRole('/ledger', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json()

    // Validate required fields
    if (!body.supplier_id || !body.amount || !body.payment_date) {
      return c.json({
        success: false,
        error: 'supplier_id, amount, payment_date 필수'
      }, 400)
    }

    if (body.amount <= 0) {
      return c.json({ success: false, error: '지급액은 0보다 커야 합니다' }, 400)
    }

    // Check if supplier exists
    const supplier = await c.env.DB.prepare(
      'SELECT id, purchase_balance FROM clients WHERE id = ?'
    ).bind(body.supplier_id).first()

    if (!supplier) {
      return c.json({ success: false, error: '거래처를 찾을 수 없습니다' }, 404)
    }

    // Insert purchase payment
    const result = await c.env.DB.prepare(`
      INSERT INTO purchase_payments (
        supplier_id, payment_date, amount, payment_method,
        reference_number, po_id, notes, created_by, entity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.supplier_id,
      body.payment_date,
      body.amount,
      body.payment_method || null,
      body.reference_number || null,
      body.po_id || null,
      body.notes || null,
      user?.id || 1,
      getEntityId(c) || 1
    ).run()

    // #164: atomic purchase_balance 감소 (race condition 방지)
    await c.env.DB.prepare(
      'UPDATE clients SET purchase_balance = COALESCE(purchase_balance, 0) - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(body.amount, body.supplier_id).run()

    const updatedSupplier = await c.env.DB.prepare(
      'SELECT purchase_balance FROM clients WHERE id = ?'
    ).bind(body.supplier_id).first<{ purchase_balance: number }>()

    return c.json({
      success: true,
      data: {
        id: result.meta.last_row_id,
        new_purchase_balance: updatedSupplier?.purchase_balance ?? 0
      },
      message: '지급이 등록되었습니다'
    })
  } catch (error) {
    console.error('Record purchase payment error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// PUT /purchase-payment/:id - 지급 수정 (MANAGER+)
apRouter.put('/purchase-payment/:id', requireEditOrRole('/ledger', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()

    // Get existing payment — #446/#452: 타법인 매입지급 변조 차단(read-back 404 게이트 → 하위 UPDATE/잔액조정 미실행)
    const ef = entityFilter(c)
    const existing = await c.env.DB.prepare(
      'SELECT id, supplier_id, po_id, payment_date, amount, payment_method, reference_number, notes, created_at FROM purchase_payments WHERE id = ?' + ef.clause
    ).bind(id, ...ef.params).first<PurchasePaymentRow>()

    if (!existing) {
      return c.json({ success: false, error: '지급 내역을 찾을 수 없습니다' }, 404)
    }

    const newAmount = body.amount !== undefined ? body.amount : existing.amount
    if (newAmount <= 0) {
      return c.json({ success: false, error: '지급액은 0보다 커야 합니다' }, 400)
    }

    // Calculate balance adjustment
    const amountDiff = newAmount - existing.amount

    // Update payment record
    await c.env.DB.prepare(`
      UPDATE purchase_payments SET
        payment_date = ?,
        amount = ?,
        payment_method = ?,
        reference_number = ?,
        po_id = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      body.payment_date || existing.payment_date,
      newAmount,
      body.payment_method !== undefined ? body.payment_method : existing.payment_method,
      body.reference_number !== undefined ? body.reference_number : existing.reference_number,
      body.po_id !== undefined ? body.po_id : existing.po_id,
      body.notes !== undefined ? body.notes : existing.notes,
      id
    ).run()

    // Adjust purchase_balance: balance decreases when payment increases
    if (amountDiff !== 0) {
      await c.env.DB.prepare(
        'UPDATE clients SET purchase_balance = purchase_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(amountDiff, existing.supplier_id).run()
    }

    // Get updated balance
    const supplier = await c.env.DB.prepare(
      'SELECT purchase_balance FROM clients WHERE id = ?'
    ).bind(existing.supplier_id).first<BalanceRow>()

    return c.json({
      success: true,
      data: { new_purchase_balance: supplier?.purchase_balance || 0 },
      message: '지급 내역이 수정되었습니다'
    })
  } catch (error) {
    console.error('Update purchase payment error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// DELETE /purchase-payment/:id - 지급 삭제 (ADMIN)
apRouter.delete('/purchase-payment/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')

    // Get existing payment — #446/#452: 타법인 매입지급 삭제 차단(read-back 404 게이트 → 하위 DELETE/잔액복원 미실행)
    const ef = entityFilter(c)
    const existing = await c.env.DB.prepare(
      'SELECT id, supplier_id, po_id, payment_date, amount, payment_method, reference_number, notes, created_at FROM purchase_payments WHERE id = ?' + ef.clause
    ).bind(id, ...ef.params).first<PurchasePaymentRow>()

    if (!existing) {
      return c.json({ success: false, error: '지급 내역을 찾을 수 없습니다' }, 404)
    }

    // Delete payment
    await c.env.DB.prepare('DELETE FROM purchase_payments WHERE id = ?').bind(id).run()

    // Restore purchase_balance (add back the deleted payment amount - 채무 복원)
    await c.env.DB.prepare(
      'UPDATE clients SET purchase_balance = purchase_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(existing.amount, existing.supplier_id).run()

    // bank 출금 연결 해제 (0466 대칭) — 지급 삭제 시 연결된 은행거래를 미매칭으로 복원
    await c.env.DB.prepare(
      `UPDATE bank_transactions SET match_status = 'UNMATCHED', matched_purchase_payment_id = NULL, matched_link_mode = NULL WHERE matched_purchase_payment_id = ?`
    ).bind(id).run()

    // Get updated balance
    const supplier = await c.env.DB.prepare(
      'SELECT purchase_balance FROM clients WHERE id = ?'
    ).bind(existing.supplier_id).first<BalanceRow>()

    return c.json({
      success: true,
      data: { new_purchase_balance: supplier?.purchase_balance || 0 },
      message: '지급 내역이 삭제되었습니다'
    })
  } catch (error) {
    console.error('Delete purchase payment error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// =============================================================================
// 수금 독촉 이력 (Collection Logs)
// =============================================================================

// GET /collection-logs/:clientId - 독촉 이력 조회
apRouter.post('/purchase-adjustment', requireEditOrRole('/ledger', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json()

    if (!body.supplier_id || !body.type || body.amount === undefined) {
      return c.json({
        success: false,
        error: 'supplier_id, type, amount 필수'
      }, 400)
    }

    const validTypes = ['DISCOUNT', 'CLAIM', 'RETURN', 'OTHER']
    if (!validTypes.includes(body.type)) {
      return c.json({
        success: false,
        error: `type은 ${validTypes.join('|')} 중 하나여야 합니다`
      }, 400)
    }

    const amount = Number(body.amount)
    if (amount <= 0) {
      return c.json({ success: false, error: '금액은 0보다 커야 합니다' }, 400)
    }

    const supplier = await c.env.DB.prepare(
      'SELECT id, purchase_balance FROM clients WHERE id = ?'
    ).bind(body.supplier_id).first<{ id: number; purchase_balance: number }>()

    if (!supplier) {
      return c.json({ success: false, error: 'Supplier not found' }, 404)
    }

    const adjEntityId = getEntityId(c) || 1
    const result = await c.env.DB.prepare(`
      INSERT INTO purchase_adjustments (supplier_id, po_id, type, amount, reason, adjustment_date, created_by, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.supplier_id,
      body.po_id || null,
      body.type,
      amount,
      body.reason || null,
      body.adjustment_date || kstYmd(),
      user?.id || null,
      adjEntityId
    ).run()

    // 지급액 감소 (감액 → purchase_balance 차감)
    await c.env.DB.prepare(
      'UPDATE clients SET purchase_balance = purchase_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(amount, body.supplier_id).run()

    const updatedSupplier = await c.env.DB.prepare(
      'SELECT purchase_balance FROM clients WHERE id = ?'
    ).bind(body.supplier_id).first<BalanceRow>()

    return c.json({
      success: true,
      data: {
        id: result.meta.last_row_id,
        new_purchase_balance: updatedSupplier?.purchase_balance || 0
      }
    })
  } catch (error) {
    console.error('Create purchase adjustment error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /purchase-adjustments/:supplierId - 매입 감액 이력
apRouter.get('/purchase-adjustments/:supplierId', async (c) => {
  try {
    const supplierId = c.req.param('supplierId')

    const paEf = entityFilter(c, 'pa')
    const { results } = await c.env.DB.prepare(`
      SELECT
        pa.*,
        u.name as created_by_name
      FROM purchase_adjustments pa
      LEFT JOIN users u ON pa.created_by = u.id
      WHERE pa.supplier_id = ?${paEf.clause}
      ORDER BY pa.adjustment_date DESC
      LIMIT 500
    `).bind(supplierId, ...paEf.params).all()

    // 확장성: 전체 건수(방어적 cap 500 초과 여부 판별용)
    const paCntEf = entityFilter(c, 'pa')
    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM purchase_adjustments pa WHERE pa.supplier_id = ?${paCntEf.clause}`
    ).bind(supplierId, ...paCntEf.params).first<{ cnt: number }>()

    return c.json({ success: true, data: results, total: Number(countRow?.cnt) || 0 })
  } catch (error) {
    console.error('Get purchase adjustments error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// DELETE /purchase-adjustment/:id - 매입 감액 삭제 (ADMIN)
apRouter.delete('/purchase-adjustment/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')

    // #446/#452: 타법인 매입감액 삭제 차단(read-back 404 게이트 → 하위 DELETE/잔액복원 미실행)
    const ef = entityFilter(c)
    const existing = await c.env.DB.prepare(
      'SELECT id, supplier_id, po_id, type, amount, reason, adjustment_date, created_at FROM purchase_adjustments WHERE id = ?' + ef.clause
    ).bind(id, ...ef.params).first<PurchaseAdjustmentRow>()

    if (!existing) {
      return c.json({ success: false, error: '매입 감액 내역을 찾을 수 없습니다' }, 404)
    }

    await c.env.DB.prepare('DELETE FROM purchase_adjustments WHERE id = ?').bind(id).run()

    // 감액 복원 (purchase_balance 증가)
    await c.env.DB.prepare(
      'UPDATE clients SET purchase_balance = purchase_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(existing.amount, existing.supplier_id).run()

    const updatedSupplier = await c.env.DB.prepare(
      'SELECT purchase_balance FROM clients WHERE id = ?'
    ).bind(existing.supplier_id).first<BalanceRow>()

    return c.json({
      success: true,
      data: { new_purchase_balance: updatedSupplier?.purchase_balance || 0 },
      message: '매입 감액 내역이 삭제되었습니다'
    })
  } catch (error) {
    console.error('Delete purchase adjustment error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /purchase-overdue - 미지급 경고 목록
apRouter.get('/purchase-overdue', async (c) => {
  try {
    // purchase_balance 캐시 폐기 → 법인별 파생(POs − payments − adjustments, entity 필터). 사전집계 LEFT JOIN 1-pass.
    const ovEf = entityFilter(c)
    const { results: rows } = await c.env.DB.prepare(`
      SELECT c.id, c.client_code, c.client_name,
        (COALESCE(bpo.v, 0) - COALESCE(bpp.v, 0) - COALESCE(bpa.v, 0)) as purchase_balance,
        c.overdue_alert_days,
        bpo.last_order_date as last_order_date,
        bpp.last_payment_date as last_payment_date
      FROM clients c
      LEFT JOIN (
        SELECT supplier_id, SUM(final_amount) AS v, MAX(order_date) AS last_order_date
        FROM purchase_orders WHERE status NOT IN ('DRAFT', 'CANCELLED')${ovEf.clause} GROUP BY supplier_id
      ) bpo ON bpo.supplier_id = c.id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) AS v, MAX(payment_date) AS last_payment_date
        FROM purchase_payments WHERE 1=1${ovEf.clause} GROUP BY supplier_id
      ) bpp ON bpp.supplier_id = c.id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) AS v FROM purchase_adjustments WHERE 1=1${ovEf.clause} GROUP BY supplier_id
      ) bpa ON bpa.supplier_id = c.id
      -- ⚠️ client_type 필터 금지: prod 매입처는 대부분 'SALES' 타입(PURCHASE/BOTH 4곳뿐) → 잔액>0 실질기준만 (2026-07-16 전례)
      -- 내부법인(그룹 3사)만 supplier_id NOT IN 제외 — 법인간거래는 회계허브 법인간거래 탭으로 이관 (client_type 필터 아님)
      WHERE (COALESCE(bpo.v, 0) - COALESCE(bpp.v, 0) - COALESCE(bpa.v, 0)) > 0${excludeInternalClientsSql('c.id')}
      ORDER BY purchase_balance DESC
    `).bind(...ovEf.params, ...ovEf.params, ...ovEf.params).all<OverdueRow>()

    const today = new Date()
    const overdue = rows.map((row) => {
      let days_since_last_payment = null
      let is_overdue = false

      if (row.last_payment_date) {
        const lastPaymentDate = new Date(row.last_payment_date)
        days_since_last_payment = Math.floor((today.getTime() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24))
        const alertDays = row.overdue_alert_days || 30
        is_overdue = days_since_last_payment > alertDays
      }

      return {
        supplier_id: row.id,
        client_code: row.client_code,
        client_name: row.client_name,
        purchase_balance: row.purchase_balance,
        last_order_date: row.last_order_date,
        last_payment_date: row.last_payment_date,
        days_since_last_payment,
        is_overdue,
        alert_days: row.overdue_alert_days || 30
      }
    })

    return c.json({
      success: true,
      data: overdue
    })
  } catch (error) {
    console.error('Get purchase overdue error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /purchase-integrity-check - 매입 정합성 검사
apRouter.get('/purchase-integrity-check', requireEditOrRole('/ledger', 'MANAGER'), async (c) => {
  try {
    const { clause: intPoEf, params: intPoEfParams } = entityFilter(c)
    const { clause: intPpEf, params: intPpEfParams } = entityFilter(c)
    const { clause: intPaEf, params: intPaEfParams } = entityFilter(c)
    const { results: rows } = await c.env.DB.prepare(`
      SELECT c.id, c.client_code, c.client_name, c.purchase_balance,
        COALESCE(po.v, 0) as total_orders,
        COALESCE(pp.v, 0) as total_paid,
        COALESCE(pa.v, 0) as total_adj
      FROM clients c
      LEFT JOIN (
        SELECT supplier_id, SUM(final_amount) as v
        FROM purchase_orders WHERE status IN ('CONFIRMED', 'RECEIVED', 'PARTIAL_RECEIVED')${intPoEf}
        GROUP BY supplier_id
      ) po ON po.supplier_id = c.id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) as v FROM purchase_payments WHERE 1=1${intPpEf} GROUP BY supplier_id
      ) pp ON pp.supplier_id = c.id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) as v FROM purchase_adjustments WHERE 1=1${intPaEf} GROUP BY supplier_id
      ) pa ON pa.supplier_id = c.id
      WHERE c.is_active = 1${excludeInternalClientsSql('c.id')} AND (po.v IS NOT NULL OR pp.v IS NOT NULL OR pa.v IS NOT NULL OR COALESCE(c.purchase_balance, 0) <> 0)
    `).bind(...intPoEfParams, ...intPpEfParams, ...intPaEfParams).all<IntegrityRow>()

    const discrepancies: { supplier_id: number; client_code: string; client_name: string; cached_purchase_balance: number; calculated_purchase_balance: number; difference: number }[] = []
    for (const row of rows) {
      const calculated = Number(row.total_orders) - Number(row.total_paid) - Number(row.total_adj)
      const cached = Number(row.purchase_balance) || 0
      if (Math.abs(calculated - cached) > 0.01) {
        discrepancies.push({
          supplier_id: row.id,
          client_code: row.client_code,
          client_name: row.client_name,
          cached_purchase_balance: cached,
          calculated_purchase_balance: +(calculated.toFixed(2)),
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

// POST /purchase-integrity-fix - 매입 정합성 일괄 수정
apRouter.post('/purchase-integrity-fix', requireEditOrRole('/ledger', 'MANAGER'), async (c) => {
  try {
    const { supplier_ids } = await c.req.json() as { supplier_ids?: number[] }

    const { clause: fixPoEf, params: fixPoEfParams } = entityFilter(c)
    const { clause: fixPpEf, params: fixPpEfParams } = entityFilter(c)
    const { clause: fixPaEf, params: fixPaEfParams } = entityFilter(c)
    const { results: rows } = await c.env.DB.prepare(`
      SELECT c.id, c.client_code, c.client_name, c.purchase_balance,
        COALESCE(po.v, 0) as total_orders,
        COALESCE(pp.v, 0) as total_paid,
        COALESCE(pa.v, 0) as total_adj
      FROM clients c
      LEFT JOIN (
        SELECT supplier_id, SUM(final_amount) as v
        FROM purchase_orders WHERE status IN ('CONFIRMED', 'RECEIVED', 'PARTIAL_RECEIVED')${fixPoEf}
        GROUP BY supplier_id
      ) po ON po.supplier_id = c.id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) as v FROM purchase_payments WHERE 1=1${fixPpEf} GROUP BY supplier_id
      ) pp ON pp.supplier_id = c.id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) as v FROM purchase_adjustments WHERE 1=1${fixPaEf} GROUP BY supplier_id
      ) pa ON pa.supplier_id = c.id
      WHERE c.is_active = 1${excludeInternalClientsSql('c.id')} AND (po.v IS NOT NULL OR pp.v IS NOT NULL OR pa.v IS NOT NULL OR COALESCE(c.purchase_balance, 0) <> 0)
    `).bind(...fixPoEfParams, ...fixPpEfParams, ...fixPaEfParams).all<IntegrityRow>()

    let fixed = 0
    const fixResults: { supplier_id: number; client_name: string; old: number; new: number }[] = []

    for (const row of rows) {
      if (supplier_ids && supplier_ids.length > 0 && !supplier_ids.includes(row.id)) continue

      const calculated = Number(row.total_orders) - Number(row.total_paid) - Number(row.total_adj)
      const cached = Number(row.purchase_balance) || 0

      if (Math.abs(calculated - cached) > 0.01) {
        await c.env.DB.prepare(
          'UPDATE clients SET purchase_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(+(calculated.toFixed(2)), row.id).run()
        fixResults.push({ supplier_id: row.id, client_name: row.client_name, old: cached, new: +(calculated.toFixed(2)) })
        fixed++
      }
    }

    return c.json({
      success: true,
      data: { fixed, results: fixResults },
      message: `${fixed}건 매입 잔액 수정 완료`
    })
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /purchase-client/:clientId/export/csv - 매입 원장 CSV 내보내기
apRouter.get('/purchase-client/:clientId/export/csv', async (c) => {
  try {
    const clientId = c.req.param('clientId')
    const { startDate, endDate } = c.req.query()

    const supplier = await c.env.DB.prepare('SELECT client_name FROM clients WHERE id = ?').bind(clientId).first<ClientNameRow>()
    if (!supplier) return c.json({ success: false, error: 'Supplier not found' }, 404)

    // Purchase orders (발주)
    const { clause: csvPoEf, params: csvPoEfParams } = entityFilter(c)
    let poQuery = `
      SELECT id, po_number, order_date, final_amount, status, created_at
      FROM purchase_orders
      WHERE supplier_id = ?${csvPoEf}
    `
    const poParams: any[] = [clientId, ...csvPoEfParams]
    if (startDate) { poQuery += ' AND date(created_at) >= ?'; poParams.push(startDate) }
    if (endDate) { poQuery += ' AND date(created_at) <= ?'; poParams.push(endDate) }
    const { results: purchaseOrders } = await c.env.DB.prepare(poQuery + ' ORDER BY created_at ASC').bind(...poParams).all<CsvPoRow>()

    // Purchase payments (지급)
    const { clause: csvPpEf, params: csvPpEfParams } = entityFilter(c)
    let ppQuery = `
      SELECT id, payment_date, amount, payment_method, notes, created_at
      FROM purchase_payments
      WHERE supplier_id = ?${csvPpEf}
    `
    const ppParams: any[] = [clientId, ...csvPpEfParams]
    if (startDate) { ppQuery += ' AND date(payment_date) >= ?'; ppParams.push(startDate) }
    if (endDate) { ppQuery += ' AND date(payment_date) <= ?'; ppParams.push(endDate) }
    const { results: purchasePayments } = await c.env.DB.prepare(ppQuery + ' ORDER BY payment_date ASC').bind(...ppParams).all<CsvPpRow>()

    // Purchase adjustments (감액)
    const csvPaEf = entityFilter(c)
    let paQuery = `
      SELECT id, po_id, type, amount, reason, adjustment_date, created_at
      FROM purchase_adjustments
      WHERE supplier_id = ?${csvPaEf.clause}
    `
    const paParams: any[] = [clientId, ...csvPaEf.params]
    if (startDate) { paQuery += ' AND date(adjustment_date) >= ?'; paParams.push(startDate) }
    if (endDate) { paQuery += ' AND date(adjustment_date) <= ?'; paParams.push(endDate) }
    const { results: purchaseAdjustments } = await c.env.DB.prepare(paQuery + ' ORDER BY adjustment_date ASC').bind(...paParams).all<CsvPaRow>()

    const methodLabels: Record<string, string> = { CASH: '현금', CARD: '카드', BANK_TRANSFER: '계좌이체', CHECK: '수표', OTHER: '기타' }

    // Build unified entry list
    interface CsvEntry { date: string; type: string; ref: string; debit: number; credit: number; note: string; balance: number }
    const entries: CsvEntry[] = [
      ...(purchaseOrders || []).map((po) => ({
        date: po.order_date || (po.created_at ? po.created_at.slice(0, 10) : ''),
        type: '발주' as const,
        ref: po.po_number,
        debit: po.final_amount || 0,
        credit: 0,
        note: '',
        balance: 0
      })),
      ...(purchasePayments || []).map((p) => ({
        date: p.payment_date,
        type: '지급' as const,
        ref: methodLabels[p.payment_method || ''] || p.payment_method || '',
        debit: 0,
        credit: p.amount || 0,
        note: p.notes || '',
        balance: 0
      })),
      ...(purchaseAdjustments || []).map((adj) => ({
        date: adj.adjustment_date,
        type: '감액' as const,
        ref: adj.po_id ? `발주 #${adj.po_id}` : adj.type || '',
        debit: 0,
        credit: adj.amount || 0,
        note: adj.reason || '',
        balance: 0
      }))
    ]

    // Sort by date
    entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

    // Calculate running balance
    let balance = 0
    for (const entry of entries) {
      balance += entry.debit - entry.credit
      entry.balance = balance
    }

    // Format for CSV
    const headers = ['일자', '구분', '참조', '발주금액(차변)', '지급금액(대변)', '감액', '잔액', '비고']
    const rows = entries.map(entry => [
      entry.date,
      entry.type,
      entry.ref,
      entry.debit || '',
      entry.credit || '',
      entry.balance,
      entry.note
    ])

    const { generateCsv, csvResponse } = await import('../../utils/csv')
    const today = kstYmd()

    return csvResponse(c, `매입원장_${supplier.client_name}_${today}.csv`, generateCsv(headers, rows))
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})


export default apRouter
