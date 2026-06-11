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

// 서브 라우터 마운트 (대형파일 분할): queries=GET 조회. 경로가 겹치지 않아 순서 무관(/:id는 숫자 제약).
taxInvoicesRouter.route('/', taxInvoicesQueriesRouter)

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

// ============================================================================
// POST /direct — 직접 발행 (주문 없이 세금계산서 발행) — issue #310 방안 A
// ----------------------------------------------------------------------------
// 주문 없이 세금계산서를 발행하면, 매출채권(AR)이 정상 경로(주문 BILLED)로
// 흐르도록 최소 백업 주문을 order_type='DIRECT_INVOICE', billing_status='BILLED'
// 로 자동 생성하고 clients.balance를 증액한다. (단일 진실 공급원 = orders/AR)
// 취소 시 POST /:id/cancel 에서 이 백업 주문을 CANCELLED + balance 롤백한다.
// ============================================================================
taxInvoicesRouter.post('/direct', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json<{
      client_id?: number
      buyer_client_id?: number
      buyer_email?: string
      invoice_type?: string
      issue_date?: string
      notes?: string
      supply_amount?: number
      vat_amount?: number
      total_amount?: number
      items?: Array<{
        item_date?: string
        item_name: string
        specification?: string
        quantity?: number
        unit_price?: number
        amount?: number        // 공급가액
        supply_amount?: number // amount 별칭 (둘 중 하나)
        tax_amount?: number
        vat_included?: boolean
        notes?: string
        sort_order?: number
      }>
      auto_issue?: boolean
    }>()

    const buyerClientId = body.buyer_client_id || body.client_id
    if (!buyerClientId) {
      return c.json({ success: false, error: 'client_id(거래처)는 필수입니다.' }, 400)
    }

    const settings = await getCompanySettings(c.env.DB, getEntityId(c))
    if (!settings.company_business_registration_number) {
      return c.json({ success: false, error: '회사 사업자등록번호가 설정되어 있지 않습니다.' }, 400)
    }

    // 거래처(buyer) 조회
    const client = await c.env.DB.prepare(
      'SELECT id, client_name, business_registration_number, representative, address, business_type, business_item, email FROM clients WHERE id = ?'
    ).bind(buyerClientId).first<ClientRow>()
    if (!client) {
      return c.json({ success: false, error: '거래처를 찾을 수 없습니다.' }, 404)
    }
    if (!client.business_registration_number) {
      return c.json({ success: false, error: '거래처에 사업자등록번호가 등록되어 있지 않습니다.' }, 400)
    }

    const issueDate = body.issue_date || new Date().toISOString().slice(0, 10)
    const user = c.get('user')
    const entityId = getEntityId(c) || 1
    const vatRate = 0.1

    // ── 금액 산정: items 우선, 없으면 헤더 금액 사용 ──
    const items = Array.isArray(body.items) ? body.items : []
    const normItems = items.map((it, i) => {
      const supply = it.supply_amount != null
        ? parseFloat(String(it.supply_amount))
        : (it.amount != null
            ? parseFloat(String(it.amount))
            : (parseFloat(String(it.unit_price ?? 0)) || 0) * (parseFloat(String(it.quantity ?? 1)) || 0))
      const supplyAmt = Math.round(supply) || 0
      const taxAmt = it.tax_amount != null
        ? Math.round(parseFloat(String(it.tax_amount))) || 0
        : (it.vat_included === false ? 0 : Math.round(supplyAmt * vatRate))
      return {
        item_date: it.item_date || issueDate,
        item_name: it.item_name || '품목',
        specification: it.specification || null,
        quantity: parseFloat(String(it.quantity ?? 1)) || 1,
        unit_price: parseFloat(String(it.unit_price ?? 0)) || 0,
        supply_amount: supplyAmt,
        tax_amount: taxAmt,
        vat_included: it.vat_included === false ? 0 : 1,
        notes: it.notes || null,
        sort_order: it.sort_order ?? i,
      }
    })

    let supplyAmount: number
    let taxAmount: number
    if (normItems.length > 0) {
      supplyAmount = normItems.reduce((s, it) => s + it.supply_amount, 0)
      taxAmount = normItems.reduce((s, it) => s + it.tax_amount, 0)
    } else {
      supplyAmount = Math.round(parseFloat(String(body.supply_amount ?? 0))) || 0
      taxAmount = body.vat_amount != null
        ? Math.round(parseFloat(String(body.vat_amount))) || 0
        : Math.round(supplyAmount * vatRate)
    }
    let totalAmount = body.total_amount != null
      ? Math.round(parseFloat(String(body.total_amount))) || 0
      : supplyAmount + taxAmount
    // total이 합계와 어긋나면 합계로 보정 (정합성 우선)
    if (totalAmount !== supplyAmount + taxAmount) totalAmount = supplyAmount + taxAmount

    if (totalAmount <= 0) {
      return c.json({ success: false, error: '발행 금액이 0원입니다. 품목 또는 금액을 입력해주세요.' }, 400)
    }

    // ── 1) 백업 주문 INSERT (billing_status=BILLED, order_type=DIRECT_INVOICE) ──
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')
    const orderNumber = await getNextEntitySeqNumber(c.env.DB, 'orders', 'order_number', entityId, dateStr, { base: 'DI-' })

    // status='SHIPPED': 직접발행은 생산 파이프라인을 거치지 않고 이미 납품/정산된
    // 거래를 청구하는 것이므로 종결 상태가 적절. (CONFIRMED는 생산 대기로 보드/리스트
    // 에 노출됨) eligible-orders는 tax_invoice_orders 링크로 이미 제외됨.
    const orderResult = await c.env.DB.prepare(`
      INSERT INTO orders (
        order_number, client_id, status, order_type,
        order_year, order_month, order_date,
        total_amount, vat_amount, final_amount,
        billing_status, billed_at, billed_by, billed_amount,
        notes, created_by, entity_id,
        created_at, updated_at
      ) VALUES (
        ?, ?, 'SHIPPED', 'DIRECT_INVOICE',
        ?, ?, ?,
        ?, ?, ?,
        'BILLED', CURRENT_TIMESTAMP, ?, ?,
        ?, ?, ?,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).bind(
      orderNumber, buyerClientId,
      today.getFullYear(), today.getMonth() + 1, issueDate,
      supplyAmount, taxAmount, totalAmount,
      user?.id || null, totalAmount,
      body.notes || '직접발행 세금계산서', user?.id || 1, entityId
    ).run()

    const orderId = orderResult.meta.last_row_id as number
    const invoiceNumber = await generateInvoiceNumber(c.env.DB, entityId)
    const invoiceType = body.invoice_type || 'NORMAL'

    // ── 2) 원자적 batch: balance 증액 + tax_invoice INSERT (AR 핵심 불변식) ──
    // 잔액 증액(b)과 세금계산서/백업주문(BILLED) 연결을 한 트랜잭션으로 묶어
    // 부분 실패 시 전체 롤백. (백업 주문 INSERT는 위에서 BILLED로 이미 생성됨 —
    // 이 batch가 실패하면 아래 catch에서 보상 처리로 주문/잔액을 정리)
    let taxInvoiceId: number
    try {
      const batchRes = await c.env.DB.batch([
        // (b) split billing P3: 백업 주문의 청구그룹 생성(BILLED) — balance 캐시 대체, (거래처×법인) 미수금 파생 소스
        c.env.DB.prepare(`
          INSERT INTO order_billing_groups (order_id, entity_id, billing_status, supply_amount, tax_amount, billed_amount, billed_at, billed_by)
          VALUES (?, ?, 'BILLED', ?, ?, ?, CURRENT_TIMESTAMP, ?)
        `).bind(orderId, entityId, supplyAmount, taxAmount, totalAmount, user?.id || null),
        // (c) 세금계산서 INSERT (백업 주문에 연결)
        c.env.DB.prepare(`
          INSERT INTO tax_invoices (
            invoice_number, order_id, invoice_type,
            supplier_brn, supplier_name, supplier_representative,
            supplier_address, supplier_business_type, supplier_business_item,
            buyer_client_id, buyer_brn, buyer_name, buyer_representative,
            buyer_address, buyer_business_type, buyer_business_item, buyer_email,
            supply_amount, tax_amount, total_amount,
            status, issue_date, notes,
            entity_id,
            created_at, updated_at
          ) VALUES (
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?,
            'DRAFT', ?, ?,
            ?,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
        `).bind(
          invoiceNumber, orderId, invoiceType,
          settings.company_business_registration_number,
          settings.company_name || '',
          settings.company_representative || null,
          settings.company_address || null,
          settings.company_business_type || null,
          settings.company_business_item || null,
          buyerClientId,
          client.business_registration_number,
          client.client_name,
          client.representative || null,
          client.address || null,
          client.business_type || null,
          client.business_item || null,
          body.buyer_email || client.email || null,
          supplyAmount, taxAmount, totalAmount,
          issueDate,
          body.notes || null,
          entityId
        ),
      ])
      taxInvoiceId = batchRes[1].meta.last_row_id as number
    } catch (batchErr) {
      // 보상: 위에서 생성한 백업 주문 제거 (잔액은 이 batch가 atomic이라 미반영)
      await c.env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(orderId).run().catch(() => {})
      throw batchErr
    }

    // ── 3) junction + order_items + tax_invoice_items (원자적 batch) ──
    // 기존 create 핸들러와 동일 패턴: 헤더(주문/계산서) 확정 후 자식 행 일괄 INSERT
    const childStmts: any[] = [
      c.env.DB.prepare(
        'INSERT OR IGNORE INTO tax_invoice_orders (tax_invoice_id, order_id) VALUES (?, ?)'
      ).bind(taxInvoiceId, orderId)
    ]
    for (const it of normItems) {
      // (d-1) order_items — 원장/AR 상세에 라인 품목 표시
      childStmts.push(
        c.env.DB.prepare(`
          INSERT INTO order_items (
            order_id, item_name, quantity, unit, unit_price, amount, vat_included, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, 'EA', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).bind(orderId, it.item_name, it.quantity, it.unit_price, it.supply_amount, it.vat_included, it.sort_order)
      )
      // (d-2) tax_invoice_items — 계산서 상세
      childStmts.push(
        c.env.DB.prepare(`
          INSERT INTO tax_invoice_items (
            tax_invoice_id, item_date, item_name, specification,
            quantity, unit_price, supply_amount, tax_amount, notes, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          taxInvoiceId, it.item_date, it.item_name, it.specification,
          it.quantity, it.unit_price, it.supply_amount, it.tax_amount, it.notes, it.sort_order
        )
      )
    }
    await c.env.DB.batch(childStmts)

    // P4: 백업주문 청구그룹(이미 BILLED)을 이 계산서에 연결
    await c.env.DB.prepare(
      `UPDATE order_billing_groups SET tax_invoice_id = ? WHERE order_id = ? AND tax_invoice_id IS NULL`
    ).bind(taxInvoiceId, orderId).run()

    // auto_issue 처리 (옵션)
    if (body.auto_issue) {
      const issueRes = await issueTaxInvoice(c.env.DB, taxInvoiceId, user.id, c.env, entityId)
      if (!issueRes.success) {
        return c.json({ success: false, error: issueRes.error, data: { invoice_id: taxInvoiceId, invoice_number: invoiceNumber, order_id: orderId, order_number: orderNumber, ...(issueRes.data || {}) } }, 400)
      }
      return c.json({ success: true, data: { ...issueRes.data, order_id: orderId, order_number: orderNumber, direct_issue: true, auto_issued: true } }, 201)
    }

    const detail = await c.env.DB.prepare(`
      SELECT ti.*, o.order_number FROM tax_invoices ti
      LEFT JOIN orders o ON ti.order_id = o.id
      WHERE ti.id = ?
    `).bind(taxInvoiceId).first()
    const { results: createdItems } = await c.env.DB.prepare(
      'SELECT id, tax_invoice_id, item_date, item_name, specification, quantity, unit_price, supply_amount, tax_amount, notes, sort_order FROM tax_invoice_items WHERE tax_invoice_id = ? ORDER BY sort_order'
    ).bind(taxInvoiceId).all()

    return c.json({ success: true, data: { ...detail, items: createdItems, order_id: orderId, order_number: orderNumber, direct_issue: true } }, 201)
  } catch (error) {
    console.error('src/routes/taxInvoices.ts [direct] error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST / — Create draft from order (단건 또는 묶음 발행, auto_issue 옵션 지원)
taxInvoicesRouter.post('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json<{
      order_id?: number
      order_ids?: number[]
      client_id?: number
      issue_date?: string
      notes?: string
      buyer_email?: string
      auto_issue?: boolean
    }>()

    const isBulk = Array.isArray(body.order_ids) && body.order_ids.length > 0

    if (!isBulk && !body.order_id) {
      return c.json({ success: false, error: 'order_id 또는 order_ids는 필수입니다.' }, 400)
    }

    const settings = await getCompanySettings(c.env.DB, getEntityId(c))

    if (!settings.company_business_registration_number) {
      return c.json({ success: false, error: '회사 사업자등록번호가 설정되어 있지 않습니다.' }, 400)
    }

    // P4: 채번은 createSplitInvoices가 법인별로 수행 (generateInvoiceNumber(entityId)).
    const issueDate = body.issue_date || new Date().toISOString().slice(0, 10)
    const user = c.get('user')

    // ──────────────────────────────────────────────
    // 묶음 발행 로직 (생산법인별 분할 → 법인당 1장)
    // ──────────────────────────────────────────────
    if (isBulk) {
      const orderIds = body.order_ids!

      // 주문 목록 조회
      const placeholders = orderIds.map(() => '?').join(', ')
      const { results: orders } = await c.env.DB.prepare(`
        SELECT o.*, c.client_name, c.business_registration_number,
          c.representative, c.address, c.business_type, c.business_item,
          c.email as client_email, c.id as client_id,
          (SELECT CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END FROM order_items WHERE order_id = o.id AND price_status = 'PENDING') as has_pending_prices
        FROM orders o
        LEFT JOIN clients c ON o.client_id = c.id
        WHERE o.id IN (${placeholders})
      `).bind(...orderIds).all()

      if (orders.length === 0) {
        return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)
      }
      if (orders.length !== orderIds.length) {
        return c.json({ success: false, error: '일부 주문이 존재하지 않습니다.' }, 400)
      }

      // 단가 미정 주문 검증
      const pendingOrders = orders.filter((o: any) => o.has_pending_prices === 1)
      if (pendingOrders.length > 0) {
        return c.json({ success: false, error: '단가 미정 품목이 있는 주문이 포함되어 있습니다. 먼저 단가를 확정해주세요.' }, 400)
      }

      // 모든 주문이 같은 거래처인지 검증
      const clientIds = [...new Set(orders.map(o => o.client_id))]
      if (clientIds.length > 1) {
        return c.json({ success: false, error: '묶음 발행은 동일 거래처 주문만 가능합니다.' }, 400)
      }

      const firstOrder = orders[0]
      if (!firstOrder.business_registration_number) {
        return c.json({ success: false, error: '거래처에 사업자등록번호가 등록되어 있지 않습니다.' }, 400)
      }

      const fo = firstOrder as any
      const created = await createSplitInvoices(c.env.DB, c.env, {
        orderIds,
        buyer: {
          id: Number(fo.client_id),
          business_registration_number: fo.business_registration_number,
          client_name: String(fo.client_name || ''),
          representative: fo.representative ?? null,
          address: fo.address ?? null,
          business_type: fo.business_type ?? null,
          business_item: fo.business_item ?? null,
          email: fo.client_email ?? null,
        },
        buyerEmail: body.buyer_email,
        issueDate,
        notes: body.notes,
        itemMode: 'detail',
        autoIssue: body.auto_issue,
        userId: user.id,
      })
      if (created.length === 0) {
        return c.json({ success: false, error: '청구그룹이 없습니다. 주문을 다시 저장해주세요.' }, 400)
      }
      const failed = created.filter(x => x.invoice_id === 0 || (body.auto_issue && !x.issued))
      if (failed.length === created.length) {
        return c.json({ success: false, error: failed[0]?.error || '발행 실패', data: { invoices: created } }, 400)
      }
      return c.json({ success: true, data: { invoices: created, split_count: created.length, auto_issued: !!body.auto_issue } }, 201)
    }

    // ──────────────────────────────────────────────
    // 단건 발행 로직 (하위호환)
    // ──────────────────────────────────────────────
    const order = await c.env.DB.prepare(`
      SELECT o.*, c.client_name, c.business_registration_number,
        c.representative, c.address, c.business_type, c.business_item,
        c.email as client_email, c.id as client_id
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.id = ?
    `).bind(body.order_id).first<OrderWithClient>()

    if (!order) {
      return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)
    }
    if (!order.business_registration_number) {
      return c.json({ success: false, error: '거래처에 사업자등록번호가 등록되어 있지 않습니다.' }, 400)
    }

    // P4 split billing: 단건도 혼합주문이면 생산법인별 분할 → N장 (단일법인=1장, 기존 동일).
    const created = await createSplitInvoices(c.env.DB, c.env, {
      orderIds: [body.order_id!],
      buyer: {
        id: Number(order.client_id),
        business_registration_number: order.business_registration_number,
        client_name: order.client_name,
        representative: order.representative ?? null,
        address: order.address ?? null,
        business_type: order.business_type ?? null,
        business_item: order.business_item ?? null,
        email: (order as any).client_email ?? null,
      },
      buyerEmail: body.buyer_email,
      issueDate,
      notes: body.notes,
      itemMode: 'detail',
      autoIssue: body.auto_issue,
      userId: user.id,
    })
    if (created.length === 0) {
      return c.json({ success: false, error: '청구그룹이 없습니다. 주문을 다시 저장해주세요.' }, 400)
    }
    const failedS = created.filter(x => x.invoice_id === 0 || (body.auto_issue && !x.issued))
    if (failedS.length === created.length) {
      return c.json({ success: false, error: failedS[0]?.error || '발행 실패', data: { invoices: created } }, 400)
    }
    return c.json({ success: true, data: { invoices: created, split_count: created.length, auto_issued: !!body.auto_issue } }, 201)
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

// POST /:id/issue — Issue tax invoice (DRAFT -> ISSUED/SENT)
taxInvoicesRouter.post('/:id/issue', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const user = c.get('user')

    const result = await issueTaxInvoice(c.env.DB, id, user.id, c.env, getEntityId(c))
    if (!result.success) {
      return c.json({ success: false, error: result.error, data: result.data }, result.data?.providerError ? 400 : 400)
    }
    return c.json({ success: true, data: result.data })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /:id/modify — 수정발행 (ISSUED/SENT 상태의 계산서에 대해 수정본 DRAFT 생성)
taxInvoicesRouter.post('/:id/modify', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const body = await c.req.json<{
      modify_code: string
      issue_date?: string
      items?: Array<{
        item_name: string
        specification?: string
        quantity: number
        unit_price: number
        supply_amount: number
        tax_amount: number
      }>
      notes?: string
      buyer_email?: string
    }>()

    if (!body.modify_code) {
      return c.json({ success: false, error: 'modify_code는 필수입니다.' }, 400)
    }
    const validCodes = ['1', '2', '3', '4', '5', '6']
    if (!validCodes.includes(body.modify_code)) {
      return c.json({ success: false, error: `modify_code는 ${validCodes.join(', ')} 중 하나여야 합니다.` }, 400)
    }

    // 원본 계산서 조회 (ISSUED 또는 SENT 상태만)
    const ef = entityFilter(c, 'ti')
    const original = await c.env.DB.prepare(`
      SELECT ti.*, o.order_number FROM tax_invoices ti
      LEFT JOIN orders o ON ti.order_id = o.id
      WHERE ti.id = ?${ef.clause}
    `).bind(id, ...ef.params).first<TaxInvoiceWithOrder>()

    if (!original) {
      return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
    }
    if (!['ISSUED', 'SENT', 'NTS_SUCCESS'].includes(original.status)) {
      return c.json({ success: false, error: '발행 또는 전송 완료 상태의 세금계산서만 수정발행할 수 있습니다.' }, 400)
    }

    // 원본 품목 조회
    const { results: originalItems } = await c.env.DB.prepare(
      'SELECT id, tax_invoice_id, item_date, item_name, specification, quantity, unit_price, supply_amount, tax_amount, notes, sort_order FROM tax_invoice_items WHERE tax_invoice_id = ? ORDER BY sort_order'
    ).bind(id).all()

    const invoiceNumber = await generateInvoiceNumber(c.env.DB, getEntityId(c))
    const issueDate = body.issue_date || new Date().toISOString().slice(0, 10)

    // 새 수정발행 계산서 생성 (원본 정보 복사)
    const insertResult = await c.env.DB.prepare(`
      INSERT INTO tax_invoices (
        invoice_number, order_id, invoice_type, modify_code, original_invoice_id,
        supplier_brn, supplier_name, supplier_representative,
        supplier_address, supplier_business_type, supplier_business_item,
        buyer_client_id, buyer_brn, buyer_name, buyer_representative,
        buyer_address, buyer_business_type, buyer_business_item, buyer_email,
        supply_amount, tax_amount, total_amount,
        status, issue_date, notes, entity_id,
        created_at, updated_at
      ) VALUES (
        ?, ?, 'MODIFY', ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        'DRAFT', ?, ?, ?,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).bind(
      invoiceNumber,
      original.order_id,
      body.modify_code,
      id,
      original.supplier_brn,
      original.supplier_name,
      original.supplier_representative || null,
      original.supplier_address || null,
      original.supplier_business_type || null,
      original.supplier_business_item || null,
      original.buyer_client_id,
      original.buyer_brn,
      original.buyer_name,
      original.buyer_representative || null,
      original.buyer_address || null,
      original.buyer_business_type || null,
      original.buyer_business_item || null,
      body.buyer_email || original.buyer_email || null,
      original.supply_amount,
      original.tax_amount,
      original.total_amount,
      issueDate,
      body.notes !== undefined ? body.notes : (original.notes || null),
      original.entity_id || 1
    ).run()

    const newInvoiceId = insertResult.meta.last_row_id

    // 원본의 junction 테이블 연결 복사
    const { results: origOrders } = await c.env.DB.prepare(
      'SELECT order_id FROM tax_invoice_orders WHERE tax_invoice_id = ?'
    ).bind(id).all()

    // N+1 제거: junction INSERT를 db.batch로 일괄 처리 (청크 80)
    const junctionStmts = (origOrders as Array<{ order_id: number }>).map((row) =>
      c.env.DB.prepare(
        'INSERT OR IGNORE INTO tax_invoice_orders (tax_invoice_id, order_id) VALUES (?, ?)'
      ).bind(newInvoiceId, row.order_id)
    )
    for (let i = 0; i < junctionStmts.length; i += 80) {
      await c.env.DB.batch(junctionStmts.slice(i, i + 80))
    }

    // 품목: body.items가 있으면 수정된 품목, 없으면 원본 복사
    const itemsToInsert = body.items
      ? body.items.map((it, i) => ({
          item_date: issueDate,
          item_name: it.item_name,
          specification: it.specification || null,
          quantity: it.quantity,
          unit_price: parseFloat(String(it.unit_price)) || 0,
          supply_amount: parseFloat(String(it.supply_amount)) || 0,
          tax_amount: parseFloat(String(it.tax_amount)) || 0,
          notes: null,
          sort_order: i
        }))
      : (originalItems as unknown as TaxInvoiceItem[]).map((it, i) => ({
          item_date: it.item_date || issueDate,
          item_name: it.item_name,
          specification: it.specification || null,
          quantity: it.quantity,
          unit_price: Number(it.unit_price) || 0,
          supply_amount: Number(it.supply_amount) || 0,
          tax_amount: Number(it.tax_amount) || 0,
          notes: it.notes || null,
          sort_order: i
        }))

    // N+1 제거: tax_invoice_items INSERT를 db.batch로 일괄 처리 (청크 80)
    const modifyItemStmts = itemsToInsert.map((it) =>
      c.env.DB.prepare(`
        INSERT INTO tax_invoice_items (
          tax_invoice_id, item_date, item_name, specification,
          quantity, unit_price, supply_amount, tax_amount, notes, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        newInvoiceId, it.item_date, it.item_name, it.specification,
        it.quantity, it.unit_price, it.supply_amount, it.tax_amount,
        it.notes, it.sort_order
      )
    )
    for (let i = 0; i < modifyItemStmts.length; i += 80) {
      await c.env.DB.batch(modifyItemStmts.slice(i, i + 80))
    }

    // body.items가 있으면 합산 금액 재계산하여 헤더 갱신
    if (body.items) {
      const supplyTotal = itemsToInsert.reduce((s, it) => s + it.supply_amount, 0)
      const taxTotal = itemsToInsert.reduce((s, it) => s + it.tax_amount, 0)
      await c.env.DB.prepare(
        'UPDATE tax_invoices SET supply_amount = ?, tax_amount = ?, total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(supplyTotal, taxTotal, supplyTotal + taxTotal, newInvoiceId).run()
    }

    const created = await c.env.DB.prepare(`
      SELECT ti.*, o.order_number FROM tax_invoices ti
      LEFT JOIN orders o ON ti.order_id = o.id
      WHERE ti.id = ?
    `).bind(newInvoiceId).first()

    const { results: createdItems } = await c.env.DB.prepare(
      'SELECT id, tax_invoice_id, item_date, item_name, specification, quantity, unit_price, supply_amount, tax_amount, notes, sort_order FROM tax_invoice_items WHERE tax_invoice_id = ? ORDER BY sort_order'
    ).bind(newInvoiceId).all()

    return c.json({ success: true, data: { ...created, items: createdItems } }, 201)
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /:id/cancel — Cancel issued/sent invoice (ADMIN only)
taxInvoicesRouter.post('/:id/cancel', requireRole('ADMIN'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const user = c.get('user')
    const { cancel_reason } = await c.req.json<{ cancel_reason?: string }>()

    const ef = entityFilter(c)
    const existing = await c.env.DB.prepare(
      `SELECT id, status FROM tax_invoices WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; status: string }>()

    if (!existing) {
      return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
    }
    if (!['ISSUED', 'SENT', 'NTS_SUCCESS'].includes(existing.status)) {
      return c.json({ success: false, error: '발행 또는 전송 완료 상태의 세금계산서만 취소할 수 있습니다.' }, 400)
    }

    await c.env.DB.prepare(`
      UPDATE tax_invoices
      SET status = 'CANCELLED',
          cancelled_at = CURRENT_TIMESTAMP,
          cancelled_by = ?,
          cancel_reason = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(user.id, cancel_reason || null, id).run()

    // P4 split billing: 이 계산서가 청구한 청구그룹만 초기화 (group.tax_invoice_id = id).
    // 타 법인 그룹·계산서는 불변 → "다른 유효 계산서" 체크는 그룹 스코프로 자연 처리.
    try {
      // 정상 경로: 발행 시 연결된 그룹. 레거시 미연결 폴백: 연결주문 × 이 계산서 법인 그룹.
      let groups = (await c.env.DB.prepare(
        `SELECT g.id as group_id, g.order_id, o.order_type
         FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
         WHERE g.tax_invoice_id = ?`
      ).bind(id).all<{ group_id: number; order_id: number; order_type: string | null }>()).results

      if (groups.length === 0) {
        const inv = await c.env.DB.prepare(`SELECT entity_id FROM tax_invoices WHERE id = ?`).bind(id).first<{ entity_id: number }>()
        const { results: linkedOrders } = await c.env.DB.prepare(
          `SELECT DISTINCT tio.order_id FROM tax_invoice_orders tio WHERE tio.tax_invoice_id = ?
           UNION SELECT order_id FROM tax_invoices WHERE id = ? AND order_id IS NOT NULL`
        ).bind(id, id).all<{ order_id: number }>()
        const oids = linkedOrders.map(r => r.order_id).filter(Boolean)
        if (oids.length > 0 && inv?.entity_id) {
          const ph = oids.map(() => '?').join(',')
          groups = (await c.env.DB.prepare(
            `SELECT g.id as group_id, g.order_id, o.order_type FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
             WHERE g.order_id IN (${ph}) AND g.entity_id = ?`
          ).bind(...oids, inv.entity_id).all<{ group_id: number; order_id: number; order_type: string | null }>()).results
        }
      }

      if (groups.length > 0) {
        const groupIds = groups.map(g => g.group_id)
        const affectedOrders = [...new Set(groups.map(g => g.order_id))]
        const directBackup = [...new Set(groups.filter(g => g.order_type === 'DIRECT_INVOICE').map(g => g.order_id))]
        const gph = groupIds.map(() => '?').join(',')
        const oph = affectedOrders.map(() => '?').join(',')
        const cancelStmts: any[] = [
          // 그룹 청구 초기화 + 계산서 연결 해제
          c.env.DB.prepare(
            `UPDATE order_billing_groups SET billing_status = NULL, billed_at = NULL, billed_by = NULL, tax_invoice_id = NULL WHERE id IN (${gph})`
          ).bind(...groupIds),
          // orders 미러: 그 주문 전 그룹이 청구완료된 경우만 BILLED 유지, 아니면 NULL (부분 취소 반영)
          c.env.DB.prepare(
            `UPDATE orders SET billing_status = CASE WHEN NOT EXISTS (
                 SELECT 1 FROM order_billing_groups g WHERE g.order_id = orders.id AND COALESCE(g.billing_status,'') NOT IN ('BILLED','PAID')
               ) THEN 'BILLED' ELSE NULL END,
               updated_at = CURRENT_TIMESTAMP WHERE id IN (${oph})`
          ).bind(...affectedOrders),
        ]
        // 직접발행(#310) 백업 주문은 주문 자체 CANCELLED → 미수금 파생에서 자동 제외
        if (directBackup.length > 0) {
          const dph = directBackup.map(() => '?').join(',')
          cancelStmts.push(c.env.DB.prepare(
            `UPDATE orders SET status = 'CANCELLED', billing_status = NULL, updated_at = CURRENT_TIMESTAMP WHERE id IN (${dph})`
          ).bind(...directBackup))
        }
        await c.env.DB.batch(cancelStmts)
      }
    } catch (_err) {
      console.warn('세금계산서 취소 - 청구그룹 초기화 오류:', _err)
    }

    const updated = await c.env.DB.prepare(`
      SELECT ti.*, o.order_number, o.billing_status FROM tax_invoices ti
      LEFT JOIN orders o ON ti.order_id = o.id
      WHERE ti.id = ?
    `).bind(id).first()

    return c.json({ success: true, data: updated })
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
