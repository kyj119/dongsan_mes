/**
 * taxInvoices/paymentMatch.ts — 발행↔입금 매칭 (Phase 3, 2026-06-24)
 *
 * 발행완료(ISSUED/SENT/NTS_SUCCESS) 세금계산서 ↔ 미매칭 입금(payments.tax_invoice_id IS NULL)을
 * 자동 "제안"하고, 사용자가 수동으로 연결/해제(확정)한다. **자동 확정 금지** — 제안만 반환.
 *
 * 라우트 (배럴 taxInvoices.ts에서 /api/tax-invoices prefix로 마운트):
 *   - GET  /:id{[0-9]+}/payment-match     발행 계산서의 입금 매칭 상태(연결된 입금 + 자동제안 후보)
 *   - GET  /payment-match/suggestions     전체 미매칭 발행계산서↔입금 자동제안 목록
 *   - PUT  /payments/:pid/tax-invoice     입금에 tax_invoice_id 설정/해제 (수동 확정)
 *
 * 매칭 기준(자동제안): client_id 일치 + 금액 정확 일치(total_amount) 또는 ±오차 + 날짜 근접(±60일).
 * entity 격리: payments/tax_invoices 모두 entityFilter 적용. 권한 ADMIN/MANAGER.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { entityFilter, getEntityId } from '../../utils/entityFilter'

const paymentMatchRouter = new Hono<HonoEnv>()
paymentMatchRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// 자동제안 매칭 기준 상수 (단일 소스)
const MATCH_AMOUNT_TOLERANCE = 0 // 금액 허용오차(원). 0 = 정확 일치만. (>0이면 |total-amount| <= 오차)
const MATCH_DATE_WINDOW_DAYS = 60 // 발행 작성일(issue_date) ↔ 입금일(payment_date) 근접 범위(±일)

interface TaxInvoiceRow {
  id: number
  invoice_number: string | null
  buyer_client_id: number
  buyer_name: string | null
  total_amount: number
  status: string
  issue_date: string | null
}
interface PaymentRow {
  id: number
  client_id: number
  payment_date: string
  amount: number
  payment_method: string | null
  reference_number: string | null
  notes: string | null
  tax_invoice_id: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /:id/payment-match — 단일 발행 계산서의 입금 매칭 상태 + 후보 제안
// ─────────────────────────────────────────────────────────────────────────────
paymentMatchRouter.get('/:id{[0-9]+}/payment-match', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const ef = entityFilter(c, 'ti')

    const inv = await c.env.DB.prepare(
      `SELECT ti.id, ti.invoice_number, ti.buyer_client_id, ti.buyer_name, ti.total_amount, ti.status, ti.issue_date
       FROM tax_invoices ti WHERE ti.id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<TaxInvoiceRow>()

    if (!inv) return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)

    // 이미 이 계산서에 연결된 입금
    const efP = entityFilter(c, 'p')
    const { results: linked } = await c.env.DB.prepare(
      `SELECT p.id, p.client_id, p.payment_date, p.amount, p.payment_method, p.reference_number, p.notes, p.tax_invoice_id
       FROM payments p WHERE p.tax_invoice_id = ?${efP.clause} ORDER BY p.payment_date DESC`
    ).bind(id, ...efP.params).all<PaymentRow>()

    const linkedTotal = (linked as PaymentRow[]).reduce((s, p) => s + (p.amount || 0), 0)

    // 발행완료 상태가 아니면 후보 제안 생략 (매칭은 발행완료 건만)
    let suggestions: PaymentRow[] = []
    if (['ISSUED', 'SENT', 'NTS_SUCCESS'].includes(inv.status)) {
      const amountClause = MATCH_AMOUNT_TOLERANCE > 0
        ? 'ABS(p.amount - ?) <= ?'
        : 'p.amount = ?'
      const amountParams: number[] = MATCH_AMOUNT_TOLERANCE > 0
        ? [inv.total_amount, MATCH_AMOUNT_TOLERANCE]
        : [inv.total_amount]
      // issue_date는 tax_invoices에서 NOT NULL이지만 방어적으로 COALESCE 처리.
      const issueDate = inv.issue_date || '1970-01-01'

      const { results: cand } = await c.env.DB.prepare(
        `SELECT p.id, p.client_id, p.payment_date, p.amount, p.payment_method, p.reference_number, p.notes, p.tax_invoice_id
         FROM payments p
         WHERE p.tax_invoice_id IS NULL
           AND p.client_id = ?
           AND ${amountClause}
           AND ABS(julianday(p.payment_date) - julianday(?)) <= ?${efP.clause}
         ORDER BY ABS(julianday(p.payment_date) - julianday(?)) ASC, p.payment_date DESC
         LIMIT 20`
      ).bind(
        inv.buyer_client_id,
        ...amountParams,
        issueDate,
        MATCH_DATE_WINDOW_DAYS,
        ...efP.params,
        issueDate
      ).all<PaymentRow>()
      suggestions = cand as PaymentRow[]
    }

    return c.json({
      success: true,
      data: {
        invoice: inv,
        matched: linked,
        matched_total: linkedTotal,
        is_matched: (linked as PaymentRow[]).length > 0,
        suggestions,
        criteria: { amount_tolerance: MATCH_AMOUNT_TOLERANCE, date_window_days: MATCH_DATE_WINDOW_DAYS }
      }
    })
  } catch (error) {
    console.error('src/routes/taxInvoices/paymentMatch.ts get error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /payment-match/suggestions — 전체 미매칭 발행계산서 ↔ 입금 자동제안
//   미매칭 입금(tax_invoice_id IS NULL)을 기준으로 client_id+금액+날짜 근접한 발행완료 계산서를 매핑.
//   1입금 ↔ N계산서 후보가 나올 수 있어 입금별 후보 배열로 반환. 자동확정 안 함.
// ─────────────────────────────────────────────────────────────────────────────
paymentMatchRouter.get('/payment-match/suggestions', async (c) => {
  try {
    const efP = entityFilter(c, 'p')
    const efT = entityFilter(c, 'ti')

    // 미매칭 입금 (entity 격리)
    const { results: pays } = await c.env.DB.prepare(
      `SELECT p.id, p.client_id, p.payment_date, p.amount, p.payment_method, p.reference_number, p.notes, p.tax_invoice_id,
              cl.client_name
       FROM payments p
       LEFT JOIN clients cl ON cl.id = p.client_id
       WHERE p.tax_invoice_id IS NULL${efP.clause}
       ORDER BY p.payment_date DESC
       LIMIT 500`
    ).bind(...efP.params).all<PaymentRow & { client_name: string | null }>()

    const amountClause = MATCH_AMOUNT_TOLERANCE > 0
      ? 'ABS(ti.total_amount - ?) <= ?'
      : 'ti.total_amount = ?'

    const suggestions: Array<Record<string, unknown>> = []
    for (const p of pays as Array<PaymentRow & { client_name: string | null }>) {
      const amountParams: number[] = MATCH_AMOUNT_TOLERANCE > 0
        ? [p.amount, MATCH_AMOUNT_TOLERANCE]
        : [p.amount]
      const { results: cands } = await c.env.DB.prepare(
        `SELECT ti.id, ti.invoice_number, ti.buyer_client_id, ti.buyer_name, ti.total_amount, ti.status, ti.issue_date
         FROM tax_invoices ti
         WHERE ti.status IN ('ISSUED','SENT','NTS_SUCCESS')
           AND ti.buyer_client_id = ?
           AND ${amountClause}
           AND (ti.issue_date IS NULL OR ABS(julianday(?) - julianday(ti.issue_date)) <= ?)
           AND ti.id NOT IN (SELECT tax_invoice_id FROM payments WHERE tax_invoice_id IS NOT NULL)${efT.clause}
         ORDER BY ABS(julianday(?) - julianday(COALESCE(ti.issue_date, ?))) ASC
         LIMIT 5`
      ).bind(
        p.client_id,
        ...amountParams,
        p.payment_date,
        MATCH_DATE_WINDOW_DAYS,
        ...efT.params,
        p.payment_date,
        p.payment_date
      ).all<TaxInvoiceRow>()

      if ((cands as TaxInvoiceRow[]).length > 0) {
        suggestions.push({
          payment: {
            id: p.id, client_id: p.client_id, client_name: p.client_name,
            payment_date: p.payment_date, amount: p.amount,
            payment_method: p.payment_method, reference_number: p.reference_number
          },
          candidates: cands
        })
      }
    }

    return c.json({
      success: true,
      data: suggestions,
      criteria: { amount_tolerance: MATCH_AMOUNT_TOLERANCE, date_window_days: MATCH_DATE_WINDOW_DAYS }
    })
  } catch (error) {
    console.error('src/routes/taxInvoices/paymentMatch.ts suggestions error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /payments/:pid/tax-invoice — 입금에 세금계산서 연결/해제 (수동 확정)
//   body: { tax_invoice_id: number | null }  (null = 해제)
//   entity 격리 + 검증: 입금/계산서 모두 내 법인, client_id 동일성 권고(불일치 시 경고 아닌 차단).
// ─────────────────────────────────────────────────────────────────────────────
paymentMatchRouter.put('/payments/:pid/tax-invoice', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const pid = parseInt(c.req.param('pid'))
    const body = await c.req.json<{ tax_invoice_id?: number | null }>().catch(() => ({} as { tax_invoice_id?: number | null }))
    const tiId = body.tax_invoice_id == null ? null : parseInt(String(body.tax_invoice_id))

    // 입금 존재 + entity 스코프(IDOR 방지)
    const efP = entityFilter(c)
    const payment = await c.env.DB.prepare(
      `SELECT id, client_id, amount, tax_invoice_id FROM payments WHERE id = ?${efP.clause}`
    ).bind(pid, ...efP.params).first<{ id: number; client_id: number; amount: number; tax_invoice_id: number | null }>()
    if (!payment) return c.json({ success: false, error: '입금 내역을 찾을 수 없습니다.' }, 404)

    if (tiId != null) {
      // 연결: 대상 계산서가 내 법인 + 발행완료 + 동일 거래처여야 함
      const efT = entityFilter(c, 'ti')
      const inv = await c.env.DB.prepare(
        `SELECT ti.id, ti.buyer_client_id, ti.status FROM tax_invoices ti WHERE ti.id = ?${efT.clause}`
      ).bind(tiId, ...efT.params).first<{ id: number; buyer_client_id: number; status: string }>()
      if (!inv) return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
      if (!['ISSUED', 'SENT', 'NTS_SUCCESS'].includes(inv.status)) {
        return c.json({ success: false, error: '발행 완료된 세금계산서만 연결할 수 있습니다.' }, 400)
      }
      if (inv.buyer_client_id !== payment.client_id) {
        return c.json({ success: false, error: '입금 거래처와 세금계산서 거래처가 다릅니다.' }, 400)
      }
    }

    await c.env.DB.prepare(
      `UPDATE payments SET tax_invoice_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(tiId, pid).run()

    return c.json({ success: true, data: { payment_id: pid, tax_invoice_id: tiId } })
  } catch (error) {
    console.error('src/routes/taxInvoices/paymentMatch.ts put error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// entity_id INSERT 의무 대상 없음: 본 라우터는 신규 INSERT 없음(기존 payments UPDATE만). getEntityId import는 향후 확장 대비 유지.
void getEntityId

export default paymentMatchRouter
