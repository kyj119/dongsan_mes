import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import type { TaxInvoice, TaxInvoiceItem } from '../types/models'
import { authMiddleware, requireRole } from '../middleware/auth'
import { sendEmail } from '../services/emailProvider'
import { renderTemplate } from '../services/emailTemplates'
import { getEntityId, entityFilter } from '../utils/entityFilter'

const taxInvoicesRouter = new Hono<HonoEnv>()
taxInvoicesRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// ────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼: 관리번호 채번
// ────────────────────────────────────────────────────────────────────────────
async function generateInvoiceNumber(db: D1Database): Promise<string> {
  const year = new Date().getFullYear()
  const lastRow = await db.prepare(
    `SELECT invoice_number FROM tax_invoices WHERE invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1`
  ).bind(`TI-${year}-%`).first() as any
  let nextSeq = 1
  if (lastRow?.invoice_number) {
    const parts = (lastRow.invoice_number as string).split('-')
    nextSeq = parseInt(parts[parts.length - 1]) + 1
  }
  return `TI-${year}-${String(nextSeq).padStart(4, '0')}`
}

// ────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼: 회사 설정 조회 (entities 테이블 우선, 폴백: settings)
// ────────────────────────────────────────────────────────────────────────────
import { getEntityCompanyInfo } from '../utils/entitySettings'

async function getCompanySettings(db: D1Database, entityId?: number): Promise<Record<string, string>> {
  if (entityId && entityId > 0) {
    return getEntityCompanyInfo(db, entityId)
  }
  // 레거시 폴백
  const { results: settingRows } = await db.prepare(
    `SELECT setting_key, setting_value FROM settings
     WHERE setting_key IN (
       'company_name', 'company_business_registration_number',
       'company_representative', 'company_address',
       'company_business_type', 'company_business_item'
     )`
  ).all()
  const settings: Record<string, string> = {}
  for (const row of settingRows as any[]) {
    settings[row.setting_key] = row.setting_value || ''
  }
  return settings
}

// ────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼: issue 로직 (POST /:id/issue + auto_issue 공유)
// ────────────────────────────────────────────────────────────────────────────
async function issueTaxInvoice(
  db: D1Database,
  taxInvoiceId: number,
  userId: number,
  env: any
): Promise<{ success: boolean; error?: string; data?: any }> {
  const existing = await db.prepare(
    `SELECT ti.*, o.order_number FROM tax_invoices ti
     LEFT JOIN orders o ON ti.order_id = o.id
     WHERE ti.id = ?`
  ).bind(taxInvoiceId).first() as any

  if (!existing) {
    return { success: false, error: '세금계산서를 찾을 수 없습니다.' }
  }
  if (existing.status !== 'DRAFT') {
    return { success: false, error: '임시저장 상태의 세금계산서만 발행할 수 있습니다.' }
  }

  const { results: items } = await db.prepare(
    'SELECT * FROM tax_invoice_items WHERE tax_invoice_id = ? ORDER BY sort_order'
  ).bind(taxInvoiceId).all()

  // 팝빌 연동 확인
  const linkedIdSetting = await db.prepare(
    `SELECT setting_value FROM settings WHERE setting_key = 'tax_provider_linked_id'`
  ).first<{ setting_value: string }>()
  const secretKey = env.POPBILL_SECRET_KEY
  const linkedId = linkedIdSetting?.setting_value

  if (linkedId && secretKey) {
    const { createPopbillProvider } = await import('../services/popbillProvider')
    const testModeSetting = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_test_mode'`
    ).first<{ setting_value: string }>()
    const isTestMode = testModeSetting?.setting_value === '1'
    // 공급자 이메일 조회
    const supplierEmailSetting = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key IN ('email_from_address', 'company_email') ORDER BY setting_key`
    ).all()
    const supplierEmail = (supplierEmailSetting.results as any[])
      .map(r => r.setting_value).find(v => v) || ''

    const provider = createPopbillProvider(
      linkedId,
      secretKey,
      existing.supplier_brn.replace(/-/g, ''),
      isTestMode
    )

    const result = await provider.issue({
      supplierBRN: existing.supplier_brn.replace(/-/g, ''),
      supplierName: existing.supplier_name,
      supplierRepresentative: existing.supplier_representative || '',
      supplierAddress: existing.supplier_address || '',
      supplierBusinessType: existing.supplier_business_type || '',
      supplierBusinessItem: existing.supplier_business_item || '',
      supplierEmail,
      buyerBRN: existing.buyer_brn.replace(/-/g, ''),
      buyerName: existing.buyer_name,
      buyerRepresentative: existing.buyer_representative || '',
      buyerAddress: existing.buyer_address || '',
      buyerBusinessType: existing.buyer_business_type || '',
      buyerBusinessItem: existing.buyer_business_item || '',
      buyerEmail: existing.buyer_email || '',
      supplyAmount: existing.supply_amount,
      taxAmount: existing.tax_amount,
      totalAmount: existing.total_amount,
      mgtKey: existing.invoice_number,
      issueDate: existing.issue_date.replace(/-/g, ''),
      invoiceType: existing.invoice_type === 'MODIFY' ? 'modify' : 'normal',
      modifyCode: existing.modify_code ? parseInt(existing.modify_code) : undefined,
      items: (items as any[]).map((item, i) => ({
        serialNum: i + 1,
        itemDate: (item.item_date || existing.issue_date).replace(/-/g, ''),
        itemName: item.item_name,
        specification: item.specification || '',
        quantity: item.quantity,
        unitPrice: item.unit_price,
        supplyAmount: item.supply_amount,
        taxAmount: item.tax_amount,
        remark: item.notes || '',
      })),
      notes: existing.notes || '',
    })

    if (result.success) {
      await db.prepare(`
        UPDATE tax_invoices
        SET status = 'SENT', issued_by = ?, nts_approval_number = ?,
            nts_sent_at = CURRENT_TIMESTAMP, provider_name = 'popbill',
            provider_response = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(userId, result.ntsApprovalNumber || null, result.rawResponse || null, taxInvoiceId).run()
    } else {
      await db.prepare(`
        UPDATE tax_invoices
        SET status = 'FAILED', issued_by = ?, provider_name = 'popbill',
            nts_result_code = ?, nts_result_message = ?,
            provider_response = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(userId, result.errorCode || null, result.errorMessage || null, result.rawResponse || null, taxInvoiceId).run()

      return {
        success: false,
        error: `팝빌 발행 실패: ${result.errorMessage || 'Unknown'}`,
        data: { providerError: result }
      }
    }
  } else {
    // 팝빌 미설정 → 로컬 발행만
    await db.prepare(
      `UPDATE tax_invoices SET status = 'ISSUED', issued_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(userId, taxInvoiceId).run()
  }

  const updated = await db.prepare(`
    SELECT ti.*, o.order_number FROM tax_invoices ti
    LEFT JOIN orders o ON ti.order_id = o.id
    WHERE ti.id = ?
  `).bind(taxInvoiceId).first() as any

  // 이메일 자동 발송 (발행 성공 시 buyer_email로)
  if (updated && (updated.status === 'SENT' || updated.status === 'ISSUED') && updated.buyer_email) {
    try {
      // 연결된 주문번호들 조회
      const { results: tioRows } = await db.prepare(
        `SELECT o.order_number FROM tax_invoice_orders tio JOIN orders o ON tio.order_id = o.id WHERE tio.tax_invoice_id = ?`
      ).bind(taxInvoiceId).all()
      const orderNumbers = (tioRows as any[]).map(r => r.order_number).join(', ') || updated.order_number || ''

      const { subject, html } = renderTemplate('INVOICE_ISSUED', {
        buyerName: updated.buyer_name,
        invoiceNumber: updated.invoice_number,
        issueDate: updated.issue_date,
        supplyAmount: parseFloat(updated.supply_amount) || 0,
        taxAmount: parseFloat(updated.tax_amount) || 0,
        totalAmount: parseFloat(updated.total_amount) || 0,
        ntsApprovalNumber: updated.nts_approval_number,
        orderNumbers,
      })

      await sendEmail(env, db, { to: updated.buyer_email, subject, html }, {
        template: 'INVOICE_ISSUED',
        relatedType: 'tax_invoice',
        relatedId: taxInvoiceId,
        sentBy: userId,
      })
    } catch (_emailErr) {
      // 이메일 실패해도 발행은 성공 처리
    }
  }

  // 알림톡 자동 발송 (fire-and-forget)
  if (updated && (updated.status === 'SENT' || updated.status === 'ISSUED')) {
    try {
      const kakaoEnabled = await db.prepare(
        `SELECT setting_value FROM settings WHERE setting_key = 'kakao_enabled'`
      ).first() as any
      if (kakaoEnabled?.setting_value === '1') {
        // 거래처 mobile 번호 조회
        const buyerClient = await db.prepare(
          `SELECT id, mobile FROM clients WHERE business_registration_number = ?`
        ).bind(updated.buyer_brn?.replace(/-/g, '')).first() as any
        if (buyerClient?.mobile) {
          const kakaoSenderNum = await db.prepare(
            `SELECT setting_value FROM settings WHERE setting_key = 'kakao_sender_num'`
          ).first() as any
          if (kakaoSenderNum?.setting_value) {
            const { createKakaoProvider } = await import('../services/kakaoProvider')
            const linkedIdSetting = await db.prepare(
              `SELECT setting_value FROM settings WHERE setting_key = 'tax_provider_linked_id'`
            ).first() as any
            const testModeSetting = await db.prepare(
              `SELECT setting_value FROM settings WHERE setting_key = 'tax_test_mode'`
            ).first() as any
            const companyBrn = await db.prepare(
              `SELECT setting_value FROM settings WHERE setting_key = 'company_business_registration_number'`
            ).first() as any
            if (linkedIdSetting?.setting_value && env.POPBILL_SECRET_KEY && companyBrn?.setting_value) {
              const kakaoProvider = createKakaoProvider(
                linkedIdSetting.setting_value,
                env.POPBILL_SECRET_KEY,
                companyBrn.setting_value.replace(/-/g, ''),
                testModeSetting?.setting_value === '1'
              )
              const altSendType = await db.prepare(
                `SELECT setting_value FROM settings WHERE setting_key = 'kakao_alt_send_type'`
              ).first() as any
              // 알림톡 발송 시도 (템플릿 코드는 설정에서 관리 — 미설정 시 스킵)
              // TODO: 세금계산서 전용 템플릿 코드 설정 추가 후 활성화
              console.log(`[kakao] 세금계산서 ${updated.invoice_number} 알림톡 발송 대상: ${buyerClient.mobile}`)
              await db.prepare(`
                INSERT INTO kakao_send_logs (template_code, receiver_num, receiver_name, related_type, related_id, client_id, content, status, sent_by, created_at)
                VALUES ('TAX_INVOICE', ?, ?, 'tax_invoices', ?, ?, ?, 'PENDING', ?, datetime('now'))
              `).bind(
                buyerClient.mobile, updated.buyer_name || '',
                taxInvoiceId, buyerClient.id,
                `세금계산서 ${updated.invoice_number} 발행 안내`,
                userId
              ).run()
            }
          }
        }
      }
    } catch (_kakaoErr) {
      console.warn('알림톡 발송 오류 (세금계산서):', _kakaoErr)
    }
  }

  // 연결된 주문들의 billing_status를 BILLED로 업데이트
  try {
    const { results: linkedOrders } = await db.prepare(
      `SELECT order_id FROM tax_invoice_orders WHERE tax_invoice_id = ?`
    ).bind(taxInvoiceId).all()
    const orderIds = (linkedOrders as any[]).map(r => r.order_id).filter(Boolean)
    // 직접 연결된 order_id도 포함
    if (updated.order_id && !orderIds.includes(updated.order_id)) orderIds.push(updated.order_id)
    if (orderIds.length > 0) {
      const ph = orderIds.map(() => '?').join(',')
      await db.prepare(
        `UPDATE orders SET billing_status = 'BILLED', updated_at = CURRENT_TIMESTAMP WHERE id IN (${ph}) AND billing_status != 'BILLED'`
      ).bind(...orderIds).run()
    }
  } catch (_billingErr) {
    console.warn('billing_status 업데이트 오류:', _billingErr)
  }

  return { success: true, data: { ...updated, items } }
}

// GET /test-connection — 팝빌 연결 테스트 (잔여 포인트 조회)
taxInvoicesRouter.get('/test-connection', async (c) => {
  try {
    const db = c.env.DB
    const env = c.env

    const linkedIdSetting = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_provider_linked_id'`
    ).first<{ setting_value: string }>()
    const secretKey = env.POPBILL_SECRET_KEY
    const linkedId = linkedIdSetting?.setting_value

    if (!linkedId || !secretKey) {
      return c.json({ success: false, error: '팝빌 링크아이디 또는 비밀키가 설정되지 않았습니다.' }, 400)
    }

    const settings = await getCompanySettings(db, getEntityId(c))
    const brn = (settings.company_business_registration_number || '').replace(/-/g, '')
    if (!brn) {
      return c.json({ success: false, error: '사업자등록번호가 설정되지 않았습니다.' }, 400)
    }

    const testModeSetting = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_test_mode'`
    ).first<{ setting_value: string }>()
    const isTestMode = testModeSetting?.setting_value === '1'

    const { createPopbillProvider } = await import('../services/popbillProvider')
    const provider = createPopbillProvider(linkedId, secretKey, brn, isTestMode)

    const balance = await provider.getBalance()
    return c.json({
      success: true,
      data: {
        connected: true,
        testMode: isTestMode,
        remainPoint: balance.remainPoint,
        partnerPoint: balance.partnerPoint,
        linkedId,
        brn,
      }
    })
  } catch (err) {
    console.error('Popbill connection error:', err)
    return c.json({
      success: false,
      error: '팝빌 연결에 실패했습니다'
    }, 500)
  }
})

// GET / — List tax invoices (paginated)
taxInvoicesRouter.get('/', async (c) => {
  try {
    const { page = '1', limit = '50', status = '', search = '', date_from = '', date_to = '' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 50, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    let query = `
      SELECT
        ti.*,
        o.order_number,
        c.client_name as buyer_client_name,
        (SELECT COUNT(*) FROM tax_invoice_orders WHERE tax_invoice_id = ti.id) as order_count,
        (SELECT GROUP_CONCAT(o2.order_number, ', ') FROM tax_invoice_orders tio2 JOIN orders o2 ON tio2.order_id = o2.id WHERE tio2.tax_invoice_id = ti.id) as order_numbers
      FROM tax_invoices ti
      LEFT JOIN orders o ON ti.order_id = o.id
      LEFT JOIN clients c ON ti.buyer_client_id = c.id
    `
    const params: any[] = []
    const whereClauses: string[] = []
    const ef = entityFilter(c, 'ti')

    if (status) {
      whereClauses.push('ti.status = ?')
      params.push(status)
    }
    if (search) {
      whereClauses.push('(ti.invoice_number LIKE ? OR o.order_number LIKE ? OR ti.buyer_name LIKE ?)')
      const p = `%${search}%`
      params.push(p, p, p)
    }
    if (date_from) {
      whereClauses.push('ti.issue_date >= ?')
      params.push(date_from)
    }
    if (date_to) {
      whereClauses.push('ti.issue_date <= ?')
      params.push(date_to)
    }
    if (ef.clause) {
      whereClauses.push(ef.clause.replace(' AND ', ''))
      params.push(...ef.params)
    }

    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ')
    }
    query += ' ORDER BY ti.created_at DESC LIMIT ? OFFSET ?'
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    let countQuery = `
      SELECT COUNT(*) as count
      FROM tax_invoices ti
      LEFT JOIN orders o ON ti.order_id = o.id
      LEFT JOIN clients c ON ti.buyer_client_id = c.id
    `
    const countParams: any[] = []
    const countWhereClauses: string[] = []

    if (status) {
      countWhereClauses.push('ti.status = ?')
      countParams.push(status)
    }
    if (search) {
      countWhereClauses.push('(ti.invoice_number LIKE ? OR o.order_number LIKE ? OR ti.buyer_name LIKE ?)')
      const p = `%${search}%`
      countParams.push(p, p, p)
    }
    if (date_from) {
      countWhereClauses.push('ti.issue_date >= ?')
      countParams.push(date_from)
    }
    if (date_to) {
      countWhereClauses.push('ti.issue_date <= ?')
      countParams.push(date_to)
    }
    if (ef.clause) {
      countWhereClauses.push(ef.clause.replace(' AND ', ''))
      countParams.push(...ef.params)
    }

    if (countWhereClauses.length > 0) {
      countQuery += ' WHERE ' + countWhereClauses.join(' AND ')
    }

    const countRow = await c.env.DB.prepare(countQuery).bind(...countParams).first() as any
    const count = countRow?.count ?? 0

    return c.json({
      success: true,
      data: results,
      pagination: {
        page: parseInt(page),
        limit: safeLimit,
        total: count,
        total_pages: Math.ceil(count / safeLimit)
      }
    })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /eligible-orders — Orders eligible for tax invoice (not yet invoiced)
// client_id 있으면 해당 거래처만, 없으면 전체를 거래처별 그룹핑하여 반환
taxInvoicesRouter.get('/eligible-orders', async (c) => {
  try {
    const { client_id, from, to } = c.req.query()

    const params: any[] = []
    const whereClauses: string[] = [
      `o.status IN ('CONFIRMED', 'PRINTING', 'PRINT_DONE', 'SHIPPED')`,
      `o.id NOT IN (SELECT tio.order_id FROM tax_invoice_orders tio JOIN tax_invoices ti ON tio.tax_invoice_id = ti.id WHERE ti.status != 'CANCELLED')`,
      `COALESCE(c.invoice_method, 'PER_ORDER') NOT IN ('CARD', 'ISSUED_BY_OTHER')`
    ]

    // 멀티사업자 entity 필터
    const ef = entityFilter(c, 'o')
    if (ef.clause) {
      whereClauses.push(ef.clause.replace(/^\s*AND\s*/i, ''))
      if (ef.params) params.push(...ef.params)
    }

    if (client_id) {
      whereClauses.push('o.client_id = ?')
      params.push(parseInt(client_id))
    }
    if (from) {
      whereClauses.push('o.order_date >= ?')
      params.push(from)
    }
    if (to) {
      whereClauses.push('o.order_date <= ?')
      params.push(to)
    }

    const query = `
      SELECT o.id, o.order_number, o.order_date, o.total_amount, o.vat_amount,
             (o.total_amount + o.vat_amount) as final_amount,
             o.billing_status,
             c.id as client_id, c.client_name, c.business_registration_number,
             c.email as client_email, c.invoice_method
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY c.client_name ASC, o.order_date DESC, o.id DESC
    `

    const { results } = params.length > 0
      ? await c.env.DB.prepare(query).bind(...params).all()
      : await c.env.DB.prepare(query).all()

    // client_id가 지정된 경우 기존처럼 flat 배열 반환 (하위호환)
    if (client_id) {
      return c.json({ success: true, data: results })
    }

    // client_id 없으면 거래처별 그룹핑 (JS에서 수행)
    const clientMap = new Map<number, {
      client_id: number
      client_name: string
      business_registration_number: string | null
      client_email: string | null
      invoice_method: string | null
      brn_missing: boolean
      orders: any[]
    }>()

    for (const row of results as any[]) {
      const cid = row.client_id
      if (!clientMap.has(cid)) {
        clientMap.set(cid, {
          client_id: cid,
          client_name: row.client_name || '(거래처 없음)',
          business_registration_number: row.business_registration_number || null,
          client_email: row.client_email || null,
          invoice_method: row.invoice_method || null,
          brn_missing: !row.business_registration_number,
          orders: []
        })
      }
      clientMap.get(cid)!.orders.push({
        id: row.id,
        order_number: row.order_number,
        order_date: row.order_date,
        total_amount: parseFloat(row.total_amount) || 0,
        vat_amount: parseFloat(row.vat_amount) || 0,
        final_amount: parseFloat(row.final_amount) || 0
      })
    }

    const data = Array.from(clientMap.values()).map(group => {
      const supply_total = group.orders.reduce((s, o) => s + o.total_amount, 0)
      const tax_total = group.orders.reduce((s, o) => s + o.vat_amount, 0)
      return {
        ...group,
        summary: {
          count: group.orders.length,
          supply_total,
          tax_total,
          total: supply_total + tax_total
        }
      }
    })

    const grand_total = {
      count: data.reduce((s, g) => s + g.summary.count, 0),
      supply_total: data.reduce((s, g) => s + g.summary.supply_total, 0),
      tax_total: data.reduce((s, g) => s + g.summary.tax_total, 0),
      total: data.reduce((s, g) => s + g.summary.total, 0)
    }

    return c.json({ success: true, data, grand_total })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /order/:orderId — Get tax invoices for specific order (must be before /:id)
taxInvoicesRouter.get('/order/:orderId', async (c) => {
  try {
    const orderId = parseInt(c.req.param('orderId'))

    // junction 테이블도 함께 검색 (단건 order_id 컬럼 + junction 테이블)
    const { results } = await c.env.DB.prepare(`
      SELECT ti.*, o.order_number
      FROM tax_invoices ti
      LEFT JOIN orders o ON ti.order_id = o.id
      WHERE ti.order_id = ?
      UNION
      SELECT ti.*, o.order_number
      FROM tax_invoices ti
      JOIN tax_invoice_orders tio ON tio.tax_invoice_id = ti.id
      LEFT JOIN orders o ON ti.order_id = o.id
      WHERE tio.order_id = ?
      ORDER BY created_at DESC
    `).bind(orderId, orderId).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

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
        ).bind(group.client_id).first() as any

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
          ).bind(group.buyer_client_id).first() as any

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
        `).bind(...orderIds, group.client_id).all() as { results: any[] }

        if (orders.length !== orderIds.length) {
          results.push({ client_id: group.client_id, client_name: client.client_name, success: false, error: '일부 주문이 존재하지 않거나 거래처가 다릅니다.' })
          failCount++
          continue
        }

        const invoiceNumber = await generateInvoiceNumber(c.env.DB)
        const supplyAmount = orders.reduce((sum: number, o: any) => sum + (parseFloat(o.total_amount) || 0), 0)
        const taxAmount = orders.reduce((sum: number, o: any) => sum + (parseFloat(o.vat_amount) || 0), 0)
        const totalAmount = supplyAmount + taxAmount
        const firstOrder = orders[0]

        const insertResult = await c.env.DB.prepare(`
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
            ?, ?, 'NORMAL',
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?,
            'DRAFT', ?, NULL,
            ?,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
        `).bind(
          invoiceNumber, orderIds[0],
          settings.company_business_registration_number,
          settings.company_name || '',
          settings.company_representative || null,
          settings.company_address || null,
          settings.company_business_type || null,
          settings.company_business_item || null,
          group.client_id,
          client.business_registration_number,
          client.client_name,
          client.representative || null,
          client.address || null,
          client.business_type || null,
          client.business_item || null,
          group.buyer_email || client.email || null,
          supplyAmount, taxAmount, totalAmount,
          issueDate,
          getEntityId(c)
        ).run()

        const taxInvoiceId = insertResult.meta.last_row_id

        // junction 테이블 연결
        for (const oid of orderIds) {
          await c.env.DB.prepare(
            'INSERT OR IGNORE INTO tax_invoice_orders (tax_invoice_id, order_id) VALUES (?, ?)'
          ).bind(taxInvoiceId, oid).run()
        }

        // order_items → tax_invoice_items
        const vatRate = 0.1
        let globalSortOrder = 0
        for (const order of orders) {
          const { results: orderItems } = await c.env.DB.prepare(
            'SELECT * FROM order_items WHERE order_id = ? ORDER BY sort_order'
          ).bind(order.id).all()

          for (const oi of orderItems as any[]) {
            const itemAmount = parseFloat(oi.amount) || 0
            const itemTax = oi.vat_included ? Math.round(itemAmount * vatRate) : 0
            const spec = (oi.width && oi.height) ? `${oi.width}x${oi.height}` : null

            await c.env.DB.prepare(`
              INSERT INTO tax_invoice_items (
                tax_invoice_id, item_date, item_name, specification,
                quantity, unit_price, supply_amount, tax_amount, sort_order
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              taxInvoiceId, issueDate, oi.item_name, spec,
              oi.quantity, parseFloat(oi.unit_price) || 0,
              itemAmount, itemTax, globalSortOrder++
            ).run()
          }
        }

        let invoiceResult: any = { invoice_id: taxInvoiceId, invoice_number: invoiceNumber }

        // auto_issue 처리
        if (body.auto_issue) {
          const issueRes = await issueTaxInvoice(c.env.DB, taxInvoiceId, user.id, c.env)
          if (!issueRes.success) {
            results.push({ client_id: group.client_id, client_name: client.client_name, success: false, error: issueRes.error, invoice_id: taxInvoiceId, invoice_number: invoiceNumber })
            failCount++
            continue
          }
          invoiceResult = { ...invoiceResult, issued: true }
        }

        results.push({ client_id: group.client_id, client_name: client.client_name, success: true, ...invoiceResult })
        successCount++
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

// GET /:id — Single tax invoice detail
taxInvoicesRouter.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))

    const invoice = await c.env.DB.prepare(`
      SELECT ti.*, o.order_number
      FROM tax_invoices ti
      LEFT JOIN orders o ON ti.order_id = o.id
      WHERE ti.id = ?
    `).bind(id).first()

    if (!invoice) {
      return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
    }

    const { results: items } = await c.env.DB.prepare(
      'SELECT * FROM tax_invoice_items WHERE tax_invoice_id = ? ORDER BY sort_order'
    ).bind(id).all()

    // 연결된 주문 목록 조회 (묶음 발행 지원)
    const { results: orders } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.order_date, o.total_amount, o.vat_amount
      FROM tax_invoice_orders tio
      JOIN orders o ON tio.order_id = o.id
      WHERE tio.tax_invoice_id = ?
      ORDER BY o.order_date ASC, o.id ASC
    `).bind(id).all()

    return c.json({ success: true, data: { ...invoice, items, orders } })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
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

    const invoiceNumber = await generateInvoiceNumber(c.env.DB)
    const issueDate = body.issue_date || new Date().toISOString().slice(0, 10)
    const user = c.get('user')

    // ──────────────────────────────────────────────
    // 묶음 발행 로직
    // ──────────────────────────────────────────────
    if (isBulk) {
      const orderIds = body.order_ids!

      // 주문 목록 조회
      const placeholders = orderIds.map(() => '?').join(', ')
      const { results: orders } = await c.env.DB.prepare(`
        SELECT o.*, c.client_name, c.business_registration_number,
          c.representative, c.address, c.business_type, c.business_item,
          c.email as client_email, c.id as client_id
        FROM orders o
        LEFT JOIN clients c ON o.client_id = c.id
        WHERE o.id IN (${placeholders})
      `).bind(...orderIds).all() as { results: any[] }

      if (orders.length === 0) {
        return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)
      }
      if (orders.length !== orderIds.length) {
        return c.json({ success: false, error: '일부 주문이 존재하지 않습니다.' }, 400)
      }

      // 모든 주문이 같은 거래처인지 검증
      const clientIds = [...new Set(orders.map((o: any) => o.client_id))]
      if (clientIds.length > 1) {
        return c.json({ success: false, error: '묶음 발행은 동일 거래처 주문만 가능합니다.' }, 400)
      }

      const firstOrder = orders[0] as any
      if (!firstOrder.business_registration_number) {
        return c.json({ success: false, error: '거래처에 사업자등록번호가 등록되어 있지 않습니다.' }, 400)
      }

      // 금액 합산
      const supplyAmount = orders.reduce((sum: number, o: any) => sum + (parseFloat(o.total_amount) || 0), 0)
      const taxAmount = orders.reduce((sum: number, o: any) => sum + (parseFloat(o.vat_amount) || 0), 0)
      const totalAmount = supplyAmount + taxAmount

      const insertResult = await c.env.DB.prepare(`
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
          ?, ?, 'NORMAL',
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
        invoiceNumber, orderIds[0],
        settings.company_business_registration_number,
        settings.company_name || '',
        settings.company_representative || null,
        settings.company_address || null,
        settings.company_business_type || null,
        settings.company_business_item || null,
        firstOrder.client_id,
        firstOrder.business_registration_number,
        firstOrder.client_name,
        firstOrder.representative || null,
        firstOrder.address || null,
        firstOrder.business_type || null,
        firstOrder.business_item || null,
        body.buyer_email || firstOrder.client_email || null,
        supplyAmount, taxAmount, totalAmount,
        issueDate,
        body.notes || null,
        getEntityId(c)
      ).run()

      const taxInvoiceId = insertResult.meta.last_row_id

      // junction 테이블에 각 주문 연결
      for (const oid of orderIds) {
        await c.env.DB.prepare(
          'INSERT OR IGNORE INTO tax_invoice_orders (tax_invoice_id, order_id) VALUES (?, ?)'
        ).bind(taxInvoiceId, oid).run()
      }

      // 모든 주문의 order_items 병합 → tax_invoice_items (sort_order 연속)
      const vatRate = 0.1
      let globalSortOrder = 0
      for (const order of orders as any[]) {
        const { results: orderItems } = await c.env.DB.prepare(
          'SELECT * FROM order_items WHERE order_id = ? ORDER BY sort_order'
        ).bind(order.id).all()

        for (const oi of orderItems as any[]) {
          const itemAmount = parseFloat(oi.amount) || 0
          const itemTax = oi.vat_included ? Math.round(itemAmount * vatRate) : 0
          const spec = (oi.width && oi.height) ? `${oi.width}x${oi.height}` : null

          await c.env.DB.prepare(`
            INSERT INTO tax_invoice_items (
              tax_invoice_id, item_date, item_name, specification,
              quantity, unit_price, supply_amount, tax_amount, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            taxInvoiceId,
            issueDate,
            oi.item_name,
            spec,
            oi.quantity,
            parseFloat(oi.unit_price) || 0,
            itemAmount,
            itemTax,
            globalSortOrder++
          ).run()
        }
      }

      const created = await c.env.DB.prepare(`
        SELECT ti.*, o.order_number FROM tax_invoices ti
        LEFT JOIN orders o ON ti.order_id = o.id
        WHERE ti.id = ?
      `).bind(taxInvoiceId).first()

      const { results: createdItems } = await c.env.DB.prepare(
        'SELECT * FROM tax_invoice_items WHERE tax_invoice_id = ? ORDER BY sort_order'
      ).bind(taxInvoiceId).all()

      const { results: linkedOrders } = await c.env.DB.prepare(`
        SELECT o.id, o.order_number, o.order_date, o.total_amount, o.vat_amount
        FROM tax_invoice_orders tio
        JOIN orders o ON tio.order_id = o.id
        WHERE tio.tax_invoice_id = ?
        ORDER BY o.order_date ASC, o.id ASC
      `).bind(taxInvoiceId).all()

      // auto_issue 처리
      if (body.auto_issue) {
        const issueRes = await issueTaxInvoice(c.env.DB, taxInvoiceId, user.id, c.env)
        if (!issueRes.success) {
          return c.json({ success: false, error: issueRes.error, data: { invoice_id: taxInvoiceId, invoice_number: invoiceNumber, ...(issueRes.data || {}) } }, 400)
        }
        return c.json({ success: true, data: { ...issueRes.data, orders: linkedOrders, auto_issued: true } }, 201)
      }

      return c.json({ success: true, data: { ...created, items: createdItems, orders: linkedOrders } }, 201)
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
    `).bind(body.order_id).first() as any

    if (!order) {
      return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)
    }
    if (!order.business_registration_number) {
      return c.json({ success: false, error: '거래처에 사업자등록번호가 등록되어 있지 않습니다.' }, 400)
    }

    const supplyAmount = parseFloat(order.total_amount) || 0
    const taxAmount = parseFloat(order.vat_amount) || 0
    const totalAmount = supplyAmount + taxAmount

    const insertResult = await c.env.DB.prepare(`
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
        ?, ?, 'NORMAL',
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
      invoiceNumber, body.order_id,
      settings.company_business_registration_number,
      settings.company_name || '',
      settings.company_representative || null,
      settings.company_address || null,
      settings.company_business_type || null,
      settings.company_business_item || null,
      order.client_id,
      order.business_registration_number,
      order.client_name,
      order.representative || null,
      order.address || null,
      order.business_type || null,
      order.business_item || null,
      body.buyer_email || order.client_email || null,
      supplyAmount, taxAmount, totalAmount,
      issueDate,
      body.notes || null,
      getEntityId(c)
    ).run()

    const taxInvoiceId = insertResult.meta.last_row_id

    // junction 테이블에 단건 연결
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO tax_invoice_orders (tax_invoice_id, order_id) VALUES (?, ?)'
    ).bind(taxInvoiceId, body.order_id).run()

    // Copy order_items -> tax_invoice_items
    const { results: orderItems } = await c.env.DB.prepare(
      'SELECT * FROM order_items WHERE order_id = ? ORDER BY sort_order'
    ).bind(body.order_id).all()

    const vatRate = 0.1
    for (const oi of orderItems as any[]) {
      const itemAmount = parseFloat(oi.amount) || 0
      const itemTax = oi.vat_included ? Math.round(itemAmount * vatRate) : 0
      const spec = (oi.width && oi.height) ? `${oi.width}x${oi.height}` : null

      await c.env.DB.prepare(`
        INSERT INTO tax_invoice_items (
          tax_invoice_id, item_date, item_name, specification,
          quantity, unit_price, supply_amount, tax_amount, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        taxInvoiceId,
        issueDate,
        oi.item_name,
        spec,
        oi.quantity,
        parseFloat(oi.unit_price) || 0,
        itemAmount,
        itemTax,
        oi.sort_order
      ).run()
    }

    const created = await c.env.DB.prepare(`
      SELECT ti.*, o.order_number FROM tax_invoices ti
      LEFT JOIN orders o ON ti.order_id = o.id
      WHERE ti.id = ?
    `).bind(taxInvoiceId).first()

    const { results: createdItems } = await c.env.DB.prepare(
      'SELECT * FROM tax_invoice_items WHERE tax_invoice_id = ? ORDER BY sort_order'
    ).bind(taxInvoiceId).all()

    // auto_issue 처리
    if (body.auto_issue) {
      const issueRes = await issueTaxInvoice(c.env.DB, taxInvoiceId, user.id, c.env)
      if (!issueRes.success) {
        return c.json({ success: false, error: issueRes.error, data: { invoice_id: taxInvoiceId, invoice_number: invoiceNumber, ...(issueRes.data || {}) } }, 400)
      }
      return c.json({ success: true, data: { ...issueRes.data, auto_issued: true } }, 201)
    }

    return c.json({ success: true, data: { ...created, items: createdItems } }, 201)
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

    const existing = await c.env.DB.prepare(
      'SELECT id, status FROM tax_invoices WHERE id = ?'
    ).bind(id).first() as any

    if (!existing) {
      return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
    }
    if (existing.status !== 'DRAFT') {
      return c.json({ success: false, error: '임시저장 상태의 세금계산서만 수정할 수 있습니다.' }, 400)
    }

    const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP']
    const params: any[] = []

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
            parseFloat(it.unit_price as any) || 0,
            parseFloat(it.supply_amount as any) || 0,
            parseFloat(it.tax_amount as any) || 0,
            it.notes || null,
            it.sort_order ?? i
          )
        )
      }
      await c.env.DB.batch(batchStmts)

      // Recalculate header totals from items
      const totals = await c.env.DB.prepare(
        'SELECT SUM(supply_amount) as supply, SUM(tax_amount) as tax FROM tax_invoice_items WHERE tax_invoice_id = ?'
      ).bind(id).first() as any

      const supply = parseFloat(totals?.supply) || 0
      const tax = parseFloat(totals?.tax) || 0
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
      'SELECT * FROM tax_invoice_items WHERE tax_invoice_id = ? ORDER BY sort_order'
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

    const existing = await c.env.DB.prepare(
      'SELECT id, status FROM tax_invoices WHERE id = ?'
    ).bind(id).first() as any

    if (!existing) {
      return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
    }
    if (existing.status !== 'DRAFT') {
      return c.json({ success: false, error: '임시저장 상태의 세금계산서만 삭제할 수 있습니다.' }, 400)
    }

    await c.env.DB.prepare('DELETE FROM tax_invoices WHERE id = ?').bind(id).run()

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

    const result = await issueTaxInvoice(c.env.DB, id, user.id, c.env)
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
    const original = await c.env.DB.prepare(`
      SELECT ti.*, o.order_number FROM tax_invoices ti
      LEFT JOIN orders o ON ti.order_id = o.id
      WHERE ti.id = ?
    `).bind(id).first() as any

    if (!original) {
      return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
    }
    if (!['ISSUED', 'SENT', 'NTS_SUCCESS'].includes(original.status)) {
      return c.json({ success: false, error: '발행 또는 전송 완료 상태의 세금계산서만 수정발행할 수 있습니다.' }, 400)
    }

    // 원본 품목 조회
    const { results: originalItems } = await c.env.DB.prepare(
      'SELECT * FROM tax_invoice_items WHERE tax_invoice_id = ? ORDER BY sort_order'
    ).bind(id).all()

    const invoiceNumber = await generateInvoiceNumber(c.env.DB)
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
        status, issue_date, notes,
        created_at, updated_at
      ) VALUES (
        ?, ?, 'MODIFY', ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        'DRAFT', ?, ?,
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
      body.notes !== undefined ? body.notes : (original.notes || null)
    ).run()

    const newInvoiceId = insertResult.meta.last_row_id

    // 원본의 junction 테이블 연결 복사
    const { results: origOrders } = await c.env.DB.prepare(
      'SELECT order_id FROM tax_invoice_orders WHERE tax_invoice_id = ?'
    ).bind(id).all()

    for (const row of origOrders as any[]) {
      await c.env.DB.prepare(
        'INSERT OR IGNORE INTO tax_invoice_orders (tax_invoice_id, order_id) VALUES (?, ?)'
      ).bind(newInvoiceId, row.order_id).run()
    }

    // 품목: body.items가 있으면 수정된 품목, 없으면 원본 복사
    const itemsToInsert = body.items
      ? body.items.map((it, i) => ({
          item_date: issueDate,
          item_name: it.item_name,
          specification: it.specification || null,
          quantity: it.quantity,
          unit_price: parseFloat(it.unit_price as any) || 0,
          supply_amount: parseFloat(it.supply_amount as any) || 0,
          tax_amount: parseFloat(it.tax_amount as any) || 0,
          notes: null,
          sort_order: i
        }))
      : (originalItems as any[]).map((it, i) => ({
          item_date: it.item_date || issueDate,
          item_name: it.item_name,
          specification: it.specification || null,
          quantity: it.quantity,
          unit_price: parseFloat(it.unit_price) || 0,
          supply_amount: parseFloat(it.supply_amount) || 0,
          tax_amount: parseFloat(it.tax_amount) || 0,
          notes: it.notes || null,
          sort_order: i
        }))

    for (const it of itemsToInsert) {
      await c.env.DB.prepare(`
        INSERT INTO tax_invoice_items (
          tax_invoice_id, item_date, item_name, specification,
          quantity, unit_price, supply_amount, tax_amount, notes, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        newInvoiceId, it.item_date, it.item_name, it.specification,
        it.quantity, it.unit_price, it.supply_amount, it.tax_amount,
        it.notes, it.sort_order
      ).run()
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
      'SELECT * FROM tax_invoice_items WHERE tax_invoice_id = ? ORDER BY sort_order'
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

    const existing = await c.env.DB.prepare(
      'SELECT id, status FROM tax_invoices WHERE id = ?'
    ).bind(id).first() as any

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

    const updated = await c.env.DB.prepare(`
      SELECT ti.*, o.order_number FROM tax_invoices ti
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
// GET /monthly-eligible - 월합산 대상 거래처 + 미발행 주문
// ============================================================================
taxInvoicesRouter.get('/monthly-eligible', async (c) => {
  try {
    const { year, month } = c.req.query()
    const now = new Date()
    const y = year || String(now.getFullYear())
    const m = month || String(now.getMonth() + 1).padStart(2, '0')
    const dateFrom = `${y}-${m}-01`
    const dateTo = `${y}-${m}-31`

    // 월합산 대상 거래처의 해당 월 미발행 BILLED 주문
    const { results } = await c.env.DB.prepare(`
      SELECT c.id as client_id, c.client_name, c.business_registration_number,
             c.email as client_email, c.invoice_method,
             o.id as order_id, o.order_number, o.order_date, o.total_amount, o.vat_amount,
             (o.total_amount + o.vat_amount) as final_amount
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
      ORDER BY c.client_name ASC, o.order_date ASC
    `).bind(dateFrom, dateTo).all()

    // 거래처별 그룹핑
    const grouped: Record<number, any> = {}
    for (const row of results as any[]) {
      if (!grouped[row.client_id]) {
        grouped[row.client_id] = {
          client_id: row.client_id,
          client_name: row.client_name,
          business_registration_number: row.business_registration_number,
          client_email: row.client_email,
          orders: [],
          total_supply: 0,
          total_tax: 0,
          total_amount: 0,
        }
      }
      grouped[row.client_id].orders.push({
        order_id: row.order_id,
        order_number: row.order_number,
        order_date: row.order_date,
        total_amount: parseFloat(row.total_amount) || 0,
        vat_amount: parseFloat(row.vat_amount) || 0,
        final_amount: parseFloat(row.final_amount) || 0,
      })
      grouped[row.client_id].total_supply += parseFloat(row.total_amount) || 0
      grouped[row.client_id].total_tax += parseFloat(row.vat_amount) || 0
      grouped[row.client_id].total_amount += parseFloat(row.final_amount) || 0
    }

    return c.json({
      success: true,
      data: Object.values(grouped),
      period: { year: y, month: m }
    })
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
    const grouped: Record<number, any> = {}
    for (const row of results as any[]) {
      if (!grouped[row.client_id]) {
        grouped[row.client_id] = { ...row, orders: [], supply: 0, tax: 0 }
      }
      grouped[row.client_id].orders.push(row)
      grouped[row.client_id].supply += parseFloat(row.total_amount) || 0
      grouped[row.client_id].tax += parseFloat(row.vat_amount) || 0
    }

    const companySettings = await getCompanySettings(c.env.DB, getEntityId(c))
    const created: any[] = []
    const errors: any[] = []

    for (const group of Object.values(grouped) as any[]) {
      try {
        const invoiceNumber = await generateInvoiceNumber(c.env.DB)

        const insertResult = await c.env.DB.prepare(`
          INSERT INTO tax_invoices (
            invoice_number, order_id, buyer_client_id, issue_date, status,
            supplier_brn, supplier_name, supplier_representative, supplier_address,
            supplier_business_type, supplier_business_item,
            buyer_brn, buyer_name, buyer_representative, buyer_address, buyer_email,
            supply_amount, tax_amount, total_amount,
            entity_id,
            created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).bind(
          invoiceNumber,
          group.orders[0].order_id,
          group.client_id,
          issueDate,
          companySettings['company_business_registration_number'] || '',
          companySettings['company_name'] || '',
          companySettings['company_representative'] || '',
          companySettings['company_address'] || '',
          companySettings['company_business_type'] || '',
          companySettings['company_business_item'] || '',
          group.business_registration_number || '',
          group.client_name || '',
          group.representative || '',
          group.address || '',
          group.buyer_email || '',
          group.supply,
          group.tax,
          group.supply + group.tax,
          getEntityId(c),
          user?.id || 1
        ).run()

        const taxInvoiceId = insertResult.meta.last_row_id

        // tax_invoice_orders 연결
        for (const order of group.orders) {
          await c.env.DB.prepare(
            'INSERT INTO tax_invoice_orders (tax_invoice_id, order_id) VALUES (?, ?)'
          ).bind(taxInvoiceId, order.order_id).run()
        }

        // 품목 합산 행 추가
        await c.env.DB.prepare(`
          INSERT INTO tax_invoice_items (tax_invoice_id, sort_order, item_name, quantity, unit_price, supply_amount, tax_amount)
          VALUES (?, 1, ?, 1, ?, ?, ?)
        `).bind(
          taxInvoiceId,
          `${body.year}년 ${body.month}월 합산 (${group.orders.length}건)`,
          group.supply,
          group.supply,
          group.tax
        ).run()

        // auto_issue
        if (body.auto_issue) {
          const issueResult = await issueTaxInvoice(c.env.DB, taxInvoiceId as number, user?.id || 1, c.env)
          created.push({ invoice_number: invoiceNumber, client_name: group.client_name, issued: issueResult.success })
        } else {
          created.push({ invoice_number: invoiceNumber, client_name: group.client_name, issued: false })
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
// 상태 새로고침 (GetInfo) — 팝빌에서 최신 상태 조회
// ────────────────────────────────────────────────────────────────────────────
taxInvoicesRouter.post('/:id/refresh-status', async (c) => {
  const db = c.env.DB
  const env = c.env
  const id = parseInt(c.req.param('id'))

  try {
    const invoice = await db.prepare(
      `SELECT id, invoice_number, status, supplier_brn FROM tax_invoices WHERE id = ?`
    ).bind(id).first() as any

    if (!invoice) {
      return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
    }

    if (invoice.status === 'DRAFT' || invoice.status === 'CANCELLED') {
      return c.json({ success: false, error: '팝빌 전송 전 상태에서는 조회할 수 없습니다.' })
    }

    // 팝빌 연동 확인
    const linkedIdSetting = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_provider_linked_id'`
    ).first<{ setting_value: string }>()
    const secretKey = env.POPBILL_SECRET_KEY
    const linkedId = linkedIdSetting?.setting_value

    if (!linkedId || !secretKey) {
      return c.json({ success: false, error: '팝빌 연동 설정이 없습니다.' })
    }

    const { createPopbillProvider } = await import('../services/popbillProvider')
    const testModeSetting = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_test_mode'`
    ).first<{ setting_value: string }>()
    const isTestMode = testModeSetting?.setting_value === '1'
    const provider = createPopbillProvider(
      linkedId, secretKey,
      invoice.supplier_brn.replace(/-/g, ''),
      isTestMode
    )

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
      `SELECT * FROM tax_invoices WHERE id = ?`
    ).bind(id).first()

    return c.json({
      success: true,
      data: updated,
      popbill: { stateCode, stateDT: statusResult.stateDT, ntsApproval }
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
    const invoice = await db.prepare(
      `SELECT id, status, invoice_number FROM tax_invoices WHERE id = ?`
    ).bind(id).first() as any

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
      `SELECT * FROM tax_invoices WHERE id = ?`
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
    const invoice = await db.prepare(
      `SELECT id, invoice_number, status, supplier_brn, buyer_email FROM tax_invoices WHERE id = ?`
    ).bind(id).first() as any

    if (!invoice) return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
    if (!['ISSUED', 'SENT', 'NTS_SUCCESS'].includes(invoice.status)) {
      return c.json({ success: false, error: '발행 완료된 세금계산서만 이메일 전송 가능합니다.' })
    }

    const email = body.email || invoice.buyer_email
    if (!email) return c.json({ success: false, error: '이메일 주소가 없습니다.' })

    const linkedIdSetting = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_provider_linked_id'`
    ).first<{ setting_value: string }>()
    const secretKey = env.POPBILL_SECRET_KEY
    const linkedId = linkedIdSetting?.setting_value
    if (!linkedId || !secretKey) return c.json({ success: false, error: '팝빌 연동 설정이 없습니다.' })

    const { createPopbillProvider } = await import('../services/popbillProvider')
    const testModeSetting = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_test_mode'`
    ).first<{ setting_value: string }>()
    const isTestMode = testModeSetting?.setting_value === '1'
    const provider = createPopbillProvider(linkedId, secretKey, invoice.supplier_brn.replace(/-/g, ''), isTestMode)

    const result = await provider.sendEmail(invoice.invoice_number, email)
    return c.json({ success: result.success, data: result, email })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /:id/print-url — 인쇄/PDF URL 조회
taxInvoicesRouter.get('/:id/print-url', async (c) => {
  const db = c.env.DB
  const env = c.env
  const id = parseInt(c.req.param('id'))

  try {
    const invoice = await db.prepare(
      `SELECT id, invoice_number, status, supplier_brn FROM tax_invoices WHERE id = ?`
    ).bind(id).first() as any

    if (!invoice) return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 404)
    if (!['ISSUED', 'SENT', 'NTS_SUCCESS', 'NTS_FAILED'].includes(invoice.status)) {
      return c.json({ success: false, error: '발행된 세금계산서만 조회 가능합니다.' })
    }

    const linkedIdSetting = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_provider_linked_id'`
    ).first<{ setting_value: string }>()
    const secretKey = env.POPBILL_SECRET_KEY
    const linkedId = linkedIdSetting?.setting_value
    if (!linkedId || !secretKey) return c.json({ success: false, error: '팝빌 연동 설정이 없습니다.' })

    const { createPopbillProvider } = await import('../services/popbillProvider')
    const testModeSetting = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_test_mode'`
    ).first<{ setting_value: string }>()
    const isTestMode = testModeSetting?.setting_value === '1'
    const provider = createPopbillProvider(linkedId, secretKey, invoice.supplier_brn.replace(/-/g, ''), isTestMode)

    const result = await provider.getPrintURL(invoice.invoice_number)

    return c.json({
      success: true,
      data: { url: result.url }
    })
  } catch (error) {
    console.error('src/routes/taxInvoices.ts print-url error:', error)
    return c.json({
      success: false,
      error: '인쇄 URL 조회에 실패했습니다'
    }, 500)
  }
})

export default taxInvoicesRouter
