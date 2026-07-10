/**
 * taxInvoices/batch.ts — 세금계산서 일괄/월합산 발행 (taxInvoices.ts에서 분리, 2026-06-11 대형파일 분할 4/5)
 *
 * batch-create(거래처별 일괄) / monthly-create(월합산). 둘 다 createSplitInvoices로 법인분할.
 * 배럴(taxInvoices.ts)에서 마운트. ⚠️ 이동만, 로직 수정 0.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware } from '../../middleware/auth'
import { requireAccessOrRole, requireEditOrRole } from '../../middleware/permissions'
import { getEntityId } from '../../utils/entityFilter'
import { getCompanySettings, createSplitInvoices } from './helpers'
import { kstYmd } from '../../utils/kstDate'
import type { ClientRow, MonthlyEligibleRow } from './helpers'

const taxInvoicesBatchRouter = new Hono<HonoEnv>()
taxInvoicesBatchRouter.use('/*', authMiddleware, requireAccessOrRole('/tax-invoices', 'MANAGER'))

// POST /batch-create — 거래처별 일괄 생성 (정적 경로이므로 /:id 앞에 위치)
taxInvoicesBatchRouter.post('/batch-create', requireEditOrRole('/tax-invoices', 'MANAGER'), async (c) => {
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
    const issueDate = body.issue_date || kstYmd()
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

// ============================================================================
// POST /monthly-create - 월합산 세금계산서 일괄 생성
// ============================================================================
taxInvoicesBatchRouter.post('/monthly-create', async (c) => {
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


export default taxInvoicesBatchRouter
