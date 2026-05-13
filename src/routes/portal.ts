// ============================================================================
// 고객 포털 API 라우트
// ============================================================================

import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { portalAuthMiddleware, createPortalToken } from '../middleware/portalAuth'
import type { PortalUser } from '../middleware/portalAuth'
import { hashPassword, verifyPassword } from '../utils/crypto'
import { authMiddleware, requireRole } from '../middleware/auth'

const portal = new Hono<HonoEnv>()

// 포털 비밀번호 검증 (PBKDF2 + 레거시 SHA-256 호환)
async function verifyPortalPassword(password: string, stored: string): Promise<boolean> {
  // 새로운 PBKDF2 해시
  if (stored.startsWith('pbkdf2:')) {
    return verifyPassword(password, stored)
  }
  // 레거시 SHA-256 (마이그레이션 전)
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password))
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex === stored
}

// ─── 인증 (미들웨어 없이) ──────────────────────────────────────────────────

portal.post('/auth/login', async (c) => {
  try {
    const { login_id, password } = await c.req.json()

    if (!login_id || !password) {
      return c.json({ success: false, error: '아이디와 비밀번호를 입력해주세요.' }, 400)
    }

    const account = await c.env.DB.prepare(`
      SELECT ca.*, cl.client_name as client_name
      FROM client_accounts ca
      JOIN clients cl ON ca.client_id = cl.id
      WHERE ca.login_id = ? AND ca.is_active = 1
    `).bind(login_id).first() as any

    if (!account) {
      return c.json({ success: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401)
    }

    // PBKDF2 해시 검증 (레거시 SHA-256 호환)
    const passwordValid = await verifyPortalPassword(password, account.password_hash)
    if (!passwordValid) {
      return c.json({ success: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401)
    }

    // 토큰 생성
    const token = await createPortalToken(c.env, {
      portal_client_id: account.client_id,
      client_account_id: account.id,
      client_name: account.client_name,
      contact_name: account.contact_name || '',
    })

    // 마지막 로그인 업데이트
    await c.env.DB.prepare(
      `UPDATE client_accounts SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(account.id).run()

    // 레거시 SHA-256 → PBKDF2 자동 마이그레이션
    if (!account.password_hash.startsWith('pbkdf2:')) {
      const hashedPassword = await hashPassword(password)
      await c.env.DB.prepare(
        `UPDATE client_accounts SET password_hash = ? WHERE id = ?`
      ).bind(hashedPassword, account.id).run()
    }

    // 접근 로그
    await c.env.DB.prepare(
      `INSERT INTO portal_access_logs (client_account_id, action, ip_address, user_agent, entity_id)
       VALUES (?, 'LOGIN', ?, ?, ?)`
    ).bind(account.id, c.req.header('CF-Connecting-IP') || '', c.req.header('User-Agent') || '', account.entity_id || 1).run()

    return c.json({
      success: true,
      data: {
        token,
        user: {
          client_id: account.client_id,
          client_name: account.client_name,
          contact_name: account.contact_name,
          contact_email: account.contact_email,
        }
      }
    })
  } catch (e) {
    console.error('src/routes/portal.ts error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 인증 필요 라우트 ────────────────────────────────────────────────────────

portal.use('/auth/me', portalAuthMiddleware)
portal.use('/auth/change-password', portalAuthMiddleware)
portal.use('/dashboard', portalAuthMiddleware)
portal.use('/orders', portalAuthMiddleware)
portal.use('/orders/*', portalAuthMiddleware)
// /balance 는 임시 토큰(?t=) 또는 포털 JWT 둘 다 허용
// 토큰 파라미터가 있으면 verify-token 로직으로 우회, 없으면 portalAuthMiddleware
portal.use('/balance', async (c, next) => {
  const t = c.req.query('t')
  if (t) {
    // 임시 토큰 모드: DB에서 직접 검증
    const row = await c.env.DB.prepare(`
      SELECT pat.client_id, pat.expires_at, cl.client_name as client_name
      FROM portal_access_tokens pat
      JOIN clients cl ON pat.client_id = cl.id
      WHERE pat.token = ?
    `).bind(t).first() as any

    if (!row || new Date(row.expires_at) <= new Date()) {
      return c.json({ success: false, error: '유효하지 않은 링크입니다.' }, 401)
    }

    // portalUser 형태로 context에 주입 (client_account_id 0: 임시 접근)
    c.set('portalUser' as any, {
      portal_client_id: row.client_id,
      client_account_id: 0,
      client_name: row.client_name,
      contact_name: '',
    } as PortalUser)
    return next()
  }
  return portalAuthMiddleware(c, next)
})
portal.use('/invoices', portalAuthMiddleware)
portal.use('/reorder', portalAuthMiddleware)

// GET /auth/me
portal.get('/auth/me', async (c) => {
  try {
    const user = (c as any).get('portalUser') as PortalUser
    const account = await c.env.DB.prepare(`
      SELECT ca.contact_name, ca.contact_phone, ca.contact_email, cl.client_name
      FROM client_accounts ca
      JOIN clients cl ON ca.client_id = cl.id
      WHERE ca.id = ?
    `).bind(user.client_account_id).first()
    return c.json({ success: true, data: account })
  } catch (e) {
    console.error('src/routes/portal.ts error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /auth/change-password
portal.post('/auth/change-password', async (c) => {
  try {
    const user = (c as any).get('portalUser') as PortalUser
    const { current_password, new_password } = await c.req.json()

    if (!new_password || new_password.length < 6) {
      return c.json({ success: false, error: '새 비밀번호는 6자 이상이어야 합니다.' }, 400)
    }

    // 현재 비밀번호 확인
    const account = await c.env.DB.prepare(
      `SELECT password_hash FROM client_accounts WHERE id = ?`
    ).bind(user.client_account_id).first() as any

    if (!account) {
      return c.json({ success: false, error: '계정을 찾을 수 없습니다.' }, 400)
    }

    const currentValid = await verifyPortalPassword(current_password, account.password_hash)
    if (!currentValid) {
      return c.json({ success: false, error: '현재 비밀번호가 올바르지 않습니다.' }, 400)
    }

    const newHash = await hashPassword(new_password)

    await c.env.DB.prepare(
      `UPDATE client_accounts SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(newHash, user.client_account_id).run()

    return c.json({ success: true })
  } catch (e) {
    console.error('src/routes/portal.ts error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 대시보드 ────────────────────────────────────────────────────────────────

portal.get('/dashboard', async (c) => {
  try {
    const user = (c as any).get('portalUser') as PortalUser
    const clientId = user.portal_client_id

    const [orderCount, recentOrders, balance] = await Promise.all([
      c.env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM orders WHERE client_id = ?`
      ).bind(clientId).first() as Promise<any>,
      c.env.DB.prepare(`
        SELECT id, order_number, order_date, status, total_amount
        FROM orders WHERE client_id = ?
        ORDER BY created_at DESC LIMIT 5
      `).bind(clientId).all(),
      c.env.DB.prepare(`
        SELECT SUM(balance) as total_balance
        FROM ledger WHERE client_id = ? AND balance > 0
      `).bind(clientId).first() as Promise<any>,
    ])

    return c.json({
      success: true,
      data: {
        totalOrders: orderCount?.cnt || 0,
        outstandingBalance: balance?.total_balance || 0,
        recentOrders: recentOrders.results || [],
      }
    })
  } catch (e) {
    console.error('src/routes/portal.ts error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 주문 목록 ──────────────────────────────────────────────────────────────

portal.get('/orders', async (c) => {
  try {
    const user = (c as any).get('portalUser') as PortalUser
    const { status, page } = c.req.query()
    const limit = 20
    const offset = ((Number(page) || 1) - 1) * limit

    let query = `
      SELECT
        o.id, o.order_number, o.order_date, o.due_date, o.status, o.total_amount, o.delivery_method,
        (SELECT COUNT(*) FROM cards WHERE order_id = o.id) as total_cards,
        (SELECT COUNT(*) FROM cards WHERE order_id = o.id AND status IN ('PRINT_DONE', 'SHIPPED')) as done_cards,
        (SELECT tracking_number FROM shipments WHERE order_id = o.id ORDER BY id DESC LIMIT 1) as tracking_number,
        (SELECT courier_name FROM shipments WHERE order_id = o.id ORDER BY id DESC LIMIT 1) as courier_name
      FROM orders o
      WHERE o.client_id = ?`
    const params: any[] = [user.portal_client_id]

    if (status) {
      query += ` AND o.status = ?`
      params.push(status)
    }
    query += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM orders WHERE client_id = ?`
    ).bind(user.portal_client_id).first() as any

    return c.json({ success: true, data: { orders: results, total: countResult?.cnt || 0 } })
  } catch (e) {
    console.error('src/routes/portal.ts error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 주문 상세 ──────────────────────────────────────────────────────────────

portal.get('/orders/:id', async (c) => {
  try {
    const user = (c as any).get('portalUser') as PortalUser
    const orderId = Number(c.req.param('id'))

    const order = await c.env.DB.prepare(
      `SELECT * FROM orders WHERE id = ? AND client_id = ?`
    ).bind(orderId, user.portal_client_id).first()

    if (!order) return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)

    const [itemsResult, shipmentsResult, cardProgressResult] = await Promise.all([
      c.env.DB.prepare(
        `SELECT * FROM order_items WHERE order_id = ? ORDER BY sort_order`
      ).bind(orderId).all(),
      c.env.DB.prepare(`
        SELECT id, tracking_number, courier_name, delivery_type, status as shipment_status,
               shipped_at, receiver_address, box_count, label_count
        FROM shipments WHERE order_id = ? ORDER BY id DESC
      `).bind(orderId).all(),
      c.env.DB.prepare(`
        SELECT status, COUNT(*) as cnt FROM cards WHERE order_id = ? GROUP BY status
      `).bind(orderId).all(),
    ])

    // card_progress 집계
    const cardRows = cardProgressResult.results as Array<{ status: string; cnt: number }>
    const cardProgress = {
      total: cardRows.reduce((sum, r) => sum + Number(r.cnt), 0),
      printing: cardRows
        .filter(r => !['PRINT_DONE', 'SHIPPED'].includes(r.status))
        .reduce((sum, r) => sum + Number(r.cnt), 0),
      done: Number(cardRows.find(r => r.status === 'PRINT_DONE')?.cnt || 0),
      shipped: Number(cardRows.find(r => r.status === 'SHIPPED')?.cnt || 0),
    }

    return c.json({
      success: true,
      data: {
        order,
        items: itemsResult.results,
        shipments: shipmentsResult.results,
        card_progress: cardProgress,
      }
    })
  } catch (e) {
    console.error('src/routes/portal.ts error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 미수금 잔액 ────────────────────────────────────────────────────────────

portal.get('/balance', async (c) => {
  try {
    const user = (c as any).get('portalUser') as PortalUser

    const { results } = await c.env.DB.prepare(`
      SELECT l.id, l.order_id, l.total_amount, l.paid_amount, l.balance, l.billing_date,
             o.order_number
      FROM ledger l
      LEFT JOIN orders o ON l.order_id = o.id
      WHERE l.client_id = ? AND l.balance > 0
      ORDER BY l.billing_date DESC
    `).bind(user.portal_client_id).all()

    const total = await c.env.DB.prepare(
      `SELECT SUM(balance) as total FROM ledger WHERE client_id = ? AND balance > 0`
    ).bind(user.portal_client_id).first() as any

    return c.json({ success: true, data: { items: results, totalBalance: total?.total || 0 } })
  } catch (e) {
    console.error('src/routes/portal.ts error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 세금계산서 ─────────────────────────────────────────────────────────────

portal.get('/invoices', async (c) => {
  try {
    const user = (c as any).get('portalUser') as PortalUser

    const { results } = await c.env.DB.prepare(`
      SELECT id, invoice_number, issue_date, supply_amount, tax_amount, total_amount, status
      FROM tax_invoices
      WHERE buyer_client_id = ?
      ORDER BY issue_date DESC LIMIT 50
    `).bind(user.portal_client_id).all()

    return c.json({ success: true, data: results })
  } catch (e) {
    console.error('src/routes/portal.ts error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 재주문 요청 ────────────────────────────────────────────────────────────

portal.post('/reorder', async (c) => {
  try {
    const user = (c as any).get('portalUser') as PortalUser
    const { reference_order_id, description, file_urls } = await c.req.json()

    // 참조 주문이 해당 거래처 것인지 확인
    if (reference_order_id) {
      const order = await c.env.DB.prepare(
        `SELECT id FROM orders WHERE id = ? AND client_id = ?`
      ).bind(reference_order_id, user.portal_client_id).first()
      if (!order) return c.json({ success: false, error: '해당 주문을 찾을 수 없습니다.' }, 404)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO portal_reorder_requests (client_account_id, client_id, reference_order_id, description, file_urls)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      user.client_account_id, user.portal_client_id,
      reference_order_id || null, description || null,
      file_urls ? JSON.stringify(file_urls) : null
    ).run()

    return c.json({ success: true, data: { id: result.meta?.last_row_id } })
  } catch (e) {
    console.error('src/routes/portal.ts error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 임시 접근 토큰 (알림톡 링크용) ─────────────────────────────────────────

// POST /api/portal/generate-token — ADMIN/MANAGER 전용
portal.post('/generate-token', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json()
    const clientId = Number(body.client_id)
    const expiresDays = Number(body.expires_days) || 7

    if (!clientId || isNaN(clientId)) {
      return c.json({ success: false, error: 'client_id가 필요합니다.' }, 400)
    }

    // 거래처 존재 확인
    const client = await c.env.DB.prepare(
      `SELECT id, client_name FROM clients WHERE id = ?`
    ).bind(clientId).first() as any

    if (!client) {
      return c.json({ success: false, error: '존재하지 않는 거래처입니다.' }, 404)
    }

    const user = (c as any).get('user') as any
    const createdBy = user?.id || 0

    // 사이트 기본 URL (settings에서 조회, 없으면 요청 origin 사용)
    const siteUrlSetting = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'site_base_url'`
    ).first() as any
    const baseUrl = siteUrlSetting?.setting_value || new URL(c.req.url).origin

    const { token, url, expiresAt } = await generatePortalToken(c.env.DB, clientId, createdBy, baseUrl, expiresDays)

    return c.json({
      success: true,
      data: {
        token,
        url,
        expires_at: expiresAt,
        client_name: client.client_name,
      }
    })
  } catch (e) {
    console.error('src/routes/portal.ts generate-token error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/portal/verify-token?t=xxx — 공개 API (미들웨어 없음)
portal.get('/verify-token', async (c) => {
  try {
    const t = c.req.query('t')
    if (!t) {
      return c.json({ success: false, error: '토큰이 필요합니다.' }, 400)
    }

    const row = await c.env.DB.prepare(`
      SELECT pat.client_id, pat.expires_at, cl.client_name as client_name
      FROM portal_access_tokens pat
      JOIN clients cl ON pat.client_id = cl.id
      WHERE pat.token = ?
    `).bind(t).first() as any

    if (!row) {
      return c.json({ success: false, error: '유효하지 않은 링크입니다.' })
    }

    // 만료 확인
    if (new Date(row.expires_at) <= new Date()) {
      return c.json({ success: false, error: '링크가 만료되었습니다.' })
    }

    return c.json({
      success: true,
      data: {
        client_id: row.client_id,
        client_name: row.client_name,
      }
    })
  } catch (e) {
    console.error('src/routes/portal.ts verify-token error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 토큰 생성 유틸리티 (메시지 발송 등 외부에서 재사용 가능) ────────────────
export async function generatePortalToken(
  db: D1Database,
  clientId: number,
  userId: number,
  baseUrl: string,
  expiresDays: number = 7,
  metadata?: Record<string, any>
): Promise<{ token: string; url: string; expiresAt: string }> {
  const token = crypto.randomUUID().replace(/-/g, '')

  const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19)

  await db.prepare(`
    INSERT INTO portal_access_tokens (token, client_id, expires_at, created_by, metadata)
    VALUES (?, ?, ?, ?, ?)
  `).bind(token, clientId, expiresAt, userId, metadata ? JSON.stringify(metadata) : null).run()

  const url = `${baseUrl}/portal/balance?t=${token}`

  return { token, url, expiresAt }
}

// POST /verify-document — 사업자등록번호 인증 후 거래 문서 반환
portal.post('/verify-document', async (c) => {
  try {
    const { token, brn } = await c.req.json() as { token: string; brn: string }

    if (!token || !brn) {
      return c.json({ success: false, error: '토큰과 사업자등록번호가 필요합니다.' }, 400)
    }

    // 토큰 검증 (metadata 포함)
    const row = await c.env.DB.prepare(`
      SELECT pat.client_id, pat.expires_at, pat.metadata,
             cl.client_name, cl.business_registration_number
      FROM portal_access_tokens pat
      JOIN clients cl ON pat.client_id = cl.id
      WHERE pat.token = ?
    `).bind(token).first() as any

    if (!row) {
      return c.json({ success: false, error: '유효하지 않은 링크입니다.' }, 410)
    }
    if (new Date(row.expires_at) <= new Date()) {
      return c.json({ success: false, error: '링크가 만료되었습니다.' }, 410)
    }

    // 사업자등록번호 대조
    const storedBrn = (row.business_registration_number || '').replace(/[^0-9]/g, '')
    const inputBrn = brn.replace(/[^0-9]/g, '')
    if (!storedBrn || storedBrn !== inputBrn) {
      return c.json({ success: false, error: '사업자등록번호가 일치하지 않습니다.' }, 403)
    }

    const clientId = row.client_id

    // metadata에서 type, order_id, period 결정
    let meta: Record<string, any> = {}
    try { meta = row.metadata ? JSON.parse(row.metadata) : {} } catch (_) {}
    const type = meta.type || 'ledger'
    const order_id = meta.order_id || null
    const periodStart = meta.period_start || null
    const periodEnd = meta.period_end || null

    if (type === 'invoice') {
      // 거래명세서: metadata의 order_id로 특정 주문 조회
      const orderQuery = order_id
        ? `SELECT id, order_number, final_amount, total_amount, vat_amount, discount_amount, billed_amount, order_date
           FROM orders WHERE id = ? AND client_id = ? AND status != 'CANCELLED'`
        : `SELECT id, order_number, final_amount, total_amount, vat_amount, discount_amount, billed_amount, order_date
           FROM orders WHERE client_id = ? AND status NOT IN ('CANCELLED','DRAFT')
           ORDER BY created_at DESC LIMIT 1`
      const orderParams = order_id ? [order_id, clientId] : [clientId]
      const order = await c.env.DB.prepare(orderQuery).bind(...orderParams).first() as any

      if (!order) {
        return c.json({ success: true, data: { client_name: row.client_name, order_number: '', items: [], total_amount: 0 } })
      }

      const { results: items } = await c.env.DB.prepare(`
        SELECT item_name, width, height, quantity, unit, unit_price, amount
        FROM order_items WHERE order_id = ? AND parent_item_id IS NULL ORDER BY sort_order
      `).bind(order.id).all() as any

      const invoiceItems = (items || []).map((i: any) => ({
        item_name: i.item_name,
        spec: (i.width && i.height) ? `${i.width}x${i.height}cm` : '',
        quantity: i.quantity,
        unit_price: i.unit_price,
        amount: i.amount
      }))

      return c.json({
        success: true,
        data: {
          doc_type: 'invoice',
          client_name: row.client_name,
          order_number: order.order_number,
          order_date: order.order_date,
          items: invoiceItems,
          total_amount: order.final_amount || 0,
          vat_amount: order.vat_amount || 0,
          supply_amount: order.total_amount || 0,
          discount_amount: order.discount_amount || 0
        }
      })
    } else {
      // 원장: metadata에 기간이 있으면 해당 기간, 없으면 최근 6개월
      const defaultStart = new Date(Date.now() - 180 * 86400000).toISOString().substring(0, 10)
      const defaultEnd = new Date().toISOString().substring(0, 10)
      const sixMonthsAgo = periodStart || defaultStart
      const today = periodEnd || defaultEnd

      const { results: orders } = await c.env.DB.prepare(`
        SELECT order_number, created_at, billed_amount, final_amount, billing_status
        FROM orders WHERE client_id = ? AND status != 'CANCELLED' AND date(created_at) >= ?
        ORDER BY created_at ASC
      `).bind(clientId, sixMonthsAgo).all() as any

      const { results: payments } = await c.env.DB.prepare(`
        SELECT payment_date, amount, payment_method
        FROM payments WHERE client_id = ? AND date(payment_date) >= ?
        ORDER BY payment_date ASC
      `).bind(clientId, sixMonthsAgo).all() as any

      const { results: adjustments } = await c.env.DB.prepare(`
        SELECT created_at, amount, reason, type
        FROM adjustments WHERE client_id = ? AND date(created_at) >= ?
        ORDER BY created_at ASC
      `).bind(clientId, sixMonthsAgo).all() as any

      const transactions = [
        ...(orders as any[]).map((o: any) => ({
          type: 'order', date: (o.created_at || '').substring(0, 10),
          description: o.order_number,
          debit: o.billing_status === 'BILLED' ? (o.billed_amount || o.final_amount || 0) : (o.final_amount || 0),
          credit: 0
        })),
        ...(payments as any[]).map((p: any) => ({
          type: 'payment', date: p.payment_date,
          description: p.payment_method || '입금',
          debit: 0, credit: p.amount || 0
        })),
        ...(adjustments as any[]).map((a: any) => ({
          type: 'adjustment', date: (a.created_at || '').substring(0, 10),
          description: a.reason || a.type || '조정',
          debit: 0, credit: a.amount || 0
        }))
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      let balance = 0
      const txWithBalance = transactions.map(t => {
        balance += t.debit - t.credit
        return { ...t, balance }
      })

      const totalDebit = txWithBalance.reduce((s, t) => s + t.debit, 0)
      const totalCredit = txWithBalance.reduce((s, t) => s + t.credit, 0)

      return c.json({
        success: true,
        data: {
          doc_type: 'ledger',
          client_name: row.client_name,
          period: `${sixMonthsAgo} ~ ${today}`,
          transactions: txWithBalance,
          summary: { total_debit: totalDebit, total_credit: totalCredit, balance }
        }
      })
    }
  } catch (error) {
    console.error('Portal verify-document error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default portal
