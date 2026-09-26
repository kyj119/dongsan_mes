/**
 * taxInvoices/manage.ts — 세금계산서 관리 라우트 (taxInvoices.ts에서 분리, 2026-06-11 대형파일 분할 5/5)
 *
 * 수정(PATCH :id) / 삭제(DELETE :id) / 상태새로고침(:id/refresh-status) /
 * 재전송(:id/retry) / 이메일발송(:id/send-email). 발행 후 관리. 배럴에서 마운트.
 * ⚠️ 이동만, 로직 수정 0.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware } from '../../middleware/auth'
import { requireAccessOrRole, requireEditOrRole } from '../../middleware/permissions'
import { sendEmail } from '../../services/emailProvider'
import { entityFilter } from '../../utils/entityFilter'
import { getTaxProvider } from './helpers'

const taxInvoicesManageRouter = new Hono<HonoEnv>()
taxInvoicesManageRouter.use('/*', authMiddleware, requireAccessOrRole('/tax-invoices', 'MANAGER'))

// 계산서에 걸린 주문(연결 경로 셋: tax_invoices.order_id · tax_invoice_orders · order_billing_groups.tax_invoice_id)과 주문유형.
//   직접발행(#310) 백업 주문(order_type='DIRECT_INVOICE')은 계산서 말고는 실체가 없어, 계산서 쪽 변경이 주문·청구그룹을 따라가야 한다.
async function linkedOrdersOfInvoice(db: D1Database, invoiceId: number): Promise<Array<{ id: number; order_type: string | null }>> {
  const { results } = await db.prepare(
    `SELECT o.id, o.order_type FROM orders o
     WHERE o.id IN (
       SELECT order_id FROM tax_invoices WHERE id = ? AND order_id IS NOT NULL
       UNION SELECT order_id FROM tax_invoice_orders WHERE tax_invoice_id = ?
       UNION SELECT order_id FROM order_billing_groups WHERE tax_invoice_id = ?
     )`
  ).bind(invoiceId, invoiceId, invoiceId).all<{ id: number; order_type: string | null }>()
  return results || []
}

// PATCH /:id — Update draft
taxInvoicesManageRouter.patch('/:id', requireEditOrRole('/tax-invoices', 'MANAGER'), async (c) => {
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

    // 금액 변경은 주문 축이 정본이다(2026-09-27) — 주문에 연결된 작성본의 품목 금액을 여기서 바꾸면 계산서와 청구그룹(미수)이 갈린다.
    //   · 일반 주문에 연결 → 합계(공급가·세액)가 바뀌는 품목 수정은 거절(품목명·규격 등 금액 무관 수정은 통과).
    //   · 직접발행 백업 주문에만 연결 → 백업 주문·청구그룹을 새 합계로 같이 맞춘다(아래 batch).
    let directBackupIds: number[] = []
    let newSupply = 0, newTax = 0
    if (body.items) {
      newSupply = body.items.reduce((sum, it) => sum + (parseFloat(String(it.supply_amount)) || 0), 0)
      newTax = body.items.reduce((sum, it) => sum + (parseFloat(String(it.tax_amount)) || 0), 0)
      const linked = await linkedOrdersOfInvoice(c.env.DB, id)
      if (linked.length > 0) {
        const cur = await c.env.DB.prepare(
          `SELECT supply_amount, tax_amount FROM tax_invoices WHERE id = ?`
        ).bind(id).first<{ supply_amount: number; tax_amount: number }>()
        const moneyChanged = Math.abs(newSupply - (Number(cur?.supply_amount) || 0)) >= 1
          || Math.abs(newTax - (Number(cur?.tax_amount) || 0)) >= 1
        const allDirect = linked.every(o => o.order_type === 'DIRECT_INVOICE')
        if (moneyChanged && !allDirect) {
          return c.json({ success: false, error: '주문에 연결된 계산서의 금액은 주문에서 수정하세요.' }, 400)
        }
        if (moneyChanged && allDirect) directBackupIds = linked.map(o => Number(o.id))
      }
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
      // 헤더 합계도 같은 batch 에서 품목 합으로 다시 쓴다(서브쿼리 — batch 는 순서대로 실행되므로 위 INSERT 를 본다)
      batchStmts.push(c.env.DB.prepare(
        `UPDATE tax_invoices SET
           supply_amount = COALESCE((SELECT SUM(supply_amount) FROM tax_invoice_items WHERE tax_invoice_id = ?), 0),
           tax_amount = COALESCE((SELECT SUM(tax_amount) FROM tax_invoice_items WHERE tax_invoice_id = ?), 0),
           total_amount = COALESCE((SELECT SUM(supply_amount) + SUM(tax_amount) FROM tax_invoice_items WHERE tax_invoice_id = ?), 0),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).bind(id, id, id, id))
      // 직접발행 백업 주문 동기화 — 헤더·라인·청구그룹(미수 파생 소스)을 계산서 새 합계로. 백업 주문은 보통 1건이다.
      for (const oid of directBackupIds) {
        const total = newSupply + newTax
        batchStmts.push(
          c.env.DB.prepare(
            `UPDATE orders SET total_amount = ?, vat_amount = ?, final_amount = ?, billed_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).bind(newSupply, newTax, total, total, oid),
          c.env.DB.prepare(
            `UPDATE order_billing_groups SET supply_amount = ?, tax_amount = ?, billed_amount = ? WHERE order_id = ?`
          ).bind(newSupply, newTax, total, oid),
          c.env.DB.prepare(`DELETE FROM order_items WHERE order_id = ?`).bind(oid),
        )
        body.items.forEach((it, i) => {
          batchStmts.push(c.env.DB.prepare(`
            INSERT INTO order_items (
              order_id, item_name, quantity, unit, unit_price, amount, vat_included, sort_order, created_at, updated_at
            ) VALUES (?, ?, ?, 'EA', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).bind(oid, it.item_name, it.quantity, parseFloat(String(it.unit_price)) || 0,
            parseFloat(String(it.supply_amount)) || 0, (parseFloat(String(it.tax_amount)) || 0) > 0 ? 1 : 0, it.sort_order ?? i))
        })
      }
      await c.env.DB.batch(batchStmts)
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
taxInvoicesManageRouter.delete('/:id', requireEditOrRole('/tax-invoices', 'MANAGER'), async (c) => {
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

    // 직접발행(#310) 백업 주문은 만들 때부터 BILLED 다(issue.ts POST /direct) — 작성본만 지우면 계산서 없는 미수가 남는다
    //   (유령 미수, 2026-09-26 리뷰). 로컬 취소 경로(issue.ts POST /:id/cancel)의 directBackup 처리와 같게 주문 취소 + 청구 해제.
    //   순서: 연결 해제(tax_invoice_id = NULL) 전에 대상을 읽는다.
    const directBackup = (await linkedOrdersOfInvoice(c.env.DB, id))
      .filter(o => o.order_type === 'DIRECT_INVOICE').map(o => Number(o.id))
    const delStmts: D1PreparedStatement[] = []
    for (const oid of directBackup) {
      delStmts.push(
        c.env.DB.prepare(
          `UPDATE order_billing_groups SET billing_status = NULL, billed_at = NULL, billed_by = NULL, accounting_date = NULL WHERE order_id = ?`
        ).bind(oid),
        c.env.DB.prepare(
          `UPDATE orders SET status = 'CANCELLED', billing_status = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND order_type = 'DIRECT_INVOICE'`
        ).bind(oid),
      )
    }
    await c.env.DB.batch([
      ...delStmts,
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
taxInvoicesManageRouter.post('/:id/refresh-status', requireEditOrRole('/tax-invoices', 'MANAGER'), async (c) => {
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
    // 음수 = 바로빌 조회 실패(인증·미존재 등). 예전엔 상태를 안 바꾼 채 success:true 로 끝나 「조회는 됐는데 그대로」로 보였다.
    if (statusResult.status === 'ERROR') {
      return c.json({ success: false, error: `바로빌 상태 조회 실패 (코드 ${statusResult.stateCode})` }, 502)
    }

    let newStatus = invoice.status
    let ntsResultCode = null as string | null
    let ntsResultMessage = null as string | null

    // ★국세청 결과는 NTSSendState 하나로만 판정한다. 코드표 = 바로빌 개발자센터 가이드 샘플(상태 동기화):
    //   1 전송전 · 2·3 전송중 · 4 전송성공 · 5 전송실패. 그 밖의 값(0 등)이면 상태를 바꾸지 않는다.
    //   BarobillState(1000 임시저장·3014 발급완료·5031 발급취소 …)는 **문서 상태**라 여기서 성공·실패로 읽지 않는다 —
    //   예전 팝빌 체계 분기(stateCode ≥110 → 전송실패)가 이 값을 받아 임시저장·발급취소를 「국세청 전송실패」로
    //   찍을 수 있었다(2026-09-26 제거, prod 발행 0건이라 피해 없음).
    const ns = statusResult.ntsSendState
    if (ns === 4) { newStatus = 'NTS_SUCCESS'; ntsResultCode = '4'; ntsResultMessage = statusResult.ntsSendResult || '국세청 전송 성공' }
    else if (ns === 5) { newStatus = 'NTS_FAILED'; ntsResultCode = '5'; ntsResultMessage = statusResult.ntsSendResult || '국세청 전송 실패' }
    else if (ns === 2 || ns === 3) { newStatus = 'SENT' }

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
      provider: { stateCode: statusResult.stateCode, barobillState: statusResult.barobillState, ntsSendState: statusResult.ntsSendState, stateDT: statusResult.stateDT, ntsApproval }
    })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// FAILED → DRAFT 재시도
// ────────────────────────────────────────────────────────────────────────────
taxInvoicesManageRouter.post('/:id/retry', requireEditOrRole('/tax-invoices', 'MANAGER'), async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))

  try {
    const ef = entityFilter(c)
    const invoice = await db.prepare(
      `SELECT id, status, invoice_number, supplier_brn FROM tax_invoices WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; status: string; invoice_number: string; supplier_brn: string | null }>()

    if (!invoice) {
      return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
    }

    // Phase 2: 전송실패(FAILED) + 국세청 전송실패(NTS_FAILED) 모두 DRAFT 재발행 허용.
    if (!['FAILED', 'NTS_FAILED'].includes(invoice.status)) {
      return c.json({ success: false, error: '전송실패(FAILED/국세청 전송실패) 상태의 세금계산서만 재시도할 수 있습니다.' })
    }

    // ★되돌리기 전에 바로빌에 **이미 등록됐는지** 본다(2026-09-26, #20). 재발행은 같은 invoice_number 를
    //   관리번호(mgtKey)로 다시 쓰므로, 응답만 유실된 FAILED(NETWORK_ERROR)는 「중복 관리번호」로 거부돼
    //   영원히 FAILED 에 갇혔다. 등록돼 있으면 FAILED → SENT 로 복구하고, NTS_FAILED 는 재발행이 아니라
    //   수정발행으로 안내한다. 조회 자체가 실패하면(설정 없음·네트워크) 종전대로 DRAFT 로 되돌린다.
    try {
      const provider = invoice.supplier_brn ? await getTaxProvider(db, c.env, invoice.supplier_brn.replace(/-/g, '')) : null
      if (provider) {
        const st = await provider.getStatus(invoice.invoice_number)
        const registered = (st.barobillState ?? 0) > 0
        if (registered && invoice.status === 'FAILED') {
          await db.prepare(
            `UPDATE tax_invoices SET status = 'SENT', nts_result_message = '재시도 전 조회: 바로빌에 이미 등록됨 — 복구', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).bind(id).run()
          return c.json({ success: true, recovered: true, message: '바로빌에 이미 등록된 계산서라 발행 상태로 복구했습니다. [상태 조회]로 국세청 결과를 확인하세요.' })
        }
        if (registered && invoice.status === 'NTS_FAILED') {
          return c.json({ success: false, error: '바로빌에 등록된 계산서라 같은 번호로 다시 발행할 수 없습니다. 수정발행으로 처리하세요.' }, 400)
        }
      }
    } catch (e) {
      console.warn('[taxInvoices/retry] 재시도 전 상태 조회 실패 — 종전대로 DRAFT 로 되돌린다:', e instanceof Error ? e.message : e)
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
taxInvoicesManageRouter.post('/:id/send-email', requireEditOrRole('/tax-invoices', 'MANAGER'), async (c) => {
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
