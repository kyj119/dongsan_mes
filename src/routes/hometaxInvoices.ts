import { Hono, type Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { PopbillProvider } from '../services/popbillProvider'
import { getEntityCorpNum } from '../utils/entitySettings'
import { getEntityId } from '../utils/entityFilter'

const hometaxInvoicesRouter = new Hono<HonoEnv>()
hometaxInvoicesRouter.use('/*', authMiddleware)

// ============================================================================
// Helper: Provider 생성 (entity BRN 우선)
// ============================================================================
async function getProvider(c: Context<HonoEnv>): Promise<PopbillProvider | null> {
  const db = c.env.DB
  const linkedIdRow = await db.prepare(
    "SELECT setting_value FROM settings WHERE setting_key = 'tax_provider_linked_id'"
  ).first() as any
  const testModeRow = await db.prepare(
    "SELECT setting_value FROM settings WHERE setting_key = 'tax_test_mode'"
  ).first() as any

  const linkedId = linkedIdRow?.setting_value
  const secretKey = c.env.POPBILL_SECRET_KEY
  const brn = await getEntityCorpNum(db, getEntityId(c))
  const isTest = testModeRow?.setting_value === '1'

  if (!linkedId || !secretKey || !brn) return null
  return new PopbillProvider({ linkedId, secretKey, supplierBRN: brn, isTest })
}

// ============================================================================
// POST /collect — 수집 요청
// ============================================================================
hometaxInvoicesRouter.post('/collect', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json<{ type: string; startDate: string; endDate: string }>()

    const { type, startDate, endDate } = body

    // Validation
    if (!type || !['SELL', 'BUY'].includes(type)) {
      return c.json({ success: false, error: '잘못된 type (SELL 또는 BUY)' }, 400)
    }
    if (!startDate || !endDate) {
      return c.json({ success: false, error: 'startDate, endDate 필수' }, 400)
    }

    // Parse dates to validate format (YYYYMMDD)
    const start = startDate.replace(/-/g, '')
    const end = endDate.replace(/-/g, '')
    if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end)) {
      return c.json({ success: false, error: '날짜 형식: YYYYMMDD' }, 400)
    }

    // Max 3 months range check
    const startMs = new Date(start.slice(0, 4) + '-' + start.slice(4, 6) + '-' + start.slice(6)).getTime()
    const endMs = new Date(end.slice(0, 4) + '-' + end.slice(4, 6) + '-' + end.slice(6)).getTime()
    const diffMs = endMs - startMs
    const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30)
    if (diffMonths > 90) {
      return c.json({ success: false, error: '조회 기간은 최대 3개월' }, 400)
    }

    const provider = await getProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '세금계산서 설정 미완료' }, 400)
    }

    // Request job from Popbill
    const jobResult = await provider.requestHometaxJob(type as 'SELL' | 'BUY', start, end)
    const jobId = jobResult.jobId

    // Save job to DB
    const db = c.env.DB
    const insertResult = await db.prepare(`
      INSERT INTO hometax_jobs (job_id, job_type, start_date, end_date, requested_by, entity_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(jobId, type, startDate, endDate, user.id, getEntityId(c) || 1).run()

    return c.json({
      success: true,
      data: {
        id: (insertResult.meta.last_row_id as number) || undefined,
        jobId: jobId,
        type: type,
        startDate: startDate,
        endDate: endDate,
        requestedAt: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('hometaxInvoices POST /collect error:', error)
    console.error('src/routes/hometaxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /jobs — 수집 작업 목록
// ============================================================================
hometaxInvoicesRouter.get('/jobs', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { page = '1', limit = '20' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 20, 100)
    const offset = (parseInt(page) - 1) * safeLimit

    const db = c.env.DB
    const { results } = await db.prepare(`
      SELECT hj.*,
             u.name as requester_name
      FROM hometax_jobs hj
      LEFT JOIN users u ON hj.requested_by = u.id
      ORDER BY hj.requested_at DESC
      LIMIT ? OFFSET ?
    `).bind(safeLimit, offset).all()

    const { count } = (await db.prepare(`SELECT COUNT(*) as count FROM hometax_jobs`).first()) as any

    return c.json({
      success: true,
      data: results,
      pagination: { page: parseInt(page), limit: safeLimit, total: count, total_pages: Math.ceil(count / safeLimit) }
    })
  } catch (error) {
    console.error('hometaxInvoices GET /jobs error:', error)
    console.error('src/routes/hometaxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /jobs/:id/status — 작업 상태 조회
// ============================================================================
hometaxInvoicesRouter.get('/jobs/:id/status', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const jobDbId = c.req.param('id')
    const db = c.env.DB

    const job = (await db.prepare(`
      SELECT * FROM hometax_jobs WHERE id = ?
    `).bind(parseInt(jobDbId)).first()) as any

    if (!job) {
      return c.json({ success: false, error: '작업 없음' }, 404)
    }

    const provider = await getProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '세금계산서 설정 미완료' }, 400)
    }

    // Get job state from Popbill
    const jobState = await provider.getHometaxJobState(job.job_id)

    // Update DB with latest state
    await db.prepare(`
      UPDATE hometax_jobs SET state = ?, result = ?, message = ?
      WHERE id = ?
    `).bind(jobState.state, jobState.result, jobState.message, job.id).run()

    // If completed, set completed_at
    if (jobState.state === 3) {
      await db.prepare(`
        UPDATE hometax_jobs SET completed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND completed_at IS NULL
      `).bind(job.id).run()
    }

    return c.json({
      success: true,
      data: {
        id: job.id,
        jobId: job.job_id,
        type: job.job_type,
        state: jobState.state,
        result: jobState.result,
        message: jobState.message,
        totalCount: job.total_count,
        startDate: job.start_date,
        endDate: job.end_date,
        requestedAt: job.requested_at,
        completedAt: job.completed_at
      }
    })
  } catch (error) {
    console.error('hometaxInvoices GET /jobs/:id/status error:', error)
    console.error('src/routes/hometaxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST /jobs/:id/fetch — 결과 가져오기 (수집 완료 후 DB에 저장)
// ============================================================================
hometaxInvoicesRouter.post('/jobs/:id/fetch', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const jobDbId = c.req.param('id')
    const db = c.env.DB

    const job = (await db.prepare(`
      SELECT * FROM hometax_jobs WHERE id = ?
    `).bind(parseInt(jobDbId)).first()) as any

    if (!job) {
      return c.json({ success: false, error: '작업 없음' }, 404)
    }

    // Check if job is completed successfully
    if (job.state !== 3) {
      return c.json({ success: false, error: '작업이 완료되지 않았습니다' }, 400)
    }
    if (job.result !== 100) {
      return c.json({ success: false, error: '작업 실패 또는 결과 없음' }, 400)
    }

    const provider = await getProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '세금계산서 설정 미완료' }, 400)
    }

    // Fetch all pages of invoices
    let totalImported = 0
    let page = 1
    const perPage = 100

    while (true) {
      const result = await provider.searchHometaxInvoices(job.job_id, { page, perPage })

      if (!result.list || result.list.length === 0) break

      for (const invoice of result.list) {
        // Map Popbill fields to DB schema
        const ntsConfirmNumber = invoice.ntsconfirmNum || invoice.ntsConfirmNum
        const issueDate = invoice.issueDate
        const sendDate = invoice.sendDate
        const supplyAmount = parseInt(invoice.supplyCostTotal || invoice.supplyCost || 0)
        const taxAmount = parseInt(invoice.taxTotal || invoice.tax || 0)
        const totalAmount = parseInt(invoice.totalAmount || 0)

        const issuerCorpNum = invoice.invoicerCorpNum || invoice.supplierBRN
        const issuerCorpName = invoice.invoicerCorpName || invoice.supplierName
        const issuerCeoName = invoice.invoicerCEOName
        const receiverCorpNum = invoice.invoiceeCorpNum || invoice.buyerBRN
        const receiverCorpName = invoice.invoiceeCorpName || invoice.buyerName
        const receiverCeoName = invoice.invoiceeCEOName

        const invoiceDetailType = invoice.invoiceDetailType || 'NORMAL'
        const taxType = invoice.taxType
        const purposeType = invoice.purposeType

        // Insert into DB
        await db.prepare(`
          INSERT INTO hometax_invoices (
            job_id, invoice_type, nts_confirm_number, issue_date, send_date,
            supply_amount, tax_amount, total_amount,
            issuer_corp_num, issuer_corp_name, issuer_ceo_name,
            receiver_corp_num, receiver_corp_name, receiver_ceo_name,
            invoice_detail_type, tax_type, purpose_type,
            raw_data, entity_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          job.id, job.job_type, ntsConfirmNumber, issueDate, sendDate,
          supplyAmount, taxAmount, totalAmount,
          issuerCorpNum, issuerCorpName, issuerCeoName,
          receiverCorpNum, receiverCorpName, receiverCeoName,
          invoiceDetailType, taxType, purposeType,
          JSON.stringify(invoice), getEntityId(c) || 1
        ).run()

        totalImported++
      }

      // Check if we've reached the last page
      if (page >= result.pageNum && result.list.length < perPage) break
      page++
    }

    // Update job total_count
    await db.prepare(`
      UPDATE hometax_jobs SET total_count = ? WHERE id = ?
    `).bind(totalImported, job.id).run()

    return c.json({
      success: true,
      data: {
        jobId: job.id,
        imported: totalImported,
        message: `${totalImported}건의 세금계산서를 저장했습니다`
      }
    })
  } catch (error) {
    console.error('hometaxInvoices POST /jobs/:id/fetch error:', error)
    console.error('src/routes/hometaxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET / — 수집된 세금계산서 목록
// ============================================================================
hometaxInvoicesRouter.get('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { page = '1', limit = '30', type = '', date_from = '', date_to = '', match_status = '', search = '' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 30, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    const whereClauses: string[] = []
    const params: any[] = []

    if (type && ['SELL', 'BUY'].includes(type)) {
      whereClauses.push('hi.invoice_type = ?')
      params.push(type)
    }
    if (date_from) {
      whereClauses.push('hi.issue_date >= ?')
      params.push(date_from)
    }
    if (date_to) {
      whereClauses.push('hi.issue_date <= ?')
      params.push(date_to)
    }
    if (match_status) {
      whereClauses.push('hi.match_status = ?')
      params.push(match_status)
    }
    if (search) {
      whereClauses.push(`(hi.nts_confirm_number LIKE ? OR hi.issuer_corp_name LIKE ? OR hi.receiver_corp_name LIKE ?)`)
      const p = `%${search}%`
      params.push(p, p, p)
    }

    const where = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''

    const db = c.env.DB
    const { results } = await db.prepare(`
      SELECT hi.*,
             hj.job_type, hj.start_date, hj.end_date,
             ti.nts_approval_number as matched_nts_approval
      FROM hometax_invoices hi
      LEFT JOIN hometax_jobs hj ON hi.job_id = hj.id
      LEFT JOIN tax_invoices ti ON hi.matched_invoice_id = ti.id
      ${where}
      ORDER BY hi.issue_date DESC, hi.collected_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, safeLimit, offset).all()

    const { count } = (await db.prepare(`
      SELECT COUNT(*) as count FROM hometax_invoices hi
      LEFT JOIN hometax_jobs hj ON hi.job_id = hj.id
      ${where}
    `).bind(...params).first()) as any

    return c.json({
      success: true,
      data: results,
      pagination: { page: parseInt(page), limit: safeLimit, total: count, total_pages: Math.ceil(count / safeLimit) }
    })
  } catch (error) {
    console.error('hometaxInvoices GET / error:', error)
    console.error('src/routes/hometaxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /compare — 매입/매출 대조 비교
// ============================================================================
hometaxInvoicesRouter.get('/compare', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { month = '', type = 'SELL' } = c.req.query()

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return c.json({ success: false, error: 'month 형식: YYYY-MM' }, 400)
    }
    if (!['SELL', 'BUY'].includes(type)) {
      return c.json({ success: false, error: 'type은 SELL 또는 BUY' }, 400)
    }

    const db = c.env.DB
    const monthPrefix = month.replace('-', '')

    // Get hometax invoices for the month
    const { results: htInvoices } = await db.prepare(`
      SELECT * FROM hometax_invoices
      WHERE invoice_type = ? AND SUBSTR(issue_date, 1, 7) = ?
      ORDER BY issue_date DESC
    `).bind(type, month).all()

    // Get system tax invoices for comparison
    // Note: tax_invoices are always SELL type (company as supplier)
    // Only match when comparing SELL invoices from hometax
    let sysInvoices: any[] = []
    if (type === 'SELL') {
      const result = await db.prepare(`
        SELECT * FROM tax_invoices
        WHERE SUBSTR(issue_date, 1, 7) = ?
        ORDER BY issue_date DESC
      `).bind(month).all()
      sysInvoices = result.results || []
    }

    // Auto-match by nts_confirm_number
    const matched: any[] = []
    const unmatchedHT: any[] = []
    const unmatchedSys: any[] = []

    const htMap = new Map<string, any>()
    const sysMap = new Map<string, any>()

    for (const ht of (htInvoices || []) as any[]) {
      htMap.set(String(ht.nts_confirm_number), ht)
    }
    for (const sys of (sysInvoices || []) as any[]) {
      sysMap.set(String(sys.nts_approval_number), sys)
    }

    // Find matches
    for (const ht of (htInvoices || []) as any[]) {
      const sys = sysMap.get(String(ht.nts_confirm_number))
      if (sys) {
        matched.push({ hometax: ht, system: sys })
        sysMap.delete(String(ht.nts_confirm_number))
      } else {
        unmatchedHT.push(ht)
      }
    }

    // Remaining system invoices are unmatched
    for (const sys of sysMap.values()) {
      unmatchedSys.push(sys)
    }

    // Summary
    const summary = {
      total_hometax: htInvoices?.length || 0,
      total_system: sysInvoices?.length || 0,
      matched_count: matched.length,
      unmatched_hometax_count: unmatchedHT.length,
      unmatched_system_count: unmatchedSys.length,
      hometax_amount_total: (htInvoices as any[] || []).reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0),
      system_amount_total: (sysInvoices as any[] || []).reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0),
      matched_amount_total: matched.reduce((sum, m) => sum + (m.hometax.total_amount || 0), 0)
    }

    return c.json({
      success: true,
      data: {
        month: month,
        type: type,
        matched: matched,
        unmatched_hometax: unmatchedHT,
        unmatched_system: unmatchedSys,
        summary: summary
      }
    })
  } catch (error) {
    console.error('hometaxInvoices GET /compare error:', error)
    console.error('src/routes/hometaxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST /:id/match — 수동 매칭
// ============================================================================
hometaxInvoicesRouter.post('/:id/match', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const invoiceId = c.req.param('id')
    const body = await c.req.json<{ tax_invoice_id?: number; action?: string }>()

    const db = c.env.DB
    const invoice = await db.prepare(`SELECT * FROM hometax_invoices WHERE id = ?`).bind(parseInt(invoiceId)).first()

    if (!invoice) {
      return c.json({ success: false, error: '세금계산서 없음' }, 404)
    }

    if (body.action === 'unmatch') {
      // Unmatch
      await db.prepare(`
        UPDATE hometax_invoices SET matched_invoice_id = NULL, match_status = 'UNMATCHED', match_note = NULL
        WHERE id = ?
      `).bind(parseInt(invoiceId)).run()

      return c.json({
        success: true,
        data: { id: parseInt(invoiceId), match_status: 'UNMATCHED' }
      })
    }

    if (!body.tax_invoice_id) {
      return c.json({ success: false, error: 'tax_invoice_id 또는 action 필수' }, 400)
    }

    // Verify tax_invoice_id exists
    const taxInvoice = await db.prepare(`SELECT * FROM tax_invoices WHERE id = ?`).bind(body.tax_invoice_id).first()
    if (!taxInvoice) {
      return c.json({ success: false, error: '시스템 세금계산서 없음' }, 404)
    }

    // Update match
    await db.prepare(`
      UPDATE hometax_invoices SET matched_invoice_id = ?, match_status = 'MATCHED'
      WHERE id = ?
    `).bind(body.tax_invoice_id, parseInt(invoiceId)).run()

    return c.json({
      success: true,
      data: {
        id: parseInt(invoiceId),
        matched_invoice_id: body.tax_invoice_id,
        match_status: 'MATCHED'
      }
    })
  } catch (error) {
    console.error('hometaxInvoices POST /:id/match error:', error)
    console.error('src/routes/hometaxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /cert-popup — 인증 관리 팝업 URL
// ============================================================================
hometaxInvoicesRouter.get('/cert-popup', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const provider = await getProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '세금계산서 설정 미완료' }, 400)
    }

    const result = await provider.getHometaxCertPopupURL()

    return c.json({
      success: true,
      data: { url: result.url }
    })
  } catch (error) {
    console.error('hometaxInvoices GET /cert-popup error:', error)
    console.error('src/routes/hometaxInvoices.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default hometaxInvoicesRouter
