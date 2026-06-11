/**
 * ledger/ar-receivables.ts — 미수금/정합성 라우트 (accounts-receivable.ts에서 분리, 2026-06-12 대형파일 분할 3/5)
 *
 * 정합성(integrity-check·integrity-fix·recalculate) · 미수금 경고(overdue) ·
 * 미수금 목록/주문/연체체크(receivables·:id/orders·check-overdue) · 평균 회수기간(collection-period).
 * 배럴(accounts-receivable.ts)에서 마운트. ⚠️ 이동만, 로직 수정 0.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { notifyRoles } from '../../utils/notify'
import { entityFilter } from '../../utils/entityFilter'
import {
  deriveClientBalance, buildIntegrityQuery, getAgingCategory,
  type PaymentRow, type IntegrityRow, type OverdueClientRow, type ReceivableClientRow,
  type ReceivableOrderRow, type NotifLinkRow,
} from './ar-helpers'

const arReceivablesRouter = new Hono<HonoEnv>()
arReceivablesRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// =============================================================================
// 잔액 재계산 / 미수금 경고 / 감액 관리
// =============================================================================

// GET /integrity-check - 전체 거래처 잔액 정합성 검사
arReceivablesRouter.get('/integrity-check', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { query: integrityQuery, params: integrityParams } = buildIntegrityQuery(c)
    const { results: rows } = integrityParams.length > 0
      ? await c.env.DB.prepare(integrityQuery).bind(...integrityParams).all<IntegrityRow>()
      : await c.env.DB.prepare(integrityQuery).all<IntegrityRow>()

    interface DiscrepancyRow { client_id: number; client_code: string; client_name: string; cached_balance: number; calculated_balance: number; difference: number }
    const discrepancies: DiscrepancyRow[] = []
    for (const row of rows) {
      const calculated = Number(row.total_billed) - Number(row.total_paid) - Number(row.total_adj)
      const cached = Number(row.balance) || 0
      if (Math.abs(calculated - cached) > 0.01) {
        discrepancies.push({
          client_id: row.id,
          client_code: row.client_code,
          client_name: row.client_name,
          cached_balance: cached,
          calculated_balance: +(calculated.toFixed(2)),
          difference: +(calculated - cached).toFixed(2)
        })
      }
    }

    return c.json({
      success: true,
      data: {
        total_checked: rows.length,
        discrepancy_count: discrepancies.length,
        discrepancies
      }
    })
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /integrity-fix - 불일치 거래처 일괄 재계산
arReceivablesRouter.post('/integrity-fix', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { client_ids } = await c.req.json() as { client_ids?: number[] }

    const { query: integrityQuery, params: integrityParams } = buildIntegrityQuery(c)
    const { results: rows } = integrityParams.length > 0
      ? await c.env.DB.prepare(integrityQuery).bind(...integrityParams).all<IntegrityRow>()
      : await c.env.DB.prepare(integrityQuery).all<IntegrityRow>()

    let fixed = 0
    interface FixResult { client_id: number; client_name: string; old: number; new: number }
    const fixResults: FixResult[] = []

    for (const row of rows) {
      if (client_ids && client_ids.length > 0 && !client_ids.includes(row.id)) continue

      const calculated = Number(row.total_billed) - Number(row.total_paid) - Number(row.total_adj)
      const cached = Number(row.balance) || 0

      if (Math.abs(calculated - cached) > 0.01) {
        await c.env.DB.prepare(
          'UPDATE clients SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(+(calculated.toFixed(2)), row.id).run()
        fixResults.push({ client_id: row.id, client_name: row.client_name, old: cached, new: +(calculated.toFixed(2)) })
        fixed++
      }
    }

    return c.json({
      success: true,
      data: { fixed, results: fixResults },
      message: `${fixed}건 잔액 수정 완료`
    })
  } catch (error) {
    console.error('src/routes/ledger.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /recalculate/:clientId - 잔액 재계산 (MANAGER+)
arReceivablesRouter.post('/recalculate/:clientId', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const clientId = c.req.param('clientId')

    const client = await c.env.DB.prepare(
      'SELECT id, balance FROM clients WHERE id = ?'
    ).bind(clientId).first<{ id: number; balance: number }>()

    if (!client) {
      return c.json({ success: false, error: 'Client not found' }, 404)
    }

    // 실계산: BILLED 청구그룹 합계 (split billing P3: 청구 법인 g 기준)
    const { clause: recalcOrderEf, params: recalcOrderEfParams } = entityFilter(c, 'g')
    const billedRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(CASE WHEN g.billing_status = 'BILLED' THEN g.billed_amount ELSE 0 END), 0) as total_billed
      FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
      WHERE o.client_id = ? AND o.status != 'CANCELLED'${recalcOrderEf}
    `).bind(clientId, ...recalcOrderEfParams).first<{ total_billed: number }>()

    // 입금 합계
    const { clause: recalcPaymentEf, params: recalcPaymentEfParams } = entityFilter(c)
    const paymentRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_payments FROM payments WHERE client_id = ?${recalcPaymentEf}
    `).bind(clientId, ...recalcPaymentEfParams).first<{ total_payments: number }>()

    // 감액 합계
    const { clause: recalcAdjEf, params: recalcAdjEfParams } = entityFilter(c)
    const adjRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_adjustments FROM adjustments WHERE client_id = ?${recalcAdjEf}
    `).bind(clientId, ...recalcAdjEfParams).first<{ total_adjustments: number }>()

    const newBalance = Number(billedRow!.total_billed) - Number(paymentRow!.total_payments) - Number(adjRow!.total_adjustments)
    const oldBalance = Number(client.balance) || 0

    await c.env.DB.prepare(
      'UPDATE clients SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(newBalance, clientId).run()

    return c.json({
      success: true,
      data: {
        old_balance: oldBalance,
        new_balance: newBalance,
        difference: newBalance - oldBalance
      }
    })
  } catch (error) {
    console.error('Recalculate balance error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /overdue - 미수금 경고 목록
arReceivablesRouter.get('/overdue', async (c) => {
  try {
    // split billing P3: 미수금 경고도 청구그룹(청구 법인 g) 기준
    const { clause: overdueEf, params: overdueEfParams } = entityFilter(c, 'g')
    const { results } = await c.env.DB.prepare(`
      SELECT
        c.id as client_id,
        c.client_name,
        c.overdue_alert_days,
        COUNT(DISTINCT o.id) as overdue_count,
        COALESCE(SUM(g.billed_amount), 0) as overdue_amount,
        MIN(g.billed_at) as oldest_billed_at
      FROM order_billing_groups g
      JOIN orders o ON o.id = g.order_id
      JOIN clients c ON o.client_id = c.id
      WHERE g.billing_status = 'BILLED'
        AND o.status != 'CANCELLED'
        AND date(g.billed_at, '+' || COALESCE(c.overdue_alert_days, 30) || ' days') < date('now', '+9 hours')
        ${overdueEf}
      GROUP BY c.id, c.client_name, c.overdue_alert_days
      ORDER BY overdue_amount DESC
    `).bind(...overdueEfParams).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Get overdue error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// =============================================================================
// 미수금 Aging 상세 분석
// =============================================================================

// GET /receivables - 미수금 거래처 전체 목록
arReceivablesRouter.get('/receivables', async (c) => {
  try {
    const { sort = 'balance_desc', min_balance = '0', overdue_only = '' } = c.req.query()
    const minBalance = parseFloat(min_balance)

    // split billing P3: clients.balance 캐시 폐기 → (거래처 미수금) 파생. billed=order_billing_groups[BILLED](청구법인 g), 미수=billed−payments−adjustments.
    const { clause: balGEf, params: balGP } = entityFilter(c, 'g')
    const { clause: balPEf, params: balPP } = entityFilter(c, 'p')
    const { clause: balAEf, params: balAP } = entityFilter(c, 'a')
    const { clause: recvPayEf, params: recvPayEfParams } = entityFilter(c, 'p')
    const { clause: cntGEf, params: cntGP } = entityFilter(c, 'g')
    const { clause: oldGEf, params: oldGP } = entityFilter(c, 'g')
    const { clause: recvPayEf2, params: recvPayEf2Params } = entityFilter(c, 'p')
    const { results: clients } = await c.env.DB.prepare(`
      SELECT * FROM (
        SELECT
          c.id,
          c.client_code,
          c.client_name,
          (
            (SELECT COALESCE(SUM(g.billed_amount), 0) FROM order_billing_groups g JOIN orders o ON o.id = g.order_id WHERE o.client_id = c.id AND g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${balGEf})
            - (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.client_id = c.id${balPEf})
            - (SELECT COALESCE(SUM(a.amount), 0) FROM adjustments a WHERE a.client_id = c.id${balAEf})
          ) as balance,
          (SELECT MAX(p.payment_date) FROM payments p WHERE p.client_id = c.id${recvPayEf}) as last_payment_date,
          (SELECT COUNT(*) FROM order_billing_groups g JOIN orders o ON o.id = g.order_id WHERE o.client_id = c.id AND g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${cntGEf}) as billed_order_count,
          (SELECT MIN(g.billed_at) FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
           WHERE o.client_id = c.id AND g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${oldGEf}
             AND NOT EXISTS (
               SELECT 1 FROM payments p
               WHERE p.client_id = c.id${recvPayEf2}
                 AND p.amount >= g.billed_amount
                 AND p.payment_date >= g.billed_at
             )
          ) as oldest_unpaid_date
        FROM clients c
        WHERE c.is_active = 1
      ) WHERE balance > ?
    `).bind(...balGP, ...balPP, ...balAP, ...recvPayEfParams, ...cntGP, ...oldGP, ...recvPayEf2Params, minBalance).all<ReceivableClientRow>()

    // aging_days, aging_category 계산 (JS에서)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let rows = clients.map(client => {
      let agingDays: number | null = null
      if (client.oldest_unpaid_date) {
        const oldest = new Date(client.oldest_unpaid_date)
        oldest.setHours(0, 0, 0, 0)
        agingDays = Math.floor((today.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24))
      }
      return {
        ...client,
        balance: Number(client.balance) || 0,
        aging_days: agingDays,
        aging_category: getAgingCategory(agingDays)
      }
    })

    // overdue_only 필터 (30일 초과)
    if (overdue_only === '1') {
      rows = rows.filter(r => r.aging_days !== null && r.aging_days > 30)
    }

    // 정렬
    if (sort === 'balance_asc') {
      rows.sort((a, b) => a.balance - b.balance)
    } else if (sort === 'oldest_first') {
      rows.sort((a, b) => {
        if (a.oldest_unpaid_date === null) return 1
        if (b.oldest_unpaid_date === null) return -1
        return a.oldest_unpaid_date.localeCompare(b.oldest_unpaid_date)
      })
    } else {
      // balance_desc (기본)
      rows.sort((a, b) => b.balance - a.balance)
    }

    return c.json({ success: true, data: rows })
  } catch (error) {
    console.error('Get receivables error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /receivables/:clientId/orders - 특정 거래처의 미입금 주문 목록
arReceivablesRouter.get('/receivables/:clientId/orders', async (c) => {
  try {
    const clientId = c.req.param('clientId')

    // 거래처 존재 확인
    const client = await c.env.DB.prepare(
      'SELECT id, client_name, balance FROM clients WHERE id = ? AND is_active = 1'
    ).bind(clientId).first<{ id: number; client_name: string; balance: number }>()

    if (!client) {
      return c.json({ success: false, error: 'Client not found' }, 404)
    }

    // 미입금 주문 (billing_status = BILLED)
    const { clause: recvOrdDetailEf, params: recvOrdDetailEfParams } = entityFilter(c, 'o')
    const { results: orders } = await c.env.DB.prepare(`
      SELECT
        o.id,
        o.order_number,
        o.order_date,
        o.delivery_date,
        o.final_amount,
        o.billed_amount,
        o.billing_status,
        o.billed_at,
        CAST(julianday('now') - julianday(o.billed_at) AS INTEGER) as days_since_billed
      FROM orders o
      WHERE o.client_id = ? AND o.billing_status = 'BILLED'${recvOrdDetailEf}
      ORDER BY o.billed_at ASC
    `).bind(clientId, ...recvOrdDetailEfParams).all<ReceivableOrderRow>()

    // 입금 내역
    const { clause: recvPayDetailEf, params: recvPayDetailEfParams } = entityFilter(c)
    const { results: payments } = await c.env.DB.prepare(`
      SELECT
        id,
        payment_date,
        amount,
        payment_method,
        notes
      FROM payments
      WHERE client_id = ?${recvPayDetailEf}
      ORDER BY payment_date DESC
      LIMIT 50
    `).bind(clientId, ...recvPayDetailEfParams).all<PaymentRow>()

    // 미입금 잔액 계산
    const totalBilled = orders.reduce((sum, o) => sum + (Number(o.billed_amount) || 0), 0)
    const totalPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const unpaidBalance = totalBilled - totalPayments

    return c.json({
      success: true,
      data: {
        client: {
          id: client.id,
          client_name: client.client_name,
          balance: await deriveClientBalance(c, clientId)  // split billing P3: 캐시 폐기 → 파생
        },
        orders: orders.map(o => ({
          ...o,
          final_amount: Number(o.final_amount) || 0,
          billed_amount: Number(o.billed_amount) || 0
        })),
        payments: payments.map(p => ({
          ...p,
          amount: Number(p.amount) || 0
        })),
        summary: {
          total_billed: totalBilled,
          total_payments: totalPayments,
          unpaid_balance: unpaidBalance
        }
      }
    })
  } catch (error) {
    console.error('Get receivables orders error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /receivables/check-overdue - 연체 자동 알림 생성 (ADMIN/MANAGER)
arReceivablesRouter.post('/receivables/check-overdue', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    // 30일 초과 연체 거래처 조회
    // split billing P3: clients.balance 캐시 폐기 → 청구그룹 파생(청구 법인 g 기준)
    const { clause: coPayEf, params: coPayP } = entityFilter(c, 'p')
    const { clause: coAdjEf, params: coAdjP } = entityFilter(c, 'a')
    const { clause: checkOverdueEf, params: checkOverdueEfParams } = entityFilter(c, 'g')
    const { results: overdueClients } = await c.env.DB.prepare(`
      SELECT
        c.id,
        c.client_name,
        (
          COALESCE(SUM(g.billed_amount), 0)
          - (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.client_id = c.id${coPayEf})
          - (SELECT COALESCE(SUM(amount), 0) FROM adjustments a WHERE a.client_id = c.id${coAdjEf})
        ) as balance,
        MIN(g.billed_at) as oldest_billed_at,
        CAST(julianday('now') - julianday(MIN(g.billed_at)) AS INTEGER) as overdue_days
      FROM clients c
      JOIN orders o ON o.client_id = c.id
      JOIN order_billing_groups g ON g.order_id = o.id
      WHERE c.is_active = 1
        AND o.status != 'CANCELLED'
        AND g.billing_status = 'BILLED'${checkOverdueEf}
      GROUP BY c.id, c.client_name
      HAVING balance > 0 AND overdue_days > 30
      ORDER BY overdue_days DESC
    `).bind(...coPayP, ...coAdjP, ...checkOverdueEfParams).all<OverdueClientRow>()

    let alertsCreated = 0
    const checked = overdueClients.length

    // 24시간 내 이미 발송된 연체 알림 link를 한 번에 로드 (N+1 방지)
    const { results: recentNotifs } = await c.env.DB.prepare(`
      SELECT DISTINCT link FROM notifications
      WHERE title LIKE '연체 경고:%'
        AND created_at > datetime('now', '-24 hours')
    `).all<NotifLinkRow>()
    const recentLinks = new Set((recentNotifs || []).map(n => n.link))

    for (const client of overdueClients) {
      const link = `/ledger?client=${client.id}`
      if (recentLinks.has(link)) continue

      const balanceFormatted = Number(client.balance).toLocaleString()
      const days = client.overdue_days

      await notifyRoles(
        c.env.DB,
        ['ADMIN', 'MANAGER'],
        `연체 경고: ${client.client_name}`,
        `미수금 ${balanceFormatted}원, 최장 연체 ${days}일`,
        link
      )

      alertsCreated++
    }

    return c.json({
      success: true,
      data: {
        checked,
        alerts_created: alertsCreated
      }
    })
  } catch (error) {
    console.error('Check overdue error:', error)
    console.error('src/routes/ledger.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /collection-period - 거래처별 평균 회수 기간
arReceivablesRouter.get('/collection-period', async (c) => {
  try {
    const ef = entityFilter(c, 'o')
    // split billing P3: 미수 잔액은 청구그룹(청구 법인) 파생
    const cpGEf = entityFilter(c, 'g')
    const cpPEf = entityFilter(c, 'p2')
    const cpAEf = entityFilter(c, 'a2')

    // 거래처별: 주문 생성일 ~ 마지막 입금일 평균 차이 계산
    // 완납된 주문(balance = 0, 입금 있음) 기준
    const { results } = await c.env.DB.prepare(`
      SELECT
        c.id as client_id,
        c.client_name,
        (
          (SELECT COALESCE(SUM(g.billed_amount), 0) FROM order_billing_groups g JOIN orders o2 ON o2.id = g.order_id WHERE o2.client_id = c.id AND g.billing_status = 'BILLED' AND o2.status != 'CANCELLED'${cpGEf.clause})
          - (SELECT COALESCE(SUM(amount), 0) FROM payments p2 WHERE p2.client_id = c.id${cpPEf.clause})
          - (SELECT COALESCE(SUM(amount), 0) FROM adjustments a2 WHERE a2.client_id = c.id${cpAEf.clause})
        ) as balance,
        COUNT(DISTINCT sub.order_id) as settled_orders,
        ROUND(AVG(sub.days_to_pay), 0) as avg_days,
        MIN(sub.days_to_pay) as min_days,
        MAX(sub.days_to_pay) as max_days,
        MAX(sub.last_payment_date) as last_payment_date
      FROM clients c
      INNER JOIN (
        SELECT
          o.client_id,
          o.id as order_id,
          julianday(p.payment_date) - julianday(date(o.created_at)) as days_to_pay,
          p.payment_date as last_payment_date
        FROM orders o
        INNER JOIN payments p ON p.client_id = o.client_id
          AND p.payment_date >= date(o.created_at)
        WHERE o.status != 'CANCELLED'
          AND o.billing_status = 'BILLED'${ef.clause}
        GROUP BY o.id
        HAVING days_to_pay >= 0
      ) sub ON sub.client_id = c.id
      WHERE c.is_active = 1
      GROUP BY c.id
      HAVING settled_orders >= 2
      ORDER BY avg_days DESC
    `).bind(...cpGEf.params, ...cpPEf.params, ...cpAEf.params, ...ef.params).all<{
      client_id: number; client_name: string; balance: number
      settled_orders: number; avg_days: number; min_days: number; max_days: number
      last_payment_date: string | null
    }>()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Collection period error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})


export default arReceivablesRouter
