import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import type { TaxInvoice, TaxInvoiceItem } from '../types/models'
import type { TaxProvider } from '../services/taxProvider'
import { authMiddleware, requireRole } from '../middleware/auth'
import { sendEmail } from '../services/emailProvider'
import { renderTemplate } from '../services/emailTemplates'
import { getEntityId, entityFilter } from '../utils/entityFilter'
import { getNextSeqNumber, getNextEntitySeqNumber } from '../utils/sequenceGenerator'
import taxInvoicesQueriesRouter from './taxInvoices/queries'
import taxInvoicesIssueRouter from './taxInvoices/issue'
import {
  getTaxProvider,
  generateInvoiceNumber,
  getCompanySettings,
  issueTaxInvoice,
  createSplitInvoices,
} from './taxInvoices/helpers'
import type {
  TaxInvoiceWithOrder,
  ClientRow,
  EligibleOrderRow,
  OrderWithClient,
  MonthlyEligibleRow,
} from './taxInvoices/helpers'

// #344: 포털 세금계산서 다운로드에서 getTaxProvider 재사용 (외부 import 경로 호환)
export { getTaxProvider }

const taxInvoicesRouter = new Hono<HonoEnv>()
taxInvoicesRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// 서브 라우터 마운트 (대형파일 분할): queries=GET 조회, issue=발행 라이프사이클. 경로 비충돌·/:id 숫자 제약이라 순서 무관.
taxInvoicesRouter.route('/', taxInvoicesQueriesRouter)
taxInvoicesRouter.route('/', taxInvoicesIssueRouter)

// POST /batch-create — 거래처별 일괄 생성 (정적 경로이므로 /:id 앞에 위치)
taxInvoicesRouter.post('/batch-create', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json<{
      groups: Array<{
        client_id: number
        order_ids: number[]
        buyer_email?: string
        buyer_client_id?: number  // 사업자 그룹: 계산서 발행 대상 거래처 (미지정 시 client_id 사용)
      }>
      issue_date?: string
      auto_issue?: boolean
    }>()

    if (!Array.isArray(body.groups) || body.groups.length === 0) {
      return c.json({ success: false, error: 'groups는 필수입니다.' }, 400)
    }

    const user = c.get('user')
    const issueDate = body.issue_date || new Date().toISOString().slice(0, 10)
    const settings = await getCompanySettings(c.env.DB, getEntityId(c))

    if (!settings.company_business_registration_number) {
      return c.json({ success: false, error: '회사 사업자등록번호가 설정되어 있지 않습니다.' }, 400)
    }

    const results: any[] = []
    let successCount = 0
    let failCount = 0

    for (const group of body.groups) {
      try {
        if (!group.order_ids || group.order_ids.length === 0) {
          results.push({ client_id: group.client_id, success: false, error: '주문 ID가 없습니다.' })
          failCount++
          continue
        }

        // 거래처 정보 조회 (주문 거래처)
        const orderClient = await c.env.DB.prepare(
          'SELECT id, client_name, business_registration_number, representative, address, business_type, business_item, email, billing_group_id FROM clients WHERE id = ?'
        ).bind(group.client_id).first<ClientRow>()

        if (!orderClient) {
          results.push({ client_id: group.client_id, success: false, error: '거래처를 찾을 수 없습니다.' })
          failCount++
          continue
        }

        // buyer: buyer_client_id가 지정되면 해당 거래처를 buyer로 사용 (사업자 그룹)
        let client = orderClient
        if (group.buyer_client_id && group.buyer_client_id !== group.client_id) {
          const buyerClient = await c.env.DB.prepare(
            'SELECT id, client_name, business_registration_number, representative, address, business_type, business_item, email, billing_group_id FROM clients WHERE id = ?'
          ).bind(group.buyer_client_id).first<ClientRow>()

          if (!buyerClient) {
            results.push({ client_id: group.client_id, success: false, error: 'buyer 거래처를 찾을 수 없습니다.' })
            failCount++
            continue
          }
          // 같은 billing_group인지 검증
          if (!orderClient.billing_group_id || orderClient.billing_group_id !== buyerClient.billing_group_id) {
            results.push({ client_id: group.client_id, success: false, error: 'buyer 거래처가 같은 사업자 그룹이 아닙니다.' })
            failCount++
            continue
          }
          client = buyerClient
        }

        if (!client.business_registration_number) {
          results.push({ client_id: group.client_id, client_name: client.client_name, success: false, error: '사업자등록번호 미등록' })
          failCount++
          continue
        }

        const orderIds = group.order_ids
        const placeholders = orderIds.map(() => '?').join(', ')
        const { results: orders } = await c.env.DB.prepare(`
          SELECT o.*, c.client_name, c.business_registration_number,
            c.representative, c.address, c.business_type, c.business_item,
            c.email as client_email, c.id as client_id
          FROM orders o
          LEFT JOIN clients c ON o.client_id = c.id
          WHERE o.id IN (${placeholders}) AND o.client_id = ?
        `).bind(...orderIds, group.client_id).all()

        if (orders.length !== orderIds.length) {
          results.push({ client_id: group.client_id, client_name: client.client_name, success: false, error: '일부 주문이 존재하지 않거나 거래처가 다릅니다.' })
          failCount++
          continue
        }

        // P4 split billing: 선택 주문을 생산법인별로 분할 → 법인당 1장 생성 (단일법인=1장).
        const created = await createSplitInvoices(c.env.DB, c.env, {
          orderIds,
          buyer: client,
          buyerEmail: group.buyer_email,
          issueDate,
          itemMode: 'detail',
          autoIssue: body.auto_issue,
          userId: user.id,
        })
        if (created.length === 0) {
          results.push({ client_id: group.client_id, client_name: client.client_name, success: false, error: '청구그룹이 없습니다 (주문 재저장 필요).' })
          failCount++
          continue
        }
        for (const inv of created) {
          const ok = inv.invoice_id > 0 && (!body.auto_issue || inv.issued)
          if (ok) {
            results.push({ client_id: group.client_id, client_name: client.client_name, entity_id: inv.entity_id, success: true, invoice_id: inv.invoice_id, invoice_number: inv.invoice_number, issued: inv.issued })
            successCount++
          } else {
            results.push({ client_id: group.client_id, client_name: client.client_name, entity_id: inv.entity_id, success: false, error: inv.error || '발행 실패', invoice_id: inv.invoice_id || undefined, invoice_number: inv.invoice_number || undefined })
            failCount++
          }
        }
      } catch (groupErr) {
        console.error('Batch issue error for client:', group.client_id, groupErr)
        const client = body.groups.find(g => g.client_id === group.client_id)
        results.push({ client_id: group.client_id, success: false, error: '처리 중 오류가 발생했습니다' })
        failCount++
      }
    }

    return c.json({
      success: true,
      results,
      summary: { total: body.groups.length, success_count: successCount, fail_count: failCount }
    }, 201)
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /:id — Update draft
taxInvoicesRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
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
taxInvoicesRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
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
      c.env.DB.prepare('DELETE FROM tax_invoices WHERE id = ?').bind(id),
    ])

    return c.json({ success: true, data: { id } })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST /monthly-create - 월합산 세금계산서 일괄 생성
// ============================================================================
taxInvoicesRouter.post('/monthly-create', async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json() as {
      year: string
      month: string
      client_ids?: number[]
      auto_issue?: boolean
    }

    if (!body.year || !body.month) {
      return c.json({ success: false, error: '연도와 월을 지정하세요.' }, 400)
    }

    const dateFrom = `${body.year}-${body.month}-01`
    const dateTo = `${body.year}-${body.month}-31`
    const issueDate = `${body.year}-${body.month}-${new Date(parseInt(body.year), parseInt(body.month), 0).getDate()}`

    // 월합산 대상 조회
    let clientFilter = ''
    const params: any[] = [dateFrom, dateTo]
    if (body.client_ids && body.client_ids.length > 0) {
      clientFilter = `AND c.id IN (${body.client_ids.map(() => '?').join(',')})`
      params.push(...body.client_ids)
    }

    const { results } = await c.env.DB.prepare(`
      SELECT c.id as client_id, c.client_name, c.business_registration_number,
             c.representative, c.address, c.business_type, c.business_item,
             c.email as buyer_email,
             o.id as order_id, o.order_number, o.total_amount, o.vat_amount
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE c.invoice_method = 'MONTHLY'
        AND o.order_date >= ? AND o.order_date <= ?
        AND o.status IN ('CONFIRMED', 'PRINTING', 'PRINT_DONE', 'SHIPPED')
        AND o.id NOT IN (
          SELECT tio.order_id FROM tax_invoice_orders tio
          JOIN tax_invoices ti ON tio.tax_invoice_id = ti.id
          WHERE ti.status != 'CANCELLED'
        )
        ${clientFilter}
      ORDER BY c.id, o.order_date
    `).bind(...params).all()

    // 거래처별 그룹핑
    type MonthlyCreateRow = MonthlyEligibleRow & { order_id: number }
    type MonthlyCreateGroup = MonthlyCreateRow & { orders: MonthlyCreateRow[]; supply: number; tax: number }
    const grouped: Record<number, MonthlyCreateGroup> = {}
    for (const row of results as MonthlyCreateRow[]) {
      if (!grouped[row.client_id]) {
        grouped[row.client_id] = { ...row, orders: [], supply: 0, tax: 0 }
      }
      grouped[row.client_id].orders.push(row)
      grouped[row.client_id].supply += parseFloat(String(row.total_amount)) || 0
      grouped[row.client_id].tax += parseFloat(String(row.vat_amount)) || 0
    }

    const created: Array<{ invoice_number: string; client_name: string; issued: boolean; entity_id?: number }> = []
    const errors: Array<{ client_name: string; error: string }> = []

    // P4 split billing: 거래처별 월합산도 생산법인별 분할 → (거래처×법인) 1장. 같은 법인끼리만 합산.
    for (const group of Object.values(grouped)) {
      try {
        const g = group as any
        const orderIds = group.orders.map((o) => o.order_id)
        const invs = await createSplitInvoices(c.env.DB, c.env, {
          orderIds,
          buyer: {
            id: group.client_id,
            business_registration_number: g.business_registration_number ?? null,
            client_name: group.client_name,
            representative: g.representative ?? null,
            address: g.address ?? null,
            business_type: g.business_type ?? null,
            business_item: g.business_item ?? null,
            email: g.buyer_email ?? null,
          },
          buyerEmail: g.buyer_email ?? null,
          issueDate,
          itemMode: 'summary',
          summaryLabel: `${body.year}년 ${body.month}월 합산`,
          autoIssue: body.auto_issue,
          userId: user?.id || 1,
        })
        if (invs.length === 0) {
          errors.push({ client_name: group.client_name, error: '청구그룹이 없습니다.' })
          continue
        }
        for (const inv of invs) {
          if (inv.invoice_id === 0) {
            errors.push({ client_name: group.client_name, error: inv.error || '생성 실패' })
          } else {
            created.push({ invoice_number: inv.invoice_number, client_name: group.client_name, issued: inv.issued, entity_id: inv.entity_id })
          }
        }
      } catch (err) {
        console.error('Bulk create tax invoice error for client:', group.client_name, err)
        errors.push({ client_name: group.client_name, error: '처리 중 오류가 발생했습니다' })
      }
    }

    return c.json({
      success: true,
      data: { created, errors },
      message: `월합산 세금계산서 ${created.length}건 생성${errors.length > 0 ? `, ${errors.length}건 오류` : ''}`
    })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// 상태 새로고침 (GetInfo) — 바로빌에서 최신 상태 조회
// ────────────────────────────────────────────────────────────────────────────
taxInvoicesRouter.post('/:id/refresh-status', async (c) => {
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
taxInvoicesRouter.post('/:id/retry', async (c) => {
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
taxInvoicesRouter.post('/:id/send-email', async (c) => {
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

export default taxInvoicesRouter
