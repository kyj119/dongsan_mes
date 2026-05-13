import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { PopbillProvider } from '../services/popbillProvider'
import { getEntityId, entityFilter } from '../utils/entityFilter'

interface CashReceiptRow {
  id: number; receipt_number: string; status: string; trade_date: string;
  trade_type: string; identity_number: string; item_name: string | null;
  supply_amount: number; tax_amount: number; service_amount: number;
  total_amount: number; nts_approval_number: string | null;
  [key: string]: unknown
}

const cashReceiptsRouter = new Hono<HonoEnv>()
cashReceiptsRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// ────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼: 관리번호 채번 (CR-YYYY-NNNN)
// ────────────────────────────────────────────────────────────────────────────
async function generateReceiptNumber(db: D1Database): Promise<string> {
  const year = new Date().getFullYear()
  const lastRow = await db.prepare(
    `SELECT receipt_number FROM cash_receipts WHERE receipt_number LIKE ? ORDER BY receipt_number DESC LIMIT 1`
  ).bind(`CR-${year}-%`).first<{ receipt_number: string }>()
  let nextSeq = 1
  if (lastRow?.receipt_number) {
    const parts = lastRow.receipt_number.split('-')
    nextSeq = Number(parts[parts.length - 1]) + 1
  }
  return `CR-${year}-${String(nextSeq).padStart(4, '0')}`
}

// ────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼: 회사 설정 조회 (entities 테이블 우선)
// ────────────────────────────────────────────────────────────────────────────
import { getEntityCompanyInfo } from '../utils/entitySettings'

async function getCompanySettings(db: D1Database, entityId?: number): Promise<Record<string, string>> {
  if (entityId && entityId > 0) {
    return getEntityCompanyInfo(db, entityId)
  }
  const { results: settingRows } = await db.prepare(
    `SELECT setting_key, setting_value FROM settings
     WHERE setting_key IN (
       'company_name', 'company_business_registration_number',
       'company_representative', 'company_address',
       'company_business_type', 'company_business_item'
     )`
  ).all()
  const settings: Record<string, string> = {}
  for (const row of settingRows as Array<{ setting_key: string; setting_value: string }>) {
    settings[row.setting_key] = row.setting_value || ''
  }
  return settings
}

// ────────────────────────────────────────────────────────────────────────────
// GET / — List cash receipts (paginated)
// ────────────────────────────────────────────────────────────────────────────
cashReceiptsRouter.get('/', async (c) => {
  try {
    const { page = '1', limit = '50', status = '', search = '', date_from = '', date_to = '' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 50, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    let query = `
      SELECT
        cr.*,
        cl.client_name
      FROM cash_receipts cr
      LEFT JOIN clients cl ON cr.client_id = cl.id
    `
    const params: any[] = []
    const whereClauses: string[] = []
    const ef = entityFilter(c, 'cr')

    if (status) {
      whereClauses.push('cr.status = ?')
      params.push(status)
    }
    if (search) {
      whereClauses.push('(cr.receipt_number LIKE ? OR cl.client_name LIKE ? OR cr.identity_number LIKE ?)')
      const p = `%${search}%`
      params.push(p, p, p)
    }
    if (date_from) {
      whereClauses.push('cr.trade_date >= ?')
      params.push(date_from)
    }
    if (date_to) {
      whereClauses.push('cr.trade_date <= ?')
      params.push(date_to)
    }
    if (ef.clause) {
      whereClauses.push(ef.clause.replace(' AND ', ''))
      params.push(...ef.params)
    }

    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ')
    }
    query += ' ORDER BY cr.created_at DESC LIMIT ? OFFSET ?'
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // Count total
    let countQuery = `
      SELECT COUNT(*) as count
      FROM cash_receipts cr
      LEFT JOIN clients cl ON cr.client_id = cl.id
    `
    const countParams: any[] = []
    const countWhereClauses: string[] = []

    if (status) {
      countWhereClauses.push('cr.status = ?')
      countParams.push(status)
    }
    if (search) {
      countWhereClauses.push('(cr.receipt_number LIKE ? OR cl.client_name LIKE ? OR cr.identity_number LIKE ?)')
      const p = `%${search}%`
      countParams.push(p, p, p)
    }
    if (date_from) {
      countWhereClauses.push('cr.trade_date >= ?')
      countParams.push(date_from)
    }
    if (date_to) {
      countWhereClauses.push('cr.trade_date <= ?')
      countParams.push(date_to)
    }
    if (ef.clause) {
      countWhereClauses.push(ef.clause.replace(' AND ', ''))
      countParams.push(...ef.params)
    }

    if (countWhereClauses.length > 0) {
      countQuery += ' WHERE ' + countWhereClauses.join(' AND ')
    }

    const countRow = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ count: number }>()
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
    console.error('src/routes/cashReceipts.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /:id — Get single cash receipt
// ────────────────────────────────────────────────────────────────────────────
cashReceiptsRouter.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))

    const receipt = await c.env.DB.prepare(`
      SELECT cr.*, cl.client_name
      FROM cash_receipts cr
      LEFT JOIN clients cl ON cr.client_id = cl.id
      WHERE cr.id = ?
    `).bind(id).first()

    if (!receipt) {
      return c.json({ success: false, error: '현금영수증을 찾을 수 없습니다.' }, 404)
    }

    return c.json({ success: true, data: receipt })
  } catch (error) {
    console.error('src/routes/cashReceipts.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST / — Create new cash receipt (DRAFT status)
// ────────────────────────────────────────────────────────────────────────────
cashReceiptsRouter.post('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json<{
      client_id?: number
      order_id?: number
      trade_date: string
      identity_type: string
      identity_number: string
      supply_amount: number
      tax_amount: number
      total_amount: number
      service_amount?: number
      item_name?: string
      receipt_type?: string
      trade_type?: string
      notes?: string
    }>()

    if (!body.trade_date) {
      return c.json({ success: false, error: 'trade_date는 필수입니다.' }, 400)
    }
    if (!body.identity_type) {
      return c.json({ success: false, error: 'identity_type은 필수입니다.' }, 400)
    }
    if (!body.identity_number) {
      return c.json({ success: false, error: 'identity_number는 필수입니다.' }, 400)
    }

    const receiptNumber = await generateReceiptNumber(c.env.DB)
    const receiptType = body.receipt_type || 'EXPENSE'
    const tradeType = body.trade_type || 'CONSUMER'
    const serviceAmount = body.service_amount || 0

    const result = await c.env.DB.prepare(`
      INSERT INTO cash_receipts (
        receipt_number, receipt_type, trade_type,
        identity_type, identity_number,
        client_id, order_id,
        trade_date, supply_amount, tax_amount, total_amount,
        service_amount, item_name,
        status, notes,
        entity_id,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        'DRAFT', ?,
        ?,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).bind(
      receiptNumber, receiptType, tradeType,
      body.identity_type, body.identity_number,
      body.client_id || null, body.order_id || null,
      body.trade_date, body.supply_amount, body.tax_amount, body.total_amount,
      serviceAmount, body.item_name || null,
      body.notes || null,
      getEntityId(c)
    ).run()

    const receiptId = result.meta.last_row_id

    const created = await c.env.DB.prepare(`
      SELECT cr.*, cl.client_name
      FROM cash_receipts cr
      LEFT JOIN clients cl ON cr.client_id = cl.id
      WHERE cr.id = ?
    `).bind(receiptId).first()

    return c.json({ success: true, data: created }, 201)
  } catch (error) {
    console.error('src/routes/cashReceipts.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /:id/issue — Issue cash receipt (DRAFT -> ISSUED)
// ────────────────────────────────────────────────────────────────────────────
cashReceiptsRouter.post('/:id/issue', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const user = c.get('user')

    const existing = await c.env.DB.prepare(
      'SELECT * FROM cash_receipts WHERE id = ?'
    ).bind(id).first<CashReceiptRow>()

    if (!existing) {
      return c.json({ success: false, error: '현금영수증을 찾을 수 없습니다.' }, 404)
    }
    if (existing.status !== 'DRAFT') {
      return c.json({ success: false, error: '임시저장 상태의 현금영수증만 발행할 수 있습니다.' }, 400)
    }

    // 팝빌 연동 확인
    const linkedIdSetting = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_provider_linked_id'`
    ).first<{ setting_value: string }>()
    const secretKey = c.env.POPBILL_SECRET_KEY
    const linkedId = linkedIdSetting?.setting_value

    if (linkedId && secretKey) {
      const testModeSetting = await c.env.DB.prepare(
        `SELECT setting_value FROM settings WHERE setting_key = 'tax_test_mode'`
      ).first<{ setting_value: string }>()
      const isTestMode = testModeSetting?.setting_value === '1'

      const settings = await getCompanySettings(c.env.DB, getEntityId(c))
      const brn = (settings.company_business_registration_number || '').replace(/-/g, '')

      if (!brn) {
        return c.json({ success: false, error: '사업자등록번호가 설정되어 있지 않습니다.' }, 400)
      }

      const provider = new PopbillProvider({
        linkedId,
        secretKey,
        supplierBRN: brn,
        isTest: isTestMode
      })

      // mgtKey 생성: receipt_number (팝빌에 전송할 관리번호)
      const mgtKey = existing.receipt_number
      const tradeDate = existing.trade_date.replace(/-/g, '') // YYYYMMDD 형식

      const issuePayload = {
        mgtKey,
        tradeDate,
        tradeType: existing.trade_type === 'CONSUMER' ? '승인거래' : '승인거래',
        identityNum: existing.identity_number,
        itemName: existing.item_name || '상품',
        supplyCost: existing.supply_amount,
        tax: existing.tax_amount,
        serviceFee: existing.service_amount || 0,
        totalAmount: existing.total_amount,
        franchiseCorpNum: brn,
        franchiseCorpName: settings.company_name || '',
        franchiseCEOName: settings.company_representative || '',
        smssendYN: false
      }

      const issueResult = await provider.issueCashReceipt(issuePayload)

      if (issueResult.success) {
        // 발행 성공
        await c.env.DB.prepare(`
          UPDATE cash_receipts
          SET status = 'ISSUED',
              provider_name = 'popbill',
              provider_response = ?,
              nts_approval_number = ?,
              issued_by = ?,
              issued_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          issueResult.rawResponse || null,
          issueResult.ntsApprovalNumber || null,
          user.id,
          id
        ).run()
      } else {
        // 발행 실패
        await c.env.DB.prepare(`
          UPDATE cash_receipts
          SET status = 'FAILED',
              provider_name = 'popbill',
              provider_response = ?,
              nts_result_code = ?,
              nts_result_message = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          issueResult.rawResponse || null,
          issueResult.errorCode || null,
          issueResult.errorMessage || null,
          id
        ).run()

        return c.json({
          success: false,
          error: `팝빌 발행 실패: ${issueResult.errorMessage || 'Unknown'}`,
          data: { providerError: issueResult }
        }, 400)
      }
    } else {
      // 팝빌 미설정 → 로컬 발행만
      await c.env.DB.prepare(`
        UPDATE cash_receipts
        SET status = 'ISSUED',
            issued_by = ?,
            issued_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(user.id, id).run()
    }

    const updated = await c.env.DB.prepare(`
      SELECT cr.*, cl.client_name
      FROM cash_receipts cr
      LEFT JOIN clients cl ON cr.client_id = cl.id
      WHERE cr.id = ?
    `).bind(id).first()

    return c.json({ success: true, data: updated })
  } catch (error) {
    console.error('src/routes/cashReceipts.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /:id/cancel — Cancel issued cash receipt
// ────────────────────────────────────────────────────────────────────────────
cashReceiptsRouter.post('/:id/cancel', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const body = await c.req.json<{
      cancel_reason?: string
    }>()

    const existing = await c.env.DB.prepare(
      'SELECT * FROM cash_receipts WHERE id = ?'
    ).bind(id).first<CashReceiptRow>()

    if (!existing) {
      return c.json({ success: false, error: '현금영수증을 찾을 수 없습니다.' }, 404)
    }
    if (!['ISSUED', 'NTS_SUCCESS'].includes(existing.status)) {
      return c.json({ success: false, error: '발행 완료 상태의 현금영수증만 취소할 수 있습니다.' }, 400)
    }
    if (!existing.nts_approval_number) {
      return c.json({ success: false, error: '국세청 승인번호가 없어 취소할 수 없습니다.' }, 400)
    }

    // 팝빌 연동 확인
    const linkedIdSetting = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_provider_linked_id'`
    ).first<{ setting_value: string }>()
    const secretKey = c.env.POPBILL_SECRET_KEY
    const linkedId = linkedIdSetting?.setting_value

    if (linkedId && secretKey) {
      const testModeSetting = await c.env.DB.prepare(
        `SELECT setting_value FROM settings WHERE setting_key = 'tax_test_mode'`
      ).first<{ setting_value: string }>()
      const isTestMode = testModeSetting?.setting_value === '1'

      const settings = await getCompanySettings(c.env.DB, getEntityId(c))
      const brn = (settings.company_business_registration_number || '').replace(/-/g, '')

      if (!brn) {
        return c.json({ success: false, error: '사업자등록번호가 설정되어 있지 않습니다.' }, 400)
      }

      const provider = new PopbillProvider({
        linkedId,
        secretKey,
        supplierBRN: brn,
        isTest: isTestMode
      })

      // 취소 처리
      const cancelMgtKey = existing.receipt_number + '-C'
      const tradeDate = existing.trade_date.replace(/-/g, '') // YYYYMMDD 형식

      const cancelResult = await provider.cancelCashReceipt(
        cancelMgtKey,
        existing.nts_approval_number,
        tradeDate
      )

      if (!cancelResult.success) {
        return c.json({
          success: false,
          error: `팝빌 취소 실패: ${cancelResult.errorMessage || 'Unknown'}`,
          data: { providerError: cancelResult }
        }, 400)
      }
    }

    // 상태 업데이트
    await c.env.DB.prepare(`
      UPDATE cash_receipts
      SET status = 'CANCELLED',
          cancelled_at = CURRENT_TIMESTAMP,
          cancel_reason = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(body.cancel_reason || null, id).run()

    const updated = await c.env.DB.prepare(`
      SELECT cr.*, cl.client_name
      FROM cash_receipts cr
      LEFT JOIN clients cl ON cr.client_id = cl.id
      WHERE cr.id = ?
    `).bind(id).first()

    return c.json({ success: true, data: updated })
  } catch (error) {
    console.error('src/routes/cashReceipts.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /:id/refresh-status — Refresh status from Popbill
// ────────────────────────────────────────────────────────────────────────────
cashReceiptsRouter.post('/:id/refresh-status', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))

    const existing = await c.env.DB.prepare(
      'SELECT * FROM cash_receipts WHERE id = ?'
    ).bind(id).first<CashReceiptRow>()

    if (!existing) {
      return c.json({ success: false, error: '현금영수증을 찾을 수 없습니다.' }, 404)
    }

    // 팝빌 연동 확인
    const linkedIdSetting = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_provider_linked_id'`
    ).first<{ setting_value: string }>()
    const secretKey = c.env.POPBILL_SECRET_KEY
    const linkedId = linkedIdSetting?.setting_value

    if (!linkedId || !secretKey) {
      return c.json({
        success: false,
        error: '팝빌이 설정되어 있지 않습니다.'
      }, 400)
    }

    const testModeSetting = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_test_mode'`
    ).first<{ setting_value: string }>()
    const isTestMode = testModeSetting?.setting_value === '1'

    const settings = await getCompanySettings(c.env.DB, getEntityId(c))
    const brn = (settings.company_business_registration_number || '').replace(/-/g, '')

    if (!brn) {
      return c.json({ success: false, error: '사업자등록번호가 설정되어 있지 않습니다.' }, 400)
    }

    const provider = new PopbillProvider({
      linkedId,
      secretKey,
      supplierBRN: brn,
      isTest: isTestMode
    })

    // 상태 조회
    const statusResult = await provider.getCashReceiptStatus(existing.receipt_number)

    // stateCode 매핑 (팝빌 상태코드)
    let mappedStatus = existing.status
    if (statusResult.status) {
      // 팝빌 API 상태코드 매핑 (예: 1=승인, 0=취소 등)
      const stateCode = Number(statusResult.status)
      if (stateCode === 1) {
        mappedStatus = 'ISSUED'
      } else if (stateCode === 2) {
        mappedStatus = 'NTS_SUCCESS'
      } else if (stateCode === 3) {
        mappedStatus = 'CANCELLED'
      }
    }

    // 상태 업데이트
    await c.env.DB.prepare(`
      UPDATE cash_receipts
      SET status = ?,
          provider_response = ?,
          nts_approval_number = COALESCE(?, nts_approval_number),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      mappedStatus,
      statusResult.rawResponse || null,
      statusResult.ntsApproval || null,
      id
    ).run()

    const updated = await c.env.DB.prepare(`
      SELECT cr.*, cl.client_name
      FROM cash_receipts cr
      LEFT JOIN clients cl ON cr.client_id = cl.id
      WHERE cr.id = ?
    `).bind(id).first()

    return c.json({ success: true, data: updated })
  } catch (error) {
    console.error('src/routes/cashReceipts.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /:id/print-url — Get print URL
// ────────────────────────────────────────────────────────────────────────────
cashReceiptsRouter.get('/:id/print-url', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))

    const existing = await c.env.DB.prepare(
      'SELECT * FROM cash_receipts WHERE id = ?'
    ).bind(id).first<CashReceiptRow>()

    if (!existing) {
      return c.json({ success: false, error: '현금영수증을 찾을 수 없습니다.' }, 404)
    }

    // 팝빌 연동 확인
    const linkedIdSetting = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_provider_linked_id'`
    ).first<{ setting_value: string }>()
    const secretKey = c.env.POPBILL_SECRET_KEY
    const linkedId = linkedIdSetting?.setting_value

    if (!linkedId || !secretKey) {
      return c.json({
        success: false,
        error: '팝빌이 설정되어 있지 않습니다.'
      }, 400)
    }

    const testModeSetting = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_test_mode'`
    ).first<{ setting_value: string }>()
    const isTestMode = testModeSetting?.setting_value === '1'

    const settings = await getCompanySettings(c.env.DB, getEntityId(c))
    const brn = (settings.company_business_registration_number || '').replace(/-/g, '')

    if (!brn) {
      return c.json({ success: false, error: '사업자등록번호가 설정되어 있지 않습니다.' }, 400)
    }

    const provider = new PopbillProvider({
      linkedId,
      secretKey,
      supplierBRN: brn,
      isTest: isTestMode
    })

    // 인쇄 URL 조회
    const printResult = await provider.getCashReceiptPrintURL(existing.receipt_number)

    return c.json({ success: true, data: { url: printResult.url } })
  } catch (error) {
    console.error('src/routes/cashReceipts.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// DELETE /:id — Delete draft cash receipt
// ────────────────────────────────────────────────────────────────────────────
cashReceiptsRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))

    const existing = await c.env.DB.prepare(
      'SELECT id, status FROM cash_receipts WHERE id = ?'
    ).bind(id).first<{ id: number; status: string }>()

    if (!existing) {
      return c.json({ success: false, error: '현금영수증을 찾을 수 없습니다.' }, 404)
    }
    if (existing.status !== 'DRAFT') {
      return c.json({ success: false, error: '임시저장 상태의 현금영수증만 삭제할 수 있습니다.' }, 400)
    }

    await c.env.DB.prepare('DELETE FROM cash_receipts WHERE id = ?').bind(id).run()

    return c.json({ success: true, data: { id } })
  } catch (error) {
    console.error('src/routes/cashReceipts.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default cashReceiptsRouter
