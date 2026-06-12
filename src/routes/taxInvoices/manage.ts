/**
 * taxInvoices/manage.ts — 세금계산서 관리 라우트 (taxInvoices.ts에서 분리, 2026-06-11 대형파일 분할 5/5)
 *
 * 수정(PATCH :id) / 삭제(DELETE :id) / 상태새로고침(:id/refresh-status) /
 * 재전송(:id/retry) / 이메일발송(:id/send-email). 발행 후 관리. 배럴에서 마운트.
 * ⚠️ 이동만, 로직 수정 0.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { sendEmail } from '../../services/emailProvider'
import { entityFilter } from '../../utils/entityFilter'
import { getTaxProvider } from './helpers'

const taxInvoicesManageRouter = new Hono<HonoEnv>()
taxInvoicesManageRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// PATCH /:id — Update draft
taxInvoicesManageRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const body = await c.req.json<{
      issue_date?: string
      notes?: string
      buyer_email?: string
      items?: Array<{
        item_date?: string
        item_name: string
        specification?: string
        quantity: number
        unit_price: number
        supply_amount: number
        tax_amount: number
        notes?: string
        sort_order?: number
      }>
    }>()

    const ef = entityFilter(c)
    const existing = await c.env.DB.prepare(
      `SELECT id, status FROM tax_invoices WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; status: string }>()

    if (!existing) {
      return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
    }
    if (existing.status !== 'DRAFT') {
      return c.json({ success: false, error: '임시저장 상태의 세금계산서만 수정할 수 있습니다.' }, 400)
    }

    const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP']
    const params: unknown[] = []

    if (body.issue_date !== undefined) { setClauses.push('issue_date = ?'); params.push(body.issue_date) }
    if (body.notes !== undefined) { setClauses.push('notes = ?'); params.push(body.notes) }
    if (body.buyer_email !== undefined) { setClauses.push('buyer_email = ?'); params.push(body.buyer_email) }

    if (setClauses.length > 1) {
      params.push(id)
      await c.env.DB.prepare(
        `UPDATE tax_invoices SET ${setClauses.join(', ')} WHERE id = ?`
      ).bind(...params).run()
    }

    if (body.items) {
      // D1 batch: DELETE + INSERT를 원자적으로 처리 (부분 실패 시 전체 롤백)
      const batchStmts = [
        c.env.DB.prepare('DELETE FROM tax_invoice_items WHERE tax_invoice_id = ?').bind(id)
      ]
      for (let i = 0; i < body.items.length; i++) {
        const it = body.items[i]
        batchStmts.push(
          c.env.DB.prepare(`
            INSERT INTO tax_invoice_items (
              tax_invoice_id, item_date, item_name, specification,
              quantity, unit_price, supply_amount, tax_amount, notes, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            id,
            it.item_date || null,
            it.item_name,
            it.specification || null,
            it.quantity,
            parseFloat(String(it.unit_price)) || 0,
            parseFloat(String(it.supply_amount)) || 0,
            parseFloat(String(it.tax_amount)) || 0,
            it.notes || null,
            it.sort_order ?? i
          )
        )
      }
      await c.env.DB.batch(batchStmts)

      // Recalculate header totals from items
      const totals = await c.env.DB.prepare(
        'SELECT SUM(supply_amount) as supply, SUM(tax_amount) as tax FROM tax_invoice_items WHERE tax_invoice_id = ?'
      ).bind(id).first<{ supply: number | null; tax: number | null }>()

      const supply = parseFloat(String(totals?.supply)) || 0
      const tax = parseFloat(String(totals?.tax)) || 0
      await c.env.DB.prepare(
        'UPDATE tax_invoices SET supply_amount = ?, tax_amount = ?, total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(supply, tax, supply + tax, id).run()
    }

    const updated = await c.env.DB.prepare(`
      SELECT ti.*, o.order_number FROM tax_invoices ti
      LEFT JOIN orders o ON ti.order_id = o.id
      WHERE ti.id = ?
    `).bind(id).first()

    const { results: items } = await c.env.DB.prepare(
      'SELECT id, tax_invoice_id, item_date, item_name, specification, quantity, unit_price, supply_amount, tax_amount, notes, sort_order FROM tax_invoice_items WHERE tax_invoice_id = ? ORDER BY sort_order'
    ).bind(id).all()

    return c.json({ success: true, data: { ...updated, items } })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /:id — Delete draft
taxInvoicesManageRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))

    const ef = entityFilter(c)
    const existing = await c.env.DB.prepare(
      `SELECT id, status FROM tax_invoices WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; status: string }>()

    if (!existing) {
      return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
    }
    if (existing.status !== 'DRAFT') {
      return c.json({ success: false, error: '임시저장 상태의 세금계산서만 삭제할 수 있습니다.' }, 400)
    }

    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM tax_invoice_items WHERE tax_invoice_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM tax_invoice_orders WHERE tax_invoice_id = ?').bind(id),
      // #386: split billing — DRAFT 삭제 시 청구그룹 링크 정리 (cancel 경로와 대칭, dangling 참조 방지)
      c.env.DB.prepare('UPDATE order_billing_groups SET tax_invoice_id = NULL WHERE tax_invoice_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM tax_invoices WHERE id = ?').bind(id),
    ])

    return c.json({ success: true, data: { id } })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// 상태 새로고침 (GetInfo) — 바로빌에서 최신 상태 조회
// ────────────────────────────────────────────────────────────────────────────
taxInvoicesManageRouter.post('/:id/refresh-status', async (c) => {
  const db = c.env.DB
  const env = c.env
  const id = parseInt(c.req.param('id'))

  try {
    const ef = entityFilter(c)
    const invoice = await db.prepare(
      `SELECT id, invoice_number, status, supplier_brn FROM tax_invoices WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; invoice_number: string; status: string; supplier_brn: string }>()

    if (!invoice) {
      return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
    }

    if (invoice.status === 'DRAFT' || invoice.status === 'CANCELLED') {
      return c.json({ success: false, error: '전송 전 상태에서는 조회할 수 없습니다.' })
    }

    const provider = await getTaxProvider(db, env, invoice.supplier_brn.replace(/-/g, ''))
    if (!provider) {
      return c.json({ success: false, error: 'Provider 설정이 없습니다.' })
    }

    const statusResult = await provider.getStatus(invoice.invoice_number)

    // stateCode → 시스템 상태 매핑
    // 2: 승인대기, 3: 발행완료, 4: 발행거부, 100: 국세청 전송중,
    // 110: 국세청 전송성공, 111: 국세청 전송실패
    let newStatus = invoice.status
    let ntsResultCode = null as string | null
    let ntsResultMessage = null as string | null
    const stateCode = statusResult.stateCode || 0

    if (stateCode >= 110) {
      // 국세청 전송 결과
      newStatus = stateCode === 110 ? 'NTS_SUCCESS' : 'NTS_FAILED'
      ntsResultCode = String(stateCode)
      ntsResultMessage = stateCode === 110 ? '국세청 전송 성공' : '국세청 전송 실패'
    } else if (stateCode === 100) {
      newStatus = 'SENT' // 전송중 유지
    } else if (stateCode === 3) {
      newStatus = 'SENT'
    } else if (stateCode === 4) {
      newStatus = 'FAILED'
      ntsResultMessage = '발행 거부됨'
    }

    // 국세청 승인번호 업데이트 (있으면)
    const ntsApproval = statusResult.ntsApproval || null

    await db.prepare(`
      UPDATE tax_invoices
      SET status = ?,
          nts_result_code = COALESCE(?, nts_result_code),
          nts_result_message = COALESCE(?, nts_result_message),
          nts_approval_number = COALESCE(?, nts_approval_number),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(newStatus, ntsResultCode, ntsResultMessage, ntsApproval, id).run()

    // 업데이트된 데이터 반환
    const updated = await db.prepare(
      `SELECT id, invoice_number, order_id, invoice_type, modify_code, original_invoice_id,
              supplier_brn, supplier_name, supplier_representative, supplier_address,
              supplier_business_type, supplier_business_item,
              buyer_client_id, buyer_brn, buyer_name, buyer_representative,
              buyer_address, buyer_business_type, buyer_business_item, buyer_email,
              supply_amount, tax_amount, total_amount, status,
              nts_approval_number, nts_sent_at, nts_result_code, nts_result_message,
              provider_name, provider_invoice_id, provider_response,
              issue_date, notes, issued_by, cancelled_at, cancelled_by, cancel_reason,
              created_at, updated_at, entity_id
       FROM tax_invoices WHERE id = ?`
    ).bind(id).first()

    return c.json({
      success: true,
      data: updated,
      provider: { stateCode, stateDT: statusResult.stateDT, ntsApproval }
    })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// FAILED → DRAFT 재시도
// ────────────────────────────────────────────────────────────────────────────
taxInvoicesManageRouter.post('/:id/retry', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))

  try {
    const ef = entityFilter(c)
    const invoice = await db.prepare(
      `SELECT id, status, invoice_number FROM tax_invoices WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; status: string; invoice_number: string }>()

    if (!invoice) {
      return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
    }

    if (invoice.status !== 'FAILED') {
      return c.json({ success: false, error: '전송실패(FAILED) 상태의 세금계산서만 재시도할 수 있습니다.' })
    }

    // FAILED → DRAFT로 리셋, provider 관련 필드 초기화
    await db.prepare(`
      UPDATE tax_invoices
      SET status = 'DRAFT',
          provider_name = NULL,
          provider_response = NULL,
          provider_invoice_id = NULL,
          nts_result_code = NULL,
          nts_result_message = NULL,
          nts_sent_at = NULL,
          nts_approval_number = NULL,
          issued_by = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(id).run()

    const updated = await db.prepare(
      `SELECT id, invoice_number, order_id, invoice_type, modify_code, original_invoice_id,
              supplier_brn, supplier_name, supplier_representative, supplier_address,
              supplier_business_type, supplier_business_item,
              buyer_client_id, buyer_brn, buyer_name, buyer_representative,
              buyer_address, buyer_business_type, buyer_business_item, buyer_email,
              supply_amount, tax_amount, total_amount, status,
              nts_approval_number, nts_sent_at, nts_result_code, nts_result_message,
              provider_name, provider_invoice_id, provider_response,
              issue_date, notes, issued_by, cancelled_at, cancelled_by, cancel_reason,
              created_at, updated_at, entity_id
       FROM tax_invoices WHERE id = ?`
    ).bind(id).first()

    return c.json({ success: true, data: updated })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /:id/send-email — 이메일 재전송
taxInvoicesManageRouter.post('/:id/send-email', async (c) => {
  const db = c.env.DB
  const env = c.env
  const id = parseInt(c.req.param('id'))
  const body: { email?: string } = await c.req.json<{ email?: string }>().catch(() => ({}))

  try {
    const ef = entityFilter(c)
    const invoice = await db.prepare(
      `SELECT id, invoice_number, status, supplier_brn, buyer_email FROM tax_invoices WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; invoice_number: string; status: string; supplier_brn: string; buyer_email: string | null }>()

    if (!invoice) return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
    if (!['ISSUED', 'SENT', 'NTS_SUCCESS'].includes(invoice.status)) {
      return c.json({ success: false, error: '발행 완료된 세금계산서만 이메일 전송 가능합니다.' })
    }

    const email = body.email || invoice.buyer_email
    if (!email) return c.json({ success: false, error: '이메일 주소가 없습니다.' })

    const provider = await getTaxProvider(db, env, invoice.supplier_brn.replace(/-/g, ''))
    if (!provider) return c.json({ success: false, error: 'Provider 설정이 없습니다.' })

    const result = await provider.sendEmail(invoice.invoice_number, email)
    return c.json({ success: result.success, data: result, email })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})


export default taxInvoicesManageRouter
