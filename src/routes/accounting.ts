/**
 * accounting.ts — 회계 통합 관리 허브 API (회계 허브 Phase 1)
 *
 * spec: docs/superpowers/specs/2026-06-23-accounting-hub.md
 * 통합 조회·정정 허브. 입금/세금계산서/현금영수증/카드/매입을 한 화면에서 조회·정정.
 *
 * Phase 1 = 요약 KPI(수입/지출/미수금) + 입금(payments) 전체목록 조회.
 *   - GET /summary  : 기간 매출(billed) · 기간 지출(카드+매입) · 전체 미수금(파생)
 *   - GET /payments : 입금 전체목록 (기간·금액·검색 필터 + 페이지네이션)
 *   - 입금 수정/삭제는 기존 /api/ledger/payment/:id (ar-payments) 재사용.
 *
 * 모든 집계는 entity_id 필터(멀티법인) 적용. super-admin(entityId=0)은 전체.
 * billed_at은 UTC 타임스탬프 → KST 업무일 보정(+9h). 나머지(payment_date·invoice_date·
 * transaction_date)는 입력된 업무일이라 보정 불필요.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter } from '../utils/entityFilter'
import { kstDateOf } from '../utils/kstDate'

const accountingRouter = new Hono<HonoEnv>()
accountingRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

/** YYYY-MM-DD → 현재 KST 기준 이번달 1일/오늘 기본값 보정 (프론트가 항상 전달하지만 방어용) */
function defaultRange(start?: string, end?: string): { start: string; end: string } {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000) // KST
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return {
    start: start || `${y}-${m}-01`,
    end: end || `${y}-${m}-${d}`,
  }
}

// ===========================================================================
// GET /api/accounting/summary — 상단 요약 KPI
//   수입  = 기간 매출(order_billing_groups BILLED/PAID, billed_at KST)
//   지출  = 기간 카드사용(card_transactions ≠CANCEL) + 매입(purchase_invoices total)
//   미수금 = 전체 미수금 파생 (billed[BILLED] − payments − adjustments), 기간무관 스냅샷
// ===========================================================================
accountingRouter.get('/summary', async (c) => {
  try {
    const { start, end } = defaultRange(c.req.query('start'), c.req.query('end'))
    const startCompact = start.replace(/-/g, '')
    const endCompact = end.replace(/-/g, '')

    // ── 수입: 기간 매출 (청구 법인 g 기준) ──
    const efG = entityFilter(c, 'g')
    const revenueRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(g.billed_amount), 0) AS v
      FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
      WHERE g.billing_status IN ('BILLED','PAID') AND o.status != 'CANCELLED'
        AND ${kstDateOf('g.billed_at')} >= ? AND ${kstDateOf('g.billed_at')} <= ?${efG.clause}
    `).bind(start, end, ...efG.params).first<{ v: number }>()

    // ── 지출(카드): 기간 카드사용 (취소는 차감) ──
    const efCt = entityFilter(c, 'ct')
    const cardRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(CASE WHEN ct.approval_type != 'CANCEL' THEN ct.amount ELSE -ct.amount END), 0) AS v
      FROM card_transactions ct
      WHERE ct.transaction_date >= ? AND ct.transaction_date <= ?${efCt.clause}
    `).bind(startCompact, endCompact, ...efCt.params).first<{ v: number }>()

    // ── 지출(매입): 기간 매입확정 (인보이스 일자 기준) ──
    const efPi = entityFilter(c, 'pi')
    const purchaseRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(pi.total_amount), 0) AS v
      FROM purchase_invoices pi
      WHERE date(pi.invoice_date) >= ? AND date(pi.invoice_date) <= ?${efPi.clause}
    `).bind(start, end, ...efPi.params).first<{ v: number }>()

    // ── 미수금: 전체 파생 (deriveClientBalance 집계와 동일 정의) ──
    const efGall = entityFilter(c, 'g')
    const billedAll = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(g.billed_amount), 0) AS v
      FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
      WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${efGall.clause}
    `).bind(...efGall.params).first<{ v: number }>()
    const efP = entityFilter(c, 'p')
    const paidAll = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(p.amount), 0) AS v FROM payments p WHERE 1=1${efP.clause}`
    ).bind(...efP.params).first<{ v: number }>()
    const efA = entityFilter(c, 'a')
    const adjAll = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(a.amount), 0) AS v FROM adjustments a WHERE 1=1${efA.clause}`
    ).bind(...efA.params).first<{ v: number }>()

    const revenue = Number(revenueRow?.v) || 0
    const expenseCard = Number(cardRow?.v) || 0
    const expensePurchase = Number(purchaseRow?.v) || 0
    const receivable = (Number(billedAll?.v) || 0) - (Number(paidAll?.v) || 0) - (Number(adjAll?.v) || 0)

    return c.json({
      success: true,
      data: {
        period: { start, end },
        revenue,
        expense_total: expenseCard + expensePurchase,
        expense_card: expenseCard,
        expense_purchase: expensePurchase,
        receivable,
      },
    })
  } catch (error) {
    console.error('Accounting summary error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===========================================================================
// GET /api/accounting/payments — 입금 전체목록 (회계 허브 입금 탭)
//   필터: start/end(payment_date) · clientId · amountMin/amountMax · search(거래처/참조/메모) · entity
//   페이지네이션 + 조회 합계.
// ===========================================================================
accountingRouter.get('/payments', async (c) => {
  try {
    const q = c.req.query()
    const ef = entityFilter(c, 'p')

    let where = `WHERE 1=1${ef.clause}`
    const params: (string | number)[] = [...ef.params]

    if (q.start) { where += ' AND date(p.payment_date) >= ?'; params.push(q.start) }
    if (q.end) { where += ' AND date(p.payment_date) <= ?'; params.push(q.end) }
    if (q.clientId) { where += ' AND p.client_id = ?'; params.push(q.clientId) }
    if (q.amountMin) { where += ' AND p.amount >= ?'; params.push(Number(q.amountMin)) }
    if (q.amountMax) { where += ' AND p.amount <= ?'; params.push(Number(q.amountMax)) }
    if (q.search) {
      where += ' AND (c.client_name LIKE ? OR p.reference_number LIKE ? OR p.notes LIKE ?)'
      const kw = '%' + q.search + '%'
      params.push(kw, kw, kw)
    }

    // 합계 + 건수 (동일 WHERE — JOIN clients 포함: search가 client_name 참조)
    const aggRow = await c.env.DB.prepare(`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(p.amount), 0) AS total
      FROM payments p LEFT JOIN clients c ON p.client_id = c.id
      ${where}
    `).bind(...params).first<{ cnt: number; total: number }>()
    const total = aggRow?.cnt || 0

    const page = Math.max(1, Number(q.page) || 1)
    const limit = Math.min(Math.max(1, Number(q.limit) || 50), 200)
    const offset = (page - 1) * limit

    const { results } = await c.env.DB.prepare(`
      SELECT p.*, c.client_name, u.name AS created_by_name
      FROM payments p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      ${where}
      ORDER BY date(p.payment_date) DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all()

    return c.json({
      success: true,
      data: results,
      summary: { total_amount: Number(aggRow?.total) || 0, total_count: total },
      pagination: { total, page, limit },
    })
  } catch (error) {
    console.error('Accounting payments error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===========================================================================
// GET /api/accounting/purchases — 매입 목록 (회계 허브 매입 탭, Phase 3)
//   기존 /api/purchase-invoices 목록 API에 기간 필터가 없어, 상단 KPI 기간 공유를 위해
//   accounting 라우트에 기간·검색·결제상태 필터 버전을 둔다. 매입확정/정정은 /purchase-invoices 링크아웃.
//   필터: start/end(invoice_date) · paymentStatus · search(공급처/계산서번호) · entity
// ===========================================================================
accountingRouter.get('/purchases', async (c) => {
  try {
    const q = c.req.query()
    const ef = entityFilter(c, 'pi')

    let where = `WHERE 1=1${ef.clause}`
    const params: (string | number)[] = [...ef.params]
    if (q.start) { where += ' AND date(pi.invoice_date) >= ?'; params.push(q.start) }
    if (q.end) { where += ' AND date(pi.invoice_date) <= ?'; params.push(q.end) }
    if (q.paymentStatus) { where += ' AND pi.payment_status = ?'; params.push(q.paymentStatus) }
    if (q.search) {
      where += ' AND (cl.client_name LIKE ? OR pi.invoice_number LIKE ?)'
      const kw = '%' + q.search + '%'
      params.push(kw, kw)
    }

    const aggRow = await c.env.DB.prepare(`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(pi.total_amount), 0) AS total
      FROM purchase_invoices pi LEFT JOIN clients cl ON cl.id = pi.supplier_id
      ${where}
    `).bind(...params).first<{ cnt: number; total: number }>()
    const total = aggRow?.cnt || 0

    const page = Math.max(1, Number(q.page) || 1)
    const limit = Math.min(Math.max(1, Number(q.limit) || 50), 200)
    const offset = (page - 1) * limit

    const { results } = await c.env.DB.prepare(`
      SELECT pi.*, cl.client_name AS supplier_name, po.po_number
      FROM purchase_invoices pi
      LEFT JOIN clients cl ON cl.id = pi.supplier_id
      LEFT JOIN purchase_orders po ON po.id = pi.po_id
      ${where}
      ORDER BY date(pi.invoice_date) DESC, pi.id DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all()

    return c.json({
      success: true,
      data: results,
      summary: { total_amount: Number(aggRow?.total) || 0, total_count: total },
      pagination: { total, page, limit },
    })
  } catch (error) {
    console.error('Accounting purchases error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===========================================================================
// GET /api/accounting/timeline — 수입/지출 통합 타임라인 (회계 허브 Phase 4)
//   수입(+) = 입금(payments) · 지출(−) = 카드(card_transactions, 취소 차감) + 매입(purchase_invoices)
//   기간 내 이벤트를 일자 역순 단일 목록으로 + 기간 집계(총수입/총지출/순현금).
//   kind=income|expense 로 한쪽만. signed_amount: 수입 +, 지출 −, 카드취소 +(환불).
//   카드 일자는 compact(YYYYMMDD) → 정규화. 모든 소스 entity_id 필터.
// ===========================================================================
accountingRouter.get('/timeline', async (c) => {
  try {
    const { start, end } = defaultRange(c.req.query('start'), c.req.query('end'))
    const startCompact = start.replace(/-/g, '')
    const endCompact = end.replace(/-/g, '')
    const kind = c.req.query('kind') // 'income' | 'expense' | undefined(전체)

    const efP = entityFilter(c, 'p')
    const efCt = entityFilter(c, 'ct')
    const efPi = entityFilter(c, 'pi')

    // 기간 집계 (총수입/총지출/순현금 + 건수)
    const incomeAgg = await c.env.DB.prepare(`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(p.amount), 0) AS v FROM payments p
      WHERE date(p.payment_date) >= ? AND date(p.payment_date) <= ?${efP.clause}
    `).bind(start, end, ...efP.params).first<{ cnt: number; v: number }>()
    const cardAgg = await c.env.DB.prepare(`
      SELECT COUNT(*) AS cnt,
             COALESCE(SUM(CASE WHEN ct.approval_type != 'CANCEL' THEN ct.amount ELSE -ct.amount END), 0) AS v
      FROM card_transactions ct
      WHERE ct.transaction_date >= ? AND ct.transaction_date <= ?${efCt.clause}
        AND EXISTS (SELECT 1 FROM corporate_cards cca WHERE cca.id = ct.card_id AND cca.is_active = 1)
    `).bind(startCompact, endCompact, ...efCt.params).first<{ cnt: number; v: number }>()
    const purAgg = await c.env.DB.prepare(`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(pi.total_amount), 0) AS v FROM purchase_invoices pi
      WHERE date(pi.invoice_date) >= ? AND date(pi.invoice_date) <= ?${efPi.clause}
    `).bind(start, end, ...efPi.params).first<{ cnt: number; v: number }>()

    const incomeTotal = Number(incomeAgg?.v) || 0
    const expenseCard = Number(cardAgg?.v) || 0
    const expensePurchase = Number(purAgg?.v) || 0
    const incomeCount = Number(incomeAgg?.cnt) || 0
    const expenseCount = (Number(cardAgg?.cnt) || 0) + (Number(purAgg?.cnt) || 0)

    let totalCount = incomeCount + expenseCount
    if (kind === 'income') totalCount = incomeCount
    else if (kind === 'expense') totalCount = expenseCount

    const page = Math.max(1, Number(c.req.query('page')) || 1)
    const limit = Math.min(Math.max(1, Number(c.req.query('limit')) || 50), 200)
    const offset = (page - 1) * limit

    const flowFilter = kind === 'income' ? "WHERE t.flow = 'income'"
      : kind === 'expense' ? "WHERE t.flow = 'expense'" : ''

    const { results } = await c.env.DB.prepare(`
      SELECT * FROM (
        SELECT 'income' AS flow, '입금' AS label, date(p.payment_date) AS evt_date,
               COALESCE(c.client_name, '-') AS party, p.payment_method AS detail,
               p.amount AS signed_amount, p.id AS ref_id
        FROM payments p LEFT JOIN clients c ON c.id = p.client_id
        WHERE date(p.payment_date) >= ? AND date(p.payment_date) <= ?${efP.clause}
        UNION ALL
        SELECT 'expense' AS flow, '카드' AS label,
               substr(ct.transaction_date,1,4) || '-' || substr(ct.transaction_date,5,2) || '-' || substr(ct.transaction_date,7,2) AS evt_date,
               COALESCE(ct.merchant_name, '-') AS party, cc.card_name AS detail,
               CASE WHEN ct.approval_type = 'CANCEL' THEN ct.amount ELSE -ct.amount END AS signed_amount, ct.id AS ref_id
        FROM card_transactions ct LEFT JOIN corporate_cards cc ON cc.id = ct.card_id
        WHERE ct.transaction_date >= ? AND ct.transaction_date <= ?${efCt.clause}
          AND EXISTS (SELECT 1 FROM corporate_cards cca WHERE cca.id = ct.card_id AND cca.is_active = 1)
        UNION ALL
        SELECT 'expense' AS flow, '매입' AS label, date(pi.invoice_date) AS evt_date,
               COALESCE(cl.client_name, '-') AS party, pi.invoice_number AS detail,
               -pi.total_amount AS signed_amount, pi.id AS ref_id
        FROM purchase_invoices pi LEFT JOIN clients cl ON cl.id = pi.supplier_id
        WHERE date(pi.invoice_date) >= ? AND date(pi.invoice_date) <= ?${efPi.clause}
      ) t
      ${flowFilter}
      ORDER BY t.evt_date DESC, t.label
      LIMIT ? OFFSET ?
    `).bind(
      start, end, ...efP.params,
      startCompact, endCompact, ...efCt.params,
      start, end, ...efPi.params,
      limit, offset
    ).all()

    return c.json({
      success: true,
      data: results,
      summary: {
        income_total: incomeTotal,
        expense_total: expenseCard + expensePurchase,
        expense_card: expenseCard,
        expense_purchase: expensePurchase,
        net: incomeTotal - (expenseCard + expensePurchase),
        total_count: totalCount,
      },
      pagination: { total: totalCount, page, limit },
    })
  } catch (error) {
    console.error('Accounting timeline error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default accountingRouter
