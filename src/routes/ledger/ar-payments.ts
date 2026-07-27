/**
 * ledger/ar-payments.ts — 입금/감액 라우트 (accounts-receivable.ts에서 분리, 2026-06-12 대형파일 분할 2/5)
 *
 * 입금 등록/조회/수정/삭제(payment) · 입금내역(payments) · 감액 등록/이력/삭제(adjustment).
 * 배럴(accounts-receivable.ts)에서 마운트. ⚠️ 이동만, 로직 수정 0.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { requireEditOrRole } from '../../middleware/permissions'
import { createPayment } from '../../lib/payments'
import { logActivity } from '../../utils/activityLog'
import { notifyRoles } from '../../utils/notify'
import { getEntityId, entityFilter } from '../../utils/entityFilter'
import { deriveClientBalance, type PaymentRow, type AdjustmentRow } from './ar-helpers'

const arPaymentsRouter = new Hono<HonoEnv>()
arPaymentsRouter.use('/*', authMiddleware, requireEditOrRole('/ledger', 'MANAGER'))

// Record payment (입금 등록 - MANAGER+)
arPaymentsRouter.post('/payment', requireEditOrRole('/ledger', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const paymentData = await c.req.json()

    // Validate required fields
    if (!paymentData.client_id || !paymentData.amount || !paymentData.payment_date) {
      return c.json({
        success: false,
        error: 'client_id, amount, payment_date 필수'
      }, 400)
    }

    if (paymentData.amount <= 0) {
      return c.json({
        success: false,
        error: '입금액은 0보다 커야 합니다'
      }, 400)
    }

    // createPayment 공유 함수 사용 (client 존재 확인 + INSERT + balance 차감 포함)
    let result: { payment_id: number; new_balance: number }
    try {
      result = await createPayment(c.env.DB, {
        client_id: paymentData.client_id,
        payment_date: paymentData.payment_date,
        amount: parseFloat(paymentData.amount),
        payment_method: paymentData.payment_method,
        reference_number: paymentData.reference_number,
        notes: paymentData.notes,
        created_by: user?.id || 1,
        entity_id: getEntityId(c) || 1,
      })
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Client not found')) {
        return c.json({ success: false, error: 'Client not found' }, 404)
      }
      throw err
    }

    const clientRow = await c.env.DB.prepare('SELECT client_name FROM clients WHERE id = ?').bind(paymentData.client_id).first<{ client_name: string }>()

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'CREATE', entityType: 'PAYMENT', entityId: result.payment_id,
      entityLabel: clientRow?.client_name || String(paymentData.client_id),
      details: JSON.stringify({ amount: parseFloat(paymentData.amount), method: paymentData.payment_method || null }),
      actorEntityId: getEntityId(c)
    })

    await notifyRoles(c.env.DB, ['ADMIN', 'MANAGER'], '입금 등록', `${clientRow?.client_name || ''} - ${Number(paymentData.amount).toLocaleString()}원 입금`, '/ledger')

    return c.json({
      success: true,
      data: {
        id: result.payment_id,
        new_balance: await deriveClientBalance(c, paymentData.client_id)  // split billing P3: 파생
      },
      message: '입금이 등록되었습니다'
    })
  } catch (error) {
    console.error('Record payment error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get single payment (단일 입금 조회)
arPaymentsRouter.get('/payment/:id', async (c) => {
  try {
    const id = c.req.param('id')
    // #398: 타 법인 입금 단건 열람 IDOR 방지 — PUT/DELETE/list(#333)와 동일 entity 스코프
    const efPay = entityFilter(c, 'p')
    const payment = await c.env.DB.prepare(`
      SELECT p.*, c.client_name, u.name as created_by_name
      FROM payments p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ?${efPay.clause}
    `).bind(id, ...efPay.params).first()

    if (!payment) {
      return c.json({ success: false, error: '입금 내역을 찾을 수 없습니다' }, 404)
    }

    return c.json({ success: true, data: payment })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Update payment (입금 수정 - MANAGER+)
arPaymentsRouter.put('/payment/:id', requireEditOrRole('/ledger', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()

    // Get existing payment (entity 스코프: 타 법인 수금 수정 IDOR 방지 — #333)
    const efPay = entityFilter(c)
    const existing = await c.env.DB.prepare(
      `SELECT id, client_id, payment_date, amount, payment_method, reference_number, notes, created_at FROM payments WHERE id = ?${efPay.clause}`
    ).bind(id, ...efPay.params).first<PaymentRow>()

    if (!existing) {
      return c.json({ success: false, error: '입금 내역을 찾을 수 없습니다' }, 404)
    }

    const newAmount = body.amount !== undefined ? body.amount : existing.amount
    if (newAmount <= 0) {
      return c.json({ success: false, error: '입금액은 0보다 커야 합니다' }, 400)
    }

    // Calculate balance adjustment: old payment restored, new payment applied
    const amountDiff = newAmount - existing.amount

    // D1 batch: 결제 수정 + 잔액 조정을 원자적으로 처리
    const batchStmts = [
      c.env.DB.prepare(`
        UPDATE payments SET
          payment_date = ?,
          amount = ?,
          payment_method = ?,
          reference_number = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        body.payment_date || existing.payment_date,
        newAmount,
        body.payment_method !== undefined ? body.payment_method : existing.payment_method,
        body.reference_number !== undefined ? body.reference_number : existing.reference_number,
        body.notes !== undefined ? body.notes : existing.notes,
        id
      )
    ]
    // split billing P3: balance 캐시 미사용 — 입금 수정만 반영(미수금은 파생).
    await c.env.DB.batch(batchStmts)

    return c.json({
      success: true,
      data: { new_balance: await deriveClientBalance(c, existing.client_id) },
      message: '입금 내역이 수정되었습니다'
    })
  } catch (error) {
    console.error('Update payment error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Delete payment (입금 삭제 - ADMIN)
arPaymentsRouter.delete('/payment/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')

    // Get existing payment (entity 스코프: 타 법인 수금 삭제 IDOR 방지 — #333)
    const efPay = entityFilter(c)
    const existing = await c.env.DB.prepare(
      `SELECT id, client_id, payment_date, amount, payment_method, reference_number, notes, created_at FROM payments WHERE id = ?${efPay.clause}`
    ).bind(id, ...efPay.params).first<PaymentRow>()

    if (!existing) {
      return c.json({ success: false, error: '입금 내역을 찾을 수 없습니다' }, 404)
    }

    // split billing P3: balance 캐시 미사용 — 결제 삭제 + 은행거래 매칭 해제만 (미수금은 파생).
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM payments WHERE id = ?').bind(id),
      // #93: 결제 삭제 시 은행거래 매칭 해제
      // #413: bank_transactions에 updated_at 컬럼 없음(0043 스키마) — 제거. 이전엔 prepare 단계 throw로 DELETE batch 전체 실패.
      c.env.DB.prepare(
        `UPDATE bank_transactions SET match_status = 'UNMATCHED', matched_payment_id = NULL, matched_link_mode = NULL WHERE matched_payment_id = ?`
      ).bind(id),
    ])

    return c.json({
      success: true,
      data: { new_balance: await deriveClientBalance(c, existing.client_id) },
      message: '입금 내역이 삭제되었습니다'
    })
  } catch (error) {
    console.error('Delete payment error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get payments list (입금 내역)
arPaymentsRouter.get('/payments', async (c) => {
  try {
    const { clientId, startDate, endDate } = c.req.query()

    // 확장성: clientId 생략 시 전체 무제한 방지 — limit(기본 200, cap 500)+offset. 검증·클램프된 정수만 인터폴레이션.
    const limitRaw = parseInt(c.req.query('limit') || '', 10)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200
    const offsetRaw = parseInt(c.req.query('offset') || '', 10)
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0

    const { clause: listPaymentsEf, params: listPaymentsEfParams } = entityFilter(c, 'p')
    let where = `WHERE 1=1${listPaymentsEf}`
    const params: any[] = [...listPaymentsEfParams]

    if (clientId) {
      where += ' AND p.client_id = ?'
      params.push(clientId)
    }
    if (startDate) {
      where += ' AND date(p.payment_date) >= ?'
      params.push(startDate)
    }
    if (endDate) {
      where += ' AND date(p.payment_date) <= ?'
      params.push(endDate)
    }

    const query = `
      SELECT
        p.*,
        c.client_name,
        u.name as created_by_name
      FROM payments p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      ${where}
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const { results } = params.length > 0
      ? await c.env.DB.prepare(query).bind(...params).all()
      : await c.env.DB.prepare(query).all()

    // 전체 건수(페이지네이션용) — WHERE는 p만 참조하므로 조인 불필요
    const countQuery = `SELECT COUNT(*) as cnt FROM payments p ${where}`
    const countRow = params.length > 0
      ? await c.env.DB.prepare(countQuery).bind(...params).first<{ cnt: number }>()
      : await c.env.DB.prepare(countQuery).first<{ cnt: number }>()
    const total = Number(countRow?.cnt) || 0

    return c.json({
      success: true,
      data: results,
      total,
      limit,
      offset
    })
  } catch (error) {
    console.error('Get payments error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /adjustment - 감액 등록 (MANAGER+)
arPaymentsRouter.post('/adjustment', requireEditOrRole('/ledger', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json()

    if (!body.client_id || !body.type || body.amount === undefined || !body.reason) {
      return c.json({
        success: false,
        error: 'client_id, type, amount, reason 필수'
      }, 400)
    }

    const validTypes = ['DISCOUNT', 'CLAIM', 'RETURN', 'BAD_DEBT', 'OTHER']
    if (!validTypes.includes(body.type)) {
      return c.json({
        success: false,
        error: `type은 ${validTypes.join('|')} 중 하나여야 합니다`
      }, 400)
    }

    const amount = parseFloat(String(body.amount))
    if (amount <= 0) {
      return c.json({ success: false, error: '금액은 0보다 커야 합니다' }, 400)
    }

    const client = await c.env.DB.prepare(
      'SELECT id, balance FROM clients WHERE id = ?'
    ).bind(body.client_id).first<{ id: number; balance: number }>()

    if (!client) {
      return c.json({ success: false, error: 'Client not found' }, 404)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO adjustments (client_id, order_id, type, amount, reason, created_by, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.client_id,
      body.order_id || null,
      body.type,
      amount,
      body.reason,
      user?.id || null,
      getEntityId(c) || 1
    ).run()

    // split billing P3: balance 캐시 미사용 — 감액 INSERT만 (미수금은 파생).
    return c.json({
      success: true,
      data: {
        id: result.meta.last_row_id,
        new_balance: await deriveClientBalance(c, body.client_id)
      }
    })
  } catch (error) {
    console.error('Create adjustment error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /adjustments/:clientId - 감액 이력
arPaymentsRouter.get('/adjustments/:clientId', async (c) => {
  try {
    const clientId = c.req.param('clientId')

    // #415: 감액 이력도 법인 격리(비-super ADMIN/MANAGER는 자기 법인만). payments 라우트와 대칭.
    const efAdjList = entityFilter(c, 'a')
    const { results } = await c.env.DB.prepare(`
      SELECT
        a.*,
        u.name as created_by_name
      FROM adjustments a
      LEFT JOIN users u ON a.created_by = u.id
      WHERE a.client_id = ?${efAdjList.clause}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 500
    `).bind(clientId, ...efAdjList.params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Get adjustments error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// DELETE /adjustment/:id - 감액 삭제 (ADMIN)
arPaymentsRouter.delete('/adjustment/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')

    // #415: 타 법인 감액 삭제 IDOR 방지 — payments DELETE(#333)와 대칭. super-admin(entityId=0)은 clause='' 로 전체 허용.
    // alias 미사용(SQLite DELETE는 테이블 alias 미지원): entity_id 직접 참조.
    const efAdj = entityFilter(c)
    const existing = await c.env.DB.prepare(
      `SELECT id, client_id, order_id, type, amount, reason, created_at FROM adjustments WHERE id = ?${efAdj.clause}`
    ).bind(id, ...efAdj.params).first<AdjustmentRow>()

    if (!existing) {
      return c.json({ success: false, error: '감액 내역을 찾을 수 없습니다' }, 404)
    }

    await c.env.DB.prepare(`DELETE FROM adjustments WHERE id = ?${efAdj.clause}`).bind(id, ...efAdj.params).run()

    // split billing P3: balance 캐시 미사용 — 감액 삭제만 (미수금은 파생).
    return c.json({
      success: true,
      data: { new_balance: await deriveClientBalance(c, existing.client_id) }
    })
  } catch (error) {
    console.error('Delete adjustment error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})


export default arPaymentsRouter
